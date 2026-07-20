import "./styles.css";
import { GameController, exposeDebugApi } from "./game/controller";
import { startPhaser } from "./game/phaser/BattleScene";
import { mountUi } from "./game/ui";
import { AudioManager } from "./game/audio";
import { mountStartup, type NewGameSelection } from "./game/startup";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");

const startGame = ({ difficulty, userActivated }: NewGameSelection) => {
  const controller = new GameController(difficulty);
  const audio = new AudioManager(controller, root, userActivated);
  mountUi(root, controller, audio);
  startPhaser(controller);
  exposeDebugApi(controller);
};

const parameters = new URLSearchParams(location.search);
if (parameters.has("skipStartup")) startGame({ difficulty: 0, userActivated: false });
else mountStartup(root, startGame);
