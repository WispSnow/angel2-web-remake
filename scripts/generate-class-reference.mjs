#!/usr/bin/env node

/**
 * Builds the `[OF]` class stats reference (Markdown + CSV) for balance work.
 *
 * The reference restates confirmed original numbers only; it never models
 * damage, power scores or proposed changes. Balance proposals belong to
 * `design/remake-gdd/balance/class-balance-worksheet.md`, so a future rebalance
 * can never overwrite the original-fact baseline by editing this table.
 *
 * Every upstream inconsistency is a hard failure: if the native catalog, the
 * map profiles, the promotion table or the runtime catalog disagree, no file is
 * written. This is what keeps the document from drifting the way a hand-copied
 * table does. `scripts/check-project-contracts.mjs` reuses `buildClassReference`
 * to fail `pnpm docs:check` when the committed files are stale.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { CLASS_CATALOG, CLASS_ID_BY_NATIVE_RECORD } from "../src/game/content/class-catalog.generated.ts";
import { classTraitsFor } from "../src/game/content/class-traits.ts";
import {
  CLASS_GROWTH_OVERRIDES,
  SIDE1_ONLY_SHOOTING_CLASSES,
} from "../src/game/content/class-balance-overrides.ts";

const root = path.resolve(import.meta.dirname, "..");
const SOURCES = {
  unitCatalog: "reverse/parsed/native/unit-catalog.json",
  mapRules: "reverse/parsed/native/map-rules.json",
  promotionTable: "reverse/parsed/native/promotion-table.json",
  terrainTokenMap: "reverse/parsed/native/terrain-token-map.json",
  techniqueRules: "reverse/parsed/native/technique-rules.json",
};

export const outputDirectory = path.join(root, "design/remake-gdd/reference");
export const markdownPath = path.join(outputDirectory, "class-stats-reference.generated.md");
export const csvPath = path.join(outputDirectory, "class-stats-reference.generated.csv");

const RECORD_COUNT = 39;
const ORDINARY_RECORD_COUNT = 35;
const SPECIAL_RUNTIME_RECORD_COUNT = 4;
const PROMOTION_EDGE_COUNT = 31;
const PROMOTION_SOURCE_COUNT = 12;
const LOGICAL_TERRAIN_SLOTS = 23;
const CLASS_SPECIFIC_GROWTH_CODE_COUNT = 23;
const SOLDIER_RECORD = 0;

/** `02B7h` requires growth row > 3, so the trigger is always third row + 100. */
const PROMOTION_TRIGGER_MARGIN = 100;
/** The 技術階級 note states this rule, so it stays pinned to the evidence string. */
const TECHNIQUE_TIER_SELECTOR = "DS:524C minus one, clamped to 0..2";

const EM = "／";

const GROUP_ORDER = ["T1", "T2", "T3", "T4", "非轉職", "特殊運行"];
const GROUP_TITLES = {
  T1: "第 1 層 · 起始職業",
  T2: "第 2 層 · 一次轉職",
  T3: "第 3 層 · 二次轉職",
  T4: "第 4 層 · 終極職業",
  非轉職: "非轉職常規記錄（關卡覆寫／固定實例）",
  特殊運行: "特殊運行記錄",
};

const ACTION_LABELS = {
  ordinary: "普通",
  shooting: "射擊",
  technique: "技術",
  special_runtime: "特殊運行",
};

const STAT_TABLE_HEADERS = [
  "记录", "职业", "短码", "线", "原版等级", "移动", "行动", "击杀 K",
  "1 级", "2 级", "3 级", "3 级后每档", "成长表",
];
const STAT_TABLE_ALIGNMENTS = [
  "---:", "---", "---", "---", "---", "---:", "---", "---:",
  "---", "---", "---", "---", "---",
];

function fail(message) {
  throw new Error(`class reference generation aborted: ${message}`);
}

async function loadSource(relativePath) {
  const absolute = path.join(root, relativePath);
  const raw = await readFile(absolute);
  return {
    path: relativePath,
    bytes: raw.byteLength,
    sha256: createHash("sha256").update(raw).digest("hex"),
    data: JSON.parse(raw.toString("utf8")),
  };
}

