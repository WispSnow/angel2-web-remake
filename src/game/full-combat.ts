// Full-screen ordinary-combat choreography, calibrated frame-by-frame against
// the 75 fps DOSBox-X capture of the two stage-0 battles
// (ref/战斗场景视频.mp4). All positions are battle-window scene coordinates:
// a 448×148 viewport at game position (96,158) whose character-channel ground
// line is y=135 (A2E4/A377 initialize both physical sides with BX=0087h).
// The backdrop is module 29's five-layer composition; its per-layer phases
// (`backdropPhases`) follow the same substeps as the camera and carry over
// from the previous full-screen battle (REMAKE-169, full-combat-backdrop.ts).
//
// Measured structure of one strike (times at 75 fps, converted to ms):
//   windup   ~450 ms  four poses in place, sword-draw sound
//   charge   ~960 ms  camera advances 144 px while the attacker lunges in
//                     place with flame frames 4/5 alternating and dust puffs
//                     trail behind at world speed
//   reveal   ~260 ms before impact the victim pops at the window edge and
//                     dashes to his mark, arriving as the flames land
//   impact   hit pose with the baked star burst, red damage number on the
//                     victim's far side, threshold hit sound (E/0 at <=10,
//                     E/2 above 10)
//   recoil   target remains fixed horizontally on screen while the camera
//                     completes another 64 px in native 8 px steps; >10
//                     damage adds the measured 0/4/8/12/8/4/0 px hop
//   settle   the post-hit attacker stream continues the strike channel's
//                     position, animation mode and counter, switches to the
//                     class-specific settle frame where commanded, and carries
//                     the actor out as the camera keeps moving
//   hold     both main channels stay where the post-hit streams left them;
//                     AD36 redraws them without dust until the 20th draw since
//                     impact, then the screen stands still. Web tuning uses
//                     667 ms both before a counter and before a nonfatal return
//                     to the map. A fatal target instead switches to its
//                     complete native death stream while the survivor stays.
//   counter  the same block mirrored, camera panning back
// The cavalry (class 22) strike replaces the melee lunge with a couched-lance
// windup, a thrown-lance projectile (frames 6/7/8), an early attacker exit,
// and a 360 px camera pan. Its post-impact 112 px camera script accompanies
// two measured hops: 36 px, then 24 px, while the lance itself deflects back to
// frame 6 and leaves the window instead of stopping at the contact point.
import {
  STAGE0_FULL_COMBAT_DEATH,
  STAGE0_FULL_COMBAT_FRAME_META,
  STAGE0_FULL_COMBAT_GEOMETRY,
  STAGE0_FULL_COMBAT_HOLD,
  STAGE0_FULL_COMBAT_PROFILES,
} from "./content/stage0-actions.generated";
import { FULL_COMBAT_BACKGROUND_FALLBACK_RECORD } from "./content/full-combat-backgrounds.generated";
import { classDefinition } from "./content/classes";
import {
  FULL_COMBAT_BACKDROP_INITIAL_PHASES,
  advanceFullCombatBackdropPhases,
  type FullCombatBackdropPhases,
} from "./full-combat-backdrop";
import type { AttackResult, BattleUnit, UnitClassId } from "./types";

export type FullCombatClass = number;

const fullCombatClass = (classId: UnitClassId): FullCombatClass =>
  classDefinition(classId).nativeRecord;

export const FULL_SCENE = {
  left: 96,
  top: 158,
  width: 448,
  height: 134,
  stripHeight: 14,
  groundY: STAGE0_FULL_COMBAT_GEOMETRY.characterInitialization.actor.y,
  nearLayerTop: 110,
} as const;

export interface FullCombatSpriteState {
  side: "left" | "right";
  classId: FullCombatClass;
  set: "direct" | "plus50";
  channel?: "actor" | "victim" | "G1" | "G2" | "G3" | "G4" | "G5";
  frame: number;
  reaction?: "guard" | "hurt" | "death";
  /** Scene x of the sprite's ground anchor (body bottom-center). */
  x: number;
  /** Signed native-pixel lift above the ground anchor; negative sinks below it. */
  lift: number;
  mirror: boolean;
  opacity: number;
}

/**
 * One two-row pass of module 29's `E336` ground shadow. Every pixel of the
 * band whose scene-x parity matches that row's entry turns palette colour 0.
 */
export interface FullCombatShadowBand {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Scene-x parity blackened on the band's first and second rows. */
  darkParity: readonly [0 | 1, 0 | 1];
}

/** `B0FF/B29B` draw this under channel offset 6, the character main channel. */
export interface FullCombatShadowState {
  side: "left" | "right";
  channel: "actor" | "victim";
  bands: readonly FullCombatShadowBand[];
}

export interface FullCombatSceneState {
  /** Increments once per presented battle so the renderer can rebuild. */
  battleKey: number;
  /**
   * `C.SWF` battlefield record scrolling behind the fighters. Module 29 picks
   * it once per attack from the stage and the defender's terrain, so it stays
   * constant across the counter-attack.
   */
  backgroundRecord: number;
  t: number;
  showRightPanel: boolean;
  showLeftPanel: boolean;
  showWindow: boolean;
  showScene: boolean;
  /**
   * Native pixels the camera has travelled in this presentation: 8 per
   * composed substep under `:R`, −8 under `:L`. The backdrop itself is drawn
   * from `backdropPhases`.
   */
  camera: number;
  /** `CS:AFD9..AFE1` as the current substep composes them, in source bytes. */
  backdropPhases: FullCombatBackdropPhases;
  /** Native YD/ND viewport-source alternation: 0 or -4 pixels. */
  viewportYOffset: number;
  /** Native 210-pixel tiered life gauges; panel numbers remain pre-strike. */
  lifeGauges: {
    left: FullCombatLifeGaugeState;
    right: FullCombatLifeGaugeState;
  };
  sprites: FullCombatSpriteState[];
  /** Main-channel ground shadows in native draw order: defender, then actor. */
  shadows: FullCombatShadowState[];
  lance?: { x: number; y: number; frame: number; side: "left" | "right" };
  projectile?: {
    x: number;
    y: number;
    frame: number;
    side: "left" | "right";
    classId: 20;
  };
  particles: Array<{ x: number; y: number; frame: number }>;
  damage?: { amount: number; x: number };
}

export interface FullCombatLifeGaugeState {
  life: number;
  baseColorIndex: 0 | 6 | 9 | 11;
  fillColorIndex: 6 | 9 | 11 | 13;
  fillWidth: number;
}

const LIFE_GAUGE_TIER_WIDTH = 210;

/**
 * Module 29's 9E8C/9EED routines layer one 210-pixel color tier over the
 * previous full tier. Values below 630 therefore progress red -> blue ->
 * green; the original's final reachable branch uses color 6 for both layers.
 */
export function nativeFullCombatLifeGauge(life: number): FullCombatLifeGaugeState {
  const value = Math.max(0, Math.floor(life));
  if (value < LIFE_GAUGE_TIER_WIDTH) {
    return { life: value, baseColorIndex: 0, fillColorIndex: 11, fillWidth: value };
  }
  if (value < LIFE_GAUGE_TIER_WIDTH * 2) {
    return {
      life: value,
      baseColorIndex: 11,
      fillColorIndex: 9,
      fillWidth: value - LIFE_GAUGE_TIER_WIDTH,
    };
  }
  if (value < LIFE_GAUGE_TIER_WIDTH * 3) {
    return {
      life: value,
      baseColorIndex: 9,
      fillColorIndex: 13,
      fillWidth: value - LIFE_GAUGE_TIER_WIDTH * 2,
    };
  }
  // The last native branch assigns color 6 to both layers. Extending the
  // resulting solid gauge past its documented 839-life input boundary keeps
  // presentation deterministic for safely imported over-range Web states.
  return {
    life: value,
    baseColorIndex: 6,
    fillColorIndex: 6,
    fillWidth: Math.min(LIFE_GAUGE_TIER_WIDTH, value - LIFE_GAUGE_TIER_WIDTH * 3),
  };
}

export interface FullCombatCue {
  t: number;
  record: number;
  reason: string;
}

export interface FullCombatMark {
  t: number;
  phase: FullCombatPhaseName;
  frame: number;
}

export type FullCombatPhaseName =
  | "fullOpen"
  | "fullWindup"
  | "fullCharge"
  | "fullImpact"
  | "fullHold"
  | "fullDefenderDeath"
  | "fullCounterWindup"
  | "fullCounterCharge"
  | "fullCounterImpact"
  | "fullCounterHold"
  | "fullAttackerDeath";

export interface FullCombatScript {
  duration: number;
  cues: FullCombatCue[];
  marks: FullCombatMark[];
  sample: (t: number) => FullCombatSceneState;
  /** The phases the next full-screen battle starts from. */
  finalBackdropPhases: FullCombatBackdropPhases;
}

const OPEN = {
  rightPanelAt: 0,
  leftPanelAt: 90,
  windowAt: 180,
  sceneAt: 600,
} as const;

// Module 29 drives class scripts with discrete renderer substeps. The stage-0
// capture calibrates the strike stream to about 40 ms per substep; post-hit
// streams include the renderer's hit-feedback overhead and land at about
// 50 ms per substep (8 → 400 ms for the soldier, 14 → 700 ms for cavalry).
const NATIVE_STRIKE_SUBSTEP = 40;
const NATIVE_POST_HIT_SUBSTEP = 50;
// The 75 fps capture establishes the missing hold as a real semantic stage.
// The remake uses the user-approved two-thirds tuning for both exchange and
// final nonfatal holds, keeping those two exits perceptually consistent.
const FULL_COMBAT_HOLD = 667;
// AD51 redraws the hold after a one-tick wait instead of AD70's five, so the
// capture shows hold draws 9..19 of the bouncing damage number over 24 video
// frames at 75 fps: 32 ms per draw. At most 19 draws fit inside the Web hold.
const NATIVE_HOLD_DRAW = 32;
// Measured on the capture: the number lands on the floor about 60 px to the
// victim's far side, its baseline just under the scene's bottom edge.
const DAMAGE_OFFSET = 60;

