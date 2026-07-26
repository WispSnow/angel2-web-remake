import { describe, expect, test } from "vitest";
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  loadPresentationPreferences,
  PRESENTATION_PREFERENCES_KEY,
  savePresentationPreferences,
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
    }));
    expect(loadPresentationPreferences(storage)).toEqual({
      battlePresentation: "full",
      gridEnabled: false,
      edgeScrollEnabled: false,
      portraitsEnabled: false,
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
    };
    savePresentationPreferences(storage, preferences);
    expect(loadPresentationPreferences(storage)).toEqual(preferences);
  });
});
