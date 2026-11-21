import { mapActionHdAssetUrlsForActions, mapActionHdEntry, type MapActionHdEntry } from "./content/map-action-hd";
import { portraitStyle } from "./portrait-style";
import type { PortraitStyle } from "./preferences";
import { stagedRenderAssetAvailable } from "./staged-render-asset-cache";

/**
 * `REMAKE-203` 高清地圖技術特效跟著「美術風格」偏好（`portraitStyle`），與高清肖像、劇情插圖同一套規則：
 * 只換表現，不碰模擬、PRNG、計時或存檔。控制器照原版逐幀 emit、照原版等待，音效請求與逐點扣血都不動；
 * 高清層只在每一幀的原版時段內連續前進。
 *
 * 回退以整次施法為單位，在第 0 幀決定：偏好為原版、這個動作沒有高清版、視訊還不在資源租約裡（關卡中途
 * 剛切換風格）、本次執行已失敗過，或視訊尚未解碼出第一幀時，整次施法照畫原版。
 */

const failed = new Set<string>();

/** 這個動作此刻可以走高清的條目；任何一條回退條件成立時回傳 `undefined`（視訊是否就緒由畫布層另外判斷）。 */
export function activeMapActionHd(actionId: string, style: PortraitStyle = portraitStyle()): MapActionHdEntry | undefined {
  if (style !== "hd" || failed.has(actionId)) return undefined;
  const entry = mapActionHdEntry(actionId);
  return entry && stagedRenderAssetAvailable(entry.video.source) ? entry : undefined;
}

/** 視訊載入或解碼失敗：這個動作本次執行改畫原版。 */
export function markMapActionHdFailed(actionId: string, reason: string): void {
  if (failed.has(actionId)) return;
  failed.add(actionId);
  console.warn(`HD map action ${actionId} falls back to the original: ${reason}`);
}

export function mapActionHdFailed(actionId: string): boolean {
  return failed.has(actionId);
}

/** 資源門要為這些動作額外下載的高清視訊；偏好為原版時為空，不發任何高清請求。 */
export function mapActionHdUrlsForStyle(actionIds: Iterable<string>, style: PortraitStyle = portraitStyle()): readonly string[] {
  return style === "hd" ? mapActionHdAssetUrlsForActions(actionIds) : [];
}

export interface MapActionHdFrameClock {
  /** 這一幀的原版起始 tick。 */
  readonly startTick: number;
  /** 下一幀的原版起始 tick（最後一幀是時間線終點）。 */
  readonly endTick: number;
  /** 控制器為這一幀等待的毫秒數（`mapCombatDelay`：正常每 tick 10、加速 2.5、測試 4）。 */
  readonly delayMs: number;
  /** 這一幀 emit 時的程式時間（`programNow()`，程式暫停時停住）。 */
  readonly emittedAt: number;
}

/**
 * 高清畫面此刻對應的原版 tick：該幀起點加上 emit 後經過的程式時間換算的 tick，夾在該幀終點之前，
 * 永遠不跑到原版時間線前面；下一幀 emit 時再從它的起點接上。
 */
export function mapActionHdTick(clock: MapActionHdFrameClock, now: number): number {
  const span = clock.endTick - clock.startTick;
  if (span <= 0 || clock.delayMs <= 0) return clock.startTick;
  const progressed = ((now - clock.emittedAt) / clock.delayMs) * span;
  return clock.startTick + Math.min(span - 1e-3, Math.max(0, progressed));
}

/** 第 `frame` 幀的時鐘範圍；超出原版幀數時回傳 `undefined`。 */
export function mapActionHdFrameSpan(entry: MapActionHdEntry, frame: number): { startTick: number; endTick: number } | undefined {
  const startTick = entry.frameStartTicks[frame];
  if (startTick === undefined) return undefined;
  return { startTick, endTick: entry.frameStartTicks[frame + 1] ?? entry.durationTicks };
}
