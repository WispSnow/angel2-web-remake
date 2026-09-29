import { describe, expect, it } from "vitest";
import {
  activateStage20Content,
  STAGE20_ASSETS,
  STAGE20_DEFINITION,
  STAGE20_EVENT_PROGRAM,
  STAGE20_SEMANTIC_DRAGON,
  STAGE20_SEMANTIC_ENEMY_UNITS,
  STAGE20_STORY_PAGES,
} from "../../src/game/content/stage20";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import { stageDialoguePortraitRecords } from "../../src/game/content/portrait-assets";
import type { DialoguePage } from "../../src/game/types";

describe("stage 20 content", () => {
  it("publishes the tower-top deployment, boss objective, and stage-21 route", () => {
    expect(STAGE20_DEFINITION).toMatchObject({
      id: "stage-20",
      nativeStage: 20,
      name: "龍塔頂部",
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 28 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
      },
      deployment: {
        kind: "interactive",
        maximumUnits: 17,
        fixedPlacements: [
          { slot: 32, position: { x: 28, y: 14 } },
          { slot: 0, position: { x: 30, y: 18 } },
          { slot: 24, position: { x: 31, y: 19 } },
        ],
      },
      music: {
        story: "stage-20-story-music",
        playerPhase: "stage-20-player-phase-music",
        enemyPhase: "stage-20-enemy-phase-music",
      },
    });
    expect(STAGE20_DEFINITION.deployment.openCells).toHaveLength(14);
    expect(STAGE20_DEFINITION.deployment.optionalSlots).toHaveLength(20);
    expect(STAGE20_SEMANTIC_ENEMY_UNITS).toHaveLength(16);
    expect(new Set(STAGE20_SEMANTIC_ENEMY_UNITS.map(({ classId }) => classId))).toEqual(
      new Set(["half-dragon-warrior"]),
    );
    expect(STAGE20_SEMANTIC_DRAGON).toMatchObject({
      slot: 28,
      classId: "dragon",
      position: { x: 29, y: 16 },
      name: "妖龍",
      portrait: 66,
    });
    expect(STAGE20_EVENT_PROGRAM.completedRoute).toEqual({
      module: 25, stage: 21, replayPresentation: false,
    });
    expect(STAGE20_EVENT_PROGRAM.stableRemakeDecisions).toEqual([
      "REMAKE-052", "REMAKE-054",
    ]);
    expect(STAGE20_EVENT_PROGRAM.victory.actor).toMatchObject({
      side: 1, slot: 7, nativeClassRecord: 3, name: "琴斯",
    });
    expect(STAGE20_EVENT_PROGRAM.reinforcementAudit).toMatchObject({
      kind: "round-1-tableau-replacement-only",
      laterReinforcements: false,
    });
    expect(STAGE20_EVENT_PROGRAM.reinforcementAudit.auditedSources).toEqual([
      "initial-template",
      "round-event-handler",
      "dynamic-board-catalog",
      "full-round-special-chain",
      "defeat-replacement-and-form-chain",
    ]);
  });

  it("preserves all 104 native dialogue checkpoints and registers story effects", () => {
    activateStage20Content();
    expect(Object.fromEntries(Object.entries(STAGE20_STORY_PAGES).map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-20-prebattle-story": 6,
      "stage-20-contact-story": 9,
      "stage-20-guardian-story": 34,
      "stage-20-opening-story": 7,
      "stage-20-victory-1-story": 5,
      "stage-20-victory-2-story": 11,
      "stage-20-victory-3-story": 17,
      "stage-20-victory-story": 15,
    });
    expect(stageSimulationEffectFor("stage-20-dragon-arrival")).toMatchObject({
      type: "story-reinforcements",
      revealTiming: "after-write",
      actors: [{ id: "2:28", forcedClassId: "dragon", forceSourceId: "2:55" }],
    });
    expect(stageSimulationEffectFor("stage-20-kins-arrival")).toMatchObject({
      type: "story-reinforcements",
      actors: [{
        id: "1:7",
        name: "琴斯",
        forcedClassId: "magic-priest",
        forcedExperience: 299,
        forceSourceId: "1:0",
      }],
    });
    expect(stageSimulationEffectFor("stage-20-route-to-stage-21")).toEqual({
      type: "campaign-route", destination: "stage-21",
    });
    expect(STAGE20_ASSETS).toMatchObject({
      map: "/assets/original/stage20-map.png",
      minimap: "/assets/original/stage20-minimap.png",
      storyBackground: "/assets/original/story-stage20-background.svg",
    });
  });

  it("shows the Dragon King statue while SAY/0074 narrates its transformation", () => {
    // SAY/0074 lines 5–19 raise records 56 and 67 with HU and never open WU, so
    // the statue must stay on screen above the narration window.
    const victory: readonly DialoguePage[] = STAGE20_STORY_PAGES["stage-20-victory-3-story"];
    expect(victory.slice(0, 4).map(({ upper }) => ({ portrait: upper?.portrait, speaker: upper?.speaker })))
      .toEqual([
        { portrait: 56, speaker: "龍王" },
        { portrait: 56, speaker: "龍王" },
        { portrait: 67, speaker: "龍王" },
        { portrait: 67, speaker: "龍王" },
      ]);
  });

  it("flickers the statue between D/56 and D/67 on SAY/0074's shortening DL waits", () => {
    // Lines 11–43 run `DL 9,9,8,8,7,7,6,6,5,5,4`, each followed by `HU`, between
    // KY 2 and KY 3; `D3B6` counts every wait from the end of the previous one.
    const victory: readonly DialoguePage[] = STAGE20_STORY_PAGES["stage-20-victory-3-story"];
    const flicker = victory[2];
    expect(flicker).toMatchObject({
      activeSlot: "lower",
      source: { record: 74, wait: 3, address: "SAY/0074:44" },
      // Nothing new to type: the narration read on KY 2 simply stays up.
      revealStart: victory[1].lower?.text?.length,
      lower: { text: victory[1].lower?.text },
    });
    const cues = flicker.upper?.timedPortraitCues ?? [];
    expect(cues.map(({ portrait }) => portrait))
      .toEqual([56, 67, 56, 67, 56, 67, 56, 67, 56, 67, 56, 67]);
    expect(cues.slice(1).map(({ tick }, index) => tick - cues[index].tick))
      .toEqual([9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4]);
    // D/67 has no metadata, so the original keeps D/56's nameplate throughout.
    expect(new Set(cues.map(({ speaker }) => speaker))).toEqual(new Set(["龍王"]));
    expect(flicker.lower?.timedPortraitCues).toBeUndefined();
    // Every other stage 20 page stays untimed, and both faces cross the stage gate.
    expect(Object.values(STAGE20_STORY_PAGES).flat()
      .filter(({ upper, lower }) => upper?.timedPortraitCues ?? lower?.timedPortraitCues)).toEqual([flicker]);
    expect(stageDialoguePortraitRecords(STAGE20_DEFINITION)).toEqual(expect.arrayContaining([56, 67]));
  });
});
