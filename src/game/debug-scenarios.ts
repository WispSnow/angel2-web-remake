import "../debug.css";
import { STAGE0, completeCampaignRoster } from "./content/stage0";
import { GameController } from "./controller";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "./save";
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
  isDebugScenarioId,
  type DebugScenarioId,
} from "./debug-scenario-catalog";

export {
  DEBUG_SCENARIOS,
  debugScenarioUrl,
  isDebugScenarioId,
  type DebugScenarioId,
} from "./debug-scenario-catalog";

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

function stage0Campaign(difficulty: Difficulty): CampaignState {
  return new GameController(difficulty).battle.campaignSnapshot();
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
    stageProgress: 0,
  };
}

async function createStage0Player(difficulty: Difficulty): Promise<GameController> {
  const source = new GameController(difficulty);
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

async function createStage1Prebattle(difficulty: Difficulty): Promise<GameController> {
  const controller = new GameController(difficulty);
  await controller.enterStage1({
    ...controller.battle.campaignSnapshot(),
    stageId: "stage-01",
  });
  return controller;
}

async function createStage1Deployment(difficulty: Difficulty): Promise<GameController> {
  const controller = new GameController(difficulty);
  await controller.enterStage1({
    ...controller.battle.campaignSnapshot(),
    stageId: "stage-01",
  }, "deployment", "調試場景：第 1 關正式部署。");
  return controller;
}

async function createStage1Player(difficulty: Difficulty): Promise<GameController> {
  const campaign = {
    ...stage0Campaign(difficulty),
    stageId: "stage-01" as const,
  };
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

async function createStage1Completed(difficulty: Difficulty): Promise<GameController> {
  const campaign = stage0Campaign(difficulty);
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2000-01-01T00:00:00.000Z",
    saveCount: 1,
    stageId: "stage-02",
    stageLabel: "下一關",
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

export async function createDebugScenarioController(
  id: DebugScenarioId,
  difficulty: Difficulty,
): Promise<GameController> {
  switch (id) {
    case "stage-00-prebattle":
      return new GameController(difficulty);
    case "stage-00-player":
      return createStage0Player(difficulty);
    case "stage-00-near-victory": {
      const controller = await createStage0Player(difficulty);
      controller.forceVictorySetupForTest();
      return controller;
    }
    case "stage-00-cleared":
    case "stage-01-prebattle":
      return createStage1Prebattle(difficulty);
    case "stage-01-deployment":
      return createStage1Deployment(difficulty);
    case "stage-01-player":
      return createStage1Player(difficulty);
    case "stage-01-magician": {
      const controller = await createStage1Player(difficulty);
      controller.forceClassActionSetupForTest("magician", false, "pursuing");
      return controller;
    }
    case "stage-01-dispel": {
      const controller = await createStage1Player(difficulty);
      controller.forceDispelSetupForTest();
      return controller;
    }
    case "stage-01-enemy-sister": {
      const controller = await createStage1Player(difficulty);
      controller.forceEnemySisterSetupForTest();
      return controller;
    }
    case "stage-01-near-victory": {
      const controller = await createStage1Player(difficulty);
      controller.forceVictorySetupForTest();
      return controller;
    }
    case "stage-01-cleared":
      return createStage1Completed(difficulty);
  }
}

export interface Angel2DeveloperApi {
  scenarioId: DebugScenarioId;
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
  const stateLabel = toolbar.querySelector<HTMLElement>("[data-debug-state]");
  const victory = toolbar.querySelector<HTMLButtonElement>("[data-debug-victory]");
  const complete = toolbar.querySelector<HTMLButtonElement>("[data-debug-complete]");
  const defeat = toolbar.querySelector<HTMLButtonElement>("[data-debug-defeat]");
  if (!panel || !toggle || !scenarioLabel || !stateLabel || !victory || !complete || !defeat) {
    throw new Error("debug toolbar controls are missing");
  }

  const scenario = DEBUG_SCENARIOS.find(({ id }) => id === scenarioId);
  scenarioLabel.textContent = scenario ? `${scenario.stageLabel} · ${scenario.title}` : scenarioId;

  const render = () => {
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
    getState: () => controller.debugState(),
    completeCurrentStage: () => controller.completeCurrentStageForDebug(),
    prepareVictory: () => controller.forceVictorySetupForTest(),
    forceDefeat: () => controller.forceDefeatForTest(),
    openScenario: (id) => {
      if (isDebugScenarioId(id)) location.assign(debugScenarioUrl(id, difficulty));
    },
  };

  return () => {
    unsubscribe();
    toolbar.remove();
    document.body.classList.remove("debug-session-page");
    delete window.__ANGEL2_DEBUG__;
  };
}
