interface StagedRenderAssetEntry {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  source?: string;
  imagePromise?: Promise<HTMLImageElement>;
}

export interface StagedRenderAssetLease {
  readonly urls: readonly string[];
  release(): void;
}

export interface StagedRenderAssetOptions {
  readonly ownerDocument?: Document;
  readonly decodeImage?: (source: string, originalUrl: string) => Promise<HTMLImageElement>;
}

interface ActiveStagedRenderAssets {
  readonly entries: ReadonlyMap<string, StagedRenderAssetEntry>;
  readonly urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  readonly blobConstructor: typeof Blob;
  readonly decodeImage: (source: string, originalUrl: string) => Promise<HTMLImageElement>;
  released: boolean;
}

let activeAssets: ActiveStagedRenderAssets | undefined;
const MAX_PARALLEL_IMAGE_DECODES = 6;
const changeSubscribers = new Set<() => void>();

/**
 * Notifies surfaces that copied object URLs into CSS that those copies are now
 * stale.
 *
 * A custom property can only hold the object URL that was current when it was
 * written, and nothing in CSS can call back into this module. Once the next pack
 * takes over, every such copy names a URL this module is about to revoke, and
 * the first repaint that needs one — a menu opening, a cursor becoming active —
 * fetches a dead `blob:` and logs `net::ERR_FILE_NOT_FOUND`. Subscribers run
 * while the new lease is already current but the outgoing one is not yet
 * revoked, so a rewritten property never names a URL that has already died.
 */
export function onStagedRenderAssetsChanged(subscriber: () => void): () => void {
  changeSubscribers.add(subscriber);
  return () => {
    changeSubscribers.delete(subscriber);
  };
}

const contentTypeFor = (url: string): string => {
  if (url.endsWith(".png")) return "image/png";
  if (url.endsWith(".json")) return "application/json";
  if (url.endsWith(".svg")) return "image/svg+xml";
  throw new Error(`unsupported staged render asset ${url}`);
};

/**
 * `.svg` is here for the same reason as `.png`: 第 20 關的劇情背景是向量圖，`<img>` 會照樣
 * 去要原始 URL，而 Cache Storage 不攔截 `<img>`。少了這一行，那 180 KB 會被資源門抓一次、
 * DOM 再抓一次，而且第二次落在載入頁收起之後。
 */
export function isStagedRenderAssetUrl(url: string): boolean {
  return url.startsWith("/assets/original/")
    && (url.endsWith(".png") || url.endsWith(".json") || url.endsWith(".svg"));
}

function releaseAssets(assets: ActiveStagedRenderAssets): void {
  if (assets.released) return;
  assets.released = true;
  for (const entry of assets.entries.values()) {
    if (entry.source) assets.urlApi.revokeObjectURL(entry.source);
  }
}

/**
 * Makes one already-downloaded resource-pack surface authoritative for render
 * loaders. Object URLs are created lazily, so encoded prefetch bytes stay cheap
 * until Phaser or a DOM surface actually consumes an asset.
 */
export function activateStagedRenderAssets(
  encodedBytes: ReadonlyMap<string, Uint8Array>,
  options: StagedRenderAssetOptions = {},
): StagedRenderAssetLease {
  const ownerWindow = options.ownerDocument?.defaultView;
  const urlApi = ownerWindow?.URL ?? globalThis.URL;
  const blobConstructor = ownerWindow?.Blob ?? globalThis.Blob;
  const decodeImage = options.decodeImage ?? (async (source: string, originalUrl: string) => {
    const ownerDocument = options.ownerDocument
      ?? (typeof document === "undefined" ? undefined : document);
    if (!ownerDocument) throw new Error(`cannot decode staged render asset ${source}`);
    const createImage = () => {
      const image = ownerDocument.createElement("img");
      image.decoding = "sync";
      image.dataset.stagedAssetUrl = originalUrl;
      image.src = source;
      return image;
    };
    let image = createImage();
    try {
      await image.decode();
    } catch (firstError) {
      // Chromium can reject a detached image's first decode while an old route
      // is releasing many blob URLs. A fresh decoder for the same retained
      // source distinguishes that transition race from genuinely invalid PNG.
      image = createImage();
      try {
        await image.decode();
      } catch (secondError) {
        const reason = secondError instanceof Error ? secondError.message : String(secondError);
        throw new Error(`staged render asset failed to decode: ${originalUrl}: ${reason}`, {
          cause: firstError,
        });
      }
    }
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error(`staged render asset decoded empty: ${source}`);
    }
    return image;
  });
  const entries = new Map<string, StagedRenderAssetEntry>();
  for (const [url, bytes] of encodedBytes) {
    if (!isStagedRenderAssetUrl(url)) continue;
    entries.set(url, { bytes, contentType: contentTypeFor(url) });
  }
  const next: ActiveStagedRenderAssets = {
    entries,
    urlApi,
    blobConstructor,
    decodeImage,
    released: false,
  };
  const previous = activeAssets;
  activeAssets = next;
  // Order matters: the surfaces have to re-resolve against `next` before
  // `previous` revokes the URLs they are still holding.
  for (const subscriber of changeSubscribers) subscriber();
  if (previous) releaseAssets(previous);

  let released = false;
  return {
    urls: [...entries.keys()].sort(),
    release: () => {
      if (released) return;
      released = true;
      if (activeAssets === next) activeAssets = undefined;
      releaseAssets(next);
    },
  };
}

export function stagedRenderAssetSource(url: string): string {
  const assets = activeAssets;
  if (!assets || assets.released) return url;
  const entry = assets.entries.get(url);
  if (!entry) return url;
  if (!entry.source) {
    const bytes = new ArrayBuffer(entry.bytes.byteLength);
    new Uint8Array(bytes).set(entry.bytes);
    entry.source = assets.urlApi.createObjectURL(new assets.blobConstructor(
      [bytes],
      { type: entry.contentType },
    ));
  }
  return entry.source;
}

/** Returns the decoded image owned by the current surface, when it staged `url`. */
export function loadStagedRenderImage(url: string): Promise<HTMLImageElement> | undefined {
  const assets = activeAssets;
  if (!assets || assets.released || !url.endsWith(".png")) return undefined;
  const entry = assets.entries.get(url);
  if (!entry) return undefined;
  if (!entry.imagePromise) {
    const pending = assets.decodeImage(stagedRenderAssetSource(url), url);
    entry.imagePromise = pending;
    void pending.catch(() => {
      if (entry.imagePromise === pending) entry.imagePromise = undefined;
    });
  }
  return entry.imagePromise;
}

/**
 * Establishes the decode barrier for a visible surface without decoding JSON
 * or unrelated prefetched packs. Failures propagate to the resource retry UI.
 */
export async function decodeStagedRenderImages(urls: readonly string[]): Promise<void> {
  const imageUrls = [...new Set(urls.filter((url) => url.endsWith(".png")))];
  let cursor = 0;
  const worker = async () => {
    while (cursor < imageUrls.length) {
      const url = imageUrls[cursor];
      cursor += 1;
      const pending = loadStagedRenderImage(url);
      if (!pending) throw new Error(`staged render image is not active: ${url}`);
      await pending;
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(MAX_PARALLEL_IMAGE_DECODES, imageUrls.length) },
    () => worker(),
  ));
}
