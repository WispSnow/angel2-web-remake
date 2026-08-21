#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE27_DATA_SEGMENT = 0x095a;
const MODULE29_DATA_SEGMENT = 0x1eba;
const MODULE27_DATA_BASE = MODULE27_DATA_SEGMENT * 16;
const MODULE29_DATA_BASE = MODULE29_DATA_SEGMENT * 16;
const SENTINEL = 0xffff;

const CODE_SIGNATURES = [
  { module: 27, address: "0000:05C2", offset: 0x005c2, role: "load A/0002 profession-figure resource for deployment roster", hex: "a184268ec0bf0000b90200bb0000e8032ca18426be8b009a0800d703" },
  { module: 27, address: "0000:08EA", offset: 0x008ea, role: "deployment presentation composition: roster frames, entries, then controls", hex: "e80700e8c800e8b602c3c706d8090800c706dc090000b903" },
  { module: 27, address: "0000:0927", offset: 0x00927, role: "nested palette-rectangle roster item frame builder", hex: "a1d809a3de0940a3e809a3f209a1da09a3e00940a3ea09a3f409" },
  { module: 27, address: "0000:09B8", offset: 0x009b8, role: "three-column by five-row deployment roster renderer", hex: "33d2a1760abb0f00f7e3a3780ac706d8090800b9030051" },
  { module: 27, address: "0000:0A1B", offset: 0x00a1b, role: "single roster item state, text and A/0002 profession-figure renderer", hex: "8b16d8098b1eda0983c25083c3038916560a891e580abe560a" },
  { module: 27, address: "0000:0BA9", offset: 0x00ba9, role: "three page controls and independent finish-control placement", hex: "c706d809b801c706da092300c706dc090000b9030051e81c00" },
  { module: 27, address: "0000:0BDE", offset: 0x00bde, role: "nested palette-rectangle page/finish control renderer", hex: "c706400a0f00c7064a0a0000c706540a0700a1760a3b06dc09" },
  { module: 27, address: "0000:0C60", offset: 0x00c60, role: "deployment input/render/toggle/page loop", hex: "e86f02e8420ae8f800e8720083fa597414e81200a18426bb" },
  { module: 27, address: "0000:0C86", offset: 0x00c86, role: "deployment-map primary/secondary action dispatch", hex: "8b16492a8b1e4b2abed80ee8ba11833eca255975168b1649" },
  { module: 27, address: "0000:0CDE", offset: 0x00cde, role: "deployment page or finish control", hex: "8b16492a8b1e4b2abed80ee86211833eca25597419803e3f" },
  { module: 27, address: "0000:0D61", offset: 0x00d61, role: "deployment roster primary-button toggle", hex: "8b16492a8b1e4b2abe400ee8df10833eca25597416803e3e" },
  { module: 27, address: "0000:0ED2", offset: 0x00ed2, role: "keyboard-only deployment navigation adapter", hex: "803e422a4e7401c3e86700e88500e8c500e8a200e80700e8" },
  { module: 27, address: "0000:0FC8", offset: 0x00fc8, role: "deployment navigation index to pointer coordinates", hex: "8b1e7e0f03db8b97800f83c23c8916492a8b1e8a0f03db8b" },
  { module: 27, address: "0000:0E81", offset: 0x00e81, role: "deployment native error bar and bitmap-text feedback loop", hex: "c706660f0000be5e0fe88d0bbe680fe8870bbe720fe8810b" },
  { module: 27, address: "0000:165B", offset: 0x0165b, role: "complete 50x50 deployment minimap row/column scan at four-pixel steps", hex: "c70604100000c706fe0f7d00c706f80f0000b9320051e80e00" },
  { module: 27, address: "0000:1701", offset: 0x01701, role: "deployment minimap terrain 4x4 cell renderer", hex: "a14b008ec08b36fa0f33db268a1c03db8b9fb80233c08a87ae10" },
  { module: 27, address: "0000:1731", offset: 0x01731, role: "deployment minimap side-2/side-1/FF occupancy renderer", hex: "a151008ec08b36fa0f268a043c0274093c01742c3cff744f" },
  { module: 27, address: "0000:1884", offset: 0x01884, role: "select next FF deployment cell", hex: "e8800083fa597407c706f60f0000c3ba4e008b1ef60f4326" },
  { module: 27, address: "0000:18B2", offset: 0x018b2, role: "select previous FF deployment cell", hex: "e8520083fa597407c706f60f0000c3ba4e008b1ef60f4b26" },
  { module: 27, address: "0000:1CAA", offset: 0x01caa, role: "INT 09h keyboard IRQ wrapper", hex: "505351521e06575616e80e00b020e620175e5f071f5a595b58cfb85a098ed8e4" },
  { module: 27, address: "0000:1D27", offset: 0x01d27, role: "Set-1 scan code to deployment semantic-action mapper", hex: "33f68b8410243dffff740f3bc375068bbc1224880d83c604ebe8c3" },
  { module: 29, address: "0000:48FE", offset: 0x048fe, role: "standard battle/player-phase loop", hex: "e80dd39aac009d13a180f88ec0bf0000b91a00bb0000e87b" },
  { module: 29, address: "0000:54AA", offset: 0x054aa, role: "battle input, viewport, HUD, and unit-selection update", hex: "9a04003e13e87527e81c00b90900e8fb7ec3e80fdc9a0400" },
  { module: 29, address: "0000:54D1", offset: 0x054d1, role: "battle primary select and secondary cancel", hex: "803e91f5017432813e21fbb801771c833eac00007515803e" },
  { module: 29, address: "0000:5651", offset: 0x05651, role: "generic battle menu lifecycle", hex: "e81d06e87100e81000c706343d0000e8be00e81301e81f06" },
  { module: 29, address: "0000:5721", offset: 0x05721, role: "generic menu event loop and action-code return", hex: "e81509e8d9ffe81c02e87205e82704a180f8bbde01e820a1" },
  { module: 29, address: "0000:6039", offset: 0x06039, role: "keyboard-only menu up/down adapter", hex: "803e1afb4e7401c3e80400e82800c3803e8ef5017401c3c6" },
  { module: 29, address: "0000:6849", offset: 0x06849, role: "basic-unit action menu", hex: "e81b06833e4a3d587431e8d20c813e4a3d4b4f7426e8da00" },
  { module: 29, address: "0000:688D", offset: 0x0688d, role: "ranged-unit action menu", hex: "e8e705833e4a3d587444e88e0c813e4a3d4b4f7439e8b001" },
  { module: 29, address: "0000:68E4", offset: 0x068e4, role: "technique-unit action menu", hex: "e8a005833e4a3d587444e8370c813e4a3d4b4f7439e83f00" },
  { module: 29, address: "0000:693B", offset: 0x0693b, role: "move then attack/end/undo flow", hex: "a1161f2ea32674833e4a3d4d7572e8c409813e4a3d544374" },
  { module: 29, address: "0000:69BC", offset: 0x069bc, role: "class-0F extra move or abandon flow", hex: "813e430d30467401c3a124008ec08b1e5052268a073c0075" },
  { module: 29, address: "0000:6A55", offset: 0x06a55, role: "ranged move then attack/shoot/end/undo flow", hex: "a1161f2ea32674833e4a3d4d7403e9d700e8a708813e4a3d" },
  { module: 29, address: "0000:6CF1", offset: 0x06cf1, role: "show selector-1Fh all-rest command line before applying all-rest settlement", hex: "c706f41e434dc606f61e012ec70627844e00a180f8e8f18ae8b9008b1e8857b81f00e8685ce8d1002ec70627845900" },
  { module: 29, address: "0000:6D2A", offset: 0x06d2a, role: "show selector-21h follow-leader command line before committing the leader and running allied AI", hex: "c706f41e434dc606f61e012ec70627844e00a180f8e8b88ac706340d5900e87a008b1e8857b82100e8295c8b1e8857891e360da122008ec0268a070c802688079ae3004711" },
  { module: 29, address: "0000:6D86", offset: 0x06d86, role: "show selector-20h free-action command line before running allied AI", hex: "c706f41e434dc606f61e012ec70627844e00a180f8e85c8ae824008b1e8857b82000e8d35b9ae30047112ec706278459" },
  { module: 29, address: "0000:7C27", offset: 0x07c27, role: "battle viewport, unit HUD, and minimap refresh", hex: "e8c700e89301e87601bae801bb0800b81503e81609803eec" },
  { module: 29, address: "0000:8492", offset: 0x08492, role: "delayed hovered-unit detail-panel controller", hex: "803e485d597401c3833e046059756d803e1afb4e7408a121" },
  { module: 29, address: "0000:B7C6", offset: 0x0b7c6, role: "battle side-panel foundation and state-overlay draw order", hex: "c70684f8a502bae001bb0000b91300e8f71dbed47fe87218e83100e84f00e86d00e80700e88800e8a600c3" },
  { module: 29, address: "0000:B7F1", offset: 0x0b7f1, role: "grid-setting side-panel frame selector", hex: "f6061a1101740dba5802bb4100b91900e8cb1dc3ba5802bb4100b91800e8be1dc3" },
  { module: 29, address: "0000:B812", offset: 0x0b812, role: "release-fixed window side-panel frame selector", hex: "803eac7f01740dba4802bb2700b91c00e8aa1dc3ba4802bb2700b91d00e89d1dc3" },
  { module: 29, address: "0000:B833", offset: 0x0b833, role: "release-fixed desk side-panel frame selector", hex: "803eb07f01740dba1002bb4d00b91600e8891dc3ba1002bb4d00b91700e87c1dc3" },
  { module: 29, address: "0000:B854", offset: 0x0b854, role: "edge-scroll-setting side-panel frame selector", hex: "f6061b1101740dba3802bb6a00b91b00e8681dc3ba3802bb6a00b91a00e85b1dc3" },
  { module: 29, address: "0000:B875", offset: 0x0b875, role: "portrait-setting side-panel frame selector", hex: "f606181101750dba6002bb6f00b91e00e8471dc3ba6002bb6f00b91f00e83a1dc3" },
  { module: 29, address: "0000:B896", offset: 0x0b896, role: "battle-animation-setting side-panel frame selector", hex: "f606191101750dbaf801bb0b00b91400e8261dc3baf801bb0b00b91500e8191dc3" },
  { module: 29, address: "0000:B78C", offset: 0x0b78c, role: "battle side-panel click/key dispatcher", hex: "803ee3f6017504e83879c3e85c01e84202e8f64ac3a180f8" },
  { module: 29, address: "0000:B8F6", offset: 0x0b8f6, role: "side-panel hitbox to abstract flag mapping", hex: "803e90f5017401c3bbf07f8b1783faff74358b4f028b7704" },
  { module: 29, address: "0000:B9DF", offset: 0x0b9df, role: "abstract side-panel flag to handler mapping", hex: "33db8bb76a8083feff742d8a043c01740683c304ebecc3b0" },
  { module: 29, address: "0000:B941", offset: 0x0b941, role: "system menu dispatch", hex: "b8b641a3ba3de8079d833e4a3d587410e81300e82500e834" },
  { module: 29, address: "0000:D2E0", offset: 0x0d2e0, role: "INT 09h keyboard IRQ wrapper", hex: "505351521e06575616e80e00b020e620175e5f071f5a595b58cfb8ba1e8ed8e4" },
  { module: 29, address: "0000:D2FA", offset: 0x0d2fa, role: "read keyboard port 60h and update raw key state", hex: "b8ba1e8ed8e46050e4610c80e661247fe66158e80f00e81a00e82d0090909090" },
  { module: 29, address: "0000:D35D", offset: 0x0d35d, role: "Set-1 scan code to battle semantic-action mapper", hex: "33f68b8452f53dffff740f3bc375068bbc54f5880d83c604ebe8c380" },
  { module: 29, address: "0000:4A24", offset: 0x04a24, role: "release-disabled Caps Lock developer shortcut chords", hex: "e891fe803e2f134e749d803ee3f6017596803ecdf6017432803ee0f6017463eb" },
  { module: 29, address: "1000:33E4", offset: 0x133e4, role: "keyboard/mouse battle cursor and edge-scroll adapter", hex: "c6068e1b59803e1afb4e7419e8be00833eac00007509813e" },
  { module: 29, address: "1000:34B1", offset: 0x134b1, role: "mouse position to neutral/up/down/left/right edge-direction slot", hex: "813e21fbe001771dc706ac000000e85b00e87600e89100833e" },
];

