#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_BYTES = 78;
const EXPECTED_CONFIG_SHA256 = "e9a8335d2a745a35e81e9fa6e74c3f4f07af48ccc657487f4ae19825996db214";
const EXPECTED_JS3_SHA256 = "43a62ba7927df8e95789467981388b46ea7d111e83620217752374c6178d9bca";
const KEY_TABLE_START = 0x6323;
const KEY_TABLE_END = 0x6815;
const KEY_TABLE_RECORDS = 128;
const ACTIONS_4_WAY = [
  "buttonA", "buttonB", "buttonC", "buttonD", "buttonE", "buttonF",
  "start", "select", "up", "down", "left", "right",
];
const ACTIONS_8_WAY = [
  ...ACTIONS_4_WAY,
  "leftUp", "leftDown", "rightUp", "rightDown",
];
const EMULATION_MODES = [
  "analog_joystick",
  "gravis_joystick",
  "two_button_mouse",
  "three_button_mouse",
  "keyboard_4_way",
  "keyboard_8_way",
];

const NATIVE_SIGNATURES = [
  { id: "keyboard4RepeatToggle", address: "1000:3453-347B", fileOffset: 0x4053, bytes: 41, role: "Space toggles bit 7 on the selected four-way binding", sha256: "161880964f965820843e356d3e5735eac212281449b9ee8b9a2859e4b0036dc8" },
  { id: "keyboard8RepeatToggle", address: "1000:3E05-3E2D", fileOffset: 0x4a05, bytes: 41, role: "Space toggles bit 7 on the selected eight-way binding", sha256: "77a66d769716a7fc3632254c91a6a99da2aa79af51c943a3c58e1afbdbe29369" },
  { id: "keyboard4BindingRenderer", address: "1000:36EC-377A", fileOffset: 0x42ec, bytes: 143, role: "render repeat marker, mask bit 7, and look up the four-way binding name", sha256: "aac4032675849d24e6d56437bf74d26ef71007c3cff5527739a4f1531d54954c" },
  { id: "keyboard8BindingRenderer", address: "1000:407B-4107", fileOffset: 0x4c7b, bytes: 141, role: "render repeat marker, mask bit 7, and look up the eight-way binding name", sha256: "0f099b49188f2c867c8369b2614beea6cb1ea4dc303a51b6d90a2bf8f9f6dd16" },
  { id: "applyKeyboard4", address: "1000:4D9A-4DFE", fileOffset: 0x599a, bytes: 101, role: "pack two 12-action bindings plus four zero pads and send command 20h", sha256: "704f4339d46f1c1aa501fc5d530c5e079379ac001a009e2bca2cdc40ed222953" },
  { id: "applyKeyboard8", address: "1000:4DFF-4E5C", fileOffset: 0x59ff, bytes: 94, role: "pack two 16-action bindings and send command 30h", sha256: "28ced9530e8d1f81d1532c7b442fbb22ddb64875a5bfacc35925a77d140e3c19" },
  { id: "keyNameLookup", address: "14E5:08B3-08D2", fileOffset: 0x6303, bytes: 32, role: "walk the 128 variable-length records by internal key index", sha256: "b605cb63087d91d813510ab82ec08c8bb7ab906665b32bd2742c1f680c5a2edb" },
  { id: "keyTranslationTable", address: "14E5:08D3-0DC4", fileOffset: KEY_TABLE_START, bytes: KEY_TABLE_END - KEY_TABLE_START, role: "128 records of Set-1 scan word plus NUL-terminated native key name", sha256: "4038ccc5756f3e0c927d5e029bf215d0be6928a031aed4903f255ee8691e498c" },
];

