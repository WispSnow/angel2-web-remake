import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  BATTLE_SPRITE_ATLAS_FRAMES,
  BATTLE_SPRITE_ATLASES,
} from "../../src/game/content/battle-sprite-atlases.generated";
import { battleSpriteTextureRefFromSource } from "../../src/game/phaser/battle-sprite-atlas";
import { decodeRgbaPng } from "../../scripts/lib/png-atlas.mjs";

interface AtlasData {
  readonly frames: Readonly<Record<string, {
    readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
    readonly rotated: boolean;
    readonly trimmed: boolean;
  }>>;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicPath = (url: string): string => path.join(root, "public", url.replace(/^\//u, ""));

describe("generated battle-sprite atlases", () => {
  test("publish four bounded Phaser JSON Hash atlases for continuous battle effects", async () => {
    expect(BATTLE_SPRITE_ATLASES.map(({ id, frameCount }) => [id, frameCount])).toEqual([
      ["map-combat", 46],
      ["turn-transition", 9],
      ["stage4-force-field-pulse", 13],
      ["stage26-column-push", 41],
    ]);
    expect(Object.keys(BATTLE_SPRITE_ATLAS_FRAMES)).toHaveLength(109);
    expect(BATTLE_SPRITE_ATLASES.every(({ width, height }) => width <= 1024 && height <= 1024))
      .toBe(true);
    const files = (await readdir(path.join(root, "public/assets/original/battle-sprite-atlases")))
      .sort();
    expect(files).toEqual(BATTLE_SPRITE_ATLASES.flatMap(({ id }) => [
      `${id}.json`,
      `${id}.png`,
    ]).sort());
  });

  test("preserve all 109 source images pixel-for-pixel", async () => {
    const sourceByFrame = new Map(Object.entries(BATTLE_SPRITE_ATLAS_FRAMES).map(
      ([source, ref]) => [`${ref.atlas}:${ref.frame}`, source],
    ));
    let frameCount = 0;
    for (const atlas of BATTLE_SPRITE_ATLASES) {
      const [atlasPng, atlasJson] = await Promise.all([
        readFile(publicPath(atlas.image)),
        readFile(publicPath(atlas.data), "utf8"),
      ]);
      const image = decodeRgbaPng(atlasPng, atlas.image);
      const data = JSON.parse(atlasJson) as AtlasData;
      for (const [frameName, descriptor] of Object.entries(data.frames)) {
        frameCount += 1;
        const sourceUrl = sourceByFrame.get(`${atlas.id}:${frameName}`);
        if (!sourceUrl) throw new Error(`missing source for ${atlas.id}:${frameName}`);
        const sourcePath = publicPath(sourceUrl);
        const source = decodeRgbaPng(await readFile(sourcePath), sourcePath);
        const { x, y, w, h } = descriptor.frame;
        expect(descriptor).toMatchObject({ rotated: false, trimmed: false });
        expect([w, h]).toEqual([source.width, source.height]);
        for (let row = 0; row < source.height; row += 1) {
          const atlasStart = ((y + row) * image.width + x) * 4;
          const sourceStart = row * source.width * 4;
          expect(image.pixels.subarray(atlasStart, atlasStart + source.width * 4)
            .equals(source.pixels.subarray(sourceStart, sourceStart + source.width * 4)))
            .toBe(true);
        }
      }
    }
    expect(frameCount).toBe(109);
  });

  test("maps runtime source paths to stable Phaser texture and frame keys", () => {
    expect(battleSpriteTextureRefFromSource("/assets/original/map-combat/hit/00.png"))
      .toEqual({ texture: "battle-sprite-map-combat", frame: "map-combat/hit/00" });
    expect(battleSpriteTextureRefFromSource("/assets/original/stage26-column-push/phase2/10.png"))
      .toEqual({
        texture: "battle-sprite-stage26-column-push",
        frame: "stage26-column-push/phase2/10",
      });
  });
});
