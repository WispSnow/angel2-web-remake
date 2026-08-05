import { STAGE0_DEFINITION, type InteractiveDeploymentDefinition, type StageDefinition } from "./content/stages";
import type { CampaignRouteId } from "./content/stage-effects";
import { createStage0Units } from "./content/stage0";
import type { BattleActionId } from "./content/actions";
import type { DeploymentRosterUnit } from "./deployment-session";
import { Stage0Battle } from "./simulation/battle";
import type { DeploymentResult } from "./simulation/deployment";
import { DeterministicRng } from "./simulation/rng";
import type {
  BattleUnit,
  CampaignState,
  GamePhase,
  Position,
  SavedBattleState,
  StageId,
  UnitClassId,
} from "./types";

export type MapUnitSpriteKey = `${"ally" | "enemy"}-${UnitClassId}`;

export interface StageRuntimeAssets {
  map: string;
  minimap: string;
  storyBackground?: string;
  unitSprites: Readonly<Partial<Record<MapUnitSpriteKey, string>>>;
  routePulsePresentations?: readonly RoutePulsePresentationDefinition[];
}

export interface RoutePulsePresentationDefinition {
  id: string;
  resource: string;
  frames: readonly string[];
  runtimeTileCodes: readonly number[];
  effectRangeValue: number;
  rangeThresholdStart: number;
  rangeThresholdDecrementPerDraw: number;
  sweepWidth: number;
  iterations: number;
  drawsPerIteration: number;
  waitPerDrawNativeTicks: number;
  minimumStaticFeedbackNativeTicks: number;
  fixedGraphicWaitNativeTicks: number;
}

export interface StageDeploymentPresentation {
  kicker: string;
  title: string;
  objective: string;
  minimap: string;
  terrain: Uint8Array;
  gridWidth: number;
  gridHeight: number;
  enemies: readonly Position[];
  pageLabels: readonly [string, string, string];
  finishLabel: string;
  minimumUnits: number;
  safeCells?: readonly Position[];
  dangerCells?: readonly Position[];
  dangerText?: string;
  guidanceText?: string;
}

export type StageSaveAlliedUnitRule =
  | { kind: "allowed-classes"; classIds: readonly UnitClassId[] }
  | {
    kind: "deployment";
    eligibleSlots: readonly number[];
    fixedSlots: readonly number[];
    optionalSlots: readonly number[];
    maximumUnits: number;
    openCellCount: number;
  }
  | { kind: "exact-slots"; slots: readonly number[] };

export interface StageSaveSchema {
  validEventIds: readonly string[];
  requiredResumeEventIds?: readonly string[];
  alliedUnits: StageSaveAlliedUnitRule;
  enemyClassById: readonly (readonly [string, UnitClassId])[];
  enemyAi: "none" | "stage-01-castle-guard";
}

export interface StagePreparationAdapter {
  kind: "deployment";
  definition: InteractiveDeploymentDefinition;
  presentation: StageDeploymentPresentation;
  consumedEventIdsOnRetry: readonly string[];
  createRoster: (campaign: CampaignState) => readonly DeploymentRosterUnit[];
  createInitialResult: () => DeploymentResult;
  createResultFromSavedUnits: (units: readonly BattleUnit[]) => DeploymentResult;
}

export interface StageRuntimeModule {
  definition: StageDefinition;
  assets?: StageRuntimeAssets;
  preparation?: StagePreparationAdapter;
  createBattle: (
    campaign: CampaignState,
    preparation?: DeploymentResult,
    rng?: DeterministicRng,
  ) => Stage0Battle;
  restoreBattle: (
    campaign: CampaignState,
    snapshot: SavedBattleState,
  ) => Stage0Battle;
}

