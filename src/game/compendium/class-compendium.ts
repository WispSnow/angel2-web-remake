import {
  CLASS_IDS,
  classCombatRole,
  classDefinition,
  classStatsFor,
  killRewardFor,
  nextExperienceThresholdFor,
  type ClassId,
} from "../content/classes";
import { classTraitsFor, type ClassTrait } from "../content/class-traits";
import { SCRIPTED_BOSS_STATS } from "../content/enemy-scaling";
import { allyMapUnitAsset, enemyMapUnitAsset } from "../content/map-unit-assets";
import { FULL_COMBAT_ACCEPTANCE, type FullCombatReach } from "../content/full-combat-acceptance";
import { BATTLE_ACTION_DEFINITIONS, shootingActionIdFor } from "../content/actions";

/**
 * 職業圖鑑的視圖模型。
 *
 * 這裡一個規則數字都不自己寫：固定三行、轉職邊、擊殺經驗與射擊參數都從
 * `class-catalog.generated.ts` 與正式動作目錄取值，3 級後成長更直接對
 * `classStatsFor`／`nextExperienceThresholdFor` 取樣，所以 `CLASS_GROWTH_OVERRIDES`
 * 之類的平衡覆寫會自動反映到圖鑑上，不會出現「文件說一套、戰鬥算另一套」。
 */

export type CompendiumGroupId = "tier-1" | "tier-2" | "tier-3" | "tier-4" | "off-tree" | "runtime";

export interface CompendiumStatRow {
  readonly level: number;
  readonly experience: number;
  readonly attack: number;
  readonly defense: number;
  readonly maxLife: number;
}

/** 一段連續的、每檔增量相同的 3 級後成長。`rows` 為 `null` 表示一直重複下去。 */
export interface CompendiumGrowthSegment {
  readonly rows: number | null;
  readonly fromLevel: number;
  readonly experience: number;
  readonly attack: number;
  readonly defense: number;
  readonly maxLife: number;
}

export interface CompendiumPromotionTarget {
  readonly id: ClassId;
  readonly name: string;
}

export interface CompendiumShooting {
  readonly minimumDistance: number;
  readonly maximumDistance: number;
  readonly damage: string;
  readonly experience: string;
  readonly note?: string;
}

export interface CompendiumTechniqueTier {
  readonly level: number;
  readonly labels: readonly string[];
}

export interface CompendiumScriptedStats {
  readonly difficulty: number;
  readonly attack: number;
  readonly defense: number;
  readonly maxLife: number;
}

export interface CompendiumEntry {
  readonly id: ClassId;
  readonly name: string;
  readonly group: CompendiumGroupId;
  readonly nativeRecord: number;
  readonly codeSide1: string;
  readonly codeSide2: string;
  readonly mapSprites: Readonly<{
    ally?: string;
    enemy: string;
  }>;
  readonly fullCombatReach: FullCombatReach;
  readonly movement: number;
  readonly role: "melee" | "ranged";
  readonly actionLabel: string;
  readonly killReward: number;
  readonly rows: readonly CompendiumStatRow[];
  readonly growth: readonly CompendiumGrowthSegment[];
  readonly growthNote?: string;
  readonly promotionExperience: number | null;
  readonly promotionTargets: readonly CompendiumPromotionTarget[];
  readonly promotedFrom: readonly CompendiumPromotionTarget[];
  readonly traits: readonly ClassTrait[];
  readonly shooting?: CompendiumShooting;
  readonly techniqueTiers: readonly CompendiumTechniqueTier[];
  readonly directTechnique?: string;
  /** 不在職業動作表裡、由運行時調度器提供的動作。 */
  readonly runtimeAction?: string;
  readonly scriptedStats: readonly CompendiumScriptedStats[];
  readonly notes: readonly string[];
}

export interface CompendiumTreeNode {
  readonly id: ClassId;
  readonly depth: number;
  readonly children: readonly CompendiumTreeNode[];
}

export const COMPENDIUM_GROUP_LABELS: Readonly<Record<CompendiumGroupId, string>> = {
  "tier-1": "第 1 層 · 起始職業",
  "tier-2": "第 2 層 · 一次轉職",
  "tier-3": "第 3 層 · 二次轉職",
  "tier-4": "第 4 層 · 終極職業",
  "off-tree": "非轉職記錄",
  runtime: "特殊運行記錄",
};

