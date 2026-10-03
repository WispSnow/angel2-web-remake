import {
  CLASS_DATA_FIELDS,
  classDataRowsWithEdits,
  steppedDataDigit,
  TERRAIN_DATA_SLOT_COUNT,
  terrainDataWithEdits,
  type ClassDataField,
  type TerrainDataTable,
} from "./content/battle-data-edits";
import { classIdFromNativeRecord, className, type ClassId } from "./content/classes";
import { NATIVE_DEBUG_CLASS_EDITOR, NATIVE_DEBUG_TERRAIN_EDITOR } from "./content/debug-mode.generated";
import type { Position } from "./types";

/**
 * `REMAKE-174` 原版Debug第三批：兵種（`0000:1294`）與地型（`0000:1B3A`）編輯器的狀態、
 * 命中判定與鍵盤導覽。座標都是原生 640×350；命中規則照原版指標迴圈，只把會選到表外
 * 記錄或留下殘值的邊緣修掉（`[SR]`，見 `developer-debug-mode.md` 的原版缺陷）。
 */

export const CLASS_EDITOR_LAYOUT = NATIVE_DEBUG_CLASS_EDITOR.layout;
export const TERRAIN_EDITOR_LAYOUT = NATIVE_DEBUG_TERRAIN_EDITOR.layout;

export const DEBUG_CLASS_EDITOR_RECORDS = CLASS_EDITOR_LAYOUT.grid.lastRecord + 1;
export const DEBUG_TERRAIN_EDITOR_RECORDS = TERRAIN_EDITOR_LAYOUT.classGrid.recordLimit;
export const DEBUG_CLASS_EDITOR_ROWS = CLASS_EDITOR_LAYOUT.table.rows.length;
export const DEBUG_CLASS_EDITOR_COLUMNS = CLASS_EDITOR_LAYOUT.table.columns.length;
export const DEBUG_DATA_DIGITS = CLASS_EDITOR_LAYOUT.table.digits;
export const DEBUG_TERRAIN_EDITABLE_DIGITS = TERRAIN_EDITOR_LAYOUT.editableDigits.fieldDigits;
export const DEBUG_TERRAIN_STRIP_CELLS = TERRAIN_EDITOR_LAYOUT.strip.columns * TERRAIN_EDITOR_LAYOUT.strip.rows;

export const DEBUG_CLASS_EDITOR_FIELDS: readonly ClassDataField[] = NATIVE_DEBUG_CLASS_EDITOR.fields
  .map(({ field }) => field);

if (DEBUG_CLASS_EDITOR_FIELDS.some((field, index) => field !== CLASS_DATA_FIELDS[index])) {
  throw new Error("the class editor columns must follow the DATA row field order");
}

export const DEBUG_TERRAIN_TABLES: readonly TerrainDataTable[] = ["movement", "defense"];

export function debugEditorClassId(record: number): ClassId {
  const classId = classIdFromNativeRecord(record);
  if (!classId) throw new Error(`no class record ${record}`);
  return classId;
}

// ── 兵種 ──

export interface DebugClassEditorState {
  /** 紅框所在的記錄：指標懸停或方向鍵移動。 */
  readonly highlighted: number;
  /** 下方面板顯示的記錄；原版要在行區之外按主鍵才換。 */
  readonly shown: number;
  readonly focus: "grid" | "table";
  /** 藍底行與括線、刻線所在的欄位；指標離開後照原版留在原處。 */
  readonly row?: number;
  readonly column?: number;
  readonly digit?: number;
}

export interface DebugClassEditorHit {
  readonly record?: number;
  readonly row?: number;
  readonly column?: number;
  readonly digit?: number;
}

export function initialDebugClassEditor(): DebugClassEditorState {
  return { highlighted: 0, shown: 0, focus: "grid" };
}

