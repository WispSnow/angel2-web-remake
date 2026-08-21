import "./styles.css";
import "./stage49-ending.css";
import "./resource-loading.css";
import { GameController, exposeDebugApi, type StageAssetGate } from "./game/controller";
import { startPhaser } from "./game/phaser/BattleScene";
import { mountUi } from "./game/ui";
import { AudioManager } from "./game/audio";
import { mountStartup, type StartupSelection } from "./game/startup";
import { mountStage49EndingUi } from "./game/stage49-ending-ui";
import { mountCreditsUi } from "./game/credits-ui";
import "./credits.css";
import { ResourcePackLoader } from "./game/resource-loader";
import { classPresentationAssetUrls } from "./game/content/class-presentation-assets";
import { createStage0Units } from "./game/content/stage0";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");
const releaseBuild = import.meta.env.MODE === "release";
const resourceLoader = new ResourcePackLoader();
const stageAssetGate: StageAssetGate = (stageId, requirements) =>
  resourceLoader.ensureStage(
    stageId,
    `讀取 ${stageId} 關卡資料`,
    classPresentationAssetUrls(requirements),
  );

const controllerAssetRequirements = (controller: GameController) => ({
  allyClassIds: controller.battle.units
    .filter(({ side }) => side === 1)
    .map(({ classId }) => classId),
  encounterClassIds: controller.battle.units.map(({ classId }) => classId),
  nativeStage: controller.battle.stage.nativeStage,
});
const stage0Units = createStage0Units();
const stage0PresentationAssets = classPresentationAssetUrls({
  allyClassIds: stage0Units.filter(({ side }) => side === 1).map(({ classId }) => classId),
  encounterClassIds: stage0Units.map(({ classId }) => classId),
  nativeStage: 0,
});

const mountController = (
  controller: GameController,
  userActivated: boolean,
  stagedResources?: ResourcePackLoader,
) => {
  const audio = new AudioManager(controller, root, userActivated);
  let surfaceKey = "";
  let surfaceGeneration = 0;
  let destroySurface: () => void = () => undefined;
  let observedStageId = controller.battle.stage.id;

  const mountBattleSurface = () => {
    const destroyUi = mountUi(root, controller, audio);
    const game = startPhaser(controller);
    return () => {
      destroyUi();
      game.destroy(true);
    };
  };

  const mountDeploymentSurface = async () => {
    const [
      { DeploymentSession },
      { mountDeploymentUi },
      { startDeploymentPhaser },
      { finishDeployment },
      { configureGameScaling },
    ] = await Promise.all([
      import("./game/deployment-session"),
      import("./game/deployment-ui"),
      import("./game/phaser/DeploymentScene"),
      import("./game/simulation/deployment"),
      import("./game/scaling"),
      import("./deployment-lab.css"),
    ]);
    root.innerHTML = `
      <div class="page-shell">
        <div class="game-stage">
          <div class="game-viewport deployment-viewport" id="deployment-viewport">
            <section class="logical-screen deployment-screen" id="deployment-screen" data-testid="deployment-screen"
              aria-label="${controller.deploymentPresentation.title}部署畫面">
              <div id="deployment-phaser-root" aria-hidden="true"></div>
              <div id="deployment-ui-root" class="deployment-ui-root"></div>
            </section>
          </div>
        </div>
      </div>`;
    const viewport = root.querySelector<HTMLElement>("#deployment-viewport");
    const screen = root.querySelector<HTMLElement>("#deployment-screen");
    const uiRoot = root.querySelector<HTMLElement>("#deployment-ui-root");
    if (!viewport || !screen || !uiRoot) throw new Error("deployment surface not found");
    const session = new DeploymentSession(
      controller.deploymentDefinition,
      controller.deploymentRoster,
    );
    const destroyUi = mountDeploymentUi(uiRoot, session, controller.deploymentPresentation);
    const game = startDeploymentPhaser(session, "deployment-phaser-root", `deployment-${controller.battle.stage.id}`);
    const destroyScaling = configureGameScaling(viewport, screen);
    const unsubscribe = session.onChange((state) => {
      if (state.submitted) controller.completeDeployment(finishDeployment(state));
    });
    uiRoot.focus({ preventScroll: true });
    return () => {
      unsubscribe();
      destroyScaling();
      destroyUi();
      game.destroy(true);
    };
  };

  const syncSurface = () => {
    if (controller.battle.stage.id !== observedStageId) {
      observedStageId = controller.battle.stage.id;
      void stagedResources?.prefetchFollowing(observedStageId);
    }
    const nextKey = controller.phase === "ending"
      ? "ending:stage49"
      : controller.phase === "credits"
      ? "credits"
      : controller.phase === "deployment"
      ? `deployment:${controller.battle.stage.id}`
      : `battle:${controller.battle.stage.id}`;
    if (nextKey === surfaceKey) return;
    destroySurface();
    const generation = ++surfaceGeneration;
    surfaceKey = nextKey;
    if (controller.phase === "ending") {
      destroySurface = () => undefined;
      const mount = async () => {
        await stagedResources?.ensureRoute("ending", "讀取主線結局資料");
        if (generation !== surfaceGeneration || controller.phase !== "ending") return;
        destroySurface = mountStage49EndingUi(root, controller);
      };
      void mount();
      return;
    }
    if (controller.phase === "credits") {
      destroySurface = () => undefined;
      const mount = async () => {
        await stagedResources?.ensureRoute("credits", "讀取製作人員表資料");
        if (generation !== surfaceGeneration || controller.phase !== "credits") return;
        destroySurface = mountCreditsUi(root, controller);
      };
      void mount();
      return;
    }
    if (controller.phase === "deployment") {
      destroySurface = () => undefined;
      void mountDeploymentSurface().then((destroy) => {
        if (generation !== surfaceGeneration || controller.phase !== "deployment") {
          destroy();
          return;
        }
        destroySurface = destroy;
      });
      return;
    }
    destroySurface = mountBattleSurface();
  };

  controller.onChange(syncSurface);
  syncSurface();
  if (!releaseBuild) exposeDebugApi(controller);
};

