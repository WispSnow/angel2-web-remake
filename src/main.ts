import "./styles.css";
import { GameController, exposeDebugApi } from "./game/controller";
import { startPhaser } from "./game/phaser/BattleScene";
import { mountUi } from "./game/ui";
import { AudioManager } from "./game/audio";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");

const controller = new GameController();
const audio = new AudioManager(controller, root);
mountUi(root, controller, audio);
startPhaser(controller);
exposeDebugApi(controller);
