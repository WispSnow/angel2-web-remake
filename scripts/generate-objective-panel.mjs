#!/usr/bin/env node

/**
 * Builds the runtime contract for the 勝利條件 panel: its native geometry and,
 * per stage, the SAY record the original actually draws inside it.
 *
 * The panel is not a menu and not an A/18 window. `0000:BAA4` writes the system
 * action code `5931` and hands off to `0000:B97C`, which far-calls `12E7:0008`.
 * That routine loads the stage's own SAY/NUM/CHA triple, swaps the glyph code
 * table and bitmaps to that stage's subset, draws a framed panel plus the record
 * verbatim, and waits for either primary or secondary before restoring — the
 * same subset mechanism the bottom stage label uses.
 *
 * Everything emitted here is read back out of the module image and asserted, so
 * a drift in the evidence breaks the build instead of silently reshaping a
 * player-visible panel.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeRgbaPng, encodeRgbaPng } from "./lib/png-atlas.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const publicAssetPath = path.join(root, "public", "assets", "original");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const sources = [];
async function loadInput(relativePath) {
  const buffer = await readFile(reversePath(relativePath));
  sources.push({
    id: path.basename(relativePath, path.extname(relativePath)),
    path: `reverse/${relativePath.split(path.sep).join("/")}`,
    sha256: sha256(buffer),
    bytes: buffer.length,
  });
  return buffer;
}

const moduleImage = await loadInput(path.join("unpacked", "lzexe-modules", "raw", "0029-unpacked.bin"));
const story = JSON.parse((await loadInput(path.join("parsed", "native", "story-presentations.json"))).toString("utf8"));

/**
 * Module 29 loads at file offset 0 for segment 0, so a `0000:xxxx` code address
 * is its own offset. The data segment base is recovered from the one string
 * whose DS address is already closed evidence: the round template at `DS:600B`.
 */
const ROUND_TEMPLATE_BIG5 = Buffer.from([0xb2, 0xc4, 0x20, 0x20, 0x31, 0x30, 0x20, 0x20]);
const roundTemplateOffset = moduleImage.indexOf(ROUND_TEMPLATE_BIG5);
assert.notEqual(roundTemplateOffset, -1, "the DS:600B round template is no longer in the module image");
const dataBase = roundTemplateOffset - 0x600b;

const dsWord = (address) => moduleImage.readUInt16LE(dataBase + address);

/** `0000:D04C` reads five words: x, y, width, height, colour index. */
function rectangle(address) {
  return {
    address: `DS:${address.toString(16).toUpperCase().padStart(4, "0")}`,
    x: dsWord(address),
    y: dsWord(address + 2),
    width: dsWord(address + 4),
    height: dsWord(address + 6),
    colorIndex: dsWord(address + 8),
  };
}

// 12E7:00D1 draws the shadow first and the body over it, so the visible shadow
// is the L the body does not cover.
const shadow = rectangle(0x122c);
const body = rectangle(0x1236);
assert.deepEqual(
  { x: shadow.x - body.x, y: shadow.y - body.y },
  { x: 16, y: 16 },
  "the objective panel shadow is no longer the body offset by 16",
);
assert.equal(shadow.width, body.width, "the objective panel shadow no longer matches the body width");
assert.equal(shadow.height, body.height, "the objective panel shadow no longer matches the body height");

/** Scans `12E7:00D1` for every `mov word [target], imm16`, in program order. */
function immediates(target, from, to) {
  const found = [];
  for (let address = from; address < to; address += 1) {
    if (moduleImage[address] !== 0xc7 || moduleImage[address + 1] !== 0x06) continue;
    if (moduleImage.readUInt16LE(address + 2) !== target) continue;
    found.push(moduleImage.readUInt16LE(address + 4));
  }
  return found;
}

/**
 * The five single-pixel columns down each side. `DS:1240` is one descriptor the
 * routine mutates in place: `mov word [1240], x` seeds each side, `inc word
 * [1240]` walks outwards, and `mov word [1248], n` sets that column's colour.
 * So both sides fall out of the immediates, in the order they are written.
 */
