// Full-screen ordinary-combat choreography, calibrated frame-by-frame against
// the 75 fps DOSBox-X capture of the two stage-0 battles
// (ref/战斗场景视频.mp4). All positions are battle-window scene coordinates:
// a 448×134 viewport at game position (96,158) whose ground line is y≈127.
// The scene background is a 448-cycle with two parallax layers: rows 0..109
// scroll with the camera at 1×, rows 110..147 (near floor) at 2×.
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
//   settle   the post-hit attacker stream keeps its native facing, switches
//                     to the class-specific settle frame where commanded,
//                     and carries the actor out as the camera keeps moving
//   hold     victim alone after the 400 ms recoil script; a fatal target then
//                     switches from threshold reaction to its death frame
//   counter  the same block mirrored, camera panning back
// The cavalry (class 22) strike replaces the melee lunge with a couched-lance
// windup, a thrown-lance projectile (frames 6/7/8), an early attacker exit,
// and a 360 px camera pan. Its post-impact 112 px camera script accompanies
// two measured hops: 36 px, then 24 px.
import {
  STAGE0_FULL_COMBAT_DEATH,
  STAGE0_FULL_COMBAT_FRAME_META,
  STAGE0_FULL_COMBAT_PROFILES,
} from "./content/stage0-actions.generated";
import { classDefinition } from "./content/classes";
import type { AttackResult, BattleUnit, UnitClassId } from "./types";

export type FullCombatClass = number;

const fullCombatClass = (classId: UnitClassId): FullCombatClass => {
  const nativeRecord = classDefinition(classId).nativeRecord;
  return nativeRecord <= 35 ? nativeRecord : 0;
};

export const FULL_SCENE = {
  left: 96,
  top: 158,
  width: 448,
  height: 134,
  stripHeight: 14,
  groundY: 127,
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

export interface FullCombatSceneState {
  /** Increments once per presented battle so the renderer can rebuild. */
  battleKey: number;
  t: number;
  showRightPanel: boolean;
  showLeftPanel: boolean;
  showWindow: boolean;
  showScene: boolean;
  /** Camera world offset; far layer scrolls 1×, near floor 2×. */
  camera: number;
  /** Native YD/ND viewport-source alternation: 0 or -4 pixels. */
  viewportYOffset: number;
  sprites: FullCombatSpriteState[];
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
}

const OPEN = {
  rightPanelAt: 0,
  leftPanelAt: 90,
  windowAt: 180,
  sceneAt: 600,
} as const;

const RANGED = {
  /** Screen gap between a thrower and its target when the strike is ranged. */
  separation: 182,
} as const;

// Module 29 drives class scripts with discrete renderer substeps. The stage-0
// capture calibrates the strike stream to about 40 ms per substep; post-hit
// streams include the renderer's hit-feedback overhead and land at about
// 50 ms per substep (8 → 400 ms for the soldier, 14 → 700 ms for cavalry).
const NATIVE_STRIKE_SUBSTEP = 40;
const NATIVE_POST_HIT_SUBSTEP = 50;

const ATTACKER_ANCHOR = 253; // left-side primary attacker windup mark
const PRIMARY_VICTIM_MARK = 302; // victim mark when attacked from the left
const COUNTER_VICTIM_MARK = 205; // victim mark when attacked from the right
// Measured on the capture: the number lands on the floor about 60 px to the
// victim's far side, its baseline just under the scene's bottom edge.
const DAMAGE_OFFSET = 60;

interface StrikeSpec {
  start: number;
  actorSide: "left" | "right";
  actorClass: FullCombatClass;
  victimClass: FullCombatClass;
  actorX: number;
  victimX: number;
  cameraFrom: number;
  damage: number;
  victimDies: boolean;
  final: boolean;
  counter: boolean;
}

interface StrikeTimes {
  windupEnd: number;
  scrollStart: number;
  scrollEnd: number;
  impact: number;
  holdStart: number;
  end: number;
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
    linkedStream?: { steps: readonly NativeCommandStep[] };
  }[];
  pose: {
    frame: number;
    deltaX: number;
    deltaY: number;
  };
}

interface NativeCombatProfile {
  nativeRecord: number;
  voiceSlots: Readonly<Record<
    "left" | "right",
    Readonly<Record<string, number>>
  >>;
  commandStreams: Readonly<Record<
    "left" | "right",
    Readonly<Record<string, { steps: readonly NativeCommandStep[] }>>
  >>;
}

