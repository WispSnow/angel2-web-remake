import "./styles.css";
import "./technique-lab.css";
import {
  CLASS_IDS,
  className,
  isClassId,
} from "./game/content/classes";
import { STAGE0_ACTION_PRESENTATION_ASSETS } from "./game/content/stage0-actions.generated";
import {
  TECHNIQUE_LAB_AUDIO_ASSETS,
  TECHNIQUE_LAB_CATALOG,
  TECHNIQUE_LAB_ICE,
  TECHNIQUE_LAB_LIGHTNING,
  TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS,
  TECHNIQUE_LAB_UNIT_ASSETS,
} from "./game/content/technique-lab.generated";
import {
  buildLightningTimeline,
  iceFrameAtGlobalIndex,
  lightningFrameAtTime,
  type TimedLightningFrame,
} from "./game/map-technique-presentation";
import {
  startTechniqueLabPhaser,
  type TechniqueLabVisualFrame,
} from "./game/phaser/TechniqueLabScene";
import {
  TechniqueLabSession,
  type TechniqueLabNativeCode,
  type TechniqueLabSide,
  type TechniqueLabState,
  type TechniqueLabTool,
} from "./game/technique-lab-session";

interface LabPlaybackState {
  readonly actionCode: TechniqueLabNativeCode;
  readonly playing: boolean;
  readonly timeMs: number;
  readonly durationMs: number;
  readonly speed: number;
  readonly sound: boolean;
  readonly originalCleanup: boolean;
  readonly terminalHoldMs: number;
  readonly phase: string;
  readonly frame: number;
}

const rootCandidate = document.querySelector<HTMLElement>("#app");
if (!rootCandidate) throw new Error("#app not found");
const root: HTMLElement = rootCandidate;

const classOptions = CLASS_IDS.map((classId) => {
  const record = TECHNIQUE_LAB_UNIT_ASSETS[classId].nativeRecord;
  return `<option value="${classId}">${String(record).padStart(2, "0")} · ${className(classId)}</option>`;
}).join("");
const techniqueOptions = TECHNIQUE_LAB_CATALOG.map((technique) =>
  `<option value="${technique.nativeCode}" ${technique.implementationId === null ? "disabled" : ""}>`
  + `${technique.nativeCode} · ${technique.label}`
  + `${technique.implementationId === null ? "（尚未實現）" : ""}</option>`).join("");

