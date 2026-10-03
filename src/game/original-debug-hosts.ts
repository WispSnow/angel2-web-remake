import type { OriginalDebugHotkey } from "./original-debug-mode";

/**
 * `REMAKE-174` 原版Debug熱鍵在哪些戰場狀態生效。
 *
 * 原版分發器 `0000:30CE` 的調用點分三類（`reverse/notes/developer-debug-mode.md`）：
 * - 待機戰場（`B793`，按住 Caps Lock）；
 * - 七個選格循環共用的步進 `54BC`；
 * - 轉職的職業選擇循環 `0744`。
 *
 * 數字鍵盤 `-` 在待機的點格步進 `54D1` 裡檢查，Caps Lock+J／`*` 由待機主循環 `4A27` 讀取，
 * 所以這三個鍵只在待機有效。複刻在選格與轉職選擇中同樣要求 Caps Lock 開著（`[DD]`）：
 * 那裡的字母鍵另有意思（S、D 移動游標）。
 */
export type OriginalDebugHost = "idle" | "selection" | "promotion";

const IDLE_ONLY_HOTKEYS: ReadonlySet<OriginalDebugHotkey> = new Set<OriginalDebugHotkey>([
  "lifeDown",
  "instantVictory",
  "skipToEnding",
]);

const TECHNIQUE_TEST_HOTKEYS: ReadonlySet<OriginalDebugHotkey> = new Set<OriginalDebugHotkey>([
  "techniqueAttack",
  "techniqueSupport",
]);

export interface OriginalDebugHostContext {
  readonly host: OriginalDebugHost;
  /** 目前的選格本身就是技術測試。 */
  readonly inTechniqueTest: boolean;
}

/** 可以執行時回傳 `undefined`；不能時回傳信息欄提示，按鍵照樣被吃掉。 */
export function originalDebugHotkeyRefusal(
  hotkey: OriginalDebugHotkey,
  { host, inTechniqueTest }: OriginalDebugHostContext,
): string | undefined {
  if (host === "idle") return undefined;
  if (IDLE_ONLY_HOTKEYS.has(hotkey)) return "原版Debug：這個熱鍵只在我方待機時有效。";
  if (!TECHNIQUE_TEST_HOTKEYS.has(hotkey)) return undefined;
  // `[DD]` 技術測試要在戰場上選格，轉職選擇正擋著戰場；原版在 `0744` 裡照樣疊一層選格。
  if (host === "promotion") return "原版Debug：轉職選擇中不能做技術測試。";
  // 原版會在技術選格裡再遞迴一次 `6C16`；複刻只記得一層被打斷的選格。
  if (inTechniqueTest) return "原版Debug：技術測試的選格中不能再開一次技術測試。";
  return undefined;
}

/**
 * 轉職選擇中做了除錯操作之後的佇列：已離場或不再符合條件的移出，其餘保持原順序；
 * 新符合條件的排到最後（原版要等這次選擇結束、待機循環下一輪掃描才會遇到它們）。
 */
export function refreshedPromotionQueue(
  queue: readonly string[],
  eligible: readonly string[],
): string[] {
  const stillEligible = new Set(eligible);
  const kept = queue.filter((id) => stillEligible.has(id));
  const queued = new Set(kept);
  return [...kept, ...eligible.filter((id) => !queued.has(id))];
}
