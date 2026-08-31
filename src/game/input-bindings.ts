import type { Position } from "./types";

/**
 * Web 預設鍵位的單一真值。
 *
 * 方向鍵／WASD、Enter／Space 與 Escape／Backspace 是玩家看得到的現代映射。
 * Control／Insert 與 Alt／Delete 保留為不衝突的原版相容鍵，不再放在主操作提示裡。
 */

const KEYBOARD_DIRECTIONS: Readonly<Record<string, Position>> = {
  ArrowUp: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
  Home: { x: -1, y: -1 },
  PageUp: { x: 1, y: -1 },
  End: { x: -1, y: 1 },
  PageDown: { x: 1, y: 1 },
};

export function keyboardDirection(key: string): Position | undefined {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  const direction = KEYBOARD_DIRECTIONS[normalized];
  return direction ? { ...direction } : undefined;
}

export function isKeyboardConfirm(key: string): boolean {
  return key === "Enter" || key === " " || key === "Control" || key === "Insert";
}

export function isKeyboardCancel(key: string): boolean {
  return key === "Escape" || key === "Backspace" || key === "Alt" || key === "Delete";
}

export const MODERN_KEYBOARD_HELP = {
  move: "方向鍵／WASD",
  confirm: "Enter／Space",
  cancel: "Esc／Backspace",
  nextUnit: "Tab",
  groupCommand: "G",
  objectives: "O",
  pause: "P／Pause",
} as const;
