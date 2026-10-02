#!/usr/bin/env node

/**
 * 模块 29 发布版开发／调试模式（DS:`132F` 主门）的机器取证。
 *
 * 旧结论把 DS:`132F` 记成“初值 N、模块内无写入者、发布版不可达”。实际上模块初始化 `0000:1146`
 * 把 `0000:1160` 挂进 INT 09h 处理器，每个键盘中断字节都会经过 `0000:116C` 的组合键检测；
 * 按住数字键盘 1/3/5（且 2/4/6 未按）依序按 S、W、F，`0000:11CC` 就把主门写成 `Y`。
 * 本工具逐段核验检测器、调试分发器、各热键处理器、选单描述、音乐盒、编辑器与写盘例程，
 * 并把可由原版数据直接读出的表（选单文字、音乐别名、地形名、行为名、职业表头）原样导出。
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE29_SHA256 = "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4";
const MODULE29_DATA_BASE = 0x1eba0;
const RAW_KEY_BASE = 0xf6a9;

const big5 = new TextDecoder("big5");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const hex = (value, digits = 4) => value.toString(16).toUpperCase().padStart(digits, "0");
const segmentAddress = (offset) => `${hex((offset >>> 16) * 0x1000)}:${hex(offset & 0xffff)}`;
const ds = (offset) => `DS:${hex(offset)}`;
const bytes = (text) => text.trim().split(/\s+/u).map((byte) => Number.parseInt(byte, 16));

function expectBytes(image, offset, signature, label) {
  const expected = bytes(signature);
  const actual = image.subarray(offset, offset + expected.length);
  assert(actual.equals(Buffer.from(expected)), `${label}: signature mismatch at ${segmentAddress(offset)}`);
  return { address: segmentAddress(offset), bytes: expected.length, label };
}

const dataOffset = (offset) => MODULE29_DATA_BASE + offset;
const word = (image, dsOffset) => image.readUInt16LE(dataOffset(dsOffset));

/** 原版字符串以 `$` 结束；双字节 Big5 尾字节不会等于 24h，可安全线性扫描。 */
function dollarString(image, dsOffset, limit = 160) {
  const start = dataOffset(dsOffset);
  const end = image.indexOf(0x24, start);
  assert(end >= start && end - start <= limit, `unterminated $-string at ${ds(dsOffset)}`);
  return big5.decode(image.subarray(start, end));
}

/** 通用选单描述：`{u16 文字指针, 两字节结果码}* FFFFh, x, y, w, h`，由 `0000:5651` 执行。 */
function parseMenu(image, dsOffset) {
  const items = [];
  let cursor = dsOffset;
  while (word(image, cursor) !== 0xffff) {
    const text = word(image, cursor);
    const code = image.subarray(dataOffset(cursor + 2), dataOffset(cursor + 4)).toString("latin1");
    items.push({ code, label: dollarString(image, text), textAddress: ds(text) });
    cursor += 4;
    assert(items.length <= 16, `menu ${ds(dsOffset)} is not terminated`);
  }
  const [x, y, width, height] = [2, 4, 6, 8].map((delta) => word(image, cursor + delta));
  return { descriptor: ds(dsOffset), items, origin: { x, y }, size: { width, height } };
}

/** 矩形描述 `{x, y, w, h, colour}`，`0000:D050` 逐项填色。 */
function parseRect(image, dsOffset) {
  const [x, y, width, height, colour] = [0, 2, 4, 6, 8].map((delta) => word(image, dsOffset + delta));
  return { descriptor: ds(dsOffset), x, y, width, height, colour };
}

/** 热区表 `{x, y, w, h, value}* FFFFh`；`0000:D480/D484` 只认严格内部点。 */
function parseHitboxes(image, dsOffset) {
  const entries = [];
  for (let cursor = dsOffset; word(image, cursor) !== 0xffff; cursor += 10) {
    const [x, y, width, height, value] = [0, 2, 4, 6, 8].map((delta) => word(image, cursor + delta));
    entries.push({ x, y, width, height, value });
    assert(entries.length <= 32, `hitbox table ${ds(dsOffset)} is not terminated`);
  }
  return { table: ds(dsOffset), test: "strict interior: x < px < x+w and y < py < y+h", entries };
}

