export interface PresentationPreferences {
  battlePresentation: "map" | "full";
  gridEnabled: boolean;
  edgeScrollEnabled: boolean;
  portraitsEnabled: boolean;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PRESENTATION_PREFERENCES_KEY = "angel2.preferences.presentation.v1";

export const DEFAULT_PRESENTATION_PREFERENCES: Readonly<PresentationPreferences> = {
  battlePresentation: "full",
  gridEnabled: false,
  edgeScrollEnabled: true,
  portraitsEnabled: true,
};

export function loadPresentationPreferences(storage: PreferenceStorage): PresentationPreferences {
  const raw = storage.getItem(PRESENTATION_PREFERENCES_KEY);
  if (!raw) return { ...DEFAULT_PRESENTATION_PREFERENCES };
  try {
    const candidate = JSON.parse(raw) as Partial<PresentationPreferences>;
    return {
      battlePresentation: candidate.battlePresentation === "map" || candidate.battlePresentation === "full"
        ? candidate.battlePresentation
        : DEFAULT_PRESENTATION_PREFERENCES.battlePresentation,
      gridEnabled: typeof candidate.gridEnabled === "boolean"
        ? candidate.gridEnabled
        : DEFAULT_PRESENTATION_PREFERENCES.gridEnabled,
      edgeScrollEnabled: typeof candidate.edgeScrollEnabled === "boolean"
        ? candidate.edgeScrollEnabled
        : DEFAULT_PRESENTATION_PREFERENCES.edgeScrollEnabled,
      portraitsEnabled: typeof candidate.portraitsEnabled === "boolean"
        ? candidate.portraitsEnabled
        : DEFAULT_PRESENTATION_PREFERENCES.portraitsEnabled,
    };
  } catch {
    return { ...DEFAULT_PRESENTATION_PREFERENCES };
  }
}

export function savePresentationPreferences(
  storage: PreferenceStorage,
  preferences: PresentationPreferences,
): void {
  storage.setItem(PRESENTATION_PREFERENCES_KEY, JSON.stringify(preferences));
}
