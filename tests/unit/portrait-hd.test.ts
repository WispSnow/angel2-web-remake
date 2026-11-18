import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PORTRAIT_CATALOG, PORTRAIT_RECORDS, portraitSourceFor, type PortraitRecord } from "../../src/game/content/portrait-catalog.generated";
import { PORTRAIT_HD_AVAILABLE, portraitHdAssetUrls, portraitHdEntry } from "../../src/game/content/portrait-hd";
import { PORTRAIT_HD_ENTRIES, PORTRAIT_HD_SIZE } from "../../src/game/content/portrait-hd.generated";
import { animatedPortraitMarkup } from "../../src/game/portrait";
import {
  activePortraitHd,
  markPortraitHdFailed,
  onPortraitPresentationChange,
  portraitHdUrlsForStyle,
  portraitStillSourceFor,
  portraitStyle,
  setPortraitStyle,
  takePortraitHdFailureNotice,
} from "../../src/game/portrait-style";

const assetRoot = path.resolve("public");

describe("REMAKE-192 generated HD portrait catalog", () => {
  it("covers every record except D/63, which stays original", () => {
    expect(PORTRAIT_HD_AVAILABLE).toBe(true);
    const records = Object.keys(PORTRAIT_HD_ENTRIES).map(Number);
    expect(records).toEqual(PORTRAIT_RECORDS.filter((record) => record !== 63));
    expect(portraitHdEntry(63)).toBeUndefined();
  });

  it("gives each mouth mode the layout the player draws", () => {
    const modes = new Map<string, number[]>();
    for (const [record, entry] of Object.entries(PORTRAIT_HD_ENTRIES)) {
      modes.set(entry.mode, [...(modes.get(entry.mode) ?? []), Number(record)]);
      if (entry.mode === "still") {
        expect(entry.video).toBeUndefined();
        continue;
      }
      expect(entry.video?.height).toBe(PORTRAIT_HD_SIZE);
      if (entry.mode === "tween") {
        const { patch, levels, knots } = entry.mouth ?? { patch: undefined, levels: [], knots: [] };
        expect(patch).toBeDefined();
        expect(levels).toHaveLength(4);
        expect(knots[0]).toBe(0);
        expect(knots.at(-1)).toBe(1);
        // Mouth tiles stay inside the strip right of the 448 square.
        for (const tile of levels) {
          expect(tile.sx).toBeGreaterThanOrEqual(PORTRAIT_HD_SIZE);
          expect(tile.sy + (patch?.h ?? 0)).toBeLessThanOrEqual(PORTRAIT_HD_SIZE);
        }
      }
    }
    // Plan doc 18.1: soldiers and cavalry hide the mouth, the dragon king and wyvern
    // fade their whole speaking frame in, and the D/67 statue is a still.
    expect(modes.get("none")).toEqual([47, 48, 52, 53]);
    expect(modes.get("continuous")).toEqual([56, 66]);
    expect(modes.get("still")).toEqual([67]);
    expect(modes.get("tween")).toHaveLength(60);
  });

  it("ships every referenced file in the asset pack, matching the pack manifest", () => {
    const manifest = JSON.parse(readFileSync(path.join(assetRoot, "assets/original/portraits/hd/hd-manifest.json"), "utf8")) as {
      records: {
        record: number;
        poster: { output: string; sha256: string };
        video?: { output: string; sha256: string };
        redEyes?: { poster: { output: string; sha256: string }; video: { output: string; sha256: string } };
      }[];
    };
    for (const entry of manifest.records) {
      for (const file of [entry.poster, entry.video, entry.redEyes?.poster, entry.redEyes?.video].filter((value) => value !== undefined)) {
        const bytes = readFileSync(path.join(assetRoot, "assets/original", file.output));
        expect(createHash("sha256").update(bytes).digest("hex"), file.output).toBe(file.sha256);
      }
      for (const url of portraitHdAssetUrls(entry.record as (typeof PORTRAIT_RECORDS)[number])) {
        expect(existsSync(path.join(assetRoot, url))).toBe(true);
      }
    }
  });

  it("REMAKE-195: gives exactly the records with an original frame 7 a red-eye variant on the loop's layout", () => {
    const withFrame7 = PORTRAIT_RECORDS.filter((record) => PORTRAIT_CATALOG[record].animation && "redEyes" in (PORTRAIT_CATALOG[record].animation ?? {}));
    expect(withFrame7).toEqual([0, 2, 3, 41]);
    for (const [record, entry] of Object.entries(PORTRAIT_HD_ENTRIES)) {
      expect(Boolean(entry.redEyes), `D/${record}`).toBe(withFrame7.includes(Number(record) as PortraitRecord));
      if (!entry.redEyes || !entry.video) continue;
      // Same size and frame count: the variant reuses the loop's mouth strip and layout.
      expect(entry.redEyes.video).toMatchObject({ width: entry.video.width, height: entry.video.height, frames: entry.video.frames });
      expect(entry.redEyes.video.source).toBe(`/assets/original/portraits/hd/${record.padStart(4, "0")}/red-eyes.mp4`);
    }
  });
});

