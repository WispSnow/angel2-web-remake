#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { composePlanarImage, encodeRgbaPng } from "./angel2-planar.mjs";

const MODULE25_DATA_BASE = 0x9140;
const MODULE29_DATA_BASE = 0x1eba0;
const BIG5 = new TextDecoder("big5", { fatal: true });

const CODE_SIGNATURES = Object.freeze({
  25: [
    ["0000:05F2", 0x05f2, 0x06c0, "stage-story resource/audio sequence", "718e2f95a1b21280e0a997337e56547020eb480de7a449bd57e25ab4ce23dd8e"],
    ["0000:0736", 0x0736, 0x07b7, "module-25 story interpreter loop", "a52009867fb2e825e3c76e901f574e45f9a5376fe977dceed48b413c9177e6e3"],
    ["0000:07C7", 0x07c7, 0x0904, "module-25 SAY dispatcher and inline handlers", "49e42e195a2ba99bbff673b3efc77b22a1d57b78db86bf7263f655231174f8b8"],
    ["0000:0904", 0x0904, 0x0999, "portrait hiding and BK background load/draw", "6321332849068769ecbd2b708546ebdd61401315a4b1d4b60658bfac331e3151"],
    ["0000:09A9", 0x09a9, 0x0a19, "module-25 input wait", "8676bbdcf856c9a449f545dbe7726cc34e523bdb8ce0cec8f4734eb02b8ed2a9"],
    ["0000:0A19", 0x0a19, 0x0b5b, "glyph draw and decimal argument parser", "557b02c1dfb743acb6dee40ec78a47a79acadef4802e2e6a86d0419b74eef660"],
    ["0000:0B5B", 0x0b5b, 0x0cd1, "story framebuffer and portrait compositor", "42ee6805852e1306e4b11037464ba2389da336c2f28e0c634b762c8cc82e5393"],
    ["0000:0CD1", 0x0cd1, 0x0f41, "upper/lower story-window state", "717891e84acb2dd11825ed66e26356fb28db8055efbc2d1fe20c8f8689bd657a"],
    ["0000:0F41", 0x0f41, 0x11eb, "story-window open/close animation", "dd987c8db3a88736d93ec77f134fbb2ceb0e9eee8a41e51ce1e47d30ca78eb73"],
    ["0000:11EB", 0x11eb, 0x1343, "portrait resource load and metadata lookup", "4ee7cc7e8613c0585286021ebea2a37db5fe8d323abbf365ffb215d1cef9d81a"],
    ["0000:1343", 0x1343, 0x13e3, "portrait/window redraw", "108bef6c6562da5443874eb159858681abe56296383fcaa3da6dcc5c6ee17bc4"],
    ["0000:145F", 0x145f, 0x14ec, "stage-to-MAGIC selector", "0fd84a53bb5b47d43ff4e9fe69ea833cfa5ade26142bb6d97e5f93f967f80e53"],
    ["0000:1A18", 0x1a18, 0x1a2a, "native timer-tick wait", "f08dd6097ccd0d2cdd9660410aefb4214cb6c9c89906e7416a6066f5f1cc4af3"],
    ["0000:2B2C", 0x2b2c, 0x2b58, "64-step story palette fade-in", "f154922106e0fd2c380bb56412e816313bc92ae08796e4e4cd320ef6dbe235e5"],
    ["0000:391A", 0x391a, 0x393a, "five-stream graphics expansion", "3e2f6681bfd088916a6776051e9272dbea619c1833e58675242fd55cd2690ace"],
  ],
  29: [
    ["0000:023E", 0x023e, 0x0295, "speech-setting gate, VOC request, and completion wait", "bc2f2388764136d67937b64d5cd8917a861de592ff6bb6582429a83979e0f97b"],
    ["0000:BAB8", 0xbab8, 0xbac6, "battle-SAY mode wrapper", "3235bffcd9af721b3fbf6385e6f6f17080745d523ffa69fc180da75d66b108b5"],
    ["0000:BAC6", 0xbac6, 0xbe14, "battle SAY/NUM/CHA load and setup", "c7006a88c472fd8670b90addfe863e776e6dc9ae71e4496799fea40391317da0"],
    ["0000:BBEC", 0xbbec, 0xbd31, "battle portrait compositor: dither shadow, portrait, A/18 frame, outline columns and name", "1288d46d9ef77f884c0fd3bdecbef871cbcf86662fe6e9bd736feb1bb0541814"],
    ["0000:BE14", 0xbe14, 0xbec3, "battle story interpreter loop", "ab92494eab6e3d5a21bfc9d8712a4a9a166efdb8b693be3f98c76db2e86148f8"],
    ["0000:BEC3", 0xbec3, 0xc082, "battle SAY dispatcher including DL", "b1f6cdce3cc261b3b839baa31d378d0300f475277588c62ddb724d60d287271b"],
    ["0000:C082", 0xc082, 0xc172, "battle portrait hiding and BK background load/draw", "f4cb07f7a4cf365edb5734a46d02effabeb92b1ada54bb0da4ddfd6b0a37283c"],
    ["0000:C172", 0xc172, 0xc1da, "battle-story end and map/HUD restoration", "998fb25ca5bf7390936d2d4434350e3f08cccfbf2de1ed4981f51e092101c5fc"],
    ["0000:C1DA", 0xc1da, 0xc22e, "battle story input wait", "4194b0f1b15e9f9fe407f85fb421fd58c2bb62df0948c0cc640c2c07b88e53fc"],
    ["0000:C23E", 0xc23e, 0xc2df, "battle story glyph draw", "bd9ae1cb4a5e10692d026de6340b732c5e140048ca5a28c29f040750a5a5bd21"],
    ["0000:C2DF", 0xc2df, 0xc3bf, "battle decimal argument parser", "53c8558524c8e9896ffe5fa4e1cb3a45f146cd220f1fb3988689f0a384dd9b38"],
    ["0000:C3BF", 0xc3bf, 0xc617, "battle upper/lower story-window state", "ca7a1a7beb00bfac1988337f29d5e6c9e6a0d9e437b71862679551030887eb02"],
    ["0000:C617", 0xc617, 0xc6f0, "battle story-window open/close animation", "4608f935313944658e61a896581461425482dc9e13e7071a922a394b04ec348d"],
    ["0000:C8A9", 0xc8a9, 0xc9b9, "battle portrait/window redraw", "adf56de748c04f116b155dc097aed13e435d6cca584a8f443e8d3248c6088879"],
    ["0000:C9B9", 0xc9b9, 0xcac3, "preload MAGIC/57..71 when the visible speech switch is enabled", "ba453a6ad03ab1b4869eb1f61a540de5de8a4d069630dd4f8cdd9635adb0a6f6"],
    ["0000:D3B6", 0xd3b6, 0xd3ca, "native timer-tick wait", "ef8980cdb5273fe909fe895de992e715f8015717ba89504015fad4e347a2995c"],
    ["0000:EA04", 0xea04, 0xead4, "Big5 glyph lookup and speech-index modulo calculation", "a9ea626c500c821315fa64c26299e52681b788c2f268a9de6dc8c6709a81c9dd"],
    ["0000:4F41", 0x4f41, 0x4fce, "post-battle key-to-dialogue lookup and presentation", "a6f75d99a6b7e545f858c9688bcb2afa280929317f99bd965461b7cec8661c5e"],
    ["1000:2E77", 0x12e77, 0x12f16, "alternate key-to-dialogue lookup and presentation", "8a04389013c37d728eb222534eeb7b6797022ec1d7300130785ded703f5fd113"],
    ["1000:2F16", 0x12f16, 0x12f41, "alternate key-to-dialogue table search", "d821a7f101d6f56e8037b42acfce882dd00ef55b034d24b059d882e829fe9433"],
  ],
});