const KEYBOARD_BINDINGS = [
  { scanCode: 0x48, key: "keypad 8 / Up", action: "up" },
  { scanCode: 0x11, key: "W", action: "up" },
  { scanCode: 0x50, key: "keypad 2 / Down", action: "down" },
  { scanCode: 0x2c, key: "Z", action: "down" },
  { scanCode: 0x4b, key: "keypad 4 / Left", action: "left" },
  { scanCode: 0x1e, key: "A", action: "left" },
  { scanCode: 0x4d, key: "keypad 6 / Right", action: "right" },
  { scanCode: 0x1f, key: "S", action: "right" },
  { scanCode: 0x1d, key: "Ctrl", action: "primary" },
  { scanCode: 0x52, key: "keypad 0 / Insert", action: "primary" },
  { scanCode: 0x39, key: "Space", action: "primary" },
  { scanCode: 0x38, key: "Alt", action: "secondary" },
  { scanCode: 0x53, key: "keypad decimal / Delete", action: "secondary" },
  { scanCode: 0x1c, key: "Enter", action: "secondary" },
];

const KEYBOARD_TABLE_SPECS = {
  27: {
    tableOffset: 0x2410,
    rawStateBase: 0x2567,
    actionFlags: { right: 0x244a, left: 0x244b, up: 0x244c, down: 0x244d, primary: 0x244e, secondary: 0x244f },
  },
  29: {
    tableOffset: 0xf552,
    rawStateBase: 0xf6a9,
    actionFlags: { right: 0xf58c, left: 0xf58d, up: 0xf58e, down: 0xf58f, primary: 0xf590, secondary: 0xf591 },
  },
};

