import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateStagedRenderAssets,
  isStagedRenderAssetUrl,
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

  it("recognizes only generated player render paths", () => {
    expect(isStagedRenderAssetUrl("/assets/original/stage0-map.png")).toBe(true);
    expect(isStagedRenderAssetUrl("/assets/original/map-action-atlases/fire-1.json"))
      .toBe(true);
    expect(isStagedRenderAssetUrl("/assets/original/music/MUSIC/0001.ogg")).toBe(false);
    expect(isStagedRenderAssetUrl("/debug/fixture.png")).toBe(false);
  });
});
