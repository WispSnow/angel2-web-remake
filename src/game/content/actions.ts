import {
  STAGE0_ACTION_DEFINITIONS,
  STAGE0_ACTION_AUDIO_ASSETS,
  STAGE0_ACTION_PRESENTATION_ASSETS,
  STAGE0_REST_PRESENTATION,
} from "./stage0-actions.generated";
import { classDefinition, classTierFor } from "./classes";
import type { BattleUnit } from "../types";

type ExtendedActionContent = typeof import("./stage1-actions.generated");
export const CLASS_SHOWDOWN_TELEPORT_ACTION_ID = "showdown-teleport" as const;

const CLASS_SHOWDOWN_ACTION_DEFINITIONS = {
  [CLASS_SHOWDOWN_TELEPORT_ACTION_ID]: {
    id: CLASS_SHOWDOWN_TELEPORT_ACTION_ID,
    nativeCode: null,
    label: "瞬移",
    kind: "technique",
    target: "empty-cell",
    range: {
      mode: "full-map",
    },
    experience: {
      fixed: 0,
    },
    presentationId: "class-showdown-teleport",
  },
} as const;

type BattleActionDefinitions = typeof STAGE0_ACTION_DEFINITIONS
  & ExtendedActionContent["STAGE1_ACTION_DEFINITIONS"]
  & typeof CLASS_SHOWDOWN_ACTION_DEFINITIONS;
type BattleActionAudioAssets = typeof STAGE0_ACTION_AUDIO_ASSETS
  & ExtendedActionContent["STAGE1_ACTION_AUDIO_ASSETS"];

export const BATTLE_ACTION_DEFINITIONS = {
  ...STAGE0_ACTION_DEFINITIONS,
  ...CLASS_SHOWDOWN_ACTION_DEFINITIONS,
} as unknown as BattleActionDefinitions;

export type BattleActionId = keyof typeof BATTLE_ACTION_DEFINITIONS;

const TECHNIQUE_ACTION_BY_NATIVE_CODE = {
  "1F": "fire-1",
  "2F": "fire-2",
  "3F": "fire-3",
  "4F": "fire-4",
  "1H": "heal-1",
  "2H": "heal-2",
  "3H": "heal-3",
  "1L": "lightning-1",
  "2L": "lightning-2",
  "3L": "lightning-3",
  "4L": "lightning-4",
  "1C": "ice-1",
  "2C": "ice-2",
  "3C": "ice-3",
  "4C": "ice-4",
  "1I": "recovery-1",
  "2I": "recovery-2",
  "3I": "recovery-3",
  AA: "attack-up",
  FM: "magic-guard",
  IP: "poison",
  LA: "confusion",
  SA: "attack-down",
  SD: "defense-down",
  SN: "spell-seal",
  OJ: "prayer",
  AD: "defense-up",
  TR: "dispel",
  "1D": "stomp-1",
  "2D": "stomp-2",
  "3D": "stomp-3",
  "1K": "iron-plate",
  "2K": "obstacle",
} as const satisfies Readonly<Record<string, BattleActionId>>;

export function techniqueActionIdsFor(
  unit: Pick<BattleUnit, "classId" | "experience">,
): readonly BattleActionId[] {
  const tier = classTierFor(unit);
  const actions = classDefinition(unit.classId).technique?.tiers[tier - 1]?.actions ?? [];
  return actions.map(({ actionCode }) => {
    const actionId = TECHNIQUE_ACTION_BY_NATIVE_CODE[
      actionCode as keyof typeof TECHNIQUE_ACTION_BY_NATIVE_CODE
    ];
    if (!actionId) throw new Error(`unsupported native technique code ${actionCode}`);
    return actionId;
  });
}

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
