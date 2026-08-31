import Phaser from "phaser";
import type { DeploymentSession } from "../deployment-session";
import { bindPhaserProgramPause } from "./program-pause";

const positionKey = ({ x, y }: { x: number; y: number }): string => `${x},${y}`;

export function createDeploymentScene(
  session: DeploymentSession,
  sceneKey = "deployment",
): typeof Phaser.Scene {
  return class DeploymentScene extends Phaser.Scene {
    private unsubscribe?: () => void;

    constructor() {
      super(sceneKey);
    }

    create(): void {
      this.cameras.main.setBackgroundColor("#050405");
      this.unsubscribe = session.onChange(() => this.sync());
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubscribe?.();
      });

      const canvas = this.game.canvas;
      canvas.setAttribute("aria-hidden", "true");
      canvas.dataset.testid = "deployment-canvas";
      canvas.dataset.deploymentBackdrop = "plain";
      this.sync();
    }

    private sync(): void {
      const occupied = new Set(session.state.placements.map(({ position }) => positionKey(position)));
      const remaining = session.state.definition.openCells
        .filter((position) => !occupied.has(positionKey(position)));

      const canvas = this.game.canvas;
      canvas.dataset.deploymentPlacements = session.state.placements
        .map(({ slot, position }) => `${slot}@${position.x},${position.y}`)
        .join(";");
      canvas.dataset.deploymentRemainingCells = remaining.map(positionKey).join(";");
      canvas.dataset.deploymentCurrentCell = session.state.currentOpenCell
        ? positionKey(session.state.currentOpenCell)
        : "";
      canvas.dataset.deploymentSubmitted = String(session.state.submitted);
    }
  };
}

export function startDeploymentPhaser(
  session: DeploymentSession,
  parent: string | HTMLElement = "deployment-phaser-root",
  sceneKey = "deployment",
): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    width: 640,
    height: 350,
    parent,
    transparent: true,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    render: { pixelArt: true, antialias: false, roundPixels: true },
    input: { gamepad: true },
    scene: [createDeploymentScene(session, sceneKey)],
  });
  bindPhaserProgramPause(game);
  return game;
}
