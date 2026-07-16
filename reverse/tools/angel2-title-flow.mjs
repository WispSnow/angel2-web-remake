#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE23_DATA_BASE = 0x9920;
const GO_CODE_SEGMENT = 0x1000;
const GO_DATA_SEGMENT = 0x146a;
const BIG5 = new TextDecoder("big5", { fatal: true });

const VERIFIED_RANGES = [
  { source: "go", address: "1000:0000", start: 0x0200, end: 0x0279, role: "initialize the loader, run WK_EXE overlays until zero, then release resources", sha256: "9608ccee042b83c09c08855e0aad41fa8c7225a07c62a81c9192d770bdb2af96" },
  { source: "go", address: "146A:0040-006B", start: 0x48e0, end: 0x490c, role: "initial shared overlay state containing JUST_DAT, FM_DATA, WK_EXE, CONTINU, LV_HARD, SAVE_NUM, MIMA_NUM, and KILL_ALL", sha256: "b44140bb0f7f7836079452190a89e8b28ce51d49567c7cb8263e3835ad76d6e2" },
  { source: "module23", address: "0000:0000-010C", start: 0x0000, end: 0x010d, role: "module-23 entry, A/23 and A/24 loads, title flow invocation, and parent-state exports", sha256: "0b18be0cf0423654c03c3761a864ae4a6da62e6c01e8f372697cd42befa75653" },
  { source: "module23", address: "0000:00A3-00CF", start: 0x00a3, end: 0x00d0, role: "export local next-module, continue-slot, and difficulty words to shared parent offsets", sha256: "545d222768220a46096a9db2f559cde39800cda89d820738c8567609477d73eb" },
  { source: "module23", address: "0000:0480", start: 0x0480, end: 0x059f, role: "title main loop and new-game versus continue-game routing", sha256: "a805f5b15df0c4d8b7ca3def7c6b3f0b16e7a092131fca4ef940b1627296d478" },
  { source: "module23", address: "0000:059F", start: 0x059f, end: 0x0611, role: "four-option difficulty selection loop", sha256: "dd1cc29ae02bb3a7ec7c1d1f1ed60d4d56c466f0e89bebff744589f5404da2cf" },
  { source: "module23", address: "0000:0611-070A", start: 0x0611, end: 0x070b, role: "load title-menu presentation records from BK and MUSIC", sha256: "fc36e883ea4a46887e9ec542f366f5c4d52a42ad5a9322a269cbae4775b1fa35" },
  { source: "module23", address: "0000:0CE2-0D2E", start: 0x0ce2, end: 0x0d2f, role: "load and present the pre-title UN/53 record", sha256: "fb0a4009150444a36ade0ba8ae2c7cb2d1c42b87f988236e2aa8b36845f916db" },
  { source: "module23", address: "0000:1034-117C", start: 0x1034, end: 0x117d, role: "load and run the intro presentation from MUSIC/14, BK/41, and A/25", sha256: "59bf7da6e376c6d9274261675e440eeb5dd18c2ad5950ad886b08988522ad889" },
  { source: "module23", address: "0000:1455", start: 0x1455, end: 0x14e5, role: "build and run the numbered continue-slot selector", sha256: "9405731b9a7bdfa77d15188165060f4010b5a2672ee4e4dae4b70984da2ce34e" },
  { source: "module23", address: "0000:14E5", start: 0x14e5, end: 0x152f, role: "reject empty continue slots and return ASCII 0..4 or X", sha256: "df466d6ecc2e0d3257de81f4c12f5f3a4abfc5f01d4934cda62d1f837e89839c" },
  { source: "module23", address: "0000:16C7", start: 0x16c7, end: 0x17ad, role: "scan and render five WAR save-slot rows", sha256: "7456bb78168fd05b9a0d4404dabcac93a4d1070097d6749a431c2caa86ffedd4" },
  { source: "module23", address: "0000:17AD", start: 0x17ad, end: 0x1820, role: "draw slot metadata and normalize invalid saved difficulty values to zero", sha256: "0486556b5602fca24d26c4069f0f914d3853dc5d2c1bcb6b4e7390c81f4cea9e" },
  { source: "module23", address: "0000:183D", start: 0x183d, end: 0x189e, role: "handle five-slot pointer selection, confirm, and cancel", sha256: "99e58b54c637958b29611d519f976228c6e8db88f7fd22a9f66d6c4da986a108" },
  { source: "module23", address: "0000:19F2", start: 0x19f2, end: 0x1a47, role: "initialize the two-option title menu with option zero selected", sha256: "832a60b0f27774170e8be6d4bc11be6e64bea06183344828f5d6ccb5d24106bf" },
  { source: "module23", address: "0000:1A47", start: 0x1a47, end: 0x1a91, role: "handle title-menu hover and primary confirmation", sha256: "7fbb5df0874bec83b790f0a1d6ecf3a58c74554923d5729d9d74a02cfd8b0095" },
  { source: "module23", address: "0000:1AEE-1B4C", start: 0x1aee, end: 0x1b4d, role: "wrap title-menu keyboard navigation between options zero and one", sha256: "579c6555233b82b21af37564aecbb523e77f6a1e7c259df2c590e4a5a74c0d30" },
  { source: "module23", address: "0000:1B7E", start: 0x1b7e, end: 0x1bd3, role: "initialize the four-option difficulty menu with option zero selected", sha256: "54081fcefbfd5d1d8f9a5170060a91894fed4a1800882d446c31d7fc57b674ca" },
  { source: "module23", address: "0000:1BD3", start: 0x1bd3, end: 0x1c23, role: "commit the selected difficulty index to local DS:0000", sha256: "2e77bbb5a469eb52b7bc7a2e347b51f78c70625cd721273618486953ad7a2c0d" },
  { source: "module23", address: "0000:1C23", start: 0x1c23, end: 0x1c80, role: "draw all four native difficulty labels", sha256: "daf68e672a82602aea4af9b257c2f6c0c241ca394d183aea94a1749a80eca3d0" },
  { source: "module23", address: "0000:1C80-1D0F", start: 0x1c80, end: 0x1d10, role: "wrap difficulty keyboard navigation over indices zero through three and update the pointer", sha256: "f928fe9572d2086d29384baa420fd72ba657a27a2e0708a85ca133282729e778" },
  { source: "module23", address: "0000:3C70-3D0F", start: 0x3c70, end: 0x3d10, role: "open WAR0.TST through WAR4.TST, read 50-byte headers, and populate five metadata arrays", sha256: "69c79f85d78a8790277001fab4dcddd5f78648a618c1c41af389c8a5c2977830" },
  { source: "module23", address: "DS:0BAA-0BFB", start: 0xa4ca, end: 0xa51c, role: "title-menu string pointers, Big5 labels, and two pointer hitboxes", sha256: "d0b2fb99d8f48b5420dbe9f48afffa3308c24def9836036206604b64539f3f43" },
  { source: "module23", address: "DS:0D00-0D7B", start: 0xa620, end: 0xa69c, role: "difficulty string pointers, Big5 labels, and four pointer hitboxes", sha256: "6c158f125b32a211f539389fcaf97e2fde890a19003a82854f6f4ecd118b75c4" },
  { source: "module23", address: "DS:0A35-0A79", start: 0xa355, end: 0xa39a, role: "load/save titles and the five exact continue-slot metadata column labels", sha256: "9b51d39c95b0e735b30136f39a2df901aae74d279272fdfe996c9f076e133aec" },
  { source: "module23", address: "DS:0B00-0B33", start: 0xa420, end: 0xa454, role: "save-slot difficulty-label pointer table and duplicate Big5 labels", sha256: "7a9364018368b5451754dd0c2fa1289348b4641635943fae5ea32a1d99bd9131" },
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

function verifyRanges(sources) {
  return VERIFIED_RANGES.map((range) => {
    const bytes = sources[range.source].subarray(range.start, range.end);
    assert(bytes.length === range.end - range.start, `${range.address}: range outside source`);
    const actual = sha256(bytes);
    assert(actual === range.sha256, `${range.address}: title-flow code/data signature mismatch`);
    return {
      source: range.source,
      address: range.address,
      fileOffset: range.start,
      bytes: bytes.length,
      role: range.role,
      sha256: actual,
    };
  });
}

function module23Linear(dsOffset, bytes = 1) {
  const offset = MODULE23_DATA_BASE + dsOffset;
  assert(offset >= 0 && offset + bytes <= 0xf020, `module23 DS:${hex(dsOffset).slice(2)} outside image`);
  return offset;
}

function decodeDollarString(module23, dsOffset) {
  const start = module23Linear(dsOffset);
  let end = start;
  while (end < module23.length && module23[end] !== 0x24) end++;
  assert(end < module23.length, `module23 DS:${hex(dsOffset).slice(2)} missing '$' terminator`);
  const raw = module23.subarray(start, end);
  return {
    dsOffset,
    address: `DS:${hex(dsOffset).slice(2)}`,
    text: BIG5.decode(raw),
    big5Hex: raw.toString("hex").toUpperCase(),
  };
}

function parseStringPointerTable(module23, dsOffset, expectedCount) {
  const entries = [];
  for (let index = 0; ; index++) {
    const pointer = module23.readUInt16LE(module23Linear(dsOffset + index * 2, 2));
    if (pointer === 0xffff) break;
    entries.push({ index, ...decodeDollarString(module23, pointer) });
  }
  assert(entries.length === expectedCount, `DS:${hex(dsOffset).slice(2)} expected ${expectedCount} strings`);
  return entries;
}

function parseHitboxes(module23, dsOffset, expectedCount) {
  const entries = [];
  for (let index = 0; ; index++) {
    const offset = module23Linear(dsOffset + index * 10, 2);
    const x = module23.readUInt16LE(offset);
    if (x === 0xffff) break;
    entries.push({
      index,
      x,
      y: module23.readUInt16LE(offset + 2),
      width: module23.readUInt16LE(offset + 4),
      height: module23.readUInt16LE(offset + 6),
      value: module23.readUInt16LE(offset + 8),
    });
  }
  assert(entries.length === expectedCount, `DS:${hex(dsOffset).slice(2)} expected ${expectedCount} hitboxes`);
  return entries;
}

function parseGlyphCodeRecord(codeRecord, glyphRecord) {
  assert(codeRecord.length % 2 === 0, "A/23 code record must contain Big5 pairs");
  const glyphs = [];
  let offset = 0;
  while (offset + 1 < codeRecord.length) {
    const lead = codeRecord[offset];
    const trail = codeRecord[offset + 1];
    if (lead === 0 && trail === 0) break;
    const raw = codeRecord.subarray(offset, offset + 2);
    glyphs.push({
      index: glyphs.length,
      char: BIG5.decode(raw),
      big5Hex: raw.toString("hex").toUpperCase(),
    });
    offset += 2;
  }
  assert(offset + 2 === codeRecord.length, "A/23 must end in one 0000 pair");
  assert(glyphRecord.length % 30 === 0, "A/24 must be a 16x15x1bpp glyph array");
  assert(glyphs.length === glyphRecord.length / 30, "A/23 code count must match A/24 glyph count");
  return {
    codeRecord: 23,
    bitmapRecord: 24,
    codeBytes: codeRecord.length,
    bitmapBytes: glyphRecord.length,
    glyphWidth: 16,
    glyphHeight: 15,
    glyphBytes: 30,
    glyphCount: glyphs.length,
    terminatorHex: "0000",
    decodedCharacterSequence: glyphs.map((entry) => entry.char).join(""),
    glyphs,
  };
}

function parseGoSharedState(go) {
  const headerBytes = go.readUInt16LE(0x08) * 16;
  const dataFileBase = headerBytes + (GO_DATA_SEGMENT - GO_CODE_SEGMENT) * 16;
  const readWord = (offset) => go.readUInt16LE(dataFileBase + offset);
  const charOrNull = (value) => value <= 0xff ? String.fromCharCode(value) : null;
  return {
    mzHeaderBytes: headerBytes,
    codeSegment: hex(GO_CODE_SEGMENT),
    dataSegment: hex(GO_DATA_SEGMENT),
    dataFileBase,
    overlayStateBase: {
      symbol: "FM_DATA",
      offset: hex(0x42),
      initialWord: hex(readWord(0x42)),
      initialBytesAscii: "MF",
    },
    initialWords: {
      JUST_DAT: { offset: hex(0x40), value: readWord(0x40) },
      WK_EXE: { offset: hex(0x4a), value: readWord(0x4a) },
      CONTINU: { offset: hex(0x5a), value: readWord(0x5a), char: charOrNull(readWord(0x5a)) },
      LV_HARD: { offset: hex(0x64), value: readWord(0x64), char: charOrNull(readWord(0x64)) },
      SAVE_NUM: { offset: hex(0x66), value: readWord(0x66) },
      MIMA_NUM: { offset: hex(0x68), value: readWord(0x68) },
      KILL_ALL: { offset: hex(0x6a), value: readWord(0x6a) },
    },
  };
}

async function extract(goPath, module23Path, codeRecordPath, glyphRecordPath, outputPath) {
  const [go, module23, codeRecord, glyphRecord] = await Promise.all([
    readFile(goPath),
    readFile(module23Path),
    readFile(codeRecordPath),
    readFile(glyphRecordPath),
  ]);

  const verifiedRanges = verifyRanges({ go, module23 });
  const mainLabels = parseStringPointerTable(module23, 0x0baa, 2);
  const difficultyLabels = parseStringPointerTable(module23, 0x0d00, 4);
  const saveDifficultyLabels = parseStringPointerTable(module23, 0x0b05, 4);
  const mainHitboxes = parseHitboxes(module23, 0x0bc6, 2);
  const difficultyHitboxes = parseHitboxes(module23, 0x0d32, 4);
  const saveSlotHitboxes = parseHitboxes(module23, 0x0abf, 5);
  const continueLoadTitle = decodeDollarString(module23, 0x0a35);
  const continueSaveTitle = decodeDollarString(module23, 0x0a42);
  const continueColumnHeader = decodeDollarString(module23, 0x0a4f);
  const glyphResource = parseGlyphCodeRecord(codeRecord, glyphRecord);
  const sharedState = parseGoSharedState(go);
  const directResourceLinks = [
    {
      consumer: "module23 entry 0000:0000-010C",
      role: "native title glyph code list and matching 16x15 bitmap glyphs",
      records: [
        { resourceIndex: 0, container: "A.SWF", record: 23, decodedKind: "Big5 code list" },
        { resourceIndex: 0, container: "A.SWF", record: 24, decodedKind: "228 fixed 30-byte 16x15 glyphs" },
      ],
    },
    {
      consumer: "module23 0000:0CE2",
      role: "pre-title presentation",
      records: [
        { resourceIndex: 13, container: "UN.SWF", record: 53, decodedKind: "five-stream package" },
      ],
    },
    {
      consumer: "module23 0000:1034",
      role: "intro presentation",
      records: [
        { resourceIndex: 8, container: "MUSIC.SWF", record: 14, decodedKind: "Softstar RIX" },
        { resourceIndex: 11, container: "BK.SWF", record: 41, decodedKind: "five-stream package" },
        { resourceIndex: 0, container: "A.SWF", record: 25, decodedKind: "five-stream package" },
      ],
    },
    {
      consumer: "module23 0000:117D/12E4",
      role: "intro background changes selected by the embedded scroll-control list",
      records: [43, 44, 45, 46, 47, 48].map((record) => ({
        resourceIndex: 11,
        container: "BK.SWF",
        record,
        decodedKind: "five-stream package",
        reachability: "referenced by native #3..#8 control entries",
      })).concat({
        resourceIndex: 11,
        container: "BK.SWF",
        record: 42,
        decodedKind: "five-stream package",
        reachability: "handler-supported #2 branch; absent from the shipped control list",
      }),
    },
    {
      consumer: "module23 0000:0611",
      role: "title-menu presentation and palette assembly",
      records: [
        { resourceIndex: 11, container: "BK.SWF", record: 40, decodedKind: "five-stream package" },
        { resourceIndex: 11, container: "BK.SWF", record: 57, decodedKind: "five-stream package" },
        { resourceIndex: 11, container: "BK.SWF", record: 51, decodedKind: "five-stream package" },
        { resourceIndex: 8, container: "MUSIC.SWF", record: 1, decodedKind: "Softstar RIX" },
        { resourceIndex: 11, container: "BK.SWF", record: 56, decodedKind: "five-stream package" },
      ],
    },
    {
      consumer: "module23 0000:07A3/07CF",
      role: "two alternating title-art variants selected by the idle-rebuild flag",
      records: [52, 53, 54, 55].map((record) => ({
        resourceIndex: 11,
        container: "BK.SWF",
        record,
        decodedKind: "five-stream package",
      })),
    },
    {
      consumer: "module23 0000:1455",
      role: "continue-slot selector construction graphic",
      records: [
        { resourceIndex: 0, container: "A.SWF", record: 6, decodedKind: "five-stream package" },
      ],
    },
  ];

  assert(mainLabels.map((entry) => entry.text).join("|") === "遊戲開始|繼續遊戲", "native title labels changed");
  assert(difficultyLabels.map((entry) => entry.text).join("|") === "過關斬將|勢均力敵|困難重重|無法無天", "native difficulty labels changed");
  assert(saveDifficultyLabels.map((entry) => entry.text).join("|") === difficultyLabels.map((entry) => entry.text).join("|"), "save and selection difficulty labels disagree");
  assert(continueLoadTitle.text === "讀取遊戲進度", "native continue load title changed");
  assert(continueSaveTitle.text === "儲存遊戲進度", "native save title changed");
  assert(continueColumnHeader.text === "        職業/等級/經驗值/儲存次數/    難度", "native continue metadata labels changed");
  assert(sharedState.initialWords.WK_EXE.value === 23, "GO must start in module 23");
  assert(sharedState.initialWords.CONTINU.char === "N", "GO CONTINU default must be N");
  assert(sharedState.initialWords.LV_HARD.char === "N", "GO LV_HARD pre-title sentinel must be N");
  assert(mainHitboxes.every((entry, index) => entry.value === index), "title hitbox values changed");
  assert(difficultyHitboxes.every((entry, index) => entry.value === index), "difficulty hitbox values changed");
  assert(saveSlotHitboxes.every((entry, index) => entry.value === index), "save-slot hitbox values changed");
  for (const label of [...mainLabels, ...difficultyLabels]) {
    for (const char of label.text) {
      assert(glyphResource.decodedCharacterSequence.includes(char), `A/23+A/24 lacks title glyph ${char}`);
    }
  }

  const result = {
    format: "ANGEL2 native title/new/continue state machine",
    semanticVersion: 3,
    sources: {
      go: { path: goPath, bytes: go.length, sha256: sha256(go) },
      module23: { path: module23Path, bytes: module23.length, sha256: sha256(module23) },
      titleGlyphCodes: { path: codeRecordPath, bytes: codeRecord.length, sha256: sha256(codeRecord) },
      titleGlyphBitmaps: { path: glyphRecordPath, bytes: glyphRecord.length, sha256: sha256(glyphRecord) },
    },
    verifiedRanges,
    sharedOverlayState: {
      ...sharedState,
      module23Exports: [
        { local: "DS:0002", parentRelativeOffset: hex(0x08), parentSymbol: "WK_EXE", meaning: "next runtime module" },
        { local: "DS:0004", parentRelativeOffset: hex(0x18), parentSymbol: "CONTINU", meaning: "N for JUST/new battle, or ASCII 0..4 for WAR slot" },
        { local: "DS:0000", parentRelativeOffset: hex(0x22), parentSymbol: "LV_HARD", meaning: "confirmed difficulty index 0..3" },
      ],
    },
    titleGlyphResource: glyphResource,
    directResourceLinks,
    titleMenu: {
      module: 23,
      nativeHandler: "0000:0480",
      options: mainLabels.map((label, index) => ({
        index,
        label: label.text,
        default: index === 0,
        hitbox: mainHitboxes[index],
      })),
      keyboardNavigation: { indices: [0, 1], wrap: true },
      pointerSelection: "hover changes the current index; primary confirmation requires the same current hitbox",
      idlePresentation: "201 unchanged menu cycles toggle the presentation flag and rebuild the title presentation; exact timing is in title-presentations.json",
    },
    difficultyMenu: {
      nativeLoop: "0000:059F",
      nativeCommitHandler: "0000:1BD3",
      options: difficultyLabels.map((label, index) => ({
        value: index,
        label: label.text,
        default: index === 0,
        hitbox: difficultyHitboxes[index],
        stage30Forms: (index + 1) * 8,
        hardEnemyStatBonus: index === 3 ? "attack, defense, and maximum life += floor(value/2)" : null,
      })),
      keyboardNavigation: { indices: [0, 1, 2, 3], wrap: true },
      confirm: "write selected index to module23 DS:0000, later exported to GO LV_HARD",
      cancel: "return to the two-option title menu without starting a game",
      saveSlotDisplayUsesSameLabels: true,
    },
    continueMenu: {
      nativeSelector: "0000:1455",
      nativeHeaderScanner: "0000:3C70",
      files: ["WAR0.TST", "WAR1.TST", "WAR2.TST", "WAR3.TST", "WAR4.TST"],
      initialHeaderReadBytes: 50,
      headerOffsetsRead: [0x12, 0x14, 0x16, 0x18, 0x1e].map((offset) => hex(offset, 2)),
      difficultyHeaderOffset: hex(0x1e, 2),
      missingFileSentinel: hex(0x5858),
      visibleText: {
        loadTitle: continueLoadTitle,
        saveTitle: continueSaveTitle,
        columnHeader: continueColumnHeader,
      },
      metadataColumns: [
        { offset: hex(0x12, 2), semanticName: "occupation", nativeLabel: "職業", x: 96, display: "two-byte ASCII class code looked up as a native occupation name" },
        { offset: hex(0x14, 2), semanticName: "level", nativeLabel: "等級", x: 160, display: "right-aligned decimal" },
        { offset: hex(0x16, 2), semanticName: "experienceValue", nativeLabel: "經驗值", x: 216, display: "right-aligned decimal" },
        { offset: hex(0x18, 2), semanticName: "saveCount", nativeLabel: "儲存次數", x: 288, display: "right-aligned decimal" },
        { offset: hex(0x1e, 2), semanticName: "difficulty", nativeLabel: "難度", x: 336, display: "one of the four native difficulty labels; invalid values normalize to index zero for display" },
      ],
      hitboxes: saveSlotHitboxes,
      keyboardNavigation: { indices: [0, 1, 2, 3, 4], default: 0, wrap: true },
      emptySlotRule: "an empty slot may be highlighted but cannot be confirmed",
      confirmResult: "ASCII '0'..'4'",
      cancelResult: "ASCII 'X' and return to title menu",
    },
    transitions: [
      {
        from: "GO startup",
        condition: "initial WK_EXE=23",
        to: "module23 title menu",
      },
      {
        from: "title option 0: 遊戲開始",
        condition: "difficulty 0..3 confirmed",
        writes: { WK_EXE: 25, CONTINU: "N", LV_HARD: "selected 0..3" },
        to: "module25 stage-story/campaign entry; initial campaign stage remains zero",
      },
      {
        from: "title option 1: 繼續遊戲",
        condition: "existing WAR slot 0..4 confirmed",
        writes: { WK_EXE: 29, CONTINU: "ASCII 0..4", LV_HARD: 0 },
        to: "module29 numbered WAR loader; saved header/body restores campaign and difficulty state",
      },
      {
        from: "any runtime module",
        condition: "exported WK_EXE=0",
        to: "GO cleanup and DOS exit",
      },
    ],
    validation: {
      verifiedRangeCount: verifiedRanges.length,
      titleOptionsClosed: mainLabels.length === 2,
      difficultyValuesAndVisibleLabelsClosed: difficultyLabels.length === 4,
      titleDefaultCursorClosed: mainLabels[0].text === "遊戲開始",
      difficultyDefaultCursorClosed: difficultyLabels[0].text === "過關斬將",
      newGameRoutingClosed: true,
      continueRoutingClosed: true,
      numberedSlotValidationClosed: true,
      exactContinueSlotMetadataLabelsClosed: true,
      titleGlyphMappingClosed: glyphResource.glyphCount === 228,
      directTitleResourceRecordsClosed: directResourceLinks.flatMap((link) => link.records).length === 23,
      exactTitleFrameAudioTimelineClosed: true,
      exactTitleFrameAudioTimelineSpec: "reverse/parsed/native/title-presentations.json",
      implementationStarted: false,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`verified ${verifiedRanges.length} title-flow ranges, ${mainLabels.length} title options, ${difficultyLabels.length} difficulty labels, and ${saveSlotHitboxes.length} continue slots to ${outputPath}\n`);
}

if (process.argv[2] !== "--extract" || process.argv.length !== 8) {
  process.stderr.write("usage: angel2-title-flow.mjs --extract GO.EXE MODULE23.bin A23.bin A24.bin OUTPUT.json\n");
  process.exit(2);
}

extract(...process.argv.slice(3)).catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(1);
});
