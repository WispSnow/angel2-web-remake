#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import { compileNativeStory } from "./lib/compile-native-story.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/stage49-ending.generated.ts");
const publicRoot = path.join(root, "public/assets/original/ending");
const inputPaths = {
  ending: reversePath("parsed/native/ending-presentations.json"),
  events: reversePath("parsed/native/stage-events.json"),
  story: reversePath("parsed/dialogue/0070.json"),
  storyPresentations: reversePath("parsed/native/story-presentations.json"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0077.wav"),
  rosterMusic: reversePath("converted/audio/rix-wav/UN/0006.wav"),
  prosperousMusic: reversePath("converted/audio/rix-wav/MUSIC/0040.wav"),
  declineMusic: reversePath("converted/audio/rix-wav/UN/0049.wav"),
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);
const PNG_SIGNATURE_BYTES = 8;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  let crc = 0xffff_ffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE((crc ^ 0xffff_ffff) >>> 0, 8 + data.length);
  return chunk;
}

const paeth = (left, up, upperLeft) => {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= upDistance && leftDistance <= upperLeftDistance
    ? left
    : upDistance <= upperLeftDistance ? up : upperLeft;
};

/** UN ending plates are full-screen opaque pictures; the shared planar renderer
 * marks palette index 0 transparent for sprite consumers. Decode its RGBA PNG,
 * restore an opaque alpha channel, then emit deterministic filter-0 scanlines. */
async function writeOpaqueRgbaPng(source, target) {
  const png = await readFile(source);
  assert.ok(
    png.subarray(0, PNG_SIGNATURE_BYTES).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    `${source} is not a PNG`,
  );
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8, `${source} must use 8-bit channels`);
  assert.equal(png[25], 6, `${source} must be an RGBA PNG`);
  assert.equal(png[28], 0, `${source} must be non-interlaced`);
  const sourceChunks = [];
  const idatParts = [];
  let offset = PNG_SIGNATURE_BYTES;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    assert.ok(end <= png.length, `${source} contains a truncated PNG chunk`);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") idatParts.push(png.subarray(offset + 8, offset + 8 + length));
    else sourceChunks.push({ type, bytes: png.subarray(offset, end) });
    offset = end;
  }
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(idatParts));
  assert.equal(filtered.length, (rowBytes + 1) * height);
  const pixels = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[y * (rowBytes + 1)];
    const sourceRow = y * (rowBytes + 1) + 1;
    const targetRow = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = filtered[sourceRow + x];
      const left = x >= bytesPerPixel ? pixels[targetRow + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[targetRow + x - rowBytes] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[targetRow + x - rowBytes - bytesPerPixel]
        : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft) : undefined;
      assert.notEqual(predictor, undefined, `${source} contains unknown PNG filter ${filter}`);
      pixels[targetRow + x] = (encoded + predictor) & 0xff;
    }
    for (let x = 3; x < rowBytes; x += bytesPerPixel) pixels[targetRow + x] = 0xff;
  }
  const opaqueScanlines = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const targetRow = y * (rowBytes + 1);
    opaqueScanlines[targetRow] = 0;
    pixels.copy(opaqueScanlines, targetRow + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const chunks = [png.subarray(0, PNG_SIGNATURE_BYTES)];
  for (const chunk of sourceChunks) {
    if (chunk.type === "IEND") chunks.push(pngChunk("IDAT", deflateSync(opaqueScanlines)));
    chunks.push(chunk.bytes);
  }
  await writeFile(target, Buffer.concat(chunks));
}
const buffers = Object.fromEntries(await Promise.all(
  Object.entries(inputPaths).map(async ([id, file]) => [id, await readFile(file)]),
));
const parse = (id) => JSON.parse(buffers[id].toString("utf8"));
const ending = parse("ending");
const events = parse("events");
const storyDocument = parse("story");
const storyPresentations = parse("storyPresentations");

assert.equal(ending.semanticVersion, 1);
assert.deepEqual(ending.postgameOrder.slice(0, 4), [
  "module33 22-card roster/status roll",
  "module35 four-segment conditional epilogue",
  "module27 stage38 deployment",
  "module29 stage38 postgame rematch",
]);
const stage49Story = events.module25CampaignStory.stageStoryRecords
  .find(({ stage }) => stage === 49);
assert.deepEqual(stage49Story, {
  stage: 49,
  record: 70,
  resources: ["SAY.SWF", "NUM.SWF", "CHA.SWF"],
  behavior: "load the same record from resource indices 7, 9, and 10, then run the story renderer",
});
assert.equal(events.module25CampaignStory.exitRouting.stage49.nextModule, 33);

const portraitNames = Object.fromEntries(storyPresentations.portraitMetadata.entries
  .filter(({ portraitId }) => [10, 14, 34, 35, 45, 46].includes(portraitId))
  .map(({ portraitId, displayName }) => [portraitId, displayName.replaceAll(" ", "")]));
assert.deepEqual(portraitNames, {
  10: "蘇蘭達",
  14: "琴斯",
  34: "芳",
  35: "蘭",
  45: "希蜜",
  46: "妮雅",
});
const storyPages = compileNativeStory(storyDocument, 70, portraitNames, { includeBackground: true });
assert.equal(storyPages.length, 17);

