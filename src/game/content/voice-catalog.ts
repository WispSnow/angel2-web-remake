import type { DialoguePage, StageId } from "../types";
import type { VoiceVolume } from "../preferences";
import { NATIVE_CONTEXTUAL_BATTLE_LINES } from "./ai-technique-dialogue.generated";
import {
  VOICE_CLIPS,
  VOICE_EPILOGUE_NARRATION,
  VOICE_LINE_DURATIONS,
  VOICE_PORTRAIT_VOICES,
  VOICE_STARTUP_NARRATION,
} from "./voice-catalog.generated";

/**
 * `REMAKE-188` 劇情語音的一個片段。鍵是 `(SAY 記錄號, KY 序號)`，也就是
 * `DialoguePage.source.{record, wait}`；每頁至多一個片段。
 */
export interface VoiceClip {
  /** `${record}:${wait}`. */
  readonly key: string;
  readonly source: string;
  /** 進關資源門：這個片段屬於哪一關（或結局路由）。 */
  readonly gate: StageId | "ending";
  /** 本頁新打出文字的 FNV-1a 32 位雜湊；對白文字被改過就對不上，片段不播。 */
  readonly textHash: string;
  /** 逐字打到第幾個發音字形（非 ASCII 字元，從 0 起算）時才開始播放。 */
  readonly startGlyph: number;
  readonly durationMs: number;
  /** 一段劇情的第一個有語音頁：進關後就先解碼，劇情一開始就能開頁。 */
  readonly lead?: true;
}

/** `REMAKE-189` 旁白片段：開場捲動字幕的一句或結局尾聲的一段。 */
export interface VoiceNarrationClip {
  readonly key: string;
  readonly source: string;
  readonly durationMs: number;
}

/**
 * 語音導演實際播放的單位。劇情頁按 SAY 頁取片段；戰鬥台詞、授職、集體命令、
 * 復刻自撰台詞與結果回饋按「說話者的聲線 + 打出的文字」取片段（`REMAKE-189`）。
 */
export interface VoiceCue {
  readonly key: string;
  readonly source: string;
  readonly durationMs: number;
  readonly startGlyph: number;
  readonly kind: "story" | "line" | "narration";
}

/** `[H]` 暫定與總音效相同的五檔增益；`0` 即「關」。 */
export const VOICE_GAIN_BY_VOLUME: Readonly<Record<VoiceVolume, number>> = {
  0: 0,
  1: 0.25,
  2: 0.5,
  3: 0.75,
  4: 1,
};

/** 推進、跳過或離開劇情時，正在播放的片段淡出的長度。 */
export const VOICE_FADE_OUT_SECONDS = 0.1;

/** `[H]` 自動翻頁：片段播完、逐字完成且頁面已接受輸入之後再等這麼久才推進。 */
export const VOICE_AUTO_ADVANCE_DELAY_MS = 600;

const clipsByKey = new Map<string, VoiceClip>(VOICE_CLIPS.map((clip) => [clip.key, clip]));

export const voiceClipKey = (record: number, wait: number): string => `${record}:${wait}`;

/** FNV-1a over UTF-16 code units; the generator computes the same value. */
export function voiceTextHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** 本頁打字窗新打出的文字；追加文字的頁面只算新的部分，沒有打字的頁面為空。 */
export function voiceTypedText(page: DialoguePage): string | undefined {
  const slot = page.activeSlot;
  const text = slot ? page[slot]?.text : undefined;
  if (text === undefined) return undefined;
  return text.slice(page.revealStart ?? 0);
}

/**
 * 這一頁有沒有劇情語音片段。只認數字 SAY 記錄；文字與生成時不一致（例如 Mod 改了
 * 對白）時一律當作無語音頁。
 */
export function voiceClipForPage(page: DialoguePage | undefined): VoiceClip | undefined {
  if (!page || typeof page.source.record !== "number") return undefined;
  const clip = clipsByKey.get(voiceClipKey(page.source.record, page.source.wait));
  if (!clip) return undefined;
  const typed = voiceTypedText(page);
  if (typed === undefined || voiceTextHash(typed) !== clip.textHash) return undefined;
  return clip;
}

export const voiceLineSource = (voiceId: string, textHash: string): string =>
  `/assets/original/voice/line/${voiceId}/${textHash}.ogg`;

/** 某個肖像說戰鬥台詞用的聲線；沒有選角（或沒有肖像）就沒有語音。 */
export function voiceIdForPortrait(portrait: number | undefined): string | undefined {
  return portrait === undefined ? undefined : VOICE_PORTRAIT_VOICES[portrait];
}

