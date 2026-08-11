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

describe("stage 20 content", () => {
  it("publishes the tower-top deployment, boss objective, and frozen stage-21 route", () => {
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
        forcedExperience: 0,
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
});
