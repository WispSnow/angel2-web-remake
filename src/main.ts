import "./styles.css";
import { GameController, exposeDebugApi } from "./game/controller";
import { startPhaser } from "./game/phaser/BattleScene";
import { mountUi } from "./game/ui";
import { AudioManager } from "./game/audio";
import { mountStartup, type StartupSelection } from "./game/startup";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");

const startGame = async (selection: StartupSelection) => {
  const controller = selection.kind === "continue"
    ? await GameController.fromSave(selection.save, selection.slot)
    : new GameController(selection.difficulty);
  const { userActivated } = selection;
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
          <div><span class="eyebrow">STAGE 01 · DEPLOYMENT</span><h1>天使帝國 II · 騎士城堡前</h1></div>
        </header>
        <div class="game-stage">
          <div class="game-viewport deployment-viewport" id="deployment-viewport">
            <section class="logical-screen deployment-screen" id="deployment-screen" data-testid="deployment-screen"
              aria-label="騎士城堡前部署畫面">
              <div id="deployment-phaser-root"></div>
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
      controller.stage1DeploymentDefinition,
      controller.stage1DeploymentRoster,
    );
    const destroyUi = mountDeploymentUi(uiRoot, session);
    const game = startDeploymentPhaser(session);
    const destroyScaling = configureGameScaling(viewport, screen);
    const unsubscribe = session.onChange((state) => {
      if (state.submitted) controller.completeStage1Deployment(finishDeployment(state));
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
      ? "deployment:stage-01"
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

const parameters = new URLSearchParams(location.search);
if (parameters.has("skipStartup")) {
  void startGame({ kind: "new", difficulty: 0, userActivated: false });
}
else mountStartup(root, startGame);
