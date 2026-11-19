import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import {
  castRoleForPortrait,
  ELEVENLABS_MODEL,
  MINIMAX_MODEL,
  VOICE_CAST,
  VOICE_TEMPO_BY_PLATFORM,
  voiceTempoForClip,
  voiceTempoForRole,
} from "../../scripts/lib/voice-cast.mjs";
import { STORY_PAGES_BY_ID } from "../../src/game/content/dialogue";
import { STAGE49_STORY_PAGES } from "../../src/game/content/stage49-ending";
import {
  NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS,
  NATIVE_CONTEXTUAL_BATTLE_LINES,
  contextualBattleDialogueFor,
} from "../../src/game/content/ai-technique-dialogue";
import { GROUP_COMMAND_DIALOGUE, groupCommandDialogueFor } from "../../src/game/content/group-command-dialogue";
import { OUTCOME_FEEDBACK_PORTRAIT, OUTCOME_FEEDBACK_TEXT } from "../../src/game/content/outcome-feedback";
import { PORTRAIT_CATALOG, type PortraitRecord } from "../../src/game/content/portrait-catalog.generated";
import { PROMOTION_DIALOGUE_TEXT } from "../../src/game/content/promotion-dialogue";
import { STAGE3_FOURTH_CORPS_COUNTERATTACK_DIALOGUE } from "../../src/game/content/stage3";
import { STAGE49_EPILOGUE_SEGMENTS } from "../../src/game/content/stage49-ending.generated";
import { STARTUP_INTRO } from "../../src/game/content/startup.generated";
import {
  VOICE_CLIPS,
  VOICE_LINE_DURATIONS,
  VOICE_PORTRAIT_VOICES,
  VOICE_STARTUP_NARRATION,
  battleLineVoiceUrls,
  epilogueNarrationFor,
  gateVoiceUrls,
  voiceClipForPage,
  voiceCueForPage,
  voiceLineFor,
  voiceTypedText,
} from "../../src/game/content/voice-catalog";
import type { DialoguePage } from "../../src/game/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

interface VoiceManifestClip {
  key: string;
  record: number;
  wait: number;
  gate: string;
  role: string;
  portrait: number | null;
  displayTextHash: string;
  startGlyph: number;
  tempo: number;
  platform?: string;
  model?: string;
  voiceId?: string;
  generation?: { voiceId?: string };
  montage?: { words: Array<{ text: string; speaker: string; portrait?: number; voiceId?: string }> };
  output: string;
  sha256: string;
  durationMs: number;
}

interface VoiceManifestLine {
  key: string;
  textHash: string;
  roles: string[];
  surfaces: string[];
  platform: string;
  voiceId: string;
  generation?: { voiceId?: string };
  tempo: number;
  output: string;
  sha256: string;
  durationMs: number;
}

interface VoiceManifestNarration {
  key: string;
  surface: string;
  role: string;
  platform: string;
  tempo: number;
  startUpdate?: number;
  segment?: string;
  selector?: number;
  output: string;
  sha256: string;
}

interface VoiceManifest {
  version: number;
  decisions: string[];
  lines: VoiceManifestLine[];
  narration: VoiceManifestNarration[];
  unvoicedLines: Array<{ surface: string; reason: string }>;
  loudnessLufs: number;
  channels: number;
  clips: VoiceManifestClip[];
  unvoiced: Array<{ key: string; reason: string; gate: string }>;
}

interface RuntimePage {
  key: string;
  storyId: string;
  page: DialoguePage;
}

const UNVOICED_REASONS = new Set(["no-typing", "nothing-new", "no-spoken-glyph", "laugh-intro"]);

let manifest: VoiceManifest;
let runtimePages: Map<string, RuntimePage>;

