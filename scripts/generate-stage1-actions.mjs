#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesPath = path.join(root, "reverse/parsed/native/technique-rules.json");
const aiRulesPath = path.join(root, "reverse/parsed/native/ai-rules.json");
const presentationsPath = path.join(root, "reverse/parsed/native/technique-presentations.json");
const remainingPresentationsPath = path.join(
  root,
  "reverse/parsed/native/remaining-technique-presentations.json",
);
const wdPath = path.join(root, "reverse/parsed/native/wd-stage26.json");
const outputPath = path.join(root, "src/game/content/stage1-actions.generated.ts");
const publicRoot = path.join(root, "public/assets/original");

const [rules, aiRules, presentations, remainingPresentations, wdDocument] = await Promise.all([
  readFile(rulesPath, "utf8").then(JSON.parse),
  readFile(aiRulesPath, "utf8").then(JSON.parse),
  readFile(presentationsPath, "utf8").then(JSON.parse),
  readFile(remainingPresentationsPath, "utf8").then(JSON.parse),
  readFile(wdPath, "utf8").then(JSON.parse),
]);

const requireEntry = (entries, predicate, label) => {
  const entry = entries.find(predicate);
  if (!entry) throw new Error(`missing ${label}`);
  return entry;
};

const assertEqual = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const lightningDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "1L",
  "1L dispatch entry",
);
const lightning2Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "2L",
  "2L dispatch entry",
);
const lightning3Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "3L",
  "3L dispatch entry",
);
const lightning4Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "4L",
  "4L dispatch entry",
);
const lightning3AiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "3L",
  "3L AI action entry",
);
const lightning4AiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "4L",
  "4L AI action entry",
);
const iceDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "1C",
  "1C dispatch entry",
);
const ice2Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "2C",
  "2C dispatch entry",
);
const ice3Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "3C",
  "3C dispatch entry",
);
const ice4Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "4C",
  "4C dispatch entry",
);
const ice2AiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "2C",
  "2C AI action entry",
);
const ice3AiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "3C",
  "3C AI action entry",
);
const ice4AiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "4C",
  "4C AI action entry",
);
const fire3AiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "3F",
  "3F AI action entry",
);
const fire4AiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "4F",
  "4F AI action entry",
);
const fire2Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "2F",
  "2F dispatch entry",
);
const fire3Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "3F",
  "3F dispatch entry",
);
const fire4Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "4F",
  "4F dispatch entry",
);
const heal2Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "2H",
  "2H dispatch entry",
);
const heal3Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "3H",
  "3H dispatch entry",
);
const heal3AiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "3H",
  "3H AI action entry",
);
const attackUpDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "AA",
  "AA dispatch entry",
);
const attackUpAiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "AA",
  "AA AI action entry",
);
const attackUpStatus = requireEntry(
  rules.rules.families.statuses.entries,
  ({ code }) => code === "AA",
  "AA status entry",
);
const magicGuardDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "FM",
  "FM dispatch entry",
);
const magicGuardStatus = requireEntry(
  rules.rules.families.statuses.entries,
  ({ code }) => code === "FM",
  "FM status entry",
);
const magicGuideAiPool = requireEntry(
  aiRules.techniqueSelection.classes,
  ({ classCode }) => classCode === "1J",
  "1J AI technique pool",
);
const poisonDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "IP",
  "IP dispatch entry",
);
const poisonStatus = requireEntry(
  rules.rules.families.statuses.entries,
  ({ code }) => code === "IP",
  "IP status entry",
);
const poisonAiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "IP",
  "IP AI action entry",
);
const confusionDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "LA",
  "LA dispatch entry",
);
const confusionStatus = requireEntry(
  rules.rules.families.statuses.entries,
  ({ code }) => code === "LA",
  "LA status entry",
);
const confusionAiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "LA",
  "LA AI action entry",
);
const attackDownDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "SA",
  "SA dispatch entry",
);
const attackDownStatus = requireEntry(
  rules.rules.families.statuses.entries,
  ({ code }) => code === "SA",
  "SA status entry",
);
const attackDownAiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "SA",
  "SA AI action entry",
);
const defenseDownDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "SD",
  "SD dispatch entry",
);
const defenseDownStatus = requireEntry(
  rules.rules.families.statuses.entries,
  ({ code }) => code === "SD",
  "SD status entry",
);
const defenseDownAiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "SD",
  "SD AI action entry",
);
const spellSealDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "SN",
  "SN dispatch entry",
);
const spellSealStatus = requireEntry(
  rules.rules.families.statuses.entries,
  ({ code }) => code === "SN",
  "SN status entry",
);
const spellSealAiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "SN",
  "SN AI action entry",
);
const curseMasterAiPool = requireEntry(
  aiRules.techniqueSelection.classes,
  ({ classCode }) => classCode === "1K",
  "1K AI technique pool",
);
const magicPriestAiPool = requireEntry(
  aiRules.techniqueSelection.classes,
  ({ classCode }) => classCode === "0K",
  "0K AI technique pool",
);
const prayerDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "OJ",
  "OJ dispatch entry",
);
const prayerGuideAiPool = requireEntry(
  aiRules.techniqueSelection.classes,
  ({ classCode }) => classCode === "0J",
  "0J AI technique pool",
);
const defenseUpDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "AD",
  "AD dispatch entry",
);
const defenseUpAiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "AD",
  "AD AI action entry",
);
const defenseUpStatus = requireEntry(
  rules.rules.families.statuses.entries,
  ({ code }) => code === "AD",
  "AD status entry",
);
const dispelDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "TR",
  "TR dispatch entry",
);
const recoveryDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "1I",
  "1I dispatch entry",
);
const recovery2Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "2I",
  "2I dispatch entry",
);
const recovery3Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "3I",
  "3I dispatch entry",
);
const recovery3AiAction = requireEntry(
  aiRules.actionTable.entries,
  ({ actionCode }) => actionCode === "3I",
  "3I AI action entry",
);
const stompDispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "1D",
  "1D dispatch entry",
);
const stomp2Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "2D",
  "2D dispatch entry",
);
const stomp3Dispatch = requireEntry(
  rules.dispatchTable.entries,
  ({ actionCode }) => actionCode === "3D",
  "3D dispatch entry",
);
const lightningTier = requireEntry(
  rules.rules.families.L.tiers,
  ({ code }) => code === "1L",
  "1L rules tier",
);
const lightning2Tier = requireEntry(
  rules.rules.families.L.tiers,
  ({ code }) => code === "2L",
  "2L rules tier",
);
const lightning3Tier = requireEntry(
  rules.rules.families.L.tiers,
  ({ code }) => code === "3L",
  "3L rules tier",
);
const lightning4Tier = requireEntry(
  rules.rules.families.L.tiers,
  ({ code }) => code === "4L",
  "4L rules tier",
);
const iceTier = requireEntry(
  rules.rules.families.C.tiers,
  ({ code }) => code === "1C",
  "1C rules tier",
);
const ice2Tier = requireEntry(
  rules.rules.families.C.tiers,
  ({ code }) => code === "2C",
  "2C rules tier",
);
const ice3Tier = requireEntry(
  rules.rules.families.C.tiers,
  ({ code }) => code === "3C",
  "3C rules tier",
);
const ice4Tier = requireEntry(
  rules.rules.families.C.tiers,
  ({ code }) => code === "4C",
  "4C rules tier",
);
const fire2Tier = requireEntry(
  rules.rules.families.F.tiers,
  ({ code }) => code === "2F",
  "2F rules tier",
);
const fire3Tier = requireEntry(
  rules.rules.families.F.tiers,
  ({ code }) => code === "3F",
  "3F rules tier",
);
const fire4Tier = requireEntry(
  rules.rules.families.F.tiers,
  ({ code }) => code === "4F",
  "4F rules tier",
);
const heal2Tier = requireEntry(
  rules.rules.families.H.tiers,
  ({ code }) => code === "2H",
  "2H rules tier",
);
const heal3Tier = requireEntry(
  rules.rules.families.H.tiers,
  ({ code }) => code === "3H",
  "3H rules tier",
);
const recoveryTier = requireEntry(
  rules.rules.families.I.tiers,
  ({ code }) => code === "1I",
  "1I rules tier",
);
const recovery2Tier = requireEntry(
  rules.rules.families.I.tiers,
  ({ code }) => code === "2I",
  "2I rules tier",
);
const recovery3Tier = requireEntry(
  rules.rules.families.I.tiers,
  ({ code }) => code === "3I",
  "3I rules tier",
);
const stompTier = requireEntry(
  rules.rules.families.D.tiers,
  ({ code }) => code === "1D",
  "1D rules tier",
);
const stomp2Tier = requireEntry(
  rules.rules.families.D.tiers,
  ({ code }) => code === "2D",
  "2D rules tier",
);
const stomp3Tier = requireEntry(
  rules.rules.families.D.tiers,
  ({ code }) => code === "3D",
  "3D rules tier",
);
const constructionFamily = rules.rules.families.K;
const lightningPresentation = requireEntry(
  presentations.presentations.lightning.actions,
  ({ code }) => code === "1L",
  "1L presentation",
);
const lightning2Presentation = requireEntry(
  presentations.presentations.lightning.actions,
  ({ code }) => code === "2L",
  "2L presentation",
);
const lightning3Presentation = requireEntry(
  presentations.presentations.lightning.actions,
  ({ code }) => code === "3L",
  "3L presentation",
);
const lightning4Presentation = requireEntry(
  presentations.presentations.lightning.actions,
  ({ code }) => code === "4L",
  "4L presentation",
);
const icePresentation = requireEntry(
  presentations.presentations.ice.actions,
  ({ code }) => code === "1C",
  "1C presentation",
);
const ice2Presentation = requireEntry(
  presentations.presentations.ice.actions,
  ({ code }) => code === "2C",
  "2C presentation",
);
const ice3Presentation = requireEntry(
  presentations.presentations.ice.actions,
  ({ code }) => code === "3C",
  "3C presentation",
);
const ice4Presentation = requireEntry(
  presentations.presentations.ice.actions,
  ({ code }) => code === "4C",
  "4C presentation",
);
const fire2Presentation = requireEntry(
  presentations.presentations.fire.actions,
  ({ code }) => code === "2F",
  "2F presentation",
);
const fire3Presentation = requireEntry(
  presentations.presentations.fire.actions,
  ({ code }) => code === "3F",
  "3F presentation",
);
const fire4Presentation = requireEntry(
  presentations.presentations.fire.actions,
  ({ code }) => code === "4F",
  "4F presentation",
);
const heal2Presentation = requireEntry(
  presentations.presentations.heal.actions,
  ({ code }) => code === "2H",
  "2H presentation",
);
const heal3Presentation = requireEntry(
  presentations.presentations.heal.actions,
  ({ code }) => code === "3H",
  "3H presentation",
);
const dispelPresentation = requireEntry(
  remainingPresentations.presentations.statuses.actions,
  ({ code }) => code === "TR",
  "TR presentation",
);
const attackUpPresentation = requireEntry(
  remainingPresentations.presentations.statuses.actions,
  ({ code }) => code === "AA",
  "AA presentation",
);
const magicGuardPresentation = requireEntry(
  remainingPresentations.presentations.statuses.actions,
  ({ code }) => code === "FM",
  "FM presentation",
);
const poisonPresentation = requireEntry(
  remainingPresentations.presentations.statuses.actions,
  ({ code }) => code === "IP",
  "IP presentation",
);
const confusionPresentation = requireEntry(
  remainingPresentations.presentations.statuses.actions,
  ({ code }) => code === "LA",
  "LA presentation",
);
const attackDownPresentation = requireEntry(
  remainingPresentations.presentations.statuses.actions,
  ({ code }) => code === "SA",
  "SA presentation",
);
const defenseDownPresentation = requireEntry(
  remainingPresentations.presentations.statuses.actions,
  ({ code }) => code === "SD",
  "SD presentation",
);
const spellSealPresentation = requireEntry(
  remainingPresentations.presentations.statuses.actions,
  ({ code }) => code === "SN",
  "SN presentation",
);
const defenseUpPresentation = requireEntry(
  remainingPresentations.presentations.statuses.actions,
  ({ code }) => code === "AD",
  "AD presentation",
);
const prayerPresentation = remainingPresentations.presentations.prayer;
const recoveryPresentation = presentations.presentations.recovery;
const stompPresentation = remainingPresentations.presentations.stomp;
const stompAction = requireEntry(
  stompPresentation.actions,
  ({ code }) => code === "1D",
  "1D stomp presentation",
);
const stomp2Action = requireEntry(
  stompPresentation.actions,
  ({ code }) => code === "2D",
  "2D stomp presentation",
);
const stomp3Action = requireEntry(
  stompPresentation.actions,
  ({ code }) => code === "3D",
  "3D stomp presentation",
);

