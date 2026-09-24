import { describe, expect, it } from "vitest";
import { DIAGONAL_EDGE_SCROLL_CURSOR_ART, DIAGONAL_EDGE_SCROLL_CURSORS } from "../../src/game/edge-scroll-cursors";
import { NATIVE_POINTER_SPRITES, nativePointerPlacement } from "../../src/game/native-pointer";

describe("in-screen native pointer", () => {
  it("keeps the A/0001 frame sizes and the host cursor hotspots", () => {
    // 尺寸取自 `A/0001` frame 0–4；热点与 `styles.css` 的宿主游标声明一致。
    expect(NATIVE_POINTER_SPRITES.hand).toEqual({ width: 24, height: 24, hotspot: { x: 3, y: 2 } });
    expect(NATIVE_POINTER_SPRITES.up).toEqual({ width: 24, height: 20, hotspot: { x: 12, y: 0 } });
    expect(NATIVE_POINTER_SPRITES.down).toEqual({ width: 24, height: 19, hotspot: { x: 12, y: 18 } });
    expect(NATIVE_POINTER_SPRITES.left).toEqual({ width: 24, height: 19, hotspot: { x: 0, y: 9 } });
    expect(NATIVE_POINTER_SPRITES.right).toEqual({ width: 24, height: 18, hotspot: { x: 23, y: 9 } });
    for (const cursor of DIAGONAL_EDGE_SCROLL_CURSORS) {
      const art = DIAGONAL_EDGE_SCROLL_CURSOR_ART[cursor];
      expect(NATIVE_POINTER_SPRITES[cursor]).toEqual({
        width: art.rows[0].length,
        height: art.rows.length,
        hotspot: art.hotspot,
      });
    }
    for (const sprite of Object.values(NATIVE_POINTER_SPRITES)) {
      expect(sprite.hotspot.x).toBeGreaterThanOrEqual(0);
      expect(sprite.hotspot.x).toBeLessThan(sprite.width);
      expect(sprite.hotspot.y).toBeGreaterThanOrEqual(0);
      expect(sprite.hotspot.y).toBeLessThan(sprite.height);
    }
  });

  it("places the sprite in logical pixels whatever the screen scale and offset", () => {
    const oneToOne = { left: 320, top: 28, width: 640, height: 350 };
    expect(nativePointerPlacement({ x: 320 + 100, y: 28 + 50 }, oneToOne, "hand")).toEqual({ x: 97, y: 48 });
    // 2 倍画面、左侧留黑边：同一个逻辑点换算回来仍是同一处，由 transform 负责放大。
    const doubled = { left: 12, top: 0, width: 1280, height: 700 };
    expect(nativePointerPlacement({ x: 12 + 200 + 1, y: 100 + 1 }, doubled, "hand")).toEqual({ x: 97, y: 48 });
    expect(nativePointerPlacement({ x: 12 + 10 + 1, y: 680 + 1 }, doubled, "down-left")).toEqual({ x: 4, y: 324 });
  });

  it("snaps the pointer to whole logical pixels like the native integer mouse position", () => {
    // 1.59375 倍：同一逻辑像素内的任何设备位置都画在同一格，精灵像素不和游戏像素半格错开。
    const scale = 1020 / 640;
    const screen = { left: 0, top: 0, width: 1020, height: 350 * scale };
    for (const inside of [0, 0.5, 1.5]) {
      expect(nativePointerPlacement({ x: 40 * scale + inside, y: 30 * scale + inside }, screen, "up"))
        .toEqual({ x: 28, y: 30 });
    }
  });

  it("gives no placement outside the logical screen or on a collapsed box", () => {
    const screen = { left: 0, top: 0, width: 640, height: 350 };
    expect(nativePointerPlacement({ x: -1, y: 10 }, screen, "hand")).toBeUndefined();
    expect(nativePointerPlacement({ x: 640, y: 10 }, screen, "hand")).toBeUndefined();
    expect(nativePointerPlacement({ x: 10, y: 350 }, screen, "hand")).toBeUndefined();
    expect(nativePointerPlacement({ x: 639.5, y: 349.5 }, screen, "hand")).toEqual({ x: 636, y: 347 });
    expect(nativePointerPlacement({ x: 10, y: 10 }, { ...screen, width: 0 }, "hand")).toBeUndefined();
  });
});
