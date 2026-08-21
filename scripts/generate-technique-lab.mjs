#!/usr/bin/env node

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesPath = path.join(root, "reverse/parsed/native/technique-rules.json");
const presentationsPath = path.join(root, "reverse/parsed/native/technique-presentations.json");
const remainingPresentationsPath = path.join(
  root,
  "reverse/parsed/native/remaining-technique-presentations.json",
);
const catalogPath = path.join(root, "src/game/content/class-catalog.generated.ts");
const outputPath = path.join(root, "src/game/content/technique-lab.generated.ts");
const publicRoot = path.join(root, "public/assets/original/technique-lab");
const planarRoot = path.join(root, "reverse/renders/planar/A");

const [rules, presentations, remainingPresentations, catalogSource] = await Promise.all([
  readFile(rulesPath, "utf8").then(JSON.parse),
  readFile(presentationsPath, "utf8").then(JSON.parse),
  readFile(remainingPresentationsPath, "utf8").then(JSON.parse),
  readFile(catalogPath, "utf8"),
]);

const classIdsMatch = catalogSource.match(/export const CLASS_IDS = (\[[\s\S]*?\]) as const;/);
if (!classIdsMatch) throw new Error("could not read CLASS_IDS from generated class catalog");
const classIds = JSON.parse(classIdsMatch[1]);
if (classIds.length !== 39) throw new Error(`expected 39 class records, received ${classIds.length}`);

const assertEqual = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const lightningActions = presentations.presentations.lightning.actions;
const lightningTiers = rules.rules.families.L.tiers;
const fireActions = presentations.presentations.fire.actions;
const fireTiers = rules.rules.families.F.tiers;
const implementedFireCodes = ["1F", "2F", "3F", "4F"];
const healActions = presentations.presentations.heal.actions;
const healTiers = rules.rules.families.H.tiers;
const implementedHealCodes = ["2H", "3H"];
const icePresentation = presentations.presentations.ice;
const iceActions = icePresentation.actions;
const iceTiers = rules.rules.families.C.tiers;
const dispelPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "TR");
if (!dispelPresentation) throw new Error("missing TR dispel presentation");
const attackUpPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "AA");
if (!attackUpPresentation) throw new Error("missing AA attack-up presentation");
const attackUpDispatch = rules.dispatchTable.entries
  .find(({ actionCode }) => actionCode === "AA");
if (!attackUpDispatch) throw new Error("missing AA dispatch evidence");
const attackUpDefinition = {
  ...attackUpPresentation,
  selectionRadius: attackUpDispatch.selectionRadius,
  effectiveAttackDelta: 20,
  statusCounter: 3,
  experienceBase: 10,
  experienceRandom: [0, 3],
};
assertEqual({
  code: attackUpDefinition.code,
  selectionRadius: attackUpDefinition.selectionRadius,
  resource: attackUpDefinition.phases[0].resource,
  runtimeTileCodePairs: attackUpDefinition.phases[0].runtimeTileCodePairs,
  drawCount: attackUpDefinition.phases[0].drawCount,
  waitPerDrawNativeTicks: attackUpDefinition.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: attackUpDefinition.fixedGraphicWaitNativeTicks,
  audioRequests: attackUpDefinition.audioRequests,
}, {
  code: "AA",
  selectionRadius: 4,
  resource: "MAGIC/16",
  runtimeTileCodePairs: Array.from({ length: 20 }, (_, index) => [index + 1, index + 21]),
  drawCount: 20,
  waitPerDrawNativeTicks: 15,
  fixedGraphicWaitNativeTicks: 300,
  audioRequests: [{
    resource: "UN/51",
    entry: "0000:0224",
    afterFixedWaitNativeTicks: 0,
  }],
}, "AA laboratory contract");
const magicGuardPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "FM");
if (!magicGuardPresentation) throw new Error("missing FM magic-guard presentation");
const magicGuardDispatch = rules.dispatchTable.entries
  .find(({ actionCode }) => actionCode === "FM");
if (!magicGuardDispatch) throw new Error("missing FM dispatch evidence");
const magicGuardDefinition = {
  ...magicGuardPresentation,
  selectionRadius: magicGuardDispatch.selectionRadius,
  statusCounter: 1,
  experienceBase: 10,
  experienceRandom: [0, 3],
};
assertEqual({
  code: magicGuardDefinition.code,
  selectionRadius: magicGuardDefinition.selectionRadius,
  mutation: magicGuardDefinition.mutation,
  resource: magicGuardDefinition.phases[0].resource,
  runtimeTileCodePairs: magicGuardDefinition.phases[0].runtimeTileCodePairs,
  drawCount: magicGuardDefinition.phases[0].drawCount,
  waitPerDrawNativeTicks: magicGuardDefinition.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: magicGuardDefinition.fixedGraphicWaitNativeTicks,
  audioRequests: magicGuardDefinition.audioRequests,
}, {
  code: "FM",
  selectionRadius: 7,
  mutation: "unit+0C = 8001h",
  resource: "MAGIC/16",
  runtimeTileCodePairs: Array.from({ length: 20 }, (_, index) => [index + 1, index + 21]),
  drawCount: 20,
  waitPerDrawNativeTicks: 15,
  fixedGraphicWaitNativeTicks: 300,
  audioRequests: [{
    resource: "UN/51",
    entry: "0000:0224",
    afterFixedWaitNativeTicks: 0,
  }],
}, "FM laboratory contract");
const poisonPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "IP");
if (!poisonPresentation) throw new Error("missing IP poison presentation");
const poisonDispatch = rules.dispatchTable.entries
  .find(({ actionCode }) => actionCode === "IP");