assertEqual({
  selectionRadius: lightningDispatch.selectionRadius,
  effectRadius: lightningTier.effectRadius,
  damageByRangeValue: lightningTier.damageByRangeValue,
  fixedGraphicWaitNativeTicks: lightningPresentation.fixedGraphicWaitNativeTicks,
}, {
  selectionRadius: 4,
  effectRadius: 3,
  damageByRangeValue: { 1: 20, 2: 35, 3: 50 },
  fixedGraphicWaitNativeTicks: 414,
}, "initial lightning contract");
assertEqual({
  selectionRadius: lightning2Dispatch.selectionRadius,
  effectRadius: lightning2Tier.effectRadius,
  damageByRangeValue: lightning2Tier.damageByRangeValue,
  resources: lightning2Presentation.phases.map(({ resource }) => resource),
  phaseDrawCounts: lightning2Presentation.phases.map(({ drawCount }) => drawCount),
  waitPerDrawNativeTicks: lightning2Presentation.phases.map(({ waitPerDrawNativeTicks }) =>
    waitPerDrawNativeTicks),
  audioRequests: lightning2Presentation.audioRequests,
  hitResource: lightning2Presentation.commonHit.resource,
  hitIterations: lightning2Presentation.commonHit.iterations,
  hitWaveDrawsPerIteration: lightning2Presentation.commonHit.waveDrawsPerIteration,
  cleanupResource: lightning2Presentation.commonHit.cleanup.resource,
  cleanupDrawCount: lightning2Presentation.commonHit.cleanup.drawCount,
  fixedGraphicWaitNativeTicks: lightning2Presentation.fixedGraphicWaitNativeTicks,
}, {
  selectionRadius: 5,
  effectRadius: 4,
  damageByRangeValue: { 1: 15, 2: 30, 3: 45, 4: 60 },
  resources: ["MAGIC/47", "MAGIC/48"],
  phaseDrawCounts: [7, 14],
  waitPerDrawNativeTicks: [5, 10],
  audioRequests: [
    { resource: "E/63", entry: "0000:0224", afterFixedWaitNativeTicks: 0 },
    { resource: "E/41", entry: "0000:0224", afterFixedWaitNativeTicks: 35 },
  ],
  hitResource: "MAGIC/24",
  hitIterations: 8,
  hitWaveDrawsPerIteration: 2,
  cleanupResource: "MAGIC/6",
  cleanupDrawCount: 5,
  fixedGraphicWaitNativeTicks: 257,
}, "intermediate lightning contract");
assertEqual({
  selectionRadius: lightning3Dispatch.selectionRadius,
  aiSelectionRadius: lightning3AiAction.selectionRadius,
  presentationGroup: lightning3AiAction.presentationGroup,
  effectRadius: lightning3Tier.effectRadius,
  damageByRangeValue: lightning3Tier.damageByRangeValue,
  resources: lightning3Presentation.phases.map(({ resource }) => resource),
  phaseDrawCounts: lightning3Presentation.phases.map(({ drawCount }) => drawCount),
  waitPerDrawNativeTicks: lightning3Presentation.phases.map(({ waitPerDrawNativeTicks }) =>
    waitPerDrawNativeTicks),
  anchorOffsetSequences: lightning3Presentation.phases.map(({ anchorOffsetSequence }) =>
    anchorOffsetSequence),
  audioRequests: lightning3Presentation.audioRequests,
  hitResource: lightning3Presentation.commonHit.resource,
  hitRuntimeTileCodes: lightning3Presentation.commonHit.runtimeTileCodes,
  hitIterations: lightning3Presentation.commonHit.iterations,
  hitWaveDrawsPerIteration: lightning3Presentation.commonHit.waveDrawsPerIteration,
  cleanupResource: lightning3Presentation.commonHit.cleanup.resource,
  cleanupDrawCount: lightning3Presentation.commonHit.cleanup.drawCount,
  fixedGraphicWaitNativeTicks: lightning3Presentation.fixedGraphicWaitNativeTicks,
}, {
  selectionRadius: 6,
  aiSelectionRadius: 5,
  presentationGroup: 11,
  effectRadius: 4,
  damageByRangeValue: { 1: 45, 2: 60, 3: 75, 4: 90 },
  resources: ["MAGIC/3", "MAGIC/4"],
  phaseDrawCounts: [12, 15],
  waitPerDrawNativeTicks: [10, 10],
  anchorOffsetSequences: [
    [0, 0, 0, -1, -1, -1, -2, -2, -2, -3, -3, -3]
      .map((y) => ({ x: 0, y })),
    Array.from({ length: 15 }, () => ({ x: 0, y: -4 })),
  ],
  audioRequests: [
    { resource: "E/41", entry: "0000:0224", afterFixedWaitNativeTicks: 0 },
    { resource: "E/9", entry: "0000:0224", afterFixedWaitNativeTicks: 120 },
  ],
  hitResource: "MAGIC/25",
  hitRuntimeTileCodes: [5, 6],
  hitIterations: 7,
  hitWaveDrawsPerIteration: 2,
  cleanupResource: "MAGIC/6",
  cleanupDrawCount: 5,
  fixedGraphicWaitNativeTicks: 348,
}, "advanced lightning contract");
assertEqual({
  selectionRadius: lightning4Dispatch.selectionRadius,
  aiSelectionRadius: lightning4AiAction.selectionRadius,
  presentationGroup: lightning4AiAction.presentationGroup,
  effectRadius: lightning4Tier.effectRadius,
  damageByRangeValue: lightning4Tier.damageByRangeValue,
  resources: lightning4Presentation.phases.map(({ resource }) => resource),
  phaseDrawCounts: lightning4Presentation.phases.map(({ drawCount }) => drawCount),
  waitPerDrawNativeTicks: lightning4Presentation.phases.map(({ waitPerDrawNativeTicks }) =>
    waitPerDrawNativeTicks),
  anchorOffsetSequences: lightning4Presentation.phases.map(({ anchorOffsetSequence }) =>
    anchorOffsetSequence),
  audioRequests: lightning4Presentation.audioRequests,
  hitResource: lightning4Presentation.commonHit.resource,
  hitRuntimeTileCodes: lightning4Presentation.commonHit.runtimeTileCodes,
  hitIterations: lightning4Presentation.commonHit.iterations,
  hitWaveDrawsPerIteration: lightning4Presentation.commonHit.waveDrawsPerIteration,
  cleanupResource: lightning4Presentation.commonHit.cleanup.resource,
  cleanupDrawCount: lightning4Presentation.commonHit.cleanup.drawCount,
  fixedGraphicWaitNativeTicks: lightning4Presentation.fixedGraphicWaitNativeTicks,
}, {
  selectionRadius: 7,
  aiSelectionRadius: 6,
  presentationGroup: 11,
  effectRadius: 5,
  damageByRangeValue: { 1: 30, 2: 50, 3: 70, 4: 90, 5: 110 },
  resources: ["MAGIC/39", "MAGIC/39", "MAGIC/40", "MAGIC/39"],
  phaseDrawCounts: [18, 4, 6, 4],
  waitPerDrawNativeTicks: [3, 10, 10, 10],
  anchorOffsetSequences: [
    Array.from({ length: 18 }, (_, index) => ({
      x: 0,
      y: -8 + Math.floor(index / 2),
    })),
    Array.from({ length: 4 }, () => ({ x: 0, y: 1 })),
    Array.from({ length: 6 }, () => ({ x: 0, y: 1 })),
    Array.from({ length: 4 }, () => ({ x: 0, y: 1 })),
  ],
  audioRequests: [
    { resource: "E/43", entry: "0000:0224", afterFixedWaitNativeTicks: 0 },
  ],
  hitResource: "MAGIC/26",
  hitRuntimeTileCodes: [12, 13],
  hitIterations: 15,
  hitWaveDrawsPerIteration: 2,
  cleanupResource: "MAGIC/6",
  cleanupDrawCount: 5,
  fixedGraphicWaitNativeTicks: 304,
}, "ultimate lightning contract");
assertEqual({
  dispatchSelectionWord: iceDispatch.selectionRadius,
  centerMode: rules.rules.families.C.centerMode,
  effectRadius: iceTier.effectRadius,
  experienceBase: iceTier.experienceBase,
  experienceRandom: iceTier.experienceRandom,
  cycles: icePresentation.cycles,
  rangeValueSequence: icePresentation.rangeValueSequence,
  distanceFromCenterSequence: icePresentation.distanceFromCenterSequence,
  fixedGraphicWaitNativeTicks: icePresentation.fixedGraphicWaitNativeTicks,
}, {
  dispatchSelectionWord: 2,
  centerMode: "actor position",
  effectRadius: 3,
  experienceBase: 8,
  experienceRandom: [0, 1],
  cycles: 2,
  rangeValueSequence: [2, 1],
  distanceFromCenterSequence: [1, 2],
  fixedGraphicWaitNativeTicks: 120,
}, "initial ice contract");
assertEqual({
  dispatchSelectionWord: ice2Dispatch.selectionRadius,
  centerMode: rules.rules.families.C.centerMode,
  effectRadius: ice2Tier.effectRadius,
  experienceBase: ice2Tier.experienceBase,
  experienceRandom: ice2Tier.experienceRandom,
  cycles: ice2Presentation.cycles,
  rangeValueSequence: ice2Presentation.rangeValueSequence,
  distanceFromCenterSequence: ice2Presentation.distanceFromCenterSequence,
  soundRequests: ice2Presentation.soundRequests,
  drawCount: ice2Presentation.drawCount,
  fixedGraphicWaitNativeTicks: ice2Presentation.fixedGraphicWaitNativeTicks,
}, {
  dispatchSelectionWord: 3,
  centerMode: "actor position",
  effectRadius: 4,
  experienceBase: 10,
  experienceRandom: [0, 1],
  cycles: 3,
  rangeValueSequence: [3, 2, 1],
  distanceFromCenterSequence: [1, 2, 3],
  soundRequests: 3,
  drawCount: 18,
  fixedGraphicWaitNativeTicks: 180,
}, "intermediate ice contract");
assertEqual({
  dispatchSelectionWord: ice3Dispatch.selectionRadius,
  aiCandidateSelectionRadius: ice3AiAction.selectionRadius,
  centerMode: rules.rules.families.C.centerMode,
  effectRadius: ice3Tier.effectRadius,
  experienceBase: ice3Tier.experienceBase,
  experienceRandom: ice3Tier.experienceRandom,
  cycles: ice3Presentation.cycles,
  rangeValueSequence: ice3Presentation.rangeValueSequence,
  distanceFromCenterSequence: ice3Presentation.distanceFromCenterSequence,
  soundRequests: ice3Presentation.soundRequests,
  drawCount: ice3Presentation.drawCount,
  fixedGraphicWaitNativeTicks: ice3Presentation.fixedGraphicWaitNativeTicks,
}, {
  dispatchSelectionWord: 3,
  aiCandidateSelectionRadius: 4,
  centerMode: "actor position",
  effectRadius: 5,
  experienceBase: 12,
  experienceRandom: [0, 2],
  cycles: 4,
  rangeValueSequence: [4, 3, 2, 1],
  distanceFromCenterSequence: [1, 2, 3, 4],
  soundRequests: 4,
  drawCount: 24,
  fixedGraphicWaitNativeTicks: 240,
}, "advanced ice contract");
assertEqual({
  dispatchSelectionWord: ice4Dispatch.selectionRadius,
  aiCandidateSelectionRadius: ice4AiAction.selectionRadius,
  presentationGroup: ice4AiAction.presentationGroup,
  centerMode: rules.rules.families.C.centerMode,
  effectRadius: ice4Tier.effectRadius,
  experienceBase: ice4Tier.experienceBase,
  experienceRandom: ice4Tier.experienceRandom,
  cycles: ice4Presentation.cycles,
  rangeValueSequence: ice4Presentation.rangeValueSequence,
  distanceFromCenterSequence: ice4Presentation.distanceFromCenterSequence,
  soundRequests: ice4Presentation.soundRequests,
  drawCount: ice4Presentation.drawCount,
  fixedGraphicWaitNativeTicks: ice4Presentation.fixedGraphicWaitNativeTicks,
}, {
  dispatchSelectionWord: 4,
  aiCandidateSelectionRadius: 5,
  presentationGroup: 12,
  centerMode: "actor position",
  effectRadius: 6,
  experienceBase: 15,
  experienceRandom: [0, 2],
  cycles: 5,
  rangeValueSequence: [5, 4, 3, 2, 1],
  distanceFromCenterSequence: [1, 2, 3, 4, 5],
  soundRequests: 5,
  drawCount: 30,
  fixedGraphicWaitNativeTicks: 300,
}, "ultimate ice contract");
assertEqual({
  selectionRadius: fire2Dispatch.selectionRadius,
  percentMaxLife: fire2Tier.percentMaxLife,
  damageCap: fire2Tier.damageCap,
  experienceBase: fire2Tier.experienceBase,
  experienceRandom: fire2Tier.experienceRandom,
  resources: fire2Presentation.phases.map(({ resource }) => resource),
  phaseDrawCounts: fire2Presentation.phases.map(({ drawCount }) => drawCount),
  waitPerDrawNativeTicks: fire2Presentation.phases.map(({ waitPerDrawNativeTicks }) =>
    waitPerDrawNativeTicks),
  fixedGraphicWaitNativeTicks: fire2Presentation.fixedGraphicWaitNativeTicks,
  audioRequests: fire2Presentation.audioRequests,
}, {
  selectionRadius: 6,
  percentMaxLife: 26,
  damageCap: 156,
  experienceBase: 10,
  experienceRandom: [0, 1],
  resources: ["MAGIC/23"],
  phaseDrawCounts: [12],
  waitPerDrawNativeTicks: [10],
  fixedGraphicWaitNativeTicks: 120,
  audioRequests: [{
    resource: "MAGIC/83",
    entry: "0000:0224",
    afterFixedWaitNativeTicks: 0,
  }],
}, "intermediate fire contract");
assertEqual({
  selectionRadius: fire3Dispatch.selectionRadius,
  nativeAiSelectionRadius: fire3AiAction.selectionRadius,
  percentMaxLife: fire3Tier.percentMaxLife,
  damageCap: fire3Tier.damageCap,
  experienceBase: fire3Tier.experienceBase,
  experienceRandom: fire3Tier.experienceRandom,
  resources: fire3Presentation.phases.map(({ resource }) => resource),
  phaseDrawCounts: fire3Presentation.phases.map(({ drawCount }) => drawCount),
  waitPerDrawNativeTicks: fire3Presentation.phases.map(({ waitPerDrawNativeTicks }) =>
    waitPerDrawNativeTicks),
  fixedGraphicWaitNativeTicks: fire3Presentation.fixedGraphicWaitNativeTicks,
  audioRequests: fire3Presentation.audioRequests,
  finalDescriptorFrames: fire3Presentation.phases.at(-1).descriptorSequence.at(-1)
    .low7BitFrameIndices,
}, {
  selectionRadius: 7,
  nativeAiSelectionRadius: 6,
  percentMaxLife: 32,
  damageCap: 192,
  experienceBase: 12,
  experienceRandom: [0, 2],
  resources: ["MAGIC/27"],
  phaseDrawCounts: [13],
  waitPerDrawNativeTicks: [15],
  fixedGraphicWaitNativeTicks: 195,
  audioRequests: [{
    resource: "MAGIC/83",
    entry: "0000:0224",
    afterFixedWaitNativeTicks: 0,
  }],
  finalDescriptorFrames: [null, null, null, null, null, null],
}, "advanced fire contract");
assertEqual({
  selectionRadius: fire4Dispatch.selectionRadius,
  nativeAiSelectionRadius: fire4AiAction.selectionRadius,
  presentationGroup: fire4AiAction.presentationGroup,
  percentMaxLife: fire4Tier.percentMaxLife,
  damageCap: fire4Tier.damageCap,
  experienceBase: fire4Tier.experienceBase,
  experienceRandom: fire4Tier.experienceRandom,
  resources: fire4Presentation.phases.map(({ resource }) => resource),
  phaseDrawCounts: fire4Presentation.phases.map(({ drawCount }) => drawCount),
  waitPerDrawNativeTicks: fire4Presentation.phases.map(({ waitPerDrawNativeTicks }) =>
    waitPerDrawNativeTicks),
  anchorOffsetSequences: fire4Presentation.phases.map(({ anchorOffsetSequence }) =>
    anchorOffsetSequence),
  fixedGraphicWaitNativeTicks: fire4Presentation.fixedGraphicWaitNativeTicks,
  audioRequests: fire4Presentation.audioRequests,
}, {
  selectionRadius: 7,
  nativeAiSelectionRadius: 6,
  presentationGroup: 10,
  percentMaxLife: 44,
  damageCap: 270,
  experienceBase: 15,
  experienceRandom: [0, 2],
  resources: ["MAGIC/30", "MAGIC/28", "MAGIC/29"],
  phaseDrawCounts: [12, 8, 9],
  waitPerDrawNativeTicks: [10, 10, 10],
  anchorOffsetSequences: [
    Array.from({ length: 12 }, () => ({ x: 0, y: 0 })),
    Array.from({ length: 8 }, () => ({ x: 0, y: 0 })),
    [
      ...Array.from({ length: 4 }, () => ({ x: 0, y: 0 })),
      ...Array.from({ length: 5 }, (_, index) => ({ x: 0, y: -index })),
    ],
  ],
  fixedGraphicWaitNativeTicks: 290,
  audioRequests: [
    { resource: "MAGIC/83", entry: "0000:0224", afterFixedWaitNativeTicks: 0 },
    { resource: "E/51", entry: "0000:0224", afterFixedWaitNativeTicks: 120 },
  ],
}, "ultimate fire contract");
assertEqual({
  selectionRadius: heal2Dispatch.selectionRadius,
  maxLifePercent: heal2Tier.maxLifePercent,
  experienceBase: heal2Tier.experienceBase,
  experienceRandom: heal2Tier.experienceRandom,
  resources: heal2Presentation.phases.map(({ resource }) => resource),
  phaseDrawCounts: heal2Presentation.phases.map(({ drawCount }) => drawCount),
  waitPerDrawNativeTicks: heal2Presentation.phases.map(({ waitPerDrawNativeTicks }) =>
    waitPerDrawNativeTicks),
  fixedGraphicWaitNativeTicks: heal2Presentation.fixedGraphicWaitNativeTicks,
  audioRequests: heal2Presentation.audioRequests,
}, {
  selectionRadius: 6,
  maxLifePercent: 36,
  experienceBase: 12,
  experienceRandom: [0, 3],
  resources: ["MAGIC/37", "MAGIC/0"],
  phaseDrawCounts: [14, 5],
  waitPerDrawNativeTicks: [10, 15],
  fixedGraphicWaitNativeTicks: 215,
  audioRequests: [{
    resource: "E/36",
    entry: "0000:0220",
    afterFixedWaitNativeTicks: 0,
  }],
}, "intermediate heal contract");
assertEqual(
  heal2Presentation.phases[0].descriptorSequence.flatMap(
    ({ low7BitFrameIndices }) => low7BitFrameIndices,
  ),
  [...Array.from({ length: 42 }, (_, index) => index), ...Array.from({ length: 42 }, (_, index) => index)],
  "intermediate heal repeated six-tile descriptor frames",
);
assertEqual({
  selectionRadius: heal3Dispatch.selectionRadius,
  nativeAiSelectionRadius: heal3AiAction.selectionRadius,
  maxLifePercent: heal3Tier.maxLifePercent,
  experienceBase: heal3Tier.experienceBase,
  experienceRandom: heal3Tier.experienceRandom,
  resources: heal3Presentation.phases.map(({ resource }) => resource),
  phaseDrawCounts: heal3Presentation.phases.map(({ drawCount }) => drawCount),
  waitPerDrawNativeTicks: heal3Presentation.phases.map(({ waitPerDrawNativeTicks }) =>
    waitPerDrawNativeTicks),
  fixedGraphicWaitNativeTicks: heal3Presentation.fixedGraphicWaitNativeTicks,
  audioRequests: heal3Presentation.audioRequests,
}, {
  selectionRadius: 7,
  nativeAiSelectionRadius: 7,
  maxLifePercent: 48,
  experienceBase: 15,
  experienceRandom: [0, 2],
  resources: ["MAGIC/42", "MAGIC/41", "MAGIC/42", "MAGIC/0"],
  phaseDrawCounts: [5, 18, 5, 5],
  waitPerDrawNativeTicks: [6, 5, 8, 15],
  fixedGraphicWaitNativeTicks: 235,
  audioRequests: [{
    resource: "E/36",
    entry: "0000:0220",
    afterFixedWaitNativeTicks: 30,
  }],
}, "advanced heal contract");
assertEqual(
  heal3Presentation.phases[1].descriptorSequence.map(({ low7BitFrameIndices }) =>
    low7BitFrameIndices),
  Array.from({ length: 3 }, () => Array.from({ length: 6 }, (_, descriptor) =>
    Array.from({ length: 6 }, (_, tile) => descriptor * 6 + tile))).flat(),
  "advanced heal three repeated MAGIC/41 descriptor passes",
);
assertEqual(
  heal3Presentation.phases[2].descriptorSequence.map(({ low7BitFrameIndices }) =>
    low7BitFrameIndices),
  Array.from({ length: 5 }, (_, descriptor) =>
    Array.from({ length: 6 }, (_, tile) => (4 - descriptor) * 6 + tile)),
  "advanced heal reverse MAGIC/42 descriptor pass",
);
assertEqual({
  selectionRadius: attackUpDispatch.selectionRadius,
  nativeAiSelectionRadius: attackUpAiAction.selectionRadius,
  targetGroup: attackUpAiAction.targetGroup,
  stateOffset: attackUpStatus.stateOffset,
  write: attackUpStatus.write,
  experience: rules.rules.families.statuses.commonExperience.AA,
  resource: attackUpPresentation.phases[0].resource,
  runtimeTileCodePairs: attackUpPresentation.phases[0].runtimeTileCodePairs,
  drawCount: attackUpPresentation.phases[0].drawCount,
  waitPerDrawNativeTicks: attackUpPresentation.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: attackUpPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: attackUpPresentation.audioRequests,
  mutation: attackUpPresentation.mutation,
}, {
  selectionRadius: 4,
  nativeAiSelectionRadius: 4,
  targetGroup: "ally",
  stateOffset: "+08",
  write: "8003h",
  experience: "10 + random(0..3)",
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
  mutation: "unit+08 = 8003h",
}, "attack-up contract");
assertEqual({
  selectionRadius: magicGuardDispatch.selectionRadius,
  targetGroup: rules.rules.targetGroups.allyOnly.includes("FM") ? "ally" : null,
  stateOffset: magicGuardStatus.stateOffset,
  write: magicGuardStatus.write,
  experience: rules.rules.families.statuses.commonExperience.FM,
  tier3AiPool: magicGuideAiPool.tiers[2].actions,
  nativeAiActionRow: aiRules.actionTable.entries.some(({ actionCode }) => actionCode === "FM"),
  orphanPoolCodes: aiRules.anomalyRuntimeConsequence.orphanPoolCodes,
  resource: magicGuardPresentation.phases[0].resource,
  runtimeTileCodePairs: magicGuardPresentation.phases[0].runtimeTileCodePairs,
  drawCount: magicGuardPresentation.phases[0].drawCount,
  waitPerDrawNativeTicks: magicGuardPresentation.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: magicGuardPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: magicGuardPresentation.audioRequests,
  mutation: magicGuardPresentation.mutation,
}, {
  selectionRadius: 7,
  targetGroup: "ally",
  stateOffset: "+0C",
  write: "8001h",
  experience: "10 + random(0..3)",
  tier3AiPool: ["3H", "2I", "AA", "FM"],
  nativeAiActionRow: false,
  orphanPoolCodes: ["FM", "SM"],
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
  mutation: "unit+0C = 8001h",
}, "magic-guard contract and native AI orphan boundary");
assertEqual({
  selectionRadius: poisonDispatch.selectionRadius,
  nativeAiSelectionRadius: poisonAiAction.selectionRadius,
  targetGroup: poisonAiAction.targetGroup,
  presentationGroup: poisonAiAction.presentationGroup,
  targetSelector: poisonAiAction.targetSelector,
  stateOffset: poisonStatus.stateOffset,
  write: poisonStatus.write,
  immunity: poisonStatus.immunity,
  experience: rules.rules.families.statuses.commonExperience.IP,
  aiPools: curseMasterAiPool.tiers.map(({ actions }) => actions),
  resources: poisonPresentation.phases.map(({ resource }) => resource),
  drawCounts: poisonPresentation.phases.map(({ drawCount }) => drawCount),
  waits: poisonPresentation.phases.map(({ waitPerDrawNativeTicks }) => waitPerDrawNativeTicks),
  fixedGraphicWaitNativeTicks: poisonPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: poisonPresentation.audioRequests,
  mutation: poisonPresentation.mutation,
}, {
  selectionRadius: 6,
  nativeAiSelectionRadius: 6,
  targetGroup: "enemy",
  presentationGroup: 20,
  targetSelector: "1000:0A7B",
  stateOffset: "+14",
  write: "8003h",
  immunity: ["1P", "2P", "3P"],
  experience: "14 + random(0..3)",
  aiPools: [["1H", "SA", "LA"], ["1H", "SA", "LA", "IP"], ["1H", "SA", "LA", "IP", "SN"]],
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
}, "poison contract");
assertEqual({
  selectionRadius: confusionDispatch.selectionRadius,
  nativeAiSelectionRadius: confusionAiAction.selectionRadius,
  targetGroup: confusionAiAction.targetGroup,
  presentationGroup: confusionAiAction.presentationGroup,
  targetSelector: confusionAiAction.targetSelector,
  stateOffset: confusionStatus.stateOffset,
  write: confusionStatus.write,
  immunity: confusionStatus.immunity,
  experience: rules.rules.families.statuses.commonExperience.LA,
  aiPools: curseMasterAiPool.tiers.map(({ actions }) => actions),
  resource: confusionPresentation.phases[0].resource,
  descriptorFrames: confusionPresentation.phases[0].descriptorSequence
    .map(({ low7BitFrameIndices }) => low7BitFrameIndices),
  drawCount: confusionPresentation.phases[0].drawCount,
  waitPerDrawNativeTicks: confusionPresentation.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: confusionPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: confusionPresentation.audioRequests,
  mutation: confusionPresentation.mutation,
}, {
  selectionRadius: 5,
  nativeAiSelectionRadius: 5,
  targetGroup: "enemy",
  presentationGroup: 22,
  targetSelector: "1000:0A7B",
  stateOffset: "+0E",
  write: "8003h",
  immunity: ["1P", "2P", "3P"],
  experience: "14 + random(0..3)",
  aiPools: [["1H", "SA", "LA"], ["1H", "SA", "LA", "IP"], ["1H", "SA", "LA", "IP", "SN"]],
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
}, "confusion contract");
assertEqual({
  selectionRadius: attackDownDispatch.selectionRadius,
  nativeAiSelectionRadius: attackDownAiAction.selectionRadius,
  targetGroup: attackDownAiAction.targetGroup,
  presentationGroup: attackDownAiAction.presentationGroup,
  targetSelector: attackDownAiAction.targetSelector,
  stateOffset: attackDownStatus.stateOffset,
  write: attackDownStatus.write,
  experience: rules.rules.families.statuses.commonExperience.SA,
  aiPools: curseMasterAiPool.tiers.map(({ actions }) => actions),
  resource: attackDownPresentation.phases[0].resource,
  descriptorFrames: attackDownPresentation.phases[0].descriptorSequence
    .map(({ low7BitFrameIndices }) => low7BitFrameIndices),
  drawCount: attackDownPresentation.phases[0].drawCount,
  waitPerDrawNativeTicks: attackDownPresentation.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: attackDownPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: attackDownPresentation.audioRequests,
  mutation: attackDownPresentation.mutation,
}, {
  selectionRadius: 4,
  nativeAiSelectionRadius: 4,
  targetGroup: "enemy",
  presentationGroup: 19,
  targetSelector: "1000:0A7B",
  stateOffset: "+10",
  write: "8003h",
  experience: "10 + random(0..3)",
  aiPools: [["1H", "SA", "LA"], ["1H", "SA", "LA", "IP"], ["1H", "SA", "LA", "IP", "SN"]],
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
}, "attack-down contract");
assertEqual({
  selectionRadius: defenseDownDispatch.selectionRadius,
  nativeAiSelectionRadius: defenseDownAiAction.selectionRadius,
  targetGroup: defenseDownAiAction.targetGroup,
  presentationGroup: defenseDownAiAction.presentationGroup,
  targetSelector: defenseDownAiAction.targetSelector,
  stateOffset: defenseDownStatus.stateOffset,
  write: defenseDownStatus.write,
  experience: rules.rules.families.statuses.commonExperience.SD,
  aiPools: magicPriestAiPool.tiers.map(({ actions }) => actions),
  resource: defenseDownPresentation.phases[0].resource,
  descriptorFrames: defenseDownPresentation.phases[0].descriptorSequence
    .map(({ low7BitFrameIndices }) => low7BitFrameIndices),
  drawCount: defenseDownPresentation.phases[0].drawCount,
  waitPerDrawNativeTicks: defenseDownPresentation.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: defenseDownPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: defenseDownPresentation.audioRequests,
  mutation: defenseDownPresentation.mutation,
}, {
  selectionRadius: 4,
  nativeAiSelectionRadius: 4,
  targetGroup: "enemy",
  presentationGroup: 18,
  targetSelector: "1000:0A7B",
  stateOffset: "+12",
  write: "8003h",
  experience: "10 + random(0..3)",
  aiPools: [["1F", "1I", "SD"], ["1F", "1L", "1I", "SD"], ["2F", "1L", "1I", "SD", "TR"]],
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
}, "defense-down contract");
assertEqual({
  selectionRadius: spellSealDispatch.selectionRadius,
  nativeAiSelectionRadius: spellSealAiAction.selectionRadius,
  targetGroup: spellSealAiAction.targetGroup,
  presentationGroup: spellSealAiAction.presentationGroup,
  targetSelector: spellSealAiAction.targetSelector,
  stateOffset: spellSealStatus.stateOffset,
  write: spellSealStatus.write,
  immunity: spellSealStatus.immunity,
  experience: rules.rules.families.statuses.commonExperience.SN,
  aiPools: curseMasterAiPool.tiers.map(({ actions }) => actions),
  resource: spellSealPresentation.phases[0].resource,
  descriptorFrames: spellSealPresentation.phases[0].descriptorSequence
    .map(({ low7BitFrameIndices }) => low7BitFrameIndices),
  drawCount: spellSealPresentation.phases[0].drawCount,
  waitPerDrawNativeTicks: spellSealPresentation.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: spellSealPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: spellSealPresentation.audioRequests,
  mutation: spellSealPresentation.mutation,
}, {
  selectionRadius: 7,
  nativeAiSelectionRadius: 7,
  targetGroup: "enemy",
  presentationGroup: 21,
  targetSelector: "1000:0A7B",
  stateOffset: "+16",
  write: "8003h",
  immunity: ["1P"],
  experience: "14 + random(0..3)",
  aiPools: [["1H", "SA", "LA"], ["1H", "SA", "LA", "IP"], ["1H", "SA", "LA", "IP", "SN"]],
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
}, "spell-seal contract");
assertEqual({
  selectionWord: prayerDispatch.selectionRadius,
  scope: rules.rules.families.OJ.scope,
  gate: rules.rules.families.OJ.perUnitChance,
  outcomes: rules.rules.families.OJ.outcomes,
  casterExperience: rules.rules.families.OJ.casterExperience,
  playerTier3Menu: rules.techniqueMenu.classes
    .find(({ classCode }) => classCode === "0J")?.tiers[2].entries.map(({ actionCode }) => actionCode),
  aiTier3Pool: prayerGuideAiPool.tiers[2].actions,
  nativeAiActionRow: aiRules.actionTable.entries.some(({ actionCode }) => actionCode === "OJ"),
  presentationType: prayerPresentation.presentation.type,
  archiveGraphics: prayerPresentation.resourceLoads.graphicArchiveRecords,
  archiveAudio: prayerPresentation.resourceLoads.audioArchiveRecords,
  resultStrings: prayerPresentation.presentation.resultStrings,
  resultHold: prayerPresentation.presentation.resultHold,
  synchronizationRule: prayerPresentation.synchronizationRule,
}, {
  selectionWord: 4,
  scope: "scan all 2500 cells; skip empty cells and side 2",
  gate: "PIT counter bit0 must be 1 (approximately one half per eligible unit)",
  outcomes: [
    { roll: 0, effect: "heal", amount: "5..14, capped at maxLife" },
    { roll: 1, effect: "experience", amount: "5..14 added directly to the affected unit" },
    { roll: 2, effect: "attack up", stateOffset: "+08", value: "8003h" },
    { roll: 3, effect: "defense up", stateOffset: "+0A", value: "8003h" },
  ],
  casterExperience: 0,
  playerTier3Menu: ["2H", "3I", "AD", "OJ"],
  aiTier3Pool: ["2H", "3I", "AD", "SM"],
  nativeAiActionRow: false,
  presentationType: "procedural screen drawing",
  archiveGraphics: [],
  archiveAudio: [],
  resultStrings: {
    heal: "生 命 加|00000 點.",
    experience: "經 驗 加|00000 點.",
    attackUp: "攻擊增加",
    defenseUp: "防禦增加",
  },
  resultHold: {
    entry: "1000:5993",
    iterations: 30,
    waitPerIterationNativeTicks: 2,
    maximumNativeTicksPerTriggeredUnit: 60,
    skippable: "the loop exits early when DS:F590 equals 1",
  },
  synchronizationRule: "each passing allied unit is resolved independently: procedural field first, then outcome/amount roll, result text draw, outcome mutation, page switch and an input-skippable hold of at most 60 native ticks; there is no single global presentation followed by global settlement",
}, "prayer contract and native SM orphan boundary");
assertEqual({
  selectionRadius: defenseUpDispatch.selectionRadius,
  nativeAiSelectionRadius: defenseUpAiAction.selectionRadius,
  targetGroup: defenseUpAiAction.targetGroup,
  stateOffset: defenseUpStatus.stateOffset,
  write: defenseUpStatus.write,
  experience: rules.rules.families.statuses.commonExperience.AD,
  resource: defenseUpPresentation.phases[0].resource,
  descriptors: defenseUpPresentation.phases[0].descriptorSequence.map((descriptor) => ({
    xOffset: descriptor.xOffset,
    yOffset: descriptor.yOffset,
    width: descriptor.width,
    height: descriptor.height,
    low7BitFrameIndices: descriptor.low7BitFrameIndices,
  })),
  drawCount: defenseUpPresentation.phases[0].drawCount,
  waitPerDrawNativeTicks: defenseUpPresentation.phases[0].waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: defenseUpPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: defenseUpPresentation.audioRequests,
  mutation: defenseUpPresentation.mutation,
}, {
  selectionRadius: 4,
  nativeAiSelectionRadius: 4,
  targetGroup: "ally",
  stateOffset: "+0A",
  write: "8003h",
  experience: "10 + random(0..3)",
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
  mutation: "unit+0A = 8003h",
}, "defense-up contract");
assertEqual({
  selectionRadius: dispelDispatch.selectionRadius,
  fixedGraphicWaitNativeTicks: dispelPresentation.fixedGraphicWaitNativeTicks,
  resource: dispelPresentation.dynamicPresentation.resource,
  phaseDrawCounts: dispelPresentation.phases.map(({ drawCount }) => drawCount),
  waitPerDrawNativeTicks: dispelPresentation.phases.map(({ waitPerDrawNativeTicks }) =>
    waitPerDrawNativeTicks),
}, {
  selectionRadius: 7,
  fixedGraphicWaitNativeTicks: 250,
  resource: "UN/57",
  phaseDrawCounts: [24, 26],
  waitPerDrawNativeTicks: [5, 5],
}, "dispel contract");
assertEqual({
  selectionRadius: recoveryDispatch.selectionRadius,
  effectRadius: recoveryTier.effectRadius,
  healByRangeValue: recoveryTier.healByRangeValue,
  experienceBase: recoveryTier.experienceBase,
  resource: recoveryPresentation.presentation.resource,
  drawCount: recoveryPresentation.presentation.drawCount,
  waitPerDrawNativeTicks: recoveryPresentation.presentation.waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: recoveryPresentation.fixedGraphicWaitNativeTicks,
}, {
  selectionRadius: 4,
  effectRadius: 3,
  healByRangeValue: { 1: 30, 2: 45, 3: 60 },
  experienceBase: 8,
  resource: "MAGIC/20",
  drawCount: 17,
  waitPerDrawNativeTicks: 15,
  fixedGraphicWaitNativeTicks: 255,
}, "initial recovery contract");
assertEqual({
  selectionRadius: recovery2Dispatch.selectionRadius,
  effectRadius: recovery2Tier.effectRadius,
  healByRangeValue: recovery2Tier.healByRangeValue,
  experienceBase: recovery2Tier.experienceBase,
  resource: recoveryPresentation.presentation.resource,
  descriptorTileCodes: recoveryPresentation.presentation.descriptorSequence
    .map(({ tileCodes }) => tileCodes[0]),
  drawCount: recoveryPresentation.presentation.drawCount,
  waitPerDrawNativeTicks: recoveryPresentation.presentation.waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: recoveryPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: recoveryPresentation.audioRequests,
}, {
  selectionRadius: 5,
  effectRadius: 3,
  healByRangeValue: { 1: 50, 2: 70, 3: 90 },
  experienceBase: 10,
  resource: "MAGIC/20",
  descriptorTileCodes: [1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 1, 1, 0, 0],
  drawCount: 17,
  waitPerDrawNativeTicks: 15,
  fixedGraphicWaitNativeTicks: 255,
  audioRequests: [{
    resource: "E/36",
    entry: "0000:0220",
    afterFixedWaitNativeTicks: 0,
  }],
}, "intermediate recovery contract");
assertEqual({
  selectionRadius: recovery3Dispatch.selectionRadius,
  nativeAiSelectionRadius: recovery3AiAction.selectionRadius,
  effectRadius: recovery3Tier.effectRadius,
  healByRangeValue: recovery3Tier.healByRangeValue,
  experienceBase: recovery3Tier.experienceBase,
  resource: recoveryPresentation.presentation.resource,
  descriptorTileCodes: recoveryPresentation.presentation.descriptorSequence
    .map(({ tileCodes }) => tileCodes[0]),
  drawCount: recoveryPresentation.presentation.drawCount,
  waitPerDrawNativeTicks: recoveryPresentation.presentation.waitPerDrawNativeTicks,
  fixedGraphicWaitNativeTicks: recoveryPresentation.fixedGraphicWaitNativeTicks,
  audioRequests: recoveryPresentation.audioRequests,
}, {
  selectionRadius: 6,
  nativeAiSelectionRadius: 6,
  effectRadius: 4,
  healByRangeValue: { 1: 35, 2: 60, 3: 85, 4: 110 },
  experienceBase: 12,
  resource: "MAGIC/20",
  descriptorTileCodes: [1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 1, 1, 0, 0],
  drawCount: 17,
  waitPerDrawNativeTicks: 15,
  fixedGraphicWaitNativeTicks: 255,
  audioRequests: [{
    resource: "E/36",
    entry: "0000:0220",
    afterFixedWaitNativeTicks: 0,
  }],
}, "advanced recovery contract");
assertEqual({
  selectionRadius: stompDispatch.selectionRadius,
  damageBase: stompTier.damageBase,
  fixedGraphicWaitNativeTicks: stompPresentation.presentation.fixedGraphicWaitNativeTicks,
  graphicDrawCount: stompPresentation.presentation.graphicDrawCount,
  audioResource: stompPresentation.audioResource,
  targetImpactAnchor: stompPresentation.presentation.targetImpactAnchor,
  drawXCoordinate: stompAction.drawXCoordinate,
  shadowDrawYCoordinate: stompAction.shadowDrawYCoordinate,
  graphicByTargetSide: stompAction.graphicByTargetSide,
}, {
  selectionRadius: 5,
  damageBase: 10,
  fixedGraphicWaitNativeTicks: 13,
  graphicDrawCount: 33,
  audioResource: "MAGIC/82",
  targetImpactAnchor: { x: 240, y: 390 },
  drawXCoordinate: 160,
  shadowDrawYCoordinate: 338,
  graphicByTargetSide: { side1: "MAGIC/50", side2: "MAGIC/49" },
}, "initial stomp contract");
assertEqual({
  selectionRadius: stomp2Dispatch.selectionRadius,
  damageBase: stomp2Tier.damageBase,
  variant: stomp2Tier.variant,
  fixedGraphicWaitNativeTicks: stompPresentation.presentation.fixedGraphicWaitNativeTicks,
  graphicDrawCount: stompPresentation.presentation.graphicDrawCount,
  audioResource: stompPresentation.audioResource,
  targetImpactAnchor: stompPresentation.presentation.targetImpactAnchor,
  drawXCoordinate: stomp2Action.drawXCoordinate,
  shadowDrawYCoordinate: stomp2Action.shadowDrawYCoordinate,
  graphicByTargetSide: stomp2Action.graphicByTargetSide,
}, {
  selectionRadius: 5,
  damageBase: 15,
  variant: 1,
  fixedGraphicWaitNativeTicks: 13,
  graphicDrawCount: 33,
  audioResource: "MAGIC/82",
  targetImpactAnchor: { x: 240, y: 390 },
  drawXCoordinate: 160,
  shadowDrawYCoordinate: 368,
  graphicByTargetSide: { side1: "MAGIC/52", side2: "MAGIC/51" },
}, "male stomp contract");
assertEqual({
  selectionRadius: stomp3Dispatch.selectionRadius,
  damageBase: stomp3Tier.damageBase,
  variant: stomp3Tier.variant,
  fixedGraphicWaitNativeTicks: stompPresentation.presentation.fixedGraphicWaitNativeTicks,
  graphicDrawCount: stompPresentation.presentation.graphicDrawCount,
  audioResource: stompPresentation.audioResource,
  targetImpactAnchor: stompPresentation.presentation.targetImpactAnchor,
  drawXCoordinate: stomp3Action.drawXCoordinate,
  shadowDrawYCoordinate: stomp3Action.shadowDrawYCoordinate,
  graphicByTargetSide: stomp3Action.graphicByTargetSide,
}, {
  selectionRadius: 5,
  damageBase: 20,
  variant: 2,
  fixedGraphicWaitNativeTicks: 13,
  graphicDrawCount: 33,
  audioResource: "MAGIC/82",
  targetImpactAnchor: { x: 240, y: 390 },
  drawXCoordinate: 160,
  shadowDrawYCoordinate: 368,
  graphicByTargetSide: { side1: "MAGIC/54", side2: "MAGIC/53" },
}, "female stomp contract");
assertEqual(
  rules.rules.families.D.experience,
  "fixed 5 returned by the handler; kill experience returned by the common effect finalizer is ignored",
  "stomp fixed experience contract",
);
assertEqual(constructionFamily, {
  visibleNames: { "1K": "鐵板", "2K": "障礙" },
  selectionRadius: 5,
  playerRoute: constructionFamily.playerRoute,
  sourceTokens: constructionFamily.sourceTokens,
  dormantDispatchRows: constructionFamily.dormantDispatchRows,
}, "construction family contract");
assertEqual({
  selectionRadius: constructionFamily.selectionRadius,
  neighborOrder: constructionFamily.playerRoute.neighborOrder,
  mutation: constructionFamily.playerRoute.mutation,
  experience: constructionFamily.playerRoute.experience,
}, {
  selectionRadius: 5,
  neighborOrder: [50, -50, 1, -1],
  mutation: "write the stage-specific sourceToken itself to every accepted orthogonal neighbor; the selected center cell is not written by this player route",
  experience: "none; the construction route spends the action after movement without a casting-experience write",
}, "reachable player construction route contract");