export interface StageRuntimeManifestEntry {
  id: StageId;
  ordinal: number;
  label: string;
  nextStageId: CampaignRouteId;
  focusUnitId: string;
  mapPresentationActionIds: readonly BattleActionId[];
  entry: {
    trigger: "campaign-entered" | "battle-started";
    phase: Extract<GamePhase, "prebattleStory" | "player">;
    statusText: string;
    campaignRoute?: CampaignRouteId;
  };
  retry: {
    mode: "entry" | "preparation" | "skip-entry-story";
    statusText: string;
    retreatStatusText: string;
  };
  enemyPhaseStatusText: string;
  completion: {
    destinationLabel: string;
    destinationProgress: 0 | 1000;
    consumedEvents: "none" | "all";
  };
  save: StageSaveSchema;
  load: () => Promise<StageRuntimeModule>;
}

export type LoadedStageRuntime = Omit<StageRuntimeManifestEntry, "load"> & StageRuntimeModule;

function restoreBattle(
  createBattle: StageRuntimeModule["createBattle"],
  campaign: CampaignState,
  snapshot: SavedBattleState,
  preparation?: DeploymentResult,
): Stage0Battle {
  const battle = createBattle(
    campaign,
    preparation,
    new DeterministicRng(campaign.rngState, campaign.rngCalls),
  );
  battle.restore(snapshot, campaign.roster);
  return battle;
}

const stage0Module: StageRuntimeModule = {
  definition: STAGE0_DEFINITION,
  createBattle: (campaign) => Stage0Battle.fromCampaignEntry(campaign),
  restoreBattle: (campaign, snapshot) => {
    const battle = new Stage0Battle(
      campaign.difficulty,
      new DeterministicRng(campaign.rngState, campaign.rngCalls),
    );
    battle.restore(snapshot, campaign.roster);
    return battle;
  },
};

function createDeploymentPreparation(
  definition: InteractiveDeploymentDefinition,
  presentation: StageDeploymentPresentation,
  consumedEventIdsOnRetry: readonly string[],
  createRoster: StagePreparationAdapter["createRoster"],
): StagePreparationAdapter {
  return {
    kind: "deployment",
    definition,
    presentation,
    consumedEventIdsOnRetry,
    createRoster,
    createInitialResult: () => ({
      placements: definition.fixedPlacements.map(({ slot, position }) => ({
        slot,
        position: { ...position },
        fixed: true,
      })),
    }),
    createResultFromSavedUnits: (units) => {
      const optionalPlacements = units
        .filter(({ side, slot }) => side === 1
          && definition.optionalSlots.some((optionalSlot) => optionalSlot === slot))
        .map(({ slot }, index) => {
          const position = definition.openCells[index];
          if (!position) throw new Error("saved deployment exceeds its open cells");
          return { slot, position: { ...position }, fixed: false };
        });
      return {
        placements: [
          ...definition.fixedPlacements.map(({ slot, position }) => ({
            slot,
            position: { ...position },
            fixed: true,
          })),
          ...optionalPlacements,
        ],
      };
    },
  };
}

async function loadStage1Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage1"),
    import("./simulation/stage1-battle"),
  ]);
  content.activateStage1Content();
  const definition = content.STAGE1_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 01",
      title: content.STAGE1.name,
      objective: content.STAGE1_DEFINITION.objective.victoryText,
      minimap: content.STAGE1_ASSETS.minimap,
      terrain: content.STAGE1_TERRAIN_TOKENS,
      gridWidth: content.STAGE1.width,
      gridHeight: content.STAGE1.height,
      enemies: content.STAGE1_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: content.STAGE1_DEPLOYMENT_UI.feedbackText.pages,
      finishLabel: content.STAGE1_DEPLOYMENT_UI.feedbackText.finish,
      minimumUnits: definition.fixedPlacements.length,
    },
    [
      "stage-01-prebattle-story",
      "stage-01-enter-deployment",
    ],
    (campaign) => battleModule.createStage1DeploymentRoster(campaign.roster),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 1 requires a deployment result");
    return new battleModule.Stage1Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE1_DEFINITION,
    assets: {
      map: content.STAGE1_ASSETS.map,
      minimap: content.STAGE1_ASSETS.minimap,
      storyBackground: content.STAGE1_ASSETS.storyBackground,
      unitSprites: {
        "ally-magician": content.STAGE1_ASSETS.allyMagician,
        "ally-magic-priest": content.STAGE1_ASSETS.allyMagicPriest,
        "enemy-sister": content.STAGE1_ASSETS.enemySister,
      },
    },
    preparation,
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(
      createBattle,
      campaign,
      snapshot,
      preparation.createResultFromSavedUnits(snapshot.units),
    ),
  };
}

