import { describe, expect, it, vi } from "vitest";

import { prepareDomImageElements } from "../../src/game/dom-image-readiness";

describe("DOM image readiness", () => {
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
});
