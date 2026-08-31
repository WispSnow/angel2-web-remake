import "./styles.css";
import "./stage49-ending.css";
import "./resource-loading.css";
import {
  GameController,
  exposeDebugApi,
  type StageAssetGate,
  type StageAssetRequirements,
} from "./game/controller";
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
import { stageDialoguePortraitRecords } from "./game/content/portrait-assets";
import { STAGE0_DEFINITION } from "./game/content/stages";
import type { PortraitRecord } from "./game/types";
import { STAGE49_ENDING_SUPPLEMENTAL_ASSETS } from "./game/content/stage49-ending";
import {
  prepareStartupMusic,
  type PreparedStartupMusic,
} from "./game/startup-music";
import { installProgramPause } from "./game/program-pause";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");
installProgramPause();
const releaseBuild = import.meta.env.MODE === "release";
const resourceLoader = new ResourcePackLoader();
/**
 * 部署介面是正式流程裡唯一延後載入的表面。它的模組與樣式是打包產物，不在資源清單裡，
 * 所以原本要等「部署」階段真的開始才去抓；慢速連線上那一刻載入頁已經收起，畫面停在
 * 還沒有東西可畫的部署表面上，看起來就是卡死。改成由需要部署的關卡在資源門裡先備妥，
 * 等待因此留在有進度條的載入頁。掛載時共用同一個 promise，不會重抓。
 */
type DeploymentSurfaceModules = readonly [
  typeof import("./game/deployment-session"),
  typeof import("./game/deployment-ui"),
  typeof import("./game/phaser/DeploymentScene"),
  typeof import("./game/simulation/deployment"),
  typeof import("./game/scaling"),
];
let deploymentSurfaceModules: Promise<DeploymentSurfaceModules> | undefined;
const loadDeploymentSurfaceModules = (): Promise<DeploymentSurfaceModules> => {
  deploymentSurfaceModules ??= Promise.all([
    import("./game/deployment-session"),
    import("./game/deployment-ui"),
    import("./game/phaser/DeploymentScene"),
    import("./game/simulation/deployment"),
    import("./game/scaling"),
    import("./deployment-lab.css"),
  ]).then(([session, ui, scene, simulation, scaling]) =>
    [session, ui, scene, simulation, scaling] as const,
  ).catch((error: unknown) => {
    // 失敗的 promise 不能留著，否則資源門的「重試」只會重播同一個錯誤。
    deploymentSurfaceModules = undefined;
    throw error;
  });
  return deploymentSurfaceModules;
};

const stageAssetGate: StageAssetGate = (stageId, resolveRequirements) => {
  let requirements: StageAssetRequirements | undefined;
  return resourceLoader.ensureStage(
    stageId,
    `讀取 ${stageId} 關卡資料`,
    async () => {
      requirements = await resolveRequirements();
      return classPresentationAssetUrls(requirements);
    },
    async () => {
      if (requirements?.usesDeploymentSurface) await loadDeploymentSurfaceModules();
    },
  );
};

const controllerAssetRequirements = (controller: GameController): StageAssetRequirements => ({
  // 部署名單的候選還沒上場，職業與肖像都可能是棋盤上沒有的。正式流程由 `loadRuntime`
  // 從戰役名冊併進來，這條路徑（新遊戲與調試場景）要跟上，否則部署畫面的棋子與肖像
  // 會自己去要原始 URL——那條路不經過資源門，也不經過持久快取。
  allyClassIds: [...new Set([
    ...controller.battle.units.filter(({ side }) => side === 1).map(({ classId }) => classId),
    ...controller.deploymentRoster.map(({ classId }) => classId),
  ])],
  encounterClassIds: controller.battle.units.map(({ classId }) => classId),
  nativeStage: controller.battle.stage.nativeStage,
  portraitRecords: [...new Set<PortraitRecord>([
    46,
    ...controller.battle.units.map(({ portrait }) => portrait),
    ...controller.deploymentRoster.map(({ portrait }) => portrait),
    ...stageDialoguePortraitRecords(controller.battle.stage),
  ])],
  unitSpriteUrls: controller.stageUnitSpriteUrls,
  usesDeploymentSurface: controller.usesDeploymentSurface,
});
const stage0Units = createStage0Units();
const stage0PresentationAssets = classPresentationAssetUrls({
  allyClassIds: stage0Units.filter(({ side }) => side === 1).map(({ classId }) => classId),
  encounterClassIds: stage0Units.map(({ classId }) => classId),
  nativeStage: 0,
  portraitRecords: [...new Set<PortraitRecord>([
    46,
    ...stage0Units.map(({ portrait }) => portrait),
    ...stageDialoguePortraitRecords(STAGE0_DEFINITION),
  ])],
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
    ] = await loadDeploymentSurfaceModules();
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
        await stagedResources?.ensureRoute(
          "ending",
          "讀取主線結局資料",
          STAGE49_ENDING_SUPPLEMENTAL_ASSETS,
        );
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
    await stageAssetGate("stage-00", async () => controllerAssetRequirements(controller));
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
    await stageAssetGate(
      controller.battle.stage.id,
      async () => controllerAssetRequirements(controller),
    );
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
  let startupMusic: PreparedStartupMusic | undefined;
  void resourceLoader.ensureBoot(async () => {
    startupMusic?.dispose();
    startupMusic = await prepareStartupMusic();
  }).then(() => {
    if (!startupMusic) throw new Error("開場音樂沒有通過資源準備門。");
    mountStartup(root, startGame, startupMusic);
    resourceLoader.prefetchStage("stage-00", stage0PresentationAssets);
  });
}
