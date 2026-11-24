import { MAP_ACTION_HD_CLIPS } from "./map-action-hd.generated";

/**
 * 可選的高清地圖技術特效（`REMAKE-203` 火系、`REMAKE-204` 治療與休息、`REMAKE-205` 單格狀態技術）：每段一支堆疊視訊（顏色×透明度與
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
  /**
   * 靜態圖（`REMAKE-209` 踩踏的腿與影子）：`video.source` 是一張同樣堆疊格式的 PNG，沒有時間線
   * （`durationTicks` 0、`frameStartTicks` 只有 0），由戰場照原版逐幀擺位置；原點是原版圖的左上角。
   */
  readonly still?: boolean;
}

/** 一次施法（或休息）裡由同一段高清片段畫的連續表現階段。 */
export interface MapActionHdSegment {
  readonly clipId: string;
  /** 控制器的表現階段，對到它在片段裡的起始幀：片段幀 = 起始幀 + max(0, 控制器幀)。 */
  readonly phases: Readonly<Record<string, number>>;
  /**
   * 片段重播的次數（冰雪逐圈重播同一個六幀循環，`REMAKE-206`）：控制器幀按片段幀數取餘，時間線上首尾相接
   * 排 `repeat` 次；只有最後一次帶餘韻（之前的會被下一圈換下）。預設 1。
   */
  readonly repeat?: number;
  /**
   * 逐格錯開（`REMAKE-208`）：控制器的幀是整條直線／路徑的步數，每格的片段幀由戰場依原版的逐格規則算出
   * （`BattleScene` 的 `mapActionHdCells`），同一時刻各格可以停在不同幀。
   */
  readonly staggered?: boolean;
}

/**
 * 哪些動作有高清版、各階段由哪一段片段畫。三檔治療共用 `MAGIC/0` 收尾，休息（`DS:60E0`）與它逐項相同，
 * 所以收尾只有一段 `heal-tail`；`1H` 的空白清除幀（tile 0）畫在 `heal-1` 片段的最後一幀上。
 * 任一段片段不在生成表裡時整個動作沒有高清版。
 */
/**
 * `REMAKE-209`：踩踏的腿與影子是兩張靜態圖，原版依目標陣營取一組、照步驟移動；高清版每組兩段靜態片段，
 * 由戰場照原版位置擺（`BattleScene` 的 `stompPlacement`）。
 */
function stompCast(tier: 1 | 2 | 3): readonly MapActionHdSegment[] {
  return ([1, 2] as const).flatMap((side) => (["leg", "shadow"] as const).map((part) => ({
    clipId: `stomp-${tier}-side${side}-${part}`,
    phases: { stompEffect: 0, stompPageToggle: 0 },
  })));
}

/**
 * `REMAKE-210`：落雷分四段。主段（雲、雷柱、雷神）跟著原版逐格移動的錨點畫；命中波的掃描每格從自己被掃到
 * 的那一步開始播（逐格錯開），受擊單位上另疊兩幀交替的標記；最後的 `MAGIC/6` 收尾四檔共用，畫在每個受擊單位上。
 */