/**
 * 原版指標迴圈 `14FA/1697/188C/191C`：網格只看 x、y 是否在表內；行只看 y；欄只看 x
 * （嚴格大於欄起點）；位是欄內第幾個 8 px。`[SR]`：網格右緣 x = 624、下緣 y = 150 原版會選到
 * 下一列或表外記錄，欄內第 6 個 8 px（x = 欄起點 + 40）原版沿用殘留的位，複刻都不選。
 */
export function debugClassEditorHitAt({ x, y }: Position): DebugClassEditorHit {
  const { grid, table } = CLASS_EDITOR_LAYOUT;
  if (x >= grid.x && y >= grid.y && x < grid.x + grid.columns * grid.xStep && y < grid.y + grid.rows * grid.yStep) {
    const record = Math.floor((y - grid.y) / grid.yStep) * grid.columns + Math.floor((x - grid.x) / grid.xStep);
    return record < DEBUG_CLASS_EDITOR_RECORDS ? { record } : {};
  }
  const bottoms = [...table.rows.slice(1), table.rowHitBottom];
  const row = table.rows.findIndex((top, index) => y >= top && y < (bottoms[index] ?? top));
  if (row < 0) return {};
  let column: number | undefined;
  for (let index = table.columns.length - 1; index >= 0; index -= 1) {
    if (x > (table.columns[index] ?? Number.POSITIVE_INFINITY)) {
      column = index;
      break;
    }
  }
  if (column === undefined) return { row };
  const offset = x - table.columns[column];
  const digit = offset <= table.fieldWidth ? Math.floor(offset / table.digitWidth) : undefined;
  return digit !== undefined && digit < DEBUG_DATA_DIGITS ? { row, column, digit } : { row, column };
}

/**
 * 指標移動：紅框跟著網格，藍底行跟著行區，括線與刻線只在指到某一位時重畫。原版換行時
 * 重畫行（`172E → 1797`）會抹掉舊標記；指標離開行區或位時，舊的藍底與標記留在原處。
 */
export function hoveredDebugClassEditor(
  state: DebugClassEditorState,
  hit: DebugClassEditorHit,
): DebugClassEditorState {
  if (hit.record !== undefined) return { ...state, highlighted: hit.record, focus: "grid" };
  if (hit.row === undefined) return state;
  const marks = hit.digit !== undefined
    ? { column: hit.column, digit: hit.digit }
    : hit.row !== state.row
      ? { column: undefined, digit: undefined }
      : { column: state.column, digit: state.digit };
  return { ...state, focus: "table", row: hit.row, ...marks };
}

/** 面板換成紅框所在記錄；原版重畫面板會抹掉藍底與標記（`0000:1429 → 15C5`）。 */
export function shownDebugClassEditor(state: DebugClassEditorState, record = state.highlighted): DebugClassEditorState {
  return { highlighted: record, shown: record, focus: state.focus };
}

/**
 * 方向鍵。網格：左右一格、上下一列，不越過表的邊緣。表格：上下換行；左右在 7 欄 × 5 位
 * 之間逐位移動。
 */
export function movedDebugClassEditor(state: DebugClassEditorState, delta: Position): DebugClassEditorState {
  if (state.focus === "grid") {
    const { columns } = CLASS_EDITOR_LAYOUT.grid;
    const column = state.highlighted % columns + Math.sign(delta.x);
    const target = state.highlighted + Math.sign(delta.x) + Math.sign(delta.y) * columns;
    if (column < 0 || column >= columns || target < 0 || target >= DEBUG_CLASS_EDITOR_RECORDS) return state;
    return { ...state, highlighted: target };
  }
  const row = Math.min(DEBUG_CLASS_EDITOR_ROWS - 1, Math.max(0, (state.row ?? 0) + Math.sign(delta.y)));
  const position = (state.column ?? 0) * DEBUG_DATA_DIGITS + (state.digit ?? DEBUG_DATA_DIGITS - 1);
  const next = Math.min(DEBUG_CLASS_EDITOR_COLUMNS * DEBUG_DATA_DIGITS - 1, Math.max(0, position + Math.sign(delta.x)));
  return {
    ...state,
    row,
    column: Math.floor(next / DEBUG_DATA_DIGITS),
    digit: next % DEBUG_DATA_DIGITS,
  };
}

