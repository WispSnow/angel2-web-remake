#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_MODULE_SHA256 = "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4";
const DATA_LINEAR_BASE = 0x1eba0;
const BIG5 = new TextDecoder("big5", { fatal: true });
const DIFFICULTY_LABELS = ["過關斬將", "勢均力敵", "困難重重", "無法無天"];
const RECORD_BYTES = 24;
const RECORD_COUNT = 60;
const EXPECTED_WORD04 = [
  3, 4, 2, 0, 0, 6, 5, 3, 3, 3, 4, 4, 4, 4, 4, 4,
  3, 4, 2, 0, 0, 6, 5, 3, 3, 3, 4, 4, 4, 4, 4, 4,
  4, 4, 4, 4, 3, 4, 2, 0, 0, 6, 5, 3, 3, 3, 4, 4,
  4, 0, 0, 6, 5, 3, 3, 3, 4, 4, 4, 4,
];

const CODE_SIGNATURES = [
  ["0000:3410", 0x03410, 0x036b0, "construct and render all five numbered save/load rows", "a9fc4fec9c72ae4d41154bad7fe4d37f6b8e967af9eb7ee910354d3174d450b5"],
  ["0000:5083", 0x05083, 0x0510c, "far wrapper and side-table selector used to load side-1 slot 0 before writing metadata", "5405a242fa57dcd4d24741f0b3f330cb54007d1e72bad91180ddb0499250efb0"],
  ["0000:510C", 0x0510c, 0x051ad, "load current unit state; skip +04, copy +06, and copy statuses +08..+16", "95f0ddf9e238968124389ae76f8f4bc708520ec453a69fffdea651f91b31e43b"],
  ["0000:51EC", 0x051ec, 0x0529a, "resolve the current class descriptor and recompute its level row; the metadata writer does not call this path", "cd11fd6b564db721e9afa740477c4b1ffa3e31179301f900d540bac31fb47698"],
  ["1000:35F2", 0x135f2, 0x13633, "decrement only the eight status words +08..+16", "206ba2f04072aae4a1fd94d23a7322643feea8e1f154559c82058b6a570c204c"],
  ["1000:29A2", 0x129a2, 0x129ca, "run the five-item game-function panel and mirror DS:111D to DS:F592", "9731bbcf838c844ace6d570896f68b553750a0720ef2d1307ca4093c93634474"],
  ["0000:D3B6", 0x0d3b6, 0x0d3d1, "wait for native timer ticks only when DS:F592 is nonzero", "0e3f83b1b0bd7be88e0ed1aafc745f5a0ac46eaae645bfe6cf0bc6b8f1b37c3d"],
  ["0000:5C71", 0x05c71, 0x05c9f, "restore and persist the three-word generic battle-menu state", "03bb7b0511d6fdcccd0a66a1e9e7fe68e3cf18028062500f983ecfa4bb04ac27"],
  ["0000:8EE6", 0x08ee6, 0x08f2c, "draw the generic menu from x, y, item count and raw color attribute", "266034a68044269b897d6250b751240d4e6539f5c3261c7d60a10a9e7e2699e3"],
  ["1000:1002", 0x11002, 0x1102a, "restore 4+6+6 settings bytes from WAR", "7cea515cd7a231c651b503b0e478799e7824e9ca1023aab8f028cd7d2e4b3ff7"],
  ["1000:89CD", 0x189cd, 0x189f5, "serialize 4+6+6 settings bytes to WAR", "25b6c02a15a21bf9df627bd782ce4f12dd6127e26f5f50560d90b01ed3331b98"],
  ["1000:1077", 0x11077, 0x1108f, "restore three generic-menu words from WAR", "d98372ed9fa44b8fa929e330407c1fba4a0793d1843fcb9e626b9c461fe93bca"],
  ["1000:8A3C", 0x18a3c, 0x18a54, "serialize three generic-menu words to WAR", "5d94ec5c79ecb931092cc22fca5a44822bd979e7a60bba4f2bb9e433149b6bf3"],
  ["1000:04C0", 0x104c0, 0x105cf, "import battle state, settings and generic-menu words from the parent", "d947822fa089b8155f567642d9502dd64f3a84bfac43ac960028e7e218ea1b99"],
  ["1000:05E5", 0x105e5, 0x106a3, "export battle state, settings and generic-menu words to the parent", "8dbd42416d7ec6ee557e7afcd6f031b8bb2c00f2f124de01e41e9399ee1ba396"],
  ["1000:8882", 0x18882, 0x188cb, "write the seven-word save header, including the five visible slot-list fields", "e334609e98cb68f8cc29a8fa8d809b13eb033711198d2a6424f29b8ce788498a"],
];

