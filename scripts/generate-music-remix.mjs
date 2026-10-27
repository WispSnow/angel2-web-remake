#!/usr/bin/env node

// REMAKE-181 orchestral remixes. The asset pack's music/remix/remix-manifest.json
// is the source of truth; this script turns it into the runtime catalog
// src/game/content/music-remix.generated.ts after checking every OGG's hash.
//
// `--import <workbench>` first copies finished loops from the Suno workbench
// (one folder per track holding layout.json and loop/<id>.{ogg,json}, as made
// by its make-loop tool) into the asset pack and rewrites the manifest. The
// workbench itself never ships and is not needed afterwards.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(root, "public/assets/original");
const remixRoot = path.join(assetRoot, "music/remix");
const manifestPath = path.join(remixRoot, "remix-manifest.json");
const generatedModule = path.join(root, "src/game/content/music-remix.generated.ts");
const TARGET_LUFS = -16;

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** `MUSIC/7` + `MUSIC/6` -> `MUSIC-07-06`; `MAGIC/73` -> `MAGIC-73`. */
function fileStem(entryTrack, loopTrack) {
  const [container, loopRecord] = loopTrack.split("/");
  const records = entryTrack ? [entryTrack.split("/")[1], loopRecord] : [loopRecord];
  return `${container}-${records.map((record) => record.padStart(2, "0")).join("-")}`;
}

async function importWorkbench(workbench) {
  const tracks = [];
  for (const entry of (await readdir(workbench, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const folder = path.join(workbench, entry.name);
    const loopFolder = path.join(folder, "loop");
    let loopFiles;
    try {
      loopFiles = (await readdir(loopFolder)).filter((name) => name.endsWith(".json"));
    } catch {
      continue;
    }
    if (loopFiles.length !== 1) throw new Error(`${entry.name}: expected exactly one finished loop, found ${loopFiles.length}`);
    const layout = JSON.parse(await readFile(path.join(folder, "layout.json"), "utf8"));
    const loop = JSON.parse(await readFile(path.join(loopFolder, loopFiles[0]), "utf8"));
    const entryTrack = layout.sources.entry?.track;
    const loopTrack = layout.sources.loop.track;
    const stem = fileStem(entryTrack, loopTrack);
    const ogg = await readFile(path.join(loopFolder, loop.output.replace(/^loop\//u, "")));
    if (loop.loudness.targetLufs !== TARGET_LUFS) throw new Error(`${entry.name}: loudness target is not ${TARGET_LUFS} LUFS`);
    if (loop.oggDecodedFrames !== loop.outputFrames) throw new Error(`${entry.name}: OGG frame count differs from the master`);
    await mkdir(remixRoot, { recursive: true });
    await copyFile(path.join(loopFolder, loop.output.replace(/^loop\//u, "")), path.join(remixRoot, `${stem}.ogg`));
    tracks.push({
      key: entryTrack ? `${entryTrack}→${loopTrack}` : loopTrack,
      ...(entryTrack ? { entryTrack } : {}),
      loopTrack,
      title: loop.take.replace(/\.[^.]+$/u, ""),
      output: `music/remix/${stem}.ogg`,
      sha256: sha256(ogg),
      bytes: ogg.length,
      sampleRate: loop.sampleRate,
      frames: loop.outputFrames,
      loopStartFrame: loop.loopStartFrame,
      loopEndFrame: loop.loopEndFrame,
      sourceTakeSha256: loop.takeSha256,
      seam: {
        crossfadeSeconds: loop.seam.crossfadeSeconds,
        onsetCorrelation: loop.seam.onsetCorrelation,
        chromaSimilarity: loop.seam.chromaSimilarity,
      },
    });
  }
  if (tracks.length === 0) throw new Error(`no finished loops under ${workbench}`);
  const manifest = {
    format: "ANGEL2 orchestral remix music",
    version: 1,
    decision: "REMAKE-181",
    encoder: "oggenc",
    quality: 5,
    loudnessLufs: TARGET_LUFS,
    tracks,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function validate(manifest) {
  if (manifest.format !== "ANGEL2 orchestral remix music" || manifest.version !== 1) {
    throw new Error("unexpected remix manifest format");
  }
  const keys = new Set();
  for (const track of manifest.tracks) {
    if (keys.has(track.key)) throw new Error(`duplicate remix key ${track.key}`);
    keys.add(track.key);
    if (track.key !== (track.entryTrack ? `${track.entryTrack}→${track.loopTrack}` : track.loopTrack)) {
      throw new Error(`${track.key}: key does not match its tracks`);
    }
    if (!(track.loopStartFrame > 0 && track.loopStartFrame < track.loopEndFrame && track.loopEndFrame <= track.frames)) {
      throw new Error(`${track.key}: loop points out of range`);
    }
  }
}

const importIndex = process.argv.indexOf("--import");
const manifest = importIndex >= 0
  ? await importWorkbench(path.resolve(process.argv[importIndex + 1] ?? ""))
  : JSON.parse(await readFile(manifestPath, "utf8"));
validate(manifest);
for (const track of manifest.tracks) {
  const bytes = await readFile(path.join(assetRoot, track.output));
  if (bytes.toString("ascii", 0, 4) !== "OggS" || sha256(bytes) !== track.sha256) {
    throw new Error(`${track.output} does not match remix-manifest.json`);
  }
}

const entries = manifest.tracks.map((track) => [
  "  {",
  `    key: ${JSON.stringify(track.key)},`,
  ...(track.entryTrack ? [`    entryTrack: ${JSON.stringify(track.entryTrack)},`] : []),
  `    loopTrack: ${JSON.stringify(track.loopTrack)},`,
  `    title: ${JSON.stringify(track.title)},`,
  `    source: ${JSON.stringify(`/assets/original/${track.output}`)},`,
  `    sampleRate: ${track.sampleRate},`,
  `    frames: ${track.frames},`,
  `    loopStartFrame: ${track.loopStartFrame},`,
  `    loopEndFrame: ${track.loopEndFrame},`,
  "  },",
].join("\n"));
await writeFile(generatedModule, [
  "// Generated by scripts/generate-music-remix.mjs from music/remix/remix-manifest.json; do not edit by hand.",
  "import type { MusicRemixTrack } from \"./music-remix\";",
  "",
  `export const MUSIC_REMIX_LOUDNESS_LUFS = ${manifest.loudnessLufs};`,
  "",
  "export const MUSIC_REMIX_TRACKS: readonly MusicRemixTrack[] = [",
  ...entries,
  "];",
  "",
].join("\n"));
console.log(`music remix catalog: ${manifest.tracks.length} tracks -> ${path.relative(root, generatedModule)}`);