const NATIVE_PROFILE_BY_RECORD = new Map<number, NativeCombatProfile>(
  Object.values(STAGE0_FULL_COMBAT_PROFILES).map((profile) => [
    profile.nativeRecord,
    profile as unknown as NativeCombatProfile,
  ]),
);

function nativeMainStream(
  classRecord: number,
  side: "left" | "right",
  role: "mainLeftOrAttacker" | "mainRightOrDefender",
): readonly NativeCommandStep[] {
  const profile = NATIVE_PROFILE_BY_RECORD.get(classRecord);
  if (!profile) throw new Error(`Missing native full-combat profile ${classRecord}`);
  return profile.commandStreams[side][role].steps;
}

function nativeReactionStream(
  classRecord: number,
  side: "left" | "right",
  reaction: "guard" | "hurt",
  role: "actor" | "victim",
): readonly NativeCommandStep[] {
  const profile = NATIVE_PROFILE_BY_RECORD.get(classRecord);
  if (!profile) throw new Error(`Missing native full-combat profile ${classRecord}`);
  const key = reaction === "hurt"
    ? role === "actor" ? "auxiliaryA" : "auxiliaryB"
    : role === "actor" ? "auxiliaryC" : "auxiliaryD";
  return profile.commandStreams[side][key].steps;
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
): { offset: number; steps: readonly NativeCommandStep[] } | undefined {
  let offset = 0;
  for (const step of steps) {
    const command = step.commands.find((candidate) =>
      candidate.token === token && candidate.linkedStream);
    if (command?.linkedStream) return { offset, steps: command.linkedStream.steps };
    offset += step.rendererSubsteps * substepDuration;
  }
  return undefined;
}

interface NativeStreamSample {
  frame: number;
  x: number;
  y: number;
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

type NativeAnimationMode = "none" | "alternate" | "cycle4" | "cycle6";

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

function sampleNativeStream(
  steps: readonly NativeCommandStep[],
  age: number,
  substepDuration: number,
  initialX: number,
  initialY: number,
): NativeStreamSample {
  let x = initialX;
  let y = initialY;
  let elapsed = 0;
  let animationMode: NativeAnimationMode = "none";
  let animationCounter = 0;
  let lastFrame = steps[0]?.pose.frame ?? 0;

  for (const step of steps) {
    for (const command of step.commands) {
      animationMode = applyNativeAnimationCommand(animationMode, command.token);
      if (command.token === ":S") {
        const [nextX, nextY] = command.parameters;
        if (typeof nextX === "number") x = nextX;
        if (typeof nextY === "number") y = nextY;
      }
    }

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
        const next = nextNativeFrame(step.pose.frame, animationMode, animationCounter);
        animationCounter = next.counter;
      }
      x += step.pose.deltaX * completed;
      y += step.pose.deltaY * completed;
      const visible = nextNativeFrame(step.pose.frame, animationMode, animationCounter);
      return { frame: visible.frame, x, y };
    }
    for (let index = 0; index < step.rendererSubsteps; index += 1) {
      const next = nextNativeFrame(step.pose.frame, animationMode, animationCounter);
      animationCounter = next.counter;
      lastFrame = next.frame;
    }
    x += step.pose.deltaX * step.rendererSubsteps;
    y += step.pose.deltaY * step.rendererSubsteps;
    elapsed += duration;
  }
  return { frame: lastFrame, x, y };
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
 * entry, while the 8-pixel phase update happens after the currently presented
 * substep and is therefore visible from the following substep onward.
 */
