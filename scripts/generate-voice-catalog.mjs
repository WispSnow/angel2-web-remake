#!/usr/bin/env node

// REMAKE-188 story voice-over and REMAKE-189 battle lines and narration. The
// asset pack's voice/voice-manifest.json is the source of truth (manifest and
// voice script in one file); this script turns it into
// src/game/content/voice-catalog.generated.ts after checking it, clip by clip,
// against the runtime content (scripts/lib/voice-pages.mjs, voice-lines.mjs):
//
// - every story clip key names an existing SAY page that types text, and every
//   KY page of every SAY record has a clip or a stated reason not to;
// - every line clip is one (voice, text) pair of today's battle, promotion,
//   group-command, feedback or authored lines, for every voice that can say it;
// - every narration clip is a sentence of the opening crawl or an epilogue text;
// - display-text hashes and spoken texts match today's content and voice
//   script, so a later fix to a text forces the affected clips to be redone;
// - every clip's voice and pace are the accepted cast (scripts/lib/voice-cast.mjs);
// - every OGG matches its hash and is mono, and no stray OGG ships.
//
// `--import <workbench>` first copies finished clips from the git-ignored voice
// workbench (final.json + final/**/*.ogg, as made by its finish.mjs) into the
// asset pack and rewrites the manifest. The workbench never ships.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ELEVENLABS_MODEL,
  GHOST_MONTAGE,
  MINIMAX_MODEL,
  PORTRAIT_ROLES,
  VOICE_CAST,
  VOICE_TEMPO_BY_PLATFORM,
  VOICE_TEMPO_OVERRIDES,
  voiceTempoForRole,
} from "./lib/voice-cast.mjs";
import {
  buildLineScript,
  buildNarrationScript,
  fnv1a,
  LINE_TYPO_READINGS,
  loadLineSources,
  NARRATION_TYPO_READINGS,
} from "./lib/voice-lines.mjs";
import { loadStoryPages, sayPages } from "./lib/voice-pages.mjs";
import { buildVoiceScript, UNVOICED_REASONS, VOICE_LEXICON, VOICE_TYPO_READINGS } from "./lib/voice-script.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(root, "public/assets/original");
const voiceRoot = path.join(assetRoot, "voice");
const manifestPath = path.join(voiceRoot, "voice-manifest.json");
const generatedModule = path.join(root, "src/game/content/voice-catalog.generated.ts");
const FORMAT = "ANGEL2 story voice-over";
const VERSION = 2;
const TARGET_LUFS = -19;

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const fail = (message) => {
  throw new Error(`voice catalog: ${message}`);
};

const modelFor = (platform) => (platform === "minimax" ? MINIMAX_MODEL : ELEVENLABS_MODEL);

/** What every shipped clip carries, whatever its kind. */
function shippedFields(finished, output) {
  return {
    output,
    sha256: finished.sha256,
    bytes: finished.bytes,
    durationMs: finished.durationMs,
    loudnessLufs: finished.loudnessLufs,
    truePeakDbfs: finished.truePeakDbfs,
  };
}

function synthesisFields(clip, finished) {
  return {
    platform: clip.platform,
    model: modelFor(clip.platform),
    voiceId: clip.voiceId,
    voiceName: clip.voiceName,
    generation: finished.generation,
    take: finished.take,
    asr: finished.asr ? { text: finished.asr.asr, cer: finished.asr.cer, missing: finished.asr.missing } : undefined,
  };
}

