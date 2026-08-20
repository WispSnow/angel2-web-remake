import type * as Phaser from "phaser";
import {
  BATTLE_SPRITE_ATLAS_FRAMES,
  BATTLE_SPRITE_ATLASES,
} from "../content/battle-sprite-atlases.generated";

export interface BattleSpriteTextureRef {
  readonly texture: string;
  readonly frame: string;
}

const atlasById = new Map(BATTLE_SPRITE_ATLASES.map((atlas) => [atlas.id, atlas]));

export function battleSpriteTextureRefFromSource(source: string): BattleSpriteTextureRef {
  if (!(source in BATTLE_SPRITE_ATLAS_FRAMES)) {
    throw new Error(`No battle-sprite atlas frame for ${source}`);
  }
  const frame = BATTLE_SPRITE_ATLAS_FRAMES[
    source as keyof typeof BATTLE_SPRITE_ATLAS_FRAMES
  ];
  const atlas = atlasById.get(frame.atlas);
  if (!atlas) throw new Error(`Missing battle-sprite atlas ${frame.atlas}`);
  return { texture: atlas.textureKey, frame: frame.frame };
}

export function preloadBattleSpriteAtlases(
  scene: Phaser.Scene,
  sources: readonly string[],
): void {
  const textureKeys = new Set<string>();
  for (const source of sources) {
    const ref = battleSpriteTextureRefFromSource(source);
    if (textureKeys.has(ref.texture)) continue;
    textureKeys.add(ref.texture);
    const atlas = BATTLE_SPRITE_ATLASES.find(({ textureKey }) => textureKey === ref.texture);
    if (!atlas) throw new Error(`Missing battle-sprite atlas for ${source}`);
    if (!scene.textures.exists(atlas.textureKey)) {
      scene.load.atlas(atlas.textureKey, atlas.image, atlas.data);
    }
  }
}

export function addBattleSpriteImageFromSource(
  scene: Phaser.Scene,
  x: number,
  y: number,
  source: string,
  debugTextureKey: string,
): Phaser.GameObjects.Image {
  const ref = battleSpriteTextureRefFromSource(source);
  const image = scene.add.image(x, y, ref.texture, ref.frame);
  // Existing Canvas diagnostics report semantic renderer keys rather than the
  // physical texture atlas. mapActionDebugTextureKey reads this shared field.
  image.setData("mapActionTextureKey", debugTextureKey);
  image.setData("battleSpriteTextureSource", source);
  return image;
}
