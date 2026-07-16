#!/usr/bin/env node

import { deflateSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const EGA_PALETTE = [
  [0x00, 0x00, 0x00], [0x00, 0x00, 0xaa],
  [0x00, 0xaa, 0x00], [0x00, 0xaa, 0xaa],
  [0xaa, 0x00, 0x00], [0xaa, 0x00, 0xaa],
  [0xaa, 0x55, 0x00], [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55], [0x55, 0x55, 0xff],
  [0x55, 0xff, 0x55], [0x55, 0xff, 0xff],
  [0xff, 0x55, 0x55], [0xff, 0x55, 0xff],
  [0xff, 0xff, 0x55], [0xff, 0xff, 0xff],
];

function dacPalette(values) {
  if (values.length !== 48) {
    throw new Error(`a 16-color DAC palette must contain 48 values, got ${values.length}`);
  }
  return Array.from({ length: 16 }, (_, index) =>
    values.slice(index * 3, index * 3 + 3).map((value) =>
      Math.round(value * 255 / 63)));
}

// Recovered from the runtime image's DS-relative data. The native routine at
// module offset 31E0h writes all 16 RGB triples to VGA DAC ports 3C8h/3C9h.
const PALETTES = {
  gameplay: {
    colors: dacPalette([
      0x00, 0x00, 0x00, 0x17, 0x10, 0x0c,
      0x28, 0x1d, 0x14, 0x39, 0x22, 0x11,
      0x3f, 0x2f, 0x1a, 0x3f, 0x36, 0x2a,
      0x3d, 0x27, 0x27, 0x2e, 0x2a, 0x26,
      0x00, 0x00, 0x29, 0x13, 0x22, 0x3f,
      0x2e, 0x18, 0x3f, 0x3b, 0x08, 0x09,
      0x0a, 0x20, 0x00, 0x2b, 0x39, 0x0a,
      0x3f, 0x37, 0x04, 0x3f, 0x3f, 0x3f,
    ]),
    evidence: "runtime main-module offset 9CA8h; written by routine 31E0h",
  },
  intro: {
    colors: dacPalette([
      0x00, 0x00, 0x00, 0x26, 0x26, 0x2a,
      0x1d, 0x1d, 0x22, 0x33, 0x2e, 0x33,
      0x19, 0x15, 0x19, 0x15, 0x15, 0x19,
      0x22, 0x19, 0x1d, 0x37, 0x2a, 0x2a,
      0x2e, 0x22, 0x22, 0x26, 0x19, 0x1d,
      0x19, 0x15, 0x19, 0x22, 0x1d, 0x22,
      0x33, 0x2a, 0x2a, 0x3b, 0x33, 0x33,
      0x3f, 0x3b, 0x3b, 0x3f, 0x3f, 0x3f,
    ]),
    evidence: "runtime main-module offset 9A10h; written by routine 31E0h",
  },
  ega: {
    colors: EGA_PALETTE,
    evidence: "standard EGA fallback; not the native ANGEL2 gameplay palette",
  },
};

function parseBitmapBundle(buffer, fileName = "bitmap bundle") {
  if (buffer.length < 4) {
    throw new Error(`${fileName}: bundle is shorter than four bytes`);
  }
  const directoryBytes = buffer.readUInt16LE(0);
  if (directoryBytes < 2 || directoryBytes % 2 !== 0 || directoryBytes > buffer.length - 2) {
    throw new Error(`${fileName}: invalid bitmap-directory size ${directoryBytes}`);
  }
  const offsets = Array.from({ length: directoryBytes / 2 }, (_, index) =>
    buffer.readUInt16LE(index * 2));
  if (offsets[0] !== directoryBytes) {
    throw new Error(`${fileName}: first bitmap offset does not equal directory size`);
  }
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index] <= offsets[index - 1]) {
      throw new Error(`${fileName}: bitmap offsets are not strictly increasing`);
    }
  }
  const terminatorOffset = offsets.at(-1);
  if (terminatorOffset + 2 !== buffer.length || buffer.readUInt16LE(terminatorOffset) !== 0xffff) {
    throw new Error(`${fileName}: missing final FFFFh bitmap terminator`);
  }

  const images = [];
  for (let index = 0; index + 1 < offsets.length; index += 1) {
    const offset = offsets[index];
    const end = offsets[index + 1];
    if (end - offset < 4) {
      throw new Error(`${fileName}: bitmap ${index} is shorter than its header`);
    }
    const height = buffer.readUInt16LE(offset);
    const rowBytes = buffer.readUInt16LE(offset + 2);
    const pixelBytes = height * rowBytes;
    if (offset + 4 + pixelBytes !== end) {
      throw new Error(
        `${fileName}: bitmap ${index} bounds do not match ${height} * ${rowBytes}`,
      );
    }
    images.push({
      index,
      offset,
      end,
      width: rowBytes * 8,
      height,
      rowBytes,
      pixels: buffer.subarray(offset + 4, end),
    });
  }
  return { directoryBytes, offsets, images };
}