interface StrikeSpec {
  start: number;
  actorSide: "left" | "right";
  actorClass: FullCombatClass;
  victimClass: FullCombatClass;
  actorX: number;
  /** Native off-screen entry x assigned by A2E4/A377. */
  victimStartX: number;
  /** Shared main-channel x consumed by native movement and common effects. */
  victimX: number;
  cameraFrom: number;
  backdropFrom: FullCombatBackdropPhases;
  damage: number;
  victimDies: boolean;
  final: boolean;
  counter: boolean;
  /** Physical-side lives once this strike's damage has landed (`9E28` gauges). */
  lifeAfterImpact: Readonly<Record<"left" | "right", number>>;
}

interface StrikeTimes {
  windupEnd: number;
  scrollStart: number;
  scrollEnd: number;
  impact: number;
  holdStart: number;
  end: number;
  /** `AD36` redraws after a nonfatal post-hit stream; 0 leaves its last image up. */
  holdDraws: number;
  /** Last moment the strike changes: the final hold draw or the death stream's end. */
  settle: number;
  throwAt?: number;
  lanceFrom?: number;
  lanceTo?: number;
}

const isRanged = (classId: FullCombatClass): boolean =>
  classId === 20 || classId === 22;

interface NativeCommandStep {
  rendererSubsteps: number;
  commands: readonly {
    token: string;
    parameters: readonly (number | string)[];
    linkedStream?: {
      steps: readonly NativeCommandStep[];
      /**
       * Records the weapon channel keeps reading once the strike stream ends.
       * Present only when no post-hit stream re-issues the same G token, which
       * is exactly when the native channel survives contact instead of being
       * re-pointed.
       */
      postHitContinuation?: { steps: readonly NativeCommandStep[] };
    };
  }[];
  pose: {
    frame: number;
    deltaX: number;
    deltaY: number;
  };
}

/**
 * `right-only` 记录只在 side 2 编队出现（36「龍」在场景 20/22，37「頭」与 38「手」
 * 在场景 37），原版没有填 side 1 表现块，也没有对应的 `M_00` 图形。它们的 `left`
 * 分支因此整体缺席，而不是空数据。
 */
type NativeCombatReach = "both-sides" | "right-only";

interface NativeCombatProfile {
  nativeRecord: number;
  reach: NativeCombatReach;
  voiceSlots: Partial<Readonly<Record<
    "left" | "right",
    Readonly<Record<string, number>>
  >>>;
  commandStreams: Partial<Readonly<Record<
    "left" | "right",
    Readonly<Record<string, { steps: readonly NativeCommandStep[] }>>
  >>>;
}

const NATIVE_PROFILE_BY_RECORD = new Map<number, NativeCombatProfile>(
  Object.values(STAGE0_FULL_COMBAT_PROFILES).map((profile) => [
    profile.nativeRecord,
    profile as unknown as NativeCombatProfile,
  ]),
);

export function nativeCombatReach(classRecord: number): NativeCombatReach {
  return NATIVE_PROFILE_BY_RECORD.get(classRecord)?.reach ?? "both-sides";
}

function nativeProfile(classRecord: number): NativeCombatProfile {
  const profile = NATIVE_PROFILE_BY_RECORD.get(classRecord);
  if (!profile) throw new Error(`Missing native full-combat profile ${classRecord}`);
  return profile;
}

function unreachableSide(classRecord: number, side: "left" | "right"): Error {
  return new Error(
    `Native full-combat record ${classRecord} has no ${side}-side presentation: `
    + "the original only deploys it on side 2, so it must stay on the right.",
  );
}

function nativeSideStreams(
  classRecord: number,
  side: "left" | "right",
): Readonly<Record<string, { steps: readonly NativeCommandStep[] }>> {
  const streams = nativeProfile(classRecord).commandStreams[side];
  if (!streams) throw unreachableSide(classRecord, side);
  return streams;
}

function nativeVoiceSlots(
  classRecord: number,
  side: "left" | "right",
): Readonly<Record<string, number>> {
  const slots = nativeProfile(classRecord).voiceSlots[side];
  if (!slots) throw unreachableSide(classRecord, side);
  return slots;
}

function nativeMainStream(
  classRecord: number,
  side: "left" | "right",
  role: "mainLeftOrAttacker" | "mainRightOrDefender",
): readonly NativeCommandStep[] {
  return nativeSideStreams(classRecord, side)[role].steps;
}

function nativeReactionStream(
  classRecord: number,
  side: "left" | "right",
  reaction: "guard" | "hurt",
  role: "actor" | "victim",
): readonly NativeCommandStep[] {
  const key = reaction === "hurt"
    ? role === "actor" ? "auxiliaryA" : "auxiliaryB"
    : role === "actor" ? "auxiliaryC" : "auxiliaryD";
  return nativeSideStreams(classRecord, side)[key].steps;
}

const NATIVE_G1_EFFECT_STREAMS = {
  1: {
    left: {
      strike: STAGE0_FULL_COMBAT_PROFILES["magic-sword-warrior"]
        .commandStreams.left.mainLeftOrAttacker.steps[0].commands[0].linkedStream.steps,
      hurt: STAGE0_FULL_COMBAT_PROFILES["magic-sword-warrior"]
        .commandStreams.left.auxiliaryA.steps[0].commands[1].linkedStream.steps,
      guard: STAGE0_FULL_COMBAT_PROFILES["magic-sword-warrior"]
        .commandStreams.left.auxiliaryC.steps[0].commands[1].linkedStream.steps,
    },
    right: {
      strike: STAGE0_FULL_COMBAT_PROFILES["magic-sword-warrior"]
        .commandStreams.right.mainLeftOrAttacker.steps[0].commands[0].linkedStream.steps,
      hurt: STAGE0_FULL_COMBAT_PROFILES["magic-sword-warrior"]
        .commandStreams.right.auxiliaryA.steps[0].commands[1].linkedStream.steps,
      guard: STAGE0_FULL_COMBAT_PROFILES["magic-sword-warrior"]
        .commandStreams.right.auxiliaryC.steps[0].commands[1].linkedStream.steps,
    },
  },
  3: {
    left: {
      strike: STAGE0_FULL_COMBAT_PROFILES["magic-priest"]
        .commandStreams.left.mainLeftOrAttacker.steps[0].commands[0].linkedStream.steps,
      hurt: STAGE0_FULL_COMBAT_PROFILES["magic-priest"]
        .commandStreams.left.auxiliaryA.steps[0].commands[1].linkedStream.steps,
      guard: STAGE0_FULL_COMBAT_PROFILES["magic-priest"]
        .commandStreams.left.auxiliaryC.steps[0].commands[1].linkedStream.steps,
    },
    right: {
      strike: STAGE0_FULL_COMBAT_PROFILES["magic-priest"]
        .commandStreams.right.mainLeftOrAttacker.steps[0].commands[0].linkedStream.steps,
      hurt: STAGE0_FULL_COMBAT_PROFILES["magic-priest"]
        .commandStreams.right.auxiliaryA.steps[0].commands[1].linkedStream.steps,
      guard: STAGE0_FULL_COMBAT_PROFILES["magic-priest"]
        .commandStreams.right.auxiliaryC.steps[0].commands[1].linkedStream.steps,
    },
  },
} as const;

const ARCHER_FLIGHT_STREAMS = {
  left: STAGE0_FULL_COMBAT_PROFILES.archer.commandStreams.left
    .mainLeftOrAttacker.steps[3].commands[1].linkedStream.steps,
  right: STAGE0_FULL_COMBAT_PROFILES.archer.commandStreams.right
    .mainLeftOrAttacker.steps[3].commands[1].linkedStream.steps,
} as const;

const ARCHER_HURT_PROJECTILE_STREAMS = {
  left: STAGE0_FULL_COMBAT_PROFILES.archer.commandStreams.left
    .auxiliaryA.steps[0].commands[0].linkedStream.steps,
  right: STAGE0_FULL_COMBAT_PROFILES.archer.commandStreams.right
    .auxiliaryA.steps[0].commands[0].linkedStream.steps,
} as const;

const ARCHER_GUARD_PROJECTILE_STREAMS = {
  left: STAGE0_FULL_COMBAT_PROFILES.archer.commandStreams.left
    .auxiliaryC.steps[0].commands[0].linkedStream.steps,
  right: STAGE0_FULL_COMBAT_PROFILES.archer.commandStreams.right
    .auxiliaryC.steps[0].commands[0].linkedStream.steps,
} as const;

function nativeStreamDuration(
  steps: readonly NativeCommandStep[],
  substepDuration: number,
): number {
  return steps.reduce(
    (duration, step) => duration + step.rendererSubsteps * substepDuration,
    0,
  );
}

function nativeCommandOffset(
  steps: readonly NativeCommandStep[],
  token: string,
  substepDuration: number,
): number | undefined {
  let elapsed = 0;
  for (const step of steps) {
    if (step.commands.some((command) => command.token === token)) return elapsed;
    elapsed += step.rendererSubsteps * substepDuration;
  }
  return undefined;
}