async function importWorkbench(workbench, script) {
  const final = JSON.parse(await readFile(path.join(workbench, "final.json"), "utf8"));
  if (final.format?.targetLufs !== TARGET_LUFS) fail(`workbench loudness target is not ${TARGET_LUFS} LUFS`);
  await rm(voiceRoot, { recursive: true, force: true });
  await mkdir(voiceRoot, { recursive: true });
  const take = async (clip) => {
    const finished = final.clips[clip.key];
    if (!finished) fail(`workbench has no finished clip for ${clip.key}`);
    if (clip.role !== GHOST_MONTAGE.role && finished.spoken !== clip.spoken) {
      fail(`${clip.key} was synthesised from different text; regenerate it`);
    }
    // Clips finished before the pace field existed were left as synthesised.
    if ((finished.tempo ?? 1) !== clip.tempo) {
      fail(`${clip.key} was finished at ${finished.tempo ?? 1}×, the voice script asks for ${clip.tempo}×; rerun finish.mjs`);
    }
    if (!finished.file.startsWith("final/")) fail(`${clip.key} was not finished into final/`);
    const output = `voice/${finished.file.slice("final/".length)}`;
    await mkdir(path.dirname(path.join(assetRoot, output)), { recursive: true });
    await copyFile(path.join(workbench, finished.file), path.join(assetRoot, output));
    return { finished, output };
  };
  const clips = [];
  for (const clip of script.story.clips) {
    const { finished, output } = await take(clip);
    clips.push({
      key: clip.key,
      record: clip.record,
      wait: clip.wait,
      gate: clip.stages[0],
      role: clip.role,
      speaker: clip.speaker,
      portrait: clip.portrait,
      displayTextHash: clip.displayTextHash,
      spoken: clip.spoken,
      startGlyph: clip.startGlyph,
      tempo: clip.tempo,
      ...(clip.platform ? synthesisFields(clip, finished) : { montage: finished.montage }),
      ...shippedFields(finished, output),
    });
  }
  const lines = [];
  for (const clip of script.lines.clips) {
    const { finished, output } = await take(clip);
    lines.push({
      key: clip.key,
      textHash: clip.textHash,
      displayTextHash: clip.displayTextHash,
      surfaces: clip.surfaces,
      roles: clip.roles,
      speaker: clip.speaker,
      portraits: clip.portraits,
      spoken: clip.spoken,
      tempo: clip.tempo,
      ...synthesisFields(clip, finished),
      ...shippedFields(finished, output),
    });
  }
  const narration = [];
  for (const clip of script.narration.clips) {
    const { finished, output } = await take(clip);
    narration.push({
      key: clip.key,
      surface: clip.surface,
      role: clip.role,
      ...(clip.surface === "startup-crawl"
        ? { startUpdate: clip.startUpdate, lineUpdates: clip.lineUpdates }
        : { segment: clip.segment, selector: clip.selector }),
      displayTextHash: clip.displayTextHash,
      spoken: clip.spoken,
      tempo: clip.tempo,
      ...synthesisFields(clip, finished),
      ...shippedFields(finished, output),
    });
  }
  const manifest = {
    format: FORMAT,
    version: VERSION,
    decisions: ["REMAKE-188", "REMAKE-189"],
    encoder: final.format.encoder,
    quality: final.format.quality,
    channels: 1,
    sampleRate: final.format.sampleRate,
    loudnessLufs: TARGET_LUFS,
    normalization: {
      typoReadings: VOICE_TYPO_READINGS,
      lineTypoReadings: LINE_TYPO_READINGS,
      narrationTypoReadings: NARRATION_TYPO_READINGS,
      lexicon: VOICE_LEXICON,
      rules: "去掉空白與「」；『』改引號；．串改省略號、單個．改句號；ASCII 點分隔的咒語改頓號；～～留一個；台灣正體轉簡體，妳讀作你；"
        + "戰鬥台詞的 ASCII 標點先改全形；旁白斷行沒有標點時補逗號",
    },
    tempo: {
      byPlatform: VOICE_TEMPO_BY_PLATFORM,
      sceneOverrides: VOICE_TEMPO_OVERRIDES,
      ghostMontage: voiceTempoForRole(GHOST_MONTAGE.role),
      method: "ffmpeg atempo（保持音高），裁切之後、響度標準化之前；eleven_v4 不理會 voice_settings.speed",
    },
    clips,
    lines,
    narration,
    unvoiced: script.story.unvoiced.map((page) => ({
      key: page.key,
      record: page.record,
      wait: page.wait,
      gate: page.stages[0],
      reason: page.reason,
      note: UNVOICED_REASONS[page.reason],
      ...(page.displayTextHash ? { displayTextHash: page.displayTextHash } : {}),
    })),
    unvoicedLines: script.lines.unvoiced,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  return manifest;
}

function validateCast(clip, label) {
  const cast = VOICE_CAST[clip.roles?.[0] ?? clip.role];
  if (!cast || clip.platform !== cast.platform || clip.voiceId !== cast.voiceId) {
    fail(`${label} uses ${clip.platform}:${clip.voiceId}, the cast says ${cast?.platform}:${cast?.voiceId}`);
  }
  // `voiceId` above is copied from the voice script; the take's own record says
  // which voice actually spoke it. A recast (REMAKE-199) leaves the old voice's
  // takes in the workbench under the same story keys, so check both.
  if (clip.generation?.voiceId !== cast.voiceId) {
    fail(`${label} was synthesised with ${clip.generation?.voiceId ?? "an unrecorded voice"}, the cast says ${cast.voiceId}; regenerate it`);
  }
  if (clip.model !== modelFor(cast.platform)) fail(`${label} uses model ${clip.model}`);
}

function validateStory(manifest, script, pages) {
  const scriptClips = new Map(script.clips.map((clip) => [clip.key, clip]));
  const scriptUnvoiced = new Map(script.unvoiced.map((page) => [page.key, page]));
  const seen = new Set();
  for (const clip of manifest.clips) {
    if (seen.has(clip.key)) fail(`duplicate key ${clip.key}`);
    seen.add(clip.key);
    const expected = scriptClips.get(clip.key);
    if (!expected) {
      fail(scriptUnvoiced.has(clip.key)
        ? `SAY ${clip.key} has a clip but its page is now unvoiced (${scriptUnvoiced.get(clip.key).reason})`
        : `SAY ${clip.key} is not a runtime dialogue page`);
    }
    if (clip.displayTextHash !== expected.displayTextHash) {
      fail(`SAY ${clip.key} display text changed since it was voiced; regenerate the clip`);
    }
    if (clip.role !== expected.role) fail(`SAY ${clip.key} is cast as ${clip.role}, the page shows ${expected.role}`);
    if (clip.gate !== expected.stages[0]) fail(`SAY ${clip.key} gate ${clip.gate} is not ${expected.stages[0]}`);
    if (clip.startGlyph !== expected.startGlyph) fail(`SAY ${clip.key} startGlyph differs from the voice script`);
    if (clip.tempo !== expected.tempo) fail(`SAY ${clip.key} pace ${clip.tempo}× is not the cast's ${expected.tempo}×; refinish the clip`);
    if (clip.role === GHOST_MONTAGE.role) {
      if (!GHOST_MONTAGE.waits.includes(clip.wait) || clip.record !== GHOST_MONTAGE.record) fail(`${clip.key} is not a montage page`);
      if (!clip.montage?.words?.length) fail(`montage ${clip.key} lists no speakers`);
      const typed = pages.get(clip.key).typed.text;
      const firstGlyph = [...typed].filter((character) => /[^\x00-\x7f]/u.test(character))[clip.startGlyph];
      if (firstGlyph !== clip.montage.words[0].text[0]) {
        fail(`montage ${clip.key} startGlyph does not point at its first speaker's word`);
      }
      continue;
    }
    if (clip.spoken !== expected.spoken) fail(`SAY ${clip.key} spoken text differs from the voice script; regenerate the clip`);
    validateCast(clip, `SAY ${clip.key}`);
  }
  for (const key of scriptClips.keys()) if (!seen.has(key)) fail(`SAY ${key} has no clip and no reason to be unvoiced`);
  const unvoiced = new Map(manifest.unvoiced.map((page) => [page.key, page]));
  for (const [key, page] of scriptUnvoiced) {
    if (unvoiced.get(key)?.reason !== page.reason) fail(`SAY ${key} must be recorded as unvoiced (${page.reason})`);
  }
  for (const key of unvoiced.keys()) if (!scriptUnvoiced.has(key)) fail(`unvoiced ${key} is not an unvoiced runtime page`);
  const records = new Set([...pages.values()].map((page) => page.record));
  if (records.size !== 89) fail(`expected 89 SAY records, the runtime has ${records.size}`);
}

/** Line and narration clips: exactly the script's keys, each matching text, voice and pace. */
function validateKeyed(shipped, expectedClips, label, extra) {
  const expected = new Map(expectedClips.map((clip) => [clip.key, clip]));
  const seen = new Set();
  for (const clip of shipped) {
    if (seen.has(clip.key)) fail(`duplicate ${label} ${clip.key}`);
    seen.add(clip.key);
    const want = expected.get(clip.key);
    if (!want) fail(`${label} ${clip.key} is not in today's voice script; drop or regenerate it`);
    if (clip.displayTextHash !== want.displayTextHash) fail(`${label} ${clip.key} text changed since it was voiced`);
    if (clip.spoken !== want.spoken) fail(`${label} ${clip.key} spoken text differs from the voice script; regenerate it`);
    if (clip.tempo !== want.tempo) fail(`${label} ${clip.key} pace ${clip.tempo}× is not ${want.tempo}×; refinish it`);
    validateCast(clip, `${label} ${clip.key}`);
    extra?.(clip, want);
  }
  for (const key of expected.keys()) if (!seen.has(key)) fail(`${label} ${key} has no clip`);
}

async function listOggs(directory, prefix = "") {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) found.push(...await listOggs(path.join(directory, entry.name), `${relative}/`));
    else if (entry.name.endsWith(".ogg")) found.push(relative);
  }
  return found;
}

