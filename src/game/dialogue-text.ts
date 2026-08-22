import { NATIVE_TEXT } from "./content/native-font.generated";
import { nativeTextCanvas, paintNativeText } from "./native-dom-text";

/**
 * The A/18 windows' text: one transparent span per character for layout and
 * assistive technology, and one canvas over them carrying the original glyphs.
 *
 * The spans are what make the window's geometry testable — the SAY cursor's
 * 16 px Big5 and 8 px ASCII steps are literally these boxes, and the acceptance
 * tests measure them — while the canvas is what makes the text look like the
 * original instead of like a host CJK face. Both consume the same string from
 * the same call, so they cannot drift.
 */

/**
 * The remake's corpus stores a native `7Ch` line break as `\n`. `7Ch` is the
 * cursor's own line feed (`0000:EA04`), so no record can hold a printable one
 * and translating back is lossless: the only literal `|` left in generated
 * content is in the prayer templates, which never reach a dialogue window.
 */
const nativeLineFeed = (text: string): string =>
  text.replaceAll("\n", NATIVE_TEXT.lineFeed.character);

const canvases = new WeakMap<HTMLElement, HTMLCanvasElement>();

/**
 * `fullText` is the whole line this reveal is working towards; passing it lets
 * the canvas be sized once instead of on every character.
 */
export function renderNativeDialogueText(
  target: HTMLElement,
  text: string,
  fullText?: string,
): void {
  const fragment = document.createDocumentFragment();
  for (const character of text) {
    if (character === "\n") {
      fragment.append(document.createTextNode(character));
      continue;
    }
    const glyph = document.createElement("span");
    glyph.className = /[^\x00-\x7f]/u.test(character)
      ? "dialogue-glyph big5"
      : "dialogue-glyph ascii";
    glyph.textContent = character;
    fragment.append(glyph);
  }
  target.replaceChildren(fragment, nativeDialogueCanvas(target, text, fullText));
}

/**
 * Sizes the canvas for the whole line rather than for what is revealed so far,
 * so a typing line never resizes its own box, then paints the revealed prefix
 * into it.
 */
function nativeDialogueCanvas(
  target: HTMLElement,
  text: string,
  fullText: string = target.dataset.fullText ?? "",
): HTMLCanvasElement {
  const reserved = nativeLineFeed(fullText.length >= text.length ? fullText : text);
  let canvas = canvases.get(target);
  if (!canvas || canvas.dataset.reservedText !== reserved) {
    canvas = nativeTextCanvas(reserved, { mode: "story" }, canvas);
    canvas.dataset.reservedText = reserved;
    canvas.classList.add("dialogue-native-text");
    canvases.set(target, canvas);
  }
  paintNativeText(canvas, nativeLineFeed(text), { mode: "story" });
  return canvas;
}
