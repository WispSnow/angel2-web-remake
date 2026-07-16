#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PALETTES, composePlanarImage, parseBitmapBundle } from "./angel2-planar.mjs";

const GO_DATA_BASE = 0x48a0;
const MODULE21_DATA_BASE = 0x88b0;
const BIG5 = new TextDecoder("big5", { fatal: true });

const VERIFIED_RANGES = [
  { source: "go", address: "146A:0042-006B", start: 0x48e2, end: 0x490c, role: "overlay parent block containing WK_EXE, the MIMA_PASS pointer, MIMA_NUM, and related shared state", sha256: "29d3057852fee22c66ecc787e68fcebe07a20f674d49ea86d3f3a1f218a4deb2" },
  { source: "go", address: "146A:0312-0315", start: 0x4bb2, end: 0x4bb6, role: "initial MIMA_PASS count and saved-next-module words", sha256: "df3f619804a92fdb4057192dc43dd748ea778adc52bc498ce80524c014b81119" },
  { source: "module29", address: "0000:009C-00D2", start: 0x009c, end: 0x00d3, role: "run the password-gate handoff, apply the stage-6 override, and export next module/stage", sha256: "63155530fe87cdde349aafea1cdce90fdadcc9058c9261339d7bdf35462ed242" },
  { source: "module29", address: "1000:06B9-0706", start: 0x106b9, end: 0x10707, role: "on the first module-29 exit save the intended next module and substitute module 21", sha256: "5fcf2d1c3a89136c2511e00adf6fc83fa6956b0fd62bf591dec7824624955a62" },
  { source: "module21", address: "0000:00F0-0109", start: 0x00f0, end: 0x010a, role: "run password UI, advance MIMA_PASS, and export the restored next module", sha256: "5d85cdc6f64c8867a00421d003d70c4d95f3c8aacd6b5eae1250894fdc8be7f9" },
  { source: "module21", address: "0000:0428-0464", start: 0x0428, end: 0x0465, role: "increment MIMA_PASS count and restore its saved-next-module word", sha256: "6d5d066526b1d05fbc14dad0eae7995b0028d2ba67225a75d920ecd0e5ee942d" },
  { source: "module21", address: "0000:0502-068B", start: 0x0502, end: 0x068c, role: "complete three-challenge UI, confirm versus re-enter loop, and final validation dispatch", sha256: "8cbe2950f7d26d14c21e5490eab93dd90b9212dd86c0238196ec8075c78e4e07" },
  { source: "module21", address: "0000:068C-0792", start: 0x068c, end: 0x0793, role: "encode three responses in interrupt vectors 0/1/3, validate them, and enter the visible failure path", sha256: "d33f0c32b2b5307b8f457d1acbdc4c3ef96fe131162fac62219671bda2949cfb" },
  { source: "module21", address: "0000:0793-07B0", start: 0x0793, end: 0x07b1, role: "password-failure PIC reprogramming loop body", sha256: "546bfe331627c2f2491485bc4ef6bd1c4077c46499289677ab4f4b7033c3abfc" },
  { source: "module21", address: "0000:0928-0975", start: 0x0928, end: 0x0976, role: "draw six colored answer buttons in native left-to-right order", sha256: "98fbf5b1d573f9ef953b25de4348fa9f4024ca7312a55dd29550e7f5489fb1ea" },
  { source: "module21", address: "0000:0B4B-0C04", start: 0x0b4b, end: 0x0c05, role: "draw the selected image coordinate and choose a PIT-derived challenge modulo 28", sha256: "684155d3031913d8c01146c461b98143f578232f16238c94cd72c7ed24295e2e" },
  { source: "module21", address: "DS:02C6-036D", start: 0x8b76, end: 0x8c1e, role: "28 records of image x/y coordinates and expected answers", sha256: "057695d0075a946d27e46351146272a63df1a807b1a0dc43c887d2c16b047778" },
  { source: "module21", address: "DS:0426-052A", start: 0x8cd6, end: 0x8ddb, role: "password strings, drawing structures, choice permutations, and failure text", sha256: "9989f5a188e7281a4339a9129f8abfe5ce539e664c2da9c33da50e1ae46c64b1" },
  { source: "play", address: "0100:0118-0138", start: 0x18, end: 0x39, role: "single PLAY.COM search-and-replace rule targeting module21 CS:0BEB", sha256: "c0b70c6b23d4582d49087a1a5de1211dcf553cf5f87e083a87d07e745cda8331" },
  { source: "play", address: "0100:013C-01A4", start: 0x3c, end: 0xa5, role: "INT 21h hook that matches and replaces bytes in the interrupted CS", sha256: "e66366439df69a8af4c6542a49493ebb55228d72a8afff67e2afea291d042281" },
  { source: "play", address: "0100:01A5-020B", start: 0xa5, end: 0x10c, role: "install hook, EXEC GO.EXE, restore the original INT 21h vector, and exit", sha256: "a8a2d56648a81d2012e01093fcf2dcf65941e7b1756aea950de5c7fef0a38e60" },
];

