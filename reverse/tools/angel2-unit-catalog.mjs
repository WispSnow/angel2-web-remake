#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const RECORD_COUNT = 39;
const ORDINARY_RECORD_COUNT = 35;
const FIELD_NAMES = [
  "experienceThreshold",
  "attack",
  "defense",
  "maxLife",
  "movement",
  "reservedField5",
  "level",
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function compactLabel(text) {
  return text.replaceAll(/\s+/g, "");
}

function pathSource(filePath, buffer) {
  return {
    path: filePath,
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
}

function decodeDataRow(tier) {
  assert(Array.isArray(tier.values) && tier.values.length === FIELD_NAMES.length,
    `DATA record ${tier.tier}: expected seven values`);
  return Object.fromEntries([
    ["row", tier.tier],
    ...FIELD_NAMES.map((name, index) => [name, tier.values[index]]),
  ]);
}

function descriptorCodes(record) {
  const side1 = record.descriptors.find((entry) => entry.role === "side1")
    ?? record.descriptors.find((entry) => entry.set === "set1");
  const side2 = record.descriptors.find((entry) => entry.role === "side2")
    ?? record.descriptors.find((entry) => entry.set === "set2");
  assert(side1 !== undefined && side2 !== undefined,
    `descriptor ${record.record}: missing side descriptor`);
  return {
    side1: side1.code,
    side2: side2.code,
    variants: [...new Set([side1.code, side2.code])],
    agreement: side1.code === side2.code,
  };
}

function buildClassDispatch(aiRules) {
  const dispatch = aiRules.rules.classDispatch;
  const groups = [
    "ordinary",
    "shooting",
    "technique",
    "empressOrDragonTechnique",
    "stage37BossPart",
  ];
  const byCode = new Map();
  for (const group of groups) {
    assert(Array.isArray(dispatch[group]), `AI class dispatch is missing ${group}`);
    for (const entry of dispatch[group]) {
      assert(!byCode.has(entry.classCode),
        `AI class code ${entry.classCode} occurs in more than one group`);
      byCode.set(entry.classCode, group);
    }
  }
  return { groups, byCode };
}

function buildCodeMap(entries, label) {
  const result = new Map();
  for (const entry of entries) {
    assert(!result.has(entry.code), `${label}: duplicate code ${entry.code}`);
    result.set(entry.code, entry);
  }
  return result;
}

function buildProfileMap(groups, label) {
  const byRecord = new Map();
  const profiles = groups.map((group, profile) => {
    for (const record of group.records) {
      assert(!byRecord.has(record), `${label}: record ${record} occurs twice`);
      byRecord.set(record, profile);
    }
    return {
      profile,
      sha256: group.sha256,
      values: group.values,
      records: group.records,
      codes: group.codes,
      names: group.names,
    };
  });
  assert(byRecord.size === RECORD_COUNT,
    `${label}: profiles cover ${byRecord.size}/${RECORD_COUNT} records`);
  return { profiles, byRecord };
}

function normalizeTechniqueClass(entry) {
  return {
    classCode: entry.classCode,
    tiers: entry.tiers.map((tier) => ({
      tier: tier.tier,
      actions: tier.entries.map((action) => ({
        label: compactLabel(action.label.text),
        rawLabel: action.label.text,
        actionCode: action.actionCode,
      })),
    })),
  };
}

function guideNameStatus(nativeName, externalName) {
  if (externalName === null) return "not_supplied";
  if (externalName === nativeName) return "exact";
  if (externalName.replaceAll("帥", "師") === nativeName) return "wrong_shuai_character";
  return "substantive_mismatch";
}

function joinValues(rows, key) {
  return rows.map((row) => row[key]).join("|");
}

function buildCsv(catalog) {
  const headings = [
    "record",
    "name",
    "side1_code",
    "side2_code",
    "player_action_category",
    "ai_class_dispatch_side1",
    "ai_class_dispatch_side2",
    "levels",
    "experience_thresholds_original",
    "attacks",
    "defenses",
    "max_life",
    "movement",
    "reserved_field5",
    "promotion_targets",
    "promoted_from",
    "kill_reward_by_code",
    "post_third_row_growth_by_code",
    "ordinary_hit_status",
    "shooting",
    "technique_tier_1",
    "technique_tier_2",
    "technique_tier_3",
    "movement_profile",
    "terrain_defense_profile",
    "external_guide_name",
    "external_name_status",
    "external_experience_transform",
  ];
  const lines = [headings.map(csvCell).join(",")];
  for (const record of catalog.records) {
    const techniqueTiers = new Map(
      (record.technique?.tiers ?? []).map((tier) => [
        tier.tier,
        tier.actions.map((action) => action.label).join("/"),
      ]),
    );
    const values = [
      record.record,
      record.name,
      record.codes.side1,
      record.codes.side2,
      record.playerActionCategory,
      record.aiClassDispatch.side1,
      record.aiClassDispatch.side2,
      joinValues(record.dataRows, "level"),
      joinValues(record.dataRows, "experienceThreshold"),
      joinValues(record.dataRows, "attack"),
      joinValues(record.dataRows, "defense"),
      joinValues(record.dataRows, "maxLife"),
      joinValues(record.dataRows, "movement"),
      joinValues(record.dataRows, "reservedField5"),
      record.promotion.targets.map((target) => `${target.record}:${target.name}`).join("|"),
      record.promotion.sources.map((source) => `${source.record}:${source.name}`).join("|"),
      record.killRewards.map((entry) => `${entry.code}:${entry.reward}`).join("|"),
      record.postThirdRowGrowth.map((entry) =>
        `${entry.code}:${entry.thresholdIncrement}/${entry.attackIncrement}/${entry.maxLifeIncrement}`
      ).join("|"),
      record.ordinaryHitStatuses.map((entry) => entry.effectName).join("|"),
      record.shooting === null
        ? ""
        : `range 2..${record.shooting.maximumRange}; ${record.shooting.damage}`,
      techniqueTiers.get(1) ?? "",
      techniqueTiers.get(2) ?? "",
      techniqueTiers.get(3) ?? "",
      record.mapRules.movementProfile,
      record.mapRules.terrainDefenseProfile,
      record.externalGuide.name,
      record.externalGuide.nameStatus,
      record.externalGuide.experienceTransform,
    ];
    lines.push(values.map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function build(inputPaths, outputJsonPath, outputCsvPath) {
  const inputBuffers = await Promise.all(inputPaths.map((inputPath) => readFile(inputPath)));
  const [
    data,
    descriptors,
    promotions,
    mapRules,
    combat,
    techniques,
    aiRules,
    guide,
  ] = inputBuffers.map((buffer) => JSON.parse(buffer.toString("utf8")));

  assert(data.records?.length === RECORD_COUNT, "DATA must contain 39 records");
  assert(descriptors.records?.length === RECORD_COUNT, "descriptors must contain 39 records");
  assert(mapRules.records?.length === RECORD_COUNT, "MAP rules must contain 39 records");
  assert(promotions.records?.length === ORDINARY_RECORD_COUNT,
    "promotion table must contain 35 ordinary records");
  assert(promotions.edgeCount === 31, "promotion table must contain 31 edges");
  assert(promotions.guideComparison?.edgeSetExact === true,
    "external promotion edge set is not an exact native match");
  assert(promotions.guideComparison?.allSourceOptionOrdersExact === true,
    "external promotion option order is not an exact native match");
  assert(guide.guide?.records?.length === RECORD_COUNT,
    "external guide comparison must contain 39 record groups");
  assert(guide.comparison?.confirmedModification?.exactForWholeTable === true,
    "external guide experience transform is not exact for the whole table");
  assert(guide.comparison?.unchangedFields?.every((field) => field.exactForWholeTable),
    "external guide changed a field other than field0");

  const classDispatch = buildClassDispatch(aiRules);
  const nativeSide1Codes = new Set(descriptors.records.map((record) =>
    descriptorCodes(record).side1));
  assert(nativeSide1Codes.size === RECORD_COUNT,
    `side-1 descriptors contain ${nativeSide1Codes.size}/39 unique codes`);
  assert([...nativeSide1Codes].every((code) => classDispatch.byCode.has(code)),
    "AI class dispatch does not cover every side-1 class code");

  const movementProfiles = buildProfileMap(mapRules.movementProfileGroups, "movement");
  const defenseProfiles = buildProfileMap(
    mapRules.terrainDefenseProfileGroups,
    "terrain defense",
  );
  const killRewardByCode = buildCodeMap(
    combat.experience.killRewards.entries,
    "kill rewards",
  );
  const growthByCode = buildCodeMap(
    combat.experience.cumulativeProgression.classSpecificTable.entries,
    "post-third-row growth",
  );
  const statusByRecord = new Map();
  const statusNames = new Map([
    [0x12, "防禦下降"],
    [0x10, "攻擊下降"],
    [0x0e, "混亂"],
    [0x14, "施毒"],
  ]);
  for (const status of combat.ordinaryAttackStatuses) {
    const record = status.attacker.record;
    const list = statusByRecord.get(record) ?? [];
    list.push({
      effectName: statusNames.get(status.stateOffset) ?? `state+${status.stateOffset}`,
      stateOffset: status.stateOffset,
      value: status.value,
      confirmedEffect: status.confirmedEffect,
    });
    statusByRecord.set(record, list);
  }

  const shootingByRecord = new Map(techniques.shooting.classes.map((entry) => [
    entry.descriptorMatches[0].record,
    {
      classCode: entry.classCode,
      minimumRange: techniques.shooting.minimumManhattanRange,
      maximumRange: entry.maximumRange,
      damage: entry.damage,
      experience: entry.experience,
    },
  ]));
  const techniqueByRecord = new Map(techniques.techniqueMenu.classes.map((entry) => [
    entry.descriptorMatches[0].record,
    normalizeTechniqueClass(entry),
  ]));

  const promotionSourcesByTarget = new Map();
  for (const edge of promotions.edges) {
    const list = promotionSourcesByTarget.get(edge.targetRecord) ?? [];
    list.push({ record: edge.sourceRecord, name: edge.sourceName, optionIndex: edge.optionIndex });
    promotionSourcesByTarget.set(edge.targetRecord, list);
  }

  const defaultGrowth = combat.experience.cumulativeProgression.defaultWhenCodeMissing;
  const records = descriptors.records.map((descriptor, record) => {
    assert(descriptor.record === record, `descriptor record order mismatch at ${record}`);
    assert(data.records[record].record === record, `DATA record order mismatch at ${record}`);
    assert(mapRules.records[record].record === record, `MAP record order mismatch at ${record}`);
    const codes = descriptorCodes(descriptor);
    const rows = data.records[record].tiers.map(decodeDataRow);
    const external = guide.guide.records[record];
    const promotion = promotions.records[record] ?? null;
    const targetEntries = (promotion?.targets ?? []).map((target, optionIndex) => ({
      record: target,
      name: descriptors.records[target].normalizedName,
      optionIndex,
      targetStartLevel: data.records[target].tiers[0].values[6],
    }));
    const codeDetails = codes.variants.map((code) => ({
      code,
      side1: code === codes.side1,
      side2: code === codes.side2,
      aiClassDispatch: classDispatch.byCode.get(code),
    }));
    const killRewards = codes.variants
      .filter((code) => killRewardByCode.has(code))
      .map((code) => ({ code, reward: killRewardByCode.get(code).reward }));
    const postThirdRowGrowth = codes.variants.map((code) => {
      const native = growthByCode.get(code);
      return {
        code,
        thresholdIncrement: native?.thresholdIncrement ?? defaultGrowth.thresholdIncrement,
        attackIncrement: native?.attackIncrement ?? defaultGrowth.attackIncrement,
        maxLifeIncrement: native?.maxLifeIncrement ?? defaultGrowth.maxLifeIncrement,
        source: native === undefined ? "native_default" : "native_class_specific_table",
      };
    });
    const eligibleAsPromotionSource = promotion !== null && !promotion.terminal;
    const side1Growth = postThirdRowGrowth.find(({ code }) => code === codes.side1);
    assert(side1Growth !== undefined, `record ${record}: missing side-1 growth rule`);
    return {
      record,
      name: descriptor.normalizedName,
      recordKind: record < ORDINARY_RECORD_COUNT ? "ordinary_catalog" : "special_runtime",
      codes,
      codeDetails,
      playerActionCategory: shootingByRecord.has(record)
        ? "shooting"
        : techniqueByRecord.has(record)
          ? "technique"
          : record < ORDINARY_RECORD_COUNT
            ? "ordinary"
            : "special_runtime",
      aiClassDispatch: {
        side1: classDispatch.byCode.get(codes.side1),
        side2: classDispatch.byCode.get(codes.side2),
      },
      dataRows: rows,
      runtimeDataSelection: {
        directlySelectedRows: [0, 1, 2],
        rows3And4UsedForOrdinaryBattleStats: false,
        currentExperienceIsCumulative: true,
      },
      promotion: {
        eligibleAsSource: eligibleAsPromotionSource,
        triggerGrowthRow: eligibleAsPromotionSource ? 4 : null,
        triggerExperienceThreshold: eligibleAsPromotionSource
          ? rows[2].experienceThreshold + side1Growth.thresholdIncrement
          : null,
        // DATA rows four and five are not consumed by the module-29 battle
        // progression path. Retain row four only as table/edge metadata; it is
        // not the runtime promotion trigger.
        dataRow4Level: promotion === null ? null : rows[3].level,
        dataRow4ExperienceThreshold: promotion === null ? null : rows[3].experienceThreshold,
        targets: targetEntries,
        sources: promotionSourcesByTarget.get(record) ?? [],
      },
      killRewards,
      postThirdRowGrowth,
      ordinaryHitStatuses: statusByRecord.get(record) ?? [],
      shooting: shootingByRecord.get(record) ?? null,
      technique: techniqueByRecord.get(record) ?? null,
      mapRules: {
        movementProfile: movementProfiles.byRecord.get(record),
        terrainDefenseProfile: defenseProfiles.byRecord.get(record),
      },
      externalGuide: {
        name: external.name,
        nameStatus: guideNameStatus(descriptor.normalizedName, external.name),
        experienceThresholds: external.tiers.map((tier) => tier.values[0]),
        experienceTransform: "floor(original / 50)",
        fields1Through6Exact: true,
        trust: "verified_modified_derivative_not_original_authority",
      },
      evidence: {
        nativeName: "C",
        dataRows: "C",
        promotion: record < ORDINARY_RECORD_COUNT ? "C" : "not_applicable",
        playerActionCategory: record < ORDINARY_RECORD_COUNT ? "C" : "not_applicable",
        aiClassDispatch: "C",
        mapProfiles: "C",
        externalGuideName: external.name === null ? "not_supplied" : "cross_checked",
      },
    };
  });

  const promotionEdges = promotions.edges.map((edge) => {
    const sourceRows = records[edge.sourceRecord].dataRows;
    const targetRows = records[edge.targetRecord].dataRows;
    return {
      ...edge,
      sourceDataRow4Level: sourceRows[3].level,
      sourceDataRow4ExperienceThreshold: sourceRows[3].experienceThreshold,
      targetStartLevel: targetRows[0].level,
      dataRow4MatchesTargetStartLevel: sourceRows[3].level === targetRows[0].level,
    };
  });
  const nameStatusCounts = Object.groupBy === undefined
    ? records.reduce((result, record) => {
      const key = record.externalGuide.nameStatus;
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {})
    : Object.fromEntries(Object.entries(Object.groupBy(records,
      (record) => record.externalGuide.nameStatus)).map(([key, values]) => [key, values.length]));

  const result = {
    format: "ANGEL2 consolidated native unit/class catalog",
    phase: "phase_1_original_reconstruction",
    implementationFrozen: true,
    generatedFrom: Object.fromEntries(inputPaths.map((inputPath, index) => [
      path.basename(inputPath, ".json"),
      pathSource(inputPath, inputBuffers[index]),
    ])),
    recordCount: RECORD_COUNT,
    ordinaryRecordCount: ORDINARY_RECORD_COUNT,
    specialRuntimeRecordCount: RECORD_COUNT - ORDINARY_RECORD_COUNT,
    fieldSemantics: Object.fromEntries(FIELD_NAMES.map((name, field) => [name, {
      field,
      evidence: name === "reservedField5" ? "C runtime non-use / U original intent" : "C",
    }])),
    guideAssessment: {
      role: "untrusted external modification guide, accepted only after native comparison",
      originalExperienceTransform: "all 195 guide field0 values equal floor(original field0 / 50)",
      unchangedValues: "all 1,170 guide field1..6 values equal the original DATA values",
      promotionEdges: "31/31 exact native edge-set match",
      promotionOptionOrder: "12/12 source groups exactly match native order",
      nameStatusCounts,
    },
    runtimeRules: {
      directlySelectedDataRows: [0, 1, 2],
      unusedAsOrdinaryBattleStatRows: [3, 4],
      postThirdRowGrowthDefault: defaultGrowth,
      promotionCommit: promotions.runtimeEvidence,
      side2SteelArmorQuirk: descriptors.runtimeRoles.steelArmorQuirk,
      field5: "preserve in data; no confirmed battle attribute consumer may apply it",
    },
    classDispatchGroups: classDispatch.groups,
    mapProfiles: {
      movement: movementProfiles.profiles,
      terrainDefense: defenseProfiles.profiles,
    },
    promotionEdges,
    records,
    validation: {
      dataRecords: data.records.length,
      descriptorRecords: descriptors.records.length,
      mapRuleRecords: mapRules.records.length,
      ordinaryPromotionRecords: promotions.records.length,
      promotionEdges: promotions.edgeCount,
      promotionEdgeSetExactAgainstGuide: promotions.guideComparison.edgeSetExact,
      promotionOrdersExactAgainstGuide: promotions.guideComparison.allSourceOptionOrdersExact,
      guideExperienceTransformValues: guide.comparison.confirmedModification.matchingValues,
      guideExperienceTransformTotal: guide.comparison.confirmedModification.totalValues,
      guideUnchangedFieldValues: guide.comparison.unchangedFields.reduce(
        (sum, field) => sum + field.exactMatches,
        0,
      ),
      guideUnchangedFieldValuesTotal: guide.comparison.unchangedFields.reduce(
        (sum, field) => sum + field.totalValues,
        0,
      ),
      uniqueSide1Codes: nativeSide1Codes.size,
      side1CodesCoveredByDispatch: [...nativeSide1Codes].filter((code) =>
        classDispatch.byCode.has(code)).length,
      movementProfilesCoverRecords: movementProfiles.byRecord.size,
      terrainDefenseProfilesCoverRecords: defenseProfiles.byRecord.size,
      recordsWithNativeNames: records.filter((record) => record.name.length > 0).length,
      recordsWithUnresolvedAiClassDispatch: records.filter((record) =>
        record.aiClassDispatch.side1 === undefined || record.aiClassDispatch.side2 === undefined).length,
    },
  };

  assert(result.validation.recordsWithUnresolvedAiClassDispatch === 0,
    "one or more records have no AI class dispatch category");
  assert(promotionEdges.filter((edge) => !edge.dataRow4MatchesTargetStartLevel).length === 1,
    "expected exactly one DATA row-four target-level alignment exception");

  await mkdir(path.dirname(outputJsonPath), { recursive: true });
  await mkdir(path.dirname(outputCsvPath), { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(outputCsvPath, buildCsv(result));
  console.log(JSON.stringify({
    records: result.recordCount,
    ordinaryRecords: result.ordinaryRecordCount,
    specialRuntimeRecords: result.specialRuntimeRecordCount,
    promotionEdges: result.promotionEdges.length,
    dataRow4LevelAlignmentExceptions: result.promotionEdges.filter(
      (edge) => !edge.dataRow4MatchesTargetStartLevel,
    ).map((edge) => `${edge.sourceName}->${edge.targetName}`),
    guideNameStatusCounts: result.guideAssessment.nameStatusCounts,
    validation: result.validation,
    outputJson: outputJsonPath,
    outputCsv: outputCsvPath,
  }, null, 2));
  return result;
}

function usage() {
  return (
    "usage: angel2-unit-catalog.mjs --build DATA_JSON DESCRIPTORS_JSON " +
    "PROMOTIONS_JSON MAP_RULES_JSON COMBAT_JSON TECHNIQUES_JSON AI_JSON " +
    "GUIDE_COMPARISON_JSON OUTPUT_JSON OUTPUT_CSV"
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "--build" || args.length !== 10) throw new Error(usage());
  await build(args.slice(0, 8), args[8], args[9]);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { build, buildCsv };
