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
 * 原版在待機戰場按住 Caps Lock 才把按鍵交給除錯分發器 `0000:30CE`（`0000:B78C`）。
 * 沒有數字鍵盤的鍵盤可用 `Shift+8`（`*`）代替數字鍵盤 `*`。
 */
export function originalDebugHotkey(event: DebugKeyEvent): OriginalDebugHotkey | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey) return undefined;
  if (!capsLockEngaged(event)) return undefined;
  if (event.key === "*") return "skipToEnding";
  return BY_CODE[event.code];
}

export const ORIGINAL_DEBUG_HOTKEY_SUMMARY =
  "開啟後在戰場打開 Caps Lock 使用：F1 行為、F2 單位編輯、F3 敵方生命、F4 我方生命、"
  + "F5／F6 技術測試、F10 全員再行動、U／D 經驗 ±50、－ 生命 −10、S 台詞、1 範圍讀數（按住）、"
  + "2 格號、J 即時勝利、＊ 直達結局、M 音樂盒";

/** 宿主工具列上的「原版Debug」開關；按鍵一律停在這裡，不得漏到戰場。 */
export function mountOriginalDebugModeToggle(host: HTMLElement): () => void {
  const group = document.createElement("div");
  group.className = "original-debug-trigger";
  group.innerHTML = `<button type="button" data-testid="original-debug-toggle"
    title="原版Debug模式。${ORIGINAL_DEBUG_HOTKEY_SUMMARY}">原版Debug</button>`;
  const button = group.querySelector<HTMLButtonElement>("button");
  if (!button) return () => undefined;
  const render = (enabled: boolean) => {
    button.setAttribute("aria-pressed", String(enabled));
    button.classList.toggle("is-selected", enabled);
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
    button.removeEventListener("click", click);
    group.remove();
  };
}
