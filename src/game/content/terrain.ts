import type { Position } from "../types";

export interface CellBounds {
  min: Position;
  max: Position;
}

/** Smallest cell rectangle that still contains every drawn terrain token. */
export function terrainContentBounds(
  tokens: Uint8Array,
  width: number,
  height: number,
): CellBounds {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (tokens[y * width + x] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { min: { x: 0, y: 0 }, max: { x: width - 1, y: height - 1 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** Camera-origin range that keeps the complete viewport inside cell bounds. */
export function viewportOriginBoundsForContent(
  contentBounds: CellBounds,
  viewport: { width: number; height: number },
): CellBounds {
  return {
    min: { ...contentBounds.min },
    max: {
      x: Math.max(contentBounds.min.x, contentBounds.max.x - viewport.width + 1),
      y: Math.max(contentBounds.min.y, contentBounds.max.y - viewport.height + 1),
    },
  };
}
