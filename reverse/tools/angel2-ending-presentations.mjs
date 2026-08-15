#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE_DATA_BASE = { 33: 0x86e0, 35: 0x8550, 46: 0x84f0 };
const BIG5 = new TextDecoder("big5", { fatal: true });

const VERIFIED_RANGES = [
  { module: 29, address: "0000:91F1", start: 0x91f1, end: 0x9262, role: "player primary experience award and per-slot record counter increment", sha256: "14947957f904d55bdef5ea07d6af50bde1c81e5e83488e2834644ef46d158bc5" },
  { module: 29, address: "1000:8882", start: 0x18882, end: 0x188cb, role: "save-slot metadata writer increments SAVE_NUM", sha256: "e334609e98cb68f8cc29a8fa8d809b13eb033711198d2a6424f29b8ce788498a" },
  { module: 33, address: "0000:004E", start: 0x4e, end: 0xd5, role: "load UN7/8/6 and A9 then run postgame roster", sha256: "281b98117b24737da754920160eae8c5fdbb689b7badaff0b9c146ae88d0a6c8" },
  { module: 33, address: "0000:02FA", start: 0x2fa, end: 0x3c8, role: "import class, experience, options, and record counters from parent", sha256: "c4c8ca5ba60a3b20bb33423ef02550a9d9fc86376edabd9f4e1ee6d078382e74" },
  { module: 33, address: "0000:042C", start: 0x42c, end: 0x50a, role: "load 35 DATA rows and run roster cards with advance/wait loop", sha256: "07a4c34f4481e64d68a759d43712b336a4301fb2cad16693106672c5f6e92c79" },
  { module: 33, address: "0000:0526", start: 0x526, end: 0x6c2, role: "draw one roster status card or terminate on portrait FF", sha256: "a43a2b3d864c156c288fee79c84a6b229b74290feb7201de8f39e1da9f48fa5c" },
  { module: 33, address: "0000:06C2", start: 0x6c2, end: 0x84a, role: "scroll the composed card into view, draw M_00 current-class frame 0, and render status labels", sha256: "72fa3c61bb2f6f76632d2d5f67c56222931391c2ef8655321be783462d1535b1" },
  { module: 33, address: "0000:084A", start: 0x84a, end: 0x8d6, role: "select roster unit, state, name/portrait, and record counter", sha256: "a7e32b9baef53102c4bd3be253ec14a8872c7a151c1b70d36ec0cba9d1e193a7" },
  { module: 33, address: "0000:09A7", start: 0x9a7, end: 0xa13, role: "derive class row, level, and displayed stats", sha256: "78cc492b973331f8ef16353b938f29b16287de3a9f97fc19b0c02ebfc2396df5" },
  { module: 33, address: "0000:0F34", start: 0xf34, end: 0xf4f, role: "native tick wait", sha256: "9a16e79e1c60c7edefaaf3b8fd03159ce88a534a5afc04c1e413852b6bf6f9a3" },
  { module: 33, address: "DS:02E1", start: 0x89c1, end: 0x8a2a, role: "status-card labels", sha256: "f616967d3e801445baf14524b477a5f2f3a97be7c9fb1d5f3acd8c4a80f74a6d" },
  { module: 33, address: "DS:0556", start: 0x8c36, end: 0x8f96, role: "58-entry actor descriptor pointer table and records", sha256: "b9cecd80a0f09289f12c1924ce7ce1fd7a7e15bd470e0c38c57ffb39c14ff33a" },
  { module: 35, address: "0000:004F", start: 0x4f, end: 0xd5, role: "load UN9/10, run epilogue, then route to module27 stage38", sha256: "565bae3e59df77b1038df4b8429a29f3154a8ce8d52ec56310ef045d75a35757" },
  { module: 35, address: "0000:02FA", start: 0x2fa, end: 0x3b8, role: "import classes, options, record counters, SAVE_NUM, and MIMA_NUM", sha256: "a3a980abbda2020c0c4010fe0e5d853f29239c5b3bf9b8bf22fc7ec71fbf37d6" },
  { module: 35, address: "0000:0454", start: 0x454, end: 0x529, role: "evaluate, select music and four epilogue segments", sha256: "645950cfbd1f1182a537533f7386b2965805580fb31843cd27e2db0a279a0d2e" },
  { module: 35, address: "0000:0529", start: 0x529, end: 0x72f, role: "load paired illustrations, render embedded text, and wait/skip", sha256: "94a7fb63374f34ea7dfb48d20adae89f9c384ffe192a9418548b12f201d6d2e3" },
  { module: 35, address: "0000:072F", start: 0x72f, end: 0x864, role: "count three class families and apply two 100 thresholds", sha256: "f35f8dc885aa41df2549056a44b9c10257836c3873813b2b99965054b4dd913f" },
  { module: 35, address: "DS:032E", start: 0x887e, end: 0x8a42, role: "epilogue resource, buffer, selector, and pointer tables", sha256: "c0750b539184fc35a900f73a7e67d99b09ac8b4b9e10b9e8707a76a613cebd4d" },
  { module: 35, address: "DS:04F5", start: 0x8a45, end: 0x92f6, role: "eight Big5 epilogue text blocks", sha256: "4becff5d69960fbc52c2ab829733b202c97cb72cb6e3e980199ab0e3f8ffca65" },
  { module: 46, address: "0000:0054", start: 0x54, end: 0xbf, role: "load UN9/10/55, C33, and B88", sha256: "2eb3176490c3f245d1ba5dc8043c51dcd667def4676d094236bdda493753a6fa" },
  { module: 46, address: "0000:00FE", start: 0xfe, end: 0x129, role: "call nonreturning credits before unreachable route writes", sha256: "96c3bb4188dc2aeea6aab2caac707031cbefde32d4cb7f35cf7a5f62ff277312" },
  { module: 46, address: "0000:03CE", start: 0x3ce, end: 0x44d, role: "credits sequence, fades, final screen, and terminal call", sha256: "17824db017e3cdcba392e5383d459ae28b5a63390d4f5b7bd190eec09f46b561" },
  { module: 46, address: "0000:0467", start: 0x467, end: 0x801, role: "credit frame composition, scrolling, and final animation loop", sha256: "6c39eeedac6f747d5c79cc08972304b492e81a900315ed8eaa0b7814c99c3062" },
];