if (!poisonDispatch) throw new Error("missing IP dispatch evidence");
const poisonDefinition = {
  ...poisonPresentation,
  selectionRadius: poisonDispatch.selectionRadius,
  statusCounter: 3,
  experienceBase: 14,
  experienceRandom: [0, 3],
  immuneClassIds: ["dragon", "head", "hand"],
};
assertEqual({
  code: poisonDefinition.code,
  selectionRadius: poisonDefinition.selectionRadius,
  resources: poisonDefinition.phases.map(({ resource }) => resource),
  drawCounts: poisonDefinition.phases.map(({ drawCount }) => drawCount),
  waits: poisonDefinition.phases.map(({ waitPerDrawNativeTicks }) => waitPerDrawNativeTicks),
  fixedGraphicWaitNativeTicks: poisonDefinition.fixedGraphicWaitNativeTicks,
  audioRequests: poisonDefinition.audioRequests,
  mutation: poisonDefinition.mutation,
}, {
  code: "IP",
  selectionRadius: 6,
  resources: ["MAGIC/17", "MAGIC/18"],
  drawCounts: [13, 16],
  waits: [10, 10],
  fixedGraphicWaitNativeTicks: 290,
  audioRequests: [{
    resource: "E/58",
    entry: "0000:0220",
    afterFixedWaitNativeTicks: 130,
  }],
  mutation: "unit+14 = 8003h unless class is 1P/2P/3P",
}, "IP laboratory contract");
const confusionPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "LA");
if (!confusionPresentation) throw new Error("missing LA confusion presentation");
const confusionDispatch = rules.dispatchTable.entries
  .find(({ actionCode }) => actionCode === "LA");
if (!confusionDispatch) throw new Error("missing LA dispatch evidence");
const confusionDefinition = {
  ...confusionPresentation,
  selectionRadius: confusionDispatch.selectionRadius,
  statusCounter: 3,
  experienceBase: 14,
  experienceRandom: [0, 3],
  immuneClassIds: ["dragon", "head", "hand"],
};
assertEqual({
  code: confusionDefinition.code,
  selectionRadius: confusionDefinition.selectionRadius,
  resource: confusionDefinition.phases[0].resource,
  descriptorFrames: confusionDefinition.phases[0].descriptorSequence
    .map(({ low7BitFrameIndices }) => low7BitFrameIndices),
  drawCount: confusionDefinition.phases[0].drawCount,
  waitPerDrawNativeTicks: confusionDefinition.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: confusionDefinition.fixedGraphicWaitNativeTicks,
  audioRequests: confusionDefinition.audioRequests,
  mutation: confusionDefinition.mutation,
}, {
  code: "LA",
  selectionRadius: 5,
  resource: "MAGIC/44",
  descriptorFrames: [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11],
    [12, 13, 14, 15, 16, 17],
    [18, 19, 20, 21, 22, 23],
    [24, 25, 26, 27, 28, 29],
    [30, 31, 32, 33, 34, 35],
    [36, 37, 38, 39, 40, 41],
    [42, 43, 44, 45, 46, 47],
    [30, 31, 32, 33, 34, 35],
    [36, 37, 38, 39, 40, 41],
    [42, 43, 44, 45, 46, 47],
  ],
  drawCount: 11,
  waitPerDrawNativeTicks: 15,
  fixedGraphicWaitNativeTicks: 165,
  audioRequests: [],
  mutation: "unit+0E = 8003h unless class is 1P/2P/3P",
}, "LA laboratory contract");
const attackDownPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "SA");
if (!attackDownPresentation) throw new Error("missing SA attack-down presentation");
const attackDownDispatch = rules.dispatchTable.entries
  .find(({ actionCode }) => actionCode === "SA");
if (!attackDownDispatch) throw new Error("missing SA dispatch evidence");
const attackDownDefinition = {
  ...attackDownPresentation,
  selectionRadius: attackDownDispatch.selectionRadius,
  statusCounter: 3,
  effectiveAttackDelta: -20,
  experienceBase: 10,
  experienceRandom: [0, 3],
};
assertEqual({
  code: attackDownDefinition.code,
  selectionRadius: attackDownDefinition.selectionRadius,
  resource: attackDownDefinition.phases[0].resource,
  descriptorFrames: attackDownDefinition.phases[0].descriptorSequence
    .map(({ low7BitFrameIndices }) => low7BitFrameIndices),
  drawCount: attackDownDefinition.phases[0].drawCount,
  waitPerDrawNativeTicks: attackDownDefinition.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: attackDownDefinition.fixedGraphicWaitNativeTicks,
  audioRequests: attackDownDefinition.audioRequests,
  mutation: attackDownDefinition.mutation,
}, {
  code: "SA",
  selectionRadius: 4,
  resource: "MAGIC/46",
  descriptorFrames: Array.from({ length: 11 }, (_, index) => [index * 2, index * 2 + 1]),
  drawCount: 11,
  waitPerDrawNativeTicks: 15,
  fixedGraphicWaitNativeTicks: 165,
  audioRequests: [{
    resource: "E/8",
    entry: "0000:0224",
    afterFixedWaitNativeTicks: 0,
  }],
  mutation: "unit+10 = 8003h",
}, "SA laboratory contract");
const defenseDownPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "SD");
if (!defenseDownPresentation) throw new Error("missing SD defense-down presentation");
const defenseDownDispatch = rules.dispatchTable.entries
  .find(({ actionCode }) => actionCode === "SD");
