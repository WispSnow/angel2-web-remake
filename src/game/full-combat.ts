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
//   exit     attacker turns and dashes off his own edge at ~1100 px/s
//   hold     victim alone after the 400 ms recoil script; a fatal target then
//                     switches from threshold reaction to its death frame
//   counter  the same block mirrored, camera panning back
// The cavalry (class 22) strike replaces the melee lunge with a couched-lance
// windup, a thrown-lance projectile (frames 6/7/8), an early attacker exit,
// and a 360 px camera pan. Its post-impact 112 px camera script accompanies
// two measured hops: 36 px, then 24 px.
import type { AttackResult, BattleUnit } from "./types";

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
  classId: number;
  set: "direct" | "plus50";
  frame: number;
  reaction?: "guard" | "hurt" | "death";
  /** Scene x of the sprite's ground anchor (body bottom-center). */
  x: number;
  /** Native-pixel lift above the ground anchor. */
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
  sprites: FullCombatSpriteState[];
  lance?: { x: number; y: number; frame: number; side: "left" | "right" };
  dust: Array<{ x: number; y: number; phase: number }>;
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

const MELEE = {
  windup: 450,
  poseLength: 112,
  scrollDelay: 50, // charge anim runs this long before the camera moves
  scrollDistance: 208,
  approachDuration: 960,
  flameAlternate: 53,
  exitSpeed: 1.35, // px/ms, combined with the impact camera handoff
} as const;

const RANGED = {
  windup: 480,
  poseLength: 160,
  scrollDistance: 360,
  throwPose: 100,
  lanceFlight: 950,
  // The javelin leaves from behind the rider's shoulder, arcs up, and drops
  // onto the target: ~220 px of travel measured across the capture.
  lanceBehind: 38,
  lanceLaunchY: 58,
  lancePeakY: 34,
  lanceImpactY: 62,
  /** Screen gap between a thrower and its target when the strike is ranged. */
  separation: 182,
  exitAt: 700,
  exitSpeed: 1.1,
} as const;

// The capture first shows the target around frame 145 against a contact near
// frame 172, i.e. a little under half a second of approach.
const VICTIM_DASH = 330; // victim pops at the edge this long before impact
const VICTIM_ARRIVE = 80; // ...and reaches his mark this long before impact
const POST_IMPACT_MID = 1200;
const POST_IMPACT_FINAL = 2050;
const DEATH_BLINK = 160;
const DEATH_CYCLES = 6;

const ATTACKER_ANCHOR = 253; // left-side primary attacker windup mark
const PRIMARY_VICTIM_MARK = 302; // victim mark when attacked from the left
const COUNTER_VICTIM_MARK = 205; // victim mark when attacked from the right
const EDGE_MARGIN = 40; // sprites are fully hidden this far past the edge
// Measured on the capture: the number lands on the floor about 60 px to the
// victim's far side, its baseline just under the scene's bottom edge.
const DAMAGE_OFFSET = 60;

const DUST_EVERY = 150;
const DUST_LIFE = 500;
const DUST_BEHIND = 55;

