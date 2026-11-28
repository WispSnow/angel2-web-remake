import {
  isImageScalingMode,
  isMusicStyle,
  isPortraitStyle,
  type ImageScalingMode,
  type MusicStyle,
  type PortraitStyle,
  type VoiceVolume,
} from "../preferences";

/**
 * 錄製模式（`capture=1`）與網址表現設定的參數解析。只在開發構建使用：視頻倉庫的錄製工具
 * 照鏡頭清單開網址，這裡把網址翻成「這一頁生效的表現設定」與「錄製選項」，不碰模擬狀態、
 * PRNG、規則身份或存檔，也不寫回設備偏好。
 */

/** 網址裡的表現設定，優先於設備偏好，只對這一頁生效。 */
export interface PresentationOverrides {
  /** `art`：美術風格。 */
  readonly portraitStyle?: PortraitStyle;
  /** `voice`：劇情語音音量檔（`0` 即關，`max` 即最大）。 */
  readonly voiceVolume?: VoiceVolume;
  /** `autoPage`：自動翻頁。 */
  readonly autoAdvance?: boolean;
  /** `music`：音樂風格。 */
  readonly musicStyle?: MusicStyle;
  /** `zoom`：畫面縮放。 */
  readonly imageScaling?: ImageScalingMode;
  /** `sound`：音效開關。 */
  readonly soundEnabled?: boolean;
}

/** 錄製工具等得到的事件類型；`until` 只接受這些（`done` 本身不行）。 */
export const CAPTURE_EVENT_TYPES = [
  "scene",
  "dialogue-page",
  "voice-start",
  "voice-end",
  "music-start",
  "story-art",
  "title-shown",
  "technique-start",
  "technique-end",
  "combat-start",
  "combat-end",
  "menu-open",
  "menu-close",
  "phase",
  "story-end",
  "sequence-end",
  "credits-end",
] as const;

export type CaptureEventType = (typeof CAPTURE_EVENT_TYPES)[number];

export const isCaptureEventType = (value: string): value is CaptureEventType =>
  (CAPTURE_EVENT_TYPES as readonly string[]).includes(value);

/** `until=<事件>[+延時毫秒]`：第一次出現該事件後再等延時（按程式時鐘），記 `done`。 */
export interface CaptureUntil {
  readonly type: CaptureEventType;
  readonly delayMs: number;
}

export type CaptureStartup = "enter" | "title";

export type CaptureOpenTarget =
  | { readonly kind: "roadmap" }
  | { readonly kind: "settings" }
  | { readonly kind: "notes" }
  | { readonly kind: "compendium"; readonly section?: string; readonly entry?: string };

export type CaptureFocus =
  | { readonly kind: "unit"; readonly unitId: string }
  | { readonly kind: "cell"; readonly x: number; readonly y: number };

export interface CaptureOptions {
  readonly until?: CaptureUntil;
  readonly startup?: CaptureStartup;
  readonly open?: CaptureOpenTarget;
  readonly focus?: CaptureFocus;
  readonly select?: string;
  readonly panel?: "detail";
}

export interface CaptureRequest {
  /** `capture=1`。 */
  readonly capture: boolean;
  readonly presentation: PresentationOverrides;
  readonly options: CaptureOptions;
}

export interface CaptureParameterError {
  readonly parameter: string;
  readonly value: string;
  readonly message: string;
}

export type CaptureParseResult =
  | { readonly ok: true; readonly value: CaptureRequest }
  | { readonly ok: false; readonly error: CaptureParameterError };

/** 只在 `capture=1` 時才有意義的參數；單獨出現時報錯，不默默忽略。 */
const CAPTURE_ONLY_PARAMETERS = ["until", "startup", "open", "focus", "select", "panel"] as const;

const MAX_UNTIL_DELAY_MS = 600_000;

class ParameterError extends Error {
  constructor(readonly parameter: string, readonly value: string, message: string) {
    super(message);
  }
}

const flag = (parameter: string, value: string): boolean => {
  if (value === "1") return true;
  if (value === "0") return false;
  throw new ParameterError(parameter, value, "只接受 1 或 0。");
};

const parseVoiceVolume = (value: string): VoiceVolume => {
  if (value === "max") return 4;
  if (/^[0-4]$/u.test(value)) return Number(value) as VoiceVolume;
  throw new ParameterError("voice", value, "只接受 0–4 或 max。");
};

/**
 * `+` 在查詢字串裡會被 `URLSearchParams` 解成空白，所以 `until=title-shown+15000` 讀到的是
 * `title-shown 15000`；兩種分隔都收。
 */
export const parseCaptureUntil = (value: string): CaptureUntil => {
  const match = /^([a-z-]+)(?:[+ ](\d+))?$/u.exec(value.trim());
  const type = match?.[1];
  if (!match || !type || !isCaptureEventType(type)) {
    throw new ParameterError("until", value, `未知事件；可用：${CAPTURE_EVENT_TYPES.join("、")}，可加 +毫秒。`);
  }
  const delayMs = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isSafeInteger(delayMs) || delayMs > MAX_UNTIL_DELAY_MS) {
    throw new ParameterError("until", value, `延時須介於 0 與 ${MAX_UNTIL_DELAY_MS} 毫秒之間。`);
  }
  return { type, delayMs };
};

