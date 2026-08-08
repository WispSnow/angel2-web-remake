#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_SEGMENT = 0x1eba;
const DATA_LINEAR_BASE = DATA_SEGMENT * 16;
const POINTER_TABLE_OFFSET = 0x06c3;
const RECORD_COUNT = 35;
const OPTION_WORDS = 6;
const SENTINEL = 99;
const DATA_RECORD_COUNT = 39;
const DATA_TIERS = 5;
const DATA_FIELDS = 7;
const DATA_ROW_BYTES = DATA_FIELDS * 2;
const DATA_RECORD_BYTES = DATA_TIERS * DATA_ROW_BYTES;
const BIG5 = new TextDecoder("big5", { fatal: true });
const PROMOTION_DIALOGUE = [
  {
    role: "nia-self-question",
    address: 0x050d,
    expected: "我的經驗值已達到轉職的目標，|應該選擇甚麼職業？",
  },
  {
    role: "nia-grants-teammate-class",
    address: 0x053d,
    expected: "現在我在水神「愛西斯」的面前，|授予妳新的職業．",
  },
  {
    role: "teammate-requests-class",
    address: 0x056d,
    expected: "我的經驗值已達到轉職的目標，|請主將授我新的職業．",
  },
];
const CODE_SIGNATURES = [
  { address: "0000:029A", offset: 0x029a, hex: "b9c409bb00005153a124008ec0268a073c017503e806005b5943e2eac3" },
  { address: "0000:02B7", offset: 0x02b7, hex: "e8704da1bd31833ebd31037701c3833ec931017401c3e80807a1b706833eb706637409c706c3075b04e8f500c3c7060b" },
  { address: "0000:045B", offset: 0x045b, hex: "e82900813682f80008e82d03e82902b9e000bab300e8c5f6813682f80008c60690f500c60691f500e8be02c3" },
  { address: "0000:0487", offset: 0x0487, hex: "8b0e923183f92e743ee8f2b6e8f6bfc7060b056d052ec70695098c002ec70697090e01e83004b92e00e86bb6e809bfc7060b053d052ec7069509b4002ec70697091e00e81004c3b92e00e84ab6e8e8bec7060b050d052ec7069509b4002ec70697091e00e8ef03c3" },
  { address: "0000:0693", offset: 0x0693, hex: "c706b3060100c7069506b800c706c1070000c706b5068d078b1ec10703db8b87b7063d6300744be864008b1ec10703db" },
  { address: "0000:0744", offset: 0x0744, hex: "813682f80008a180f8bbde01e806f1e8ebfb813682f80008e84ac1833e4a3dff7505e86529ebd98b1e4a3d03db8b8fb706498b1ed00403db898fda56b800008b1ed204894702a180f8e86af0e8dfb9c3" },
  { address: "0000:09D8", offset: 0x09d8, hex: "a1b931a3d204a18c31a3ce04a1cb31a3d0048cd88ec08b1ece0403db8bb7c306bfb706b90600f3a5c3" },
];