if (!defenseDownDispatch) throw new Error("missing SD dispatch evidence");
const defenseDownDefinition = {
  ...defenseDownPresentation,
  selectionRadius: defenseDownDispatch.selectionRadius,
  statusCounter: 3,
  effectiveDefenseDelta: -20,
  experienceBase: 10,
  experienceRandom: [0, 3],
};
assertEqual({
  code: defenseDownDefinition.code,
  selectionRadius: defenseDownDefinition.selectionRadius,
  resource: defenseDownDefinition.phases[0].resource,
  descriptorFrames: defenseDownDefinition.phases[0].descriptorSequence
    .map(({ low7BitFrameIndices }) => low7BitFrameIndices),
  drawCount: defenseDownDefinition.phases[0].drawCount,
  waitPerDrawNativeTicks: defenseDownDefinition.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: defenseDownDefinition.fixedGraphicWaitNativeTicks,
  audioRequests: defenseDownDefinition.audioRequests,
  mutation: defenseDownDefinition.mutation,
}, {
  code: "SD",
  selectionRadius: 4,
  resource: "MAGIC/45",
  descriptorFrames: Array.from({ length: 10 }, (_, index) =>
    Array.from({ length: 4 }, (_, frame) => index * 4 + frame)),
  drawCount: 10,
  waitPerDrawNativeTicks: 15,
  fixedGraphicWaitNativeTicks: 150,
  audioRequests: [{
    resource: "E/8",
    entry: "0000:0224",
    afterFixedWaitNativeTicks: 0,
  }],
  mutation: "unit+12 = 8003h",
}, "SD laboratory contract");
const spellSealPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "SN");
if (!spellSealPresentation) throw new Error("missing SN spell-seal presentation");
const spellSealDispatch = rules.dispatchTable.entries
  .find(({ actionCode }) => actionCode === "SN");
if (!spellSealDispatch) throw new Error("missing SN dispatch evidence");
const spellSealDefinition = {
  ...spellSealPresentation,
  selectionRadius: spellSealDispatch.selectionRadius,
  statusCounter: 3,
  immuneClassIds: ["dragon"],
  experienceBase: 14,
  experienceRandom: [0, 3],
};
assertEqual({
  code: spellSealDefinition.code,
  selectionRadius: spellSealDefinition.selectionRadius,
  resource: spellSealDefinition.phases[0].resource,
  descriptorFrames: spellSealDefinition.phases[0].descriptorSequence
    .map(({ low7BitFrameIndices }) => low7BitFrameIndices),
  drawCount: spellSealDefinition.phases[0].drawCount,
  waitPerDrawNativeTicks: spellSealDefinition.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: spellSealDefinition.fixedGraphicWaitNativeTicks,
  audioRequests: spellSealDefinition.audioRequests,
  mutation: spellSealDefinition.mutation,
  immuneClasses: spellSealDefinition.immuneClasses,
}, {
  code: "SN",
  selectionRadius: 7,
  resource: "MAGIC/36",
  descriptorFrames: [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11],
    [12, 13, 14, 15, 16, 17],
    [18, 19, 20, 21, 22, 23],
    [24, 25, 26, 27, 28, 29],
    [24, 25, 26, 27, 28, 29],
    [30, 31, 32, 33, 34, 35],
    [36, 37, 38, 39, 40, 41],
    [null, null, null, 42, 43, 44],
  ],
  drawCount: 9,
  waitPerDrawNativeTicks: 25,
  fixedGraphicWaitNativeTicks: 225,
  audioRequests: [],
  mutation: "unit+16 = 8003h unless class is 1P",
  immuneClasses: ["1P"],
}, "SN laboratory contract");
const prayerPresentation = remainingPresentations.presentations.prayer;
const prayerDispatch = rules.dispatchTable.entries
  .find(({ actionCode }) => actionCode === "OJ");
if (!prayerDispatch) throw new Error("missing OJ dispatch evidence");
const prayerDefinition = {
  ...prayerPresentation,
  ignoredNativeSelectionWord: prayerDispatch.selectionRadius,
  eligibleSide: 1,
  gateBit: 0,
  outcomeRoll: [0, 3],
  amountRoll: [5, 14],
  procedural: {
    screen: { width: 640, height: 400 },
    fieldRows: 16,
    fieldYStart: 240,
    fieldYStep: 8,
    fieldColumns: [
      { x: 150, variant: 1 },
      { x: 200, variant: 0 },
    ],
    decorationRuns: [
      { start: 240, colors: [14, 0, 11, 14, 0] },
      { start: 368, colors: [0, 14, 11, 0, 14] },
    ],
    cornerPairs: [
      { x: 150, y: 240, color: 5 },
      { x: 198, y: 240, color: 5 },
      { x: 150, y: 365, color: 5 },
      { x: 198, y: 365, color: 5 },
    ],
    resultTextPosition: { x: 248, y: 158 },
  },
};
assertEqual({
  code: prayerDefinition.family,
  ignoredNativeSelectionWord: prayerDefinition.ignoredNativeSelectionWord,
  eligibility: prayerDefinition.scan.eligibility,
  gate: prayerDefinition.scan.perUnitGate,
  outcomeRoll: prayerDefinition.outcomeRoll,
  amountRoll: prayerDefinition.amountRoll,
  graphics: prayerDefinition.resourceLoads.graphicArchiveRecords,
  audio: prayerDefinition.resourceLoads.audioArchiveRecords,
  hold: prayerDefinition.presentation.resultHold,
}, {
  code: "OJ",
  ignoredNativeSelectionWord: 4,
  eligibility: "occupied and side is not 2",
  gate: "read PIT channel-0 low byte and continue only when bit0 is 1 (approximately one half)",
  outcomeRoll: [0, 3],
  amountRoll: [5, 14],
  graphics: [],
  audio: [],
  hold: {
    entry: "1000:5993",
    iterations: 30,
    waitPerIterationNativeTicks: 2,
    maximumNativeTicksPerTriggeredUnit: 60,
    skippable: "the loop exits early when DS:F590 equals 1",
  },
}, "OJ laboratory contract");
const defenseUpPresentation = remainingPresentations.presentations.statuses.actions
  .find(({ code }) => code === "AD");
if (!defenseUpPresentation) throw new Error("missing AD defense-up presentation");
const defenseUpDispatch = rules.dispatchTable.entries
  .find(({ actionCode }) => actionCode === "AD");
