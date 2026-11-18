// REMAKE-189: the voice script for everything that is not a SAY story page.
//
// - Battle lines: the DS:84BB contextual lines and AI technique notices, the
//   group commands, the promotion dialogue, the stage-30 transformation line and
//   the REMAKE-172 authored pages. Any unit can say most of them, so a clip is
//   one (voice, text) pair: the key is the voice id plus the FNV-1a hash of the
//   typed text, the same hash the runtime takes from the page it shows.
// - 妮雅's outcome feedback (defeat, victory, quit, retreat).
// - Narration: the opening crawl, sentence by sentence, and the ending epilogue.
//
// Every text is read from the TypeScript module the game itself renders, so a
// later fix to a line forces its clips to be redone.

import { createHash } from "node:crypto";
import { GHOST_MONTAGE, PORTRAIT_ROLES, VOICE_CAST, voiceTempoForRole } from "./voice-cast.mjs";
import { importModule } from "./voice-pages.mjs";
import { spokenText } from "./voice-script.mjs";

export const LINE_MODULES = Object.freeze({
  aiDialogue: "src/game/content/ai-technique-dialogue.generated.ts",
  groupCommands: "src/game/content/group-command-dialogue.ts",
  promotion: "src/game/content/promotion-dialogue.generated.ts",
  feedback: "src/game/content/outcome-feedback.ts",
  stage3: "src/game/content/stage3.ts",
  stage30: "src/game/content/stage30-runtime.generated.ts",
  startup: "src/game/content/startup.generated.ts",
  epilogue: "src/game/content/stage49-ending.generated.ts",
});

/** DS:84BB lines that stay text-only, with the reason. */
export const UNVOICED_LINES = Object.freeze({
  experienceGain: "「得經驗值 N 點」是數字讀數，規格「完全不配音的文字」",
});

/**
 * `[DD]` typos in battle and feedback lines, read as intended. Kept apart from
 * the story list so adding one never changes a story clip's spoken text.
 */
export const LINE_TYPO_READINGS = Object.freeze([
  ["必需休息", "必須休息"],
  ["功擊", "攻擊"],
  ["低辜", "低估"],
  ["必竟", "畢竟"],
  ["甚麼", "什麼"],
]);

/** `[DD]` the same for the crawl and epilogue narration. */
export const NARRATION_TYPO_READINGS = Object.freeze([
  ["祝褔", "祝福"],
]);

/**
 * Narration wraps lines without always ending them in punctuation
 * (「成為瓦爾克麗的「神將官」\n一則輔佐…」); such a break is a pause.
 */
export function narrationSpokenText(displayed) {
  let text = displayed.replace(/([\p{Script=Han}」])\n[\s　]*(?=[\p{Script=Han}「])/gu, "$1，");
  for (const [written, intended] of NARRATION_TYPO_READINGS) text = text.split(written).join(intended);
  return spokenText(text);
}

/** Must match `voiceTextHash` in src/game/content/voice-catalog.ts. */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const sha16 = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

/** Battle lines use ASCII punctuation; give the synthesiser the full-width forms first. */
export function lineSpokenText(displayed) {
  let text = displayed;
  for (const [written, intended] of LINE_TYPO_READINGS) text = text.split(written).join(intended);
  text = text
    .replace(/\.{2,}/gu, "……")
    .replace(/!/gu, "！")
    .replace(/\?/gu, "？")
    .replace(/,/gu, "，")
    .replace(/\./gu, "。");
  return spokenText(text);
}

/** One voice per distinct ElevenLabs id that some battle portrait maps to. */
export function battleVoices() {
  const voices = new Map();
  for (const [portrait, role] of Object.entries(PORTRAIT_ROLES)) {
    const cast = VOICE_CAST[role];
    const voice = voices.get(cast.voiceId) ?? { ...cast, role, roles: [], portraits: [] };
    if (!voice.roles.includes(role)) voice.roles.push(role);
    voice.portraits.push(Number(portrait));
    voices.set(cast.voiceId, voice);
  }
  return [...voices.values()].sort((a, b) => a.voiceId.localeCompare(b.voiceId));
}

/** Typed text of a page's active window (the new part of an appended page). */
function typedText(page) {
  const state = page.activeSlot ? page[page.activeSlot] : undefined;
  return state?.text === undefined ? undefined : state.text.slice(page.revealStart ?? 0);
}

/**
 * Every line text with the voices that can say it. `speakers` is `battle`
 * (any battle voice) or a list of cast roles.
 */
