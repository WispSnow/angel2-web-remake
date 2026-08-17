#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
await mkdir(path.join(publicRoot, "class-illustrations"), { recursive: true });
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
