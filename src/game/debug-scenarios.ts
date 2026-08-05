import "../debug.css";
import { STAGE0, completeCampaignRoster } from "./content/stage0";
import { GameController } from "./controller";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "./save";
import {
  createDebugCampaignState,
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

export interface DebugScenarioContext {
  difficulty: Difficulty;
  rosterSource: DebugRosterSource;
  storage: Pick<Storage, "getItem">;
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
} as const satisfies Record<DebugScenarioId, DebugScenarioFactory>;

export interface Angel2DeveloperApi {
  scenarioId: DebugScenarioId;
  rosterSourceId: string;
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
  const stateLabel = toolbar.querySelector<HTMLElement>("[data-debug-state]");
  const victory = toolbar.querySelector<HTMLButtonElement>("[data-debug-victory]");
  const complete = toolbar.querySelector<HTMLButtonElement>("[data-debug-complete]");
  const defeat = toolbar.querySelector<HTMLButtonElement>("[data-debug-defeat]");
  if (
    !panel || !toggle || !scenarioLabel || !rosterLabel || !stateLabel
    || !victory || !complete || !defeat
  ) {
    throw new Error("debug toolbar controls are missing");
  }

  const scenario = DEBUG_SCENARIOS.find(({ id }) => id === scenarioId);
  const rosterOption = debugRosterSourceOption(rosterSource, storage);

  const render = () => {
    scenarioLabel.textContent = `${debugStageLabel(controller.battle.stage.id)} · ${scenario?.title ?? scenarioId}`;
    rosterLabel.textContent = `成長：${rosterOption.label}`;
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
    getState: () => controller.debugState(),
    completeCurrentStage: () => controller.completeCurrentStageForDebug(),
    prepareVictory: () => controller.forceVictorySetupForTest(),
    forceDefeat: () => controller.forceDefeatForTest(),
    openScenario: (id) => {
      if (isDebugScenarioId(id)) {
        location.assign(debugScenarioUrl(id, difficulty, rosterSource.id));
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
