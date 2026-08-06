import * as Phaser from "phaser";
import { ASSETS } from "../content/stage0";
import {
  STAGE0_ACTION_PRESENTATION_ASSETS,
  actionPresentationAssetCatalog,
  actionPresentationCatalog,
} from "../content/actions";
import { ALLY_MAP_UNIT_ASSETS, allyMapUnitAsset } from "../content/map-unit-assets";
import type { GameController } from "../controller";
import type { BattleUnit } from "../types";
import { iceFrameAtGlobalIndex, lightningFrameAtMainIndex } from "../map-technique-presentation";
import { TURN_TRANSITION_DUST } from "../turn-transition-presentation";
import { buildStompPresentationSteps } from "../stomp-presentation";
import {
  preloadMapTechniqueAssets,
  renderLightningFrame,
  type MapTechniqueGraphicAssets,
} from "./MapTechniqueRenderer";
import { renderPrayerPresentation } from "./PrayerRenderer";

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

const routePulseTextureKey = (presentationId: string, frame: number): string =>
  `route-pulse-${presentationId}-${frame}`;

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
  const hasIcePresentation = presentationActionIds.has("ice-1")
    || presentationActionIds.has("ice-2")
    || presentationActionIds.has("ice-3")
    || presentationActionIds.has("ice-4");
  const hasLightningPresentation = presentationActionIds.has("lightning-1")
    || presentationActionIds.has("lightning-2")
    || presentationActionIds.has("lightning-3")
    || presentationActionIds.has("lightning-4");
  const hasExtendedActions = ([
    "lightning-1",
    "lightning-2",
    "lightning-3",
    "lightning-4",
    "ice-1",
    "ice-2",
    "ice-3",
    "ice-4",
    "fire-2",
    "fire-3",
    "fire-4",
    "heal-2",
    "heal-3",
    "recovery-1",
    "recovery-2",
    "recovery-3",
    "attack-up",
    "defense-up",
    "magic-guard",
    "poison",
    "confusion",
    "attack-down",
    "defense-down",
    "spell-seal",
    "prayer",
    "dispel",
    "stomp-1",
    "stomp-2",
    "stomp-3",
  ] as const)
    .some((actionId) => presentationActionIds.has(actionId));
  const stageAssets = controller.currentStageAssets;
  const mapTextureKey = `${controller.battle.stage.id}-map`;
  const presentationCatalog = hasExtendedActions ? actionPresentationCatalog() : undefined;
  const presentationAssets = hasExtendedActions ? actionPresentationAssetCatalog() : undefined;
  const lightningAssets: MapTechniqueGraphicAssets | undefined = presentationAssets
    && hasLightningPresentation
    ? {
      ...(presentationActionIds.has("lightning-1") ? {
        "MAGIC/8": presentationAssets.lightning1.main,
        "MAGIC/31": presentationAssets.lightning1.hit,
      } : {}),
      ...(presentationActionIds.has("lightning-2") ? {
        "MAGIC/47": presentationAssets.lightning2.primary,
        "MAGIC/48": presentationAssets.lightning2.column,
        "MAGIC/24": presentationAssets.lightning2.hit,
      } : {}),
      ...(presentationActionIds.has("lightning-3") ? {
        "MAGIC/3": presentationAssets.lightning3.cloud,
        "MAGIC/4": presentationAssets.lightning3.column,
        "MAGIC/25": presentationAssets.lightning3.hit,
      } : {}),
      ...(presentationActionIds.has("lightning-4") ? {
        "MAGIC/39": presentationAssets.lightning4.primary,
        "MAGIC/40": presentationAssets.lightning4.column,
        "MAGIC/26": presentationAssets.lightning4.hit,
      } : {}),
      "MAGIC/6": presentationActionIds.has("lightning-4")
        ? presentationAssets.lightning4.cleanup
        : presentationActionIds.has("lightning-3")
        ? presentationAssets.lightning3.cleanup
        : presentationActionIds.has("lightning-2")
          ? presentationAssets.lightning2.cleanup
          : presentationAssets.lightning1.cleanup,
    }
    : undefined;
  return class BattleScene extends Phaser.Scene {
    private gridGraphics!: Phaser.GameObjects.Graphics;
    private rangeGraphics!: Phaser.GameObjects.Graphics;
    private cursorGraphics!: Phaser.GameObjects.Graphics;
    private rangeMaskTiles: Phaser.GameObjects.TileSprite[] = [];
    private combatEffects: Phaser.GameObjects.GameObject[] = [];
    private turnTransitionEffects: Phaser.GameObjects.Image[] = [];
    private terrainOverrideImages: Phaser.GameObjects.Image[] = [];
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
      this.load.image(
        "terrain-iron-plate",
        `/assets/original/map-actions/iron-plate/${controller.battle.stage.id}.png`,
      );
      this.load.image(
        "terrain-obstacle",
        `/assets/original/map-actions/obstacle/${controller.battle.stage.id}.png`,
      );
      Object.entries(ALLY_MAP_UNIT_ASSETS).forEach(([classId, source]) =>
        this.load.image(`ally-${classId}`, source));
      this.load.image("enemy-soldier", ASSETS.enemySoldier);
      this.load.image("enemy-cavalry", ASSETS.enemyCavalry);
      Object.entries(stageAssets?.unitSprites ?? {}).forEach(([key, source]) => {
        const classId = key.startsWith("ally-") ? key.slice("ally-".length) : undefined;
        if (classId && allyMapUnitAsset(classId as BattleUnit["classId"])) return;
        this.load.image(key, source);
      });
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
        if (presentationActionIds.has("fire-2")) presentationAssets.fire2.effect.forEach((source, frame) =>
          this.load.image(`map-fire-2-${frame}`, source));
        if (presentationActionIds.has("fire-3")) presentationAssets.fire3.effect.forEach((source, frame) =>
          this.load.image(`map-fire-3-${frame}`, source));
        if (presentationActionIds.has("fire-4")) {
          presentationAssets.fire4.ground.forEach((source, frame) =>
            this.load.image(`map-fire-4-ground-${frame}`, source));
          presentationAssets.fire4.column.forEach((source, frame) =>
            this.load.image(`map-fire-4-column-${frame}`, source));
          presentationAssets.fire4.finish.forEach((source, frame) =>
            this.load.image(`map-fire-4-finish-${frame}`, source));
        }
        if (presentationActionIds.has("heal-2")) presentationAssets.heal2.primary.forEach((source, frame) =>
          this.load.image(`map-heal-2-primary-${frame}`, source));
        if (presentationActionIds.has("heal-3")) {
          presentationAssets.heal3.outer.forEach((source, frame) =>
            this.load.image(`map-heal-3-outer-${frame}`, source));
          presentationAssets.heal3.loop.forEach((source, frame) =>
            this.load.image(`map-heal-3-loop-${frame}`, source));
        }
        if (lightningAssets) preloadMapTechniqueAssets(this, lightningAssets);
        if (hasIcePresentation) presentationAssets.ice1.expansion.forEach((source, frame) =>
          this.load.image(`map-ice-1-expansion-${frame}`, source));
        if (presentationActionIds.has("recovery-1")
          || presentationActionIds.has("recovery-2")
          || presentationActionIds.has("recovery-3")) presentationAssets.recovery1.effect.forEach((source, frame) =>
          this.load.image(`map-recovery-1-${frame}`, source));
        if (presentationActionIds.has("attack-up")) presentationAssets.attackUp.effect.forEach((source, frame) =>
          this.load.image(`map-attack-up-${frame}`, source));
        if (presentationActionIds.has("defense-up")) presentationAssets.defenseUp.effect.forEach((source, frame) =>
          this.load.image(`map-defense-up-${frame}`, source));
        if (presentationActionIds.has("magic-guard")) presentationAssets.magicGuard.effect.forEach((source, frame) =>
          this.load.image(`map-magic-guard-${frame}`, source));
        if (presentationActionIds.has("poison")) {
          presentationAssets.poison.rise.forEach((source, frame) =>
            this.load.image(`map-poison-rise-${frame}`, source));
          presentationAssets.poison.cloud.forEach((source, frame) =>
            this.load.image(`map-poison-cloud-${frame}`, source));
        }
        if (presentationActionIds.has("confusion")) presentationAssets.confusion.effect
          .forEach((source, frame) => this.load.image(`map-confusion-${frame}`, source));
        if (presentationActionIds.has("attack-down")) presentationAssets.attackDown.effect
          .forEach((source, frame) => this.load.image(`map-attack-down-${frame}`, source));
        if (presentationActionIds.has("defense-down")) presentationAssets.defenseDown.effect
          .forEach((source, frame) => this.load.image(`map-defense-down-${frame}`, source));
        if (presentationActionIds.has("spell-seal")) presentationAssets.spellSeal.effect
          .forEach((source, frame) => this.load.image(`map-spell-seal-${frame}`, source));
        if (presentationActionIds.has("dispel")) presentationAssets.dispel.effect.forEach((source, frame) =>
          this.load.image(`map-dispel-${frame}`, source));
        if (presentationActionIds.has("stomp-1")) {
          presentationAssets.stomp1.side1.forEach((source, frame) =>
            this.load.image(`map-stomp-1-side1-${frame}`, source));
          presentationAssets.stomp1.side2.forEach((source, frame) =>
            this.load.image(`map-stomp-1-side2-${frame}`, source));
        }
        if (presentationActionIds.has("stomp-2")) {
          presentationAssets.stomp2.side1.forEach((source, frame) =>
            this.load.image(`map-stomp-2-side1-${frame}`, source));
          presentationAssets.stomp2.side2.forEach((source, frame) =>
            this.load.image(`map-stomp-2-side2-${frame}`, source));
        }
        if (presentationActionIds.has("stomp-3")) {
          presentationAssets.stomp3.side1.forEach((source, frame) =>
            this.load.image(`map-stomp-3-side1-${frame}`, source));
          presentationAssets.stomp3.side2.forEach((source, frame) =>
            this.load.image(`map-stomp-3-side2-${frame}`, source));
        }
      }
      for (const presentation of stageAssets?.routePulsePresentations ?? []) {
        presentation.frames.forEach((source, frame) =>
          this.load.image(routePulseTextureKey(presentation.id, frame), source));
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
        for (const image of this.terrainOverrideImages) image.destroy();
        this.terrainOverrideImages = [];
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
      this.drawTerrainOverrides();
      this.drawGrid();
      this.drawRanges();
      this.drawUnits();
      this.drawCombatEffects();
      this.drawTurnTransition();
      this.drawCursor();
    }

    private drawTerrainOverrides(): void {
      for (const image of this.terrainOverrideImages) image.destroy();
      this.terrainOverrideImages = controller.battle.terrainOverrides.map((override) =>
        this.add.image(
          override.x * TILE_WIDTH,
          override.y * TILE_HEIGHT,
          `terrain-${override.kind}`,
        ).setOrigin(0).setDepth(.5));
      const canvas = this.game.canvas;
      canvas.dataset.terrainOverrideCount = String(this.terrainOverrideImages.length);
      canvas.dataset.terrainOverrides = controller.battle.terrainOverrides
        .map(({ x, y, kind }) => `${x},${y}:${kind}`)
        .join("|");
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
      const routePulseSafeArea = controller.currentRoutePulseSafeArea;
      if (routePulseSafeArea.length > 0) {
        const safe = new Set(routePulseSafeArea.map(({ x, y }) => `${x},${y}`));
        this.rangeGraphics.fillStyle(0x57d66b, 0.2);
        this.rangeGraphics.lineStyle(2, 0xb8ffbf, 0.9);
        for (const cell of routePulseSafeArea) {
          this.rangeGraphics.fillRect(
            cell.x * TILE_WIDTH + 2,
            cell.y * TILE_HEIGHT + 2,
            TILE_WIDTH - 4,
            TILE_HEIGHT - 4,
          );
          this.rangeGraphics.strokeRect(
            cell.x * TILE_WIDTH + 2,
            cell.y * TILE_HEIGHT + 2,
            TILE_WIDTH - 4,
            TILE_HEIGHT - 4,
          );
        }
        this.rangeGraphics.fillStyle(0xd92e3c, 0.28);
        this.rangeGraphics.lineStyle(2, 0xff8a91, 0.9);
        for (const unit of controller.battle.units) {
          if (unit.side !== 1 || safe.has(`${unit.x},${unit.y}`)) continue;
          this.rangeGraphics.fillRect(
            unit.x * TILE_WIDTH + 2,
            unit.y * TILE_HEIGHT + 2,
            TILE_WIDTH - 4,
            TILE_HEIGHT - 4,
          );
          this.rangeGraphics.strokeRect(
            unit.x * TILE_WIDTH + 2,
            unit.y * TILE_HEIGHT + 2,
            TILE_WIDTH - 4,
            TILE_HEIGHT - 4,
          );
        }
      }
      if (controller.isTestMode) {
        this.game.canvas.dataset.nativeDitherCellCount = String(this.rangeMaskTiles.length);
        this.game.canvas.dataset.nativeDitherRetainedFraction = this.rangeMaskTiles.length > 0 ? "0.25" : "1";
        this.game.canvas.dataset.routePulseSafeCellCount = String(routePulseSafeArea.length);
        this.game.canvas.dataset.routePulseDangerUnitIds = routePulseSafeArea.length > 0
          ? controller.battle.units
            .filter(({ side, x, y }) => side === 1
              && !routePulseSafeArea.some((cell) => cell.x === x && cell.y === y))
            .map(({ id }) => id)
            .join(",")
          : "";
      }
    }

    private textureFor(unit: BattleUnit): string {
      if (unit.side === 1) {
        if (allyMapUnitAsset(unit.classId)) return `ally-${unit.classId}`;
        const stageKey = `ally-${unit.classId}`;
        if (this.textures.exists(stageKey)) return stageKey;
        return "ally-soldier";
      }
      const stageKey = `enemy-${unit.classId}`;
      if (this.textures.exists(stageKey)) return stageKey;
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
      const iceDisabledOverlay = hasIcePresentation
        ? this.add.image(
          this.unitWorldX(unit),
          unit.y * TILE_HEIGHT + TILE_HEIGHT / 2,
          "map-ice-1-expansion-5",
        ).setOrigin(.5).setDepth(9)
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
      const routePulsePresentation = controller.routePulsePresentation;
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
        const movement = controller.movementPresentation?.unitId === unit.id
          ? controller.movementPresentation
          : undefined;
        const displayPosition = movement?.path[movement.stepIndex] ?? unit;
        const targetX = displayPosition.x * TILE_WIDTH + TILE_WIDTH / 2;
        const targetY = displayPosition.y * TILE_HEIGHT + 43;
        const followsMovementPath = movement !== undefined;
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
        view.iceDisabledOverlay?.setPosition(
          targetX,
          displayPosition.y * TILE_HEIGHT + TILE_HEIGHT / 2,
        );
        view.sprite.setTexture(this.textureFor(unit));
        view.sprite.setX(this.unitVisualOffset(unit));
        view.sprite.setAlpha(1);
        view.sprite.clearTint();
        const routePulseDisplayedLife = routePulsePresentation?.displayedLifeByUnitId[unit.id];
        const specialDisplayedLife = specialPresentation?.displayedLifeByUnitId[unit.id];
        const displayedLife = routePulseDisplayedLife
          ?? specialDisplayedLife
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
        view.iceDisabledOverlay?.destroy();
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
      const routePulse = controller.routePulsePresentation;
      const rest = controller.restPresentation;
      const canvas = this.game.canvas;
      if (routePulse) {
        if (routePulse.visible) {
          for (const affected of routePulse.result.affectedUnits) {
            this.combatEffects.push(
              this.add.image(
                affected.position.x * TILE_WIDTH + TILE_WIDTH / 2,
                affected.position.y * TILE_HEIGHT + TILE_HEIGHT / 2,
                routePulseTextureKey(routePulse.result.definition.presentationId, routePulse.frame),
              ).setOrigin(.5).setDepth(8),
            );
          }
        }
        if (controller.isTestMode) {
          canvas.dataset.mapCombatPhase = "route-pulse";
          canvas.dataset.mapCombatFrame = String(routePulse.frame);
          canvas.dataset.mapCombatTarget = routePulse.result.affectedUnits
            .map(({ unitId }) => unitId)
            .join(",");
          canvas.dataset.mapCombatEffectTileCount = String(this.combatEffects.length);
          canvas.dataset.routePulseDraw = String(routePulse.draw);
          canvas.dataset.routePulseNativeTicks = String(routePulse.nativeTicks);
          canvas.dataset.routePulseVisible = String(routePulse.visible);
          canvas.dataset.routePulseVisibleUnitIds = routePulse.visible
            ? routePulse.result.affectedUnits.map(({ unitId }) => unitId).join(",")
            : "";
          delete canvas.dataset.mapCombatLifeChangeUnit;
          delete canvas.dataset.mapCombatDisplayedLife;
          delete canvas.dataset.mapCombatAnchorOffset;
          delete canvas.dataset.mapCombatIceRangeValue;
          delete canvas.dataset.mapCombatIceDistance;
          delete canvas.dataset.mapCombatStompPhase;
          delete canvas.dataset.mapCombatStompY;
          delete canvas.dataset.mapCombatStompExplicitTicks;
          delete canvas.dataset.mapCombatStompAction;
          delete canvas.dataset.mapCombatStompX;
          delete canvas.dataset.mapCombatStompResource;
        }
        return;
      }
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
          delete canvas.dataset.mapCombatStompPhase;
          delete canvas.dataset.mapCombatStompY;
          delete canvas.dataset.mapCombatStompExplicitTicks;
          delete canvas.dataset.mapCombatStompAction;
          delete canvas.dataset.mapCombatStompX;
          delete canvas.dataset.mapCombatStompResource;
          delete canvas.dataset.routePulseDraw;
          delete canvas.dataset.routePulseNativeTicks;
          delete canvas.dataset.routePulseVisible;
          delete canvas.dataset.routePulseVisibleUnitIds;
          delete canvas.dataset.mapCombatAnchorOffset;
          delete canvas.dataset.mapCombatIceRangeValue;
          delete canvas.dataset.mapCombatIceDistance;
        }
        return;
      }
      if (special) {
        const target = special.target;
        const center = special.center;
        let mapAnchorOffset: { x: number; y: number } | undefined;
        let iceRangeValue: number | undefined;
        let iceDistanceFromCenter: number | undefined;
        let texture: string | undefined;
        if (special.phase === "shootHit") texture = `map-shoot-${special.frame}`;
        else if (special.phase === "fireEffect" && special.result.actionId === "fire-1") {
          texture = `map-fire-1-${special.frame}`;
        }
        else if (special.phase === "healPrimary" && special.result.actionId === "heal-1") {
          texture = `map-heal-1-primary-${special.frame}`;
        }
        else if (special.phase === "healTail") texture = `map-heal-1-tail-${special.frame}`;

        if (texture) {
          this.combatEffects.push(
            this.add.image(
              center.x * TILE_WIDTH + TILE_WIDTH / 2,
              center.y * TILE_HEIGHT + TILE_HEIGHT,
              texture,
            ).setOrigin(.5, 1).setDepth(8),
          );
        } else if (special.phase === "fireEffect"
          && (special.result.actionId === "fire-2" || special.result.actionId === "fire-3"
            || special.result.actionId === "fire-4")) {
          const fireId = special.result.actionId;
          const fire = fireId === "fire-2"
            ? presentationCatalog!.fire2
            : fireId === "fire-3"
              ? presentationCatalog!.fire3
              : presentationCatalog!.fire4;
          let phaseFrame = special.frame;
          const phase = fire.phases.find((candidate) => {
            if (phaseFrame < candidate.descriptorSequence.length) return true;
            phaseFrame -= candidate.descriptorSequence.length;
            return false;
          });
          const descriptor = phase?.descriptorSequence[phaseFrame];
          mapAnchorOffset = phase && "anchorOffsetSequence" in phase
            ? phase.anchorOffsetSequence[phaseFrame] ?? { x: 0, y: 0 }
            : { x: 0, y: 0 };
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            if (sourceFrame === null || !phase || !mapAnchorOffset) return;
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            const texture = fireId === "fire-4"
              ? `map-fire-4-${phase.resource === "MAGIC/30"
                ? "ground"
                : phase.resource === "MAGIC/28" ? "column" : "finish"}-${sourceFrame}`
              : `map-${fireId}-${sourceFrame}`;
            this.combatEffects.push(
              this.add.image(
                (center.x + mapAnchorOffset.x + descriptor.xOffset + column) * TILE_WIDTH,
                (center.y + mapAnchorOffset.y + descriptor.yOffset + row) * TILE_HEIGHT,
                texture,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "healPrimary" && special.result.actionId === "heal-2") {
          const descriptor = presentationCatalog!.heal2.phases[0]
            .descriptorSequence[special.frame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            if (sourceFrame === null) return;
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.combatEffects.push(
              this.add.image(
                (center.x + descriptor.xOffset + column) * TILE_WIDTH,
                (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
                `map-heal-2-primary-${sourceFrame}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "healPrimary" && special.result.actionId === "heal-3") {
          let phaseFrame = special.frame;
          const phase = presentationCatalog!.heal3.phases.slice(0, -1).find((candidate) => {
            if (phaseFrame < candidate.descriptorSequence.length) return true;
            phaseFrame -= candidate.descriptorSequence.length;
            return false;
          });
          const descriptor = phase?.descriptorSequence[phaseFrame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            if (sourceFrame === null || !phase) return;
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            const assetPhase = phase.resource === "MAGIC/42" ? "outer" : "loop";
            this.combatEffects.push(
              this.add.image(
                (center.x + descriptor.xOffset + column) * TILE_WIDTH,
                (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
                `map-heal-3-${assetPhase}-${sourceFrame}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "lightningMain"
          || special.phase === "lightningHit"
          || special.phase === "lightningCleanup") {
          const definition = special.result.actionId === "lightning-4"
            ? presentationCatalog!.lightning4
            : special.result.actionId === "lightning-3"
              ? presentationCatalog!.lightning3
            : special.result.actionId === "lightning-2"
              ? presentationCatalog!.lightning2
              : presentationCatalog!.lightning1;
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
            mapAnchorOffset = rendered.anchorOffset;
          }
        } else if (special.phase === "iceExpansion") {
          const icePresentation = special.result.actionId === "ice-4"
            ? presentationCatalog!.ice4
            : special.result.actionId === "ice-3"
              ? presentationCatalog!.ice3
              : special.result.actionId === "ice-2"
                ? presentationCatalog!.ice2
                : presentationCatalog!.ice1;
          const iceFrame = iceFrameAtGlobalIndex(icePresentation, special.frame);
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
            for (const affected of special.result.affectedUnits.filter(({ blocked }) => !blocked)) {
              this.combatEffects.push(
                this.add.image(
                  affected.positionBefore.x * TILE_WIDTH + TILE_WIDTH / 2,
                  affected.positionBefore.y * TILE_HEIGHT + TILE_HEIGHT / 2,
                  `map-recovery-1-${sourceFrame}`,
                ).setOrigin(.5).setDepth(8),
              );
            }
          }
        } else if (special.phase === "statusEffect" && special.result.actionId === "attack-up") {
          const attackUp = presentationCatalog!.attackUp;
          const phase = attackUp.phases[0];
          const runtimeTileCodes = phase.runtimeTileCodePairs[special.frame] ?? [];
          runtimeTileCodes.forEach((runtimeTileCode, row) => {
            this.combatEffects.push(
              this.add.image(
                center.x * TILE_WIDTH,
                (center.y + phase.descriptor.yOffset + row) * TILE_HEIGHT,
                `map-attack-up-${runtimeTileCode - 1}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "statusEffect" && special.result.actionId === "defense-up") {
          const phase = presentationCatalog!.defenseUp.phases[0];
          const descriptor = phase.descriptorSequence[special.frame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.combatEffects.push(
              this.add.image(
                (center.x + descriptor.xOffset + column) * TILE_WIDTH,
                (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
                `map-defense-up-${sourceFrame}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "statusEffect" && special.result.actionId === "magic-guard") {
          const phase = presentationCatalog!.magicGuard.phases[0];
          const runtimeTileCodes = phase.runtimeTileCodePairs[special.frame] ?? [];
          runtimeTileCodes.forEach((runtimeTileCode, row) => {
            this.combatEffects.push(
              this.add.image(
                center.x * TILE_WIDTH,
                (center.y + phase.descriptor.yOffset + row) * TILE_HEIGHT,
                `map-magic-guard-${runtimeTileCode - 1}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "statusEffect" && special.result.actionId === "confusion") {
          const phase = presentationCatalog!.confusion.phases[0];
          const descriptor = phase.descriptorSequence[special.frame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.combatEffects.push(
              this.add.image(
                (center.x + descriptor.xOffset + column) * TILE_WIDTH,
                (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
                `map-confusion-${sourceFrame}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "statusEffect" && special.result.actionId === "attack-down") {
          const phase = presentationCatalog!.attackDown.phases[0];
          const descriptor = phase.descriptorSequence[special.frame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.combatEffects.push(
              this.add.image(
                (center.x + descriptor.xOffset + column) * TILE_WIDTH,
                (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
                `map-attack-down-${sourceFrame}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "statusEffect" && special.result.actionId === "defense-down") {
          const phase = presentationCatalog!.defenseDown.phases[0];
          const descriptor = phase.descriptorSequence[special.frame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.combatEffects.push(
              this.add.image(
                (center.x + descriptor.xOffset + column) * TILE_WIDTH,
                (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
                `map-defense-down-${sourceFrame}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "statusEffect" && special.result.actionId === "spell-seal") {
          const phase = presentationCatalog!.spellSeal.phases[0];
          const descriptor = phase.descriptorSequence[special.frame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            if (sourceFrame === null) return;
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.combatEffects.push(
              this.add.image(
                (center.x + descriptor.xOffset + column) * TILE_WIDTH,
                (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
                `map-spell-seal-${sourceFrame}`,
              ).setOrigin(0).setDepth(8),
            );
          });
        } else if (special.phase === "poisonEffect") {
          const poison = presentationCatalog!.poison;
          const rise = poison.phases[0];
          if (special.frame < rise.runtimeTileCodeStates.length) {
            const runtimeTileCodes = rise.runtimeTileCodeStates[special.frame] ?? [];
            runtimeTileCodes.forEach((runtimeTileCode, index) => {
              const column = index % rise.descriptor.width;
              const row = Math.floor(index / rise.descriptor.width);
              this.combatEffects.push(
                this.add.image(
                  (center.x + rise.descriptor.xOffset + column) * TILE_WIDTH,
                  (center.y + rise.descriptor.yOffset + row) * TILE_HEIGHT,
                  `map-poison-rise-${runtimeTileCode - 1}`,
                ).setOrigin(0).setDepth(8),
              );
            });
          } else {
            const cloud = poison.phases[1];
            const descriptor = cloud.descriptorSequence[
              special.frame - rise.runtimeTileCodeStates.length
            ];
            descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
              const column = index % descriptor.width;
              const row = Math.floor(index / descriptor.width);
              this.combatEffects.push(
                this.add.image(
                  (center.x + descriptor.xOffset + column) * TILE_WIDTH,
                  (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
                  `map-poison-cloud-${sourceFrame}`,
                ).setOrigin(0).setDepth(8),
              );
            });
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
        } else if (special.phase === "prayerEffect") {
          const affected = special.result.affectedUnits.find(
            ({ unitId }) => unitId === special.lifeChangeUnitId,
          );
          if (affected?.prayerOutcome) {
            this.combatEffects.push(...renderPrayerPresentation(
              this,
              affected.prayerOutcome,
              affected.prayerRolledAmount,
            ));
          }
        } else if (special.phase === "stompEffect" || special.phase === "stompPageToggle") {
          const stomp = special.result.actionId === "stomp-3"
            ? presentationCatalog!.stomp3
            : special.result.actionId === "stomp-2"
              ? presentationCatalog!.stomp2
              : presentationCatalog!.stomp1;
          const step = buildStompPresentationSteps(stomp.presentation)[special.frame];
          const targetSide = target?.side ?? (special.actor.side === 1 ? 2 : 1);
          const resourceSide = targetSide === 1 ? "side1" : "side2";
          if (step) {
            const addFixedStompFrame = (y: number, sourceFrame: number): void => {
              this.combatEffects.push(
                this.add.image(
                  stomp.action.horizontalDrawCoordinate - this.cameras.main.x,
                  y - this.cameras.main.y,
                  `map-${special.result.actionId}-${resourceSide}-${sourceFrame}`,
                ).setOrigin(0).setScrollFactor(0).setDepth(8),
              );
            };
            addFixedStompFrame(step.y, 0);
            addFixedStompFrame(175, 1);
          }
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
          canvas.dataset.mapCombatEffectTextureKeys = this.combatEffects.flatMap((effect) =>
            effect instanceof Phaser.GameObjects.Image ? [effect.texture.key] : []).join(",");
          if (special.phase === "prayerEffect") {
            const prayer = special.result.affectedUnits.find(
              ({ unitId }) => unitId === special.lifeChangeUnitId,
            );
            canvas.dataset.mapCombatPrayerOutcome = prayer?.prayerOutcome ?? "";
            canvas.dataset.mapCombatPrayerRolledAmount = String(prayer?.prayerRolledAmount ?? "");
          } else {
            delete canvas.dataset.mapCombatPrayerOutcome;
            delete canvas.dataset.mapCombatPrayerRolledAmount;
          }
          if (special.lifeChangeUnitId) {
            canvas.dataset.mapCombatLifeChangeUnit = special.lifeChangeUnitId;
            canvas.dataset.mapCombatDisplayedLife = String(
              special.displayedLifeByUnitId[special.lifeChangeUnitId],
            );
          } else {
            delete canvas.dataset.mapCombatLifeChangeUnit;
            delete canvas.dataset.mapCombatDisplayedLife;
          }
          if (mapAnchorOffset) {
            canvas.dataset.mapCombatAnchorOffset =
              `${mapAnchorOffset.x},${mapAnchorOffset.y}`;
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
          if (special.phase === "stompEffect" || special.phase === "stompPageToggle") {
            const stomp = special.result.actionId === "stomp-3"
              ? presentationCatalog!.stomp3
              : special.result.actionId === "stomp-2"
                ? presentationCatalog!.stomp2
                : presentationCatalog!.stomp1;
            const stompStep = buildStompPresentationSteps(stomp.presentation)[special.frame];
            const stompTargetSide = target?.side ?? (special.actor.side === 1 ? 2 : 1);
            canvas.dataset.mapCombatStompPhase = stompStep?.phase ?? "";
            canvas.dataset.mapCombatStompY = stompStep ? String(stompStep.y) : "";
            canvas.dataset.mapCombatStompExplicitTicks = stompStep
              ? String(stompStep.explicitNativeTicks)
              : "";
            canvas.dataset.mapCombatStompAction = special.result.actionId;
            canvas.dataset.mapCombatStompX = String(stomp.action.horizontalDrawCoordinate);
            canvas.dataset.mapCombatStompResource = stompTargetSide === 1
              ? stomp.action.graphicByTargetSide.side1
              : stomp.action.graphicByTargetSide.side2;
          } else {
            delete canvas.dataset.mapCombatStompPhase;
            delete canvas.dataset.mapCombatStompY;
            delete canvas.dataset.mapCombatStompExplicitTicks;
            delete canvas.dataset.mapCombatStompAction;
            delete canvas.dataset.mapCombatStompX;
            delete canvas.dataset.mapCombatStompResource;
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
          delete canvas.dataset.mapCombatPrayerOutcome;
          delete canvas.dataset.mapCombatPrayerRolledAmount;
          delete canvas.dataset.mapCombatStompPhase;
          delete canvas.dataset.mapCombatStompY;
          delete canvas.dataset.mapCombatStompExplicitTicks;
          delete canvas.dataset.mapCombatStompAction;
          delete canvas.dataset.mapCombatStompX;
          delete canvas.dataset.mapCombatStompResource;
          delete canvas.dataset.routePulseDraw;
          delete canvas.dataset.routePulseNativeTicks;
          delete canvas.dataset.routePulseVisible;
          delete canvas.dataset.routePulseVisibleUnitIds;
          canvas.dataset.mapCombatEffectTileCount = "0";
          delete canvas.dataset.mapCombatEffectTextureKeys;
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
        || controller.routePulsePresentation
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