const pageEntries = await loadStoryPages(root);
const pageList = sayPages(pageEntries);
const pages = new Map(pageList.map((page) => [page.key, page]));
const script = {
  story: buildVoiceScript(pageList),
  lines: buildLineScript(await loadLineSources(root)),
  narration: await buildNarrationScript(root),
};
const importIndex = process.argv.indexOf("--import");
const manifest = importIndex >= 0
  ? await importWorkbench(path.resolve(process.argv[importIndex + 1] ?? ""), script)
  : JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.format !== FORMAT || manifest.version !== VERSION) fail("unexpected manifest format");
if (manifest.loudnessLufs !== TARGET_LUFS || manifest.channels !== 1) fail("unexpected loudness or channel count");
validateStory(manifest, script.story, pages);
validateKeyed(manifest.lines, script.lines.clips, "line", (clip, want) => {
  if (clip.textHash !== want.textHash) fail(`line ${clip.key} text hash differs`);
});
validateKeyed(manifest.narration, script.narration.clips, "narration");
if (JSON.stringify(manifest.unvoicedLines) !== JSON.stringify(script.lines.unvoiced)) {
  fail("unvoiced battle lines differ from the voice script");
}

const everyClip = [...manifest.clips, ...manifest.lines, ...manifest.narration];
const shipped = new Set(everyClip.map((clip) => clip.output.slice("voice/".length)));
for (const name of await listOggs(voiceRoot)) {
  if (!shipped.has(name)) fail(`voice/${name} is not in voice-manifest.json`);
}
for (const clip of everyClip) {
  const bytes = await readFile(path.join(assetRoot, clip.output));
  if (bytes.toString("ascii", 0, 4) !== "OggS" || sha256(bytes) !== clip.sha256 || bytes.length !== clip.bytes) {
    fail(`${clip.output} does not match voice-manifest.json`);
  }
  // Vorbis identification header: channel count is the byte after "\x01vorbis" + version.
  const header = bytes.indexOf(Buffer.from("\x01vorbis", "latin1"));
  if (header < 0 || bytes[header + 11] !== 1) fail(`${clip.output} is not mono Vorbis`);
}