function nativeLinkedCommand(
  steps: readonly NativeCommandStep[],
  token: "G1" | "G2" | "G3" | "G4" | "G5",
  substepDuration: number,
): {
  offset: number;
  steps: readonly NativeCommandStep[];
  postHitSteps?: readonly NativeCommandStep[];
} | undefined {
  let offset = 0;
  for (const step of steps) {
    const command = step.commands.find((candidate) =>
      candidate.token === token && candidate.linkedStream);
    if (command?.linkedStream) {
      return {
        offset,
        steps: command.linkedStream.steps,
        postHitSteps: command.linkedStream.postHitContinuation?.steps,
      };
    }
    offset += step.rendererSubsteps * substepDuration;
  }
  return undefined;
}

type NativeAnimationMode = "none" | "alternate" | "cycle4" | "cycle6";

/**
 * One module-29 channel (`DS:7A7E..` left, `DS:7B04..` right). Every channel
 * keeps its bitmap-bottom x/y in battle-window coordinates, its animation mode
 * and its animation counter. Only `:S`, the `B061/B1FD` initializers and the
 * `B0D7/B273` per-substep accumulators write the position, and nothing resets
 * the mode or counter between streams, so a post-hit, hold or death stream
 * continues exactly where the previous stream left its channel.
 */
interface NativeChannelState {
  x: number;
  y: number;
  mode: NativeAnimationMode;
  counter: number;
}

/** `B061/B1FD` start every channel on the ground line in mode `XN`. */
function initialNativeChannel(x: number, y: number = FULL_SCENE.groundY): NativeChannelState {
  return { x, y, mode: "none", counter: 0 };
}

interface NativeStreamSample {
  frame: number;
  x: number;
  /** Battle-window y of the bitmap's bottom anchor; the ground line is 135. */
  y: number;
}

/**
 * A channel's bottom anchor as the renderer's lift. Nothing holds a character
 * on the ground line: a positive y past 135 sinks the bitmap, and the `DF86`
 * ground clip hides whatever falls below the line.
 */
function nativeLift(y: number): number {
  return FULL_SCENE.groundY - y;
}

/**
 * The native compositor clips the bitmap, not its ground anchor, at the
 * battle-window edge. This matters for very wide frames such as the great
 * dragon knight's 168–176 px impact poses: deleting them at a fixed anchor
 * margin cuts off several still-visible post-hit substeps.
 */
function nativeFrameIntersectsViewport(
  side: "left" | "right",
  classRecord: number,
  set: "direct" | "plus50",
  frame: number,
  x: number,
): boolean {
  const meta = FULL_COMBAT_FRAME_META[side][classRecord]?.[set]?.[frame];
  if (!meta) return true;
  const left = x - meta.anchor;
  return left < FULL_SCENE.width && left + meta.w > 0;
}

function visibleChannelSprite(
  sprite: FullCombatSpriteState | undefined,
): FullCombatSpriteState | undefined {
  return sprite && nativeFrameIntersectsViewport(
    sprite.side,
    sprite.classId,
    sprite.set,
    sprite.frame,
    sprite.x,
  ) ? sprite : undefined;
}

const NATIVE_SHADOW = STAGE0_FULL_COMBAT_GEOMETRY.mainChannelShadow;

/**
 * Scene-x parity that an `E336` AND mask turns into colour 0. A VGA byte's MSB
 * is its leftmost pixel, so 0AAh clears odd columns and 55h clears even ones.
 */
function nativeShadowDarkParity(mask: number): 0 | 1 {
  const cleared = Array.from({ length: 8 }, (_, pixel) => pixel)
    .filter((pixel) => (mask & (0x80 >> pixel)) === 0)
    .join(",");
  if (cleared === "1,3,5,7") return 1;
  if (cleared === "0,2,4,6") return 0;
  throw new Error(`Unsupported native shadow mask ${mask}`);
}

/**
 * `E336` bands under a main-channel bitmap whose left edge is `left`. They sit
 * on fixed rows whatever the character's lift, widen the middle pass by one
 * byte on each side, and switch from the byte-aligned column dither (`E4AF`)
 * to the shifted checkerboard (`E55A`) with the bitmap's alignment.
 */
export function nativeMainChannelShadowBands(
  left: number,
  width: number,
): FullCombatShadowBand[] {
  const masks = ((left % 8) + 8) % 8 === 0
    ? NATIVE_SHADOW.byteAlignedRowMasks
    : NATIVE_SHADOW.shiftedRowMasks;
  const darkParity = [
    nativeShadowDarkParity(masks[0]),
    nativeShadowDarkParity(masks[1]),
  ] as const;
  return NATIVE_SHADOW.passes.map((pass) => ({
    x: left - pass.sideExtension,
    y: pass.firstRow,
    width: width + pass.sideExtension * 2,
    height: pass.rows,
    darkParity,
  }));
}

/**
 * The shadow follows the main channel, not its visibility: a bitmap just past
 * the window edge still leaves the widened middle pass inside the window.
 */
function nativeMainChannelShadow(
  sprite: FullCombatSpriteState | undefined,
): FullCombatShadowState | undefined {
  if (!sprite || (sprite.channel !== "actor" && sprite.channel !== "victim")) return undefined;
  // Like the viewport test, a side without bitmaps (the empress's left block)
  // has nothing to project; the renderer rejects such sprites on its own.
  const meta = FULL_COMBAT_FRAME_META[sprite.side][sprite.classId]?.[sprite.set]?.[sprite.frame];
  if (!meta) return undefined;
  const anchor = sprite.mirror ? meta.w - meta.anchor : meta.anchor;
  return {
    side: sprite.side,
    channel: sprite.channel,
    bands: nativeMainChannelShadowBands(sprite.x - anchor, meta.w),
  };
}

function applyNativeAnimationCommand(
  mode: NativeAnimationMode,
  token: string,
): NativeAnimationMode {
  if (token === ":X") return "alternate";
  if (token === "X4") return "cycle4";
  if (token === "X6") return "cycle6";
  if (token === "XN") return "none";
  return mode;
}

function nextNativeFrame(
  baseFrame: number,
  mode: NativeAnimationMode,
  counter: number,
): { frame: number; counter: number } {
  if (mode === "alternate") {
    const nextCounter = counter ^ 1;
    return { frame: baseFrame + nextCounter, counter: nextCounter };
  }
  if (mode === "cycle4" || mode === "cycle6") {
    const modulus = mode === "cycle4" ? 4 : 6;
    const nextCounter = (counter + 1) % modulus;
    return { frame: baseFrame + nextCounter, counter: nextCounter };
  }
  return { frame: baseFrame, counter: 0 };
}

function applyNativeChannelCommands(
  channel: NativeChannelState,
  commands: NativeCommandStep["commands"],
): void {
  for (const command of commands) {
    channel.mode = applyNativeAnimationCommand(channel.mode, command.token);
    if (command.token === ":S") {
      const [nextX, nextY] = command.parameters;
      if (typeof nextX === "number") channel.x = nextX;
      if (typeof nextY === "number") channel.y = nextY;
    }
  }
}

/**
 * Replays one stream on a channel: each step latches its pose frame, `B1A8`
 * advances the animation counter on every draw, and `ACC4` adds `dx/dy` only
 * after the substep has been drawn.
 */
function sampleNativeStream(
  steps: readonly NativeCommandStep[],
  age: number,
  substepDuration: number,
  initial: NativeChannelState,
): NativeStreamSample {
  const channel = { ...initial };
  let elapsed = 0;
  let lastFrame = steps[0]?.pose.frame ?? 0;

  for (const step of steps) {
    applyNativeChannelCommands(channel, step.commands);
    const duration = step.rendererSubsteps * substepDuration;
    if (age < elapsed + duration) {
      const completed = Math.max(
        0,
        Math.min(
          step.rendererSubsteps - 1,
          Math.floor((age - elapsed) / substepDuration),
        ),
      );
      for (let index = 0; index < completed; index += 1) {
        channel.counter = nextNativeFrame(step.pose.frame, channel.mode, channel.counter).counter;
      }
      const visible = nextNativeFrame(step.pose.frame, channel.mode, channel.counter);
      return {
        frame: visible.frame,
        x: channel.x + step.pose.deltaX * completed,
        y: channel.y + step.pose.deltaY * completed,
      };
    }
    for (let index = 0; index < step.rendererSubsteps; index += 1) {
      const next = nextNativeFrame(step.pose.frame, channel.mode, channel.counter);
      channel.counter = next.counter;
      lastFrame = next.frame;
    }
    channel.x += step.pose.deltaX * step.rendererSubsteps;
    channel.y += step.pose.deltaY * step.rendererSubsteps;
    elapsed += duration;
  }
  return { frame: lastFrame, x: channel.x, y: channel.y };
}

/** A channel after a whole stream, with the pose frame its last step latched. */
interface NativeChannelEnd extends NativeChannelState {
  latchedFrame: number;
}

/**
 * The state a stream hands to whatever runs next on its channel. The position
 * is one `dx/dy` increment past the last drawn substep: the crossbow's landed
 * bolt, for example, is next drawn at y=145 although its descent was last
 * shown at y=120.
 */
function nativeStreamEnd(
  steps: readonly NativeCommandStep[],
  initial: NativeChannelState,
): NativeChannelEnd {
  const channel = { ...initial };
  let latchedFrame = steps[0]?.pose.frame ?? 0;
  for (const step of steps) {
    applyNativeChannelCommands(channel, step.commands);
    latchedFrame = step.pose.frame;
    for (let index = 0; index < step.rendererSubsteps; index += 1) {
      channel.counter = nextNativeFrame(latchedFrame, channel.mode, channel.counter).counter;
    }
    channel.x += step.pose.deltaX * step.rendererSubsteps;
    channel.y += step.pose.deltaY * step.rendererSubsteps;
  }
  return { ...channel, latchedFrame };
}

