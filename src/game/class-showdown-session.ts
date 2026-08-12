import {
  classDefinition,
  classFallbackPortraitFor,
  CLASS_IDS,
  type ClassId,
} from "./content/classes";
import { STAGE1_DEFINITION } from "./content/stage1";
import type {
  ArenaBattleEnvironment,
} from "./simulation/arena-battle";
import type {
  ArenaLevel,
  ArenaUnitPlacement,
} from "./arena-session";

export const CLASS_SHOWDOWN_CLASS_IDS = CLASS_IDS.filter(
  (classId) => classDefinition(classId).recordKind === "ordinary_catalog",
);

export const CLASS_SHOWDOWN_EXCLUDED_CLASS_IDS = CLASS_IDS.filter(
  (classId) => !CLASS_SHOWDOWN_CLASS_IDS.includes(classId),
);

export const CLASS_SHOWDOWN_MAP = {
  source: "/assets/labs/class-showdown-map.svg",
  minimap: "/assets/labs/class-showdown-minimap.svg",
} as const;

export const CLASS_SHOWDOWN_ROWS_PER_COLUMN = Math.ceil(
  CLASS_SHOWDOWN_CLASS_IDS.length / 2,
);

const COLUMN_X = [
  { ally: 17, enemy: 18 },
  { ally: 29, enemy: 30 },
] as const;
const FIRST_ROW_Y = 15;

export function classShowdownTerrainSlotAt(position: { x: number; y: number }): number {
  if (position.x < 0 || position.y < 0
    || position.x >= STAGE1_DEFINITION.width || position.y >= STAGE1_DEFINITION.height) return 0;
  return 2;
}

export function createClassShowdownPlacements(
  level: ArenaLevel,
): readonly ArenaUnitPlacement[] {
  return CLASS_SHOWDOWN_CLASS_IDS.flatMap((classId, index) => {
    const column = Math.floor(index / CLASS_SHOWDOWN_ROWS_PER_COLUMN);
    const row = index % CLASS_SHOWDOWN_ROWS_PER_COLUMN;
    const x = COLUMN_X[column];
    if (!x) throw new Error(`Class showdown column ${column} is not configured`);
    const y = FIRST_ROW_Y + row;
    return [
      {
        id: `arena-1-${index}`,
        side: 1 as const,
        slot: index,
        classId,
        level,
        portrait: classFallbackPortraitFor(classId, 1),
        x: x.ally,
        y,
      },
      {
        id: `arena-2-${index}`,
        side: 2 as const,
        slot: index,
        classId,
        level,
        portrait: classFallbackPortraitFor(classId, 2),
        x: x.enemy,
        y,
      },
    ];
  });
}

export const CLASS_SHOWDOWN_STAGE_DEFINITION = {
  ...STAGE1_DEFINITION,
  name: "全職業對陣場",
  contentIdentity: "class-showdown-lab/plain-field-1",
  viewport: {
    ...STAGE1_DEFINITION.viewport,
    initialOrigin: { x: 15, y: 13 },
  },
  objective: {
    victory: { type: "eliminate-side", side: 2 },
    defeat: { type: "eliminate-side", side: 1 },
    victoryText: "擊倒全部敵方職業測試單位。",
    defeatText: "我方職業測試單位全部離場。",
    victoryStatusText: "職業對陣測試完成：敵方單位已全數離場。",
  },
  deployment: { kind: "fixed" },
  stories: { roundStarts: [] },
  events: [],
} as const;

export const CLASS_SHOWDOWN_ENVIRONMENT: ArenaBattleEnvironment = {
  definition: CLASS_SHOWDOWN_STAGE_DEFINITION,
  map: CLASS_SHOWDOWN_MAP.source,
  minimap: CLASS_SHOWDOWN_MAP.minimap,
  terrainSlotAt: classShowdownTerrainSlotAt,
  destinationLabel: "職業對陣編成",
  entryStatusText: "全職業對陣測試開始。",
  retryStatusText: "以目前統一等級重新開始全職業對陣。",
  retreatStatusText: "退出本場交戰並以目前統一等級重置。",
  enemyPhaseStatusText: "敵方階段：各職業測試 AI 開始行動。",
};

export function classShowdownPair(
  placements: readonly ArenaUnitPlacement[],
  classId: ClassId,
): readonly [ArenaUnitPlacement, ArenaUnitPlacement] | undefined {
  const pair = placements.filter((placement) => placement.classId === classId);
  return pair.length === 2
    ? [pair[0] as ArenaUnitPlacement, pair[1] as ArenaUnitPlacement]
    : undefined;
}
