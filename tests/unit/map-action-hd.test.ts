import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stagePresentationActionIds } from "../../src/game/content/class-presentation-assets";
import {
  mapActionHdAssetUrlsForActions,
  mapActionHdCast,
  mapActionHdCastTimeline,
  mapActionHdClip,
  mapActionHdClipFrame,
  mapActionHdClips,
  mapActionHdSegmentFor,
  mapActionHdVisibleAt,
} from "../../src/game/content/map-action-hd";
import { STAGE0_ACTION_PRESENTATION_ASSETS, STAGE0_REST_PRESENTATION } from "../../src/game/content/stage0-actions.generated";
import { STAGE1_ACTION_PRESENTATION } from "../../src/game/content/stage1-actions.generated";
import { TECHNIQUE_LAB_FIRE, TECHNIQUE_LAB_HEAL } from "../../src/game/content/technique-lab.generated";
import {
  activeMapActionHdCast,
  mapActionHdClipEnd,
  mapActionHdFrameSpan,
  mapActionHdTick,
  mapActionHdUrlsForStyle,
} from "../../src/game/map-action-hd";

const assetRoot = path.resolve(__dirname, "../../public/assets/original");

type Phase = { readonly draws: number; readonly wait: number };

/** Start tick of every original frame in emit order, and the timeline's total. */
function timeline(phases: readonly Phase[]): { starts: number[]; duration: number } {
  const starts: number[] = [];
  let tick = 0;
  for (const { draws, wait } of phases) {
    for (let index = 0; index < draws; index += 1) {
      starts.push(tick);
      tick += wait;
    }
  }
  return { starts, duration: tick };
}

const descriptorPhases = (phases: readonly { readonly descriptorSequence: readonly unknown[]; readonly waitPerDrawNativeTicks: number }[]) =>
  phases.map((phase) => ({ draws: phase.descriptorSequence.length, wait: phase.waitPerDrawNativeTicks }));

/** The original graphics each clip stands for (the same evidence the controller plays). */
const ORIGINAL: Record<string, () => readonly Phase[]> = {
  "fire-1": () => descriptorPhases(TECHNIQUE_LAB_FIRE["1F"].phases),
  "fire-2": () => descriptorPhases(TECHNIQUE_LAB_FIRE["2F"].phases),
  "fire-3": () => descriptorPhases(TECHNIQUE_LAB_FIRE["3F"].phases),
  "fire-4": () => descriptorPhases(TECHNIQUE_LAB_FIRE["4F"].phases),
  // `UN/61`'s 39 frames and the blank cleanup draw, 5 ticks each (`controller.ts` heal-1 branch)
  "heal-1": () => [{ draws: STAGE0_ACTION_PRESENTATION_ASSETS.heal1.primary.length + 1, wait: 5 }],
  // the shared MAGIC/0 finish, which rest repeats
  "heal-tail": () => [{ draws: STAGE0_REST_PRESENTATION.frameCount, wait: STAGE0_REST_PRESENTATION.waitPerFrameNativeTicks }],
  "heal-2": () => TECHNIQUE_LAB_HEAL["2H"].phases.slice(0, -1).map((p) => ({ draws: p.drawCount, wait: p.waitPerDrawNativeTicks })),
  "heal-3": () => TECHNIQUE_LAB_HEAL["3H"].phases.slice(0, -1).map((p) => ({ draws: p.drawCount, wait: p.waitPerDrawNativeTicks })),
};

