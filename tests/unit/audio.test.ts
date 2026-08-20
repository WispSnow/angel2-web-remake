import { describe, expect, test } from "vitest";
import {
  isSoundEffectChannelEnabled,
  MUSIC_GAIN_BY_VOLUME,
  SOUND_EFFECT_GAIN_BY_VOLUME,
  soundEffectOutputVolume,
  soundEffectChannelForCue,
  type SoundEffectChannel,
} from "../../src/game/audio-settings";
import {
  PRELOAD_STAGE_MUSIC_PROGRAMS,
  musicProgramFor,
} from "../../src/game/content/music";
import { STAGE0_DEFINITION } from "../../src/game/content/stages";

describe("native sound-effect request gates", () => {
  test("routes every board walk to the 移動 category, separately from map and full combat cues", () => {
    // Player 移動, the 半龍戰士 direct technique, 工兵 construction, both AI
    // sides and scripted stage events all reach the shared walk playback
    // 1000:7F72, whose single E/14 request passes the 移動 gate 0000:0249.
    for (const reason of [
      "stage-event-scripted-movement",
      "player-movement",
      "ally-auto-movement",
      "enemy-movement",
      "construction-movement",
      "half-dragon-technique-movement",
    ]) {
      expect(soundEffectChannelForCue(reason)).toBe("movement");
    }
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

describe("independent five-level sound-effect gain", () => {
  test("halves the established cue mix by default while preserving the original mix at maximum", () => {
    expect(SOUND_EFFECT_GAIN_BY_VOLUME).toEqual({
      0: 0,
      1: 0.25,
      2: 0.5,
      3: 0.75,
      4: 1,
    });
    expect(soundEffectOutputVolume(0.55, 2)).toBeCloseTo(0.275);
    expect(soundEffectOutputVolume(0.55, 4)).toBeCloseTo(0.55);
    expect(soundEffectOutputVolume(0.55, 0)).toBe(0);
  });
});

describe("stage music registry", () => {
  test("resolves stage 0 programs through stable stage-definition IDs", () => {
    expect(PRELOAD_STAGE_MUSIC_PROGRAMS).toHaveLength(3);
    expect(musicProgramFor(STAGE0_DEFINITION.music.story)).toMatchObject({
      id: "stage0-story",
      track: "MAGIC/73",
    });
    expect(musicProgramFor(STAGE0_DEFINITION.music.playerPhase)).toMatchObject({
      id: "stage0-player-battle",
      entryTrack: "MUSIC/7",
      loopTrack: "MUSIC/6",
    });
    expect(musicProgramFor(STAGE0_DEFINITION.music.enemyPhase)).toMatchObject({
      id: "stage0-enemy-battle",
      entryTrack: "MUSIC/5",
      loopTrack: "MUSIC/4",
    });
  });
});