const ACTION_MENU_SPECS = [
  { id: "basic", offset: 0x3dd8, expected: [["移    動", "M"], ["攻    擊", "A"], ["休    息", "H"]] },
  { id: "basicAfterMove", offset: 0x3dee, expected: [["攻    擊", "A"], ["結    束", "N"], ["返    悔", "X"]] },
  { id: "ranged", offset: 0x3e04, expected: [["移    動", "M"], ["攻    擊", "A"], ["射    擊", "S"], ["休    息", "H"]] },
  { id: "rangedAfterMoveShootOnly", offset: 0x3e1e, expected: [["射    擊", "S"], ["結    束", "N"], ["返    悔", "X"]] },
  { id: "rangedAfterMoveAttackAndShoot", offset: 0x3e34, expected: [["攻    擊", "A"], ["射    擊", "S"], ["結    束", "N"], ["返    悔", "X"]] },
  { id: "technique", offset: 0x3e4e, expected: [["移    動", "M"], ["攻    擊", "A"], ["技    術", "C"], ["休    息", "H"]] },
  { id: "class0FExtraMove", offset: 0x3faa, expected: [["移    動", "M"], ["放    棄", "N"]] },
];

const SYSTEM_MENU_SPEC = {
  id: "system",
  offset: 0x41b6,
  expected: [
    ["遊戲功能", "0Y"],
    ["勝利條件", "1Y"],
    ["讀取記錄", "2Y"],
    ["儲存記錄", "3Y"],
    ["離開遊戲", "4Y"],
  ],
};

const GROUP_COMMAND_DIALOGUE_SPECS = [
  {
    id: "allRest",
    selector: 0x1f,
    expectedPointer: 0x86e4,
    expectedText: "大家聽著！|所有還未行動的人在原地休息，補充體力．",
  },
  {
    id: "freeAction",
    selector: 0x20,
    expectedPointer: 0x8716,
    expectedText: "大家聽著！|所有還未行動的人自由行動．",
  },
  {
    id: "followLeader",
    selector: 0x21,
    expectedPointer: 0x873c,
    expectedText: "大家聽著！|所有還未行動的人跟著我來．",
  },
];

const SIDE_PANEL_HANDLERS = {
  "0000:BA18": { id: "save", effect: "open the numbered WAR save selector and write the selected slot" },
  "0000:BA22": { id: "load", effect: "open the numbered WAR load selector, load on confirmation, and redraw battle state" },
  "0000:BA2C": { id: "toggleGrid", effect: "toggle DS:111A 地圖方格 and invalidate cached battle tiles" },
  "0000:BA38": { id: "soundEffects", effect: "open the four-switch 音效開關 panel" },
  "0000:BA41": { id: "toggleEdgeScroll", effect: "toggle DS:111B 地圖捲動" },
  "0000:BA4A": { id: "togglePortraits", effect: "toggle DS:1118 人物圖像" },
  "0000:BA53": { id: "toggleBattleAnimation", effect: "toggle DS:1119 戰鬥動畫" },
  "0000:BA5C": { id: "vestigialToggle7FAD", effect: "toggle DS:7FAD; the release module has no other direct consumer, and its DS:7FB1 dispatch flag has neither a mouse hitbox nor a direct producer" },
  "0000:BA65": { id: "musicVolume", effect: "open 音樂開關 with 無聲/1/2/3/最大" },
  "0000:BA6E": { id: "allRest", effect: "heal every unspent side-1 behavior-0 unit by 15% max life, cap life, and mark all such units spent" },
  "0000:BA78": { id: "followLeader", effect: "mark the selected unit spent, set it as leader, and immediately AI-run remaining side-1 units in leader-cohesion mode" },
  "0000:BA82": { id: "freeAction", effect: "immediately AI-run remaining side-1 units without leader-cohesion mode" },
  "0000:BA8C": { id: "retreat", effect: "ask for confirmation, then return to module 27 at the same stage for redeployment" },
  "0000:BA96": { id: "groupCommandMenu", effect: "open 全部休息/跟隨主將/自由行動/全面徹退" },
  "0000:BAA0": { id: "systemMenu", effect: "open 遊戲功能/勝利條件/讀取記錄/儲存記錄/離開遊戲" },
  "0000:BAA4": { id: "victoryConditions", effect: "show the current stage victory-condition panel until either primary or secondary is pressed" },
  "0000:BAAE": { id: "quit", effect: "ask for confirmation; confirmation sets DS:2E72='Q' and returns to the parent with nextModule=0" },
};

const SIDE_PANEL_VISUAL_COMPOSITION = {
  resource: { container: "A.SWF", record: 6 },
  foundation: {
    frame: 19,
    origin: { x: 480, y: 0 },
    size: { width: 160, height: 149 },
  },
  releaseFixedOverlays: [
    {
      id: "windowDetail",
      valueOffset: 0x7fac,
      expectedInitialValue: 1,
      origin: { x: 584, y: 39 },
      framesByValue: { 0: 28, 1: 29 },
    },
    {
      id: "deskDetail",
      valueOffset: 0x7fb0,
      expectedInitialValue: 0,
      origin: { x: 528, y: 77 },
      framesByValue: { 0: 22, 1: 23 },
    },
  ],
  settingOverlays: [
    {
      id: "grid",
      label: "地圖方格",
      valueOffset: 0x111a,
      expectedInitialValue: 0,
      origin: { x: 600, y: 65 },
      size: { width: 32, height: 11 },
      framesByValue: { 0: 24, 1: 25 },
    },
    {
      id: "edgeScroll",
      label: "地圖捲動",
      valueOffset: 0x111b,
      expectedInitialValue: 1,
      origin: { x: 568, y: 106 },
      size: { width: 40, height: 31 },
      framesByValue: { 0: 26, 1: 27 },
    },
    {
      id: "portraits",
      label: "人物圖像",
      valueOffset: 0x1118,
      expectedInitialValue: 1,
      origin: { x: 608, y: 111 },
      size: { width: 16, height: 3 },
      framesByValue: { 0: 30, 1: 31 },
    },
    {
      id: "battleAnimation",
      label: "戰鬥動畫",
      valueOffset: 0x1119,
      expectedInitialValue: 1,
      origin: { x: 504, y: 11 },
      size: { width: 32, height: 33 },
      framesByValue: { 0: 20, 1: 21 },
    },
  ],
};

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function dataOffset(module, dsOffset, bytes, buffer) {
  const base = module === 27 ? MODULE27_DATA_BASE : MODULE29_DATA_BASE;
  const offset = base + dsOffset;
  if (offset < 0 || offset + bytes > buffer.length) {
    throw new Error(`module ${module} DS:${hex(dsOffset)} is outside the runtime image`);
  }
  return offset;
}

function readWord(module, buffer, dsOffset) {
  return buffer.readUInt16LE(dataOffset(module, dsOffset, 2, buffer));
}

function readPaletteRect(module, buffer, dsOffset) {
  const [x, y, width, height, colorIndex] = Array.from(
    { length: 5 },
    (_, index) => readWord(module, buffer, dsOffset + index * 2),
  );
  return {
    address: `${module === 27 ? hex(MODULE27_DATA_SEGMENT) : hex(MODULE29_DATA_SEGMENT)}:${hex(dsOffset)}`,
    x,
    y,
    width,
    height,
    colorIndex,
  };
}

function assertPaletteRect(actual, expected, label) {
  for (const [field, value] of Object.entries(expected)) {
    if (actual[field] !== value) {
      throw new Error(`${label}: expected ${field}=${value}, got ${actual[field]}`);
    }
  }
}

