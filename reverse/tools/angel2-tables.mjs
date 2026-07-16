#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_RECORDS = 39;
const DATA_RECORD_BYTES = 70;
const DATA_TIERS = 5;
const DATA_FIELDS_PER_TIER = 7;
const MAP_RECORDS = 39;
const MAP_RECORD_BYTES = 96;
const MAP_SERIALIZED_WORDS_PER_TABLE = 24;
const MAP_LOGICAL_TERRAIN_SLOTS = 23;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseData(buffer, fileName = "DATA.SWF") {
  if (buffer.length !== DATA_RECORDS * DATA_RECORD_BYTES) {
    throw new Error(`${fileName}: expected ${DATA_RECORDS * DATA_RECORD_BYTES} bytes`);
  }
  return Array.from({ length: DATA_RECORDS }, (_, record) => ({
    record,
    offset: record * DATA_RECORD_BYTES,
    tiers: Array.from({ length: DATA_TIERS }, (_, tier) => ({
      tier,
      values: Array.from({ length: DATA_FIELDS_PER_TIER }, (_, field) =>
        buffer.readUInt16LE(
          record * DATA_RECORD_BYTES +
          (tier * DATA_FIELDS_PER_TIER + field) * 2,
        )),
    })),
  }));
}

function parseMap(buffer, fileName = "MAP.SWF") {
  if (buffer.length !== MAP_RECORDS * MAP_RECORD_BYTES) {
    throw new Error(`${fileName}: expected ${MAP_RECORDS * MAP_RECORD_BYTES} bytes`);
  }
  return Array.from({ length: MAP_RECORDS }, (_, record) => {
    const base = record * MAP_RECORD_BYTES;
    return {
      record,
      offset: base,
      movementWindow: Array.from({ length: MAP_SERIALIZED_WORDS_PER_TABLE }, (_, index) =>
        buffer.readUInt16LE(base + index * 2)),
      terrainDefenseWindow: Array.from(
        { length: MAP_SERIALIZED_WORDS_PER_TABLE },
        (_, index) => buffer.readUInt16LE(
          base + (MAP_SERIALIZED_WORDS_PER_TABLE + index) * 2,
        ),
      ),
    };
  }).map((record) => ({
    ...record,
    movementRules: record.movementWindow.slice(0, MAP_LOGICAL_TERRAIN_SLOTS),
    movementOverlapWord: record.movementWindow[MAP_LOGICAL_TERRAIN_SLOTS],
    terrainDefensePercents: record.terrainDefenseWindow.slice(
      0,
      MAP_LOGICAL_TERRAIN_SLOTS,
    ),
    terrainDefenseOverlapWord:
      record.terrainDefenseWindow[MAP_LOGICAL_TERRAIN_SLOTS],
  }));
}

function csv(rows) {
  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}

async function exportTables(inputDirectory, outputDirectory) {
  const dataBuffer = await readFile(path.join(inputDirectory, "DATA.SWF"));
  const mapBuffer = await readFile(path.join(inputDirectory, "MAP.SWF"));
  const dataRecords = parseData(dataBuffer);
  const mapRecords = parseMap(mapBuffer);
  await mkdir(outputDirectory, { recursive: true });

  await writeFile(
    path.join(outputDirectory, "DATA.json"),
    `${JSON.stringify({
      format: "39 records x 5 tiers x 7 little-endian uint16 fields",
      fieldSemantics: "unassigned; preserve field0 through field6 until native access evidence is recorded",
      records: dataRecords,
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDirectory, "DATA.csv"),
    csv([
      ["record", "tier", ...Array.from({ length: 7 }, (_, index) => `field${index}`)],
      ...dataRecords.flatMap((record) => record.tiers.map((tier) =>
        [record.record, tier.tier, ...tier.values])),
    ]),
  );
  await writeFile(
    path.join(outputDirectory, "MAP.json"),
    `${JSON.stringify({
      format: "39 records x (24-word movement window + 24-word terrain-defense window), little-endian uint16",
      semantics: "each serialized 24-word window copies a 23-word logical terrain profile plus the following overlapped runtime word; movement and defense roles are native-code confirmed",
      logicalTerrainSlots: MAP_LOGICAL_TERRAIN_SLOTS,
      serializedWordsPerWindow: MAP_SERIALIZED_WORDS_PER_TABLE,
      records: mapRecords,
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDirectory, "MAP.csv"),
    csv([
      ["record", "table", ...Array.from({ length: 24 }, (_, index) => `slot${index}`)],
      ...mapRecords.flatMap((record) => [
        [record.record, "movementWindow", ...record.movementWindow],
        [record.record, "terrainDefenseWindow", ...record.terrainDefenseWindow],
      ]),
    ]),
  );
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify({
      data: {
        source: "DATA.SWF",
        sha256: sha256(dataBuffer),
        bytes: dataBuffer.length,
        records: dataRecords.length,
        recordBytes: DATA_RECORD_BYTES,
      },
      map: {
        source: "MAP.SWF",
        sha256: sha256(mapBuffer),
        bytes: mapBuffer.length,
        records: mapRecords.length,
        recordBytes: MAP_RECORD_BYTES,
        logicalTerrainSlots: MAP_LOGICAL_TERRAIN_SLOTS,
        serializedWordsPerWindow: MAP_SERIALIZED_WORDS_PER_TABLE,
      },
    }, null, 2)}\n`,
  );
  console.log(`exported ${dataRecords.length} DATA and ${mapRecords.length} MAP records`);
}

function usage() {
  return "usage: angel2-tables.mjs --export ANGEL2_DIR OUTPUT_DIR";
}

async function main() {
  const [command, inputDirectory, outputDirectory] = process.argv.slice(2);
  if (command !== "--export" || outputDirectory === undefined) {
    throw new Error(usage());
  }
  await exportTables(inputDirectory, outputDirectory);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { exportTables, parseData, parseMap };