const BEVEL_START = 0x12f00;
const BEVEL_END = 0x13060;
const bevelStarts = immediates(0x1240, BEVEL_START, BEVEL_END);
const bevelColors = immediates(0x1248, BEVEL_START, BEVEL_END);
assert.deepEqual(bevelStarts.length, 2, "the objective panel no longer seeds exactly two bevel runs");
assert.equal(bevelColors.length, 10, "the objective panel bevels are no longer five columns a side");
const leftBevel = { startX: bevelStarts[0], colors: bevelColors.slice(0, 5) };
const rightBevel = { startX: bevelStarts[1], colors: bevelColors.slice(5) };
assert.equal(dsWord(0x1240 + 6), body.height, "the objective panel bevel columns no longer span the body height");
assert.equal(leftBevel.startX, body.x, "the left bevel no longer starts at the body's left edge");
assert.equal(
  rightBevel.startX,
  body.x + body.width,
  "the right bevel no longer starts at the body's right edge",
);

/**
 * `12E7:00E1..0117`: the edge band. The routine points the sprite bank at
 * `DS:02A5` — the slot `0000:0493`'s loader fills from `A/0006`, already closed
 * as the promotion menu's panel resource — then walks one 8-pixel cell at a
 * time across the body, drawing one bank image at the body's top edge and
 * another one body height lower.
 *
 * `0000:D5CB` is the opaque four-plane writer: it copies four plane pointers out
 * of the bank descriptor and `rep movsw`s each one straight into video memory,
 * consulting no mask. That is why `A/0006`'s mask stream carries only a 1-row
 * placeholder for these two images.
 */
const EDGE_START = 0x12f51;
const EDGE_END = 0x12f87;
const BANK_POINTER = 0x2a5;
assert.deepEqual(
  immediates(0xf884, EDGE_START, EDGE_END),
  [BANK_POINTER],
  "the objective panel edge band no longer selects the A/0006 sprite bank",
);

/** `B9 imm16` / `BB imm16` — the per-call register arguments of the edge loop. */
function registerImmediates(opcode, from, to) {
  const found = [];
  for (let address = from; address < to; address += 1) {
    if (moduleImage[address] !== opcode) continue;
    found.push(moduleImage.readUInt16LE(address + 1));
  }
  return found;
}

const edgeSeeds = immediates(0x124a, EDGE_START, EDGE_END);
assert.deepEqual(edgeSeeds, [body.x], "the objective panel edge band no longer starts at the body's left edge");
// `83 06 4A 12 imm8`: the cursor step the loop adds after each pair of cells.
const edgeStepAddress = moduleImage.indexOf(
  Buffer.from([0x83, 0x06, 0x4a, 0x12]),
  EDGE_START,
);
assert(edgeStepAddress > 0 && edgeStepAddress < EDGE_END, "the objective panel edge band no longer steps its cursor");
const edgeStep = moduleImage[edgeStepAddress + 4];
const edgeCounts = registerImmediates(0xb9, EDGE_START, EDGE_END);
const edgeRows = registerImmediates(0xbb, EDGE_START, EDGE_END);
assert.equal(
  edgeCounts.length,
  3,
  "the objective panel edge loop no longer sets exactly a cell count and two image indices",
);
assert.equal(
  edgeRows.length,
  2,
  "the objective panel edge loop no longer draws exactly two rows of cells",
);
const [edgeCells, topEdgeImage, bottomEdgeImage] = edgeCounts;
const [topEdgeY, bottomEdgeY] = edgeRows;
assert.equal(
  edgeCells * edgeStep,
  body.width,
  "the objective panel edge band no longer spans exactly the body width",
);
assert.equal(topEdgeY, body.y, "the objective panel top edge no longer sits on the body's first row");
assert.equal(
  bottomEdgeY,
  body.y + body.height,
  "the objective panel bottom edge no longer sits directly below the body",
);

/**
 * `12E7:01CF..023F`: the four corner ornaments, eight fixed 14-byte blocks of
 * `mov dx,x / mov bx,y / mov cx,image / call far`. Each corner is drawn twice —
 * `0000:D9FA` ANDs the bank's fifth stream over all four planes (set bit keeps
 * the background, so it punches the sprite's own silhouette black) and
 * `0000:D790` ORs the four colour planes into the hole. That pair is the
 * transparent blit; the edge band above uses neither.
 */
