import {
  decodesOutsideCompositor,
  imageBitmapDecoder,
  retryRefusedImageDecode,
} from "./image-decode-retry";

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
  const blob = new blobConstructor([blobBytes], { type: "image/png" });
  const objectUrl = canUseObjectUrl ? urlApi.createObjectURL(blob) : undefined;
  const source = objectUrl ?? url;
  const decodeDetachedImage = async (): Promise<HTMLImageElement> => {
    const image = ownerDocument.createElement("img");
    image.decoding = "sync";
    if (typeof image.decode === "function") {
      image.src = source;
      await image.decode();
      return image;
    }
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error(`圖片解碼失敗：${url}`)), {
        once: true,
      });
      image.src = source;
    });
    return image;
  };
  let image: HTMLImageElement;
  try {
    // The stage resource gate awaits this, so a compositor refusal must not
    // surface as 「資源讀取失敗」. Every attempt is a fresh detached element on
    // the bytes and object URL owned here: no refetch, and a PNG that
    // `createImageBitmap` rejects too still fails at once.
    image = await retryRefusedImageDecode({
      attempt: decodeDetachedImage,
      decodesElsewhere: () => decodesOutsideCompositor(
        imageBitmapDecoder(ownerWindow ?? globalThis),
        () => blob,
      ),
      failure: ({ outcome, reason, attempts, cause }) => {
        const detail = outcome === "exhausted" ? `嘗試 ${attempts} 次：${reason}` : reason;
        return new Error(`圖片解碼失敗：${url}${detail ? `（${detail}）` : ""}`, { cause });
      },
    });
  } catch (error) {
    if (objectUrl) urlApi.revokeObjectURL(objectUrl);
    throw error;
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
