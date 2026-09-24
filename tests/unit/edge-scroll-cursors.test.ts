import { describe, expect, it } from "vitest";
import {
  DIAGONAL_EDGE_SCROLL_CURSORS,
  DIAGONAL_EDGE_SCROLL_CURSOR_ART,
  NATIVE_POINTER_FRAMES,
  battlePointerCursorFor,
  type DiagonalEdgeScrollCursor,
} from "../../src/game/edge-scroll-cursors";

const filled = (rows: readonly string[], x: number, y: number): boolean => rows[y]?.[x] === "#";

const PAN_DIRECTION: Readonly<Record<DiagonalEdgeScrollCursor, { x: number; y: number }>> = {
  "up-left": { x: -1, y: -1 },
  "up-right": { x: 1, y: -1 },
  "down-left": { x: -1, y: 1 },
  "down-right": { x: 1, y: 1 },
};

describe("battle edge pointer", () => {
  it("keeps the native arrows on the four edges and uses a diagonal arrow in the corners", () => {
    expect(battlePointerCursorFor(undefined)).toBe("hand");
    expect(battlePointerCursorFor({ x: 0, y: 0 })).toBe("hand");
    expect(battlePointerCursorFor({ x: 0, y: -1 })).toBe("up");
    expect(battlePointerCursorFor({ x: 0, y: 1 })).toBe("down");
    expect(battlePointerCursorFor({ x: -1, y: 0 })).toBe("left");
    expect(battlePointerCursorFor({ x: 1, y: 0 })).toBe("right");
    // 原版方向槽让纵向覆写横向，四角只显示上／下；复刻四角斜向滚屏，箭头跟着斜向。
    for (const cursor of DIAGONAL_EDGE_SCROLL_CURSORS) {
      expect(battlePointerCursorFor(PAN_DIRECTION[cursor])).toBe(cursor);
    }
  });

  it("reports original A/0001 frames only for the five native states", () => {
    expect(NATIVE_POINTER_FRAMES).toEqual({ hand: 0, up: 1, down: 2, left: 3, right: 4 });
    for (const cursor of DIAGONAL_EDGE_SCROLL_CURSORS) {
      expect(NATIVE_POINTER_FRAMES[cursor]).toBeUndefined();
    }
  });
});

describe("diagonal edge-scroll arrows", () => {
  const upLeft = DIAGONAL_EDGE_SCROLL_CURSOR_ART["up-left"].rows;

  it("are two-colour 18x18 silhouettes inside a one-pixel transparent margin", () => {
    for (const cursor of DIAGONAL_EDGE_SCROLL_CURSORS) {
      const { rows } = DIAGONAL_EDGE_SCROLL_CURSOR_ART[cursor];
      expect(rows).toHaveLength(18);
      for (const row of rows) expect(row).toMatch(/^[#.]{18}$/u);
      expect(rows[0]).not.toContain("#");
      expect(rows[17]).not.toContain("#");
      expect(rows.every((row) => row[0] === "." && row[17] === ".")).toBe(true);
    }
  });

  it("draw one connected arrow that is symmetric about its own diagonal", () => {
    for (let y = 0; y < 18; y += 1) {
      for (let x = 0; x < 18; x += 1) expect(filled(upLeft, x, y)).toBe(filled(upLeft, y, x));
    }

    const cells = upLeft.flatMap((row, y) => [...row].flatMap((pixel, x) => (pixel === "#" ? [{ x, y }] : [])));
    const reached = new Set([`${cells[0].x},${cells[0].y}`]);
    const queue = [cells[0]];
    for (let index = 0; index < queue.length; index += 1) {
      const { x, y } = queue[index];
      for (const next of [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]) {
        const key = `${next.x},${next.y}`;
        if (!filled(upLeft, next.x, next.y) || reached.has(key)) continue;
        reached.add(key);
        queue.push(next);
      }
    }
    expect(reached.size).toBe(cells.length);
  });

  it("keep the arrow head's two legs on the pixel axes", () => {
    // 原版箭头是 90° 顶角，旋转 45° 后两腰恰好水平与垂直：箭尖所在的行与列各是一段连续白线。
    expect(upLeft[1]).toMatch(/^\.#{11}\.+$/u);
    expect(upLeft.map((row) => row[1]).join("")).toMatch(/^\.#{11}\.+$/u);
  });

  it("mirror the up-left arrow for the other corners and put the hotspot on the tip", () => {
    const mirrored = (rows: readonly string[]) => rows.map((row) => [...row].reverse().join(""));
    expect(DIAGONAL_EDGE_SCROLL_CURSOR_ART["up-right"].rows).toEqual(mirrored(upLeft));
    expect(DIAGONAL_EDGE_SCROLL_CURSOR_ART["down-left"].rows).toEqual([...upLeft].reverse());
    expect(DIAGONAL_EDGE_SCROLL_CURSOR_ART["down-right"].rows).toEqual(mirrored([...upLeft].reverse()));

    for (const cursor of DIAGONAL_EDGE_SCROLL_CURSORS) {
      const { rows, hotspot } = DIAGONAL_EDGE_SCROLL_CURSOR_ART[cursor];
      const direction = PAN_DIRECTION[cursor];
      expect(filled(rows, hotspot.x, hotspot.y)).toBe(true);
      // 箭尖是沿滚动方向最远的唯一像素。
      const reach = (x: number, y: number) => x * direction.x + y * direction.y;
      const tipReach = reach(hotspot.x, hotspot.y);
      rows.forEach((row, y) => [...row].forEach((pixel, x) => {
        if (pixel === "#" && (x !== hotspot.x || y !== hotspot.y)) expect(reach(x, y)).toBeLessThan(tipReach);
      }));
    }
    expect(DIAGONAL_EDGE_SCROLL_CURSOR_ART["up-left"].fallback).toBe("nw-resize");
    expect(DIAGONAL_EDGE_SCROLL_CURSOR_ART["up-right"].fallback).toBe("ne-resize");
    expect(DIAGONAL_EDGE_SCROLL_CURSOR_ART["down-left"].fallback).toBe("sw-resize");
    expect(DIAGONAL_EDGE_SCROLL_CURSOR_ART["down-right"].fallback).toBe("se-resize");
  });
});
