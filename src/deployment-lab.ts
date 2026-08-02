import "./styles.css";
import "./deployment-lab.css";
import { STAGE1_DEFINITION, STAGE1_DEPLOYMENT_PREVIEW_ROSTER } from "./game/content/stage1";
import { DeploymentSession } from "./game/deployment-session";
import { mountDeploymentUi } from "./game/deployment-ui";
import { startDeploymentPhaser } from "./game/phaser/DeploymentScene";
import { configureGameScaling } from "./game/scaling";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");

root.innerHTML = `
  <div class="deployment-lab-shell">
    <header class="deployment-lab-header">
      <div><p class="eyebrow">M02 · P2 PROJECTION</p><h1>第 1 關部署驗收</h1></div>
      <p>同一純模擬狀態由 DOM 名單和 Phaser 地圖共同投影；此表面不建立正式戰鬥。</p>
      <a href="/" class="deployment-lab-back">返回遊戲</a>
    </header>
    <section class="deployment-lab-stage" aria-labelledby="deployment-lab-heading">
      <h2 id="deployment-lab-heading" class="visually-hidden">騎士城堡前部署畫面</h2>
      <div class="game-viewport deployment-viewport" id="deployment-viewport">
        <div class="logical-screen deployment-screen" id="deployment-screen" data-testid="deployment-screen">
          <div id="deployment-phaser-root" aria-hidden="false"></div>
          <div id="deployment-ui-root" class="deployment-ui-root"></div>
        </div>
      </div>
    </section>
    <aside class="deployment-lab-notes" aria-label="驗收邊界">
      <strong>目前邊界</strong>
      <span>五名固定單位、四名可選單位、三個 FFh 落點與三條原文錯誤均來自 Stage 1 合同。</span>
      <span>提交後只顯示規範化結果；戰鬥工廠、SAY/0005 與敵軍建立留給 P5。</span>
    </aside>
  </div>
`;

const viewport = root.querySelector<HTMLElement>("#deployment-viewport");
const screen = root.querySelector<HTMLElement>("#deployment-screen");
const uiRoot = root.querySelector<HTMLElement>("#deployment-ui-root");
if (!viewport || !screen || !uiRoot) throw new Error("deployment lab surface not found");

const session = new DeploymentSession(
  STAGE1_DEFINITION.deployment,
  STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
);
const destroyUi = mountDeploymentUi(uiRoot, session);
const game = startDeploymentPhaser(session);
const destroyScaling = configureGameScaling(viewport, screen);
uiRoot.focus({ preventScroll: true });

window.addEventListener("pagehide", () => {
  destroyScaling();
  destroyUi();
  game.destroy(true);
}, { once: true });

declare global {
  interface Window {
    __ANGEL2_DEPLOYMENT_LAB__?: {
      getState: () => typeof session.state;
    };
  }
}

window.__ANGEL2_DEPLOYMENT_LAB__ = {
  getState: () => session.state,
};
