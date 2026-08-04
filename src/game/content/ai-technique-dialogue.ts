import type { BattleActionId } from "./actions";
import { BATTLE_ACTION_DEFINITIONS } from "./actions";
import type { BattleUnit, DialoguePage } from "../types";

interface NativeAiTechniqueLine {
  selector: number;
  address: `DS:${string}`;
  text: string;
}

/**
 * Module 29 DS:84BB contextual AI lines selected by the action parameter
 * table. Stage 1 only reaches the two entries below through enemy sisters.
 */
export const NATIVE_AI_TECHNIQUE_LINES: Readonly<Partial<Record<BattleActionId, NativeAiTechniqueLine>>> = {
  "fire-1": { selector: 0x0a, address: "DS:85CA", text: "看我的火球魔法." },
  "heal-1": { selector: 0x0f, address: "DS:860C", text: "生命單." },
};

export function aiTechniqueDialogueFor(
  actor: Pick<BattleUnit, "name" | "portrait" | "side">,
  actionId: BattleActionId,
): DialoguePage | undefined {
  const line = NATIVE_AI_TECHNIQUE_LINES[actionId];
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