function sampleNativeScroll(
  steps: readonly NativeCommandStep[],
  age: number,
  substepDuration: number,
  initialDirection: NativeScrollDirection = 0,
): NativeScrollSample {
  let distance = 0;
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
    distance += direction * 8 * completed;
    if (age < elapsed + duration) return { distance, direction };
    elapsed += duration;
  }
  return { distance, direction };
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
  return {
    windupEnd: t0 + releaseOffset,
    scrollStart: t0,
    scrollEnd: holdStart,
    impact,
    holdStart,
    end: holdStart + (spec.victimDies ? deathDuration : 0),
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

function nativePostHitActorSprite(
  spec: StrikeSpec,
  actorClass: number,
  t: number,
  impactX: number,
  base: Omit<FullCombatSpriteState, "frame" | "x">,
): FullCombatSpriteState | undefined {
  const reaction = spec.damage <= 10 ? "guard" : "hurt";
  const stream = nativeReactionStream(
    actorClass,
    spec.actorSide,
    reaction,
    "actor",
  );
  const pose = sampleNativeStream(
    stream,
    t,
    NATIVE_POST_HIT_SUBSTEP,
    impactX,
    0,
  );
  if (!nativeFrameIntersectsViewport(
    base.side,
    actorClass,
    base.set,
    pose.frame,
    pose.x,
  )) return undefined;
  return {
    ...base,
    frame: pose.frame,
    x: pose.x,
    lift: Math.max(0, -pose.y),
  };
}

function nativeClassActorSprite(
  spec: StrikeSpec,
  times: StrikeTimes,
  t: number,
): FullCombatSpriteState | undefined {
  const stream = nativeMainStream(
    spec.actorClass,
    spec.actorSide,
    "mainLeftOrAttacker",
  );
  const base: Omit<FullCombatSpriteState, "frame" | "x"> = {
    side: spec.actorSide,
    classId: spec.actorClass,
    set: "plus50",
    channel: "actor",
    lift: 0,
    mirror: false,
    opacity: 1,
  };
  if (t < times.impact) {
    const pose = sampleNativeStream(
      stream,
      t - spec.start,
      NATIVE_STRIKE_SUBSTEP,
      spec.actorX,
      0,
    );
    if (!nativeFrameIntersectsViewport(
      base.side,
      spec.actorClass,
      base.set,
      pose.frame,
      pose.x,
    )) return undefined;
    return {
      ...base,
      frame: pose.frame,
      x: pose.x,
      // Crossbow step 5 deliberately continues from y=-105 through y=120.
      // Clamping the positive half to ground level pins the giant bolt there
      // for five substeps, so camera scroll makes it look as if it slides
      // forward before impact. The native compositor lets that frame sink.
      lift: spec.actorClass === 21 ? -pose.y : Math.max(0, -pose.y),
    };
  }
  if (t >= times.holdStart) return undefined;
  const impactPose = sampleNativeStream(
    stream,
    times.impact - spec.start,
    NATIVE_STRIKE_SUBSTEP,
    spec.actorX,
    0,
  );
  return nativePostHitActorSprite(
    spec,
    spec.actorClass,
    t - times.impact,
    impactPose.x,
    base,
  );
}

function victimSprite(spec: StrikeSpec, times: StrikeTimes, t: number): FullCombatSpriteState | undefined {
  const victimSide = spec.actorSide === "left" ? "right" : "left";
  const base: Omit<FullCombatSpriteState, "frame" | "x"> = {
    side: victimSide,
    classId: spec.victimClass,
    set: "direct",
    channel: "victim",
    lift: 0,
    mirror: false,
    opacity: 1,
  };
  if (t < times.impact) {
    const stream = nativeMainStream(
      spec.actorClass,
      spec.actorSide,
      "mainRightOrDefender",
    );
    const duration = nativeStreamDuration(stream, NATIVE_STRIKE_SUBSTEP);
    const endPose = sampleNativeStream(
      stream,
      duration,
      NATIVE_STRIKE_SUBSTEP,
      0,
      0,
    );
    const pose = sampleNativeStream(
      stream,
      t - spec.start,
      NATIVE_STRIKE_SUBSTEP,
      0,
      0,
    );
    const x = spec.victimX + pose.x - endPose.x;
    if (!nativeFrameIntersectsViewport(
      base.side,
      spec.victimClass,
      base.set,
      pose.frame,
      x,
    )) return undefined;
    return {
      ...base,
      frame: pose.frame,
      x,
      lift: Math.max(0, -pose.y),
    };
  }
  const thresholdReaction = spec.damage <= 10 ? "guard" : "hurt";
  let reaction: NonNullable<FullCombatSpriteState["reaction"]> = thresholdReaction;
  const reactionStream = nativeReactionStream(
    spec.actorClass,
    spec.actorSide,
    thresholdReaction,
    "victim",
  );
  const pose = sampleNativeStream(
    reactionStream,
    t - times.impact,
    NATIVE_POST_HIT_SUBSTEP,
    spec.victimX,
    0,
  );
  let frame = pose.frame;
  let lift = Math.max(0, -pose.y);
  if (spec.victimDies) {
    const deathStart = times.holdStart;
    if (t >= deathStart) {
      reaction = "death";
      frame = 2;
      lift = 0;
    }
  }
  return { ...base, frame, reaction, x: spec.victimX, lift, opacity: 1 };
}

function lanceAt(spec: StrikeSpec, times: StrikeTimes, t: number): FullCombatSceneState["lance"] {
  if (spec.actorClass !== 22 || times.lanceFrom === undefined || times.lanceTo === undefined) return undefined;
  if (t < times.lanceFrom || t >= times.lanceTo) return undefined;
  const main = nativeMainStream(spec.actorClass, spec.actorSide, "mainLeftOrAttacker");
  const linked = nativeLinkedCommand(main, "G1", NATIVE_STRIKE_SUBSTEP);
  if (!linked) return undefined;
  const startPose = sampleNativeStream(
    linked.steps,
    0,
    NATIVE_STRIKE_SUBSTEP,
    0,
    0,
  );
  const pose = sampleNativeStream(
    linked.steps,
    t - times.lanceFrom,
    NATIVE_STRIKE_SUBSTEP,
    0,
    0,
  );
  return {
    // The G1 weapon channel advances in four-unit script increments; the
    // original VGA projection spans 10 pixels per increment in the capture.
    x: startPose.x + (pose.x - startPose.x) * 2.5,
    y: pose.y,
    frame: pose.frame,
    side: spec.actorSide,
  };
}

function archerProjectileAt(
  spec: StrikeSpec,
  times: StrikeTimes,
  t: number,
): FullCombatSceneState["projectile"] {
  if (spec.actorClass !== 20 || times.lanceFrom === undefined || times.lanceTo === undefined) return undefined;
  if (t < times.lanceFrom || t >= times.holdStart) return undefined;
  const flightStream = ARCHER_FLIGHT_STREAMS[spec.actorSide];
  const flightDuration = nativeStreamDuration(flightStream, NATIVE_STRIKE_SUBSTEP);
  const flightEnd = sampleNativeStream(
    flightStream,
    flightDuration,
    NATIVE_STRIKE_SUBSTEP,
    0,
    0,
  );
  const pose = t < times.lanceTo
    ? sampleNativeStream(
      flightStream,
      t - times.lanceFrom,
      NATIVE_STRIKE_SUBSTEP,
      0,
      0,
    )
    : sampleNativeStream(
      spec.damage <= 10
        ? ARCHER_GUARD_PROJECTILE_STREAMS[spec.actorSide]
        : ARCHER_HURT_PROJECTILE_STREAMS[spec.actorSide],
      t - times.lanceTo,
      NATIVE_POST_HIT_SUBSTEP,
      flightEnd.x,
      flightEnd.y,
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
  const strikeDuration = nativeStreamDuration(streams.strike, NATIVE_STRIKE_SUBSTEP);
  const strikeEnd = sampleNativeStream(
    streams.strike,
    strikeDuration,
    NATIVE_STRIKE_SUBSTEP,
    0,
    0,
  );
  const pose = t < times.impact
    ? sampleNativeStream(
      streams.strike,
      t - spec.start,
      NATIVE_STRIKE_SUBSTEP,
      0,
      0,
    )
    : sampleNativeStream(
      spec.damage <= 10 ? streams.guard : streams.hurt,
      t - times.impact,
      NATIVE_POST_HIT_SUBSTEP,
      strikeEnd.x,
      strikeEnd.y,
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
          0,
          0,
        );
      }
    } else if (postLinked && t - times.impact >= postLinked.offset) {
      const strikeEnd = strikeLinked
        ? sampleNativeStream(
          strikeLinked.steps,
          nativeStreamDuration(strikeLinked.steps, NATIVE_STRIKE_SUBSTEP),
          NATIVE_STRIKE_SUBSTEP,
          0,
          0,
        )
        : { frame: 0, x: 0, y: 0 };
      pose = sampleNativeStream(
        postLinked.steps,
        t - times.impact - postLinked.offset,
        NATIVE_POST_HIT_SUBSTEP,
        strikeEnd.x,
        strikeEnd.y,
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

interface NativePresentationRuntime {
  actorEffect: NativeEffectMode;
  victimEffect: NativeEffectMode;
  displayMode: NativeDisplayMode;
  displayToggle: 0 | 4;
  viewportYOffset: number;
  trailOffset: number;
  trailX: number[];
  trailFrame: number[];
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
    const towardRight = (effectRole === "actor" && effect === "U")
      || (effectRole === "victim" && effect === "Y");
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
    particles: [],
  };
  const mainActor = nativeMainStream(spec.actorClass, spec.actorSide, "mainLeftOrAttacker");
  const mainVictim = nativeMainStream(spec.actorClass, spec.actorSide, "mainRightOrDefender");
  const mainVictimEnd = sampleNativeStream(
    mainVictim,
    nativeStreamDuration(mainVictim, NATIVE_STRIKE_SUBSTEP),
    NATIVE_STRIKE_SUBSTEP,
    0,
    0,
  );
  const mainAge = Math.min(t - spec.start, times.impact - spec.start);
  advanceNativePresentationPhase(
    state,
    mainActor,
    mainVictim,
    renderedNativeSubsteps(mainActor, mainAge, NATIVE_STRIKE_SUBSTEP),
    (substep) => {
      const age = substep * NATIVE_STRIKE_SUBSTEP;
      const actor = sampleNativeStream(mainActor, age, NATIVE_STRIKE_SUBSTEP, spec.actorX, 0);
      const victim = sampleNativeStream(mainVictim, age, NATIVE_STRIKE_SUBSTEP, 0, 0);
      return {
        actorX: actor.x,
        victimX: spec.victimX + victim.x - mainVictimEnd.x,
      };
    },
  );

  if (t >= times.impact) {
    const reaction = spec.damage <= 10 ? "guard" : "hurt";
    const postActor = nativeReactionStream(spec.actorClass, spec.actorSide, reaction, "actor");
    const postVictim = nativeReactionStream(spec.actorClass, spec.actorSide, reaction, "victim");
    const mainActorEnd = sampleNativeStream(
      mainActor,
      nativeStreamDuration(mainActor, NATIVE_STRIKE_SUBSTEP),
      NATIVE_STRIKE_SUBSTEP,
      spec.actorX,
      0,
    );
    const postAge = Math.min(t - times.impact, times.holdStart - times.impact);
    advanceNativePresentationPhase(
      state,
      postActor,
      postVictim,
      renderedNativeSubsteps(postActor, postAge, NATIVE_POST_HIT_SUBSTEP),
      (substep) => ({
        actorX: sampleNativeStream(
          postActor,
          substep * NATIVE_POST_HIT_SUBSTEP,
          NATIVE_POST_HIT_SUBSTEP,
          mainActorEnd.x,
          0,
        ).x,
        victimX: spec.victimX,
      }),
    );
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
  const profile = NATIVE_PROFILE_BY_RECORD.get(spec.actorClass)!;
  const streams = [
    nativeMainStream(spec.actorClass, spec.actorSide, "mainLeftOrAttacker"),
    profile.commandStreams[spec.actorSide].mainRightOrDefender.steps,
  ];
  for (const stream of streams) {
    let offset = 0;
    for (const step of stream) {
      for (const command of step.commands) {
        if (/^V[1-5]$/u.test(command.token)) {
          cues.push({
            t: spec.start + offset,
            record: profile.voiceSlots[spec.actorSide][command.token],
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
  if (reactionVoiceCues.length === 0) {
    cues.push({
      t: times.impact,
      record: reaction === "guard" ? 0 : 2,
      reason: `${label}-${reaction}`,
    });
  } else {
    reactionVoiceCues
      .sort((left, right) => left.offset - right.offset)
      .forEach((voice, index) => {
        cues.push({
          t: times.impact + voice.offset,
          record: profile.voiceSlots[spec.actorSide][voice.token],
          reason: index === 0
            ? `${label}-${reaction}`
            : `${label}-${reaction}-${voice.token.toLowerCase()}`,
        });
      });
  }
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
  "camera" | "viewportYOffset" | "sprites" | "lance" | "projectile" | "particles" | "damage"
> {
  const sprites: FullCombatSpriteState[] = [];
  const actor = nativeClassActorSprite(spec, times, t);
  const victim = victimSprite(spec, times, t);
  const nativeG1Effect = nativeG1EffectSprite(spec, times, t);
  const nativeLinkedEffects = genericNativeLinkedEffectSprites(spec, times, t);
  const nativePresentation = nativePresentationAt(spec, times, t);
  if (victim) sprites.push(victim);
  if (actor) sprites.push(actor);
  if (nativeG1Effect) sprites.push(nativeG1Effect);
  sprites.push(...nativeLinkedEffects);
  return {
    camera: cameraAt(spec, times, t),
    viewportYOffset: nativePresentation.viewportYOffset,
    sprites,
    lance: lanceAt(spec, times, t),
    projectile: archerProjectileAt(spec, times, t),
    particles: nativePresentation.particles,
    damage: damageAt(spec, times, t, times.end),
  };
}

let battleKeyCounter = 0;

/**
 * Where the target stands when the blow lands. A melee attacker closes to its
 * measured contact mark; a thrower keeps the whole javelin flight between
 * them, so the target waits far across the window.
 */
function victimMark(actorClass: FullCombatClass, actorX: number, dir: 1 | -1, meleeMark: number): number {
  if (actorClass === 20) {
    // Archer G1 travels 21 native substeps from x=146/336 to x=272/210.
    // The direct target stream enters to the corresponding x=290/158 mark,
    // leaving the frame-5 arrow head at the target body on contact.
    return actorX + dir * 37;
  }
  if (!isRanged(actorClass)) return meleeMark;
  const ranged = actorX + dir * RANGED.separation;
  return Math.max(70, Math.min(FULL_SCENE.width - 70, ranged));
}

export function buildFullCombatScript(
  attacker: BattleUnit,
  defender: BattleUnit,
  result: AttackResult,
): FullCombatScript {
  const battleKey = ++battleKeyCounter;
  const attackerLeft = attacker.side === 1;
  const primaryDir: 1 | -1 = attackerLeft ? 1 : -1;
  const primaryActorX = attackerLeft ? ATTACKER_ANCHOR : FULL_SCENE.width - ATTACKER_ANCHOR;
  const primary: StrikeSpec = {
    start: OPEN.sceneAt,
    actorSide: attackerLeft ? "left" : "right",
    actorClass: fullCombatClass(attacker.classId),
    victimClass: fullCombatClass(defender.classId),
    actorX: primaryActorX,
    victimX: victimMark(
      fullCombatClass(attacker.classId),
      primaryActorX,
      primaryDir,
      attackerLeft ? PRIMARY_VICTIM_MARK : FULL_SCENE.width - PRIMARY_VICTIM_MARK,
    ),
    cameraFrom: 0,
    damage: result.damage,
    victimDies: result.defenderDied,
    final: result.defenderDied || !result.counterOccurred,
    counter: false,
  };
  const primaryTimes = strikeTimes(primary);

  let counter: StrikeSpec | undefined;
  let counterTimes: StrikeTimes | undefined;
  if (!primary.final) {
    const counterDir: 1 | -1 = attackerLeft ? -1 : 1;
    const primaryCameraEnd = cameraAt(primary, primaryTimes, primaryTimes.end);
    counter = {
      start: primaryTimes.end,
      actorSide: attackerLeft ? "right" : "left",
      actorClass: fullCombatClass(defender.classId),
      victimClass: fullCombatClass(attacker.classId),
      actorX: primary.victimX,
      victimX: victimMark(
        fullCombatClass(defender.classId),
        primary.victimX,
        counterDir,
        attackerLeft ? COUNTER_VICTIM_MARK : FULL_SCENE.width - COUNTER_VICTIM_MARK,
      ),
      cameraFrom: primaryCameraEnd,
      damage: result.counterDamage,
      victimDies: result.attackerDied,
      final: true,
      counter: true,
    };
    counterTimes = strikeTimes(counter);
  }

  const duration = counterTimes ? counterTimes.end : primaryTimes.end;
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
        t,
        ...stage,
        camera: 0,
        viewportYOffset: 0,
        sprites: [],
        particles: [],
      };
    }
    const inCounter = counter && counterTimes && t >= counter.start;
    const spec = inCounter ? counter! : primary;
    const times = inCounter ? counterTimes! : primaryTimes;
    const clamped = Math.min(t, times.end);
    return { battleKey, t, ...stage, ...sampleStrike(spec, times, clamped) };
  };

  return { duration, cues, marks, sample };
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
