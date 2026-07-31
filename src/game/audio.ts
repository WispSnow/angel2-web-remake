import { ASSETS, SPEECH_RECORD_BY_CHARACTER } from "./content/stage0";
import { STAGE0_ACTION_AUDIO_ASSETS } from "./content/stage0-actions.generated";
import type { GameController } from "./controller";
import {
  isSoundEffectChannelEnabled,
  MUSIC_GAIN_BY_VOLUME,
  soundEffectChannelForCue,
  type SoundEffectChannel,
} from "./audio-settings";
import type { GamePhase } from "./types";

interface MusicTrack {
  key: "MAGIC/73" | "MUSIC/4" | "MUSIC/5" | "MUSIC/6" | "MUSIC/7";
  audio: HTMLAudioElement;
}

type BattleMusicSide = "player" | "enemy";
type BattleMusicPart = "entry" | "loop";

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

export class AudioManager {
  private unlocked = false;
  private previousPhase: GamePhase;
  private previousCueSequence = 0;
  private activeMusic?: MusicTrack;
  private activeBattleSide?: BattleMusicSide;
  private activeBattlePart: BattleMusicPart = "entry";
  private musicPlaying = false;
  private musicPlayPending = false;
  private musicRequestSequence = 0;
  private musicPlayRequestCount = 0;
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
  private readonly storyMusic: MusicTrack = {
    key: "MAGIC/73",
    audio: new Audio(ASSETS.audio.story),
  };
  private readonly playerBattleEntry: MusicTrack = {
    key: "MUSIC/7",
    audio: new Audio(ASSETS.audio.playerBattleEntry),
  };
  private readonly playerBattleLoop: MusicTrack = {
    key: "MUSIC/6",
    audio: new Audio(ASSETS.audio.playerBattleLoop),
  };
  private readonly enemyBattleEntry: MusicTrack = {
    key: "MUSIC/5",
    audio: new Audio(ASSETS.audio.enemyBattleEntry),
  };
  private readonly enemyBattleLoop: MusicTrack = {
    key: "MUSIC/4",
    audio: new Audio(ASSETS.audio.enemyBattleLoop),
  };

  constructor(
    private readonly controller: GameController,
    private readonly root: HTMLElement,
    initiallyUnlocked = false,
  ) {
    this.unlocked = initiallyUnlocked;
    this.previousPhase = controller.phase;
    const loopingTracks = [this.storyMusic, this.playerBattleLoop, this.enemyBattleLoop];
    const entryTracks = [this.playerBattleEntry, this.enemyBattleEntry];
    for (const track of [...loopingTracks, ...entryTracks]) {
      track.audio.loop = loopingTracks.includes(track);
      track.audio.volume = MUSIC_GAIN_BY_VOLUME[controller.musicVolume];
      track.audio.preload = "auto";
    }
    this.playerBattleEntry.audio.addEventListener("ended", () => this.completeBattleEntry("player"));
    this.enemyBattleEntry.audio.addEventListener("ended", () => this.completeBattleEntry("enemy"));
    this.updateMusicDebugState(this.musicForPhase(undefined));
    this.updateEffectDebugState();
    root.addEventListener("pointerdown", () => this.unlock(), { capture: true });
    root.addEventListener("click", (event) => {
      if ((event.target as Element).closest("button,[data-testid=tactical-minimap]")) {
        this.playEffect(ASSETS.audio.confirm, 0.22, "key");
      }
    }, { capture: true });
    controller.onChange(() => this.sync());
    if (this.unlocked) this.syncMusic();
  }

  playSpeechCharacter(character: string): void {
    if (/[，．？！「」\s]/u.test(character)) return;
    const record = SPEECH_RECORD_BY_CHARACTER[character];
    if (record === undefined) return;
    this.playEffect(ASSETS.audio.speech[record - 57], 0.24, "speech");
  }

  private unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.syncMusic();
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
    if (side && side !== previousSide) {
      this.activeBattleSide = side;
      this.activeBattlePart = "entry";
    }
    else if (this.controller.phase === "prebattleStory") {
      this.activeBattleSide = undefined;
      this.activeBattlePart = "entry";
    }

    const desired = this.musicForPhase(side);
    if (desired !== this.activeMusic) {
      this.stopActiveMusic(true);
      this.activeMusic = desired;
    }

    if (!desired || !this.unlocked) {
      this.stopActiveMusic(false);
      this.updateMusicDebugState(desired);
      this.previousPhase = this.controller.phase;
      return;
    }

    if (this.musicPlaying || this.musicPlayPending) {
      this.updateMusicDebugState(desired);
      this.previousPhase = this.controller.phase;
      return;
    }

    const request = ++this.musicRequestSequence;
    this.musicPlayRequestCount += 1;
    this.musicPlayPending = true;
    this.updateMusicDebugState(desired);
    void desired.audio.play().then(() => {
      if (
        request !== this.musicRequestSequence
        || this.activeMusic !== desired
      ) return;
      this.musicPlayPending = false;
      this.musicPlaying = true;
      this.updateMusicDebugState(desired);
    }).catch(() => {
      if (request !== this.musicRequestSequence) return;
      this.musicPlayPending = false;
      this.musicPlaying = false;
      this.updateMusicDebugState(desired);
    });
    this.previousPhase = this.controller.phase;
  }

  private musicForPhase(side: BattleMusicSide | undefined): MusicTrack | undefined {
    if (this.controller.phase === "prebattleStory") return this.storyMusic;
    if (side === "player") {
      return this.activeBattlePart === "entry" ? this.playerBattleEntry : this.playerBattleLoop;
    }
    if (side === "enemy") {
      return this.activeBattlePart === "entry" ? this.enemyBattleEntry : this.enemyBattleLoop;
    }
    if (this.controller.phase === "quit" || this.controller.phase === "nextStage") return undefined;
    return this.activeMusic;
  }

  private completeBattleEntry(side: BattleMusicSide): void {
    if (
      this.activeBattleSide !== side
      || this.activeBattlePart !== "entry"
      || battleMusicSide(this.controller.phase) !== side
    ) return;
    this.activeBattlePart = "loop";
    this.musicPlaying = false;
    this.musicPlayPending = false;
    this.syncMusic();
  }

  private stopActiveMusic(reset: boolean): void {
    if (!this.activeMusic) return;
    this.musicRequestSequence += 1;
    this.activeMusic.audio.pause();
    if (reset) this.activeMusic.audio.currentTime = 0;
    this.musicPlaying = false;
    this.musicPlayPending = false;
  }

  private applyMusicVolume(): void {
    const gain = MUSIC_GAIN_BY_VOLUME[this.controller.musicVolume];
    for (const track of [
      this.storyMusic,
      this.playerBattleEntry,
      this.playerBattleLoop,
      this.enemyBattleEntry,
      this.enemyBattleLoop,
    ]) track.audio.volume = gain;
  }

  private updateMusicDebugState(track: MusicTrack | undefined): void {
    if (!this.controller.isTestMode) return;
    this.root.dataset.musicTrack = track?.key ?? "none";
    this.root.dataset.musicPlaying = String(this.musicPlaying);
    this.root.dataset.musicLoop = String(track?.audio.loop ?? false);
    this.root.dataset.musicPart = this.activeBattlePart;
    this.root.dataset.musicVolumeLevel = String(this.controller.musicVolume);
    this.root.dataset.musicVolume = String(MUSIC_GAIN_BY_VOLUME[this.controller.musicVolume]);
    this.root.dataset.musicPlayRequestCount = String(this.musicPlayRequestCount);
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
