/**
 * Compile the lossless SAY action stream into one browser page per native KY.
 *
 * KY pauses the interpreter without clearing either window or moving the text
 * cursor. When the script appends to the same still-open window after KY, the
 * next page must begin revealing after the text that is already on screen.
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
  let activeSlot;
  let backgroundId;
  let wait = 0;
  const pages = [];

  for (const action of document.actions) {
    if (action.op === "set_background") {
      backgroundId = action.backgroundId;
    } else if (action.op === "show_portrait") {
      windows[action.slot].portrait = action.portraitId;
    } else if (action.op === "hide_portrait") {
      windows[action.slot].portrait = undefined;
    } else if (action.op === "open_window") {
      if (!windows[action.slot].open || action.replaceText) {
        visibleTextAtLastWait[action.slot] = undefined;
      }
      windows[action.slot].open = true;
      if (action.replaceText) windows[action.slot].text = "";
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
        if (!state.open) continue;
        page[slot] = {
          text: state.text,
          ...(state.portrait === undefined ? {} : {
            portrait: state.portrait,
            speaker: portraitSpeakers[state.portrait],
          }),
        };
      }
      pages.push(page);
      for (const slot of ["upper", "lower"]) {
        visibleTextAtLastWait[slot] = windows[slot].open ? windows[slot].text : undefined;
      }
    }
  }

  return pages;
}
