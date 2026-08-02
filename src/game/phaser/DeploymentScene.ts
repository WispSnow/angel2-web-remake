import Phaser from "phaser";
import { STAGE1, STAGE1_ASSETS } from "../content/stage1";
import type { DeploymentSession } from "../deployment-session";
import type { Position } from "../types";

const TILE_WIDTH = 40;
const TILE_HEIGHT = 44;
const VIEWPORT = { x: 40, y: 23, width: 400, height: 308 } as const;
const CURRENT_SHADOW = 0x000000;
const CURRENT_HIGHLIGHT = 0xffffff;

const positionKey = ({ x, y }: Position): string => `${x},${y}`;

export function createDeploymentScene(session: DeploymentSession): typeof Phaser.Scene {
  return class DeploymentScene extends Phaser.Scene {
    private cellGraphics!: Phaser.GameObjects.Graphics;
    private unitSprites: Phaser.GameObjects.Image[] = [];
    private unsubscribe?: () => void;

    constructor() {
      super("stage1-deployment");
    }

    preload(): void {
      this.load.image("stage1-deployment-map", STAGE1_ASSETS.map);
      this.load.image("stage1-ally-soldier", "/assets/original/unit-ally-soldier.png");
      this.load.image("stage1-ally-magician", STAGE1_ASSETS.allyMagician);
    }

    create(): void {
      const camera = this.cameras.main;
      camera.setViewport(VIEWPORT.x, VIEWPORT.y, VIEWPORT.width, VIEWPORT.height);
      camera.setBounds(0, 0, STAGE1.width * TILE_WIDTH, STAGE1.height * TILE_HEIGHT);
      camera.setScroll(
        STAGE1.viewport.initialOrigin.x * TILE_WIDTH,
        STAGE1.viewport.initialOrigin.y * TILE_HEIGHT,
      );
      camera.setBackgroundColor("#050405");

      this.add.image(0, 0, "stage1-deployment-map").setOrigin(0).setDepth(0);
      this.cellGraphics = this.add.graphics().setDepth(3);
      this.input.on("pointerdown", this.handlePointerDown, this);
      this.unsubscribe = session.onChange(() => this.sync());
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubscribe?.();
        this.input.off("pointerdown", this.handlePointerDown, this);
      });

      const canvas = this.game.canvas;
      canvas.setAttribute("role", "application");
      canvas.setAttribute("aria-label", "騎士城堡前部署地圖；點選發光空格可指定下一落點");
      canvas.dataset.testid = "deployment-canvas";
      this.sync();
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
      if (pointer.button !== 0 || session.state.submitted) return;
      if (
        pointer.x < VIEWPORT.x
        || pointer.x >= VIEWPORT.x + VIEWPORT.width
        || pointer.y < VIEWPORT.y
        || pointer.y >= VIEWPORT.y + VIEWPORT.height
      ) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      session.activateOpenCell({
        x: Math.floor(world.x / TILE_WIDTH),
        y: Math.floor(world.y / TILE_HEIGHT),
      });
    }

    private sync(): void {
      for (const sprite of this.unitSprites) sprite.destroy();
      this.unitSprites = [];
      for (const placement of session.state.placements) {
        const unit = session.rosterUnitFor(placement.slot);
        if (!unit) continue;
        const texture = unit.classId === "magician"
          ? "stage1-ally-magician"
          : "stage1-ally-soldier";
        this.unitSprites.push(
          this.add.image(
            placement.position.x * TILE_WIDTH + TILE_WIDTH / 2,
            placement.position.y * TILE_HEIGHT + TILE_HEIGHT - 1,
            texture,
          ).setOrigin(0.5, 1).setDepth(5),
        );
      }

      this.cellGraphics.clear();
      const occupied = new Set(session.state.placements.map(({ position }) => positionKey(position)));
      const remaining = session.state.definition.openCells
        .filter((position) => !occupied.has(positionKey(position)));
      if (!session.state.submitted) {
        for (const position of remaining) this.drawOpenCell(position);
        const current = session.state.currentOpenCell;
        if (current) this.drawCurrentCell(current);
      }

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

    private drawOpenCell(position: Position): void {
      const x = position.x * TILE_WIDTH;
      const y = position.y * TILE_HEIGHT;
      this.cellGraphics.fillStyle(0xf0d66a, 0.16);
      this.cellGraphics.fillRect(x + 2, y + 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);
      this.cellGraphics.lineStyle(1, 0xf0d66a, 0.9);
      for (let offset = 2; offset < TILE_WIDTH - 2; offset += 6) {
        this.cellGraphics.lineBetween(x + offset, y + 2, x + Math.min(offset + 3, TILE_WIDTH - 2), y + 2);
        this.cellGraphics.lineBetween(x + offset, y + TILE_HEIGHT - 2, x + Math.min(offset + 3, TILE_WIDTH - 2), y + TILE_HEIGHT - 2);
      }
      for (let offset = 2; offset < TILE_HEIGHT - 2; offset += 6) {
        this.cellGraphics.lineBetween(x + 2, y + offset, x + 2, y + Math.min(offset + 3, TILE_HEIGHT - 2));
        this.cellGraphics.lineBetween(x + TILE_WIDTH - 2, y + offset, x + TILE_WIDTH - 2, y + Math.min(offset + 3, TILE_HEIGHT - 2));
      }
    }

    private drawCurrentCell(position: Position): void {
      const x = position.x * TILE_WIDTH;
      const y = position.y * TILE_HEIGHT;
      this.cellGraphics.fillStyle(CURRENT_SHADOW, 1);
      this.cellGraphics.fillRect(x, y, TILE_WIDTH, 2);
      this.cellGraphics.fillRect(x, y + TILE_HEIGHT - 2, TILE_WIDTH, 2);
      this.cellGraphics.fillRect(x, y + 2, 2, TILE_HEIGHT - 4);
      this.cellGraphics.fillRect(x + TILE_WIDTH - 2, y + 2, 2, TILE_HEIGHT - 4);
      this.cellGraphics.fillStyle(CURRENT_HIGHLIGHT, 1);
      this.cellGraphics.fillRect(x, y, TILE_WIDTH - 1, 1);
      this.cellGraphics.fillRect(x, y + 1, 1, TILE_HEIGHT - 3);
      this.cellGraphics.fillRect(x + TILE_WIDTH - 2, y + 1, 1, TILE_HEIGHT - 3);
      this.cellGraphics.fillRect(x, y + TILE_HEIGHT - 2, TILE_WIDTH - 1, 1);
    }
  };
}

export function startDeploymentPhaser(
  session: DeploymentSession,
  parent: string | HTMLElement = "deployment-phaser-root",
): Phaser.Game {
  return new Phaser.Game({
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
    scene: [createDeploymentScene(session)],
  });
}