// The first voiced page of every story is decoded on stage entry (VoiceDirector).
const leads = new Set();
const storyPages = new Map();
for (const entry of pageEntries) {
  if (typeof entry.page.source.record !== "number") continue;
  const list = storyPages.get(entry.storyId) ?? [];
  list.push(`${entry.page.source.record}:${entry.page.source.wait}`);
  storyPages.set(entry.storyId, list);
}
const clipKeys = new Set(manifest.clips.map((clip) => clip.key));
for (const keys of storyPages.values()) {
  const first = keys.find((key) => clipKeys.has(key));
  if (first) leads.add(first);
}

const storyEntries = [...manifest.clips]
  .sort((a, b) => a.record - b.record || a.wait - b.wait)
  .map((clip) => {
    const typed = pages.get(clip.key).typed.text;
    return `  { key: ${JSON.stringify(clip.key)}, source: ${JSON.stringify(`/assets/original/${clip.output}`)}, `
      + `gate: ${JSON.stringify(clip.gate)}, textHash: ${JSON.stringify(fnv1a(typed))}, `
      + `startGlyph: ${clip.startGlyph}, durationMs: ${clip.durationMs}${leads.has(clip.key) ? ", lead: true" : ""} },`;
  });

// Line clips sit at voice/line/<voiceId>/<textHash>.ogg; the runtime derives the
// URL, so the module only carries each voice's text hashes and durations.
const lineDurations = new Map();
for (const clip of manifest.lines) {
  const expectedOutput = `voice/line/${clip.voiceId}/${clip.textHash}.ogg`;
  if (clip.output !== expectedOutput) fail(`line ${clip.key} ships as ${clip.output}, not ${expectedOutput}`);
  const byHash = lineDurations.get(clip.voiceId) ?? {};
  byHash[clip.textHash] = clip.durationMs;
  lineDurations.set(clip.voiceId, byHash);
}
const portraitVoices = Object.entries(PORTRAIT_ROLES)
  .map(([portrait, role]) => [Number(portrait), VOICE_CAST[role].voiceId])
  .filter(([, voiceId]) => lineDurations.has(voiceId))
  .sort((a, b) => a[0] - b[0]);
