import type { GameController } from "./controller";
import { musicBoxSourceLabel, nativeMusicBoxLine } from "./content/music-box";
import {
  NATIVE_DEBUG_BEHAVIOUR_EDITOR,
  NATIVE_DEBUG_CELL_READOUT,
  NATIVE_DEBUG_UNIT_EDITOR,
} from "./content/debug-mode.generated";
import { DEBUG_AI_BEHAVIOUR_VALUES } from "./content/debug-mode-rules";
import { NATIVE_GAMEPLAY_PALETTE } from "./content/native-font.generated";
import { allyMapUnitAsset } from "./content/map-unit-assets";
import { mapUnitVisualOffset } from "./content/map-unit-presentation";
import { setMenuOpen } from "./menu-animation";
import { paintNativeDomText } from "./native-dom-text";
import { nativeNumericField } from "./native-text";
import { debugMenuAccessibleName } from "./original-debug-menus";
import { DEBUG_EDITOR_PAGES, DEBUG_EDITOR_SLOTS_PER_PAGE } from "./original-debug-editor";
import {
  BATTLE_TILE_HEIGHT,
  BATTLE_TILE_WIDTH,
  BATTLE_VIEWPORT_LEFT,
  BATTLE_VIEWPORT_TOP,
} from "./scaling-constants";
import { stagedRenderAssetAvailable, stagedRenderAssetSource } from "./staged-render-asset-cache";
import type { UnitClassId } from "./types";

/**
 * `REMAKE-174` 原版Debug與音樂盒的戰場 DOM 表面。
 *
 * - F2–F6 與技術二級選單共用原版選單外框，原文（含字串裡的半形空格）以原版點陣字繪製；
 * - F1 行為面板照 `0000:2302` 的 120×270 面板、13 列與紅字標出現值；
 * - 我／敵 EDIT 照 `0000:0ABE` 的整屏版面：深藍底、3 欄 × 5 列、四個頁籤與 EXIT；
 * - 格號（鍵 2）與範圍（Caps Lock+1）讀數用原版五位數字；
 * - 音樂盒是複刻自己的清單介面，原版那一行之外的用途說明與操作提示屬複刻自撰，用現代字體。
 */

const palette = (index: number): string => NATIVE_GAMEPLAY_PALETTE[index] ?? "#000";

const BEHAVIOUR = NATIVE_DEBUG_BEHAVIOUR_EDITOR.layout;
const EDIT = NATIVE_DEBUG_UNIT_EDITOR.layout;

const px = (value: number): string => `${value}px`;

/** 三張矩形疊成的框：第一張的顏色留在上緣與左緣，第二張留在下緣與右緣，第三張填內部。 */
const bevelStyle = (box: {
  readonly width: number;
  readonly height: number;
  readonly topLeft: number;
  readonly bottomRight: number;
  readonly fill: number;
}, left: number, top: number): string => [
  `left:${px(left)}`,
  `top:${px(top)}`,
  `width:${px(box.width)}`,
  `height:${px(box.height)}`,
  "border-style:solid",
  "border-width:1px",
  `border-color:${palette(box.topLeft)} ${palette(box.bottomRight)} ${palette(box.bottomRight)} ${palette(box.topLeft)}`,
  `background:${palette(box.fill)}`,
].join(";");

