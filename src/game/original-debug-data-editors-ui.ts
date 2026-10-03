import type { GameController } from "./controller";
import { NATIVE_DEBUG_CLASS_EDITOR, NATIVE_DEBUG_TERRAIN_EDITOR } from "./content/debug-mode.generated";
import { className, classDefinition } from "./content/classes";
import { NATIVE_GAMEPLAY_PALETTE } from "./content/native-font.generated";
import { mapUnitVisualOffset } from "./content/map-unit-presentation";
import { paintNativeDomText } from "./native-dom-text";
import { nativeNumericField } from "./native-text";
import {
  CLASS_EDITOR_LAYOUT,
  DEBUG_CLASS_EDITOR_COLUMNS,
  DEBUG_CLASS_EDITOR_FIELDS,
  DEBUG_CLASS_EDITOR_RECORDS,
  DEBUG_CLASS_EDITOR_ROWS,
  DEBUG_TERRAIN_EDITOR_RECORDS,
  DEBUG_TERRAIN_STRIP_CELLS,
  DEBUG_TERRAIN_TABLES,
  debugClassEditorValue,
  debugEditorClassId,
  debugTerrainEditorValue,
  isSelectableDebugTerrainSlot,
  TERRAIN_EDITOR_LAYOUT,
} from "./original-debug-data-editors";
import { stagedRenderAssetAvailable, stagedRenderAssetSource } from "./staged-render-asset-cache";
import type { Position } from "./types";

/**
 * `REMAKE-174` 原版Debug第三批的兩個整屏編輯器：兵種（`0000:1294`）與地型（`0000:1B3A`）。
 *
 * 原版不清畫面，直接畫在戰場那一頁上，所以格子與面板之外看得到戰場；複刻的編輯器同樣
 * 不鋪底。格框、面板、紅框、藍底行與括線／刻線的位置、大小和顏色都取自原版矩形描述，
 * 數字與原文用原版點陣字（墨 15、描邊 0，原版沿用戰場預設）。說明與「返回戰場」鈕是複刻
 * 自撰的現代介面，放在原版畫面沒用到的角落。
 */

const palette = (index: number): string => NATIVE_GAMEPLAY_PALETTE[index] ?? "#000";
const px = (value: number): string => `${value}px`;
const TEXT_STYLE = { mode: "normal", ink: palette(15), outline: palette(0) } as const;

/** 原版地圖棋子是 40×44 的一格，`d9fe` 從格的左上角畫；複刻的 PNG 已裁邊，所以底部置中。 */
const FIGURE_WIDTH = 40;
const FIGURE_HEIGHT = 43;

const framedCell = (
  cell: { readonly width: number; readonly height: number; readonly border: number; readonly fill: number },
  left: number,
  top: number,
): string => [
  `left:${px(left)}`,
  `top:${px(top)}`,
  `width:${px(cell.width)}`,
  `height:${px(cell.height)}`,
  `border:1px solid ${palette(cell.border)}`,
  `background:${palette(cell.fill)}`,
].join(";");

const rectStyle = (left: number, top: number, width: number, height: number, colour: number): string =>
  `left:${px(left)};top:${px(top)};width:${px(width)};height:${px(height)};background:${palette(colour)}`;

const figureMarkup = (): string =>
  `<span class="debug-data-figure" style="width:${px(FIGURE_WIDTH)};height:${px(FIGURE_HEIGHT)}"><img alt="" hidden></span>`;

/** 四條 1 px 選取線：上、左與格邊重合，下、右落在格外一格（原版 `135C..137A`、`14E8..1506`、`1510..152E`）。 */
const selectionMarkup = (kind: string, selection: { readonly width: number; readonly height: number; readonly colour: number }): string =>
  `<span class="debug-data-selection" data-debug-data-selection="${kind}" hidden
    style="width:${px(selection.width + 1)};height:${px(selection.height + 1)};border-color:${palette(selection.colour)}"></span>`;

