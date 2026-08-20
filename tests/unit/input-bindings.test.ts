import { describe, expect, it } from "vitest";
import {
  isKeyboardCancel,
  isKeyboardConfirm,
  keyboardDirection,
  MODERN_KEYBOARD_HELP,
} from "../../src/game/input-bindings";

describe("modern keyboard bindings", () => {
  it("uses arrows and the conventional WASD cluster", () => {
    expect(keyboardDirection("ArrowUp")).toEqual({ x: 0, y: -1 });
    expect(keyboardDirection("W")).toEqual({ x: 0, y: -1 });
    expect(keyboardDirection("s")).toEqual({ x: 0, y: 1 });
    expect(keyboardDirection("a")).toEqual({ x: -1, y: 0 });
    expect(keyboardDirection("D")).toEqual({ x: 1, y: 0 });
    // 舊 WZAS 的 S=右會和現代 WASD 直接衝突，不再保留。
    expect(MODERN_KEYBOARD_HELP.move).toBe("方向鍵／WASD");
  });

  it("maps Enter and Space to confirm, Escape and Backspace to cancel", () => {
    for (const key of ["Enter", " ", "Control", "Insert"]) {
      expect(isKeyboardConfirm(key)).toBe(true);
      expect(isKeyboardCancel(key)).toBe(false);
    }
    for (const key of ["Escape", "Backspace", "Alt", "Delete"]) {
      expect(isKeyboardCancel(key)).toBe(true);
      expect(isKeyboardConfirm(key)).toBe(false);
    }
    expect(MODERN_KEYBOARD_HELP.confirm).toBe("Enter／Space");
    expect(MODERN_KEYBOARD_HELP.cancel).toBe("Esc／Backspace");
  });

  it("keeps the native diagonal navigation keys as optional non-conflicting aliases", () => {
    expect(keyboardDirection("Home")).toEqual({ x: -1, y: -1 });
    expect(keyboardDirection("PageUp")).toEqual({ x: 1, y: -1 });
    expect(keyboardDirection("End")).toEqual({ x: -1, y: 1 });
    expect(keyboardDirection("PageDown")).toEqual({ x: 1, y: 1 });
  });
});