/** Tab：在網格與表格之間切換；進表格時游標落在第一行第一欄的個位。 */
export function toggledDebugClassEditorFocus(state: DebugClassEditorState): DebugClassEditorState {
  if (state.focus === "table") return { ...state, focus: "grid" };
  return {
    ...state,
    focus: "table",
    row: state.row ?? 0,
    column: state.column ?? 0,
    digit: state.digit ?? DEBUG_DATA_DIGITS - 1,
  };
}

// ── 地型 ──

export interface DebugTerrainEditorState {
  /** 選定的邏輯地形槽 0..22；原版 DS:`165A` 在同一場戰鬥內跨次開啟保留。 */
  readonly terrainSlot: number;
  readonly focus: "strip" | "grid";
  /** 地形條上的紅框 0..23（第 24 格「障礙」可指到，但不是地形槽，不能選定）。 */
  readonly highlightedSlot?: number;
  /** 職業格上的紅框 0..36。 */
  readonly highlightedRecord?: number;
  readonly table?: TerrainDataTable;
  readonly digit?: number;
}

export interface DebugTerrainEditorHit {
  readonly slot?: number;
  readonly record?: number;
  readonly table?: TerrainDataTable;
  readonly digit?: number;
}

export function initialDebugTerrainEditor(
  terrainSlot: number = TERRAIN_EDITOR_LAYOUT.current.initialSlot,
): DebugTerrainEditorState {
  return { terrainSlot, focus: "strip" };
}

/**
 * 原版指標迴圈 `1E03/1EDE/1FE3/2096/20CB`。地形條 x ≤ 576、y ≤ 46；職業格 x ≤ 558、102 ≤ y ≤ 296；
 * 格內 +10..+29 是移動消耗、+30..+49 是地形防禦；可改的兩位在格內 x +40..+55。`[SR]`：地形條
 * 右緣 x = 576 原版會選到第 13 格或亂碼的第 25 格，職業格 37..39 是空框卻會改上一個職業，
 * 複刻都不選。
 */
export function debugTerrainEditorHitAt({ x, y }: Position): DebugTerrainEditorHit {
  const { strip, stripHover, classGrid, classHover, values, editableDigits } = TERRAIN_EDITOR_LAYOUT;
  if (x >= strip.x && y >= strip.y && x < strip.x + strip.columns * strip.xStep && y <= stripHover.yMax) {
    return { slot: Math.floor((y - strip.y) / strip.yStep) * strip.columns + Math.floor((x - strip.x) / strip.xStep) };
  }
  if (x < classGrid.x || x > classHover.xMax || y < classHover.yMin || y > classHover.yMax) return {};
  const column = Math.floor((x - classGrid.x) / classGrid.xStep);
  const gridRow = Math.floor((y - classGrid.y) / classGrid.yStep);
  const record = gridRow * classGrid.columns + column;
  if (record >= DEBUG_TERRAIN_EDITOR_RECORDS) return {};
  const cellLeft = classGrid.x + column * classGrid.xStep;
  const cellTop = classGrid.y + gridRow * classGrid.yStep;
  const inCell = y - cellTop;
  const table: TerrainDataTable | undefined = inCell >= values.movementDy && inCell < values.defenseDy
    ? "movement"
    : inCell >= values.defenseDy && inCell < values.defenseDy + values.rowHeight ? "defense" : undefined;
  if (!table) return { record };
  const digitOffset = x - (cellLeft + editableDigits.dx);
  if (digitOffset < 0 || digitOffset >= editableDigits.width) return { record, table };
  return { record, table, digit: Math.floor(digitOffset / editableDigits.digitWidth) };
}

