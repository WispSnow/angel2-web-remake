import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCEPTED_FULL_COMBAT_RECORDS,
  FULL_COMBAT_ACCEPTANCE,
} from "../../src/game/content/full-combat-acceptance";
import {
  STAGE0_FULL_COMBAT_ASSETS,
  STAGE0_FULL_COMBAT_DAMAGE_NUMBER,
  STAGE0_FULL_COMBAT_DEATH,
  STAGE0_FULL_COMBAT_GEOMETRY,
  STAGE0_FULL_COMBAT_HOLD,
  STAGE0_FULL_COMBAT_PROFILES,
} from "../../src/game/content/stage0-actions.generated";
import { classIdFromNativeRecord, className } from "../../src/game/content/classes";
import { NATIVE_FONT } from "../../src/game/content/native-font.generated";
import {
  buildFullCombatScript,
  FULL_SCENE,
  FULL_COMBAT_FRAME_META,
  nativeDamageField,
  nativeFullCombatLifeGauge,
  nativeMainChannelShadowBands,
  type FullCombatPhaseName,
  type FullCombatScript,
} from "../../src/game/full-combat";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import type { AttackResult, BattleUnit, UnitClassId } from "../../src/game/types";
import { EVIDENCE_AVAILABLE } from "./evidence";

const workspace = path.resolve(import.meta.dirname, "../..");

interface EvidencePlacement {
  xAnchor: number[];
  yOffset: number[];
}

interface EvidencePresentationBlock {
  available: boolean;
  framePlacement?: EvidencePlacement;
  defenderFramePlacement?: EvidencePlacement;
}

const unit = (
  side: 1 | 2,
  slot: number,
  name: string,
  classId: UnitClassId = "soldier",
): BattleUnit => ({
  id: `${side}:${slot}`,
  side,
  slot,
  classId,
  className: className(classId),
  name,
  portrait: classId === "cavalry" ? 15 : side === 1 ? 46 : 47,
  x: side === 1 ? 24 : 25,
  y: 26,
  life: side === 1 ? 160 : 180,
  experience: 0,
  acted: false,
  actionDisabled: false,
  statuses: emptyUnitStatuses(),
});

const result = (overrides: Partial<AttackResult> = {}): AttackResult => ({
  attackerId: "1:0",
  defenderId: "2:48",
  damage: 24,
  counterDamage: 8,
  counterOccurred: true,
  defenderDied: false,
  attackerDied: false,
  experienceGained: 12,
  counterExperienceGained: 4,
  ...overrides,
});

function markTime(script: FullCombatScript, phase: FullCombatPhaseName): number {
  const mark = script.marks.find((entry) => entry.phase === phase);
  if (!mark) throw new Error(`Missing full-combat mark: ${phase}`);
  return mark.t;
}

interface ReferenceCommandStep {
  rendererSubsteps: number;
  commands: readonly {
    token: string;
    parameters: readonly (number | string)[];
    linkedStream?: { steps: readonly ReferenceCommandStep[] };
  }[];
  pose: { frame: number; deltaX: number; deltaY: number };
}

const STREAM_KEYS = [
  "mainLeftOrAttacker",
  "mainRightOrDefender",
  "auxiliaryA",
  "auxiliaryB",
  "auxiliaryC",
  "auxiliaryD",
] as const;

type ReferenceSideStreams = Readonly<Record<
  (typeof STREAM_KEYS)[number],
  { readonly steps: readonly ReferenceCommandStep[] }
>>;

type ReferenceProfile = (typeof STAGE0_FULL_COMBAT_PROFILES)[keyof typeof STAGE0_FULL_COMBAT_PROFILES];

/**
 * 记录 36–38 只有 side 2 表现块，`commandStreams.left` 整体缺席。测试直接按 `reach`
 * 取侧，缺席时抛错而不是静默 `undefined`。
 */
function sideStreams(profile: ReferenceProfile, side: "left" | "right"): ReferenceSideStreams {
  const streams = (profile.commandStreams as
    Partial<Record<"left" | "right", ReferenceSideStreams>>)[side];
  if (!streams) throw new Error(`record ${profile.nativeRecord} has no ${side} command streams`);
  return streams;
}

function sideVoiceSlots(
  profile: ReferenceProfile,
  side: "left" | "right",
): Readonly<Record<string, number>> {
  const slots = (profile.voiceSlots as
    Partial<Record<"left" | "right", Readonly<Record<string, number>>>>)[side];
  if (!slots) throw new Error(`record ${profile.nativeRecord} has no ${side} voice slots`);
  return slots;
}

const reachableSides = (profile: ReferenceProfile): readonly ("left" | "right")[] =>
  profile.reach === "right-only" ? ["right"] : ["left", "right"];

type ReferenceAnimationMode = "none" | "alternate" | "cycle4" | "cycle6";

/**
 * One module-29 channel. Its position, animation mode and animation counter
 * carry from stream to stream; nothing resets them between the strike,
 * post-hit, hold and death streams.
 */
interface ReferenceChannel {
  x: number;
  y: number;
  mode: ReferenceAnimationMode;
  counter: number;
}

interface ReferenceChannelEnd extends ReferenceChannel {
  latchedFrame: number;
}

interface ReferenceFrame {
  frame: number;
  x: number;
  /** Battle-window y of the bitmap's bottom anchor. */
  y: number;
}

const GROUND_Y: number = STAGE0_FULL_COMBAT_GEOMETRY.characterInitialization.actor.y;

/** `B061/B1FD` start every channel on the ground line in mode `XN`. */
function referenceChannel(x = 0, y = GROUND_Y): ReferenceChannel {
  return { x, y, mode: "none", counter: 0 };
}

/** `B1A8/B344`: the counter moves on every draw, or clears in any other mode. */
function nextReferenceCounter(mode: ReferenceAnimationMode, counter: number): number {
  if (mode === "alternate") return counter ^ 1;
  if (mode === "cycle4") return (counter + 1) % 4;
  if (mode === "cycle6") return (counter + 1) % 6;
  return 0;
}

/**
 * Replays one stream on a channel: a step's commands apply first, every draw
 * advances the counter, and `dx/dy` accumulate only after the draw.
 */
function referenceReplay(
  steps: readonly ReferenceCommandStep[],
  initial: ReferenceChannel = referenceChannel(),
): { frames: ReferenceFrame[]; end: ReferenceChannelEnd } {
  const channel = { ...initial };
  const frames: ReferenceFrame[] = [];
  let latchedFrame = steps[0]?.pose.frame ?? 0;
  for (const step of steps) {
    for (const command of step.commands) {
      if (command.token === ":X") channel.mode = "alternate";
      if (command.token === "X4") channel.mode = "cycle4";
      if (command.token === "X6") channel.mode = "cycle6";
      if (command.token === "XN") channel.mode = "none";
      if (command.token === ":S") {
        const [nextX, nextY] = command.parameters;
        if (typeof nextX === "number") channel.x = nextX;
        if (typeof nextY === "number") channel.y = nextY;
      }
    }
    latchedFrame = step.pose.frame;
    for (let substep = 0; substep < step.rendererSubsteps; substep += 1) {
      channel.counter = nextReferenceCounter(channel.mode, channel.counter);
      frames.push({ frame: latchedFrame + channel.counter, x: channel.x, y: channel.y });
      channel.x += step.pose.deltaX;
      channel.y += step.pose.deltaY;
    }
  }
  return { frames, end: { ...channel, latchedFrame } };
}

/** `AD51` hold redraws: the channel stays put while its counter keeps moving. */
function referenceRedraws(channel: ReferenceChannelEnd, draws: number): number[] {
  const frames: number[] = [];
  let counter = channel.counter;
  for (let draw = 0; draw < draws; draw += 1) {
    counter = nextReferenceCounter(channel.mode, counter);
    frames.push(channel.latchedFrame + counter);
  }
  return frames;
}

/**
 * Fresh-channel frames from an explicit origin. The linked `G1..G5` streams
 * open with `:S`, and the remake still restarts their counters at the
 * post-hit hand-over.
 */
function referenceNativeFrames(
  steps: readonly ReferenceCommandStep[],
  initialX = 0,
  initialY = 0,
): ReferenceFrame[] {
  return referenceReplay(steps, referenceChannel(initialX, initialY)).frames;
}

/** Nothing holds a channel on the ground line; the `DF86` clip hides what sinks. */
function referenceLift(y: number): number {
  return GROUND_Y - y;
}

function referenceNativeEnd(
  steps: readonly ReferenceCommandStep[],
  initialX = 0,
  initialY = 0,
): { x: number; y: number } {
  const { x, y } = referenceReplay(steps, referenceChannel(initialX, initialY)).end;
  return { x, y };
}

function referenceFrameIntersectsViewport(
  side: "left" | "right",
  record: number,
  set: "direct" | "plus50",
  frame: number,
  x: number,
): boolean {
  const meta = FULL_COMBAT_FRAME_META[side][record][set][frame];
  const left = x - meta.anchor;
  return left < 448 && left + meta.w > 0;
}

function referenceNativeCameraFrames(
  steps: readonly ReferenceCommandStep[],
  initialDirection: -1 | 0 | 1 = 0,
): { camera: number[]; final: number; direction: -1 | 0 | 1 } {
  const camera: number[] = [];
  let distance = 0;
  let direction = initialDirection;
  for (const step of steps) {
    for (const command of step.commands) {
      if (command.token === ":R") direction = 1;
      if (command.token === ":L") direction = -1;
      if (command.token === ":J") direction = 0;
    }
    for (let substep = 0; substep < step.rendererSubsteps; substep += 1) {
      camera.push(distance);
      distance += direction * 8;
    }
  }
  return { camera, final: distance, direction };
}

function nativeVoiceEvents(
  steps: readonly ReferenceCommandStep[],
  voiceSlots: Readonly<Record<string, number>>,
  substepMs: number,
): Array<{ offset: number; record: number }> {
  const events: Array<{ offset: number; record: number }> = [];
  let offset = 0;
  for (const step of steps) {
    for (const command of step.commands) {
      if (/^V[1-5]$/u.test(command.token)) {
        events.push({ offset, record: voiceSlots[command.token] });
      }
    }
    offset += step.rendererSubsteps * substepMs;
  }
  return events;
}

type ReferenceEffectMode = "N" | "Y" | "U";

interface ReferencePresentationState {
  actorEffect: ReferenceEffectMode;
  victimEffect: ReferenceEffectMode;
  displayMode: "ND" | "YD";
  displayToggle: 0 | 4;
  viewportYOffset: number;
  trailOffset: number;
  trailX: number[];
  trailFrame: number[];
  attackTrailTowardRight: boolean;
  particles: Array<{ x: number; y: number; frame: number }>;
}

type ReferenceTrailPhase = "attack" | "hurt" | "guard" | "death";

function initialReferencePresentation(
  actorSide: "left" | "right" = "left",
): ReferencePresentationState {
  return {
    actorEffect: "N",
    victimEffect: "N",
    displayMode: "ND",
    displayToggle: 0,
    viewportYOffset: 0,
    trailOffset: 0,
    trailX: Array<number>(6).fill(0),
    trailFrame: Array<number>(6).fill(0),
    attackTrailTowardRight: actorSide === "right",
    particles: [],
  };
}

function cloneReferencePresentation(
  state: ReferencePresentationState,
): ReferencePresentationState {
  return {
    ...state,
    trailX: [...state.trailX],
    trailFrame: [...state.trailFrame],
    particles: state.particles.map((particle) => ({ ...particle })),
  };
}

function referenceCommandsAtSubstep(
  steps: readonly ReferenceCommandStep[],
  target: number,
): ReferenceCommandStep["commands"] {
  let substep = 0;
  for (const step of steps) {
    if (substep === target) return step.commands;
    substep += step.rendererSubsteps;
    if (substep > target) return [];
  }
  return [];
}

function applyReferencePresentationCommands(
  state: ReferencePresentationState,
  role: "actor" | "victim",
  commands: ReferenceCommandStep["commands"],
): void {
  for (const command of commands) {
    if (command.token === "YD") state.displayMode = "YD";
    if (command.token === "ND") state.displayMode = "ND";
    const effect = command.token === "EY"
      ? "Y"
      : command.token === "UE"
        ? "U"
        : command.token === "NE"
          ? "N"
          : undefined;
    if (effect && role === "actor") state.actorEffect = effect;
    if (effect && role === "victim") state.victimEffect = effect;
  }
}

