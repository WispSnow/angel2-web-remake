import {
  STAGE0_ACTION_DEFINITIONS,
  STAGE0_ACTION_AUDIO_ASSETS,
  STAGE0_ACTION_PRESENTATION_ASSETS,
  STAGE0_REST_PRESENTATION,
} from "./stage0-actions.generated";
import { classDefinition, classTierFor, type ClassId } from "./classes";
import type { BattleUnit } from "../types";

type ExtendedActionContent = typeof import("./stage1-actions.generated");
export const HALF_DRAGON_TELEPORT_ACTION_ID = "half-dragon-teleport" as const;

const halfDragonTeleport = classDefinition("half-dragon-warrior").directTechnique;
if (!halfDragonTeleport) {
  throw new Error("half-dragon-warrior lost its native direct technique in the class catalog");
}

/**
 * The native `1N` technique is reached straight from the class code at
 * `0000:702D`, so it has no action code, no tier menu and no dispatch-table
 * entry. REMAKE-062 gives it a remake-only id and label so the 技術 menu can
 * name it; every rule-bearing number still comes from the class catalog.
 */
const DIRECT_TECHNIQUE_ACTION_DEFINITIONS = {
  [HALF_DRAGON_TELEPORT_ACTION_ID]: {
    id: HALF_DRAGON_TELEPORT_ACTION_ID,
    nativeCode: null,
    label: "傳送",
    kind: "technique",
    target: halfDragonTeleport.target,
    range: {
      nativeSeed: halfDragonTeleport.rangeSeed,
      propagationMode: halfDragonTeleport.rangePropagationMode,
    },
    experience: {
      fixed: 0,
    },
    presentationId: "half-dragon-teleport",
  },
} as const;

const DIRECT_TECHNIQUE_ACTION_BY_CLASS = {
  "half-dragon-warrior": HALF_DRAGON_TELEPORT_ACTION_ID,
} as const satisfies Readonly<Partial<Record<ClassId, string>>>;

type BattleActionDefinitions = typeof STAGE0_ACTION_DEFINITIONS
  & ExtendedActionContent["STAGE1_ACTION_DEFINITIONS"]
  & typeof DIRECT_TECHNIQUE_ACTION_DEFINITIONS;
type BattleActionAudioAssets = typeof STAGE0_ACTION_AUDIO_ASSETS
  & ExtendedActionContent["STAGE1_ACTION_AUDIO_ASSETS"];

export const BATTLE_ACTION_DEFINITIONS = {
  ...STAGE0_ACTION_DEFINITIONS,
  ...DIRECT_TECHNIQUE_ACTION_DEFINITIONS,
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
  const definition = classDefinition(unit.classId);
  if (definition.directTechnique) {
    const directActionId = DIRECT_TECHNIQUE_ACTION_BY_CLASS[
      unit.classId as keyof typeof DIRECT_TECHNIQUE_ACTION_BY_CLASS
    ];
    if (!directActionId) throw new Error(`missing direct technique action for ${unit.classId}`);
    return [directActionId as BattleActionId];
  }
  const tier = classTierFor(unit);
  const actions = definition.technique?.tiers[tier - 1]?.actions ?? [];
  return actions.map(({ actionCode }) => {
    const actionId = TECHNIQUE_ACTION_BY_NATIVE_CODE[
      actionCode as keyof typeof TECHNIQUE_ACTION_BY_NATIVE_CODE
    ];
    if (!actionId) throw new Error(`unsupported native technique code ${actionCode}`);
    return actionId;
  });
}

export type IceActionId = Extract<BattleActionId, "ice-1" | "ice-2" | "ice-3" | "ice-4">;

export function isIceActionId(actionId: BattleActionId | undefined): actionId is IceActionId {
  return actionId === "ice-1" || actionId === "ice-2"
    || actionId === "ice-3" || actionId === "ice-4";
}

export function hasIceTechnique(
  unit: Pick<BattleUnit, "classId" | "experience">,
): boolean {
  return techniqueActionIdsFor(unit).some(isIceActionId);
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
