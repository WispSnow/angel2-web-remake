import { STORY_HD_ENTRIES, STORY_HD_INTRO, STORY_HD_TITLE } from "./story-hd.generated";

/**
 * `REMAKE-196` 可選的高清劇情插圖：每張 `BK/<id>` 一段 AI 重繪的全畫面待機循環。
 * 生成表以原版插圖的 URL 對應——關卡資產本來就用這個 URL 指名插圖，所以不必在
 * 各關另外登記 `BK` 號，也不會把高清檔案混進關卡資源包。
 */
export interface StoryHdVideo {
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly fps: number;
  /**
   * `stacked`：畫面前景帶透明度、疊在捲動的天空上。視訊高度是畫面的兩倍：上半是乘過
   * alpha 的顏色（天空處為黑），下半是 `1 − alpha` 的灰階（天空處為白）。
   */
  readonly alpha?: "stacked";
}

/**
 * 可水平無縫平鋪的雲層（使用者 2026-11-18：雲不能隨循環先慢慢飄、再快速退回去，要用
 * 獨立的圖層當背景捲軸）。圖寬就是平鋪週期，從畫面頂端畫起；位移以畫面像素計。
 */
export interface StoryHdSky {
  readonly source: string;
  readonly width: number;
  readonly height: number;
  /** 每秒捲動的畫面像素；負值向左。 */
  readonly speed: number;
}

export interface StoryHdEntry {
  /** 原版 `BK` 記錄號（證據元資料，不參與查找）。 */
  readonly background: number;
  /** 這段循環取代的原版 320×200 插圖。 */
  readonly original: string;
  /** 畫面第 0 幀（有雲層時是捲動位移 0 的合成）；視訊就緒前、不允許自動播放時與靜止插圖都顯示它。 */
  readonly poster: string;
  /** 沒有時這張高清插圖是靜止畫（例如 `BK/13`，使用者要它保持靜止）。 */
  readonly video?: StoryHdVideo;
  /** 有雲層時視訊必為 `stacked`，遊戲把雲、前景與透明度在畫布上合成。 */
  readonly sky?: StoryHdSky;
}

/** 標題畫面裡的一張高清圖層與它在高清上半圖裡的位置（高清畫素）。 */
export interface StoryHdPlaced {
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

/** 標題的雲層：同劇情雲層，從高清上半圖的 `y` 畫起，只露在畫框裡。 */
export interface StoryHdTitleSky {
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly speed: number;
  readonly y: number;
}

/** 原版標題輪流顯示的一組（`0000:0480` 每次閒置重播換一組）：只差天空顏色與標誌顏色。 */
export interface StoryHdTitleVariant {
  readonly upper: string;
  readonly lower: string;
  /** 標誌文字本身（640×123，原版像素，字以外透明），疊在兩名女子之上。 */
  readonly logo: string;
  readonly land: StoryHdPlaced;
  readonly sky: StoryHdTitleSky;
}

/**
 * 高清標題畫面（使用者 2026-11-18）：藍底、畫框與標誌保留原版像素，框內風景換成高清地景加捲動雲層，兩名女子
 * 各自生成待機循環後疊成一段 `stacked` 視訊。座標以原版上半圖（472×349，置於畫面 (32,0)）乘 `scale` 的高清畫素計。
 */
export interface StoryHdTitle {
  readonly scale: number;
  /** 重建後的畫框與框外藍底（原版上半圖尺寸，框內透明）。 */
  readonly frame: string;
  /** 畫框內緣：雲層與地景只畫在這個矩形裡，角飾由畫框圖層蓋回。 */
  readonly interior: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly women: StoryHdVideo & { readonly x: number; readonly y: number };
  readonly variants: readonly StoryHdTitleVariant[];
}

export const STORY_HD_TITLE_AVAILABLE = STORY_HD_TITLE !== undefined;
export { STORY_HD_INTRO, STORY_HD_TITLE };

/** 開場捲動字幕上方的一張高清畫面（`REMAKE-198`）：一段只播一次的視訊，不循環。 */
export interface StoryHdIntroScene {
  /** 取代的原版畫面（`STARTUP_INTRO.backgrounds` 同一順序的 `BK/41`、`43..48`）。 */
  readonly original: string;
  /** 這張畫面完全出現的捲動更新：交叉淡化以它為中心。第一張為 0。 */
  readonly cue: number;
  readonly video: StoryHdVideo;
}

/**
 * 高清開場（使用者 2026-11-18）：七張畫面重繪成高清、各自動起來，換畫面的時間跟著旁白
 * （`REMAKE-189`）每句開口的時刻，不照原版的淡出淡入點。只換表現：捲動字幕、音樂與旁白照舊。
 */
export interface StoryHdIntro {
  /** 原版畫面在 640×350 畫面上的矩形；視訊拉伸進這裡。 */
  readonly plate: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** 相鄰兩張交叉淡化的長度（原版捲動時間的毫秒，以切換點為中心）。 */
  readonly crossfadeMs: number;
  readonly scenes: readonly StoryHdIntroScene[];
}

/** 高清開場要下載的檔案，依播放順序（先下載的先能播）。 */
export function storyHdIntroAssetUrls(intro: StoryHdIntro): readonly string[] {
  return intro.scenes.map((scene) => scene.video.source);
}

/**
 * 第 `index` 張畫面在原版捲動時間上的區間（毫秒，`updateMs` 是一次捲動更新）：視訊從 `start` 播起，
 * `start..start + crossfadeMs` 淡入（第一張一開始就完全出現），到下一張淡入完成的 `end` 為止。
 */
export function storyHdIntroWindow(intro: StoryHdIntro, index: number, updateMs: number): { start: number; end: number } {
  const half = intro.crossfadeMs / 2;
  const scene = intro.scenes[index];
  const next = intro.scenes[index + 1];
  return {
    start: index === 0 ? 0 : scene.cue * updateMs - half,
    end: next ? next.cue * updateMs + half : Number.POSITIVE_INFINITY,
  };
}

/** 高清標題要下載的全部檔案（兩組都要：閒置重播會換組）。 */
export function storyHdTitleAssetUrls(title: StoryHdTitle): readonly string[] {
  return [
    title.frame,
    title.women.source,
    ...title.variants.flatMap((variant) => [variant.logo, variant.land.source, variant.sky.source]),
  ];
}

const BY_ORIGINAL = new Map(STORY_HD_ENTRIES.map((entry) => [entry.original, entry]));

export const STORY_HD_AVAILABLE = STORY_HD_ENTRIES.length > 0;

export function storyHdEntryForSource(source: string | undefined): StoryHdEntry | undefined {
  return source === undefined ? undefined : BY_ORIGINAL.get(source);
}

export function storyHdAssetUrls(entry: StoryHdEntry): readonly string[] {
  const urls = [entry.poster];
  if (entry.video) urls.push(entry.video.source);
  if (entry.sky) urls.push(entry.sky.source);
  return urls;
}

/** 這些原版插圖裡有高清版的那些要額外下載的檔案（去重，依輸入順序）。 */
export function storyHdAssetUrlsForSources(sources: Iterable<string>): readonly string[] {
  const urls = new Set<string>();
  for (const source of sources) {
    const entry = BY_ORIGINAL.get(source);
    if (entry) for (const url of storyHdAssetUrls(entry)) urls.add(url);
  }
  return [...urls];
}
