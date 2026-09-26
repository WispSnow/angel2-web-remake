import { afterEach, describe, expect, test, vi } from "vitest";
import {
  acquireFullCombatImages,
  fullCombatImageSource,
  isFullCombatImageUrl,
} from "../../src/game/full-combat-image-cache";

// Chromium 對「合成器預算不夠」與「圖本身壞掉」回的是同一個 EncodingError。
const refusal = () => new DOMException("The source image cannot be decoded.", "EncodingError");

interface FakeDocumentOptions {
  /** Object URL whose PNG no decoder accepts. */
  readonly failingObjectUrl?: string;
  /** Leading `decode()` calls the compositor refuses. */
  readonly refusals?: number;
  readonly createImageBitmap?: (source: Blob) => Promise<unknown>;
}

function fakeDocument(options: FakeDocumentOptions = {}) {
  let objectUrlSequence = 0;
  const control = { refusals: options.refusals ?? 0 };
  const createObjectURL = vi.fn(() => `blob:test-${++objectUrlSequence}`);
  const revokeObjectURL = vi.fn();
  const images: Array<{ decoding: string; src: string }> = [];
  const decodeTimes: number[] = [];
  const ownerDocument = {
    defaultView: {
      Blob,
      URL: { createObjectURL, revokeObjectURL },
      ...(options.createImageBitmap ? { createImageBitmap: options.createImageBitmap } : {}),
    },
    createElement: vi.fn(() => {
      const image = {
        decoding: "auto",
        src: "",
        decode: vi.fn(async () => {
          decodeTimes.push(Date.now());
          if (image.src === options.failingObjectUrl) throw refusal();
          if (control.refusals > 0) {
            control.refusals -= 1;
            throw refusal();
          }
        }),
      };
      images.push(image);
      return image;
    }),
  } as unknown as Document;
  return { ownerDocument, control, createObjectURL, revokeObjectURL, images, decodeTimes };
}