const markerPair = (kind: string, bracket: { readonly width: number; readonly height: number; readonly colour: number },
  tick: { readonly width: number; readonly height: number; readonly colour: number }): string =>
  [0, 1].map((index) => `<span class="debug-data-marker" data-debug-data-marker="${kind}-bracket-${index}" hidden
      style="width:${px(bracket.width)};height:${px(bracket.height)};background:${palette(bracket.colour)}"></span>
    <span class="debug-data-marker" data-debug-data-marker="${kind}-tick-${index}" hidden
      style="width:${px(tick.width)};height:${px(tick.height)};background:${palette(tick.colour)}"></span>`).join("");

// ── 兵種 ──

const CLASS_GRID = CLASS_EDITOR_LAYOUT.grid;
const CLASS_PANEL = CLASS_EDITOR_LAYOUT.panel;
const CLASS_TABLE = CLASS_EDITOR_LAYOUT.table;

const classCellMarkup = (record: number): string => {
  const x = CLASS_GRID.x + (record % CLASS_GRID.columns) * CLASS_GRID.xStep;
  const y = CLASS_GRID.y + Math.floor(record / CLASS_GRID.columns) * CLASS_GRID.yStep;
  return `<span class="debug-data-cell" data-debug-class-record="${record}" data-testid="debug-class-record-${record}"
    style="${framedCell(CLASS_GRID.cell, x, y)}">${figureMarkup()}</span>`;
};

const classValueMarkup = (row: number, column: number): string =>
  `<span class="debug-data-text" data-debug-class-value="${row}-${column}" data-testid="debug-class-value-${row}-${column}"
    style="left:${px(CLASS_TABLE.columns[column] ?? 0)};top:${px(CLASS_TABLE.rows[row] ?? 0)}"></span>`;

const CLASS_EDITOR_MARKUP = `
  <section class="debug-data-editor debug-class-editor" data-testid="debug-class-editor" role="dialog"
    aria-label="原版Debug：兵種" hidden>
    ${Array.from({ length: DEBUG_CLASS_EDITOR_RECORDS }, (_, record) => classCellMarkup(record)).join("")}
    ${selectionMarkup("class", CLASS_EDITOR_LAYOUT.selection)}
    <span class="debug-data-panel" style="${framedCell({
      width: CLASS_PANEL.outer.width,
      height: CLASS_PANEL.outer.height,
      border: CLASS_PANEL.outer.colour,
      fill: CLASS_PANEL.inner.colour,
    }, CLASS_PANEL.outer.x, CLASS_PANEL.outer.y)}"></span>
    <span class="debug-data-row-band" hidden style="${rectStyle(CLASS_TABLE.rowBand.x, 0,
      CLASS_TABLE.rowBand.width, CLASS_TABLE.rowBand.height, CLASS_TABLE.rowBand.colour)}"></span>
    <span class="debug-data-panel-figure" style="left:${px(CLASS_PANEL.figure.x)};top:${px(CLASS_PANEL.figure.y)}">${figureMarkup()}</span>
    <span class="debug-data-text" data-debug-class-text="code" data-testid="debug-class-code"
      style="left:${px(CLASS_PANEL.code.x)};top:${px(CLASS_PANEL.code.y)}"></span>
    <span class="debug-data-text" data-debug-class-text="name" data-testid="debug-class-name"
      style="left:${px(CLASS_PANEL.name.x)};top:${px(CLASS_PANEL.name.y)}"></span>
    <span class="debug-data-text" data-debug-class-text="header"
      style="left:${px(CLASS_PANEL.header.x)};top:${px(CLASS_PANEL.header.y)}"></span>
    ${Array.from({ length: DEBUG_CLASS_EDITOR_ROWS }, (_, row) => Array.from(
      { length: DEBUG_CLASS_EDITOR_COLUMNS },
      (__, column) => classValueMarkup(row, column),
    ).join("")).join("")}
    ${markerPair("class", CLASS_TABLE.markers.bracket, CLASS_TABLE.markers.tick)}
    <div class="debug-data-help debug-class-help" data-testid="debug-class-help">
      <p>數字某一位：左鍵 ＋1、右鍵 −1</p>
      <p>表外左鍵：換成紅框職業</p>
      <p>鍵盤：方向鍵、Enter、Tab、＋／－</p>
      <p>只在本場戰鬥生效；返回時生命壓到新上限</p>
      <button type="button" data-debug-data-action="close" data-testid="debug-class-close">返回戰場</button>
    </div>
  </section>`;

