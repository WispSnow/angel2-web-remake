#!/usr/bin/env node

// REMAKE-192 optional HD portraits. The asset pack's portraits/hd/hd-manifest.json
// is the source of truth; this script turns it into
// src/game/content/portrait-hd.generated.ts after checking every file:
//
// - every record is an original portrait record, D/63 has none (it stays
//   original), and no record appears twice;
// - the original base.png each record was made from still hashes the same, so a
//   later change to the original evidence forces the HD record to be reviewed;
// - every MP4 matches its hash, holds exactly one video track and no audio, and
//   its track size is the one the layout below needs; every poster is a 448x448
//   WebP matching its hash; no stray file ships under portraits/hd/;
// - the mouth layout fits: lip-synced records draw four tiles of a strip right of
//   the 448 square (RIFE 1/4, 1/2, 3/4 and the open copy, plan doc 23.4) at a
//   patch inside the square, with increasing measured openness knots; the dragon
//   records fade the whole right half in; mouthless records are 448 wide; the
//   statue D/67 is a still;
// - REMAKE-195: a record carries a red-eye (possessed) variant exactly when its
//   original has the frame-7 eye-red.png. The variant swaps only the video and
//   poster: same size, frame count and mouth strip as the loop it was made from.
//
// `--import <workbench export>` first copies the files from the git-ignored HD
// workbench (tmp/portrait-hd/export, made by its tools/export_hd.py) into the
// asset pack and rewrites the manifest. The workbench never ships.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(root, "public/assets/original");
const hdRoot = path.join(assetRoot, "portraits/hd");
const manifestPath = path.join(hdRoot, "hd-manifest.json");
const generatedModule = path.join(root, "src/game/content/portrait-hd.generated.ts");
const FORMAT = "ANGEL2 HD portraits";
const VERSION = 1;
const SIZE = 448;
const RECORD_COUNT = 68;
/** D/63 has no original overlay frames or layout; the HD set keeps it original (plan doc 9.1). */
const ORIGINAL_ONLY = new Set([63]);
const MODES = new Set(["tween", "continuous", "none", "still"]);
const MOUTH_LEVELS = 4;

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const pad = (record) => String(record).padStart(4, "0");
const fail = (message) => {
  throw new Error(`portrait HD catalog: ${message}`);
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

/** The video track's display size and the handler type of every track. */
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
    // tkhd ends with width and height as 16.16 fixed point.
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
  if (chunk === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  return fail(`unknown WebP chunk ${chunk}`);
}

const inside = (rect, width, height) => rect.x >= 0 && rect.y >= 0
  && rect.x + rect.w <= width && rect.y + rect.h <= height;

async function originalBaseSha256(record) {
  return sha256(await readFile(path.join(assetRoot, "portraits", pad(record), "base.png")));
}

/** The original's frame 7, module 29's possessed red eyes; only these records get an HD red-eye variant. */
const hasOriginalRedEyes = (record) => existsSync(path.join(assetRoot, "portraits", pad(record), "eye-red.png"));

async function checkVideo(file) {
  const video = await readFile(path.join(assetRoot, file.output));
  if (sha256(video) !== file.sha256 || video.length !== file.bytes) fail(`${file.output} does not match the manifest`);
  const tracks = mp4Tracks(video);
  if (tracks.length !== 1 || tracks[0].handler !== "vide") fail(`${file.output} must hold exactly one video track and no audio`);
  if (tracks[0].width !== file.width || tracks[0].height !== file.height || file.height !== SIZE) {
    fail(`${file.output} is ${tracks[0].width}x${tracks[0].height}, manifest says ${file.width}x${file.height}`);
  }
}

async function checkPoster(file) {
  const poster = await readFile(path.join(assetRoot, file.output));
  if (sha256(poster) !== file.sha256 || poster.length !== file.bytes) fail(`${file.output} does not match the manifest`);
  const size = webpSize(poster);
  if (size.width !== SIZE || size.height !== SIZE) fail(`${file.output} is ${size.width}x${size.height}`);
}

async function importWorkbench(workbench) {
  const exported = JSON.parse(await readFile(path.join(workbench, "manifest.json"), "utf8"));
  if (exported.format !== "angel2-portrait-hd-export" || exported.version !== 1) fail("unexpected workbench export format");
  await rm(hdRoot, { recursive: true, force: true });
  const records = [];
  for (const entry of exported.records) {
    const directory = path.join(hdRoot, pad(entry.record));
    await mkdir(directory, { recursive: true });
    const shipped = { record: entry.record, mode: entry.mode, originalBaseSha256: await originalBaseSha256(entry.record) };
    const ship = async (file, name) => {
      await copyFile(path.join(workbench, file.file), path.join(directory, name));
      return {
        output: `portraits/hd/${pad(entry.record)}/${name}`,
        width: file.width,
        height: file.height,
        bytes: file.bytes,
        sha256: file.sha256,
      };
    };
    if (entry.video) shipped.video = await ship(entry.video, "portrait.mp4");
    shipped.poster = await ship(entry.poster, "poster.webp");
    if (entry.redEyes) {
      shipped.redEyes = {
        video: await ship(entry.redEyes.video, "red-eyes.mp4"),
        poster: await ship(entry.redEyes.poster, "red-eyes-poster.webp"),
      };
    }
    if (entry.video) Object.assign(shipped, { frames: entry.frames, fps: entry.fps });
    for (const field of ["patch", "levels", "knots", "source", "derivedFrom"]) {
      if (entry[field] !== undefined) shipped[field] = entry[field];
    }
    records.push(shipped);
  }
  const manifest = {
    format: FORMAT,
    version: VERSION,
    decision: "REMAKE-192, REMAKE-195",
    size: SIZE,
    video: "H.264 yuv420p CRF 20, 24 fps, faststart, muted loop",
    poster: "WebP q90, frame 0 of the loop",
    redEyes: "possessed variant (module 29 frame 7): irises recoloured red, blinks bridged; same layout and mouth strip",
    records,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function validate(manifest) {
  if (manifest.format !== FORMAT || manifest.version !== VERSION || manifest.size !== SIZE) fail("unexpected manifest format");
  const seen = new Set();
  const expectedFiles = new Set(["hd-manifest.json"]);
  for (const entry of manifest.records) {
    const label = `D/${entry.record}`;
    if (!Number.isInteger(entry.record) || entry.record < 0 || entry.record >= RECORD_COUNT) fail(`${label} is not a portrait record`);
    if (ORIGINAL_ONLY.has(entry.record)) fail(`${label} must stay original`);
    if (seen.has(entry.record)) fail(`${label} appears twice`);
    seen.add(entry.record);
    if (!MODES.has(entry.mode)) fail(`${label} has unknown mode ${entry.mode}`);
    if (entry.originalBaseSha256 !== await originalBaseSha256(entry.record)) {
      fail(`${label} was made from a different original base.png; review the HD record before shipping it`);
    }

    await checkPoster(entry.poster);
    expectedFiles.add(path.relative("portraits/hd", entry.poster.output));
    if (Boolean(entry.redEyes) !== hasOriginalRedEyes(entry.record)) {
      fail(entry.redEyes ? `${label} has a red-eye variant but the original has no frame 7`
        : `${label} needs a red-eye variant: the original has frame 7 (eye-red.png)`);
    }

    if (entry.mode === "still") {
      if (entry.video || entry.patch) fail(`${label} is a still but carries a video or mouth layout`);
      if (!Number.isInteger(entry.derivedFrom)) fail(`${label} still does not name its source record`);
      continue;
    }
    if (!entry.video) fail(`${label} has no video`);
    await checkVideo(entry.video);
    if (!(entry.frames > 24 && entry.fps === 24)) fail(`${label} frame count or rate out of range`);
    expectedFiles.add(path.relative("portraits/hd", entry.video.output));
    if (entry.redEyes) {
      // The variant reuses the loop's mouth strip and layout, so it must be the same frame for frame.
      await checkVideo(entry.redEyes.video);
      await checkPoster(entry.redEyes.poster);
      if (entry.redEyes.video.width !== entry.video.width) fail(`${label} red-eye video does not match the loop's layout`);
      for (const file of [entry.redEyes.video, entry.redEyes.poster]) expectedFiles.add(path.relative("portraits/hd", file.output));
    }

    if (entry.mode === "none") {
      if (entry.video.width !== SIZE || entry.patch) fail(`${label} is mouthless but its video is not a bare square`);
    } else if (entry.mode === "continuous") {
      const { patch, source } = entry;
      if (patch?.x !== 0 || patch.y !== 0 || patch.w !== SIZE || patch.h !== SIZE || source?.sx !== SIZE || source.sy !== 0
        || entry.video.width !== 2 * SIZE) {
        fail(`${label} speaking frame must be the whole right half of a ${2 * SIZE}-wide video`);
      }
    } else {
      const { patch, levels, knots } = entry;
      if (!patch || !inside(patch, SIZE, SIZE)) fail(`${label} mouth patch lies outside the portrait`);
      if (entry.video.width !== SIZE + Math.ceil(patch.w / 16) * 16) fail(`${label} strip width does not match the patch`);
      if (levels?.length !== MOUTH_LEVELS) fail(`${label} needs ${MOUTH_LEVELS} mouth tiles`);
      for (const tile of levels) {
        if (tile.sx < SIZE || !inside({ x: tile.sx, y: tile.sy, w: patch.w, h: patch.h }, entry.video.width, SIZE)) {
          fail(`${label} mouth tile at ${tile.sx},${tile.sy} lies outside the strip`);
        }
      }
      if (knots?.length !== MOUTH_LEVELS + 1 || knots[0] !== 0 || knots.at(-1) !== 1
        || knots.some((knot, index) => index > 0 && knot <= knots[index - 1])) {
        fail(`${label} openness knots must rise from 0 to 1`);
      }
    }
  }
  const shippedFiles = [];
  for (const entry of await readdir(hdRoot, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) shippedFiles.push(path.relative(hdRoot, path.join(entry.parentPath, entry.name)));
  }
  const stray = shippedFiles.filter((file) => !expectedFiles.has(file));
  if (stray.length > 0) fail(`stray files under portraits/hd/: ${stray.join(", ")}`);
}

const importIndex = process.argv.indexOf("--import");
const manifest = importIndex >= 0
  ? await importWorkbench(path.resolve(process.argv[importIndex + 1] ?? ""))
  : JSON.parse(await readFile(manifestPath, "utf8"));
await validate(manifest);

const url = (output) => JSON.stringify(`/assets/original/${output}`);
const records = [...manifest.records].sort((a, b) => a.record - b.record);
const entries = records.map((entry) => {
  const lines = [`  ${entry.record}: {`, `    mode: ${JSON.stringify(entry.mode)},`, `    poster: ${url(entry.poster.output)},`];
  if (entry.video) {
    lines.push(`    video: { source: ${url(entry.video.output)}, width: ${entry.video.width}, height: ${entry.video.height}, frames: ${entry.frames}, fps: ${entry.fps} },`);
  }
  if (entry.mode === "tween") {
    lines.push(`    mouth: { patch: ${JSON.stringify(entry.patch)}, levels: ${JSON.stringify(entry.levels)}, knots: ${JSON.stringify(entry.knots)} },`);
  }
  if (entry.mode === "continuous") lines.push(`    speakingFrame: ${JSON.stringify(entry.source)},`);
  if (entry.redEyes) {
    lines.push(`    redEyes: { poster: ${url(entry.redEyes.poster.output)}, video: { source: ${url(entry.redEyes.video.output)}, width: ${entry.redEyes.video.width}, height: ${entry.redEyes.video.height}, frames: ${entry.frames}, fps: ${entry.fps} } },`);
  }
  lines.push("  },");
  return lines.join("\n");
});
await writeFile(generatedModule, [
  "// Generated by scripts/generate-portrait-hd.mjs from portraits/hd/hd-manifest.json; do not edit by hand.",
  "import type { PortraitHdEntry } from \"./portrait-hd\";",
  "import type { PortraitRecord } from \"./portrait-catalog.generated\";",
  "",
  `export const PORTRAIT_HD_SIZE = ${SIZE};`,
  "",
  "export const PORTRAIT_HD_ENTRIES: Readonly<Partial<Record<PortraitRecord, PortraitHdEntry>>> = {",
  ...entries,
  "};",
  "",
].join("\n"));
const bytes = records.reduce((sum, entry) => sum + entry.poster.bytes + (entry.video?.bytes ?? 0)
  + (entry.redEyes ? entry.redEyes.video.bytes + entry.redEyes.poster.bytes : 0), 0);
console.log(`portrait HD catalog: ${records.length} records, ${(bytes / 1024 / 1024).toFixed(1)} MiB -> ${path.relative(root, generatedModule)}`);
