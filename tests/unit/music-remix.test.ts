import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { STAGE_MUSIC_PROGRAMS } from "../../src/game/content/music";
import { MUSIC_BOX_TRACKS, musicBoxProgram } from "../../src/game/content/music-box";
import {
  ORCHESTRAL_TRANSITION_FADE_SECONDS,
  musicRemixFor,
  stageRemixMusicUrls,
  styledMusicProgram,
} from "../../src/game/content/music-remix";
import { MUSIC_REMIX_TRACKS } from "../../src/game/content/music-remix.generated";
import { STAGE17_MUSIC_PROGRAMS } from "../../src/game/content/stage17";
import { STAGE4_MUSIC_PROGRAMS } from "../../src/game/content/stage4";
import { STAGE0_DEFINITION } from "../../src/game/content/stages";
import {
  MusicTransport,
  type MusicProgram,
  type MusicTransportState,
} from "../../src/game/music-transport";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

interface RemixManifest {
  version: number;
  decision: string;
  loudnessLufs: number;
  tracks: Array<{
    key: string;
    output: string;
    sha256: string;
    sampleRate: number;
    frames: number;
    loopStartFrame: number;
    loopEndFrame: number;
  }>;
}

const stage0 = STAGE_MUSIC_PROGRAMS;

describe("REMAKE-181 remix catalog", () => {
  test("matches the asset pack manifest and its OGG bytes", async () => {
    const manifest = JSON.parse(await readFile(
      path.join(root, "public/assets/original/music/remix/remix-manifest.json"),
      "utf8",
    )) as RemixManifest;
    expect(manifest).toMatchObject({ version: 1, decision: "REMAKE-181", loudnessLufs: -16 });
    expect(MUSIC_REMIX_TRACKS.map(({ key }) => key)).toEqual(manifest.tracks.map(({ key }) => key));
    for (const [index, track] of manifest.tracks.entries()) {
      const generated = MUSIC_REMIX_TRACKS[index];
      expect(generated).toMatchObject({
        key: track.key,
        source: `/assets/original/${track.output}`,
        sampleRate: track.sampleRate,
        frames: track.frames,
        loopStartFrame: track.loopStartFrame,
        loopEndFrame: track.loopEndFrame,
      });
      expect(track.loopStartFrame).toBeGreaterThan(0);
      expect(track.loopEndFrame).toBeLessThanOrEqual(track.frames);
      const bytes = await readFile(path.join(root, "public/assets/original", track.output));
      expect(bytes.toString("ascii", 0, 4)).toBe("OggS");
      expect(sha256(bytes)).toBe(track.sha256);
    }
  });

  test("covers the three stage 0 pilot tracks", () => {
    expect(MUSIC_REMIX_TRACKS.map(({ key }) => key).sort()).toEqual([
      "MAGIC/73",
      "MUSIC/5→MUSIC/4",
      "MUSIC/7→MUSIC/6",
    ]);
  });
});

describe("REMAKE-181 style mapping", () => {
  test("leaves every program untouched in 原版 mode", () => {
    for (const program of Object.values(stage0)) {
      expect(styledMusicProgram(program, "original")).toBe(program);
    }
    expect(styledMusicProgram(undefined, "orchestral")).toBeUndefined();
  });

  test("swaps all three stage 0 programs for single-file remixes in 交響 mode", () => {
    const story = styledMusicProgram(stage0["stage-00-story-music"], "orchestral");
    expect(story).toMatchObject({
      id: "stage0-story:orchestral",
      kind: "remix-loop",
      loopTrack: "MAGIC/73",
      source: "/assets/original/music/remix/MAGIC-73.ogg",
    });
    expect(story).not.toHaveProperty("entryTrack");
    const player = styledMusicProgram(stage0["stage-00-player-phase-music"], "orchestral");
    expect(player).toMatchObject({
      id: "stage0-player-battle:orchestral",
      kind: "remix-loop",
      entryTrack: "MUSIC/7",
      loopTrack: "MUSIC/6",
      source: "/assets/original/music/remix/MUSIC-07-06.ogg",
    });
    const remix = MUSIC_REMIX_TRACKS.find(({ key }) => key === "MUSIC/7→MUSIC/6");
    if (!remix || player?.kind !== "remix-loop") throw new Error("player remix missing");
    expect(player.loopStartSeconds).toBeCloseTo(remix.loopStartFrame / remix.sampleRate, 9);
    expect(player.loopEndSeconds).toBeCloseTo(remix.loopEndFrame / remix.sampleRate, 9);
    expect(styledMusicProgram(stage0["stage-00-enemy-phase-music"], "orchestral")).toMatchObject({
      kind: "remix-loop",
      entryTrack: "MUSIC/5",
      loopTrack: "MUSIC/4",
    });
  });

  test("keys remixes by original track, so later stages share them and others fall back", () => {
    // Stage 17's player phase plays MUSIC/7→6, stage 4's enemy phase MUSIC/5→4.
    expect(musicRemixFor(STAGE17_MUSIC_PROGRAMS["stage-17-player-phase-music"])?.key).toBe("MUSIC/7→MUSIC/6");
    expect(musicRemixFor(STAGE4_MUSIC_PROGRAMS["stage-04-enemy-phase-music"])?.key).toBe("MUSIC/5→MUSIC/4");
    const stage4Story = STAGE4_MUSIC_PROGRAMS["stage-04-story-music"];
    expect(musicRemixFor(stage4Story)).toBeUndefined();
    expect(styledMusicProgram(stage4Story, "orchestral")).toBe(stage4Story);
    // An already styled program is not styled twice.
    const styled = styledMusicProgram(stage0["stage-00-story-music"], "orchestral");
    expect(styledMusicProgram(styled, "orchestral")).toBe(styled);
  });

  test("lets the music box tag exactly the remixed tracks", () => {
    const remixed = MUSIC_BOX_TRACKS
      .filter((track) => musicRemixFor(musicBoxProgram(track)))
      .map((track) => `${track.container}/${track.record}`)
      .sort();
    expect(remixed).toEqual(["MAGIC/73", "MUSIC/4", "MUSIC/6"]);
  });

  test("lists a stage's remix files for the resource gate only in 交響 mode", () => {
    expect(stageRemixMusicUrls(STAGE0_DEFINITION.music, "original")).toEqual([]);
    expect([...stageRemixMusicUrls(STAGE0_DEFINITION.music, "orchestral")].sort()).toEqual([
      "/assets/original/music/remix/MAGIC-73.ogg",
      "/assets/original/music/remix/MUSIC-05-04.ogg",
      "/assets/original/music/remix/MUSIC-07-06.ogg",
    ]);
  });
});