async function loadStage2Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage2"),
    import("./simulation/stage2-battle"),
  ]);
  content.activateStage2Content();
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, _preparation, rng) =>
    new battleModule.Stage2Battle(campaign, rng);
  return {
    definition: content.STAGE2_DEFINITION,
    assets: {
      map: content.STAGE2_ASSETS.map,
      minimap: content.STAGE2_ASSETS.minimap,
      unitSprites: {
        "ally-magician": content.STAGE2_ASSETS.allyMagician,
        "ally-magic-priest": content.STAGE2_ASSETS.allyMagicPriest,
        "enemy-sister": content.STAGE2_ASSETS.enemySister,
      },
    },
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(createBattle, campaign, snapshot),
  };
}

async function loadStage3Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage3"),
    import("./simulation/stage3-battle"),
  ]);
  content.activateStage3Content();
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, _preparation, rng) =>
    new battleModule.Stage3Battle(campaign, rng);
  return {
    definition: content.STAGE3_DEFINITION,
    assets: {
      map: content.STAGE3_ASSETS.map,
      minimap: content.STAGE3_ASSETS.minimap,
      unitSprites: {
        "ally-magician": content.STAGE3_ASSETS.allyMagician,
        "ally-magic-priest": content.STAGE3_ASSETS.allyMagicPriest,
        "enemy-sister": content.STAGE3_ASSETS.enemySister,
        "enemy-monk": content.STAGE3_ASSETS.enemyMonk,
      },
    },
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(createBattle, campaign, snapshot),
  };
}

async function loadStage4Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage4"),
    import("./simulation/stage4-battle"),
  ]);
  content.activateStage4Content();
  const definition = content.STAGE4_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 04",
      title: content.STAGE4.name,
      objective: content.STAGE4_DEFINITION.objective.victoryText,
      minimap: content.STAGE4_ASSETS.minimap,
      terrain: content.STAGE4_TERRAIN_TOKENS,
      gridWidth: content.STAGE4.width,
      gridHeight: content.STAGE4.height,
      enemies: content.STAGE4_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      safeCells: content.STAGE4_INITIAL_SAFE_CELLS,
      dangerCells: content.STAGE4_INITIAL_DANGER_CELLS,
      dangerText: "首輪力場區外：目前生命減半",
      guidanceText: "葛蒂拉斯行動後，結界外我方目前生命減半；防魔無效。",
    },
    ["stage-04-prebattle-story", "stage-04-enter-deployment"],
    (campaign) => battleModule.createStage4DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 4 requires a deployment result");
    return new battleModule.Stage4Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE4_DEFINITION,
    assets: {
      map: content.STAGE4_ASSETS.map,
      minimap: content.STAGE4_ASSETS.minimap,
      storyBackground: content.STAGE4_ASSETS.storyBackground,
      unitSprites: content.STAGE4_ASSETS.unitSprites,
      routePulsePresentations: [content.STAGE4_ASSETS.forceFieldPulse],
    },
    preparation,
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(
      createBattle,
      campaign,
      snapshot,
      preparation.createResultFromSavedUnits(snapshot.units),
    ),
  };
}

function createStage0SaveEnemyClasses(): readonly (readonly [string, UnitClassId])[] {
  return createStage0Units()
    .filter(({ side }) => side === 2)
    .map(({ id, classId }) => [id, classId] as const);
}

