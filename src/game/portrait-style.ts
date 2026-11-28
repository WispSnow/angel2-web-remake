import { MODULE29_RED_EYE_RULE, portraitSourceFor, type PortraitRecord } from "./content/portrait-catalog.generated";
import {
  PORTRAIT_HD_AVAILABLE,
  portraitHdAssetUrls,
  portraitHdAssetUrlsForRecords,
  portraitHdEntry,
  portraitHdVariant,
  type PortraitHdEntry,
} from "./content/portrait-hd";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  loadDisplayPreferences,
  saveDisplayPreferences,
  type PortraitStyle,
} from "./preferences";
import { stagedRenderAssetAvailable } from "./staged-render-asset-cache";

/**
 * `REMAKE-192` 肖像風格的執行期狀態：宿主偏好、哪些記錄的高清檔案已經在資源租約裡、
 * 哪些記錄解碼失敗退回原版。它只決定「這張臉畫哪一套」，不碰模擬、PRNG 或存檔。
 *
 * 回退一律以整條記錄為單位（計畫文件第 9.1 節）：同一張臉不混用高清主圖與原版覆蓋片。
 * 依序退回原版的情況：偏好為原版、這條記錄沒有高清版（`D/63`）、此刻要畫紅眼而沒有紅眼版、
 * 高清檔案還不在租約裡（關卡中途剛切換、正在背景下載），或播放器回報失敗。`REMAKE-195` 起
 * 原版有 frame 7 的四條記錄都有高清紅眼版，被操控期間畫它。
 */

const styleListeners = new Set<(style: PortraitStyle) => void>();
const presentationListeners = new Set<() => void>();
const failedRecords = new Set<PortraitRecord>();
let current: PortraitStyle | undefined;
let failureNoticePending = false;

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export function portraitStyle(): PortraitStyle {
  if (!PORTRAIT_HD_AVAILABLE) return "original";
  if (current) return current;
  const store = storage();
  current = store ? loadDisplayPreferences(store).portraitStyle : DEFAULT_DISPLAY_PREFERENCES.portraitStyle;
  return current;
}

export function setPortraitStyle(style: PortraitStyle): void {
  if (portraitStyle() === style) return;
  current = style;
  // `REMAKE-219` 玩家切換美術風格就是要重來一次：本次執行退回原版的記錄全部重新嘗試。
  failedRecords.clear();
  const store = storage();
  // 宿主顯示偏好共用同一筆記錄，整筆覆寫會把其他選擇洗掉。
  if (store) saveDisplayPreferences(store, { ...loadDisplayPreferences(store), portraitStyle: style });
  for (const listener of styleListeners) listener(style);
  notifyPortraitPresentationChanged();
}

export function onPortraitStyleChange(listener: (style: PortraitStyle) => void): () => void {
  styleListeners.add(listener);
  return () => styleListeners.delete(listener);
}

/** 偏好改變、高清檔案補進租約或某條記錄退回原版時通知；表面據此重畫肖像。 */
export function onPortraitPresentationChange(listener: () => void): () => void {
  presentationListeners.add(listener);
  return () => presentationListeners.delete(listener);
}

export function notifyPortraitPresentationChanged(): void {
  for (const listener of presentationListeners) listener();
}

/**
 * 檔案本身載入或解碼失敗時呼叫（暫時的錯誤由 `portrait.ts` 自己重試，不走這裡）：這條記錄改畫原版並提示一次，
 * 直到玩家切換美術風格（`REMAKE-219`）。
 */
export function markPortraitHdFailed(record: PortraitRecord, reason: string): void {
  if (failedRecords.has(record)) return;
  failedRecords.add(record);
  failureNoticePending = true;
  console.warn(`HD portrait D/${record} falls back to the original: ${reason}`);
  notifyPortraitPresentationChanged();
}

/** 取走「有高清肖像退回原版」的一次性提示；沒有待提示時回傳 `false`。 */
export function takePortraitHdFailureNotice(): boolean {
  const pending = failureNoticePending;
  failureNoticePending = false;
  return pending;
}

/**
 * 這張臉此刻要畫的高清記錄；`redEyes` 時是紅眼版。任何一條回退條件成立時回傳 `undefined`，
 * 改畫原版。
 */
export function activePortraitHd(
  record: PortraitRecord,
  options: { readonly redEyes?: boolean } = {},
): PortraitHdEntry | undefined {
  if (portraitStyle() !== "hd" || failedRecords.has(record)) return undefined;
  const entry = portraitHdEntry(record);
  const shown = entry && portraitHdVariant(entry, options.redEyes ?? false);
  if (!shown) return undefined;
  const ready = portraitHdAssetUrls(record, options.redEyes ?? false).every((url) => stagedRenderAssetAvailable(url));
  return ready ? shown : undefined;
}

/** 模組 29 在這一關（勝負未定時）把哪些臉畫成紅眼；資源門據此帶上它們的高清紅眼版。 */
export function module29RedEyeRecords(nativeStage: number | undefined): readonly PortraitRecord[] {
  if (nativeStage === undefined) return [];
  return MODULE29_RED_EYE_RULE.stages
    .filter((rule) => rule.nativeStage === nativeStage)
    .flatMap((rule) => rule.portraits);
}

/** 靜態表面（部署、名冊、結局卡）用的單張肖像：高清模式下是循環第 0 幀的封面。 */
export function portraitStillSourceFor(record: PortraitRecord): { readonly source: string; readonly hd: boolean } {
  const entry = activePortraitHd(record);
  return entry ? { source: entry.poster, hd: true } : { source: portraitSourceFor(record), hd: false };
}

/**
 * 資源門要為這些記錄額外下載的高清檔案；偏好為原版時為空，原版模式不發任何高清請求。
 * 給了 `nativeStage` 時，另外帶上這一關被操控角色的紅眼版（`REMAKE-195`），其他關不下載。
 */
export function portraitHdUrlsForStyle(
  records: Iterable<PortraitRecord>,
  style = portraitStyle(),
  nativeStage?: number,
): readonly string[] {
  if (style !== "hd") return [];
  const list = [...records];
  return portraitHdAssetUrlsForRecords(list, module29RedEyeRecords(nativeStage).filter((record) => list.includes(record)));
}
