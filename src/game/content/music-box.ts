import type { MusicProgram } from "../music-transport";
import {
  NATIVE_ENEMY_PHASE_SCENE_OVERRIDES,
  NATIVE_MUSIC_BOX,
  NATIVE_MUSIC_RECORD_USAGE,
} from "./debug-mode.generated";
import { musicAsset, type MusicContainer } from "./music-assets";
import { STAGE_INDEX } from "./stage-index";

/**
 * `REMAKE-174` 音樂盒。
 *
 * 原版（模組 29 `1000:3154`）只在除錯模式裡用 M 打開一個 `MUSIC-  NN-名稱.RIX`／`PLAY`
 * 小框，序號在 0..30 之間回繞。複刻把它常駐在「音樂開關」面板，先照原版順序列出 31 首，
 * 再把原版選不到或根本沒收的曲子放進「原版未收錄」。用途說明是複刻自撰文字；曲目、
 * 順序、原開發名與播放方式都來自原版名單。
 */
export interface MusicBoxTrack {
  readonly id: string;
  readonly group: "native" | "extra";
  /** 原版名單序號；「原版未收錄」裡只有 `TALK.RIX` 也在原版表內。 */
  readonly nativeIndex?: number;
  readonly legacyName?: string;
  readonly container: MusicContainer;
  readonly record: number;
  readonly kind: "loop" | "intro-loop";
  readonly usage: string;
}

/** 曲對的入場段與循環段之間的交疊長度，與各關戰場曲共用。 */
const PAIR_CROSSFADE_SECONDS = 1024 / 44_100;

const stageLabel = (scene: number): string | undefined => {
  const key = scene === 42 ? "stage-42-portal" : `stage-${String(scene).padStart(2, "0")}`;
  return (STAGE_INDEX as Readonly<Record<string, { label: string } | undefined>>)[key]?.label;
};

const stageList = (scenes: readonly number[]): string =>
  scenes.map(stageLabel).filter((label): label is string => label !== undefined).join("、");

const ROLE_USAGE: Readonly<Record<string, string>> = {
  passwordGate: "首次啟動的密碼驗證畫面",
  title: "標題選單",
  scrollingIntro: "標題前的捲動開場",
  deploymentScreenEarlyScenes: "出擊準備畫面（前期關卡）",
  deploymentScreenLateScenes: "出擊準備畫面（「來到異世界」起）",
  prosperousEnding: "王朝繁盛結局",
};

function musicUsage(record: number): string {
  const usage = NATIVE_MUSIC_RECORD_USAGE[`MUSIC/${record}`];
  if (!usage) return "";
  const parts: string[] = [];
  if (usage.playerPhaseScenes.length > 0) parts.push(`我方回合：${stageList(usage.playerPhaseScenes)}`);
  if (usage.enemyPhaseScenes.length > 0) parts.push(`敵方回合：${stageList(usage.enemyPhaseScenes)}`);
  for (const role of usage.roles) {
    const text = ROLE_USAGE[role];
    if (text) parts.push(text);
  }
  return parts.join("；");
}

/**
 * 劇情曲 `MAGIC/72..79` 由模組 25 按關卡選曲。`T04`（`MAGIC/75`）分到的關卡在原版都沒有
 * 關前劇情可播，驅動隨即被下一個模組重新初始化，所以正常流程聽不到它。
 */
function storyUsage(record: number): string {
  if (record === 75) return "關前劇情曲；原版分配給沒有關前劇情的關卡，正常流程聽不到";
  return "關前劇情曲";
}

const NATIVE_TRACKS: readonly MusicBoxTrack[] = NATIVE_MUSIC_BOX.entries
  .filter(({ reachable }) => reachable)
  .map((entry) => ({
    id: `native-${entry.index}`,
    group: "native",
    nativeIndex: entry.index,
    legacyName: entry.legacyName,
    container: entry.container,
    record: entry.record,
    kind: entry.kind,
    usage: entry.container === "MUSIC" ? musicUsage(entry.record) : storyUsage(entry.record),
  }));

const unreachableNative = NATIVE_MUSIC_BOX.entries.filter(({ reachable }) => !reachable);

const enemyOverride = NATIVE_ENEMY_PHASE_SCENE_OVERRIDES[0];
const [overrideContainer, overrideRecord] = enemyOverride.key.split("/");

const EXTRA_TRACKS: readonly MusicBoxTrack[] = [
  ...unreachableNative.map((entry): MusicBoxTrack => ({
    id: `native-${entry.index}`,
    group: "extra",
    nativeIndex: entry.index,
    legacyName: entry.legacyName,
    container: entry.container,
    record: entry.record,
    kind: entry.kind,
    usage: "原版名單第 32 項；序號在 30 回繞，原版選不到",
  })),
  {
    id: `extra-${overrideContainer.toLowerCase()}-${overrideRecord}`,
    group: "extra",
    container: overrideContainer as MusicContainer,
    record: Number(overrideRecord),
    kind: "loop",
    usage: `敵方回合：${stageLabel(enemyOverride.scene) ?? "最終決戰"}專屬曲`,
  },
  { id: "extra-un-6", group: "extra", container: "UN", record: 6, kind: "loop", usage: "主線結局：戰績卡" },
  { id: "extra-un-49", group: "extra", container: "UN", record: 49, kind: "loop", usage: "王朝衰亡結局" },
  { id: "extra-un-55", group: "extra", container: "UN", record: 55, kind: "loop", usage: "製作人員表" },
];

export const MUSIC_BOX_TRACKS: readonly MusicBoxTrack[] = [...NATIVE_TRACKS, ...EXTRA_TRACKS];

/** 原版第一行的樣式：`MUSIC-` + 五位右對齊序號 + `-` + 原開發名。 */
export function nativeMusicBoxLine(track: MusicBoxTrack): string | undefined {
  if (track.nativeIndex === undefined || track.legacyName === undefined) return undefined;
  return `MUSIC-${String(track.nativeIndex).padStart(5, " ")}-${track.legacyName}`;
}

export function musicBoxSourceLabel(track: MusicBoxTrack): string {
  return `${track.container}/${track.record}`;
}

/**
 * 原版 `1000:32D1`：單曲名單裡的記錄單曲循環；其餘 MUSIC 記錄 N 先送 N+1 入場段，
 * 再接 N 的循環段，與戰場曲對完全相同。
 */
export function musicBoxProgram(track: MusicBoxTrack): MusicProgram {
  const id = `music-box-${track.id}`;
  if (track.kind === "loop") {
    const source = musicAsset(track.container, track.record);
    return { id, kind: "loop", track: musicBoxSourceLabel(track), source, seamlessLoop: source };
  }
  return {
    id,
    kind: "intro-loop",
    entryTrack: `${track.container}/${track.record + 1}`,
    loopTrack: musicBoxSourceLabel(track),
    entry: musicAsset(track.container, track.record + 1),
    seamlessLoop: musicAsset(track.container, track.record),
    crossfadeSeconds: PAIR_CROSSFADE_SECONDS,
  };
}