if (!defenseUpDispatch) throw new Error("missing AD dispatch evidence");
const defenseUpDefinition = {
  ...defenseUpPresentation,
  selectionRadius: defenseUpDispatch.selectionRadius,
  effectiveDefenseDelta: 20,
  statusCounter: 3,
  experienceBase: 10,
  experienceRandom: [0, 3],
};
assertEqual({
  code: defenseUpDefinition.code,
  selectionRadius: defenseUpDefinition.selectionRadius,
  resource: defenseUpDefinition.phases[0].resource,
  descriptors: defenseUpDefinition.phases[0].descriptorSequence.map((descriptor) => ({
    xOffset: descriptor.xOffset,
    yOffset: descriptor.yOffset,
    width: descriptor.width,
    height: descriptor.height,
    low7BitFrameIndices: descriptor.low7BitFrameIndices,
  })),
  drawCount: defenseUpDefinition.phases[0].drawCount,
  waitPerDrawNativeTicks: defenseUpDefinition.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: defenseUpDefinition.fixedGraphicWaitNativeTicks,
  audioRequests: defenseUpDefinition.audioRequests,
}, {
  code: "AD",
  selectionRadius: 4,
  resource: "MAGIC/33",
  descriptors: [0, 4, 8, 12, 16, 20, 16, 12, 8, 4, 0].map((frame) => ({
    xOffset: -1,
    yOffset: -1,
    width: 2,
    height: 2,
    low7BitFrameIndices: [frame, frame + 1, frame + 2, frame + 3],
  })),
  drawCount: 11,
  waitPerDrawNativeTicks: 15,
  fixedGraphicWaitNativeTicks: 165,
  audioRequests: [{
    resource: "UN/52",
    entry: "0000:0224",
    afterFixedWaitNativeTicks: 0,
  }],
}, "AD laboratory contract");
const stompPresentation = remainingPresentations.presentations.stomp;
const stompDefinitions = Object.fromEntries(stompPresentation.actions.map((action) => {
  const tier = rules.rules.families.D.tiers.find(({ code }) => code === action.code);
  if (!tier) throw new Error(`missing ${action.code} stomp evidence`);
  return [action.code, {
    ...stompPresentation,
    action,
    selectionRadius: rules.rules.families.D.selectionRadius,
    damageBase: tier.damageBase,
  }];
}));
const stompDefinition = stompDefinitions["1D"];
const stomp2Definition = stompDefinitions["2D"];
const stomp3Definition = stompDefinitions["3D"];
if (!stompDefinition || !stomp2Definition || !stomp3Definition) {
  throw new Error("missing implemented stomp evidence");
}
const engineering = remainingPresentations.presentations.engineering;
const ironPlate = engineering.actions.find(({ code }) => code === "1K");
const obstacle = engineering.actions.find(({ code }) => code === "2K");
if (!ironPlate || !obstacle) throw new Error("missing engineering evidence");
assertEqual({
  code: ironPlate.code,
  placement: engineering.playerRoute.placement,
  neighborOffsets: engineering.playerRoute.neighborOffsets,
  experience: engineering.playerRoute.experience,
  graphics: engineering.resourceLoads.graphicArchiveRecords,
  audio: engineering.resourceLoads.audioArchiveRecords,
}, {
  code: "1K",
  placement: "seed 5 mode M; select an empty destination and complete the normal movement presentation to that cell",
  neighborOffsets: [50, -50, 1, -1],
  experience: 0,
  graphics: [],
  audio: [],
}, "1K laboratory contract");
assertEqual({
  code: obstacle.code,
  placement: engineering.playerRoute.placement,
  neighborOffsets: engineering.playerRoute.neighborOffsets,
  experience: engineering.playerRoute.experience,
  graphics: engineering.resourceLoads.graphicArchiveRecords,
  audio: engineering.resourceLoads.audioArchiveRecords,
}, {
  code: "2K",
  placement: "seed 5 mode M; select an empty destination and complete the normal movement presentation to that cell",
  neighborOffsets: [50, -50, 1, -1],
  experience: 0,
  graphics: [],
  audio: [],
}, "2K laboratory contract");
assertEqual(
  lightningActions.map(({ code, effectRadius, fixedGraphicWaitNativeTicks }) => ({
    code,
    effectRadius,
    fixedGraphicWaitNativeTicks,
  })),
  [
    { code: "1L", effectRadius: 3, fixedGraphicWaitNativeTicks: 414 },
    { code: "2L", effectRadius: 4, fixedGraphicWaitNativeTicks: 257 },
    { code: "3L", effectRadius: 4, fixedGraphicWaitNativeTicks: 348 },
    { code: "4L", effectRadius: 5, fixedGraphicWaitNativeTicks: 304 },
  ],
  "lightning presentation contracts",
);
const lightning3 = lightningActions.find(({ code }) => code === "3L");
if (!lightning3) throw new Error("missing 3L lightning presentation");
assertEqual(
  lightning3.phases.map(({ anchorOffsetSequence }) => anchorOffsetSequence),
  [
    Array.from({ length: 12 }, (_, index) => ({
      x: 0,
      y: index < 3 ? 0 : -Math.floor(index / 3),
    })),
    Array.from({ length: 15 }, () => ({ x: 0, y: -4 })),
  ],
  "3L rising cloud and strike-point anchors",
);
const lightning4 = lightningActions.find(({ code }) => code === "4L");
if (!lightning4) throw new Error("missing 4L lightning presentation");
assertEqual(
  lightning4.phases.map(({ anchorOffsetSequence }) => anchorOffsetSequence),
  [
    Array.from({ length: 18 }, (_, index) => ({
      x: 0,
      y: -8 + Math.floor(index / 2),
    })),
    Array.from({ length: 4 }, () => ({ x: 0, y: 1 })),
    Array.from({ length: 6 }, () => ({ x: 0, y: 1 })),
    Array.from({ length: 4 }, () => ({ x: 0, y: 1 })),
  ],
  "4L descending bolt and strike-point anchors",
);
assertEqual(
  iceActions.map(({
    code,
    effectRadius,
    cycles,
    rangeValueSequence,
    distanceFromCenterSequence,
    fixedGraphicWaitNativeTicks,
  }) => ({
    code,
    effectRadius,
    cycles,
    rangeValueSequence,
    distanceFromCenterSequence,
    fixedGraphicWaitNativeTicks,
  })),
  [
    { code: "1C", effectRadius: 3, cycles: 2, rangeValueSequence: [2, 1], distanceFromCenterSequence: [1, 2], fixedGraphicWaitNativeTicks: 120 },
    { code: "2C", effectRadius: 4, cycles: 3, rangeValueSequence: [3, 2, 1], distanceFromCenterSequence: [1, 2, 3], fixedGraphicWaitNativeTicks: 180 },
    { code: "3C", effectRadius: 5, cycles: 4, rangeValueSequence: [4, 3, 2, 1], distanceFromCenterSequence: [1, 2, 3, 4], fixedGraphicWaitNativeTicks: 240 },
    { code: "4C", effectRadius: 6, cycles: 5, rangeValueSequence: [5, 4, 3, 2, 1], distanceFromCenterSequence: [1, 2, 3, 4, 5], fixedGraphicWaitNativeTicks: 300 },
  ],
  "ice inner-to-outer range-stage contracts",
);