const EXPECTED_SHIPPED_BINDINGS = {
  buttonA: { internalKeyIndex: 61, nativeKeyName: "Space Bar", scanCode: 0x39, gameSemanticActions: ["primary"] },
  buttonB: { internalKeyIndex: 43, nativeKeyName: "Enter", scanCode: 0x1c, gameSemanticActions: ["secondary"] },
  buttonC: { internalKeyIndex: 112, nativeKeyName: "F1", scanCode: 0x3b, gameSemanticActions: ["allRest"] },
  buttonD: { internalKeyIndex: 52, nativeKeyName: "ASCII M", scanCode: 0x32, gameSemanticActions: ["musicVolume"] },
  buttonE: { internalKeyIndex: 19, nativeKeyName: "ASCII E", scanCode: 0x12, gameSemanticActions: ["soundEffects"] },
  buttonF: { internalKeyIndex: 16, nativeKeyName: "Tab", scanCode: 0x0f, gameSemanticActions: ["groupCommandMenu"] },
  start: { internalKeyIndex: 110, nativeKeyName: "Escape", scanCode: 0x01, gameSemanticActions: ["systemMenu"] },
  select: { internalKeyIndex: 0, nativeKeyName: "No Use", scanCode: 0x7f, gameSemanticActions: [] },
  up: { internalKeyIndex: 96, nativeKeyName: "Keypad 8", scanCode: 0x48, gameSemanticActions: ["up"] },
  down: { internalKeyIndex: 98, nativeKeyName: "Keypad 2", scanCode: 0x50, gameSemanticActions: ["down"] },
  left: { internalKeyIndex: 92, nativeKeyName: "Keypad 4", scanCode: 0x4b, gameSemanticActions: ["left"] },
  right: { internalKeyIndex: 102, nativeKeyName: "Keypad 6", scanCode: 0x4d, gameSemanticActions: ["right"] },
};

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function verifyNativeSignatures(executable) {
  return NATIVE_SIGNATURES.map((signature) => {
    const bytes = executable.subarray(signature.fileOffset, signature.fileOffset + signature.bytes);
    assert(bytes.length === signature.bytes, `${signature.id}: native signature is outside JS3 executable`);
    const actual = sha256(bytes);
    assert(actual === signature.sha256, `${signature.id}: native signature mismatch`);
    return { ...signature };
  });
}

function parseKeyTranslationTable(executable) {
  let offset = KEY_TABLE_START;
  const entries = [];
  for (let internalKeyIndex = 0; internalKeyIndex < KEY_TABLE_RECORDS; internalKeyIndex += 1) {
    assert(offset + 2 <= KEY_TABLE_END, `key table record ${internalKeyIndex}: truncated scan word`);
    const recordOffset = offset;
    const scanCodeWord = executable.readUInt16LE(offset);
    offset += 2;
    const terminator = executable.indexOf(0, offset);
    assert(terminator >= offset && terminator < KEY_TABLE_END, `key table record ${internalKeyIndex}: missing NUL terminator`);
    const nativeKeyName = executable.subarray(offset, terminator).toString("ascii");
    offset = terminator + 1;

    const prefix = scanCodeWord >>> 8;
    const makeCode = scanCodeWord & 0xff;
    assert(prefix === 0 || prefix === 0xe0, `key table record ${internalKeyIndex}: unexpected scan prefix ${hex(prefix)}`);
    const isUnbound = internalKeyIndex === 0;
    entries.push({
      internalKeyIndex,
      recordFileOffset: recordOffset,
      bytes: offset - recordOffset,
      nativeKeyName,
      isUnbound,
      set1: {
        scanCodeWord,
        scanCodeWordHex: hex(scanCodeWord, 4),
        extendedPrefix: prefix === 0 ? null : hex(prefix),
        makeCode,
        makeCodeHex: hex(makeCode),
        makeSequence: isUnbound ? [] : (prefix === 0 ? [makeCode] : [prefix, makeCode]),
        breakSequence: isUnbound ? [] : (prefix === 0 ? [makeCode | 0x80] : [prefix, makeCode | 0x80]),
      },
    });
  }
  assert(offset === KEY_TABLE_END, `key table ended at ${hex(offset, 4)}, expected ${hex(KEY_TABLE_END, 4)}`);
  assert(entries[0].nativeKeyName === "No Use" && entries[0].set1.scanCodeWord === 0x007f, "key table no-use sentinel changed");
  assert(entries[62].set1.scanCodeWord === 0xe038 && entries[62].nativeKeyName === "Right Alt", "key table extended-key anchor changed");
  assert(entries[112].set1.makeCode === 0x3b && entries[112].nativeKeyName === "F1", "key table F1 anchor changed");
  return entries;
}

