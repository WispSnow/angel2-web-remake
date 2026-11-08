import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ORCHESTRAL_TRANSITION_FADE_SECONDS, startupRemixUrls } from "../../src/game/content/music-remix";
import { STARTUP_ASSETS } from "../../src/game/content/startup";
import { primeEncodedMusic } from "../../src/game/music-resource-cache";
import {
  prepareStartupMusic,
  STARTUP_REMIX_WAIT_MS,
  type FetchStartupRemixes,
} from "../../src/game/startup-music";

class FakeGain {
  ramps: number[] = [];
  gain = {
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: (_value: number, at: number) => { this.ramps.push(at); },
  };
  connect = () => undefined;
  disconnect = () => undefined;
}

class FakeSource {
  buffer: { url: string } | undefined;
  onended: (() => void) | null = null;
  stoppedAt: number | undefined;
  connect = () => undefined;
  disconnect = () => undefined;
  start = () => undefined;
  stop = (at = 0) => { this.stoppedAt = at; };
}

class FakeContext {
  static last: FakeContext;
  currentTime = 10;
  state: AudioContextState = "suspended";
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  closed = 0;
  constructor() { FakeContext.last = this; }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  decodeAudioData = async (bytes: ArrayBuffer) => ({ url: new TextDecoder().decode(bytes) });
  resume = async () => { this.state = "running"; };
  suspend = async () => { this.state = "suspended"; };
  close = async () => { this.closed += 1; };
}

const encode = (url: string): ArrayBuffer => new TextEncoder().encode(url).buffer as ArrayBuffer;
const remix = startupRemixUrls();
const original = STARTUP_ASSETS.audio;
const playedUrl = (): string | undefined => FakeContext.last.sources.at(-1)?.buffer?.url;

const deliverRemixes: FetchStartupRemixes = async (urls) => {
  for (const url of urls) primeEncodedMusic(url, encode(url));
};

const prepare = (fetchRemixes: FetchStartupRemixes = deliverRemixes) => {
  primeEncodedMusic(original.intro, encode(original.intro));
  primeEncodedMusic(original.title, encode(original.title));
  return prepareStartupMusic(fetchRemixes);
};

describe("REMAKE-186 startup music style", () => {
  beforeEach(() => {
    vi.stubGlobal("AudioContext", FakeContext);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("targets the two tracks the startup player owns", () => {
    expect(remix).toEqual({
      intro: "/assets/original/music/remix/MUSIC-14.ogg",
      title: "/assets/original/music/remix/MUSIC-01.ogg",
    });
  });

  test("原版 fetches no remix and keeps the hard stop", async () => {
    const fetchRemixes = vi.fn(deliverRemixes);
    const music = await prepare(fetchRemixes);
    await music.selectStyle("original");
    music.playIntro();
    expect(music.source).toBe("original");
    expect(playedUrl()).toBe(original.intro);
    music.stopIntro();
    expect(fetchRemixes).not.toHaveBeenCalled();
    expect(FakeContext.last.sources.at(-1)?.stoppedAt).toBe(0);
  });

  test("交響 plays both remixes once and fades them out", async () => {
    const music = await prepare();
    await music.selectStyle("orchestral");
    expect(music.source).toBe("remix");
    music.playIntro();
    expect(playedUrl()).toBe(remix.intro);
    music.stopIntro();
    const fadeEnd = 10 + ORCHESTRAL_TRANSITION_FADE_SECONDS;
    expect(FakeContext.last.sources.at(-1)?.stoppedAt).toBe(fadeEnd);
    expect(FakeContext.last.gains.at(-1)?.ramps).toEqual([fadeEnd]);

    const ended = vi.fn();
    music.playTitle(ended);
    expect(playedUrl()).toBe(remix.title);
    FakeContext.last.sources.at(-1)?.onended?.();
    expect(ended).toHaveBeenCalledOnce();
    expect(music.titlePlaying).toBe(false);
  });

  test("selecting twice reuses the one download", async () => {
    const fetchRemixes = vi.fn(deliverRemixes);
    const music = await prepare(fetchRemixes);
    music.prepareRemix();
    await music.selectStyle("orchestral");
    await music.selectStyle("orchestral");
    expect(fetchRemixes).toHaveBeenCalledOnce();
  });

  test("a failed download keeps the originals and a later selection retries", async () => {
    const fetchRemixes = vi.fn<FetchStartupRemixes>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(deliverRemixes);
    const music = await prepare(fetchRemixes);
    await expect(music.selectStyle("orchestral")).resolves.toBeUndefined();
    expect(music.source).toBe("original");
    await music.selectStyle("orchestral");
    expect(music.source).toBe("remix");
  });

  test("a stalled download gives way after the wait limit", async () => {
    vi.useFakeTimers();
    const music = await prepare(() => new Promise<void>(() => undefined));
    let settled = false;
    void music.selectStyle("orchestral").then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(STARTUP_REMIX_WAIT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(music.source).toBe("original");
  });

  test("dispose lets a running fade finish before closing the context", async () => {
    vi.useFakeTimers();
    const music = await prepare();
    await music.selectStyle("orchestral");
    music.playTitle(() => undefined);
    music.dispose();
    expect(FakeContext.last.closed).toBe(0);
    await vi.advanceTimersByTimeAsync(ORCHESTRAL_TRANSITION_FADE_SECONDS * 1000 + 1);
    expect(FakeContext.last.closed).toBe(1);
  });

  test("dispose closes at once when nothing fades", async () => {
    const music = await prepare();
    music.playTitle(() => undefined);
    music.dispose();
    expect(FakeContext.last.closed).toBe(1);
  });
});