function parseDeploymentPresentation(module27) {
  const minimapDescriptors = {
    sharedOuter: readPaletteRect(27, module27, 0x19bc),
    side2Core: readPaletteRect(27, module27, 0x19c6),
    side1Core: readPaletteRect(27, module27, 0x19d0),
    openCore: readPaletteRect(27, module27, 0x19da),
    currentOuter: readPaletteRect(27, module27, 0x19e4),
    currentCore: readPaletteRect(27, module27, 0x19ee),
  };
  assertPaletteRect(minimapDescriptors.sharedOuter, { width: 4, height: 4, colorIndex: 0 }, "deployment minimap outer");
  assertPaletteRect(minimapDescriptors.side2Core, { width: 2, height: 2, colorIndex: 11 }, "deployment minimap side-2 core");
  assertPaletteRect(minimapDescriptors.side1Core, { width: 2, height: 2, colorIndex: 9 }, "deployment minimap side-1 core");
  assertPaletteRect(minimapDescriptors.openCore, { width: 2, height: 2, colorIndex: 15 }, "deployment minimap FF core");
  assertPaletteRect(minimapDescriptors.currentOuter, { width: 4, height: 4, colorIndex: 15 }, "deployment minimap current outer");
  assertPaletteRect(minimapDescriptors.currentCore, { width: 2, height: 2, colorIndex: 0 }, "deployment minimap current core");

  const errorDescriptors = [0x0f5e, 0x0f68, 0x0f72].map((offset) => readPaletteRect(27, module27, offset));
  [
    { x: 2, y: 328, width: 636, height: 20, colorIndex: 0 },
    { x: 3, y: 329, width: 635, height: 19, colorIndex: 15 },
    { x: 3, y: 329, width: 634, height: 18, colorIndex: 7 },
  ].forEach((expected, index) => assertPaletteRect(errorDescriptors[index], expected, `deployment error rectangle ${index}`));

  return {
    screen: { width: 640, height: 350, backgroundPaletteIndex: 0 },
    roster: {
      columns: 3,
      rows: 5,
      entriesPerPage: 15,
      itemOrigins: {
        x: [8, 152, 296],
        y: [35, 95, 155, 215, 275],
      },
      itemFrame: [
        { relative: { x: 0, y: 0 }, size: { width: 130, height: 50 }, colorIndex: 0 },
        { relative: { x: 1, y: 1 }, size: { width: 129, height: 49 }, colorIndex: 15 },
        { relative: { x: 1, y: 1 }, size: { width: 128, height: 48 }, colorIndex: 7 },
      ],
      figureFrame: {
        relative: { x: 8, y: 1 },
        layers: [
          { size: { width: 48, height: 48 }, colorIndex: 15 },
          { relative: { x: 1, y: 1 }, size: { width: 47, height: 47 }, colorIndex: 0 },
          { relative: { x: 1, y: 1 }, size: { width: 46, height: 46 }, colorIndex: 7 },
        ],
      },
      selectableProfessionBar: {
        relative: { x: 49, y: 24 },
        layers: [
          { size: { width: 80, height: 24 }, colorIndex: 15 },
          { relative: { x: 1, y: 1 }, size: { width: 79, height: 23 }, colorIndex: 0 },
          { relative: { x: 1, y: 1 }, size: { width: 78, height: 22 }, colorIndex: 7 },
        ],
        selectedLayers: [
          { size: { width: 80, height: 24 }, colorIndex: 0 },
          { relative: { x: 1, y: 1 }, size: { width: 79, height: 23 }, colorIndex: 15 },
          { relative: { x: 1, y: 1 }, size: { width: 78, height: 22 }, colorIndex: 8 },
        ],
      },
      figure: {
        resource: "A/0002",
        descriptorOffset: "0x008B",
        relativeOrigin: { x: 3, y: 2 },
        dimensions: { width: 40, height: 43 },
      },
      text: {
        drawFunction: "0000:271C",
        unitNameRelativeOrigin: { x: 72, y: 3 },
        professionRelativeOrigin: { x: 56, y: 27 },
        inkPaletteIndex: 15,
        outlinePaletteIndex: 0,
      },
    },
    controls: {
      pages: { origins: [{ x: 440, y: 35 }, { x: 440, y: 65 }, { x: 440, y: 95 }], size: { width: 80, height: 24 }, labels: ["Ⅰ", "Ⅱ", "Ⅲ"] },
      finish: { origin: { x: 540, y: 35 }, size: { width: 80, height: 24 }, label: "結束" },
      normalLayers: [15, 0, 7],
      activePageLayers: [0, 15, 8],
      labelRelativeOrigin: { x: 16, y: 3 },
    },
    minimap: {
      origin: { x: 440, y: 125 },
      grid: { width: 50, height: 50, cellSize: 4 },
      dimensions: { width: 200, height: 200 },
      occupancyValues: { side1: 1, side2: 2, openDeploymentCell: 255 },
      descriptors: minimapDescriptors,
      currentCell: "when the linear cell equals DS:0FF6, XOR both normal/current descriptor colours with palette index 15 and repaint; the input loop waits four module-delay ticks between refreshes",
    },
    feedback: {
      frameDescriptors: errorDescriptors,
      textOrigin: { x: 160, y: 330 },
      dismissal: "primary action only",
    },
  };
}

function decodeAction(word) {
  const low = word & 0xff;
  const high = word >>> 8;
  return high === 0 ? String.fromCharCode(low) : String.fromCharCode(low, high);
}

function readBig5Dollar(module, buffer, dsOffset) {
  const start = dataOffset(module, dsOffset, 1, buffer);
  let end = start;
  while (end < buffer.length && buffer[end] !== 0x24) end += 1;
  if (end === buffer.length) throw new Error(`module ${module} DS:${hex(dsOffset)} has no '$' terminator`);
  const raw = buffer.subarray(start, end);
  return {
    address: `${module === 27 ? hex(MODULE27_DATA_SEGMENT) : hex(MODULE29_DATA_SEGMENT)}:${hex(dsOffset)}`,
    text: new TextDecoder("big5", { fatal: true }).decode(raw),
    big5Hex: raw.toString("hex").toUpperCase(),
  };
}

function parseGroupCommandDialogues(buffer) {
  const pointerTable = 0x84bb;
  return Object.fromEntries(GROUP_COMMAND_DIALOGUE_SPECS.map((spec) => {
    const pointerAddress = pointerTable + spec.selector * 2;
    const pointer = readWord(29, buffer, pointerAddress);
    if (pointer !== spec.expectedPointer) {
      throw new Error(`${spec.id}: expected dialogue pointer DS:${hex(spec.expectedPointer)}, got DS:${hex(pointer)}`);
    }
    const line = readBig5Dollar(29, buffer, pointer);
    if (line.text !== spec.expectedText) {
      throw new Error(`${spec.id}: native command line differs from recovered text`);
    }
    return [spec.id, {
      selector: `0x${hex(spec.selector, 2)}`,
      pointerAddress: `${hex(MODULE29_DATA_SEGMENT)}:${hex(pointerAddress)}`,
      ...line,
      windowPlacement: "upper for the current side-1 command unit",
      manualConfirmation: false,
    }];
  }));
}

function verifyCodeSignatures(module27, module29) {
  return CODE_SIGNATURES.map((signature) => {
    const source = signature.module === 27 ? module27 : module29;
    const expected = Buffer.from(signature.hex, "hex");
    const actual = source.subarray(signature.offset, signature.offset + expected.length);
    if (!actual.equals(expected)) {
      throw new Error(`module ${signature.module} ${signature.address}: input/UI code signature mismatch`);
    }
    return {
      module: signature.module,
      address: signature.address,
      fileOffset: signature.offset,
      bytes: expected.length,
      role: signature.role,
      sha256: sha256(expected),
    };
  });
}

