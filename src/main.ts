import "./styles.css";
import { GameController, exposeDebugApi } from "./game/controller";
import { startPhaser } from "./game/phaser/BattleScene";
import { mountUi } from "./game/ui";
import { AudioManager } from "./game/audio";
import { mountStartup, type StartupSelection } from "./game/startup";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");

const startGame = (selection: StartupSelection) => {
  const controller = selection.kind === "continue"
    ? GameController.fromSave(selection.save, selection.slot)
    : new GameController(selection.difficulty);
  const { userActivated } = selection;
  const audio = new AudioManager(controller, root, userActivated);
  mountUi(root, controller, audio);
  startPhaser(controller);
  exposeDebugApi(controller);
};

const parameters = new URLSearchParams(location.search);
if (parameters.has("skipStartup")) {
  startGame({ kind: "new", difficulty: 0, userActivated: false });
}
else mountStartup(root, startGame);
