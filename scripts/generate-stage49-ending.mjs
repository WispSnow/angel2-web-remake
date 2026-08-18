#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeRgbaPng } from "../reverse/tools/angel2-planar.mjs";
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
  // Module 35 fades in a dedicated 16-color DAC table per illustration pair, so
  // the epilogue plates come from the palette-correct postgame renders rather
  // than the gameplay-palette planar masters under renders/planar/UN.
  endingRenders: reversePath("renders/ending-presentations/manifest.json"),
  // 258 headerless 16x15 glyphs; UN/9 in the evidence JSON supplies their Big5
  // codes in the same order. Module 35 draws the epilogue with these, not with
  // any system font, so the remake ships them as a bitmap atlas.
  endingGlyphs: reversePath("extracted/UN/0010.bin"),
  storyMusic: reversePath("converted/audio/rix-wav/MAGIC/0077.wav"),
  rosterMusic: reversePath("converted/audio/rix-wav/UN/0006.wav"),
  prosperousMusic: reversePath("converted/audio/rix-wav/MUSIC/0040.wav"),
  declineMusic: reversePath("converted/audio/rix-wav/UN/0049.wav"),
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);

const buffers = Object.fromEntries(await Promise.all(
  Object.entries(inputPaths).map(async ([id, file]) => [id, await readFile(file)]),
));
const parse = (id) => JSON.parse(buffers[id].toString("utf8"));
const ending = parse("ending");
const events = parse("events");
const storyDocument = parse("story");
const storyPresentations = parse("storyPresentations");

assert.equal(ending.semanticVersion, 2);
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
assert.deepEqual(roster.visuals.classFullScreenGraphic, {
  resource: "M_00.SWF",
  record: "current ME_DATA class record",
  frame: 0,
  visiblePlacementAfterScroll: { horizontalCenter: 200, bottom: 186 },
  note: "module 33 loads startup resource index 5 directly; this is the current class's left-side direct full-combat frame, not a decorative C record",
});
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

