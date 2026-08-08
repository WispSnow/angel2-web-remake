import "./styles.css";
import "./class-showdown.css";
import "./promotion-lab.css";
import { AudioManager } from "./game/audio";
import {
  PROMOTION_LAB_CLASS_IDS,
  PROMOTION_LAB_ENVIRONMENT,
  PROMOTION_LAB_ROWS_PER_COLUMN,
  createPromotionLabPlacements,
} from "./game/promotion-lab-session";
import {
  classDefinition,
  className,
  classStatsFor,
  promotionExperienceThresholdFor,
} from "./game/content/classes";
import { TECHNIQUE_LAB_UNIT_ASSETS } from "./game/content/technique-lab.generated";
import { GameController } from "./game/controller";
import { startPhaser } from "./game/phaser/BattleScene";
import { ArenaBattle, createArenaRuntime } from "./game/simulation/arena-battle";
import type { Difficulty } from "./game/types";
import { mountUi } from "./game/ui";

function requiredDocumentElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing promotion lab document element ${selector}`);
  return element;
}

const root = requiredDocumentElement<HTMLElement>("#app");
const toolbar = requiredDocumentElement<HTMLElement>("#promotion-lab-toolbar");

let mode: "setup" | "battle" = "setup";
let difficulty: Difficulty = 0;
let controller: GameController | undefined;
let destroySetup: () => void = () => undefined;
let destroyBattle: () => void = () => undefined;

function classCard(classId: (typeof PROMOTION_LAB_CLASS_IDS)[number], index: number): string {
  const assets = TECHNIQUE_LAB_UNIT_ASSETS[classId];
  if (!assets.ally) throw new Error(`${classId} has no allied promotion-lab figure`);
  const definition = classDefinition(classId);
  const trigger = promotionExperienceThresholdFor(classId);
  const candidates = definition.promotion.targets.map(({ id }) => className(id)).join("／");
  return `
    <article class="class-pair promotion-pair" data-class-id="${classId}"
      data-testid="promotion-lab-pair">
      <span class="class-record">${String(definition.nativeRecord).padStart(2, "0")}</span>
      <img src="${assets.ally}" alt="我方${className(classId)}" />
      <div>
        <b>${className(classId)}</b>
        <span>等級 3 · 經驗 ${trigger - 1}/${trigger}</span>
        <small>候選：${candidates}</small>
      </div>
      <span class="class-versus" aria-hidden="true">VS</span>
      <img src="${assets.enemy}" alt="敵方${className(classId)}" />
      <small>${index < PROMOTION_LAB_ROWS_PER_COLUMN ? "左列" : "右列"}</small>
    </article>`;
}

function renderSetup(): void {
  destroyBattle();
  destroyBattle = () => undefined;
  mode = "setup";
  toolbar.hidden = true;
  root.innerHTML = `
    <div class="class-showdown-shell promotion-lab-shell">
      <header class="class-showdown-header">
        <div>
          <p class="class-showdown-kicker">DEVELOPER LAB · MEMORY ONLY</p>
          <h1>轉職觸發實驗室</h1>
          <p>12 個有原版轉職候選的來源職業依記錄順序部署；每組我方與同職業敵方相鄰，雙方都只差 1 經驗進入第 4 成長行。用我方普通攻擊即可觸發正式對話與轉職選單。</p>
        </div>
        <nav aria-label="返回入口"><a href="/debug.html">戰役調試中心</a><a href="/class-showdown.html">全職業對陣場</a><a href="/">普通遊戲</a></nav>
      </header>
      <section class="class-showdown-controls promotion-lab-controls" aria-labelledby="promotion-lab-controls-heading">
        <div>
          <span>TRIGGER CONTROL</span>
          <h2 id="promotion-lab-controls-heading">原版臨界經驗</h2>
          <p>正式戰鬥成長只讀前三個 DATA 行；之後按職業短碼成長。這 12 種職業敵我均為 +100 經驗進入第 4 成長行，但只有我方會進入轉職掃描。</p>
        </div>
        <label>戰鬥難度
          <select data-testid="promotion-lab-difficulty">
            <option value="0">風和日麗</option>
            <option value="1">平淡無奇</option>
            <option value="2">小有挑戰</option>
            <option value="3">無法無天</option>
          </select>
        </label>
        <button type="button" class="class-showdown-start" data-command="start"
          data-testid="promotion-lab-start">以臨界經驗開戰</button>
        <p class="class-showdown-status" data-testid="promotion-lab-status" aria-live="polite">已配置 ${PROMOTION_LAB_CLASS_IDS.length} 組、${PROMOTION_LAB_CLASS_IDS.length * 2} 名單位；全部目前為職業等級 3。</p>
      </section>
      <section class="class-showdown-roster" aria-labelledby="promotion-lab-roster-heading">
        <header>
          <div><span>12 SOURCES · 24 UNITS</span><h2 id="promotion-lab-roster-heading">可轉職來源並排編隊</h2></div>
          <p>左側藍色單位由玩家控制；右側紅色單位由 AI 控制。左列首組使用妮雅身份，可同時檢查本人與隊友兩套授職對話。</p>
        </header>
        <div class="class-pair-grid">${PROMOTION_LAB_CLASS_IDS.map(classCard).join("")}</div>
      </section>
      <aside class="class-showdown-boundary">
        <b>原版敵我邊界</b>
        <p>敵我使用同一套第三行後成長步長；鋼甲戰士雖然雙方短碼分別為 1C／0C，但兩者都落入預設 +100 門檻、攻擊 +1、生命 +10。</p>
        <p>轉職掃描另外要求 side 1，因此敵軍取得經驗後只顯示更高職業等級與派生屬性，不會出現授職對話或候選 UI。本入口不讀寫戰役記錄。</p>
      </aside>
    </div>`;

  const difficultySelect = requiredDocumentElement<HTMLSelectElement>(
    "[data-testid=promotion-lab-difficulty]",
  );
  difficultySelect.value = String(difficulty);
  const events = new AbortController();
  root.addEventListener("click", (event) => {
    const command = (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.command;
    if (command === "start") startBattle();
  }, { signal: events.signal });
  difficultySelect.addEventListener("change", () => {
    difficulty = Number(difficultySelect.value) as Difficulty;
  }, { signal: events.signal });
  destroySetup = () => events.abort();
}

function updateBattleProgress(): void {
  if (!controller) return;
  const sourceById = new Map(PROMOTION_LAB_CLASS_IDS.map(
    (classId, index) => [`promotion-1-${index}`, classId],
  ));
  const promotedAllies = controller.battle.units.filter((unit) =>
    unit.side === 1 && sourceById.get(unit.id) !== unit.classId).length;
  const levelFourEnemies = controller.battle.units.filter((unit) =>
    unit.side === 2 && classStatsFor(unit).level >= 4).length;
  const progress = toolbar.querySelector<HTMLElement>("[data-testid=promotion-lab-progress]");
  if (progress) {
    progress.textContent = `我方已轉職 ${promotedAllies}/${PROMOTION_LAB_CLASS_IDS.length} · 敵方等級 4+ ${levelFourEnemies}/${PROMOTION_LAB_CLASS_IDS.length}`;
  }
}

function startBattle(): void {
  destroySetup();
  destroySetup = () => undefined;
  mode = "battle";
  const placements = createPromotionLabPlacements();
  const battle = new ArenaBattle(placements, difficulty, undefined, PROMOTION_LAB_ENVIRONMENT);
  controller = GameController.forStandaloneBattle(
    battle,
    createArenaRuntime(placements, PROMOTION_LAB_ENVIRONMENT),
    `轉職觸發測試開始：${PROMOTION_LAB_CLASS_IDS.length} 組雙方都只差 1 經驗。`,
  );
  const audio = new AudioManager(controller, root, true);
  const destroyUi = mountUi(root, controller, audio);
  const game = startPhaser(controller);
  toolbar.hidden = false;
  toolbar.innerHTML = `
    <div><b>轉職觸發實驗室</b><span data-testid="promotion-lab-progress"></span></div>
    <button type="button" data-action="restart" data-testid="promotion-lab-restart">臨界經驗重開</button>
    <button type="button" data-action="setup" data-testid="promotion-lab-return">返回說明</button>`;
  const events = new AbortController();
  const unsubscribe = controller.onChange(updateBattleProgress);
  updateBattleProgress();
  toolbar.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.action;
    if (action === "restart") {
      destroyBattle();
      destroyBattle = () => undefined;
      startBattle();
    } else if (action === "setup") {
      renderSetup();
    }
  }, { signal: events.signal });
  destroyBattle = () => {
    events.abort();
    unsubscribe();
    destroyUi();
    game.destroy(true);
    audio.destroy();
    toolbar.hidden = true;
    controller = undefined;
  };
}

declare global {
  interface Window {
    __ANGEL2_PROMOTION_LAB__?: {
      getState: () => object;
      startBattle: () => void;
      returnToSetup: () => void;
    };
  }
}

window.__ANGEL2_PROMOTION_LAB__ = {
  getState: () => mode === "setup"
    ? { mode, difficulty, placements: createPromotionLabPlacements() }
    : { mode, difficulty, battle: controller?.debugState() },
  startBattle,
  returnToSetup: renderSetup,
};

renderSetup();
window.addEventListener("pagehide", () => {
  destroySetup();
  destroyBattle();
}, { once: true });
