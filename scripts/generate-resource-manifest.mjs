import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const assetRoot = path.join(publicRoot, "assets", "original");
const manifestOutput = path.join(assetRoot, "resource-manifest.v1.json");
const catalogOutput = path.join(root, "src", "game", "content", "resource-manifest.generated.ts");

const MAP_ACTION_ATLAS_IDS = [
  "shoot",
  "fire-1", "fire-2", "fire-3", "fire-4",
  "heal-1", "heal-2", "heal-3",
  "lightning-1", "lightning-2", "lightning-3", "lightning-4",
  "ice-1", "recovery-1", "attack-up", "defense-up",
  "poison", "confusion", "attack-down", "defense-down", "spell-seal", "dispel",
  "stomp-1", "stomp-2", "stomp-3", "wd",
];
const STAGE0_ACTION_ATLAS_IDS = new Set(["shoot", "fire-1", "heal-1"]);
const PRUNED_ROOT_FILES = new Set([
  "turn-transition-player.png",
  "turn-transition-enemy.png",
  "turn-transition-shadow.png",
  ...Array.from({ length: 6 }, (_, frame) =>
    `turn-transition-dust-${String(frame).padStart(2, "0")}.png`),
]);
const PRUNED_DIRECTORIES = [
  "map-combat/",
  "stage4-force-field-pulse/",
  "stage26-column-push/",
  "technique-lab/audio/",
  "technique-lab/lightning/",
  ...MAP_ACTION_ATLAS_IDS.map((id) => `map-actions/${id}/`),
];

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

const finalReleaseAsset = (relative) => {
  if (relative === "resource-manifest.v1.json") return false;
  if (PRUNED_ROOT_FILES.has(relative)) return false;
  if (PRUNED_DIRECTORIES.some((directory) => relative.startsWith(directory))) return false;
  if (relative.startsWith("full-combat/") && !relative.startsWith("full-combat/backgrounds/")) {
    return false;
  }
  return true;
};

const assetUrl = (relative) => `/assets/original/${relative}`;
const musicUrl = (container, record) =>
  assetUrl(`music/${container}/${String(record).padStart(4, "0")}.ogg`);

