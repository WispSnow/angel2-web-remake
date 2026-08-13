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

const STAGE13_BATTLE_EVENT_IDS = [
  "stage-13-prebattle-story",
  "stage-13-enter-deployment",
] as const;

const STAGE13_COMPLETED_EVENT_IDS = [
  ...STAGE13_BATTLE_EVENT_IDS,
  "stage-13-objective-reached",
  "stage-13-completed-route",
] as const;

const STAGE14_BATTLE_EVENT_IDS = [
  "stage-14-enter-deployment",
  "stage-14-opening-story",
] as const;

const STAGE14_COMPLETED_EVENT_IDS = [
  ...STAGE14_BATTLE_EVENT_IDS,
  "stage-14-objective-reached",
  "stage-14-completed-route",
] as const;

const STAGE15_BATTLE_EVENT_IDS = [
  "stage-15-enter-deployment",
  "stage-15-opening-story",
] as const;

const STAGE15_COMPLETED_EVENT_IDS = [
  ...STAGE15_BATTLE_EVENT_IDS,
  "stage-15-objective-reached",
  "stage-15-completed-route",
] as const;

const STAGE16_BATTLE_EVENT_IDS = [
  "stage-16-enter-deployment",
  "stage-16-opening-story",
] as const;

const STAGE16_COMPLETED_EVENT_IDS = [
  ...STAGE16_BATTLE_EVENT_IDS,
  "stage-16-objective-reached",
  "stage-16-completed-route",
] as const;

const STAGE17_BATTLE_EVENT_IDS = [
  "stage-17-enter-deployment",
  "stage-17-opening-story",
] as const;

const STAGE17_COMPLETED_EVENT_IDS = [
  ...STAGE17_BATTLE_EVENT_IDS,
  "stage-17-objective-reached",
  "stage-17-completed-route",
] as const;

const STAGE18_BATTLE_EVENT_IDS = [
  "stage-18-enter-deployment",
  "stage-18-opening-story",
] as const;

const STAGE18_COMPLETED_EVENT_IDS = [
  ...STAGE18_BATTLE_EVENT_IDS,
  "stage-18-objective-reached",
  "stage-18-completed-route",
] as const;

const STAGE19_BATTLE_EVENT_IDS = [
  "stage-19-enter-deployment",
  "stage-19-opening-story",
] as const;

const STAGE19_COMPLETED_EVENT_IDS = [
  ...STAGE19_BATTLE_EVENT_IDS,
  "stage-19-objective-reached",
  "stage-19-completed-route",
] as const;

const STAGE20_BATTLE_EVENT_IDS = [
  "stage-20-prebattle-story",
  "stage-20-enter-deployment",
  "stage-20-contact-story",
  "stage-20-guardian-move",
  "stage-20-guardian-story",
  "stage-20-tableau-departure",
  "stage-20-dragon-arrival",
  "stage-20-opening-story",
] as const;

const STAGE20_COMPLETED_EVENT_IDS = [
  ...STAGE20_BATTLE_EVENT_IDS,
  "stage-20-objective-reached",
  "stage-20-kins-arrival",
  "stage-20-kins-move",
  "stage-20-victory-1-story",
  "stage-20-victory-2-story",
  "stage-20-victory-3-story",
  "stage-20-victory-story",
  "stage-20-completed-route",
] as const;

const STAGE21_COMPLETED_EVENT_IDS = [
  "stage-21-prebattle-story",
  "stage-21-scouts-arrive",
  "stage-21-scouting-story",
  "stage-21-nia-move",
  "stage-21-himi-move",
  "stage-21-gadirath-move",
  "stage-21-sulanda-move",
  "stage-21-discovery-story",
  "stage-21-completed-route",
] as const;

const STAGE22_BATTLE_EVENT_IDS = [
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
] as const;

const STAGE22_COMPLETED_EVENT_IDS = [
  ...STAGE22_BATTLE_EVENT_IDS,
  "stage-22-objective-reached",
  "stage-22-postbattle-story",
  "stage-22-completed-route",
] as const;

const STAGE23_BATTLE_EVENT_IDS = [
  "stage-23-enter-deployment",
  "stage-23-opening-story",
] as const;

const STAGE23_COMPLETED_EVENT_IDS = [
  ...STAGE23_BATTLE_EVENT_IDS,
  "stage-23-objective-reached",
  "stage-23-completed-route",
] as const;

const STAGE24_BATTLE_EVENT_IDS = [
  "stage-24-enter-deployment",
  "stage-24-opening-story",
] as const;

