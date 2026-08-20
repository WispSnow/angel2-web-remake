import {
  NATIVE_FONT,
  NATIVE_FONT_CHARACTERS,
  NATIVE_GAMEPLAY_PALETTE,
  NATIVE_TEXT,
} from "./content/native-font.generated";

/**
 * Module 29's string drawer (`0000:EA04`), reproduced for the battle HUD, the
 * round panel and the bottom stage label.
 *
 * The DOM cannot express any of it: the cursor advances by fixed native pixels
 * rather than by glyph metrics (16 for a Big5 cell, 9 for a half-width one, 8
 * for a space, 72 for a tab), the outline is a vertically dilated copy of the
 * cell stamped twice beside the ink rather than a `text-shadow`, and the two
 * fonts are bitmaps: the merged original 16x15 glyph set and the BIOS 8x8 ROM
 * cells the original stretches to 8x16 for digits and punctuation.
 *
 * Only presentation lives here. Every value drawn is formatted from a
 * simulation snapshot by the caller, exactly as the native panel formats
 * `DS:319F`-style words into its templates before drawing them.
 */

export type NativeTextMode = "normal" | "compact";

export interface NativeTextStyle {
  /** Defaults to the battle ink colour, gameplay palette index 15. */
  readonly ink?: string;
  /** Defaults to the battle outline colour, gameplay palette index 0. */
  readonly outline?: string;
  /**
   * `compact` is the `CS:ECAD = 'N'` mode the native HUD switches into for the
   * status counters: undoubled ROM rows, an extra four-way colour-0 halo and an
   * 8-pixel advance.
   */
  readonly mode?: NativeTextMode;
}

export const NATIVE_INK_COLOR = NATIVE_GAMEPLAY_PALETTE[NATIVE_TEXT.colors.battleInkIndex];
export const NATIVE_OUTLINE_COLOR = NATIVE_GAMEPLAY_PALETTE[NATIVE_TEXT.colors.battleOutlineIndex];

const OUTLINE_CELL_HEIGHT = NATIVE_FONT.cellHeight + 2;

const glyphIndex = new Map<string, number>();
for (const [index, character] of [...NATIVE_FONT_CHARACTERS].entries()) {
  glyphIndex.set(character, index);
}

let fontPromise: Promise<HTMLImageElement> | undefined;
let font: HTMLImageElement | undefined;

/** Resolves once the atlas is decoded; `nativeFont()` returns it synchronously after that. */
export function loadNativeFont(): Promise<HTMLImageElement> {
  fontPromise ??= new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      font = image;
      resolve(image);
    }, { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error(`native font ${NATIVE_FONT.src} failed to load`)),
      { once: true },
    );
    image.src = NATIVE_FONT.src;
  });
  return fontPromise;
}

export const nativeFont = (): HTMLImageElement | undefined => font;

const inkAtlases = new Map<string, HTMLCanvasElement>();
const outlineAtlases = new Map<string, HTMLCanvasElement>();

function tint(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, color: string): void {
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";
}

function atlasContext(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("native text needs a 2D context");
  context.imageSmoothingEnabled = false;
  return [canvas, context];
}

function inkAtlasFor(source: HTMLImageElement, color: string): HTMLCanvasElement {
  const cached = inkAtlases.get(color);
  if (cached) return cached;
  const [canvas, context] = atlasContext(source.width, source.height);
  context.drawImage(source, 0, 0);
  tint(canvas, context, color);
  inkAtlases.set(color, canvas);
  return canvas;
}

/**
 * `0000:ECCC` and `0000:ED03` build the outline by OR-ing the cell into a
 * cleared buffer at row offsets 0/1/2 for a Big5 cell and 0/2 for a half-width
 * one, so the mask is the glyph grown downwards. Drawing the same transparent
 * cell repeatedly is the canvas equivalent of that OR.
 */