describe("decoded full-combat image cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("recognizes only player-facing panorama atlases and backdrops", () => {
    expect(isFullCombatImageUrl("/assets/original/full-combat-atlases/left-soldier.png"))
      .toBe(true);
    expect(isFullCombatImageUrl("/assets/original/full-combat/backgrounds/05.png"))
      .toBe(true);
    expect(isFullCombatImageUrl("/assets/original/stage0-map.png")).toBe(false);
    expect(isFullCombatImageUrl("/assets/original/full-combat-atlases/left-soldier.json"))
      .toBe(false);
  });

  test("shares decoded object URLs and revokes them after the last lease", async () => {
    const atlas = "/assets/original/full-combat-atlases/left-soldier.png";
    const backdrop = "/assets/original/full-combat/backgrounds/05.png";
    const { ownerDocument, revokeObjectURL } = fakeDocument();
    const encodedBytes = new Map([
      [atlas, new Uint8Array([1, 2, 3])],
      [backdrop, new Uint8Array([4, 5, 6])],
    ]);
    const first = await acquireFullCombatImages([atlas, backdrop], {
      encodedBytes,
      ownerDocument,
    });
    const second = await acquireFullCombatImages([atlas], { ownerDocument });
    expect(fullCombatImageSource(atlas)).toBe("blob:test-1");
    expect(fullCombatImageSource(backdrop)).toBe("blob:test-2");

    first.release();
    expect(fullCombatImageSource(atlas)).toBe("blob:test-1");
    expect(fullCombatImageSource(backdrop)).toBe(backdrop);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-2");

    second.release();
    expect(fullCombatImageSource(atlas)).toBe(atlas);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
  });

  test("waits out a refused decode of valid bytes on a fresh detached image", async () => {
    vi.useFakeTimers();
    const atlas = "/assets/original/full-combat-atlases/right-magic-priest.png";
    const bytes = new Uint8Array([1, 2, 3]);
    const bitmapSources: Blob[] = [];
    const createImageBitmap = vi.fn(async (source: Blob) => {
      bitmapSources.push(source);
      return { close: vi.fn() };
    });
    const { ownerDocument, createObjectURL, revokeObjectURL, images } = fakeDocument({
      refusals: 1,
      createImageBitmap,
    });
    const fetchImage = vi.fn<(input: RequestInfo | URL) => Promise<Response>>();

    let settled = false;
    const acquired = acquireFullCombatImages([atlas], {
      encodedBytes: new Map([[atlas, bytes]]),
      fetchImage,
      ownerDocument,
    }).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(49);
    // 立刻重試只會再被同一份預算拒絕，資源門要等退避時間過去才解第二次。
    expect(images).toHaveLength(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const lease = await acquired;

    expect(images).toEqual([
      expect.objectContaining({ decoding: "sync", src: "blob:test-1" }),
      expect.objectContaining({ decoding: "sync", src: "blob:test-1" }),
    ]);
    expect(fullCombatImageSource(atlas)).toBe("blob:test-1");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchImage).not.toHaveBeenCalled();
    // 交叉驗證解的是保留的原始位元組，不是重抓，也不經過物件網址。
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(bitmapSources[0].type).toBe("image/png");
    vi.useRealTimers();
    expect(new Uint8Array(await bitmapSources[0].arrayBuffer())).toEqual(bytes);

    lease.release();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
  });

  test("keeps refused valid bytes retrying past the compositor's 4 s lock, then gives up", async () => {
    vi.useFakeTimers();
    const atlas = "/assets/original/full-combat-atlases/left-archer.png";
    const { ownerDocument, control, revokeObjectURL, images, decodeTimes } = fakeDocument({
      refusals: Number.POSITIVE_INFINITY,
      createImageBitmap: vi.fn(async () => ({ close: vi.fn() })),
    });
    const encodedBytes = new Map([[atlas, new Uint8Array([7])]]);

    const outcome = acquireFullCombatImages([atlas], { encodedBytes, ownerDocument }).then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await outcome).toMatchObject({
      message: `圖片解碼失敗：${atlas}（嘗試 6 次：The source image cannot be decoded.）`,
    });
    expect(images).toHaveLength(6);
    expect(decodeTimes[5] - decodeTimes[0]).toBeGreaterThan(4_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
    expect(fullCombatImageSource(atlas)).toBe(atlas);

    // 失敗不留在快取裡，資源門的「重試」會真的重新解碼。
    control.refusals = 0;
    const lease = await acquireFullCombatImages([atlas], { encodedBytes, ownerDocument });
    expect(images).toHaveLength(7);
    expect(fullCombatImageSource(atlas)).toBe("blob:test-2");
    lease.release();
  });

  test("cleans up decoded siblings when a PNG no decoder accepts fails at once", async () => {
    // 一格計時器都不推進：真壞的圖不該讓資源門坐完整段退避。
    vi.useFakeTimers();
    const atlas = "/assets/original/full-combat-atlases/right-soldier.png";
    const backdrop = "/assets/original/full-combat/backgrounds/06.png";
    const createImageBitmap = vi.fn(async () => {
      throw new DOMException("The source image could not be decoded.", "InvalidStateError");
    });
    const { ownerDocument, revokeObjectURL, images } = fakeDocument({
      failingObjectUrl: "blob:test-2",
      createImageBitmap,
    });
    const encodedBytes = new Map([
      [atlas, new Uint8Array([1])],
      [backdrop, new Uint8Array([2])],
    ]);
    await expect(acquireFullCombatImages([atlas, backdrop], {
      encodedBytes,
      ownerDocument,
    })).rejects.toThrow(`圖片解碼失敗：${backdrop}（The source image cannot be decoded.）`);
    expect(images).toHaveLength(2);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(fullCombatImageSource(atlas)).toBe(atlas);
    expect(fullCombatImageSource(backdrop)).toBe(backdrop);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-2");
  });
});
