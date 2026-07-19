import { ASSETS, SPEECH_RECORD_BY_CHARACTER } from "./content/stage0";
import type { GameController } from "./controller";
import type { GamePhase } from "./types";

interface MusicTrack {
  key: "MAGIC/73" | "MUSIC/29";
  audio: HTMLAudioElement;
}

const isBattleMusicPhase = (phase: GamePhase): boolean => phase !== "prebattleStory"
  && phase !== "quit"
  && phase !== "nextStage";

export class AudioManager {
  private unlocked = false;
  private previousCueSequence = 0;
  private activeMusic?: MusicTrack;
  private musicPlaying = false;
  private musicPlayPending = false;
  private musicRequestSequence = 0;
  private readonly storyMusic: MusicTrack = {
    key: "MAGIC/73",
    audio: new Audio(ASSETS.audio.story),
  };
  private readonly battleMusic: MusicTrack = {
    key: "MUSIC/29",
    audio: new Audio(ASSETS.audio.battle),
  };

  constructor(private readonly controller: GameController, private readonly root: HTMLElement) {
    for (const track of [this.storyMusic, this.battleMusic]) {
      track.audio.loop = true;
      track.audio.volume = 0.32;
      track.audio.preload = "auto";
    }
    this.updateMusicDebugState(this.musicForPhase());
    root.addEventListener("pointerdown", () => this.unlock(), { capture: true });
    root.addEventListener("click", (event) => {
      if ((event.target as Element).closest("button,[data-testid=tactical-minimap]")) {
        this.playEffect(ASSETS.audio.confirm, 0.22);
      }
    }, { capture: true });
    controller.onChange(() => this.sync());
  }

  playSpeechCharacter(character: string): void {
    if (!this.controller.speechEnabled || /[，．？！「」\s]/u.test(character)) return;
    const record = SPEECH_RECORD_BY_CHARACTER[character];
    if (record === undefined) return;
    this.playEffect(ASSETS.audio.speech[record - 57], 0.24);
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
      const source = ASSETS.audio.effects[cue.record as keyof typeof ASSETS.audio.effects];
      if (source) this.playEffect(source, cue.record === 11 ? 0.5 : 0.55);
    }
  }

  private syncMusic(): void {
    const desired = this.musicForPhase();
    if (desired !== this.activeMusic) {
      this.stopActiveMusic(true);
      this.activeMusic = desired;
    }

    if (!desired || !this.unlocked || !this.controller.musicEnabled) {
      this.stopActiveMusic(false);
      this.updateMusicDebugState(desired);
      return;
    }

    if (this.musicPlaying || this.musicPlayPending) {
      this.updateMusicDebugState(desired);
      return;
    }

    const request = ++this.musicRequestSequence;
    this.musicPlayPending = true;
    this.updateMusicDebugState(desired);
    void desired.audio.play().then(() => {
      if (
        request !== this.musicRequestSequence
        || this.activeMusic !== desired
        || !this.controller.musicEnabled
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
  }

  private musicForPhase(): MusicTrack | undefined {
    if (this.controller.phase === "prebattleStory") return this.storyMusic;
    if (isBattleMusicPhase(this.controller.phase)) return this.battleMusic;
    return undefined;
  }

  private stopActiveMusic(reset: boolean): void {
    if (!this.activeMusic) return;
    this.musicRequestSequence += 1;
    this.activeMusic.audio.pause();
    if (reset) this.activeMusic.audio.currentTime = 0;
    this.musicPlaying = false;
    this.musicPlayPending = false;
  }

  private updateMusicDebugState(track: MusicTrack | undefined): void {
    if (!this.controller.isTestMode) return;
    this.root.dataset.musicTrack = track?.key ?? "none";
    this.root.dataset.musicPlaying = String(this.musicPlaying);
    this.root.dataset.musicLoop = String(track?.audio.loop ?? false);
  }

  private playEffect(source: string, volume: number): void {
    if (!this.unlocked || !this.controller.soundEnabled) return;
    const effect = new Audio(source);
    effect.volume = volume;
    void effect.play().catch(() => undefined);
  }
}
