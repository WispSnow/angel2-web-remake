import {
  CLASS_CATALOG,
  CLASS_ID_BY_NATIVE_RECORD,
  CLASS_IDS,
  type ClassId,
} from "./class-catalog.generated";
import { CLASS_GROWTH_OVERRIDES, type ClassGrowthSegment } from "./class-balance-overrides";
import { genericAllyLabelFor } from "./generic-ally-labels";
import type { EnemyGrowthMode } from "./enemy-scaling";
import type { BattleUnit, UnitStats } from "../types";
import type { PortraitRecord } from "./portrait-catalog.generated";

export {
  CLASS_CATALOG,
  CLASS_ID_BY_NATIVE_RECORD,
  CLASS_IDS,
  type ClassId,
};

export type ClassActionCategory = "ordinary" | "shooting" | "technique" | "special_runtime";
export type ClassCombatRole = "melee" | "ranged";
export type ClassTargetPriorityProfile = "none" | "caster" | "shooter";
export type OrdinaryHitStatusKey = "confusion" | "attackDown" | "defenseDown" | "poison";

export interface OrdinaryHitStatus {
  key: OrdinaryHitStatusKey;
  counter: number;
}

const STABLE_REMAKE_ORDINARY_HIT_STATUS_IMMUNITIES = {
  confusion: ["dragon", "head", "hand"],
} as const satisfies Readonly<Partial<Record<OrdinaryHitStatusKey, readonly ClassId[]>>>;

/**
 * REMAKE-053 closes the native split where LA honors 1P/2P/3P immunity but
 * ordinary-hit writes to the same status slot bypass it. REMAKE-124 later
 * opens poison for both technique and ordinary-hit sources, so only confusion
 * remains in this immunity table.
 */
export function isClassImmuneToOrdinaryHitStatus(
  classId: ClassId,
  status: OrdinaryHitStatusKey,
): boolean {
  const immuneClasses = STABLE_REMAKE_ORDINARY_HIT_STATUS_IMMUNITIES[status as
    keyof typeof STABLE_REMAKE_ORDINARY_HIT_STATUS_IMMUNITIES];
  return immuneClasses?.some((immuneClass) => immuneClass === classId) ?? false;
}

const STABLE_REMAKE_POISON_BOSS_CLASSES = ["dragon", "head", "hand"] as const;

/** REMAKE-124 leaves ordinary poison at one half and reduces boss life to one third. */
export function poisonRemainingLifeDivisorFor(classId: ClassId): 2 | 3 {
  return STABLE_REMAKE_POISON_BOSS_CLASSES.some((bossClass) => bossClass === classId)
    ? 3
    : 2;
}

export interface PromotionTarget {
  id: ClassId;
  nativeRecord: number;
  optionIndex: number;
  targetStartLevel: number;
}

export function isClassId(value: unknown): value is ClassId {
  return typeof value === "string" && (CLASS_IDS as readonly string[]).includes(value);
}

export function classDefinition(classId: ClassId): (typeof CLASS_CATALOG)[ClassId] {
  return CLASS_CATALOG[classId];
}

export function classIdFromNativeRecord(record: number): ClassId | undefined {
  const key = String(record) as keyof typeof CLASS_ID_BY_NATIVE_RECORD;
  return CLASS_ID_BY_NATIVE_RECORD[key];
}

export function className(classId: ClassId): string {
  return classDefinition(classId).nativeName;
}

/**
 * REMAKE-066 tactical responsibility, separate from the native action menu
 * and dispatcher. In particular, technique-menu melee careers and runtime
 * bosses keep a front-line role, while bows and the full sister progression
 * share the ranged positioning policy.
 */
