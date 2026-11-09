import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ORCHESTRAL_TRANSITION_FADE_SECONDS, startupRemixUrls } from "../../src/game/content/music-remix";
import { STARTUP_ASSETS } from "../../src/game/content/startup";
import { loadEncodedMusic, primeEncodedMusic, releaseEncodedMusic } from "../../src/game/music-resource-cache";
import {
  prepareStartupMusic,
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
    await expect(music.selectStyle("original")).resolves.toBe(true);
    music.playIntro();
    expect(music.source).toBe("original");
    expect(playedUrl()).toBe(original.intro);
    music.stopIntro();
    expect(fetchRemixes).not.toHaveBeenCalled();
    expect(FakeContext.last.sources.at(-1)?.stoppedAt).toBe(0);
  });

  test("交響 plays both remixes once and fades them out", async () => {
    const music = await prepare();
    await expect(music.selectStyle("orchestral")).resolves.toBe(true);
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

  test("the background download fetches without decoding, and 交響 reuses it", async () => {
    const fetchRemixes = vi.fn(deliverRemixes);
    const music = await prepare(fetchRemixes);
    const decode = vi.spyOn(FakeContext.last, "decodeAudioData");
    music.downloadRemix();
    await vi.waitFor(() => expect(fetchRemixes).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(decode).not.toHaveBeenCalled();
    await expect(music.selectStyle("orchestral")).resolves.toBe(true);
    expect(fetchRemixes).toHaveBeenCalledOnce();
    expect(decode).toHaveBeenCalledTimes(2);
  });

  test("REMAKE-187: a failed download reports false, keeps the originals and can retry", async () => {
    const fetchRemixes = vi.fn<FetchStartupRemixes>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(deliverRemixes);
    const music = await prepare(fetchRemixes);
    await expect(music.selectStyle("orchestral")).resolves.toBe(false);
    expect(music.source).toBe("original");
    await expect(music.selectStyle("orchestral")).resolves.toBe(true);
    expect(music.source).toBe("remix");
  });

  test("REMAKE-187: 交響 has no time limit and reports where the download stands", async () => {
    vi.useFakeTimers();
    let report: (percent: number) => void = () => undefined;
    let finish = () => undefined as void;
    const music = await prepare((urls, onPercent) => new Promise<void>((resolve) => {
      report = onPercent;
      finish = () => {
        for (const url of urls) primeEncodedMusic(url, encode(url));
        resolve();
      };
    }));
    music.downloadRemix();
    report(40);
    const seen: number[] = [];
    let settled = false;
    void music.selectStyle("orchestral", (percent) => seen.push(percent)).then(() => { settled = true; });
    report(40);
    report(70);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(settled).toBe(false);
    expect(seen).toEqual([40, 70]);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    expect(music.source).toBe("remix");
  });

  test("REMAKE-187: choosing 原版 during the wait keeps a late download from taking over", async () => {
    let finish = () => undefined as void;
    const music = await prepare((urls) => new Promise<void>((resolve) => {
      finish = () => {
        for (const url of urls) primeEncodedMusic(url, encode(url));
        resolve();
      };
    }));
    const waited = music.selectStyle("orchestral");
    await expect(music.selectStyle("original")).resolves.toBe(true);
    finish();
    await expect(waited).resolves.toBe(false);
    expect(music.source).toBe("original");
  });

  test("REMAKE-187: bytes nobody decoded leave with the opening", async () => {
    const music = await prepare();
    music.downloadRemix();
    await vi.waitFor(async () => {
      const fetchMusic = vi.fn<typeof fetch>();
      const request = loadEncodedMusic(remix.intro, fetchMusic);
      expect(fetchMusic).not.toHaveBeenCalled();
      await request;
    });
    music.dispose();
    const fetchMusic = vi.fn<typeof fetch>(async () => new Response(encode(remix.intro)));
    const request = loadEncodedMusic(remix.intro, fetchMusic);
    expect(fetchMusic).toHaveBeenCalledOnce();
    await request;
    releaseEncodedMusic(remix.intro, request);
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
