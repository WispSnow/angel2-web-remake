import {
  ARENA_CLASS_IDS,
  ARENA_MAP,
  arenaEnemyMapAsset,
  arenaExperienceForLevel,
  type ArenaUnitPlacement,
} from "../arena-session";
import { completeCampaignRoster, statsFor } from "../content/stage0";
import {
  activateStage1Content,
  stage1TerrainSlotAt,
  STAGE1_ASSETS,
  STAGE1_DEFINITION,
} from "../content/stage1";
import { classDefinition, className } from "../content/classes";
import { emptyUnitStatuses } from "./status";
import { Stage0Battle, type BattleScenario } from "./battle";
import { DeterministicRng } from "./rng";
import type { ForceDefinition } from "./forces";
import type { LoadedStageRuntime, MapUnitSpriteKey } from "../stage-runtime";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  PortraitRecord,
  SavedBattleState,
  SaveRosterEntry,
} from "../types";

const ARENA_RNG_STATE = 0x0a2e2026;

export const ARENA_STAGE_DEFINITION = {
  ...STAGE1_DEFINITION,
  name: "全地形競技場",
  contentIdentity: "arena-lab/common-terrain-1",
  viewport: {
    ...STAGE1_DEFINITION.viewport,
    initialOrigin: { x: 20, y: 27 },
  },
  objective: {
    victory: { type: "eliminate-side", side: 2 },
    defeat: { type: "eliminate-side", side: 1 },
    victoryText: "擊倒全部敵方單位。",
    defeatText: "我方單位全部離場。",
    victoryStatusText: "競技場測試完成：敵方單位已全數離場。",
  },
  deployment: { kind: "fixed" },
  stories: { roundStarts: [] },
  events: [],
} as const;

function createArenaUnit(
  placement: ArenaUnitPlacement,
  difficulty: Difficulty,
): BattleUnit {
  const experience = arenaExperienceForLevel(placement.classId, placement.level);
  const unit: BattleUnit = {
    id: placement.id,
    side: placement.side,
    slot: placement.slot,
    classId: placement.classId,
    className: className(placement.classId),
    name: `${placement.side === 1 ? "我方" : "敵方"}${className(placement.classId)}`,
    portrait: (placement.side === 1 ? 47 : 48) as PortraitRecord,
    x: placement.x,
    y: placement.y,
    life: 0,
    experience,
    acted: false,
    actionDisabled: false,
    statuses: emptyUnitStatuses(),
  };
  unit.life = statsFor(unit, difficulty).maxLife;
  return unit;
}

function createArenaUnits(
  placements: readonly ArenaUnitPlacement[],
  difficulty: Difficulty,
): BattleUnit[] {
  return placements.map((placement) => createArenaUnit(placement, difficulty));
}

function arenaRoster(units: readonly BattleUnit[]): SaveRosterEntry[] {
  return completeCampaignRoster(units.filter(({ side }) => side === 1).map((unit) => ({
    slot: unit.slot,
    classId: unit.classId,
    experience: unit.experience,
    life: unit.life,
  })));
}

function arenaForces(units: readonly BattleUnit[]): readonly ForceDefinition[] {
  const allies = units.filter(({ side }) => side === 1).map(({ id }) => id);
  const enemies = units.filter(({ side }) => side === 2).map(({ id }) => id);
  if (allies.length === 0 || enemies.length === 0) {
    throw new Error("Arena battle requires at least one unit on each side");
  }
  return [
    {
      id: "arena-player-force",
      label: "競技場我方",
      side: 1,
      control: "player",
      unitIds: allies,
      commanderId: allies[0],
      doctrine: { strategy: "native" },
    },
    {
      id: "arena-enemy-force",
      label: "競技場敵方",
      side: 2,
      control: "independent-ai",
      unitIds: enemies,
      doctrine: { strategy: "native" },
    },
  ];
}