const GUIDE_NAME_CORRECTIONS = new Map([
  ["飛馬騎士", "飛馬戰士"],
  ["祈導帥", "祈導師"],
  ["魔導帥", "魔導師"],
  ["魔祭司", "魔祭師"],
  ["咒術帥", "咒術師"],
  ["邪法帥", "邪法師"],
  ["魔法帥", "魔法師"],
  ["巫帥", "巫師"],
]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function linearOffset(buffer, dsOffset, bytes, label) {
  const linear = DATA_LINEAR_BASE + dsOffset;
  if (linear < 0 || linear + bytes > buffer.length) {
    throw new Error(`${label}: DS:${hex(dsOffset)} is outside the runtime image`);
  }
  return linear;
}

function dollarString(buffer, address, label) {
  const start = linearOffset(buffer, address, 1, label);
  let end = start;
  while (end < buffer.length && buffer[end] !== 0x24) end += 1;
  if (end >= buffer.length) throw new Error(`${label}: missing '$' terminator`);
  return BIG5.decode(buffer.subarray(start, end));
}

function extractPromotionDialogue(buffer) {
  const strings = PROMOTION_DIALOGUE.map(({ role, address, expected }) => {
    const text = dollarString(buffer, address, role);
    if (text !== expected) {
      throw new Error(`${role}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(text)}`);
    }
    return {
      role,
      address: `${hex(DATA_SEGMENT)}:${hex(address)}`,
      delimiter: "|",
      text,
      lines: text.split("|"),
    };
  });
  const byRole = Object.fromEntries(strings.map((entry) => [entry.role, entry]));
  return {
    sourceFunction: "0000:0487",
    niaCharacterRecord: 0x2e,
    branchPredicate: "DS:3192h == 002Eh",
    renderer: "0000:08DD",
    inputWait: "none; each renderer call returns after its timed glyph loop",
    niaSequence: [byRole["nia-self-question"]],
    teammateSequence: [
      byRole["teammate-requests-class"],
      byRole["nia-grants-teammate-class"],
    ],
  };
}

function validateCodeSignatures(buffer) {
  return CODE_SIGNATURES.map((signature) => {
    const expected = Buffer.from(signature.hex, "hex");
    const actual = buffer.subarray(signature.offset, signature.offset + expected.length);
    if (!actual.equals(expected)) {
      throw new Error(`${signature.address}: promotion code signature mismatch`);
    }
    return {
      address: signature.address,
      fileOffset: signature.offset,
      bytes: expected.length,
      sha256: sha256(expected),
    };
  });
}

function directNearCallers(buffer, target) {
  const codeBytes = Math.min(buffer.length, 0x10000);
  const callers = [];
  for (let offset = 0; offset + 2 < codeBytes; offset += 1) {
    if (buffer[offset] !== 0xe8) continue;
    const relative = buffer.readInt16LE(offset + 1);
    if (((offset + 3 + relative) & 0xffff) === target) callers.push(offset);
  }
  return callers;
}

function exactOffsets(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(
      `${label}: expected [${expected.map((value) => hex(value)).join(", ")}], ` +
      `found [${actual.map((value) => hex(value)).join(", ")}]`,
    );
  }
}

function findBytes(buffer, needle, limit = buffer.length) {
  const offsets = [];
  for (let offset = 0; offset + needle.length <= limit; offset += 1) {
    if (buffer.subarray(offset, offset + needle.length).equals(needle)) offsets.push(offset);
  }
  return offsets;
}

function auditPromotionCallGraph(buffer) {
  const expectedDirectCallers = new Map([
    [0x029a, [0x0296]],
    [0x02b7, [0x02ae]],
    [0x0693, [0x0467]],
    [0x0744, [0x0483]],
    [0x09d8, [0x02cd]],
  ]);
  const directCallers = {};
  for (const [target, expected] of expectedDirectCallers) {
    const actual = directNearCallers(buffer, target);
    exactOffsets(actual, expected, `direct near callers of ${hex(target)}`);
    directCallers[`0000:${hex(target)}`] = actual.map((offset) => `0000:${hex(offset)}`);
  }
  const presentationPointerWrites = findBytes(
    buffer,
    Buffer.from("c706c3075b04", "hex"),
    Math.min(buffer.length, 0x10000),
  );
  exactOffsets(presentationPointerWrites, [0x02da], "promotion presentation pointer writes");
  return {
    scannedCodeBytes: Math.min(buffer.length, 0x10000),
    directNearCallers: directCallers,
    indirectPresentationRoute: {
      writer: "0000:02DA writes 045Bh to DS:07C3h",
      pointerWriteOffsets: presentationPointerWrites.map((offset) => `0000:${hex(offset)}`),
      invoker: "0000:043F loads DS:07C3h and 0000:0442 calls AX",
    },
    eligibilityCoverage: "0000:029A scans all 2500 occupancy cells and calls 02B7h for every cell whose side byte is 1",
    eligibilityPredicates: [
      "02B7h loads the current unit, requires its derived DATA-row count DS:31BDh to be greater than 3",
      "02B7h requires the loaded unit side DS:31C9h to equal 1",
      "02B7h copies the current class option list and requires its first word not to be sentinel 99",
    ],
    characterOrStageRestriction: "none in the complete production caller, eligibility, menu or commit chain",
    targetStartLevelValidation: "none; the target DATA record is not loaded or compared before 0744h commits the selected class record",
  };
}

