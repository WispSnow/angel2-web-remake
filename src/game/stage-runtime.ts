import { STAGE0_DEFINITION, type InteractiveDeploymentDefinition, type StageDefinition } from "./content/stages";
import type { CampaignRouteId } from "./content/stage-effects";
import type { EnemyPhaseTailPresentationDefinition } from "./enemy-phase-tail-presentation";
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
  storyBackgrounds?: Readonly<Partial<Record<number, string>>>;
  unitSprites: Readonly<Partial<Record<MapUnitSpriteKey, string>>>;
  routePulsePresentations?: readonly RoutePulsePresentationDefinition[];
  enemyPhaseTailPresentations?: readonly EnemyPhaseTailPresentationDefinition[];
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
  enemyFormSequences?: readonly {
    unitId: string;
    classIdsByDifficulty: readonly (readonly UnitClassId[])[];
    experience: number;
  }[];
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
    phase: Extract<GamePhase, "prebattleStory" | "deployment" | "player" | "scriptedMove">;
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

async function loadStage5Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage5"),
    import("./simulation/stage5-battle"),
  ]);
  content.activateStage5Content();
  const definition = content.STAGE5_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 05",
      title: content.STAGE5.name,
      objective: content.STAGE5_DEFINITION.objective.victoryText,
      minimap: content.STAGE5_ASSETS.minimap,
      terrain: content.STAGE5_TERRAIN_TOKENS,
      gridWidth: content.STAGE5.width,
      gridHeight: content.STAGE5.height,
      enemies: content.STAGE5_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；七名候選最多選五人。擊敗汀塔琪或萊茵任一人即可。",
    },
    ["stage-05-enter-deployment"],
    (campaign) => battleModule.createStage5DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 5 requires a deployment result");
    return new battleModule.Stage5Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE5_DEFINITION,
    assets: {
      map: content.STAGE5_ASSETS.map,
      minimap: content.STAGE5_ASSETS.minimap,
      unitSprites: content.STAGE5_ASSETS.unitSprites,
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

async function loadStage42PortalModule(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage5"),
    import("./simulation/stage42-portal-battle"),
  ]);
  content.activateStage5Content();
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, _preparation, rng) =>
    new battleModule.Stage42PortalBattle(campaign, rng);
  return {
    definition: content.STAGE42_PORTAL_DEFINITION,
    assets: {
      map: content.STAGE42_ASSETS.map,
      minimap: content.STAGE42_ASSETS.minimap,
      unitSprites: content.STAGE42_ASSETS.unitSprites,
    },
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(createBattle, campaign, snapshot),
  };
}

async function loadStage6Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage6"),
    import("./simulation/stage6-battle"),
  ]);
  content.activateStage6Content();
  const definition = content.STAGE6_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 06",
      title: content.STAGE6.name,
      objective: content.STAGE6_DEFINITION.objective.victoryText,
      minimap: content.STAGE6_ASSETS.minimap,
      terrain: content.STAGE6_TERRAIN_TOKENS,
      gridWidth: content.STAGE6.width,
      gridHeight: content.STAGE6.height,
      enemies: content.STAGE6_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；十二名候選最多選八人。擊敗西艾蕾即可。",
    },
    ["stage-06-enter-deployment"],
    (campaign) => battleModule.createStage6DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 6 requires a deployment result");
    return new battleModule.Stage6Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE6_DEFINITION,
    assets: {
      map: content.STAGE6_ASSETS.map,
      minimap: content.STAGE6_ASSETS.minimap,
      storyBackground: content.STAGE6_ASSETS.storyBackgrounds[5],
      storyBackgrounds: content.STAGE6_ASSETS.storyBackgrounds,
      unitSprites: content.STAGE6_ASSETS.unitSprites,
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

async function loadStage7Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage7"),
    import("./simulation/stage7-battle"),
  ]);
  content.activateStage7Content();
  const definition = content.STAGE7_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 07",
      title: content.STAGE7.name,
      objective: content.STAGE7_DEFINITION.objective.victoryText,
      minimap: content.STAGE7_ASSETS.minimap,
      terrain: content.STAGE7_TERRAIN_TOKENS,
      gridWidth: content.STAGE7.width,
      gridHeight: content.STAGE7.height,
      enemies: content.STAGE7_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅與希蜜固定出場；十一名候選最多選五人。擊敗萊莉即可。",
    },
    ["stage-07-prebattle-story", "stage-07-enter-deployment"],
    (campaign) => battleModule.createStage7DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 7 requires a deployment result");
    return new battleModule.Stage7Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE7_DEFINITION,
    assets: {
      map: content.STAGE7_ASSETS.map,
      minimap: content.STAGE7_ASSETS.minimap,
      storyBackground: content.STAGE7_ASSETS.storyBackgrounds[6],
      storyBackgrounds: content.STAGE7_ASSETS.storyBackgrounds,
      unitSprites: content.STAGE7_ASSETS.unitSprites,
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

async function loadStage8Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage8"),
    import("./simulation/stage8-battle"),
  ]);
  content.activateStage8Content();
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, _preparation, rng) =>
    new battleModule.Stage8Battle(campaign, rng);
  return {
    definition: content.STAGE8_DEFINITION,
    assets: {
      map: content.STAGE8_ASSETS.map,
      minimap: content.STAGE8_ASSETS.minimap,
      storyBackground: content.STAGE8_ASSETS.storyBackgrounds[7],
      storyBackgrounds: content.STAGE8_ASSETS.storyBackgrounds,
      unitSprites: content.STAGE8_ASSETS.unitSprites,
    },
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(createBattle, campaign, snapshot),
  };
}

async function loadStage9Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage9"),
    import("./simulation/stage9-battle"),
  ]);
  content.activateStage9Content();
  const definition = content.STAGE9_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 09",
      title: content.STAGE9.name,
      objective: content.STAGE9_DEFINITION.objective.victoryText,
      minimap: content.STAGE9_ASSETS.minimap,
      terrain: content.STAGE9_TERRAIN_TOKENS,
      gridWidth: content.STAGE9.width,
      gridHeight: content.STAGE9.height,
      enemies: content.STAGE9_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "多莉與妮雅固定出場；十二名候選最多選七人。多莉會自行引路，請保護她抵達谷頂，或擊退全部敵軍。",
    },
    ["stage-09-enter-deployment"],
    (campaign) => battleModule.createStage9DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 9 requires a deployment result");
    return new battleModule.Stage9Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE9_DEFINITION,
    assets: {
      map: content.STAGE9_ASSETS.map,
      minimap: content.STAGE9_ASSETS.minimap,
      unitSprites: content.STAGE9_ASSETS.unitSprites,
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

async function loadStage11Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage11"),
    import("./simulation/stage11-battle"),
  ]);
  content.activateStage11Content();
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, _preparation, rng) =>
    new battleModule.Stage11Battle(campaign, rng);
  return {
    definition: content.STAGE11_DEFINITION,
    assets: {
      map: content.STAGE11_ASSETS.map,
      minimap: content.STAGE11_ASSETS.minimap,
      unitSprites: content.STAGE11_ASSETS.unitSprites,
    },
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(createBattle, campaign, snapshot),
  };
}

