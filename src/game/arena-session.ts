import {
  classDefinition,
  className,
  movementRulesFor,
  type ClassId,
} from "./content/classes";
import { ALLY_MAP_UNIT_ASSETS } from "./content/map-unit-assets";
import { stage1TerrainSlotAt } from "./content/stage1";

export const ARENA_MAP = {
  source: "/assets/original/stage1-map.png",
  minimap: "/assets/original/stage1-minimap.png",
  width: 50,
  height: 50,
  bounds: {
    min: { x: 14, y: 13 },
    max: { x: 35, y: 37 },
  },
} as const;

export const ARENA_TERRAIN_SLOTS = [1, 2, 3, 5, 6, 10, 11, 12] as const;
export const ARENA_MAX_UNITS_PER_SIDE = 24;

/**
 * Arena availability is intentionally explicit. Adding a class here means its
 * map figure, ordinary combat presentation and current command set are ready
 * for integrated turn testing; it does not claim that every native ability is
 * already implemented.
 */
export const ARENA_CLASS_IDS = Object.keys(ALLY_MAP_UNIT_ASSETS) as Array<
  keyof typeof ALLY_MAP_UNIT_ASSETS
>;
export type ArenaClassId = (typeof ARENA_CLASS_IDS)[number];

export type ArenaSide = 1 | 2;
export type ArenaLevel = 1 | 2 | 3;
export type ArenaTool = "place" | "erase";

export interface ArenaUnitPlacement {
  readonly id: string;
  readonly side: ArenaSide;
  readonly slot: number;
  readonly classId: ArenaClassId;
  readonly level: ArenaLevel;
  readonly x: number;
  readonly y: number;
}

export interface ArenaState {
  readonly units: readonly ArenaUnitPlacement[];
  readonly placementSide: ArenaSide;
  readonly placementClass: ArenaClassId;
  readonly placementLevel: ArenaLevel;
  readonly tool: ArenaTool;
  readonly status: string;
  readonly revision: number;
}

export interface ArenaPlacementResult {
  readonly ok: boolean;
  readonly reason?: string;
}

type Listener = (state: ArenaState) => void;

const DEFAULT_UNITS: readonly ArenaUnitPlacement[] = [
  { id: "arena-1-0", side: 1, slot: 0, classId: "soldier", level: 3, x: 18, y: 30 },
  { id: "arena-1-1", side: 1, slot: 1, classId: "archer", level: 3, x: 19, y: 32 },
  { id: "arena-1-2", side: 1, slot: 2, classId: "cavalry", level: 3, x: 17, y: 34 },
  { id: "arena-1-3", side: 1, slot: 3, classId: "sister", level: 3, x: 20, y: 29 },
  { id: "arena-2-0", side: 2, slot: 0, classId: "soldier", level: 3, x: 30, y: 30 },
  { id: "arena-2-1", side: 2, slot: 1, classId: "archer", level: 3, x: 29, y: 28 },
  { id: "arena-2-2", side: 2, slot: 2, classId: "cavalry", level: 3, x: 31, y: 26 },
  { id: "arena-2-3", side: 2, slot: 3, classId: "sister", level: 3, x: 28, y: 32 },
];

const cloneUnits = (units: readonly ArenaUnitPlacement[]): ArenaUnitPlacement[] =>
  units.map((unit) => ({ ...unit }));

export function arenaExperienceForLevel(classId: ClassId, level: ArenaLevel): number {
  const row = classDefinition(classId).dataRows[level - 1];
  if (!row) throw new Error(`${classId} has no level ${level} data row`);
  return row.experienceThreshold;
}

export function arenaEnemyMapAsset(classId: ArenaClassId): string {
  return `/assets/original/technique-lab/units/enemy-${classId}.png`;
}

export function arenaClassSupportsCurrentSpecialAction(classId: ArenaClassId): boolean {
  return [
    "archer",
    "sister",
    "magician",
    "monk",
    "magic-priest",
    "prayer-guide",
    "curse-master",
    "magic-guide",
    "great-dragon-knight",
    "wizard",
    "engineer",
  ].includes(classId);
}

export function arenaTerrainSlotAt(x: number, y: number): number {
  return stage1TerrainSlotAt({ x, y });
}

export function arenaInBounds(x: number, y: number): boolean {
  return x >= ARENA_MAP.bounds.min.x
    && x <= ARENA_MAP.bounds.max.x
    && y >= ARENA_MAP.bounds.min.y
    && y <= ARENA_MAP.bounds.max.y;
}