const menuLabels = new Map();
for (const classEntry of rules.techniqueMenu.classes) {
  for (const tier of classEntry.tiers) {
    for (const entry of tier.entries) menuLabels.set(entry.actionCode, entry.label.text.trim());
  }
}
const implementedByCode = {
  "1C": "ice-1",
  "1D": "stomp-1",
  "1K": "iron-plate",
  "2K": "obstacle",
  "2C": "ice-2",
  "2D": "stomp-2",
  "3D": "stomp-3",
  "3C": "ice-3",
  "4C": "ice-4",
  "1F": "fire-1",
  "2F": "fire-2",
  "3F": "fire-3",
  "4F": "fire-4",
  "1H": "heal-1",
  "2H": "heal-2",
  "3H": "heal-3",
  "1I": "recovery-1",
  "2I": "recovery-2",
  "3I": "recovery-3",
  "1L": "lightning-1",
  "2L": "lightning-2",
  "3L": "lightning-3",
  "4L": "lightning-4",
  "AA": "attack-up",
  "AD": "defense-up",
  "FM": "magic-guard",
  "IP": "poison",
  "LA": "confusion",
  "SA": "attack-down",
  "SD": "defense-down",
  "SN": "spell-seal",
  "OJ": "prayer",
  "TR": "dispel",
};
const techniques = rules.techniqueMenu.uniqueVisibleActionCodes.map((nativeCode) => ({
  nativeCode,
  label: menuLabels.get(nativeCode) ?? nativeCode,
  implementationId: implementedByCode[nativeCode] ?? null,
}));

// Remove the pre-atlas laboratory-only export if it exists. Map effects now
// consume the formal campaign presentation catalogs directly.
await rm(path.join(publicRoot, "lightning"), { recursive: true, force: true });

function imageDimensions(source) {
  const dimensions = execFileSync("magick", ["identify", "-format", "%w %h", source], {
    encoding: "utf8",
  }).trim().split(" ").map(Number);
  if (dimensions.length !== 2 || dimensions.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error(`could not read image dimensions for ${source}`);
  }
  return dimensions;
}

function copyAlphaMask(colorFrame, maskFrame, output, { flipMask = false } = {}) {
  const [maskWidth, maskHeight] = imageDimensions(maskFrame);
  execFileSync("magick", [
    "-define", "png:exclude-chunk=date,time",
    colorFrame,
    "-background", "black",
    "-gravity", "northwest",
    "-extent", `${maskWidth}x${maskHeight}`,
    "(", maskFrame, "-alpha", "extract", ...(flipMask ? ["-flop"] : []), ")",
    "-alpha", "off",
    "-compose", "CopyOpacity",
    "-composite",
    output,
  ]);
}

const unitDirectory = path.join(publicRoot, "units");
await mkdir(unitDirectory, { recursive: true });
const unitAssets = {};
// A/0003 frame 5 is the one ordinary side-2 figure drawn facing the opposite
// horizontal direction from its A/0002 alpha source. Keeping this evidence
// exception explicit avoids damaging the other 35 same-orientation records.
const horizontallyFlippedEnemyMaskRecords = new Set([5]);
for (const [record, classId] of classIds.entries()) {
  const frame = `${String(record).padStart(2, "0")}.png`;
  const allyFilename = `ally-${classId}.png`;
  const enemyFilename = `enemy-${classId}.png`;
  const allySource = path.join(planarRoot, "0002", frame);
  // A/0003/36 contains the Dragon's native side-2 colors but stores palette
  // index zero as an opaque background. A/0011/36 has identical visible RGB
  // and carries the transparent silhouette used on the map. Records 37/38 are
  // different-sized boss-part resources in A/0011, so keep this correction
  // specific to record 36.
  const enemySource = path.join(planarRoot, record === 36 ? "0011" : "0003", frame);
  const allyOutput = path.join(unitDirectory, allyFilename);
  const enemyOutput = path.join(unitDirectory, enemyFilename);
  const ally = record <= 35
    ? `/assets/original/technique-lab/units/${allyFilename}`
    : null;
  if (ally) await copyFile(allySource, allyOutput);
  if (record <= 35) {
    copyAlphaMask(enemySource, allySource, enemyOutput, {
      flipMask: horizontallyFlippedEnemyMaskRecords.has(record),
    });
  }
  else await copyFile(enemySource, enemyOutput);
  unitAssets[classId] = {
    nativeRecord: record,
    ally,
    enemy: `/assets/original/technique-lab/units/${enemyFilename}`,
  };
}

