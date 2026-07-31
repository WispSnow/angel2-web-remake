import { STAGE0_ACTION_DEFINITIONS } from "../../content/stage0-actions.generated";
import { killRewardFor } from "../../content/classes";
import type { BattleUnit } from "../../types";
import type { DeterministicRng } from "../rng";
import { cloneUnitStatuses } from "../status";
import type {
  BattleActionIntent,
  PreparedBattleAction,
} from "./types";

export function prepareSpecialAction(
  intent: BattleActionIntent,
  actor: BattleUnit,
  target: BattleUnit,
  rng: DeterministicRng,
  targetMaximumLife: number,
): PreparedBattleAction {
  const trial = rng.clone();
  let damage = 0;
  let healing = 0;
  let blocked = false;
  const targetStatusesAfter = cloneUnitStatuses(target.statuses);

  if (intent.actionId === "archer-shot") {
    const definition = STAGE0_ACTION_DEFINITIONS["archer-shot"];
    damage = trial.between(definition.damage.minimum, definition.damage.maximum);
  } else if (intent.actionId === "fire-1") {
    const definition = STAGE0_ACTION_DEFINITIONS["fire-1"];
    if (target.statuses.magicGuard > 0) {
      blocked = true;
      targetStatusesAfter.magicGuard = 0;
    } else {
      damage = Math.min(
        target.life,
        definition.damage.cap,
        Math.floor(targetMaximumLife * definition.damage.maxLifePercent / 100),
      );
    }
  } else {
    const definition = STAGE0_ACTION_DEFINITIONS["heal-1"];
    healing = Math.min(
      targetMaximumLife - target.life,
      Math.floor(targetMaximumLife * definition.healing.maxLifePercent / 100),
    );
  }

  const targetLifeAfter = Math.max(0, Math.min(targetMaximumLife, target.life - damage + healing));
  const targetDied = targetLifeAfter === 0;
  let experienceGained = 0;
  if (intent.actionId === "archer-shot") {
    const definition = STAGE0_ACTION_DEFINITIONS["archer-shot"];
    experienceGained = trial.between(
      definition.experience.minimum,
      definition.experience.maximum,
    );
    if (targetDied) experienceGained += killRewardFor(target.classId, target.side);
  } else if (intent.actionId === "fire-1") {
    const definition = STAGE0_ACTION_DEFINITIONS["fire-1"];
    experienceGained = definition.experience.base + trial.between(
      definition.experience.randomMinimum,
      definition.experience.randomMaximum,
    );
    if (targetDied) experienceGained += killRewardFor(target.classId, target.side);
  } else {
    const definition = STAGE0_ACTION_DEFINITIONS["heal-1"];
    const q = Math.floor(healing * 10 / targetMaximumLife);
    experienceGained = trial.between(
      definition.experience.randomMinimum,
      definition.experience.randomMaximum,
    ) + (q === 0 ? 0 : q + definition.experience.base);
  }

  return {
    intent,
    result: {
      actionId: intent.actionId,
      actorId: actor.id,
      targetId: target.id,
      target: { x: target.x, y: target.y },
      damage,
      healing,
      blocked,
      targetDied,
      experienceGained,
    },
    rngBefore: rng.state,
    rngAfter: trial.state,
    actorExperienceBefore: actor.experience,
    actorExperienceAfter: actor.experience + experienceGained,
    targetLifeBefore: target.life,
    targetLifeAfter,
    targetStatusesBefore: cloneUnitStatuses(target.statuses),
    targetStatusesAfter,
  };
}
