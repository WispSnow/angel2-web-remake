import type { BattleActionId } from "./actions";
import { BATTLE_ACTION_DEFINITIONS } from "./actions";
import {
  NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE,
  NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS,
  NATIVE_CONFUSED_ACTOR_DIALOGUE,
  type NativeAiTechniqueDialogueRecord,
} from "./ai-technique-dialogue.generated";
import type { BattleUnit, DialoguePage } from "../types";

/**
 * Module 29 DS:84BB contextual AI lines selected by all 33 native action
 * parameter rows. Both side-1 autonomous actors and side-2 enemies use them.
 */
export { NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE, NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS };
export { NATIVE_CONFUSED_ACTOR_DIALOGUE };

export function nativeAiTechniqueDialogueForCode(
  nativeCode: string,
): NativeAiTechniqueDialogueRecord | undefined {
  return NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE[nativeCode];
}

export function aiTechniqueDialogueFor(
  actor: Pick<BattleUnit, "name" | "portrait" | "side">,
  actionId: BattleActionId,
): DialoguePage | undefined {
  const definition = BATTLE_ACTION_DEFINITIONS[actionId];
  // Native shooting codes share the same two-byte namespace as techniques:
  // magic-archer `1I`, for example, collides with recovery `1I`. The module-29
  // contextual lines belong to the technique dispatcher, not every action that
  // happens to carry the same bytes.
  if (definition.kind !== "technique" || definition.nativeCode == null) return undefined;
  const line = nativeAiTechniqueDialogueForCode(definition.nativeCode);
  if (!line) return undefined;
  const window = {
    portrait: actor.portrait,
    speaker: `${actor.name}・${BATTLE_ACTION_DEFINITIONS[actionId].label}`,
    text: line.text,
  };
  return {
    activeSlot: actor.side === 1 ? "upper" : "lower",
    upper: actor.side === 1 ? window : undefined,
    lower: actor.side === 2 ? window : undefined,
    source: {
      record: "ai-technique",
      wait: line.selector,
      address: line.address,
    },
  };
}

/**
 * `0000:66F4` plays contextual line `1Ch` with the clicked unit's own portrait
 * before the confused unit is handed to the single-unit AI entry. It reaches
 * `0000:C97E` directly rather than through `1000:254F`, so unlike every AI
 * technique line it is not gated by the ＡＩ對話 switch.
 */
export function confusedActorDialogueFor(
  actor: Pick<BattleUnit, "name" | "portrait" | "side">,
): DialoguePage {
  const window = {
    portrait: actor.portrait,
    speaker: actor.name,
    text: NATIVE_CONFUSED_ACTOR_DIALOGUE.text,
  };
  return {
    activeSlot: actor.side === 1 ? "upper" : "lower",
    upper: actor.side === 1 ? window : undefined,
    lower: actor.side === 2 ? window : undefined,
    source: {
      record: "confused-actor",
      wait: NATIVE_CONFUSED_ACTOR_DIALOGUE.selector,
      address: NATIVE_CONFUSED_ACTOR_DIALOGUE.address,
    },
  };
}
