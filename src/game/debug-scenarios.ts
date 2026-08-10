import "../debug.css";
import { STAGE0, completeCampaignRoster } from "./content/stage0";
import { GameController } from "./controller";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "./save";
import {
  createDebugCampaignState,
  debugGrowthBudgetForStage,
  debugRosterSourceOption,
  type DebugRosterSource,
} from "./debug-roster-profiles";
import { consumedEventIdsForBattleResume } from "./simulation/stage-events";
import type {
  BattleSaveData,
  CampaignState,
  CompletedSaveData,
  Difficulty,
} from "./types";
import {
  DEBUG_SCENARIOS,
  debugScenarioUrl,
  debugStageLabel,
  isDebugScenarioId,
  type DebugScenarioId,
} from "./debug-scenario-catalog";

export {
  DEBUG_SCENARIOS,
  debugScenarioUrl,
  isDebugScenarioId,
  type DebugScenarioId,
} from "./debug-scenario-catalog";
export {
  parseDebugPerStageGrowth,
  parseDebugRosterSourceId,
  type DebugRosterSource,
} from "./debug-roster-profiles";

const STAGE1_BATTLE_EVENT_IDS = [
  "stage-01-prebattle-story",
  "stage-01-enter-deployment",
  "stage-01-opening-story",
] as const;

const STAGE1_COMPLETED_EVENT_IDS = [
  ...STAGE1_BATTLE_EVENT_IDS,
  "stage-01-boss-defeated",
  "stage-01-messenger-arrival",
  "stage-01-completed-route",
] as const;

const STAGE2_COMPLETED_EVENT_IDS = [
  "stage-02-opening-story",
  "stage-02-boss-defeated",
  "stage-02-victory-story",
  "stage-02-completed-route",
] as const;

const STAGE3_COMPLETED_EVENT_IDS = [
  "stage-03-opening-story",
  "stage-03-boss-defeated",
  "stage-03-victory-story",
  "stage-03-completed-route",
] as const;

const STAGE4_BATTLE_EVENT_IDS = [
  "stage-04-prebattle-story",
  "stage-04-enter-deployment",
  "stage-04-opening-story",
] as const;

const STAGE4_COMPLETED_EVENT_IDS = [
  ...STAGE4_BATTLE_EVENT_IDS,
  "stage-04-objective-reached",
  "stage-04-victory-story",
  "stage-04-completed-route",
] as const;

const STAGE5_BATTLE_EVENT_IDS = [
  "stage-05-enter-deployment",
  "stage-05-opening-story",
] as const;

const STAGE5_COMPLETED_EVENT_IDS = [
  ...STAGE5_BATTLE_EVENT_IDS,
  "stage-05-objective-reached",
  "stage-05-victory-story",
  "stage-05-completed-route",
] as const;

const STAGE42_COMPLETED_EVENT_IDS = [
  "stage-42-nia-move",
  "stage-42-arrival-story",
  "stage-42-confrontation-story",
  "stage-42-gadirath-move",
  "stage-42-intervention-story",
  "stage-42-lightning",
  "stage-42-departures",
  "stage-42-departure-story",
  "stage-42-completed-route",
] as const;

const STAGE6_BATTLE_EVENT_IDS = [
  "stage-06-enter-deployment",
  "stage-06-prebattle-story",
  "stage-06-opening-story",
] as const;

const STAGE6_COMPLETED_EVENT_IDS = [
  ...STAGE6_BATTLE_EVENT_IDS,
  "stage-06-objective-reached",
  "stage-06-retreat-story",
  "stage-06-reinforcements",
  "stage-06-ranger-leader-move",
  "stage-06-alliance-story",
  "stage-06-completed-route",
] as const;

const STAGE7_BATTLE_EVENT_IDS = [
  "stage-07-prebattle-story",
  "stage-07-enter-deployment",
] as const;

const STAGE7_COMPLETED_EVENT_IDS = [
  ...STAGE7_BATTLE_EVENT_IDS,
  "stage-07-objective-reached",
  "stage-07-completed-route",
] as const;

const STAGE8_BATTLE_EVENT_IDS = [
  "stage-08-prebattle-story",
  "stage-08-opening-story",
] as const;

const STAGE8_COMPLETED_EVENT_IDS = [
  ...STAGE8_BATTLE_EVENT_IDS,
  "stage-08-objective-reached",
  "stage-08-victory-story",
  "stage-08-completed-route",
] as const;