const slotMarkup = (index: number): string => {
  const { grid } = EDIT;
  const column = Math.floor(index / grid.rows);
  const row = index % grid.rows;
  const x = grid.x + column * grid.xStep;
  const y = grid.y + row * grid.yStep;
  return `<div class="debug-edit-slot" data-debug-edit-index="${index}" data-testid="debug-edit-slot-${index}"
      style="left:${px(x)};top:${px(y)};width:${px(EDIT.frame.width)};height:${px(EDIT.frame.height)}">
    <span class="debug-edit-box" style="${bevelStyle(EDIT.frame, 0, 0)}"></span>
    <button type="button" class="debug-edit-box debug-edit-figure" data-debug-edit-field="figure"
      aria-label="職業（左鍵上一個、右鍵下一個）"
      style="${bevelStyle(EDIT.figureWell, EDIT.figureWell.dx, EDIT.figureWell.dy)}"><img alt="" hidden></button>
    <button type="button" class="debug-edit-box debug-edit-behaviour" data-debug-edit-field="behaviour"
      aria-label="AI 行為（左鍵上一個、右鍵下一個）"
      style="${bevelStyle(EDIT.behaviourBox, EDIT.behaviourBox.dx, EDIT.behaviourBox.dy)}"></button>
    <span class="debug-edit-text" data-debug-edit-text="behaviour"
      style="left:${px(EDIT.behaviour.dx)};top:${px(EDIT.behaviour.dy)}"></span>
    <span class="debug-edit-number-backing" style="left:${px(EDIT.slotNumber.backing.dx)};top:${px(EDIT.slotNumber.backing.dy)};
      width:${px(EDIT.slotNumber.backing.width)};height:${px(EDIT.slotNumber.backing.height)};
      background:${palette(EDIT.slotNumber.backing.colour)}"></span>
    <span class="debug-edit-text" data-debug-edit-text="slot"
      style="left:${px(EDIT.slotNumber.text.dx)};top:${px(EDIT.slotNumber.text.dy)}"></span>
    <button type="button" class="debug-edit-box debug-edit-name" data-debug-edit-field="name"
      style="${bevelStyle(EDIT.nameBox, EDIT.nameBox.dx, EDIT.nameBox.dy)}"></button>
    <span class="debug-edit-text" data-debug-edit-text="name"
      style="left:${px(EDIT.name.dx)};top:${px(EDIT.name.dy)}"></span>
  </div>`;
};

const behaviourRowMarkup = ({ value, label }: { value: number; label: string }): string => {
  const selectable = DEBUG_AI_BEHAVIOUR_VALUES.includes(value);
  const rowTop = BEHAVIOUR.highlight.yBase + value * BEHAVIOUR.labels.pitch - BEHAVIOUR.panel.y;
  const tag = selectable ? "button" : "span";
  return `<${tag} ${selectable ? `type="button" data-debug-behaviour-row="${value}"` : "aria-disabled=\"true\""}
    class="debug-behaviour-row" data-value="${value}" data-testid="debug-behaviour-row-${value}"
    style="left:${px(BEHAVIOUR.highlight.x - BEHAVIOUR.panel.x)};top:${px(rowTop)};
      width:${px(BEHAVIOUR.highlight.width)};height:${px(BEHAVIOUR.labels.pitch)}">
    <span class="debug-behaviour-label" data-label="${label}"
      style="left:${px(BEHAVIOUR.labels.x - BEHAVIOUR.highlight.x)};
        top:${px(BEHAVIOUR.labels.y - BEHAVIOUR.highlight.yBase)}"></span>
  </${tag}>`;
};

