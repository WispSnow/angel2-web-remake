import "./styles.css";
import "./arena.css";
import { AudioManager } from "./game/audio";
import {
  ARENA_CLASS_IDS,
  ARENA_TERRAIN_SLOTS,
  ArenaSession,
  arenaClassSupportsCurrentSpecialAction,
  arenaExperienceForLevel,
  type ArenaClassId,
  type ArenaLevel,
  type ArenaSide,
  type ArenaState,
  type ArenaTool,
} from "./game/arena-session";
import { className, classStatsFor } from "./game/content/classes";
import { ASSETS } from "./game/content/stage0";
import { STAGE0_ACTION_AUDIO_ASSETS } from "./game/content/stage0-actions.generated";
import { STAGE1_ACTION_AUDIO_ASSETS } from "./game/content/stage1-actions.generated";
import { GameController } from "./game/controller";
import { prepareSoundEffectBuffers } from "./game/sound-effect-cache";
import { startArenaSetupPhaser } from "./game/phaser/ArenaSetupScene";
import { startPhaser } from "./game/phaser/BattleScene";
import {
  ArenaBattle,
  createArenaRuntime,
} from "./game/simulation/arena-battle";
import { mountUi } from "./game/ui";
import type { Difficulty } from "./game/types";

function requiredDocumentElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing arena document element ${selector}`);
  return element;
}

const root = requiredDocumentElement<HTMLElement>("#app");
const toolbar = requiredDocumentElement<HTMLElement>("#arena-battle-toolbar");

// `SoundEffectTransport.play` 只認已解碼好的緩衝，備不到就整個音效吞掉。正式戰役由
// 資源閘門在換包時備妥，競技場不走那條路，得自己把 `AudioManager` 在獨立戰鬥裡會
// 點到的音效備起來；漏了這一步，地圖技能與腳步聲會全程無聲。不能用頂層 await：那
// 不會延後 load 事件，只會讓除錯把手在頁面宣告載入完成後才出現。
//
// 兩張動作音效表都直接讀生成檔，不讀 `BATTLE_ACTION_AUDIO_ASSETS`：後者要等
// `activateStage1Content()` 併進第 1 關那批，而那要到 `startBattle()` 才發生，這裡
// 讀到的會只有第 0 關的一半。競技場本來就開放全部職業與技術。
void prepareSoundEffectBuffers([...new Set([
  ASSETS.audio.confirm,
  ...Object.values(ASSETS.audio.effects),
  ...ASSETS.audio.speech,
  ...Object.values(STAGE0_ACTION_AUDIO_ASSETS),
  ...Object.values(STAGE1_ACTION_AUDIO_ASSETS),
])]);

const session = new ArenaSession();
let mode: "setup" | "battle" = "setup";
let difficulty: Difficulty = 0;
let controller: GameController | undefined;
let destroySetup: () => void = () => undefined;
let destroyBattle: () => void = () => undefined;

const classOptions = ARENA_CLASS_IDS.map((classId) =>
  `<option value="${classId}">${className(classId)}</option>`).join("");
const terrainLabels = new Map<number, string>([
  [1, "沙地"],
  [2, "平原"],
  [3, "森林"],
  [5, "山地"],
  [6, "橋樑"],
  [10, "石路"],
  [11, "城牆"],
  [12, "河流"],
]);

function required<T extends HTMLElement>(selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`missing arena element ${selector}`);
  return element;
}

function renderSetup(): void {
  mode = "setup";
  destroyBattle();
  destroyBattle = () => undefined;
  toolbar.hidden = true;
  root.innerHTML = `
    <div class="arena-shell">
      <header class="arena-header">
        <div>
          <p class="arena-kicker">DEVELOPER LAB · MEMORY ONLY</p>
          <h1>全地形競技場</h1>
          <p>自由配置目前已接入戰場的我方與敵方職業，再以正式移動、地形、AI、回合及戰鬥規則開戰。</p>
        </div>
        <nav aria-label="返回入口"><a href="/debug.html">戰役調試中心</a><a href="/">普通遊戲</a></nav>
      </header>
      <div class="arena-layout">
        <section class="arena-map-card" aria-labelledby="arena-map-heading">
          <div class="arena-section-heading">
            <div><span>22 × 25</span><h2 id="arena-map-heading">常用地形試驗場</h2></div>
            <p>左鍵配置／替換，右鍵移除；暗格表示目前職業不能站立。</p>
          </div>
          <div id="arena-setup-canvas" class="arena-setup-canvas" data-testid="arena-setup-canvas-root"></div>
          <div class="arena-terrain-legend" aria-label="地形覆蓋">
            ${ARENA_TERRAIN_SLOTS.map((slot) => `<span data-terrain-slot="${slot}">${terrainLabels.get(slot)}</span>`).join("")}
          </div>
        </section>
        <aside class="arena-controls" aria-labelledby="arena-controls-heading">
          <div class="arena-section-heading"><div><span>ROSTER</span><h2 id="arena-controls-heading">測試編成</h2></div></div>
          <div class="arena-tool-row" role="group" aria-label="編成工具">
            <button type="button" data-arena-tool="place" data-testid="arena-place-tool">配置／替換</button>
            <button type="button" data-arena-tool="erase" data-testid="arena-erase-tool">移除</button>
          </div>
          <label>陣營
            <select id="arena-side" data-testid="arena-side">
              <option value="1">我方・玩家控制</option>
              <option value="2">敵方・AI 控制</option>
            </select>
          </label>
          <label>職業
            <select id="arena-class" data-testid="arena-class">${classOptions}</select>
          </label>
          <label>等級
            <select id="arena-level" data-testid="arena-level">
              <option value="1">等級 1</option>
              <option value="2">等級 2</option>
              <option value="3">等級 3</option>
            </select>
          </label>
          <section class="arena-class-readout" data-testid="arena-class-readout" aria-live="polite"></section>
          <label>戰鬥難度
            <select id="arena-difficulty" data-testid="arena-difficulty">
              <option value="0">風和日麗</option>
              <option value="1">平淡無奇</option>
              <option value="2">小有挑戰</option>
              <option value="3">無法無天</option>
            </select>
          </label>
          <dl class="arena-counts" data-testid="arena-counts">
            <div><dt>我方</dt><dd data-arena-ally-count></dd></div>
            <div><dt>敵方</dt><dd data-arena-enemy-count></dd></div>
          </dl>
          <p class="arena-status" data-testid="arena-status" aria-live="polite"></p>
          <button type="button" class="arena-start" data-testid="arena-start">以目前編成開戰</button>
          <div class="arena-secondary-actions">
            <button type="button" data-arena-command="reset" data-testid="arena-reset">恢復預設</button>
            <button type="button" data-arena-command="clear" data-testid="arena-clear">清空編成</button>
          </div>
          <p class="arena-boundary">此入口不讀取或寫入戰役記錄；職業經驗、生命、PRNG 與戰果只存在本次記憶體會話。</p>
        </aside>
      </div>
    </div>`;

  const canvasRoot = required<HTMLElement>("#arena-setup-canvas");
  const sideSelect = required<HTMLSelectElement>("#arena-side");
  const classSelect = required<HTMLSelectElement>("#arena-class");
  const levelSelect = required<HTMLSelectElement>("#arena-level");
  const difficultySelect = required<HTMLSelectElement>("#arena-difficulty");
  const classReadout = required<HTMLElement>("[data-testid=arena-class-readout]");
  const status = required<HTMLElement>("[data-testid=arena-status]");
  const startButton = required<HTMLButtonElement>("[data-testid=arena-start]");
  const allyCount = required<HTMLElement>("[data-arena-ally-count]");
  const enemyCount = required<HTMLElement>("[data-arena-enemy-count]");
  const events = new AbortController();
  const setupRenderer = startArenaSetupPhaser(session, canvasRoot);

  const render = (state: ArenaState) => {
    sideSelect.value = String(state.placementSide);
    classSelect.value = state.placementClass;
    levelSelect.value = String(state.placementLevel);
    difficultySelect.value = String(difficulty);
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-arena-tool]")) {
      const active = button.dataset.arenaTool === state.tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    const experience = classStatsFor({
      classId: state.placementClass,
      experience: arenaExperienceForLevel(state.placementClass, state.placementLevel),
    });
    classReadout.innerHTML = `
      <b>${className(state.placementClass)}・等級 ${state.placementLevel}</b>
      <span>攻 ${experience.attack}　防 ${experience.defense}　生命 ${experience.maxLife}　移動 ${experience.movement}</span>
      <em>${arenaClassSupportsCurrentSpecialAction(state.placementClass) ? "已接入職業指令" : "目前使用移動、普通戰鬥與休息"}</em>`;
    const allies = state.units.filter(({ side }) => side === 1).length;
    const enemies = state.units.filter(({ side }) => side === 2).length;
    allyCount.textContent = `${allies} 人`;
    enemyCount.textContent = `${enemies} 人`;
    const validation = session.validationMessage();
    status.textContent = validation ?? state.status;
    status.dataset.kind = validation ? "error" : "ready";
    startButton.disabled = validation !== undefined;
  };
  const unsubscribe = session.subscribe(render);

  root.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button) return;
    const tool = button.dataset.arenaTool as ArenaTool | undefined;
    if (tool) session.setTool(tool);
    if (button.dataset.arenaCommand === "reset") session.reset();
    if (button.dataset.arenaCommand === "clear") session.clear();
    if (button.dataset.testid === "arena-start") startBattle();
  }, { signal: events.signal });
  sideSelect.addEventListener("change", () => {
    session.setSide(Number(sideSelect.value) as ArenaSide);
  }, { signal: events.signal });
  classSelect.addEventListener("change", () => {
    if (ARENA_CLASS_IDS.includes(classSelect.value as ArenaClassId)) {
      session.setClass(classSelect.value as ArenaClassId);
    }
  }, { signal: events.signal });
  levelSelect.addEventListener("change", () => {
    session.setLevel(Number(levelSelect.value) as ArenaLevel);
  }, { signal: events.signal });
  difficultySelect.addEventListener("change", () => {
    difficulty = Number(difficultySelect.value) as Difficulty;
    render(session.state);
  }, { signal: events.signal });

  destroySetup = () => {
    events.abort();
    unsubscribe();
    setupRenderer.game.destroy(true);
  };
}

function startBattle(): boolean {
  const validation = session.validationMessage();
  if (validation) return false;
  destroySetup();
  destroySetup = () => undefined;
  mode = "battle";
  const placements = session.state.units.map((unit) => ({ ...unit }));
  const battle = new ArenaBattle(placements, difficulty);
  controller = GameController.forStandaloneBattle(
    battle,
    createArenaRuntime(placements),
    `競技場測試開始：我方 ${placements.filter(({ side }) => side === 1).length} 人對敵方 ${placements.filter(({ side }) => side === 2).length} 人。`,
  );
  const audio = new AudioManager(controller, root, true);
  const destroyUi = mountUi(root, controller, audio);
  const game = startPhaser(controller);
  toolbar.hidden = false;
  toolbar.innerHTML = `
    <div><b>全地形競技場</b><span>純記憶體・${placements.filter(({ side }) => side === 1).length} vs ${placements.filter(({ side }) => side === 2).length}</span></div>
    <button type="button" data-arena-battle-action="restart" data-testid="arena-restart-battle">相同編成重開</button>
    <button type="button" data-arena-battle-action="setup" data-testid="arena-return-setup">返回編成</button>`;
  const events = new AbortController();
  toolbar.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLButtonElement>("button")
      ?.dataset.arenaBattleAction;
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
  return true;
}

declare global {
  interface Window {
    __ANGEL2_ARENA__?: {
      getState: () => object;
      setSide: (side: ArenaSide) => void;
      setClass: (classId: ArenaClassId) => boolean;
      setLevel: (level: ArenaLevel) => void;
      setTool: (tool: ArenaTool) => void;
      interact: (x: number, y: number) => boolean;
      startBattle: () => boolean;
      returnToSetup: () => void;
    };
  }
}

window.__ANGEL2_ARENA__ = {
  getState: () => mode === "setup"
    ? { mode, session: structuredClone(session.state), difficulty }
    : { mode, battle: controller?.debugState(), difficulty },
  setSide: (side) => session.setSide(side),
  setClass: (classId) => {
    if (!ARENA_CLASS_IDS.includes(classId)) return false;
    session.setClass(classId);
    return true;
  },
  setLevel: (level) => session.setLevel(level),
  setTool: (tool) => session.setTool(tool),
  interact: (x, y) => session.interact(x, y).ok,
  startBattle,
  returnToSetup: renderSetup,
};

renderSetup();
window.addEventListener("pagehide", () => {
  destroySetup();
  destroyBattle();
}, { once: true });