const DATA_SIGNATURES = [
  ["DS:1B97-1C1F", 0x1b97, 0x1c20, "numbered save/load titles, exact five-column header, and related selector strings", "70bf266e3bb480eeee89b04867da4f8ccd6dbfb704fda51b4b752296db476933"],
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function nativeWords(moduleBuffer, recordBase, fieldOffset) {
  return Array.from({ length: RECORD_COUNT }, (_, slot) =>
    moduleBuffer.readUInt16LE(DATA_LINEAR_BASE + recordBase + slot * RECORD_BYTES + fieldOffset));
}

function verifyCodeSignatures(moduleBuffer) {
  return CODE_SIGNATURES.map(([address, start, end, meaning, expectedSha256]) => {
    const actualSha256 = sha256(moduleBuffer.subarray(start, end));
    assert(actualSha256 === expectedSha256, `${address}: code signature mismatch`);
    return { address, start, end, bytes: end - start, sha256: actualSha256, meaning };
  });
}

function verifyDataSignatures(moduleBuffer) {
  return DATA_SIGNATURES.map(([address, start, end, meaning, expectedSha256]) => {
    const bytes = moduleBuffer.subarray(DATA_LINEAR_BASE + start, DATA_LINEAR_BASE + end);
    const actualSha256 = sha256(bytes);
    assert(actualSha256 === expectedSha256, `${address}: data signature mismatch`);
    return {
      address,
      start: DATA_LINEAR_BASE + start,
      end: DATA_LINEAR_BASE + end,
      bytes: end - start,
      sha256: actualSha256,
      meaning,
    };
  });
}

function dollarString(moduleBuffer, offset) {
  const start = DATA_LINEAR_BASE + offset;
  let end = start;
  while (end < moduleBuffer.length && moduleBuffer[end] !== 0x24) end += 1;
  assert(end < moduleBuffer.length, `DS:${offset.toString(16)}: missing '$' terminator`);
  const bytes = moduleBuffer.subarray(start, end);
  return {
    address: `DS:${offset.toString(16).toUpperCase().padStart(4, "0")}`,
    text: BIG5.decode(bytes),
    big5Hex: bytes.toString("hex").toUpperCase(),
  };
}

function unitNameMap(unitDescriptors) {
  const map = new Map();
  for (const record of unitDescriptors.records) {
    const code = record.descriptors.find((descriptor) => descriptor.set === "set1")?.code;
    if (code === undefined) continue;
    const previous = map.get(code);
    assert(previous === undefined || previous === record.normalizedName,
      `side-1 class code ${code}: conflicting unit names`);
    map.set(code, record.normalizedName);
  }
  return map;
}

function sampleField(file, side, field) {
  return file.state.dynamicUnitStates[`side${side}`].records.map((record) => record[field]);
}

async function extract(modulePath, decodedSavePath, unitDescriptorPath, outputPath) {
  const [moduleBuffer, decodedSaveText, unitDescriptorText] = await Promise.all([
    readFile(modulePath),
    readFile(decodedSavePath, "utf8"),
    readFile(unitDescriptorPath, "utf8"),
  ]);
  const moduleSha256 = sha256(moduleBuffer);
  assert(moduleSha256 === EXPECTED_MODULE_SHA256, "module 29 SHA-256 mismatch");
  const decodedSaves = JSON.parse(decodedSaveText);
  const unitDescriptors = JSON.parse(unitDescriptorText);
  const namesByCode = unitNameMap(unitDescriptors);
  const warFiles = decodedSaves.files.filter((file) => /^WAR[0-4]\.TST$/.test(file.fileName));
  assert(warFiles.length === 5, `expected five numbered WAR samples, got ${warFiles.length}`);

  const loadTitle = dollarString(moduleBuffer, 0x1bbb);
  const saveTitle = dollarString(moduleBuffer, 0x1bc8);
  const columnHeader = dollarString(moduleBuffer, 0x1bd5);
  assert(loadTitle.text === "讀取遊戲進度", "native load title changed");
  assert(saveTitle.text === "儲存遊戲進度", "native save title changed");
  assert(columnHeader.text === "        職業/等級/經驗值/儲存次數/    難度",
    "native save-slot column header changed");

  const nativeSide1Word04 = nativeWords(moduleBuffer, 0x464a, 0x04);
  const nativeSide2Word04 = nativeWords(moduleBuffer, 0x4c66, 0x04);
  const nativeSide1Word06 = nativeWords(moduleBuffer, 0x464a, 0x06);
  const nativeSide2Word06 = nativeWords(moduleBuffer, 0x4c66, 0x06);
  assert(arraysEqual(nativeSide1Word04, EXPECTED_WORD04), "native side-1 +04 initializer mismatch");
  assert(arraysEqual(nativeSide2Word04, EXPECTED_WORD04), "native side-2 +04 initializer mismatch");
  assert(nativeSide1Word06.every((value) => value === 0), "native side-1 +06 initializer is nonzero");
  assert(nativeSide2Word06.every((value) => value === 0), "native side-2 +06 initializer is nonzero");

  for (const file of warFiles) {
    const metadata = Object.fromEntries(file.slotListMetadata.map((field) =>
      [field.semanticName, field]));
    assert(Object.keys(metadata).join("|") ===
      "occupation|level|experienceValue|saveCount|difficulty",
    `${file.fileName}: named slot metadata fields changed`);
    assert(namesByCode.has(metadata.occupation.rawAscii),
      `${file.fileName}: unknown occupation code ${metadata.occupation.rawAscii}`);
    assert(metadata.occupation.displayValue === namesByCode.get(metadata.occupation.rawAscii),
      `${file.fileName}: occupation display-name mismatch`);
    assert(metadata.experienceValue.value ===
      file.state.dynamicUnitStates.side1.records[0].cumulativeExperience,
    `${file.fileName}: header experience is not side-1 slot-0 cumulative experience`);
    assert(metadata.difficulty.displayValue ===
      (DIFFICULTY_LABELS[metadata.difficulty.value] ?? DIFFICULTY_LABELS[0]),
    `${file.fileName}: difficulty display mismatch`);
    for (const side of [1, 2]) {
      assert(arraysEqual(sampleField(file, side, "preservedUnknownWord04"), EXPECTED_WORD04),
        `${file.fileName} side ${side}: +04 sample mismatch`);
      assert(sampleField(file, side, "preservedUnknownWord06").every((value) => value === 0),
        `${file.fileName} side ${side}: +06 sample is nonzero`);
    }
    const tail = file.state.tailState;
    assert(tail.settings.gameFunctions.nativeTimerWaitEnabledRaw === 1,
      `${file.fileName}: native timer-wait byte is not 1`);
    assert(tail.settings.musicVolume.serializedUnusedTailByte === 0,
      `${file.fileName}: unused music tail byte is not 0`);
    assert(arraysEqual(tail.genericBattleMenuState.rawWords, [32, 400, 180]),
      `${file.fileName}: generic battle-menu state mismatch`);
  }

  const nativeTimerWaitEnabledRaw = moduleBuffer[DATA_LINEAR_BASE + 0x111d];
  const serializedUnusedMusicTailByte = moduleBuffer[DATA_LINEAR_BASE + 0x1165];
  const nativeMenuWords = Array.from({ length: 3 }, (_, index) =>
    moduleBuffer.readUInt16LE(DATA_LINEAR_BASE + 0x3dca + index * 2));
  assert(nativeTimerWaitEnabledRaw === 1, "native DS:111D initializer mismatch");
  assert(serializedUnusedMusicTailByte === 0, "native DS:1165 initializer mismatch");
  assert(arraysEqual(nativeMenuWords, [32, 400, 180]), "native DS:3DCA menu state mismatch");

  const result = {
    format: "ANGEL2 WAR dynamic/tail-state semantic audit",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    sources: {
      module29: { path: modulePath, bytes: moduleBuffer.length, sha256: moduleSha256 },
      decodedSaves: decodedSavePath,
      unitDescriptors: unitDescriptorPath,
      numberedWarSamples: warFiles.map((file) => ({
        fileName: file.fileName,
        sourceSha256: file.sha256,
        decodedSha256: file.decoded.sha256,
      })),
    },
    slotListMetadata: {
      visibleText: { loadTitle, saveTitle, columnHeader },
      headerScanBytes: 50,
      missingFileSentinel: "0x5858 ('XX')",
      columns: [
        {
          offset: "12h",
          nativeLabel: "職業",
          semanticName: "occupation",
          nativeSource: "DS:319D",
          display: "map the two-byte ASCII class code through the native descriptor table to an occupation name",
          writerBoundary: "snapshot of the already-current working descriptor; the save prelude does not recompute it",
        },
        {
          offset: "14h",
          nativeLabel: "等級",
          semanticName: "level",
          nativeSource: "DS:31BD",
          display: "right-aligned decimal",
          writerBoundary: "snapshot of the already-computed working-unit level/growth row; the save prelude does not recompute it",
        },
        {
          offset: "16h",
          nativeLabel: "經驗值",
          semanticName: "experienceValue",
          nativeSource: "DS:318E",
          display: "right-aligned decimal",
          writerBoundary: "1000:8882 first calls 0000:5083 with side=1, slot=0, so this is refreshed from side-1 slot-0 cumulative experience",
        },
        {
          offset: "18h",
          nativeLabel: "儲存次數",
          semanticName: "saveCount",
          nativeSource: "DS:00BC / GO SAVE_NUM",
          display: "right-aligned decimal",
          writerBoundary: "increment before serialization; every completed metadata-write path advances the campaign-wide counter once",
        },
        {
          offset: "1Eh",
          nativeLabel: "難度",
          semanticName: "difficulty",
          nativeSource: "DS:0000 / GO LV_HARD",
          display: "four native difficulty labels; invalid stored values display as index zero",
        },
      ],
      originalQuirk: "the pre-save side-1 slot-0 load refreshes experience but does not call the descriptor/level recomputation path at 0000:51EC; occupation and level can therefore reflect the prior working unit while experience belongs to side-1 slot 0",
      fiveNativeSamples: warFiles.map((file) => {
        const metadata = Object.fromEntries(file.slotListMetadata.map((field) =>
          [field.semanticName, field]));
        return {
          fileName: file.fileName,
          occupationCode: metadata.occupation.rawAscii,
          occupationName: metadata.occupation.displayValue,
          level: metadata.level.value,
          experienceValue: metadata.experienceValue.value,
          side1Slot0Experience: file.state.dynamicUnitStates.side1.records[0].cumulativeExperience,
          saveCount: metadata.saveCount.value,
          difficulty: metadata.difficulty.value,
          difficultyLabel: metadata.difficulty.displayValue,
        };
      }),
      reproductionRule: "preserve the original five visible fields and save-count increment; a strict compatibility mode should retain the occupation/level snapshot quirk",
    },
    dynamicRecord: {
      bytes: RECORD_BYTES,
      recordsPerSide: RECORD_COUNT,
      confirmedFields: {
        "00h": "current life",
        "02h": "cumulative experience",
        "08h..16h": "eight bit15-active / low15-duration status words",
      },
      preservedUnknownWord04: {
        evidenceLevel: "C for behavior / U for original design name",
        nativeBehavior: "not copied by the current-unit loader and absent from every audited current-state-pointer field access",
        initializerBothSides: EXPECTED_WORD04,
        fiveSaveSamples: "all ten side blocks exactly match the native initializer",
        reproductionRule: "preserve and round-trip the raw u16; do not attach gameplay behavior",
      },
      preservedUnknownWord06: {
        evidenceLevel: "C for behavior / U for original design name",
        nativeBehavior: "copied to DS:31A5, but the value itself has no rule consumer; known uses add 08h..16h and therefore address the eight following statuses",
        initializerBothSides: "all zero",
        fiveSaveSamples: "all 600 sampled words are zero",
        reproductionRule: "preserve and round-trip the raw u16; do not attach gameplay behavior",
      },
      consumerAudit: {
        currentUnitLoader: "0000:510C reads +00,+02,+06,+08,+0A,+0C,+0E,+10,+12,+14,+16 and skips +04",
        wholeSideStatusTick: "1000:35F2 iterates only +08 through +16",
        currentStatePointerConsumers: "all direct DS:31B9 consumers access +00, +02, or the named status offsets; none accesses +04 or +06",
      },
    },
    tailState: {
      nativeTimerWaitEnabled: {
        saveRelativeOffset: 309,
        nativeAddress: "DS:111D",
        mirrorAddress: "DS:F592",
        defaultAndFiveSaveSamples: 1,
        behavior: "1000:29A2 mirrors the hidden sixth byte after the five-item game-function panel; 0000:D3B6 skips native tick waiting when the mirror is zero",
      },
      musicSerializedUnusedTailByte: {
        saveRelativeOffset: 315,
        nativeAddress: "DS:1165",
        defaultAndFiveSaveSamples: 0,
        behavior: "included by six-byte parent/save copies but absent from the five-item music panel and from all other runtime reads",
      },
      genericBattleMenuState: {
        saveRelativeOffset: 766,
        nativeAddress: "DS:3DCA",
        defaultAndFiveSaveSamples: { colorAttributeRaw: 32, originX: 400, originY: 180 },
        behavior: "restored before and saved after the generic battle menu; the color attribute drives text/graphics and a normalized rectangle fill, while x/y are the draggable menu origin",
      },
    },
    verifiedCodeSignatures: verifyCodeSignatures(moduleBuffer),
    verifiedDataSignatures: verifyDataSignatures(moduleBuffer),
    unresolved: [
      "the original source-level names of dynamic words +04/+06 cannot be recovered from the shipped binary; their runtime behavior and compatibility policy are closed",
      "DS:1165 may be padding or a removed option; no runtime consumer exists in this module",
    ],
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`verified ${warFiles.length} WAR samples, ${CODE_SIGNATURES.length} code signatures, and the dynamic/tail state semantics`);
}

function usage() {
  return "usage: angel2-save-semantics.mjs 0029-unpacked.bin TST-decoded.json unit-descriptors.json OUTPUT.json";
}

const [modulePath, decodedSavePath, unitDescriptorPath, outputPath] = process.argv.slice(2);
if (outputPath === undefined) {
  throw new Error(usage());
}
extract(modulePath, decodedSavePath, unitDescriptorPath, outputPath).catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
