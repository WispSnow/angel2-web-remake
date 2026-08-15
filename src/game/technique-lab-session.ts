import type { ClassId } from "./content/classes";
import {
  TECHNIQUE_LAB_CATALOG,
  TECHNIQUE_LAB_ATTACK_UP,
  TECHNIQUE_LAB_DEFENSE_UP,
  TECHNIQUE_LAB_MAGIC_GUARD,
  TECHNIQUE_LAB_POISON,
  TECHNIQUE_LAB_CONFUSION,
  TECHNIQUE_LAB_ATTACK_DOWN,
  TECHNIQUE_LAB_DEFENSE_DOWN,
  TECHNIQUE_LAB_SPELL_SEAL,
  TECHNIQUE_LAB_PRAYER,
  TECHNIQUE_LAB_FIRE,
  TECHNIQUE_LAB_HEAL,
  TECHNIQUE_LAB_ICE,
  TECHNIQUE_LAB_IRON_PLATE,
  TECHNIQUE_LAB_LIGHTNING,
  TECHNIQUE_LAB_OBSTACLE,
  TECHNIQUE_LAB_STOMPS,
  TECHNIQUE_LAB_UNIT_ASSETS,
} from "./content/technique-lab.generated";
import { stage1TerrainSlotAt } from "./content/stage1";
import { stompEffectRange } from "./simulation/actions/range-map";
import { DeterministicRng } from "./simulation/rng";
import type { PrayerOutcomeKind } from "./simulation/actions/types";

export const TECHNIQUE_LAB_MAP = {
  origin: { x: 15, y: 13 },
  width: 16,
  height: 11,
} as const;

export const TECHNIQUE_LAB_RULE_VIEWPORT = {
  origin: { ...TECHNIQUE_LAB_MAP.origin },
  width: 10,
  height: 7,
} as const;

export type TechniqueLabSide = 1 | 2;
export type TechniqueLabTool = "place" | "actor" | "target" | "erase";
export type TechniqueLabNativeCode = (typeof TECHNIQUE_LAB_CATALOG)[number]["nativeCode"];

const isSelfCenteredAction = (code: TechniqueLabNativeCode): boolean =>
  code.endsWith("C") || code === "OJ";
const isStomp = (code: TechniqueLabNativeCode): code is "1D" | "2D" | "3D" =>
  code === "1D" || code === "2D" || code === "3D";
const isFire = (code: TechniqueLabNativeCode): code is keyof typeof TECHNIQUE_LAB_FIRE =>
  code === "1F" || code === "2F" || code === "3F" || code === "4F";
const isHeal = (code: TechniqueLabNativeCode): code is "1H" | keyof typeof TECHNIQUE_LAB_HEAL =>
  code === "1H" || code === "2H" || code === "3H";
const isRecovery = (code: TechniqueLabNativeCode): code is "1I" | "2I" | "3I" =>
  code === "1I" || code === "2I" || code === "3I";
const isConstruction = (code: TechniqueLabNativeCode): code is "1K" | "2K" =>
  code === "1K" || code === "2K";

export interface TechniqueLabUnit {
  readonly id: string;
  readonly side: TechniqueLabSide;
  readonly classId: ClassId;
  readonly x: number;
  readonly y: number;
}

export interface TechniqueLabEffectCell {
  readonly position: { readonly x: number; readonly y: number };
  readonly value: number;
}

export interface TechniqueLabPrayerPreview {
  readonly unit: TechniqueLabUnit;
  readonly passed: boolean;
  readonly outcome?: PrayerOutcomeKind;
  readonly rolledAmount?: number;
}

export interface TechniqueLabState {
  readonly units: readonly TechniqueLabUnit[];
  readonly tool: TechniqueLabTool;
  readonly placementSide: TechniqueLabSide;
  readonly placementClass: ClassId;
  readonly actionCode: TechniqueLabNativeCode;
  readonly actorId?: string;
  readonly target: { readonly x: number; readonly y: number };
  readonly revision: number;
}

type Listener = (state: TechniqueLabState) => void;

