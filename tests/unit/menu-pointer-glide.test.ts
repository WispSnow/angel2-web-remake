import { describe, expect, it } from "vitest";
import {
  NATIVE_GLIDE_FRAME_MS,
  NATIVE_MENU_POINTER_OFFSET,
  nativeGlideAxisStep,
  nativePointerGlidePath,
} from "../../src/game/menu-pointer-glide";

describe("native menu pointer glide", () => {
  it("steps a quarter of the remaining distance with a one-pixel floor", () => {
    // `0000:580F`：d>>1 為零就不動，否則走 max(1, d>>2)。
    expect(nativeGlideAxisStep(0, 0)).toBe(0);
    expect(nativeGlideAxisStep(0, 1)).toBe(0);
    expect(nativeGlideAxisStep(1, 0)).toBe(1);
    expect(nativeGlideAxisStep(0, 2)).toBe(1);
    expect(nativeGlideAxisStep(0, 7)).toBe(1);
    expect(nativeGlideAxisStep(0, 8)).toBe(2);
    expect(nativeGlideAxisStep(0, 200)).toBe(50);
    expect(nativeGlideAxisStep(200, 0)).toBe(150);
  });

  it("advances both axes in the same frame and snaps onto the exact target", () => {
    const path = nativePointerGlidePath({ x: 0, y: 0 }, { x: 200, y: 100 });

    expect(path[0]).toEqual({ x: 50, y: 25 });
    expect(path[1]).toEqual({ x: 87, y: 43 });
    // `0000:57F9` 在迴圈結束後直接寫入目標，補上停在差 1 px 的那一格。
    expect(path.at(-1)).toEqual({ x: 200, y: 100 });
    expect(path.at(-2)).not.toEqual({ x: 200, y: 100 });
  });

  it("keeps the native frame counts for representative travel distances", () => {
    const frames = (distance: number) =>
      nativePointerGlidePath({ x: 0, y: 0 }, { x: distance, y: 0 }).length;

    // 每格一次垂直回描，所以格數就是原生耗時：40 px 約 190 ms、200 px 約 270 ms。
    expect(frames(10)).toBe(8);
    expect(frames(40)).toBe(14);
    expect(frames(80)).toBe(16);
    expect(frames(200)).toBe(19);
    expect(frames(400)).toBe(22);
    expect(frames(40) * NATIVE_GLIDE_FRAME_MS).toBeCloseTo(199.8, 1);
  });

  it("reports no path when the pointer already sits on the target", () => {
    expect(nativePointerGlidePath({ x: 120, y: 28 }, { x: 120, y: 28 })).toEqual([]);
    // 半格起點會先取整，取整後同格一樣不演出。
    expect(nativePointerGlidePath({ x: 120.4, y: 27.6 }, { x: 120, y: 28 })).toEqual([]);
  });

  it("keeps the native first-row pointer offset", () => {
    // `0000:56ED`／`0000:56F6`：目標是選單左上角加 (0x78, 0x1C)。
    expect(NATIVE_MENU_POINTER_OFFSET).toEqual({ x: 120, y: 28 });
  });
});
