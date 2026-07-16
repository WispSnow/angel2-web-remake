#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_SEGMENT = 0x1eba;
const DATA_LINEAR_BASE = DATA_SEGMENT * 16;
const DESCRIPTOR_TABLES = [
  { id: "set1", role: "side1", offset: 0x320d },
  { id: "set2", role: "side2", offset: 0x325d },
];
const RECORD_COUNT = 39;
const DISPLAY_NAME_TERMINATOR = 0x24;
const CODE_SIGNATURES = [
  { address: "0000:5087", offset: 0x5087, hex: "c706c9310000ba590003db3c01740e3c02743e25ff00a3c931ba4e00c32ec706af51d0452ec706b151da562ec706ad51" },
  { address: "0000:5230", offset: 0x5230, hex: "8b1e8c3183fb277203bb260003db833ec931017407833ec9310274058b9f0d32c38b9f5d32" },
  { address: "0000:22B8", offset: 0x22b8, hex: "8b0e8c31e889308b14bb00008b871c1f3bc2740583c304ebf383c3028bb71c1f89364915c3" },
  { address: "0000:22DD", offset: 0x22dd, hex: "8b0e8c31e864308b14bb00008b87ba263bc2740583c304ebf383c3028bb7ba2689364b15c3" },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function checkedOffset(buffer, dsOffset, bytes, label) {
  const linear = DATA_LINEAR_BASE + dsOffset;
  if (linear < 0 || linear + bytes > buffer.length) {
    throw new Error(
      `${label}: DS:${hex(dsOffset)} maps outside ${buffer.length}-byte image`,
    );
  }
  return linear;
}

function validateCodeSignatures(buffer) {
  return CODE_SIGNATURES.map((signature) => {
    const expected = Buffer.from(signature.hex, "hex");
    const actual = buffer.subarray(signature.offset, signature.offset + expected.length);
    if (!actual.equals(expected)) {
      throw new Error(`${signature.address}: unit-descriptor code signature mismatch`);
    }
    return {
      address: signature.address,
      fileOffset: signature.offset,
      bytes: expected.length,
      sha256: sha256(expected),
    };
  });
}

function readDollarTerminatedBig5(buffer, dsOffset, label) {
  const start = checkedOffset(buffer, dsOffset, 1, label);
  let end = start;
  while (end < buffer.length && buffer[end] !== DISPLAY_NAME_TERMINATOR) end++;
  if (end === buffer.length) throw new Error(`${label}: missing '$' terminator`);
  const raw = buffer.subarray(start, end);
  const displayName = new TextDecoder("big5", { fatal: true }).decode(raw);
  return {
    displayName,
    normalizedName: displayName.replaceAll(" ", ""),
    big5Hex: raw.toString("hex").toUpperCase(),
    bytes: raw.length,
  };
}

function readDescriptor(buffer, table, record) {
  const tableLinear = checkedOffset(
    buffer,
    table.offset + record * 2,
    2,
    `${table.id} pointer ${record}`,
  );
  const descriptorOffset = buffer.readUInt16LE(tableLinear);
  const descriptorLinear = checkedOffset(
    buffer,
    descriptorOffset,
    18,
    `${table.id} descriptor ${record}`,
  );
  const nameOffset = buffer.readUInt16LE(descriptorLinear + 2);
  const name = readDollarTerminatedBig5(
    buffer,
    nameOffset,
    `${table.id} name ${record}`,
  );
  return {
    set: table.id,
    descriptorOffset,
    descriptorAddress: `${hex(DATA_SEGMENT)}:${hex(descriptorOffset)}`,
    code: buffer.subarray(descriptorLinear, descriptorLinear + 2).toString("ascii"),
    displayNameOffset: nameOffset,
    displayNameAddress: `${hex(DATA_SEGMENT)}:${hex(nameOffset)}`,
    displayName: name.displayName,
    normalizedName: name.normalizedName,
    displayNameBig5Hex: name.big5Hex,
    displayNameBytes: name.bytes,
    unknownPointer04: buffer.readUInt16LE(descriptorLinear + 4),
    statRowPointers: Array.from(
      { length: 5 },
      (_, index) => buffer.readUInt16LE(descriptorLinear + 6 + index * 2),
    ),
    unknownPointer10: buffer.readUInt16LE(descriptorLinear + 16),
  };
}

async function compareGuide(nativeRecords, guideComparisonPath) {
  if (guideComparisonPath === undefined) return null;
  const guide = JSON.parse(await readFile(guideComparisonPath, "utf8"));
  const guideRecords = guide?.guide?.records;
  if (!Array.isArray(guideRecords)) {
    throw new Error(`${guideComparisonPath}: missing guide.records`);
  }
  const comparisons = guideRecords.slice(0, 35).map((record, index) => {
    const nativeName = nativeRecords[index]?.normalizedName;
    const suffixNormalizedName = record.name.replaceAll("帥", "師");
    return {
      record: index,
      externalName: record.name,
      suffixNormalizedName,
      nativeName,
      exactMatch: record.name === nativeName,
      suffixNormalizedMatch: suffixNormalizedName === nativeName,
    };
  });
  return {
    source: guideComparisonPath,
    comparedRecords: comparisons.length,
    exactMatches: comparisons.filter((entry) => entry.exactMatch).length,
    suffixNormalizedMatches: comparisons.filter(
      (entry) => entry.suffixNormalizedMatch,
    ).length,
    rawDifferences: comparisons.filter((entry) => !entry.exactMatch),
    substantiveDifferences: comparisons.filter(
      (entry) => !entry.suffixNormalizedMatch,
    ),
  };
}

async function extract(inputPath, outputPath, guideComparisonPath) {
  const buffer = await readFile(inputPath);
  const records = Array.from({ length: RECORD_COUNT }, (_, record) => {
    const descriptors = DESCRIPTOR_TABLES.map((table) =>
      readDescriptor(buffer, table, record),
    );
    const names = [...new Set(descriptors.map((entry) => entry.normalizedName))];
    const codes = [...new Set(descriptors.map((entry) => entry.code))];
    return {
      record,
      normalizedName: names.length === 1 ? names[0] : null,
      nameAgreement: names.length === 1,
      codeAgreement: codes.length === 1,
      codeVariants: codes,
      descriptors,
    };
  });
  if (records.some((record) => !record.nameAgreement)) {
    throw new Error("descriptor sets disagree on one or more display names");
  }

  const guideComparison = await compareGuide(records, guideComparisonPath);
  const result = {
    format: "ANGEL2 module 29 native unit descriptor names",
    source: inputPath,
    sourceBytes: buffer.length,
    sourceSha256: sha256(buffer),
    dataSegment: DATA_SEGMENT,
    dataLinearBase: DATA_LINEAR_BASE,
    descriptorTables: DESCRIPTOR_TABLES,
    runtimeRoles: {
      selector: "0000:5087 sets DS:31C9 to 1 for side 1 and 2 for side 2; 0000:5230 then selects set1/DS:320D or set2/DS:325D respectively",
      set1: "side-1 unit descriptor table",
      set2: "side-2 unit descriptor table",
      sharedDataRows: "both descriptor sets use identical display names and DATA row pointers for all 39 records",
      mapProfileSerialization: "0000:22B8 and 0000:22DD call 0000:5348 but intentionally compare the code read through SI, the set1 descriptor, for both serialized MAP profile families",
      steelArmorQuirk: "record 29 is code 1C in set1/side1 but 0C in set2/side2; a side-2 Steel Armor therefore dispatches and grows under code 0C, while MAP movement/terrain profiles are still selected through set1 code 1C",
    },
    recordCount: RECORD_COUNT,
    nameAgreementRecords: records.filter((record) => record.nameAgreement).length,
    codeAgreementRecords: records.filter((record) => record.codeAgreement).length,
    guideComparison,
    verifiedCodeSignatures: validateCodeSignatures(buffer),
    records,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted ${result.recordCount} native unit names; ` +
      `${result.nameAgreementRecords}/39 name agreement, ` +
      `${result.codeAgreementRecords}/39 code agreement`,
  );
  return result;
}

function usage() {
  return (
    "usage: angel2-unit-descriptors.mjs --extract MODULE29_RAW OUTPUT_JSON " +
    "[UNIT_GUIDE_COMPARISON_JSON]"
  );
}

async function main() {
  const [command, inputPath, outputPath, guideComparisonPath] = process.argv.slice(2);
  if (command !== "--extract" || outputPath === undefined) {
    throw new Error(usage());
  }
  await extract(inputPath, outputPath, guideComparisonPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { extract, readDescriptor, readDollarTerminatedBig5 };