function table(headers, alignments, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${alignments.join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => cell ?? "—").join(" | ")} |`),
  ].join("\n");
}

export async function buildClassReference() {
  const sources = await Promise.all([
    loadSource(SOURCES.unitCatalog),
    loadSource(SOURCES.mapRules),
    loadSource(SOURCES.promotionTable),
    loadSource(SOURCES.terrainTokenMap),
    loadSource(SOURCES.techniqueRules),
  ]);
  const [unitCatalog, mapRules, promotionTable, terrainTokenMap, techniqueRules] = sources;

  const records = unitCatalog.data.records;
  const mapRecords = mapRules.data.records;

  // -------------------------------------------------------------------------
  // Cross-source assertions
  // -------------------------------------------------------------------------

  if (records.length !== RECORD_COUNT || mapRecords.length !== RECORD_COUNT) {
    fail(`expected ${RECORD_COUNT} aligned native records`);
  }
  if (unitCatalog.data.promotionEdges.length !== PROMOTION_EDGE_COUNT) {
    fail(`expected ${PROMOTION_EDGE_COUNT} promotion edges`);
  }
  if (promotionTable.data.edges?.length !== PROMOTION_EDGE_COUNT) {
    fail("promotion table and unit catalog disagree on the promotion edge count");
  }

  const mapRecordByRecord = new Map(mapRecords.map((record) => [record.record, record]));
  const growthCodesBySource = { native_default: new Set(), native_class_specific_table: new Set() };

  records.forEach((record, index) => {
    if (record.record !== index) fail(`record ${record.record} is out of order at index ${index}`);

    const mapRecord = mapRecordByRecord.get(record.record);
    if (!mapRecord || mapRecord.name !== record.name) {
      fail(`map rules are not aligned for record ${record.record}`);
    }
    if (
      mapRecord.movementRules.length !== LOGICAL_TERRAIN_SLOTS
      || mapRecord.terrainDefensePercents.length !== LOGICAL_TERRAIN_SLOTS
    ) {
      fail(`record ${record.record} does not expose ${LOGICAL_TERRAIN_SLOTS} logical terrain slots`);
    }

    const runtime = CLASS_CATALOG[CLASS_ID_BY_NATIVE_RECORD[record.record]];
    if (!runtime || runtime.nativeName !== record.name) {
      fail(`runtime class catalog is not aligned for record ${record.record}`);
    }
    if (JSON.stringify(runtime.dataRows) !== JSON.stringify(record.dataRows)) {
      fail(
        `runtime class catalog data rows drifted for record ${record.record}; `
        + "run pnpm content:classes first",
      );
    }
    if (
      JSON.stringify(runtime.terrainDefensePercents) !== JSON.stringify(mapRecord.terrainDefensePercents)
    ) {
      fail(`runtime terrain defense percents drifted for record ${record.record}`);
    }

    for (const growth of record.postThirdRowGrowth) {
      if (!(growth.source in growthCodesBySource)) fail(`unknown growth source ${growth.source}`);
      growthCodesBySource[growth.source].add(growth.code);
    }
  });

  if (growthCodesBySource.native_class_specific_table.size !== CLASS_SPECIFIC_GROWTH_CODE_COUNT) {
    fail(`expected ${CLASS_SPECIFIC_GROWTH_CODE_COUNT} class-specific post-third-row growth codes`);
  }

  const ordinaryRecords = records.filter((record) => record.recordKind === "ordinary_catalog");
  const specialRecords = records.filter((record) => record.recordKind === "special_runtime");
  if (
    ordinaryRecords.length !== ORDINARY_RECORD_COUNT
    || specialRecords.length !== SPECIAL_RUNTIME_RECORD_COUNT
  ) {
    fail("ordinary / special-runtime record split does not match the native catalog");
  }

  const promotionSources = records.filter((record) => record.promotion.eligibleAsSource);
  if (promotionSources.length !== PROMOTION_SOURCE_COUNT) {
    fail(`expected ${PROMOTION_SOURCE_COUNT} promotion sources`);
  }
  for (const record of promotionSources) {
    const expected = record.dataRows[2].experienceThreshold + PROMOTION_TRIGGER_MARGIN;
    if (record.promotion.triggerExperienceThreshold !== expected) {
      fail(
        `record ${record.record} promotion trigger is not "third row + ${PROMOTION_TRIGGER_MARGIN}"; `
        + "the derived-growth-row rule may have changed",
      );
    }
  }

  if (terrainTokenMap.data.logicalTerrainSlots !== LOGICAL_TERRAIN_SLOTS) {
    fail("terrain token map disagrees on the logical terrain slot count");
  }
  if (techniqueRules.data.techniqueMenu?.tierSelector !== TECHNIQUE_TIER_SELECTOR) {
    fail("technique tier selector evidence changed; the 技術階級 note must be re-derived");
  }

  // -------------------------------------------------------------------------
  // Derived groupings, computed from the native promotion edges
  // -------------------------------------------------------------------------

  const recordByNumber = new Map(records.map((record) => [record.record, record]));
  const tierByRecord = new Map([[SOLDIER_RECORD, 1]]);
  const lineByRecord = new Map([[SOLDIER_RECORD, "基礎"]]);

  /**
   * Depth-first in native candidate order, so a tier table lists
   * 騎兵線 → 戰士線 → 弓兵線 → 修女線 contiguously instead of interleaving them by
   * `DATA` record number, which is only the file layout and carries no balance
   * meaning.
   */
  const discoveryOrder = new Map([[SOLDIER_RECORD, 0]]);
  (function walk(sourceRecord) {
    for (const target of recordByNumber.get(sourceRecord).promotion.targets) {
      if (tierByRecord.has(target.record)) {
        fail(`promotion graph is not a tree at record ${target.record}`);
      }
      const tier = tierByRecord.get(sourceRecord) + 1;
      tierByRecord.set(target.record, tier);
      lineByRecord.set(target.record, tier === 2 ? `${target.name}線` : lineByRecord.get(sourceRecord));
      discoveryOrder.set(target.record, discoveryOrder.size);
      walk(target.record);
    }
  }(SOLDIER_RECORD));

  const byDiscovery = (a, b) => {
    const orderA = discoveryOrder.get(a.record ?? a.sourceRecord);
    const orderB = discoveryOrder.get(b.record ?? b.sourceRecord);
    if (orderA === undefined || orderB === undefined) {
      return (a.record ?? a.sourceRecord) - (b.record ?? b.sourceRecord);
    }
    return orderA - orderB;
  };

  function groupOf(record) {
    if (record.recordKind === "special_runtime") return "特殊運行";
    const tier = tierByRecord.get(record.record);
    return tier === undefined ? "非轉職" : `T${tier}`;
  }

  const recordsByGroup = new Map(GROUP_ORDER.map((group) => [group, []]));
  for (const record of records) recordsByGroup.get(groupOf(record)).push(record);
  for (const groupRecords of recordsByGroup.values()) groupRecords.sort(byDiscovery);

  // -------------------------------------------------------------------------
  // Field projections
  // -------------------------------------------------------------------------

  const codesOf = (record) => (record.codes.agreement
    ? record.codes.side1
    : `${record.codes.side1}${EM}${record.codes.side2}`);

  const nativeLevelsOf = (record) => record.dataRows.slice(0, 3).map((row) => row.level).join(EM);

  const statCellOf = (record, row) => {
    const data = record.dataRows[row];
    return [data.experienceThreshold, data.attack, data.defense, data.maxLife].join(EM);
  };

  /** All codes of a record agree on growth and kill values; this enforces it. */
  function uniqueValueOf(entries, project, label, record) {
    if (entries.length === 0) return null;
    const values = new Set(entries.map((entry) => JSON.stringify(project(entry))));
    if (values.size !== 1) fail(`record ${record.record} has conflicting ${label} across class codes`);
    return project(entries[0]);
  }

  const growthOf = (record) => uniqueValueOf(
    record.postThirdRowGrowth,
    (entry) => ({
      threshold: entry.thresholdIncrement,
      attack: entry.attackIncrement,
      life: entry.maxLifeIncrement,
      specific: entry.source === "native_class_specific_table",
    }),
    "post-third-row growth",
    record,
  );

  const overrideOf = (record) => {
    const classId = CLASS_ID_BY_NATIVE_RECORD[String(record.record)];
    return classId ? CLASS_GROWTH_OVERRIDES[classId] : undefined;
  };

  const growthCellOf = (record) => {
    const growth = growthOf(record);
    const native = `+${growth.threshold}${EM}+${growth.attack}${EM}+0${EM}+${growth.life}`;
    // The native rule stays printed as-is; the marker points at the override
    // section so nobody reads this column as what the game actually derives.
    return overrideOf(record) ? `${native} ※` : native;
  };

  const killRewardOf = (record) => uniqueValueOf(
    record.killRewards,
    (entry) => entry.reward,
    "kill reward",
    record,
  );

  function techniqueTiersOf(record) {
    if (record.directTechnique) return ["傳送（無分層菜單）", "同左", "同左"];
    if (!record.technique) return [null, null, null];
    return [1, 2, 3].map((tier) => {
      const entry = record.technique.tiers.find((candidate) => candidate.tier === tier);
      if (!entry) return null;
      return entry.actions.map((action) => `${action.label}\`${action.actionCode}\``).join("、");
    });
  }

  const shootingRangeOf = (record) => (record.shooting
    ? `${record.shooting.minimumRange}–${record.shooting.maximumRange}`
    : null);

  const traitsOf = (record) => classTraitsFor(CLASS_ID_BY_NATIVE_RECORD[record.record])
    .map((trait) => trait.shortDescription);

  const hitStatusesOf = (record) => record.ordinaryHitStatuses.map((status) => status.effectName);

  const statRowOf = (record) => [
    String(record.record),
    record.name,
    `\`${codesOf(record)}\``,
    lineByRecord.get(record.record) ?? "—",
    nativeLevelsOf(record),
    String(record.dataRows[0].movement),
    ACTION_LABELS[record.playerActionCategory],
    killRewardOf(record) === null ? "—" : String(killRewardOf(record)),
    statCellOf(record, 0),
    statCellOf(record, 1),
    statCellOf(record, 2),
    growthCellOf(record),
    growthOf(record).specific ? "专属" : "默认",
  ];

  // -------------------------------------------------------------------------
  // Markdown
  // -------------------------------------------------------------------------

  const md = [];
  const push = (...lines) => md.push(...lines, "");

  push(
    "# 全職業屬性與成長基線表",
    "",
    "> 由 `scripts/generate-class-reference.mjs` 生成，请勿手工编辑。",
    "> 重新生成：`pnpm docs:classes`",
  );

  push(
    "## 本表定位",
    "",
    "- `[OF]` 本文件只复述已确认的原版数值与结构，不含战力评分、伤害模型或平衡评价。",
    "- `[DD]` 复刻版的平衡诊断与拟议改动写入独立的平衡工作台文档（计划路径",
    "  `design/remake-gdd/balance/class-balance-worksheet.md`，尚未建立），不在本表内改数；",
    "  本表是那份工作台的对照基线。",
    "- `[DD]` 数值口径为**难度 0、side 1、无状态、无地形加成**。難度 3「無法無天」下 side 2 的攻、防、",
    "  最大生命各额外 `+floor(原值/2)`，会改变几乎所有横向结论，见",
    "  [`../05-ai-and-difficulty.md`](../05-ai-and-difficulty.md)。",
    "- 逐职业规则合同仍以 [`../04-units-progression-balance.md`](../04-units-progression-balance.md)、",
    "  [`../03-battle-rules.md`](../03-battle-rules.md) 为准。",
  );

  push(
    "## 读表须知",
    "",
    "1. `[OF]` `DATA` 记录共五行，但**只有前三行是战斗属性**。第四、五行不是 4／5 级属性，",
    "   不能用来外推成长曲线。",
    "2. `[OF]` 达到职业内 3 级后，只有**攻击与最大生命**继续增长；**防御与移动永久固定**。",
    "   这是原版最重要的结构性特征：后期是攻击膨胀、防御停滞。",
    "   标 ※ 的记录带 `[SR]` 成长覆写，实际派生曲线见本节后的覆写表，本表列的仍是原版规则。",
    "3. `[OF]` 法系与弓系职业 3 级后攻击步长为 `+0`；对它们而言面板攻击是死数字。",
    "4. `[OF]` **面板攻击不参与射击与技术伤害**。射击读固定动作表，与射手攻击、目标防御、",
    "   地形防御都无关，也不触发反击。弩兵与魔弓兵职业内 1 级面板攻击同为 `52`，实战差距极大。",
    "5. `[OF]` 转职触发经验 = **职业内 3 级阈值 + 100**（派生成长行 > 3），不是 `DATA` 第四行的经验字段。",
    "6. `[OF]` 转职提交后经验归零、当前生命不变，其余派生属性立即按新职业零经验行重算。",
    "7. `[OF]` 地形防御 = `floor(有效防御 × 该职业地形百分比 / 100)`，按**受击者职业 profile** 取值；",
    "   同一格对不同职业的减伤并不相同，脱离地形 profile 比较防御会失真。",
    "8. `[OF]` 普通反击伤害减半且**没有 `4..7` 随机加成**，先攻则有 `8..14`。高攻低防单位换血占优。",
    "9. `[OF]` 鋼甲戰士 side 2 短码为 `0C`（与神劍戰士撞码）是原版内部不一致，本表原样保留，不得统一。",
    "10. `[OF]` 逻辑地形槽**没有已确认的原版显示名**，一律以槽号 `0..22` 标识，不得按瓦片外观命名。",
  );

  const usedSlots = new Set(terrainTokenMap.data.usedLogicalSlots);
  const unusedSlots = terrainTokenMap.data.logicalSlotsWithoutConfiguredReferences;

  push(
    "## 一、职业分层总览",
    "",
    `分层由原版 ${PROMOTION_EDGE_COUNT} 条转职边从 \`士兵\` 推出，不是文件记录号顺序。`
    + "横向比较只在同层内成立。",
    "",
    table(
      ["分层", "数量", "职业"],
      ["---", "---:", "---"],
      GROUP_ORDER.map((group) => [
        GROUP_TITLES[group],
        String(recordsByGroup.get(group).length),
        recordsByGroup.get(group).map((record) => record.name).join("、"),
      ]),
    ),
  );

  const terminalOrdinary = ordinaryRecords
    .filter((record) => !record.promotion.eligibleAsSource && tierByRecord.has(record.record))
    .sort(byDiscovery);
  const tier3Terminal = terminalOrdinary.filter((record) => tierByRecord.get(record.record) === 3);

  push(
    "- 每层内按原版候选顺序深度优先排列，同一条线保持相邻；记录号只是 `DATA` 文件物理顺序。",
    `- 转职线共 ${PROMOTION_SOURCE_COUNT} 个可转职来源、${PROMOTION_EDGE_COUNT} 条边、`
    + `${terminalOrdinary.length} 个终端职业。`,
    `- **弓兵線在第 3 層即终止**：${tier3Terminal.map((record) => record.name).join("、")}`
    + "没有转职去向，其余各线都能到达第 4 层。这是原版的结构性差异，不是数据缺失。",
    "- `工兵`、`水戰士`、`半龍戰士` 不在普通转职图中，来自关卡职业覆写或固定实例。",
  );

  push("## 二、固定三行与 3 级后成长");
  push(
    "每格为「累计经验阈值`／`攻击`／`防御`／`最大生命`」；"
    + "「3 级后每档」为「额外累计经验`／`攻击`／`防御`／`最大生命`」。",
    "移动在职业内恒定。「原版等级」是 `DATA.field6` 的全树等级，玩家可见的是职业内 `1／2／3／4…`。",
  );

  for (const group of GROUP_ORDER) {
    const groupRecords = recordsByGroup.get(group);
    if (groupRecords.length === 0) continue;
    push(
      `### ${GROUP_TITLES[group]}`,
      "",
      table(STAT_TABLE_HEADERS, STAT_TABLE_ALIGNMENTS, groupRecords.map(statRowOf)),
    );
  }

  const numericExtremes = [
    ["移动", (record) => record.dataRows[0].movement],
    ["3 级攻击", (record) => record.dataRows[2].attack],
    ["3 级防御", (record) => record.dataRows[2].defense],
    ["3 级最大生命", (record) => record.dataRows[2].maxLife],
    ["3 级累计经验", (record) => record.dataRows[2].experienceThreshold],
    ["3 级后攻击步长", (record) => growthOf(record).attack],
    ["3 级后生命步长", (record) => growthOf(record).life],
  ];

  push(
    `### 数值分布速查（仅常规 ${ORDINARY_RECORD_COUNT} 记录）`,
    "",
    "只对 `[OF]` 数值排序，不含任何战力换算。",
    "",
    table(
      ["项目", "最小", "最大", "取最小的职业", "取最大的职业"],
      ["---", "---:", "---:", "---", "---"],
      numericExtremes.map(([label, project]) => {
        const values = ordinaryRecords.map(project);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const named = (target) => ordinaryRecords
          .filter((record) => project(record) === target)
          .sort(byDiscovery)
          .map((record) => record.name)
          .join("、");
        return [label, String(min), String(max), named(min), named(max)];
      }),
    ),
  );

  const overriddenRecords = ordinaryRecords.filter(overrideOf);
  if (overriddenRecords.length > 0) {
    push(
      "### `[SR]` 复刻成长覆写",
      "",
      "上表标 ※ 的记录在 `stableRemake` 下不按原版规则派生。原版数值仍逐字保留在",
      "`class-catalog.generated.ts` 里，本节列出运行时实际使用的分段曲线；关闭覆写即回到上表。",
      "每段为「每档累计经验`／`攻击`／`防御`／`最大生命`」，「覆盖行数」为该段重复的成长行数。",
      "",
      table(
        ["职业", "段", "覆盖行数", "每档", "职业内等级", "该段终点属性"],
        ["---", "---:", "---", "---", "---", "---"],
        overriddenRecords.flatMap((record) => {
          const third = record.dataRows[2];
          let level = 3;
          let attack = third.attack;
          let defense = third.defense;
          let life = third.maxLife;
          return overrideOf(record).map((segment, index) => {
            const rows = segment.rows;
            const span = rows === undefined ? "无限" : String(rows);
            const from = level + 1;
            if (rows === undefined) {
              return [
                index === 0 ? record.name : "",
                String(index + 1),
                span,
                `+${segment.thresholdIncrement}${EM}+${segment.attackIncrement}`
                  + `${EM}+${segment.defenseIncrement}${EM}+${segment.maxLifeIncrement}`,
                `${from} 级起`,
                "每档继续累加",
              ];
            }
            level += rows;
            attack += rows * segment.attackIncrement;
            defense += rows * segment.defenseIncrement;
            life += rows * segment.maxLifeIncrement;
            return [
              index === 0 ? record.name : "",
              String(index + 1),
              span,
              `+${segment.thresholdIncrement}${EM}+${segment.attackIncrement}`
                + `${EM}+${segment.defenseIncrement}${EM}+${segment.maxLifeIncrement}`,
              `${from}–${level} 级`,
              `${attack}${EM}${defense}${EM}${life}`,
            ];
          });
        }),
      ),
      "",
      "`[OF]` 敌方出场经验按「推进 `难度+1` 个整行」取值，落在哪一行与阈值数值无关：",
      "难度 0／1 停在原版固定第 2／3 行，完全不受覆写影响；难度 2／3 位于 3 级之后的成长行，",
      "会随覆写变化（难度 3 另有原版 side 2 的 `+50%` 修正）。",
    );
  }

  if (SIDE1_ONLY_SHOOTING_CLASSES.length > 0) {
    push(
      "### `[SR]` 仅 side 1 的射击授予",
      "",
      "下列职业在原版没有射击记录，`stableRemake` 只给我方授予一个复刻版射击动作；",
      "敌方维持原版纯近战行为，因此这些职业当敌人出场的关卡不受影响。",
      "面板攻击、防御、生命与地形 profile 全部保持原版。",
      "",
      table(
        ["职业", "side 1", "side 2"],
        ["---", "---", "---"],
        SIDE1_ONLY_SHOOTING_CLASSES.map((classId) => [
          CLASS_CATALOG[classId].nativeName,
          "普通攻擊 ＋ 射擊",
          "普通攻擊",
        ]),
      ),
    );
  }

  push(
    "## 三、转职关系",
    "",
    `${PROMOTION_EDGE_COUNT} 条边按转职树顺序、各来源内按原版候选序号排列；`
    + `「触发经验」是来源职业的职业内 3 级阈值 + ${PROMOTION_TRIGGER_MARGIN}。`,
    "",
    table(
      ["来源", "候选序号", "目标", "来源触发累计经验", "目标起始原版等级"],
      ["---", "---:", "---", "---:", "---:"],
      [...unitCatalog.data.promotionEdges]
        .sort((a, b) => byDiscovery(a, b) || a.optionIndex - b.optionIndex)
        .map((edge) => [
          `${edge.sourceName}（${edge.sourceRecord}）`,
          String(edge.optionIndex),
          `${edge.targetName}（${edge.targetRecord}）`,
          String(recordByNumber.get(edge.sourceRecord).promotion.triggerExperienceThreshold),
          String(edge.targetStartLevel),
        ]),
    ),
  );

  push(
    "**终端职业（无转职去向）**：",
    `${terminalOrdinary
      .map((record) => `${record.name}（T${tierByRecord.get(record.record)}）`)
      .join("、")}。`,
  );

  const actionRecords = records.filter(
    (record) => record.playerActionCategory !== "ordinary"
      || hitStatusesOf(record).length > 0
      || traitsOf(record).length > 0,
  );

  push(
    "## 四、行动能力、命中附加与职业特例",
    "",
    "只列出有非普通行动、普通命中附加状态或职业特例的记录；其余记录只有普通攻击且无特例。",
    "",
    table(
      ["记录", "职业", "行动", "AI 分派 side 1／2", "射擊 射程", "普通命中附加", "职业特例"],
      ["---:", "---", "---", "---", "---", "---", "---"],
      actionRecords.map((record) => [
        String(record.record),
        record.name,
        ACTION_LABELS[record.playerActionCategory],
        `${record.aiClassDispatch.side1}${EM}${record.aiClassDispatch.side2}`,
        shootingRangeOf(record),
        hitStatusesOf(record).join("、") || null,
        traitsOf(record).join("、") || null,
      ]),
    ),
  );

  const menuVsDispatchDivergence = records.filter(
    (record) => record.playerActionCategory === "technique"
      && record.aiClassDispatch.side1 === "ordinary",
  );
  push(
    "`[OF]`「行动」是玩家行动菜单类别，「AI 分派」是敌方决策分支，两者可以不一致："
    + `${menuVsDispatchDivergence.map((record) => record.name).join("、")}`
    + "走技術菜单但 AI 按普通单位分派，不得为了整齐把两栏统一。",
  );

  push(
    "### 射擊固定伤害表",
    "",
    "`[OF]` 射击不读取射手攻击、目标防御或地形防御，也不触发反击。",
    "「伤害」「经验」两栏是原生取证描述原文；产品级中文表述与敌我统一结论见",
    "[`../03-battle-rules.md`](../03-battle-rules.md) 的「面板攻击力与射击伤害」。",
    "",
    table(
      ["记录", "职业", "射程", "伤害", "经验"],
      ["---:", "---", "---", "---", "---"],
      records.filter((record) => record.shooting).map((record) => [
        String(record.record),
        record.name,
        shootingRangeOf(record),
        record.shooting.damage,
        record.shooting.experience,
      ]),
    ),
  );

  push(
    "### 技術菜单（按技術階級）",
    "",
    `\`[OF]\` 技術階級选择器为 \`${TECHNIQUE_TIER_SELECTOR}\`，即职业内成长行减一并夹到 \`0..2\`：`,
    "职业内 1 级用 1 階、2 级用 2 階、3 级及以后用 3 階。同一階級内按原版菜单顺序排列。",
    "",
    table(
      ["记录", "职业", "1 階", "2 階", "3 階"],
      ["---:", "---", "---", "---", "---"],
      records
        .filter((record) => record.technique || record.directTechnique)
        .map((record) => [String(record.record), record.name, ...techniqueTiersOf(record)]),
    ),
  );

  push(
    "## 五、地形 profile",
    "",
    `每个职业引用一张移动规则 profile 和一张地形防御 profile，各 ${LOGICAL_TERRAIN_SLOTS} 个逻辑槽。`,
    "移动值 `1..5` 是落点步长代价，`98／99` 为不可进入；地形防御值是百分比，进入",
    "`floor(有效防御 × 百分比 / 100)`。",
    `现存 ${terrainTokenMap.data.stageCount} 个关卡模板实际使用槽 `
    + `${terrainTokenMap.data.usedLogicalSlots.join("、")}；`,
    `槽 ${unusedSlots.join("、")} 没有任何模板引用（下表以 \`·\` 标注）。`,
  );

  const profilePairKey = (record) => `${record.mapRules.movementProfile}/${record.mapRules.terrainDefenseProfile}`;
  push(
    "### 职业 → profile 映射",
    "",
    table(
      ["移动 profile", "地形防御 profile", "职业"],
      ["---:", "---:", "---"],
      [...new Set(records.map(profilePairKey))]
        .map((key) => key.split("/").map(Number))
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .map(([movement, defense]) => [
          String(movement),
          String(defense),
          records
            .filter((record) => profilePairKey(record) === `${movement}/${defense}`)
            .map((record) => record.name)
            .join("、"),
        ]),
    ),
  );

  /** Profiles carrying the out-of-domain `0` are flagged so nobody reads it as "free terrain". */
  const zeroBearingProfiles = { movementProfile: [], terrainDefenseProfile: [] };

  function profileTable(kind, valuesOf) {
    const profileIndexes = [...new Set(records.map((record) => record.mapRules[kind]))]
      .sort((a, b) => a - b);
    const valuesByProfile = new Map(
      profileIndexes.map((index) => {
        const owner = records.find((record) => record.mapRules[kind] === index);
        return [index, valuesOf(mapRecordByRecord.get(owner.record))];
      }),
    );
    for (const index of profileIndexes) {
      if (valuesByProfile.get(index).includes(0)) zeroBearingProfiles[kind].push(index);
    }
    const rows = [];
    for (let slot = 0; slot < LOGICAL_TERRAIN_SLOTS; slot += 1) {
      rows.push([
        `槽 ${slot}${usedSlots.has(slot) ? "" : " ·"}`,
        ...profileIndexes.map((index) => String(valuesByProfile.get(index)[slot])),
      ]);
    }
    return table(
      ["地形槽", ...profileIndexes.map((index) => `P${index}`)],
      ["---", ...profileIndexes.map(() => "---:")],
      rows,
    );
  }

  push(
    "### 移动规则 profile（列为 profile 号）",
    "",
    profileTable("movementProfile", (record) => record.movementRules),
  );
  push(
    "### 地形防御百分比 profile（列为 profile 号）",
    "",
    profileTable("terrainDefenseProfile", (record) => record.terrainDefensePercents),
  );
  push(
    "`[OF]` 值 `0` 不在两张 profile 的原版有效值域内（移动为 `1..5／98／99`，地形防御为 `1..50／99`）。",
    `移动 profile ${zeroBearingProfiles.movementProfile.map((index) => `P${index}`).join("、")} `
    + `与地形防御 profile ${zeroBearingProfiles.terrainDefenseProfile.map((index) => `P${index}`).join("、")} `
    + "含 `0`，它们只属于特殊运行记录，表示该槽未被配置，",
    "不能读成「零代价」或「零减伤」。",
  );

  push(
    "## 六、生成来源",
    "",
    table(
      ["文件", "字节", "SHA-256"],
      ["---", "---:", "---"],
      sources.map((source) => [`\`${source.path}\``, String(source.bytes), `\`${source.sha256}\``]),
    ),
  );

  push(
    "生成器另外导入 `src/game/content/class-catalog.generated.ts` 与 `src/game/content/class-traits.ts`，",
    "并断言运行时成长行、地形百分比与原生目录一致；任一来源漂移都会中止生成而不是写出旧表。",
    "",
    `同目录 [\`${path.basename(csvPath)}\`](${path.basename(csvPath)}) 是同一批数据的扁平版本，`,
    "适合导入表格工具做排序与演算。",
  );

  // -------------------------------------------------------------------------
  // CSV
  // -------------------------------------------------------------------------

  const csvColumns = [
    ["record", (record) => record.record],
    ["name", (record) => record.name],
    ["record_kind", (record) => record.recordKind],
    ["group", (record) => groupOf(record)],
    ["tier", (record) => tierByRecord.get(record.record) ?? ""],
    ["line", (record) => lineByRecord.get(record.record) ?? ""],
    ["side1_code", (record) => record.codes.side1],
    ["side2_code", (record) => record.codes.side2],
    ["action_category", (record) => record.playerActionCategory],
    ["ai_dispatch_side1", (record) => record.aiClassDispatch.side1],
    ["ai_dispatch_side2", (record) => record.aiClassDispatch.side2],
    ["native_levels", (record) => record.dataRows.slice(0, 3).map((row) => row.level).join("|")],
    ["movement", (record) => record.dataRows[0].movement],
    ["kill_reward", (record) => killRewardOf(record) ?? ""],
    ["lv1_experience", (record) => record.dataRows[0].experienceThreshold],
    ["lv1_attack", (record) => record.dataRows[0].attack],
    ["lv1_defense", (record) => record.dataRows[0].defense],
    ["lv1_max_life", (record) => record.dataRows[0].maxLife],
    ["lv2_experience", (record) => record.dataRows[1].experienceThreshold],
    ["lv2_attack", (record) => record.dataRows[1].attack],
    ["lv2_defense", (record) => record.dataRows[1].defense],
    ["lv2_max_life", (record) => record.dataRows[1].maxLife],
    ["lv3_experience", (record) => record.dataRows[2].experienceThreshold],
    ["lv3_attack", (record) => record.dataRows[2].attack],
    ["lv3_defense", (record) => record.dataRows[2].defense],
    ["lv3_max_life", (record) => record.dataRows[2].maxLife],
    ["post3_experience_step", (record) => growthOf(record).threshold],
    ["post3_attack_step", (record) => growthOf(record).attack],
    ["post3_defense_step", () => 0],
    ["post3_max_life_step", (record) => growthOf(record).life],
    ["post3_growth_table", (record) => (growthOf(record).specific ? "class_specific" : "default")],
    ["promotion_eligible", (record) => (record.promotion.eligibleAsSource ? "yes" : "no")],
    [
      "promotion_trigger_experience",
      (record) => (record.promotion.eligibleAsSource ? record.promotion.triggerExperienceThreshold : ""),
    ],
    ["promotion_from", (record) => record.promotion.sources.map((entry) => entry.name).join("|")],
    ["promotion_to", (record) => record.promotion.targets.map((entry) => entry.name).join("|")],
    ["shooting_min_range", (record) => record.shooting?.minimumRange ?? ""],
    ["shooting_max_range", (record) => record.shooting?.maximumRange ?? ""],
    ["shooting_damage", (record) => record.shooting?.damage ?? ""],
    ["shooting_experience", (record) => record.shooting?.experience ?? ""],
    ["technique_tier1", (record) => techniqueTiersOf(record)[0] ?? ""],
    ["technique_tier2", (record) => techniqueTiersOf(record)[1] ?? ""],
    ["technique_tier3", (record) => techniqueTiersOf(record)[2] ?? ""],
    ["ordinary_hit_status", (record) => hitStatusesOf(record).join("|")],
    ["class_traits", (record) => traitsOf(record).join("|")],
    ["movement_profile", (record) => record.mapRules.movementProfile],
    ["terrain_defense_profile", (record) => record.mapRules.terrainDefenseProfile],
    ["movement_rules", (record) => mapRecordByRecord.get(record.record).movementRules.join("|")],
    [
      "terrain_defense_percents",
      (record) => mapRecordByRecord.get(record.record).terrainDefensePercents.join("|"),
    ],
  ];

  function csvCell(value) {
    const text = String(value).replaceAll("`", "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  const csv = [
    csvColumns.map(([header]) => header).join(","),
    ...records.map((record) => csvColumns.map(([, project]) => csvCell(project(record))).join(",")),
  ].join("\n");

  return {
    markdown: `${md.join("\n").trimEnd()}\n`,
    csv: `${csv}\n`,
    summary: `${records.length} records, ${PROMOTION_EDGE_COUNT} promotion edges, `
      + `${csvColumns.length} csv columns`,
  };
}

if (import.meta.main) {
  const { markdown, csv, summary } = await buildClassReference();
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(markdownPath, markdown, "utf8");
  await writeFile(csvPath, csv, "utf8");
  console.log(
    `wrote ${path.relative(root, markdownPath)} and ${path.relative(root, csvPath)} (${summary})`,
  );
}
