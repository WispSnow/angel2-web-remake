import { describe, expect, it } from "vitest";
import { voiceActiveAt, voiceActivityTrack } from "../../src/game/voice-activity";

const RATE = 8_000;

/** A 200 Hz tone at -20 dBFS for `[start, end)` seconds, silence elsewhere. */
const signal = (seconds: number, bursts: readonly (readonly [number, number])[]) => {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (const [start, end] of bursts) {
    for (let index = Math.round(start * RATE); index < Math.round(end * RATE); index += 1) {
      samples[index] = 0.1 * Math.sin((2 * Math.PI * 200 * index) / RATE);
    }
  }
  return samples;
};

describe("REMAKE-192 voice activity for voice-paced speech", () => {
  it("marks speech, keeps a sentence pause and drops leading and trailing silence", () => {
    const track = voiceActivityTrack(signal(2, [[0.1, 0.8], [1.1, 1.8]]), RATE);
    expect(voiceActiveAt(track, 0.05)).toBe(false);
    expect(voiceActiveAt(track, 0.4)).toBe(true);
    expect(voiceActiveAt(track, 0.95)).toBe(false);
    expect(voiceActiveAt(track, 1.5)).toBe(true);
    expect(voiceActiveAt(track, 1.9)).toBe(false);
    expect(voiceActiveAt(track, 5)).toBe(false);
    expect(voiceActiveAt(track, -1)).toBe(false);
  });

  it("bridges the short closures between syllables and ignores clicks", () => {
    // 60 ms gap inside a word, a 5 ms click well after it (the 20 ms window smears it to ~30 ms).
    const track = voiceActivityTrack(signal(2, [[0.1, 0.5], [0.56, 0.9], [1.5, 1.505]]), RATE);
    expect(voiceActiveAt(track, 0.53)).toBe(true);
    expect(voiceActiveAt(track, 1.51)).toBe(false);
  });

  it("finds nothing in silence", () => {
    const track = voiceActivityTrack(new Float32Array(RATE), RATE);
    expect(track.active.every((value) => value === 0)).toBe(true);
  });
});
