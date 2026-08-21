import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  RESOURCE_MANIFEST_IDENTITY,
  RESOURCE_MANIFEST_VERSION,
} from "../../src/game/content/resource-manifest.generated";
import { STAGE_INDEX } from "../../src/game/content/stage-index";
import {
  parseResourceManifest,
  type ResourceManifest,
} from "../../src/game/resource-loader";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "public/assets/original/resource-manifest.v1.json");

const readManifest = async (): Promise<ResourceManifest> =>
  parseResourceManifest(JSON.parse(await readFile(manifestPath, "utf8")));

const resolvedPackUrls = (manifest: ResourceManifest, packId: string): Set<string> => {
  const packs = new Map(manifest.packs.map((pack) => [pack.id, pack]));
  const result = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const pack = packs.get(id);
    if (!pack) throw new Error(`missing pack ${id}`);
    for (const dependency of pack.dependsOn) visit(dependency);
    for (const url of pack.assets) result.add(url);
  };
  visit(packId);
  return result;
};

describe("versioned resource manifest", () => {
  test("records exact final-path bytes and hashes for every packaged asset", async () => {
    const manifest = await readManifest();
    expect(manifest.version).toBe(RESOURCE_MANIFEST_VERSION);
    expect(manifest.identity).toBe(RESOURCE_MANIFEST_IDENTITY);
    expect(manifest.assets.length).toBeGreaterThan(1_200);
    expect(manifest.assets.every(({ packages }) => packages.length > 0)).toBe(true);
    expect(createHash("sha256").update(JSON.stringify({
      version: manifest.version,
      assets: manifest.assets,
      packs: manifest.packs,
    })).digest("hex")).toBe(manifest.identity);

    for (const asset of manifest.assets) {
      const localPath = path.join(root, "public", asset.url.replace(/^\//u, ""));
      const body = await readFile(localPath);
      expect((await stat(localPath)).size, asset.url).toBe(asset.bytes);
      expect(createHash("sha256").update(body).digest("hex"), asset.url).toBe(asset.sha256);
    }
  });

  test("uses atlas outputs and never advertises fragmented release-pruned frames", async () => {
    const manifest = await readManifest();
    const urls = manifest.assets.map(({ url }) => url);
    expect(urls).toContain("/assets/original/full-combat-atlases/left-soldier.png");
    expect(urls).toContain("/assets/original/battle-sprite-atlases/map-combat.png");
    expect(urls).toContain("/assets/original/map-action-atlases/shoot.png");
    expect(urls.some((url) => /\/full-combat\/(?!backgrounds\/)/u.test(url))).toBe(false);
    expect(urls.some((url) => url.startsWith("/assets/original/map-combat/"))).toBe(false);
    expect(urls.some((url) => url.startsWith("/assets/original/stage4-force-field-pulse/"))).toBe(false);
    expect(urls.some((url) => url.startsWith("/assets/original/stage26-column-push/"))).toBe(false);
    expect(urls.some((url) => /\/map-actions\/(?:shoot|fire-1|heal-1)\//u.test(url))).toBe(false);
  });

  test("keeps boot, current-stage, following-stage, and streaming packages separate", async () => {
    const manifest = await readManifest();
    const stageIds = Object.keys(STAGE_INDEX);
    const stagePacks = manifest.packs.filter(({ id }) => id.startsWith("stage:"));
    expect(stagePacks.map(({ id }) => id.slice("stage:".length))).toEqual(stageIds);
    for (let index = 0; index < stagePacks.length; index += 1) {
      expect(stagePacks[index].next ?? []).toEqual(
        stagePacks.slice(index + 1, index + 3).map(({ id }) => id),
      );
    }

    const boot = resolvedPackUrls(manifest, "boot");
    expect(boot).toContain("/assets/original/startup/title/background.png");
    expect(boot).not.toContain("/assets/original/stage0-map.png");

    const stage0 = resolvedPackUrls(manifest, "stage:stage-00");
    expect(stage0).toContain("/assets/original/stage0-map.png");
    expect(stage0).toContain("/assets/original/music/generated/stage0-player-seamless.ogg");
    expect(stage0).toContain("/assets/original/music/MUSIC/0016.ogg");
    expect(stage0).not.toContain("/assets/original/stage1-map.png");
    expect(stage0).not.toContain("/assets/original/full-combat-atlases/left-soldier.png");
    expect(stage0).not.toContain("/assets/original/portraits/D-46-base.png");

    const stage4 = resolvedPackUrls(manifest, "stage:stage-04");
    expect(stage4).toContain("/assets/original/battle-sprite-atlases/stage4-force-field-pulse.png");
    expect(stage4).not.toContain("/assets/original/stage26-map.png");

    for (const stageId of stageIds) {
      const nativeStage = Number(stageId === "stage-42-portal" ? 42 : stageId.slice("stage-".length));
      const deploymentTrack = String(nativeStage > 5 ? 17 : 16).padStart(4, "0");
      const stageUrls = resolvedPackUrls(manifest, `stage:${stageId}`);
      expect(stageUrls).toContain(
        `/assets/original/music/MUSIC/${deploymentTrack}.ogg`,
      );
      expect([...stageUrls].filter((url) => url.includes("/music/")).length).toBeGreaterThanOrEqual(5);
    }

    const ending = resolvedPackUrls(manifest, "ending");
    for (const url of [
      "/assets/original/music/MAGIC/0077.ogg",
      "/assets/original/music/MUSIC/0040.ogg",
      "/assets/original/music/UN/0006.ogg",
      "/assets/original/music/UN/0049.ogg",
    ]) expect(ending).toContain(url);
    expect(resolvedPackUrls(manifest, "credits")).toContain(
      "/assets/original/music/UN/0055.ogg",
    );

    expect(resolvedPackUrls(manifest, "stream:full-combat").size).toBe(172);
    expect(resolvedPackUrls(manifest, "stream:portraits").size).toBe(500);
  });
});