function buildGameSemanticMap(inputUi) {
  const releaseBindings = inputUi?.physicalKeyboard?.bindingTables?.module29?.entries;
  const directBindings = inputUi?.physicalKeyboard?.battleDirectBindings;
  assert(Array.isArray(releaseBindings) && releaseBindings.length === 14, "input-ui module29 keyboard table is missing or changed");
  assert(Array.isArray(directBindings) && directBindings.length === 12, "input-ui battle direct-binding table is missing or changed");
  assert(inputUi.physicalKeyboard.sharedReleaseBindingsIdentical === true, "module27/module29 keyboard bindings no longer agree");

  const byScanCode = new Map();
  for (const entry of [...releaseBindings, ...directBindings]) {
    const actions = byScanCode.get(entry.scanCode) ?? new Set();
    actions.add(entry.action);
    byScanCode.set(entry.scanCode, actions);
  }
  return new Map([...byScanCode].map(([scanCode, actions]) => [scanCode, [...actions].sort()]));
}

function binding(rawCode, keyTable, gameSemanticMap) {
  const internalKeyIndex = rawCode & 0x7f;
  const key = keyTable[internalKeyIndex];
  assert(key !== undefined, `binding index ${internalKeyIndex} is outside the key table`);
  const repeatEnabled = (rawCode & 0x80) !== 0;
  return {
    rawCode,
    rawCodeHex: hex(rawCode),
    internalKeyIndex,
    repeatEnabled,
    highBitFlag: repeatEnabled,
    nativeKeyName: key.nativeKeyName,
    unbound: key.isUnbound,
    set1: key.set1,
    gameSemanticActions: key.isUnbound ? [] : (gameSemanticMap.get(key.set1.makeCode) ?? []),
  };
}

function bindingSet(buffer, offset, actions, keyTable, gameSemanticMap) {
  return Object.fromEntries(actions.map((action, index) => [
    action,
    binding(buffer[offset + index], keyTable, gameSemanticMap),
  ]));
}

function verifyShippedKeyboard4Way(parsed) {
  assert(parsed.emulationMode.id === 4, "shipped AG2.JS3 no longer selects Keyboard 4 Way");
  assert(JSON.stringify(parsed.keyboard4Way.joystick1Bindings) === JSON.stringify(parsed.keyboard4Way.joystick2Bindings), "shipped four-way joystick bindings no longer match");
  const audit = [];
  for (const action of ACTIONS_4_WAY) {
    const actual = parsed.keyboard4Way.joystick1Bindings[action];
    const expected = EXPECTED_SHIPPED_BINDINGS[action];
    assert(actual.internalKeyIndex === expected.internalKeyIndex, `${action}: internal key index changed`);
    assert(actual.nativeKeyName === expected.nativeKeyName, `${action}: native key name changed`);
    assert(actual.set1.makeCode === expected.scanCode, `${action}: Set-1 scan code changed`);
    assert(JSON.stringify(actual.gameSemanticActions) === JSON.stringify(expected.gameSemanticActions), `${action}: game semantic action changed`);
    assert(actual.repeatEnabled === false, `${action}: shipped repeat flag is unexpectedly enabled`);
    audit.push({
      joymouseAction: action,
      internalKeyIndex: actual.internalKeyIndex,
      nativeKeyName: actual.nativeKeyName,
      set1MakeCodeHex: actual.set1.makeCodeHex,
      gameSemanticActions: actual.gameSemanticActions,
      repeatEnabled: actual.repeatEnabled,
      result: "match",
    });
  }
  return {
    selectedMode: "keyboard_4_way",
    joysticksIdentical: true,
    allTwelveActionsVerified: true,
    deviceToSet1ToGameSemanticPipelineClosed: true,
    entries: audit,
  };
}

