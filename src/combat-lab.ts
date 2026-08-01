import "./styles.css";
import "./combat-lab.css";
import { ASSETS } from "./game/content/stage0";
import { STAGE0_ACTION_AUDIO_ASSETS } from "./game/content/stage0-actions.generated";
import { className, classStatsFor } from "./game/content/classes";
import type {
  CombatPresentation,
  CombatPresentationPhase,
} from "./game/controller";
import {
  buildFullCombatScript,
  type FullCombatPhaseName,
  type FullCombatSceneState,
  type FullCombatScript,
} from "./game/full-combat";
import { configureGameScaling } from "./game/scaling";
import { emptyUnitStatuses } from "./game/simulation/status";
import type {
  AttackResult,
  BattleUnit,
  Side,
  UnitClassId,
} from "./game/types";
import {
  renderCombat,
  type CombatPresentationRenderSource,
} from "./game/ui";

const LAB_CLASSES = [
  "soldier",
  "magic-sword-warrior",
  "jungle-warrior",
  "magic-priest",
  "prayer-guide",
  "curse-master",
  "magician",
  "great-axe-warrior",
  "half-dragon-warrior",
  "magic-armor-warrior",
  "magic-guide",
  "evil-mage",
  "magic-archer",
  "land-knight",
  "demon-dragon-knight",
  "flying-dragon-knight",
  "beast-knight",
  "bone-knight",
  "swift-dragon-knight",
  "great-dragon-knight",
  "archer",
  "crossbow",
  "cavalry",
  "pegasus-warrior",
  "sister",
  "monk",
  "water-warrior",
  "divine-sword-warrior",
  "warrior",
  "steel-armor-warrior",
  "priest",
  "wizard",
  "magic-master",
  "evil-sword-warrior",
  "engineer",
  "empress",
  "dragon",
  "head",
  "hand",
] as const satisfies readonly UnitClassId[];

type LabClassId = (typeof LAB_CLASSES)[number];
type LabReaction = "guard" | "hurt";
type LabSide = "left" | "right";

interface LabConfig {
  attackerClass: LabClassId;
  defenderClass: LabClassId;
  reaction: LabReaction;
  death: boolean;
  side: LabSide;
  speed: number;
  loop: boolean;
  sound: boolean;
}

interface LabPlaybackState {
  config: LabConfig;
  playing: boolean;
  t: number;
  duration: number;
  phase: FullCombatPhaseName;
  actorFrame?: number;
  victimFrame?: number;
  victimReaction?: string;
  projectileFrame?: number;
  marks: readonly { t: number; phase: FullCombatPhaseName }[];
}

/**
 * 原版只有右側可重放的職業。女帝在場景 30 是 side 2 單位、場景 42 雖為 side 1 但該
 * 關沒有敵方單位；龍在場景 20/22、頭與雙手在場景 37 都只出現在 side 2。它們的左側
 * `M_00` 資源為空佔位或缺項，實驗室因此把它們鎖到右側。
 */
const RIGHT_ONLY_NOTES: Partial<Record<LabClassId, string>> = {
  empress: "原版「女帝」沒有左側普通全景圖形；右側資料亦直接重用士兵畫面。實驗室已切換到原版唯一可重放的右側資料。",
  dragon: "原版「龍」只在場景 20／22 以 side 2 登場，沒有左側表現塊與圖形。實驗室已切換到原版唯一可重放的右側資料。",
  head: "原版「頭」只在場景 37 以 side 2 登場，沒有左側表現塊與圖形。實驗室已切換到原版唯一可重放的右側資料。",
  hand: "原版「手」只在場景 37 以 side 2 登場，沒有左側表現塊與圖形。實驗室已切換到原版唯一可重放的右側資料。",
};

const isRightOnly = (classId: LabClassId): boolean => classId in RIGHT_ONLY_NOTES;