function lightningCast(tier: 1 | 2 | 3 | 4): readonly MapActionHdSegment[] {
  return [
    { clipId: `lightning-${tier}-main`, phases: { lightningMain: 0 } },
    { clipId: `lightning-${tier}-hit`, phases: { lightningHit: 0 }, staggered: true },
    { clipId: `lightning-${tier}-marker`, phases: { lightningHit: 0 } },
    { clipId: "lightning-cleanup", phases: { lightningCleanup: 0 } },
  ];
}

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
  // 攻擊提昇與防魔原版呼叫同一段表現（`1000:7572`），共用一段片段
  "attack-up": [{ clipId: "attack-up", phases: { statusEffect: 0 } }],
  "magic-guard": [{ clipId: "attack-up", phases: { statusEffect: 0 } }],
  "defense-up": [{ clipId: "defense-up", phases: { statusEffect: 0 } }],
  "attack-down": [{ clipId: "attack-down", phases: { statusEffect: 0 } }],
  "defense-down": [{ clipId: "defense-down", phases: { statusEffect: 0 } }],
  confusion: [{ clipId: "confusion", phases: { statusEffect: 0 } }],
  "spell-seal": [{ clipId: "spell-seal", phases: { statusEffect: 0 } }],
  poison: [{ clipId: "poison", phases: { poisonEffect: 0 } }],
  dispel: [{ clipId: "dispel", phases: { dispelEffect: 0 } }],
  // `REMAKE-206`：回復三檔圖形相同，同一幀畫在每個受治療單位上；冰雪的六幀循環逐圈重播（半徑減一圈）
  "recovery-1": [{ clipId: "recovery", phases: { recoveryEffect: 0 } }],
  "recovery-2": [{ clipId: "recovery", phases: { recoveryEffect: 0 } }],
  "recovery-3": [{ clipId: "recovery", phases: { recoveryEffect: 0 } }],
  "ice-1": [{ clipId: "ice", phases: { iceExpansion: 0 }, repeat: 2 }],
  "ice-2": [{ clipId: "ice", phases: { iceExpansion: 0 }, repeat: 3 }],
  "ice-3": [{ clipId: "ice", phases: { iceExpansion: 0 }, repeat: 4 }],
  "ice-4": [{ clipId: "ice", phases: { iceExpansion: 0 }, repeat: 5 }],
  // `REMAKE-207`：地圖戰鬥的命中（主攻與反擊同一段）與死亡（地圖戰鬥與技術擊殺同一段，每名死者各播一次）
  "map-hit": [{ clipId: "hit", phases: { primaryHit: 0, counterHit: 0 } }],
  "map-death": [{ clipId: "death", phases: { defenderDeath: 0, attackerDeath: 0, specialDeath: 0 } }],
  // `REMAKE-208`：射擊只畫在目標上；魔弓 `3V`（與調試的 VIRT）同一組圖逐格沿直線長出，`WD` 沿路徑長出，
  // 每格從自己長出的那一步開始播（`staggered`）、播完接一步餘韻；收尾是同一條尾跡繼續推過目標，不重播
  "archer-shot": [{ clipId: "shoot", phases: { shootHit: 0 } }],
  "crossbow-shot": [{ clipId: "shoot", phases: { shootHit: 0 } }],
  "water-warrior-shot": [{ clipId: "shoot", phases: { shootHit: 0 } }],
  "magic-archer-shot": [{ clipId: "shoot", phases: { shootLineGrow: 0, shootLineFinish: 0 }, staggered: true }],
  "virt-a": [{ clipId: "shoot", phases: { shootLineGrow: 0, shootLineFinish: 0 }, staggered: true }],
  "virt-b": [{ clipId: "shoot", phases: { shootLineGrow: 0, shootLineFinish: 0 }, staggered: true }],
  "virt-c": [{ clipId: "shoot", phases: { shootLineGrow: 0, shootLineFinish: 0 }, staggered: true }],
  wd: [{ clipId: "wd", phases: { wdGrowth: 0, wdFinish: 0 }, staggered: true }],
  "stomp-1": stompCast(1),
  "stomp-2": stompCast(2),
  "stomp-3": stompCast(3),
  "lightning-1": lightningCast(1),
  "lightning-2": lightningCast(2),
  "lightning-3": lightningCast(3),
  "lightning-4": lightningCast(4),
};

/**
 * 逐格錯開播放的片段（`REMAKE-208`）：同一時刻各格停在不同幀，每個播放位置要一支視訊——每一幀一支，再加
 * 一支給上一步播完最後一幀、這一步播餘韻的格子（原版在這一步清掉它）。
 */
const MAP_ACTION_HD_STAGGERED_CLIPS: ReadonlySet<string> = new Set([
  "shoot", "wd", "lightning-1-hit", "lightning-2-hit", "lightning-3-hit", "lightning-4-hit",
]);

/**
 * `REMAKE-213`：凍結單位身上的冰殼。原版冰雪結束後，每個被冰封的單位上一直留著 `MAGIC/10` 的最後一幀，直到解凍或破邪；
 * 它不屬於施法表現，所以由戰場另外擺。高清版是一張靜態圖（冰雪片段在那一幀的畫面），四檔冰雪共用，跟著冰雪一起下載。
 */
export const MAP_ACTION_HD_ICE_SHELL = "ice-shell";

/** 施法後留在地圖上的高清靜態圖，跟著施放它的動作一起下載。 */
const MAP_ACTION_HD_LEFT_BEHIND: Readonly<Record<string, readonly string[]>> = {
  "ice-1": [MAP_ACTION_HD_ICE_SHELL],
  "ice-2": [MAP_ACTION_HD_ICE_SHELL],
  "ice-3": [MAP_ACTION_HD_ICE_SHELL],
  "ice-4": [MAP_ACTION_HD_ICE_SHELL],
};

