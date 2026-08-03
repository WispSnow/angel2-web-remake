import { describe, expect, it } from "vitest";
import {
  nativeMouthFrameAfterGlyph,
  nativeStoryGlyphMovesMouth,
} from "../../src/game/portrait";
import {
  isPortraitRecord,
  PORTRAIT_CATALOG,
  PORTRAIT_RECORDS,
  portraitSourceFor,
} from "../../src/game/content/portrait-catalog.generated";

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

describe("generated campaign portrait catalog", () => {
  it("registers every native D record without per-stage animation maps", () => {
    expect(PORTRAIT_RECORDS).toHaveLength(68);
    expect(Object.values(PORTRAIT_CATALOG).filter(({ animation }) => animation)).toHaveLength(67);
    expect(PORTRAIT_CATALOG[63]).toMatchObject({
      source: "/assets/original/portraits/0063/base.png",
      displayName: null,
      animation: null,
    });
    expect(PORTRAIT_CATALOG[67].animation?.metadataSourceRecord).toBe(56);
  });

  it("provides complete eye and mouth layers for every stage-zero and stage-one portrait", () => {
    for (const record of [0, 15, 34, 42, 43, 44, 45, 46, 47, 48, 49] as const) {
      const animation = PORTRAIT_CATALOG[record].animation;
      expect(animation, `D/${record} animation`).not.toBeNull();
      expect(animation?.eyes).toHaveLength(3);
      expect(animation?.mouths).toHaveLength(3);
      expect(portraitSourceFor(record)).toMatch(new RegExp(`/portraits/${String(record).padStart(4, "0")}/base\\.png$`));
    }
  });

  it("applies the evidence-backed D/59 archer eye correction without changing its mouth", () => {
    expect(PORTRAIT_CATALOG[59].animation).toMatchObject({
      eyeOrigin: { x: 56, y: 24 },
      mouthOrigin: { x: 64, y: 32 },
      originCorrection: {
        ruleId: "REMAKE-010",
        target: "eye",
        nativeOrigin: { x: 40, y: 24 },
        appliedOrigin: { x: 56, y: 24 },
      },
    });
  });

  it("uses the native 0..67 record boundary", () => {
    expect(isPortraitRecord(0)).toBe(true);
    expect(isPortraitRecord(67)).toBe(true);
    expect(isPortraitRecord(68)).toBe(false);
    expect(isPortraitRecord(-1)).toBe(false);
    expect(isPortraitRecord(1.5)).toBe(false);
  });
});
