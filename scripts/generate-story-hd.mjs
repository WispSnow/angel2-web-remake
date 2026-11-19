#!/usr/bin/env node

// REMAKE-196 optional HD story illustrations. The asset pack's
// story/hd/hd-manifest.json is the source of truth; this script turns it into
// src/game/content/story-hd.generated.ts after checking every file:
//
// - every record is a `BK/<id>` illustration whose original 320x200 PNG ships
//   under public/assets/original and is named by a stage's story assets, no id or
//   original appears twice, and the original still hashes the same, so a later
//   change to the original evidence forces the HD record to be reviewed;
// - every loop is an MP4 matching its hash, with exactly one video track, no
//   audio, the moov box before mdat (faststart) and the full-screen frame size
//   below (twice as tall for a `stacked` loop: premultiplied colour on top,
//   1 - alpha below); every poster is a WebP of the frame size matching its hash;
// - a record without a loop is a still (its poster); a record with a sky strip
//   (a horizontally tileable WebP the game scrolls behind the scene, user review
//   2026-11-18) has a stacked loop and only then; records may share one strip
//   (BK/31 uses BK/5's, BK/12 BK/10's) so a mid-story switch keeps the clouds;
// - no stray file ships under story/hd/.
//
// Version 3 adds the HD title screen (REMAKE-197, user request 2026-11-18) under
// `title`: the rebuilt frame and the logo letters as original-pixel PNGs, a land
// plate and a sky strip per variant, and one stacked loop of the two women. Its
// originals (BK/51 and both variants' upper art and logo band) are pinned by hash
// like the illustrations', and the variants must be the ones the startup screen
// alternates.
//
// `--import <workbench export>` first copies the files from the git-ignored
// workbench (tmp/cutscene-hd/export, made by its tools/export.py) into the asset
// pack and rewrites the manifest. The workbench never ships.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(root, "public/assets/original");
const hdRoot = path.join(assetRoot, "story/hd");
const manifestPath = path.join(hdRoot, "hd-manifest.json");
const contentRoot = path.join(root, "src/game/content");
const generatedModule = path.join(contentRoot, "story-hd.generated.ts");
const FORMAT = "ANGEL2 HD story illustrations";
const VERSION = 3;
const TITLE_SCALE = 3;
const TITLE_ROOT = "/assets/original/startup/title/";
/** 2.2x the 640x350 logical screen (2.194x vertically); `object-fit: cover` trims under one logical pixel. */
const WIDTH = 1408;
const HEIGHT = 768;
const ORIGINAL_WIDTH = 320;
const ORIGINAL_HEIGHT = 200;

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const pad = (background) => `bk${String(background).padStart(2, "0")}`;
const fail = (message) => {
  throw new Error(`story HD catalog: ${message}`);
};

/** ISO BMFF boxes directly inside `buffer[start, end)`. */
function* boxes(buffer, start = 0, end = buffer.length) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) fail(`malformed MP4 box ${type} at ${offset}`);
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

const child = (buffer, parent, type) => [...boxes(buffer, parent.start, parent.end)].find((box) => box.type === type);

function mp4Tracks(buffer) {
  const top = [...boxes(buffer)];
  if (top[0]?.type !== "ftyp") fail("MP4 does not start with ftyp");
  const moov = top.find((box) => box.type === "moov");
  if (!moov) fail("MP4 has no moov box");
  if (top.findIndex((box) => box.type === "moov") > top.findIndex((box) => box.type === "mdat")) {
    fail("MP4 moov box is not before mdat (encode with -movflags +faststart)");
  }
  return [...boxes(buffer, moov.start, moov.end)].filter((box) => box.type === "trak").map((trak) => {
    const tkhd = child(buffer, trak, "tkhd");
    const hdlr = child(buffer, child(buffer, trak, "mdia") ?? fail("trak without mdia"), "hdlr");
    if (!tkhd || !hdlr) fail("trak without tkhd or hdlr");
    return {
      handler: buffer.toString("latin1", hdlr.start + 8, hdlr.start + 12),
      width: buffer.readUInt32BE(tkhd.end - 8) / 65536,
      height: buffer.readUInt32BE(tkhd.end - 4) / 65536,
    };
  });
}