const STAGE9_BATTLE_EVENT_IDS = [
  "stage-09-enter-deployment",
  "stage-09-opening-story",
] as const;

const STAGE9_COMPLETED_EVENT_IDS = [
  ...STAGE9_BATTLE_EVENT_IDS,
  "stage-09-objective-reached",
  "stage-09-victory-story",
  "stage-09-completed-route",
] as const;

const STAGE11_BATTLE_EVENT_IDS = [
  "stage-11-opening-story",
  "stage-11-dori-departure",
] as const;

const STAGE11_COMPLETED_EVENT_IDS = [
  ...STAGE11_BATTLE_EVENT_IDS,
  "stage-11-objective-reached",
  "stage-11-victory-story",
  "stage-11-completed-route",
] as const;

const STAGE10_BATTLE_EVENT_IDS = [
  "stage-10-prebattle-story",
  "stage-10-enter-deployment",
] as const;

const STAGE10_COMPLETED_EVENT_IDS = [
  ...STAGE10_BATTLE_EVENT_IDS,
  "stage-10-objective-reached",
  "stage-10-completed-route",
] as const;

const STAGE12_BATTLE_EVENT_IDS = [
  "stage-12-prebattle-story",
  "stage-12-enter-deployment",
  "stage-12-opening-story",
] as const;

const STAGE12_COMPLETED_EVENT_IDS = [
  ...STAGE12_BATTLE_EVENT_IDS,
  "stage-12-objective-reached",
  "stage-12-victory-story",
  "stage-12-completed-route",
] as const;

export interface DebugScenarioContext {
  difficulty: Difficulty;
  rosterSource: DebugRosterSource;
  storage: Pick<Storage, "getItem">;
  perStageGrowth?: number;
}

function debugCampaign(
  context: DebugScenarioContext,
  stageId: CampaignState["stageId"],
): CampaignState {
  return createDebugCampaignState(
    stageId,
    context.difficulty,
    context.rosterSource,
    context.storage,
    context.perStageGrowth,
  );
}

function battleSaveBase(
  campaign: CampaignState,
  stageId: BattleSaveData["stageId"],
): Pick<
  BattleSaveData,
  | "format"
  | "version"
  | "contentVersion"
  | "kind"
  | "savedAt"
  | "saveCount"
  | "stageId"
  | "ruleset"
  | "difficulty"
  | "rngState"
  | "rngCalls"
  | "stageEntrySnapshot"
  | "stageProgress"
> {
  return {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "battle",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId,
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    stageEntrySnapshot: {
      ...campaign,
      stageId,
      roster: campaign.roster.map((entry) => ({ ...entry })),
    },
    stageProgress: 0,
  };
}

async function createStage0Player(context: DebugScenarioContext): Promise<GameController> {
  const source = new GameController(context.difficulty);
  const nia = source.battle.unit("1:0");
  if (!nia) throw new Error("stage 0 debug scenario is missing Nia");
  nia.x = STAGE0.opening.to.x;
  nia.y = STAGE0.opening.to.y;
  source.battle.focusId = nia.id;
  const campaign = source.battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(campaign, "stage-00"),
    stageLabel: "瓦爾克麗宮",
    roster: campaign.roster,
    consumedEventIds: consumedEventIdsForBattleResume(source.battle.stage, 1),
    battle: {
      phase: "player",
      ...source.battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { x: 25, y: 23 },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：第 0 關玩家回合。";
  return controller;
}

async function createStage1Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage1(debugCampaign(context, "stage-01"));
  return controller;
}

async function createStage1Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage1(
    debugCampaign(context, "stage-01"),
    "deployment",
    "調試場景：第 1 關正式部署。",
  );
  return controller;
}

async function createStage1Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-01");
  const [{ STAGE1_DEFINITION }, { Stage1Battle }] = await Promise.all([
    import("./content/stage1"),
    import("./simulation/stage1-battle"),
  ]);
  const deployment = {
    placements: [
      ...STAGE1_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot,
        position: { ...position },
        fixed: true,
      })),
      {
        slot: 24,
        position: { ...STAGE1_DEFINITION.deployment.openCells[0] },
        fixed: false,
      },
    ],
  };
  const battle = new Stage1Battle(campaign, deployment);
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 1 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-01"),
    stageLabel: "騎士城堡前",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE1_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：第 1 關六人編隊玩家回合。";
  return controller;
}

