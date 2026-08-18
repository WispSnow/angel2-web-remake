import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
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

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function unfilterPngRows(raw, width, height) {
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset];
    offset += 1;
    const rowOffset = y * stride;
    const previousOffset = (y - 1) * stride;
    if (![0, 1, 2, 3, 4].includes(filter)) {
      throw new Error(`unsupported PNG filter type ${filter}`);
    }
    for (let x = 0; x < stride; x += 1) {
      const encoded = raw[offset + x];
      const left = x >= 4 ? pixels[rowOffset + x - 4] : 0;
      const above = y > 0 ? pixels[previousOffset + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[previousOffset + x - 4] : 0;
      const prediction = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : paethPredictor(left, above, upperLeft);
      pixels[rowOffset + x] = (encoded + prediction) & 0xff;
    }
    offset += stride;
  }
  if (offset !== raw.length) throw new Error("PNG scanline data has trailing bytes");
  return pixels;
}

export function decodeRgbaPng(buffer, label = "PNG") {
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${label}: invalid PNG signature`);
  }
  let offset = PNG_SIGNATURE.length;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let compression;
  let filterMethod;
  let interlace;
  const idat = [];
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new Error(`${label}: truncated PNG chunk`);
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) throw new Error(`${label}: PNG chunk ${type} is truncated`);
    const data = buffer.subarray(start, end);
    if (type === "IHDR") {
      if (length !== 13) throw new Error(`${label}: invalid IHDR length`);
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      compression = data[10];
      filterMethod = data[11];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }
  if (!width || !height) throw new Error(`${label}: missing image dimensions`);
  if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filterMethod !== 0 || interlace !== 0) {
    throw new Error(`${label}: only non-interlaced 8-bit RGBA PNGs are supported`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const expectedLength = height * (width * 4 + 1);
  if (raw.length !== expectedLength) {
    throw new Error(`${label}: expected ${expectedLength} scanline bytes, received ${raw.length}`);
  }
  return { width, height, pixels: unfilterPngRows(raw, width, height) };
}

export function encodeRgbaPng(width, height, pixels) {
  if (pixels.length !== width * height * 4) {
    throw new Error(`RGBA buffer length does not match ${width}x${height}`);
  }
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
