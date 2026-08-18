import * as Phaser from "phaser";
import type {
  LightningPresentationDefinition,
  LightningPresentationFrame,
} from "../map-technique-presentation";
import { lightningWaveDistance } from "../map-technique-presentation";
import { addMapActionImageFromSource } from "./map-action-atlas";

const TILE_WIDTH = 40;
const TILE_HEIGHT = 44;

export type MapTechniqueGraphicAssets = Readonly<Record<string, readonly string[]>>;

export interface LightningRenderContext {
  readonly center: { readonly x: number; readonly y: number };
  readonly effectCells: readonly {
    readonly position: { readonly x: number; readonly y: number };
    readonly value: number;
  }[];
  readonly wavePositions: readonly { readonly x: number; readonly y: number }[];
  readonly cleanupPositions: readonly { readonly x: number; readonly y: number }[];
  /** Source paths resolve to atlas frames; renderers must not fall back to raw textures. */
  readonly assets: MapTechniqueGraphicAssets;
}

export interface LightningRenderResult {
  readonly images: readonly Phaser.GameObjects.Image[];
  readonly anchorOffset?: { readonly x: number; readonly y: number };
}

const resourceSlug = (resource: string): string => resource.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

export const mapTechniqueTextureKey = (resource: string, frame: number): string =>
  `map-technique-${resourceSlug(resource)}-${frame}`;

export function renderLightningFrame(
  scene: Phaser.Scene,
  definition: LightningPresentationDefinition,
  frame: LightningPresentationFrame,
  context: LightningRenderContext,
): LightningRenderResult {
  const images: Phaser.GameObjects.Image[] = [];
  const addFrame = (
    x: number,
    y: number,
    resource: string,
    sourceFrame: number,
  ): Phaser.GameObjects.Image => {
    const source = context.assets[resource]?.[sourceFrame];
    if (!source) throw new Error(`missing map-action atlas source ${resource}/${sourceFrame}`);
    const textureKey = mapTechniqueTextureKey(resource, sourceFrame);
    return addMapActionImageFromSource(scene, x, y, source, textureKey);
  };
  if (frame.kind === "main") {
    const phase = definition.phases[frame.phaseIndex];
    const descriptor = phase?.descriptorSequence[frame.drawIndex];
    const anchorOffset = phase?.anchorOffsetSequence?.[frame.drawIndex] ?? { x: 0, y: 0 };
    descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
      if (sourceFrame === null) return;
      const column = index % descriptor.width;
      const row = Math.floor(index / descriptor.width);
      images.push(
        addFrame(
          (context.center.x + anchorOffset.x + descriptor.xOffset + column) * TILE_WIDTH,
          (context.center.y + anchorOffset.y + descriptor.yOffset + row) * TILE_HEIGHT,
          phase.resource,
          sourceFrame,
        ).setOrigin(0).setDepth(8),
      );
    });
    return { images, anchorOffset };
  }

  if (frame.kind === "wave") {
    const hit = definition.commonHit;
    const drawAtCell = (
      position: { readonly x: number; readonly y: number },
      sourceFrame: number,
    ): void => {
      images.push(
        addFrame(
          position.x * TILE_WIDTH + TILE_WIDTH / 2,
          position.y * TILE_HEIGHT + TILE_HEIGHT / 2,
          hit.resource,
          sourceFrame,
        ).setOrigin(.5).setDepth(8),
      );
    };

    // Sweep layer (`0000:65A5`): every effect cell inside the band writes its own
    // `rangeValue - threshold` as the sprite code, so the burst starts at the
    // highest-value centre and radiates outward with each cell one draw behind
    // the last. Code 0 is "no sprite" and `0000:7EDD` renders frame `code - 1`.
    // Neither side nor occupancy is consulted.
    for (const { position, value } of context.effectCells) {
      if (value < 1) continue;
      const code = lightningWaveDistance(hit, frame.frame, value);
      if (code < 1 || code > hit.sweepWidth) continue;
      drawAtCell(position, code - 1);
    }

    // Marker layer (`1000:6E46`): the two per-tier frames alternate on top of the
    // sweep for enemy-occupied cells in the same band. 2L/3L/4L point at their
    // resource's dedicated "unit being electrocuted" frames; 1L, whose MAGIC/31
    // has no character art, reuses the two fullest spark frames. See REMAKE-049
    // for why the native band test never admitted this layer.
    const runtimeTileCode = hit.runtimeTileCodes[frame.frame % hit.runtimeTileCodes.length];
    const rangeValueByPosition = new Map(
      context.effectCells.map(({ position, value }) => [`${position.x},${position.y}`, value]),
    );
    for (const position of context.wavePositions) {
      const rangeValue = rangeValueByPosition.get(`${position.x},${position.y}`) ?? 0;
      const code = lightningWaveDistance(hit, frame.frame, rangeValue);
      if (runtimeTileCode === undefined || code < 0 || code > hit.sweepWidth) continue;
      drawAtCell(position, runtimeTileCode - 1);
    }
    return { images };
  }

  const descriptor = definition.commonHit.cleanup.descriptorSequence[frame.frame];
  const sourceFrame = descriptor?.low7BitFrameIndices[0];
  if (sourceFrame === null || sourceFrame === undefined) return { images };
  for (const position of context.cleanupPositions) {
    images.push(
      addFrame(
        position.x * TILE_WIDTH + TILE_WIDTH / 2,
        position.y * TILE_HEIGHT + TILE_HEIGHT / 2,
        definition.commonHit.cleanup.resource,
        sourceFrame,
      ).setOrigin(.5).setDepth(8),
    );
  }
  return { images };
}