const SCAN_CODES = {
  escape: 0x01, one: 0x02, two: 0x03, w: 0x11, u: 0x16, p: 0x19, s: 0x1f, d: 0x20, f: 0x21, j: 0x24, k: 0x25,
  m: 0x32, keypadStar: 0x37, capsLock: 0x3a, f1: 0x3b, f2: 0x3c, f3: 0x3d, f4: 0x3e, f5: 0x3f, f6: 0x40, f10: 0x44,
  keypadMinus: 0x4a, keypad4: 0x4b, keypad5: 0x4c, keypad6: 0x4d, keypad1: 0x4f, keypad2: 0x50, keypad3: 0x51,
};
const rawKey = (scanCode) => ds(RAW_KEY_BASE + scanCode);
const key = (name, label) => ({ key: label, scanCode: `${hex(SCAN_CODES[name], 2)}h`, rawAddress: rawKey(SCAN_CODES[name]) });

function verifySignatures(image) {
  return [
    // 模块初始化挂两个回调：键盘中断字节回调 1160、计时器 tick 回调 11F2。
    expectBytes(image, 0x1146, "b8 ba 1e 8e d8 8c c8 8e c0 ba 60 11 e8 3d c0 8c c8 8e c0 ba f2 11 e8 58 c0 c3",
      "INT 09h / INT 08h callback registration (1160 via D192, 11F2 via D1B7)"),
    expectBytes(image, 0x1160, "b8 ba 1e 8e d8 e8 6a 00 e8 01 00 cb",
      "keyboard callback: K mouse toggle 11D2, then debug combo detector 116C"),
    expectBytes(image, 0x116c, `
      80 3e f9 f6 01 74 47 80 3e f4 f6 01 74 40 80 3e f6 f6 01 74 39 80 3e f8 f6 01 75 32
      80 3e fa f6 01 75 2b 80 3e f5 f6 01 75 24 80 3e c8 f6 01 74 1e 80 3e 2c 13 01 75 16
      80 3e ba f6 01 74 16 80 3e 2d 13 01 75 08 80 3e ca f6 01 74 0e c3 c3
      c6 06 2c 13 01 c3 c6 06 2d 13 01 c3 c6 06 2e 13 01 c6 06 2f 13 59 c3`,
    "debug combo detector: keypad 1+3+5 held, 2/4/6 released, S then W then F"),
    expectBytes(image, 0x11d2, "80 3e ce f6 01 74 01 c3 c6 06 ce f6 00 80 3e 1a fb 59 74 06 c6 06 1a fb 59 c3 c6 06 1a fb 4e c3",
      "ungated K toggles MOUSE_USE"),
    expectBytes(image, 0x30ce, `
      80 3e 2f 13 59 74 01 c3 e8 29 00 e8 7b 00 e8 b6 00 e8 f1 00 e8 19 00 e8 26 01 e8 36 01
      e8 dd 01 e8 41 01 e8 56 01 9a 04 00 15 13 c3`,
    "debug key dispatcher (F2, F3, F4, F5/F6, W, F10, F1, U/D, S, 2, M music box)"),
    expectBytes(image, 0xb78c, "80 3e e3 f6 01 75 04 e8 38 79 c3",
      "idle battle loop enters the dispatcher only while Caps Lock is held"),
    expectBytes(image, 0x54bc, "e8 0f dc 9a 04 00 3e 13", "target/destination cursor step calls the dispatcher"),
    expectBytes(image, 0x0766, "e8 65 29", "promotion class-choice loop calls the dispatcher"),
    expectBytes(image, 0x5960, "e8 6b d7", "popup menu move handle calls the dispatcher"),
    expectBytes(image, 0x5cb9, "e8 12 d4", "popup menu second handle calls the dispatcher"),
    expectBytes(image, 0x4a27, "80 3e 2f 13 4e 74 9d 80 3e e3 f6 01 75 96 80 3e cd f6 01 74 32 80 3e e0 f6 01 74 63 eb 86",
      "main loop Caps+J / Caps+keypad *"),
    expectBytes(image, 0x4a6e, "c7 06 83 2f e7 03 9a 08 00 2a 14", "Caps+J writes battle result 999 and enters the victory dispatcher"),
    expectBytes(image, 0x4aa6, "c7 06 06 00 21 00 c3", "Caps+keypad * leaves with nextModule 33"),
    expectBytes(image, 0x3102, "80 3e e5 f6 01 74 01 c3 b8 3c 41 a3 ba 3d e8", "F2 opens menu 413C"),
    expectBytes(image, 0x3133, `
      e8 73 d9 c6 06 d3 7f 01 c3 e8 55 d9 c6 06 d3 7f 02 c3 e8 4c e1 90 0e e8 a0 22 90 0e e8 ab 22 c3 e8 e4 e9 c3`,
    "F2 results: 我EDIT 0AA9, 敵EDIT 0A94, 兵種 1294 + HP clamp, 地型 1B3A"),
    expectBytes(image, 0x3157, "80 3e e6 f6 01 74 01 c3 b8 56 41 a3 ba 3d e8", "F3 opens menu 4156"),
    expectBytes(image, 0x3195, "80 3e e7 f6 01 74 01 c3 b8 6c 41 a3 ba 3d e8", "F4 opens menu 416C"),
    expectBytes(image, 0x31d3, `
      80 3e e8 f6 01 74 08 80 3e e9 f6 01 74 0d c3 c6 06 e8 f6 00 b8 82 41 e8 29 3a c3
      c6 06 e9 f6 00 b8 9c 41 e8 1d 3a c3`,
    "F5/F6 open the technique test menus through 6C16"),
    expectBytes(image, 0x31fa, "80 3e ba f6 01 74 01 c3 be 6c 1b 9a 04 00 18 19 e8 a8 00 c3", "W writes an A##.PCX capture"),
    expectBytes(image, 0x320e, "80 3e ed f6 01 74 01 c3 c6 06 ed f6 00 9a 0e 00 47 11 c3", "F10 clears every side-1 acted bit"),
    expectBytes(image, 0x3221, "80 3e e4 f6 01 74 01 c3 c6 06 e4 f6 00 e8 d1 f0 c3", "F1 opens the AI behaviour editor 2302"),
    expectBytes(image, 0x3232, "80 3e c8 f6 01 74 01 c3 8b 1e 09 5a b8 22 00 e8 3a 97 c6 06 c8 f6 00 c3", "S forces battle line 22h"),
    expectBytes(image, 0x324a, "80 3e ac f6 01 74 01 c3 c6 06 ac f6 00", "2 prints cursor cell and DS:0000"),
    expectBytes(image, 0x32cb, `
      80 3e bf f6 01 74 08 80 3e c9 f6 01 74 24 c3 c6 06 bf f6 00 8b 1e 09 5a e8 44 1d a1 8e 31 05 32 00
      8b 36 b9 31 89 44 02 a1 80 f8 e8 01 c5 e8 66 56 c3 c6 06 c9 f6 00 8b 1e 09 5a e8 21 1d a1 8e 31
      2d 32 00 3d 00 00 7e 07 8b 36 b9 31 89 44 02`,
    "U adds 50 EXP, D subtracts 50 only while the result stays positive"),
    expectBytes(image, 0x1147e, "c6 06 d7 80 59 2e c6 06 83 01 01 e8 3d 0e c6 06 d7 80 4e cb", "F10 body: clear side-1 acted bits"),
    expectBytes(image, 0x6c16, "a3 ba 3d 8b 1e 09 5a 89 1e 16 1f e8 06 e4 83 3e c9 31 00 74 3a", "technique test caster = unit under cursor"),
    expectBytes(image, 0x6c54, "e8 8d 09", "technique test commits through the normal 75E4 path"),
    expectBytes(image, 0x54ee, "80 3e 2f 13 59 75 07 80 3e f3 f6 01 74 1e c3", "keypad - in the map click step"),
    expectBytes(image, 0x551a, "c6 06 f3 f6 00 a1 24 00 8e c0 8b 1e 09 5a e8 ff fa a1 9f 31 3d 0a 00 72 0c 2d 0a 00 8b 1e b9 31 89 07",
      "keypad - subtracts 10 HP when HP >= 10"),
    expectBytes(image, 0x8448, "80 3e 2f 13 59 74 01 c3 80 3e e3 f6 01 74 01 c3 80 3e ab f6 01 74 01 c3",
      "Caps+1 prints the range-map byte on viewport cells"),
    expectBytes(image, 0x81a2, "80 3e 2f 13 59 74 07 83 3e 77 2e 25 74 13", "stage 37 side-2 map life label hidden unless debug"),
    expectBytes(image, 0x8bd6, "80 3e 2f 13 59 74 07 83 3e 77 2e 25 74 01 c3 83 3e c9 31 02", "stage 37 side-2 HUD ????? unless debug"),
    expectBytes(image, 0xad9d, "80 3e 2f 13 4e 74 13 80 3e c2 f6 01 75 0c be d2 7d 9a 04 00 18 19", "P captures the full-screen combat"),
    expectBytes(image, 0x13154, "80 3e db f6 01 74 01 cb", "music box entry far 1315:0004 requires M"),
    expectBytes(image, 0x13285, `
      80 3e 90 f5 01 74 01 c3 c6 06 90 f5 00 83 3e d8 19 00 74 08 ff 0e d8 19 ba 59 00 c3 c7 06 d8 19 1e 00 ba 59 00 c3
      80 3e 91 f5 01 74 01 c3 c6 06 91 f5 00 83 3e d8 19 1e 74 08 ff 06 d8 19 ba 59 00 c3 c7 06 d8 19 00 00 ba 59 00 c3`,
    "music box index: primary = previous, secondary = next, wrap 0..30"),
    expectBytes(image, 0x3170, "a1 4a 3d 3d 31 59 74 0b 3d 32 59 74 0c 3d 33 59 74 0d c3 90 0e e8 f3 21 c3 90 0e e8 2c 22 c3 90 0e e8 49",
      "F3 results 1Y/2Y/3Y -> 537B/53BA/53DD"),
    expectBytes(image, 0x31ae, "a1 4a 3d 3d 31 4d 74 0b 3d 32 4d 74 0c 3d 33 4d 74 0d c3 90 0e e8 a5 21 c3 90 0e e8 db 21 c3 90 0e e8 fb 21 c3",
      "F4 results 1M/2M/3M -> 536B/53A7/53CD"),
    expectBytes(image, 0x536b, "c7 06 8a 31 75 54 2e c6 06 34 54 01 e8 93 00 cb", "side 1 full life"),
    expectBytes(image, 0x537b, "c7 06 8a 31 75 54 2e c6 06 34 54 02 e8 83 00 cb", "side 2 full life"),
    expectBytes(image, 0x53a7, "c7 06 8a 31 6b 54 2e c6 06 34 54 01 e8 57 00 e8 7c 00 cb", "side 1 life 0 + clear board"),
    expectBytes(image, 0x53ba, "c7 06 8a 31 6b 54 2e c6 06 34 54 02 e8 44 00 e8 69 00 cb", "side 2 life 0 + clear board"),
    expectBytes(image, 0x53cd, "c7 06 8a 31 61 54 2e c6 06 34 54 01 e8 31 00 cb", "side 1 life 1"),
    expectBytes(image, 0x53dd, "c7 06 8a 31 61 54 2e c6 06 34 54 02 e8 21 00 cb", "side 2 life 1"),
    expectBytes(image, 0x5461, "b8 01 00 8b 1e b9 31 89 07 c3 b8 00 00 8b 1e b9 31 89 07 c3 a1 c3 31 8b 1e b9 31 89 07 c3",
      "per-unit life writers: 1, 0, max life DS:31C3"),
    expectBytes(image, 0x5435, "b9 c4 09 bb 00 00 51 53 a1 24 00 8e c0 26 8a 07 2e 3a 06 34 54 75 0f b0 00 26 88 07 a1 22 00 8e c0 b0 00 26 88 07",
      "clear every board cell of the chosen side (no death handling)"),
    expectBytes(image, 0x326a, "be 7a 1b e8 e0 9d a1 09 5a 8b c8 be 74 1b 90 0e e8 d5 bc b8 28 00 a3 ba f8 b8 1e 00 a3 bc f8 be 74 1b e8 75 b7 be 84 1b e8 bb 9d a1 00 00 8b c8 be 74 1b 90 0e e8 b0 bc b8 78 00 a3 ba f8 b8 1e 00 a3 bc f8 be 74 1b e8 50 b7 c3",
      "2 readout: clear 1B7A, cell DS:5A09 at (40,30); clear 1B84, DS:0000 at (120,30)"),
    expectBytes(image, 0x12f1, "e8 1c 00 e8 9e 00", "class editor Esc: DATA.SWF writer 1310 then loader 1395"),
    expectBytes(image, 0x1baf, "e8 1c 00 e8 59 00", "terrain editor Esc: MAP.SWF writer 1BCE then loader 1C0E"),
  ];
}

