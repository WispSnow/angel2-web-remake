import { beforeEach, describe, expect, it, vi } from "vitest";

// Web Audio playback is covered by the `VoiceTransport` tests in `voice.test.ts`; a stand-in
// here lets the tests drive the crawl clock and pin when each sentence is allowed to start.
const fakes = vi.hoisted(() => {
  class FakeVoiceTransport {
    static last: FakeVoiceTransport;
    readonly ready = new Set<string>();
    readonly prepared: string[] = [];
    readonly played: string[] = [];
    readonly stops: (number | undefined)[] = [];
    readonly suspended: boolean[] = [];
    gain: number;
    unlocked = false;
    destroyed = false;
    accepts = true;
    ended?: () => void;
    constructor(gain: number, readonly onState: (state: unknown) => void) {
      this.gain = gain;
      FakeVoiceTransport.last = this;
    }
    setGain(gain: number): void {
      this.gain = gain;
    }
    async prepare(url: string): Promise<boolean> {
      this.prepared.push(url);
      this.ready.add(url);
      return true;
    }
    isReady(url: string): boolean {
      return this.ready.has(url);
    }
    play(url: string, onEnded?: () => void): boolean {
      this.played.push(url);
      this.ended = onEnded;
      return this.accepts;
    }
    stop(fadeSeconds?: number): void {
      this.stops.push(fadeSeconds);
    }
    unlock(): void {
      this.unlocked = true;
    }
    setSuspended(suspended: boolean): void {
      this.suspended.push(suspended);
    }
    destroy(): void {
      this.destroyed = true;
    }
  }
  return { FakeVoiceTransport };
});
vi.mock("../../src/game/voice-transport", () => ({ VoiceTransport: fakes.FakeVoiceTransport }));

import {
  VOICE_FADE_OUT_SECONDS,
  VOICE_GAIN_BY_VOLUME,
  VOICE_STARTUP_NARRATION,
} from "../../src/game/content/voice-catalog";
import { StartupNarration, type StartupNarrationState } from "../../src/game/startup-narration";

const UPDATE_MS = 120;
const sentences = VOICE_STARTUP_NARRATION;
const cue = (index: number) => sentences[index].startUpdate * UPDATE_MS;
const source = (index: number) => sentences[index].source;

