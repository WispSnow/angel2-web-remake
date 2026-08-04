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