const lightningDefinitions = Object.fromEntries(lightningActions.map((presentation) => {
  const tier = lightningTiers.find(({ code }) => code === presentation.code);
  if (!tier) throw new Error(`missing ${presentation.code} lightning rules tier`);
  return [presentation.code, {
    ...presentation,
    selectionRadius: tier.selectionRadius,
    damageByRangeValue: tier.damageByRangeValue,
  }];
}));
const fireDefinitions = Object.fromEntries(fireActions
  .filter(({ code }) => implementedFireCodes.includes(code))
  .map((presentation) => {
    const tier = fireTiers.find(({ code }) => code === presentation.code);
    const dispatch = rules.dispatchTable.entries.find(
      ({ actionCode }) => actionCode === presentation.code,
    );
    if (!tier || !dispatch) throw new Error(`missing ${presentation.code} fire rules`);
    return [presentation.code, {
      ...presentation,
      selectionRadius: dispatch.selectionRadius,
      percentMaxLife: tier.percentMaxLife,
      damageCap: tier.damageCap,
      experienceBase: tier.experienceBase,
      experienceRandom: tier.experienceRandom,
    }];
  }));
assertEqual(Object.values(fireDefinitions).map((definition) => ({
  code: definition.code,
  selectionRadius: definition.selectionRadius,
  percentMaxLife: definition.percentMaxLife,
  damageCap: definition.damageCap,
  experienceBase: definition.experienceBase,
  experienceRandom: definition.experienceRandom,
  resources: definition.phases.map(({ resource }) => resource),
  drawCounts: definition.phases.map(({ drawCount }) => drawCount),
  waits: definition.phases.map(({ waitPerDrawNativeTicks }) => waitPerDrawNativeTicks),
  fixedGraphicWaitNativeTicks: definition.fixedGraphicWaitNativeTicks,
  audioRequests: definition.audioRequests.map(({ resource, afterFixedWaitNativeTicks }) => ({
    resource,
    afterFixedWaitNativeTicks,
  })),
})), [
  {
    code: "1F",
    selectionRadius: 5,
    percentMaxLife: 18,
    damageCap: 108,
    experienceBase: 8,
    experienceRandom: [0, 1],
    resources: ["MAGIC/22"],
    drawCounts: [7],
    waits: [10],
    fixedGraphicWaitNativeTicks: 70,
    audioRequests: [{ resource: "MAGIC/83", afterFixedWaitNativeTicks: 0 }],
  },
  {
    code: "2F",
    selectionRadius: 6,
    percentMaxLife: 26,
    damageCap: 156,
    experienceBase: 10,
    experienceRandom: [0, 1],
    resources: ["MAGIC/23"],
    drawCounts: [12],
    waits: [10],
    fixedGraphicWaitNativeTicks: 120,
    audioRequests: [{ resource: "MAGIC/83", afterFixedWaitNativeTicks: 0 }],
  },
  {
    code: "3F",
    selectionRadius: 7,
    percentMaxLife: 32,
    damageCap: 192,
    experienceBase: 12,
    experienceRandom: [0, 2],
    resources: ["MAGIC/27"],
    drawCounts: [13],
    waits: [15],
    fixedGraphicWaitNativeTicks: 195,
    audioRequests: [{ resource: "MAGIC/83", afterFixedWaitNativeTicks: 0 }],
  },
  {
    code: "4F",
    selectionRadius: 7,
    percentMaxLife: 44,
    damageCap: 270,
    experienceBase: 15,
    experienceRandom: [0, 2],
    resources: ["MAGIC/30", "MAGIC/28", "MAGIC/29"],
    drawCounts: [12, 8, 9],
    waits: [10, 10, 10],
    fixedGraphicWaitNativeTicks: 290,
    audioRequests: [
      { resource: "MAGIC/83", afterFixedWaitNativeTicks: 0 },
      { resource: "E/51", afterFixedWaitNativeTicks: 120 },
    ],
  },
], "implemented fire laboratory contracts");
assertEqual(
  fireDefinitions["4F"].phases.map(({ anchorOffsetSequence }) => anchorOffsetSequence),
  [
    Array.from({ length: 12 }, () => ({ x: 0, y: 0 })),
    Array.from({ length: 8 }, () => ({ x: 0, y: 0 })),
    [
      ...Array.from({ length: 4 }, () => ({ x: 0, y: 0 })),
      ...Array.from({ length: 5 }, (_, index) => ({ x: 0, y: -index })),
    ],
  ],
  "ultimate fire MAGIC/29 rising anchors",
);
const healDefinitions = Object.fromEntries(healActions
  .filter(({ code }) => implementedHealCodes.includes(code))
  .map((presentation) => {
    const tier = healTiers.find(({ code }) => code === presentation.code);
    const dispatch = rules.dispatchTable.entries.find(
      ({ actionCode }) => actionCode === presentation.code,
    );
    if (!tier || !dispatch) throw new Error(`missing ${presentation.code} heal rules`);
    return [presentation.code, {
      ...presentation,
      selectionRadius: dispatch.selectionRadius,
      maxLifePercent: tier.maxLifePercent,
      experienceBase: tier.experienceBase,
      experienceRandom: tier.experienceRandom,
    }];
  }));