function referencePresentationFrames(
  actorSteps: readonly ReferenceCommandStep[],
  victimSteps: readonly ReferenceCommandStep[],
  coordinates: readonly { actorX: number; victimX: number }[],
  actorSide: "left" | "right",
  phase: ReferenceTrailPhase,
  initial = initialReferencePresentation(actorSide),
): { frames: Array<Pick<ReferencePresentationState, "viewportYOffset" | "particles">>; final: ReferencePresentationState } {
  const state = cloneReferencePresentation(initial);
  const frames: Array<Pick<ReferencePresentationState, "viewportYOffset" | "particles">> = [];
  for (let substep = 0; substep < coordinates.length; substep += 1) {
    applyReferencePresentationCommands(
      state,
      "actor",
      referenceCommandsAtSubstep(actorSteps, substep),
    );
    applyReferencePresentationCommands(
      state,
      "victim",
      referenceCommandsAtSubstep(victimSteps, substep),
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
    } else {
      const effect = effectRole === "actor" ? state.actorEffect : state.victimEffect;
      const subjectX = coordinates[substep][effectRole === "actor" ? "actorX" : "victimX"];
      const effectTowardRight = (effectRole === "actor" && effect === "U")
        || (effectRole === "victim" && effect === "Y");
      const subjectSide = effectRole === "actor"
        ? actorSide
        : actorSide === "left" ? "right" : "left";
      const nativeTowardRight = subjectSide === "right"
        ? !effectTowardRight
        : effectTowardRight;
      const towardRight = phase === "death"
        // B683/B6BD install UE on the physical left/right sprite stream.
        // B3BD therefore uses its left-U (+40/+24) or right-U (-40/-24)
        // branch directly: both death trails point toward the window centre.
        ? subjectSide === "left"
        : phase === "guard"
          ? effectRole === "actor"
            ? !state.attackTrailTowardRight
            : subjectSide === "left"
          : nativeTowardRight;
      if (phase === "attack") state.attackTrailTowardRight = towardRight;
      const direction = towardRight ? 24 : -24;
      state.trailX[0] = subjectX
        + (towardRight ? 40 + state.trailOffset : -40 - state.trailOffset);
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
    frames.push({
      viewportYOffset: state.viewportYOffset,
      particles: state.particles.map((particle) => ({ ...particle })),
    });
  }
  return { frames, final: state };
}

interface ReferenceLinkedCommand {
  token: "G1" | "G2" | "G3" | "G4" | "G5";
  offset: number;
  steps: readonly ReferenceCommandStep[];
}

function referenceLinkedCommands(
  steps: readonly ReferenceCommandStep[],
): ReferenceLinkedCommand[] {
  const links: ReferenceLinkedCommand[] = [];
  let offset = 0;
  for (const step of steps) {
    for (const command of step.commands) {
      if (/^G[1-5]$/u.test(command.token) && command.linkedStream) {
        links.push({
          token: command.token as ReferenceLinkedCommand["token"],
          offset,
          steps: command.linkedStream.steps,
        });
      }
    }
    offset += step.rendererSubsteps;
  }
  return links;
}

function expectedVictimMark(record: number, side: "left" | "right"): number {
  const profile = Object.values(STAGE0_FULL_COMBAT_PROFILES)
    .find((candidate) => candidate.nativeRecord === record);
  if (!profile) throw new Error(`missing full-combat profile ${record}`);
  const stream = sideStreams(profile, side).mainRightOrDefender
    .steps as readonly ReferenceCommandStep[];
  const initialX = STAGE0_FULL_COMBAT_GEOMETRY.characterInitialization
    .opponentByActorSide[side].x;
  return referenceNativeEnd(stream, initialX, 0).x;
}

function expectedActorMark(_record: number, _side: "left" | "right"): number {
  return STAGE0_FULL_COMBAT_GEOMETRY.characterInitialization.actor.x;
}

describe("Full-screen ordinary combat choreography", () => {
  it("advances the per-record acceptance gate without gaps", () => {
    expect(FULL_COMBAT_ACCEPTANCE).toHaveLength(39);
    expect(FULL_COMBAT_ACCEPTANCE.map(({ record }) => record))
      .toEqual(Array.from({ length: 39 }, (_, record) => record));
    expect(ACCEPTED_FULL_COMBAT_RECORDS)
      .toEqual(Array.from({ length: 39 }, (_, record) => record));
    expect(FULL_COMBAT_ACCEPTANCE.every((entry) =>
      entry.evidence?.commandStreams
      && entry.evidence.framePlacement
      && (entry.evidence.leftAndRightSemantics || entry.evidence.rightOnlyOriginal)
      && entry.evidence.attackScreenshot.endsWith("-attack.png")
      && entry.evidence.guardScreenshot.endsWith("-guard.png")
      && entry.evidence.hurtScreenshot.endsWith("-hurt.png")
      && entry.evidence.deathScreenshot.endsWith("-death.png"))).toBe(true);
    // 36–38 曾被误标为 not-applicable-original：当时只检查了 side 1 描述符，
    // 但原版这三条记录的 side 2 表现块与 Y_00 图形都有效，只是左侧不可达。
    expect(FULL_COMBAT_ACCEPTANCE.slice(36))
      .toEqual([36, 37, 38].map((record) => expect.objectContaining({
        record,
        status: "accepted",
        reach: "right-only",
        evidence: expect.objectContaining({ rightOnlyOriginal: true }),
      })));
    expect(FULL_COMBAT_ACCEPTANCE[35]).toMatchObject({
      classId: "empress",
      status: "accepted",
      reach: "right-only",
      evidence: { rightOnlyOriginal: true },
    });
    expect(FULL_COMBAT_ACCEPTANCE.slice(0, 35).every(({ reach }) => reach === "both-sides"))
      .toBe(true);
  });

  it("packages native command and graphic evidence for all 39 records", () => {
    const profiles = Object.values(STAGE0_FULL_COMBAT_PROFILES);
    expect(profiles).toHaveLength(39);
    expect(profiles.map(({ nativeRecord }) => nativeRecord))
      .toEqual(Array.from({ length: 39 }, (_, record) => record));
    // 36–38 只在 side 2 编队出现，原版没有 side 1 表现块，也没有 `M_00/86..88`。
    expect(profiles.filter(({ reach }) => reach === "right-only")
      .map(({ nativeRecord }) => nativeRecord)).toEqual([36, 37, 38]);
    for (const profile of profiles) {
      for (const side of reachableSides(profile)) {
        expect(Object.keys(sideStreams(profile, side))).toEqual([...STREAM_KEYS]);
      }
      if (profile.reach === "right-only") {
        expect(() => sideStreams(profile, "left")).toThrow();
        expect(() => sideVoiceSlots(profile, "left")).toThrow();
      }
    }
    // `left` 只覆盖 0–35；女帝（35）保留空数组是既有表示，36–38 则整条缺席。
    expect(Object.keys(STAGE0_FULL_COMBAT_ASSETS.left)).toHaveLength(36);
    expect(Object.keys(STAGE0_FULL_COMBAT_ASSETS.right)).toHaveLength(39);
    expect(STAGE0_FULL_COMBAT_ASSETS.left.empress.direct).toHaveLength(0);
    expect(STAGE0_FULL_COMBAT_ASSETS.left.empress.plus50).toHaveLength(0);
    expect(STAGE0_FULL_COMBAT_ASSETS.right.empress.direct.length).toBeGreaterThan(0);
    expect(STAGE0_FULL_COMBAT_ASSETS.right.empress.plus50.length).toBeGreaterThan(0);
    for (const classId of ["dragon", "head", "hand"] as const) {
      expect(STAGE0_FULL_COMBAT_ASSETS.left).not.toHaveProperty(classId);
      expect(STAGE0_FULL_COMBAT_ASSETS.right[classId].direct.length).toBeGreaterThan(0);
      expect(STAGE0_FULL_COMBAT_ASSETS.right[classId].plus50.length).toBeGreaterThan(0);
    }
  });

  it.each(Object.entries(STAGE0_FULL_COMBAT_PROFILES).flatMap(([classId, profile]) =>
    reachableSides(profile)
      // 女帝（35）左侧命令流存在，但 `M_00/35` 是 3 字节占位、`M_00/85` 缺失，
      // 没有可渲染的左侧图形，所以逐子步比对同样只覆盖右侧。
      .filter((side) => !(profile.nativeRecord === 35 && side === "left"))
      .map((side) => ({
        classId: classId as UnitClassId,
        record: profile.nativeRecord,
        profile,
        side,
      }))),
  )(
    "matches every native body/reaction substep and cue for record $record $side",
    ({ classId, record, profile, side }) => {
      const attackerSide = side === "left" ? 1 : 2;
      const defenderSide = attackerSide === 1 ? 2 : 1;
      const attackResult = result({
        attackerId: `${attackerSide}:${attackerSide === 1 ? 0 : 48}`,
        defenderId: `${defenderSide}:${defenderSide === 1 ? 0 : 48}`,
        counterOccurred: false,
        counterDamage: 0,
      });
      const script = buildFullCombatScript(
        unit(attackerSide, attackerSide === 1 ? 0 : 48, "逐步攻方", classId),
        unit(defenderSide, defenderSide === 1 ? 0 : 48, "逐步守方"),
        attackResult,
      );
      const start = markTime(script, "fullWindup");
      const impact = markTime(script, "fullImpact");
      const hold = markTime(script, "fullHold");
      const streams = sideStreams(profile, side);
      const mainActor = streams.mainLeftOrAttacker.steps as readonly ReferenceCommandStep[];
      const mainVictim = streams.mainRightOrDefender.steps as readonly ReferenceCommandStep[];
      const victimStartX = STAGE0_FULL_COMBAT_GEOMETRY.characterInitialization
        .opponentByActorSide[side].x;
      const mainActorReplay = referenceReplay(
        mainActor,
        referenceChannel(expectedActorMark(record, side)),
      );
      const mainVictimReplay = referenceReplay(mainVictim, referenceChannel(victimStartX));
      const mainActorFrames = mainActorReplay.frames;
      const mainVictimFrames = mainVictimReplay.frames;
      const mainCamera = referenceNativeCameraFrames(mainActor);
      const victimMark = expectedVictimMark(record, side);
      expect(mainVictimReplay.end.x).toBe(victimMark);
      expect(mainVictimFrames).toHaveLength(mainActorFrames.length);
      const mainPresentation = referencePresentationFrames(
        mainActor,
        mainVictim,
        mainActorFrames.map((actorFrame, index) => ({
          actorX: actorFrame.x,
          victimX: mainVictimFrames[index].x,
        })),
        side,
        "attack",
      );

      expect(impact - start).toBe(mainActorFrames.length * 40);
      for (let index = 0; index < mainActorFrames.length; index += 1) {
        const state = script.sample(start + index * 40 + 1);
        const expectedActor = mainActorFrames[index];
        const actualActor = state.sprites.find(({ channel }) => channel === "actor");
        if (!referenceFrameIntersectsViewport(
          side,
          record,
          "plus50",
          expectedActor.frame,
          expectedActor.x,
        )) {
          expect(actualActor).toBeUndefined();
        } else {
          expect(actualActor).toMatchObject({
            classId: record,
            side,
            frame: expectedActor.frame,
            x: expectedActor.x,
            lift: referenceLift(expectedActor.y),
          });
        }
        const expectedVictim = mainVictimFrames[index];
        const victimX = expectedVictim.x;
        const actualVictim = state.sprites.find(({ channel }) => channel === "victim");
        if (!referenceFrameIntersectsViewport(
          side === "left" ? "right" : "left",
          0,
          "direct",
          expectedVictim.frame,
          victimX,
        )) {
          expect(actualVictim).toBeUndefined();
        } else {
          expect(actualVictim).toMatchObject({
            side: side === "left" ? "right" : "left",
            frame: expectedVictim.frame,
            x: victimX,
            lift: referenceLift(expectedVictim.y),
          });
        }
        expect(state.camera).toBe(mainCamera.camera[index]);
        expect(state.viewportYOffset).toBe(mainPresentation.frames[index].viewportYOffset);
        expect(state.particles).toEqual(mainPresentation.frames[index].particles);
      }

      const mainLinks = referenceLinkedCommands(mainActor);
      expect(new Set(mainLinks.map(({ token }) => token)).size).toBe(mainLinks.length);
      for (const link of mainLinks) {
        const linkedFrames = referenceNativeFrames(link.steps);
        for (let index = 0; index < linkedFrames.length; index += 1) {
          const globalSubstep = link.offset + index;
          if (globalSubstep >= mainActorFrames.length) break;
          const state = script.sample(start + globalSubstep * 40 + 1);
          const expected = linkedFrames[index];
          if (record === 20) {
            expect(state.projectile).toMatchObject({
              side,
              frame: expected.frame,
              x: expected.x,
              y: expected.y,
            });
          } else if (record === 22) {
            expect(state.lance).toMatchObject({
              side,
              frame: expected.frame,
              x: expected.x,
              y: expected.y,
            });
          } else {
            const actual = state.sprites.find(({ channel }) => channel === link.token);
            if (!referenceFrameIntersectsViewport(
              side,
              record,
              "plus50",
              expected.frame,
              expected.x,
            )) {
              expect(actual).toBeUndefined();
            } else {
              expect(actual).toMatchObject({
                side,
                classId: record,
                frame: expected.frame,
                x: expected.x,
                lift: STAGE0_FULL_COMBAT_GEOMETRY.characterInitialization.actor.y - expected.y,
              });
            }
          }
        }
      }

      for (const reaction of ["hurt", "guard"] as const) {
        const reactionScript = reaction === "hurt"
          ? script
          : buildFullCombatScript(
            unit(attackerSide, attackerSide === 1 ? 0 : 48, "逐步攻方", classId),
            unit(defenderSide, defenderSide === 1 ? 0 : 48, "逐步守方"),
            { ...attackResult, damage: 8 },
          );
        const reactionImpact = markTime(reactionScript, "fullImpact");
        const reactionHold = markTime(reactionScript, "fullHold");
        const actorKey = reaction === "hurt" ? "auxiliaryA" : "auxiliaryC";
        const victimKey = reaction === "hurt" ? "auxiliaryB" : "auxiliaryD";
        const actorSteps = streams[actorKey].steps as readonly ReferenceCommandStep[];
        const victimSteps = streams[victimKey].steps as readonly ReferenceCommandStep[];
        // Both main channels continue their strike-stream state: position,
        // animation mode and counter all carry into the post-hit streams.
        const actorReplay = referenceReplay(actorSteps, mainActorReplay.end);
        const victimReplay = referenceReplay(victimSteps, mainVictimReplay.end);
        const actorFrames = actorReplay.frames;
        const victimFrames = victimReplay.frames;
        expect(victimFrames).toHaveLength(actorFrames.length);
        const postCamera = referenceNativeCameraFrames(actorSteps, mainCamera.direction);
        const postPresentation = referencePresentationFrames(
          actorSteps,
          victimSteps,
          actorFrames.map((actorFrame) => ({
            actorX: actorFrame.x,
            victimX: victimMark,
          })),
          side,
          reaction,
          mainPresentation.final,
        );
        expect(reactionHold - reactionImpact).toBe(actorFrames.length * 50);
        for (let index = 0; index < actorFrames.length; index += 1) {
          const state = reactionScript.sample(reactionImpact + index * 50 + 1);
          const expectedActor = actorFrames[index];
          const actualActor = state.sprites.find(({ channel }) => channel === "actor");
          if (!referenceFrameIntersectsViewport(
            side,
            record,
            "plus50",
            expectedActor.frame,
            expectedActor.x,
          )) {
            expect(actualActor).toBeUndefined();
          } else {
            expect(actualActor).toMatchObject({
              frame: expectedActor.frame,
              x: expectedActor.x,
              lift: referenceLift(expectedActor.y),
            });
          }
          const expectedVictim = victimFrames[index];
          expect(state.sprites.find(({ channel }) => channel === "victim"))
            .toMatchObject({
              reaction,
              frame: expectedVictim.frame,
              x: victimMark,
              lift: referenceLift(expectedVictim.y),
            });
          expect(state.camera).toBe(mainCamera.final + postCamera.camera[index]);
          expect(state.viewportYOffset).toBe(postPresentation.frames[index].viewportYOffset);
          expect(state.particles).toEqual(postPresentation.frames[index].particles);
        }

        // AD36 redraws both main channels where the post-hit streams left them,
        // without dust or YD shift, until 20 draws have passed since impact;
        // neither life here sits on a gauge tier boundary. Past 20 post-hit
        // substeps nothing is redrawn and the last post-hit image stays.
        const holdDraws = Math.max(0, STAGE0_FULL_COMBAT_HOLD.drawLimit - actorFrames.length);
        const lastActor = actorFrames.at(-1);
        const lastVictim = victimFrames.at(-1);
        const lastPresentation = postPresentation.frames.at(-1);
        if (!lastActor || !lastVictim || !lastPresentation) throw new Error("empty post-hit stream");
        const victimHoldFrames = referenceRedraws(victimReplay.end, holdDraws);
        const holdSamples = holdDraws > 0
          ? referenceRedraws(actorReplay.end, holdDraws).map((frame, draw) => ({
            t: reactionHold + draw * 32 + 1,
            actor: { frame, x: actorReplay.end.x, y: actorReplay.end.y },
            victim: { frame: victimHoldFrames[draw], y: victimReplay.end.y },
            viewportYOffset: 0,
            particles: [] as ReferencePresentationState["particles"],
          }))
          : [{
            t: reactionHold + 1,
            actor: lastActor,
            victim: lastVictim,
            viewportYOffset: lastPresentation.viewportYOffset,
            particles: lastPresentation.particles,
          }];
        const settled = holdSamples.at(-1);
        if (!settled) throw new Error("missing hold sample");
        holdSamples.push({ ...settled, t: reactionHold + 660 });
        for (const expected of holdSamples) {
          const state = reactionScript.sample(expected.t);
          const actualActor = state.sprites.find(({ channel }) => channel === "actor");
          if (!referenceFrameIntersectsViewport(
            side,
            record,
            "plus50",
            expected.actor.frame,
            expected.actor.x,
          )) {
            expect(actualActor).toBeUndefined();
          } else {
            expect(actualActor).toMatchObject({
              frame: expected.actor.frame,
              x: expected.actor.x,
              lift: referenceLift(expected.actor.y),
            });
          }
          expect(state.shadows.map(({ channel }) => channel)).toEqual(["victim", "actor"]);
          expect(state.sprites.find(({ channel }) => channel === "victim"))
            .toMatchObject({
              reaction,
              frame: expected.victim.frame,
              x: victimMark,
              lift: referenceLift(expected.victim.y),
            });
          expect(state.camera).toBe(mainCamera.final + postCamera.final);
          expect(state.viewportYOffset).toBe(expected.viewportYOffset);
          expect(state.particles).toEqual(expected.particles);
        }

        const postLinks = referenceLinkedCommands(actorSteps);
        expect(new Set(postLinks.map(({ token }) => token)).size).toBe(postLinks.length);
        for (const link of postLinks) {
          const strikeLink = mainLinks.find(({ token }) => token === link.token);
          const strikeEnd = strikeLink
            ? referenceNativeEnd(strikeLink.steps)
            : { x: 0, y: 0 };
          const linkedFrames = referenceNativeFrames(link.steps, strikeEnd.x, strikeEnd.y);
          for (let index = 0; index < linkedFrames.length; index += 1) {
            const globalSubstep = link.offset + index;
            if (globalSubstep >= actorFrames.length) break;
            const state = reactionScript.sample(reactionImpact + globalSubstep * 50 + 1);
            const expected = linkedFrames[index];
            if (record === 20) {
              expect(state.projectile).toMatchObject({
                side,
                frame: expected.frame,
                x: expected.x,
                y: expected.y,
              });
            } else {
              const actual = state.sprites.find(({ channel }) => channel === link.token);
              if (
                record === 22
                || !referenceFrameIntersectsViewport(
                  side,
                  record,
                  "plus50",
                  expected.frame,
                  expected.x,
                )
              ) {
                expect(actual).toBeUndefined();
              } else {
                expect(actual).toMatchObject({
                  side,
                  classId: record,
                  frame: expected.frame,
                  x: expected.x,
                  lift: STAGE0_FULL_COMBAT_GEOMETRY.characterInitialization.actor.y - expected.y,
                });
              }
            }
          }
        }
      }

      const voiceSlots = sideVoiceSlots(profile, side);
      const expectedMainCues = [mainActor, mainVictim]
        .flatMap((steps) => nativeVoiceEvents(steps, voiceSlots, 40))
        .sort((left, right) => left.offset - right.offset)
        .map(({ offset, record: voiceRecord }) => ({
          t: start + offset,
          record: voiceRecord,
        }));
      expect(script.cues
        .filter(({ reason }) => reason.includes(`native-${record}-`))
        .map(({ t, record: voiceRecord }) => ({ t, record: voiceRecord })))
        .toEqual(expectedMainCues);

      const expectedReactionCues = [streams.auxiliaryA.steps, streams.auxiliaryB.steps]
        .flatMap((steps) => nativeVoiceEvents(
          steps as readonly ReferenceCommandStep[],
          voiceSlots,
          50,
        ))
        .sort((left, right) => left.offset - right.offset)
        .map(({ offset, record: voiceRecord }) => ({
          t: impact + offset,
          record: voiceRecord,
        }));
      const actualReactionCues = script.cues
        .filter(({ t }) => t >= impact && t < hold)
        .map(({ t, record: voiceRecord }) => ({ t, record: voiceRecord }));
      // The impact sound is exactly what the threshold-selected streams ask
      // for. `A24D`/`A28E` only repoint stream pointers, so a stream with no
      // voice record must stay silent rather than fall back to E/2.
      expect(actualReactionCues).toEqual(expectedReactionCues);

      const sideAssets = STAGE0_FULL_COMBAT_ASSETS[side] as Readonly<
        Record<string, { direct: readonly string[]; plus50: readonly string[] }>
      >;
      const actorAssets = sideAssets[classId];
      const assertFramesInRange = (
        steps: readonly ReferenceCommandStep[],
        frameCount: number,
      ): void => {
        for (const frame of referenceNativeFrames(steps)) {
          expect(frame.frame).toBeGreaterThanOrEqual(0);
          expect(frame.frame).toBeLessThan(frameCount);
        }
        for (const step of steps) {
          for (const command of step.commands) {
            if (command.linkedStream) {
              assertFramesInRange(command.linkedStream.steps, actorAssets.plus50.length);
            }
          }
        }
      };
      assertFramesInRange(mainActor, actorAssets.plus50.length);
      assertFramesInRange(mainVictim, actorAssets.direct.length);
      assertFramesInRange(streams.auxiliaryA.steps as readonly ReferenceCommandStep[], actorAssets.plus50.length);
      assertFramesInRange(streams.auxiliaryB.steps as readonly ReferenceCommandStep[], actorAssets.direct.length);
      assertFramesInRange(streams.auxiliaryC.steps as readonly ReferenceCommandStep[], actorAssets.plus50.length);
      assertFramesInRange(streams.auxiliaryD.steps as readonly ReferenceCommandStep[], actorAssets.direct.length);
    },
  );

  it.each(["left", "right"] as const)(
    "matches every native death substep, camera step and common effect for a $side attacker",
    (side) => {
      const attackerSide = side === "left" ? 1 : 2;
      const defenderSide = attackerSide === 1 ? 2 : 1;
      const script = buildFullCombatScript(
        unit(attackerSide, attackerSide === 1 ? 0 : 48, "死亡流攻方"),
        unit(defenderSide, defenderSide === 1 ? 0 : 48, "死亡流守方"),
        result({
          attackerId: `${attackerSide}:${attackerSide === 1 ? 0 : 48}`,
          defenderId: `${defenderSide}:${defenderSide === 1 ? 0 : 48}`,
          counterOccurred: false,
          counterDamage: 0,
          defenderDied: true,
        }),
      );
      const start = markTime(script, "fullWindup");
      const deathStart = markTime(script, "fullDefenderDeath");
      const profile = STAGE0_FULL_COMBAT_PROFILES.soldier;
      const streams = sideStreams(profile, side);
      const mainActor = streams.mainLeftOrAttacker.steps as readonly ReferenceCommandStep[];
      const mainVictim = streams.mainRightOrDefender.steps as readonly ReferenceCommandStep[];
      const mainActorFrames = referenceNativeFrames(mainActor, expectedActorMark(0, side), 0);
      const mainVictimFrames = referenceNativeFrames(mainVictim);
      const mainVictimEnd = referenceNativeEnd(mainVictim);
      const victimMark = expectedVictimMark(0, side);
      const mainPresentation = referencePresentationFrames(
        mainActor,
        mainVictim,
        mainActorFrames.map((actorFrame, index) => ({
          actorX: actorFrame.x,
          victimX: victimMark + mainVictimFrames[index].x - mainVictimEnd.x,
        })),
        side,
        "attack",
      );
      const postActor = streams.auxiliaryA.steps as readonly ReferenceCommandStep[];
      const postVictim = streams.auxiliaryB.steps as readonly ReferenceCommandStep[];
      const mainActorEnd = referenceNativeEnd(mainActor, expectedActorMark(0, side), 0);
      const postActorFrames = referenceNativeFrames(postActor, mainActorEnd.x, 0);
      const postPresentation = referencePresentationFrames(
        postActor,
        postVictim,
        postActorFrames.map((actorFrame) => ({ actorX: actorFrame.x, victimX: victimMark })),
        side,
        "hurt",
        mainPresentation.final,
      );
      const victimSide = side === "left" ? "right" : "left";
      const deathSteps = STAGE0_FULL_COMBAT_DEATH[victimSide]
        .steps as readonly ReferenceCommandStep[];
      const deathFrames = referenceNativeFrames(deathSteps, victimMark, 0);
      const deathInitial = cloneReferencePresentation(postPresentation.final);
      deathInitial.actorEffect = "N";
      deathInitial.victimEffect = "N";
      const deathPresentation = referencePresentationFrames(
        [],
        deathSteps,
        deathFrames.map(() => ({ actorX: victimMark, victimX: victimMark })),
        side,
        "death",
        deathInitial,
      );
      const mainCamera = referenceNativeCameraFrames(mainActor);
      const postCamera = referenceNativeCameraFrames(postActor, mainCamera.direction);
      const deathCamera = referenceNativeCameraFrames(deathSteps);

      expect(deathStart - start).toBe((mainActorFrames.length * 40) + (postActorFrames.length * 50));
      expect(script.duration - deathStart).toBe(deathFrames.length * 50);
      expect(script.cues).toContainEqual(expect.objectContaining({
        t: deathStart,
        record: STAGE0_FULL_COMBAT_DEATH.soundRecord,
        reason: "full-primary-death",
      }));
      for (let index = 0; index < deathFrames.length; index += 1) {
        const state = script.sample(deathStart + index * 50 + 1);
        expect(state.sprites.find(({ channel }) => channel === "victim")).toMatchObject({
          side: victimSide,
          frame: deathFrames[index].frame,
          x: victimMark,
          lift: 0,
          reaction: "death",
          opacity: 1,
        });
        expect(state.camera).toBe(
          mainCamera.final + postCamera.final + deathCamera.camera[index],
        );
        expect(state.viewportYOffset).toBe(deathPresentation.frames[index].viewportYOffset);
        expect(state.particles).toEqual(deathPresentation.frames[index].particles);
        const inwardOffset = state.particles[0].x - victimMark;
        expect(Math.sign(inwardOffset)).toBe(victimSide === "left" ? 1 : -1);
        expect(Math.abs(inwardOffset)).toBeGreaterThanOrEqual(40);
        expect(Math.abs(inwardOffset)).toBeLessThanOrEqual(64);
        expect(state.particles[1].x - state.particles[0].x)
          .toBe(victimSide === "left" ? 24 : -24);
      }
    },
  );

  it.each(Object.entries(STAGE0_FULL_COMBAT_PROFILES).flatMap(([classId, profile]) =>
    reachableSides(profile)
      .filter((side) => !(profile.nativeRecord === 35 && side === "left"))
      .map((side) => ({
        classId: classId as UnitClassId,
        record: profile.nativeRecord,
        profile,
        side,
      }))),
  )(
    "keeps record $record's $side attacker on the DS:7DAE survivor poses while its target dies",
    ({ classId, record, profile, side }) => {
      const attackerSide = side === "left" ? 1 : 2;
      const defenderSide = attackerSide === 1 ? 2 : 1;
      const script = buildFullCombatScript(
        unit(attackerSide, attackerSide === 1 ? 0 : 48, "存活攻方", classId),
        unit(defenderSide, defenderSide === 1 ? 0 : 48, "倒地守方"),
        result({
          attackerId: `${attackerSide}:${attackerSide === 1 ? 0 : 48}`,
          defenderId: `${defenderSide}:${defenderSide === 1 ? 0 : 48}`,
          counterOccurred: false,
          counterDamage: 0,
          defenderDied: true,
        }),
      );
      const deathStart = markTime(script, "fullDefenderDeath");
      const streams = sideStreams(profile, side);
      const victimSide = side === "left" ? "right" : "left";
      const strike = referenceReplay(
        streams.mainLeftOrAttacker.steps as readonly ReferenceCommandStep[],
        referenceChannel(expectedActorMark(record, side)),
      );
      const approach = referenceReplay(
        streams.mainRightOrDefender.steps as readonly ReferenceCommandStep[],
        referenceChannel(STAGE0_FULL_COMBAT_GEOMETRY.characterInitialization
          .opponentByActorSide[side].x),
      );
      const post = referenceReplay(
        streams.auxiliaryA.steps as readonly ReferenceCommandStep[],
        strike.end,
      );
      const reaction = referenceReplay(
        streams.auxiliaryB.steps as readonly ReferenceCommandStep[],
        approach.end,
      );
      // B683/B6BD clear every channel pointer, then give the dead side its
      // death stream and the survivor the still frame-0 poses at DS:7DAE. The
      // survivor keeps its position and inherited animation counter.
      const survivor = referenceReplay(
        STAGE0_FULL_COMBAT_DEATH.survivor.steps as readonly ReferenceCommandStep[],
        post.end,
      );
      const body = referenceReplay(
        STAGE0_FULL_COMBAT_DEATH[victimSide].steps as readonly ReferenceCommandStep[],
        reaction.end,
      );
      const sideAssets = STAGE0_FULL_COMBAT_ASSETS[side] as Readonly<
        Record<string, { plus50: readonly string[] }>
      >;
      expect(survivor.frames).toHaveLength(24);
      expect(body.frames).toHaveLength(24);
      for (let index = 0; index < survivor.frames.length; index += 1) {
        const expected = survivor.frames[index];
        expect(expected).toMatchObject({ x: post.end.x, y: post.end.y });
        expect(expected.frame).toBeLessThan(sideAssets[classId].plus50.length);
        const state = script.sample(deathStart + index * 50 + 1);
        const actor = state.sprites.find(({ channel }) => channel === "actor");
        if (!referenceFrameIntersectsViewport(side, record, "plus50", expected.frame, expected.x)) {
          expect(actor).toBeUndefined();
        } else {
          expect(actor).toMatchObject({
            side,
            classId: record,
            set: "plus50",
            frame: expected.frame,
            x: expected.x,
            lift: referenceLift(expected.y),
          });
        }
        expect(state.shadows.map(({ side: shadowSide, channel }) => [shadowSide, channel]))
          .toEqual([[victimSide, "victim"], [side, "actor"]]);
        expect(state.sprites.find(({ channel }) => channel === "victim")).toMatchObject({
          frame: body.frames[index].frame,
          x: body.frames[index].x,
          lift: referenceLift(body.frames[index].y),
          reaction: "death",
        });
      }
    },
  );

  it("uses the native frame placement tables for the accepted soldier record", () => {
    expect(FULL_COMBAT_FRAME_META.left[0].plus50.map(({ anchor }) => anchor))
      .toEqual([21, 82, 38, 37, 0, 0]);
    expect(FULL_COMBAT_FRAME_META.right[0].plus50.map(({ anchor }) => anchor))
      .toEqual([58, 22, 27, 40, 150, 145]);
  });

  it("replays magic sword warrior body and G1 streams as separate native channels", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "測試攻方", "magic-sword-warrior"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const startAt = markTime(script, "fullWindup");
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");

    expect(FULL_COMBAT_FRAME_META.left[1].plus50.map(({ anchor }) => anchor))
      .toEqual([55, 100, 43, 46, 58, 103, 141, 254, 225]);
    expect(script.sample(startAt + 20).sprites).toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: 1, channel: "actor", frame: 0 }),
      expect.objectContaining({
        classId: 1,
        channel: "G1",
        frame: 3,
        x: 58,
        lift: 0,
      }),
    ]));
    expect(script.sample(startAt + 60).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ frame: 2, x: 82, lift: 0 });
    expect(script.sample(startAt + 700).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 1, x: 202 });
    expect(script.sample(impactAt).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ frame: 7, x: 250, lift: 0 });
    expect(script.sample(impactAt + 100).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ frame: 7, x: 330, lift: 0 });
    expect(script.sample(holdAt).sprites.find(({ channel }) => channel === "G1"))
      .toBeUndefined();
    expect(script.cues).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: startAt, record: 12 }),
      expect.objectContaining({ t: startAt + 640, record: 13 }),
      expect.objectContaining({ t: impactAt, record: 2 }),
    ]));

    const mirrored = buildFullCombatScript(
      unit(2, 48, "測試攻方", "magic-sword-warrior"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const mirroredStart = markTime(mirrored, "fullWindup");
    expect(FULL_COMBAT_FRAME_META.right[1].plus50.map(({ anchor }) => anchor))
      .toEqual([25, 32, 27, 32, 16, 17, 17, 0, 0]);
    expect(mirrored.sample(mirroredStart + 20).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ side: "right", frame: 3, x: 442, lift: 0 });
    expect(mirrored.sample(mirroredStart + 60).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ side: "right", frame: 2, x: 418, lift: 0 });
  });

  it("replays record 2 jungle warrior's native leap, entry and reaction streams", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "測試攻方", "jungle-warrior"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const startAt = markTime(script, "fullWindup");
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");

    expect(script.sample(startAt + 200).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 2, frame: 1, lift: 16 });
    // The leap tops out 80 px up, the frame-0 dive (dy=+20) runs 120 px under
    // the ground line, and the frame-4 burrow climbs back 8 px per substep;
    // the ground clip hides whatever is still below the line.
    expect(script.sample(startAt + 360).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 2, frame: 0, lift: 80 });
    expect(script.sample(startAt + 760).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 2, frame: 4, x: 250, lift: -120 });
    expect(script.sample(startAt + 800).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 2, frame: 4, x: 240, lift: -112 });
    expect(script.sample(impactAt).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 2, frame: 4, x: 85, lift: -8 });
    expect(script.sample(impactAt + 150).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ frame: 1, reaction: "hurt", lift: 12 });
    expect(script.sample(holdAt).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ frame: 1, reaction: "hurt", lift: 0 });
    expect(script.cues).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: startAt + 360, record: 1 }),
      expect.objectContaining({ t: startAt + 760, record: 39 }),
      expect.objectContaining({ t: impactAt, record: 52, reason: "full-primary-hurt" }),
    ]));

    const mirrored = buildFullCombatScript(
      unit(2, 48, "測試攻方", "jungle-warrior"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    expect(mirrored.sample(markTime(mirrored, "fullWindup") + 800).sprites
      .find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "right", frame: 4, x: 260 });
  });

  it("replays record 3 magic priest's body, target and G1 spell streams", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "測試攻方", "magic-priest"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const startAt = markTime(script, "fullWindup");
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");

    expect(script.sample(startAt + 200).sprites).toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: 3, channel: "actor", frame: 1, x: 218 }),
      expect.objectContaining({ classId: 3, channel: "G1", frame: 2, x: 260, lift: 0 }),
    ]));
    expect(script.sample(impactAt).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ classId: 3, frame: 2, x: 260, lift: 0 });
    expect(script.sample(impactAt + 100).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ frame: 2, x: 330 });
    expect(script.sample(impactAt + 300).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ frame: 1, reaction: "hurt", lift: 96 });
    expect(script.sample(holdAt).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ frame: 1, reaction: "hurt", lift: 0 });
    expect(script.cues).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: startAt + 160, record: 1 }),
      expect.objectContaining({ t: startAt + 320, record: 10 }),
      expect.objectContaining({ t: impactAt, record: 2, reason: "full-primary-hurt" }),
    ]));

    const mirrored = buildFullCombatScript(
      unit(2, 48, "測試攻方", "magic-priest"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const mirroredStart = markTime(mirrored, "fullWindup");
    expect(mirrored.sample(mirroredStart + 200).sprites).toEqual(expect.arrayContaining([
      expect.objectContaining({ side: "right", channel: "actor", frame: 1, x: 282 }),
      expect.objectContaining({ side: "right", channel: "G1", frame: 2, x: 260 }),
    ]));
  });

  it("replays record 4 prayer guide's native run, leap and exit streams", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "測試攻方", "prayer-guide"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const startAt = markTime(script, "fullWindup");
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");

    expect(script.sample(startAt + 20).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 4, frame: 1, x: 250 });
    expect(script.sample(startAt + 520).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 2, lift: 10 });
    expect(script.sample(impactAt - 1).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 4, x: 225, lift: 10 });
    expect(script.sample(impactAt).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 0, x: 220, lift: 0 });
    expect(script.sample(impactAt + 100).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 0, x: 156 });
    expect(script.sample(impactAt + 50).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ frame: 1, reaction: "hurt", lift: 18 });
    expect(script.sample(holdAt).sprites.find(({ channel }) => channel === "actor"))
      .toBeUndefined();
    expect(script.cues).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: startAt, record: 14 }),
      expect.objectContaining({ t: startAt + 640, record: 15 }),
      expect.objectContaining({ t: impactAt, record: 2, reason: "full-primary-hurt" }),
    ]));

    const mirrored = buildFullCombatScript(
      unit(2, 48, "測試攻方", "prayer-guide"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    expect(mirrored.sample(markTime(mirrored, "fullImpact") - 1).sprites
      .find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "right", frame: 4, x: 275, lift: 10 });
  });

  it("replays record 5 curse master's late G1 strike and victim-owned voices", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "測試攻方", "curse-master"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const startAt = markTime(script, "fullWindup");
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");

    expect(script.sample(startAt + 20).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 5, frame: 1 });
    expect(script.sample(startAt + 200).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 5, frame: 2 });
    expect(script.sample(startAt + 800).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ classId: 5, frame: 6, x: 280, lift: 15 });
    expect(script.sample(startAt + 840).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ frame: 6, x: 280, lift: 19 });
    expect(script.sample(impactAt).sprites.find(({ channel }) => channel === "G1"))
      .toBeUndefined();
    expect(script.sample(impactAt + 50).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ frame: 1, reaction: "hurt", lift: 16 });
    expect(script.sample(holdAt).sprites.find(({ channel }) => channel === "actor"))
      .toBeUndefined();
    expect(script.cues).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: startAt, record: 39 }),
      expect.objectContaining({ t: startAt + 800, record: 40 }),
      expect.objectContaining({ t: impactAt, record: 4, reason: "full-primary-hurt" }),
      expect.objectContaining({ t: impactAt + 500, record: 2 }),
    ]));

    const mirrored = buildFullCombatScript(
      unit(2, 48, "測試攻方", "curse-master"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    expect(mirrored.sample(markTime(mirrored, "fullWindup") + 800).sprites
      .find(({ channel }) => channel === "G1"))
      .toMatchObject({ side: "right", frame: 6, x: 260, lift: 15 });
  });

  it.each([
    { record: 6, classId: "magician" },
    { record: 7, classId: "great-axe-warrior" },
    { record: 8, classId: "half-dragon-warrior" },
    { record: 9, classId: "magic-armor-warrior" },
    { record: 10, classId: "magic-guide" },
    { record: 11, classId: "evil-mage" },
    { record: 12, classId: "magic-archer" },
    { record: 13, classId: "land-knight" },
    { record: 14, classId: "demon-dragon-knight" },
    { record: 15, classId: "flying-dragon-knight" },
    { record: 16, classId: "beast-knight" },
    { record: 17, classId: "bone-knight" },
    { record: 18, classId: "swift-dragon-knight" },
    { record: 19, classId: "great-dragon-knight" },
    { record: 21, classId: "crossbow" },
    { record: 23, classId: "pegasus-warrior" },
    { record: 24, classId: "sister" },
    { record: 25, classId: "monk" },
    { record: 26, classId: "water-warrior" },
    { record: 27, classId: "divine-sword-warrior" },
    { record: 29, classId: "steel-armor-warrior" },
    { record: 30, classId: "priest" },
    { record: 31, classId: "wizard" },
    { record: 32, classId: "magic-master" },
    { record: 33, classId: "evil-sword-warrior" },
    { record: 34, classId: "engineer" },
  ] as const)(
    "interprets record $record $classId directly from both native command blocks",
    ({ record, classId }) => {
      const profile = STAGE0_FULL_COMBAT_PROFILES[classId];
      const strikeDuration = (side: "left" | "right") =>
        profile.commandStreams[side].mainLeftOrAttacker.steps.reduce(
          (sum, step) => sum + step.rendererSubsteps * 40,
          0,
        );
      const reactionDuration = (side: "left" | "right") =>
        profile.commandStreams[side].auxiliaryA.steps.reduce(
          (sum, step) => sum + step.rendererSubsteps * 50,
          0,
        );
      const left = buildFullCombatScript(
        unit(1, 0, "測試攻方", classId),
        unit(2, 48, "測試守方"),
        result({ counterOccurred: false, counterDamage: 0 }),
      );
      const leftStart = markTime(left, "fullWindup");
      const leftImpact = markTime(left, "fullImpact");
      const leftHold = markTime(left, "fullHold");
      expect(leftImpact - leftStart).toBe(strikeDuration("left"));
      expect(leftHold - leftImpact).toBe(reactionDuration("left"));
      expect(left.sample(leftStart).sprites.find(({ channel }) => channel === "actor"))
        .toMatchObject({
          side: "left",
          classId: record,
          frame: referenceNativeFrames(
            profile.commandStreams.left.mainLeftOrAttacker.steps,
          )[0].frame,
        });
      expect(left.sample(leftImpact + 1).sprites.find(({ channel }) => channel === "victim"))
        .toMatchObject({
          reaction: "hurt",
          frame: profile.commandStreams.left.auxiliaryB.steps[0].pose.frame,
        });

      const guard = buildFullCombatScript(
        unit(1, 0, "測試攻方", classId),
        unit(2, 48, "測試守方"),
        result({ damage: 8, counterOccurred: false, counterDamage: 0 }),
      );
      expect(guard.sample(markTime(guard, "fullImpact") + 1).sprites
        .find(({ channel }) => channel === "victim"))
        .toMatchObject({
          reaction: "guard",
          frame: profile.commandStreams.left.auxiliaryD.steps[0].pose.frame,
        });

      const right = buildFullCombatScript(
        unit(2, 48, "測試攻方", classId),
        unit(1, 0, "測試守方"),
        result({
          attackerId: "2:48",
          defenderId: "1:0",
          counterOccurred: false,
          counterDamage: 0,
        }),
      );
      const rightStart = markTime(right, "fullWindup");
      expect(markTime(right, "fullImpact") - rightStart).toBe(strikeDuration("right"));
      expect(markTime(right, "fullHold") - markTime(right, "fullImpact"))
        .toBe(reactionDuration("right"));
      expect(right.sample(rightStart).sprites.find(({ channel }) => channel === "actor"))
        .toMatchObject({
          side: "right",
          classId: record,
          frame: referenceNativeFrames(
            profile.commandStreams.right.mainLeftOrAttacker.steps,
          )[0].frame,
        });

      const mainSteps = profile.commandStreams.left.mainLeftOrAttacker.steps as readonly {
        commands: readonly { token: string }[];
      }[];
      const linkedToken = mainSteps
        .flatMap((step) => step.commands)
        .find((command) => command.token.startsWith("G"))?.token;
      if (linkedToken) {
        const effectAppears = Array.from(
          { length: Math.ceil(strikeDuration("left") / 40) },
          (_, index) => left.sample(leftStart + index * 40).sprites.some(
            ({ channel }) => channel === linkedToken,
          ),
        ).some(Boolean);
        expect(effectAppears).toBe(true);
      }
    },
  );

  it("carries the actor channel's height and animation from the strike into the post-hit stream", () => {
    const actorAt = (
      classId: UnitClassId,
      side: "left" | "right",
      phase: FullCombatPhaseName,
      offset: number,
    ) => {
      const attackerSide = side === "left" ? 1 : 2;
      const defenderSide = attackerSide === 1 ? 2 : 1;
      const script = buildFullCombatScript(
        unit(attackerSide, attackerSide === 1 ? 0 : 48, "測試攻方", classId),
        unit(defenderSide, defenderSide === 1 ? 0 : 48, "測試守方"),
        result({
          attackerId: `${attackerSide}:${attackerSide === 1 ? 0 : 48}`,
          defenderId: `${defenderSide}:${defenderSide === 1 ? 0 : 48}`,
          counterOccurred: false,
          counterDamage: 0,
        }),
      );
      return script.sample(markTime(script, phase) + offset).sprites
        .find(({ channel }) => channel === "actor");
    };
    // Record 37: the head sinks 30 px per substep, re-emerges under :X and
    // settles 15 px up, where its post-hit stream (no dy) keeps it.
    expect([0, 40, 80, 120, 160].map((age) => actorAt("head", "right", "fullWindup", age + 1)))
      .toEqual([0, -30, -60, -90, -120].map((lift) => expect.objectContaining({ lift })));
    expect(actorAt("head", "right", "fullImpact", 1)).toMatchObject({ frame: 6, x: 250, lift: 15 });
    // Records 17 and 36 end their strikes 8 px down; the dragon's post-hit
    // stream also keeps the strike's :X alternation until its own XN.
    expect(actorAt("bone-knight", "left", "fullImpact", 1)).toMatchObject({ frame: 4, x: 303, lift: -8 });
    expect([1, 51, 101, 151].map((age) => actorAt("dragon", "right", "fullImpact", age)))
      .toEqual([
        expect.objectContaining({ frame: 0, x: 268, lift: -8 }),
        expect.objectContaining({ frame: 1, x: 318, lift: -8 }),
        expect.objectContaining({ frame: 0, x: 368, lift: -8 }),
        expect.objectContaining({ frame: 0, x: 418, lift: -8 }),
      ]);
    // Record 24: the orb's descent was last drawn on the ground line, but the
    // accumulator is one dy=+40 step past it, so the post-hit orb slides away
    // with its lower 40 rows under the ground clip.
    expect(actorAt("sister", "left", "fullImpact", -39)).toMatchObject({ frame: 6, x: 205, lift: 0 });
    expect(actorAt("sister", "left", "fullImpact", 1)).toMatchObject({ frame: 6, x: 205, lift: -40 });
    // Record 23: the pegasus stays 30 px up and keeps flapping under the
    // strike's :X instead of dropping to the floor on a still frame 0.
    expect([1, 51, 101, 151].map((age) => actorAt("pegasus-warrior", "left", "fullImpact", age)))
      .toEqual([
        expect.objectContaining({ frame: 1, x: 218, lift: 30 }),
        expect.objectContaining({ frame: 0, x: 188, lift: 30 }),
        expect.objectContaining({ frame: 1, x: 158, lift: 30 }),
        expect.objectContaining({ frame: 0, x: 128, lift: 30 }),
      ]);
    // Record 15 carries X4 the same way: 20 px up, wings still cycling.
    expect([1, 51, 101, 151].map((age) => actorAt("flying-dragon-knight", "left", "fullImpact", age)?.frame))
      .toEqual([1, 2, 3, 0]);
    expect(actorAt("flying-dragon-knight", "left", "fullImpact", 1)).toMatchObject({ lift: 20 });
  });

  it("redraws the nonfatal hold without dust until the 20th draw since impact", () => {
    const guard = (defenderLife: number) => buildFullCombatScript(
      unit(1, 0, "測試攻方"),
      { ...unit(2, 48, "測試守方"), life: defenderLife },
      result({ damage: 8, counterOccurred: false, counterDamage: 0 }),
    );
    // The soldier's guard stream ends with the defender's UE dust still on.
    const script = guard(180);
    const holdAt = markTime(script, "fullHold");
    expect(script.sample(holdAt - 1).particles).toHaveLength(3);
    // A1E8 turns both trails off before AD36, whose AD51 draws present the
    // window without the YD shift; 20 - 8 = 12 draws, 32 ms apart.
    for (const offset of [1, 200, 400, 660]) {
      expect(script.sample(holdAt + offset)).toMatchObject({ particles: [], viewportYOffset: 0 });
    }
    // Landing on exactly 210 life empties the gauge remainder DS:7D27, so AD36
    // draws nothing and the last post-hit image, dust included, stays up.
    const boundary = guard(218);
    const boundaryHold = markTime(boundary, "fullHold");
    expect(boundary.sample(boundaryHold + 400).particles)
      .toEqual(boundary.sample(boundaryHold - 1).particles);
    expect(boundary.sample(boundaryHold + 400).particles).toHaveLength(3);
  });

  it("keeps a flown-off actor's ground shadow through the hold and the death segment", () => {
    // Record 8 rises 30 px per post-hit substep until it is 312 px up, far
    // above the window, and its 40 post-hit substeps leave no hold draw. The
    // E336 shadow still sits on the ground under x=250.
    const hold = buildFullCombatScript(
      unit(1, 0, "測試攻方", "half-dragon-warrior"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const holdState = hold.sample(markTime(hold, "fullHold") + 300);
    expect(holdState.sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 5, x: 250, lift: 312 });
    const actorShadow = holdState.shadows.find(({ channel }) => channel === "actor");
    expect(actorShadow?.bands[0]).toMatchObject({ y: 132, width: 112 });
    expect(actorShadow?.bands[0].x).toBe(250 - FULL_COMBAT_FRAME_META.left[8].plus50[5].anchor);

    // A fatal strike hands the survivor the still DS:7DAE poses: frame 0 of
    // its +50 set where the post-hit stream left it, so the head stays half
    // in view at the right edge while its target falls.
    const kill = buildFullCombatScript(
      unit(2, 48, "測試攻方", "head"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
        defenderDied: true,
      }),
    );
    const deathAt = markTime(kill, "fullDefenderDeath");
    for (const offset of [1, 600, 1_199]) {
      expect(kill.sample(deathAt + offset).sprites.find(({ channel }) => channel === "actor"))
        .toMatchObject({ side: "right", classId: 37, frame: 0, x: 490, lift: 15 });
    }
  });

  it("keeps the great dragon knight visible until its wide post-hit bitmap is clipped", () => {
    const left = buildFullCombatScript(
      unit(1, 0, "測試攻方", "great-dragon-knight"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const leftImpact = markTime(left, "fullImpact");
    const leftHold = markTime(left, "fullHold");
    const leftActor = (t: number) => left.sample(t).sprites
      .find(({ channel }) => channel === "actor");
    expect(leftActor(leftImpact + 500)).toMatchObject({ side: "left", classId: 19, x: -100 });
    // The eleventh post-hit substep leaves the channel one step further out at
    // (-140, 127). AD51 keeps redrawing it there for the nine remaining hold
    // draws, so the 168-176 px wing frames still reach into the window and go
    // on cycling under X4 before the window stands still.
    expect(leftActor(leftHold)).toMatchObject({ side: "left", classId: 19, frame: 1, x: -140, lift: 8 });
    expect(Array.from({ length: 9 }, (_, draw) => leftActor(leftHold + draw * 32 + 1)?.frame))
      .toEqual([1, 2, 3, 4, 1, 2, 3, 4, 1]);
    expect(leftActor(leftHold + 600)).toMatchObject({ frame: 1, x: -140, lift: 8 });

    const right = buildFullCombatScript(
      unit(2, 48, "測試攻方", "great-dragon-knight"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const rightImpact = markTime(right, "fullImpact");
    const rightHold = markTime(right, "fullHold");
    expect(right.sample(rightImpact + 400).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "right", classId: 19, x: 520 });
    // The right side's hold position, x=640, puts even the widest frame past
    // the window edge.
    expect(right.sample(rightHold).sprites.find(({ channel }) => channel === "actor"))
      .toBeUndefined();
  });

  it("registers the great dragon knight guard from its defender table without moving the counter-guard trail", () => {
    expect(FULL_COMBAT_FRAME_META.left[19].direct[3]).toMatchObject({ w: 160, anchor: 107, yOffset: 0 });
    expect(FULL_COMBAT_FRAME_META.right[19].direct[3]).toMatchObject({ w: 160, anchor: 48, yOffset: 0 });
    const left = buildFullCombatScript(
      unit(1, 0, "測試攻方", "great-dragon-knight"),
      unit(2, 48, "測試守方"),
      result({ counterDamage: 8 }),
    );
    const leftReference = buildFullCombatScript(
      unit(1, 0, "測試攻方"),
      unit(2, 48, "測試守方"),
      result({ counterDamage: 8 }),
    );
    const leftCounterImpact = markTime(left, "fullCounterImpact");
    const leftReferenceCounterImpact = markTime(leftReference, "fullCounterImpact");
    expect(left.sample(leftCounterImpact).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({
        side: "left",
        classId: 19,
        frame: 3,
        reaction: "guard",
        x: 210,
      });
    const leftTrail = left.sample(leftCounterImpact + 200).particles;
    expect(leftTrail).toHaveLength(3);
    expect(leftTrail).toEqual(leftReference.sample(leftReferenceCounterImpact + 200).particles);

    const right = buildFullCombatScript(
      unit(2, 48, "測試攻方", "great-dragon-knight"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterDamage: 8,
      }),
    );
    const rightReference = buildFullCombatScript(
      unit(2, 48, "測試攻方"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterDamage: 8,
      }),
    );
    const rightCounterImpact = markTime(right, "fullCounterImpact");
    const rightReferenceCounterImpact = markTime(rightReference, "fullCounterImpact");
    expect(right.sample(rightCounterImpact).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({
        side: "right",
        classId: 19,
        frame: 3,
        reaction: "guard",
        x: 290,
      });
    const rightTrail = right.sample(rightCounterImpact + 200).particles;
    expect(rightTrail).toHaveLength(3);
    expect(rightTrail).toEqual(rightReference.sample(rightReferenceCounterImpact + 200).particles);
  });

  it("keeps the swift dragon knight guard on the ground through its defender table", () => {
    // The -16 once read as an original hover belongs to the actor's +50 frame
    // 3. The defender's direct guard frame reads the descriptor +04h table.
    expect(FULL_COMBAT_FRAME_META.left[18].plus50[3].yOffset).toBe(-16);
    expect(FULL_COMBAT_FRAME_META.right[18].plus50[3].yOffset).toBe(-16);
    expect(FULL_COMBAT_FRAME_META.left[18].direct[3].yOffset).toBe(0);
    expect(FULL_COMBAT_FRAME_META.right[18].direct[3].yOffset).toBe(0);

    const rightVictim = buildFullCombatScript(
      unit(1, 0, "測試攻方"),
      unit(2, 48, "測試守方", "swift-dragon-knight"),
      result({ damage: 8, counterOccurred: false, counterDamage: 0 }),
    );
    const rightGuard = rightVictim.sample(markTime(rightVictim, "fullImpact") + 50).sprites
      .find(({ channel }) => channel === "victim");
    expect(rightGuard).toMatchObject({
      side: "right",
      classId: 18,
      frame: 3,
      reaction: "guard",
      lift: 0,
    });
    expect(rightGuard).not.toHaveProperty("yOffsetCorrection");

    const leftVictim = buildFullCombatScript(
      unit(2, 48, "測試攻方"),
      unit(1, 0, "測試守方", "swift-dragon-knight"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        damage: 8,
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    expect(leftVictim.sample(markTime(leftVictim, "fullImpact") + 50).sprites
      .find(({ channel }) => channel === "victim"))
      .toMatchObject({
        side: "left",
        classId: 18,
        frame: 3,
        reaction: "guard",
        lift: 0,
      });
  });

  it("registers defender frames with the native descriptor +04h tables", () => {
    expect(FULL_SCENE.groundY).toBe(135);
    // Stage-0 capture: the right soldier's entry bitmaps start at x=346/306
    // for channel x=370/330 and its hurt bitmap at 249 for x=290; the
    // counter-attacked left soldier starts at 6..126 for x=50..170 and its
    // hurt bitmap at 168 for x=210.
    const right = FULL_COMBAT_FRAME_META.right[0].direct;
    const left = FULL_COMBAT_FRAME_META.left[0].direct;
    expect(right.map(({ anchor }) => anchor)).toEqual([24, 41, 70, 42]);
    expect(left.map(({ anchor }) => anchor)).toEqual([44, 42, 40, 35]);
    expect([370, 330].map((x) => x - right[0].anchor)).toEqual([346, 306]);
    expect(290 - right[1].anchor).toBe(249);
    expect([50, 90, 130, 170].map((x) => x - left[0].anchor)).toEqual([6, 46, 86, 126]);
    expect(210 - left[1].anchor).toBe(168);

    // User capture of the original: the fallen right divine sword warrior's
    // bitmap starts at (232, 97), and none of its rows at y >= 135 is drawn.
    const script = buildFullCombatScript(
      unit(1, 0, "測試攻方", "demon-dragon-knight"),
      unit(2, 48, "測試守方", "divine-sword-warrior"),
      result({ damage: 80, counterOccurred: false, counterDamage: 0, defenderDied: true }),
    );
    expect(script.sample(markTime(script, "fullDefenderDeath") + 1).sprites
      .find(({ channel }) => channel === "victim"))
      .toMatchObject({ side: "right", classId: 27, frame: 2, reaction: "death", x: 290, lift: 0 });
    const death = FULL_COMBAT_FRAME_META.right[27].direct[2];
    expect(death).toMatchObject({ w: 104, h: 59, anchor: 58, yOffset: 21 });
    expect(290 - death.anchor).toBe(232);
    expect(FULL_SCENE.groundY - (death.h ?? 0) + (death.yOffset ?? 0)).toBe(97);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("keeps actor and defender placement tables apart for every frame", async () => {
    const evidence = JSON.parse(await readFile(
      path.join(workspace, "reverse/parsed/native/combat-presentations.json"),
      "utf8",
    )) as {
      fullScreenPresentation: {
        classRecords: Array<{
          record: number;
          side1: EvidencePresentationBlock;
          side2: EvidencePresentationBlock;
        }>;
      };
    };
    let checkedSides = 0;
    for (const record of evidence.fullScreenPresentation.classRecords) {
      for (const [side, block] of [["left", record.side1], ["right", record.side2]] as const) {
        const meta = FULL_COMBAT_FRAME_META[side][record.record];
        if (!block.available || !meta) continue;
        checkedSides += 1;
        const { defenderFramePlacement, framePlacement } = block;
        expect(meta.direct.map(({ anchor, yOffset }) => [anchor, yOffset])).toEqual(
          meta.direct.map((_, index) => [
            defenderFramePlacement?.xAnchor[index],
            defenderFramePlacement?.yOffset[index],
          ]),
        );
        expect(meta.plus50.map(({ anchor, yOffset }) => [anchor, yOffset])).toEqual(
          meta.plus50.map((_, index) => [
            framePlacement?.xAnchor[index],
            framePlacement?.yOffset[index],
          ]),
        );
      }
    }
    expect(checkedSides).toBe(75);
  });

  it("starts a fatal body where the reaction stream left the defender channel", () => {
    // The great dragon knight's hurt stream nets +8 px; `B683/B6BD` only swap
    // in the six still death poses, so the body lies 8 px lower.
    const dragonKill = buildFullCombatScript(
      unit(1, 0, "測試攻方", "great-dragon-knight"),
      unit(2, 48, "測試守方"),
      result({ damage: 24, counterOccurred: false, counterDamage: 0, defenderDied: true }),
    );
    expect(dragonKill.sample(markTime(dragonKill, "fullDefenderDeath") + 1).sprites
      .find(({ channel }) => channel === "victim"))
      .toMatchObject({ frame: 2, reaction: "death", lift: -8 });

    // The great axe warrior's guard stream holds for 7 substeps, then drives
    // its target down 16 px per substep; the ground clip hides the rest.
    const axeGuard = buildFullCombatScript(
      unit(1, 0, "測試攻方", "great-axe-warrior"),
      unit(2, 48, "測試守方"),
      result({ damage: 8, counterOccurred: false, counterDamage: 0 }),
    );
    const guardAt = markTime(axeGuard, "fullImpact");
    const victimLift = (t: number) => axeGuard.sample(t).sprites
      .find(({ channel }) => channel === "victim")?.lift;
    expect(victimLift(guardAt + 7 * 50 + 1)).toBe(0);
    expect(victimLift(guardAt + 8 * 50 + 1)).toBe(-16);
    expect(victimLift(markTime(axeGuard, "fullHold"))).toBe(-112);

    const axeKill = buildFullCombatScript(
      unit(1, 0, "測試攻方", "great-axe-warrior"),
      unit(2, 48, "測試守方"),
      result({ damage: 8, counterOccurred: false, counterDamage: 0, defenderDied: true }),
    );
    expect(axeKill.sample(markTime(axeKill, "fullDefenderDeath") + 1).sprites
      .find(({ channel }) => channel === "victim"))
      .toMatchObject({ frame: 2, reaction: "death", lift: -112 });
  });

  it("lays the E336 ground shadow under each main channel in native draw order", () => {
    // Byte-aligned bitmaps take E4AF: 0AAh on both rows of every pass.
    expect(nativeMainChannelShadowBands(232, 104)).toEqual([
      { x: 232, y: 132, width: 104, height: 2, darkParity: [1, 1] },
      { x: 224, y: 134, width: 120, height: 2, darkParity: [1, 1] },
      { x: 232, y: 136, width: 104, height: 2, darkParity: [1, 1] },
    ]);
    // Any other alignment takes E55A: 55h on the first row, 0AAh on the second.
    expect(nativeMainChannelShadowBands(346, 72)).toEqual([
      { x: 346, y: 132, width: 72, height: 2, darkParity: [0, 1] },
      { x: 338, y: 134, width: 88, height: 2, darkParity: [0, 1] },
      { x: 346, y: 136, width: 72, height: 2, darkParity: [0, 1] },
    ]);
    expect(nativeMainChannelShadowBands(-3, 64)[1]).toMatchObject({ x: -11, width: 80, darkParity: [0, 1] });
    expect(nativeMainChannelShadowBands(-8, 64)[0]).toMatchObject({ x: -8, darkParity: [1, 1] });

    const script = buildFullCombatScript(
      unit(1, 0, "測試攻方", "demon-dragon-knight"),
      unit(2, 48, "測試守方", "divine-sword-warrior"),
      result({ damage: 80, counterOccurred: false, counterDamage: 0, defenderDied: true }),
    );
    // Both main channels are active from the first substep, including the
    // defender still waiting off-window at x=650.
    const opening = script.sample(markTime(script, "fullWindup") + 1);
    expect(opening.sprites.find(({ channel }) => channel === "victim")).toBeUndefined();
    expect(opening.shadows.map(({ side, channel }) => ({ side, channel }))).toEqual([
      { side: "right", channel: "victim" },
      { side: "left", channel: "actor" },
    ]);
    const openingVictim = opening.shadows.find(({ channel }) => channel === "victim");
    expect(openingVictim?.bands[0].x).toBe(650 - FULL_COMBAT_FRAME_META.right[27].direct[0].anchor);
    // The shadow stays on its fixed rows whatever the body's pose. B683/B6BD
    // keep the survivor's main channel drawing too, so its shadow is still
    // laid wherever the post-hit stream left it: x=-634 here, frame 0 of the
    // left +50 set (anchor 58, 120 px), entirely outside the window.
    expect(FULL_COMBAT_FRAME_META.left[14].plus50[0]).toMatchObject({ w: 120, anchor: 58 });
    expect(script.sample(markTime(script, "fullDefenderDeath") + 1).shadows).toEqual([
      { side: "right", channel: "victim", bands: nativeMainChannelShadowBands(232, 104) },
      { side: "left", channel: "actor", bands: nativeMainChannelShadowBands(-634 - 58, 120) },
    ]);
  });

  it("reinitializes a counter strike to the same native character geometry as a primary strike", () => {
    const exchange = buildFullCombatScript(
      unit(1, 0, "先攻士兵"),
      unit(2, 48, "反擊巨龍", "great-dragon-knight"),
      result({ damage: 24, counterDamage: 24 }),
    );
    const primary = buildFullCombatScript(
      unit(2, 48, "主攻巨龍", "great-dragon-knight"),
      unit(1, 0, "受擊士兵"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const counterStart = markTime(exchange, "fullCounterWindup");
    const primaryStart = markTime(primary, "fullWindup");
    const counterCameraOrigin = exchange.sample(counterStart).camera;
    for (const age of [1, 201, 401]) {
      const counterState = exchange.sample(counterStart + age);
      const primaryState = primary.sample(primaryStart + age);
      expect(counterState.sprites.find(({ channel }) => channel === "actor"))
        .toMatchObject(primaryState.sprites.find(({ channel }) => channel === "actor") ?? {});
      expect(counterState.sprites.find(({ channel }) => channel === "victim"))
        .toMatchObject(primaryState.sprites.find(({ channel }) => channel === "victim") ?? {});
      expect(counterState.camera - counterCameraOrigin).toBe(primaryState.camera);
    }
  });

  it("drops the crossbow bolt from above the window onto the native ground anchor", () => {
    const left = buildFullCombatScript(
      unit(1, 0, "測試攻方", "crossbow"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const leftImpact = markTime(left, "fullImpact");
    // `:S (266,-105)` starts the descent 240 px above the ground line and
    // `dy=+25` walks it down to the y=120 anchor over ten substeps.
    expect(left.sample(leftImpact - 400).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 21, frame: 4, x: 266, lift: 240 });
    expect(left.sample(leftImpact - 200).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 21, frame: 4, x: 266, lift: 115 });
    expect(left.sample(leftImpact - 40).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 21, frame: 4, x: 266, lift: 15 });
    // The post-hit stream issues no `:S` and nothing rewinds the channel, so
    // the landed frame 5 starts from the descent's accumulator: y=145, one
    // dy=+25 step past the last drawn y=120. Its bottom ten rows, the lower
    // half of the dirt splash, fall under the ground clip.
    expect(left.sample(leftImpact).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 21, frame: 5, x: 266, lift: -10 });

    const right = buildFullCombatScript(
      unit(2, 48, "測試攻方", "crossbow"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const rightImpact = markTime(right, "fullImpact");
    expect(right.sample(rightImpact - 40).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "right", classId: 21, frame: 4, x: 216, lift: 15 });
    expect(right.sample(rightImpact).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "right", classId: 21, frame: 5, x: 216, lift: -10 });
  });

  it("plants the crossbow bolt inside the target reaction bitmap on both sides", () => {
    const contact = (side: "left" | "right") => {
      const attackerSide = side === "left" ? 1 : 2;
      const defenderSide = attackerSide === 1 ? 2 : 1;
      const script = buildFullCombatScript(
        unit(attackerSide, attackerSide === 1 ? 0 : 48, "測試攻方", "crossbow"),
        unit(defenderSide, defenderSide === 1 ? 0 : 48, "測試守方"),
        result({
          attackerId: `${attackerSide}:${attackerSide === 1 ? 0 : 48}`,
          defenderId: `${defenderSide}:${defenderSide === 1 ? 0 : 48}`,
          counterOccurred: false,
          counterDamage: 0,
        }),
      );
      const impact = script.sample(markTime(script, "fullImpact"));
      const bolt = impact.sprites.find(({ channel }) => channel === "actor");
      const victim = impact.sprites.find(({ channel }) => channel === "victim");
      const victimSide = side === "left" ? "right" : "left";
      const boltMeta = FULL_COMBAT_FRAME_META[side][21].plus50[5];
      const victimMeta = FULL_COMBAT_FRAME_META[victimSide][0].direct[1];
      return {
        bolt,
        victim,
        boltSpan: [(bolt?.x ?? 0) - boltMeta.anchor, (bolt?.x ?? 0) - boltMeta.anchor + boltMeta.w],
        victimSpan: [
          (victim?.x ?? 0) - victimMeta.anchor,
          (victim?.x ?? 0) - victimMeta.anchor + victimMeta.w,
        ],
      };
    };

    // The bolt's contact point is the fixed native `:S` x, so the target has to
    // stand on its own native mark for the two to meet.
    const leftContact = contact("left");
    expect(leftContact.bolt).toMatchObject({ side: "left", classId: 21, frame: 5, x: 266 });
    expect(leftContact.victim).toMatchObject({ side: "right", frame: 1, x: 250 });
    expect(leftContact.boltSpan).toEqual([112, 296]);
    expect(leftContact.victimSpan).toEqual([209, 297]);

    const rightContact = contact("right");
    expect(rightContact.bolt).toMatchObject({ side: "right", classId: 21, frame: 5, x: 216 });
    expect(rightContact.victim).toMatchObject({ side: "left", frame: 1, x: 250 });
    expect(rightContact.boltSpan).toEqual([188, 372]);
    expect(rightContact.victimSpan).toEqual([208, 296]);

    // Both sides land the bolt just past the victim's ground anchor and keep
    // the two bitmaps overlapping, mirroring the archer's contact geometry.
    for (const { bolt, victim, boltSpan, victimSpan } of [leftContact, rightContact]) {
      expect(Math.abs((bolt?.x ?? 0) - (victim?.x ?? 0))).toBeLessThanOrEqual(34);
      expect(Math.min(boltSpan[1], victimSpan[1]) - Math.max(boltSpan[0], victimSpan[0]))
        .toBeGreaterThan(0);
    }
  });

  it("lands the sister orb inside the target reaction bitmap on both sides", () => {
    const left = buildFullCombatScript(
      unit(1, 0, "測試攻方", "sister"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const leftImpact = left.sample(markTime(left, "fullImpact"));
    const leftOrb = leftImpact.sprites.find(({ channel }) => channel === "actor");
    const leftVictim = leftImpact.sprites.find(({ channel }) => channel === "victim");
    expect(leftOrb).toMatchObject({ side: "left", classId: 24, frame: 6, x: 205 });
    expect(leftVictim).toMatchObject({ side: "right", frame: 1, x: 254 });
    const leftOrbMeta = FULL_COMBAT_FRAME_META.left[24].plus50[6];
    const leftVictimMeta = FULL_COMBAT_FRAME_META.right[0].direct[1];
    const leftOrbRight = (leftOrb?.x ?? 0) - leftOrbMeta.anchor + leftOrbMeta.w;
    const leftVictimLeft = (leftVictim?.x ?? 0) - leftVictimMeta.anchor;
    expect(leftOrbRight - leftVictimLeft).toBe(34);

    const right = buildFullCombatScript(
      unit(2, 48, "測試攻方", "sister"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const rightImpact = right.sample(markTime(right, "fullImpact"));
    const rightOrb = rightImpact.sprites.find(({ channel }) => channel === "actor");
    const rightVictim = rightImpact.sprites.find(({ channel }) => channel === "victim");
    expect(rightOrb).toMatchObject({ side: "right", classId: 24, frame: 6, x: 295 });
    expect(rightVictim).toMatchObject({ side: "left", frame: 1, x: 246 });
    const rightOrbMeta = FULL_COMBAT_FRAME_META.right[24].plus50[6];
    const rightVictimMeta = FULL_COMBAT_FRAME_META.left[0].direct[1];
    const rightOrbLeft = (rightOrb?.x ?? 0) - rightOrbMeta.anchor;
    const rightVictimRight = (rightVictim?.x ?? 0) - rightVictimMeta.anchor + rightVictimMeta.w;
    expect(rightVictimRight - rightOrbLeft).toBe(43);
  });

  it("keeps engineer's baked arrow frame on the native bottom anchor", () => {
    const left = buildFullCombatScript(
      unit(1, 0, "測試攻方", "engineer"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const leftImpact = markTime(left, "fullImpact");
    expect(left.sample(leftImpact + 1).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 34, frame: 2, lift: 0 });
    expect(FULL_COMBAT_FRAME_META.left[34].plus50[2])
      .toMatchObject({ h: 71, anchor: 27, yOffset: 0 });

    const right = buildFullCombatScript(
      unit(2, 48, "測試攻方", "engineer"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    expect(right.sample(markTime(right, "fullImpact") + 1).sprites
      .find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "right", classId: 34, frame: 2, lift: 0 });
    expect(FULL_COMBAT_FRAME_META.right[34].plus50[2])
      .toMatchObject({ h: 71, anchor: 66, yOffset: 0 });
  });

  it("replays the empress only from her original right-side asset block", () => {
    const profile = STAGE0_FULL_COMBAT_PROFILES.empress;
    const script = buildFullCombatScript(
      unit(2, 48, "測試攻方", "empress"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const start = markTime(script, "fullWindup");
    const impact = markTime(script, "fullImpact");
    const hold = markTime(script, "fullHold");
    const strikeDuration = profile.commandStreams.right.mainLeftOrAttacker.steps
      .reduce((sum, step) => sum + step.rendererSubsteps * 40, 0);
    const reactionDuration = profile.commandStreams.right.auxiliaryA.steps
      .reduce((sum, step) => sum + step.rendererSubsteps * 50, 0);

    expect(impact - start).toBe(strikeDuration);
    expect(hold - impact).toBe(reactionDuration);
    expect(script.sample(start).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "right", classId: 35, frame: 0 });
    expect(script.sample(impact + 1).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ side: "left", reaction: "hurt", frame: 1 });
    expect(STAGE0_FULL_COMBAT_ASSETS.left.empress.direct).toHaveLength(0);
    expect(STAGE0_FULL_COMBAT_ASSETS.left.empress.plus50).toHaveLength(0);
    expect(STAGE0_FULL_COMBAT_ASSETS.right.empress.direct).toHaveLength(4);
    expect(STAGE0_FULL_COMBAT_ASSETS.right.empress.plus50).toHaveLength(6);
    expect(FULL_COMBAT_FRAME_META.right[35].plus50.map(({ anchor }) => anchor))
      .toEqual([58, 22, 27, 40, 150, 145]);
  });

  it("replays the native archer draw, straight-flight and post-hit projectile streams", () => {
    const archer = buildFullCombatScript(
      unit(1, 0, "妮雅", "archer"),
      unit(2, 48, "騎士團士兵"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const startAt = markTime(archer, "fullWindup");
    const releaseAt = markTime(archer, "fullCharge");
    const impactAt = markTime(archer, "fullImpact");
    const holdAt = markTime(archer, "fullHold");

    expect(archer.sample(startAt + 20).sprites.find(({ set }) => set === "plus50"))
      .toMatchObject({ classId: 20, frame: 0, mirror: false });
    expect(archer.sample(startAt + 100).sprites.find(({ set }) => set === "plus50")?.frame).toBe(1);
    expect(archer.sample(startAt + 180).sprites.find(({ set }) => set === "plus50")?.frame).toBe(2);
    expect(archer.sample(releaseAt).sprites.find(({ set }) => set === "plus50")?.frame).toBe(3);
    expect(archer.sample(releaseAt + 100).sprites.find(({ set }) => set === "plus50")?.frame).toBe(4);
    expect(archer.cues).toContainEqual(expect.objectContaining({
      t: releaseAt,
      record: 50,
      reason: "full-primary-native-20-v5",
    }));

    expect(archer.sample(releaseAt).projectile).toMatchObject({
      classId: 20,
      side: "left",
      frame: 5,
      x: 146,
      y: 110,
    });
    expect(archer.sample(impactAt - 40).projectile).toMatchObject({ frame: 5, y: 110 });
    const impact = archer.sample(impactAt);
    expect(impact.projectile).toMatchObject({ frame: 6, x: 272, y: 110 });
    expect(impact.sprites.find(({ set }) => set === "direct")?.x).toBe(290);
    expect(archer.sample(impactAt + 50).projectile).toMatchObject({ frame: 7, y: 106 });
    expect(archer.sample(holdAt).projectile).toBeUndefined();
    expect(FULL_COMBAT_FRAME_META.left[20].plus50.map(({ anchor }) => anchor))
      .toEqual([61, 57, 57, 49, 59, 54, 54, 54, 54]);
    expect(FULL_COMBAT_FRAME_META.right[20].plus50.map(({ anchor }) => anchor))
      .toEqual([18, 39, 31, 18, 18, 0, 0, 0, 0]);

    const mirrored = buildFullCombatScript(
      unit(2, 48, "測試攻方", "archer"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const mirroredRelease = markTime(mirrored, "fullCharge");
    const mirroredImpact = markTime(mirrored, "fullImpact");
    expect(mirrored.sample(mirroredRelease).projectile)
      .toMatchObject({ side: "right", frame: 5, x: 336, y: 110 });
    expect(mirrored.sample(mirroredImpact).projectile)
      .toMatchObject({ side: "right", frame: 6, x: 210, y: 110 });
    expect(mirrored.sample(mirroredImpact).sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ side: "left", x: 210, frame: 1, reaction: "hurt" });
  });

  it("uses the promoted sister and native warrior command records", () => {
    const sister = buildFullCombatScript(
      unit(1, 0, "妮雅", "sister"),
      unit(2, 48, "騎士團士兵"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const sisterStart = markTime(sister, "fullWindup");
    const sisterImpact = markTime(sister, "fullImpact");
    expect(sister.sample(sisterStart + 360).sprites
      .find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 24, frame: 3, x: 115 });
    expect(sister.sample(sisterStart + 880).sprites
      .find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 24, frame: 6, x: 75, lift: 200 });
    expect(sister.sample(sisterImpact).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 24, frame: 6, x: 205 });
    expect(sister.cues).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: sisterStart + 360, record: 52 }),
      expect.objectContaining({ t: sisterStart + 1_080, record: 5 }),
      expect.objectContaining({ t: sisterImpact, record: 3 }),
    ]));

    const warrior = buildFullCombatScript(
      unit(1, 0, "妮雅", "warrior"),
      unit(2, 48, "騎士團士兵"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const startAt = markTime(warrior, "fullWindup");
    const impactAt = markTime(warrior, "fullImpact");
    const holdAt = markTime(warrior, "fullHold");
    expect(warrior.sample(startAt + 20).sprites.find(({ set }) => set === "plus50"))
      .toMatchObject({ classId: 28, frame: 1, mirror: false });
    expect(warrior.sample(startAt + 60).sprites.find(({ set }) => set === "plus50")?.frame).toBe(0);
    expect(warrior.sample(startAt + (12 * 40) + 80).sprites.find(({ set }) => set === "plus50"))
      .toMatchObject({ frame: 2, lift: 40 });
    expect(warrior.sample(startAt + 640).sprites.find(({ set }) => set === "plus50"))
      .toMatchObject({ frame: 3, lift: 80 });
    const impactActor = warrior.sample(impactAt).sprites.find(({ set }) => set === "plus50");
    expect(impactActor).toMatchObject({ frame: 4, mirror: false, lift: 0 });
    expect(warrior.sample(impactAt + 300).sprites.find(({ set }) => set === "plus50"))
      .toMatchObject({ frame: 4, mirror: false, x: (impactActor?.x ?? 0) - 192 });
    expect(warrior.sample(impactAt + 450).sprites.find(({ set }) => set === "plus50"))
      .toMatchObject({ frame: 4, mirror: false, x: (impactActor?.x ?? 0) - 288 });
    expect(warrior.sample(impactAt + 550).sprites.find(({ set }) => set === "plus50"))
      .toBeUndefined();
    expect(warrior.sample(holdAt).sprites.find(({ set }) => set === "plus50")).toBeUndefined();
    expect(warrior.cues).toContainEqual(expect.objectContaining({
      t: startAt,
      record: 14,
      reason: "full-primary-native-28-v3",
    }));
    expect(warrior.cues).toContainEqual(expect.objectContaining({
      t: startAt + 640,
      record: 15,
      reason: "full-primary-native-28-v5",
    }));

    const mirroredWarrior = buildFullCombatScript(
      unit(2, 48, "測試攻方", "warrior"),
      unit(1, 0, "測試守方"),
      result({
        attackerId: "2:48",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const mirroredImpactAt = markTime(mirroredWarrior, "fullImpact");
    const mirroredHoldAt = markTime(mirroredWarrior, "fullHold");
    const mirroredImpact = mirroredWarrior.sample(mirroredImpactAt).sprites
      .find(({ channel }) => channel === "actor");
    expect(mirroredImpact).toMatchObject({
      side: "right",
      classId: 28,
      frame: 4,
      mirror: false,
    });
    expect(mirroredWarrior.sample(mirroredImpactAt + 300).sprites
      .find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 4, x: (mirroredImpact?.x ?? 0) + 192 });
    expect(mirroredWarrior.sample(mirroredHoldAt).sprites
      .find(({ channel }) => channel === "actor")).toBeUndefined();
    expect(FULL_COMBAT_FRAME_META.left[28].plus50.map(({ anchor }) => anchor))
      .toEqual([35, 36, 64, 36, 30]);
    expect(FULL_COMBAT_FRAME_META.right[28].plus50.map(({ anchor }) => anchor))
      .toEqual([67, 69, 23, 20, 98]);
  });

  it("keeps the struck unit fixed on screen while the native camera recoil completes", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result(),
    );
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");
    const counterWindupAt = markTime(script, "fullCounterWindup");
    const impact = script.sample(impactAt);
    const apex = script.sample(impactAt + 180);
    const hold = script.sample(holdAt);
    const holdMidpoint = script.sample(holdAt + 333);
    const impactActor = impact.sprites.find(({ set }) => set === "plus50");
    const strikingActor = script.sample(impactAt + 100).sprites.find(({ set }) => set === "plus50");
    const settlingActor = script.sample(impactAt + 150).sprites.find(({ set }) => set === "plus50");
    const primaryLast = script.sample(holdAt - 1);
    const impactVictim = impact.sprites.find(({ set }) => set === "direct");
    const apexVictim = apex.sprites.find(({ set }) => set === "direct");
    const holdVictim = primaryLast.sprites.find(({ set }) => set === "direct");

    expect(hold.camera - impact.camera).toBe(64);
    expect(apexVictim).toMatchObject({ x: impactVictim?.x, lift: 12 });
    expect(holdVictim).toMatchObject({ x: impactVictim?.x, lift: 4 });
    // The number is drawn once per post-hit substep and moves after each draw;
    // the eighth and last post-hit draw is at (x0 + 28, 114).
    expect(impact.damage).toMatchObject({ x: 270, y: 120, draw: 1 });
    expect(primaryLast.damage).toMatchObject({ x: 298, y: 114, draw: 8 });
    // The post-hit stream sets no animation mode, so the strike's :X keeps
    // alternating the flame frames: 5, 4, 5 at x=205, 165, 125. The stage-0
    // capture shows frame 4 at channel x 165 (video frames 120-122) and
    // frame 5 at x 125 (123-125) before the standing frame 0 at x 85.
    expect(impactActor).toMatchObject({ frame: 5, x: 205, mirror: false });
    expect(script.sample(impactAt + 50).sprites.find(({ set }) => set === "plus50"))
      .toMatchObject({ frame: 4, x: 165 });
    expect(strikingActor).toMatchObject({
      frame: 5,
      x: (impactActor?.x ?? 0) - 80,
      mirror: false,
    });
    expect(settlingActor).toMatchObject({
      frame: 0,
      x: (impactActor?.x ?? 0) - 120,
      mirror: false,
    });
    expect(primaryLast.sprites.find(({ set }) => set === "plus50")).toBeUndefined();
    expect(counterWindupAt - holdAt).toBe(667);
    expect(holdMidpoint).toMatchObject({
      camera: hold.camera,
      viewportYOffset: hold.viewportYOffset,
      sprites: hold.sprites,
    });
    // Only the number keeps moving through the AD51 redraws, then rests.
    expect(hold.damage).toMatchObject({ x: 302, y: 126, draw: 9 });
    expect(holdMidpoint.damage).toMatchObject({ x: 334, y: 126, draw: 19 });

    const counterImpactAt = markTime(script, "fullCounterImpact");
    const counterImpact = script.sample(counterImpactAt);
    const counterApex = script.sample(counterImpactAt + 180);
    const counterHoldAt = markTime(script, "fullCounterHold");
    const counterHold = script.sample(counterHoldAt);
    const finalHoldMidpoint = script.sample(counterHoldAt + 333);
    const counterImpactVictim = counterImpact.sprites.find(({ set }) => set === "direct");
    const counterApexVictim = counterApex.sprites.find(({ set }) => set === "direct");
    const counterHoldVictim = counterHold.sprites.find(({ set }) => set === "direct");

    expect(counterHold.camera - counterImpact.camera).toBe(-64);
    expect(counterApexVictim).toMatchObject({ x: counterImpactVictim?.x, lift: 0 });
    expect(counterHoldVictim).toMatchObject({ x: counterImpactVictim?.x, lift: 0 });
    expect(counterHold.sprites.find(({ set }) => set === "plus50")).toBeUndefined();
    expect(script.duration - counterHoldAt).toBe(667);
    expect(finalHoldMidpoint).toMatchObject({
      camera: counterHold.camera,
      viewportYOffset: counterHold.viewportYOffset,
      sprites: counterHold.sprites,
    });
    // B5B4 mirrors the hop for the side-2 counter: it settles 64 px to the
    // left of its origin, 20 px left of the struck left soldier at x=210.
    expect(counterImpact.damage).toMatchObject({ x: 190, y: 120, draw: 1, text: "   -8" });
    expect(finalHoldMidpoint.damage).toMatchObject({ x: 126, y: 126 });
  });

  it("opens the native panels and stage in their measured order", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );

    expect(script.sample(0)).toMatchObject({
      showRightPanel: true,
      showLeftPanel: false,
      showWindow: false,
      showScene: false,
      sprites: [],
    });
    expect(script.sample(90)).toMatchObject({
      showRightPanel: true,
      showLeftPanel: true,
      showWindow: false,
      showScene: false,
    });
    expect(script.sample(180)).toMatchObject({
      showWindow: true,
      showScene: false,
    });
    expect(script.sample(599).showScene).toBe(false);
    expect(script.sample(600)).toMatchObject({
      showScene: true,
      camera: 0,
      sprites: [{ set: "plus50", frame: 0 }],
    });

    const chargeAt = markTime(script, "fullCharge");
    const impactAt = markTime(script, "fullImpact");
    const charge = script.sample((chargeAt + impactAt) / 2);
    const beforeReveal = script.sample(impactAt - 331);
    const enteringVictim = script.sample(impactAt - 100);
    const holdAt = markTime(script, "fullHold");
    const hold = script.sample(holdAt);
    const finalHoldMidpoint = script.sample(holdAt + 333);

    expect(charge.camera).toBeGreaterThan(0);
    expect(charge.particles.length).toBeGreaterThan(0);
    expect(beforeReveal.sprites.some(({ set }) => set === "direct")).toBe(false);
    expect(enteringVictim.sprites.some(({ set }) => set === "direct")).toBe(true);
    expect(script.duration - holdAt).toBe(667);
    expect(finalHoldMidpoint).toMatchObject({
      camera: hold.camera,
      viewportYOffset: hold.viewportYOffset,
      sprites: hold.sprites,
    });
    expect(script.sample(script.duration).damage).toMatchObject({ x: 334, y: 126, draw: 20 });
  });

  it("mirrors common trail direction for the right-side counterattack", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "我方攻手"),
      unit(2, 48, "敵方反擊手"),
      result(),
    );
    const primaryCharge = script.sample(
      (markTime(script, "fullCharge") + markTime(script, "fullImpact")) / 2,
    );
    const counterCharge = script.sample(
      (markTime(script, "fullCounterCharge") + markTime(script, "fullCounterImpact")) / 2,
    );

    expect(primaryCharge.particles[1].x - primaryCharge.particles[0].x).toBe(-24);
    expect(counterCharge.particles[1].x - counterCharge.particles[0].x).toBe(24);
  });

  const commonTrailClasses = Object.entries(STAGE0_FULL_COMBAT_PROFILES)
    .filter(([, profile]) => Object.values(profile.commandStreams).length === 2
      && Object.values(profile.commandStreams).some(
        (streams) => streams?.mainLeftOrAttacker.steps.some(
          (step: { commands: readonly { token: string }[] }) => step.commands.some(
            ({ token }) => token === "EY" || token === "UE",
          ),
        ),
      ))
    .map(([classId]) => classId as UnitClassId);

  it.each(commonTrailClasses)(
    "mirrors the common trail for %s when its physical side changes",
    (classId) => {
      const sampleDirection = (side: 1 | 2): number => {
        const attacker = unit(side, side === 1 ? 0 : 48, "測試攻手", classId);
        const defender = unit(side === 1 ? 2 : 1, side === 1 ? 48 : 0, "測試守手");
        const script = buildFullCombatScript(
          attacker,
          defender,
          result({
            attackerId: attacker.id,
            defenderId: defender.id,
            counterOccurred: false,
            counterDamage: 0,
          }),
        );
        const start = markTime(script, "fullWindup");
        const impact = markTime(script, "fullImpact");
        for (let t = start; t < impact; t += 40) {
          const particles = script.sample(t + 1).particles;
          if (particles.length >= 2) return particles[1].x - particles[0].x;
        }
        throw new Error(`No common trail was rendered for class ${classId}`);
      };

      const leftDirection = sampleDirection(1);
      expect(leftDirection === -24 || leftDirection === 24).toBe(true);
      expect(sampleDirection(2)).toBe(-leftDirection);
    },
  );

  const guardTrailClasses = Object.entries(STAGE0_FULL_COMBAT_PROFILES)
    .filter(([, profile]) => Object.values(profile.commandStreams).length === 2
      && Object.values(profile.commandStreams).some(
        (streams) => streams?.mainLeftOrAttacker.steps.some(
          (step: { commands: readonly { token: string }[] }) => step.commands.some(
            ({ token }) => token === "EY" || token === "UE",
          ),
        )
        && (streams?.auxiliaryC.steps.some(
          (step: { commands: readonly { token: string }[] }) => step.commands.some(
            ({ token }) => token === "EY" || token === "UE",
          ),
        ) || streams?.auxiliaryD.steps.some(
          (step: { commands: readonly { token: string }[] }) => step.commands.some(
            ({ token }) => token === "EY" || token === "UE",
          ),
        )),
      ),
    )
    .map(([classId]) => classId as UnitClassId);

  it.each(guardTrailClasses)(
    "uses the native physical-side direction during guard recoil for %s",
    (classId) => {
      const firstTrailDirection = (
        script: FullCombatScript,
        start: number,
        end: number,
        stepMs: number,
      ): number => {
        for (let t = start; t < end; t += stepMs) {
          const particles = script.sample(t + 1).particles;
          if (particles.length >= 2) return particles[1].x - particles[0].x;
        }
        throw new Error(`No common trail was rendered for class ${classId}`);
      };
      const profile = STAGE0_FULL_COMBAT_PROFILES[
        classId as keyof typeof STAGE0_FULL_COMBAT_PROFILES
      ];

      for (const side of [1, 2] as const) {
        const defenderSide = side === 1 ? 2 : 1;
        const attacker = unit(side, side === 1 ? 0 : 48, "測試攻手", classId);
        const defender = unit(defenderSide, defenderSide === 1 ? 0 : 48, "測試守手");
        const baseResult = {
          attackerId: attacker.id,
          defenderId: defender.id,
          counterOccurred: false,
          counterDamage: 0,
        };
        const attack = buildFullCombatScript(
          attacker,
          defender,
          result({ ...baseResult, damage: 24 }),
        );
        const guard = buildFullCombatScript(
          attacker,
          defender,
          result({ ...baseResult, damage: 8 }),
        );
        const attackDirection = firstTrailDirection(
          attack,
          markTime(attack, "fullWindup"),
          markTime(attack, "fullImpact"),
          40,
        );
        const guardDirection = firstTrailDirection(
          guard,
          markTime(guard, "fullImpact"),
          markTime(guard, "fullHold"),
          50,
        );
        const streams = sideStreams(profile, side === 1 ? "left" : "right");
        const guardState = initialReferencePresentation(side === 1 ? "left" : "right");
        const mainSubsteps = streams.mainLeftOrAttacker.steps.reduce(
          (sum, step) => sum + step.rendererSubsteps,
          0,
        );
        for (let substep = 0; substep < mainSubsteps; substep += 1) {
          applyReferencePresentationCommands(
            guardState,
            "actor",
            referenceCommandsAtSubstep(streams.mainLeftOrAttacker.steps, substep),
          );
          applyReferencePresentationCommands(
            guardState,
            "victim",
            referenceCommandsAtSubstep(streams.mainRightOrDefender.steps, substep),
          );
        }
        let guardEffectRole: "actor" | "victim" | undefined;
        const guardSubsteps = streams.auxiliaryC.steps.reduce(
          (sum, step) => sum + step.rendererSubsteps,
          0,
        );
        for (let substep = 0; substep < guardSubsteps; substep += 1) {
          applyReferencePresentationCommands(
            guardState,
            "actor",
            referenceCommandsAtSubstep(streams.auxiliaryC.steps, substep),
          );
          applyReferencePresentationCommands(
            guardState,
            "victim",
            referenceCommandsAtSubstep(streams.auxiliaryD.steps, substep),
          );
          if (guardState.actorEffect !== "N") {
            guardEffectRole = "actor";
            break;
          }
          if (guardState.victimEffect !== "N") {
            guardEffectRole = "victim";
            break;
          }
        }
        expect(guardEffectRole).toBeDefined();
        const guardSubjectSide = guardEffectRole === "actor" ? side : defenderSide;
        expect(guardDirection).toBe(guardSubjectSide === 1 ? 24 : -24);
        if (guardEffectRole === "actor") expect(guardDirection).toBe(-attackDirection);
      }
    },
  );

  it("uses the native 210-pixel life-gauge tiers and updates them at each impact", () => {
    expect(nativeFullCombatLifeGauge(0)).toEqual({
      life: 0,
      baseColorIndex: 0,
      fillColorIndex: 11,
      fillWidth: 0,
    });
    expect(nativeFullCombatLifeGauge(160)).toMatchObject({
      baseColorIndex: 0,
      fillColorIndex: 11,
      fillWidth: 160,
    });
    expect(nativeFullCombatLifeGauge(260)).toMatchObject({
      baseColorIndex: 11,
      fillColorIndex: 9,
      fillWidth: 50,
    });
    expect(nativeFullCombatLifeGauge(500)).toMatchObject({
      baseColorIndex: 9,
      fillColorIndex: 13,
      fillWidth: 80,
    });
    expect(nativeFullCombatLifeGauge(630)).toMatchObject({
      baseColorIndex: 6,
      fillColorIndex: 6,
      fillWidth: 0,
    });

    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result(),
    );
    const primaryImpact = markTime(script, "fullImpact");
    const counterImpact = markTime(script, "fullCounterImpact");
    expect(script.sample(primaryImpact - 1).lifeGauges).toMatchObject({
      left: { life: 160, fillWidth: 160 },
      right: { life: 180, fillWidth: 180 },
    });
    expect(script.sample(primaryImpact).lifeGauges).toMatchObject({
      left: { life: 160, fillWidth: 160 },
      right: { life: 156, fillWidth: 156 },
    });
    expect(script.sample(counterImpact).lifeGauges).toMatchObject({
      left: { life: 152, fillWidth: 152 },
      right: { life: 156, fillWidth: 156 },
    });

    const mirrored = buildFullCombatScript(
      unit(2, 48, "敵方攻手"),
      unit(1, 0, "我方守手"),
      result({ attackerId: "2:48", defenderId: "1:0" }),
    );
    expect(mirrored.sample(markTime(mirrored, "fullImpact")).lifeGauges).toMatchObject({
      left: { life: 136, fillWidth: 136 },
      right: { life: 180, fillWidth: 180 },
    });
    expect(mirrored.sample(markTime(mirrored, "fullCounterImpact")).lifeGauges).toMatchObject({
      left: { life: 136, fillWidth: 136 },
      right: { life: 172, fillWidth: 172 },
    });
  });

  it("takes the impact sound from each record's own post-hit voice slots", () => {
    const impactCues = (classId: UnitClassId, damage: number) => {
      const script = buildFullCombatScript(
        unit(1, 0, "測試攻方", classId),
        unit(2, 48, "測試守方"),
        result({ damage, counterOccurred: false, counterDamage: 0 }),
      );
      const impact = markTime(script, "fullImpact");
      const hold = markTime(script, "fullHold");
      return script.cues.filter(({ t }) => t >= impact && t < hold);
    };

    // Records 0 and 22 are the two stage-0 classes whose streams literally
    // contain V1/V2, which is why E/2 and E/0 look like engine defaults.
    expect(impactCues("soldier", 24)).toEqual([
      expect.objectContaining({ record: 2, reason: "full-primary-hurt" }),
    ]);
    expect(impactCues("soldier", 10)).toEqual([
      expect.objectContaining({ record: 0, reason: "full-primary-guard" }),
    ]);

    // Record 19's DS:ABD5/DS:AC0F both open with `V5`, so both damage branches
    // land on its own E/4 instead of the threshold sounds.
    expect(impactCues("great-dragon-knight", 24)).toEqual([
      expect.objectContaining({ record: 4, reason: "full-primary-hurt" }),
    ]);
    expect(impactCues("great-dragon-knight", 10)).toEqual([
      expect.objectContaining({ record: 4, reason: "full-primary-guard" }),
    ]);

    // Record 14 carries its hurt voice on the victim stream (DS:A559 `V1`) and
    // has no voice record at all in the guard pair, so guard stays silent.
    expect(impactCues("demon-dragon-knight", 24)).toEqual([
      expect.objectContaining({ record: 2, reason: "full-primary-hurt" }),
    ]);
    expect(impactCues("demon-dragon-knight", 10)).toEqual([]);
  });

  it("holds the fatal victim for the native 24-substep death stream", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result({
        counterOccurred: false,
        counterDamage: 0,
        defenderDied: true,
      }),
    );
    const holdAt = markTime(script, "fullDefenderDeath");

    expect(script.marks.some(({ phase }) => phase.startsWith("fullCounter"))).toBe(false);
    expect(script.cues.some(({ record, reason }) => record === 2 && reason === "full-primary-hurt")).toBe(true);
    expect(script.cues.some(({ record, reason }) => record === 11 && reason === "full-primary-death")).toBe(true);
    expect(script.sample(holdAt - 40).sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 1,
      reaction: "hurt",
      lift: 4,
    });
    expect(script.sample(holdAt).sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 2,
      reaction: "death",
      lift: 0,
    });
    expect(script.sample(holdAt + 100).sprites.find(({ set }) => set === "direct")?.opacity).toBe(1);
    expect(script.sample(holdAt + 200).sprites.find(({ set }) => set === "direct")?.opacity).toBe(1);
    expect(script.sample(holdAt + 1_100).sprites.find(({ set }) => set === "direct"))
      .toMatchObject({ frame: 2, reaction: "death", opacity: 1 });
    expect(script.duration - holdAt).toBe(1_200);
    expect(script.sample(script.duration + 100).camera).toBe(400);

    const lowDamageDeath = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result({
        damage: 10,
        counterOccurred: false,
        counterDamage: 0,
        defenderDied: true,
      }),
    );
    expect(lowDamageDeath.cues.some(({ record, reason }) => record === 0 && reason === "full-primary-guard")).toBe(true);
    expect(lowDamageDeath.cues.some(({ record, reason }) => record === 11 && reason === "full-primary-death")).toBe(true);
    const lowDamageDeathAt = markTime(lowDamageDeath, "fullDefenderDeath");
    expect(lowDamageDeath.sample(lowDamageDeathAt - 40).sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 3,
      reaction: "guard",
      lift: 0,
    });
    expect(lowDamageDeath.sample(lowDamageDeathAt).sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 2,
      reaction: "death",
      lift: 0,
    });
  });

  it("uses the cavalry throw channel without the common trail effect", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "哈釘", "cavalry"),
      unit(2, 48, "騎士團騎兵", "cavalry"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const windupAt = markTime(script, "fullWindup");
    const throwAt = markTime(script, "fullCharge");
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");

    expect(script.sample(windupAt + 10).sprites.find(({ set }) => set === "plus50")?.frame).toBe(0);
    expect(script.sample(windupAt + 200).sprites.find(({ set }) => set === "plus50")?.frame).toBe(2);
    expect(script.sample(windupAt + 360).sprites.find(({ set }) => set === "plus50")?.frame).toBe(4);
    expect(script.sample(throwAt + 50).sprites.find(({ set }) => set === "plus50")?.frame).toBe(5);

    const earlyLance = script.sample(throwAt + 120);
    const middleLance = script.sample((throwAt + impactAt) / 2);
    const lateLance = script.sample(impactAt - 20);
    expect(earlyLance.lance?.frame).toBe(6);
    expect(middleLance.lance?.frame).toBe(7);
    expect(lateLance.lance?.frame).toBe(8);
    expect(middleLance.particles).toEqual([]);
    expect(script.sample(throwAt + 300).sprites.find(({ set }) => set === "plus50"))
      .toBeUndefined();
    const impact = script.sample(impactAt);
    // Contact hands the surviving G1 channel back to the up-canted frame 6: the
    // lance deflects away at the native (+-30,-16) per post-hit substep instead
    // of driving frame 8 further into the ground.
    expect(script.sample(impactAt - 1).lance)
      .toMatchObject({ side: "left", frame: 8, x: 256, y: 103 });
    expect(impact.sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ side: "right", x: 245 });
    expect([0, 50, 100, 150, 200, 250].map((offset) => script.sample(impactAt + offset).lance))
      .toEqual([
        { side: "left", frame: 6, x: 260, y: 118 },
        { side: "left", frame: 6, x: 290, y: 102 },
        { side: "left", frame: 6, x: 320, y: 86 },
        { side: "left", frame: 6, x: 350, y: 70 },
        { side: "left", frame: 6, x: 380, y: 54 },
        { side: "left", frame: 6, x: 410, y: 38 },
      ]);
    expect(script.sample(impactAt + 400).lance).toBeUndefined();
    expect(script.sample(holdAt).lance).toBeUndefined();
    const firstApex = script.sample(impactAt + 100);
    const reboundApex = script.sample(impactAt + 550);
    const hold = script.sample(holdAt);
    const impactVictim = impact.sprites.find(({ set }) => set === "direct");
    expect(firstApex.sprites.find(({ set }) => set === "direct")).toMatchObject({
      frame: 1,
      reaction: "hurt",
      x: impactVictim?.x,
      lift: 36,
    });
    expect(reboundApex.sprites.find(({ set }) => set === "direct")).toMatchObject({
      x: impactVictim?.x,
      lift: 24,
    });
    expect(hold.camera - impact.camera).toBe(112);
    expect(hold.sprites.find(({ set }) => set === "direct")).toMatchObject({
      x: impactVictim?.x,
      lift: 0,
    });
    expect(hold.sprites.find(({ set }) => set === "plus50")).toBeUndefined();
    expect(script.cues.some(({ reason }) => reason === "full-primary-native-22-v5")).toBe(true);
    expect(script.cues.some(({ record, reason }) => record === 38 && reason.startsWith("full-primary"))).toBe(false);
    expect(FULL_COMBAT_FRAME_META.left[22].plus50.map(({ anchor }) => anchor))
      .toEqual([43, 39, 41, 45, 65, 39, 48, 50, 52]);
    expect(FULL_COMBAT_FRAME_META.right[22].plus50.map(({ anchor }) => anchor))
      .toEqual([49, 62, 62, 53, 51, 53, 56, 66, 59]);

    const mirrored = buildFullCombatScript(
      unit(2, 15, "哈釘", "cavalry"),
      unit(1, 0, "妮雅"),
      result({
        attackerId: "2:15",
        defenderId: "1:0",
        counterOccurred: false,
        counterDamage: 0,
      }),
    );
    const mirroredImpactAt = markTime(mirrored, "fullImpact");
    const mirroredImpact = mirrored.sample(mirroredImpactAt);
    expect(mirroredImpact.camera).toBeLessThan(0);
    expect(mirroredImpact.sprites.find(({ set }) => set === "direct"))
      .toMatchObject({ side: "left", x: 255 });
    expect(mirrored.sample(mirroredImpactAt - 1).lance)
      .toMatchObject({ side: "right", frame: 8, x: 236, y: 103 });
    expect([0, 50, 100, 250, 300].map((offset) => mirrored.sample(mirroredImpactAt + offset).lance))
      .toEqual([
        { side: "right", frame: 6, x: 232, y: 118 },
        { side: "right", frame: 6, x: 202, y: 102 },
        { side: "right", frame: 6, x: 172, y: 86 },
        { side: "right", frame: 6, x: 82, y: 38 },
        { side: "right", frame: 6, x: 52, y: 22 },
      ]);
    expect(mirrored.sample(mirroredImpactAt + 500).lance).toBeUndefined();
    const mirroredFlight = mirrored.sample(
      (markTime(mirrored, "fullCharge") + markTime(mirrored, "fullImpact")) / 2,
    );
    expect(mirroredFlight.lance).toMatchObject({ side: "right", frame: 7 });
  });

  it.each([
    { damage: 10, expectedFrame: 3, expectedReaction: "guard", expectedRecord: 0, label: "standing guard" },
    { damage: 11, expectedFrame: 1, expectedReaction: "hurt", expectedRecord: 2, label: "ordinary hit" },
  ] as const)("uses the $label reaction for $damage damage", ({
    damage,
    expectedFrame,
    expectedReaction,
    expectedRecord,
  }) => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result({ damage, counterOccurred: false, counterDamage: 0 }),
    );

    expect(script.sample(markTime(script, "fullHold")).sprites.find(({ set }) => set === "direct"))
      .toMatchObject({ frame: expectedFrame, reaction: expectedReaction });
    expect(script.cues.some(({ record, reason }) =>
      record === expectedRecord && reason === `full-primary-${expectedReaction}`)).toBe(true);
    expect(script.cues.filter(({ record }) => record === 14)).toHaveLength(1);
  });
});

