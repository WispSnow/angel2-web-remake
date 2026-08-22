#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE29_DATA_BASE = 0x1eba0;
const MODULE29_SHA256 = "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4";
const BIG5 = new TextDecoder("big5", { fatal: true });

const CODE_SIGNATURES = [
  ["0000:2620", 0x2620, 0x263b, "fill unit-detail panel body from the native pattern", "90fd78a62ad19985d61723af673b05959cab3c6018ac435ffd9a89a545d21452"],
  ["0000:2A1A", 0x2a1a, 0x2a8b, "draw A/6 separators and side ornaments around the tactical minimap", "c32f10e52e1bbbb5a704043c73d346941c9a0ccde1d9fe5ffa4170e15f13dc4e"],
  ["0000:7C27", 0x7c27, 0x7ce2, "refresh viewport, hovered-unit panel, cursor and minimap", "5c8a9faf6b89f9a55eabddb79346d8f3029effae7a216fa96c50729ab480387f"],
  ["0000:8492", 0x8492, 0x851a, "delay, cache and dismiss hovered-unit detail panel", "d70ec4e86ae2d8ed246007d0984109d785db37ad4916f39aec3c92a8c4285772"],
  ["0000:851A", 0x851a, 0x853f, "compose complete hovered-unit detail panel", "c6b8b0affe92e35e19882c07e4b41cd7549080187fce793670639cb6dfb72542"],
  ["0000:853F", 0x853f, 0x8552, "invalidate both cached VGA pages after panel state change", "f05f99d56b4424166b0f98e70f2f3aed445310471c727a3242ac77111fdf7606"],
  ["0000:86C9", 0x86c9, 0x881e, "draw top panel, portrait-side gauges and outer frame", "77cb8a1c7e621f4dd5353205b251093dc2515e3a2e6a591389af89cdccf165cf"],
  ["0000:881E", 0x881e, 0x883c, "draw one vertical gauge frame", "022bab8aa8a121a271566a9f111a3e0eb9c53ebf377bf54aad0aef9ed4aa7905"],
  ["0000:883C", 0x883c, 0x88e4, "draw portrait border assembly", "6eaf3f01389fd34c9e48896dbdc90ee2ce9305a337ee111de12338107c058f19"],
  ["0000:88E4", 0x88e4, 0x8962, "format and draw current-round panel", "671033bebcd36a26056faa900b7d8d156cf45a61ed3cd4b987c8d0479f7cd047"],
  ["0000:8962", 0x8962, 0x89dc, "draw stat/status body and its border rectangles", "c8677078ceb647955dafb12f82f899959aa681072009f1e2990bdf1cae1372a3"],
  ["0000:89DC", 0x89dc, 0x8a08, "draw one stat-row separator frame", "df9be8b389261606e4482cdac32122754b57a6c9e75a6aac676bcf2c97c4cc38"],
  ["0000:8A08", 0x8a08, 0x8acd, "load A/17 and pack active status icons plus counters", "973db87e569e4d610f85fc812129564ac30a946334f395d4d337be804e8984c3"],
  ["0000:8ACD", 0x8acd, 0x8b2b, "load the current D resource request and draw portrait frame zero", "5d8bf9a37921a2f4dae4c38d1d64acdc758f28e11e6f0590de66db18206902e1"],
  ["0000:8B2B", 0x8b2b, 0x8b7c, "draw occupation, slash and per-unit name", "b11b4faa3c2135499e3731e8cb2ba3d524264ddee33497e1712a1d068fed51a2"],
  ["0000:8B7C", 0x8b7c, 0x8c24, "format five stat rows and conceal stage-37 enemy values", "b687e196ebd81f1f469b6ef2aad736db3fc51925bf084ba9d3fe011851bc106e"],
  ["0000:8C24", 0x8c24, 0x8c30, "overwrite one five-character numeric field with question marks", "8dabd699d776359a584326375ad29b187b654c2e990e514250187dff6b7bd476"],
  ["0000:8C30", 0x8c30, 0x8cea, "draw stat strings and proportional life/experience bars", "995f439a19a6d0f4537f4b815678b8ffae258c24cefd07586bd72c94e9d8f024"],
  ["0000:510C", 0x510c, 0x5230, "load selected unit state, display strings and presentation fields", "e0c39d4d53c8523629d00e260dcbdb1a3a26b236ac1ad1ee33e231cb7ce5cffd"],
];

