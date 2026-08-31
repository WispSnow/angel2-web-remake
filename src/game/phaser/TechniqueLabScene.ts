import * as Phaser from "phaser";
import { bindPhaserProgramPause } from "./program-pause";
import { STAGE0_ACTION_PRESENTATION_ASSETS } from "../content/stage0-actions.generated";
import {
  STAGE1_ACTION_PRESENTATION,
  STAGE1_ACTION_PRESENTATION_ASSETS,
} from "../content/stage1-actions.generated";
import {
  TECHNIQUE_LAB_ATTACK_UP,
  TECHNIQUE_LAB_DEFENSE_UP,
  TECHNIQUE_LAB_MAGIC_GUARD,
  TECHNIQUE_LAB_POISON,
  TECHNIQUE_LAB_CONFUSION,
  TECHNIQUE_LAB_ATTACK_DOWN,
  TECHNIQUE_LAB_DEFENSE_DOWN,
  TECHNIQUE_LAB_SPELL_SEAL,
  TECHNIQUE_LAB_DISPEL,
  TECHNIQUE_LAB_FIRE,
  TECHNIQUE_LAB_HEAL,
  TECHNIQUE_LAB_IRON_PLATE,
  TECHNIQUE_LAB_LIGHTNING,
  TECHNIQUE_LAB_OBSTACLE,
  TECHNIQUE_LAB_STOMPS,
  TECHNIQUE_LAB_UNIT_ASSETS,
} from "../content/technique-lab.generated";
import { TECHNIQUE_LAB_FORMAL_GRAPHIC_ASSETS } from "../content/technique-lab-formal-assets";
import type { LightningPresentationFrame } from "../map-technique-presentation";
import {
  TECHNIQUE_LAB_MAP,
  type TechniqueLabSession,
  type TechniqueLabState,
} from "../technique-lab-session";
import {
  mapTechniqueTextureKey,
  renderLightningFrame,
  type MapTechniqueGraphicAssets,
} from "./MapTechniqueRenderer";
import {
  addMapActionImageFromSource,
  collectMapActionSources,
  mapActionAtlasFrame,
  mapActionDebugTextureKey,
  preloadMapActionAtlases,
} from "./map-action-atlas";
import type { StompPresentationStep } from "../stomp-presentation";
import { renderPrayerPresentation } from "./PrayerRenderer";
import type { PrayerOutcomeKind } from "../simulation/actions/types";

const TILE_WIDTH = 40;
const TILE_HEIGHT = 44;
const WIDTH = TECHNIQUE_LAB_MAP.width * TILE_WIDTH;
const HEIGHT = TECHNIQUE_LAB_MAP.height * TILE_HEIGHT;

const techniqueLabGraphicAssets: MapTechniqueGraphicAssets =
  TECHNIQUE_LAB_FORMAL_GRAPHIC_ASSETS;

const techniqueLabLightningAssets: Readonly<
  Record<keyof typeof TECHNIQUE_LAB_LIGHTNING, MapTechniqueGraphicAssets>
> = {
  "1L": {
    "MAGIC/8": STAGE1_ACTION_PRESENTATION_ASSETS.lightning1.main,
    "MAGIC/31": STAGE1_ACTION_PRESENTATION_ASSETS.lightning1.hit,
    "MAGIC/6": STAGE1_ACTION_PRESENTATION_ASSETS.lightning1.cleanup,
  },
  "2L": {
    "MAGIC/47": STAGE1_ACTION_PRESENTATION_ASSETS.lightning2.primary,
    "MAGIC/48": STAGE1_ACTION_PRESENTATION_ASSETS.lightning2.column,
    "MAGIC/24": STAGE1_ACTION_PRESENTATION_ASSETS.lightning2.hit,
    "MAGIC/6": STAGE1_ACTION_PRESENTATION_ASSETS.lightning2.cleanup,
  },
  "3L": {
    "MAGIC/3": STAGE1_ACTION_PRESENTATION_ASSETS.lightning3.cloud,
    "MAGIC/4": STAGE1_ACTION_PRESENTATION_ASSETS.lightning3.column,
    "MAGIC/25": STAGE1_ACTION_PRESENTATION_ASSETS.lightning3.hit,
    "MAGIC/6": STAGE1_ACTION_PRESENTATION_ASSETS.lightning3.cleanup,
  },
  "4L": {
    "MAGIC/39": STAGE1_ACTION_PRESENTATION_ASSETS.lightning4.primary,
    "MAGIC/40": STAGE1_ACTION_PRESENTATION_ASSETS.lightning4.column,
    "MAGIC/26": STAGE1_ACTION_PRESENTATION_ASSETS.lightning4.hit,
    "MAGIC/6": STAGE1_ACTION_PRESENTATION_ASSETS.lightning4.cleanup,
  },
};

