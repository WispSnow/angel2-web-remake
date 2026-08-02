import {
  STAGE0_ACTION_DEFINITIONS,
  STAGE0_ACTION_AUDIO_ASSETS,
  STAGE0_ACTION_PRESENTATION_ASSETS,
} from "./stage0-actions.generated";

type Stage1ActionContent = typeof import("./stage1-actions.generated");
type BattleActionDefinitions = typeof STAGE0_ACTION_DEFINITIONS
  & Stage1ActionContent["STAGE1_ACTION_DEFINITIONS"];
type BattleActionAudioAssets = typeof STAGE0_ACTION_AUDIO_ASSETS
  & Stage1ActionContent["STAGE1_ACTION_AUDIO_ASSETS"];

export const BATTLE_ACTION_DEFINITIONS = {
  ...STAGE0_ACTION_DEFINITIONS,
} as unknown as BattleActionDefinitions;

export type BattleActionId = keyof typeof BATTLE_ACTION_DEFINITIONS;

export const BATTLE_ACTION_AUDIO_ASSETS = {
  ...STAGE0_ACTION_AUDIO_ASSETS,
} as unknown as BattleActionAudioAssets;

let stage1Presentation: Stage1ActionContent["STAGE1_ACTION_PRESENTATION"] | undefined;
let stage1PresentationAssets:
  Stage1ActionContent["STAGE1_ACTION_PRESENTATION_ASSETS"] | undefined;

export function registerStage1ActionContent(content: Stage1ActionContent): void {
  Object.assign(BATTLE_ACTION_DEFINITIONS, content.STAGE1_ACTION_DEFINITIONS);
  Object.assign(BATTLE_ACTION_AUDIO_ASSETS, content.STAGE1_ACTION_AUDIO_ASSETS);
  stage1Presentation = content.STAGE1_ACTION_PRESENTATION;
  stage1PresentationAssets = content.STAGE1_ACTION_PRESENTATION_ASSETS;
}

export function stage1ActionPresentation(): Stage1ActionContent["STAGE1_ACTION_PRESENTATION"] {
  if (!stage1Presentation) throw new Error("stage 1 action presentation is not registered");
  return stage1Presentation;
}

export function stage1ActionPresentationAssets():
  Stage1ActionContent["STAGE1_ACTION_PRESENTATION_ASSETS"] {
  if (!stage1PresentationAssets) {
    throw new Error("stage 1 action presentation assets are not registered");
  }
  return stage1PresentationAssets;
}

export { STAGE0_ACTION_PRESENTATION_ASSETS };
