import { ASSETS, SPEECH_RECORD_BY_CHARACTER } from "./content/stage0";
import { STAGE0_ACTION_AUDIO_ASSETS } from "./content/stage0-actions.generated";
import { STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS } from "./content/stage0-music.generated";
import type { GameController } from "./controller";
import {
  MusicTransport,
  type IntroLoopMusicProgram,
  type LoopMusicProgram,
  type MusicProgram,
  type MusicTransportState,
} from "./music-transport";
import {
  isSoundEffectChannelEnabled,
  MUSIC_GAIN_BY_VOLUME,
  soundEffectChannelForCue,
  type SoundEffectChannel,
} from "./audio-settings";
import type { GamePhase } from "./types";

type BattleMusicSide = "player" | "enemy";

const playerMusicPhases = new Set<GamePhase>([
  "scriptedMove",
  "openingStory",
  "player",
  "allyAuto",
  "round2Story",
]);

const battleMusicSide = (phase: GamePhase): BattleMusicSide | undefined => {
  if (playerMusicPhases.has(phase)) return "player";
  if (phase === "enemy") return "enemy";
  return undefined;
};

const storyMusicProgram = {
  id: "stage0-story",
  kind: "loop",
  track: "MAGIC/73",
  source: ASSETS.audio.story,
  seamlessLoop: ASSETS.audio.storySeamlessLoop,
} satisfies LoopMusicProgram;

const playerBattleMusicProgram = {
  id: "stage0-player-battle",
  kind: "intro-loop",
  entryTrack: "MUSIC/7",
  loopTrack: "MUSIC/6",
  entry: ASSETS.audio.playerBattleEntry,
  seamlessLoop: ASSETS.audio.playerBattleSeamlessLoop,
  crossfadeSeconds: STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS,
} satisfies IntroLoopMusicProgram;

const enemyBattleMusicProgram = {
  id: "stage0-enemy-battle",
  kind: "intro-loop",
  entryTrack: "MUSIC/5",
  loopTrack: "MUSIC/4",
  entry: ASSETS.audio.enemyBattleEntry,
  seamlessLoop: ASSETS.audio.enemyBattleSeamlessLoop,
  crossfadeSeconds: STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS,
} satisfies IntroLoopMusicProgram;

const battleMusicProgram = (side: BattleMusicSide): IntroLoopMusicProgram => side === "player"
  ? playerBattleMusicProgram
  : enemyBattleMusicProgram;

const musicPrograms = [
  storyMusicProgram,
  playerBattleMusicProgram,
  enemyBattleMusicProgram,
] as const;

export class AudioManager {
  private unlocked = false;
  private previousPhase: GamePhase;
  private previousCueSequence = 0;
  private selectedMusic?: MusicProgram;
  private readonly music: MusicTransport;
  private readonly effectRequestCounts: Record<SoundEffectChannel, number> = {
    speech: 0,
    movement: 0,
    combat: 0,
    key: 0,
  };
  private readonly effectPlaybackCounts: Record<SoundEffectChannel, number> = {
    speech: 0,
    movement: 0,
    combat: 0,
    key: 0,
  };
  constructor(
    private readonly controller: GameController,
    private readonly root: HTMLElement,
    initiallyUnlocked = false,
  ) {
    this.unlocked = initiallyUnlocked;
    this.previousPhase = controller.phase;
    this.music = new MusicTransport(
      MUSIC_GAIN_BY_VOLUME[controller.musicVolume],
      (state) => this.updateMusicDebugState(state),
    );
    this.music.preload(musicPrograms);
    this.updateEffectDebugState();
    root.addEventListener("pointerdown", () => this.unlock(), { capture: true });
    root.addEventListener("click", (event) => {
      if ((event.target as Element).closest("button,[data-testid=tactical-minimap]")) {
        this.playEffect(ASSETS.audio.confirm, 0.22, "key");
      }
    }, { capture: true });
    controller.onChange(() => this.sync());
    this.syncMusic();
    if (this.unlocked) this.music.unlock();
  }

  playSpeechCharacter(character: string): void {
    if (/[，．？！「」\s]/u.test(character)) return;
    const record = SPEECH_RECORD_BY_CHARACTER[character];
    if (record === undefined) return;
    this.playEffect(ASSETS.audio.speech[record - 57], 0.24, "speech");
  }

