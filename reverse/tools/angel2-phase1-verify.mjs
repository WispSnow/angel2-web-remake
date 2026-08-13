#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readJson(fileName) {
  return JSON.parse(await readFile(fileName, "utf8"));
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fileName = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fileName));
    else if (entry.isFile()) files.push(fileName);
  }
  return files;
}

async function verifyReferenceHashes(root) {
  const manifestPath = path.join(root, "reverse/manifests/ref-angel2.sha256");
  const lines = (await readFile(manifestPath, "utf8")).trim().split(/\r?\n/);
  const entries = [];
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match !== null, `invalid checksum line: ${line}`);
    const [, expected, relativePath] = match;
    const source = await readFile(path.join(root, relativePath));
    const actual = sha256(source);
    assert(actual === expected, `${relativePath}: expected ${expected}, got ${actual}`);
    entries.push(relativePath);
  }
  const referenceFiles = (await readdir(path.join(root, "ref/ANGEL2"), { withFileTypes: true }))
    .filter((entry) => entry.isFile()).map((entry) => `ref/ANGEL2/${entry.name}`).sort();
  assert(entries.length === 28, `expected 28 checksum entries, found ${entries.length}`);
  assert(JSON.stringify(entries.slice().sort()) === JSON.stringify(referenceFiles),
    "checksum manifest and ref/ANGEL2 file set differ");
  return entries.length;
}

async function verifyJsonFiles(root) {
  const files = (await walk(path.join(root, "reverse"))).filter((file) => file.endsWith(".json"));
  for (const file of files) {
    try {
      JSON.parse(await readFile(file, "utf8"));
    }
    catch (error) {
      throw new Error(`${path.relative(root, file)}: invalid JSON: ${error.message}`);
    }
  }
  return files.length;
}

async function verifyMarkdownLinks(root) {
  const files = (await walk(path.join(root, "reverse"))).filter((file) => file.endsWith(".md"));
  let linkCount = 0;
  for (const file of files) {
    const source = (await readFile(file, "utf8"))
      .replace(/```[\s\S]*?```/g, "");
    for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim();
      if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
      target = target.replace(/\s+["'][^"']*["']$/, "");
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      target = target.split("#", 1)[0];
      if (target.length === 0) continue;
      try {
        target = decodeURIComponent(target);
      }
      catch {
        throw new Error(`${path.relative(root, file)}: invalid encoded link ${target}`);
      }
      const resolved = path.resolve(path.dirname(file), target);
      try {
        await stat(resolved);
      }
      catch {
        throw new Error(`${path.relative(root, file)}: missing local link ${target}`);
      }
      linkCount += 1;
    }
  }
  return { markdownFiles: files.length, localLinks: linkCount };
}

