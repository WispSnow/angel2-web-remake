import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  FULL_COMBAT_ATLAS_FRAMES,
  FULL_COMBAT_ATLASES,
} from "../../src/game/content/full-combat-atlases.generated";
import {
  fullCombatAtlasFrame,
} from "../../src/game/full-combat-atlas";
import { decodeRgbaPng } from "../../scripts/lib/png-atlas.mjs";

interface AtlasData {
  readonly frames: Readonly<Record<string, {
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
  }>>;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicPath = (url: string): string => path.join(root, "public", url.replace(/^\//u, ""));

function sourcePathForFrame(frameName: string): string {
  const parts = frameName.split("/");
  if (parts[0] === "common" && parts[1] === "trail" && parts[2]) {
    return path.join(root, "public/assets/original/full-combat/common-trail", `${parts[2]}.png`);
  }
  const [side, classId, set, index] = parts;
  if (!side || !classId || !set || !index) throw new Error(`invalid frame name ${frameName}`);
  return path.join(
    root,
    "public/assets/original/full-combat",
    `${side}-${classId}-${set}`,
    `${index}.png`,
  );
}

describe("generated full-combat atlases", () => {
  test("split 777 frames into bounded profession-and-side texture groups", async () => {
    expect(FULL_COMBAT_ATLASES).toHaveLength(75);
    expect(Object.keys(FULL_COMBAT_ATLAS_FRAMES)).toHaveLength(777);
    expect(Math.max(...FULL_COMBAT_ATLASES.map(({ decodedBytes }) => decodedBytes)))
      .toBeLessThanOrEqual(1.25 * 1024 * 1024);
    expect(FULL_COMBAT_ATLASES.every(({ width, height }) => width <= 1024 && height <= 1024))
      .toBe(true);

    const outputDirectory = path.join(root, "public/assets/original/full-combat-atlases");
    const files = (await readdir(outputDirectory)).sort();
    expect(files).toEqual(FULL_COMBAT_ATLASES.flatMap(({ id }) => [
      `${id}.json`,
      `${id}.png`,
    ]).sort());
  });

  test("preserve every untrimmed source frame pixel-for-pixel", async () => {
    let frameCount = 0;
    for (const atlas of FULL_COMBAT_ATLASES) {
      const [atlasPng, atlasJson] = await Promise.all([
        readFile(publicPath(atlas.image)),
        readFile(publicPath(atlas.data), "utf8"),
      ]);
      const image = decodeRgbaPng(atlasPng, atlas.image);
      const data = JSON.parse(atlasJson) as AtlasData;
      expect(Object.keys(data.frames)).toHaveLength(atlas.frameCount);

      for (const [frameName, descriptor] of Object.entries(data.frames)) {
        frameCount += 1;
        const sourcePath = sourcePathForFrame(frameName);
        const source = decodeRgbaPng(await readFile(sourcePath), sourcePath);
        const { x, y, w, h } = descriptor.frame;
        expect(descriptor).toMatchObject({
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: source.width, h: source.height },
          sourceSize: { w: source.width, h: source.height },
        });
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
    expect(frameCount).toBe(777);
  }, 15_000);

  test("resolve stable semantic frame names without exposing source PNG URLs", () => {
    expect(fullCombatAtlasFrame("left/soldier/plus50/04")).toMatchObject({
      image: "/assets/original/full-combat-atlases/left-soldier.png",
      atlasId: "left-soldier",
    });
    expect(fullCombatAtlasFrame("common/trail/05")).toMatchObject({
      image: "/assets/original/full-combat-atlases/common-trail.png",
      atlasId: "common-trail",
    });
  });
});