describe("HD map-technique effects (REMAKE-203 fire, REMAKE-204 heal and rest)", () => {
  it("keeps every clip on its original graphics timeline, with any afterglow after it", () => {
    const ids = mapActionHdClips().map(({ clipId }) => clipId);
    expect(ids).toEqual(expect.arrayContaining(["fire-1", "fire-2", "fire-3", "fire-4", "heal-1", "heal-tail"]));
    for (const clip of mapActionHdClips()) {
      const phases = ORIGINAL[clip.clipId];
      if (!phases) throw new Error(`no original timeline for ${clip.clipId}`);
      const original = timeline(phases());
      expect(clip.durationTicks, clip.clipId).toBe(original.duration);
      expect(clip.frameStartTicks, clip.clipId).toEqual(original.starts);
      // one video frame per native tick, through the afterglow
      expect(clip.video.frames, clip.clipId).toBe(clip.durationTicks + clip.afterglowTicks);
      expect(clip.video.fps, clip.clipId).toBe(100);
    }
    // fire keeps ending with the original; the shared heal finish fades out after it
    expect(mapActionHdClip("fire-1")?.afterglowTicks).toBe(0);
    expect(mapActionHdClip("heal-tail")?.afterglowTicks).toBeGreaterThan(0);
    // the formal battle's timelines are the same evidence as the lab's
    for (const [clipId, key] of [["fire-2", "fire2"], ["fire-3", "fire3"], ["fire-4", "fire4"]] as const) {
      expect(timeline(descriptorPhases(STAGE1_ACTION_PRESENTATION[key].phases)).starts, clipId)
        .toEqual(mapActionHdClip(clipId)?.frameStartTicks);
    }
    expect(timeline(descriptorPhases(STAGE1_ACTION_PRESENTATION.heal2.phases.slice(0, -1))).duration)
      .toBe(timeline(ORIGINAL["heal-2"]?.() ?? []).duration);
  });

  it("ships every clip in the asset pack with a stacked layout that fits the video", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, "map-actions/hd/hd-manifest.json"), "utf8")) as {
      clips: { output: string; bytes: number }[];
    };
    for (const clip of mapActionHdClips()) {
      const file = path.join(assetRoot, clip.video.source.slice("/assets/original/".length));
      const shipped = manifest.clips.find(({ output }) => `/assets/original/${output}` === clip.video.source);
      expect(shipped, clip.clipId).toBeDefined();
      expect(fs.statSync(file).size, clip.clipId).toBe(shipped?.bytes);
      const sideBySide = clip.alphaX > 0;
      expect(sideBySide ? clip.alphaX >= clip.frameWidth : clip.alphaY >= clip.frameHeight, clip.clipId).toBe(true);
      expect(clip.alphaX + clip.frameWidth, clip.clipId).toBeLessThanOrEqual(clip.video.width);
      expect(clip.alphaY + clip.frameHeight, clip.clipId).toBeLessThanOrEqual(clip.video.height);
      expect(clip.scale, clip.clipId).toBe(4);
      expect(clip.originX, clip.clipId).toBeGreaterThan(0);
      expect(clip.originY, clip.clipId).toBeLessThanOrEqual(clip.frameHeight);
    }
  });

  it("maps each presentation phase to its clip; all heals and rest share one finish", () => {
    expect(mapActionHdSegmentFor("fire-3", "fireEffect")?.clipId).toBe("fire-3");
    const primary = mapActionHdSegmentFor("heal-1", "healPrimary");
    const blank = mapActionHdSegmentFor("heal-1", "healBlank");
    expect(primary?.clipId).toBe("heal-1");
    // the blank cleanup draw (controller frame -1) is the clip's last frame
    if (!primary || !blank) throw new Error("no heal-1 segments");
    expect(mapActionHdClipFrame(primary, "healPrimary", 38)).toBe(38);
    expect(mapActionHdClipFrame(blank, "healBlank", -1)).toBe(39);
    expect(mapActionHdClip("heal-1")?.frameStartTicks[39]).toBe(195);
    for (const actionId of ["heal-1", "heal-2", "heal-3"]) {
      if (!mapActionHdCast(actionId)) continue;   // a heal whose own clip is not made yet has no HD version at all
      expect(mapActionHdSegmentFor(actionId, "healTail")?.clipId, actionId).toBe("heal-tail");
    }
    expect(mapActionHdSegmentFor("rest", "restEffect")?.clipId).toBe("heal-tail");
    expect(mapActionHdSegmentFor("rest", "restBlank")).toBeUndefined();
    expect(mapActionHdSegmentFor("heal-1", "lifeDrain")).toBeUndefined();
  });

  it("asks for HD files only when the art style is HD, for the stage's techniques and the rest everyone has", () => {
    expect(mapActionHdUrlsForStyle(["fire-1", "fire-4"], "original")).toEqual([]);
    expect(mapActionHdUrlsForStyle(["fire-1", "fire-4", "lightning-1"], "hd")).toEqual([
      "/assets/original/map-actions/hd/fire-1/hd.mp4",
      "/assets/original/map-actions/hd/fire-4/hd.mp4",
      "/assets/original/map-actions/hd/heal-tail/hd.mp4",
    ]);
    // every unit can rest: the finish is fetched in every stage
    expect(mapActionHdUrlsForStyle([], "hd")).toEqual(["/assets/original/map-actions/hd/heal-tail/hd.mp4"]);
    expect(mapActionHdAssetUrlsForActions(["heal-1"])).toEqual([
      "/assets/original/map-actions/hd/heal-1/hd.mp4",
      "/assets/original/map-actions/hd/heal-tail/hd.mp4",
    ]);
    expect(mapActionHdAssetUrlsForActions(["lightning-1"])).toEqual([]);
    expect(activeMapActionHdCast("fire-2", "original")).toBeUndefined();
    expect(activeMapActionHdCast("lightning-1", "hd")).toBeUndefined();
    // outside a resource lease every URL counts as available
    expect(activeMapActionHdCast("heal-1", "hd")?.clips.map(({ clipId }) => clipId)).toEqual(["heal-1", "heal-tail"]);
  });

  it("feeds the resource gate the techniques a stage's classes can cast", () => {
    const actions = stagePresentationActionIds({ allyClassIds: ["sister"], encounterClassIds: ["soldier"] });
    expect(actions.has("fire-1")).toBe(true);
    expect(mapActionHdUrlsForStyle(actions, "hd")).toContain("/assets/original/map-actions/hd/fire-1/hd.mp4");
    expect(mapActionHdUrlsForStyle(actions, "hd")).toContain("/assets/original/map-actions/hd/heal-1/hd.mp4");
    // an ally soldier's promotion paths reach fire casters; enemies never promote
    expect(mapActionHdUrlsForStyle(stagePresentationActionIds({ allyClassIds: ["soldier"], encounterClassIds: [] }), "hd"))
      .toContain("/assets/original/map-actions/hd/fire-1/hd.mp4");
    expect(mapActionHdUrlsForStyle(stagePresentationActionIds({ allyClassIds: [], encounterClassIds: ["soldier"] }), "hd"))
      .toEqual(["/assets/original/map-actions/hd/heal-tail/hd.mp4"]);
  });

  it("moves the HD clock through each original frame at the controller's pace and never past its end", () => {
    const clip = mapActionHdClip("fire-3");
    if (!clip) throw new Error("no HD clip for fire-3");
    const span = mapActionHdFrameSpan(clip, 7);
    expect(span).toEqual({ startTick: 105, endTick: 120 });
    // no afterglow: the last frame stops at the original end
    expect(mapActionHdFrameSpan(clip, clip.frameStartTicks.length - 1)).toEqual({ startTick: 180, endTick: 195 });
    expect(mapActionHdFrameSpan(clip, clip.frameStartTicks.length)).toBeUndefined();
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

  it("runs an afterglow past the original end at the same pace, without holding the controller", () => {
    const clip = mapActionHdClip("heal-tail");
    if (!clip) throw new Error("no HD clip for heal-tail");
    const end = mapActionHdClipEnd(clip);
    expect(end).toBe(75 + clip.afterglowTicks);
    // only the last frame's clock reaches into the afterglow
    expect(mapActionHdFrameSpan(clip, 3)).toEqual({ startTick: 45, endTick: 60 });
    const last = mapActionHdFrameSpan(clip, 4);
    expect(last).toEqual({ startTick: 60, endTick: 75, limitTick: end });
    if (!last) return;
    const clock = { ...last, delayMs: 150, emittedAt: 0 };
    expect(mapActionHdTick(clock, 150)).toBeCloseTo(75, 5);            // the controller moves on here
    expect(mapActionHdTick(clock, 300)).toBeCloseTo(90, 5);            // the afterglow keeps the same 10 ms per tick
    expect(mapActionHdTick(clock, 10_000)).toBeLessThan(end);
    expect(mapActionHdTick(clock, 10_000)).toBeGreaterThan(end - 0.01);
  });

  it("lays a cast's clips end to end for the technique lab, afterglow overlapping the next clip", () => {
    const heal = mapActionHdCastTimeline("heal-1");
    const tail = mapActionHdClip("heal-tail");
    if (!heal || !tail) throw new Error("no heal-1 cast");
    expect(heal.segments.map(({ clip, startTick }) => [clip.clipId, startTick])).toEqual([["heal-1", 0], ["heal-tail", 200]]);
    expect(heal.durationTicks).toBe(275);
    expect(heal.endTick).toBe(275 + tail.afterglowTicks);
    expect(mapActionHdVisibleAt(heal, 100).map(({ clip, tick }) => [clip.clipId, tick])).toEqual([["heal-1", 100]]);
    expect(mapActionHdVisibleAt(heal, 290).map(({ clip, tick }) => [clip.clipId, tick])).toEqual([["heal-tail", 90]]);
    expect(mapActionHdVisibleAt(heal, heal.endTick)).toEqual([]);
    const fire = mapActionHdCastTimeline("fire-1");
    expect(fire && [fire.durationTicks, fire.endTick]).toEqual([70, 70]);
  });
});