function mapActionSource(resource: string, frame: number): string {
  const source = techniqueLabGraphicAssets[resource]?.[frame];
  if (!source) throw new Error(`missing map-action atlas source ${resource}/${frame}`);
  return source;
}

function addMapTechniqueImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  resource: string,
  frame: number,
): Phaser.GameObjects.Image {
  return addMapActionImageFromSource(
    scene,
    x,
    y,
    mapActionSource(resource, frame),
    mapTechniqueTextureKey(resource, frame),
  );
}

export type TechniqueLabVisualFrame =
  | { readonly kind: "none" }
  | { readonly kind: "lightning"; readonly frame: LightningPresentationFrame }
  | { readonly kind: "poison"; readonly phase: 0 | 1; readonly frame: number }
  | {
    readonly kind: "prayer";
    readonly outcome: PrayerOutcomeKind;
    readonly rolledAmount?: number;
    readonly unitId: string;
  }
  | { readonly kind: "fire"; readonly frame: number }
  | { readonly kind: "heal-primary"; readonly frame: number }
  | { readonly kind: "heal-tail"; readonly frame: number }
  | { readonly kind: "recovery"; readonly frame: number }
  | {
    readonly kind: "status";
    readonly action: "attack-up" | "defense-up" | "magic-guard" | "confusion" | "attack-down" | "defense-down" | "spell-seal";
    readonly frame: number;
  }
  | { readonly kind: "dispel"; readonly frame: number; readonly runtimeTileCodes: readonly number[] }
  | { readonly kind: "stomp"; readonly step: StompPresentationStep }
  | { readonly kind: "construction"; readonly completed: boolean }
  | {
    readonly kind: "ice";
    readonly frame: number;
    readonly rangeValue: number;
    readonly distanceFromCenter: number;
  };

export interface TechniqueLabSceneHandle {
  readonly game: Phaser.Game;
  setVisualFrame(frame: TechniqueLabVisualFrame): void;
  setFrozenUnitIds(unitIds: readonly string[]): void;
}

