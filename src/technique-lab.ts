import "./styles.css";
import "./technique-lab.css";
import {
  CLASS_IDS,
  className,
  isClassId,
} from "./game/content/classes";
import { STAGE0_ACTION_PRESENTATION_ASSETS } from "./game/content/stage0-actions.generated";
import {
  STAGE1_ACTION_PRESENTATION,
} from "./game/content/stage1-actions.generated";
import {
  TECHNIQUE_LAB_ATTACK_UP,
  TECHNIQUE_LAB_DEFENSE_UP,
  TECHNIQUE_LAB_MAGIC_GUARD,
  TECHNIQUE_LAB_POISON,
  TECHNIQUE_LAB_CONFUSION,
  TECHNIQUE_LAB_ATTACK_DOWN,
  TECHNIQUE_LAB_DEFENSE_DOWN,
  TECHNIQUE_LAB_SPELL_SEAL,
  TECHNIQUE_LAB_PRAYER,
  TECHNIQUE_LAB_CATALOG,
  TECHNIQUE_LAB_DISPEL,
  TECHNIQUE_LAB_FIRE,
  TECHNIQUE_LAB_HEAL,
  TECHNIQUE_LAB_ICE,
  TECHNIQUE_LAB_LIGHTNING,
  TECHNIQUE_LAB_STOMPS,
  TECHNIQUE_LAB_TERMINAL_HOLD_NATIVE_TICKS,
  TECHNIQUE_LAB_UNIT_ASSETS,
} from "./game/content/technique-lab.generated";
import {
  TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS,
} from "./game/content/technique-lab-formal-assets";
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
import {
  buildStompPresentationSteps,
  stompPresentationStepAtTime,
  type StompPresentationStep,
} from "./game/stomp-presentation";
import { prepareSoundEffectBuffers } from "./game/sound-effect-cache";
import {
  SoundEffectTransport,
  type SoundEffectPlayback,
  type SoundEffectTransportState,
} from "./game/sound-effect-transport";

interface LabPlaybackState {
  readonly actionCode: TechniqueLabNativeCode;
  readonly playing: boolean;
  readonly timeMs: number;
  readonly durationMs: number;
  readonly speed: number;
  readonly sound: boolean;
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
        <p>任意配置敵我職業，以正式戰役資源映射直接重放原版地圖技能腳本；不建立關卡、不提交傷害或存檔。</p>
      </div>
      <nav class="technique-lab-nav" aria-label="返回入口">
        <a href="/debug.html" class="technique-lab-back" data-testid="technique-lab-debug-link">戰役調試中心</a>
        <a href="/" class="technique-lab-back">普通遊戲</a>
      </nav>
    </header>

