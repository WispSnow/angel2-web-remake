import { NATIVE_MENU_LABEL_PADDING } from "./content/native-font.generated";
import {
  NATIVE_INK_COLOR,
  NATIVE_OUTLINE_COLOR,
  type NativeTextMode,
  drawNativeText,
  layoutNativeText,
  loadNativeFont,
} from "./native-text";

/**
 * The original bitmap font for surfaces that stay in the DOM.
 *
 * `native-hud-text.ts` can paint one full-screen canvas because every string it
 * draws has a fixed native origin. The menus, the A/18 windows, the record
 * panels and the full-screen combat readouts do not: they open, close, scroll
 * and re-flow under CSS, and the original's own frames and highlight bars are
 * already CSS backgrounds around them. So each label gets its own canvas sized
 * exactly to the run, and CSS keeps placing it — the glyphs change, the layout
 * does not.
 *
 * The host text stays in the DOM as the accessible name; only its glyphs go
 * away, the same split the deployment roster already uses.
 *
 * Sizing runs through `layoutNativeText`, which needs no atlas, so a canvas is
 * correct the moment it is created. The pixels arrive when the font resolves,
 * and every canvas built before that repaints itself then.
 */

export interface NativeDomTextStyle {
  readonly ink?: string;
  readonly outline?: string;
  /**
   * `story` is the A/18 cursor (half-width advance 8); `normal` is the HUD
   * drawer's (9). Defaults to `story`, because every DOM surface that still
   * needs converting is an A/18 window, a menu or a data panel rather than the
   * module-29 HUD the full-screen layer already owns.
   */
  readonly mode?: NativeTextMode;
}

interface PaintedCanvas {
  text: string;
  style: NativeDomTextStyle;
}

const painted = new WeakMap<HTMLCanvasElement, PaintedCanvas>();
const pending = new Set<HTMLCanvasElement>();
let fontReady = false;

function whenFontReady(): void {
  if (fontReady) return;
  void loadNativeFont().then(() => {
    fontReady = true;
    for (const canvas of pending) {
      const state = painted.get(canvas);
      if (state) paint(canvas, state.text, state.style);
    }
    pending.clear();
  }).catch(() => undefined);
}

function paint(canvas: HTMLCanvasElement, text: string, style: NativeDomTextStyle): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawNativeText(context, text, 0, 0, {
    ink: style.ink ?? NATIVE_INK_COLOR,
    outline: style.outline ?? NATIVE_OUTLINE_COLOR,
    mode: style.mode ?? "story",
  });
}

/** The pixel box `text` occupies, before any host box or alignment is applied. */
export function nativeTextSize(
  text: string,
  mode: NativeTextMode = "story",
): { readonly width: number; readonly height: number } {
  const layout = layoutNativeText(text, 0, 0, mode);
  return { width: Math.max(0, layout.right), height: Math.max(0, layout.bottom) };
}

/**
 * Paints `text` into an already-sized canvas, clearing whatever was there.
 *
 * The typewriter needs this: its canvas is sized once for the whole line so the
 * box does not resize under the window, then repainted with a longer prefix on
 * every character. Repaints queued before the atlas resolves are replayed then,
 * the same as any other canvas here.
 */
export function paintNativeText(
  canvas: HTMLCanvasElement,
  text: string,
  style: NativeDomTextStyle = {},
): void {
  painted.set(canvas, { text, style });
  if (fontReady) {
    paint(canvas, text, style);
    return;
  }
  pending.add(canvas);
  whenFontReady();
}

/**
 * Builds — or, when `canvas` is supplied, updates in place — a canvas holding
 * exactly `text`. Reusing the node matters for the menus: replacing it would
 * restart the CSS open animation the frame around it is playing.
 */
export function nativeTextCanvas(
  text: string,
  style: NativeDomTextStyle = {},
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): HTMLCanvasElement {
  const { width, height } = nativeTextSize(text, style.mode ?? "story");
  // A run of spaces has a cursor advance but no glyphs. Keeping the element at
  // 1x1 rather than 0x0 leaves it measurable and hit-testable like any label.
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  canvas.className = "native-text";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  painted.set(canvas, { text, style });
  if (fontReady) {
    paint(canvas, text, style);
  } else {
    pending.add(canvas);
    whenFontReady();
  }
  return canvas;
}

/**
 * Replaces `host`'s glyphs with the original font's while keeping its text as
 * the accessible name.
 *
 * The host ends up holding a clipped copy of the string plus the canvas, so its
 * box collapses onto the drawn run: CSS positions the host and never has to
 * know how wide a host face would have rendered the same characters. Repainting
 * the same text reuses both nodes, which is what lets the confirmation menus
 * flip their selection without disturbing the frame animation around them.
 */
export function paintNativeDomText(
  host: HTMLElement,
  text: string,
  style: NativeDomTextStyle = {},
  accessibleText: string = text,
): HTMLCanvasElement {
  const existing = host.querySelector<HTMLCanvasElement>(":scope > canvas.native-text");
  const current = existing ? painted.get(existing) : undefined;
  const unchanged = existing && current && current.text === text && sameStyle(current.style, style);
  const canvas = unchanged ? existing : nativeTextCanvas(text, style, existing ?? undefined);
  host.classList.add("has-native-text");
  // The drawn run may carry the original's own padding (`移    動`), which is
  // spacing rather than wording. Screen readers and the acceptance tests read
  // the label, so the clipped copy keeps the plain one.
  const accessible = host.querySelector<HTMLElement>(":scope > .visually-hidden")
    ?? document.createElement("span");
  if (accessible.textContent !== accessibleText) {
    accessible.className = "visually-hidden";
    accessible.textContent = accessibleText;
  }
  if (!existing) host.replaceChildren(accessible, canvas);
  return canvas;
}

function sameStyle(left: NativeDomTextStyle, right: NativeDomTextStyle): boolean {
  return left.ink === right.ink && left.outline === right.outline && left.mode === right.mode;
}

/** The visible menu label to the space-padded original string, per `input-ui.json`. */
export function nativeMenuLabelText(label: string): string {
  return NATIVE_MENU_LABEL_PADDING[label.replaceAll(" ", "")] ?? label;
}

/**
 * Paints every `[data-native-text]` element under `root` with its own text
 * content, so a surface rendered from one `innerHTML` template can opt in per
 * element instead of threading a canvas through the template.
 *
 * `data-native-text` may name a mode; `data-native-ink` overrides the ink.
 */
export function paintNativeDomTextIn(root: ParentNode): void {
  for (const host of root.querySelectorAll<HTMLElement>("[data-native-text]")) {
    const mode = host.dataset.nativeText;
    // `textContent` is the source string on a freshly built host and the
    // clipped copy afterwards, and they are the same characters either way.
    const text = host.textContent ?? "";
    paintNativeDomText(host, text, {
      mode: mode === "normal" || mode === "compact" ? mode : "story",
      ink: host.dataset.nativeInk,
    }, text);
  }
}