function webpSize(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") fail("poster is not WebP");
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  return fail(`unknown WebP chunk ${chunk}`);
}

function pngSize(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString("ascii", 12, 16) !== "IHDR") fail("original is not a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Every original illustration URL a stage's story assets name (`storyBackground` / `storyBackgrounds`). */
async function storyBackgroundUrls() {
  const urls = new Set();
  for (const name of await readdir(contentRoot)) {
    if (!/^stage\d+\.ts$/u.test(name)) continue;
    const source = await readFile(path.join(contentRoot, name), "utf8");
    for (const match of source.matchAll(/"(\/assets\/original\/story-[^"]+\.png)"/gu)) urls.add(match[1]);
  }
  return urls;
}

async function originalSha256(original) {
  const file = path.join(assetRoot, original.replace(/^\/assets\/original\//u, ""));
  if (!existsSync(file)) fail(`${original} does not exist`);
  const buffer = await readFile(file);
  const size = pngSize(buffer);
  if (size.width !== ORIGINAL_WIDTH || size.height !== ORIGINAL_HEIGHT) fail(`${original} is not a 320x200 BK illustration`);
  return sha256(buffer);
}

async function startupOriginal(url) {
  if (!url.startsWith(TITLE_ROOT)) fail(`${url} is not a startup title original`);
  const file = path.join(assetRoot, url.replace(/^\/assets\/original\//u, ""));
  if (!existsSync(file)) fail(`${url} does not exist`);
  const buffer = await readFile(file);
  return { sha256: sha256(buffer), ...pngSize(buffer) };
}

async function checkFile(file, kind) {
  const buffer = await readFile(path.join(assetRoot, file.output));
  if (sha256(buffer) !== file.sha256 || buffer.length !== file.bytes) fail(`${file.output} does not match the manifest`);
  if (kind === "video") {
    const tracks = mp4Tracks(buffer);
    const height = file.alpha === "stacked" ? 2 * HEIGHT : HEIGHT;
    if (tracks.length !== 1 || tracks[0].handler !== "vide") fail(`${file.output} must hold exactly one video track and no audio`);
    if (tracks[0].width !== WIDTH || tracks[0].height !== height || file.width !== WIDTH || file.height !== height) {
      fail(`${file.output} is ${tracks[0].width}x${tracks[0].height}, expected ${WIDTH}x${height}`);
    }
    if (!(file.frames > 24 && file.fps === 24)) fail(`${file.output} frame count or rate out of range`);
  } else if (kind === "sky") {
    const size = webpSize(buffer);
    if (size.width !== file.width || size.height !== file.height) fail(`${file.output} is ${size.width}x${size.height}`);
    if (file.width < WIDTH / 2 || file.width > 2 * WIDTH || file.height < 64 || file.height > HEIGHT) fail(`${file.output} size out of range`);
    if (!(Number.isFinite(file.speed) && file.speed !== 0 && Math.abs(file.speed) <= 60)) fail(`${file.output} speed out of range`);
  } else if (kind === "title-video") {
    const tracks = mp4Tracks(buffer);
    if (tracks.length !== 1 || tracks[0].handler !== "vide") fail(`${file.output} must hold exactly one video track and no audio`);
    if (tracks[0].width !== file.width || tracks[0].height !== file.height || file.height % 4 !== 0) {
      fail(`${file.output} is ${tracks[0].width}x${tracks[0].height}, the manifest says ${file.width}x${file.height}`);
    }
    if (file.alpha !== "stacked" || !(file.frames > 24 && file.fps === 24)) fail(`${file.output} must be a stacked 24 fps loop`);
  } else if (kind === "png") {
    const size = pngSize(buffer);
    if (size.width !== file.width || size.height !== file.height) fail(`${file.output} is ${size.width}x${size.height}`);
  } else if (kind === "webp") {
    const size = webpSize(buffer);
    if (size.width !== file.width || size.height !== file.height) fail(`${file.output} is ${size.width}x${size.height}`);
  } else {
    const size = webpSize(buffer);
    if (size.width !== WIDTH || size.height !== HEIGHT) fail(`${file.output} is ${size.width}x${size.height}`);
  }
}

/** The HD title (REMAKE-197): every layer inside the upper art at TITLE_SCALE, originals pinned. */
async function validateTitle(title, expectedFiles) {
  if (title.scale !== TITLE_SCALE) fail("title scale must be 3");
  const background = await startupOriginal(`${TITLE_ROOT}background.png`);
  if (title.backgroundSha256 !== background.sha256) fail("the title background changed; review the HD title before shipping it");
  const startup = await readFile(path.join(contentRoot, "startup.generated.ts"), "utf8");
  const ship = async (file, kind) => {
    await checkFile(file, kind);
    expectedFiles.add(path.relative("story/hd", file.output));
  };
  const upperSize = (await startupOriginal(`${TITLE_ROOT}upper-0.png`));
  const artWidth = upperSize.width * TITLE_SCALE;
  const artHeight = upperSize.height * TITLE_SCALE;
  const inside = (box, label) => {
    if (![box.x, box.y, box.width, box.height].every(Number.isInteger) || box.x < 0 || box.y < 0
      || box.x + box.width > artWidth || box.y + box.height > artHeight + TITLE_SCALE) {
      fail(`title ${label} does not fit the ${artWidth}x${artHeight} art`);
    }
  };
  if (title.frame.width !== upperSize.width || title.frame.height !== upperSize.height) fail("title frame must have the upper art's size");
  await ship(title.frame, "png");
  inside(title.interior, "interior");
  inside({ ...title.women, height: title.women.height / 2 }, "women");
  await ship(title.women, "title-video");
  if (!Array.isArray(title.variants) || title.variants.length !== 2) fail("the title has two variants");
  for (const [index, variant] of title.variants.entries()) {
    for (const key of ["upper", "lower"]) {
      if (variant[key] !== `${TITLE_ROOT}${key}-${index}.png` || !startup.includes(JSON.stringify(variant[key]))) {
        fail(`title variant ${index} ${key} is not the startup screen's ${key}-${index}.png`);
      }
      const original = await startupOriginal(variant[key]);
      if (variant[`${key}Sha256`] !== original.sha256) fail(`title variant ${index}: ${key} changed; review the HD title before shipping it`);
      if (key === "lower" && (variant.logo.width !== original.width || variant.logo.height !== original.height)) {
        fail(`title variant ${index}: the logo must have the lower band's size`);
      }
    }
    await ship(variant.logo, "png");
    inside(variant.land, `variant ${index} land`);
    await ship(variant.land, "webp");
    await ship(variant.sky, "sky");
    if (!Number.isInteger(variant.sky.y) || variant.sky.y < 0 || variant.sky.y + variant.sky.height > artHeight) fail(`title variant ${index} sky out of range`);
  }
}

async function importWorkbench(workbench) {
  const exported = JSON.parse(await readFile(path.join(workbench, "manifest.json"), "utf8"));
  if (exported.format !== "angel2-story-hd-export" || exported.version !== 3) fail("unexpected workbench export format");
  await rm(hdRoot, { recursive: true, force: true });
  const copied = new Set();
  // the export folder mirrors story/hd/; a strip two records share is copied once
  const ship = async (file, extra = {}) => {
    const output = `story/hd/${file.file}`;
    if (!copied.has(output)) {
      await mkdir(path.dirname(path.join(assetRoot, output)), { recursive: true });
      await copyFile(path.join(workbench, file.file), path.join(assetRoot, output));
      copied.add(output);
    }
    return { output, width: file.width, height: file.height, bytes: file.bytes, sha256: file.sha256, ...extra };
  };
  const records = [];
  for (const entry of exported.records) {
    const original = `/assets/original/${entry.original}`;
    const record = { background: entry.background, original, originalSha256: await originalSha256(original), poster: await ship(entry.poster) };
    if (entry.video) {
      record.video = await ship(entry.video, { frames: entry.video.frames, fps: entry.video.fps, ...(entry.video.alpha ? { alpha: entry.video.alpha } : {}) });
    }
    if (entry.sky) record.sky = await ship(entry.sky, { speed: entry.sky.speed });
    records.push(record);
  }
  let title;
  if (exported.title) {
    const t = exported.title;
    title = {
      scale: t.scale,
      backgroundSha256: (await startupOriginal(`${TITLE_ROOT}background.png`)).sha256,
      frame: await ship(t.frame),
      interior: t.interior,
      women: await ship(t.women, { frames: t.women.frames, fps: t.women.fps, alpha: t.women.alpha, x: t.women.x, y: t.women.y }),
      variants: [],
    };
    for (const [index, v] of t.variants.entries()) {
      const upper = `${TITLE_ROOT}upper-${index}.png`;
      const lower = `${TITLE_ROOT}lower-${index}.png`;
      title.variants.push({
        upper,
        upperSha256: (await startupOriginal(upper)).sha256,
        lower,
        lowerSha256: (await startupOriginal(lower)).sha256,
        logo: await ship(v.logo),
        land: await ship(v.land, { x: v.land.x, y: v.land.y }),
        sky: await ship(v.sky, { speed: v.sky.speed, y: v.sky.y }),
      });
    }
  }
  const manifest = {
    format: FORMAT,
    version: VERSION,
    decision: "REMAKE-196",
    width: WIDTH,
    height: HEIGHT,
    video: "H.264 yuv420p, 24 fps, faststart, muted seamless loop; stacked: premultiplied colour over 1 - alpha, twice as tall",
    poster: "WebP, frame 0 (with the sky strip at offset 0)",
    sky: "WebP strip, tiles horizontally with period = its width, drawn from the top, scrolled at `speed` frame px/s",
    records,
    ...(title ? {
      title: {
        note: "REMAKE-197 title screen: coordinates in HD pixels of the 472x349 upper art at `scale`; frame and logos are original pixels",
        ...title,
      },
    } : {}),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function validate(manifest) {
  if (manifest.format !== FORMAT || manifest.version !== VERSION || manifest.width !== WIDTH || manifest.height !== HEIGHT) {
    fail("unexpected manifest format");
  }
  const used = await storyBackgroundUrls();
  const seenIds = new Set();
  const seenOriginals = new Set();
  const expectedFiles = new Set(["hd-manifest.json"]);
  for (const entry of manifest.records) {
    const label = `BK/${entry.background}`;
    if (!Number.isInteger(entry.background) || entry.background < 0 || entry.background > 59) fail(`${label} is not a BK record`);
    if (seenIds.has(entry.background)) fail(`${label} appears twice`);
    if (seenOriginals.has(entry.original)) fail(`${entry.original} appears twice`);
    seenIds.add(entry.background);
    seenOriginals.add(entry.original);
    if (!used.has(entry.original)) fail(`${label}: ${entry.original} is not a story illustration of any stage`);
    if (entry.originalSha256 !== await originalSha256(entry.original)) {
      fail(`${label} was made from a different original; review the HD record before shipping it`);
    }
    await checkFile(entry.poster, "poster");
    expectedFiles.add(path.relative("story/hd", entry.poster.output));
    if (entry.video) {
      await checkFile(entry.video, "video");
      expectedFiles.add(path.relative("story/hd", entry.video.output));
    }
    if (entry.sky) {
      await checkFile(entry.sky, "sky");
      expectedFiles.add(path.relative("story/hd", entry.sky.output));
    }
    if (Boolean(entry.sky) !== (entry.video?.alpha === "stacked")) fail(`${label}: a sky strip needs a stacked loop and vice versa`);
    if (entry.video?.alpha !== undefined && entry.video.alpha !== "stacked") fail(`${label}: unknown alpha layout`);
  }
  const shipped = [];
  for (const entry of await readdir(hdRoot, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) shipped.push(path.relative(hdRoot, path.join(entry.parentPath, entry.name)));
  }
  if (manifest.title) await validateTitle(manifest.title, expectedFiles);
  const stray = shipped.filter((file) => !expectedFiles.has(file));
  if (stray.length > 0) fail(`stray files under story/hd/: ${stray.join(", ")}`);
}

const importIndex = process.argv.indexOf("--import");
const manifest = importIndex >= 0
  ? await importWorkbench(path.resolve(process.argv[importIndex + 1] ?? ""))
  : existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, "utf8"))
    : { format: FORMAT, version: VERSION, width: WIDTH, height: HEIGHT, records: [] };
if (existsSync(hdRoot)) await validate(manifest);

const url = (output) => JSON.stringify(`/assets/original/${output}`);

function titleModule(title) {
  if (!title) return ["export const STORY_HD_TITLE: StoryHdTitle | undefined = undefined;", ""];
  const { interior, women } = title;
  return [
    "export const STORY_HD_TITLE: StoryHdTitle | undefined = {",
    `  scale: ${title.scale},`,
    `  frame: ${url(title.frame.output)},`,
    `  interior: { x: ${interior.x}, y: ${interior.y}, width: ${interior.width}, height: ${interior.height} },`,
    `  women: { source: ${url(women.output)}, width: ${women.width}, height: ${women.height}, frames: ${women.frames}, fps: ${women.fps}, alpha: "stacked", x: ${women.x}, y: ${women.y} },`,
    "  variants: [",
    ...title.variants.map((v) => [
      "    {",
      `      upper: ${JSON.stringify(v.upper)},`,
      `      lower: ${JSON.stringify(v.lower)},`,
      `      logo: ${url(v.logo.output)},`,
      `      land: { source: ${url(v.land.output)}, width: ${v.land.width}, height: ${v.land.height}, x: ${v.land.x}, y: ${v.land.y} },`,
      `      sky: { source: ${url(v.sky.output)}, width: ${v.sky.width}, height: ${v.sky.height}, speed: ${v.sky.speed}, y: ${v.sky.y} },`,
      "    },",
    ].join("\n")),
    "  ],",
    "};",
    "",
  ];
}
const records = [...manifest.records].sort((a, b) => a.background - b.background);
await writeFile(generatedModule, [
  "// Generated by scripts/generate-story-hd.mjs from story/hd/hd-manifest.json; do not edit by hand.",
  "import type { StoryHdEntry, StoryHdTitle } from \"./story-hd\";",
  "",
  `export const STORY_HD_WIDTH = ${WIDTH};`,
  `export const STORY_HD_HEIGHT = ${HEIGHT};`,
  "",
  "export const STORY_HD_ENTRIES: readonly StoryHdEntry[] = [",
  ...records.map((entry) => [
    "  {",
    `    background: ${entry.background},`,
    `    original: ${JSON.stringify(entry.original)},`,
    `    poster: ${url(entry.poster.output)},`,
    ...(entry.video ? [`    video: { source: ${url(entry.video.output)}, width: ${entry.video.width}, height: ${entry.video.height}, frames: ${entry.video.frames}, fps: ${entry.video.fps}${entry.video.alpha ? `, alpha: ${JSON.stringify(entry.video.alpha)}` : ""} },`] : []),
    ...(entry.sky ? [`    sky: { source: ${url(entry.sky.output)}, width: ${entry.sky.width}, height: ${entry.sky.height}, speed: ${entry.sky.speed} },`] : []),
    "  },",
  ].join("\n")),
  "];",
  "",
  ...titleModule(manifest.title),
].join("\n"));
const shippedBytes = new Map();
for (const entry of records) for (const file of [entry.poster, entry.video, entry.sky]) if (file) shippedBytes.set(file.output, file.bytes);
if (manifest.title) {
  const t = manifest.title;
  for (const file of [t.frame, t.women, ...t.variants.flatMap((v) => [v.logo, v.land, v.sky])]) shippedBytes.set(file.output, file.bytes);
}
const bytes = [...shippedBytes.values()].reduce((sum, size) => sum + size, 0);
console.log(`story HD catalog: ${records.length} records${manifest.title ? " + title" : ""}, ${(bytes / 1024 / 1024).toFixed(1)} MiB -> ${path.relative(root, generatedModule)}`);