function parseKeyboardBindingTable(module, buffer) {
  const spec = KEYBOARD_TABLE_SPECS[module];
  const actionByFlag = new Map(Object.entries(spec.actionFlags).map(([action, flagOffset]) => [flagOffset, action]));
  const entries = [];
  let cursor = spec.tableOffset;
  for (let index = 0; index < 64; index += 1, cursor += 4) {
    const scanCode = readWord(module, buffer, cursor);
    if (scanCode === SENTINEL) break;
    const flagOffset = readWord(module, buffer, cursor + 2);
    const action = actionByFlag.get(flagOffset);
    if (action === undefined) throw new Error(`module ${module} keyboard table points to unknown flag DS:${hex(flagOffset)}`);
    entries.push({
      scanCode,
      scanCodeHex: `0x${hex(scanCode, 2)}`,
      key: KEYBOARD_BINDINGS[index]?.key ?? null,
      action,
      flagAddress: `${module === 27 ? hex(MODULE27_DATA_SEGMENT) : hex(MODULE29_DATA_SEGMENT)}:${hex(flagOffset)}`,
    });
  }
  const actual = entries.map(({ scanCode, action }) => ({ scanCode, action }));
  const expected = KEYBOARD_BINDINGS.map(({ scanCode, action }) => ({ scanCode, action }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`module ${module} physical keyboard binding table mismatch`);
  }
  return {
    module,
    address: `${module === 27 ? hex(MODULE27_DATA_SEGMENT) : hex(MODULE29_DATA_SEGMENT)}:${hex(spec.tableOffset)}`,
    rawStateBase: `${module === 27 ? hex(MODULE27_DATA_SEGMENT) : hex(MODULE29_DATA_SEGMENT)}:${hex(spec.rawStateBase)}`,
    entries,
  };
}

function parseHitboxes(module, buffer, tableOffset, kind, maximum = 64) {
  const entries = [];
  let cursor = tableOffset;
  for (let index = 0; index < maximum; index += 1, cursor += 10) {
    const first = readWord(module, buffer, cursor);
    if (first === SENTINEL) {
      return {
        kind,
        address: `${module === 27 ? hex(MODULE27_DATA_SEGMENT) : hex(MODULE29_DATA_SEGMENT)}:${hex(tableOffset)}`,
        fileOffset: dataOffset(module, tableOffset, 2, buffer),
        entries,
        sentinelAddress: `${module === 27 ? hex(MODULE27_DATA_SEGMENT) : hex(MODULE29_DATA_SEGMENT)}:${hex(cursor)}`,
      };
    }
    const words = Array.from({ length: 5 }, (_, word) => readWord(module, buffer, cursor + word * 2));
    if (kind === "originSizeValue") {
      const [x, y, width, height, value] = words;
      entries.push({ index, x, y, width, height, value, effectiveInterior: { minX: x + 1, maxX: x + width - 1, minY: y + 1, maxY: y + height - 1 } });
    }
    else {
      const [minX, maxX, minY, maxY, flagOffset] = words;
      entries.push({ index, minX, maxX, minY, maxY, flagAddress: `${hex(MODULE29_DATA_SEGMENT)}:${hex(flagOffset)}` });
    }
  }
  throw new Error(`module ${module} DS:${hex(tableOffset)} has no hitbox sentinel`);
}

function assertDeploymentHitboxes(roster, controls) {
  const expectedRoster = [];
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 5; row += 1) {
      expectedRoster.push({ x: 57 + column * 144, y: 59 + row * 60, width: 80, height: 24, value: column * 5 + row });
    }
  }
  const expectedControls = [
    { x: 440, y: 35, width: 80, height: 24, value: 0 },
    { x: 440, y: 65, width: 80, height: 24, value: 1 },
    { x: 440, y: 95, width: 80, height: 24, value: 2 },
    { x: 540, y: 35, width: 80, height: 24, value: 0x5341 },
  ];
  const equal = (actual, expected) => expected.every((entry, index) =>
    Object.entries(entry).every(([key, value]) => actual.entries[index]?.[key] === value));
  if (roster.entries.length !== 15 || !equal(roster, expectedRoster)) {
    throw new Error("module 27 deployment roster hitboxes differ from the recovered 3x5 layout");
  }
  if (controls.entries.length !== 4 || !equal(controls, expectedControls)) {
    throw new Error("module 27 deployment control hitboxes differ from the recovered page/finish layout");
  }
}

function parseMenu(buffer, spec) {
  const entries = [];
  let cursor = spec.offset;
  for (let index = 0; index < 32; index += 1, cursor += 4) {
    const labelOffset = readWord(29, buffer, cursor);
    const actionWord = readWord(29, buffer, cursor + 2);
    if (labelOffset === SENTINEL) {
      const actual = entries.map((entry) => [entry.label.text, entry.actionCode]);
      if (JSON.stringify(actual) !== JSON.stringify(spec.expected)) {
        throw new Error(`module 29 menu ${spec.id} differs from the recovered labels/actions`);
      }
      return {
        id: spec.id,
        address: `${hex(MODULE29_DATA_SEGMENT)}:${hex(spec.offset)}`,
        fileOffset: dataOffset(29, spec.offset, 2, buffer),
        entries,
        cancelActionCode: decodeAction(actionWord),
        sentinelAddress: `${hex(MODULE29_DATA_SEGMENT)}:${hex(cursor)}`,
      };
    }
    entries.push({
      index,
      label: readBig5Dollar(29, buffer, labelOffset),
      actionCode: decodeAction(actionWord),
      actionWord,
    });
  }
  throw new Error(`module 29 menu ${spec.id} has no sentinel`);
}

function parsePointerLabelPanel(buffer, spec) {
  const entries = [];
  let cursor = spec.labels;
  for (let index = 0; index < 16; index += 1, cursor += 2) {
    const labelOffset = readWord(29, buffer, cursor);
    if (labelOffset === SENTINEL) break;
    entries.push({
      index,
      label: readBig5Dollar(29, buffer, labelOffset),
      initialValue: buffer[dataOffset(29, spec.values + index, 1, buffer)],
      valueAddress: `${hex(MODULE29_DATA_SEGMENT)}:${hex(spec.values + index)}`,
    });
  }
  if (entries.length !== spec.count) throw new Error(`${spec.id}: expected ${spec.count} panel entries, got ${entries.length}`);
  return {
    id: spec.id,
    title: readBig5Dollar(29, buffer, spec.title),
    labelsAddress: `${hex(MODULE29_DATA_SEGMENT)}:${hex(spec.labels)}`,
    valuesAddress: `${hex(MODULE29_DATA_SEGMENT)}:${hex(spec.values)}`,
    hitboxesAddress: `${hex(MODULE29_DATA_SEGMENT)}:${hex(spec.hitboxes)}`,
    selectionModel: spec.selectionModel,
    entries,
  };
}

