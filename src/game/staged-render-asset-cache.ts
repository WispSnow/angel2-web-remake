interface StagedRenderAssetEntry {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  source?: string;
}

export interface StagedRenderAssetLease {
  readonly urls: readonly string[];
  release(): void;
}

export interface StagedRenderAssetOptions {
  readonly ownerDocument?: Document;
}

interface ActiveStagedRenderAssets {
  readonly entries: ReadonlyMap<string, StagedRenderAssetEntry>;
  readonly urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  readonly blobConstructor: typeof Blob;
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
  const entries = new Map<string, StagedRenderAssetEntry>();
  for (const [url, bytes] of encodedBytes) {
    if (!isStagedRenderAssetUrl(url)) continue;
    entries.set(url, { bytes, contentType: contentTypeFor(url) });
  }
  const next: ActiveStagedRenderAssets = {
    entries,
    urlApi,
    blobConstructor,
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