function parseDataLevels(dataBuffer, dataPath) {
  const expectedBytes = DATA_RECORD_COUNT * DATA_RECORD_BYTES;
  if (dataBuffer.length !== expectedBytes) {
    throw new Error(`${dataPath}: expected ${expectedBytes} bytes, found ${dataBuffer.length}`);
  }
  return Array.from({ length: DATA_RECORD_COUNT }, (_, record) => ({
    record,
    tiers: Array.from({ length: DATA_TIERS }, (_, tier) => ({
      tier,
      experience: dataBuffer.readUInt16LE(record * DATA_RECORD_BYTES + tier * DATA_ROW_BYTES),
      level: dataBuffer.readUInt16LE(
        record * DATA_RECORD_BYTES + tier * DATA_ROW_BYTES + (DATA_FIELDS - 1) * 2,
      ),
    })),
  }));
}

function normalizeGuideName(name) {
  return GUIDE_NAME_CORRECTIONS.get(name) ?? name.replaceAll("帥", "師");
}

function edgeKey(source, target) {
  return `${source}:${target}`;
}

function compareGuide(records, descriptors, guide, guidePath) {
  if (!Array.isArray(guide?.comparison?.promotions?.entries)) {
    throw new Error(`${guidePath}: missing comparison.promotions.entries`);
  }
  const nameToRecord = new Map(
    descriptors.records.map((record) => [record.normalizedName, record.record]),
  );
  const guideEntries = guide.comparison.promotions.entries.map((edge) => {
    const normalizedSourceName = normalizeGuideName(edge.sourceName);
    const normalizedTargetName = normalizeGuideName(edge.targetName);
    const sourceRecord = nameToRecord.get(normalizedSourceName);
    const targetRecord = nameToRecord.get(normalizedTargetName);
    if (sourceRecord === undefined || targetRecord === undefined) {
      throw new Error(
        `${guidePath}: cannot map promotion ${edge.sourceName} -> ${edge.targetName}`,
      );
    }
    return {
      sourceName: edge.sourceName,
      targetName: edge.targetName,
      normalizedSourceName,
      normalizedTargetName,
      sourceRecord,
      targetRecord,
    };
  });
  const nativeEdges = records.flatMap((record) =>
    record.targets.map((target) => ({ sourceRecord: record.record, targetRecord: target })),
  );
  const nativeSet = new Set(nativeEdges.map((edge) => edgeKey(edge.sourceRecord, edge.targetRecord)));
  const guideSet = new Set(guideEntries.map((edge) => edgeKey(edge.sourceRecord, edge.targetRecord)));
  const missingFromNative = guideEntries.filter(
    (edge) => !nativeSet.has(edgeKey(edge.sourceRecord, edge.targetRecord)),
  );
  const unexpectedNative = nativeEdges.filter(
    (edge) => !guideSet.has(edgeKey(edge.sourceRecord, edge.targetRecord)),
  );

  const orderedSources = [];
  for (const sourceRecord of [...new Set(guideEntries.map((edge) => edge.sourceRecord))]) {
    const guideTargets = guideEntries
      .filter((edge) => edge.sourceRecord === sourceRecord)
      .map((edge) => edge.targetRecord);
    const nativeTargets = records[sourceRecord].targets;
    orderedSources.push({
      sourceRecord,
      sourceName: descriptors.records[sourceRecord].normalizedName,
      guideTargets,
      nativeTargets,
      exactOrderMatch:
        guideTargets.length === nativeTargets.length &&
        guideTargets.every((target, index) => target === nativeTargets[index]),
    });
  }

  return {
    source: guidePath,
    guideEdges: guideEntries.length,
    nativeEdges: nativeEdges.length,
    edgeSetExact: missingFromNative.length === 0 && unexpectedNative.length === 0,
    orderedSourceGroups: orderedSources.length,
    orderedSourceGroupsExact: orderedSources.filter((source) => source.exactOrderMatch).length,
    allSourceOptionOrdersExact: orderedSources.every((source) => source.exactOrderMatch),
    missingFromNative,
    unexpectedNative,
    orderedSources,
  };
}