interface StrikeSpec {
  start: number;
  actorSide: "left" | "right";
  actorClass: number;
  victimClass: number;
  actorX: number;
  victimX: number;
  cameraFrom: number;
  cameraTo: number;
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

interface RecoilKeyframe {
  at: number;
  lift: number;
}

interface RecoilProfile {
  duration: number;
  cameraDistance: number;
  liftFrames: readonly RecoilKeyframe[];
}

// These are command-stream steps, not interpolated curves. The original
// renderer holds each native-pixel position until the following command.
const SOLDIER_RECOIL: RecoilProfile = {
  duration: 400,
  cameraDistance: 64,
  liftFrames: [
    { at: 0, lift: 0 },
    { at: 60, lift: 4 },
    { at: 120, lift: 8 },
    { at: 180, lift: 12 },
    { at: 300, lift: 8 },
    { at: 360, lift: 4 },
    { at: 400, lift: 0 },
  ],
};

const CAVALRY_RECOIL: RecoilProfile = {
  duration: 700,
  cameraDistance: 112,
  liftFrames: [
    { at: 0, lift: 0 },
    { at: 50, lift: 18 },
    { at: 100, lift: 36 },
    { at: 360, lift: 18 },
    { at: 400, lift: 0 },
    { at: 450, lift: 8 },
    { at: 500, lift: 16 },
    { at: 550, lift: 24 },
    { at: 600, lift: 16 },
    { at: 650, lift: 8 },
    { at: 700, lift: 0 },
  ],
};

const isRanged = (classId: number): boolean => classId === 22;
const recoilProfile = (actorClass: number): RecoilProfile =>
  isRanged(actorClass) ? CAVALRY_RECOIL : SOLDIER_RECOIL;

function strikeTimes(spec: StrikeSpec): StrikeTimes {
  const t0 = spec.start;
  const recoil = recoilProfile(spec.actorClass);
  const afterImpact = spec.final ? POST_IMPACT_FINAL : POST_IMPACT_MID;
  if (isRanged(spec.actorClass)) {
    const scrollStart = t0;
    const throwAt = t0 + RANGED.windup;
    const lanceFrom = throwAt + RANGED.throwPose;
    const lanceTo = lanceFrom + RANGED.lanceFlight;
    const impact = lanceTo;
    const scrollEnd = impact + recoil.duration;
    const holdStart = scrollEnd;
    return {
      windupEnd: throwAt,
      scrollStart,
      scrollEnd,
      impact,
      holdStart,
      end: impact + afterImpact,
      throwAt,
      lanceFrom,
      lanceTo,
    };
  }
  const windupEnd = t0 + MELEE.windup;
  const scrollStart = windupEnd + MELEE.scrollDelay;
  const impact = scrollStart + MELEE.approachDuration;
  const scrollEnd = impact + recoil.duration;
  const holdStart = scrollEnd;
  return { windupEnd, scrollStart, scrollEnd, impact, holdStart, end: impact + afterImpact };
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function steppedCameraDistance(profile: RecoilProfile, age: number): number {
  const steps = profile.cameraDistance / 8;
  const completed = Math.min(steps, Math.floor(Math.max(0, age) / (profile.duration / steps)));
  return completed * 8;
}

function recoilLift(profile: RecoilProfile, age: number): number {
  let lift = profile.liftFrames[0]?.lift ?? 0;
  for (const keyframe of profile.liftFrames) {
    if (age < keyframe.at) break;
    lift = keyframe.lift;
  }
  return lift;
}

function cameraAt(spec: StrikeSpec, times: StrikeTimes, t: number): number {
  const dir = spec.actorSide === "left" ? 1 : -1;
  const recoil = recoilProfile(spec.actorClass);
  const impactCamera = spec.cameraTo - dir * recoil.cameraDistance;
  if (t < times.impact) {
    const progress = clamp01((t - times.scrollStart) / (times.impact - times.scrollStart));
    return spec.cameraFrom + (impactCamera - spec.cameraFrom) * progress;
  }
  return impactCamera + dir * steppedCameraDistance(recoil, t - times.impact);
}

function meleeActorSprite(spec: StrikeSpec, times: StrikeTimes, t: number): FullCombatSpriteState | undefined {
  const dir = spec.actorSide === "left" ? 1 : -1;
  const base: Omit<FullCombatSpriteState, "frame" | "x"> = {
    side: spec.actorSide,
    classId: spec.actorClass,
    set: "plus50",
    lift: 0,
    mirror: false,
    opacity: 1,
  };
  if (t < times.windupEnd) {
    const pose = Math.min(3, Math.floor((t - spec.start) / MELEE.poseLength));
    return { ...base, frame: pose, x: spec.actorX };
  }
  if (t < times.impact) {
    const alternate = Math.floor((t - times.windupEnd) / MELEE.flameAlternate) % 2;
    return { ...base, frame: 4 + alternate, x: spec.actorX - dir * 12 };
  }
  // Native footage hands the view to the recoiling victim on contact. The
  // attacker turns at once, and the continuing camera pan carries it toward
  // its own edge before the victim-only hold begins.
  if (t >= times.holdStart) return undefined;
  const cameraFollow = cameraAt(spec, times, t) - cameraAt(spec, times, times.impact);
  const x = spec.actorX
    - dir * 12
    - dir * MELEE.exitSpeed * (t - times.impact)
    - cameraFollow;
  if (dir > 0 ? x < -EDGE_MARGIN : x > FULL_SCENE.width + EDGE_MARGIN) return undefined;
  return { ...base, frame: 0, x, mirror: true };
}

function rangedActorSprite(spec: StrikeSpec, times: StrikeTimes, t: number): FullCombatSpriteState | undefined {
  const dir = spec.actorSide === "left" ? 1 : -1;
  const base: Omit<FullCombatSpriteState, "frame" | "x"> = {
    side: spec.actorSide,
    classId: spec.actorClass,
    set: "plus50",
    lift: 0,
    mirror: false,
    opacity: 1,
  };
  const throwAt = times.throwAt ?? spec.start;
  if (t < throwAt) {
    const pose = 1 + Math.min(2, Math.floor((t - spec.start) / RANGED.poseLength));
    return { ...base, frame: pose, x: spec.actorX };
  }
  if (t < throwAt + RANGED.throwPose) return { ...base, frame: 4, x: spec.actorX };
  const exitAt = spec.start + RANGED.exitAt;
  if (t < exitAt) return { ...base, frame: 5, x: spec.actorX };
  const x = spec.actorX - dir * RANGED.exitSpeed * (t - exitAt);
  if (dir > 0 ? x < -EDGE_MARGIN : x > FULL_SCENE.width + EDGE_MARGIN) return undefined;
  return { ...base, frame: 5, x, mirror: true };
}

function victimSprite(spec: StrikeSpec, times: StrikeTimes, t: number): FullCombatSpriteState | undefined {
  const victimSide = spec.actorSide === "left" ? "right" : "left";
  const base: Omit<FullCombatSpriteState, "frame" | "x"> = {
    side: victimSide,
    classId: spec.victimClass,
    set: "direct",
    lift: 0,
    mirror: false,
    opacity: 1,
  };
  const revealAt = times.impact - VICTIM_DASH;
  if (t < revealAt) return undefined;
  const edge = victimSide === "right" ? FULL_SCENE.width + EDGE_MARGIN : -EDGE_MARGIN;
  const arriveAt = times.impact - VICTIM_ARRIVE;
  if (t < arriveAt) {
    const progress = clamp01((t - revealAt) / (arriveAt - revealAt));
    return { ...base, frame: 0, x: edge + (spec.victimX - edge) * progress };
  }
  if (t < times.impact) return { ...base, frame: 0, x: spec.victimX };
  // Hit: the target stays on its screen mark while the world scroll carries
  // the knockback. Only the >10 branch runs the attacker's vertical script.
  const thresholdReaction = spec.damage <= 10 ? "guard" : "hurt";
  let reaction: NonNullable<FullCombatSpriteState["reaction"]> = thresholdReaction;
  let frame = thresholdReaction === "guard" ? 3 : 1;
  let lift = thresholdReaction === "hurt"
    ? recoilLift(recoilProfile(spec.actorClass), t - times.impact)
    : 0;
  let opacity = 1;
  if (spec.victimDies) {
    const deathStart = times.holdStart;
    if (t >= deathStart) {
      reaction = "death";
      frame = 2;
      lift = 0;
      const age = t - deathStart;
      const blinkEnd = DEATH_BLINK * DEATH_CYCLES;
      if (age >= blinkEnd + 240) return undefined;
      if (age >= blinkEnd) opacity = Math.max(0, 1 - (age - blinkEnd) / 240);
      else opacity = Math.floor(age / DEATH_BLINK) % 2 === 0 ? 1 : 0.45;
    }
  }
  return { ...base, frame, reaction, x: spec.victimX, lift, opacity };
}

function lanceAt(spec: StrikeSpec, times: StrikeTimes, t: number): FullCombatSceneState["lance"] {
  if (!isRanged(spec.actorClass) || times.lanceFrom === undefined || times.lanceTo === undefined) return undefined;
  if (t < times.lanceFrom || t >= times.lanceTo) return undefined;
  const dir = spec.actorSide === "left" ? 1 : -1;
  const progress = clamp01((t - times.lanceFrom) / (times.lanceTo - times.lanceFrom));
  const fromX = spec.actorX - dir * RANGED.lanceBehind;
  const toX = spec.victimX + dir * 6;
  // Quadratic through launch → peak → impact heights.
  const rise = (1 - progress) * (1 - progress) * RANGED.lanceLaunchY
    + 2 * (1 - progress) * progress * RANGED.lancePeakY
    + progress * progress * RANGED.lanceImpactY;
  return {
    x: fromX + (toX - fromX) * progress,
    y: rise,
    frame: 6 + Math.min(2, Math.floor(progress * 3)),
    side: spec.actorSide,
  };
}

function dustAt(spec: StrikeSpec, times: StrikeTimes, t: number): FullCombatSceneState["dust"] {
  if (isRanged(spec.actorClass)) return [];
  const dir = spec.actorSide === "left" ? 1 : -1;
  const puffs: FullCombatSceneState["dust"] = [];
  const firstSpawn = times.scrollStart + 60;
  const lastSpawn = times.impact;
  for (let spawn = firstSpawn; spawn <= lastSpawn; spawn += DUST_EVERY) {
    const age = t - spawn;
    if (age < 0 || age > DUST_LIFE) continue;
    const phase = age / DUST_LIFE;
    // World-anchored: the puff stays where it was kicked up while the camera
    // keeps panning, so on screen it drifts behind the attacker.
    const cameraTravel = cameraAt(spec, times, t) - cameraAt(spec, times, spawn);
    const x = spec.actorX - dir * DUST_BEHIND - cameraTravel;
    puffs.push({ x, y: FULL_SCENE.groundY - 3 - phase * 6, phase });
  }
  return puffs;
}

function damageAt(spec: StrikeSpec, times: StrikeTimes, t: number, holdEnd: number): FullCombatSceneState["damage"] {
  if (t < times.impact || t > holdEnd) return undefined;
  const attackDir = spec.actorSide === "left" ? 1 : -1;
  return { amount: spec.damage, x: spec.victimX + attackDir * DAMAGE_OFFSET };
}

function strikeCues(spec: StrikeSpec, times: StrikeTimes): FullCombatCue[] {
  const label = spec.counter ? "full-counter" : "full-primary";
  const cues: FullCombatCue[] = [];
  if (isRanged(spec.actorClass)) {
    cues.push({ t: times.throwAt ?? spec.start, record: 51, reason: `${label}-lance-throw` });
  } else {
    cues.push({ t: spec.start + 60, record: 38, reason: `${label}-windup` });
    cues.push({ t: times.windupEnd, record: 14, reason: `${label}-charge` });
  }
  const reaction = spec.damage <= 10 ? "guard" : "hurt";
  cues.push({
    t: times.impact,
    record: reaction === "guard" ? 0 : 2,
    reason: `${label}-${reaction}`,
  });
  if (spec.victimDies) {
    cues.push({ t: times.holdStart, record: 11, reason: `${label}-death` });
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

function sampleStrike(spec: StrikeSpec, times: StrikeTimes, t: number): Pick<FullCombatSceneState, "camera" | "sprites" | "lance" | "dust" | "damage"> {
  const sprites: FullCombatSpriteState[] = [];
  const actor = isRanged(spec.actorClass)
    ? rangedActorSprite(spec, times, t)
    : meleeActorSprite(spec, times, t);
  const victim = victimSprite(spec, times, t);
  if (victim) sprites.push(victim);
  if (actor) sprites.push(actor);
  return {
    camera: cameraAt(spec, times, t),
    sprites,
    lance: lanceAt(spec, times, t),
    dust: dustAt(spec, times, t),
    damage: damageAt(spec, times, t, times.end),
  };
}

let battleKeyCounter = 0;

/**
 * Where the target stands when the blow lands. A melee attacker closes to its
 * measured contact mark; a thrower keeps the whole javelin flight between
 * them, so the target waits far across the window.
 */
function victimMark(actorClass: number, actorX: number, dir: 1 | -1, meleeMark: number): number {
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
    actorClass: attacker.classId,
    victimClass: defender.classId,
    actorX: primaryActorX,
    victimX: victimMark(
      attacker.classId,
      primaryActorX,
      primaryDir,
      attackerLeft ? PRIMARY_VICTIM_MARK : FULL_SCENE.width - PRIMARY_VICTIM_MARK,
    ),
    cameraFrom: 0,
    cameraTo: primaryDir * (isRanged(attacker.classId) ? RANGED.scrollDistance : MELEE.scrollDistance),
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
    counter = {
      start: primaryTimes.end,
      actorSide: attackerLeft ? "right" : "left",
      actorClass: defender.classId,
      victimClass: attacker.classId,
      actorX: primary.victimX,
      victimX: victimMark(
        defender.classId,
        primary.victimX,
        counterDir,
        attackerLeft ? COUNTER_VICTIM_MARK : FULL_SCENE.width - COUNTER_VICTIM_MARK,
      ),
      cameraFrom: primary.cameraTo,
      cameraTo: primary.cameraTo - primaryDir * (isRanged(defender.classId) ? RANGED.scrollDistance : MELEE.scrollDistance),
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
      return { battleKey, t, ...stage, camera: 0, sprites: [], dust: [] };
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
export const FULL_COMBAT_FRAME_META: Record<
  "left" | "right",
  Record<number, Record<"direct" | "plus50", ReadonlyArray<{ w: number; anchor: number }>>>
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
  },
};
