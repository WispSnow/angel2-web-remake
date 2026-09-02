#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_LINEAR_BASE = 0x1eba0;

const CODE_SIGNATURES = [
  ["0000:719B", 67, "commit-player-shot", "0378c398b42fa311168da1e8c8a585e3785535699599e45c245205316dec5c85"],
  ["0000:722B", 57, "resolve-player-shot-or-swift-dragon-evasion", "d2c042f866a8ecbaa84a2e9fd1fd048b7f41ff53720c28960d2aa808aac76adf"],
  ["0000:7264", 127, "dispatch-player-shot-by-class", "6ae58c5a1053046f28a9189e0f446e13535fd8a2b1cbea0a7d5f43bbe8069791"],
  ["0000:CCA4", 46, "cast-line-effect-3", "6a4c1442dc1aaf323167ebd01a999d641e89988efa7db96d0cac3914cd779d95"],
  ["1000:1F7B", 59, "resolve-ai-shot-or-swift-dragon-evasion", "7f842228a290cf011cedd59b840e35ae7e6afc85491787de613e5900e70f8d41"],
  ["1000:1FB6", 96, "dispatch-ai-shot-by-class", "05038cb7525e73f683db4effd07ffbd174f3891f53caa98e24b382a2bcd14b74"],
  ["1000:747C", 130, "run-common-shot-impact-and-damage", "6a3a4733fa8c851fcfc7f478f41b592b8767330b4d0628605ce010245996d6f7"],
  ["1000:64A6", 79, "run-line-effect-presentation-and-damage", "5507804ea4d3e8bf6338d2eea45b780b0e0004c7eae67991005ffc434bf27d9e"],
  ["1000:64F5", 61, "run-line-effect-growth-and-finish", "1387dfc3cba804fbee0eba405e7e802cd37362b24a74f527654b12c55b79c0cd"],
  ["1000:6532", 105, "advance-one-line-effect-cell", "f5e71b2b200c755762ecc1f9b85c5e854ed216377fb47ac6b5800716c8f8827a"],
  ["1000:659B", 114, "finish-line-effect-frames", "1ddf00a00fc33f28b19d857d8998228a03c0efb192872961f0d9151cc905e125"],
  ["0000:642B", 13, "draw-map-effect-descriptor-without-wait", "9994e0b48d0d4300b50bf583df7d89eb5e8a4d1cb4a91da843f9fd5924d2a1ee"],
  ["0000:64A1", 11, "flush-map-effect-and-wait", "56e78310c68116c64a537e2d75a9df2c7439be5366dbea11c82f9d325d2c91ed"],
  ["1000:7E09", 50, "build-target-to-source-line-cell-list", "57f93061ccf2d084a954feb739216f4713c025102b451c28118de9eb3430ad43"],
  ["1000:7E3B", 33, "emit-line-cell-list-from-target", "7c2737c3ec6e5418ba56c237549205d1ebb7bf63473c7b922fd45d732da9ab6b"],
  ["1000:7DEC", 11, "read-line-cell-list-entry", "ccbc57380eec5d02ad41ba6434288eb8d941de30e23a9a6974022ca166886a6f"],
  ["0000:628E", 100, "prepare-selected-target-area-effect", "5f390a87d8e813e3626f268ac991fd784ec2fc51f587fece8f44bcc87426c759"],
  ["0000:0220", 4, "play-loaded-voc", "8b6dd90ff475aa49aa931335b5539ed716ef748f4d3392af5b9c9ba17501f754"],
  ["0000:63CF", 65, "finalize-special-effect-and-remove-dead", "7a90c7afbe41f173b7330cd142b5adb42c0938d46f710e56ddd2d47305d1fff2"],
];