async function loadStage10Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage10"),
    import("./simulation/stage10-battle"),
  ]);
  content.activateStage10Content();
  const definition = content.STAGE10_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 10",
      title: content.STAGE10.name,
      objective: content.STAGE10_DEFINITION.objective.victoryText,
      minimap: content.STAGE10_ASSETS.minimap,
      terrain: content.STAGE10_TERRAIN_TOKENS,
      gridWidth: content.STAGE10.width,
      gridHeight: content.STAGE10.height,
      enemies: content.STAGE10_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；十九名候選最多選十二人。擊退全部飛船追兵並保護妮雅。",
    },
    ["stage-10-prebattle-story", "stage-10-enter-deployment"],
    (campaign) => battleModule.createStage10DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 10 requires a deployment result");
    return new battleModule.Stage10Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE10_DEFINITION,
    assets: {
      map: content.STAGE10_ASSETS.map,
      minimap: content.STAGE10_ASSETS.minimap,
      storyBackground: content.STAGE10_ASSETS.storyBackgrounds[10],
      storyBackgrounds: content.STAGE10_ASSETS.storyBackgrounds,
      unitSprites: content.STAGE10_ASSETS.unitSprites,
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

async function loadStage12Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage12"),
    import("./simulation/stage12-battle"),
  ]);
  content.activateStage12Content();
  const definition = content.STAGE12_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 12",
      title: content.STAGE12.name,
      objective: content.STAGE12_DEFINITION.objective.victoryText,
      minimap: content.STAGE12_ASSETS.minimap,
      terrain: content.STAGE12_TERRAIN_TOKENS,
      gridWidth: content.STAGE12.width,
      gridHeight: content.STAGE12.height,
      enemies: content.STAGE12_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；十九名候選最多選八人。水戰士受到近戰攻擊後可能分裂。",
    },
    ["stage-12-prebattle-story", "stage-12-enter-deployment"],
    (campaign) => battleModule.createStage12DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 12 requires a deployment result");
    return new battleModule.Stage12Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE12_DEFINITION,
    assets: {
      map: content.STAGE12_ASSETS.map,
      minimap: content.STAGE12_ASSETS.minimap,
      storyBackground: content.STAGE12_ASSETS.storyBackgrounds[10],
      storyBackgrounds: content.STAGE12_ASSETS.storyBackgrounds,
      unitSprites: content.STAGE12_ASSETS.unitSprites,
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

async function loadStage13Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage13"),
    import("./simulation/stage13-battle"),
  ]);
  content.activateStage13Content();
  const definition = content.STAGE13_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 13",
      title: content.STAGE13.name,
      objective: content.STAGE13_DEFINITION.objective.victoryText,
      minimap: content.STAGE13_ASSETS.minimap,
      terrain: content.STAGE13_TERRAIN_TOKENS,
      gridWidth: content.STAGE13.width,
      gridHeight: content.STAGE13.height,
      enemies: content.STAGE13_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十一名候選最多選十一人。擊敗神劍戰士瑪西爾即可獲勝。",
    },
    ["stage-13-prebattle-story", "stage-13-enter-deployment"],
    (campaign) => battleModule.createStage13DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 13 requires a deployment result");
    return new battleModule.Stage13Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE13_DEFINITION,
    assets: {
      map: content.STAGE13_ASSETS.map,
      minimap: content.STAGE13_ASSETS.minimap,
      storyBackground: content.STAGE13_ASSETS.storyBackgrounds[15],
      storyBackgrounds: content.STAGE13_ASSETS.storyBackgrounds,
      unitSprites: content.STAGE13_ASSETS.unitSprites,
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

async function loadStage14Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage14"),
    import("./simulation/stage14-battle"),
  ]);
  content.activateStage14Content();
  const definition = content.STAGE14_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 14",
      title: content.STAGE14.name,
      objective: content.STAGE14_DEFINITION.objective.victoryText,
      minimap: content.STAGE14_ASSETS.minimap,
      terrain: content.STAGE14_TERRAIN_TOKENS,
      gridWidth: content.STAGE14.width,
      gridHeight: content.STAGE14.height,
      enemies: content.STAGE14_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十一名候選最多選九人。擊敗半龍戰士芳即可獲勝。",
    },
    ["stage-14-enter-deployment"],
    (campaign) => battleModule.createStage14DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 14 requires a deployment result");
    return new battleModule.Stage14Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE14_DEFINITION,
    assets: {
      map: content.STAGE14_ASSETS.map,
      minimap: content.STAGE14_ASSETS.minimap,
      unitSprites: content.STAGE14_ASSETS.unitSprites,
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

async function loadStage15Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage15"),
    import("./simulation/stage15-battle"),
  ]);
  content.activateStage15Content();
  const definition = content.STAGE15_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 15",
      title: content.STAGE15.name,
      objective: content.STAGE15_DEFINITION.objective.victoryText,
      minimap: content.STAGE15_ASSETS.minimap,
      terrain: content.STAGE15_TERRAIN_TOKENS,
      gridWidth: content.STAGE15.width,
      gridHeight: content.STAGE15.height,
      enemies: content.STAGE15_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十一名候選最多選九人。擊敗半龍戰士蘭即可獲勝。",
    },
    ["stage-15-enter-deployment"],
    (campaign) => battleModule.createStage15DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 15 requires a deployment result");
    return new battleModule.Stage15Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE15_DEFINITION,
    assets: {
      map: content.STAGE15_ASSETS.map,
      minimap: content.STAGE15_ASSETS.minimap,
      unitSprites: content.STAGE15_ASSETS.unitSprites,
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

async function loadStage16Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage16"),
    import("./simulation/stage16-battle"),
  ]);
  content.activateStage16Content();
  const definition = content.STAGE16_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 16",
      title: content.STAGE16.name,
      objective: content.STAGE16_DEFINITION.objective.victoryText,
      minimap: content.STAGE16_ASSETS.minimap,
      terrain: content.STAGE16_TERRAIN_TOKENS,
      gridWidth: content.STAGE16.width,
      gridHeight: content.STAGE16.height,
      enemies: content.STAGE16_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十一名候選最多選九人。擊敗半龍戰士莎即可獲勝。",
    },
    ["stage-16-enter-deployment"],
    (campaign) => battleModule.createStage16DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 16 requires a deployment result");
    return new battleModule.Stage16Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE16_DEFINITION,
    assets: {
      map: content.STAGE16_ASSETS.map,
      minimap: content.STAGE16_ASSETS.minimap,
      unitSprites: content.STAGE16_ASSETS.unitSprites,
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

async function loadStage17Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage17"),
    import("./simulation/stage17-battle"),
  ]);
  content.activateStage17Content();
  const definition = content.STAGE17_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 17",
      title: content.STAGE17.name,
      objective: content.STAGE17_DEFINITION.objective.victoryText,
      minimap: content.STAGE17_ASSETS.minimap,
      terrain: content.STAGE17_TERRAIN_TOKENS,
      gridWidth: content.STAGE17.width,
      gridHeight: content.STAGE17.height,
      enemies: content.STAGE17_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十一名候選最多選九人。擊敗半龍戰士倩即可獲勝。",
    },
    ["stage-17-enter-deployment"],
    (campaign) => battleModule.createStage17DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 17 requires a deployment result");
    return new battleModule.Stage17Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE17_DEFINITION,
    assets: {
      map: content.STAGE17_ASSETS.map,
      minimap: content.STAGE17_ASSETS.minimap,
      unitSprites: content.STAGE17_ASSETS.unitSprites,
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

async function loadStage18Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage18"),
    import("./simulation/stage18-battle"),
  ]);
  content.activateStage18Content();
  const definition = content.STAGE18_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 18",
      title: content.STAGE18.name,
      objective: content.STAGE18_DEFINITION.objective.victoryText,
      minimap: content.STAGE18_ASSETS.minimap,
      terrain: content.STAGE18_TERRAIN_TOKENS,
      gridWidth: content.STAGE18.width,
      gridHeight: content.STAGE18.height,
      enemies: content.STAGE18_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十一名候選最多選七人。擊敗半龍戰士麗即可獲勝。",
    },
    ["stage-18-enter-deployment"],
    (campaign) => battleModule.createStage18DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 18 requires a deployment result");
    return new battleModule.Stage18Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE18_DEFINITION,
    assets: {
      map: content.STAGE18_ASSETS.map,
      minimap: content.STAGE18_ASSETS.minimap,
      unitSprites: content.STAGE18_ASSETS.unitSprites,
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

async function loadStage19Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage19"),
    import("./simulation/stage19-battle"),
  ]);
  content.activateStage19Content();
  const definition = content.STAGE19_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 19",
      title: content.STAGE19.name,
      objective: content.STAGE19_DEFINITION.objective.victoryText,
      minimap: content.STAGE19_ASSETS.minimap,
      terrain: content.STAGE19_TERRAIN_TOKENS,
      gridWidth: content.STAGE19.width,
      gridHeight: content.STAGE19.height,
      enemies: content.STAGE19_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十一名候選最多選九人。擊敗半龍戰士愛即可獲勝。",
    },
    ["stage-19-enter-deployment"],
    (campaign) => battleModule.createStage19DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 19 requires a deployment result");
    return new battleModule.Stage19Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE19_DEFINITION,
    assets: {
      map: content.STAGE19_ASSETS.map,
      minimap: content.STAGE19_ASSETS.minimap,
      unitSprites: content.STAGE19_ASSETS.unitSprites,
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

async function loadStage20Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage20"),
    import("./simulation/stage20-battle"),
  ]);
  content.activateStage20Content();
  const definition = content.STAGE20_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 20",
      title: content.STAGE20.name,
      objective: content.STAGE20_DEFINITION.objective.victoryText,
      minimap: content.STAGE20_ASSETS.minimap,
      terrain: content.STAGE20_TERRAIN_TOKENS,
      gridWidth: content.STAGE20.width,
      gridHeight: content.STAGE20.height,
      enemies: content.STAGE20_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "守護者、妮雅與葛蒂拉斯固定出場；二十名候選最多選十四人。開戰後守軍將由妖龍取代。",
    },
    ["stage-20-prebattle-story", "stage-20-enter-deployment"],
    (campaign) => battleModule.createStage20DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 20 requires a deployment result");
    return new battleModule.Stage20Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE20_DEFINITION,
    assets: {
      map: content.STAGE20_ASSETS.map,
      minimap: content.STAGE20_ASSETS.minimap,
      storyBackground: content.STAGE20_ASSETS.storyBackground,
      unitSprites: content.STAGE20_ASSETS.unitSprites,
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

async function loadStage21Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage21"),
    import("./simulation/stage21-battle"),
  ]);
  content.activateStage21Content();
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, _preparation, rng) =>
    new battleModule.Stage21Battle(campaign, rng);
  return {
    definition: content.STAGE21_DEFINITION,
    assets: {
      map: content.STAGE21_ASSETS.map,
      minimap: content.STAGE21_ASSETS.minimap,
      storyBackgrounds: content.STAGE21_ASSETS.storyBackgrounds,
      unitSprites: content.STAGE21_ASSETS.unitSprites,
    },
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(createBattle, campaign, snapshot),
  };
}