// Field origins (`DS:7C35/7C37`) of the first stage-0 battle's "  -24", tracked
// in ref/战斗场景视频.mp4 by matching the whole field, shadow passes included,
// against every frame (scene = capture - (96, 186)). Draws 1–8 fall on the
// post-hit substeps, 9–19 on the AD51 hold redraws; draw 20 repeats draw 19.
const CAPTURE_DAMAGE_ORIGINS = [
  { draw: 1, frame: 116, x: 270, y: 120 },
  { draw: 2, frame: 120, x: 274, y: 102 },
  { draw: 3, frame: 123, x: 278, y: 84 },
  { draw: 4, frame: 126, x: 282, y: 66 },
  { draw: 5, frame: 128, x: 286, y: 78 },
  { draw: 6, frame: 132, x: 290, y: 90 },
  { draw: 7, frame: 134, x: 294, y: 102 },
  { draw: 8, frame: 137, x: 298, y: 114 },
  { draw: 9, frame: 139, x: 302, y: 126 },
  { draw: 10, frame: 141, x: 306, y: 116 },
  { draw: 11, frame: 144, x: 310, y: 106 },
  { draw: 12, frame: 147, x: 314, y: 96 },
  { draw: 13, frame: 149, x: 318, y: 106 },
  { draw: 14, frame: 151, x: 322, y: 116 },
  { draw: 15, frame: 153, x: 326, y: 126 },
  { draw: 16, frame: 156, x: 328, y: 116 },
  { draw: 17, frame: 158, x: 330, y: 106 },
  { draw: 18, frame: 161, x: 332, y: 116 },
  { draw: 19, frame: 163, x: 334, y: 126 },
] as const;

