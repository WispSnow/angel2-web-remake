#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const FILE_NAMES = ["JUST.TST", "WAR0.TST", "WAR1.TST", "WAR2.TST", "WAR3.TST", "WAR4.TST"];
const SLOT_FILE_NAMES = FILE_NAMES.slice(1);
const HEADER_SCAN_BYTES = 0x32;
const SLOT_METADATA_OFFSETS = [0x12, 0x14, 0x16, 0x18, 0x1e];
const SLOT_METADATA_FIELDS = [
  {
    offset: 0x12,
    semanticName: "occupation",
    nativeVisibleLabel: "職業",
    nativeSource: "DS:319D",
    writerBehavior: "snapshot the current working unit descriptor's two-byte ASCII class code",
  },
  {
    offset: 0x14,
    semanticName: "level",
    nativeVisibleLabel: "等級",
    nativeSource: "DS:31BD",
    writerBehavior: "snapshot the current working unit's computed level/growth-row value",
  },
  {
    offset: 0x16,
    semanticName: "experienceValue",
    nativeVisibleLabel: "經驗值",
    nativeSource: "DS:318E after loading side 1 slot 0",
    writerBehavior: "write side-1 slot-0 cumulative experience; the save prelude refreshes this field only",
  },
  {
    offset: 0x18,
    semanticName: "saveCount",
    nativeVisibleLabel: "儲存次數",
    nativeSource: "DS:00BC / GO SAVE_NUM",
    writerBehavior: "increment the campaign-wide save count, store it back, then write the incremented value",
  },
  {
    offset: 0x1e,
    semanticName: "difficulty",
    nativeVisibleLabel: "難度",
    nativeSource: "DS:0000 / GO LV_HARD",
    writerBehavior: "write the difficulty index 0..3",
  },
];
const DIFFICULTY_LABELS = ["過關斬將", "勢均力敵", "困難重重", "無法無天"];
const ENCRYPTED_STREAM_OFFSET = 0x32;
const XOR_KEY_OFFSET = 0x02;
const XOR_KEY_BYTES = 0x10;
const MODULE29_DATA_BASE = 0x1eba0;
const WAR_DYNAMIC_STATE_RECORD_BYTES = 24;
const WAR_DYNAMIC_STATE_RECORDS = 60;
const WAR_DYNAMIC_STATE_BYTES = WAR_DYNAMIC_STATE_RECORD_BYTES * WAR_DYNAMIC_STATE_RECORDS;
const WAR_TAIL_OFFSET = 10944;
const WAR_TAIL_BYTES = 772;