const roster = ending.module33RosterRoll;
assert.equal(roster.rosterActors.firstSentinelIndex, 22);
assert.equal(roster.rosterActors.reachableCardCount, 22);
assert.equal(roster.advance.autoAfter.maximumNativeTicks, 400);
const rosterActors = roster.rosterActors.reachableActors.map(({ index, portraitRecord, normalizedName }) => ({
  slot: index,
  portraitRecord,
  name: normalizedName,
  // Presentation-only replacement for the native PIT draw. It is stable for
  // screenshots and never consumes the simulation PRNG.
  decorationRecord: ((index * 7 + 5) % 31) === 28 ? 29 : ((index * 7 + 5) % 31),
}));

const epilogue = ending.module35ConditionalEpilogue;
assert.equal(epilogue.orderedSegments.length, 4);
assert.deepEqual(epilogue.exit, {
  nextModule: 27,
  nextStage: 38,
  purpose: "deploy the postgame otherworld rematch",
});
// Native module 35 picks the closing track from the record-total selector but
// starts it at module entry, so it plays over all four segments rather than
// changing when segment 4 appears.
assert.equal(epilogue.entryMusic.playsOverSegments, "all four");
const entryMusic = epilogue.entryMusic.variants.map((variant) => ({
  selector: variant.selector,
  condition: variant.condition,
  music: `${variant.resource.replace(".SWF", "")}/${variant.record}`,
}));
assert.deepEqual(entryMusic.map(({ music }) => music), ["MUSIC/40", "UN/49"]);

const families = Object.fromEntries(epilogue.classFamilyDecision.families.map((family) => [
  family.id,
  family.uniqueRecords,
]));
assert.deepEqual(families, {
  cavalry: [13, 14, 15, 16, 17, 18, 19, 22, 23],
  fighter: [1, 2, 7, 9, 27, 28, 29, 33],
  mage: [3, 4, 5, 6, 10, 11, 24, 25, 30, 31, 32],
});
const epilogueSegments = epilogue.orderedSegments.map((segment) => ({
  id: segment.id,
  waitNativeTicks: segment.waitLimitNativeTicks,
  variants: segment.variants.map((variant) => ({
    selector: variant.selector ?? 0,
    ...(variant.family ? { family: variant.family } : {}),
    ...(variant.condition ? { condition: variant.condition } : {}),
    text: variant.text.text,
    illustrationRecords: variant.illustration.records,
    ...(variant.music ? {
      music: `${variant.music.resource.replace(".SWF", "")}/${variant.music.record}`,
    } : {}),
  })),
}));

const generatedSources = Object.entries(inputPaths).map(([id, file]) => ({
  id,
  path: path.relative(root, file),
  sha256: sha256(buffers[id]),
  bytes: buffers[id].length,
}));
const identityHash = createHash("sha256");
identityHash.update("stableRemake\0REMAKE-086\0");
for (const source of generatedSources) identityHash.update(`${source.path}\0${source.sha256}\n`);
const identity = `stage-49-ending/evidence-${identityHash.digest("hex")}`;
const generated = `// Generated by scripts/generate-stage49-ending.mjs from native postgame evidence.\n`
  + `// Do not hand-edit: regenerate after the evidence pipeline changes.\n`
  + `import type { DialoguePage } from "../types";\n\n`
  + `export const STAGE49_ENDING_IDENTITY = ${json(identity)};\n`
  + `export const STAGE49_ENDING_SOURCES = ${json(generatedSources)} as const;\n`
  + `export const STAGE49_STORY_PAGES = ${json(storyPages)} as const satisfies readonly DialoguePage[];\n`
  + `export const STAGE49_ROSTER_ACTORS = ${json(rosterActors)} as const;\n`
  + `export const STAGE49_ROSTER_WAIT_NATIVE_TICKS = 400 as const;\n`
  + `export const STAGE49_CLASS_FAMILIES = ${json(families)} as const;\n`
  + `export const STAGE49_EPILOGUE_SEGMENTS = ${json(epilogueSegments)} as const;\n`
  + `/** Started at module-35 entry, so it plays over all four segments. */\n`
  + `export const STAGE49_EPILOGUE_ENTRY_MUSIC = ${json(entryMusic)} as const;\n`
  + `export const STAGE49_ENDING_ROUTE = ${json({ nextModule: 27, nextStage: 38 })} as const;\n`;

await writeFile(outputPath, generated, "utf8");
await mkdir(path.join(publicRoot, "decorations"), { recursive: true });
await mkdir(path.join(publicRoot, "epilogue"), { recursive: true });
await mkdir(path.join(publicRoot, "audio"), { recursive: true });
const copies = [
  copyFile(reversePath("renders/planar/A/0009/00.png"), path.join(publicRoot, "roster-background.png")),
  copyFile(inputPaths.storyMusic, path.join(publicRoot, "audio/story.wav")),
  copyFile(inputPaths.rosterMusic, path.join(publicRoot, "audio/roster.wav")),
  copyFile(inputPaths.prosperousMusic, path.join(publicRoot, "audio/prosperous.wav")),
  copyFile(inputPaths.declineMusic, path.join(publicRoot, "audio/decline.wav")),
];
for (let record = 0; record <= 30; record += 1) {
  copies.push(copyFile(
    reversePath("renders/planar/C", String(record).padStart(4, "0"), "00.png"),
    path.join(publicRoot, "decorations", `${String(record).padStart(2, "0")}.png`),
  ));
}
for (const record of [0, 1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
  copies.push(writeOpaqueRgbaPng(
    reversePath("renders/planar/UN", String(record).padStart(4, "0"), "00.png"),
    path.join(publicRoot, "epilogue", `${String(record).padStart(2, "0")}.png`),
  ));
}
await Promise.all(copies);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages.length} story checkpoints, ${rosterActors.length} roster cards)`);
console.log(`wrote stage 49 ending assets with identity ${identity}`);