const CLASS_COMBAT_ROLE = {
  soldier: "melee",
  "magic-sword-warrior": "melee",
  "jungle-warrior": "melee",
  "magic-priest": "ranged",
  "prayer-guide": "ranged",
  "curse-master": "ranged",
  magician: "ranged",
  "great-axe-warrior": "melee",
  "half-dragon-warrior": "melee",
  "magic-armor-warrior": "melee",
  "magic-guide": "ranged",
  "evil-mage": "ranged",
  "magic-archer": "ranged",
  "land-knight": "melee",
  "demon-dragon-knight": "melee",
  "flying-dragon-knight": "melee",
  "beast-knight": "melee",
  "bone-knight": "melee",
  "swift-dragon-knight": "melee",
  "great-dragon-knight": "melee",
  archer: "ranged",
  crossbow: "ranged",
  cavalry: "melee",
  "pegasus-warrior": "melee",
  sister: "ranged",
  monk: "ranged",
  "water-warrior": "melee",
  "divine-sword-warrior": "melee",
  warrior: "melee",
  "steel-armor-warrior": "melee",
  priest: "ranged",
  wizard: "ranged",
  "magic-master": "ranged",
  "evil-sword-warrior": "melee",
  engineer: "melee",
  empress: "melee",
  dragon: "melee",
  head: "melee",
  hand: "melee",
} as const satisfies Readonly<Record<ClassId, ClassCombatRole>>;

export function classCombatRole(classId: ClassId): ClassCombatRole {
  return CLASS_COMBAT_ROLE[classId];
}

/**
 * REMAKE-082 target value is independent from action menus, AI dispatch and
 * melee/ranged positioning. This prevents technique-menu melee careers from
 * inheriting caster priority while still recognizing the shooting line.
 */
const CLASS_TARGET_PRIORITY_PROFILE = {
  soldier: "none",
  "magic-sword-warrior": "none",
  "jungle-warrior": "none",
  "magic-priest": "caster",
  "prayer-guide": "caster",
  "curse-master": "caster",
  magician: "caster",
  "great-axe-warrior": "none",
  "half-dragon-warrior": "none",
  "magic-armor-warrior": "none",
  "magic-guide": "caster",
  "evil-mage": "caster",
  "magic-archer": "shooter",
  "land-knight": "none",
  "demon-dragon-knight": "none",
  "flying-dragon-knight": "none",
  "beast-knight": "none",
  "bone-knight": "none",
  "swift-dragon-knight": "none",
  "great-dragon-knight": "none",
  archer: "shooter",
  crossbow: "shooter",
  cavalry: "none",
  "pegasus-warrior": "none",
  sister: "caster",
  monk: "caster",
  "water-warrior": "none",
  "divine-sword-warrior": "none",
  warrior: "none",
  "steel-armor-warrior": "none",
  priest: "caster",
  wizard: "caster",
  "magic-master": "caster",
  "evil-sword-warrior": "none",
  engineer: "none",
  empress: "none",
  dragon: "none",
  head: "none",
  hand: "none",
} as const satisfies Readonly<Record<ClassId, ClassTargetPriorityProfile>>;

export function classTargetPriorityProfile(classId: ClassId): ClassTargetPriorityProfile {
  return CLASS_TARGET_PRIORITY_PROFILE[classId];
}

/**
 * `0P/1P` are the only classes the native dispatcher sends to `1000:1A68`.
 * That routine owns a WD-only skill pool and its own life bands, including
 * the one native case where a class both retreats and still casts.
 */
export function usesEmpressOrDragonAi(classId: ClassId): boolean {
  return classDefinition(classId).aiClassDispatch.side2 === "empressOrDragonTechnique";
}

/**
 * The native dispatcher, rather than the presence of a 技術 menu, identifies
 * the caster careers. Half-dragon warriors and engineers already dispatch as
 * ordinary AI; great dragon knights are the one technique-dispatch melee
 * career and retain their adjacent attack comparison alongside 龍踏.
 */
export function usesTechniqueAi(
  classId: ClassId,
  side: BattleUnit["side"],
): boolean {
  const dispatch = classDefinition(classId).aiClassDispatch;
  return classId !== "great-dragon-knight"
    && (side === 1 ? dispatch.side1 : dispatch.side2) === "technique";
}