// `[frame, width, height, maskUsed, sha256]`. Only frames 5..8 carry a real
// entry in the record's mask stream, and only those four are drawn by the
// masked writer `0000:D9FA` + `0000:D790`; the rest go to the maskless
// `0000:D5CF` and stay opaque. See `notes/unit-detail-hud-presentations.md`.
const HUD_CHROME_FRAMES = [
  [0, 8, 6, false, "09f3d4ae7625ce67de6ed9923aa9a5651a191476ef745b5f8f5b067f6ce3fbee"],
  [1, 8, 6, false, "ba58841a23f90b85a68c0a9921769c91bae6f4a197145b38ad87b525fca7d9bf"],
  [2, 8, 6, false, "91268191cadb0209aad297724ee3f9724860fe41fc586d113ab4c5114162b03d"],
  [3, 8, 6, false, "749cca1e36c1dc9d4fe44954e9f6dbffecb8cdca47509b6152839b03653a1d28"],
  [4, 8, 6, false, "100148b585eb60ffc851f399bded071364d0d1ee8e22fef1c2f80b33a3ebf909"],
  [5, 8, 7, true, "9e08e2c96eed1baf6808c628f7a6c443ecbcac843ba2fe1e71126edf32cedd43"],
  [6, 8, 7, true, "090c5603cb9eb4c4ec217d8eeb248275c2cec358f577728f72ea3c83013def7d"],
  [7, 8, 7, true, "1853baec88ccda48eb8a6baba2df0df047baca79b69901d313137d2352ac0c8d"],
  [8, 16, 9, true, "9ade1479c2251171c1c6d0b8301903cd3e5b003aabacb2cf17c57fd929446533"],
  [9, 160, 10, false, "5de38c5f7696fc517b3df97cf57cc1f030a206e24a64a26b92a77fe7be102103"],
  [10, 160, 10, false, "8a5357c1b4c98217bb849488e82cde461eadd733bb774d52a62d32346cd0c0e1"],
  [11, 16, 28, false, "1c52c30a8f785ff88c27db9dd53844208117d4b99a1aa911b9259cfce541dfb5"],
  [12, 16, 28, false, "ebd9a194d8007c77d965703e48bcd72832dfa9d80876ff338958b093e88ec4eb"],
  [13, 16, 28, false, "29969cbeacec8fc49184d0f2dc5e90a4caf32cacd7972c10f44a3e4e31cd97a8"],
  [14, 40, 7, false, "521361da28f5408552093c03faf27b2a5cc72f9acffba72ea1c50d5f38554039"],
];

const DATA_SIGNATURES = [
  ["DS:5DD4-5E18", 0x5dd4, 0x5e18, "numeric/name formatting buffers and status counter origins", "c445d9e6d6ed7e456b1aaa81e38dfb41e888122af6e218cc165e6e627ab8a81b"],
  ["DS:5E18-5EB3", 0x5e18, 0x5eb3, "status text candidates and five visible stat templates", "fde0146169ca516f9dbd5f87f3fea2797e43c778529533872a5fbddb10029100"],
  ["DS:5EB3-5FD5", 0x5eb3, 0x5fd5, "panel rectangles, icon positions, frame indices and bar descriptors", "6d5c2b1c8947ae16e8d8c6dad4a9b807c0533011220ae5e1bfb7fa0145d2f8f9"],
  ["DS:6006-6019", 0x6006, 0x6019, "round conversion buffer, visible template and panel-state byte", "153766a4d782f6a80146913074007ffbd7a1aca25d5634b066f9e786d4c01400"],
];

