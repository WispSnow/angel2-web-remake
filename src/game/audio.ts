import { ASSETS, SPEECH_RECORD_BY_CHARACTER } from "./content/stage0";
import type { GameController } from "./controller";
import type { AttackResult, GamePhase } from "./types";

export class AudioManager {
  private unlocked = false;
  private previousPhase: GamePhase;
  private previousCombat?: AttackResult;
  private readonly storyMusic = new Audio(ASSETS.audio.story);

  constructor(private readonly controller: GameController, root: HTMLElement) {
    this.previousPhase = controller.phase;
    this.storyMusic.loop = true;
    this.storyMusic.volume = 0.32;
    root.addEventListener("pointerdown", () => this.unlock(), { capture: true });
    root.addEventListener("click", () => this.playEffect(ASSETS.audio.confirm, 0.22), { capture: true });
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
    if (this.controller.lastCombat && this.controller.lastCombat !== this.previousCombat) {
      this.previousCombat = this.controller.lastCombat;
      this.playEffect(ASSETS.audio.soldierAttack, 0.5);
      globalThis.setTimeout(() => this.playEffect(ASSETS.audio.hit, 0.55), this.controller.presentationFast ? 30 : 170);
      if (this.controller.lastCombat.defenderDied || this.controller.lastCombat.attackerDied) {
        globalThis.setTimeout(() => this.playEffect(ASSETS.audio.death, 0.5), this.controller.presentationFast ? 80 : 360);
      }
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