/**
 * The native generic fallback table is side-1 data. These records are the
 * corresponding side-2 portrait variants where the original asset exists.
 * Native table C deliberately reuses records 51 (0N/水戰士) and 64
 * (1N/半龍戰士) for both sides; neither has a separate enemy portrait.
 */
const CLASS_FALLBACK_SIDE2_PORTRAITS = {
  47: 48,
  50: 49,
  51: 51,
  52: 53,
  57: 58,
  59: 60,
  61: 62,
  64: 64,
} as const satisfies Readonly<Record<number, PortraitRecord>>;

export function classFallbackPortraitFor(
  classId: ClassId,
  side: BattleUnit["side"],
): PortraitRecord | undefined {
  const side1Record = classDefinition(classId).genericPortraitRecord;
  if (typeof side1Record !== "number") return undefined;
  return side === 1
    ? side1Record as PortraitRecord
    : CLASS_FALLBACK_SIDE2_PORTRAITS[side1Record] ?? side1Record as PortraitRecord;
}

/**
 * Native generic units follow their profession's fallback portrait, while
 * named actors keep a character portrait across class changes. This identity
 * boundary is stable even when an older battle snapshot retained a stale
 * generic `name` from an earlier profession.
 */
export function usesClassIdentity(
  unit: Pick<BattleUnit, "classId" | "side" | "portrait" | "displayIdentity">,
): boolean {
  if (unit.displayIdentity === "named-class-portrait") return false;
  return unit.portrait === classFallbackPortraitFor(unit.classId, unit.side);
}

/**
 * 通用单位的玩家向名称。`REMAKE-107` 在职业名后追加通用友军槽的稳定字母编号，
 * 让同关多名通用友军可以区分，也让玩家看得出跨关继承的是哪一个槽。
 */
export function genericUnitName(
  unit: Pick<BattleUnit, "classId" | "side" | "slot">,
): string {
  return `${className(unit.classId)}${genericAllyLabelFor(unit)}`;
}

export function unitDisplayName(
  unit: Pick<BattleUnit, "classId" | "side" | "slot" | "portrait" | "name" | "displayIdentity">,
): string {
  return usesClassIdentity(unit) ? genericUnitName(unit) : unit.name;
}

type ClassProgressionState = Pick<BattleUnit, "classId" | "experience">
  & Partial<Pick<BattleUnit, "side">>;

function growthFor(classId: ClassId, side: BattleUnit["side"] = 1) {
  const definition = classDefinition(classId);
  const code = side === 2 ? definition.codes.side2 : definition.codes.side1;
  return definition.postThirdRowGrowth.find((growth) => growth.code === code)
    ?? definition.postThirdRowGrowth[0];
}

/**
 * REMAKE-103 `linear` 模式：把职业前 3 级的每行增量一直延续下去。
 *
 * 除女帝外，全部职业第 1→2 行与第 2→3 行的属性增量和经验门槛增量逐值相同，所以
 * 「前 3 级的成长数值」就是 `dataRows[1] − dataRows[0]`，无须在两段之间取舍。女帝
 * 是唯一例外（两段门槛 1200／100 不同），但她只以 side 1 出场，够不到本模式。
 *
 * 门槛沿用原版 3 级后的增量而不是前 3 级的增量：本模式只改「每行给多少属性」，
 * 经验↔等级的阶梯保持原版，敌方战中升级节奏因而完全不变。
 *
 * 本模式绕开 `CLASS_GROWTH_OVERRIDES`。那些覆写是为 `legacy` 曲线打的补丁，其中
 * `REMAKE-092` 半龍戰士本身就是「把前 3 级曲线续到 6 级」——在 `linear` 下由通用
 * 规则接管即可，前 3 段结果一致，第 7 行起继续保持前 3 级速率。
 */
