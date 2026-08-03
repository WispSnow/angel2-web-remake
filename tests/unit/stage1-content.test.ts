import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STAGE1_ACTION_PRESENTATION } from "../../src/game/content/stage1-actions.generated";
import {
  STAGE1_ASSETS,
  STAGE1_DEFINITION,
  STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
  STAGE1_DEPLOYMENT_UI,
  STAGE1_EVENT_PROGRAM,
  STAGE1_MUSIC_PROGRAMS,
  STAGE1_SEMANTIC_CLASS_OVERRIDES,
  STAGE1_SEMANTIC_ENEMY_UNITS,
  STAGE1_SOURCES,
  STAGE1_STORY_PAGES,
  STAGE1_STABLE_AI,
  STAGE1_TERRAIN_TOKENS,
  STAGE1_TOKEN_TO_TERRAIN_SLOT,
  activateStage1Content,
  stage1StoryPagesForId,
  stage1TerrainSlotAt,
} from "../../src/game/content/stage1";
import { RUNTIME_STAGE_DEFINITIONS, isRuntimeStageId } from "../../src/game/content/stages";
import { storyPagesForId } from "../../src/game/content/dialogue";
import { musicProgramFor } from "../../src/game/content/music";
import { DEPLOYMENT_FEEDBACK_TEXT, createDeploymentState } from "../../src/game/simulation/deployment";

const workspace = path.resolve(import.meta.dirname, "../..");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