function parseJs3(buffer, executable, inputUi) {
  assert(buffer.length === EXPECTED_BYTES, `expected ${EXPECTED_BYTES} bytes, got ${buffer.length}`);
  assert(sha256(buffer) === EXPECTED_CONFIG_SHA256, "AG2.JS3 source hash changed");
  assert(sha256(executable) === EXPECTED_JS3_SHA256, "JS3.UNPACKED.EXE source hash changed");
  const verifiedNativeSignatures = verifyNativeSignatures(executable);
  const keyTable = parseKeyTranslationTable(executable);
  const gameSemanticMap = buildGameSemanticMap(inputUi);
  const trailingLengthMarker = buffer[77];
  const emulationModeId = buffer[3];
  const parsed = {
    format: "Softstar Joymouse Setup 3.00 configuration",
    semanticVersion: 2,
    role: "input_device_configuration_not_game_progress",
    bytes: buffer.length,
    sha256: sha256(buffer),
    sources: {
      configuration: { bytes: buffer.length, sha256: sha256(buffer) },
      setupExecutable: { bytes: executable.length, sha256: sha256(executable) },
      gameInputUi: { semanticVersion: inputUi.semanticVersion ?? null, canonicalJsonSha256: sha256(Buffer.from(JSON.stringify(inputUi))) },
    },
    verifiedNativeSignatures,
    validation: {
      expectedBytes: EXPECTED_BYTES,
      trailingLengthMarker,
      expectedTrailingLengthMarker: EXPECTED_BYTES - 1,
      trailingLengthMarkerValid: trailingLengthMarker === EXPECTED_BYTES - 1,
      nativeReader: "JS3.UNPACKED.EXE 1000:494F",
      nativeWriter: "JS3.UNPACKED.EXE 1000:4A96",
    },
    nativeKeyTranslation: {
      pipeline: "binding byte low 7 bits -> one of 128 internal records -> Set-1 make/break sequence -> ANGEL2 release keyboard consumer -> semantic action",
      tableAddress: "14E5:08D3",
      tableFileRange: [KEY_TABLE_START, KEY_TABLE_END],
      recordCount: keyTable.length,
      recordFormat: "u16 little-endian Set-1 scan word followed by a NUL-terminated ASCII key name",
      ordinaryWord: "00xx means one-byte Set-1 make code xx",
      extendedWord: "E0xx means E0-prefixed Set-1 make code; the break sequence is E0,(xx|80h)",
      noUse: "internal index 0 is the explicit No Use sentinel and emits no key sequence",
      entries: keyTable,
    },
    configVersionWord: buffer.readUInt16LE(0),
    controllerFlags: {
      offset: 2,
      rawValue: buffer[2],
      joystickSwapOn: (buffer[2] & 0x01) !== 0,
      keyboardAutoRepeatOff: (buffer[2] & 0x02) !== 0,
      joystick1ReverseOn: (buffer[2] & 0x04) !== 0,
      joystick2ReverseOn: (buffer[2] & 0x08) !== 0,
      joystick1TypeBits: (buffer[2] >> 4) & 0x03,
      joystick2TypeBits: (buffer[2] >> 6) & 0x03,
      nativeEvidence: "JS3.UNPACKED.EXE 1000:438A toggles bits 0..3; 1000:43ED/4404 replace the two 2-bit type fields",
    },
    emulationMode: {
      offset: 3,
      id: emulationModeId,
      name: EMULATION_MODES[emulationModeId] ?? null,
      nativeDispatch: "JS3.UNPACKED.EXE 1000:4B2D compares IDs 0..5 in this order",
    },
    deviceTuning: {
      analogJoystick: { repeatSpeed: buffer[4], resistorValue: buffer[5] },
      gravisJoystick: { repeatSpeed: buffer[6], resistorValue: buffer[7] },
      twoButtonMouse: { repeatSpeed: buffer[8], moveSpeed: buffer[9] },
      threeButtonMouse: { repeatSpeed: buffer[10], moveSpeed: buffer[11] },
    },
    otherSettings: {
      mousePortChoice: { offset: 12, value: buffer[12] },
      joystick1Type: { offset: 13, value: buffer[13] },
      joystick2Type: { offset: 14, value: buffer[14] },
      standbyWaitSeconds: {
        offset: 75,
        value: buffer.readUInt16LE(75),
        nativeRange: [3, 999],
        nativeEvidence: "the Other screen labels row 7 'Standby wait time (sec)'; 1000:441F..446B wraps 3..999",
      },
    },
    keyboardBindingEncoding: {
      lowSevenBits: "internal key-table index 0..127",
      highBit: "per-action repeatEnabled flag",
      nativeEvidence: "Keyboard 4/8 Way binding editors toggle bit 7 with Space, render a repeat marker when set, mask it before key-name lookup, preserve it when replacing the key, and expose a Repeat Speed screen with Auto/Turbo timing",
      webRule: "decode through the native table; never treat the raw configuration byte as a DOM keyCode",
    },
    keyboard4Way: {
      joystick1Bindings: bindingSet(buffer, 15, ACTIONS_4_WAY, keyTable, gameSemanticMap),
      joystick2Bindings: bindingSet(buffer, 27, ACTIONS_4_WAY, keyTable, gameSemanticMap),
      autoSpeed: buffer[39],
      turboSpeed: buffer[40],
      nativeApply: "1000:4D9A sends 16 bytes per joystick: 12 bindings followed by four zero pads",
    },
    keyboard8Way: {
      joystick1Bindings: bindingSet(buffer, 41, ACTIONS_8_WAY, keyTable, gameSemanticMap),
      joystick2Bindings: bindingSet(buffer, 57, ACTIONS_8_WAY, keyTable, gameSemanticMap),
      autoSpeed: buffer[73],
      turboSpeed: buffer[74],
      nativeApply: "1000:4DFF sends all 16 bindings per joystick",
    },
    exactLayout: [
      { offset: 0, bytes: 2, field: "configVersionWord", nativeStorage: "1000:4698" },
      { offset: 2, bytes: 1, field: "controllerFlags", nativeStorage: "1000:42DC" },
      { offset: 3, bytes: 1, field: "emulationMode", nativeStorage: "1000:12D9" },
      { offset: 4, bytes: 8, field: "four device-specific tuning pairs", nativeStorage: "1000:26D5..2D5A" },
      { offset: 12, bytes: 3, field: "mouse port and two joystick type values", nativeStorage: "1000:42E4/42DE/42E0" },
      { offset: 15, bytes: 24, field: "keyboard 4-way bindings: 2 joysticks x 12 actions", nativeStorage: "1000:32C6" },
      { offset: 39, bytes: 2, field: "keyboard 4-way auto/turbo speeds", nativeStorage: "1000:32DE/32E0" },
      { offset: 41, bytes: 32, field: "keyboard 8-way bindings: 2 joysticks x 16 actions", nativeStorage: "1000:3C70" },
      { offset: 73, bytes: 2, field: "keyboard 8-way auto/turbo speeds", nativeStorage: "1000:3C90/3C92" },
      { offset: 75, bytes: 2, field: "standby wait time in seconds", nativeStorage: "1000:42E2" },
      { offset: 77, bytes: 1, field: "trailing length marker", nativeRule: "must equal bytes before marker" },
    ],
    rawHex: buffer.toString("hex"),
  };
  parsed.shippedModeSemanticAudit = verifyShippedKeyboard4Way(parsed);
  return parsed;
}

function usage() {
  return "usage: angel2-js3-config.mjs --inspect AG2.JS3 JS3.UNPACKED.EXE input-ui.json OUTPUT.json";
}

async function main() {
  const [command, inputFile, executableFile, inputUiFile, outputFile] = process.argv.slice(2);
  if (command !== "--inspect" || inputFile === undefined || executableFile === undefined || inputUiFile === undefined || outputFile === undefined) {
    throw new Error(usage());
  }
  const [config, executable, inputUiText] = await Promise.all([
    readFile(inputFile), readFile(executableFile), readFile(inputUiFile, "utf8"),
  ]);
  const parsed = parseJs3(config, executable, JSON.parse(inputUiText));
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(`parsed ${parsed.bytes}-byte Joymouse configuration and ${parsed.nativeKeyTranslation.recordCount}-entry key table to ${outputFile}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { parseJs3, parseKeyTranslationTable };