const sourceAssetUrls = (source) => {
  const urls = new Set();
  for (const match of source.matchAll(/["'`](\/assets\/original\/[^"'`$]+)["'`]/gu)) {
    urls.add(match[1]);
  }
  for (const match of source.matchAll(/musicAsset\("(MUSIC|MAGIC|UN)",\s*(\d+)\)/gu)) {
    urls.add(musicUrl(match[1], Number(match[2])));
  }
  return urls;
};

const stageIndexSource = await readFile(path.join(root, "src/game/content/stage-index.ts"), "utf8");
const stageIds = [...stageIndexSource.matchAll(/^\s+"(stage-[^"]+)":/gmu)].map((match) => match[1]);
if (stageIds.length !== 39) throw new Error(`expected 39 playable stage ids, found ${stageIds.length}`);

const stageSourcePath = (stageId) => {
  if (stageId === "stage-42-portal") return path.join(root, "src/game/content/stage5.ts");
  return path.join(root, "src/game/content", `stage${Number(stageId.slice("stage-".length))}.ts`);
};

const stageAssetUrls = new Map();
for (const stageId of stageIds) {
  const source = await readFile(stageSourcePath(stageId), "utf8");
  let selectedSource = source;
  if (stageId === "stage-05") {
    selectedSource = source.slice(source.indexOf("export const STAGE5_ASSETS"), source.indexOf("export const STAGE42_ASSETS"));
  } else if (stageId === "stage-42-portal") {
    selectedSource = source.slice(source.indexOf("export const STAGE42_ASSETS"), source.indexOf("export const STAGE5_MUSIC_PROGRAMS"));
  }
  const urls = sourceAssetUrls(selectedSource);
  const nativeStage = Number(stageId === "stage-42-portal" ? 42 : stageId.slice("stage-".length));
  // Module 27 selects one of two standalone deployment loops by native scene
  // number. It lives outside the per-stage content modules, so attach it here
  // explicitly or the preparation scene could become visible before its BGM
  // has crossed the staged resource gate.
  urls.add(musicUrl("MUSIC", nativeStage > 5 ? 17 : 16));
  urls.add(assetUrl(`map-actions/iron-plate/${stageId}.png`));
  urls.add(assetUrl(`map-actions/obstacle/${stageId}.png`));
  stageAssetUrls.set(stageId, urls);
}

const stage0Assets = stageAssetUrls.get("stage-00");
for (const suffix of ["story", "player", "enemy"]) {
  stage0Assets.add(assetUrl(`music/generated/stage0-${suffix}-seamless.ogg`));
}
for (let record = 57; record <= 71; record += 1) {
  stage0Assets.add(assetUrl(`speech-${record}.wav`));
}
if (stageAssetUrls.get("stage-04")) {
  stageAssetUrls.get("stage-04").add(assetUrl("battle-sprite-atlases/stage4-force-field-pulse.png"));
  stageAssetUrls.get("stage-04").add(assetUrl("battle-sprite-atlases/stage4-force-field-pulse.json"));
}
if (stageAssetUrls.get("stage-26")) {
  stageAssetUrls.get("stage-26").add(assetUrl("battle-sprite-atlases/stage26-column-push.png"));
  stageAssetUrls.get("stage-26").add(assetUrl("battle-sprite-atlases/stage26-column-push.json"));
}

const allFiles = (await collectFiles(assetRoot))
  .map((file) => ({ file, relative: path.relative(assetRoot, file).replaceAll(path.sep, "/") }))
  .filter(({ relative }) => finalReleaseAsset(relative))
  .sort((left, right) => left.relative.localeCompare(right.relative));
const finalUrls = new Set(allFiles.map(({ relative }) => assetUrl(relative)));

for (const [stageId, urls] of stageAssetUrls) {
  for (const url of urls) {
    const relative = url.slice("/assets/original/".length);
    if (!finalReleaseAsset(relative)) {
      urls.delete(url);
      continue;
    }
    if (!finalUrls.has(url)) {
      throw new Error(`${stageId} resource is not present in the final release asset set: ${url}`);
    }
  }
}

const packAssets = new Map();
const addToPack = (packId, url) => {
  const assets = packAssets.get(packId) ?? new Set();
  assets.add(url);
  packAssets.set(packId, assets);
};

for (const { relative } of allFiles) {
  const url = assetUrl(relative);
  if (relative.startsWith("startup/")) addToPack("boot", url);
  else if (relative.startsWith("full-combat-atlases/") || relative.startsWith("full-combat/backgrounds/")) {
    addToPack("stream:full-combat", url);
  } else if (relative.startsWith("portraits/") || relative.startsWith("portrait-animation/")) {
    addToPack("stream:portraits", url);
  } else if (relative.startsWith("ending/")) addToPack("ending", url);
  else if (relative.startsWith("credits/")) addToPack("credits", url);
  else if (relative.startsWith("map-action-atlases/")) {
    const atlasId = path.basename(relative, path.extname(relative));
    addToPack(STAGE0_ACTION_ATLAS_IDS.has(atlasId) ? "actions:stage-00" : "actions:campaign", url);
  } else if (relative.startsWith("battle-sprite-atlases/")) {
    if (!relative.includes("stage4-") && !relative.includes("stage26-")) addToPack("battle:core", url);
  } else if (relative.startsWith("technique-lab/units/") || /^unit-(?:ally|enemy)-/u.test(relative)) {
    addToPack("stream:map-units", url);
  } else if (relative.startsWith("audio/")) addToPack("actions:stage-00", url);
  else if (relative === "music/MUSIC/0014.ogg" || relative === "music/MUSIC/0001.ogg") {
    addToPack("boot", url);
  }
}

for (const [stageId, urls] of stageAssetUrls) {
  for (const url of urls) addToPack(`stage:${stageId}`, url);
}
const endingSource = await readFile(path.join(root, "src/game/content/stage49-ending.ts"), "utf8");
for (const url of sourceAssetUrls(endingSource)) addToPack("ending", url);
for (const { relative } of allFiles) {
  if (relative.startsWith("full-combat/backgrounds/")) addToPack("ending", assetUrl(relative));
}
const creditsSource = await readFile(
  path.join(root, "src/game/content/credits-runtime.generated.ts"),
  "utf8",
);
for (const url of sourceAssetUrls(creditsSource)) addToPack("credits", url);

const assignedUrls = new Set([...packAssets.values()].flatMap((urls) => [...urls]));
for (const { relative } of allFiles) {
  const url = assetUrl(relative);
  if (assignedUrls.has(url)) continue;
  if (/^(?:stage\d+|stage42-portal)-(?:map|minimap)\.png$/u.test(relative)
    || relative.startsWith("story-stage")) {
    throw new Error(`stage asset was not assigned to a stage pack: ${url}`);
  }
  if (relative.startsWith("music/")) addToPack("stream:music", url);
  else if (/^(?:speech-\d+|ui-confirm|combat-(?:death|hit|soldier))\.wav$/u.test(relative)) {
    addToPack("stage:stage-00", url);
  } else if (relative.startsWith("dialogue/") || relative.startsWith("status-icons/")
    || relative.startsWith("story/")
    || /^(?:battle-|command-menu-|hud-|native-|tactical-panel)/u.test(relative)) {
    addToPack("battle:core", url);
  } else addToPack("stream:misc", url);
}

const packDefinitions = [];
const addPack = (id, label, dependsOn = [], next = []) => {
  packDefinitions.push({
    id,
    label,
    dependsOn,
    assets: [...(packAssets.get(id) ?? [])].sort(),
    ...(next.length > 0 ? { next } : {}),
  });
};
addPack("boot", "開場資料");
addPack("battle:core", "戰場共用資料");
addPack("actions:stage-00", "第 0 關動作資料");
addPack("actions:campaign", "戰役動作資料", ["actions:stage-00"]);
for (let index = 0; index < stageIds.length; index += 1) {
  const stageId = stageIds[index];
  const next = stageIds.slice(index + 1, index + 3).map((id) => `stage:${id}`);
  addPack(
    `stage:${stageId}`,
    `${stageId} 關卡資料`,
    ["battle:core", stageId === "stage-00" ? "actions:stage-00" : "actions:campaign"],
    next,
  );
}
addPack("ending", "主線結局資料");
addPack("credits", "製作人員表資料");
addPack("stream:portraits", "肖像串流資料");
addPack("stream:full-combat", "全景戰鬥串流資料");
addPack("stream:map-units", "棋子按需資料");
addPack("stream:music", "其餘音樂串流資料");
addPack("stream:misc", "其餘按需資料");

const packageIdsByUrl = new Map();
for (const pack of packDefinitions) {
  for (const url of pack.assets) {
    const ids = packageIdsByUrl.get(url) ?? [];
    ids.push(pack.id);
    packageIdsByUrl.set(url, ids);
  }
}

const assets = [];
for (const { file, relative } of allFiles) {
  const body = await readFile(file);
  const url = assetUrl(relative);
  assets.push({
    url,
    bytes: (await stat(file)).size,
    sha256: createHash("sha256").update(body).digest("hex"),
    packages: (packageIdsByUrl.get(url) ?? []).sort(),
  });
}
const unassigned = assets.filter(({ packages }) => packages.length === 0);
if (unassigned.length > 0) {
  throw new Error(`manifest has unassigned assets: ${unassigned.map(({ url }) => url).join(", ")}`);
}

const identityInput = JSON.stringify({ version: 1, assets, packs: packDefinitions });
const identity = createHash("sha256").update(identityInput).digest("hex");
const manifest = {
  format: "ANGEL2 versioned resource packs",
  version: 1,
  identity,
  assets,
  packs: packDefinitions,
};
await writeFile(manifestOutput, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(catalogOutput, `// Generated by scripts/generate-resource-manifest.mjs. Do not hand-edit.\n\nexport const RESOURCE_MANIFEST_VERSION = 1 as const;\nexport const RESOURCE_MANIFEST_IDENTITY = ${JSON.stringify(identity)} as const;\nexport const RESOURCE_MANIFEST_URL = "/assets/original/resource-manifest.v1.json" as const;\n`);

const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
console.log(`generated resource manifest ${identity.slice(0, 12)}: ${assets.length} assets, ${packDefinitions.length} packs, ${totalBytes} bytes`);
