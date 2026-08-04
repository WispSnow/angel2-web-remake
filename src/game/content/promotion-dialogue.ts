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

export function promotionDialogueFor(
  unit: BattleUnit,
  grantor?: Pick<BattleUnit, "id" | "name" | "portrait">,
): readonly DialoguePage[] {
  const effectiveGrantor = grantor ?? {
    id: "native-nia",
    name: "妮雅",
    portrait: NIA_CHARACTER_RECORD,
  };
  const unitIsGrantor = grantor
    ? unit.id === grantor.id
    : unit.portrait === NIA_CHARACTER_RECORD;
  if (unitIsGrantor) {
    const question = state(
      PROMOTION_DIALOGUE_TEXT.niaQuestion,
      effectiveGrantor.portrait,
      effectiveGrantor.name,
    );
    return [page(1, "upper", question)];
  }

  const request = state(PROMOTION_DIALOGUE_TEXT.teammateRequest, unit.portrait, unit.name);
  const grant = state(
    PROMOTION_DIALOGUE_TEXT.niaGrant,
    effectiveGrantor.portrait,
    effectiveGrantor.name,
  );
  return [
    page(1, "lower", undefined, request),
    page(2, "upper", grant, request),
  ];
}
