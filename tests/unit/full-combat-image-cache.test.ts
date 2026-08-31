import { describe, expect, test, vi } from "vitest";
import {
  acquireFullCombatImages,
  fullCombatImageSource,
  isFullCombatImageUrl,
} from "../../src/game/full-combat-image-cache";

function fakeDocument(failingObjectUrl?: string, failFirstDecode = false) {
  let objectUrlSequence = 0;
  let imageSequence = 0;
  const revokeObjectURL = vi.fn();
  const ownerDocument = {
    defaultView: {
      Blob,
      URL: {
        createObjectURL: vi.fn(() => `blob:test-${++objectUrlSequence}`),
        revokeObjectURL,
      },
    },
    createElement: vi.fn(() => {
      const imageNumber = ++imageSequence;
      const image = {
        decoding: "auto",
        src: "",
        decode: vi.fn(async () => {
          if (failFirstDecode && imageNumber === 1) throw new Error("decoder busy");
          if (image.src === failingObjectUrl) throw new Error("broken PNG");
        }),
      };
      return image;
    }),
  } as unknown as Document;
  return { ownerDocument, revokeObjectURL };
}

describe("decoded full-combat image cache", () => {
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

  test("retries a transient detached-image decode with the retained bytes", async () => {
    const atlas = "/assets/original/full-combat-atlases/right-magic-priest.png";
    const { ownerDocument, revokeObjectURL } = fakeDocument(undefined, true);
    const lease = await acquireFullCombatImages([atlas], {
      encodedBytes: new Map([[atlas, new Uint8Array([1, 2, 3])]]),
      ownerDocument,
    });

    expect(ownerDocument.createElement).toHaveBeenCalledTimes(2);
    expect(fullCombatImageSource(atlas)).toBe("blob:test-1");
    lease.release();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
  });

  test("cleans up successfully decoded siblings when one image fails", async () => {
    const atlas = "/assets/original/full-combat-atlases/right-soldier.png";
    const backdrop = "/assets/original/full-combat/backgrounds/06.png";
    const { ownerDocument, revokeObjectURL } = fakeDocument("blob:test-2");
    const encodedBytes = new Map([
      [atlas, new Uint8Array([1])],
      [backdrop, new Uint8Array([2])],
    ]);
    await expect(acquireFullCombatImages([atlas, backdrop], {
      encodedBytes,
      ownerDocument,
    })).rejects.toThrow(/圖片解碼失敗.*backgrounds\/06\.png/u);
    expect(fullCombatImageSource(atlas)).toBe(atlas);
    expect(fullCombatImageSource(backdrop)).toBe(backdrop);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-2");
  });
});
