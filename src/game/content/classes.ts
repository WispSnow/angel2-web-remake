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

function primaryGrowth(classId: ClassId) {
  const definition = classDefinition(classId);
  return definition.postThirdRowGrowth.find((growth) => growth.code === definition.codes.side1)
    ?? definition.postThirdRowGrowth[0];
}

export function classStatsFor(
  unit: Pick<BattleUnit, "classId" | "experience">,
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
      level: selected.level,
    };
  }

  const growth = primaryGrowth(unit.classId);
  if (!growth) {
    return {
      attack: selected.attack,
      defense: selected.defense,
      maxLife: selected.maxLife,
      movement: selected.movement,
      level: selected.level,
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
    level: selected.level + postThirdRows,
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
  unit: Pick<BattleUnit, "classId" | "experience">,
): number {
  const definition = classDefinition(unit.classId);
  const fixedThreshold = definition.dataRows
    .slice(0, 3)
    .map((row) => row.experienceThreshold)
    .find((threshold) => threshold > unit.experience);
  if (fixedThreshold !== undefined) return fixedThreshold;

  const growth = primaryGrowth(unit.classId);
  if (!growth) return Number.MAX_SAFE_INTEGER;
  const thirdThreshold = definition.dataRows[2].experienceThreshold;
  return thirdThreshold
    + (Math.floor((unit.experience - thirdThreshold) / growth.thresholdIncrement) + 1)
      * growth.thresholdIncrement;
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
    && promotion.markerExperienceThreshold !== null
    && unit.experience >= promotion.markerExperienceThreshold;
}
