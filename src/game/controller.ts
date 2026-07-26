import { ASSETS, STAGE0, statsFor } from "./content/stage0";
import { STORY_BY_PHASE } from "./content/dialogue";
import { buildFullCombatScript, type FullCombatPhaseName, type FullCombatSceneState } from "./full-combat";
import { Stage0Battle, type AlliedAiAction } from "./simulation/battle";
import { manhattan, positionKey, reachableCells, shortestPath } from "./simulation/grid";
import { DeterministicRng } from "./simulation/rng";
import {
  isMusicVolume,
  loadMusicPreferences,
  loadPresentationPreferences,
  loadSoundPreferences,
  saveMusicPreferences,
  savePresentationPreferences,
  saveSoundPreferences,
  type MusicVolume,
} from "./preferences";
import { parseSaveData } from "./save";
import type { ActionMode, AttackResult, BattleUnit, DialoguePage, Difficulty, GamePhase, Position, SaveData } from "./types";

type Listener = () => void;
type StoryPhase = keyof typeof STORY_BY_PHASE;
type MovementKind = "scripted" | "player" | "allyAuto" | "enemy" | "rollback";
export type CombatPresentationPhase =
  | "primaryHit"
  | "primaryDamage"
  | "defenderDeath"
  | "counterHit"
  | "counterDamage"
  | "attackerDeath"
  | FullCombatPhaseName;

export interface CombatPresentation {
  attacker: BattleUnit;
  defender: BattleUnit;
  result: AttackResult;
  phase: CombatPresentationPhase;
  frame: number;
  displayedAttackerLife: number;
  displayedDefenderLife: number;
  fullScene?: FullCombatSceneState;
}

export interface CombatPresentationTraceEntry {
  phase: CombatPresentationPhase;
  frame: number;
  displayedAttackerLife: number;
  displayedDefenderLife: number;
  fullScene?: FullCombatSceneState;
}

export type UnitCommandId = "move" | "attack" | "rest" | "end" | "undo";
export type GroupCommandId = "allRest" | "followLeader" | "freeAction" | "retreat";
export type SystemCommandId = "settings" | "objectives" | "load" | "save" | "quit";
export type RecordMenuMode = "load" | "save";

export interface UnitCommand {
  id: UnitCommandId;
  label: string;
}

export interface GroupCommand {
  id: GroupCommandId;
  label: string;
}

const BASIC_COMMANDS: readonly UnitCommand[] = [
  { id: "move", label: "移動" },
  { id: "attack", label: "攻擊" },
  { id: "rest", label: "休息" },
];

const POST_MOVE_COMMANDS: readonly UnitCommand[] = [
  { id: "attack", label: "攻擊" },
  { id: "end", label: "結束" },
  { id: "undo", label: "返悔" },
];

const GROUP_COMMANDS: readonly GroupCommand[] = [
  { id: "allRest", label: "全部休息" },
  { id: "followLeader", label: "跟隨主將" },
  { id: "freeAction", label: "自由行動" },
  { id: "retreat", label: "全面徹退" },
];

const SYSTEM_COMMANDS: ReadonlyArray<{ id: SystemCommandId; label: string }> = [
  { id: "settings", label: "遊戲功能" },
  { id: "objectives", label: "勝利條件" },
  { id: "load", label: "讀取記錄" },
  { id: "save", label: "儲存記錄" },
  { id: "quit", label: "離開遊戲" },
];

export interface MovementPresentation {
  unitId: string;
  kind: MovementKind;
  path: Position[];
  stepIndex: number;
}

const isStoryPhase = (phase: GamePhase): phase is StoryPhase => phase in STORY_BY_PHASE;
const pause = (milliseconds: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));

export class GameController {
  battle = new Stage0Battle();
  difficulty: Difficulty;
  phase: GamePhase = "prebattleStory";
  actionMode: ActionMode = "idle";
  dialogueIndex = 0;
  selectedId?: string;
  commandIndex = 0;
  cursor: Position = { x: 29, y: 26 };
  cameraOrigin: Position = { x: 25, y: 23 };
  minimapPreviewOrigin?: Position;
  reachable: Position[] = [];
  targets: Position[] = [];
  objectiveOpen = false;
  systemMenuOpen = false;
  systemMenuIndex = 0;
  settingsOpen = false;
  soundSettingsOpen = false;
  soundSettingsReturn?: "battle" | "settings";
  musicSettingsOpen = false;
  musicSettingsReturn?: "battle" | "settings";
  recordMenuMode?: RecordMenuMode;
  recordMenuReturn?: "battle" | "system";
  recordMenuIndex = 0;
  quitConfirmOpen = false;
  quitConfirmIndex = 1;
  groupCommandOpen = false;
  groupCommandIndex = 0;
  retreatConfirmOpen = false;
  retreatConfirmIndex = 1;
  hintVisible = localStorage.getItem("angel2.stage0.hintSeen") !== "yes";
  presentationFast = false;
  battlePresentation: "map" | "full";
  gridEnabled: boolean;
  edgeScrollEnabled: boolean;
  portraitsEnabled: boolean;
  musicVolume: MusicVolume;
  speechEnabled: boolean;
  movementSoundEnabled: boolean;
  combatSoundEnabled: boolean;
  keySoundEnabled: boolean;
  lastCombat?: AttackResult;
  combatPresentation?: CombatPresentation;
  combatPresentationTrace: CombatPresentationTraceEntry[] = [];
  movementPresentation?: MovementPresentation;
  statusMessage = "";
  pendingSaveSlot?: number;
  savePromptIndex = 0;
  postSaveSlotIndex = 0;
  audioCue?: { sequence: number; record: number; reason: string };
  audioCueLog: Array<{ sequence: number; record: number; reason: string }> = [];
  private audioCueSequence = 0;
  private pendingOrigin?: Position;
  private pendingPath?: Position[];
  private busy = false;
  private listeners = new Set<Listener>();
  private readonly testMode = new URLSearchParams(location.search).has("test");
  // Keeps the measured full-screen timing under ?test=1 for visual review.
  private readonly fullCombatRealTime = new URLSearchParams(location.search).has("slowFull");

