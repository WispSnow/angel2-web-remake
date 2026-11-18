import { portraitSourceFor, type PortraitRecord } from "./content/portrait-catalog.generated";
import {
  PORTRAIT_HD_AVAILABLE,
  portraitHdAssetUrls,
  portraitHdAssetUrlsForRecords,
  portraitHdEntry,
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
 * 依序退回原版的情況：偏好為原版、這條記錄沒有高清版（`D/63`）、此刻要畫紅眼（高清版
 * 沒有紅眼）、高清檔案還不在租約裡（關卡中途剛切換、正在背景下載），或播放器回報失敗。
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

/** 播放器在高清檔案載入或解碼失敗時呼叫：這條記錄本次執行改畫原版，並提示一次。 */
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

/** 這張臉此刻要畫的高清記錄；任何一條回退條件成立時回傳 `undefined`，改畫原版。 */
export function activePortraitHd(
  record: PortraitRecord,
  options: { readonly redEyes?: boolean } = {},
): PortraitHdEntry | undefined {
  if (portraitStyle() !== "hd" || options.redEyes || failedRecords.has(record)) return undefined;
  const entry = portraitHdEntry(record);
  if (!entry) return undefined;
  return portraitHdAssetUrls(record).every((url) => stagedRenderAssetAvailable(url)) ? entry : undefined;
}

/** 靜態表面（部署、名冊、結局卡）用的單張肖像：高清模式下是循環第 0 幀的封面。 */
export function portraitStillSourceFor(record: PortraitRecord): { readonly source: string; readonly hd: boolean } {
  const entry = activePortraitHd(record);
  return entry ? { source: entry.poster, hd: true } : { source: portraitSourceFor(record), hd: false };
}

/** 資源門要為這些記錄額外下載的高清檔案；偏好為原版時為空，原版模式不發任何高清請求。 */
export function portraitHdUrlsForStyle(records: Iterable<PortraitRecord>, style = portraitStyle()): readonly string[] {
  return style === "hd" ? portraitHdAssetUrlsForRecords(records) : [];
}
