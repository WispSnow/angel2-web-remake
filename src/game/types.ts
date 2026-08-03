import type { ClassId } from "./content/class-catalog.generated";
import type { PortraitRecord } from "./content/portrait-catalog.generated";

export type { PortraitRecord } from "./content/portrait-catalog.generated";

export type Side = 1 | 2;
export type Difficulty = 0 | 1 | 2 | 3;
export type UnitClassId = ClassId;
export type StageId = "stage-00" | "stage-01";

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
  /** Native per-slot action-disable byte; ice clears after this side's next phase. */
  actionDisabled: boolean;
  statuses: UnitStatuses;
}

export type BattleOutcome = "ongoing" | "victory" | "defeat";
export type GamePhase =
  | "prebattleStory"
  | "deployment"
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
    record: 0 | 1 | 2 | 3 | 4 | 5 | 6 | "promotion" | "battle-command";
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

export interface SavedEnemyAiState {
  activeGroupIds: string[];
  pendingNoticeGroupIds: string[];
  fangPursuitRound: number | null;
}

export interface SavedBattleState {
  phase: "player";
  round: number;
  focusId: string;
  units: BattleUnit[];
  enemyAi?: SavedEnemyAiState;
  cursor: Position;
  cameraOrigin: Position;
}

interface SaveDataBase {
  format: "ANGEL2-web-save";
  version: 9;
  contentVersion: "stage-01-ice-lock-1";
  savedAt: string;
  saveCount: number;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  rngState: number;
  rngCalls: number;
  roster: SaveRosterEntry[];
  stageProgress: 0 | 999 | 1000;
  consumedEventIds: string[];
}

export interface BattleSaveData extends SaveDataBase {
  kind: "battle";
  stageId: "stage-00" | "stage-01";
  stageLabel: "瓦爾克麗宮" | "騎士城堡前";
  battle: SavedBattleState;
}

export interface CompletedSaveData extends SaveDataBase {
  kind: "completed";
  stageId: "stage-01" | "stage-02";
  stageLabel: "騎士城堡前" | "下一關";
}

export type SaveData = BattleSaveData | CompletedSaveData;

export interface CampaignState {
  stageId: StageId;
  ruleset: "stableRemake";
  difficulty: Difficulty;
  roster: SaveRosterEntry[];
  rngState: number;
  rngCalls: number;
}
