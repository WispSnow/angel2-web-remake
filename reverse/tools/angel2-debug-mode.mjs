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

/** 整段例程逐字节固定（兵種／地型编辑器各有数百字节的立即数，逐条列字节不如整段哈希清楚）。 */
function expectRoutine(image, start, end, digest, label) {
  assert(sha256(image.subarray(start, end)) === digest, `${label}: routine bytes changed at ${segmentAddress(start)}`);
  return { address: segmentAddress(start), bytes: end - start, sha256: digest, label };
}

/** 读一条已核验指令的立即数：先比对操作码字节，再取紧随其后的 8／16 位值。 */
function immediate(image, offset, opcode, size = 16) {
  const prefix = Buffer.from(bytes(opcode));
  assert(image.subarray(offset, offset + prefix.length).equals(prefix), `unexpected instruction at ${segmentAddress(offset)}`);
  const at = offset + prefix.length;
  return size === 8 ? image[at] : image.readUInt16LE(at);
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
/**
 * 调用 `0000:54BC` 的七个选格循环。`7576` 没有任何直接、间接或数据引用，是死码。
 * `site` 是循环里的 `call 54BC`；`entry..end` 是从入口到第一个点击判定之后的整段字节。
 */
const TARGET_CURSOR_LOOPS = [
  { site: 0x7120, entry: 0x7113, end: 0x7148, state: "attack", caller: "0000:70C4",
    sha256: "3f6d25bc02cd1e4218c038a4397942430865b6cec0629d42e001c6a1dba76323" },
  { site: 0x71f8, entry: 0x71e8, end: 0x722b, state: "shoot", caller: "0000:71B4",
    sha256: "bc3f18cf546e403cf534487e8e69a7b6b33cd347ef3b1b8510041d18a791667b" },
  { site: 0x735c, entry: 0x734c, end: 0x7387, state: "move (including the half-dragon extra move)",
    caller: "0000:6A32 / 0000:732D / 0000:7410",
    sha256: "eabec9ac56ecb07623983cdf99d4afab47bc77770081796e59e454d6b979a315" },
  { site: 0x74af, entry: 0x749f, end: 0x74d7, state: "teleport", caller: "0000:7496",
    sha256: "f96cc93262e04905327c6b46e6d38f6c5f62ffc4113a5486aec56d5fce3144b4" },
  { site: 0x7583, entry: 0x7576, end: 0x75b4, state: "unreferenced", caller: "none",
    sha256: "6a39ff935b2a703d922c7387e2ddb5ec90d14ba820a554c149dd1d67b645566c" },
  { site: 0x76e9, entry: 0x76dc, end: 0x7720, state: "technique (including the F5/F6 test)", caller: "0000:764D",
    sha256: "e077dbce0f2eb3965b1f400b6c679cb2ce025c9060f463d274b3e59582329973" },
  { site: 0x773a, entry: 0x772d, end: 0x7762, state: "construction", caller: "0000:76D1",
    sha256: "384cc4a610c38239a4ad0aabeddce8a9ffb30821bd49903caa3ffd14cb59dc23" },
];

/** 段 0 内全部 `E8 rel16` 近调用中落到 `target` 的指令地址（本映像逐字节扫描无误报）。 */
function nearCallSites(image, target) {
  const sites = [];
  for (let offset = 0; offset + 3 <= 0x10000; offset += 1) {
    if (image[offset] === 0xe8 && ((offset + 3 + image.readInt16LE(offset + 1)) & 0xffff) === target) sites.push(offset);
  }
  return sites;
}

function verifyDispatcherHosts(image) {
  const dispatcherSites = nearCallSites(image, 0x30ce);
  assert(
    dispatcherSites.join() === [0x0766, 0x54bc, 0x5960, 0x5cb9, 0xb793].join(),
    `dispatcher 30CE call sites changed: ${dispatcherSites.map((site) => hex(site)).join(" ")}`,
  );
  const cursorStepSites = nearCallSites(image, 0x54bc);
  assert(
    cursorStepSites.join() === TARGET_CURSOR_LOOPS.map(({ site }) => site).join(),
    `target cursor step 54BC call sites changed: ${cursorStepSites.map((site) => hex(site)).join(" ")}`,
  );
  assert(nearCallSites(image, 0x7576).length === 0, "the 7576 loop gained a caller");
  assert(nearCallSites(image, 0x54d1).join() === [0x54b2].join(), "keypad - step 54D1 is called outside the idle step");
  assert(nearCallSites(image, 0x0744).join() === [0x0483].join(), "promotion choice 0744 gained another caller");
}

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
    expectBytes(image, 0x54bc, "e8 0f dc 9a 04 00 3e 13 e8 60 27 e8 ee f3 b9 09 00 e8 e6 7e c3",
      "target/destination cursor step: dispatcher, input poll, viewport redraw, cursor blink, delay"),
    expectBytes(image, 0x54aa, "9a 04 00 3e 13 e8 75 27 e8 1c 00 b9 09 00 e8 fb 7e c3",
      "idle map click step (only caller 4A0A): input poll, viewport redraw, 54D1 click and keypad -, delay"),
    // 选格循环先建好范围图（`7C00` 只重画视口），循环体跳回自己的 `54BC` 调用，点击时 `785E`
    // 才读这张图；所以调试操作返回后选格照常继续，范围图不重建。
    ...TARGET_CURSOR_LOOPS.map(({ entry, end, sha256: digest, state }) =>
      expectRoutine(image, entry, end, digest, `${state} cursor loop: 54BC every pass, click checks after it, no range rebuild`)),
    expectRoutine(image, 0x0744, 0x076b, "c9581592c4c96a2677e9f582ce27c46a2c60860fcd805baf16671b42653172ce",
      "promotion class-choice loop 0744: redraw, choice step C8A9, dispatcher while no class is chosen, no cancel"),
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
    expectBytes(image, 0x3113, "83 3e 4a 3d 58 75 01 c3 a1 4a 3d 3d 31 44 74 10 3d 32 44 74 14 3d 33 44 74 18 3d 34 44 74 21 c3",
      "F2 result codes 1D/2D/3D/4D branch in menu order"),
    expectBytes(image, 0x6c66, `
      a1 4a 3d 3d 31 3f 74 24 3d 32 3f 74 26 3d 33 3f 74 28 3d 34 3f 74 2a 3d 35 3f 74 2c 3d 36 3f 74 2e 3d 37 3f 74 30
      3d 38 3f 74 32 c3 c7 06 ba 3d 68 3e c3 c7 06 ba 3d 82 3e c3 c7 06 ba 3d 9c 3e c3 c7 06 ba 3d ee 3e c3
      c7 06 ba 3d 16 3f c3 c7 06 ba 3d 94 3f c3 c7 06 ba 3d 58 3f c3 c7 06 ba 3d 76 3f c3`,
    "technique test categories 1?..8? open rank menus 3E68/3E82/3E9C/3EEE/3F16/3F94/3F58/3F76"),
    expectBytes(image, 0x3157, "80 3e e6 f6 01 74 01 c3 b8 56 41 a3 ba 3d e8", "F3 opens menu 4156"),
    expectBytes(image, 0x3195, "80 3e e7 f6 01 74 01 c3 b8 6c 41 a3 ba 3d e8", "F4 opens menu 416C"),
    expectBytes(image, 0x31d3, `
      80 3e e8 f6 01 74 08 80 3e e9 f6 01 74 0d c3 c6 06 e8 f6 00 b8 82 41 e8 29 3a c3
      c6 06 e9 f6 00 b8 9c 41 e8 1d 3a c3`,
    "F5/F6 open the technique test menus through 6C16"),
    expectBytes(image, 0x31fa, "80 3e ba f6 01 74 01 c3 be 6c 1b 9a 04 00 18 19 e8 a8 00 c3", "W writes an A##.PCX capture"),
    expectBytes(image, 0x320e, "80 3e ed f6 01 74 01 c3 c6 06 ed f6 00 9a 0e 00 47 11 c3", "F10 clears every side-1 acted bit"),
    expectBytes(image, 0x3221, "80 3e e4 f6 01 74 01 c3 c6 06 e4 f6 00 e8 d1 f0 c3", "F1 opens the AI behaviour editor 2302"),
    expectBytes(image, 0x2302, `
      8b 36 09 5a 8b de e8 1f 2d 81 36 82 f8 00 08 a1 80 f8 e8 e3 d4 a1 8c 31 be 72 16 e8 30 ad be 7c 16 e8 2a ad
      c7 06 84 f8 2d 02 8b 16 7c 16 8b 1e 7e 16 8b 0e 8c 31 e8 c3 b6 8b 16 7c 16 8b 1e 7e 16 8b 0e 8c 31 e8 4a b4
      e8 3c 00 a1 80 f8 bb de 01 e8 03 d5 e8 7e 00 e8 9f 00 e8 b9 00 e8 38 01 80 3e 91 f5 01 74 02 eb e2`,
    "F1 editor: load the cursor unit, fill 1672/167C, draw its frame from the side-2 sheet DS:022D, loop until secondary"),
    expectBytes(image, 0x2389, `
      be 00 00 8b 16 7c 16 8b 1e 7e 16 83 c3 06 83 c2 38 8b 84 b4 16 3d ff ff 74 33 56 53 52 c7 06 3c f9 0f 00
      d1 ee 3b 36 f6 3b 75 06 c7 06 3c f9 0b 00 8b f0 8b c2 a3 ba f8 8b c3 a3 bc f8 8b f6 e8 39 c6 5a 5b 5e
      83 c3 14 83 c6 02 eb c4 c3`,
    "F1 labels: (inner.x+38h, inner.y+6) step 14h, ink 0Fh, the current value DS:3BF6 in 0Bh"),
    expectBytes(image, 0x23d7, `
      a1 23 fb 3d 38 00 72 07 3d 14 01 77 02 eb 07 c7 06 88 16 ff ff c3 2d 38 00 33 d2 bb 14 00 f7 f3 a3 88 16 c3
      a1 21 fb 3d 88 00 72 07 3d b0 00 77 02 eb 07 c7 06 86 16 ff ff c3 c7 06 86 16 00 00 c3`,
    "F1 hover: y 38h..114h -> row (y-38h)/14h, x 88h..B0h"),
    expectBytes(image, 0x2440, `
      b8 80 00 a3 8c 16 a3 96 16 a3 a0 16 05 30 00 a3 aa 16 33 d2 a1 88 16 bb 14 00 f7 e3 05 38 00 a3 8e 16 a3 98 16
      a3 ac 16 05 14 00 a3 a2 16 b8 0b 00 e8 01 00 c3`,
    "F1 hover box: four 1px rects at x 80h, y 38h+14h*row, colour 0Bh"),
    expectBytes(image, 0x24aa, "80 3e 90 f5 01 74 01 c3 c6 06 90 f5 00 8b 1e f8 3b a1 88 16 89 07 a3 f6 3b a1 80 f8 e8 31 d3 e8 bd fe c3",
      "F1 primary click writes the hovered row into the unit's behaviour word [3BF8] and DS:3BF6"),
    expectBytes(image, 0x0df3, `
      c7 06 e2 07 08 00 b9 03 00 51 c7 06 e4 07 0a 00 b9 05 00 51 e8 9d 00 83 06 e4 07 3c 59 e2 f4 81 06 e2 07 b8 00
      59 e2 e1 e8 22 00 c7 06 e2 07 48 02 c7 06 e4 07 2c 01 e8 4d 00 b8 4b 02 a3 ba f8 b8 2f 01 a3 bc f8 be 78 0c
      e8 c5 db c3`,
    "EDIT page: 3 columns x 5 rows from (8,10) step (B8h,3Ch), EXIT box at (248h,12Ch)"),
    expectBytes(image, 0x0e40, `
      c7 06 e2 07 48 02 c7 06 e4 07 32 00 b9 04 00 51 e8 27 00 83 06 e4 07 28 59 e2 f4 33 d2 a1 9a 08 bb 28 00
      f7 e3 05 32 00 40 a3 60 08 a1 e2 07 40 a3 5e 08 be 5e 08 e8 d7 c1 c3`,
    "EDIT page tabs: four boxes at x 248h from y 32h step 28h; the active page is filled with 085E"),
    expectBytes(image, 0x0ea7, `
      a1 e2 07 a3 e6 07 40 a3 f0 07 a3 fa 07 a1 e4 07 a3 e8 07 40 a3 f2 07 a3 fc 07 a1 e2 07 05 08 00 a3 04 08 40
      a3 0e 08 a3 18 08 a1 e4 07 05 02 00 a3 06 08 40 a3 10 08 a3 1a 08 a1 e2 07 05 40 00 a3 22 08 40 a3 2c 08 a3
      36 08 a1 e4 07 05 18 00 a3 24 08 40 a3 2e 08 a3 38 08 a1 e2 07 05 40 00 a3 72 08 40 a3 7c 08 a3 86 08 a1 e4
      07 05 02 00 a3 74 08 40 a3 7e 08 a3 88 08`,
    "EDIT slot boxes: frame, figure well (+8,+2), name box (+40h,+18h), behaviour box (+40h,+2)"),
    expectBytes(image, 0x0fa4, `
      8b 16 e2 07 8b 1e e4 07 83 c2 78 83 c3 04 89 16 68 08 89 1e 6a 08 be 68 08 e8 90 c0 8b 0e 9c 08 be 9e 08 e8
      8c df 8b 16 e2 07 8b 1e e4 07 83 c2 68 83 c3 04 8b c2 a3 ba f8 8b c3 a3 bc f8 be 9e 08 e8 1c da 8b 16 e2 07
      8b 1e e4 07 83 c2 41 83 c3 19 89 16 36 08 89 1e 38 08 be 36 08 e8 4c c0 8b 16 e2 07 8b 1e e4 07 83 c2 09 83
      c3 03 89 16 18 08 89 1e 1a 08 be 18 08 e8 30 c0 c7 06 3c f9 0f 00 8b 1e 9c 08 03 db 8b 87 3c 09 3d 00 00 74
      0c c7 06 3c f9 00 00 c7 06 3e f9 08 00 8b 1e 9c 08 03 db 03 1e da 0c 8b 37 83 c6 05 8b 16 e2 07 8b 1e e4 07
      83 c2 48 83 c3 1b 8b c2 a3 ba f8 8b c3 a3 bc f8 8b f6 e8 97 d9 8b 1e 9c 08 03 db 8b 36 dd 0c 8b 00 a3 a4 08
      e8 7e 00 8b 16 e2 07 8b 1e e4 07 83 c2 09 83 c3 04 52 53 8b d2 8b db 8b 0e a4 08 e8 64 c9 5b 5a 8b d2 8b db
      8b 0e a4 08 e8 ed c6 c7 06 3c f9 0f 00 c7 06 3e f9 00 00 8b 16 e2 07 8b 1e e4 07 83 c2 41 83 c3 03 89 16 86
      08 89 1e 88 08 be 86 08 e8 81 bf 8b 1e 9c 08 03 db 8b 9f 44 56 03 db 8b b7 7d 0c 8b 16 e2 07 8b 1e e4 07 83
      c2 42 83 c3 04 8b c2 a3 ba f8 8b c3 a3 bc f8 8b f6 e8 08 d9 c3`,
    "EDIT slot contents: slot number, name (dark when present, white when absent), figure, side-2 behaviour label"),
    expectBytes(image, 0x10fd, "b8 ad 32 39 06 da 0c 74 07 c7 06 84 f8 19 02 c3 c7 06 84 f8 2d 02 c3",
      "EDIT figure sheet: side 2 when editing the side-2 name table, otherwise side 1"),
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
    expectRoutine(image, 0x1294, 0x1b3a, "6e3a608a5ac840a1302afe04e87cd0f778ccc684b5d26391930f9b49dbbf0b48",
      "class data editor 1294..1B39: 13x3 grid, hover highlight, panel, row/column/digit pickers, digit editor, DATA.SWF I/O"),
    expectRoutine(image, 0x1b3a, 0x2302, "64516ee092526a67403ec37568d58eb2d2c4d09a97fbd5befdcf38427ec5e66c",
      "terrain data editor 1B3A..2301: 2x12 strip, 10x4 class grid, row/digit pickers, digit editor, MAP.SWF I/O"),
    expectRoutine(image, 0x5256, 0x52e7, "0ec65a7ee60d5dbb64ef50aed31c70a16798c34d5850b016ecf197fd2ebe9328",
      "every unit context load re-selects its DATA row (5256) and copies attack/defense/max life/movement/level (52BC)"),
    expectBytes(image, 0x53ed, "c7 06 8a 31 7f 54 2e c6 06 34 54 01 e8 11 00 cb c7 06 8a 31 7f 54 2e c6 06 34 54 02 e8 01 00 cb",
      "兵種 exit clamps side 1 (53ED) then side 2 (53FD) through 540D + 547F"),
    expectBytes(image, 0x547f, "a1 9f 31 8b 0e c3 31 3b c1 72 06 8b 1e b9 31 89 0f c3",
      "clamp: life >= max life DS:31C3 -> life = max life; never raises"),
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

/**
 * F1 行为编辑器 `0000:2302` 的版面。常数直接从上面已核验的指令里读：
 * 文字落点 `2389`、悬停区 `23D7`、悬停框 `2440`；面板两张矩形是 DS:`1672/167C`。
 */
function parseBehaviourEditorLayout(image, labelCount) {
  const imm16 = (offset) => image.readUInt16LE(offset);
  const panel = parseRect(image, 0x1672);
  const inner = parseRect(image, 0x167c);
  const labels = {
    x: inner.x + image[0x2389 + 16],
    y: inner.y + image[0x2389 + 13],
    pitch: image[0x2389 + 71],
    ink: image[0x2389 + 33],
    currentInk: image[0x2389 + 47],
  };
  const hover = {
    xMin: imm16(0x23d7 + 40),
    xMax: imm16(0x23d7 + 45),
    yMin: imm16(0x23d7 + 4),
    yMax: imm16(0x23d7 + 9),
    pitch: imm16(0x23d7 + 28),
  };
  assert(hover.pitch === labels.pitch, "F1 hover rows must use the label pitch");
  const highlight = {
    x: imm16(0x2440 + 1),
    yBase: imm16(0x2440 + 29),
    width: imm16(0x2440 + 13),
    height: imm16(0x2440 + 41),
    colour: imm16(0x2440 + 47),
    eraseColour: inner.colour,
  };
  assert(highlight.yBase === hover.yMin, "F1 hover box must start where the hover rows start");
  // 行号 = (y − yMin) / pitch，y 最大只到 yMax：最后一行只剩 yMax 那一条像素线，再往下的行点不到。
  const lastSelectableRow = Math.floor((hover.yMax - hover.yMin) / hover.pitch);
  const lastRowPixelRows = hover.yMax - (hover.yMin + lastSelectableRow * hover.pitch) + 1;
  assert(lastSelectableRow === 11 && lastRowPixelRows === 1, "F1 selectable rows changed");
  assert(labelCount === 13, "F1 must list 13 behaviour names");
  return {
    panel,
    inner,
    figure: {
      x: inner.x,
      y: inner.y,
      sheet: "side-2 map figure sheet DS:022D (A/3; A/11 on scene 37), whatever the unit's side",
      frame: "DS:318C after 0000:502A loads the cursor unit",
    },
    labels,
    hover,
    highlight,
    selectableValues: Array.from({ length: lastSelectableRow + 1 }, (_, value) => value),
    lastRowPixelRows,
    note: "13 names are drawn but the pointer rows stop at y = yMax: 正 1 (11) is a one-pixel strip and 目地 (12) cannot be picked; the editor has no keyboard rows and closes on the secondary button",
  };
}

/**
 * 我／敵 EDIT（`0000:0ABE`）的整屏版面。格子原点与步长取自 `0DF3/0F6A`，页签取自 `0E40`，
 * 各框的相对位移取自 `0EA7/0FA4`，尺寸与颜色取自 DS:`07D8..0886` 的矩形描述。每个框都是
 * 三张矩形：第一张的颜色留在上缘与左缘，第二张（右下移 1）留在下缘与右缘，第三张填内部。
 */
function parseUnitEditorLayout(image) {
  const imm8 = (offset) => image[offset];
  const imm16 = (offset) => image.readUInt16LE(offset);
  const bevel = (outer, edge, fill, dx, dy) => {
    const [a, b, c] = [outer, edge, fill].map((offset) => parseRect(image, offset));
    assert(b.width === a.width - 1 && b.height === a.height - 1 && c.width === a.width - 2 && c.height === a.height - 2,
      `bevel ${ds(outer)} sizes drifted`);
    return { dx, dy, width: a.width, height: a.height, topLeft: a.colour, bottomRight: b.colour, fill: c.colour };
  };
  const item = 0xfa4;
  const grid = {
    x: imm16(0x0df3 + 4),
    xStep: imm16(0x0df3 + 35),
    columns: imm8(0x0df3 + 7),
    y: imm16(0x0df3 + 14),
    yStep: imm8(0x0df3 + 27),
    rows: imm8(0x0df3 + 17),
    order: "column-major: slot = page * 15 + column * 5 + row",
  };
  assert(grid.columns * grid.rows === 15, "the unit editor page must hold 15 slots");
  const pageTab = bevel(0x0840, 0x084a, 0x0854, 0, 0);
  const active = parseRect(image, 0x085e);
  return {
    background: parseRect(image, 0x07d8),
    grid,
    frame: bevel(0x07e6, 0x07f0, 0x07fa, 0, 0),
    figureWell: bevel(0x0804, 0x080e, 0x0818, imm16(0x0ea7 + 30), imm16(0x0ea7 + 46)),
    nameBox: bevel(0x0822, 0x082c, 0x0836, imm16(0x0ea7 + 62), imm16(0x0ea7 + 78)),
    behaviourBox: bevel(0x0872, 0x087c, 0x0886, imm16(0x0ea7 + 94), imm16(0x0ea7 + 110)),
    figure: {
      dx: imm8(item + 229),
      dy: imm8(item + 232),
      sheets: "side 1 DS:0219, side 2 DS:022D (0000:10FD picks by the name table); frame = the slot's class record",
    },
    slotNumber: {
      backing: { ...parseRect(image, 0x0868), dx: imm8(item + 10), dy: imm8(item + 13) },
      text: { dx: imm8(item + 48), dy: imm8(item + 51), digits: 5, base: 0 },
    },
    name: {
      dx: imm8(item + 182),
      dy: imm8(item + 185),
      skip: imm8(item + 171),
      present: { ink: imm8(item + 149), outline: imm8(item + 155) },
      absent: { ink: imm8(item + 128), outline: 0 },
    },
    behaviour: {
      dx: imm8(item + 325),
      dy: imm8(item + 328),
      ink: imm8(item + 263),
      outline: imm8(item + 269),
      table: ds(imm16(item + 307)),
      labels: ds(imm16(item + 313)),
    },
    pageTabs: {
      x: imm16(0x0e40 + 4),
      y: imm16(0x0e40 + 10),
      yStep: imm8(0x0e40 + 23),
      count: imm8(0x0e40 + 13),
      box: pageTab,
      active: { dx: 1, dy: 1, width: active.width, height: active.height, colour: active.colour },
    },
    exit: {
      x: imm16(0x0df3 + 47),
      y: imm16(0x0df3 + 53),
      box: pageTab,
      text: { x: imm16(0x0df3 + 59), y: imm16(0x0df3 + 65), label: dollarString(image, imm16(0x0df3 + 71)) },
    },
  };
}

/** 两张矩形叠成的格：外框色留成一圈 1 px 边，内矩形（右下各缩 1）填内部。 */
function parseFramedCell(image, outerOffset, innerOffset) {
  const outer = parseRect(image, outerOffset);
  const inner = parseRect(image, innerOffset);
  assert(inner.x === outer.x + 1 && inner.y === outer.y + 1
    && inner.width === outer.width - 2 && inner.height === outer.height - 2,
  `framed cell ${ds(outerOffset)} drifted`);
  return { width: outer.width, height: outer.height, border: outer.colour, fill: inner.colour };
}

/** 四条 1 px 线组成的选取框：上、左、下（y+高）、右（x+宽），都落在格外缘之外一格。 */
function parseSelectionLines(image, offsets, colourOffset, eraseOffset) {
  const [top, left, bottom, right] = offsets.map((offset) => parseRect(image, offset));
  assert(top.height === 1 && bottom.height === 1 && left.width === 1 && right.width === 1
    && top.width === bottom.width && left.height === right.height, "selection lines drifted");
  return {
    width: top.width,
    height: left.height,
    colour: immediate(image, colourOffset, "b8"),
    eraseColour: immediate(image, eraseOffset, "b8"),
    note: "top/left lines sit on the cell's own border, bottom/right one pixel past it (on the next cell's border); the erase repaints the old lines white",
  };
}

/** 兵種／地型两个编辑器都不写墨色变量 DS:F93C/F93E，文字沿用进入时的战场默认 15／0。 */
function assertInheritedInk(image, start, end, label) {
  for (const pattern of ["c7 06 3c f9", "c7 06 3e f9"]) {
    const needle = Buffer.from(bytes(pattern));
    const hit = image.subarray(start, end).indexOf(needle);
    assert(hit < 0, `${label} writes the text ink at ${segmentAddress(start + hit)}`);
  }
}

/**
 * 兵種（`0000:1294`）的版面。上方 13×3 格列出 39 条职业（side 2 棋子），指针悬停即移动红框；
 * 在行区之外按主键，下方面板换成红框所在职业。面板上的五行×七列都是五位数，指针所在
 * 行垫蓝底、所在列与位在行的上下各画一条白括线与红刻线。
 */
function parseClassDataEditorLayout(image) {
  assertInheritedInk(image, 0x1294, 0x1b3a, "class data editor");
  const rows = [0x1634, 0x1641, 0x164e, 0x165b, 0x1668].map((offset) => immediate(image, offset, "c7 06 d7 13"));
  const rowHits = [0x169d, 0x16a2, 0x16a7, 0x16ac, 0x16b1, 0x16b6].map((offset) => immediate(image, offset, "3d"));
  assert(rows.every((y, index) => rowHits[index] === y), "class editor row hit bands must start at the row text");
  const columns = [0x1806, 0x1818, 0x182a, 0x183c, 0x184e, 0x1860, 0x1872].map((offset) => immediate(image, offset, "b8"));
  const columnHits = [0x18b5, 0x18b0, 0x18ab, 0x18a6, 0x18a1, 0x189c, 0x1897].map((offset) => immediate(image, offset, "3d"));
  assert(columns.every((x, index) => columnHits[index] === x), "class editor column hit bands must start at the column text");
  const grid = {
    x: immediate(image, 0x148a, "c7 06 30 13"),
    y: immediate(image, 0x1480, "c7 06 32 13"),
    columns: immediate(image, 0x1490, "b9"),
    rows: immediate(image, 0x1486, "b9"),
    xStep: immediate(image, 0x14e9, "83 06 30 13", 8),
    yStep: immediate(image, 0x14f1, "83 06 32 13", 8),
    lastRecord: immediate(image, 0x14c0, "83 3e 8c 31", 8),
    sheet: ds(immediate(image, 0x14ba, "c7 06 84 f8")),
    cell: parseFramedCell(image, 0x1348, 0x1352),
    order: "row-major: record = row * columns + column",
  };
  assert(grid.columns * grid.rows === 39 && grid.lastRecord === 38, "the class grid must hold the 39 DATA records");
  const hover = {
    xMax: immediate(image, 0x14fd, "3d"),
    yMax: immediate(image, 0x1505, "3d"),
    rule: "x <= xMax and y <= yMax: record = floor(y / yStep) * columns + floor(x / xStep)",
  };
  const rowBand = parseRect(image, 0x1413);
  const markerBelow = immediate(image, 0x1990, "05");
  return {
    grid,
    hover,
    selection: parseSelectionLines(image, [0x135c, 0x1366, 0x1370, 0x137a], 0x1598, 0x154e),
    panel: {
      outer: parseRect(image, 0x1334),
      inner: parseRect(image, 0x133e),
      trigger: "primary button while the pointer is outside the five row bands redraws the panel for the highlighted record",
      figure: { x: immediate(image, 0x1457, "ba"), y: immediate(image, 0x145a, "bb"), sheet: ds(immediate(image, 0x1451, "c7 06 84 f8")) },
      code: { x: immediate(image, 0x15fb, "b8"), y: immediate(image, 0x1601, "b8"), source: "side-1 descriptor short code" },
      name: { x: immediate(image, 0x1611, "b8"), y: immediate(image, 0x1617, "b8"), source: "descriptor display name" },
      header: { x: immediate(image, 0x1622, "b8"), y: immediate(image, 0x1628, "b8"), text: ds(immediate(image, 0x162e, "be")) },
    },
    table: {
      rows,
      rowHitBottom: rowHits[5],
      columns,
      digits: 5,
      digitWidth: immediate(image, 0x1940, "bb"),
      fieldWidth: immediate(image, 0x1921, "83 c2", 8),
      rowBand: {
        x: rowBand.x,
        dy: -immediate(image, 0x1752, "2d"),
        width: rowBand.width,
        height: rowBand.height,
        colour: immediate(image, 0x1773, "c7 06 1b 14"),
        eraseColour: immediate(image, 0x1749, "c7 06 1b 14"),
      },
      markers: {
        dyBelow: markerBelow,
        dyAbove: markerBelow - immediate(image, 0x19c0, "83 2e 2b 14", 8),
        bar: parseRect(image, 0x1429),
        bracket: parseRect(image, 0x141f),
        tick: parseRect(image, 0x1433),
        note: "a 2 px bar in the row-band colour wipes the old marks, then a white bracket under the column and a red tick under the digit, above and below the row",
      },
      edit: {
        primary: 1,
        secondary: -1,
        digitMax: immediate(image, 0x1a82, "3c", 8),
        rule: "the picked digit of the 5-digit decimal value wraps 0..9 without carry; the value is recomposed as a 16-bit word",
      },
    },
    exitKey: { ...key("escape", "Esc"), check: ds(immediate(image, 0x12dd, "80 3e")) },
    ink: "inherited: neither editor writes DS:F93C/F93E, so text uses the battle default ink 15 with outline 0",
  };
}

/**
 * 地型（`0000:1B3A`）的版面。上方 2×12 地形条（悬停红框、按主键选定），`(0,60)` 另画一格
 * 显示选定的地形；下方 10×4 格列出职业记录 0..36，每格两行五位数：该职业在选定地形的
 * 移动消耗与防御百分比，只有十位与个位能改。
 */
function parseTerrainDataEditorLayout(image) {
  assertInheritedInk(image, 0x1b3a, 0x2302, "terrain data editor");
  const strip = {
    x: immediate(image, 0x1d99, "c7 06 a8 14"),
    y: immediate(image, 0x1d8f, "c7 06 aa 14"),
    columns: immediate(image, 0x1d9f, "b9"),
    rows: immediate(image, 0x1d95, "b9"),
    xStep: immediate(image, 0x1daa, "83 06 a8 14", 8),
    yStep: immediate(image, 0x1db2, "83 06 aa 14", 8),
    cell: parseFramedCell(image, 0x14d4, 0x14de),
    label: { dx: 1, dy: 1, table: ds(immediate(image, 0x1ded, "81 c6")), stride: immediate(image, 0x1de6, "bb") },
    order: "row-major: slot = row * columns + column",
  };
  assert(strip.columns * strip.rows === 24, "the terrain strip must hold 24 labels");
  const classGrid = {
    x: immediate(image, 0x1ca4, "c7 06 a8 14"),
    y: immediate(image, 0x1c9a, "c7 06 aa 14"),
    columns: immediate(image, 0x1caa, "b9"),
    rows: immediate(image, 0x1ca0, "b9"),
    xStep: immediate(image, 0x1cb5, "83 06 a8 14", 8),
    yStep: immediate(image, 0x1cbd, "83 06 aa 14", 8),
    recordLimit: immediate(image, 0x1cf2, "83 3e 8c 31", 8),
    sheet: ds(immediate(image, 0x1cec, "c7 06 84 f8")),
    cell: parseFramedCell(image, 0x14c0, 0x14ca),
    order: "row-major: record = row * columns + column; cells at or past recordLimit stay empty",
  };
  assert(classGrid.recordLimit === 37 && classGrid.columns * classGrid.rows === 40, "the terrain class grid must show records 0..36");
  const movementDy = immediate(image, 0x1d50, "83 c3", 8);
  const valueDx = immediate(image, 0x1d53, "83 c2", 8);
  const rowTop = immediate(image, 0x1ff6, "83 c3", 8);
  const rowStep = immediate(image, 0x1ffd, "83 c3", 8);
  assert(rowTop === movementDy && immediate(image, 0x2004, "83 c3", 8) === rowStep, "terrain value rows drifted");
  return {
    strip,
    stripHover: {
      xMax: immediate(image, 0x1e09, "3d"),
      yMax: immediate(image, 0x1e14, "3d"),
      rule: "x <= xMax and y <= yMax: slot = floor(y / yStep) * columns + floor(x / xStep); the primary button selects it",
    },
    stripSelection: parseSelectionLines(image, [0x14e8, 0x14f2, 0x14fc, 0x1506], 0x1eb1, 0x1e67),
    current: {
      x: immediate(image, 0x1b4c, "c7 06 a8 14"),
      y: immediate(image, 0x1b52, "c7 06 aa 14"),
      initialSlot: word(image, 0x165a),
      note: "one more strip cell showing the selected slot's label; DS:165A survives between openings in the same battle",
    },
    classGrid,
    classHover: {
      xMax: immediate(image, 0x1ee4, "3d"),
      yMin: immediate(image, 0x1eef, "3d"),
      yMax: immediate(image, 0x1ef4, "3d"),
      rule: "x <= xMax and yMin <= y <= yMax: record = floor((y - grid.y) / yStep) * columns + floor(x / xStep)",
    },
    classSelection: parseSelectionLines(image, [0x1510, 0x151a, 0x1524, 0x152e], 0x1fb0, 0x1f4a),
    values: {
      dx: valueDx,
      movementDy,
      defenseDy: movementDy + immediate(image, 0x1d74, "83 c3", 8),
      digits: 5,
      rowHeight: rowStep,
    },
    editableDigits: {
      dx: immediate(image, 0x20a4, "83 c3", 8),
      width: immediate(image, 0x20ab, "83 c3", 8),
      digitWidth: immediate(image, 0x20ef, "bb"),
      fieldDigits: [immediate(image, 0x21e6, "bf"), immediate(image, 0x21ea, "bf")],
      rule: "only the tens and ones digits; primary +1 / secondary -1, each wrapping 0..9 without carry",
    },
    markers: {
      bracket: parseRect(image, 0x1613),
      tick: parseRect(image, 0x1627),
      dySecond: immediate(image, 0x2163, "83 06 15 16", 8),
      note: "a white 16 px bracket over both editable digits and a red tick over the picked one, at the row top and 17 px below it",
    },
    exitKey: { ...key("escape", "Esc"), check: ds(immediate(image, 0x1b9b, "80 3e")) },
    ink: "inherited: neither editor writes DS:F93C/F93E, so text uses the battle default ink 15 with outline 0",
  };
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
  verifyDispatcherHosts(image);
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
  assert(word(image, 0x16b4 + 13 * 2) === 0xffff, "the F1 label table must end after 13 entries");
  const behaviourEditorLayout = parseBehaviourEditorLayout(image, behaviourLabels.length);
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
        {
          site: "0000:54BC",
          state: "attack/shoot/move/teleport/technique/construction target cursors",
          condition: "no Caps Lock needed",
          loops: TARGET_CURSOR_LOOPS.map(({ site, entry, state, caller }) => ({
            site: segmentAddress(site), entry: segmentAddress(entry), state, caller,
          })),
          afterDebug: "every loop builds its range map before entry and jumps back to its own 54BC call; 785E reads the map only on a click, so the selection continues after a debug action with the map it had on entry",
        },
        {
          site: "0000:0766",
          state: "promotion class-choice screen",
          condition: "no Caps Lock needed",
          loop: "0000:0744..0769 (only caller 0000:0483): redraw, choice step C8A9, dispatcher while DS:3D4A = FFFFh; no cancel branch, the choice is written to the slot that opened the screen",
        },
        { site: "0000:5960 / 0000:5CB9", state: "popup menus", condition: "pointer resting on the menu drag handles" },
      ],
      notLiveIn: "enemy phase, AI scheduling and module 27 deployment",
      idleOnly: "keypad - lives in the idle map click step 54D1 (only caller 54B2 inside 54AA, called from 4A0A); Caps+J and Caps+keypad * are read by the idle main loop 4A27; none of them is reachable from a target cursor or the promotion screen",
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
    editMenu: {
      descriptor: menus.f2.descriptor,
      results: {
        "1D": { target: "allyUnitEditor", handler: "0000:0AA9" },
        "2D": { target: "enemyUnitEditor", handler: "0000:0A94" },
        "3D": { target: "classDataEditor", handler: "0000:1294" },
        "4D": { target: "terrainDataEditor", handler: "0000:1B3A" },
      },
    },
    musicBox: parseMusicBox(image),
    techniqueTest: {
      handler: "0000:6C16",
      firstLevel: { F5: menus.f5.descriptor, F6: menus.f6.descriptor },
      rankMenuByCategory: Object.fromEntries(Object.entries(menus.techniqueRanks)
        .map(([category, menu]) => [category, menu.descriptor])),
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
    aiBehaviourEditor: { handler: "0000:2302", labels: behaviourLabels, layout: behaviourEditorLayout },
    unitEditor: {
      entries: { "我 EDIT": "0000:0AA9", "敵 EDIT": "0000:0A94" },
      slots: "60 slots (4 pages x 15, column-major); slots 60..74 unreachable",
      edits: "name box toggles presence (removal is immediate; re-adding arms a placement on the next battlefield click at full HP); figure well steps the class record 0..38 without wrap; behaviour box steps DS:5644 0..11",
      hitboxes: [0x0a76, 0x0aaa, 0x0b42, 0x0bda].map((offset) => parseHitboxes(image, offset)),
      layout: parseUnitEditorLayout(image),
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
      liveEffect: "edits land in the live row array DS:8838..92E1 at once; every unit context load re-selects its row (5256/52BC), so attack, defense, max life, movement and level follow the edit immediately, while the HP clamp runs only on exit",
      persistence: "module 29 reloads DATA.SWF at every battle start and module 33 reads records 0..34, so edits are permanent for the installation",
      layout: parseClassDataEditorLayout(image),
      knownDefects: [
        "the grid hover accepts x = 624 and y = 150, which pick the next row's first record or records 39..52 past the table",
        "x = column + 40 picks digit 5, which 1A3C does not map, so the edit reuses whatever digit register was left over",
        "five digits recompose into 16 bits, so 65536..99999 wrap",
        "the clamp writes the new max even when it is 0, leaving 0-HP units on the board",
        "the erase pass repaints the old selection lines white, including the lines outside the grid on its last row and column",
      ],
    },
    terrainDataEditor: {
      entry: "0000:1B3A",
      terrainLabels: parseTerrainLabels(image),
      editing: "select a terrain slot from the 2x12 strip, then edit the tens/ones digits of movement cost or defense percent for class records 0..36",
      exit: "Esc only; writes MAP.SWF (3744 bytes) through 0000:1BCE + E7D4 and reloads it through 1C0E",
      liveEffect: "edits land in the live profiles at once; every movement and terrain-defense query re-reads them",
      persistence: "module 29 reloads MAP.SWF at every battle entry",
      layout: parseTerrainDataEditorLayout(image),
      knownDefects: [
        "slot 23 (障礙) is the overlap word: editing it writes slot 0 of the next profile",
        "the strip hover accepts x = 576, which picks slot 12 on the first row and the garbage slot 24 on the second",
        "class cells 37..39 are empty frames but keep the previous cell's profile pointers, so their rows edit the last hovered class",
      ],
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
