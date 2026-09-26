import {
  decodesOutsideCompositor,
  imageBitmapDecoder,
  retryRefusedImageDecode,
} from "./image-decode-retry";

export interface DomImageReadinessOptions {
  /** `true` once the segment that owns these images has been replaced. */
  readonly abandoned?: () => boolean;
}

/**
 * Waits out a refused decode on the same element: the caller's markup already
 * holds it, and a refusal leaves nothing on it, so there is no fresh element to
 * build. `createImageBitmap` on the element re-decodes its own loaded bytes to
 * tell a refusal from a broken image.
 */
function decodeDomImage(
  image: HTMLImageElement,
  options: DomImageReadinessOptions,
): Promise<void> {
  return retryRefusedImageDecode({
    attempt: () => image.decode(),
    // A rejection can also mean the source changed mid-decode; an image still
    // loading its new source has nothing for a second decoder to judge yet.
    decodesElsewhere: async () => image.complete
      ? decodesOutsideCompositor(
        imageBitmapDecoder(image.ownerDocument?.defaultView ?? globalThis),
        () => image,
      )
      : undefined,
    abandoned: options.abandoned,
    failure: ({ outcome, reason, attempts, cause }) => new Error(
      outcome === "abandoned"
        ? `DOM image segment ended before ${image.src} decoded`
        : outcome === "exhausted"
          ? `DOM image failed to decode after ${attempts} attempts: ${image.src}: ${reason}`
          : `DOM image failed to decode: ${image.src}: ${reason}`,
      { cause },
    ),
  });
}

/** Establishes a clock barrier on the images used by one visible DOM segment. */
export async function prepareDomImageElements(
  images: Iterable<HTMLImageElement>,
  options: DomImageReadinessOptions = {},
): Promise<void> {
  const pendingImages = [...images];
  let cursor = 0;
  const worker = async () => {
    while (cursor < pendingImages.length) {
      const image = pendingImages[cursor];
      cursor += 1;
      await decodeDomImage(image, options);
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        throw new Error(`DOM image decoded empty: ${image.src}`);
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(6, pendingImages.length) },
    () => worker(),
  ));
}
