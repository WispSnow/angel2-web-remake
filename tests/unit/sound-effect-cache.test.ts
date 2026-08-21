import { describe, expect, test } from "vitest";
import {
  isSoundEffectResourceUrl,
  primeEncodedSoundEffect,
  SoundEffectBufferBank,
} from "../../src/game/sound-effect-cache";

describe("staged sound-effect buffers", () => {
  test("recognizes the formal action, speech and key WAV families", () => {
    expect(isSoundEffectResourceUrl("/assets/original/audio/e/2.wav")).toBe(true);
    expect(isSoundEffectResourceUrl("/assets/original/audio/magic/83.wav")).toBe(true);
    expect(isSoundEffectResourceUrl("/assets/original/speech-57.wav")).toBe(true);
    expect(isSoundEffectResourceUrl("/assets/original/ui-confirm.wav")).toBe(true);
    expect(isSoundEffectResourceUrl("/assets/original/music/MUSIC/0002.ogg")).toBe(false);
  });

  test("decodes staged bytes once and keeps the AudioBuffer ready without another request", async () => {
    const url = "/assets/original/audio/e/99.wav";
    primeEncodedSoundEffect(url, Uint8Array.from([2, 4, 6, 8]).buffer);
    let requests = 0;
    let decodes = 0;
    const decoded = { duration: 0.25 } as AudioBuffer;
    const bank = new SoundEffectBufferBank(
      async (encoded) => {
        decodes += 1;
        expect([...new Uint8Array(encoded)]).toEqual([2, 4, 6, 8]);
        return decoded;
      },
      async () => {
        requests += 1;
        throw new Error("staged sound effects must not fetch again");
      },
    );

    await Promise.all([bank.prepare([url]), bank.prepare([url])]);
    expect(bank.get(url)).toBe(decoded);
    expect(bank.size).toBe(1);
    expect(decodes).toBe(1);
    expect(requests).toBe(0);
  });
});
