import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage36Content,
  STAGE36,
  STAGE36_ASSETS,
  STAGE36_DEFINITION,
  STAGE36_EVENT_PROGRAM,
  STAGE36_MUSIC_PROGRAMS,
  STAGE36_SEMANTIC_ALLIED_UNITS,
  STAGE36_SEMANTIC_ENEMY_UNITS,
  STAGE36_SOURCES,
  STAGE36_STORY_PAGES,
  STAGE36_TERRAIN_TOKENS,
} from "../../src/game/content/stage36";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 36 generated content", () => {
  it("defines the native twenty-eight-versus-thirty otherworld board", () => {
    expect(STAGE36).toMatchObject({
      id: "stage-36",
      nativeStage: 36,
      name: "異世界的碧娜維姬",
      viewport: { initialOrigin: { x: 20, y: 23 } },
    });
    expect(STAGE36_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 1 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗「碧娜維姬」",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        kind: "interactive",
        fixedPlacements: [{ slot: 0, position: { x: 24, y: 27 } }],
        maximumUnits: 28,
      },
    });
    expect(STAGE36_DEFINITION.deployment.optionalSlots).toHaveLength(28);
    expect(STAGE36_DEFINITION.deployment.openCells).toHaveLength(27);
    expect(STAGE36_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE36_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE36_SEMANTIC_ALLIED_UNITS.map(({ slot }) => Number(slot)))
      .not.toEqual(expect.arrayContaining([22, 23, 24]));

    expect(STAGE36_SEMANTIC_ENEMY_UNITS).toHaveLength(30);
    expect(STAGE36_SEMANTIC_ENEMY_UNITS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slot: 1,
        classId: "wizard",
        name: "碧娜維姬",
        portrait: 8,
        position: { x: 23, y: 13 },
        aiBehavior: 1,
      }),
      expect.objectContaining({ slot: 32, classId: "prayer-guide", aiBehavior: 0 }),
      expect.objectContaining({ slot: 53, classId: "demon-dragon-knight", aiBehavior: 2 }),
      expect.objectContaining({ slot: 58, classId: "bone-knight", aiBehavior: 2 }),
    ]));
    expect(STAGE36_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 0)).toHaveLength(5);
    expect(STAGE36_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 1)).toHaveLength(1);
    expect(STAGE36_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 2)).toHaveLength(24);
  });

  it("registers SAY/0080, ordinary victory feedback, and the frozen stage 37 route", () => {
    activateStage36Content();
    expect(Object.fromEntries(Object.entries(STAGE36_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-36-opening-story": 10,
    });
    expect(STAGE36_STORY_PAGES["stage-36-opening-story"][0]?.lower?.text)
      .toContain("碧娜維姬");
    expect(STAGE36_STORY_PAGES["stage-36-opening-story"][5]?.upper?.text)
      .toContain("黑魔石");
    expect(STAGE36_STORY_PAGES["stage-36-opening-story"][9]?.lower?.text)
      .toContain("我們會阻止妳");
    expect(stageSimulationEffectFor("stage-36-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-36-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-36-route-to-stage-37"))
      .toEqual({ type: "campaign-route", destination: "stage-37" });
  });

  it("records five audited channels with no reinforcement producer", () => {
    expect(STAGE36_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: null,
      unusedPrebattleMusicRecord: 76,
      openingStoryRecord: 80,
      victoryStoryRecord: null,
      enemyReinforcements: { kind: "none", initialSide2: 30 },
      enemyBehaviorGroups: {
        sentry: [1],
        default: [32, 33, 31, 30, 34],
      },
      completedRoute: { module: 27, stage: 37, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-078"],
    });
    expect(STAGE36_EVENT_PROGRAM.enemyBehaviorGroups.gatedPursuit).toHaveLength(24);
    expect(STAGE36_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers the native phase music", () => {
    activateStage36Content();
    expect(STAGE36_MUSIC_PROGRAMS["stage-36-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/19", loopTrack: "MUSIC/18" });
    expect(STAGE36_MUSIC_PROGRAMS["stage-36-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/13", loopTrack: "MUSIC/12" });
    expect(musicProgramFor("stage-36-player-phase-music"))
      .toBe(STAGE36_MUSIC_PROGRAMS["stage-36-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE36_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE36_ASSETS.map,
      STAGE36_ASSETS.minimap,
      ...Object.values(STAGE36_ASSETS.unitSprites),
      ...Object.values(STAGE36_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
