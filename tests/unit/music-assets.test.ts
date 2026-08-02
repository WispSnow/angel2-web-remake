import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  STAGE0_MUSIC_SEAM_CROSSFADE_FRAMES,
  STAGE0_MUSIC_SEAM_SAMPLE_RATE,
} from "../../src/game/content/stage0-music.generated";

interface SeamManifestTrack {
  id: string;
  output: string;
  outputSha256: string;
  sampleRate: number;
  sourceFrames: number;
  outputFrames: number;
  crossfadeFrames: number;
  sourceBoundary: { rmsDbfs: number };
  outputBoundary: { rmsDbfs: number };
}

interface SeamManifest {
  version: number;
  algorithm: string;
  tracks: SeamManifestTrack[];
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

describe("generated seamless stage-zero music", () => {
  test("keeps the evidence WAVs immutable and publishes deterministic periodic derivatives", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, "public/assets/original/stage0-music-seams.json"), "utf8"),
    ) as SeamManifest;
    expect(manifest).toMatchObject({
      version: 1,
      algorithm: "periodic-linear-overlap-add",
    });
    expect(manifest.tracks.map(({ id }) => id)).toEqual([
      "story-stage0",
      "battle-stage0-player-loop",
      "battle-stage0-enemy-loop",
    ]);

    for (const track of manifest.tracks) {
      expect(track.sampleRate).toBe(STAGE0_MUSIC_SEAM_SAMPLE_RATE);
      expect(track.crossfadeFrames).toBe(STAGE0_MUSIC_SEAM_CROSSFADE_FRAMES);
      expect(track.sourceFrames - track.outputFrames).toBe(track.crossfadeFrames);
      expect(track.outputBoundary.rmsDbfs).toBeLessThan(-30);
      const output = await readFile(path.join(root, track.output));
      expect(sha256(output)).toBe(track.outputSha256);
      expect(output.toString("ascii", 0, 4)).toBe("RIFF");
      expect(output.toString("ascii", 8, 12)).toBe("WAVE");
      expect(output.readUInt32LE(40) / output.readUInt16LE(32)).toBe(track.outputFrames);
    }

    const player = manifest.tracks.find(({ id }) => id === "battle-stage0-player-loop");
    if (!player) throw new Error("player loop seam manifest is missing");
    expect(player.outputBoundary.rmsDbfs - player.sourceBoundary.rmsDbfs).toBeLessThan(-15);
  });
});
