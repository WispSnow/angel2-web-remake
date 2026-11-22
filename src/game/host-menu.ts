// 樣式由 `styles.css` 以 @import 帶入：本模組經 `scaling.ts` 被 e2e 規格間接載入，
// Playwright 的 TS 載入器無法解析 CSS import（見 `program-pause.css` 的同一做法）。
import {
  IMAGE_SCALING_OPTIONS,
  imageScalingMode,
  onImageScalingChange,
  setImageScalingMode,
} from "./display-settings";
import { createHostOverlayLauncher, HOST_OVERLAYS, type HostOverlayId } from "./host-overlays";
import {
  INTERFACE_ZOOM_HINT,
  INTERFACE_ZOOM_OPTIONS,
  interfaceZoom,
  onInterfaceZoomChange,
  setInterfaceZoom,
} from "./interface-zoom";
import { applyStagedNativeUiAssets } from "./native-ui-assets";
import {
  capsLockStateAfter,
  onOriginalDebugModeChange,
  ORIGINAL_DEBUG_CAPS_LOCK_OFF_TEXT,
  ORIGINAL_DEBUG_CAPS_LOCK_ON_TEXT,
  ORIGINAL_DEBUG_HOTKEYS,
  ORIGINAL_DEBUG_OFF_TEXT,
  originalDebugModeEnabled,
  setOriginalDebugModeEnabled,
} from "./original-debug-mode";
import { setProgramPaused } from "./program-clock";
import { registerProgramPausePresenter } from "./program-pause";
import { LOGICAL_SCREEN_WIDTH } from "./scaling-constants";

/**
 * 宿主選單：畫面右下角的寶石入口，以及按下後蓋在遊戲畫面上的暫停選單。
 *
 * 用戶於 2026-11-22 決定把原本畫面下方那一行宿主控制項（畫面縮放、暫停、原版Debug、
 * 復刻說明、圖鑑、RoadMap）收進這裡：頁面只剩遊戲畫面，入口平時 30% 不透明、指到或
 * 聚焦才完整顯示；打開選單就是暫停遊戲，原本獨立的「暫停」按鈕與現代暫停框因此不再
 * 需要。
 *
 * - 入口按鈕掛在 640×350 邏輯螢幕裡（跟著遊戲縮放），落在回合框右端的圓弧上，不壓
 *   文字也不壓任何可操作的原版控件。它是復刻增強，不屬於原版構圖。
 * - 選單本體掛在暫停層裡（`program-pause.ts` 的呈現者），因為暫停時整個 `#app` 都是
 *   `inert`；它按遊戲畫面的位置與倍率疊上去，看起來就在畫面上層。
 * - 外框借用原版系統選單（網點玻璃底、金色藤蔓框、劍形選中條）與勝利條件面板的素材，
 *   文字則照字體分層規則用現代字體——玩家一眼就能分辨這不是原版選單。
 *
 * 這些選擇只改宿主表現：不進模擬狀態、PRNG、規則身份或存檔。
 */

/** 入口在邏輯螢幕裡的落點：回合框（480..640×322..350）右端圓弧，「合」字止於 x≈614。 */
const TRIGGER = { x: 618, y: 327, size: 20 } as const;

const ROW_HEIGHT = 24;
const LIST_WIDTH = 144;
const LIST_PADDING_TOP = 16;
const LIST_PADDING_BOTTOM = 12;
const DESCRIPTION_WIDTH = 264;
/** 「原版Debug」要放狀態句加整張熱鍵表，說明框至少這麼高。 */
const DESCRIPTION_MIN_HEIGHT = 204;
const COLUMN_GAP = 6;
const TITLE_HEIGHT = 26;
const TITLE_GAP = 10;
const CAPTION_GAP = 8;
const CAPTION_HEIGHT = 14;
const GROUP_WIDTH = DESCRIPTION_WIDTH + COLUMN_GAP + LIST_WIDTH;
const LIST_LEFT = DESCRIPTION_WIDTH + COLUMN_GAP;
const BODY_TOP = TITLE_HEIGHT + TITLE_GAP;
/** 子選單從母列往右下錯開，與原版巢狀選單一樣壓住母選單的右半。 */
const SUBMENU_OFFSET = { x: 72, y: 8 } as const;
/** 視窗太小時選單至少留這麼多邊。 */
const VIEWPORT_MARGIN = 8;
/** 選單與入口位置上紅寶石之間至少留的 CSS px。 */
const CLOSE_GAP = 4;

