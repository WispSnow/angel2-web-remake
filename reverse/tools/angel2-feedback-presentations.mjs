#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MODULE27_DATA_BASE = 0x95a0;
const MODULE29_DATA_BASE = 0x1eba0;
const BIG5 = new TextDecoder("big5", { fatal: true });
const SPEECH_PUNCTUATION_CODES = new Set([0xa141, 0xa144, 0xa148, 0xa149, 0xa175, 0xa176]);

const CODE_SIGNATURES = Object.freeze({
  27: [
    ["0000:0301", 0x0301, 0x0348, "resolve the shared MF overlay-parent descriptor through INT 62h", "f339a40d6d85bf3b69cd5ff59a21563e896d7f67a8d9facf3b3255d685db5600"],
    ["0000:041E", 0x041e, 0x043b, "import four shared sound switches from parent descriptor slot +12h into DS:0002..0005", "cff9a291dcb202b89dd0c54a88130639de2f8fc548d75ff6bde500806f1035f2"],
    ["0000:0073", 0x0073, 0x0084, "load MAGIC/81 into the deployment module key-sound segment", "e1bf8d7624887a08851c41ba29172f39d19614b1e3b3962d8512e0a4a03e3b4c"],
    ["0000:052E", 0x052e, 0x056e, "module-27 gated VOC request wrapper", "349155d1c7c67f581056eee2cfdc7a7cc8164434b667f44ba9d67045dda14c14"],
    ["0000:0E63", 0x0e63, 0x0ed2, "deployment error selection, presentation, wait, restore, and dismissal sound", "0fff449108c9bea229e4cf96c6e8dc906c53a7e419f69fbe2ba731fa49c84039"],
    ["0000:1A1A", 0x1a1a, 0x1aa6, "module-27 solid-rectangle renderer", "48f5ce9f9da2b0be7fd333c16056ed158920074ff0b1723a6cac995ac204e62e"],
    ["0000:271C", 0x271c, 0x2883, "module-27 ASCII/Big5 text renderer", "cdd23c8d99f5c5a0cb643709e1430b01ea54388b58f1e49ada8b5e0072b234c3"],
  ],
  29: [
    ["0000:0054", 0x0054, 0x006b, "load MAGIC/81 into the battle module key-sound segment", "f403359a1bd3174b523980f78f3ba64a44d819f865f59c9d056cda31db121b2a"],
    ["0000:023E", 0x023e, 0x0295, "speech-setting gate, VOC request, and completion wait", "bc2f2388764136d67937b64d5cd8917a861de592ff6bb6582429a83979e0f97b"],
    ["0000:02E4", 0x02e4, 0x0341, "outcome and contextual-line configurators", "0d5a0f9b8245148bd1a47f2ba48ac850ad88f44b86a0a909f869d295a8fafcf5"],
    ["0000:03D8", 0x03d8, 0x045b, "generic battle feedback wrapper and A/18 load", "072b194fbee53579a8275fb0bb612d8f490c0ee3c65400b717547d3adc9a283d"],
    ["0000:04EF", 0x04ef, 0x053b, "upper/lower contextual battle-line renderer", "b0e191f9b2695141f36c49b563146df9830ab89319f85260266064ea8c5b8e0e"],
    ["0000:053B", 0x053b, 0x057f, "retreat confirmation and same-stage redeployment route", "f70e87279d53740ae342bb02e35572b29e4daaec0e335039ddb04bbd5fe0f418"],
    ["0000:057F", 0x057f, 0x05b8, "defeat acknowledgement and same-stage redeployment route", "09a07fc2a36240bedffffeec364260630a9e9dd5c7b5a2d7db5b7ced837d4076"],
    ["0000:05B8", 0x05b8, 0x05ef, "common Nia upper-window outcome renderer", "c37d81c7707723afb8a2c17289991804babd6e22a22a8121525b190103f86392"],
    ["0000:05EF", 0x05ef, 0x0627, "quit confirmation and battle-loop result flag", "17fc9c279d555a64b8cfe47eaf7cd667ee7e236a4d2ac1181aa316f4842410d0"],
    ["0000:0627", 0x0627, 0x0693, "victory portrait selection, confirmation, and optional numbered save", "b9c1a2c729247b2b0332435136d906bbf48beb0853ee64cb1066b2fb18bec7da"],
    ["0000:08DD", 0x08dd, 0x09d8, "outcome text renderer, pacing, and per-character speech selection", "15a94965323be315648390377048d14f56fa30dd7bfa3f570992c7d6e7848ceb"],
    ["0000:3326", 0x3326, 0x340f, "numbered save/load selector wrappers and empty-load rejection", "8d41c7fa96a196bbc70c0804feca8cb6d2a748b0cb867db36df7b89f2d40ddbd"],
    ["0000:3410", 0x3410, 0x36b0, "five-slot selector construction and row rendering", "a9fc4fec9c72ae4d41154bad7fe4d37f6b8e967af9eb7ee910354d3174d450b5"],
    ["0000:36B0", 0x36b0, 0x3889, "five-slot selector input, wraparound, and key sounds", "edd516ae46a9d960423fd5a08892a0c38a0a212c43476a4db44e5af4540b6f10"],
    ["0000:4A74", 0x4a74, 0x4ab8, "ordinary victory exclusions and defeat routing", "568d60209ec6ef39a2bd5ff4871801eca73bedf22c7022b343df02d9dafd524a"],
    ["0000:5651", 0x5651, 0x5789, "generic row menu input and confirmation result", "09478e9038a593a09166a91347ddd650a67dbc6712a43442e47b11cf9fb00f86"],
    ["0000:6DB8", 0x6db8, 0x6dc5, "retreat system-menu call site", "1f6847d3fbd31029293a5a61e1fcd004be602e7a0ff6b6426527ea2dffb60344"],
    ["0000:B9D2", 0xb9d2, 0xb9df, "quit system-menu call site", "85092de80f53ed94d64f4a4b15c70bdb441fa98dbc2ab54903803cb5687d81de"],
    ["0000:C9B9", 0xc9b9, 0xcac3, "preload MAGIC/57..71 when the visible speech switch is enabled", "ba453a6ad03ab1b4869eb1f61a540de5de8a4d069630dd4f8cdd9635adb0a6f6"],
    ["0000:D3B6", 0xd3b6, 0xd3ca, "native timer-tick wait", "ef8980cdb5273fe909fe895de992e715f8015717ba89504015fad4e347a2995c"],
    ["0000:EA04", 0xea04, 0xead4, "Big5 glyph lookup and speech-index modulo calculation", "a9ea626c500c821315fa64c26299e52681b788c2f268a9de6dc8c6709a81c9dd"],
    ["1000:03D1", 0x103d1, 0x10423, "resolve the shared MF overlay-parent descriptor through INT 62h", "2000d06b0bddea919ea2534d6ca797f150b093b16e638226de166cbe5f640844"],
    ["1000:0520", 0x10520, 0x1053d, "import four shared sound switches from parent descriptor slot +12h into DS:10EB..10EE", "44ec0939cace4429b8904c76e108bbf926f938756fe8a0a1bc5028eb995d6a3b"],
  ],
});