const initialUnits: readonly TechniqueLabUnit[] = [
  { id: "lab-1", side: 1, classId: "magician", x: 21, y: 18 },
  { id: "lab-2", side: 2, classId: "soldier", x: 23, y: 18 },
  { id: "lab-3", side: 2, classId: "cavalry", x: 25, y: 18 },
  { id: "lab-4", side: 2, classId: "sister", x: 23, y: 21 },
  { id: "lab-5", side: 1, classId: "soldier", x: 19, y: 20 },
];

export class TechniqueLabSession {
  private listeners = new Set<Listener>();
  private nextUnitNumber = 6;
  private current: TechniqueLabState = {
    units: initialUnits,
    tool: "place",
    placementSide: 2,
    placementClass: "soldier",
    actionCode: "1L",
    actorId: "lab-1",
    target: { x: 23, y: 18 },
    revision: 0,
  };

  get state(): TechniqueLabState {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  setTool(tool: TechniqueLabTool): void {
    if (tool === "target" && isSelfCenteredAction(this.current.actionCode)) return;
    this.update({ ...this.current, tool });
  }

  setPlacementSide(placementSide: TechniqueLabSide): void {
    const asset = TECHNIQUE_LAB_UNIT_ASSETS[this.current.placementClass];
    const placementClass = placementSide === 1 && asset.ally === null
      ? "soldier"
      : this.current.placementClass;
    this.update({ ...this.current, placementSide, placementClass });
  }

  setPlacementClass(placementClass: ClassId): boolean {
    if (this.current.placementSide === 1
      && TECHNIQUE_LAB_UNIT_ASSETS[placementClass].ally === null) return false;
    this.update({ ...this.current, placementClass });
    return true;
  }

  setActionCode(actionCode: TechniqueLabNativeCode): boolean {
    const entry = TECHNIQUE_LAB_CATALOG.find((candidate) => candidate.nativeCode === actionCode);
    if (!entry || entry.implementationId === null) return false;
    const actor = this.actor();
    const constructionTarget = isConstruction(actionCode) && actor
      ? [
        { x: actor.x + 1, y: actor.y },
        { x: actor.x, y: actor.y + 1 },
        { x: actor.x, y: actor.y - 1 },
        { x: actor.x - 1, y: actor.y },
      ].find(({ x, y }) => this.inBounds(x, y) && !this.unitAt(x, y))
      : undefined;
    this.update({
      ...this.current,
      actionCode,
      tool: isSelfCenteredAction(actionCode) && this.current.tool === "target"
        ? "actor"
        : this.current.tool,
      target: isSelfCenteredAction(actionCode) && actor
        ? { x: actor.x, y: actor.y }
        : constructionTarget ?? this.current.target,
    });
    return true;
  }

  interact(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.current.tool === "target") {
      if (isSelfCenteredAction(this.current.actionCode)) return false;
      if (isConstruction(this.current.actionCode) && this.unitAt(x, y)) return false;
      this.update({ ...this.current, target: { x, y } });
      return true;
    }
    if (this.current.tool === "erase") return this.erase(x, y);
    if (this.current.tool === "actor") {
      const unit = this.unitAt(x, y);
      if (!unit) return false;
      this.update({
        ...this.current,
        actorId: unit.id,
        target: isSelfCenteredAction(this.current.actionCode)
          ? { x: unit.x, y: unit.y }
          : this.current.target,
      });
      return true;
    }
    return this.place(x, y);
  }

  erase(x: number, y: number): boolean {
    const unit = this.unitAt(x, y);
    if (!unit) return false;
    this.update({
      ...this.current,
      units: this.current.units.filter(({ id }) => id !== unit.id),
      actorId: unit.id === this.current.actorId ? undefined : this.current.actorId,
    });
    return true;
  }

  clear(): void {
    this.update({ ...this.current, units: [], actorId: undefined });
  }