/** The parts of Web Audio the transport touches, recording what it schedules. */
class FakeParam {
  readonly events: Array<{ type: string; value: number; time: number }> = [];
  setValueAtTime(value: number, time: number): void { this.events.push({ type: "set", value, time }); }
  linearRampToValueAtTime(value: number, time: number): void { this.events.push({ type: "ramp", value, time }); }
  cancelAndHoldAtTime(time: number): void { this.events.push({ type: "hold", value: Number.NaN, time }); }
}

class FakeGain {
  readonly gain = new FakeParam();
  connect(): void {}
}

class FakeSource {
  buffer?: { duration: number };
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startedAt?: number;
  stoppedAt?: number;
  connect(): void {}
  start(time: number): void { this.startedAt = time; }
  stop(time: number): void { this.stoppedAt = time; }
  addEventListener(): void {}
}

class FakeBuffer {
  readonly numberOfChannels = 2;
  constructor(readonly length: number, readonly sampleRate: number) {}
  get duration(): number { return this.length / this.sampleRate; }
  getChannelData(): Float32Array { return new Float32Array(this.length); }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 10;
  state = "suspended";
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  constructor() { FakeAudioContext.instances.push(this); }
  createGain(): FakeGain { return new FakeGain(); }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(length, sampleRate);
  }
  async decodeAudioData(encoded: ArrayBuffer): Promise<FakeBuffer> {
    // The fake "file" carries its decoded length in seconds.
    return new FakeBuffer(Math.round(new Float64Array(encoded)[0] * 48_000), 48_000);
  }
  async resume(): Promise<void> { this.state = "running"; }
  async suspend(): Promise<void> { this.state = "suspended"; }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe("REMAKE-181 single-file loop transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.instances = [];
  });

  const startTransport = (durations: Record<string, number>) => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("fetch", async (url: string) => ({
      ok: true,
      arrayBuffer: async () => new Float64Array([durations[url] ?? 1]).buffer,
    }));
    const states: MusicTransportState[] = [];
    const transport = new MusicTransport(1, (state) => states.push(state));
    transport.unlock();
    return { transport, states };
  };

  const remix: MusicProgram = {
    id: "test-remix",
    kind: "remix-loop",
    entryTrack: "MUSIC/7",
    loopTrack: "MUSIC/6",
    source: "/remix-test.ogg",
    loopStartSeconds: 10.5,
    loopEndSeconds: 131.0535,
  };

  test("plays one buffer from 0 and loops it natively between the loop points", async () => {
    const { transport, states } = startTransport({ "/remix-test.ogg": 131.0535 });
    transport.select(remix);
    await flush();
    const context = FakeAudioContext.instances[0];
    expect(context.sources).toHaveLength(1);
    const [source] = context.sources;
    expect(source).toMatchObject({ loop: true, loopStart: 10.5 });
    expect(source.loopEnd).toBeCloseTo(131.0535, 3);
    expect(source.startedAt).toBeCloseTo(10.01, 6);
    expect(states.at(-1)).toMatchObject({
      track: "MUSIC/7",
      source: "remix",
      part: "entry",
      playing: true,
    });
    transport.select(undefined);
  });

  test("rejects loop points beyond the decoded file instead of looping silence", async () => {
    const { transport, states } = startTransport({ "/remix-test.ogg": 100 });
    transport.select(remix);
    await flush();
    expect(states.at(-1)?.error).toMatch(/loop points fall outside/u);
    expect(states.at(-1)?.playing).toBe(false);
  });

  test("fades the outgoing program over the requested time, 5 ms by default", async () => {
    const { transport } = startTransport({ "/remix-test.ogg": 131.0535, "/b.ogg": 60 });
    const other: MusicProgram = { ...remix, id: "other", source: "/b.ogg", loopEndSeconds: 59 };
    transport.select(remix);
    await flush();
    const context = FakeAudioContext.instances[0];
    context.currentTime = 20;
    transport.select(other, false, ORCHESTRAL_TRANSITION_FADE_SECONDS);
    await flush();
    expect(context.sources[0].stoppedAt).toBeCloseTo(20.01 + 0.6, 6);
    expect(context.sources[1].startedAt).toBeCloseTo(20.01, 6);

    context.currentTime = 30;
    transport.select(remix);
    await flush();
    expect(context.sources[1].stoppedAt).toBeCloseTo(30.01 + 0.005, 6);
  });
});
