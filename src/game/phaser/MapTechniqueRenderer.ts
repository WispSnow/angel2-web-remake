import * as Phaser from "phaser";
import type {
  LightningPresentationDefinition,
  LightningPresentationFrame,
} from "../map-technique-presentation";
import { lightningWaveDistance } from "../map-technique-presentation";

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
}

export interface LightningRenderResult {
  readonly images: readonly Phaser.GameObjects.Image[];
  readonly anchorOffset?: { readonly x: number; readonly y: number };
}

const resourceSlug = (resource: string): string => resource.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

export const mapTechniqueTextureKey = (resource: string, frame: number): string =>
  `map-technique-${resourceSlug(resource)}-${frame}`;

export function preloadMapTechniqueAssets(
  scene: Phaser.Scene,
  assets: MapTechniqueGraphicAssets,
): void {
  for (const [resource, frames] of Object.entries(assets)) {
    frames.forEach((source, frame) => {
      const key = mapTechniqueTextureKey(resource, frame);
      if (!scene.textures.exists(key)) scene.load.image(key, source);
    });
  }
}

export function renderLightningFrame(
  scene: Phaser.Scene,
  definition: LightningPresentationDefinition,
  frame: LightningPresentationFrame,
  context: LightningRenderContext,
): LightningRenderResult {
  const images: Phaser.GameObjects.Image[] = [];
  if (frame.kind === "main") {
    const phase = definition.phases[frame.phaseIndex];
    const descriptor = phase?.descriptorSequence[frame.drawIndex];
    const anchorOffset = phase?.anchorOffsetSequence?.[frame.drawIndex] ?? { x: 0, y: 0 };
    descriptor?.low7BitFrameIndices.forEach((sourceFrame, index) => {
      if (sourceFrame === null) return;
      const column = index % descriptor.width;
      const row = Math.floor(index / descriptor.width);
      images.push(
        scene.add.image(
          (context.center.x + anchorOffset.x + descriptor.xOffset + column) * TILE_WIDTH,
          (context.center.y + anchorOffset.y + descriptor.yOffset + row) * TILE_HEIGHT,
          mapTechniqueTextureKey(phase.resource, sourceFrame),
        ).setOrigin(0).setDepth(8),
      );
    });
    return { images, anchorOffset };
  }

  if (frame.kind === "wave") {
    const hit = definition.commonHit;
    const runtimeTileCode = hit.runtimeTileCodes[frame.frame % hit.runtimeTileCodes.length];
    const sourceFrame = runtimeTileCode === undefined ? undefined : runtimeTileCode - 1;
    const rangeValueByPosition = new Map(
      context.effectCells.map(({ position, value }) => [`${position.x},${position.y}`, value]),
    );
    for (const position of context.wavePositions) {
      const rangeValue = rangeValueByPosition.get(`${position.x},${position.y}`) ?? 0;
      const waveDistance = lightningWaveDistance(hit, frame.frame, rangeValue);
      if (sourceFrame === undefined || waveDistance < 0 || waveDistance > hit.sweepWidth) continue;
      images.push(
        scene.add.image(
          position.x * TILE_WIDTH + TILE_WIDTH / 2,
          position.y * TILE_HEIGHT + TILE_HEIGHT / 2,
          mapTechniqueTextureKey(hit.resource, sourceFrame),
        ).setOrigin(.5).setDepth(8),
      );
    }
    return { images };
  }

  const descriptor = definition.commonHit.cleanup.descriptorSequence[frame.frame];
  const sourceFrame = descriptor?.low7BitFrameIndices[0];
  if (sourceFrame === null || sourceFrame === undefined) return { images };
  for (const position of context.cleanupPositions) {
    images.push(
      scene.add.image(
        position.x * TILE_WIDTH + TILE_WIDTH / 2,
        position.y * TILE_HEIGHT + TILE_HEIGHT / 2,
        mapTechniqueTextureKey(definition.commonHit.cleanup.resource, sourceFrame),
      ).setOrigin(.5).setDepth(8),
    );
  }
  return { images };
}
