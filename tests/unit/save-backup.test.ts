import { describe, expect, it } from "vitest";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import {
  createSaveBackup,
  deleteSaveSlot,
  parseSaveBackup,
  readSaveSlot,
  restoreSaveBackup,
  saveBackupFilename,
  SAVE_BACKUP_FORMAT,
  SAVE_BACKUP_VERSION,
  SAVE_CONTENT_VERSION,
  SAVE_SLOT_COUNT,
  SAVE_VERSION,
  saveSlotKey,
} from "../../src/game/save";
import type { CompletedSaveData } from "../../src/game/types";

const completedSave = (saveCount = 3): CompletedSaveData => ({
  format: "ANGEL2-web-save",
  version: SAVE_VERSION,
  contentVersion: SAVE_CONTENT_VERSION,
  kind: "completed",
  savedAt: "2026-08-20T12:00:00.000Z",
  saveCount,
  stageId: "stage-01",
  stageLabel: "騎士城堡前",
  ruleset: "stableRemake",
  difficulty: 1,
  rngState: 0x1234_5678,
  rngCalls: 4,
  roster: completeCampaignRoster([
    { slot: 0, classId: "soldier", experience: 319, life: 170 },
  ]),
  recordCounters: Array<number>(75).fill(0),
  stageProgress: 0,
  consumedEventIds: [],
});

class MemoryStorage {
  readonly values = new Map<string, string>();
  failNextSetKey: string | undefined;
  failNextRemoveKey: string | undefined;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (key === this.failNextSetKey) {
      this.failNextSetKey = undefined;
      throw new Error("quota exceeded");
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (key === this.failNextRemoveKey) {
      this.failNextRemoveKey = undefined;
      throw new Error("storage blocked");
    }
    this.values.delete(key);
  }
}

describe("portable save backups", () => {
  it("exports all readable slots and reports corrupt local slots", () => {
    const storage = new MemoryStorage();
    storage.setItem(saveSlotKey(1), JSON.stringify(completedSave()));
    storage.setItem(saveSlotKey(2), "{");
    const exportedAt = new Date("2026-08-20T12:34:56.789Z");

    const created = createSaveBackup(storage, exportedAt);

    expect(created.saveCount).toBe(1);
    expect(created.skippedInvalidSlots).toEqual([2]);
    expect(created.backup).toMatchObject({
      format: SAVE_BACKUP_FORMAT,
      version: SAVE_BACKUP_VERSION,
      exportedAt: exportedAt.toISOString(),
    });
    expect(created.backup.slots).toHaveLength(SAVE_SLOT_COUNT);
    expect(created.backup.slots[0]?.stageLabel).toBe("騎士城堡前");
    expect(created.backup.slots[1]).toBeNull();
    expect(created.serialized.endsWith("\n")).toBe(true);
    expect(saveBackupFilename(exportedAt)).toBe("angel2-records-20260820-123456Z.json");
  });

  it("strictly validates the envelope and every save slot", () => {
    const storage = new MemoryStorage();
    storage.setItem(saveSlotKey(3), JSON.stringify(completedSave()));
    const created = createSaveBackup(storage, new Date("2026-08-20T12:34:56.000Z"));

    const parsed = parseSaveBackup(created.serialized);
    expect(parsed?.slots[2]?.stageLabel).toBe("騎士城堡前");

    const wrongVersion = { ...created.backup, version: 2 };
    expect(parseSaveBackup(JSON.stringify(wrongVersion))).toBeUndefined();
    expect(parseSaveBackup(JSON.stringify({ ...created.backup, slots: [null] }))).toBeUndefined();
    expect(parseSaveBackup(JSON.stringify({ ...created.backup, exportedAt: "yesterday" }))).toBeUndefined();
    const invalidSlot = structuredClone(created.backup) as unknown as {
      slots: Array<Record<string, unknown> | null>;
    };
    if (invalidSlot.slots[2]) invalidSlot.slots[2].difficulty = 99;
    expect(parseSaveBackup(JSON.stringify(invalidSlot))).toBeUndefined();
    expect(parseSaveBackup("{")).toBeUndefined();
  });

  it("restores all twenty slots, including empty slots", () => {
    const source = new MemoryStorage();
    source.setItem(saveSlotKey(3), JSON.stringify(completedSave(8)));
    const backup = parseSaveBackup(createSaveBackup(source).serialized);
    if (!backup) throw new Error("fixture backup must parse");

    const target = new MemoryStorage();
    target.setItem(saveSlotKey(1), JSON.stringify(completedSave(10)));
    target.setItem(saveSlotKey(20), JSON.stringify(completedSave(11)));

    expect(restoreSaveBackup(target, backup)).toEqual({ kind: "restored" });
    expect(target.getItem(saveSlotKey(1))).toBeNull();
    expect(JSON.parse(target.getItem(saveSlotKey(3)) ?? "null")).toMatchObject({
      saveCount: 8,
    });
    expect(target.getItem(saveSlotKey(20))).toBeNull();
  });

  it("rolls back to the exact raw slots when a browser write fails", () => {
    const source = new MemoryStorage();
    source.setItem(saveSlotKey(1), JSON.stringify(completedSave(8)));
    source.setItem(saveSlotKey(2), JSON.stringify(completedSave(9)));
    const backup = parseSaveBackup(createSaveBackup(source).serialized);
    if (!backup) throw new Error("fixture backup must parse");

    const target = new MemoryStorage();
    const previous = JSON.stringify(completedSave(10));
    target.setItem(saveSlotKey(4), previous);
    target.failNextSetKey = saveSlotKey(2);

    expect(restoreSaveBackup(target, backup)).toEqual({
      kind: "failed",
      rollbackSucceeded: true,
    });
    expect(target.getItem(saveSlotKey(1))).toBeNull();
    expect(target.getItem(saveSlotKey(2))).toBeNull();
    expect(target.getItem(saveSlotKey(4))).toBe(previous);
  });
});