describe("REMAKE-192 portrait style resolution", () => {
  it("defaults to the original style and requests no HD file for it", () => {
    expect(portraitStyle()).toBe("original");
    expect(activePortraitHd(46)).toBeUndefined();
    expect(portraitStillSourceFor(46)).toEqual({ source: portraitSourceFor(46), hd: false });
    expect(portraitHdUrlsForStyle([46, 63])).toEqual([]);
  });

  it("switches whole records to HD, except D/63 and a face that must show red eyes", () => {
    const changed = vi.fn();
    const stop = onPortraitPresentationChange(changed);
    setPortraitStyle("hd");
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
    expect(portraitHdUrlsForStyle([46, 63])).toEqual([
      "/assets/original/portraits/hd/0046/portrait.mp4",
      "/assets/original/portraits/hd/0046/poster.webp",
    ]);
    expect(activePortraitHd(46)?.mode).toBe("tween");
    expect(activePortraitHd(63)).toBeUndefined();
    // REMAKE-195: a possessed face plays its red-eye variant: same layout, other video and poster.
    expect(activePortraitHd(2, { redEyes: true })).toMatchObject({
      mode: "tween",
      poster: "/assets/original/portraits/hd/0002/red-eyes-poster.webp",
      video: { source: "/assets/original/portraits/hd/0002/red-eyes.mp4" },
      mouth: activePortraitHd(2)?.mouth,
    });
    expect(activePortraitHd(2, { redEyes: false })?.video?.source).toBe("/assets/original/portraits/hd/0002/portrait.mp4");
    // A record without frame 7 has no red-eye variant and falls back to the original.
    expect(activePortraitHd(46, { redEyes: true })).toBeUndefined();
    // Red-eye files ride the gate only in the stage that possesses the face (stage 5: D/2 and D/3).
    expect(portraitHdUrlsForStyle([2, 3, 46], "hd", 5)).toEqual(expect.arrayContaining([
      "/assets/original/portraits/hd/0002/red-eyes.mp4",
      "/assets/original/portraits/hd/0003/red-eyes-poster.webp",
    ]));
    expect(portraitHdUrlsForStyle([2, 3, 46], "hd", 6).some((url) => url.includes("red-eyes"))).toBe(false);
    expect(portraitHdUrlsForStyle([2, 46], "hd", 30).some((url) => url.includes("red-eyes"))).toBe(false);
    expect(portraitHdUrlsForStyle([41], "original", 30)).toEqual([]);
    expect(portraitStillSourceFor(46)).toEqual({ source: "/assets/original/portraits/hd/0046/poster.webp", hd: true });
  });

  it("falls a failed record back to the original once and reports it once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    markPortraitHdFailed(5, "decode error");
    markPortraitHdFailed(5, "decode error");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(activePortraitHd(5)).toBeUndefined();
    expect(portraitStillSourceFor(5).hd).toBe(false);
    expect(takePortraitHdFailureNotice()).toBe(true);
    expect(takePortraitHdFailureNotice()).toBe(false);
    warn.mockRestore();
    setPortraitStyle("original");
  });

  it("REMAKE-194: the full-screen combat panel stays the original still, loops in HD, and plays a possessed face's red-eye loop", () => {
    const panel = (record: number, redEyes = false) => animatedPortraitMarkup(record as PortraitRecord, {
      alt: "肖像",
      channel: "full-combat-left",
      className: "full-status-portrait",
      redEyes,
      originalStill: true,
    });
    const original = panel(46);
    expect(original).toContain('data-original-still="true"');
    expect(original).toContain('data-portrait-style="original"');
    // Module 29 draws the status panel once on entry: base image only, no eye or mouth overlay.
    expect(original).toContain(portraitSourceFor(46));
    expect(original).not.toMatch(/portrait-eye|portrait-mouth|portrait-red-eyes/u);
    setPortraitStyle("hd");
    const hd = panel(46);
    expect(hd).toContain('data-portrait-style="hd"');
    expect(hd).toContain("canvas class=\"portrait-hd-canvas\"");
    expect(hd).toContain("/assets/original/portraits/hd/0046/portrait.mp4");
    // REMAKE-195: the possessed face plays its red-eye loop, like its unit detail.
    const possessed = panel(2, true);
    expect(possessed).toContain('data-portrait-style="hd"');
    expect(possessed).toContain('data-portrait-hd-variant="red-eyes"');
    expect(possessed).toContain("/assets/original/portraits/hd/0002/red-eyes.mp4");
    expect(possessed).not.toMatch(/portrait-red-eyes|portrait-eye/u);
    setPortraitStyle("original");
  });
});
