import * as Phaser from "phaser";
import { STAGE0_ACTION_PRESENTATION_ASSETS } from "../content/stage0-actions.generated";
import { STAGE1_ACTION_PRESENTATION_ASSETS } from "../content/stage1-actions.generated";
import {
  TECHNIQUE_LAB_GRAPHIC_ASSETS,
  TECHNIQUE_LAB_LIGHTNING,
  TECHNIQUE_LAB_UNIT_ASSETS,
} from "../content/technique-lab.generated";
import type { LightningPresentationFrame } from "../map-technique-presentation";
import {
  TECHNIQUE_LAB_MAP,
  type TechniqueLabSession,
  type TechniqueLabState,
} from "../technique-lab-session";
import {
  preloadMapTechniqueAssets,
  renderLightningFrame,
} from "./MapTechniqueRenderer";

const TILE_WIDTH = 40;
const TILE_HEIGHT = 44;
const WIDTH = TECHNIQUE_LAB_MAP.width * TILE_WIDTH;
const HEIGHT = TECHNIQUE_LAB_MAP.height * TILE_HEIGHT;

export type TechniqueLabVisualFrame =
  | { readonly kind: "none" }
  | {
    readonly kind: "lightning";
    readonly frame: LightningPresentationFrame;
    readonly cleanupScope: "affected" | "original-all-enemies";
  }
  | { readonly kind: "fire"; readonly frame: number }
  | { readonly kind: "heal-primary"; readonly frame: number }
  | { readonly kind: "heal-tail"; readonly frame: number }
  | { readonly kind: "ice"; readonly frame: number };

export interface TechniqueLabSceneHandle {
  readonly game: Phaser.Game;
  setVisualFrame(frame: TechniqueLabVisualFrame): void;
}

