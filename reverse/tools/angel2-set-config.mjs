#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_SET_BYTES = 8;
const EXPECTED_SET_SHA256 = "ef90f2dc69eb0c44a6cef3675b5a5c63efe6c4f13c59a05a047a26b3e416c66d";
const SET_NAME = Buffer.from("SET.TXT\0", "ascii");
const LOADER_ANCHOR = Buffer.from([0x26, 0x8a, 0x05, 0x3c, 0x59, 0x75]);
const LOADER_BYTES = 93;
const TABLE_SHA256 = "ecf0031ccb39737ca033d1ec46aa491de1a7be051823047602fc7dd552b5174e";
const IRQ_TABLE = [2, 3, 5, 7, 10, 11, 0xffff];
const BASE_PORT_TABLE = [
  0x210, 0x220, 0x230, 0x240, 0x250,
  0x260, 0x270, 0x280, 0x290, 0x300, 0xffff,
];

const EXPECTED_MODULES = new Map([
  [21, ["5ba7f2c782e84c0b66fca820e138276f9e67928064ee421d5c892cf1f7859012", "20c3198052957ca407b3ad740f8cbe44f2dd3aaa1a9e02d65053fab60c1c32c1"]],
  [23, ["2bff8f34ac133390ecafcd740c703b853dcee7ce8df62c4100e6f1a90248838a", "a560b1ce235b4888bc3c483aebdf6d2ca9c5637cc071ca04348367d490f0a935"]],
  [25, ["effd54fb08397bb84f3593d35d025a56479d91d39cd5d44086eb803058c5172a", "a33918ef1683abdce9f30d4d33ec5ee1494ca4cad55c0fb85b6aab7decd1f75d"]],
  [27, ["498d0d9c4609317bf3177ed07985053d0b23bc5b5cbae22f553c079b8a868e60", "b78a86f5e7669f8bedb1fde710953110490b4f9c31f6f89e46dc4450b8b59a5d"]],
  [29, ["6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4", "5612864b94c30db4e3712e8754ce50d1c1db94f4067f857d6e7b5320359632bd"]],
  [33, ["9900a5168d2f0a94f9221a7405576b29ef012dcaea1ae9d6d477640a80b18cf1", "e57547461bbbd389e867667c8166218b39e1352278a680fa827cd0dbbd07f1c2"]],
  [35, ["abbefb2512d88e212cd7132bc9a280a4c8f2e71fb922e44fef2b09c26bb642ed", "80e3b5c94620a47f48f5d2ff648302aaaac627c90e972e111a130964f239d791"]],
  [37, ["1d68b8f21600e2d5c5ad20267ad8050fa030eb5dd2fd2663ef6c04047508400f", null]],
  [44, ["7bd8c8c0681a69a635b610e38b96374d535ce69c768d5985fe4a8d0c5dcd5344", "33e08acef1dd319e808a6302701d5a587e8139577bc648f0ee4a5c9339466038"]],
  [46, ["db1c3d3b4fdc39768c820bb92b19c8fc28e70f011140286e964b7915626a066d", "f8057594b6f61b0a7862a101aede4ced5e8da082f2a6cb52cd14e584d1e7ff24"]],
]);