const ROOT_CLASS_ID: ClassId = "soldier";

/** 轉職圖的深度就是原版分層：由 `士兵` 沿 31 條轉職邊推出，不是記錄號順序。 */
function buildTree(id: ClassId, depth: number): CompendiumTreeNode {
  const targets = classDefinition(id).promotion.targets;
  return {
    id,
    depth,
    children: targets.map((target) => buildTree(target.id, depth + 1)),
  };
}

export const PROMOTION_TREE: CompendiumTreeNode = buildTree(ROOT_CLASS_ID, 1);

function flattenTree(node: CompendiumTreeNode, into: Map<ClassId, number>): Map<ClassId, number> {
  into.set(node.id, node.depth);
  for (const child of node.children) flattenTree(child, into);
  return into;
}

const TREE_DEPTH = flattenTree(PROMOTION_TREE, new Map<ClassId, number>());

/** 依原版候選順序展開的轉職樹，供左欄逐行渲染。 */
export function flattenPromotionTree(): readonly CompendiumTreeNode[] {
  const rows: CompendiumTreeNode[] = [];
  const walk = (node: CompendiumTreeNode): void => {
    rows.push(node);
    for (const child of node.children) walk(child);
  };
  walk(PROMOTION_TREE);
  return rows;
}

export const OFF_TREE_CLASS_IDS: readonly ClassId[] = CLASS_IDS.filter(
  (id) => !TREE_DEPTH.has(id) && classDefinition(id).recordKind === "ordinary_catalog",
);

export const RUNTIME_CLASS_IDS: readonly ClassId[] = CLASS_IDS.filter(
  (id) => classDefinition(id).recordKind !== "ordinary_catalog",
);

function groupOf(id: ClassId): CompendiumGroupId {
  const depth = TREE_DEPTH.get(id);
  if (depth === 1) return "tier-1";
  if (depth === 2) return "tier-2";
  if (depth === 3) return "tier-3";
  if (depth === 4) return "tier-4";
  return classDefinition(id).recordKind === "ordinary_catalog" ? "off-tree" : "runtime";
}

const PROMOTION_SOURCES = ((): ReadonlyMap<ClassId, readonly CompendiumPromotionTarget[]> => {
  const sources = new Map<ClassId, CompendiumPromotionTarget[]>();
  for (const id of CLASS_IDS) {
    for (const target of classDefinition(id).promotion.targets) {
      const list = sources.get(target.id) ?? [];
      list.push({ id, name: classDefinition(id).nativeName });
      sources.set(target.id, list);
    }
  }
  return sources;
})();

/**
 * 3 級後成長不從資料表抄，而是沿 `nextExperienceThresholdFor` 逐檔向前走一遍再壓縮。
 * 覆寫層允許分段（`REMAKE-092` 半龍戰士就是三段 + 終局段），逐檔取樣是唯一能同時
 * 表達原版單段與覆寫多段、又保證與戰鬥同值的做法。取樣 12 檔足以走過現有全部分段。
 */
const GROWTH_SAMPLE_ROWS = 12;

function growthSegmentsFor(id: ClassId): readonly CompendiumGrowthSegment[] {
  const thirdRow = classDefinition(id).dataRows[2];
  let experience: number = thirdRow.experienceThreshold;
  let stats = classStatsFor({ classId: id, experience });
  const steps: Omit<CompendiumGrowthSegment, "rows">[] = [];
  for (let index = 0; index < GROWTH_SAMPLE_ROWS; index += 1) {
    const next = nextExperienceThresholdFor({ classId: id, experience });
    if (next >= Number.MAX_SAFE_INTEGER) break;
    const nextStats = classStatsFor({ classId: id, experience: next });
    steps.push({
      fromLevel: stats.level,
      experience: next - experience,
      attack: nextStats.attack - stats.attack,
      defense: nextStats.defense - stats.defense,
      maxLife: nextStats.maxLife - stats.maxLife,
    });
    experience = next;
    stats = nextStats;
  }

  const segments: CompendiumGrowthSegment[] = [];
  for (const step of steps) {
    const last = segments[segments.length - 1];
    const same = last
      && last.experience === step.experience
      && last.attack === step.attack
      && last.defense === step.defense
      && last.maxLife === step.maxLife;
    if (same && last) {
      segments[segments.length - 1] = { ...last, rows: (last.rows ?? 0) + 1 };
      continue;
    }
    segments.push({ ...step, rows: 1 });
  }
  // 取樣窗口末端那一段沒有觀察到終點，按規則它會一直重複下去。
  const tail = segments[segments.length - 1];
  if (tail && steps.length === GROWTH_SAMPLE_ROWS) {
    segments[segments.length - 1] = { ...tail, rows: null };
  }
  return segments;
}

