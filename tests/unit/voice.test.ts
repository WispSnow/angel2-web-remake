import { afterEach, describe, expect, test, vi } from "vitest";
import { STORY_PAGES_BY_ID } from "../../src/game/content/dialogue";
import { contextualBattleDialogueFor } from "../../src/game/content/ai-technique-dialogue";
import { OUTCOME_FEEDBACK_PORTRAIT, OUTCOME_FEEDBACK_TEXT } from "../../src/game/content/outcome-feedback";
import {
  VOICE_CLIPS,
  VOICE_GAIN_BY_VOLUME,
  battleLineVoiceUrls,
  epilogueNarrationFor,
  gateVoiceUrls,
  voiceClipForPage,
  voiceCueForPage,
  voiceLineFor,
} from "../../src/game/content/voice-catalog";
import type { GameController } from "../../src/game/controller";
import type { VoiceVolume } from "../../src/game/preferences";
import type { PortraitRecord } from "../../src/game/content/portrait-catalog.generated";
import type { DialoguePage } from "../../src/game/types";
import { VoiceDirector } from "../../src/game/voice";
import { primeEncodedVoice, retainEncodedVoice, VoiceTransport } from "../../src/game/voice-transport";

class FakeParam {
  readonly events: Array<{ type: string; value: number; time: number }> = [];
  setValueAtTime(value: number, time: number): void { this.events.push({ type: "set", value, time }); }
  linearRampToValueAtTime(value: number, time: number): void { this.events.push({ type: "ramp", value, time }); }
  cancelAndHoldAtTime(time: number): void { this.events.push({ type: "hold", value: Number.NaN, time }); }
}

class FakeGain {
  readonly gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}

class FakeSource {
  buffer?: unknown;
  startedAt?: number;
  stoppedAt?: number;
  private ended?: () => void;
  connect(): void {}
  disconnect(): void {}
  start(time: number): void { this.startedAt = time; }
  stop(time: number): void { this.stoppedAt = time; }
  addEventListener(_type: string, listener: () => void): void { this.ended = listener; }
  finish(): void { this.ended?.(); }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 5;
  state = "suspended";
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  constructor() { FakeAudioContext.instances.push(this); }
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  addEventListener(): void {}
  async resume(): Promise<void> { this.state = "running"; }
  async suspend(): Promise<void> { this.state = "suspended"; }
  async close(): Promise<void> { this.state = "closed"; }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const page = (index: number): DialoguePage => STORY_PAGES_BY_ID["stage-00-prebattle-story"][index];

interface FakeController {
  voiceVolume: VoiceVolume;
  voiceAutoAdvance: boolean;
  voiceGate: string;
  isTestMode: boolean;
  pages: readonly DialoguePage[];
  battle: { units: Array<{ portrait: number }> };
  upcomingStoryPages(count: number): readonly DialoguePage[];
  reportVoiceUnavailable: ReturnType<typeof vi.fn>;
}

const setup = (volume: VoiceVolume, loader?: (urls: readonly string[]) => Promise<void>) => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
  const fetchVoice = vi.fn(async (url: RequestInfo | URL) => ({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode(String(url)).buffer,
  }) as unknown as Response);
  const decode = vi.fn(async (encoded: ArrayBuffer) => ({ duration: 1, bytes: encoded.byteLength }) as unknown as AudioBuffer);
  const transport = new VoiceTransport(VOICE_GAIN_BY_VOLUME[volume], () => undefined, decode, fetchVoice);
  const controller: FakeController = {
    voiceVolume: volume,
    voiceAutoAdvance: false,
    voiceGate: "stage-00",
    isTestMode: false,
    pages: STORY_PAGES_BY_ID["stage-00-prebattle-story"],
    battle: { units: [] },
    upcomingStoryPages(count) { return this.pages.slice(0, count); },
    reportVoiceUnavailable: vi.fn(),
  };
  const director = new VoiceDirector(
    controller as unknown as GameController,
    { dataset: {} } as unknown as HTMLElement,
    loader,
    transport,
  );
  return { director, controller, transport, fetchVoice, decode };
};