const RESOURCE_EXPECTATIONS = [
  { container: "UN", record: 6, bytes: 6172, sha256: "ad9bf0700572c41ec8f5c1932cd58360496f7955ad755b81849344d32d450aae", role: "module-33 music data" },
  { container: "UN", record: 7, bytes: 260, sha256: "420d36cf2581ec59f92b3782700c2c5963af67e62c532292f1813f7a8c71966c", role: "129-entry roster Big5 glyph-code list" },
  { container: "UN", record: 8, bytes: 3870, sha256: "506accde5d0b1bf10f4f6d878c2b7289fa9181478c8fa284ce8d56c1affed6b0", role: "129 matching 16x15 glyph bitmaps" },
  { container: "UN", record: 9, bytes: 518, sha256: "a34863e90fcf74d65b0cd74d9f55d34375381676a909f7373c14562c23edf12b", role: "258-entry epilogue/credits Big5 glyph-code list" },
  { container: "UN", record: 10, bytes: 7740, sha256: "780fd8cade2c9a43e9f5759971c3227e40f6996bc13d4bab1e764f228c83a93a", role: "258 matching 16x15 glyph bitmaps" },
  { container: "UN", record: 49, bytes: 6094, sha256: "b6830661697c58e3e49803786820dd6c5afe46a810888515bf92e2660a3daf7b", role: "module-35 alternate music when record total exceeds 100" },
  { container: "UN", record: 54, bytes: 17168, sha256: "b7df9d3b9f82e66ba0f878907b81fe73be3218aa550cf88d8899dd68cf2b1478", role: "The end scene and four overlay animation frames", frameCount: 5 },
  { container: "UN", record: 55, bytes: 6262, sha256: "3b74621d21d139802b2196922d50079dc38f55a8a4c0dda47a6f05986ca83cb2", role: "module-46 credits music data" },
  { container: "A", record: 9, bytes: 169, sha256: "58cc7a6f9f6de720d606a4c930dbc5e754bc968982931ea814dc10529135046e", role: "module-33 roster backdrop" },
  { container: "B", record: 88, bytes: 39920, sha256: "ea6dd4df253f1cbaa4372990abe2d99b8297a91116796b174efac15443466def", role: "20 rendered credit-role frames", frameCount: 20 },
  { container: "C", record: 33, bytes: 46515, sha256: "91dd155f649c8e0979c2e4f7cb173e29666f9636eb528771dbf79e5d33b27b31", role: "22 rendered staff-name frames", frameCount: 22 },
  { container: "MUSIC", record: 40, bytes: 4228, sha256: "546a239d9347c1090ba1a1affe76ddffbc4344a88e06e563b6249e7c26562666", role: "module-35 normal music when record total is at most 100" },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function linear(module, dataOffset) {
  return MODULE_DATA_BASE[module] + dataOffset;
}

function readWord(moduleBuffer, module, dataOffset) {
  return moduleBuffer.readUInt16LE(linear(module, dataOffset));
}

function decodeDollarString(moduleBuffer, module, dataOffset) {
  const start = linear(module, dataOffset);
  let end = start;
  while (end < moduleBuffer.length && moduleBuffer[end] !== 0x24) end++;
  assert(end < moduleBuffer.length, `module ${module} DS:${hex(dataOffset).slice(2)} lacks a dollar terminator`);
  const raw = moduleBuffer.subarray(start, end);
  return {
    address: `DS:${hex(dataOffset).slice(2)}`,
    dataOffset,
    text: BIG5.decode(raw).replaceAll("|", "\n").replace(/ +$/gm, "").replace(/^ +/gm, "").trim(),
    big5Hex: raw.toString("hex").toUpperCase(),
  };
}

function verifyRanges(modules) {
  return VERIFIED_RANGES.map((range) => {
    const bytes = modules[range.module].subarray(range.start, range.end);
    const actual = sha256(bytes);
    assert(actual === range.sha256, `module ${range.module} ${range.address}: ending-presentation signature mismatch`);
    return { module: range.module, address: range.address, fileOffset: range.start, bytes: bytes.length, role: range.role, sha256: actual };
  });
}

function parseGlyphSet(codeRecord, bitmapRecord, codeRecordNumber, bitmapRecordNumber) {
  assert(codeRecord.length % 2 === 0, `UN/${codeRecordNumber} glyph-code length is odd`);
  const glyphs = [];
  let offset = 0;
  while (offset + 1 < codeRecord.length) {
    if (codeRecord[offset] === 0 && codeRecord[offset + 1] === 0) break;
    const raw = codeRecord.subarray(offset, offset + 2);
    glyphs.push({ index: glyphs.length, char: BIG5.decode(raw), big5Hex: raw.toString("hex").toUpperCase() });
    offset += 2;
  }
  assert(offset + 2 === codeRecord.length, `UN/${codeRecordNumber} must end in one 0000 pair`);
  assert(bitmapRecord.length === glyphs.length * 30, `UN/${bitmapRecordNumber} does not contain one 30-byte glyph per code`);
  return {
    codeRecord: codeRecordNumber,
    bitmapRecord: bitmapRecordNumber,
    glyphCount: glyphs.length,
    glyphWidth: 16,
    glyphHeight: 15,
    glyphBytes: 30,
    decodedCharacterSequence: glyphs.map((glyph) => glyph.char).join(""),
    glyphs,
  };
}

function parseRosterActors(module33) {
  const actors = [];
  for (let index = 0; index < 58; index++) {
    const descriptorOffset = readWord(module33, 33, 0x0556 + index * 2);
    const start = linear(33, descriptorOffset);
    const portraitRecord = module33[start];
    const name = decodeDollarString(module33, 33, descriptorOffset + 5);
    actors.push({
      index,
      descriptorAddress: `DS:${hex(descriptorOffset).slice(2)}`,
      portraitRecord: portraitRecord === 0xff ? null : portraitRecord,
      rawPortraitByte: hex(portraitRecord, 2),
      normalizedName: name.text.replaceAll(" ", ""),
      displayName: name.text,
      descriptorPrefixHex: module33.subarray(start, start + 5).toString("hex").toUpperCase(),
      reachable: portraitRecord !== 0xff && !actors.some((actor) => actor.rawPortraitByte === "0xFF"),
    });
  }
  const sentinelIndex = actors.findIndex((actor) => actor.rawPortraitByte === "0xFF");
  assert(sentinelIndex === 22, `module 33 expected its first FF actor sentinel at 22, got ${sentinelIndex}`);
  return {
    tableAddress: "DS:0556",
    tableEntries: actors.length,
    firstSentinelIndex: sentinelIndex,
    reachableCardCount: sentinelIndex,
    reachableActors: actors.slice(0, sentinelIndex),
    unreachableDescriptorsAfterSentinel: actors.slice(sentinelIndex),
  };
}

function parseStatusLabels(module33) {
  const fields = [
    ["name", 0x02e1],
    ["class", 0x02f0],
    ["level", 0x02ff],
    ["maximumLife", 0x030e],
    ["attack", 0x031d],
    ["defense", 0x032c],
    ["record", 0x033b],
  ].map(([id, offset]) => ({ id, ...decodeDollarString(module33, 33, offset) }));
  assert(fields.map((field) => field.text).join("|") === "姓名：|兵種：|等級：|生命：|攻擊：|防禦：|戰績：00000 人", "module 33 status labels changed");
  return fields;
}

function namesForRecords(descriptors, records) {
  return records.map((record) => ({ record, name: descriptors.records[record]?.normalizedName ?? null }));
}

function parseClassFamilyDecision(descriptors) {
  const families = [
    {
      selector: 0,
      id: "cavalry",
      endingLead: "騎兵一職",
      comparisonSequence: [22, 13, 23, 18, 16, 17, 19, 23, 15, 14],
      uniqueRecords: [13, 14, 15, 16, 17, 18, 19, 22, 23],
      nativeQuirk: "record 23 is compared twice but reaches the same single increment target, so it is not double-counted",
    },
    { selector: 1, id: "fighter", endingLead: "騎士們／戰士一職", comparisonSequence: [28, 27, 7, 1, 33, 29, 2, 9], uniqueRecords: [1, 2, 7, 9, 27, 28, 29, 33] },
    { selector: 2, id: "mage", endingLead: "法師們／法術研究", comparisonSequence: [24, 25, 30, 6, 4, 10, 3, 5, 11, 32, 31], uniqueRecords: [3, 4, 5, 6, 10, 11, 24, 25, 30, 31, 32] },
  ].map((family) => ({ ...family, classes: namesForRecords(descriptors, family.uniqueRecords) }));
  return {
    sourceArray: { parentPointerOffset: "+0x0C", goSymbol: "ME_DATA", entriesImported: 75, entriesEvaluated: 23 },
    families,
    unclassifiedOrdinaryRecords: namesForRecords(descriptors, [0, 8, 12, 20, 21, 26, 34]),
    selectionRule: "choose the largest family count",
    tieRule: "cavalry wins any tied maximum; otherwise fighter wins a fighter/mage tie; mage wins only when strictly above the competing maximum",
  };
}

function illustrationPair(resourceIndexByVariant, variant) {
  const first = resourceIndexByVariant[variant];
  return { resource: "UN.SWF", variantTableIndex: variant, records: [first, first + 1] };
}

/**
 * The closing track is chosen by the record-total selector but is loaded and
 * played at module entry, before the first of the four segments. Reading the
 * per-variant music as "segment 4 changes the music" is wrong: all four
 * segments already play over it. Byte evidence inside 0000:0454..0529:
 *
 *   0454: e8 d8 02              call 072F   ; count families, apply thresholds
 *   0457: e8 16 00              call 0470   ; pick MUSIC/40 or UN/49
 *   045A: ff 36 ab 00           push [00AB] ; the buffer 0470 just filled
 *   045E: 6a 00 6a 02 6a 01     push 0, 2, 1
 *   0464: 9a 3c 06 88 06        call far ...:063C  ; module 33 plays UN/6 with
 *                                                  ; the same 063C entry point
 *   046C: e8 2c 00              call 049B   ; only now run the four segments
 *   0470: 83 3e d2 04 01        cmp word [04D2], 1 ; record-total selector
 *   0475: 74 12                 je 0489
 *   0477: ...  b9 28 00 bb 08 00 ; cx=40 bx=MUSIC.SWF
 *   0489: ...  b9 31 00 bb 0d 00 ; cx=49 bx=UN.SWF
 */
function parseEntryMusic(module35) {
  const dispatch = module35.subarray(0x454, 0x470).toString("hex");
  assert(
    dispatch.startsWith("e8d802e81600ff36ab006a006a026a019a3c068806" + "83c408" + "e82c00"),
    "module 35 no longer selects and starts the closing music before the four segments",
  );
  const selectorProbe = module35.subarray(0x470, 0x477).toString("hex");
  assert(
    selectorProbe === "833ed2040174" + "12",
    "module 35 entry music is no longer branched on the record-total selector",
  );
  // a1 ab 00 | 8e c0 | bf 00 00 | b9 <record> | bb <resourceIndex> | e8 .. .. | c3
  const readSelection = (start) => ({
    record: module35.readUInt16LE(start + 9),
    resourceIndex: module35.readUInt16LE(start + 12),
  });
  const low = readSelection(0x477);
  const high = readSelection(0x489);
  assert(
    low.record === 40 && low.resourceIndex === 0x08 && high.record === 49 && high.resourceIndex === 0x0d,
    "module 35 entry music records changed",
  );
  return {
    startedAt: "0000:0457 selects the record, 0000:045A plays it, 0000:046C then runs the four segments",
    selector: "record-total selector at DS:04D2, the same value segment 4 uses for its text",
    playsOverSegments: "all four",
    variants: [
      { selector: 0, condition: "sum(KILL_ALL[0..74]) <= 100", resource: "MUSIC.SWF", record: low.record },
      { selector: 1, condition: "sum(KILL_ALL[0..74]) > 100", resource: "UN.SWF", record: high.record },
    ],
  };
}

function parseEpilogue(module35, descriptors) {
  const resourceIndexByVariant = Array.from({ length: 8 }, (_, index) => readWord(module35, 35, 0x032e + index * 2));
  assert(resourceIndexByVariant.join(",") === "4,13,0,17,19,11,2,15", "module 35 illustration variant table changed");
  const primaryPointers = Array.from({ length: 3 }, (_, index) => readWord(module35, 35, 0x04d4 + index * 2));
  const savePointers = Array.from({ length: 2 }, (_, index) => readWord(module35, 35, 0x04da + index * 2));
  const recordPointers = Array.from({ length: 2 }, (_, index) => readWord(module35, 35, 0x04de + index * 2));
  const variantTables = {
    primary: Array.from({ length: 3 }, (_, index) => readWord(module35, 35, 0x04e2 + index * 2)),
    save: Array.from({ length: 2 }, (_, index) => readWord(module35, 35, 0x04e8 + index * 2)),
    record: Array.from({ length: 2 }, (_, index) => readWord(module35, 35, 0x04ec + index * 2)),
  };
  assert(primaryPointers.join(",") === "1269,1577,1841", "module 35 primary text pointers changed");
  assert(savePointers.join(",") === "2246,2568" && recordPointers.join(",") === "2856,3150", "module 35 threshold text pointers changed");
  assert(variantTables.primary.join(",") === "0,1,2" && variantTables.save.join(",") === "3,4" && variantTables.record.join(",") === "7,6", "module 35 text-to-illustration variants changed");

  const familyDecision = parseClassFamilyDecision(descriptors);
  const primary = familyDecision.families.map((family, selector) => ({
    selector,
    family: family.id,
    text: decodeDollarString(module35, 35, primaryPointers[selector]),
    illustration: illustrationPair(resourceIndexByVariant, variantTables.primary[selector]),
  }));
  const fixed = {
    text: decodeDollarString(module35, 35, 0x083f),
    illustration: illustrationPair(resourceIndexByVariant, 5),
  };
  const saveCount = [
    {
      selector: 0,
      condition: "SAVE_NUM > 100",
      result: "the empress holds a new coronation and Nia follows her",
      text: decodeDollarString(module35, 35, savePointers[0]),
      illustration: illustrationPair(resourceIndexByVariant, variantTables.save[0]),
    },
    {
      selector: 1,
      condition: "SAVE_NUM <= 100",
      result: "Nia becomes the 神將官",
      text: decodeDollarString(module35, 35, savePointers[1]),
      illustration: illustrationPair(resourceIndexByVariant, variantTables.save[1]),
    },
  ];
  const recordTotal = [
    {
      selector: 0,
      condition: "sum(KILL_ALL[0..74]) <= 100",
      result: "the dynasty remains prosperous for later empresses",
      text: decodeDollarString(module35, 35, recordPointers[0]),
      illustration: illustrationPair(resourceIndexByVariant, variantTables.record[0]),
      music: { resource: "MUSIC.SWF", record: 40 },
    },
    {
      selector: 1,
      condition: "sum(KILL_ALL[0..74]) > 100",
      result: "the dynasty declines after the empress and Nia die",
      text: decodeDollarString(module35, 35, recordPointers[1]),
      illustration: illustrationPair(resourceIndexByVariant, variantTables.record[1]),
      music: { resource: "UN.SWF", record: 49 },
    },
  ];

  return {
    inputState: {
      classRecords: familyDecision.sourceArray,
      perSlotRecordCounters: {
        parentPointerOffset: "+0x1A",
        goSymbol: "KILL_ALL",
        entriesImported: 75,
        producer: "module 29 0000:9252-925D increments the initiating side-1 slot once on the ordinary primary-experience path",
        module33VisibleLabel: "戰績",
      },
      saveCount: {
        parentPointerOffset: "+0x1C -> GO DS:0066",
        goSymbol: "SAVE_NUM",
        producer: "module 29 1000:88AD-88B4 increments it immediately before writing save-slot metadata",
      },
    },
    classFamilyDecision: familyDecision,
    entryMusic: parseEntryMusic(module35),
    orderedSegments: [
      { order: 1, id: "dominantClassFamily", waitLimitNativeTicks: 0x0946, skippableByEitherAction: true, variants: primary },
      { order: 2, id: "warriorStatue", waitLimitNativeTicks: 0, skippableByEitherAction: true, variants: [fixed] },
      { order: 3, id: "saveCountOutcome", waitLimitNativeTicks: 0x08c3, skippableByEitherAction: true, variants: saveCount },
      { order: 4, id: "recordTotalOutcome", waitLimitNativeTicks: 0x09ec, skippableByEitherAction: true, musicNote: "the paired music is selected by this segment's condition but started at module entry; see entryMusic, and do not implement it as a segment-4 music change", variants: recordTotal },
    ],
    illustrationVariantTable: resourceIndexByVariant.map((record, variantTableIndex) => ({ variantTableIndex, records: [record, record + 1] })),
    exit: { nextModule: 27, nextStage: 38, purpose: "deploy the postgame otherworld rematch" },
  };
}

const CREDIT_ROLES = [
  "工作人員", "總監督", "企劃", "音樂", "程式設計", "兵種設計", "數值設定", "封面・海報",
  "美術：", "人物", "地形", "戰鬥", "過場", "戰場編排", "說明書：", "插圖", "美編", "文案", "測試", "協力",
];

const CREDIT_NAMES = [
  "李永進", "姜崇熙", "蘇泓漳", "施文鴻", "郭柄宏", "梅期皓", "楊鴻仁", "林大甲", "江志煌", "洪信智", "林珈汶",
  "謝曉慧", "蕭建宏", "卓文祺", "周勝忠", "林耀元", "劉榮華", "連谷川", "丁淑姿", "林正欣", "李佳澤", "王柏森",
];

function creditFrame(resource, frame, x, y) {
  return { resource, frame, x, y };
}

function parseCredits() {
  const B = (frame, x, y) => creditFrame("B.SWF/88", frame, x, y);
  const C = (frame, x, y) => creditFrame("C.SWF/33", frame, x, y);
  const pages = [
    [B(0, 240, 400), B(1, 80, 480), B(2, 80, 560), B(3, 80, 640), B(4, 80, 720), C(0, 400, 480), C(1, 400, 560), C(2, 400, 640), C(3, 400, 720)],
    [B(5, 80, 400), B(6, 80, 480), B(7, 80, 560), B(8, 80, 640), B(9, 80, 720), C(4, 400, 400), C(5, 400, 480), C(6, 400, 560), C(7, 400, 720)],
    [B(10, 80, 400), B(11, 80, 480), B(12, 80, 560), C(8, 400, 400), C(9, 400, 480), C(8, 400, 560), C(10, 400, 640), C(11, 400, 720)],
    [B(13, 80, 400), B(14, 80, 560), B(15, 80, 640), B(17, 80, 720), C(10, 400, 400), C(11, 400, 480), C(6, 400, 640), C(5, 400, 720)],
    [B(18, 80, 480), C(3, 400, 400), C(5, 400, 480), C(13, 400, 560), C(14, 400, 640), C(15, 400, 720)],
    [B(19, 80, 480), C(16, 400, 400), C(17, 400, 480), C(18, 400, 560), C(19, 400, 640), C(20, 400, 720)],
    [C(21, 400, 400)],
  ].map((frames, index) => ({ page: index + 1, frames }));
  return {
    roleFrames: CREDIT_ROLES.map((text, frame) => ({ frame, text, render: `reverse/renders/planar/B/0088/${frame.toString().padStart(2, "0")}.png` })),
    nameFrames: CREDIT_NAMES.map((text, frame) => ({
      frame,
      text,
      evidence: frame === 2
        ? "visual transcription; 泓/漳 radicals are legible in the native bitmap and independently corroborated by composer romanization HongZhang Su; rendered PNG remains authoritative"
        : "visual transcription; rendered PNG remains authoritative",
      render: `reverse/renders/planar/C/0033/${frame.toString().padStart(2, "0")}.png`,
    })),
    pages,
    transitionAfterPages: {
      calls: 8,
      behavior: "each call performs 400 CRTC-start-address steps; every step adds 0x50 and waits 2 native timer ticks, then the page is copied/reset",
      inputSkipCheck: false,
      note: "there are seven composed credit pages and one extra transition before the final screen",
    },
    finalScreen: {
      resource: "UN.SWF/54",
      baseFrame: { frame: 0, x: 160, y: 27, render: "reverse/renders/planar/UN/0054/00.png" },
      overlayPosition: { x: 352, y: 161 },
      outerLoop: [
        { op: "wait", nativeTicks: 1 },
        { op: "wait", nativeTicks: 400 },
        { op: "wait", nativeTicks: 1 },
        { op: "draw", frame: 1 },
        { op: "wait", nativeTicks: 10 },
        { op: "draw", frame: 2 },
        { op: "wait", nativeTicks: 80 },
        { op: "repeat", times: 10, body: [{ op: "draw", frame: 3 }, { op: "wait", nativeTicks: 10 }, { op: "draw", frame: 4 }, { op: "wait", nativeTicks: 10 }] },
        { op: "draw", frame: 2 },
        { op: "wait", nativeTicks: 10 },
        { op: "draw", frame: 1 },
        { op: "wait", nativeTicks: 10 },
      ],
      repeatsForever: true,
      inputExitCheck: false,
    },
    controlFlow: {
      terminalFunction: "module 46 0000:03CE",
      terminalReason: "it calls the infinite final-screen loop at 0000:0725; a defensive JMP 0000:0430 follows if that call ever returned",
      unreachableCode: { address: "0000:0101-0128", writes: { nextModule: 27, nextStage: 38 }, consequence: "the previously inferred replay seed cannot execute in shipped normal control flow" },
    },
  };
}

async function readResources(root) {
  const result = {};
  for (const expected of RESOURCE_EXPECTATIONS) {
    const sourcePath = path.join(root, expected.container, `${expected.record.toString().padStart(4, "0")}.bin`);
    const buffer = await readFile(sourcePath);
    const actual = sha256(buffer);
    assert(buffer.length === expected.bytes, `${sourcePath}: expected ${expected.bytes} bytes, got ${buffer.length}`);
    assert(actual === expected.sha256, `${sourcePath}: ending resource hash mismatch`);
    result[`${expected.container}/${expected.record}`] = { ...expected, path: sourcePath, sha256: actual, buffer };
  }
  return result;
}

async function extract(module29Path, module33Path, module35Path, module46Path, descriptorsPath, extractedRoot, outputPath) {
  const [module29, module33, module35, module46, descriptorBuffer, resources] = await Promise.all([
    readFile(module29Path), readFile(module33Path), readFile(module35Path), readFile(module46Path), readFile(descriptorsPath), readResources(extractedRoot),
  ]);
  const modules = { 29: module29, 33: module33, 35: module35, 46: module46 };
  const descriptors = JSON.parse(descriptorBuffer.toString("utf8"));
  assert(descriptors.recordCount === 39, "unit-descriptor input must contain 39 records");
  const verifiedCodeAndDataRanges = verifyRanges(modules);
  const rosterGlyphs = parseGlyphSet(resources["UN/7"].buffer, resources["UN/8"].buffer, 7, 8);
  const endingGlyphs = parseGlyphSet(resources["UN/9"].buffer, resources["UN/10"].buffer, 9, 10);
  assert(rosterGlyphs.glyphCount === 129 && endingGlyphs.glyphCount === 258, "ending glyph counts changed");
  const rosterActors = parseRosterActors(module33);
  const statusLabels = parseStatusLabels(module33);
  const epilogue = parseEpilogue(module35, descriptors);
  const credits = parseCredits();

  const output = {
    format: "ANGEL2 native postgame roster, conditional epilogue, credits, and terminal presentation",
    semanticVersion: 2,
    sources: [
      { module: 29, path: module29Path, bytes: module29.length, sha256: sha256(module29) },
      { module: 33, path: module33Path, bytes: module33.length, sha256: sha256(module33) },
      { module: 35, path: module35Path, bytes: module35.length, sha256: sha256(module35) },
      { module: 46, path: module46Path, bytes: module46.length, sha256: sha256(module46) },
      { kind: "unitDescriptors", path: descriptorsPath, bytes: descriptorBuffer.length, sha256: sha256(descriptorBuffer) },
    ],
    verifiedCodeAndDataRanges,
    resources: Object.values(resources).map(({ buffer, ...resource }) => resource),
    glyphSets: { roster: rosterGlyphs, epilogueAndCredits: endingGlyphs },
    postgameOrder: [
      "module33 22-card roster/status roll",
      "module35 four-segment conditional epilogue",
      "module27 stage38 deployment",
      "module29 stage38 postgame rematch",
      "module46 unskippable credits",
      "module46 permanent The end animation",
    ],
    module33RosterRoll: {
      rosterActors,
      statusLabels,
      displayedValues: [
        { label: "姓名", source: "module-33 actor descriptor name" },
        { label: "兵種", source: "current ME_DATA class record -> native descriptor name" },
        { label: "等級", source: "DATA row/growth level derived from current ME_EXP" },
        { label: "生命", source: "derived current-row maximum life" },
        { label: "攻擊", source: "derived current-row attack" },
        { label: "防禦", source: "derived current-row defense" },
        { label: "戰績", source: "KILL_ALL[presentation index]" },
      ],
      visuals: {
        background: {
          resource: "A.SWF",
          record: 9,
          nativeSize: { width: 8, height: 349 },
          composition: "repeat the 8-pixel stripe across the full 640-pixel card",
        },
        portrait: {
          resource: "D.SWF",
          record: "actor portrait byte",
          frame: 0,
          visiblePositionAfterScroll: { x: 16, y: 50 },
        },
        decorativeGraphic: {
          resource: "C.SWF",
          record: "PIT random below 31, with result 28 remapped to 29",
          frame: 0,
          visiblePositionAfterScroll: { x: 148, y: 50 },
        },
        classFullScreenGraphic: {
          resource: "M_00.SWF",
          record: "current ME_DATA class record",
          frame: 0,
          visiblePlacementAfterScroll: { horizontalCenter: 200, bottom: 186 },
          note: "module 33 loads startup resource index 5 directly; this is the current class's left-side direct full-combat frame, not a decorative C record",
        },
        statusLabelPositions: {
          name: { x: 32, y: 220 },
          class: { x: 176, y: 220 },
          level: { x: 176, y: 240 },
          maximumLife: { x: 296, y: 220 },
          attack: { x: 296, y: 240 },
          defense: { x: 296, y: 260 },
          record: { x: 476, y: 220 },
        },
        font: { codeRecord: "UN.SWF/7", bitmapRecord: "UN.SWF/8" },
        music: { resource: "UN.SWF", record: 6 },
      },
      advance: { autoAfter: { outerIterations: 200, nativeTicksPerIteration: 2, maximumNativeTicks: 400 }, earlyAdvance: "either semantic action flag", loopsUntil: "the first actor descriptor whose portrait byte is FF" },
      exit: { nextModule: 35 },
    },
    module35ConditionalEpilogue: epilogue,
    module46CreditsAndTerminalScreen: credits,
    validation: {
      verifiedRangeCount: verifiedCodeAndDataRanges.length,
      verifiedResourceCount: Object.keys(resources).length,
      rosterGlyphCount: rosterGlyphs.glyphCount,
      endingGlyphCount: endingGlyphs.glyphCount,
      reachableRosterCards: rosterActors.reachableCardCount,
      epilogueTextBlocks: epilogue.orderedSegments.reduce((sum, segment) => sum + segment.variants.length, 0),
      creditRoleFrames: credits.roleFrames.length,
      creditNameFrames: credits.nameFrames.length,
      module46NormalReturnReachable: false,
      implementationStarted: false,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`verified ${verifiedCodeAndDataRanges.length} ranges and ${Object.keys(resources).length} resources; wrote ${rosterActors.reachableCardCount} roster cards, 8 epilogue texts, and terminal credits to ${outputPath}`);
}

function usage() {
  return "usage: angel2-ending-presentations.mjs --extract MODULE29.bin MODULE33.bin MODULE35.bin MODULE46.bin UNIT_DESCRIPTORS.json EXTRACTED_ROOT OUTPUT.json";
}

const [command, module29Path, module33Path, module35Path, module46Path, descriptorsPath, extractedRoot, outputPath] = process.argv.slice(2);
if (command !== "--extract" || [module29Path, module33Path, module35Path, module46Path, descriptorsPath, extractedRoot, outputPath].some((value) => value === undefined)) {
  console.error(usage());
  process.exitCode = 1;
}
else {
  extract(module29Path, module33Path, module35Path, module46Path, descriptorsPath, extractedRoot, outputPath).catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

export { RESOURCE_EXPECTATIONS, VERIFIED_RANGES, extract };