declare global {
  interface Window {
    __ANGEL2_COMBAT_LAB__?: {
      getState: () => LabPlaybackState;
      apply: (changes: Partial<LabConfig>) => void;
      seek: (time: number) => void;
      play: () => void;
      pause: () => void;
    };
  }
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");

const isLabClass = (value: string | null): value is LabClassId =>
  value !== null && (LAB_CLASSES as readonly string[]).includes(value);

const numberFrom = (
  value: string | null,
  allowed: readonly number[],
  fallback: number,
): number => {
  const parsed = Number(value);
  return allowed.includes(parsed) ? parsed : fallback;
};

function initialConfig(): LabConfig {
  const parameters = new URLSearchParams(location.search);
  const attacker = parameters.get("attacker");
  const defender = parameters.get("defender");
  return normalizeConfig({
    attackerClass: isLabClass(attacker) ? attacker : "warrior",
    defenderClass: isLabClass(defender) ? defender : "archer",
    reaction: parameters.get("reaction") === "guard" ? "guard" : "hurt",
    death: parameters.get("death") === "1",
    side: parameters.get("side") === "right" ? "right" : "left",
    speed: numberFrom(parameters.get("speed"), [0.25, 0.5, 1, 2, 4], 1),
    loop: parameters.get("loop") === "1",
    sound: parameters.get("sound") === "1",
  });
}

/**
 * side 1 單位固定畫在左側、side 2 畫在右側，兩者不會互換。所以只有右側可達的職業
 * 當攻方時必須 `side="right"`，當守方時必須 `side="left"`，否則它會被擺到原版沒有
 * 圖形的左側。攻守同時是右側限定屬於無法構圖的組合，改由守方讓位到士兵。
 */
function normalizeConfig(next: LabConfig): LabConfig {
  if (isRightOnly(next.attackerClass) && isRightOnly(next.defenderClass)) {
    return normalizeConfig({ ...next, defenderClass: "soldier" });
  }
  if (isRightOnly(next.attackerClass)) {
    return next.side === "right" ? next : { ...next, side: "right" };
  }
  if (isRightOnly(next.defenderClass)) {
    return next.side === "left" ? next : { ...next, side: "left" };
  }
  return next;
}

const classOptions = LAB_CLASSES.map((classId) =>
  `<option value="${classId}">${className(classId)}</option>`).join("");

root.innerHTML = `
  <div class="combat-lab-shell">
    <header class="combat-lab-header">
      <div>
        <span class="eyebrow">PRESENTATION TOOL</span>
        <h1>戰鬥動畫實驗室</h1>
        <p>直接重放正式全景戰鬥腳本；不建立關卡、不提交模擬結果。</p>
      </div>
      <a href="/" class="combat-lab-back">返回遊戲</a>
    </header>

    <div class="combat-lab-layout">
      <section class="combat-lab-stage-card" aria-labelledby="combat-lab-stage-title">
        <h2 id="combat-lab-stage-title" class="visually-hidden">戰鬥動畫預覽</h2>
        <div class="game-viewport combat-lab-viewport" id="combat-lab-viewport">
          <section
            class="logical-screen combat-lab-screen"
            id="combat-lab-screen"
            data-testid="combat-lab-screen"
            aria-label="全景戰鬥動畫預覽"
          >
            <img class="combat-lab-underlay" src="${ASSETS.map}" alt="" />
            <div
              class="combat-presentation"
              id="combat-lab-presentation"
              data-testid="combat-lab-presentation"
            ></div>
          </section>
        </div>

        <div class="combat-lab-transport" aria-label="動畫播放控制">
          <button type="button" data-lab-action="restart" data-testid="combat-lab-restart">重新播放</button>
          <button type="button" data-lab-action="toggle" data-testid="combat-lab-toggle">暫停</button>
          <button type="button" data-lab-action="previous">上一節點</button>
          <button type="button" data-lab-action="next">下一節點</button>
          <button type="button" data-lab-action="step-back" aria-label="後退四十毫秒">−40 ms</button>
          <button type="button" data-lab-action="step-forward" aria-label="前進四十毫秒">+40 ms</button>
        </div>

        <label class="combat-lab-timeline">
          <span>時間軸</span>
          <input
            type="range"
            min="0"
            max="1"
            value="0"
            step="1"
            data-testid="combat-lab-timeline"
          />
        </label>

        <dl class="combat-lab-readout" aria-live="polite">
          <div><dt>階段</dt><dd data-testid="combat-lab-phase">fullOpen</dd></div>
          <div><dt>時間</dt><dd data-lab-readout="time">0 / 0 ms</dd></div>
          <div><dt>攻方</dt><dd data-lab-readout="actor">—</dd></div>
          <div><dt>守方</dt><dd data-lab-readout="victim">—</dd></div>
          <div><dt>飛行物</dt><dd data-lab-readout="projectile">—</dd></div>
        </dl>
      </section>

      <aside class="combat-lab-controls" aria-labelledby="combat-lab-controls-title">
        <span class="panel-kicker">CONTROL DECK</span>
        <h2 id="combat-lab-controls-title">測試條件</h2>

        <div class="combat-lab-presets" aria-label="常用驗收預設">
          <button type="button" data-lab-preset="warrior-hurt">戰士重傷</button>
          <button type="button" data-lab-preset="warrior-death">戰士死亡</button>
          <button type="button" data-lab-preset="archer-hurt">弓兵重傷</button>
          <button type="button" data-lab-preset="archer-death">弓兵死亡</button>
        </div>

        <form id="combat-lab-form">
          <label>
            <span>攻方職業</span>
            <select name="attackerClass" data-testid="combat-lab-attacker">${classOptions}</select>
          </label>
          <label>
            <span>守方職業</span>
            <select name="defenderClass" data-testid="combat-lab-defender">${classOptions}</select>
          </label>
          <label>
            <span>受擊分支</span>
            <select name="reaction" data-testid="combat-lab-reaction">
              <option value="guard">格擋（8，≤10）</option>
              <option value="hurt">重傷（24，&gt;10）</option>
            </select>
          </label>
          <label>
            <span>攻擊方向</span>
            <select name="side" data-testid="combat-lab-side">
              <option value="left">我方由左向右</option>
              <option value="right">敵方由右向左</option>
            </select>
          </label>
          <label>
            <span>播放速度</span>
            <select name="speed" data-testid="combat-lab-speed">
              <option value="0.25">×0.25</option>
              <option value="0.5">×0.5</option>
              <option value="1">×1</option>
              <option value="2">×2</option>
              <option value="4">×4</option>
            </select>
          </label>
          <label class="combat-lab-check">
            <input type="checkbox" name="death" data-testid="combat-lab-death" />
            <span>守方生命歸零，播放死亡段</span>
          </label>
          <label class="combat-lab-check">
            <input type="checkbox" name="loop" />
            <span>循環播放</span>
          </label>
          <label class="combat-lab-check">
            <input type="checkbox" name="sound" />
            <span>播放原版戰鬥音效</span>
          </label>
          <button class="combat-lab-apply" type="submit" data-testid="combat-lab-apply">
            套用並重新播放
          </button>
        </form>

        <button type="button" class="combat-lab-copy" data-lab-action="copy">
          複製目前設定連結
        </button>
        <p class="combat-lab-note">
          空白鍵播放／暫停，方向鍵逐 40 ms 檢查。更改條件會立即建立新的正式動畫腳本。
        </p>
        <p class="combat-lab-message" data-testid="combat-lab-message" aria-live="polite"></p>
      </aside>
    </div>
  </div>
`;

const required = <T extends Element>(selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing combat lab element: ${selector}`);
  return element;
};

const form = required<HTMLFormElement>("#combat-lab-form");
const presentationLayer = required<HTMLElement>("#combat-lab-presentation");
const timeline = required<HTMLInputElement>("[data-testid=combat-lab-timeline]");
const toggleButton = required<HTMLButtonElement>("[data-lab-action=toggle]");
const message = required<HTMLElement>("[data-testid=combat-lab-message]");
const phaseReadout = required<HTMLElement>("[data-testid=combat-lab-phase]");
const timeReadout = required<HTMLElement>("[data-lab-readout=time]");
const actorReadout = required<HTMLElement>("[data-lab-readout=actor]");
const victimReadout = required<HTMLElement>("[data-lab-readout=victim]");
const projectileReadout = required<HTMLElement>("[data-lab-readout=projectile]");

const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string): T => {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLSelectElement)) {
    throw new Error(`Missing combat lab field: ${name}`);
  }
  return element as T;
};

let config = initialConfig();
let attacker: BattleUnit;
let defender: BattleUnit;
let result: AttackResult;
let script: FullCombatScript;
let scene: FullCombatSceneState;
let phase: FullCombatPhaseName = "fullOpen";
let currentTime = 0;
let playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let previousFrameTime = performance.now();
const activeAudio = new Set<HTMLAudioElement>();

const renderSource: CombatPresentationRenderSource = {
  battlePresentation: "full",
  unitStats: classStatsFor,
};

function setForm(next: LabConfig): void {
  field<HTMLSelectElement>("attackerClass").value = next.attackerClass;
  field<HTMLSelectElement>("defenderClass").value = next.defenderClass;
  field<HTMLSelectElement>("reaction").value = next.reaction;
  field<HTMLSelectElement>("side").value = next.side;
  field<HTMLSelectElement>("speed").value = String(next.speed);
  field<HTMLInputElement>("death").checked = next.death;
  field<HTMLInputElement>("loop").checked = next.loop;
  field<HTMLInputElement>("sound").checked = next.sound;
}

function updateOriginalAvailability(next: LabConfig): void {
  const sideSelect = field<HTMLSelectElement>("side");
  const leftOption = sideSelect.querySelector<HTMLOptionElement>('option[value="left"]');
  const rightOption = sideSelect.querySelector<HTMLOptionElement>('option[value="right"]');
  if (!leftOption || !rightOption) throw new Error("Missing combat lab side option");
  leftOption.disabled = isRightOnly(next.attackerClass);
  rightOption.disabled = isRightOnly(next.defenderClass);
  message.textContent = RIGHT_ONLY_NOTES[next.attackerClass]
    ?? RIGHT_ONLY_NOTES[next.defenderClass]
    ?? "";
}

function readForm(): LabConfig {
  const attackerClass = field<HTMLSelectElement>("attackerClass").value;
  const defenderClass = field<HTMLSelectElement>("defenderClass").value;
  return normalizeConfig({
    attackerClass: isLabClass(attackerClass) ? attackerClass : "warrior",
    defenderClass: isLabClass(defenderClass) ? defenderClass : "archer",
    reaction: field<HTMLSelectElement>("reaction").value === "guard" ? "guard" : "hurt",
    side: field<HTMLSelectElement>("side").value === "right" ? "right" : "left",
    speed: numberFrom(field<HTMLSelectElement>("speed").value, [0.25, 0.5, 1, 2, 4], 1),
    death: field<HTMLInputElement>("death").checked,
    loop: field<HTMLInputElement>("loop").checked,
    sound: field<HTMLInputElement>("sound").checked,
  });
}

function updateUrl(): void {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("attacker", config.attackerClass);
  url.searchParams.set("defender", config.defenderClass);
  url.searchParams.set("reaction", config.reaction);
  url.searchParams.set("death", config.death ? "1" : "0");
  url.searchParams.set("side", config.side);
  url.searchParams.set("speed", String(config.speed));
  if (config.loop) url.searchParams.set("loop", "1");
  if (config.sound) url.searchParams.set("sound", "1");
  history.replaceState(null, "", url);
}

function makeUnit(
  role: "attacker" | "defender",
  classId: LabClassId,
  side: Side,
  life: number,
): BattleUnit {
  return {
    id: role === "attacker" ? "lab:attacker" : "lab:defender",
    side,
    slot: role === "attacker" ? 0 : 48,
    classId,
    className: className(classId),
    name: role === "attacker" ? "攻方" : "守方",
    portrait: side === 1 ? 46 : 48,
    x: side === 1 ? 24 : 25,
    y: 26,
    life,
    experience: classId === "soldier" ? 299 : 300,
    acted: false,
    statuses: emptyUnitStatuses(),
  };
}

function stopAudio(): void {
  for (const audio of activeAudio) {
    audio.pause();
    audio.currentTime = 0;
  }
  activeAudio.clear();
}

function playCue(record: number): void {
  if (!config.sound) return;
  const generated = STAGE0_ACTION_AUDIO_ASSETS as Readonly<Record<string, string>>;
  const baseEffects = ASSETS.audio.effects as Readonly<Partial<Record<number, string>>>;
  const source = generated[`e-${record}`] ?? baseEffects[record];
  if (!source) return;
  const audio = new Audio(source);
  audio.volume = record === 11 ? 0.5 : 0.55;
  activeAudio.add(audio);
  audio.addEventListener("ended", () => activeAudio.delete(audio), { once: true });
  void audio.play().catch(() => activeAudio.delete(audio));
}

function crossedCues(from: number, to: number): void {
  if (to <= from) return;
  for (const cue of script.cues) {
    if (cue.t > from && cue.t <= to) playCue(cue.record);
  }
}

function phaseAt(time: number): FullCombatPhaseName {
  let selected: FullCombatPhaseName = "fullOpen";
  for (const mark of script.marks) {
    if (mark.t > time) break;
    selected = mark.phase;
  }
  return selected;
}

function updateReadout(): void {
  const actorSprite = scene.sprites.find(({ set }) => set === "plus50");
  const victimSprite = scene.sprites.find(({ set }) => set === "direct");
  phaseReadout.textContent = phase;
  timeReadout.textContent = `${Math.round(currentTime)} / ${script.duration} ms`;
  actorReadout.textContent = actorSprite
    ? `${className(config.attackerClass)} · frame ${actorSprite.frame} · x ${Math.round(actorSprite.x)}`
    : "畫面外";
  victimReadout.textContent = victimSprite
    ? `${className(config.defenderClass)} · frame ${victimSprite.frame}`
      + `${victimSprite.reaction ? ` · ${victimSprite.reaction}` : ""}`
    : "尚未入場／已消失";
  projectileReadout.textContent = scene.projectile
    ? `frame ${scene.projectile.frame} · (${Math.round(scene.projectile.x)}, ${Math.round(scene.projectile.y)})`
    : scene.lance
      ? `投槍 frame ${scene.lance.frame}`
      : "—";
  timeline.value = String(Math.round(currentTime));
}

function renderFrame(): void {
  phase = phaseAt(currentTime);
  scene = script.sample(currentTime);
  const presentation: CombatPresentation = {
    attacker,
    defender,
    result,
    phase: phase as CombatPresentationPhase,
    frame: 0,
    displayedAttackerLife: attacker.life,
    displayedDefenderLife: defender.life,
    fullScene: scene,
  };
  renderSource.combatPresentation = presentation;
  renderCombat(presentationLayer, renderSource);
  updateReadout();
}

function updateToggleLabel(): void {
  toggleButton.textContent = playing ? "暫停" : "播放";
  toggleButton.setAttribute("aria-pressed", String(playing));
}

function setPlaying(next: boolean): void {
  playing = next;
  previousFrameTime = performance.now();
  updateToggleLabel();
}

function buildScenario(autoPlay = true): void {
  stopAudio();
  config = normalizeConfig(config);
  setForm(config);
  updateOriginalAvailability(config);
  const damage = config.reaction === "guard" ? 8 : 24;
  const attackerSide: Side = config.side === "left" ? 1 : 2;
  const defenderSide: Side = attackerSide === 1 ? 2 : 1;
  attacker = makeUnit("attacker", config.attackerClass, attackerSide, 200);
  defender = makeUnit(
    "defender",
    config.defenderClass,
    defenderSide,
    config.death ? damage : 200,
  );
  result = {
    attackerId: attacker.id,
    defenderId: defender.id,
    damage,
    counterDamage: 0,
    counterOccurred: false,
    defenderDied: config.death,
    attackerDied: false,
    experienceGained: 0,
  };
  script = buildFullCombatScript(attacker, defender, result);
  currentTime = 0;
  timeline.max = String(script.duration);
  updateUrl();
  setPlaying(autoPlay);
  renderFrame();
}

function seek(time: number): void {
  currentTime = Math.max(0, Math.min(script.duration, time));
  setPlaying(false);
  renderFrame();
}

function restart(): void {
  stopAudio();
  currentTime = 0;
  setPlaying(true);
  renderFrame();
}

function markerTimes(): number[] {
  return [...new Set([0, ...script.marks.map(({ t }) => t), script.duration])]
    .sort((left, right) => left - right);
}

function jumpMarker(direction: -1 | 1): void {
  const times = markerTimes();
  const target = direction < 0
    ? [...times].reverse().find((time) => time < currentTime - 1) ?? 0
    : times.find((time) => time > currentTime + 1) ?? script.duration;
  seek(target);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  config = readForm();
  buildScenario();
});

form.addEventListener("change", () => {
  config = readForm();
  buildScenario();
});

root.addEventListener("click", (event) => {
  const target = event.target as Element;
  const action = target.closest<HTMLElement>("[data-lab-action]")?.dataset.labAction;
  if (action === "restart") restart();
  else if (action === "toggle") setPlaying(!playing);
  else if (action === "previous") jumpMarker(-1);
  else if (action === "next") jumpMarker(1);
  else if (action === "step-back") seek(currentTime - 40);
  else if (action === "step-forward") seek(currentTime + 40);
  else if (action === "copy") {
    void navigator.clipboard.writeText(location.href).then(() => {
      message.textContent = "目前設定連結已複製。";
    }).catch(() => {
      message.textContent = "瀏覽器未允許剪貼簿，請直接複製網址列。";
    });
  }

  const preset = target.closest<HTMLElement>("[data-lab-preset]")?.dataset.labPreset;
  if (preset) {
    const [defenderClass, outcome] = preset.split("-");
    if (isLabClass(defenderClass) && (outcome === "hurt" || outcome === "death")) {
      field<HTMLSelectElement>("attackerClass").value = "soldier";
      field<HTMLSelectElement>("defenderClass").value = defenderClass;
      field<HTMLSelectElement>("reaction").value = "hurt";
      field<HTMLInputElement>("death").checked = outcome === "death";
      config = readForm();
      buildScenario();
    }
  }
});

timeline.addEventListener("input", () => seek(Number(timeline.value)));

document.addEventListener("keydown", (event) => {
  if ((event.target as Element).closest("input,select,button,a")) return;
  if (event.code === "Space") {
    event.preventDefault();
    setPlaying(!playing);
  } else if (event.code === "ArrowLeft") {
    event.preventDefault();
    seek(currentTime - 40);
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    seek(currentTime + 40);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) setPlaying(false);
});

function tick(now: number): void {
  const elapsed = Math.min(100, now - previousFrameTime);
  previousFrameTime = now;
  if (playing) {
    const before = currentTime;
    currentTime = Math.min(script.duration, currentTime + elapsed * config.speed);
    crossedCues(before, currentTime);
    if (currentTime >= script.duration) {
      if (config.loop) {
        currentTime = 0;
        stopAudio();
      } else {
        setPlaying(false);
      }
    }
    renderFrame();
  }
  requestAnimationFrame(tick);
}

window.__ANGEL2_COMBAT_LAB__ = {
  getState: () => {
    const actorSprite = scene.sprites.find(({ set }) => set === "plus50");
    const victimSprite = scene.sprites.find(({ set }) => set === "direct");
    return {
      config: { ...config },
      playing,
      t: currentTime,
      duration: script.duration,
      phase,
      actorFrame: actorSprite?.frame,
      victimFrame: victimSprite?.frame,
      victimReaction: victimSprite?.reaction,
      projectileFrame: scene.projectile?.frame,
      marks: script.marks.map(({ t, phase: markPhase }) => ({ t, phase: markPhase })),
    };
  },
  apply: (changes) => {
    config = { ...config, ...changes };
    setForm(config);
    buildScenario();
  },
  seek,
  play: () => setPlaying(true),
  pause: () => setPlaying(false),
};

buildScenario(playing);
configureGameScaling(
  required<HTMLElement>("#combat-lab-viewport"),
  required<HTMLElement>("#combat-lab-screen"),
);
updateToggleLabel();
requestAnimationFrame(tick);
