import { describe, expect, it } from "vitest";
import { isSaveData, parseSaveData } from "../../src/game/save";
import type { BattleSaveData, CompletedSaveData } from "../../src/game/types";

const completedSave = (): CompletedSaveData => ({
  format: "ANGEL2-web-save",
  version: 2,
  kind: "completed",
  savedAt: "2026-07-25T12:00:00.000Z",
  saveCount: 1,
  stage: 1,
  stageLabel: "下一關",
  ruleset: "stableRemake",
  difficulty: 0,
  rngState: 0x0a11ce02,
  roster: [
    { slot: 0, classId: 0, experience: 20, life: 140 },
  ],
});

const battleSave = (): BattleSaveData => ({
  format: "ANGEL2-web-save",
  version: 2,
  kind: "battle",
  savedAt: "2026-07-25T12:00:00.000Z",
  saveCount: 2,
  stage: 0,
  stageLabel: "瓦爾克麗宮",
  ruleset: "stableRemake",
  difficulty: 2,
  rngState: 0x1020_3040,
  roster: [
    { slot: 0, classId: 0, experience: 20, life: 140 },
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
        classId: 0,
        className: "士兵",
        name: "妮雅",
        portrait: 46,
        x: 29,
        y: 26,
        life: 140,
        experience: 20,
        acted: false,
      },
      {
        id: "2:15",
        side: 2,
        slot: 15,
        classId: 22,
        className: "騎兵",
        name: "哈釘",
        portrait: 15,
        x: 23,
        y: 32,
        life: 180,
        experience: 0,
        acted: true,
      },
    ],
    cursor: { x: 29, y: 26 },
    cameraOrigin: { x: 25, y: 23 },
  },
});

describe("Web save validation", () => {
  it("accepts complete version-2 battle and completed saves", () => {
    expect(isSaveData(completedSave())).toBe(true);
    expect(parseSaveData(JSON.stringify(battleSave()))).toEqual(battleSave());
  });

  it("rejects malformed JSON and shallow lookalikes", () => {
    expect(parseSaveData("{")).toBeUndefined();
    expect(isSaveData({
      format: "ANGEL2-web-save",
      version: 2,
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
    expect(isSaveData({ ...completedSave(), stage: 0 })).toBe(false);
    expect(isSaveData({ ...completedSave(), battle: battleSave().battle })).toBe(false);
    expect(isSaveData({ ...battleSave(), stageLabel: "下一關" })).toBe(false);
  });
});
