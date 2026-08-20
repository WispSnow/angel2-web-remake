import { createHash } from "node:crypto";
import { access, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(root, "release");
const developmentOnlyFiles = new Set([
  "arena.html",
  "class-showdown.html",
  "promotion-lab.html",
  "debug.html",
  "portrait-lab.html",
  "combat-lab.html",
  "deployment-lab.html",
  "technique-lab.html",
]);
const mapActionAtlasIds = [
  "shoot",
  "fire-1", "fire-2", "fire-3", "fire-4",
  "heal-1", "heal-2", "heal-3",
  "lightning-1", "lightning-2", "lightning-3", "lightning-4",
  "ice-1", "recovery-1", "attack-up", "defense-up",
  "poison", "confusion", "attack-down", "defense-down", "spell-seal", "dispel",
  "stomp-1", "stomp-2", "stomp-3", "wd",
];

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else files.push(target);
  }
  return files;
}

if (!(await pathExists(releaseDirectory))) {
  throw new Error("release directory was not produced by the release build");
}

for (const file of developmentOnlyFiles) {
  const target = path.join(releaseDirectory, file);
  if (await pathExists(target)) {
    throw new Error(`release build unexpectedly contains ${file}`);
  }
}

// The only public assets used by the player build are under original/.
// Technique-lab unit sprites are shared by campaign map rendering, while its
// audio is laboratory-only and would otherwise be copied by Vite's public
// directory pass. The obsolete lightning directory is removed defensively;
// the laboratory now shares the campaign map-action atlases.
await rm(path.join(releaseDirectory, "assets", "labs"), { recursive: true, force: true });
await rm(path.join(releaseDirectory, "assets", "original", "technique-lab", "lightning"), {
  recursive: true,
  force: true,
});
await rm(path.join(releaseDirectory, "assets", "original", "technique-lab", "audio"), {
  recursive: true,
  force: true,
});
for (const actionId of mapActionAtlasIds) {
  await rm(path.join(releaseDirectory, "assets", "original", "map-actions", actionId), {
    recursive: true,
    force: true,
  });
}

const fullCombatAtlasDirectory = path.join(
  releaseDirectory,
  "assets",
  "original",
  "full-combat-atlases",
);
const fullCombatAtlasFiles = await readdir(fullCombatAtlasDirectory);
const fullCombatAtlasIds = new Set(
  fullCombatAtlasFiles.map((file) => file.replace(/\.(?:png|json)$/u, "")),
);
if (fullCombatAtlasIds.size !== 75) {
  throw new Error(`release build has ${fullCombatAtlasIds.size} full-combat atlases; expected 75`);
}
for (const atlasId of fullCombatAtlasIds) {
  for (const extension of ["png", "json"]) {
    if (!(await pathExists(path.join(fullCombatAtlasDirectory, `${atlasId}.${extension}`)))) {
      throw new Error(`release build is missing full-combat atlas ${atlasId}.${extension}`);
    }
  }
}
const fullCombatDirectory = path.join(releaseDirectory, "assets", "original", "full-combat");
for (const entry of await readdir(fullCombatDirectory, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== "backgrounds") {
    await rm(path.join(fullCombatDirectory, entry.name), { recursive: true, force: true });
  }
}

const battleSpriteAtlasIds = [
  "map-combat",
  "turn-transition",
  "stage4-force-field-pulse",
  "stage26-column-push",
];
const battleSpriteAtlasDirectory = path.join(
  releaseDirectory,
  "assets",
  "original",
  "battle-sprite-atlases",
);
for (const atlasId of battleSpriteAtlasIds) {
  for (const extension of ["png", "json"]) {
    if (!(await pathExists(path.join(battleSpriteAtlasDirectory, `${atlasId}.${extension}`)))) {
      throw new Error(`release build is missing battle-sprite atlas ${atlasId}.${extension}`);
    }
  }
}
await rm(path.join(releaseDirectory, "assets", "original", "map-combat"), {
  recursive: true,
  force: true,
});
await rm(path.join(releaseDirectory, "assets", "original", "stage4-force-field-pulse"), {
  recursive: true,
  force: true,
});
await rm(path.join(releaseDirectory, "assets", "original", "stage26-column-push"), {
  recursive: true,
  force: true,
});
for (const file of [
  "turn-transition-player.png",
  "turn-transition-enemy.png",
  "turn-transition-shadow.png",
  ...Array.from({ length: 6 }, (_, frame) =>
    `turn-transition-dust-${String(frame).padStart(2, "0")}.png`),
]) {
  await rm(path.join(releaseDirectory, "assets", "original", file), { force: true });
}

const atlasDirectory = path.join(releaseDirectory, "assets", "original", "map-action-atlases");
for (const actionId of mapActionAtlasIds) {
  for (const extension of ["png", "json"]) {
    if (!(await pathExists(path.join(atlasDirectory, `${actionId}.${extension}`)))) {
      throw new Error(`release build is missing map action atlas ${actionId}.${extension}`);
    }
  }
}

const files = await collectFiles(releaseDirectory);
const musicManifestPath = path.join(releaseDirectory, "assets/original/music/music-manifest.json");
if (!(await pathExists(musicManifestPath))) {
  throw new Error("release build is missing the deduplicated OGG music manifest");
}
const musicManifest = JSON.parse(await readFile(musicManifestPath, "utf8"));
if (musicManifest.version !== 1 || musicManifest.tracks.length !== 54) {
  throw new Error("release build has an unexpected music manifest");
}
for (const track of musicManifest.tracks) {
  const relativeOutput = track.output.replace(/^public\//u, "");
  const released = await readFile(path.join(releaseDirectory, relativeOutput));
  const releasedHash = createHash("sha256").update(released).digest("hex");
  if (releasedHash !== track.outputSha256) {
    throw new Error(`release music differs from the development asset: ${relativeOutput}`);
  }
}
const legacyMusic = files.filter((file) => {
  const relative = path.relative(releaseDirectory, file);
  return /(?:^|\/)(?:story-stage\d+(?:-loop-seamless)?|battle-stage\d+-(?:player|enemy)-(?:entry|loop)(?:-seamless)?)\.wav$/u.test(relative)
    || /(?:^|\/)(?:startup\/audio\/(?:intro|title)|credits\/music|ending\/audio\/(?:story|roster|prosperous|decline))\.wav$/u.test(relative);
});
if (legacyMusic.length > 0) {
  throw new Error(`release build contains legacy music WAVs: ${legacyMusic.map((file) => path.relative(releaseDirectory, file)).join(", ")}`);
}
const forbidden = files.filter((file) => {
  const name = path.basename(file);
  if (/^deployment-lab-.*\.css$/u.test(name)) return false;
  return /debug-scenarios|debug-roster|(?:^|-)lab(?:-|\.)/u.test(name);
});
if (forbidden.length > 0) {
  throw new Error(`release build contains development-only bundles: ${forbidden.map((file) => path.relative(releaseDirectory, file)).join(", ")}`);
}

const indexPath = path.join(releaseDirectory, "index.html");
if (!(await pathExists(indexPath))) throw new Error("release build is missing index.html");

const stats = await Promise.all(files.map(async (file) => (await stat(file)).size));
const bytes = stats.reduce((sum, size) => sum + size, 0);
console.log(`release ready: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