/** The last image a stream drew, which stays up when nothing redraws it. */
function lastPresentedNativeSample(
  steps: readonly NativeCommandStep[],
  substepDuration: number,
  initial: NativeChannelState,
): NativeStreamSample {
  return sampleNativeStream(
    steps,
    Math.max(0, nativeStreamDuration(steps, substepDuration) - 1),
    substepDuration,
    initial,
  );
}

/**
 * `AD51` redraws a channel without running `ACC4`: the position stays put but
 * `B1A8/B344` still advance the animation counter on every draw.
 */
function nativeRedrawFrame(channel: NativeChannelEnd, draws: number): number {
  let counter = channel.counter;
  let frame = channel.latchedFrame;
  for (let draw = 0; draw < draws; draw += 1) {
    const next = nextNativeFrame(channel.latchedFrame, channel.mode, counter);
    counter = next.counter;
    frame = next.frame;
  }
  return frame;
}

type NativeScrollDirection = -1 | 0 | 1;

interface NativeScrollSample {
  distance: number;
  direction: NativeScrollDirection;
}

function nativeScrollDirection(
  current: NativeScrollDirection,
  token: string,
): NativeScrollDirection {
  if (token === ":R") return 1;
  if (token === ":L") return -1;
  if (token === ":J") return 0;
  return current;
}

/**
 * Replays AEEF's background state exactly: commands change direction at step
 * entry, while each phase update happens after the currently presented
 * substep and is therefore visible from the following substep onward.
 * `onUpdates` receives each step's run of completed updates in order.
 */
function replayNativeScroll(
  steps: readonly NativeCommandStep[],
  age: number,
  substepDuration: number,
  initialDirection: NativeScrollDirection,
  onUpdates: (direction: NativeScrollDirection, count: number) => void,
): NativeScrollDirection {
  let direction = initialDirection;
  let elapsed = 0;
  for (const step of steps) {
    for (const command of step.commands) {
      direction = nativeScrollDirection(direction, command.token);
    }
    const duration = step.rendererSubsteps * substepDuration;
    const completed = Math.max(
      0,
      Math.min(step.rendererSubsteps, Math.floor((age - elapsed) / substepDuration)),
    );
    onUpdates(direction, completed);
    if (age < elapsed + duration) return direction;
    elapsed += duration;
  }
  return direction;
}

function sampleNativeScroll(
  steps: readonly NativeCommandStep[],
  age: number,
  substepDuration: number,
  initialDirection: NativeScrollDirection = 0,
): NativeScrollSample {
  let distance = 0;
  const direction = replayNativeScroll(steps, age, substepDuration, initialDirection,
    (stepDirection, count) => {
      distance += stepDirection * 8 * count;
    });
  return { distance, direction };
}

function sampleNativeBackdrop(
  steps: readonly NativeCommandStep[],
  age: number,
  substepDuration: number,
  from: FullCombatBackdropPhases,
  initialDirection: NativeScrollDirection = 0,
): { phases: FullCombatBackdropPhases; direction: NativeScrollDirection } {
  let phases = from;
  const direction = replayNativeScroll(steps, age, substepDuration, initialDirection,
    (stepDirection, count) => {
      phases = advanceFullCombatBackdropPhases(phases, stepDirection, count);
    });
  return { phases, direction };
}

function strikeTimes(spec: StrikeSpec): StrikeTimes {
  const t0 = spec.start;
  const stream = nativeMainStream(
    spec.actorClass,
    spec.actorSide,
    "mainLeftOrAttacker",
  );
  const impact = t0 + nativeStreamDuration(stream, NATIVE_STRIKE_SUBSTEP);
  const reaction = spec.damage <= 10 ? "guard" : "hurt";
  const post = nativeReactionStream(
    spec.actorClass,
    spec.actorSide,
    reaction,
    "actor",
  );
  const holdStart = impact + nativeStreamDuration(post, NATIVE_POST_HIT_SUBSTEP);
  const directionOffset = nativeCommandOffset(stream, ":R", NATIVE_STRIKE_SUBSTEP)
    ?? nativeCommandOffset(stream, ":L", NATIVE_STRIKE_SUBSTEP)
    ?? 0;
  const linked = nativeLinkedCommand(stream, "G1", NATIVE_STRIKE_SUBSTEP);
  const releaseOffset = spec.actorClass === 20 || spec.actorClass === 22
    ? linked?.offset ?? directionOffset
    : directionOffset;
  const deathDuration = nativeStreamDuration(
    STAGE0_FULL_COMBAT_DEATH[spec.actorSide === "left" ? "right" : "left"].steps,
    NATIVE_POST_HIT_SUBSTEP,
  );
  // AD36 keeps redrawing only while both gauge remainders are non-zero (so a
  // fatal strike, or a side left on exactly 210/420/630 life, gets none) and
  // stops once B4F1 has counted 20 draws since the post-hit stream began.
  const postHitSubsteps = post.reduce((sum, step) => sum + step.rendererSubsteps, 0);
  const gaugesStillFilled = nativeFullCombatLifeGauge(spec.lifeAfterImpact.left).fillWidth > 0
    && nativeFullCombatLifeGauge(spec.lifeAfterImpact.right).fillWidth > 0;
  const holdDraws = !spec.victimDies && gaugesStillFilled
    ? Math.max(0, STAGE0_FULL_COMBAT_HOLD.drawLimit - postHitSubsteps)
    : 0;
  const end = holdStart + (spec.victimDies ? deathDuration : 0);
  return {
    windupEnd: t0 + releaseOffset,
    scrollStart: t0,
    scrollEnd: holdStart,
    impact,
    holdStart,
    end,
    holdDraws,
    settle: spec.victimDies
      ? end
      : holdStart + Math.max(0, holdDraws - 1) * NATIVE_HOLD_DRAW,
    ...(linked && isRanged(spec.actorClass) ? {
      throwAt: t0 + linked.offset,
      lanceFrom: t0 + linked.offset,
      lanceTo: impact,
    } : {}),
  };
}

function cameraAt(spec: StrikeSpec, times: StrikeTimes, t: number): number {
  const main = nativeMainStream(
    spec.actorClass,
    spec.actorSide,
    "mainLeftOrAttacker",
  );
  const mainAge = Math.max(0, Math.min(t - spec.start, times.impact - spec.start));
  const mainScroll = sampleNativeScroll(main, mainAge, NATIVE_STRIKE_SUBSTEP);
  if (t < times.impact) return spec.cameraFrom + mainScroll.distance;

  const reaction = spec.damage <= 10 ? "guard" : "hurt";
  const post = nativeReactionStream(
    spec.actorClass,
    spec.actorSide,
    reaction,
    "actor",
  );
  const postAge = Math.max(0, Math.min(t - times.impact, times.holdStart - times.impact));
  const postScroll = sampleNativeScroll(
    post,
    postAge,
    NATIVE_POST_HIT_SUBSTEP,
    mainScroll.direction,
  );
  let distance = mainScroll.distance + postScroll.distance;
  if (spec.victimDies && t >= times.holdStart) {
    const victimSide = spec.actorSide === "left" ? "right" : "left";
    const death = STAGE0_FULL_COMBAT_DEATH[victimSide].steps;
    const deathScroll = sampleNativeScroll(
      death,
      Math.min(t - times.holdStart, times.end - times.holdStart),
      NATIVE_POST_HIT_SUBSTEP,
      0,
    );
    distance += deathScroll.distance;
  }
  return spec.cameraFrom + distance;
}

/**
 * The backdrop phases over the same substeps as `cameraAt`. The direction is
 * `:J` whenever no stream runs (`9859` at entry, `A22B` after the post-hit
 * stream), so the opening draw, the hold redraws and the counter's opening
 * draw leave the phases where the last stream put them.
 */
function backdropPhasesAt(
  spec: StrikeSpec,
  times: StrikeTimes,
  t: number,
): FullCombatBackdropPhases {
  const main = nativeMainStream(
    spec.actorClass,
    spec.actorSide,
    "mainLeftOrAttacker",
  );
  const mainAge = Math.max(0, Math.min(t - spec.start, times.impact - spec.start));
  const mainScroll = sampleNativeBackdrop(main, mainAge, NATIVE_STRIKE_SUBSTEP, spec.backdropFrom);
  if (t < times.impact) return mainScroll.phases;

  const reaction = spec.damage <= 10 ? "guard" : "hurt";
  const post = nativeReactionStream(
    spec.actorClass,
    spec.actorSide,
    reaction,
    "actor",
  );
  const postAge = Math.max(0, Math.min(t - times.impact, times.holdStart - times.impact));
  const postScroll = sampleNativeBackdrop(
    post,
    postAge,
    NATIVE_POST_HIT_SUBSTEP,
    mainScroll.phases,
    mainScroll.direction,
  );
  if (!spec.victimDies || t < times.holdStart) return postScroll.phases;
  const victimSide = spec.actorSide === "left" ? "right" : "left";
  return sampleNativeBackdrop(
    STAGE0_FULL_COMBAT_DEATH[victimSide].steps,
    Math.min(t - times.holdStart, times.end - times.holdStart),
    NATIVE_POST_HIT_SUBSTEP,
    postScroll.phases,
    0,
  ).phases;
}

/**
 * A main channel during the nonfatal hold. `AD51` redraws it where its
 * post-hit stream left it, advancing only the animation counter, and the last
 * redraw stays up once the draws run out. Without a single hold draw nothing
 * repaints the window, so the post-hit stream's final image remains.
 */
