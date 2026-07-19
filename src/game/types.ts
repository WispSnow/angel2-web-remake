export type Side = 1 | 2;
export type UnitClassId = 0 | 22;
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

export interface BattleUnit extends Position {
  id: string;
  side: Side;
  slot: number;
  classId: UnitClassId;
  className: "士兵" | "騎兵";
  name: string;
  portrait: PortraitRecord;
  life: number;
  experience: number;
  acted: boolean;
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
  | "nextStage";

export type ActionMode = "idle" | "move" | "moving" | "actionMenu" | "target" | "enemyPreview";

export interface AttackResult {
  attackerId: string;
  defenderId: string;
  damage: number;
  counterDamage: number;
  defenderDied: boolean;
  attackerDied: boolean;
  experienceGained: number;
}

export interface DialoguePage {
  slot: "upper" | "lower";
  portrait?: PortraitRecord;
  speaker?: string;
  text: string;
}

export interface SaveData {
  format: "ANGEL2-web-save";
  version: 1;
  savedAt: string;
  saveCount: number;
  stage: 1;
  stageLabel: "下一關";
  ruleset: "stableRemake";
  rngState: number;
  roster: Array<Pick<BattleUnit, "slot" | "classId" | "experience" | "life">>;
}
