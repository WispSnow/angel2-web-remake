import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVIDENCE_AVAILABLE } from "./evidence";
import { musicProgramFor } from "../../src/game/content/music";
import { stageSimulationEffectFor } from "../../src/game/content/stage-effects";
import {
  activateStage30Content,
  STAGE30,
  STAGE30_ALL_FORM_CLASS_IDS,
  STAGE30_ASSETS,
  STAGE30_CONTENT_IDENTITY,
  STAGE30_DEFINITION,
  STAGE30_EVENT_PROGRAM,
  STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY,
  STAGE30_MUSIC_PROGRAMS,
  STAGE30_SEMANTIC_ALLIED_UNITS,
  STAGE30_SEMANTIC_INITIAL_ENEMY,
  STAGE30_SOURCES,
  STAGE30_STORY_PAGES,
  STAGE30_TERRAIN_TOKENS,
} from "../../src/game/content/stage30";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("stage 30 generated content", () => {
  it("defines the fixed rescue board and evidence identity", () => {
    const identityHash = createHash("sha256");
    identityHash.update("stableRemake\0REMAKE-071\0");
    for (const source of STAGE30_SOURCES) {
      identityHash.update(`${source.path}\0${source.sha256}\n`);
    }
    expect(STAGE30_CONTENT_IDENTITY)
      .toBe(`stage-30/evidence-${identityHash.digest("hex")}`);
    expect(STAGE30).toMatchObject({
      id: "stage-30",
      nativeStage: 30,
      name: "治癒維斯塔女帝",
      viewport: { initialOrigin: { x: 24, y: 22 } },
    });
    expect(STAGE30_DEFINITION).toMatchObject({
      deployment: { kind: "fixed" },
      objective: {
        victory: { type: "unit-removed", side: 2, slot: 27 },
        defeat: { type: "unit-removed", side: 1, slot: 0 },
      },
      stories: {
        prebattle: "stage-30-prebattle-story",
        opening: "stage-30-opening-story",
        victory: "stage-30-victory-story",
      },
    });
    expect(STAGE30_TERRAIN_TOKENS).toHaveLength(2500);
    expect(STAGE30_SEMANTIC_ALLIED_UNITS).toEqual([
      expect.objectContaining({ slot: 40, position: { x: 30, y: 19 }, initialClassId: "magic-sword-warrior" }),
      expect.objectContaining({ slot: 7, position: { x: 26, y: 25 }, initialClassId: "magic-priest", name: "琴斯", portrait: 14 }),
      expect.objectContaining({ slot: 0, position: { x: 28, y: 25 }, name: "妮雅", portrait: 46 }),
    ]);
    expect(STAGE30_SEMANTIC_INITIAL_ENEMY).toMatchObject({
      slot: 27,
      classId: "empress",
      name: "維絲塔",
      portrait: 41,
      position: { x: 28, y: 17 },
      aiBehavior: 0,
    });
  });

  it("locks the four deterministic form sequences and final conversion", () => {
    expect(STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY.map(({ length }) => length))
      .toEqual([8, 16, 24, 32]);
    expect(STAGE30_ALL_FORM_CLASS_IDS).toEqual([
      "soldier", "magic-sword-warrior", "jungle-warrior", "magic-priest",
      "prayer-guide", "curse-master", "magician", "great-axe-warrior",
      "half-dragon-warrior", "magic-armor-warrior", "magic-guide", "evil-mage",
      "magic-archer", "land-knight", "demon-dragon-knight", "flying-dragon-knight",
      "beast-knight", "bone-knight", "swift-dragon-knight", "great-dragon-knight",
      "archer", "crossbow", "cavalry", "pegasus-warrior", "sister", "monk",
      "water-warrior", "divine-sword-warrior", "warrior", "steel-armor-warrior",
      "priest", "wizard",
    ]);
    expect(STAGE30_EVENT_PROGRAM).toMatchObject({
      nativeHandler: "1000:4F1E",
      openingStoryRecord: 58,
      openingFormTransition: { from: 35, to: 0, side: 2, slot: 27 },
      contextualLine: { selector: 34, address: "DS:8762" },
      finalConversion: { from: { side: 2, slot: 27 }, to: { side: 1, slot: 23, classRecord: 35 } },
      victoryStoryRecord: 59,
      completedRoute: { module: 25, stage: 31, replayPresentation: false },
      stableRemakeDecisions: ["REMAKE-071"],
    });
  });

  it("registers the three stories, opening transition, music, and frozen route", () => {
    activateStage30Content();
    expect(Object.fromEntries(Object.entries(STAGE30_STORY_PAGES)
      .map(([id, pages]) => [id, pages.length]))).toEqual({
      "stage-30-prebattle-story": 17,
      "stage-30-opening-story": 18,
      "stage-30-victory-story": 6,
    });
    expect(STAGE30_STORY_PAGES["stage-30-prebattle-story"][0]?.source.backgroundId).toBe(23);
    expect(STAGE30_STORY_PAGES["stage-30-opening-story"][0]?.upper?.text).toContain("女帝");
    expect(STAGE30_STORY_PAGES["stage-30-victory-story"][0]?.lower?.text).toContain("恢復正常");
    expect(stageSimulationEffectFor("stage-30-opening-form-transition")).toMatchObject({
      type: "unit-form-transition",
      actorId: "2:27",
      targetClassId: "soldier",
      targetExperience: 0,
    });
    expect(stageSimulationEffectFor("stage-30-set-victory-999"))
      .toEqual({ type: "victory-state", value: 999 });
    expect(stageSimulationEffectFor("stage-30-route-to-stage-31"))
      .toEqual({ type: "campaign-route", destination: "stage-31" });
    expect(STAGE30_MUSIC_PROGRAMS["stage-30-story-music"]).toMatchObject({ track: "MAGIC/78" });
    expect(STAGE30_MUSIC_PROGRAMS["stage-30-player-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/29", loopTrack: "MUSIC/28" });
    expect(STAGE30_MUSIC_PROGRAMS["stage-30-enemy-phase-music"])
      .toMatchObject({ entryTrack: "MUSIC/5", loopTrack: "MUSIC/4" });
    expect(musicProgramFor("stage-30-player-phase-music"))
      .toBe(STAGE30_MUSIC_PROGRAMS["stage-30-player-phase-music"]);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps evidence and shipping assets byte-identical", async () => {
    for (const source of STAGE30_SOURCES) {
      const value = await readFile(path.join(workspace, source.path));
      expect(value).toHaveLength(source.bytes);
      expect(sha256(value)).toBe(source.sha256);
    }
    for (const source of [
      STAGE30_ASSETS.map,
      STAGE30_ASSETS.minimap,
      STAGE30_ASSETS.storyBackground,
      ...Object.values(STAGE30_ASSETS.unitSprites),
      ...Object.values(STAGE30_ASSETS.audio),
    ]) {
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });
});