const SHOOTING_NOTES: Readonly<Partial<Record<ClassId, string>>> = {
  "magic-archer": "屬於魔法傷害：穿透彈道上的其餘單位各承受半額傷害，防魔護盾可完全抵擋。",
  "water-warrior": "依據 REMAKE-093 賦予我方專屬遠程射擊能力；敵方水戰士維持原版純近戰設定。",
};

function shootingFor(id: ClassId): CompendiumShooting | undefined {
  const actionId = shootingActionIdFor(id, 1);
  if (!actionId) return undefined;
  const { range, damage, experience } = BATTLE_ACTION_DEFINITIONS[actionId];
  const note = SHOOTING_NOTES[id];
  // 魔弓的擲骰先減半再對選定目標翻倍，所以選定目標實得的是偶數化後的全額。
  const halved = "selectedTargetMultiplier" in damage && damage.selectedTargetMultiplier === 2;
  return {
    minimumDistance: range.minimumDistance,
    maximumDistance: range.maximumDistance,
    damage: halved
      ? `選定主目標 ${Math.floor(damage.minimum / 2) * 2}–${Math.floor(damage.maximum / 2) * 2}`
        + `，沿線其餘單位 ${Math.floor(damage.minimum / 2)}–${Math.floor(damage.maximum / 2)}`
      : `${damage.minimum}–${damage.maximum}`,
    // REMAKE-138: 弓／弩的施法經驗是固定值，只有魔弓借用 `3V` 的那一次擲骰是活的。
    experience: "fixed" in experience
      ? `擊殺獎勵 + ${experience.fixed}`
      : `擊殺獎勵 + ${experience.base + experience.randomMinimum}–${experience.base + experience.randomMaximum}`,
    ...(note ? { note } : {}),
  };
}

function techniqueTiersFor(id: ClassId): readonly CompendiumTechniqueTier[] {
  const tiers = classDefinition(id).technique?.tiers ?? [];
  return tiers.map((tier) => ({
    level: tier.tier,
    labels: tier.actions.map((action) => action.label),
  }));
}

function scriptedStatsFor(id: ClassId): readonly CompendiumScriptedStats[] {
  const table = SCRIPTED_BOSS_STATS[id as keyof typeof SCRIPTED_BOSS_STATS];
  if (!table) return [];
  return table.map((stats, difficulty) => ({ difficulty, ...stats }));
}

/**
 * 這四個記錄的動作不從職業動作表取得，而是由原版的專用調度器提供，因此職業目錄裡的
 * `technique`／`shooting` 都是空的——不能據此說它們「只有普通攻擊」。
 */
const RUNTIME_ACTIONS: Readonly<Partial<Record<ClassId, string>>> = {
  empress: "「WD」（女帝與龍專用的運行時特殊法術，沿合法路徑造成飽和傷害，防魔護盾可完全抵擋）",
  dragon: "「WD」（女帝與龍專用的運行時特殊法術，沿合法路徑造成飽和傷害，防魔護盾可完全抵擋）",
  head: "第 37 關首領特定部位，由該關專屬事件邏輯驅動。",
  hand: "第 37 關首領特定部位，由該關專屬事件邏輯驅動。",
};

const ACTION_LABELS: Readonly<Record<string, string>> = {
  ordinary: "普通",
  shooting: "射擊",
  technique: "技術",
  special_runtime: "特殊運行",
};