const MODULE23_DRIVER_SIGNATURES = [
  [0x0000, 78, "startup-orders-independent-rix-and-sound-blaster-initialization", "4b7d6cbb3e6d74dab9890f50a330587d5e22d9a9f30ff506d0c9fd5697e9b95e"],
  [0x91f2, 80, "sound-blaster-open-and-probe-wrapper", "f9e593266d917700e656e5ad5e846cb85a46de3f066cb11b5d715390535efde9"],
  [0x937b, 41, "dsp-reset-port-plus-6-and-aa-ready-byte", "aecdfe305f32350c43dd8021acf79011a57a2ef0222888424c617caa2a4e62b4"],
  [0x93a4, 40, "dsp-e0-complement-command-probe", "c258c718f47ba6a4fe9a5f6db70d3f20da8cdf8a2356604abe8edeadd44a346f"],
  [0x94bf, 30, "dsp-read-status-plus-e-and-data-plus-a", "0c31aab836321c7c10cc286355020c3f89d07ceab9ca1013db3660b2a2f32d8e"],
  [0x954e, 66, "install-irq-plus-8-vector-and-unmask-master-pic", "4c0233a57b548b470cc59cbd4e8f1422fe0a2f31be8328ffbc025ac5139df820"],
  [0x9590, 49, "restore-irq-plus-8-vector-and-mask-master-pic", "7d1014524d1f5e796961bbecf72e995db5b6a154157a321c141e248803ae0a97"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function uniqueIndex(buffer, needle, label) {
  const first = buffer.indexOf(needle);
  assert(first >= 0, `${label}: signature not found`);
  assert(buffer.indexOf(needle, first + 1) < 0, `${label}: signature is not unique`);
  return first;
}

function readWords(buffer, start, count, label) {
  assert(start >= 0 && start + count * 2 <= buffer.length, `${label}: table outside module`);
  return Array.from({ length: count }, (_, index) => buffer.readUInt16LE(start + index * 2));
}

function parseNativeLoader(buffer, record, expectedLoaderSha256) {
  const setNameFileOffset = uniqueIndex(buffer, SET_NAME, `module ${record} SET.TXT`);
  const anchor = uniqueIndex(buffer, LOADER_ANCHOR, `module ${record} SET loader`);
  const loaderFileOffset = anchor - 20;
  assert(loaderFileOffset >= 0, `module ${record}: invalid loader start`);
  const loader = buffer.subarray(loaderFileOffset, loaderFileOffset + LOADER_BYTES);
  assert(loader.length === LOADER_BYTES, `module ${record}: truncated loader`);
  assert(sha256(loader) === expectedLoaderSha256, `module ${record}: SET loader signature mismatch`);

  const filenameDsOffset = loader.readUInt16LE(1);
  const dataLinearBase = setNameFileOffset - filenameDsOffset;
  const irqTableDsOffset = loader.readUInt16LE(62);
  const basePortTableDsOffset = loader.readUInt16LE(78);
  const irqTableFileOffset = dataLinearBase + irqTableDsOffset;
  const basePortTableFileOffset = dataLinearBase + basePortTableDsOffset;
  const irqTable = readWords(buffer, irqTableFileOffset, IRQ_TABLE.length, `module ${record} IRQ`);
  const basePortTable = readWords(buffer, basePortTableFileOffset, BASE_PORT_TABLE.length, `module ${record} port`);
  assert(JSON.stringify(irqTable) === JSON.stringify(IRQ_TABLE), `module ${record}: IRQ table changed`);
  assert(JSON.stringify(basePortTable) === JSON.stringify(BASE_PORT_TABLE), `module ${record}: port table changed`);
  const tables = buffer.subarray(irqTableFileOffset, basePortTableFileOffset + BASE_PORT_TABLE.length * 2);
  assert(sha256(tables) === TABLE_SHA256, `module ${record}: lookup-table signature mismatch`);

  return {
    record,
    loaderAddress: `0000:${loaderFileOffset.toString(16).toUpperCase().padStart(4, "0")}`,
    loaderFileOffset,
    loaderBytes: LOADER_BYTES,
    loaderSha256: expectedLoaderSha256,
    dataLinearBase,
    filename: { dsOffset: filenameDsOffset, fileOffset: setNameFileOffset },
    fields: {
      portIndexDsOffset: loader.readUInt16LE(41),
      irqIndexDsOffset: loader.readUInt16LE(52),
      soundBlasterEnabledDsOffset: loader.readUInt16LE(29),
      selectedIrqWordDsOffset: loader.readUInt16LE(65),
      driverIrqByteDsOffset: loader.readUInt16LE(68),
      selectedBasePortWordDsOffset: loader.readUInt16LE(81),
      driverBasePortWordDsOffset: loader.readUInt16LE(84),
    },
    tables: {
      sha256: TABLE_SHA256,
      irq: { dsOffset: irqTableDsOffset, fileOffset: irqTableFileOffset, values: irqTable },
      basePort: { dsOffset: basePortTableDsOffset, fileOffset: basePortTableFileOffset, values: basePortTable },
    },
  };
}

function parseSet(buffer) {
  assert(buffer.length === EXPECTED_SET_BYTES, `SET.TXT: expected ${EXPECTED_SET_BYTES} bytes, got ${buffer.length}`);
  assert(sha256(buffer) === EXPECTED_SET_SHA256, "SET.TXT source hash changed");
  const enabled = buffer[0] === 0x59;
  const basePortIndex = (buffer[1] - 0x30) & 0xff;
  const irqIndex = (buffer[2] - 0x30) & 0xff;
  assert(enabled, "shipped SET.TXT no longer enables the digital-audio driver");
  assert(basePortIndex >= 0 && basePortIndex < 10, "shipped base-port index is invalid");
  assert(irqIndex >= 0 && irqIndex < 6, "shipped IRQ index is invalid");
  return {
    bytes: buffer.length,
    sha256: sha256(buffer),
    rawHex: buffer.toString("hex"),
    nativeBytesConsumed: 3,
    headerAscii: buffer.subarray(0, 3).toString("ascii"),
    enabled,
    enableMarker: String.fromCharCode(buffer[0]),
    basePortIndex,
    basePortIndexAscii: String.fromCharCode(buffer[1]),
    basePort: BASE_PORT_TABLE[basePortIndex],
    basePortHex: hex(BASE_PORT_TABLE[basePortIndex], 3),
    irqIndex,
    irqIndexAscii: String.fromCharCode(buffer[2]),
    irq: IRQ_TABLE[irqIndex],
    ignoredTrailingBytes: Array.from(buffer.subarray(3)),
    ignoredTrailingHex: buffer.subarray(3).toString("hex"),
  };
}

function nativeDecodeExample(bytes) {
  assert(bytes.length >= 3, "native decode example requires at least three bytes");
  if (bytes[0] !== 0x59) {
    return { inputHex: bytes.toString("hex"), enabled: false, tableReads: false };
  }
  const basePortIndex = (bytes[1] - 0x30) & 0xff;
  const irqIndex = (bytes[2] - 0x30) & 0xff;
  return {
    inputHex: bytes.toString("hex"),
    enabled: true,
    basePortIndex,
    irqIndex,
    basePort: BASE_PORT_TABLE[basePortIndex] ?? "out-of-table memory read",
    irq: IRQ_TABLE[irqIndex] ?? "out-of-table memory read",
  };
}

function verifyDriverSignatures(module23) {
  return MODULE23_DRIVER_SIGNATURES.map(([fileOffset, bytes, role, expectedSha256]) => {
    const payload = module23.subarray(fileOffset, fileOffset + bytes);
    assert(payload.length === bytes, `${role}: signature outside module 23`);
    assert(sha256(payload) === expectedSha256, `${role}: signature mismatch`);
    return {
      address: `0000:${fileOffset.toString(16).toUpperCase().padStart(4, "0")}`,
      fileOffset,
      bytes,
      role,
      sha256: expectedSha256,
    };
  });
}

async function extract(setPath, moduleRoot, outputPath) {
  const [setBuffer, manifestText] = await Promise.all([
    readFile(setPath),
    readFile(path.join(moduleRoot, "manifest.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert(manifest.moduleCount === 10 && manifest.entries.length === 10, "runtime module manifest changed");
  const set = parseSet(setBuffer);
  const loaders = [];
  let module23 = null;

  for (const entry of manifest.entries) {
    const record = entry.headerRecord;
    const expected = EXPECTED_MODULES.get(record);
    assert(expected !== undefined, `unexpected runtime module ${record}`);
    const buffer = await readFile(path.join(moduleRoot, entry.image));
    assert(sha256(buffer) === expected[0] && entry.imageSha256 === expected[0], `module ${record}: image hash changed`);
    if (record === 23) module23 = buffer;
    if (expected[1] === null) {
      assert(buffer.indexOf(SET_NAME) < 0 && buffer.indexOf(LOADER_ANCHOR) < 0,
        `module ${record}: expected no SET loader`);
      continue;
    }
    loaders.push(parseNativeLoader(buffer, record, expected[1]));
  }
  assert(loaders.length === 9 && module23 !== null, "expected nine SET consumers and module 23 driver evidence");

  const output = {
    format: "Angel Empire II SET.TXT Sound Blaster digital-audio configuration",
    semanticVersion: 1,
    implementationFrozen: true,
    sources: {
      setTxt: { path: setPath, bytes: setBuffer.length, sha256: sha256(setBuffer) },
      runtimeModules: { path: moduleRoot, count: manifest.moduleCount },
    },
    shippedConfiguration: set,
    nativeFormat: {
      enableRule: "byte 0 equal to ASCII Y enables the Sound Blaster digital-sample path; any other value writes N and returns before reading indices",
      basePortRule: "zero-extend byte 1, subtract ASCII 0 in AL, and use the result as a word index into the base-I/O-port table",
      irqRule: "zero-extend byte 2, subtract ASCII 0 in AL, and use the result as a word index into the IRQ table",
      bytesAfterOffset2: "ignored by every recovered native SET loader",
      rangeValidation: "none",
      basePortTable: BASE_PORT_TABLE.map((value, index) => ({ index, value, hex: hex(value, 4), sentinel: value === 0xffff })),
      irqTable: IRQ_TABLE.map((value, index) => ({ index, value, sentinel: value === 0xffff })),
      malformedExamples: [
        nativeDecodeExample(Buffer.from("Nxx", "ascii")),
        nativeDecodeExample(Buffer.from("Y00", "ascii")),
        nativeDecodeExample(Buffer.from("Y95", "ascii")),
        nativeDecodeExample(Buffer.from("Y16", "ascii")),
      ],
    },
    runtimeCoverage: {
      modulesWithIdenticalDecoderAndTables: loaders.map((loader) => loader.record),
      moduleWithoutSetConsumer: 37,
      moduleWithoutSetConsumerRole: "no SET.TXT string or decoder anchor; no hardware role is inferred from this absence alone",
      loaders,
    },
    hardwareConfirmation: {
      device: "Creative Sound Blaster-compatible DSP digital sample driver",
      evidence: [
        "base+6 reset pulse followed by polling for DSP ready byte AAh",
        "base+C DSP write/status port",
        "base+E read-status and base+A read-data ports",
        "DSP E0h complement command probe with AAh input and 55h expected response",
        "interrupt vector is derived as IRQ+8 and the corresponding master-PIC mask bit is cleared/restored through port 21h",
      ],
      verifiedNativeSignatures: verifyDriverSignatures(module23),
      shippedSelection: { basePort: set.basePort, basePortHex: set.basePortHex, irq: set.irq, interruptVector: set.irq + 8, interruptVectorHex: hex(set.irq + 8) },
      legacyBoundary: "the recovered IRQ table exposes 10 and 11, but this driver code still derives vector IRQ+8 and only changes the master PIC; preserve as legacy metadata, not as a Web hardware behavior",
    },
    audioSettingsBoundary: {
      setTxtControls: "the low-level Sound Blaster digital-sample/VOC driver availability and hardware parameters",
      doesNotControl: [
        "RIX/OPL music initialization, track selection, or battle music volume",
        "the four saved battle request-category switches: speech, movement, combat, and key sounds",
      ],
      effectiveVocRule: "a VOC request can produce sound only when SET enables and successfully initializes the digital driver; category-aware requests must additionally pass their saved battle switch",
      nativeExceptions: "some direct playback paths bypass a category switch but still terminate at the SET-gated Sound Blaster driver",
    },
    webImportPolicy: {
      minimumBytes: 3,
      disabledMarkerPolicy: "accept as digital audio disabled without reading bytes 1 or 2",
      enabledMarkerPolicy: "require ASCII decimal base-port index 0..9 and IRQ index 0..5; reject sentinel/out-of-table selections",
      trailingBytesPolicy: "ignore for semantics and preserve as legacy source metadata",
      runtimePolicy: "do not emulate DOS I/O ports, DMA, PIC, or IVT mutation; retain the decoded values as provenance and use WebAudio for extracted VOC assets",
    },
    assertions: {
      currentHeaderIsY13: set.headerAscii === "Y13",
      currentSelectionIsPort220Irq7: set.basePort === 0x220 && set.irq === 7,
      allNineLoadersAgree: loaders.every((loader) => loader.tables.sha256 === TABLE_SHA256),
      onlyFirstThreeBytesHaveSemantics: set.nativeBytesConsumed === 3,
      soundBlasterIdentityConfirmedFromIoAndDspCommands: true,
      rixMusicIsIndependent: true,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${outputPath}: ${loaders.length} native SET loaders, port ${set.basePortHex}, IRQ ${set.irq}`);
}

function usage() {
  console.error("Usage: angel2-set-config.mjs --extract SET.TXT reverse/unpacked/lzexe-modules output.json");
  process.exit(1);
}

const [mode, setPath, moduleRoot, outputPath] = process.argv.slice(2);
if (mode !== "--extract" || !setPath || !moduleRoot || !outputPath) usage();
await extract(setPath, moduleRoot, outputPath);