export function startTechniqueLabPhaser(
  session: TechniqueLabSession,
  parent: HTMLElement,
): TechniqueLabSceneHandle {
  let sceneInstance: TechniqueLabScene | undefined;
  let pendingFrame: TechniqueLabVisualFrame = { kind: "none" };
  let pendingFrozenUnitIds: readonly string[] = [];

  class TechniqueLabScene extends Phaser.Scene {
    private state!: TechniqueLabState;
    private unsubscribe?: () => void;
    private unitObjects: Phaser.GameObjects.GameObject[] = [];
    private frozenObjects: Phaser.GameObjects.Image[] = [];
    private effectObjects: Phaser.GameObjects.GameObject[] = [];
    private overlay!: Phaser.GameObjects.Graphics;

    constructor() {
      super("technique-lab");
    }

    preload(): void {
      this.load.image("technique-lab-map", "/assets/original/stage1-map.png");
      this.load.image("technique-lab-iron-plate", TECHNIQUE_LAB_IRON_PLATE.tile);
      this.load.image("technique-lab-obstacle", TECHNIQUE_LAB_OBSTACLE.tile);
      for (const [classId, assets] of Object.entries(TECHNIQUE_LAB_UNIT_ASSETS)) {
        if (assets.ally) this.load.image(`technique-lab-ally-${classId}`, assets.ally);
        this.load.image(`technique-lab-enemy-${classId}`, assets.enemy);
      }
      const mapActionSources = [
        ...collectMapActionSources(techniqueLabGraphicAssets),
        ...collectMapActionSources(STAGE0_ACTION_PRESENTATION_ASSETS),
        ...collectMapActionSources(STAGE1_ACTION_PRESENTATION_ASSETS),
      ];
      preloadMapActionAtlases(this, mapActionSources);
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
      for (const object of this.unitObjects) {
        (object as Phaser.GameObjects.Image).setVisible(true);
      }
      if (!this.state || frame.kind === "none") {
        this.updateCanvasDataset(frame, 0);
        return;
      }
      const center = session.effectCenter();
      if (!center) {
        this.updateCanvasDataset(frame, 0);
        return;
      }
      let mapAnchorOffset: { readonly x: number; readonly y: number } | undefined;
      if (frame.kind === "lightning") {
        const actionCode = this.state.actionCode as keyof typeof TECHNIQUE_LAB_LIGHTNING;
        const definition = TECHNIQUE_LAB_LIGHTNING[actionCode];
        if (definition) {
          // Native `1000:6DE8` draws MAGIC/6 on the same cells the damage pass
          // scans: effect-range value non-zero and occupied by the target side.
          const hitPositions = session.affectedUnits().map(({ x, y }) => ({ x, y }));
          const rendered = renderLightningFrame(this, definition, frame.frame, {
            center,
            effectCells: session.effectCells(),
            wavePositions: hitPositions,
            cleanupPositions: hitPositions,
            assets: techniqueLabLightningAssets[actionCode],
          });
          this.effectObjects.push(...rendered.images);
          mapAnchorOffset = rendered.anchorOffset;
        }
      } else if (frame.kind === "fire") {
        const definition = TECHNIQUE_LAB_FIRE[
          this.state.actionCode as keyof typeof TECHNIQUE_LAB_FIRE
        ];
        let remaining = frame.frame;
        const phase = definition?.phases.find((candidate) => {
          if (remaining < candidate.descriptorSequence.length) return true;
          remaining -= candidate.descriptorSequence.length;
          return false;
        });
        const descriptor = phase?.descriptorSequence[remaining];
        if (!phase || !descriptor) return;
        const anchorOffset = "anchorOffsetSequence" in phase
          ? phase.anchorOffsetSequence[remaining] ?? { x: 0, y: 0 }
          : { x: 0, y: 0 };
        mapAnchorOffset = anchorOffset;
        descriptor.low7BitFrameIndices.forEach((sourceFrame, index) => {
          if (sourceFrame === null) return;
          const column = index % descriptor.width;
          const row = Math.floor(index / descriptor.width);
          this.effectObjects.push(addMapTechniqueImage(this,
            (center.x + anchorOffset.x + descriptor.xOffset + column) * TILE_WIDTH,
            (center.y + anchorOffset.y + descriptor.yOffset + row) * TILE_HEIGHT,
            phase.resource,
            sourceFrame,
          ).setOrigin(0).setDepth(8));
        });
      } else if (frame.kind === "heal-primary"
        && (this.state.actionCode === "2H" || this.state.actionCode === "3H")) {
        const definition = TECHNIQUE_LAB_HEAL[this.state.actionCode];
        let phaseFrame = frame.frame;
        const phase = definition.phases.slice(0, -1).find((candidate) => {
          if (phaseFrame < candidate.descriptorSequence.length) return true;
          phaseFrame -= candidate.descriptorSequence.length;
          return false;
        });
        const descriptor = phase?.descriptorSequence[phaseFrame];
        descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
          if (sourceFrame === null || !phase) return;
          const column = index % descriptor.width;
          const row = Math.floor(index / descriptor.width);
          this.effectObjects.push(addMapTechniqueImage(this,
            (center.x + descriptor.xOffset + column) * TILE_WIDTH,
            (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
            phase.resource,
            sourceFrame,
          ).setOrigin(0).setDepth(8));
        });
      } else if (frame.kind === "heal-primary" || frame.kind === "heal-tail") {
        this.effectObjects.push(addMapActionImageFromSource(this,
          center.x * TILE_WIDTH + TILE_WIDTH / 2,
          center.y * TILE_HEIGHT + TILE_HEIGHT,
          frame.kind === "heal-primary"
            ? STAGE0_ACTION_PRESENTATION_ASSETS.heal1.primary[frame.frame]
            : STAGE0_ACTION_PRESENTATION_ASSETS.heal1.tail[frame.frame],
        ).setOrigin(.5, 1).setDepth(8));
      } else if (frame.kind === "recovery") {
        const recovery = this.state.actionCode === "3I"
          ? STAGE1_ACTION_PRESENTATION.recovery3
          : this.state.actionCode === "2I"
            ? STAGE1_ACTION_PRESENTATION.recovery2
            : STAGE1_ACTION_PRESENTATION.recovery1;
        const descriptor = recovery.presentation
          .descriptorSequence[frame.frame];
        const sourceFrame = descriptor?.low7BitFrameIndices[0];
        if (sourceFrame !== null && sourceFrame !== undefined) {
          const frozenIds = new Set(pendingFrozenUnitIds);
          for (const unit of session.affectedUnits().filter(({ id }) => !frozenIds.has(id))) {
            this.effectObjects.push(addMapActionImageFromSource(this,
              unit.x * TILE_WIDTH + TILE_WIDTH / 2,
              unit.y * TILE_HEIGHT + TILE_HEIGHT / 2,
              STAGE1_ACTION_PRESENTATION_ASSETS.recovery1.effect[sourceFrame],
            ).setOrigin(.5).setDepth(8));
          }
        }
      } else if (frame.kind === "status") {
        if (frame.action === "confusion" || frame.action === "attack-down"
          || frame.action === "defense-down" || frame.action === "spell-seal") {
          const phase = frame.action === "attack-down"
            ? TECHNIQUE_LAB_ATTACK_DOWN.phases[0]
            : frame.action === "defense-down"
              ? TECHNIQUE_LAB_DEFENSE_DOWN.phases[0]
              : frame.action === "spell-seal"
                ? TECHNIQUE_LAB_SPELL_SEAL.phases[0]
              : TECHNIQUE_LAB_CONFUSION.phases[0];
          const descriptor = phase.descriptorSequence[frame.frame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            if (sourceFrame === null) return;
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.effectObjects.push(addMapTechniqueImage(this,
              (center.x + descriptor.xOffset + column) * TILE_WIDTH,
              (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
              phase.resource,
              sourceFrame,
            ).setOrigin(0).setDepth(8));
          });
        } else if (frame.action === "attack-up" || frame.action === "magic-guard") {
          const phase = frame.action === "magic-guard"
            ? TECHNIQUE_LAB_MAGIC_GUARD.phases[0]
            : TECHNIQUE_LAB_ATTACK_UP.phases[0];
          const runtimeTileCodes = phase.runtimeTileCodePairs[frame.frame] ?? [];
          runtimeTileCodes.forEach((runtimeTileCode, row) => {
            this.effectObjects.push(addMapTechniqueImage(this,
              center.x * TILE_WIDTH,
              (center.y + phase.descriptor.yOffset + row) * TILE_HEIGHT,
              phase.resource,
              runtimeTileCode - 1,
            ).setOrigin(0).setDepth(8));
          });
        } else {
          const phase = TECHNIQUE_LAB_DEFENSE_UP.phases[0];
          const descriptor = phase.descriptorSequence[frame.frame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.effectObjects.push(addMapTechniqueImage(this,
              (center.x + descriptor.xOffset + column) * TILE_WIDTH,
              (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
              phase.resource,
              sourceFrame,
            ).setOrigin(0).setDepth(8));
          });
        }
      } else if (frame.kind === "poison") {
        const poisonPhase = TECHNIQUE_LAB_POISON.phases[frame.phase];
        if (frame.phase === 0) {
          const runtimeTileCodes = TECHNIQUE_LAB_POISON.phases[0]
            .runtimeTileCodeStates[frame.frame] ?? [];
          runtimeTileCodes.forEach((runtimeTileCode, index) => {
            const descriptor = TECHNIQUE_LAB_POISON.phases[0].descriptor;
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.effectObjects.push(addMapTechniqueImage(this,
              (center.x + descriptor.xOffset + column) * TILE_WIDTH,
              (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
              poisonPhase.resource,
              runtimeTileCode - 1,
            ).setOrigin(0).setDepth(8));
          });
        } else {
          const descriptor = TECHNIQUE_LAB_POISON.phases[1]
            .descriptorSequence[frame.frame];
          descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
            const column = index % descriptor.width;
            const row = Math.floor(index / descriptor.width);
            this.effectObjects.push(addMapTechniqueImage(this,
              (center.x + descriptor.xOffset + column) * TILE_WIDTH,
              (center.y + descriptor.yOffset + row) * TILE_HEIGHT,
              poisonPhase.resource,
              sourceFrame,
            ).setOrigin(0).setDepth(8));
          });
        }
      } else if (frame.kind === "prayer") {
        this.effectObjects.push(...renderPrayerPresentation(
          this,
          frame.outcome,
          frame.rolledAmount,
        ));
        const recipient = this.state.units.find(({ id }) => id === frame.unitId);
        if (recipient) {
          this.effectObjects.push(this.add.circle(
            recipient.x * TILE_WIDTH + TILE_WIDTH / 2,
            recipient.y * TILE_HEIGHT + TILE_HEIGHT / 2,
            19,
          ).setStrokeStyle(3, 0xffee67, 1).setDepth(8));
        }
      } else if (frame.kind === "dispel") {
        frame.runtimeTileCodes.forEach((runtimeTileCode, row) => {
          if (runtimeTileCode === 0) return;
          this.effectObjects.push(addMapTechniqueImage(this,
            center.x * TILE_WIDTH,
            (center.y + TECHNIQUE_LAB_DISPEL.dynamicPresentation.descriptor.yOffset + row)
              * TILE_HEIGHT,
            TECHNIQUE_LAB_DISPEL.dynamicPresentation.resource,
            runtimeTileCode - 1,
          ).setOrigin(0).setDepth(8));
        });
      } else if (frame.kind === "stomp") {
        const stomp = TECHNIQUE_LAB_STOMPS[
          session.state.actionCode as keyof typeof TECHNIQUE_LAB_STOMPS
        ];
        if (!stomp) throw new Error(`${session.state.actionCode} has no stomp presentation`);
        const targetSide = session.actor()?.side === 1 ? 2 : 1;
        const resource = targetSide === 1
          ? stomp.action.graphicByTargetSide.side1
          : stomp.action.graphicByTargetSide.side2;
        const targetGroundX = center.x * TILE_WIDTH + TILE_WIDTH / 2;
        const targetGroundY = center.y * TILE_HEIGHT + TILE_HEIGHT;
        const { targetImpactAnchor } = stomp.presentation;
        const drawX = targetGroundX
          + stomp.action.drawXCoordinate
          - targetImpactAnchor.x;
        this.effectObjects.push(
          addMapTechniqueImage(
            this,
            drawX,
            targetGroundY + frame.step.y - targetImpactAnchor.y,
            resource,
            0,
          ).setOrigin(0).setDepth(8),
          addMapTechniqueImage(
            this,
            drawX,
            targetGroundY + stomp.action.shadowDrawYCoordinate - targetImpactAnchor.y,
            resource,
            1,
          ).setOrigin(0).setDepth(8),
        );
      } else if (frame.kind === "construction") {
        if (frame.completed) {
          for (const { position } of session.effectCells()) {
            this.effectObjects.push(this.add.image(
              position.x * TILE_WIDTH,
              position.y * TILE_HEIGHT,
              session.state.actionCode === "2K"
                ? "technique-lab-obstacle"
                : "technique-lab-iron-plate",
            ).setOrigin(0).setDepth(2));
          }
          const actor = session.actor();
          if (actor) {
            for (const object of this.unitObjects) {
              if (object.getData("unitId") === actor.id) {
                (object as Phaser.GameObjects.Image).setVisible(false);
              }
            }
            this.effectObjects.push(
              this.add.image(
                center.x * TILE_WIDTH + TILE_WIDTH / 2,
                center.y * TILE_HEIGHT + TILE_HEIGHT,
                `technique-lab-${actor.side === 1 ? "ally" : "enemy"}-${actor.classId}`,
              ).setOrigin(.5, 1).setDepth(6),
              this.add.circle(
                center.x * TILE_WIDTH + 6,
                center.y * TILE_HEIGHT + 7,
                4,
                actor.side === 1 ? 0x56c7ee : 0xe76b70,
                .95,
              ).setStrokeStyle(1, 0x12090c, 1).setDepth(7),
            );
          }
        }
      } else {
        const sourceFrame = frame.frame % STAGE1_ACTION_PRESENTATION_ASSETS.ice1.expansion.length;
        for (const { position, value } of session.effectCells()) {
          if (value !== frame.rangeValue) continue;
          this.effectObjects.push(addMapActionImageFromSource(this,
            position.x * TILE_WIDTH + TILE_WIDTH / 2,
            position.y * TILE_HEIGHT + TILE_HEIGHT / 2,
            STAGE1_ACTION_PRESENTATION_ASSETS.ice1.expansion[sourceFrame],
          ).setOrigin(.5).setDepth(8));
        }
      }
      this.updateCanvasDataset(frame, this.effectObjects.length, mapAnchorOffset);
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
      const center = session.effectCenter();
      if (center) {
        this.overlay.lineStyle(2, 0xffe36b, .95);
        this.overlay.strokeRect(
          center.x * TILE_WIDTH + 2,
          center.y * TILE_HEIGHT + 2,
          TILE_WIDTH - 4,
          TILE_HEIGHT - 4,
        );
      }
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
        ).setOrigin(.5, 1).setDepth(6).setData("unitId", unit.id);
        const badge = this.add.circle(
          unit.x * TILE_WIDTH + 6,
          unit.y * TILE_HEIGHT + 7,
          4,
          unit.side === 1 ? 0x56c7ee : 0xe76b70,
          .95,
        ).setStrokeStyle(1, 0x12090c, 1).setDepth(7).setData("unitId", unit.id);
        this.unitObjects.push(sprite, badge);
      }
      this.drawFrozenUnits();
      this.drawVisualFrame(pendingFrame);
      this.game.canvas.dataset.unitCount = String(this.state.units.length);
      this.game.canvas.dataset.actorId = this.state.actorId ?? "";
      this.game.canvas.dataset.target = center ? `${center.x},${center.y}` : "";
    }

    drawFrozenUnits(): void {
      for (const object of this.frozenObjects) object.destroy();
      this.frozenObjects = [];
      if (!this.state) return;
      const frozenIds = new Set(pendingFrozenUnitIds);
      for (const unit of this.state.units) {
        if (!frozenIds.has(unit.id)) continue;
        this.frozenObjects.push(addMapActionImageFromSource(this,
          unit.x * TILE_WIDTH + TILE_WIDTH / 2,
          unit.y * TILE_HEIGHT + TILE_HEIGHT / 2,
          STAGE1_ACTION_PRESENTATION_ASSETS.ice1.expansion[5],
          mapTechniqueTextureKey("MAGIC/22", 5),
        ).setOrigin(.5).setDepth(9));
      }
      this.game.canvas.dataset.frozenUnitCount = String(this.frozenObjects.length);
      this.game.canvas.dataset.frozenUnitIds = this.state.units
        .filter(({ id }) => frozenIds.has(id))
        .map(({ id }) => id)
        .join(",");
    }

    private updateCanvasDataset(
      frame: TechniqueLabVisualFrame,
      count: number,
      mapAnchorOffset?: { readonly x: number; readonly y: number },
    ): void {
      const canvas = this.game.canvas;
      canvas.dataset.techniquePhase = frame.kind === "lightning"
        ? frame.frame.kind
        : frame.kind === "stomp"
          ? frame.step.phase
          : frame.kind;
      canvas.dataset.techniqueFrame = frame.kind === "lightning"
        ? frame.frame.kind === "main" ? String(frame.frame.globalDrawIndex) : String(frame.frame.frame)
        : "frame" in frame ? String(frame.frame) : "-1";
      canvas.dataset.effectTileCount = String(count);
      canvas.dataset.effectTextureKeys = this.effectObjects.flatMap((object) =>
        object instanceof Phaser.GameObjects.Image ? [mapActionDebugTextureKey(object)] : []).join(",");
      canvas.dataset.effectAtlasFrames = this.effectObjects.flatMap((object) => {
        if (!(object instanceof Phaser.GameObjects.Image)) return [];
        const atlasFrame = mapActionAtlasFrame(object);
        return atlasFrame ? [atlasFrame] : [];
      }).join(",");
      canvas.dataset.constructionTerrainCount = frame.kind === "construction" && frame.completed
        ? String(session.effectCells().length)
        : "0";
      canvas.dataset.constructionCompleted = frame.kind === "construction"
        ? String(frame.completed)
        : "false";
      canvas.dataset.mapCombatAnchorOffset = mapAnchorOffset
        ? `${mapAnchorOffset.x},${mapAnchorOffset.y}`
        : "";
      canvas.dataset.iceRangeValue = frame.kind === "ice" ? String(frame.rangeValue) : "";
      canvas.dataset.iceDistanceFromCenter = frame.kind === "ice"
        ? String(frame.distanceFromCenter)
        : "";
      canvas.dataset.prayerOutcome = frame.kind === "prayer" ? frame.outcome : "";
      canvas.dataset.prayerRolledAmount = frame.kind === "prayer"
        ? String(frame.rolledAmount ?? "")
        : "";
      canvas.dataset.prayerUnitId = frame.kind === "prayer" ? frame.unitId : "";
      canvas.dataset.stompX = frame.kind === "stomp"
        ? String(TECHNIQUE_LAB_STOMPS[
          session.state.actionCode as keyof typeof TECHNIQUE_LAB_STOMPS
        ].action.drawXCoordinate)
        : "";
      canvas.dataset.stompShadowY = frame.kind === "stomp"
        ? String(TECHNIQUE_LAB_STOMPS[
          session.state.actionCode as keyof typeof TECHNIQUE_LAB_STOMPS
        ].action.shadowDrawYCoordinate)
        : "";
      const stompCenter = frame.kind === "stomp" ? session.effectCenter() : undefined;
      const stompTargetScreenX = stompCenter
        ? stompCenter.x * TILE_WIDTH + TILE_WIDTH / 2 - this.cameras.main.scrollX
        : undefined;
      const stompTargetScreenY = stompCenter
        ? stompCenter.y * TILE_HEIGHT + TILE_HEIGHT - this.cameras.main.scrollY
        : undefined;
      canvas.dataset.stompTargetScreenX = String(stompTargetScreenX ?? "");
      canvas.dataset.stompTargetScreenY = String(stompTargetScreenY ?? "");
      canvas.dataset.stompImpactScreenX = String(stompTargetScreenX ?? "");
      canvas.dataset.stompImpactScreenY = String(stompTargetScreenY ?? "");
      canvas.dataset.stompY = frame.kind === "stomp" ? String(frame.step.y) : "";
      canvas.dataset.stompGraphicDraw = frame.kind === "stomp"
        ? String(frame.step.graphicDrawIndex ?? "")
        : "";
      canvas.dataset.stompExplicitTicks = frame.kind === "stomp"
        ? String(frame.step.explicitNativeTicks)
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
  bindPhaserProgramPause(game);

  return {
    game,
    setVisualFrame(frame): void {
      pendingFrame = frame;
      sceneInstance?.drawVisualFrame(frame);
    },
    setFrozenUnitIds(unitIds): void {
      pendingFrozenUnitIds = [...unitIds];
      sceneInstance?.drawFrozenUnits();
    },
  };
}