function nativeHoldSample(
  steps: readonly NativeCommandStep[],
  initial: NativeChannelState,
  end: NativeChannelEnd,
  times: StrikeTimes,
  t: number,
): NativeStreamSample {
  if (times.holdDraws === 0) {
    return lastPresentedNativeSample(steps, NATIVE_POST_HIT_SUBSTEP, initial);
  }
  const draws = Math.min(
    times.holdDraws,
    Math.floor((t - times.holdStart) / NATIVE_HOLD_DRAW) + 1,
  );
  return { frame: nativeRedrawFrame(end, draws), x: end.x, y: end.y };
}

/**
 * The acting side's main channel through every stream it runs. Module 29
 * never returns it to the ground line or restarts its animation between
 * streams: the post-hit stream, the hold redraws and the survivor poses of a
 * fatal strike all continue the strike channel.
 */
function nativeClassActorSprite(
  spec: StrikeSpec,
  times: StrikeTimes,
  t: number,
): FullCombatSpriteState {
  const strike = nativeMainStream(spec.actorClass, spec.actorSide, "mainLeftOrAttacker");
  const post = nativeReactionStream(
    spec.actorClass,
    spec.actorSide,
    spec.damage <= 10 ? "guard" : "hurt",
    "actor",
  );
  const sprite = (pose: NativeStreamSample): FullCombatSpriteState => ({
    side: spec.actorSide,
    classId: spec.actorClass,
    set: "plus50",
    channel: "actor",
    frame: pose.frame,
    x: pose.x,
    // The crossbow's `:S (266,-105)` starts its bolt far above the window and
    // the jungle warrior and the head dive under the ground line; both are
    // ordinary channel positions to the compositor.
    lift: nativeLift(pose.y),
    mirror: false,
    opacity: 1,
  });
  const strikeStart = initialNativeChannel(spec.actorX);
  if (t < times.impact) {
    return sprite(sampleNativeStream(strike, t - spec.start, NATIVE_STRIKE_SUBSTEP, strikeStart));
  }
  const strikeEnd = nativeStreamEnd(strike, strikeStart);
  if (t < times.holdStart) {
    return sprite(sampleNativeStream(post, t - times.impact, NATIVE_POST_HIT_SUBSTEP, strikeEnd));
  }
  const postEnd = nativeStreamEnd(post, strikeEnd);
  if (spec.victimDies) {
    // B683/B6BD give the surviving main channel the still `DS:7DAE` poses:
    // frame 0 plus whatever animation counter it carries, where it stands.
    return sprite(sampleNativeStream(
      STAGE0_FULL_COMBAT_DEATH.survivor.steps,
      t - times.holdStart,
      NATIVE_POST_HIT_SUBSTEP,
      postEnd,
    ));
  }
  return sprite(nativeHoldSample(post, strikeEnd, postEnd, times, t));
}

function victimSprite(spec: StrikeSpec, times: StrikeTimes, t: number): FullCombatSpriteState {
  const victimSide = spec.actorSide === "left" ? "right" : "left";
  const approach = nativeMainStream(spec.actorClass, spec.actorSide, "mainRightOrDefender");
  const thresholdReaction = spec.damage <= 10 ? "guard" : "hurt";
  const reactionStream = nativeReactionStream(
    spec.actorClass,
    spec.actorSide,
    thresholdReaction,
    "victim",
  );
  const sprite = (
    pose: NativeStreamSample,
    reaction?: FullCombatSpriteState["reaction"],
  ): FullCombatSpriteState => ({
    side: victimSide,
    classId: spec.victimClass,
    set: "direct",
    channel: "victim",
    frame: pose.frame,
    ...(reaction ? { reaction } : {}),
    x: pose.x,
    lift: nativeLift(pose.y),
    mirror: false,
    opacity: 1,
  });
  // Defender streams never issue `:S` or move sideways after contact, but they
  // keep accumulating y from the approach through the reaction into the death
  // stream; the great axe warrior's guard stream drives its target 112 px down.
  const approachStart = initialNativeChannel(spec.victimStartX);
  if (t < times.impact) {
    return sprite(sampleNativeStream(approach, t - spec.start, NATIVE_STRIKE_SUBSTEP, approachStart));
  }
  const approachEnd = nativeStreamEnd(approach, approachStart);
  if (t < times.holdStart) {
    return sprite(
      sampleNativeStream(reactionStream, t - times.impact, NATIVE_POST_HIT_SUBSTEP, approachEnd),
      thresholdReaction,
    );
  }
  const reactionEnd = nativeStreamEnd(reactionStream, approachEnd);
  if (spec.victimDies) {
    // `B683/B6BD` only swap in the six `frame 2, dx 0, dy 0` death poses, so
    // the body lies wherever the reaction accumulator left the channel.
    return sprite(
      sampleNativeStream(
        STAGE0_FULL_COMBAT_DEATH[victimSide].steps,
        t - times.holdStart,
        NATIVE_POST_HIT_SUBSTEP,
        reactionEnd,
      ),
      "death",
    );
  }
  return sprite(
    nativeHoldSample(reactionStream, approachEnd, reactionEnd, times, t),
    thresholdReaction,
  );
}

/** Linked `G1..G5` streams all open with `:S`, so their origin never shows. */
const LINKED_ORIGIN = initialNativeChannel(0, 0);

/**
 * Where a linked channel's post-hit stream takes over from its strike stream.
 * Module 29 carries the animation mode and counter across this hand-over too
 * (records 1, 3, 6, 7, 9 and 25 show it), and record 5's G1 keeps running its
 * post-hit continuation; the linked channels do not replay either yet.
 */
function linkedHandOver(end: NativeChannelState): NativeChannelState {
  return initialNativeChannel(end.x, end.y);
}

function lanceAt(spec: StrikeSpec, times: StrikeTimes, t: number): FullCombatSceneState["lance"] {
  if (spec.actorClass !== 22 || times.lanceFrom === undefined || times.lanceTo === undefined) return undefined;
  if (t < times.lanceFrom) return undefined;
  const main = nativeMainStream(spec.actorClass, spec.actorSide, "mainLeftOrAttacker");
  const linked = nativeLinkedCommand(main, "G1", NATIVE_STRIKE_SUBSTEP);
  if (!linked) return undefined;
  const present = (pose: NativeStreamSample, x: number): FullCombatSceneState["lance"] =>
    nativeFrameIntersectsViewport(spec.actorSide, spec.actorClass, "plus50", pose.frame, x)
      ? { x, y: pose.y, frame: pose.frame, side: spec.actorSide }
      : undefined;

  if (t < times.lanceTo) {
    const pose = sampleNativeStream(linked.steps, t - times.lanceFrom, NATIVE_STRIKE_SUBSTEP, LINKED_ORIGIN);
    return present(pose, pose.x);
  }
  const deflection = cavalryLanceDeflection(linked, times, t);
  if (!deflection) return undefined;
  return present(deflection, deflection.x);
}

/**
 * Record 22's post-hit command stream never re-issues `G1`, so the weapon
 * channel survives contact and keeps reading its own records: four
 * `frame 6, (+-30,-16)` substeps that cant the lance back up and carry it out of
 * the battle window. Clearing the channel at contact left the lance stuck in the
 * ground instead of deflecting away.
 */
function cavalryLanceDeflection(
  linked: NonNullable<ReturnType<typeof nativeLinkedCommand>>,
  times: StrikeTimes,
  t: number,
): (NativeStreamSample & { contactX: number }) | undefined {
  const continuation = linked.postHitSteps;
  if (!continuation || times.lanceTo === undefined) return undefined;
  if (t >= times.lanceTo + nativeStreamDuration(continuation, NATIVE_POST_HIT_SUBSTEP)) {
    return undefined;
  }
  const contact = nativeStreamEnd(linked.steps, LINKED_ORIGIN);
  const pose = sampleNativeStream(
    continuation,
    t - times.lanceTo,
    NATIVE_POST_HIT_SUBSTEP,
    linkedHandOver(contact),
  );
  return { ...pose, contactX: contact.x };
}

function archerProjectileAt(
  spec: StrikeSpec,
  times: StrikeTimes,
  t: number,
): FullCombatSceneState["projectile"] {
  if (spec.actorClass !== 20 || times.lanceFrom === undefined || times.lanceTo === undefined) return undefined;
  if (t < times.lanceFrom || t >= times.holdStart) return undefined;
  const flightStream = ARCHER_FLIGHT_STREAMS[spec.actorSide];
  const pose = t < times.lanceTo
    ? sampleNativeStream(
      flightStream,
      t - times.lanceFrom,
      NATIVE_STRIKE_SUBSTEP,
      LINKED_ORIGIN,
    )
    : sampleNativeStream(
      spec.damage <= 10
        ? ARCHER_GUARD_PROJECTILE_STREAMS[spec.actorSide]
        : ARCHER_HURT_PROJECTILE_STREAMS[spec.actorSide],
      t - times.lanceTo,
      NATIVE_POST_HIT_SUBSTEP,
      linkedHandOver(nativeStreamEnd(flightStream, LINKED_ORIGIN)),
    );
  return {
    x: pose.x,
    y: pose.y,
    frame: pose.frame,
    side: spec.actorSide,
    classId: 20,
  };
}

function nativeG1EffectSprite(
  spec: StrikeSpec,
  times: StrikeTimes,
  t: number,
): FullCombatSpriteState | undefined {
  if (
    (spec.actorClass !== 1 && spec.actorClass !== 3)
    || t < spec.start
    || t >= times.holdStart
  ) {
    return undefined;
  }
  const streams = NATIVE_G1_EFFECT_STREAMS[spec.actorClass][spec.actorSide];
  const pose = t < times.impact
    ? sampleNativeStream(
      streams.strike,
      t - spec.start,
      NATIVE_STRIKE_SUBSTEP,
      LINKED_ORIGIN,
    )
    : sampleNativeStream(
      spec.damage <= 10 ? streams.guard : streams.hurt,
      t - times.impact,
      NATIVE_POST_HIT_SUBSTEP,
      linkedHandOver(nativeStreamEnd(streams.strike, LINKED_ORIGIN)),
    );
  if (!nativeFrameIntersectsViewport(
    spec.actorSide,
    spec.actorClass,
    "plus50",
    pose.frame,
    pose.x,
  )) return undefined;
  return {
    side: spec.actorSide,
    classId: spec.actorClass,
    set: "plus50",
    channel: "G1",
    frame: pose.frame,
    x: pose.x,
    lift: FULL_SCENE.groundY - pose.y,
    mirror: false,
    opacity: 1,
  };
}