export function startTechniqueLabPhaser(
  session: TechniqueLabSession,
  parent: HTMLElement,
): TechniqueLabSceneHandle {
  let sceneInstance: TechniqueLabScene | undefined;
  let pendingFrame: TechniqueLabVisualFrame = { kind: "none" };

  class TechniqueLabScene extends Phaser.Scene {
    private state!: TechniqueLabState;
    private unsubscribe?: () => void;
    private unitObjects: Phaser.GameObjects.GameObject[] = [];
    private effectObjects: Phaser.GameObjects.Image[] = [];
    private overlay!: Phaser.GameObjects.Graphics;

    constructor() {
      super("technique-lab");
    }

    preload(): void {
      this.load.image("technique-lab-map", "/assets/original/stage1-map.png");
      for (const [classId, assets] of Object.entries(TECHNIQUE_LAB_UNIT_ASSETS)) {
        if (assets.ally) this.load.image(`technique-lab-ally-${classId}`, assets.ally);
        this.load.image(`technique-lab-enemy-${classId}`, assets.enemy);
      }
      preloadMapTechniqueAssets(this, TECHNIQUE_LAB_GRAPHIC_ASSETS);
      STAGE0_ACTION_PRESENTATION_ASSETS.fire1.effect.forEach((source, frame) =>
        this.load.image(`technique-lab-fire-${frame}`, source));
      STAGE0_ACTION_PRESENTATION_ASSETS.heal1.primary.forEach((source, frame) =>
        this.load.image(`technique-lab-heal-primary-${frame}`, source));
      STAGE0_ACTION_PRESENTATION_ASSETS.heal1.tail.forEach((source, frame) =>
        this.load.image(`technique-lab-heal-tail-${frame}`, source));
      STAGE1_ACTION_PRESENTATION_ASSETS.ice1.expansion.forEach((source, frame) =>
        this.load.image(`technique-lab-ice-${frame}`, source));
    }

    create(): void {
      sceneInstance = this;
      this.cameras.main.setBounds(0, 0, 2000, 2200);
      this.cameras.main.setScroll(
        TECHNIQUE_LAB_MAP.origin.x * TILE_WIDTH,
        TECHNIQUE_LAB_MAP.origin.y * TILE_HEIGHT,
      );
      this.add.image(0, 0, "technique-lab-map").setOrigin(0).setDepth(0);
      this.overlay = this.add.graphics().setDepth(3);
      this.unsubscribe = session.subscribe((state) => {
        this.state = state;
        this.drawState();
      });
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        const x = Math.floor(pointer.worldX / TILE_WIDTH);
        const y = Math.floor(pointer.worldY / TILE_HEIGHT);
        if (pointer.button === 2) session.erase(x, y);
        else if (pointer.button === 0) session.interact(x, y);
      });
      this.game.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
      this.drawVisualFrame(pendingFrame);
    }

    drawVisualFrame(frame: TechniqueLabVisualFrame): void {
      pendingFrame = frame;
      for (const object of this.effectObjects) object.destroy();
      this.effectObjects = [];
      if (!this.state || frame.kind === "none") {
        this.updateCanvasDataset(frame, 0);
        return;
      }
      const center = this.state.target;
      if (frame.kind === "lightning") {
        const actionCode = this.state.actionCode as keyof typeof TECHNIQUE_LAB_LIGHTNING;
        const definition = TECHNIQUE_LAB_LIGHTNING[actionCode];
        if (definition) {
          const actorSide = session.actor()?.side ?? 1;
          const rendered = renderLightningFrame(this, definition, frame.frame, {
            center,
            effectCells: session.effectCells(),
            wavePositions: session.affectedUnits().map(({ x, y }) => ({ x, y })),
            cleanupPositions: frame.cleanupScope === "original-all-enemies"
              ? this.state.units
                .filter(({ side }) => side !== actorSide)
                .map(({ x, y }) => ({ x, y }))
              : session.affectedUnits().map(({ x, y }) => ({ x, y })),
          });
          this.effectObjects.push(...rendered.images);
        }
      } else if (frame.kind === "fire") {
        this.effectObjects.push(this.add.image(
          center.x * TILE_WIDTH + TILE_WIDTH / 2,
          center.y * TILE_HEIGHT + TILE_HEIGHT,
          `technique-lab-fire-${frame.frame}`,
        ).setOrigin(.5, 1).setDepth(8));
      } else if (frame.kind === "heal-primary" || frame.kind === "heal-tail") {
        this.effectObjects.push(this.add.image(
          center.x * TILE_WIDTH + TILE_WIDTH / 2,
          center.y * TILE_HEIGHT + TILE_HEIGHT,
          frame.kind === "heal-primary"
            ? `technique-lab-heal-primary-${frame.frame}`
            : `technique-lab-heal-tail-${frame.frame}`,
        ).setOrigin(.5, 1).setDepth(8));
      } else {
        const sourceFrame = frame.frame % STAGE1_ACTION_PRESENTATION_ASSETS.ice1.expansion.length;
        for (const { position } of session.effectCells()) {
          this.effectObjects.push(this.add.image(
            position.x * TILE_WIDTH + TILE_WIDTH / 2,
            position.y * TILE_HEIGHT + TILE_HEIGHT / 2,
            `technique-lab-ice-${sourceFrame}`,
          ).setOrigin(.5).setDepth(8));
        }
      }
      this.updateCanvasDataset(frame, this.effectObjects.length);
    }

    private drawState(): void {
      for (const object of this.unitObjects) object.destroy();
      this.unitObjects = [];
      this.overlay.clear();
      this.overlay.lineStyle(1, 0x72582a, .28);
      for (let x = TECHNIQUE_LAB_MAP.origin.x; x <= TECHNIQUE_LAB_MAP.origin.x + TECHNIQUE_LAB_MAP.width; x += 1) {
        this.overlay.lineBetween(
          x * TILE_WIDTH,
          TECHNIQUE_LAB_MAP.origin.y * TILE_HEIGHT,
          x * TILE_WIDTH,
          (TECHNIQUE_LAB_MAP.origin.y + TECHNIQUE_LAB_MAP.height) * TILE_HEIGHT,
        );
      }
      for (let y = TECHNIQUE_LAB_MAP.origin.y; y <= TECHNIQUE_LAB_MAP.origin.y + TECHNIQUE_LAB_MAP.height; y += 1) {
        this.overlay.lineBetween(
          TECHNIQUE_LAB_MAP.origin.x * TILE_WIDTH,
          y * TILE_HEIGHT,
          (TECHNIQUE_LAB_MAP.origin.x + TECHNIQUE_LAB_MAP.width) * TILE_WIDTH,
          y * TILE_HEIGHT,
        );
      }
      this.overlay.fillStyle(0x4a1d74, .2);
      for (const { position } of session.effectCells()) {
        this.overlay.fillRect(position.x * TILE_WIDTH, position.y * TILE_HEIGHT, TILE_WIDTH, TILE_HEIGHT);
      }
      this.overlay.lineStyle(2, 0xffe36b, .95);
      this.overlay.strokeRect(
        this.state.target.x * TILE_WIDTH + 2,
        this.state.target.y * TILE_HEIGHT + 2,
        TILE_WIDTH - 4,
        TILE_HEIGHT - 4,
      );
      const actor = session.actor();
      if (actor) {
        this.overlay.lineStyle(2, 0x7de4ff, 1);
        this.overlay.strokeCircle(
          actor.x * TILE_WIDTH + TILE_WIDTH / 2,
          actor.y * TILE_HEIGHT + TILE_HEIGHT / 2,
          17,
        );
      }
      for (const unit of this.state.units) {
        const sprite = this.add.image(
          unit.x * TILE_WIDTH + TILE_WIDTH / 2,
          unit.y * TILE_HEIGHT + TILE_HEIGHT,
          `technique-lab-${unit.side === 1 ? "ally" : "enemy"}-${unit.classId}`,
        ).setOrigin(.5, 1).setDepth(6);
        const badge = this.add.circle(
          unit.x * TILE_WIDTH + 6,
          unit.y * TILE_HEIGHT + 7,
          4,
          unit.side === 1 ? 0x56c7ee : 0xe76b70,
          .95,
        ).setStrokeStyle(1, 0x12090c, 1).setDepth(7);
        this.unitObjects.push(sprite, badge);
      }
      this.drawVisualFrame(pendingFrame);
      this.game.canvas.dataset.unitCount = String(this.state.units.length);
      this.game.canvas.dataset.actorId = this.state.actorId ?? "";
      this.game.canvas.dataset.target = `${this.state.target.x},${this.state.target.y}`;
    }

    private updateCanvasDataset(frame: TechniqueLabVisualFrame, count: number): void {
      const canvas = this.game.canvas;
      canvas.dataset.techniquePhase = frame.kind === "lightning" ? frame.frame.kind : frame.kind;
      canvas.dataset.techniqueFrame = frame.kind === "lightning"
        ? frame.frame.kind === "main" ? String(frame.frame.globalDrawIndex) : String(frame.frame.frame)
        : "frame" in frame ? String(frame.frame) : "-1";
      canvas.dataset.effectTileCount = String(count);
      canvas.dataset.lightningCleanupScope = frame.kind === "lightning"
        ? frame.cleanupScope
        : "";
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: WIDTH,
    height: HEIGHT,
    parent,
    backgroundColor: "#050405",
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scene: TechniqueLabScene,
    scale: { mode: Phaser.Scale.NONE },
  });

  return {
    game,
    setVisualFrame(frame): void {
      pendingFrame = frame;
      sceneInstance?.drawVisualFrame(frame);
    },
  };
}