// ── 地型 ──

const STRIP = TERRAIN_EDITOR_LAYOUT.strip;
const CLASS_CELLS = TERRAIN_EDITOR_LAYOUT.classGrid;
const VALUES = TERRAIN_EDITOR_LAYOUT.values;

const stripCellPosition = (slot: number): Position => ({
  x: STRIP.x + (slot % STRIP.columns) * STRIP.xStep,
  y: STRIP.y + Math.floor(slot / STRIP.columns) * STRIP.yStep,
});

const classCellPosition = (record: number): Position => ({
  x: CLASS_CELLS.x + (record % CLASS_CELLS.columns) * CLASS_CELLS.xStep,
  y: CLASS_CELLS.y + Math.floor(record / CLASS_CELLS.columns) * CLASS_CELLS.yStep,
});

const stripCellMarkup = (slot: number): string => {
  const { x, y } = stripCellPosition(slot);
  return `<span class="debug-data-cell" data-debug-terrain-slot="${slot}" data-testid="debug-terrain-slot-${slot}"
    style="${framedCell(STRIP.cell, x, y)}"><span class="debug-data-label"
      style="left:${px(STRIP.label.dx - 1)};top:${px(STRIP.label.dy - 1)}"></span></span>`;
};

const terrainRecordMarkup = (record: number): string => {
  const { x, y } = classCellPosition(record);
  const filled = record < DEBUG_TERRAIN_EDITOR_RECORDS;
  return `<span class="debug-data-cell" data-debug-terrain-record="${record}" data-testid="debug-terrain-record-${record}"
    data-filled="${filled}" style="${framedCell(CLASS_CELLS.cell, x, y)}">${filled ? `${figureMarkup()}
      ${DEBUG_TERRAIN_TABLES.map((table) => `<span class="debug-data-label" data-debug-terrain-value="${table}"
        data-testid="debug-terrain-value-${record}-${table}"
        style="left:${px(VALUES.dx - 1)};top:${px((table === "movement" ? VALUES.movementDy : VALUES.defenseDy) - 1)}"></span>`).join("")}`
    : ""}</span>`;
};

const TERRAIN_EDITOR_MARKUP = `
  <section class="debug-data-editor debug-terrain-editor" data-testid="debug-terrain-editor" role="dialog"
    aria-label="原版Debug：地型" hidden>
    ${Array.from({ length: DEBUG_TERRAIN_STRIP_CELLS }, (_, slot) => stripCellMarkup(slot)).join("")}
    ${selectionMarkup("strip", TERRAIN_EDITOR_LAYOUT.stripSelection)}
    <span class="debug-data-cell" data-testid="debug-terrain-current"
      style="${framedCell(STRIP.cell, TERRAIN_EDITOR_LAYOUT.current.x, TERRAIN_EDITOR_LAYOUT.current.y)}"><span
      class="debug-data-label" style="left:${px(STRIP.label.dx - 1)};top:${px(STRIP.label.dy - 1)}"></span></span>
    ${Array.from({ length: CLASS_CELLS.columns * CLASS_CELLS.rows }, (_, record) => terrainRecordMarkup(record)).join("")}
    ${selectionMarkup("record", TERRAIN_EDITOR_LAYOUT.classSelection)}
    ${markerPair("terrain", TERRAIN_EDITOR_LAYOUT.markers.bracket, TERRAIN_EDITOR_LAYOUT.markers.tick)}
    <div class="debug-data-help debug-terrain-help" data-testid="debug-terrain-help">
      <p>地形條左鍵選地形；職業格上行移動消耗、下行地形防禦，十位、個位左鍵 ＋1、右鍵 −1。
        鍵盤：方向鍵、Enter、Tab、＋／－。只在本場戰鬥生效。</p>
      <button type="button" data-debug-data-action="close" data-testid="debug-terrain-close">返回戰場</button>
    </div>
  </section>`;

