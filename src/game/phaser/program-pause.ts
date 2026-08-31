import * as Phaser from "phaser";
import { isProgramPaused, onProgramPauseChange } from "../program-clock";

/** Keeps Phaser's own update, input and render systems on the global pause. */
export function bindPhaserProgramPause(game: Phaser.Game): void {
  const apply = (paused: boolean) => {
    if (paused) game.pause();
    else game.resume();
    game.canvas.dataset.programPaused = String(paused);
  };
  const unsubscribe = onProgramPauseChange(apply);
  game.events.once(Phaser.Core.Events.DESTROY, unsubscribe);
  apply(isProgramPaused());
}
