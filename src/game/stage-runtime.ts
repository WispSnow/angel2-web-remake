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
  storyBackgrounds?: Readonly<Partial<Record<number, string>>>;
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
    phase: Extract<GamePhase, "prebattleStory" | "player" | "scriptedMove">;
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