export const ORIGINAL_DEBUG_DATA_EDITORS_MARKUP = `${CLASS_EDITOR_MARKUP}${TERRAIN_EDITOR_MARKUP}`;

/** 棋子圖只用這場戰鬥資源租約裡有的；開關打開時進場的關卡已一併備妥全部 side 2 棋子。 */
function figureSource(controller: GameController, record: number): string | undefined {
  const url = controller.enemyFigureUrl(debugEditorClassId(record));
  return stagedRenderAssetAvailable(url) ? stagedRenderAssetSource(url) : undefined;
}

function showFigure(host: Element | null, controller: GameController, record: number): void {
  const image = host?.querySelector<HTMLImageElement>("img");
  if (!image) return;
  const source = figureSource(controller, record);
  image.hidden = source === undefined;
  if (source && image.getAttribute("src") !== source) image.src = source;
  image.style.translate = `${mapUnitVisualOffset(debugEditorClassId(record), 2)}px 0`;
}

function place(element: HTMLElement | null | undefined, left: number | undefined, top: number | undefined): void {
  if (!element) return;
  element.hidden = left === undefined || top === undefined;
  if (left === undefined || top === undefined) return;
  element.style.left = px(left);
  element.style.top = px(top);
}

/** DOM 指標座標換成原生 640×350：編輯器鋪滿邏輯畫面，畫面縮放只是等比放大。 */
function nativePosition(surface: HTMLElement, event: MouseEvent): Position {
  const rect = surface.getBoundingClientRect();
  return {
    x: Math.floor((event.clientX - rect.left) * 640 / Math.max(1, rect.width)),
    y: Math.floor((event.clientY - rect.top) * 350 / Math.max(1, rect.height)),
  };
}

export function mountOriginalDebugDataEditors(
  root: HTMLElement,
  controller: GameController,
  signal: AbortSignal,
): () => void {
  const classEditor = root.querySelector<HTMLElement>(".debug-class-editor");
  const terrainEditor = root.querySelector<HTMLElement>(".debug-terrain-editor");
  if (!classEditor || !terrainEditor) throw new Error("missing original debug data editor surface");
  const header = classEditor.querySelector<HTMLElement>("[data-debug-class-text=header]");
  if (header) paintNativeDomText(header, NATIVE_DEBUG_CLASS_EDITOR.header, TEXT_STYLE, "經驗門檻、攻擊、防禦、生命、移動力、魔防、等級");
  terrainEditor.querySelectorAll<HTMLElement>("[data-debug-terrain-slot]").forEach((cell) => {
    const slot = Number(cell.dataset.debugTerrainSlot);
    const label = NATIVE_DEBUG_TERRAIN_EDITOR.labels[slot]?.label ?? "";
    const host = cell.querySelector<HTMLElement>(".debug-data-label");
    if (host) paintNativeDomText(host, label, TEXT_STYLE, isSelectableDebugTerrainSlot(slot) ? label : `${label}（不能選）`);
  });
  for (const record of Array.from({ length: DEBUG_CLASS_EDITOR_RECORDS }, (_, index) => index)) {
    classEditor.querySelector(`[data-debug-class-record="${record}"]`)
      ?.setAttribute("aria-label", className(debugEditorClassId(record)));
  }

  for (const surface of [classEditor, terrainEditor]) {
    surface.addEventListener("pointermove", (event) => {
      controller.hoverDebugDataEditor(nativePosition(surface, event));
    }, { signal });
    surface.addEventListener("click", (event) => {
      event.stopPropagation();
      if ((event.target as Element).closest("[data-debug-data-action=close]")) {
        controller.closeDebugDataEditor();
        return;
      }
      if ((event.target as Element).closest(".debug-data-help")) return;
      controller.pressDebugDataEditor(nativePosition(surface, event), 1);
    }, { signal });
    // 原版次鍵 −1；右鍵停在編輯器上，不讓外層把它當成「返回」。
    surface.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if ((event.target as Element).closest(".debug-data-help")) return;
      controller.pressDebugDataEditor(nativePosition(surface, event), -1);
    }, { signal });
  }
  // 原版只能用指標；複刻另給 ＋／－ 改位與 Tab 切換。方向鍵、Enter、Esc 走一般語義輸入。
  window.addEventListener("keydown", (event) => {
    if (!controller.debugDataEditorOpen || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (key === "+" || key === "=" || key === "]" || key === "PageUp") controller.stepDebugDataEditor(1);
    else if (key === "-" || key === "_" || key === "[" || key === "PageDown") controller.stepDebugDataEditor(-1);
    else if (key === "Tab") controller.toggleDebugDataEditorFocus();
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, signal });

  return () => {
    renderClassEditor(controller, classEditor);
    renderTerrainEditor(controller, terrainEditor);
  };
}