assertEqual({
  actionCode: wdDocument.wd.actionCode,
  users: wdDocument.wd.users,
  targetGroup: wdDocument.wd.aiBinding.targetGroup,
  selectionRadius: wdDocument.wd.aiBinding.selectionRadius,
  requestedPerEligibleLineCell: wdDocument.wd.damage.requestedPerEligibleLineCell,
  graphicResource: wdDocument.wd.presentation.graphicResource,
  directAudioRequest: wdDocument.wd.presentation.directAudioRequest,
  rawTileCodes: wdDocument.wd.presentation.rawTileCodes,
  waitPerStep: wdDocument.wd.presentation.waitPerGrowthOrFinishStepNativeTicks,
  finishSteps: wdDocument.wd.presentation.finishSteps,
}, {
  actionCode: "WD",
  users: [
    { classCode: "0P", className: "女帝" },
    { classCode: "1P", className: "龍" },
  ],
  targetGroup: "enemy",
  selectionRadius: 10,
  requestedPerEligibleLineCell: 90,
  graphicResource: "MAGIC/19",
  directAudioRequest: null,
  rawTileCodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 130],
  waitPerStep: 20,
  finishSteps: 10,
}, "WD path-action contract");

const graphicEntries = presentations.resourceCatalog.graphicEntries;
const copyGraphicFrom = async (entries, key, outputDirectory) => {
  const entry = requireEntry(entries, (candidate) => candidate.key === key, `${key} graphic`);
  const destination = path.join(publicRoot, "map-actions", outputDirectory);
  await mkdir(destination, { recursive: true });
  const paths = [];
  for (const [index, source] of entry.renderedPaths.entries()) {
    const filename = `${String(index).padStart(2, "0")}.png`;
    await copyFile(path.join(root, source), path.join(destination, filename));
    paths.push(`/assets/original/map-actions/${outputDirectory}/${filename}`);
  }
  return paths;
};
const copyGraphic = async (key, outputDirectory) =>
  copyGraphicFrom(graphicEntries, key, outputDirectory);

