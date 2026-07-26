import { describe, expect, test } from "vitest";
import {
  isSoundEffectChannelEnabled,
  MUSIC_GAIN_BY_VOLUME,
  soundEffectChannelForCue,
  type SoundEffectChannel,
} from "../../src/game/audio-settings";

describe("native sound-effect request gates", () => {
  test("routes scripted movement separately from map and full combat cues", () => {
    expect(soundEffectChannelForCue("stage-event-scripted-movement")).toBe("movement");
    expect(soundEffectChannelForCue("map-primary-hit-first")).toBe("combat");
    expect(soundEffectChannelForCue("full-primary-hurt")).toBe("combat");
    expect(soundEffectChannelForCue("full-primary-death")).toBe("combat");
  });

  test("checks each of the four categories independently", () => {
    const channels: SoundEffectChannel[] = ["speech", "movement", "combat", "key"];
    for (const enabledChannel of channels) {
      const state = {
        speechEnabled: enabledChannel === "speech",
        movementSoundEnabled: enabledChannel === "movement",
        combatSoundEnabled: enabledChannel === "combat",
        keySoundEnabled: enabledChannel === "key",
      };
      expect(channels.map((channel) => isSoundEffectChannelEnabled(state, channel))).toEqual(
        channels.map((channel) => channel === enabledChannel),
      );
    }
  });
});

describe("five-level music gain", () => {
  test("keeps maximum at the established Web baseline and maps the other levels monotonically", () => {
    expect(MUSIC_GAIN_BY_VOLUME).toEqual({
      0: 0,
      1: 0.08,
      2: 0.16,
      3: 0.24,
      4: 0.32,
    });
  });
});
