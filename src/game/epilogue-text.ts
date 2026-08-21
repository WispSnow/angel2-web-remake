import {
  STAGE49_EPILOGUE_FONT,
  STAGE49_EPILOGUE_LAYOUT,
} from "./content/stage49-ending";
import { prepareDomImageElements } from "./dom-image-readiness";
import { stagedRenderAssetSource } from "./staged-render-asset-cache";

/**
 * Native module 35 renders the epilogue with the 258-glyph `UN/9`+`UN/10`
 * bitmap font rather than any system font, and draws every glyph three times:
 * the row-smeared shape at `(X,Y)` and `(X+2,Y)` in palette index 0, then the
 * crisp shape at `(X+1,Y+1)` in index 15 (0000:1AD2-1B18). Relative to the ink
 * that is the same shape repeated at `STAGE49_EPILOGUE_LAYOUT.shadowOffsets`,
 * which is what gives the text its dark halo and lets the original get away
 * without a text window.
 *
 * The atlas ships as white-on-transparent, so each colour is produced once per
 * segment by compositing a tinted copy and reused for every glyph.
 */

let fontPromise: Promise<HTMLImageElement> | undefined;
const tintedAtlases = new Map<string, HTMLCanvasElement>();

export function loadEpilogueFont(): Promise<HTMLImageElement> {
  if (fontPromise) return fontPromise;
  const pending = (async () => {
    const image = new Image();
    image.decoding = "sync";
    image.dataset.stagedAssetUrl = STAGE49_EPILOGUE_FONT.src;
    image.src = stagedRenderAssetSource(STAGE49_EPILOGUE_FONT.src);
    await prepareDomImageElements([image]);
    return image;
  })();
  fontPromise = pending;
  void pending.catch(() => {
    if (fontPromise === pending) fontPromise = undefined;
  });
  return pending;
}

function tintedAtlas(font: HTMLImageElement, color: string): HTMLCanvasElement {
  const cached = tintedAtlases.get(color);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = font.naturalWidth;
  canvas.height = font.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("epilogue font tinting needs a 2D context");
  context.imageSmoothingEnabled = false;
  context.drawImage(font, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  tintedAtlases.set(color, canvas);
  return canvas;
}

function blit(
  context: CanvasRenderingContext2D,
  atlas: HTMLCanvasElement,
  glyph: number,
  x: number,
  y: number,
): void {
  const { glyphWidth, glyphHeight, columns } = STAGE49_EPILOGUE_FONT;
  context.drawImage(
    atlas,
    (glyph % columns) * glyphWidth,
    Math.floor(glyph / columns) * glyphHeight,
    glyphWidth,
    glyphHeight,
    x,
    y,
    glyphWidth,
    glyphHeight,
  );
}

/**
 * Redraws the first `revealed` glyphs of a variant. `glyphs` is the generated
 * flat `[glyphIndex, x, y, ...]` triple list, already resolved to native pixel
 * positions, so nothing here re-derives Big5 widths or line breaks.
 */
export function drawEpilogueGlyphs(
  canvas: HTMLCanvasElement,
  font: HTMLImageElement,
  glyphs: readonly number[],
  revealed: number,
  colors: { readonly ink: string; readonly shadow: string },
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const shadow = tintedAtlas(font, colors.shadow);
  const ink = tintedAtlas(font, colors.ink);
  const count = Math.max(0, Math.min(revealed, glyphs.length / 3));
  const [inkX, inkY] = STAGE49_EPILOGUE_LAYOUT.inkOffset;
  for (const [offsetX, offsetY] of STAGE49_EPILOGUE_LAYOUT.shadowOffsets) {
    for (let index = 0; index < count; index += 1) {
      const base = index * 3;
      blit(
        context,
        shadow,
        glyphs[base],
        glyphs[base + 1] + inkX + offsetX,
        glyphs[base + 2] + inkY + offsetY,
      );
    }
  }
  for (let index = 0; index < count; index += 1) {
    const base = index * 3;
    blit(context, ink, glyphs[base], glyphs[base + 1] + inkX, glyphs[base + 2] + inkY);
  }
}
