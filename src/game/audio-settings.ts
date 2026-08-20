import type { MusicVolume, SoundEffectVolume } from "./preferences";

export type SoundEffectChannel = "speech" | "movement" | "combat" | "key";

export interface SoundChannelState {
  speechEnabled: boolean;
  movementSoundEnabled: boolean;
  combatSoundEnabled: boolean;
  keySoundEnabled: boolean;
}

export const MUSIC_GAIN_BY_VOLUME: Readonly<Record<MusicVolume, number>> = {
  0: 0,
  1: 0.08,
  2: 0.16,
  3: 0.24,
  4: 0.32,
};

export const SOUND_EFFECT_GAIN_BY_VOLUME: Readonly<Record<SoundEffectVolume, number>> = {
  0: 0,
  1: 0.25,
  2: 0.5,
  3: 0.75,
  4: 1,
};

export const soundEffectOutputVolume = (
  cueVolume: number,
  level: SoundEffectVolume,
): number => Math.min(1, Math.max(0, cueVolume) * SOUND_EFFECT_GAIN_BY_VOLUME[level]);

export const soundEffectChannelForCue = (reason: string): SoundEffectChannel =>
  reason.includes("movement") ? "movement" : "combat";

export const isSoundEffectChannelEnabled = (
  state: SoundChannelState,
  channel: SoundEffectChannel,
): boolean => {
  if (channel === "speech") return state.speechEnabled;
  if (channel === "movement") return state.movementSoundEnabled;
  if (channel === "combat") return state.combatSoundEnabled;
  return state.keySoundEnabled;
};