  reset(): void {
    this.nextUnitNumber = 6;
    this.current = {
      units: initialUnits,
      tool: "place",
      placementSide: 2,
      placementClass: "soldier",
      actionCode: "1L",
      actorId: "lab-1",
      target: { x: 23, y: 18 },
      revision: this.current.revision + 1,
    };
    this.emit();
  }

  actor(): TechniqueLabUnit | undefined {
    return this.current.units.find(({ id }) => id === this.current.actorId);
  }

  effectCenter(): { readonly x: number; readonly y: number } | undefined {
    if (isSelfCenteredAction(this.current.actionCode)) {
      const actor = this.actor();
      return actor ? { x: actor.x, y: actor.y } : undefined;
    }
    return this.current.target;
  }

  effectCells(): readonly TechniqueLabEffectCell[] {
    const center = this.effectCenter();
    if (!center) return [];
    if (this.current.actionCode === "OJ") return [];
    if (isStomp(this.current.actionCode)) {
      const actor = this.actor();
      if (!actor) return [];
      const effect = stompEffectRange(
        actor,
        center,
        { width: 50, height: 50, terrainSlotAt: stage1TerrainSlotAt },
        TECHNIQUE_LAB_RULE_VIEWPORT,
      );
      return effect.cells().map((position) => ({ position, value: effect.valueAt(position) }));
    }
    if (isConstruction(this.current.actionCode)) {
      const definition = this.current.actionCode === "2K"
        ? TECHNIQUE_LAB_OBSTACLE
        : TECHNIQUE_LAB_IRON_PLATE;
      return [
        { x: center.x, y: center.y + 1 },
        { x: center.x, y: center.y - 1 },
        { x: center.x + 1, y: center.y },
        { x: center.x - 1, y: center.y },
      ]
        .filter(({ x, y }) => x >= 0 && y >= 0 && x < 50 && y < 50)
        .filter((position) => stage1TerrainSlotAt(position) !== 0)
        .map((position) => ({ position, value: definition.logicalTerrainSlot }));
    }
    const radius = this.current.actionCode.endsWith("L")
      ? TECHNIQUE_LAB_LIGHTNING[this.current.actionCode as keyof typeof TECHNIQUE_LAB_LIGHTNING]
        .effectRadius
      : this.current.actionCode.endsWith("C")
        ? TECHNIQUE_LAB_ICE[this.current.actionCode as keyof typeof TECHNIQUE_LAB_ICE].effectRadius
        : isRecovery(this.current.actionCode)
          ? this.current.actionCode === "3I" ? 4 : 3
          : 1;
    const cells: TechniqueLabEffectCell[] = [];
    for (let y = 0; y < 50; y += 1) {
      for (let x = 0; x < 50; x += 1) {
        const distance = Math.abs(center.x - x) + Math.abs(center.y - y);
        const value = radius - distance;
        if (value > 0) cells.push({ position: { x, y }, value });
      }
    }
    return cells;
  }

  affectedUnits(): readonly TechniqueLabUnit[] {
    const actor = this.actor();
    if (!actor) return [];
    if (this.current.actionCode === "OJ") {
      return this.prayerPreview().filter(({ passed }) => passed).map(({ unit }) => unit);
    }
    if (isConstruction(this.current.actionCode)) return [];
    const effectValues = new Map(this.effectCells().map(({ position, value }) => [
      `${position.x},${position.y}`,
      value,
    ]));
    const desiredSide = isHeal(this.current.actionCode)
      || isRecovery(this.current.actionCode)
      || this.current.actionCode === "AA"
      || this.current.actionCode === "AD"
      || this.current.actionCode === "FM"
      || this.current.actionCode === "TR"
      ? actor.side
      : actor.side === 1 ? 2 : 1;
    return this.current.units.filter((unit) => {
      if (unit.side !== desiredSide) return false;
      if (isFire(this.current.actionCode)
        || isHeal(this.current.actionCode)
        || this.current.actionCode === "AA"
        || this.current.actionCode === "AD"
        || this.current.actionCode === "FM"
        || this.current.actionCode === "SA"
        || this.current.actionCode === "SD"
        || this.current.actionCode === "SN"
        || this.current.actionCode === "TR") {
        return unit.x === this.current.target.x && unit.y === this.current.target.y;
      }
      return (effectValues.get(`${unit.x},${unit.y}`) ?? 0) > 0;
    });
  }

