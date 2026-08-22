import { NATIVE_TEXT } from "./native-font.generated";
import { NATIVE_OBJECTIVE_PANEL_TEXT } from "./objective-panel.generated";
import type { StageId } from "../types";

export { NATIVE_OBJECTIVE_PANEL } from "./objective-panel.generated";

/**
 * `DS:1273` keys the 勝利條件 panel by native stage number, and the remake's own
 * stage ids carry that number: `stage-11` is native stage 11 even though it is
 * the campaign's tenth, and `stage-42-portal` is native stage 42. Every stage
 * generator already asserts its own key against the same table, so parsing the
 * id here cannot drift away from them without breaking those builds too.
 */
export function nativeStageNumber(stageId: StageId): number | undefined {
  const digits = /^stage-(\d+)/u.exec(stageId)?.[1];
  if (digits === undefined) return undefined;
  return Number(digits);
}

/**
 * The panel's drawable string for a stage: the original record's lines joined by
 * the cursor's own line feed, which `12E7:0240` reaches by resetting X and
 * adding 20 to Y — exactly what `0000:EA04` does for `7Ch`.
 *
 * Surfaces with no native stage (the arena, the class showdown and the labs)
 * have no recorded panel, so they get nothing rather than remake prose dressed
 * up as an original readout.
 */
export function nativeObjectivePanelText(stageId: StageId): string | undefined {
  const stage = nativeStageNumber(stageId);
  if (stage === undefined) return undefined;
  const lines = NATIVE_OBJECTIVE_PANEL_TEXT[stage];
  return lines?.join(NATIVE_TEXT.lineFeed.character);
}