async function createStage1Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-01");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-02",
    stageLabel: "攻打騎士堡",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE1_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage2Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage2(
    debugCampaign(context, "stage-02"),
    "調試場景：第 2 關固定編隊。",
  );
  return controller;
}

async function createStage2Player(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage2Opening(context);
  controller.skipDialogue();
  controller.statusMessage = "調試場景：第 2 關玩家回合；六名友軍將自動行動。";
  return controller;
}

async function createStage2Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-02");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-03",
    stageLabel: "救援友軍",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE2_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage3Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage3(
    debugCampaign(context, "stage-03"),
    "調試場景：第 3 關固定編隊。",
  );
  return controller;
}

async function createStage3Player(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage3Opening(context);
  controller.skipDialogue();
  controller.statusMessage = "調試場景：第 3 關玩家回合；第四軍團由黛西帶隊自動行動。";
  return controller;
}

async function createStage3Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-03");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-04",
    stageLabel: "通過力場",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE3_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage4Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage("stage-04", debugCampaign(context, "stage-04"));
  return controller;
}

async function createStage4Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-04",
    debugCampaign(context, "stage-04"),
    { preparation: true, statusMessage: "調試場景：第 4 關結界部署。" },
  );
  return controller;
}

async function createStage4Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-04");
  const [{ STAGE4_DEFINITION }, { Stage4Battle }] = await Promise.all([
    import("./content/stage4"),
    import("./simulation/stage4-battle"),
  ]);
  const deployment = {
    placements: [
      ...STAGE4_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot,
        position: { ...position },
        fixed: true,
      })),
      ...STAGE4_DEFINITION.deployment.optionalSlots.map((slot, index) => ({
        slot,
        position: { ...STAGE4_DEFINITION.deployment.openCells[index] },
        fixed: false,
      })),
    ],
  };
  const battle = new Stage4Battle(campaign, deployment);
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 4 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-04"),
    stageLabel: "通過力場",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE4_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：第 4 關八人編隊玩家回合。";
  return controller;
}

async function createStage4Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-04");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-05",
    stageLabel: "遭遇丁塔琪",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE4_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage5Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-05",
    debugCampaign(context, "stage-05"),
    { preparation: true, statusMessage: "調試場景：第 5 關內殿部署。" },
  );
  return controller;
}

