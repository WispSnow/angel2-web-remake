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

const contentTypeFor = (url: string): string => {
  if (url.endsWith(".png")) return "image/png";
  if (url.endsWith(".json")) return "application/json";
  throw new Error(`unsupported staged render asset ${url}`);
};

export function isStagedRenderAssetUrl(url: string): boolean {
  return url.startsWith("/assets/original/")
    && (url.endsWith(".png") || url.endsWith(".json"));
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
    released: false,
  };
  const previous = activeAssets;
  activeAssets = next;
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
  await Promise.all(urls.filter((url) => url.endsWith(".png")).map((url) => {
    const pending = loadStagedRenderImage(url);
    if (!pending) throw new Error(`staged render image is not active: ${url}`);
    return pending;
  }));
}
