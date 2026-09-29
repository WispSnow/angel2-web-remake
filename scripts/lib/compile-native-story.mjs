/**
 * Compile the lossless SAY action stream into one browser page per native KY.
 *
 * KY pauses the interpreter without clearing either window or moving the text
 * cursor. When the script appends to the same still-open window after KY, the
 * next page must begin revealing after the text that is already on screen.
 *
 * `HU`/`HD` run inline between text actions, so a portrait drawn between two
 * runs of the typing window's text replaces the face mid-page. Those swaps are
 * emitted as `portraitCues` on that window; its `portrait` stays the KY state.
 *
 * `DL n` (module 29 only) waits `n` native ticks and reads no input. Redraws
 * that land after such waits are emitted as `timedPortraitCues` in ticks since
 * the previous KY; the page accepts input once the last one has been drawn.
 */
export function compileNativeStory(
  document,
  record,
  portraitSpeakers,
  { includeBackground = false } = {},
) {
  const windows = {
    upper: { open: false, text: "", portrait: undefined },
    lower: { open: false, text: "", portrait: undefined },
  };
  const visibleTextAtLastWait = { upper: undefined, lower: undefined };
  const portraitAtLastWait = { upper: undefined, lower: undefined };
  // Every HU/HD/PU/PD since the last KY, with the window text length and the
  // native ticks of `DL` waits it ran after.
  const portraitDraws = { upper: [], lower: [] };
  let ticksSinceWait = 0;
  // Whether anything but a portrait redraw changed the screen since the last KY.
  let windowsChangedSinceWait = false;
  let activeSlot;
  let backgroundId;
  let wait = 0;
  const pages = [];

  for (const action of document.actions) {
    if (["set_background", "open_window", "close_window", "text", "line_break"].includes(action.op)) {
      windowsChangedSinceWait = true;
    }
    if (action.op === "set_background") {
      backgroundId = action.backgroundId;
    } else if (action.op === "show_portrait" || action.op === "hide_portrait") {
      const portrait = action.op === "show_portrait" ? action.portraitId : undefined;
      windows[action.slot].portrait = portrait;
      portraitDraws[action.slot].push({ at: windows[action.slot].text.length, tick: ticksSinceWait, portrait });
    } else if (action.op === "wait_native_ticks") {
      if (!Number.isInteger(action.nativeTicks) || action.nativeTicks <= 0) {
        throw new Error(`SAY/${record}:${action.line} DL needs a positive tick count`);
      }
      ticksSinceWait += action.nativeTicks;
    } else if (action.op === "open_window") {
      if (!windows[action.slot].open || action.replaceText) {
        visibleTextAtLastWait[action.slot] = undefined;
      }
      windows[action.slot].open = true;
      if (action.replaceText) {
        windows[action.slot].text = "";
        // Drawn before any of the replacement text, so before its first glyph.
        for (const draw of portraitDraws[action.slot]) draw.at = 0;
      }
      activeSlot = action.slot;
    } else if (action.op === "close_window") {
      windows[action.slot].open = false;
      visibleTextAtLastWait[action.slot] = undefined;
    } else if (action.op === "text") {
      windows[action.slot].text += action.text;
      activeSlot = action.slot;
    } else if (action.op === "line_break") {
      if (!activeSlot) throw new Error(`SAY/${record} line break has no active window`);
      windows[activeSlot].text += "\n";
    } else if (action.op === "wait_for_input") {
      wait += 1;
      // Only SAY/0074 uses DL, and only to flicker a portrait between two KYs.
      // Text, windows or a trailing wait after DL would need the page to delay
      // typing or input, which no page does; refuse rather than guess.
      if (ticksSinceWait > 0 && windowsChangedSinceWait) {
        throw new Error(`SAY/${record}:${action.line} changes a window on a page with DL waits`);
      }
      const previousVisibleText = activeSlot === undefined
        ? undefined
        : visibleTextAtLastWait[activeSlot];
      const activeText = activeSlot === undefined || !windows[activeSlot].open
        ? undefined
        : windows[activeSlot].text;
      const revealStart = previousVisibleText
        && activeText?.startsWith(previousVisibleText)
        ? previousVisibleText.length
        : undefined;
      const page = {
        activeSlot,
        ...(revealStart === undefined ? {} : { revealStart }),
        source: {
          record,
          wait,
          address: `SAY/${String(record).padStart(4, "0")}:${action.line}`,
          ...(includeBackground && backgroundId !== undefined ? { backgroundId } : {}),
        },
      };
      for (const slot of ["upper", "lower"]) {
        const state = windows[slot];
        // A portrait outlives its window: HD/HU without WD/WU keeps the face and
        // nameplate on screen with no text panel. Emitting the slot without
        // `text` reproduces that instead of dropping the portrait entirely.
        if (!state.open && state.portrait === undefined) continue;
        const portraitCues = slot === activeSlot && activeText !== undefined && ticksSinceWait === 0
          ? typedPortraitCues(record, slot, activeText, revealStart ?? 0, portraitAtLastWait[slot], portraitDraws[slot])
          : undefined;
        const timedCues = ticksSinceWait > 0
          ? timedPortraitCues(record, slot, portraitAtLastWait[slot], portraitDraws[slot])
          : undefined;
        page[slot] = {
          ...(state.open ? { text: state.text } : {}),
          ...(state.portrait === undefined ? {} : {
            portrait: state.portrait,
            speaker: portraitSpeakers[state.portrait],
          }),
          ...(portraitCues === undefined ? {} : {
            portraitCues: portraitCues.map(({ at, portrait }) => ({
              at,
              portrait,
              ...(portraitSpeakers[portrait] === undefined ? {} : { speaker: portraitSpeakers[portrait] }),
            })),
          }),
          ...(timedCues === undefined ? {} : {
            timedPortraitCues: timedCues.map(({ tick, portrait }) => ({
              tick,
              portrait,
              ...(portraitSpeakers[portrait] === undefined ? {} : { speaker: portraitSpeakers[portrait] }),
            })),
          }),
        };
      }
      if (ticksSinceWait > 0) {
        const lastTick = Math.max(0, ...["upper", "lower"].map((slot) => page[slot]?.timedPortraitCues?.at(-1)?.tick ?? 0));
        if (lastTick !== ticksSinceWait) {
          throw new Error(`SAY/${record}:${action.line} waits ${ticksSinceWait - lastTick} ticks after its last timed redraw`);
        }
      }
      pages.push(page);
      for (const slot of ["upper", "lower"]) {
        visibleTextAtLastWait[slot] = windows[slot].open ? windows[slot].text : undefined;
        portraitAtLastWait[slot] = windows[slot].portrait;
        portraitDraws[slot] = [];
      }
      ticksSinceWait = 0;
      windowsChangedSinceWait = false;
    }
  }

  return pages;
}