function renderSelection(element: HTMLElement | null, origin: Position | undefined): void {
  place(element, origin?.x, origin?.y);
}

function renderClassEditor(controller: GameController, surface: HTMLElement): void {
  const state = controller.debugClassEditor;
  surface.hidden = state === undefined;
  if (!state) return;
  surface.dataset.focus = state.focus;
  surface.dataset.highlighted = String(state.highlighted);
  surface.dataset.shown = String(state.shown);
  surface.dataset.row = state.row === undefined ? "" : String(state.row);
  surface.dataset.column = state.column === undefined ? "" : String(state.column);
  surface.dataset.digit = state.digit === undefined ? "" : String(state.digit);
  surface.querySelectorAll<HTMLElement>("[data-debug-class-record]").forEach((cell) => {
    const record = Number(cell.dataset.debugClassRecord);
    showFigure(cell, controller, record);
    cell.setAttribute("aria-current", String(record === state.shown));
  });
  renderSelection(surface.querySelector<HTMLElement>("[data-debug-data-selection=class]"), {
    x: CLASS_GRID.x + (state.highlighted % CLASS_GRID.columns) * CLASS_GRID.xStep,
    y: CLASS_GRID.y + Math.floor(state.highlighted / CLASS_GRID.columns) * CLASS_GRID.yStep,
  });
  const classId = debugEditorClassId(state.shown);
  showFigure(surface.querySelector(".debug-data-panel-figure"), controller, state.shown);
  const code = surface.querySelector<HTMLElement>("[data-debug-class-text=code]");
  if (code) paintNativeDomText(code, classDefinition(classId).codes.side1, TEXT_STYLE);
  const name = surface.querySelector<HTMLElement>("[data-debug-class-text=name]");
  if (name) paintNativeDomText(name, className(classId), TEXT_STYLE);
  const rowTop = state.row === undefined ? undefined : CLASS_TABLE.rows[state.row];
  place(surface.querySelector<HTMLElement>(".debug-data-row-band"), CLASS_TABLE.rowBand.x,
    rowTop === undefined ? undefined : rowTop + CLASS_TABLE.rowBand.dy);
  surface.querySelectorAll<HTMLElement>("[data-debug-class-value]").forEach((cell) => {
    const [row = 0, column = 0] = (cell.dataset.debugClassValue ?? "").split("-").map(Number);
    const value = debugClassEditorValue(state.shown, row, column);
    const field = NATIVE_DEBUG_CLASS_EDITOR.fields[column];
    cell.dataset.value = String(value);
    paintNativeDomText(cell, nativeNumericField(value), TEXT_STYLE,
      `第 ${row + 1} 行${field?.label ?? DEBUG_CLASS_EDITOR_FIELDS[column] ?? ""} ${value}`);
  });
  const columnLeft = state.column === undefined ? undefined : CLASS_TABLE.columns[state.column];
  const marked = rowTop !== undefined && columnLeft !== undefined && state.digit !== undefined;
  for (const [index, dy] of [CLASS_TABLE.markers.dyAbove, CLASS_TABLE.markers.dyBelow].entries()) {
    const top = marked ? rowTop + dy : undefined;
    place(surface.querySelector<HTMLElement>(`[data-debug-data-marker=class-bracket-${index}]`), columnLeft, top);
    place(surface.querySelector<HTMLElement>(`[data-debug-data-marker=class-tick-${index}]`),
      marked ? columnLeft + state.digit * CLASS_TABLE.digitWidth : undefined, top);
  }
}

