import { describe, expect, it } from "vitest";
import { compileNativeStory } from "../../scripts/lib/compile-native-story.mjs";
import { dialoguePortraitAfterTyping } from "../../src/game/dialogue-portrait-cues";
import type { DialogueWindowState } from "../../src/game/types";

type Action = Record<string, unknown> & { op: string };

const show = (slot: "upper" | "lower", portraitId: number): Action =>
  ({ op: "show_portrait", slot, portraitId });
const hide = (slot: "upper" | "lower"): Action => ({ op: "hide_portrait", slot });
const open = (slot: "upper" | "lower", replaceText = true): Action =>
  ({ op: "open_window", slot, replaceText });
const text = (slot: "upper" | "lower", value: string): Action => ({ op: "text", slot, text: value });
const lineBreak: Action = { op: "line_break" };
const ky = (line: number): Action => ({ op: "wait_for_input", line });

const compile = (actions: readonly Action[]) =>
  compileNativeStory({ actions }, 164, { 0: "葛蒂拉斯", 51: "水戰士" });

describe("native story compiler portrait cues", () => {
  it("turns HD between runs of the typing window's text into reveal-ordered cues", () => {
    const [page] = compile([
      open("lower"),
      show("lower", 25), text("lower", "妳們～～"),
      show("lower", 0), text("lower", "曾經～～"),
      lineBreak,
      show("lower", 51), text("lower", "我們～～"),
      ky(9),
    ]);
    expect(page.lower).toEqual({
      text: "妳們～～曾經～～\n我們～～",
      portrait: 51,
      speaker: "水戰士",
      portraitCues: [
        { at: 0, portrait: 25 },
        { at: 4, portrait: 0, speaker: "葛蒂拉斯" },
        { at: 9, portrait: 51, speaker: "水戰士" },
      ],
    });
  });

  it("folds draws before the first new glyph into the page's opening face", () => {
    const pages = compile([
      open("lower"), text("lower", "呼哈"), ky(3),
      // SAY/0164 continues the same window: `\\`, then `HD 25`, then text.
      lineBreak, show("lower", 25), text("lower", "妳們"),
      show("lower", 24), text("lower", "曾經"),
      ky(8),
    ]);
    expect(pages[1]).toMatchObject({ revealStart: 2 });
    expect(pages[1].lower?.portraitCues).toEqual([
      { at: 2, portrait: 25 },
      { at: 5, portrait: 24 },
    ]);
  });

  it("keeps the ordinary one-face page free of cues", () => {
    const pages = compile([
      show("upper", 41), open("upper"), text("upper", "「女帝？」"), ky(3),
      // A new speaker before appended text still owns the whole reveal.
      show("upper", 46), text("upper", "「呦」"), ky(5),
      hide("lower"), open("lower"), show("lower", 19), text("lower", "不甘心"), ky(9),
    ]);
    for (const page of pages) {
      expect(page.upper?.portraitCues).toBeUndefined();
      expect(page.lower?.portraitCues).toBeUndefined();
    }
    expect(pages[1].upper?.portrait).toBe(46);
  });

  it("keeps only the last of several draws between the same two glyphs", () => {
    const [page] = compile([
      open("lower"), show("lower", 25), text("lower", "妳們"),
      show("lower", 24), show("lower", 12), text("lower", "曾經"),
      show("lower", 6), show("lower", 25), text("lower", "打敗"),
      ky(9),
    ]);
    expect(page.lower?.portraitCues).toEqual([
      { at: 0, portrait: 25 },
      { at: 2, portrait: 12 },
      { at: 4, portrait: 25 },
    ]);
  });

  it("leaves a flicker on the window that is not typing collapsed to its KY face", () => {
    // SAY/0074 flips the upper statue between D/56 and D/67 on `DL` waits
    // while the lower narration window holds the page.
    const [page] = compile([
      show("upper", 56), open("lower"), text("lower", "石像的色澤"),
      show("upper", 67), show("upper", 56), show("upper", 67),
      ky(44),
    ]);
    expect(page.upper).toEqual({ portrait: 67, speaker: undefined });
  });

  it("refuses a portrait cleared while its own text is still typing", () => {
    expect(() => compile([
      open("lower"), show("lower", 25), text("lower", "妳們"), hide("lower"), text("lower", "曾經"), ky(6),
    ])).toThrow("SAY/164 clears the lower portrait while its text is typing");
  });
});

describe("dialogue portrait after typing", () => {
  const chantText = "妳們～～曾經～～";
  const chant: DialogueWindowState = {
    text: chantText,
    portrait: 24,
    portraitCues: [
      { at: 0, portrait: 25 },
      { at: 4, portrait: 24 },
    ],
  };

  it("swaps as the next phrase's first glyph is drawn, not after the previous one", () => {
    expect(dialoguePortraitAfterTyping(chant, 0).portrait).toBe(25);
    expect(dialoguePortraitAfterTyping(chant, 3).portrait).toBe(25);
    expect(dialoguePortraitAfterTyping(chant, 4).portrait).toBe(24);
    expect(dialoguePortraitAfterTyping(chant, chantText.length).portrait).toBe(chant.portrait);
  });

  it("uses the window's own face when the page has no cues", () => {
    expect(dialoguePortraitAfterTyping({ text: "「女帝？」", portrait: 46, speaker: "妮雅" }, 0))
      .toEqual({ text: "「女帝？」", portrait: 46, speaker: "妮雅" });
  });
});
