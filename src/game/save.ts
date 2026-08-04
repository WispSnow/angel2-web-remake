export {
  isSaveData,
  SAVE_CONTENT_VERSION,
  SAVE_VERSION,
} from "./save/current-schema";
export { parseSaveData } from "./save/migrations";
export {
  readSaveSlot,
  SAVE_SLOT_COUNT,
  SAVE_SLOT_PAGE_COUNT,
  SAVE_SLOTS_PER_PAGE,
  moveSaveSlotIndex,
  moveSaveSlotPage,
  saveSlotKey,
  saveSlotPageIndex,
  saveSlotPageStart,
  type SaveSlotReadResult,
} from "./save/repository";
