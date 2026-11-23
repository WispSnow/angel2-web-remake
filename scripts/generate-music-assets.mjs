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
// Ogg Opus at 112 kbps (REMAKE-214): Opus always decodes at 48 kHz, so the 44.1 kHz masters are
// resampled on the way in. Same container as the earlier Vorbis q5 (~160 kbps), about a third smaller.
const CODEC = "opus";
const BITRATE_KBPS = 112;
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
  // bitexact: no encoder tag and a fixed stream serial, so a rerun writes the same bytes.
  const result = spawnSync("ffmpeg", [
    "-v", "error", "-y", "-i", inputPath, "-map_metadata", "-1",
    "-c:a", "libopus", "-b:a", `${BITRATE_KBPS}k`, "-vbr", "on", "-compression_level", "10",
    "-fflags", "+bitexact", "-flags:a", "+bitexact", "-serial_offset", String(serial & 0x7fffffff), "-f", "ogg", outputPath,
  ], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg libopus failed for ${inputPath}: ${result.stderr}`);
}

// A loop encoded as a plain file borders on silence at both ends: the 44.1 → 48 kHz resampler and the Opus
// encoder smear that silence into its first and last milliseconds, and the decoded loops jumped by up to
// −19.8 dBFS at the wrap where the Vorbis q5 files had stayed near −35 dBFS (S00-P, 2026-11-22). So each loop
// is encoded with LOOP_CONTEXT_FRAMES of its own tail in front and of its own head behind, and the Ogg stream
// is then cut back to exactly the loop: the front by raising OpusHead's pre-skip, the back by dropping the
// packets past the end and closing on a granule position that trims the rest (RFC 7845 §4.2, §4.5). The
// encoder needs about 300 ms to settle: with 100 ms of context the player loop still jumped by −29.2 dBFS,
// with 300 ms, 500 ms or 1 s by −33.7 to −33.8 dBFS. The player loop's start is an attack, so some jump stays.
const OPUS_SAMPLE_RATE = 48_000;
const LOOP_CONTEXT_FRAMES = 22_050; // 500 ms; exactly 24,000 samples once resampled to 48 kHz

function withLoopContext(wave, contextFrames) {
  const { channels, frames, samples } = wave;
  if (contextFrames * 2 >= frames) throw new Error(`loop of ${frames} frames is too short for ${contextFrames} frames of context`);
  const output = new Int16Array((frames + contextFrames * 2) * channels);
  output.set(samples.subarray((frames - contextFrames) * channels), 0);
  output.set(samples, contextFrames * channels);
  output.set(samples.subarray(0, contextFrames * channels), (frames + contextFrames) * channels);
  return { ...wave, frames: frames + contextFrames * 2, samples: output };
}

const OGG_CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index << 24;
  for (let bit = 0; bit < 8; bit += 1) value = value & 0x80000000 ? (value << 1) ^ 0x04c11db7 : value << 1;
  return value >>> 0;
});

function oggCrc(bytes) {
  let crc = 0;
  for (const byte of bytes) crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  return crc;
}

function readOggPackets(buffer) {
  const packets = [];
  let serial;
  let pending = [];
  for (let offset = 0; offset < buffer.length;) {
    if (buffer.toString("ascii", offset, offset + 4) !== "OggS") throw new Error(`expected an Ogg page at byte ${offset}`);
    serial ??= buffer.readUInt32LE(offset + 14);
    const segments = buffer[offset + 26];
    let body = offset + 27 + segments;
    for (let index = 0; index < segments; index += 1) {
      const size = buffer[offset + 27 + index];
      pending.push(buffer.subarray(body, body + size));
      body += size;
      if (size < 255) {
        packets.push(Buffer.concat(pending));
        pending = [];
      }
    }
    offset = body;
  }
  if (pending.length > 0) throw new Error("Ogg stream ends inside a packet");
  return { serial, packets };
}

/** Samples at 48 kHz in one Opus packet, from its TOC byte (RFC 6716 §3.1). */
function opusPacketSamples(packet) {
  const config = packet[0] >> 3;
  const frameSamples = config < 12 ? [480, 960, 1920, 2880][config & 3]
    : config < 16 ? [480, 960][config & 1]
      : [120, 240, 480, 960][config & 3];
  const code = packet[0] & 3;
  return frameSamples * (code === 0 ? 1 : code === 3 ? packet[1] & 0x3f : 2);
}

function oggPage(serial, sequence, flags, granule, packets) {
  const lacing = [];
  for (const packet of packets) {
    for (let left = packet.length; ; left -= 255) {
      lacing.push(Math.min(left, 255));
      if (left < 255) break;
    }
  }
  if (lacing.length > 255) throw new Error("Ogg page needs more than 255 lacing values");
  const header = Buffer.alloc(27 + lacing.length);
  header.write("OggS", 0, "ascii");
  header[5] = flags;
  header.writeBigUInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = lacing.length;
  Buffer.from(lacing).copy(header, 27);
  const page = Buffer.concat([header, ...packets]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

/** Drops `leadSamples` from the front of an Ogg Opus stream and keeps exactly `keepSamples` after them. */
function trimOggOpus(buffer, leadSamples, keepSamples) {
  const { serial, packets } = readOggPackets(buffer);
  const [head, tags, ...audio] = packets;
  if (head?.toString("ascii", 0, 8) !== "OpusHead" || tags?.toString("ascii", 0, 8) !== "OpusTags") throw new Error("expected an Ogg Opus stream");
  const opusHead = Buffer.from(head);
  const preSkip = opusHead.readUInt16LE(10) + leadSamples;
  if (preSkip > 0xffff) throw new Error(`pre-skip ${preSkip} does not fit OpusHead`);
  opusHead.writeUInt16LE(preSkip, 10);
  const end = preSkip + keepSamples;
  const kept = [];
  let decoded = 0;
  for (const packet of audio) {
    if (decoded >= end) break;
    kept.push(packet);
    decoded += opusPacketSamples(packet);
  }
  if (decoded < end) throw new Error(`Opus stream holds ${decoded} samples, ${end} needed`);
  const pages = [oggPage(serial, 0, 0x02, 0, [opusHead]), oggPage(serial, 1, 0, 0, [tags])];
  let page = [];
  let lacing = 0;
  let granule = 0;
  for (const [index, packet] of kept.entries()) {
    const packetLacing = Math.floor(packet.length / 255) + 1;
    if (page.length > 0 && (lacing + packetLacing > 255 || page.reduce((sum, item) => sum + opusPacketSamples(item), 0) >= OPUS_SAMPLE_RATE)) {
      pages.push(oggPage(serial, pages.length, 0, granule, page));
      page = [];
      lacing = 0;
    }
    page.push(packet);
    lacing += packetLacing;
    granule += opusPacketSamples(packet);
    if (index === kept.length - 1) pages.push(oggPage(serial, pages.length, 0x04, end, page));
  }
  return Buffer.concat(pages);
}

/** The decoded loop's wrap jump, measured on what a browser plays: ffmpeg's 48 kHz float decode. */
function decodedBoundaryMetrics(file, channels) {
  const result = spawnSync("ffmpeg", ["-nostdin", "-v", "error", "-i", file, "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${result.stderr}`);
  const samples = new Float32Array(result.stdout.buffer, result.stdout.byteOffset, result.stdout.length / 4);
  const frames = samples.length / channels;
  const deltas = Array.from({ length: channels }, (_, channel) => samples[channel] - samples[(frames - 1) * channels + channel]);
  const rms = Math.sqrt(deltas.reduce((sum, delta) => sum + delta * delta, 0) / deltas.length);
  return { frames, rmsDbfs: rms === 0 ? null : Number((20 * Math.log10(rms)).toFixed(3)) };
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
  const leadSamples = LOOP_CONTEXT_FRAMES * OPUS_SAMPLE_RATE / sourceWave.sampleRate;
  if (!Number.isInteger(leadSamples)) throw new Error(`${LOOP_CONTEXT_FRAMES} frames at ${sourceWave.sampleRate} Hz is not a whole number of Opus samples`);
  const encodedFrames = Math.round(seamlessWave.frames * OPUS_SAMPLE_RATE / sourceWave.sampleRate);
  const temporaryWave = path.join(temporaryRoot, `${id}.wav`);
  const temporaryOgg = path.join(temporaryRoot, `${id}.ogg`);
  const output = path.join(musicRoot, "generated", outputName);
  await writeFile(temporaryWave, encodePcm16Wave(withLoopContext(seamlessWave, LOOP_CONTEXT_FRAMES)));
  await mkdir(path.dirname(output), { recursive: true });
  encodeOgg(temporaryWave, temporaryOgg, serialFor(container, record, true));
  await writeFile(output, trimOggOpus(await readFile(temporaryOgg), leadSamples, encodedFrames));
  const outputBytes = await readFile(output);
  const encodedBoundary = decodedBoundaryMetrics(output, sourceWave.channels);
  if (encodedBoundary.frames !== encodedFrames) throw new Error(`${outputName} decodes to ${encodedBoundary.frames} frames, ${encodedFrames} expected`);
  return { id, source: path.relative(root, sourcePath), output: path.relative(root, output), sourceSha256: sha256(sourceBytes), outputSha256: sha256(outputBytes), sampleRate: sourceWave.sampleRate, channels: sourceWave.channels, sourceFrames: sourceWave.frames, outputFrames: seamlessWave.frames, crossfadeFrames: CROSSFADE_FRAMES, crossfadeMilliseconds: Number((CROSSFADE_FRAMES * 1000 / sourceWave.sampleRate).toFixed(6)), sourceBoundary: boundaryMetrics(sourceWave), outputBoundary: boundaryMetrics(seamlessWave), encodedFrames, encodedBoundary: { rmsDbfs: encodedBoundary.rmsDbfs } };
}

