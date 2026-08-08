import "./styles.css";
import "./class-showdown.css";
import { AudioManager } from "./game/audio";
import type { ArenaLevel } from "./game/arena-session";
import {
  CLASS_SHOWDOWN_CLASS_IDS,
  CLASS_SHOWDOWN_ENVIRONMENT,
  CLASS_SHOWDOWN_EXCLUDED_CLASS_IDS,
  CLASS_SHOWDOWN_ROWS_PER_COLUMN,
  createClassShowdownPlacements,
} from "./game/class-showdown-session";
import { classDefinition, className } from "./game/content/classes";
import { TECHNIQUE_LAB_UNIT_ASSETS } from "./game/content/technique-lab.generated";
import { GameController } from "./game/controller";
import { startPhaser } from "./game/phaser/BattleScene";
import { ArenaBattle, createArenaRuntime } from "./game/simulation/arena-battle";
import type { Difficulty } from "./game/types";
import { mountUi } from "./game/ui";

function requiredDocumentElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing class showdown document element ${selector}`);
  return element;
}

const root = requiredDocumentElement<HTMLElement>("#app");
const toolbar = requiredDocumentElement<HTMLElement>("#class-showdown-toolbar");

let mode: "setup" | "battle" = "setup";
let level: ArenaLevel = 3;
let difficulty: Difficulty = 0;
let controller: GameController | undefined;
let destroySetup: () => void = () => undefined;
let destroyBattle: () => void = () => undefined;

function classCard(classId: (typeof CLASS_SHOWDOWN_CLASS_IDS)[number], index: number): string {
  const assets = TECHNIQUE_LAB_UNIT_ASSETS[classId];
  if (!assets.ally) throw new Error(`${classId} has no allied class showdown figure`);
  const definition = classDefinition(classId);
  return `
    <article class="class-pair" data-class-id="${classId}" data-testid="class-showdown-pair">
      <span class="class-record">${String(definition.nativeRecord).padStart(2, "0")}</span>
      <img src="${assets.ally}" alt="我方${className(classId)}" />
      <div>
        <b>${className(classId)}</b>
        <span data-pair-level></span>
      </div>
      <span class="class-versus" aria-hidden="true">VS</span>
      <img src="${assets.enemy}" alt="敵方${className(classId)}" />
      <small>${index < CLASS_SHOWDOWN_ROWS_PER_COLUMN ? "左列" : "右列"}</small>
    </article>`;
}

function updateLevelProjection(statusText: string): void {
  for (const classId of CLASS_SHOWDOWN_CLASS_IDS) {
    const row = classDefinition(classId).dataRows[level - 1];
    const card = root.querySelector<HTMLElement>(`[data-class-id="${classId}"]`);
    const readout = card?.querySelector<HTMLElement>("[data-pair-level]");
    if (readout && row) readout.textContent = `職業等級 ${row.level} · 經驗 ${row.experienceThreshold}`;
    if (card) card.dataset.level = String(level);
  }
  const status = root.querySelector<HTMLElement>("[data-testid=class-showdown-status]");
  if (status) status.textContent = statusText;
}

function renderSetup(): void {
  destroyBattle();
  destroyBattle = () => undefined;
  mode = "setup";
  toolbar.hidden = true;
  root.innerHTML = `
    <div class="class-showdown-shell">
      <header class="class-showdown-header">
        <div>
          <p class="class-showdown-kicker">DEVELOPER LAB · MEMORY ONLY</p>
          <h1>全職業對陣場</h1>
          <p>35 個常規職業依原版記錄順序部署；每組我方與同職業敵方相鄰，左列 18 組、右列 17 組，進入後使用正式規則、AI 與戰鬥表現。</p>
        </div>
        <nav aria-label="返回入口"><a href="/debug.html">戰役調試中心</a><a href="/arena.html">全地形競技場</a><a href="/">普通遊戲</a></nav>
      </header>
      <section class="class-showdown-controls" aria-labelledby="class-showdown-controls-heading">
        <div>
          <span>ROSTER CONTROL</span>
          <h2 id="class-showdown-controls-heading">統一測試條件</h2>
          <p>等級按鈕一次重建全部 70 名單位；每個職業使用所選原版資料列對應的實際職業等級與經驗門檻。</p>
        </div>
        <label>職業資料列
          <select data-testid="class-showdown-level">
            <option value="1">第 1 級資料</option>
            <option value="2">第 2 級資料</option>
            <option value="3">第 3 級資料</option>
          </select>
        </label>
        <button type="button" data-command="apply-level" data-testid="class-showdown-apply-level">一鍵設定全部兵種等級</button>
        <label>戰鬥難度
          <select data-testid="class-showdown-difficulty">
            <option value="0">風和日麗</option>
            <option value="1">平淡無奇</option>
            <option value="2">小有挑戰</option>
            <option value="3">無法無天</option>
          </select>
        </label>
        <button type="button" class="class-showdown-start" data-command="start" data-testid="class-showdown-start">以全部職業開戰</button>
        <p class="class-showdown-status" data-testid="class-showdown-status" aria-live="polite"></p>
      </section>
      <section class="class-showdown-roster" aria-labelledby="class-showdown-roster-heading">
        <header>
          <div><span>35 MATCHUPS · 70 UNITS</span><h2 id="class-showdown-roster-heading">同職業相鄰編隊</h2></div>
          <p>戰場為單一平原規則；可用鏡頭移到右側第二列。藍色圖形由玩家控制，紅色圖形由 AI 控制。</p>
        </header>
        <div class="class-pair-grid">${CLASS_SHOWDOWN_CLASS_IDS.map(classCard).join("")}</div>
      </section>
      <aside class="class-showdown-boundary">
        <b>特殊單位邊界</b>
        <p>${CLASS_SHOWDOWN_EXCLUDED_CLASS_IDS.map(className).join("、")}屬於特殊運行記錄，不列入常規職業同兵種對測；龍、頭、手原版沒有我方地圖圖形，本頁不偽造。</p>
        <p>此入口不讀寫戰役記錄；等級、生命、經驗、PRNG 與戰果只存在本次記憶體會話。</p>
      </aside>
    </div>`;

  const levelSelect = requiredDocumentElement<HTMLSelectElement>("[data-testid=class-showdown-level]");
  const difficultySelect = requiredDocumentElement<HTMLSelectElement>("[data-testid=class-showdown-difficulty]");
  levelSelect.value = String(level);
  difficultySelect.value = String(difficulty);
  updateLevelProjection(`目前已部署 ${CLASS_SHOWDOWN_CLASS_IDS.length} 組、${CLASS_SHOWDOWN_CLASS_IDS.length * 2} 名單位。`);

  const events = new AbortController();
  root.addEventListener("click", (event) => {
    const command = (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.command;
    if (command === "apply-level") {
      level = Number(levelSelect.value) as ArenaLevel;
      updateLevelProjection(`已一鍵套用第 ${level} 級資料至全部 ${CLASS_SHOWDOWN_CLASS_IDS.length} 組職業。`);
    } else if (command === "start") {
      startBattle();
    }
  }, { signal: events.signal });
  difficultySelect.addEventListener("change", () => {
    difficulty = Number(difficultySelect.value) as Difficulty;
  }, { signal: events.signal });
  destroySetup = () => events.abort();
}

function startBattle(): void {
  destroySetup();
  destroySetup = () => undefined;
  mode = "battle";
  const placements = createClassShowdownPlacements(level);
  const battle = new ArenaBattle(
    placements,
    difficulty,
    undefined,
    CLASS_SHOWDOWN_ENVIRONMENT,
  );
  controller = GameController.forStandaloneBattle(
    battle,
    createArenaRuntime(placements, CLASS_SHOWDOWN_ENVIRONMENT),
    `全職業對陣開始：${CLASS_SHOWDOWN_CLASS_IDS.length} 組、${placements.length} 名單位。`,
  );
  const audio = new AudioManager(controller, root, true);
  const destroyUi = mountUi(root, controller, audio);
  const game = startPhaser(controller);
  toolbar.hidden = false;
  toolbar.innerHTML = `
    <div><b>全職業對陣場</b><span>純記憶體 · ${CLASS_SHOWDOWN_CLASS_IDS.length} 組 · 第 ${level} 級資料</span></div>
    <button type="button" data-action="restart" data-testid="class-showdown-restart">相同等級重開</button>
    <button type="button" data-action="setup" data-testid="class-showdown-return">返回編成</button>`;
  const events = new AbortController();
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
    destroyUi();
    game.destroy(true);
    audio.destroy();
    toolbar.hidden = true;
    controller = undefined;
  };
}

declare global {
  interface Window {
    __ANGEL2_CLASS_SHOWDOWN__?: {
      getState: () => object;
      setAllLevels: (nextLevel: ArenaLevel) => void;
      startBattle: () => void;
      returnToSetup: () => void;
      forceWaterWarriorGroupDeathSetup: () => void;
    };
  }
}

window.__ANGEL2_CLASS_SHOWDOWN__ = {
  getState: () => mode === "setup"
    ? { mode, level, difficulty, placements: createClassShowdownPlacements(level) }
    : { mode, level, difficulty, battle: controller?.debugState() },
  setAllLevels: (nextLevel) => {
    level = nextLevel;
    if (mode === "setup") updateLevelProjection(`已一鍵套用第 ${level} 級資料至全部職業。`);
  },
  startBattle,
  returnToSetup: renderSetup,
  forceWaterWarriorGroupDeathSetup: () => controller?.forceWaterWarriorGroupDeathSetupForTest(),
};

renderSetup();
window.addEventListener("pagehide", () => {
  destroySetup();
  destroyBattle();
}, { once: true });