    <div class="technique-lab-layout">
      <section class="technique-lab-stage-card" aria-label="技能地圖預覽">
        <div id="technique-lab-canvas" class="technique-lab-canvas" data-testid="technique-lab-canvas"></div>
        <div class="technique-lab-transport">
          <button type="button" data-command="restart" data-testid="technique-lab-restart">從頭</button>
          <button type="button" data-command="play" data-testid="technique-lab-play">播放</button>
          <button type="button" data-command="pause" data-testid="technique-lab-pause">暫停</button>
          <button type="button" data-command="step" data-testid="technique-lab-step">單步</button>
          <button type="button" data-command="next-side-phase" data-testid="technique-lab-next-side-phase">推進陣營階段</button>
          <label>時間軸 <input data-testid="technique-lab-timeline" type="range" min="0" value="0" step="1" /></label>
        </div>
        <dl class="technique-lab-readout">
          <div><dt>階段</dt><dd data-readout="phase">—</dd></div>
          <div><dt>時間</dt><dd data-readout="time">—</dd></div>
          <div><dt>施法者</dt><dd data-readout="actor">—</dd></div>
          <div><dt>目標</dt><dd data-readout="target">—</dd></div>
          <div><dt>命中預覽</dt><dd data-readout="affected">—</dd></div>
          <div><dt>規則結果</dt><dd data-readout="result">—</dd></div>
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
const timelineInputCandidate = root.querySelector<HTMLInputElement>('[data-testid="technique-lab-timeline"]');
if (!canvasRootCandidate || !actionSelectCandidate || !sideSelectCandidate || !classSelectCandidate
  || !speedSelectCandidate || !soundInputCandidate || !timelineInputCandidate) {
  throw new Error("technique laboratory controls missing");
}
const canvasRoot: HTMLElement = canvasRootCandidate;
const actionSelect: HTMLSelectElement = actionSelectCandidate;
const sideSelect: HTMLSelectElement = sideSelectCandidate;
const classSelect: HTMLSelectElement = classSelectCandidate;
const speedSelect: HTMLSelectElement = speedSelectCandidate;
const soundInput: HTMLInputElement = soundInputCandidate;
const timelineInput: HTMLInputElement = timelineInputCandidate;

const session = new TechniqueLabSession();
const isStompCode = (code: TechniqueLabNativeCode): code is "1D" | "2D" | "3D" =>
  code === "1D" || code === "2D" || code === "3D";
const isFireCode = (code: TechniqueLabNativeCode): code is keyof typeof TECHNIQUE_LAB_FIRE =>
  code === "1F" || code === "2F" || code === "3F" || code === "4F";
const isHealCode = (code: TechniqueLabNativeCode): code is "1H" | keyof typeof TECHNIQUE_LAB_HEAL =>
  code === "1H" || code === "2H" || code === "3H";
const isRecoveryCode = (code: TechniqueLabNativeCode): code is "1I" | "2I" | "3I" =>
  code === "1I" || code === "2I" || code === "3I";
const recoveryPresentationFor = (code: "1I" | "2I" | "3I") => code === "3I"
  ? STAGE1_ACTION_PRESENTATION.recovery3
  : code === "2I"
    ? STAGE1_ACTION_PRESENTATION.recovery2
    : STAGE1_ACTION_PRESENTATION.recovery1;
const isConstructionCode = (code: TechniqueLabNativeCode): code is "1K" | "2K" =>
  code === "1K" || code === "2K";
const renderer = startTechniqueLabPhaser(session, canvasRoot);
let playing = true;
let speed = 1;
let sound = false;
let timeMs = 0;
let lastAnimationTime = performance.now();
let lightningTimeline: readonly TimedLightningFrame[] = [];
let stompTimeline: readonly StompPresentationStep[] = [];
let durationMs = 0;
let phase = "main";
let visibleFrame = 0;
let playedAudioCues = new Set<number>();
let timelineActionCode: TechniqueLabNativeCode | undefined;
let iceOutcomeCleared = false;
let iceOutcomeApplied = false;
let frozenUnitIds = new Set<string>();
const activeAudio = new Set<SoundEffectPlayback>();
const updateSoundEffectDebugState = (state: SoundEffectTransportState): void => {
  root.dataset.soundEffectEngine = "web-audio";
  root.dataset.soundEffectContext = state.contextState;
  root.dataset.soundEffectBufferCount = String(state.bufferCount);
  root.dataset.soundEffectScheduleCount = String(state.scheduledCount);
  root.dataset.soundEffectActiveCount = String(state.activeCount);
  if (state.error) root.dataset.soundEffectError = state.error;
  else delete root.dataset.soundEffectError;
};
const soundEffects = new SoundEffectTransport(1, updateSoundEffectDebugState);
root.dataset.soundEffectReady = "false";
soundInput.disabled = true;
root.addEventListener("pointerdown", () => soundEffects.unlock(), { capture: true });
// Decoding every effect buffer must not gate this module's own evaluation. A
// top-level `await` does not hold the document's load event, so awaiting here
// left the session, the RAF loop and `window.__ANGEL2_TECHNIQUE_LAB__` all
// missing at the moment the page already reported itself loaded — every
// `setActionCode` and `pause` from a freshly opened page was silently dropped.
// Sound readiness stays observable through `data-sound-effect-ready`.
void prepareSoundEffectBuffers(Object.values(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS)).then(() => {
  root.dataset.soundEffectReady = "true";
  soundInput.disabled = false;
}).catch((error: unknown) => {
  root.dataset.soundEffectError = error instanceof Error ? error.message : String(error);
});

function iceFrozenUnitIds(): readonly string[] {
  if (!session.state.actionCode.endsWith("C")) return [];
  return session.affectedUnits()
    .filter(({ classId }) => classId !== "dragon" && classId !== "head" && classId !== "hand")
    .map(({ id }) => id);
}

function rebuildTimeline(): void {
  timelineActionCode = session.state.actionCode;
  stompTimeline = [];
  if (session.state.actionCode.endsWith("L")) {
    const definition = TECHNIQUE_LAB_LIGHTNING[
      session.state.actionCode as keyof typeof TECHNIQUE_LAB_LIGHTNING
    ];
    lightningTimeline = buildLightningTimeline(definition);
    durationMs = definition.fixedGraphicWaitNativeTicks * 10;
  } else if (isStompCode(session.state.actionCode)) {
    lightningTimeline = [];
    stompTimeline = buildStompPresentationSteps(
      TECHNIQUE_LAB_STOMPS[session.state.actionCode].presentation,
    );
    durationMs = (stompTimeline.at(-1)?.endDisplayNativeTicks ?? 0) * 10;
  } else if (isConstructionCode(session.state.actionCode)) {
    lightningTimeline = [];
    durationMs = 1;
  } else if (isFireCode(session.state.actionCode)) {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_FIRE[session.state.actionCode].fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "1H") {
    lightningTimeline = [];
    durationMs = STAGE0_ACTION_PRESENTATION_ASSETS.heal1.primary.length * 50 + 50
      + STAGE0_ACTION_PRESENTATION_ASSETS.heal1.tail.length * 150;
  } else if (session.state.actionCode === "2H" || session.state.actionCode === "3H") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_HEAL[session.state.actionCode].fixedGraphicWaitNativeTicks * 10;
  } else if (isRecoveryCode(session.state.actionCode)) {
    lightningTimeline = [];
    const recovery = recoveryPresentationFor(session.state.actionCode);
    durationMs = recovery.presentation
      .fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "AA") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_ATTACK_UP.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "AD") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_DEFENSE_UP.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "FM") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_MAGIC_GUARD.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "IP") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_POISON.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "LA") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_CONFUSION.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "SA") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_ATTACK_DOWN.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "SD") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_DEFENSE_DOWN.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "SN") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_SPELL_SEAL.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "OJ") {
    lightningTimeline = [];
    durationMs = Math.max(1, session.prayerPreview().filter(({ passed }) => passed).length)
      * TECHNIQUE_LAB_PRAYER.presentation.resultHold.maximumNativeTicksPerTriggeredUnit * 10;
  } else if (session.state.actionCode.endsWith("C")) {
    lightningTimeline = [];
    const definition = TECHNIQUE_LAB_ICE[
      session.state.actionCode as keyof typeof TECHNIQUE_LAB_ICE
    ];
    durationMs = definition.fixedGraphicWaitNativeTicks * 10;
  } else if (session.state.actionCode === "TR") {
    lightningTimeline = [];
    durationMs = TECHNIQUE_LAB_DISPEL.fixedGraphicWaitNativeTicks * 10;
  } else {
    throw new Error(`${session.state.actionCode} has no technique laboratory timeline`);
  }
  timelineInput.max = String(durationMs);
}