export const ORIGINAL_DEBUG_UI_MARKUP = `
  <section class="debug-menu action-menu native-command-menu" id="debug-menu"
    data-testid="debug-menu" role="menu" aria-label="原版Debug" hidden></section>
  <section class="debug-behaviour-editor" data-testid="debug-behaviour-editor" role="dialog"
    aria-label="原版Debug：AI 行為" hidden
    style="left:${px(BEHAVIOUR.panel.x)};top:${px(BEHAVIOUR.panel.y)};width:${px(BEHAVIOUR.panel.width)};
      height:${px(BEHAVIOUR.panel.height)};background:${palette(BEHAVIOUR.panel.colour)}">
    <span class="debug-behaviour-inner" style="left:${px(BEHAVIOUR.inner.x - BEHAVIOUR.panel.x)};
      top:${px(BEHAVIOUR.inner.y - BEHAVIOUR.panel.y)};width:${px(BEHAVIOUR.inner.width)};
      height:${px(BEHAVIOUR.inner.height)};background:${palette(BEHAVIOUR.inner.colour)}"></span>
    <span class="debug-behaviour-figure" style="left:${px(BEHAVIOUR.figure.x - BEHAVIOUR.panel.x)};
      top:${px(BEHAVIOUR.figure.y - BEHAVIOUR.panel.y)}"><img alt="" hidden></span>
    <span class="debug-behaviour-highlight" hidden style="left:${px(BEHAVIOUR.highlight.x - BEHAVIOUR.panel.x)};
      width:${px(BEHAVIOUR.highlight.width + 1)};height:${px(BEHAVIOUR.highlight.height + 1)};
      border-color:${palette(BEHAVIOUR.highlight.colour)}"></span>
    ${NATIVE_DEBUG_BEHAVIOUR_EDITOR.labels.map(behaviourRowMarkup).join("")}
  </section>
  <section class="debug-unit-editor" data-testid="debug-unit-editor" role="dialog" hidden
    style="background:${palette(EDIT.background.colour)}">
    ${Array.from({ length: DEBUG_EDITOR_SLOTS_PER_PAGE }, (_, index) => slotMarkup(index)).join("")}
    ${Array.from({ length: DEBUG_EDITOR_PAGES }, (_, page) => `<button type="button" class="debug-edit-tab"
      data-debug-edit-page="${page}" data-testid="debug-edit-page-${page}" aria-label="第 ${page + 1} 頁"
      style="${bevelStyle(EDIT.pageTabs.box, EDIT.pageTabs.x, EDIT.pageTabs.y + page * EDIT.pageTabs.yStep)}">
      <span class="debug-edit-tab-fill" style="width:${px(EDIT.pageTabs.active.width)};
        height:${px(EDIT.pageTabs.active.height)};background:${palette(EDIT.pageTabs.active.colour)}"></span>
    </button>`).join("")}
    <button type="button" class="debug-edit-tab debug-edit-exit" data-debug-action="close-unit-editor"
      data-testid="debug-edit-exit" aria-label="EXIT"
      style="${bevelStyle(EDIT.exit.box, EDIT.exit.x, EDIT.exit.y)}">
      <span class="debug-edit-text" data-debug-edit-text="exit"
        style="left:${px(EDIT.exit.text.x - EDIT.exit.x - 1)};top:${px(EDIT.exit.text.y - EDIT.exit.y - 1)}"></span>
    </button>
    <p class="debug-edit-help" data-testid="debug-edit-help">方向鍵選槽　Enter 移出／放回　－／＋ 職業　［／］ 行為　PageUp／PageDown 換頁　Esc 返回<br>
      棋子框與行為框：左鍵上一個、右鍵下一個。職業只開放這場戰鬥已備妥圖像的普通職業。</p>
  </section>
  <section class="music-box-panel modal-panel" id="music-box" data-testid="music-box"
    role="dialog" aria-label="音樂盒" hidden>
    <span class="panel-kicker">MUSIC BOX</span><h2>音樂盒</h2>
    <div class="music-box-list" role="listbox" aria-label="曲目" data-testid="music-box-list"></div>
    <p class="music-box-detail" data-testid="music-box-detail"></p>
    <div class="music-box-actions">
      <button type="button" data-debug-action="music-box-play" data-testid="music-box-play">播放</button>
      <button type="button" data-debug-action="music-box-restore" data-testid="music-box-restore">恢復原曲</button>
      <button type="button" data-debug-action="close-music-box" data-testid="close-music-box">返回</button>
    </div>
  </section>
  <div class="debug-range-readout" data-testid="debug-range-readout" hidden></div>
  <div class="debug-cell-readout" data-testid="debug-cell-readout" hidden>
    ${NATIVE_DEBUG_CELL_READOUT.fields.map(({ id, clear }) => `<span class="debug-cell-readout-field"
      data-field="${id}" data-testid="debug-cell-readout-${id}"
      style="left:${clear.x}px;top:${clear.y}px;width:${clear.width}px;height:${clear.height}px"></span>`).join("")}
  </div>`;

/**
 * Caps Lock+1 的每格數字：`0000:8448` 以 `(格左緣 − 4, 格上緣)` 呼叫 `EA04`，五位數欄位
 * （`EF56`）以一般模式繪製，空白前進 8 px、數字前進 9 px，蓋在該格的一切表現之上。
 */
const RANGE_READOUT_TEXT_DX = -4;

const escapeHtml = (text: string): string => text
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;");

const behaviourLabel = (value: number | undefined): string =>
  value === undefined ? "" : NATIVE_DEBUG_BEHAVIOUR_EDITOR.labels[value]?.label ?? String(value);

const stateLabel = (state: string): string => state === "present"
  ? "在場"
  : state === "departed" ? "已離場，可放回" : "不在這場戰鬥";

