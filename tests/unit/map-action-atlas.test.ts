import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  MAP_ACTION_ATLAS_IDS,
  MAP_ACTION_ATLASES,
} from "../../src/game/content/map-action-atlases.generated";
import { TECHNIQUE_LAB_GRAPHIC_ASSETS } from "../../src/game/content/technique-lab.generated";
import {
  mapActionAtlasIdForAction,
  mapActionTextureRefFromLegacyKey,
  mapActionTextureRefFromSource,
} from "../../src/game/phaser/map-action-atlas";
import { decodeRgbaPng } from "../../scripts/lib/png-atlas.mjs";

interface AtlasFrame {
  readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly rotated: boolean;
  readonly trimmed: boolean;
  readonly spriteSourceSize: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  readonly sourceSize: { readonly w: number; readonly h: number };
}

interface AtlasData {
  readonly frames: Readonly<Record<string, AtlasFrame>>;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicPath = (url: string): string => path.join(root, "public", url.replace(/^\//u, ""));

function sourcePathForFrame(atlasId: string, frameName: string): string {
  const prefix = `${atlasId}__`;
  if (!frameName.startsWith(prefix)) throw new Error(`unexpected ${atlasId} frame ${frameName}`);
  const relative = frameName.slice(prefix.length).replaceAll("__", "/");
  return path.join(root, "public/assets/original/map-actions", atlasId, `${relative}.png`);
}

describe("generated map-action atlases", () => {
  test("publish exactly one PNG and Phaser JSON file for every action family", async () => {
    expect(MAP_ACTION_ATLAS_IDS).toHaveLength(26);
    expect(MAP_ACTION_ATLASES.map(({ id }) => id)).toEqual([...MAP_ACTION_ATLAS_IDS]);

    const outputDirectory = path.join(root, "public/assets/original/map-action-atlases");
    const files = (await readdir(outputDirectory)).sort();
    const expected = MAP_ACTION_ATLAS_IDS
      .flatMap((id) => [`${id}.json`, `${id}.png`])
      .sort();
    expect(files).toEqual(expected);
  });

  test("preserve all 1,029 source frames pixel-for-pixel without trimming or rotation", async () => {
    let frameCount = 0;
    for (const atlas of MAP_ACTION_ATLASES) {
      const [atlasPng, atlasJson] = await Promise.all([
        readFile(publicPath(atlas.image)),
        readFile(publicPath(atlas.data), "utf8"),
      ]);
      const image = decodeRgbaPng(atlasPng, atlas.image);
      const data = JSON.parse(atlasJson) as AtlasData;

      for (const [frameName, descriptor] of Object.entries(data.frames)) {
        frameCount += 1;
        const sourcePath = sourcePathForFrame(atlas.id, frameName);
        const source = decodeRgbaPng(await readFile(sourcePath), sourcePath);
        const { x, y, w, h } = descriptor.frame;

        expect(x, `${frameName} x`).toBeGreaterThanOrEqual(0);
        expect(y, `${frameName} y`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${frameName} right edge`).toBeLessThanOrEqual(image.width);
        expect(y + h, `${frameName} bottom edge`).toBeLessThanOrEqual(image.height);
        expect(descriptor).toMatchObject({
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: source.width, h: source.height },
          sourceSize: { w: source.width, h: source.height },
        });
        expect([w, h], `${frameName} dimensions`).toEqual([source.width, source.height]);

        for (let row = 0; row < source.height; row += 1) {
          const atlasStart = ((y + row) * image.width + x) * 4;
          const sourceStart = row * source.width * 4;
          expect(
            image.pixels.subarray(atlasStart, atlasStart + source.width * 4)
              .equals(source.pixels.subarray(sourceStart, sourceStart + source.width * 4)),
            `${frameName} row ${row}`,
          ).toBe(true);
        }
      }
    }
    expect(frameCount).toBe(1_029);
  });

  test("maps legacy render keys and shared action families to their atlas frames", () => {
    expect(mapActionTextureRefFromLegacyKey("map-shoot-0")).toEqual({
      texture: "map-action-shoot",
      frame: "shoot__00",
    });
    expect(mapActionTextureRefFromLegacyKey("map-shoot-7")).toEqual({
      texture: "map-action-shoot",
      frame: "shoot__07",
    });
    expect(mapActionTextureRefFromLegacyKey("map-fire-4-ground-0")).toEqual({
      texture: "map-action-fire-4",
      frame: "fire-4__ground__00",
    });
    expect(mapActionTextureRefFromLegacyKey("map-magic-guard-0")).toEqual({
      texture: "map-action-attack-up",
      frame: "attack-up__effect__00",
    });
    expect(mapActionTextureRefFromLegacyKey("map-stomp-3-side2-1")).toEqual({
      texture: "map-action-stomp-3",
      frame: "stomp-3__side-2__01",
    });
    expect(mapActionTextureRefFromLegacyKey("map-wd-0")).toEqual({
      texture: "map-action-wd",
      frame: "wd__effect__00",
    });
    expect(mapActionTextureRefFromSource(
      "/assets/original/map-actions/lightning-1/main/00.png",
    )).toEqual({
      texture: "map-action-lightning-1",
      frame: "lightning-1__main__00",
    });

    expect(mapActionAtlasIdForAction("ice-4")).toBe("ice-1");
    expect(mapActionAtlasIdForAction("recovery-3")).toBe("recovery-1");
    expect(mapActionAtlasIdForAction("magic-guard")).toBe("attack-up");
    expect(mapActionAtlasIdForAction("fire-4")).toBe("fire-4");
  });

  test("keeps the technique laboratory on map-action source paths", () => {
    const sources = Object.values(TECHNIQUE_LAB_GRAPHIC_ASSETS).flat();
    expect(sources.length).toBeGreaterThan(900);
    expect(sources.every((source) => source.startsWith("/assets/original/map-actions/"))).toBe(true);
    expect(sources.some((source) => source.includes("/technique-lab/lightning/"))).toBe(false);
    for (const source of sources) expect(mapActionTextureRefFromSource(source)).toBeDefined();
  });
});