export const STAGE_RUNTIME_MANIFEST = {
  "stage-00": {
    id: "stage-00",
    ordinal: 0,
    label: "瓦爾克麗宮",
    nextStageId: "stage-01",
    focusUnitId: "1:0",
    mapPresentationActionIds: ["archer-shot", "fire-1", "heal-1"],
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "瓦爾克麗宮戰鬥開始。",
    },
    retry: {
      mode: "skip-entry-story",
      statusText: "重新建立第 0 關固定編隊。",
      retreatStatusText: "全面撤退：重新建立第 0 關固定編隊。",
    },
    enemyPhaseStatusText: "敵方階段：騎士團部隊向出口撤離。",
    completion: {
      destinationLabel: "騎士城堡前",
      destinationProgress: 0,
      consumedEvents: "none",
    },
    save: {
      validEventIds: STAGE0_DEFINITION.events.map(({ id }) => id),
      alliedUnits: {
        kind: "allowed-classes",
        classIds: ["soldier", "cavalry", "warrior", "archer", "sister"],
      },
      enemyClassById: createStage0SaveEnemyClasses(),
      enemyAi: "none",
    },
    load: async () => stage0Module,
  },
  "stage-01": {
    id: "stage-01",
    ordinal: 1,
    label: "騎士城堡前",
    nextStageId: "stage-02",
    focusUnitId: "1:0",
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
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "第一軍團抵達騎士城堡前。",
      campaignRoute: "stage-01",
    },
    enemyPhaseStatusText: "敵方階段：騎士團開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始第 1 關關前流程。",
      retreatStatusText: "全面撤退：返回第 1 關關前流程並重新編隊。",
    },
    completion: {
      destinationLabel: "攻打騎士堡",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-01-prebattle-story",
        "stage-01-enter-deployment",
        "stage-01-opening-story",
        "stage-01-boss-defeated",
        "stage-01-messenger-arrival",
        "stage-01-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-01-prebattle-story",
        "stage-01-enter-deployment",
        "stage-01-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 4, 24, 40, 41, 42, 43],
        fixedSlots: [42, 40, 43, 41, 0],
        optionalSlots: [1, 2, 4, 24],
        maximumUnits: 8,
        openCellCount: 3,
      },
      enemyClassById: [
        ["2:40", "soldier"],
        ["2:41", "soldier"],
        ["2:43", "sister"],
        ["2:16", "cavalry"],
        ["2:42", "sister"],
        ["2:45", "soldier"],
        ["2:46", "soldier"],
      ],
      enemyAi: "stage-01-castle-guard",
    },
    load: loadStage1Module,
  },
  "stage-02": {
    id: "stage-02",
    ordinal: 2,
    label: "攻打騎士堡",
    nextStageId: "stage-03",
    focusUnitId: "1:0",
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
      statusText: "第一軍團繼續向騎士團堡推進。",
      campaignRoute: "stage-02",
    },
    enemyPhaseStatusText: "敵方階段：騎士團開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新建立第 2 關固定編隊。",
      retreatStatusText: "全面撤退：重新建立第 2 關固定編隊。",
    },
    completion: {
      destinationLabel: "救援友軍",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-02-opening-story",
        "stage-02-boss-defeated",
        "stage-02-victory-story",
        "stage-02-completed-route",
      ],
      requiredResumeEventIds: ["stage-02-opening-story"],
      alliedUnits: {
        kind: "exact-slots",
        slots: [0, 2, 24, 40, 41, 42, 43, 44, 45],
      },
      enemyClassById: [
        ["2:47", "cavalry"],
        ["2:18", "cavalry"],
        ["2:46", "cavalry"],
        ["2:51", "soldier"],
        ["2:50", "soldier"],
      ],
      enemyAi: "none",
    },
    load: loadStage2Module,
  },
  "stage-03": {
    id: "stage-03",
    ordinal: 3,
    label: "救援友軍",
    nextStageId: "stage-04",
    focusUnitId: "1:1",
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
      statusText: "希蜜與第四軍團會合，開始救援友軍。",
      campaignRoute: "stage-03",
    },
    enemyPhaseStatusText: "敵方階段：騎士團開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新建立第 3 關固定編隊。",
      retreatStatusText: "全面撤退：重新建立第 3 關固定編隊。",
    },
    completion: {
      destinationLabel: "通過力場",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-03-opening-story",
        "stage-03-boss-defeated",
        "stage-03-victory-story",
        "stage-03-completed-route",
      ],
      requiredResumeEventIds: ["stage-03-opening-story"],
      alliedUnits: {
        kind: "exact-slots",
        slots: [1, 3, 4, 20, 21, 45, 46, 47, 50, 51, 52, 53, 54],
      },
      enemyClassById: [
        ["2:42", "soldier"],
        ["2:41", "soldier"],
        ["2:40", "soldier"],
        ["2:43", "sister"],
        ["2:17", "monk"],
        ["2:44", "soldier"],
        ["2:45", "soldier"],
        ["2:47", "soldier"],
        ["2:46", "soldier"],
        ["2:50", "cavalry"],
        ["2:48", "soldier"],
        ["2:49", "soldier"],
      ],
      enemyAi: "none",
    },
    load: loadStage3Module,
  },
  "stage-04": {
    id: "stage-04",
    ordinal: 4,
    label: "通過力場",
    nextStageId: "stage-05",
    focusUnitId: "1:0",
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
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "第一軍團進入騎士團堡，準備穿過強化力場。",
      campaignRoute: "stage-04",
    },
    enemyPhaseStatusText: "敵方階段：力場守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始第 4 關關前流程。",
      retreatStatusText: "全面撤退：返回第 4 關關前流程並重新編隊。",
    },
    completion: {
      destinationLabel: "遭遇丁塔琪",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-04-prebattle-story",
        "stage-04-enter-deployment",
        "stage-04-opening-story",
        "stage-04-objective-reached",
        "stage-04-victory-story",
        "stage-04-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-04-prebattle-story",
        "stage-04-enter-deployment",
        "stage-04-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 20, 21, 24],
        fixedSlots: [0, 24],
        optionalSlots: [1, 2, 3, 4, 20, 21],
        maximumUnits: 8,
        openCellCount: 6,
      },
      enemyClassById: [
        ["2:40", "soldier"],
        ["2:41", "soldier"],
      ],
      enemyAi: "none",
    },
    load: loadStage4Module,
  },
} as const satisfies Record<StageId, StageRuntimeManifestEntry>;