const DYNAMIC_STATUS_FIELDS = [
  ["attackUp", 0x08],
  ["defenseUp", 0x0a],
  ["defenseMagic", 0x0c],
  ["confusion", 0x0e],
  ["attackDown", 0x10],
  ["defenseDown", 0x12],
  ["poison", 0x14],
  ["spellSeal", 0x16],
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(buffer) {
  return buffer.toString("hex").match(/../g)?.join(" ") ?? "";
}

function printableAscii(buffer) {
  return Array.from(buffer, (value) => value >= 0x20 && value <= 0x7e ?
    String.fromCharCode(value) : ".").join("");
}

function hexWord(value) {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

function numericDisplay(value) {
  return value.toString(10).padStart(5, " ");
}

function buildSlotDisplayContext(descriptors) {
  const unitNameByCode = new Map();
  for (const record of descriptors?.records ?? []) {
    const code = record.descriptors?.find((descriptor) => descriptor.set === "set1")?.code;
    if (code === undefined) continue;
    const previous = unitNameByCode.get(code);
    if (previous !== undefined && previous !== record.normalizedName) {
      throw new Error(`side-1 class code ${code} maps to multiple unit names`);
    }
    unitNameByCode.set(code, record.normalizedName);
  }
  return { unitNameByCode };
}

function decodeSave(buffer, fileName = "WAR0.TST") {
  if (buffer.length < ENCRYPTED_STREAM_OFFSET) {
    throw new Error(`${fileName}: expected at least ${ENCRYPTED_STREAM_OFFSET} bytes, got ${buffer.length}`);
  }

  const compressedEnd = buffer.readUInt16LE(0);
  if (compressedEnd < ENCRYPTED_STREAM_OFFSET || compressedEnd > buffer.length) {
    throw new Error(`${fileName}: invalid compressed-stream end ${compressedEnd}`);
  }

  const decodedStream = Buffer.from(buffer.subarray(ENCRYPTED_STREAM_OFFSET, compressedEnd));
  for (let index = 0; index < decodedStream.length; index += 1) {
    decodedStream[index] ^= buffer[XOR_KEY_OFFSET + (index % XOR_KEY_BYTES)];
  }

  const output = [];
  for (let source = 0; source < decodedStream.length;) {
    const marker = decodedStream[source];
    source += 1;
    if ((marker & 0xc0) !== 0xc0) {
      output.push(marker);
      continue;
    }
    if (source >= decodedStream.length) {
      throw new Error(`${fileName}: truncated RLE pair at decoded stream offset ${source - 1}`);
    }
    const count = marker & 0x3f;
    if (count === 0) {
      throw new Error(`${fileName}: zero-length RLE run at decoded stream offset ${source - 1}`);
    }
    const value = decodedStream[source];
    source += 1;
    for (let repeat = 0; repeat < count; repeat += 1) {
      output.push(value);
    }
  }

  return {
    xorKey: Buffer.from(buffer.subarray(XOR_KEY_OFFSET, XOR_KEY_OFFSET + XOR_KEY_BYTES)),
    decodedStream,
    decompressed: Buffer.from(output),
  };
}

function parseSave(buffer, fileName = "WAR0.TST", slotDisplayContext = null) {
  if (buffer.length < HEADER_SCAN_BYTES) {
    throw new Error(`${fileName}: expected at least ${HEADER_SCAN_BYTES} bytes, got ${buffer.length}`);
  }

  const word0 = buffer.readUInt16LE(0);
  const suffix = word0 <= buffer.length ? buffer.subarray(word0) : Buffer.alloc(0);
  return {
    fileName,
    bytes: buffer.length,
    sha256: sha256(buffer),
    firstWord: word0,
    firstWordHex: `0x${word0.toString(16).padStart(4, "0")}`,
    firstWordEqualsFileSizeMinus18: word0 === buffer.length - 18,
    suffixAtFirstWord: {
      offset: word0,
      bytes: suffix.length,
      hex: hex(suffix),
    },
    first50Bytes: {
      bytes: HEADER_SCAN_BYTES,
      hex: hex(buffer.subarray(0, HEADER_SCAN_BYTES)),
    },
    slotListMetadata: SLOT_METADATA_OFFSETS.map((offset, index) => {
      const raw = buffer.subarray(offset, offset + 2);
      const value = buffer.readUInt16LE(offset);
      const rawAscii = printableAscii(raw);
      const field = /^WAR[0-4]\.TST$/.test(fileName) ? SLOT_METADATA_FIELDS[index] : null;
      let displayValue = null;
      if (field?.semanticName === "occupation") {
        displayValue = slotDisplayContext?.unitNameByCode.get(rawAscii) ?? rawAscii;
      } else if (field?.semanticName === "difficulty") {
        displayValue = DIFFICULTY_LABELS[value] ?? DIFFICULTY_LABELS[0];
      } else if (field !== null) {
        displayValue = numericDisplay(value);
      }
      return {
        field: index,
        semanticName: field?.semanticName ?? null,
        nativeVisibleLabel: field?.nativeVisibleLabel ?? null,
        nativeSource: field?.nativeSource ?? null,
        writerBehavior: field?.writerBehavior ?? null,
        offset,
        offsetHex: `0x${offset.toString(16).padStart(2, "0")}`,
        value,
        valueHex: `0x${value.toString(16).padStart(4, "0")}`,
        rawHex: hex(raw),
        rawAscii,
        displayValue,
      };
    }),
  };
}

function readWords(buffer, offset, count) {
  return Array.from({ length: count }, (_, index) => buffer.readUInt16LE(offset + index * 2));
}

function decodeStatusWord(value) {
  return {
    raw: value,
    active: (value & 0x8000) !== 0,
    remaining: value & 0x7fff,
  };
}

function parseDynamicUnitStates(buffer, offset, side) {
  const records = Array.from({ length: WAR_DYNAMIC_STATE_RECORDS }, (_, unitSlot) => {
    const recordOffset = offset + unitSlot * WAR_DYNAMIC_STATE_RECORD_BYTES;
    const statuses = Object.fromEntries(DYNAMIC_STATUS_FIELDS.map(([name, fieldOffset]) => [
      name,
      decodeStatusWord(buffer.readUInt16LE(recordOffset + fieldOffset)),
    ]));
    return {
      unitSlot,
      side,
      saveOffset: recordOffset,
      nativeAddress: `DS:${hexWord((side === 1 ? 0x464a : 0x4c66) + unitSlot * WAR_DYNAMIC_STATE_RECORD_BYTES)}`,
      currentLife: buffer.readUInt16LE(recordOffset),
      cumulativeExperience: buffer.readUInt16LE(recordOffset + 0x02),
      preservedUnknownWord04: buffer.readUInt16LE(recordOffset + 0x04),
      preservedUnknownWord06: buffer.readUInt16LE(recordOffset + 0x06),
      statuses,
    };
  });
  return {
    side,
    saveOffset: offset,
    bytes: WAR_DYNAMIC_STATE_BYTES,
    recordBytes: WAR_DYNAMIC_STATE_RECORD_BYTES,
    recordCount: WAR_DYNAMIC_STATE_RECORDS,
    records,
  };
}

function parseWarTailState(buffer) {
  const tail = buffer.subarray(WAR_TAIL_OFFSET, WAR_TAIL_OFFSET + WAR_TAIL_BYTES);
  const firstEmbeddedSide2ActionState = tail.subarray(541, 616);
  const restoredSide2ActionState = tail.subarray(616, 691);
  return {
    saveOffset: WAR_TAIL_OFFSET,
    bytes: WAR_TAIL_BYTES,
    layout: [
      { relativeOffset: 0, bytes: 150, nativeSource: "DS:3BFD", meaning: "side-1 per-slot AI behavior, 75 u16" },
      { relativeOffset: 150, bytes: 150, nativeSource: "DS:5644", meaning: "side-2 per-slot AI behavior, 75 u16" },
      { relativeOffset: 300, bytes: 4, nativeSource: "DS:10EB", meaning: "four visible sound-effect switches" },
      { relativeOffset: 304, bytes: 6, nativeSource: "DS:1118", meaning: "five visible game-function switches plus the native timer-wait enable byte" },
      { relativeOffset: 310, bytes: 6, nativeSource: "DS:1160", meaning: "five visible music-volume selectors plus one serialized byte with no runtime consumer" },
      { relativeOffset: 316, bytes: 150, nativeSource: "DS:038F", meaning: "75 u16 side-1 primary experience-award counters; the award path increments the acting unit's entry" },
      { relativeOffset: 466, bytes: 150, nativeSource: "DS:3C93, REP MOVSW x75", meaning: "side-1 and the first serialized copy of side-2 per-slot action-state bytes" },
      { relativeOffset: 616, bytes: 150, nativeSource: "DS:3CDE, REP MOVSW x75", meaning: "second side-2 action-state copy followed by 75 overlapping bytes ignored by the loader" },
      { relativeOffset: 766, bytes: 6, nativeSource: "DS:3DCA", meaning: "generic battle-menu color attribute and screen origin x/y" },
    ],
    perSlotBehavior: {
      side1: readWords(tail, 0, 75),
      side2: readWords(tail, 150, 75),
    },
    settings: {
      soundEffects: Array.from(tail.subarray(300, 304)),
      gameFunctions: {
        visible: Array.from(tail.subarray(304, 309)),
        nativeTimerWaitEnabledRaw: tail[309],
      },
      musicVolume: {
        visible: Array.from(tail.subarray(310, 315)),
        serializedUnusedTailByte: tail[315],
      },
    },
    side1PrimaryExperienceAwardCounters: readWords(tail, 316, 75),
    perSlotActionState: {
      side1: Array.from(tail.subarray(466, 541)),
      side2: Array.from(restoredSide2ActionState),
    },
    serializerOverlapArtifact: {
      firstEmbeddedSide2CopyOffset: 541,
      restoredSide2CopyOffset: 616,
      copiesEqual: firstEmbeddedSide2ActionState.equals(restoredSide2ActionState),
      ignoredTrailingOffset: 691,
      ignoredTrailingBytes: 75,
      ignoredTrailingSha256: sha256(tail.subarray(691, 766)),
      loaderRule: "1000:1042 copies 75 bytes to DS:3C93, skips 75, copies 75 bytes to DS:3CDE, then skips 75; only relative ranges 466..540 and 616..690 are restored",
    },
    genericBattleMenuState: {
      colorAttributeRaw: tail.readUInt16LE(766),
      originX: tail.readUInt16LE(768),
      originY: tail.readUInt16LE(770),
      rawWords: readWords(tail, 766, 3),
    },
  };
}

function verifyNativeWarDynamicStateLayout(module29) {
  const specs = [
    { side: 1, pointerTable: 0x45d0, lengthWord: 0x4648, records: 0x464a },
    { side: 2, pointerTable: 0x4bec, lengthWord: 0x4c64, records: 0x4c66 },
  ];
  const sides = specs.map((spec) => {
    const data = (offset, bytes) => module29.subarray(MODULE29_DATA_BASE + offset, MODULE29_DATA_BASE + offset + bytes);
    const length = data(spec.lengthWord, 2).readUInt16LE(0);
    const pointers = Array.from({ length: WAR_DYNAMIC_STATE_RECORDS }, (_, unitSlot) =>
      data(spec.pointerTable + unitSlot * 2, 2).readUInt16LE(0));
    const arithmeticPointersVerified = pointers.every((pointer, unitSlot) =>
      pointer === spec.records + unitSlot * WAR_DYNAMIC_STATE_RECORD_BYTES);
    if (length !== WAR_DYNAMIC_STATE_BYTES || !arithmeticPointersVerified) {
      throw new Error(`module 29 side ${spec.side} dynamic-state pointer layout mismatch`);
    }
    return {
      ...spec,
      length,
      recordBytes: WAR_DYNAMIC_STATE_RECORD_BYTES,
      recordCount: WAR_DYNAMIC_STATE_RECORDS,
      firstPointer: pointers[0],
      lastPointer: pointers.at(-1),
      slot54Pointer: pointers[54],
      arithmeticPointersVerified,
    };
  });
  return {
    module29Sha256: sha256(module29),
    dataSegment: "1EBA",
    sides,
    stage37CrossCheck: "side-2 slot 54 resolves to DS:5176, the independently confirmed stage-37 boss-head state record",
  };
}

function parseUnitInstances(unitIndexMap, sideMap, side1Classes, side2Classes, unitNames = []) {
  const classesBySide = { 1: side1Classes, 2: side2Classes };
  const instances = [];
  for (let cell = 0; cell < sideMap.length; cell += 1) {
    const side = sideMap[cell];
    if (side !== 1 && side !== 2) {
      continue;
    }
    const rawUnitIndex = unitIndexMap[cell];
    const unitSlot = rawUnitIndex & 0x7f;
    const classRecord = classesBySide[side][unitSlot];
    instances.push({
      cell,
      x: cell % 50,
      y: Math.floor(cell / 50),
      side,
      rawUnitIndex,
      unitSlot,
      classRecord,
      className: unitNames[classRecord] ?? null,
      specialRecord35To38: classRecord >= 35 && classRecord <= 38,
    });
  }
  return instances;
}

function parseDecodedState(buffer, fileName, unitNames = [], nativeWarDynamicStateLayout = null) {
  if (/^WAR[0-4]\.TST$/.test(fileName)) {
    if (buffer.length !== 11972) {
      throw new Error(`${fileName}: expected 11972 decoded bytes, got ${buffer.length}`);
    }
    const firstFourWords = readWords(buffer, 0, 4);
    const unitIndexMap = buffer.subarray(8, 2508);
    const sideMap = buffer.subarray(2508, 5008);
    const side2Classes = readWords(buffer, 5008, 75);
    const side1Classes = readWords(buffer, 5158, 75);
    const terrainDescriptorOffsets = readWords(buffer, 10688, 128);
    const dynamicUnitStates = {
      side1: parseDynamicUnitStates(buffer, 7808, 1),
      side2: parseDynamicUnitStates(buffer, 9248, 2),
    };
    const instances = parseUnitInstances(unitIndexMap, sideMap, side1Classes, side2Classes, unitNames)
      .map((instance) => ({
        ...instance,
        dynamicState: instance.unitSlot < WAR_DYNAMIC_STATE_RECORDS ?
          dynamicUnitStates[`side${instance.side}`].records[instance.unitSlot] : null,
      }));
    const tailState = parseWarTailState(buffer);
    const viewportState = {
      viewportOriginX: firstFourWords[0],
      viewportOriginY: firstFourWords[1],
      cursorFocusX: firstFourWords[2],
      cursorFocusY: firstFourWords[3],
      nativeSource: {
        viewportOriginX: "DS:5390",
        viewportOriginY: "DS:5392",
        cursorFocusX: "DS:538C",
        cursorFocusY: "DS:538E",
      },
    };
    return {
      kind: "numbered_battle_save",
      firstFourWords,
      viewportState,
      layout: [
        { offset: 0, bytes: 8, nativeSource: "DS:5390,5392,538C,538E", meaning: "battle viewport top-left x/y followed by battlefield cursor/focus cell x/y" },
        { offset: 8, bytes: 2500, nativeSource: "segment pointer DS:0022", meaning: "50x50 raw unit-index map; low 7 bits select the side's 75-slot unit array" },
        { offset: 2508, bytes: 2500, nativeSource: "segment pointer DS:0024", meaning: "50x50 side/occupancy map; active sides are 1 and 2" },
        { offset: 5008, bytes: 150, nativeSource: "DS:55AE", meaning: "side-2 class record array, 75 u16" },
        { offset: 5158, bytes: 150, nativeSource: "DS:56DA", meaning: "side-1 class record array, 75 u16" },
        { offset: 5308, bytes: 2500, nativeSource: "segment pointer DS:01A7", meaning: "50x50 raw terrain-token map; runtime resolves each token to one of 23 logical terrain-profile slots" },
        { offset: 7808, bytes: 1440, nativeSource: "DS:464A, length DS:4648=05A0h; pointer table DS:45D0", meaning: "side-1 unit dynamic state, 60 records x 24 bytes" },
        { offset: 9248, bytes: 1440, nativeSource: "DS:4C66, length DS:4C64=05A0h; pointer table DS:4BEC", meaning: "side-2 unit dynamic state, 60 records x 24 bytes" },
        { offset: 10688, bytes: 256, nativeSource: "DS:2E7D via module29 1000:8995/0FBB", meaning: "128 u16 terrain descriptor offsets; raw token -> offset -> UN/0056 page 0 -> MAP logical slot" },
        { offset: 10944, bytes: 772, nativeSource: "module29 serializers 89ADh..8A3Ch", meaning: "per-slot AI/action/counter state, settings, serializer-overlap artifact, and generic-menu UI triplet" },
        { offset: 11716, bytes: 256, nativeSource: "writer adds 0100h before RLE", meaning: "unused compression padding" },
      ],
      classArrays: { side1: side1Classes, side2: side2Classes },
      dynamicUnitStates,
      nativeWarDynamicStateLayout,
      tailState,
      terrainDescriptorOffsets,
      activeUnitInstances: instances,
      activeUnitCount: instances.length,
      specialRecord35To38Instances: instances.filter((instance) => instance.specialRecord35To38),
    };
  }

  if (fileName === "JUST.TST") {
    if (buffer.length !== 8358) {
      throw new Error(`${fileName}: expected 8358 decoded bytes, got ${buffer.length}`);
    }
    const unitIndexMap = buffer.subarray(0, 2500);
    const sideMap = buffer.subarray(2500, 5000);
    const side2Classes = readWords(buffer, 5000, 75);
    const side1Classes = readWords(buffer, 5150, 75);
    const side2PerSlotBehavior = readWords(buffer, 5300, 75);
    const stage = buffer.readUInt16LE(5450);
    const terrainDescriptorOffsets = readWords(buffer, 7952, 128);
    const side1PerSlotBehavior = readWords(buffer, 8208, 75);
    const instances = parseUnitInstances(unitIndexMap, sideMap, side1Classes, side2Classes, unitNames)
      .map((instance) => ({
        ...instance,
        perSlotBehavior: instance.side === 1 ?
          side1PerSlotBehavior[instance.unitSlot] : side2PerSlotBehavior[instance.unitSlot],
      }));
    return {
      kind: "next_battle_state_template",
      nativeLoader: "module29 1000:5386",
      nativeWriter: "module27 0000:0FF8",
      stage,
      layoutDifference: "omits the WAR header words and mid-battle variable blocks; module27 regenerates it from the selected B.SWF stage record",
      layout: [
        { offset: 0, bytes: 2500, meaning: "50x50 raw unit-slot map" },
        { offset: 2500, bytes: 2500, meaning: "50x50 side/occupancy map" },
        { offset: 5000, bytes: 150, meaning: "side-2 class records, 75 u16" },
        { offset: 5150, bytes: 150, meaning: "side-1 final class records after campaign import plus scenario overrides, 75 u16" },
        { offset: 5300, bytes: 150, meaning: "side-2 per-slot AI behavior array, 75 u16" },
        { offset: 5450, bytes: 2, meaning: "stage/scenario number" },
        { offset: 5452, bytes: 2500, meaning: "50x50 raw terrain-token map; runtime resolves each token to one of 23 logical terrain-profile slots" },
        { offset: 7952, bytes: 256, meaning: "128 u16 terrain descriptor offsets restored to DS:2E7D; raw token -> offset -> UN/0056 page 0 -> MAP logical slot" },
        { offset: 8208, bytes: 150, meaning: "side-1 per-slot AI behavior array, 75 u16" },
      ],
      classArrays: { side1: side1Classes, side2: side2Classes },
      perSlotBehaviorArrays: { side1: side1PerSlotBehavior, side2: side2PerSlotBehavior },
      terrainDescriptorOffsets,
      activeUnitInstances: instances,
      activeUnitCount: instances.length,
      specialRecord35To38Instances: instances.filter((instance) => instance.specialRecord35To38),
    };
  }

  throw new Error(`${fileName}: unsupported decoded state kind`);
}

async function inspectSaveFiles(inputDirectory, outputFile) {
  const files = [];
  for (const fileName of FILE_NAMES) {
    files.push(parseSave(await readFile(path.join(inputDirectory, fileName)), fileName));
  }

  const output = {
    format: "ANGEL2 TST save-state inspection",
    semantics: {
      confirmedSlotFiles: SLOT_FILE_NAMES,
      initialSlotScanBytes: HEADER_SCAN_BYTES,
      slotListMetadataOffsets: SLOT_METADATA_OFFSETS,
      metadataFieldNames: SLOT_METADATA_FIELDS.map((field) => ({
        offset: field.offset,
        semanticName: field.semanticName,
        nativeVisibleLabel: field.nativeVisibleLabel,
      })),
      justTstRole: "confirmed next-battle template regenerated by module27 from B.SWF and used by the N/no-numbered-slot branch",
      firstWord: "absolute end offset of the compressed stream; the writer emits firstWord plus 18 bytes",
      encoding: "16-byte cyclic XOR followed by C0-high-bit RLE; see TST-decoded.json",
    },
    files,
  };
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`inspected ${files.length} TST files (${SLOT_FILE_NAMES.length} confirmed numbered slots)`);
}

async function decodeSaveFiles(inputDirectory, outputDirectory, outputFile, unitDescriptorFile, module29Path) {
  let unitNames = [];
  let slotDisplayContext = null;
  if (unitDescriptorFile !== undefined) {
    const descriptors = JSON.parse(await readFile(unitDescriptorFile, "utf8"));
    unitNames = descriptors.records.map((record) => record.normalizedName);
    slotDisplayContext = buildSlotDisplayContext(descriptors);
  }
  const nativeWarDynamicStateLayout = module29Path === undefined ? null :
    verifyNativeWarDynamicStateLayout(await readFile(module29Path));
  const files = [];
  await mkdir(outputDirectory, { recursive: true });
  for (const fileName of FILE_NAMES) {
    const input = await readFile(path.join(inputDirectory, fileName));
    const decoded = decodeSave(input, fileName);
    const decodedFileName = `${fileName}.decoded.bin`;
    await writeFile(path.join(outputDirectory, decodedFileName), decoded.decompressed);
    const state = parseDecodedState(decoded.decompressed, fileName, unitNames, nativeWarDynamicStateLayout);
    files.push({
      ...parseSave(input, fileName, slotDisplayContext),
      decoded: {
        fileName: decodedFileName,
        xorKeyHex: hex(decoded.xorKey),
        compressedPayloadBytes: decoded.decodedStream.length,
        decompressedBytes: decoded.decompressed.length,
        sha256: sha256(decoded.decompressed),
        first64BytesHex: hex(decoded.decompressed.subarray(0, 64)),
      },
      state,
    });
  }

  const output = {
    format: "ANGEL2 decoded TST save states",
    algorithm: {
      nativeEvidence: ["module29 1000:560B (XOR inverse)", "module29 1000:563D (RLE inverse)"],
      compressedStream: "file offsets 0x32 through first-u16 minus one",
      xorKey: "16-byte cycle at file offsets 0x02..0x11",
      rle: "bytes below 0xC0 are literals; 0xC0..0xFF encode (low 6 bits) repeats of the following byte",
    },
    files,
  };
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`decoded ${files.length} TST files to ${outputDirectory}`);
}

function usage() {
  return [
    "usage:",
    "  angel2-save.mjs --inspect ANGEL2_DIR OUTPUT.json",
    "  angel2-save.mjs --decode ANGEL2_DIR OUTPUT_DIR OUTPUT.json [UNIT_DESCRIPTORS.json] [MODULE29.bin]",
  ].join("\n");
}

async function main() {
  const [command, inputDirectory, argument3, argument4, argument5, argument6] = process.argv.slice(2);
  if (command === "--inspect" && argument3 !== undefined && argument4 === undefined && argument5 === undefined) {
    await inspectSaveFiles(inputDirectory, argument3);
    return;
  }
  if (command === "--decode" && argument3 !== undefined && argument4 !== undefined) {
    await decodeSaveFiles(inputDirectory, argument3, argument4, argument5, argument6);
    return;
  }
  throw new Error(usage());
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export {
  decodeSave,
  decodeSaveFiles,
  inspectSaveFiles,
  parseDecodedState,
  parseSave,
  parseDynamicUnitStates,
  parseWarTailState,
  verifyNativeWarDynamicStateLayout,
};
