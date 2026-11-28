import { describe, expect, it } from "vitest";
import {
  describeCaptureParameterError,
  parseCaptureRequest,
  parseCaptureUntil,
} from "../../src/game/capture/options";
import {
  installPreferenceOverlay,
  PreferenceOverlayStorage,
} from "../../src/game/capture/preference-overlay";
import { CaptureSession, type CaptureEvent } from "../../src/game/capture/session";
import {
  DISPLAY_PREFERENCES_KEY,
  loadDisplayPreferences,
  loadMusicPreferences,
  loadSoundPreferences,
  loadVoicePreferences,
  MUSIC_PREFERENCES_KEY,
  SOUND_PREFERENCES_KEY,
  VOICE_PREFERENCES_KEY,
} from "../../src/game/preferences";

class MemoryStorage implements Storage {
  readonly items = new Map<string, string>();
  writes = 0;
  get length(): number {
    return this.items.size;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes += 1;
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.writes += 1;
    this.items.delete(key);
  }
  clear(): void {
    this.items.clear();
  }
}

const parse = (search: string) => {
  const result = parseCaptureRequest(search);
  if (!result.ok) throw new Error(describeCaptureParameterError(result.error));
  return result.value;
};

const parseError = (search: string) => {
  const result = parseCaptureRequest(search);
  if (result.ok) throw new Error(`expected ${search} to be rejected`);
  return result.error;
};

describe("capture URL parameters", () => {
  it("leaves an ordinary URL without capture or overrides", () => {
    expect(parse("?debugScenario=stage-01-player")).toEqual({ capture: false, presentation: {}, options: {} });
  });

  it("reads every presentation override", () => {
    expect(parse("?art=hd&voice=max&autoPage=0&music=orchestral&zoom=integer&sound=0").presentation).toEqual({
      portraitStyle: "hd",
      voiceVolume: 4,
      autoAdvance: false,
      musicStyle: "orchestral",
      imageScaling: "integer",
      soundEnabled: false,
    });
    expect(parse("?voice=2").presentation).toEqual({ voiceVolume: 2 });
  });

  it("reads capture options only together with capture=1", () => {
    expect(parse("?capture=1&until=story-end&open=compendium/character/nia&focus=12,7&select=ally-1&panel=detail"))
      .toEqual({
        capture: true,
        presentation: {},
        options: {
          until: { type: "story-end", delayMs: 0 },
          open: { kind: "compendium", section: "character", entry: "nia" },
          focus: { kind: "cell", x: 12, y: 7 },
          select: "ally-1",
          panel: "detail",
        },
      });
    expect(parse("?capture=1&startup=title&focus=goddess").options).toEqual({
      startup: "title",
      focus: { kind: "unit", unitId: "goddess" },
    });
    expect(parseError("?until=story-end")).toMatchObject({ parameter: "until" });
    expect(parseError("?startup=enter")).toMatchObject({ parameter: "startup" });
  });

  it("reads the line-window mode and waits on battle-line events", () => {
    expect(parse("?capture=1&lines=always&until=battle-line-end+1500").options).toEqual({
      lines: "always",
      until: { type: "battle-line-end", delayMs: 1500 },
    });
    expect(parse("?capture=1&lines=coin").options).toEqual({ lines: "coin" });
    expect(parse("?capture=1&until=battle-line").options).toEqual({ until: { type: "battle-line", delayMs: 0 } });
    // 玩家實際遊玩時沒有這個參數：不錄製就不能讓短句必現。
    expect(parseError("?lines=always")).toMatchObject({ parameter: "lines" });
  });

  it("treats the portrait lab's style as an alias of art and accepts unit names", () => {
    expect(parse("?style=hd").presentation).toEqual({ portraitStyle: "hd" });
    expect(parse("?style=hd&art=hd").presentation).toEqual({ portraitStyle: "hd" });
    expect(parseError("?style=hd&art=original")).toMatchObject({ parameter: "style" });
    expect(parse(`?capture=1&select=${encodeURIComponent("萊茵")}&focus=${encodeURIComponent("究極女神")}`).options)
      .toEqual({ select: "萊茵", focus: { kind: "unit", unitId: "究極女神" } });
  });

  it("accepts the until delay with + or its decoded space", () => {
    expect(parseCaptureUntil("title-shown+15000")).toEqual({ type: "title-shown", delayMs: 15000 });
    expect(parse("?capture=1&until=title-shown+15000").options.until).toEqual({ type: "title-shown", delayMs: 15000 });
    expect(parse("?capture=1&until=title-shown%2B15000").options.until).toEqual({ type: "title-shown", delayMs: 15000 });
    expect(parse("?capture=1&until=credits-end").options.until).toEqual({ type: "credits-end", delayMs: 0 });
  });

  it("rejects invalid values with the parameter that caused them", () => {
    for (const [search, parameter] of [
      ["?art=4k", "art"],
      ["?voice=5", "voice"],
      ["?voice=loud", "voice"],
      ["?autoPage=yes", "autoPage"],
      ["?music=jazz", "music"],
      ["?zoom=huge", "zoom"],
      ["?sound=on", "sound"],
      ["?capture=true", "capture"],
      ["?capture=1&until=done", "until"],
      ["?capture=1&until=story-end+x", "until"],
      ["?capture=1&until=story-end+9999999", "until"],
      ["?capture=1&startup=credits", "startup"],
      ["?capture=1&open=save", "open"],
      ["?capture=1&open=roadmap/extra", "open"],
      ["?capture=1&focus=a%20b", "focus"],
      ["?capture=1&panel=detail", "panel"],
      ["?capture=1&select=x&panel=stats", "panel"],
      ["?capture=1&lines=never", "lines"],
    ] as const) {
      expect(parseError(search), search).toMatchObject({ parameter });
    }
    expect(describeCaptureParameterError(parseError("?art=4k"))).toContain("art=4k");
  });
});

