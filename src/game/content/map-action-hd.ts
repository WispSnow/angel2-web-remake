import { MAP_ACTION_HD_CLIPS } from "./map-action-hd.generated";

/**
 * 可選的高清地圖技術特效（`REMAKE-203` 火系、`REMAKE-204` 治療與休息）：每段一支堆疊視訊（顏色×透明度與
 * 1−透明度兩半），由原版逐幀經 AI 重繪、補間而來，每個原版幀都在它的原版起始 tick 出現。片段可以在原版
 * 時間線之後多一段餘韻（`afterglowTicks`），讓最後一幀慢慢散去而不是一下子消失；餘韻不擋控制器。
 * 素材只在玩家選了「美術風格　高清」時由資源門下載。
 */
export interface MapActionHdVideo {
  readonly source: string;
  readonly width: number;
  readonly height: number;
  /** 每 native tick 一幀：原版時間線加餘韻。 */
  readonly frames: number;
  readonly fps: number;
}

export interface MapActionHdClip {
  readonly clipId: string;
  readonly video: MapActionHdVideo;
  /** 一個原版像素在高清幀裡的像素數。 */
  readonly scale: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** 目標格底邊中點在高清幀裡的位置（高清像素）。 */
  readonly originX: number;
  readonly originY: number;
  /** `1 − alpha` 那一半在視訊裡的起點；顏色那一半在 (0, 0)。 */
  readonly alphaX: number;
  readonly alphaY: number;
  /** 這段片段涵蓋的原版圖形時間線總 tick 數。 */
  readonly durationTicks: number;
  /** 原版每一幀的起始 tick，依控制器 emit 的幀序。 */
  readonly frameStartTicks: readonly number[];
  /** 原版時間線之後的餘韻 tick 數（視訊幀數 = `durationTicks + afterglowTicks`）；0 表示與原版同時結束。 */
  readonly afterglowTicks: number;
}

/** 一次施法（或休息）裡由同一段高清片段畫的連續表現階段。 */
export interface MapActionHdSegment {
  readonly clipId: string;
  /** 控制器的表現階段，對到它在片段裡的起始幀：片段幀 = 起始幀 + max(0, 控制器幀)。 */
  readonly phases: Readonly<Record<string, number>>;
}

/**
 * 哪些動作有高清版、各階段由哪一段片段畫。三檔治療共用 `MAGIC/0` 收尾，休息（`DS:60E0`）與它逐項相同，
 * 所以收尾只有一段 `heal-tail`；`1H` 的空白清除幀（tile 0）畫在 `heal-1` 片段的最後一幀上。
 * 任一段片段不在生成表裡時整個動作沒有高清版。
 */
const MAP_ACTION_HD_CASTS: Readonly<Record<string, readonly MapActionHdSegment[]>> = {
  "fire-1": [{ clipId: "fire-1", phases: { fireEffect: 0 } }],
  "fire-2": [{ clipId: "fire-2", phases: { fireEffect: 0 } }],
  "fire-3": [{ clipId: "fire-3", phases: { fireEffect: 0 } }],
  "fire-4": [{ clipId: "fire-4", phases: { fireEffect: 0 } }],
  "heal-1": [
    { clipId: "heal-1", phases: { healPrimary: 0, healBlank: 39 } },
    { clipId: "heal-tail", phases: { healTail: 0 } },
  ],
  "heal-2": [{ clipId: "heal-2", phases: { healPrimary: 0 } }, { clipId: "heal-tail", phases: { healTail: 0 } }],
  "heal-3": [{ clipId: "heal-3", phases: { healPrimary: 0 } }, { clipId: "heal-tail", phases: { healTail: 0 } }],
  rest: [{ clipId: "heal-tail", phases: { restEffect: 0 } }],
};

/** 每個關卡都可能用到的高清動作：所有單位都能休息。 */
export const MAP_ACTION_HD_EVERY_STAGE: readonly string[] = ["rest"];