const DATA_SIGNATURES = Object.freeze({
  27: [
    ["DS:0F1B-0F5E", 0x0f1b, 0x0f5e, "deployment error strings including one unused duplicate", "959f9911097f5f068f256af6b84d56862ce8ec72a15a78db21faef8398c96d9d"],
    ["DS:0F5E-0F7C", 0x0f5e, 0x0f7c, "three prompt rectangle descriptors", "bfa0c7b8eb91585c7d9f17bc6d2a3228273408a6bd277165287a44154ce816ee"],
  ],
  29: [
    ["DS:059F-06A2", 0x059f, 0x06a2, "fixed collapse, victory, retreat, defeat, and quit strings", "6391bc26fcbc79797818bdd828ca4f6f9af60222231a2120d7ce94bb086f04c3"],
    ["DS:1B97-1C20", 0x1b97, 0x1c20, "numbered save/load selector labels and header", "70bf266e3bb480eeee89b04867da4f8ccd6dbfb704fda51b4b752296db476933"],
    ["DS:3F2C-3F36", 0x3f2c, 0x3f36, "confirm/cancel menu table", "9183e7bdf1b5f501b97fdc337cd18fad2eea2dbb3499e0f23f2f0dde59b8a9d1"],
    ["DS:4475-4483", 0x4475, 0x4483, "confirm/cancel visible labels", "9f8d9b4ac2f1d1592c8cc9f2fc7912fe4ea9adef67e743d5115c0183506b1a93"],
  ],
});

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function dataSlice(buffer, module, start, end) {
  const base = module === 27 ? MODULE27_DATA_BASE : MODULE29_DATA_BASE;
  return buffer.subarray(base + start, base + end);
}

