import { describe, expect, test } from "vitest";
import {
  DEFAULT_MUSIC_PREFERENCES,
  DEFAULT_PRESENTATION_PREFERENCES,
  DEFAULT_SOUND_PREFERENCES,
  loadMusicPreferences,
  loadPresentationPreferences,
  loadSoundPreferences,
  MUSIC_PREFERENCES_KEY,
  PRESENTATION_PREFERENCES_KEY,
  saveMusicPreferences,
  savePresentationPreferences,
  saveSoundPreferences,
  SOUND_PREFERENCES_KEY,
  type PreferenceStorage,
} from "../../src/game/preferences";

class MemoryStorage implements PreferenceStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("presentation preferences", () => {
  test("uses original-compatible first-run defaults and rejects malformed fields", () => {
    const storage = new MemoryStorage();
    expect(loadPresentationPreferences(storage)).toEqual(DEFAULT_PRESENTATION_PREFERENCES);
    storage.setItem(PRESENTATION_PREFERENCES_KEY, JSON.stringify({
      battlePresentation: "invalid",
      gridEnabled: "yes",
      edgeScrollEnabled: false,
      portraitsEnabled: false,
      aiDialogueEnabled: "yes",
    }));
    expect(loadPresentationPreferences(storage)).toEqual({
      battlePresentation: "full",
      gridEnabled: false,
      edgeScrollEnabled: false,
      portraitsEnabled: false,
      aiDialogueEnabled: true,
    });
    storage.setItem(PRESENTATION_PREFERENCES_KEY, "{");
    expect(loadPresentationPreferences(storage)).toEqual(DEFAULT_PRESENTATION_PREFERENCES);
  });

  test("round-trips device presentation settings independently from saves", () => {
    const storage = new MemoryStorage();
    const preferences = {
      battlePresentation: "map" as const,
      gridEnabled: true,
      edgeScrollEnabled: false,
      portraitsEnabled: false,
      aiDialogueEnabled: false,
    };
    savePresentationPreferences(storage, preferences);
    expect(loadPresentationPreferences(storage)).toEqual(preferences);
  });
});

describe("sound preferences", () => {
  test("uses four enabled original-compatible defaults and rejects malformed fields", () => {
    const storage = new MemoryStorage();
    expect(loadSoundPreferences(storage)).toEqual(DEFAULT_SOUND_PREFERENCES);
    storage.setItem(SOUND_PREFERENCES_KEY, JSON.stringify({
      speechEnabled: false,
      movementSoundEnabled: "yes",
      combatSoundEnabled: false,
      keySoundEnabled: 1,
    }));
    expect(loadSoundPreferences(storage)).toEqual({
      speechEnabled: false,
      movementSoundEnabled: true,
      combatSoundEnabled: false,
      keySoundEnabled: true,
    });
    storage.setItem(SOUND_PREFERENCES_KEY, "{");
    expect(loadSoundPreferences(storage)).toEqual(DEFAULT_SOUND_PREFERENCES);
  });

  test("round-trips sound categories independently from battle saves", () => {
    const storage = new MemoryStorage();
    const preferences = {
      speechEnabled: false,
      movementSoundEnabled: true,
      combatSoundEnabled: false,
      keySoundEnabled: true,
    };
    saveSoundPreferences(storage, preferences);
    expect(loadSoundPreferences(storage)).toEqual(preferences);
  });
});

describe("music preferences", () => {
  test("defaults to the native maximum selection and rejects invalid levels", () => {
    const storage = new MemoryStorage();
    expect(loadMusicPreferences(storage)).toEqual(DEFAULT_MUSIC_PREFERENCES);
    for (const invalid of [-1, 5, 2.5, "3", null]) {
      storage.setItem(MUSIC_PREFERENCES_KEY, JSON.stringify({ musicVolume: invalid }));
      expect(loadMusicPreferences(storage)).toEqual(DEFAULT_MUSIC_PREFERENCES);
    }
    storage.setItem(MUSIC_PREFERENCES_KEY, "{");
    expect(loadMusicPreferences(storage)).toEqual(DEFAULT_MUSIC_PREFERENCES);
  });

  test("round-trips each one-of-five music selection", () => {
    const storage = new MemoryStorage();
    for (const musicVolume of [0, 1, 2, 3, 4] as const) {
      saveMusicPreferences(storage, { musicVolume });
      expect(loadMusicPreferences(storage)).toEqual({ musicVolume });
    }
  });
});
