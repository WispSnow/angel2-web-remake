import type { ArenaUnitPlacement } from "./arena-session";
import {
  classDefinition,
  classFallbackPortraitFor,
  CLASS_IDS,
  className,
  promotionExperienceThresholdFor,
  type ClassId,
} from "./content/classes";
import { STAGE1_DEFINITION } from "./content/stage1";
import type { ArenaBattleEnvironment } from "./simulation/arena-battle";
import { CLASS_SHOWDOWN_MAP, classShowdownTerrainSlotAt } from "./class-showdown-session";

export const PROMOTION_LAB_CLASS_IDS = CLASS_IDS.filter(
  (classId) => classDefinition(classId).promotion.targets.length > 0,
);

export const PROMOTION_LAB_ROWS_PER_COLUMN = Math.ceil(PROMOTION_LAB_CLASS_IDS.length / 2);

const COLUMN_X = [
  { ally: 17, enemy: 18 },
  { ally: 29, enemy: 30 },
] as const;
const FIRST_ROW_Y = 14;

export function promotionLabExperienceFor(classId: ClassId): number {
  return promotionExperienceThresholdFor(classId) - 1;
}

export function createPromotionLabPlacements(): readonly ArenaUnitPlacement[] {
  return PROMOTION_LAB_CLASS_IDS.flatMap((classId, index) => {
    const column = Math.floor(index / PROMOTION_LAB_ROWS_PER_COLUMN);
    const row = index % PROMOTION_LAB_ROWS_PER_COLUMN;
    const x = COLUMN_X[column];
    if (!x) throw new Error(`Promotion lab column ${column} is not configured`);
    const experience = promotionLabExperienceFor(classId);
    const y = FIRST_ROW_Y + row;
    return [
      {
        id: `promotion-1-${index}`,
        side: 1 as const,
        slot: index,
        classId,
        level: 3 as const,
        experience,
        name: index === 0 ? "妮雅" : className(classId),
        portrait: index === 0 ? 46 : classFallbackPortraitFor(classId, 1),
        x: x.ally,
        y,
      },
      {
        id: `promotion-2-${index}`,
        side: 2 as const,
        slot: index,
        classId,
        level: 3 as const,
        experience,
        portrait: classFallbackPortraitFor(classId, 2),
        x: x.enemy,
        y,
      },
    ];
  });
}

export const PROMOTION_LAB_STAGE_DEFINITION = {
  ...STAGE1_DEFINITION,
  name: "轉職觸發實驗室",
  contentIdentity: "promotion-lab/plain-field-1",
  viewport: {
    ...STAGE1_DEFINITION.viewport,
    initialOrigin: { x: 15, y: 13 },
  },
  objective: {
    victory: { type: "eliminate-side", side: 2 },
    defeat: { type: "eliminate-side", side: 1 },
    victoryText: "完成轉職觸發與敵方升級檢查。",
    defeatText: "我方轉職測試單位全部離場。",
    victoryStatusText: "轉職觸發測試完成。",
  },
  deployment: { kind: "fixed" },
  stories: { roundStarts: [] },
  events: [],
} as const;

export const PROMOTION_LAB_ENVIRONMENT: ArenaBattleEnvironment = {
  definition: PROMOTION_LAB_STAGE_DEFINITION,
  map: CLASS_SHOWDOWN_MAP.source,
  minimap: CLASS_SHOWDOWN_MAP.minimap,
  terrainSlotAt: classShowdownTerrainSlotAt,
  destinationLabel: "轉職實驗室編成",
  entryStatusText: "轉職觸發測試開始：每組雙方都只差 1 經驗進入第 4 成長行。",
  retryStatusText: "以原始轉職臨界經驗重新開始。",
  retreatStatusText: "退出本場交戰並重置全部轉職臨界經驗。",
  enemyPhaseStatusText: "敵方階段：敵軍取得經驗只會升級，不會進入轉職選單。",
};

export function promotionLabPair(
  placements: readonly ArenaUnitPlacement[],
  classId: ClassId,
): readonly [ArenaUnitPlacement, ArenaUnitPlacement] | undefined {
  const pair = placements.filter((placement) => placement.classId === classId);
  return pair.length === 2
    ? [pair[0] as ArenaUnitPlacement, pair[1] as ArenaUnitPlacement]
    : undefined;
}