function sameLayout(left, right) {
  return left.images.length === right.images.length && left.images.every(
    (image, index) => image.width === right.images[index].width &&
      image.height === right.images[index].height &&
      image.rowBytes === right.images[index].rowBytes,
  );
}

function rawBitmapBundle(buffer, width, fileName = "raw bitmap plane") {
  if (width <= 0 || width % 8 !== 0) {
    throw new Error(`${fileName}: raw bitmap width must be a positive multiple of eight`);
  }
  const rowBytes = width / 8;
  if (buffer.length % rowBytes !== 0) {
    throw new Error(`${fileName}: raw plane size is not divisible by ${rowBytes}`);
  }
  return {
    directoryBytes: null,
    offsets: null,
    images: [{
      index: 0,
      offset: 0,
      end: buffer.length,
      width,
      height: buffer.length / rowBytes,
      rowBytes,
      pixels: buffer,
    }],
  };
}

function rawTileBundle(buffer, width, height, fileName = "raw tile plane") {
  if (width <= 0 || width % 8 !== 0 || height <= 0) {
    throw new Error(`${fileName}: raw tile dimensions are invalid`);
  }
  const rowBytes = width / 8;
  const tileBytes = rowBytes * height;
  if (buffer.length % tileBytes !== 0) {
    throw new Error(`${fileName}: raw plane size is not divisible by ${tileBytes}`);
  }
  return {
    directoryBytes: null,
    offsets: null,
    images: Array.from({ length: buffer.length / tileBytes }, (_, index) => ({
      index,
      offset: index * tileBytes,
      end: (index + 1) * tileBytes,
      width,
      height,
      rowBytes,
      pixels: buffer.subarray(index * tileBytes, (index + 1) * tileBytes),
    })),
  };
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
}

const crcTable = buildCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodeRgbaPng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function composePlanarImage(planes, imageIndex, mask = null, palette = PALETTES.gameplay.colors) {
  const image = planes[0].images[imageIndex];
  const pixels = Buffer.alloc(image.width * image.height * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const byteOffset = y * image.rowBytes + (x >>> 3);
      const bit = 0x80 >>> (x & 7);
      let paletteIndex = 0;
      for (let plane = 0; plane < 4; plane += 1) {
        if ((planes[plane].images[imageIndex].pixels[byteOffset] & bit) !== 0) {
          paletteIndex |= 1 << plane;
        }
      }
      const target = (y * image.width + x) * 4;
      const color = palette[paletteIndex];
      pixels[target] = color[0];
      pixels[target + 1] = color[1];
      pixels[target + 2] = color[2];
      pixels[target + 3] = mask !== null &&
        (mask.images[imageIndex].pixels[byteOffset] & bit) !== 0 ? 0 : 255;
    }
  }
  return { width: image.width, height: image.height, pixels };
}

