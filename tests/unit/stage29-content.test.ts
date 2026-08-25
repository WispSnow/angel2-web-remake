import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage29Content,
  STAGE29,
  STAGE29_ASSETS,
  STAGE29_CONTENT_IDENTITY,
  STAGE29_DEFINITION,
  STAGE29_DEPLOYMENT_ACTORS,
  STAGE29_EVENT_PROGRAM,
  STAGE29_MUSIC_PROGRAMS,
  STAGE29_SEMANTIC_ALLIED_UNITS,
  STAGE29_SEMANTIC_ENEMY_UNITS,
  STAGE29_SOURCES,
  STAGE29_STORY_PAGES,
  STAGE29_TERRAIN_TOKENS,
} from "../../src/game/content/stage29";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 29 generated content", () => {
  it("defines the 1–15 unit castle assault and keeps deployment and battle identities separate", () => {
    const identityHash = createHash("sha256");
    identityHash.update("stableRemake\0REMAKE-069\0REMAKE-070\0");
    for (const source of STAGE29_SOURCES) {
      identityHash.update(`${source.path}\0${source.sha256}\n`);
    }
    expect(STAGE29_CONTENT_IDENTITY)
      .toBe(`stage-29/evidence-${identityHash.digest("hex")}`);
    expect(STAGE29_CONTENT_IDENTITY).toMatch(/^stage-29\/evidence-[a-f0-9]{64}$/u);
    expect(STAGE29).toMatchObject({
      id: "stage-29",
      nativeStage: 29,
      name: "騎士城堡前",
      viewport: {
        initialOrigin: { x: 36, y: 23 },
        originBounds: { max: { x: 36 } },
      },
    });
    expect(STAGE29.viewport.initialOrigin.x).toBeLessThanOrEqual(STAGE29.viewport.originBounds.max.x);
    expect(STAGE29.viewport.initialOrigin.y).toBeLessThanOrEqual(STAGE29.viewport.originBounds.max.y);
    expect(STAGE29_DEFINITION).toMatchObject({
      objective: {
        victory: { type: "eliminate-side", side: 2 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗所有的敵人",
        defeatText: "「妮雅」戰敗",
      },
      deployment: {
        kind: "interactive",
        fixedPlacements: [{ slot: 0, position: { x: 41, y: 26 } }],
        maximumUnits: 15,
      },
      stories: {
        prebattle: "stage-29-prebattle-story",
        roundStarts: [],
      },
    });
    expect(STAGE29_DEFINITION.deployment.eligibleSlots).toHaveLength(30);
    expect(STAGE29_DEFINITION.deployment.optionalSlots).toHaveLength(29);
    expect(STAGE29_DEFINITION.deployment.openCells).toHaveLength(14);
    expect(STAGE29_TERRAIN_TOKENS).toHaveLength(2500);

    expect(STAGE29_DEPLOYMENT_ACTORS.find(({ slot }) => slot === 22)).toEqual({
      slot: 22,
      portraitRecord: 255,
      normalizedName: "愛莉歐拉",
    });
    const slot22BattleIdentity = STAGE29_SEMANTIC_ALLIED_UNITS.find(({ slot }) => slot === 22);
    expect(slot22BattleIdentity).toMatchObject({
      slot: 22,
      name: "愛莉歐拉",
      displayIdentity: "named-class-portrait",
      aiBehavior: 0,
      untouchedExperience: 0,
    });
    expect(slot22BattleIdentity).not.toHaveProperty("portrait");
  });

  it("defines exactly 15 static enemies and keeps only Eschero's named identity", () => {
    expect(STAGE29_SEMANTIC_ENEMY_UNITS).toHaveLength(15);
    expect(STAGE29_SEMANTIC_ENEMY_UNITS.find(({ slot }) => slot === 4)).toMatchObject({
      slot: 4,
      classId: "demon-dragon-knight",
      position: { x: 40, y: 13 },
      name: "艾西柯羅",
      portrait: 6,
      aiBehavior: 0,
    });
    expect(STAGE29_SEMANTIC_ENEMY_UNITS.filter(({ slot }) => slot !== 4))
      .toSatisfy((units: typeof STAGE29_SEMANTIC_ENEMY_UNITS) =>
        units.every((unit) => !("portrait" in unit)));
    const enemyClassCounts = STAGE29_SEMANTIC_ENEMY_UNITS.reduce<Record<string, number>>(
      (counts, { classId }) => ({ ...counts, [classId]: (counts[classId] ?? 0) + 1 }),
      {},
    );
    expect(enemyClassCounts).toEqual({
      "magic-archer": 5,
      "evil-mage": 5,
      "demon-dragon-knight": 1,
      "swift-dragon-knight": 4,
    });
    expect(STAGE29_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 2)).toHaveLength(5);
    expect(STAGE29_SEMANTIC_ENEMY_UNITS.filter(({ aiBehavior }) => aiBehavior === 0)).toHaveLength(10);
  });

  it("registers only SAY/56 before deployment and the default stage-30 route", () => {
    activateStage29Content();
    expect(Object.fromEntries(Object.entries(STAGE29_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-29-prebattle-story": 7,
    });
    expect(STAGE29_STORY_PAGES["stage-29-prebattle-story"][0]?.lower?.text)
      .toContain("將戰場推進至騎士團堡");
    expect(STAGE29_STORY_PAGES["stage-29-prebattle-story"][5]?.upper?.text)
      .toContain("艾西柯羅");
    expect(stageSimulationEffectFor("stage-29-enter-deployment"))
      .toEqual({ type: "enter-deployment" });
    expect(stageSimulationEffectFor("stage-29-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-29-route-to-stage-30"))
      .toEqual({ type: "campaign-route", destination: "stage-30" });
  });

  it("records handler absence and the five-channel no-generation audit", () => {
    expect(STAGE29_EVENT_PROGRAM).toMatchObject({
      prebattleStoryRecord: 56,
      prebattleBackgroundRecord: 23,
      prebattleMusicRecord: 77,
      nativeHandler: null,
      openingStoryRecord: null,
      victoryStoryRecord: null,
      enemyReinforcements: { kind: "none", initialSide2: 15 },
      completedRoute: { module: 25, stage: 30, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-069", "REMAKE-070"],
    });
    expect(STAGE29_EVENT_PROGRAM.enemyReinforcements.auditedSources).toEqual([
      "initial-template", "round-event-handler", "dynamic-board-catalog",
      "full-round-special-chain", "defeat-replacement-and-form-chain",
    ]);
  });

  it("registers native story and phase music", () => {
    activateStage29Content();
    expect(STAGE29_MUSIC_PROGRAMS["stage-29-story-music"])
      .toMatchObject({ track: "MAGIC/77" });
    expect(STAGE29_MUSIC_PROGRAMS["stage-29-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/35", loopTrack: "MUSIC/34" });
    expect(STAGE29_MUSIC_PROGRAMS["stage-29-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/13", loopTrack: "MUSIC/12" });
    expect(musicProgramFor("stage-29-player-phase-music"))
      .toBe(STAGE29_MUSIC_PROGRAMS["stage-29-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE29_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE29_ASSETS.map,
      STAGE29_ASSETS.minimap,
      STAGE29_ASSETS.storyBackground,
      ...Object.values(STAGE29_ASSETS.unitSprites),
      ...Object.values(STAGE29_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
