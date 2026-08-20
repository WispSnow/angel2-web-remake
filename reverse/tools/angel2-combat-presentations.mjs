#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_LINEAR_BASE = 0x1eba0;
const RECORD_COUNT = 39;
// 记录 36「龍」/37「頭」/38「手」只在 side 2 出现（场景 20/22 与 37），
// 所以原版只填了 side 2 表现块，side 1 块整体指向零占位。
const SIDE1_ONLY_UNAVAILABLE_RECORDS = [36, 37, 38];

const CODE_SIGNATURES = [
  ["0000:0220", "play-loaded-voc-far-entry", "e83100cbe80100cbf606ed10017403e82200c3f606ee10017403e81700c3f606"],
  ["0000:0254", "play-loaded-voc-near-worker", "a30b00803e0a0059741ec70693f501008cc88bd8b97d02e8e7d1a10b009a1307471ec70693f50000c3"],
  ["0000:9135", "map-counter-presentation", "a1c177a33252b80200a3df77a1bf778b0ed577c706181f01009a0800b516e80b00e869058b3ebf77e80201c38b1ebf77"],
  ["0000:91C5", "map-primary-presentation", "a1bf77a33252b80500a3df77a1c1778b0ed377c706181f01009a0800b516e80b00e8d9048b3ec177e87200c38b1ec177"],
  ["0000:926B", "attack-presentation-dispatch", "f6061911017404e82100c3e80100c3e848ff3c007414e8410083fa597409e82700e8a6fee84a00e88600c3a1d3778b1e"],
  ["0000:927A", "map-attack-sequence", "e848ff3c007414e8410083fa597409e82700e8a6fee84a00e88600c3a1d3778b1ed577e8b205e82200e87500e81904e8"],
  ["0000:9296", "full-screen-attack-sequence", "a1d3778b1ed577e8b205e82200e87500e81904e8b5fee842ffe82a00c3803eb4774e740a8b1ec177b81e00e8ba36c3"],
  ["0000:9852", "prepare-full-screen-battle", "a3a87f891eaa7fc706317d3a4ae865002ec70621b700009aac009d13e8b6e3e896afe85c00c6067cfa4ec6067dfa4ea1"],
  ["0000:9FC4", "copy-side1-unit-presentation-block", "a19231a35a7aa19031a35c7aa18e31a3607aa1bd31a3627aa1bf31a3687aa1c131a36a7aa1bb31a35e7aa19f31a3647a"],
  ["0000:A01B", "copy-side2-unit-presentation-block", "a19231a3e07aa19031a3e27aa18e31a3e67aa1bd31a3e87aa1bf31a3ee7aa1c131a3f07aa1bb31a3e47aa19f31a3ea7a"],
  ["0000:9E28", "redraw-full-screen-life-gauges", "e86100be767ee81f32be057de81932833e1d7d007406be197de80c32be8a7ee80632e8a000be807ee8fd31be0f7de8f731833e277d007413b8d2002b06277d054601a3237dbe237de8dd31be947ee8d731a182f8a3fc7e350008a3fa7ebeee7ee86336c3"],
  ["0000:9E8C", "select-left-life-gauge-tier", "a1647a3dd20072103da401721b3d760272293d48037237c3a31d7dc706217d0b00c7060d7d0000c32dd200a31d7dc706217d0900c7060d7d0b00c32da401a31d7dc706217d0d00c7060d7d0900c32d7602a31d7dc706217d0600c7060d7d0600c3"],
  ["0000:9EED", "select-right-life-gauge-tier", "a1ea7a3dd20072103da401721b3d760272293d48037237c3a3277dc7062b7d0b00c706177d0000c32dd200a3277dc7062b7d0900c706177d0b00c32da401a3277dc7062b7d0d00c706177d0900c32d7602a3277dc7062b7d0600c706177d0d00c3"],
  ["0000:A17B", "full-screen-primary-counter-sequence", "e86601e8420dc7062d7d96a0c7062f7d1fa7e85800e8f014e82715833e647a007437833eea7a007430e82e00813ebb77"],
  ["0000:A1E8", "run-one-full-screen-strike", "c606327c4ee88f05a12f7dffd0c606327c59a12d7dffd08b0ed77cbe3d7ce84d4de8c300e819fcc7063cf90b00a11a7c"],
  ["0000:A23E", "select-full-screen-hit-reaction", "833ed77c0a7704e84600c3e80100c3"],
  ["0000:A2E4", "prepare-full-screen-primary", "8b3ebf77e81f013c0174053c027448c3bafa00bb8700e8640dba8a02bb8700e8f70ee89401e81914a180f8be41029a0a"],
  ["0000:A377", "prepare-full-screen-counter", "8b3ebf77e88c003c0274053c017448c3bafa00bb8700e8d10cba8a02bb8700e8640ee87700e88613a180f8be41029a0a"],
  ["0000:A77F", "execute-full-screen-command-stream", "8b1e187c8b073dffff7419a3167c8306187c02e85f00e86202e85f04e8c104e82305ebdcc3"],
  ["0000:A7A4", "execute-full-screen-death-stream", "8b1e187c8b073dffff7413a3167c8306187c02e83a00e83d02e80405ebe2c3"],
  ["0000:B3BD", "draw-shared-full-screen-trail", "803e487f597416803e487f55742c803e"],
  ["0000:B683", "full-screen-left-death", "833e647a007401c3a105028ec0bf0000b90b00bb0300e8f646e841f1e844f3c706187c4c7dc706847a5a7dc7060a7bae"],
  ["0000:B6BD", "full-screen-right-death", "833eea7a007401c3a105028ec0bf0000b90b00bb0300e8bc46e807f1e80af3c706187c4c7dc7060a7b847dc706847aae"],
  ["0000:B725", "load-class-plus50-left-graphic", "8b1e637c83c332e81900c38b1e9d7c83c332a180f88ec0bf00008bcbbb0600e84b46c3"],
  ["0000:B730", "load-class-plus50-right-graphic", "8b1e9d7c83c332a180f88ec0bf00008bcbbb0600e84b46c3"],
  ["0000:B748", "load-left-class-graphic-with-remap", "83fb01741683fb337425a180f88ec0bf00008bcbbb0500e83046c3bb2900a180f88ec0bf00008bcbbb0600e81c46c3bb"],
  ["1000:6ABC", "map-death-presentation", "c7067afa59009af2620000a180f88ec0bf0000b90c00bb04009a8efd0000a180f8be05029a0a003719c7062a520a00c7"],
  ["1000:6B58", "map-hit-and-damage-presentation", "9a8e620000a180f88ec0bf0000b93e00bb0d009a8efd0000a180f8be05029a0a003719a180f88ec0bf0000b92600bb03"],
  ["0000:D3B6", "wait-native-timer-ticks", "1eb8ba1e8ed8803e92f5007406390eb3f572fac706b3f500001fc3803ec6f6017401c3803eb9f6017401c3803e95f500"],
];

