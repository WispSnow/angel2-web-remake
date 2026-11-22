import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stagePresentationActionIds } from "../../src/game/content/class-presentation-assets";
import {
  MAP_ACTION_HD_ICE_SHELL,
  mapActionHdAssetUrlsForActions,
  mapActionHdCast,
  mapActionHdCastTimeline,
  mapActionHdClip,
  mapActionHdClipFrame,
  mapActionHdClips,
  mapActionHdInstanceCount,
  mapActionHdSegmentFor,
  mapActionHdVisibleAt,
} from "../../src/game/content/map-action-hd";
import { STAGE0_ACTION_PRESENTATION_ASSETS, STAGE0_REST_PRESENTATION } from "../../src/game/content/stage0-actions.generated";
import { STAGE1_ACTION_PRESENTATION } from "../../src/game/content/stage1-actions.generated";
import { TECHNIQUE_LAB_FIRE, TECHNIQUE_LAB_HEAL } from "../../src/game/content/technique-lab.generated";
import { lightningHdCells } from "../../src/game/phaser/map-action-hd-cells";
import {
  activeMapActionHdCast,
  activeMapActionHdIceShell,
  mapActionHdClipEnd,
  mapActionHdFrameSpan,
  mapActionHdTick,
  mapActionHdUrlsForStyle,
} from "../../src/game/map-action-hd";

const assetRoot = path.resolve(__dirname, "../../public/assets/original");
/**
 * `reverse/parsed/native` 被 gitignore，干净检出（含 GitHub CI）上没有。只有命中、阵亡与射击三段片段的
 * 原版时间轴读它，所以延后到用到时才读，并让那三段单独成一条 `it.skipIf`；其余用例在 CI 照常运行。
 */
const PARSED_NATIVE_DIRECTORY = path.resolve(__dirname, "../../reverse/parsed/native");
const PARSED_NATIVE_AVAILABLE = fs.existsSync(PARSED_NATIVE_DIRECTORY);
const parsedNative = (name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(PARSED_NATIVE_DIRECTORY, name), "utf8")) as Record<string, unknown>;
const combatEvidence = () => parsedNative("combat-presentations.json") as {
  mapPresentation: {
    hit: { totalGraphicFrames: number; fixedGraphicWaitNativeTicks: number };
    death: { descriptorCount: number; waitPerDescriptorNativeTicks: number };
  };
};
const shootingEvidence = () => parsedNative("shooting-presentations.json") as {
  commonImpact: { timeline: { tileCodes: number[]; waitPerDrawNativeTicks: number } };
};
/** Clips whose original timeline is read from `reverse/parsed/native` rather than generated content. */
const PARSED_EVIDENCE_CLIPS = new Set(["hit", "death", "shoot"]);

type Phase = { readonly draws: number; readonly wait: number };

const LIGHTNING_TIERS = [1, 2, 3, 4] as const;
const LIGHTNING = {
  1: STAGE1_ACTION_PRESENTATION.lightning1,
  2: STAGE1_ACTION_PRESENTATION.lightning2,
  3: STAGE1_ACTION_PRESENTATION.lightning3,
  4: STAGE1_ACTION_PRESENTATION.lightning4,
} as const;