/** `REMAKE-189`：這個肖像說這段文字有沒有片段。文字被改過就對不上。 */
export function voiceLineFor(portrait: number | undefined, text: string | undefined): VoiceCue | undefined {
  const voiceId = voiceIdForPortrait(portrait);
  if (!voiceId || text === undefined) return undefined;
  const textHash = voiceTextHash(text);
  const durationMs = VOICE_LINE_DURATIONS[voiceId]?.[textHash];
  if (durationMs === undefined) return undefined;
  return { key: `${voiceId}:${textHash}`, source: voiceLineSource(voiceId, textHash), durationMs, startGlyph: 0, kind: "line" };
}

const EXPERIENCE_LINE = NATIVE_CONTEXTUAL_BATTLE_LINES.experienceGain;
const [EXPERIENCE_LINE_HEAD = "", EXPERIENCE_LINE_TAIL = ""] =
  EXPERIENCE_LINE.text.split(EXPERIENCE_LINE.numericField.digits);
/** `0000:EF56` 寫入的五格欄位：前導零換成空白，全空時補回一個 `0`。 */
const EXPERIENCE_FIELD = /^ *\d+$/u;

/**
 * 戰鬥台詞片段按哪段文字取。「得經驗值 N 點」的數字每次不同，片段只讀固定字句
 * 「獲得經驗值」（`REMAKE-202`），所以填好數字的頁面一律對回記錄原文（數字欄位未寫入）；
 * 其餘頁面就是打出的文字。
 */
export function voiceLineTextForPage(page: DialoguePage): string | undefined {
  const typed = voiceTypedText(page);
  if (typed === undefined || page.source.record !== EXPERIENCE_LINE.record) return typed;
  const field = typed.slice(EXPERIENCE_LINE_HEAD.length, typed.length - EXPERIENCE_LINE_TAIL.length);
  const filledIn = typed.length === EXPERIENCE_LINE.text.length
    && typed.startsWith(EXPERIENCE_LINE_HEAD)
    && typed.endsWith(EXPERIENCE_LINE_TAIL)
    && EXPERIENCE_FIELD.test(field);
  return filledIn ? EXPERIENCE_LINE.text : typed;
}

/** 頁面要播的片段：劇情頁按 SAY 頁，其餘（字串記錄）按說話者聲線與文字。 */
export function voiceCueForPage(page: DialoguePage | undefined): VoiceCue | undefined {
  if (!page) return undefined;
  if (typeof page.source.record === "number") {
    const clip = voiceClipForPage(page);
    return clip ? { key: clip.key, source: clip.source, durationMs: clip.durationMs, startGlyph: clip.startGlyph, kind: "story" } : undefined;
  }
  const state = page.activeSlot ? page[page.activeSlot] : undefined;
  return voiceLineFor(state?.portrait, voiceLineTextForPage(page));
}

/**
 * 某一關（或結局路由）用到的全部劇情片段 URL；結局路由另含尾聲旁白（`REMAKE-189`）。
 * 語音為「關」時為空，資源門不請求任何語音檔。
 */
export function gateVoiceUrls(gate: StageId | "ending", volume: VoiceVolume): string[] {
  if (volume === 0) return [];
  const story = VOICE_CLIPS.filter((clip) => clip.gate === gate).map((clip) => clip.source);
  if (gate !== "ending") return story;
  return [...story, ...Object.values(VOICE_EPILOGUE_NARRATION).map((clip) => clip.source)];
}

/**
 * 這一關（或結局路由）每段劇情的第一個有語音頁。資源門收起前先把它們解碼，
 * 劇情一開場就能開頁；語音為「關」時為空。
 */
export function gateLeadVoiceUrls(gate: StageId | "ending", volume: VoiceVolume): string[] {
  if (volume === 0) return [];
  return VOICE_CLIPS.filter((clip) => clip.gate === gate && clip.lead === true).map((clip) => clip.source);
}

/** 棋盤上這些肖像說得出的全部戰鬥台詞片段；語音為「關」時為空。 */
export function battleLineVoiceUrls(portraits: Iterable<number>, volume: VoiceVolume): string[] {
  if (volume === 0) return [];
  const voices = new Set<string>();
  for (const portrait of portraits) {
    const voiceId = voiceIdForPortrait(portrait);
    if (voiceId) voices.add(voiceId);
  }
  return [...voices].sort().flatMap((voiceId) =>
    Object.keys(VOICE_LINE_DURATIONS[voiceId] ?? {}).sort().map((textHash) => voiceLineSource(voiceId, textHash)));
}

export function epilogueNarrationFor(segment: string, selector: number): VoiceNarrationClip | undefined {
  return VOICE_EPILOGUE_NARRATION[`${segment}:${selector}`];
}

export { VOICE_CLIPS, VOICE_EPILOGUE_NARRATION, VOICE_LINE_DURATIONS, VOICE_PORTRAIT_VOICES, VOICE_STARTUP_NARRATION };
