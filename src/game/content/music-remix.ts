import type { MusicProgram } from "../music-transport";
import type { MusicStyle } from "../preferences";
import { deploymentMusicProgramFor } from "./deployment-music";
import { musicProgramFor } from "./music";
import { MUSIC_REMIX_TRACKS } from "./music-remix.generated";
import type { StageMusicDefinition } from "./stages";

/**
 * `REMAKE-181` 交響改編。改編綁在原曲上而不是關卡上：一首改編覆蓋所有用到同一首原曲
 * （或同一組入場／循環曲對）的關卡；`交響` 模式下沒有改編的曲目照播原版。
 */
export interface MusicRemixTrack {
  /** 入場／循環曲對寫成 `MUSIC/7→MUSIC/6`，單曲循環寫成 `MAGIC/73`。 */
  readonly key: string;
  readonly entryTrack?: string;
  readonly loopTrack: string;
  /** Suno 生成時的曲名，只作識別。 */
  readonly title: string;
  readonly source: string;
  readonly sampleRate: number;
  readonly frames: number;
  readonly loopStartFrame: number;
  readonly loopEndFrame: number;
}

/** `交響` 模式換曲時舊曲的淡出長度；`原版` 模式維持傳輸層預設的 5 ms 硬切。 */
export const ORCHESTRAL_TRANSITION_FADE_SECONDS = 0.6;

const REMIX_BY_KEY: ReadonlyMap<string, MusicRemixTrack> = new Map(
  MUSIC_REMIX_TRACKS.map((track) => [track.key, track]),
);

function sourceKey(program: MusicProgram): string | undefined {
  if (program.kind === "loop") return program.track;
  if (program.kind === "intro-loop") return `${program.entryTrack}→${program.loopTrack}`;
  return undefined;
}

export function musicRemixFor(program: MusicProgram | undefined): MusicRemixTrack | undefined {
  const key = program ? sourceKey(program) : undefined;
  return key === undefined ? undefined : REMIX_BY_KEY.get(key);
}

/** 依風格換成交響改編；沒有改編或已經是改編時原樣傳回。 */
export function styledMusicProgram(
  program: MusicProgram | undefined,
  style: MusicStyle,
): MusicProgram | undefined {
  if (style !== "orchestral") return program;
  const remix = musicRemixFor(program);
  if (!program || !remix) return program;
  return {
    id: `${program.id}:orchestral`,
    kind: "remix-loop",
    ...(remix.entryTrack ? { entryTrack: remix.entryTrack } : {}),
    loopTrack: remix.loopTrack,
    source: remix.source,
    loopStartSeconds: remix.loopStartFrame / remix.sampleRate,
    loopEndSeconds: remix.loopEndFrame / remix.sampleRate,
  };
}

/** `交響` 模式下這些曲目程式要用的改編檔；`原版` 模式不載入任何改編，免得用原版的玩家多下載一份。 */
export function remixMusicUrls(
  programs: readonly (MusicProgram | undefined)[],
  style: MusicStyle,
): readonly string[] {
  if (style !== "orchestral") return [];
  const urls = new Set<string>();
  for (const program of programs) {
    const remix = musicRemixFor(program);
    if (remix) urls.add(remix.source);
  }
  return [...urls];
}

/**
 * 進關資源門要預載的改編檔：劇情、我方與敵方回合，有出擊準備畫面的關卡再加上模組 27 依場景
 * 選的準備曲（原版模式下那首原曲同樣併進每一關的資源包）。曲目程式要等關卡模組註冊後才查得到，
 * 所以呼叫端須在載入關卡執行模組之後再問。
 */
export function stageRemixMusicUrls(
  music: StageMusicDefinition,
  style: MusicStyle,
  deploymentNativeStage?: number,
): readonly string[] {
  return remixMusicUrls([
    ...[music.story, music.playerPhase, music.enemyPhase].map((id) => musicProgramFor(id)),
    ...(deploymentNativeStage === undefined ? [] : [deploymentMusicProgramFor(deploymentNativeStage)]),
  ], style);
}
