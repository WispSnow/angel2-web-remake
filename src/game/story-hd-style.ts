import {
  storyHdAssetUrls,
  storyHdAssetUrlsForSources,
  storyHdEntryForSource,
  type StoryHdEntry,
} from "./content/story-hd";
import { notifyPortraitPresentationChanged, portraitStyle } from "./portrait-style";
import type { PortraitStyle } from "./preferences";
import { stagedRenderAssetAvailable } from "./staged-render-asset-cache";

/**
 * `REMAKE-196` 高清劇情插圖跟著同一個「美術風格」偏好（`portraitStyle`）：選了高清，
 * 有高清版的 `BK` 插圖改成全畫面的待機循環；它只換表現，不碰對白、計時、模擬或存檔。
 *
 * 回退以整張插圖為單位，依序是：偏好為原版、這張沒有高清版、檔案還不在資源租約裡
 * （關卡中途剛切換、正在背景下載），或播放器回報失敗。回退時照原版畫在 `(160,80)`。
 */

const failedBackgrounds = new Set<number>();
let failureNoticePending = false;

/** 這張原版插圖此刻要換成的高清循環；任何一條回退條件成立時回傳 `undefined`。 */
export function activeStoryHd(source: string | undefined): StoryHdEntry | undefined {
  if (portraitStyle() !== "hd") return undefined;
  const entry = storyHdEntryForSource(source);
  if (!entry || failedBackgrounds.has(entry.background)) return undefined;
  return storyHdAssetUrls(entry).every((url) => stagedRenderAssetAvailable(url)) ? entry : undefined;
}

/** 播放器在載入或解碼失敗時呼叫：這張插圖本次執行改畫原版，並提示一次。 */
export function markStoryHdFailed(entry: StoryHdEntry, reason: string): void {
  if (failedBackgrounds.has(entry.background)) return;
  failedBackgrounds.add(entry.background);
  failureNoticePending = true;
  console.warn(`HD story illustration BK/${entry.background} falls back to the original: ${reason}`);
  notifyPortraitPresentationChanged();
}

/** 取走「有高清插圖退回原版」的一次性提示。 */
export function takeStoryHdFailureNotice(): boolean {
  const pending = failureNoticePending;
  failureNoticePending = false;
  return pending;
}

/** 資源門要為這些原版插圖額外下載的高清檔案；偏好為原版時為空，不發任何高清請求。 */
export function storyHdUrlsForStyle(sources: Iterable<string>, style: PortraitStyle = portraitStyle()): readonly string[] {
  return style === "hd" ? storyHdAssetUrlsForSources(sources) : [];
}