const DATA_SIGNATURES = [
  ["DS:049F-0518", 0x049f, 0x0519, "portrait metadata pointer list B", "bd25b7b7fb6fd22b2688dda9bad37568f67c5342a8f151d2942d378bd8da29fb"],
  ["DS:0519-081D", 0x0519, 0x081e, "portrait metadata entries B", "b1c781e4a6b9f218278b48354551243039da533f66af6d1cff62e50c8ddeb692"],
  ["DS:081E-0897", 0x081e, 0x0898, "portrait metadata pointer list A", "24d388122ff704645ab0e03c2b661ef5351f5835f65d0811ba5eaa52a7a0263b"],
  ["DS:0898-0C35", 0x0898, 0x0c36, "portrait metadata entries A", "7bdadf15da7a938f1a4108cd36fad60eb5bcea50312a215612ee47c26bca7088"],
  ["DS:0C36-0DBF", 0x0c36, 0x0dc0, "portrait metadata entries C", "e6631a6d93b0110b273d5746b6679299ab79b1cf545785ea7ab610a8edc2336b"],
  ["DS:0DC0-0DE5", 0x0dc0, 0x0de6, "portrait metadata pointer list C", "a9c6db857dae8c8643e78b5b97b42f376100fb2a889aaa839b80cac152ee3eb7"],
  ["DS:0DE6-0E15", 0x0de6, 0x0e16, "story VGA DAC palette", "ef715fef1e930ed4f07c893215a635a5096de04ac3f82c57b71ec49ca4ee6a6f"],
  ["DS:0E16-0E79", 0x0e16, 0x0e7a, "50-entry stage story-record table", "bf3ee2518715aadba2bae6211a5e9bfbbdadc8bdf89f1e849b0d062703fefe04"],
  ["DS:02EF-03DC", 0x02ef, 0x03dd, "portrait outline-column descriptor and 112x8 shadow dither pattern", "7f534811bb05387b37f097787dc2255aec1cba0cc1b43c23bc2206d8ee61369d"],
  ["DS:0E82-0ED1", 0x0e82, 0x0ed2, "portrait clear-region descriptors", "6876d99461ce5e97ab5dd3b8a97a5bd397fc1984cc9c89fc91faae1e28e23b94"],
  ["DS:0F88-1037", 0x0f88, 0x1038, "stage-to-MAGIC table and terminator", "22e36c748369975524564b0acbfc3ffc45fa6d1f976b0b945b80e38bbc45b8f4"],
];

const MODULE29_DATA_SIGNATURES = [
  ["DS:837A-8467", 0x837a, 0x8468, "portrait outline-column descriptor and 112x8 shadow dither pattern", "7f534811bb05387b37f097787dc2255aec1cba0cc1b43c23bc2206d8ee61369d"],
  ["DS:1273-131E", 0x1273, 0x131f, "42-entry alternate key-to-dialogue table plus terminator", "5fae677f54a16eb0c280fc843308f9119ccac649d04d87351a45a38f09a0340e"],
  ["DS:30BA-3169", 0x30ba, 0x316a, "43-entry post-battle key-to-dialogue table plus terminator", "f68057ef4b136bccd6521720fc562b5a54ac67bda5e2564e227926430b766fc0"],
];

const COMMAND_MATRIX = [
  ["WU", "0000:0CD1", "0000:C3BF", "open upper window"],
  ["KY", "0000:09A9", "0000:C1DA", "wait for input"],
  ["ME", "0000:0A7B/0ACE", "0000:C2DF/C332", "parse and store portrait id only"],
  ["ED", "0000:085E inline", "0000:C172", "end interpreter; battle mode restores map and HUD"],
  ["HU", "0000:11EB", "0000:BB1E", "load D/<id> and draw upper portrait"],
  ["\\\\", "0000:08A6 inline", "0000:BEC3 inline", "y += 20; x = active-window origin"],
  ["CU", "0000:0EE2", "0000:C559", "close upper window"],
  ["BK", "0000:08B8 inline", "0000:BEC3 inline", "backup current framebuffer/page state"],
  ["WD", "0000:0DAA", "0000:C48C", "open lower window"],
  ["CD", "0000:0E83", "0000:C5B8", "close lower window"],
  ["HD", "0000:1255", "0000:BB85", "load D/<id> and draw lower portrait"],
  ["W-", "0000:08D7 inline", "0000:C047 inline", "load A/18 story-window graphics"],
  ["PP", "0000:0963", "0000:C120", "load BK/<id> and draw at (160,80)"],
  ["PU", "0000:0904", "0000:C082", "hide upper portrait"],
  ["PD", "0000:0926", "0000:C0D1", "hide lower portrait"],
  ["DL", null, "0000:C074 inline", "parse argument and wait that many native ticks"],
  ["CW", null, null, "shipped no-op: absent from both dispatchers"],
].map(([command, module25Handler, module29Handler, effect]) => ({
  command, module25Handler, module29Handler, effect,
  module25Recognized: module25Handler !== null,
  module29Recognized: module29Handler !== null,
}));

const DIGITS = Object.freeze({
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
});

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function dacPalette(values) {
  assert.equal(values.length, 48);
  return Array.from({ length: 16 }, (_, index) =>
    Array.from(values.subarray(index * 3, index * 3 + 3), (value) => Math.round(value * 255 / 63)));
}

function dataSlice(module25, start, end) {
  return module25.subarray(MODULE25_DATA_BASE + start, MODULE25_DATA_BASE + end);
}

function verifySignatures(module25, module29) {
  const code = [];
  for (const [module, buffer] of [[25, module25], [29, module29]]) {
    for (const [address, start, end, role, expected] of CODE_SIGNATURES[module]) {
      const bytes = buffer.subarray(start, end);
      assert.equal(sha256(bytes), expected, `module ${module} ${address}: code signature mismatch`);
      code.push({ module, address, fileOffset: start, bytes: bytes.length, role, sha256: expected });
    }
  }
  const data = DATA_SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = dataSlice(module25, start, end);
    assert.equal(sha256(bytes), expected, `${address}: data signature mismatch`);
    return { module: 25, address, fileOffset: MODULE25_DATA_BASE + start, bytes: bytes.length, role, sha256: expected };
  });
  for (const [address, start, end, role, expected] of MODULE29_DATA_SIGNATURES) {
    const bytes = module29.subarray(MODULE29_DATA_BASE + start, MODULE29_DATA_BASE + end);
    assert.equal(sha256(bytes), expected, `module 29 ${address}: data signature mismatch`);
    data.push({ module: 29, address, fileOffset: MODULE29_DATA_BASE + start, bytes: bytes.length, role, sha256: expected });
  }
  return { code, data };
}

function parseKeyDialogueTable(module29, dsOffset, expectedEntries, label) {
  const entries = [];
  let fileOffset = MODULE29_DATA_BASE + dsOffset;
  for (;;) {
    assert(fileOffset + 4 <= module29.length, `${label}: unterminated table`);
    const key = module29.readUInt16LE(fileOffset);
    const dialogueRecord = module29.readUInt16LE(fileOffset + 2);
    if (key === 0xffff) {
      assert.equal(entries.length, expectedEntries, `${label}: unexpected entry count`);
      return { dsOffset, address: `DS:${dsOffset.toString(16).toUpperCase().padStart(4, "0")}`, entries, terminator: key };
    }
    entries.push({ key, dialogueRecord, enabled: dialogueRecord !== 0 });
    fileOffset += 4;
  }
}