async function verifyPhase1Artifacts(root) {
  const native = path.join(root, "reverse/parsed/native");
  const inventory = await readJson(path.join(root, "reverse/manifests/resource-coverage.json"));
  const unitCatalog = await readJson(path.join(native, "unit-catalog.json"));
  const promotion = await readJson(path.join(native, "promotion-table.json"));
  const timing = await readJson(path.join(native, "native-timing.json"));
  const feedback = await readJson(path.join(native, "feedback-presentations.json"));
  const ending = await readJson(path.join(native, "ending-presentations.json"));
  const planeOrder = await readJson(path.join(native, "plane-order.json"));
  const password = await readJson(path.join(native, "password-flow.json"));
  const portraitManifest = await readJson(path.join(root, "reverse/renders/planar/D/manifest.json"));
  const passwordManifest = await readJson(path.join(root, "reverse/renders/planar/C_password/manifest.json"));
  const audit = await readJson(path.join(native, "phase1-residual-audit.json"));
  const gdd = await readFile(path.join(root, "reverse/gdd/original-gdd.md"), "utf8");

  const summary = inventory.summary;
  assert(inventory.phase === "asset_and_gdd_reconstruction_only", "inventory phase changed");
  assert(inventory.implementationFrozen === true, "inventory no longer freezes implementation");
  assert(summary.referenceFiles === 28, "inventory reference file count changed");
  assert(summary.indexedContainers === 14, "indexed container count changed");
  assert(summary.extractedIndexedRecords === summary.indexedPresentRecords,
    "not all indexed records are extracted");
  assert(summary.reconstructedRuntimeModules === 10, "runtime module count changed");
  assert(summary.lzexeUnpackedRuntimeModules === 10, "LZEXE module count changed");
  assert(summary.unresolvedFiles.length === 0, "inventory contains unresolved files");

  const unitValidation = unitCatalog.validation;
  assert(unitCatalog.recordCount === 39, "native unit catalog must contain 39 records");
  assert(unitValidation.recordsWithNativeNames === 39, "unit names are incomplete");
  assert(unitValidation.guideExperienceTransformValues === 195 &&
    unitValidation.guideExperienceTransformTotal === 195,
  "guide experience transformation no longer validates 195/195 values");
  assert(unitValidation.guideUnchangedFieldValues === 1170 &&
    unitValidation.guideUnchangedFieldValuesTotal === 1170,
  "guide fields 1..6 no longer validate 1170/1170 values");
  assert(unitValidation.recordsWithUnresolvedAiClassDispatch === 0,
    "unit catalog contains unresolved AI class dispatches");
  assert(promotion.edgeCount === 31 && promotion.guideComparison.edgeSetExact === true,
    "native promotion graph no longer exactly matches the 31-edge guide graph");
  assert(promotion.guideComparison.allSourceOptionOrdersExact === true,
    "native promotion option order no longer matches the guide");
  assert(promotion.dataRow4LevelAlignmentAudit.mismatchCount === 1,
    "DATA row-four level-alignment exception count changed");
  assert(promotion.dataRow4LevelAlignmentAudit.archerToCrossbowProof.allowedByNativeProductionPath === true,
    "native archer-to-crossbow commit proof is no longer closed");

  assert(timing.moduleCoverage.auditedModules.length === 9,
    "native timing audit must cover nine released runtime modules");
  assert(timing.pit.divisor === 11932, "native PIT divisor changed");
  assert(timing.fidelityContract.webLogicalTickMilliseconds === 10,
    "Web logical tick contract changed");
  assert(timing.closure.allReleasedRuntimeModulesUseSameNominalTick === true,
    "native timing is not closed across all released runtime modules");
  assert(feedback.closure.fixedCollapseReachabilityClosed === true,
    "fixed collapse archive reachability is not closed");
  assert(feedback.closure.module27KeySoundVisibleBindingClosed === true,
    "module 27 key-sound visible binding is not closed");
  assert(ending.module46CreditsAndTerminalScreen.nameFrames[2].text === "蘇泓漳",
    "credit frame 2 transcription changed");
  assert(planeOrder.streamToColorBit.join(",") === "3,2,1,0" &&
    planeOrder.modules.length === 3,
  "native planar stream-to-color order is not closed across modules 21/25/29");
  assert(portraitManifest.planeOrder === "streams 0..3 -> VGA color bits 3..0",
    "gameplay planar manifest uses the wrong color-bit order");
  assert(passwordManifest.palette === "password" &&
    passwordManifest.planeOrder === "streams 0..3 -> VGA color bits 3..0",
  "password planar manifest lacks its native palette or plane order");
  assert(password.passwordUi.answerChoices.buttonVisualsLeftToRight
    .map((entry) => entry.colorName).join(",") === "red,yellow,blue,green,purple,white",
  "password button colors no longer match the native module21 palette");
  assert(sha256(await readFile(path.join(root,
    "reverse/renders/story-presentations/frames/D/0045/00.png"))) ===
    "fc9b1da463aa030a07902a3df1c9741e1e8093849910667574b609778a3d163f",
  "Ximi portrait render changed");
  assert(sha256(await readFile(path.join(root,
    "reverse/renders/story-presentations/frames/D/0046/00.png"))) ===
    "3c3afabf1a910f46152b5b95245e1c048185fa28749e5f2b93b5c75c58ef285b",
  "Niya portrait render changed");

  const evidence = audit.evidenceRegister;
  assert(evidence.rows === 165 && evidence.confirmedRows === 144 && evidence.mixedRows === 21,
    "phase-1 evidence counts must remain 165/144/21");
  assert(audit.implementationRequiredUnknowns.length === 0,
    "phase-1 audit contains implementation-required unknowns");
  assert(evidence.residuals.every((entry) => entry.blocksDeterministicWebRules === false),
    "a mixed evidence row now blocks deterministic Web rules");
  assert(summary.phase1EvidenceRows === evidence.rows &&
    summary.phase1ConfirmedRows === evidence.confirmedRows &&
    summary.phase1MixedRows === evidence.mixedRows &&
    summary.phase1ImplementationRequiredUnknowns === 0,
  "inventory and phase-1 audit counts disagree");
  assert(gdd.includes("版本：Draft 0.71"), "GDD is not Draft 0.71");
  assert(gdd.includes("165 项：144 项纯 C、21 项混合边界、实现必需未知 0"),
    "GDD evidence summary is stale");

  return {
    indexedRecords: summary.extractedIndexedRecords,
    runtimeModules: summary.reconstructedRuntimeModules,
    nativeTimerModules: timing.moduleCoverage.auditedModules.length,
    unitRecords: unitCatalog.recordCount,
    promotionEdges: promotion.edgeCount,
    evidenceRows: evidence.rows,
    confirmedRows: evidence.confirmedRows,
    mixedRows: evidence.mixedRows,
    implementationRequiredUnknowns: audit.implementationRequiredUnknowns.length,
  };
}

async function main() {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const [referenceFiles, jsonFiles, markdown, phase1] = await Promise.all([
    verifyReferenceHashes(root),
    verifyJsonFiles(root),
    verifyMarkdownLinks(root),
    verifyPhase1Artifacts(root),
  ]);
  console.log(JSON.stringify({
    status: "phase_1_evidence_baseline_verified",
    root,
    referenceFiles,
    jsonFiles,
    ...markdown,
    ...phase1,
    implementationFrozen: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