describe("Full-screen damage number (B4F1)", () => {
  const POST_HIT_SUBSTEP = 50;
  const HOLD_DRAW = 32;

  it("hops through every draw exactly where the stage-0 capture shows it", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result(),
    );
    const impactAt = markTime(script, "fullImpact");
    const holdAt = markTime(script, "fullHold");
    expect(holdAt - impactAt).toBe(8 * POST_HIT_SUBSTEP);
    expect(script.sample(impactAt - 1).damage).toBeUndefined();

    for (const { draw, x, y } of CAPTURE_DAMAGE_ORIGINS) {
      const t = draw <= 8
        ? impactAt + (draw - 1) * POST_HIT_SUBSTEP
        : holdAt + (draw - 9) * HOLD_DRAW;
      expect(script.sample(t).damage, `draw ${draw}`).toEqual({
        amount: 24,
        text: "  -24",
        x,
        y,
        draw,
        inkColorIndex: 11,
      });
    }
    // AD36 stops at the 20th draw, which repeats the 19th; the image then
    // stays up until the counter's own strike stream repaints the window.
    const counterAt = markTime(script, "fullCounterWindup");
    for (const t of [holdAt + 11 * HOLD_DRAW, counterAt - 1]) {
      expect(script.sample(t).damage).toMatchObject({ x: 334, y: 126, draw: 20, inkColorIndex: 11 });
    }
    expect(script.sample(counterAt).damage).toBeUndefined();
  });

  it("mirrors the hop when side 2 acts and restarts it for the counter", () => {
    const script = buildFullCombatScript(
      unit(2, 48, "騎士團士兵"),
      unit(1, 0, "妮雅"),
      result({ attackerId: "2:48", defenderId: "1:0", counterOccurred: false, counterDamage: 0 }),
    );
    const impactAt = markTime(script, "fullImpact");
    // The struck left soldier stands at x=210, so the number starts at 190.
    expect(script.sample(impactAt).damage).toMatchObject({ x: 190, y: 120, draw: 1 });
    expect(script.sample(impactAt + POST_HIT_SUBSTEP).damage).toMatchObject({ x: 186, y: 102, draw: 2 });
    expect(script.sample(script.duration).damage).toMatchObject({ x: 126, y: 126, draw: 20 });
  });

  it("keeps drawing the number, in white, through a fatal strike's death stream", () => {
    const script = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      unit(2, 48, "騎士團士兵"),
      result({ damage: 180, defenderDied: true, counterOccurred: false, counterDamage: 0 }),
    );
    const impactAt = markTime(script, "fullImpact");
    const deathAt = markTime(script, "fullDefenderDeath");
    expect(deathAt - impactAt).toBe(8 * POST_HIT_SUBSTEP);
    expect(script.sample(deathAt - 1).damage)
      .toMatchObject({ text: " -180", x: 298, y: 114, draw: 8, inkColorIndex: 11 });
    // A237 resets DS:F93C to 15 before B683/B6BD run, and only the next A1E8
    // clears DS:7C32, so every death-stream substep draws the number white.
    expect(script.sample(deathAt).damage)
      .toMatchObject({ x: 302, y: 126, draw: 9, inkColorIndex: 15 });
    expect(script.sample(deathAt + 10 * POST_HIT_SUBSTEP).damage)
      .toMatchObject({ x: 334, y: 126, draw: 19, inkColorIndex: 15 });
    const deathSubsteps = STAGE0_FULL_COMBAT_DEATH.right.steps
      .reduce((sum, step) => sum + step.rendererSubsteps, 0);
    expect(script.sample(script.duration).damage)
      .toMatchObject({ x: 334, y: 126, draw: 8 + deathSubsteps, inkColorIndex: 15 });
  });

  it("leaves the last post-hit draw up when AD36 draws nothing", () => {
    // 234 - 24 = 210 empties the right gauge's active tier, so AD36 skips
    // every redraw and the eighth draw stays on screen.
    const gaugeEdge = buildFullCombatScript(
      unit(1, 0, "妮雅"),
      { ...unit(2, 48, "騎士團士兵"), life: 234 },
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const holdAt = markTime(gaugeEdge, "fullHold");
    for (const t of [holdAt, holdAt + 300, gaugeEdge.duration]) {
      expect(gaugeEdge.sample(t).damage).toMatchObject({ x: 298, y: 114, draw: 8 });
    }

    // Record 8's 40-substep post-hit stream passes the twentieth draw on its
    // own: the number rests from draw 19 and AD36 adds nothing.
    const halfDragon = classIdFromNativeRecord(8);
    if (!halfDragon) throw new Error("record 8 has no class");
    const longStream = buildFullCombatScript(
      unit(1, 0, "測試攻方", halfDragon),
      unit(2, 48, "騎士團士兵"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const longHoldAt = markTime(longStream, "fullHold");
    const longImpactAt = markTime(longStream, "fullImpact");
    expect(longHoldAt - longImpactAt).toBe(40 * POST_HIT_SUBSTEP);
    expect(longStream.sample(longImpactAt).damage).toMatchObject({ x: 180, y: 120, draw: 1 });
    expect(longStream.sample(longImpactAt + 18 * POST_HIT_SUBSTEP).damage)
      .toMatchObject({ x: 244, y: 126, draw: 19 });
    expect(longStream.sample(longStream.duration).damage)
      .toMatchObject({ x: 244, y: 126, draw: 40 });
  });

  it.each([
    [0, "   -0"],
    [1, " -  1"],
    [2, "  - 2"],
    [3, "   -3"],
    [9, "   -9"],
    [10, "  -10"],
    [99, "  -99"],
    [100, " -100"],
    [999, " -999"],
    [1000, "-1000"],
  ] as const)("formats %i damage as the native field %j", (damage, field) => {
    // A2CF's LOOP counter is the damage itself, so 1 and 2 stop the space
    // scan early and leave the minus detached from the digit.
    expect(nativeDamageField(damage)).toBe(field);
  });

  it("never reaches F5C8's x <= 0 clamp and never leaves the window", () => {
    const { glyph } = STAGE0_FULL_COMBAT_DAMAGE_NUMBER;
    expect(glyph.cellRows).toBe(NATIVE_FONT.cellHeight);
    expect(glyph.cellWidth).toBe(NATIVE_FONT.halfWidthWidth);
    let checked = 0;
    for (const profile of Object.values(STAGE0_FULL_COMBAT_PROFILES)) {
      const classId = classIdFromNativeRecord(profile.nativeRecord);
      if (!classId) continue;
      for (const side of profile.reach === "right-only" ? [2] as const : [1, 2] as const) {
        const attacker = unit(side, 0, "測試攻方", classId);
        const defender = unit(side === 1 ? 2 : 1, 48, "測試守方");
        const script = buildFullCombatScript(attacker, defender, result({
          attackerId: attacker.id,
          defenderId: defender.id,
          damage: 123,
          counterOccurred: false,
          counterDamage: 0,
        }));
        const first = script.sample(markTime(script, "fullImpact")).damage;
        const last = script.sample(script.duration).damage;
        if (!first || !last) throw new Error(`record ${profile.nativeRecord} drew no number`);
        // The hop only ever moves one way, so the two ends bound every draw.
        const leftmostGlyph = Math.min(first.x, last.x) + glyph.advance * first.text.indexOf("-");
        const rightmostPixel = Math.max(first.x, last.x) + glyph.advance * first.text.length + 1;
        expect(leftmostGlyph, `record ${profile.nativeRecord} side ${side}`)
          .toBeGreaterThan(glyph.clampNonPositiveXTo - 1);
        expect(rightmostPixel, `record ${profile.nativeRecord} side ${side}`)
          .toBeLessThanOrEqual(FULL_SCENE.width);
        checked += 1;
      }
    }
    expect(checked).toBe(75);
  });

  it.skipIf(!EVIDENCE_AVAILABLE)("ships the damage-number rules the extractor read from module 29", async () => {
    const evidence = JSON.parse(await readFile(
      path.join(workspace, "reverse/parsed/native/combat-presentations.json"),
      "utf8",
    )) as {
      fullScreenPresentation: {
        damageNumber: {
          placement: { xOffset: number; y: number };
          velocity: {
            leftActor: { bands: unknown[]; otherwise: unknown };
            rightActor: { bands: Array<{ drawsBelow: number; dx: number; dy: number }> };
          };
          glyph: { passes: Array<{ dx: number; dy: number; colorVariable: string }> };
          ink: { strikeColorIndex: number; resetColorIndex: number };
          shadow: { colorIndex: number };
        };
      };
    };
    const native = evidence.fullScreenPresentation.damageNumber;
    const shipped = STAGE0_FULL_COMBAT_DAMAGE_NUMBER;
    expect(shipped.origin).toEqual({ xOffsetFromVictim: native.placement.xOffset, y: native.placement.y });
    expect(shipped.velocityBySide1Actor).toEqual(native.velocity.leftActor);
    expect(native.velocity.rightActor.bands).toEqual(shipped.velocityBySide1Actor.bands
      .map(({ drawsBelow, dx, dy }) => ({ drawsBelow, dx: -dx, dy })));
    expect([...shipped.glyph.shadowPasses, shipped.glyph.inkPass])
      .toEqual(native.glyph.passes.map(({ dx, dy }) => ({ dx, dy })));
    expect(native.glyph.passes.map(({ colorVariable }) => colorVariable))
      .toEqual(["DS:F93E", "DS:F93E", "DS:F93E", "DS:F93C"]);
    expect(shipped.inkColorIndex).toEqual({
      strike: native.ink.strikeColorIndex,
      afterStrike: native.ink.resetColorIndex,
    });
    expect(shipped.shadowColorIndex).toBe(native.shadow.colorIndex);
  });
});