async function loadStage22Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage22"),
    import("./simulation/stage22-battle"),
  ]);
  content.activateStage22Content();
  const definition = content.STAGE22_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 22",
      title: content.STAGE22.name,
      objective: content.STAGE22_DEFINITION.objective.victoryText,
      minimap: content.STAGE22_ASSETS.minimap,
      terrain: content.STAGE22_TERRAIN_TOKENS,
      gridWidth: content.STAGE22.width,
      gridHeight: content.STAGE22.height,
      // B/0045 has no static side-2 cells; exposing the ambush positions here
      // would leak information the original deployment screen withheld.
      enemies: [],
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十七名候選最多選十八人。村莊內暫時看不見敵軍。",
    },
    ["stage-22-enter-deployment"],
    (campaign) => battleModule.createStage22DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 22 requires a deployment result");
    return new battleModule.Stage22Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE22_DEFINITION,
    assets: {
      map: content.STAGE22_ASSETS.map,
      minimap: content.STAGE22_ASSETS.minimap,
      unitSprites: content.STAGE22_ASSETS.unitSprites,
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

async function loadStage23Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage23"),
    import("./simulation/stage23-battle"),
  ]);
  content.activateStage23Content();
  const definition = content.STAGE23_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 23",
      title: content.STAGE23.name,
      objective: content.STAGE23_DEFINITION.objective.victoryText,
      minimap: content.STAGE23_ASSETS.minimap,
      terrain: content.STAGE23_TERRAIN_TOKENS,
      gridWidth: content.STAGE23.width,
      gridHeight: content.STAGE23.height,
      enemies: content.STAGE23_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十八名候選最多選十四人。讓妮雅抵達死亡之谷頂端即可獲勝，不必全滅守軍。",
    },
    ["stage-23-enter-deployment"],
    (campaign) => battleModule.createStage23DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 23 requires a deployment result");
    return new battleModule.Stage23Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE23_DEFINITION,
    assets: {
      map: content.STAGE23_ASSETS.map,
      minimap: content.STAGE23_ASSETS.minimap,
      unitSprites: content.STAGE23_ASSETS.unitSprites,
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

async function loadStage24Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage24"),
    import("./simulation/stage24-battle"),
  ]);
  content.activateStage24Content();
  const definition = content.STAGE24_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 24",
      title: content.STAGE24.name,
      objective: content.STAGE24_DEFINITION.objective.victoryText,
      minimap: content.STAGE24_ASSETS.minimap,
      terrain: content.STAGE24_TERRAIN_TOKENS,
      gridWidth: content.STAGE24.width,
      gridHeight: content.STAGE24.height,
      enemies: content.STAGE24_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十八名候選最多選十四人。讓妮雅抵達死亡之谷城堡即可獲勝，不必全滅守軍。",
    },
    ["stage-24-enter-deployment"],
    (campaign) => battleModule.createStage24DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 24 requires a deployment result");
    return new battleModule.Stage24Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE24_DEFINITION,
    assets: {
      map: content.STAGE24_ASSETS.map,
      minimap: content.STAGE24_ASSETS.minimap,
      unitSprites: content.STAGE24_ASSETS.unitSprites,
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

async function loadStage26Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage26"),
    import("./simulation/stage26-battle"),
  ]);
  content.activateStage26Content();
  const definition = content.STAGE26_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 25",
      title: content.STAGE26.name,
      objective: content.STAGE26_DEFINITION.objective.victoryText,
      minimap: content.STAGE26_ASSETS.minimap,
      terrain: content.STAGE26_TERRAIN_TOKENS,
      gridWidth: content.STAGE26.width,
      gridHeight: content.STAGE26.height,
      enemies: content.STAGE26_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "希蜜、妮雅、蘇蘭達與琴斯固定出場；二十五名候選最多選十八人。擊敗碧娜維姬即可獲勝。",
    },
    ["stage-26-enter-deployment"],
    (campaign) => battleModule.createStage26DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 26 requires a deployment result");
    return new battleModule.Stage26Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE26_DEFINITION,
    assets: {
      map: content.STAGE26_ASSETS.map,
      minimap: content.STAGE26_ASSETS.minimap,
      unitSprites: content.STAGE26_ASSETS.unitSprites,
      enemyPhaseTailPresentations: content.STAGE26_ASSETS.enemyPhaseTailPresentations,
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

async function loadStage27Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage27"),
    import("./simulation/stage27-battle"),
  ]);
  content.activateStage27Content();
  const definition = content.STAGE27_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 26",
      title: content.STAGE27.name,
      objective: content.STAGE27_DEFINITION.objective.victoryText,
      minimap: content.STAGE27_ASSETS.minimap,
      terrain: content.STAGE27_TERRAIN_TOKENS,
      gridWidth: content.STAGE27.width,
      gridHeight: content.STAGE27.height,
      enemies: content.STAGE27_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "地圖已有妮雅、三名工兵與七名城防友軍；出擊名單僅列妮雅與二十八名候選，工兵和城防友軍不列入名單。最多再選二十人；讓妮雅進入瓦爾克麗城區即可獲勝，不必全滅叛軍。",
    },
    ["stage-27-enter-deployment"],
    (campaign) => battleModule.createStage27DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 27 requires a deployment result");
    return new battleModule.Stage27Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE27_DEFINITION,
    assets: {
      map: content.STAGE27_ASSETS.map,
      minimap: content.STAGE27_ASSETS.minimap,
      unitSprites: content.STAGE27_ASSETS.unitSprites,
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

async function loadStage28Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage28"),
    import("./simulation/stage28-battle"),
  ]);
  content.activateStage28Content();
  const definition = content.STAGE28_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 27",
      title: content.STAGE28.name,
      objective: content.STAGE28_DEFINITION.objective.victoryText,
      minimap: content.STAGE28_ASSETS.minimap,
      terrain: content.STAGE28_TERRAIN_TOKENS,
      gridWidth: content.STAGE28.width,
      gridHeight: content.STAGE28.height,
      enemies: content.STAGE28_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十八名候選最多再選二十八人。擊退全部攻城敵軍並保護妮雅。",
    },
    ["stage-28-prebattle-story", "stage-28-enter-deployment"],
    (campaign) => battleModule.createStage28DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 28 requires a deployment result");
    return new battleModule.Stage28Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE28_DEFINITION,
    assets: {
      map: content.STAGE28_ASSETS.map,
      minimap: content.STAGE28_ASSETS.minimap,
      storyBackground: content.STAGE28_ASSETS.storyBackground,
      unitSprites: content.STAGE28_ASSETS.unitSprites,
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

async function loadStage29Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage29"),
    import("./simulation/stage29-battle"),
  ]);
  content.activateStage29Content();
  const definition = content.STAGE29_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 28",
      title: content.STAGE29.name,
      objective: content.STAGE29_DEFINITION.objective.victoryText,
      minimap: content.STAGE29_ASSETS.minimap,
      terrain: content.STAGE29_TERRAIN_TOKENS,
      gridWidth: content.STAGE29.width,
      gridHeight: content.STAGE29.height,
      enemies: content.STAGE29_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十九名候選最多再選十四人。擊敗全部騎士城堡守軍並保護妮雅。",
    },
    ["stage-29-prebattle-story", "stage-29-enter-deployment"],
    (campaign) => battleModule.createStage29DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 29 requires a deployment result");
    return new battleModule.Stage29Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE29_DEFINITION,
    assets: {
      map: content.STAGE29_ASSETS.map,
      minimap: content.STAGE29_ASSETS.minimap,
      storyBackground: content.STAGE29_ASSETS.storyBackground,
      unitSprites: content.STAGE29_ASSETS.unitSprites,
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

async function loadStage30Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage30"),
    import("./simulation/stage30-battle"),
  ]);
  content.activateStage30Content();
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, _deployment, rng) =>
    new battleModule.Stage30Battle(campaign, rng);
  return {
    definition: content.STAGE30_DEFINITION,
    assets: {
      map: content.STAGE30_ASSETS.map,
      minimap: content.STAGE30_ASSETS.minimap,
      storyBackground: content.STAGE30_ASSETS.storyBackground,
      unitSprites: content.STAGE30_ASSETS.unitSprites,
    },
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(createBattle, campaign, snapshot),
  };
}