/** 每個關卡都可能用到的高清動作：所有單位都能休息，地圖戰鬥的命中與死亡（`REMAKE-207`）也不分職業。 */
export const MAP_ACTION_HD_EVERY_STAGE: readonly string[] = ["rest", "map-hit", "map-death"];

export function mapActionHdClip(clipId: string): MapActionHdClip | undefined {
  return Object.hasOwn(MAP_ACTION_HD_CLIPS, clipId) ? MAP_ACTION_HD_CLIPS[clipId] : undefined;
}

export function mapActionHdClips(): readonly MapActionHdClip[] {
  return Object.values(MAP_ACTION_HD_CLIPS);
}

/** 這段片段要幾支視訊（同時有幾個不同的播放位置）：逐格錯開的片段是幀數加一，其餘一支。 */
export function mapActionHdInstanceCount(clipId: string): number {
  const clip = mapActionHdClip(clipId);
  return clip && MAP_ACTION_HD_STAGGERED_CLIPS.has(clipId) ? clip.frameStartTicks.length + 1 : 1;
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

/** 控制器第 `frame` 幀在片段裡是第幾幀（重播的片段按片段幀數取餘）。 */
export function mapActionHdClipFrame(segment: MapActionHdSegment, phase: string, frame: number): number | undefined {
  const offset = Object.hasOwn(segment.phases, phase) ? segment.phases[phase] : undefined;
  if (offset === undefined) return undefined;
  const local = offset + Math.max(0, frame);
  const frames = (segment.repeat ?? 1) > 1 ? mapActionHdClip(segment.clipId)?.frameStartTicks.length : undefined;
  return frames ? local % frames : local;
}

/** 這些動作用到的高清視訊網址（沒有高清版的動作略過；冰雪連同它留下的冰殼）。 */
export function mapActionHdAssetUrlsForActions(actionIds: Iterable<string>): readonly string[] {
  const urls = new Set<string>();
  for (const actionId of actionIds) {
    const left = Object.hasOwn(MAP_ACTION_HD_LEFT_BEHIND, actionId) ? MAP_ACTION_HD_LEFT_BEHIND[actionId] : [];
    for (const clipId of [...(mapActionHdCast(actionId) ?? []).map((segment) => segment.clipId), ...left]) {
      const clip = mapActionHdClip(clipId);
      if (clip) urls.add(clip.video.source);
    }
  }
  return [...urls].sort();
}

export interface MapActionHdCastTimeline {
  /**
   * 各段片段與它在這次施法時間線上的起點（分段首尾相接，重播的片段每次一項，`repeat` 是第幾次）與畫面終點
   * （重播中途的一次不帶餘韻）。
   */
  readonly segments: readonly {
    readonly clip: MapActionHdClip;
    readonly startTick: number;
    readonly endTick: number;
    readonly repeat: number;
  }[];
  /** 原版圖形時間線總長。 */
  readonly durationTicks: number;
  /** 高清畫面全部結束的 tick（含最後一段之後還沒播完的餘韻）。 */
  readonly endTick: number;
}

/** 一次施法的高清時間線（技術實驗室按時間軸位置直接算出畫面）；沒有高清版時回傳 `undefined`。 */
export function mapActionHdCastTimeline(actionId: string): MapActionHdCastTimeline | undefined {
  const cast = mapActionHdCast(actionId);
  if (!cast) return undefined;
  const segments: { clip: MapActionHdClip; startTick: number; endTick: number; repeat: number }[] = [];
  let startTick = 0;
  let endTick = 0;
  for (const { clipId, repeat = 1 } of cast) {
    const clip = mapActionHdClip(clipId);
    if (!clip) return undefined;
    for (let index = 0; index < repeat; index += 1) {
      const end = startTick + clip.durationTicks + (index === repeat - 1 ? clip.afterglowTicks : 0);
      segments.push({ clip, startTick, endTick: end, repeat: index });
      endTick = Math.max(endTick, end);
      startTick += clip.durationTicks;
    }
  }
  return { segments, durationTicks: startTick, endTick };
}

/** 施法時間線上第 `tick` 時看得到的片段與片段內 tick（餘韻可與下一段重疊）。 */
export function mapActionHdVisibleAt(
  timeline: MapActionHdCastTimeline,
  tick: number,
): readonly { readonly clip: MapActionHdClip; readonly tick: number; readonly repeat: number }[] {
  return timeline.segments.flatMap(({ clip, startTick, endTick, repeat }) => {
    const local = tick - startTick;
    return local >= 0 && tick < endTick ? [{ clip, tick: local, repeat }] : [];
  });
}
