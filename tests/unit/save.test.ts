import { describe, expect, it } from "vitest";
import {
  isSaveData,
  moveSaveSlotIndex,
  moveSaveSlotPage,
  parseSaveData,
  readSaveSlot,
  SAVE_SLOT_COUNT,
  SAVE_SLOT_PAGE_COUNT,
  SAVE_SLOTS_PER_PAGE,
  SAVE_VERSION,
  saveSlotPageIndex,
  saveSlotPageStart,
  saveSlotKey,
} from "../../src/game/save";
import type { BattleSaveData, CompletedSaveData } from "../../src/game/types";

const completedSave = (): CompletedSaveData => ({
  format: "ANGEL2-web-save",
  version: SAVE_VERSION,
  contentVersion: "native-classes-1",
  kind: "completed",
  savedAt: "2026-07-25T12:00:00.000Z",
  saveCount: 1,
  stageId: "stage-01",
  stageLabel: "下一關",
  ruleset: "stableRemake",
  difficulty: 0,
  rngState: 0x0a11ce02,
  roster: [
    { slot: 0, classId: "soldier", experience: 319, life: 170 },
  ],
});

const battleSave = (): BattleSaveData => ({
  format: "ANGEL2-web-save",
  version: SAVE_VERSION,
  contentVersion: "native-classes-1",
  kind: "battle",
  savedAt: "2026-07-25T12:00:00.000Z",
  saveCount: 2,
  stageId: "stage-00",
  stageLabel: "瓦爾克麗宮",
  ruleset: "stableRemake",
  difficulty: 2,
  rngState: 0x1020_3040,
  roster: [
    { slot: 0, classId: "soldier", experience: 399, life: 160 },
  ],
  battle: {
    phase: "player",
    round: 3,
    focusId: "1:0",
    units: [
      {
        id: "1:0",
        side: 1,
        slot: 0,
        classId: "soldier",
        className: "士兵",
        name: "妮雅",
        portrait: 46,
        x: 29,
        y: 26,
        life: 160,
        experience: 399,
        acted: false,
      },
      {
        id: "2:15",
        side: 2,
        slot: 15,
        classId: "cavalry",
        className: "騎兵",
        name: "哈釘",
        portrait: 15,
        x: 23,
        y: 32,
        life: 250,
        experience: 461,
        acted: true,
      },
    ],
    cursor: { x: 29, y: 26 },
    cameraOrigin: { x: 25, y: 23 },
  },
});

function legacyCompletedSave(
  save: CompletedSaveData,
  version: 2 | 3 | 4,
) {
  return {
    format: save.format,
    version,
    kind: save.kind,
    savedAt: save.savedAt,
    saveCount: save.saveCount,
    stage: 1,
    stageLabel: save.stageLabel,
    ruleset: save.ruleset,
    difficulty: save.difficulty,
    rngState: save.rngState,
    roster: save.roster.map((entry) => ({
      ...entry,
      classId: entry.classId === "cavalry" ? 22 : 0,
    })),
  } as const;
}

function legacyBattleSave(
  save: BattleSaveData,
  version: 2 | 3 | 4,
) {
  return {
    format: save.format,
    version,
    kind: save.kind,
    savedAt: save.savedAt,
    saveCount: save.saveCount,
    stage: 0,
    stageLabel: save.stageLabel,
    ruleset: save.ruleset,
    difficulty: save.difficulty,
    rngState: save.rngState,
    roster: save.roster.map((entry) => ({
      ...entry,
      classId: entry.classId === "cavalry" ? 22 : 0,
    })),
    battle: {
      ...save.battle,
      units: save.battle.units.map((unit) => ({
        ...unit,
        classId: unit.classId === "cavalry" ? 22 : 0,
      })),
    },
  } as const;
}

