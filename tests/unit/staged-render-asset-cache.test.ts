import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateStagedRenderAssets,
  decodeStagedRenderImages,
  isStagedRenderAssetUrl,
  loadStagedRenderImage,
  onStagedRenderAssetsChanged,
  stagedRenderAssetSource,
} from "../../src/game/staged-render-asset-cache";

describe("staged render asset cache", () => {
  let release: (() => void) | undefined;

  afterEach(() => {
    release?.();
    release = undefined;
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
});