const DATA_SIGNATURES = [
  [0x6cde, 0x6ce8, "common-shot-dynamic-descriptor", "c8c07a4259ef6dffa5610cc4c452c4cb28daa139ea91f4d0224a934ca816c75b"],
  [0x6888, 0x689c, "line-effect-descriptor-pointer-table", "753a7baf2efc0a2f65c775cacb130190b9872c3eac7c7a402f0e795caddc8291"],
  [0x17ca, 0x182e, "line-effect-descriptors", "7cda2b5492851fe92d42a9bd5c8f968581f528b6dfbdccc1706dcd6c94de60a5"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function linearAddress(address) {
  const match = /^([0-9A-F]{4}):([0-9A-F]{4})$/i.exec(address);
  assert(match !== null, `invalid segmented address ${address}`);
  return Number.parseInt(match[1], 16) * 16 + Number.parseInt(match[2], 16);
}

function checkedSlice(buffer, start, end, label) {
  assert(start >= 0 && end >= start && end <= buffer.length,
    `${label}: ${start}..${end} outside ${buffer.length}-byte source`);
  return buffer.subarray(start, end);
}

function dsLinear(offset) {
  return DATA_LINEAR_BASE + offset;
}

function readWord(buffer, dsOffset) {
  return checkedSlice(buffer, dsLinear(dsOffset), dsLinear(dsOffset) + 2,
    `DS:${hex(dsOffset)}`).readUInt16LE(0);
}

function readSignedWord(buffer, dsOffset) {
  return checkedSlice(buffer, dsLinear(dsOffset), dsLinear(dsOffset) + 2,
    `DS:${hex(dsOffset)}`).readInt16LE(0);
}

function decodeDescriptor(buffer, dsOffset) {
  const width = readWord(buffer, dsOffset + 4);
  const height = readWord(buffer, dsOffset + 6);
  assert(width > 0 && height > 0 && width * height <= 64,
    `DS:${hex(dsOffset)}: invalid descriptor dimensions ${width}x${height}`);
  const tileCodes = Array.from({ length: width * height }, (_, index) =>
    readWord(buffer, dsOffset + 8 + index * 2));
  return {
    address: `DS:${hex(dsOffset)}`,
    xOffset: readSignedWord(buffer, dsOffset),
    yOffset: readSignedWord(buffer, dsOffset + 2),
    width,
    height,
    tileCodes,
    low7BitFrameIndices: tileCodes.map((code) =>
      code === 0 ? null : (code & 0x7f) - 1),
  };
}

function validateCodeSignatures(buffer) {
  return CODE_SIGNATURES.map(([address, bytes, role, expectedSha256]) => {
    const start = linearAddress(address);
    const payload = checkedSlice(buffer, start, start + bytes, address);
    assert(sha256(payload) === expectedSha256, `${address}: ${role} signature mismatch`);
    return { address, role, bytes, sha256: expectedSha256 };
  });
}

function validateDataSignatures(buffer) {
  return DATA_SIGNATURES.map(([start, end, role, expectedSha256]) => {
    const payload = checkedSlice(buffer, dsLinear(start), dsLinear(end), role);
    assert(sha256(payload) === expectedSha256, `DS:${hex(start)}: ${role} signature mismatch`);
    return {
      address: `DS:${hex(start)}`,
      endExclusive: `DS:${hex(end)}`,
      role,
      bytes: end - start,
      sha256: expectedSha256,
    };
  });
}

function parseTerminatedPointers(buffer, dsOffset) {
  const pointers = [];
  for (let index = 0; index < 64; index += 1) {
    const value = readWord(buffer, dsOffset + index * 2);
    if (value === 0xffff) return pointers;
    pointers.push(value);
  }
  throw new Error(`DS:${hex(dsOffset)}: missing FFFF terminator`);
}

async function graphicCatalog(extractedRoot, decodedRoot, planarRoot, records) {
  const [extracted, decoded, planar] = await Promise.all([
    readFile(path.join(extractedRoot, "UN/manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(decodedRoot, "UN/manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(planarRoot, "UN/manifest.json"), "utf8").then(JSON.parse),
  ]);
  const entries = [];
  for (const record of records) {
    const extractedEntry = extracted.records.find((entry) => entry.index === record);
    const decodedEntry = decoded.entries.find((entry) => entry.record === record);
    const planarEntry = planar.entries.find((entry) => entry.record === record);
    assert(extractedEntry !== undefined && !extractedEntry.missing && !extractedEntry.terminator,
      `UN/${record}: source record is unavailable`);
    assert(decodedEntry !== undefined, `UN/${record}: decoded manifest entry is unavailable`);
    assert(planarEntry !== undefined, `UN/${record}: planar manifest entry is unavailable`);
    const stem = String(record).padStart(4, "0");
    const sourcePath = path.join(extractedRoot, `UN/${stem}.bin`);
    const payload = await readFile(sourcePath);
    entries.push({
      key: `UN/${record}`,
      group: "UN",
      record,
      sourcePath,
      sourceBytes: payload.length,
      sourceSha256: sha256(payload),
      decodedKind: decodedEntry.kind,
      decodedStreams: decodedEntry.streams.filter((stream) => stream.present).length,
      renderedFrames: planarEntry.images.length,
      renderedPaths: planarEntry.images.map((image) =>
        path.join(planarRoot, "UN", image.output)),
    });
  }
  return entries;
}

function audioCatalog(audioManifest, audioManifestPath, extractedRoot, references) {
  const audioRoot = path.dirname(audioManifestPath);
  return references.map(({ group, record, role }) => {
    const entry = audioManifest.entries.find((candidate) =>
      candidate.group === group && candidate.record === record);
    assert(entry !== undefined, `${group}/${record}: converted audio entry is unavailable`);
    return {
      key: `${group}/${record}`,
      group,
      record,
      role,
      sourcePath: path.join(extractedRoot, entry.source),
      sourceBytes: entry.sourceBytes,
      sourceSha256: entry.sourceSha256,
      outputPath: path.join(audioRoot, entry.output),
      codec: entry.codec,
      sampleRate: entry.sampleRate,
      channels: entry.channels,
      durationSeconds: entry.durationSeconds,
    };
  });
}

async function extract(
  modulePath,
  audioManifestPath,
  extractedRoot,
  decodedRoot,
  planarRoot,
  outputPath,
) {
  const [moduleBuffer, audioBuffer] = await Promise.all([
    readFile(modulePath),
    readFile(audioManifestPath),
  ]);
  const audioManifest = JSON.parse(audioBuffer.toString("utf8"));
  const linePointers = parseTerminatedPointers(moduleBuffer, 0x6888);
  assert(linePointers.length === 9, `expected nine line descriptors, got ${linePointers.length}`);
  const lineDescriptors = linePointers.map((pointer) => decodeDescriptor(moduleBuffer, pointer));
  const expectedLineTileCodes = [1, 2, 3, 4, 5, 6, 7, 8, 0x82];
  assert(JSON.stringify(lineDescriptors.map((entry) => entry.tileCodes[0])) ===
    JSON.stringify(expectedLineTileCodes), "unexpected line-effect descriptor sequence");

  const commonDescriptor = decodeDescriptor(moduleBuffer, 0x6cde);
  assert(commonDescriptor.width === 1 && commonDescriptor.height === 1,
    "common shot descriptor must be 1x1");

  const graphics = await graphicCatalog(extractedRoot, decodedRoot, planarRoot, [60, 62]);
  assert(graphics.find((entry) => entry.record === 60)?.renderedFrames === 8,
    "UN/60 must render eight frames");
  assert(graphics.find((entry) => entry.record === 62)?.renderedFrames === 8,
    "UN/62 must render eight frames");
  const audio = audioCatalog(audioManifest, audioManifestPath, extractedRoot, [
    { group: "MAGIC", record: 83, role: "line-effect sound" },
    { group: "E", record: 38, role: "AI swift-dragon evasion ordinary-hit sound" },
  ]);

  const contactSheetPath = path.join(
    path.dirname(planarRoot), "contact-sheets/shooting/UN-0060-shot.png",
  );
  const contactSheet = await readFile(contactSheetPath);

  const result = {
    format: "ANGEL2 shooting presentation rules",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    source: {
      path: modulePath,
      bytes: moduleBuffer.length,
      sha256: sha256(moduleBuffer),
      dataLinearBase: DATA_LINEAR_BASE,
      audioManifest: {
        path: audioManifestPath,
        bytes: audioBuffer.length,
        sha256: sha256(audioBuffer),
      },
    },
    verifiedCodeSignatures: validateCodeSignatures(moduleBuffer),
    verifiedDataSignatures: validateDataSignatures(moduleBuffer),
    renderMode: {
      fullScreenCombatToggleRead: false,
      rule: "shooting never reads DS:1119 bit0 and always uses board/map effect rendering, even when ordinary attacks are configured for full-screen combat",
    },
    entryPoints: {
      playerCommit: "0000:719B",
      playerEvasionAndDispatch: "0000:722B",
      playerClassDispatch: "0000:7264",
      aiEvasionAndDispatch: "1000:1F7B",
      aiClassDispatch: "1000:1FB6",
      commonImpact: "1000:747C",
      lineEffect3: "0000:CCA4",
      lineEffectPresentation: "1000:64A6",
    },
    classes: {
      player: [
        { classCode: "3A", className: "弓兵", baseRoll: "30..49", selectedTargetDamage: "30..49", presentation: "commonImpact", experience: "kill reward + 8 flat (0000:7290 add cx,8 with no add cx,ax)" },
        { classCode: "0I", className: "弩兵", baseRoll: "70..89", selectedTargetDamage: "70..89", presentation: "commonImpact", experience: "kill reward + 13 flat (0000:72B0 add cx,0dh with no add cx,ax)" },
        { classCode: "1I", className: "魔弓兵", baseRoll: "50..69", selectedTargetDamage: "2*floor(baseRoll/2) = 50..68", otherEligibleLineCellDamage: "floor(baseRoll/2) = 25..34", presentation: "lineEffect3", experience: "kill reward + 26..30 (3V handler 0000:CCA4 returns kill + randomBelow(5) + 13; 0000:72DC adds a second 13)" },
      ],
      ai: [
        { classCode: "3A", className: "弓兵", baseRoll: "30..49", selectedTargetDamage: "30..49", presentation: "commonImpact" },
        { classCode: "0I", className: "弩兵", baseRoll: "50..89", selectedTargetDamage: "50..89", presentation: "commonImpact", differsFromPlayer: true },
        { classCode: "1I", className: "魔弓兵", baseRoll: "50..59", selectedTargetDamage: "2*floor(baseRoll/2) = 50..58", otherEligibleLineCellDamage: "floor(baseRoll/2) = 25..29", presentation: "lineEffect3", differsFromPlayer: true },
      ],
    },
    commonImpact: {
      entry: "1000:747C",
      graphicResource: "UN/60",
      directAudioRequest: null,
      descriptor: {
        ...commonDescriptor,
        dynamicTileCodeAddress: "DS:6CE6",
        staticFileTileCodeBeforeRuntimeInitialization: commonDescriptor.tileCodes[0],
      },
      timeline: {
        waitPerDrawNativeTicks: 6,
        tileCodes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 0],
        meaning: "blank, eight rendered UN/60 frames in order, blank",
        drawCount: 10,
        fixedGraphicWaitNativeTicks: 60,
      },
      damageTimeline: {
        gate: "DS:6B60 == 'Y'",
        amount: "DS:5230",
        behavior: "after all ten graphic draws, call 0000:6507 once per requested damage point; each call applies at most one point, redraws, waits one native tick, and can stop early",
      },
      finalizer: "0000:63CF removes zero-life units and returns kill reward where the caller consumes it",
    },
    swiftDragonEvasion: {
      targetClassCode: "0E",
      condition: "PIT port 40h bit0 is one after the target class check",
      player: {
        sequence: "set DS:6B60='N', run commonImpact with nominal damage 20, restore 'Y'",
        graphicResource: "UN/60",
        audioResource: null,
        damage: 0,
        fixedGraphicWaitNativeTicks: 60,
      },
      ai: {
        sequence: "set DS:6B60='N', call ordinary map hit entry 1000:6B58 with nominal damage 20, restore 'Y'",
        graphicResource: "UN/62",
        audioResource: "E/38",
        damage: 0,
        ordinaryHitDrawCount: 9,
        fixedGraphicWaitNativeTicks: 90,
        soundRequests: 2,
      },
      preservedAsymmetry: "player and AI share the evade condition but deliberately reach different no-damage presentation functions in the shipped binary",
    },
    lineEffect: {
      actionCodes: ["1V", "2V", "3V"],
      shootingBinding: "魔弓兵 uses 3V through 0000:CCA4",
      graphicResource: "UN/60",
      audioResource: "MAGIC/83",
      audioRequestTiming: "load MAGIC/83 and call the ungated-by-DS:10ED 0000:0220 entry before the line growth pass",
      path: {
        builder: "1000:7E09",
        storage: "1000:028B, up to 100 words",
        order: "selected target at index 0, then predecessor cells back toward and including the source/shooter cell",
        equalPredecessorTieBreak: "PIT-influenced direction order in 1000:7E5C",
      },
      descriptorPointerTable: {
        address: "DS:6888",
        pointers: linePointers.map((value) => `DS:${hex(value)}`),
        terminator: "FFFF",
      },
      descriptors: lineDescriptors,
      rawTileCodes: expectedLineTileCodes,
      tileCodeBoundary: "codes 1..8 map to the eight UN/60 frames; final raw code 82h has a high-bit renderer role that remains unnamed and must not be normalized away",
      timing: {
        waitPerGrowthOrFinishStepNativeTicks: 20,
        growthPass: "walk the stored list backward from the source toward index 0/target; each newly reached cell applies floor(baseRoll/2), advances the staggered descriptor trail, flushes, then waits",
        selectedTargetSecondDamage: "after the growth pass, apply floor(baseRoll/2) once more to list index 0; therefore the selected target receives 2*floor(baseRoll/2), not only one half-roll",
        finishPass: "apply descriptor stages 2..8 and raw 82h across the full line, one flush/wait per stage",
        finishSteps: 8,
        totalFixedWaitFormulaNativeTicks: "(lineCellCount + 8) * 20",
      },
      statusAndDeath: {
        defenseMagic: "0000:783D makes +0C bit15 block the growth-pass half-damage; 1000:6532 then calls 0000:5491 to clear defense magic on that path cell. A shielded selected target therefore blocks the first half, loses the shield, and takes only the explicit second half; a shielded non-target line unit takes zero from this cast",
        deathRemoval: "deferred until 0000:63CF after the complete line animation",
      },
      originalQuirk: "DS:687A saves the unhalved input but has no reader; DS:5230 is halved in place, while the explicit second target application recreates an even-valued near-full target hit and drops one point from odd rolls",
    },
    resourceCatalog: {
      graphicEntries: graphics,
      audioEntries: audio,
      contactSheets: [{
        path: contactSheetPath,
        bytes: contactSheet.length,
        sha256: sha256(contactSheet),
      }],
    },
    evidenceBoundary: {
      confirmed: "player/AI dispatch, full-screen-toggle bypass, common impact frame order and waits, asymmetric evasion presentations, line growth/finish ordering, selected-target double half-damage, resource records and audio request timing",
      preservedUnknown: "the exact renderer meaning of line descriptor tile code 82h; the released nominal native timer tick is 10.000151 ms",
      implementation: "frozen until phase-1 GDD review passes",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted shooting presentations: ${result.verifiedCodeSignatures.length} code signatures, ` +
    `${result.verifiedDataSignatures.length} data signatures, ` +
    `${graphics.length} graphics and ${audio.length} audio records`,
  );
  return result;
}

function usage() {
  return "usage: angel2-shooting-presentations.mjs --extract MODULE29 AUDIO_MANIFEST " +
    "EXTRACTED_ROOT DECODED_ROOT PLANAR_ROOT OUTPUT_JSON";
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "--extract" || args.length !== 6) throw new Error(usage());
  await extract(...args);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { decodeDescriptor, extract };
