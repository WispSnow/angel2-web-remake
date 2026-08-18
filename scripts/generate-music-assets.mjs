#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdtemp, access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "reverse/converted/audio/rix-wav");
const publicRoot = path.join(root, "public/assets/original");
const musicRoot = path.join(publicRoot, "music");
const generatedModule = path.join(root, "src/game/content/stage0-music.generated.ts");
const CROSSFADE_FRAMES = 1024;
const QUALITY = 5;
const CONTAINERS = ["MUSIC", "MAGIC", "UN"];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function parsePcm16Wave(buffer, fileName) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${fileName}: expected RIFF/WAVE`);
  let format;
  let data;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > buffer.length) throw new Error(`${fileName}: truncated ${id} chunk`);
    if (id === "fmt ") {
      if (size < 16) throw new Error(`${fileName}: truncated fmt chunk`);
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        byteRate: buffer.readUInt32LE(body + 8),
        blockAlign: buffer.readUInt16LE(body + 12),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (id === "data") data = buffer.subarray(body, body + size);
    offset = body + size + (size & 1);
  }
  if (!format || !data) throw new Error(`${fileName}: missing fmt or data`);
  if (format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels < 1 || format.channels > 2
    || format.blockAlign !== format.channels * 2 || format.byteRate !== format.sampleRate * format.blockAlign
    || data.length % format.blockAlign !== 0) throw new Error(`${fileName}: inconsistent PCM format`);
  const samples = new Int16Array(data.length / 2);
  for (let index = 0; index < samples.length; index += 1) samples[index] = data.readInt16LE(index * 2);
  return { ...format, frames: data.length / format.blockAlign, samples };
}

function encodePcm16Wave(wave) {
  const dataBytes = wave.samples.length * 2;
  const output = Buffer.alloc(44 + dataBytes);
  output.write("RIFF", 0, "ascii");
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write("WAVE", 8, "ascii");
  output.write("fmt ", 12, "ascii");
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(wave.channels, 22);
  output.writeUInt32LE(wave.sampleRate, 24);
  output.writeUInt32LE(wave.sampleRate * wave.channels * 2, 28);
  output.writeUInt16LE(wave.channels * 2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36, "ascii");
  output.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < wave.samples.length; index += 1) output.writeInt16LE(wave.samples[index], 44 + index * 2);
  return output;
}

function createSeamlessLoop(wave, crossfadeFrames) {
  if (crossfadeFrames < 2 || crossfadeFrames * 2 >= wave.frames) throw new Error(`invalid crossfade for ${wave.frames} frames`);
  const outputFrames = wave.frames - crossfadeFrames;
  const output = new Int16Array(outputFrames * wave.channels);
  for (let frame = 0; frame < crossfadeFrames; frame += 1) {
    const mix = frame / (crossfadeFrames - 1);
    for (let channel = 0; channel < wave.channels; channel += 1) {
      const tail = wave.samples[(outputFrames + frame) * wave.channels + channel];
      const head = wave.samples[frame * wave.channels + channel];
      output[frame * wave.channels + channel] = Math.round(tail * (1 - mix) + head * mix);
    }
  }
  output.set(wave.samples.subarray(crossfadeFrames * wave.channels, outputFrames * wave.channels), crossfadeFrames * wave.channels);
  return { channels: wave.channels, sampleRate: wave.sampleRate, frames: outputFrames, samples: output };
}

function boundaryMetrics(wave) {
  const deltas = Array.from({ length: wave.channels }, (_, channel) =>
    wave.samples[channel] - wave.samples[(wave.frames - 1) * wave.channels + channel]);
  const rms = Math.sqrt(deltas.reduce((sum, delta) => sum + delta * delta, 0) / deltas.length);
  return { channelDeltas: deltas, rms: Number(rms.toFixed(3)), rmsDbfs: rms === 0 ? null : Number((20 * Math.log10(rms / 32768)).toFixed(3)) };
}

function serialFor(container, record, generated = false) {
  let value = 0x13579bdf;
  for (const character of `${container}/${record}${generated ? "/generated" : ""}`) value = Math.imul(value ^ character.charCodeAt(0), 0x45d9f3b) >>> 0;
  return value || 1;
}

function encodeOgg(inputPath, outputPath, serial) {
  const result = spawnSync("oggenc", ["-Q", "-q", String(QUALITY), "--discard-comments", "--serial", String(serial), "-o", outputPath, inputPath], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`oggenc failed for ${inputPath}: ${result.stderr}`);
}

async function pathExists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function collectSourceTracks() {
  const tracks = [];
  for (const container of CONTAINERS) {
    const directory = path.join(sourceRoot, container);
    const entries = (await readdir(directory)).filter((entry) => /^\d{4}\.wav$/u.test(entry)).sort();
    for (const entry of entries) tracks.push({ container, record: Number(entry.slice(0, 4)), source: path.join(directory, entry) });
  }
  if (tracks.length !== 54) throw new Error(`expected 54 music masters, found ${tracks.length}`);
  return tracks;
}

async function generateOgg(track) {
  const sourceBytes = await readFile(track.source);
  const sourceWave = parsePcm16Wave(sourceBytes, track.source);
  const output = path.join(musicRoot, track.container, `${String(track.record).padStart(4, "0")}.ogg`);
  await mkdir(path.dirname(output), { recursive: true });
  encodeOgg(track.source, output, serialFor(track.container, track.record));
  const outputBytes = await readFile(output);
  return { container: track.container, record: track.record, source: path.relative(root, track.source), sourceSha256: sha256(sourceBytes), output: path.relative(root, output), outputSha256: sha256(outputBytes), sourceBytes: sourceBytes.length, outputBytes: outputBytes.length, sampleRate: sourceWave.sampleRate, channels: sourceWave.channels, frames: sourceWave.frames };
}

async function generateSeamless(id, container, record, outputName, temporaryRoot) {
  const sourcePath = path.join(sourceRoot, container, `${String(record).padStart(4, "0")}.wav`);
  const sourceBytes = await readFile(sourcePath);
  const sourceWave = parsePcm16Wave(sourceBytes, sourcePath);
  const seamlessWave = createSeamlessLoop(sourceWave, CROSSFADE_FRAMES);
  const temporaryWave = path.join(temporaryRoot, `${id}.wav`);
  const output = path.join(musicRoot, "generated", outputName);
  await writeFile(temporaryWave, encodePcm16Wave(seamlessWave));
  await mkdir(path.dirname(output), { recursive: true });
  encodeOgg(temporaryWave, output, serialFor(container, record, true));
  const outputBytes = await readFile(output);
  return { id, source: path.relative(root, sourcePath), output: path.relative(root, output), sourceSha256: sha256(sourceBytes), outputSha256: sha256(outputBytes), sampleRate: sourceWave.sampleRate, channels: sourceWave.channels, sourceFrames: sourceWave.frames, outputFrames: seamlessWave.frames, crossfadeFrames: CROSSFADE_FRAMES, crossfadeMilliseconds: Number((CROSSFADE_FRAMES * 1000 / sourceWave.sampleRate).toFixed(6)), sourceBoundary: boundaryMetrics(sourceWave), outputBoundary: boundaryMetrics(seamlessWave) };
}

const encoderVersion = spawnSync("oggenc", ["--version"], { encoding: "utf8" }).stdout.trim().split("\n").slice(0, 2).join(" ");
if (!encoderVersion) throw new Error("oggenc is required to generate development music assets");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "angel2-music-"));
try {
  const tracks = [];
  for (const source of await collectSourceTracks()) tracks.push(await generateOgg(source));
  const seams = [
    await generateSeamless("story-stage0", "MAGIC", 73, "stage0-story-seamless.ogg", temporaryRoot),
    await generateSeamless("battle-stage0-player-loop", "MUSIC", 6, "stage0-player-seamless.ogg", temporaryRoot),
    await generateSeamless("battle-stage0-enemy-loop", "MUSIC", 4, "stage0-enemy-seamless.ogg", temporaryRoot),
  ];
  await writeFile(path.join(musicRoot, "music-manifest.json"), `${JSON.stringify({ format: "ANGEL2 deduplicated music assets", version: 1, encoder: "oggenc", encoderVersion, quality: QUALITY, tracks }, null, 2)}\n`);
  await writeFile(path.join(publicRoot, "stage0-music-seams.json"), `${JSON.stringify({ format: "ANGEL2 stage-0 seamless music loops", version: 2, algorithm: "periodic-linear-overlap-add", encoding: { codec: "vorbis", quality: QUALITY }, tracks: seams }, null, 2)}\n`);
  const sampleRates = new Set(seams.map((track) => track.sampleRate));
  if (sampleRates.size !== 1) throw new Error("stage-0 music sources must share one sample rate");
  const [sampleRate] = sampleRates;
  await writeFile(generatedModule, `// Generated by scripts/generate-music-assets.mjs; do not edit by hand.\nexport const STAGE0_MUSIC_SEAM_CROSSFADE_FRAMES = ${CROSSFADE_FRAMES};\nexport const STAGE0_MUSIC_SEAM_SAMPLE_RATE = ${sampleRate};\nexport const STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS = ${CROSSFADE_FRAMES / sampleRate};\n`);
  const legacyFiles = [];
  for (const entry of await readdir(publicRoot)) if (/^(?:story-stage\d+|battle-stage\d+-(?:player|enemy)-(?:entry|loop)|story-stage0-loop-seamless|battle-stage0-(?:player|enemy)-loop-seamless)\.wav$/u.test(entry)) legacyFiles.push(path.join(publicRoot, entry));
  for (const directory of ["startup/audio", "credits", "ending/audio"]) {
    const target = path.join(publicRoot, directory);
    if (await pathExists(target)) for (const entry of await readdir(target)) if (entry.endsWith(".wav")) legacyFiles.push(path.join(target, entry));
  }
  await Promise.all(legacyFiles.map((file) => rm(file, { force: true })));
  console.log(`generated ${tracks.length} deduplicated OGG masters and ${seams.length} Stage 0 seamless loops`);
  console.log(`removed ${legacyFiles.length} duplicated music WAV assets`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
