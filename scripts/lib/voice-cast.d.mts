export interface VoiceCastEntry {
  readonly speaker: string;
  readonly platform: "minimax" | "elevenlabs";
  readonly voiceId: string;
  readonly voiceName: string;
}

export const ELEVENLABS_MODEL: "eleven_v4";
export const MINIMAX_MODEL: "speech-2.8-hd";
export const VOICE_CAST: Readonly<Record<string, VoiceCastEntry>>;
export const PORTRAIT_ROLES: Readonly<Record<number, string>>;
export const GHOST_MONTAGE: Readonly<{ record: 164; waits: readonly number[]; role: "ghostMontage" }>;
export const VOICE_TEMPO_BY_PLATFORM: Readonly<Record<VoiceCastEntry["platform"], number>>;
export function voiceTempoForRole(role: string): number;
export function castRoleForPortrait(portrait: number | undefined): string;