/** 棋子圖只在這場戰鬥的資源租約裡有它時才顯示，不為除錯介面另發原始素材請求。 */
function figureSource(controller: GameController, side: 1 | 2, classId: UnitClassId): string | undefined {
  const url = side === 1 ? allyMapUnitAsset(classId) : controller.enemyFigureUrl(classId);
  return url && stagedRenderAssetAvailable(url) ? stagedRenderAssetSource(url) : undefined;
}

function showFigure(image: HTMLImageElement, source: string | undefined, offset: number): void {
  image.hidden = source === undefined;
  if (source && image.getAttribute("src") !== source) image.src = source;
  image.style.translate = `${offset}px 0`;
}

export function mountOriginalDebugUi(
  root: HTMLElement,
  controller: GameController,
  signal: AbortSignal,
): () => void {
  const menu = root.querySelector<HTMLElement>("#debug-menu");
  const behaviourEditor = root.querySelector<HTMLElement>(".debug-behaviour-editor");
  const unitEditor = root.querySelector<HTMLElement>(".debug-unit-editor");
  const musicBox = root.querySelector<HTMLElement>("#music-box");
  const musicList = musicBox?.querySelector<HTMLElement>(".music-box-list");
  const musicDetail = musicBox?.querySelector<HTMLElement>(".music-box-detail");
  const restoreButton = musicBox?.querySelector<HTMLButtonElement>("[data-debug-action=music-box-restore]");
  const readout = root.querySelector<HTMLElement>(".debug-cell-readout");
  const rangeReadout = root.querySelector<HTMLElement>(".debug-range-readout");
  const behaviourHighlight = behaviourEditor?.querySelector<HTMLElement>(".debug-behaviour-highlight");
  const behaviourFigure = behaviourEditor?.querySelector<HTMLImageElement>(".debug-behaviour-figure img");
  const exitLabel = unitEditor?.querySelector<HTMLElement>("[data-debug-edit-text=exit]");
  if (!menu || !behaviourEditor || !unitEditor || !musicBox || !musicList || !musicDetail
    || !restoreButton || !readout || !rangeReadout || !behaviourHighlight || !behaviourFigure || !exitLabel) {
    throw new Error("missing original debug UI surface");
  }
  paintNativeDomText(exitLabel, NATIVE_DEBUG_UNIT_EDITOR.exitLabel, { mode: "normal" });

  musicList.innerHTML = controller.musicBoxTracks.map((track, index) => {
    const nativeLine = nativeMusicBoxLine(track) ?? musicBoxSourceLabel(track);
    const groupHeading = index === 0
      ? `<span class="music-box-heading" role="presentation">原版名單</span>`
      : track.group === "extra" && controller.musicBoxTracks[index - 1]?.group !== "extra"
        ? `<span class="music-box-heading" role="presentation">原版未收錄</span>`
        : "";
    return `${groupHeading}<button type="button" role="option" class="music-box-track"
      data-music-box-index="${index}" data-testid="music-box-track-${track.id}" data-track-group="${track.group}">
      <span class="music-box-native">${escapeHtml(nativeLine)}</span>
      <span class="music-box-usage">${escapeHtml(track.usage)}</span>
    </button>`;
  }).join("");
  const trackButtons = [...musicList.querySelectorAll<HTMLButtonElement>("[data-music-box-index]")];
  const editSlots = [...unitEditor.querySelectorAll<HTMLElement>("[data-debug-edit-index]")];

  const editSlotFor = (target: Element): number | undefined => {
    const slotElement = target.closest<HTMLElement>("[data-debug-edit-index]");
    const editor = controller.debugUnitEditor;
    if (!slotElement || !editor) return undefined;
    return editor.page * DEBUG_EDITOR_SLOTS_PER_PAGE + Number(slotElement.dataset.debugEditIndex);
  };

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const menuItem = target.closest<HTMLElement>("[data-debug-menu-index]");
    if (menuItem) {
      controller.selectDebugMenuItem(Number(menuItem.dataset.debugMenuIndex));
      controller.activateDebugMenuSelection();
      return;
    }
    const behaviourRow = target.closest<HTMLElement>("[data-debug-behaviour-row]");
    if (behaviourRow) {
      controller.selectDebugBehaviourRow(Number(behaviourRow.dataset.debugBehaviourRow));
      controller.applyDebugBehaviourSelection();
      return;
    }
    const page = target.closest<HTMLElement>("[data-debug-edit-page]");
    if (page) {
      controller.showDebugUnitEditorPage(Number(page.dataset.debugEditPage));
      return;
    }
    const field = target.closest<HTMLElement>("[data-debug-edit-field]")?.dataset.debugEditField;
    const slot = editSlotFor(target);
    if (field && slot !== undefined) {
      controller.focusDebugUnitEditorSlot(slot);
      if (field === "name") controller.toggleDebugUnitPresence(slot);
      else if (field === "figure") controller.stepDebugUnitClass(-1, slot);
      else controller.stepDebugUnitBehaviour(-1, slot);
      return;
    }
    const track = target.closest<HTMLElement>("[data-music-box-index]");
    if (track) {
      controller.selectMusicBoxTrack(Number(track.dataset.musicBoxIndex));
      return;
    }
    const action = target.closest<HTMLElement>("[data-debug-action]")?.dataset.debugAction;
    if (action === "open-music-box") controller.openMusicBox("musicSettings");
    else if (action === "close-music-box") controller.closeMusicBox();
    else if (action === "music-box-play") controller.playMusicBoxSelection();
    else if (action === "music-box-restore") controller.restoreGameMusic();
    else if (action === "close-unit-editor") controller.closeDebugUnitEditor();
  }, { signal });
  // 原版棋子框與行為框：次鍵 +1。右鍵停在框上，不讓外層把它當成「返回」。
  unitEditor.addEventListener("contextmenu", (event) => {
    const target = event.target as Element;
    const field = target.closest<HTMLElement>("[data-debug-edit-field]")?.dataset.debugEditField;
    const slot = editSlotFor(target);
    if ((field !== "figure" && field !== "behaviour") || slot === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    controller.focusDebugUnitEditorSlot(slot);
    if (field === "figure") controller.stepDebugUnitClass(1, slot);
    else controller.stepDebugUnitBehaviour(1, slot);
  }, { signal });
  root.addEventListener("dblclick", (event) => {
    const track = (event.target as Element).closest<HTMLElement>("[data-music-box-index]");
    if (!track) return;
    controller.selectMusicBoxTrack(Number(track.dataset.musicBoxIndex));
    controller.playMusicBoxSelection();
  }, { signal });
  root.addEventListener("pointermove", (event) => {
    const target = event.target as Element;
    const menuItem = target.closest<HTMLElement>("[data-debug-menu-index]");
    if (menuItem) controller.selectDebugMenuItem(Number(menuItem.dataset.debugMenuIndex));
    const behaviourRow = target.closest<HTMLElement>("[data-debug-behaviour-row]");
    if (behaviourRow) controller.selectDebugBehaviourRow(Number(behaviourRow.dataset.debugBehaviourRow));
    const slot = editSlotFor(target);
    if (slot !== undefined) controller.focusDebugUnitEditorSlot(slot);
  }, { signal });
  // EDIT 的鍵盤補充：原版只能用指標，複刻另給職業、行為與換頁的按鍵。
  window.addEventListener("keydown", (event) => {
    const editor = controller.debugUnitEditor;
    if (!editor || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (key === "-" || key === "_") controller.stepDebugUnitClass(-1);
    else if (key === "=" || key === "+") controller.stepDebugUnitClass(1);
    else if (key === "[" || key === "{") controller.stepDebugUnitBehaviour(-1);
    else if (key === "]" || key === "}") controller.stepDebugUnitBehaviour(1);
    else if (key === "PageUp") controller.showDebugUnitEditorPage((editor.page + DEBUG_EDITOR_PAGES - 1) % DEBUG_EDITOR_PAGES);
    else if (key === "PageDown") controller.showDebugUnitEditorPage((editor.page + 1) % DEBUG_EDITOR_PAGES);
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, signal });

  let previousMusicIndex = -1;
  let previousMenuKey = "";
  return () => {
    const debugMenu = controller.debugMenu;
    if (setMenuOpen(menu, debugMenu !== undefined) && debugMenu) {
      const items = controller.debugMenuItems;
      const menuKey = [
        debugMenu.kind,
        "side" in debugMenu ? debugMenu.side : "",
        "group" in debugMenu ? debugMenu.group : "",
        "category" in debugMenu ? debugMenu.category : "",
      ].join(":");
      menu.dataset.kind = debugMenu.kind;
      menu.dataset.items = String(items.length);
      menu.setAttribute("aria-label", debugMenuAccessibleName(debugMenu));
      if (menuKey !== previousMenuKey) {
        previousMenuKey = menuKey;
        menu.innerHTML = items.map((item, index) => `<button type="button" role="menuitem"
          data-debug-menu-index="${index}" data-testid="debug-menu-${item.code}"
          ${item.enabled ? "" : "aria-disabled=\"true\""}><span class="native-command-label"></span></button>`).join("");
        menu.querySelectorAll<HTMLElement>(".native-command-label").forEach((label, index) => {
          const text = items[index]?.label ?? "";
          // 原版字串自帶半形空格（`敵  1   `），照原樣畫，讀屏只讀去掉空格的文字。
          paintNativeDomText(label, text, {}, text.replace(/\s+/gu, " ").trim());
        });
      }
      menu.querySelectorAll<HTMLButtonElement>("[data-debug-menu-index]").forEach((button, index) => {
        const selected = index === debugMenu.index;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-current", String(selected));
      });
    } else if (!debugMenu) {
      previousMenuKey = "";
    }

    renderBehaviourEditor(controller, behaviourEditor, behaviourHighlight, behaviourFigure);
    renderUnitEditor(controller, unitEditor, editSlots);

    musicBox.hidden = !controller.musicBoxOpen;
    if (controller.musicBoxOpen) {
      const playingId = controller.musicBoxPlayback?.trackId;
      trackButtons.forEach((button, index) => {
        const selected = index === controller.musicBoxIndex;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-selected", String(selected));
        button.dataset.playing = String(controller.musicBoxTracks[index]?.id === playingId);
      });
      if (previousMusicIndex !== controller.musicBoxIndex) {
        trackButtons[controller.musicBoxIndex]?.scrollIntoView({ block: "nearest" });
        previousMusicIndex = controller.musicBoxIndex;
      }
      const selectedTrack = controller.musicBoxTracks[controller.musicBoxIndex];
      const playingTrack = controller.musicBoxTracks.find(({ id }) => id === playingId);
      musicDetail.textContent = playingTrack
        ? `試聽中：${playingTrack.legacyName ?? musicBoxSourceLabel(playingTrack)}（${musicBoxSourceLabel(playingTrack)}）。關閉後繼續播放，直到遊戲下一次換曲。`
        : selectedTrack
          ? `${musicBoxSourceLabel(selectedTrack)}・${selectedTrack.kind === "loop" ? "單曲循環" : "入場段接循環段"}`
          : "";
      restoreButton.disabled = playingId === undefined;
    } else {
      previousMusicIndex = -1;
    }

    const cellReadout = controller.visibleDebugCellReadout;
    readout.hidden = cellReadout === undefined;
    if (cellReadout) {
      for (const field of readout.querySelectorAll<HTMLElement>("[data-field]")) {
        const value = field.dataset.field === "difficulty" ? cellReadout.difficulty : cellReadout.cell;
        paintNativeDomText(field, nativeNumericField(value), { mode: "normal" }, String(value));
      }
    }

    const range = controller.visibleDebugRangeReadout;
    rangeReadout.hidden = range === undefined;
    if (range) {
      const cellCount = range.columns * range.rows;
      while (rangeReadout.childElementCount < cellCount) rangeReadout.append(document.createElement("span"));
      while (rangeReadout.childElementCount > cellCount) rangeReadout.lastElementChild?.remove();
      rangeReadout.dataset.origin = `${range.origin.x},${range.origin.y}`;
      [...rangeReadout.children].forEach((child, index) => {
        if (!(child instanceof HTMLElement)) return;
        const column = index % range.columns;
        const row = Math.floor(index / range.columns);
        const value = range.values[index] ?? 0;
        child.style.left = px(BATTLE_VIEWPORT_LEFT + column * BATTLE_TILE_WIDTH + RANGE_READOUT_TEXT_DX);
        child.style.top = px(BATTLE_VIEWPORT_TOP + row * BATTLE_TILE_HEIGHT);
        child.dataset.value = String(value);
        paintNativeDomText(child, nativeNumericField(value), { mode: "normal" }, String(value));
      });
    }
  };
}

function renderBehaviourEditor(
  controller: GameController,
  panel: HTMLElement,
  highlight: HTMLElement,
  figure: HTMLImageElement,
): void {
  const editor = controller.debugBehaviourEditor;
  const unit = controller.debugBehaviourEditorUnit;
  panel.hidden = !editor || !unit;
  if (!editor || !unit) return;
  const current = controller.debugBehaviourEditorValue;
  panel.dataset.unitId = unit.id;
  panel.dataset.current = String(current ?? "");
  // `[DD]` 原版這裡固定取 side 2 圖組（DS:`022D`）；複刻畫單位自己在棋盤上的棋子，不另發素材請求。
  showFigure(figure, figureSource(controller, unit.side, unit.classId), mapUnitVisualOffset(unit.classId, unit.side));
  highlight.hidden = false;
  highlight.style.top = px(BEHAVIOUR.highlight.yBase + editor.index * BEHAVIOUR.labels.pitch - BEHAVIOUR.panel.y);
  for (const row of panel.querySelectorAll<HTMLElement>(".debug-behaviour-row")) {
    const value = Number(row.dataset.value);
    const isCurrent = value === current;
    row.setAttribute("aria-current", String(isCurrent));
    row.classList.toggle("is-selected", value === editor.index);
    const label = row.querySelector<HTMLElement>(".debug-behaviour-label");
    if (!label) continue;
    paintNativeDomText(label, label.dataset.label ?? "", {
      mode: "normal",
      ink: palette(isCurrent ? BEHAVIOUR.labels.currentInk : BEHAVIOUR.labels.ink),
    });
  }
}

function renderUnitEditor(
  controller: GameController,
  panel: HTMLElement,
  slots: readonly HTMLElement[],
): void {
  const editor = controller.debugUnitEditor;
  panel.hidden = !editor;
  if (!editor) return;
  panel.dataset.side = String(editor.side);
  panel.dataset.page = String(editor.page);
  panel.setAttribute("aria-label", editor.side === 1 ? "原版Debug：我 EDIT" : "原版Debug：敵 EDIT");
  const entries = controller.debugUnitEditorSlots;
  const focus = controller.debugUnitEditorFocusSlot;
  for (const tab of panel.querySelectorAll<HTMLElement>("[data-debug-edit-page]")) {
    const active = Number(tab.dataset.debugEditPage) === editor.page;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-current", String(active));
  }
  slots.forEach((element, index) => {
    const slot = editor.page * DEBUG_EDITOR_SLOTS_PER_PAGE + index;
    const entry = entries[slot];
    element.dataset.slot = String(slot);
    element.dataset.state = entry?.state ?? "empty";
    element.dataset.classId = entry?.classId ?? "";
    element.classList.toggle("is-focused", slot === focus);
    const image = element.querySelector<HTMLImageElement>(".debug-edit-figure img");
    if (image) {
      showFigure(
        image,
        entry?.classId ? figureSource(controller, editor.side, entry.classId) : undefined,
        entry?.classId ? mapUnitVisualOffset(entry.classId, editor.side) : 0,
      );
    }
    const number = element.querySelector<HTMLElement>("[data-debug-edit-text=slot]");
    if (number) {
      paintNativeDomText(number, nativeNumericField(slot), {
        mode: "normal",
        ink: palette(15),
        outline: palette(0),
      }, String(slot));
    }
    const name = element.querySelector<HTMLElement>("[data-debug-edit-text=name]");
    if (name) {
      const present = entry?.state === "present";
      // 原版名字在場用深色（墨 0、描邊 8）、不在場用白字（`0000:1020..103B`）。
      paintNativeDomText(name, entry?.name ?? "", {
        mode: "normal",
        ink: palette(present ? EDIT.name.present.ink : EDIT.name.absent.ink),
        outline: palette(present ? EDIT.name.present.outline : EDIT.name.absent.outline),
      }, entry?.name ? `${entry.name}（${stateLabel(entry.state)}）` : "空槽");
    }
    const behaviour = element.querySelector<HTMLElement>("[data-debug-edit-text=behaviour]");
    if (behaviour) {
      const shown = entry?.state === "present" || entry?.state === "departed";
      paintNativeDomText(behaviour, shown ? behaviourLabel(entry?.behaviour) : "", {
        mode: "normal",
        ink: palette(EDIT.behaviour.ink),
        outline: palette(EDIT.behaviour.outline),
      });
    }
  });
}
