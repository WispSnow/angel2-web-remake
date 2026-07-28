import type { BattleUnit, DialoguePage, DialogueWindowState } from "../types";
import {
  NIA_CHARACTER_RECORD,
  PROMOTION_DIALOGUE_TEXT,
} from "./promotion-dialogue.generated";

export {
  NIA_CHARACTER_RECORD,
  PROMOTION_DIALOGUE_TEXT,
};

const state = (
  text: string,
  portrait: BattleUnit["portrait"],
  speaker: string,
): DialogueWindowState => ({ text, portrait, speaker });

const page = (
  wait: number,
  activeSlot: DialoguePage["activeSlot"],
  upper?: DialogueWindowState,
  lower?: DialogueWindowState,
): DialoguePage => ({
  activeSlot,
  upper,
  lower,
  source: {
    record: "promotion",
    wait,
    address: "0000:0487",
  },
});

export function promotionDialogueFor(unit: BattleUnit): readonly DialoguePage[] {
  const nia = state(PROMOTION_DIALOGUE_TEXT.niaQuestion, NIA_CHARACTER_RECORD, "妮雅");
  if (unit.portrait === NIA_CHARACTER_RECORD) {
    return [page(1, "upper", nia)];
  }

  const request = state(PROMOTION_DIALOGUE_TEXT.teammateRequest, unit.portrait, unit.name);
  const grant = state(PROMOTION_DIALOGUE_TEXT.niaGrant, NIA_CHARACTER_RECORD, "妮雅");
  return [
    page(1, "lower", undefined, request),
    page(2, "upper", grant, request),
  ];
}