export function arenaClassCanStandAt(classId: ArenaClassId, x: number, y: number): boolean {
  if (!arenaInBounds(x, y)) return false;
  const terrainSlot = arenaTerrainSlotAt(x, y);
  return terrainSlot !== 0 && (movementRulesFor(classId)[terrainSlot] ?? 99) < 98;
}

export class ArenaSession {
  private readonly listeners = new Set<Listener>();
  private nextSlotBySide: Record<ArenaSide, number> = { 1: 4, 2: 4 };
  private current: ArenaState = {
    units: cloneUnits(DEFAULT_UNITS),
    placementSide: 1,
    placementClass: "soldier",
    placementLevel: 3,
    tool: "place",
    status: "地形覆蓋預設：雙方各四人，可直接開戰或修改編成。",
    revision: 0,
  };

  get state(): ArenaState {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  setSide(placementSide: ArenaSide): void {
    this.update({ ...this.current, placementSide });
  }

  setClass(placementClass: ArenaClassId): void {
    this.update({ ...this.current, placementClass });
  }

  setLevel(placementLevel: ArenaLevel): void {
    this.update({ ...this.current, placementLevel });
  }

  setTool(tool: ArenaTool): void {
    this.update({ ...this.current, tool });
  }

  interact(x: number, y: number): ArenaPlacementResult {
    if (!arenaInBounds(x, y)) return this.reject("只能在競技場完整地圖範圍內編成。");
    if (this.current.tool === "erase") return this.erase(x, y);
    return this.place(x, y);
  }

  erase(x: number, y: number): ArenaPlacementResult {
    const existing = this.unitAt(x, y);
    if (!existing) return this.reject("這一格沒有單位可移除。");
    this.update({
      ...this.current,
      units: this.current.units.filter(({ id }) => id !== existing.id),
      status: `已移除${existing.side === 1 ? "我方" : "敵方"}${className(existing.classId)}。`,
    });
    return { ok: true };
  }

  clear(): void {
    this.nextSlotBySide = { 1: 0, 2: 0 };
    this.update({ ...this.current, units: [], status: "編成已清空。" });
  }

  reset(): void {
    this.nextSlotBySide = { 1: 4, 2: 4 };
    this.update({
      ...this.current,
      units: cloneUnits(DEFAULT_UNITS),
      status: "已恢復地形覆蓋預設。",
    });
  }

  validationMessage(): string | undefined {
    if (!this.current.units.some(({ side }) => side === 1)) return "至少放置一名我方單位。";
    if (!this.current.units.some(({ side }) => side === 2)) return "至少放置一名敵方單位。";
    return undefined;
  }

  private place(x: number, y: number): ArenaPlacementResult {
    const {
      placementSide: side,
      placementClass: classId,
      placementLevel: level,
    } = this.current;
    if (!arenaClassCanStandAt(classId, x, y)) {
      return this.reject(`${className(classId)}不能站在這種地形上。`);
    }
    const existing = this.unitAt(x, y);
    const sideCount = this.current.units.filter((unit) => unit.side === side).length;
    if (!existing && sideCount >= ARENA_MAX_UNITS_PER_SIDE) {
      return this.reject(`每方最多配置 ${ARENA_MAX_UNITS_PER_SIDE} 名單位。`);
    }
    const slot = existing?.side === side
      ? existing.slot
      : this.allocateSlot(side);
    const unit: ArenaUnitPlacement = {
      id: `arena-${side}-${slot}`,
      side,
      slot,
      classId,
      level,
      x,
      y,
    };
    const units = existing
      ? this.current.units.map((candidate) => candidate.id === existing.id ? unit : candidate)
      : [...this.current.units, unit];
    this.update({
      ...this.current,
      units,
      status: `${side === 1 ? "我方" : "敵方"}${className(classId)}・等級 ${level} 已配置於 (${x}, ${y})。`,
    });
    return { ok: true };
  }

  private allocateSlot(side: ArenaSide): number {
    const used = new Set(this.current.units.filter((unit) => unit.side === side).map(({ slot }) => slot));
    let slot = this.nextSlotBySide[side];
    while (used.has(slot)) slot += 1;
    if (slot >= 75) throw new Error(`Arena side ${side} exhausted campaign-compatible slots`);
    this.nextSlotBySide[side] = slot + 1;
    return slot;
  }

  private unitAt(x: number, y: number): ArenaUnitPlacement | undefined {
    return this.current.units.find((unit) => unit.x === x && unit.y === y);
  }

  private reject(reason: string): ArenaPlacementResult {
    this.update({ ...this.current, status: reason });
    return { ok: false, reason };
  }

  private update(state: ArenaState): void {
    this.current = { ...state, revision: this.current.revision + 1 };
    for (const listener of this.listeners) listener(this.current);
  }
}