/** Narration with every sentence decoded, voice on and the crawl started. */
const running = () => {
  const states: StartupNarrationState[] = [];
  const narration = new StartupNarration(async () => undefined, (state) => states.push(state));
  const transport = fakes.FakeVoiceTransport.last;
  narration.setVolume(4);
  for (const { source: url } of sentences) transport.ready.add(url);
  narration.start();
  return { narration, transport, last: () => states.at(-1) };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("REMAKE-189 opening crawl narration", () => {
  it("has one clip per crawl sentence, cued in crawl order", () => {
    expect(sentences.length).toBeGreaterThan(1);
    for (let index = 1; index < sentences.length; index += 1) {
      expect(sentences[index].startUpdate).toBeGreaterThan(sentences[index - 1].startUpdate);
    }
  });

  it("requests nothing and never speaks while voice is off", () => {
    const loader = vi.fn(async () => undefined);
    const narration = new StartupNarration(loader);
    const transport = fakes.FakeVoiceTransport.last;
    narration.setVolume(0);
    narration.start();
    narration.tick(cue(0), UPDATE_MS);
    expect(loader).not.toHaveBeenCalled();
    expect(transport.played).toEqual([]);
    expect(transport.gain).toBe(VOICE_GAIN_BY_VOLUME[0]);
  });

  it("downloads and decodes every sentence once when voice is turned on", async () => {
    const loader = vi.fn(async (_urls: readonly string[]) => undefined);
    const narration = new StartupNarration(loader);
    const transport = fakes.FakeVoiceTransport.last;
    narration.setVolume(4);
    narration.setVolume(2);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0][0]).toEqual(sentences.map(({ source: url }) => url));
    expect(transport.gain).toBe(VOICE_GAIN_BY_VOLUME[2]);
    await vi.waitFor(() => expect(transport.prepared).toHaveLength(sentences.length));
  });

  it("still decodes what arrived when the download reports a failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const narration = new StartupNarration(async () => {
      throw new Error("offline");
    });
    const transport = fakes.FakeVoiceTransport.last;
    narration.setVolume(3);
    await vi.waitFor(() => expect(transport.prepared).toHaveLength(sentences.length));
    expect(warn).toHaveBeenCalledWith("startup narration download failed", expect.any(Error));
  });

  it("starts a sentence when its first line scrolls in", () => {
    const { narration, transport, last } = running();
    narration.tick(cue(0) - 1, UPDATE_MS);
    expect(transport.played).toEqual([]);
    narration.tick(cue(0), UPDATE_MS);
    expect(transport.played).toEqual([source(0)]);
    expect(last()).toMatchObject({ next: 1, started: 1, playing: true });
  });

  it("queues a sentence behind the one still speaking, then leaves a short gap", () => {
    const { narration, transport } = running();
    narration.tick(cue(0), UPDATE_MS);
    // sentence 1 is due but sentence 0 is still speaking
    narration.tick(cue(1) + 100, UPDATE_MS);
    expect(transport.played).toEqual([source(0)]);
    transport.ended?.();
    // the gap counts from the first frame after the clip ended
    const ended = cue(1) + 500;
    narration.tick(ended, UPDATE_MS);
    narration.tick(ended + 249, UPDATE_MS);
    expect(transport.played).toEqual([source(0)]);
    narration.tick(ended + 250, UPDATE_MS);
    expect(transport.played).toEqual([source(0), source(1)]);
  });

  it("skips a sentence whose lines left the screen more than six seconds ago", () => {
    const { narration, transport, last } = running();
    narration.tick(cue(0) + 6_001, UPDATE_MS);
    expect(transport.played).toEqual([]);
    narration.tick(cue(1), UPDATE_MS);
    expect(transport.played).toEqual([source(1)]);
    expect(last()).toMatchObject({ next: 2, skipped: 1, started: 1 });
  });

  it("waits for a sentence that is not decoded yet instead of dropping it", () => {
    const { narration, transport } = running();
    transport.ready.delete(source(0));
    narration.tick(cue(0), UPDATE_MS);
    expect(transport.played).toEqual([]);
    transport.ready.add(source(0));
    narration.tick(cue(0) + 400, UPDATE_MS);
    expect(transport.played).toEqual([source(0)]);
  });

  it("does not count a clip the transport refused to start", () => {
    const { narration, transport, last } = running();
    transport.accepts = false;
    narration.tick(cue(0), UPDATE_MS);
    expect(last()).toMatchObject({ next: 1, started: 0, playing: false });
    // the next sentence still gets its own cue
    transport.accepts = true;
    narration.tick(cue(1), UPDATE_MS);
    expect(transport.played).toEqual([source(0), source(1)]);
  });

  it("follows the scroll speed it is given (test mode compresses the crawl)", () => {
    const { narration, transport } = running();
    narration.tick(sentences[0].startUpdate * 10, 10);
    expect(transport.played).toEqual([source(0)]);
  });

  it("speaks every sentence once and then stops scheduling", () => {
    const { narration, transport } = running();
    for (let index = 0; index < sentences.length; index += 1) {
      narration.tick(cue(index), UPDATE_MS);
      transport.ended?.();
      narration.tick(cue(index), UPDATE_MS);
    }
    narration.tick(cue(sentences.length - 1) + 10_000, UPDATE_MS);
    expect(transport.played).toEqual(sentences.map(({ source: url }) => url));
  });

  it("finish lets the current sentence end but opens no new one", () => {
    const { narration, transport } = running();
    narration.tick(cue(0), UPDATE_MS);
    narration.finish();
    transport.ended?.();
    narration.tick(cue(1), UPDATE_MS);
    expect(transport.played).toEqual([source(0)]);
    expect(transport.stops).toEqual([undefined]);
  });

  it("restarts from the first sentence on an idle replay", () => {
    const { narration, transport } = running();
    narration.tick(cue(0), UPDATE_MS);
    transport.ended?.();
    narration.start();
    narration.tick(cue(0), UPDATE_MS);
    expect(transport.played).toEqual([source(0), source(0)]);
  });

  it("fades out on stop, turns off with the voice setting and passes pause and unlock through", () => {
    const { narration, transport, last } = running();
    narration.unlock();
    narration.setPaused(true);
    narration.setPaused(false);
    expect(transport.unlocked).toBe(true);
    expect(transport.suspended).toEqual([true, false]);
    narration.tick(cue(0), UPDATE_MS);
    narration.stop();
    expect(transport.stops.at(-1)).toBe(VOICE_FADE_OUT_SECONDS);
    expect(last()).toMatchObject({ playing: false });
    narration.tick(cue(1), UPDATE_MS);
    expect(transport.played).toEqual([source(0)]);

    narration.start();
    narration.setVolume(0);
    narration.tick(cue(0), UPDATE_MS);
    expect(transport.played).toEqual([source(0)]);
    narration.dispose();
    expect(transport.destroyed).toBe(true);
  });
});