function parseSidePanelDispatch(buffer) {
  const tableOffset = 0x806a;
  const entries = [];
  let cursor = tableOffset;
  for (let index = 0; index < 32; index += 1, cursor += 4) {
    const flagOffset = readWord(29, buffer, cursor);
    if (flagOffset === SENTINEL) break;
    const handlerOffset = readWord(29, buffer, cursor + 2);
    const handler = `0000:${hex(handlerOffset)}`;
    const semantics = SIDE_PANEL_HANDLERS[handler];
    if (semantics === undefined) throw new Error(`${handler}: unknown side-panel dispatch handler`);
    entries.push({ index, flagAddress: `${hex(MODULE29_DATA_SEGMENT)}:${hex(flagOffset)}`, handler, ...semantics });
  }
  if (entries.length !== 17) throw new Error(`expected 17 side-panel dispatch entries, got ${entries.length}`);
  return { address: `${hex(MODULE29_DATA_SEGMENT)}:${hex(tableOffset)}`, fileOffset: dataOffset(29, tableOffset, 2, buffer), entries };
}

function joinSidePanelHitboxes(hitboxes, dispatch) {
  const byFlag = new Map(dispatch.entries.map((entry) => [entry.flagAddress, entry]));
  return hitboxes.entries.map((hitbox) => {
    const action = byFlag.get(hitbox.flagAddress);
    if (action === undefined) throw new Error(`${hitbox.flagAddress}: side-panel hitbox lacks a dispatch handler`);
    return { ...hitbox, action: { id: action.id, handler: action.handler, effect: action.effect } };
  });
}

function parseSidePanelVisualComposition(buffer) {
  const withInitialValue = (entry) => {
    const initialValue = buffer[dataOffset(29, entry.valueOffset, 1, buffer)];
    if (initialValue !== entry.expectedInitialValue) {
      throw new Error(
        `side-panel visual ${entry.id}: expected release value ${entry.expectedInitialValue}, got ${initialValue}`,
      );
    }
    const { valueOffset, expectedInitialValue, ...output } = entry;
    return {
      ...output,
      valueAddress: `${hex(MODULE29_DATA_SEGMENT)}:${hex(valueOffset)}`,
      initialValue,
      initialFrame: entry.framesByValue[initialValue],
    };
  };
  return {
    resource: SIDE_PANEL_VISUAL_COMPOSITION.resource,
    foundation: SIDE_PANEL_VISUAL_COMPOSITION.foundation,
    releaseFixedOverlays: SIDE_PANEL_VISUAL_COMPOSITION.releaseFixedOverlays.map(withInitialValue),
    settingOverlays: SIDE_PANEL_VISUAL_COMPOSITION.settingOverlays.map(withInitialValue),
    drawOrder: [
      "foundation",
      "windowDetail",
      "deskDetail",
      "edgeScroll",
      "grid",
      "portraits",
      "battleAnimation",
    ],
    behavior: "0000:B7C6 redraws A/6 frame 19, then replaces local rectangles with the selected opaque frames; the four setting overlays read the same release bytes toggled by the side-panel and game-function handlers",
  };
}