  lightningDamageFor(unit: TechniqueLabUnit): number | undefined {
    if (!this.current.actionCode.endsWith("L")) return undefined;
    const definition = TECHNIQUE_LAB_LIGHTNING[
      this.current.actionCode as keyof typeof TECHNIQUE_LAB_LIGHTNING
    ];
    const cell = this.effectCells().find(({ position }) => position.x === unit.x && position.y === unit.y);
    if (!cell) return undefined;
    const damage = definition.damageByRangeValue[
      String(cell.value) as keyof typeof definition.damageByRangeValue
    ];
    return damage;
  }

  damagePreviewFor(unit: TechniqueLabUnit): string | undefined {
    const lightning = this.lightningDamageFor(unit);
    if (lightning !== undefined) return String(lightning);
    if (isStomp(this.current.actionCode)
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      const base = TECHNIQUE_LAB_STOMPS[this.current.actionCode].damageBase;
      return `${base}..${base * 2 - 1}`;
    }
    if (isFire(this.current.actionCode)
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      const definition = TECHNIQUE_LAB_FIRE[this.current.actionCode];
      return `${definition.percentMaxLife}% · 上限 ${definition.damageCap}`;
    }
    if ((this.current.actionCode === "2H" || this.current.actionCode === "3H")
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      return `+${TECHNIQUE_LAB_HEAL[this.current.actionCode].maxLifePercent}% · q經驗`;
    }
    if ((this.current.actionCode === "2I" || this.current.actionCode === "3I")
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      const cell = this.effectCells().find(({ position }) =>
        position.x === unit.x && position.y === unit.y);
      const healing = this.current.actionCode === "3I"
        ? cell?.value === 4 ? 110 : cell?.value === 3 ? 85 : cell?.value === 2 ? 60 : 35
        : cell?.value === 3 ? 90 : cell?.value === 2 ? 70 : 50;
      return `+${healing} · 總量經驗`;
    }
    if (this.current.actionCode === "AA"
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      return `攻擊 +${TECHNIQUE_LAB_ATTACK_UP.effectiveAttackDelta} · 狀態 ${TECHNIQUE_LAB_ATTACK_UP.statusCounter}`;
    }
    if (this.current.actionCode === "AD"
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      return `防禦 +${TECHNIQUE_LAB_DEFENSE_UP.effectiveDefenseDelta} · 狀態 ${TECHNIQUE_LAB_DEFENSE_UP.statusCounter}`;
    }
    if (this.current.actionCode === "FM"
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      return `防魔 · 狀態 ${TECHNIQUE_LAB_MAGIC_GUARD.statusCounter} · 一次性保護`;
    }
    if (this.current.actionCode === "IP"
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      const immune = TECHNIQUE_LAB_POISON.immuneClassIds.some(
        (classId) => classId === unit.classId,
      );
      return immune
        ? "完整演出 · 龍／頭／手免疫寫入"
        : `中毒狀態 ${TECHNIQUE_LAB_POISON.statusCounter} · 每輪折半但不致死`;
    }
    if (this.current.actionCode === "LA"
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      const immune = TECHNIQUE_LAB_CONFUSION.immuneClassIds.some(
        (classId) => classId === unit.classId,
      );
      return immune
        ? "完整演出 · 龍／頭／手免疫寫入"
        : `混亂狀態 ${TECHNIQUE_LAB_CONFUSION.statusCounter} · 自動行動只移動／撤退`;
    }
    if (this.current.actionCode === "SA"
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      return `攻擊 ${TECHNIQUE_LAB_ATTACK_DOWN.effectiveAttackDelta} · 狀態 ${TECHNIQUE_LAB_ATTACK_DOWN.statusCounter}`;
    }
    if (this.current.actionCode === "SD"
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      return `防禦 ${TECHNIQUE_LAB_DEFENSE_DOWN.effectiveDefenseDelta} · 狀態 ${TECHNIQUE_LAB_DEFENSE_DOWN.statusCounter}`;
    }
    if (this.current.actionCode === "SN"
      && this.affectedUnits().some(({ id }) => id === unit.id)) {
      return TECHNIQUE_LAB_SPELL_SEAL.immuneClassIds.some((classId) => classId === unit.classId)
        ? "完整演出 · 龍免疫寫入"
        : unit.classId === "head" || unit.classId === "hand"
          ? `禁咒狀態 ${TECHNIQUE_LAB_SPELL_SEAL.statusCounter} · 頭／手專屬行動不受影響`
          : `禁咒狀態 ${TECHNIQUE_LAB_SPELL_SEAL.statusCounter} · 技術不可用`;
    }
    if (this.current.actionCode === "OJ") {
      const preview = this.prayerPreview().find((candidate) => candidate.unit.id === unit.id);
      if (!preview?.passed || !preview.outcome) return "門失敗";
      if (preview.outcome === "healing") return `生命 +${preview.rolledAmount}`;
      if (preview.outcome === "experience") return `經驗 +${preview.rolledAmount}`;
      return preview.outcome === "attackUp" ? "攻擊提升 3" : "防禦提升 3";
    }
    return undefined;
  }