const loadedRuntimes = new Map<StageId, LoadedStageRuntime>();
const runtimePromises = new Map<StageId, Promise<LoadedStageRuntime>>();

function combineRuntime(
  entry: StageRuntimeManifestEntry,
  runtime: StageRuntimeModule,
): LoadedStageRuntime {
  if (runtime.definition.id !== entry.id) {
    throw new Error(`stage runtime ${entry.id} loaded definition ${runtime.definition.id}`);
  }
  const { load: _load, ...metadata } = entry;
  return { ...metadata, ...runtime };
}

export async function loadStageRuntime(stageId: StageId): Promise<LoadedStageRuntime> {
  const loaded = loadedRuntimes.get(stageId);
  if (loaded) return loaded;
  let pending = runtimePromises.get(stageId);
  if (!pending) {
    const entry = STAGE_RUNTIME_MANIFEST[stageId];
    pending = entry.load().then((runtime) => {
      const combined = combineRuntime(entry, runtime);
      loadedRuntimes.set(stageId, combined);
      return combined;
    });
    runtimePromises.set(stageId, pending);
  }
  return pending;
}

export function loadedStageRuntime(stageId: StageId): LoadedStageRuntime | undefined {
  return loadedRuntimes.get(stageId);
}

export function isPlayableStageId(value: unknown): value is StageId {
  return typeof value === "string" && Object.hasOwn(STAGE_RUNTIME_MANIFEST, value);
}

export function stageRuntimeSourceForDestination(
  destination: unknown,
): StageRuntimeManifestEntry | undefined {
  return Object.values(STAGE_RUNTIME_MANIFEST)
    .find(({ nextStageId }) => nextStageId === destination);
}

export const INITIAL_STAGE_RUNTIME = combineRuntime(
  STAGE_RUNTIME_MANIFEST["stage-00"],
  stage0Module,
);

loadedRuntimes.set("stage-00", INITIAL_STAGE_RUNTIME);