const assets = {
  lightning1: {
    main: await copyGraphic("MAGIC/8", "lightning-1/main"),
    hit: await copyGraphic("MAGIC/31", "lightning-1/hit"),
    cleanup: await copyGraphic("MAGIC/6", "lightning-1/cleanup"),
  },
  lightning2: {
    primary: await copyGraphic("MAGIC/47", "lightning-2/primary"),
    column: await copyGraphic("MAGIC/48", "lightning-2/column"),
    hit: await copyGraphic("MAGIC/24", "lightning-2/hit"),
    cleanup: await copyGraphic("MAGIC/6", "lightning-2/cleanup"),
  },
  lightning3: {
    cloud: await copyGraphic("MAGIC/3", "lightning-3/cloud"),
    column: await copyGraphic("MAGIC/4", "lightning-3/column"),
    hit: await copyGraphic("MAGIC/25", "lightning-3/hit"),
    cleanup: await copyGraphic("MAGIC/6", "lightning-3/cleanup"),
  },
  lightning4: {
    primary: await copyGraphic("MAGIC/39", "lightning-4/primary"),
    column: await copyGraphic("MAGIC/40", "lightning-4/column"),
    hit: await copyGraphic("MAGIC/26", "lightning-4/hit"),
    cleanup: await copyGraphic("MAGIC/6", "lightning-4/cleanup"),
  },
  ice1: {
    expansion: await copyGraphic("MAGIC/10", "ice-1/expansion"),
  },
  fire2: {
    effect: await copyGraphic("MAGIC/23", "fire-2/effect"),
  },
  fire3: {
    effect: await copyGraphic("MAGIC/27", "fire-3/effect"),
  },
  fire4: {
    ground: await copyGraphic("MAGIC/30", "fire-4/ground"),
    column: await copyGraphic("MAGIC/28", "fire-4/column"),
    finish: await copyGraphic("MAGIC/29", "fire-4/finish"),
  },
  heal2: {
    primary: await copyGraphic("MAGIC/37", "heal-2/primary"),
  },
  heal3: {
    outer: await copyGraphic("MAGIC/42", "heal-3/outer"),
    loop: await copyGraphic("MAGIC/41", "heal-3/loop"),
  },
  recovery1: {
    effect: await copyGraphic("MAGIC/20", "recovery-1/effect"),
  },
  attackUp: {
    effect: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      "MAGIC/16",
      "attack-up/effect",
    ),
  },
  magicGuard: {
    effect: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      "MAGIC/16",
      "attack-up/effect",
    ),
  },
  poison: {
    rise: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      "MAGIC/17",
      "poison/rise",
    ),
    cloud: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      "MAGIC/18",
      "poison/cloud",
    ),
  },
  confusion: {
    effect: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      "MAGIC/44",
      "confusion/effect",
    ),
  },
  attackDown: {
    effect: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      "MAGIC/46",
      "attack-down/effect",
    ),
  },
  defenseDown: {
    effect: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      "MAGIC/45",
      "defense-down/effect",
    ),
  },
  spellSeal: {
    effect: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      "MAGIC/36",
      "spell-seal/effect",
    ),
  },
  defenseUp: {
    effect: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      "MAGIC/33",
      "defense-up/effect",
    ),
  },
  dispel: {
    effect: await (async () => {
      const entry = requireEntry(
        remainingPresentations.resourceCatalog.graphicEntries,
        ({ key }) => key === "UN/57",
        "UN/57 graphic",
      );
      const destination = path.join(publicRoot, "map-actions/dispel/effect");
      await mkdir(destination, { recursive: true });
      const paths = [];
      for (const [index, source] of entry.renderedPaths.entries()) {
        const filename = `${String(index).padStart(2, "0")}.png`;
        await copyFile(path.join(root, source), path.join(destination, filename));
        paths.push(`/assets/original/map-actions/dispel/effect/${filename}`);
      }
      return paths;
    })(),
  },
  stomp1: {
    side1: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      stompAction.graphicByTargetSide.side1,
      "stomp-1/side-1",
    ),
    side2: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      stompAction.graphicByTargetSide.side2,
      "stomp-1/side-2",
    ),
  },
  stomp2: {
    side1: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      stomp2Action.graphicByTargetSide.side1,
      "stomp-2/side-1",
    ),
    side2: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      stomp2Action.graphicByTargetSide.side2,
      "stomp-2/side-2",
    ),
  },
  stomp3: {
    side1: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      stomp3Action.graphicByTargetSide.side1,
      "stomp-3/side-1",
    ),
    side2: await copyGraphicFrom(
      remainingPresentations.resourceCatalog.graphicEntries,
      stomp3Action.graphicByTargetSide.side2,
      "stomp-3/side-2",
    ),
  },
  wd: {
    effect: await copyGraphicFrom(
      wdDocument.resourceCatalog.graphicEntries,
      "MAGIC/19",
      "wd/effect",
    ),
  },
};