function genericNativeLinkedEffectSprites(
  spec: StrikeSpec,
  times: StrikeTimes,
  t: number,
): FullCombatSpriteState[] {
  if (
    spec.actorClass === 1
    || spec.actorClass === 3
    || spec.actorClass === 20
    || spec.actorClass === 22
    || t < spec.start
    || t >= times.holdStart
  ) {
    return [];
  }
  const reaction = spec.damage <= 10 ? "guard" : "hurt";
  const main = nativeMainStream(spec.actorClass, spec.actorSide, "mainLeftOrAttacker");
  const post = nativeReactionStream(spec.actorClass, spec.actorSide, reaction, "actor");
  const result: FullCombatSpriteState[] = [];
  for (const token of ["G1", "G2", "G3", "G4", "G5"] as const) {
    const strikeLinked = nativeLinkedCommand(main, token, NATIVE_STRIKE_SUBSTEP);
    const postLinked = nativeLinkedCommand(post, token, NATIVE_POST_HIT_SUBSTEP);
    let pose: NativeStreamSample | undefined;
    if (t < times.impact) {
      const age = t - spec.start - (strikeLinked?.offset ?? 0);
      if (strikeLinked && age >= 0) {
        pose = sampleNativeStream(
          strikeLinked.steps,
          age,
          NATIVE_STRIKE_SUBSTEP,
          LINKED_ORIGIN,
        );
      }
    } else if (postLinked && t - times.impact >= postLinked.offset) {
      pose = sampleNativeStream(
        postLinked.steps,
        t - times.impact - postLinked.offset,
        NATIVE_POST_HIT_SUBSTEP,
        linkedHandOver(strikeLinked
          ? nativeStreamEnd(strikeLinked.steps, LINKED_ORIGIN)
          : LINKED_ORIGIN),
      );
    }
    if (
      !pose
      || !nativeFrameIntersectsViewport(
        spec.actorSide,
        spec.actorClass,
        "plus50",
        pose.frame,
        pose.x,
      )
    ) continue;
    result.push({
      side: spec.actorSide,
      classId: spec.actorClass,
      set: "plus50",
      channel: token,
      frame: pose.frame,
      x: pose.x,
      lift: FULL_SCENE.groundY - pose.y,
      mirror: false,
      opacity: 1,
    });
  }
  return result;
}

type NativeEffectMode = "N" | "Y" | "U";
type NativeDisplayMode = "ND" | "YD";
type NativeTrailPhase = "attack" | "hurt" | "guard" | "death";

interface NativePresentationRuntime {
  actorEffect: NativeEffectMode;
  victimEffect: NativeEffectMode;
  displayMode: NativeDisplayMode;
  displayToggle: 0 | 4;
  viewportYOffset: number;
  trailOffset: number;
  trailX: number[];
  trailFrame: number[];
  /** Direction of the attack trail, retained for guard recoil reversal. */
  attackTrailTowardRight: boolean;
  particles: FullCombatSceneState["particles"];
}

function nativeCommandsAtSubstep(
  steps: readonly NativeCommandStep[],
  target: number,
): NativeCommandStep["commands"] {
  let substep = 0;
  for (const step of steps) {
    if (substep === target) return step.commands;
    substep += step.rendererSubsteps;
    if (substep > target) return [];
  }
  return [];
}

function applyNativePresentationCommands(
  state: NativePresentationRuntime,
  role: "actor" | "victim",
  commands: NativeCommandStep["commands"],
): void {
  for (const command of commands) {
    if (command.token === "YD") state.displayMode = "YD";
    if (command.token === "ND") state.displayMode = "ND";
    const nextEffect = command.token === "EY"
      ? "Y"
      : command.token === "NE"
        ? "N"
        : command.token === "UE"
          ? "U"
          : undefined;
    if (nextEffect && role === "actor") state.actorEffect = nextEffect;
    if (nextEffect && role === "victim") state.victimEffect = nextEffect;
  }
}

function advanceNativePresentationPhase(
  state: NativePresentationRuntime,
  actorSteps: readonly NativeCommandStep[],
  victimSteps: readonly NativeCommandStep[],
  renderedSubsteps: number,
  actorSide: "left" | "right",
  phase: NativeTrailPhase,
  coordinates: (substep: number) => { actorX: number; victimX: number },
): void {
  for (let substep = 0; substep < renderedSubsteps; substep += 1) {
    // A7F4 parses actor/linked channels before A9FA parses the victim side.
    applyNativePresentationCommands(
      state,
      "actor",
      nativeCommandsAtSubstep(actorSteps, substep),
    );
    applyNativePresentationCommands(
      state,
      "victim",
      nativeCommandsAtSubstep(victimSteps, substep),
    );

    if (state.displayMode === "YD") {
      state.displayToggle = state.displayToggle === 0 ? 4 : 0;
      state.viewportYOffset = -state.displayToggle;
    } else {
      state.displayToggle = 0;
      state.viewportYOffset = 0;
    }

    const effectRole = state.actorEffect !== "N"
      ? "actor"
      : state.victimEffect !== "N"
        ? "victim"
        : undefined;
    if (!effectRole) {
      state.particles = [];
      continue;
    }
    const effect = effectRole === "actor" ? state.actorEffect : state.victimEffect;
    const { actorX, victimX } = coordinates(substep);
    const subjectX = effectRole === "actor" ? actorX : victimX;
    const effectTowardRight = (effectRole === "actor" && effect === "U")
      || (effectRole === "victim" && effect === "Y");
    // EY/UE are stored in each physical side's command block, but the common
    // trail bitmap is not mirrored by the compositor. Resolve the native
    // left-side direction first, then mirror the complete trail for a right
    // side subject. This keeps the dust behind the same motion on counterattacks.
    const subjectSide = effectRole === "actor"
      ? actorSide
      : actorSide === "left" ? "right" : "left";
    const nativeTowardRight = subjectSide === "right"
      ? !effectTowardRight
      : effectTowardRight;
    // Victim-side guard streams use the native physical-side direction: the
    // left-side defender's trail extends right, and the right-side defender's
    // trail extends left. A few classes emit guard dust from the actor channel
    // instead; those are recoil effects and must reverse that actor's attack
    // trail direction.
    const towardRight = phase === "death"
      // B683/B6BD install the same UE command on the physical left/right
      // sprite stream. B3BD then takes its left-U (+40/+24) or right-U
      // (-40/-24) branch directly, so both death trails point inward.
      ? subjectSide === "left"
      : phase === "guard"
        ? effectRole === "actor"
          ? !state.attackTrailTowardRight
          : subjectSide === "left"
        : nativeTowardRight;
    if (phase === "attack") state.attackTrailTowardRight = towardRight;
    const direction = towardRight ? 24 : -24;
    state.trailX[0] = subjectX + (towardRight ? 40 + state.trailOffset : -40 - state.trailOffset);
    state.trailFrame[0] ^= 1;
    state.trailOffset += 4;
    if (state.trailOffset > 24) state.trailOffset = 0;
    for (let index = 0; index < 5; index += 1) {
      state.trailX[index + 1] = state.trailX[index] + direction;
      state.trailFrame[index + 1] = state.trailFrame[index] + 2;
    }
    state.particles = [124, 120, 115].map((y, index) => ({
      x: state.trailX[index],
      y,
      frame: state.trailFrame[index],
    }));
  }
}

function renderedNativeSubsteps(
  steps: readonly NativeCommandStep[],
  age: number,
  substepDuration: number,
): number {
  const total = steps.reduce((sum, step) => sum + step.rendererSubsteps, 0);
  if (age < 0) return 0;
  return Math.min(total, Math.floor(age / substepDuration) + 1);
}