assertEqual(Object.values(healDefinitions).map((definition) => ({
  code: definition.code,
  selectionRadius: definition.selectionRadius,
  maxLifePercent: definition.maxLifePercent,
  experienceBase: definition.experienceBase,
  experienceRandom: definition.experienceRandom,
  resources: definition.phases.map(({ resource }) => resource),
  drawCounts: definition.phases.map(({ drawCount }) => drawCount),
  waits: definition.phases.map(({ waitPerDrawNativeTicks }) => waitPerDrawNativeTicks),
  fixedGraphicWaitNativeTicks: definition.fixedGraphicWaitNativeTicks,
  audioRequests: definition.audioRequests.map(({ resource, afterFixedWaitNativeTicks }) => ({
    resource,
    afterFixedWaitNativeTicks,
  })),
})), [
  {
    code: "2H",
    selectionRadius: 6,
    maxLifePercent: 36,
    experienceBase: 12,
    experienceRandom: [0, 3],
    resources: ["MAGIC/37", "MAGIC/0"],
    drawCounts: [14, 5],
    waits: [10, 15],
    fixedGraphicWaitNativeTicks: 215,
    audioRequests: [{ resource: "E/36", afterFixedWaitNativeTicks: 0 }],
  },
  {
    code: "3H",
    selectionRadius: 7,
    maxLifePercent: 48,
    experienceBase: 15,
    experienceRandom: [0, 2],
    resources: ["MAGIC/42", "MAGIC/41", "MAGIC/42", "MAGIC/0"],
    drawCounts: [5, 18, 5, 5],
    waits: [6, 5, 8, 15],
    fixedGraphicWaitNativeTicks: 235,
    audioRequests: [{ resource: "E/36", afterFixedWaitNativeTicks: 30 }],
  },
], "implemented heal laboratory contracts");
assertEqual(
  healDefinitions["2H"].phases[0].descriptorSequence.flatMap(
    ({ low7BitFrameIndices }) => low7BitFrameIndices,
  ),
  [...Array.from({ length: 42 }, (_, index) => index), ...Array.from({ length: 42 }, (_, index) => index)],
  "intermediate heal repeated six-tile descriptor frames",
);
assertEqual(
  healDefinitions["3H"].phases[1].descriptorSequence.map(({ low7BitFrameIndices }) =>
    low7BitFrameIndices),
  Array.from({ length: 3 }, () => Array.from({ length: 6 }, (_, descriptor) =>
    Array.from({ length: 6 }, (_, tile) => descriptor * 6 + tile))).flat(),
  "advanced heal three repeated MAGIC/41 descriptor passes",
);
assertEqual(
  healDefinitions["3H"].phases[2].descriptorSequence.map(({ low7BitFrameIndices }) =>
    low7BitFrameIndices),
  Array.from({ length: 5 }, (_, descriptor) =>
    Array.from({ length: 6 }, (_, tile) => (4 - descriptor) * 6 + tile)),
  "advanced heal reverse MAGIC/42 descriptor pass",
);
const iceDefinitions = Object.fromEntries(iceActions.map((presentation) => {
  const tier = iceTiers.find(({ code }) => code === presentation.code);
  if (!tier) throw new Error(`missing ${presentation.code} ice rules tier`);
  return [presentation.code, {
    ...presentation,
    centerMode: rules.rules.families.C.centerMode,
    dispatchSelectionWord: tier.dispatchSelectionWord,
    cycle: icePresentation.cycle,
    audioResource: icePresentation.audioResource,
    soundRequestEntry: icePresentation.soundRequestEntry,
  }];
}));
assertEqual({
  code: stompDefinition.action.code,
  selectionRadius: stompDefinition.selectionRadius,
  damageBase: stompDefinition.damageBase,
  graphicDrawCount: stompDefinition.presentation.graphicDrawCount,
  fixedGraphicWaitNativeTicks: stompDefinition.presentation.fixedGraphicWaitNativeTicks,
  audioResource: stompDefinition.audioResource,
}, {
  code: "1D",
  selectionRadius: 5,
  damageBase: 10,
  graphicDrawCount: 33,
  fixedGraphicWaitNativeTicks: 13,
  audioResource: "MAGIC/82",
}, "initial stomp laboratory contract");
assertEqual({
  code: stomp2Definition.action.code,
  selectionRadius: stomp2Definition.selectionRadius,
  damageBase: stomp2Definition.damageBase,
  targetImpactAnchor: stomp2Definition.presentation.targetImpactAnchor,
  drawXCoordinate: stomp2Definition.action.drawXCoordinate,
  shadowDrawYCoordinate: stomp2Definition.action.shadowDrawYCoordinate,
  graphicByTargetSide: stomp2Definition.action.graphicByTargetSide,
  graphicDrawCount: stomp2Definition.presentation.graphicDrawCount,
  fixedGraphicWaitNativeTicks: stomp2Definition.presentation.fixedGraphicWaitNativeTicks,
  audioResource: stomp2Definition.audioResource,
}, {
  code: "2D",
  selectionRadius: 5,
  damageBase: 15,
  targetImpactAnchor: { x: 240, y: 390 },
  drawXCoordinate: 160,
  shadowDrawYCoordinate: 368,
  graphicByTargetSide: { side1: "MAGIC/52", side2: "MAGIC/51" },
  graphicDrawCount: 33,
  fixedGraphicWaitNativeTicks: 13,
  audioResource: "MAGIC/82",
}, "male stomp laboratory contract");
assertEqual({
  code: stomp3Definition.action.code,
  selectionRadius: stomp3Definition.selectionRadius,
  damageBase: stomp3Definition.damageBase,
  targetImpactAnchor: stomp3Definition.presentation.targetImpactAnchor,
  drawXCoordinate: stomp3Definition.action.drawXCoordinate,
  shadowDrawYCoordinate: stomp3Definition.action.shadowDrawYCoordinate,
  graphicByTargetSide: stomp3Definition.action.graphicByTargetSide,
  graphicDrawCount: stomp3Definition.presentation.graphicDrawCount,
  fixedGraphicWaitNativeTicks: stomp3Definition.presentation.fixedGraphicWaitNativeTicks,
  audioResource: stomp3Definition.audioResource,
}, {
  code: "3D",
  selectionRadius: 5,
  damageBase: 20,
  targetImpactAnchor: { x: 240, y: 390 },
  drawXCoordinate: 160,
  shadowDrawYCoordinate: 368,
  graphicByTargetSide: { side1: "MAGIC/54", side2: "MAGIC/53" },
  graphicDrawCount: 33,
  fixedGraphicWaitNativeTicks: 13,
  audioResource: "MAGIC/82",
}, "female stomp laboratory contract");

