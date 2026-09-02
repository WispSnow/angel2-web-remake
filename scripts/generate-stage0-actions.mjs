#!/usr/bin/env node

import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const techniqueRulesPath = path.join(root, "reverse/parsed/native/technique-rules.json");
const combatPresentationsPath = path.join(root, "reverse/parsed/native/combat-presentations.json");
const shootingPresentationsPath = path.join(root, "reverse/parsed/native/shooting-presentations.json");
const techniquePresentationsPath = path.join(root, "reverse/parsed/native/technique-presentations.json");
const turnActionsPath = path.join(root, "reverse/parsed/native/turn-actions.json");
const classCatalogPath = path.join(root, "src/game/content/class-catalog.generated.ts");
const outputPath = path.join(root, "src/game/content/stage0-actions.generated.ts");
const publicRoot = path.join(root, "public/assets/original");

const [
  techniqueRules,
  combatPresentations,
  shootingPresentations,
  techniquePresentations,
  turnActions,
  classCatalogSource,
] = await Promise.all([
  readFile(techniqueRulesPath, "utf8").then(JSON.parse),
  readFile(combatPresentationsPath, "utf8").then(JSON.parse),
  readFile(shootingPresentationsPath, "utf8").then(JSON.parse),
  readFile(techniquePresentationsPath, "utf8").then(JSON.parse),
  readFile(turnActionsPath, "utf8").then(JSON.parse),
  readFile(classCatalogPath, "utf8"),
]);
const classIdsMatch = /export const CLASS_IDS = (?<ids>\[[\s\S]*?\]) as const;/u.exec(
  classCatalogSource,
);
if (!classIdsMatch?.groups?.ids) throw new Error("generated class catalog has no CLASS_IDS");
const classIds = JSON.parse(classIdsMatch.groups.ids);

const archerShooting = techniqueRules.shooting.classes.find((entry) => entry.classCode === "3A");
const crossbowShooting = techniqueRules.shooting.classes.find((entry) => entry.classCode === "0I");
const magicArcherShooting = techniqueRules.shooting.classes.find((entry) => entry.classCode === "1I");
const fireDispatch = techniqueRules.dispatchTable.entries.find((entry) => entry.actionCode === "1F");
const healDispatch = techniqueRules.dispatchTable.entries.find((entry) => entry.actionCode === "1H");
const fireTier = techniqueRules.rules.families.F.tiers.find((entry) => entry.code === "1F");
const healTier = techniqueRules.rules.families.H.tiers.find((entry) => entry.code === "1H");
const commonShootingDamageTimeline = shootingPresentations.commonImpact?.damageTimeline;
const fireSettlementBoundary = techniquePresentations.presentations?.fire?.settlementBoundary;
const nativeRestPresentation = turnActions.actionCommitPoints?.rest?.presentation;

if (
  !archerShooting
  || !crossbowShooting
  || !magicArcherShooting
  || archerShooting.maximumRange !== 5
  || fireDispatch?.selectionRadius !== 5
  || healDispatch?.selectionRadius !== 5
  || fireTier?.percentMaxLife !== 18
  || fireTier?.damageCap !== 108
  || healTier?.maxLifePercent !== 24
  || !commonShootingDamageTimeline?.behavior?.includes("waits one native tick")
  || !fireSettlementBoundary?.includes("once per requested damage point")
  || nativeRestPresentation?.resource !== "MAGIC/0"
  || nativeRestPresentation?.drawCount !== 5
  || nativeRestPresentation?.waitPerDrawNativeTicks !== 15
  || nativeRestPresentation?.cleanupDescriptor?.tileCode !== 0
  || nativeRestPresentation?.cleanupDescriptor?.waitNativeTicks !== 15
  || nativeRestPresentation?.audioRequests?.length !== 0
) {
  throw new Error("stage-0 action evidence no longer matches the authorized M00.6 contract");
}

const classRecords = combatPresentations.fullScreenPresentation.classRecords;
const fullCombatGeometry = combatPresentations.fullScreenPresentation.coordinateSystem;
const classSpecs = classIds.map((id, nativeRecord) => ({ id, nativeRecord }));
const fullCombatProfiles = {};
const fullCombatAssets = { left: {}, right: {} };
const fullCombatFrameMeta = { left: {}, right: {} };
const fullCombatFrameName = (side, classId, set, index) =>
  `${side}/${classId}/${set}/${String(index).padStart(2, "0")}`;
const planarManifests = new Map();

