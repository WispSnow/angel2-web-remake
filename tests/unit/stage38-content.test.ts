import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { className } from "../../src/game/content/classes";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage38Content,
  STAGE38,
  STAGE38_ASSETS,
  STAGE38_DEFINITION,
  STAGE38_EVENT_PROGRAM,
  STAGE38_MUSIC_PROGRAMS,
  STAGE38_SEMANTIC_ALLIED_UNITS,
  STAGE38_SEMANTIC_ENEMY_UNITS,
  STAGE38_SOURCES,
  STAGE38_STORY_PAGES,
  STAGE38_TERRAIN_TOKENS,
} from "../../src/game/content/stage38";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 38 generated content", () => {
  it("defines the native two-fixed-plus-eighteen deployment against 44 enemies", () => {
    expect(STAGE38).toMatchObject({
      id: "stage-38",
      nativeStage: 38,
      name: "異世界",
      viewport: { initialOrigin: { x: 24, y: 24 } },
    });
    expect(STAGE38_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
      },
      deployment: {
        fixedPlacements: [
          { slot: 0, position: { x: 29, y: 21 } },
          { slot: 1, position: { x: 30, y: 21 } },
        ],
        maximumUnits: 20,
      },
    });
    expect(STAGE38_DEFINITION.deployment.openCells).toHaveLength(18);
    expect(STAGE38_SEMANTIC_ALLIED_UNITS).toHaveLength(29);
    expect(STAGE38_SEMANTIC_ENEMY_UNITS).toHaveLength(44);
    expect(STAGE38_SEMANTIC_ENEMY_UNITS).toContainEqual(expect.objectContaining({
      slot: 52,
      classId: "beast-knight",
      position: { x: 25, y: 26 },
      aiBehavior: 0,
    }));
    expect(STAGE38_SEMANTIC_ENEMY_UNITS
      .filter((unit) => unit.name !== className(unit.classId))
      .map(({ slot, name, portrait }) => ({ slot, name, portrait }))
      .sort((left, right) => left.slot - right.slot)).toEqual([
        { slot: 2, name: "葛蒂拉斯", portrait: 0 },
        { slot: 3, name: "庫安梅伊", portrait: 12 },
        { slot: 4, name: "艾西柯羅", portrait: 6 },
        { slot: 5, name: "菲伊魯茵", portrait: 25 },
        { slot: 6, name: "芙瑪羅妮", portrait: 11 },
        { slot: 7, name: "蕾娜吉芙", portrait: 24 },
        { slot: 15, name: "哈釘", portrait: 15 },
        { slot: 16, name: "娜米", portrait: 20 },
        { slot: 17, name: "梅蒂", portrait: 16 },
        { slot: 18, name: "萊莉", portrait: 19 },
        { slot: 19, name: "西艾蕾", portrait: 5 },
        { slot: 20, name: "克諾絲", portrait: 4 },
        { slot: 21, name: "麗蘭特", portrait: 28 },
        { slot: 22, name: "菲尼雅", portrait: 29 },
        { slot: 23, name: "阿莉絲", portrait: 30 },
        { slot: 24, name: "瑪西爾", portrait: 31 },
      ]);
    expect(STAGE38_TERRAIN_TOKENS).toHaveLength(2500);
  });

  it("ships the matching enemy map figure for every stage 38 class", () => {
    const enemyClasses = new Set(STAGE38_SEMANTIC_ENEMY_UNITS.map(({ classId }) => classId));
    for (const classId of enemyClasses) {
      expect(STAGE38_ASSETS.unitSprites).toHaveProperty(`enemy-${classId}`);
    }
    expect([
      className("magic-archer"),
      className("swift-dragon-knight"),
      className("great-dragon-knight"),
    ]).toEqual(["魔弓兵", "迅龍騎士", "巨龍騎士"]);
  });

  it("closes all five reinforcement channels and routes only to module 46", () => {
    expect(STAGE38_EVENT_PROGRAM).toMatchObject({
      openingStoryRecord: 164,
      openingFocus: {
        portraitRecord: 46,
        actor: { side: 1, slot: 0 },
        staticEnemiesPresentBeforeStory: true,
      },
      victoryStoryRecord: 165,
      enemyReinforcements: { kind: "none", initialSide2: 44 },
      completedRoute: { module: 46, stage: 39, presentationReplayed: false },
      stableRemakeDecisions: ["REMAKE-087"],
    });
    expect(STAGE38_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers SAY/0164, SAY/0165, native music, and the credits route", () => {
    activateStage38Content();
    expect(STAGE38_STORY_PAGES["stage-38-opening-story"]).toHaveLength(25);
    expect(STAGE38_STORY_PAGES["stage-38-victory-story"]).toHaveLength(15);
    expect(stageSimulationEffectFor("stage-38-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-38-focus-nia"))
      .toEqual({ type: "focus-actor", actor: { side: 1, slot: 0 } });
    expect(stageSimulationEffectFor("stage-38-route-to-credits"))
      .toEqual({ type: "campaign-route", destination: "stage-39" });
    expect(STAGE38_MUSIC_PROGRAMS["stage-38-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/33", loopTrack: "MUSIC/32" });
    expect(STAGE38_MUSIC_PROGRAMS["stage-38-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/5", loopTrack: "MUSIC/4" });
    expect(musicProgramFor("stage-38-player-phase-music"))
      .toBe(STAGE38_MUSIC_PROGRAMS["stage-38-player-phase-music"]);
  });

  it("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE38_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE38_ASSETS.map,
      STAGE38_ASSETS.minimap,
      ...Object.values(STAGE38_ASSETS.unitSprites),
      ...Object.values(STAGE38_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
