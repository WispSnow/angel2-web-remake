import { describe, expect, it } from "vitest";
import {
  nativeMouthFrameAfterGlyph,
  nativeStoryGlyphMovesMouth,
} from "../../src/game/portrait";

describe("native portrait mouth animation", () => {
  it("toggles only for decoded Big5 double-byte glyphs", () => {
    expect(nativeStoryGlyphMovesMouth("妮")).toBe(true);
    expect(nativeStoryGlyphMovesMouth("「")).toBe(true);
    expect(nativeStoryGlyphMovesMouth("A")).toBe(false);
    expect(nativeStoryGlyphMovesMouth(" ")).toBe(false);
    expect(nativeStoryGlyphMovesMouth("\n")).toBe(false);
  });

  it("alternates between closed and half-open without selecting fully open", () => {
    expect(nativeMouthFrameAfterGlyph("1", "妮")).toBe("2");
    expect(nativeMouthFrameAfterGlyph("2", "雅")).toBe("1");
    expect(nativeMouthFrameAfterGlyph("1", "A")).toBe("1");
    expect(nativeMouthFrameAfterGlyph("2", " ")).toBe("2");
    expect(nativeMouthFrameAfterGlyph("3", "妮")).toBe("2");
  });
});
