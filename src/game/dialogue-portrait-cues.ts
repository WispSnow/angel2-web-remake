import type { DialoguePortraitCue, DialogueWindowState } from "./types";

type ShownPortrait = Pick<DialogueWindowState, "portrait" | "speaker">;

/**
 * The face and nameplate a window shows once `typed` characters of its text
 * have been drawn. The script's `HD` for the next phrase runs after the last
 * glyph's wait, so the swap belongs to the start of the next glyph, not the end
 * of the previous one. Without cues the page's own portrait covers everything.
 */
export function dialoguePortraitAfterTyping(state: DialogueWindowState, typed: number): ShownPortrait {
  const cues: readonly DialoguePortraitCue[] = state.portraitCues ?? [];
  let shown: ShownPortrait = cues[0] ?? state;
  for (const cue of cues) {
    if (cue.at > typed) break;
    shown = cue;
  }
  return shown;
}