export async function loadLineSources(root) {
  const ai = await importModule(root, LINE_MODULES.aiDialogue);
  const groups = await importModule(root, LINE_MODULES.groupCommands);
  const promotion = await importModule(root, LINE_MODULES.promotion);
  const feedback = await importModule(root, LINE_MODULES.feedback);
  const stage3 = await importModule(root, LINE_MODULES.stage3);
  const stage30 = await importModule(root, LINE_MODULES.stage30);
  const sources = [];
  const unvoiced = [];
  for (const [id, line] of Object.entries(ai.NATIVE_CONTEXTUAL_BATTLE_LINES)) {
    if (UNVOICED_LINES[id]) {
      unvoiced.push({ surface: `contextual:${id}`, text: line.text, reason: UNVOICED_LINES[id] });
      continue;
    }
    sources.push({ surface: `contextual:${id}`, text: line.text, speakers: "battle" });
  }
  for (const group of ai.NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS) {
    sources.push({ surface: `ai-technique:${group.selector}`, text: group.text, speakers: "battle" });
  }
  for (const record of Object.values(ai.NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE)) {
    sources.push({ surface: `ai-technique:${record.selector}`, text: record.text, speakers: "battle" });
  }
  for (const [id, definition] of Object.entries(groups.GROUP_COMMAND_DIALOGUE)) {
    sources.push({ surface: `group-command:${id}`, text: typedText(definition.page), speakers: "battle" });
  }
  for (const [id, text] of Object.entries(promotion.PROMOTION_DIALOGUE_TEXT)) {
    sources.push({ surface: `promotion:${id}`, text, speakers: "battle" });
  }
  sources.push({ surface: "battle-context:stage-30", text: stage30.STAGE30_EVENT_PROGRAM.contextualLine.text, speakers: "battle" });
  for (const [id, text] of Object.entries(feedback.OUTCOME_FEEDBACK_TEXT)) {
    sources.push({
      surface: `feedback:${id}`,
      text,
      speakers: [PORTRAIT_ROLES[feedback.OUTCOME_FEEDBACK_PORTRAIT]],
    });
  }
  for (const page of stage3.STAGE3_FOURTH_CORPS_COUNTERATTACK_DIALOGUE.pages) {
    const state = page[page.activeSlot];
    sources.push({
      surface: `remake-authored:${page.source.address}`,
      text: typedText(page),
      speakers: [PORTRAIT_ROLES[state.portrait]],
    });
  }
  for (const source of sources) {
    if (typeof source.text !== "string" || source.text.length === 0) throw new Error(`${source.surface} has no text`);
  }
  return { sources, unvoiced };
}

/** One clip per (voice, text); surfaces sharing a text share the clip. */
export function buildLineScript({ sources, unvoiced }) {
  const voices = battleVoices();
  const byId = new Map(voices.map((voice) => [voice.voiceId, voice]));
  const clips = new Map();
  for (const source of sources) {
    const targets = source.speakers === "battle"
      ? voices
      : source.speakers.map((role) => {
        const voice = byId.get(VOICE_CAST[role].voiceId);
        if (!voice) throw new Error(`${source.surface}: ${role} has no battle voice`);
        return voice;
      });
    const textHash = fnv1a(source.text);
    for (const voice of targets) {
      const key = `line:${voice.voiceId}:${textHash}`;
      const existing = clips.get(key);
      if (existing) {
        if (existing.displayed !== source.text) throw new Error(`text hash collision on ${key}`);
        if (!existing.surfaces.includes(source.surface)) existing.surfaces.push(source.surface);
        continue;
      }
      clips.set(key, {
        key,
        kind: "line",
        stem: `line/${voice.voiceId}/${textHash}`,
        surfaces: [source.surface],
        role: voice.role,
        roles: voice.roles,
        speaker: voice.roles.map((role) => VOICE_CAST[role].speaker).join("／"),
        portraits: voice.portraits,
        displayed: source.text,
        displayTextHash: sha16(source.text),
        textHash,
        spoken: lineSpokenText(source.text),
        tempo: voiceTempoForRole(voice.role),
        platform: voice.platform,
        voiceId: voice.voiceId,
        voiceName: voice.voiceName,
      });
    }
  }
  return {
    clips: [...clips.values()].sort((a, b) => a.key.localeCompare(b.key)),
    unvoiced,
  };
}

const narrator = () => {
  const cast = VOICE_CAST.narrator;
  return {
    role: "narrator",
    speaker: cast.speaker,
    platform: cast.platform,
    voiceId: cast.voiceId,
    voiceName: cast.voiceName,
    tempo: voiceTempoForRole("narrator"),
  };
};

/**
 * The opening crawl types nothing: its lines scroll in one by one. A sentence
 * runs over up to three lines, so narration is one clip per sentence, cued at
 * the scroll update its first line enters on.
 */
export function crawlSentences(intro) {
  const sentences = [];
  let current;
  for (const line of intro.lines) {
    const text = line.text.replace(/^[\s　]+/u, "");
    if (!text) continue;
    current ??= { startUpdate: line.update, lineUpdates: [], lines: [] };
    current.lineUpdates.push(line.update);
    current.lines.push(text);
    if (/[。！？]$|．{2,}$/u.test(text)) {
      sentences.push(current);
      current = undefined;
    }
  }
  if (current) sentences.push(current);
  return sentences;
}

export async function buildNarrationScript(root) {
  const startup = await importModule(root, LINE_MODULES.startup);
  const ending = await importModule(root, LINE_MODULES.epilogue);
  const clips = [];
  for (const [index, sentence] of crawlSentences(startup.STARTUP_INTRO).entries()) {
    const displayed = sentence.lines.join("\n");
    clips.push({
      key: `startup:${index + 1}`,
      kind: "narration",
      surface: "startup-crawl",
      stem: `narration/startup-${String(index + 1).padStart(2, "0")}`,
      startUpdate: sentence.startUpdate,
      lineUpdates: sentence.lineUpdates,
      displayed,
      displayTextHash: sha16(displayed),
      spoken: narrationSpokenText(displayed),
      ...narrator(),
    });
  }
  for (const segment of ending.STAGE49_EPILOGUE_SEGMENTS) {
    for (const variant of segment.variants) {
      clips.push({
        key: `epilogue:${segment.id}:${variant.selector}`,
        kind: "narration",
        surface: "ending-epilogue",
        stem: `narration/epilogue-${segment.id}-${variant.selector}`,
        segment: segment.id,
        selector: variant.selector,
        displayed: variant.text,
        displayTextHash: sha16(variant.text),
        spoken: narrationSpokenText(variant.text),
        ...narrator(),
      });
    }
  }
  return { clips };
}

export const isMontageRole = (role) => role === GHOST_MONTAGE.role;