  prayerPreview(): readonly TechniqueLabPrayerPreview[] {
    if (this.current.actionCode !== "OJ") return [];
    const rng = new DeterministicRng(0x0b1e55ed);
    return this.current.units
      .filter(({ side }) => side === TECHNIQUE_LAB_PRAYER.eligibleSide)
      .sort((left, right) => left.y * 50 + left.x - (right.y * 50 + right.x))
      .map((unit) => {
        const passed = (rng.nextUint() & (1 << TECHNIQUE_LAB_PRAYER.gateBit)) !== 0;
        if (!passed) return { unit, passed };
        const roll = rng.between(
          TECHNIQUE_LAB_PRAYER.outcomeRoll[0],
          TECHNIQUE_LAB_PRAYER.outcomeRoll[1],
        );
        const outcome: PrayerOutcomeKind = roll === 0
          ? "healing"
          : roll === 1 ? "experience" : roll === 2 ? "attackUp" : "defenseUp";
        const rolledAmount = outcome === "healing" || outcome === "experience"
          ? rng.between(
            TECHNIQUE_LAB_PRAYER.amountRoll[0],
            TECHNIQUE_LAB_PRAYER.amountRoll[1],
          )
          : undefined;
        return { unit, passed, outcome, rolledAmount };
      });
  }

  private place(x: number, y: number): boolean {
    const asset = TECHNIQUE_LAB_UNIT_ASSETS[this.current.placementClass];
    if (this.current.placementSide === 1 && asset.ally === null) return false;
    const existing = this.unitAt(x, y);
    const unit: TechniqueLabUnit = {
      id: existing?.id ?? `lab-${this.nextUnitNumber++}`,
      side: this.current.placementSide,
      classId: this.current.placementClass,
      x,
      y,
    };
    const units = existing
      ? this.current.units.map((candidate) => candidate.id === existing.id ? unit : candidate)
      : [...this.current.units, unit];
    this.update({ ...this.current, units });
    return true;
  }

  private unitAt(x: number, y: number): TechniqueLabUnit | undefined {
    return this.current.units.find((unit) => unit.x === x && unit.y === y);
  }

  private inBounds(x: number, y: number): boolean {
    return x >= TECHNIQUE_LAB_MAP.origin.x
      && y >= TECHNIQUE_LAB_MAP.origin.y
      && x < TECHNIQUE_LAB_MAP.origin.x + TECHNIQUE_LAB_MAP.width
      && y < TECHNIQUE_LAB_MAP.origin.y + TECHNIQUE_LAB_MAP.height;
  }

  private update(next: TechniqueLabState): void {
    this.current = { ...next, revision: this.current.revision + 1 };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.current);
  }
}
