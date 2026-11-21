import { MAP_ACTION_HD_ENTRIES } from "./map-action-hd.generated";

/**
 * `REMAKE-203` 可選的高清地圖技術特效：每個有高清版的動作一段堆疊視訊（顏色×透明度與 1−透明度兩半），
 * 由原版逐幀經 AI 重繪、補間而來，每個原版幀都在它的原版起始 tick 出現，總長與原版時間線相同。
 * 生成表以動作 ID 對應，素材只在玩家選了「美術風格　高清」時由資源門下載。
 */
export interface MapActionHdVideo {
  readonly source: string;
  readonly width: number;
  readonly height: number;
  /** 每 native tick 一幀。 */
  readonly frames: number;
  readonly fps: number;
}

export interface MapActionHdEntry {
  readonly actionId: string;
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
  /** 原版圖形時間線的總 tick 數（與 `TECHNIQUE_LAB_FIRE`、`STAGE1_ACTION_PRESENTATION` 同一證據）。 */
  readonly durationTicks: number;
  /** 原版每一幀的起始 tick，依控制器 emit 的幀序。 */
  readonly frameStartTicks: readonly number[];
}

export function mapActionHdEntry(actionId: string): MapActionHdEntry | undefined {
  return Object.hasOwn(MAP_ACTION_HD_ENTRIES, actionId) ? MAP_ACTION_HD_ENTRIES[actionId] : undefined;
}

export function mapActionHdEntries(): readonly MapActionHdEntry[] {
  return Object.values(MAP_ACTION_HD_ENTRIES);
}

/** 這些動作的高清視訊網址（沒有高清版的動作略過）。 */
export function mapActionHdAssetUrlsForActions(actionIds: Iterable<string>): readonly string[] {
  const urls = new Set<string>();
  for (const actionId of actionIds) {
    const entry = mapActionHdEntry(actionId);
    if (entry) urls.add(entry.video.source);
  }
  return [...urls].sort();
}