/**
 * `1000:32D1` 的单曲名单：命中即走 `1000:338F` 单曲循环；其余记录 N 先播 N+1 入场，再接 N 循环。
 */
function parseMusicBoxSingles(image) {
  const singles = [];
  let cursor = 0x132de + 3; // mov ax,[19F1]
  for (;;) {
    if (image[cursor] !== 0x3d) break;
    singles.push(image.readUInt16LE(cursor + 1));
    cursor += image[cursor + 3] === 0x75 ? 8 : 5;
  }
  assert(singles.length === 15, `expected 15 single-loop music box records, found ${singles.length}`);
  return singles;
}

function parseMusicBox(image) {
  const entries = [];
  for (let index = 0; ; index += 1) {
    const offset = 0x19f6 + index * 11;
    const mode = image[dataOffset(offset)];
    if (mode !== 1 && mode !== 2) break;
    const record = image[dataOffset(offset) + 1];
    const legacyName = image.subarray(dataOffset(offset) + 2, dataOffset(offset) + 11).toString("ascii").replace(/\$/gu, "").trim();
    entries.push({ index, tableAddress: ds(offset), container: mode === 1 ? "MUSIC" : "MAGIC", record, legacyName });
  }
  assert(entries.length === 32, `expected 32 music box entries, found ${entries.length}`);
  const lastReachable = 0x1e;
  const singles = new Set(parseMusicBoxSingles(image));
  return {
    entry: "1000:3154 (far 1315:0004 from the dispatcher)",
    trigger: "M key raw state DS:F6DB == 1; the 音樂 side-panel hotspot writes the same flag",
    indexVariable: { address: "DS:19D8", initial: word(image, 0x19d8), first: 0, last: lastReachable },
    navigation: "pointer over the MUSIC row: primary (left) = previous, secondary (right) = next, both wrap within 0..30; pointer over PLAY + primary plays; Esc closes",
    layout: {
      rects: [0x199c, 0x19a6, 0x19b0, 0x19ba, 0x19c4, 0x19ce].map((offset) => parseRect(image, offset)),
      hitboxes: parseHitboxes(image, 0x1b56),
      text: [
        { id: "musicPrefix", text: dollarString(image, 0x19df), x: 0x74, y: 0x6e, note: "the five digits at DS:19E5 are the 0-based index, right-aligned" },
        { id: "legacyName", source: "entry name", x: 0xdc, y: 0x6e },
        { id: "play", text: dollarString(image, 0x19da), x: 0x74, y: 0x8c },
      ],
    },
    playback: {
      singleLoopRecords: [...singles].sort((left, right) => left - right),
      singleLoop: "container record, RIX driver command 1 mode 1 (loop forever)",
      pair: "other MUSIC records N: load N+1 then N, submit N+1 as the entry and N as the seamless loop (same as battle phase pairs)",
      afterClose: "the chosen track keeps playing; nothing restores the battle track until the next native music selection",
    },
    entries: entries.map((entry) => ({ ...entry, reachable: entry.index <= lastReachable })),
  };
}

