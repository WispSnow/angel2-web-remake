import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PlatePixels {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, four bytes per pixel. */
  readonly pixels: Buffer;
}

/**
 * Decodes a postgame PNG. The reverse planar renderer and the epilogue font
 * generator both emit non-interlaced 8-bit RGBA with filter 0, so the scanlines
 * need no unfiltering; anything else means the pipeline changed and the caller
 * should be told rather than silently mis-decoded.
 */
export async function readPlatePixels(assetPath: string): Promise<PlatePixels> {
  const png = await readFile(path.join(workspace, "public", assetPath));
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${assetPath} is not a PNG`);
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) {
    throw new Error(`${assetPath} is not a non-interlaced 8-bit RGBA PNG`);
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
  const stride = width * 4;
  if (scanlines.length !== (stride + 1) * height) {
    throw new Error(`${assetPath} has unexpected scanline bytes`);
  }
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    if (scanlines[row] !== 0) throw new Error(`${assetPath} row ${y} uses PNG filter ${scanlines[row]}`);
    scanlines.copy(pixels, y * stride, row + 1, row + 1 + stride);
  }
  return { width, height, pixels };
}

/** The distinct opaque `r,g,b` values of a postgame plate. */
export async function opaquePlateColors(assetPath: string): Promise<Set<string>> {
  const { width, height, pixels } = await readPlatePixels(assetPath);
  const colors = new Set<string>();
  for (let index = 0; index < width * height * 4; index += 4) {
    if (pixels[index + 3] === 0) continue;
    colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
  }
  return colors;
}

export function paletteKeys(colors: readonly (readonly number[])[]): Set<string> {
  return new Set(colors.map(([red, green, blue]) => `${red},${green},${blue}`));
}
