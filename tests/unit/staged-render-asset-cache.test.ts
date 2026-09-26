import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateStagedRenderAssets,
  decodeStagedRenderImages,
  isStagedRenderAssetUrl,
  loadStagedRenderImage,
  onStagedRenderAssetsChanged,
  stagedRenderAssetSource,
} from "../../src/game/staged-render-asset-cache";

// Chromium 對「合成器預算不夠」與「圖本身壞掉」回的是同一個 EncodingError。
const refusal = () => new DOMException("The source image cannot be decoded.", "EncodingError");

describe("staged render asset cache", () => {
  let release: (() => void) | undefined;

  afterEach(() => {
    release?.();
    release = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes stable object URLs only for active PNG and JSON bytes", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");
    const lease = activateStagedRenderAssets(new Map([
      ["/assets/original/map-action-atlases/fire-1.png", new Uint8Array([1, 2, 3])],
      ["/assets/original/map-action-atlases/fire-1.json", new Uint8Array([4, 5, 6])],
    ]));
    release = lease.release;

    const image = stagedRenderAssetSource(
      "/assets/original/map-action-atlases/fire-1.png",
    );
    const data = stagedRenderAssetSource(
      "/assets/original/map-action-atlases/fire-1.json",
    );
    expect(image).toMatch(/^blob:/u);
    expect(data).toMatch(/^blob:/u);
    expect(stagedRenderAssetSource(
      "/assets/original/map-action-atlases/fire-1.png",
    )).toBe(image);
    expect(stagedRenderAssetSource("/assets/original/audio/e/1.wav"))
      .toBe("/assets/original/audio/e/1.wav");
    expect(createObjectURL).toHaveBeenCalledTimes(2);

    lease.release();
    release = undefined;
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(stagedRenderAssetSource(
      "/assets/original/map-action-atlases/fire-1.png",
    )).toBe("/assets/original/map-action-atlases/fire-1.png");
  });

  it("re-resolves subscribed surfaces before the outgoing lease is revoked", () => {
    const url = "/assets/original/command-menu-top.png";
    const revoked: string[] = [];
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((value: string) => {
      revoked.push(value);
    });

    const first = activateStagedRenderAssets(new Map([[url, new Uint8Array([1])]]));
    release = first.release;
    // 模擬把物件網址抄進 CSS 變數的表面：只有換包時回來重解，才不會留著死網址。
    let cssCopy = stagedRenderAssetSource(url);
    const seenWhileResolving: string[] = [];
    const unsubscribe = onStagedRenderAssetsChanged(() => {
      seenWhileResolving.push(...revoked);
      cssCopy = stagedRenderAssetSource(url);
    });

    const second = activateStagedRenderAssets(new Map([[url, new Uint8Array([2])]]));
    release = second.release;
    unsubscribe();

    // 訂閱者跑的時候舊租約還沒回收，重寫下去的網址因此一定是活的。
    expect(seenWhileResolving).toEqual([]);
    expect(cssCopy).toMatch(/^blob:/u);
    expect(revoked).not.toContain(cssCopy);
    expect(cssCopy).toBe(stagedRenderAssetSource(url));
  });

  it("recognizes only generated player render paths", () => {
    expect(isStagedRenderAssetUrl("/assets/original/stage0-map.png")).toBe(true);
    expect(isStagedRenderAssetUrl("/assets/original/map-action-atlases/fire-1.json"))
      .toBe(true);
    expect(isStagedRenderAssetUrl("/assets/original/music/MUSIC/0001.ogg")).toBe(false);
    expect(isStagedRenderAssetUrl("/debug/fixture.png")).toBe(false);
  });

  it("decodes each active PNG once and never treats JSON as an image", async () => {
    const decoded = { naturalWidth: 24, naturalHeight: 16 } as HTMLImageElement;
    const decodeImage = vi.fn(async () => decoded);
    const imageUrl = "/assets/original/startup/pretitle.png";
    const lease = activateStagedRenderAssets(new Map([
      [imageUrl, new Uint8Array([1, 2, 3])],
      ["/assets/original/map-action-atlases/fire-1.json", new Uint8Array([4, 5, 6])],
    ]), { decodeImage });
    release = lease.release;

    await decodeStagedRenderImages([imageUrl]);
    expect(await loadStagedRenderImage(imageUrl)).toBe(decoded);
    expect(decodeImage).toHaveBeenCalledTimes(1);
    expect(decodeImage).toHaveBeenCalledWith(expect.stringMatching(/^blob:/u), imageUrl);
    expect(loadStagedRenderImage("/assets/original/map-action-atlases/fire-1.json"))
      .toBeUndefined();
  });

  it("bounds parallel image decoding when a route carries many portrait layers", async () => {
    let active = 0;
    let maximumActive = 0;
    const decoded = { naturalWidth: 24, naturalHeight: 16 } as HTMLImageElement;
    const decodeImage = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 2));
      active -= 1;
      return decoded;
    });
    const urls = Array.from(
      { length: 14 },
      (_, index) => `/assets/original/portraits/0046/layer-${index}.png`,
    );
    const lease = activateStagedRenderAssets(new Map(
      urls.map((url) => [url, new Uint8Array([1, 2, 3])]),
    ), { decodeImage });
    release = lease.release;

    await decodeStagedRenderImages(urls);
    expect(decodeImage).toHaveBeenCalledTimes(urls.length);
    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(6);
  });

  it("waits out a refused decode of valid bytes on a fresh detached image", async () => {
    vi.useFakeTimers();
    const url = "/assets/original/technique-lab/units/ally-swift-dragon-knight.png";
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const createObjectURL = vi.fn(() => "blob:staged-1");
    const revokeObjectURL = vi.fn();
    const bitmapSources: Blob[] = [];
    const createImageBitmap = vi.fn(async (source: Blob) => {
      bitmapSources.push(source);
      return { close: vi.fn() };
    });
    let refusals = 1;
    const images: Array<{
      decoding: string;
      src: string;
      dataset: Record<string, string>;
      naturalWidth: number;
      naturalHeight: number;
    }> = [];
    const ownerDocument = {
      defaultView: { Blob, URL: { createObjectURL, revokeObjectURL }, createImageBitmap },
      createElement: vi.fn(() => {
        const image = {
          decoding: "auto",
          src: "",
          dataset: {},
          naturalWidth: 0,
          naturalHeight: 0,
          decode: vi.fn(async () => {
            if (refusals > 0) {
              refusals -= 1;
              throw refusal();
            }
            image.naturalWidth = 24;
            image.naturalHeight = 16;
          }),
        };
        images.push(image);
        return image;
      }),
    } as unknown as Document;
    const lease = activateStagedRenderAssets(new Map([[url, bytes]]), { ownerDocument });
    release = lease.release;

    let settled = false;
    const barrier = decodeStagedRenderImages([url]).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(49);
    // 立刻重試只會再被同一份預算拒絕，所以第二次要等退避時間過去。
    expect(images).toHaveLength(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await barrier;

    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image).toMatchObject({
        decoding: "sync",
        src: "blob:staged-1",
        dataset: { stagedAssetUrl: url },
      });
    }
    expect(await loadStagedRenderImage(url)).toBe(images[1]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // 交叉驗證解的是租約保留的原始位元組，不是重抓，也不經過物件網址。
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(bitmapSources[0].type).toBe("image/png");
    vi.useRealTimers();
    expect(new Uint8Array(await bitmapSources[0].arrayBuffer())).toEqual(bytes);

    lease.release();
    release = undefined;
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:staged-1");
  });

  it("sends a PNG that no decoder accepts straight to the retry surface", async () => {
    vi.useFakeTimers();
    const createImageBitmap = vi.fn(async () => {
      throw new DOMException("The source image could not be decoded.", "InvalidStateError");
    });
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const decoded = { naturalWidth: 24, naturalHeight: 16 } as HTMLImageElement;
    const decodeImage = vi.fn<(source: string, originalUrl: string) => Promise<HTMLImageElement>>(
      async () => {
        throw refusal();
      },
    );
    const url = "/assets/original/unit-ally-soldier.png";
    const lease = activateStagedRenderAssets(
      new Map([[url, new Uint8Array([0x89, 0x50])]]),
      { decodeImage },
    );
    release = lease.release;

    // 一格計時器都不推進：真壞的圖不該坐完整段退避。
    await expect(decodeStagedRenderImages([url])).rejects.toThrow(
      `staged render asset failed to decode: ${url}: The source image cannot be decoded.`,
    );
    expect(decodeImage).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);

    // 拒絕不留在快取裡，資源門的「重試」會真的重新解碼。
    decodeImage.mockResolvedValueOnce(decoded);
    await expect(loadStagedRenderImage(url)).resolves.toBe(decoded);
  });

  it("keeps refused valid bytes retrying past the compositor's 4 s lock, then gives up", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close: vi.fn() })));
    const attemptTimes: number[] = [];
    const decodeImage = vi.fn(async () => {
      attemptTimes.push(Date.now());
      throw refusal();
    });
    const url = "/assets/original/portraits/0046/base.png";
    const lease = activateStagedRenderAssets(
      new Map([[url, new Uint8Array([1, 2, 3])]]),
      { decodeImage },
    );
    release = lease.release;

    const outcome = decodeStagedRenderImages([url]).then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await outcome).toMatchObject({
      message: `staged render asset failed to decode after 6 attempts: ${url}: `
        + "The source image cannot be decoded.",
    });
    expect(attemptTimes).toHaveLength(6);
    expect(attemptTimes[5] - attemptTimes[0]).toBeGreaterThan(4_000);
  });

  it("stops retrying once the next pack has released the lease", async () => {
    vi.useFakeTimers();
    // 沒有第二個解碼器可問時照樣退避重試，直到租約結束。
    vi.stubGlobal("createImageBitmap", undefined);
    const decodeImage = vi.fn(async () => {
      throw refusal();
    });
    const url = "/assets/original/stage34-minimap.png";
    activateStagedRenderAssets(new Map([[url, new Uint8Array([1, 2, 3])]]), { decodeImage });
    const outcome = decodeStagedRenderImages([url]).then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(decodeImage).toHaveBeenCalledTimes(1);

    const next = activateStagedRenderAssets(new Map(), { decodeImage });
    release = next.release;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await outcome).toMatchObject({
      message: `staged render asset lease ended before ${url} decoded`,
    });
    expect(decodeImage).toHaveBeenCalledTimes(1);
  });
});
