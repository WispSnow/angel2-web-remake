import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodesOutsideCompositor,
  imageBitmapDecoder,
  retryRefusedImageDecode,
  type RefusedImageDecodeFailure,
} from "../../src/game/image-decode-retry";

// Chromium 對「合成器預算不夠」與「圖本身壞掉」回的是同一個 EncodingError。
const refusal = () => new DOMException("The source image cannot be decoded.", "EncodingError");

describe("refused image decode retry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spaces attempts past the compositor's 4 s lock and asks the second decoder once", async () => {
    vi.useFakeTimers();
    const attemptTimes: number[] = [];
    const decodesElsewhere = vi.fn(async () => true);
    const failures: RefusedImageDecodeFailure[] = [];
    const outcome = retryRefusedImageDecode({
      attempt: async () => {
        attemptTimes.push(Date.now());
        throw refusal();
      },
      decodesElsewhere,
      failure: (failure) => {
        failures.push(failure);
        return new Error(failure.outcome);
      },
    }).then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await outcome).toMatchObject({ message: "exhausted" });
    expect(attemptTimes.map((time) => time - attemptTimes[0]))
      .toEqual([0, 50, 200, 600, 1_600, 4_600]);
    expect(decodesElsewhere).toHaveBeenCalledTimes(1);
    expect(failures).toEqual([expect.objectContaining({
      outcome: "exhausted",
      reason: "The source image cannot be decoded.",
      attempts: 6,
    })]);
  });

  it("asks createImageBitmap on its own scope and releases the bitmap", async () => {
    expect(imageBitmapDecoder({} as WindowOrWorkerGlobalScope)).toBeUndefined();
    expect(await decodesOutsideCompositor(undefined, () => {
      throw new Error("no decoder, so no source is built");
    })).toBeUndefined();

    const valid = new Blob([new Uint8Array([1])], { type: "image/png" });
    const broken = new Blob([new Uint8Array([2])], { type: "image/png" });
    const close = vi.fn();
    const receivers: unknown[] = [];
    const scope = {
      createImageBitmap(this: unknown, source: ImageBitmapSource) {
        // 瀏覽器對脫離 window 呼叫的 createImageBitmap 會丟 Illegal invocation。
        receivers.push(this);
        if (source === broken) {
          return Promise.reject(new DOMException("The source image could not be decoded.", "InvalidStateError"));
        }
        return Promise.resolve({ close } as unknown as ImageBitmap);
      },
    } as unknown as WindowOrWorkerGlobalScope;
    const decoder = imageBitmapDecoder(scope);

    expect(await decodesOutsideCompositor(decoder, () => valid)).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(await decodesOutsideCompositor(decoder, () => broken)).toBe(false);
    expect(receivers).toEqual([scope, scope]);
  });
});
