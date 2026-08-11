import {
  CLASS_CATALOG,
  CLASS_ID_BY_NATIVE_RECORD,
  CLASS_IDS,
  type ClassId,
} from "./class-catalog.generated";
import type { BattleUnit, UnitStats } from "../types";
import type { PortraitRecord } from "./portrait-catalog.generated";

export {
  CLASS_CATALOG,
  CLASS_ID_BY_NATIVE_RECORD,
  CLASS_IDS,
  type ClassId,
};

export type ClassActionCategory = "ordinary" | "shooting" | "technique" | "special_runtime";
export type OrdinaryHitStatusKey = "confusion" | "attackDown" | "defenseDown" | "poison";

export interface OrdinaryHitStatus {
  key: OrdinaryHitStatusKey;
  counter: number;
}

const STABLE_REMAKE_ORDINARY_HIT_STATUS_IMMUNITIES = {
  confusion: ["dragon", "head", "hand"],
  poison: ["dragon", "head", "hand"],
} as const satisfies Readonly<Partial<Record<OrdinaryHitStatusKey, readonly ClassId[]>>>;

/**
 * REMAKE-053 closes the native split where LA/IP techniques honor 1P/2P/3P
 * immunity but ordinary-hit writes to the same status slots bypass it.
 */
export function isClassImmuneToOrdinaryHitStatus(
  classId: ClassId,
  status: OrdinaryHitStatusKey,
): boolean {
  const immuneClasses = STABLE_REMAKE_ORDINARY_HIT_STATUS_IMMUNITIES[status as
    keyof typeof STABLE_REMAKE_ORDINARY_HIT_STATUS_IMMUNITIES];
  return immuneClasses?.some((immuneClass) => immuneClass === classId) ?? false;
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
 * `0P/1P` are the only classes the native dispatcher sends to `1000:1A68`.
 * That routine owns a WD-only skill pool and its own life bands, including
 * the one native case where a class both retreats and still casts.
 */
export function usesEmpressOrDragonAi(classId: ClassId): boolean {
  return classDefinition(classId).aiClassDispatch.side2 === "empressOrDragonTechnique";
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
  unit: Pick<BattleUnit, "classId" | "side" | "portrait">,
): boolean {
  return unit.portrait === classFallbackPortraitFor(unit.classId, unit.side);
}

export function unitDisplayName(
  unit: Pick<BattleUnit, "classId" | "side" | "portrait" | "name">,
): string {
  return usesClassIdentity(unit) ? className(unit.classId) : unit.name;
}

type ClassProgressionState = Pick<BattleUnit, "classId" | "experience">
  & Partial<Pick<BattleUnit, "side">>;

function growthFor(classId: ClassId, side: BattleUnit["side"] = 1) {
  const definition = classDefinition(classId);
  const code = side === 2 ? definition.codes.side2 : definition.codes.side1;
  return definition.postThirdRowGrowth.find((growth) => growth.code === code)
    ?? definition.postThirdRowGrowth[0];
}

export function classStatsFor(
  unit: ClassProgressionState,
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

  const growth = growthFor(unit.classId, unit.side);
  if (!growth) {
    return {
      attack: selected.attack,
      defense: selected.defense,
      maxLife: selected.maxLife,
      movement: selected.movement,
      level: selectedIndex + 1,
    };
  }
  const thirdThreshold = fixedRows[2].experienceThreshold;
  const postThirdRows = Math.floor(
    Math.max(0, unit.experience - thirdThreshold) / growth.thresholdIncrement,
  );
  return {
    attack: selected.attack + postThirdRows * growth.attackIncrement,
    defense: selected.defense,
    maxLife: selected.maxLife + postThirdRows * growth.maxLifeIncrement,
    movement: selected.movement,
    level: selectedIndex + 1 + postThirdRows,
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
): number {
  const definition = classDefinition(unit.classId);
  const fixedThreshold = definition.dataRows
    .slice(0, 3)
    .map((row) => row.experienceThreshold)
    .find((threshold) => threshold > unit.experience);
  if (fixedThreshold !== undefined) return fixedThreshold;

  const growth = growthFor(unit.classId, unit.side);
  if (!growth) return Number.MAX_SAFE_INTEGER;
  const thirdThreshold = definition.dataRows[2].experienceThreshold;
  return thirdThreshold
    + (Math.floor((unit.experience - thirdThreshold) / growth.thresholdIncrement) + 1)
      * growth.thresholdIncrement;
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

export function promotionTargetsFor(classId: ClassId): readonly PromotionTarget[] {
  return classDefinition(classId).promotion.targets;
}

export function isPromotionEligible(
  unit: Pick<BattleUnit, "side" | "classId" | "experience">,
): boolean {
  if (unit.side !== 1) return false;
  const promotion = classDefinition(unit.classId).promotion;
  return promotion.targets.length > 0
    && classStatsFor(unit).level > 3;
}