function nativePresentationAt(
  spec: StrikeSpec,
  times: StrikeTimes,
  t: number,
): Pick<FullCombatSceneState, "viewportYOffset" | "particles"> {
  const state: NativePresentationRuntime = {
    actorEffect: "N",
    victimEffect: "N",
    displayMode: "ND",
    displayToggle: 0,
    viewportYOffset: 0,
    trailOffset: 0,
    trailX: Array<number>(6).fill(0),
    trailFrame: Array<number>(6).fill(0),
    attackTrailTowardRight: spec.actorSide === "right",
    particles: [],
  };
  const mainActor = nativeMainStream(spec.actorClass, spec.actorSide, "mainLeftOrAttacker");
  const mainVictim = nativeMainStream(spec.actorClass, spec.actorSide, "mainRightOrDefender");
  const mainAge = Math.min(t - spec.start, times.impact - spec.start);
  advanceNativePresentationPhase(
    state,
    mainActor,
    mainVictim,
    renderedNativeSubsteps(mainActor, mainAge, NATIVE_STRIKE_SUBSTEP),
    spec.actorSide,
    "attack",
    (substep) => {
      const age = substep * NATIVE_STRIKE_SUBSTEP;
      return {
        actorX: sampleNativeStream(
          mainActor,
          age,
          NATIVE_STRIKE_SUBSTEP,
          initialNativeChannel(spec.actorX),
        ).x,
        victimX: sampleNativeStream(
          mainVictim,
          age,
          NATIVE_STRIKE_SUBSTEP,
          initialNativeChannel(spec.victimStartX),
        ).x,
      };
    },
  );

  if (t >= times.impact) {
    const reaction = spec.damage <= 10 ? "guard" : "hurt";
    const postActor = nativeReactionStream(spec.actorClass, spec.actorSide, reaction, "actor");
    const postVictim = nativeReactionStream(spec.actorClass, spec.actorSide, reaction, "victim");
    const mainActorEnd = nativeStreamEnd(mainActor, initialNativeChannel(spec.actorX));
    const postAge = Math.min(t - times.impact, times.holdStart - times.impact);
    advanceNativePresentationPhase(
      state,
      postActor,
      postVictim,
      renderedNativeSubsteps(postActor, postAge, NATIVE_POST_HIT_SUBSTEP),
      spec.actorSide,
      reaction,
      (substep) => ({
        actorX: sampleNativeStream(
          postActor,
          substep * NATIVE_POST_HIT_SUBSTEP,
          NATIVE_POST_HIT_SUBSTEP,
          mainActorEnd,
        ).x,
        victimX: spec.victimX,
      }),
    );
  }

  // A1E8 switches both trails off before AD36, and each AD51 hold draw is
  // presented without the YD source shift. With no hold draw at all the last
  // post-hit image, dust and shift included, simply stays on screen.
  if (!spec.victimDies && t >= times.holdStart && times.holdDraws > 0) {
    return { viewportYOffset: 0, particles: [] };
  }

  if (spec.victimDies && t >= times.holdStart) {
    state.actorEffect = "N";
    state.victimEffect = "N";
    const victimSide = spec.actorSide === "left" ? "right" : "left";
    const death = STAGE0_FULL_COMBAT_DEATH[victimSide].steps;
    advanceNativePresentationPhase(
      state,
      [],
      death,
      renderedNativeSubsteps(death, t - times.holdStart, NATIVE_POST_HIT_SUBSTEP),
      spec.actorSide,
      "death",
      () => ({ actorX: spec.victimX, victimX: spec.victimX }),
    );
  }
  return { viewportYOffset: state.viewportYOffset, particles: state.particles };
}

function damageAt(spec: StrikeSpec, times: StrikeTimes, t: number, holdEnd: number): FullCombatSceneState["damage"] {
  if (t < times.impact || t > holdEnd) return undefined;
  const attackDir = spec.actorSide === "left" ? 1 : -1;
  return { amount: spec.damage, x: spec.victimX + attackDir * DAMAGE_OFFSET };
}

function strikeCues(spec: StrikeSpec, times: StrikeTimes): FullCombatCue[] {
  const label = spec.counter ? "full-counter" : "full-primary";
  const cues: FullCombatCue[] = [];
  const actorVoiceSlots = nativeVoiceSlots(spec.actorClass, spec.actorSide);
  const streams = [
    nativeMainStream(spec.actorClass, spec.actorSide, "mainLeftOrAttacker"),
    nativeMainStream(spec.actorClass, spec.actorSide, "mainRightOrDefender"),
  ];
  for (const stream of streams) {
    let offset = 0;
    for (const step of stream) {
      for (const command of step.commands) {
        if (/^V[1-5]$/u.test(command.token)) {
          cues.push({
            t: spec.start + offset,
            record: actorVoiceSlots[command.token],
            reason: `${label}-native-${spec.actorClass}-${command.token.toLowerCase()}`,
          });
        }
      }
      offset += step.rendererSubsteps * NATIVE_STRIKE_SUBSTEP;
    }
  }
  const reaction = spec.damage <= 10 ? "guard" : "hurt";
  const reactionVoiceCues: Array<{ offset: number; token: string }> = [];
  for (const role of ["actor", "victim"] as const) {
    const stream = nativeReactionStream(
      spec.actorClass,
      spec.actorSide,
      reaction,
      role,
    );
    let offset = 0;
    for (const step of stream) {
      for (const command of step.commands) {
        if (/^V[1-5]$/u.test(command.token)) {
          reactionVoiceCues.push({ offset, token: command.token });
        }
      }
      offset += step.rendererSubsteps * NATIVE_POST_HIT_SUBSTEP;
    }
  }
  // `A23E` only picks which post-hit stream pair runs; `A24D`/`A28E` are four
  // pointer copies and a `ret`, with no sound request of their own. The impact
  // sound is therefore whatever the selected streams ask for: `V1`/`V2` for the
  // stage-0 classes that made `E/2`/`E/0` look universal, but a different slot
  // for ten records (great dragon knight is `V5 -> E/4`), and nothing at all for
  // record 14's guard branch. Substituting a threshold sound when a stream is
  // silent would invent audio the original never plays.
  reactionVoiceCues
    .sort((left, right) => left.offset - right.offset)
    .forEach((voice, index) => {
      cues.push({
        t: times.impact + voice.offset,
        record: actorVoiceSlots[voice.token],
        reason: index === 0
          ? `${label}-${reaction}`
          : `${label}-${reaction}-${voice.token.toLowerCase()}`,
      });
    });
  if (spec.victimDies) {
    cues.push({
      t: times.holdStart,
      record: STAGE0_FULL_COMBAT_DEATH.soundRecord,
      reason: `${label}-death`,
    });
  }
  return cues;
}

function strikeMarks(spec: StrikeSpec, times: StrikeTimes): FullCombatMark[] {
  const marks: FullCombatMark[] = [];
  if (spec.counter) {
    marks.push({ t: spec.start, phase: "fullCounterWindup", frame: 0 });
    marks.push({ t: times.windupEnd, phase: "fullCounterCharge", frame: 0 });
    marks.push({ t: times.impact, phase: "fullCounterImpact", frame: 0 });
    marks.push({ t: times.holdStart, phase: spec.victimDies ? "fullAttackerDeath" : "fullCounterHold", frame: 0 });
  } else {
    marks.push({ t: spec.start, phase: "fullWindup", frame: 0 });
    marks.push({ t: times.windupEnd, phase: "fullCharge", frame: 0 });
    marks.push({ t: times.impact, phase: "fullImpact", frame: 0 });
    marks.push({ t: times.holdStart, phase: spec.victimDies ? "fullDefenderDeath" : "fullHold", frame: 0 });
  }
  return marks;
}

function sampleStrike(spec: StrikeSpec, times: StrikeTimes, t: number): Pick<
  FullCombatSceneState,
  | "camera"
  | "backdropPhases"
  | "viewportYOffset"
  | "sprites"
  | "shadows"
  | "lance"
  | "projectile"
  | "particles"
  | "damage"
> {
  const sprites: FullCombatSpriteState[] = [];
  const actorChannel = nativeClassActorSprite(spec, times, t);
  const victimChannel = victimSprite(spec, times, t);
  const actor = visibleChannelSprite(actorChannel);
  const victim = visibleChannelSprite(victimChannel);
  const nativeG1Effect = nativeG1EffectSprite(spec, times, t);
  const nativeLinkedEffects = genericNativeLinkedEffectSprites(spec, times, t);
  const nativePresentation = nativePresentationAt(spec, times, t);
  if (victim) sprites.push(victim);
  if (actor) sprites.push(actor);
  if (nativeG1Effect) sprites.push(nativeG1Effect);
  sprites.push(...nativeLinkedEffects);
  const shadows = [victimChannel, actorChannel].flatMap((channel) => {
    const shadow = nativeMainChannelShadow(channel);
    return shadow ? [shadow] : [];
  });
  return {
    camera: cameraAt(spec, times, t),
    backdropPhases: backdropPhasesAt(spec, times, t),
    viewportYOffset: nativePresentation.viewportYOffset,
    sprites,
    shadows,
    lance: lanceAt(spec, times, t),
    projectile: archerProjectileAt(spec, times, t),
    particles: nativePresentation.particles,
    damage: damageAt(spec, times, t, times.settle),
  };
}

let battleKeyCounter = 0;

function nativeStrikeCoordinates(
  actorClass: FullCombatClass,
  actorSide: "left" | "right",
): Pick<StrikeSpec, "actorX" | "victimStartX" | "victimX"> {
  const initialization = STAGE0_FULL_COMBAT_GEOMETRY.characterInitialization;
  const actorX = initialization.actor.x;
  const victimStartX = initialization.opponentByActorSide[actorSide].x;
  const victimEnd = nativeStreamEnd(
    nativeMainStream(actorClass, actorSide, "mainRightOrDefender"),
    initialNativeChannel(victimStartX),
  );
  return { actorX, victimStartX, victimX: victimEnd.x };
}

