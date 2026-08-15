import {
  CREDITS_CONTENT_IDENTITY,
  CREDITS_FINAL_TIMELINE,
  CREDITS_FINAL_SCREEN,
  CREDITS_MUSIC,
  CREDITS_NAME_FRAMES,
  CREDITS_PAGES,
  CREDITS_ROLE_FRAMES,
  CREDITS_TRANSITION,
} from "./credits-runtime.generated";
import type { LoopMusicProgram } from "../music-transport";

export {
  CREDITS_CONTENT_IDENTITY,
  CREDITS_FINAL_SCREEN,
  CREDITS_FINAL_TIMELINE,
  CREDITS_MUSIC,
  CREDITS_NAME_FRAMES,
  CREDITS_PAGES,
  CREDITS_ROLE_FRAMES,
  CREDITS_TRANSITION,
};

export const CREDITS_MUSIC_PROGRAM: LoopMusicProgram = {
  id: "module46-credits",
  kind: "loop",
  track: CREDITS_MUSIC.track,
  source: CREDITS_MUSIC.source,
  seamlessLoop: CREDITS_MUSIC.source,
};

export type CreditsSection = "page" | "the-end";

export class CreditsSession {
  section: CreditsSection = "page";
  transitionIndex = 0;

  get pageIndex(): number {
    return Math.min(this.transitionIndex, CREDITS_PAGES.length - 1);
  }

  get page() {
    return this.transitionIndex < CREDITS_PAGES.length
      ? CREDITS_PAGES[this.transitionIndex]
      : undefined;
  }

  advance(): CreditsSection {
    if (this.section === "the-end") return this.section;
    if (this.transitionIndex + 1 < CREDITS_TRANSITION.count) this.transitionIndex += 1;
    else this.section = "the-end";
    return this.section;
  }
}