function auditGlobalDialogueReachability(module29, corpus, dialogues) {
  const selector = Buffer.from([0xb5, 0x80]);
  const references = [];
  for (let cursor = 0; cursor < module29.length;) {
    const operandOffset = module29.indexOf(selector, cursor);
    if (operandOffset < 0) break;
    cursor = operandOffset + selector.length;
    if (operandOffset >= 2 && module29[operandOffset - 2] === 0xc7 && module29[operandOffset - 1] === 0x06) {
      references.push({
        kind: "immediate_write",
        instructionOffset: operandOffset - 2,
        operandOffset,
        dialogueRecord: module29.readUInt16LE(operandOffset + 2),
      });
    } else if (operandOffset >= 1 && module29[operandOffset - 1] === 0xa3) {
      references.push({ kind: "ax_write", instructionOffset: operandOffset - 1, operandOffset });
    } else if (operandOffset >= 2 && module29[operandOffset - 2] === 0x8b && module29[operandOffset - 1] === 0x0e) {
      references.push({ kind: "cx_read", instructionOffset: operandOffset - 2, operandOffset });
    } else {
      assert.fail(`unclassified DS:80B5 reference at file offset ${operandOffset.toString(16)}`);
    }
  }
  const immediateWrites = references.filter((entry) => entry.kind === "immediate_write");
  const axWrites = references.filter((entry) => entry.kind === "ax_write");
  const reads = references.filter((entry) => entry.kind === "cx_read");
  assert.equal(references.length, 86);
  assert.equal(immediateWrites.length, 75);
  assert.equal(immediateWrites.filter((entry) => entry.instructionOffset < 0x10000).length, 3);
  assert.equal(immediateWrites.filter((entry) => entry.instructionOffset >= 0x10000).length, 72);
  assert.deepEqual(axWrites.map((entry) => entry.instructionOffset), [0x4f64, 0x12e83]);
  assert.equal(reads.length, 9);

  const postBattleTable = parseKeyDialogueTable(module29, 0x30ba, 43, "DS:30BA");
  const alternateTable = parseKeyDialogueTable(module29, 0x1273, 42, "DS:1273");
  const module29PossibleRecords = [...new Set([
    ...immediateWrites.map((entry) => entry.dialogueRecord),
    ...postBattleTable.entries.filter((entry) => entry.enabled).map((entry) => entry.dialogueRecord),
    ...alternateTable.entries.filter((entry) => entry.enabled).map((entry) => entry.dialogueRecord),
  ])].sort((a, b) => a - b);
  const commandScriptRecords = dialogues
    .filter((record) => record.actions.some((action) => action.command !== undefined))
    .map((record) => record.record);
  const allProductionRecords = new Set([
    ...corpus.module25UniqueStoryRecords,
    ...module29PossibleRecords,
  ]);
  const unreachableCommandScripts = commandScriptRecords.filter((record) => !allProductionRecords.has(record));
  assert.deepEqual(unreachableCommandScripts, [69, 116, 117, 118]);
  assert(corpus.module29HandlerDialogueRecords.every((record) => module29PossibleRecords.includes(record)));
  return {
    selector: "module 29 DS:80B5",
    operandReferenceCount: references.length,
    immediateWriteCount: immediateWrites.length,
    handlerImmediateWriteCount: immediateWrites.filter((entry) => entry.instructionOffset >= 0x10000).length,
    otherImmediateWrites: immediateWrites
      .filter((entry) => entry.instructionOffset < 0x10000)
      .map((entry) => ({ fileOffset: entry.instructionOffset, dialogueRecord: entry.dialogueRecord })),
    axWriteCount: axWrites.length,
    axWrites: [
      { fileOffset: 0x4f64, source: "DS:30BA key-to-dialogue table", possibleRecords: [...new Set(postBattleTable.entries.filter((entry) => entry.enabled).map((entry) => entry.dialogueRecord))].sort((a, b) => a - b) },
      { fileOffset: 0x12e83, source: "DS:1273 key-to-dialogue table", possibleRecords: [...new Set(alternateTable.entries.filter((entry) => entry.enabled).map((entry) => entry.dialogueRecord))].sort((a, b) => a - b), unmatchedResult: 0xffff },
    ],
    readCount: reads.length,
    tables: { postBattle: postBattleTable, alternate: alternateTable },
    module25FixedStageRecords: corpus.module25UniqueStoryRecords,
    module29PossibleRecordCount: module29PossibleRecords.length,
    module29PossibleRecords,
    commandScriptRecordCount: commandScriptRecords.length,
    unreachableCommandScripts,
    disposition: "released runtime archive only: no module-25 stage-table entry or module-29 DS:80B5 producer can select these four scripts",
  };
}

function nativeBitmapAt(buffer, imageIndex, label) {
  assert(imageIndex * 2 + 2 <= buffer.length, `${label}: missing pointer ${imageIndex}`);
  const offset = buffer.readUInt16LE(imageIndex * 2);
  if (offset === 0xffff || offset + 4 > buffer.length) return null;
  const height = buffer.readUInt16LE(offset);
  const rowBytes = buffer.readUInt16LE(offset + 2);
  const end = offset + 4 + height * rowBytes;
  if (height === 0 || rowBytes === 0 || end > buffer.length) return null;
  return {
    directoryBytes: null,
    offsets: null,
    images: [{ index: 0, offset, end, width: rowBytes * 8, height, rowBytes, pixels: buffer.subarray(offset + 4, end) }],
  };
}

async function renderOne(decodedRoot, renderRoot, palette, group, record, imageIndex) {
  const recordName = String(record).padStart(4, "0");
  const recordDirectory = path.join(decodedRoot, group, recordName);
  const buffers = await Promise.all(Array.from({ length: 5 }, (_, plane) =>
    readFile(path.join(recordDirectory, `${String(plane).padStart(2, "0")}.raw`))));
  const colorPlanes = buffers.slice(0, 4).map((buffer, plane) => {
    const image = nativeBitmapAt(buffer, imageIndex, `${group}/${record} plane ${plane}`);
    assert(image !== null, `${group}/${record}: missing color-plane image ${imageIndex}`);
    return image;
  });
  const reference = colorPlanes[0].images[0];
  assert(colorPlanes.every((plane) => plane.images[0].width === reference.width && plane.images[0].height === reference.height),
    `${group}/${record}: plane layout mismatch for image ${imageIndex}`);
  const candidateMask = nativeBitmapAt(buffers[4], imageIndex, `${group}/${record} mask`);
  const mask = candidateMask !== null && candidateMask.images[0].width === reference.width && candidateMask.images[0].height === reference.height
    ? candidateMask : null;
  const composed = composePlanarImage(colorPlanes, 0, mask, palette);
  const relative = path.join("frames", group, recordName, `${String(imageIndex).padStart(2, "0")}.png`);
  const png = encodeRgbaPng(composed.width, composed.height, composed.pixels);
  await mkdir(path.dirname(path.join(renderRoot, relative)), { recursive: true });
  await writeFile(path.join(renderRoot, relative), png);
  return {
    group, record, imageIndex, width: composed.width, height: composed.height,
    maskUsed: mask !== null, output: relative, sha256: sha256(png),
    sourcePlanesSha256: sha256(Buffer.concat(buffers)), pixels: composed.pixels,
  };
}

function rgba(width, height, color = [24, 24, 32, 255]) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = color[3];
  }
  return { width, height, pixels };
}