const startGame = async (selection: StartupSelection) => {
  let controller: GameController;
  if (selection.kind === "continue") {
    controller = await GameController.fromSave(selection.save, selection.slot, stageAssetGate);
  } else {
    controller = new GameController(selection.difficulty, stageAssetGate);
    await stageAssetGate("stage-00", controllerAssetRequirements(controller));
  }
  mountController(controller, selection.userActivated, resourceLoader);
};

const renderDebugLoadError = (title: string, message: string) => {
  const error = document.createElement("main");
  error.className = "debug-load-error";
  const heading = document.createElement("h1");
  heading.textContent = title;
  const detail = document.createElement("p");
  detail.textContent = message;
  const back = document.createElement("a");
  back.href = "/debug.html";
  back.textContent = "返回場景選擇";
  error.append(heading, detail, back);
  root.replaceChildren(error);
};

const parameters = new URLSearchParams(location.search);
const debugScenario = releaseBuild ? null : parameters.get("debugScenario");
if (!releaseBuild && debugScenario) {
  void import("./game/debug-scenarios").then(async (debug) => {
    if (!debug.isDebugScenarioId(debugScenario)) {
      renderDebugLoadError("未知調試場景", debugScenario);
      return;
    }
    const difficultyValue = Number(parameters.get("difficulty") ?? 0);
    const difficulty = difficultyValue === 0 || difficultyValue === 1
      || difficultyValue === 2 || difficultyValue === 3
      ? difficultyValue
      : 0;
    const rosterSource = debug.parseDebugRosterSourceId(parameters.get("roster"));
    if (!rosterSource) {
      renderDebugLoadError("未知成長檔案", parameters.get("roster") ?? "");
      return;
    }
    const perStageGrowth = debug.parseDebugPerStageGrowth(parameters.get("growth"));
    if (parameters.has("growth") && perStageGrowth === undefined) {
      renderDebugLoadError("無效每關成長值", parameters.get("growth") ?? "");
      return;
    }
    const controller = await debug.createDebugScenarioController(debugScenario, {
      difficulty,
      rosterSource,
      storage: localStorage,
      perStageGrowth,
    });
    controller.setStageAssetGate(stageAssetGate);
    await stageAssetGate(controller.battle.stage.id, controllerAssetRequirements(controller));
    mountController(controller, false, resourceLoader);
    debug.mountDebugToolbar(
      controller,
      debugScenario,
      difficulty,
      rosterSource,
      localStorage,
      perStageGrowth,
    );
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    renderDebugLoadError("調試場景載入失敗", message);
  });
}
else if (!releaseBuild && parameters.has("skipStartup")) {
  void startGame({ kind: "new", difficulty: 0, userActivated: false });
}
else {
  void resourceLoader.ensureBoot().then(() => {
    mountStartup(root, startGame);
    resourceLoader.prefetchStage("stage-00", stage0PresentationAssets);
  });
}
