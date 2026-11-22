import { presentationActionIdsForClass, type BattleActionId } from "./content/actions";
import { CLASS_IDS } from "./content/class-catalog.generated";
import { DEBUG_EDITABLE_CLASS_IDS, DEBUG_TECHNIQUE_ACTION_IDS } from "./content/debug-mode-rules";
import { mapActionAtlasAssetsForActions } from "./content/map-action-assets";
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
 * 本場戰鬥結束；用戶決定複刻只用宿主選單的開關開啟，並按瀏覽器保存。開關和畫面縮放同屬宿主
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
 * 開關開著進場時一併備妥的地圖技術演出：技術測試的全部技術，加上 EDIT 可改成的職業在兩邊的
 * 全部動作。戰場場景在進場那一刻按這份清單建好演出（`createBattleScene`），戰鬥中途沒辦法補，
 * 所以不像棋子與全景戰鬥圖那樣改到時才下載。第 1 關以後的關卡包本來就含全部演出圖。
 */
export const ORIGINAL_DEBUG_PRESENTATION_ACTION_IDS: readonly BattleActionId[] = [...new Set<BattleActionId>([
  ...DEBUG_TECHNIQUE_ACTION_IDS,
  ...DEBUG_EDITABLE_CLASS_IDS.flatMap((classId) => [1, 2].flatMap((side) =>
    presentationActionIdsForClass(classId, side as 1 | 2))),
])];

/**
 * 開關打開時每關資源門一併備妥的內容：
 * - 兵種／地型照原版用 side 2 棋子圖列出全部 39 條職業（DS:`022D`）；士兵、騎兵兩張在戰場共用包裡；
 * - 上面那份地圖技術演出。
 *
 * 戰鬥中途才打開開關時，這一關沒備妥的棋子框留空，缺演出的技術與職業不能選。
 */
export function originalDebugEditorAssetUrls(): readonly string[] {
  if (!originalDebugModeEnabled()) return [];
  return [
    ...CLASS_IDS
      .filter((classId) => classId !== "soldier" && classId !== "cavalry")
      .map(enemyMapUnitAsset),
    ...mapActionAtlasAssetsForActions(ORIGINAL_DEBUG_PRESENTATION_ACTION_IDS),
  ];
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
export function capsLockStateAfter(event: KeyboardEvent | PointerEvent): boolean {
  if (event instanceof KeyboardEvent && (event.key === "CapsLock" || event.code === "CapsLock")) {
    return event.type === "keydown" || event.getModifierState("CapsLock");
  }
  return capsLockEngaged(event);
}

/**
 * 宿主選單說明框裡「原版Debug」的狀態句。熱鍵要 Caps Lock 開著才生效，而瀏覽器看到的狀態
 * 不一定與鍵盤燈一致（輸入法可能吃掉這個鍵），所以寫的是遊戲實際讀到的狀態。
 */
export const ORIGINAL_DEBUG_OFF_TEXT = "原版內建的除錯熱鍵；開啟後回到戰場，打開 Caps Lock 即可使用。";
export const ORIGINAL_DEBUG_CAPS_LOCK_ON_TEXT = "Caps Lock 已開啟（指示燈亮綠）：回到戰場，在我方待機、選格或轉職選擇時按熱鍵。";
export const ORIGINAL_DEBUG_CAPS_LOCK_OFF_TEXT =
  "Caps Lock 未開啟，熱鍵照平常的意思執行（macOS 拼音輸入法請長按 Caps Lock 到指示燈亮起）。";

/** 熱鍵對照，一律寫全；說明框用較小的字逐項排，每一項不從中間斷行。 */
export const ORIGINAL_DEBUG_HOTKEYS: readonly string[] = [
  "F1 行為",
  "F2 單位編輯",
  "F3／F4 敵我生命",
  "F5／F6 技術測試",
  "F10 全員再行動",
  "U／D 經驗 ±50",
  "－ 生命 −10",
  "S 台詞",
  "1 範圍讀數（按住）",
  "2 格號",
  "J 即時勝利",
  "＊ 直達結局",
  "M 音樂盒",
];
