import { readFile } from "node:fs/promises";
import { decodeRgbaPng, encodeRgbaPng } from "./png-atlas.mjs";

function placeFrames(frames, maxWidth, padding) {
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let atlasWidth = padding;
  const placements = [];

  for (const frame of frames) {
    const { width, height } = frame.image;
    if (width + padding * 2 > maxWidth) {
      throw new Error(`${frame.name}: ${width}px frame exceeds ${maxWidth}px atlas width`);
    }
    if (x > padding && x + width + padding > maxWidth) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    placements.push({ ...frame, x, y });
    x += width + padding;
    rowHeight = Math.max(rowHeight, height);
    atlasWidth = Math.max(atlasWidth, x);
  }

  return {
    width: atlasWidth,
    height: y + rowHeight + padding,
    placements,
  };
}

function copyPixels(target, targetWidth, source, x, y) {
  for (let row = 0; row < source.height; row += 1) {
    source.pixels.copy(
      target,
      ((y + row) * targetWidth + x) * 4,
      row * source.width * 4,
      (row + 1) * source.width * 4,
    );
  }
}

/**
 * Packs untrimmed RGBA source images into one Phaser JSON Hash atlas. Physical
 * placement may change when frames are added, while the caller-owned semantic
 * frame names remain stable.
 */
export async function buildPhaserAtlas({
  id,
  frames,
  imageName = `${id}.png`,
  maxWidth = 1024,
  maxHeight = 1024,
  padding = 2,
}) {
  if (frames.length === 0) throw new Error(`${id}: atlas has no frames`);
  const decoded = await Promise.all(frames.map(async (frame) => {
    const bytes = await readFile(frame.file);
    return {
      ...frame,
      bytes,
      image: decodeRgbaPng(bytes, frame.file),
    };
  }));
  const names = new Set();
  for (const frame of decoded) {
    if (names.has(frame.name)) throw new Error(`${id}: duplicate frame name ${frame.name}`);
    names.add(frame.name);
  }

  const packed = placeFrames(decoded, maxWidth, padding);
  if (packed.height > maxHeight) {
    throw new Error(`${id}: ${packed.width}x${packed.height} atlas exceeds ${maxHeight}px height`);
  }
  const pixels = Buffer.alloc(packed.width * packed.height * 4);
  for (const frame of packed.placements) {
    copyPixels(pixels, packed.width, frame.image, frame.x, frame.y);
  }

  const jsonFrames = Object.fromEntries(packed.placements.map((frame) => [frame.name, {
    frame: { x: frame.x, y: frame.y, w: frame.image.width, h: frame.image.height },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: frame.image.width, h: frame.image.height },
    sourceSize: { w: frame.image.width, h: frame.image.height },
  }]));
  const json = {
    frames: jsonFrames,
    meta: {
      app: "angel2-web-remake",
      version: "1",
      image: imageName,
      format: "RGBA8888",
      size: { w: packed.width, h: packed.height },
      scale: "1",
    },
  };
  const png = encodeRgbaPng(packed.width, packed.height, pixels);

  return {
    id,
    width: packed.width,
    height: packed.height,
    decodedBytes: pixels.length,
    sourceBytes: decoded.reduce((sum, frame) => sum + frame.bytes.length, 0),
    png,
    json,
    frames: packed.placements.map((frame) => ({
      name: frame.name,
      source: frame.source,
      x: frame.x,
      y: frame.y,
      width: frame.image.width,
      height: frame.image.height,
    })),
  };
}