root.innerHTML = `
  <div class="technique-lab-shell">
    <header class="technique-lab-header">
      <div>
        <span class="eyebrow">MAP PRESENTATION TOOL</span>
        <h1>地圖技能動畫實驗室</h1>
        <p>任意配置敵我職業，直接重放原版地圖技能腳本；不建立關卡、不提交傷害或存檔。</p>
      </div>
      <a href="/" class="technique-lab-back">返回遊戲</a>
    </header>

    <div class="technique-lab-layout">
      <section class="technique-lab-stage-card" aria-label="技能地圖預覽">
        <div id="technique-lab-canvas" class="technique-lab-canvas" data-testid="technique-lab-canvas"></div>
        <div class="technique-lab-transport">
          <button type="button" data-command="restart" data-testid="technique-lab-restart">從頭</button>
          <button type="button" data-command="play" data-testid="technique-lab-play">播放</button>
          <button type="button" data-command="pause" data-testid="technique-lab-pause">暫停</button>
          <button type="button" data-command="step" data-testid="technique-lab-step">單步</button>
          <label>時間軸 <input data-testid="technique-lab-timeline" type="range" min="0" value="0" step="1" /></label>
        </div>
        <dl class="technique-lab-readout">
          <div><dt>階段</dt><dd data-readout="phase">—</dd></div>
          <div><dt>時間</dt><dd data-readout="time">—</dd></div>
          <div><dt>施法者</dt><dd data-readout="actor">—</dd></div>
          <div><dt>目標</dt><dd data-readout="target">—</dd></div>
          <div><dt>命中預覽</dt><dd data-readout="affected">—</dd></div>
        </dl>
      </section>

      <aside class="technique-lab-controls">
        <h2>配置與技能</h2>
        <label>技能
          <select data-testid="technique-lab-action" id="technique-lab-action">${techniqueOptions}</select>
        </label>
        <div class="technique-lab-toolbox" role="group" aria-label="地圖操作">
          <button type="button" data-tool="place">放置／替換</button>
          <button type="button" data-tool="actor">指定施法者</button>
          <button type="button" data-tool="target" data-testid="technique-lab-target-tool">指定目標格</button>
          <button type="button" data-tool="erase">刪除單位</button>
        </div>
        <label>陣營
          <select data-testid="technique-lab-side" id="technique-lab-side">
            <option value="1">我方</option><option value="2" selected>敵方</option>
          </select>
        </label>
        <label>職業
          <select data-testid="technique-lab-class" id="technique-lab-class">${classOptions}</select>
        </label>
        <label>速度
          <select data-testid="technique-lab-speed" id="technique-lab-speed">
            <option value="0.25">0.25×</option><option value="0.5">0.5×</option>
            <option value="1" selected>1× 原速</option><option value="2">2×</option><option value="4">4×</option>
          </select>
        </label>
        <label class="technique-lab-check"><input id="technique-lab-sound" type="checkbox" /> 技能原聲音效</label>
        <label class="technique-lab-check">
          <input id="technique-lab-original-cleanup" data-testid="technique-lab-original-cleanup" type="checkbox" />
          原版全敵收尾 <span>（非額外傷害）</span>
        </label>
        <div class="technique-lab-actions">
          <button type="button" data-command="reset">恢復示例配置</button>
          <button type="button" data-command="clear">清空全部單位</button>
        </div>
        <p class="technique-lab-hint" data-testid="technique-lab-hint">
          左鍵依目前工具操作；右鍵可隨時刪除。藍圈是施法者，金框是技能中心。預設收尾只顯示實際命中範圍。
        </p>
        <p class="technique-lab-boundary">
          未實現技能保留在原版清單中但不可選。龍、頭、手沒有原版我方地圖圖形，只能配置為敵方。
        </p>
      </aside>
    </div>
  </div>
`;

const canvasRootCandidate = root.querySelector<HTMLElement>("#technique-lab-canvas");
const actionSelectCandidate = root.querySelector<HTMLSelectElement>("#technique-lab-action");
const sideSelectCandidate = root.querySelector<HTMLSelectElement>("#technique-lab-side");
const classSelectCandidate = root.querySelector<HTMLSelectElement>("#technique-lab-class");
const speedSelectCandidate = root.querySelector<HTMLSelectElement>("#technique-lab-speed");
const soundInputCandidate = root.querySelector<HTMLInputElement>("#technique-lab-sound");
const originalCleanupInputCandidate = root.querySelector<HTMLInputElement>(
  "#technique-lab-original-cleanup",
);
const timelineInputCandidate = root.querySelector<HTMLInputElement>('[data-testid="technique-lab-timeline"]');
if (!canvasRootCandidate || !actionSelectCandidate || !sideSelectCandidate || !classSelectCandidate
  || !speedSelectCandidate || !soundInputCandidate || !originalCleanupInputCandidate
  || !timelineInputCandidate) {
  throw new Error("technique laboratory controls missing");
}
const canvasRoot: HTMLElement = canvasRootCandidate;
const actionSelect: HTMLSelectElement = actionSelectCandidate;
const sideSelect: HTMLSelectElement = sideSelectCandidate;
const classSelect: HTMLSelectElement = classSelectCandidate;
const speedSelect: HTMLSelectElement = speedSelectCandidate;
const soundInput: HTMLInputElement = soundInputCandidate;
const originalCleanupInput: HTMLInputElement = originalCleanupInputCandidate;
const timelineInput: HTMLInputElement = timelineInputCandidate;

const session = new TechniqueLabSession();
const renderer = startTechniqueLabPhaser(session, canvasRoot);
let playing = true;
let speed = 1;
let sound = false;
let originalCleanup = false;
let timeMs = 0;
let lastAnimationTime = performance.now();
let lightningTimeline: readonly TimedLightningFrame[] = [];
let durationMs = 0;
let phase = "main";
let visibleFrame = 0;
let playedAudioCues = new Set<number>();
let timelineActionCode: TechniqueLabNativeCode | undefined;

