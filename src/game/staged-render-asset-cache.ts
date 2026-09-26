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
  /** Makes one attempt; `loadStagedRenderImage` owns retrying a refused decode. */
  readonly decodeImage?: (source: string, originalUrl: string) => Promise<HTMLImageElement>;
}

interface ActiveStagedRenderAssets {
  readonly entries: ReadonlyMap<string, StagedRenderAssetEntry>;
  readonly urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  readonly blobConstructor: typeof Blob;
  readonly decodeImage: (source: string, originalUrl: string) => Promise<HTMLImageElement>;
  readonly createImageBitmap?: (image: Blob) => Promise<ImageBitmap>;
  released: boolean;
}

let activeAssets: ActiveStagedRenderAssets | undefined;
const MAX_PARALLEL_IMAGE_DECODES = 6;
/**
 * Waits before each further attempt at a refused image decode.
 *
 * Chromium 149 rejects `decode()` with the same "The source image cannot be
 * decoded." for a valid, fully loaded image as for a broken one: when cc's
 * decode cache cannot budget the image — `GpuImageDecodeCache` caps its working
 * set at 256 images and a byte budget — `ImageController::CompleteTaskForRequest`
 * reports the unbudgeted request as a failure. Every successful decode keeps
 * its image in that working set for three commits, or for 4 s when the page
 * commits nothing (`DecodedImageTracker::kTimeoutDurationMs`), so under load a
 * refusal can outlast an immediate retry by seconds. The schedule outlasts that
 * 4 s fallback.
 */
const DECODE_RETRY_DELAYS_MS = [50, 150, 400, 1_000, 3_000] as const;
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
  const bitmapScope = ownerWindow ?? globalThis;
  const decodeImage = options.decodeImage ?? (async (source: string, originalUrl: string) => {
    const ownerDocument = options.ownerDocument
      ?? (typeof document === "undefined" ? undefined : document);
    if (!ownerDocument) throw new Error(`cannot decode staged render asset ${source}`);
    const image = ownerDocument.createElement("img");
    image.decoding = "sync";
    image.dataset.stagedAssetUrl = originalUrl;
    image.src = source;
    await image.decode();
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
    createImageBitmap: typeof bitmapScope.createImageBitmap === "function"
      ? (image) => bitmapScope.createImageBitmap(image)
      : undefined,
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

function encodedBlob(assets: ActiveStagedRenderAssets, entry: StagedRenderAssetEntry): Blob {
  const bytes = new ArrayBuffer(entry.bytes.byteLength);
  new Uint8Array(bytes).set(entry.bytes);
  return new assets.blobConstructor([bytes], { type: entry.contentType });
}

function entrySource(assets: ActiveStagedRenderAssets, entry: StagedRenderAssetEntry): string {
  entry.source ??= assets.urlApi.createObjectURL(encodedBlob(assets, entry));
  return entry.source;
}

export function stagedRenderAssetSource(url: string): string {
  const assets = activeAssets;
  if (!assets || assets.released) return url;
  const entry = assets.entries.get(url);
  return entry ? entrySource(assets, entry) : url;
}

/**
 * Decodes the retained bytes outside `<img>` and the compositor, which tells a
 * refused valid image apart from a genuinely broken one. `undefined` means this
 * browser offers no second decoder to ask.
 */
async function encodedImageDecodes(
  assets: ActiveStagedRenderAssets,
  entry: StagedRenderAssetEntry,
): Promise<boolean | undefined> {
  if (!assets.createImageBitmap) return undefined;
  try {
    const bitmap = await assets.createImageBitmap(encodedBlob(assets, entry));
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

async function decodeStagedImage(
  assets: ActiveStagedRenderAssets,
  entry: StagedRenderAssetEntry,
  url: string,
): Promise<HTMLImageElement> {
  let bytesDecode: boolean | undefined;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await assets.decodeImage(entrySource(assets, entry), url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // A broken PNG fails both decoders and goes straight to the retry UI;
      // only bytes that decode elsewhere wait out the compositor's budget.
      if (attempt === 0) bytesDecode = await encodedImageDecodes(assets, entry);
      if (bytesDecode === false) {
        throw new Error(`staged render asset failed to decode: ${url}: ${reason}`, {
          cause: error,
        });
      }
      if (attempt >= DECODE_RETRY_DELAYS_MS.length) {
        throw new Error(
          `staged render asset failed to decode after ${attempt + 1} attempts: ${url}: ${reason}`,
          { cause: error },
        );
      }
      await new Promise((resolve) => {
        globalThis.setTimeout(resolve, DECODE_RETRY_DELAYS_MS[attempt]);
      });
      // Releasing the lease revoked the object URL, so another attempt could
      // only fail on the dead `blob:`.
      if (assets.released) {
        throw new Error(`staged render asset lease ended before ${url} decoded`, {
          cause: error,
        });
      }
    }
  }
}

/** Returns the decoded image owned by the current surface, when it staged `url`. */
export function loadStagedRenderImage(url: string): Promise<HTMLImageElement> | undefined {
  const assets = activeAssets;
  if (!assets || assets.released || !url.endsWith(".png")) return undefined;
  const entry = assets.entries.get(url);
  if (!entry) return undefined;
  if (!entry.imagePromise) {
    const pending = decodeStagedImage(assets, entry, url);
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
