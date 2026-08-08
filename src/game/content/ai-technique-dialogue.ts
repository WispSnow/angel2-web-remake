import type { BattleActionId } from "./actions";
import { BATTLE_ACTION_DEFINITIONS } from "./actions";
import {
  NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE,
  NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS,
  type NativeAiTechniqueDialogueRecord,
} from "./ai-technique-dialogue.generated";
import type { BattleUnit, DialoguePage } from "../types";

/**
 * Module 29 DS:84BB contextual AI lines selected by all 33 native action
 * parameter rows. Both side-1 autonomous actors and side-2 enemies use them.
 */
export { NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE, NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS };

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
  if (definition.nativeCode == null) return undefined;
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
