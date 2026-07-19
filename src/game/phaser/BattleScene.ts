import * as Phaser from "phaser";
import { ASSETS } from "../content/stage0";
import type { GameController } from "../controller";
import type { BattleUnit } from "../types";

const TILE_WIDTH = 40;
const TILE_HEIGHT = 44;
const BATTLE_SURFACE_RIGHT = 480;
const BATTLE_SURFACE_BOTTOM = 350;
const BATTLE_INPUT_LEFT = 40;
const BATTLE_INPUT_RIGHT = 433;
const BATTLE_INPUT_TOP = 26;
const BATTLE_INPUT_BOTTOM = 326;
const EDGE_PAN_INTERVAL_MS = 110;

const DIGIT_PATTERNS: Record<string, readonly string[]> = {
  "0": ["11111", "10001", "10011", "10101", "11001", "10001", "11111"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["11111", "00001", "00001", "11111", "10000", "10000", "11111"],
  "3": ["11111", "00001", "00001", "01111", "00001", "00001", "11111"],
  "4": ["10001", "10001", "10001", "11111", "00001", "00001", "00001"],
  "5": ["11111", "10000", "10000", "11111", "00001", "00001", "11111"],
  "6": ["11111", "10000", "10000", "11111", "10001", "10001", "11111"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["11111", "10001", "10001", "11111", "10001", "10001", "11111"],
  "9": ["11111", "10001", "10001", "11111", "00001", "00001", "11111"],
};

interface UnitView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  lifeDigits: Phaser.GameObjects.Graphics;
  actedBadge: Phaser.GameObjects.Graphics;
}

export function createBattleScene(controller: GameController): typeof Phaser.Scene {
  return class BattleScene extends Phaser.Scene {
    private rangeGraphics!: Phaser.GameObjects.Graphics;
    private cursorGraphics!: Phaser.GameObjects.Graphics;
    private unitViews = new Map<string, UnitView>();
    private unsubscribe?: () => void;
    private edgePan?: { x: number; y: number };
    private nextEdgePanAt = 0;
    private readonly handleCanvasPointerLeave = () => this.clearEdgePan();

    constructor() {
      super("battle");
    }

    preload(): void {
      this.load.image("stage0-map", ASSETS.map);
      this.load.image("ally-soldier", ASSETS.allySoldier);
      this.load.image("enemy-soldier", ASSETS.enemySoldier);
      this.load.image("enemy-cavalry", ASSETS.enemyCavalry);
    }

    create(): void {
      this.cameras.main.setViewport(40, 23, 400, 308);
      this.cameras.main.setBackgroundColor("#050405");
      this.cameras.main.setBounds(0, 0, 2000, 2200);
      this.add.image(0, 0, "stage0-map").setOrigin(0).setDepth(0);
      this.rangeGraphics = this.add.graphics().setDepth(2);
      this.cursorGraphics = this.add.graphics().setDepth(10);
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (pointer.button === 2) {
          controller.secondaryAction();
          return;
        }
        if (pointer.button !== 0) return;
        if (
          pointer.x < BATTLE_INPUT_LEFT
          || pointer.x >= BATTLE_INPUT_RIGHT
          || pointer.y < BATTLE_INPUT_TOP
          || pointer.y >= BATTLE_INPUT_BOTTOM
        ) return;
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        controller.selectCell({ x: Math.floor(world.x / TILE_WIDTH), y: Math.floor(world.y / TILE_HEIGHT) });
      });
      this.input.on("pointermove", this.handlePointerMove, this);
      this.unsubscribe = controller.onChange(() => this.sync());
      this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.publishMovementFrame, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubscribe?.();
        this.input.off("pointermove", this.handlePointerMove, this);
        this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.publishMovementFrame, this);
        this.game.canvas.removeEventListener("pointerleave", this.handleCanvasPointerLeave);
        this.clearEdgePan();
      });
      this.sync();
      const canvas = this.game.canvas;
      canvas.addEventListener("pointerleave", this.handleCanvasPointerLeave);
      canvas.setAttribute("aria-label", "瓦爾克麗宮戰術地圖，使用滑鼠或方向鍵操作");
      canvas.setAttribute("role", "application");
      canvas.dataset.testid = "battle-canvas";
      canvas.dataset.edgePanDirection = "0,0";
    }

    update(time: number): void {
      if (!this.edgePan || time < this.nextEdgePanAt) return;
      controller.panCamera(this.edgePan);
      this.nextEdgePanAt = time + EDGE_PAN_INTERVAL_MS;
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
      const edgePan = this.edgePanFor(pointer);
      if (edgePan) {
        const changed = !this.edgePan || this.edgePan.x !== edgePan.x || this.edgePan.y !== edgePan.y;
        this.edgePan = edgePan;
        this.game.canvas.style.cursor = this.edgeCursor(edgePan);
        this.game.canvas.dataset.edgePanDirection = `${edgePan.x},${edgePan.y}`;
        if (changed) {
          controller.panCamera(edgePan);
          this.nextEdgePanAt = this.time.now + EDGE_PAN_INTERVAL_MS;
        }
        return;
      }

      this.clearEdgePan();
      if (
        pointer.x < BATTLE_INPUT_LEFT
        || pointer.x >= BATTLE_INPUT_RIGHT
        || pointer.y < BATTLE_INPUT_TOP
        || pointer.y >= BATTLE_INPUT_BOTTOM
      ) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      controller.focusCell({ x: Math.floor(world.x / TILE_WIDTH), y: Math.floor(world.y / TILE_HEIGHT) });
    }

    private edgePanFor(pointer: Phaser.Input.Pointer): { x: number; y: number } | undefined {
      if (
        pointer.x < 0
        || pointer.x >= BATTLE_SURFACE_RIGHT
        || pointer.y < 0
        || pointer.y >= BATTLE_SURFACE_BOTTOM
      ) return undefined;
      const x = pointer.x < BATTLE_INPUT_LEFT ? -1 : pointer.x >= BATTLE_INPUT_RIGHT ? 1 : 0;
      const y = pointer.y < BATTLE_INPUT_TOP ? -1 : pointer.y >= BATTLE_INPUT_BOTTOM ? 1 : 0;
      return x === 0 && y === 0 ? undefined : { x, y };
    }

    private edgeCursor(edgePan: { x: number; y: number }): string {
      if (edgePan.x < 0 && edgePan.y < 0) return "nw-resize";
      if (edgePan.x > 0 && edgePan.y < 0) return "ne-resize";
      if (edgePan.x < 0 && edgePan.y > 0) return "sw-resize";
      if (edgePan.x > 0 && edgePan.y > 0) return "se-resize";
      if (edgePan.x < 0) return "w-resize";
      if (edgePan.x > 0) return "e-resize";
      return edgePan.y < 0 ? "n-resize" : "s-resize";
    }

    private clearEdgePan(): void {
      this.edgePan = undefined;
      this.nextEdgePanAt = 0;
      const canvas = this.game.canvas;
      canvas.style.cursor = "";
      canvas.dataset.edgePanDirection = "0,0";
    }

    private publishMovementFrame(): void {
      if (!controller.isTestMode) return;
      const canvas = this.game.canvas;
      const movingUnitId = controller.movementPresentation?.unitId;
      const view = movingUnitId ? this.unitViews.get(movingUnitId) : undefined;
      if (!view) {
        delete canvas.dataset.movingUnitScreenX;
        delete canvas.dataset.movingUnitScreenY;
        return;
      }
      canvas.dataset.movingUnitScreenX = (view.container.x - this.cameras.main.scrollX).toFixed(3);
      canvas.dataset.movingUnitScreenY = (view.container.y - this.cameras.main.scrollY).toFixed(3);
    }

    private sync(): void {
      this.syncCamera();
      this.drawRanges();
      this.drawUnits();
      this.drawCursor();
    }

    private movementTweenDuration(): number {
      return Math.max(8, Math.floor(controller.movementStepDuration * .8));
    }

    private syncCamera(): void {
      const camera = this.cameras.main;
      const targetScrollX = controller.cameraOrigin.x * TILE_WIDTH;
      const targetScrollY = controller.cameraOrigin.y * TILE_HEIGHT;

      if (!controller.movementPresentation) {
        this.tweens.killTweensOf(camera);
        camera.setScroll(targetScrollX, targetScrollY);
        return;
      }

      if (Math.abs(camera.scrollX - targetScrollX) < .5 && Math.abs(camera.scrollY - targetScrollY) < .5) return;

      this.tweens.killTweensOf(camera);
      this.tweens.add({
        targets: camera,
        scrollX: targetScrollX,
        scrollY: targetScrollY,
        duration: this.movementTweenDuration(),
        ease: "Linear",
      });
    }

    private drawRanges(): void {
      this.rangeGraphics.clear();
      if (controller.actionMode === "move") {
        this.rangeGraphics.fillStyle(0x2d72ff, 0.38);
        this.rangeGraphics.lineStyle(2, 0xc8e8ff, 0.85);
        for (const cell of controller.reachable) {
          this.rangeGraphics.fillRect(cell.x * TILE_WIDTH + 2, cell.y * TILE_HEIGHT + 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);
          this.rangeGraphics.strokeRect(cell.x * TILE_WIDTH + 2, cell.y * TILE_HEIGHT + 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);
        }
      }
      if (controller.actionMode === "enemyPreview") {
        this.rangeGraphics.fillStyle(0xc92332, 0.34);
        this.rangeGraphics.lineStyle(2, 0xffa08f, 0.9);
        for (const cell of controller.reachable) {
          this.rangeGraphics.fillRect(cell.x * TILE_WIDTH + 2, cell.y * TILE_HEIGHT + 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);
          this.rangeGraphics.strokeRect(cell.x * TILE_WIDTH + 2, cell.y * TILE_HEIGHT + 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);
        }
      }
      if (controller.actionMode === "target") {
        this.rangeGraphics.fillStyle(0xe3212d, 0.46);
        this.rangeGraphics.lineStyle(3, 0xffef8a, 1);
        for (const cell of controller.targets) {
          this.rangeGraphics.fillRect(cell.x * TILE_WIDTH + 2, cell.y * TILE_HEIGHT + 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);
          this.rangeGraphics.strokeRect(cell.x * TILE_WIDTH + 3, cell.y * TILE_HEIGHT + 3, TILE_WIDTH - 6, TILE_HEIGHT - 6);
        }
      }
    }

    private textureFor(unit: BattleUnit): string {
      if (unit.side === 1) return "ally-soldier";
      return unit.classId === 22 ? "enemy-cavalry" : "enemy-soldier";
    }

    private unitVisualOffset(unit: BattleUnit): number {
      // The stored frames are rectangular, but their opaque visual mass is not:
      // the 32px soldier frames lean 2px right and the 40px cavalry frame 2px
      // left. This offset belongs only to the character image; numeric HUD
      // elements remain centered on the logical 40px cell.
      return unit.classId === 22 ? 2 : -2;
    }

    private unitWorldX(unit: BattleUnit): number {
      return unit.x * TILE_WIDTH + TILE_WIDTH / 2;
    }

    private createUnitView(unit: BattleUnit): UnitView {
      const container = this.add.container(this.unitWorldX(unit), unit.y * TILE_HEIGHT + 43).setDepth(5);
      const sprite = this.add.image(this.unitVisualOffset(unit), 0, this.textureFor(unit)).setOrigin(0.5, 1);
      // Native map labels occupy the unit frame's bottom rows instead of
      // extending into the next 44px cell. The original 16×14 acted marker
      // has a fixed offset from the logical unit center, so three-digit life
      // labels naturally overlap its right edge slightly.
      const lifeDigits = this.add.graphics().setPosition(0, -9);
      const actedBadge = this.add.graphics().setPosition(-22, -15);
      const actedBadgePattern = [
        "WWWWWWWWWWWWWWWK",
        "WGGGGGGGGGGGGGGK",
        "WGGRRRRRRRRRKGGK",
        "WGGKRRKKKKKRKGGK",
        "WGGGRRKGGGGKKGGK",
        "WGGGRRKGGRKGGGGK",
        "WGGGRRRRRRKGGGGK",
        "WGGGRRKKKRKGGGGK",
        "WGGGRRKGGKKGGGGK",
        "WGGGRRKGGGGRKGGK",
        "WGGRRRRRRRRRKGGK",
        "WGGKKKKKKKKKKGGK",
        "WGGGGGGGGGGGGGGK",
        "KKKKKKKKKKKKKKKK",
      ] as const;
      const actedBadgeColors = {
        W: 0xffffff,
        G: 0xb1a08f,
        R: 0xec1d21,
        K: 0x000000,
      } as const;
      for (let row = 0; row < actedBadgePattern.length; row += 1) {
        for (let column = 0; column < actedBadgePattern[row].length; column += 1) {
          const pixel = actedBadgePattern[row][column] as keyof typeof actedBadgeColors;
          actedBadge.fillStyle(actedBadgeColors[pixel], 1);
          actedBadge.fillRect(column, row, 1, 1);
        }
      }

      container.add([sprite, lifeDigits, actedBadge]);
      return { container, sprite, lifeDigits, actedBadge };
    }

    private drawLifeDigits(view: UnitView, unit: BattleUnit): void {
      const graphics = view.lifeDigits;
      const digits = String(Math.max(0, unit.life));
      const digitWidth = 7;
      const startX = -Math.floor(digits.length * digitWidth / 2);
      const sideColor = unit.side === 1 ? 0x236be8 : 0xe52d30;
      graphics.clear();

      for (let digitIndex = 0; digitIndex < digits.length; digitIndex += 1) {
        const x = startX + digitIndex * digitWidth;
        graphics.fillStyle(0x12090a, 1);
        graphics.fillRect(x + 1, 1, digitWidth, 9);
        graphics.fillStyle(sideColor, 1);
        graphics.fillRect(x, 0, digitWidth, 9);
        graphics.fillStyle(0xffffff, 1);
        const pattern = DIGIT_PATTERNS[digits[digitIndex]];
        for (let row = 0; row < pattern.length; row += 1) {
          for (let column = 0; column < pattern[row].length; column += 1) {
            if (pattern[row][column] === "1") graphics.fillRect(x + column + 1, row + 1, 1, 1);
          }
        }
      }
    }

    private drawUnits(): void {
      const active = new Set<string>();
      for (const unit of controller.battle.units) {
        active.add(unit.id);
        let view = this.unitViews.get(unit.id);
        if (!view) {
          view = this.createUnitView(unit);
          this.unitViews.set(unit.id, view);
        }
        const targetX = this.unitWorldX(unit);
        const targetY = unit.y * TILE_HEIGHT + 43;
        const followsMovementPath = controller.movementPresentation?.unitId === unit.id;
        if (Math.abs(view.container.x - targetX) + Math.abs(view.container.y - targetY) > 1 && followsMovementPath) {
          this.tweens.killTweensOf(view.container);
          this.tweens.add({
            targets: view.container,
            x: targetX,
            y: targetY,
            duration: this.movementTweenDuration(),
            ease: "Linear",
          });
        } else {
          view.container.setPosition(targetX, targetY);
        }
        view.sprite.setTexture(this.textureFor(unit));
        view.sprite.setX(this.unitVisualOffset(unit));
        view.sprite.setAlpha(1);
        view.sprite.clearTint();
        this.drawLifeDigits(view, unit);
        view.actedBadge.setVisible(unit.acted);
      }
      for (const [id, view] of this.unitViews) {
        if (active.has(id)) continue;
        view.container.destroy(true);
        this.unitViews.delete(id);
      }
      if (controller.isTestMode) {
        this.game.canvas.dataset.unitLifeLabelCount = String(active.size);
        this.game.canvas.dataset.actedBadgeCount = String(controller.battle.units.filter((unit) => unit.acted).length);
        this.game.canvas.dataset.actedBadgeGeometry = "-22,-15,16,14";
        this.game.canvas.dataset.rangeMode = controller.actionMode;
        this.game.canvas.dataset.rangeCellCount = String(controller.reachable.length);
      }
    }

    private drawCursor(): void {
      this.cursorGraphics.clear();
      const focus = controller.cursor;
      this.cursorGraphics.lineStyle(3, 0xffea42, 1);
      this.cursorGraphics.strokeRect(focus.x * TILE_WIDTH + 2, focus.y * TILE_HEIGHT + 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);
      const unit = controller.focusedUnit;
      if (unit) {
        const marker = controller.movementPresentation ? focus : unit;
        this.cursorGraphics.lineStyle(2, unit.side === 1 ? 0x59b9ff : 0xff5252, 1);
        this.cursorGraphics.strokeCircle(marker.x * TILE_WIDTH + 20, marker.y * TILE_HEIGHT + 23, 17);
      }
    }
  };
}

export function startPhaser(controller: GameController): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    width: 640,
    height: 350,
    parent: "phaser-root",
    transparent: true,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    render: { pixelArt: true, antialias: false, roundPixels: true },
    input: { gamepad: true },
    scene: [createBattleScene(controller)],
  });
}