async function renderResource(decodedDirectory, outputDirectory, paletteName = "gameplay") {
  const palette = PALETTES[paletteName];
  if (palette === undefined) {
    throw new Error(`unknown palette ${paletteName}; expected ${Object.keys(PALETTES).join(", ")}`);
  }
  const sourceManifest = JSON.parse(
    await readFile(path.join(decodedDirectory, "manifest.json"), "utf8"),
  );
  const outputRecords = [];
  let imageCount = 0;

  for (const record of sourceManifest.entries) {
    if (record.kind !== "five_stream_package") {
      continue;
    }
    const present = record.streams.filter((stream) => stream.present);
    if (present.length < 4) {
      continue;
    }
    const buffers = await Promise.all(record.streams.slice(0, 5).map(async (stream) => {
      if (!stream.present) {
        return null;
      }
      return readFile(path.join(decodedDirectory, stream.output));
    }));
    let bundles;
    let layout = "bitmap_bundle";
    let trailingZeroPadding = false;
    try {
      bundles = buffers.map((buffer, index) => {
        if (buffer === null) {
          return null;
        }
        const input = path.join(decodedDirectory, record.streams[index].output);
        return parseBitmapBundle(buffer, input);
      });
    }
    catch (error) {
      const colorBuffers = buffers.slice(0, 4);
      const isRawBattleTiles = path.basename(decodedDirectory) === "B" &&
        colorBuffers.every((buffer) => buffer !== null) &&
        colorBuffers.slice(1).every((buffer) => buffer.length === colorBuffers[0].length) &&
        colorBuffers[0].length === 29184;
      if (!isRawBattleTiles) {
        outputRecords.push({
          record: record.record,
          rendered: false,
          reason: error.message,
        });
        continue;
      }
      if (!colorBuffers.every((buffer) =>
        buffer.subarray(128 * 220).every((value) => value === 0))) {
        outputRecords.push({
          record: record.record,
          rendered: false,
          reason: "the 1024-byte B-plane tail is not zero-filled",
        });
        continue;
      }
      bundles = buffers.map((buffer, index) => buffer === null
        ? null
        : rawTileBundle(
          buffer.subarray(0, 128 * 220),
          40,
          44,
          path.join(decodedDirectory, record.streams[index].output),
        ));
      layout = "raw_128_tiles_40x44_plus_1024_zero_padding";
      trailingZeroPadding = true;
    }

    const colorPlanes = bundles.slice(0, 4);
    if (colorPlanes.some((bundle) => bundle === null) ||
        colorPlanes.slice(1).some((bundle) => !sameLayout(colorPlanes[0], bundle))) {
      outputRecords.push({
        record: record.record,
        rendered: false,
        reason: "the first four bitmap streams have different layouts",
      });
      continue;
    }
    const mask = bundles[4] !== null && sameLayout(colorPlanes[0], bundles[4])
      ? bundles[4]
      : null;
    const images = [];
    for (let index = 0; index < colorPlanes[0].images.length; index += 1) {
      const composed = composePlanarImage(colorPlanes, index, mask, palette.colors);
      const relativeOutput = path.join(
        record.fileName.replace(/\.bin$/, ""),
        `${index.toString().padStart(2, "0")}.png`,
      );
      const outputFile = path.join(outputDirectory, relativeOutput);
      await mkdir(path.dirname(outputFile), { recursive: true });
      await writeFile(
        outputFile,
        encodeRgbaPng(composed.width, composed.height, composed.pixels),
      );
      images.push({
        index,
        width: composed.width,
        height: composed.height,
        output: relativeOutput,
      });
      imageCount += 1;
    }
    outputRecords.push({
      record: record.record,
      rendered: true,
      layout,
      layoutEvidence: layout.startsWith("raw_128_tiles_") ?
        "module29 0000:7E2A passes the raw terrain token as the tile index; 0000:47EA multiplies it by 00DCh, and 0000:3960/427A copy 44 rows of five bytes per VGA plane" :
        null,
      trailingBytesPerPlane: layout.startsWith("raw_128_tiles_") ? 1024 : 0,
      trailingBytesRole: layout.startsWith("raw_128_tiles_") ? "zero_padding" : undefined,
      trailingBytesAllZero: layout.startsWith("raw_128_tiles_") ? trailingZeroPadding : undefined,
      maskUsed: mask !== null,
      images,
    });
  }

  const manifest = {
    format: "ANGEL2 four-plane bitmap composites",
    palette: paletteName,
    paletteColors: palette.colors,
    paletteEvidence: palette.evidence,
    bitOrder: "MSB first",
    planeOrder: "streams 0..3 -> color bits 0..3",
    maskRule: "matching stream 4, set bit means transparent",
    sourceDirectory: decodedDirectory,
    renderedRecords: outputRecords.filter((record) => record.rendered).length,
    renderedImages: imageCount,
    entries: outputRecords,
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `rendered ${manifest.renderedImages} images from ${manifest.renderedRecords} records`,
  );
}

function usage() {
  return "usage: angel2-planar.mjs --render-resource DECODED_DIR OUTPUT_DIR [gameplay|intro|ega]";
}

async function main() {
  const [command, inputDirectory, outputDirectory, paletteName = "gameplay"] = process.argv.slice(2);
  if (command !== "--render-resource" || outputDirectory === undefined) {
    throw new Error(usage());
  }
  await renderResource(inputDirectory, outputDirectory, paletteName);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export {
  PALETTES,
  composePlanarImage,
  encodeRgbaPng,
  parseBitmapBundle,
  rawBitmapBundle,
  rawTileBundle,
  sameLayout,
};
