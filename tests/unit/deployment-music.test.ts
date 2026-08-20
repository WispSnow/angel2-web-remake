import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  DEPLOYMENT_MUSIC_PROGRAMS,
  deploymentMusicProgramFor,
} from "../../src/game/content/deployment-music";
import { STAGE_RUNTIME_MANIFEST } from "../../src/game/stage-runtime";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("module 27 deployment music", () => {
  // `0000:06A1` compares the native scene against 5 and loads MUSIC/16 when it
  // is not greater, MUSIC/17 otherwise. Both records go to the RIX driver as
  // standalone looping tracks, not as an entry/loop pair.
  test("splits the two native roster tracks at scene 5", () => {
    expect(deploymentMusicProgramFor(0).track).toBe("MUSIC/16");
    expect(deploymentMusicProgramFor(5).track).toBe("MUSIC/16");
    expect(deploymentMusicProgramFor(6).track).toBe("MUSIC/17");
    expect(deploymentMusicProgramFor(42).track).toBe("MUSIC/17");
    expect(deploymentMusicProgramFor(49).track).toBe("MUSIC/17");
  });

  test("plays both records as plain loops with distinct program identities", () => {
    const programs = Object.values(DEPLOYMENT_MUSIC_PROGRAMS);
    expect(new Set(programs.map(({ id }) => id)).size).toBe(programs.length);
    for (const program of programs) {
      expect(program.kind).toBe("loop");
      // Neither record has a separately generated seam derivative, so the
      // loop restarts from the same published OGG.
      expect(program.seamlessLoop).toBe(program.source);
    }
  });

  test("ships the published OGG for every deployment track", async () => {
    for (const program of Object.values(DEPLOYMENT_MUSIC_PROGRAMS)) {
      await expect(access(path.join(root, "public", program.source))).resolves.toBeUndefined();
    }
  });

  test("covers every released stage ordinal", () => {
    for (const entry of Object.values(STAGE_RUNTIME_MANIFEST)) {
      expect(deploymentMusicProgramFor(entry.ordinal).track).toMatch(/^MUSIC\/1[67]$/u);
    }
  });
});
