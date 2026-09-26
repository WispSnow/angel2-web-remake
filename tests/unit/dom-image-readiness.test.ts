import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareDomImageElements } from "../../src/game/dom-image-readiness";

// Chromium 對「合成器預算不夠」與「圖本身壞掉」回的是同一個 EncodingError。
const refusal = () => new DOMException("The source image cannot be decoded.", "EncodingError");

/** An `<img>` already in the segment whose first `refusals` decodes are refused. */
function segmentImage(src: string, refusals: number) {
  let remaining = refusals;
  const decodeTimes: number[] = [];
  const decode = vi.fn(async () => {
    decodeTimes.push(Date.now());
    if (remaining > 0) {
      remaining -= 1;
      throw refusal();
    }
  });
  const fields = { complete: true, decode, naturalHeight: 16, naturalWidth: 24, src };
  return { image: fields as unknown as HTMLImageElement, fields, decode, decodeTimes };
}

describe("DOM image readiness", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("bounds decode concurrency for image-heavy visible segments", async () => {
    let active = 0;
    let maximumActive = 0;
    const images = Array.from({ length: 14 }, (_, index) => ({
      decode: vi.fn(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => globalThis.setTimeout(resolve, 2));
        active -= 1;
      }),
      naturalHeight: 16,
      naturalWidth: 24,
      src: `blob:credits-${index}`,
    })) as unknown as HTMLImageElement[];

    await prepareDomImageElements(images);

    expect(images.every((image) => vi.mocked(image.decode).mock.calls.length === 1)).toBe(true);
    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(6);
  });

  it("rejects a decoded image with an empty bitmap", async () => {
    const image = {
      decode: vi.fn(async () => undefined),
      naturalHeight: 0,
      naturalWidth: 0,
      src: "blob:empty-ending-frame",
    } as unknown as HTMLImageElement;

    await expect(prepareDomImageElements([image]))
      .rejects.toThrow("DOM image decoded empty: blob:empty-ending-frame");
  });

  it("waits out a refused decode on the same attached element", async () => {
    vi.useFakeTimers();
    const createImageBitmap = vi.fn(async () => ({ close: vi.fn() }));
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const { image, decode } = segmentImage("blob:stage49-story-background", 1);

    let settled = false;
    const barrier = prepareDomImageElements([image]).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(49);
    // 立刻重試只會再被同一份預算拒絕，所以第二次要等退避時間過去。
    expect(decode).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await barrier;

    // 拒絕不留在元素上：同一張已在段落裡的圖再 decode() 一次就好，不必換節點。
    expect(decode).toHaveBeenCalledTimes(2);
    // 第二個解碼器讀的是這張圖自己已載入的位元組。
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledWith(image);
  });

  it("sends an image that createImageBitmap rejects too straight to the retry prompt", async () => {
    // 一格計時器都不推進：真壞的圖不該坐完整段退避。
    vi.useFakeTimers();
    const createImageBitmap = vi.fn(async () => {
      throw new DOMException("The HTMLImageElement provided is in the 'broken' state.", "InvalidStateError");
    });
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const { image, fields, decode } = segmentImage("blob:broken-ending-frame", Number.POSITIVE_INFINITY);
    fields.naturalWidth = 0;
    fields.naturalHeight = 0;

    await expect(prepareDomImageElements([image])).rejects.toThrow(
      "DOM image failed to decode: blob:broken-ending-frame: The source image cannot be decoded.",
    );
    expect(decode).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it("keeps a refused valid image retrying past the compositor's 4 s lock, then gives up", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close: vi.fn() })));
    const { image, decodeTimes } = segmentImage("blob:credits-3", Number.POSITIVE_INFINITY);

    const outcome = prepareDomImageElements([image]).then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await outcome).toMatchObject({
      message: "DOM image failed to decode after 6 attempts: blob:credits-3: "
        + "The source image cannot be decoded.",
    });
    expect(decodeTimes).toHaveLength(6);
    expect(decodeTimes[5] - decodeTimes[0]).toBeGreaterThan(4_000);
  });

  it("does not ask createImageBitmap to judge an image still loading a new source", async () => {
    vi.useFakeTimers();
    // decode() 也會在來源中途被換掉時拒絕；新來源還沒載完，第二個解碼器只會說它「不完整」。
    const createImageBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const { image, fields, decode } = segmentImage("blob:stage49-epilogue-left", 1);
    fields.complete = false;

    const barrier = prepareDomImageElements([image]);
    await vi.advanceTimersByTimeAsync(50);
    await barrier;

    expect(decode).toHaveBeenCalledTimes(2);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("stops retrying once the segment has been replaced", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close: vi.fn() })));
    const { image, decode } = segmentImage("blob:stage49-roster-background", Number.POSITIVE_INFINITY);
    let replaced = false;

    const outcome = prepareDomImageElements([image], { abandoned: () => replaced }).then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(decode).toHaveBeenCalledTimes(1);
    replaced = true;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await outcome).toMatchObject({
      message: "DOM image segment ended before blob:stage49-roster-background decoded",
    });
    expect(decode).toHaveBeenCalledTimes(1);
  });
});