beforeAll(async () => {
  manifest = JSON.parse(await readFile(
    path.join(root, "public/assets/original/voice/voice-manifest.json"),
    "utf8",
  )) as VoiceManifest;
  runtimePages = new Map();
  const add = (stories: Record<string, readonly DialoguePage[]>) => {
    for (const [storyId, pages] of Object.entries(stories)) {
      for (const page of pages) {
        if (typeof page.source.record !== "number") continue;
        runtimePages.set(`${page.source.record}:${page.source.wait}`, {
          key: `${page.source.record}:${page.source.wait}`,
          storyId,
          page,
        });
      }
    }
  };
  add(STORY_PAGES_BY_ID);
  const generated = import.meta.glob<Record<string, unknown>>(
    "../../src/game/content/stage*-runtime.generated.ts",
  );
  for (const [file, load] of Object.entries(generated)) {
    const stage = /stage(\d+)-runtime/u.exec(file)?.[1];
    if (!stage || stage === "0") continue;
    const module = await load();
    add(module[`STAGE${stage}_STORY_PAGES`] as Record<string, readonly DialoguePage[]>);
  }
  add({ "stage-49-ending-story": STAGE49_STORY_PAGES });
});

describe("REMAKE-188 voice catalog", () => {
  test("matches the asset pack manifest and its mono OGG bytes", async () => {
    expect(manifest).toMatchObject({ version: 2, decisions: ["REMAKE-188", "REMAKE-189"], loudnessLufs: -19, channels: 1 });
    const byKey = new Map(manifest.clips.map((clip) => [clip.key, clip]));
    expect(VOICE_CLIPS.map(({ key }) => key).sort()).toEqual([...byKey.keys()].sort());
    for (const clip of VOICE_CLIPS) {
      const entry = byKey.get(clip.key);
      expect(entry, clip.key).toBeDefined();
      expect(clip.source).toBe(`/assets/original/${entry?.output}`);
      expect(clip.gate).toBe(entry?.gate);
      expect(clip.durationMs).toBe(entry?.durationMs);
      const bytes = await readFile(path.join(root, "public", clip.source));
      expect(bytes.toString("ascii", 0, 4), clip.key).toBe("OggS");
      expect(sha256(bytes), clip.key).toBe(entry?.sha256);
    }
  });

  test("keys every clip to a runtime SAY page whose typed text still matches", () => {
    for (const clip of VOICE_CLIPS) {
      const runtime = runtimePages.get(clip.key);
      expect(runtime, clip.key).toBeDefined();
      expect(voiceClipForPage(runtime?.page), clip.key).toBe(clip);
      const typed = voiceTypedText(runtime!.page) ?? "";
      const displayHash = createHash("sha256").update(typed, "utf8").digest("hex").slice(0, 16);
      expect(manifest.clips.find(({ key }) => key === clip.key)?.displayTextHash, clip.key).toBe(displayHash);
    }
  });

  test("gives every KY page of all 89 SAY records a clip or a stated reason", () => {
    const records = new Set([...runtimePages.values()].map(({ page }) => page.source.record));
    expect(records.size).toBe(89);
    const clipKeys = new Set(VOICE_CLIPS.map(({ key }) => key));
    const unvoiced = new Map(manifest.unvoiced.map((page) => [page.key, page]));
    for (const key of runtimePages.keys()) {
      expect(clipKeys.has(key) !== unvoiced.has(key), key).toBe(true);
      if (unvoiced.has(key)) expect(UNVOICED_REASONS.has(unvoiced.get(key)!.reason), key).toBe(true);
    }
    expect(clipKeys.size + unvoiced.size).toBe(runtimePages.size);
  });

  test("casts every clip by the portrait in its typing window", () => {
    for (const clip of manifest.clips) {
      if (clip.role === "ghostMontage") continue;
      const page = runtimePages.get(clip.key)!.page;
      const portrait = page[page.activeSlot!]?.portrait;
      const role = castRoleForPortrait(portrait);
      expect(clip.role, clip.key).toBe(role);
      expect(clip.platform, clip.key).toBe(VOICE_CAST[role].platform);
      expect(clip.voiceId, clip.key).toBe(VOICE_CAST[role].voiceId);
      expect(clip.model, clip.key).toBe(clip.platform === "minimax" ? MINIMAX_MODEL : ELEVENLABS_MODEL);
    }
    // 旁白 is the only MiniMax voice; every portrait speaker is ElevenLabs.
    expect(new Set(manifest.clips.filter(({ platform }) => platform === "minimax").map(({ role }) => role)))
      .toEqual(new Set(["narrator"]));
  });

  test("speeds every voice up 1.15×, the stage-0 report to 1.25×, and leaves only the ghost montage as made", () => {
    const tempoByRole = new Map<string, Set<number>>();
    for (const clip of manifest.clips) {
      const expected = clip.role === "ghostMontage" ? voiceTempoForRole(clip.role) : voiceTempoForClip(clip.role, clip.record);
      expect(clip.tempo, clip.key).toBe(expected);
      tempoByRole.set(clip.role, (tempoByRole.get(clip.role) ?? new Set()).add(clip.tempo));
    }
    expect(VOICE_TEMPO_BY_PLATFORM).toEqual({ minimax: 1.15, elevenlabs: 1.15 });
    expect(tempoByRole.get("narrator")).toEqual(new Set([1.15]));
    expect(tempoByRole.get("ghostMontage")).toEqual(new Set([1]));
    // REMAKE-190: 妮雅 and the wounded soldier in SAY/0 only.
    expect(manifest.clips.filter(({ tempo }) => tempo === 1.25).map(({ key }) => key))
      .toEqual(["0:3", "0:4", "0:5", "0:6", "0:7", "0:8", "0:9", "0:10"]);
    expect(manifest.clips.filter(({ tempo }) => tempo === 1.15)).toHaveLength(772);
    expect(new Set([...manifest.lines, ...manifest.narration].map(({ tempo }) => tempo))).toEqual(new Set([1.15]));
  });

  test("reads 主將 as the noun zhǔjiàng (REMAKE-190)", () => {
    const request = manifest.lines.filter(({ surfaces }) => surfaces.includes("promotion:teammateRequest"));
    expect(request).toHaveLength(new Set(Object.values(VOICE_PORTRAIT_VOICES)).size);
    for (const line of request) expect((line as VoiceManifestLine & { spoken: string }).spoken).toContain("请主匠授我");
  });

  test("recasts both soldiers to their Voice Designs and ships no take of the old voices (REMAKE-199)", () => {
    const ally = VOICE_CAST.allySoldier.voiceId;
    const enemy = VOICE_CAST.enemySoldier.voiceId;
    const bobo = "s2LjOZIlsH2Yu4p6MtAK";
    expect([ally, enemy]).toEqual(["Z8p0MlPvzTFHOcAHKWvy", "beNkyvjHANgYeFc6IcWa"]);
    // 士兵, 戰士 and the half-dragon family that used to borrow Bobo.
    for (const portrait of [47, 57, 64, 17, 26]) expect(VOICE_PORTRAIT_VOICES[portrait], `D/${portrait}`).toBe(ally);
    // The enemy soldier no longer shares 莎's Maya.
    expect(VOICE_PORTRAIT_VOICES[48]).toBe(enemy);
    expect(VOICE_PORTRAIT_VOICES[36]).toBe(VOICE_CAST.sha.voiceId);
    expect(VOICE_PORTRAIT_VOICES[36]).not.toBe(enemy);
    expect(Object.values(VOICE_PORTRAIT_VOICES)).not.toContain(bobo);
    expect(Object.keys(VOICE_LINE_DURATIONS)).not.toContain(bobo);
    expect(manifest.clips.filter(({ role }) => role === "allySoldier" || role === "enemySoldier")).toHaveLength(24);
    // A recast leaves the old voice's takes under the same story keys; the voice
    // a clip is filed under must be the one that actually spoke it.
    for (const clip of [...manifest.clips, ...manifest.lines]) {
      if (clip.platform) expect(clip.generation?.voiceId, clip.key).toBe(clip.voiceId);
    }
    const word = manifest.clips.find(({ key }) => key === "164:22")?.montage?.words.find(({ portrait }) => portrait === 48);
    expect(word).toMatchObject({ text: "再度", voiceId: enemy });
  });

  test("splices SAY/0164 KY 20–23 word by word and starts KY 20 on the first speaker", () => {
    const montage = manifest.clips.filter(({ role }) => role === "ghostMontage");
    expect(montage.map(({ key }) => key)).toEqual(["164:20", "164:21", "164:22", "164:23"]);
    expect(montage.map(({ montage: words }) => words?.words.length)).toEqual([6, 8, 8, 2]);
    const first = montage[0];
    const typed = voiceTypedText(runtimePages.get("164:20")!.page) ?? "";
    const glyphs = [...typed].filter((character) => /[^\x00-\x7f]/u.test(character));
    expect(glyphs[first.startGlyph]).toBe(first.montage!.words[0].text[0]);
    // The laugh intro the user dropped (round 4) stays text-only.
    expect(manifest.unvoiced.find(({ key }) => key === "164:19")?.reason).toBe("laugh-intro");
  });

  test("never requests voice files while voice is off, and keeps them out of other gates", () => {
    expect(gateVoiceUrls("stage-00", 0)).toEqual([]);
    const stage0 = gateVoiceUrls("stage-00", 4);
    expect(stage0.length).toBeGreaterThan(0);
    expect(stage0.every((url) => url.startsWith("/assets/original/voice/0000-")
      || /\/000[1-3]-/u.test(url))).toBe(true);
    // The ending route also carries the epilogue narration (REMAKE-189).
    expect(gateVoiceUrls("ending", 2).every((url) => url.includes("/0070-") || url.includes("/narration/epilogue-")))
      .toBe(true);
    expect(gateVoiceUrls("ending", 2).filter((url) => url.includes("/narration/"))).toHaveLength(8);
  });

  test("treats changed text, string records and appended pages by the typed part only", () => {
    const page = runtimePages.get("0:6")!.page;
    expect(page.revealStart).toBeGreaterThan(0);
    expect(voiceClipForPage(page)).toBeDefined();
    const modded: DialoguePage = {
      ...page,
      lower: { ...page.lower!, text: `${page.lower!.text}改` },
    };
    expect(voiceClipForPage(modded)).toBeUndefined();
    expect(voiceClipForPage({ ...page, source: { record: "promotion", wait: 6 } })).toBeUndefined();
  });
});