async function numberedPngs(directory) {
  try {
    return (await readdir(directory))
      .filter((entry) => /^\d+\.png$/u.test(entry))
      .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function planarImages(group, record) {
  if (!planarManifests.has(group)) {
    planarManifests.set(
      group,
      await readFile(
        path.join(root, "reverse/renders/planar", group, "manifest.json"),
        "utf8",
      ).then(JSON.parse),
    );
  }
  return planarManifests.get(group).entries
    .find((entry) => entry.record === record)?.images ?? [];
}

async function copyFrameSet(group, record, publicDirectory, publicPrefix) {
  const sourceDirectory = path.join(
    root,
    "reverse/renders/planar",
    group,
    String(record).padStart(4, "0"),
  );
  const frames = await numberedPngs(sourceDirectory);
  await mkdir(publicDirectory, { recursive: true });
  await Promise.all(frames.map((frame) =>
    copyFile(path.join(sourceDirectory, frame), path.join(publicDirectory, frame))));
  const images = await planarImages(group, record);
  if (frames.length !== images.length) {
    throw new Error(`${group}/${record}: rendered PNG and manifest frame counts differ`);
  }
  return {
    paths: frames.map((frame) => `${publicPrefix}/${frame}`),
    images,
  };
}

for (const spec of classSpecs) {
  const native = classRecords.find((entry) => entry.record === spec.nativeRecord);
  if (!native) throw new Error(`missing full-combat profile for native class ${spec.nativeRecord}`);
  if (!native.side2.available) {
    throw new Error(`native class ${spec.nativeRecord} has no side-2 presentation block`);
  }
  // 记录 36「龍」/37「頭」/38「手」只在 side 2 编队出现，原版没有填 side 1 表现块，
  // 也没有 `M_00/86..88`。它们的 `left` 分支不是“素材缺失”，而是不可达方向。
  const rightOnly = !native.side1.available;
  const sides = rightOnly
    ? [["right", native.side2]]
    : [["left", native.side1], ["right", native.side2]];
  const perSide = (pick) => Object.fromEntries(
    sides.map(([side, nativeSide]) => [side, pick(nativeSide)]),
  );
  fullCombatProfiles[spec.id] = {
    nativeRecord: spec.nativeRecord,
    reach: rightOnly ? "right-only" : "both-sides",
    voiceSlots: perSide((nativeSide) => nativeSide.voiceSlots),
    // 逐侧输出：记录 3「魔祭師」与 16「獸騎士」的两侧 step-count 并不相同。运行时
    // 实际读取的是命令流内每步的 `rendererSubsteps`，这两个字段只作证据回显。
    strikeStepCounts: perSide((nativeSide) => nativeSide.strikeStepCounts.values),
    postHitStepCounts: perSide((nativeSide) => nativeSide.postHitStepCounts.values),
    commandStreams: perSide((nativeSide) => nativeSide.commandStreams),
  };

  for (const [side, nativeSide] of sides) {
    fullCombatAssets[side][spec.id] = {};
    fullCombatFrameMeta[side][spec.nativeRecord] = {};
    for (const set of ["direct", "plus50"]) {
      const variantKey = `${side}${set === "direct" ? "Direct" : "Plus50"}`;
      const variant = native.fullScreenGraphicVariants[variantKey];
      const copied = await copyFrameSet(
        variant.group,
        variant.record,
        path.join(publicRoot, "full-combat", `${side}-${spec.id}-${set}`),
        `/assets/original/full-combat/${side}-${spec.id}-${set}`,
      );
      fullCombatAssets[side][spec.id][set] = copied.paths.map((_, index) =>
        fullCombatFrameName(side, spec.id, set, index));
      fullCombatFrameMeta[side][spec.nativeRecord][set] = copied.images.map(
        (image, index) => ({
          w: image.width,
          h: image.height,
          anchor: nativeSide.framePlacement.xAnchor[index],
          yOffset: nativeSide.framePlacement.yOffset[index],
        }),
      );
    }
  }
}

const fullCombatCommonEffects = {
  trail: (await copyFrameSet(
    "A",
    26,
    path.join(publicRoot, "full-combat", "common-trail"),
    "/assets/original/full-combat/common-trail",
  )).paths.map((_, index) => `common/trail/${String(index).padStart(2, "0")}`),
};

const fullCombatDeath = {
  soundRecord: Number.parseInt(combatPresentations.fullScreenPresentation.death.soundResource.split("/")[1], 10),
  left: {
    steps: combatPresentations.fullScreenPresentation.death.leftScript.poses.map(
      (pose, index) => ({
        index,
        rendererSubsteps: combatPresentations.fullScreenPresentation.death.deathStepCounts.values[index],
        commands: index === 0
          ? combatPresentations.fullScreenPresentation.death.leftScript.commands.map((command) => ({
            ...command,
            parameters: [],
          }))
          : [],
        pose,
      }),
    ),
  },
  right: {
    steps: combatPresentations.fullScreenPresentation.death.rightScript.poses.map(
      (pose, index) => ({
        index,
        rendererSubsteps: combatPresentations.fullScreenPresentation.death.deathStepCounts.values[index],
        commands: index === 0
          ? combatPresentations.fullScreenPresentation.death.rightScript.commands.map((command) => ({
            ...command,
            parameters: [],
          }))
          : [],
        pose,
      }),
    ),
  },
};

async function copyEffectFrames(group, record, outputDirectory, publicPrefix) {
  return (await copyFrameSet(
    group,
    record,
    path.join(publicRoot, "map-actions", outputDirectory),
    `/assets/original/map-actions/${publicPrefix}`,
  )).paths;
}

const actionPresentationAssets = {
  shoot: {
    hit: await copyEffectFrames("UN", 60, "shoot", "shoot"),
  },
  fire1: {
    effect: await copyEffectFrames("MAGIC", 22, "fire-1", "fire-1"),
  },
  heal1: {
    primary: await copyEffectFrames("UN", 61, "heal-1/primary", "heal-1/primary"),
    tail: await copyEffectFrames("MAGIC", 0, "heal-1/tail", "heal-1/tail"),
  },
};

const restPresentation = {
  mode: "heal-common-finish",
  resource: nativeRestPresentation.resource,
  frameCount: nativeRestPresentation.drawCount,
  waitPerFrameNativeTicks: nativeRestPresentation.waitPerDrawNativeTicks,
  cleanupFrame: null,
  cleanupWaitNativeTicks: nativeRestPresentation.cleanupDescriptor.waitNativeTicks,
  audioRequests: nativeRestPresentation.audioRequests,
};

await Promise.all([
  mkdir(path.join(publicRoot, "audio/e"), { recursive: true }),
  mkdir(path.join(publicRoot, "audio/magic"), { recursive: true }),
]);
const classVoiceRecords = [...new Set([
  11,
  ...classRecords.flatMap((record) => [record.side1, record.side2]
    .filter((side) => side.available)
    .flatMap((side) => Object.values(side.voiceSlots))),
])];
await Promise.all([
  copyFile(
    path.join(root, "reverse/converted/audio/wav/MAGIC/0083.wav"),
    path.join(publicRoot, "audio/magic/83.wav"),
  ),
  ...classVoiceRecords.map((record) =>
    copyFile(
      path.join(root, "reverse/converted/audio/wav/E", `${String(record).padStart(4, "0")}.wav`),
      path.join(publicRoot, "audio/e", `${record}.wav`),
    )),
]);

const actions = {
  "archer-shot": {
    id: "archer-shot",
    nativeCode: "3A",
    label: "射擊",
    kind: "shooting",
    target: "enemy",
    range: {
      mode: 2,
      nativeSeed: archerShooting.maximumRange,
      minimumDistance: techniqueRules.shooting.minimumManhattanRange,
      maximumDistance: archerShooting.maximumRange - 1,
    },
    damage: { minimum: 30, maximum: 49, type: "physical-ranged" },
    damagePresentation: {
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    },
    // REMAKE-138: 0000:7290 is `add cx,8` with no `add cx,ax`, so the DX=4
    // 0000:72E3 roll never reaches CX and the cast reward is flat. CX still
    // holds the death-scan total returned by 1747:000C+7A.
    experience: { fixed: 8, addKillReward: true },
    presentationId: "shoot-common",
  },
  "crossbow-shot": {
    id: "crossbow-shot",
    nativeCode: "0I",
    label: "射擊",
    kind: "shooting",
    target: "enemy",
    range: {
      mode: 2,
      nativeSeed: crossbowShooting.maximumRange,
      minimumDistance: techniqueRules.shooting.minimumManhattanRange,
      maximumDistance: crossbowShooting.maximumRange - 1,
    },
    damage: { minimum: 70, maximum: 89, type: "physical-ranged" },
    damagePresentation: {
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    },
    // REMAKE-138: same shape as the archer at 0000:72B0, discarding DX=5.
    experience: { fixed: 13, addKillReward: true },
    presentationId: "shoot-common",
  },
  "magic-archer-shot": {
    id: "magic-archer-shot",
    nativeCode: "1I",
    label: "射擊",
    kind: "shooting",
    target: "enemy",
    range: {
      mode: 2,
      nativeSeed: magicArcherShooting.maximumRange,
      minimumDistance: techniqueRules.shooting.minimumManhattanRange,
      maximumDistance: magicArcherShooting.maximumRange - 1,
    },
    damage: {
      minimum: 50,
      maximum: 69,
      type: "magic-ranged-line",
      selectedTargetMultiplier: 2,
    },
    damagePresentation: {
      mode: "line-effect-half-drain",
      waitPerPointNativeTicks: 1,
      fixedWaitNativeTicks: 20,
    },
    // REMAKE-138: native `0000:72B7` pays 26..30 because the borrowed `3V`
    // handler `0000:CCA4` already returns kill + randomBelow(5) + 13 and the
    // branch then adds a second 13 at `0000:72DC`. That duplicate is treated as
    // an original defect, so only `3V`'s own contribution is kept here; the
    // branch's own DX=5 roll was discarded natively and is not modelled.
    experience: { base: 13, randomMinimum: 0, randomMaximum: 4, addKillReward: true },
    presentationId: "shoot-line",
  },
  "fire-1": {
    id: "fire-1",
    nativeCode: "1F",
    label: "初級炎暴",
    kind: "technique",
    target: "enemy",
    range: { mode: 0, selectionRadius: fireDispatch.selectionRadius },
    damage: {
      type: "magic",
      maxLifePercent: fireTier.percentMaxLife,
      cap: fireTier.damageCap,
      blockedByMagicGuard: true,
      clearsMagicGuard: true,
    },
    damagePresentation: {
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    },
    experience: {
      base: fireTier.experienceBase,
      randomMinimum: fireTier.experienceRandom[0],
      randomMaximum: fireTier.experienceRandom[1],
      addKillReward: true,
    },
    presentationId: "fire-1",
  },
  "heal-1": {
    id: "heal-1",
    nativeCode: "1H",
    label: "初級治療",
    kind: "technique",
    target: "ally",
    range: { mode: 0, selectionRadius: healDispatch.selectionRadius },
    healing: {
      maxLifePercent: healTier.maxLifePercent,
    },
    experience: {
      base: healTier.experienceBase,
      randomMinimum: healTier.experienceRandom[0],
      randomMaximum: healTier.experienceRandom[1],
    },
    presentationId: "heal-1",
  },
};

const source = `// Generated by scripts/generate-stage0-actions.mjs from native action and presentation evidence.\n`
  + `// Do not hand-edit.\n`
  + `export const STAGE0_ACTION_DEFINITIONS = ${JSON.stringify(actions, null, 2)} as const;\n\n`
  + `export type Stage0ActionId = keyof typeof STAGE0_ACTION_DEFINITIONS;\n\n`
  + `export const STAGE0_FULL_COMBAT_PROFILES = ${JSON.stringify(fullCombatProfiles, null, 2)} as const;\n\n`
  + `export const STAGE0_FULL_COMBAT_GEOMETRY = ${JSON.stringify(fullCombatGeometry, null, 2)} as const;\n\n`
  + `export const STAGE0_FULL_COMBAT_ASSETS = ${JSON.stringify(fullCombatAssets, null, 2)} as const;\n\n`
  + `export const STAGE0_FULL_COMBAT_FRAME_META = ${JSON.stringify(fullCombatFrameMeta, null, 2)} as const;\n\n`
  + `export const STAGE0_FULL_COMBAT_COMMON_EFFECTS = ${JSON.stringify(fullCombatCommonEffects, null, 2)} as const;\n\n`
  + `export const STAGE0_FULL_COMBAT_DEATH = ${JSON.stringify(fullCombatDeath, null, 2)} as const;\n\n`
  + `export const STAGE0_ACTION_PRESENTATION_ASSETS = ${JSON.stringify(actionPresentationAssets, null, 2)} as const;\n\n`
  + `export const STAGE0_REST_PRESENTATION = ${JSON.stringify(restPresentation, null, 2)} as const;\n\n`
  + `export const STAGE0_ACTION_AUDIO_ASSETS = ${JSON.stringify({
    ...Object.fromEntries(classVoiceRecords.map((record) => [
      `e-${record}`,
      `/assets/original/audio/e/${record}.wav`,
    ])),
    "e-36": "/assets/original/audio/e/36.wav",
    "magic-83": "/assets/original/audio/magic/83.wav",
  }, null, 2)} as const;\n`;

await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, source, "utf8"));

console.log(
  `wrote generated M00.6 action catalog, ${classSpecs.length}-class combat evidence/assets, ` +
  "and map-action assets",
);
