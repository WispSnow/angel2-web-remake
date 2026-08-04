import "./debug.css";
import {
  DEBUG_SCENARIOS,
  debugStageLabel,
  debugScenarioUrl,
  type DebugScenarioId,
} from "./game/debug-scenario-catalog";
import type { Difficulty } from "./game/types";
import { STAGE_RUNTIME_MANIFEST } from "./game/stage-runtime";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");

const stageOrder = Object.keys(STAGE_RUNTIME_MANIFEST) as Array<keyof typeof STAGE_RUNTIME_MANIFEST>;
const stageGroups = stageOrder.map((stageId) => ({
  stageId,
  scenarios: DEBUG_SCENARIOS.filter((scenario) => scenario.stageId === stageId),
})).filter(({ scenarios }) => scenarios.length > 0);

root.innerHTML = `
  <div class="debug-hub-shell">
    <header class="debug-hub-header">
      <div>
        <p class="debug-kicker">DEVELOPER SCENE SELECT</p>
        <h1>戰役調試中心</h1>
        <p>直接選擇關卡、階段或快速結算場景。調試會話與普通入口隔離，不會自動寫入正式存檔。</p>
      </div>
      <a href="/" class="debug-back-link">返回普通遊戲</a>
    </header>
    <section class="debug-options" aria-label="調試選項">
      <label for="debug-difficulty">難度</label>
      <select id="debug-difficulty" data-testid="debug-difficulty">
        <option value="0">風和日麗</option>
        <option value="1">平淡無奇</option>
        <option value="2">小有挑戰</option>
        <option value="3">無法無天</option>
      </select>
      <span>切換難度會更新下方全部場景入口。</span>
    </section>
    <nav class="debug-tool-links" aria-label="專項實驗室">
      <a href="/portrait-lab.html"><b>肖像動畫實驗室</b><span>一次檢查 D/0–67 的眨眼、口型與原版落點</span></a>
      <a href="/combat-lab.html"><b>戰鬥動畫實驗室</b><span>組合職業、方向、格擋、重傷與死亡</span></a>
      <a href="/deployment-lab.html"><b>部署實驗室</b><span>獨立檢查通用部署名單與輸入</span></a>
    </nav>
    <main class="debug-stage-list" data-testid="debug-hub">
      ${stageGroups.map(({ stageId, scenarios }) => `
        <section class="debug-stage-group" data-debug-stage-id="${stageId}" aria-labelledby="debug-${stageId}">
          <div class="debug-stage-heading">
            <p>${stageId.toUpperCase()}</p>
            <h2 id="debug-${stageId}">${debugStageLabel(stageId)}</h2>
          </div>
          <div class="debug-scenario-grid">
            ${scenarios.map((scenario) => {
              const fixture = "fixture" in scenario && scenario.fixture;
              return `
              <article class="debug-scenario-card${fixture ? " is-fixture" : ""}">
                <div class="debug-card-meta">
                  <span>${scenario.phase}</span>
                  ${fixture ? "<em>調試夾具</em>" : "<em>正式初態</em>"}
                </div>
                <h3>${scenario.title}</h3>
                <p>${scenario.description}</p>
                <a href="${debugScenarioUrl(scenario.id, 0)}"
                  data-debug-scenario-id="${scenario.id}"
                  data-testid="debug-scenario-${scenario.id}">進入場景</a>
              </article>`;
            }).join("")}
          </div>
        </section>`).join("")}
    </main>
    <footer class="debug-hub-footer">
      <p><b>擴充約定：</b>新增關卡時向場景註冊表加入關前、部署/準備、玩家回合、勝利準備和完成路由條目。</p>
      <p>調試入口允許使用確定性夾具；普通 <code>/</code> 仍不載入或暴露這些介面。</p>
    </footer>
  </div>`;

const difficultySelect = root.querySelector<HTMLSelectElement>("#debug-difficulty");
if (!difficultySelect) throw new Error("debug difficulty selector not found");

const updateLinks = () => {
  const difficulty = Number(difficultySelect.value) as Difficulty;
  root.querySelectorAll<HTMLAnchorElement>("[data-debug-scenario-id]").forEach((link) => {
    const id = link.dataset.debugScenarioId as DebugScenarioId | undefined;
    if (id) link.href = debugScenarioUrl(id, difficulty);
  });
};

difficultySelect.addEventListener("change", updateLinks);
updateLinks();