function visualFrameAt(currentTimeMs: number): TechniqueLabVisualFrame {
  const code = session.state.actionCode;
  if (isConstructionCode(code)) {
    const completed = currentTimeMs >= durationMs;
    visibleFrame = completed ? 1 : 0;
    phase = completed ? "construction-complete" : "movement-before";
    return { kind: "construction", completed };
  }
  if (code.endsWith("L")) {
    const frame = lightningFrameAtTime(lightningTimeline, currentTimeMs / 10);
    phase = frame.kind;
    visibleFrame = frame.kind === "main" ? frame.globalDrawIndex : frame.frame;
    return { kind: "lightning", frame };
  }
  if (isStompCode(code)) {
    const step = stompPresentationStepAtTime(stompTimeline, currentTimeMs / 10);
    visibleFrame = step.index;
    phase = step.phase;
    return { kind: "stomp", step };
  }
  if (isFireCode(code)) {
    const definition = TECHNIQUE_LAB_FIRE[code];
    const waitNativeTicks = definition.phases[0]?.waitPerDrawNativeTicks ?? 10;
    const drawCount = definition.phases.reduce((total, candidate) => total + candidate.drawCount, 0);
    visibleFrame = Math.min(drawCount - 1, Math.floor(currentTimeMs / (waitNativeTicks * 10)));
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
  if (code === "2H" || code === "3H") {
    const definition = TECHNIQUE_LAB_HEAL[code];
    let remainingNativeTicks = currentTimeMs / 10;
    let primaryFrameBase = 0;
    for (const [phaseIndex, candidate] of definition.phases.entries()) {
      const phaseDuration = candidate.drawCount * candidate.waitPerDrawNativeTicks;
      if (remainingNativeTicks < phaseDuration) {
        const localFrame = Math.min(
          candidate.drawCount - 1,
          Math.floor(remainingNativeTicks / candidate.waitPerDrawNativeTicks),
        );
        const tail = phaseIndex === definition.phases.length - 1;
        visibleFrame = tail ? localFrame : primaryFrameBase + localFrame;
        phase = tail ? "heal-tail" : "heal-primary";
        return { kind: tail ? "heal-tail" : "heal-primary", frame: visibleFrame };
      }
      remainingNativeTicks -= phaseDuration;
      if (phaseIndex < definition.phases.length - 1) primaryFrameBase += candidate.drawCount;
    }
    throw new Error(`${code} has no heal frame at ${currentTimeMs} ms`);
  }
  if (isRecoveryCode(code)) {
    const recovery = recoveryPresentationFor(code).presentation;
    visibleFrame = Math.min(
      recovery.drawCount - 1,
      Math.floor(currentTimeMs / (recovery.waitPerDrawNativeTicks * 10)),
    );
    phase = "recovery";
    return { kind: "recovery", frame: visibleFrame };
  }
  if (code === "AA") {
    const statusPhase = TECHNIQUE_LAB_ATTACK_UP.phases[0];
    visibleFrame = Math.min(
      statusPhase.drawCount - 1,
      Math.floor(currentTimeMs / (statusPhase.waitPerDrawNativeTicks * 10)),
    );
    phase = "status";
    return { kind: "status", action: "attack-up", frame: visibleFrame };
  }
  if (code === "AD") {
    const statusPhase = TECHNIQUE_LAB_DEFENSE_UP.phases[0];
    visibleFrame = Math.min(
      statusPhase.drawCount - 1,
      Math.floor(currentTimeMs / (statusPhase.waitPerDrawNativeTicks * 10)),
    );
    phase = "status";
    return { kind: "status", action: "defense-up", frame: visibleFrame };
  }
  if (code === "FM") {
    const statusPhase = TECHNIQUE_LAB_MAGIC_GUARD.phases[0];
    visibleFrame = Math.min(
      statusPhase.drawCount - 1,
      Math.floor(currentTimeMs / (statusPhase.waitPerDrawNativeTicks * 10)),
    );
    phase = "status";
    return { kind: "status", action: "magic-guard", frame: visibleFrame };
  }
  if (code === "IP") {
    let nativeTicks = currentTimeMs / 10;
    const rise = TECHNIQUE_LAB_POISON.phases[0];
    const riseDuration = rise.drawCount * rise.waitPerDrawNativeTicks;
    if (nativeTicks < riseDuration) {
      visibleFrame = Math.min(
        rise.drawCount - 1,
        Math.floor(nativeTicks / rise.waitPerDrawNativeTicks),
      );
      phase = "poison-rise";
      return { kind: "poison", phase: 0, frame: visibleFrame };
    }
    nativeTicks -= riseDuration;
    const cloud = TECHNIQUE_LAB_POISON.phases[1];
    visibleFrame = Math.min(
      cloud.drawCount - 1,
      Math.floor(nativeTicks / cloud.waitPerDrawNativeTicks),
    );
    phase = "poison-cloud";
    return { kind: "poison", phase: 1, frame: visibleFrame };
  }
  if (code === "LA") {
    const statusPhase = TECHNIQUE_LAB_CONFUSION.phases[0];
    visibleFrame = Math.min(
      statusPhase.drawCount - 1,
      Math.floor(currentTimeMs / (statusPhase.waitPerDrawNativeTicks * 10)),
    );
    phase = "status";
    return { kind: "status", action: "confusion", frame: visibleFrame };
  }
  if (code === "SA") {
    const statusPhase = TECHNIQUE_LAB_ATTACK_DOWN.phases[0];
    visibleFrame = Math.min(
      statusPhase.drawCount - 1,
      Math.floor(currentTimeMs / (statusPhase.waitPerDrawNativeTicks * 10)),
    );
    phase = "status";
    return { kind: "status", action: "attack-down", frame: visibleFrame };
  }
  if (code === "SD") {
    const statusPhase = TECHNIQUE_LAB_DEFENSE_DOWN.phases[0];
    visibleFrame = Math.min(
      statusPhase.drawCount - 1,
      Math.floor(currentTimeMs / (statusPhase.waitPerDrawNativeTicks * 10)),
    );
    phase = "status";
    return { kind: "status", action: "defense-down", frame: visibleFrame };
  }
  if (code === "SN") {
    const statusPhase = TECHNIQUE_LAB_SPELL_SEAL.phases[0];
    visibleFrame = Math.min(
      statusPhase.drawCount - 1,
      Math.floor(currentTimeMs / (statusPhase.waitPerDrawNativeTicks * 10)),
    );
    phase = "status";
    return { kind: "status", action: "spell-seal", frame: visibleFrame };
  }
  if (code === "OJ") {
    const passed = session.prayerPreview().filter((candidate) =>
      candidate.passed && candidate.outcome !== undefined);
    if (passed.length === 0) {
      visibleFrame = -1;
      phase = "prayer-no-response";
      return { kind: "none" };
    }
    const holdMs = TECHNIQUE_LAB_PRAYER.presentation.resultHold
      .maximumNativeTicksPerTriggeredUnit * 10;
    visibleFrame = Math.min(passed.length - 1, Math.floor(currentTimeMs / holdMs));
    const preview = passed[visibleFrame];
    if (!preview?.outcome) throw new Error("OJ prayer preview outcome missing");
    phase = `prayer-${visibleFrame + 1}/${passed.length}`;
    return {
      kind: "prayer",
      outcome: preview.outcome,
      rolledAmount: preview.rolledAmount,
      unitId: preview.unit.id,
    };
  }
  if (code === "TR") {
    const states: Array<readonly number[]> = [];
    for (const { runtimeTileCodeStates } of TECHNIQUE_LAB_DISPEL.phases) {
      for (const state of runtimeTileCodeStates) states.push(state);
    }
    visibleFrame = Math.min(states.length - 1, Math.floor(currentTimeMs / 50));
    phase = "dispel";
    return {
      kind: "dispel",
      frame: visibleFrame,
      runtimeTileCodes: states[visibleFrame] ?? [],
    };
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

function stopAudio(): void {
  for (const playback of activeAudio) playback.stop();
  activeAudio.clear();
}

function playSource(source: string): void {
  let playback: SoundEffectPlayback | undefined;
  playback = soundEffects.play(source, 1, () => {
    if (playback) activeAudio.delete(playback);
  });
  if (playback) activeAudio.add(playback);
}

function playAudioBetween(previousMs: number, currentMs: number): void {
  if (!sound) return;
  if (isFireCode(session.state.actionCode)) {
    const definition = TECHNIQUE_LAB_FIRE[session.state.actionCode];
    definition.audioRequests.forEach((request, index) => {
      const cueMs = request.afterFixedWaitNativeTicks * 10;
      if (playedAudioCues.has(index) || cueMs < previousMs || cueMs > currentMs) return;
      playedAudioCues.add(index);
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS[
        request.resource as keyof typeof TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS
      ];
      if (source) playSource(source);
    });
    return;
  }
  if (isHealCode(session.state.actionCode)) {
    const requests = session.state.actionCode === "1H"
      ? [{ resource: "E/36", afterFixedWaitNativeTicks: 0 }]
      : TECHNIQUE_LAB_HEAL[session.state.actionCode].audioRequests;
    requests.forEach((request, index) => {
      const cueMs = request.afterFixedWaitNativeTicks * 10;
      if (playedAudioCues.has(index) || cueMs < previousMs || cueMs > currentMs) return;
      playedAudioCues.add(index);
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS[
        request.resource as keyof typeof TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS
      ];
      if (source) playSource(source);
    });
    return;
  }
  if (isRecoveryCode(session.state.actionCode)) {
    if (!playedAudioCues.has(0) && previousMs <= 0 && currentMs >= 0) {
      playedAudioCues.add(0);
      playSource(TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["E/36"]);
    }
    return;
  }
  if (session.state.actionCode === "AA") {
    if (!playedAudioCues.has(0) && previousMs <= 0 && currentMs >= 0) {
      playedAudioCues.add(0);
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["UN/51"];
      if (source) playSource(source);
    }
    return;
  }
  if (session.state.actionCode === "AD") {
    if (!playedAudioCues.has(0) && previousMs <= 0 && currentMs >= 0) {
      playedAudioCues.add(0);
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["UN/52"];
      if (source) playSource(source);
    }
    return;
  }
  if (session.state.actionCode === "FM") {
    if (!playedAudioCues.has(0) && previousMs <= 0 && currentMs >= 0) {
      playedAudioCues.add(0);
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["UN/51"];
      if (source) playSource(source);
    }
    return;
  }
  if (session.state.actionCode === "IP") {
    TECHNIQUE_LAB_POISON.audioRequests.forEach((request, index) => {
      const cueMs = request.afterFixedWaitNativeTicks * 10;
      if (playedAudioCues.has(index) || cueMs < previousMs || cueMs > currentMs) return;
      playedAudioCues.add(index);
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS[request.resource];
      if (source) playSource(source);
    });
    return;
  }
  if (session.state.actionCode === "SA" || session.state.actionCode === "SD") {
    if (!playedAudioCues.has(0) && previousMs <= 0 && currentMs >= 0) {
      playedAudioCues.add(0);
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS["E/8"];
      if (source) playSource(source);
    }
    return;
  }
  if (session.state.actionCode.endsWith("L")) {
    const definition = TECHNIQUE_LAB_LIGHTNING[
      session.state.actionCode as keyof typeof TECHNIQUE_LAB_LIGHTNING
    ];
    definition.audioRequests.forEach((request, index) => {
      const cueMs = request.afterFixedWaitNativeTicks * 10;
      if (playedAudioCues.has(index) || cueMs < previousMs || cueMs > currentMs) return;
      playedAudioCues.add(index);
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS[
        request.resource as keyof typeof TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS
      ];
      if (source) playSource(source);
    });
    return;
  }
  if (isStompCode(session.state.actionCode)) {
    for (const step of stompTimeline) {
      const cueMs = step.endDisplayNativeTicks * 10;
      if (!step.audioAfter
        || playedAudioCues.has(step.index)
        || cueMs < previousMs
        || cueMs > currentMs) continue;
      playedAudioCues.add(step.index);
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS[
        TECHNIQUE_LAB_STOMPS[session.state.actionCode].audioResource
      ];
      if (source) playSource(source);
    }
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
      const source = TECHNIQUE_LAB_FORMAL_AUDIO_ASSETS[definition.audioResource];
      if (source) playSource(source);
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
    terminalHoldMs: terminalHoldMs(),
    phase,
    frame: visibleFrame,
  };
}

function render(): void {
  const completed = durationMs > 0 && timeMs >= durationMs;
  if (completed
    && session.state.actionCode.endsWith("C")
    && !iceOutcomeCleared
    && !iceOutcomeApplied) {
    frozenUnitIds = new Set([...frozenUnitIds, ...iceFrozenUnitIds()]);
    iceOutcomeApplied = true;
  }
  if (completed && session.state.actionCode === "TR") {
    for (const { id } of session.affectedUnits()) frozenUnitIds.delete(id);
  }
  if (isConstructionCode(session.state.actionCode)) {
    renderer.setFrozenUnitIds([...frozenUnitIds]);
    renderer.setVisualFrame(visualFrameAt(timeMs));
  } else if (completed) {
    phase = "complete";
    visibleFrame = -1;
    renderer.setVisualFrame({ kind: "none" });
    renderer.setFrozenUnitIds([...frozenUnitIds]);
  } else {
    renderer.setFrozenUnitIds([...frozenUnitIds]);
    renderer.setVisualFrame(visualFrameAt(timeMs));
  }
  timelineInput.value = String(Math.round(timeMs));
  const actor = session.actor();
  const center = session.effectCenter();
  const selfCentered = session.state.actionCode.endsWith("C")
    || session.state.actionCode === "OJ";
  const affected = session.affectedUnits();
  const damage = affected.map((unit) => {
    const preview = session.damagePreviewFor(unit);
    const damagingPreview = session.state.actionCode.endsWith("L")
      || isStompCode(session.state.actionCode)
      || isFireCode(session.state.actionCode);
    return `${className(unit.classId)}${preview === undefined
      ? ""
      : damagingPreview ? ` −${preview}` : ` · ${preview}`}`;
  }).join("、");
  const setReadout = (key: string, value: string): void => {
    const node = root.querySelector<HTMLElement>(`[data-readout="${key}"]`);
    if (node) node.textContent = value;
  };
  const phaseLabel = isConstructionCode(session.state.actionCode)
    ? completed
      ? "構築完成 · 原版即時地圖重繪"
      : "普通移動前 · 無專用技能動畫"
    : completed
    ? "完成 · 無殘留"
    : timeMs >= durationMs - terminalHoldMs()
      ? `${phase} · 末幀保持 ${terminalHoldMs()} ms`
    : phase === "cleanup"
      ? "共同收尾 · 效果範圍內敵軍"
      : phase === "wave"
        ? `逐格錯相命中 · ${visibleFrame}`
      : `${phase} · ${visibleFrame}`;
  setReadout("phase", phaseLabel);
  setReadout("time", `${Math.round(timeMs)} / ${durationMs} ms`);
  setReadout("actor", actor ? `${className(actor.classId)} · ${actor.side === 1 ? "我" : "敵"}` : "未指定");
  setReadout("target", center
    ? `${center.x}, ${center.y}${selfCentered ? " · 施法者中心" : ""}`
    : "未指定");
  const constructionLabel = session.state.actionCode === "2K" ? "障礙" : "鐵板";
  setReadout("affected", isConstructionCode(session.state.actionCode)
    ? `${session.effectCells().length} 格${constructionLabel}地形`
    : damage || "無");
  setReadout("result", isConstructionCode(session.state.actionCode)
    ? completed
      ? `工兵移至目標；${session.state.actionCode === "2K" ? "設置" : "鋪設"} ${session.effectCells().length} 格${constructionLabel} · 零技術動畫／音效／經驗`
      : "普通移動完成後才立即寫入四鄰地形"
    : session.state.actionCode.endsWith("C")
    ? completed && !iceOutcomeCleared
      ? `冰封 ${iceFrozenUnitIds().length} 名 · 跳過下一次本陣營行動、不可攻治且不可疊加`
      : completed
        ? "已經歷一次本陣營階段 · 冰封解除"
        : "演出完成後套用冰封"
    : session.state.actionCode === "TR"
      ? completed
        ? "破邪完成 · 解除目標的冰封與異常狀態"
        : "演出完成後解除目標的冰封與異常狀態"
    : session.state.actionCode === "AA"
      ? completed
        ? "攻擊 +20 · 狀態重置為 3 · 冰封目標仍保持冰封"
        : "300 tick 完整演出後才寫入攻擊提升與 10..13 經驗"
    : session.state.actionCode === "AD"
      ? completed
        ? "防禦 +20 · 狀態重置為 3 · 冰封目標仍保持冰封"
        : "165 tick 完整演出後才寫入防禦提升與 10..13 經驗"
    : session.state.actionCode === "FM"
      ? completed
        ? "防魔狀態重置為 1 · 一次性魔法保護 · 冰封目標仍保持冰封"
        : "300 tick 完整演出後才寫入防魔與 10..13 經驗"
    : session.state.actionCode === "IP"
      ? completed
        ? session.affectedUnits().some(({ classId }) =>
          TECHNIQUE_LAB_POISON.immuneClassIds.some((immune) => immune === classId))
          ? "290 tick 完整演出完成 · 龍／頭／手免疫中毒寫入 · 仍取得 14..17 經驗"
          : "中毒狀態重置為 3 · 每完整輪生命折半但不致死 · 冰封時跳過毒傷並消耗計數"
        : "MAGIC/17 130 tick 後請求 E/58，再播放 MAGIC/18；290 tick 後才提交"
    : session.state.actionCode === "LA"
      ? completed
        ? session.affectedUnits().some(({ classId }) =>
          TECHNIQUE_LAB_CONFUSION.immuneClassIds.some((immune) => immune === classId))
          ? "165 tick 完整演出完成 · 龍／頭／手免疫混亂寫入 · 仍取得 14..17 經驗"
          : "混亂狀態重置為 3 · 自動普通職業撤退、射擊／技術類只隨機移動"
        : "MAGIC/44 十一組 3×2 描述符；165 tick 後才提交，原版無音效"
    : session.state.actionCode === "SA"
      ? completed
        ? "攻擊 -20 · 狀態重置為 3 · 攻擊提升可並存相消 · 冰封目標仍保持冰封"
        : "MAGIC/46 十一組 1×2 描述符；開頭請求 E/8，165 tick 後才提交 10..13 經驗"
    : session.state.actionCode === "SD"
      ? completed
        ? "防禦 -20 · 狀態重置為 3 · 防禦提升可並存相消 · 冰封目標仍保持冰封"
        : "MAGIC/45 十組 2×2 描述符；開頭請求 E/8，150 tick 後才提交 10..13 經驗"
    : session.state.actionCode === "SN"
      ? completed
        ? session.affectedUnits().some(({ classId }) =>
          TECHNIQUE_LAB_SPELL_SEAL.immuneClassIds.some((immune) => immune === classId))
          ? "225 tick 完整演出完成 · 龍免疫禁咒寫入 · 仍取得 14..17 經驗"
          : session.affectedUnits().some(({ classId }) => classId === "head" || classId === "hand")
            ? "禁咒狀態重置為 3 · 頭／手專屬行動不讀取此狀態 · 冰封目標仍保持冰封"
            : "禁咒狀態重置為 3 · 技術菜單與技術 AI 暫停 · 冰封目標仍保持冰封"
        : "MAGIC/36 九組 3×2 描述符；原版無音效，225 tick 後才提交 14..17 經驗"
    : session.state.actionCode === "OJ"
      ? completed
        ? `固定種子：${session.prayerPreview().filter(({ passed }) => passed).length} 名通過，逐人結算完成；原版無歸檔圖形／音效`
        : "全圖 side 1 逐格抽門；每名通過者獨立程序繪圖、結果文字、提交與最多 60 tick 停留"
    : session.state.actionCode.endsWith("L")
      ? "各級獨立波紋／共用 MAGIC/6 收尾；不提交傷害"
      : isFireCode(session.state.actionCode)
        ? `${TECHNIQUE_LAB_FIRE[session.state.actionCode].percentMaxLife}% 最大生命／上限 ${TECHNIQUE_LAB_FIRE[session.state.actionCode].damageCap}；完整火焰後逐點扣血，實驗室不提交傷害`
      : session.state.actionCode === "2H"
        ? `${TECHNIQUE_LAB_HEAL["2H"].maxLifePercent}% 最大生命上限；14 個六圖塊心盾後接 5 幀共同尾效，實驗室不提交治療或經驗`
      : session.state.actionCode === "3H"
        ? `${TECHNIQUE_LAB_HEAL["3H"].maxLifePercent}% 最大生命上限；33 次繪製／235 tick 後才結算，實驗室不提交治療或經驗`
      : session.state.actionCode === "2I"
        ? "選擇距離 5／效果半徑 3；外／中／中心恢復 50／70／90，冰封單位跳過；17 階段後才結算，實驗室不提交治療或經驗"
      : session.state.actionCode === "3I"
        ? "選擇距離 6／效果半徑 4；外至中心恢復 35／60／85／110，冰封單位跳過；17 階段後才結算，實驗室不提交治療或經驗"
      : isStompCode(session.state.actionCode)
        ? `${TECHNIQUE_LAB_STOMPS[session.state.actionCode].action.visibleName}並集命中 ${affected.length} 名 · 每名獨立預覽 ${TECHNIQUE_LAB_STOMPS[session.state.actionCode].damageBase}..${TECHNIQUE_LAB_STOMPS[session.state.actionCode].damageBase * 2 - 1}；實驗室不提交傷害`
      : "只預覽動畫／命中範圍");
  const nextPhaseButton = root.querySelector<HTMLButtonElement>(
    '[data-command="next-side-phase"]',
  );
  if (nextPhaseButton) nextPhaseButton.disabled = !(
    completed && session.state.actionCode.endsWith("C") && !iceOutcomeCleared
  );
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === session.state.tool));
    if (button.dataset.tool === "target") {
      button.disabled = selfCentered;
      button.title = selfCentered
        ? session.state.actionCode === "OJ" ? "祈禱不選目標格" : "冰雪只能以施法者為中心"
        : "";
    }
  }
  const hint = root.querySelector<HTMLElement>("[data-testid='technique-lab-hint']");
  if (hint) hint.textContent = session.state.actionCode.endsWith("C")
    ? "冰雪依原版鎖定施法者格為中心，不能指定目標格；藍圈與金框應重合。右鍵仍可刪除。"
    : session.state.actionCode === "OJ"
      ? "祈禱按格號掃描全部 side 1 單位；實驗室用固定可重放種子展示門失敗與四類結果。冰封單位抽中生命時實際恢復為 0，經驗與攻防仍生效，冰殼保持在圖元和文字上方。"
    : session.state.actionCode === "TR"
      ? "破邪只能指定同陣營單位；原版清除五種負面狀態，stableRemake 另可解除冰封。"
    : session.state.actionCode === "AA"
      ? "攻擊提昇可指定自己、滿生命、已有狀態或冰封友軍；20 對 MAGIC/16 上下格幀結束後才提交，冰殼保持在效果上方。"
    : session.state.actionCode === "AD"
      ? "防禦提昇可指定自己、滿生命、已有狀態或冰封友軍；11 組 MAGIC/33 四格盾牌結束後才提交，冰殼保持在效果上方。"
    : session.state.actionCode === "FM"
      ? "防魔可指定自己、滿生命、已有狀態或冰封友軍；與 AA 完全共用 20 對 MAGIC/16 和 UN/51，冰殼保持在效果上方。"
    : session.state.actionCode === "IP"
      ? "施毒可指定冰封敵軍；冰封只跳過後續輪末毒傷且照常消耗計數。龍、頭、手完整播放兩段毒霧但免疫狀態寫入，冰殼保持在效果上方。"
    : session.state.actionCode === "LA"
      ? "混亂可指定冰封敵軍；冰封期間不進入行動隊列但計數照常遞減。手動玩家不受 AI 覆寫，龍、頭、手完整演出但免疫寫入，冰殼保持在效果上方。"
    : session.state.actionCode === "SA"
      ? "攻擊下降可指定普通、首領或冰封敵軍；無傷害狀態照常寫入 3，防魔不消耗，冰殼保持在十一組下墜光束上方。"
    : session.state.actionCode === "SD"
      ? "防禦下降可指定普通、首領或冰封敵軍；無傷害狀態照常寫入 3，防魔不消耗，冰殼保持在十組 2×2 光效上方。"
    : session.state.actionCode === "SN"
      ? "禁咒可指定普通、頭、手或冰封敵軍；龍完整播放九組封印但免疫寫入，防魔不消耗，冰殼保持在封印圖形上方。"
    : isFireCode(session.state.actionCode)
      ? `${TECHNIQUE_LAB_FIRE[session.state.actionCode].code} 依原版描述符組合同時顯示每格素材；完整 ${TECHNIQUE_LAB_FIRE[session.state.actionCode].fixedGraphicWaitNativeTicks} tick 後才逐點扣血。`
    : session.state.actionCode === "2H"
      ? "2H 依原版把 MAGIC/37 每六張素材拼成 3×2 心盾，七態完整重複兩輪，再接五幀共同治療尾效。"
    : session.state.actionCode === "3H"
      ? "3H 依原版先展開 MAGIC/42，30 tick 時請求 E/36，再讓 MAGIC/41 完整循環三輪、逆序收束 MAGIC/42，最後接五幀共同尾效。"
    : session.state.actionCode === "2I"
      ? "2I 與三檔回復共用 MAGIC/20 的 17 階段；stableRemake 只在半徑 3 的實際效果範圍投影，冰封單位不治療。"
    : session.state.actionCode === "3I"
      ? "3I 與三檔回復共用 MAGIC/20 的 17 階段；stableRemake 只在半徑 4 的未冰封實際效果單位投影，冰殼持續可見且不疊加回復圖形。"
    : isStompCode(session.state.actionCode)
      ? `${TECHNIQUE_LAB_STOMPS[session.state.actionCode].action.visibleName}範圍是目標三步傳播區與左上 10×7 原版視窗的並集；畫面保留 33 次雙幀繪製與 4 次原聲請求。`
    : isConstructionCode(session.state.actionCode)
      ? `${constructionLabel}沒有原版專用動畫或音效；完成節點把工兵移到空格，並以第 1 關 token ${session.state.actionCode === "2K" ? 18 : 64} 原圖重繪合法四鄰格。`
    : "左鍵依目前工具操作；右鍵可隨時刪除。藍圈是施法者，金框是技能中心。預設收尾只顯示實際命中範圍。";
}

