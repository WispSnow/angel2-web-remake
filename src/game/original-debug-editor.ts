import { CHARACTER_CATALOG } from "./content/character-catalog.generated";
import { className, genericUnitName, unitDisplayName, type ClassId } from "./content/classes";
import { DEBUG_AI_BEHAVIOUR_VALUES, DEBUG_EDITABLE_CLASS_IDS } from "./content/debug-mode-rules";
import { NATIVE_DEBUG_UNIT_EDITOR } from "./content/debug-mode.generated";
import type { Stage0Battle } from "./simulation/battle";
import type { StageSaveSchema } from "./stage-runtime";
import type { BattleUnit, SaveRosterEntry, Side } from "./types";

/**
 * `REMAKE-174` 原版Debug我／敵 EDIT（`0000:0ABE`）的清單。原版每方 60 槽、4 頁 × 15 項，按列優先
 * 排列。用戶 2026-10-02 選擇受限版：
 *
 * - 在場：可移出、改職業、改行為；
 * - 本場離場（陣亡或被移出）：可放回；
 * - 其餘槽（未出戰的我方成員、尚未登場的敵人）照樣列出，但不能放置。
 */

export const DEBUG_EDITOR_SLOTS_PER_PAGE = NATIVE_DEBUG_UNIT_EDITOR.layout.grid.columns
  * NATIVE_DEBUG_UNIT_EDITOR.layout.grid.rows;
export const DEBUG_EDITOR_PAGES = NATIVE_DEBUG_UNIT_EDITOR.layout.pageTabs.count;
export const DEBUG_EDITOR_SLOT_COUNT = DEBUG_EDITOR_SLOTS_PER_PAGE * DEBUG_EDITOR_PAGES;

export type DebugEditorSlotState = "present" | "departed" | "absent" | "empty";

export interface DebugEditorSlot {
  readonly slot: number;
  readonly unitId: string;
  readonly state: DebugEditorSlotState;
  readonly classId?: ClassId;
  readonly name?: string;
  /** 在場與離場單位的有效行為值；EDIT 的行為框顯示它。 */
  readonly behaviour?: number;
}

export interface DebugEditorContext {
  readonly battle: Stage0Battle;
  readonly side: Side;
  readonly roster: readonly SaveRosterEntry[];
  readonly save: StageSaveSchema;
  readonly nativeStage: number;
}

/** 列優先：頁 × 15 + 欄 × 5 + 列（`0000:0C5A`）。 */
export function debugEditorSlotAt(page: number, column: number, row: number): number {
  const { rows } = NATIVE_DEBUG_UNIT_EDITOR.layout.grid;
  return page * DEBUG_EDITOR_SLOTS_PER_PAGE + column * rows + row;
}

function catalogName(side: Side, slot: number, nativeStage: number): string | undefined {
  return CHARACTER_CATALOG.find((entry) => (side === 1
    ? entry.allySlot === slot
    : entry.enemySlot === slot && entry.appearances.some(({ stage }) => stage === nativeStage)))?.name;
}

function behaviourFor(battle: Stage0Battle, unit: BattleUnit): number {
  return unit.side === 1 ? battle.alliedBehaviorFor(unit.id) : battle.enemyBehaviorFor(unit.id);
}

export function debugEditorSlots(context: DebugEditorContext): DebugEditorSlot[] {
  const { battle, side } = context;
  const rosterBySlot = new Map(context.roster.map((entry) => [entry.slot, entry]));
  const enemyClassById = new Map(context.save.enemyClassById);
  return Array.from({ length: DEBUG_EDITOR_SLOT_COUNT }, (_, slot): DebugEditorSlot => {
    const unitId = `${side}:${slot}`;
    const present = battle.unit(unitId);
    if (present) {
      return {
        slot,
        unitId,
        state: "present",
        classId: present.classId,
        name: unitDisplayName(present),
        behaviour: behaviourFor(battle, present),
      };
    }
    const departed = battle.debugDepartedUnit(unitId);
    if (departed) {
      return {
        slot,
        unitId,
        state: "departed",
        classId: departed.classId,
        name: unitDisplayName(departed),
        behaviour: departed.debugAiBehavior ?? 0,
      };
    }
    const classId = side === 1 ? rosterBySlot.get(slot)?.classId : enemyClassById.get(unitId);
    if (!classId) return { slot, unitId, state: "empty" };
    return {
      slot,
      unitId,
      state: "absent",
      classId,
      name: catalogName(side, slot, context.nativeStage)
        ?? (side === 1 ? genericUnitName({ classId, side, slot }) : className(classId)),
    };
  });
}

/**
 * 棋子框（`0000:0CE3/0D18`）：原版主鍵 −1、次鍵 +1，在 0..38 之間不回繞。受限版只在可改的普通
 * 職業裡走，並跳過這場戰鬥沒有備妥圖像的職業；走不動就留在原地。
 */
export function steppedDebugClass(
  current: ClassId,
  delta: -1 | 1,
  available: (classId: ClassId) => boolean,
): ClassId {
  const index = DEBUG_EDITABLE_CLASS_IDS.indexOf(current);
  if (index < 0) return current;
  for (let next = index + delta; next >= 0 && next < DEBUG_EDITABLE_CLASS_IDS.length; next += delta) {
    const candidate = DEBUG_EDITABLE_CLASS_IDS[next];
    if (candidate && available(candidate)) return candidate;
  }
  return current;
}

/** 行為框（`0000:0D94/0DC3`）：主鍵 −1、次鍵 +1，在 0..11 之間不回繞。 */
export function steppedDebugBehaviour(current: number, delta: -1 | 1): number {
  const values = DEBUG_AI_BEHAVIOUR_VALUES;
  const index = values.indexOf(current);
  const next = values[Math.max(0, Math.min(values.length - 1, (index < 0 ? 0 : index) + delta))];
  return next ?? current;
}
