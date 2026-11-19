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
// Version 4 adds the opening crawl (REMAKE-198, user request 2026-11-18) under
// `intro`: one one-shot clip (not a loop) per plate BK/41, 43..48 in the order
// module 23 shows them, each with the scroll update it is fully on screen (the
// pictures follow the REMAKE-189 narration, not the native plate switches) and
// one cross-fade length. The originals are pinned by hash, and every clip must
// last from the start of its fade-in to the end of the next plate's.
//
// Version 5 adds the ending epilogue (REMAKE-200, user request 2026-11-19) under
// `epilogue`: one one-shot clip per spread module 35 shows behind the typed text
// (two 320x350 halves side by side, full screen). The spreads must be exactly the
// pairs the epilogue segments name, the halves are pinned by hash, and every clip
// must last as long as its segment stays up: max(wait, typing) native ticks, or
// longer while the REMAKE-189 narration is still speaking.
//
// Version 6 adds the "The end" screen after the credits (REMAKE-201, user request
// 2026-11-19) under `theEnd`: one seamless loop over the 320x200 picture inside
// UN/54 frame 0 (the hand-written lettering and the heart around it stay the
// original pixels), the four-frame arm gesture module 46 overlays inside it
// included. Frame 0 and the four overlay frames are pinned by hash, the picture
// rectangle must lie inside frame 0 and contain the overlay, and the clip must have
// the picture's aspect.
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
const VERSION = 6;
/** REMAKE-198 crawl clips: 2.316x the 608x257 plate (2.366x vertically; H3 sizes step by 32), shown stretched into it. */
const INTRO_WIDTH = 1408;
const INTRO_HEIGHT = 608;
/** startup.ts NATIVE_TICK_MS: the remake runs module 23's timer at 10 ms a tick. */
const NATIVE_TICK_MS = 10;
const TITLE_SCALE = 3;
const TITLE_ROOT = "/assets/original/startup/title/";
/** 2.2x the 640x350 logical screen (2.194x vertically); `object-fit: cover` trims under one logical pixel. */
const WIDTH = 1408;
const HEIGHT = 768;
const ORIGINAL_WIDTH = 320;
const ORIGINAL_HEIGHT = 200;
/** REMAKE-200: module 35 blits two 320x350 halves side by side; the clips cover the whole screen like the story loops. */
const EPILOGUE_HALF_WIDTH = 320;
const EPILOGUE_HALF_HEIGHT = 350;
/** REMAKE-201: module 46 draws UN/54 frame 0 (408x301) at (160,27) and overlays frames 1-4 (48x56) at (352,161). */
const THE_END_ORIGINAL = "/assets/original/credits/end/00.png";
const THE_END_OVERLAYS = [1, 2, 3, 4].map((frame) => `/assets/original/credits/end/0${frame}.png`);
const THE_END_SIZE = { width: 408, height: 301 };
const THE_END_OVERLAY = { x: 352 - 160, y: 161 - 27, width: 48, height: 56 };

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
  } else if (kind === "intro-video") {
    const tracks = mp4Tracks(buffer);
    if (tracks.length !== 1 || tracks[0].handler !== "vide") fail(`${file.output} must hold exactly one video track and no audio`);
    if (tracks[0].width !== INTRO_WIDTH || tracks[0].height !== INTRO_HEIGHT || file.width !== INTRO_WIDTH || file.height !== INTRO_HEIGHT) {
      fail(`${file.output} is ${tracks[0].width}x${tracks[0].height}, expected ${INTRO_WIDTH}x${INTRO_HEIGHT}`);
    }
    if (!(Number.isInteger(file.frames) && file.frames > 24 && file.fps === 24)) fail(`${file.output} frame count or rate out of range`);
  } else if (kind === "the-end-video") {
    const tracks = mp4Tracks(buffer);
    if (tracks.length !== 1 || tracks[0].handler !== "vide") fail(`${file.output} must hold exactly one video track and no audio`);
    if (tracks[0].width !== file.width || tracks[0].height !== file.height) {
      fail(`${file.output} is ${tracks[0].width}x${tracks[0].height}, the manifest says ${file.width}x${file.height}`);
    }
    if (file.width % 32 !== 0 || file.height % 32 !== 0 || file.width < 640 || file.width > 1920) fail(`${file.output} size out of range`);
    if (!(Number.isInteger(file.frames) && file.frames > 24 && file.fps === 24)) fail(`${file.output} frame count or rate out of range`);
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

/** STARTUP_INTRO as the startup generator wrote it (plates, scroll length, update period). */
async function startupIntro() {
  const startup = await readFile(path.join(contentRoot, "startup.generated.ts"), "utf8");
  const match = startup.match(/export const STARTUP_INTRO = (\{.*\}) as const;/u);
  if (!match) fail("startup.generated.ts has no STARTUP_INTRO");
  return JSON.parse(match[1]);
}

/**
 * The HD crawl (REMAKE-198): the plates in module 23's order with their pinned originals, cues starting at 0 and
 * rising inside the crawl with room for a full cross-fade between them, and clips long enough for their window.
 * Returns the plate rectangle the clips are stretched into.
 */
async function validateIntro(intro, expectedFiles) {
  const native = await startupIntro();
  const updateMs = native.ticksPerScrollUpdate * NATIVE_TICK_MS;
  const crawlMs = native.scrollUpdates * updateMs;
  if (!Array.isArray(intro.scenes) || intro.scenes.length !== native.backgrounds.length) fail("the intro needs one scene per crawl plate");
  if (!Number.isInteger(intro.crossfadeMs) || intro.crossfadeMs < 0 || intro.crossfadeMs > 3000) fail("intro cross-fade out of range");
  let plate;
  for (const [index, scene] of intro.scenes.entries()) {
    const background = native.backgrounds[index];
    if (scene.original !== background.src) fail(`intro scene ${index} must replace ${background.src}`);
    const file = path.join(assetRoot, scene.original.replace(/^\/assets\/original\//u, ""));
    if (!existsSync(file)) fail(`${scene.original} does not exist`);
    const buffer = await readFile(file);
    if (scene.originalSha256 !== sha256(buffer)) fail(`intro scene ${index}: ${scene.original} changed; review the HD intro before shipping it`);
    const size = pngSize(buffer);
    const rect = { x: background.x, y: background.y, width: size.width, height: size.height };
    if (plate && JSON.stringify(plate) !== JSON.stringify(rect)) fail("the crawl plates no longer share one rectangle");
    plate = rect;
    const next = intro.scenes[index + 1];
    if (index === 0 ? scene.cue !== 0 : !(Number.isInteger(scene.cue) && scene.cue > intro.scenes[index - 1].cue)) {
      fail(`intro scene ${index}: cues start at 0 and rise`);
    }
    const end = next ? next.cue * updateMs + intro.crossfadeMs / 2 : crawlMs;
    const start = index === 0 ? 0 : scene.cue * updateMs - intro.crossfadeMs / 2;
    if (next && (next.cue - scene.cue) * updateMs <= intro.crossfadeMs) fail(`intro scene ${index} is shorter than the cross-fade`);
    if (end > crawlMs + intro.crossfadeMs) fail(`intro scene ${index} runs past the crawl`);
    await checkFile(scene.video, "intro-video");
    if (scene.video.frames < Math.ceil((end - start) / 1000 * scene.video.fps)) {
      fail(`${scene.video.output} has ${scene.video.frames} frames, its window needs ${Math.ceil((end - start) / 1000 * scene.video.fps)}`);
    }
    expectedFiles.add(path.relative("story/hd", scene.video.output));
  }
  return plate;
}

/** STAGE49_EPILOGUE_SEGMENTS and the epilogue narration lengths, as their generators wrote them. */
async function epilogueSegments() {
  const ending = await readFile(path.join(contentRoot, "stage49-ending.generated.ts"), "utf8");
  const match = ending.match(/export const STAGE49_EPILOGUE_SEGMENTS = (\[.*?\]) as const;/su);
  if (!match) fail("stage49-ending.generated.ts has no STAGE49_EPILOGUE_SEGMENTS");
  const voice = await readFile(path.join(contentRoot, "voice-catalog.generated.ts"), "utf8");
  const narration = new Map([...voice.matchAll(/"(\w+:\d+)": \{ key: "epilogue:[^"]+", source: "[^"]+", durationMs: (\d+) \}/gu)]
    .map((m) => [m[1], Number(m[2])]));
  const spreads = new Map();
  for (const segment of JSON.parse(match[1])) {
    for (const variant of segment.variants) {
      const [left, right] = variant.illustrationRecords;
      const holdMs = Math.max(segment.waitNativeTicks, variant.typingNativeTicks) * NATIVE_TICK_MS;
      const spokenMs = narration.get(`${segment.id}:${variant.selector}`) ?? 0;
      spreads.set(`${left}+${right}`, { left, right, label: `${segment.id}:${variant.selector}`, ms: Math.max(holdMs, spokenMs) });
    }
  }
  return spreads;
}

const epilogueOriginal = (record) => `/assets/original/ending/epilogue/${String(record).padStart(2, "0")}.png`;

async function epilogueOriginalSha256(original) {
  const file = path.join(assetRoot, original.replace(/^\/assets\/original\//u, ""));
  if (!existsSync(file)) fail(`${original} does not exist`);
  const buffer = await readFile(file);
  const size = pngSize(buffer);
  if (size.width !== EPILOGUE_HALF_WIDTH || size.height !== EPILOGUE_HALF_HEIGHT) fail(`${original} is not a 320x350 epilogue half`);
  return sha256(buffer);
}

/** The HD epilogue (REMAKE-200): one spread per segment variant, halves pinned, clips as long as their segment. */
async function validateEpilogue(epilogue, expectedFiles) {
  const wanted = await epilogueSegments();
  if (!Array.isArray(epilogue.spreads) || epilogue.spreads.length !== wanted.size) fail(`the epilogue needs ${wanted.size} spreads`);
  const seen = new Set();
  for (const spread of epilogue.spreads) {
    const records = spread.originals.map((url) => Number(url.match(/\/ending\/epilogue\/(\d+)\.png$/u)?.[1] ?? NaN));
    const key = records.join("+");
    const segment = wanted.get(key);
    if (!segment || spread.originals[0] !== epilogueOriginal(segment.left) || spread.originals[1] !== epilogueOriginal(segment.right)) {
      fail(`epilogue spread ${spread.originals.join(" + ")} is not one the epilogue segments show`);
    }
    if (seen.has(key)) fail(`epilogue spread ${key} appears twice`);
    seen.add(key);
    for (const [index, original] of spread.originals.entries()) {
      if (spread.originalsSha256[index] !== await epilogueOriginalSha256(original)) {
        fail(`epilogue spread ${key}: ${original} changed; review the HD epilogue before shipping it`);
      }
    }
    await checkFile(spread.video, "video");
    const need = Math.ceil(segment.ms / 1000 * spread.video.fps);
    if (spread.video.frames < need) fail(`${spread.video.output} has ${spread.video.frames} frames, ${segment.label} stays up for ${need}`);
    expectedFiles.add(path.relative("story/hd", spread.video.output));
  }
}

async function theEndOriginalSha256(original, size) {
  const file = path.join(assetRoot, original.replace(/^\/assets\/original\//u, ""));
  if (!existsSync(file)) fail(`${original} does not exist`);
  const buffer = await readFile(file);
  const actual = pngSize(buffer);
  if (actual.width !== size.width || actual.height !== size.height) fail(`${original} is not ${size.width}x${size.height}`);
  return sha256(buffer);
}

/** The HD "The end" (REMAKE-201): one loop over the picture inside UN/54 frame 0, the originals pinned. */
async function validateTheEnd(theEnd, expectedFiles) {
  if (theEnd.original !== THE_END_ORIGINAL) fail(`the end must replace ${THE_END_ORIGINAL}`);
  if (theEnd.originalSha256 !== await theEndOriginalSha256(THE_END_ORIGINAL, THE_END_SIZE)) {
    fail(`${THE_END_ORIGINAL} changed; review the HD "The end" before shipping it`);
  }
  if (!Array.isArray(theEnd.overlaysSha256) || theEnd.overlaysSha256.length !== THE_END_OVERLAYS.length) fail("the end needs four overlay hashes");
  for (const [index, overlay] of THE_END_OVERLAYS.entries()) {
    if (theEnd.overlaysSha256[index] !== await theEndOriginalSha256(overlay, THE_END_OVERLAY)) {
      fail(`${overlay} changed; the HD "The end" loop acts out the original gesture, review it`);
    }
  }
  const { x, y, width, height } = theEnd.picture ?? {};
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1
    || x + width > THE_END_SIZE.width || y + height > THE_END_SIZE.height) fail("the end picture lies outside frame 0");
  const o = THE_END_OVERLAY;
  if (o.x < x || o.y < y || o.x + o.width > x + width || o.y + o.height > y + height) fail("the end picture must contain the overlay gesture");
  await checkFile(theEnd.video, "the-end-video");
  if (theEnd.video.width * height !== theEnd.video.height * width) fail(`${theEnd.video.output} does not have the picture's aspect`);
  expectedFiles.add(path.relative("story/hd", theEnd.video.output));
}

async function importWorkbench(workbench) {
  const exported = JSON.parse(await readFile(path.join(workbench, "manifest.json"), "utf8"));
  if (exported.format !== "angel2-story-hd-export" || exported.version !== 6) fail("unexpected workbench export format");
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
  let intro;
  if (exported.intro) {
    intro = { crossfadeMs: exported.intro.crossfadeMs, scenes: [] };
    for (const scene of exported.intro.scenes) {
      const original = `/assets/original/${scene.original}`;
      const file = path.join(assetRoot, scene.original);
      if (!existsSync(file)) fail(`${original} does not exist`);
      intro.scenes.push({
        original,
        originalSha256: sha256(await readFile(file)),
        cue: scene.cue,
        video: await ship(scene.video, { frames: scene.video.frames, fps: scene.video.fps }),
      });
    }
  }
  let epilogue;
  if (exported.epilogue) {
    epilogue = { spreads: [] };
    for (const spread of exported.epilogue.spreads) {
      const originals = spread.originals.map((original) => `/assets/original/${original}`);
      epilogue.spreads.push({
        originals,
        originalsSha256: await Promise.all(originals.map(epilogueOriginalSha256)),
        video: await ship(spread.video, { frames: spread.video.frames, fps: spread.video.fps }),
      });
    }
  }
  let theEnd;
  if (exported.theEnd) {
    const t = exported.theEnd;
    theEnd = {
      original: THE_END_ORIGINAL,
      originalSha256: await theEndOriginalSha256(THE_END_ORIGINAL, THE_END_SIZE),
      overlaysSha256: await Promise.all(THE_END_OVERLAYS.map((overlay) => theEndOriginalSha256(overlay, THE_END_OVERLAY))),
      picture: t.picture,
      video: await ship(t.video, { frames: t.video.frames, fps: t.video.fps }),
    };
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
    ...(intro ? {
      intro: {
        note: "REMAKE-198 opening crawl: one one-shot clip per plate, each fully on screen from `cue` (scroll updates), cross-fades centred on the cues",
        ...intro,
      },
    } : {}),
    ...(epilogue ? {
      epilogue: {
        note: "REMAKE-200 ending epilogue: one one-shot clip per spread (left and right 320x350 halves), as long as its segment stays up",
        ...epilogue,
      },
    } : {}),
    ...(theEnd ? {
      theEnd: {
        note: "REMAKE-201 The end: one seamless loop stretched over `picture` (original pixels of UN/54 frame 0), the overlay gesture acted out inside it",
        ...theEnd,
      },
    } : {}),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

let introPlate;

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
  if (manifest.intro) introPlate = await validateIntro(manifest.intro, expectedFiles);
  if (manifest.epilogue) await validateEpilogue(manifest.epilogue, expectedFiles);
  if (manifest.theEnd) await validateTheEnd(manifest.theEnd, expectedFiles);
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
function introModule(intro) {
  if (!intro) return ["export const STORY_HD_INTRO: StoryHdIntro | undefined = undefined;", ""];
  const plate = introPlate ?? fail("the intro was not validated");
  return [
    "export const STORY_HD_INTRO: StoryHdIntro | undefined = {",
    `  plate: { x: ${plate.x}, y: ${plate.y}, width: ${plate.width}, height: ${plate.height} },`,
    `  crossfadeMs: ${intro.crossfadeMs},`,
    "  scenes: [",
    ...intro.scenes.map((scene) => [
      "    {",
      `      original: ${JSON.stringify(scene.original)},`,
      `      cue: ${scene.cue},`,
      `      video: { source: ${url(scene.video.output)}, width: ${scene.video.width}, height: ${scene.video.height}, frames: ${scene.video.frames}, fps: ${scene.video.fps} },`,
      "    },",
    ].join("\n")),
    "  ],",
    "};",
    "",
  ];
}
function epilogueModule(epilogue) {
  if (!epilogue) return ["export const STORY_HD_EPILOGUE: StoryHdEpilogue | undefined = undefined;", ""];
  return [
    "export const STORY_HD_EPILOGUE: StoryHdEpilogue | undefined = {",
    "  spreads: [",
    ...epilogue.spreads.map((spread) => [
      "    {",
      `      originals: [${spread.originals.map((original) => JSON.stringify(original)).join(", ")}],`,
      `      video: { source: ${url(spread.video.output)}, width: ${spread.video.width}, height: ${spread.video.height}, frames: ${spread.video.frames}, fps: ${spread.video.fps} },`,
      "    },",
    ].join("\n")),
    "  ],",
    "};",
    "",
  ];
}
function theEndModule(theEnd) {
  if (!theEnd) return ["export const STORY_HD_THE_END: StoryHdTheEnd | undefined = undefined;", ""];
  const { picture, video } = theEnd;
  return [
    "export const STORY_HD_THE_END: StoryHdTheEnd | undefined = {",
    `  original: ${JSON.stringify(theEnd.original)},`,
    `  picture: { x: ${picture.x}, y: ${picture.y}, width: ${picture.width}, height: ${picture.height} },`,
    `  video: { source: ${url(video.output)}, width: ${video.width}, height: ${video.height}, frames: ${video.frames}, fps: ${video.fps} },`,
    "};",
    "",
  ];
}
const records = [...manifest.records].sort((a, b) => a.background - b.background);
await writeFile(generatedModule, [
  "// Generated by scripts/generate-story-hd.mjs from story/hd/hd-manifest.json; do not edit by hand.",
  "import type { StoryHdEntry, StoryHdEpilogue, StoryHdIntro, StoryHdTheEnd, StoryHdTitle } from \"./story-hd\";",
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
  ...introModule(manifest.intro),
  ...epilogueModule(manifest.epilogue),
  ...theEndModule(manifest.theEnd),
].join("\n"));
const shippedBytes = new Map();
for (const entry of records) for (const file of [entry.poster, entry.video, entry.sky]) if (file) shippedBytes.set(file.output, file.bytes);
if (manifest.title) {
  const t = manifest.title;
  for (const file of [t.frame, t.women, ...t.variants.flatMap((v) => [v.logo, v.land, v.sky])]) shippedBytes.set(file.output, file.bytes);
}
if (manifest.intro) for (const scene of manifest.intro.scenes) shippedBytes.set(scene.video.output, scene.video.bytes);
if (manifest.epilogue) for (const spread of manifest.epilogue.spreads) shippedBytes.set(spread.video.output, spread.video.bytes);
if (manifest.theEnd) shippedBytes.set(manifest.theEnd.video.output, manifest.theEnd.video.bytes);
const bytes = [...shippedBytes.values()].reduce((sum, size) => sum + size, 0);
console.log(`story HD catalog: ${records.length} records${manifest.title ? " + title" : ""}${manifest.intro ? " + intro" : ""}${manifest.epilogue ? " + epilogue" : ""}${manifest.theEnd ? " + the end" : ""}, ${(bytes / 1024 / 1024).toFixed(1)} MiB -> ${path.relative(root, generatedModule)}`);