/**
 * 指標移動。換到另一個職業格或格內另一行時原版重畫該格（`1F38/2052 → 1CC6`），標記跟著
 * 消失；指標離開可改的兩位時，舊標記留在原處。
 */
export function hoveredDebugTerrainEditor(
  state: DebugTerrainEditorState,
  hit: DebugTerrainEditorHit,
): DebugTerrainEditorState {
  if (hit.slot !== undefined) return { ...state, focus: "strip", highlightedSlot: hit.slot };
  if (hit.record === undefined) return state;
  const sameRecord = hit.record === state.highlightedRecord;
  if (hit.table === undefined) {
    return sameRecord
      ? { ...state, focus: "grid" }
      : { ...state, focus: "grid", highlightedRecord: hit.record, table: undefined, digit: undefined };
  }
  const rowChanged = !sameRecord || hit.table !== state.table;
  return {
    ...state,
    focus: "grid",
    highlightedRecord: hit.record,
    table: hit.table,
    digit: hit.digit ?? (rowChanged ? undefined : state.digit),
  };
}

/** 只有 23 個邏輯地形槽能選定；第 24 格是 profile 之間的重疊字（`[SR]`）。 */
export function isSelectableDebugTerrainSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < TERRAIN_DATA_SLOT_COUNT;
}

/**
 * 方向鍵。地形條：左右一格、上下一列。職業格：每格兩行（移動、防禦）× 兩位（十位、個位），
 * 方向鍵逐位、逐行移動，越過格邊就進相鄰的職業格；空的 37..39 格不進。
 */
export function movedDebugTerrainEditor(state: DebugTerrainEditorState, delta: Position): DebugTerrainEditorState {
  if (state.focus === "strip") {
    const { columns } = TERRAIN_EDITOR_LAYOUT.strip;
    const current = state.highlightedSlot ?? state.terrainSlot;
    const column = current % columns + Math.sign(delta.x);
    const target = current + Math.sign(delta.x) + Math.sign(delta.y) * columns;
    if (column < 0 || column >= columns || target < 0 || target >= DEBUG_TERRAIN_STRIP_CELLS) return state;
    return { ...state, highlightedSlot: target };
  }
  const { columns } = TERRAIN_EDITOR_LAYOUT.classGrid;
  const record = state.highlightedRecord ?? 0;
  const tableIndex = state.table === "defense" ? 1 : 0;
  const x = (record % columns) * 2 + (state.digit ?? 1) + Math.sign(delta.x);
  const y = Math.floor(record / columns) * 2 + tableIndex + Math.sign(delta.y);
  if (x < 0 || x >= columns * 2 || y < 0) return state;
  const target = Math.floor(y / 2) * columns + Math.floor(x / 2);
  if (target >= DEBUG_TERRAIN_EDITOR_RECORDS) return state;
  return {
    ...state,
    highlightedRecord: target,
    table: y % 2 === 0 ? "movement" : "defense",
    digit: x % 2,
  };
}

export function toggledDebugTerrainEditorFocus(state: DebugTerrainEditorState): DebugTerrainEditorState {
  if (state.focus === "grid") return { ...state, focus: "strip", highlightedSlot: state.highlightedSlot ?? state.terrainSlot };
  return {
    ...state,
    focus: "grid",
    highlightedRecord: state.highlightedRecord ?? 0,
    table: state.table ?? "movement",
    digit: state.digit ?? 1,
  };
}

/** 地型可改的是五位數欄的十位與個位（原版位號 3、4）。 */
export function debugTerrainFieldDigit(digit: number): number {
  const fieldDigit = DEBUG_TERRAIN_EDITABLE_DIGITS[digit];
  if (fieldDigit === undefined) throw new Error(`terrain digit ${digit} is not editable`);
  return fieldDigit;
}

// ── 結算：改一位、換面板、選地形 ──

