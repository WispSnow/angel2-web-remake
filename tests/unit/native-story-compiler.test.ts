import { describe, expect, it } from "vitest";
import { compileNativeStory } from "../../scripts/lib/compile-native-story.mjs";
import { dialoguePortraitAfterTicks, dialoguePortraitAfterTyping } from "../../src/game/dialogue-portrait-cues";
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
const dl = (line: number, nativeTicks: number): Action => ({ op: "wait_native_ticks", line, nativeTicks });

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

  it("collapses redraws with no wait between them on the window that is not typing", () => {
    // Without `DL` between them nobody sees the intermediate faces, only the
    // one standing at `KY`.
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

describe("native story compiler DL-timed portrait cues", () => {
  const compileStatue = (actions: readonly Action[]) =>
    compileNativeStory({ actions }, 74, { 56: "龍王", 67: "龍王" });
  // SAY/0074 lines 1–10: the statue is up and the narration has been read.
  const statueRaised: readonly Action[] = [
    open("lower"), text("lower", "琴斯說完"), show("upper", 56), ky(7),
    open("lower"), text("lower", "石像的色澤"), ky(10),
  ];

  it("turns redraws between DL waits into cues in ticks since the previous KY", () => {
    const pages = compileStatue([
      ...statueRaised,
      dl(11, 9), show("upper", 67), dl(14, 9), show("upper", 56),
      dl(17, 8), show("upper", 67), dl(41, 4), show("upper", 56), dl(42, 4), show("upper", 67),
      ky(44),
    ]);
    expect(pages[2]).toEqual({
      activeSlot: "lower",
      revealStart: 5,
      source: { record: 74, wait: 3, address: "SAY/0074:44" },
      // The page still waits on its KY face; the timeline opens on the one before.
      upper: {
        portrait: 67,
        speaker: "龍王",
        timedPortraitCues: [
          { tick: 0, portrait: 56, speaker: "龍王" },
          { tick: 9, portrait: 67, speaker: "龍王" },
          { tick: 18, portrait: 56, speaker: "龍王" },
          { tick: 26, portrait: 67, speaker: "龍王" },
          { tick: 30, portrait: 56, speaker: "龍王" },
          { tick: 34, portrait: 67, speaker: "龍王" },
        ],
      },
      lower: { text: "石像的色澤" },
    });
    // The pages around the flicker keep their plain one-face shape.
    expect(pages[1].upper).toEqual({ portrait: 56, speaker: "龍王" });
  });

  it("keeps only the last of several redraws between the same two waits", () => {
    const [, , page] = compileStatue([
      ...statueRaised,
      show("upper", 67), dl(11, 5), show("upper", 56), show("upper", 67),
      dl(14, 3), show("upper", 67), show("upper", 56),
      ky(20),
    ]);
    // `HU 67` before the first wait replaces the opening face at tick 0.
    expect(page.upper?.timedPortraitCues?.map(({ tick, portrait }) => [tick, portrait]))
      .toEqual([[0, 67], [8, 56]]);
  });

  it("refuses DL pages it cannot time: text, trailing waits and bad counts", () => {
    expect(() => compileStatue([
      ...statueRaised, dl(11, 9), show("upper", 67), open("lower"), text("lower", "在場"), ky(49),
    ])).toThrow("SAY/74:49 changes a window on a page with DL waits");
    expect(() => compileStatue([
      ...statueRaised, dl(11, 9), show("upper", 67), dl(14, 9), ky(44),
    ])).toThrow("SAY/74:44 waits 9 ticks after its last timed redraw");
    // Redrawing the face already up still holds input for the wait.
    expect(() => compileStatue([...statueRaised, dl(11, 5), show("upper", 56), ky(20)]))
      .toThrow("SAY/74:20 waits 5 ticks after its last timed redraw");
    expect(() => compileStatue([...statueRaised, dl(11, 0), show("upper", 67), ky(44)]))
      .toThrow("SAY/74:11 DL needs a positive tick count");
    expect(() => compileStatue([
      ...statueRaised, dl(11, 9), hide("upper"), dl(14, 9), show("upper", 67), ky(44),
    ])).toThrow("SAY/74 leaves the upper portrait empty between DL waits");
  });
});

describe("dialogue portrait after ticks", () => {
  const statue: DialogueWindowState = {
    portrait: 67,
    timedPortraitCues: [
      { tick: 0, portrait: 56 },
      { tick: 9, portrait: 67 },
      { tick: 18, portrait: 56 },
    ],
  };

  it("swaps on the tick a wait ends, not one tick later", () => {
    expect(dialoguePortraitAfterTicks(statue, 0).portrait).toBe(56);
    expect(dialoguePortraitAfterTicks(statue, 8).portrait).toBe(56);
    expect(dialoguePortraitAfterTicks(statue, 9).portrait).toBe(67);
    expect(dialoguePortraitAfterTicks(statue, 17).portrait).toBe(67);
    expect(dialoguePortraitAfterTicks(statue, 18).portrait).toBe(56);
  });

  it("uses the window's own face when the page has no timed cues", () => {
    expect(dialoguePortraitAfterTicks({ portrait: 56, speaker: "龍王" }, 9))
      .toEqual({ portrait: 56, speaker: "龍王" });
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