await Promise.all([
  mkdir(path.join(publicRoot, "audio/e"), { recursive: true }),
  mkdir(path.join(publicRoot, "audio/un"), { recursive: true }),
  mkdir(path.join(publicRoot, "audio/magic"), { recursive: true }),
]);
await Promise.all([
  copyFile(
    path.join(root, "reverse/renders/planar/A/0002/03.png"),
    path.join(publicRoot, "unit-ally-magic-priest.png"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/E/0043.wav"),
    path.join(publicRoot, "audio/e/43.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/E/0063.wav"),
    path.join(publicRoot, "audio/e/63.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/E/0041.wav"),
    path.join(publicRoot, "audio/e/41.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/E/0009.wav"),
    path.join(publicRoot, "audio/e/9.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/E/0051.wav"),
    path.join(publicRoot, "audio/e/51.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/E/0036.wav"),
    path.join(publicRoot, "audio/e/36.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/E/0058.wav"),
    path.join(publicRoot, "audio/e/58.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/E/0008.wav"),
    path.join(publicRoot, "audio/e/8.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/UN/0050.wav"),
    path.join(publicRoot, "audio/un/50.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/UN/0051.wav"),
    path.join(publicRoot, "audio/un/51.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/UN/0052.wav"),
    path.join(publicRoot, "audio/un/52.wav"),
  ),
  copyFile(
    path.join(root, "reverse/converted/audio/wav/MAGIC/0082.wav"),
    path.join(publicRoot, "audio/magic/82.wav"),
  ),
]);

const definitions = {
  "fire-2": {
    id: "fire-2",
    nativeCode: "2F",
    label: "中級炎暴",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: fire2Dispatch.selectionRadius,
    },
    damage: {
      type: "magic",
      maxLifePercent: fire2Tier.percentMaxLife,
      cap: fire2Tier.damageCap,
      blockedByMagicGuard: true,
      clearsMagicGuard: true,
    },
    damagePresentation: {
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    },
    experience: {
      base: fire2Tier.experienceBase,
      randomMinimum: fire2Tier.experienceRandom[0],
      randomMaximum: fire2Tier.experienceRandom[1],
      addKillReward: true,
    },
    presentationId: "fire-2",
  },
  "fire-3": {
    id: "fire-3",
    nativeCode: "3F",
    label: "高級炎暴",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: fire3Dispatch.selectionRadius,
    },
    damage: {
      type: "magic",
      maxLifePercent: fire3Tier.percentMaxLife,
      cap: fire3Tier.damageCap,
      blockedByMagicGuard: true,
      clearsMagicGuard: true,
    },
    damagePresentation: {
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    },
    experience: {
      base: fire3Tier.experienceBase,
      randomMinimum: fire3Tier.experienceRandom[0],
      randomMaximum: fire3Tier.experienceRandom[1],
      addKillReward: true,
    },
    presentationId: "fire-3",
  },
  "fire-4": {
    id: "fire-4",
    nativeCode: "4F",
    label: "究級炎暴",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: fire4Dispatch.selectionRadius,
    },
    damage: {
      type: "magic",
      maxLifePercent: fire4Tier.percentMaxLife,
      cap: fire4Tier.damageCap,
      blockedByMagicGuard: true,
      clearsMagicGuard: true,
    },
    damagePresentation: {
      mode: "post-graphics-point-drain",
      waitPerPointNativeTicks: 1,
    },
    experience: {
      base: fire4Tier.experienceBase,
      randomMinimum: fire4Tier.experienceRandom[0],
      randomMaximum: fire4Tier.experienceRandom[1],
      addKillReward: true,
    },
    presentationId: "fire-4",
  },
  "heal-2": {
    id: "heal-2",
    nativeCode: "2H",
    label: "中級治療",
    kind: "technique",
    target: "ally",
    range: {
      mode: 0,
      selectionRadius: heal2Dispatch.selectionRadius,
    },
    healing: {
      maxLifePercent: heal2Tier.maxLifePercent,
    },
    experience: {
      base: heal2Tier.experienceBase,
      randomMinimum: heal2Tier.experienceRandom[0],
      randomMaximum: heal2Tier.experienceRandom[1],
    },
    presentationId: "heal-2",
  },
  "heal-3": {
    id: "heal-3",
    nativeCode: "3H",
    label: "高級治療",
    kind: "technique",
    target: "ally",
    range: {
      mode: 0,
      selectionRadius: heal3Dispatch.selectionRadius,
    },
    healing: {
      maxLifePercent: heal3Tier.maxLifePercent,
    },
    experience: {
      base: heal3Tier.experienceBase,
      randomMinimum: heal3Tier.experienceRandom[0],
      randomMaximum: heal3Tier.experienceRandom[1],
    },
    presentationId: "heal-3",
  },
  "lightning-1": {
    id: "lightning-1",
    nativeCode: "1L",
    label: "初級落雷",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: lightningDispatch.selectionRadius,
      effectRadius: lightningTier.effectRadius,
    },
    damage: {
      type: "magic-area",
      byRangeValue: lightningTier.damageByRangeValue,
    },
    experience: {
      base: lightningTier.experienceBase,
      randomMinimum: lightningTier.experienceRandom[0],
      randomMaximum: lightningTier.experienceRandom[1],
      addKillReward: true,
    },
    presentationId: "lightning-1",
  },
  "lightning-2": {
    id: "lightning-2",
    nativeCode: "2L",
    label: "中級落雷",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: lightning2Dispatch.selectionRadius,
      effectRadius: lightning2Tier.effectRadius,
    },
    damage: {
      type: "magic-area",
      byRangeValue: lightning2Tier.damageByRangeValue,
    },
    experience: {
      base: lightning2Tier.experienceBase,
      randomMinimum: lightning2Tier.experienceRandom[0],
      randomMaximum: lightning2Tier.experienceRandom[1],
      addKillReward: true,
    },
    presentationId: "lightning-2",
  },
  "lightning-3": {
    id: "lightning-3",
    nativeCode: "3L",
    label: "高級落雷",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: lightning3Dispatch.selectionRadius,
      effectRadius: lightning3Tier.effectRadius,
    },
    damage: {
      type: "magic-area",
      byRangeValue: lightning3Tier.damageByRangeValue,
    },
    experience: {
      base: lightning3Tier.experienceBase,
      randomMinimum: lightning3Tier.experienceRandom[0],
      randomMaximum: lightning3Tier.experienceRandom[1],
      addKillReward: true,
    },
    presentationId: "lightning-3",
  },
  "lightning-4": {
    id: "lightning-4",
    nativeCode: "4L",
    label: "究級落雷",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: lightning4Dispatch.selectionRadius,
      effectRadius: lightning4Tier.effectRadius,
    },
    damage: {
      type: "magic-area",
      byRangeValue: lightning4Tier.damageByRangeValue,
    },
    experience: {
      base: lightning4Tier.experienceBase,
      randomMinimum: lightning4Tier.experienceRandom[0],
      randomMaximum: lightning4Tier.experienceRandom[1],
      addKillReward: true,
    },
    presentationId: "lightning-4",
  },
  "ice-1": {
    id: "ice-1",
    nativeCode: "1C",
    label: "初級冰雪",
    kind: "technique",
    target: "self-area",
    range: {
      mode: 0,
      selectionRadius: iceDispatch.selectionRadius,
      effectRadius: iceTier.effectRadius,
    },
    displacement: {
      directions: ["down", "up", "left", "right"],
      requireLowerRangeValue: true,
    },
    experience: {
      base: iceTier.experienceBase,
      randomMinimum: iceTier.experienceRandom[0],
      randomMaximum: iceTier.experienceRandom[1],
    },
    presentationId: "ice-1",
  },
  "ice-2": {
    id: "ice-2",
    nativeCode: "2C",
    label: "中級冰雪",
    kind: "technique",
    target: "self-area",
    range: {
      mode: 0,
      selectionRadius: ice2Dispatch.selectionRadius,
      aiCandidateSelectionRadius: ice2AiAction.selectionRadius,
      effectRadius: ice2Tier.effectRadius,
    },
    displacement: {
      directions: ["down", "up", "left", "right"],
      requireLowerRangeValue: true,
    },
    experience: {
      base: ice2Tier.experienceBase,
      randomMinimum: ice2Tier.experienceRandom[0],
      randomMaximum: ice2Tier.experienceRandom[1],
    },
    presentationId: "ice-2",
  },
  "ice-3": {
    id: "ice-3",
    nativeCode: "3C",
    label: "高級冰雪",
    kind: "technique",
    target: "self-area",
    range: {
      mode: 0,
      selectionRadius: ice3Dispatch.selectionRadius,
      aiCandidateSelectionRadius: ice3AiAction.selectionRadius,
      effectRadius: ice3Tier.effectRadius,
    },
    displacement: {
      directions: ["down", "up", "left", "right"],
      requireLowerRangeValue: true,
    },
    experience: {
      base: ice3Tier.experienceBase,
      randomMinimum: ice3Tier.experienceRandom[0],
      randomMaximum: ice3Tier.experienceRandom[1],
    },
    presentationId: "ice-3",
  },
  "ice-4": {
    id: "ice-4",
    nativeCode: "4C",
    label: "究級冰雪",
    kind: "technique",
    target: "self-area",
    range: {
      mode: 0,
      selectionRadius: ice4Dispatch.selectionRadius,
      aiCandidateSelectionRadius: ice4AiAction.selectionRadius,
      effectRadius: ice4Tier.effectRadius,
    },
    displacement: {
      directions: ["down", "up", "left", "right"],
      requireLowerRangeValue: true,
    },
    experience: {
      base: ice4Tier.experienceBase,
      randomMinimum: ice4Tier.experienceRandom[0],
      randomMaximum: ice4Tier.experienceRandom[1],
    },
    presentationId: "ice-4",
  },
  "recovery-1": {
    id: "recovery-1",
    nativeCode: "1I",
    label: "初級回復",
    kind: "technique",
    target: "ally",
    range: {
      mode: 0,
      selectionRadius: recoveryDispatch.selectionRadius,
      effectRadius: recoveryTier.effectRadius,
    },
    healing: {
      type: "magic-area",
      byRangeValue: recoveryTier.healByRangeValue,
    },
    experience: {
      base: recoveryTier.experienceBase,
      randomMinimum: 0,
      randomMaximum: 1,
      divisor: 50,
      quotientCap: 8,
    },
    presentationId: "recovery-1",
  },
  "recovery-2": {
    id: "recovery-2",
    nativeCode: "2I",
    label: "中級回復",
    kind: "technique",
    target: "ally",
    range: {
      mode: 0,
      selectionRadius: recovery2Dispatch.selectionRadius,
      effectRadius: recovery2Tier.effectRadius,
    },
    healing: {
      type: "magic-area",
      byRangeValue: recovery2Tier.healByRangeValue,
    },
    experience: {
      base: recovery2Tier.experienceBase,
      randomMinimum: 0,
      randomMaximum: 1,
      divisor: 50,
      quotientCap: 8,
    },
    presentationId: "recovery-1",
  },
  "recovery-3": {
    id: "recovery-3",
    nativeCode: "3I",
    label: "高級回復",
    kind: "technique",
    target: "ally",
    range: {
      mode: 0,
      selectionRadius: recovery3Dispatch.selectionRadius,
      effectRadius: recovery3Tier.effectRadius,
    },
    healing: {
      type: "magic-area",
      byRangeValue: recovery3Tier.healByRangeValue,
    },
    experience: {
      base: recovery3Tier.experienceBase,
      randomMinimum: 0,
      randomMaximum: 1,
      divisor: 50,
      quotientCap: 8,
    },
    presentationId: "recovery-1",
  },
  "attack-up": {
    id: "attack-up",
    nativeCode: "AA",
    label: "攻擊提昇",
    kind: "technique",
    target: "ally",
    range: {
      mode: 0,
      selectionRadius: attackUpDispatch.selectionRadius,
    },
    status: {
      key: "attackUp",
      counter: 3,
      effectiveAttackDelta: 20,
    },
    experience: {
      base: 10,
      randomMinimum: 0,
      randomMaximum: 3,
    },
    presentationId: "attack-up",
  },
  "magic-guard": {
    id: "magic-guard",
    nativeCode: "FM",
    label: "防魔",
    kind: "technique",
    target: "ally",
    range: {
      mode: 0,
      selectionRadius: magicGuardDispatch.selectionRadius,
    },
    status: {
      key: "magicGuard",
      counter: 1,
    },
    experience: {
      base: 10,
      randomMinimum: 0,
      randomMaximum: 3,
    },
    presentationId: "magic-guard",
  },
  "poison": {
    id: "poison",
    nativeCode: "IP",
    label: "施毒",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: poisonDispatch.selectionRadius,
    },
    status: {
      key: "poison",
      counter: 3,
      immuneClasses: ["dragon", "head", "hand"],
    },
    experience: {
      base: 14,
      randomMinimum: 0,
      randomMaximum: 3,
    },
    presentationId: "poison",
  },
  "confusion": {
    id: "confusion",
    nativeCode: "LA",
    label: "混亂",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: confusionDispatch.selectionRadius,
    },
    status: {
      key: "confusion",
      counter: 3,
      immuneClasses: ["dragon", "head", "hand"],
    },
    experience: {
      base: 14,
      randomMinimum: 0,
      randomMaximum: 3,
    },
    presentationId: "confusion",
  },
  "attack-down": {
    id: "attack-down",
    nativeCode: "SA",
    label: "攻擊下降",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: attackDownDispatch.selectionRadius,
    },
    status: {
      key: "attackDown",
      counter: 3,
      effectiveAttackDelta: -20,
    },
    experience: {
      base: 10,
      randomMinimum: 0,
      randomMaximum: 3,
    },
    presentationId: "attack-down",
  },
  "defense-down": {
    id: "defense-down",
    nativeCode: "SD",
    label: "防禦下降",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: defenseDownDispatch.selectionRadius,
    },
    status: {
      key: "defenseDown",
      counter: 3,
      effectiveDefenseDelta: -20,
    },
    experience: {
      base: 10,
      randomMinimum: 0,
      randomMaximum: 3,
    },
    presentationId: "defense-down",
  },
  "spell-seal": {
    id: "spell-seal",
    nativeCode: "SN",
    label: "禁咒",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: spellSealDispatch.selectionRadius,
    },
    status: {
      key: "techniqueSeal",
      counter: 3,
      immuneClasses: ["dragon"],
    },
    experience: {
      base: 14,
      randomMinimum: 0,
      randomMaximum: 3,
    },
    presentationId: "spell-seal",
  },
  "prayer": {
    id: "prayer",
    nativeCode: "OJ",
    label: "祈禱",
    kind: "technique",
    target: "self-area",
    range: {
      mode: 0,
      ignoredNativeSelectionWord: prayerDispatch.selectionRadius,
    },
    scan: {
      width: 50,
      height: 50,
      eligibleSide: 1,
      gateBit: 0,
    },
    outcomes: {
      healing: { roll: 0, minimum: 5, maximum: 14 },
      experience: { roll: 1, minimum: 5, maximum: 14 },
      attackUp: { roll: 2, counter: 3 },
      defenseUp: { roll: 3, counter: 3 },
    },
    casterExperience: 0,
    presentationId: "prayer",
  },
  "defense-up": {
    id: "defense-up",
    nativeCode: "AD",
    label: "防禦提昇",
    kind: "technique",
    target: "ally",
    range: {
      mode: 0,
      selectionRadius: defenseUpDispatch.selectionRadius,
    },
    status: {
      key: "defenseUp",
      counter: 3,
      effectiveDefenseDelta: 20,
    },
    experience: {
      base: 10,
      randomMinimum: 0,
      randomMaximum: 3,
    },
    presentationId: "defense-up",
  },
  "dispel": {
    id: "dispel",
    nativeCode: "TR",
    label: "破邪",
    kind: "technique",
    target: "ally",
    range: {
      mode: 0,
      selectionRadius: dispelDispatch.selectionRadius,
    },
    cleanse: {
      statuses: ["confusion", "attackDown", "defenseDown", "poison", "techniqueSeal"],
      frozen: true,
    },
    experience: {
      base: 14,
      randomMinimum: 0,
      randomMaximum: 3,
    },
    presentationId: "dispel",
  },
  "stomp-1": {
    id: "stomp-1",
    nativeCode: "1D",
    label: "龍踏",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: stompDispatch.selectionRadius,
      effectSeed: rules.rules.families.D.baseArea.rangeMapSeed,
      viewportWidth: 10,
      viewportHeight: 7,
    },
    damage: {
      type: "stomp-area",
      base: stompTier.damageBase,
      randomBelow: stompTier.damageBase,
      ignoresMagicGuard: true,
    },
    experience: {
      fixed: 5,
      addKillReward: false,
    },
    presentationId: "stomp-1",
  },
  "stomp-2": {
    id: "stomp-2",
    nativeCode: "2D",
    label: "男踏",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: stomp2Dispatch.selectionRadius,
      effectSeed: rules.rules.families.D.baseArea.rangeMapSeed,
      viewportWidth: 10,
      viewportHeight: 7,
    },
    damage: {
      type: "stomp-area",
      base: stomp2Tier.damageBase,
      randomBelow: stomp2Tier.damageBase,
      ignoresMagicGuard: true,
    },
    experience: {
      fixed: 5,
      addKillReward: false,
    },
    presentationId: "stomp-2",
  },
  "stomp-3": {
    id: "stomp-3",
    nativeCode: "3D",
    label: "女踏",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: stomp3Dispatch.selectionRadius,
      effectSeed: rules.rules.families.D.baseArea.rangeMapSeed,
      viewportWidth: 10,
      viewportHeight: 7,
    },
    damage: {
      type: "stomp-area",
      base: stomp3Tier.damageBase,
      randomBelow: stomp3Tier.damageBase,
      ignoresMagicGuard: true,
    },
    experience: {
      fixed: 5,
      addKillReward: false,
    },
    presentationId: "stomp-3",
  },
  "iron-plate": {
    id: "iron-plate",
    nativeCode: "1K",
    label: "鐵板",
    kind: "construction",
    target: "empty-cell",
    range: {
      mode: "M",
      selectionSeed: constructionFamily.selectionRadius,
    },
    terrain: {
      kind: "iron-plate",
      neighborOrder: ["down", "up", "right", "left"],
      skipLogicalSlot: 0,
      mutateCenter: false,
    },
    experience: { fixed: 0 },
    presentationId: null,
  },
  "obstacle": {
    id: "obstacle",
    nativeCode: "2K",
    label: "障礙",
    kind: "construction",
    target: "empty-cell",
    range: {
      mode: "M",
      selectionSeed: constructionFamily.selectionRadius,
    },
    terrain: {
      kind: "obstacle",
      neighborOrder: ["down", "up", "right", "left"],
      skipLogicalSlot: 0,
      mutateCenter: false,
    },
    experience: { fixed: 0 },
    presentationId: null,
  },
  wd: {
    id: "wd",
    nativeCode: wdDocument.wd.actionCode,
    label: "WD",
    kind: "technique",
    target: "enemy",
    range: {
      mode: 0,
      selectionRadius: wdDocument.wd.aiBinding.selectionRadius,
    },
    damage: {
      type: "path",
      perEligibleLineCell: wdDocument.wd.damage.requestedPerEligibleLineCell,
      blockedByMagicGuard: true,
      clearsMagicGuard: false,
      ignoresAttackDefenseAndTerrain: true,
    },
    experience: { fixed: 0 },
    presentationId: "wd",
  },
};

