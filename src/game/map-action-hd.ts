import {
  MAP_ACTION_HD_EVERY_STAGE,
  mapActionHdAssetUrlsForActions,
  mapActionHdCast,
  mapActionHdClip,
  type MapActionHdClip,
  type MapActionHdSegment,
} from "./content/map-action-hd";
import { portraitStyle } from "./portrait-style";
import type { PortraitStyle } from "./preferences";
import { stagedRenderAssetAvailable } from "./staged-render-asset-cache";

/**
 * 高清地圖技術特效（`REMAKE-203`、`REMAKE-204`）跟著「美術風格」偏好（`portraitStyle`），與高清肖像、
 * 劇情插圖同一套規則：只換表現，不碰模擬、PRNG、計時或存檔。控制器照原版逐幀 emit、照原版等待，音效
 * 請求與逐點扣血、治療都不動；高清層在每一幀的原版時段內連續前進，片段若有餘韻，控制器離開最後一幀後
 * 由高清層自己播完，不讓控制器多等。
 *
 * 回退以整次施法（或一次休息）為單位，在第一幀決定：偏好為原版、這個動作沒有高清版、它用到的任一段
 * 視訊還不在資源租約裡（關卡中途剛切換風格）、本次執行已失敗過，或尚未解碼出第一幀時，整次照畫原版。
 */

const failed = new Set<string>();

/** 這個動作此刻可以走高清的分段與片段；任何一條回退條件成立時回傳 `undefined`（視訊是否就緒由畫布層另外判斷）。 */
export function activeMapActionHdCast(
  actionId: string,
  style: PortraitStyle = portraitStyle(),
): { readonly segments: readonly MapActionHdSegment[]; readonly clips: readonly MapActionHdClip[] } | undefined {
  if (style !== "hd") return undefined;
  const segments = mapActionHdCast(actionId);
  if (!segments) return undefined;
  const clips: MapActionHdClip[] = [];
  for (const { clipId } of segments) {
    const clip = mapActionHdClip(clipId);
    if (!clip || failed.has(clipId) || !stagedRenderAssetAvailable(clip.video.source)) return undefined;
    if (!clips.includes(clip)) clips.push(clip);
  }
  return { segments, clips };
}

/** 這個動作用到的片段裡有一段本次執行已失敗過。 */
export function mapActionHdCastFailed(actionId: string): boolean {
  return (mapActionHdCast(actionId) ?? []).some(({ clipId }) => failed.has(clipId));
}

/** 視訊載入或解碼失敗：用到這段片段的動作本次執行改畫原版。 */
export function markMapActionHdFailed(clipId: string, reason: string): void {
  if (failed.has(clipId)) return;
  failed.add(clipId);
  console.warn(`HD map action clip ${clipId} falls back to the original: ${reason}`);
}

export function mapActionHdFailed(clipId: string): boolean {
  return failed.has(clipId);
}

/**
 * 資源門要為這些動作額外下載的高清視訊；偏好為原版時為空，不發任何高清請求。每個關卡都有的動作（休息）
 * 一律算進去。
 */
export function mapActionHdUrlsForStyle(actionIds: Iterable<string>, style: PortraitStyle = portraitStyle()): readonly string[] {
  return style === "hd" ? mapActionHdAssetUrlsForActions([...actionIds, ...MAP_ACTION_HD_EVERY_STAGE]) : [];
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
  /**
   * 時鐘可以走到哪裡（不含）。預設是這一幀的終點，永遠不跑到原版時間線前面；片段最後一幀帶餘韻時是
   * 片段終點，時鐘照同樣速率走過原版終點、把餘韻播完。
   */
  readonly limitTick?: number;
}

/**
 * 高清畫面此刻對應的片段 tick：該幀起點加上 emit 後經過的程式時間換算的 tick，夾在 `limitTick` 之前；
 * 下一幀 emit 時再從它的起點接上。
 */
export function mapActionHdTick(clock: MapActionHdFrameClock, now: number): number {
  const span = clock.endTick - clock.startTick;
  if (span <= 0 || clock.delayMs <= 0) return clock.startTick;
  const progressed = ((now - clock.emittedAt) / clock.delayMs) * span;
  const room = (clock.limitTick ?? clock.endTick) - clock.startTick;
  return clock.startTick + Math.min(room - 1e-3, Math.max(0, progressed));
}

/** 第 `frame` 幀的時鐘範圍；超出原版幀數時回傳 `undefined`。最後一幀帶上片段的餘韻終點。 */
export function mapActionHdFrameSpan(
  clip: MapActionHdClip,
  frame: number,
): { startTick: number; endTick: number; limitTick?: number } | undefined {
  const startTick = clip.frameStartTicks[frame];
  if (startTick === undefined) return undefined;
  const last = frame === clip.frameStartTicks.length - 1;
  return {
    startTick,
    endTick: clip.frameStartTicks[frame + 1] ?? clip.durationTicks,
    ...(last && clip.afterglowTicks > 0 ? { limitTick: clip.durationTicks + clip.afterglowTicks } : {}),
  };
}

/** 片段畫面結束的 tick：有餘韻時是餘韻終點，否則是原版時間線終點。 */
export function mapActionHdClipEnd(clip: MapActionHdClip): number {
  return clip.durationTicks + clip.afterglowTicks;
}