async function extract(
  runtimePath,
  descriptorPath,
  dataPath,
  outputPath,
  guideComparisonPath,
) {
  const [buffer, descriptors, dataBuffer] = await Promise.all([
    readFile(runtimePath),
    readFile(descriptorPath, "utf8").then(JSON.parse),
    readFile(dataPath),
  ]);
  if (!Array.isArray(descriptors.records) || descriptors.records.length !== 39) {
    throw new Error(`${descriptorPath}: expected 39 native unit descriptors`);
  }

  const records = Array.from({ length: RECORD_COUNT }, (_, record) => {
    const pointerLinear = linearOffset(
      buffer,
      POINTER_TABLE_OFFSET + record * 2,
      2,
      `promotion pointer ${record}`,
    );
    const optionOffset = buffer.readUInt16LE(pointerLinear);
    const optionLinear = linearOffset(
      buffer,
      optionOffset,
      OPTION_WORDS * 2,
      `promotion options ${record}`,
    );
    const rawWords = Array.from(
      { length: OPTION_WORDS },
      (_, index) => buffer.readUInt16LE(optionLinear + index * 2),
    );
    const sentinelIndex = rawWords.indexOf(SENTINEL);
    if (sentinelIndex < 0) {
      throw new Error(`promotion record ${record}: missing ${SENTINEL} sentinel`);
    }
    const encodedOptions = rawWords.slice(0, sentinelIndex);
    if (encodedOptions.some((value) => value < 1 || value > RECORD_COUNT)) {
      throw new Error(`promotion record ${record}: target encoding is outside 1..35`);
    }
    const targets = encodedOptions.map((value) => value - 1);
    return {
      record,
      name: descriptors.records[record].normalizedName,
      pointerOffset: optionOffset,
      pointerAddress: `${hex(DATA_SEGMENT)}:${hex(optionOffset)}`,
      rawWords,
      sentinelIndex,
      encodedOptions,
      targets,
      targetNames: targets.map((target) => descriptors.records[target].normalizedName),
      terminal: targets.length === 0,
    };
  });

  let guideComparison = null;
  if (guideComparisonPath !== undefined) {
    const guide = JSON.parse(await readFile(guideComparisonPath, "utf8"));
    guideComparison = compareGuide(records, descriptors, guide, guideComparisonPath);
  }
  const edges = records.flatMap((record) =>
    record.targets.map((target, index) => ({
      sourceRecord: record.record,
      sourceName: record.name,
      optionIndex: index,
      encodedTarget: target + 1,
      targetRecord: target,
      targetName: descriptors.records[target].normalizedName,
    })),
  );
  const dataLevels = parseDataLevels(dataBuffer, dataPath);
  const dataRow4LevelEdges = edges.map((edge) => ({
    ...edge,
    sourceDataRow4Tier: 3,
    sourceDataRow4Level: dataLevels[edge.sourceRecord].tiers[3].level,
    targetFirstTierLevel: dataLevels[edge.targetRecord].tiers[0].level,
    dataRow4MatchesTargetStartLevel:
      dataLevels[edge.sourceRecord].tiers[3].level ===
      dataLevels[edge.targetRecord].tiers[0].level,
  }));
  const dataRow4LevelMismatches = dataRow4LevelEdges.filter(
    (edge) => !edge.dataRow4MatchesTargetStartLevel,
  );
  if (
    dataRow4LevelMismatches.length !== 1 ||
    dataRow4LevelMismatches[0].sourceRecord !== 20 ||
    dataRow4LevelMismatches[0].targetRecord !== 21 ||
    dataRow4LevelMismatches[0].optionIndex !== 0 ||
    dataRow4LevelMismatches[0].sourceDataRow4Level !== 7 ||
    dataRow4LevelMismatches[0].targetFirstTierLevel !== 8
  ) {
    throw new Error("DATA row-four level alignment exception is not exactly 弓兵(20) 7 -> 弩兵(21) 8");
  }
  const callGraphAudit = auditPromotionCallGraph(buffer);
  const result = {
    format: "ANGEL2 module 29 native promotion option table",
    source: runtimePath,
    sourceBytes: buffer.length,
    sourceSha256: sha256(buffer),
    unitDescriptors: descriptorPath,
    dataSource: dataPath,
    dataSourceBytes: dataBuffer.length,
    dataSourceSha256: sha256(dataBuffer),
    dataSegment: DATA_SEGMENT,
    dataLinearBase: DATA_LINEAR_BASE,
    pointerTableOffset: POINTER_TABLE_OFFSET,
    pointerTableAddress: `${hex(DATA_SEGMENT)}:${hex(POINTER_TABLE_OFFSET)}`,
    recordCount: RECORD_COUNT,
    optionWords: OPTION_WORDS,
    sentinel: SENTINEL,
    targetEncoding: "stored_word = target_record + 1",
    edgeCount: edges.length,
    sourceRecordsWithOptions: records.filter((record) => !record.terminal).length,
    terminalRecords: records.filter((record) => record.terminal).length,
    dataRow4LevelAlignmentAudit: {
      sourceDataRowTier: 3,
      edgeCount: dataRow4LevelEdges.length,
      exactLevelMatches: dataRow4LevelEdges.filter(
        (edge) => edge.dataRow4MatchesTargetStartLevel,
      ).length,
      mismatchCount: dataRow4LevelMismatches.length,
      mismatches: dataRow4LevelMismatches,
      archerToCrossbowProof: {
        sourceRecord: 20,
        sourceName: descriptors.records[20].normalizedName,
        optionIndex: 0,
        sourceDataRow4Level: 7,
        targetRecord: 21,
        targetName: descriptors.records[21].normalizedName,
        targetFirstTierLevel: 8,
        sourceEligibilityIndependentOfDataRow4: true,
        targetStartLevelComparedBeforeCommit: false,
        allowedByNativeProductionPath: true,
        conclusion: "DATA row-four field6 is 7 while 弩兵 row-one field6 is 8; neither value gates promotion eligibility or commit",
      },
      edges: dataRow4LevelEdges,
    },
    runtimeEvidence: {
      callGraphAudit,
      promotionDialogue: extractPromotionDialogue(buffer),
      copyOptions: "0000:09D8 copies six words from the class-indexed pointer table",
      buildMenu: "0000:0693 stops at sentinel 99 and builds one menu item per preceding word",
      commitSelection: "0000:0744 decrements the selected word and writes the target class record",
      resetExperience: "0000:0744 writes zero to current unit profile offset +02h",
      preservedCurrentLife: "0000:0744 does not write current unit profile offset +00h, so current life is unchanged at promotion commit",
      noImmediateStatReapplication: "the complete 0000:0744 commit path writes only the selected class record and experience zero before restoring the screen; it does not call the DATA-row selector or rewrite attack, defense, max life, movement, statuses or other unit-state fields",
      laterDerivation: "subsequent ordinary unit loading derives class stats from the newly stored class and zero experience; this is not an immediate promotion-time heal or stat mutation",
      mandatorySelection: "0000:0744 loops while the selection result is -1; no cancel return exists",
    },
    verifiedCodeSignatures: validateCodeSignatures(buffer),
    guideComparison,
    records,
    edges,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted ${result.edgeCount} native promotion edges from ` +
      `${result.sourceRecordsWithOptions} source classes; ` +
      `guide edge set exact=${guideComparison?.edgeSetExact ?? "not-compared"}`,
  );
  return result;
}

function usage() {
  return (
    "usage: angel2-promotion-table.mjs --extract MODULE29_RAW " +
    "UNIT_DESCRIPTORS_JSON DATA_SWF OUTPUT_JSON [UNIT_GUIDE_COMPARISON_JSON]"
  );
}

async function main() {
  const [command, runtimePath, descriptorPath, dataPath, outputPath, guideComparisonPath] =
    process.argv.slice(2);
  if (command !== "--extract" || outputPath === undefined || dataPath === undefined) {
    throw new Error(usage());
  }
  await extract(runtimePath, descriptorPath, dataPath, outputPath, guideComparisonPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { compareGuide, extract };