function rebuildTimeline(): void {
  timelineActionCode = session.state.actionCode;
  if (session.state.actionCode.endsWith("L")) {
    const definition = TECHNIQUE_LAB_LIGHTNING[
      session.state.actionCode as keyof typeof TECHNIQUE_LAB_LIGHTNING
    ];
    lightningTimeline = buildLightningTimeline(definition);
    durationMs = definition.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "1F") {
    lightningTimeline = [];
    durationMs = STAGE0_ACTION_PRESENTATION_ASSETS.fire1.effect.length * 100;
  } else if (session.state.actionCode === "1H") {
    lightningTimeline = [];
    durationMs = STAGE0_ACTION_PRESENTATION_ASSETS.heal1.primary.length * 50 + 50
      + STAGE0_ACTION_PRESENTATION_ASSETS.heal1.tail.length * 150;
  } else if (session.state.actionCode.endsWith("C")) {
    lightningTimeline = [];
    const definition = TECHNIQUE_LAB_ICE[
      session.state.actionCode as keyof typeof TECHNIQUE_LAB_ICE
    ];
    durationMs = definition.fixedGraphicWaitNativeTicks * 10;
  } else {
    throw new Error(`${session.state.actionCode} has no technique laboratory timeline`);
  }
  timelineInput.max = String(durationMs);
}

function visualFrameAt(currentTimeMs: number): TechniqueLabVisualFrame {
  const code = session.state.actionCode;
  if (code.endsWith("L")) {
    const frame = lightningFrameAtTime(lightningTimeline, currentTimeMs / 10);
    phase = frame.kind;
    visibleFrame = frame.kind === "main" ? frame.globalDrawIndex : frame.frame;
    return {
      kind: "lightning",
      frame,
      cleanupScope: originalCleanup ? "original-all-enemies" : "affected",
    };
  }
  if (code === "1F") {
    visibleFrame = Math.min(6, Math.floor(currentTimeMs / 100));
    phase = "fire";
    return { kind: "fire", frame: visibleFrame };
  }
  if (code === "1H") {
    const primaryDuration = STAGE0_ACTION_PRESENTATION_ASSETS.heal1.primary.length * 50;
    if (currentTimeMs < primaryDuration) {
      visibleFrame = Math.floor(currentTimeMs / 50);
      phase = "heal-primary";
      return { kind: "heal-primary", frame: visibleFrame };
    }
    if (currentTimeMs < primaryDuration + 50) {
      visibleFrame = -1;
      phase = "heal-blank";
      return { kind: "none" };
    }
    visibleFrame = Math.min(4, Math.floor((currentTimeMs - primaryDuration - 50) / 150));
    phase = "heal-tail";
    return { kind: "heal-tail", frame: visibleFrame };
  }
  const ice = TECHNIQUE_LAB_ICE[code as keyof typeof TECHNIQUE_LAB_ICE];
  const frameDuration = ice.cycle.waitPerDrawNativeTicks * 10;
  visibleFrame = Math.min(ice.cycles * ice.cycle.drawCount - 1, Math.floor(currentTimeMs / frameDuration));
  const iceFrame = iceFrameAtGlobalIndex(ice, visibleFrame);
  if (!iceFrame) throw new Error(`${code} has no ice frame ${visibleFrame}`);
  phase = "ice";
  return {
    kind: "ice",
    frame: visibleFrame,
    rangeValue: iceFrame.rangeValue,
    distanceFromCenter: iceFrame.distanceFromCenter,
  };
}

function playAudioBetween(previousMs: number, currentMs: number): void {
  if (!sound) return;
  if (session.state.actionCode.endsWith("L")) {
    const definition = TECHNIQUE_LAB_LIGHTNING[
      session.state.actionCode as keyof typeof TECHNIQUE_LAB_LIGHTNING
    ];
    definition.audioRequests.forEach((request, index) => {
      const cueMs = request.afterFixedWaitNativeTicks * 10;
      if (playedAudioCues.has(index) || cueMs < previousMs || cueMs > currentMs) return;
      playedAudioCues.add(index);
      const source = TECHNIQUE_LAB_AUDIO_ASSETS[
        request.resource as keyof typeof TECHNIQUE_LAB_AUDIO_ASSETS
      ];
      if (source) void new Audio(source).play().catch(() => undefined);
    });
    return;
  }
  if (session.state.actionCode.endsWith("C")) {
    const definition = TECHNIQUE_LAB_ICE[
      session.state.actionCode as keyof typeof TECHNIQUE_LAB_ICE
    ];
    const cycleMs = definition.cycle.drawCount
      * definition.cycle.waitPerDrawNativeTicks * 10;
    for (let cycle = 0; cycle < definition.cycles; cycle += 1) {
      const cueMs = cycle * cycleMs;
      if (playedAudioCues.has(cycle) || cueMs < previousMs || cueMs > currentMs) continue;
      playedAudioCues.add(cycle);
      const source = TECHNIQUE_LAB_AUDIO_ASSETS[definition.audioResource];
      if (source) void new Audio(source).play().catch(() => undefined);
    }
  }
}