type RowId = "resume" | "image-scaling" | "interface-zoom" | HostOverlayId | "original-debug";

interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly hint: string;
}

interface ChoiceRow {
  readonly options: readonly ChoiceOption[];
  read(): string;
  write(value: string): void;
}

interface MenuRow {
  readonly id: RowId;
  readonly label: string;
  readonly kind: "resume" | "choice" | "overlay" | "toggle";
  readonly hint?: string;
  readonly choice?: ChoiceRow;
}

export interface HostMenuOptions {
  /** `REMAKE-174` 的「原版Debug」只屬於正式遊戲表面；實驗室不掛。 */
  readonly originalDebugToggle: boolean;
  /** 桌面版才有「介面縮放」：網頁版用瀏覽器自己的縮放。 */
  readonly interfaceZoom: boolean;
}

const IMAGE_SCALING_CHOICE: ChoiceRow = {
  options: IMAGE_SCALING_OPTIONS.map(({ mode, label, hint }) => ({ value: mode, label, hint })),
  read: imageScalingMode,
  write: (value) => {
    const option = IMAGE_SCALING_OPTIONS.find(({ mode }) => mode === value);
    if (option) setImageScalingMode(option.mode);
  },
};

const INTERFACE_ZOOM_CHOICE: ChoiceRow = {
  options: INTERFACE_ZOOM_OPTIONS.map(({ zoom, label }) => ({
    value: `${zoom}`,
    label,
    hint: INTERFACE_ZOOM_HINT,
  })),
  read: () => `${interfaceZoom()}`,
  write: (value) => {
    const option = INTERFACE_ZOOM_OPTIONS.find(({ zoom }) => `${zoom}` === value);
    if (option) setInterfaceZoom(option.zoom);
  },
};

const menuRows = (options: HostMenuOptions): readonly MenuRow[] => [
  { id: "resume", label: "繼續遊戲", kind: "resume" },
  { id: "image-scaling", label: "畫面縮放", kind: "choice", choice: IMAGE_SCALING_CHOICE },
  ...(options.interfaceZoom
    ? [{ id: "interface-zoom", label: "介面縮放", kind: "choice", choice: INTERFACE_ZOOM_CHOICE } as const]
    : []),
  ...HOST_OVERLAYS.map(({ id, label, hint }) => ({ id, label, kind: "overlay", hint } as const)),
  ...(options.originalDebugToggle
    ? [{ id: "original-debug", label: "原版Debug", kind: "toggle" } as const]
    : []),
];

const isOverlayId = (id: RowId): id is HostOverlayId =>
  HOST_OVERLAYS.some((entry) => entry.id === id);

const listHeight = (rows: number): number => LIST_PADDING_TOP + rows * ROW_HEIGHT + LIST_PADDING_BOTTOM;

const escapeHtml = (text: string): string => text
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;");

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(value, high));

const gemMarkup = `<span class="host-menu-gem" aria-hidden="true"></span>`;

/** 入口按鈕上的指標與按鍵事件不能再往上冒到戰場、劇情或開場的監聽。 */
const CONTAINED_POINTER_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "dblclick",
  "contextmenu",
  "wheel",
  "touchstart",
  "touchend",
] as const;