function scaled(frame, divisor) {
  if (divisor === 1) return frame;
  const width = Math.ceil(frame.width / divisor), height = Math.ceil(frame.height / divisor), pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (Math.min(frame.height - 1, y * divisor) * frame.width + Math.min(frame.width - 1, x * divisor)) * 4;
    frame.pixels.copy(pixels, (y * width + x) * 4, source, source + 4);
  }
  return { width, height, pixels };
}

function blit(target, source, x0, y0) {
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const tx = x0 + x, ty = y0 + y;
    if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
    const s = (y * source.width + x) * 4, alpha = source.pixels[s + 3];
    if (alpha === 0) continue;
    const d = (ty * target.width + tx) * 4;
    source.pixels.copy(target.pixels, d, s, s + 4);
  }
}

// The expansion loop is not a plain accumulation of blits. Module 25 `0000:1032` first
// restores both moving edges from the saved background band (`DS:03FD`/`DS:041D`,
// 56x100 latch copies, scratch y=200 -> compose y=0) and only afterwards draws the four
// tile columns; the step then publishes just those two strips to the visible page
// (`DS:040D`/`DS:042D`, compose y=0 -> screen y=2). Replaying the blits without the
// restore leaves every step's corner cap behind and smears 11 caps per side across the
// window top. `0000:1B50` copies whole bytes, so each strip snaps to an 8 px grid.
const WINDOW_PAGE = Object.freeze({ width: 640, height: 100, byteGranularity: 8 });
const WINDOW_EDGE_STRIP = Object.freeze({
  width: 56,
  leftOffsetFromLeftOuter: -17,
  rightOffsetFromRightInner: 7,
});

function byteAlignedSpan(x, width, limit) {
  const granularity = WINDOW_PAGE.byteGranularity;
  const start = Math.max(0, Math.floor(x / granularity) * granularity);
  const end = Math.min(limit, (Math.floor((x + width - 1) / granularity) + 1) * granularity);
  return [start, end];
}

// The saved band holds the scene without the window, so restoring it clears the overlay.
function clearWindowStrip(page, x, width) {
  const [start, end] = byteAlignedSpan(x, width, page.width);
  for (let y = 0; y < page.height; y++) {
    page.pixels.fill(0, (y * page.width + start) * 4, (y * page.width + end) * 4);
  }
}

function copyWindowStrip(target, source, x, width) {
  const [start, end] = byteAlignedSpan(x, width, source.width);
  for (let y = 0; y < source.height; y++) {
    const row = y * source.width;
    source.pixels.copy(target.pixels, (row + start) * 4, (row + start) * 4, (row + end) * 4);
  }
}

function composeDialogueTextWindow(windowGraphics) {
  const frames = new Map(windowGraphics.map((frame) => [frame.imageIndex, frame]));
  const frame = (imageIndex) => {
    const value = frames.get(imageIndex);
    assert(value, `missing A/18 frame ${imageIndex} for dialogue-window composition`);
    return value;
  };
  const compose = rgba(WINDOW_PAGE.width, WINDOW_PAGE.height, [0, 0, 0, 0]);
  const visible = rgba(WINDOW_PAGE.width, WINDOW_PAGE.height, [0, 0, 0, 0]);
  const originX = 153;
  let leftOuter = 313;
  let leftInner = 337;
  let rightInner = 345;
  let rightOuter = 361;
  for (let iteration = 0; iteration < 11; iteration++) {
    const leftStripX = leftOuter + WINDOW_EDGE_STRIP.leftOffsetFromLeftOuter;
    const rightStripX = rightInner + WINDOW_EDGE_STRIP.rightOffsetFromRightInner;
    clearWindowStrip(compose, leftStripX, WINDOW_EDGE_STRIP.width);
    clearWindowStrip(compose, rightStripX, WINDOW_EDGE_STRIP.width);
    blit(compose, frame(3), leftOuter, 0);
    blit(compose, frame(6), leftInner, 0);
    blit(compose, frame(6), rightInner, 0);
    blit(compose, frame(9), rightOuter, 0);
    for (let row = 0; row < 3; row++) {
      const y = 24 + row * 16;
      blit(compose, frame(4), leftOuter, y);
      blit(compose, frame(7), leftInner, y);
      blit(compose, frame(7), rightInner, y);
      blit(compose, frame(10), rightOuter, y);
    }
    blit(compose, frame(5), leftOuter, 72);
    blit(compose, frame(8), leftInner, 72);
    blit(compose, frame(8), rightInner, 72);
    blit(compose, frame(11), rightOuter, 72);
    copyWindowStrip(visible, compose, leftStripX, WINDOW_EDGE_STRIP.width);
    copyWindowStrip(visible, compose, rightStripX, WINDOW_EDGE_STRIP.width);
    leftOuter -= 16;
    leftInner -= 16;
    rightInner += 16;
    rightOuter += 16;
  }
  const target = rgba(400, 86, [0, 0, 0, 0]);
  for (let y = 0; y < target.height; y++) {
    const source = (y * visible.width + originX) * 4;
    visible.pixels.copy(target.pixels, y * target.width * 4, source, source + target.width * 4);
  }
  return target;
}

function drawNumber(target, value, x0, y0, scale = 2) {
  let x = x0;
  for (const digit of String(value).padStart(2, "0")) {
    const glyph = DIGITS[digit];
    for (let y = 0; y < 5; y++) for (let gx = 0; gx < 3; gx++) if (glyph[y][gx] === "1") {
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const tx = x + gx * scale + sx, ty = y0 + y * scale + sy, d = (ty * target.width + tx) * 4;
        target.pixels[d] = 255; target.pixels[d + 1] = 255; target.pixels[d + 2] = 255; target.pixels[d + 3] = 255;
      }
    }
    x += 4 * scale;
  }
}

async function contactSheet(renderRoot, relative, frames, columns, cellWidth, cellHeight, divisor) {
  const rows = Math.ceil(frames.length / columns);
  const sheet = rgba(columns * cellWidth, rows * cellHeight);
  frames.forEach((frame, index) => {
    const image = scaled(frame, divisor), col = index % columns, row = Math.floor(index / columns);
    blit(sheet, image, col * cellWidth + Math.floor((cellWidth - image.width) / 2), row * cellHeight + 2);
    drawNumber(sheet, frame.record, col * cellWidth + 4, row * cellHeight + cellHeight - 12, 2);
  });
  const png = encodeRgbaPng(sheet.width, sheet.height, sheet.pixels);
  await mkdir(path.dirname(path.join(renderRoot, relative)), { recursive: true });
  await writeFile(path.join(renderRoot, relative), png);
  return { path: relative, width: sheet.width, height: sheet.height, bytes: png.length, sha256: sha256(png) };
}

async function loadDialogues(dialogueDirectory) {
  const names = (await readdir(dialogueDirectory)).filter((name) => /^\d{4}\.json$/.test(name)).sort();
  assert.equal(names.length, 176, "expected 176 compiled dialogue records");
  const records = [];
  for (const name of names) {
    const value = JSON.parse(await readFile(path.join(dialogueDirectory, name), "utf8"));
    assert.equal(value.semanticVersion, 2, `${name}: expected dialogue semantic version 2`);
    records.push({ record: Number.parseInt(name, 10), ...value });
  }
  return records;
}

