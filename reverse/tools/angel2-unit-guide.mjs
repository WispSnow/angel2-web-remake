#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TIERS = 5;
const FIELDS = 7;

const PROMOTION_GRAPH = [
  ["士兵", ["騎兵", "戰士", "弓兵", "修女"]],
  ["騎兵", ["陸戰騎士", "飛馬騎士"]],
  ["陸戰騎士", ["迅龍騎士", "獸騎士", "獸骨騎士", "巨龍騎士"]],
  ["飛馬騎士", ["飛龍騎士", "妖龍騎士"]],
  ["戰士", ["神劍戰士", "鋼甲戰士"]],
  ["神劍戰士", ["巨斧戰士", "魔劍戰士", "邪劍戰士"]],
  ["鋼甲戰士", ["叢林戰士", "魔鎧戰士"]],
  ["弓兵", ["弩兵", "魔弓兵"]],
  ["修女", ["僧侶", "祭司", "魔術士"]],
  ["僧侶", ["祈導帥", "魔導帥"]],
  ["祭司", ["魔祭司", "咒術帥"]],
  ["魔術士", ["邪法帥", "魔法帥", "巫帥"]],
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function storedHexToUint16(text) {
  const bytes = Buffer.from(text, "hex");
  if (bytes.length !== 2) {
    throw new Error(`expected two stored bytes, got ${text}`);
  }
  return bytes.readUInt16LE(0);
}

function parseGuide(buffer, fileName = "修改.txt") {
  const text = buffer.toString("utf8").replaceAll("\r\n", "\n");
  const lines = text.split("\n");
  const tableStart = lines.findIndex((line) => line.includes("DATA.SWF 列表"));
  const tableEnd = lines.findIndex((line) => line.includes("升級表"));
  if (tableStart < 0 || tableEnd <= tableStart) {
    throw new Error(`${fileName}: DATA table or promotion-table marker not found`);
  }

  const sections = [];
  let section = null;
  const hexMismatches = [];
  for (let index = tableStart + 1; index < tableEnd; index += 1) {
    const line = lines[index];
    const heading = line.match(/^【(.+)】\s*$/);
    if (heading !== null) {
      section = { name: heading[1], line: index + 1, rows: [] };
      sections.push(section);
      continue;
    }
    const tokens = line.trim().split(/\s+/);
    if (
      section === null || tokens.length !== FIELDS * 2 ||
      !tokens.slice(0, FIELDS).every((token) => /^\d+$/.test(token)) ||
      !tokens.slice(FIELDS).every((token) => /^[0-9A-Fa-f]{4}$/.test(token))
    ) {
      continue;
    }
    const values = tokens.slice(0, FIELDS).map((token) => Number.parseInt(token, 10));
    const storedHex = tokens.slice(FIELDS).map((token) => token.toUpperCase());
    const hexValues = storedHex.map(storedHexToUint16);
    for (let field = 0; field < FIELDS; field += 1) {
      if (values[field] !== hexValues[field]) {
        hexMismatches.push({ line: index + 1, field, decimal: values[field], storedHex: storedHex[field], decoded: hexValues[field] });
      }
    }
    section.rows.push({ line: index + 1, values, storedHex });
  }

  const records = [];
  const extraRows = [];
  for (const item of sections) {
    if (item.name !== "????") {
      if (item.rows.length !== TIERS) {
        throw new Error(`${fileName}:${item.line}: ${item.name} has ${item.rows.length} rows, expected 5`);
      }
      records.push({ record: records.length, name: item.name, sourceHeading: item.name, tiers: item.rows });
      continue;
    }
    const completeRecords = Math.floor(item.rows.length / TIERS);
    for (let group = 0; group < completeRecords && records.length < 39; group += 1) {
      records.push({
        record: records.length,
        name: null,
        sourceHeading: "????",
        unknownGroup: group,
        tiers: item.rows.slice(group * TIERS, (group + 1) * TIERS),
      });
    }
    extraRows.push(...item.rows.slice(completeRecords * TIERS));
  }
  if (records.length !== 39) {
    throw new Error(`${fileName}: parsed ${records.length} records, expected 39`);
  }

  return {
    sourceFile: fileName,
    sourceBytes: buffer.length,
    sourceSha256: sha256(buffer),
    sourceRole: "untrusted_external_modification_guide",
    tableLines: { start: tableStart + 1, end: tableEnd + 1 },
    records,
    extraRows,
    decimalStoredHexMismatches: hexMismatches,
  };
}

function compareGuide(guide, dataJson) {
  if (!Array.isArray(dataJson.records) || dataJson.records.length !== 39) {
    throw new Error("DATA JSON does not contain 39 records");
  }
  const fieldStats = Array.from({ length: FIELDS }, (_, field) => ({
    field,
    values: 39 * TIERS,
    exactMatches: 0,
    floorOriginalDiv50Matches: 0,
    differences: [],
  }));
  for (let record = 0; record < 39; record += 1) {
    for (let tier = 0; tier < TIERS; tier += 1) {
      const guideValues = guide.records[record].tiers[tier].values;
      const originalValues = dataJson.records[record].tiers[tier].values;
      for (let field = 0; field < FIELDS; field += 1) {
        const stats = fieldStats[field];
        const external = guideValues[field];
        const original = originalValues[field];
        if (external === original) stats.exactMatches += 1;
        if (external === Math.floor(original / 50)) stats.floorOriginalDiv50Matches += 1;
        if (external !== original) {
          stats.differences.push({ record, tier, original, external });
        }
      }
    }
  }

  const recordByName = new Map(
    guide.records.filter((record) => record.name !== null).map((record) => [record.name, record.record]),
  );
  const promotions = [];
  for (const [sourceName, targetNames] of PROMOTION_GRAPH) {
    const sourceRecord = recordByName.get(sourceName);
    if (sourceRecord === undefined) {
      throw new Error(`promotion source is absent from guide table: ${sourceName}`);
    }
    const promotionTier = dataJson.records[sourceRecord].tiers[3];
    for (const targetName of targetNames) {
      const targetRecord = recordByName.get(targetName);
      if (targetRecord === undefined) {
        throw new Error(`promotion target is absent from guide table: ${targetName}`);
      }
      const targetStart = dataJson.records[targetRecord].tiers[0];
      promotions.push({
        sourceName,
        sourceRecord,
        targetName,
        targetRecord,
        promotionLevel: promotionTier.values[6],
        sourceThreshold: promotionTier.values[0],
        targetStartLevel: targetStart.values[6],
        levelBoundaryMatches: promotionTier.values[6] === targetStart.values[6],
      });
    }
  }
  const matchingLevelBoundaryEdges = promotions.filter((edge) => edge.levelBoundaryMatches).length;
  const levelBoundaryExceptions = promotions.filter((edge) => !edge.levelBoundaryMatches);

  return {
    sourceAssessment: {
      numericTable: "modified_copy_of_original_DATA",
      unitNames: "externally_supplied_mapping_requiring_native_confirmation",
      promotionGraph: "manual_transcription_of_external_ascii_diagram_requiring_native_confirmation",
    },
    fieldStats,
    confirmedModification: {
      field: 0,
      operation: "external = floor(original / 50)",
      matchingValues: fieldStats[0].floorOriginalDiv50Matches,
      totalValues: fieldStats[0].values,
      exactForWholeTable: fieldStats[0].floorOriginalDiv50Matches === fieldStats[0].values,
    },
    unchangedFields: fieldStats.slice(1).map((stats) => ({
      field: stats.field,
      exactMatches: stats.exactMatches,
      totalValues: stats.values,
      exactForWholeTable: stats.exactMatches === stats.values,
    })),
    namedRecords: guide.records.filter((record) => record.name !== null).map((record) => ({ record: record.record, name: record.name })),
    unnamedRecords: guide.records.filter((record) => record.name === null).map((record) => record.record),
    promotions: {
      sourceLines: "修改.txt:254-269",
      edges: promotions.length,
      matchingLevelBoundaryEdges,
      levelBoundaryExceptions,
      allLevelBoundariesMatch: promotions.every((edge) => edge.levelBoundaryMatches),
      entries: promotions,
    },
  };
}

function usage() {
  return "usage: angel2-unit-guide.mjs --compare GUIDE.txt DATA.json OUTPUT.json";
}

async function main() {
  const [command, guideFile, dataFile, outputFile] = process.argv.slice(2);
  if (command !== "--compare" || outputFile === undefined) {
    throw new Error(usage());
  }
  const guide = parseGuide(await readFile(guideFile), guideFile);
  const dataJson = JSON.parse(await readFile(dataFile, "utf8"));
  const comparison = compareGuide(guide, dataJson);
  const output = { format: "ANGEL2 external unit-guide validation", guide, comparison };
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    namedRecords: comparison.namedRecords.length,
    unnamedRecords: comparison.unnamedRecords,
    decimalStoredHexMismatches: guide.decimalStoredHexMismatches.length,
    field0Transform: comparison.confirmedModification,
    unchangedFields: comparison.unchangedFields,
    promotionEdges: comparison.promotions.edges,
    matchingPromotionLevelBoundaries: comparison.promotions.matchingLevelBoundaryEdges,
    promotionLevelBoundaryExceptions: comparison.promotions.levelBoundaryExceptions,
    extraGuideRows: guide.extraRows.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { compareGuide, parseGuide, storedHexToUint16 };