async function extract(module27Path, module29Path, outputPath) {
  const [module27, module29] = await Promise.all([readFile(module27Path), readFile(module29Path)]);
  const verifiedCodeSignatures = verifyCodeSignatures(module27, module29);

  const deploymentRoster = parseHitboxes(27, module27, 0x0e40, "originSizeValue");
  const deploymentControls = parseHitboxes(27, module27, 0x0ed8, "originSizeValue");
  assertDeploymentHitboxes(deploymentRoster, deploymentControls);
  const deploymentPresentation = parseDeploymentPresentation(module27);

  const actionMenus = ACTION_MENU_SPECS.map((spec) => parseMenu(module29, spec));
  const systemMenu = parseMenu(module29, SYSTEM_MENU_SPEC);
  if (!actionMenus.every((menu) => menu.cancelActionCode === "X") || systemMenu.cancelActionCode !== "X") {
    throw new Error("one or more generic menus no longer use X as the cancel action");
  }

  const groupCommandMenu = parseMenu(module29, {
    id: "groupCommands",
    offset: 0x3f3e,
    expected: [["全部休息", "0T"], ["跟隨主將", "1T"], ["自由行動", "2T"], ["全面徹退", "3T"]],
  });
  const groupCommandDialogues = parseGroupCommandDialogues(module29);
  const confirmationMenu = parseMenu(module29, {
    id: "confirmCancel",
    offset: 0x3f2c,
    expected: [["確 定 ", "SY"], ["取 消 ", "X"]],
  });

  const sidePanelHitboxes = parseHitboxes(29, module29, 0x7ff0, "inclusiveBoundsFlag");
  if (sidePanelHitboxes.entries.length !== 12) throw new Error(`expected 12 side-panel hitboxes, got ${sidePanelHitboxes.entries.length}`);
  const sidePanelDispatch = parseSidePanelDispatch(module29);
  const joinedSidePanelHitboxes = joinSidePanelHitboxes(sidePanelHitboxes, sidePanelDispatch);
  const sidePanelVisualComposition = parseSidePanelVisualComposition(module29);

  const settingsPanels = [
    parsePointerLabelPanel(module29, { id: "soundEffects", count: 4, title: 0x1103, labels: 0x10e1, values: 0x10eb, hitboxes: 0x119a, selectionModel: "four independent binary switches" }),
    parsePointerLabelPanel(module29, { id: "gameFunctions", count: 5, title: 0x114b, labels: 0x110c, values: 0x1118, hitboxes: 0x11c4, selectionModel: "five independent binary switches" }),
    parsePointerLabelPanel(module29, { id: "musicVolume", count: 5, title: 0x118d, labels: 0x1154, values: 0x1160, hitboxes: 0x11f8, selectionModel: "one-of-five exclusive selection" }),
  ];
  const keyboardBindingTables = {
    module27: parseKeyboardBindingTable(27, module27),
    module29: parseKeyboardBindingTable(29, module29),
  };
  const physicalKeyboardTablesIdentical =
    JSON.stringify(keyboardBindingTables.module27.entries.map(({ scanCode, action }) => [scanCode, action])) ===
    JSON.stringify(keyboardBindingTables.module29.entries.map(({ scanCode, action }) => [scanCode, action]));
  if (!physicalKeyboardTablesIdentical) {
    throw new Error("module 27/29 release keyboard binding tables no longer agree");
  }
  if (module29[dataOffset(29, 0x132f, 1, module29)] !== 0x4e) {
    throw new Error("module 29 release developer-mode gate is no longer initialized to 'N'");
  }

  const output = {
    format: "ANGEL2 native input and battle UI",
    semanticVersion: 6,
    sources: [
      { module: 27, path: module27Path, bytes: module27.length, sha256: sha256(module27) },
      { module: 29, path: module29Path, bytes: module29.length, sha256: sha256(module29) },
    ],
    verifiedCodeSignatures,
    abstractionBoundary: {
      rule: "gameplay consumers read shared semantic direction/action flags; the native INT 09h handlers and Set-1 mapping tables now close the release keyboard bindings for deployment and battle",
      webPort: "bind browser keyboard, pointer, gamepad, and accessibility controls to semantic actions first; do not treat AG2.JS3 bytes as DOM key codes",
      joymouseIntegration: "AG2-JS3.json independently closes the shipped Keyboard 4 Way path from all 12 Joymouse actions through the native 128-entry key table to these Set-1 consumers",
      unresolved: "legacy analog/Gravis/mouse device polling and exact DOS handling of E0-prefixed keys remain adapter-level compatibility details; they do not affect the shipped AG2.JS3 mapping or the recovered game semantic actions",
    },
    physicalKeyboard: {
      hardwarePath: "each module installs an INT 09h handler, reads PC/AT Set-1 scan codes from port 60h, stores 1 on make and 2 on break at rawStateBase+scanCode, then maps selected scan codes to semantic flags",
      stateValues: { pressed: 1, released: 2 },
      bindingTables: keyboardBindingTables,
      sharedReleaseBindingsIdentical: physicalKeyboardTablesIdentical,
      battleDirectBindings: [
        { scanCode: 0x47, key: "keypad 7 / Home", rawAddress: "1EBA:F6F0", action: "upLeft" },
        { scanCode: 0x49, key: "keypad 9 / Page Up", rawAddress: "1EBA:F6F2", action: "upRight" },
        { scanCode: 0x4f, key: "keypad 1 / End", rawAddress: "1EBA:F6F8", action: "downLeft" },
        { scanCode: 0x51, key: "keypad 3 / Page Down", rawAddress: "1EBA:F6FA", action: "downRight" },
        { scanCode: 0x01, key: "Escape", rawAddress: "1EBA:F6AA", action: "systemMenu" },
        { scanCode: 0x0f, key: "Tab", rawAddress: "1EBA:F6B8", action: "groupCommandMenu" },
        { scanCode: 0x12, key: "E", rawAddress: "1EBA:F6BB", action: "soundEffects" },
        { scanCode: 0x32, key: "M", rawAddress: "1EBA:F6DB", action: "musicVolume" },
        { scanCode: 0x3b, key: "F1", rawAddress: "1EBA:F6E4", action: "allRest" },
        { scanCode: 0x3c, key: "F2", rawAddress: "1EBA:F6E5", action: "followLeader" },
        { scanCode: 0x3d, key: "F3", rawAddress: "1EBA:F6E6", action: "freeAction" },
        { scanCode: 0x3e, key: "F4", rawAddress: "1EBA:F6E7", action: "retreat" },
      ],
      releaseDisabledDeveloperChords: {
        gate: { address: "1EBA:132F", releaseInitialValue: "N", directWriterInModule29: false, interpretation: "developer/debug shortcut master gate; the shipped module leaves it disabled" },
        modifier: { scanCode: 0x3a, key: "Caps Lock", rawAddress: "1EBA:F6E3", requiredState: 1 },
        chords: [
          { key: "J", scanCode: 0x24, rawAddress: "1EBA:F6CD", effect: "set battle outcome DS:2F83 to 999 and enter the normal victory/event dispatcher" },
          { key: "keypad *", scanCode: 0x37, rawAddress: "1EBA:F6E0", effect: "leave the battle module with nextModule=33, the normally post-stage-49 presentation/status module" },
        ],
        availability: "unreachable in the shipped release state unless DS:132F is externally patched away from 'N'",
      },
    },
    sharedActions: {
      module27: {
        mouseUse: { address: "095A:2A42", values: { Y: "mouse/pointer path", N: "keyboard navigation path" } },
        directions: { right: "095A:244A", left: "095A:244B", up: "095A:244C", down: "095A:244D" },
        primary: { address: "095A:244E", meaning: "confirm/select/toggle" },
        secondary: { address: "095A:244F", meaning: "cycle to next FF deployment cell on the map; it is not a general deployment cancel" },
      },
      module29: {
        mouseUse: { address: "1EBA:FB1A", values: { Y: "mouse/pointer path", N: "keyboard cursor path" } },
        directions: {
          up: "1EBA:F58E", down: "1EBA:F58F", left: "1EBA:F58D", right: "1EBA:F58C",
          upLeft: "1EBA:F6F0", upRight: "1EBA:F6F2", downLeft: "1EBA:F6F8", downRight: "1EBA:F6FA",
        },
        primary: { address: "1EBA:F590", meaning: "select/confirm/click" },
        secondary: { address: "1EBA:F591", meaning: "cancel/back during battle selection and generic menus" },
      },
    },
    deployment: {
      presentation: deploymentPresentation,
      navigation: {
        keyboardOnlyWhen: "095A:2A42 == 'N'",
        topology: "five cyclic columns: three 5-row roster columns, one 3-row page column, and one 1-row finish column",
        columns: [
          { index: 0, pointerX: 57, rows: [59, 119, 179, 239, 299], rosterValues: [0, 1, 2, 3, 4] },
          { index: 1, pointerX: 201, rows: [59, 119, 179, 239, 299], rosterValues: [5, 6, 7, 8, 9] },
          { index: 2, pointerX: 345, rows: [59, 119, 179, 239, 299], rosterValues: [10, 11, 12, 13, 14] },
          { index: 3, pointerX: 440, rows: [35, 65, 95], controls: ["Ⅰ", "Ⅱ", "Ⅲ"] },
          { index: 4, pointerX: 540, rows: [35], controls: ["結束"] },
        ],
        pointerPlacement: "0000:0FC8 places the shared pointer at table coordinate + (60,20), so keyboard and mouse feed the same hit-test/action layer",
      },
      rosterHitboxes: deploymentRoster,
      controlHitboxes: deploymentControls,
      interactions: {
        primaryRoster: "toggle the roster unit: place in the current FF cell or remove when non-fixed",
        primaryPage: "select page I/II/III",
        primaryFinish: "write JUST.TST and leave deployment",
        primaryBattleMap: "select the previous FF cell with wraparound",
        secondaryBattleMap: "select the next FF cell with wraparound",
        noFFCells: "both map-cycle directions set currentDeploymentCell to 0",
        noGenericSecondaryCancel: true,
      },
    },
    battleCursor: {
      viewport: { visibleColumns: 10, visibleRows: 7, tileWidth: 40, tileHeight: 44 },
      keyboard: {
        behavior: "eight abstract direction flags move the logical board cursor by one cell within map bounds, then recenter/clamp the 10x7 viewport",
      },
      mouse: {
        interior: { minX: 40, maxX: 432, minY: 26, maxY: 325 },
        cellX: "floor((pointerX - 40) / 40) + viewportOriginX; effective visible result 0..9",
        cellY: "floor((pointerY - 23) / 44) + viewportOriginY; the routine accepts 0..9, but the interior edge test limits live pointer input to visible rows 0..6",
        edges: { up: "pointerY < 26", down: "pointerY >= 326", left: "pointerX < 40", right: "pointerX >= 433" },
        directionSlot: {
          neutral: 0,
          up: 1,
          down: 2,
          left: 3,
          right: 4,
          cornerPrecedence: "horizontal is assigned first, then vertical overwrites it; corners therefore use up/down",
        },
        pointerArt: {
          resource: "A/0001",
          transparentPaletteIndex: 0,
          frames: [
            { frame: 0, state: "neutral/menu", width: 24, height: 24, appearance: "orange hand with raised index finger" },
            { frame: 1, state: "up edge", width: 24, height: 20, appearance: "solid white up arrow" },
            { frame: 2, state: "down edge", width: 24, height: 19, appearance: "solid white down arrow" },
            { frame: 3, state: "left edge", width: 24, height: 19, appearance: "solid white left arrow" },
            { frame: 4, state: "right edge", width: 24, height: 18, appearance: "solid white right arrow" },
          ],
        },
        edgeScrollGate: "scroll one cell only when an edge is active and either 地圖捲動 bit 0 is on or primary is held; clamp to map/viewport bounds",
      },
      selection: {
        primary: "on an interior cell, update the current linear cell and try to select an eligible unspent side-1 manual unit",
        secondary: "cancel the current battle selection/overlay and restore the neutral cursor state",
      },
    },
    menus: {
      genericInteraction: {
        mouse: "hover uses generated per-row hitboxes; primary returns the row action code; secondary returns X",
        keyboard: "up/down wrap cyclically; primary returns the selected action; secondary returns X",
        rowHitboxTemplate: { width: 136, height: 24, verticalStep: 24, maximumRows: 6 },
      },
      actionMenus,
      actionSemantics: {
        M: "move",
        A: "ordinary attack",
        S: "shoot",
        C: "technique",
        H: "rest, heal 15% max life, then spend action",
        N: "finish the current unit's post-move action without attacking/shooting, or abandon the class-0F extra move",
        X: "cancel; in post-move menus labeled 返悔, restore the pre-action cell and clear the action-spent bit",
        CT: "internal cancelled/try-again result",
        OK: "internal completed result",
      },
      phaseAndBattleCommands: {
        menu: groupCommandMenu,
        presentationOrdering: "all-rest, follow-leader, and free-action first finish their selector-bound contextual battle line without manual confirmation, restore the battlefield, and only then apply the command effect",
        allRest: {
          dialogue: groupCommandDialogues.allRest,
          effect: "all remaining unspent manual side-1 units rest and become spent, after which normal side-1 autonomous and enemy phases proceed",
        },
        followLeader: {
          dialogue: groupCommandDialogues.followLeader,
          effect: "hand remaining side-1 units to AI with the selected cell as a temporary cohesion leader",
        },
        freeAction: {
          dialogue: groupCommandDialogues.freeAction,
          effect: "hand remaining side-1 units to AI without the temporary leader",
        },
        retreat: { prompt: "哦！．．．要撤退嗎？|必竟是沒辦法的事，雙方的實力差太多了．", confirmedTransition: { nextModule: 27, nextStage: "currentStage", exitFlag: "Y" } },
      },
      confirmation: confirmationMenu,
      system: {
        menu: systemMenu,
        quitPrompt: "唉啊！．．．要休息了嗎？|請再考慮一下吧！",
        quitConfirmed: "DS:2E72='Q'; main loop sets nextModule=0 and returns",
        victoryConditionsClose: "either primary or secondary closes the condition panel",
      },
    },
    sidePanel: {
      hitboxTable: { ...sidePanelHitboxes, entries: joinedSidePanelHitboxes },
      dispatchTable: sidePanelDispatch,
      dispatchWithoutMouseHitbox: sidePanelDispatch.entries.filter((entry) => !sidePanelHitboxes.entries.some((hitbox) => hitbox.flagAddress === entry.flagAddress)),
      settingsPanels,
      visualComposition: sidePanelVisualComposition,
    },
    unitHud: {
      exactPresentationSpec: "reverse/parsed/native/hud-presentations.json",
      activation: "when unit-detail display is enabled and a nonempty cell remains focused for four update ticks, redraw only if the focused linear cell changed",
      dismissal: "moving off a unit or out of the battle playfield dismisses the panel and restores the minimap/side panel",
      portrait: { recordField: "DS:3192", source: "dynamic indexed request to D.SWF (loader container 2), frame 0", origin: { x: 488, y: 8 }, dimensions: { width: 112, height: 112 }, mappingBoundary: "the complete DS:3192-to-extracted-D-record mapping remains unasserted" },
      identity: { visibleOrder: "occupation / per-unit name", occupationSource: "DS:31BB", nameSource: "DS:3190", origins: { occupation: [484, 124], slash: [552, 124], name: [564, 124] } },
      round: { field: "DS:2F83", drawFunction: "0000:88E4", origin: { x: 516, y: 327 }, template: "第  10  回合" },
      numericFields: [
        { address: "DS:319F", meaning: "current life" },
        { address: "DS:31C3", meaning: "maximum life" },
        { address: "DS:318E", meaning: "current experience" },
        { address: "DS:31A1", meaning: "next experience threshold accumulator" },
        { address: "DS:31BD", meaning: "current level/growth row" },
        { address: "DS:31BF", meaning: "effective attack after status/difficulty adjustment" },
        { address: "DS:31C1", meaning: "effective defense after status/difficulty adjustment" },
        { address: "DS:31CF", meaning: "base/current attack before temporary status adjustment" },
        { address: "DS:31D1", meaning: "base/current defense before temporary status adjustment" },
      ],
      statuses: "scan all eight status words DS:31A7..31B5; use matching A/17 frame 0..7, and tightly pack active 40x31 icons into four columns by two rows with low-15-bit counters",
      proportionalBars: "draw 100-pixel life and cumulative-experience bars beside the portrait at x=606 and x=619",
      stage37EnemyConcealment: "in the release build, stage 37 side-2 detail replaces all nine five-character numeric fields with ????? while retaining the real underlying state",
      positioning: "the exact unit detail panel occupies x=480..639 in the native 640x350 coordinate space; generic menus dynamically avoid covering the current pointer/panel rectangle",
    },
    controlFlowCorrections: {
      currentUnitEndNotSideEnd: "結束 in the post-move action menus ends only the current unit's action",
      explicitPlayerPhaseEnd: "全部休息 is the normal explicit way to finish the remaining manual player phase early, and it heals/spends every remaining behavior-0 side-1 unit",
      retreatNotDefeat: "全面徹退 is a user-requested return to module 27 at the same stage; it is distinct from objective defeat even though both re-enter deployment",
      quit: "離開遊戲 confirmation is the DS:2E72='Q' branch previously left unnamed",
    },
    validation: {
      allCodeSignaturesVerified: verifiedCodeSignatures.length === CODE_SIGNATURES.length,
      verifiedCodeSignatureCount: verifiedCodeSignatures.length,
      deploymentRosterHitboxes: deploymentRoster.entries.length,
      deploymentControlHitboxes: deploymentControls.entries.length,
      parsedDeploymentPresentation: true,
      parsedActionMenus: actionMenus.length,
      parsedSidePanelHitboxes: sidePanelHitboxes.entries.length,
      parsedSidePanelDispatches: sidePanelDispatch.entries.length,
      parsedSidePanelSettingVisuals: sidePanelVisualComposition.settingOverlays.length,
      parsedSettingsRows: settingsPanels.reduce((sum, panel) => sum + panel.entries.length, 0),
      parsedGroupCommandDialogues: Object.keys(groupCommandDialogues).length,
      parsedPhysicalKeyboardBindingsPerModule: KEYBOARD_BINDINGS.length,
      physicalKeyboardTablesIdentical,
      releaseDeveloperGateDisabled: true,
      implementationFrozen: true,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    `verified ${verifiedCodeSignatures.length} input/UI signatures, ${deploymentRoster.entries.length + deploymentControls.entries.length} deployment hitboxes, and ${sidePanelDispatch.entries.length} side-panel actions to ${outputPath}`,
  );
}

function usage() {
  return "usage: angel2-input-ui.mjs --extract MODULE27.bin MODULE29.bin OUTPUT.json";
}

const [command, module27Path, module29Path, outputPath] = process.argv.slice(2);
if (command !== "--extract" || module27Path === undefined || module29Path === undefined || outputPath === undefined) {
  console.error(usage());
  process.exitCode = 1;
}
else {
  extract(module27Path, module29Path, outputPath).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { CODE_SIGNATURES, extract };