/** What every stage fetches in the HD art style: rest's finish, the map-combat strike and death (`REMAKE-207`). */
const EVERY_STAGE_URLS = ["death", "heal-tail", "hit"].map((clipId) => `/assets/original/map-actions/hd/${clipId}/hd.mp4`);

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
  // `REMAKE-205`: the status techniques as the battle controller plays them (runtime tile states or descriptors)
  "attack-up": () => STAGE1_ACTION_PRESENTATION.attackUp.phases.map((p) => ({ draws: p.runtimeTileCodePairs.length, wait: p.waitPerDrawNativeTicks })),
  "defense-up": () => descriptorPhases(STAGE1_ACTION_PRESENTATION.defenseUp.phases),
  "attack-down": () => descriptorPhases(STAGE1_ACTION_PRESENTATION.attackDown.phases),
  "defense-down": () => descriptorPhases(STAGE1_ACTION_PRESENTATION.defenseDown.phases),
  confusion: () => descriptorPhases(STAGE1_ACTION_PRESENTATION.confusion.phases),
  "spell-seal": () => descriptorPhases(STAGE1_ACTION_PRESENTATION.spellSeal.phases),
  poison: () => {
    const [rise, cloud] = STAGE1_ACTION_PRESENTATION.poison.phases;
    return [
      { draws: rise.runtimeTileCodeStates.length, wait: rise.waitPerDrawNativeTicks },
      { draws: cloud.descriptorSequence.length, wait: cloud.waitPerDrawNativeTicks },
    ];
  },
  dispel: () => STAGE1_ACTION_PRESENTATION.dispel.phases.map((p) => ({ draws: p.runtimeTileCodeStates.length, wait: p.waitPerDrawNativeTicks })),
  // `REMAKE-206`: the recovery presentation 1I-3I share, and one ice cycle every tier replays per ring
  recovery: () => [{
    draws: STAGE1_ACTION_PRESENTATION.recovery1.presentation.descriptorSequence.length,
    wait: STAGE1_ACTION_PRESENTATION.recovery1.presentation.waitPerDrawNativeTicks,
  }],
  ice: () => descriptorPhases([STAGE1_ACTION_PRESENTATION.ice1.cycle]),
  // `REMAKE-207`: the map-combat strike (UN/62, nine draws) and each death (MAGIC/12), as the parsed evidence records them
  hit: () => {
    const { hit } = combatEvidence().mapPresentation;
    return [{ draws: hit.totalGraphicFrames, wait: hit.fixedGraphicWaitNativeTicks / hit.totalGraphicFrames }];
  },
  death: () => {
    const { death } = combatEvidence().mapPresentation;
    return [{ draws: death.descriptorCount, wait: death.waitPerDescriptorNativeTicks }];
  },
  // `REMAKE-208`: UN/60's eight frames between the archer's two blank draws, and WD's ten growth frames
  shoot: () => {
    const { timeline: impact } = shootingEvidence().commonImpact;
    return [{ draws: impact.tileCodes.length - 2, wait: impact.waitPerDrawNativeTicks }];
  },
  wd: () => [{ draws: STAGE1_ACTION_PRESENTATION.wd.finishSteps, wait: STAGE1_ACTION_PRESENTATION.wd.waitPerGrowthOrFinishStepNativeTicks }],
  // `REMAKE-210`: each tier's main phases, its sweep (codes 1..sweepWidth) at the wave pace, and the MAGIC/6 finish all
  // four tiers share; `REMAKE-211`: the marker covers every wave draw (its two frames alternating)
  ...Object.fromEntries(LIGHTNING_TIERS.flatMap((tier) => {
    const { phases, commonHit } = LIGHTNING[tier];
    const wait = commonHit.waitPerWaveDrawNativeTicks;
    return [
      [`lightning-${tier}-main`, () => descriptorPhases(phases)],
      [`lightning-${tier}-hit`, () => [{ draws: commonHit.sweepWidth, wait }]],
      [`lightning-${tier}-marker`, () => [{ draws: commonHit.iterations * commonHit.waveDrawsPerIteration, wait }]],
    ];
  })),
  "lightning-cleanup": () => descriptorPhases([STAGE1_ACTION_PRESENTATION.lightning1.commonHit.cleanup]),
};

function expectOnOriginalTimeline(clip: ReturnType<typeof mapActionHdClips>[number]): void {
  const phases = ORIGINAL[clip.clipId];
  if (!phases) throw new Error(`no original timeline for ${clip.clipId}`);
  const original = timeline(phases());
  expect(clip.durationTicks, clip.clipId).toBe(original.duration);
  expect(clip.frameStartTicks, clip.clipId).toEqual(original.starts);
  // one video frame per native tick, through the afterglow
  expect(clip.video.frames, clip.clipId).toBe(clip.durationTicks + clip.afterglowTicks);
  expect(clip.video.fps, clip.clipId).toBe(100);
}

