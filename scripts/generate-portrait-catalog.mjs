#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeRgbaPng, encodeRgbaPng } from "./lib/png-atlas.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storyPresentationPath = path.join(root, "reverse/parsed/native/story-presentations.json");
const storyRenderManifestPath = path.join(root, "reverse/renders/story-presentations/manifest.json");
const storyRenderRoot = path.dirname(storyRenderManifestPath);
const renderManifestPath = path.join(root, "reverse/renders/planar/D/manifest.json");
const renderRoot = path.join(root, "reverse/renders/planar/D");
const restoredPortraitRoot = path.join(root, "reverse/renders/story-presentations/frames/D");
const outputPath = path.join(root, "src/game/content/portrait-catalog.generated.ts");
const publicRoot = path.join(root, "public/assets/original/portraits");
const dialoguePublicRoot = path.join(root, "public/assets/original/dialogue");
const storyPublicRoot = path.join(root, "public/assets/original/story");
const module29Path = path.join(root, "reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin");

const [storySource, storyRenderManifestSource, renderManifestSource, module29Image] = await Promise.all([
  readFile(storyPresentationPath),
  readFile(storyRenderManifestPath),
  readFile(renderManifestPath),
  readFile(module29Path),
]);
const storyPresentations = JSON.parse(storySource.toString("utf8"));
const storyRenderManifest = JSON.parse(storyRenderManifestSource.toString("utf8"));
const renderManifest = JSON.parse(renderManifestSource.toString("utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const pad = (value) => String(value).padStart(4, "0");

// D/59's dormant native metadata places its 16×16 eye layer at (40,24),
// where frame 1 does not match the base portrait. The same layer reproduces
// the base pixels exactly at (56,24). REMAKE-010 keeps the source fact visible
// while applying the evidence-backed presentation correction.
const originCorrections = new Map([
  [59, {
    ruleId: "REMAKE-010",
    expectedNativeLayoutBytes: [40, 24, 64, 32],
    target: "eye",
    appliedOrigin: { x: 56, y: 24 },
  }],
]);

/*
 * 模組 29 的兩個眨眼繪製點畫眼部覆蓋片之前都先過同一組判定：右欄單位詳情
 * `0000:8578` 以近呼叫 `0000:85CB..85D3`，對白肖像 `1864:00B0` 以遠呼叫
 * `1864:00CB → 0000:85D8`。三段判定 `0000:85EC/860E/862B` 各比對一個關卡號
 * DS:`2E77` 與畫像號 DS:`5DED`，只要 DS:`2F83` 還不是現場勝利 999，就把 CX 改成
 * frame 7——D.SWF 裡恰好只有這幾筆記錄帶的紅眼覆蓋片。模組 25 的關前劇情眨眼
 * `0000:1562` 沒有這一步。規則直接從映像解碼，不在內容裡手抄關卡與畫像號。
 */
const module29Slice = (start, end) => module29Image.subarray(start, end);
const module29Signatures = [
  ["unit-detail eye draw 0000:8578..85D8", 0x8578, 0x85d8, "5655192eeb77809af9892d85d6ad30c000c8c10515393ab31530908bb724e794"],
  ["far check entry 0000:85D8..85EC", 0x85d8, 0x85ec, "671984731ca19ab348d341df84646cd00b370fb935ae71038a53be4211a2c961"],
  ["dialogue eye draw 1864:00B0..00D5", 0x186f0, 0x18715, "af212e62fe4753a8042f4b92c104130d2a9d506affa89eb215695f22e38114d5"],
  ["red-eye checks 0000:85EC..8648", 0x85ec, 0x8648, "22326813d07d1622702ae17eaeffd52f42e68bf755e37c1bf8bc94df633a6aec"],
];
for (const [label, start, end, expected] of module29Signatures) {
  assert.equal(sha256(module29Slice(start, end)), expected, `module 29 ${label} changed; re-audit the red-eye override`);
}

function decodeRedEyeChecks(bytes) {
  const expectBytes = (offset, expected, label) => {
    assert.deepEqual([...bytes.subarray(offset, offset + expected.length)], expected, `red-eye check ${label} at +${offset}`);
    return offset + expected.length;
  };
  const stages = [];
  let offset = 0;
  while (offset < bytes.length) {
    offset = expectBytes(offset, [0x83, 0x3e, 0x77, 0x2e], "cmp word [2E77h]");
    const nativeStage = bytes[offset];
    offset = expectBytes(offset + 1, [0x74, 0x01, 0xc3, 0xa1, 0xed, 0x5d], "stage gate / mov ax,[5DEDh]");
    const portraits = [];
    while (bytes[offset] === 0x3d) {
      portraits.push(bytes.readUInt16LE(offset + 1));
      offset = expectBytes(offset + 3, [0x74], "jz after cmp ax") + 1;
    }
    assert(portraits.length > 0, "red-eye check names no portrait");
    offset = expectBytes(offset, [0xc3, 0x81, 0x3e, 0x83, 0x2f], "ret / cmp word [2F83h]");
    const clearedProgress = bytes.readUInt16LE(offset);
    offset = expectBytes(offset + 2, [0x74, 0x03, 0xb9], "jz / mov cx");
    const frame = bytes.readUInt16LE(offset);
    offset = expectBytes(offset + 2, [0xc3], "ret");
    stages.push({ nativeStage, portraits, clearedProgress, frame });
  }
  const [{ clearedProgress, frame }] = stages;
  assert(stages.every((stage) => stage.clearedProgress === clearedProgress && stage.frame === frame));
  return {
    frame,
    clearedProgress,
    stages: stages.map(({ nativeStage, portraits }) => ({ nativeStage, portraits })),
  };
}
const module29RedEyeRule = decodeRedEyeChecks(module29Slice(0x85ec, 0x8648));
assert.equal(module29RedEyeRule.frame, 7);
assert.equal(module29RedEyeRule.clearedProgress, 999);
const redEyePortraits = new Set(module29RedEyeRule.stages.flatMap(({ portraits }) => portraits));

const metadataEntries = [...storyPresentations.portraitMetadata.entries]
  .sort((left, right) => left.searchOrder - right.searchOrder || left.tableIndex - right.tableIndex);
const metadataByRecord = new Map();
for (const entry of metadataEntries) {
  if (!metadataByRecord.has(entry.portraitId)) metadataByRecord.set(entry.portraitId, entry);
}

const renderByRecord = new Map(renderManifest.entries.map((entry) => [entry.record, entry]));
const records = Array.from({ length: 68 }, (_, record) => record);
const catalog = {};
const copyOperations = [];

const dialogueFrameContract = storyPresentations.dialoguePortraitFrame;
assert.equal(dialogueFrameContract.resource, "A/18");
assert.deepEqual(dialogueFrameContract.portraitSize, [112, 112]);
assert.deepEqual(dialogueFrameContract.top.drawOffset, [0, -15]);
assert.deepEqual(dialogueFrameContract.nameplate.drawOffset, [0, 108]);
assert.deepEqual(dialogueFrameContract.side.leftOrigin, [0, 0]);
assert.deepEqual(dialogueFrameContract.side.rightOrigin, [107, 0]);
assert.equal(dialogueFrameContract.side.repeatCount, 15);
assert.equal(dialogueFrameContract.side.verticalStep, 8);
assert.deepEqual(dialogueFrameContract.displayNameOrigin, [24, 111]);
// `src/styles.css` 的 `.dialogue-portrait-underlay` 與 `.dialogue-portrait::before`
// 直接複刻這兩層：`(x+8, y)` 起 112×144 的 50% 網點投影，以及 x-1／x+5／x+106／x+112
// 四道 1×147 黑邊。任一項漂移都必須先重新審計原生合成體再改樣式。
assert.deepEqual(dialogueFrameContract.shadow.drawOffset, [8, 0]);
assert.deepEqual(dialogueFrameContract.shadow.size, [112, 144]);
assert.equal(dialogueFrameContract.shadow.colourIndex, 0);
assert.equal(
  dialogueFrameContract.shadow.ditherRule,
  "colour 0 lands on every pixel whose screen x + y is even",
);
assert.deepEqual(dialogueFrameContract.outlineColumns.size, [1, 147]);
assert.equal(dialogueFrameContract.outlineColumns.colourIndex, 0);
assert.deepEqual(
  dialogueFrameContract.outlineColumns.drawOffsets,
  [[-1, -15], [5, -15], [106, -15], [112, -15]],
);
assert.deepEqual(dialogueFrameContract.compositedBoundsRelativeToPortrait, {
  left: -1, top: -15, rightExclusive: 120, bottomExclusive: 144,
});
// `.story-background` 直接用這兩個原生落點貼 `BK/<id>`，不是靠置中推算。
assert.deepEqual(storyPresentations.module25StoryMode.background.drawAt, [160, 80]);
assert.deepEqual(storyPresentations.module25StoryMode.background.dimensions, [320, 200]);
const dialogueFrameSources = {
  top: dialogueFrameContract.top,
  nameplate: dialogueFrameContract.nameplate,
  side: dialogueFrameContract.side,
};
const dialogueFrameOutputs = {
  top: "/assets/original/dialogue/portrait-top.png",
  nameplate: "/assets/original/dialogue/portrait-nameplate.png",
  side: "/assets/original/dialogue/portrait-side.png",
};
await mkdir(dialoguePublicRoot, { recursive: true });
for (const [role, source] of Object.entries(dialogueFrameSources)) {
  const manifestEntry = storyRenderManifest.groups.windowGraphics.find((entry) =>
    entry.group === "A" && entry.record === 18 && entry.imageIndex === source.imageIndex);
  assert(manifestEntry, `missing A/18 ${role} frame in story render manifest`);
  assert.equal(manifestEntry.sha256, source.sha256, `A/18 ${role} hash disagrees with machine contract`);
  assert.deepEqual([manifestEntry.width, manifestEntry.height], source.size);
  copyOperations.push(copyFile(
    path.join(storyRenderRoot, source.output),
    path.join(dialoguePublicRoot, path.basename(dialogueFrameOutputs[role])),
  ));
}
const dialogueTextWindowContract = storyPresentations.dialogueTextWindow;
assert.equal(dialogueTextWindowContract.resource, "A/18");
assert.deepEqual(dialogueTextWindowContract.composite.size, [400, 86]);
assert.deepEqual(dialogueTextWindowContract.textInset, [12, 12]);
assert.deepEqual(dialogueTextWindowContract.module25Anchors, { upper: [153, 2], lower: [97, 260] });
assert.deepEqual(dialogueTextWindowContract.module29Anchors, { upper: [153, 10], lower: [97, 250] });
assert.deepEqual(dialogueTextWindowContract.portraitFrameGaps, {
  module25: { upper: 30, lower: 15 },
  module29: { upper: 6, lower: 7 },
});
const dialogueTextWindowOutput = "/assets/original/dialogue/text-window.png";
assert.equal(
  storyRenderManifest.dialogueWindowComposite.sha256,
  dialogueTextWindowContract.composite.sha256,
  "A/18 text-window composite hash disagrees with machine contract",
);
copyOperations.push(copyFile(
  path.join(storyRenderRoot, dialogueTextWindowContract.composite.output),
  path.join(dialoguePublicRoot, path.basename(dialogueTextWindowOutput)),
));

/*
 * `0000:05F2` 在解釋任何 SAY 記錄之前就載入 A/20，所以每一段關卡間過場劇情都是同一張
 * 底紋：`0000:0B5B` 先在 y=0 貼一列 16 塊 40×41，再把 `(0,0)` 起的 640×40 條帶依序複製
 * 到 y=40..360。第一次複製就蓋掉了原圖第 41 列，玩家看到的重複單元因此是 40×40；這裡
 * 只裁掉那一列不可見的資料，像素本身照原樣輸出。
 */
const storyBackdropContract = storyPresentations.storyBackdrop;
assert.equal(storyBackdropContract.resource, "A/20");
assert.deepEqual(storyBackdropContract.tile.size, [40, 41]);
assert.deepEqual(storyBackdropContract.row.origin, [0, 0]);
assert.equal(storyBackdropContract.row.tiles, 16);
assert.equal(storyBackdropContract.row.horizontalStep, 40);
assert.deepEqual(storyBackdropContract.bandCopy.sourceOrigin, [0, 0]);
assert.deepEqual(storyBackdropContract.bandCopy.size, [640, 40]);
assert.deepEqual(storyBackdropContract.coverage, [640, 400]);
assert.deepEqual(storyBackdropContract.effectiveTile, [40, 40]);
const storyBackdropOutput = "/assets/original/story/backdrop.png";
{
  const [tileWidth, tileHeight] = storyBackdropContract.effectiveTile;
  const source = await readFile(path.join(storyRenderRoot, storyBackdropContract.tile.output));
  assert.equal(sha256(source), storyBackdropContract.tile.sha256, "A/20 render disagrees with machine contract");
  const tile = decodeRgbaPng(source, "A/20");
  assert.deepEqual([tile.width, tile.height], storyBackdropContract.tile.size);
  const row = (y) => tile.pixels.subarray(y * tile.width * 4, (y + 1) * tile.width * 4);
  // 被蓋掉的第 41 列必須和第 0 列相同，否則裁切就不是無損的，要重新審計原生條帶複製。
  assert(row(tileHeight).equals(row(0)), "A/20 row 40 no longer repeats row 0; re-audit the band copy");
  await mkdir(storyPublicRoot, { recursive: true });
  copyOperations.push(writeFile(
    path.join(storyPublicRoot, path.basename(storyBackdropOutput)),
    encodeRgbaPng(tileWidth, tileHeight, tile.pixels.subarray(0, tileWidth * tileHeight * 4)),
  ));
}

for (const record of records) {
  const directory = pad(record);
  const render = renderByRecord.get(record);
  const metadataSourceRecord = metadataByRecord.has(record) ? record : record === 67 ? 56 : undefined;
  const metadata = metadataSourceRecord === undefined ? undefined : metadataByRecord.get(metadataSourceRecord);
  const originCorrection = originCorrections.get(record);
  const outputDirectory = path.join(publicRoot, directory);
  const publicPrefix = `/assets/original/portraits/${directory}`;
  await mkdir(outputDirectory, { recursive: true });

  const baseSource = render?.rendered
    ? path.join(renderRoot, directory, "00.png")
    : path.join(restoredPortraitRoot, directory, "00.png");
  copyOperations.push(copyFile(baseSource, path.join(outputDirectory, "base.png")));

  let animation = null;
  if (metadata && render?.rendered) {
    if (originCorrection) {
      assert.deepEqual(
        metadata.nativeLayoutBytes,
        originCorrection.expectedNativeLayoutBytes,
        `D/${directory} native layout changed; re-audit ${originCorrection.ruleId}`,
      );
    }
    const imagesByIndex = new Map(render.images.map((image) => [image.index, image]));
    const required = [1, 2, 3, 4, 5, 6].map((index) => imagesByIndex.get(index));
    if (required.some((image) => !image)) {
      throw new Error(`D/${directory} has portrait metadata but is missing eye or mouth frames`);
    }
    const [eyeOpen, eyeHalf, eyeClosed, mouthClosed, mouthHalf, mouthOpen] = required;
    // Frame 7 exists exactly where a module-29 check can select it, and it is drawn at
    // the eye origin in place of the blink frame, so it must share the eye frame's size.
    const redEyes = imagesByIndex.get(module29RedEyeRule.frame);
    assert.equal(Boolean(redEyes), redEyePortraits.has(record), `D/${directory} red-eye frame disagrees with module 29`);
    if (redEyes) {
      assert.deepEqual([redEyes.width, redEyes.height], [eyeOpen.width, eyeOpen.height]);
      copyOperations.push(copyFile(
        path.join(renderRoot, directory, redEyes.output.split("/").at(-1)),
        path.join(outputDirectory, "eye-red.png"),
      ));
    }
    const frameOutputs = [
      [eyeOpen, "eye-open.png"],
      [eyeHalf, "eye-half.png"],
      [eyeClosed, "eye-closed.png"],
      [mouthClosed, "mouth-closed.png"],
      [mouthHalf, "mouth-half.png"],
      [mouthOpen, "mouth-open.png"],
    ];
    for (const [image, outputName] of frameOutputs) {
      copyOperations.push(copyFile(
        path.join(renderRoot, directory, image.output.split("/").at(-1)),
        path.join(outputDirectory, outputName),
      ));
    }
    animation = {
      metadataSourceRecord,
      eyeOrigin: originCorrection?.target === "eye"
        ? originCorrection.appliedOrigin
        : { x: metadata.nativeLayoutBytes[0], y: metadata.nativeLayoutBytes[1] },
      eyeSize: { width: eyeOpen.width, height: eyeOpen.height },
      eyes: ["eye-open.png", "eye-half.png", "eye-closed.png"].map((file) => `${publicPrefix}/${file}`),
      mouthOrigin: { x: metadata.nativeLayoutBytes[2], y: metadata.nativeLayoutBytes[3] },
      mouthSize: { width: mouthClosed.width, height: mouthClosed.height },
      mouths: ["mouth-closed.png", "mouth-half.png", "mouth-open.png"].map((file) => `${publicPrefix}/${file}`),
      ...(redEyes ? { redEyes: `${publicPrefix}/eye-red.png` } : {}),
      originCorrection: originCorrection
        ? {
          ruleId: originCorrection.ruleId,
          target: originCorrection.target,
          nativeOrigin: {
            x: metadata.nativeLayoutBytes[0],
            y: metadata.nativeLayoutBytes[1],
          },
          appliedOrigin: originCorrection.appliedOrigin,
        }
        : undefined,
    };
  }

  catalog[record] = {
    source: `${publicPrefix}/base.png`,
    displayName: metadata?.displayName ?? null,
    animation,
  };
}

assert.deepEqual(
  records.filter((record) => catalog[record].animation?.redEyes),
  [...redEyePortraits].sort((left, right) => left - right),
  "every module-29 red-eye portrait needs its frame 7",
);

await Promise.all(copyOperations);

const generatedSource = `// Generated by scripts/generate-portrait-catalog.mjs from native D/A renders and story metadata.\n`
  + `// Do not hand-edit: run pnpm content:portraits after the evidence pipeline changes.\n`
  + `export const PORTRAIT_CATALOG_SOURCES = ${JSON.stringify({
    storyPresentations: {
      path: "reverse/parsed/native/story-presentations.json",
      sha256: sha256(storySource),
    },
    renderManifest: {
      path: "reverse/renders/planar/D/manifest.json",
      sha256: sha256(renderManifestSource),
    },
    storyRenderManifest: {
      path: "reverse/renders/story-presentations/manifest.json",
      sha256: sha256(storyRenderManifestSource),
    },
    module29RedEyeChecks: {
      path: "reverse/unpacked/lzexe-modules/raw/0029-unpacked.bin",
      range: "0000:85EC..8648",
      sha256: module29Signatures.at(-1)[3],
    },
  })} as const;\n`
  + `export const DIALOGUE_PORTRAIT_FRAME_ASSETS = ${JSON.stringify(dialogueFrameOutputs)} as const;\n`
  + `export const DIALOGUE_TEXT_WINDOW_ASSET = ${JSON.stringify(dialogueTextWindowOutput)} as const;\n`
  + `export const STORY_BACKDROP_ASSET = ${JSON.stringify(storyBackdropOutput)} as const;\n`
  + `export const STORY_BACKDROP_TILE = ${JSON.stringify(storyBackdropContract.effectiveTile)} as const;\n`
  + `export const STORY_ILLUSTRATION_ORIGIN = ${JSON.stringify(storyPresentations.module25StoryMode.background.drawAt)} as const;\n`
  + `export const STORY_ILLUSTRATION_SIZE = ${JSON.stringify(storyPresentations.module25StoryMode.background.dimensions)} as const;\n`
  + `export const PORTRAIT_RECORDS = ${JSON.stringify(records)} as const;\n`
  + `export type PortraitRecord = typeof PORTRAIT_RECORDS[number];\n`
  + `export interface PortraitAnimationAssets {\n`
  + `  metadataSourceRecord: PortraitRecord;\n`
  + `  eyeOrigin: { x: number; y: number };\n`
  + `  eyeSize: { width: number; height: number };\n`
  + `  eyes: readonly [string, string, string];\n`
  + `  mouthOrigin: { x: number; y: number };\n`
  + `  mouthSize: { width: number; height: number };\n`
  + `  mouths: readonly [string, string, string];\n`
  + `  /** Native frame 7, drawn at the eye origin in place of the blink frame; see MODULE29_RED_EYE_RULE. */\n`
  + `  redEyes?: string;\n`
  + `  originCorrection?: {\n`
  + `    ruleId: "REMAKE-010";\n`
  + `    target: "eye";\n`
  + `    nativeOrigin: { x: number; y: number };\n`
  + `    appliedOrigin: { x: number; y: number };\n`
  + `  };\n`
  + `}\n`
  + `export interface PortraitCatalogEntry {\n`
  + `  source: string;\n`
  + `  displayName: string | null;\n`
  + `  animation: PortraitAnimationAssets | null;\n`
  + `}\n`
  + `export const PORTRAIT_CATALOG = ${JSON.stringify(catalog)} as const satisfies Readonly<Record<PortraitRecord, PortraitCatalogEntry>>;\n`
  + `/**\n`
  + ` * Module 29 \`0000:85EC/860E/862B\`: while DS:2F83 is not the live victory 999, the\n`
  + ` * unit-detail and battle-dialogue blinks draw \`frame\` for these (stage, portrait) pairs.\n`
  + ` */\n`
  + `export const MODULE29_RED_EYE_RULE = ${JSON.stringify(module29RedEyeRule)} as const;\n`
  + `export function isPortraitRecord(value: unknown): value is PortraitRecord {\n`
  + `  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < PORTRAIT_RECORDS.length;\n`
  + `}\n`
  + `export function portraitSourceFor(record: PortraitRecord): string {\n`
  + `  return PORTRAIT_CATALOG[record].source;\n`
  + `}\n`;

await writeFile(outputPath, generatedSource, "utf8");
console.log(`wrote ${path.relative(root, outputPath)} (${records.length} portraits, ${records.filter((record) => catalog[record].animation).length} animated)`);
console.log(`wrote ${copyOperations.length} portrait and dialogue-frame assets under public/assets/original`);
