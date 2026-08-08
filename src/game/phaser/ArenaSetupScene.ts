import * as Phaser from "phaser";
import {
  ARENA_CLASS_IDS,
  ARENA_MAP,
  arenaAllyMapAsset,
  arenaClassCanStandAt,
  arenaEnemyMapAsset,
  type ArenaSession,
  type ArenaState,
} from "../arena-session";

const TILE_WIDTH = 40;
const TILE_HEIGHT = 44;
const WIDTH = (ARENA_MAP.bounds.max.x - ARENA_MAP.bounds.min.x + 1) * TILE_WIDTH;
const HEIGHT = (ARENA_MAP.bounds.max.y - ARENA_MAP.bounds.min.y + 1) * TILE_HEIGHT;

export interface ArenaSetupSceneHandle {
  readonly game: Phaser.Game;
}

export function startArenaSetupPhaser(
  session: ArenaSession,
  parent: HTMLElement,
): ArenaSetupSceneHandle {
  class ArenaSetupScene extends Phaser.Scene {
    private state!: ArenaState;
    private unsubscribe?: () => void;
    private unitObjects: Phaser.GameObjects.GameObject[] = [];
    private overlay!: Phaser.GameObjects.Graphics;
    private hover?: { x: number; y: number };

    constructor() {
      super("arena-setup");
    }

    preload(): void {
      this.load.image("arena-map", ARENA_MAP.source);
      for (const classId of ARENA_CLASS_IDS) {
        this.load.image(`arena-ally-${classId}`, arenaAllyMapAsset(classId));
        this.load.image(`arena-enemy-${classId}`, arenaEnemyMapAsset(classId));
      }
    }

    create(): void {
      this.cameras.main.setScroll(
        ARENA_MAP.bounds.min.x * TILE_WIDTH,
        ARENA_MAP.bounds.min.y * TILE_HEIGHT,
      );
      this.cameras.main.setBackgroundColor("#050405");
      this.add.image(0, 0, "arena-map").setOrigin(0).setDepth(0);
      this.overlay = this.add.graphics().setDepth(3);
      this.unsubscribe = session.subscribe((state) => {
        this.state = state;
        this.drawState();
      });
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        const position = this.pointerPosition(pointer);
        if (this.hover?.x === position.x && this.hover.y === position.y) return;
        this.hover = position;
        this.drawOverlay();
      });
      this.input.on("pointerout", () => {
        this.hover = undefined;
        this.drawOverlay();
      });
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        const { x, y } = this.pointerPosition(pointer);
        if (pointer.button === 2) session.erase(x, y);
        else if (pointer.button === 0) session.interact(x, y);
      });
      this.game.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
      this.game.canvas.dataset.testid = "arena-setup-canvas";
      this.game.canvas.setAttribute("role", "application");
      this.game.canvas.setAttribute(
        "aria-label",
        "全地形競技場編成地圖；左鍵配置或替換，右鍵移除",
      );
    }

    private pointerPosition(pointer: Phaser.Input.Pointer): { x: number; y: number } {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      return {
        x: Math.floor(world.x / TILE_WIDTH),
        y: Math.floor(world.y / TILE_HEIGHT),
      };
    }

    private drawState(): void {
      for (const object of this.unitObjects) object.destroy();
      this.unitObjects = [];
      for (const unit of this.state.units) {
        const sprite = this.add.image(
          unit.x * TILE_WIDTH + TILE_WIDTH / 2,
          unit.y * TILE_HEIGHT + TILE_HEIGHT,
          `arena-${unit.side === 1 ? "ally" : "enemy"}-${unit.classId}`,
        ).setOrigin(0.5, 1).setDepth(6);
        const badge = this.add.circle(
          unit.x * TILE_WIDTH + 7,
          unit.y * TILE_HEIGHT + 8,
          6,
          unit.side === 1 ? 0x46c8f1 : 0xe85962,
          0.96,
        ).setStrokeStyle(2, 0x10080b, 1).setDepth(7);
        const level = this.add.text(
          unit.x * TILE_WIDTH + 7,
          unit.y * TILE_HEIGHT + 8,
          String(unit.level),
          {
            color: "#fff7df",
            fontFamily: "monospace",
            fontSize: "9px",
            fontStyle: "bold",
          },
        ).setOrigin(0.5).setDepth(8);
        this.unitObjects.push(sprite, badge, level);
      }
      this.drawOverlay();
      this.game.canvas.dataset.unitCount = String(this.state.units.length);
      this.game.canvas.dataset.allyCount = String(
        this.state.units.filter(({ side }) => side === 1).length,
      );
      this.game.canvas.dataset.enemyCount = String(
        this.state.units.filter(({ side }) => side === 2).length,
      );
    }

    private drawOverlay(): void {
      if (!this.overlay || !this.state) return;
      this.overlay.clear();
      if (this.state.tool === "place") {
        this.overlay.fillStyle(0x210a10, 0.24);
        for (let y = ARENA_MAP.bounds.min.y; y <= ARENA_MAP.bounds.max.y; y += 1) {
          for (let x = ARENA_MAP.bounds.min.x; x <= ARENA_MAP.bounds.max.x; x += 1) {
            if (arenaClassCanStandAt(this.state.placementClass, x, y)) continue;
            this.overlay.fillRect(x * TILE_WIDTH, y * TILE_HEIGHT, TILE_WIDTH, TILE_HEIGHT);
          }
        }
      }
      this.overlay.lineStyle(1.5, 0xf4cf6b, 0.3);
      for (let x = ARENA_MAP.bounds.min.x; x <= ARENA_MAP.bounds.max.x + 1; x += 1) {
        this.overlay.lineBetween(
          x * TILE_WIDTH,
          ARENA_MAP.bounds.min.y * TILE_HEIGHT,
          x * TILE_WIDTH,
          (ARENA_MAP.bounds.max.y + 1) * TILE_HEIGHT,
        );
      }
      for (let y = ARENA_MAP.bounds.min.y; y <= ARENA_MAP.bounds.max.y + 1; y += 1) {
        this.overlay.lineBetween(
          ARENA_MAP.bounds.min.x * TILE_WIDTH,
          y * TILE_HEIGHT,
          (ARENA_MAP.bounds.max.x + 1) * TILE_WIDTH,
          y * TILE_HEIGHT,
        );
      }
      if (this.hover) {
        const valid = this.state.tool === "erase"
          || arenaClassCanStandAt(this.state.placementClass, this.hover.x, this.hover.y);
        this.overlay.lineStyle(4, valid ? 0xffe879 : 0xff5464, 1);
        this.overlay.strokeRect(
          this.hover.x * TILE_WIDTH + 2,
          this.hover.y * TILE_HEIGHT + 2,
          TILE_WIDTH - 4,
          TILE_HEIGHT - 4,
        );
        this.game.canvas.dataset.hoverCell = `${this.hover.x},${this.hover.y}`;
      } else {
        delete this.game.canvas.dataset.hoverCell;
      }
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
    scene: ArenaSetupScene,
    scale: { mode: Phaser.Scale.NONE },
  });
  return { game };
}