const RECTANGLE_SPECS = [
  [0x5eb3, "topBackground", [480, 0, 160, 149, 1]],
  [0x5ebd, "leftFramePatternSource", [0, 7, 1, 135, 15]],
  [0x5ec7, "lifeGaugeOuter", [605, 7, 12, 102, 0]],
  [0x5ed1, "lifeGaugeMiddle", [607, 8, 11, 101, 7]],
  [0x5edb, "lifeGaugeInner", [606, 8, 10, 100, 2]],
  [0x5ee5, "portraitTopLight", [488, 8, 112, 1, 14]],
  [0x5eef, "portraitTopShadow", [488, 9, 112, 1, 0]],
  [0x5ef9, "bodyTop", [480, 150, 160, 2, 14]],
  [0x5f03, "bodyLeft", [480, 150, 2, 171, 14]],
  [0x5f0d, "bodyRight", [638, 150, 2, 171, 14]],
  [0x5f17, "bodyBottom", [480, 319, 160, 2, 14]],
  [0x5f21, "firstDividerLight", [480, 172, 160, 1, 14]],
  [0x5f2b, "firstDividerTopShadow", [482, 173, 156, 1, 0]],
  [0x5f35, "firstInsetLeft", [482, 173, 1, 20, 0]],
  [0x5f3f, "firstInsetRight", [637, 173, 1, 20, 0]],
  [0x5f49, "firstDividerBottom", [482, 192, 156, 1, 15]],
  [0x5f53, "statusDividerLight", [480, 256, 160, 1, 14]],
  [0x5f5d, "statusInsetTop", [482, 257, 156, 1, 0]],
  [0x5f67, "statusInsetLeft", [482, 257, 1, 63, 0]],
  [0x5f71, "statusInsetRight", [637, 257, 1, 63, 0]],
  [0x5f7b, "firstDividerDuplicate", [482, 192, 156, 1, 15]],
  [0x5fbd, "dynamicLifeBarInitial", [606, 7, 11, 0, 11]],
  [0x5fc7, "dynamicExperienceBarInitial", [619, 7, 11, 0, 8]],
];

const STATUS_SLOTS = [
  ["attackUp", "攻擊上升", 0x08],
  ["defenseUp", "防禦上升", 0x0a],
  ["defenseMagic", "防魔", 0x0c],
  ["confusion", "混亂", 0x0e],
  ["attackDown", "攻擊下降", 0x10],
  ["defenseDown", "防禦下降", 0x12],
  ["poison", "施毒", 0x14],
  ["spellSeal", "禁咒", 0x16],
];

const STAT_ROWS = [
  ["life", 0x5e64, 488, 154, "生命00000/00000 ", ["DS:319F", "DS:31C3"]],
  ["attack", 0x5e75, 488, 175, "攻擊00000/00000 ", ["DS:31BF", "DS:31CF"]],
  ["defense", 0x5e86, 488, 196, "防禦00000/00000 ", ["DS:31C1", "DS:31D1"]],
  ["levelGrowthRow", 0x5e97, 488, 217, "等級00000 ", ["DS:31BD"]],
  ["experience", 0x5ea2, 488, 238, "經驗00000/00000 ", ["DS:318E", "DS:31A1"]],
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function dataSlice(buffer, start, end) {
  return buffer.subarray(MODULE29_DATA_BASE + start, MODULE29_DATA_BASE + end);
}

function word(buffer, offset) {
  return buffer.readUInt16LE(MODULE29_DATA_BASE + offset);
}

function dollarString(buffer, offset) {
  let end = MODULE29_DATA_BASE + offset;
  while (end < buffer.length && buffer[end] !== 0x24) end += 1;
  assert(end < buffer.length, `DS:${hex(offset)} lacks a dollar terminator`);
  const raw = buffer.subarray(MODULE29_DATA_BASE + offset, end);
  return {
    address: `DS:${hex(offset)}`,
    text: BIG5.decode(raw),
    big5Hex: raw.toString("hex").toUpperCase(),
  };
}

function verifySignatures(buffer) {
  const code = CODE_SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = buffer.subarray(start, end);
    assert.equal(sha256(bytes), expected, `${address}: ${role} signature mismatch`);
    return { address, fileOffset: start, bytes: bytes.length, role, sha256: expected };
  });
  const data = DATA_SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = dataSlice(buffer, start, end);
    assert.equal(sha256(bytes), expected, `${address}: ${role} signature mismatch`);
    return { address, fileOffset: MODULE29_DATA_BASE + start, bytes: bytes.length, role, sha256: expected };
  });
  return { code, data };
}