/** 狀態欄用的現代說明；原版表頭第 7 欄重用「經驗」，這裡寫明是等級。 */
const CLASS_FIELD_DESCRIPTIONS: Readonly<Record<ClassDataField, string>> = {
  experienceThreshold: "經驗門檻",
  attack: "攻擊",
  defense: "防禦",
  maxLife: "生命",
  movement: "移動力",
  reservedField5: "魔防",
  level: "等級",
};

const TERRAIN_TABLE_DESCRIPTIONS: Readonly<Record<TerrainDataTable, string>> = {
  movement: "移動消耗",
  defense: "地形防禦",
};

export interface DebugDataEditorResult<State> {
  readonly state: State;
  /** 有結算時給狀態欄的說明；純導覽不給。 */
  readonly message?: string;
}

/** 編輯器需要的戰鬥介面：只讀改過的查表、寫本場覆寫。 */
export interface DebugDataEditorBattle {
  debugEditClassData(classId: ClassId, row: number, field: ClassDataField, value: number): void;
  debugEditTerrainData(classId: ClassId, table: TerrainDataTable, slot: number, value: number): void;
}

export function debugClassEditorValue(record: number, row: number, column: number): number {
  const field = DEBUG_CLASS_EDITOR_FIELDS[column];
  const values = classDataRowsWithEdits(debugEditorClassId(record))[row];
  if (!field || !values) throw new Error(`no class editor cell ${record}/${row}/${column}`);
  return values[field];
}

export function debugTerrainEditorValue(record: number, table: TerrainDataTable, slot: number): number {
  return terrainDataWithEdits(debugEditorClassId(record), table)[slot] ?? 0;
}

function steppedClassCell(
  battle: DebugDataEditorBattle,
  record: number,
  row: number,
  column: number,
  digit: number,
  delta: 1 | -1,
): string {
  const classId = debugEditorClassId(record);
  const field = DEBUG_CLASS_EDITOR_FIELDS[column];
  if (!field) throw new Error(`no class editor column ${column}`);
  const before = debugClassEditorValue(record, row, column);
  const after = steppedDataDigit(before, digit, delta);
  battle.debugEditClassData(classId, row, field, after);
  return `原版Debug：${className(classId)}第 ${row + 1} 行${CLASS_FIELD_DESCRIPTIONS[field]} ${before} → ${after}。`;
}

/**
 * 兵種的指標按鍵（主鍵 +1、次鍵 −1）。指到某一位就改面板職業的那一位；在行區之外按主鍵，
 * 面板換成紅框所在職業（`0000:1429`）。
 */
export function pressedDebugClassEditor(
  battle: DebugDataEditorBattle,
  state: DebugClassEditorState,
  position: Position,
  delta: 1 | -1,
): DebugDataEditorResult<DebugClassEditorState> {
  const hit = debugClassEditorHitAt(position);
  const hovered = hoveredDebugClassEditor(state, hit);
  if (hit.row !== undefined && hit.column !== undefined && hit.digit !== undefined) {
    return { state: hovered, message: steppedClassCell(battle, hovered.shown, hit.row, hit.column, hit.digit, delta) };
  }
  if (delta === 1 && hit.row === undefined) {
    const shown = shownDebugClassEditor(hovered);
    return { state: shown, message: `原版Debug：兵種顯示${className(debugEditorClassId(shown.shown))}。` };
  }
  return { state: hovered };
}

/** 鍵盤的 ＋／－：改表格游標那一位；游標在網格時先把紅框職業放進面板。 */
export function steppedDebugClassEditor(
  battle: DebugDataEditorBattle,
  state: DebugClassEditorState,
  delta: 1 | -1,
): DebugDataEditorResult<DebugClassEditorState> {
  if (state.focus === "grid") return activatedDebugClassEditor(state);
  const { row = 0, column = 0, digit = DEBUG_DATA_DIGITS - 1 } = state;
  return {
    state: { ...state, row, column, digit },
    message: steppedClassCell(battle, state.shown, row, column, digit, delta),
  };
}

