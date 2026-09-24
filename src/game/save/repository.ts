import type { SaveData } from "../types";
import { parseSaveData } from "./migrations";

export const SAVE_SLOT_COUNT = 20;
export const SAVE_SLOTS_PER_PAGE = 5;
export const SAVE_SLOT_PAGE_COUNT = SAVE_SLOT_COUNT / SAVE_SLOTS_PER_PAGE;

const wrap = (value: number, length: number): number =>
  ((value % length) + length) % length;

export function saveSlotPageIndex(slotIndex: number): number {
  return Math.floor(wrap(slotIndex, SAVE_SLOT_COUNT) / SAVE_SLOTS_PER_PAGE);
}

export function saveSlotPageStart(slotIndex: number): number {
  return saveSlotPageIndex(slotIndex) * SAVE_SLOTS_PER_PAGE;
}

export function moveSaveSlotIndex(slotIndex: number, delta: number): number {
  return wrap(slotIndex + delta, SAVE_SLOT_COUNT);
}

export function moveSaveSlotPage(slotIndex: number, delta: number): number {
  const row = wrap(slotIndex, SAVE_SLOT_COUNT) % SAVE_SLOTS_PER_PAGE;
  const page = wrap(saveSlotPageIndex(slotIndex) + delta, SAVE_SLOT_PAGE_COUNT);
  return page * SAVE_SLOTS_PER_PAGE + row;
}

export function saveSlotKey(slot: number): string {
  return `angel2.save.${slot}`;
}

export type SaveSlotReadResult =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "valid"; save: SaveData };

export function readSaveSlot(
  storage: Pick<Storage, "getItem">,
  slot: number,
): SaveSlotReadResult {
  const raw = storage.getItem(saveSlotKey(slot));
  if (raw === null) return { kind: "empty" };
  const save = parseSaveData(raw);
  return save ? { kind: "valid", save } : { kind: "invalid" };
}

export type SaveSlotWriteResult =
  | { kind: "written" }
  | { kind: "rejected" };

/**
 * Stores `save` only if `readSaveSlot` would read it back. The exact string about
 * to be stored goes through `parseSaveData`, so a record the save schema rejects
 * never replaces what the slot already holds. Written anyway, it would list as an
 * empty slot, drop out of every backup, and the record it replaced would be gone.
 */
export function writeSaveSlot(
  storage: Pick<Storage, "setItem">,
  slot: number,
  save: SaveData,
): SaveSlotWriteResult {
  const raw = JSON.stringify(save);
  if (!parseSaveData(raw)) return { kind: "rejected" };
  storage.setItem(saveSlotKey(slot), raw);
  return { kind: "written" };
}

export type SaveSlotDeleteResult =
  | { kind: "deleted" }
  | { kind: "empty" }
  | { kind: "failed" };

/**
 * Clears one manual slot, the in-game counterpart of deleting an original
 * `WARn.TST`: the slot scanner then reads it as empty. A corrupt record is
 * cleared like any other. Only this slot's key is touched — the other slots,
 * a running battle and its entry snapshot never live under it. A browser that
 * refuses the write (blocked site data, some private modes) reports `failed`
 * instead of throwing into the menu that asked.
 */
export function deleteSaveSlot(
  storage: Pick<Storage, "getItem" | "removeItem">,
  slot: number,
): SaveSlotDeleteResult {
  const key = saveSlotKey(slot);
  try {
    if (storage.getItem(key) === null) return { kind: "empty" };
    storage.removeItem(key);
    return storage.getItem(key) === null ? { kind: "deleted" } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
