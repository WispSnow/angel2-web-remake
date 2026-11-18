import { describe, expect, it } from "vitest";
import {
  mouthLevelLayers,
  SPEECH_PUNCTUATION_QUIET_MS,
  SPEECH_SYLLABLE_MS,
  speechGlyphIsPunctuation,
  SyllableClock,
} from "../../src/game/portrait-speech";

/** Always the middle of the jitter and amplitude ranges: syllables of exactly 260 ms, size 0.775. */
const middle = () => 0.5;
const SYLLABLE = SPEECH_SYLLABLE_MS.rise + SPEECH_SYLLABLE_MS.hold + SPEECH_SYLLABLE_MS.fall + SPEECH_SYLLABLE_MS.gap;

describe("REMAKE-192 HD speech rhythm", () => {
  it("stays shut until talking starts, then opens, holds, closes and pauses once per syllable", () => {
    const clock = new SyllableClock(middle);
    expect(clock.at(0)).toBe(0);
    clock.talking = true;
    expect(clock.at(100)).toBe(0);
    expect(clock.at(100 + SPEECH_SYLLABLE_MS.rise)).toBeCloseTo(0.775, 3);
    expect(clock.at(100 + SPEECH_SYLLABLE_MS.rise + SPEECH_SYLLABLE_MS.hold / 2)).toBeCloseTo(0.775, 3);
    expect(clock.at(100 + SPEECH_SYLLABLE_MS.rise + SPEECH_SYLLABLE_MS.hold + SPEECH_SYLLABLE_MS.fall + 1)).toBe(0);
    expect(clock.count).toBe(1);
    // The mid pace the user chose: about four syllables a second (260 ms each).
    for (let t = 100; t < 100 + 4 * SYLLABLE; t += 10) clock.at(t);
    expect(clock.count).toBe(4);
  });

  it("closes from the current opening at once when talking stops, instead of finishing the syllable", () => {
    const clock = new SyllableClock(middle);
    clock.talking = true;
    clock.at(0);
    const open = clock.at(SPEECH_SYLLABLE_MS.rise + 10);
    expect(open).toBeCloseTo(0.775, 3);
    clock.talking = false;
    // Still continuous at the moment of stopping, shut one fall later, and no new syllable.
    expect(clock.at(SPEECH_SYLLABLE_MS.rise + 10)).toBeCloseTo(open, 3);
    expect(clock.at(SPEECH_SYLLABLE_MS.rise + 10 + SPEECH_SYLLABLE_MS.fall)).toBe(0);
    expect(clock.at(1_000)).toBe(0);
    expect(clock.count).toBe(1);
  });

  it("keeps the mouth shut through a punctuation pause", () => {
    const clock = new SyllableClock(middle);
    clock.talking = true;
    clock.quietUntil = SPEECH_PUNCTUATION_QUIET_MS;
    expect(clock.at(SPEECH_PUNCTUATION_QUIET_MS - 1)).toBe(0);
    expect(clock.count).toBe(0);
    // The next syllable starts on the first frame after the pause and is opening 40 ms later.
    expect(clock.at(SPEECH_PUNCTUATION_QUIET_MS)).toBe(0);
    expect(clock.count).toBe(1);
    expect(clock.at(SPEECH_PUNCTUATION_QUIET_MS + 40)).toBeGreaterThan(0);
    expect(speechGlyphIsPunctuation("，")).toBe(true);
    expect(speechGlyphIsPunctuation("。")).toBe(true);
    expect(speechGlyphIsPunctuation("妮")).toBe(false);
  });
});

describe("REMAKE-192 RIFE mouth level blending", () => {
  const knots = [0, 0.2, 0.5, 0.8, 1];

  it("draws nothing for a shut mouth and only the open tile at full opening", () => {
    expect(mouthLevelLayers(0, knots)).toEqual([]);
    expect(mouthLevelLayers(1, knots)).toEqual([{ level: 3, alpha: 1 }, { level: 4, alpha: 1 }]);
  });

  it("covers with the lower measured tile and blends the next one by measured openness", () => {
    expect(mouthLevelLayers(0.1, knots)).toEqual([{ level: 1, alpha: 0.5 }]);
    expect(mouthLevelLayers(0.2, knots)).toEqual([{ level: 1, alpha: 1 }]);
    const middleLayers = mouthLevelLayers(0.65, knots);
    expect(middleLayers[0]).toEqual({ level: 2, alpha: 1 });
    expect(middleLayers[1].level).toBe(3);
    expect(middleLayers[1].alpha).toBeCloseTo(0.5, 6);
  });
});

describe("REMAKE-192 HD speech rhythm termination", () => {
  it("never spins when talking stops at clock values that do not round-trip exactly", () => {
    // Real program-clock values: fractional milliseconds and jittered segment lengths. A
    // `clock - (clock - rise - hold)` round trip can come out below `rise + hold`, which
    // once made `at()` loop forever and froze the page.
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const clock = new SyllableClock(random);
    let now = 1234.5670000000001;
    for (let step = 0; step < 20_000; step += 1) {
      clock.talking = step % 7 !== 0 && step % 11 !== 0;
      const value = clock.at(now);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      now += 16.666666666666668 * (0.5 + random());
    }
  });
});
