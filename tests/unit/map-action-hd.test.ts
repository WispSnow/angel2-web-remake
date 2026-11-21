import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stagePresentationActionIds } from "../../src/game/content/class-presentation-assets";
import { mapActionHdAssetUrlsForActions, mapActionHdEntries, mapActionHdEntry } from "../../src/game/content/map-action-hd";
import { STAGE1_ACTION_PRESENTATION } from "../../src/game/content/stage1-actions.generated";
import { TECHNIQUE_LAB_FIRE } from "../../src/game/content/technique-lab.generated";
import {
  activeMapActionHd,
  mapActionHdFrameSpan,
  mapActionHdTick,
  mapActionHdUrlsForStyle,
} from "../../src/game/map-action-hd";

const assetRoot = path.resolve(__dirname, "../../public/assets/original");
const FIRE_CODES = { "fire-1": "1F", "fire-2": "2F", "fire-3": "3F", "fire-4": "4F" } as const;

type Phase = { readonly descriptorSequence: readonly unknown[]; readonly waitPerDrawNativeTicks: number };

/** Start tick of every original frame in emit order, and the timeline's total. */
function timeline(phases: readonly Phase[]): { starts: number[]; duration: number } {
  const starts: number[] = [];
  let tick = 0;
  for (const phase of phases) {
    for (let index = 0; index < phase.descriptorSequence.length; index += 1) {
      starts.push(tick);
      tick += phase.waitPerDrawNativeTicks;
    }
  }
  return { starts, duration: tick };
}

describe("REMAKE-203 HD map-technique effects", () => {
  it("covers 1F–4F and keeps each one's original graphics timeline", () => {
    expect(mapActionHdEntries().map(({ actionId }) => actionId).sort()).toEqual(["fire-1", "fire-2", "fire-3", "fire-4"]);
    for (const [actionId, code] of Object.entries(FIRE_CODES)) {
      const entry = mapActionHdEntry(actionId);
      if (!entry) throw new Error(`no HD entry for ${actionId}`);
      const original = timeline(TECHNIQUE_LAB_FIRE[code].phases);
      expect(entry.durationTicks, actionId).toBe(original.duration);
      expect(entry.frameStartTicks, actionId).toEqual(original.starts);
      // one video frame per native tick
      expect(entry.video.frames, actionId).toBe(entry.durationTicks);
      expect(entry.video.fps, actionId).toBe(100);
    }
    // the formal battle's timelines are the same evidence as the lab's
    for (const [actionId, key] of [["fire-2", "fire2"], ["fire-3", "fire3"], ["fire-4", "fire4"]] as const) {
      expect(timeline(STAGE1_ACTION_PRESENTATION[key].phases).starts, actionId)
        .toEqual(mapActionHdEntry(actionId)?.frameStartTicks);
    }
  });

  it("ships every clip in the asset pack with a stacked layout that fits the video", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, "map-actions/hd/hd-manifest.json"), "utf8")) as {
      actions: { output: string; bytes: number }[];
    };
    for (const entry of mapActionHdEntries()) {
      const file = path.join(assetRoot, entry.video.source.slice("/assets/original/".length));
      const shipped = manifest.actions.find(({ output }) => `/assets/original/${output}` === entry.video.source);
      expect(shipped, entry.actionId).toBeDefined();
      expect(fs.statSync(file).size, entry.actionId).toBe(shipped?.bytes);
      const sideBySide = entry.alphaX > 0;
      expect(sideBySide ? entry.alphaX >= entry.frameWidth : entry.alphaY >= entry.frameHeight, entry.actionId).toBe(true);
      expect(entry.alphaX + entry.frameWidth, entry.actionId).toBeLessThanOrEqual(entry.video.width);
      expect(entry.alphaY + entry.frameHeight, entry.actionId).toBeLessThanOrEqual(entry.video.height);
      expect(entry.scale, entry.actionId).toBe(4);
      expect(entry.originX, entry.actionId).toBeGreaterThan(0);
      expect(entry.originY, entry.actionId).toBeLessThanOrEqual(entry.frameHeight);
    }
  });

  it("asks for HD files only when the art style is HD, and only for techniques that have them", () => {
    expect(mapActionHdUrlsForStyle(["fire-1", "fire-4"], "original")).toEqual([]);
    expect(mapActionHdUrlsForStyle(["fire-1", "fire-4", "heal-1"], "hd")).toEqual([
      "/assets/original/map-actions/hd/fire-1/hd.mp4",
      "/assets/original/map-actions/hd/fire-4/hd.mp4",
    ]);
    expect(mapActionHdAssetUrlsForActions(["heal-1", "lightning-1"])).toEqual([]);
    expect(activeMapActionHd("fire-2", "original")).toBeUndefined();
    expect(activeMapActionHd("heal-1", "hd")).toBeUndefined();
    // outside a resource lease every URL counts as available
    expect(activeMapActionHd("fire-2", "hd")?.actionId).toBe("fire-2");
  });

  it("feeds the resource gate the techniques a stage's classes can cast", () => {
    const actions = stagePresentationActionIds({ allyClassIds: ["sister"], encounterClassIds: ["soldier"] });
    expect(actions.has("fire-1")).toBe(true);
    expect(mapActionHdUrlsForStyle(actions, "hd")).toContain("/assets/original/map-actions/hd/fire-1/hd.mp4");
    // an ally soldier's promotion paths reach fire casters; enemies never promote
    expect(mapActionHdUrlsForStyle(stagePresentationActionIds({ allyClassIds: ["soldier"], encounterClassIds: [] }), "hd"))
      .toContain("/assets/original/map-actions/hd/fire-1/hd.mp4");
    expect(mapActionHdUrlsForStyle(stagePresentationActionIds({ allyClassIds: [], encounterClassIds: ["soldier"] }), "hd"))
      .toEqual([]);
  });

  it("moves the HD clock through each original frame at the controller's pace and never past its end", () => {
    const entry = mapActionHdEntry("fire-3");
    if (!entry) throw new Error("no HD entry for fire-3");
    const span = mapActionHdFrameSpan(entry, 7);
    expect(span).toEqual({ startTick: 105, endTick: 120 });
    expect(mapActionHdFrameSpan(entry, entry.frameStartTicks.length - 1)?.endTick).toBe(entry.durationTicks);
    expect(mapActionHdFrameSpan(entry, entry.frameStartTicks.length)).toBeUndefined();
    if (!span) return;
    // normal (10 ms per tick), fast (2.5) and test mode (4): the same frame always covers the same ticks
    for (const delayMs of [150, 38, 60]) {
      const clock = { ...span, delayMs, emittedAt: 1000 };
      expect(mapActionHdTick(clock, 1000)).toBe(105);
      expect(mapActionHdTick(clock, 1000 + delayMs / 3)).toBeCloseTo(110, 5);
      expect(mapActionHdTick(clock, 1000 + delayMs * 5)).toBeLessThan(120);
      expect(mapActionHdTick(clock, 1000 + delayMs * 5)).toBeGreaterThan(119.99);
      expect(mapActionHdTick(clock, 900)).toBe(105);
    }
  });
});
