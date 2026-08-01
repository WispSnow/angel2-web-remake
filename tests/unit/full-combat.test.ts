import { describe, expect, it } from "vitest";
import {
  ACCEPTED_FULL_COMBAT_RECORDS,
  FULL_COMBAT_ACCEPTANCE,
} from "../../src/game/content/full-combat-acceptance";
import {
  STAGE0_FULL_COMBAT_ASSETS,
  STAGE0_FULL_COMBAT_DEATH,
  STAGE0_FULL_COMBAT_PROFILES,
} from "../../src/game/content/stage0-actions.generated";
import { className } from "../../src/game/content/classes";
import {
  buildFullCombatScript,
  FULL_COMBAT_FRAME_META,
  type FullCombatPhaseName,
  type FullCombatScript,
} from "../../src/game/full-combat";
import { emptyUnitStatuses } from "../../src/game/simulation/status";
import type { AttackResult, BattleUnit, UnitClassId } from "../../src/game/types";

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

interface ReferenceFrame {
  frame: number;
  x: number;
  y: number;
  anchored: boolean;
}

function referenceNativeFrames(
  steps: readonly ReferenceCommandStep[],
  initialX = 0,
  initialY = 0,
  initialAnchored = false,
): ReferenceFrame[] {
  const frames: ReferenceFrame[] = [];
  let x = initialX;
  let y = initialY;
  let anchored = initialAnchored;
  let mode: "none" | "alternate" | "cycle4" | "cycle6" = "none";
  let counter = 0;
  for (const step of steps) {
    for (const command of step.commands) {
      if (command.token === ":X") mode = "alternate";
      if (command.token === "X4") mode = "cycle4";
      if (command.token === "X6") mode = "cycle6";
      if (command.token === "XN") mode = "none";
      if (command.token === ":S") {
        const [nextX, nextY] = command.parameters;
        if (typeof nextX === "number") x = nextX;
        if (typeof nextY === "number") y = nextY;
        anchored = true;
      }
    }
    for (let substep = 0; substep < step.rendererSubsteps; substep += 1) {
      if (mode === "alternate") counter ^= 1;
      else if (mode === "cycle4") counter = (counter + 1) % 4;
      else if (mode === "cycle6") counter = (counter + 1) % 6;
      else counter = 0;
      frames.push({ frame: step.pose.frame + counter, x, y, anchored });
      x += step.pose.deltaX;
      y += step.pose.deltaY;
    }
  }
  return frames;
}

/**
 * `:S` writes battle-window coordinates whose y is the bitmap bottom anchor;
 * a stream that has not been repositioned stays in the ground-relative frame
 * the character channel starts in.
 */
function referenceActorLift({ y, anchored }: Pick<ReferenceFrame, "y" | "anchored">): number {
  return anchored ? 127 - y : Math.max(0, -y);
}

function referenceNativeEnd(
  steps: readonly ReferenceCommandStep[],
  initialX = 0,
  initialY = 0,
): { x: number; y: number } {
  const frames = referenceNativeFrames(steps, initialX, initialY);
  const finalStep = steps.at(-1);
  const finalFrame = frames.at(-1);
  return {
    x: (finalFrame?.x ?? initialX) + (finalStep?.pose.deltaX ?? 0),
    y: (finalFrame?.y ?? initialY) + (finalStep?.pose.deltaY ?? 0),
  };
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
  particles: Array<{ x: number; y: number; frame: number }>;
}

