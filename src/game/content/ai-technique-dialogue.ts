import type { BattleActionId } from "./actions";
import { BATTLE_ACTION_DEFINITIONS } from "./actions";
import {
  NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE,
  NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS,
  NATIVE_CONFUSED_ACTOR_DIALOGUE,
  NATIVE_CONTEXTUAL_BATTLE_LINES,
  type NativeAiTechniqueDialogueRecord,
} from "./ai-technique-dialogue.generated";
import type { BattleUnit, DialoguePage } from "../types";

/**
 * Module 29 DS:84BB contextual AI lines selected by all 33 native action
 * parameter rows. Both side-1 autonomous actors and side-2 enemies use them.
 */
export { NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE, NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS };
export { NATIVE_CONFUSED_ACTOR_DIALOGUE, NATIVE_CONTEXTUAL_BATTLE_LINES };

export type ContextualBattleLineKey = keyof typeof NATIVE_CONTEXTUAL_BATTLE_LINES;

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
 * DS:84BB contextual lines that are not AI technique notices. Every one of them
 * is spoken by a single unit in that unit's own side window, with its own
 * portrait, and closes on the native per-character timing without a confirmation
 * menu. They all reach `0000:C97E` directly rather than through `1000:254F`, so
 * the ＡＩ對話 switch does not silence them.
 */
export function contextualBattleDialogueFor(
  actor: Pick<BattleUnit, "name" | "portrait" | "side">,
  line: ContextualBattleLineKey,
  /** Only `18h` has one: the record the native rewrites before it opens. */
  text?: string,
): DialoguePage {
  const native = NATIVE_CONTEXTUAL_BATTLE_LINES[line];
  const window = {
    portrait: actor.portrait,
    speaker: actor.name,
    text: text ?? native.text,
  };
  return {
    activeSlot: actor.side === 1 ? "upper" : "lower",
    upper: actor.side === 1 ? window : undefined,
    lower: actor.side === 2 ? window : undefined,
    source: {
      record: native.record,
      wait: native.selector,
      address: native.address,
    },
  };
}

/**
 * `0000:EF56` writes the award into the five ASCII cells the record reserves:
 * five decimal digits, then a loop that turns every leading `0` into a space and
 * a final fix-up that puts a `0` back when the whole field blanked out. So the
 * field is a fixed-width right-aligned slot and the native draws those spaces at
 * 8 px each — trimming them would move the number and the trailing `點`.
 *
 * The writer divides a 16-bit register, so it can only ever show `0..65535`.
 */
export function nativeExperienceLineText(amount: number): string {
  const { text, numericField } = NATIVE_CONTEXTUAL_BATTLE_LINES.experienceGain;
  const width = numericField.digits.length;
  const clamped = Math.max(0, Math.min(0xffff, Math.trunc(amount)));
  return text.replace(numericField.digits, String(clamped).padStart(width, " "));
}

/**
 * `0000:91F1`/`0000:9161` (an ordinary attack or its counter that killed) and
 * `0000:7678` (a player technique whose death scan removed someone) all load the
 * award into the record and then hand the killer's own cell to `0000:C97E`, so
 * the line is spoken by the unit that gained the experience.
 */
export function experienceGainDialogueFor(
  actor: Pick<BattleUnit, "name" | "portrait" | "side">,
  amount: number,
): DialoguePage {
  return contextualBattleDialogueFor(actor, "experienceGain", nativeExperienceLineText(amount));
}

/**
 * `0000:66F4` plays contextual line `1Ch` with the clicked unit's own portrait
 * before the confused unit is handed to the single-unit AI entry.
 */
export function confusedActorDialogueFor(
  actor: Pick<BattleUnit, "name" | "portrait" | "side">,
): DialoguePage {
  return contextualBattleDialogueFor(actor, "confusedActor");
}