const timeline = {
  fire2: fire2Presentation,
  fire3: fire3Presentation,
  fire4: fire4Presentation,
  heal2: heal2Presentation,
  heal3: heal3Presentation,
  lightning1: lightningPresentation,
  lightning2: lightning2Presentation,
  lightning3: lightning3Presentation,
  lightning4: lightning4Presentation,
  ice1: {
    ...icePresentation,
    cycle: presentations.presentations.ice.cycle,
    audioResource: presentations.presentations.ice.audioResource,
  },
  ice2: {
    ...ice2Presentation,
    cycle: presentations.presentations.ice.cycle,
    audioResource: presentations.presentations.ice.audioResource,
  },
  ice3: {
    ...ice3Presentation,
    cycle: presentations.presentations.ice.cycle,
    audioResource: presentations.presentations.ice.audioResource,
  },
  ice4: {
    ...ice4Presentation,
    cycle: presentations.presentations.ice.cycle,
    audioResource: presentations.presentations.ice.audioResource,
  },
  recovery1: recoveryPresentation,
  recovery2: recoveryPresentation,
  recovery3: recoveryPresentation,
  attackUp: attackUpPresentation,
  magicGuard: magicGuardPresentation,
  poison: poisonPresentation,
  confusion: confusionPresentation,
  attackDown: attackDownPresentation,
  defenseDown: defenseDownPresentation,
  spellSeal: spellSealPresentation,
  prayer: prayerPresentation,
  defenseUp: defenseUpPresentation,
  dispel: dispelPresentation,
  stomp1: {
    ...stompPresentation,
    action: stompAction,
  },
  stomp2: {
    ...stompPresentation,
    action: stomp2Action,
  },
  stomp3: {
    ...stompPresentation,
    action: stomp3Action,
  },
  wd: {
    pathOrder: wdDocument.wd.path.order,
    growthOrder: wdDocument.wd.path.growthOrder,
    descriptors: wdDocument.wd.presentation.descriptors,
    waitPerGrowthOrFinishStepNativeTicks:
      wdDocument.wd.presentation.waitPerGrowthOrFinishStepNativeTicks,
    finishSteps: wdDocument.wd.presentation.finishSteps,
    directAudioRequest: wdDocument.wd.presentation.directAudioRequest,
  },
};

