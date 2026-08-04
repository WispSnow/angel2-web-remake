import * as Phaser from "phaser";
import { ASSETS } from "../content/stage0";
import {
  STAGE0_ACTION_PRESENTATION_ASSETS,
  actionPresentationAssetCatalog,
  actionPresentationCatalog,
} from "../content/actions";
import type { GameController } from "../controller";
import type { BattleUnit } from "../types";
import { iceFrameAtGlobalIndex, lightningFrameAtMainIndex } from "../map-technique-presentation";
import { TURN_TRANSITION_DUST } from "../turn-transition-presentation";
import {
  preloadMapTechniqueAssets,
  renderLightningFrame,
  type MapTechniqueGraphicAssets,
} from "./MapTechniqueRenderer";

const TILE_WIDTH = 40;
const TILE_HEIGHT = 44;
const BATTLE_SURFACE_RIGHT = 480;
const BATTLE_SURFACE_BOTTOM = 350;
const BATTLE_INPUT_LEFT = 40;
const BATTLE_INPUT_RIGHT = 433;
const BATTLE_INPUT_TOP = 26;
const BATTLE_INPUT_BOTTOM = 326;
const TURN_TRANSITION_BUFFER_SOURCE_Y = 200;
const TURN_TRANSITION_SCREEN_Y = 155;
const TURN_TRANSITION_BUFFER_HEIGHT = 132;
const EDGE_PAN_INTERVAL_MS = 110;
const MAP_HIT_FRAME_TIMELINE = [0, 1, 2, 3, 4, 5, 6, 7, 0] as const;
const NATIVE_CURSOR_SHADOW = 0x000000;
const NATIVE_CURSOR_HIGHLIGHT = 0xffffff;

type NativePointerCursor = "hand" | "up" | "down" | "left" | "right";

const NATIVE_POINTER_FRAME: Readonly<Record<NativePointerCursor, number>> = {
  hand: 0,
  up: 1,
  down: 2,
  left: 3,
  right: 4,
};

interface DeathDescriptor {
  xOffset: number;
  yOffset: number;
  width: number;
  frames: readonly (number | null)[];
}

const MAP_DEATH_DESCRIPTORS: readonly DeathDescriptor[] = [
  { xOffset: 0, yOffset: 0, width: 1, frames: [0] },
  { xOffset: 0, yOffset: 0, width: 1, frames: [1] },
  { xOffset: -1, yOffset: -1, width: 3, frames: [2, 3, 4, 5, 6, 7] },
  { xOffset: -1, yOffset: -1, width: 3, frames: [8, 9, 10, 11, 12, 13] },
  { xOffset: -1, yOffset: -1, width: 3, frames: [14, 15, 16, 17, 18, 19] },
  { xOffset: -1, yOffset: -1, width: 3, frames: [20, 21, 22, 23, 24, 25] },
  { xOffset: 0, yOffset: 0, width: 1, frames: [26] },
  { xOffset: 0, yOffset: -1, width: 1, frames: [27, 28] },
  { xOffset: 0, yOffset: -3, width: 1, frames: [29, 30, 31, 32] },
  { xOffset: 0, yOffset: -5, width: 1, frames: [33, 33, 33, 33, 33, 34] },
  { xOffset: 0, yOffset: -7, width: 1, frames: [35, 35, 35, 35, 35, 35, 35, 36] },
  { xOffset: 0, yOffset: -7, width: 1, frames: [37, 37, 37, 37, 37, 37, 37, null] },
  { xOffset: 0, yOffset: -7, width: 1, frames: [37, 37, 37, 37, 37, null, null, null] },
  { xOffset: 0, yOffset: -7, width: 1, frames: [37, 37, 37, null, null, null, null, null] },
  { xOffset: 0, yOffset: -7, width: 1, frames: [null, null, null, null, null, null, null, null] },
];

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
  iceDisabledOverlay?: Phaser.GameObjects.Image;
  lifeDigits: Phaser.GameObjects.Graphics;
  actedBadge: Phaser.GameObjects.Graphics;
}

