import { CLASS_IDS } from "./content/class-catalog.generated";
import { enemyMapUnitAsset } from "./content/map-unit-assets";
import {
  DEFAULT_DEBUG_PREFERENCES,
  loadDebugPreferences,
  saveDebugPreferences,
} from "./preferences";

/**
 * `REMAKE-174` 原版Debug模式的宿主開關與熱鍵對照。
 *
 * 原版（模組 29）要在戰鬥中按住數字鍵盤 1+3+5、依序按 S、W、F 才打開 DS:`132F`，而且只到
 * 本場戰鬥結束；用戶決定複刻只用工具列開關開啟，並按瀏覽器保存。開關和畫面縮放同屬宿主
 * 偏好：它不進模擬狀態、PRNG、規則身份或存檔，只決定下面的熱鍵是否生效。
 */

const listeners = new Set<(enabled: boolean) => void>();
let current: boolean | undefined;

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    // Private-mode and sandboxed embeds can throw on property access alone.
    return undefined;
  }
};

/**
 * 兵種／地型編輯器照原版用 side 2 棋子圖列出全部 39 條職業（DS:`022D`）。開關打開時由每關的
 * 資源門一併備妥，編輯器才不必在戰場上另發原始素材請求；士兵、騎兵兩張在戰場共用包裡。
 * 戰鬥中途才打開開關時，這一關沒備妥的棋子框留空。
 */
export function originalDebugEditorAssetUrls(): readonly string[] {
  if (!originalDebugModeEnabled()) return [];
  return CLASS_IDS
    .filter((classId) => classId !== "soldier" && classId !== "cavalry")
    .map(enemyMapUnitAsset);
}

export function originalDebugModeEnabled(): boolean {
  if (current !== undefined) return current;
  const store = storage();
  try {
    current = store
      ? loadDebugPreferences(store).originalDebugMode
      : DEFAULT_DEBUG_PREFERENCES.originalDebugMode;
  } catch {
    current = DEFAULT_DEBUG_PREFERENCES.originalDebugMode;
  }
  return current;
}

export function setOriginalDebugModeEnabled(enabled: boolean): void {
  if (originalDebugModeEnabled() === enabled) return;
  current = enabled;
  const store = storage();
  try {
    if (store) saveDebugPreferences(store, { originalDebugMode: enabled });
  } catch {
    // A full or blocked store only loses persistence; the switch still works now.
  }
  for (const listener of listeners) listener(enabled);
}

export function onOriginalDebugModeChange(listener: (enabled: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type OriginalDebugHotkey =
  | "enemyLifeMenu"
  | "allyLifeMenu"
  | "refreshAllies"
  | "experienceUp"
  | "experienceDown"
  | "lifeDown"
  | "headacheLine"
  | "cellReadout"
  | "instantVictory"
  | "skipToEnding"
  | "musicBox"
  /** Caps Lock+1：按住期間顯示範圍讀數；選格中同樣有效，由宿主鍵盤層追蹤按住與放開。 */
  | "rangeReadout"
  | "behaviourEditor"
  | "editMenu"
  | "techniqueAttack"
  | "techniqueSupport";

export interface DebugKeyEvent {
  readonly key: string;
  readonly code: string;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  getModifierState(key: string): boolean;
}

const BY_CODE: Readonly<Record<string, OriginalDebugHotkey>> = {
  F3: "enemyLifeMenu",
  F4: "allyLifeMenu",
  F10: "refreshAllies",
  KeyU: "experienceUp",
  KeyD: "experienceDown",
  NumpadSubtract: "lifeDown",
  Minus: "lifeDown",
  KeyS: "headacheLine",
  Digit2: "cellReadout",
  KeyJ: "instantVictory",
  NumpadMultiply: "skipToEnding",
  KeyM: "musicBox",
  F1: "behaviourEditor",
  F2: "editMenu",
  F5: "techniqueAttack",
  F6: "techniqueSupport",
  Digit1: "rangeReadout",
};

let capsLockHeld = false;

/**
 * 原版的條件是「按住」Caps Lock。macOS 只在切換時發出 Caps Lock 事件，所以「開啟狀態」
 * （`getModifierState`）與「實體按住」（沒有收到對應 keyup 的 keydown）任一成立都算數：
 * 前者涵蓋 macOS 與一般使用，後者涵蓋 Windows／Linux 的按住，以及無法設定鎖定狀態的
 * 合成鍵盤事件。視窗失焦時放掉按住狀態，避免切出去放開按鍵後卡在按住。
 */
export function installCapsLockTracker(signal: AbortSignal): void {
  const track = (held: boolean) => (event: KeyboardEvent) => {
    if (event.key === "CapsLock" || event.code === "CapsLock") capsLockHeld = held;
  };
  window.addEventListener("keydown", track(true), { capture: true, signal });
  window.addEventListener("keyup", track(false), { capture: true, signal });
  window.addEventListener("blur", () => { capsLockHeld = false; }, { signal });
  signal.addEventListener("abort", () => { capsLockHeld = false; }, { once: true });
}

/** Caps Lock 開啟或被按住。 */
export function capsLockEngaged(event: Pick<DebugKeyEvent, "getModifierState">): boolean {
  return capsLockHeld || event.getModifierState("CapsLock");
}

/**
 * 原版在待機戰場按住 Caps Lock 才把按鍵交給除錯分發器 `0000:30CE`（`0000:B78C`）；選格與轉職選擇中
 * 原版不必按 Caps Lock，複刻仍要求開著（那裡的 S、D 會移動游標）。生效狀態見 `original-debug-hosts.ts`。
 * 沒有數字鍵盤的鍵盤可用 `Shift+8`（`*`）代替數字鍵盤 `*`。
 */
export function originalDebugHotkey(event: DebugKeyEvent): OriginalDebugHotkey | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey) return undefined;
  if (!capsLockEngaged(event)) return undefined;
  if (event.key === "*") return "skipToEnding";
  return BY_CODE[event.code];
}