const CLASS_NOTES: Readonly<Partial<Record<ClassId, readonly string[]>>> = {
  crossbow: ["弓兵系轉職路線於三階終止：弩兵無後續上位轉職，此為原版既定架構，並非資料缺失。"],
  "magic-archer": ["弓兵系轉職路線於三階終止：魔弓兵無後續上位轉職，此為原版既定架構，並非資料缺失。"],
  "half-dragon-warrior": [
    "不屬於常規轉職樹：自第 22 關起作為固定成員登場，無上位轉職。",
    "依據 REMAKE-092 將 3 級前的優質成長率延續至職業 6 級，此後回歸原版終局成長速率。",
  ],
  "water-warrior": [
    "不屬於常規轉職樹：由特定關卡固定陣容登場。",
    "遭受常規近戰攻擊且存活時將觸發分裂，同隊分裂體共享生命值。",
  ],
  engineer: ["不屬於常規轉職樹：由特定關卡職業配置登場，其專屬技術可用於鋪設改變地形。"],
  empress: [
    "特殊機制角色，僅作為我方登場；面板攻擊力不參與「WD」結算，該技能採用固定傷害標準。",
    "原版三行屬性固定為 10／10／10，本表照實記錄未作修改。",
  ],
  dragon: ["劇情首領：僅作為敵方登場，原版未提供 side 1 我方地圖模型。", "必定免疫普攻與法術附加的混亂狀態；可被施毒，每回合生命值降至三分之一。"],
  head: ["劇情首領：僅作為敵方登場，原版未提供 side 1 我方地圖模型。", "必定免疫普攻與法術附加的混亂狀態；可被施毒，每回合生命值降至三分之一。"],
  hand: ["劇情首領：僅作為敵方登場，原版未提供 side 1 我方地圖模型。", "必定免疫普攻與法術附加的混亂狀態；可被施毒，每回合生命值降至三分之一。"],
};

function buildEntry(id: ClassId): CompendiumEntry {
  const definition = classDefinition(id);
  const allySprite = allyMapUnitAsset(id);
  const acceptance = FULL_COMBAT_ACCEPTANCE[definition.nativeRecord];
  if (!acceptance || acceptance.classId !== id) {
    throw new Error(`full-combat acceptance does not match class ${id}`);
  }
  const rows = definition.dataRows.slice(0, 3).map((row, index) => ({
    level: index + 1,
    experience: row.experienceThreshold,
    attack: row.attack,
    defense: row.defense,
    maxLife: row.maxLife,
  }));
  const direct = definition.directTechnique;
  const shooting = shootingFor(id);
  return {
    id,
    name: definition.nativeName,
    group: groupOf(id),
    nativeRecord: definition.nativeRecord,
    codeSide1: definition.codes.side1,
    codeSide2: definition.codes.side2,
    mapSprites: {
      ...(allySprite ? { ally: allySprite } : {}),
      enemy: enemyMapUnitAsset(id),
    },
    fullCombatReach: acceptance.reach,
    movement: definition.dataRows[0].movement,
    role: classCombatRole(id),
    actionLabel: ACTION_LABELS[definition.actionCategory] ?? definition.actionCategory,
    killReward: killRewardFor(id, 1),
    rows,
    growth: growthSegmentsFor(id),
    promotionExperience: definition.promotion.triggerExperienceThreshold,
    promotionTargets: definition.promotion.targets.map((target) => ({
      id: target.id,
      name: classDefinition(target.id).nativeName,
    })),
    promotedFrom: PROMOTION_SOURCES.get(id) ?? [],
    traits: classTraitsFor(id),
    ...(shooting ? { shooting } : {}),
    techniqueTiers: techniqueTiersFor(id),
    ...(direct ? { directTechnique: "傳送" } : {}),
    ...(RUNTIME_ACTIONS[id] ? { runtimeAction: RUNTIME_ACTIONS[id] } : {}),
    scriptedStats: scriptedStatsFor(id),
    notes: CLASS_NOTES[id] ?? [],
  };
}

const ENTRIES: ReadonlyMap<ClassId, CompendiumEntry> = new Map(
  CLASS_IDS.map((id) => [id, buildEntry(id)] as const),
);

export function compendiumEntry(id: ClassId): CompendiumEntry {
  const entry = ENTRIES.get(id);
  if (!entry) throw new Error(`unknown compendium class ${id}`);
  return entry;
}

export const COMPENDIUM_DEFAULT_CLASS_ID: ClassId = ROOT_CLASS_ID;