describe("stage 1 generated content", () => {
  it("preserves the native initial-lightning cloud pass and full presentation boundary", () => {
    const lightning = STAGE1_ACTION_PRESENTATION.lightning1;
    expect(lightning.phases[0].anchorOffsetSequence).toEqual(
      Array.from({ length: 8 }, (_, index) => ({ x: 8 - index, y: 8 - index })),
    );
    expect(lightning.phases[2].anchorOffsetSequence).toEqual(
      Array.from({ length: 8 }, (_, index) => ({ x: -(index + 1), y: -(index + 1) })),
    );
    expect(lightning.phases.map(({ drawCount }) => drawCount)).toEqual([8, 16, 8]);
    expect(lightning.commonHit).toMatchObject({
      rangeMapMaximumMinusOne: 2,
      sweepWidth: 9,
      iterations: 11,
      waveDrawsPerIteration: 2,
      rangeWaveFixedGraphicWaitNativeTicks: 44,
      cleanup: { drawCount: 5, fixedGraphicWaitNativeTicks: 50 },
    });
    expect(lightning.fixedGraphicWaitNativeTicks).toBe(414);
  });

  it("assembles and registers the runnable stable definition", () => {
    expect(RUNTIME_STAGE_DEFINITIONS["stage-01"]).toBe(STAGE1_DEFINITION);
    expect(isRuntimeStageId("stage-01")).toBe(true);
    expect(STAGE1_DEFINITION).toMatchObject({
      id: "stage-01",
      nativeStage: 1,
      name: "騎士城堡前",
      width: 50,
      height: 50,
      viewport: { width: 10, height: 7, initialOrigin: { x: 18, y: 33 } },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 16 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
        victoryText: "打敗敵人首領「芳」",
        defeatText: "「妮雅」戰敗",
      },
      music: {
        story: "stage-01-story-music",
        playerPhase: "stage-01-player-phase-music",
        enemyPhase: "stage-01-enemy-phase-music",
      },
    });
    expect(STAGE1_DEFINITION.contentIdentity).toMatch(/^stage-01\/evidence-[a-f0-9]{64}$/u);
    expect(STAGE1_DEFINITION.events.map(({ id }) => id)).toEqual([
      "stage-01-prebattle-story",
      "stage-01-enter-deployment",
      "stage-01-opening-story",
      "stage-01-boss-defeated",
      "stage-01-messenger-arrival",
      "stage-01-completed-route",
    ]);
    expect(STAGE1_STABLE_AI).toEqual({
      pursuitGroup: { id: "forward-patrol", slots: [45, 46] },
      alertGroup: {
        id: "castle-guard",
        slots: [40, 41, 42, 43],
        trigger: "damage-this-turn",
      },
      commander: { slot: 16, pursuitDelayRounds: 1 },
    });
  });

  it("decodes the complete terrain and evidence-backed deployment", () => {
    expect(STAGE1_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE1_TOKEN_TO_TERRAIN_SLOT).toHaveLength(128);
    expect(new Set(STAGE1_TERRAIN_TOKENS).size).toBe(91);
    expect(stage1TerrainSlotAt({ x: 25, y: 16 })).toBeGreaterThan(0);
    expect(stage1TerrainSlotAt({ x: -1, y: 0 })).toBe(0);

    const deployment = STAGE1_DEFINITION.deployment;
    expect(deployment.kind).toBe("interactive");
    if (deployment.kind !== "interactive") throw new Error("expected interactive deployment");
    const state = createDeploymentState(deployment, deployment.eligibleSlots);
    expect(state.placements).toEqual([
      { slot: 42, position: { x: 19, y: 33 }, fixed: true },
      { slot: 40, position: { x: 27, y: 33 }, fixed: true },
      { slot: 43, position: { x: 19, y: 34 }, fixed: true },
      { slot: 41, position: { x: 27, y: 34 }, fixed: true },
      { slot: 0, position: { x: 22, y: 36 }, fixed: true },
    ]);
    expect(state.currentOpenCell).toEqual({ x: 21, y: 33 });
    expect(deployment.maximumUnits).toBe(8);
  });

  it("preserves generated roster, UI text, event, and music evidence", () => {
    expect(STAGE1_DEPLOYMENT_PREVIEW_ROSTER.map(({ slot, name, portrait, classId }) => ({
      slot,
      name,
      portrait,
      classId,
    }))).toEqual([
      { slot: 0, name: "妮雅", portrait: 46, classId: "soldier" },
      { slot: 1, name: "希蜜", portrait: 45, classId: "soldier" },
      { slot: 2, name: "蒙欣曼", portrait: 42, classId: "soldier" },
      { slot: 4, name: "拉朵那", portrait: 44, classId: "soldier" },
      { slot: 24, name: "葛蒂拉斯", portrait: 0, classId: "magician" },
      { slot: 40, name: "士兵", portrait: 47, classId: "soldier" },
      { slot: 41, name: "士兵", portrait: 47, classId: "soldier" },
      { slot: 42, name: "士兵", portrait: 47, classId: "soldier" },
      { slot: 43, name: "士兵", portrait: 47, classId: "soldier" },
    ]);
    expect(STAGE1_SEMANTIC_CLASS_OVERRIDES).toEqual([{ slot: 24, classId: "magician" }]);
    expect(STAGE1_SEMANTIC_ENEMY_UNITS.map(({ slot, classId, name, portrait, aiBehavior, position }) => ({
      slot,
      classId,
      name,
      portrait,
      aiBehavior,
      position,
    }))).toEqual([
      { slot: 40, classId: "soldier", name: "騎士團士兵", portrait: 48, aiBehavior: 2, position: { x: 22, y: 14 } },
      { slot: 41, classId: "soldier", name: "騎士團士兵", portrait: 48, aiBehavior: 2, position: { x: 28, y: 14 } },
      { slot: 43, classId: "sister", name: "騎士團修女", portrait: 49, aiBehavior: 2, position: { x: 23, y: 16 } },
      { slot: 16, classId: "cavalry", name: "芳", portrait: 34, aiBehavior: 1, position: { x: 25, y: 16 } },
      { slot: 42, classId: "sister", name: "騎士團修女", portrait: 49, aiBehavior: 2, position: { x: 27, y: 16 } },
      { slot: 45, classId: "soldier", name: "騎士團士兵", portrait: 48, aiBehavior: 0, position: { x: 24, y: 18 } },
      { slot: 46, classId: "soldier", name: "騎士團士兵", portrait: 48, aiBehavior: 0, position: { x: 26, y: 18 } },
    ]);
    expect(STAGE1_DEPLOYMENT_UI.feedbackText).toMatchObject({
      emptyRosterEntry: DEPLOYMENT_FEEDBACK_TEXT["empty-slot"],
      capacityReached: DEPLOYMENT_FEEDBACK_TEXT.full,
      fixedUnit: DEPLOYMENT_FEEDBACK_TEXT["fixed-unit"],
    });
    expect(STAGE1_DEPLOYMENT_UI.columns.map(({ pointerX }) => pointerX)).toEqual([57, 201, 345, 440, 540]);
    expect(STAGE1_EVENT_PROGRAM).toEqual({
      openingStoryRecord: 5,
      messenger: {
        side: 1,
        slot: 48,
        from: { x: 35, y: 35 },
        targetPortrait: 46,
        movementMode: "FM",
        movementBudget: 50,
        storyRecord: 6,
      },
      completedRoute: { module: 27, stage: 2, replayPresentation: false },
    });
    expect(STAGE1_MUSIC_PROGRAMS["stage-01-story-music"].track).toBe("MAGIC/72");
    expect(STAGE1_MUSIC_PROGRAMS["stage-01-player-phase-music"]).toMatchObject({
      entryTrack: "MUSIC/11",
      loopTrack: "MUSIC/10",
    });
    expect(STAGE1_MUSIC_PROGRAMS["stage-01-enemy-phase-music"]).toMatchObject({
      entryTrack: "MUSIC/27",
      loopTrack: "MUSIC/26",
    });
  });

  it("compiles every native KY checkpoint without hand-copying the story", () => {
    expect(STAGE1_STORY_PAGES["stage-01-prebattle-story"]).toHaveLength(13);
    expect(STAGE1_STORY_PAGES["stage-01-opening-story"]).toHaveLength(5);
    expect(STAGE1_STORY_PAGES["stage-01-victory-story"]).toHaveLength(12);
    expect(stage1StoryPagesForId("stage-01-opening-story")).toBe(
      STAGE1_STORY_PAGES["stage-01-opening-story"],
    );
    expect(STAGE1_STORY_PAGES["stage-01-prebattle-story"][6]).toMatchObject({
      activeSlot: "lower",
      upper: { portrait: 46, speaker: "妮雅" },
      lower: { portrait: 43, speaker: "黛西" },
      source: { record: 4, wait: 7, address: "SAY/0004:44" },
    });
    expect(STAGE1_STORY_PAGES["stage-01-victory-story"].at(-1)?.lower?.text)
      .toBe("「殿下請放心，我和拉朵那會立刻趕去的！」");
  });

  it("activates story and music registries only after the lazy module is requested", () => {
    activateStage1Content();
    expect(storyPagesForId("stage-01-prebattle-story")).toBe(
      STAGE1_STORY_PAGES["stage-01-prebattle-story"],
    );
    expect(musicProgramFor("stage-01-player-phase-music")).toBe(
      STAGE1_MUSIC_PROGRAMS["stage-01-player-phase-music"],
    );
  });

  it("publishes byte-identical runtime resources for the lazy stage module", async () => {
    const sourceById = Object.fromEntries(STAGE1_SOURCES.map((source) => [source.id, source]));
    const expectedAssets = [
      [STAGE1_ASSETS.map, "map"],
      [STAGE1_ASSETS.minimap, "minimap"],
      [STAGE1_ASSETS.storyBackground, "storyBackground"],
      [STAGE1_ASSETS.allyMagician, "allyMagician"],
      [STAGE1_ASSETS.portraits[0], "portraitGetilas"],
      [STAGE1_ASSETS.portraits[42], "portraitMengxinman"],
      [STAGE1_ASSETS.portraits[43], "portraitDaisy"],
      [STAGE1_ASSETS.portraits[44], "portraitLadonna"],
      [STAGE1_ASSETS.audio.story, "storyMusic"],
      [STAGE1_ASSETS.audio.playerEntry, "playerEntryMusic"],
      [STAGE1_ASSETS.audio.playerLoop, "playerLoopMusic"],
      [STAGE1_ASSETS.audio.enemyEntry, "enemyEntryMusic"],
      [STAGE1_ASSETS.audio.enemyLoop, "enemyLoopMusic"],
    ] as const;
    for (const [url, sourceId] of expectedAssets) {
      const bytes = await readFile(path.join(workspace, "public", url));
      expect(sha256(bytes), `${sourceId}: ${url}`).toBe(sourceById[sourceId]?.sha256);
    }
    expect(await readFile(path.join(workspace, "public", STAGE1_ASSETS.enemySister)))
      .not.toHaveLength(0);
  });
});