function outlineAtlasFor(source: HTMLImageElement, color: string): HTMLCanvasElement {
  const cached = outlineAtlases.get(color);
  if (cached) return cached;
  const rows = Math.ceil(source.height / NATIVE_FONT.cellHeight);
  const [canvas, context] = atlasContext(source.width, rows * OUTLINE_CELL_HEIGHT);
  const cells = rows * NATIVE_FONT.columns;
  for (let cell = 0; cell < cells; cell += 1) {
    const column = cell % NATIVE_FONT.columns;
    const row = Math.floor(cell / NATIVE_FONT.columns);
    const offsets = cell < NATIVE_FONT.fullWidthCount
      ? NATIVE_TEXT.outline.fullWidth.dilationRowOffsets
      : NATIVE_TEXT.outline.halfWidth.dilationRowOffsets;
    for (const offset of offsets) {
      context.drawImage(
        source,
        column * NATIVE_FONT.cellWidth,
        row * NATIVE_FONT.cellHeight,
        NATIVE_FONT.cellWidth,
        NATIVE_FONT.cellHeight,
        column * NATIVE_FONT.cellWidth,
        row * OUTLINE_CELL_HEIGHT + offset,
        NATIVE_FONT.cellWidth,
        NATIVE_FONT.cellHeight,
      );
    }
  }
  tint(canvas, context, color);
  outlineAtlases.set(color, canvas);
  return canvas;
}

export interface NativeGlyph {
  readonly cell: number;
  readonly x: number;
  readonly y: number;
  readonly halfWidth: boolean;
}

export interface NativeTextLayout {
  readonly glyphs: readonly NativeGlyph[];
  /** Cursor position after the last consumed character, in native pixels. */
  readonly x: number;
  readonly y: number;
  /** Rightmost pixel the ink pass touches, so callers can assert the fit. */
  readonly right: number;
}

function halfWidthCell(code: number): number | undefined {
  const offset = code - NATIVE_FONT.halfWidthFirstCode;
  if (offset < 0 || offset >= NATIVE_FONT.halfWidthCount) return undefined;
  return NATIVE_FONT.halfWidthBase + offset;
}

/**
 * Runs the native cursor over `text` from `(x, y)` without drawing, so layout
 * can be asserted in unit tests that have no canvas.
 */
export function layoutNativeText(
  text: string,
  x: number,
  y: number,
  mode: NativeTextMode = "normal",
): NativeTextLayout {
  const startX = x;
  const glyphs: NativeGlyph[] = [];
  let cursorX = x;
  let cursorY = y;
  let right = x;
  for (const character of text) {
    if ((NATIVE_TEXT.terminators as readonly string[]).includes(character)) break;
    if (character === NATIVE_TEXT.lineFeed.character) {
      cursorX = startX;
      cursorY += NATIVE_TEXT.lineFeed.deltaY;
      continue;
    }
    if (character === "\t") { cursorX += NATIVE_TEXT.advances.tab; continue; }
    if (character === " ") { cursorX += NATIVE_TEXT.advances.space; continue; }
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) {
      const cell = halfWidthCell(code);
      if (cell !== undefined) {
        glyphs.push({ cell, x: cursorX, y: cursorY, halfWidth: true });
        right = Math.max(right, cursorX + NATIVE_FONT.halfWidthWidth + 2);
      }
      cursorX += mode === "compact"
        ? NATIVE_TEXT.advances.halfWidthCompact
        : NATIVE_TEXT.advances.halfWidth;
      continue;
    }
    // A character the original font never carried has no bitmap to draw. The
    // native lookup would return whatever index its scan stopped on, so the
    // remake skips the cell and keeps the cursor on the native grid instead.
    const cell = glyphIndex.get(character);
    if (cell !== undefined) {
      glyphs.push({ cell, x: cursorX, y: cursorY, halfWidth: false });
      right = Math.max(right, cursorX + NATIVE_FONT.cellWidth + 2);
    }
    cursorX += NATIVE_TEXT.advances.fullWidth;
  }
  return { glyphs, x: cursorX, y: cursorY, right };
}

function blit(
  context: CanvasRenderingContext2D,
  atlas: CanvasImageSource,
  cellHeight: number,
  glyph: NativeGlyph,
  rows: number,
  dx: number,
  dy: number,
): void {
  const column = glyph.cell % NATIVE_FONT.columns;
  const row = Math.floor(glyph.cell / NATIVE_FONT.columns);
  context.drawImage(
    atlas,
    column * NATIVE_FONT.cellWidth,
    row * cellHeight,
    NATIVE_FONT.cellWidth,
    rows,
    glyph.x + dx,
    glyph.y + dy,
    NATIVE_FONT.cellWidth,
    rows,
  );
}

/**
 * `0000:EA04` draws every character three times: the dilated outline at
 * `(x, y)` and `(x+2, y)`, then the cell itself at `(x+1, y+1)`. Compact mode
 * adds four colour-0 passes around the outline first, which is what keeps the
 * status counters readable on top of their icons.
 */
