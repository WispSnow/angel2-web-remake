import {
  STAGE0_ACTION_DEFINITIONS,
  STAGE0_ACTION_AUDIO_ASSETS,
  STAGE0_ACTION_PRESENTATION_ASSETS,
  STAGE0_REST_PRESENTATION,
} from "./stage0-actions.generated";

type ExtendedActionContent = typeof import("./stage1-actions.generated");
type BattleActionDefinitions = typeof STAGE0_ACTION_DEFINITIONS
  & ExtendedActionContent["STAGE1_ACTION_DEFINITIONS"];
type BattleActionAudioAssets = typeof STAGE0_ACTION_AUDIO_ASSETS
  & ExtendedActionContent["STAGE1_ACTION_AUDIO_ASSETS"];

export const BATTLE_ACTION_DEFINITIONS = {
  ...STAGE0_ACTION_DEFINITIONS,
} as unknown as BattleActionDefinitions;

export type BattleActionId = keyof typeof BATTLE_ACTION_DEFINITIONS;

export const BATTLE_ACTION_AUDIO_ASSETS = {
  ...STAGE0_ACTION_AUDIO_ASSETS,
} as unknown as BattleActionAudioAssets;

let presentationCatalog: ExtendedActionContent["STAGE1_ACTION_PRESENTATION"] | undefined;
let presentationAssetCatalog:
  ExtendedActionContent["STAGE1_ACTION_PRESENTATION_ASSETS"] | undefined;

export function registerActionContent(content: ExtendedActionContent): void {
  Object.assign(BATTLE_ACTION_DEFINITIONS, content.STAGE1_ACTION_DEFINITIONS);
  Object.assign(BATTLE_ACTION_AUDIO_ASSETS, content.STAGE1_ACTION_AUDIO_ASSETS);
  presentationCatalog = content.STAGE1_ACTION_PRESENTATION;
  presentationAssetCatalog = content.STAGE1_ACTION_PRESENTATION_ASSETS;
}

export function actionPresentationCatalog(): ExtendedActionContent["STAGE1_ACTION_PRESENTATION"] {
  if (!presentationCatalog) throw new Error("extended action presentation is not registered");
  return presentationCatalog;
}

export function actionPresentationAssetCatalog():
  ExtendedActionContent["STAGE1_ACTION_PRESENTATION_ASSETS"] {
  if (!presentationAssetCatalog) {
    throw new Error("extended action presentation assets are not registered");
  }
  return presentationAssetCatalog;
}

export { STAGE0_ACTION_PRESENTATION_ASSETS, STAGE0_REST_PRESENTATION };
