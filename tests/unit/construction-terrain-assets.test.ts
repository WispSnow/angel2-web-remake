import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STAGE_RUNTIME_MANIFEST } from "../../src/game/stage-runtime";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const stageIds = Object.keys(STAGE_RUNTIME_MANIFEST);
const kinds = ["iron-plate", "obstacle"] as const;

const tileFile = (kind: string, stageId: string): string =>
  path.join(root, "public/assets/original/map-actions", kind, `${stageId}.png`);

/**
 * BattleScene preloads both construction tiles for every battle, keyed by the
 * runtime stage id. A missing file does not surface as a 404: Vite and any SPA
 * host answer with `index.html`, Phaser fails to decode it, and the engineer
 * paves broken textures. Enumerating the manifest keeps a new stage from
 * shipping before `pnpm content:terrain-actions` regenerates its tiles.
 */
describe("original engineer construction tiles", () => {
  it("ships a decodable 40x44 tile per playable stage for both construction kinds", async () => {
    expect(stageIds.length).toBeGreaterThan(0);
    for (const stageId of stageIds) {
      for (const kind of kinds) {
        const buffer = await readFile(tileFile(kind, stageId)).catch(() => undefined);
        expect(buffer, `${kind} tile for ${stageId}`).toBeDefined();
        if (!buffer) continue;
        expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE), `${kind}/${stageId} PNG header`)
          .toBe(true);
        expect(buffer.toString("ascii", 12, 16)).toBe("IHDR");
        expect([buffer.readUInt32BE(16), buffer.readUInt32BE(20)]).toEqual([40, 44]);
      }
    }
  });

  it("keeps the stage 27 pair on its two distinct native tokens", async () => {
    const [ironPlate, obstacle] = await Promise.all(
      kinds.map((kind) => readFile(tileFile(kind, "stage-27"))),
    );
    expect(ironPlate.equals(obstacle)).toBe(false);
  });
});