const DATA_SIGNATURES = [
  [0x6a26, 0x6b58, "map-death-descriptor-tables", "2ddef137ee74a164ef111ba7cc8580572f0b3420c0e41b54b4577420a4717d6b"],
  [0x6b60, 0x6b6b, "map-hit-dynamic-descriptor", "5044744ffe52befc6a86cd38edd308873bed8b4cd078ea0face099d978bf6a9b"],
  [0x7d05, 0x7d2d, "full-screen-life-gauge-dynamic-rectangles", "fe873daba2dd75c10880b7fc653e272e3b43a0aae88c42c103cff2fec8a779e8"],
  [0x7d42, 0x7dda, "full-screen-death-command-data", "ce0f0aaefb86d66707411b84d93e624f2a5931deffc3f22a680068b9fe5c3b53"],
  [0x7e76, 0x7e9e, "full-screen-life-gauge-frame-rectangles", "0ade0e865415fb236997da7df8430ce005f03c0528228518320ad89e44f0fa0c"],
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

function parseAddress(address) {
  const match = /^(?<segment>[0-9A-F]{4}):(?<offset>[0-9A-F]{4})$/i.exec(address);
  assert(match !== null, `invalid segmented address ${address}`);
  const segment = Number.parseInt(match.groups.segment, 16);
  const offset = Number.parseInt(match.groups.offset, 16);
  return { segment, offset, linear: segment * 16 + offset };
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

function readWords(buffer, dsOffset, count) {
  return Array.from({ length: count }, (_, index) =>
    readWord(buffer, dsOffset + index * 2));
}

function readTerminatedWords(buffer, dsOffset, terminator = 0xffff, maxWords = 256) {
  const values = [];
  for (let index = 0; index < maxWords; index++) {
    const value = readWord(buffer, dsOffset + index * 2);
    if (value === terminator) {
      return { address: `DS:${hex(dsOffset)}`, values, terminator };
    }
    values.push(value);
  }
  throw new Error(`DS:${hex(dsOffset)}: missing ${hex(terminator)} terminator`);
}

function verifiedWord(buffer, dsOffset, expected, label) {
  const actual = readWord(buffer, dsOffset);
  assert(actual === expected,
    `DS:${hex(dsOffset)}: ${label} expected ${hex(expected)}, got ${hex(actual)}`);
  return { address: `DS:${hex(dsOffset)}`, value: actual };
}

function validateCodeSignatures(buffer) {
  return CODE_SIGNATURES.map(([address, role, expectedHex]) => {
    const { linear } = parseAddress(address);
    const expected = Buffer.from(expectedHex, "hex");
    const actual = checkedSlice(buffer, linear, linear + expected.length, address);
    assert(actual.equals(expected), `${address}: ${role} signature mismatch`);
    return {
      address,
      role,
      bytes: expected.length,
      sha256: sha256(expected),
    };
  });
}

function validateDataSignatures(buffer) {
  return DATA_SIGNATURES.map(([start, end, role, expectedSha256]) => {
    const bytes = checkedSlice(buffer, dsLinear(start), dsLinear(end), role);
    assert(sha256(bytes) === expectedSha256, `DS:${hex(start)}: ${role} signature mismatch`);
    return {
      address: `DS:${hex(start)}`,
      endExclusive: `DS:${hex(end)}`,
      role,
      bytes: bytes.length,
      sha256: expectedSha256,
    };
  });
}

function decodeMapDescriptor(buffer, dsOffset) {
  const xOffset = readSignedWord(buffer, dsOffset);
  const yOffset = readSignedWord(buffer, dsOffset + 2);
  const width = readWord(buffer, dsOffset + 4);
  const height = readWord(buffer, dsOffset + 6);
  assert(width > 0 && height > 0 && width * height <= 64,
    `DS:${hex(dsOffset)}: invalid ${width}x${height} descriptor`);
  const tileCodes = readWords(buffer, dsOffset + 8, width * height);
  return {
    address: `DS:${hex(dsOffset)}`,
    xOffset,
    yOffset,
    width,
    height,
    tileCodes,
    renderedFrames: tileCodes.map((value) => value === 0 ? null : value - 1),
  };
}

function decodeDrawRectangle(buffer, dsOffset) {
  const [x, y, width, height, colorIndex] = readWords(buffer, dsOffset, 5);
  return { address: `DS:${hex(dsOffset)}`, x, y, width, height, colorIndex };
}

function parseSimpleDeathScript(buffer, dsOffset, poseCount) {
  const commandNames = new Map([
    [0x5631, "V1"],
    [0x4c3a, ":L"],
    [0x523a, ":R"],
    [0x4555, "UE"],
  ]);
  const commands = [];
  let cursor = dsOffset;
  while (commandNames.has(readWord(buffer, cursor))) {
    const opcode = readWord(buffer, cursor);
    commands.push({ opcode, token: commandNames.get(opcode) });
    cursor += 2;
  }
  const poses = Array.from({ length: poseCount }, () => {
    const values = [
      readSignedWord(buffer, cursor),
      readSignedWord(buffer, cursor + 2),
      readSignedWord(buffer, cursor + 4),
    ];
    cursor += 6;
    return { frame: values[0], deltaX: values[1], deltaY: values[2] };
  });
  return {
    address: `DS:${hex(dsOffset)}`,
    commands,
    poses,
    bytesConsumed: cursor - dsOffset,
  };
}

const FULL_SCREEN_COMMANDS = new Map([
  [0x533a, { token: ":S", argumentKinds: ["signed", "signed"] }],
  [0x523a, { token: ":R", argumentKinds: [] }],
  [0x4c3a, { token: ":L", argumentKinds: [] }],
  [0x4a3a, { token: ":J", argumentKinds: [] }],
  [0x583a, { token: ":X", argumentKinds: [] }],
  [0x5834, { token: "X4", argumentKinds: [] }],
  [0x5836, { token: "X6", argumentKinds: [] }],
  [0x4e58, { token: "XN", argumentKinds: [] }],
  [0x5944, { token: "YD", argumentKinds: [] }],
  [0x4e44, { token: "ND", argumentKinds: [] }],
  [0x4731, { token: "G1", argumentKinds: ["pointer"] }],
  [0x4732, { token: "G2", argumentKinds: ["pointer"] }],
  [0x4733, { token: "G3", argumentKinds: ["pointer"] }],
  [0x4734, { token: "G4", argumentKinds: ["pointer"] }],
  [0x4735, { token: "G5", argumentKinds: ["pointer"] }],
  [0x5631, { token: "V1", argumentKinds: [] }],
  [0x5632, { token: "V2", argumentKinds: [] }],
  [0x5633, { token: "V3", argumentKinds: [] }],
  [0x5634, { token: "V4", argumentKinds: [] }],
  [0x5635, { token: "V5", argumentKinds: [] }],
  [0x4559, { token: "EY", argumentKinds: [] }],
  [0x454e, { token: "NE", argumentKinds: [] }],
  [0x4555, { token: "UE", argumentKinds: [] }],
]);

function parseFullScreenCommandStream(buffer, dsOffset, stepCounts, followLinkedStreams = true) {
  let cursor = dsOffset;
  const steps = stepCounts.map((rendererSubsteps, index) => {
    const commands = [];
    while (FULL_SCREEN_COMMANDS.has(readWord(buffer, cursor))) {
      const opcode = readWord(buffer, cursor);
      const definition = FULL_SCREEN_COMMANDS.get(opcode);
      cursor += 2;
      const parameters = definition.argumentKinds.map((kind) => {
        const value = kind === "pointer"
          ? `DS:${hex(readWord(buffer, cursor))}`
          : readSignedWord(buffer, cursor);
        cursor += 2;
        return value;
      });
      commands.push({ opcode, token: definition.token, parameters });
    }
    const pose = {
      frame: readSignedWord(buffer, cursor),
      deltaX: readSignedWord(buffer, cursor + 2),
      deltaY: readSignedWord(buffer, cursor + 4),
    };
    cursor += 6;
    return { index, rendererSubsteps, commands, pose };
  });
  if (followLinkedStreams) {
    for (const step of steps) {
      for (const command of step.commands) {
        const pointer = command.token.startsWith("G")
          ? command.parameters.find((parameter) => typeof parameter === "string")
          : undefined;
        if (pointer) {
          command.linkedStream = parseFullScreenCommandStream(
            buffer,
            Number.parseInt(pointer.slice(3), 16),
            stepCounts.slice(step.index),
            false,
          );
        }
      }
    }
  }
  return {
    address: `DS:${hex(dsOffset)}`,
    bytesConsumed: cursor - dsOffset,
    steps,
  };
}

/**
 * A `G1`..`G5` weapon channel is a persistent sprite slot, not a one-shot
 * effect: its records sit immediately after the strike block, and the post-hit
 * command stream only re-points the channel when it issues the same token
 * again. Classes whose post-hit streams never re-issue the token keep reading
 * from where the strike block ended, consuming the post-hit step counts.
 *
 * Record 22 is the stage-0 case: its thrown lance has no post-hit `G1`, so the
 * four records after `DS:AFFD`/`DS:DB57` keep running and carry the lance back
 * to the up-canted frame 6 at `(+-30,-16)` per substep — the capture's
 * upward deflection out of the battle window after contact.
 */
function attachWeaponChannelContinuations(buffer, commandStreams, postHitStepCounts) {
  const isMain = (key) => key.startsWith("main");
  const reissuedTokens = new Set(
    Object.entries(commandStreams)
      .filter(([key]) => !isMain(key))
      .flatMap(([, stream]) => stream.steps)
      .flatMap((step) => step.commands)
      .filter((command) => command.linkedStream !== undefined)
      .map((command) => command.token),
  );
  for (const [key, stream] of Object.entries(commandStreams)) {
    if (!isMain(key)) continue;
    for (const step of stream.steps) {
      for (const command of step.commands) {
        if (command.linkedStream === undefined) continue;
        if (reissuedTokens.has(command.token)) continue;
        const linkedOffset = parseAddress(`0000:${command.linkedStream.address.slice(3)}`).offset;
        command.linkedStream.postHitContinuation = parseFullScreenCommandStream(
          buffer,
          linkedOffset + command.linkedStream.bytesConsumed,
          postHitStepCounts,
          false,
        );
      }
    }
  }
  return commandStreams;
}

function sideDescriptor(record, role) {
  const result = record.descriptors.find((entry) => entry.role === role)
    ?? record.descriptors.find((entry) => entry.set === (role === "side1" ? "set1" : "set2"));
  assert(result !== undefined, `record ${record.record}: missing ${role} descriptor`);
  return result;
}

function presentationBlock(buffer, descriptor, includeCommandStreams) {
  const words = readWords(buffer, descriptor.unknownPointer10, 12);
  const hasFullScreenPresentation = words[4] !== 0
    && words[5] !== 0
    && readWord(buffer, words[4]) > 0
    && readWord(buffer, words[5]) > 0;
  if (!hasFullScreenPresentation) {
    return {
      descriptorSet: descriptor.set,
      classCode: descriptor.code,
      blockAddress: `DS:${hex(descriptor.unknownPointer10)}`,
      leftGraphicFrameRecord: words[0],
      available: false,
      unavailableReason: "native descriptor contains no full-screen presentation pointers",
    };
  }
  const soundTablePointer = words[3];
  const strikeStepCounts = readTerminatedWords(buffer, words[4]);
  const postHitStepCounts = readTerminatedWords(buffer, words[5]);
  const commandPointers = {
    mainLeftOrAttacker: words[6],
    mainRightOrDefender: words[7],
    auxiliaryA: words[8],
    auxiliaryB: words[9],
    auxiliaryC: words[10],
    auxiliaryD: words[11],
  };
  return {
    descriptorSet: descriptor.set,
    classCode: descriptor.code,
    blockAddress: `DS:${hex(descriptor.unknownPointer10)}`,
    available: true,
    leftGraphicFrameRecord: words[0],
    anchorOrOffsetTablePointers: words.slice(1, 3).map((value) => `DS:${hex(value)}`),
    soundTableAddress: `DS:${hex(soundTablePointer)}`,
    voiceSlots: Object.fromEntries(
      readWords(buffer, soundTablePointer, 5).map((record, index) => [`V${index + 1}`, record]),
    ),
    strikeStepCounts,
    postHitStepCounts,
    commandPointers: Object.fromEntries(
      Object.entries(commandPointers).map(([key, value]) => [key, `DS:${hex(value)}`]),
    ),
    ...(includeCommandStreams ? {
      commandStreams: attachWeaponChannelContinuations(
        buffer,
        Object.fromEntries(
          Object.entries(commandPointers).map(([key, value]) => [
            key,
            parseFullScreenCommandStream(
              buffer,
              value,
              key.startsWith("main")
                ? strikeStepCounts.values
                : postHitStepCounts.values,
            ),
          ]),
        ),
        postHitStepCounts.values,
      ),
    } : {}),
  };
}

function leftGraphicRule(record, plus50) {
  const requestedRecord = record + (plus50 ? 50 : 0);
  if (requestedRecord === 1) {
    return { requestedRecord, group: "Y_00", record: 41, remapped: true };
  }
  if (requestedRecord === 51) {
    return { requestedRecord, group: "Y_00", record: 42, remapped: true };
  }
  return { requestedRecord, group: "M_00", record: requestedRecord, remapped: false };
}

function rightGraphicRule(record, plus50) {
  return {
    requestedRecord: record + (plus50 ? 50 : 0),
    group: "Y_00",
    record: record + (plus50 ? 50 : 0),
    remapped: false,
  };
}

function compactDecodedEntry(entry) {
  if (entry === undefined) return null;
  return {
    kind: entry.kind,
    sourceBytes: entry.sourceBytes,
    decodedStreams: entry.streams?.filter((stream) => stream.present).length ?? 0,
    unpackedBytesPerStream: entry.streams?.[0]?.unpackedBytes ?? null,
  };
}

async function loadResourceCatalog(extractedRoot, decodedRoot, planarRoot, refs) {
  const groups = [...new Set(refs.map((entry) => entry.group))]
    .filter((group) => group !== "E");
  const manifests = new Map();
  for (const group of groups) {
    const [extracted, decoded, planar] = await Promise.all([
      readFile(path.join(extractedRoot, group, "manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(decodedRoot, group, "manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(planarRoot, group, "manifest.json"), "utf8").then(JSON.parse),
    ]);
    manifests.set(group, { extracted, decoded, planar });
  }

  const uniqueRefs = [...new Map(refs.map((entry) =>
    [`${entry.group}/${entry.record}`, entry])).values()]
    .sort((left, right) => left.group.localeCompare(right.group) || left.record - right.record);
  const entries = [];
  for (const ref of uniqueRefs) {
    if (ref.group === "E") continue;
    const { extracted, decoded, planar } = manifests.get(ref.group);
    const extractedEntry = extracted.records.find((entry) => entry.index === ref.record);
    const decodedEntry = decoded.entries.find((entry) => entry.record === ref.record);
    const planarEntry = planar.entries.find((entry) => entry.record === ref.record);
    const present = extractedEntry !== undefined && !extractedEntry.missing && !extractedEntry.terminator;
    const relativePath = `${ref.group}/${String(ref.record).padStart(4, "0")}.bin`;
    const payload = present ? await readFile(path.join(extractedRoot, relativePath)) : null;
    entries.push({
      key: `${ref.group}/${ref.record}`,
      group: ref.group,
      record: ref.record,
      present,
      extractedPath: present ? path.join(extractedRoot, relativePath) : null,
      sourceBytes: payload?.length ?? null,
      sourceSha256: payload === null ? null : sha256(payload),
      decoded: compactDecodedEntry(decodedEntry),
      renderedFrames: planarEntry?.images?.length ?? 0,
      renderedPaths: planarEntry?.images?.map((image) =>
        path.join(planarRoot, ref.group, image.output)) ?? [],
    });
  }
  return entries;
}

function audioCatalog(audioManifest, records, extractedRoot, audioRoot) {
  return [...new Set(records)].sort((left, right) => left - right).map((record) => {
    const entry = audioManifest.entries.find((candidate) =>
      candidate.group === "E" && candidate.record === record);
    assert(entry !== undefined, `E.SWF/${record}: missing converted-audio manifest entry`);
    return {
      key: `E/${record}`,
      group: "E",
      record,
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
  descriptorsPath,
  audioManifestPath,
  extractedRoot,
  decodedRoot,
  planarRoot,
  outputPath,
) {
  const [moduleBuffer, descriptorsBuffer, audioBuffer] = await Promise.all([
    readFile(modulePath),
    readFile(descriptorsPath),
    readFile(audioManifestPath),
  ]);
  const descriptors = JSON.parse(descriptorsBuffer.toString("utf8"));
  const audioManifest = JSON.parse(audioBuffer.toString("utf8"));
  assert(descriptors.records?.length === RECORD_COUNT, "unit descriptors must contain 39 records");

  const mapDeathPhase1Pointers = readTerminatedWords(moduleBuffer, 0x6a26).values;
  const mapDeathPhase2Pointers = readTerminatedWords(moduleBuffer, 0x6a34).values;
  assert(mapDeathPhase1Pointers.length === 6, "map death phase 1 must contain six descriptors");
  assert(mapDeathPhase2Pointers.length === 9, "map death phase 2 must contain nine descriptors");

  const classRecords = descriptors.records.map((record) => {
    // 命令流按“该侧表现块是否有效”解码，不按记录号截断：36–38 的 side 2 同样有效。
    const side1 = presentationBlock(moduleBuffer, sideDescriptor(record, "side1"), true);
    const side2 = presentationBlock(moduleBuffer, sideDescriptor(record, "side2"), true);
    return {
      record: record.record,
      name: record.normalizedName,
      side1,
      side2,
      voiceSlotAgreement: side1.available && side2.available
        ? JSON.stringify(side1.voiceSlots) === JSON.stringify(side2.voiceSlots)
        : null,
      fullScreenGraphicVariants: {
        leftDirect: leftGraphicRule(record.record, false),
        leftPlus50: leftGraphicRule(record.record, true),
        rightDirect: rightGraphicRule(record.record, false),
        rightPlus50: rightGraphicRule(record.record, true),
      },
    };
  });
  const soldierCommands = classRecords.find((record) => record.record === 0);
  const archerCommands = classRecords.find((record) => record.record === 20);
  const warriorCommands = classRecords.find((record) => record.record === 28);
  assert(
    soldierCommands.side1.commandStreams.auxiliaryA.steps
      .map((step) => `${step.pose.frame}:${step.pose.deltaX}`).join(",") === "4:-40,0:-40,0:-40"
      && soldierCommands.side2.commandStreams.auxiliaryA.steps
        .map((step) => `${step.pose.frame}:${step.pose.deltaX}`).join(",") === "4:40,0:40,0:40",
    "soldier post-hit settle/exit stream changed",
  );
  assert(
    archerCommands.side1.commandStreams.mainLeftOrAttacker.steps
      .map((step) => step.pose.frame).join(",") === "0,1,2,3,4,4,4",
    "archer side1 strike frame sequence changed",
  );
  assert(
    archerCommands.side2.commandStreams.mainLeftOrAttacker.steps
      .map((step) => step.pose.frame).join(",") === "0,1,2,3,4,4,4",
    "archer side2 strike frame sequence changed",
  );
  for (const [side, expectedStartX, expectedDeltaX] of [
    ["side1", 146, 6],
    ["side2", 336, -6],
  ]) {
    const release = archerCommands[side].commandStreams.mainLeftOrAttacker.steps[3];
    const projectile = release.commands.find((command) => command.token === "G1")?.linkedStream;
    assert(
      release.commands.some((command) => command.token === "V5")
        && projectile?.steps[0].commands[0].token === ":S"
        && projectile.steps[0].commands[0].parameters[0] === expectedStartX
        && projectile.steps.every((step) =>
          step.pose.frame === 5 && step.pose.deltaX === expectedDeltaX && step.pose.deltaY === 0),
      `archer ${side} release/projectile stream changed`,
    );
  }
  for (const side of ["side1", "side2"]) {
    const yOffsetPointer = Number.parseInt(
      archerCommands[side].anchorOrOffsetTablePointers[1].slice(3),
      16,
    );
    assert(
      readWords(moduleBuffer, yOffsetPointer, 9).join(",") === "0,0,0,0,0,0,8,0,0",
      `archer ${side} frame y-offset table changed`,
    );
  }
  assert(
    warriorCommands.side1.commandStreams.mainLeftOrAttacker.steps
      .map((step) => step.pose.frame).join(",") === "0,2,3,3"
      && warriorCommands.side2.commandStreams.mainLeftOrAttacker.steps
        .map((step) => step.pose.frame).join(",") === "0,2,3,3",
    "warrior strike frame sequence changed",
  );
  assert(
    warriorCommands.side1.commandStreams.auxiliaryA.steps
      .every((step) => step.pose.frame === 4 && step.pose.deltaX === -32)
      && warriorCommands.side2.commandStreams.auxiliaryA.steps
        .every((step) => step.pose.frame === 4 && step.pose.deltaX === 32),
    "warrior post-hit contact stream changed",
  );
  const stage0ReactionCommands = [
    {
      classRecord: 0,
      className: "士兵",
      side: "side1",
      hurtVoice: 0x939d,
      hurtPose: 0x8812,
      guardVoice: 0x93b5,
      guardPose: 0x8824,
    },
    {
      classRecord: 0,
      className: "士兵",
      side: "side2",
      hurtVoice: 0xbed5,
      hurtPose: 0x8812,
      guardVoice: 0xbeed,
      guardPose: 0x8824,
    },
    {
      classRecord: 22,
      className: "騎兵",
      side: "side1",
      hurtVoice: 0xaf97,
      hurtPose: 0xafb1,
      guardVoice: 0xafc9,
      guardPose: 0xafe5,
    },
    {
      classRecord: 22,
      className: "騎兵",
      side: "side2",
      hurtVoice: 0xdaf1,
      hurtPose: 0xdb0b,
      guardVoice: 0xdb23,
      guardPose: 0xdb3f,
    },
  ].map((entry) => {
    const classRecord = classRecords.find((record) => record.record === entry.classRecord);
    assert(classRecord !== undefined, `missing stage-0 class record ${entry.classRecord}`);
    assert(classRecord[entry.side].voiceSlots.V1 === 2,
      `${entry.className} ${entry.side}: V1 must resolve to E/2`);
    assert(classRecord[entry.side].voiceSlots.V2 === 0,
      `${entry.className} ${entry.side}: V2 must resolve to E/0`);
    return {
      classRecord: entry.classRecord,
      className: entry.className,
      side: entry.side,
      hurt: {
        voiceCommand: {
          ...verifiedWord(moduleBuffer, entry.hurtVoice, 0x5631, `${entry.className} hurt voice command`),
          token: "V1",
          soundResource: "E/2",
        },
        pose: {
          ...verifiedWord(moduleBuffer, entry.hurtPose, 1, `${entry.className} hurt pose`),
          directFrame: 1,
        },
      },
      guard: {
        voiceCommand: {
          ...verifiedWord(moduleBuffer, entry.guardVoice, 0x5632, `${entry.className} guard voice command`),
          token: "V2",
          soundResource: "E/0",
        },
        pose: {
          ...verifiedWord(moduleBuffer, entry.guardPose, 3, `${entry.className} guard pose`),
          directFrame: 3,
        },
      },
    };
  });

  const resourceRefs = [
    { group: "UN", record: 62 },
    { group: "MAGIC", record: 12 },
  ];
  for (const record of classRecords) {
    resourceRefs.push(...Object.values(record.fullScreenGraphicVariants));
  }
  const resources = await loadResourceCatalog(
    extractedRoot, decodedRoot, planarRoot, resourceRefs,
  );
  const renderedFrameCount = (variant) =>
    resources.find((entry) => entry.key === `${variant.group}/${variant.record}`)
      ?.renderedFrames ?? 0;
  for (const record of classRecords) {
    const leftFrameCount = Math.max(
      renderedFrameCount(record.fullScreenGraphicVariants.leftDirect),
      renderedFrameCount(record.fullScreenGraphicVariants.leftPlus50),
    );
    const rightFrameCount = Math.max(
      renderedFrameCount(record.fullScreenGraphicVariants.rightDirect),
      renderedFrameCount(record.fullScreenGraphicVariants.rightPlus50),
    );
    for (const [side, frameCount] of [
      [record.side1, leftFrameCount],
      [record.side2, rightFrameCount],
    ]) {
      if (!side.available) continue;
      const [xPointer, yPointer] = side.anchorOrOffsetTablePointers.map((address) =>
        Number.parseInt(address.slice(3), 16));
      side.framePlacement = {
        frameCount,
        xAnchor: Array.from({ length: frameCount }, (_, index) =>
          readSignedWord(moduleBuffer, xPointer + index * 2)),
        yOffset: Array.from({ length: frameCount }, (_, index) =>
          readSignedWord(moduleBuffer, yPointer + index * 2)),
      };
    }
  }

  const voiceRecords = classRecords.flatMap((record) =>
    [record.side1, record.side2].flatMap((side) =>
      side.available ? Object.values(side.voiceSlots) : []));
  voiceRecords.push(11, 38);

  const mapHitDescriptor = {
    address: "DS:6B61",
    xOffset: readSignedWord(moduleBuffer, 0x6b61),
    yOffset: readSignedWord(moduleBuffer, 0x6b63),
    width: readWord(moduleBuffer, 0x6b65),
    height: readWord(moduleBuffer, 0x6b67),
    dynamicTileCodeAddress: "DS:6B69",
  };
  assert(mapHitDescriptor.width === 1 && mapHitDescriptor.height === 1,
    "map hit descriptor must be 1x1");

  const deathStepCounts = readTerminatedWords(moduleBuffer, 0x7d4c);
  assert(deathStepCounts.values.length === 6 &&
    deathStepCounts.values.every((value) => value === 4),
  "full-screen death sequence must be six four-substep poses");

  const result = {
    format: "ANGEL2 ordinary combat presentation rules",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    source: {
      path: modulePath,
      bytes: moduleBuffer.length,
      sha256: sha256(moduleBuffer),
      dataLinearBase: DATA_LINEAR_BASE,
      descriptors: {
        path: descriptorsPath,
        bytes: descriptorsBuffer.length,
        sha256: sha256(descriptorsBuffer),
      },
      audioManifest: {
        path: audioManifestPath,
        bytes: audioBuffer.length,
        sha256: sha256(audioBuffer),
      },
    },
    verifiedCodeSignatures: validateCodeSignatures(moduleBuffer),
    verifiedDataSignatures: validateDataSignatures(moduleBuffer),
    dispatch: {
      address: "0000:926B",
      selector: "DS:1119 bit 0",
      mapWhen: 0,
      fullScreenWhen: 1,
      sharedCounterSuppression: [
        "primary damage leaves either mirrored life at zero",
        "attacker class code is 0G (巨斧戰士)",
        "defender per-unit disable byte is nonzero",
      ],
    },
    soundDriver: {
      playLoadedFarEntry: "0000:0220",
      settingsGatedEntry: "0000:0228",
      worker: "0000:0254",
      fullScreenVoiceGate: "DS:10ED bit 0 must be set before V1..V5 requests reach the worker",
      workerNoOpGate: "DS:000A == 'Y' makes the worker return without requesting playback",
      workerEffect: "stores the loaded segment at DS:000B, sets DS:F593=1 around 1000:EB83, then clears DS:F593",
    },
    mapPresentation: {
      primaryEntry: "0000:91C5",
      counterEntry: "0000:9135",
      sequenceEntry: "0000:927A",
      hitAndDamageEntry: "1000:6B58",
      hit: {
        graphicResource: "UN/62",
        soundResource: "E/38",
        descriptor: mapHitDescriptor,
        frameTimeline: [
          { tileCodes: [0, 1, 2, 3], eachWaitNativeTicks: 10 },
          { event: "second E/38 playback request", afterTileCode: 3 },
          { tileCodes: [4, 5, 6, 7], eachWaitNativeTicks: 10 },
          { tileCodes: [0], eachWaitNativeTicks: 10, role: "return to first slash frame" },
        ],
        firstSoundRequest: "after E/38 load and before tile code 0",
        secondSoundRequest: "after tile code 3 and before tile code 4",
        totalGraphicFrames: 9,
        fixedGraphicWaitNativeTicks: 90,
        damageTimeline: {
          gate: "DS:6B60 == 'Y'",
          damagePoints: "DS:5230, sourced from primary DS:77D3 or counter DS:77D5",
          waitPerAppliedPointNativeTicks: 1,
          behavior: "0000:6507 applies at most one life point, redraws, waits, and stops early when it returns 'N'",
        },
      },
      death: {
        entry: "1000:6ABC",
        graphicResource: "MAGIC/12",
        tileCodeRule: "0 is blank; values 1..38 select rendered MAGIC/12 frames 0..37",
        phase1BeforeBoardErase: mapDeathPhase1Pointers.map((pointer) =>
          decodeMapDescriptor(moduleBuffer, pointer)),
        boardEraseBoundary: "after all six phase-1 descriptors, clear the current unit slot and board side/slot bytes",
        phase2AfterBoardErase: mapDeathPhase2Pointers.map((pointer) =>
          decodeMapDescriptor(moduleBuffer, pointer)),
        waitPerDescriptorNativeTicks: 10,
        descriptorCount: 15,
        fixedWaitNativeTicks: 150,
        directSoundRequest: null,
      },
    },
    fullScreenPresentation: {
      prepareEntry: "0000:9852",
      sequenceEntry: "0000:A17B",
      strikeEntry: "0000:A1E8",
      commandInterpreter: "0000:A77F",
      commonTrail: {
        drawEntry: "0000:B3BD",
        graphicResource: "A/26",
        subjectCoordinates: {
          attacker: "DS:7AAC (main slot DS:7AA6 + 6)",
          defender: "DS:7B32 (main slot DS:7B2C + 6)",
          slotEvidence: "0000:A7C0 clears every sprite slot except offset 6",
        },
        classOrFrameLookup: "none; B3BD reads no class record, bitmap width, or x-anchor",
        branches: {
          attackerY: "subjectX - 40 - phase; particle spacing -24",
          attackerU: "subjectX + 40 + phase; particle spacing +24",
          defenderY: "subjectX + 40 + phase; particle spacing +24",
          defenderU: "subjectX - 40 - phase; particle spacing -24",
        },
        phase: "DS:7F4C advances by 4 and wraps to 0 after 24",
        verticalCoordinates: [124, 120, 115],
        conclusion: "all class records share the same main-channel coordinate formula; per-frame anchors only project the character bitmap",
      },
      attackerBlock: "0000:9F74 loads attacker cell DS:77BF, then 0000:9FC4/A01B copies its 58-byte presentation block to DS:7C63 according to side",
      defenderBlock: "0000:9F9C loads defender cell DS:77C1, then 0000:9FC4/A01B copies its 58-byte presentation block to DS:7C9D according to side",
      graphicSelection: {
        leftDirect: "0000:B748 normally loads M_00[class]; requested class 1 is remapped to Y_00/41",
        leftPlus50: "0000:B725 requests class+50 through B748; requested record 51 is remapped to Y_00/42",
        rightDirect: "direct loader uses Y_00[class]",
        rightPlus50: "0000:B730 uses Y_00[class+50]",
        primaryAttackerSide1: "leftPlus50(attacker DS:7C63), rightDirect(defender DS:7C9D)",
        primaryAttackerSide2: "leftDirect(attacker DS:7C63), rightPlus50(defender DS:7C9D)",
        counter: "0000:A377 preserves the two loaded class blocks but selects the opposite unit command data; exact branches are retained in the verified code signatures",
      },
      voiceCommands: {
        table: "each side descriptor block points to five E.SWF record numbers loaded into segments DS:0205/0209/020D/0211/0215",
        opcodes: {
          V1: "play loaded segment DS:0205",
          V2: "play loaded segment DS:0209",
          V3: "play loaded segment DS:020D",
          V4: "play loaded segment DS:0211",
          V5: "play loaded segment DS:0215",
        },
        semanticBoundary: "V1..V5 are positional command slots, not globally fixed meanings; each class command stream decides when a slot fires",
      },
      hitReaction: {
        selector: "0000:A23E",
        damageSource: "DS:7CD7 (the already-resolved primary or counter damage)",
        guard: {
          condition: "unsigned damage <= 10",
          setupEntry: "0000:A28E",
          stage0CommandPair: "auxiliaryC/auxiliaryD",
          voiceCommand: "V2",
          soundResource: "E/0",
          directFrame: 3,
        },
        hurt: {
          condition: "unsigned damage > 10",
          setupEntry: "0000:A24D",
          stage0CommandPair: "auxiliaryA/auxiliaryB",
          voiceCommand: "V1",
          soundResource: "E/2",
          directFrame: 1,
        },
        death: {
          ordering: "A1E8 always executes the threshold-selected post-hit stream before A17B calls the zero-life handlers B683/B6BD",
          soundResource: "E/11",
          directFrame: 2,
          composition: "threshold hit sound first, then the independent death sound and pose",
        },
        stage0CommandEvidence: stage0ReactionCommands,
      },
      lifeGauges: {
        redrawEntry: "0000:9E28",
        leftTierEntry: "0000:9E8C",
        rightTierEntry: "0000:9EED",
        damageOrdering: "A1E8 applies the saturated damage callback, formats DS:7CD7, then immediately calls 9E28 before selecting and executing the post-hit streams",
        panelNumbers: "prepared once before the strike sequence and not redrawn; the two gauge values do change at each impact",
        tierWidth: 210,
        gameplayPalette: {
          0: "#000000",
          6: "#f79e9e",
          7: "#baaa9a",
          9: "#4d8aff",
          11: "#ef2024",
          13: "#aee728",
        },
        tiers: [
          { life: "0..209", baseColorIndex: 0, fillColorIndex: 11, fillWidth: "life" },
          { life: "210..419", baseColorIndex: 11, fillColorIndex: 9, fillWidth: "life-210" },
          { life: "420..629", baseColorIndex: 9, fillColorIndex: 13, fillWidth: "life-420" },
          { life: "630..839", baseColorIndex: 6, fillColorIndex: 6, fillWidth: "life-630" },
        ],
        left: {
          outer: decodeDrawRectangle(moduleBuffer, 0x7e76),
          base: decodeDrawRectangle(moduleBuffer, 0x7d05),
          fill: decodeDrawRectangle(moduleBuffer, 0x7d19),
          shine: decodeDrawRectangle(moduleBuffer, 0x7e8a),
          anchor: "left; the active tier grows from x=104 toward the center",
        },
        right: {
          outer: decodeDrawRectangle(moduleBuffer, 0x7e80),
          base: decodeDrawRectangle(moduleBuffer, 0x7d0f),
          fill: decodeDrawRectangle(moduleBuffer, 0x7d23),
          shine: decodeDrawRectangle(moduleBuffer, 0x7e94),
          anchor: "right; x=326+(210-remainder) and the active tier grows toward x=535",
        },
      },
      strikeTimeline: [
        "prepare primary command/resource state at A2E4",
        "draw the composed battle background at AEC3",
        "A1E8 executes the strike command stream at DS:7C18",
        "invoke the attacker movement callback A71F/A74F",
        "invoke the primary/counter damage callback A096/A0C6 and render DS:7CD7 as the damage number",
        "replace DS:7C18 with DS:7C1A and execute the post-hit command stream",
        "run left and right zero-life death handlers B683/B6BD",
        "if neither unit died and suppression is false, repeat with A377 and the counter callbacks",
      ],
      death: {
        leftHandler: "0000:B683",
        rightHandler: "0000:B6BD",
        soundResource: "E/11",
        deathStepCounts,
        rendererSubsteps: deathStepCounts.values.reduce((sum, value) => sum + value, 0),
        leftScript: parseSimpleDeathScript(moduleBuffer, 0x7d5a, 6),
        rightScript: parseSimpleDeathScript(moduleBuffer, 0x7d84, 6),
        commonTrailPlacement: {
          leftHandlerSlots: "B683 assigns DS:7A84=7D5A and DS:7B0A=7DAE, so UE is parsed by the physical-left stream",
          rightHandlerSlots: "B6BD assigns DS:7B0A=7D84 and DS:7A84=7DAE, so UE is parsed by the physical-right stream",
          leftDeath: "B3BD left-U branch: subjectX + 40 + phase, then +24 spacing (toward the window centre)",
          rightDeath: "B3BD right-U branch: subjectX - 40 - phase, then -24 spacing (toward the window centre)",
        },
        soundSynchronization: "both scripts begin with V1, so E/11 is requested when the first death pose is advanced; the request still passes the DS:10ED sound-setting gate",
      },
      classRecordCount: classRecords.length,
      bothSidesAvailableRecords: classRecords.filter(
        (record) => record.side1.available && record.side2.available,
      ).length,
      side2OnlyRecords: classRecords.filter(
        (record) => !record.side1.available && record.side2.available,
      )
        .map((record) => record.record),
      side2OnlyReason: "记录 36/37/38 只在 side 2 编队出现（龍：场景 20/22；頭与两只手：场景 37），"
        + "所以原版只填了 side 2 表现块与 Y_00 图形；side 1 块整体指向零占位，M_00/36..38 是 3 字节占位、"
        + "M_00/86..88 缺失。这是“左侧不可达”，不是“没有普通全屏动画”。",
      sideVoiceSlotAgreementRecords: classRecords.filter(
        (record) => record.voiceSlotAgreement === true,
      ).length,
      sideVoiceSlotDifferenceRecords: classRecords.filter(
        (record) => record.voiceSlotAgreement === false,
      )
        .map((record) => record.record),
      classRecords,
    },
    resourceCatalog: {
      graphicEntries: resources,
      audioEntries: audioCatalog(
        audioManifest,
        voiceRecords,
        extractedRoot,
        path.dirname(audioManifestPath),
      ),
      contactSheets: [
        "reverse/renders/contact-sheets/combat/UN-0062-map-hit.png",
        "reverse/renders/contact-sheets/combat/MAGIC-0012-map-death.png",
      ],
    },
    evidenceBoundary: {
      confirmed: "map hit/death descriptor timelines, native waits, map sound requests, full-screen resource-record selection, five-slot per-class E banks, 210-pixel tiered life-gauge geometry and impact update timing, shared B3BD trail coordinates with no class/frame lookup, <=10 guard versus >10 hurt command/sound selection for stage-0 classes, high-level primary/counter/death ordering",
      preservedUnknown: "the original design names of many embedded full-screen command fields and the host/VGA duration of one full-screen renderer substep; the released nominal native timer tick is 10.000151 ms",
      implementation: "none; this export is phase-1 evidence only",
    },
  };

  assert(result.mapPresentation.death.phase1BeforeBoardErase.flatMap((entry) =>
    entry.tileCodes).join(",") === Array.from({ length: 26 }, (_, index) => index + 1).join(","),
  "map death phase 1 must cover tile codes 1..26 in order");
  assert(resources.find((entry) => entry.key === "UN/62")?.renderedFrames === 8,
    "UN/62 must render eight frames");
  assert(resources.find((entry) => entry.key === "MAGIC/12")?.renderedFrames === 38,
    "MAGIC/12 must render 38 frames");
  assert(result.fullScreenPresentation.sideVoiceSlotDifferenceRecords.join(",") === "17,23",
    "unexpected side voice-slot differences");
  assert(
    classRecords.filter((record) => !record.side1.available)
      .map((record) => record.record).join(",") === SIDE1_ONLY_UNAVAILABLE_RECORDS.join(","),
    "unexpected side-1 full-screen presentation availability boundary",
  );
  // 36–38 的 side 2 必须保持有效：这三条是龍/頭/手实际可达的普通全屏表现，
  // 曾被误判为“原版不适用”。任何回归都必须在这里失败。
  assert(
    classRecords.every((record) => record.side2.available),
    "every class record must keep a valid side-2 full-screen presentation block",
  );
  for (const record of SIDE1_ONLY_UNAVAILABLE_RECORDS) {
    const side2 = classRecords[record].side2;
    assert(side2.commandStreams?.mainLeftOrAttacker?.steps?.length > 0
      && side2.commandStreams?.mainRightOrDefender?.steps?.length > 0,
    `record ${record} must expose decoded side-2 attacker and defender command streams`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted ordinary combat presentations: ${classRecords.length} class records, ` +
    `${resources.length} graphic resource records, ` +
    `${result.resourceCatalog.audioEntries.length} E.SWF records`,
  );
  return result;
}

function usage() {
  return "usage: angel2-combat-presentations.mjs --extract MODULE29 UNIT_DESCRIPTORS " +
    "AUDIO_MANIFEST EXTRACTED_ROOT DECODED_ROOT PLANAR_ROOT OUTPUT_JSON";
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "--extract" || args.length !== 7) throw new Error(usage());
  await extract(...args);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export {
  decodeMapDescriptor,
  extract,
  leftGraphicRule,
  parseSimpleDeathScript,
  presentationBlock,
  rightGraphicRule,
};