function initialReferencePresentation(): ReferencePresentationState {
  return {
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
  initial = initialReferencePresentation(),
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
      const towardRight = (effectRole === "actor" && effect === "U")
        || (effectRole === "victim" && effect === "Y");
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
  const actorX = expectedActorMark(record, side);
  const direction = side === "left" ? 1 : -1;
  if (record === 20) return actorX + direction * 37;
  if (record === 21) return side === "left" ? 250 : 198;
  if (record === 24) return actorX + direction * 4;
  if (record === 22) return Math.max(70, Math.min(378, actorX + direction * 182));
  return side === "left" ? 302 : 146;
}

function expectedActorMark(record: number, side: "left" | "right"): number {
  if (record === 22) return side === "left" ? 146 : 302;
  return side === "left" ? 253 : 195;
}

describe("Full-screen ordinary combat choreography", () => {
  it("advances the per-record acceptance gate without gaps", () => {
    expect(FULL_COMBAT_ACCEPTANCE).toHaveLength(39);
    expect(FULL_COMBAT_ACCEPTANCE.map(({ record }) => record))
      .toEqual(Array.from({ length: 39 }, (_, record) => record));
    expect(ACCEPTED_FULL_COMBAT_RECORDS)
      .toEqual(Array.from({ length: 36 }, (_, record) => record));
    expect(FULL_COMBAT_ACCEPTANCE.slice(0, 36).every((entry) =>
      entry.evidence?.commandStreams
      && entry.evidence.framePlacement
      && (entry.evidence.leftAndRightSemantics || entry.evidence.rightOnlyOriginal)
      && entry.evidence.attackScreenshot.endsWith("-attack.png")
      && entry.evidence.guardScreenshot.endsWith("-guard.png")
      && entry.evidence.hurtScreenshot.endsWith("-hurt.png")
      && entry.evidence.deathScreenshot.endsWith("-death.png"))).toBe(true);
    expect(FULL_COMBAT_ACCEPTANCE.slice(36).map(({ status }) => status))
      .toEqual([
        "not-applicable-original",
        "not-applicable-original",
        "not-applicable-original",
      ]);
    expect(FULL_COMBAT_ACCEPTANCE[35]).toMatchObject({
      classId: "empress",
      status: "accepted",
      evidence: { rightOnlyOriginal: true },
    });
  });

  it("packages native command and graphic evidence for all 36 applicable records", () => {
    const profiles = Object.values(STAGE0_FULL_COMBAT_PROFILES);
    expect(profiles).toHaveLength(36);
    expect(profiles.map(({ nativeRecord }) => nativeRecord))
      .toEqual(Array.from({ length: 36 }, (_, record) => record));
    for (const profile of profiles) {
      expect(Object.keys(profile.commandStreams.left)).toEqual([
        "mainLeftOrAttacker",
        "mainRightOrDefender",
        "auxiliaryA",
        "auxiliaryB",
        "auxiliaryC",
        "auxiliaryD",
      ]);
      expect(Object.keys(profile.commandStreams.right)).toEqual([
        "mainLeftOrAttacker",
        "mainRightOrDefender",
        "auxiliaryA",
        "auxiliaryB",
        "auxiliaryC",
        "auxiliaryD",
      ]);
    }
    expect(Object.keys(STAGE0_FULL_COMBAT_ASSETS.left)).toHaveLength(36);
    expect(Object.keys(STAGE0_FULL_COMBAT_ASSETS.right)).toHaveLength(36);
    expect(STAGE0_FULL_COMBAT_ASSETS.left.empress.direct).toHaveLength(0);
    expect(STAGE0_FULL_COMBAT_ASSETS.left.empress.plus50).toHaveLength(0);
    expect(STAGE0_FULL_COMBAT_ASSETS.right.empress.direct.length).toBeGreaterThan(0);
    expect(STAGE0_FULL_COMBAT_ASSETS.right.empress.plus50.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(STAGE0_FULL_COMBAT_PROFILES).flatMap(([classId, profile]) =>
    (["left", "right"] as const)
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
      const streams = profile.commandStreams[side];
      const mainActor = streams.mainLeftOrAttacker.steps as readonly ReferenceCommandStep[];
      const mainVictim = streams.mainRightOrDefender.steps as readonly ReferenceCommandStep[];
      const mainActorFrames = referenceNativeFrames(mainActor, expectedActorMark(record, side), 0);
      const mainVictimFrames = referenceNativeFrames(mainVictim);
      const mainVictimEnd = referenceNativeEnd(mainVictim);
      const mainCamera = referenceNativeCameraFrames(mainActor);
      const victimMark = expectedVictimMark(record, side);
      expect(mainVictimFrames).toHaveLength(mainActorFrames.length);
      const mainPresentation = referencePresentationFrames(
        mainActor,
        mainVictim,
        mainActorFrames.map((actorFrame, index) => ({
          actorX: actorFrame.x,
          victimX: victimMark + mainVictimFrames[index].x - mainVictimEnd.x,
        })),
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
            lift: referenceActorLift(expectedActor),
          });
        }
        const expectedVictim = mainVictimFrames[index];
        const victimX = victimMark + expectedVictim.x - mainVictimEnd.x;
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
            lift: Math.max(0, -expectedVictim.y),
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
              x: linkedFrames[0].x + (expected.x - linkedFrames[0].x) * 2.5
                + (side === "left" ? -37 : 0),
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
                lift: 127 - expected.y,
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
        const mainActorEnd = referenceNativeEnd(
          mainActor,
          expectedActorMark(record, side),
          0,
        );
        // Only an absolute `:S` anchor survives the switch to the post-hit
        // stream; a ground-relative character channel settles back to its mark.
        const mainActorLast = mainActorFrames.at(-1);
        const actorFrames = referenceNativeFrames(
          actorSteps,
          mainActorEnd.x,
          mainActorLast?.anchored ? mainActorLast.y : 0,
          mainActorLast?.anchored ?? false,
        );
        const victimFrames = referenceNativeFrames(
          victimSteps,
          victimMark,
          0,
        );
        expect(victimFrames).toHaveLength(actorFrames.length);
        const postCamera = referenceNativeCameraFrames(actorSteps, mainCamera.direction);
        const postPresentation = referencePresentationFrames(
          actorSteps,
          victimSteps,
          actorFrames.map((actorFrame) => ({
            actorX: actorFrame.x,
            victimX: victimMark,
          })),
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
              lift: referenceActorLift(expectedActor),
            });
          }
          const expectedVictim = victimFrames[index];
          expect(state.sprites.find(({ channel }) => channel === "victim"))
            .toMatchObject({
              reaction,
              frame: expectedVictim.frame,
              x: victimMark,
              lift: Math.max(0, -expectedVictim.y),
            });
          expect(state.camera).toBe(mainCamera.final + postCamera.camera[index]);
          expect(state.viewportYOffset).toBe(postPresentation.frames[index].viewportYOffset);
          expect(state.particles).toEqual(postPresentation.frames[index].particles);
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
                  lift: 127 - expected.y,
                });
              }
            }
          }
        }
      }

      const voiceSlots = profile.voiceSlots[side];
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
      expect(actualReactionCues).toEqual(expectedReactionCues.length > 0
        ? expectedReactionCues
        : [{ t: impact, record: 2 }]);

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
      const streams = profile.commandStreams[side];
      const mainActor = streams.mainLeftOrAttacker.steps as readonly ReferenceCommandStep[];
      const mainVictim = streams.mainRightOrDefender.steps as readonly ReferenceCommandStep[];
      const mainActorFrames = referenceNativeFrames(mainActor, side === "left" ? 253 : 195, 0);
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
      );
      const postActor = streams.auxiliaryA.steps as readonly ReferenceCommandStep[];
      const postVictim = streams.auxiliaryB.steps as readonly ReferenceCommandStep[];
      const mainActorEnd = referenceNativeEnd(mainActor, side === "left" ? 253 : 195, 0);
      const postActorFrames = referenceNativeFrames(postActor, mainActorEnd.x, 0);
      const postPresentation = referencePresentationFrames(
        postActor,
        postVictim,
        postActorFrames.map((actorFrame) => ({ actorX: actorFrame.x, victimX: victimMark })),
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
        lift: -8,
      }),
    ]));
    expect(script.sample(startAt + 60).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ frame: 2, x: 82, lift: -8 });
    expect(script.sample(startAt + 700).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 1, x: 205 });
    expect(script.sample(impactAt).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ frame: 7, x: 250, lift: -8 });
    expect(script.sample(impactAt + 100).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ frame: 7, x: 330, lift: -8 });
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
      .toMatchObject({ side: "right", frame: 3, x: 442, lift: -8 });
    expect(mirrored.sample(mirroredStart + 60).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ side: "right", frame: 2, x: 418, lift: -8 });
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
    expect(script.sample(startAt + 800).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 2, frame: 4, x: 243 });
    expect(script.sample(impactAt).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 2, frame: 4, x: 88 });
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
      .toMatchObject({ side: "right", frame: 4, x: 205 });
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
      expect.objectContaining({ classId: 3, channel: "actor", frame: 1, x: 221 }),
      expect.objectContaining({ classId: 3, channel: "G1", frame: 2, x: 260, lift: -8 }),
    ]));
    expect(script.sample(impactAt).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ classId: 3, frame: 2, x: 260, lift: -8 });
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
      expect.objectContaining({ side: "right", channel: "actor", frame: 1, x: 227 }),
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
      .toMatchObject({ classId: 4, frame: 1, x: 253 });
    expect(script.sample(startAt + 520).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 2, lift: 10 });
    expect(script.sample(impactAt - 1).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 4, x: 228, lift: 10 });
    expect(script.sample(impactAt).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 0, x: 223, lift: 0 });
    expect(script.sample(impactAt + 100).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ frame: 0, x: 159 });
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
      .toMatchObject({ side: "right", frame: 4, x: 220, lift: 10 });
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
      .toMatchObject({ classId: 5, frame: 6, x: 280, lift: 7 });
    expect(script.sample(startAt + 840).sprites.find(({ channel }) => channel === "G1"))
      .toMatchObject({ frame: 6, x: 280, lift: 11 });
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
      .toMatchObject({ side: "right", frame: 6, x: 260, lift: 7 });
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

  it("keeps the great dragon knight visible until its wide post-hit bitmap is clipped", () => {
    const left = buildFullCombatScript(
      unit(1, 0, "測試攻方", "great-dragon-knight"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const leftImpact = markTime(left, "fullImpact");
    const leftHold = markTime(left, "fullHold");
    expect(left.sample(leftImpact + 500).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 19, x: -97 });
    expect(left.sample(leftHold).sprites.find(({ channel }) => channel === "actor"))
      .toBeUndefined();

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
    expect(right.sample(rightImpact + 500).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "right", classId: 19, x: 545 });
    expect(right.sample(rightHold).sprites.find(({ channel }) => channel === "actor"))
      .toBeUndefined();
  });

  it("drops the crossbow bolt from above the window onto the native ground anchor", () => {
    const left = buildFullCombatScript(
      unit(1, 0, "測試攻方", "crossbow"),
      unit(2, 48, "測試守方"),
      result({ counterOccurred: false, counterDamage: 0 }),
    );
    const leftImpact = markTime(left, "fullImpact");
    // `:S (266,-105)` starts the descent 232 px above the ground line and
    // `dy=+25` walks it down to the y=120 anchor over ten substeps.
    expect(left.sample(leftImpact - 400).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 21, frame: 4, x: 266, lift: 232 });
    expect(left.sample(leftImpact - 200).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 21, frame: 4, x: 266, lift: 107 });
    expect(left.sample(leftImpact - 40).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 21, frame: 4, x: 266, lift: 7 });
    // The post-hit stream issues no `:S`, so the landed frame 5 inherits the
    // descent's last presented anchor instead of snapping anywhere else.
    expect(left.sample(leftImpact).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "left", classId: 21, frame: 5, x: 266, lift: 7 });

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
      .toMatchObject({ side: "right", classId: 21, frame: 4, x: 216, lift: 7 });
    expect(right.sample(rightImpact).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ side: "right", classId: 21, frame: 5, x: 216, lift: 7 });
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
    expect(leftContact.victimSpan).toEqual([228, 316]);

    const rightContact = contact("right");
    expect(rightContact.bolt).toMatchObject({ side: "right", classId: 21, frame: 5, x: 216 });
    expect(rightContact.victim).toMatchObject({ side: "left", frame: 1, x: 198 });
    expect(rightContact.boltSpan).toEqual([188, 372]);
    expect(rightContact.victimSpan).toEqual([116, 204]);

    // Both sides land the bolt just past the victim's ground anchor and keep
    // the two bitmaps overlapping, mirroring the archer's contact geometry.
    for (const { bolt, victim, boltSpan, victimSpan } of [leftContact, rightContact]) {
      expect(Math.abs((bolt?.x ?? 0) - (victim?.x ?? 0))).toBeLessThanOrEqual(18);
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
    expect(leftOrb).toMatchObject({ side: "left", classId: 24, frame: 6, x: 208 });
    expect(leftVictim).toMatchObject({ side: "right", frame: 1, x: 257 });
    const leftOrbMeta = FULL_COMBAT_FRAME_META.left[24].plus50[6];
    const leftVictimMeta = FULL_COMBAT_FRAME_META.right[0].direct[1];
    const leftOrbRight = (leftOrb?.x ?? 0) - leftOrbMeta.anchor + leftOrbMeta.w;
    const leftVictimLeft = (leftVictim?.x ?? 0) - leftVictimMeta.anchor;
    expect(leftOrbRight - leftVictimLeft).toBe(15);

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
    expect(rightOrb).toMatchObject({ side: "right", classId: 24, frame: 6, x: 240 });
    expect(rightVictim).toMatchObject({ side: "left", frame: 1, x: 191 });
    const rightOrbMeta = FULL_COMBAT_FRAME_META.right[24].plus50[6];
    const rightVictimMeta = FULL_COMBAT_FRAME_META.left[0].direct[1];
    const rightOrbLeft = (rightOrb?.x ?? 0) - rightOrbMeta.anchor;
    const rightVictimRight = (rightVictim?.x ?? 0) - rightVictimMeta.anchor + rightVictimMeta.w;
    expect(rightVictimRight - rightOrbLeft).toBe(3);
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
      .toMatchObject({ side: "left", x: 158, frame: 1, reaction: "hurt" });
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
      .toMatchObject({ classId: 24, frame: 3, x: 118 });
    expect(sister.sample(sisterStart + 880).sprites
      .find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 24, frame: 6, x: 78, lift: 200 });
    expect(sister.sample(sisterImpact).sprites.find(({ channel }) => channel === "actor"))
      .toMatchObject({ classId: 24, frame: 6, x: 208 });
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
    const impact = script.sample(impactAt);
    const apex = script.sample(impactAt + 180);
    const impactActor = impact.sprites.find(({ set }) => set === "plus50");
    const strikingActor = script.sample(impactAt + 100).sprites.find(({ set }) => set === "plus50");
    const settlingActor = script.sample(impactAt + 150).sprites.find(({ set }) => set === "plus50");
    const primaryLast = script.sample(holdAt - 1);
    const counterStart = script.sample(holdAt);
    const impactVictim = impact.sprites.find(({ set }) => set === "direct");
    const apexVictim = apex.sprites.find(({ set }) => set === "direct");
    const holdVictim = primaryLast.sprites.find(({ set }) => set === "direct");

    expect(counterStart.camera - impact.camera).toBe(64);
    expect(apexVictim).toMatchObject({ x: impactVictim?.x, lift: 12 });
    expect(holdVictim).toMatchObject({ x: impactVictim?.x, lift: 4 });
    expect(primaryLast.damage?.x).toBe(impact.damage?.x);
    expect(strikingActor).toMatchObject({
      frame: 4,
      x: (impactActor?.x ?? 0) - 80,
      mirror: false,
    });
    expect(settlingActor).toMatchObject({
      frame: 0,
      x: (impactActor?.x ?? 0) - 120,
      mirror: false,
    });
    expect(primaryLast.sprites.find(({ set }) => set === "plus50")).toBeUndefined();

    const counterImpactAt = markTime(script, "fullCounterImpact");
    const counterImpact = script.sample(counterImpactAt);
    const counterApex = script.sample(counterImpactAt + 180);
    const counterHold = script.sample(markTime(script, "fullCounterHold"));
    const counterImpactVictim = counterImpact.sprites.find(({ set }) => set === "direct");
    const counterApexVictim = counterApex.sprites.find(({ set }) => set === "direct");
    const counterHoldVictim = counterHold.sprites.find(({ set }) => set === "direct");

    expect(counterHold.camera - counterImpact.camera).toBe(-64);
    expect(counterApexVictim).toMatchObject({ x: counterImpactVictim?.x, lift: 0 });
    expect(counterHoldVictim).toMatchObject({ x: counterImpactVictim?.x, lift: 0 });
    expect(counterHold.sprites.find(({ set }) => set === "plus50")).toBeUndefined();
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

    expect(charge.camera).toBeGreaterThan(0);
    expect(charge.particles.length).toBeGreaterThan(0);
    expect(beforeReveal.sprites.some(({ set }) => set === "direct")).toBe(false);
    expect(enteringVictim.sprites.some(({ set }) => set === "direct")).toBe(true);
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
      .toMatchObject({ side: "left", frame: 8, x: 339, y: 103 });
    expect(impact.sprites.find(({ channel }) => channel === "victim"))
      .toMatchObject({ side: "right", x: 328 });
    expect([0, 50, 100, 150, 200, 250].map((offset) => script.sample(impactAt + offset).lance))
      .toEqual([
        { side: "left", frame: 6, x: 349, y: 118 },
        { side: "left", frame: 6, x: 379, y: 102 },
        { side: "left", frame: 6, x: 409, y: 86 },
        { side: "left", frame: 6, x: 439, y: 70 },
        { side: "left", frame: 6, x: 469, y: 54 },
        undefined,
      ]);
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
      .toMatchObject({ side: "left", x: 120 });
    expect(mirrored.sample(mirroredImpactAt - 1).lance)
      .toMatchObject({ side: "right", frame: 8, x: 116, y: 103 });
    expect([0, 50, 100, 250, 300].map((offset) => mirrored.sample(mirroredImpactAt + offset).lance))
      .toEqual([
        { side: "right", frame: 6, x: 106, y: 118 },
        { side: "right", frame: 6, x: 76, y: 102 },
        { side: "right", frame: 6, x: 46, y: 86 },
        { side: "right", frame: 6, x: -44, y: 38 },
        undefined,
      ]);
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
