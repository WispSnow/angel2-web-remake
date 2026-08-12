import { describe, expect, it } from "vitest";
import {
  activateStage21Content,
  STAGE21_ASSETS,
  STAGE21_DEFINITION,
  STAGE21_EVENT_PROGRAM,
  STAGE21_SEMANTIC_SCOUTS,
  STAGE21_STORY_PAGES,
} from "../../src/game/content/stage21";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import type { DialoguePage } from "../../src/game/types";

describe("stage 21 content", () => {
  it("publishes the noninteractive four-scout interlude and stage-22 route", () => {
    expect(STAGE21_DEFINITION).toMatchObject({
      id: "stage-21",
      nativeStage: 21,
      name: "焦土森林村莊外",
      deployment: { kind: "fixed" },
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
      },
      music: {
        story: "stage-21-story-music",
        playerPhase: "stage-21-player-phase-music",
        enemyPhase: "stage-21-enemy-phase-music",
      },
    });
    expect(STAGE21_SEMANTIC_SCOUTS).toEqual([
      expect.objectContaining({ slot: 0, name: "妮雅", portrait: 46, source: { x: 42, y: 25 }, destination: { x: 28, y: 41 } }),
      expect.objectContaining({ slot: 1, name: "希蜜", portrait: 45, source: { x: 43, y: 24 }, destination: { x: 30, y: 42 } }),
      expect.objectContaining({ slot: 24, name: "葛蒂拉斯", portrait: 0, source: { x: 41, y: 24 }, destination: { x: 28, y: 40 } }),
      expect.objectContaining({ slot: 8, name: "蘇蘭達", portrait: 10, source: { x: 40, y: 26 }, destination: { x: 27, y: 42 } }),
    ]);
    expect(STAGE21_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: 42,
      roundOneStoryRecords: [43, 44],
      movementBudget: 50,
      skipOrdinaryVictoryAndSavePrompt: true,
      completedRoute: { module: 27, stage: 22, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-055"],
      reinforcementAudit: {
        kind: "round-1-four-scout-interlude",
        initialSide1: 0,
        initialSide2: 0,
        spawnedSide1Slots: [0, 1, 24, 8],
        spawnedSide2Slots: [],
        laterReinforcements: false,
      },
    });
    expect(STAGE21_EVENT_PROGRAM.reinforcementAudit.auditedSources).toEqual([
      "initial-template",
      "round-event-handler",
      "dynamic-board-catalog",
      "full-round-special-chain",
      "defeat-replacement-and-form-chain",
    ]);
  });

  it("preserves all 21 dialogue checkpoints and registers the scripted chain", () => {
    activateStage21Content();
    expect(Object.fromEntries(Object.entries(STAGE21_STORY_PAGES).map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-21-prebattle-story": 4,
      "stage-21-scouting-story": 14,
      "stage-21-discovery-story": 3,
    });
    expect(stageSimulationEffectFor("stage-21-scouts-arrive")).toMatchObject({
      type: "story-reinforcements",
      revealTiming: "native-before-write",
      // No side phase is ever reached, so the native 80h action bit stays clear.
      actionSpent: false,
      focusPortrait: 46,
      actors: [
        { id: "1:0", name: "妮雅" },
        { id: "1:1", name: "希蜜" },
        { id: "1:24", name: "葛蒂拉斯" },
        { id: "1:8", name: "蘇蘭達" },
      ],
    });
    expect(stageSimulationEffectFor("stage-21-route-to-stage-22")).toEqual({
      type: "campaign-route", destination: "stage-22",
    });
    expect(STAGE21_ASSETS).toMatchObject({
      map: "/assets/original/stage21-map.png",
      minimap: "/assets/original/stage21-minimap.png",
      storyBackgrounds: { 16: "/assets/original/story-stage21-background-16.png" },
    });
  });

  it("keeps each named scout's portrait on screen while SAY/0043 calls the roll", () => {
    // SAY/0043 lines 38–57 show 希蜜/葛蒂拉斯/蘇蘭達/黛西 with HD and no WD, so the
    // lower slot must carry a portrait with no text window at those checkpoints.
    const scouting: readonly DialoguePage[] = STAGE21_STORY_PAGES["stage-21-scouting-story"];
    const rollCall = scouting.slice(7, 12);
    expect(rollCall.map(({ lower }) => lower)).toEqual([
      { portrait: 45, speaker: "希蜜" },
      { portrait: 0, speaker: "葛蒂拉斯" },
      { portrait: 10, speaker: "蘇蘭達" },
      { portrait: 10, speaker: "蘇蘭達" },
      { portrait: 43, speaker: "黛西" },
    ]);
    for (const page of rollCall) {
      expect(page.activeSlot).toBe("upper");
      expect(page.lower?.text).toBeUndefined();
      expect(page.upper?.text).toBeDefined();
    }
  });

  it("declares a viewport origin the camera clamp can actually honour", () => {
    const { initialOrigin, originBounds } = STAGE21_DEFINITION.viewport;
    expect(initialOrigin.x).toBeGreaterThanOrEqual(originBounds.min.x);
    expect(initialOrigin.x).toBeLessThanOrEqual(originBounds.max.x);
    expect(initialOrigin.y).toBeGreaterThanOrEqual(originBounds.min.y);
    expect(initialOrigin.y).toBeLessThanOrEqual(originBounds.max.y);
    for (const { destination } of STAGE21_SEMANTIC_SCOUTS) {
      expect(destination.x).toBeGreaterThanOrEqual(initialOrigin.x);
      expect(destination.x).toBeLessThan(initialOrigin.x + STAGE21_DEFINITION.viewport.width);
      expect(destination.y).toBeGreaterThanOrEqual(initialOrigin.y);
      expect(destination.y).toBeLessThan(initialOrigin.y + STAGE21_DEFINITION.viewport.height);
    }
  });
});
