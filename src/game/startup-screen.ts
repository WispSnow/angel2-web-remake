import {
  STARTUP_DISSOLVE_PATTERNS,
  STARTUP_FONT,
  STARTUP_INTRO,
  STARTUP_MENU_LABELS,
  STARTUP_PRETITLE,
  STARTUP_TEXT,
  STARTUP_TITLE,
} from "./content/startup.generated";
import {
  loadStagedRenderImage,
  stagedRenderAssetSource,
} from "./staged-render-asset-cache";

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

export const STARTUP_IMAGE_URLS = [
  STARTUP_FONT.src,
  STARTUP_PRETITLE.src,
  ...STARTUP_INTRO.backgrounds.map(({ src }) => src),
  STARTUP_TITLE.background,
  ...STARTUP_TITLE.variants.flatMap(({ upper, lower }) => [upper, lower]),
  STARTUP_MENU_LABELS.title.frame.src,
  STARTUP_MENU_LABELS.difficulty.frame.src,
] as const;

export function loadStartupImage(src: string): Promise<HTMLImageElement> {
  const staged = loadStagedRenderImage(src);
  if (staged) return staged;
  const cached = imageCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.src = stagedRenderAssetSource(src);
    void image.decode().then(() => resolve(image), () => {
      reject(new Error(`startup asset ${src} failed to decode`));
    });
  });
  imageCache.set(src, pending);
  void pending.catch(() => {
    if (imageCache.get(src) === pending) imageCache.delete(src);
  });
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

/** Scanlines `[top, bottom)` a row may occupy; anything else is masked away. */
export interface StartupGlyphBand {
  readonly top: number;
  readonly bottom: number;
}

/**
 * The slice of a `rows`-tall row at `y` that survives `band`, or `undefined`
 * when it is masked away completely. The scrolling intro needs this because
 * 0000:11DA paints two colour-0 bars over the ends of the text band after
 * drawing the rows: a row entering at the bottom shows only its top scanline,
 * gains one more per scroll update until it clears the lower bar, and slides
 * back under the upper bar the same way.
 */
export function clipStartupGlyphRow(
  y: number,
  band: StartupGlyphBand,
  rows: number = STARTUP_FONT.glyphHeight,
): { sourceY: number; y: number; height: number } | undefined {
  const top = Math.max(y, band.top);
  const bottom = Math.min(y + rows, band.bottom);
  if (bottom <= top) return undefined;
  return { sourceY: top - y, y: top, height: bottom - top };
}

/**
 * The black outline 0000:2F96 builds per glyph: the cell OR-ed into a cleared
 * 17-row buffer at row offsets 0, 1 and 2. Cached per font image, laid out on
 * the same column grid as the white atlas but with the taller row pitch.
 */
let outlineAtlas: { source: HTMLImageElement; canvas: HTMLCanvasElement } | undefined;

function outlineAtlasFor(font: HTMLImageElement): HTMLCanvasElement {
  if (outlineAtlas?.source === font) return outlineAtlas.canvas;
  const { glyphWidth, glyphHeight, columns, glyphCount } = STARTUP_FONT;
  const { outlineRows, dilationRowOffsets, outlineColor } = STARTUP_TEXT;
  const canvas = document.createElement("canvas");
  canvas.width = columns * glyphWidth;
  canvas.height = Math.ceil(glyphCount / columns) * outlineRows;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("startup text outline needs a 2D context");
  context.imageSmoothingEnabled = false;
  for (let glyph = 0; glyph < glyphCount; glyph += 1) {
    const sourceX = (glyph % columns) * glyphWidth;
    const sourceY = Math.floor(glyph / columns) * glyphHeight;
    const targetY = Math.floor(glyph / columns) * outlineRows;
    for (const offset of dilationRowOffsets) {
      context.drawImage(
        font, sourceX, sourceY, glyphWidth, glyphHeight,
        sourceX, targetY + offset, glyphWidth, glyphHeight,
      );
    }
  }
  // The atlas is white on transparent; recolour the union in one pass.
  context.globalCompositeOperation = "source-in";
  context.fillStyle = outlineColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  outlineAtlas = { source: font, canvas };
  return canvas;
}

/**
 * Draws a generated `[glyphIndex, x, ...]` pair list for a cursor at `y`,
 * keeping only the scanlines inside `band` when one is given.
 *
 * 0000:2CCE draws each character three times: the dilated outline in colour 0 at
 * `(x, y)` and `(x+2, y)`, then the cell itself in colour 15 at `(x+1, y+1)`. On
 * the intro's black band the outline is invisible, but it is the whole reason a
 * highlighted menu label stays readable over the 50% stipple drawn under it.
 */
export function drawStartupGlyphs(
  context: CanvasRenderingContext2D,
  font: HTMLImageElement,
  glyphs: readonly number[],
  y: number,
  band?: StartupGlyphBand,
): void {
  const { glyphWidth, glyphHeight, columns } = STARTUP_FONT;
  const { outlineRows, outlinePasses, glyphOffset } = STARTUP_TEXT;
  const outline = outlineAtlasFor(font);
  const blit = (
    atlas: CanvasImageSource,
    rows: number,
    dx: number,
    dy: number,
  ) => {
    const slice = band
      ? clipStartupGlyphRow(y + dy, band, rows)
      : { sourceY: 0, y: y + dy, height: rows };
    if (!slice) return;
    for (let index = 0; index < glyphs.length; index += 2) {
      const glyph = glyphs[index];
      context.drawImage(
        atlas,
        (glyph % columns) * glyphWidth,
        Math.floor(glyph / columns) * rows + slice.sourceY,
        glyphWidth,
        slice.height,
        glyphs[index + 1] + dx,
        slice.y,
        glyphWidth,
        slice.height,
      );
    }
  };
  for (const pass of outlinePasses) blit(outline, outlineRows, pass.dx, pass.dy);
  blit(font, glyphHeight, glyphOffset.dx, glyphOffset.dy);
}
