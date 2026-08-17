import {
  STARTUP_DISSOLVE_PATTERNS,
  STARTUP_FONT,
} from "./content/startup.generated";

/**
 * Drawing primitives for module 23's startup screens. All three are things the
 * DOM cannot express faithfully:
 *
 * - the pretitle logo, intro backgrounds and title background are revealed by
 *   writing the VGA DAC 64 times with a brightness offset added to each 6-bit
 *   channel and clamped at zero (0000:31B4/31E0), which is an additive fade, not
 *   the multiplicative one `filter: brightness()` gives;
 * - the title art is not faded at all. 0000:0DC3 blits it through an 8x8 ordered
 *   dither pattern selected per step (0000:0F0A), one pattern row per scanline,
 *   so the picture dissolves in as a growing checkerboard;
 * - the scrolling intro rows and both menus are drawn with the 228-glyph
 *   A/23+A/24 bitmap font rather than a host CJK font.
 */

const imageCache = new Map<string, Promise<HTMLImageElement>>();
let scratch: HTMLCanvasElement | undefined;

export function loadStartupImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`startup asset ${src} failed to load`)), { once: true });
    image.src = src;
  });
  imageCache.set(src, pending);
  return pending;
}

export const loadStartupFont = (): Promise<HTMLImageElement> => loadStartupImage(STARTUP_FONT.src);

function scratchContext(width: number, height: number): CanvasRenderingContext2D {
  scratch ??= document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("startup compositing needs a 2D context");
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  return context;
}

/** `max(0, dac + offset)` in 6-bit DAC space, expressed as an 8-bit lookup. */
function fadeLookup(offset: number): Uint8ClampedArray {
  const table = new Uint8ClampedArray(256);
  for (let value = 0; value < 256; value += 1) {
    const dac = Math.round(value * 63 / 255);
    table[value] = Math.round(Math.max(0, dac + offset) * 255 / 63);
  }
  return table;
}

const fadeLookups = new Map<number, Uint8ClampedArray>();

/**
 * Draws `image` at the brightness the native fade reaches after `step` of
 * `steps` DAC writes. Step 0 is fully dark and step `steps - 1` is untouched,
 * matching the `-63..0` sweep at 0000:31B4.
 */
export function drawFadedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  step: number,
  steps: number,
): void {
  const offset = Math.min(0, Math.round(step - (steps - 1)));
  if (offset === 0) {
    context.drawImage(image, x, y);
    return;
  }
  if (offset <= -63) return;
  let table = fadeLookups.get(offset);
  if (!table) {
    table = fadeLookup(offset);
    fadeLookups.set(offset, table);
  }
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const source = scratchContext(width, height);
  source.drawImage(image, 0, 0);
  const frame = source.getImageData(0, 0, width, height);
  const { data } = frame;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = table[data[index]];
    data[index + 1] = table[data[index + 1]];
    data[index + 2] = table[data[index + 2]];
  }
  source.putImageData(frame, 0, 0);
  context.drawImage(source.canvas, x, y);
}

/**
 * Blits `image` through dissolve pattern `step`. The pattern row is chosen by
 * the destination scanline and its bit by the destination column, so successive
 * nested steps accumulate into a complete picture without clearing.
 */
export function drawDissolvedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  step: number,
): void {
  const pattern = STARTUP_DISSOLVE_PATTERNS[step];
  if (!pattern) throw new Error(`unknown startup dissolve step ${step}`);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const source = scratchContext(width, height);
  source.drawImage(image, 0, 0);
  const frame = source.getImageData(0, 0, width, height);
  const { data } = frame;
  for (let row = 0; row < height; row += 1) {
    const bits = pattern[(y + row) & 7];
    for (let column = 0; column < width; column += 1) {
      if ((bits & (0x80 >>> ((x + column) & 7))) !== 0) continue;
      data[(row * width + column) * 4 + 3] = 0;
    }
  }
  source.putImageData(frame, 0, 0);
  context.drawImage(source.canvas, x, y);
}

/**
 * Draws a generated `[glyphIndex, x, ...]` pair list at `y`. Module 23 uses
 * palette index 15, which is pure white in every startup palette.
 */
export function drawStartupGlyphs(
  context: CanvasRenderingContext2D,
  font: HTMLImageElement,
  glyphs: readonly number[],
  y: number,
): void {
  const { glyphWidth, glyphHeight, columns } = STARTUP_FONT;
  for (let index = 0; index < glyphs.length; index += 2) {
    const glyph = glyphs[index];
    context.drawImage(
      font,
      (glyph % columns) * glyphWidth,
      Math.floor(glyph / columns) * glyphHeight,
      glyphWidth,
      glyphHeight,
      glyphs[index + 1],
      y,
      glyphWidth,
      glyphHeight,
    );
  }
}