describe("presentation preference overlay", () => {
  it("serves overrides on top of the stored preferences without writing them back", () => {
    const base = new MemoryStorage();
    base.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify({ imageScaling: "smooth", interfaceZoom: 150, portraitStyle: "original" }));
    base.setItem(MUSIC_PREFERENCES_KEY, JSON.stringify({ musicVolume: 2, musicStyle: "original" }));
    base.setItem(SOUND_PREFERENCES_KEY, JSON.stringify({ soundEffectVolume: 3 }));
    const stored = new Map(base.items);
    base.writes = 0;
    const overlay = new PreferenceOverlayStorage(base, {
      portraitStyle: "hd",
      musicStyle: "orchestral",
      voiceVolume: 4,
      soundEnabled: false,
    }, false);

    expect(loadDisplayPreferences(overlay)).toEqual({ imageScaling: "smooth", interfaceZoom: 150, portraitStyle: "hd" });
    expect(loadMusicPreferences(overlay)).toEqual({ musicVolume: 2, musicStyle: "orchestral" });
    // 語音從「關」打開時改回自動翻頁，與遊戲內一致。
    expect(loadVoicePreferences(overlay)).toEqual({ voiceVolume: 4, autoAdvance: true });
    expect(loadSoundPreferences(overlay).soundEffectVolume).toBe(0);

    overlay.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify({ imageScaling: "sharp", interfaceZoom: 100, portraitStyle: "original" }));
    expect(loadDisplayPreferences(overlay).portraitStyle).toBe("original");
    expect(base.writes).toBe(0);
    expect(base.items).toEqual(stored);
  });

  it("keeps a URL autoPage over the voice-on default and restores sound at its stored level", () => {
    const base = new MemoryStorage();
    base.setItem(VOICE_PREFERENCES_KEY, JSON.stringify({ voiceVolume: 0, autoAdvance: true }));
    base.setItem(SOUND_PREFERENCES_KEY, JSON.stringify({ soundEffectVolume: 0 }));
    const overlay = new PreferenceOverlayStorage(base, { voiceVolume: 2, autoAdvance: false, soundEnabled: true }, false);
    expect(loadVoicePreferences(overlay)).toEqual({ voiceVolume: 2, autoAdvance: false });
    expect(loadSoundPreferences(overlay).soundEffectVolume).toBe(2);
  });

  it("passes save data through and sandboxes every preference key only in capture mode", () => {
    const base = new MemoryStorage();
    const plain = new PreferenceOverlayStorage(base, {}, false);
    plain.setItem(VOICE_PREFERENCES_KEY, "{}");
    plain.setItem("angel2.save.slot1", "save");
    expect(base.getItem(VOICE_PREFERENCES_KEY)).toBe("{}");
    expect(base.getItem("angel2.save.slot1")).toBe("save");

    const sandboxed = new MemoryStorage();
    const capture = new PreferenceOverlayStorage(sandboxed, {}, true);
    capture.setItem(VOICE_PREFERENCES_KEY, "{}");
    capture.setItem("angel2.preferences.documentation-language.v1", "simplified");
    capture.removeItem(MUSIC_PREFERENCES_KEY);
    capture.setItem("angel2.save.slot1", "save");
    expect(capture.getItem(VOICE_PREFERENCES_KEY)).toBe("{}");
    expect(sandboxed.getItem(VOICE_PREFERENCES_KEY)).toBeNull();
    expect(sandboxed.getItem("angel2.preferences.documentation-language.v1")).toBeNull();
    expect(sandboxed.getItem("angel2.save.slot1")).toBe("save");
  });

  it("replaces the page's localStorage property", () => {
    const target = {} as Window;
    const overlay = new PreferenceOverlayStorage(new MemoryStorage(), { musicStyle: "orchestral" }, true);
    installPreferenceOverlay(overlay, target);
    expect(target.localStorage).toBe(overlay);
  });
});