const RESOURCE_SPECS = [
  { resourceIndex: 0, container: "A.SWF", group: "A", record: 1, role: "pointer and directional UI graphics" },
  { resourceIndex: 1, container: "C.SWF", group: "C", record: 32, role: "password reference illustration, six colored answer buttons, and challenge-marker animation" },
  { resourceIndex: 3, container: "E.SWF", group: "E", record: 62, role: "input feedback resource loaded by the password module" },
  { resourceIndex: 4, container: "MAGIC.SWF", group: "MAGIC", record: 81, role: "input feedback resource loaded by the password module" },
  { resourceIndex: 4, container: "MAGIC.SWF", group: "MAGIC", record: 84, role: "input feedback resource loaded by the password module" },
  { resourceIndex: 8, container: "MUSIC.SWF", group: "MUSIC", record: 0, role: "music resource loaded by the password module" },
  { resourceIndex: 13, container: "UN.SWF", group: "UN", record: 41, role: "29-entry Big5 code list plus 0000 terminator" },
  { resourceIndex: 13, container: "UN.SWF", group: "UN", record: 42, role: "29 fixed 30-byte 16x15 glyph bitmaps" },
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
    assert(actual === range.sha256, `${range.address}: password-flow code/data signature mismatch`);
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

function module21Offset(dsOffset, bytes = 1) {
  const offset = MODULE21_DATA_BASE + dsOffset;
  assert(offset >= 0 && offset + bytes <= 0xa080, `module21 DS:${hex(dsOffset).slice(2)} outside image`);
  return offset;
}

function decodeDollarString(module21, dsOffset) {
  const start = module21Offset(dsOffset);
  let end = start;
  while (end < module21.length && module21[end] !== 0x24) end++;
  assert(end < module21.length, `module21 DS:${hex(dsOffset).slice(2)} missing '$' terminator`);
  const raw = module21.subarray(start, end);
  return {
    address: `DS:${hex(dsOffset).slice(2)}`,
    text: BIG5.decode(raw),
    big5Hex: raw.toString("hex").toUpperCase(),
  };
}

function decodeNulAscii(module21, dsOffset) {
  const start = module21Offset(dsOffset);
  let end = start;
  while (end < module21.length && module21[end] !== 0) end++;
  assert(end < module21.length, `module21 DS:${hex(dsOffset).slice(2)} missing NUL terminator`);
  return module21.subarray(start, end).toString("ascii");
}

function parseChallengeTable(module21) {
  const records = Array.from({ length: 28 }, (_, index) => {
    const offset = module21Offset(0x02c6 + index * 6, 6);
    return {
      index,
      x: module21.readUInt16LE(offset),
      y: module21.readUInt16LE(offset + 2),
      expectedAnswer: module21.readUInt16LE(offset + 4),
    };
  });
  assert(records.every((record) => record.x < 432 && record.y < 340), "challenge coordinate outside the 432x340 reference illustration");
  assert(records.every((record) => record.expectedAnswer <= 5), "challenge answer outside 0..5");
  return records;
}

function parseChoiceTables(module21, c32Planes) {
  const readWords = (dsOffset, count) => Array.from({ length: count }, (_, index) =>
    module21.readUInt16LE(module21Offset(dsOffset + index * 2, 2)));
  const buttonImageRecords = readWords(0x04d6, 6);
  const answerCodeLeftToRight = readWords(0x04e2, 6);
  assert(buttonImageRecords.join(",") === "4,3,2,5,6,7", "password choice image order changed");
  assert(answerCodeLeftToRight.join(",") === "2,1,0,3,4,5", "password selection-to-answer order changed");
  assert(buttonImageRecords.every((value, index) => value === answerCodeLeftToRight[index] + 2), "choice image and semantic answer tables disagree");
  const expectedAppearanceByRecord = new Map([
    [2, { colorName: "orange", centerRgb: [255, 190, 105] }],
    [3, { colorName: "green", centerRgb: [40, 130, 0] }],
    [4, { colorName: "blue", centerRgb: [0, 0, 166] }],
    [5, { colorName: "brown", centerRgb: [162, 117, 81] }],
    [6, { colorName: "purple", centerRgb: [186, 97, 255] }],
    [7, { colorName: "white", centerRgb: [255, 255, 255] }],
  ]);
  const buttonVisualsLeftToRight = buttonImageRecords.map((record, index) => {
    const image = composePlanarImage(c32Planes, record, null, PALETTES.gameplay.colors);
    assert(image.width === 80 && image.height === 38, `C/0032 image ${record} is not an 80x38 answer button`);
    const centerOffset = (19 * image.width + 40) * 4;
    const centerRgb = Array.from(image.pixels.subarray(centerOffset, centerOffset + 3));
    const expectedAppearance = expectedAppearanceByRecord.get(record);
    assert(centerRgb.join(",") === expectedAppearance.centerRgb.join(","), `C/0032 image ${record} center color changed`);
    return {
      selectionIndex: index,
      answerCode: answerCodeLeftToRight[index],
      imageRecord: record,
      preview: `reverse/renders/planar/C/0032/${String(record).padStart(2, "0")}.png`,
      colorName: expectedAppearance.colorName,
      centerRgb,
    };
  });
  return {
    visibleControlType: "six colored 80x38 image buttons; the numeric answer codes are internal and are not visible labels",
    placement: { x: 500, firstY: 60, yStep: 46 },
    answerCodeLeftToRight,
    buttonImageRecordLeftToRight: buttonImageRecords,
    buttonVisualsLeftToRight,
    selectionToAnswer: answerCodeLeftToRight,
    defaultSelection: 0,
    defaultAnswerCode: answerCodeLeftToRight[0],
    defaultVisibleButton: buttonVisualsLeftToRight[0],
  };
}

function parseGoState(go) {
  const parentBase = 0x42;
  const passwordPointer = go.readUInt16LE(GO_DATA_BASE + parentBase + 0x1e);
  assert(passwordPointer === 0x0312, "GO parent block no longer points to MIMA_PASS");
  return {
    parentBlock: { segment: "146A", symbol: "FM_DATA", dsOffset: hex(parentBase) },
    initialNextModule: go.readUInt16LE(GO_DATA_BASE + 0x4a),
    passwordPointer: {
      parentRelativeOffset: hex(0x1e),
      pointerValue: hex(passwordPointer),
      symbol: "MIMA_PASS",
    },
    passwordState: {
      address: `146A:${hex(passwordPointer).slice(2)}`,
      observedWords: [
        { offset: 0, role: "gate count", initialValue: go.readUInt16LE(GO_DATA_BASE + passwordPointer) },
        { offset: 2, role: "saved intended next module", initialValue: go.readUInt16LE(GO_DATA_BASE + passwordPointer + 2) },
      ],
    },
    mimaNum: {
      address: "146A:0068",
      initialValue: go.readUInt16LE(GO_DATA_BASE + 0x68),
      relationshipToThisGate: "no consumer in the closed module29/module21 handoff; preserve as unresolved shared state",
    },
  };
}

function parsePlayPatch(play, module21) {
  assert(play[0x17] === 0x21, "PLAY.COM no longer hooks INT 21h");
  assert(play[0x18] === 1, "PLAY.COM patch-rule count changed");
  assert(play[0x19] === 0, "PLAY.COM rule already-applied flag is not initially zero");
  assert(play[0x1c] === 2, "PLAY.COM match target is not interrupted CS");
  const matchOffset = play.readUInt16LE(0x1d);
  const matchSegmentDelta = play.readUInt16LE(0x1f);
  const matchLength = play[0x21];
  const original = play.subarray(0x22, 0x22 + matchLength);
  const patchCount = play[0x2a];
  assert(patchCount === 1, "PLAY.COM replacement count changed");
  assert(play[0x2b] === 2, "PLAY.COM replacement target is not interrupted CS");
  const replacementOffset = play.readUInt16LE(0x2c);
  const replacementSegmentDelta = play.readUInt16LE(0x2e);
  const replacementLength = play[0x30];
  const replacement = play.subarray(0x31, 0x31 + replacementLength);
  assert(matchOffset === 0x0beb && replacementOffset === matchOffset, "PLAY.COM no longer targets module21 0000:0BEB");
  assert(matchSegmentDelta === 0 && replacementSegmentDelta === 0, "PLAY.COM patch target segment delta changed");
  assert(matchLength === 8 && replacementLength === 8, "PLAY.COM patch length changed");
  assert(module21.subarray(matchOffset, matchOffset + matchLength).equals(original), "PLAY.COM search bytes do not match module21");
  assert(original.toString("hex") === "33c0e44001061202", "PLAY.COM original challenge signature changed");
  assert(replacement.toString("hex") === "b9100090890e1202", "PLAY.COM fixed-challenge replacement changed");
  return {
    launcher: "PLAY.COM",
    hookedInterrupt: hex(play[0x17], 2),
    ruleCount: play[0x18],
    targetAddress: `interrupted CS:${hex(matchOffset).slice(2)}`,
    appliesWhen: "the interrupted CS:0BEB contains the exact original eight bytes; module21's first INT 21h occurs at 0000:000C, before the password UI",
    originalHex: original.toString("hex").toUpperCase(),
    originalMeaning: "AX=0; AL=in(0x40); DS:0212 += AX",
    replacementHex: replacement.toString("hex").toUpperCase(),
    replacementMeaning: "CX=16; NOP; DS:0212=CX",
    effect: "every password attempt receives challenge index 16 instead of a PIT-derived index",
    fixedChallengeIndex: 16,
    restoresOriginalInt21AfterGoReturns: true,
  };
}

function parseGlyphCodes(codeRecord, bitmapRecord) {
  assert(codeRecord.length === 60, "UN/41 password code-list length changed");
  assert(codeRecord.readUInt16LE(codeRecord.length - 2) === 0, "UN/41 missing 0000 terminator");
  assert(bitmapRecord.length === 29 * 30, "UN/42 password bitmap-array length changed");
  const glyphs = Array.from({ length: 29 }, (_, index) => {
    const raw = codeRecord.subarray(index * 2, index * 2 + 2);
    return { index, char: BIG5.decode(raw), big5Hex: raw.toString("hex").toUpperCase() };
  });
  return {
    codeRecord: 41,
    bitmapRecord: 42,
    glyphWidth: 16,
    glyphHeight: 15,
    glyphBytes: 30,
    glyphCount: glyphs.length,
    decodedCharacterSequence: glyphs.map((glyph) => glyph.char).join(""),
    glyphs,
  };
}

async function fileExists(fileName) {
  try {
    await access(fileName);
    return true;
  }
  catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function extract(goPath, playPath, module21Path, module29Path, extractedRoot, outputPath) {
  const resourcePaths = RESOURCE_SPECS.map((spec) =>
    path.join(extractedRoot, spec.group, `${String(spec.record).padStart(4, "0")}.bin`));
  const [go, play, module21, module29, ...resourceBuffers] = await Promise.all([
    readFile(goPath),
    readFile(playPath),
    readFile(module21Path),
    readFile(module29Path),
    ...resourcePaths.map((resourcePath) => readFile(resourcePath)),
  ]);
  const sources = { go, play, module21, module29 };
  const verifiedRanges = verifyRanges(sources);
  const goState = parseGoState(go);
  const challenges = parseChallengeTable(module21);
  const decodedC32Directory = path.join(path.dirname(extractedRoot), "decoded", "C", "0032");
  const c32Planes = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
    const planePath = path.join(decodedC32Directory, `${String(index).padStart(2, "0")}.raw`);
    return parseBitmapBundle(await readFile(planePath), planePath);
  }));
  const choices = parseChoiceTables(module21, c32Planes);
  const referenceImage = composePlanarImage(c32Planes, 1, null, PALETTES.gameplay.colors);
  assert(referenceImage.width === 432 && referenceImage.height === 340, "C/0032 image 1 is no longer the 432x340 reference illustration");
  const challengeMarkerFrames = [20, 21, 22, 23].map((record) => {
    const image = composePlanarImage(c32Planes, record, null, PALETTES.gameplay.colors);
    assert(image.width === 24 && (image.height === 15 || image.height === 16), `C/0032 image ${record} is not a native challenge-marker frame`);
    return {
      imageRecord: record,
      dimensions: { width: image.width, height: image.height },
      preview: `reverse/renders/planar/C/0032/${record}.png`,
    };
  });
  const playPatch = parsePlayPatch(play, module21);
  const fixedChallenge = challenges[playPatch.fixedChallengeIndex];
  assert(fixedChallenge.expectedAnswer === choices.defaultAnswerCode, "PLAY fixed challenge no longer matches the default answer code");

  const strings = {
    prompt: decodeDollarString(module21, 0x0426),
    threeEntered: decodeDollarString(module21, 0x0431),
    confirmQuestion: decodeDollarString(module21, 0x0446),
    confirm: decodeDollarString(module21, 0x0465),
    reenter: decodeDollarString(module21, 0x046e),
    wrong: decodeDollarString(module21, 0x04f2),
    restart: decodeDollarString(module21, 0x0500),
  };
  assert(strings.prompt.text === "請輸入密碼", "password prompt changed");
  assert(strings.reenter.text === "重新輸入", "password re-entry label changed");
  assert(strings.wrong.text === "密碼輸入錯誤,", "password failure text changed");

  const directResources = RESOURCE_SPECS.map((spec, index) => ({
    ...spec,
    path: resourcePaths[index],
    bytes: resourceBuffers[index].length,
    sha256: sha256(resourceBuffers[index]),
  }));
  const passwordGlyphs = parseGlyphCodes(
    resourceBuffers[RESOURCE_SPECS.findIndex((spec) => spec.group === "UN" && spec.record === 41)],
    resourceBuffers[RESOURCE_SPECS.findIndex((spec) => spec.group === "UN" && spec.record === 42)],
  );
  const embeddedSourceImageName = decodeNulAscii(module21, 0x0477);
  const externalSourceImagePath = path.join(path.dirname(goPath), embeddedSourceImageName);

  const answerCounts = Array.from({ length: 6 }, (_, answer) => ({
    answer,
    challengeCount: challenges.filter((challenge) => challenge.expectedAnswer === answer).length,
  }));

  const result = {
    format: "ANGEL2 native password/copy-protection state machine",
    semanticVersion: 2,
    sources: {
      go: { path: goPath, bytes: go.length, sha256: sha256(go) },
      play: { path: playPath, bytes: play.length, sha256: sha256(play) },
      module21: { path: module21Path, bytes: module21.length, sha256: sha256(module21) },
      module29: { path: module29Path, bytes: module29.length, sha256: sha256(module29) },
    },
    verifiedRanges,
    sharedState: goState,
    gateRouting: {
      trigger: "module29 calls 1000:06B9 on every battle-module exit, before exporting next module and stage",
      firstExitWhenCountZero: [
        "increment MIMA_PASS.count from 0 to 1",
        "save module29's intended next module in MIMA_PASS.savedNextModule",
        "replace module29's local next module with 21",
      ],
      module21Success: [
        "increment MIMA_PASS.count from 1 to 2",
        "restore MIMA_PASS.savedNextModule as the exported WK_EXE",
      ],
      laterModule29Exits: "count is nonzero, so 1000:06B9 leaves the intended next module unchanged",
      commonNewGameTiming: "after the first battle-module exit in the GO process; normally after the first battle transition, not before the title",
      continueTiming: "after the first module29 exit following a numbered-save load in the GO process",
      nativeStage6Quirk: "the module29 main routine applies its nextStage==6 -> module27 override after the password helper; if this rare condition occurs on the first module29 exit, exported module 21 can be overwritten while count remains 1",
      processLifetime: "MIMA_PASS is GO memory initialized to zero for each launch and is not shown as part of the closed WAR save payload",
    },
    passwordUi: {
      module: 21,
      entry: "0000:0502",
      strings,
      attemptsPerSet: 3,
      answerChoices: choices,
      confirmation: {
        values: { confirm: "Y", reenter: "N" },
        reenterBehavior: "restart all three challenges",
        confirmBehavior: "read and validate interrupt vectors 0, 1, and 3 in sequence",
      },
      challengeSelectionWithoutPlayPatch: {
        address: "0000:0BEB",
        accumulator: "module21 DS:0212, initially zero",
        formula: "DS:0212 = (DS:0212 + lowByte(PIT channel 0 port 0x40)) mod 28",
      },
      responseEncoding: {
        vectorsByAttempt: [0, 1, 3],
        offsetWord: "challenge index 0..27",
        segmentWord: "selected semantic answer 0..5",
        dosApi: "INT 21h AH=25h",
      },
      finalValidation: {
        dosApi: "INT 21h AH=35h reads vectors 0, 1, and 3",
        comparison: "expectedSegment = word at DS:02CA + vectorOffset*6; compare with vectorSegment",
        answerTableBase: "each six-byte record starts at DS:02C6; expected answer is its third word at DS:02CA + index*6",
        mismatch: "draw failure strings, then loop forever while reprogramming the 8259 PIC; the visible instruction is to reboot",
        success: "all three comparisons return, allowing module21 to restore the saved next module",
        prePromptCompatibilityCheck: "the same three vector readers are invoked once before prompting; their behavior depends on the original DOS/BIOS vector values and is retained as a low-level anti-debug/copy-protection compatibility detail",
      },
    },
    challengeReference: {
      resource: { container: "C.SWF", record: 32 },
      confirmedPlanarRender: "reverse/renders/planar/C/0032/01.png",
      dimensions: { width: 432, height: 340 },
      resourceImageRoles: {
        referenceIllustration: 1,
        colorAnswerButtons: choices.buttonVisualsLeftToRight,
        challengeMarkerFrames,
        gameplayPaletteEvidence: PALETTES.gameplay.evidence,
      },
      coordinateCount: challenges.length,
      challenges,
      answerCounts,
      embeddedDevelopmentFilename: embeddedSourceImageName,
      embeddedDevelopmentFilenameAddress: "DS:0477",
      embeddedDevelopmentFilePresentBesideGame: await fileExists(externalSourceImagePath),
      note: "MIMA_C.PCX has no native code reference in module21; C/32 is the shipped indexed resource consumed by the screen",
    },
    playLauncherPatch: {
      ...playPatch,
      fixedChallenge,
      defaultChoiceMatchesFixedAnswer: fixedChallenge.expectedAnswer === choices.defaultAnswerCode,
      resultingUserPath: "when launched through PLAY.COM, choosing the default leftmost blue button three times satisfies the table (its internal answer code is 2)",
      directGoExeDifference: "launching GO.EXE directly leaves the PIT-derived challenge selector intact",
    },
    passwordGlyphResource: passwordGlyphs,
    directResources,
    validation: {
      verifiedRangeCount: verifiedRanges.length,
      directResourceCount: directResources.length,
      sharedGateHandoffClosed: true,
      threeAttemptUiClosed: true,
      challengeCoordinatesAndAnswersClosed: challenges.length === 28,
      answerChoiceOrderClosed: choices.answerCodeLeftToRight.join(",") === "2,1,0,3,4,5",
      visibleColorButtonsClosed: choices.buttonVisualsLeftToRight.length === 6,
      interruptVectorEncodingClosed: true,
      failureLockClosed: true,
      playFixedChallengePatchClosed: playPatch.fixedChallengeIndex === 16,
      lowLevelPrePromptVectorEnvironmentClosed: false,
      exactFrameAudioTimelineClosed: false,
      implementationStarted: false,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`verified ${verifiedRanges.length} password-flow ranges, ${challenges.length} challenges, ${directResources.length} direct resources, and the PLAY.COM fixed-index patch to ${outputPath}\n`);
}

if (process.argv[2] !== "--extract" || process.argv.length !== 9) {
  process.stderr.write("usage: angel2-password-flow.mjs --extract GO.EXE PLAY.COM MODULE21.bin MODULE29.bin EXTRACTED_ROOT OUTPUT.json\n");
  process.exit(2);
}

extract(...process.argv.slice(3)).catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(1);
});
