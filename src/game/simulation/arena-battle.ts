import {
  ARENA_CLASS_IDS,
  ARENA_MAP,
  arenaEnemyMapAsset,
  arenaExperienceForLevel,
  type ArenaUnitPlacement,
} from "../arena-session";
import { TECHNIQUE_LAB_UNIT_ASSETS } from "../content/technique-lab.generated";
import { completeCampaignRoster, statsFor } from "../content/stage0";
import {
  activateStage1Content,
  stage1TerrainSlotAt,
  STAGE1_ASSETS,
  STAGE1_DEFINITION,
  STAGE1_IRON_PLATE_TERRAIN_SLOT,
  STAGE1_OBSTACLE_TERRAIN_SLOT,
} from "../content/stage1";
import {
  classDefinition,
  classFallbackPortraitFor,
  className,
} from "../content/classes";
import { allyMapUnitAsset } from "../content/map-unit-assets";
import type { StageDefinition } from "../content/stages";
import { emptyUnitStatuses } from "./status";
import { Stage0Battle, type BattleScenario } from "./battle";
import { DeterministicRng } from "./rng";
import type { ForceDefinition } from "./forces";
import type { LoadedStageRuntime, MapUnitSpriteKey } from "../stage-runtime";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  Position,
  PortraitRecord,
  SavedBattleState,
  SaveRosterEntry,
} from "../types";
import type { BattleActionId } from "../content/actions";
import type { ClassId } from "../content/classes";

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

export interface ArenaBattleEnvironment {
  readonly definition: StageDefinition<"stage-01">;
  readonly map: string;
  readonly minimap: string;
  readonly terrainSlotAt: (position: Position) => number;
  readonly destinationLabel: string;
  readonly entryStatusText: string;
  readonly retryStatusText: string;
  readonly retreatStatusText: string;
  readonly enemyPhaseStatusText: string;
  readonly additionalClassActions?: Readonly<Partial<Record<ClassId, readonly BattleActionId[]>>>;
}

export const ALL_TERRAIN_ARENA_ENVIRONMENT: ArenaBattleEnvironment = {
  definition: ARENA_STAGE_DEFINITION,
  map: ARENA_MAP.source,
  minimap: ARENA_MAP.minimap,
  terrainSlotAt: stage1TerrainSlotAt,
  destinationLabel: "競技場編成",
  entryStatusText: "競技場測試開始。",
  retryStatusText: "以目前競技場編成重新開始。",
  retreatStatusText: "退出本場交戰並以目前編成重置。",
  enemyPhaseStatusText: "敵方階段：競技場 AI 開始行動。",
};

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
    // Side remains explicit in simulation state and the map figure. Keep the
    // arena identity short so the right panel does not repeat it in the name.
    name: className(placement.classId),
    portrait: placement.portrait
      ?? classFallbackPortraitFor(placement.classId, placement.side)
      ?? (placement.side === 1 ? 47 : 48) as PortraitRecord,
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
      tacticLabel: "主動進攻",
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
  environment: ArenaBattleEnvironment,
): BattleScenario {
  const units = createArenaUnits(placements, difficulty);
  return {
    stage: environment.definition,
    width: environment.definition.width,
    height: environment.definition.height,
    terrainSlotAt: environment.terrainSlotAt,
    dynamicTerrainSlots: {
      "iron-plate": STAGE1_IRON_PLATE_TERRAIN_SLOT,
      obstacle: STAGE1_OBSTACLE_TERRAIN_SLOT,
    },
    createUnits: () => units.map((unit) => ({ ...unit, statuses: { ...unit.statuses } })),
    createCampaignRoster: () => arenaRoster(units),
    enemyClassPriority: Object.fromEntries(
      ARENA_CLASS_IDS.map((classId) => [classId, classDefinition(classId).nativeRecord]),
    ),
    alliedBehaviorById: new Map(units.filter(({ side }) => side === 1).map(({ id }) => [id, 0])),
    enemyBehaviorById: new Map(units.filter(({ side }) => side === 2).map(({ id }) => [id, 0])),
    additionalClassActions: environment.additionalClassActions,
    forces: arenaForces(units),
  };
}

export class ArenaBattle extends Stage0Battle {
  constructor(
    placements: readonly ArenaUnitPlacement[],
    difficulty: Difficulty,
    rng = new DeterministicRng(ARENA_RNG_STATE),
    environment: ArenaBattleEnvironment = ALL_TERRAIN_ARENA_ENVIRONMENT,
  ) {
    activateStage1Content();
    super(difficulty, rng, arenaScenario(placements, difficulty, environment));
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
  const sprites: Partial<Record<MapUnitSpriteKey, string>> = {};
  for (const classId of new Set(placements.map(({ classId }) => classId))) {
    sprites[`enemy-${classId}`] = arenaEnemyMapAsset(classId);
    const allySource = TECHNIQUE_LAB_UNIT_ASSETS[classId].ally;
    if (!allyMapUnitAsset(classId) && allySource) sprites[`ally-${classId}`] = allySource;
  }
  return sprites;
}

export function createArenaRuntime(
  placements: readonly ArenaUnitPlacement[],
  environment: ArenaBattleEnvironment = ALL_TERRAIN_ARENA_ENVIRONMENT,
): LoadedStageRuntime {
  const frozenPlacements = placements.map((placement) => ({ ...placement }));
  const additionalMapPresentationActionIds = Object.values(
    environment.additionalClassActions ?? {},
  ).flatMap((actionIds) => actionIds ?? []);
  const createBattle: LoadedStageRuntime["createBattle"] = (
    campaign,
    _preparation,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ): Stage0Battle => new ArenaBattle(frozenPlacements, campaign.difficulty, rng, environment);
  return {
    id: "stage-01",
    ordinal: 1,
    label: environment.definition.name,
    nextStageId: "stage-02",
    focusUnitId: frozenPlacements.find(({ side }) => side === 1)?.id ?? "arena-1-0",
    mapPresentationActionIds: [
      "archer-shot",
      "fire-1",
      "fire-2",
      "fire-3",
      "fire-4",
      "heal-1",
      "heal-2",
      "heal-3",
      "lightning-1",
      "lightning-2",
      "lightning-3",
      "lightning-4",
      "ice-1",
      "ice-2",
      "ice-3",
      "ice-4",
      "recovery-1",
      "recovery-2",
      "recovery-3",
      "attack-up",
      "defense-up",
      "magic-guard",
      "poison",
      "confusion",
      "attack-down",
      "defense-down",
      "spell-seal",
      "prayer",
      "dispel",
      "stomp-1",
      "stomp-2",
      "stomp-3",
      "iron-plate",
      "obstacle",
      ...additionalMapPresentationActionIds,
    ],
    entry: {
      trigger: "battle-started",
      phase: "player",
      statusText: environment.entryStatusText,
    },
    retry: {
      mode: "entry",
      statusText: environment.retryStatusText,
      retreatStatusText: environment.retreatStatusText,
    },
    enemyPhaseStatusText: environment.enemyPhaseStatusText,
    completion: {
      destinationLabel: environment.destinationLabel,
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
    definition: environment.definition,
    assets: {
      map: environment.map,
      minimap: environment.minimap,
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