// Bind every epilogue record to the module-35 render that used its own DAC
// table. Falling back to a gameplay-palette master would silently restore the
// miscolored plates, so a missing or mismatched entry must fail the build.
const endingRenders = parse("endingRenders");
const epiloguePlateByRecord = new Map();
for (const entry of endingRenders.records) {
  if (entry.module !== 35) continue;
  const variant = epilogue.illustrationVariantTable[entry.variantTableIndex];
  assert.ok(variant, `render manifest references unknown epilogue variant ${entry.variantTableIndex}`);
  assert.deepEqual(entry.palette.colors, variant.palette.colors,
    `epilogue variant ${entry.variantTableIndex} was rendered with the wrong palette`);
  for (const rendered of entry.rendered) {
    assert.equal(rendered.images.length, 1);
    assert.equal(rendered.images[0].maskUsed, false);
    epiloguePlateByRecord.set(rendered.record, rendered.images[0].output);
  }
}
const EPILOGUE_RECORDS = [0, 1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
assert.deepEqual([...epiloguePlateByRecord.keys()].sort((a, b) => a - b), EPILOGUE_RECORDS);

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
/* Native epilogue typesetting, from module 35 0000:069E-072E. The cursor starts
 * at (112,170); `|` returns X to 112 and adds 20 to Y; a half-width byte only
 * advances 8 pixels; a Big5 pair draws and advances 16. Every full-width glyph
 * is followed by an unconditional 24-native-tick wait at 0000:0725, which is why
 * the text types out instead of appearing at once. Centering is authored as
 * literal half-width spaces, so the raw bytes must survive into the runtime. */
const EPILOGUE_LAYOUT = {
  screenWidth: 640,
  screenHeight: 350,
  originX: 112,
  originY: 170,
  fullWidthAdvance: 16,
  halfWidthAdvance: 8,
  lineAdvance: 20,
  glyphNativeTicks: 24,
  /* 0000:1AD2-1B18 draws the row-smeared glyph at (X,Y) and (X+2,Y) in palette
   * index 0, then the crisp glyph at (X+1,Y+1) in index 15. The smear ORs the
   * glyph with itself one and two rows down, so relative to the ink the shadow
   * is the same glyph repeated at exactly these six offsets. */
  inkOffset: [1, 1],
  shadowOffsets: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

const GLYPH_WIDTH = 16;
const GLYPH_HEIGHT = 15;
const GLYPH_BYTES = 30;
const ATLAS_COLUMNS = 16;

const endingGlyphs = ending.glyphSets.epilogueAndCredits;
assert.equal(endingGlyphs.glyphCount, 258);
assert.equal(endingGlyphs.glyphWidth, GLYPH_WIDTH);
assert.equal(endingGlyphs.glyphHeight, GLYPH_HEIGHT);
assert.equal(buffers.endingGlyphs.length, endingGlyphs.glyphCount * GLYPH_BYTES);
const glyphIndexByCharacter = Object.fromEntries(
  endingGlyphs.glyphs.map(({ index, char }) => [char, index]),
);
assert.equal(
  Object.keys(glyphIndexByCharacter).length,
  endingGlyphs.glyphCount,
  "UN/9 repeats a character, so a character-keyed atlas index would be ambiguous",
);

const atlasRows = Math.ceil(endingGlyphs.glyphCount / ATLAS_COLUMNS);
const atlasWidth = ATLAS_COLUMNS * GLYPH_WIDTH;
const atlasHeight = atlasRows * GLYPH_HEIGHT;
const atlasPixels = Buffer.alloc(atlasWidth * atlasHeight * 4);
for (let glyph = 0; glyph < endingGlyphs.glyphCount; glyph += 1) {
  const cellX = (glyph % ATLAS_COLUMNS) * GLYPH_WIDTH;
  const cellY = Math.floor(glyph / ATLAS_COLUMNS) * GLYPH_HEIGHT;
  for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
    const bits = buffers.endingGlyphs.readUInt16BE(glyph * GLYPH_BYTES + row * 2);
    for (let column = 0; column < GLYPH_WIDTH; column += 1) {
      if ((bits & (0x8000 >>> column)) === 0) continue;
      const target = ((cellY + row) * atlasWidth + cellX + column) * 4;
      atlasPixels.fill(0xff, target, target + 4);
    }
  }
}

const cssColor = (rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;

/** Walks the native cursor so the runtime can reuse one pre-resolved layout
 * instead of re-deriving Big5 widths in the browser. */
function layoutNativeText(big5Hex) {
  const bytes = Buffer.from(big5Hex, "hex");
  const decoder = new TextDecoder("big5", { fatal: true });
  const glyphs = [];
  let x = EPILOGUE_LAYOUT.originX;
  let y = EPILOGUE_LAYOUT.originY;
  for (let index = 0; index < bytes.length;) {
    const byte = bytes[index];
    if (byte === 0x24) break;
    if (byte === 0x7c) {
      x = EPILOGUE_LAYOUT.originX;
      y += EPILOGUE_LAYOUT.lineAdvance;
      index += 1;
      continue;
    }
    if (byte <= 0x7f) {
      assert.equal(byte, 0x20, `epilogue text uses unexpected half-width byte ${byte}`);
      x += EPILOGUE_LAYOUT.halfWidthAdvance;
      index += 1;
      continue;
    }
    const character = decoder.decode(bytes.subarray(index, index + 2));
    const glyph = glyphIndexByCharacter[character];
    assert.notEqual(glyph, undefined, `epilogue character ${character} is missing from UN/9`);
    glyphs.push({ glyph, x, y });
    x += EPILOGUE_LAYOUT.fullWidthAdvance;
    index += 2;
  }
  return glyphs;
}

const epilogueSegments = epilogue.orderedSegments.map((segment) => ({
  id: segment.id,
  waitNativeTicks: segment.waitLimitNativeTicks,
  variants: segment.variants.map((variant) => {
    const glyphs = layoutNativeText(variant.text.big5Hex);
    const palette = variant.illustration.palette.colors;
    const ink = cssColor(palette[15]);
    assert.equal(ink, "#ffffff", "epilogue ink index 15 is no longer white in every palette");
    return {
      selector: variant.selector ?? 0,
      ...(variant.family ? { family: variant.family } : {}),
      ...(variant.condition ? { condition: variant.condition } : {}),
      text: variant.text.text,
      // Flat triples keep the generated table small: glyph index, x, y.
      glyphs: glyphs.flatMap(({ glyph, x, y }) => [glyph, x, y]),
      typingNativeTicks: glyphs.length * EPILOGUE_LAYOUT.glyphNativeTicks,
      inkColor: ink,
      shadowColor: cssColor(palette[0]),
      illustrationRecords: variant.illustration.records,
      ...(variant.music ? {
        music: `${variant.music.resource.replace(".SWF", "")}/${variant.music.record}`,
      } : {}),
    };
  }),
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
  + `/** Native module-35 typesetting; see scripts/generate-stage49-ending.mjs. */\n`
  + `export const STAGE49_EPILOGUE_LAYOUT = ${json(EPILOGUE_LAYOUT)} as const;\n`
  + `export const STAGE49_EPILOGUE_FONT = ${json({
    src: "/assets/original/ending/epilogue-font.png",
    glyphWidth: GLYPH_WIDTH,
    glyphHeight: GLYPH_HEIGHT,
    columns: ATLAS_COLUMNS,
    glyphCount: endingGlyphs.glyphCount,
  })} as const;\n`
  + `/** Started at module-35 entry, so it plays over all four segments. */\n`
  + `export const STAGE49_EPILOGUE_ENTRY_MUSIC = ${json(entryMusic)} as const;\n`
  + `export const STAGE49_ENDING_ROUTE = ${json({ nextModule: 27, nextStage: 38 })} as const;\n`;

await writeFile(outputPath, generated, "utf8");
await mkdir(path.join(publicRoot, "decorations"), { recursive: true });
await mkdir(path.join(publicRoot, "class-illustrations"), { recursive: true });
await mkdir(path.join(publicRoot, "epilogue"), { recursive: true });
await mkdir(path.join(publicRoot, "audio"), { recursive: true });
const copies = [
  writeFile(
    path.join(publicRoot, "epilogue-font.png"),
    encodeRgbaPng(atlasWidth, atlasHeight, atlasPixels),
  ),
  copyFile(reversePath("renders/planar/A/0009/00.png"), path.join(publicRoot, "roster-background.png")),
];
for (let record = 0; record <= 30; record += 1) {
  copies.push(copyFile(
    reversePath("renders/planar/C", String(record).padStart(4, "0"), "00.png"),
    path.join(publicRoot, "decorations", `${String(record).padStart(2, "0")}.png`),
  ));
}
for (let record = 0; record <= 34; record += 1) {
  copies.push(copyFile(
    reversePath("renders/planar/M_00", String(record).padStart(4, "0"), "00.png"),
    path.join(publicRoot, "class-illustrations", `${String(record).padStart(2, "0")}.png`),
  ));
}
for (const record of EPILOGUE_RECORDS) {
  copies.push(copyFile(
    reversePath("renders/ending-presentations", epiloguePlateByRecord.get(record)),
    path.join(publicRoot, "epilogue", `${String(record).padStart(2, "0")}.png`),
  ));
}
await Promise.all(copies);

console.log(`wrote ${path.relative(root, outputPath)} (${storyPages.length} story checkpoints, ${rosterActors.length} roster cards)`);
console.log(`wrote stage 49 ending assets with identity ${identity}`);