function parseRectangles(buffer) {
  return RECTANGLE_SPECS.map(([offset, id, expected]) => {
    const values = Array.from({ length: 5 }, (_, index) => word(buffer, offset + index * 2));
    assert.deepEqual(values, expected, `DS:${hex(offset)} ${id} rectangle changed`);
    const [x, y, width, height, colorIndex] = values;
    return { id, address: `DS:${hex(offset)}`, x, y, width, height, colorIndex };
  });
}

function parseWordTable(buffer, offset, count, expected, role) {
  const values = Array.from({ length: count }, (_, index) => word(buffer, offset + index * 2));
  assert.deepEqual(values, expected, `DS:${hex(offset)} ${role} changed`);
  return { address: `DS:${hex(offset)}`, values };
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

async function loadGraphic(planarRoot, manifest, group, record, imageIndex) {
  const entry = manifest.entries.find((candidate) => candidate.record === record);
  assert(entry?.rendered, `${group}/${record}: rendered record is missing`);
  const image = entry.images.find((candidate) => candidate.index === imageIndex);
  assert(image !== undefined, `${group}/${record}/${imageIndex}: rendered image is missing`);
  const absolutePath = path.join(planarRoot, group, image.output);
  const buffer = await readFile(absolutePath);
  return {
    group,
    record,
    imageIndex,
    width: image.width,
    height: image.height,
    maskUsed: image.maskUsed,
    path: normalizePath(path.join(planarRoot, group, image.output)),
    bytes: buffer.length,
    sha256: sha256(buffer),
    dataUri: `data:image/png;base64,${buffer.toString("base64")}`,
  };
}

function rgbHex([red, green, blue]) {
  return `#${[red, green, blue].map((value) => hex(value, 2)).join("")}`;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function buildSvg({ palette, rectangles, portrait, statusGraphics }) {
  const color = (index) => rgbHex(palette[index]);
  const byId = new Map(rectangles.map((rectangle) => [rectangle.id, rectangle]));
  const drawnRectangles = rectangles.filter((rectangle) =>
    !rectangle.id.includes("PatternSource") && !rectangle.id.startsWith("dynamic"));
  const rectangleSvg = drawnRectangles.map((rectangle) =>
    `<rect x="${rectangle.x}" y="${rectangle.y}" width="${rectangle.width}" height="${rectangle.height}" fill="${color(rectangle.colorIndex)}"/>`).join("\n      ");
  const statSamples = [
    [488, 154, "生命00120/00150 "],
    [488, 175, "攻擊00067/00055 "],
    [488, 196, "防禦00049/00045 "],
    [488, 217, "等級00008 "],
    [488, 238, "經驗00250/00300 "],
  ].map(([x, y, text]) => `<text x="${x}" y="${y}" class="native">${escapeXml(text)}</text>`).join("\n      ");
  const statusSvg = statusGraphics.map((graphic, index) => {
    const x = [484, 522, 560, 598, 484, 522, 560, 598][index];
    const y = [259, 259, 259, 259, 289, 289, 289, 289][index];
    return `<image x="${x}" y="${y}" width="40" height="31" href="${graphic.dataUri}"/>\n` +
      `      <text x="${x - 6}" y="${y + 20}" class="counter">3</text>`;
  }).join("\n      ");
  const lifeBar = byId.get("dynamicLifeBarInitial");
  const experienceBar = byId.get("dynamicExperienceBarInitial");
  const lifePercent = 80, experiencePercent = 55;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="940" height="430" viewBox="0 0 940 430">
  <style>
    .native { font-size: 14px; font-family: STHeiti; dominant-baseline: hanging; fill: ${color(15)}; }
    .counter { font-size: 12px; font-family: STHeiti; dominant-baseline: hanging; fill: ${color(15)}; stroke: ${color(0)}; stroke-width: 1px; paint-order: stroke; }
    .note { font-size: 14px; font-family: STHeiti; fill: #222; }
    .small { font-size: 12px; font-family: STHeiti; fill: #444; }
    .guide { stroke: #E04444; stroke-width: 1; stroke-dasharray: 4 3; fill: none; }
  </style>
  <rect width="940" height="430" fill="#F4F1EA"/>
  <g id="native-coordinate-space">
    <rect x="0" y="0" width="640" height="350" fill="${color(0)}"/>
    <rect x="0" y="0" width="480" height="350" fill="${color(1)}" opacity="0.38"/>
    <text x="18" y="18" class="small" fill="#FFFFFF">10×7 battlefield viewport omitted</text>
    <rect x="480" y="150" width="160" height="171" fill="${color(1)}"/>
      ${rectangleSvg}
    <image x="488" y="8" width="112" height="112" href="${portrait.dataUri}"/>
    <rect x="488" y="8" width="112" height="112" class="guide"/>
    <rect x="${lifeBar.x}" y="${108 - lifePercent}" width="${lifeBar.width}" height="${lifePercent}" fill="${color(lifeBar.colorIndex)}"/>
    <rect x="${experienceBar.x}" y="${108 - experiencePercent}" width="${experienceBar.width}" height="${experiencePercent}" fill="${color(experienceBar.colorIndex)}"/>
    <text x="484" y="124" class="native">職業</text>
    <text x="552" y="124" class="native">／</text>
    <text x="564" y="124" class="native">名字</text>
      ${statSamples}
      ${statusSvg}
    <text x="516" y="327" class="native">第  10  回合</text>
    <rect x="480" y="0" width="160" height="350" class="guide"/>
  </g>
  <g transform="translate(665 25)">
    <text class="note" x="0" y="0">单位详情 HUD 核验图</text>
    <text class="small" x="0" y="28">红框与绘制原点来自原生代码/DS 表。</text>
    <text class="small" x="0" y="48">A/17 状态图标为实际提取资源。</text>
    <text class="small" x="0" y="68">肖像仅为 D/46 代表样本；运行时由</text>
    <text class="small" x="0" y="86">DS:3192 动态请求，映射仍单独保留。</text>
    <text class="small" x="0" y="116">字体、背景图案和示例数值是示意；</text>
    <text class="small" x="0" y="134">JSON 中的坐标、字段与资源绑定权威。</text>
    <text class="small" x="0" y="164">状态图标按有效槽紧密填充两行，</text>
    <text class="small" x="0" y="182">不是固定在各自的槽位坐标。</text>
    <text class="small" x="0" y="212">第 37 关 + side 2 + 发布版：</text>
    <text class="small" x="0" y="230">九个五字符数值字段全部显示 ?????。</text>
  </g>
  <text x="12" y="382" class="small">原生坐标范围 640×350；右侧详情区 X=480..639。此文件是证据核验图，不是原版截图。</text>
</svg>
`;
}

async function extract(module29Path, planarRoot, outputJsonPath, outputSvgPath) {
  const [module29, aManifestBuffer, dManifestBuffer] = await Promise.all([
    readFile(module29Path),
    readFile(path.join(planarRoot, "A/manifest.json")),
    readFile(path.join(planarRoot, "D/manifest.json")),
  ]);
  assert.equal(sha256(module29), MODULE29_SHA256, "unexpected module-29 runtime image");
  const signatures = verifySignatures(module29);
  const rectangles = parseRectangles(module29);
  const aManifest = JSON.parse(aManifestBuffer), dManifest = JSON.parse(dManifestBuffer);
  assert.equal(aManifest.palette, "gameplay");
  assert.deepEqual(aManifest.paletteColors, dManifest.paletteColors);

  const statusX = parseWordTable(module29, 0x5f8d, 8,
    [484, 522, 560, 598, 484, 522, 560, 598], "packed status-icon x positions");
  const statusY = parseWordTable(module29, 0x5f9d, 8,
    [259, 259, 259, 259, 289, 289, 289, 289], "packed status-icon y positions");
  const statusFrameIndices = parseWordTable(module29, 0x5fad, 8,
    [0, 1, 2, 3, 4, 5, 6, 7], "status-slot to A/17 frame table");

  const statusGraphics = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    loadGraphic(planarRoot, aManifest, "A", 17, index)));
  for (const graphic of statusGraphics) {
    assert.equal(graphic.width, 40);
    assert.equal(graphic.height, 31);
    assert.equal(graphic.maskUsed, true);
  }
  const representativePortrait = await loadGraphic(planarRoot, dManifest, "D", 46, 0);
  assert.equal(representativePortrait.width, 112);
  assert.equal(representativePortrait.height, 112);
  const chromeGraphics = await Promise.all(HUD_CHROME_FRAMES.map(([frame]) =>
    loadGraphic(planarRoot, aManifest, "A", 6, frame)));
  HUD_CHROME_FRAMES.forEach(([frame, width, height, maskUsed, expectedSha256], index) => {
    const graphic = chromeGraphics[index];
    assert.equal(graphic.imageIndex, frame);
    assert.equal(graphic.width, width, `A/6/${frame} width changed`);
    assert.equal(graphic.height, height, `A/6/${frame} height changed`);
    assert.equal(graphic.sha256, expectedSha256, `A/6/${frame} PNG changed`);
    assert.equal(graphic.maskUsed, maskUsed, `A/6/${frame} mask usage changed`);
  });

  const statRows = STAT_ROWS.map(([id, address, x, y, expectedTemplate, sources]) => {
    const template = dollarString(module29, address);
    assert.equal(template.text, expectedTemplate, `DS:${hex(address)} ${id} template changed`);
    return { id, ...template, origin: { x, y }, sources };
  });
  const statusTextCandidates = [0x5e18, 0x5e22, 0x5e2d, 0x5e38, 0x5e43, 0x5e4e, 0x5e59]
    .map((address) => dollarString(module29, address));
  const slash = dollarString(module29, 0x5df8);
  assert.equal(slash.text, "／");
  const roundTemplate = dollarString(module29, 0x600b);
  assert.equal(roundTemplate.text, "第  10  回合");

  const statusSlots = STATUS_SLOTS.map(([id, displayMeaning, stateOffset], index) => ({
    index,
    id,
    displayMeaning,
    dynamicStateOffset: `+${hex(stateOffset, 2)}`,
    loadedAddress: `DS:${hex(0x31a7 + index * 2)}`,
    activeBit: 15,
    remainingValueMask: "0x7FFF",
    graphic: {
      resource: "A/17",
      frame: statusFrameIndices.values[index],
      width: statusGraphics[index].width,
      height: statusGraphics[index].height,
      path: statusGraphics[index].path,
      pngSha256: statusGraphics[index].sha256,
    },
  }));

  const output = {
    format: "ANGEL2 hovered-unit HUD presentation specification",
    source: { module: 29, path: normalizePath(module29Path), sha256: MODULE29_SHA256 },
    generatedArtifact: normalizePath(outputSvgPath),
    verifiedCodeSignatures: signatures.code,
    verifiedDataSignatures: signatures.data,
    coordinateSpace: { width: 640, height: 350, unitDetailRegion: { minX: 480, maxX: 639, minY: 0, maxY: 349 } },
    refreshLifecycle: {
      viewportRefresh: "0000:7C27 redraws the 10x7 viewport, then calls the hovered-unit controller before cursor/minimap completion",
      prerequisites: ["DS:5D48 unit-detail setting is 'Y'", "DS:6004 controller gate is 'Y'", "mouse pointer x <= 440 when mouse mode is active", "focused board cell is occupied"],
      delay: { counter: "DS:6019", updateTicks: 4, redrawCache: "DS:6002 focused linear cell" },
      dismissal: "clear the cached cell/timer, invalidate both cached VGA pages, then restore the ordinary side panel and minimap",
      activeFlag: "DS:5DEC 'N'/'Y'",
    },
    compositionOrder: [
      { function: "0000:86C9", layer: "top frame and portrait-side gauges" },
      { function: "0000:8ACD", layer: "dynamic D portrait frame zero at (488,8)" },
      { function: "0000:883C", layer: "portrait border" },
      { function: "0000:8B2B", layer: "occupation / unit name row" },
      { function: "0000:88E4", layer: "round panel" },
      { function: "0000:8962", layer: "stat/status body, text, bars and status icons" },
      { function: "0000:851A", layer: "copy current VGA page into the cached panel buffer" },
    ],
    rectangles,
    portrait: {
      requestField: "DS:3192",
      resourceContainer: "D.SWF (loader container id 2)",
      frame: 0,
      origin: { x: 488, y: 8 },
      dimensions: { width: 112, height: 112 },
      mappingBoundary: "DS:3192 is passed dynamically to the indexed loader; the complete logical-value to extracted D record mapping is not asserted here",
      representativeOnly: {
        resource: "D/46",
        frame: 0,
        path: representativePortrait.path,
        pngSha256: representativePortrait.sha256,
        reason: "layout verification only; not a claim that D/46 is the hovered unit's portrait",
      },
    },
    identityRow: {
      occupation: { source: "DS:31BB", origin: { x: 484, y: 124 }, formattedBuffer: "DS:5DEF" },
      separator: { ...slash, origin: { x: 552, y: 124 } },
      unitName: { source: "DS:3190", origin: { x: 564, y: 124 }, formattedBuffer: "DS:5DFB" },
      visibleOrder: "occupation / per-unit name",
    },
    statRows,
    gauges: {
      heightPixels: 100,
      life: { x: 606, width: 11, colorIndex: 11, source: "DS:319F / DS:31C3", percent: "floor(currentLife*100/maxLife)", dynamicRect: "y=108-percent, height=percent", zeroPercentDrawsNothing: true },
      experience: { x: 619, width: 11, colorIndex: 8, source: "DS:318E / DS:31A1", percent: "floor(currentExperience*100/nextThreshold)", dynamicRect: "y=108-percent, height=percent", zeroPercentDrawsNothing: true },
    },
    stage37Concealment: {
      condition: "release developer flag DS:132F != 'Y' AND current stage DS:2E77 == 37 AND selected side DS:31C9 == 2",
      effect: "replace all nine five-character numeric fields in the five stat templates with ?????",
      fields: ["current life", "maximum life", "effective attack", "base/current attack", "effective defense", "base/current defense", "level/growth row", "current experience", "next experience threshold"],
      developerPatchBoundary: "if DS:132F is externally patched to 'Y', the concealment branch is skipped; this is not a player-facing option",
    },
    round: {
      source: "DS:2F83",
      conversionBuffer: "DS:6006 (five characters)",
      template: roundTemplate,
      origin: { x: 516, y: 327 },
      formatting: "copy the final three converted characters into the visible round template; the native numeric formatter changes leading zeroes to spaces",
    },
    sidePanelChrome: {
      resource: "A/6",
      unitTop: {
        dimensions: { width: 160, height: 149 },
        background: { x: 480, y: 0, width: 160, height: 149, colorIndex: 1 },
        outerFrame: {
          top: { frame: 1, firstOrigin: { x: 487, y: 0 }, stepX: 8, repeats: 20 },
          bottom: { frame: 0, firstOrigin: { x: 487, y: 143 }, stepX: 8, repeats: 20 },
          corners: { frame: 5, origins: [{ x: 480, y: 0 }, { x: 480, y: 142 }, { x: 633, y: 0 }, { x: 633, y: 142 }] },
          leftVerticalColors: [14, 0, 11, 14, 0],
          rightVerticalColors: [0, 14, 11, 0, 14],
          verticalRange: { y: 7, height: 135 },
        },
        portraitFrame: {
          left: { frame: 6, firstOrigin: { x: 488, y: 8 }, stepY: 7, repeats: 16 },
          right: { frame: 7, firstOrigin: { x: 595, y: 8 }, stepY: 7, repeats: 16 },
          bottom: { frame: 3, firstOrigin: { x: 488, y: 114 }, stepX: 8, repeats: 13 },
          bottomLeft: { frame: 2, origin: { x: 488, y: 114 } },
          bottomRight: { frame: 4, origin: { x: 592, y: 114 } },
          centerOrnament: { frame: 8, origin: { x: 536, y: 113 } },
          topLight: { x: 488, y: 8, width: 112, height: 1, colorIndex: 14 },
          topShadow: { x: 488, y: 9, width: 112, height: 1, colorIndex: 0 },
        },
        gaugeLabel: { frame: 14, origin: { x: 600, y: 113 } },
      },
      body: {
        bounds: { x: 480, y: 150, width: 160, height: 171 },
        statRowStarts: [151, 172, 193, 214, 235],
        rowPattern: {
          light: { x: 480, width: 160, height: 1, colorIndex: 14 },
          insetTop: { x: 482, width: 156, height: 1, yOffset: 1, colorIndex: 0 },
          insetSides: { leftX: 482, rightX: 637, width: 1, height: 20, yOffset: 1, colorIndex: 0 },
          bottom: { x: 482, width: 156, height: 1, yOffset: 20, colorIndex: 15 },
        },
        statusFrame: { topY: 256, insetY: 257, leftX: 482, rightX: 637, bottomY: 320 },
      },
      tacticalMinimap: {
        bounds: { x: 480, y: 150, width: 160, height: 171 },
        top: { frame: 9, origin: { x: 480, y: 150 } },
        bottom: { frame: 10, origin: { x: 480, y: 311 } },
        left: { frame: 6, firstOrigin: { x: 480, y: 160 }, stepY: 7, repeats: 22 },
        right: { frame: 7, firstOrigin: { x: 635, y: 160 }, stepY: 7, repeats: 22 },
        liveMapBounds: { x: 485, y: 161, width: 150, height: 150 },
      },
      roundFrame: {
        bounds: { x: 480, y: 322, width: 160, height: 28 },
        repeated: { frame: 12, firstOrigin: { x: 480, y: 322 }, stepX: 8, repeats: 18 },
        left: { frame: 11, origin: { x: 480, y: 322 } },
        right: { frame: 13, origin: { x: 624, y: 322 } },
      },
      frames: chromeGraphics.map(({ dataUri, ...graphic }) => graphic),
    },
    statuses: {
      resource: { key: "A/17", frames: 8, dimensions: { width: 40, height: 31 }, transparentMask: true },
      slots: statusSlots,
      packing: {
        scanOrder: "state slots 0..7",
        activation: "bit 15 set",
        placement: "active statuses are packed consecutively into display positions; inactive slots leave no gap",
        xPositions: statusX,
        yPositions: statusY,
        counterOrigin: "(iconX-6, iconY+20)",
        counterValue: "statusWord & 0x7FFF",
        speechDuringCounterDraw: false,
      },
      dormantTextCandidates: {
        strings: statusTextCandidates,
        evidenceBoundary: "these adjacent Big5 labels exist in module data but no direct unit-detail HUD reference was found; the confirmed HUD status consumer draws A/17 icons and counters only",
      },
    },
    resourceValidation: {
      palette: aManifest.palette,
      paletteColors: aManifest.paletteColors,
      statusPngs: statusGraphics.map(({ dataUri, ...graphic }) => graphic),
      hudChromePngs: chromeGraphics.map(({ dataUri, ...graphic }) => graphic),
      representativePortrait: (({ dataUri, ...graphic }) => graphic)(representativePortrait),
    },
    evidenceBoundary: {
      confirmed: "activation/dismissal, composition order, native coordinates, labels and numeric sources, both proportional bars, round formatting, eight icon resources and packed counters, and stage-37 enemy-number concealment",
      preservedUnknown: "complete DS:3192-to-D-record mapping and native glyph rasterization in this schematic; one released update tick is nominally 10.000151 ms, while battle range rendering and the separate DS:58A5 map-effect layer are specified by range-presentations.json",
      visualization: "the SVG embeds extracted palette-correct resources and uses code-exact coordinates, but its font, background pattern, sample values and portrait choice are explicitly schematic",
      implementation: "frozen until the phase-1 GDD review passes",
    },
    validation: {
      codeSignatures: signatures.code.length,
      dataSignatures: signatures.data.length,
      parsedRectangles: rectangles.length,
      statRows: statRows.length,
      statusSlots: statusSlots.length,
      statusResources: statusGraphics.length,
      hudChromeResources: chromeGraphics.length,
      implementationFrozen: true,
    },
  };

  const svg = buildSvg({
    palette: aManifest.paletteColors,
    rectangles,
    portrait: representativePortrait,
    statusGraphics,
  });
  await Promise.all([
    mkdir(path.dirname(outputJsonPath), { recursive: true }),
    mkdir(path.dirname(outputSvgPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(outputJsonPath, `${JSON.stringify(output, null, 2)}\n`),
    writeFile(outputSvgPath, svg),
  ]);
  console.log(`verified ${signatures.code.length} code and ${signatures.data.length} data signatures; wrote ${outputJsonPath} and ${outputSvgPath}`);
}

function usage() {
  return "usage: angel2-hud-presentations.mjs --extract MODULE29 PLANAR_ROOT OUTPUT_JSON OUTPUT_SVG";
}

const [command, ...args] = process.argv.slice(2);
if (command !== "--extract" || args.length !== 4) {
  console.error(usage());
  process.exitCode = 1;
}
else {
  extract(...args).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { extract };
