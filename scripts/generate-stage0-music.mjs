#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public/assets/original");
const generatedModule = path.join(root, "src/game/content/stage0-music.generated.ts");
const CROSSFADE_FRAMES = 1024;

const tracks = [
  {
    id: "story-stage0",
    source: "reverse/converted/audio/rix-wav/MAGIC/0073.wav",
    publishedSource: "public/assets/original/story-stage0.wav",
    output: "public/assets/original/story-stage0-loop-seamless.wav",
  },
  {
    id: "battle-stage0-player-loop",
    source: "reverse/converted/audio/rix-wav/MUSIC/0006.wav",
    publishedSource: "public/assets/original/battle-stage0-player-loop.wav",
    output: "public/assets/original/battle-stage0-player-loop-seamless.wav",
  },
  {
    id: "battle-stage0-enemy-loop",
    source: "reverse/converted/audio/rix-wav/MUSIC/0004.wav",
    publishedSource: "public/assets/original/battle-stage0-enemy-loop.wav",
    output: "public/assets/original/battle-stage0-enemy-loop-seamless.wav",
  },
];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function parsePcm16Wave(buffer, fileName) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${fileName}: expected a RIFF/WAVE file`);
  }

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
    }
    else if (id === "data") data = buffer.subarray(body, body + size);
    offset = body + size + (size & 1);
  }

  if (!format || !data) throw new Error(`${fileName}: missing fmt or data chunk`);
  if (format.audioFormat !== 1 || format.bitsPerSample !== 16) {
    throw new Error(`${fileName}: expected uncompressed signed 16-bit PCM`);
  }
  if (format.channels < 1 || format.channels > 2) {
    throw new Error(`${fileName}: expected mono or stereo PCM`);
  }
  if (format.blockAlign !== format.channels * 2
    || format.byteRate !== format.sampleRate * format.blockAlign
    || data.length % format.blockAlign !== 0) {
    throw new Error(`${fileName}: inconsistent PCM format fields`);
  }

  const sampleCount = data.length / 2;
  const samples = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = data.readInt16LE(index * 2);
  }
  return {
    ...format,
    frames: data.length / format.blockAlign,
    samples,
  };
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
  for (let index = 0; index < wave.samples.length; index += 1) {
    output.writeInt16LE(wave.samples[index], 44 + index * 2);
  }
  return output;
}

function createSeamlessLoop(wave, crossfadeFrames) {
  if (crossfadeFrames < 2 || crossfadeFrames * 2 >= wave.frames) {
    throw new Error(`invalid ${crossfadeFrames}-frame crossfade for ${wave.frames}-frame track`);
  }

  // Repeating the source every (frames - crossfadeFrames) frames and overlap-adding
  // its tail into its head produces a genuinely periodic signal. Rotate that one
  // period so the file boundary remains an untouched pair of adjacent source
  // samples; the actual tail-to-head blend then lives safely inside the file.
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
  output.set(
    wave.samples.subarray(
      crossfadeFrames * wave.channels,
      outputFrames * wave.channels,
    ),
    crossfadeFrames * wave.channels,
  );
  return {
    channels: wave.channels,
    sampleRate: wave.sampleRate,
    frames: outputFrames,
    samples: output,
  };
}

function boundaryMetrics(wave) {
  const deltas = [];
  for (let channel = 0; channel < wave.channels; channel += 1) {
    const first = wave.samples[channel];
    const last = wave.samples[(wave.frames - 1) * wave.channels + channel];
    deltas.push(first - last);
  }
  const rms = Math.sqrt(deltas.reduce((sum, delta) => sum + delta * delta, 0) / deltas.length);
  return {
    channelDeltas: deltas,
    rms: Number(rms.toFixed(3)),
    rmsDbfs: rms === 0 ? null : Number((20 * Math.log10(rms / 32768)).toFixed(3)),
  };
}

async function generateTrack(track) {
  const sourcePath = path.join(root, track.source);
  const publishedSourcePath = path.join(root, track.publishedSource);
  const sourceBuffer = await readFile(sourcePath);
  const publishedSourceBuffer = await readFile(publishedSourcePath);
  const sourceHash = sha256(sourceBuffer);
  const publishedSourceHash = sha256(publishedSourceBuffer);
  if (sourceHash !== publishedSourceHash) {
    throw new Error(`${track.id}: published source does not match the converted RIX evidence`);
  }

  const sourceWave = parsePcm16Wave(sourceBuffer, track.source);
  const seamlessWave = createSeamlessLoop(sourceWave, CROSSFADE_FRAMES);
  const outputBuffer = encodePcm16Wave(seamlessWave);
  await mkdir(path.dirname(path.join(root, track.output)), { recursive: true });
  await writeFile(path.join(root, track.output), outputBuffer);
  return {
    id: track.id,
    source: track.source,
    publishedSource: track.publishedSource,
    output: track.output,
    sourceSha256: sourceHash,
    outputSha256: sha256(outputBuffer),
    sampleRate: sourceWave.sampleRate,
    channels: sourceWave.channels,
    sourceFrames: sourceWave.frames,
    outputFrames: seamlessWave.frames,
    crossfadeFrames: CROSSFADE_FRAMES,
    crossfadeMilliseconds: Number((CROSSFADE_FRAMES * 1000 / sourceWave.sampleRate).toFixed(6)),
    sourceBoundary: boundaryMetrics(sourceWave),
    outputBoundary: boundaryMetrics(seamlessWave),
  };
}

const generated = [];
for (const track of tracks) generated.push(await generateTrack(track));
const manifest = {
  format: "ANGEL2 stage-0 seamless music loops",
  version: 1,
  algorithm: "periodic-linear-overlap-add",
  tracks: generated,
};
await writeFile(
  path.join(publicRoot, "stage0-music-seams.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
const sampleRates = new Set(generated.map((track) => track.sampleRate));
if (sampleRates.size !== 1) throw new Error("stage-0 music sources must share one sample rate");
const [sampleRate] = sampleRates;
await writeFile(
  generatedModule,
  `// Generated by scripts/generate-stage0-music.mjs; do not edit by hand.\n`
  + `export const STAGE0_MUSIC_SEAM_CROSSFADE_FRAMES = ${CROSSFADE_FRAMES};\n`
  + `export const STAGE0_MUSIC_SEAM_SAMPLE_RATE = ${sampleRate};\n`
  + `export const STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS = `
  + `${CROSSFADE_FRAMES / sampleRate};\n`,
);
for (const track of generated) {
  console.log(
    `${track.id}: ${track.sourceFrames} -> ${track.outputFrames} frames, `
    + `${track.crossfadeMilliseconds} ms crossfade, `
    + `${track.sourceBoundary.rmsDbfs} -> ${track.outputBoundary.rmsDbfs} dBFS boundary jump`,
  );
}