function terminalHoldMs(): number {
  const holds: Readonly<Record<string, number>> = TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS;
  const nativeTicks = holds[session.state.actionCode];
  if (nativeTicks === undefined) {
    throw new Error(`${session.state.actionCode} has no implemented terminal-hold contract`);
  }
  return nativeTicks * 10;
}

function playbackState(): LabPlaybackState {
  return {
    actionCode: session.state.actionCode,
    playing,
    timeMs,
    durationMs,
    speed,
    sound,
    originalCleanup,
    terminalHoldMs: terminalHoldMs(),
    phase,
    frame: visibleFrame,
  };
}

function render(): void {
  const completed = durationMs > 0 && timeMs >= durationMs;
  if (completed) {
    phase = "complete";
    visibleFrame = -1;
    renderer.setVisualFrame({ kind: "none" });
  } else {
    renderer.setVisualFrame(visualFrameAt(timeMs));
  }
  timelineInput.value = String(Math.round(timeMs));
  const actor = session.actor();
  const center = session.effectCenter();
  const selfCenteredIce = session.state.actionCode.endsWith("C");
  const affected = session.affectedUnits();
  const damage = affected.map((unit) => {
    const preview = session.lightningDamageFor(unit);
    return `${className(unit.classId)}${preview === undefined ? "" : ` −${preview}`}`;
  }).join("、");
  const setReadout = (key: string, value: string): void => {
    const node = root.querySelector<HTMLElement>(`[data-readout="${key}"]`);
    if (node) node.textContent = value;
  };
  const phaseLabel = completed
    ? "完成 · 無殘留"
    : timeMs >= durationMs - terminalHoldMs()
      ? `${phase} · 末幀保持 ${terminalHoldMs()} ms`
    : phase === "cleanup"
      ? originalCleanup
        ? "cleanup · 原版全敵收尾（非命中）"
        : "cleanup · 實際命中範圍"
      : `${phase} · ${visibleFrame}`;
  setReadout("phase", phaseLabel);
  setReadout("time", `${Math.round(timeMs)} / ${durationMs} ms`);
  setReadout("actor", actor ? `${className(actor.classId)} · ${actor.side === 1 ? "我" : "敵"}` : "未指定");
  setReadout("target", center
    ? `${center.x}, ${center.y}${selfCenteredIce ? " · 施法者中心" : ""}`
    : "未指定");
  setReadout("affected", damage || "無");
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === session.state.tool));
    if (button.dataset.tool === "target") {
      button.disabled = selfCenteredIce;
      button.title = selfCenteredIce ? "冰雪只能以施法者為中心" : "";
    }
  }
  const hint = root.querySelector<HTMLElement>("[data-testid='technique-lab-hint']");
  if (hint) hint.textContent = selfCenteredIce
    ? "冰雪依原版鎖定施法者格為中心，不能指定目標格；藍圈與金框應重合。右鍵仍可刪除。"
    : "左鍵依目前工具操作；右鍵可隨時刪除。藍圈是施法者，金框是技能中心。預設收尾只顯示實際命中範圍。";
}

function restart(autoplay = true): void {
  timeMs = 0;
  playedAudioCues = new Set();
  playing = autoplay;
  lastAnimationTime = performance.now();
  playAudioBetween(-1, 0);
  render();
}

function seek(nextTimeMs: number): void {
  timeMs = Math.max(0, Math.min(durationMs, nextTimeMs));
  playedAudioCues = new Set();
  playing = false;
  render();
}