/** Enter：網格上把紅框職業放進面板並把焦點移到表格；表格上回到網格。 */
export function activatedDebugClassEditor(state: DebugClassEditorState): DebugDataEditorResult<DebugClassEditorState> {
  if (state.focus === "table") return { state: { ...state, focus: "grid" } };
  const shown = toggledDebugClassEditorFocus(shownDebugClassEditor(state));
  return { state: shown, message: `原版Debug：兵種顯示${className(debugEditorClassId(shown.shown))}。` };
}

function steppedTerrainCell(
  battle: DebugDataEditorBattle,
  terrainSlot: number,
  record: number,
  table: TerrainDataTable,
  digit: number,
  delta: 1 | -1,
): string {
  const classId = debugEditorClassId(record);
  const before = debugTerrainEditorValue(record, table, terrainSlot);
  const after = steppedDataDigit(before, debugTerrainFieldDigit(digit), delta);
  battle.debugEditTerrainData(classId, table, terrainSlot, after);
  const terrain = NATIVE_DEBUG_TERRAIN_EDITOR.labels[terrainSlot]?.label ?? String(terrainSlot);
  return `原版Debug：${className(classId)}在「${terrain}」的${TERRAIN_TABLE_DESCRIPTIONS[table]} ${before} → ${after}。`;
}

function selectedTerrainSlot(
  state: DebugTerrainEditorState,
  slot: number,
): DebugDataEditorResult<DebugTerrainEditorState> {
  if (!isSelectableDebugTerrainSlot(slot)) {
    return {
      state,
      message: "原版Debug：「障礙」只是原版地形表之間的重疊字，不是地形槽，不能選。",
    };
  }
  const label = NATIVE_DEBUG_TERRAIN_EDITOR.labels[slot]?.label ?? String(slot);
  return { state: { ...state, terrainSlot: slot }, message: `原版Debug：地型改看「${label}」。` };
}

/** 地型的指標按鍵：主鍵在地形條上選定地形；指到可改的位時主鍵 +1、次鍵 −1。 */
export function pressedDebugTerrainEditor(
  battle: DebugDataEditorBattle,
  state: DebugTerrainEditorState,
  position: Position,
  delta: 1 | -1,
): DebugDataEditorResult<DebugTerrainEditorState> {
  const hit = debugTerrainEditorHitAt(position);
  const hovered = hoveredDebugTerrainEditor(state, hit);
  if (hit.slot !== undefined) return delta === 1 ? selectedTerrainSlot(hovered, hit.slot) : { state: hovered };
  if (hit.record !== undefined && hit.table !== undefined && hit.digit !== undefined) {
    return {
      state: hovered,
      message: steppedTerrainCell(battle, state.terrainSlot, hit.record, hit.table, hit.digit, delta),
    };
  }
  return { state: hovered };
}

/** 鍵盤的 ＋／－：改職業格游標那一位；游標在地形條時等同 Enter。 */
export function steppedDebugTerrainEditor(
  battle: DebugDataEditorBattle,
  state: DebugTerrainEditorState,
  delta: 1 | -1,
): DebugDataEditorResult<DebugTerrainEditorState> {
  if (state.focus === "strip") return activatedDebugTerrainEditor(state);
  const { highlightedRecord = 0, table = "movement", digit = 1 } = state;
  return {
    state: { ...state, highlightedRecord, table, digit },
    message: steppedTerrainCell(battle, state.terrainSlot, highlightedRecord, table, digit, delta),
  };
}

/** Enter：地形條上選定紅框地形；職業格上回到地形條。 */
export function activatedDebugTerrainEditor(state: DebugTerrainEditorState): DebugDataEditorResult<DebugTerrainEditorState> {
  if (state.focus === "grid") return { state: toggledDebugTerrainEditorFocus(state) };
  return selectedTerrainSlot(state, state.highlightedSlot ?? state.terrainSlot);
}