const CORNER_START = 0x1303f;
const CORNER_END = 0x130af;
const CORNER_BLOCK_BYTES = 14;
const MASK_WRITER = 0xd9fa;
const COLOR_WRITER = 0xd790;
const cornerBlocks = [];
for (let address = CORNER_START; address < CORNER_END; address += CORNER_BLOCK_BYTES) {
  assert.deepEqual(
    [moduleImage[address], moduleImage[address + 3], moduleImage[address + 6], moduleImage[address + 9]],
    [0xba, 0xbb, 0xb9, 0x9a],
    `the objective panel corner block at ${address.toString(16)} is no longer dx/bx/cx then a far call`,
  );
  cornerBlocks.push({
    x: moduleImage.readUInt16LE(address + 1),
    y: moduleImage.readUInt16LE(address + 4),
    image: moduleImage.readUInt16LE(address + 7),
    target: moduleImage.readUInt16LE(address + 12) * 16 + moduleImage.readUInt16LE(address + 10),
  });
}
assert.equal(cornerBlocks.length, 8, "the objective panel no longer draws four masked corners");
const corners = [];
for (let index = 0; index < cornerBlocks.length; index += 2) {
  const [mask, color] = cornerBlocks.slice(index, index + 2);
  assert.equal(mask.target, MASK_WRITER, "an objective panel corner no longer starts with the mask writer");
  assert.equal(color.target, COLOR_WRITER, "an objective panel corner no longer follows with the colour writer");
  assert.deepEqual(
    { x: mask.x, y: mask.y, image: mask.image },
    { x: color.x, y: color.y, image: color.image },
    "an objective panel corner draws its mask and its colours at different places",
  );
  corners.push({ x: mask.x, y: mask.y });
}
const cornerImage = cornerBlocks[0].image;
assert(
  cornerBlocks.every((block) => block.image === cornerImage),
  "the four objective panel corners no longer share one bank image",
);
// The four ornaments are the cross product of two x and two y values, and they
// are deliberately not symmetric about the body: the left/top pair sits exactly
// on the body's own origin, while the right pair starts three pixels inside the
// right edge and the bottom pair two rows above the last body row, so that each
// ornament's seven opaque columns land over the bevel and the bottom band.
const ascending = (left, right) => left - right;
assert.deepEqual(
  [...new Set(corners.map(({ x }) => x))].sort(ascending),
  [body.x, body.x + body.width - 3],
  "the objective panel corners no longer hug the body's left and right edges",
);
assert.deepEqual(
  [...new Set(corners.map(({ y }) => y))].sort(ascending),
  [body.y, body.y + body.height - 2],
  "the objective panel corners no longer hug the body's top and bottom edges",
);

/**
 * The bank images themselves, taken from the planar audit's own renders so the
 * palette, plane order and per-image mask rule all stay with the decoder that
 * owns them. `A/0006` stores a real transparency mask only for the slots the
 * native draws through the masked writer, so `maskUsed` is the audit's record of
 * which writer each image belongs to — and it has to agree with the writer the
 * panel routine actually calls.
 */
const PLANAR_RECORD = "0006";
const planarManifest = JSON.parse(
  (await loadInput(path.join("renders", "planar", "A", "manifest.json"))).toString("utf8"),
);
assert.equal(planarManifest.palette, "gameplay", "the A planar renders are no longer in the gameplay palette");
assert.equal(
  planarManifest.maskRule,
  "stream 4, per image: a set bit in a same-layout mask bitmap means transparent",
  "the planar mask rule changed under the objective panel frame",
);
const planarRecord = planarManifest.entries.find((entry) => entry.record === 6);
assert(planarRecord?.rendered, "A/0006 is no longer rendered by the planar audit");

async function bankImage(index, { masked }) {
  const name = String(index).padStart(2, "0");
  const rendered = decodeRgbaPng(
    await loadInput(path.join("renders", "planar", "A", PLANAR_RECORD, `${name}.png`)),
    `A/0006 image ${index}`,
  );
  const declared = planarRecord.images[index];
  assert.deepEqual(
    { width: rendered.width, height: rendered.height, maskUsed: declared?.maskUsed },
    { width: declared?.width, height: declared?.height, maskUsed: masked },
    `A/0006 image ${index} no longer matches the writer the objective panel draws it with`,
  );
  const transparent = [...rendered.pixels].filter((_, offset) => offset % 4 === 3)
    .some((alpha) => alpha === 0);
  assert.equal(
    transparent,
    masked,
    `A/0006 image ${index} ${masked ? "lost" : "gained"} transparent pixels`,
  );
  return rendered;
}

