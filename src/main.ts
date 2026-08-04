import "./styles.css";
import { GameController, exposeDebugApi } from "./game/controller";
import { startPhaser } from "./game/phaser/BattleScene";
import { mountUi } from "./game/ui";
import { AudioManager } from "./game/audio";
import { mountStartup, type StartupSelection } from "./game/startup";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");

const mountController = (controller: GameController, userActivated: boolean) => {
  const audio = new AudioManager(controller, root, userActivated);
  let surfaceKey = "";
  let surfaceGeneration = 0;
  let destroySurface: () => void = () => undefined;

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
        <header class="project-header">
          <div><span class="eyebrow">${controller.deploymentPresentation.kicker} · DEPLOYMENT</span><h1>天使帝國 II · ${controller.deploymentPresentation.title}</h1></div>
        </header>
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
    const nextKey = controller.phase === "deployment"
      ? `deployment:${controller.battle.stage.id}`
      : `battle:${controller.battle.stage.id}`;
    if (nextKey === surfaceKey) return;
    destroySurface();
    const generation = ++surfaceGeneration;
    surfaceKey = nextKey;
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
  exposeDebugApi(controller);
};

const startGame = async (selection: StartupSelection) => {
  const controller = selection.kind === "continue"
    ? await GameController.fromSave(selection.save, selection.slot)
    : new GameController(selection.difficulty);
  mountController(controller, selection.userActivated);
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
const debugScenario = parameters.get("debugScenario");
if (debugScenario) {
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
    const controller = await debug.createDebugScenarioController(debugScenario, difficulty);
    mountController(controller, false);
    debug.mountDebugToolbar(controller, debugScenario, difficulty);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    renderDebugLoadError("調試場景載入失敗", message);
  });
}
else if (parameters.has("skipStartup")) {
  void startGame({ kind: "new", difficulty: 0, userActivated: false });
}
else mountStartup(root, startGame);