describe("Web save validation", () => {
  it("exposes twenty manual slots as four pages without changing legacy keys", () => {
    expect(SAVE_SLOT_COUNT).toBe(20);
    expect(SAVE_SLOTS_PER_PAGE).toBe(5);
    expect(SAVE_SLOT_PAGE_COUNT).toBe(4);
    expect(saveSlotKey(1)).toBe("angel2.save.1");
    expect(saveSlotKey(5)).toBe("angel2.save.5");
    expect(saveSlotKey(20)).toBe("angel2.save.20");
    expect(saveSlotPageIndex(0)).toBe(0);
    expect(saveSlotPageIndex(19)).toBe(3);
    expect(saveSlotPageStart(17)).toBe(15);
    expect(moveSaveSlotIndex(4, 1)).toBe(5);
    expect(moveSaveSlotIndex(19, 1)).toBe(0);
    expect(moveSaveSlotPage(2, -1)).toBe(17);
    expect(moveSaveSlotPage(17, 1)).toBe(2);
  });

  it("accepts complete version-5 battle and completed saves", () => {
    expect(isSaveData(completedSave())).toBe(true);
    expect(parseSaveData(JSON.stringify(battleSave()))).toEqual(battleSave());
  });

  it("round-trips promoted semantic classes with reset experience and retained life", () => {
    const promoted = battleSave();
    promoted.roster[0] = { ...promoted.roster[0], classId: "sister", experience: 0 };
    promoted.battle.units[0] = {
      ...promoted.battle.units[0],
      classId: "sister",
      className: "修女",
      experience: 0,
    };

    expect(parseSaveData(JSON.stringify(promoted))).toEqual(promoted);
  });

  it("migrates version-2 stage-0 ally and enemy stats while preserving missing life", () => {
    const current = battleSave();
    const legacy = {
      ...legacyBattleSave(current, 2),
      roster: legacyBattleSave(current, 2).roster.map((entry) => entry.slot === 0
        ? { ...entry, experience: 100, life: 140 }
        : { ...entry }),
      battle: {
        ...legacyBattleSave(current, 2).battle,
        units: legacyBattleSave(current, 2).battle.units.map((unit) => {
          if (unit.side === 2) return { ...unit, experience: 0, life: 180 };
          if (unit.slot === 0) return { ...unit, experience: 100, life: 140 };
          return { ...unit };
        }),
      },
    };

    expect(isSaveData(legacy)).toBe(false);
    const migrated = parseSaveData(JSON.stringify(legacy));
    expect(migrated).toEqual(current);
    expect(parseSaveData(JSON.stringify(migrated))).toEqual(current);
  });

  it("migrates version-3 named allies without reseeding already-correct enemies", () => {
    const current = battleSave();
    const version3 = legacyBattleSave(current, 3);
    const legacy = {
      ...version3,
      roster: [{ ...version3.roster[0], experience: 100, life: 140 }],
      battle: {
        ...version3.battle,
        units: version3.battle.units.map((unit) => unit.side === 1
          ? { ...unit, experience: 100, life: 140 }
          : { ...unit }),
      },
    };

    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("migrates version-3 completed rosters to the named-ally experience floor", () => {
    const current = completedSave();
    const version3 = legacyCompletedSave(current, 3);
    const legacy = {
      ...version3,
      roster: [{ ...version3.roster[0], experience: 20, life: 140 }],
    };

    expect(parseSaveData(JSON.stringify(legacy))).toEqual(current);
  });

  it("maps version-4 native class records to stable semantic IDs", () => {
    const current = battleSave();
    expect(parseSaveData(JSON.stringify(legacyBattleSave(current, 4)))).toEqual(current);
  });

  it("rejects malformed JSON and shallow lookalikes", () => {
    expect(parseSaveData("{")).toBeUndefined();
    expect(isSaveData({
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      kind: "battle",
      difficulty: 0,
      battle: { phase: "player" },
    })).toBe(false);
  });

  it("rejects invalid PRNG, map and identity boundaries", () => {
    const zeroRng = battleSave();
    zeroRng.rngState = 0;
    expect(isSaveData(zeroRng)).toBe(false);

    const offMap = battleSave();
    offMap.battle.units[0].x = 50;
    expect(isSaveData(offMap)).toBe(false);

    const mismatchedId = battleSave();
    mismatchedId.battle.units[0].id = "1:7";
    expect(isSaveData(mismatchedId)).toBe(false);

    const unseededEnemy = battleSave();
    unseededEnemy.battle.units[1].experience = 0;
    expect(isSaveData(unseededEnemy)).toBe(false);

    const underseededNia = battleSave();
    underseededNia.roster[0].experience = 100;
    underseededNia.battle.units[0].experience = 100;
    expect(isSaveData(underseededNia)).toBe(false);

    const overfullEnemy = battleSave();
    overfullEnemy.battle.units[1].life = 271;
    expect(isSaveData(overfullEnemy)).toBe(false);
  });

  it("rejects duplicate occupancy and roster snapshots that disagree with battle state", () => {
    const duplicateCell = battleSave();
    duplicateCell.battle.units[1].x = duplicateCell.battle.units[0].x;
    duplicateCell.battle.units[1].y = duplicateCell.battle.units[0].y;
    expect(isSaveData(duplicateCell)).toBe(false);

    const staleRoster = battleSave();
    staleRoster.roster[0].life = 139;
    expect(isSaveData(staleRoster)).toBe(false);
  });

  it("keeps completed and battle stage metadata correlated", () => {
    expect(isSaveData({ ...completedSave(), stageId: "stage-00" })).toBe(false);
    expect(isSaveData({ ...completedSave(), battle: battleSave().battle })).toBe(false);
    expect(isSaveData({ ...battleSave(), stageLabel: "下一關" })).toBe(false);
  });

  it("distinguishes empty, invalid and readable persistent slots", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
    };

    expect(readSaveSlot(storage, 1)).toEqual({ kind: "empty" });

    values.set(saveSlotKey(1), "{");
    expect(readSaveSlot(storage, 1)).toEqual({ kind: "invalid" });

    const save = battleSave();
    values.set(saveSlotKey(1), JSON.stringify(save));
    expect(readSaveSlot(storage, 1)).toEqual({ kind: "valid", save });
  });
});