async function createStage5Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-05");
  const [{ STAGE5_DEFINITION }, { Stage5Battle }] = await Promise.all([
    import("./content/stage5"),
    import("./simulation/stage5-battle"),
  ]);
  const deployment = {
    placements: [
      ...STAGE5_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE5_DEFINITION.deployment.optionalSlots.slice(0, 5).map((slot, index) => ({
        slot, position: { ...STAGE5_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
  const battle = new Stage5Battle(campaign, deployment);
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 5 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-05"),
    stageLabel: "遭遇丁塔琪",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE5_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：第 5 關六人編隊玩家回合。";
  return controller;
}

async function createStage5Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-05");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-42-portal",
    stageLabel: "異世界之門",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE5_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage42Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-42-portal");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-06",
    stageLabel: "過異世界之門",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE42_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage6Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-06",
    debugCampaign(context, "stage-06"),
    { preparation: true, statusMessage: "調試場景：第 6 關異世界部署。" },
  );
  return controller;
}

async function stage6FullDeployment() {
  const { STAGE6_DEFINITION } = await import("./content/stage6");
  return {
    placements: [
      ...STAGE6_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE6_DEFINITION.deployment.optionalSlots.slice(0, 8).map((slot, index) => ({
        slot, position: { ...STAGE6_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage6Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage6Deployment(context);
  controller.completeDeployment(await stage6FullDeployment());
  return controller;
}

async function createStage6Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-06");
  const { Stage6Battle } = await import("./simulation/stage6-battle");
  const battle = new Stage6Battle(campaign, await stage6FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 6 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-06"),
    stageLabel: "過異世界之門",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE6_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：第 6 關九人編隊玩家回合。";
  return controller;
}

async function createStage6Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-06");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-07",
    stageLabel: "來到異世界",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE6_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage7Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage("stage-07", debugCampaign(context, "stage-07"));
  return controller;
}

async function createStage7Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-07",
    debugCampaign(context, "stage-07"),
    { preparation: true, statusMessage: "調試場景：第 7 關營地守備部署。" },
  );
  return controller;
}

async function stage7FullDeployment() {
  const { STAGE7_DEFINITION } = await import("./content/stage7");
  return {
    placements: [
      ...STAGE7_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE7_DEFINITION.deployment.optionalSlots.slice(0, 5).map((slot, index) => ({
        slot, position: { ...STAGE7_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage7Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-07");
  const { Stage7Battle } = await import("./simulation/stage7-battle");
  const battle = new Stage7Battle(campaign, await stage7FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 7 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-07"),
    stageLabel: "來到異世界",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE7_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：第 7 關七人編隊玩家回合。";
  return controller;
}

async function createStage7Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-07");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-08",
    stageLabel: "營地遭到偷襲",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE7_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage8Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage("stage-08", debugCampaign(context, "stage-08"));
  return controller;
}

async function createStage8Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage8Prebattle(context);
  controller.skipDialogue();
  await Promise.resolve();
  return controller;
}

async function createStage8Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-08");
  const { Stage8Battle } = await import("./simulation/stage8-battle");
  const battle = new Stage8Battle(campaign);
  const sulanda = battle.unit("1:8");
  if (!sulanda) throw new Error("stage 8 debug scenario is missing Sulanda");
  battle.focusId = sulanda.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-08"),
    stageLabel: "營地遭到偷襲",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE8_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: sulanda.x, y: sulanda.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：第 8 關固定編隊玩家回合。";
  return controller;
}

async function createStage8FreeAction(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage8Player(context);
  await controller.freeAction();
  controller.advanceDialogue();
  return controller;
}

async function createStage8Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-08");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-09",
    stageLabel: "找尋傳說中的飛船",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE8_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage9Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-09",
    debugCampaign(context, "stage-09"),
    { preparation: true, statusMessage: "調試場景：第 9 關死亡之谷部署。" },
  );
  return controller;
}

async function stage9FullDeployment() {
  const { STAGE9_DEFINITION } = await import("./content/stage9");
  return {
    placements: [
      ...STAGE9_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE9_DEFINITION.deployment.optionalSlots.slice(0, 7).map((slot, index) => ({
        slot, position: { ...STAGE9_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage9Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage9Deployment(context);
  controller.completeDeployment(await stage9FullDeployment());
  return controller;
}

async function createStage9Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-09");
  const { Stage9Battle } = await import("./simulation/stage9-battle");
  const battle = new Stage9Battle(campaign, await stage9FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 9 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-09"),
    stageLabel: "找尋傳說中的飛船",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE9_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：第 9 關護送編隊玩家回合。";
  return controller;
}

async function createStage9Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-09");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-11",
    stageLabel: "拯救蘇蘭達",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE9_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage11Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage("stage-11", debugCampaign(context, "stage-11"));
  return controller;
}

async function createStage11Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-11");
  const { Stage11Battle } = await import("./simulation/stage11-battle");
  const battle = new Stage11Battle(campaign);
  battle.removeStoryUnits([{ side: 1, slot: 9 }]);
  const sulanda = battle.unit("1:8");
  if (!sulanda) throw new Error("stage 11 debug scenario is missing Sulanda");
  battle.focusId = sulanda.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-11"),
    stageLabel: "拯救蘇蘭達",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE11_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: sulanda.x, y: sulanda.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：蘇蘭達游騎兵撤離隊玩家回合。";
  return controller;
}

async function createStage11Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-11");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-10",
    stageLabel: "飛船上遭遇敵人",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE11_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage10Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage("stage-10", debugCampaign(context, "stage-10"));
  return controller;
}

async function createStage10Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-10",
    debugCampaign(context, "stage-10"),
    { preparation: true, statusMessage: "調試場景：飛船甲板部署。" },
  );
  return controller;
}

async function stage10FullDeployment() {
  const { STAGE10_DEFINITION } = await import("./content/stage10");
  return {
    placements: [
      ...STAGE10_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE10_DEFINITION.deployment.optionalSlots.slice(0, 12).map((slot, index) => ({
        slot, position: { ...STAGE10_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage10Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-10");
  const { Stage10Battle } = await import("./simulation/stage10-battle");
  const battle = new Stage10Battle(campaign, await stage10FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 10 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-10"),
    stageLabel: "飛船上遭遇敵人",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE10_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：飛船防衛隊十三人玩家回合。";
  return controller;
}

async function createStage10Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-10");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-12",
    stageLabel: "落入沼澤",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE10_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage12Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage("stage-12", debugCampaign(context, "stage-12"));
  return controller;
}

async function createStage12Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-12",
    debugCampaign(context, "stage-12"),
    { preparation: true, statusMessage: "調試場景：沼澤部署。" },
  );
  return controller;
}

async function stage12FullDeployment() {
  const { STAGE12_DEFINITION } = await import("./content/stage12");
  return {
    placements: [
      ...STAGE12_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE12_DEFINITION.deployment.optionalSlots.slice(0, 8).map((slot, index) => ({
        slot, position: { ...STAGE12_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage12Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage12Deployment(context);
  controller.completeDeployment(await stage12FullDeployment());
  return controller;
}

async function createStage12Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-12");
  const { Stage12Battle } = await import("./simulation/stage12-battle");
  const battle = new Stage12Battle(campaign, await stage12FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 12 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-12"),
    stageLabel: "落入沼澤",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE12_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：沼澤九人編隊玩家回合。";
  return controller;
}

async function createStage12Split(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-12");
  const { Stage12Battle } = await import("./simulation/stage12-battle");
  const battle = new Stage12Battle(campaign, await stage12FullDeployment());
  const attacker = battle.unit("1:1");
  const water = battle.unit("2:40");
  if (!attacker || !water) throw new Error("stage 12 split scenario is incomplete");
  attacker.x = 38;
  attacker.y = 17;
  battle.attack(attacker.id, water.id);
  attacker.acted = false;
  attacker.life = battle.statsFor(attacker).maxLife;
  for (const unit of battle.units.filter(({ side, slot }) => side === 2 && slot === 40)) {
    unit.life = battle.statsFor(unit).maxLife;
  }
  battle.focusId = attacker.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-12"),
    stageLabel: "落入沼澤",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE12_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: attacker.x, y: attacker.y },
      cameraOrigin: { x: 35, y: 14 },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：水戰士根槽 40 已產生共享生命分裂體，可再次近戰驗證扣血時序。";
  return controller;
}

async function createStage12Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-12");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-13",
    stageLabel: "龍塔外",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE12_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

export async function createDebugScenarioController(
  id: DebugScenarioId,
  context: DebugScenarioContext,
): Promise<GameController> {
  return DEBUG_SCENARIO_FACTORIES[id](context);
}

type DebugScenarioFactory = (
  context: DebugScenarioContext,
) => Promise<GameController> | GameController;

function withSetup(
  create: (context: DebugScenarioContext) => Promise<GameController>,
  setup: (controller: GameController) => void,
): DebugScenarioFactory {
  return async (context) => {
    const controller = await create(context);
    setup(controller);
    return controller;
  };
}

const DEBUG_SCENARIO_FACTORIES = {
  "stage-00-prebattle": (context) => new GameController(context.difficulty),
  "stage-00-player": createStage0Player,
  "stage-00-near-victory": withSetup(createStage0Player, (controller) => {
    controller.forceVictorySetupForTest();
  }),
  "stage-00-cleared": createStage1Prebattle,
  "stage-01-prebattle": createStage1Prebattle,
  "stage-01-deployment": createStage1Deployment,
  "stage-01-player": createStage1Player,
  "stage-01-magician": withSetup(createStage1Player, (controller) => {
    controller.forceClassActionSetupForTest("magician", false, "pursuing");
  }),
  "stage-01-dispel": withSetup(createStage1Player, (controller) => {
    controller.forceDispelSetupForTest();
  }),
  "stage-01-enemy-sister": withSetup(createStage1Player, (controller) => {
    controller.forceEnemySisterSetupForTest();
  }),
  "stage-01-near-victory": withSetup(createStage1Player, (controller) => {
    controller.forceVictorySetupForTest();
  }),
  "stage-01-cleared": createStage1Completed,
  "stage-02-prebattle": createStage2Opening,
  "stage-02-preparation": createStage2Opening,
  "stage-02-player": createStage2Player,
  "stage-02-near-victory": withSetup(createStage2Player, (controller) => {
    controller.forceVictorySetupForTest();
  }),
  "stage-02-cleared": createStage2Completed,
  "stage-03-prebattle": createStage3Opening,
  "stage-03-preparation": createStage3Opening,
  "stage-03-player": createStage3Player,
  "stage-03-near-victory": withSetup(createStage3Player, (controller) => {
    controller.forceVictorySetupForTest();
  }),
  "stage-03-cleared": createStage3Completed,
  "stage-04-prebattle": createStage4Prebattle,
  "stage-04-deployment": createStage4Deployment,
  "stage-04-player": createStage4Player,
  "stage-04-first-pulse": withSetup(createStage4Player, (controller) => {
    controller.statusMessage = "調試場景：結束玩家回合以觀察首輪力場脈衝。";
  }),
  "stage-04-near-victory": withSetup(createStage4Player, (controller) => {
    controller.forceVictorySetupForTest();
  }),
  "stage-04-cleared": createStage4Completed,
  "stage-05-deployment": createStage5Deployment,
  "stage-05-player": createStage5Player,
  "stage-05-near-tintachi": withSetup(createStage5Player, (controller) => {
    controller.forceVictorySetupForTest(0);
  }),
  "stage-05-near-rhein": withSetup(createStage5Player, (controller) => {
    controller.forceVictorySetupForTest(1);
  }),
  "stage-05-near-defeat": withSetup(createStage5Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.units.find(({ side }) => side === 2);
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵兵位於相鄰格。";
  }),
  "stage-05-victory-ready": withSetup(createStage5Player, (controller) => {
    controller.forceVictoryForTest(0);
  }),
  "stage-05-cleared": createStage5Completed,
  "stage-42-portal-live": createStage5Completed,
  "stage-42-completed-route": createStage42Completed,
  "stage-06-deployment": createStage6Deployment,
  "stage-06-prebattle": createStage6Prebattle,
  "stage-06-player": createStage6Player,
  "stage-06-near-xielei": withSetup(createStage6Player, (controller) => {
    controller.forceVictorySetupForTest();
  }),
  "stage-06-near-defeat": withSetup(createStage6Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.units.find(({ side }) => side === 2);
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵兵位於相鄰格。";
  }),
  "stage-06-victory-ready": withSetup(createStage6Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-06-cleared": createStage6Completed,
  "stage-07-prebattle": createStage7Prebattle,
  "stage-07-deployment": createStage7Deployment,
  "stage-07-player": createStage7Player,
  "stage-07-near-laili": withSetup(createStage7Player, (controller) => {
    controller.forceVictorySetupForTest();
  }),
  "stage-07-near-defeat": withSetup(createStage7Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.units.find(({ side }) => side === 2);
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵兵位於相鄰格。";
  }),
  "stage-07-victory-ready": withSetup(createStage7Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-07-cleared": createStage7Completed,
  "stage-08-prebattle": createStage8Prebattle,
  "stage-08-opening": createStage8Opening,
  "stage-08-player": createStage8Player,
  "stage-08-free-action": createStage8FreeAction,
  "stage-08-near-victory": withSetup(createStage8Player, (controller) => {
    controller.forceVictorySetupForTest();
  }),
  "stage-08-near-defeat": withSetup(createStage8Player, (controller) => {
    const sulanda = controller.battle.unit("1:8");
    const enemy = controller.battle.units.find(({ side }) => side === 2);
    if (!sulanda || !enemy) return;
    sulanda.life = 1;
    enemy.x = sulanda.x + 1;
    enemy.y = sulanda.y;
    controller.statusMessage = "調試場景：蘇蘭達只剩 1 點生命，敵兵位於相鄰格。";
  }),
  "stage-08-victory-ready": withSetup(createStage8Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-08-cleared": createStage8Completed,
  "stage-09-deployment": createStage9Deployment,
  "stage-09-opening": createStage9Opening,
  "stage-09-player": createStage9Player,
  "stage-09-near-route": withSetup(createStage9Player, (controller) => {
    controller.forceVictorySetupForTest();
  }),
  "stage-09-near-elimination": withSetup(createStage9Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const finalEnemy = controller.battle.units.find(({ side }) => side === 2);
    if (!nia || !finalEnemy) return;
    nia.x = 30;
    nia.y = 30;
    nia.experience = 0;
    nia.acted = false;
    finalEnemy.x = 31;
    finalEnemy.y = 30;
    finalEnemy.life = 1;
    controller.battle.units = controller.battle.units.filter(
      ({ side, id }) => side === 1 || id === finalEnemy.id,
    );
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 27, y: 27 };
    controller.statusMessage = "調試場景：最後一名敵軍只剩 1 點生命。";
  }),
  "stage-09-near-defeat": withSetup(createStage9Player, (controller) => {
    const dori = controller.battle.unit("1:9");
    const enemy = controller.battle.units.find(({ side }) => side === 2);
    if (!dori || !enemy) return;
    dori.life = 1;
    enemy.x = dori.x + 1;
    enemy.y = dori.y;
    controller.statusMessage = "調試場景：多莉只剩 1 點生命，敵兵位於相鄰格。";
  }),
  "stage-09-victory-ready": withSetup(createStage9Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-09-cleared": createStage9Completed,
  "stage-11-opening": createStage11Opening,
  "stage-11-player": createStage11Player,
  "stage-11-near-route": withSetup(createStage11Player, (controller) => {
    controller.forceVictorySetupForTest();
    controller.statusMessage = "調試場景：蘇蘭達距飛船登船區一步。";
  }),
  "stage-11-near-defeat": withSetup(createStage11Player, (controller) => {
    const sulanda = controller.battle.unit("1:8");
    const enemy = controller.battle.unit("2:21");
    if (!sulanda || !enemy) return;
    sulanda.life = 1;
    enemy.x = sulanda.x + 1;
    enemy.y = sulanda.y;
    controller.statusMessage = "調試場景：蘇蘭達只剩 1 點生命，飛馬追擊兵位於相鄰格。";
  }),
  "stage-11-victory-ready": withSetup(createStage11Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-11-cleared": createStage11Completed,
  "stage-10-prebattle": createStage10Prebattle,
  "stage-10-deployment": createStage10Deployment,
  "stage-10-player": createStage10Player,
  "stage-10-near-victory": withSetup(createStage10Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const finalEnemy = controller.battle.unit("2:20");
    if (!nia || !finalEnemy) return;
    nia.x = 26;
    nia.y = 20;
    nia.experience = 0;
    nia.life = controller.battle.statsFor(nia).maxLife;
    nia.acted = false;
    finalEnemy.x = 27;
    finalEnemy.y = 20;
    finalEnemy.life = 1;
    controller.battle.units = controller.battle.units.filter(
      ({ side, id }) => side === 1 || id === finalEnemy.id,
    );
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 22, y: 17 };
    controller.statusMessage = "調試場景：最後一名飛船追兵只剩 1 點生命。";
  }),
  "stage-10-near-defeat": withSetup(createStage10Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const kenosi = controller.battle.unit("2:20");
    if (!nia || !kenosi) return;
    nia.life = 1;
    kenosi.x = nia.x + 1;
    kenosi.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，克諾絲位於相鄰格。";
  }),
  "stage-10-victory-ready": withSetup(createStage10Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-10-cleared": createStage10Completed,
  "stage-12-prebattle": createStage12Prebattle,
  "stage-12-deployment": createStage12Deployment,
  "stage-12-opening": createStage12Opening,
  "stage-12-player": createStage12Player,
  "stage-12-split": createStage12Split,
  "stage-12-near-victory": withSetup(createStage12Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const finalEnemy = controller.battle.unit("2:40");
    if (!nia || !finalEnemy) return;
    nia.x = 38;
    nia.y = 17;
    nia.experience = 0;
    nia.life = controller.battle.statsFor(nia).maxLife;
    nia.acted = false;
    finalEnemy.life = 1;
    controller.battle.units = controller.battle.units.filter(
      ({ side, id }) => side === 1 || id === finalEnemy.id,
    );
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 35, y: 14 };
    controller.statusMessage = "調試場景：最後一個水戰士根組只剩 1 點生命。";
  }),
  "stage-12-near-defeat": withSetup(createStage12Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:40");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，水戰士位於相鄰格。";
  }),
  "stage-12-victory-ready": withSetup(createStage12Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-12-cleared": createStage12Completed,
} as const satisfies Record<DebugScenarioId, DebugScenarioFactory>;

export interface Angel2DeveloperApi {
  scenarioId: DebugScenarioId;
  rosterSourceId: string;
  perStageGrowth?: number;
  getState: () => object;
  completeCurrentStage: () => Promise<void>;
  prepareVictory: () => void;
  forceDefeat: () => void;
  openScenario: (id: DebugScenarioId) => void;
}

declare global {
  interface Window {
    __ANGEL2_DEBUG__?: Angel2DeveloperApi;
  }
}

export function mountDebugToolbar(
  controller: GameController,
  scenarioId: DebugScenarioId,
  difficulty: Difficulty,
  rosterSource: DebugRosterSource,
  storage: Pick<Storage, "getItem">,
  perStageGrowth?: number,
): () => void {
  document.body.classList.add("debug-session-page");
  const toolbar = document.createElement("aside");
  toolbar.className = "debug-toolbar";
  toolbar.dataset.testid = "debug-toolbar";
  toolbar.innerHTML = `
    <button class="debug-toolbar-toggle" type="button" data-debug-toggle aria-expanded="true">DEBUG</button>
    <div class="debug-toolbar-panel">
      <div class="debug-toolbar-heading"><b>開發調試</b><a href="/debug.html">場景選擇</a></div>
      <p data-debug-scenario></p>
      <p data-debug-roster></p>
      <p data-debug-experience></p>
      <p data-debug-state></p>
      <div class="debug-toolbar-actions">
        <button type="button" data-debug-victory>一擊勝利</button>
        <button type="button" data-debug-complete>直接通關</button>
        <button type="button" data-debug-defeat>戰敗測試</button>
      </div>
      <small>僅作用於目前記憶體會話，不寫入正式存檔。</small>
    </div>`;
  document.body.append(toolbar);

  const panel = toolbar.querySelector<HTMLElement>(".debug-toolbar-panel");
  const toggle = toolbar.querySelector<HTMLButtonElement>("[data-debug-toggle]");
  const scenarioLabel = toolbar.querySelector<HTMLElement>("[data-debug-scenario]");
  const rosterLabel = toolbar.querySelector<HTMLElement>("[data-debug-roster]");
  const experienceLabel = toolbar.querySelector<HTMLElement>("[data-debug-experience]");
  const stateLabel = toolbar.querySelector<HTMLElement>("[data-debug-state]");
  const victory = toolbar.querySelector<HTMLButtonElement>("[data-debug-victory]");
  const complete = toolbar.querySelector<HTMLButtonElement>("[data-debug-complete]");
  const defeat = toolbar.querySelector<HTMLButtonElement>("[data-debug-defeat]");
  if (
    !panel || !toggle || !scenarioLabel || !rosterLabel || !experienceLabel || !stateLabel
    || !victory || !complete || !defeat
  ) {
    throw new Error("debug toolbar controls are missing");
  }

  const scenario = DEBUG_SCENARIOS.find(({ id }) => id === scenarioId);
  const rosterOption = debugRosterSourceOption(rosterSource, storage);
  const growthBudget = scenario && perStageGrowth !== undefined
    ? debugGrowthBudgetForStage(scenario.stageId, perStageGrowth)
    : undefined;

  const render = () => {
    scenarioLabel.textContent = `${debugStageLabel(controller.battle.stage.id)} · ${scenario?.title ?? scenarioId}`;
    rosterLabel.textContent = `成長：${rosterOption.label}`;
    experienceLabel.textContent = perStageGrowth === undefined || growthBudget === undefined
      ? "每關成長：沿用成長檔案"
      : `每關成長：${perStageGrowth} · 本關成長預算：${growthBudget}`;
    stateLabel.textContent = `${controller.battle.stage.id} · ${controller.phase}`;
    const battleActive = controller.phase === "player";
    victory.disabled = !battleActive;
    defeat.disabled = !battleActive;
    complete.disabled = controller.phase === "nextStage";
  };
  const unsubscribe = controller.onChange(render);
  render();

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    panel.hidden = expanded;
  });
  victory.addEventListener("click", () => controller.forceVictorySetupForTest());
  defeat.addEventListener("click", () => controller.forceDefeatForTest());
  complete.addEventListener("click", () => { void controller.completeCurrentStageForDebug(); });

  window.__ANGEL2_DEBUG__ = {
    scenarioId,
    rosterSourceId: rosterSource.id,
    perStageGrowth,
    getState: () => controller.debugState(),
    completeCurrentStage: () => controller.completeCurrentStageForDebug(),
    prepareVictory: () => controller.forceVictorySetupForTest(),
    forceDefeat: () => controller.forceDefeatForTest(),
    openScenario: (id) => {
      if (isDebugScenarioId(id)) {
        location.assign(debugScenarioUrl(id, difficulty, rosterSource.id, perStageGrowth));
      }
    },
  };

  return () => {
    unsubscribe();
    toolbar.remove();
    document.body.classList.remove("debug-session-page");
    delete window.__ANGEL2_DEBUG__;
  };
}