describe("REMAKE-188 voice director", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.instances = [];
    // The encoded-bytes cache is module state shared with the resource gate.
    retainEncodedVoice(new Set());
  });

  test("requests nothing and voices nothing while the volume is 關", async () => {
    const loader = vi.fn(async () => undefined);
    const { director, fetchVoice } = setup(0, loader);
    director.unlock();
    director.sync();
    await flush();
    expect(loader).not.toHaveBeenCalled();
    expect(fetchVoice).not.toHaveBeenCalled();
    expect(director.beginPage(page(0))).toBe(false);
  });

  test("downloads the stage's clips through the gate path, then decodes ahead", async () => {
    const loader = vi.fn(async (urls: readonly string[]) => {
      for (const url of urls) primeEncodedVoice(url, new TextEncoder().encode(url).buffer);
    });
    const { director, fetchVoice, decode } = setup(4, loader);
    director.sync();
    await flush();
    expect(loader).toHaveBeenCalledWith(gateVoiceUrls("stage-00", 4));
    // Primed bytes are reused: decoding never issues a second request.
    expect(fetchVoice).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalled();
  });

  test("starts with typing, keeps playing through 補完, and fades out in 0.1 s on advance", async () => {
    const { director } = setup(4);
    director.unlock();
    director.sync();
    await flush();
    const ended = vi.fn();
    expect(director.beginPage(page(0), ended)).toBe(true);
    const context = FakeAudioContext.instances[0];
    const [source] = context.sources;
    expect(source.startedAt).toBe(5);
    director.typingFinished();
    expect(source.stoppedAt).toBeUndefined();
    context.currentTime = 6;
    expect(director.beginPage(page(1))).toBe(true);
    expect(source.stoppedAt).toBeCloseTo(6.1);
    source.finish();
    // A clip cut by the player never reports a natural end.
    expect(ended).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(2);
  });

  test("reports a natural end once, for auto-advance", async () => {
    const { director } = setup(2);
    director.unlock();
    director.sync();
    await flush();
    const ended = vi.fn();
    director.beginPage(page(0), ended);
    expect(director.pageClipEnded).toBe(false);
    FakeAudioContext.instances[0].sources[0].finish();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(director.pageClipEnded).toBe(true);
  });

  test("an undecoded clip leaves the page unvoiced; a failed one says so once", async () => {
    const { director, controller, fetchVoice } = setup(4);
    fetchVoice.mockImplementation(async () => ({ ok: false, status: 404 }) as unknown as Response);
    director.unlock();
    // Before anything is decoded the page is simply unvoiced, without a notice.
    expect(director.beginPage(page(0))).toBe(false);
    expect(controller.reportVoiceUnavailable).not.toHaveBeenCalled();
    director.sync();
    await flush();
    expect(director.beginPage(page(0))).toBe(false);
    expect(director.beginPage(page(0))).toBe(false);
    expect(controller.reportVoiceUnavailable).toHaveBeenCalled();
  });

  test("follows global pause and changes volume without restarting the clip", async () => {
    const { director, controller } = setup(4);
    director.unlock();
    director.sync();
    await flush();
    director.beginPage(page(0));
    const context = FakeAudioContext.instances[0];
    director.setSuspended(true);
    await flush();
    expect(context.state).toBe("suspended");
    director.setSuspended(false);
    await flush();
    expect(context.state).toBe("running");
    controller.voiceVolume = 1;
    director.sync();
    const master = context.gains[0].gain.events;
    expect(master.at(-1)).toMatchObject({ type: "ramp", value: VOICE_GAIN_BY_VOLUME[1] });
    expect(context.sources).toHaveLength(1);
    controller.voiceVolume = 0;
    director.sync();
    expect(context.sources[0].stoppedAt).toBeCloseTo(5.1);
  });

  test("only SAY pages with a matching clip are voiced", async () => {
    const { director } = setup(4);
    director.unlock();
    director.sync();
    await flush();
    const promotion: DialoguePage = { ...page(0), source: { record: "promotion", wait: 1 } };
    expect(director.beginPage(promotion)).toBe(false);
    expect(voiceClipForPage(page(0))).toBe(VOICE_CLIPS.find(({ key }) => key === "0:1"));
  });
});

