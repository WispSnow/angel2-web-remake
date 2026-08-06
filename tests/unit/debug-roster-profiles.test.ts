import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classStatsFor } from "../../src/game/content/classes";
import { ALLY_MAP_UNIT_ASSETS } from "../../src/game/content/map-unit-assets";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  campaignFromDebugSave,
  createDebugCampaignState,
  debugRosterForProfile,
  debugRosterSourceOptions,
  parseDebugRosterSourceId,
} from "../../src/game/debug-roster-profiles";
import { debugScenarioUrl } from "../../src/game/debug-scenario-catalog";
import { SAVE_CONTENT_VERSION, SAVE_VERSION, saveSlotKey } from "../../src/game/save";
import type { BattleSaveData, CompletedSaveData, StageId } from "../../src/game/types";

const stageIds = [
  "stage-00",
  "stage-01",
  "stage-02",
  "stage-03",
  "stage-04",
] as const satisfies readonly StageId[];
const workspace = path.resolve(import.meta.dirname, "../..");

const completedStage3Save = (): CompletedSaveData => ({
  format: "ANGEL2-web-save",
  version: SAVE_VERSION,
  contentVersion: SAVE_CONTENT_VERSION,
  kind: "completed",
  savedAt: "2026-08-04T12:00:00.000Z",
  saveCount: 3,
  stageId: "stage-04",
  stageLabel: "通過力場",
  ruleset: "stableRemake",
  difficulty: 1,
  rngState: 0x1234_5678,
  rngCalls: 42,
  roster: completeCampaignRoster([
    { slot: 0, classId: "swift-dragon-knight", experience: 321, life: 287 },
  ]),
  stageProgress: 1000,
  consumedEventIds: [
    "stage-03-opening-story",
    "stage-03-boss-defeated",
    "stage-03-victory-story",
    "stage-03-completed-route",
  ],
});

function storageWith(entries: Readonly<Record<string, string>>): Pick<Storage, "getItem"> {
  return {
    getItem: (key) => entries[key] ?? null,
  };
}

