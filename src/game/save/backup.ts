import type { SaveData } from "../types";
import { parseSaveData } from "./migrations";
import {
  readSaveSlot,
  SAVE_SLOT_COUNT,
  saveSlotKey,
} from "./repository";

export const SAVE_BACKUP_FORMAT = "ANGEL2-web-save-backup" as const;
export const SAVE_BACKUP_VERSION = 1 as const;
/** Reject unexpectedly large files before JSON parsing or touching site storage. */
export const SAVE_BACKUP_MAX_CHARACTERS = 8_000_000;

export interface SaveBackupData {
  format: typeof SAVE_BACKUP_FORMAT;
  version: typeof SAVE_BACKUP_VERSION;
  exportedAt: string;
  slots: Array<SaveData | null>;
}

export interface CreatedSaveBackup {
  backup: SaveBackupData;
  serialized: string;
  saveCount: number;
  skippedInvalidSlots: number[];
}

export type RestoreSaveBackupResult =
  | { kind: "restored" }
  | { kind: "failed"; rollbackSucceeded: boolean };

type SaveBackupStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString() === value;
};

/**
 * Creates a portable snapshot of every readable manual slot. An already-corrupt
 * local slot cannot become a valid portable save, so it is represented as empty
 * and reported to the caller instead of poisoning the whole backup.
 */
export function createSaveBackup(
  storage: Pick<Storage, "getItem">,
  exportedAt = new Date(),
): CreatedSaveBackup {
  const slots: Array<SaveData | null> = [];
  const skippedInvalidSlots: number[] = [];
  let saveCount = 0;
  for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot += 1) {
    const result = readSaveSlot(storage, slot);
    if (result.kind === "valid") {
      slots.push(result.save);
      saveCount += 1;
    } else {
      slots.push(null);
      if (result.kind === "invalid") skippedInvalidSlots.push(slot);
    }
  }
  const backup: SaveBackupData = {
    format: SAVE_BACKUP_FORMAT,
    version: SAVE_BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    slots,
  };
  return {
    backup,
    serialized: `${JSON.stringify(backup, null, 2)}\n`,
    saveCount,
    skippedInvalidSlots,
  };
}

/**
 * Parses the envelope strictly and sends every non-empty slot through the same
 * schema/migration boundary as an ordinary in-browser load.
 */
export function parseSaveBackup(raw: string): SaveBackupData | undefined {
  if (raw.length > SAVE_BACKUP_MAX_CHARACTERS) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value)
      || value.format !== SAVE_BACKUP_FORMAT
      || value.version !== SAVE_BACKUP_VERSION
      || !isIsoTimestamp(value.exportedAt)
      || !Array.isArray(value.slots)
      || value.slots.length !== SAVE_SLOT_COUNT
    ) return undefined;

    const slots: Array<SaveData | null> = [];
    for (const slot of value.slots) {
      if (slot === null) {
        slots.push(null);
        continue;
      }
      const save = parseSaveData(JSON.stringify(slot));
      if (!save) return undefined;
      slots.push(save);
    }
    return {
      format: SAVE_BACKUP_FORMAT,
      version: SAVE_BACKUP_VERSION,
      exportedAt: value.exportedAt,
      slots,
    };
  } catch {
    return undefined;
  }
}

/**
 * Restores the backup as one logical operation. localStorage has no transaction
 * support, so a write failure triggers a best-effort rollback to the exact raw
 * values that existed before import.
 */
export function restoreSaveBackup(
  storage: SaveBackupStorage,
  backup: SaveBackupData,
): RestoreSaveBackupResult {
  const previous = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) =>
    storage.getItem(saveSlotKey(index + 1)));

  const replaceSlots = (slots: ReadonlyArray<SaveData | string | null>) => {
    for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot += 1) {
      storage.removeItem(saveSlotKey(slot));
    }
    slots.forEach((value, index) => {
      if (value === null) return;
      storage.setItem(
        saveSlotKey(index + 1),
        typeof value === "string" ? value : JSON.stringify(value),
      );
    });
  };

  try {
    replaceSlots(backup.slots);
    return { kind: "restored" };
  } catch {
    try {
      replaceSlots(previous);
      return { kind: "failed", rollbackSucceeded: true };
    } catch {
      return { kind: "failed", rollbackSucceeded: false };
    }
  }
}

export function saveBackupFilename(exportedAt = new Date()): string {
  const stamp = exportedAt.toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace("T", "-")
    .replace(/\.\d{3}Z$/, "Z");
  return `angel2-records-${stamp}.json`;
}