export function mapActionHdClip(clipId: string): MapActionHdClip | undefined {
  return Object.hasOwn(MAP_ACTION_HD_CLIPS, clipId) ? MAP_ACTION_HD_CLIPS[clipId] : undefined;
}

export function mapActionHdClips(): readonly MapActionHdClip[] {
  return Object.values(MAP_ACTION_HD_CLIPS);
}

/** 這個動作的高清分段；沒有高清版，或有一段片段還沒出片時回傳 `undefined`。 */
export function mapActionHdCast(actionId: string): readonly MapActionHdSegment[] | undefined {
  const segments = Object.hasOwn(MAP_ACTION_HD_CASTS, actionId) ? MAP_ACTION_HD_CASTS[actionId] : undefined;
  return segments?.every(({ clipId }) => mapActionHdClip(clipId)) ? segments : undefined;
}

/** 有高清版的動作。 */
export function mapActionHdActionIds(): readonly string[] {
  return Object.keys(MAP_ACTION_HD_CASTS).filter((actionId) => mapActionHdCast(actionId));
}

/** 這個動作的這個表現階段由哪段片段畫。 */
export function mapActionHdSegmentFor(actionId: string, phase: string): MapActionHdSegment | undefined {
  return mapActionHdCast(actionId)?.find((segment) => Object.hasOwn(segment.phases, phase));
}

/** 控制器第 `frame` 幀在片段裡是第幾幀。 */
export function mapActionHdClipFrame(segment: MapActionHdSegment, phase: string, frame: number): number | undefined {
  const offset = Object.hasOwn(segment.phases, phase) ? segment.phases[phase] : undefined;
  return offset === undefined ? undefined : offset + Math.max(0, frame);
}

/** 這些動作用到的高清視訊網址（沒有高清版的動作略過）。 */
export function mapActionHdAssetUrlsForActions(actionIds: Iterable<string>): readonly string[] {
  const urls = new Set<string>();
  for (const actionId of actionIds) {
    for (const { clipId } of mapActionHdCast(actionId) ?? []) {
      const clip = mapActionHdClip(clipId);
      if (clip) urls.add(clip.video.source);
    }
  }
  return [...urls].sort();
}

export interface MapActionHdCastTimeline {
  /** 各段片段與它在這次施法時間線上的起點（分段首尾相接）。 */
  readonly segments: readonly { readonly clip: MapActionHdClip; readonly startTick: number }[];
  /** 原版圖形時間線總長。 */
  readonly durationTicks: number;
  /** 高清畫面全部結束的 tick（含最後一段之後還沒播完的餘韻）。 */
  readonly endTick: number;
}

/** 一次施法的高清時間線（技術實驗室按時間軸位置直接算出畫面）；沒有高清版時回傳 `undefined`。 */
export function mapActionHdCastTimeline(actionId: string): MapActionHdCastTimeline | undefined {
  const cast = mapActionHdCast(actionId);
  if (!cast) return undefined;
  const segments: { clip: MapActionHdClip; startTick: number }[] = [];
  let startTick = 0;
  let endTick = 0;
  for (const { clipId } of cast) {
    const clip = mapActionHdClip(clipId);
    if (!clip) return undefined;
    segments.push({ clip, startTick });
    endTick = Math.max(endTick, startTick + clip.durationTicks + clip.afterglowTicks);
    startTick += clip.durationTicks;
  }
  return { segments, durationTicks: startTick, endTick };
}

/** 施法時間線上第 `tick` 時看得到的片段與片段內 tick（餘韻可與下一段重疊）。 */
export function mapActionHdVisibleAt(
  timeline: MapActionHdCastTimeline,
  tick: number,
): readonly { readonly clip: MapActionHdClip; readonly tick: number }[] {
  return timeline.segments.flatMap(({ clip, startTick }) => {
    const local = tick - startTick;
    return local >= 0 && local < clip.durationTicks + clip.afterglowTicks ? [{ clip, tick: local }] : [];
  });
}
