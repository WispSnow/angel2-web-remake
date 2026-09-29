import type { DialoguePortraitCue, DialogueTimedPortraitCue, DialogueWindowState } from "./types";

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

/**
 * The face and nameplate a window shows `ticks` native ticks into its page's
 * `DL` waits. The redraw that ends a wait belongs to the tick the wait ends on.
 * Without timed cues the page's own portrait covers everything.
 */
export function dialoguePortraitAfterTicks(state: DialogueWindowState, ticks: number): ShownPortrait {
  const cues: readonly DialogueTimedPortraitCue[] = state.timedPortraitCues ?? [];
  let shown: ShownPortrait = cues[0] ?? state;
  for (const cue of cues) {
    if (cue.tick > ticks) break;
    shown = cue;
  }
  return shown;
}
