export interface PresentationPreferences {
  battlePresentation: "map" | "full";
  gridEnabled: boolean;
  edgeScrollEnabled: boolean;
  portraitsEnabled: boolean;
  aiDialogueEnabled: boolean;
}

export interface SoundPreferences {
  speechEnabled: boolean;
  movementSoundEnabled: boolean;
  combatSoundEnabled: boolean;
  keySoundEnabled: boolean;
}

export type MusicVolume = 0 | 1 | 2 | 3 | 4;

/**
 * How the 640x350 logical screen is resampled on its way to the host display.
 * This is a host-display preference in the same family as browser zoom: it never
 * reaches the simulation, the PRNG or the save payload, so it lives outside the
 * original sub-menu instead of inside it.
 *
 * - `sharp`   nearest neighbour, the original-faithful default.
 * - `smooth`  bilinear, even at fractional scales but soft.
 * - `integer` nearest neighbour with the scale snapped to a whole number of
 *             device pixels, so every source pixel keeps the same size.
 */
export type ImageScalingMode = "sharp" | "smooth" | "integer";

export interface DisplayPreferences {
  imageScaling: ImageScalingMode;
}

export interface MusicPreferences {
  musicVolume: MusicVolume;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PRESENTATION_PREFERENCES_KEY = "angel2.preferences.presentation.v1";
export const SOUND_PREFERENCES_KEY = "angel2.preferences.sound.v1";
export const MUSIC_PREFERENCES_KEY = "angel2.preferences.music.v1";
export const DISPLAY_PREFERENCES_KEY = "angel2.preferences.display.v1";

export const DEFAULT_PRESENTATION_PREFERENCES: Readonly<PresentationPreferences> = {
  battlePresentation: "full",
  gridEnabled: false,
  edgeScrollEnabled: true,
  portraitsEnabled: true,
  aiDialogueEnabled: true,
};

export const DEFAULT_SOUND_PREFERENCES: Readonly<SoundPreferences> = {
  speechEnabled: true,
  movementSoundEnabled: true,
  combatSoundEnabled: true,
  keySoundEnabled: true,
};

export const DEFAULT_MUSIC_PREFERENCES: Readonly<MusicPreferences> = {
  musicVolume: 4,
};

export const DEFAULT_DISPLAY_PREFERENCES: Readonly<DisplayPreferences> = {
  imageScaling: "sharp",
};

export const isImageScalingMode = (value: unknown): value is ImageScalingMode =>
  value === "sharp" || value === "smooth" || value === "integer";

export const isMusicVolume = (value: unknown): value is MusicVolume =>
  Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 4;

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
      aiDialogueEnabled: typeof candidate.aiDialogueEnabled === "boolean"
        ? candidate.aiDialogueEnabled
        : DEFAULT_PRESENTATION_PREFERENCES.aiDialogueEnabled,
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

export function loadSoundPreferences(storage: PreferenceStorage): SoundPreferences {
  const raw = storage.getItem(SOUND_PREFERENCES_KEY);
  if (!raw) return { ...DEFAULT_SOUND_PREFERENCES };
  try {
    const candidate = JSON.parse(raw) as Partial<SoundPreferences>;
    return {
      speechEnabled: typeof candidate.speechEnabled === "boolean"
        ? candidate.speechEnabled
        : DEFAULT_SOUND_PREFERENCES.speechEnabled,
      movementSoundEnabled: typeof candidate.movementSoundEnabled === "boolean"
        ? candidate.movementSoundEnabled
        : DEFAULT_SOUND_PREFERENCES.movementSoundEnabled,
      combatSoundEnabled: typeof candidate.combatSoundEnabled === "boolean"
        ? candidate.combatSoundEnabled
        : DEFAULT_SOUND_PREFERENCES.combatSoundEnabled,
      keySoundEnabled: typeof candidate.keySoundEnabled === "boolean"
        ? candidate.keySoundEnabled
        : DEFAULT_SOUND_PREFERENCES.keySoundEnabled,
    };
  } catch {
    return { ...DEFAULT_SOUND_PREFERENCES };
  }
}

export function saveSoundPreferences(
  storage: PreferenceStorage,
  preferences: SoundPreferences,
): void {
  storage.setItem(SOUND_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function loadMusicPreferences(storage: PreferenceStorage): MusicPreferences {
  const raw = storage.getItem(MUSIC_PREFERENCES_KEY);
  if (!raw) return { ...DEFAULT_MUSIC_PREFERENCES };
  try {
    const candidate = JSON.parse(raw) as Partial<MusicPreferences>;
    return {
      musicVolume: isMusicVolume(candidate.musicVolume)
        ? candidate.musicVolume
        : DEFAULT_MUSIC_PREFERENCES.musicVolume,
    };
  } catch {
    return { ...DEFAULT_MUSIC_PREFERENCES };
  }
}

export function saveMusicPreferences(
  storage: PreferenceStorage,
  preferences: MusicPreferences,
): void {
  storage.setItem(MUSIC_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function loadDisplayPreferences(storage: PreferenceStorage): DisplayPreferences {
  const raw = storage.getItem(DISPLAY_PREFERENCES_KEY);
  if (!raw) return { ...DEFAULT_DISPLAY_PREFERENCES };
  try {
    const candidate = JSON.parse(raw) as Partial<DisplayPreferences>;
    return {
      imageScaling: isImageScalingMode(candidate.imageScaling)
        ? candidate.imageScaling
        : DEFAULT_DISPLAY_PREFERENCES.imageScaling,
    };
  } catch {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }
}

export function saveDisplayPreferences(
  storage: PreferenceStorage,
  preferences: DisplayPreferences,
): void {
  storage.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify(preferences));
}
