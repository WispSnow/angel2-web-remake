import * as Phaser from "phaser";
import { isProgramHeldSilently, isProgramPaused, onProgramPauseChange } from "../program-clock";
import { trackPresentationWork } from "../presentation-probe";

/** Every started scene has finished preload/create and nothing is still loading. */
const scenesSettled = (game: Phaser.Game): boolean => {
  const scenes = game.scene.getScenes(false);
  let running = false;
  for (const scene of scenes) {
    const status = scene.sys.settings.status;
    if (status >= Phaser.Scenes.INIT && status <= Phaser.Scenes.CREATING) return false;
    if (status === Phaser.Scenes.RUNNING) {
      running = true;
      if (scene.load.isLoading()) return false;
    }
  }
  return running;
};

/** Frames rendered after the scenes settle, so freshly uploaded textures are on screen. */
const SETTLED_FRAMES_BEFORE_HOLD = 2;

/** Keeps Phaser's own update, input and render systems on the global pause. */
export function bindPhaserProgramPause(game: Phaser.Game): void {
  /**
   * A paused Phaser game never boots its scenes, so a game created under the
   * capture readiness hold would sit on a blank canvas until the recorder starts
   * it. Under that hold the game runs until its scenes have drawn, then joins
   * the pause; the hold has already frozen every program-clock sequence.
   */
  let awaitingFirstFrame = isProgramHeldSilently();
  const apply = (paused: boolean) => {
    if (paused && awaitingFirstFrame) return;
    if (paused) game.pause();
    else game.resume();
    game.canvas.dataset.programPaused = String(paused);
  };
  const unsubscribe = onProgramPauseChange(apply);
  game.events.once(Phaser.Core.Events.DESTROY, unsubscribe);
  if (awaitingFirstFrame) {
    trackPresentationWork(new Promise<void>((resolve) => {
      let settledFrames = 0;
      const finish = () => {
        game.events.off(Phaser.Core.Events.POST_RENDER, onRender);
        awaitingFirstFrame = false;
        if (isProgramPaused()) apply(true);
        resolve();
      };
      const onRender = () => {
        settledFrames = scenesSettled(game) ? settledFrames + 1 : 0;
        if (settledFrames >= SETTLED_FRAMES_BEFORE_HOLD || !isProgramHeldSilently()) finish();
      };
      game.events.on(Phaser.Core.Events.POST_RENDER, onRender);
      game.events.once(Phaser.Core.Events.DESTROY, () => {
        game.events.off(Phaser.Core.Events.POST_RENDER, onRender);
        resolve();
      });
    }));
  }
  apply(isProgramPaused());
}