const frameImages = {
  // The edge band goes through `0000:D5CB`, which never reads the mask.
  "objective-panel-edge-top.png": await bankImage(topEdgeImage, { masked: false }),
  "objective-panel-edge-bottom.png": await bankImage(bottomEdgeImage, { masked: false }),
  // The ornament goes through the `0000:D9FA` + `0000:D790` pair, which does.
  "objective-panel-corner.png": await bankImage(cornerImage, { masked: true }),
};
const topEdgeCell = frameImages["objective-panel-edge-top.png"];
const bottomEdgeCell = frameImages["objective-panel-edge-bottom.png"];
const cornerCell = frameImages["objective-panel-corner.png"];
assert.deepEqual(
  [topEdgeCell.width, bottomEdgeCell.width],
  [edgeStep, edgeStep],
  "the objective panel edge cells are no longer as wide as the loop's cursor step",
);
assert.equal(
  topEdgeCell.height,
  bottomEdgeCell.height,
  "the objective panel's two edge cells are no longer the same height",
);
/** The ornament without the columns its mask keeps transparent, in native pixels. */
const cornerOpaqueWidth = (() => {
  const opaqueColumn = (x) => Array.from({ length: cornerCell.height }, (_, y) => y)
    .some((y) => cornerCell.pixels[((y * cornerCell.width) + x) * 4 + 3] !== 0);
  let width = cornerCell.width;
  while (width > 0 && !opaqueColumn(width - 1)) width -= 1;
  return width;
})();
assert.equal(
  body.x + body.width - 3 + cornerOpaqueWidth,
  rightBevel.startX + 4,
  "the right corner ornament no longer stops one column short of the bevel's outer edge",
);

await mkdir(publicAssetPath, { recursive: true });
for (const [name, image] of Object.entries(frameImages)) {
  await writeFile(path.join(publicAssetPath, name), encodeRgbaPng(image.width, image.height, image.pixels));
}

/**
 * `12E7:0240` sets its cursor from two `cs:` immediates and steps it itself:
 * `add cs:[02DF], 8` for an ASCII cell, `+0x10` for a Big5 pair, and on CR LF it
 * rewrites X and does `add cs:[02E1], 0x14`. `DS:F8BA/F8BC` is the very cursor
 * `0000:EA04` reads at entry, so this is the shared drawer on the SAY cursor.
 */
/** `2E C7 06 <var> <imm16>` and `2E 83 06 <var> <imm8>` over the text routine. */
function csImmediates(opcode, variable, size) {
  const found = [];
  for (let address = 0x13000; address < 0x13200; address += 1) {
    if (moduleImage[address] !== 0x2e || moduleImage[address + 1] !== opcode) continue;
    if (moduleImage[address + 2] !== 0x06) continue;
    if (moduleImage.readUInt16LE(address + 3) !== variable) continue;
    found.push(size === 2 ? moduleImage.readUInt16LE(address + 5) : moduleImage[address + 5]);
  }
  return found;
}
const cursorX = csImmediates(0xc7, 0x02df, 2);
const cursorY = csImmediates(0xc7, 0x02e1, 2);
const advances = csImmediates(0x83, 0x02df, 1);
const lineAdvances = csImmediates(0x83, 0x02e1, 1);
assert.equal(cursorX.length, 2, "the objective panel no longer sets X twice (origin and CR LF reset)");
assert.equal(cursorX[0], cursorX[1], "the CR LF branch no longer returns to the text origin");
assert.equal(cursorY.length, 1, "the objective panel Y origin is no longer a single immediate");
const textOrigin = { x: cursorX[0], y: cursorY[0] };
assert.deepEqual(
  textOrigin,
  { x: body.x + 16, y: body.y + 16 },
  "the objective panel text no longer starts 16px inside the body",
);
assert.deepEqual(advances, [8, 16], "the objective panel ASCII/Big5 advances changed");
assert.deepEqual(lineAdvances, [20], "the objective panel line advance changed");
const lineAdvance = lineAdvances[0];

/**
 * `DS:1273`: the `(stage, SAY record)` pairs `12E7:00A6` scans to pick which
 * record this stage's panel shows. Already closed as `REMAKE-051`; re-read here
 * so the emitted text cannot drift away from the table the stage generators
 * assert against.
 */
const recordTable = story.globalReachabilityAudit.tables.alternate;
assert.equal(recordTable.address, "DS:1273", "the objective record table moved");
// `12E7:00A6` walks the table four bytes at a time until the stage matches or
// the `FFFF` sentinel stops it, so the stage number is the pair's key and not
// its position: 39..41 and 44..48 have no panel at all.
const scanned = [];
for (let offset = 0x1273; dsWord(offset) !== 0xffff; offset += 4) {
  scanned.push({ key: dsWord(offset), dialogueRecord: dsWord(offset + 2) });
}
assert.deepEqual(
  scanned,
  recordTable.entries.map(({ key, dialogueRecord }) => ({ key, dialogueRecord })),
  "the DS:1273 objective record table no longer matches the extracted evidence",
);