/** 單位 id、單位名字或圖鑑條目：不含空白與網址分隔字元即可（名字可以是中文）。 */
const SAFE_ID = /^[^\s,/?#&=]+$/u;

const parseOpen = (value: string): CaptureOpenTarget => {
  const [head, section, entry, ...rest] = value.split("/");
  if (rest.length === 0) {
    if (head === "roadmap" && section === undefined) return { kind: "roadmap" };
    if (head === "settings" && section === undefined) return { kind: "settings" };
    if (head === "notes" && section === undefined) return { kind: "notes" };
    if (head === "compendium"
      && (section === undefined || SAFE_ID.test(section))
      && (entry === undefined || (section !== undefined && SAFE_ID.test(entry)))) {
      return { kind: "compendium", section, entry };
    }
  }
  throw new ParameterError("open", value, "只接受 roadmap、settings、notes 或 compendium[/<分頁>[/<條目>]]。");
};

const parseFocus = (value: string): CaptureFocus => {
  const cell = /^(\d{1,3}),(\d{1,3})$/u.exec(value);
  if (cell) return { kind: "cell", x: Number(cell[1]), y: Number(cell[2]) };
  if (SAFE_ID.test(value)) return { kind: "unit", unitId: value };
  throw new ParameterError("focus", value, "只接受單位 id、名字或 x,y 格座標。");
};

const parseUnitId = (parameter: string, value: string): string => {
  if (SAFE_ID.test(value)) return value;
  throw new ParameterError(parameter, value, "不是有效的單位 id 或名字。");
};

export function parsePresentationOverrides(parameters: URLSearchParams): PresentationOverrides {
  // 肖像實驗室頁面上把美術風格叫「風格」，`style` 因此是 `art` 的別名；兩個都寫時必須一致。
  const style = parameters.get("style");
  const art = parameters.get("art") ?? style;
  if (style !== null && art !== style) throw new ParameterError("style", style, "與 art 不一致。");
  const voice = parameters.get("voice");
  const autoPage = parameters.get("autoPage");
  const music = parameters.get("music");
  const zoom = parameters.get("zoom");
  const sound = parameters.get("sound");
  if (art !== null && !isPortraitStyle(art)) throw new ParameterError("art", art, "只接受 original 或 hd。");
  if (music !== null && !isMusicStyle(music)) {
    throw new ParameterError("music", music, "只接受 original 或 orchestral。");
  }
  if (zoom !== null && !isImageScalingMode(zoom)) {
    throw new ParameterError("zoom", zoom, "只接受 sharp、smooth 或 integer。");
  }
  return {
    ...(art !== null ? { portraitStyle: art } : {}),
    ...(voice !== null ? { voiceVolume: parseVoiceVolume(voice) } : {}),
    ...(autoPage !== null ? { autoAdvance: flag("autoPage", autoPage) } : {}),
    ...(music !== null ? { musicStyle: music } : {}),
    ...(zoom !== null ? { imageScaling: zoom } : {}),
    ...(sound !== null ? { soundEnabled: flag("sound", sound) } : {}),
  };
}

export const hasPresentationOverrides = (overrides: PresentationOverrides): boolean =>
  Object.keys(overrides).length > 0;

function parseOptions(parameters: URLSearchParams): CaptureOptions {
  const until = parameters.get("until");
  const startup = parameters.get("startup");
  const open = parameters.get("open");
  const focus = parameters.get("focus");
  const select = parameters.get("select");
  const panel = parameters.get("panel");
  if (startup !== null && startup !== "enter" && startup !== "title") {
    throw new ParameterError("startup", startup, "只接受 enter 或 title。");
  }
  if (panel !== null && panel !== "detail") throw new ParameterError("panel", panel, "只接受 detail。");
  if (panel !== null && select === null) throw new ParameterError("panel", panel, "要和 select 一起用。");
  return {
    ...(until !== null ? { until: parseCaptureUntil(until) } : {}),
    ...(startup !== null ? { startup } : {}),
    ...(open !== null ? { open: parseOpen(open) } : {}),
    ...(focus !== null ? { focus: parseFocus(focus) } : {}),
    ...(select !== null ? { select: parseUnitId("select", select) } : {}),
    ...(panel !== null ? { panel } : {}),
  };
}

export function parseCaptureRequest(search: string | URLSearchParams): CaptureParseResult {
  const parameters = typeof search === "string" ? new URLSearchParams(search) : search;
  try {
    const captureValue = parameters.get("capture");
    if (captureValue !== null && captureValue !== "1") {
      throw new ParameterError("capture", captureValue, "只接受 1。");
    }
    const capture = captureValue === "1";
    if (!capture) {
      const stray = CAPTURE_ONLY_PARAMETERS.find((name) => parameters.has(name));
      if (stray) throw new ParameterError(stray, parameters.get(stray) ?? "", "只在 capture=1 時有效。");
    }
    return {
      ok: true,
      value: {
        capture,
        presentation: parsePresentationOverrides(parameters),
        options: capture ? parseOptions(parameters) : {},
      },
    };
  } catch (error: unknown) {
    if (error instanceof ParameterError) {
      return { ok: false, error: { parameter: error.parameter, value: error.value, message: error.message } };
    }
    throw error;
  }
}

export const describeCaptureParameterError = ({ parameter, value, message }: CaptureParameterError): string =>
  `${parameter}=${value}：${message}`;