function linearGrowthSegmentsFor(
  classId: ClassId,
  side: BattleUnit["side"],
): readonly ClassGrowthSegment[] {
  const rows = classDefinition(classId).dataRows;
  const growth = growthFor(classId, side);
  if (!growth) return [];
  return [{
    thresholdIncrement: growth.thresholdIncrement,
    attackIncrement: rows[1].attack - rows[0].attack,
    defenseIncrement: rows[1].defense - rows[0].defense,
    maxLifeIncrement: rows[1].maxLife - rows[0].maxLife,
  }];
}

/**
 * Native classes have exactly one post-third-row rule that repeats forever and
 * never touches defense. A balance override may replace it with several
 * segments, so every reader goes through this shape instead of branching on
 * whether an override exists.
 */
function growthSegmentsFor(
  classId: ClassId,
  side: BattleUnit["side"] = 1,
  mode: EnemyGrowthMode = "legacy",
): readonly ClassGrowthSegment[] {
  if (mode === "linear") return linearGrowthSegmentsFor(classId, side);
  const override = CLASS_GROWTH_OVERRIDES[classId];
  if (override) return override;
  const growth = growthFor(classId, side);
  return growth
    ? [{
      thresholdIncrement: growth.thresholdIncrement,
      attackIncrement: growth.attackIncrement,
      defenseIncrement: 0,
      maxLifeIncrement: growth.maxLifeIncrement,
    }]
    : [];
}

interface PostThirdRowProgress {
  rows: number;
  attack: number;
  defense: number;
  maxLife: number;
}

/** Walks the segments an accumulated experience surplus has actually paid for. */
function postThirdRowProgress(
  segments: readonly ClassGrowthSegment[],
  experienceAboveThird: number,
): PostThirdRowProgress {
  const progress: PostThirdRowProgress = { rows: 0, attack: 0, defense: 0, maxLife: 0 };
  let remaining = Math.max(0, experienceAboveThird);
  for (const segment of segments) {
    const affordable = Math.floor(remaining / segment.thresholdIncrement);
    const taken = segment.rows === undefined ? affordable : Math.min(affordable, segment.rows);
    progress.rows += taken;
    progress.attack += taken * segment.attackIncrement;
    progress.defense += taken * segment.defenseIncrement;
    progress.maxLife += taken * segment.maxLifeIncrement;
    remaining -= taken * segment.thresholdIncrement;
    // A segment that still has rows left is where the unit currently sits, so
    // later segments cannot have been reached no matter how much is left over.
    if (segment.rows === undefined || taken < segment.rows) break;
  }
  return progress;
}

/** Total experience above the third row needed to complete `rows` growth rows. */
function experienceForPostThirdRows(
  segments: readonly ClassGrowthSegment[],
  rows: number,
): number | undefined {
  let remaining = rows;
  let experience = 0;
  for (const segment of segments) {
    const taken = segment.rows === undefined ? remaining : Math.min(remaining, segment.rows);
    experience += taken * segment.thresholdIncrement;
    remaining -= taken;
    if (remaining === 0) return experience;
  }
  return undefined;
}

/**
 * `mode` 只影响职业内 3 级之后的成长行，固定三行永远是原版数据。默认 `legacy`，
 * 所有我方、名册、UI 参考与存档路径因此保持原版语义；只有 side 2 的难度缩放
 * （`stage0.ts` 的 `statsFor`）会显式传入 `linear`。
 */
export function classStatsFor(
  unit: ClassProgressionState,
  mode: EnemyGrowthMode = "legacy",
): UnitStats {
  const definition = classDefinition(unit.classId);
  const fixedRows = definition.dataRows.slice(0, 3);
  const selectedIndex = fixedRows.reduce(
    (selected, row, index) => unit.experience >= row.experienceThreshold ? index : selected,
    0,
  );
  const selected = fixedRows[selectedIndex];
  if (selectedIndex < fixedRows.length - 1) {
    return {
      attack: selected.attack,
      defense: selected.defense,
      maxLife: selected.maxLife,
      movement: selected.movement,
      // DATA field6 is a native table marker (for example, cavalry starts at
      // 4). The HUD marker is the row within the current profession, so a
      // freshly promoted unit starts at profession level 1.
      level: selectedIndex + 1,
    };
  }

  const progress = postThirdRowProgress(
    growthSegmentsFor(unit.classId, unit.side, mode),
    unit.experience - fixedRows[2].experienceThreshold,
  );
  return {
    attack: selected.attack + progress.attack,
    defense: selected.defense + progress.defense,
    maxLife: selected.maxLife + progress.maxLife,
    movement: selected.movement,
    level: selectedIndex + 1 + progress.rows,
  };
}

