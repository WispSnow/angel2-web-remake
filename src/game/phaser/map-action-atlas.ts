import type * as Phaser from "phaser";
import {
  MAP_ACTION_ATLAS_IDS,
  MAP_ACTION_ATLASES,
} from "../content/map-action-atlases.generated";

const MAP_ACTION_PREFIX = "/assets/original/map-actions/";

export interface MapActionTextureRef {
  readonly texture: string;
  readonly frame: string;
}

type MapActionAtlasId = typeof MAP_ACTION_ATLAS_IDS[number];

const atlasById = new Map(
  MAP_ACTION_ATLASES.map((atlas) => [atlas.id, atlas]),
);

function paddedFrame(value: string): string {
  return value.padStart(2, "0");
}

function sourceForLegacyKey(key: string): string | undefined {
  let match = /^map-shoot-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}shoot/hit/${paddedFrame(match[1])}.png`;

  match = /^map-fire-([1-3])-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}fire-${match[1]}/${paddedFrame(match[2])}.png`;
  match = /^map-fire-4-(ground|column|finish)-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}fire-4/${match[1]}/${paddedFrame(match[2])}.png`;

  match = /^map-heal-1-(primary|tail)-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}heal-1/${match[1]}/${paddedFrame(match[2])}.png`;
  match = /^map-heal-2-primary-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}heal-2/primary/${paddedFrame(match[1])}.png`;
  match = /^map-heal-3-(outer|loop)-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}heal-3/${match[1]}/${paddedFrame(match[2])}.png`;

  match = /^map-ice-1-expansion-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}ice-1/expansion/${paddedFrame(match[1])}.png`;
  match = /^map-recovery-1-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}recovery-1/effect/${paddedFrame(match[1])}.png`;

  match = /^map-(attack-up|defense-up|magic-guard|confusion|attack-down|defense-down|spell-seal|dispel)-(\d+)$/u.exec(key);
  if (match) {
    const directory = match[1] === "magic-guard" ? "attack-up" : match[1];
    return `${MAP_ACTION_PREFIX}${directory}/effect/${paddedFrame(match[2])}.png`;
  }
  match = /^map-poison-(rise|cloud)-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}poison/${match[1]}/${paddedFrame(match[2])}.png`;

  match = /^map-stomp-([1-3])-(side1|side2)-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}stomp-${match[1]}/side-${match[2].slice(-1)}/${paddedFrame(match[3])}.png`;
  match = /^map-wd-(\d+)$/u.exec(key);
  if (match) return `${MAP_ACTION_PREFIX}wd/effect/${paddedFrame(match[1])}.png`;
  return undefined;
}

export function mapActionAtlasIdForAction(actionId: string): string {
  if (actionId.startsWith("ice-")) return "ice-1";
  if (actionId.startsWith("recovery-")) return "recovery-1";
  if (actionId === "magic-guard") return "attack-up";
  return actionId;
}

export function collectMapActionSources(value: unknown): string[] {
  const output: string[] = [];
  const visit = (entry: unknown): void => {
    if (typeof entry === "string") {
      if (entry.startsWith(MAP_ACTION_PREFIX)) output.push(entry);
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (entry && typeof entry === "object") Object.values(entry).forEach(visit);
  };
  visit(value);
  return output;
}

export function mapActionTextureRefFromSource(source: string): MapActionTextureRef | undefined {
  if (!source.startsWith(MAP_ACTION_PREFIX)) return undefined;
  const relative = source.slice(MAP_ACTION_PREFIX.length);
  const separator = relative.indexOf("/");
  if (separator < 1 || !relative.endsWith(".png")) return undefined;
  const id = relative.slice(0, separator) as MapActionAtlasId;
  const atlas = atlasById.get(id);
  if (!atlas) return undefined;
  const framePath = relative.slice(separator + 1, -4).replaceAll("/", "__");
  return {
    texture: atlas.textureKey,
    frame: `${id}__${framePath}`,
  };
}

export function mapActionTextureRefFromLegacyKey(key: string): MapActionTextureRef {
  const source = sourceForLegacyKey(key);
  if (!source) throw new Error(`unknown map action texture key ${key}`);
  const ref = mapActionTextureRefFromSource(source);
  if (!ref) throw new Error(`map action texture key ${key} has no atlas frame`);
  return ref;
}

export function preloadMapActionAtlases(
  scene: Phaser.Scene,
  sources: readonly string[],
): void {
  const textureKeys = new Set<string>();
  for (const source of sources) {
    const ref = mapActionTextureRefFromSource(source);
    if (!ref || textureKeys.has(ref.texture)) continue;
    textureKeys.add(ref.texture);
    const atlas = MAP_ACTION_ATLASES.find((candidate) => candidate.textureKey === ref.texture);
    if (!atlas) throw new Error(`missing map action atlas for ${source}`);
    if (!scene.textures.exists(atlas.textureKey)) {
      scene.load.atlas(atlas.textureKey, atlas.image, atlas.data);
    }
  }
}

export function addMapActionImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  legacyKey: string,
): Phaser.GameObjects.Image {
  const ref = mapActionTextureRefFromLegacyKey(legacyKey);
  const image = scene.add.image(x, y, ref.texture, ref.frame);
  image.setData("mapActionTextureKey", legacyKey);
  return image;
}

export function addMapActionImageFromSource(
  scene: Phaser.Scene,
  x: number,
  y: number,
  source: string,
  debugTextureKey?: string,
): Phaser.GameObjects.Image {
  const ref = mapActionTextureRefFromSource(source);
  if (!ref) throw new Error(`cannot atlas non-map-action image ${source}`);
  const image = scene.add.image(x, y, ref.texture, ref.frame);
  image.setData("mapActionTextureSource", source);
  if (debugTextureKey) image.setData("mapActionTextureKey", debugTextureKey);
  return image;
}

export function mapActionDebugTextureKey(image: Phaser.GameObjects.Image): string {
  const debugTextureKey = image.getData("mapActionTextureKey") as unknown;
  return typeof debugTextureKey === "string" ? debugTextureKey : image.texture.key;
}