function parseLabelTable(image, tableOffset, count) {
  return Array.from({ length: count }, (_, value) => {
    const pointer = word(image, tableOffset + value * 2);
    // 我／敵 EDIT 的第 9 项把表自身地址当成文字指针（应为 0CC0h「帶 4」），解出来只是乱码。
    if (pointer === tableOffset) return { value, textAddress: ds(pointer), defect: "pointer equals the table base; renders garbage" };
    return { value, label: dollarString(image, pointer).trim(), textAddress: ds(pointer) };
  });
}

function parseTerrainLabels(image) {
  return Array.from({ length: 24 }, (_, slot) => ({
    slot,
    label: dollarString(image, 0x1585 + slot * 5).trim(),
    textAddress: ds(0x1585 + slot * 5),
    ...(slot === 23 ? { caution: "slot 23 is the overlap word: editing it writes slot 0 of the next short-code profile" } : {}),
  }));
}

function parseClassEditorHeader(image) {
  const header = dollarString(image, 0x13d9);
  const labels = header.trim().split(/\s+/u);
  const fields = ["experienceThreshold", "attack", "defense", "life", "movement", "field5", "level"];
  assert(labels.length === fields.length, `unexpected class editor header ${header}`);
  return {
    address: ds(0x13d9),
    raw: header,
    columns: fields.map((field, column) => ({ column, x: 120 + column * 56, field, label: labels[column] })),
    note: "field5 is labelled 魔防; the level column repeats the 經驗 label",
  };
}

