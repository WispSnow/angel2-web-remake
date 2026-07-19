import { ASSETS, SPEECH_RECORD_BY_CHARACTER } from "./content/stage0";
import type { GameController } from "./controller";
import type { GamePhase } from "./types";

export class AudioManager {
  private unlocked = false;
  private previousPhase: GamePhase;
  private previousCueSequence = 0;
  private readonly storyMusic = new Audio(ASSETS.audio.story);

  constructor(private readonly controller: GameController, root: HTMLElement) {
    this.previousPhase = controller.phase;
    this.storyMusic.loop = true;
    this.storyMusic.volume = 0.32;
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
    this.unlocked = true;
    this.syncMusic();
  }

  private sync(): void {
    if (this.previousPhase !== this.controller.phase || this.controller.phase === "prebattleStory") this.syncMusic();
    const cue = this.controller.audioCue;
    if (cue && cue.sequence !== this.previousCueSequence) {
      this.previousCueSequence = cue.sequence;
      const source = ASSETS.audio.effects[cue.record as keyof typeof ASSETS.audio.effects];
      if (source) this.playEffect(source, cue.record === 11 ? 0.5 : 0.55);
    }
    this.previousPhase = this.controller.phase;
  }

  private syncMusic(): void {
    if (!this.unlocked || !this.controller.musicEnabled || this.controller.phase !== "prebattleStory") {
      this.storyMusic.pause();
      return;
    }
    void this.storyMusic.play().catch(() => undefined);
  }

  private playEffect(source: string, volume: number): void {
    if (!this.unlocked || !this.controller.soundEnabled) return;
    const effect = new Audio(source);
    effect.volume = volume;
    void effect.play().catch(() => undefined);
  }
}