export function drawNativeText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: NativeTextStyle = {},
): NativeTextLayout {
  const source = font;
  const layout = layoutNativeText(text, x, y, style.mode ?? "normal");
  if (!source) return layout;
  const ink = inkAtlasFor(source, style.ink ?? NATIVE_INK_COLOR);
  const outline = outlineAtlasFor(source, style.outline ?? NATIVE_OUTLINE_COLOR);
  const halo = style.mode === "compact"
    ? outlineAtlasFor(source, NATIVE_GAMEPLAY_PALETTE[NATIVE_TEXT.outline.compactHalo.colorIndex])
    : undefined;
  const previousSmoothing = context.imageSmoothingEnabled;
  context.imageSmoothingEnabled = false;
  for (const glyph of layout.glyphs) {
    const maskRows = glyph.halfWidth
      ? NATIVE_TEXT.outline.halfWidth.maskRows
      : NATIVE_TEXT.outline.fullWidth.maskRows;
    const inkRows = glyph.halfWidth ? NATIVE_FONT.cellHeight : NATIVE_FONT.fullWidthRows;
    if (halo) {
      for (const pass of NATIVE_TEXT.outline.compactHalo.passes) {
        blit(context, halo, OUTLINE_CELL_HEIGHT, glyph, maskRows, pass.dx, pass.dy);
      }
    }
    for (const pass of NATIVE_TEXT.outline.passes) {
      blit(context, outline, OUTLINE_CELL_HEIGHT, glyph, maskRows, pass.dx, pass.dy);
    }
    blit(
      context,
      ink,
      NATIVE_FONT.cellHeight,
      glyph,
      inkRows,
      NATIVE_TEXT.outline.inkOffset.dx,
      NATIVE_TEXT.outline.inkOffset.dy,
    );
  }
  context.imageSmoothingEnabled = previousSmoothing;
  return layout;
}

/**
 * `0000:EF56`: five decimal digits, then leading zeroes become spaces. A value
 * of zero would empty the field, so the last digit is restored — which is why a
 * zero reads as four spaces and a `0` rather than as five blanks.
 */
export function nativeNumericField(value: number): string {
  const width = NATIVE_TEXT.numericFieldCharacters;
  const clamped = Math.max(0, Math.min(10 ** width - 1, Math.trunc(value)));
  const digits = [...String(clamped).padStart(width, "0")];
  for (let index = 0; index < width && digits[index] === "0"; index += 1) digits[index] = " ";
  if (digits[width - 1] === " ") digits[width - 1] = "0";
  return digits.join("");
}

/** The stage-37 branch at `0000:8C24` overwrites a whole numeric field. */
export const NATIVE_CONCEALED_FIELD = "?".repeat(NATIVE_TEXT.numericFieldCharacters);

/**
 * `0000:EFFE` right-aligns the occupation into an eight-byte buffer and
 * `0000:F051` left-aligns the unit name into another, both padded with
 * half-width spaces. A Big5 character costs two bytes, so the padding is
 * `8 - 2 * characters` spaces of 8 pixels each.
 */
export function nativeIdentityField(text: string, align: "left" | "right"): string {
  const bytes = [...text].reduce((total, character) => total + ((character.codePointAt(0) ?? 0) < 0x80 ? 1 : 2), 0);
  const padding = " ".repeat(Math.max(0, NATIVE_TEXT.identityFieldBytes - bytes));
  return align === "right" ? `${padding}${text}` : `${text}${padding}`;
}

/** Substitutes formatted values into a `00000`-templated stat row. */
export function nativeStatRow(template: string, fields: readonly string[]): string {
  let index = 0;
  return template.replaceAll("0".repeat(NATIVE_TEXT.numericFieldCharacters), () => fields[index++] ?? "");
}

/**
 * `0000:88E4` converts the round into the same five-character field and copies
 * only its last three characters into the visible template, so the panel can
 * never show more than three digits.
 */
export function nativeRoundLine(template: string, digitIndices: readonly number[], round: number): string {
  const field = [...nativeNumericField(round)].slice(-digitIndices.length);
  const characters = [...template];
  for (const [slot, index] of digitIndices.entries()) characters[index] = field[slot] ?? " ";
  return characters.join("");
}