async function extract(modulePath, outputPath) {
  const image = await readFile(modulePath);
  assert(sha256(image) === MODULE29_SHA256, "module 29 image hash changed");
  const signatures = verifySignatures(image);
  assert(image[dataOffset(0x132f)] === 0x4e, "DS:132F must load as 'N'");
  assert([0x132c, 0x132d, 0x132e].every((offset) => image[dataOffset(offset)] === 0), "combo step flags must load as 0");

  const menus = {
    f2: parseMenu(image, 0x413c),
    f3: parseMenu(image, 0x4156),
    f4: parseMenu(image, 0x416c),
    f5: parseMenu(image, 0x4182),
    f6: parseMenu(image, 0x419c),
    techniqueRanks: Object.fromEntries([
      ["1?", 0x3e68], ["2?", 0x3e82], ["3?", 0x3e9c], ["4?", 0x3eee],
      ["5?", 0x3f16], ["6?", 0x3f94], ["7?", 0x3f58], ["8?", 0x3f76],
    ].map(([code, offset]) => [code, parseMenu(image, offset)])),
  };
  const techniqueCodes = Object.values(menus.techniqueRanks).flatMap((menu) => menu.items.map((item) => item.code));
  assert(techniqueCodes.length === 31, `expected 31 technique test codes, found ${techniqueCodes.length}`);
  assert(menus.f6.items[0].label.startsWith("治") && menus.techniqueRanks["5?"].items[0].code === "1I",
    "the 治療 header must open the 回復 ranks (original label swap)");

  const behaviourLabels = parseLabelTable(image, 0x16b4, 13);
  const output = {
    format: "ANGEL2 module 29 developer debug mode",
    semanticVersion: 1,
    source: { module: 29, path: modulePath, sha256: MODULE29_SHA256 },
    verifiedCodeSignatures: signatures,
    correction: "DS:132F is written by 0000:11CC in the shipped module; the debug mode is reachable without patching. Earlier notes that called it release-unreachable are superseded.",
    gate: {
      address: ds(0x132f),
      initialValue: "N",
      enabledValue: "Y",
      writer: "0000:11CC",
      detector: "0000:116C",
      callbackRegistration: "0000:1146 patches 0000:1160 into the INT 09h handler (0000:D192 -> D2E0); it runs on every keyboard interrupt byte",
      stepFlags: [ds(0x132c), ds(0x132d), ds(0x132e)],
      combo: {
        hold: [key("keypad1", "keypad 1"), key("keypad3", "keypad 3"), key("keypad5", "keypad 5")],
        mustNotHold: [key("keypad2", "keypad 2"), key("keypad4", "keypad 4"), key("keypad6", "keypad 6")],
        pressInOrder: [key("s", "S"), key("w", "W"), key("f", "F")],
        rules: [
          "every check runs on each keyboard interrupt byte; keypad 1/3/5 must be held and 2/4/6 released at that moment",
          "S held sets step 1 and returns without testing W or F, so S must be released before W counts",
          "W counts only after step 1, F only after step 2; steps never reset during the module run",
        ],
      },
      lifetime: "module 29 is decompressed afresh for every battle and DS:132C..132F are not part of WAR saves, so the mode lasts for the current battle only; an in-battle WAR load keeps it",
    },
    dispatcher: {
      address: "0000:30CE",
      liveIn: [
        { site: "0000:B793", state: "idle battle cursor loop", condition: "only while Caps Lock (DS:F6E3) is held; otherwise the normal F1-F4/Esc/Tab/E/M shortcuts run" },
        { site: "0000:54BC", state: "attack/shoot/move/teleport/technique/construction target cursors", condition: "no Caps Lock needed" },
        { site: "0000:0766", state: "promotion class-choice screen", condition: "no Caps Lock needed" },
        { site: "0000:5960 / 0000:5CB9", state: "popup menus", condition: "pointer resting on the menu drag handles" },
      ],
      notLiveIn: "enemy phase, AI scheduling and module 27 deployment",
    },
    hotkeys: [
      { ...key("f1", "F1"), handler: "0000:3221 -> 0000:2302", effect: "AI behaviour editor for the unit under the cursor (either side)" },
      { ...key("f2", "F2"), handler: "0000:3102", effect: "menu 我 EDIT / 敵 EDIT / 兵種 / 地型" },
      { ...key("f3", "F3"), handler: "0000:3157", effect: "menu 敵全滿 / 敵全滅 / 敵 1 (enemy HP to max / 0 and removed / 1)" },
      { ...key("f4", "F4"), handler: "0000:3195", effect: "menu 我全滿 / 我全滅 / 我 1 (ally HP to max / 0 and removed / 1)" },
      { ...key("f5", "F5"), handler: "0000:31E2 -> 0000:6C16", effect: "technique test: 落雷 / 炎暴 / VIRT / 冰雪" },
      { ...key("f6", "F6"), handler: "0000:31EE -> 0000:6C16", effect: "technique test: 治療 / 生命全 / 防禦攻擊 / 咒術" },
      { ...key("f10", "F10"), handler: "0000:320E -> 1000:147E", effect: "clear the acted bit of every side-1 unit" },
      { ...key("u", "U"), handler: "0000:32DA", effect: "cumulative EXP +50 for the unit under the cursor; no level or promotion refresh" },
      { ...key("d", "D"), handler: "0000:32FD", effect: "cumulative EXP -50 only when the result stays above 0" },
      { ...key("s", "S"), handler: "0000:3232", effect: "force battle line 22h with the portrait of the unit under the cursor" },
      { ...key("two", "2"), handler: "0000:324A", effect: "print cursor cell index and DS:0000 LV_HARD at (40,30)/(120,30)" },
      { ...key("w", "W"), handler: "0000:31FA", effect: "write A##.PCX screen capture (also reachable without the gate, see ungatedReleaseBehaviour)" },
      { ...key("m", "M"), handler: "1000:3154", effect: "music box" },
      { ...key("keypadMinus", "keypad -"), handler: "0000:54EE", effect: "-10 HP to the unit under the cursor when HP >= 10, no death check (idle map click step only)" },
      { ...key("j", "Caps Lock + J"), handler: "0000:4A35", effect: "battle result 999: normal victory dispatcher, events and save prompt" },
      { ...key("keypadStar", "Caps Lock + keypad *"), handler: "0000:4A3C", effect: "nextModule 33: leave straight into the post-game record cards and endings" },
      { ...key("one", "Caps Lock + 1"), handler: "0000:8448", effect: "print the DS:01A9 range-map byte on every redrawn viewport cell" },
      { ...key("p", "P"), handler: "0000:AD9D", effect: "PCX capture during the full-screen combat animation" },
    ],
    menus,
    // 结果码到效果的绑定来自 `3170/31AE` 的比较链与 `536B..53DD` 六个批处理入口（已逐段核验）。
    cellReadout: {
      handler: "0000:326A (drawn on both VGA pages by 324A)",
      digits: 5,
      fields: [
        { id: "cursorCell", source: "DS:5A09 (y*50+x)", clear: parseRect(image, 0x1b7a), text: { x: 0x28, y: 0x1e } },
        { id: "difficulty", source: "DS:0000 LV_HARD", clear: parseRect(image, 0x1b84), text: { x: 0x78, y: 0x1e } },
      ],
      lifetime: "stays until the battlefield viewport is redrawn over it",
    },
    sideLifeMenus: {
      f3: { side: 2, descriptor: menus.f3.descriptor, results: { "1Y": "full", "2Y": "remove", "3Y": "one" } },
      f4: { side: 1, descriptor: menus.f4.descriptor, results: { "1M": "full", "2M": "remove", "3M": "one" } },
      batch: "0000:540D walks slots 0..56 of the side; full = max life DS:31C3, one = 1, remove = life 0 then 0000:5435 clears both board maps without death handling",
    },
    musicBox: parseMusicBox(image),
    techniqueTest: {
      handler: "0000:6C16",
      caster: "the unit under the cursor, either side; only an empty cell is refused",
      bypassed: "class technique list, stage selector, spell seal, acted state, freeze and AI behaviour",
      kept: "normal 75E4 commit: native range seed, absolute-side target filter (damage needs a non-side-1 target, support a non-side-2 target), full presentation, real effects, caster EXP and acted bit",
      excludedDispatchCodes: ["1D", "2D", "3D", "1K", "2K"],
      labelSwap: "the 治療 header opens 初級..高級回復 (1I..3I) and 生命全 opens 初級..高級治療 (1H..3H)",
      virt: "VIRT A/B/C are the developer names of the 1V/2V/3V line effects; 1V/2V are only reachable here",
    },
    stage37Reveal: [
      { site: "0000:8BD6", effect: "skip the nine-field ????? HUD concealment" },
      { site: "0000:81A2", effect: "draw the side-2 map life labels that stage 37 otherwise hides" },
    ],
    aiBehaviourEditor: { handler: "0000:2302", labels: behaviourLabels },
    unitEditor: {
      entries: { "我 EDIT": "0000:0AA9", "敵 EDIT": "0000:0A94" },
      slots: "60 slots (4 pages x 15, column-major); slots 60..74 unreachable",
      edits: "name box toggles presence (removal is immediate; re-adding arms a placement on the next battlefield click at full HP); figure well steps the class record 0..38 without wrap; behaviour box steps DS:5644 0..11",
      hitboxes: [0x0a76, 0x0aaa, 0x0b42, 0x0bda].map((offset) => parseHitboxes(image, offset)),
      behaviourLabels: parseLabelTable(image, 0x0c7d, 11),
      knownDefects: [
        "both screens edit the side-2 behaviour table DS:5644",
        "label pointer 9 points at the table itself, value 11 reads a bogus pointer",
        "removing then exiting re-places the last clicked slot on the next battlefield click, on the side of the last screen",
        "slot 0 cannot be re-placed (0 is the no-pending sentinel)",
        "no HP clamp after a class change",
      ],
    },
    classDataEditor: {
      entry: "0000:1294",
      header: parseClassEditorHeader(image),
      editing: "pointer selects class (39 records), row (5), column (7) and digit; primary +1 / secondary -1 per digit, wrapping 0..9 without carry, recomposed in 16 bits",
      exit: "Esc only; writes DATA.SWF (2730 bytes) through 0000:1310 + E7D4, reloads it through 1395, then clamps current HP to the new max for both sides",
      persistence: "module 29 reloads DATA.SWF at every battle start and module 33 reads records 0..34, so edits are permanent for the installation",
    },
    terrainDataEditor: {
      entry: "0000:1B3A",
      terrainLabels: parseTerrainLabels(image),
      editing: "select a terrain slot from the 2x12 strip, then edit the tens/ones digits of movement cost or defense percent for class records 0..36",
      exit: "Esc only; writes MAP.SWF (3744 bytes) through 0000:1BCE + E7D4 and reloads it through 1C0E",
      persistence: "module 29 reloads MAP.SWF at every battle entry",
    },
    ungatedReleaseBehaviour: [
      { key: "K", site: "0000:11D2", effect: "toggles MOUSE_USE DS:FB1A between Y and N" },
      { key: "W", sites: ["0000:36B0", "0000:5759", "0000:5D3F", "0000:71F5", "0000:7359", "0000:74AC", "1000:2A33"], effect: "writes A##.PCX while held, without DS:132F" },
    ],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`extracted module 29 debug mode: ${signatures.length} signatures, ${output.musicBox.entries.length} music box entries, ${techniqueCodes.length} technique test codes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [command, modulePath, outputPath] = process.argv.slice(2);
  if (command !== "--extract" || !modulePath || !outputPath) {
    console.error("usage: angel2-debug-mode.mjs --extract <0029-unpacked.bin> <output.json>");
    process.exit(1);
  }
  await extract(modulePath, outputPath);
}

export { extract, parseMusicBox, parseMenu };