  private unlock(): void {
    this.unlocked = true;
    this.music.unlock();
  }

  private sync(): void {
    this.syncMusic();
    const cue = this.controller.audioCue;
    if (cue && cue.sequence !== this.previousCueSequence) {
      this.previousCueSequence = cue.sequence;
      const actionKey = `${cue.group}-${cue.record}` as keyof typeof STAGE0_ACTION_AUDIO_ASSETS;
      const source = STAGE0_ACTION_AUDIO_ASSETS[actionKey]
        ?? (cue.group === "e"
          ? ASSETS.audio.effects[cue.record as keyof typeof ASSETS.audio.effects]
          : undefined);
      if (source) {
        this.playEffect(
          source,
          cue.record === 11 ? 0.5 : 0.55,
          soundEffectChannelForCue(cue.reason),
        );
      }
    }
  }

  private syncMusic(): void {
    this.applyMusicVolume();
    const side = battleMusicSide(this.controller.phase);
    const previousSide = battleMusicSide(this.previousPhase);
    let desired = this.selectedMusic;
    let restart = false;
    if (this.controller.phase === "prebattleStory") desired = storyMusicProgram;
    else if (side && (side !== previousSide || !desired)) {
      desired = battleMusicProgram(side);
      restart = desired.id === this.selectedMusic?.id;
    }
    else if (this.controller.phase === "quit" || this.controller.phase === "nextStage") {
      desired = undefined;
    }

    if (desired?.id !== this.selectedMusic?.id || restart) {
      this.selectedMusic = desired;
      this.music.select(desired, restart);
    }
    this.previousPhase = this.controller.phase;
  }

  private applyMusicVolume(): void {
    this.music.setGain(MUSIC_GAIN_BY_VOLUME[this.controller.musicVolume]);
  }

  private updateMusicDebugState(state: MusicTransportState): void {
    if (!this.controller.isTestMode) return;
    this.root.dataset.musicTrack = state.track ?? "none";
    this.root.dataset.musicPlaying = String(state.playing);
    this.root.dataset.musicLoop = String(state.loop);
    this.root.dataset.musicPart = state.part;
    this.root.dataset.musicVolumeLevel = String(this.controller.musicVolume);
    this.root.dataset.musicVolume = String(MUSIC_GAIN_BY_VOLUME[this.controller.musicVolume]);
    this.root.dataset.musicPlayRequestCount = String(state.playRequestCount);
    this.root.dataset.musicEngine = "web-audio";
    this.root.dataset.musicSeamlessLoop = String(state.seamlessLoop);
    this.root.dataset.musicCrossfadeMs = state.crossfadeMilliseconds.toFixed(3);
    if (state.boundaryDbfs === undefined) delete this.root.dataset.musicBoundaryDbfs;
    else this.root.dataset.musicBoundaryDbfs = state.boundaryDbfs.toFixed(3);
    if (state.error) this.root.dataset.musicError = state.error;
    else delete this.root.dataset.musicError;
  }

  private updateEffectDebugState(channel?: SoundEffectChannel): void {
    if (!this.controller.isTestMode) return;
    for (const name of Object.keys(this.effectPlaybackCounts) as SoundEffectChannel[]) {
      this.root.dataset[`${name}EffectRequestCount`] = String(this.effectRequestCounts[name]);
      this.root.dataset[`${name}EffectCount`] = String(this.effectPlaybackCounts[name]);
    }
    if (channel) this.root.dataset.lastEffectChannel = channel;
  }

  private playEffect(source: string, volume: number, channel: SoundEffectChannel): void {
    this.effectRequestCounts[channel] += 1;
    if (this.controller.isTestMode) this.root.dataset.lastEffectRequestChannel = channel;
    this.updateEffectDebugState();
    if (!this.unlocked || !isSoundEffectChannelEnabled(this.controller, channel)) return;
    this.effectPlaybackCounts[channel] += 1;
    this.updateEffectDebugState(channel);
    const effect = new Audio(source);
    effect.volume = volume;
    void effect.play().catch(() => undefined);
  }
}