describe("REMAKE-189 battle lines, feedback and narration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeAudioContext.instances = [];
    retainEncodedVoice(new Set());
  });

  const surrounded = (portrait: PortraitRecord): DialoguePage =>
    contextualBattleDialogueFor({ name: "測試", portrait, side: 2 }, "surrounded");
  const primeAll = (urls: readonly string[]) => {
    for (const url of urls) primeEncodedVoice(url, new TextEncoder().encode(url).buffer);
  };

  test("downloads the battle lines of every voice on the board after the story clips", async () => {
    const loader = vi.fn(async (urls: readonly string[]) => primeAll(urls));
    const { director, controller } = setup(4, loader);
    controller.battle.units = [{ portrait: 46 }, { portrait: 48 }, { portrait: 48 }];
    director.sync();
    await flush();
    expect(loader.mock.calls[0][0]).toEqual(gateVoiceUrls("stage-00", 4));
    expect(loader.mock.calls[1][0]).toEqual(battleLineVoiceUrls([46, 48], 4));
    // The same board does not download again.
    director.sync();
    await flush();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("a line plays once its bytes are in memory, and the window holds until it ends", async () => {
    const { director } = setup(4);
    director.unlock();
    const page = surrounded(48);
    primeAll([voiceCueForPage(page)!.source]);
    const ended = vi.fn();
    expect(director.beginPage(page, ended)).toBe(true);
    await flush();
    const context = FakeAudioContext.instances[0];
    expect(context.sources).toHaveLength(1);
    let held = false;
    void director.lineHold().then(() => { held = true; });
    await flush();
    expect(held).toBe(false);
    context.sources[0].finish();
    await flush();
    expect(held).toBe(true);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  test("a line whose bytes are not in memory stays unvoiced and is fetched for next time", async () => {
    const { director, fetchVoice } = setup(4);
    director.unlock();
    expect(director.beginPage(surrounded(46))).toBe(false);
    await flush();
    expect(fetchVoice).toHaveBeenCalledWith(voiceCueForPage(surrounded(46))!.source);
    await expect(director.lineHold()).resolves.toBeUndefined();
  });

  test("a line that decodes too late is dropped, and the page still hears that it may move on", async () => {
    const { director, decode } = setup(4);
    director.unlock();
    const page = surrounded(47);
    primeAll([voiceCueForPage(page)!.source]);
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let release: (buffer: AudioBuffer) => void = () => undefined;
    decode.mockImplementation(() => new Promise<AudioBuffer>((resolve) => { release = resolve; }));
    const ended = vi.fn();
    expect(director.beginPage(page, ended)).toBe(true);
    await flush();
    now += 600;
    release({ duration: 1 } as unknown as AudioBuffer);
    await flush();
    expect(director.pageVoiced).toBe(false);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances[0]?.sources ?? []).toHaveLength(0);
  });

  test("voices 妮雅's feedback windows and the epilogue narration", async () => {
    const { director } = setup(3);
    director.unlock();
    const narration = epilogueNarrationFor("warriorStatue", 0);
    expect(narration).toBeDefined();
    primeAll([narration!.source]);
    expect(director.beginNarration(narration)).toBe(true);
    await flush();
    expect(FakeAudioContext.instances[0].sources).toHaveLength(1);
    // Not in memory yet: the window types with glyph beeps instead.
    expect(director.beginLine(OUTCOME_FEEDBACK_PORTRAIT, OUTCOME_FEEDBACK_TEXT.quit)).toBe(false);
    primeAll([voiceLineFor(OUTCOME_FEEDBACK_PORTRAIT, OUTCOME_FEEDBACK_TEXT.quit)!.source]);
    expect(director.beginLine(OUTCOME_FEEDBACK_PORTRAIT, OUTCOME_FEEDBACK_TEXT.quit)).toBe(true);
  });
});