  constructor(difficulty: Difficulty = 0) {
    this.difficulty = difficulty;
    const preferences = loadPresentationPreferences(localStorage);
    this.battlePresentation = preferences.battlePresentation;
    this.gridEnabled = preferences.gridEnabled;
    this.edgeScrollEnabled = preferences.edgeScrollEnabled;
    this.portraitsEnabled = preferences.portraitsEnabled;
    this.musicVolume = loadMusicPreferences(localStorage).musicVolume;
    const soundPreferences = loadSoundPreferences(localStorage);
    this.speechEnabled = soundPreferences.speechEnabled;
    this.movementSoundEnabled = soundPreferences.movementSoundEnabled;
    this.combatSoundEnabled = soundPreferences.combatSoundEnabled;
    this.keySoundEnabled = soundPreferences.keySoundEnabled;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get currentDialogue(): DialoguePage | undefined {
    if (!isStoryPhase(this.phase)) return undefined;
    return STORY_BY_PHASE[this.phase][this.dialogueIndex];
  }

  get focusedUnit(): BattleUnit | undefined {
    if (this.phase === "player") return this.selectedUnit ?? this.battle.unitAt(this.cursor);
    return this.battle.focus;
  }

  get selectedUnit(): BattleUnit | undefined {
    return this.selectedId ? this.battle.unit(this.selectedId) : undefined;
  }

  get groupCommands(): readonly GroupCommand[] {
    return GROUP_COMMANDS;
  }

  get systemCommands(): typeof SYSTEM_COMMANDS {
    return SYSTEM_COMMANDS;
  }

  get hasBlockingOverlay(): boolean {
    return this.systemMenuOpen
      || this.settingsOpen
      || this.soundSettingsOpen
      || this.musicSettingsOpen
      || this.recordMenuMode !== undefined
      || this.quitConfirmOpen
      || this.objectiveOpen
      || this.groupCommandOpen
      || this.retreatConfirmOpen;
  }

  get groupLeader(): BattleUnit | undefined {
    const unit = this.battle.unitAt(this.cursor);
    return unit?.side === 1 && !unit.acted ? unit : undefined;
  }

  get followLeaderAvailable(): boolean {
    return this.groupLeader !== undefined;
  }

  get commandMenuKind(): "initial" | "postMove" {
    return this.pendingPath ? "postMove" : "initial";
  }

  get unitCommands(): readonly UnitCommand[] {
    if (this.commandMenuKind === "postMove") return POST_MOVE_COMMANDS;
    // The current vertical slice only exposes the basic soldier command set.
    // This is the extension point for ranged and technique profession menus.
    return BASIC_COMMANDS;
  }

  get commandMenuPosition(): Position {
    const unit = this.selectedUnit;
    if (!unit) return { x: 166, y: 120 };
    const unitLeft = 40 + (unit.x - this.cameraOrigin.x) * 40;
    const unitTop = 23 + (unit.y - this.cameraOrigin.y) * 44;
    const preferredLeft = unitLeft + 42;
    return {
      x: Math.max(42, Math.min(291, preferredLeft > 291 ? unitLeft - 149 : preferredLeft)),
      y: Math.max(25, Math.min(230, unitTop - 28)),
    };
  }

  get isTestMode(): boolean {
    return this.testMode;
  }

  get inputLocked(): boolean {
    return this.busy;
  }

  get movementStepDuration(): number {
    return this.testMode ? 18 : this.presentationFast ? 32 : 80;
  }

  emit(): void {
    for (const listener of this.listeners) listener();
  }

  advanceDialogue(): void {
    if (!isStoryPhase(this.phase)) return;
    const pages = STORY_BY_PHASE[this.phase];
    if (this.dialogueIndex < pages.length - 1) {
      this.dialogueIndex += 1;
      this.emit();
      return;
    }
    this.completeDialogue();
  }

  skipDialogue(): void {
    if (isStoryPhase(this.phase)) this.completeDialogue();
  }

  private completeDialogue(): void {
    const completed = this.phase;
    this.dialogueIndex = 0;
    if (completed === "prebattleStory") {
      void this.runOpeningMove();
    } else if (completed === "openingStory" || completed === "round2Story") {
      this.phase = "player";
      this.statusMessage = completed === "openingStory" ? "我方回合：選擇一名尚未行動的單位。" : "第 2 回合開始。";
      this.emit();
    } else if (completed === "victoryStory") {
      this.phase = "victoryFeedback";
      this.emit();
    }
  }

  private async runOpeningMove(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.phase = "scriptedMove";
    this.statusMessage = "妮雅趕往大殿……";
    const nia = this.battle.unit("1:0");
    if (!nia) return;
    const others = this.battle.units.filter((unit) => unit.id !== nia.id);
    const path = shortestPath(nia, STAGE0.opening.to, nia.classId, STAGE0.opening.budget, others);
    this.battle.focusId = nia.id;
    this.cursor = { x: nia.x, y: nia.y };
    this.centerCamera(nia);
    this.emit();
    await this.animateUnitPath(nia.id, path, "scripted");
    nia.x = STAGE0.opening.to.x;
    nia.y = STAGE0.opening.to.y;
    this.cameraOrigin = { ...STAGE0.viewport.initialOrigin };
    this.cursor = { ...STAGE0.opening.to };
    this.phase = "openingStory";
    this.dialogueIndex = 0;
    this.busy = false;
    this.emit();
  }

  selectCell(position: Position): void {
    if (
      this.phase !== "player"
      || this.hasBlockingOverlay
      || this.busy
    ) return;
    this.cursor = { ...position };
    const unit = this.battle.unitAt(position);

    if (this.actionMode === "target") {
      if (unit && unit.side === 2 && this.targets.some((target) => positionKey(target) === positionKey(position))) {
        void this.commitAttack(unit.id);
      }
      return;
    }

    if (this.actionMode === "move") {
      const selected = this.selectedUnit;
      if (!selected || !this.reachable.some((cell) => positionKey(cell) === positionKey(position))) return;
      const occupied = unit && unit.id !== selected.id;
      if (occupied) return;
      void this.moveSelectedUnit(position);
      return;
    }

    if (this.actionMode === "actionMenu") return;
    if (this.actionMode === "enemyPreview") this.resetAction();
    if (!unit) {
      this.emit();
      return;
    }
    this.battle.focusId = unit.id;
    if (unit.side === 2) {
      this.selectedId = unit.id;
      this.reachable = this.battle.enemyMovementRange(unit.id);
      this.actionMode = "enemyPreview";
      this.statusMessage = "紅色格為敵軍本次行動的可移動範圍；預覽不會改變戰鬥狀態。";
    } else if (!unit.acted) {
      this.selectedId = unit.id;
      this.pendingOrigin = { x: unit.x, y: unit.y };
      this.pendingPath = undefined;
      this.reachable = [];
      this.commandIndex = 0;
      this.actionMode = "actionMenu";
      this.statusMessage = `選擇${unit.className}的行動。`;
    } else {
      this.statusMessage = "此單位本回合已行動。";
    }
    this.emit();
  }

  focusCell(position: Position): void {
    if (
      this.phase !== "player"
      || !["idle", "move", "target"].includes(this.actionMode)
      || this.hasBlockingOverlay
      || this.busy
    ) return;
    if (positionKey(position) === positionKey(this.cursor)) return;
    this.cursor = { ...position };
    this.emit();
  }

  chooseMove(): void {
    const unit = this.selectedUnit;
    if (
      this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || this.commandMenuKind !== "initial"
      || !unit
    ) return;
    this.reachable = reachableCells(unit, this.battle.units);
    this.actionMode = "move";
    this.statusMessage = "藍色格為可移動範圍；可選原格保留位置。";
    this.emit();
  }

  chooseAttack(): void {
    const unit = this.selectedUnit;
    if (this.phase !== "player" || this.actionMode !== "actionMenu" || !unit) return;
    this.targets = this.battle.units
      .filter((candidate) => candidate.side !== unit.side && manhattan(unit, candidate) === 1)
      .map(({ x, y }) => ({ x, y }));
    if (this.targets.length === 0) {
      this.statusMessage = this.commandMenuKind === "postMove"
        ? "攻擊範圍內沒有敵人。請結束行動或返悔。"
        : "攻擊範圍內沒有敵人。請選擇移動或休息。";
      this.emit();
      return;
    }
    if (this.targets.length === 1) {
      const target = this.battle.unitAt(this.targets[0]);
      if (target) {
        this.cursor = { x: target.x, y: target.y };
        this.statusMessage = "唯一合法目標已自動鎖定。";
        this.emit();
        void this.commitAttack(target.id);
      }
      return;
    }
    this.actionMode = "target";
    this.statusMessage = "選擇紅色標記的敵人。";
    this.emit();
  }

  chooseRest(): void {
    const unit = this.selectedUnit;
    if (
      !unit
      || this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || this.commandMenuKind !== "initial"
    ) return;
    const recovered = this.battle.rest(unit.id);
    this.finishUnitAction(recovered > 0 ? `休息恢復 ${recovered} 點生命。` : "休息完成；生命已滿。", true);
  }

  chooseEnd(): void {
    const unit = this.selectedUnit;
    if (
      !unit
      || this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || this.commandMenuKind !== "postMove"
    ) return;
    this.battle.wait(unit.id);
    this.finishUnitAction("單位行動結束。", true);
  }

  chooseUndo(): void {
    if (this.actionMode === "actionMenu" && this.commandMenuKind === "postMove") {
      void this.rollbackSelectedMovement();
    }
  }

  moveCommandSelection(delta: number): void {
    if (this.actionMode !== "actionMenu" || this.unitCommands.length === 0) return;
    this.commandIndex = (this.commandIndex + delta + this.unitCommands.length) % this.unitCommands.length;
    this.emit();
  }

  selectCommand(index: number): void {
    if (this.actionMode !== "actionMenu" || index < 0 || index >= this.unitCommands.length) return;
    if (this.commandIndex === index) return;
    this.commandIndex = index;
    this.emit();
  }

  activateCommandSelection(): void {
    if (this.actionMode !== "actionMenu") return;
    const command = this.unitCommands[this.commandIndex];
    if (!command) return;
    if (command.id === "move") this.chooseMove();
    else if (command.id === "attack") this.chooseAttack();
    else if (command.id === "rest") this.chooseRest();
    else if (command.id === "end") this.chooseEnd();
    else if (command.id === "undo") this.chooseUndo();
  }

  cancelAction(): void {
    if (this.actionMode === "target") {
      this.actionMode = "actionMenu";
      this.targets = [];
    } else if (this.actionMode === "actionMenu") {
      if (this.commandMenuKind === "postMove") {
        void this.rollbackSelectedMovement();
        return;
      }
      this.resetAction();
    } else if (this.actionMode === "move") {
      this.reachable = [];
      this.commandIndex = 0;
      this.actionMode = "actionMenu";
    } else if (this.actionMode === "enemyPreview") {
      this.resetAction();
    }
    this.statusMessage = "已返回上一層。";
    this.emit();
  }

  private async commitAttack(defenderId: string): Promise<void> {
    const attacker = this.selectedUnit;
    const defender = this.battle.unit(defenderId);
    if (!attacker || !defender || this.busy) return;
    try {
      this.busy = true;
      const attackerPresentation = { ...attacker };
      const defenderPresentation = { ...defender };
      this.lastCombat = this.battle.attack(attacker.id, defenderId);
      const result = this.lastCombat;
      this.statusMessage = `造成 ${result.damage} 點傷害${result.counterDamage ? `，受到 ${result.counterDamage} 點反擊` : ""}。`;
      this.resetAction();
      this.markHintSeen();
      await this.presentOrdinaryCombat(attackerPresentation, defenderPresentation, result);
      this.busy = false;
      const ended = this.resolveOutcome();
      this.emit();
      if (!ended && this.battle.units.filter((unit) => unit.side === 1).every((unit) => unit.acted)) {
        void this.runTurnPhases("autonomous");
      }
    } catch (error) {
      this.busy = false;
      this.combatPresentation = undefined;
      this.statusMessage = error instanceof Error ? error.message : "攻擊無效。";
      this.emit();
    }
  }

  private finishUnitAction(message: string, allowAutomaticEnd: boolean): void {
    this.resetAction();
    this.statusMessage = message;
    const outcome = this.resolveOutcome();
    if (outcome || !allowAutomaticEnd) {
      this.emit();
      return;
    }
    this.emit();
    if (this.battle.units.filter((unit) => unit.side === 1).every((unit) => unit.acted)) {
      void this.runTurnPhases("autonomous");
    }
  }

  private resetAction(): void {
    this.actionMode = "idle";
    this.selectedId = undefined;
    this.commandIndex = 0;
    this.pendingOrigin = undefined;
    this.pendingPath = undefined;
    this.reachable = [];
    this.targets = [];
    this.minimapPreviewOrigin = undefined;
  }

  openGroupCommands(): void {
    if (
      this.phase !== "player"
      || this.busy
      || this.objectiveOpen
      || this.recordMenuMode !== undefined
      || this.quitConfirmOpen
      || this.retreatConfirmOpen
      || this.soundSettingsOpen
      || this.musicSettingsOpen
      || this.actionMode !== "idle"
    ) return;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.soundSettingsOpen = false;
    this.soundSettingsReturn = undefined;
    this.musicSettingsOpen = false;
    this.musicSettingsReturn = undefined;
    this.minimapPreviewOrigin = undefined;
    this.groupCommandIndex = 0;
    this.groupCommandOpen = true;
    this.statusMessage = "選擇集體命令。";
    this.emit();
  }

  closeGroupCommands(): void {
    if (!this.groupCommandOpen) return;
    this.groupCommandOpen = false;
    this.groupCommandIndex = 0;
    this.statusMessage = "已返回戰場。";
    this.emit();
  }

  moveGroupCommandSelection(delta: number): void {
    if (!this.groupCommandOpen || GROUP_COMMANDS.length === 0) return;
    this.groupCommandIndex = (this.groupCommandIndex + delta + GROUP_COMMANDS.length) % GROUP_COMMANDS.length;
    this.emit();
  }

  selectGroupCommand(index: number): void {
    if (!this.groupCommandOpen || index < 0 || index >= GROUP_COMMANDS.length || this.groupCommandIndex === index) return;
    this.groupCommandIndex = index;
    this.emit();
  }

  activateGroupCommandSelection(): void {
    const command = this.groupCommandOpen ? GROUP_COMMANDS[this.groupCommandIndex] : undefined;
    if (!command) return;
    if (command.id === "allRest") void this.allRest();
    else if (command.id === "followLeader") void this.followLeader();
    else if (command.id === "freeAction") void this.freeAction();
    else this.requestRetreat();
  }

  async allRest(): Promise<void> {
    if (this.phase !== "player" || this.busy) return;
    this.systemMenuOpen = false;
    this.groupCommandOpen = false;
    this.resetAction();
    const result = this.battle.restAllUnspentAllies();
    this.statusMessage = `全部休息：${result.count} 名單位提交行動，共恢復 ${result.recovered} 點生命。`;
    this.emit();
    await this.runTurnPhases("autonomous");
  }

  async followLeader(): Promise<void> {
    if (this.phase !== "player" || this.busy || !this.groupLeader) {
      this.statusMessage = "請先把焦點移到一名尚未行動的我方單位，再選擇跟隨主將。";
      this.emit();
      return;
    }
    const leader = this.groupLeader;
    this.battle.wait(leader.id);
    this.systemMenuOpen = false;
    this.groupCommandOpen = false;
    this.resetAction();
    this.statusMessage = `${leader.name}成為臨時主將；其餘單位交由我方 AI 行動。`;
    this.emit();
    await this.runTurnPhases("follow", leader.id);
  }

  async freeAction(): Promise<void> {
    if (this.phase !== "player" || this.busy) return;
    this.systemMenuOpen = false;
    this.groupCommandOpen = false;
    this.resetAction();
    this.statusMessage = "其餘我方單位進入自由行動。";
    this.emit();
    await this.runTurnPhases("free");
  }

  requestRetreat(): void {
    if (this.phase !== "player" || this.busy) return;
    this.systemMenuOpen = false;
    this.groupCommandOpen = false;
    this.retreatConfirmOpen = true;
    this.retreatConfirmIndex = 1;
    this.statusMessage = "確認是否全面撤退。";
    this.emit();
  }

  moveRetreatSelection(delta: number): void {
    if (!this.retreatConfirmOpen || delta === 0) return;
    this.retreatConfirmIndex = this.retreatConfirmIndex === 0 ? 1 : 0;
    this.emit();
  }

  selectRetreatChoice(index: number): void {
    if (!this.retreatConfirmOpen || index < 0 || index > 1 || this.retreatConfirmIndex === index) return;
    this.retreatConfirmIndex = index;
    this.emit();
  }

  activateRetreatSelection(): void {
    if (!this.retreatConfirmOpen) return;
    if (this.retreatConfirmIndex === 0) this.confirmRetreat();
    else this.cancelRetreat();
  }

  confirmRetreat(): void {
    if (!this.retreatConfirmOpen || this.busy) return;
    this.retreatConfirmOpen = false;
    this.restartBattle("全面撤退：重新建立第 0 關固定編隊。");
  }

  cancelRetreat(): void {
    if (!this.retreatConfirmOpen) return;
    this.retreatConfirmOpen = false;
    this.retreatConfirmIndex = 1;
    this.statusMessage = "取消撤退；返回戰場。";
    this.emit();
  }

  private async runTurnPhases(mode: "autonomous" | "follow" | "free", leaderId?: string): Promise<void> {
    if (this.phase !== "player" || this.busy) return;
    this.busy = true;
    this.systemMenuOpen = false;
    this.groupCommandOpen = false;
    this.retreatConfirmOpen = false;
    this.resetAction();
    this.phase = "allyAuto";
    this.statusMessage = mode === "autonomous"
      ? "我方自動／特殊單位階段。"
      : mode === "follow"
        ? "我方自動階段：其餘單位跟隨主將。"
        : "我方自動階段：其餘單位自由行動。";
    this.emit();

    if (mode !== "autonomous") {
      const allyIds = this.battle.units.filter((unit) => unit.side === 1 && !unit.acted).map((unit) => unit.id);
      for (const id of allyIds) {
        const action = this.battle.planAlliedAiAction(id, mode === "follow" ? leaderId : undefined);
        if (!action) continue;
        if (await this.runAlliedAiAction(action)) {
          this.busy = false;
          this.emit();
          return;
        }
      }
    }

    this.battle.clearActionState(1);
    this.phase = "enemy";
    this.statusMessage = "敵方階段：騎士團部隊向出口撤離。";
    this.emit();
    const enemyIds = this.battle.enemyActionOrder();
    for (const id of enemyIds) {
      if (!this.battle.unit(id)) continue;
      const movement = this.battle.planRouteEnemy(id);
      const focus = this.battle.unit(id);
      const enemyName = focus?.name ?? "敵軍";
      if (focus) {
        this.battle.focusId = id;
        this.cursor = { x: focus.x, y: focus.y };
        this.centerCamera(focus);
      }
      this.emit();
      if (movement) await this.animateUnitPath(id, movement.path, "enemy");
      const actedEnemy = this.battle.unit(id);
      if (actedEnemy) actedEnemy.acted = true;
      if (movement?.reachedExit && this.battle.evacuateEnemy(id)) {
        this.statusMessage = `${enemyName}已撤離戰場。`;
        this.emit();
      }
      if (this.resolveOutcome()) {
        this.busy = false;
        this.emit();
        return;
      }
    }
    this.battle.startNextRound();
    const nia = this.battle.unit("1:0");
    if (nia) {
      this.cursor = { x: nia.x, y: nia.y };
      this.centerCamera(nia);
    }
    this.phase = this.battle.round === 2 ? "round2Story" : "player";
    this.dialogueIndex = 0;
    this.statusMessage = this.phase === "round2Story" ? "第 2 回合事件" : `第 ${this.battle.round} 回合開始。`;
    this.busy = false;
    this.emit();
  }

  private async runAlliedAiAction(action: AlliedAiAction): Promise<boolean> {
    let unit = this.battle.unit(action.unitId);
    if (!unit) return this.resolveOutcome();
    this.battle.focusId = unit.id;
    this.cursor = { x: unit.x, y: unit.y };
    this.centerCamera(unit);
    this.statusMessage = `${unit.name}正在自動行動。`;
    this.emit();

    if ((action.kind === "move" || action.kind === "attack") && action.path.length > 1) {
      await this.animateUnitPath(unit.id, action.path, "allyAuto");
      unit = this.battle.unit(action.unitId);
      if (!unit) return this.resolveOutcome();
    }

    if (action.kind === "attack" && action.targetId) {
      const defender = this.battle.unit(action.targetId);
      if (defender && manhattan(unit, defender) === 1) {
        const attackerPresentation = { ...unit };
        const defenderPresentation = { ...defender };
        this.lastCombat = this.battle.attack(unit.id, defender.id);
        const result = this.lastCombat;
        this.statusMessage = `${unit.name}造成 ${result.damage} 點傷害${result.counterDamage ? `，受到 ${result.counterDamage} 點反擊` : ""}。`;
        await this.presentOrdinaryCombat(attackerPresentation, defenderPresentation, result);
      } else {
        this.battle.spendAction(unit.id);
      }
    } else if (action.kind === "rest") {
      const recovered = this.battle.rest(unit.id);
      this.statusMessage = `${unit.name}休息，恢復 ${recovered} 點生命。`;
    } else {
      this.battle.spendAction(unit.id);
      this.statusMessage = action.kind === "move" ? `${unit.name}移動完畢。` : `${unit.name}原地待命。`;
    }

    const ended = this.resolveOutcome();
    this.emit();
    return ended;
  }

  private async presentOrdinaryCombat(
    attacker: BattleUnit,
    defender: BattleUnit,
    result: AttackResult,
  ): Promise<void> {
    this.combatPresentationTrace = [];
    if (this.battlePresentation === "full") {
      await this.presentFullScreenCombat(attacker, defender, result);
      this.combatPresentation = undefined;
      return;
    }

    let displayedAttackerLife = attacker.life;
    let displayedDefenderLife = defender.life;
    const finalDefenderLife = Math.max(0, defender.life - result.damage);
    const finalAttackerLife = Math.max(0, attacker.life - result.counterDamage);

    // Native UN/62 timeline: frames 0..7, followed by frame 0 once more.
    const hitFrames = [0, 1, 2, 3, 4, 5, 6, 7, 0] as const;
    for (let frame = 0; frame < hitFrames.length; frame += 1) {
      if (frame === 0 || frame === 4) this.queueAudioCue(38, `map-primary-hit-${frame === 0 ? "first" : "second"}`);
      this.setCombatPresentation(
        attacker,
        defender,
        result,
        "primaryHit",
        frame,
        displayedAttackerLife,
        displayedDefenderLife,
      );
      await pause(this.mapCombatDelay(10));
    }
    for (let applied = 1; displayedDefenderLife > finalDefenderLife; applied += 1) {
      displayedDefenderLife -= 1;
      this.setCombatPresentation(
        attacker,
        defender,
        result,
        "primaryDamage",
        applied,
        displayedAttackerLife,
        displayedDefenderLife,
      );
      await pause(this.mapCombatDelay(1));
    }

    if (result.defenderDied) {
      for (let frame = 0; frame < 15; frame += 1) {
        this.setCombatPresentation(
          attacker,
          defender,
          result,
          "defenderDeath",
          frame,
          displayedAttackerLife,
          displayedDefenderLife,
        );
        await pause(this.mapCombatDelay(10));
      }
    } else if (result.counterOccurred) {
      for (let frame = 0; frame < hitFrames.length; frame += 1) {
        if (frame === 0 || frame === 4) this.queueAudioCue(38, `map-counter-hit-${frame === 0 ? "first" : "second"}`);
        this.setCombatPresentation(
          attacker,
          defender,
          result,
          "counterHit",
          frame,
          displayedAttackerLife,
          displayedDefenderLife,
        );
        await pause(this.mapCombatDelay(10));
      }
      for (let applied = 1; displayedAttackerLife > finalAttackerLife; applied += 1) {
        displayedAttackerLife -= 1;
        this.setCombatPresentation(
          attacker,
          defender,
          result,
          "counterDamage",
          applied,
          displayedAttackerLife,
          displayedDefenderLife,
        );
        await pause(this.mapCombatDelay(1));
      }
      if (result.attackerDied) {
        for (let frame = 0; frame < 15; frame += 1) {
          this.setCombatPresentation(
            attacker,
            defender,
            result,
            "attackerDeath",
            frame,
            displayedAttackerLife,
            displayedDefenderLife,
          );
          await pause(this.mapCombatDelay(10));
        }
      }
    }

    this.combatPresentation = undefined;
  }

  private async presentFullScreenCombat(
    attacker: BattleUnit,
    defender: BattleUnit,
    result: AttackResult,
  ): Promise<void> {
    // The native full-screen battle freezes the status-bar values at their
    // pre-strike numbers; life only changes back on the map. The whole
    // presentation is a single measured timeline sampled against a clock, so
    // the camera pan, the dash-ins and the projectile all move smoothly
    // instead of stepping per renderer substep.
    const script = buildFullCombatScript(attacker, defender, result);
    const fastTest = this.testMode && !this.fullCombatRealTime;
    const timeScale = fastTest ? 24 : this.presentationFast ? 3.2 : 1;
    const frameInterval = fastTest ? 2 : 15;
    const start = Date.now();
    let cueIndex = 0;
    let markIndex = 0;
    let phase: CombatPresentationPhase = "fullOpen";
    let elapsed = 0;
    while (elapsed <= script.duration) {
      elapsed = (Date.now() - start) * timeScale;
      const t = Math.min(elapsed, script.duration);
      while (cueIndex < script.cues.length && script.cues[cueIndex].t <= t) {
        const cue = script.cues[cueIndex];
        this.queueAudioCue(cue.record, cue.reason);
        cueIndex += 1;
      }
      const scene = script.sample(t);
      while (markIndex < script.marks.length && script.marks[markIndex].t <= t) {
        const mark = script.marks[markIndex];
        markIndex += 1;
        phase = mark.phase;
        this.combatPresentationTrace.push({
          phase: mark.phase,
          frame: mark.frame,
          displayedAttackerLife: attacker.life,
          displayedDefenderLife: defender.life,
          fullScene: script.sample(mark.t),
        });
      }
      this.combatPresentation = {
        attacker,
        defender,
        result,
        phase,
        frame: 0,
        displayedAttackerLife: attacker.life,
        displayedDefenderLife: defender.life,
        fullScene: scene,
      };
      this.emit();
      if (elapsed >= script.duration) break;
      await pause(frameInterval);
    }
    // The native window close is an instant flip back to the map screen.
  }

  private setCombatPresentation(
    attacker: BattleUnit,
    defender: BattleUnit,
    result: AttackResult,
    phase: CombatPresentationPhase,
    frame: number,
    displayedAttackerLife: number,
    displayedDefenderLife: number,
  ): void {
    this.combatPresentation = {
      attacker,
      defender,
      result,
      phase,
      frame,
      displayedAttackerLife,
      displayedDefenderLife,
    };
    this.combatPresentationTrace.push({
      phase,
      frame,
      displayedAttackerLife,
      displayedDefenderLife,
    });
    this.emit();
  }

  private queueAudioCue(record: number, reason: string): void {
    const cue = { sequence: ++this.audioCueSequence, record, reason };
    this.audioCue = cue;
    this.audioCueLog.push(cue);
  }

  private mapCombatDelay(nativeTicks: number): number {
    if (this.testMode) return Math.max(4, nativeTicks * 4);
    if (this.presentationFast) return Math.max(3, Math.round(nativeTicks * 2.5));
    return nativeTicks * 10;
  }

  openObjectives(): void {
    if (
      this.busy
      || this.soundSettingsOpen
      || this.musicSettingsOpen
      || !["player", "enemy"].includes(this.phase)
    ) return;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.soundSettingsOpen = false;
    this.soundSettingsReturn = undefined;
    this.musicSettingsOpen = false;
    this.musicSettingsReturn = undefined;
    this.groupCommandOpen = false;
    this.minimapPreviewOrigin = undefined;
    this.objectiveOpen = true;
    this.markHintSeen();
    this.emit();
  }

  closeObjectives(): void {
    this.objectiveOpen = false;
    this.emit();
  }

  openSystemMenu(): void {
    if (
      this.phase !== "player"
      || this.busy
      || this.hasBlockingOverlay
      || this.actionMode !== "idle"
    ) return;
    this.minimapPreviewOrigin = undefined;
    this.systemMenuOpen = true;
    this.systemMenuIndex = 0;
    this.emit();
  }

  closeSystemMenu(): void {
    if (
      !this.systemMenuOpen
      && !this.settingsOpen
      && !this.soundSettingsOpen
      && !this.musicSettingsOpen
    ) return;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.soundSettingsOpen = false;
    this.soundSettingsReturn = undefined;
    this.musicSettingsOpen = false;
    this.musicSettingsReturn = undefined;
    this.emit();
  }

  moveSystemMenuSelection(delta: number): void {
    if (!this.systemMenuOpen || delta === 0) return;
    this.systemMenuIndex = (this.systemMenuIndex + delta + SYSTEM_COMMANDS.length) % SYSTEM_COMMANDS.length;
    this.emit();
  }

  selectSystemMenuCommand(index: number): void {
    if (!this.systemMenuOpen || index < 0 || index >= SYSTEM_COMMANDS.length || index === this.systemMenuIndex) return;
    this.systemMenuIndex = index;
    this.emit();
  }

  activateSystemMenuSelection(): void {
    const command = this.systemMenuOpen ? SYSTEM_COMMANDS[this.systemMenuIndex] : undefined;
    if (!command) return;
    if (command.id === "settings") this.openSettings();
    else if (command.id === "objectives") this.openObjectives();
    else if (command.id === "load") this.openRecordMenu("load");
    else if (command.id === "save") this.openRecordMenu("save");
    else this.requestQuit();
  }

  openSettings(): void {
    if (!this.systemMenuOpen) return;
    this.systemMenuOpen = false;
    this.settingsOpen = true;
    this.emit();
  }

  closeSettings(): void {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.systemMenuOpen = true;
    this.emit();
  }

  openSoundSettings(): void {
    const fromSettings = this.settingsOpen;
    const fromBattle = this.phase === "player"
      && !this.busy
      && !this.hasBlockingOverlay
      && this.actionMode === "idle";
    if (!fromSettings && !fromBattle) return;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.soundSettingsOpen = true;
    this.soundSettingsReturn = fromSettings ? "settings" : "battle";
    this.minimapPreviewOrigin = undefined;
    this.emit();
  }

  closeSoundSettings(): void {
    if (!this.soundSettingsOpen) return;
    const returnToSettings = this.soundSettingsReturn === "settings";
    this.soundSettingsOpen = false;
    this.soundSettingsReturn = undefined;
    this.settingsOpen = returnToSettings;
    this.emit();
  }

  openMusicSettings(): void {
    const fromSettings = this.settingsOpen;
    const fromBattle = this.phase === "player"
      && !this.busy
      && !this.hasBlockingOverlay
      && this.actionMode === "idle";
    if (!fromSettings && !fromBattle) return;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.musicSettingsOpen = true;
    this.musicSettingsReturn = fromSettings ? "settings" : "battle";
    this.minimapPreviewOrigin = undefined;
    this.emit();
  }

  closeMusicSettings(): void {
    if (!this.musicSettingsOpen) return;
    const returnToSettings = this.musicSettingsReturn === "settings";
    this.musicSettingsOpen = false;
    this.musicSettingsReturn = undefined;
    this.settingsOpen = returnToSettings;
    this.emit();
  }

  systemAction(): void {
    if (this.recordMenuMode) this.closeRecordMenu();
    else if (this.quitConfirmOpen) this.cancelQuit();
    else if (this.soundSettingsOpen) this.closeSoundSettings();
    else if (this.musicSettingsOpen) this.closeMusicSettings();
    else if (this.settingsOpen) this.closeSettings();
    else if (this.systemMenuOpen) this.closeSystemMenu();
    else if (this.phase === "player" && !this.busy && !this.objectiveOpen && !this.groupCommandOpen && !this.retreatConfirmOpen) {
      this.openSystemMenu();
    }
  }

  secondaryAction(): boolean {
    if (this.phase === "saveSlots") this.cancelPostSaveSlots();
    else if (this.recordMenuMode) this.closeRecordMenu();
    else if (this.quitConfirmOpen) this.cancelQuit();
    else if (this.soundSettingsOpen) this.closeSoundSettings();
    else if (this.musicSettingsOpen) this.closeMusicSettings();
    else if (this.settingsOpen) this.closeSettings();
    else if (this.retreatConfirmOpen) this.cancelRetreat();
    else if (this.groupCommandOpen) this.closeGroupCommands();
    else if (this.objectiveOpen) this.closeObjectives();
    else if (this.systemMenuOpen) this.closeSystemMenu();
    else if (this.phase === "player" && this.actionMode !== "idle") {
      if (!this.busy) this.cancelAction();
    } else return false;
    return true;
  }

  async rightClickAction(): Promise<void> {
    if (this.secondaryAction()) return;
    await this.focusNextUnactedAlly();
  }

  async focusNextUnactedAlly(): Promise<void> {
    if (
      this.phase !== "player"
      || this.busy
      || this.hasBlockingOverlay
      || this.actionMode !== "idle"
    ) return;
    const cursorUnit = this.battle.unitAt(this.cursor);
    const anchorId = this.selectedUnit?.id ?? (cursorUnit?.side === 1 ? cursorUnit.id : this.battle.focusId);
    const allies = this.battle.units.filter((unit) => unit.side === 1);
    const anchorIndex = allies.findIndex((unit) => unit.id === anchorId);
    let next = allies.find((unit) => !unit.acted);
    for (let offset = 1; offset <= allies.length; offset += 1) {
      const candidate = allies[(anchorIndex + offset + allies.length) % allies.length];
      if (candidate && !candidate.acted) {
        next = candidate;
        break;
      }
    }
    if (!next) {
      this.statusMessage = "目前沒有尚未行動的我方單位。";
      this.emit();
      return;
    }
    this.battle.focusId = next.id;
    this.cursor = { x: next.x, y: next.y };
    this.centerCamera(next);
    this.statusMessage = `已對焦下一名可行動友軍：${next.name}。`;
    this.emit();
  }

  markHintSeen(): void {
    this.hintVisible = false;
    localStorage.setItem("angel2.stage0.hintSeen", "yes");
  }

  toggleSpeed(): void {
    this.presentationFast = !this.presentationFast;
    this.emit();
  }

  toggleBattlePresentation(): void {
    this.battlePresentation = this.battlePresentation === "map" ? "full" : "map";
    this.persistPresentationPreferences();
    this.emit();
  }

  toggleGrid(): void {
    this.gridEnabled = !this.gridEnabled;
    this.persistPresentationPreferences();
    this.emit();
  }

  toggleEdgeScroll(): void {
    this.edgeScrollEnabled = !this.edgeScrollEnabled;
    this.persistPresentationPreferences();
    this.emit();
  }

  togglePortraits(): void {
    this.portraitsEnabled = !this.portraitsEnabled;
    this.persistPresentationPreferences();
    this.emit();
  }

  setMusicVolume(volume: number): void {
    if (!isMusicVolume(volume) || volume === this.musicVolume) return;
    this.musicVolume = volume;
    this.persistMusicPreferences();
    this.emit();
  }

  toggleSpeechSound(): void {
    this.speechEnabled = !this.speechEnabled;
    this.persistSoundPreferences();
    this.emit();
  }

  toggleMovementSound(): void {
    this.movementSoundEnabled = !this.movementSoundEnabled;
    this.persistSoundPreferences();
    this.emit();
  }

  toggleCombatSound(): void {
    this.combatSoundEnabled = !this.combatSoundEnabled;
    this.persistSoundPreferences();
    this.emit();
  }

  toggleKeySound(): void {
    this.keySoundEnabled = !this.keySoundEnabled;
    this.persistSoundPreferences();
    this.emit();
  }

  retry(): void {
    this.restartBattle("重新建立第 0 關固定編隊。");
  }

  private restartBattle(message: string): void {
    this.battle = new Stage0Battle();
    this.movementPresentation = undefined;
    this.systemMenuOpen = false;
    this.systemMenuIndex = 0;
    this.settingsOpen = false;
    this.soundSettingsOpen = false;
    this.soundSettingsReturn = undefined;
    this.musicSettingsOpen = false;
    this.musicSettingsReturn = undefined;
    this.recordMenuMode = undefined;
    this.recordMenuIndex = 0;
    this.quitConfirmOpen = false;
    this.quitConfirmIndex = 1;
    this.groupCommandOpen = false;
    this.groupCommandIndex = 0;
    this.retreatConfirmOpen = false;
    this.retreatConfirmIndex = 1;
    this.objectiveOpen = false;
    this.resetAction();
    this.cameraOrigin = { x: 6, y: 20 };
    this.cursor = { ...STAGE0.opening.from };
    this.statusMessage = message;
    this.phase = "prebattleStory";
    this.dialogueIndex = STORY_BY_PHASE.prebattleStory.length - 1;
    this.busy = false;
    void this.runOpeningMove();
  }

  continueAfterVictory(): void {
    if (this.phase !== "victoryFeedback") return;
    this.phase = "savePrompt";
    this.savePromptIndex = 0;
    this.emit();
  }

  showSaveSlots(): void {
    if (this.phase !== "savePrompt") return;
    this.phase = "saveSlots";
    this.postSaveSlotIndex = 0;
    this.emit();
  }

  skipSave(): void {
    if (this.phase === "savePrompt") this.goToNextStage();
  }

  selectSaveSlot(slot: number): void {
    if (this.phase !== "saveSlots" || slot < 1 || slot > 5) return;
    this.writeCompletedSave(slot);
  }

  selectPostSaveSlot(index: number): void {
    if (this.phase !== "saveSlots" || index < 0 || index > 4 || index === this.postSaveSlotIndex) return;
    this.postSaveSlotIndex = index;
    this.emit();
  }

  cancelPostSaveSlots(): void {
    if (this.phase === "saveSlots") this.goToNextStage();
  }

  confirmOverwrite(): void {
    if (this.pendingSaveSlot) this.writeCompletedSave(this.pendingSaveSlot);
  }

  cancelOverwrite(): void {
    this.pendingSaveSlot = undefined;
    this.emit();
  }

  readSave(slot: number): SaveData | undefined {
    const raw = localStorage.getItem(`angel2.save.${slot}`);
    if (!raw) return undefined;
    return parseSaveData(raw);
  }

  private writeCompletedSave(slot: number): void {
    const prior = this.readSave(slot);
    const save: SaveData = {
      format: "ANGEL2-web-save",
      version: 2,
      kind: "completed",
      savedAt: new Date().toISOString(),
      saveCount: (prior?.saveCount ?? 0) + 1,
      stage: 1,
      stageLabel: "下一關",
      ruleset: "stableRemake",
      difficulty: this.difficulty,
      rngState: this.battle.rng.state,
      roster: this.battle.units.filter((unit) => unit.side === 1).map(({ slot: unitSlot, classId, experience, life }) => ({ slot: unitSlot, classId, experience, life })),
    };
    localStorage.setItem(`angel2.save.${slot}`, JSON.stringify(save));
    this.pendingSaveSlot = undefined;
    this.goToNextStage();
  }

  openRecordMenu(mode: RecordMenuMode): void {
    const fromSystem = this.systemMenuOpen || this.settingsOpen;
    const fromBattle = this.phase === "player"
      && !this.busy
      && !this.hasBlockingOverlay
      && this.actionMode === "idle";
    if (!fromSystem && !fromBattle) return;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.recordMenuMode = mode;
    this.recordMenuReturn = fromSystem ? "system" : "battle";
    this.recordMenuIndex = 0;
    this.statusMessage = mode === "save" ? "選擇儲存記錄位置。" : "選擇要讀取的戰役記錄。";
    this.emit();
  }

  closeRecordMenu(): void {
    if (!this.recordMenuMode) return;
    const returnToSystem = this.recordMenuReturn === "system";
    this.recordMenuMode = undefined;
    this.recordMenuReturn = undefined;
    this.recordMenuIndex = 0;
    this.systemMenuOpen = returnToSystem;
    this.emit();
  }

  moveRecordMenuSelection(delta: number): void {
    if (!this.recordMenuMode || delta === 0) return;
    this.recordMenuIndex = (this.recordMenuIndex + delta + 5) % 5;
    this.emit();
  }

  selectRecordMenuSlot(index: number): void {
    if (!this.recordMenuMode || index < 0 || index > 4 || index === this.recordMenuIndex) return;
    this.recordMenuIndex = index;
    this.emit();
  }

  activateRecordMenuSelection(): void {
    if (!this.recordMenuMode) return;
    const slot = this.recordMenuIndex + 1;
    if (this.recordMenuMode === "save") this.writeBattleSave(slot);
    else this.loadSave(slot);
  }

  private writeBattleSave(slot: number): void {
    const prior = this.readSave(slot);
    const snapshot = this.battle.serializableSnapshot();
    const save: SaveData = {
      format: "ANGEL2-web-save",
      version: 2,
      kind: "battle",
      savedAt: new Date().toISOString(),
      saveCount: (prior?.saveCount ?? 0) + 1,
      stage: 0,
      stageLabel: "瓦爾克麗宮",
      ruleset: "stableRemake",
      difficulty: this.difficulty,
      rngState: this.battle.rng.state,
      roster: snapshot.units
        .filter((unit) => unit.side === 1)
        .map(({ slot: unitSlot, classId, experience, life }) => ({ slot: unitSlot, classId, experience, life })),
      battle: {
        phase: "player",
        ...snapshot,
        cursor: { ...this.cursor },
        cameraOrigin: { ...this.cameraOrigin },
      },
    };
    localStorage.setItem(`angel2.save.${slot}`, JSON.stringify(save));
    this.recordMenuMode = undefined;
    this.recordMenuReturn = undefined;
    this.recordMenuIndex = 0;
    this.statusMessage = `已儲存至記錄 ${slot}。`;
    this.emit();
  }

  private loadSave(slot: number): void {
    const save = this.readSave(slot);
    if (!save) {
      this.statusMessage = "此記錄位置沒有可讀取的資料。";
      this.emit();
      return;
    }
    if (save.kind === "completed") {
      this.recordMenuMode = undefined;
      this.recordMenuReturn = undefined;
      this.goToNextStage();
      return;
    }
    const battle = new Stage0Battle(new DeterministicRng(save.rngState));
    battle.restore(save.battle);
    this.battle = battle;
    this.difficulty = save.difficulty;
    this.phase = "player";
    this.cursor = { ...save.battle.cursor };
    this.cameraOrigin = { ...save.battle.cameraOrigin };
    this.recordMenuMode = undefined;
    this.recordMenuReturn = undefined;
    this.recordMenuIndex = 0;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.soundSettingsOpen = false;
    this.soundSettingsReturn = undefined;
    this.musicSettingsOpen = false;
    this.musicSettingsReturn = undefined;
    this.quitConfirmOpen = false;
    this.movementPresentation = undefined;
    this.combatPresentation = undefined;
    this.resetAction();
    this.statusMessage = `已讀取記錄 ${slot}。`;
    this.emit();
  }

  requestQuit(): void {
    if (this.phase !== "player" || this.busy || !this.systemMenuOpen) return;
    this.systemMenuOpen = false;
    this.quitConfirmOpen = true;
    this.quitConfirmIndex = 1;
    this.emit();
  }

  moveQuitSelection(delta: number): void {
    if (!this.quitConfirmOpen || delta === 0) return;
    this.quitConfirmIndex = this.quitConfirmIndex === 0 ? 1 : 0;
    this.emit();
  }

  selectQuitChoice(index: number): void {
    if (!this.quitConfirmOpen || index < 0 || index > 1 || index === this.quitConfirmIndex) return;
    this.quitConfirmIndex = index;
    this.emit();
  }

  activateQuitSelection(): void {
    if (!this.quitConfirmOpen) return;
    if (this.quitConfirmIndex === 0) this.confirmQuit();
    else this.cancelQuit();
  }

  confirmQuit(): void {
    if (!this.quitConfirmOpen) return;
    this.quitConfirmOpen = false;
    this.phase = "quit";
    this.statusMessage = "已離開第一關戰鬥。";
    this.emit();
  }

  cancelQuit(): void {
    if (!this.quitConfirmOpen) return;
    this.quitConfirmOpen = false;
    this.quitConfirmIndex = 1;
    this.emit();
  }

  moveCursor(delta: Position): void {
    if (this.phase === "savePrompt") {
      if (delta.x !== 0 || delta.y !== 0) {
        this.savePromptIndex = this.savePromptIndex === 0 ? 1 : 0;
        this.emit();
      }
      return;
    }
    if (this.phase === "saveSlots") {
      if (delta.y !== 0) {
        this.postSaveSlotIndex = (this.postSaveSlotIndex + delta.y + 5) % 5;
        this.emit();
      }
      return;
    }
    if (this.phase !== "player" || this.objectiveOpen || this.busy) return;
    if (this.recordMenuMode) {
      if (delta.y !== 0) this.moveRecordMenuSelection(delta.y);
      return;
    }
    if (this.quitConfirmOpen) {
      if (delta.x !== 0 || delta.y !== 0) this.moveQuitSelection(delta.x || delta.y);
      return;
    }
    if (this.settingsOpen) return;
    if (this.systemMenuOpen) {
      if (delta.y !== 0) this.moveSystemMenuSelection(delta.y);
      return;
    }
    if (this.retreatConfirmOpen) {
      if (delta.x !== 0 || delta.y !== 0) this.moveRetreatSelection(delta.x || delta.y);
      return;
    }
    if (this.groupCommandOpen) {
      if (delta.y !== 0) this.moveGroupCommandSelection(delta.y);
      return;
    }
    if (this.actionMode === "actionMenu") {
      if (delta.y !== 0) this.moveCommandSelection(delta.y);
      return;
    }
    this.minimapPreviewOrigin = undefined;
    this.cursor = {
      x: Math.max(0, Math.min(STAGE0.width - 1, this.cursor.x + delta.x)),
      y: Math.max(0, Math.min(STAGE0.height - 1, this.cursor.y + delta.y)),
    };
    this.centerCamera(this.cursor);
    this.emit();
  }

  panCamera(delta: Position): void {
    if (
      this.phase !== "player"
      || this.hasBlockingOverlay
      || this.busy
      || this.actionMode === "actionMenu"
    ) return;
    const next = {
      x: Math.max(0, Math.min(STAGE0.width - STAGE0.viewport.width, this.cameraOrigin.x + delta.x)),
      y: Math.max(0, Math.min(STAGE0.height - STAGE0.viewport.height, this.cameraOrigin.y + delta.y)),
    };
    if (positionKey(next) === positionKey(this.cameraOrigin)) return;
    this.minimapPreviewOrigin = undefined;
    this.cameraOrigin = next;
    this.emit();
  }

  previewMinimapCell(position: Position): Position | undefined {
    if (
      this.phase !== "player"
      || this.actionMode !== "idle"
      || this.busy
      || this.hasBlockingOverlay
    ) return undefined;
    this.minimapPreviewOrigin = {
      x: Math.max(0, Math.min(STAGE0.width - STAGE0.viewport.width, position.x - 4)),
      y: Math.max(0, Math.min(STAGE0.height - STAGE0.viewport.height, position.y - 3)),
    };
    return { ...this.minimapPreviewOrigin };
  }

  clearMinimapPreview(): void {
    this.minimapPreviewOrigin = undefined;
  }

  commitMinimapPreview(): void {
    if (!this.minimapPreviewOrigin) return;
    const origin = { ...this.minimapPreviewOrigin };
    this.cameraOrigin = origin;
    this.cursor = { x: origin.x + 4, y: origin.y + 3 };
    this.battle.focusId = this.battle.unitAt(this.cursor)?.id ?? this.battle.focusId;
    this.minimapPreviewOrigin = undefined;
    this.emit();
  }

  primaryAtCursor(): void {
    if (isStoryPhase(this.phase)) this.advanceDialogue();
    else if (this.phase === "defeat") this.retry();
    else if (this.phase === "victoryFeedback") this.continueAfterVictory();
    else if (this.phase === "savePrompt") {
      if (this.savePromptIndex === 0) this.showSaveSlots();
      else this.skipSave();
    }
    else if (this.phase === "saveSlots") this.selectSaveSlot(this.postSaveSlotIndex + 1);
    else if (this.recordMenuMode) this.activateRecordMenuSelection();
    else if (this.quitConfirmOpen) this.activateQuitSelection();
    else if (this.settingsOpen) return;
    else if (this.retreatConfirmOpen) this.activateRetreatSelection();
    else if (this.groupCommandOpen) this.activateGroupCommandSelection();
    else if (this.systemMenuOpen) this.activateSystemMenuSelection();
    else if (this.objectiveOpen) return;
    else if (this.actionMode === "actionMenu") this.activateCommandSelection();
    else this.selectCell(this.cursor);
  }

  forceDefeatForTest(): void {
    if (!this.testMode) return;
    this.battle.units = this.battle.units.filter((unit) => unit.id !== "1:0");
    this.resolveOutcome();
    this.emit();
  }

  forceVictorySetupForTest(): void {
    if (!this.testMode) return;
    const nia = this.battle.unit("1:0");
    const finalEnemy = this.battle.units.find((unit) => unit.side === 2);
    if (!nia || !finalEnemy) return;
    nia.x = 29;
    nia.y = 26;
    nia.acted = false;
    finalEnemy.x = 30;
    finalEnemy.y = 26;
    finalEnemy.life = 1;
    this.battle.units = this.battle.units.filter((unit) => unit.side === 1 || unit.id === finalEnemy.id);
    for (const unit of this.battle.units.filter((unit) => unit.side === 1 && unit.id !== nia.id)) unit.acted = true;
    this.battle.focusId = nia.id;
    this.phase = "player";
    this.cameraOrigin = { ...STAGE0.viewport.initialOrigin };
    this.cursor = { x: nia.x, y: nia.y };
    this.resetAction();
    this.statusMessage = "自動驗收：最後一名敵人已置於合法攻擊位。";
    this.emit();
  }

  forceEvacuationSetupForTest(): void {
    if (!this.testMode) return;
    const finalEnemy = this.battle.unit("2:15");
    if (!finalEnemy) return;
    const leftExit = STAGE0.enemyExitCells[0];
    finalEnemy.x = leftExit.x;
    finalEnemy.y = leftExit.y - 3;
    finalEnemy.acted = false;
    this.battle.units = this.battle.units.filter((unit) => unit.side === 1 || unit.id === finalEnemy.id);
    this.battle.focusId = finalEnemy.id;
    this.phase = "player";
    this.cameraOrigin = { x: 20, y: 41 };
    this.cursor = { x: finalEnemy.x, y: finalEnemy.y };
    this.resetAction();
    this.statusMessage = "自動驗收：哈釘已抵達撤離格前。";
    this.busy = false;
    this.emit();
  }

  forceMultipleTargetsForTest(): void {
    if (!this.testMode) return;
    const nia = this.battle.unit("1:0");
    const enemies = this.battle.units.filter((unit) => unit.side === 2).slice(0, 2);
    if (!nia || enemies.length < 2) return;
    nia.x = 29;
    nia.y = 26;
    nia.acted = false;
    enemies[0].x = 28;
    enemies[0].y = 26;
    enemies[1].x = 30;
    enemies[1].y = 26;
    this.battle.units = this.battle.units.filter((unit) => unit.side === 1 || enemies.some((enemy) => enemy.id === unit.id));
    for (const unit of this.battle.units.filter((unit) => unit.side === 1 && unit.id !== nia.id)) unit.acted = true;
    this.battle.focusId = nia.id;
    this.phase = "player";
    this.cameraOrigin = { ...STAGE0.viewport.initialOrigin };
    this.cursor = { x: nia.x, y: nia.y };
    this.resetAction();
    this.statusMessage = "自動驗收：妮雅已有兩個合法普通攻擊目標。";
    this.busy = false;
    this.emit();
  }

  forceCavalryCounterSetupForTest(): void {
    if (!this.testMode) return;
    const nia = this.battle.unit("1:0");
    const cavalry = this.battle.unit("2:15");
    if (!nia || !cavalry) return;
    nia.x = 29;
    nia.y = 26;
    nia.acted = false;
    cavalry.x = 30;
    cavalry.y = 26;
    cavalry.life = statsFor(cavalry).maxLife;
    cavalry.acted = false;
    this.battle.units = this.battle.units.filter((unit) => unit.side === 1 || unit.id === cavalry.id);
    for (const unit of this.battle.units.filter((unit) => unit.side === 1 && unit.id !== nia.id)) unit.acted = true;
    this.battle.focusId = nia.id;
    this.phase = "player";
    this.cameraOrigin = { ...STAGE0.viewport.initialOrigin };
    this.cursor = { x: nia.x, y: nia.y };
    this.resetAction();
    this.statusMessage = "自動驗收：哈釘已置於可反擊位置。";
    this.busy = false;
    this.emit();
  }

  debugState(): object {
    return {
      phase: this.phase,
      difficulty: this.difficulty,
      dialogueIndex: this.dialogueIndex,
      actionMode: this.actionMode,
      selectedId: this.selectedId,
      commandMenuKind: this.commandMenuKind,
      commandIndex: this.commandIndex,
      commands: this.unitCommands.map((command) => ({ ...command })),
      cursor: { ...this.cursor },
      cameraOrigin: this.cameraOrigin,
      minimapPreviewOrigin: this.minimapPreviewOrigin ? { ...this.minimapPreviewOrigin } : undefined,
      objectiveOpen: this.objectiveOpen,
      systemMenuOpen: this.systemMenuOpen,
      systemMenuIndex: this.systemMenuIndex,
      systemCommands: SYSTEM_COMMANDS.map((command) => ({ ...command })),
      settingsOpen: this.settingsOpen,
      soundSettingsOpen: this.soundSettingsOpen,
      soundSettingsReturn: this.soundSettingsReturn,
      musicSettingsOpen: this.musicSettingsOpen,
      musicSettingsReturn: this.musicSettingsReturn,
      recordMenuMode: this.recordMenuMode,
      recordMenuReturn: this.recordMenuReturn,
      recordMenuIndex: this.recordMenuIndex,
      quitConfirmOpen: this.quitConfirmOpen,
      quitConfirmIndex: this.quitConfirmIndex,
      savePromptIndex: this.savePromptIndex,
      postSaveSlotIndex: this.postSaveSlotIndex,
      musicVolume: this.musicVolume,
      speechEnabled: this.speechEnabled,
      movementSoundEnabled: this.movementSoundEnabled,
      combatSoundEnabled: this.combatSoundEnabled,
      keySoundEnabled: this.keySoundEnabled,
      groupCommandOpen: this.groupCommandOpen,
      groupCommandIndex: this.groupCommandIndex,
      groupCommands: GROUP_COMMANDS.map((command) => ({ ...command })),
      groupLeaderId: this.groupLeader?.id,
      retreatConfirmOpen: this.retreatConfirmOpen,
      retreatConfirmIndex: this.retreatConfirmIndex,
      audioCue: this.audioCue ? { ...this.audioCue } : undefined,
      audioCueLog: this.audioCueLog.map((cue) => ({ ...cue })),
      battlePresentation: this.battlePresentation,
      gridEnabled: this.gridEnabled,
      edgeScrollEnabled: this.edgeScrollEnabled,
      portraitsEnabled: this.portraitsEnabled,
      lastCombat: this.lastCombat ? { ...this.lastCombat } : undefined,
      combatPresentation: this.combatPresentation ? {
        ...this.combatPresentation,
        attacker: { ...this.combatPresentation.attacker },
        defender: { ...this.combatPresentation.defender },
        result: { ...this.combatPresentation.result },
        fullScene: this.combatPresentation.fullScene ? { ...this.combatPresentation.fullScene } : undefined,
      } : undefined,
      combatPresentationTrace: this.combatPresentationTrace.map((entry) => ({ ...entry })),
      movementPresentation: this.movementPresentation ? {
        ...this.movementPresentation,
        path: this.movementPresentation.path.map((step) => ({ ...step })),
      } : undefined,
      reachable: this.reachable.map((cell) => ({ ...cell })),
      targets: this.targets.map((cell) => ({ ...cell })),
      ...this.battle.snapshot(),
    };
  }

  private resolveOutcome(): boolean {
    const outcome = this.battle.outcome();
    if (outcome === "defeat") {
      this.systemMenuOpen = false;
      this.settingsOpen = false;
      this.soundSettingsOpen = false;
      this.soundSettingsReturn = undefined;
      this.musicSettingsOpen = false;
      this.musicSettingsReturn = undefined;
      this.recordMenuMode = undefined;
      this.quitConfirmOpen = false;
      this.groupCommandOpen = false;
      this.retreatConfirmOpen = false;
      this.objectiveOpen = false;
      this.movementPresentation = undefined;
      this.phase = "defeat";
      this.statusMessage = "妮雅戰敗。";
      this.resetAction();
      return true;
    }
    if (outcome === "victory") {
      this.systemMenuOpen = false;
      this.settingsOpen = false;
      this.soundSettingsOpen = false;
      this.soundSettingsReturn = undefined;
      this.musicSettingsOpen = false;
      this.musicSettingsReturn = undefined;
      this.recordMenuMode = undefined;
      this.quitConfirmOpen = false;
      this.groupCommandOpen = false;
      this.retreatConfirmOpen = false;
      this.objectiveOpen = false;
      this.movementPresentation = undefined;
      this.phase = "victoryStory";
      this.dialogueIndex = 0;
      this.battle.focusId = "1:0";
      const nia = this.battle.unit("1:0");
      if (nia) this.centerCamera(nia);
      this.statusMessage = "瓦爾克麗宮內的敵人均已被擊倒或撤離。";
      this.resetAction();
      return true;
    }
    return false;
  }

  private goToNextStage(): void {
    this.phase = "nextStage";
    this.emit();
  }

  private persistPresentationPreferences(): void {
    savePresentationPreferences(localStorage, {
      battlePresentation: this.battlePresentation,
      gridEnabled: this.gridEnabled,
      edgeScrollEnabled: this.edgeScrollEnabled,
      portraitsEnabled: this.portraitsEnabled,
    });
  }

  private persistSoundPreferences(): void {
    saveSoundPreferences(localStorage, {
      speechEnabled: this.speechEnabled,
      movementSoundEnabled: this.movementSoundEnabled,
      combatSoundEnabled: this.combatSoundEnabled,
      keySoundEnabled: this.keySoundEnabled,
    });
  }

  private persistMusicPreferences(): void {
    saveMusicPreferences(localStorage, { musicVolume: this.musicVolume });
  }

  private async moveSelectedUnit(destination: Position): Promise<void> {
    const unit = this.selectedUnit;
    if (!unit || this.busy || this.actionMode !== "move") return;
    const path = this.battle.movementPath(unit.id, destination);
    if (path.length === 0) return;
    this.busy = true;
    this.actionMode = "moving";
    this.pendingPath = path.map((step) => ({ ...step }));
    const completed = await this.animateUnitPath(unit.id, path, "player");
    this.busy = false;
    this.actionMode = completed ? "actionMenu" : "move";
    this.commandIndex = 0;
    this.statusMessage = completed ? "選擇攻擊、結束或返悔。" : "移動路徑已失效。";
    this.emit();
  }

  private async rollbackSelectedMovement(): Promise<void> {
    const unit = this.selectedUnit;
    if (!unit || !this.pendingOrigin || this.busy) return;
    const path = this.pendingPath?.length ? [...this.pendingPath].reverse() : [{ x: unit.x, y: unit.y }, { ...this.pendingOrigin }];
    this.busy = true;
    this.actionMode = "moving";
    const completed = await this.animateUnitPath(unit.id, path, "rollback");
    this.busy = false;
    this.pendingPath = undefined;
    this.commandIndex = 0;
    this.actionMode = "actionMenu";
    this.reachable = [];
    this.statusMessage = completed ? "已沿原路返回；請重新選擇行動。" : "無法返回原位置。";
    this.emit();
  }

  private async animateUnitPath(unitId: string, path: readonly Position[], kind: MovementKind): Promise<boolean> {
    if (path.length === 0) return false;
    this.movementPresentation = {
      unitId,
      kind,
      path: path.map((step) => ({ ...step })),
      stepIndex: 0,
    };
    if (kind === "scripted") this.queueAudioCue(14, "stage-event-scripted-movement");
    this.cursor = { ...path[path.length - 1] };
    this.emit();
    for (let index = 1; index < path.length; index += 1) {
      const step = path[index];
      if (!this.battle.moveUnitStep(unitId, step, index < path.length - 1)) {
        const unit = this.battle.unit(unitId);
        if (unit) this.cursor = { x: unit.x, y: unit.y };
        this.movementPresentation = undefined;
        return false;
      }
      this.movementPresentation.stepIndex = index;
      if (kind === "scripted" || kind === "allyAuto" || kind === "enemy") this.centerCamera(step);
      this.emit();
      await pause(this.movementStepDuration);
    }
    this.movementPresentation = undefined;
    return true;
  }

  private centerCamera(position: Position): void {
    this.cameraOrigin = {
      x: Math.max(0, Math.min(STAGE0.width - STAGE0.viewport.width, position.x - 4)),
      y: Math.max(0, Math.min(STAGE0.height - STAGE0.viewport.height, position.y - 3)),
    };
  }

  describeFocus(): { stats: ReturnType<typeof statsFor>; unit: BattleUnit } | undefined {
    const unit = this.focusedUnit;
    return unit ? { unit, stats: statsFor(unit) } : undefined;
  }

  portraitUrl(portrait: BattleUnit["portrait"]): string {
    return ASSETS.portraits[portrait];
  }
}

export interface Angel2DebugApi {
  getState: () => object;
  skipDialogue: () => void;
  forceDefeat: () => void;
  forceVictorySetup: () => void;
  forceEvacuationSetup: () => void;
  forceMultipleTargets: () => void;
  forceCavalryCounterSetup: () => void;
  clearSaves: () => void;
}

declare global {
  interface Window {
    __ANGEL2__?: Angel2DebugApi;
  }
}

export function exposeDebugApi(controller: GameController): void {
  if (!controller.isTestMode) return;
  window.__ANGEL2__ = {
    getState: () => controller.debugState(),
    skipDialogue: () => controller.skipDialogue(),
    forceDefeat: () => controller.forceDefeatForTest(),
    forceVictorySetup: () => controller.forceVictorySetupForTest(),
    forceEvacuationSetup: () => controller.forceEvacuationSetupForTest(),
    forceMultipleTargets: () => controller.forceMultipleTargetsForTest(),
    forceCavalryCounterSetup: () => controller.forceCavalryCounterSetupForTest(),
    clearSaves: () => {
      for (let slot = 1; slot <= 5; slot += 1) localStorage.removeItem(`angel2.save.${slot}`);
    },
  };
}