function verifySignatures(module27, module29) {
  const code = [], data = [];
  for (const [module, buffer] of [[27, module27], [29, module29]]) {
    for (const [address, start, end, role, expected] of CODE_SIGNATURES[module]) {
      const bytes = buffer.subarray(start, end);
      assert.equal(sha256(bytes), expected, `module ${module} ${address}: code signature mismatch`);
      code.push({ module, address, fileOffset: start, bytes: bytes.length, role, sha256: expected });
    }
    for (const [address, start, end, role, expected] of DATA_SIGNATURES[module]) {
      const bytes = dataSlice(buffer, module, start, end);
      assert.equal(sha256(bytes), expected, `module ${module} ${address}: data signature mismatch`);
      data.push({
        module, address,
        fileOffset: (module === 27 ? MODULE27_DATA_BASE : MODULE29_DATA_BASE) + start,
        bytes: bytes.length, role, sha256: expected,
      });
    }
  }
  return { code, data };
}

function directNearCallers(buffer, target, start = 0, end = 0x10000) {
  const callers = [];
  for (let offset = start; offset + 2 < Math.min(end, buffer.length); offset += 1) {
    if (buffer[offset] !== 0xe8) continue;
    if (((offset + 3 + buffer.readInt16LE(offset + 1)) & 0xffff) === target) callers.push(offset);
  }
  return callers;
}

function directFarCallers(buffer, target, segment) {
  const callers = [];
  for (let offset = 0; offset + 4 < buffer.length; offset += 1) {
    if (
      buffer[offset] === 0x9a &&
      buffer.readUInt16LE(offset + 1) === target &&
      buffer.readUInt16LE(offset + 3) === segment
    ) callers.push(offset);
  }
  return callers;
}

function byteSequenceOffsets(buffer, sequence) {
  const offsets = [];
  for (let cursor = 0; cursor < buffer.length;) {
    const offset = buffer.indexOf(sequence, cursor);
    if (offset < 0) break;
    offsets.push(offset);
    cursor = offset + 1;
  }
  return offsets;
}

function auditFeedbackConfiguratorCallers(module29) {
  const expected = new Map([
    [0x02e4, [0x4a9d]],
    [0x02f4, []],
    [0x0304, [0xc9b5]],
    [0x0311, [0x6dc1]],
    [0x0321, [0x4aad]],
    [0x0331, [0xb9db]],
  ]);
  const configurators = [];
  for (const [target, expectedCallers] of expected) {
    const nearCallers = directNearCallers(module29, target);
    assert.deepEqual(nearCallers, expectedCallers, `unexpected near callers for ${target.toString(16)}`);
    const farCallers = directFarCallers(module29, target, 0);
    assert.deepEqual(farCallers, [], `unexpected far callers for ${target.toString(16)}`);
    configurators.push({
      target: `0000:${target.toString(16).toUpperCase().padStart(4, "0")}`,
      nearCallers: nearCallers.map((offset) => `0000:${offset.toString(16).toUpperCase().padStart(4, "0")}`),
      farCallers,
    });
  }
  const fixedCollapseWordReferences = byteSequenceOffsets(module29, Buffer.from([0xf4, 0x02]));
  const fixedCollapseFarPointers = byteSequenceOffsets(module29, Buffer.from([0xf4, 0x02, 0x00, 0x00]));
  assert.deepEqual(fixedCollapseWordReferences, []);
  assert.deepEqual(fixedCollapseFarPointers, []);
  return {
    scannedFirstCodeSegmentBytes: Math.min(module29.length, 0x10000),
    scannedWholeRuntimeBytesForFarCallsAndPointers: module29.length,
    configurators,
    fixedCollapse: {
      target: "0000:02F4",
      directNearCallers: [],
      directFarCallers: [],
      encodedOffsetWordReferences: fixedCollapseWordReferences,
      encodedFarPointerReferences: fixedCollapseFarPointers,
      disposition: "unreachable released-runtime archive; preserve DS:059F text but do not schedule it in ordinary or stage-specific feedback",
    },
  };
}