export function buildFullCombatScript(
  attacker: BattleUnit,
  defender: BattleUnit,
  result: AttackResult,
  backgroundRecord: number = FULL_COMBAT_BACKGROUND_FALLBACK_RECORD,
  backdropFrom: FullCombatBackdropPhases = FULL_COMBAT_BACKDROP_INITIAL_PHASES,
): FullCombatScript {
  const battleKey = ++battleKeyCounter;
  const attackerLeft = attacker.side === 1;
  const livesBySide = (attackerLife: number, defenderLife: number) => ({
    left: attackerLeft ? attackerLife : defenderLife,
    right: attackerLeft ? defenderLife : attackerLife,
  });
  const defenderLifeAfterPrimary = Math.max(0, defender.life - result.damage);
  const attackerLifeAfterCounter = Math.max(0, attacker.life - result.counterDamage);
  const primaryClass = fullCombatClass(attacker.classId);
  const primaryVictimClass = fullCombatClass(defender.classId);
  const primaryActorSide = attackerLeft ? "left" : "right";
  const primaryCoordinates = nativeStrikeCoordinates(primaryClass, primaryActorSide);
  const primary: StrikeSpec = {
    start: OPEN.sceneAt,
    actorSide: primaryActorSide,
    actorClass: primaryClass,
    victimClass: primaryVictimClass,
    ...primaryCoordinates,
    cameraFrom: 0,
    backdropFrom,
    damage: result.damage,
    victimDies: result.defenderDied,
    final: result.defenderDied || !result.counterOccurred,
    counter: false,
    lifeAfterImpact: livesBySide(attacker.life, defenderLifeAfterPrimary),
  };
  const primaryTimes = strikeTimes(primary);

  let counter: StrikeSpec | undefined;
  let counterTimes: StrikeTimes | undefined;
  if (!primary.final) {
    const primaryCameraEnd = cameraAt(primary, primaryTimes, primaryTimes.end);
    const counterVictimClass = fullCombatClass(attacker.classId);
    const counterActorClass = fullCombatClass(defender.classId);
    const counterActorSide = attackerLeft ? "right" : "left";
    const counterCoordinates = nativeStrikeCoordinates(counterActorClass, counterActorSide);
    counter = {
      start: primaryTimes.end + FULL_COMBAT_HOLD,
      actorSide: counterActorSide,
      actorClass: counterActorClass,
      victimClass: counterVictimClass,
      ...counterCoordinates,
      cameraFrom: primaryCameraEnd,
      backdropFrom: backdropPhasesAt(primary, primaryTimes, primaryTimes.end),
      damage: result.counterDamage,
      victimDies: result.attackerDied,
      final: true,
      counter: true,
      lifeAfterImpact: livesBySide(attackerLifeAfterCounter, defenderLifeAfterPrimary),
    };
    counterTimes = strikeTimes(counter);
  }

  const finalSpec = counter ?? primary;
  const finalTimes = counterTimes ?? primaryTimes;
  const duration = finalTimes.end + (finalSpec.victimDies ? 0 : FULL_COMBAT_HOLD);
  const cues: FullCombatCue[] = [
    ...strikeCues(primary, primaryTimes),
    ...(counter && counterTimes ? strikeCues(counter, counterTimes) : []),
  ].sort((a, b) => a.t - b.t);
  const openMark: FullCombatMark = { t: 0, phase: "fullOpen", frame: 0 };
  const marks: FullCombatMark[] = [
    openMark,
    ...strikeMarks(primary, primaryTimes),
    ...(counter && counterTimes ? strikeMarks(counter, counterTimes) : []),
  ].sort((a, b) => a.t - b.t);

  const lifeGaugesAt = (t: number): FullCombatSceneState["lifeGauges"] => {
    const lives = livesBySide(
      counterTimes && t >= counterTimes.impact ? attackerLifeAfterCounter : attacker.life,
      t >= primaryTimes.impact ? defenderLifeAfterPrimary : defender.life,
    );
    return {
      left: nativeFullCombatLifeGauge(lives.left),
      right: nativeFullCombatLifeGauge(lives.right),
    };
  };

  const sample = (t: number): FullCombatSceneState => {
    const stage = {
      showRightPanel: t >= OPEN.rightPanelAt,
      showLeftPanel: t >= OPEN.leftPanelAt,
      showWindow: t >= OPEN.windowAt,
      showScene: t >= OPEN.sceneAt,
    };
    if (!stage.showScene) {
      return {
        battleKey,
        backgroundRecord,
        t,
        ...stage,
        camera: 0,
        backdropPhases: backdropFrom,
        viewportYOffset: 0,
        lifeGauges: lifeGaugesAt(t),
        sprites: [],
        shadows: [],
        particles: [],
      };
    }
    const inCounter = counter && counterTimes && t >= counter.start;
    const spec = inCounter ? counter! : primary;
    const times = inCounter ? counterTimes! : primaryTimes;
    const clamped = Math.min(t, times.settle);
    return {
      battleKey,
      backgroundRecord,
      t,
      ...stage,
      lifeGauges: lifeGaugesAt(t),
      ...sampleStrike(spec, times, clamped),
    };
  };

  return {
    duration,
    cues,
    marks,
    sample,
    finalBackdropPhases: backdropPhasesAt(finalSpec, finalTimes, finalTimes.end),
  };
}

/** Per-frame sprite metadata: image width and the ground-anchor x within it. */
const FULL_COMBAT_FRAME_META_LEGACY: Record<
  "left" | "right",
  Record<number, Record<
    "direct" | "plus50",
    ReadonlyArray<{ w: number; anchor: number; h?: number; yOffset?: number }>
  >>
> = {
  left: {
    0: {
      direct: [
        { w: 64, anchor: 30 },
        { w: 88, anchor: 34 },
        { w: 112, anchor: 56 },
        { w: 72, anchor: 34 },
      ],
      plus50: [
        { w: 72, anchor: 34 },
        { w: 104, anchor: 62 },
        { w: 64, anchor: 32 },
        { w: 80, anchor: 34 },
        { w: 152, anchor: 30 },
        { w: 152, anchor: 30 },
      ],
    },
    20: {
      direct: [
        { w: 80, anchor: 40 },
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
        { w: 80, anchor: 40 },
      ],
      plus50: [
        { w: 80, anchor: 40 },
        { w: 96, anchor: 48 },
        { w: 88, anchor: 44 },
        { w: 80, anchor: 40 },
        { w: 80, anchor: 40 },
        { w: 56, anchor: 28, h: 19, yOffset: 0 },
        { w: 56, anchor: 28, h: 27, yOffset: 8 },
        { w: 56, anchor: 28, h: 19, yOffset: 0 },
        { w: 56, anchor: 28, h: 27, yOffset: 0 },
      ],
    },
    22: {
      direct: [
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
        { w: 120, anchor: 56 },
      ],
      plus50: [
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
        { w: 104, anchor: 50 },
        { w: 128, anchor: 56 },
        { w: 96, anchor: 44 },
        { w: 104, anchor: 52 },
        { w: 112, anchor: 56 },
        { w: 104, anchor: 52 },
      ],
    },
    24: {
      direct: [
        { w: 72, anchor: 36 },
        { w: 80, anchor: 40 },
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
      ],
      plus50: [
        { w: 72, anchor: 36 },
        { w: 88, anchor: 44 },
        { w: 88, anchor: 44 },
        { w: 88, anchor: 44 },
        { w: 120, anchor: 60 },
        { w: 88, anchor: 44 },
        { w: 88, anchor: 44 },
      ],
    },
    28: {
      direct: [
        { w: 88, anchor: 44 },
        { w: 104, anchor: 52 },
        { w: 112, anchor: 56 },
        { w: 88, anchor: 44 },
      ],
      plus50: [
        { w: 96, anchor: 48 },
        { w: 104, anchor: 52 },
        { w: 88, anchor: 44 },
        { w: 56, anchor: 28 },
        { w: 128, anchor: 64 },
      ],
    },
  },
  right: {
    0: {
      direct: [
        { w: 72, anchor: 42 },
        { w: 88, anchor: 54 },
        { w: 112, anchor: 56 },
        { w: 64, anchor: 30 },
      ],
      plus50: [
        { w: 64, anchor: 30 },
        { w: 104, anchor: 42 },
        { w: 64, anchor: 32 },
        { w: 80, anchor: 46 },
        { w: 152, anchor: 122 },
        { w: 152, anchor: 122 },
      ],
    },
    20: {
      direct: [
        { w: 80, anchor: 40 },
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
        { w: 80, anchor: 40 },
      ],
      plus50: [
        { w: 80, anchor: 40 },
        { w: 96, anchor: 48 },
        { w: 88, anchor: 44 },
        { w: 72, anchor: 36 },
        { w: 80, anchor: 40 },
        { w: 56, anchor: 28, h: 19, yOffset: 0 },
        { w: 56, anchor: 28, h: 27, yOffset: 8 },
        { w: 56, anchor: 28, h: 19, yOffset: 0 },
        { w: 56, anchor: 28, h: 27, yOffset: 0 },
      ],
    },
    22: {
      direct: [
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
        { w: 104, anchor: 56 },
        { w: 128, anchor: 72 },
      ],
      plus50: [
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
        { w: 104, anchor: 56 },
        { w: 104, anchor: 54 },
        { w: 120, anchor: 64 },
        { w: 96, anchor: 52 },
        { w: 112, anchor: 56 },
        { w: 120, anchor: 60 },
        { w: 112, anchor: 56 },
      ],
    },
    24: {
      direct: [
        { w: 72, anchor: 36 },
        { w: 80, anchor: 40 },
        { w: 96, anchor: 48 },
        { w: 96, anchor: 48 },
      ],
      plus50: [
        { w: 72, anchor: 36 },
        { w: 88, anchor: 44 },
        { w: 88, anchor: 44 },
        { w: 80, anchor: 40 },
        { w: 120, anchor: 60 },
        { w: 88, anchor: 44 },
        { w: 88, anchor: 44 },
      ],
    },
    28: {
      direct: [
        { w: 88, anchor: 44 },
        { w: 104, anchor: 52 },
        { w: 112, anchor: 56 },
        { w: 88, anchor: 44 },
      ],
      plus50: [
        { w: 104, anchor: 52 },
        { w: 104, anchor: 52 },
        { w: 88, anchor: 44 },
        { w: 56, anchor: 28 },
        { w: 128, anchor: 64 },
      ],
    },
  },
};

export const FULL_COMBAT_FRAME_META = Object.assign(
  FULL_COMBAT_FRAME_META_LEGACY,
  STAGE0_FULL_COMBAT_FRAME_META,
) as Record<
  "left" | "right",
  Record<number, Record<
    "direct" | "plus50",
    ReadonlyArray<{ w: number; anchor: number; h?: number; yOffset?: number }>
  >>
>;