function renderTerrainEditor(controller: GameController, surface: HTMLElement): void {
  const state = controller.debugTerrainEditor;
  surface.hidden = state === undefined;
  if (!state) return;
  surface.dataset.focus = state.focus;
  surface.dataset.terrainSlot = String(state.terrainSlot);
  surface.dataset.highlightedSlot = state.highlightedSlot === undefined ? "" : String(state.highlightedSlot);
  surface.dataset.highlightedRecord = state.highlightedRecord === undefined ? "" : String(state.highlightedRecord);
  surface.dataset.table = state.table ?? "";
  surface.dataset.digit = state.digit === undefined ? "" : String(state.digit);
  const terrainLabel = NATIVE_DEBUG_TERRAIN_EDITOR.labels[state.terrainSlot]?.label ?? "";
  const current = surface.querySelector<HTMLElement>("[data-testid=debug-terrain-current] .debug-data-label");
  if (current) paintNativeDomText(current, terrainLabel, TEXT_STYLE, `選定地形：${terrainLabel}`);
  surface.querySelectorAll<HTMLElement>("[data-debug-terrain-slot]").forEach((cell) => {
    cell.setAttribute("aria-current", String(Number(cell.dataset.debugTerrainSlot) === state.terrainSlot));
  });
  renderSelection(surface.querySelector<HTMLElement>("[data-debug-data-selection=strip]"),
    state.highlightedSlot === undefined ? undefined : stripCellPosition(state.highlightedSlot));
  renderSelection(surface.querySelector<HTMLElement>("[data-debug-data-selection=record]"),
    state.highlightedRecord === undefined ? undefined : classCellPosition(state.highlightedRecord));
  surface.querySelectorAll<HTMLElement>("[data-debug-terrain-record]").forEach((cell) => {
    const record = Number(cell.dataset.debugTerrainRecord);
    if (record >= DEBUG_TERRAIN_EDITOR_RECORDS) return;
    showFigure(cell, controller, record);
    cell.setAttribute("aria-label", className(debugEditorClassId(record)));
    for (const table of DEBUG_TERRAIN_TABLES) {
      const host = cell.querySelector<HTMLElement>(`[data-debug-terrain-value=${table}]`);
      if (!host) continue;
      const value = debugTerrainEditorValue(record, table, state.terrainSlot);
      host.dataset.value = String(value);
      paintNativeDomText(host, nativeNumericField(value), TEXT_STYLE,
        `${table === "movement" ? "移動消耗" : "地形防禦"} ${value}`);
    }
  });
  const record = state.highlightedRecord;
  const cell = record === undefined ? undefined : classCellPosition(record);
  const rowTop = cell && state.table
    ? cell.y + (state.table === "movement" ? VALUES.movementDy : VALUES.defenseDy)
    : undefined;
  const marked = cell !== undefined && rowTop !== undefined && state.digit !== undefined;
  const { markers, editableDigits } = TERRAIN_EDITOR_LAYOUT;
  for (const [index, dy] of [0, markers.dySecond].entries()) {
    const top = marked ? rowTop + dy : undefined;
    const left = marked ? cell.x + editableDigits.dx : undefined;
    place(surface.querySelector<HTMLElement>(`[data-debug-data-marker=terrain-bracket-${index}]`), left, top);
    place(surface.querySelector<HTMLElement>(`[data-debug-data-marker=terrain-tick-${index}]`),
      marked ? cell.x + editableDigits.dx + state.digit * editableDigits.digitWidth : undefined, top);
  }
}