export function classTierFor(
  unit: Pick<BattleUnit, "classId" | "experience">,
): 1 | 2 | 3 {
  const rows = classDefinition(unit.classId).dataRows.slice(0, 3);
  const selectedIndex = rows.reduce(
    (selected, row, index) => unit.experience >= row.experienceThreshold ? index : selected,
    0,
  );
  return (selectedIndex + 1) as 1 | 2 | 3;
}

export function nextExperienceThresholdFor(
  unit: ClassProgressionState,
  mode: EnemyGrowthMode = "legacy",
): number {
  const definition = classDefinition(unit.classId);
  const fixedThreshold = definition.dataRows
    .slice(0, 3)
    .map((row) => row.experienceThreshold)
    .find((threshold) => threshold > unit.experience);
  if (fixedThreshold !== undefined) return fixedThreshold;

  const segments = growthSegmentsFor(unit.classId, unit.side, mode);
  const thirdThreshold = definition.dataRows[2].experienceThreshold;
  const reached = postThirdRowProgress(segments, unit.experience - thirdThreshold).rows;
  const next = experienceForPostThirdRows(segments, reached + 1);
  return next === undefined ? Number.MAX_SAFE_INTEGER : thirdThreshold + next;
}

/**
 * Module 29 ignores DATA rows four and five during battle progression. A
 * promotable unit becomes eligible when the derived growth row advances past
 * three, so its real trigger is the first post-third-row threshold.
 */
export function promotionExperienceThresholdFor(classId: ClassId): number {
  const definition = classDefinition(classId);
  return definition.promotion.triggerExperienceThreshold ?? Number.MAX_SAFE_INTEGER;
}

export function movementRulesFor(classId: ClassId): readonly number[] {
  return classDefinition(classId).movementRules;
}

export function terrainDefensePercentFor(classId: ClassId, terrainSlot: number): number {
  return classDefinition(classId).terrainDefensePercents[terrainSlot] ?? 0;
}

export function killRewardFor(classId: ClassId, side: BattleUnit["side"]): number {
  const definition = classDefinition(classId);
  const code = side === 1 ? definition.codes.side1 : definition.codes.side2;
  return definition.killRewards.find((reward) => reward.code === code)?.reward
    ?? definition.killRewards[0]?.reward
    ?? 0;
}

export function ordinaryHitStatusFor(classId: ClassId): OrdinaryHitStatus | undefined {
  const status = classDefinition(classId).ordinaryHitStatuses[0];
  if (!status) return undefined;
  const stateOffset: number = status.stateOffset;
  const key: OrdinaryHitStatusKey = stateOffset === 0x0e
    ? "confusion"
    : stateOffset === 0x10
      ? "attackDown"
      : stateOffset === 0x12
        ? "defenseDown"
        : stateOffset === 0x14
          ? "poison"
          : (() => { throw new Error(`unsupported native status offset ${stateOffset}`); })();
  return {
    key,
    counter: status.value & 0x7fff,
  };
}

export function suppressesOrdinaryCounterFor(classId: ClassId): boolean {
  return classDefinition(classId).codes.variants.some((code) => code === "0G");
}

/**
 * `REMAKE-097`: the demon dragon knight strips every positive status from the
 * unit it actively attacks. BAT-053 confirmed `1F` has no native branch at all,
 * so this is a remake-only balance trait, not a recovered original rule. It
 * mirrors the native attacker-keyed hook at `0000:92DC`: one application per
 * attack chain, active attacks only, and it resolves after damage so the
 * stripped buffs still apply to the hit that removes them.
 */