const panelText = {};
for (const { key, dialogueRecord, enabled } of recordTable.entries) {
  if (!enabled) continue;
  const file = path.join("parsed", "dialogue", `${String(dialogueRecord).padStart(4, "0")}.json`);
  const record = JSON.parse((await loadInput(file)).toString("utf8"));
  // `12E7:0240` stops at `$` and treats CR LF as the line break, so a blank
  // record line is a real empty row rather than something to trim away.
  const lines = [];
  for (const action of record.actions) {
    if (action.op === "marker") break;
    if (action.op !== "text" && action.op !== "blank_line") continue;
    lines.push(action.text ?? "");
  }
  while (lines.length > 0 && lines.at(-1) === "") lines.pop();
  assert(lines.length > 0, `objective record ${dialogueRecord} has no text`);
  // The runtime joins these with the cursor's own line feed, so a record that
  // ever carried a printable `|` would silently gain a line break.
  assert(
    lines.every((line) => !line.includes("|")),
    `objective record ${dialogueRecord} contains a literal line-feed character`,
  );
  panelText[key] = lines;
}

const quote = (value) => JSON.stringify(value);
const frame = {
  topEdge: {
    image: topEdgeImage,
    y: topEdgeY,
    width: topEdgeCell.width,
    height: topEdgeCell.height,
  },
  bottomEdge: {
    image: bottomEdgeImage,
    y: bottomEdgeY,
    width: bottomEdgeCell.width,
    height: bottomEdgeCell.height,
  },
  edgeStartX: edgeSeeds[0],
  edgeCells,
  edgeStep,
  corner: {
    image: cornerImage,
    width: cornerCell.width,
    height: cornerCell.height,
    opaqueWidth: cornerOpaqueWidth,
    placements: corners,
  },
};
const identity = sha256(Buffer.from(JSON.stringify({ sources, frame, panelText })));

const module = `// Generated by scripts/generate-objective-panel.mjs from module-29 evidence.
// Do not hand-edit: regenerate with \`pnpm content:objective-panel\`.

export const OBJECTIVE_PANEL_IDENTITY = ${quote(`objective-panel/evidence-${identity}`)};
export const OBJECTIVE_PANEL_SOURCES = ${JSON.stringify(sources)} as const;

/**
 * \`12E7:00D1\` and \`12E7:0240\`, in native 640x350 pixels. The panel is drawn
 * shadow first, then the body over it, then the two edge bands, then one
 * single-pixel bevel column per entry walking outwards from each side, and last
 * the four corner ornaments — which is why the ornaments sit on top of both the
 * bands and the bevels.
 *
 * \`image\` is the index into the \`A/0006\` bank the routine points \`DS:F884\` at;
 * the pixels themselves ship as \`objective-panel-*.png\`.
 */
export const NATIVE_OBJECTIVE_PANEL = {
  body: ${JSON.stringify(body)},
  shadow: ${JSON.stringify(shadow)},
  leftBevel: ${JSON.stringify(leftBevel)},
  rightBevel: ${JSON.stringify(rightBevel)},
  topEdge: ${JSON.stringify(frame.topEdge)},
  bottomEdge: ${JSON.stringify(frame.bottomEdge)},
  edgeStartX: ${frame.edgeStartX},
  edgeCells: ${frame.edgeCells},
  edgeStep: ${frame.edgeStep},
  corner: ${JSON.stringify(frame.corner)},
  textOrigin: ${JSON.stringify(textOrigin)},
  lineAdvance: ${lineAdvance},
} as const;

/**
 * The SAY record \`DS:1273\` picks for each native stage, verbatim, one entry per
 * drawn line. Keyed by the native stage number, which is the two digits in the
 * remake's own \`stage-NN\` id.
 */
export const NATIVE_OBJECTIVE_PANEL_TEXT: Readonly<Record<number, readonly string[]>> = ${
  JSON.stringify(panelText, null, 2)
};
`;

const modulePath = path.join(root, "src", "game", "content", "objective-panel.generated.ts");
await writeFile(modulePath, module);

console.log(
  `wrote ${path.relative(root, modulePath)} `
  + `(${Object.keys(panelText).length} stages, body ${body.width}x${body.height} at ${body.x},${body.y}, `
  + `${Object.keys(frameImages).length} frame images)`,
);