const heal1Presentation = presentations.presentations.heal.actions
  .find(({ code }) => code === "1H");
if (!heal1Presentation) {
  throw new Error("missing initial fire/heal presentation for technique laboratory");
}
const terminalHoldNativeTicks = {
  ...Object.fromEntries(Object.values(fireDefinitions).map((presentation) => [
    presentation.code,
    presentation.phases.at(-1).waitPerDrawNativeTicks,
  ])),
  "1H": heal1Presentation.phases.at(-1).waitPerDrawNativeTicks,
  "2H": healDefinitions["2H"].phases.at(-1).waitPerDrawNativeTicks,
  "3H": healDefinitions["3H"].phases.at(-1).waitPerDrawNativeTicks,
  "1I": 15,
  "2I": 15,
  "3I": 15,
  "AA": attackUpPresentation.phases.at(-1).waitPerDrawNativeTicks,
  "FM": magicGuardPresentation.phases.at(-1).waitPerDrawNativeTicks,
  "IP": poisonPresentation.phases.at(-1).waitPerDrawNativeTicks,
  "LA": confusionPresentation.phases.at(-1).waitPerDrawNativeTicks,
  "SA": attackDownPresentation.phases.at(-1).waitPerDrawNativeTicks,
  "SD": defenseDownPresentation.phases.at(-1).waitPerDrawNativeTicks,
  "SN": spellSealPresentation.phases.at(-1).waitPerDrawNativeTicks,
  "OJ": prayerPresentation.presentation.resultHold.maximumNativeTicksPerTriggeredUnit,
  "AD": defenseUpPresentation.phases.at(-1).waitPerDrawNativeTicks,
  ...Object.fromEntries(iceActions.map(({ code }) => [
    code,
    icePresentation.cycle.waitPerDrawNativeTicks,
  ])),
  ...Object.fromEntries(lightningActions.map((presentation) => [
    presentation.code,
    presentation.commonHit.cleanup.waitPerDrawNativeTicks,
  ])),
  "TR": dispelPresentation.phases.at(-1).waitPerDrawNativeTicks,
  "1D": 0,
  "2D": 0,
  "3D": 0,
  "1K": 0,
  "2K": 0,
};
assertEqual(terminalHoldNativeTicks, {
  "1F": 10,
  "2F": 10,
  "3F": 15,
  "4F": 10,
  "1H": 15,
  "2H": 15,
  "3H": 15,
  "1I": 15,
  "2I": 15,
  "3I": 15,
  "AA": 15,
  "FM": 15,
  "IP": 10,
  "LA": 15,
  "SA": 15,
  "SD": 15,
  "SN": 25,
  "OJ": 60,
  "AD": 15,
  "1C": 10,
  "2C": 10,
  "3C": 10,
  "4C": 10,
  "1L": 10,
  "2L": 10,
  "3L": 10,
  "4L": 10,
  "TR": 5,
  "1D": 0,
  "2D": 0,
  "3D": 0,
  "1K": 0,
  "2K": 0,
}, "implemented technique terminal holds");

const source = `// Generated by scripts/generate-technique-lab.mjs from native technique evidence.\n`
  + `// Do not hand-edit.\n`
  + `export const TECHNIQUE_LAB_CATALOG = ${JSON.stringify(techniques, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_LIGHTNING = ${JSON.stringify(lightningDefinitions, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_FIRE = ${JSON.stringify(fireDefinitions, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_HEAL = ${JSON.stringify(healDefinitions, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_ATTACK_UP = ${JSON.stringify(attackUpDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_MAGIC_GUARD = ${JSON.stringify(magicGuardDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_POISON = ${JSON.stringify(poisonDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_CONFUSION = ${JSON.stringify(confusionDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_ATTACK_DOWN = ${JSON.stringify(attackDownDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_DEFENSE_DOWN = ${JSON.stringify(defenseDownDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_SPELL_SEAL = ${JSON.stringify(spellSealDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_PRAYER = ${JSON.stringify(prayerDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_DEFENSE_UP = ${JSON.stringify(defenseUpDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_ICE = ${JSON.stringify(iceDefinitions, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_DISPEL = ${JSON.stringify(dispelPresentation, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_STOMPS = ${JSON.stringify(stompDefinitions, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_STOMP = ${JSON.stringify(stompDefinition, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_IRON_PLATE = ${JSON.stringify({
    ...ironPlate,
    playerRoute: engineering.playerRoute,
    tile: "/assets/original/map-actions/iron-plate/stage-01.png",
    logicalTerrainSlot: 3,
  }, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_OBSTACLE = ${JSON.stringify({
    ...obstacle,
    playerRoute: engineering.playerRoute,
    tile: "/assets/original/map-actions/obstacle/stage-01.png",
    logicalTerrainSlot: 3,
  }, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS = ${JSON.stringify(terminalHoldNativeTicks, null, 2)} as const;\n\n`
  + `export const TECHNIQUE_LAB_UNIT_ASSETS = ${JSON.stringify(unitAssets, null, 2)} as const;\n`;

await writeFile(outputPath, source, "utf8");
console.log(`wrote ${path.relative(root, outputPath)} and technique laboratory assets`);
