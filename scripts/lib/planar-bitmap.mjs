import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Decode ANGEL2's four-plane bitmap bundles the way the native blitters read
 * them, including the fifth (transparency mask) stream.
 *
 * `reverse/tools/angel2-planar.mjs` already renders every record for visual
 * audit, but it only honours the mask when the whole mask bundle mirrors the
 * colour bundle's layout. Several records — A/6 among them — store a real mask
 * for the handful of images the native draws through the masked writer and a
 * one-row stub for every other slot, so that whole-bundle test drops the mask
 * and the audit PNGs come out opaque. Generators that composite those images
 * need the per-image rule instead, which is what this module implements.
 */

// Native renderers pair descriptor slots +0/+4/+8/+0Ch with Sequencer Map
// Masks 08h/04h/02h/01h, so streams 0..3 are VGA colour bits 3..0.
const STREAM_TO_COLOR_BIT = [3, 2, 1, 0];

const STREAM_COUNT = 5;

/**
 * `0000:D9A5` (colour) and `0000:DC36` (mask) both index the stream with
 * `imageIndex * 2`, read the directory word there as the bitmap offset, and
 * take height and row bytes from the bitmap's own two-word header. Each image
 * therefore ends where the next one begins, and the directory's last entry is
 * an `FFFFh` terminator that only marks the end of the final bitmap.
 */
export function parseBitmapBundle(buffer, label = "bitmap bundle") {
  if (buffer.length < 4) {
    throw new Error(`${label}: bundle is shorter than four bytes`);
  }
  const directoryBytes = buffer.readUInt16LE(0);
  if (directoryBytes < 2 || directoryBytes % 2 !== 0 || directoryBytes > buffer.length - 2) {
    throw new Error(`${label}: invalid bitmap-directory size ${directoryBytes}`);
  }
  const offsets = Array.from({ length: directoryBytes / 2 }, (_, index) =>
    buffer.readUInt16LE(index * 2));
  if (offsets[0] !== directoryBytes) {
    throw new Error(`${label}: first bitmap offset does not equal directory size`);
  }
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index] <= offsets[index - 1]) {
      throw new Error(`${label}: bitmap offsets are not strictly increasing`);
    }
  }
  const terminatorOffset = offsets.at(-1);
  if (terminatorOffset + 2 !== buffer.length || buffer.readUInt16LE(terminatorOffset) !== 0xffff) {
    throw new Error(`${label}: missing final FFFFh bitmap terminator`);
  }

  const images = [];
  for (let index = 0; index + 1 < offsets.length; index += 1) {
    const offset = offsets[index];
    const end = offsets[index + 1];
    if (end - offset < 4) {
      throw new Error(`${label}: bitmap ${index} is shorter than its header`);
    }
    const height = buffer.readUInt16LE(offset);
    const rowBytes = buffer.readUInt16LE(offset + 2);
    if (offset + 4 + height * rowBytes !== end) {
      throw new Error(`${label}: bitmap ${index} bounds do not match ${height} * ${rowBytes}`);
    }
    images.push({
      index,
      width: rowBytes * 8,
      height,
      rowBytes,
      pixels: buffer.subarray(offset + 4, end),
    });
  }
  return { images };
}

const sameLayout = (left, right) => left.width === right.width
  && left.height === right.height
  && left.rowBytes === right.rowBytes;

/** Read one decoded `five_stream_package` record directory (`00.raw`..`04.raw`). */
export async function readPlanarRecord(directory) {
  const label = path.basename(directory);
  const bundles = await Promise.all(
    Array.from({ length: STREAM_COUNT }, (_, stream) =>
      readFile(path.join(directory, `${String(stream).padStart(2, "0")}.raw`))
        .then((buffer) => parseBitmapBundle(buffer, `${label}/${stream}`))),
  );
  const colorPlanes = bundles.slice(0, 4);
  // The four colour planes are one image cut into VGA bit planes, so a layout
  // difference between them means the record is not what this decoder assumes.
  for (const [stream, bundle] of colorPlanes.slice(1).entries()) {
    const matches = bundle.images.length === colorPlanes[0].images.length
      && bundle.images.every((image, index) => sameLayout(image, colorPlanes[0].images[index]));
    if (!matches) {
      throw new Error(`${label}: colour stream ${stream + 1} has a different bitmap layout`);
    }
  }
  return { label, colorPlanes, mask: bundles[4] };
}

/**
 * Compose one image as straight RGBA.
 *
 * The mask entry only applies when it covers the same pixels as the colour
 * entry. The masked writer at `0000:D9FE` ANDs the four planes with the mask
 * bitmap using the mask's own header, so a stub entry would punch holes into a
 * single scanline instead of describing transparency; those slots belong to the
 * unmasked writer at `0000:D5CF` and stay fully opaque here.
 */
export function composePlanarFrame(record, imageIndex, paletteColors) {
  const image = record.colorPlanes[0].images[imageIndex];
  if (!image) throw new Error(`${record.label}: no image ${imageIndex}`);
  const maskImage = record.mask.images[imageIndex];
  const maskUsed = maskImage !== undefined && sameLayout(maskImage, image);

  const pixels = Buffer.alloc(image.width * image.height * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const byteOffset = y * image.rowBytes + (x >>> 3);
      const bit = 0x80 >>> (x & 7);
      let paletteIndex = 0;
      for (let plane = 0; plane < 4; plane += 1) {
        if ((record.colorPlanes[plane].images[imageIndex].pixels[byteOffset] & bit) !== 0) {
          paletteIndex |= 1 << STREAM_TO_COLOR_BIT[plane];
        }
      }
      const target = (y * image.width + x) * 4;
      const [red, green, blue] = paletteColors[paletteIndex];
      pixels[target] = red;
      pixels[target + 1] = green;
      pixels[target + 2] = blue;
      // A set mask bit leaves the background standing, so it is the transparent
      // state; the colour pass then ORs zeroes over exactly those pixels.
      pixels[target + 3] = maskUsed && (maskImage.pixels[byteOffset] & bit) !== 0 ? 0 : 255;
    }
  }
  return { width: image.width, height: image.height, pixels, maskUsed };
}