export function mountHostMenu(screen: HTMLElement, options: HostMenuOptions): () => void {
  const rows = menuRows(options);
  const events = new AbortController();
  const { signal } = events;
  const launcher = createHostOverlayLauncher();

  // ---- 入口按鈕（邏輯螢幕內） ----
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "host-menu-trigger";
  trigger.dataset.testid = "host-menu-trigger";
  trigger.setAttribute("aria-label", "選單（暫停遊戲）");
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.style.left = `${TRIGGER.x}px`;
  trigger.style.top = `${TRIGGER.y}px`;
  trigger.style.width = `${TRIGGER.size}px`;
  trigger.style.height = `${TRIGGER.size}px`;
  trigger.innerHTML = gemMarkup;
  const tip = document.createElement("span");
  tip.className = "host-menu-trigger-tip";
  tip.dataset.testid = "host-menu-trigger-tip";
  tip.setAttribute("aria-hidden", "true");
  tip.textContent = "選單・暫停（P）";
  // 結局、製作人員表等畫面在背景素材換手時才寫 CSS 變數；入口自己也登記一份。
  applyStagedNativeUiAssets(trigger);

  const attachTrigger = () => {
    if (trigger.parentElement === screen && tip.parentElement === screen) return;
    screen.append(trigger, tip);
  };
  attachTrigger();
  // 結尾統計、劇情等畫面會整片重寫邏輯螢幕的子節點；入口要跟著回到畫面裡。
  const screenObserver = new MutationObserver(attachTrigger);
  screenObserver.observe(screen, { childList: true });

  for (const type of CONTAINED_POINTER_EVENTS) {
    trigger.addEventListener(type, (event) => {
      event.stopPropagation();
      if (type === "contextmenu") event.preventDefault();
    }, { signal });
  }
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    // 指標點擊不留焦點：恢復時焦點會回到暫停前的元素，留在入口上的話之後的方向鍵
    // 與 Enter 都會被入口攔下，看起來像戰場不聽鍵盤。鍵盤啟用則照常保留。
    if (event.detail > 0) trigger.blur();
    setProgramPaused(true);
  }, { signal });
  trigger.addEventListener("keydown", (event) => event.stopPropagation(), { signal });

  // ---- 選單本體（暫停層內） ----
  const layer = document.createElement("div");
  layer.className = "host-menu-layer";
  layer.dataset.testid = "host-menu";
  layer.dataset.hostMenuOpen = "false";
  const mainListHeight = listHeight(rows.length);
  const descriptionHeight = Math.max(mainListHeight, DESCRIPTION_MIN_HEIGHT);
  const bodyHeight = Math.max(mainListHeight, descriptionHeight);
  const groupHeight = BODY_TOP + bodyHeight + CAPTION_GAP + CAPTION_HEIGHT;
  layer.innerHTML = `
    <button type="button" class="host-menu-close" data-testid="host-menu-close"
      aria-label="關閉選單並繼續遊戲">${gemMarkup}</button>
    <div class="host-menu-group" role="dialog" aria-modal="true" aria-labelledby="host-menu-title"
      style="width:${GROUP_WIDTH}px;height:${groupHeight}px">
      <div class="host-menu-plate host-menu-title" id="host-menu-title"
        style="left:${(GROUP_WIDTH - 160) / 2}px;width:160px;height:${TITLE_HEIGHT}px">遊戲暫停</div>
      <section class="host-menu-plate host-menu-description" data-testid="host-menu-description"
        aria-live="polite" style="top:${BODY_TOP}px;width:${DESCRIPTION_WIDTH}px;height:${descriptionHeight}px">
        <h3><span data-description-title></span><small data-description-value></small></h3>
        <p class="host-menu-description-body" data-description-body></p>
        <p class="host-menu-description-extra" data-description-extra hidden></p>
        <p class="host-menu-description-keys" data-description-keys></p>
      </section>
      <div class="host-menu-frame host-menu-list" role="menu" aria-label="選單" data-testid="host-menu-list"
        style="left:${LIST_LEFT}px;top:${BODY_TOP}px;height:${mainListHeight}px">
        ${rows.map((row, index) => `
          <button type="button" class="host-menu-row" data-host-menu-row="${row.id}" data-index="${index}"
            data-testid="host-menu-row-${row.id}"
            role="${row.kind === "toggle" ? "menuitemcheckbox" : "menuitem"}"
            ${row.kind === "choice" ? `aria-haspopup="menu" aria-expanded="false"` : ""}>
            <span class="host-menu-label">${escapeHtml(row.label)}${row.kind === "toggle"
              ? `<i class="host-menu-lamp" data-testid="host-menu-original-debug-lamp" aria-hidden="true"></i>`
              : ""}</span>${row.kind === "choice" ? `<span class="host-menu-marker" aria-hidden="true">▸</span>` : ""}
          </button>`).join("")}
      </div>
      <div class="host-menu-frame host-menu-list host-menu-submenu" role="menu" data-testid="host-menu-submenu"
        hidden></div>
      <p class="host-menu-caption" style="top:${BODY_TOP + bodyHeight + CAPTION_GAP}px;height:${CAPTION_HEIGHT}px">
        遊戲時間、畫面與聲音已凍結　P／Pause 繼續遊戲　Esc 返回</p>
    </div>`;
  applyStagedNativeUiAssets(layer);

  const required = <T extends Element>(selector: string): T => {
    const element = layer.querySelector<T>(selector);
    if (!element) throw new Error(`host menu is missing ${selector}`);
    return element;
  };
  const group = required<HTMLElement>(".host-menu-group");
  const close = required<HTMLButtonElement>(".host-menu-close");
  const submenu = required<HTMLElement>(".host-menu-submenu");
  const descriptionTitle = required<HTMLElement>("[data-description-title]");
  const descriptionValue = required<HTMLElement>("[data-description-value]");
  const descriptionBody = required<HTMLElement>("[data-description-body]");
  const descriptionExtra = required<HTMLElement>("[data-description-extra]");
  const descriptionKeys = required<HTMLElement>("[data-description-keys]");
  const rowButtons = [...layer.querySelectorAll<HTMLButtonElement>(".host-menu-list:not(.host-menu-submenu) .host-menu-row")];
  const lamp = layer.querySelector<HTMLElement>(".host-menu-lamp");

  let open = false;
  let selected = 0;
  let sub: { readonly row: number; selected: number; readonly buttons: HTMLButtonElement[] } | undefined;
  let capsLockOn = false;

  const rowAt = (index: number): MenuRow => rows[index] ?? rows[0];

  const optionLabel = (choice: ChoiceRow, value: string): string =>
    choice.options.find((option) => option.value === value)?.label ?? value;

  const describe = () => {
    descriptionExtra.hidden = true;
    descriptionExtra.textContent = "";
    if (sub) {
      const row = rowAt(sub.row);
      const option = row.choice?.options[sub.selected];
      descriptionTitle.textContent = row.label;
      descriptionValue.textContent = option?.label ?? "";
      descriptionBody.textContent = option?.hint ?? "";
      descriptionKeys.textContent = "Enter 套用　Esc 返回";
      return;
    }
    const row = rowAt(selected);
    descriptionTitle.textContent = row.label;
    descriptionValue.textContent = "";
    switch (row.kind) {
      case "resume":
        descriptionBody.textContent = "關閉選單，從暫停的那一刻接著玩。";
        descriptionKeys.textContent = "Enter 繼續　P／Pause／Esc 也可繼續";
        break;
      case "choice": {
        const choice = row.choice;
        if (!choice) break;
        const value = choice.read();
        descriptionValue.textContent = optionLabel(choice, value);
        descriptionBody.textContent = choice.options.find((option) => option.value === value)?.hint ?? "";
        descriptionKeys.textContent = "Enter 展開選項　← → 直接切換";
        break;
      }
      case "overlay":
        descriptionBody.textContent = row.hint ?? "";
        descriptionKeys.textContent = "Enter 打開　視窗內 Esc 回到選單";
        break;
      case "toggle": {
        const enabled = originalDebugModeEnabled();
        descriptionValue.textContent = enabled ? "開" : "關";
        descriptionBody.textContent = !enabled
          ? ORIGINAL_DEBUG_OFF_TEXT
          : capsLockOn ? ORIGINAL_DEBUG_CAPS_LOCK_ON_TEXT : ORIGINAL_DEBUG_CAPS_LOCK_OFF_TEXT;
        descriptionExtra.innerHTML = ORIGINAL_DEBUG_HOTKEYS
          .map((hotkey) => `<span>${escapeHtml(hotkey)}</span>`).join(" ");
        descriptionExtra.hidden = false;
        descriptionKeys.textContent = "Enter 切換開關";
        break;
      }
    }
  };

  const renderToggle = () => {
    const enabled = originalDebugModeEnabled();
    const button = rowButtons.find((candidate) => candidate.dataset.hostMenuRow === "original-debug");
    button?.setAttribute("aria-checked", String(enabled));
    if (lamp) lamp.dataset.state = !enabled ? "off" : capsLockOn ? "caps" : "on";
  };

  const renderSelection = (focus: boolean) => {
    for (const [index, button] of rowButtons.entries()) {
      const isSelected = index === selected;
      button.classList.toggle("is-selected", isSelected && !sub);
      button.classList.toggle("is-parent", isSelected && sub !== undefined);
      button.tabIndex = isSelected && !sub ? 0 : -1;
      if (button.hasAttribute("aria-expanded")) {
        button.setAttribute("aria-expanded", String(sub?.row === index));
      }
    }
    group.dataset.submenuOpen = String(sub !== undefined);
    if (sub) {
      for (const [index, button] of sub.buttons.entries()) {
        const isSelected = index === sub.selected;
        button.classList.toggle("is-selected", isSelected);
        button.tabIndex = isSelected ? 0 : -1;
      }
      if (focus) sub.buttons[sub.selected]?.focus({ preventScroll: true });
    } else if (focus) {
      rowButtons[selected]?.focus({ preventScroll: true });
    }
    renderToggle();
    describe();
  };

  const openSubmenu = (rowIndex: number) => {
    const choice = rowAt(rowIndex).choice;
    if (!choice) return;
    const current = choice.read();
    submenu.innerHTML = choice.options.map((option) => `
      <button type="button" class="host-menu-row" role="menuitemradio" data-host-menu-option="${escapeHtml(option.value)}"
        data-testid="host-menu-option-${escapeHtml(option.value)}" aria-checked="${option.value === current}">
        <span class="host-menu-label">${escapeHtml(option.label)}</span>${option.value === current
          ? `<span class="host-menu-check" aria-hidden="true">●</span>` : ""}
      </button>`).join("");
    submenu.style.left = `${LIST_LEFT + SUBMENU_OFFSET.x}px`;
    submenu.style.top = `${BODY_TOP + LIST_PADDING_TOP + rowIndex * ROW_HEIGHT + SUBMENU_OFFSET.y}px`;
    submenu.style.height = `${listHeight(choice.options.length)}px`;
    submenu.setAttribute("aria-label", rowAt(rowIndex).label);
    submenu.hidden = false;
    sub = {
      row: rowIndex,
      selected: Math.max(0, choice.options.findIndex((option) => option.value === current)),
      buttons: [...submenu.querySelectorAll<HTMLButtonElement>(".host-menu-row")],
    };
    renderSelection(true);
  };

  const closeSubmenu = (focus: boolean) => {
    if (!sub) return;
    sub = undefined;
    submenu.hidden = true;
    submenu.replaceChildren();
    renderSelection(focus);
  };

  const applyOption = (index: number) => {
    if (!sub) return;
    const choice = rowAt(sub.row).choice;
    const option = choice?.options[index];
    if (!choice || !option) return;
    choice.write(option.value);
    closeSubmenu(true);
  };

  const cycleChoice = (rowIndex: number, delta: number) => {
    const choice = rowAt(rowIndex).choice;
    if (!choice) return;
    const index = choice.options.findIndex((option) => option.value === choice.read());
    const next = choice.options[(index + delta + choice.options.length) % choice.options.length];
    if (next) choice.write(next.value);
    describe();
  };

  const activate = (index: number) => {
    const row = rowAt(index);
    selected = index;
    switch (row.kind) {
      case "resume":
        setProgramPaused(false);
        return;
      case "choice":
        openSubmenu(index);
        return;
      case "overlay": {
        renderSelection(true);
        const button = rowButtons[index];
        if (button && isOverlayId(row.id)) void launcher.open(row.id, button);
        return;
      }
      case "toggle":
        setOriginalDebugModeEnabled(!originalDebugModeEnabled());
        renderSelection(true);
        return;
    }
  };

  const back = () => {
    if (sub) {
      closeSubmenu(true);
      return;
    }
    if (launcher.anyOpen()) {
      launcher.closeAll();
      renderSelection(true);
      return;
    }
    setProgramPaused(false);
  };

  /** 按遊戲畫面目前的位置與倍率疊上去；小於 1 倍的畫面上選單仍保持可讀。 */
  const layout = () => {
    const rect = screen.getBoundingClientRect();
    if (rect.width <= 0) return;
    const gameScale = rect.width / LOGICAL_SCREEN_WIDTH;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    close.style.transform = `translate(${rect.left + TRIGGER.x * gameScale}px, ${rect.top + TRIGGER.y * gameScale}px)`
      + ` scale(${gameScale})`;
    const fit = Math.min(
      (viewportWidth - VIEWPORT_MARGIN * 2) / GROUP_WIDTH,
      (viewportHeight - VIEWPORT_MARGIN * 2) / groupHeight,
    );
    const scale = gameScale >= 1 ? gameScale : Math.max(gameScale, Math.min(1, fit));
    const width = GROUP_WIDTH * scale;
    const height = groupHeight * scale;
    let left = clamp(rect.left + (rect.width - width) / 2, VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
    let top = clamp(rect.top + (rect.height - height) / 2, VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
    // 畫面小於 1 倍時選單仍放大到 1 倍，可能蓋住右下角的紅寶石。往上下左右讓開，取移動最少、
    // 又不出視窗的那邊；四邊都放不下時寶石仍疊在選單之上（CSS 給它較高的層），一定點得到。
    const gemLeft = rect.left + TRIGGER.x * gameScale - CLOSE_GAP;
    const gemTop = rect.top + TRIGGER.y * gameScale - CLOSE_GAP;
    const gemSize = TRIGGER.size * gameScale + CLOSE_GAP * 2;
    const overlapsGem = left < gemLeft + gemSize && left + width > gemLeft
      && top < gemTop + gemSize && top + height > gemTop;
    if (overlapsGem) {
      const moves = [
        { left, top: gemTop - height },
        { left, top: gemTop + gemSize },
        { left: gemLeft - width, top },
        { left: gemLeft + gemSize, top },
      ].filter((move) => move.left >= VIEWPORT_MARGIN && move.top >= VIEWPORT_MARGIN
        && move.left + width <= viewportWidth - VIEWPORT_MARGIN
        && move.top + height <= viewportHeight - VIEWPORT_MARGIN);
      const distance = (move: { left: number; top: number }) => Math.abs(move.left - left) + Math.abs(move.top - top);
      const best = moves.reduce<{ left: number; top: number } | undefined>(
        (chosen, move) => !chosen || distance(move) < distance(chosen) ? move : chosen,
        undefined,
      );
      if (best) ({ left, top } = best);
    }
    group.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
    layer.dataset.scale = String(scale);
  };

  let layoutFrame = 0;
  const scheduleLayout = () => {
    if (!open) return;
    cancelAnimationFrame(layoutFrame);
    // 縮放改變後 `scaling.ts` 才重寫畫面的 transform，下一幀再量。
    layoutFrame = requestAnimationFrame(layout);
  };

  // ---- 選單事件 ----
  layer.addEventListener("keydown", (event) => {
    // 收起後不再攔鍵：恢復遊戲時暫停層會先放掉焦點，這裡只是第二道保險。
    if (!open) return;
    // 暫停層只放行目標在可操作表面內的按鍵；這裡全部停下，不讓它們冒到綁在 window 的戰場。
    event.stopPropagation();
    const nextCaps = capsLockStateAfter(event);
    if (nextCaps !== capsLockOn) {
      capsLockOn = nextCaps;
      renderToggle();
      describe();
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const move = key === "ArrowDown" || key === "s" ? 1 : key === "ArrowUp" || key === "w" ? -1 : 0;
    if (move !== 0) {
      event.preventDefault();
      if (sub) sub.selected = (sub.selected + move + sub.buttons.length) % sub.buttons.length;
      else selected = (selected + move + rows.length) % rows.length;
      renderSelection(true);
      return;
    }
    if (key === "Home" || key === "End") {
      event.preventDefault();
      if (sub) sub.selected = key === "Home" ? 0 : sub.buttons.length - 1;
      else selected = key === "Home" ? 0 : rows.length - 1;
      renderSelection(true);
      return;
    }
    const sideways = key === "ArrowRight" || key === "d" ? 1 : key === "ArrowLeft" || key === "a" ? -1 : 0;
    if (sideways !== 0) {
      event.preventDefault();
      if (sub) {
        if (sideways < 0) closeSubmenu(true);
      } else if (rowAt(selected).kind === "choice") {
        cycleChoice(selected, sideways);
      }
      return;
    }
    if (key === "Escape" || key === "Backspace") {
      event.preventDefault();
      if (!event.repeat) back();
    }
  }, { signal });
  layer.addEventListener("keyup", (event) => {
    const nextCaps = capsLockStateAfter(event);
    if (nextCaps === capsLockOn) return;
    capsLockOn = nextCaps;
    renderToggle();
    describe();
  }, { signal });
  layer.addEventListener("pointermove", (event) => {
    const nextCaps = capsLockStateAfter(event);
    if (nextCaps === capsLockOn) return;
    capsLockOn = nextCaps;
    renderToggle();
    describe();
  }, { signal, passive: true });

  layer.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".host-menu-close")) {
      setProgramPaused(false);
      return;
    }
    const option = target.closest<HTMLButtonElement>("[data-host-menu-option]");
    if (option && sub) {
      applyOption(sub.buttons.indexOf(option));
      return;
    }
    const row = target.closest<HTMLButtonElement>("[data-host-menu-row]");
    if (row) {
      const index = Number(row.dataset.index);
      // 子選單開著時點母選單的另一列：先收起子選單，再照常選那一列。
      if (sub) closeSubmenu(false);
      activate(index);
      return;
    }
    // 點在選單以外（壓暗的畫面上）就回到遊戲；這一下不會落到底下的戰場。
    if (!target.closest(".host-menu-group")) setProgramPaused(false);
  }, { signal });
  layer.addEventListener("contextmenu", (event) => {
    // 原版的右鍵是取消：收起子選單，或回到遊戲。
    event.preventDefault();
    back();
  }, { signal });
  layer.addEventListener("mousedown", (event) => {
    // 說明框、標題與邊框不是按鈕；點到它們時保住目前的焦點，Esc 與方向鍵才繼續有效。
    const target = event.target as HTMLElement | null;
    if (target?.closest(".host-menu-group") && !target.closest("button")) event.preventDefault();
  }, { signal });
  layer.addEventListener("wheel", (event) => event.preventDefault(), { signal, passive: false });
  layer.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    const target = event.target as HTMLElement | null;
    const option = target?.closest<HTMLButtonElement>("[data-host-menu-option]");
    if (option && sub) {
      const index = sub.buttons.indexOf(option);
      if (index >= 0 && index !== sub.selected) {
        sub.selected = index;
        renderSelection(true);
      }
      return;
    }
    const row = target?.closest<HTMLButtonElement>("[data-host-menu-row]");
    if (!row || sub) return;
    const index = Number(row.dataset.index);
    const entry = rowAt(index);
    if (isOverlayId(entry.id)) launcher.warm(entry.id);
    if (index !== selected) {
      selected = index;
      renderSelection(true);
    }
  }, { signal });
  layer.addEventListener("focusin", (event) => {
    const row = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-host-menu-row]");
    if (!row || sub) return;
    const index = Number(row.dataset.index);
    const entry = rowAt(index);
    if (isOverlayId(entry.id)) launcher.warm(entry.id);
    if (index !== selected) {
      selected = index;
      renderSelection(false);
    }
  }, { signal });

  window.addEventListener("resize", scheduleLayout, { signal });
  window.addEventListener("scroll", scheduleLayout, { signal, passive: true });
  window.addEventListener("blur", () => {
    capsLockOn = false;
    renderToggle();
  }, { signal });

  const unsubscribeScaling = onImageScalingChange(() => {
    scheduleLayout();
    if (open) describe();
  });
  const unsubscribeZoom = onInterfaceZoomChange(() => {
    scheduleLayout();
    if (open) describe();
  });
  const unsubscribeDebug = onOriginalDebugModeChange(() => {
    renderToggle();
    if (open) describe();
  });

  const unregister = registerProgramPausePresenter({
    element: layer,
    show: () => {
      open = true;
      layer.dataset.hostMenuOpen = "true";
      trigger.setAttribute("aria-expanded", "true");
      selected = 0;
      closeSubmenu(false);
      layout();
      renderSelection(true);
    },
    hide: () => {
      open = false;
      cancelAnimationFrame(layoutFrame);
      launcher.closeAll();
      closeSubmenu(false);
      layer.dataset.hostMenuOpen = "false";
      trigger.setAttribute("aria-expanded", "false");
    },
    back,
  });
  renderToggle();

  return () => {
    unregister();
    events.abort();
    screenObserver.disconnect();
    cancelAnimationFrame(layoutFrame);
    unsubscribeScaling();
    unsubscribeZoom();
    unsubscribeDebug();
    launcher.destroy();
    trigger.remove();
    tip.remove();
  };
}
