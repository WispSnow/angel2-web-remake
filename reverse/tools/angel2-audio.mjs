#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

function classify(buffer) {
  if (buffer.subarray(0, 20).toString("binary") === "Creative Voice File\x1a") {
    return "creative_voice";
  }
  if (buffer.length >= 2 && buffer[0] === 0xaa && buffer[1] === 0x55) {
    return "softstar_rix";
  }
  if (buffer.equals(Buffer.from([0x0d, 0x0a, 0x1a]))) {
    return "placeholder";
  }
  return "other";
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function probe(fileName) {
  const { stdout } = await execFile("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_name,sample_rate,channels",
    "-of", "json",
    fileName,
  ]);
  const result = JSON.parse(stdout);
  const stream = result.streams?.[0] ?? {};
  return {
    codec: stream.codec_name ?? null,
    sampleRate: stream.sample_rate === undefined ? null : Number(stream.sample_rate),
    channels: stream.channels ?? null,
    durationSeconds: result.format?.duration === undefined
      ? null
      : Number(result.format.duration),
  };
}

async function mapLimited(items, concurrency, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function convertRoot(inputRoot, outputRoot) {
  const groups = (await readdir(inputRoot)).sort();
  const records = [];

  for (const group of groups) {
    const groupDirectory = path.join(inputRoot, group);
    let sourceManifest;
    try {
      sourceManifest = JSON.parse(
        await readFile(path.join(groupDirectory, "manifest.json"), "utf8"),
      );
    }
    catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    for (const record of sourceManifest.records) {
      if (record.missing || record.terminator) {
        continue;
      }
      const stem = record.index.toString().padStart(4, "0");
      const input = path.join(groupDirectory, `${stem}.bin`);
      const payload = await readFile(input);
      const kind = classify(payload);
      if (kind === "creative_voice" || kind === "softstar_rix") {
        records.push({
          group,
          record: record.index,
          stem,
          input,
          source: path.relative(inputRoot, input),
          sourceBytes: payload.length,
          sourceSha256: sha256(payload),
          kind,
        });
      }
    }
  }

  const converted = await mapLimited(records, 8, async (record) => {
    if (record.kind === "creative_voice") {
      const relativeOutput = path.join("wav", record.group, `${record.stem}.wav`);
      const output = path.join(outputRoot, relativeOutput);
      await mkdir(path.dirname(output), { recursive: true });
      await execFile("ffmpeg", [
        "-y", "-v", "error", "-i", record.input,
        "-map_metadata", "-1", "-c:a", "pcm_s16le", output,
      ]);
      return {
        ...record,
        output: relativeOutput,
        ...(await probe(output)),
      };
    }

    const relativeRawOutput = path.join("rix", record.group, `${record.stem}.rix`);
    const rawOutput = path.join(outputRoot, relativeRawOutput);
    const relativeWavOutput = path.join("rix-wav", record.group, `${record.stem}.wav`);
    const wavOutput = path.join(outputRoot, relativeWavOutput);
    await mkdir(path.dirname(rawOutput), { recursive: true });
    await mkdir(path.dirname(wavOutput), { recursive: true });
    await copyFile(record.input, rawOutput);
    try {
      await execFile("adplay", [
        "-q", "-O", "disk", "-d", wavOutput, "-o", rawOutput,
      ]);
      return {
        ...record,
        rawOutput: relativeRawOutput,
        output: relativeWavOutput,
        ...(await probe(wavOutput)),
      };
    }
    catch (error) {
      return {
        ...record,
        rawOutput: relativeRawOutput,
        output: null,
        decodeError: error.stderr?.trim() || error.message,
      };
    }
  });

  const voc = converted.filter((record) => record.kind === "creative_voice");
  const rix = converted.filter((record) => record.kind === "softstar_rix");
  const decodedRix = rix.filter((record) => record.output !== null);
  const manifest = {
    format: "ANGEL2 extracted audio inventory",
    sourceRoot: inputRoot,
    creativeVoiceRecords: voc.length,
    softstarRixRecords: rix.length,
    decodedRixRecords: decodedRix.length,
    creativeVoiceWavDurationSeconds: voc.reduce(
      (total, record) => total + (record.durationSeconds ?? 0),
      0,
    ),
    rixWavDurationSeconds: decodedRix.reduce(
      (total, record) => total + (record.durationSeconds ?? 0),
      0,
    ),
    entries: converted.map(({ input, stem, ...record }) => record),
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `converted ${manifest.creativeVoiceRecords} VOC records to WAV; ` +
    `decoded ${manifest.decodedRixRecords}/${manifest.softstarRixRecords} RIX records`,
  );
  console.log(
    `decoded WAV durations: VOC ${manifest.creativeVoiceWavDurationSeconds.toFixed(3)}s, ` +
    `RIX ${manifest.rixWavDurationSeconds.toFixed(3)}s`,
  );
}

function usage() {
  return "usage: angel2-audio.mjs --convert-root EXTRACTED_ROOT OUTPUT_DIR";
}

async function main() {
  const [command, inputRoot, outputRoot] = process.argv.slice(2);
  if (command !== "--convert-root" || outputRoot === undefined) {
    throw new Error(usage());
  }
  await convertRoot(inputRoot, outputRoot);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { classify, convertRoot };