export function createBattleScene(controller: GameController): typeof Phaser.Scene {
  const presentationActionIds = new Set(controller.currentMapPresentationActionIds);
  const hasExtendedActions = (["lightning-1", "ice-1", "recovery-1", "dispel"] as const)
    .some((actionId) => presentationActionIds.has(actionId));
  const stageAssets = controller.currentStageAssets;
  const mapTextureKey = `${controller.battle.stage.id}-map`;
  const presentationCatalog = hasExtendedActions ? actionPresentationCatalog() : undefined;
  const presentationAssets = hasExtendedActions ? actionPresentationAssetCatalog() : undefined;
  const lightningAssets: MapTechniqueGraphicAssets | undefined = presentationAssets
    && presentationActionIds.has("lightning-1")
    ? {
      "MAGIC/8": presentationAssets.lightning1.main,
      "MAGIC/31": presentationAssets.lightning1.hit,
      "MAGIC/6": presentationAssets.lightning1.cleanup,
    }
    : undefined;
  return class BattleScene extends Phaser.Scene {
    private gridGraphics!: Phaser.GameObjects.Graphics;
    private rangeGraphics!: Phaser.GameObjects.Graphics;
    private cursorGraphics!: Phaser.GameObjects.Graphics;
    private rangeMaskTiles: Phaser.GameObjects.TileSprite[] = [];
    private combatEffects: Phaser.GameObjects.Image[] = [];
    private turnTransitionEffects: Phaser.GameObjects.Image[] = [];
    private turnTransitionMask?: Phaser.Display.Masks.GeometryMask;
    private turnTransitionMaskShape?: Phaser.GameObjects.Graphics;
    private unitViews = new Map<string, UnitView>();
    private unsubscribe?: () => void;
    private edgePan?: { x: number; y: number };
    private nextEdgePanAt = 0;
    private primaryPointerHeld = false;
    private readonly handleCanvasPointerLeave = () => {
      this.clearEdgePan();
      this.setNativePointerCursor("hand");
    };
    private readonly handlePointerRelease = (pointer: Phaser.Input.Pointer) => {
      if (pointer.primaryDown) return;
      this.setPrimaryPointerHeld(false);
      if (!controller.edgeScrollEnabled) this.clearEdgePan();
    };

    constructor() {
      super("battle");
    }

    preload(): void {
      this.load.image(
        mapTextureKey,
        stageAssets?.map ?? ASSETS.map,
      );
      this.load.image("ally-soldier", ASSETS.allySoldier);
      Object.entries(ASSETS.allyPromotionTargets).forEach(([classId, source]) =>
        this.load.image(`ally-${classId}`, source));
      this.load.image("enemy-soldier", ASSETS.enemySoldier);
      this.load.image("enemy-cavalry", ASSETS.enemyCavalry);
      Object.entries(stageAssets?.unitSprites ?? {}).forEach(([key, source]) =>
        this.load.image(key, source));
      ASSETS.mapCombat.hit.forEach((source, frame) => this.load.image(`map-hit-${frame}`, source));
      ASSETS.mapCombat.death.forEach((source, frame) => this.load.image(`map-death-${frame}`, source));
      this.load.image("turn-transition-player", ASSETS.turnTransition.player);
      this.load.image("turn-transition-enemy", ASSETS.turnTransition.enemy);
      this.load.image("turn-transition-shadow", ASSETS.turnTransition.shadow);
      ASSETS.turnTransition.dust.forEach((source, frame) =>
        this.load.image(`turn-transition-dust-${frame}`, source));
      STAGE0_ACTION_PRESENTATION_ASSETS.shoot.hit.forEach((source, frame) =>
        this.load.image(`map-shoot-${frame}`, source));
      STAGE0_ACTION_PRESENTATION_ASSETS.fire1.effect.forEach((source, frame) =>
        this.load.image(`map-fire-1-${frame}`, source));
      STAGE0_ACTION_PRESENTATION_ASSETS.heal1.primary.forEach((source, frame) =>
        this.load.image(`map-heal-1-primary-${frame}`, source));
      STAGE0_ACTION_PRESENTATION_ASSETS.heal1.tail.forEach((source, frame) =>
        this.load.image(`map-heal-1-tail-${frame}`, source));
      if (presentationAssets) {
        if (lightningAssets) preloadMapTechniqueAssets(this, lightningAssets);
        if (presentationActionIds.has("ice-1")) presentationAssets.ice1.expansion.forEach((source, frame) =>
          this.load.image(`map-ice-1-expansion-${frame}`, source));
        if (presentationActionIds.has("recovery-1")) presentationAssets.recovery1.effect.forEach((source, frame) =>
          this.load.image(`map-recovery-1-${frame}`, source));
        if (presentationActionIds.has("dispel")) presentationAssets.dispel.effect.forEach((source, frame) =>
          this.load.image(`map-dispel-${frame}`, source));
      }
    }

    create(): void {
      this.cameras.main.setViewport(40, 23, 400, 308);
      this.cameras.main.setBackgroundColor("#050405");
      const { originBounds, width, height } = controller.battle.stage.viewport;
      this.cameras.main.setBounds(
        originBounds.min.x * TILE_WIDTH,
        originBounds.min.y * TILE_HEIGHT,
        (originBounds.max.x - originBounds.min.x + width) * TILE_WIDTH,
        (originBounds.max.y - originBounds.min.y + height) * TILE_HEIGHT,
      );
      this.add.image(
        0,
        0,
        mapTextureKey,
      ).setOrigin(0).setDepth(0);
      this.gridGraphics = this.add.graphics().setDepth(1);
      this.rangeGraphics = this.add.graphics().setDepth(2);
      this.cursorGraphics = this.add.graphics().setDepth(10);
      if (!this.textures.exists("native-range-dither")) {
        const texture = this.textures.createCanvas("native-range-dither", 8, 2);
        const context = texture?.getContext();
        if (texture && context) {
          context.clearRect(0, 0, 8, 2);
          context.fillStyle = "#000";
          for (let row = 0; row < 2; row += 1) {
            const retained = row === 0 ? new Set([3, 7]) : new Set([1, 5]);
            for (let column = 0; column < 8; column += 1) {
              if (!retained.has(column)) context.fillRect(column, row, 1, 1);
            }
          }
          texture.refresh();
        }
      }
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (pointer.button === 2) {
          void controller.rightClickAction();
          return;
        }
        if (pointer.button !== 0) return;
        this.setPrimaryPointerHeld(true);
        const edgeDirection = this.edgeDirectionFor(pointer);
        if (edgeDirection) {
          this.setNativePointerCursor(this.nativeCursorFor(edgeDirection));
          this.startEdgePan(edgeDirection);
          return;
        }
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
      this.input.on("pointerup", this.handlePointerRelease, this);
      this.input.on("pointerupoutside", this.handlePointerRelease, this);
      this.unsubscribe = controller.onChange(() => this.sync());
      this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.publishMovementFrame, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubscribe?.();
        this.input.off("pointermove", this.handlePointerMove, this);
        this.input.off("pointerup", this.handlePointerRelease, this);
        this.input.off("pointerupoutside", this.handlePointerRelease, this);
        this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.publishMovementFrame, this);
        this.game.canvas.removeEventListener("pointerleave", this.handleCanvasPointerLeave);
        for (const tile of this.rangeMaskTiles) tile.destroy();
        this.rangeMaskTiles = [];
        for (const effect of this.combatEffects) effect.destroy();
        this.combatEffects = [];
        for (const effect of this.turnTransitionEffects) effect.destroy();
        this.turnTransitionEffects = [];
        this.turnTransitionMask?.destroy();
        this.turnTransitionMask = undefined;
        this.turnTransitionMaskShape?.destroy();
        this.turnTransitionMaskShape = undefined;
        this.clearEdgePan();
      });
      this.sync();
      const canvas = this.game.canvas;
      canvas.addEventListener("pointerleave", this.handleCanvasPointerLeave);
      canvas.setAttribute(
        "aria-label",
        `${controller.battle.stage.name}戰術地圖，使用滑鼠或方向鍵操作`,
      );
      canvas.setAttribute("role", "application");
      canvas.dataset.testid = "battle-canvas";
      canvas.dataset.edgePanDirection = "0,0";
      canvas.dataset.primaryPointerHeld = "false";
      canvas.dataset.cameraOriginBounds = [
        originBounds.min.x,
        originBounds.min.y,
        originBounds.max.x,
        originBounds.max.y,
      ].join(",");
      this.setNativePointerCursor("hand");
      // Phaser still reports the scene as inactive during part of create(), so
      // the eager sync above can be ignored by the stale-scene guard. Static
      // debug fixtures may not emit another controller update before their
      // first frame; draw once more after the scene has entered its first tick.
      this.time.delayedCall(0, () => this.sync());
    }

    update(time: number): void {
      if (!controller.edgeScrollEnabled && !this.primaryPointerHeld) {
        if (this.edgePan) this.clearEdgePan();
        return;
      }
      if (!this.edgePan || time < this.nextEdgePanAt) return;
      controller.panCamera(this.edgePan);
      this.nextEdgePanAt = time + EDGE_PAN_INTERVAL_MS;
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
      const edgeDirection = this.edgeDirectionFor(pointer);
      this.setNativePointerCursor(edgeDirection ? this.nativeCursorFor(edgeDirection) : "hand");
      const edgePan = controller.edgeScrollEnabled || this.primaryPointerHeld ? edgeDirection : undefined;
      if (edgePan) {
        this.startEdgePan(edgePan);
        return;
      }

      this.clearEdgePan();
      if (edgeDirection) return;
      if (
        pointer.x < BATTLE_INPUT_LEFT
        || pointer.x >= BATTLE_INPUT_RIGHT
        || pointer.y < BATTLE_INPUT_TOP
        || pointer.y >= BATTLE_INPUT_BOTTOM
      ) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      controller.focusCell({ x: Math.floor(world.x / TILE_WIDTH), y: Math.floor(world.y / TILE_HEIGHT) });
    }

    private edgeDirectionFor(pointer: Phaser.Input.Pointer): { x: number; y: number } | undefined {
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

    private nativeCursorFor(edgeDirection: { x: number; y: number }): NativePointerCursor {
      // The release evaluates horizontal edges first and vertical edges second.
      // Its 1/2/3/4 direction slot therefore resolves corners to up/down.
      if (edgeDirection.y < 0) return "up";
      if (edgeDirection.y > 0) return "down";
      return edgeDirection.x < 0 ? "left" : "right";
    }

    private setNativePointerCursor(cursor: NativePointerCursor): void {
      const canvas = this.game.canvas;
      canvas.dataset.nativePointerCursor = cursor;
      canvas.dataset.nativePointerFrame = String(NATIVE_POINTER_FRAME[cursor]);
    }

    private setPrimaryPointerHeld(held: boolean): void {
      this.primaryPointerHeld = held;
      this.game.canvas.dataset.primaryPointerHeld = String(held);
    }

    private startEdgePan(edgePan: { x: number; y: number }): void {
      const changed = !this.edgePan || this.edgePan.x !== edgePan.x || this.edgePan.y !== edgePan.y;
      this.edgePan = edgePan;
      this.game.canvas.dataset.edgePanDirection = `${edgePan.x},${edgePan.y}`;
      if (!changed) return;
      controller.panCamera(edgePan);
      this.nextEdgePanAt = this.time.now + EDGE_PAN_INTERVAL_MS;
    }

    private clearEdgePan(): void {
      this.edgePan = undefined;
      this.nextEdgePanAt = 0;
      const canvas = this.game.canvas;
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
      // A controller notification can already be iterating when the main
      // surface destroys this scene. Ignore that last stale callback after
      // Phaser has released the camera during a battle/deployment swap.
      if (!this.sys.isActive() || !this.cameras.main) return;
      if (!controller.edgeScrollEnabled && !this.primaryPointerHeld && this.edgePan) this.clearEdgePan();
      this.syncCamera();
      this.drawGrid();
      this.drawRanges();
      this.drawUnits();
      this.drawCombatEffects();
      this.drawTurnTransition();
      this.drawCursor();
    }

    private drawGrid(): void {
      this.gridGraphics.clear();
      let lineCount = 0;
      if (controller.gridEnabled) {
        this.gridGraphics.lineStyle(1, 0x3b211a, 0.72);
        for (let column = 0; column <= 50; column += 1) {
          const x = column * TILE_WIDTH;
          this.gridGraphics.lineBetween(x, 0, x, 50 * TILE_HEIGHT);
          lineCount += 1;
        }
        for (let row = 0; row <= 50; row += 1) {
          const y = row * TILE_HEIGHT;
          this.gridGraphics.lineBetween(0, y, 50 * TILE_WIDTH, y);
          lineCount += 1;
        }
      }
      const canvas = this.game.canvas;
      canvas.dataset.gridEnabled = String(controller.gridEnabled);
      canvas.dataset.gridLineCount = String(lineCount);
      canvas.dataset.edgeScrollEnabled = String(controller.edgeScrollEnabled);
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
      for (const tile of this.rangeMaskTiles) tile.destroy();
      this.rangeMaskTiles = [];

      const nativeLegalCells = controller.actionMode === "move"
        ? controller.reachable
        : controller.actionMode === "target"
          ? controller.targets
          : controller.actionMode === "specialTarget"
            ? controller.actionRange
          : undefined;
      if (nativeLegalCells) {
        const legal = new Set(nativeLegalCells.map(({ x, y }) => `${x},${y}`));
        for (let row = 0; row < 7; row += 1) {
          for (let column = 0; column < 10; column += 1) {
            const x = controller.cameraOrigin.x + column;
            const y = controller.cameraOrigin.y + row;
            if (legal.has(`${x},${y}`)) continue;
            this.rangeMaskTiles.push(
              this.add.tileSprite(x * TILE_WIDTH, y * TILE_HEIGHT, TILE_WIDTH, TILE_HEIGHT, "native-range-dither")
                .setOrigin(0)
                .setDepth(2),
            );
          }
        }
      }
      const previewColors = controller.actionMode === "enemyPreview"
        ? { fill: 0xc92332, stroke: 0xffa08f }
        : controller.actionMode === "allyPreview"
          ? { fill: 0x286fd6, stroke: 0x9fc8ff }
          : undefined;
      if (previewColors) {
        this.rangeGraphics.fillStyle(previewColors.fill, 0.34);
        this.rangeGraphics.lineStyle(2, previewColors.stroke, 0.9);
        for (const cell of controller.reachable) {
          this.rangeGraphics.fillRect(cell.x * TILE_WIDTH + 2, cell.y * TILE_HEIGHT + 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);
          this.rangeGraphics.strokeRect(cell.x * TILE_WIDTH + 2, cell.y * TILE_HEIGHT + 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);
        }
      }
      if (controller.isTestMode) {
        this.game.canvas.dataset.nativeDitherCellCount = String(this.rangeMaskTiles.length);
        this.game.canvas.dataset.nativeDitherRetainedFraction = this.rangeMaskTiles.length > 0 ? "0.25" : "1";
      }
    }

    private textureFor(unit: BattleUnit): string {
      if (unit.side === 1) {
        if (
          unit.classId === "archer"
          || unit.classId === "cavalry"
          || unit.classId === "sister"
          || unit.classId === "magician"
          || unit.classId === "magic-priest"
          || unit.classId === "warrior"
        ) return `ally-${unit.classId}`;
        return "ally-soldier";
      }
      if (unit.classId === "cavalry") return "enemy-cavalry";
      if (unit.classId === "sister") return "enemy-sister";
      if (unit.classId === "monk") return "enemy-monk";
      return "enemy-soldier";
    }

    private unitVisualOffset(unit: BattleUnit): number {
      // The stored frames are rectangular, but their opaque visual mass is not:
      // the 32px soldier frames lean 2px right and the 40px cavalry frame 2px
      // left. This offset belongs only to the character image; numeric HUD
      // elements remain centered on the logical 40px cell.
      if (unit.classId === "cavalry") return 2;
      return unit.classId === "soldier" ? -2 : 0;
    }

    private unitWorldX(unit: BattleUnit): number {
      return unit.x * TILE_WIDTH + TILE_WIDTH / 2;
    }

    private createUnitView(unit: BattleUnit): UnitView {
      const container = this.add.container(this.unitWorldX(unit), unit.y * TILE_HEIGHT + 43).setDepth(5);
      const sprite = this.add.image(this.unitVisualOffset(unit), 0, this.textureFor(unit)).setOrigin(0.5, 1);
      const iceDisabledOverlay = presentationActionIds.has("ice-1")
        ? this.add.image(0, -21, "map-ice-1-expansion-5").setOrigin(.5)
        : undefined;
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

      container.add([
        sprite,
        ...(iceDisabledOverlay ? [iceDisabledOverlay] : []),
        lifeDigits,
        actedBadge,
      ]);
      return { container, sprite, iceDisabledOverlay, lifeDigits, actedBadge };
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
      const presentation = controller.combatPresentation;
      const mapPresentation = presentation && !presentation.phase.startsWith("full") ? presentation : undefined;
      const specialPresentation = controller.specialActionPresentation;
      const displayedUnits = new Map(controller.battle.units.map((unit) => [unit.id, unit]));
      if (mapPresentation) {
        if (!displayedUnits.has(mapPresentation.attacker.id)) displayedUnits.set(mapPresentation.attacker.id, mapPresentation.attacker);
        if (!displayedUnits.has(mapPresentation.defender.id)) displayedUnits.set(mapPresentation.defender.id, mapPresentation.defender);
      }
      const active = new Set<string>();
      let visibleCount = 0;
      for (const unit of displayedUnits.values()) {
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
        const specialDisplayedLife = specialPresentation?.displayedLifeByUnitId[unit.id];
        const displayedLife = specialDisplayedLife
          ?? (mapPresentation?.attacker.id === unit.id
            ? mapPresentation.displayedAttackerLife
            : mapPresentation?.defender.id === unit.id
              ? mapPresentation.displayedDefenderLife
              : unit.life);
        const erasedByDeath = mapPresentation
          && (
            (mapPresentation.phase === "defenderDeath" && mapPresentation.defender.id === unit.id)
            || (mapPresentation.phase === "attackerDeath" && mapPresentation.attacker.id === unit.id)
          )
          && mapPresentation.frame >= 6;
        view.container.setVisible(!erasedByDeath);
        if (!erasedByDeath) visibleCount += 1;
        this.drawLifeDigits(view, { ...unit, life: displayedLife });
        // Frozen units are state-driven and untargetable; keep the shell visible
        // while unrelated area techniques play until dispel or phase cleanup.
        view.iceDisabledOverlay?.setVisible(unit.actionDisabled);
        view.actedBadge.setVisible(unit.acted && !mapPresentation);
      }
      for (const [id, view] of this.unitViews) {
        if (active.has(id)) continue;
        view.container.destroy(true);
        this.unitViews.delete(id);
      }
      if (controller.isTestMode) {
        this.game.canvas.dataset.unitLifeLabelCount = String(visibleCount);
        this.game.canvas.dataset.actedBadgeCount = String(controller.battle.units.filter((unit) => unit.acted).length);
        this.game.canvas.dataset.iceDisabledCount = String(
          controller.battle.units.filter((unit) => unit.actionDisabled).length,
        );
        this.game.canvas.dataset.iceDisabledUnitIds = controller.battle.units
          .filter((unit) => unit.actionDisabled)
          .map((unit) => unit.id)
          .join(",");
        this.game.canvas.dataset.actedBadgeGeometry = "-22,-15,16,14";
        this.game.canvas.dataset.rangeMode = controller.actionMode;
        this.game.canvas.dataset.rangeCellCount = String(
          controller.actionMode === "specialTarget"
            ? controller.actionRange.length
            : controller.actionMode === "target"
              ? controller.targets.length
              : controller.reachable.length,
        );
        this.game.canvas.dataset.combatShadowUnitCount = String(
          mapPresentation
            ? [mapPresentation.attacker, mapPresentation.defender]
              .filter((unit) => !controller.battle.unit(unit.id))
              .length
            : 0,
        );
      }
    }

    private drawCombatEffects(): void {
      for (const effect of this.combatEffects) effect.destroy();
      this.combatEffects = [];
      const presentation = controller.combatPresentation;
      const special = controller.specialActionPresentation;
      const rest = controller.restPresentation;
      const canvas = this.game.canvas;
      if (rest) {
        if (rest.phase === "restEffect") {
          this.combatEffects.push(
            this.add.image(
              rest.unit.x * TILE_WIDTH + TILE_WIDTH / 2,
              rest.unit.y * TILE_HEIGHT + TILE_HEIGHT,
              `map-heal-1-tail-${rest.frame}`,
            ).setOrigin(.5, 1).setDepth(8),
          );
        }
        if (controller.isTestMode) {
          canvas.dataset.mapCombatPhase = rest.phase;
          canvas.dataset.mapCombatFrame = String(rest.frame);
          canvas.dataset.mapCombatTarget = rest.unit.id;
          canvas.dataset.mapCombatEffectTileCount = String(this.combatEffects.length);
          delete canvas.dataset.mapCombatLifeChangeUnit;
          delete canvas.dataset.mapCombatDisplayedLife;
          delete canvas.dataset.mapCombatAnchorOffset;
          delete canvas.dataset.mapCombatIceRangeValue;
          delete canvas.dataset.mapCombatIceDistance;
        }
        return;
      }
      if (special) {
        const target = special.target;
        const center = special.center;
        let lightningAnchorOffset: { x: number; y: number } | undefined;
        let iceRangeValue: number | undefined;
        let iceDistanceFromCenter: number | undefined;
        let texture: string | undefined;
        if (special.phase === "shootHit") texture = `map-shoot-${special.frame}`;
        else if (special.phase === "fireEffect") texture = `map-fire-1-${special.frame}`;
        else if (special.phase === "healPrimary") texture = `map-heal-1-primary-${special.frame}`;
        else if (special.phase === "healTail") texture = `map-heal-1-tail-${special.frame}`;

        if (texture) {
          this.combatEffects.push(
            this.add.image(
              center.x * TILE_WIDTH + TILE_WIDTH / 2,
              center.y * TILE_HEIGHT + TILE_HEIGHT,
              texture,
            ).setOrigin(.5, 1).setDepth(8),
          );
        } else if (special.phase === "lightningMain"
          || special.phase === "lightningHit"
          || special.phase === "lightningCleanup") {
          const definition = presentationCatalog!.lightning1;
          const frame = special.phase === "lightningMain"
            ? lightningFrameAtMainIndex(definition, special.frame)
            : special.phase === "lightningHit"
              ? { kind: "wave" as const, frame: special.frame, durationNativeTicks: 2 }
              : { kind: "cleanup" as const, frame: special.frame, durationNativeTicks: 10 };
          if (frame) {
            const rendered = renderLightningFrame(this, definition, frame, {
              center,
              effectCells: special.result.effectCells,
              wavePositions: special.result.affectedUnits.map(({ positionBefore }) => positionBefore),
              cleanupPositions: controller.battle.units
                .filter(({ side }) => side !== special.actor.side)
                .map(({ x, y }) => ({ x, y })),
            });
            this.combatEffects.push(...rendered.images);
            lightningAnchorOffset = rendered.anchorOffset;
          }
        } else if (special.phase === "iceExpansion") {
          const iceFrame = iceFrameAtGlobalIndex(presentationCatalog!.ice1, special.frame);
          const sourceFrame = iceFrame?.sourceFrame;
          iceRangeValue = iceFrame?.rangeValue;
          iceDistanceFromCenter = iceFrame?.distanceFromCenter;
          for (const { position, value } of special.result.effectCells) {
            if (sourceFrame === undefined || value !== iceRangeValue) continue;
            this.combatEffects.push(
              this.add.image(
                position.x * TILE_WIDTH + TILE_WIDTH / 2,
                position.y * TILE_HEIGHT + TILE_HEIGHT / 2,
                `map-ice-1-expansion-${sourceFrame}`,
              ).setOrigin(.5).setDepth(8),
            );
          }
        } else if (special.phase === "recoveryEffect") {
          const descriptor = presentationCatalog!.recovery1.presentation
            .descriptorSequence[special.frame];
          const sourceFrame = descriptor?.low7BitFrameIndices[0];
          if (sourceFrame !== null && sourceFrame !== undefined) {
            for (const affected of special.result.affectedUnits) {
              this.combatEffects.push(
                this.add.image(
                  affected.positionBefore.x * TILE_WIDTH + TILE_WIDTH / 2,
                  affected.positionBefore.y * TILE_HEIGHT + TILE_HEIGHT / 2,
                  `map-recovery-1-${sourceFrame}`,
                ).setOrigin(.5).setDepth(8),
              );
            }
          }
        } else if (special.phase === "dispelEffect") {
          const dispel = presentationCatalog!.dispel;
          const states: Array<readonly number[]> = [];
          for (const { runtimeTileCodeStates } of dispel.phases) {
            for (const state of runtimeTileCodeStates) states.push(state);
          }
          const runtimeTileCodes = states[special.frame] ?? [];
          runtimeTileCodes.forEach((runtimeTileCode, row) => {
            if (runtimeTileCode === 0) return;
            this.combatEffects.push(
              this.add.image(
                center.x * TILE_WIDTH,
                (center.y + dispel.dynamicPresentation.descriptor.yOffset + row) * TILE_HEIGHT,
                `map-dispel-${runtimeTileCode - 1}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "specialDeath" && target) {
          const descriptor = MAP_DEATH_DESCRIPTORS[special.frame];
          descriptor?.frames.forEach((sourceFrame, index) => {
            if (sourceFrame === null) return;
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.combatEffects.push(
              this.add.image(
                (target.x + descriptor.xOffset + column) * TILE_WIDTH,
                (target.y + descriptor.yOffset + row) * TILE_HEIGHT,
                `map-death-${sourceFrame}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        }

        if (controller.isTestMode) {
          canvas.dataset.mapCombatPhase = special.phase;
          canvas.dataset.mapCombatFrame = String(special.frame);
          canvas.dataset.mapCombatTarget = target?.id ?? `${center.x},${center.y}`;
          canvas.dataset.mapCombatEffectTileCount = String(this.combatEffects.length);
          if (special.lifeChangeUnitId) {
            canvas.dataset.mapCombatLifeChangeUnit = special.lifeChangeUnitId;
            canvas.dataset.mapCombatDisplayedLife = String(
              special.displayedLifeByUnitId[special.lifeChangeUnitId],
            );
          } else {
            delete canvas.dataset.mapCombatLifeChangeUnit;
            delete canvas.dataset.mapCombatDisplayedLife;
          }
          if (lightningAnchorOffset) {
            canvas.dataset.mapCombatAnchorOffset =
              `${lightningAnchorOffset.x},${lightningAnchorOffset.y}`;
          } else {
            delete canvas.dataset.mapCombatAnchorOffset;
          }
          if (iceRangeValue !== undefined && iceDistanceFromCenter !== undefined) {
            canvas.dataset.mapCombatIceRangeValue = String(iceRangeValue);
            canvas.dataset.mapCombatIceDistance = String(iceDistanceFromCenter);
          } else {
            delete canvas.dataset.mapCombatIceRangeValue;
            delete canvas.dataset.mapCombatIceDistance;
          }
        }
        return;
      }

      if (!presentation || presentation.phase.startsWith("full")) {
        if (controller.isTestMode) {
          delete canvas.dataset.mapCombatPhase;
          delete canvas.dataset.mapCombatFrame;
          delete canvas.dataset.mapCombatTarget;
          delete canvas.dataset.mapCombatAnchorOffset;
          delete canvas.dataset.mapCombatIceRangeValue;
          delete canvas.dataset.mapCombatIceDistance;
          delete canvas.dataset.mapCombatLifeChangeUnit;
          delete canvas.dataset.mapCombatDisplayedLife;
          canvas.dataset.mapCombatEffectTileCount = "0";
        }
        return;
      }

      const target = presentation.phase === "counterHit"
        || presentation.phase === "counterDamage"
        || presentation.phase === "attackerDeath"
        ? presentation.attacker
        : presentation.defender;

      if (presentation.phase === "primaryHit" || presentation.phase === "counterHit") {
        const sourceFrame = MAP_HIT_FRAME_TIMELINE[presentation.frame] ?? 0;
        this.combatEffects.push(
          this.add.image(target.x * TILE_WIDTH, target.y * TILE_HEIGHT, `map-hit-${sourceFrame}`)
            .setOrigin(0)
            .setDepth(8),
        );
      } else if (presentation.phase === "defenderDeath" || presentation.phase === "attackerDeath") {
        const descriptor = MAP_DEATH_DESCRIPTORS[presentation.frame];
        descriptor?.frames.forEach((sourceFrame, index) => {
          if (sourceFrame === null) return;
          const column = index % descriptor.width;
          const row = Math.floor(index / descriptor.width);
          this.combatEffects.push(
            this.add.image(
              (target.x + descriptor.xOffset + column) * TILE_WIDTH,
              (target.y + descriptor.yOffset + row) * TILE_HEIGHT,
              `map-death-${sourceFrame}`,
            ).setOrigin(0).setDepth(8),
          );
        });
      }

      if (controller.isTestMode) {
        delete canvas.dataset.mapCombatLifeChangeUnit;
        delete canvas.dataset.mapCombatDisplayedLife;
        canvas.dataset.mapCombatPhase = presentation.phase;
        canvas.dataset.mapCombatFrame = String(presentation.frame);
        canvas.dataset.mapCombatTarget = target.id;
        canvas.dataset.mapCombatEffectTileCount = String(this.combatEffects.length);
        canvas.dataset.mapCombatAttackerLife = String(presentation.displayedAttackerLife);
        canvas.dataset.mapCombatDefenderLife = String(presentation.displayedDefenderLife);
      }
    }

    private drawTurnTransition(): void {
      for (const effect of this.turnTransitionEffects) effect.destroy();
      this.turnTransitionEffects = [];
      this.turnTransitionMask?.destroy();
      this.turnTransitionMask = undefined;
      this.turnTransitionMaskShape?.destroy();
      this.turnTransitionMaskShape = undefined;
      const presentation = controller.turnTransitionPresentation;
      const canvas = this.game.canvas;

      if (!presentation) {
        if (controller.isTestMode) {
          delete canvas.dataset.turnTransitionSide;
          delete canvas.dataset.turnTransitionPhase;
          delete canvas.dataset.turnTransitionFrame;
          delete canvas.dataset.turnTransitionX;
          delete canvas.dataset.turnTransitionY;
          delete canvas.dataset.turnTransitionScreenX;
          delete canvas.dataset.turnTransitionScreenY;
          delete canvas.dataset.turnTransitionClip;
          canvas.dataset.turnTransitionSpriteCount = "0";
          canvas.dataset.turnTransitionDustCount = "0";
        }
        return;
      }

      if (controller.isTestMode) {
        canvas.dataset.turnTransitionSide = presentation.side;
        canvas.dataset.turnTransitionPhase = presentation.phase;
        canvas.dataset.turnTransitionFrame = String(presentation.frame);
      }
      if (presentation.phase === "hold") {
        if (controller.isTestMode) {
          delete canvas.dataset.turnTransitionX;
          delete canvas.dataset.turnTransitionY;
          delete canvas.dataset.turnTransitionScreenX;
          delete canvas.dataset.turnTransitionScreenY;
          delete canvas.dataset.turnTransitionClip;
          canvas.dataset.turnTransitionSpriteCount = "0";
          canvas.dataset.turnTransitionDustCount = "0";
        }
        return;
      }

      // 1000:37E8 prepares three D4EA copy descriptors. The runner is drawn in
      // the offscreen (0,200)..(399,331) strip, which 1000:389D copies onto the
      // visible (40,155)..(439,286) strip. This is an exact x+40/y-45 mapping,
      // not a tween anchor adjustment; the same strip clips A/19, its shadow,
      // and every A/26 puff before the battle chrome is composited above it.
      this.turnTransitionMaskShape = this.make.graphics({ x: 0, y: 0 });
      this.turnTransitionMaskShape.fillStyle(0xffffff);
      this.turnTransitionMaskShape.fillRect(
        this.cameras.main.scrollX,
        this.cameras.main.scrollY + TURN_TRANSITION_SCREEN_Y - this.cameras.main.y,
        400,
        TURN_TRANSITION_BUFFER_HEIGHT,
      );
      const transitionMask = this.turnTransitionMaskShape.createGeometryMask();
      this.turnTransitionMask = transitionMask;

      const addFixedImage = (x: number, y: number, texture: string, depth: number) => {
        const screenX = x + BATTLE_INPUT_LEFT;
        const screenY = y - TURN_TRANSITION_BUFFER_SOURCE_Y + TURN_TRANSITION_SCREEN_Y;
        const image = this.add.image(
          screenX - this.cameras.main.x,
          screenY - this.cameras.main.y,
          texture,
        ).setOrigin(0).setScrollFactor(0).setDepth(depth).setMask(transitionMask);
        this.turnTransitionEffects.push(image);
      };

      addFixedImage(presentation.x + 16, 322, "turn-transition-shadow", 11);
      addFixedImage(
        presentation.x,
        presentation.y,
        presentation.side === "player" ? "turn-transition-player" : "turn-transition-enemy",
        12,
      );
      for (const dust of TURN_TRANSITION_DUST) {
        addFixedImage(dust.x, dust.y, `turn-transition-dust-${dust.frame}`, 13);
      }

      if (controller.isTestMode) {
        canvas.dataset.turnTransitionX = String(presentation.x);
        canvas.dataset.turnTransitionY = String(presentation.y);
        canvas.dataset.turnTransitionScreenX = String(presentation.x + BATTLE_INPUT_LEFT);
        canvas.dataset.turnTransitionScreenY = String(
          presentation.y - TURN_TRANSITION_BUFFER_SOURCE_Y + TURN_TRANSITION_SCREEN_Y,
        );
        canvas.dataset.turnTransitionClip = [
          BATTLE_INPUT_LEFT,
          TURN_TRANSITION_SCREEN_Y,
          400,
          TURN_TRANSITION_BUFFER_HEIGHT,
        ].join(",");
        canvas.dataset.turnTransitionSpriteCount = "2";
        canvas.dataset.turnTransitionDustCount = String(TURN_TRANSITION_DUST.length);
      }
    }

    private drawCursor(): void {
      this.cursorGraphics.clear();
      if (controller.isTestMode) {
        const canvas = this.game.canvas;
        canvas.dataset.cursorFrameStyle = "native-bevel";
        canvas.dataset.cursorFrameShadow = "palette-0:40x44:2px";
        canvas.dataset.cursorFrameHighlight = "palette-15:39x43:1px";
      }
      if (
        controller.combatPresentation
        || controller.specialActionPresentation
        || controller.restPresentation
        || controller.turnTransitionPresentation
      ) return;
      const focus = controller.cursor;
      this.drawNativeCursorFrame(focus.x * TILE_WIDTH, focus.y * TILE_HEIGHT);
      const unit = controller.focusedUnit;
      if (unit) {
        const marker = controller.movementPresentation ? focus : unit;
        this.cursorGraphics.lineStyle(2, unit.side === 1 ? 0x59b9ff : 0xff5252, 1);
        this.cursorGraphics.strokeCircle(marker.x * TILE_WIDTH + 20, marker.y * TILE_HEIGHT + 23, 17);
      }
    }

    private drawNativeCursorFrame(x: number, y: number): void {
      // Module 29 draws DS:5B29 in palette 0, then overlays DS:5C35
      // in palette 15. Explicit pixel rectangles preserve that 40x44 bevel.
      this.cursorGraphics.fillStyle(NATIVE_CURSOR_SHADOW, 1);
      this.cursorGraphics.fillRect(x, y, TILE_WIDTH, 2);
      this.cursorGraphics.fillRect(x, y + TILE_HEIGHT - 2, TILE_WIDTH, 2);
      this.cursorGraphics.fillRect(x, y + 2, 2, TILE_HEIGHT - 4);
      this.cursorGraphics.fillRect(x + TILE_WIDTH - 2, y + 2, 2, TILE_HEIGHT - 4);

      this.cursorGraphics.fillStyle(NATIVE_CURSOR_HIGHLIGHT, 1);
      this.cursorGraphics.fillRect(x, y, TILE_WIDTH - 1, 1);
      this.cursorGraphics.fillRect(x, y + 1, 1, TILE_HEIGHT - 3);
      this.cursorGraphics.fillRect(x + TILE_WIDTH - 2, y + 1, 1, TILE_HEIGHT - 3);
      this.cursorGraphics.fillRect(x, y + TILE_HEIGHT - 2, TILE_WIDTH - 1, 1);
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
