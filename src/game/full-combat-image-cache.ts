type FetchImage = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface DecodedFullCombatImage {
  readonly source: string;
  readonly image: HTMLImageElement;
  readonly objectUrl?: string;
  readonly revokeObjectUrl?: () => void;
  references: number;
}

export interface FullCombatImageLease {
  readonly urls: readonly string[];
  release(): void;
}

export interface FullCombatImageAcquireOptions {
  readonly encodedBytes?: ReadonlyMap<string, Uint8Array>;
  readonly fetchImage?: FetchImage;
  readonly ownerDocument?: Document;
}

const FULL_COMBAT_ATLAS_IMAGE_PREFIX = "/assets/original/full-combat-atlases/";
const FULL_COMBAT_BACKGROUND_IMAGE_PREFIX = "/assets/original/full-combat/backgrounds/";
const decodedImages = new Map<string, DecodedFullCombatImage>();
const pendingImages = new Map<string, Promise<DecodedFullCombatImage>>();

export function isFullCombatImageUrl(url: string): boolean {
  return (url.startsWith(FULL_COMBAT_ATLAS_IMAGE_PREFIX)
    || url.startsWith(FULL_COMBAT_BACKGROUND_IMAGE_PREFIX))
    && url.endsWith(".png");
}

export function fullCombatImageSource(url: string): string {
  return decodedImages.get(url)?.source ?? url;
}

async function encodedImageBytes(
  url: string,
  options: FullCombatImageAcquireOptions,
): Promise<Uint8Array> {
  const staged = options.encodedBytes?.get(url);
  if (staged) return staged;
  const fetchImage = options.fetchImage ?? globalThis.fetch.bind(globalThis);
  const response = await fetchImage(url);
  if (!response.ok) throw new Error(`讀取失敗（${response.status}）：${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function decodeImage(
  url: string,
  options: FullCombatImageAcquireOptions,
): Promise<DecodedFullCombatImage> {
  const ownerDocument = options.ownerDocument ?? document;
  const bytes = await encodedImageBytes(url, options);
  const ownerWindow = ownerDocument.defaultView;
  const urlApi = ownerWindow?.URL ?? globalThis.URL;
  const blobConstructor = ownerWindow?.Blob ?? globalThis.Blob;
  const canUseObjectUrl = typeof urlApi.createObjectURL === "function";
  const blobBytes = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(blobBytes).set(bytes);
  const objectUrl = canUseObjectUrl
    ? urlApi.createObjectURL(new blobConstructor([blobBytes], { type: "image/png" }))
    : undefined;
  const source = objectUrl ?? url;
  const createImage = () => {
    const image = ownerDocument.createElement("img");
    image.decoding = "sync";
    return image;
  };
  const decode = async (image: HTMLImageElement): Promise<void> => {
    if (typeof image.decode === "function") {
      image.src = source;
      await image.decode();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error(`圖片解碼失敗：${url}`)), {
        once: true,
      });
      image.src = source;
    });
  };
  let image = createImage();
  try {
    try {
      await decode(image);
    } catch (firstError) {
      // Chromium can reject one detached decoder while another route is
      // releasing many blob-backed atlases. The bytes and object URL remain
      // owned here, so a fresh element distinguishes that transient race from
      // a genuinely invalid PNG without refetching or hiding persistent damage.
      image = createImage();
      try {
        await decode(image);
      } catch (secondError) {
        throw new Error(
          secondError instanceof Error ? secondError.message : String(secondError),
          { cause: firstError },
        );
      }
    }
  } catch (error) {
    if (objectUrl) urlApi.revokeObjectURL(objectUrl);
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`圖片解碼失敗：${url}${detail ? `（${detail}）` : ""}`, { cause: error });
  }
  return {
    source,
    image,
    objectUrl,
    revokeObjectUrl: objectUrl ? () => urlApi.revokeObjectURL(objectUrl) : undefined,
    references: 0,
  };
}

function imageEntry(
  url: string,
  options: FullCombatImageAcquireOptions,
): Promise<DecodedFullCombatImage> {
  const existing = decodedImages.get(url);
  if (existing) return Promise.resolve(existing);
  const pending = pendingImages.get(url);
  if (pending) return pending;
  const created = decodeImage(url, options).then((entry) => {
    decodedImages.set(url, entry);
    pendingImages.delete(url);
    return entry;
  }).catch((error: unknown) => {
    pendingImages.delete(url);
    throw error;
  });
  pendingImages.set(url, created);
  return created;
}

export async function acquireFullCombatImages(
  urls: readonly string[],
  options: FullCombatImageAcquireOptions = {},
): Promise<FullCombatImageLease> {
  const imageUrls = [...new Set(urls.filter(isFullCombatImageUrl))].sort();
  const results = await Promise.allSettled(imageUrls.map((url) =>
    imageEntry(url, options).then((entry) => {
      entry.references += 1;
      return entry;
    })));
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") {
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result.status !== "fulfilled") continue;
      result.value.references -= 1;
      if (result.value.references > 0) continue;
      const url = imageUrls[index];
      if (decodedImages.get(url) !== result.value) continue;
      decodedImages.delete(url);
      result.value.revokeObjectUrl?.();
    }
    throw failed.reason;
  }
  const entries = results.map((result) => {
    if (result.status !== "fulfilled") throw result.reason;
    return result.value;
  });
  let released = false;
  return {
    urls: imageUrls,
    release: () => {
      if (released) return;
      released = true;
      for (let index = 0; index < imageUrls.length; index += 1) {
        const url = imageUrls[index];
        const entry = entries[index];
        entry.references -= 1;
        if (entry.references > 0 || decodedImages.get(url) !== entry) continue;
        decodedImages.delete(url);
        entry.revokeObjectUrl?.();
      }
    },
  };
}
