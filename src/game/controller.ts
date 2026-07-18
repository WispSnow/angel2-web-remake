import { ASSETS, STAGE0, statsFor } from "./content/stage0";
import { STORY_BY_PHASE } from "./content/dialogue";
import { Stage0Battle } from "./simulation/battle";
import { manhattan, positionKey, reachableCells, shortestPath } from "./simulation/grid";
import type { ActionMode, AttackResult, BattleUnit, DialoguePage, GamePhase, Position, SaveData } from "./types";

type Listener = () => void;
type StoryPhase = keyof typeof STORY_BY_PHASE;
type MovementKind = "scripted" | "player" | "enemy" | "rollback";
export type UnitCommandId = "move" | "attack" | "rest" | "end" | "undo";

export interface UnitCommand {
  id: UnitCommandId;
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
  phase: GamePhase = "prebattleStory";
  actionMode: ActionMode = "idle";
  dialogueIndex = 0;
  selectedId?: string;
  commandIndex = 0;
  cursor: Position = { x: 29, y: 26 };
  cameraOrigin: Position = { x: 25, y: 23 };
  reachable: Position[] = [];
  targets: Position[] = [];
  objectiveOpen = false;
  systemMenuOpen = false;
  hintVisible = localStorage.getItem("angel2.stage0.hintSeen") !== "yes";
  presentationFast = false;
  battlePresentation: "map" | "full" = "map";
  musicEnabled = true;
  soundEnabled = true;
  speechEnabled = true;
  lastCombat?: AttackResult;
  combatPresentation?: {
    attacker: BattleUnit;
    defender: BattleUnit;
    result: AttackResult;
    frame: number;
  };
  movementPresentation?: MovementPresentation;
  statusMessage = "";
  pendingSaveSlot?: number;
  private pendingOrigin?: Position;
  private pendingPath?: Position[];
  private busy = false;
  private listeners = new Set<Listener>();
  private readonly testMode = new URLSearchParams(location.search).has("test");

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
    if (this.phase !== "player" || this.objectiveOpen || this.systemMenuOpen || this.busy) return;
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
    if (!unit) {
      this.emit();
      return;
    }
    this.battle.focusId = unit.id;
    if (unit.side === 1 && !unit.acted) {
      this.selectedId = unit.id;
      this.pendingOrigin = { x: unit.x, y: unit.y };
      this.pendingPath = undefined;
      this.reachable = [];
      this.commandIndex = 0;
      this.actionMode = "actionMenu";
      this.statusMessage = `選擇${unit.className}的行動。`;
    } else {
      this.statusMessage = unit.side === 2 ? "敵軍正向宮殿出口撤離。" : "此單位本回合已行動。";
    }
    this.emit();
  }

  focusCell(position: Position): void {
    if (this.phase !== "player" || this.actionMode !== "idle" || this.objectiveOpen || this.systemMenuOpen || this.busy) return;
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
      this.combatPresentation = { attacker: attackerPresentation, defender: defenderPresentation, result, frame: 0 };
      for (let frame = 0; frame < 4; frame += 1) {
        if (this.combatPresentation) this.combatPresentation.frame = frame;
        this.emit();
        await pause(this.testMode ? 60 : this.presentationFast ? 45 : 120);
      }
      this.combatPresentation = undefined;
      this.busy = false;
      const ended = this.resolveOutcome();
      this.emit();
      if (!ended && this.battle.units.filter((unit) => unit.side === 1).every((unit) => unit.acted)) void this.endPlayerPhase();
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
    if (this.battle.units.filter((unit) => unit.side === 1).every((unit) => unit.acted)) void this.endPlayerPhase();
  }

  private resetAction(): void {
    this.actionMode = "idle";
    this.selectedId = undefined;
    this.commandIndex = 0;
    this.pendingOrigin = undefined;
    this.pendingPath = undefined;
    this.reachable = [];
    this.targets = [];
  }

  async endPlayerPhase(): Promise<void> {
    if (this.phase !== "player" || this.busy) return;
    this.busy = true;
    this.systemMenuOpen = false;
    this.resetAction();
    this.phase = "enemy";
    this.statusMessage = "敵方階段：騎士團部隊向出口撤離。";
    this.emit();
    const enemyIds = this.battle.units.filter((unit) => unit.side === 2).map((unit) => unit.id);
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

  openObjectives(): void {
    if (this.busy || !["player", "enemy"].includes(this.phase)) return;
    this.systemMenuOpen = false;
    this.objectiveOpen = true;
    this.markHintSeen();
    this.emit();
  }

  closeObjectives(): void {
    this.objectiveOpen = false;
    this.emit();
  }

  openSystemMenu(): void {
    if (this.phase !== "player" || this.busy || this.objectiveOpen || this.actionMode !== "idle") return;
    this.systemMenuOpen = true;
    this.emit();
  }

  closeSystemMenu(): void {
    if (!this.systemMenuOpen) return;
    this.systemMenuOpen = false;
    this.emit();
  }

  secondaryAction(): void {
    if (this.objectiveOpen) this.closeObjectives();
    else if (this.systemMenuOpen) this.closeSystemMenu();
    else if (this.phase === "player" && this.actionMode === "idle") this.openSystemMenu();
    else this.cancelAction();
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
    this.emit();
  }

  toggleMusic(): void {
    this.musicEnabled = !this.musicEnabled;
    this.emit();
  }

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    this.emit();
  }

  toggleSpeech(): void {
    this.speechEnabled = !this.speechEnabled;
    this.emit();
  }

  retry(): void {
    this.battle = new Stage0Battle();
    this.movementPresentation = undefined;
    this.systemMenuOpen = false;
    this.objectiveOpen = false;
    this.resetAction();
    this.cameraOrigin = { x: 6, y: 20 };
    this.cursor = { ...STAGE0.opening.from };
    this.statusMessage = "重新建立第 0 關固定編隊。";
    this.phase = "prebattleStory";
    this.dialogueIndex = STORY_BY_PHASE.prebattleStory.length - 1;
    this.busy = false;
    void this.runOpeningMove();
  }

  continueAfterVictory(): void {
    if (this.phase !== "victoryFeedback") return;
    this.phase = "savePrompt";
    this.emit();
  }

  showSaveSlots(): void {
    if (this.phase !== "savePrompt") return;
    this.phase = "saveSlots";
    this.emit();
  }

  skipSave(): void {
    if (this.phase === "savePrompt") this.goToNextStage();
  }

  selectSaveSlot(slot: number): void {
    if (this.phase !== "saveSlots" || slot < 1 || slot > 5) return;
    if (this.readSave(slot)) {
      this.pendingSaveSlot = slot;
      this.emit();
      return;
    }
    this.writeSave(slot);
  }

  confirmOverwrite(): void {
    if (this.pendingSaveSlot) this.writeSave(this.pendingSaveSlot);
  }

  cancelOverwrite(): void {
    this.pendingSaveSlot = undefined;
    this.emit();
  }

  readSave(slot: number): SaveData | undefined {
    const raw = localStorage.getItem(`angel2.save.${slot}`);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as SaveData;
    } catch {
      return undefined;
    }
  }

  private writeSave(slot: number): void {
    const prior = this.readSave(slot);
    const save: SaveData = {
      format: "ANGEL2-web-save",
      version: 1,
      savedAt: new Date().toISOString(),
      saveCount: (prior?.saveCount ?? 0) + 1,
      stage: 1,
      stageLabel: "下一關",
      ruleset: "stableRemake",
      rngState: this.battle.rng.state,
      roster: this.battle.units.filter((unit) => unit.side === 1).map(({ slot: unitSlot, classId, experience, life }) => ({ slot: unitSlot, classId, experience, life })),
    };
    localStorage.setItem(`angel2.save.${slot}`, JSON.stringify(save));
    this.pendingSaveSlot = undefined;
    this.goToNextStage();
  }

  moveCursor(delta: Position): void {
    if (this.phase !== "player" || this.systemMenuOpen || this.objectiveOpen || this.busy) return;
    if (this.actionMode === "actionMenu") {
      if (delta.y !== 0) this.moveCommandSelection(delta.y);
      return;
    }
    this.cursor = {
      x: Math.max(0, Math.min(STAGE0.width - 1, this.cursor.x + delta.x)),
      y: Math.max(0, Math.min(STAGE0.height - 1, this.cursor.y + delta.y)),
    };
    this.centerCamera(this.cursor);
    this.emit();
  }

  primaryAtCursor(): void {
    if (isStoryPhase(this.phase)) this.advanceDialogue();
    else if (this.systemMenuOpen || this.objectiveOpen) return;
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

  debugState(): object {
    return {
      phase: this.phase,
      dialogueIndex: this.dialogueIndex,
      actionMode: this.actionMode,
      commandMenuKind: this.commandMenuKind,
      commandIndex: this.commandIndex,
      commands: this.unitCommands.map((command) => ({ ...command })),
      cursor: { ...this.cursor },
      cameraOrigin: this.cameraOrigin,
      objectiveOpen: this.objectiveOpen,
      systemMenuOpen: this.systemMenuOpen,
      battlePresentation: this.battlePresentation,
      movementPresentation: this.movementPresentation ? {
        ...this.movementPresentation,
        path: this.movementPresentation.path.map((step) => ({ ...step })),
      } : undefined,
      reachable: this.reachable.map((cell) => ({ ...cell })),
      ...this.battle.snapshot(),
    };
  }

  private resolveOutcome(): boolean {
    const outcome = this.battle.outcome();
    if (outcome === "defeat") {
      this.systemMenuOpen = false;
      this.objectiveOpen = false;
      this.movementPresentation = undefined;
      this.phase = "defeat";
      this.statusMessage = "妮雅戰敗。";
      this.resetAction();
      return true;
    }
    if (outcome === "victory") {
      this.systemMenuOpen = false;
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
      if (kind === "scripted" || kind === "enemy") this.centerCamera(step);
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
    clearSaves: () => {
      for (let slot = 1; slot <= 5; slot += 1) localStorage.removeItem(`angel2.save.${slot}`);
    },
  };
}