/**
 * Caps Lock 開著時 F1–F6、F10 屬於原版Debug。熱鍵不生效的狀態（選單、除錯畫面、授職對白）裡它們
 * 只提示、不執行：否則會落回 F1–F4 的集體命令（全軍休息、跟隨、自由行動、撤退），F5 甚至是瀏覽器的
 * 重新整理。字母與數字鍵在那些狀態照常走平常的意思。
 */
export function isOriginalDebugFunctionKey(event: Pick<DebugKeyEvent, "code">): boolean {
  return /^F\d+$/u.test(event.code) && BY_CODE[event.code] !== undefined;
}

/** 這個鍵盤或指標事件之後，Caps Lock 算不算開著（Caps Lock 鍵本身的事件先於追蹤器更新）。 */
function capsLockAfter(event: KeyboardEvent | PointerEvent): boolean {
  if (event instanceof KeyboardEvent && (event.key === "CapsLock" || event.code === "CapsLock")) {
    return event.type === "keydown" || event.getModifierState("CapsLock");
  }
  return capsLockEngaged(event);
}

const CAPS_LOCK_ON_TITLE = "Caps Lock 已開啟：在我方待機、選格或轉職選擇時按熱鍵即可使用原版Debug。";
const CAPS_LOCK_OFF_TITLE = "Caps Lock 未開啟：熱鍵會照平常的意思執行。"
  + "macOS 的拼音輸入法短按 Caps Lock 只切換中英文，不會開啟 Caps Lock："
  + "請長按到指示燈亮起，或先切換到 ABC 輸入法。";

export const ORIGINAL_DEBUG_HOTKEY_SUMMARY =
  "開啟後在戰場打開 Caps Lock 使用：F1 行為、F2 單位編輯、F3 敵方生命、F4 我方生命、"
  + "F5／F6 技術測試、F10 全員再行動、U／D 經驗 ±50、－ 生命 −10、S 台詞、1 範圍讀數（按住）、"
  + "2 格號、J 即時勝利、＊ 直達結局、M 音樂盒";

/** 宿主工具列上的「原版Debug」開關；按鍵一律停在這裡，不得漏到戰場。 */
export function mountOriginalDebugModeToggle(host: HTMLElement): () => void {
  const group = document.createElement("div");
  group.className = "original-debug-trigger";
  group.innerHTML = `<button type="button" data-testid="original-debug-toggle"
    title="原版Debug模式。${ORIGINAL_DEBUG_HOTKEY_SUMMARY}">原版Debug</button>
    <span class="original-debug-caps" data-testid="original-debug-caps" role="status" hidden>Caps Lock</span>`;
  const button = group.querySelector<HTMLButtonElement>("button");
  const lamp = group.querySelector<HTMLElement>(".original-debug-caps");
  if (!button || !lamp) return () => undefined;
  // 熱鍵要 Caps Lock 開著才生效，而瀏覽器看到的狀態不一定與鍵盤燈一致（輸入法可能吃掉這個鍵），
  // 所以開關開著時在旁邊顯示遊戲實際讀到的狀態。
  let capsLockOn = false;
  const renderLamp = () => {
    lamp.hidden = !originalDebugModeEnabled();
    lamp.dataset.engaged = String(capsLockOn);
    lamp.title = capsLockOn ? CAPS_LOCK_ON_TITLE : CAPS_LOCK_OFF_TITLE;
    lamp.setAttribute("aria-label", capsLockOn ? "Caps Lock 已開啟" : "Caps Lock 未開啟");
  };
  const observe = (event: KeyboardEvent | PointerEvent) => {
    const next = capsLockAfter(event);
    if (next === capsLockOn) return;
    capsLockOn = next;
    renderLamp();
  };
  const listeners = new AbortController();
  for (const type of ["keydown", "keyup"] as const) {
    window.addEventListener(type, observe, { capture: true, signal: listeners.signal });
  }
  for (const type of ["pointermove", "pointerdown"] as const) {
    window.addEventListener(type, observe, { capture: true, passive: true, signal: listeners.signal });
  }
  window.addEventListener("blur", () => {
    capsLockOn = false;
    renderLamp();
  }, { signal: listeners.signal });
  const render = (enabled: boolean) => {
    button.setAttribute("aria-pressed", String(enabled));
    button.classList.toggle("is-selected", enabled);
    renderLamp();
  };
  const click = (event: MouseEvent) => {
    setOriginalDebugModeEnabled(!originalDebugModeEnabled());
    // 工具列會攔下自己收到的按鍵。指標點完若焦點還留在這裡，緊接著的 Caps Lock 熱鍵就被
    // 吃掉，看起來像開關沒生效；所以指標點擊（`detail > 0`）把焦點還給遊戲，鍵盤啟用則照常
    // 保留焦點。
    if (event.detail > 0) button.blur();
  };
  button.addEventListener("click", click);
  group.addEventListener("keydown", (event) => event.stopPropagation());
  host.append(group);
  const unsubscribe = onOriginalDebugModeChange(render);
  render(originalDebugModeEnabled());
  return () => {
    unsubscribe();
    listeners.abort();
    button.removeEventListener("click", click);
    group.remove();
  };
}