const startup = manifest.narration
  .filter((clip) => clip.surface === "startup-crawl")
  .sort((a, b) => a.startUpdate - b.startUpdate);
const epilogue = manifest.narration
  .filter((clip) => clip.surface === "ending-epilogue")
  .sort((a, b) => a.key.localeCompare(b.key));

await writeFile(generatedModule, [
  "// Generated by scripts/generate-voice-catalog.mjs from voice/voice-manifest.json; do not edit by hand.",
  "import type { VoiceClip, VoiceNarrationClip } from \"./voice-catalog\";",
  "",
  `export const VOICE_CATALOG_LOUDNESS_LUFS = ${manifest.loudnessLufs};`,
  "",
  "export const VOICE_CLIPS: readonly VoiceClip[] = [",
  ...storyEntries,
  "];",
  "",
  "/** REMAKE-189 battle and feedback lines: voice id -> typed-text FNV-1a hash -> clip length in ms. */",
  "export const VOICE_LINE_DURATIONS: Readonly<Record<string, Readonly<Record<string, number>>>> = {",
  ...[...lineDurations.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([voiceId, byHash]) => `  ${JSON.stringify(voiceId)}: ${JSON.stringify(Object.fromEntries(Object.entries(byHash).sort()))},`),
  "};",
  "",
  "/** REMAKE-189: whose voice a portrait speaks battle lines in. */",
  "export const VOICE_PORTRAIT_VOICES: Readonly<Record<number, string>> = {",
  ...portraitVoices.map(([portrait, voiceId]) => `  ${portrait}: ${JSON.stringify(voiceId)},`),
  "};",
  "",
  "/** REMAKE-189 opening crawl narration, one clip per sentence, cued at its first line's scroll update. */",
  "export const VOICE_STARTUP_NARRATION: readonly (VoiceNarrationClip & { startUpdate: number })[] = [",
  ...startup.map((clip) => `  { key: ${JSON.stringify(clip.key)}, source: ${JSON.stringify(`/assets/original/${clip.output}`)}, `
    + `startUpdate: ${clip.startUpdate}, durationMs: ${clip.durationMs} },`),
  "];",
  "",
  "/** REMAKE-189 ending epilogue narration, keyed `<segment>:<selector>`. */",
  "export const VOICE_EPILOGUE_NARRATION: Readonly<Record<string, VoiceNarrationClip>> = {",
  ...epilogue.map((clip) => `  ${JSON.stringify(`${clip.segment}:${clip.selector}`)}: { key: ${JSON.stringify(clip.key)}, `
    + `source: ${JSON.stringify(`/assets/original/${clip.output}`)}, durationMs: ${clip.durationMs} },`),
  "};",
  "",
].join("\n"));
const minutes = everyClip.reduce((sum, clip) => sum + clip.durationMs, 0) / 60000;
const megabytes = everyClip.reduce((sum, clip) => sum + clip.bytes, 0) / 1048576;
console.log(`voice catalog: ${manifest.clips.length} story clips, ${manifest.lines.length} line clips, `
  + `${manifest.narration.length} narration clips (${minutes.toFixed(1)} min, ${megabytes.toFixed(1)} MiB), `
  + `${manifest.unvoiced.length} unvoiced pages -> ${path.relative(root, generatedModule)}`);