const source = `// Generated by scripts/generate-stage1-actions.mjs from native technique evidence.\n`
  + `// Do not hand-edit.\n`
  + `export const STAGE1_ACTION_DEFINITIONS = ${JSON.stringify(definitions, null, 2)} as const;\n\n`
  + `export type Stage1ActionId = keyof typeof STAGE1_ACTION_DEFINITIONS;\n\n`
  + `export const STAGE1_ACTION_PRESENTATION = ${JSON.stringify(timeline, null, 2)} as const;\n\n`
  + `export const STAGE1_ACTION_PRESENTATION_ASSETS = ${JSON.stringify(assets, null, 2)} as const;\n\n`
  + `export const STAGE1_ACTION_AUDIO_ASSETS = ${JSON.stringify({
    "e-36": "/assets/original/audio/e/36.wav",
    "e-43": "/assets/original/audio/e/43.wav",
    "e-63": "/assets/original/audio/e/63.wav",
    "e-41": "/assets/original/audio/e/41.wav",
    "e-9": "/assets/original/audio/e/9.wav",
    "e-51": "/assets/original/audio/e/51.wav",
    "e-58": "/assets/original/audio/e/58.wav",
    "e-8": "/assets/original/audio/e/8.wav",
    "un-50": "/assets/original/audio/un/50.wav",
    "un-51": "/assets/original/audio/un/51.wav",
    "un-52": "/assets/original/audio/un/52.wav",
    "magic-82": "/assets/original/audio/magic/82.wav",
  }, null, 2)} as const;\n`;

await writeFile(outputPath, source, "utf8");
console.log(`wrote ${path.relative(root, outputPath)} and stage-1 technique assets`);