export function stripsTargetBuffsOnActiveHit(classId: ClassId): boolean {
  return classDefinition(classId).codes.variants.some((code) => code === "1F");
}

/** Positive statuses cleared by {@link stripsTargetBuffsOnActiveHit}. */
export const STRIPPABLE_BUFF_KEYS = ["attackUp", "defenseUp", "magicGuard"] as const;

/**
 * `REMAKE-099`: the swift dragon knight's native ~50% PIT evasion against shots
 * becomes a deterministic immunity to *physical* projectiles only — the archer,
 * crossbow and water warrior shots. The magic archer is deliberately excluded
 * because its damage is magical and is already answered by `magicGuard`.
 *
 * Because the immunity is now total, every AI ranking must skip such a shot
 * instead of spending a turn on a guaranteed zero.
 */
export function immuneToPhysicalShootingFor(classId: ClassId): boolean {
  return classDefinition(classId).codes.variants.some((code) => code === "0E");
}

/**
 * `REMAKE-100`: the magic armor warrior mitigates ordinary physical damage in
 * proportion to missing life, up to 50% at the brink of death. BAT-053 confirmed
 * `1H` has no native branch; this replaces the flat `+20` defense-up proposal
 * because the native `+8..14` random floor makes flat defense saturate — once
 * `defense + terrainDefense` covers the attacker's attack, more defense buys
 * literally nothing, so a flat bonus swung between 0% and 65% depending only on
 * the tile. A proportional cut cannot be swallowed by that floor.
 *
 * Scope matches what the discarded `+20` defense bonus would have covered: the
 * ordinary attack chain only. Shooting and techniques bypass defense natively
 * and keep bypassing this, which preserves shooting as the original's answer to
 * high-defense units.
 */
export function mitigatesOrdinaryDamageFor(classId: ClassId): boolean {
  return classDefinition(classId).codes.variants.some((code) => code === "1H");
}

/**
 * Integer-exact mitigation so the result never depends on float rounding:
 * `damage - floor(damage * missingLife / (maxLife * 2))`, i.e. a reduction of
 * `(1 - life/maxLife) * 50%`. `life` is the value before this damage lands.
 */
export function mitigateOrdinaryDamage(
  unit: Pick<BattleUnit, "classId" | "life">,
  maxLife: number,
  damage: number,
): number {
  if (damage <= 0 || maxLife <= 0) return damage;
  if (!mitigatesOrdinaryDamageFor(unit.classId)) return damage;
  const missingLife = Math.max(0, Math.min(maxLife, maxLife - unit.life));
  return damage - Math.floor(damage * missingLife / (maxLife * 2));
}

export function promotionTargetsFor(classId: ClassId): readonly PromotionTarget[] {
  return classDefinition(classId).promotion.targets;
}

/**
 * Every class a unit can reach without leaving the current battle. Promotion
 * can happen more than once in a long stage, so presentation assets cannot stop
 * at the immediate menu candidates. The visited set also keeps malformed or
 * modded cyclic promotion data from looping forever.
 */
export function promotionReachableClassIds(
  classIds: Iterable<ClassId>,
): readonly ClassId[] {
  const reachable: ClassId[] = [];
  const pending = [...classIds];
  const visited = new Set<ClassId>();
  for (let index = 0; index < pending.length; index += 1) {
    const classId = pending[index];
    if (visited.has(classId)) continue;
    visited.add(classId);
    reachable.push(classId);
    for (const target of promotionTargetsFor(classId)) pending.push(target.id);
  }
  return reachable;
}

export function isPromotionEligible(
  unit: Pick<BattleUnit, "side" | "classId" | "experience">,
): boolean {
  if (unit.side !== 1) return false;
  const promotion = classDefinition(unit.classId).promotion;
  return promotion.targets.length > 0
    && classStatsFor(unit).level > 3;
}