/**
 * The portraits the typing window shows between KYs, or `undefined` when one
 * portrait covers the whole reveal. Draws that land before the first new glyph
 * (line breaks are cursor moves, not glyphs) belong to the page's opening face.
 */
function typedPortraitCues(record, slot, text, revealStart, openingPortrait, draws) {
  const cues = [{ at: revealStart, portrait: openingPortrait }];
  for (const draw of draws) {
    const at = /^\n*$/u.test(text.slice(revealStart, draw.at)) ? revealStart : draw.at;
    // Only the last of several draws between the same two glyphs is ever seen.
    if (cues.at(-1).at === at) cues.pop();
    const shown = cues.at(-1);
    if (shown === undefined || shown.portrait !== draw.portrait) cues.push({ at, portrait: draw.portrait });
  }
  if (cues.length < 2) return undefined;
  if (cues.some(({ portrait }) => portrait === undefined)) {
    throw new Error(`SAY/${record} clears the ${slot} portrait while its text is typing`);
  }
  return cues;
}

/**
 * The portraits a window shows between the `DL` waits of one page, or
 * `undefined` when nobody can see a change. `D3B6` measures each wait from the
 * end of the previous one, so a redraw's own drawing time never lengthens it.
 */
function timedPortraitCues(record, slot, openingPortrait, draws) {
  const cues = [{ tick: 0, portrait: openingPortrait }];
  for (const draw of draws) {
    // Redraws with no wait between them replace each other unseen.
    if (cues.at(-1).tick === draw.tick) cues.pop();
    const shown = cues.at(-1);
    if (shown === undefined || shown.portrait !== draw.portrait) cues.push({ tick: draw.tick, portrait: draw.portrait });
  }
  if (cues.length < 2) return undefined;
  if (cues.some(({ portrait }) => portrait === undefined)) {
    throw new Error(`SAY/${record} leaves the ${slot} portrait empty between DL waits`);
  }
  return cues;
}
