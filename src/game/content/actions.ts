import {
  STAGE0_ACTION_DEFINITIONS,
  STAGE0_ACTION_AUDIO_ASSETS,
  STAGE0_ACTION_PRESENTATION_ASSETS,
  STAGE0_REST_PRESENTATION,
} from "./stage0-actions.generated";
import { classDefinition, classTierFor, type ClassId } from "./classes";
import { SIDE1_ONLY_SHOOTING_CLASSES } from "./class-balance-overrides";
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

export const WATER_WARRIOR_SHOT_ACTION_ID = "water-warrior-shot" as const;

/**
 * REMAKE-093 gives the water warrior a shooting action it has no native record
 * for. Like the `1N` teleport above it gets a remake-only id and label; unlike
 * that one it has no native numbers of its own, so every rule-bearing value is
 * borrowed wholesale from an existing native shot rather than invented here:
 * the magic archer's range map, the archer's damage and experience tables.
 * Nothing is interpolated between them, so both halves stay traceable.
 */
const REMAKE_SHOOTING_ACTION_DEFINITIONS = {
  [WATER_WARRIOR_SHOT_ACTION_ID]: {
    id: WATER_WARRIOR_SHOT_ACTION_ID,
    nativeCode: null,
    label: "射擊",
    kind: "shooting",
    target: "enemy",
    range: { ...STAGE0_ACTION_DEFINITIONS["magic-archer-shot"].range },
    damage: { ...STAGE0_ACTION_DEFINITIONS["archer-shot"].damage },
    damagePresentation: { ...STAGE0_ACTION_DEFINITIONS["archer-shot"].damagePresentation },
    experience: { ...STAGE0_ACTION_DEFINITIONS["archer-shot"].experience },
    presentationId: STAGE0_ACTION_DEFINITIONS["archer-shot"].presentationId,
  },
} as const;

type BattleActionDefinitions = typeof STAGE0_ACTION_DEFINITIONS
  & ExtendedActionContent["STAGE1_ACTION_DEFINITIONS"]
  & typeof DIRECT_TECHNIQUE_ACTION_DEFINITIONS
  & typeof REMAKE_SHOOTING_ACTION_DEFINITIONS;
type BattleActionAudioAssets = typeof STAGE0_ACTION_AUDIO_ASSETS
  & ExtendedActionContent["STAGE1_ACTION_AUDIO_ASSETS"];

export const BATTLE_ACTION_DEFINITIONS = {
  ...STAGE0_ACTION_DEFINITIONS,
  ...DIRECT_TECHNIQUE_ACTION_DEFINITIONS,
  ...REMAKE_SHOOTING_ACTION_DEFINITIONS,
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

/**
 * The single place that decides which shot a class fires. Every shooting site
 * — the player menu, allied planning, expert enemy planning and resolution —
 * reads this instead of restating the class list, so adding a shooting career
 * is one entry rather than a dozen parallel conditionals.
 */
const SHOOTING_ACTION_BY_CLASS = {
  archer: "archer-shot",
  crossbow: "crossbow-shot",
  "magic-archer": "magic-archer-shot",
  "water-warrior": WATER_WARRIOR_SHOT_ACTION_ID,
} as const satisfies Readonly<Partial<Record<ClassId, BattleActionId>>>;

export type ShootingActionId = typeof SHOOTING_ACTION_BY_CLASS[
  keyof typeof SHOOTING_ACTION_BY_CLASS
];

const SHOOTING_ACTION_IDS: readonly BattleActionId[] = Object.values(SHOOTING_ACTION_BY_CLASS);

export function isShootingActionId(
  actionId: BattleActionId | undefined,
): actionId is ShootingActionId {
  return actionId !== undefined && SHOOTING_ACTION_IDS.includes(actionId);
}

/**
 * REMAKE-093 grants the water warrior's shot to side 1 only: side 2 keeps the
 * native purely-melee behaviour so the swamp stage it is fought on is
 * unchanged. Native shooting careers are symmetric and ignore the side.
 */
export function shootingActionIdFor(
  classId: ClassId,
  side: BattleUnit["side"],
): ShootingActionId | undefined {
  const actionId = SHOOTING_ACTION_BY_CLASS[classId as keyof typeof SHOOTING_ACTION_BY_CLASS];
  if (!actionId) return undefined;
  if (side === 2 && SIDE1_ONLY_SHOOTING_CLASSES.some((granted) => granted === classId)) {
    return undefined;
  }
  return actionId;
}

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

/**
 * Presentation loading cannot assume a unit stays on its current growth row:
 * it may gain a technique tier during the battle. Return every action this
 * class can expose on the requested side so its visual atlas is ready before
 * the scene starts, without pulling unrelated professions into the pack.
 */
export function presentationActionIdsForClass(
  classId: ClassId,
  side: BattleUnit["side"],
): readonly BattleActionId[] {
  const actionIds = new Set<BattleActionId>();
  const shooting = shootingActionIdFor(classId, side);
  if (shooting) actionIds.add(shooting);
  const definition = classDefinition(classId);
  if (definition.directTechnique) {
    const direct = DIRECT_TECHNIQUE_ACTION_BY_CLASS[
      classId as keyof typeof DIRECT_TECHNIQUE_ACTION_BY_CLASS
    ];
    if (direct) actionIds.add(direct as BattleActionId);
  }
  for (const tier of definition.technique?.tiers ?? []) {
    for (const action of tier.actions) {
      const actionId = TECHNIQUE_ACTION_BY_NATIVE_CODE[
        action.actionCode as keyof typeof TECHNIQUE_ACTION_BY_NATIVE_CODE
      ];
      if (!actionId) throw new Error(`unsupported native technique code ${action.actionCode}`);
      actionIds.add(actionId);
    }
  }
  // The 0P/1P dispatcher uses the WD presentation outside the ordinary tier
  // table. It remains a shared action-family atlas, not a bespoke class image.
  if (classId === "empress" || classId === "dragon") actionIds.add("wd");
  return [...actionIds];
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