function auditSharedSoundSwitchImport(module27, module29, soundPanel) {
  const module27Import = module27.subarray(0x041e, 0x043b);
  const module29Import = module29.subarray(0x10520, 0x1053d);
  assert.deepEqual([...module27Import], [
    0x1e, 0xb8, 0x5a, 0x09, 0x8e, 0xc0, 0xbf, 0x02, 0x00,
    0x8b, 0x36, 0x2c, 0x00, 0x83, 0xc6, 0x12, 0xa1, 0x2a, 0x00,
    0x8e, 0xd8, 0x8b, 0x34, 0xb9, 0x04, 0x00, 0xf3, 0xa4, 0x1f,
  ]);
  assert.deepEqual([...module29Import], [
    0x1e, 0xb8, 0xba, 0x1e, 0x8e, 0xc0, 0xbf, 0xeb, 0x10,
    0x8b, 0x36, 0xc4, 0x00, 0x83, 0xc6, 0x12, 0xa1, 0xc2, 0x00,
    0x8e, 0xd8, 0x8b, 0x34, 0xb9, 0x04, 0x00, 0xf3, 0xa4, 0x1f,
  ]);
  assert.deepEqual([...module27.subarray(0x052e, 0x0535)], [0xf6, 0x06, 0x05, 0x00, 0x01, 0x74, 0x03]);

  const visibleEntries = soundPanel.entries.map((entry) => ({
    label: entry.label.text,
    valueAddress: entry.valueAddress,
  }));
  assert.deepEqual(visibleEntries, [
    { label: "說話", valueAddress: "1EBA:10EB" },
    { label: "移動", valueAddress: "1EBA:10EC" },
    { label: "戰鬥", valueAddress: "1EBA:10ED" },
    { label: "按鍵", valueAddress: "1EBA:10EE" },
  ]);

  const bindings = visibleEntries.map((entry, index) => ({
    index,
    label: entry.label,
    battleAddress: entry.valueAddress,
    deploymentAddress: `095A:${(0x0002 + index).toString(16).toUpperCase().padStart(4, "0")}`,
  }));
  return {
    parentDescriptor: "the MF descriptor returned through INT 62h",
    sharedPointerSlot: "+0x12",
    bytesCopied: 4,
    module29Destination: "1EBA:10EB..10EE",
    module27Destination: "095A:0002..0005",
    bindings,
    module27Gate: {
      address: "095A:0005 bit 0",
      visibleSetting: bindings[3],
      consumer: "0000:052E gated VOC request wrapper",
    },
    closure: "both modules dereference the same parent descriptor slot and preserve byte order; the fourth deployment byte is therefore the visible 按鍵 switch",
  };
}

function dollarString(buffer, module, address) {
  const base = module === 27 ? MODULE27_DATA_BASE : MODULE29_DATA_BASE;
  let end = base + address;
  while (end < buffer.length && buffer[end] !== 0x24) end++;
  assert(end < buffer.length, `module ${module} DS:${address.toString(16)} lacks '$' terminator`);
  const bytes = buffer.subarray(base + address, end);
  return { text: BIG5.decode(bytes), big5Hex: bytes.toString("hex").toUpperCase(), bytes: bytes.length };
}

function parseGlyphEvents(bytes) {
  const events = [];
  for (let offset = 0; offset < bytes.length;) {
    const first = bytes[offset];
    if (first <= 0x7f) {
      const character = String.fromCharCode(first);
      events.push({ offset, character, kind: character === "|" ? "line_break" : "ascii", voiceRecord: null });
      offset++;
      continue;
    }
    assert(offset + 1 < bytes.length, `truncated Big5 at byte ${offset}`);
    const second = bytes[offset + 1], big5Code = (first << 8) | second;
    const character = BIG5.decode(bytes.subarray(offset, offset + 2));
    const voiceRecord = SPEECH_PUNCTUATION_CODES.has(big5Code) ? null : 57 + (big5Code % 15);
    events.push({
      offset, character, kind: "big5", big5Code: `0x${big5Code.toString(16).toUpperCase()}`,
      speechIndex: voiceRecord === null ? null : big5Code % 15, voiceRecord,
      voiceSuppressedReason: voiceRecord === null ? "native punctuation exclusion" : null,
    });
    offset += 2;
  }
  return events;
}

function prompt(module29, address) {
  const value = dollarString(module29, 29, address);
  const bytes = Buffer.from(value.big5Hex, "hex");
  const glyphEvents = parseGlyphEvents(bytes);
  const voiceCounts = {};
  for (const event of glyphEvents) if (event.voiceRecord !== null) {
    voiceCounts[event.voiceRecord] = (voiceCounts[event.voiceRecord] ?? 0) + 1;
  }
  return {
    address: `DS:${address.toString(16).toUpperCase().padStart(4, "0")}`,
    ...value, glyphEvents,
    counts: {
      visibleGlyphs: glyphEvents.filter((event) => event.kind !== "line_break").length,
      lineBreaks: glyphEvents.filter((event) => event.kind === "line_break").length,
      voicedBig5Glyphs: glyphEvents.filter((event) => event.voiceRecord !== null).length,
      punctuationSuppressedBig5Glyphs: glyphEvents.filter((event) =>
        event.kind === "big5" && event.voiceSuppressedReason !== null).length,
    },
    voiceRecordCounts: Object.fromEntries(Object.entries(voiceCounts).map(([key, count]) => [`MAGIC/${key}`, count])),
  };
}