describe("single manual slot deletion", () => {
  it("clears only the chosen slot, corrupt or valid, and leaves the rest byte for byte", () => {
    const storage = new MemoryStorage();
    storage.setItem(saveSlotKey(1), JSON.stringify(completedSave(1)));
    storage.setItem(saveSlotKey(2), "{");
    storage.setItem(saveSlotKey(3), JSON.stringify(completedSave(3)));
    const untouched = storage.getItem(saveSlotKey(3));

    expect(deleteSaveSlot(storage, 1)).toEqual({ kind: "deleted" });
    expect(readSaveSlot(storage, 1)).toEqual({ kind: "empty" });
    expect(deleteSaveSlot(storage, 2)).toEqual({ kind: "deleted" });
    expect(readSaveSlot(storage, 2)).toEqual({ kind: "empty" });
    expect(storage.getItem(saveSlotKey(3))).toBe(untouched);
    expect([...storage.values.keys()]).toEqual([saveSlotKey(3)]);
  });

  it("reports an empty slot without touching storage", () => {
    const storage = new MemoryStorage();
    storage.failNextRemoveKey = saveSlotKey(4);
    expect(deleteSaveSlot(storage, 4)).toEqual({ kind: "empty" });
    expect(storage.failNextRemoveKey).toBe(saveSlotKey(4));
  });

  it("keeps the record and reports failure when the browser refuses the write", () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify(completedSave(2));
    storage.setItem(saveSlotKey(5), raw);
    storage.failNextRemoveKey = saveSlotKey(5);
    expect(deleteSaveSlot(storage, 5)).toEqual({ kind: "failed" });
    expect(storage.getItem(saveSlotKey(5))).toBe(raw);

    const ignoresRemoval = {
      getItem: (key: string) => (key === saveSlotKey(5) ? raw : null),
      removeItem: () => undefined,
    };
    expect(deleteSaveSlot(ignoresRemoval, 5)).toEqual({ kind: "failed" });
  });
});