function restart(autoplay = true): void {
  stopAudio();
  timeMs = 0;
  iceOutcomeCleared = false;
  if (session.state.actionCode.endsWith("C")) {
    frozenUnitIds = new Set();
    iceOutcomeApplied = false;
  }
  playedAudioCues = new Set();
  playing = autoplay;
  lastAnimationTime = performance.now();
  playAudioBetween(-1, 0);
  render();
}

function seek(nextTimeMs: number): void {
  stopAudio();
  timeMs = Math.max(0, Math.min(durationMs, nextTimeMs));
  if (timeMs < durationMs && session.state.actionCode.endsWith("C")) {
    iceOutcomeCleared = false;
    iceOutcomeApplied = false;
    frozenUnitIds = new Set();
  }
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
  if (isStompCode(session.state.actionCode)) {
    const next = stompTimeline.find(({ startDisplayNativeTicks }) =>
      startDisplayNativeTicks * 10 > timeMs + .01);
    seek(next ? next.startDisplayNativeTicks * 10 : durationMs);
    return;
  }
  if (isConstructionCode(session.state.actionCode)) {
    seek(timeMs < durationMs ? durationMs : 0);
    return;
  }
  const interval = isFireCode(session.state.actionCode)
    ? (TECHNIQUE_LAB_FIRE[session.state.actionCode].phases[0]?.waitPerDrawNativeTicks ?? 10) * 10
    : session.state.actionCode === "1H" ? 50
      : session.state.actionCode === "2H" || session.state.actionCode === "3H"
        ? (() => {
          let boundaryMs = 0;
          for (const healPhase of TECHNIQUE_LAB_HEAL[session.state.actionCode].phases) {
            for (let draw = 0; draw < healPhase.drawCount; draw += 1) {
              boundaryMs += healPhase.waitPerDrawNativeTicks * 10;
              if (boundaryMs > timeMs + .01) return boundaryMs - timeMs;
            }
          }
          return durationMs - timeMs;
        })()
      : isRecoveryCode(session.state.actionCode)
        ? recoveryPresentationFor(session.state.actionCode).presentation.waitPerDrawNativeTicks * 10
        : session.state.actionCode === "AA"
          ? TECHNIQUE_LAB_ATTACK_UP.phases[0].waitPerDrawNativeTicks * 10
        : session.state.actionCode === "AD"
          ? TECHNIQUE_LAB_DEFENSE_UP.phases[0].waitPerDrawNativeTicks * 10
        : session.state.actionCode === "FM"
          ? TECHNIQUE_LAB_MAGIC_GUARD.phases[0].waitPerDrawNativeTicks * 10
        : session.state.actionCode === "IP"
          ? TECHNIQUE_LAB_POISON.phases[0].waitPerDrawNativeTicks * 10
        : session.state.actionCode === "LA"
          ? TECHNIQUE_LAB_CONFUSION.phases[0].waitPerDrawNativeTicks * 10
        : session.state.actionCode === "SA"
          ? TECHNIQUE_LAB_ATTACK_DOWN.phases[0].waitPerDrawNativeTicks * 10
        : session.state.actionCode === "SD"
          ? TECHNIQUE_LAB_DEFENSE_DOWN.phases[0].waitPerDrawNativeTicks * 10
        : session.state.actionCode === "SN"
          ? TECHNIQUE_LAB_SPELL_SEAL.phases[0].waitPerDrawNativeTicks * 10
        : session.state.actionCode === "TR" ? 50
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
  else if (command === "next-side-phase") {
    iceOutcomeCleared = true;
    iceOutcomeApplied = true;
    frozenUnitIds = new Set();
  }
  else if (command === "reset") {
    frozenUnitIds = new Set();
    iceOutcomeApplied = false;
    session.reset();
    restart(true);
  } else if (command === "clear") session.clear();
  render();
});

actionSelect.addEventListener("change", () => {
  timeMs = 0;
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
  if (!sound) stopAudio();
  playedAudioCues = new Set();
  if (sound) playAudioBetween(-1, timeMs);
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

window.addEventListener("pagehide", () => {
  stopAudio();
  soundEffects.destroy();
  renderer.game.destroy(true);
}, { once: true });

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
    timeMs = 0;
    const changed = session.setActionCode(code);
    if (changed) {
      restart(false);
    }
    return changed;
  },
};
