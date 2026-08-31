import { className, classStatsFor } from "../content/classes";
import type {
  CombatPresentation,
  CombatPresentationPhase,
} from "../controller";
import {
  buildFullCombatScript,
  type FullCombatPhaseName,
  type FullCombatScript,
} from "../full-combat";
import { emptyUnitStatuses } from "../simulation/status";
import type { AttackResult, BattleUnit, Side, UnitClassId } from "../types";
import { renderCombat, type CombatPresentationRenderSource } from "../ui";
import { programNow } from "../program-clock";
import type { ClassPreviewSelection } from "./class-view";

export interface ClassPreviewController {
  destroy(): void;
}

const PREVIEW_NATIVE_WIDTH = 454;
const PREVIEW_NATIVE_HEIGHT = 163;
const PREVIEW_REPLAY_HOLD = 700;

const previewExperience = (classId: UnitClassId): number => classId === "soldier" ? 299 : 300;

function makeUnit(
  role: "attacker" | "defender",
  classId: UnitClassId,
  side: Side,
): BattleUnit {
  const experience = previewExperience(classId);
  return {
    id: `compendium:${role}`,
    side,
    slot: role === "attacker" ? 0 : 48,
    classId,
    className: className(classId),
    name: role === "attacker" ? "攻方" : "守方",
    portrait: side === 1 ? 46 : 48,
    x: side === 1 ? 24 : 25,
    y: 26,
    life: classStatsFor({ classId, experience }).maxLife,
    experience,
    acted: false,
    actionDisabled: false,
    statuses: emptyUnitStatuses(),
  };
}

function phaseAt(script: FullCombatScript, time: number): FullCombatPhaseName {
  let selected: FullCombatPhaseName = "fullOpen";
  for (const mark of script.marks) {
    if (mark.t > time) break;
    selected = mark.phase;
  }
  return selected;
}

function scenarioFor(
  classId: UnitClassId,
  selection: ClassPreviewSelection,
): {
  attacker: BattleUnit;
  defender: BattleUnit;
  result: AttackResult;
} {
  const currentSide: Side = selection.side === "ally" ? 1 : 2;
  const opponentSide: Side = currentSide === 1 ? 2 : 1;
  // A standing class is sampled as the target immediately before contact:
  // that is the native direct frame 0, not the attacker's +50 wind-up set.
  const currentIsAttacker = selection.animation === "attack";
  const attacker = currentIsAttacker
    ? makeUnit("attacker", classId, currentSide)
    : makeUnit("attacker", "soldier", opponentSide);
  const defender = currentIsAttacker
    ? makeUnit("defender", "soldier", opponentSide)
    : makeUnit("defender", classId, currentSide);
  const damage = selection.animation === "guard"
    ? 8
    : selection.animation === "hurt"
      ? 24
      : selection.animation === "death"
        ? defender.life
        : 24;
  return {
    attacker,
    defender,
    result: {
      attackerId: attacker.id,
      defenderId: defender.id,
      damage,
      counterDamage: 0,
      counterOccurred: false,
      defenderDied: selection.animation === "death",
      attackerDied: false,
      experienceGained: 0,
      counterExperienceGained: 0,
    },
  };
}

/**
 * Mounts the same deterministic full-combat script and DOM renderer used by
 * campaign battles and the combat lab. The compendium only crops the native
 * 454×163 battle window; it does not maintain a second animation table.
 */
export function mountClassPreview(
  detail: HTMLElement,
  classId: UnitClassId,
  selection: ClassPreviewSelection,
): ClassPreviewController | undefined {
  const stage = detail.querySelector<HTMLElement>("[data-testid=compendium-combat-stage]");
  const nativeFrame = detail.querySelector<HTMLElement>(".rn-class-combat-native");
  const presentationLayer = detail.querySelector<HTMLElement>(".rn-class-combat-presentation");
  if (!stage || !nativeFrame || !presentationLayer) return undefined;

  const { attacker, defender, result } = scenarioFor(classId, selection);
  const script = buildFullCombatScript(attacker, defender, result);
  const staticFrame = selection.animation === "stand";
  const windupAt = script.marks.find(({ phase }) => phase === "fullWindup")?.t ?? 0;
  const impactAt = script.marks.find(({ phase }) => phase === "fullImpact")?.t ?? windupAt;
  const startAt = staticFrame ? Math.max(windupAt, impactAt - 1) : windupAt;
  const currentSide: Side = selection.side === "ally" ? 1 : 2;
  const renderSource: CombatPresentationRenderSource = {
    battlePresentation: "full",
    unitStats: classStatsFor,
  };
  let currentTime = startAt;
  let previousFrameTime = programNow();
  let replayAt: number | undefined;
  let animationFrame = 0;
  let destroyed = false;

  const resize = (): void => {
    const scale = Math.min(1, stage.clientWidth / PREVIEW_NATIVE_WIDTH);
    stage.style.height = `${Math.round(PREVIEW_NATIVE_HEIGHT * scale)}px`;
    nativeFrame.style.setProperty("--rn-class-combat-scale", String(scale));
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  resize();

  const renderFrame = (): void => {
    const phase = phaseAt(script, currentTime);
    const sampledScene = script.sample(currentTime);
    const scene = staticFrame
      ? {
          ...sampledScene,
          viewportYOffset: 0,
          sprites: sampledScene.sprites.filter(
            ({ channel, side }) => channel === "victim"
              && side === (currentSide === 1 ? "left" : "right"),
          ),
          lance: undefined,
          projectile: undefined,
          particles: [],
          damage: undefined,
        }
      : sampledScene;
    const presentation: CombatPresentation = {
      attacker,
      defender,
      result,
      phase: phase as CombatPresentationPhase,
      frame: 0,
      displayedAttackerLife: attacker.life,
      displayedDefenderLife: defender.life,
      displayedLifeByUnitId: {
        [attacker.id]: attacker.life,
        [defender.id]: defender.life,
      },
      fullScene: scene,
    };
    renderSource.combatPresentation = presentation;
    renderCombat(presentationLayer, renderSource);
    stage.dataset.phase = phase;
    stage.dataset.animation = selection.animation;
    stage.dataset.side = selection.side;
    stage.dataset.static = String(staticFrame);
  };

  const tick = (): void => {
    if (destroyed) return;
    const now = programNow();
    const elapsed = Math.min(100, now - previousFrameTime);
    previousFrameTime = now;
    if (replayAt !== undefined) {
      if (now >= replayAt) {
        currentTime = startAt;
        replayAt = undefined;
        renderFrame();
      }
    } else {
      currentTime = Math.min(script.duration, currentTime + elapsed);
      renderFrame();
      if (currentTime >= script.duration) replayAt = now + PREVIEW_REPLAY_HOLD;
    }
    animationFrame = requestAnimationFrame(tick);
  };

  renderFrame();
  if (!staticFrame) animationFrame = requestAnimationFrame(tick);

  return {
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    },
  };
}
