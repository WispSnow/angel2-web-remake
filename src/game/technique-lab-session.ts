import type { ClassId } from "./content/classes";
import {
  TECHNIQUE_LAB_CATALOG,
  TECHNIQUE_LAB_LIGHTNING,
  TECHNIQUE_LAB_UNIT_ASSETS,
} from "./content/technique-lab.generated";

export const TECHNIQUE_LAB_MAP = {
  origin: { x: 15, y: 13 },
  width: 16,
  height: 11,
} as const;

export type TechniqueLabSide = 1 | 2;
export type TechniqueLabTool = "place" | "actor" | "target" | "erase";
export type TechniqueLabNativeCode = (typeof TECHNIQUE_LAB_CATALOG)[number]["nativeCode"];

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
  { id: "lab-1", side: 1, classId: "magician", x: 20, y: 18 },
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
    this.update({ ...this.current, actionCode });
    return true;
  }

  interact(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.current.tool === "target") {
      this.update({ ...this.current, target: { x, y } });
      return true;
    }
    if (this.current.tool === "erase") return this.erase(x, y);
    if (this.current.tool === "actor") {
      const unit = this.unitAt(x, y);
      if (!unit) return false;
      this.update({ ...this.current, actorId: unit.id });
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

  effectCells(): readonly TechniqueLabEffectCell[] {
    const radius = this.current.actionCode.endsWith("L")
      ? TECHNIQUE_LAB_LIGHTNING[this.current.actionCode as keyof typeof TECHNIQUE_LAB_LIGHTNING]
        .effectRadius
      : this.current.actionCode === "1C" ? 3 : 1;
    const cells: TechniqueLabEffectCell[] = [];
    for (let y = 0; y < 50; y += 1) {
      for (let x = 0; x < 50; x += 1) {
        const distance = Math.abs(this.current.target.x - x) + Math.abs(this.current.target.y - y);
        const value = radius - distance;
        if (value > 0) cells.push({ position: { x, y }, value });
      }
    }
    return cells;
  }

  affectedUnits(): readonly TechniqueLabUnit[] {
    const actor = this.actor();
    if (!actor) return [];
    const effectValues = new Map(this.effectCells().map(({ position, value }) => [
      `${position.x},${position.y}`,
      value,
    ]));
    const desiredSide = this.current.actionCode === "1H" ? actor.side : actor.side === 1 ? 2 : 1;
    return this.current.units.filter((unit) => {
      if (unit.side !== desiredSide) return false;
      if (this.current.actionCode === "1F" || this.current.actionCode === "1H") {
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
