import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Reads the distinct opaque `r,g,b` values of a postgame plate. The reverse
 * planar renderer always emits non-interlaced 8-bit RGBA with filter 0, so the
 * scanlines need no unfiltering; anything else means the render pipeline
 * changed and the caller should be told rather than silently mis-decoded.
 */
export async function opaquePlateColors(assetPath: string): Promise<Set<string>> {
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
  const colors = new Set<string>();
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    if (scanlines[row] !== 0) throw new Error(`${assetPath} row ${y} uses PNG filter ${scanlines[row]}`);
    for (let x = 0; x < stride; x += 4) {
      if (scanlines[row + 1 + x + 3] === 0) continue;
      colors.add(`${scanlines[row + 1 + x]},${scanlines[row + 2 + x]},${scanlines[row + 3 + x]}`);
    }
  }
  return colors;
}

export function paletteKeys(colors: readonly (readonly number[])[]): Set<string> {
  return new Set(colors.map(([red, green, blue]) => `${red},${green},${blue}`));
}
