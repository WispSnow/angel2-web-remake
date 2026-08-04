import type { ClassId } from "./content/class-catalog.generated";
import type { PortraitRecord } from "./content/portrait-catalog.generated";

export type { PortraitRecord } from "./content/portrait-catalog.generated";

export type Side = 1 | 2;
export type Difficulty = 0 | 1 | 2 | 3;
export type UnitClassId = ClassId;
export type StageId = "stage-00" | "stage-01" | "stage-02" | "stage-03";

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
  /** v9 save field backing the stableRemake “冰封” state; it does not stack. */
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
  | "allyPreview"
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
    record: number | "promotion" | "battle-command" | "ai-technique";
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
  version: 14;
  contentVersion: "stage-03-recovery-1";
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
  stageId: "stage-00" | "stage-01" | "stage-02" | "stage-03";
  stageLabel: "瓦爾克麗宮" | "騎士城堡前" | "救援友軍" | "通過力場";
  stageEntrySnapshot: CampaignState;
  battle: SavedBattleState;
}

export interface CompletedSaveData extends SaveDataBase {
  kind: "completed";
  stageId: "stage-01" | "stage-02" | "stage-03" | "stage-04";
  stageLabel: "騎士城堡前" | "救援友軍" | "通過力場" | "下一關";
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