const STAGE24_COMPLETED_EVENT_IDS = [
  ...STAGE24_BATTLE_EVENT_IDS,
  "stage-24-objective-reached",
  "stage-24-victory-story",
  "stage-24-completed-route",
] as const;

const STAGE26_BATTLE_EVENT_IDS = [
  "stage-26-enter-deployment",
  "stage-26-opening-story",
] as const;

const STAGE26_COMPLETED_EVENT_IDS = [
  ...STAGE26_BATTLE_EVENT_IDS,
  "stage-26-objective-reached",
  "stage-26-victory-story",
  "stage-26-completed-route",
] as const;

const STAGE27_BATTLE_EVENT_IDS = [
  "stage-27-enter-deployment",
  "stage-27-opening-story",
] as const;

const STAGE27_COMPLETED_EVENT_IDS = [
  ...STAGE27_BATTLE_EVENT_IDS,
  "stage-27-objective-reached",
  "stage-27-victory-story",
  "stage-27-completed-route",
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

async function createStage13Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage("stage-13", debugCampaign(context, "stage-13"));
  return controller;
}

async function createStage13Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-13",
    debugCampaign(context, "stage-13"),
    { preparation: true, statusMessage: "調試場景：龍塔外部署。" },
  );
  return controller;
}

async function stage13FullDeployment() {
  const { STAGE13_DEFINITION } = await import("./content/stage13");
  return {
    placements: [
      ...STAGE13_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE13_DEFINITION.deployment.optionalSlots.slice(0, 11).map((slot, index) => ({
        slot, position: { ...STAGE13_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage13Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-13");
  const { Stage13Battle } = await import("./simulation/stage13-battle");
  const battle = new Stage13Battle(campaign, await stage13FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 13 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-13"),
    stageLabel: "龍塔外",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE13_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：龍塔外十二人突擊隊玩家回合。";
  return controller;
}

async function createStage13Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-13");
  const { createStage13DeploymentRoster } = await import("./simulation/stage13-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-14",
    stageLabel: "龍塔第一層",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage13DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE13_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage14Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-14",
    debugCampaign(context, "stage-14"),
    { preparation: true, statusMessage: "調試場景：龍塔第一層部署。" },
  );
  return controller;
}

async function stage14FullDeployment() {
  const { STAGE14_DEFINITION } = await import("./content/stage14");
  return {
    placements: [
      ...STAGE14_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE14_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
        slot, position: { ...STAGE14_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage14Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage14Deployment(context);
  controller.completeDeployment(await stage14FullDeployment());
  return controller;
}

async function createStage14Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-14");
  const { Stage14Battle } = await import("./simulation/stage14-battle");
  const battle = new Stage14Battle(campaign, await stage14FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 14 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-14"),
    stageLabel: "龍塔第一層",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE14_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：龍塔第一層十人攻略隊玩家回合。";
  return controller;
}

async function createStage14Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-14");
  const { createStage14DeploymentRoster } = await import("./simulation/stage14-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-15",
    stageLabel: "龍塔第二層",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage14DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE14_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage15Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-15",
    debugCampaign(context, "stage-15"),
    { preparation: true, statusMessage: "調試場景：龍塔第二層部署。" },
  );
  return controller;
}

async function stage15FullDeployment() {
  const { STAGE15_DEFINITION } = await import("./content/stage15");
  return {
    placements: [
      ...STAGE15_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE15_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
        slot, position: { ...STAGE15_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage15Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage15Deployment(context);
  controller.completeDeployment(await stage15FullDeployment());
  return controller;
}

async function createStage15Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-15");
  const { Stage15Battle } = await import("./simulation/stage15-battle");
  const battle = new Stage15Battle(campaign, await stage15FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 15 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-15"),
    stageLabel: "龍塔第二層",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE15_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：龍塔第二層十人攻略隊玩家回合。";
  return controller;
}

async function createStage15Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-15");
  const { createStage15DeploymentRoster } = await import("./simulation/stage15-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-16",
    stageLabel: "龍塔第三層",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage15DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE15_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage16Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-16",
    debugCampaign(context, "stage-16"),
    { preparation: true, statusMessage: "調試場景：龍塔第三層部署。" },
  );
  return controller;
}

async function stage16FullDeployment() {
  const { STAGE16_DEFINITION } = await import("./content/stage16");
  return {
    placements: [
      ...STAGE16_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE16_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
        slot, position: { ...STAGE16_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage16Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage16Deployment(context);
  controller.completeDeployment(await stage16FullDeployment());
  return controller;
}

async function createStage16Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-16");
  const { Stage16Battle } = await import("./simulation/stage16-battle");
  const battle = new Stage16Battle(campaign, await stage16FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 16 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-16"),
    stageLabel: "龍塔第三層",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE16_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：龍塔第三層十人攻略隊玩家回合。";
  return controller;
}

async function createStage16Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-16");
  const { createStage16DeploymentRoster } = await import("./simulation/stage16-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-17",
    stageLabel: "龍塔第四層",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage16DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE16_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage17Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-17",
    debugCampaign(context, "stage-17"),
    { preparation: true, statusMessage: "調試場景：龍塔第四層部署。" },
  );
  return controller;
}

async function stage17FullDeployment() {
  const { STAGE17_DEFINITION } = await import("./content/stage17");
  return {
    placements: [
      ...STAGE17_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE17_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
        slot, position: { ...STAGE17_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage17Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage17Deployment(context);
  controller.completeDeployment(await stage17FullDeployment());
  return controller;
}

async function createStage17Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-17");
  const { Stage17Battle } = await import("./simulation/stage17-battle");
  const battle = new Stage17Battle(campaign, await stage17FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 17 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-17"),
    stageLabel: "龍塔第四層",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE17_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：龍塔第四層十人攻略隊玩家回合。";
  return controller;
}

async function createStage17Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-17");
  const { createStage17DeploymentRoster } = await import("./simulation/stage17-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-18",
    stageLabel: "龍塔第五層",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage17DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE17_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage18Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-18",
    debugCampaign(context, "stage-18"),
    { preparation: true, statusMessage: "調試場景：龍塔第五層部署。" },
  );
  return controller;
}

async function stage18FullDeployment() {
  const { STAGE18_DEFINITION } = await import("./content/stage18");
  return {
    placements: [
      ...STAGE18_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE18_DEFINITION.deployment.optionalSlots.slice(0, 7).map((slot, index) => ({
        slot, position: { ...STAGE18_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage18Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage18Deployment(context);
  controller.completeDeployment(await stage18FullDeployment());
  return controller;
}

async function createStage18Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-18");
  const { Stage18Battle } = await import("./simulation/stage18-battle");
  const battle = new Stage18Battle(campaign, await stage18FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 18 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-18"),
    stageLabel: "龍塔第五層",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE18_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：龍塔第五層八人攻略隊玩家回合。";
  return controller;
}

async function createStage18Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-18");
  const { createStage18DeploymentRoster } = await import("./simulation/stage18-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-19",
    stageLabel: "龍塔第六層",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage18DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE18_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage19Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-19",
    debugCampaign(context, "stage-19"),
    { preparation: true, statusMessage: "調試場景：龍塔第六層部署。" },
  );
  return controller;
}

async function stage19FullDeployment() {
  const { STAGE19_DEFINITION } = await import("./content/stage19");
  return {
    placements: [
      ...STAGE19_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE19_DEFINITION.deployment.optionalSlots.slice(0, 9).map((slot, index) => ({
        slot, position: { ...STAGE19_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage19Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage19Deployment(context);
  controller.completeDeployment(await stage19FullDeployment());
  return controller;
}

async function createStage19Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-19");
  const { Stage19Battle } = await import("./simulation/stage19-battle");
  const battle = new Stage19Battle(campaign, await stage19FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 19 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-19"),
    stageLabel: "龍塔第六層",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE19_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：龍塔第六層十人攻略隊玩家回合。";
  return controller;
}

async function createStage19Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-19");
  const { createStage19DeploymentRoster } = await import("./simulation/stage19-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-20",
    stageLabel: "龍塔頂部",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage19DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE19_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage20Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage("stage-20", debugCampaign(context, "stage-20"));
  return controller;
}

async function createStage20Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-20",
    debugCampaign(context, "stage-20"),
    { preparation: true, statusMessage: "調試場景：龍塔頂部部署。" },
  );
  return controller;
}

async function stage20FullDeployment() {
  const { STAGE20_DEFINITION } = await import("./content/stage20");
  return {
    placements: [
      ...STAGE20_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE20_DEFINITION.deployment.optionalSlots.slice(0, 14).map((slot, index) => ({
        slot, position: { ...STAGE20_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage20Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage20Deployment(context);
  controller.completeDeployment(await stage20FullDeployment());
  return controller;
}

async function createStage20Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-20");
  const [{ Stage20Battle }, { STAGE20_SEMANTIC_DRAGON }, { createFixedStageEnemy }] = await Promise.all([
    import("./simulation/stage20-battle"),
    import("./content/stage20"),
    import("./simulation/fixed-stage-battle"),
  ]);
  const battle = new Stage20Battle(campaign, await stage20FullDeployment());
  const guardian = battle.unit("1:32");
  if (guardian) {
    guardian.x = 28;
    guardian.y = 17;
  }
  battle.removeStoryUnits(battle.units.filter(({ side }) => side === 2).map(({ side, slot }) => ({ side, slot })));
  const dragon = createFixedStageEnemy({
    slot: STAGE20_SEMANTIC_DRAGON.slot,
    position: STAGE20_SEMANTIC_DRAGON.position,
    classId: STAGE20_SEMANTIC_DRAGON.classId,
    name: STAGE20_SEMANTIC_DRAGON.name,
    portrait: STAGE20_SEMANTIC_DRAGON.portrait,
    aiBehavior: STAGE20_SEMANTIC_DRAGON.aiBehavior,
  }, campaign.difficulty);
  battle.appendStoryUnits([dragon], [{ sourceUnitId: "2:55", derivedUnitId: dragon.id }]);
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 20 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-20"),
    stageLabel: "龍塔頂部",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE20_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：龍塔頂部十七人攻略隊玩家回合。";
  return controller;
}

async function createStage20Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-20");
  const { createStage20DeploymentRoster } = await import("./simulation/stage20-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-21",
    stageLabel: "焦土森林村莊外",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage20DeploymentRoster(campaign)
      .filter(({ slot }) => slot !== 32)
      .map((unit) => ({
        slot: unit.slot,
        classId: unit.classId,
        experience: unit.experience,
        life: unit.life,
      }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE20_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage21Prebattle(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage("stage-21", debugCampaign(context, "stage-21"));
  return controller;
}

async function createStage21Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-21");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-22",
    stageLabel: "焦土森林村莊中",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(campaign.roster),
    stageProgress: 1000,
    consumedEventIds: [...STAGE21_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage22Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-22",
    debugCampaign(context, "stage-22"),
    { preparation: true, statusMessage: "調試場景：焦土森林村莊部署。" },
  );
  return controller;
}

async function stage22FullDeployment() {
  const { STAGE22_DEFINITION } = await import("./content/stage22");
  return {
    placements: [
      ...STAGE22_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE22_DEFINITION.deployment.optionalSlots.slice(0, 18).map((slot, index) => ({
        slot, position: { ...STAGE22_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage22Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage22Deployment(context);
  controller.completeDeployment(await stage22FullDeployment());
  return controller;
}

async function createStage22Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-22");
  const [{ Stage22Battle }, { STAGE22_SEMANTIC_ENEMIES }, { createFixedStageEnemy }] = await Promise.all([
    import("./simulation/stage22-battle"),
    import("./content/stage22"),
    import("./simulation/fixed-stage-battle"),
  ]);
  const battle = new Stage22Battle(campaign, await stage22FullDeployment());
  battle.appendStoryUnits(STAGE22_SEMANTIC_ENEMIES.map((enemy) => createFixedStageEnemy(
    enemy,
    campaign.difficulty,
  )));
  const dragon = battle.unit("2:28");
  if (!dragon) throw new Error("stage 22 debug scenario is missing the Dragon");
  // The round-one handler returns immediately after the Dragon-focused SAY/79
  // and memory-only ambush writes, so the real player handoff stays here.
  battle.focusId = dragon.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-22"),
    stageLabel: "焦土森林村莊中",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE22_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: dragon.x, y: dragon.y },
      cameraOrigin: { x: 18, y: 21 },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：十九人攻略隊迎戰妖龍與五名魔祭師。";
  return controller;
}

async function createStage22Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-22");
  const { createStage22DeploymentRoster } = await import("./simulation/stage22-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-23",
    stageLabel: "死亡之谷中",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage22DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE22_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage23Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-23",
    debugCampaign(context, "stage-23"),
    { preparation: true, statusMessage: "調試場景：死亡之谷部署。" },
  );
  return controller;
}

async function stage23FullDeployment() {
  const { STAGE23_DEFINITION } = await import("./content/stage23");
  return {
    placements: [
      ...STAGE23_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE23_DEFINITION.deployment.optionalSlots.slice(0, 14).map((slot, index) => ({
        slot, position: { ...STAGE23_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage23Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage23Deployment(context);
  controller.completeDeployment(await stage23FullDeployment());
  return controller;
}

async function createStage23Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-23");
  const { Stage23Battle } = await import("./simulation/stage23-battle");
  const battle = new Stage23Battle(campaign, await stage23FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 23 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-23"),
    stageLabel: "死亡之谷中",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE23_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：十五人攻略隊突圍死亡之谷；二十一名守軍仍在場。";
  return controller;
}

async function createStage23Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-23");
  const { createStage23DeploymentRoster } = await import("./simulation/stage23-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-24",
    stageLabel: "死亡之谷城堡前",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage23DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE23_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage24Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-24",
    debugCampaign(context, "stage-24"),
    { preparation: true, statusMessage: "調試場景：死亡之谷城堡前部署。" },
  );
  return controller;
}

async function stage24FullDeployment() {
  const { STAGE24_DEFINITION } = await import("./content/stage24");
  return {
    placements: [
      ...STAGE24_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE24_DEFINITION.deployment.optionalSlots.slice(0, 14).map((slot, index) => ({
        slot, position: { ...STAGE24_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage24Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage24Deployment(context);
  controller.completeDeployment(await stage24FullDeployment());
  return controller;
}

async function createStage24Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-24");
  const { Stage24Battle } = await import("./simulation/stage24-battle");
  const battle = new Stage24Battle(campaign, await stage24FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 24 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-24"),
    stageLabel: "死亡之谷城堡前",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE24_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：十五人攻略隊進攻死亡之谷城堡；二十二名守軍仍在場。";
  return controller;
}

async function createStage24Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-24");
  const { createStage24DeploymentRoster } = await import("./simulation/stage24-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-26",
    stageLabel: "遭遇碧娜維姬",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage24DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE24_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage26Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-26",
    debugCampaign(context, "stage-26"),
    { preparation: true, statusMessage: "調試場景：碧娜維姬戰部署。" },
  );
  return controller;
}

async function stage26FullDeployment() {
  const { STAGE26_DEFINITION } = await import("./content/stage26");
  return {
    placements: [
      ...STAGE26_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE26_DEFINITION.deployment.optionalSlots.slice(0, 18).map((slot, index) => ({
        slot, position: { ...STAGE26_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage26Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage26Deployment(context);
  controller.completeDeployment(await stage26FullDeployment());
  return controller;
}

async function createStage26Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-26");
  const { Stage26Battle } = await import("./simulation/stage26-battle");
  const battle = new Stage26Battle(campaign, await stage26FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 26 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-26"),
    stageLabel: "遭遇碧娜維姬",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE26_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：二十二人討伐隊迎戰碧娜維姬與七名魔法祭司。";
  return controller;
}

async function createStage26Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-26");
  const { createStage26DeploymentRoster } = await import("./simulation/stage26-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-27",
    stageLabel: "趕回瓦爾克麗城",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage26DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE26_COMPLETED_EVENT_IDS],
  };
  return GameController.fromSave(save, 1);
}

async function createStage27Deployment(context: DebugScenarioContext): Promise<GameController> {
  const controller = new GameController(context.difficulty);
  await controller.enterStage(
    "stage-27",
    debugCampaign(context, "stage-27"),
    { preparation: true, statusMessage: "調試場景：瓦爾克麗回城戰部署。" },
  );
  return controller;
}

async function stage27FullDeployment() {
  const { STAGE27_DEFINITION } = await import("./content/stage27");
  return {
    placements: [
      ...STAGE27_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot, position: { ...position }, fixed: true,
      })),
      ...STAGE27_DEFINITION.deployment.optionalSlots.slice(0, 20).map((slot, index) => ({
        slot, position: { ...STAGE27_DEFINITION.deployment.openCells[index] }, fixed: false,
      })),
    ],
  };
}

async function createStage27Opening(context: DebugScenarioContext): Promise<GameController> {
  const controller = await createStage27Deployment(context);
  controller.completeDeployment(await stage27FullDeployment());
  return controller;
}

async function createStage27Player(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-27");
  const { Stage27Battle } = await import("./simulation/stage27-battle");
  const battle = new Stage27Battle(campaign, await stage27FullDeployment());
  const nia = battle.unit("1:0");
  if (!nia) throw new Error("stage 27 debug scenario is missing Nia");
  battle.focusId = nia.id;
  const battleCampaign = battle.campaignSnapshot();
  const save: BattleSaveData = {
    ...battleSaveBase(battleCampaign, "stage-27"),
    stageLabel: "趕回瓦爾克麗城",
    roster: battleCampaign.roster,
    consumedEventIds: [...STAGE27_BATTLE_EVENT_IDS],
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      cursor: { x: nia.x, y: nia.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
  const controller = await GameController.fromSave(save, 1);
  controller.statusMessage = "調試場景：回城隊與七名自動城防友軍迎戰五名叛軍。";
  return controller;
}

async function createStage27Completed(context: DebugScenarioContext): Promise<GameController> {
  const campaign = debugCampaign(context, "stage-27");
  const { createStage27DeploymentRoster } = await import("./simulation/stage27-battle");
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-28",
    stageLabel: "保衛瓦爾克麗城",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: completeCampaignRoster(createStage27DeploymentRoster(campaign).map((unit) => ({
      slot: unit.slot,
      classId: unit.classId,
      experience: unit.experience,
      life: unit.life,
    }))),
    stageProgress: 1000,
    consumedEventIds: [...STAGE27_COMPLETED_EVENT_IDS],
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
  "stage-03-himi-defeat": withSetup(createStage3Player, (controller) => {
    controller.forceDefeatForTest(0);
  }),
  "stage-03-daisy-defeat": withSetup(createStage3Player, (controller) => {
    controller.forceDefeatForTest(1);
  }),
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
  "stage-13-prebattle": createStage13Prebattle,
  "stage-13-deployment": createStage13Deployment,
  "stage-13-player": createStage13Player,
  "stage-13-near-victory": withSetup(createStage13Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const marsiel = controller.battle.unit("2:24");
    if (!nia || !marsiel) return;
    nia.x = 18;
    nia.y = 17;
    nia.experience = 0;
    nia.life = controller.battle.statsFor(nia).maxLife;
    nia.acted = false;
    marsiel.x = 19;
    marsiel.y = 17;
    marsiel.life = 1;
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 14, y: 14 };
    controller.statusMessage = "調試場景：瑪西爾只剩 1 點生命；其餘八名守軍仍在場。";
  }),
  "stage-13-near-defeat": withSetup(createStage13Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:45");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵方騎兵位於相鄰格。";
  }),
  "stage-13-victory-ready": withSetup(createStage13Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-13-cleared": createStage13Completed,
  "stage-14-deployment": createStage14Deployment,
  "stage-14-opening": createStage14Opening,
  "stage-14-player": createStage14Player,
  "stage-14-near-victory": withSetup(createStage14Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const fang = controller.battle.unit("2:8");
    if (!nia || !fang) return;
    nia.x = 24;
    nia.y = 13;
    nia.experience = 0;
    nia.life = controller.battle.statsFor(nia).maxLife;
    nia.acted = false;
    fang.x = 25;
    fang.y = 13;
    fang.life = 1;
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 20, y: 10 };
    controller.statusMessage = "調試場景：芳只剩 1 點生命；其餘六名守軍仍在場。";
  }),
  "stage-14-near-defeat": withSetup(createStage14Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:49");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵方神劍戰士位於相鄰格。";
  }),
  "stage-14-victory-ready": withSetup(createStage14Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-14-cleared": createStage14Completed,
  "stage-15-deployment": createStage15Deployment,
  "stage-15-opening": createStage15Opening,
  "stage-15-player": createStage15Player,
  "stage-15-near-victory": withSetup(createStage15Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const lan = controller.battle.unit("2:9");
    if (!nia || !lan) return;
    nia.x = 24;
    nia.y = 28;
    nia.experience = 0;
    nia.life = controller.battle.statsFor(nia).maxLife;
    nia.acted = false;
    lan.x = 25;
    lan.y = 28;
    lan.life = 1;
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 20, y: 25 };
    controller.statusMessage = "調試場景：蘭只剩 1 點生命；其餘九名守軍仍在場。";
  }),
  "stage-15-near-defeat": withSetup(createStage15Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:52");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵方巨斧戰士位於相鄰格。";
  }),
  "stage-15-victory-ready": withSetup(createStage15Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-15-cleared": createStage15Completed,
  "stage-16-deployment": createStage16Deployment,
  "stage-16-opening": createStage16Opening,
  "stage-16-player": createStage16Player,
  "stage-16-near-victory": withSetup(createStage16Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const sha = controller.battle.unit("2:10");
    if (!nia || !sha) return;
    nia.x = 24;
    nia.y = 28;
    nia.experience = 0;
    nia.life = controller.battle.statsFor(nia).maxLife;
    nia.acted = false;
    sha.x = 25;
    sha.y = 28;
    sha.life = 1;
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 20, y: 25 };
    controller.statusMessage = "調試場景：莎只剩 1 點生命；其餘十二名守軍仍在場。";
  }),
  "stage-16-near-defeat": withSetup(createStage16Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:43");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵方神劍戰士位於相鄰格。";
  }),
  "stage-16-victory-ready": withSetup(createStage16Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-16-cleared": createStage16Completed,
  "stage-17-deployment": createStage17Deployment,
  "stage-17-opening": createStage17Opening,
  "stage-17-player": createStage17Player,
  "stage-17-near-victory": withSetup(createStage17Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const qian = controller.battle.unit("2:11");
    if (!nia || !qian) return;
    nia.x = 24;
    nia.y = 28;
    nia.experience = 0;
    nia.life = controller.battle.statsFor(nia).maxLife;
    nia.acted = false;
    qian.x = 25;
    qian.y = 28;
    qian.life = 1;
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 20, y: 25 };
    controller.statusMessage = "調試場景：倩只剩 1 點生命；其餘十一名守軍仍在場。";
  }),
  "stage-17-near-defeat": withSetup(createStage17Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:51");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵方鎧甲戰士位於相鄰格。";
  }),
  "stage-17-victory-ready": withSetup(createStage17Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-17-cleared": createStage17Completed,
  "stage-18-deployment": createStage18Deployment,
  "stage-18-opening": createStage18Opening,
  "stage-18-player": createStage18Player,
  "stage-18-near-victory": withSetup(createStage18Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const li = controller.battle.unit("2:12");
    if (!nia || !li) return;
    nia.x = 24;
    nia.y = 30;
    nia.experience = 0;
    nia.life = controller.battle.statsFor(nia).maxLife;
    nia.acted = false;
    li.x = 25;
    li.y = 30;
    li.life = 1;
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 20, y: 27 };
    controller.statusMessage = "調試場景：麗只剩 1 點生命；其餘十五名守軍仍在場。";
  }),
  "stage-18-near-defeat": withSetup(createStage18Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:46");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵方神劍戰士位於相鄰格。";
  }),
  "stage-18-victory-ready": withSetup(createStage18Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-18-cleared": createStage18Completed,
  "stage-19-deployment": createStage19Deployment,
  "stage-19-opening": createStage19Opening,
  "stage-19-player": createStage19Player,
  "stage-19-near-victory": withSetup(createStage19Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const ai = controller.battle.unit("2:13");
    if (!nia || !ai) return;
    nia.x = 24;
    nia.y = 30;
    nia.experience = 0;
    nia.life = controller.battle.statsFor(nia).maxLife;
    nia.acted = false;
    ai.x = 25;
    ai.y = 30;
    ai.life = 1;
    for (const ally of controller.battle.units.filter(({ side, id }) => side === 1 && id !== nia.id)) {
      ally.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 20, y: 27 };
    controller.statusMessage = "調試場景：愛只剩 1 點生命；其餘二十名守軍仍在場。";
  }),
  "stage-19-near-defeat": withSetup(createStage19Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:52");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，敵方神劍戰士位於相鄰格。";
  }),
  "stage-19-victory-ready": withSetup(createStage19Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-19-cleared": createStage19Completed,
  "stage-20-prebattle": createStage20Prebattle,
  "stage-20-deployment": createStage20Deployment,
  "stage-20-opening": createStage20Opening,
  "stage-20-player": createStage20Player,
  "stage-20-near-victory": withSetup(createStage20Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const dragon = controller.battle.unit("2:28");
    if (!nia || !dragon) return;
    nia.x = 28;
    nia.y = 16;
    nia.acted = false;
    dragon.x = 29;
    dragon.y = 16;
    dragon.life = 1;
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 25, y: 14 };
    controller.statusMessage = "調試場景：妖龍只剩 1 點生命，擊退後進入琴斯勝利演出。";
  }),
  "stage-20-near-defeat": withSetup(createStage20Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const dragon = controller.battle.unit("2:28");
    if (!nia || !dragon) return;
    nia.life = 1;
    dragon.x = 29;
    dragon.y = 16;
    nia.x = 29;
    nia.y = 18;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，位於妖龍 WD 範圍內。";
  }),
  "stage-20-victory-ready": withSetup(createStage20Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-20-cleared": createStage20Completed,
  "stage-21-prebattle": createStage21Prebattle,
  "stage-21-cleared": createStage21Completed,
  "stage-22-deployment": createStage22Deployment,
  "stage-22-opening": createStage22Opening,
  "stage-22-player": createStage22Player,
  "stage-22-near-victory": withSetup(createStage22Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const dragon = controller.battle.unit("2:28");
    if (!nia || !dragon) return;
    nia.x = 22;
    nia.y = 25;
    nia.acted = false;
    dragon.x = 22;
    dragon.y = 24;
    dragon.life = 1;
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 18, y: 21 };
    controller.statusMessage = "調試場景：妖龍只剩 1 點生命，擊敗後直接進入普通勝利流程。";
  }),
  "stage-22-near-defeat": withSetup(createStage22Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const gadirath = controller.battle.unit("2:2");
    if (!nia || !gadirath) return;
    nia.life = 1;
    gadirath.x = nia.x + 1;
    gadirath.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，葛蒂拉斯位於相鄰格。";
  }),
  "stage-22-victory-ready": withSetup(createStage22Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-22-cleared": createStage22Completed,
  "stage-23-deployment": createStage23Deployment,
  "stage-23-opening": createStage23Opening,
  "stage-23-player": createStage23Player,
  "stage-23-near-victory": withSetup(createStage23Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    if (!nia) return;
    // (24,10) is a winning cell but is occupied by flying dragon knight 2:36.
    // This open pair keeps the fixture literally one orthogonal step away.
    nia.x = 25;
    nia.y = 10;
    nia.acted = false;
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 20, y: 8 };
    controller.statusMessage = "調試場景：妮雅上移一格即可進入紫紅輪廓的頂端目標區，守軍仍全員在場。";
  }),
  "stage-23-near-defeat": withSetup(createStage23Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:30");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，半龍戰士位於相鄰格。";
  }),
  "stage-23-victory-ready": withSetup(createStage23Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-23-cleared": createStage23Completed,
  "stage-24-deployment": createStage24Deployment,
  "stage-24-opening": createStage24Opening,
  "stage-24-player": createStage24Player,
  "stage-24-near-victory": withSetup(createStage24Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    if (!nia) return;
    nia.x = 31;
    nia.y = 20;
    nia.acted = false;
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 23, y: 18 };
    controller.statusMessage = "調試場景：妮雅左移一格即可進入紫紅輪廓的城堡目標區，守軍仍全員在場。";
  }),
  "stage-24-near-defeat": withSetup(createStage24Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:31");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，獸骨騎士位於相鄰格。";
  }),
  "stage-24-victory-ready": withSetup(createStage24Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-24-cleared": createStage24Completed,
  "stage-26-deployment": createStage26Deployment,
  "stage-26-opening": createStage26Opening,
  "stage-26-player": createStage26Player,
  "stage-26-enemy-tail": withSetup(createStage26Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    if (!nia) return;
    nia.x = 22;
    nia.y = 20;
    nia.acted = false;
    for (const enemy of controller.battle.units.filter(({ side }) => side === 2)) {
      enemy.acted = true;
    }
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 18, y: 16 };
    controller.statusMessage = "調試場景：結束回合後，妮雅將被列推移效果連續向下推移兩次。";
  }),
  "stage-26-near-victory": withSetup(createStage26Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const binaweiji = controller.battle.unit("2:1");
    if (!nia || !binaweiji) return;
    nia.x = 22;
    nia.y = 17;
    nia.experience = 0;
    nia.acted = false;
    binaweiji.x = 22;
    binaweiji.y = 16;
    binaweiji.life = 1;
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 18, y: 13 };
    controller.statusMessage = "調試場景：碧娜維姬只剩 1 點生命，位於妮雅相鄰格。";
  }),
  "stage-26-near-defeat": withSetup(createStage26Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:40");
    if (!nia || !enemy) return;
    nia.life = 1;
    enemy.x = nia.x + 1;
    enemy.y = nia.y;
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，魔法祭司位於相鄰格。";
  }),
  "stage-26-victory-ready": withSetup(createStage26Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-26-cleared": createStage26Completed,
  "stage-27-deployment": createStage27Deployment,
  "stage-27-opening": createStage27Opening,
  "stage-27-player": createStage27Player,
  "stage-27-ally-auto": withSetup(createStage27Player, (controller) => {
    for (const unit of controller.battle.units) {
      if (controller.battle.forceForUnit(unit.id)?.control === "player") unit.acted = true;
    }
    controller.statusMessage = "調試場景：玩家隊已全部行動，接著由七名瓦爾克麗城防友軍自動行動。";
  }),
  "stage-27-near-victory": withSetup(createStage27Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    if (!nia) return;
    nia.x = 20;
    nia.y = 15;
    nia.acted = false;
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 15, y: 11 };
    controller.statusMessage = "調試場景：妮雅上移一格即可進入紫紅輪廓的瓦爾克麗城區，五名叛軍仍在場。";
  }),
  "stage-27-near-defeat": withSetup(createStage27Player, (controller) => {
    const nia = controller.battle.unit("1:0");
    const enemy = controller.battle.unit("2:40");
    if (!nia || !enemy) return;
    nia.x = 30;
    nia.y = 30;
    nia.life = 1;
    enemy.x = 31;
    enemy.y = 30;
    controller.battle.focusId = nia.id;
    controller.cursor = { x: nia.x, y: nia.y };
    controller.cameraOrigin = { x: 25, y: 27 };
    controller.statusMessage = "調試場景：妮雅只剩 1 點生命，魔劍戰士位於相鄰格。";
  }),
  "stage-27-victory-ready": withSetup(createStage27Player, (controller) => {
    controller.forceVictoryForTest();
  }),
  "stage-27-cleared": createStage27Completed,
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
