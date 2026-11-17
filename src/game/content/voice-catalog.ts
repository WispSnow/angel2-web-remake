import type { DialoguePage, StageId } from "../types";
import type { VoiceVolume } from "../preferences";
import { VOICE_CLIPS } from "./voice-catalog.generated";

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
 * 這一頁有沒有語音片段。只認數字 SAY 記錄；授職、集體命令、AI 技術與復刻自撰台詞
 * 都沒有片段。文字與生成時不一致（例如 Mod 改了對白）時一律當作無語音頁。
 */
export function voiceClipForPage(page: DialoguePage | undefined): VoiceClip | undefined {
  if (!page || typeof page.source.record !== "number") return undefined;
  const clip = clipsByKey.get(voiceClipKey(page.source.record, page.source.wait));
  if (!clip) return undefined;
  const typed = voiceTypedText(page);
  if (typed === undefined || voiceTextHash(typed) !== clip.textHash) return undefined;
  return clip;
}

/** 某一關（或結局路由）用到的全部片段 URL；語音為「關」時為空，資源門不請求任何語音檔。 */
export function gateVoiceUrls(gate: StageId | "ending", volume: VoiceVolume): string[] {
  if (volume === 0) return [];
  return VOICE_CLIPS.filter((clip) => clip.gate === gate).map((clip) => clip.source);
}

export { VOICE_CLIPS };
