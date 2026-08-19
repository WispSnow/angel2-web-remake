import type { ClassId } from "./content/class-catalog.generated";
import type { PortraitRecord } from "./content/portrait-catalog.generated";

export type { PortraitRecord } from "./content/portrait-catalog.generated";

export type Side = 1 | 2;
export type Difficulty = 0 | 1 | 2 | 3;
export type UnitClassId = ClassId;
export type StageId =
  | "stage-00"
  | "stage-01"
  | "stage-02"
  | "stage-03"
  | "stage-04"
  | "stage-05"
  | "stage-42-portal"
  | "stage-06"
  | "stage-07"
  | "stage-08"
  | "stage-09"
  | "stage-11"
  | "stage-10"
  | "stage-12"
  | "stage-13"
  | "stage-14"
  | "stage-15"
  | "stage-16"
  | "stage-17"
  | "stage-18"
  | "stage-19"
  | "stage-20"
  | "stage-21"
  | "stage-22"
  | "stage-23"
  | "stage-24"
  | "stage-26"
  | "stage-27"
  | "stage-28"
  | "stage-29"
  | "stage-30"
  | "stage-31"
  | "stage-32"
  | "stage-33"
  | "stage-34"
  | "stage-35"
  | "stage-36"
  | "stage-37"
  | "stage-38";
export type CampaignRouteId =
  | "stage-01"
  | "stage-02"
  | "stage-03"
  | "stage-04"
  | "stage-05"
  | "stage-42-portal"
  | "stage-06"
  | "stage-07"
  | "stage-08"
  | "stage-09"
  | "stage-11"
  | "stage-10"
  | "stage-12"
  | "stage-13"
  | "stage-14"
  | "stage-15"
  | "stage-16"
  | "stage-17"
  | "stage-18"
  | "stage-19"
  | "stage-20"
  | "stage-21"
  | "stage-22"
  | "stage-23"
  | "stage-24"
  | "stage-26"
  | "stage-27"
  | "stage-28"
  | "stage-29"
  | "stage-30"
  | "stage-31"
  | "stage-32"
  | "stage-33"
  | "stage-34"
  | "stage-35"
  | "stage-36"
  | "stage-37"
  | "stage-49"
  | "stage-38"
  | "stage-39";

export interface Position {
  x: number;
  y: number;
}

export interface UnitStats {
  attack: number;
  defense: number;
  maxLife: number;
  movement: number;
  /** Current-profession level; promotion resets this marker to 1. */
  level: number;
}

export interface UnitStatuses {
  attackUp: number;
  defenseUp: number;
  magicGuard: number;
  confusion: number;
  attackDown: number;
  defenseDown: number;
  poison: number;
  techniqueSeal: number;
}

export interface BattleUnit extends Position {
  id: string;
  side: Side;
  slot: number;
  classId: UnitClassId;
  className: string;
  name: string;
  portrait: PortraitRecord;
  /** Named actor whose portrait still follows the current profession's generic record. */
  displayIdentity?: "named-class-portrait";
  life: number;
  experience: number;
  acted: boolean;
  /** v9 save field backing the stableRemake “冰封” state; it does not stack. */
  actionDisabled: boolean;
  statuses: UnitStatuses;
}

export type BattleOutcome = "ongoing" | "victory" | "defeat";
export type GamePhase =
  | "prebattleStory"
  | "deployment"
  | "scriptedMove"
  | "scriptedStory"
  | "openingStory"
  | "player"
  | "allyAuto"
  | "enemy"
  | "round2Story"
  | "defeat"
  | "victoryStory"
  | "victoryFeedback"
  | "savePrompt"
  | "saveSlots"
  | "quit"
  | "ending"
  | "credits"
  | "nextStage";

export type ActionMode =
  | "idle"
  | "move"
  | "moving"
  | "actionMenu"
  | "techniqueMenu"
  | "target"
  | "specialTarget"
  | "selfAreaConfirm"
  | "shotRoute"
  | "allyPreview"
  | "enemyPreview";

export interface AttackDeathTarget extends Position {
  id: string;
}

export interface AttackResult {
  attackerId: string;
  defenderId: string;
  damage: number;
  counterDamage: number;
  counterOccurred: boolean;
  defenderDied: boolean;
  attackerDied: boolean;
  experienceGained: number;
  counterExperienceGained: number;
  defenderDeathTargets?: AttackDeathTarget[];
  attackerDeathTargets?: AttackDeathTarget[];
  splitUnitId?: string;
  splitCount?: number;
}

export interface DialogueWindowState {
  portrait?: PortraitRecord;
  speaker?: string;
  /**
   * Native window text. Absent when the script keeps a portrait on screen with
   * its text window closed — `HD`/`HU` without `WD`/`WU`, as in SAY/0043 where
   * Nia names each scout and only their portrait answers.
   */
  text?: string;
  /** Native text cursor inset from the A/18 text-window origin. */
  textInset?: Readonly<{ x: number; y: number }>;
}

export interface DialoguePage {
  /** The native KY checkpoint that is currently accepting primary input. */
  activeSlot?: "upper" | "lower";
  /** Both native windows are independent and may remain open together. */
  upper?: DialogueWindowState;
  lower?: DialogueWindowState;
  /** Characters already present before an appended line starts typing. */
  revealStart?: number;
  source: {
    record: number
      | "promotion"
      | "battle-command"
      | "ai-technique"
      | "battle-context"
      | "confused-actor";
    wait: number;
    address?: string;
    /** Native PP background record active at this KY checkpoint. */
    backgroundId?: number;
  };
}

export interface SaveRosterEntry {
  slot: number;
  classId: UnitClassId;
  experience: number;
  life: number;
}

export interface SavedEnemyAiState {
  activeGroupIds: string[];
  pendingNoticeGroupIds: string[];
  fangPursuitRound: number | null;
}

export type DynamicTerrainKind = "iron-plate" | "obstacle";

export interface DynamicTerrainOverride extends Position {
  kind: DynamicTerrainKind;
}

export interface SavedBattleState {
  phase: "player";
  round: number;
  focusId: string;
  units: BattleUnit[];
  enemyAi?: SavedEnemyAiState;
  stage37Boss?: {
    headActionToggle: 0 | 1;
    handActionToggle: 0 | 1;
  };
  terrainOverrides: DynamicTerrainOverride[];
  cursor: Position;
  cameraOrigin: Position;
}

interface SaveDataBase {
  format: "ANGEL2-web-save";
  version: 89;
  contentVersion: "fourth-corps-rally-hold-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  rngCalls: number;
  roster: SaveRosterEntry[];
  /** Native KILL_ALL presentation counters, indexed by campaign slot. */
  recordCounters: number[];
  stageProgress: 0 | 999 | 1000;
  consumedEventIds: string[];
}

export interface BattleSaveData extends SaveDataBase {
  kind: "battle";
  stageId: StageId;
  stageLabel: string;
  stageEntrySnapshot: CampaignState;
  battle: SavedBattleState;
}

export interface CompletedSaveData extends SaveDataBase {
  kind: "completed";
  stageId: CampaignRouteId;
  stageLabel: string;
}

export type SaveData = BattleSaveData | CompletedSaveData;

export interface CampaignState {
  stageId: StageId;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  roster: SaveRosterEntry[];
  /** Optional only for internal fixtures created before the stage-49 contract. */
  recordCounters?: number[];
  rngState: number;
  rngCalls: number;
}
