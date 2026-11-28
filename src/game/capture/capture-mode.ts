import type { GameController } from "../controller";
import { portraitStyle } from "../portrait-style";
import { imageScalingMode } from "../display-settings";
import {
  loadMusicPreferences,
  loadSoundPreferences,
  loadVoicePreferences,
} from "../preferences";
import {
  holdProgramSilently,
  programNow,
  setProgramTimeout,
} from "../program-clock";
import {
  onPresentationProbe,
  setPresentationWorkTracking,
} from "../presentation-probe";
import { observeControllerEvents } from "./controller-events";
import type { CaptureRequest } from "./options";
import { waitForPresentationReadiness } from "./readiness";
import {
  CaptureSession,
  type Angel2CaptureApi,
  type CaptureEvent,
  type CaptureRect,
} from "./session";

declare global {
  interface Window {
    __ANGEL2_CAPTURE__?: Angel2CaptureApi;
  }
}

/**
 * 錄製模式的乾淨畫面：不顯示右下角寶石，也不顯示宿主游標（畫面內的指針精靈照常）。版面照
 * 桌面版（`styles.css` 的 `data-desktop-runtime`）鋪滿視窗，再把畫面上下置中；縮放倍率由
 * `scaling.ts` 在錄製模式放開上限。
 */
const CAPTURE_STYLE = `
html[data-capture="true"], html[data-capture="true"] * { cursor: none !important; }
html[data-capture="true"] .host-menu-trigger,
html[data-capture="true"] .host-menu-trigger-tip { visibility: hidden !important; }
html[data-capture="true"], html[data-capture="true"] body, html[data-capture="true"] #app {
  width: 100%; height: 100%; min-height: 0; overflow: hidden;
}
html[data-capture="true"] .page-shell,
html[data-capture="true"] .stage49-page,
html[data-capture="true"] .credits-page-shell {
  width: 100%; height: 100%; min-height: 0; margin: 0; padding: 0;
}
html[data-capture="true"] .game-stage {
  width: 100%; height: 100%; grid-template-columns: minmax(0, 1fr); align-content: center;
}
html[data-capture="true"] .game-viewport,
html[data-capture="true"] .stage49-viewport,
html[data-capture="true"] .credits-viewport { width: 100%; max-width: none; box-shadow: none; }
html[data-capture="true"] .stage49-help { display: none; }
`;

export interface CaptureMode {
  readonly request: CaptureRequest;
  readonly session: CaptureSession;
  /** 凍結程式時鐘（不顯示暫停層）；之後掛載的表面停在第一幀，直到錄製工具起跑。 */
  hold(): void;
  /** 改由別的機制凍結畫面（例如 `open=` 打開的宿主選單）：起跑時不放開任何東西。 */
  handOffHold(): void;
  /** 起跑時（放開凍結之後）呼叫；實驗室在這裡開始自動播放。 */
  onStart(callback: () => void): void;
  /** 從這個控制器推導事件並供 `state()` 讀取；換控制器時改接新的。 */
  attachController(controller: GameController): void;
  /** 只等背景下載與解碼完成，不宣告 `ready`（凍結前的準備）。 */
  settle(): Promise<void>;
  /** 等背景下載與解碼完成，宣告 `ready`。 */
  becomeReady(): Promise<void>;
}

/**
 * 錄製工具裁切用的矩形：頁面標了 `data-capture-target` 的元素（實驗室的畫布或肖像目錄），
 * 否則是最後一個看得見的 640×350 邏輯螢幕；截到視窗範圍內。
 */
const captureRect = (): CaptureRect => {
  const visible = (element: HTMLElement) => element.isConnected && element.getClientRects().length > 0;
  const target = [...document.querySelectorAll<HTMLElement>("[data-capture-target]")].find(visible)
    ?? [...document.querySelectorAll<HTMLElement>(".logical-screen")].filter(visible).at(-1);
  const viewport = { left: 0, top: 0, right: document.documentElement.clientWidth, bottom: document.documentElement.clientHeight };
  const box = target?.getBoundingClientRect() ?? viewport;
  const left = Math.max(box.left, viewport.left);
  const top = Math.max(box.top, viewport.top);
  const right = Math.min(box.right, viewport.right);
  const bottom = Math.min(box.bottom, viewport.bottom);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

const effectivePresentation = (): Readonly<Record<string, unknown>> => {
  const voice = loadVoicePreferences(localStorage);
  return {
    art: portraitStyle(),
    voice: voice.voiceVolume,
    autoPage: voice.autoAdvance,
    music: loadMusicPreferences(localStorage).musicStyle,
    zoom: imageScalingMode(),
    sound: loadSoundPreferences(localStorage).soundEffectVolume > 0,
  };
};

export function createCaptureMode(request: CaptureRequest, entry: string): CaptureMode {
  const style = document.createElement("style");
  style.dataset.capture = "true";
  style.textContent = CAPTURE_STYLE;
  document.head.append(style);

  let release: (() => void) | undefined;
  let controller: GameController | undefined;
  let detachController: (() => void) | undefined;
  const startCallbacks: (() => void)[] = [];
  const warnings: string[] = [];
  setPresentationWorkTracking(true);
  const settle = async () => {
    const readiness = await waitForPresentationReadiness();
    warnings.push(...readiness.warnings);
  };

  const session = new CaptureSession(request.options.until, {
    programNow,
    performanceNow: () => performance.now(),
    programTimeout: (callback, delay) => {
      setProgramTimeout(callback, delay);
    },
    dispatch: (event: CaptureEvent) => {
      window.dispatchEvent(new CustomEvent("angel2-capture", { detail: event }));
    },
  }, {
    release: () => {
      release?.();
      release = undefined;
      for (const callback of startCallbacks.splice(0)) callback();
    },
    describeScene: () => ({
      entry,
      presentation: effectivePresentation(),
      lines: request.options.lines ?? "coin",
    }),
  });
  onPresentationProbe(({ type, ...detail }) => session.record(type, detail));

  const api: Angel2CaptureApi = {
    get status() {
      return session.status;
    },
    ready: session.ready,
    start: () => session.start(),
    done: session.done,
    get events() {
      return session.events;
    },
    get readyWarnings() {
      return session.readyWarnings;
    },
    rect: captureRect,
    state: () => controller?.debugState() ?? { entry, status: session.status },
  };
  window.__ANGEL2_CAPTURE__ = api;

  return {
    request,
    session,
    hold: () => {
      release ??= holdProgramSilently();
    },
    handOffHold: () => {
      release?.();
      release = undefined;
    },
    onStart: (callback) => {
      startCallbacks.push(callback);
    },
    attachController: (next) => {
      if (next === controller) return;
      detachController?.();
      controller = next;
      // `lines=always`：硬幣的表現隨機源恆給 0（`0..5` 開窗那一側），窗口每次都出現。
      if (request.options.lines === "always") next.lineWindowCoin = () => 0;
      detachController = observeControllerEvents(next, (type, detail) => session.record(type, detail));
    },
    settle,
    becomeReady: async () => {
      await settle();
      setPresentationWorkTracking(false);
      for (const warning of warnings) console.warn(`capture ready: ${warning}`);
      session.markReady(warnings);
    },
  };
}