function step(): void {
  if (session.state.actionCode.endsWith("L")) {
    const next = lightningTimeline.find(({ startNativeTicks }) => startNativeTicks * 10 > timeMs + .01);
    seek(next ? next.startNativeTicks * 10 : durationMs);
    return;
  }
  const interval = session.state.actionCode === "1F" ? 100
    : session.state.actionCode === "1H" ? 50
      : TECHNIQUE_LAB_ICE[
        session.state.actionCode as keyof typeof TECHNIQUE_LAB_ICE
      ].cycle.waitPerDrawNativeTicks * 10;
  seek(Math.min(durationMs, timeMs + interval));
}

function syncClassAvailability(): void {
  const ally = session.state.placementSide === 1;
  for (const option of Array.from(classSelect.options)) {
    if (!isClassId(option.value)) continue;
    option.disabled = ally && TECHNIQUE_LAB_UNIT_ASSETS[option.value].ally === null;
  }
  classSelect.value = session.state.placementClass;
}

rebuildTimeline();
session.subscribe(() => {
  if (timelineActionCode !== session.state.actionCode) rebuildTimeline();
  actionSelect.value = session.state.actionCode;
  sideSelect.value = String(session.state.placementSide);
  syncClassAvailability();
  render();
});

root.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button) return;
  const tool = button.dataset.tool as TechniqueLabTool | undefined;
  if (tool) session.setTool(tool);
  const command = button.dataset.command;
  if (command === "restart") restart(true);
  else if (command === "play") {
    if (timeMs >= durationMs) timeMs = 0;
    playing = true;
    lastAnimationTime = performance.now();
    playAudioBetween(-1, timeMs);
  } else if (command === "pause") playing = false;
  else if (command === "step") step();
  else if (command === "reset") {
    session.reset();
    restart(true);
  } else if (command === "clear") session.clear();
  render();
});

actionSelect.addEventListener("change", () => {
  if (session.setActionCode(actionSelect.value as TechniqueLabNativeCode)) {
    restart(true);
  }
});
sideSelect.addEventListener("change", () => {
  session.setPlacementSide(Number(sideSelect.value) as TechniqueLabSide);
  syncClassAvailability();
});
classSelect.addEventListener("change", () => {
  if (isClassId(classSelect.value)) session.setPlacementClass(classSelect.value);
});
speedSelect.addEventListener("change", () => {
  speed = Number(speedSelect.value);
  render();
});
soundInput.addEventListener("change", () => {
  sound = soundInput.checked;
  playedAudioCues = new Set();
  if (sound) playAudioBetween(-1, timeMs);
  render();
});
originalCleanupInput.addEventListener("change", () => {
  originalCleanup = originalCleanupInput.checked;
  render();
});
timelineInput.addEventListener("input", () => seek(Number(timelineInput.value)));

function animate(now: number): void {
  if (playing) {
    const previous = timeMs;
    // A control event can call restart() after the browser has captured this
    // frame's RAF timestamp. Never let that older timestamp move the semantic
    // animation clock below zero or into an invalid generated frame.
    const elapsedMs = Math.max(0, now - lastAnimationTime);
    timeMs = Math.min(durationMs, timeMs + elapsedMs * speed);
    playAudioBetween(previous, timeMs);
    if (timeMs >= durationMs) playing = false;
    render();
  }
  lastAnimationTime = now;
  requestAnimationFrame(animate);
}

restart(true);
requestAnimationFrame(animate);

window.addEventListener("pagehide", () => renderer.game.destroy(true), { once: true });

declare global {
  interface Window {
    __ANGEL2_TECHNIQUE_LAB__?: {
      getState: () => { session: TechniqueLabState; playback: LabPlaybackState };
      seek: (timeMs: number) => void;
      play: () => void;
      pause: () => void;
      setActionCode: (code: TechniqueLabNativeCode) => boolean;
    };
  }
}

window.__ANGEL2_TECHNIQUE_LAB__ = {
  getState: () => ({ session: structuredClone(session.state), playback: playbackState() }),
  seek,
  play: () => {
    playing = true;
    lastAnimationTime = performance.now();
  },
  pause: () => {
    playing = false;
  },
  setActionCode: (code) => {
    const changed = session.setActionCode(code);
    if (changed) {
      restart(false);
    }
    return changed;
  },
};
