// REMAKE-188 voice script (配音稿): what each voiced SAY page sends to speech
// synthesis, kept apart from the displayed text (spec「配音稿与生产流程」,
// assessment §7). The screen keeps the original traditional text and
// punctuation; only the spoken copy is normalised.

import OpenCC from "opencc-js";
import { castRoleForPortrait, GHOST_MONTAGE, VOICE_CAST } from "./voice-cast.mjs";
import { clipKey, displayTextHash } from "./voice-pages.mjs";

const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });

/**
 * `[DD]` typos read as intended (user 2026-11-17); the screen is unchanged.
 * Applied to the traditional text before conversion.
 */
export const VOICE_TYPO_READINGS = Object.freeze([
  ["準備準就序", "準備就緒"],
  ["既使", "即使"],
  ["真像大白", "真相大白"],
  ["這個辨法", "這個辦法"],
  ["到時後", "到時候"],
  ["倒底", "到底"],
  ["追縱", "追蹤"],
  ["葛帝拉斯", "葛蒂拉斯"],
  ["分別是是", "分別是"],
]);

/**
 * Pronunciation substitutions on the simplified spoken text. Empty while the
 * whisper spot-check finds no name misread; add `[written, spoken]` pairs here
 * rather than editing individual clips.
 */
export const VOICE_LEXICON = Object.freeze([]);

/** Why a SAY page with no clip has none; every page lacking a clip must name one. */
export const UNVOICED_REASONS = Object.freeze({
  "no-typing": "本頁沒有打字的窗口（只有 KY 停頓、只留肖像，或兩扇窗都沿用上一頁）",
  "nothing-new": "追加文字的頁面沒有新增文字",
  "no-spoken-glyph": "新打出的只有省略號或標點，沒有可讀的字",
  "laugh-intro": "亡靈段落的笑聲前奏，用戶 2026-11-17 第四輪決定不配",
});

const SPOKEN_GLYPH = /[\p{Script=Han}A-Za-z0-9]/u;

/** Assessment §7 normalisation, then typo readings, simplified script and lexicon. */
export function spokenText(displayed) {
  // Whitespace goes first: the original wraps and letter-spaces lines, so a
  // typo such as「追 縱」or「分別是\n是」only matches once it is joined up.
  let text = displayed.replace(/\s+/gu, "");
  for (const [written, intended] of VOICE_TYPO_READINGS) text = text.split(written).join(intended);
  text = text
    .replace(/[「」]/gu, "")
    .replace(/『/gu, "“")
    .replace(/』/gu, "”")
    // The chant「斯.姆.托.拉…」is read one syllable at a time.
    .replace(/(\p{Script=Han})\.(?=\p{Script=Han})/gu, "$1、")
    .replace(/．{2,}|\.{3,}/gu, "……")
    .replace(/．(?=[！？，。…])/gu, "")
    .replace(/．/gu, "。")
    .replace(/……[，。]/gu, "……")
    .replace(/～{2,}/gu, "～");
  text = toSimplified(text).replace(/妳/gu, "你");
  for (const [written, spoken] of VOICE_LEXICON) text = text.split(written).join(spoken);
  return text;
}

/**
 * One entry per runtime SAY page: a clip request or the reason it has none.
 * `pages` comes from `sayPages()`.
 */
export function buildVoiceScript(pages) {
  const clips = [];
  const unvoiced = [];
  for (const page of pages) {
    const base = { key: page.key, record: page.record, wait: page.wait, stages: page.stages };
    if (!page.typed) {
      unvoiced.push({ ...base, reason: "no-typing" });
      continue;
    }
    const displayed = page.typed.text;
    const isGhostMontage = page.record === GHOST_MONTAGE.record && GHOST_MONTAGE.waits.includes(page.wait);
    if (displayed.length === 0) {
      unvoiced.push({ ...base, reason: "nothing-new" });
      continue;
    }
    if (page.record === GHOST_MONTAGE.record && page.wait === GHOST_MONTAGE.waits[0] - 1) {
      unvoiced.push({ ...base, reason: "laugh-intro", displayTextHash: displayTextHash(displayed) });
      continue;
    }
    if (!SPOKEN_GLYPH.test(displayed)) {
      unvoiced.push({ ...base, reason: "no-spoken-glyph", displayTextHash: displayTextHash(displayed) });
      continue;
    }
    const role = isGhostMontage ? GHOST_MONTAGE.role : castRoleForPortrait(page.typed.state.portrait);
    const voice = isGhostMontage ? undefined : VOICE_CAST[role];
    clips.push({
      ...base,
      role,
      speaker: isGhostMontage ? "亡靈（逐詞換人）" : voice.speaker,
      portrait: page.typed.state.portrait ?? null,
      displayed,
      displayTextHash: displayTextHash(displayed),
      spoken: isGhostMontage ? spokenText(displayed).replace(/～/gu, "") : spokenText(displayed),
      startGlyph: 0,
      ...(voice ? { platform: voice.platform, voiceId: voice.voiceId, voiceName: voice.voiceName } : {}),
    });
  }
  return { clips, unvoiced };
}

export { clipKey };