describe("HD map effects (REMAKE-203 fire, REMAKE-204 heal and rest, REMAKE-205..210 the rest, REMAKE-211 refinements, REMAKE-213 ice shell)", () => {
  it("keeps every clip on its original graphics timeline, with any afterglow after it", () => {
    const ids = mapActionHdClips().map(({ clipId }) => clipId);
    expect(ids).toEqual(expect.arrayContaining(["fire-1", "fire-2", "fire-3", "fire-4", "heal-1", "heal-tail"]));
    for (const clip of mapActionHdClips()) {
      if (clip.still) {
        // `REMAKE-209`: a still has no timeline, the battle moves it like the original picture
        expect([clip.durationTicks, clip.afterglowTicks, clip.video.frames, clip.frameStartTicks], clip.clipId)
          .toEqual([0, 0, 1, [0]]);
        continue;
      }
      // checked in the next case, which needs the parsed evidence
      if (PARSED_EVIDENCE_CLIPS.has(clip.clipId)) continue;
      expectOnOriginalTimeline(clip);
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

  it.skipIf(!PARSED_NATIVE_AVAILABLE)("keeps the strike, death and shot clips on the parsed evidence's timeline (REMAKE-207, REMAKE-208)", () => {
    const clips = mapActionHdClips().filter(({ clipId }) => PARSED_EVIDENCE_CLIPS.has(clipId));
    expect(clips.map(({ clipId }) => clipId).sort()).toEqual([...PARSED_EVIDENCE_CLIPS].sort());
    for (const clip of clips) expectOnOriginalTimeline(clip);
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
      expect(clip.video.source.endsWith(clip.still ? "/hd.png" : "/hd.mp4"), clip.clipId).toBe(true);
      const sideBySide = clip.alphaX > 0;
      expect(sideBySide ? clip.alphaX >= clip.frameWidth : clip.alphaY >= clip.frameHeight, clip.clipId).toBe(true);
      expect(clip.alphaX + clip.frameWidth, clip.clipId).toBeLessThanOrEqual(clip.video.width);
      expect(clip.alphaY + clip.frameHeight, clip.clipId).toBeLessThanOrEqual(clip.video.height);
      expect(clip.scale, clip.clipId).toBe(4);
      expect(clip.originX, clip.clipId).toBeGreaterThan(0);
      // 4L's pillar stops one tile above the struck unit, so its target point lies below the picture; never more
      // than one native map tile (44 px) outside it
      expect(clip.originY, clip.clipId).toBeLessThanOrEqual(clip.frameHeight + 44 * clip.scale);
    }
    expect(mapActionHdClips().find(({ clipId }) => clipId === "lightning-4-main")?.originY)
      .toBeGreaterThan(mapActionHdClips().find(({ clipId }) => clipId === "lightning-4-main")?.frameHeight ?? Infinity);
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
    // 2K builds terrain without a technique graphic: no HD version, nothing to fetch
    expect(mapActionHdUrlsForStyle(["fire-1", "fire-4", "obstacle"], "hd")).toEqual([
      "/assets/original/map-actions/hd/death/hd.mp4",
      "/assets/original/map-actions/hd/fire-1/hd.mp4",
      "/assets/original/map-actions/hd/fire-4/hd.mp4",
      "/assets/original/map-actions/hd/heal-tail/hd.mp4",
      "/assets/original/map-actions/hd/hit/hd.mp4",
    ]);
    // every unit can rest and fight on the map: the finish, the strike and the death are fetched in every stage
    expect(mapActionHdUrlsForStyle([], "hd")).toEqual(EVERY_STAGE_URLS);
    expect(mapActionHdAssetUrlsForActions(["heal-1"])).toEqual([
      "/assets/original/map-actions/hd/heal-1/hd.mp4",
      "/assets/original/map-actions/hd/heal-tail/hd.mp4",
    ]);
    expect(mapActionHdAssetUrlsForActions(["obstacle"])).toEqual([]);
    expect(activeMapActionHdCast("fire-2", "original")).toBeUndefined();
    expect(activeMapActionHdCast("obstacle", "hd")).toBeUndefined();
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
      .toEqual(EVERY_STAGE_URLS);
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

  it("gives the status techniques one clip each; attack-up and magic guard share theirs (REMAKE-205)", () => {
    const phases: Record<string, string> = {
      "attack-up": "statusEffect", "magic-guard": "statusEffect", "defense-up": "statusEffect",
      "attack-down": "statusEffect", "defense-down": "statusEffect", confusion: "statusEffect",
      "spell-seal": "statusEffect", poison: "poisonEffect", dispel: "dispelEffect",
    };
    for (const [actionId, phase] of Object.entries(phases)) {
      expect(mapActionHdSegmentFor(actionId, phase)?.clipId, actionId)
        .toBe(actionId === "magic-guard" ? "attack-up" : actionId);
      // a status technique has no shared finish: its whole cast is its own clip
      expect(mapActionHdCast(actionId)?.length, actionId).toBe(1);
    }
    // the original calls the same presentation for both (`1000:7572`)
    expect(STAGE1_ACTION_PRESENTATION.magicGuard.phases).toEqual(STAGE1_ACTION_PRESENTATION.attackUp.phases);
  });

  it("plays 1I-3I as one recovery clip and replays the ice cycle once per ring (REMAKE-206)", () => {
    for (const actionId of ["recovery-1", "recovery-2", "recovery-3"]) {
      expect(mapActionHdSegmentFor(actionId, "recoveryEffect")?.clipId, actionId).toBe("recovery");
    }
    const ice = mapActionHdClip("ice");
    if (!ice) throw new Error("no HD clip for ice");
    const cycle = ice.frameStartTicks.length;
    for (const [actionId, key] of [["ice-1", "ice1"], ["ice-2", "ice2"], ["ice-3", "ice3"], ["ice-4", "ice4"]] as const) {
      const [segment] = mapActionHdCast(actionId) ?? [];
      // one replay per ring the controller draws (effect radius − 1)
      expect(segment?.repeat, actionId).toBe(STAGE1_ACTION_PRESENTATION[key].cycles);
      expect(STAGE1_ACTION_PRESENTATION[key].cycle, actionId).toEqual(STAGE1_ACTION_PRESENTATION.ice1.cycle);
      if (!segment) continue;
      // the controller's frame runs across every ring; the clip frame wraps at each new ring
      expect(mapActionHdClipFrame(segment, "iceExpansion", 0), actionId).toBe(0);
      expect(mapActionHdClipFrame(segment, "iceExpansion", cycle - 1), actionId).toBe(cycle - 1);
      expect(mapActionHdClipFrame(segment, "iceExpansion", cycle), actionId).toBe(0);
      expect(mapActionHdClipFrame(segment, "iceExpansion", cycle * 2 + 1), actionId).toBe(1);
    }
    const timeline = mapActionHdCastTimeline("ice-2");
    if (!timeline) throw new Error("no ice-2 cast");
    expect(timeline.segments.map(({ startTick, repeat }) => [startTick, repeat]))
      .toEqual([[0, 0], [ice.durationTicks, 1], [ice.durationTicks * 2, 2]]);
    expect(timeline.durationTicks).toBe(ice.durationTicks * 3);
    expect(timeline.endTick).toBe(ice.durationTicks * 3 + ice.afterglowTicks);
    // an earlier ring stops where the next one starts; only the last ring keeps the afterglow
    expect(timeline.segments.map(({ endTick }) => endTick))
      .toEqual([ice.durationTicks, ice.durationTicks * 2, ice.durationTicks * 3 + ice.afterglowTicks]);
    expect(mapActionHdVisibleAt(timeline, ice.durationTicks + 5).map(({ tick, repeat }) => [tick, repeat]))
      .toEqual([[5, 1]]);
  });

  it("plays one strike for the attack and the counter, and one death per dying unit (REMAKE-207)", () => {
    for (const phase of ["primaryHit", "counterHit"]) expect(mapActionHdSegmentFor("map-hit", phase)?.clipId, phase).toBe("hit");
    for (const phase of ["defenderDeath", "attackerDeath", "specialDeath"]) {
      expect(mapActionHdSegmentFor("map-death", phase)?.clipId, phase).toBe("death");
    }
    // the damage drain between them has no HD frame: the strike's afterglow plays over it by itself
    expect(mapActionHdSegmentFor("map-hit", "primaryDamage")).toBeUndefined();
  });

  it("grows 3V's line and WD's path a cell at a time, one video per playing position (REMAKE-208)", () => {
    for (const actionId of ["archer-shot", "crossbow-shot", "water-warrior-shot"]) {
      const segment = mapActionHdSegmentFor(actionId, "shootHit");
      expect([segment?.clipId, segment?.staggered], actionId).toEqual(["shoot", undefined]);
    }
    for (const actionId of ["magic-archer-shot", "virt-a", "virt-b", "virt-c"]) {
      for (const phase of ["shootLineGrow", "shootLineFinish"]) {
        const segment = mapActionHdSegmentFor(actionId, phase);
        expect([segment?.clipId, segment?.staggered], `${actionId} ${phase}`).toEqual(["shoot", true]);
      }
    }
    for (const phase of ["wdGrowth", "wdFinish"]) expect(mapActionHdSegmentFor("wd", phase)?.staggered, phase).toBe(true);
    // every frame can show at once while the line grows, plus the cells parked on the last frame
    expect(mapActionHdInstanceCount("shoot")).toBe(9);
    expect(mapActionHdInstanceCount("wd")).toBe(11);
    expect(mapActionHdInstanceCount("fire-1")).toBe(1);
  });

  it("repaints the stomp's leg and shadow as stills the battle moves (REMAKE-209)", () => {
    for (const tier of [1, 2, 3]) {
      const clips = activeMapActionHdCast(`stomp-${tier}`, "hd")?.clips ?? [];
      expect(clips.map(({ clipId }) => clipId), `stomp-${tier}`).toEqual([1, 2].flatMap((side) =>
        [`stomp-${tier}-side${side}-leg`, `stomp-${tier}-side${side}-shadow`]));
      for (const clip of clips) {
        expect(clip.still, clip.clipId).toBe(true);
        // the origin is the original picture's top-left, inside the frame's margin
        expect(clip.originX % clip.scale, clip.clipId).toBe(0);
        expect(clip.originX, clip.clipId).toBe(clip.originY);
      }
      expect(mapActionHdSegmentFor(`stomp-${tier}`, "stompEffect")).toBeDefined();
      expect(mapActionHdSegmentFor(`stomp-${tier}`, "stompPageToggle")).toBeDefined();
    }
  });

  it("keeps the frozen units' shell as an HD still, fetched with the ice techniques (REMAKE-213)", () => {
    const shell = mapActionHdClip(MAP_ACTION_HD_ICE_SHELL);
    const ice = mapActionHdClip("ice");
    if (!shell || !ice) throw new Error("no HD ice shell or ice clip");
    expect(shell.still).toBe(true);
    expect(shell.scale).toBe(ice.scale);
    // the origin is where the original 40x37 shell tile's top-left lands; the whole tile lies inside the still
    expect(shell.originX).toBeGreaterThanOrEqual(0);
    expect(shell.originY).toBeGreaterThanOrEqual(0);
    expect(shell.originX + 40 * shell.scale).toBeLessThanOrEqual(shell.frameWidth);
    expect(shell.originY + 37 * shell.scale).toBeLessThanOrEqual(shell.frameHeight);
    // every ice tier fetches it with its ring clip; nothing else does
    for (const actionId of ["ice-1", "ice-2", "ice-3", "ice-4"]) {
      expect(mapActionHdAssetUrlsForActions([actionId]), actionId).toEqual([
        "/assets/original/map-actions/hd/ice-shell/hd.png",
        "/assets/original/map-actions/hd/ice/hd.mp4",
      ]);
      // the shell is a state the battle keeps on the map, not part of the cast
      expect(activeMapActionHdCast(actionId, "hd")?.clips.map(({ clipId }) => clipId), actionId).toEqual(["ice"]);
    }
    expect(mapActionHdUrlsForStyle(["fire-1", "recovery-1"], "hd")).not.toContain(shell.video.source);
    expect(mapActionHdUrlsForStyle(["ice-1"], "original")).toEqual([]);
    expect(activeMapActionHdIceShell("original")).toBeUndefined();
    // outside a resource lease every URL counts as available
    expect(activeMapActionHdIceShell("hd")?.clipId).toBe(MAP_ACTION_HD_ICE_SHELL);
  });

  it("plays lightning as a main clip, a staggered sweep, the struck units' marker and the shared finish (REMAKE-210)", () => {
    for (const tier of LIGHTNING_TIERS) {
      const actionId = `lightning-${tier}`;
      expect(activeMapActionHdCast(actionId, "hd")?.clips.map(({ clipId }) => clipId), actionId).toEqual([
        `lightning-${tier}-main`, `lightning-${tier}-hit`, `lightning-${tier}-marker`, "lightning-cleanup",
      ]);
      expect(mapActionHdSegmentFor(actionId, "lightningMain")?.clipId).toBe(`lightning-${tier}-main`);
      const hit = mapActionHdSegmentFor(actionId, "lightningHit");
      expect([hit?.clipId, hit?.staggered], actionId).toEqual([`lightning-${tier}-hit`, true]);
      expect(mapActionHdSegmentFor(actionId, "lightningCleanup")?.clipId).toBe("lightning-cleanup");
      // every sweep frame can show at once while the wave crosses the board, plus the cells parked on the last one
      expect(mapActionHdInstanceCount(`lightning-${tier}-hit`), actionId).toBe(LIGHTNING[tier].commonHit.sweepWidth + 1);
      expect(mapActionHdInstanceCount(`lightning-${tier}-marker`), actionId).toBe(1);
    }
  });

  it("keeps the struck units' marker from the wave's arrival to its end, then lets it fade (REMAKE-211)", () => {
    for (const tier of LIGHTNING_TIERS) {
      const definition = LIGHTNING[tier];
      const { commonHit } = definition;
      const waveDraws = commonHit.iterations * commonHit.waveDrawsPerIteration;
      const marker = mapActionHdClip(`lightning-${tier}-marker`);
      if (!marker) throw new Error(`no lightning-${tier}-marker clip`);
      expect(marker.frameStartTicks.length, `${tier}`).toBe(waveDraws);
      // a struck unit the wave reaches on its first draw, and one at the edge of the range map
      const near = { x: 10, y: 10 };
      const far = { x: 14, y: 10 };
      const effectCells = [{ position: near, value: commonHit.rangeThresholdStart }, { position: far, value: 1 }];
      const farArrives = Math.ceil((commonHit.rangeThresholdStart - 1) / commonHit.rangeThresholdDecrementPerWaveDraw);
      for (let frame = 0; frame < waveDraws; frame += 1) {
        const cells = lightningHdCells({ tier, definition, phase: "wave", frame, center: near, effectCells, hitPositions: [near, far] })
          .filter(({ clipId }) => clipId === marker.clipId);
        // the original only draws it while the sweep band crosses the unit; HD keeps it to the end of the wave
        expect(cells.map(({ x }) => x), `${tier}:${frame}`).toEqual(frame >= farArrives ? [near.x, far.x] : [near.x]);
        // every struck unit shows the wave's own frame: one video, which reaches the clip's last frame with the wave
        expect(cells.map((cell) => cell.frame), `${tier}:${frame}`).toEqual(cells.map(() => frame));
      }
      // that last frame carries the afterglow, so the battle's show lingers under MAGIC/6
      expect(marker.afterglowTicks, `${tier}`).toBeGreaterThan(0);
      expect(mapActionHdFrameSpan(marker, waveDraws - 1)?.limitTick, `${tier}`).toBe(mapActionHdClipEnd(marker));
    }
  });
});