const encoderVersion = spawnSync("ffmpeg", ["-hide_banner", "-version"], { encoding: "utf8" }).stdout?.trim().split("\n")[0] ?? "";
if (!encoderVersion) throw new Error("ffmpeg with libopus is required to generate development music assets");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "angel2-music-"));
try {
  const tracks = [];
  for (const source of await collectSourceTracks()) tracks.push(await generateOgg(source));
  const seams = [
    await generateSeamless("story-stage0", "MAGIC", 73, "stage0-story-seamless.ogg", temporaryRoot),
    await generateSeamless("battle-stage0-player-loop", "MUSIC", 6, "stage0-player-seamless.ogg", temporaryRoot),
    await generateSeamless("battle-stage0-enemy-loop", "MUSIC", 4, "stage0-enemy-seamless.ogg", temporaryRoot),
  ];
  await writeFile(path.join(musicRoot, "music-manifest.json"), `${JSON.stringify({ format: "ANGEL2 deduplicated music assets", version: 2, codec: CODEC, encoder: "ffmpeg libopus", encoderVersion, bitrateKbps: BITRATE_KBPS, tracks }, null, 2)}\n`);
  await writeFile(path.join(publicRoot, "stage0-music-seams.json"), `${JSON.stringify({ format: "ANGEL2 stage-0 seamless music loops", version: 3, algorithm: "periodic-linear-overlap-add", encoding: { codec: CODEC, bitrateKbps: BITRATE_KBPS, sampleRate: OPUS_SAMPLE_RATE, loopContextFrames: LOOP_CONTEXT_FRAMES }, tracks: seams }, null, 2)}\n`);
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
  console.log(`generated ${tracks.length} deduplicated Ogg Opus masters and ${seams.length} Stage 0 seamless loops`);
  console.log(`removed ${legacyFiles.length} duplicated music WAV assets`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