async function render(module25Path, decodedRoot, dialogueDirectory, renderRoot) {
  const [module25, dialogues] = await Promise.all([readFile(module25Path), loadDialogues(dialogueDirectory)]);
  const paletteBytes = dataSlice(module25, 0x0de6, 0x0e16);
  assert.equal(sha256(paletteBytes), DATA_SIGNATURES[6][4], "story palette changed");
  const palette = dacPalette(paletteBytes);
  const backgroundIds = [...new Set(dialogues.flatMap((record) => record.actions
    .filter((action) => action.op === "set_background").map((action) => action.backgroundId)))].sort((a, b) => a - b);
  assert.deepEqual(backgroundIds, [1, 3, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 22, 23, 31]);

  const backgrounds = [];
  for (const record of backgroundIds) backgrounds.push(await renderOne(decodedRoot, renderRoot, palette, "BK", record, 0));
  const portraits = [];
  for (let record = 0; record < 68; record++) portraits.push(await renderOne(decodedRoot, renderRoot, palette, "D", record, 0));
  const windowGraphics = [];
  for (let image = 0; image < 12; image++) windowGraphics.push(await renderOne(decodedRoot, renderRoot, palette, "A", 18, image));
  windowGraphics.push(await renderOne(decodedRoot, renderRoot, palette, "A", 20, 0));
  const dialogueWindow = composeDialogueTextWindow(windowGraphics);
  const dialogueWindowOutput = "composites/A-0018-dialogue-window.png";
  const dialogueWindowPng = encodeRgbaPng(dialogueWindow.width, dialogueWindow.height, dialogueWindow.pixels);
  await mkdir(path.dirname(path.join(renderRoot, dialogueWindowOutput)), { recursive: true });
  await writeFile(path.join(renderRoot, dialogueWindowOutput), dialogueWindowPng);

  const sheets = [
    await contactSheet(renderRoot, "contact-sheets/backgrounds.png", backgrounds, 4, 160, 112, 2),
    await contactSheet(renderRoot, "contact-sheets/portraits.png", portraits, 8, 112, 126, 1),
    await contactSheet(renderRoot, "contact-sheets/window-ui.png", windowGraphics, 4, 128, 70, 1),
  ];
  const stripPixels = portraits.filter((frame) => frame.record === 56 || frame.record === 67);
  sheets.push(await contactSheet(renderRoot, "contact-sheets/D-0056-0067-transformation.png", stripPixels, 2, 128, 126, 1));

  const publicFrame = ({ pixels, ...frame }) => frame;
  const manifest = {
    format: "ANGEL2 story-presentation palette-correct resources",
    source: { module25: module25Path, module25Sha256: sha256(module25), decodedRoot, dialogueDirectory },
    palette: { address: "module25 DS:0DE6", raw: [...paletteBytes], colors: palette, sha256: sha256(paletteBytes) },
    nativePointerRule: "each plane's image pointer is read independently; missing/non-layout-compatible stream-4 pointers mean no mask, allowing D/63 and A/20 to render without the generic monotonic-table assumption",
    renderedImages: backgrounds.length + portraits.length + windowGraphics.length,
    groups: {
      backgrounds: backgrounds.map(publicFrame), portraits: portraits.map(publicFrame), windowGraphics: windowGraphics.map(publicFrame),
    },
    dialogueWindowComposite: {
      resource: "A/18 frames 3..11",
      output: dialogueWindowOutput,
      width: dialogueWindow.width,
      height: dialogueWindow.height,
      sha256: sha256(dialogueWindowPng),
      nativeAssembly: {
        iterations: 11,
        initialX: [313, 337, 345, 361],
        perIterationDeltaX: [-16, -16, 16, 16],
        finalDrawBounds: [153, 0, 553, 86],
        middleRowsY: [24, 40, 56],
        bottomY: 72,
        edgeStrips: {
          width: WINDOW_EDGE_STRIP.width,
          height: WINDOW_PAGE.height,
          byteGranularity: WINDOW_PAGE.byteGranularity,
          leftOffsetFromLeftOuter: WINDOW_EDGE_STRIP.leftOffsetFromLeftOuter,
          rightOffsetFromRightInner: WINDOW_EDGE_STRIP.rightOffsetFromRightInner,
          backgroundRestore: { descriptors: ["DS:03FD", "DS:041D"], sourceY: 200, targetY: 0 },
          visiblePublish: { descriptors: ["DS:040D", "DS:042D"], sourceY: 0, targetY: 2 },
        },
      },
    },
    contactSheets: sheets,
  };
  await mkdir(renderRoot, { recursive: true });
  await writeFile(path.join(renderRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`rendered ${manifest.renderedImages} story resources and ${sheets.length} contact sheets`);
  return manifest;
}

function parsePortraitMetadata(module25) {
  const tables = [
    { searchOrder: 0, pointerAddress: 0x081e, label: "A" },
    { searchOrder: 1, pointerAddress: 0x049f, label: "B" },
    { searchOrder: 2, pointerAddress: 0x0dc0, label: "C" },
  ];
  const entries = [];
  for (const table of tables) {
    for (let pointerAddress = table.pointerAddress, index = 0; ; pointerAddress += 2, index++) {
      const entryAddress = dataSlice(module25, pointerAddress, pointerAddress + 2).readUInt16LE(0);
      if (entryAddress === 0xffff) break;
      const raw = dataSlice(module25, entryAddress, entryAddress + 5);
      let end = MODULE25_DATA_BASE + entryAddress + 5;
      while (end < module25.length && module25[end] !== 0x24) end++;
      assert(end < module25.length, `portrait metadata DS:${entryAddress.toString(16)} lacks '$'`);
      entries.push({
        table: table.label, searchOrder: table.searchOrder, tableIndex: index,
        pointerAddress: `DS:${pointerAddress.toString(16).toUpperCase().padStart(4, "0")}`,
        entryAddress: `DS:${entryAddress.toString(16).toUpperCase().padStart(4, "0")}`,
        portraitId: raw[0], nativeLayoutBytes: [...raw.subarray(1)],
        displayName: BIG5.decode(module25.subarray(MODULE25_DATA_BASE + entryAddress + 5, end)),
      });
    }
  }
  const effective = [];
  for (let portraitId = 0; portraitId < 68; portraitId++) {
    const entry = entries.find((candidate) => candidate.portraitId === portraitId);
    if (entry !== undefined) effective.push({ portraitId, ...entry });
  }
  assert.equal(effective.length, 66);
  return {
    lookupRoutine: "module25 0000:12BF/1326",
    searchOrder: tables.map((table) => `DS:${table.pointerAddress.toString(16).toUpperCase().padStart(4, "0")}`),
    rawEntryFormat: "u8 portraitId, four native layout bytes, Big5 display name, '$'",
    entries, effective,
    missingIds: [63, 67],
    missingIdBehavior: "lookup failure leaves the previous metadata/name pointer in place; HU/HD still loads D/<id>. SAY/74 intentionally alternates D/56 and metadata-less D/67, so D/67 inherits D/56's placement/name while changing the art frame.",
  };
}

function corpusSummary(dialogues, stageEvents) {
  const commandCounts = {}, backgroundIds = new Set(), portraitIds = new Set(), commandScriptRecords = [];
  let actionCount = 0, textActionCount = 0;
  for (const record of dialogues) {
    actionCount += record.actions.length;
    const commands = record.actions.filter((action) => action.command !== undefined);
    if (commands.length > 0) commandScriptRecords.push(record.record);
    for (const action of record.actions) {
      if (action.command !== undefined) commandCounts[action.command] = (commandCounts[action.command] ?? 0) + 1;
      if (action.op === "text") textActionCount++;
      if (action.backgroundId !== undefined) backgroundIds.add(action.backgroundId);
      if (action.op === "show_portrait") portraitIds.add(action.portraitId);
    }
  }
  const storyInvocations = stageEvents.module25CampaignStory.stageStoryRecords.filter((entry) => entry.record !== null).map((entry) => entry.record);
  const storyRecords = [...new Set(storyInvocations)].sort((a, b) => a - b);
  const battleRecords = [...new Set(stageEvents.module29BattleRuntime.handlerBehaviorCatalog.dialogueRecordIds)].sort((a, b) => a - b);
  const known = new Set([...storyRecords, ...battleRecords]);
  return {
    recordCount: dialogues.length, actionCount, textActionCount,
    commandActionCount: Object.values(commandCounts).reduce((sum, count) => sum + count, 0),
    commandCounts: Object.fromEntries(Object.entries(commandCounts).sort()),
    commandScriptRecordCount: commandScriptRecords.length,
    textOrLabelOnlyRecordCount: dialogues.length - commandScriptRecords.length,
    module25StoryInvocations: storyInvocations.length, module25UniqueStoryRecords: storyRecords,
    module29HandlerDialogueRecords: battleRecords,
    overlap: storyRecords.filter((record) => battleRecords.includes(record)),
    commandScriptsOutsideTheseTwoClosedRoutes: commandScriptRecords.filter((record) => !known.has(record)),
    backgroundIds: [...backgroundIds].sort((a, b) => a - b),
    portraitIds: [...portraitIds].sort((a, b) => a - b),
  };
}

function audioEntry(manifest, record) {
  const entry = manifest.entries.find((candidate) => candidate.group === "MAGIC" && candidate.record === record);
  assert.equal(entry?.kind, "softstar_rix", `missing MAGIC/${record} RIX`);
  return {
    key: `MAGIC/${record}`, source: entry.source, sourceBytes: entry.sourceBytes,
    sourceSha256: entry.sourceSha256, decodedOutput: entry.output,
    durationSeconds: entry.durationSeconds, sampleRate: entry.sampleRate, channels: entry.channels,
  };
}

function voiceAudioEntry(manifest, record) {
  const entry = manifest.entries.find((candidate) => candidate.group === "MAGIC" && candidate.record === record);
  assert.equal(entry?.kind, "creative_voice", `missing MAGIC/${record} Creative Voice clip`);
  return {
    key: `MAGIC/${record}`, source: entry.source, sourceBytes: entry.sourceBytes,
    sourceSha256: entry.sourceSha256, decodedOutput: entry.output,
    durationSeconds: entry.durationSeconds, sampleRate: entry.sampleRate, channels: entry.channels,
  };
}

/**
 * The portrait compositor (`0000:0B98` in module 25, `0000:BBEC` in module 29) draws
 * two colour-0 layers around the A/18 art. Both modules carry a byte-identical
 * descriptor block: an outline-column descriptor `{x, y, width, height, colourIndex}`
 * whose x/y the caller rewrites per column, followed by a `{bytesPerRow, rows}` header
 * and the 1bpp mask that `0000:248E`/`0000:E84C` clocks into the VGA bit-mask register.
 */
function portraitCompositorLayers(module25, module29) {
  const blocks = [
    { module: 25, outlineAddress: "DS:02EF", shadowAddress: "DS:02F9", bytes: dataSlice(module25, 0x02ef, 0x03dd) },
    {
      module: 29,
      outlineAddress: "DS:837A",
      shadowAddress: "DS:8384",
      bytes: module29.subarray(MODULE29_DATA_BASE + 0x837a, MODULE29_DATA_BASE + 0x8468),
    },
  ];
  const [primary, secondary] = blocks;
  assert.equal(
    sha256(primary.bytes),
    sha256(secondary.bytes),
    "the two interpreters no longer share one outline/shadow descriptor block",
  );
  const block = primary.bytes;
  // `+0`/`+2` are the per-call x/y the compositor writes before each 0000:16B2 fill.
  const outlineSize = [block.readUInt16LE(4), block.readUInt16LE(6)];
  const outlineColourIndex = block[8];
  assert.deepEqual(outlineSize, [1, 147], "outline column geometry changed");
  assert.equal(outlineColourIndex, 0, "outline columns are no longer drawn in colour 0");
  const bytesPerRow = block.readUInt16LE(10);
  const rows = block.readUInt16LE(12);
  assert.deepEqual([bytesPerRow, rows], [14, 8], "shadow tile geometry changed");
  // Even rows keep the even pixel of every byte, odd rows the odd pixel, so the
  // dither is phase-locked to screen coordinates rather than to the tile.
  const rowMasks = Array.from({ length: rows }, (_, row) => {
    const start = 14 + row * bytesPerRow;
    const slice = block.subarray(start, start + bytesPerRow);
    const value = slice[0];
    assert(slice.every((byte) => byte === value), `shadow pattern row ${row} is not a single repeated byte`);
    return value;
  });
  assert.deepEqual(
    rowMasks,
    Array.from({ length: rows }, (_, row) => (row % 2 === 0 ? 0xaa : 0x55)),
    "shadow pattern is no longer a 50% checkerboard",
  );
  return {
    shadow: {
      descriptorAddress: Object.fromEntries(blocks.map((entry) => [`module${entry.module}`, entry.shadowAddress])),
      tile: { bytesPerRow, rows, size: [bytesPerRow * 8, rows] },
      rowMaskBytes: rowMasks.map((value) => `0x${value.toString(16).toUpperCase()}`),
      colourIndex: 0,
      repeatCount: 18,
      verticalStep: rows,
      drawOffset: [8, 0],
      size: [bytesPerRow * 8, rows * 18],
      ditherRule: "colour 0 lands on every pixel whose screen x + y is even",
      blockSha256: sha256(block),
    },
    outlineColumns: {
      descriptorAddress: Object.fromEntries(blocks.map((entry) => [`module${entry.module}`, entry.outlineAddress])),
      size: outlineSize,
      colourIndex: outlineColourIndex,
      drawOffsets: [[-1, -15], [5, -15], [106, -15], [112, -15]],
      coveredByFrameArt: "the 112px top ornament and nameplate are drawn after the columns, so x+5 and x+106 only survive on row y+131",
    },
  };
}

function dialoguePortraitFrameContract(renderManifest, module25, module29) {
  const expectedAssets = [
    {
      imageIndex: 0, width: 112, height: 17, maskUsed: false,
      output: "frames/A/0018/00.png",
      sha256: "8f33d834601086262315e0cf0a2f62355d2bbc71cd6e38fff0a7f60e041a05fd",
    },
    {
      imageIndex: 1, width: 112, height: 23, maskUsed: false,
      output: "frames/A/0018/01.png",
      sha256: "a56686a5147f56125c365efce5f2f057f6ab0b98bea1ce9f0fb290e472c52163",
    },
    {
      imageIndex: 2, width: 8, height: 8, maskUsed: true,
      output: "frames/A/0018/02.png",
      sha256: "157f0052e83554f0460c0de8717cd2252036288db6fd7837d6206e85628515dd",
    },
  ];
  const entries = renderManifest.groups.windowGraphics
    .filter((entry) => entry.group === "A" && entry.record === 18);
  for (const expected of expectedAssets) {
    const entry = entries.find((candidate) => candidate.imageIndex === expected.imageIndex);
    assert.deepEqual(
      entry && {
        imageIndex: entry.imageIndex,
        width: entry.width,
        height: entry.height,
        maskUsed: entry.maskUsed,
        output: entry.output,
        sha256: entry.sha256,
      },
      expected,
      `A/18 frame ${expected.imageIndex} changed; re-audit the native portrait compositor`,
    );
  }
  const asset = (imageIndex) => {
    const entry = entries.find((candidate) => candidate.imageIndex === imageIndex);
    assert(entry, `missing A/18 frame ${imageIndex}`);
    return {
      imageIndex,
      size: [entry.width, entry.height],
      maskUsed: entry.maskUsed,
      output: entry.output,
      sha256: entry.sha256,
    };
  };
  const layers = portraitCompositorLayers(module25, module29);
  return {
    resource: "A/18",
    portraitSize: [112, 112],
    frameArtBoundsRelativeToPortrait: {
      left: 0,
      top: -15,
      rightExclusive: 115,
      bottomExclusive: 131,
    },
    // The compositor also paints an outline column at x-1 and a 112x144 dither
    // shadow that reaches x+119/y+143, so the drawn composite is wider and taller
    // than the A/18 art alone.
    compositedBoundsRelativeToPortrait: {
      left: -1,
      top: -15,
      rightExclusive: 120,
      bottomExclusive: 144,
    },
    ...layers,
    top: { ...asset(0), drawOffset: [0, -15] },
    nameplate: { ...asset(1), drawOffset: [0, 108] },
    side: {
      ...asset(2),
      leftOrigin: [0, 0],
      rightOrigin: [107, 0],
      repeatCount: 15,
      verticalStep: 8,
    },
    displayNameOrigin: [24, 111],
    textWindowImageIndices: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  };
}

function dialogueTextWindowContract(renderManifest) {
  const expectedAssets = [
    [3, 24, 24, "8a0929e44be9556fd687416646ba4103dddcc75fe1ceb6ddc072aaaa4bad878b"],
    [4, 24, 16, "8121133380c57c467f00706d9313e31b7481d2ee5fa6d85dbfbb799638c4b8bd"],
    [5, 24, 14, "eb6244cfc66a82c5560026bd0db225b4e23a5a8fe629753ab44980a22b1b348c"],
    [6, 16, 24, "59e1a0b8fc86c34f559ed5dc9e74a2691565f589bdd227ac4d14d611e73da92d"],
    [7, 16, 16, "0df6de4d6dc00ba0ad52a36596dd4da37a62378c50c338b87adf24875ed52d12"],
    [8, 16, 14, "57141f7d4a308c152a81050c809e39fb8f75b7922f1f223b053f43b72769a794"],
    [9, 32, 24, "a2bf8f50c0ee1baa5b24af8fc12ed776006640bb88d26f42f463e608c8c75983"],
    [10, 32, 16, "027c484fabbcdfa5bcb7d7e56262a3995afb628ef74367bb511b88ca5be82853"],
    [11, 32, 14, "3caf752e56b264e5cd4315ed66d250097566d3a273c4fa766d29b03af444ec94"],
  ];
  const entries = renderManifest.groups.windowGraphics
    .filter((entry) => entry.group === "A" && entry.record === 18);
  const assets = expectedAssets.map(([imageIndex, width, height, expectedSha256]) => {
    const entry = entries.find((candidate) => candidate.imageIndex === imageIndex);
    assert(entry, `missing A/18 dialogue-window frame ${imageIndex}`);
    assert.deepEqual(
      [entry.width, entry.height, entry.maskUsed, entry.sha256],
      [width, height, true, expectedSha256],
      `A/18 frame ${imageIndex} changed; re-audit the native text-window compositor`,
    );
    return {
      imageIndex,
      size: [width, height],
      maskUsed: true,
      output: entry.output,
      sha256: entry.sha256,
    };
  });
  const composite = renderManifest.dialogueWindowComposite;
  assert.deepEqual([composite.width, composite.height], [400, 86]);
  assert.deepEqual(composite.nativeAssembly, {
    iterations: 11,
    initialX: [313, 337, 345, 361],
    perIterationDeltaX: [-16, -16, 16, 16],
    finalDrawBounds: [153, 0, 553, 86],
    middleRowsY: [24, 40, 56],
    bottomY: 72,
    edgeStrips: {
      width: 56,
      height: 100,
      byteGranularity: 8,
      leftOffsetFromLeftOuter: -17,
      rightOffsetFromRightInner: 7,
      backgroundRestore: { descriptors: ["DS:03FD", "DS:041D"], sourceY: 200, targetY: 0 },
      visiblePublish: { descriptors: ["DS:040D", "DS:042D"], sourceY: 0, targetY: 2 },
    },
  });
  return {
    resource: "A/18",
    imageIndices: assets,
    composite: {
      size: [composite.width, composite.height],
      output: composite.output,
      sha256: composite.sha256,
      ...composite.nativeAssembly,
    },
    textInset: [12, 12],
    module25Anchors: { upper: [153, 2], lower: [97, 260] },
    module29Anchors: { upper: [153, 10], lower: [97, 250] },
    portraitFrameGaps: {
      module25: { upper: 30, lower: 15 },
      module29: { upper: 6, lower: 7 },
    },
  };
}

async function extract(module25Path, module29Path, stageEventsPath, audioManifestPath, dialogueDirectory, renderRoot, outputPath) {
  const [module25, module29, stageEventsBuffer, audioBuffer, dialogues, renderBuffer] = await Promise.all([
    readFile(module25Path), readFile(module29Path), readFile(stageEventsPath), readFile(audioManifestPath),
    loadDialogues(dialogueDirectory), readFile(path.join(renderRoot, "manifest.json")),
  ]);
  const stageEvents = JSON.parse(stageEventsBuffer), audioManifest = JSON.parse(audioBuffer), renderManifest = JSON.parse(renderBuffer);
  const signatures = verifySignatures(module25, module29);
  const corpus = corpusSummary(dialogues, stageEvents);
  assert.equal(corpus.commandScriptRecordCount, 93);
  assert.deepEqual(corpus.commandScriptsOutsideTheseTwoClosedRoutes, [69, 116, 117, 118]);
  const globalReachabilityAudit = auditGlobalDialogueReachability(module29, corpus, dialogues);
  assert.equal(renderManifest.renderedImages, 97);
  assert.equal(renderManifest.contactSheets.length, 4);
  const dialoguePortraitFrame = dialoguePortraitFrameContract(renderManifest, module25, module29);
  const dialogueTextWindow = dialogueTextWindowContract(renderManifest);
  const paletteBytes = dataSlice(module25, 0x0de6, 0x0e16);
  const selectedMagic = stageEvents.module25CampaignStory.stageMagicRecords.entries.filter((entry) => entry.selected);
  const musicRecords = [...new Set(selectedMagic.map((entry) => entry.magicRecord))].sort((a, b) => a - b);
  assert.deepEqual(musicRecords, [72, 73, 74, 75, 76, 77, 78, 79]);

  const result = {
    format: "ANGEL2 module-25/module-29 story presentation rules",
    phase: "asset_and_gdd_reconstruction_only", implementationFrozen: true,
    sources: {
      module25: { path: module25Path, bytes: module25.length, sha256: sha256(module25) },
      module29: { path: module29Path, bytes: module29.length, sha256: sha256(module29) },
      stageEvents: { path: stageEventsPath, bytes: stageEventsBuffer.length, sha256: sha256(stageEventsBuffer) },
      audioManifest: { path: audioManifestPath, bytes: audioBuffer.length, sha256: sha256(audioBuffer) },
      dialogueDirectory, renderManifest: { path: path.join(renderRoot, "manifest.json"), bytes: renderBuffer.length, sha256: sha256(renderBuffer) },
    },
    verifiedCodeSignatures: signatures.code, verifiedDataSignatures: signatures.data,
    dialoguePortraitFrame,
    dialogueTextWindow,
    commandDispatch: {
      module25: { interpreter: "0000:0736", dispatcher: "0000:07C7", recognizedFormalCommands: 15 },
      module29: { interpreter: "0000:BE14", dispatcher: "0000:BEC3", recognizedFormalCommands: 16 },
      syntaxOnly: { command: ";;", effect: "skip through CRLF comment" },
      matrix: COMMAND_MATRIX,
      correctedFindings: {
        CW: "not recognized by either native dispatcher; preserve as a no-op",
        DL: "recognized only by module 29; decimal argument is passed directly to the native tick wait",
        "W-": "loads A/18 story-window graphics and does not deselect the active window",
        BK: "backs up framebuffer/page state; behavior is mode-specific rather than an abstract scene marker",
        ME: "stores the decimal id only; HU/HD independently parse their own id and perform D-resource loading",
      },
    },
    module25StoryMode: {
      entry: "0000:05F2", scriptInterpreter: "0000:0736", dispatcher: "0000:07C7",
      sequence: [
        "select stage MAGIC record from DS:0F88 and start MAGIC/72..79 through the RIX driver",
        "if DS:0E16[stage] is -1, return without loading a story triplet or issuing the local RIX stop",
        "otherwise load the same record from SAY(index 7), NUM(index 9), and CHA(index 10)",
        "load A/20, initialize both framebuffer pages, fade DS:0DE6 in with 64 DAC writes, then interpret SAY",
        "after ED/return, issue the RIX stop operation",
      ],
      palette: { address: "DS:0DE6", raw: [...paletteBytes], colors: dacPalette(paletteBytes), sha256: sha256(paletteBytes) },
      text: { initialOrigin: [172, 210], asciiAdvance: 8, big5Advance: 16, lineAdvance: 20, normalGlyphWaitNativeTicks: 8, skips: ["CR", "LF"] },
      windows: {
        upper: { frameAnchor: [153, 2], frameSize: [400, 86], textOrigin: [165, 14], firstOpenAnimationSteps: 11, closeAnimationSteps: 12 },
        lower: { frameAnchor: [97, 260], frameSize: [400, 86], textOrigin: [109, 272], firstOpenAnimationSteps: 11, closeAnimationSteps: 12 },
      },
      portraits: { upperAnchor: [8, 18], lowerAnchor: [512, 210], resource: "D/<id>" },
      background: { resource: "BK/<id>", drawAt: [160, 80], dimensions: [320, 200] },
      wait: { KY: "unbounded until action/quit state", DL: "unsupported" },
    },
    module29BattleStoryMode: {
      wrapper: "0000:BAB8", loader: "0000:BAC6", scriptInterpreter: "0000:BE14", dispatcher: "0000:BEC3",
      overlayRule: "story draws over the battle viewport; ED at C172 reloads the map tileset and redraws minimap, overlays, unit HUD, and viewport",
      resources: ["SAY/<record>", "NUM/<record>", "CHA/<record>", "A/18", "D/<id>", "BK/<id>"],
      text: {
        initialOrigin: [172, 210], asciiAdvance: 8, big5Advance: 16, lineAdvance: 20,
        normalGlyphWaitNativeTicks: 8, skips: ["CR", "LF", "TAB"],
        speech: {
          visibleSetting: "說話", gateAddress: "DS:10EB bit 0",
          selectionRule: "for each non-punctuation Big5 glyph, choose MAGIC/(57 + numeric Big5 code modulo 15), request it, and wait for playback completion before the 8-tick glyph delay",
          excludedBig5Punctuation: ["，", "．", "？", "！", "「", "」"],
          asciiVoice: false,
          primaryFastForward: "suppresses both remaining speech requests and remaining 8-tick waits",
        },
      },
      windows: {
        upper: { frameAnchor: [153, 10], frameSize: [400, 86], textOrigin: [165, 22], firstOpenAnimationSteps: 11, closeAnimationSteps: 12 },
        lower: { frameAnchor: [97, 250], frameSize: [400, 86], textOrigin: [109, 262], firstOpenAnimationSteps: 11, closeAnimationSteps: 12 },
      },
      portraits: { upperAnchor: [32, 26], lowerAnchor: [504, 200], resource: "D/<id>" },
      background: { resource: "BK/<id>", drawAt: [160, 80], dimensions: [320, 200] },
      wait: {
        KY: "unbounded when BAB8 sets battle-SAY mode Y; alternate non-battle mode auto-returns after 21 one-tick iterations",
        DL: "exactly the parsed count of native timer ticks; the released nominal duration is 10.000151 ms per tick",
      },
    },
    corpus,
    globalReachabilityAudit,
    portraitMetadata: parsePortraitMetadata(module25),
    resourceCatalog: {
      storyUi: [
        { key: "A/18", role: "window-frame pieces loaded by W-", renderedImages: 12 },
        { key: "A/20", role: "common story initialization/portrait-clear tile", renderedImages: 1, parserNote: "requires native single-pointer handling rather than the generic monotonic directory assumption" },
      ],
      backgrounds: corpus.backgroundIds.map((record) => `BK/${record}`),
      portraits: { container: "D", recordsPresent: 68, directlyReferencedIds: corpus.portraitIds, renderedRecordCount: 68 },
      dialogueTriplets: { module25Records: corpus.module25UniqueStoryRecords, module29Records: corpus.module29HandlerDialogueRecords, resources: ["SAY", "NUM", "CHA"] },
      stageMusicSelection: selectedMagic,
      audio: musicRecords.map((record) => audioEntry(audioManifest, record)),
      battleSpeechAudio: Array.from({ length: 15 }, (_, index) => voiceAudioEntry(audioManifest, 57 + index)),
      paletteCorrectRenders: renderManifest,
    },
    closure: {
      commandDispatchClosed: true, CWNoopConfirmed: true, DLNativeTickUnitClosed: true,
      module25StoryTimelineClosed: true, module29BattleStoryTimelineClosed: true,
      windowGeometryAndAnimationClosed: true, glyphPacingClosedInNativeTicks: true,
      module29PerCharacterSpeechClosed: true,
      backgroundAndPortraitResourceBindingsClosed: true, portraitMetadataLookupClosed: true,
      allReleasedDialogueSelectorProducersClosed: true,
      archiveOnlyCommandScripts: globalReachabilityAudit.unreachableCommandScripts,
      codeSignatureCount: signatures.code.length, dataSignatureCount: signatures.data.length,
      renderedImageCount: renderManifest.renderedImages, contactSheetCount: renderManifest.contactSheets.length,
    },
    evidenceBoundary: {
      confirmed: "two command dispatchers, recognized/no-op command set, resource ids, draw anchors, window/text geometry, animation step counts, per-glyph/DL native ticks, module-29 Big5 per-character speech selection, stage music mapping, story palette, portrait metadata and battle-map restoration",
      preservedUnknown: "low-level VGA copy primitive names; the released nominal native timer tick is 10.000151 ms",
      archiveOnly: "command scripts 69/116/117/118 have no module-25 stage-table entry or module-29 DS:80B5 producer in the released runtime",
      implementation: "frozen until phase-1 GDD review passes",
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`extracted story presentations: ${signatures.code.length} code signatures, ${signatures.data.length} data signatures, 17 corpus commands, 97 rendered resources`);
  return result;
}

function usage() {
  return [
    "usage:",
    "  angel2-story-presentations.mjs --render MODULE25 DECODED_ROOT DIALOGUE_DIR RENDER_ROOT",
    "  angel2-story-presentations.mjs --extract MODULE25 MODULE29 STAGE_EVENTS AUDIO_MANIFEST DIALOGUE_DIR RENDER_ROOT OUTPUT_JSON",
  ].join("\n");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--render" && args.length === 4) return render(...args);
  if (command === "--extract" && args.length === 7) return extract(...args);
  throw new Error(usage());
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}

export { COMMAND_MATRIX, extract, parsePortraitMetadata, render, verifySignatures };
