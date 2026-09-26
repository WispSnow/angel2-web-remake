/**
 * Retry policy shared by every image decode barrier.
 *
 * Chromium 149 rejects `decode()` with the same "The source image cannot be
 * decoded." for a valid, fully loaded image as for a broken one: when cc's
 * decode cache cannot budget the image — `GpuImageDecodeCache` caps its working
 * set at 256 images and a byte budget — `ImageController::CompleteTaskForRequest`
 * reports the unbudgeted request as a failure. Every successful decode keeps
 * its image in that working set for three commits, or for 4 s when the page
 * commits nothing (`DecodedImageTracker::kTimeoutDurationMs`), so under load a
 * refusal can outlast an immediate retry by seconds.
 *
 * A refusal leaves nothing behind on the element: each `decode()` call queues a
 * fresh compositor request for the element's current image
 * (`ImageLoader::DispatchDecodeRequestsIfComplete`). A barrier can therefore
 * retry on the same attached `<img>` as well as on a fresh detached one.
 */

/** Waits before each further attempt; together they outlast the 4 s fallback. */
export const IMAGE_DECODE_RETRY_DELAYS_MS = [50, 150, 400, 1_000, 3_000] as const;

export type ImageBitmapDecoder = (source: ImageBitmapSource) => Promise<ImageBitmap>;

export interface RefusedImageDecodeFailure {
  /**
   * `undecodable`: `createImageBitmap` rejected the image too, so it is broken.
   * `exhausted`: every attempt in the schedule was refused.
   * `abandoned`: the caller stopped wanting the image during a wait.
   */
  readonly outcome: "undecodable" | "exhausted" | "abandoned";
  /** Message of the last rejection. */
  readonly reason: string;
  readonly attempts: number;
  readonly cause: unknown;
}

export interface RefusedImageDecodeRetry<T> {
  /** Makes one decode attempt. */
  readonly attempt: () => Promise<T>;
  /** Asked once, after the first rejection; see `decodesOutsideCompositor`. */
  readonly decodesElsewhere: () => Promise<boolean | undefined>;
  /** Checked after every wait; `true` ends the barrier without another attempt. */
  readonly abandoned?: () => boolean;
  readonly failure: (failure: RefusedImageDecodeFailure) => Error;
}

/** The scope's own `createImageBitmap`, or `undefined` where it has none. */
export function imageBitmapDecoder(scope: WindowOrWorkerGlobalScope): ImageBitmapDecoder | undefined {
  return typeof scope.createImageBitmap === "function"
    ? (source) => scope.createImageBitmap(source)
    : undefined;
}

/**
 * Decodes the image a second way, outside `decode()` and the compositor's
 * budget: `createImageBitmap` runs Blink's own image decoder over the encoded
 * bytes — a Blob's, or an `<img>`'s already-loaded data — and rejects unless
 * the whole frame decodes. That tells a refused valid image apart from a
 * genuinely broken one. `undefined` means there is no second decoder to ask.
 */
export async function decodesOutsideCompositor(
  createImageBitmap: ImageBitmapDecoder | undefined,
  source: () => ImageBitmapSource,
): Promise<boolean | undefined> {
  if (!createImageBitmap) return undefined;
  try {
    const bitmap = await createImageBitmap(source());
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs `attempt` until it resolves, waiting out the compositor's decode budget
 * between rejections. A broken image fails both decoders and goes straight to
 * the caller's retry surface; only an image that decodes elsewhere, or one no
 * second decoder can vouch for, waits out the schedule.
 */
export async function retryRefusedImageDecode<T>(retry: RefusedImageDecodeRetry<T>): Promise<T> {
  let decodesElsewhere: boolean | undefined;
  for (let attempts = 1; ; attempts += 1) {
    try {
      return await retry.attempt();
    } catch (error) {
      const failure = (outcome: RefusedImageDecodeFailure["outcome"]) => retry.failure({
        outcome,
        reason: error instanceof Error ? error.message : String(error),
        attempts,
        cause: error,
      });
      if (attempts === 1) decodesElsewhere = await retry.decodesElsewhere();
      if (decodesElsewhere === false) throw failure("undecodable");
      if (attempts > IMAGE_DECODE_RETRY_DELAYS_MS.length) throw failure("exhausted");
      await new Promise((resolve) => {
        globalThis.setTimeout(resolve, IMAGE_DECODE_RETRY_DELAYS_MS[attempts - 1]);
      });
      if (retry.abandoned?.()) throw failure("abandoned");
    }
  }
}
