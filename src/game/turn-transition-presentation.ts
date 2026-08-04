export type TurnTransitionSide = "player" | "enemy";

export interface TurnTransitionMotionFrame {
  side: TurnTransitionSide;
  frame: number;
  x: number;
  y: number;
  spriteFrame: 0 | 1;
  nativeTicks: number;
}

export type TurnTransitionPresentation =
  | {
    side: TurnTransitionSide;
    phase: "hold";
    frame: -1;
    nativeTicks: number;
  }
  | TurnTransitionMotionFrame & { phase: "motion" };

interface NativeMotionSegment {
  count: number;
  dx: number;
  dy: number;
}

interface NativeTurnTransitionSpec {
  start: { x: number; y: number };
  spriteFrame: 0 | 1;
  segments: readonly NativeMotionSegment[];
}

export const TURN_TRANSITION_HOLD_NATIVE_TICKS = 100;
export const TURN_TRANSITION_FRAME_NATIVE_TICKS = 10;

// Module 29 1000:371D selects DS:1CD8/1CFA/1CEA for the player run.
// 1000:3680 selects DS:1D0A/1D38/1D22 for the enemy run. The shared
// 1000:385C loop draws first, waits ten native ticks, then applies dx/dy.
const NATIVE_TURN_TRANSITIONS: Readonly<Record<TurnTransitionSide, NativeTurnTransitionSpec>> = {
  player: {
    start: { x: -100, y: 240 },
    spriteFrame: 0,
    segments: [
      { count: 2, dx: 40, dy: 0 },
      { count: 2, dx: 20, dy: -20 },
      { count: 1, dx: 20, dy: 0 },
      { count: 2, dx: 15, dy: 20 },
      { count: 2, dx: 10, dy: -15 },
      { count: 1, dx: 5, dy: 0 },
      { count: 2, dx: 5, dy: 15 },
      { count: 8, dx: 40, dy: 0 },
    ],
  },
  enemy: {
    start: { x: 440, y: 190 },
    spriteFrame: 1,
    segments: [
      { count: 2, dx: -40, dy: 20 },
      { count: 2, dx: -40, dy: -20 },
      { count: 1, dx: -30, dy: 0 },
      { count: 2, dx: -20, dy: 20 },
      { count: 2, dx: -10, dy: -10 },
      { count: 1, dx: -10, dy: 0 },
      { count: 2, dx: -10, dy: 10 },
      { count: 2, dx: -10, dy: -5 },
      { count: 1, dx: -10, dy: 0 },
      { count: 2, dx: -10, dy: 5 },
      { count: 7, dx: -50, dy: 0 },
    ],
  },
};

// 1000:389D swaps to A/26 and redraws these six edge puffs after the runner.
// The native selector numbers are 1,2,3,6,7,8; the planar audit exports
// them in that order as PNG frames 00..05.
export const TURN_TRANSITION_DUST = [
  { frame: 0, x: 0, y: 200 },
  { frame: 1, x: 0, y: 244 },
  { frame: 2, x: 0, y: 288 },
  { frame: 3, x: 376, y: 200 },
  { frame: 4, x: 368, y: 244 },
  { frame: 5, x: 384, y: 288 },
] as const;

export function turnTransitionFrames(side: TurnTransitionSide): TurnTransitionMotionFrame[] {
  const spec = NATIVE_TURN_TRANSITIONS[side];
  const frames: TurnTransitionMotionFrame[] = [];
  let { x, y } = spec.start;

  for (const segment of spec.segments) {
    for (let index = 0; index < segment.count; index += 1) {
      frames.push({
        side,
        frame: frames.length,
        x,
        y,
        spriteFrame: spec.spriteFrame,
        nativeTicks: TURN_TRANSITION_FRAME_NATIVE_TICKS,
      });
      x += segment.dx;
      y += segment.dy;
    }
  }

  return frames;
}
