import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ScreenshotPixels {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  /** Row-major, `channels` bytes per pixel. */
  readonly pixels: Buffer;
}

/**
 * Decodes a Playwright screenshot so a test can assert on actual composited
 * device pixels. Unlike the generated assets in `tests/unit`, screenshots come
 * back with real per-row filters, so every filter type has to be reversed here.
 */
export function decodeScreenshot(png: Buffer): ScreenshotPixels {
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("screenshot is not a PNG");
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  const interlace = png[28];
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bitDepth !== 8 || channels === 0 || interlace !== 0) {
    throw new Error(`unsupported screenshot PNG: depth ${bitDepth}, color type ${colorType}`);
  }

  const idatParts: Buffer[] = [];
  for (let offset = PNG_SIGNATURE.length; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.subarray(offset + 4, offset + 8).toString("ascii") === "IDAT") {
      idatParts.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  const scanlines = inflateSync(Buffer.concat(idatParts));
  const stride = width * channels;
  if (scanlines.length !== (stride + 1) * height) {
    throw new Error("screenshot has unexpected scanline bytes");
  }

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const target = y * stride;
    const above = target - stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = scanlines[source + x];
      const left = x >= channels ? pixels[target + x - channels] : 0;
      const up = y > 0 ? pixels[above + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[above + x - channels] : 0;
      let value: number;
      switch (filter) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + ((left + up) >> 1); break;
        case 4: {
          const estimate = left + up - upLeft;
          const distanceLeft = Math.abs(estimate - left);
          const distanceUp = Math.abs(estimate - up);
          const distanceUpLeft = Math.abs(estimate - upLeft);
          const predictor = distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft
            ? left
            : distanceUp <= distanceUpLeft ? up : upLeft;
          value = raw + predictor;
          break;
        }
        default: throw new Error(`unsupported PNG filter ${filter}`);
      }
      pixels[target + x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/**
 * Mean `green - (red + blue) / 2` down one device-pixel column. The battlefield
 * terrain is green while the statue and window frame are warm greys, so this
 * separates "map pixels leaked into the frame" from ordinary frame shading far
 * more reliably than a raw colour distance.
 */
export function columnGreenExcess(
  shot: ScreenshotPixels,
  x: number,
  firstRow: number,
  lastRow: number,
): number {
  let total = 0;
  for (let y = firstRow; y < lastRow; y += 1) {
    const offset = (y * shot.width + x) * shot.channels;
    total += shot.pixels[offset + 1] - (shot.pixels[offset] + shot.pixels[offset + 2]) / 2;
  }
  return total / (lastRow - firstRow);
}

/**
 * Mean Rec. 709 luminance along one device-pixel row or column. Where two
 * layers abut on a fractional device pixel, each side only half-covers the
 * shared line and whatever sits behind shows through the rest, so the seam
 * reads as a single line darker than both of its neighbours.
 */
export function rowMeanLuminance(
  shot: ScreenshotPixels,
  y: number,
  firstColumn: number,
  lastColumn: number,
): number {
  let total = 0;
  for (let x = firstColumn; x < lastColumn; x += 1) {
    const offset = (y * shot.width + x) * shot.channels;
    total += .2126 * shot.pixels[offset]
      + .7152 * shot.pixels[offset + 1]
      + .0722 * shot.pixels[offset + 2];
  }
  return total / (lastColumn - firstColumn);
}

export function columnMeanLuminance(
  shot: ScreenshotPixels,
  x: number,
  firstRow: number,
  lastRow: number,
): number {
  let total = 0;
  for (let y = firstRow; y < lastRow; y += 1) {
    const offset = (y * shot.width + x) * shot.channels;
    total += .2126 * shot.pixels[offset]
      + .7152 * shot.pixels[offset + 1]
      + .0722 * shot.pixels[offset + 2];
  }
  return total / (lastRow - firstRow);
}