const fakeEnvironment = () => {
  let now = 1_000;
  let perf = 50_000;
  const timers: { at: number; callback: () => void }[] = [];
  const dispatched: CaptureEvent[] = [];
  return {
    dispatched,
    advance(milliseconds: number) {
      now += milliseconds;
      perf += milliseconds;
      for (const timer of timers.splice(0)) {
        if (timer.at <= now) timer.callback();
        else timers.push(timer);
      }
    },
    environment: {
      programNow: () => now,
      performanceNow: () => perf,
      programTimeout: (callback: () => void, delay: number) => {
        timers.push({ at: now + delay, callback });
      },
      dispatch: (event: CaptureEvent) => dispatched.push(event),
    },
  };
};

describe("capture session", () => {
  it("records nothing before start and replays pre-start events at t=0 after the scene", async () => {
    const fake = fakeEnvironment();
    let released = 0;
    const session = new CaptureSession(undefined, fake.environment, {
      release: () => {
        released += 1;
      },
      describeScene: () => ({ entry: "stage-01-prebattle" }),
    });
    expect(session.status).toBe("loading");
    expect(() => session.start()).toThrow(/needs "ready"/u);
    session.record("dialogue-page", { record: 7, page: 0 });
    fake.advance(400);
    session.markReady();
    await session.ready;
    expect(session.status).toBe("ready");
    expect(session.events).toEqual([]);

    fake.advance(100);
    expect(session.start()).toBe(50_500);
    expect(released).toBe(1);
    fake.advance(250);
    session.record("voice-start", { voice: "s01-0002" });
    expect(session.events.map(({ type, t, preStart }) => ({ type, t, preStart }))).toEqual([
      { type: "scene", t: 0, preStart: undefined },
      { type: "dialogue-page", t: 0, preStart: true },
      { type: "voice-start", t: 250, preStart: undefined },
    ]);
    expect(session.events[0]).toMatchObject({ entry: "stage-01-prebattle", perf: 50_500 });
    expect(fake.dispatched).toEqual(session.events);
    expect(() => session.start()).toThrow(/running/u);
  });

  it("finishes on the first matching event after its program-clock delay", async () => {
    const fake = fakeEnvironment();
    const session = new CaptureSession({ type: "title-shown", delayMs: 15_000 }, fake.environment, {
      release: () => undefined,
      describeScene: () => ({}),
    });
    session.record("title-shown", { style: "hd" });
    session.markReady();
    session.start();
    let done = false;
    void session.done.then(() => {
      done = true;
    });
    fake.advance(14_999);
    await Promise.resolve();
    expect(session.status).toBe("running");
    fake.advance(1);
    await Promise.resolve();
    expect(done).toBe(true);
    expect(session.status).toBe("done");
    expect(session.events.at(-1)).toMatchObject({ type: "done", t: 15_000 });
    session.record("music-start", {});
    expect(session.events.at(-1)?.type).toBe("music-start");
    expect(session.events.filter(({ type }) => type === "done")).toHaveLength(1);
  });

  it("finishes immediately without a delay and ignores later matches", () => {
    const fake = fakeEnvironment();
    const session = new CaptureSession({ type: "story-end", delayMs: 0 }, fake.environment, {
      release: () => undefined,
      describeScene: () => ({}),
    });
    session.markReady();
    session.start();
    fake.advance(3_000);
    session.record("story-end", { record: 7 });
    session.record("story-end", { record: 8 });
    expect(session.events.map(({ type }) => type)).toEqual(["scene", "story-end", "done", "story-end"]);
    expect(session.events[2]).toMatchObject({ t: 3_000 });
  });
});