function audioEntry(audioManifest, record) {
  const entry = audioManifest.entries.find((candidate) => candidate.group === "MAGIC" && candidate.record === record);
  assert.equal(entry?.kind, "creative_voice", `missing MAGIC/${record} Creative Voice entry`);
  return {
    key: `MAGIC/${record}`, record, source: entry.source, sourceBytes: entry.sourceBytes,
    sourceSha256: entry.sourceSha256, decodedOutput: entry.output, codec: entry.codec,
    sampleRate: entry.sampleRate, channels: entry.channels, durationSeconds: entry.durationSeconds,
  };
}

function renderedFrame(storyRenders, group, record, imageIndex = 0) {
  const groupName = group === "D" ? "portraits" : "windowGraphics";
  const frame = storyRenders.groups[groupName].find((candidate) =>
    candidate.group === group && candidate.record === record && candidate.imageIndex === imageIndex);
  assert(frame !== undefined, `missing rendered ${group}/${record}/${imageIndex}`);
  return {
    key: `${group}/${record}`, imageIndex, width: frame.width, height: frame.height,
    maskUsed: frame.maskUsed, output: frame.output, pngSha256: frame.sha256,
    sourcePlanesSha256: frame.sourcePlanesSha256,
  };
}

async function extract(module27Path, module29Path, un39Path, un40Path, audioManifestPath,
  inputUiPath, storyRenderManifestPath, outputPath) {
  const [module27, module29, un39, un40, audioBuffer, inputUiBuffer, storyBuffer] = await Promise.all([
    readFile(module27Path), readFile(module29Path), readFile(un39Path), readFile(un40Path),
    readFile(audioManifestPath), readFile(inputUiPath), readFile(storyRenderManifestPath),
  ]);
  assert.equal(sha256(module27), "498d0d9c4609317bf3177ed07985053d0b23bc5b5cbae22f553c079b8a868e60");
  assert.equal(sha256(module29), "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4");
  assert.equal(sha256(un39), "d81901271d6ad0cbefbc83e38225e089eff0ffd484675fbe0153abf20d3cc495");
  assert.equal(sha256(un40), "7ff2d909aeb251438baa48be7593423937fb99d6de3d25053a79fbc843c87826");
  const audioManifest = JSON.parse(audioBuffer), inputUi = JSON.parse(inputUiBuffer), storyRenders = JSON.parse(storyBuffer);
  const signatures = verifySignatures(module27, module29);
  const configuratorCallAudit = auditFeedbackConfiguratorCallers(module29);

  let glyphCodeBytes = 0;
  while (glyphCodeBytes + 1 < un39.length && un39.readUInt16LE(glyphCodeBytes) !== 0) glyphCodeBytes += 2;
  const glyphCodes = Array.from({ length: glyphCodeBytes / 2 }, (_, index) =>
    (un39[index * 2] << 8) | un39[index * 2 + 1]);
  assert.equal(glyphCodes.length, 95);
  assert.equal(un40.length, glyphCodes.length * 30);

  const deploymentDefinitions = [
    { id: "empty_roster_slot", address: 0x0f1b, branch: "0000:0E63", trigger: "selected roster pointer is null" },
    { id: "deployment_full", address: 0x0f27, branch: "0000:0E6D", trigger: "adding a unit finds no remaining 0xFF deployment cell" },
    { id: "deployment_full_duplicate", address: 0x0f35, branch: null, trigger: "byte-identical archived duplicate; no confirmed branch references it" },
    { id: "fixed_unit_required", address: 0x0f43, branch: "0000:0E77", trigger: "attempted removal is prohibited by the unit's fixed-deployment state" },
  ];
  const deploymentMessages = deploymentDefinitions.map((definition) => {
    const value = dollarString(module27, 27, definition.address);
    const events = parseGlyphEvents(Buffer.from(value.big5Hex, "hex"));
    const fontGlyphs = events.filter((event) => event.kind === "big5").map((event) => {
      const code = Number.parseInt(event.big5Code.slice(2), 16), glyphIndex = glyphCodes.indexOf(code);
      assert(glyphIndex >= 0, `${definition.id}: glyph ${event.character} is absent from UN/39`);
      return { character: event.character, big5Code: event.big5Code, glyphIndex, un40ByteOffset: glyphIndex * 30 };
    });
    return {
      id: definition.id, address: `DS:${definition.address.toString(16).toUpperCase().padStart(4, "0")}`,
      branch: definition.branch, trigger: definition.trigger, reachable: definition.branch !== null,
      ...value, fontGlyphs,
    };
  });
  assert.equal(deploymentMessages[1].big5Hex, deploymentMessages[2].big5Hex);

  const rectangles = [0x0f5e, 0x0f68, 0x0f72].map((address) => {
    const bytes = dataSlice(module27, 27, address, address + 10);
    return {
      address: `DS:${address.toString(16).toUpperCase()}`,
      x: bytes.readUInt16LE(0), y: bytes.readUInt16LE(2), width: bytes.readUInt16LE(4),
      height: bytes.readUInt16LE(6), color: bytes.readUInt16LE(8),
    };
  });
  assert.deepEqual(rectangles.map(({ x, y, width, height, color }) => ({ x, y, width, height, color })), [
    { x: 2, y: 328, width: 636, height: 20, color: 0 },
    { x: 3, y: 329, width: 635, height: 19, color: 15 },
    { x: 3, y: 329, width: 634, height: 18, color: 7 },
  ]);

  const prompts = {
    fixedCollapse: prompt(module29, 0x059f), victory: prompt(module29, 0x05c5),
    retreat: prompt(module29, 0x05f1), defeat: prompt(module29, 0x062d), quit: prompt(module29, 0x066b),
  };
  assert.equal(prompts.victory.text, "哦！．．|這次的戰役結束了，是否要記錄下來．");
  assert.equal(prompts.retreat.text, "哦！．．．要撤退嗎？|必竟是沒辦法的事，雙方的實力差太多了．");
  assert.equal(prompts.defeat.text, "啊！．．．竟然失敗了？|我太低辜敵人的實力，再給我一次機會吧！");
  assert.equal(prompts.quit.text, "唉啊！．．．要休息了嗎？|請再考慮一下吧！");

  const soundPanel = inputUi.sidePanel.settingsPanels.find((panel) => panel.id === "soundEffects");
  assert(soundPanel !== undefined, "missing soundEffects settings panel");
  const sharedSoundSwitchImport = auditSharedSoundSwitchImport(module27, module29, soundPanel);
  const speechSetting = soundPanel.entries.find((entry) => entry.label.text === "說話");
  const keySetting = soundPanel.entries.find((entry) => entry.label.text === "按鍵");
  assert.equal(speechSetting.valueAddress, "1EBA:10EB");
  assert.equal(keySetting.valueAddress, "1EBA:10EE");
  const confirmMenu = inputUi.menus.confirmation;
  assert.deepEqual(confirmMenu.entries.map((entry) => [entry.label.text, entry.actionCode]), [["確 定 ", "SY"], ["取 消 ", "X"]]);

  const saveTitle = dollarString(module29, 29, 0x1bc8);
  const loadTitle = dollarString(module29, 29, 0x1bbb);
  const selectorHeader = dollarString(module29, 29, 0x1bd5);
  const speechAudio = Array.from({ length: 15 }, (_, index) => audioEntry(audioManifest, 57 + index));
  const keyAudio = audioEntry(audioManifest, 81);

  const result = {
    format: "ANGEL2 deployment-error and battle-outcome presentation rules",
    semanticVersion: 2, phase: "asset_and_gdd_reconstruction_only", implementationFrozen: true,
    sources: {
      module27: { path: module27Path, bytes: module27.length, sha256: sha256(module27) },
      module29: { path: module29Path, bytes: module29.length, sha256: sha256(module29) },
      deploymentFontCodes: { path: un39Path, bytes: un39.length, sha256: sha256(un39) },
      deploymentFontGlyphs: { path: un40Path, bytes: un40.length, sha256: sha256(un40) },
      audioManifest: { path: audioManifestPath, bytes: audioBuffer.length, sha256: sha256(audioBuffer) },
      inputUi: { path: inputUiPath, bytes: inputUiBuffer.length, sha256: sha256(inputUiBuffer) },
      storyRenderManifest: { path: storyRenderManifestPath, bytes: storyBuffer.length, sha256: sha256(storyBuffer) },
    },
    verifiedCodeSignatures: signatures.code, verifiedDataSignatures: signatures.data,
    deploymentErrorFeedback: {
      entry: "0000:0E81", messages: deploymentMessages,
      presentation: {
        immediateDraw: true, textOrigin: [160, 330], asciiAdvance: 8, big5Advance: 16,
        lineAdvance: 20, perGlyphWaitNativeTicks: 0, rectangles,
        sequence: [
          "draw the three nested rectangles in colors 0, 15, and 7",
          "draw the selected '$'-terminated message immediately through the module-27 ASCII/Big5 renderer",
          "clear primary input and wait without timeout until a fresh primary action",
          "erase the strip by redrawing the outer 636x20 rectangle in color 7",
          "request MAGIC/81 through the module-27 local bit-0 sound gate, then clear primary input",
        ],
        dismissal: { accepted: ["fresh primary action"], rejected: ["secondary action"], autoTimeout: false },
      },
      font: {
        codeResource: "UN/39", glyphResource: "UN/40", glyphCount: glyphCodes.length,
        glyphSize: [16, 15], bytesPerGlyph: 30,
        allReachableMessageGlyphsResolved: deploymentMessages.filter((entry) => entry.reachable)
          .every((entry) => entry.fontGlyphs.every((glyph) => glyph.glyphIndex >= 0)),
      },
      dismissalAudio: {
        ...keyAudio, requestPoint: "0000:0EC6 -> 0000:052E", nativeGate: "module27 DS:0005 bit 0",
        userFacingGateBinding: sharedSoundSwitchImport.module27Gate.visibleSetting,
        sharedSoundSwitchImport,
        evidenceBoundary: "closed by the byte-preserving module-27/module-29 imports from the same MF parent descriptor slot +12h",
      },
    },
    battleFeedbackWrapper: {
      configuratorCallAudit,
      configuratorTable: [
        { address: "0000:02E4", kind: "victory", textAddress: "DS:05C5", callback: "0000:0627", directFirstSegmentCaller: "0000:4A9D" },
        { address: "0000:02F4", kind: "fixedCollapse", textAddress: "DS:059F", callback: "0000:04EF", directFirstSegmentCaller: null, reachability: "unreachable released-runtime archive" },
        { address: "0000:0304", kind: "contextualBattleLine", textAddress: "caller-supplied AX", callback: "0000:04EF", directFirstSegmentCaller: "0000:C9B5" },
        { address: "0000:0311", kind: "retreat", textAddress: "DS:05F1", callback: "0000:053B", directFirstSegmentCaller: "0000:6DC1" },
        { address: "0000:0321", kind: "defeat", textAddress: "DS:062D", callback: "0000:057F", directFirstSegmentCaller: "0000:4AAD" },
        { address: "0000:0331", kind: "quit", textAddress: "DS:066B", callback: "0000:05EF", directFirstSegmentCaller: "0000:B9DB" },
      ],
      entry: "0000:03D8", pointerTarget: [320, 200], resources: ["A/18", "D/45", "D/46", "MAGIC/57..71", "MAGIC/81"],
      sequence: [
        "prepare battle framebuffer/page state and set the pointer target to (320,200)",
        "if the visible 說話 switch is enabled, load MAGIC/57..71 as a 15-clip speech bank",
        "load and expand A/18, then invoke the configured presentation callback",
        "restore the battle tileset, viewport/minimap/HUD layers and page state",
        "clear both primary and secondary input flags before returning",
      ],
      windowResource: {
        key: "A/18", frameCount: 12,
        frames: Array.from({ length: 12 }, (_, index) => renderedFrame(storyRenders, "A", 18, index)),
      },
    },
    outcomeText: {
      prompts,
      geometry: {
        portraitAnchor: [32, 26], upperWindowTextOriginOverride: [180, 30],
        asciiAdvance: 8, big5Advance: 16, lineAdvance: 20,
      },
      pacingAndSkip: {
        normalVisibleGlyphWaitNativeTicks: 8,
        Big5VoiceOrder: "draw glyph; for a non-excluded Big5 character request its selected VOC and wait for playback completion; then wait 8 native ticks",
        primaryDuringTyping: "fast-forwards all remaining glyphs, suppressing both their speech requests and 8-tick waits",
        secondaryDuringTyping: "does not fast-forward",
        postTypingFreshAction: "handlers clear input before their confirmation or acknowledgement phase, so the fast-forward press cannot also dismiss/select",
      },
      speech: {
        visibleSetting: speechSetting, gateAddress: "DS:10EB bit 0", preload: "0000:C9B9",
        selectionRule: "for each non-punctuation Big5 glyph: speechIndex = numeric Big5 code modulo 15; request MAGIC/(57 + speechIndex)",
        excludedBig5Punctuation: [...SPEECH_PUNCTUATION_CODES].map((code) => ({
          big5Code: `0x${code.toString(16).toUpperCase()}`,
          character: BIG5.decode(Buffer.from([code >> 8, code & 0xff])),
        })),
        asciiVoice: false, waitsForEachRequestedClipToFinish: true, clips: speechAudio,
      },
      portraits: {
        D45: { nativeRole: "victory alternate selected by PIT channel-0 bit 0", ...renderedFrame(storyRenders, "D", 45) },
        D46: { nativeRole: "Nia; retreat, defeat, quit, and the other victory alternate", ...renderedFrame(storyRenders, "D", 46) },
        victorySelection: "read port 0x40, mask bit 0, and choose D/45 or D/46; the result is timing-dependent",
      },
    },
    handlers: {
      victory: {
        entry: "0000:0627", prompt: "victory", portraits: [45, 46], nextUi: "confirmCancel",
        confirm: "open the five-slot save selector, immediately invoke the save writer for the selected slot, then redraw",
        cancel: "continue without saving",
        ordinaryPromptExcludedStages: [21, 37, 38, 42],
        loadedCompletionSentinel: { value: 1000, effect: "skip repeated ordinary victory/save prompt" },
      },
      retreat: {
        entry: "0000:053B", prompt: "retreat", portrait: 46, nextUi: "confirmCancel",
        confirm: "set next module to 27 and next stage to the current stage, returning to deployment",
        cancel: "resume the current battle",
      },
      defeat: {
        entry: "0000:057F", prompt: "defeat", portrait: 46, nextUi: "fresh-primary acknowledgement only",
        accepted: ["fresh primary action"], rejected: ["secondary action"], autoTimeout: false,
        result: "set next module to 27 and next stage to the current stage, returning to deployment",
      },
      quit: {
        entry: "0000:05EF", prompt: "quit", portrait: 46, nextUi: "confirmCancel",
        confirm: "set battle-loop result Q; the main loop routes to module 0",
        cancel: "resume the current battle",
      },
      fixedCollapse: {
        entry: "0000:04EF", prompt: "fixedCollapse", reachability: "no near caller in the first code segment, no direct far caller, and no encoded 02F4h word/far pointer anywhere in the runtime image; preserve as unreachable archive",
      },
    },
    menus: {
      confirmation: {
        ...confirmMenu, genericMenuEntry: "0000:5651", inputLoop: "0000:5721",
        keyboard: "up/down wrap; primary selects; secondary returns X",
        mouse: "row hover/primary selection through generated 136x24 hitboxes",
        keyAudio: {
          visibleSetting: keySetting, gateAddress: "DS:10EE bit 0", ...keyAudio,
          primarySelectionSound: true, secondaryCancelSoundInGenericConfirmation: false,
        },
      },
      numberedSaveSelector: {
        entry: "0000:3326", pointerTarget: [384, 110], slots: 5,
        saveTitle: { address: "DS:1BC8", ...saveTitle },
        loadTitle: { address: "DS:1BBB", ...loadTitle },
        header: { address: "DS:1BD5", ...selectorHeader },
        selection: "up/down wrap across five rows; primary returns ASCII 0..4; secondary returns X",
        saveEmptySlotRule: "all five rows are selectable; save mode skips the load-mode XX empty-slot rejection",
        overwriteConfirmation: false,
        keyAudioOn: ["up", "down", "primary selection", "secondary cancel"],
      },
    },
    closure: {
      deploymentErrorStringsClosed: true, deploymentErrorGeometryClosed: true,
      deploymentErrorInputAndAudioBoundaryClosed: true, outcomeStringsClosed: true,
      outcomeWindowPortraitAndResourceBindingsClosed: true, outcomeGlyphPacingClosedInNativeTicks: true,
      perCharacterSpeechSelectionClosed: true, victoryRetreatDefeatQuitStateRoutesClosed: true,
      confirmationMenuClosed: true, numberedSaveSelectorClosed: true,
      fixedCollapseReachabilityClosed: true,
      module27KeySoundVisibleBindingClosed: true,
      codeSignatureCount: signatures.code.length, dataSignatureCount: signatures.data.length,
    },
    evidenceBoundary: {
      confirmed: "reachable deployment messages and prompt strip; ordinary victory/retreat/defeat/quit strings, portraits, window reuse, per-glyph timing and speech selection, input rules, save offer, and state routes",
      preservedUnknown: "physical timer/emulator scheduling jitter and low-level drawing primitive names; the released nominal tick duration and module-27 key-sound binding are closed",
      archiveOnly: "DS:059F fixed-collapse line is retained as unreachable released-runtime content",
      implementation: "frozen until phase-1 GDD review passes",
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`extracted feedback presentations: ${signatures.code.length} code signatures, ${signatures.data.length} data signatures, 4 reachable prompts, 16 VOC resources`);
  return result;
}

function usage() {
  return "usage: angel2-feedback-presentations.mjs --extract MODULE27 MODULE29 UN39 UN40 AUDIO_MANIFEST INPUT_UI STORY_RENDER_MANIFEST OUTPUT_JSON";
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--extract" && args.length === 8) return extract(...args);
  throw new Error(usage());
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}

export { extract, parseGlyphEvents, verifySignatures };
