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
  voiceTempoForRole,
} from "../../scripts/lib/voice-cast.mjs";
import { STORY_PAGES_BY_ID } from "../../src/game/content/dialogue";
import { STAGE49_STORY_PAGES } from "../../src/game/content/stage49-ending";
import {
  VOICE_CLIPS,
  gateVoiceUrls,
  voiceClipForPage,
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
  montage?: { words: Array<{ text: string; speaker: string }> };
  output: string;
  sha256: string;
  durationMs: number;
}

interface VoiceManifest {
  version: number;
  decision: string;
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
    expect(manifest).toMatchObject({ version: 1, decision: "REMAKE-188", loudnessLufs: -19, channels: 1 });
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

  test("speeds every ElevenLabs character up 1.15× and leaves the narrator and ghost montage as made", () => {
    const tempoByRole = new Map<string, Set<number>>();
    for (const clip of manifest.clips) {
      expect(clip.tempo, clip.key).toBe(voiceTempoForRole(clip.role));
      tempoByRole.set(clip.role, (tempoByRole.get(clip.role) ?? new Set()).add(clip.tempo));
    }
    expect(VOICE_TEMPO_BY_PLATFORM).toEqual({ minimax: 1, elevenlabs: 1.15 });
    expect(tempoByRole.get("narrator")).toEqual(new Set([1]));
    expect(tempoByRole.get("ghostMontage")).toEqual(new Set([1]));
    expect(tempoByRole.get("nia")).toEqual(new Set([1.15]));
    expect(manifest.clips.filter(({ tempo }) => tempo === 1.15)).toHaveLength(704);
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
    expect(gateVoiceUrls("ending", 2).every((url) => url.includes("/0070-"))).toBe(true);
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