describe("debug roster profiles", () => {
  it("compiles every deterministic profile into a complete serializable roster", () => {
    for (const stageId of stageIds) {
      for (const profileId of [
        "template-baseline",
        "representative-growth",
        "promotion-coverage",
      ] as const) {
        const roster = debugRosterForProfile(profileId, stageId);
        expect(roster).toHaveLength(75);
        expect(new Set(roster.map(({ slot }) => slot)).size).toBe(75);
        for (const entry of roster) {
          expect(entry.life).toBeLessThanOrEqual(
            classStatsFor({ classId: entry.classId, experience: entry.experience }).maxLife,
          );
        }
      }
    }
  });

  it("provides realistic stage-four growth and distinct map figures for its deep branches", async () => {
    const representative = debugRosterForProfile("representative-growth", "stage-04");
    expect(representative[0]).toMatchObject({ classId: "land-knight", experience: 640 });
    expect(representative[1]).toMatchObject({ classId: "priest", experience: 780 });
    expect(representative[24]).toMatchObject({ classId: "evil-mage", experience: 540 });

    const coverage = debugRosterForProfile("promotion-coverage", "stage-04");
    expect(coverage.filter(({ slot }) => [0, 1, 2, 3, 4, 20, 21, 24].includes(slot)))
      .toMatchObject([
        { classId: "swift-dragon-knight" },
        { classId: "magic-priest" },
        { classId: "crossbow" },
        { classId: "magic-armor-warrior" },
        { classId: "prayer-guide" },
        { classId: "flying-dragon-knight" },
        { classId: "evil-sword-warrior" },
        { classId: "wizard" },
      ]);
    for (const entry of coverage.filter(({ slot }) =>
      [0, 1, 2, 3, 4, 20, 21, 24].includes(slot))) {
      const source = ALLY_MAP_UNIT_ASSETS[entry.classId as keyof typeof ALLY_MAP_UNIT_ASSETS];
      expect(source).toMatch(/^\/assets\/original\//u);
      expect((await readFile(path.join(workspace, "public", source))).length).toBeGreaterThan(0);
    }
  });

  it("keeps battle-entry and current save rosters separate while overriding only difficulty and stage", () => {
    const entryRoster = completeCampaignRoster([
      { slot: 0, classId: "cavalry", experience: 410, life: 210 },
    ]);
    const currentRoster = completeCampaignRoster([
      { slot: 0, classId: "land-knight", experience: 250, life: 260 },
    ]);
    const base = completedStage3Save();
    const save: BattleSaveData = {
      ...base,
      kind: "battle",
      stageId: "stage-04",
      stageLabel: "通過力場",
      stageProgress: 0,
      roster: currentRoster,
      consumedEventIds: [
        "stage-04-prebattle-story",
        "stage-04-enter-deployment",
        "stage-04-opening-story",
      ],
      stageEntrySnapshot: {
        stageId: "stage-04",
        ruleset: "stableRemake",
        difficulty: 1,
        roster: entryRoster,
        rngState: 0x1111_2222,
        rngCalls: 12,
      },
      battle: {
        phase: "player",
        round: 2,
        focusId: "1:0",
        units: [],
        terrainOverrides: [],
        cursor: { x: 0, y: 0 },
        cameraOrigin: { x: 0, y: 0 },
      },
    };

    const entry = campaignFromDebugSave(save, "stage-03", 3, "entry");
    expect(entry).toMatchObject({
      stageId: "stage-03",
      difficulty: 3,
      rngState: 0x1111_2222,
      rngCalls: 12,
    });
    expect(entry.roster[0]).toMatchObject({ slot: 0, classId: "cavalry", experience: 410 });
    const current = campaignFromDebugSave(save, "stage-03", 3, "current");
    expect(current).toMatchObject({
      stageId: "stage-03",
      difficulty: 3,
      rngState: base.rngState,
      rngCalls: base.rngCalls,
    });
    expect(current.roster[0]).toMatchObject({
      slot: 0,
      classId: "land-knight",
      experience: 250,
    });
    expect(() => campaignFromDebugSave(base, "stage-04", 0, "entry"))
      .toThrow("完成記錄沒有戰中入關快照");
  });

  it("discovers valid save slots read-only and resolves them into a fresh debug campaign", () => {
    const save = completedStage3Save();
    const serialized = JSON.stringify(save);
    const storage = storageWith({ [saveSlotKey(3)]: serialized });
    const source = parseDebugRosterSourceId("save-3-current");
    expect(source).toMatchObject({ kind: "save-slot", slot: 3, mode: "current" });
    if (!source) throw new Error("missing parsed debug roster source");

    expect(debugRosterSourceOptions(storage)).toContainEqual(expect.objectContaining({
      id: "save-3-current",
      label: "記錄 3 · 通過力場 · 完成名單",
    }));
    const campaign = createDebugCampaignState("stage-04", 3, source, storage);
    expect(campaign).toMatchObject({
      stageId: "stage-04",
      difficulty: 3,
      rngState: save.rngState,
      rngCalls: save.rngCalls,
    });
    expect(campaign.roster[0]).toMatchObject({
      slot: 0,
      classId: "swift-dragon-knight",
      experience: 321,
      life: 287,
    });
    expect(storage.getItem(saveSlotKey(3))).toBe(serialized);
  });

  it("serializes roster sources in reproducible debug URLs and rejects invalid sources", () => {
    expect(debugScenarioUrl("stage-04-player", 2, "promotion-coverage"))
      .toBe("/?debugScenario=stage-04-player&difficulty=2&roster=promotion-coverage");
    expect(parseDebugRosterSourceId(undefined)).toEqual({
      kind: "profile",
      id: "template-baseline",
    });
    expect(parseDebugRosterSourceId("save-0-current")).toBeUndefined();
    expect(parseDebugRosterSourceId("arbitrary-class")).toBeUndefined();
  });
});