function arenaScenario(
  placements: readonly ArenaUnitPlacement[],
  difficulty: Difficulty,
): BattleScenario {
  const units = createArenaUnits(placements, difficulty);
  return {
    stage: ARENA_STAGE_DEFINITION,
    width: ARENA_STAGE_DEFINITION.width,
    height: ARENA_STAGE_DEFINITION.height,
    terrainSlotAt: stage1TerrainSlotAt,
    createUnits: () => units.map((unit) => ({ ...unit, statuses: { ...unit.statuses } })),
    createCampaignRoster: () => arenaRoster(units),
    enemyClassPriority: Object.fromEntries(
      ARENA_CLASS_IDS.map((classId) => [classId, classDefinition(classId).nativeRecord]),
    ),
    alliedBehaviorById: new Map(units.filter(({ side }) => side === 1).map(({ id }) => [id, 0])),
    enemyBehaviorById: new Map(units.filter(({ side }) => side === 2).map(({ id }) => [id, 0])),
    forces: arenaForces(units),
  };
}

export class ArenaBattle extends Stage0Battle {
  constructor(
    placements: readonly ArenaUnitPlacement[],
    difficulty: Difficulty,
    rng = new DeterministicRng(ARENA_RNG_STATE),
  ) {
    activateStage1Content();
    super(difficulty, rng, arenaScenario(placements, difficulty));
    this.focusId = placements.find(({ side }) => side === 1)?.id ?? this.focusId;
  }
}

export function createArenaCampaignState(
  placements: readonly ArenaUnitPlacement[],
  difficulty: Difficulty,
): CampaignState {
  const battle = new ArenaBattle(placements, difficulty);
  return battle.campaignSnapshot();
}

function arenaUnitSprites(
  placements: readonly ArenaUnitPlacement[],
): Partial<Record<MapUnitSpriteKey, string>> {
  return Object.fromEntries(
    [...new Set(placements.filter(({ side }) => side === 2).map(({ classId }) => classId))]
      .map((classId) => [`enemy-${classId}` as const, arenaEnemyMapAsset(classId)]),
  );
}

export function createArenaRuntime(
  placements: readonly ArenaUnitPlacement[],
): LoadedStageRuntime {
  const frozenPlacements = placements.map((placement) => ({ ...placement }));
  const createBattle: LoadedStageRuntime["createBattle"] = (
    campaign,
    _preparation,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ): Stage0Battle => new ArenaBattle(frozenPlacements, campaign.difficulty, rng);
  return {
    id: "stage-01",
    ordinal: 1,
    label: ARENA_STAGE_DEFINITION.name,
    nextStageId: "stage-02",
    focusUnitId: frozenPlacements.find(({ side }) => side === 1)?.id ?? "arena-1-0",
    mapPresentationActionIds: [
      "archer-shot",
      "fire-1",
      "heal-1",
      "lightning-1",
      "ice-1",
      "recovery-1",
      "dispel",
    ],
    entry: {
      trigger: "battle-started",
      phase: "player",
      statusText: "競技場測試開始。",
    },
    retry: {
      mode: "entry",
      statusText: "以目前競技場編成重新開始。",
      retreatStatusText: "退出本場交戰並以目前編成重置。",
    },
    enemyPhaseStatusText: "敵方階段：競技場 AI 開始行動。",
    completion: {
      destinationLabel: "競技場編成",
      destinationProgress: 1000,
      consumedEvents: "none",
    },
    save: {
      validEventIds: [],
      alliedUnits: {
        kind: "exact-slots",
        slots: frozenPlacements.filter(({ side }) => side === 1).map(({ slot }) => slot),
      },
      enemyClassById: frozenPlacements
        .filter(({ side }) => side === 2)
        .map(({ id, classId }) => [id, classId] as const),
      enemyAi: "none",
    },
    definition: ARENA_STAGE_DEFINITION,
    assets: {
      map: ARENA_MAP.source,
      minimap: ARENA_MAP.minimap,
      storyBackground: STAGE1_ASSETS.storyBackground,
      unitSprites: arenaUnitSprites(frozenPlacements),
    },
    createBattle,
    restoreBattle: (campaign, snapshot: SavedBattleState) => {
      const battle = createBattle(campaign);
      battle.restore(snapshot, campaign.roster);
      return battle;
    },
  };
}