async function loadStage31Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage31"),
    import("./simulation/stage31-battle"),
  ]);
  content.activateStage31Content();
  const definition = content.STAGE31_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 30",
      title: content.STAGE31.name,
      objective: content.STAGE31_DEFINITION.objective.victoryText,
      minimap: content.STAGE31_ASSETS.minimap,
      terrain: content.STAGE31_TERRAIN_TOKENS,
      gridWidth: content.STAGE31.width,
      gridHeight: content.STAGE31.height,
      enemies: content.STAGE31_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅、希蜜、蒙欣曼、黛西與拉朵那固定出場；二十四名候選最多再選十二人。擊退斯德林海峽伏兵並保護妮雅。",
    },
    ["stage-31-prebattle-story", "stage-31-enter-deployment"],
    (campaign) => battleModule.createStage31DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 31 requires a deployment result");
    return new battleModule.Stage31Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE31_DEFINITION,
    assets: {
      map: content.STAGE31_ASSETS.map,
      minimap: content.STAGE31_ASSETS.minimap,
      storyBackground: content.STAGE31_ASSETS.storyBackground,
      unitSprites: content.STAGE31_ASSETS.unitSprites,
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

async function loadStage32Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage32"),
    import("./simulation/stage32-battle"),
  ]);
  content.activateStage32Content();
  const definition = content.STAGE32_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 31",
      title: content.STAGE32.name,
      objective: content.STAGE32_DEFINITION.objective.victoryText,
      minimap: content.STAGE32_ASSETS.minimap,
      terrain: content.STAGE32_TERRAIN_TOKENS,
      gridWidth: content.STAGE32.width,
      gridHeight: content.STAGE32.height,
      enemies: content.STAGE32_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十八名候選最多再選十五人。擊敗菲伊魯茵、芙瑪羅妮及全部聯軍並保護妮雅。",
    },
    ["stage-32-enter-deployment"],
    (campaign) => battleModule.createStage32DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 32 requires a deployment result");
    return new battleModule.Stage32Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE32_DEFINITION,
    assets: {
      map: content.STAGE32_ASSETS.map,
      minimap: content.STAGE32_ASSETS.minimap,
      unitSprites: content.STAGE32_ASSETS.unitSprites,
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

async function loadStage33Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage33"),
    import("./simulation/stage33-battle"),
  ]);
  content.activateStage33Content();
  const definition = content.STAGE33_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 32",
      title: content.STAGE33.name,
      objective: content.STAGE33_DEFINITION.objective.victoryText,
      minimap: content.STAGE33_ASSETS.minimap,
      terrain: content.STAGE33_TERRAIN_TOKENS,
      gridWidth: content.STAGE33.width,
      gridHeight: content.STAGE33.height,
      enemies: content.STAGE33_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十八名候選最多再選九人。擊敗拉那洛城外全部守軍並保護妮雅。",
    },
    ["stage-33-enter-deployment"],
    (campaign) => battleModule.createStage33DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 33 requires a deployment result");
    return new battleModule.Stage33Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE33_DEFINITION,
    assets: {
      map: content.STAGE33_ASSETS.map,
      minimap: content.STAGE33_ASSETS.minimap,
      unitSprites: content.STAGE33_ASSETS.unitSprites,
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

async function loadStage34Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage34"),
    import("./simulation/stage34-battle"),
  ]);
  content.activateStage34Content();
  const definition = content.STAGE34_DEFINITION.deployment;
  const preparation = createDeploymentPreparation(
    definition,
    {
      kicker: "STAGE 33",
      title: content.STAGE34.name,
      objective: content.STAGE34_DEFINITION.objective.victoryText,
      minimap: content.STAGE34_ASSETS.minimap,
      terrain: content.STAGE34_TERRAIN_TOKENS,
      gridWidth: content.STAGE34.width,
      gridHeight: content.STAGE34.height,
      enemies: content.STAGE34_SEMANTIC_ENEMY_UNITS.map(({ position }) => position),
      pageLabels: ["Ⅰ", "Ⅱ", "Ⅲ"],
      finishLabel: "結束",
      minimumUnits: definition.fixedPlacements.length,
      guidanceText: "妮雅固定出場；二十八名候選最多再選十人。擊敗蕾娜吉芙及拉那洛城內全部敵軍並保護妮雅。",
    },
    ["stage-34-enter-deployment"],
    (campaign) => battleModule.createStage34DeploymentRoster(campaign),
  );
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, deployment, rng) => {
    if (!deployment) throw new Error("stage 34 requires a deployment result");
    return new battleModule.Stage34Battle(campaign, deployment, rng);
  };
  return {
    definition: content.STAGE34_DEFINITION,
    assets: {
      map: content.STAGE34_ASSETS.map,
      minimap: content.STAGE34_ASSETS.minimap,
      unitSprites: content.STAGE34_ASSETS.unitSprites,
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

async function loadStage35Module(): Promise<StageRuntimeModule> {
  const [content, battleModule] = await Promise.all([
    import("./content/stage35"),
    import("./simulation/stage35-battle"),
  ]);
  content.activateStage35Content();
  const createBattle: StageRuntimeModule["createBattle"] = (campaign, _deployment, rng) =>
    new battleModule.Stage35Battle(campaign, rng);
  return {
    definition: content.STAGE35_DEFINITION,
    assets: {
      map: content.STAGE35_ASSETS.map,
      minimap: content.STAGE35_ASSETS.minimap,
      unitSprites: content.STAGE35_ASSETS.unitSprites,
    },
    createBattle,
    restoreBattle: (campaign, snapshot) => restoreBattle(createBattle, campaign, snapshot),
  };
}

const RELEASED_MAP_ACTION_IDS = [
  "archer-shot",
  "fire-1", "fire-2", "fire-3", "fire-4",
  "heal-1", "heal-2", "heal-3",
  "lightning-1", "lightning-2", "lightning-3", "lightning-4",
  "ice-1", "ice-2", "ice-3", "ice-4",
  "recovery-1", "recovery-2", "recovery-3",
  "attack-up", "defense-up", "magic-guard", "poison", "confusion",
  "attack-down", "defense-down", "spell-seal", "prayer", "dispel",
  "stomp-1", "stomp-2", "stomp-3", "iron-plate", "obstacle",
] as const satisfies readonly BattleActionId[];

const STAGE20_MAP_ACTION_IDS = [
  ...RELEASED_MAP_ACTION_IDS,
  "wd",
] as const satisfies readonly BattleActionId[];

function createStage0SaveEnemyClasses(): readonly (readonly [string, UnitClassId])[] {
  return createStage0Units()
    .filter(({ side }) => side === 2)
    .map(({ id, classId }) => [id, classId] as const);
}

function createStage11SaveEnemyClasses(): readonly (readonly [string, UnitClassId])[] {
  const exceptionalClasses = new Map<number, UnitClassId>([
    [40, "cavalry"],
    [41, "pegasus-warrior"],
    [42, "cavalry"],
    [43, "pegasus-warrior"],
    [44, "cavalry"],
    [45, "half-dragon-warrior"],
  ]);
  return [
    ["2:21", "pegasus-warrior"],
    ...Array.from({ length: 40 }, (_, index) => {
      const slot = 40 + index;
      return [`2:${slot}`, exceptionalClasses.get(slot) ?? "soldier"] as const;
    }),
  ];
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
  "stage-05": {
    id: "stage-05",
    ordinal: 5,
    label: "遭遇丁塔琪",
    nextStageId: "stage-42-portal",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "第一軍團進入騎士團堡內殿。",
      campaignRoute: "stage-05",
    },
    enemyPhaseStatusText: "敵方階段：騎士團精銳開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始第 5 關部署。",
      retreatStatusText: "全面撤退：返回第 5 關部署並重新編隊。",
    },
    completion: {
      destinationLabel: "異世界之門",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-05-enter-deployment",
        "stage-05-opening-story",
        "stage-05-objective-reached",
        "stage-05-victory-story",
        "stage-05-completed-route",
      ],
      requiredResumeEventIds: ["stage-05-enter-deployment", "stage-05-opening-story"],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 20, 21, 24],
        maximumUnits: 6,
        openCellCount: 5,
      },
      enemyClassById: [
        ["2:44", "archer"], ["2:40", "archer"],
        ["2:25", "soldier"], ["2:26", "soldier"],
        ["2:51", "warrior"], ["2:50", "cavalry"],
        ["2:45", "soldier"], ["2:41", "soldier"],
        ["2:46", "soldier"], ["2:42", "soldier"],
        ["2:47", "soldier"], ["2:43", "soldier"],
        ["2:49", "soldier"], ["2:48", "soldier"],
      ],
      enemyAi: "none",
    },
    load: loadStage5Module,
  },
  "stage-42-portal": {
    id: "stage-42-portal",
    ordinal: 5,
    label: "異世界之門",
    nextStageId: "stage-06",
    focusUnitId: "1:0",
    mapPresentationActionIds: ["lightning-4"],
    entry: {
      trigger: "campaign-entered",
      phase: "scriptedMove",
      statusText: "汀塔琪與萊茵帶領眾人進入琴斯的寢室。",
      campaignRoute: "stage-42-portal",
    },
    enemyPhaseStatusText: "傳送門過場不建立敵方階段。",
    retry: {
      mode: "entry",
      statusText: "重新建立傳送門過場。",
      retreatStatusText: "傳送門過場不可撤退。",
    },
    completion: {
      destinationLabel: "過異世界之門",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-42-nia-move",
        "stage-42-arrival-story",
        "stage-42-confrontation-story",
        "stage-42-gadirath-move",
        "stage-42-intervention-story",
        "stage-42-lightning",
        "stage-42-departures",
        "stage-42-departure-story",
        "stage-42-completed-route",
      ],
      alliedUnits: {
        kind: "exact-slots",
        slots: [0, 1, 2, 3, 4, 5, 6, 7, 23, 24],
      },
      enemyClassById: [],
      enemyAi: "none",
    },
    load: loadStage42PortalModule,
  },
  "stage-06": {
    id: "stage-06",
    ordinal: 6,
    label: "過異世界之門",
    nextStageId: "stage-07",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅率領第一軍團抵達異世界。",
      campaignRoute: "stage-06",
    },
    enemyPhaseStatusText: "敵方階段：西艾蕾追擊隊開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始第 6 關部署。",
      retreatStatusText: "全面撤退：返回第 6 關部署並重新編隊。",
    },
    completion: {
      destinationLabel: "來到異世界",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-06-enter-deployment",
        "stage-06-prebattle-story",
        "stage-06-opening-story",
        "stage-06-objective-reached",
        "stage-06-retreat-story",
        "stage-06-reinforcements",
        "stage-06-ranger-leader-move",
        "stage-06-alliance-story",
        "stage-06-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-06-enter-deployment",
        "stage-06-prebattle-story",
        "stage-06-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
        maximumUnits: 9,
        openCellCount: 8,
      },
      enemyClassById: [
        ["2:46", "soldier"], ["2:47", "soldier"], ["2:43", "soldier"],
        ["2:41", "archer"], ["2:40", "archer"], ["2:42", "cavalry"],
        ["2:44", "soldier"], ["2:45", "soldier"], ["2:19", "land-knight"],
      ],
      enemyAi: "none",
    },
    load: loadStage6Module,
  },
  "stage-07": {
    id: "stage-07",
    ordinal: 7,
    label: "來到異世界",
    nextStageId: "stage-08",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "妮雅一行在游騎兵營地暫時落腳。",
      campaignRoute: "stage-07",
    },
    enemyPhaseStatusText: "敵方階段：死亡之谷奇襲隊開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新開始第 7 關關前流程。",
      retreatStatusText: "全面撤退：返回第 7 關關前流程並重新編隊。",
    },
    completion: {
      destinationLabel: "營地遭到偷襲",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-07-prebattle-story",
        "stage-07-enter-deployment",
        "stage-07-objective-reached",
        "stage-07-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-07-prebattle-story",
        "stage-07-enter-deployment",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
        fixedSlots: [0, 1],
        optionalSlots: [2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
        maximumUnits: 7,
        openCellCount: 5,
      },
      enemyClassById: [
        ["2:44", "magician"], ["2:45", "priest"], ["2:40", "magician"],
        ["2:53", "soldier"], ["2:18", "land-knight"], ["2:52", "soldier"],
        ["2:42", "magician"], ["2:50", "priest"], ["2:41", "soldier"],
        ["2:49", "soldier"], ["2:47", "soldier"],
      ],
      enemyAi: "none",
    },
    load: loadStage7Module,
  },
  "stage-08": {
    id: "stage-08",
    ordinal: 8,
    label: "營地遭到偷襲",
    nextStageId: "stage-09",
    focusUnitId: "1:8",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "蘇蘭達與游騎兵準備牽制龍塔襲擊隊。",
      campaignRoute: "stage-08",
    },
    enemyPhaseStatusText: "敵方階段：龍塔營地襲擊隊開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新開始第 8 關關前流程。",
      retreatStatusText: "全面撤退：返回第 8 關關前流程並重新建立固定編隊。",
    },
    completion: {
      destinationLabel: "找尋傳說中的飛船",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-08-prebattle-story",
        "stage-08-opening-story",
        "stage-08-objective-reached",
        "stage-08-victory-story",
        "stage-08-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-08-prebattle-story",
        "stage-08-opening-story",
      ],
      alliedUnits: {
        kind: "exact-slots",
        slots: [8, 17, 18, 40, 41, 42, 43, 44],
      },
      enemyClassById: [
        ["2:45", "cavalry"], ["2:46", "cavalry"], ["2:36", "cavalry"],
        ["2:30", "magician"], ["2:40", "soldier"], ["2:41", "soldier"],
        ["2:35", "soldier"], ["2:38", "cavalry"], ["2:44", "cavalry"],
        ["2:42", "soldier"], ["2:39", "cavalry"],
      ],
      enemyAi: "none",
    },
    load: loadStage8Module,
  },
  "stage-09": {
    id: "stage-09",
    ordinal: 9,
    label: "找尋傳說中的飛船",
    nextStageId: "stage-11",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅護送多莉穿越死亡之谷，尋找傳說中的飛船。",
      campaignRoute: "stage-09",
    },
    enemyPhaseStatusText: "敵方階段：西艾蕾死亡之谷封鎖隊開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始第 9 關部署。",
      retreatStatusText: "全面撤退：返回第 9 關部署並重新編隊。",
    },
    completion: {
      destinationLabel: "拯救蘇蘭達",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-09-enter-deployment",
        "stage-09-opening-story",
        "stage-09-objective-reached",
        "stage-09-victory-story",
        "stage-09-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-09-enter-deployment",
        "stage-09-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 9, 12, 13, 14, 20, 21, 24],
        fixedSlots: [9, 0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 12, 13, 14, 20, 21, 24],
        maximumUnits: 9,
        openCellCount: 7,
      },
      enemyClassById: [
        ["2:48", "soldier"], ["2:49", "soldier"], ["2:44", "steel-armor-warrior"],
        ["2:50", "monk"], ["2:52", "cavalry"], ["2:19", "land-knight"],
        ["2:51", "soldier"], ["2:42", "soldier"], ["2:40", "sister"],
        ["2:41", "soldier"], ["2:46", "land-knight"], ["2:43", "sister"],
        ["2:45", "soldier"], ["2:47", "soldier"],
      ],
      enemyAi: "none",
    },
    load: loadStage9Module,
  },
  "stage-11": {
    id: "stage-11",
    ordinal: 10,
    label: "拯救蘇蘭達",
    nextStageId: "stage-10",
    focusUnitId: "1:8",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "battle-started",
      phase: "player",
      statusText: "蘇蘭達帶領游騎兵向飛船登船區撤離。",
      campaignRoute: "stage-11",
    },
    enemyPhaseStatusText: "敵方階段：追擊增援隊開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新建立拯救蘇蘭達固定編隊。",
      retreatStatusText: "全面撤退：重新建立拯救蘇蘭達固定編隊。",
    },
    completion: {
      destinationLabel: "飛船上遭遇敵人",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-11-opening-story",
        "stage-11-dori-departure",
        "stage-11-objective-reached",
        "stage-11-victory-story",
        "stage-11-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-11-opening-story",
        "stage-11-dori-departure",
      ],
      alliedUnits: {
        kind: "exact-slots",
        slots: [8, 16, 17, 18, 19, 40, 41, 42],
      },
      enemyClassById: createStage11SaveEnemyClasses(),
      enemyAi: "none",
    },
    load: loadStage11Module,
  },
  "stage-10": {
    id: "stage-10",
    ordinal: 11,
    label: "飛船上遭遇敵人",
    nextStageId: "stage-12",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "追兵已追上飛船，妮雅一行準備迎戰。",
      campaignRoute: "stage-10",
    },
    enemyPhaseStatusText: "敵方階段：克諾絲飛船追擊隊開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新開始飛船甲板關前流程。",
      retreatStatusText: "全面撤退：返回飛船甲板關前流程並重新編隊。",
    },
    completion: {
      destinationLabel: "落入沼澤",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-10-prebattle-story",
        "stage-10-enter-deployment",
        "stage-10-objective-reached",
        "stage-10-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-10-prebattle-story",
        "stage-10-enter-deployment",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        maximumUnits: 13,
        openCellCount: 12,
      },
      enemyClassById: [
        ["2:43", "pegasus-warrior"],
        ["2:42", "half-dragon-warrior"],
        ["2:20", "half-dragon-warrior"],
        ["2:40", "pegasus-warrior"],
        ["2:41", "pegasus-warrior"],
      ],
      enemyAi: "none",
    },
    load: loadStage10Module,
  },
  "stage-12": {
    id: "stage-12",
    ordinal: 12,
    label: "落入沼澤",
    nextStageId: "stage-13",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "飛船遭到撞擊，妮雅一行即將墜入沼澤。",
      campaignRoute: "stage-12",
    },
    enemyPhaseStatusText: "敵方階段：沼澤水戰士開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新開始沼澤關前流程。",
      retreatStatusText: "全面撤退：返回沼澤關前流程並重新編隊。",
    },
    completion: {
      destinationLabel: "龍塔外",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-12-prebattle-story",
        "stage-12-enter-deployment",
        "stage-12-opening-story",
        "stage-12-objective-reached",
        "stage-12-victory-story",
        "stage-12-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-12-prebattle-story",
        "stage-12-enter-deployment",
        "stage-12-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        maximumUnits: 9,
        openCellCount: 8,
      },
      enemyClassById: [
        ["2:40", "water-warrior"],
        ["2:41", "water-warrior"],
        ["2:42", "water-warrior"],
        ["2:44", "water-warrior"],
        ["2:43", "water-warrior"],
      ],
      enemyAi: "none",
    },
    load: loadStage12Module,
  },
  "stage-13": {
    id: "stage-13",
    ordinal: 13,
    label: "龍塔外",
    nextStageId: "stage-14",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "妮雅一行離開沼澤，準備以精銳小隊突襲龍塔。",
      campaignRoute: "stage-13",
    },
    enemyPhaseStatusText: "敵方階段：瑪西爾龍塔守軍開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新開始龍塔外關前流程。",
      retreatStatusText: "全面撤退：返回龍塔外關前流程並重新編隊。",
    },
    completion: {
      destinationLabel: "龍塔第一層",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-13-prebattle-story",
        "stage-13-enter-deployment",
        "stage-13-objective-reached",
        "stage-13-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-13-prebattle-story",
        "stage-13-enter-deployment",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        maximumUnits: 12,
        openCellCount: 11,
      },
      enemyClassById: [
        ["2:24", "divine-sword-warrior"],
        ["2:43", "pegasus-warrior"],
        ["2:46", "land-knight"],
        ["2:47", "magician"],
        ["2:41", "magic-guide"],
        ["2:42", "steel-armor-warrior"],
        ["2:45", "cavalry"],
        ["2:48", "archer"],
        ["2:49", "monk"],
      ],
      enemyAi: "none",
    },
    load: loadStage13Module,
  },
  "stage-14": {
    id: "stage-14",
    ordinal: 14,
    label: "龍塔第一層",
    nextStageId: "stage-15",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅攻略隊進入龍塔第一層。",
      campaignRoute: "stage-14",
    },
    enemyPhaseStatusText: "敵方階段：芳的龍塔第一層守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始龍塔第一層部署。",
      retreatStatusText: "全面撤退：返回龍塔第一層部署並重新編隊。",
    },
    completion: {
      destinationLabel: "龍塔第二層",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-14-enter-deployment",
        "stage-14-opening-story",
        "stage-14-objective-reached",
        "stage-14-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-14-enter-deployment",
        "stage-14-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        maximumUnits: 10,
        openCellCount: 9,
      },
      enemyClassById: [
        ["2:41", "magic-guide"],
        ["2:8", "half-dragon-warrior"],
        ["2:49", "divine-sword-warrior"],
        ["2:47", "magic-guide"],
        ["2:48", "land-knight"],
        ["2:42", "divine-sword-warrior"],
        ["2:46", "pegasus-warrior"],
      ],
      enemyAi: "none",
    },
    load: loadStage14Module,
  },
  "stage-15": {
    id: "stage-15",
    ordinal: 15,
    label: "龍塔第二層",
    nextStageId: "stage-16",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅攻略隊進入龍塔第二層。",
      campaignRoute: "stage-15",
    },
    enemyPhaseStatusText: "敵方階段：蘭的龍塔第二層守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始龍塔第二層部署。",
      retreatStatusText: "全面撤退：返回龍塔第二層部署並重新編隊。",
    },
    completion: {
      destinationLabel: "龍塔第三層",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-15-enter-deployment",
        "stage-15-opening-story",
        "stage-15-objective-reached",
        "stage-15-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-15-enter-deployment",
        "stage-15-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        maximumUnits: 10,
        openCellCount: 9,
      },
      enemyClassById: [
        ["2:52", "great-axe-warrior"],
        ["2:51", "great-axe-warrior"],
        ["2:40", "pegasus-warrior"],
        ["2:47", "magician"],
        ["2:9", "half-dragon-warrior"],
        ["2:41", "pegasus-warrior"],
        ["2:48", "archer"],
        ["2:44", "steel-armor-warrior"],
        ["2:45", "steel-armor-warrior"],
        ["2:49", "archer"],
      ],
      enemyAi: "none",
    },
    load: loadStage15Module,
  },
  "stage-16": {
    id: "stage-16",
    ordinal: 16,
    label: "龍塔第三層",
    nextStageId: "stage-17",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅攻略隊進入龍塔第三層。",
      campaignRoute: "stage-16",
    },
    enemyPhaseStatusText: "敵方階段：莎的龍塔第三層守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始龍塔第三層部署。",
      retreatStatusText: "全面撤退：返回龍塔第三層部署並重新編隊。",
    },
    completion: {
      destinationLabel: "龍塔第四層",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-16-enter-deployment",
        "stage-16-opening-story",
        "stage-16-objective-reached",
        "stage-16-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-16-enter-deployment",
        "stage-16-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        maximumUnits: 10,
        openCellCount: 9,
      },
      enemyClassById: [
        ["2:37", "steel-armor-warrior"],
        ["2:50", "archer"],
        ["2:10", "half-dragon-warrior"],
        ["2:49", "archer"],
        ["2:35", "steel-armor-warrior"],
        ["2:38", "steel-armor-warrior"],
        ["2:51", "magician"],
        ["2:36", "steel-armor-warrior"],
        ["2:34", "steel-armor-warrior"],
        ["2:43", "divine-sword-warrior"],
        ["2:42", "divine-sword-warrior"],
        ["2:41", "divine-sword-warrior"],
        ["2:40", "divine-sword-warrior"],
      ],
      enemyAi: "none",
    },
    load: loadStage16Module,
  },
  "stage-17": {
    id: "stage-17",
    ordinal: 17,
    label: "龍塔第四層",
    nextStageId: "stage-18",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅攻略隊進入龍塔第四層。",
      campaignRoute: "stage-17",
    },
    enemyPhaseStatusText: "敵方階段：倩的龍塔第四層守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始龍塔第四層部署。",
      retreatStatusText: "全面撤退：返回龍塔第四層部署並重新編隊。",
    },
    completion: {
      destinationLabel: "龍塔第五層",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-17-enter-deployment",
        "stage-17-opening-story",
        "stage-17-objective-reached",
        "stage-17-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-17-enter-deployment",
        "stage-17-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        maximumUnits: 10,
        openCellCount: 9,
      },
      enemyClassById: [
        ["2:11", "half-dragon-warrior"],
        ["2:43", "magician"],
        ["2:39", "monk"],
        ["2:42", "divine-sword-warrior"],
        ["2:41", "great-axe-warrior"],
        ["2:40", "great-axe-warrior"],
        ["2:35", "divine-sword-warrior"],
        ["2:44", "priest"],
        ["2:51", "steel-armor-warrior"],
        ["2:52", "steel-armor-warrior"],
        ["2:54", "steel-armor-warrior"],
        ["2:53", "steel-armor-warrior"],
      ],
      enemyAi: "none",
    },
    load: loadStage17Module,
  },
  "stage-18": {
    id: "stage-18",
    ordinal: 18,
    label: "龍塔第五層",
    nextStageId: "stage-19",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅攻略隊進入龍塔第五層。",
      campaignRoute: "stage-18",
    },
    enemyPhaseStatusText: "敵方階段：麗的龍塔第五層守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始龍塔第五層部署。",
      retreatStatusText: "全面撤退：返回龍塔第五層部署並重新編隊。",
    },
    completion: {
      destinationLabel: "龍塔第六層",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-18-enter-deployment",
        "stage-18-opening-story",
        "stage-18-objective-reached",
        "stage-18-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-18-enter-deployment",
        "stage-18-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        maximumUnits: 8,
        openCellCount: 7,
      },
      enemyClassById: [
        ["2:39", "monk"],
        ["2:12", "half-dragon-warrior"],
        ["2:30", "archer"],
        ["2:31", "magic-archer"],
        ["2:32", "archer"],
        ["2:35", "archer"],
        ["2:36", "crossbow"],
        ["2:37", "archer"],
        ["2:34", "steel-armor-warrior"],
        ["2:33", "steel-armor-warrior"],
        ["2:46", "divine-sword-warrior"],
        ["2:47", "divine-sword-warrior"],
        ["2:48", "divine-sword-warrior"],
        ["2:51", "divine-sword-warrior"],
        ["2:52", "divine-sword-warrior"],
        ["2:53", "divine-sword-warrior"],
      ],
      enemyAi: "none",
    },
    load: loadStage18Module,
  },
  "stage-19": {
    id: "stage-19",
    ordinal: 19,
    label: "龍塔第六層",
    nextStageId: "stage-20",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅攻略隊進入龍塔第六層。",
      campaignRoute: "stage-19",
    },
    enemyPhaseStatusText: "敵方階段：愛的龍塔第六層守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始龍塔第六層部署。",
      retreatStatusText: "全面撤退：返回龍塔第六層部署並重新編隊。",
    },
    completion: {
      destinationLabel: "龍塔頂部",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-19-enter-deployment",
        "stage-19-opening-story",
        "stage-19-objective-reached",
        "stage-19-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-19-enter-deployment",
        "stage-19-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24],
        maximumUnits: 10,
        openCellCount: 9,
      },
      enemyClassById: [
        ["2:31", "warrior"],
        ["2:13", "half-dragon-warrior"],
        ["2:30", "warrior"],
        ["2:52", "divine-sword-warrior"],
        ["2:46", "steel-armor-warrior"],
        ["2:38", "priest"],
        ["2:36", "monk"],
        ["2:40", "steel-armor-warrior"],
        ["2:47", "divine-sword-warrior"],
        ["2:51", "divine-sword-warrior"],
        ["2:45", "steel-armor-warrior"],
        ["2:35", "magician"],
        ["2:41", "steel-armor-warrior"],
        ["2:48", "divine-sword-warrior"],
        ["2:55", "great-axe-warrior"],
        ["2:50", "great-axe-warrior"],
        ["2:44", "steel-armor-warrior"],
        ["2:43", "steel-armor-warrior"],
        ["2:42", "steel-armor-warrior"],
        ["2:49", "great-axe-warrior"],
        ["2:54", "great-axe-warrior"],
      ],
      enemyAi: "none",
    },
    load: loadStage19Module,
  },
  "stage-20": {
    id: "stage-20",
    ordinal: 20,
    label: "龍塔頂部",
    nextStageId: "stage-21",
    focusUnitId: "1:0",
    mapPresentationActionIds: STAGE20_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "妮雅攻略隊抵達龍塔頂部。",
      campaignRoute: "stage-20",
    },
    enemyPhaseStatusText: "敵方階段：妖龍開始行動。",
    retry: {
      mode: "skip-entry-story",
      statusText: "重新開始龍塔頂部部署。",
      retreatStatusText: "全面撤退：返回龍塔頂部部署並重新編隊。",
    },
    completion: {
      destinationLabel: "焦土森林村莊外",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-20-prebattle-story",
        "stage-20-enter-deployment",
        "stage-20-contact-story",
        "stage-20-guardian-move",
        "stage-20-guardian-story",
        "stage-20-tableau-departure",
        "stage-20-dragon-arrival",
        "stage-20-opening-story",
        "stage-20-objective-reached",
        "stage-20-kins-arrival",
        "stage-20-kins-move",
        "stage-20-victory-1-story",
        "stage-20-victory-2-story",
        "stage-20-victory-3-story",
        "stage-20-victory-story",
        "stage-20-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-20-prebattle-story",
        "stage-20-enter-deployment",
        "stage-20-contact-story",
        "stage-20-guardian-move",
        "stage-20-guardian-story",
        "stage-20-tableau-departure",
        "stage-20-dragon-arrival",
        "stage-20-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24, 32],
        fixedSlots: [32, 0, 24],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
        maximumUnits: 17,
        openCellCount: 14,
      },
      enemyClassById: [["2:28", "dragon"]],
      enemyAi: "none",
    },
    load: loadStage20Module,
  },
  "stage-21": {
    id: "stage-21",
    ordinal: 21,
    label: "焦土森林村莊外",
    nextStageId: "stage-22",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "守護者準備將妮雅攻略隊傳送到琴斯所在之處。",
      campaignRoute: "stage-21",
    },
    enemyPhaseStatusText: "偵察過場中沒有敵方階段。",
    retry: {
      mode: "entry",
      statusText: "重新開始焦土森林偵察過場。",
      retreatStatusText: "焦土森林偵察過場不可撤退。",
    },
    completion: {
      destinationLabel: "焦土森林村莊中",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-21-prebattle-story",
        "stage-21-scouts-arrive",
        "stage-21-scouting-story",
        "stage-21-nia-move",
        "stage-21-himi-move",
        "stage-21-gadirath-move",
        "stage-21-sulanda-move",
        "stage-21-discovery-story",
        "stage-21-completed-route",
      ],
      alliedUnits: { kind: "exact-slots", slots: [0, 1, 24, 8] },
      enemyClassById: [],
      enemyAi: "none",
    },
    load: loadStage21Module,
  },
  "stage-22": {
    id: "stage-22",
    ordinal: 22,
    label: "焦土森林村莊中",
    nextStageId: "stage-23",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅一行進入焦土森林村莊。",
      campaignRoute: "stage-22",
    },
    enemyPhaseStatusText: "敵方階段：妖龍與魔祭師開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始焦土森林村莊部署。",
      retreatStatusText: "全面撤退：返回焦土森林村莊部署並重新編隊。",
    },
    completion: {
      destinationLabel: "死亡之谷中",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-22-enter-deployment",
        "stage-22-empress-arrival",
        "stage-22-empress-move",
        "stage-22-kins-arrival",
        "stage-22-kins-move",
        "stage-22-search-story",
        "stage-22-focus-nia",
        "stage-22-reunion-story",
        "stage-22-gadirath-arrival",
        "stage-22-betrayal-story",
        "stage-22-dragon-arrival",
        "stage-22-dragon-story",
        "stage-22-story-departures",
        "stage-22-ambush-arrivals",
        "stage-22-player-ready",
        "stage-22-objective-reached",
        "stage-22-postbattle-story",
        "stage-22-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-22-enter-deployment",
        "stage-22-empress-arrival",
        "stage-22-empress-move",
        "stage-22-kins-arrival",
        "stage-22-kins-move",
        "stage-22-search-story",
        "stage-22-focus-nia",
        "stage-22-reunion-story",
        "stage-22-gadirath-arrival",
        "stage-22-betrayal-story",
        "stage-22-dragon-arrival",
        "stage-22-dragon-story",
        "stage-22-story-departures",
        "stage-22-ambush-arrivals",
        "stage-22-player-ready",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 19,
        openCellCount: 18,
      },
      enemyClassById: [
        ["2:2", "magic-priest"],
        ["2:28", "dragon"],
        ["2:40", "magic-priest"],
        ["2:41", "magic-priest"],
        ["2:42", "magic-priest"],
        ["2:43", "magic-priest"],
      ],
      enemyAi: "none",
    },
    load: loadStage22Module,
  },
  "stage-23": {
    id: "stage-23",
    ordinal: 23,
    label: "死亡之谷中",
    nextStageId: "stage-24",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "deployment",
      statusText: "整頓完畢；編成突破死亡之谷的部隊。",
      campaignRoute: "stage-23",
    },
    enemyPhaseStatusText: "敵方階段：死亡之谷守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始死亡之谷部署。",
      retreatStatusText: "全面撤退：返回死亡之谷部署並重新編隊。",
    },
    completion: {
      destinationLabel: "死亡之谷城堡前",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-23-enter-deployment",
        "stage-23-opening-story",
        "stage-23-objective-reached",
        "stage-23-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-23-enter-deployment",
        "stage-23-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 15,
        openCellCount: 14,
      },
      enemyClassById: [
        ["2:30", "half-dragon-warrior"],
        ["2:31", "divine-sword-warrior"],
        ["2:32", "divine-sword-warrior"],
        ["2:33", "magic-archer"],
        ["2:34", "magic-archer"],
        ["2:35", "flying-dragon-knight"],
        ["2:36", "flying-dragon-knight"],
        ["2:37", "flying-dragon-knight"],
        ["2:38", "crossbow"],
        ["2:39", "crossbow"],
        ["2:40", "crossbow"],
        ["2:41", "crossbow"],
        ["2:42", "crossbow"],
        ["2:43", "crossbow"],
        ["2:44", "crossbow"],
        ["2:45", "half-dragon-warrior"],
        ["2:46", "half-dragon-warrior"],
        ["2:47", "steel-armor-warrior"],
        ["2:48", "steel-armor-warrior"],
        ["2:53", "swift-dragon-knight"],
        ["2:54", "swift-dragon-knight"],
      ],
      enemyAi: "none",
    },
    load: loadStage23Module,
  },
  "stage-24": {
    id: "stage-24",
    ordinal: 24,
    label: "死亡之谷城堡前",
    nextStageId: "stage-26",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "deployment",
      statusText: "死亡之谷已突破；編成攻向城堡的部隊。",
      campaignRoute: "stage-24",
    },
    enemyPhaseStatusText: "敵方階段：城堡守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始死亡之谷城堡前部署。",
      retreatStatusText: "全面撤退：返回城堡前部署並重新編隊。",
    },
    completion: {
      destinationLabel: "遭遇碧娜維姬",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-24-enter-deployment",
        "stage-24-opening-story",
        "stage-24-objective-reached",
        "stage-24-victory-story",
        "stage-24-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-24-enter-deployment",
        "stage-24-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 15,
        openCellCount: 14,
      },
      enemyClassById: [
        ["2:31", "bone-knight"],
        ["2:33", "demon-dragon-knight"],
        ["2:34", "demon-dragon-knight"],
        ["2:35", "demon-dragon-knight"],
        ["2:36", "half-dragon-warrior"],
        ["2:37", "half-dragon-warrior"],
        ["2:38", "half-dragon-warrior"],
        ["2:39", "jungle-warrior"],
        ["2:40", "crossbow"],
        ["2:41", "crossbow"],
        ["2:42", "crossbow"],
        ["2:43", "crossbow"],
        ["2:44", "crossbow"],
        ["2:48", "steel-armor-warrior"],
        ["2:49", "steel-armor-warrior"],
        ["2:50", "steel-armor-warrior"],
        ["2:51", "crossbow"],
        ["2:52", "crossbow"],
        ["2:53", "crossbow"],
        ["2:54", "crossbow"],
        ["2:55", "crossbow"],
        ["2:56", "crossbow"],
      ],
      enemyAi: "none",
    },
    load: loadStage24Module,
  },
  "stage-26": {
    id: "stage-26",
    ordinal: 25,
    label: "遭遇碧娜維姬",
    nextStageId: "stage-27",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "deployment",
      statusText: "死亡之谷城堡已突破；編成討伐碧娜維姬的部隊。",
      campaignRoute: "stage-26",
    },
    enemyPhaseStatusText: "敵方階段：碧娜維姬的守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始碧娜維姬戰部署。",
      retreatStatusText: "全面撤退：返回碧娜維姬戰部署並重新編隊。",
    },
    completion: {
      destinationLabel: "趕回瓦爾克麗城",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-26-enter-deployment",
        "stage-26-opening-story",
        "stage-26-objective-reached",
        "stage-26-victory-story",
        "stage-26-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-26-enter-deployment",
        "stage-26-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0, 1, 7, 8],
        optionalSlots: [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 22,
        openCellCount: 18,
      },
      enemyClassById: [
        ["2:1", "magic-master"],
        ["2:35", "magic-priest"],
        ["2:36", "magic-priest"],
        ["2:37", "magic-priest"],
        ["2:38", "magic-priest"],
        ["2:39", "magic-priest"],
        ["2:40", "magic-priest"],
        ["2:41", "magic-priest"],
      ],
      enemyAi: "none",
    },
    load: loadStage26Module,
  },
  "stage-27": {
    id: "stage-27",
    ordinal: 26,
    label: "趕回瓦爾克麗城",
    nextStageId: "stage-28",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "deployment",
      statusText: "碧娜維姬已敗；編成趕回瓦爾克麗城的部隊。",
      campaignRoute: "stage-27",
    },
    enemyPhaseStatusText: "敵方階段：瓦爾克麗叛軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始瓦爾克麗回城戰部署。",
      retreatStatusText: "全面撤退：返回瓦爾克麗回城戰部署並重新編隊。",
    },
    completion: {
      destinationLabel: "保衛瓦爾克麗城",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-27-enter-deployment",
        "stage-27-opening-story",
        "stage-27-objective-reached",
        "stage-27-victory-story",
        "stage-27-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-27-enter-deployment",
        "stage-27-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [22, 41, 44, 43, 45, 42, 40, 57, 56, 58, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [22, 41, 44, 43, 45, 42, 40, 57, 56, 58, 0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 31,
        openCellCount: 20,
      },
      enemyClassById: [
        ["2:40", "magic-sword-warrior"],
        ["2:41", "magic-priest"],
        ["2:44", "magic-archer"],
        ["2:43", "magic-armor-warrior"],
        ["2:42", "curse-master"],
      ],
      enemyAi: "none",
    },
    load: loadStage27Module,
  },
  "stage-28": {
    id: "stage-28",
    ordinal: 27,
    label: "保衛瓦爾克麗城",
    nextStageId: "stage-29",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "瓦爾克麗城暫時脫險；眾人開始商議迎擊城外敵軍。",
      campaignRoute: "stage-28",
    },
    enemyPhaseStatusText: "敵方階段：包圍瓦爾克麗城的敵軍開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新開始瓦爾克麗守城關前流程。",
      retreatStatusText: "全面撤退：返回瓦爾克麗守城關前流程並重新編隊。",
    },
    completion: {
      destinationLabel: "騎士城堡前",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-28-prebattle-story",
        "stage-28-enter-deployment",
        "stage-28-opening-story",
        "stage-28-objective-reached",
        "stage-28-victory-story",
        "stage-28-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-28-prebattle-story",
        "stage-28-enter-deployment",
        "stage-28-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 29,
        openCellCount: 34,
      },
      enemyClassById: [
        ["2:41", "demon-dragon-knight"],
        ["2:42", "demon-dragon-knight"],
        ["2:55", "magic-sword-warrior"],
        ["2:56", "magic-sword-warrior"],
        ["2:57", "magic-sword-warrior"],
        ["2:50", "evil-sword-warrior"],
        ["2:54", "magic-sword-warrior"],
        ["2:51", "evil-sword-warrior"],
        ["2:52", "evil-sword-warrior"],
        ["2:53", "evil-sword-warrior"],
        ["2:49", "magic-master"],
        ["2:46", "crossbow"],
        ["2:47", "magic-master"],
        ["2:45", "crossbow"],
        ["2:48", "magic-master"],
        ["2:43", "pegasus-warrior"],
        ["2:44", "pegasus-warrior"],
      ],
      enemyAi: "none",
    },
    load: loadStage28Module,
  },
  "stage-29": {
    id: "stage-29",
    ordinal: 28,
    label: "騎士城堡前",
    nextStageId: "stage-30",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "瓦爾克麗城包圍已破；妮雅率軍進攻騎士城堡。",
      campaignRoute: "stage-29",
    },
    enemyPhaseStatusText: "敵方階段：騎士城堡守軍開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新開始騎士城堡關前流程。",
      retreatStatusText: "全面撤退：返回騎士城堡關前流程並重新編隊。",
    },
    completion: {
      destinationLabel: "治癒維斯塔女帝",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-29-prebattle-story",
        "stage-29-enter-deployment",
        "stage-29-objective-reached",
        "stage-29-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-29-prebattle-story",
        "stage-29-enter-deployment",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 15,
        openCellCount: 14,
      },
      enemyClassById: [
        ["2:47", "magic-archer"],
        ["2:52", "evil-mage"],
        ["2:4", "demon-dragon-knight"],
        ["2:51", "evil-mage"],
        ["2:53", "evil-mage"],
        ["2:50", "evil-mage"],
        ["2:56", "swift-dragon-knight"],
        ["2:42", "swift-dragon-knight"],
        ["2:55", "swift-dragon-knight"],
        ["2:54", "evil-mage"],
        ["2:43", "swift-dragon-knight"],
        ["2:48", "magic-archer"],
        ["2:46", "magic-archer"],
        ["2:45", "magic-archer"],
        ["2:49", "magic-archer"],
      ],
      enemyAi: "none",
    },
    load: loadStage29Module,
  },
  "stage-30": {
    id: "stage-30",
    ordinal: 29,
    label: "治癒維斯塔女帝",
    nextStageId: "stage-31",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "妮雅與琴斯趕回瓦爾克麗城，準備救治失控的維絲塔女帝。",
      campaignRoute: "stage-30",
    },
    enemyPhaseStatusText: "敵方階段：失控的維絲塔開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新開始救治維絲塔的關前流程。",
      retreatStatusText: "全面撤退：返回救治維絲塔的關前流程。",
    },
    completion: {
      destinationLabel: "前往斯德林海峽",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-30-prebattle-story",
        "stage-30-opening-story",
        "stage-30-opening-form-transition",
        "stage-30-objective-reached",
        "stage-30-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-30-prebattle-story",
        "stage-30-opening-story",
        "stage-30-opening-form-transition",
      ],
      alliedUnits: { kind: "exact-slots", slots: [0, 7, 40] },
      enemyClassById: [],
      enemyFormSequences: [{
        unitId: "2:27",
        classIdsByDifficulty: [
          ["soldier", "magic-sword-warrior", "jungle-warrior", "magic-priest", "prayer-guide", "curse-master", "magician", "great-axe-warrior"],
          ["soldier", "magic-sword-warrior", "jungle-warrior", "magic-priest", "prayer-guide", "curse-master", "magician", "great-axe-warrior", "half-dragon-warrior", "magic-armor-warrior", "magic-guide", "evil-mage", "magic-archer", "land-knight", "demon-dragon-knight", "flying-dragon-knight"],
          ["soldier", "magic-sword-warrior", "jungle-warrior", "magic-priest", "prayer-guide", "curse-master", "magician", "great-axe-warrior", "half-dragon-warrior", "magic-armor-warrior", "magic-guide", "evil-mage", "magic-archer", "land-knight", "demon-dragon-knight", "flying-dragon-knight", "beast-knight", "bone-knight", "swift-dragon-knight", "great-dragon-knight", "archer", "crossbow", "cavalry", "pegasus-warrior"],
          ["soldier", "magic-sword-warrior", "jungle-warrior", "magic-priest", "prayer-guide", "curse-master", "magician", "great-axe-warrior", "half-dragon-warrior", "magic-armor-warrior", "magic-guide", "evil-mage", "magic-archer", "land-knight", "demon-dragon-knight", "flying-dragon-knight", "beast-knight", "bone-knight", "swift-dragon-knight", "great-dragon-knight", "archer", "crossbow", "cavalry", "pegasus-warrior", "sister", "monk", "water-warrior", "divine-sword-warrior", "warrior", "steel-armor-warrior", "priest", "wizard"],
        ],
        experience: 0,
      }],
      enemyAi: "none",
    },
    load: loadStage30Module,
  },
  "stage-31": {
    id: "stage-31",
    ordinal: 30,
    label: "前往斯德林海峽",
    nextStageId: "stage-32",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "prebattleStory",
      statusText: "妮雅返回騎士團堡，率軍前往斯德林海峽迎擊菲伊魯茵。",
      campaignRoute: "stage-31",
    },
    enemyPhaseStatusText: "敵方階段：斯德林海峽伏兵開始行動。",
    retry: {
      mode: "entry",
      statusText: "重新開始斯德林海峽關前流程。",
      retreatStatusText: "全面撤退：返回斯德林海峽關前流程並重新編隊。",
    },
    completion: {
      destinationLabel: "斯德林海峽",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-31-prebattle-story",
        "stage-31-enter-deployment",
        "stage-31-opening-story",
        "stage-31-objective-reached",
        "stage-31-victory-story",
        "stage-31-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-31-prebattle-story",
        "stage-31-enter-deployment",
        "stage-31-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0, 1, 2, 3, 4],
        optionalSlots: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 17,
        openCellCount: 12,
      },
      enemyClassById: [
        ["2:5", "demon-dragon-knight"],
        ["2:55", "demon-dragon-knight"],
        ["2:42", "demon-dragon-knight"],
        ["2:51", "half-dragon-warrior"],
        ["2:54", "half-dragon-warrior"],
        ["2:53", "half-dragon-warrior"],
        ["2:52", "half-dragon-warrior"],
        ["2:50", "half-dragon-warrior"],
        ["2:56", "demon-dragon-knight"],
        ["2:43", "demon-dragon-knight"],
        ["2:49", "beast-knight"],
        ["2:48", "bone-knight"],
        ["2:47", "swift-dragon-knight"],
        ["2:46", "beast-knight"],
        ["2:45", "swift-dragon-knight"],
      ],
      enemyAi: "none",
    },
    load: loadStage31Module,
  },
  "stage-32": {
    id: "stage-32",
    ordinal: 31,
    label: "斯德林海峽",
    nextStageId: "stage-33",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅繼續追擊菲伊魯茵，並在斯德林海峽遭遇芙瑪羅妮聯軍。",
      campaignRoute: "stage-32",
    },
    enemyPhaseStatusText: "敵方階段：菲伊魯茵與芙瑪羅妮聯軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始斯德林海峽部署。",
      retreatStatusText: "全面撤退：返回斯德林海峽部署並重新編隊。",
    },
    completion: {
      destinationLabel: "拉那洛城外",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-32-enter-deployment",
        "stage-32-opening-story",
        "stage-32-objective-reached",
        "stage-32-victory-story",
        "stage-32-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-32-enter-deployment",
        "stage-32-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 16,
        openCellCount: 15,
      },
      enemyClassById: [
        ["2:56", "flying-dragon-knight"],
        ["2:6", "demon-dragon-knight"],
        ["2:37", "beast-knight"],
        ["2:38", "bone-knight"],
        ["2:43", "great-axe-warrior"],
        ["2:42", "evil-sword-warrior"],
        ["2:41", "magic-sword-warrior"],
        ["2:40", "great-axe-warrior"],
        ["2:39", "swift-dragon-knight"],
        ["2:31", "magic-priest"],
        ["2:30", "prayer-guide"],
        ["2:44", "magic-armor-warrior"],
        ["2:34", "evil-mage"],
        ["2:32", "curse-master"],
        ["2:36", "wizard"],
        ["2:35", "magic-master"],
        ["2:33", "magic-guide"],
        ["2:5", "demon-dragon-knight"],
      ],
      enemyAi: "none",
    },
    load: loadStage32Module,
  },
  "stage-33": {
    id: "stage-33",
    ordinal: 32,
    label: "拉那洛城外",
    nextStageId: "stage-34",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅抵達拉那洛城外，準備分兵突破城防。",
      campaignRoute: "stage-33",
    },
    enemyPhaseStatusText: "敵方階段：拉那洛城外守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始拉那洛城外部署。",
      retreatStatusText: "全面撤退：返回拉那洛城外部署並重新編隊。",
    },
    completion: {
      destinationLabel: "拉那洛城內",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-33-enter-deployment",
        "stage-33-opening-story",
        "stage-33-objective-reached",
        "stage-33-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-33-enter-deployment",
        "stage-33-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 10,
        openCellCount: 9,
      },
      enemyClassById: [
        ["2:55", "demon-dragon-knight"],
        ["2:56", "demon-dragon-knight"],
        ["2:39", "great-axe-warrior"],
        ["2:37", "great-axe-warrior"],
        ["2:36", "great-axe-warrior"],
        ["2:38", "great-axe-warrior"],
        ["2:31", "beast-knight"],
        ["2:23", "swift-dragon-knight"],
        ["2:24", "swift-dragon-knight"],
        ["2:30", "beast-knight"],
        ["2:34", "great-axe-warrior"],
        ["2:35", "great-axe-warrior"],
        ["2:47", "evil-mage"],
        ["2:49", "wizard"],
        ["2:51", "prayer-guide"],
        ["2:54", "magic-master"],
        ["2:46", "evil-mage"],
        ["2:45", "evil-mage"],
        ["2:53", "magic-master"],
        ["2:52", "prayer-guide"],
        ["2:50", "wizard"],
        ["2:48", "evil-mage"],
        ["2:40", "magic-armor-warrior"],
        ["2:41", "magic-armor-warrior"],
        ["2:32", "beast-knight"],
        ["2:33", "beast-knight"],
        ["2:42", "magic-armor-warrior"],
        ["2:43", "magic-armor-warrior"],
        ["2:44", "magic-armor-warrior"],
      ],
      enemyAi: "none",
    },
    load: loadStage33Module,
  },
  "stage-34": {
    id: "stage-34",
    ordinal: 33,
    label: "拉那洛城內",
    nextStageId: "stage-35",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "campaign-entered",
      phase: "player",
      statusText: "妮雅進入拉那洛城內，準備迎戰蕾娜吉芙與城內守軍。",
      campaignRoute: "stage-34",
    },
    enemyPhaseStatusText: "敵方階段：蕾娜吉芙與拉那洛城內守軍開始行動。",
    retry: {
      mode: "preparation",
      statusText: "重新開始拉那洛城內部署。",
      retreatStatusText: "全面撤退：返回拉那洛城內部署並重新編隊。",
    },
    completion: {
      destinationLabel: "時空異變",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-34-enter-deployment",
        "stage-34-opening-story",
        "stage-34-objective-reached",
        "stage-34-completed-route",
      ],
      requiredResumeEventIds: [
        "stage-34-enter-deployment",
        "stage-34-opening-story",
      ],
      alliedUnits: {
        kind: "deployment",
        eligibleSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        fixedSlots: [0],
        optionalSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31],
        maximumUnits: 11,
        openCellCount: 10,
      },
      enemyClassById: [
        ["2:6", "great-dragon-knight"],
        ["2:39", "prayer-guide"],
        ["2:7", "evil-sword-warrior"],
        ["2:40", "prayer-guide"],
        ["2:48", "magic-armor-warrior"],
        ["2:49", "evil-sword-warrior"],
        ["2:55", "evil-mage"],
        ["2:54", "evil-mage"],
        ["2:47", "evil-sword-warrior"],
        ["2:56", "evil-mage"],
        ["2:50", "magic-sword-warrior"],
        ["2:46", "divine-sword-warrior"],
        ["2:41", "prayer-guide"],
        ["2:51", "evil-sword-warrior"],
        ["2:53", "evil-sword-warrior"],
        ["2:52", "divine-sword-warrior"],
        ["2:43", "magic-master"],
        ["2:42", "magic-master"],
        ["2:44", "magic-master"],
      ],
      enemyAi: "none",
    },
    load: loadStage34Module,
  },
  "stage-35": {
    id: "stage-35",
    ordinal: 34,
    label: "時空異變",
    nextStageId: "stage-36",
    focusUnitId: "1:0",
    mapPresentationActionIds: RELEASED_MAP_ACTION_IDS,
    entry: {
      trigger: "battle-started",
      phase: "player",
      statusText: "異世界之門發生異變，死亡之谷的部隊從門內湧出。",
      campaignRoute: "stage-35",
    },
    enemyPhaseStatusText: "敵方階段：死亡之谷部隊原地消耗行動。",
    retry: {
      mode: "entry",
      statusText: "重新建立時空異變固定編隊。",
      retreatStatusText: "全面撤退：重新建立時空異變固定編隊。",
    },
    completion: {
      destinationLabel: "異世界的碧娜維姬",
      destinationProgress: 1000,
      consumedEvents: "all",
    },
    save: {
      validEventIds: [
        "stage-35-opening-story",
        "stage-35-objective-reached",
        "stage-35-victory-story",
        "stage-35-completed-route",
      ],
      requiredResumeEventIds: ["stage-35-opening-story"],
      alliedUnits: {
        kind: "exact-slots",
        slots: [0, 1, 2, 3, 4, 5, 7, 8, 18],
      },
      enemyClassById: [
        ["2:39", "land-knight"],
        ["2:35", "magic-armor-warrior"],
        ["2:36", "half-dragon-warrior"],
        ["2:40", "magic-sword-warrior"],
        ["2:44", "evil-mage"],
        ["2:38", "demon-dragon-knight"],
        ["2:41", "magic-priest"],
        ["2:43", "great-axe-warrior"],
        ["2:37", "land-knight"],
        ["2:42", "magician"],
      ],
      enemyAi: "none",
    },
    load: loadStage35Module,
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
