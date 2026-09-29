import type { DialoguePage } from "../../src/game/types";

export interface NativeStoryDocument {
  readonly actions: readonly Readonly<Record<string, unknown> & { op: string; line?: number }>[];
}

export function compileNativeStory(
  document: NativeStoryDocument,
  record: number,
  portraitSpeakers: Readonly<Record<number, string>>,
  options?: { includeBackground?: boolean },
): DialoguePage[];