describe("REMAKE-189 battle lines and narration", () => {
  const speaker = (portrait: PortraitRecord, side: 1 | 2 = 1) => ({ name: `D/${portrait}`, portrait, side });
  /** Named allies and enemies, roster allies and generic family portraits of both sides. */
  const SAMPLE_PORTRAITS: readonly PortraitRecord[] = [46, 45, 10, 0, 12, 4, 26, 1, 47, 48, 49, 50, 51, 53, 57, 58, 59, 60, 61, 62, 64];

  test("ships every line clip at voice/line/<voice>/<text hash>.ogg and the runtime knows its length", async () => {
    expect(manifest.lines.length).toBeGreaterThan(1_000);
    for (const line of manifest.lines) {
      expect(line.output, line.key).toBe(`voice/line/${line.voiceId}/${line.textHash}.ogg`);
      expect(VOICE_LINE_DURATIONS[line.voiceId]?.[line.textHash], line.key).toBe(line.durationMs);
      const bytes = await readFile(path.join(root, "public/assets/original", line.output));
      expect(bytes.toString("ascii", 0, 4), line.key).toBe("OggS");
      expect(sha256(bytes), line.key).toBe(line.sha256);
      // Characters only: the narrator never speaks a battle line.
      expect(line.platform, line.key).toBe("elevenlabs");
    }
  });

  test("gives every named portrait a battle voice from the cast", () => {
    for (const [record, entry] of Object.entries(PORTRAIT_CATALOG)) {
      if (!entry.battleDisplayName && !entry.displayName) continue;
      const role = castRoleForPortrait(Number(record));
      expect(VOICE_PORTRAIT_VOICES[Number(record)], `D/${record}`).toBe(VOICE_CAST[role].voiceId);
    }
  });

  test("voices every DS:84BB line and technique notice for any battle speaker, but not the EXP readout", () => {
    for (const portrait of SAMPLE_PORTRAITS) {
      for (const line of Object.keys(NATIVE_CONTEXTUAL_BATTLE_LINES) as (keyof typeof NATIVE_CONTEXTUAL_BATTLE_LINES)[]) {
        const cue = voiceCueForPage(contextualBattleDialogueFor(speaker(portrait, 2), line));
        if (line === "experienceGain") expect(cue, `${portrait}:${line}`).toBeUndefined();
        else expect(cue, `${portrait}:${line}`).toMatchObject({ kind: "line" });
      }
      for (const group of NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS) {
        expect(voiceLineFor(portrait, group.text), `${portrait}:${group.text}`).toBeDefined();
      }
    }
    expect(manifest.unvoicedLines.map(({ surface }) => surface)).toEqual(["contextual:experienceGain"]);
  });

  test("voices the group commands and the promotion dialogue in whoever speaks them", () => {
    for (const portrait of SAMPLE_PORTRAITS) {
      for (const id of Object.keys(GROUP_COMMAND_DIALOGUE) as (keyof typeof GROUP_COMMAND_DIALOGUE)[]) {
        expect(voiceCueForPage(groupCommandDialogueFor(id, speaker(portrait))), `${portrait}:${id}`).toBeDefined();
      }
      for (const text of Object.values(PROMOTION_DIALOGUE_TEXT)) {
        expect(voiceLineFor(portrait, text), `${portrait}:${text}`).toBeDefined();
      }
    }
  });

  test("voices 妮雅's outcome feedback and the REMAKE-172 authored pages, and nothing with changed text", () => {
    for (const text of Object.values(OUTCOME_FEEDBACK_TEXT)) {
      expect(voiceLineFor(OUTCOME_FEEDBACK_PORTRAIT, text)).toBeDefined();
      expect(voiceLineFor(OUTCOME_FEEDBACK_PORTRAIT, `${text}改`)).toBeUndefined();
    }
    for (const page of STAGE3_FOURTH_CORPS_COUNTERATTACK_DIALOGUE.pages) {
      expect(voiceCueForPage(page), page.source.address).toMatchObject({ kind: "line" });
    }
    expect(voiceLineFor(undefined, OUTCOME_FEEDBACK_TEXT.defeat)).toBeUndefined();
  });

  test("narrates the opening crawl sentence by sentence and every epilogue variant", () => {
    const crawl = manifest.narration.filter(({ surface }) => surface === "startup-crawl");
    expect(crawl.map(({ startUpdate }) => startUpdate)).toEqual(VOICE_STARTUP_NARRATION.map(({ startUpdate }) => startUpdate));
    const spokenLines = STARTUP_INTRO.lines.filter(({ text }) => text.trim().length > 0).map(({ update }) => update);
    const covered = crawl.flatMap((clip) => (clip as VoiceManifestNarration & { lineUpdates: number[] }).lineUpdates);
    expect(covered).toEqual(spokenLines);
    let variants = 0;
    for (const segment of STAGE49_EPILOGUE_SEGMENTS) {
      for (const variant of segment.variants) {
        variants += 1;
        expect(epilogueNarrationFor(segment.id, variant.selector), `${segment.id}:${variant.selector}`).toBeDefined();
      }
    }
    expect(manifest.narration.filter(({ surface }) => surface === "ending-epilogue")).toHaveLength(variants);
    expect(new Set(manifest.narration.map(({ role, platform }) => `${role}/${platform}`))).toEqual(new Set(["narrator/minimax"]));
  });

  test("downloads a board's battle lines by voice, and nothing while voice is off", () => {
    expect(battleLineVoiceUrls([46, 47], 0)).toEqual([]);
    const urls = battleLineVoiceUrls([46, 47, 57], 4);
    const voices = new Set([VOICE_PORTRAIT_VOICES[46], VOICE_PORTRAIT_VOICES[47]]);
    // 士兵 (47) and 戰士 (57) share one voice, so the list holds two voices' lines.
    expect(VOICE_PORTRAIT_VOICES[57]).toBe(VOICE_PORTRAIT_VOICES[47]);
    expect(new Set(urls.map((url) => url.split("/")[5]))).toEqual(voices);
    expect(urls).toHaveLength([...voices].reduce((sum, voice) => sum + Object.keys(VOICE_LINE_DURATIONS[voice]).length, 0));
  });
});
