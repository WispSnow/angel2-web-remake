#!/usr/bin/env node

// REMAKE-188 story voice-over. The asset pack's voice/voice-manifest.json is the
// source of truth (manifest and voice script in one file); this script turns it
// into src/game/content/voice-catalog.generated.ts after checking it, clip by
// clip, against the runtime SAY dialogue pages (scripts/lib/voice-pages.mjs):
//
// - every clip key names an existing SAY page that types text;
// - its display-text hash and spoken text match today's page and voice script,
//   so a later fix to the dialogue forces the affected clips to be redone;
// - every KY page of every SAY record has a clip or a stated reason not to;
// - every clip's voice is the accepted cast (scripts/lib/voice-cast.mjs);
// - every OGG matches its hash and is mono.
//
// `--import <workbench>` first copies finished clips from the git-ignored voice
// workbench (final.json + final/*.ogg, as made by its finish.mjs) into the asset
// pack and rewrites the manifest. The workbench never ships.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ELEVENLABS_MODEL, GHOST_MONTAGE, MINIMAX_MODEL, VOICE_CAST } from "./lib/voice-cast.mjs";
import { loadStoryPages, sayPages } from "./lib/voice-pages.mjs";
import { buildVoiceScript, UNVOICED_REASONS, VOICE_LEXICON, VOICE_TYPO_READINGS } from "./lib/voice-script.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(root, "public/assets/original");
const voiceRoot = path.join(assetRoot, "voice");
const manifestPath = path.join(voiceRoot, "voice-manifest.json");
const generatedModule = path.join(root, "src/game/content/voice-catalog.generated.ts");
const FORMAT = "ANGEL2 story voice-over";
const TARGET_LUFS = -19;

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** Must match `voiceTextHash` in src/game/content/voice-catalog.ts. */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const fail = (message) => {
  throw new Error(`voice catalog: ${message}`);
};

async function importWorkbench(workbench, script) {
  const final = JSON.parse(await readFile(path.join(workbench, "final.json"), "utf8"));
  if (final.format?.targetLufs !== TARGET_LUFS) fail(`workbench loudness target is not ${TARGET_LUFS} LUFS`);
  await rm(voiceRoot, { recursive: true, force: true });
  await mkdir(voiceRoot, { recursive: true });
  const clips = [];
  for (const clip of script.clips) {
    const finished = final.clips[clip.key];
    if (!finished) fail(`workbench has no finished clip for SAY ${clip.key}`);
    if (clip.role !== GHOST_MONTAGE.role && finished.spoken !== clip.spoken) {
      fail(`SAY ${clip.key} was synthesised from different text; regenerate it`);
    }
    const output = `voice/${path.basename(finished.file)}`;
    await copyFile(path.join(workbench, finished.file), path.join(assetRoot, output));
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
      ...(clip.platform
        ? {
          platform: clip.platform,
          model: clip.platform === "minimax" ? MINIMAX_MODEL : ELEVENLABS_MODEL,
          voiceId: clip.voiceId,
          voiceName: clip.voiceName,
          generation: finished.generation,
          take: finished.take,
          asr: finished.asr ? { text: finished.asr.asr, cer: finished.asr.cer, missing: finished.asr.missing } : undefined,
        }
        : { montage: finished.montage }),
      output,
      sha256: finished.sha256,
      bytes: finished.bytes,
      durationMs: finished.durationMs,
      loudnessLufs: finished.loudnessLufs,
      truePeakDbfs: finished.truePeakDbfs,
    });
  }
  const manifest = {
    format: FORMAT,
    version: 1,
    decision: "REMAKE-188",
    encoder: final.format.encoder,
    quality: final.format.quality,
    channels: 1,
    sampleRate: final.format.sampleRate,
    loudnessLufs: TARGET_LUFS,
    normalization: {
      typoReadings: VOICE_TYPO_READINGS,
      lexicon: VOICE_LEXICON,
      rules: "去掉空白與「」；『』改引號；．串改省略號、單個．改句號；ASCII 點分隔的咒語改頓號；～～留一個；台灣正體轉簡體，妳讀作你",
    },
    clips,
    unvoiced: script.unvoiced.map((page) => ({
      key: page.key,
      record: page.record,
      wait: page.wait,
      gate: page.stages[0],
      reason: page.reason,
      note: UNVOICED_REASONS[page.reason],
      ...(page.displayTextHash ? { displayTextHash: page.displayTextHash } : {}),
    })),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  return manifest;
}

function validate(manifest, script, pages) {
  if (manifest.format !== FORMAT || manifest.version !== 1) fail("unexpected manifest format");
  if (manifest.loudnessLufs !== TARGET_LUFS || manifest.channels !== 1) fail("unexpected loudness or channel count");
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
    const cast = VOICE_CAST[clip.role];
    if (!cast || clip.platform !== cast.platform || clip.voiceId !== cast.voiceId) {
      fail(`SAY ${clip.key} uses ${clip.platform}:${clip.voiceId}, the cast for ${clip.role} is ${cast?.platform}:${cast?.voiceId}`);
    }
    if (clip.model !== (cast.platform === "minimax" ? MINIMAX_MODEL : ELEVENLABS_MODEL)) fail(`SAY ${clip.key} uses model ${clip.model}`);
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

const pageEntries = await loadStoryPages(root);
const pageList = sayPages(pageEntries);
const pages = new Map(pageList.map((page) => [page.key, page]));
const script = buildVoiceScript(pageList);
const importIndex = process.argv.indexOf("--import");
const manifest = importIndex >= 0
  ? await importWorkbench(path.resolve(process.argv[importIndex + 1] ?? ""), script)
  : JSON.parse(await readFile(manifestPath, "utf8"));
validate(manifest, script, pages);

const shipped = new Set(manifest.clips.map((clip) => path.basename(clip.output)));
for (const name of await readdir(voiceRoot)) {
  if (name.endsWith(".ogg") && !shipped.has(name)) fail(`voice/${name} is not in voice-manifest.json`);
}
for (const clip of manifest.clips) {
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

const entries = [...manifest.clips]
  .sort((a, b) => a.record - b.record || a.wait - b.wait)
  .map((clip) => {
    const typed = pages.get(clip.key).typed.text;
    return `  { key: ${JSON.stringify(clip.key)}, source: ${JSON.stringify(`/assets/original/${clip.output}`)}, `
      + `gate: ${JSON.stringify(clip.gate)}, textHash: ${JSON.stringify(fnv1a(typed))}, `
      + `startGlyph: ${clip.startGlyph}, durationMs: ${clip.durationMs}${leads.has(clip.key) ? ", lead: true" : ""} },`;
  });
await writeFile(generatedModule, [
  "// Generated by scripts/generate-voice-catalog.mjs from voice/voice-manifest.json; do not edit by hand.",
  "import type { VoiceClip } from \"./voice-catalog\";",
  "",
  `export const VOICE_CATALOG_LOUDNESS_LUFS = ${manifest.loudnessLufs};`,
  "",
  "export const VOICE_CLIPS: readonly VoiceClip[] = [",
  ...entries,
  "];",
  "",
].join("\n"));
const minutes = manifest.clips.reduce((sum, clip) => sum + clip.durationMs, 0) / 60000;
const megabytes = manifest.clips.reduce((sum, clip) => sum + clip.bytes, 0) / 1048576;
console.log(`voice catalog: ${manifest.clips.length} clips (${minutes.toFixed(1)} min, ${megabytes.toFixed(1)} MiB), `
  + `${manifest.unvoiced.length} unvoiced pages -> ${path.relative(root, generatedModule)}`);
