import type { PortraitRecord } from "./portrait-catalog.generated";
import { PORTRAIT_HD_ENTRIES } from "./portrait-hd.generated";

/**
 * `REMAKE-192` 高清肖像的一條記錄。視訊左邊 448×448 是待機循環；右邊的條帶依口型方式而定：
 *
 * - `tween`：四格嘴形（RIFE 補出的 1/4、1/2、3/4 開度與張嘴副本），貼在 `patch`；
 * - `continuous`：整幅同步說話畫面（龍王、妖龍），說話期間淡入；
 * - `none`：只有待機（頭盔遮嘴的士兵與騎兵）；
 * - `still`：只有靜止圖（`D/67` 石像，由龍王換色）。
 */
export type PortraitHdMode = "tween" | "continuous" | "none" | "still";

export interface PortraitHdRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PortraitHdEntry {
  readonly mode: PortraitHdMode;
  /** 循環的第 0 幀（閉嘴），WebP；靜態表面、影片就緒前與無法播放時都顯示它。 */
  readonly poster: string;
  readonly video?: {
    readonly source: string;
    readonly width: number;
    readonly height: number;
    readonly frames: number;
    readonly fps: number;
  };
  readonly mouth?: {
    readonly patch: PortraitHdRect;
    /** 條帶裡四格嘴形的左上角，依序為 1/4、1/2、3/4 與全開。 */
    readonly levels: readonly { readonly sx: number; readonly sy: number }[];
    /** `[0, o(1/4), o(1/2), o(3/4), 1]`：各格的實測開度，播放器據此在相鄰兩格之間混合。 */
    readonly knots: readonly number[];
  };
  /** `continuous` 的整幅說話畫面在視訊裡的左上角。 */
  readonly speakingFrame?: { readonly sx: number; readonly sy: number };
}

export function portraitHdEntry(record: PortraitRecord): PortraitHdEntry | undefined {
  return PORTRAIT_HD_ENTRIES[record];
}

/** 這條記錄的全部高清檔案；沒有高清版時為空。 */
export function portraitHdAssetUrls(record: PortraitRecord): readonly string[] {
  const entry = PORTRAIT_HD_ENTRIES[record];
  if (!entry) return [];
  return entry.video ? [entry.poster, entry.video.source] : [entry.poster];
}

export function portraitHdAssetUrlsForRecords(records: Iterable<PortraitRecord>): readonly string[] {
  const urls = new Set<string>();
  for (const record of records) {
    for (const url of portraitHdAssetUrls(record)) urls.add(url);
  }
  return [...urls].sort();
}

/** 高清素材包整個下架時目錄為空，切換鈕隨之隱藏。 */
export const PORTRAIT_HD_AVAILABLE = Object.keys(PORTRAIT_HD_ENTRIES).length > 0;
