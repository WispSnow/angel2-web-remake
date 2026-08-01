import type { ClassId } from "./content/class-catalog.generated";

export type Side = 1 | 2;
export type Difficulty = 0 | 1 | 2 | 3;
export type UnitClassId = ClassId;
export type StageId = "stage-00" | "stage-01";
export type PortraitRecord = 15 | 45 | 46 | 47 | 48;

export interface Position {
  x: number;
  y: number;
}

export interface UnitStats {
  attack: number;
  defense: number;
  maxLife: number;
  movement: number;
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
  life: number;
  experience: number;
  acted: boolean;
  statuses: UnitStatuses;
}

export type BattleOutcome = "ongoing" | "victory" | "defeat";
export type GamePhase =
  | "prebattleStory"
  | "scriptedMove"
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
  | "nextStage";

export type ActionMode =
  | "idle"
  | "move"
  | "moving"
  | "actionMenu"
  | "techniqueMenu"
  | "target"
  | "specialTarget"
  | "enemyPreview";

export interface AttackResult {
  attackerId: string;
  defenderId: string;
  damage: number;
  counterDamage: number;
  counterOccurred: boolean;
  defenderDied: boolean;
  attackerDied: boolean;
  experienceGained: number;
}

export interface DialogueWindowState {
  portrait?: PortraitRecord;
  speaker?: string;
  text: string;
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
    record: 0 | 1 | 2 | 3 | "promotion" | "battle-command";
    wait: number;
    address?: string;
  };
}

export interface SaveRosterEntry {
  slot: number;
  classId: UnitClassId;
  experience: number;
  life: number;
}

export interface SavedBattleState {
  phase: "player";
  round: number;
  focusId: string;
  units: BattleUnit[];
  cursor: Position;
  cameraOrigin: Position;
}

interface SaveDataBase {
  format: "ANGEL2-web-save";
  version: 6;
  contentVersion: "native-actions-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  roster: SaveRosterEntry[];
}

export interface BattleSaveData extends SaveDataBase {
  kind: "battle";
  stageId: "stage-00";
  stageLabel: "瓦爾克麗宮";
  battle: SavedBattleState;
}

export interface CompletedSaveData extends SaveDataBase {
  kind: "completed";
  stageId: "stage-01";
  stageLabel: "下一關";
}

export type SaveData = BattleSaveData | CompletedSaveData;

export interface CampaignState {
  stageId: StageId;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  roster: SaveRosterEntry[];
  rngState: number;
}
