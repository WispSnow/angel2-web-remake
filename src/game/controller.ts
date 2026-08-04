import { STAGE0 } from "./content/stage0";
import {
  cameraFocusForOrigin,
  cameraOriginForFocus,
  clampCameraFocus,
  clampCameraOrigin,
} from "./camera";
import { portraitSourceFor } from "./content/portrait-catalog.generated";
import {
  BATTLE_ACTION_DEFINITIONS,
  STAGE0_REST_PRESENTATION,
  stage1ActionPresentation,
} from "./content/actions";
import { aiTechniqueDialogueFor } from "./content/ai-technique-dialogue";
import {
  classDefinition,
  className,
  promotionTargetsFor,
  type PromotionTarget,
} from "./content/classes";
import {
  storyPagesForId,
  storyPhaseForStageStory,
  type StageStoryPhase,
} from "./content/dialogue";
import {
  stageSimulationEffectFor,
  type CampaignRouteId,
} from "./content/stage-effects";
import type {
  StageEventDefinition,
  StageEventTrigger,
  StagePresentationId,
  StageSimulationEffectId,
  StageStoryId,
} from "./content/stages";
import {
  groupCommandDialogueFor,
  type SpokenGroupCommandId,
} from "./content/group-command-dialogue";
import { promotionDialogueFor } from "./content/promotion-dialogue";
import { buildFullCombatScript, type FullCombatPhaseName, type FullCombatSceneState } from "./full-combat";
import { inspectTerrain, type TerrainInspection } from "./terrain-inspection";
import {
  TURN_TRANSITION_HOLD_NATIVE_TICKS,
  turnTransitionFrames,
  type TurnTransitionPresentation,
  type TurnTransitionSide,
} from "./turn-transition-presentation";
import { Stage0Battle, type AlliedAiAction } from "./simulation/battle";
import type { DeploymentResult } from "./simulation/deployment";
import { manhattan, positionKey } from "./simulation/grid";
import { DeterministicRng } from "./simulation/rng";
import {
  createStageEventState,
  dispatchStageEvents,
  type StageEventState,
} from "./simulation/stage-events";
import type {
  BattleActionId,
  SpecialActionResult,
} from "./simulation/actions/types";
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
import {
  moveSaveSlotIndex,
  moveSaveSlotPage,
  readSaveSlot,
  SAVE_CONTENT_VERSION,
  SAVE_SLOT_COUNT,
  SAVE_VERSION,
  saveSlotKey,
} from "./save";
import type { ActionMode, AttackResult, BattleUnit, CampaignState, DialoguePage, Difficulty, GamePhase, Position, SaveData, UnitStats } from "./types";

type Listener = () => void;
type MovementKind = "scripted" | "player" | "allyAuto" | "enemy" | "rollback";
type Stage1ContentModule = typeof import("./content/stage1");
type Stage1BattleModule = typeof import("./simulation/stage1-battle");
interface Stage1Runtime {
  content: Stage1ContentModule;
  battle: Stage1BattleModule;
}
type Stage2ContentModule = typeof import("./content/stage2");
type Stage2BattleModule = typeof import("./simulation/stage2-battle");
interface Stage2Runtime {
  content: Stage2ContentModule;
  battle: Stage2BattleModule;
}

function cloneCampaignState(campaign: CampaignState): CampaignState {
  return {
    ...campaign,
    roster: campaign.roster.map((entry) => ({ ...entry })),
  };
}

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

export type SpecialActionPresentationPhase =
  | "shootBlank"
  | "shootHit"
  | "fireEffect"
  | "healPrimary"
  | "healBlank"
  | "healTail"
  | "lightningMain"
  | "lightningHit"
  | "lightningCleanup"
  | "iceExpansion"
  | "dispelEffect"
  | "lifeDrain"
  | "specialDeath";

export interface SpecialActionPresentation {
  actor: BattleUnit;
  target?: BattleUnit;
  center: Position;
  result: SpecialActionResult;
  phase: SpecialActionPresentationPhase;
  frame: number;
  nativeTicks: number;
  displayedLifeByUnitId: Readonly<Record<string, number>>;
  lifeChangeUnitId?: string;
}

export interface AiTechniqueDialoguePresentation {
  actionId: BattleActionId;
  actor: BattleUnit;
  center: Position;
  page: DialoguePage;
}

export type RestPresentationPhase = "restEffect" | "restBlank";

export interface RestPresentation {
  unit: BattleUnit;
  phase: RestPresentationPhase;
  frame: number;
  nativeTicks: number;
}

export type AudioCueGroup = "e" | "magic" | "un";

export type UnitCommandId = "move" | "attack" | "shoot" | "technique" | "rest" | "end" | "undo";
export type GroupCommandId = SpokenGroupCommandId | "retreat";
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

const CLASS_COMMANDS: Readonly<Partial<Record<BattleUnit["classId"], UnitCommand>>> = {
  archer: { id: "shoot", label: "射擊" },
  sister: { id: "technique", label: "技術" },
  magician: { id: "technique", label: "技術" },
  "magic-priest": { id: "technique", label: "技術" },
};

const SISTER_TECHNIQUES = ["fire-1", "heal-1"] as const satisfies readonly BattleActionId[];
const MAGICIAN_TECHNIQUES = ["fire-1", "lightning-1", "ice-1"] as const satisfies readonly BattleActionId[];
const MAGIC_PRIEST_TIER3_TECHNIQUES = ["dispel"] as const satisfies readonly BattleActionId[];
const MAGIC_PRIEST_TIER3_EXPERIENCE = classDefinition("magic-priest").dataRows[2].experienceThreshold;

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

const STORY_PHASES = new Set<GamePhase>([
  "prebattleStory",
  "openingStory",
  "round2Story",
  "victoryStory",
]);
const isStoryPhase = (phase: GamePhase): phase is StageStoryPhase => STORY_PHASES.has(phase);
const pause = (milliseconds: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));

export class GameController {
  battle: Stage0Battle;
  difficulty: Difficulty;
  phase: GamePhase = "prebattleStory";
  campaignRoute?: CampaignRouteId;
  actionMode: ActionMode = "idle";
  dialogueIndex = 0;
  selectedId?: string;
  commandIndex = 0;
  cursor: Position = { x: 29, y: 26 };
  terrainInspectionPosition?: Position;
  cameraOrigin: Position = { x: 25, y: 23 };
  minimapPreviewOrigin?: Position;
  reachable: Position[] = [];
  targets: Position[] = [];
  actionRange: Position[] = [];
  selectedActionId?: BattleActionId;
  techniqueIndex = 0;
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
  groupCommandDialogueId?: SpokenGroupCommandId;
  retreatConfirmOpen = false;
  retreatConfirmIndex = 1;
  hintVisible = localStorage.getItem("angel2.stage0.hintSeen") !== "yes";
  presentationFast = false;
  battlePresentation: "map" | "full";
  gridEnabled: boolean;
  edgeScrollEnabled: boolean;
  portraitsEnabled: boolean;
  aiDialogueEnabled: boolean;
  musicVolume: MusicVolume;
  speechEnabled: boolean;
  movementSoundEnabled: boolean;
  combatSoundEnabled: boolean;
  keySoundEnabled: boolean;
  lastCombat?: AttackResult;
  lastSpecialAction?: SpecialActionResult;
  combatPresentation?: CombatPresentation;
  combatPresentationTrace: CombatPresentationTraceEntry[] = [];
  specialActionPresentation?: SpecialActionPresentation;
  specialActionPresentationTrace: Array<{
    phase: SpecialActionPresentationPhase;
    frame: number;
    nativeTicks: number;
    displayedLifeByUnitId: Readonly<Record<string, number>>;
    lifeChangeUnitId?: string;
  }> = [];
  restPresentation?: RestPresentation;
  restPresentationTrace: RestPresentation[] = [];
  turnTransitionPresentation?: TurnTransitionPresentation;
  turnTransitionPresentationTrace: TurnTransitionPresentation[] = [];
  aiTechniqueDialogue?: AiTechniqueDialoguePresentation;
  movementPresentation?: MovementPresentation;
  statusMessage = "";
  pendingSaveSlot?: number;
  stageProgress = 0;
  savePromptIndex = 0;
  postSaveSlotIndex = 0;
  promotionUnitIds: string[] = [];
  promotionDialogueIndex?: number;
  promotionSelectionIndex = 0;
  audioCue?: { sequence: number; group: AudioCueGroup; record: number; reason: string };
  audioCueLog: Array<{ sequence: number; group: AudioCueGroup; record: number; reason: string }> = [];
  private audioCueSequence = 0;
  private pendingOrigin?: Position;
  private pendingPath?: Position[];
  private busy = false;
  private promotionResume?: () => void;
  private groupCommandLeaderId?: string;
  private activeStoryId?: StageStoryId;
  private stageEventState: StageEventState;
  private stageEntrySnapshot: CampaignState;
  private stage1Campaign?: CampaignState;
  private stage1Runtime?: Stage1Runtime;
  private stage1RuntimePromise?: Promise<Stage1Runtime>;
  private stage2Runtime?: Stage2Runtime;
  private stage2RuntimePromise?: Promise<Stage2Runtime>;
  private listeners = new Set<Listener>();
  private readonly testMode = new URLSearchParams(location.search).has("test");
  private readonly debugMode = this.testMode
    || new URLSearchParams(location.search).has("debugScenario");
  // Keeps the measured full-screen timing under ?test=1 for visual review.
  private readonly fullCombatRealTime = new URLSearchParams(location.search).has("slowFull");

  constructor(difficulty: Difficulty = 0) {
    this.difficulty = difficulty;
    this.battle = new Stage0Battle(difficulty);
    this.stageEntrySnapshot = cloneCampaignState(this.battle.campaignSnapshot());
    this.stageEventState = createStageEventState(this.battle.stage);
    const preferences = loadPresentationPreferences(localStorage);
    this.battlePresentation = preferences.battlePresentation;
    this.gridEnabled = preferences.gridEnabled;
    this.edgeScrollEnabled = preferences.edgeScrollEnabled;
    this.portraitsEnabled = preferences.portraitsEnabled;
    this.aiDialogueEnabled = preferences.aiDialogueEnabled;
    this.musicVolume = loadMusicPreferences(localStorage).musicVolume;
    const soundPreferences = loadSoundPreferences(localStorage);
    this.speechEnabled = soundPreferences.speechEnabled;
    this.movementSoundEnabled = soundPreferences.movementSoundEnabled;
    this.combatSoundEnabled = soundPreferences.combatSoundEnabled;
    this.keySoundEnabled = soundPreferences.keySoundEnabled;
    this.initializeStageEventProgress();
  }

  static async fromSave(save: SaveData, slot: number): Promise<GameController> {
    const controller = new GameController(save.difficulty);
    await controller.restoreSave(save, `已讀取記錄 ${slot}。`);
    return controller;
  }

  get stage1DeploymentRoster() {
    return this.stage1Campaign
      ? this.requireStage1Runtime().battle.createStage1DeploymentRoster(this.stage1Campaign.roster)
      : [];
  }

  get stage1DeploymentDefinition() {
    return this.requireStage1Runtime().content.STAGE1_DEFINITION.deployment;
  }

  get currentStageAssets() {
    if (this.battle.stage.id === "stage-01") return this.requireStage1Runtime().content.STAGE1_ASSETS;
    if (this.battle.stage.id === "stage-02") return this.requireStage2Runtime().content.STAGE2_ASSETS;
    return undefined;
  }

  private requireStage1Runtime(): Stage1Runtime {
    if (!this.stage1Runtime) throw new Error("stage 1 runtime has not loaded");
    return this.stage1Runtime;
  }

  private async loadStage1Runtime(): Promise<Stage1Runtime> {
    if (this.stage1Runtime) return this.stage1Runtime;
    this.stage1RuntimePromise ??= Promise.all([
      import("./content/stage1"),
      import("./simulation/stage1-battle"),
    ]).then(([content, battle]) => {
      content.activateStage1Content();
      const runtime = { content, battle };
      this.stage1Runtime = runtime;
      return runtime;
    });
    return this.stage1RuntimePromise;
  }

  private requireStage2Runtime(): Stage2Runtime {
    if (!this.stage2Runtime) throw new Error("stage 2 runtime has not loaded");
    return this.stage2Runtime;
  }

  private async loadStage2Runtime(): Promise<Stage2Runtime> {
    if (this.stage2Runtime) return this.stage2Runtime;
    this.stage2RuntimePromise ??= Promise.all([
      import("./content/stage2"),
      import("./simulation/stage2-battle"),
    ]).then(([content, battle]) => {
      content.activateStage2Content();
      const runtime = { content, battle };
      this.stage2Runtime = runtime;
      return runtime;
    });
    return this.stage2RuntimePromise;
  }

  async enterStage1(campaign: CampaignState = {
    ...this.battle.campaignSnapshot(),
    stageId: "stage-01",
  }, entry: "prebattle" | "deployment" = "prebattle", statusMessage?: string): Promise<void> {
    const runtime = await this.loadStage1Runtime();
    const { STAGE1_DEFINITION } = runtime.content;
    this.stageEntrySnapshot = cloneCampaignState({ ...campaign, stageId: "stage-01" });
    this.stage1Campaign = cloneCampaignState(this.stageEntrySnapshot);
    const initialDeployment: DeploymentResult = {
      placements: STAGE1_DEFINITION.deployment.fixedPlacements.map(({ slot, position }) => ({
        slot,
        position: { ...position },
        fixed: true,
      })),
    };
    this.battle = new runtime.battle.Stage1Battle(this.stage1Campaign, initialDeployment);
    this.difficulty = campaign.difficulty;
    this.campaignRoute = "stage-01";
    this.activeStoryId = undefined;
    this.stageEventState = createStageEventState(this.battle.stage);
    this.resetAction();
    this.cameraOrigin = clampCameraOrigin(this.battle.stage, this.battle.stage.viewport.initialOrigin);
    const nia = this.battle.unit("1:0");
    this.cursor = nia ? { x: nia.x, y: nia.y } : { ...this.cameraOrigin };
    this.statusMessage = "第一軍團抵達騎士城堡前。";
    if (entry === "deployment") {
      this.stageEventState = createStageEventState(this.battle.stage, [
        "stage-01-prebattle-story",
        "stage-01-enter-deployment",
      ]);
      this.phase = "deployment";
      this.statusMessage = statusMessage ?? "重新選擇第 1 關出場編隊。";
      this.emit();
      return;
    }
    this.initializeStageEventProgress();
    this.emit();
  }

  completeStage1Deployment(deployment: DeploymentResult): void {
    if (this.phase !== "deployment" || !this.stage1Campaign) return;
    const { Stage1Battle } = this.requireStage1Runtime().battle;
    this.battle = new Stage1Battle(
      this.stage1Campaign,
      deployment,
    );
    this.cameraOrigin = clampCameraOrigin(this.battle.stage, this.battle.stage.viewport.initialOrigin);
    const nia = this.battle.unit("1:0");
    this.cursor = nia ? { x: nia.x, y: nia.y } : { ...this.cameraOrigin };
    this.resetAction();
    this.statusMessage = `部署完成：${deployment.placements.length} 人編隊已建立。`;
    const events = this.consumeStageTrigger({ type: "battle-started" });
    void this.processStageEvents(events).then(() => this.emit());
  }

  async enterStage2(campaign: CampaignState = {
    ...this.battle.campaignSnapshot(),
    stageId: "stage-02",
  }, statusMessage = "第一軍團繼續向騎士團堡推進。") : Promise<void> {
    const runtime = await this.loadStage2Runtime();
    this.stageEntrySnapshot = cloneCampaignState({ ...campaign, stageId: "stage-02" });
    this.stage1Campaign = undefined;
    this.battle = new runtime.battle.Stage2Battle(this.stageEntrySnapshot);
    this.difficulty = campaign.difficulty;
    this.campaignRoute = "stage-02";
    this.activeStoryId = undefined;
    this.stageEventState = createStageEventState(this.battle.stage);
    this.resetAction();
    this.cameraOrigin = clampCameraOrigin(this.battle.stage, this.battle.stage.viewport.initialOrigin);
    const nia = this.battle.unit("1:0");
    this.cursor = nia ? { x: nia.x, y: nia.y } : { ...this.cameraOrigin };
    this.phase = "player";
    this.statusMessage = statusMessage;
    const events = this.consumeStageTrigger({ type: "battle-started" });
    await this.processStageEvents(events);
    this.emit();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get currentDialogue(): DialoguePage | undefined {
    if (this.aiTechniqueDialogue) return this.aiTechniqueDialogue.page;
    if (this.groupCommandDialogueId) {
      return groupCommandDialogueFor(this.groupCommandDialogueId);
    }
    const promotionUnit = this.promotionUnit;
    if (promotionUnit && this.promotionDialogueIndex !== undefined) {
      return promotionDialogueFor(promotionUnit)[this.promotionDialogueIndex];
    }
    if (!this.activeStoryId || !isStoryPhase(this.phase)) return undefined;
    return storyPagesForId(this.activeStoryId)[this.dialogueIndex];
  }

  get focusedUnit(): BattleUnit | undefined {
    if (this.phase === "player") return this.selectedUnit ?? this.battle.unitAt(this.cursor);
    return this.battle.focus;
  }

  get terrainInspection(): TerrainInspection | undefined {
    const position = this.terrainInspectionPosition;
    if (!position) return undefined;
    const referenceUnit = this.battle.focus;
    return inspectTerrain(
      position,
      this.battle.terrainSlotAt(position),
      referenceUnit,
      referenceUnit ? this.unitStats(referenceUnit) : undefined,
      this.battle.stage.id,
    );
  }

  get selectedUnit(): BattleUnit | undefined {
    return this.selectedId ? this.battle.unit(this.selectedId) : undefined;
  }

  get promotionUnit(): BattleUnit | undefined {
    const id = this.promotionUnitIds[0];
    return id ? this.battle.unit(id) : undefined;
  }

  get promotionDialogueActive(): boolean {
    return this.promotionUnit !== undefined && this.promotionDialogueIndex !== undefined;
  }

  get groupCommandDialogueActive(): boolean {
    return this.groupCommandDialogueId !== undefined;
  }

  get aiTechniqueDialogueActive(): boolean {
    return this.aiTechniqueDialogue !== undefined;
  }

  get promotionChoiceVisible(): boolean {
    return this.promotionUnit !== undefined && !this.promotionDialogueActive;
  }

  get promotionTargets(): readonly PromotionTarget[] {
    return this.promotionUnit
      ? promotionTargetsFor(this.promotionUnit.classId)
      : [];
  }

  get selectedPromotionTarget(): PromotionTarget | undefined {
    return this.promotionTargets[this.promotionSelectionIndex];
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
      || this.retreatConfirmOpen
      || this.aiTechniqueDialogueActive
      || this.groupCommandDialogueActive
      || this.promotionUnitIds.length > 0;
  }

  get groupLeader(): BattleUnit | undefined {
    const cursorUnit = this.battle.unitAt(this.cursor);
    if (cursorUnit && this.battle.isPlayerControllableAlly(cursorUnit.id)
      && !cursorUnit.acted && !cursorUnit.actionDisabled) return cursorUnit;

    // The tactical desk is only visible while the pointer cursor is over an
    // empty cell. Keep that presentation hover separate from the battle's
    // retained unit focus, as the native side-panel path does.
    const retainedUnit = this.battle.focus;
    return retainedUnit && this.battle.isPlayerControllableAlly(retainedUnit.id)
      && !retainedUnit.acted && !retainedUnit.actionDisabled
      ? retainedUnit
      : undefined;
  }

  get followLeaderAvailable(): boolean {
    return this.groupLeader !== undefined;
  }

  get commandMenuKind(): "initial" | "postMove" {
    return this.pendingPath ? "postMove" : "initial";
  }

  get unitCommands(): readonly UnitCommand[] {
    const selectedClassCommand = this.selectedUnit
      ? CLASS_COMMANDS[this.selectedUnit.classId]
      : undefined;
    const classCommand = selectedClassCommand?.id === "technique"
      && this.selectedUnit?.statuses.techniqueSeal
      ? undefined
      : selectedClassCommand;
    if (this.commandMenuKind === "postMove") {
      return classCommand?.id === "shoot"
        ? [POST_MOVE_COMMANDS[0], classCommand, ...POST_MOVE_COMMANDS.slice(1)]
        : POST_MOVE_COMMANDS;
    }
    return classCommand
      ? [BASIC_COMMANDS[0], BASIC_COMMANDS[1], classCommand, BASIC_COMMANDS[2]]
      : BASIC_COMMANDS;
  }

  get techniqueActions(): readonly BattleActionId[] {
    return this.selectedUnit?.classId === "sister"
      ? SISTER_TECHNIQUES
      : this.selectedUnit?.classId === "magician"
        ? MAGICIAN_TECHNIQUES
        : this.selectedUnit?.classId === "magic-priest"
          && this.selectedUnit.experience >= MAGIC_PRIEST_TIER3_EXPERIENCE
          ? MAGIC_PRIEST_TIER3_TECHNIQUES
        : [];
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

  get isDebugMode(): boolean {
    return this.debugMode;
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
    if (this.groupCommandDialogueId) {
      const command = this.groupCommandDialogueId;
      const leaderId = this.groupCommandLeaderId;
      this.groupCommandDialogueId = undefined;
      this.groupCommandLeaderId = undefined;
      if (command === "allRest") void this.executeAllRest();
      else if (command === "followLeader" && leaderId) void this.executeFollowLeader(leaderId);
      else if (command === "freeAction") void this.executeFreeAction();
      return;
    }
    const promotionUnit = this.promotionUnit;
    if (promotionUnit && this.promotionDialogueIndex !== undefined) {
      const pages = promotionDialogueFor(promotionUnit);
      if (this.promotionDialogueIndex < pages.length - 1) {
        this.promotionDialogueIndex += 1;
      } else {
        this.promotionDialogueIndex = undefined;
        this.statusMessage = `${promotionUnit.name}達到轉職條件；必須選擇下一職業。`;
      }
      this.emit();
      return;
    }
    if (!isStoryPhase(this.phase) || !this.activeStoryId) return;
    const pages = storyPagesForId(this.activeStoryId);
    if (this.dialogueIndex < pages.length - 1) {
      this.dialogueIndex += 1;
      this.emit();
      return;
    }
    this.completeDialogue();
  }

  skipDialogue(): void {
    if (this.groupCommandDialogueActive) this.advanceDialogue();
    else if (isStoryPhase(this.phase)) this.completeDialogue();
  }

  private completeDialogue(): void {
    const completed = this.phase;
    const storyId = this.activeStoryId;
    if (!storyId || !isStoryPhase(completed)) return;
    this.activeStoryId = undefined;
    this.dialogueIndex = 0;
    const events = this.consumeStageTrigger({ type: "story-completed", storyId });
    if (events.length > 0) {
      void this.processStageEvents(events).then(() => this.emit());
    } else if (completed === "openingStory" || completed === "round2Story") {
      this.phase = "player";
      this.statusMessage = completed === "openingStory" ? "我方回合：選擇一名尚未行動的單位。" : "第 2 回合開始。";
      this.emit();
    } else if (completed === "victoryStory") {
      this.phase = "victoryFeedback";
      this.emit();
    }
  }

  private initializeStageEventProgress(): void {
    this.stageEventState = createStageEventState(this.battle.stage);
    const events = this.consumeStageTrigger({ type: "campaign-entered" });
    void this.processStageEvents(events);
  }

  private consumeStageTrigger(trigger: StageEventTrigger): readonly StageEventDefinition[] {
    const dispatched = dispatchStageEvents(this.battle.stage, this.stageEventState, trigger);
    this.stageEventState = dispatched.state;
    return dispatched.events;
  }

  private async processStageEvents(events: readonly StageEventDefinition[]): Promise<void> {
    for (const event of events) {
      if (event.simulationEffect !== "none") {
        await this.executeStageSimulationEffect(event.simulationEffect);
      }
      this.applyStagePresentation(event.presentation);
      if (event.simulationEffect !== "none") {
        const chained = this.consumeStageTrigger({
          type: "effect-completed",
          effectId: event.simulationEffect,
        });
        await this.processStageEvents(chained);
      }
    }
  }

  private async executeStageSimulationEffect(
    effectId: Exclude<StageSimulationEffectId, "none">,
  ): Promise<void> {
    const definition = stageSimulationEffectFor(effectId);
    if (!definition) throw new Error(`Missing stage simulation effect: ${effectId}`);
    if (definition.type === "scripted-unit-move") {
      await this.runScriptedUnitMove(definition);
      return;
    }
    if (definition.type === "enter-deployment") {
      this.phase = "deployment";
      this.statusMessage = "選擇第 1 關出場編隊。";
      return;
    }
    if (definition.type === "victory-state") {
      this.stageProgress = definition.value;
      return;
    }
    if (definition.type === "messenger-arrival") {
      await this.runStage1MessengerArrival(definition);
      return;
    }
    this.campaignRoute = definition.destination;
    if (definition.destination === "stage-01" && this.battle.stage.id === "stage-00") {
      await this.enterStage1({ ...this.battle.campaignSnapshot(), stageId: "stage-01" });
      return;
    }
    if (definition.destination === "stage-02" && this.battle.stage.id === "stage-01") {
      await this.enterStage2({ ...this.battle.campaignSnapshot(), stageId: "stage-02" });
      return;
    }
    if (definition.destination === "stage-03") this.stageProgress = 1000;
    this.phase = "nextStage";
  }

  private applyStagePresentation(presentation: StagePresentationId): void {
    if (presentation === "none" || presentation === "stage-00-opening-move"
      || presentation === "stage-01-messenger-arrival") return;
    const phase = storyPhaseForStageStory(this.battle.stage, presentation);
    if (!phase) throw new Error(`Story presentation does not belong to ${this.battle.stage.id}: ${presentation}`);
    this.activeStoryId = presentation;
    this.phase = phase;
    this.dialogueIndex = 0;
  }

  private async runScriptedUnitMove(
    definition: Extract<
      NonNullable<ReturnType<typeof stageSimulationEffectFor>>,
      { type: "scripted-unit-move" }
    >,
  ): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.phase = "scriptedMove";
    this.statusMessage = definition.statusText;
    const actor = this.battle.units.find(
      (unit) => unit.side === definition.actor.side && unit.slot === definition.actor.slot,
    );
    if (!actor) {
      this.busy = false;
      return;
    }
    const path = this.battle.scriptedPath(actor.id, definition.destination, definition.movementBudget);
    this.battle.focusId = actor.id;
    this.cursor = { x: actor.x, y: actor.y };
    this.centerCamera(actor);
    this.emit();
    await this.animateUnitPath(actor.id, path, "scripted");
    actor.x = definition.destination.x;
    actor.y = definition.destination.y;
    this.cameraOrigin = clampCameraOrigin(this.battle.stage, this.battle.stage.viewport.initialOrigin);
    this.cursor = { ...definition.destination };
    this.busy = false;
  }

  private async runStage1MessengerArrival(
    definition: Extract<
      NonNullable<ReturnType<typeof stageSimulationEffectFor>>,
      { type: "messenger-arrival" }
    >,
  ): Promise<void> {
    const target = this.battle.units.find(
      (unit) => unit.side === 1 && unit.portrait === definition.targetPortrait,
    );
    if (!target) throw new Error("stage 1 messenger target is missing");
    let messenger = this.battle.unit(`${definition.actor.side}:${definition.actor.slot}`);
    if (!messenger) {
      messenger = {
        id: `${definition.actor.side}:${definition.actor.slot}`,
        side: definition.actor.side,
        slot: definition.actor.slot,
        classId: "soldier",
        className: className("soldier"),
        name: "第四軍團傳令兵",
        portrait: 47,
        x: definition.from.x,
        y: definition.from.y,
        life: 160,
        experience: 0,
        acted: true,
        actionDisabled: false,
        statuses: {
          attackUp: 0,
          defenseUp: 0,
          magicGuard: 0,
          confusion: 0,
          attackDown: 0,
          defenseDown: 0,
          poison: 0,
          techniqueSeal: 0,
        },
      };
      messenger.life = this.battle.statsFor(messenger).maxLife;
      this.battle.units.push(messenger);
    }
    this.busy = true;
    this.phase = "scriptedMove";
    this.statusMessage = "第四軍團傳令兵趕到妮雅身邊……";
    this.battle.focusId = messenger.id;
    this.cursor = { x: messenger.x, y: messenger.y };
    this.centerCamera(messenger);
    const path = this.battle.scriptedPath(messenger.id, target, definition.movementBudget);
    this.emit();
    await this.animateUnitPath(messenger.id, path, "scripted");
    this.battle.focusId = target.id;
    this.cursor = { x: target.x, y: target.y };
    this.centerCamera(target);
    this.busy = false;
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

    if (this.actionMode === "specialTarget") {
      if (
        this.selectedActionId
        && this.targets.some((target) => positionKey(target) === positionKey(position))
      ) {
        void this.commitSpecialAction(position);
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

    if (this.actionMode === "actionMenu" || this.actionMode === "techniqueMenu") return;
    if (this.actionMode === "enemyPreview" || this.actionMode === "allyPreview") this.resetAction();
    if (!unit) {
      this.terrainInspectionPosition = { ...position };
      const reference = this.battle.focus;
      this.statusMessage = reference
        ? `顯示此格對${reference.name}（${reference.className}）的地形特性。`
        : "顯示此格的地形特性；選擇單位後可查看職業適性。";
      this.emit();
      return;
    }
    this.terrainInspectionPosition = undefined;
    this.battle.focusId = unit.id;
    if (unit.side === 2) {
      this.selectedId = unit.id;
      this.reachable = this.battle.enemyMovementRange(unit.id);
      this.actionMode = "enemyPreview";
      this.statusMessage = "紅色格為敵軍目前行為採用的移動或警戒範圍；預覽不會改變戰鬥狀態。";
    } else if (!this.battle.isPlayerControllableAlly(unit.id)) {
      this.selectedId = unit.id;
      this.reachable = this.battle.reachableCells(unit.id);
      this.actionMode = "allyPreview";
      this.statusMessage = "藍色格為友軍自動單位的目前移動範圍；它會在玩家手動階段結束後自行行動。";
    } else if (!unit.acted && !unit.actionDisabled) {
      this.selectedId = unit.id;
      this.pendingOrigin = { x: unit.x, y: unit.y };
      this.pendingPath = undefined;
      this.reachable = [];
      this.commandIndex = 0;
      this.actionMode = "actionMenu";
      this.statusMessage = `選擇${unit.className}的行動。`;
    } else if (unit.actionDisabled) {
      this.statusMessage = "此單位正被冰封，本次我方階段不能行動，也不能被攻擊或治療。";
    } else {
      this.statusMessage = "此單位本回合已行動。";
    }
    this.emit();
  }

  focusCell(position: Position): void {
    if (
      this.phase !== "player"
      || !["idle", "move", "target", "specialTarget"].includes(this.actionMode)
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
    this.reachable = this.battle.reachableCells(unit.id);
    this.actionMode = "move";
    this.statusMessage = "藍色格為可移動範圍；可選原格保留位置。";
    this.emit();
  }

  chooseAttack(): void {
    const unit = this.selectedUnit;
    if (this.phase !== "player" || this.actionMode !== "actionMenu" || !unit) return;
    this.targets = this.battle.units
      .filter((candidate) => candidate.side !== unit.side
        && !candidate.actionDisabled
        && manhattan(unit, candidate) === 1)
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

  chooseShoot(): void {
    if (this.selectedUnit?.classId !== "archer") return;
    this.chooseSpecialAction("archer-shot");
  }

  chooseTechnique(): void {
    const unit = this.selectedUnit;
    if (
      this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || this.commandMenuKind !== "initial"
      || !unit
      || CLASS_COMMANDS[unit.classId]?.id !== "technique"
      || unit.statuses.techniqueSeal > 0
    ) return;
    this.techniqueIndex = 0;
    this.actionMode = "techniqueMenu";
    this.statusMessage = `選擇${unit.className}要施展的技術。`;
    this.emit();
  }

  moveTechniqueSelection(delta: number): void {
    if (this.actionMode !== "techniqueMenu" || this.techniqueActions.length === 0) return;
    this.techniqueIndex = (
      this.techniqueIndex + delta + this.techniqueActions.length
    ) % this.techniqueActions.length;
    this.emit();
  }

  selectTechnique(index: number): void {
    if (
      this.actionMode !== "techniqueMenu"
      || index < 0
      || index >= this.techniqueActions.length
      || index === this.techniqueIndex
    ) return;
    this.techniqueIndex = index;
    this.emit();
  }

  activateTechniqueSelection(): void {
    if (this.actionMode !== "techniqueMenu") return;
    const actionId = this.techniqueActions[this.techniqueIndex];
    if (actionId) this.chooseSpecialAction(actionId);
  }

  private chooseSpecialAction(actionId: BattleActionId): void {
    const unit = this.selectedUnit;
    if (
      this.phase !== "player"
      || (this.actionMode !== "actionMenu" && this.actionMode !== "techniqueMenu")
      || !unit
    ) return;
    this.selectedActionId = actionId;
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    if (definition.target === "self-area") {
      this.actionRange = [];
      this.targets = [];
      this.cursor = { x: unit.x, y: unit.y };
      void this.commitSpecialAction(this.cursor);
      return;
    }
    this.actionRange = this.battle.actionRange(unit.id, actionId).cells();
    this.targets = this.battle.actionTargetCells(unit.id, actionId);
    if (this.targets.length === 0) {
      this.actionRange = [];
      this.selectedActionId = undefined;
      this.statusMessage = `「${definition.label}」範圍內沒有合法目標。`;
      this.emit();
      return;
    }
    this.actionMode = "specialTarget";
    this.statusMessage = `選擇「${definition.label}」的${definition.target === "ally" ? "我方" : "敵方"}目標。`;
    this.emit();
  }

  chooseRest(): void {
    const unit = this.selectedUnit;
    if (
      !unit
      || this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || this.commandMenuKind !== "initial"
      || this.busy
    ) return;
    void this.commitRest(unit);
  }

  private async commitRest(unit: BattleUnit): Promise<void> {
    const presentationUnit = { ...unit, statuses: { ...unit.statuses } };
    this.busy = true;
    this.resetAction();
    this.statusMessage = `${unit.name}正在休息……`;
    this.emit();
    try {
      await this.presentRest(presentationUnit);
      const recovered = this.battle.rest(unit.id);
      this.busy = false;
      this.finishUnitAction(
        recovered > 0 ? `休息恢復 ${recovered} 點生命。` : "休息完成；生命已滿。",
        true,
      );
    } catch (error) {
      this.busy = false;
      this.restPresentation = undefined;
      this.statusMessage = error instanceof Error ? error.message : "休息無效。";
      this.emit();
    }
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
    else if (command.id === "shoot") this.chooseShoot();
    else if (command.id === "technique") this.chooseTechnique();
    else if (command.id === "rest") this.chooseRest();
    else if (command.id === "end") this.chooseEnd();
    else if (command.id === "undo") this.chooseUndo();
  }

  movePromotionSelection(delta: number): void {
    if (this.promotionDialogueActive) return;
    const targets = this.promotionTargets;
    if (targets.length === 0 || delta === 0) return;
    this.promotionSelectionIndex = (
      this.promotionSelectionIndex + delta + targets.length
    ) % targets.length;
    this.emit();
  }

  selectPromotionTarget(index: number): void {
    if (
      this.promotionUnitIds.length === 0
      || this.promotionDialogueActive
      || index < 0
      || index >= this.promotionTargets.length
      || index === this.promotionSelectionIndex
    ) return;
    this.promotionSelectionIndex = index;
    this.emit();
  }

  confirmPromotion(): void {
    if (this.promotionDialogueActive) return;
    const unit = this.promotionUnit;
    const target = this.selectedPromotionTarget;
    if (!unit || !target) return;
    const previousClassName = unit.className;
    const result = this.battle.promote(unit.id, target.id);
    this.promotionUnitIds.shift();
    this.promotionSelectionIndex = 0;
    this.statusMessage = `${unit.name}已由${previousClassName}轉職為${unit.className}；經驗歸零，生命保持 ${result.life}。`;

    const next = this.promotionUnit;
    if (next) {
      this.promotionDialogueIndex = 0;
      this.battle.focusId = next.id;
      this.cursor = { x: next.x, y: next.y };
      this.centerCamera(next);
      this.statusMessage = `${next.name}也達到轉職條件；必須選擇下一職業。`;
      this.emit();
      return;
    }

    const resume = this.promotionResume;
    this.promotionDialogueIndex = undefined;
    this.promotionResume = undefined;
    this.emit();
    resume?.();
  }

  cancelAction(): void {
    if (this.actionMode === "target") {
      this.actionMode = "actionMenu";
      this.targets = [];
    } else if (this.actionMode === "specialTarget") {
      const returnToTechnique = this.selectedActionId !== "archer-shot";
      this.actionRange = [];
      this.targets = [];
      this.selectedActionId = undefined;
      this.actionMode = returnToTechnique ? "techniqueMenu" : "actionMenu";
    } else if (this.actionMode === "techniqueMenu") {
      this.techniqueIndex = 0;
      this.actionMode = "actionMenu";
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
    } else if (this.actionMode === "enemyPreview" || this.actionMode === "allyPreview") {
      this.resetAction();
    }
    this.statusMessage = "已返回上一層。";
    this.emit();
  }

  private async commitSpecialAction(position: Position): Promise<void> {
    const actor = this.selectedUnit;
    const actionId = this.selectedActionId;
    const definition = actionId ? BATTLE_ACTION_DEFINITIONS[actionId] : undefined;
    const target = definition?.target === "self-area" ? undefined : this.battle.unitAt(position);
    if (!actor || !actionId || !definition || this.busy) return;
    if (definition.target !== "self-area" && !target) return;
    try {
      const prepared = this.battle.prepareSpecialAction({
        actionId,
        actorId: actor.id,
        targetId: target?.id,
        target: definition.target === "self-area" ? undefined : position,
      });
      const actorPresentation = { ...actor, statuses: { ...actor.statuses } };
      const targetPresentation = target
        ? { ...target, statuses: { ...target.statuses } }
        : undefined;
      const affectedPresentations = prepared.affectedUnits
        .map(({ unitId }) => this.battle.unit(unitId))
        .filter((unit): unit is BattleUnit => unit !== undefined)
        .map((unit) => ({ ...unit, statuses: { ...unit.statuses } }));
      this.busy = true;
      this.statusMessage = `${actor.name}施展${BATTLE_ACTION_DEFINITIONS[actionId].label}……`;
      this.resetAction();
      this.markHintSeen();
      this.emit();

      await this.presentSpecialAction(actorPresentation, targetPresentation, prepared.result);
      this.lastSpecialAction = this.battle.commitPreparedAction(prepared);
      const result = this.lastSpecialAction;
      for (const affected of result.affectedUnits.filter(({ died }) => died)) {
        const presentation = affectedPresentations.find(({ id }) => id === affected.unitId);
        if (presentation) await this.presentSpecialDeath(actorPresentation, presentation, result);
      }
      const moved = result.affectedUnits.filter(({ moved }) => moved).length;
      const frozen = result.affectedUnits.filter(({ actionDisabledBefore, actionDisabledAfter }) =>
        !actionDisabledBefore && actionDisabledAfter).length;
      const cleansedFrozen = actionId === "dispel"
        && result.affectedUnits.some(({ actionDisabledBefore, actionDisabledAfter }) =>
          actionDisabledBefore && !actionDisabledAfter);
      this.statusMessage = actionId === "ice-1"
        ? `冰雪擊退 ${moved} 名敵人，冰封 ${frozen} 名；其下一次本陣營行動被跳過，期間不能成為攻擊或治療目標。`
        : actionId === "dispel" && targetPresentation
          ? `${targetPresentation.name}的${cleansedFrozen ? "冰封及異常狀態" : "異常狀態"}已由破邪解除。`
        : actionId === "lightning-1"
          ? `落雷對 ${result.affectedUnits.length} 名敵人造成共 ${result.damage} 點傷害。`
          : result.blocked && targetPresentation
            ? `${targetPresentation.name}的魔法防禦抵消了攻擊。`
            : result.healing > 0 && targetPresentation
              ? `${targetPresentation.name}恢復 ${result.healing} 點生命。`
              : targetPresentation
                ? `${targetPresentation.name}受到 ${result.damage} 點傷害。`
                : `${definition.label}完成。`;

      const promotionPause = this.pauseForPromotions();
      if (promotionPause) await promotionPause;
      this.busy = false;
      const ended = this.resolveOutcome();
      this.emit();
      if (!ended && this.battle.playerManualPhaseComplete()) {
        void this.runTurnPhases("autonomous");
      }
    } catch (error) {
      this.busy = false;
      this.specialActionPresentation = undefined;
      this.statusMessage = error instanceof Error ? error.message : "特殊行動無效。";
      this.emit();
    }
  }

  private async presentSpecialAction(
    actor: BattleUnit,
    target: BattleUnit | undefined,
    result: SpecialActionResult,
  ): Promise<void> {
    this.specialActionPresentationTrace = [];
    const displayedLifeByUnitId: Record<string, number> = Object.fromEntries(
      result.affectedUnits.map((affected) => [affected.unitId, affected.lifeBefore]),
    );
    const present = async (
      phase: SpecialActionPresentationPhase,
      frame: number,
      nativeTicks: number,
      lifeChangeUnitId?: string,
    ): Promise<void> => {
      this.specialActionPresentation = {
        actor,
        target,
        center: { ...result.target },
        result,
        phase,
        frame,
        nativeTicks,
        displayedLifeByUnitId: { ...displayedLifeByUnitId },
        lifeChangeUnitId,
      };
      this.specialActionPresentationTrace.push({
        phase,
        frame,
        nativeTicks,
        displayedLifeByUnitId: { ...displayedLifeByUnitId },
        lifeChangeUnitId,
      });
      this.emit();
      await pause(
        phase === "lifeDrain" && this.testMode
          ? 8
          : this.mapCombatDelay(nativeTicks),
      );
    };

    if (result.actionId === "archer-shot") {
      await present("shootBlank", -1, 6);
      for (let frame = 0; frame < 8; frame += 1) {
        await present("shootHit", frame, 6);
      }
      await present("shootBlank", -1, 6);
    } else if (result.actionId === "fire-1") {
      this.queueAudioCue(83, "fire-1-start", "magic");
      for (let frame = 0; frame < 7; frame += 1) {
        await present("fireEffect", frame, 10);
      }
    } else if (result.actionId === "heal-1") {
      this.queueAudioCue(36, "heal-1-start", "e");
      for (let frame = 0; frame < 39; frame += 1) {
        await present("healPrimary", frame, 5);
      }
      await present("healBlank", -1, 5);
      for (let frame = 0; frame < 5; frame += 1) {
        await present("healTail", frame, 15);
      }
    } else if (result.actionId === "lightning-1") {
      const presentation = stage1ActionPresentation();
      let draw = 0;
      for (const phase of presentation.lightning1.phases) {
        for (const _descriptor of phase.descriptorSequence) {
          await present("lightningMain", draw, phase.waitPerDrawNativeTicks);
          draw += 1;
        }
        if (draw === 8) this.queueAudioCue(43, "lightning-1-impact", "e");
      }
      const hit = presentation.lightning1.commonHit;
      for (let iteration = 0; iteration < hit.iterations; iteration += 1) {
        for (let wave = 0; wave < hit.waveDrawsPerIteration; wave += 1) {
          await present("lightningHit", iteration * hit.waveDrawsPerIteration + wave, hit.waitPerWaveDrawNativeTicks);
        }
      }
      for (let frame = 0; frame < hit.cleanup.drawCount; frame += 1) {
        await present("lightningCleanup", frame, hit.cleanup.waitPerDrawNativeTicks);
      }
    } else if (result.actionId === "ice-1") {
      const ice = stage1ActionPresentation().ice1;
      for (let cycle = 0; cycle < ice.cycles; cycle += 1) {
        this.queueAudioCue(50, `ice-1-cycle-${cycle + 1}`, "un");
        for (let frame = 0; frame < ice.cycle.drawCount; frame += 1) {
          await present("iceExpansion", cycle * ice.cycle.drawCount + frame, ice.cycle.waitPerDrawNativeTicks);
        }
      }
    } else {
      const dispel = stage1ActionPresentation().dispel;
      let frame = 0;
      for (const phase of dispel.phases) {
        for (let draw = 0; draw < phase.drawCount; draw += 1) {
          await present("dispelEffect", frame, phase.waitPerDrawNativeTicks);
          frame += 1;
        }
      }
    }

    // Native fire and common-shooting handlers run only after their fixed
    // graphics timeline, then redraw once per successfully removed life point.
    // Keep this evidence-tagged step as a read-only projection until the
    // prepared result is atomically committed below the presentation boundary.
    const definition = BATTLE_ACTION_DEFINITIONS[result.actionId];
    if (
      "damagePresentation" in definition
      && definition.damagePresentation.mode === "post-graphics-point-drain"
    ) {
      for (const affected of result.affectedUnits) {
        for (
          let applied = 1;
          displayedLifeByUnitId[affected.unitId] > affected.lifeAfter;
          applied += 1
        ) {
          displayedLifeByUnitId[affected.unitId] -= 1;
          await present(
            "lifeDrain",
            applied,
            definition.damagePresentation.waitPerPointNativeTicks,
            affected.unitId,
          );
        }
      }
    }
    this.specialActionPresentation = undefined;
  }

  private async presentSpecialDeath(
    actor: BattleUnit,
    target: BattleUnit,
    result: SpecialActionResult,
  ): Promise<void> {
    for (let frame = 0; frame < 15; frame += 1) {
      this.specialActionPresentation = {
        actor,
        target,
        center: { x: target.x, y: target.y },
        result,
        phase: "specialDeath",
        frame,
        nativeTicks: 10,
        displayedLifeByUnitId: Object.fromEntries(
          result.affectedUnits.map((affected) => [affected.unitId, affected.lifeAfter]),
        ),
      };
      this.specialActionPresentationTrace.push({
        phase: "specialDeath",
        frame,
        nativeTicks: 10,
        displayedLifeByUnitId: Object.fromEntries(
          result.affectedUnits.map((affected) => [affected.unitId, affected.lifeAfter]),
        ),
      });
      this.emit();
      await pause(this.mapCombatDelay(10));
    }
    this.specialActionPresentation = undefined;
  }

  private async presentRest(unit: BattleUnit): Promise<void> {
    this.restPresentationTrace = [];
    const present = async (
      phase: RestPresentationPhase,
      frame: number,
      nativeTicks: number,
    ): Promise<void> => {
      this.restPresentation = { unit, phase, frame, nativeTicks };
      this.restPresentationTrace.push({ unit, phase, frame, nativeTicks });
      this.emit();
      await pause(this.testMode ? 120 : this.mapCombatDelay(nativeTicks));
    };

    // Native player and AI rest both enter 1000:5D12: MAGIC/0 tile codes
    // 1..5 at 15 ticks each, followed by a blank cleanup descriptor. This is
    // the same visible sequence as the healing family's common finish, but it
    // deliberately has no E/36 healing sound request.
    for (let frame = 0; frame < STAGE0_REST_PRESENTATION.frameCount; frame += 1) {
      await present(
        "restEffect",
        frame,
        STAGE0_REST_PRESENTATION.waitPerFrameNativeTicks,
      );
    }
    await present(
      "restBlank",
      -1,
      STAGE0_REST_PRESENTATION.cleanupWaitNativeTicks,
    );
    this.restPresentation = undefined;
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
      const promotionPause = this.pauseForPromotions();
      if (promotionPause) await promotionPause;
      this.busy = false;
      const ended = this.resolveOutcome();
      this.emit();
      if (!ended && this.battle.playerManualPhaseComplete()) {
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
    const promotionPause = this.pauseForPromotions();
    if (promotionPause) {
      void promotionPause.then(() => this.completeFinishedUnitAction(allowAutomaticEnd));
      return;
    }
    this.completeFinishedUnitAction(allowAutomaticEnd);
  }

  private completeFinishedUnitAction(allowAutomaticEnd: boolean): void {
    const outcome = this.resolveOutcome();
    if (outcome || !allowAutomaticEnd) {
      this.emit();
      return;
    }
    this.emit();
    if (this.battle.playerManualPhaseComplete()) {
      void this.runTurnPhases("autonomous");
    }
  }

  private pauseForPromotions(): Promise<void> | undefined {
    const unitIds = this.battle.promotionQueue();
    if (unitIds.length === 0) return undefined;
    this.promotionUnitIds = unitIds;
    this.promotionDialogueIndex = 0;
    this.promotionSelectionIndex = 0;
    this.resetAction();
    const unit = this.promotionUnit;
    if (!unit) {
      this.promotionUnitIds = [];
      this.promotionDialogueIndex = undefined;
      return undefined;
    }
    this.battle.focusId = unit.id;
    this.cursor = { x: unit.x, y: unit.y };
    this.centerCamera(unit);
    this.statusMessage = `${unit.name}達到轉職條件；必須選擇下一職業。`;
    const resumeBusy = this.busy;
    this.busy = false;
    this.emit();
    return new Promise<void>((resolve) => {
      this.promotionResume = () => {
        this.busy = resumeBusy;
        resolve();
      };
    });
  }

  private resetAction(): void {
    this.actionMode = "idle";
    this.selectedId = undefined;
    this.commandIndex = 0;
    this.pendingOrigin = undefined;
    this.pendingPath = undefined;
    this.reachable = [];
    this.targets = [];
    this.actionRange = [];
    this.selectedActionId = undefined;
    this.techniqueIndex = 0;
    this.minimapPreviewOrigin = undefined;
    this.terrainInspectionPosition = undefined;
  }

  openGroupCommands(): void {
    if (
      this.phase !== "player"
      || this.busy
      || this.hasBlockingOverlay
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
    this.terrainInspectionPosition = undefined;
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
    if (
      this.phase !== "player"
      || this.busy
      || this.promotionUnitIds.length > 0
      || this.groupCommandDialogueActive
    ) return;
    this.systemMenuOpen = false;
    this.groupCommandOpen = false;
    this.resetAction();
    this.groupCommandDialogueId = "allRest";
    this.statusMessage = "妮雅下令全軍休息。";
    this.emit();
  }

  private async executeAllRest(): Promise<void> {
    if (this.phase !== "player" || this.busy) return;
    const result = this.battle.restAllUnspentAllies();
    this.statusMessage = `全部休息：${result.count} 名單位提交行動，共恢復 ${result.recovered} 點生命。`;
    this.emit();
    const promotionPause = this.pauseForPromotions();
    if (promotionPause) await promotionPause;
    await this.runTurnPhases("autonomous");
  }

  async followLeader(): Promise<void> {
    if (
      this.phase !== "player"
      || this.busy
      || this.promotionUnitIds.length > 0
      || this.groupCommandDialogueActive
    ) return;
    if (!this.groupLeader) {
      this.statusMessage = "請先把焦點移到一名尚未行動的我方單位，再選擇跟隨主將。";
      this.emit();
      return;
    }
    const leader = this.groupLeader;
    this.systemMenuOpen = false;
    this.groupCommandOpen = false;
    this.resetAction();
    this.groupCommandDialogueId = "followLeader";
    this.groupCommandLeaderId = leader.id;
    this.statusMessage = "妮雅下令其餘部隊跟隨主將。";
    this.emit();
  }

  private async executeFollowLeader(leaderId: string): Promise<void> {
    if (this.phase !== "player" || this.busy) return;
    const leader = this.battle.unit(leaderId);
    if (!leader || leader.side !== 1 || leader.acted || leader.actionDisabled) return;
    this.battle.wait(leader.id);
    this.statusMessage = `${leader.name}成為臨時主將；其餘單位交由我方 AI 行動。`;
    this.emit();
    const promotionPause = this.pauseForPromotions();
    if (promotionPause) await promotionPause;
    await this.runTurnPhases("follow", leader.id);
  }

  async freeAction(): Promise<void> {
    if (
      this.phase !== "player"
      || this.busy
      || this.promotionUnitIds.length > 0
      || this.groupCommandDialogueActive
    ) return;
    this.systemMenuOpen = false;
    this.groupCommandOpen = false;
    this.resetAction();
    this.groupCommandDialogueId = "freeAction";
    this.statusMessage = "妮雅下令其餘部隊自由行動。";
    this.emit();
  }

  private async executeFreeAction(): Promise<void> {
    if (this.phase !== "player" || this.busy) return;
    this.statusMessage = "其餘我方單位進入自由行動。";
    this.emit();
    await this.runTurnPhases("free");
  }

  requestRetreat(): void {
    if (
      this.phase !== "player"
      || this.busy
      || this.promotionUnitIds.length > 0
      || this.groupCommandDialogueActive
    ) return;
    this.systemMenuOpen = false;
    this.groupCommandOpen = false;
    this.terrainInspectionPosition = undefined;
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
    this.restartBattle(this.battle.stage.id === "stage-01"
      ? "全面撤退：返回第 1 關關前流程並重新編隊。"
      : this.battle.stage.id === "stage-02"
        ? "全面撤退：重新建立第 2 關固定編隊。"
        : "全面撤退：重新建立第 0 關固定編隊。");
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

    const allyIds = this.battle.alliedActionOrder(mode !== "autonomous");
    for (const id of allyIds) {
      const automatic = this.battle.alliedBehaviorFor(id) !== 0;
      const action = this.battle.planAlliedAiAction(
        id,
        !automatic && mode === "follow" ? leaderId : undefined,
      );
      if (!action) continue;
      if (await this.runAlliedAiAction(action)) {
        this.busy = false;
        this.emit();
        return;
      }
    }

    await this.presentTurnTransition("enemy");
    this.battle.clearActionState(1);
    // The native side-1 disable array is cleared after the player/ally phase,
    // immediately before enemy scheduling. Side 2 is cleared at next-round start.
    this.battle.clearActionDisableState(1);
    this.phase = "enemy";
    const enemyPhaseUpdate = this.battle.beginEnemyPhase();
    this.statusMessage = enemyPhaseUpdate.activatedGroupIds.includes("castle-guard")
      ? "城堡守軍解除警戒，全軍進入追擊；芳將於下一回合出擊。"
      : this.battle.stage.id === "stage-00"
        ? "敵方階段：騎士團部隊向出口撤離。"
        : "敵方階段：騎士團開始行動。";
    this.emit();
    if (enemyPhaseUpdate.activatedGroupIds.length > 0) {
      await pause(this.mapCombatDelay(40));
    }
    const enemyIds = this.battle.enemyActionOrder();
    for (const id of enemyIds) {
      if (!this.battle.unit(id)) continue;
      if (!this.battle.hasRouteEnemy()) {
        const action = this.battle.planEnemyAiAction(id);
        if (action && await this.runAlliedAiAction(action, "enemy")) {
          this.busy = false;
          this.emit();
          return;
        }
        continue;
      }
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
    await this.presentTurnTransition("player");
    this.battle.startNextRound();
    const nia = this.battle.unit("1:0");
    if (nia) {
      this.cursor = { x: nia.x, y: nia.y };
      this.centerCamera(nia);
    }
    const roundEvents = this.consumeStageTrigger({
      type: "round-started",
      round: this.battle.round,
    });
    await this.processStageEvents(roundEvents);
    if (this.activeStoryId) {
      this.statusMessage = `第 ${this.battle.round} 回合事件`;
    } else {
      this.phase = "player";
      this.statusMessage = `第 ${this.battle.round} 回合開始。`;
    }
    this.busy = false;
    this.emit();
  }

  private async runAlliedAiAction(
    action: AlliedAiAction,
    movementKind: Extract<MovementKind, "allyAuto" | "enemy"> = "allyAuto",
  ): Promise<boolean> {
    let unit = this.battle.unit(action.unitId);
    if (!unit) return this.resolveOutcome();
    this.battle.focusId = unit.id;
    this.cursor = { x: unit.x, y: unit.y };
    this.centerCamera(unit);
    this.statusMessage = `${unit.name}正在自動行動。`;
    this.emit();

    if (
      (action.kind === "move" || action.kind === "attack" || action.kind === "special")
      && action.path.length > 1
    ) {
      await this.animateUnitPath(unit.id, action.path, movementKind);
      unit = this.battle.unit(action.unitId);
      if (!unit) return this.resolveOutcome();
    }

    if (action.kind === "special" && action.targetId && action.actionId) {
      const target = this.battle.unit(action.targetId);
      if (target) {
        try {
          const prepared = this.battle.prepareSpecialAction({
            actionId: action.actionId,
            actorId: unit.id,
            targetId: target.id,
          });
          const actorPresentation = { ...unit, statuses: { ...unit.statuses } };
          const targetPresentation = { ...target, statuses: { ...target.statuses } };
          this.statusMessage = `${unit.name}施展${BATTLE_ACTION_DEFINITIONS[action.actionId].label}。`;
          // Native side-1 autonomous and side-2 enemy techniques share this
          // dialogue path. REMAKE-014 additionally focuses the prepared center.
          await this.focusCameraOnAction(prepared.result.target);
          await this.presentAiTechniqueDialogue(
            actorPresentation,
            action.actionId,
            prepared.result.target,
          );
          await this.presentSpecialAction(actorPresentation, targetPresentation, prepared.result);
          const result = this.battle.commitPreparedAction(prepared);
          this.lastSpecialAction = result;
          if (result.targetDied) {
            await this.presentSpecialDeath(actorPresentation, targetPresentation, result);
          }
          this.statusMessage = result.blocked
            ? `${target.name}的魔法防禦抵消了攻擊。`
            : result.healing > 0
              ? `${unit.name}使${target.name}恢復 ${result.healing} 點生命。`
              : `${unit.name}造成 ${result.damage} 點傷害。`;
        } catch {
          this.aiTechniqueDialogue = undefined;
          this.battle.spendAction(unit.id);
          this.statusMessage = `${unit.name}的特殊行動已失效，改為待命。`;
        }
      } else {
        this.battle.spendAction(unit.id);
      }
    } else if (action.kind === "attack" && action.targetId) {
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
      const presentationUnit = { ...unit, statuses: { ...unit.statuses } };
      await this.presentRest(presentationUnit);
      const recovered = this.battle.rest(unit.id);
      this.statusMessage = `${unit.name}休息，恢復 ${recovered} 點生命。`;
    } else {
      this.battle.spendAction(unit.id);
      this.statusMessage = action.kind === "move" ? `${unit.name}移動完畢。` : `${unit.name}原地待命。`;
    }

    const promotionPause = this.pauseForPromotions();
    if (promotionPause) await promotionPause;
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
    // presentation is a single measured timeline sampled against a clock.
    // Camera and panel timing remain wall-clock driven, while profession poses
    // and projectile positions preserve the original discrete renderer steps.
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

  private queueAudioCue(
    record: number,
    reason: string,
    group: AudioCueGroup = "e",
  ): void {
    const cue = { sequence: ++this.audioCueSequence, group, record, reason };
    this.audioCue = cue;
    this.audioCueLog.push(cue);
  }

  private mapCombatDelay(nativeTicks: number): number {
    if (this.testMode) return Math.max(4, nativeTicks * 4);
    if (this.presentationFast) return Math.max(3, Math.round(nativeTicks * 2.5));
    return nativeTicks * 10;
  }

  private async presentTurnTransition(side: TurnTransitionSide): Promise<void> {
    this.turnTransitionPresentationTrace = [];
    const hold: TurnTransitionPresentation = {
      side,
      phase: "hold",
      frame: -1,
      nativeTicks: TURN_TRANSITION_HOLD_NATIVE_TICKS,
    };
    this.turnTransitionPresentation = hold;
    this.turnTransitionPresentationTrace.push(hold);
    this.emit();
    await pause(this.mapCombatDelay(hold.nativeTicks));

    for (const frame of turnTransitionFrames(side)) {
      const presentation: TurnTransitionPresentation = { ...frame, phase: "motion" };
      this.turnTransitionPresentation = presentation;
      this.turnTransitionPresentationTrace.push(presentation);
      this.emit();
      await pause(this.mapCombatDelay(frame.nativeTicks));
    }

    // The caller advances simulation/phase state immediately after the native
    // runner exits. Let that single update remove the visual and publish the
    // new side, avoiding an intermediate blank notification.
    this.turnTransitionPresentation = undefined;
  }

  openObjectives(): void {
    if (
      this.busy
      || this.promotionUnitIds.length > 0
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
    this.terrainInspectionPosition = undefined;
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
    this.terrainInspectionPosition = undefined;
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
    this.terrainInspectionPosition = undefined;
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
    this.terrainInspectionPosition = undefined;
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
    if (this.promotionUnitIds.length > 0 || this.groupCommandDialogueActive) return;
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
    if (this.promotionUnitIds.length > 0) return true;
    if (this.groupCommandDialogueActive) return true;
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
    else if (this.terrainInspectionPosition) this.closeTerrainInspection();
    else if (this.phase === "player" && this.actionMode !== "idle") {
      if (!this.busy) this.cancelAction();
    } else return false;
    return true;
  }

  closeTerrainInspection(): void {
    if (!this.terrainInspectionPosition) return;
    this.terrainInspectionPosition = undefined;
    this.statusMessage = "已關閉地形特性；返回戰場。";
    this.emit();
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
    const allies = this.battle.units.filter((unit) => this.battle.isPlayerControllableAlly(unit.id));
    const anchorIndex = allies.findIndex((unit) => unit.id === anchorId);
    let next = allies.find((unit) => !unit.acted && !unit.actionDisabled);
    for (let offset = 1; offset <= allies.length; offset += 1) {
      const candidate = allies[(anchorIndex + offset + allies.length) % allies.length];
      if (candidate && !candidate.acted && !candidate.actionDisabled) {
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

  toggleAiDialogue(): void {
    this.aiDialogueEnabled = !this.aiDialogueEnabled;
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
    this.restartBattle(this.battle.stage.id === "stage-01"
      ? "重新開始第 1 關關前流程。"
      : this.battle.stage.id === "stage-02"
        ? "重新建立第 2 關固定編隊。"
        : "重新建立第 0 關固定編隊。");
  }

  private restartBattle(message: string): void {
    if (this.battle.stage.id === "stage-02") {
      void this.enterStage2(cloneCampaignState(this.stageEntrySnapshot), message);
      return;
    }
    const stage1Campaign = this.battle.stage.id === "stage-01"
      ? cloneCampaignState(this.stageEntrySnapshot)
      : undefined;
    if (stage1Campaign) {
      this.movementPresentation = undefined;
      this.systemMenuOpen = false;
      this.settingsOpen = false;
      this.soundSettingsOpen = false;
      this.musicSettingsOpen = false;
      this.recordMenuMode = undefined;
      this.quitConfirmOpen = false;
      this.groupCommandOpen = false;
      this.retreatConfirmOpen = false;
      this.objectiveOpen = false;
      this.promotionUnitIds = [];
      this.promotionDialogueIndex = undefined;
      this.promotionResume = undefined;
      this.busy = false;
      void this.enterStage1(stage1Campaign, "deployment", message);
      return;
    }
    this.battle = Stage0Battle.fromCampaignEntry(this.stageEntrySnapshot);
    this.difficulty = this.stageEntrySnapshot.difficulty;
    this.campaignRoute = undefined;
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
    this.groupCommandDialogueId = undefined;
    this.groupCommandLeaderId = undefined;
    this.retreatConfirmOpen = false;
    this.retreatConfirmIndex = 1;
    this.objectiveOpen = false;
    this.promotionUnitIds = [];
    this.promotionDialogueIndex = undefined;
    this.promotionSelectionIndex = 0;
    this.promotionResume = undefined;
    this.resetAction();
    this.cameraOrigin = { x: 6, y: 20 };
    const focus = this.battle.focus;
    this.cursor = focus
      ? { x: focus.x, y: focus.y }
      : { ...this.battle.stage.viewport.initialOrigin };
    this.statusMessage = message;
    this.initializeStageEventProgress();
    this.dialogueIndex = this.activeStoryId
      ? storyPagesForId(this.activeStoryId).length - 1
      : 0;
    this.busy = false;
    this.completeDialogue();
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
    if (this.phase === "savePrompt") this.completeVictoryFlow();
  }

  selectSaveSlot(slot: number): void {
    if (this.phase !== "saveSlots" || slot < 1 || slot > SAVE_SLOT_COUNT) return;
    this.writeCompletedSave(slot);
  }

  selectPostSaveSlot(index: number): void {
    if (
      this.phase !== "saveSlots"
      || index < 0
      || index >= SAVE_SLOT_COUNT
      || index === this.postSaveSlotIndex
    ) return;
    this.postSaveSlotIndex = index;
    this.emit();
  }

  movePostSaveSlotPage(delta: number): void {
    if (this.phase !== "saveSlots" || delta === 0) return;
    this.postSaveSlotIndex = moveSaveSlotPage(this.postSaveSlotIndex, delta);
    this.emit();
  }

  cancelPostSaveSlots(): void {
    if (this.phase === "saveSlots") this.completeVictoryFlow();
  }

  confirmOverwrite(): void {
    if (this.pendingSaveSlot) this.writeCompletedSave(this.pendingSaveSlot);
  }

  cancelOverwrite(): void {
    this.pendingSaveSlot = undefined;
    this.emit();
  }

  readSave(slot: number): SaveData | undefined {
    const result = readSaveSlot(localStorage, slot);
    return result.kind === "valid" ? result.save : undefined;
  }

  private writeCompletedSave(slot: number): void {
    const prior = this.readSave(slot);
    const campaign = this.battle.campaignSnapshot();
    const completedStage = this.battle.stage.id;
    const destination = completedStage === "stage-00"
      ? { stageId: "stage-01" as const, stageLabel: "騎士城堡前" as const, stageProgress: 0 as const }
      : completedStage === "stage-01"
        ? { stageId: "stage-02" as const, stageLabel: "救援友軍" as const, stageProgress: 1000 as const }
        : { stageId: "stage-03" as const, stageLabel: "下一關" as const, stageProgress: 1000 as const };
    const save: SaveData = {
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      savedAt: new Date().toISOString(),
      saveCount: (prior?.saveCount ?? 0) + 1,
      stageId: destination.stageId,
      stageLabel: destination.stageLabel,
      ruleset: campaign.ruleset,
      difficulty: campaign.difficulty,
      rngState: campaign.rngState,
      rngCalls: campaign.rngCalls,
      roster: campaign.roster,
      stageProgress: destination.stageProgress,
      consumedEventIds: completedStage === "stage-00"
        ? []
        : this.battle.stage.events.map(({ id }) => id),
    };
    localStorage.setItem(saveSlotKey(slot), JSON.stringify(save));
    this.pendingSaveSlot = undefined;
    this.completeVictoryFlow();
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
    this.recordMenuIndex = moveSaveSlotIndex(this.recordMenuIndex, delta);
    this.emit();
  }

  moveRecordMenuPage(delta: number): void {
    if (!this.recordMenuMode || delta === 0) return;
    this.recordMenuIndex = moveSaveSlotPage(this.recordMenuIndex, delta);
    this.emit();
  }

  selectRecordMenuSlot(index: number): void {
    if (
      !this.recordMenuMode
      || index < 0
      || index >= SAVE_SLOT_COUNT
      || index === this.recordMenuIndex
    ) return;
    this.recordMenuIndex = index;
    this.emit();
  }

  activateRecordMenuSelection(): void {
    if (!this.recordMenuMode) return;
    const slot = this.recordMenuIndex + 1;
    if (this.recordMenuMode === "save") this.writeBattleSave(slot);
    else void this.loadSave(slot);
  }

  private writeBattleSave(slot: number): void {
    const prior = this.readSave(slot);
    const campaign = this.battle.campaignSnapshot();
    const snapshot = this.battle.serializableSnapshot();
    const save: SaveData = {
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      savedAt: new Date().toISOString(),
      saveCount: (prior?.saveCount ?? 0) + 1,
      stageId: this.battle.stage.id,
      stageLabel: this.battle.stage.id === "stage-01"
        ? "騎士城堡前"
        : this.battle.stage.id === "stage-02" ? "救援友軍" : "瓦爾克麗宮",
      ruleset: campaign.ruleset,
      difficulty: campaign.difficulty,
      rngState: campaign.rngState,
      rngCalls: campaign.rngCalls,
      roster: campaign.roster,
      stageProgress: 0,
      consumedEventIds: [...this.stageEventState.consumedEventIds],
      stageEntrySnapshot: cloneCampaignState(this.stageEntrySnapshot),
      battle: {
        phase: "player",
        ...snapshot,
        cursor: { ...this.cursor },
        cameraOrigin: { ...this.cameraOrigin },
      },
    };
    localStorage.setItem(saveSlotKey(slot), JSON.stringify(save));
    this.recordMenuMode = undefined;
    this.recordMenuReturn = undefined;
    this.recordMenuIndex = 0;
    this.statusMessage = `已儲存至記錄 ${slot}。`;
    this.emit();
  }

  private async loadSave(slot: number): Promise<void> {
    const result = readSaveSlot(localStorage, slot);
    if (result.kind !== "valid") {
      this.statusMessage = "此記錄位置沒有可讀取的資料。";
      this.emit();
      return;
    }
    await this.restoreSave(result.save, `已讀取記錄 ${slot}。`);
    this.emit();
  }

  private async restoreSave(save: SaveData, message: string): Promise<void> {
    if (save.kind === "completed") {
      this.recordMenuMode = undefined;
      this.recordMenuReturn = undefined;
      if (save.stageId === "stage-03") {
        this.activeStoryId = undefined;
        this.campaignRoute = "stage-03";
        this.stageProgress = 1000;
        this.phase = "nextStage";
      } else if (save.stageId === "stage-02") {
        await this.enterStage2({
          stageId: "stage-02",
          ruleset: save.ruleset,
          difficulty: save.difficulty,
          roster: save.roster,
          rngState: save.rngState,
          rngCalls: save.rngCalls,
        });
      } else {
        await this.enterStage1({
          stageId: "stage-01",
          ruleset: save.ruleset,
          difficulty: save.difficulty,
          roster: save.roster,
          rngState: save.rngState,
          rngCalls: save.rngCalls,
        });
      }
      this.statusMessage = message;
      return;
    }
    let battle: Stage0Battle;
    if (save.stageId === "stage-02") {
      const runtime = await this.loadStage2Runtime();
      battle = new runtime.battle.Stage2Battle({
        difficulty: save.difficulty,
        roster: save.roster,
        rngState: save.rngState,
        rngCalls: save.rngCalls,
      }, new DeterministicRng(save.rngState, save.rngCalls));
    } else if (save.stageId === "stage-01") {
      const runtime = await this.loadStage1Runtime();
      const deploymentDefinition = runtime.content.STAGE1_DEFINITION.deployment;
      const optionalPlacements = save.battle.units
        .filter(({ side, slot }) => side === 1
          && deploymentDefinition.optionalSlots.some((optionalSlot) => optionalSlot === slot))
        .map(({ slot }, index) => {
          const position = deploymentDefinition.openCells[index];
          if (!position) throw new Error("stage 1 save exceeds deployment cells");
          return { slot, position: { ...position }, fixed: false };
        });
      const deployment: DeploymentResult = {
        placements: [
          ...deploymentDefinition.fixedPlacements.map(({ slot, position }) => ({
            slot,
            position: { ...position },
            fixed: true,
          })),
          ...optionalPlacements,
        ],
      };
      battle = new runtime.battle.Stage1Battle({
        difficulty: save.difficulty,
        roster: save.roster,
        rngState: save.rngState,
        rngCalls: save.rngCalls,
      }, deployment, new DeterministicRng(save.rngState, save.rngCalls));
    } else {
      battle = new Stage0Battle(
        save.difficulty,
        new DeterministicRng(save.rngState, save.rngCalls),
      );
    }
    battle.restore(save.battle, save.roster);
    this.battle = battle;
    this.stageEventState = createStageEventState(
      battle.stage,
      save.consumedEventIds as StageEventState["consumedEventIds"],
    );
    this.stageEntrySnapshot = cloneCampaignState(save.stageEntrySnapshot);
    this.stage1Campaign = save.stageId === "stage-01"
      ? cloneCampaignState(save.stageEntrySnapshot)
      : undefined;
    this.activeStoryId = undefined;
    this.difficulty = save.difficulty;
    this.phase = "player";
    this.campaignRoute = undefined;
    this.stageProgress = save.stageProgress;
    this.cursor = clampCameraFocus(this.battle.stage, save.battle.cursor);
    // Camera state is presentation-only. Normalize older/current saves that
    // were written before a stage-specific drawn-map boundary was enforced.
    this.cameraOrigin = clampCameraOrigin(this.battle.stage, save.battle.cameraOrigin);
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
    this.groupCommandOpen = false;
    this.groupCommandDialogueId = undefined;
    this.groupCommandLeaderId = undefined;
    this.retreatConfirmOpen = false;
    this.objectiveOpen = false;
    this.promotionUnitIds = [];
    this.promotionDialogueIndex = undefined;
    this.promotionSelectionIndex = 0;
    this.promotionResume = undefined;
    this.movementPresentation = undefined;
    this.combatPresentation = undefined;
    this.specialActionPresentation = undefined;
    this.specialActionPresentationTrace = [];
    this.restPresentation = undefined;
    this.restPresentationTrace = [];
    this.aiTechniqueDialogue = undefined;
    this.busy = false;
    this.resetAction();
    this.statusMessage = message;
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
    if (this.promotionUnitIds.length > 0) {
      if (this.promotionDialogueActive) return;
      if (delta.x !== 0 || delta.y !== 0) {
        this.movePromotionSelection(delta.x !== 0 ? delta.x : delta.y * 2);
      }
      return;
    }
    if (this.groupCommandDialogueActive) return;
    if (this.phase === "savePrompt") {
      if (delta.x !== 0 || delta.y !== 0) {
        this.savePromptIndex = this.savePromptIndex === 0 ? 1 : 0;
        this.emit();
      }
      return;
    }
    if (this.phase === "saveSlots") {
      if (delta.y !== 0) {
        this.postSaveSlotIndex = moveSaveSlotIndex(this.postSaveSlotIndex, delta.y);
        this.emit();
      } else if (delta.x !== 0) {
        this.postSaveSlotIndex = moveSaveSlotPage(this.postSaveSlotIndex, delta.x);
        this.emit();
      }
      return;
    }
    if (this.phase !== "player" || this.objectiveOpen || this.busy) return;
    if (this.recordMenuMode) {
      if (delta.y !== 0) this.moveRecordMenuSelection(delta.y);
      else if (delta.x !== 0) this.moveRecordMenuPage(delta.x);
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
    if (this.actionMode === "techniqueMenu") {
      if (delta.y !== 0) this.moveTechniqueSelection(delta.y);
      return;
    }
    this.minimapPreviewOrigin = undefined;
    this.cursor = clampCameraFocus(this.battle.stage, {
      x: this.cursor.x + delta.x,
      y: this.cursor.y + delta.y,
    });
    this.centerCamera(this.cursor);
    this.emit();
  }

  panCamera(delta: Position): void {
    if (
      this.phase !== "player"
      || this.hasBlockingOverlay
      || this.busy
      || this.actionMode === "actionMenu"
      || this.actionMode === "techniqueMenu"
    ) return;
    const next = clampCameraOrigin(this.battle.stage, {
      x: this.cameraOrigin.x + delta.x,
      y: this.cameraOrigin.y + delta.y,
    });
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
    this.minimapPreviewOrigin = cameraOriginForFocus(this.battle.stage, position);
    return { ...this.minimapPreviewOrigin };
  }

  clearMinimapPreview(): void {
    this.minimapPreviewOrigin = undefined;
  }

  commitMinimapPreview(): void {
    if (!this.minimapPreviewOrigin) return;
    const origin = clampCameraOrigin(this.battle.stage, this.minimapPreviewOrigin);
    this.cameraOrigin = origin;
    this.cursor = cameraFocusForOrigin(this.battle.stage, origin);
    this.battle.focusId = this.battle.unitAt(this.cursor)?.id ?? this.battle.focusId;
    this.minimapPreviewOrigin = undefined;
    this.emit();
  }

  primaryAtCursor(): void {
    if (this.groupCommandDialogueActive) this.advanceDialogue();
    else if (this.promotionDialogueActive) this.advanceDialogue();
    else if (this.promotionUnitIds.length > 0) this.confirmPromotion();
    else if (isStoryPhase(this.phase)) this.advanceDialogue();
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
    else if (this.actionMode === "techniqueMenu") this.activateTechniqueSelection();
    else this.selectCell(this.cursor);
  }

  async completeCurrentStageForDebug(): Promise<void> {
    if (!this.debugMode) return;
    this.busy = false;
    this.resetAction();
    this.activeStoryId = undefined;
    this.movementPresentation = undefined;
    this.combatPresentation = undefined;
    this.specialActionPresentation = undefined;
    this.restPresentation = undefined;
    this.aiTechniqueDialogue = undefined;
    if (this.battle.stage.id === "stage-00") {
      await this.enterStage1({
        ...this.battle.campaignSnapshot(),
        stageId: "stage-01",
      });
      this.statusMessage = "調試：第 0 關已直接完成，進入第 1 關關前劇情。";
      this.emit();
      return;
    }
    if (this.battle.stage.id === "stage-01") {
      await this.enterStage2({
        ...this.battle.campaignSnapshot(),
        stageId: "stage-02",
      });
      this.statusMessage = "調試：第 1 關已直接完成，進入第 2 關。";
      this.emit();
      return;
    }
    this.campaignRoute = "stage-03";
    this.stageProgress = 1000;
    this.phase = "nextStage";
    this.statusMessage = "調試：第 2 關已直接完成，進入 stage-03 邊界。";
    this.emit();
  }

  forceDefeatForTest(): void {
    if (!this.debugMode) return;
    this.battle.units = this.battle.units.filter((unit) => unit.id !== "1:0");
    this.resolveOutcome();
    this.emit();
  }

  forceVictorySetupForTest(): void {
    if (!this.debugMode) return;
    const nia = this.battle.unit("1:0");
    const victory = this.battle.stage.objective.victory;
    const finalEnemy = victory.type === "unit-removed"
      ? this.battle.units.find((unit) => unit.side === victory.side && unit.slot === victory.slot)
      : this.battle.units.find((unit) => unit.side === 2);
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
    this.centerCamera(nia);
    this.cursor = { x: nia.x, y: nia.y };
    this.resetAction();
    this.statusMessage = "自動驗收：最後一名敵人已置於合法攻擊位。";
    this.emit();
  }

  forceEvacuationSetupForTest(): void {
    if (!this.debugMode) return;
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
    if (!this.debugMode) return;
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
    this.cameraOrigin = clampCameraOrigin(this.battle.stage, this.battle.stage.viewport.initialOrigin);
    this.cursor = { x: nia.x, y: nia.y };
    this.resetAction();
    this.statusMessage = "自動驗收：妮雅已有兩個合法普通攻擊目標。";
    this.busy = false;
    this.emit();
  }

  forceCavalryCounterSetupForTest(): void {
    if (!this.debugMode) return;
    const nia = this.battle.unit("1:0");
    const cavalry = this.battle.unit("2:15");
    if (!nia || !cavalry) return;
    nia.x = 29;
    nia.y = 26;
    nia.acted = false;
    cavalry.x = 30;
    cavalry.y = 26;
    cavalry.life = this.battle.statsFor(cavalry).maxLife;
    cavalry.acted = false;
    this.battle.units = this.battle.units.filter((unit) => unit.side === 1 || unit.id === cavalry.id);
    for (const unit of this.battle.units.filter((unit) => unit.side === 1 && unit.id !== nia.id)) unit.acted = true;
    this.battle.focusId = nia.id;
    this.phase = "player";
    this.cameraOrigin = clampCameraOrigin(this.battle.stage, this.battle.stage.viewport.initialOrigin);
    this.cursor = { x: nia.x, y: nia.y };
    this.resetAction();
    this.statusMessage = "自動驗收：哈釘已置於可反擊位置。";
    this.busy = false;
    this.emit();
  }

  forceEnemySisterSetupForTest(): void {
    if (!this.debugMode || this.battle.stage.id !== "stage-01") return;
    const nia = this.battle.unit("1:0");
    const sister = this.battle.unit("2:43");
    const boss = this.battle.unit("2:16");
    if (!nia || !sister || !boss) return;
    nia.x = 34;
    nia.y = 26;
    nia.life = this.battle.statsFor(nia).maxLife;
    nia.acted = false;
    sister.x = 29;
    sister.y = 26;
    sister.life = this.battle.statsFor(sister).maxLife;
    sister.acted = false;
    boss.x = 1;
    boss.y = 1;
    boss.acted = true;
    this.battle.units = [nia, sister, boss];
    this.battle.rng.state = 2;
    this.battle.focusId = nia.id;
    this.phase = "player";
    this.centerCamera(nia);
    this.cursor = { x: nia.x, y: nia.y };
    this.resetAction();
    this.statusMessage = "自動驗收：敵方修女已置於統一炎暴範圍邊界。";
    this.busy = false;
    this.emit();
  }

  forceEnemyAlertBoundarySetupForTest(): void {
    if (!this.debugMode || this.battle.stage.id !== "stage-01") return;
    this.battle.restore({
      ...this.battle.serializableSnapshot(),
      enemyAi: {
        activeGroupIds: [],
        pendingNoticeGroupIds: [],
        fangPursuitRound: null,
      },
    });
    const nia = this.battle.unit("1:0");
    if (!nia) return;
    nia.x = 25;
    nia.y = 21;
    nia.life = this.battle.statsFor(nia).maxLife;
    nia.acted = false;
    for (const unit of this.battle.units.filter((unit) => unit.side === 1 && unit.id !== nia.id)) {
      unit.acted = true;
    }
    for (const unit of this.battle.units.filter((unit) => unit.side === 2)) unit.acted = false;
    this.battle.focusId = nia.id;
    this.phase = "player";
    this.centerCamera(nia);
    this.cursor = { x: nia.x, y: nia.y };
    this.resetAction();
    this.statusMessage = "自動驗收：我軍僅在第二軍團移動後施術的潛在範圍內。";
    this.busy = false;
    this.emit();
  }

  forceClassActionSetupForTest(
    classId: "archer" | "cavalry" | "magician" | "sister" | "warrior",
    ordinaryCombat = false,
    stage1Target: "boss" | "pursuing" = "boss",
  ): void {
    if (!this.debugMode) return;
    const actor = this.battle.unit("1:0");
    const ally = this.battle.unit("1:1")
      ?? this.battle.units.find((unit) => unit.side === 1 && unit.id !== actor?.id);
    const pursuingStage1Target = this.battle.stage.id === "stage-01"
      && classId === "magician"
      && stage1Target === "pursuing";
    const enemy = this.battle.stage.id === "stage-01"
      ? this.battle.unit(pursuingStage1Target ? "2:45" : "2:16")
      : this.battle.units.find((unit) => unit.side === 2 && unit.id !== "2:15");
    const objectiveAnchor = pursuingStage1Target ? this.battle.unit("2:16") : undefined;
    if (!actor || !ally || !enemy) return;
    actor.classId = classId;
    actor.className = className(classId);
    actor.experience = 0;
    actor.acted = false;
    actor.actionDisabled = false;
    actor.x = 29;
    actor.y = 26;
    actor.life = this.battle.statsFor(actor).maxLife;
    ally.acted = false;
    ally.actionDisabled = false;

    enemy.x = ordinaryCombat
      ? 30
      : classId === "archer"
        ? 33
        : pursuingStage1Target
          ? 31
          : 30;
    enemy.y = 26;
    enemy.life = ordinaryCombat ? 1 : this.battle.statsFor(enemy).maxLife;
    enemy.acted = false;
    enemy.actionDisabled = false;

    if (objectiveAnchor) {
      objectiveAnchor.x = 1;
      objectiveAnchor.y = 1;
      objectiveAnchor.life = this.battle.statsFor(objectiveAnchor).maxLife;
      objectiveAnchor.acted = true;
      objectiveAnchor.actionDisabled = false;
    }

    if (classId === "sister" && !ordinaryCombat) {
      ally.x = 31;
      ally.y = 26;
      ally.life = Math.max(1, this.battle.statsFor(ally).maxLife - 60);
      enemy.x = 33;
    }

    this.battle.units = this.battle.units.filter((unit) =>
      unit.side === 1 || unit.id === enemy.id || unit.id === objectiveAnchor?.id);
    for (const unit of this.battle.units.filter((unit) =>
      unit.side === 1 && unit.id !== actor.id && unit.id !== ally.id)) {
      unit.acted = true;
    }
    this.battle.focusId = actor.id;
    this.phase = "player";
    this.centerCamera(actor);
    this.cursor = { x: actor.x, y: actor.y };
    this.resetAction();
    this.statusMessage = pursuingStage1Target
      ? `調試場景：${actor.className}可對追擊型敵兵驗證一次敵方階段冰封。`
      : `自動驗收：${actor.className}職業行動場景。`;
    this.busy = false;
    this.emit();
  }

  forceRestSetupForTest(): void {
    if (!this.debugMode) return;
    const ally = this.battle.unit("1:0");
    const enemy = this.battle.stage.id === "stage-01"
      ? this.battle.unit("2:40")
      : this.battle.units.find((unit) => unit.side === 2);
    const objective = this.battle.stage.id === "stage-01"
      ? this.battle.unit("2:16")
      : undefined;
    if (!ally || !enemy) return;
    ally.classId = "warrior";
    ally.className = className(ally.classId);
    ally.x = 29;
    ally.y = 26;
    ally.life = Math.max(1, this.battle.statsFor(ally).maxLife - 60);
    ally.acted = false;
    ally.actionDisabled = false;
    enemy.x = this.battle.stage.id === "stage-01" ? 35 : 34;
    enemy.y = this.battle.stage.id === "stage-01" ? 37 : 26;
    enemy.life = Math.max(1, Math.floor(this.battle.statsFor(enemy).maxLife * 10 / 100));
    enemy.acted = false;
    enemy.actionDisabled = false;
    if (objective) {
      objective.x = 34;
      objective.y = 14;
      objective.acted = false;
      objective.actionDisabled = true;
    }
    this.battle.units = [ally, enemy, ...(objective ? [objective] : [])];
    this.battle.focusId = ally.id;
    this.phase = "player";
    this.centerCamera(ally);
    this.cursor = { x: ally.x, y: ally.y };
    this.resetAction();
    this.restPresentation = undefined;
    this.restPresentationTrace = [];
    this.statusMessage = "自動驗收：敵我雙方均可在本回合休息。";
    this.busy = false;
    this.emit();
  }

  forceDispelSetupForTest(): void {
    if (!this.debugMode || this.battle.stage.id !== "stage-01") return;
    const actor = this.battle.unit("1:0");
    const ally = this.battle.unit("1:1")
      ?? this.battle.units.find((unit) => unit.side === 1 && unit.id !== actor?.id);
    const objective = this.battle.unit("2:16");
    if (!actor || !ally || !objective) return;

    actor.classId = "magic-priest";
    actor.className = className(actor.classId);
    actor.experience = MAGIC_PRIEST_TIER3_EXPERIENCE;
    actor.life = this.battle.statsFor(actor).maxLife;
    actor.x = 29;
    actor.y = 26;
    actor.acted = false;
    actor.actionDisabled = false;

    ally.x = 30;
    ally.y = 26;
    ally.acted = false;
    ally.actionDisabled = true;
    ally.statuses.attackDown = 3;
    ally.statuses.defenseDown = 3;
    ally.statuses.confusion = 3;
    ally.statuses.poison = 3;
    ally.statuses.techniqueSeal = 3;

    objective.x = 1;
    objective.y = 1;
    objective.acted = true;
    objective.actionDisabled = false;
    this.battle.units = [actor, ally, objective];
    this.battle.focusId = actor.id;
    this.phase = "player";
    this.centerCamera(actor);
    this.cursor = { x: actor.x, y: actor.y };
    this.resetAction();
    this.statusMessage = "調試場景：冰封友軍不能被治療；魔祭師可用破邪解除冰封與異常。";
    this.busy = false;
    this.emit();
  }

  debugState(): object {
    return {
      stageId: this.battle.stage.id,
      stageProgress: this.stageProgress,
      phase: this.phase,
      campaignRoute: this.campaignRoute,
      difficulty: this.difficulty,
      dialogueIndex: this.dialogueIndex,
      activeStoryId: this.activeStoryId,
      consumedEventIds: [...this.stageEventState.consumedEventIds],
      actionMode: this.actionMode,
      selectedId: this.selectedId,
      commandMenuKind: this.commandMenuKind,
      commandIndex: this.commandIndex,
      commands: this.unitCommands.map((command) => ({ ...command })),
      selectedActionId: this.selectedActionId,
      techniqueIndex: this.techniqueIndex,
      techniques: this.techniqueActions.map((actionId) => ({
        actionId,
        label: BATTLE_ACTION_DEFINITIONS[actionId].label,
      })),
      cursor: { ...this.cursor },
      cameraOrigin: this.cameraOrigin,
      minimapPreviewOrigin: this.minimapPreviewOrigin ? { ...this.minimapPreviewOrigin } : undefined,
      terrainInspection: this.terrainInspection,
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
      promotionUnitIds: [...this.promotionUnitIds],
      promotionDialogueIndex: this.promotionDialogueIndex,
      promotionSelectionIndex: this.promotionSelectionIndex,
      promotionTargets: this.promotionTargets.map((target) => ({ ...target })),
      musicVolume: this.musicVolume,
      speechEnabled: this.speechEnabled,
      movementSoundEnabled: this.movementSoundEnabled,
      combatSoundEnabled: this.combatSoundEnabled,
      keySoundEnabled: this.keySoundEnabled,
      groupCommandOpen: this.groupCommandOpen,
      groupCommandIndex: this.groupCommandIndex,
      groupCommandDialogueId: this.groupCommandDialogueId,
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
      aiDialogueEnabled: this.aiDialogueEnabled,
      lastCombat: this.lastCombat ? { ...this.lastCombat } : undefined,
      lastSpecialAction: this.lastSpecialAction ? { ...this.lastSpecialAction } : undefined,
      combatPresentation: this.combatPresentation ? {
        ...this.combatPresentation,
        attacker: { ...this.combatPresentation.attacker },
        defender: { ...this.combatPresentation.defender },
        result: { ...this.combatPresentation.result },
        fullScene: this.combatPresentation.fullScene ? { ...this.combatPresentation.fullScene } : undefined,
      } : undefined,
      combatPresentationTrace: this.combatPresentationTrace.map((entry) => ({ ...entry })),
      specialActionPresentation: this.specialActionPresentation ? {
        ...this.specialActionPresentation,
        actor: {
          ...this.specialActionPresentation.actor,
          statuses: { ...this.specialActionPresentation.actor.statuses },
        },
        target: this.specialActionPresentation.target ? {
          ...this.specialActionPresentation.target,
          statuses: { ...this.specialActionPresentation.target.statuses },
        } : undefined,
        result: { ...this.specialActionPresentation.result },
        displayedLifeByUnitId: { ...this.specialActionPresentation.displayedLifeByUnitId },
      } : undefined,
      specialActionPresentationTrace: this.specialActionPresentationTrace.map((entry) => ({
        ...entry,
        displayedLifeByUnitId: { ...entry.displayedLifeByUnitId },
      })),
      restPresentation: this.restPresentation ? {
        ...this.restPresentation,
        unit: {
          ...this.restPresentation.unit,
          statuses: { ...this.restPresentation.unit.statuses },
        },
      } : undefined,
      restPresentationTrace: this.restPresentationTrace.map((entry) => ({
        ...entry,
        unit: { ...entry.unit, statuses: { ...entry.unit.statuses } },
      })),
      turnTransitionPresentation: this.turnTransitionPresentation
        ? { ...this.turnTransitionPresentation }
        : undefined,
      turnTransitionPresentationTrace: this.turnTransitionPresentationTrace.map((entry) => ({
        ...entry,
      })),
      aiTechniqueDialogue: this.aiTechniqueDialogue ? {
        ...this.aiTechniqueDialogue,
        actor: {
          ...this.aiTechniqueDialogue.actor,
          statuses: { ...this.aiTechniqueDialogue.actor.statuses },
        },
        center: { ...this.aiTechniqueDialogue.center },
        page: { ...this.aiTechniqueDialogue.page },
      } : undefined,
      movementPresentation: this.movementPresentation ? {
        ...this.movementPresentation,
        path: this.movementPresentation.path.map((step) => ({ ...step })),
      } : undefined,
      reachable: this.reachable.map((cell) => ({ ...cell })),
      targets: this.targets.map((cell) => ({ ...cell })),
      actionRange: this.actionRange.map((cell) => ({ ...cell })),
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
      this.groupCommandDialogueId = undefined;
      this.groupCommandLeaderId = undefined;
      this.retreatConfirmOpen = false;
      this.objectiveOpen = false;
      this.movementPresentation = undefined;
      this.phase = "defeat";
      this.statusMessage = this.battle.stage.objective.defeatText;
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
      this.groupCommandDialogueId = undefined;
      this.groupCommandLeaderId = undefined;
      this.retreatConfirmOpen = false;
      this.objectiveOpen = false;
      this.movementPresentation = undefined;
      this.dialogueIndex = 0;
      const defeatCondition = this.battle.stage.objective.defeat;
      if (defeatCondition.type === "unit-removed") {
        const protectedUnit = this.battle.units.find(
          (unit) => unit.side === defeatCondition.side && unit.slot === defeatCondition.slot,
        );
        if (protectedUnit) {
          this.battle.focusId = protectedUnit.id;
          this.centerCamera(protectedUnit);
        }
      }
      const victoryEvents = this.consumeStageTrigger({ type: "objective-satisfied" });
      void this.processStageEvents(victoryEvents).then(() => this.emit());
      if (victoryEvents.length === 0) this.phase = "victoryFeedback";
      this.statusMessage = this.battle.stage.objective.victoryStatusText;
      this.resetAction();
      return true;
    }
    return false;
  }

  private completeVictoryFlow(): void {
    const routeEvents = this.consumeStageTrigger({ type: "victory-flow-completed" });
    if (routeEvents.length === 0) {
      this.phase = "nextStage";
      this.emit();
      return;
    }
    void this.processStageEvents(routeEvents).then(() => this.emit());
  }

  private persistPresentationPreferences(): void {
    savePresentationPreferences(localStorage, {
      battlePresentation: this.battlePresentation,
      gridEnabled: this.gridEnabled,
      edgeScrollEnabled: this.edgeScrollEnabled,
      portraitsEnabled: this.portraitsEnabled,
      aiDialogueEnabled: this.aiDialogueEnabled,
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
    this.cameraOrigin = cameraOriginForFocus(this.battle.stage, position);
  }

  private async focusCameraOnAction(position: Position): Promise<void> {
    const target = cameraOriginForFocus(this.battle.stage, position);
    this.cursor = { ...position };
    while (positionKey(this.cameraOrigin) !== positionKey(target)) {
      const stepAxis = (current: number, destination: number) =>
        current === destination ? current : current + Math.sign(destination - current);
      this.cameraOrigin = {
        x: stepAxis(this.cameraOrigin.x, target.x),
        y: stepAxis(this.cameraOrigin.y, target.y),
      };
      this.emit();
      await pause(this.testMode ? 12 : this.presentationFast ? 24 : 55);
    }
    this.emit();
  }

  private async presentAiTechniqueDialogue(
    actor: BattleUnit,
    actionId: BattleActionId,
    center: Position,
  ): Promise<void> {
    if (!this.aiDialogueEnabled) return;
    const page = aiTechniqueDialogueFor(actor, actionId);
    if (!page) return;
    this.aiTechniqueDialogue = {
      actionId,
      actor,
      center: { ...center },
      page,
    };
    this.emit();
    const text = page.activeSlot ? page[page.activeSlot]?.text ?? "" : "";
    const delay = this.testMode
      ? 800
      : this.presentationFast
        ? Math.max(360, text.length * 20 + 120)
        : Math.max(1_200, text.length * 80 + 220);
    await pause(delay);
    this.aiTechniqueDialogue = undefined;
    this.emit();
  }

  unitStats(unit: Pick<BattleUnit, "classId" | "experience" | "side">): UnitStats {
    return this.battle.statsFor(unit);
  }

  describeFocus(): { stats: UnitStats; unit: BattleUnit } | undefined {
    const unit = this.focusedUnit;
    return unit ? { unit, stats: this.unitStats(unit) } : undefined;
  }

  portraitUrl(portrait: BattleUnit["portrait"]): string {
    return portraitSourceFor(portrait);
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
  forceEnemySisterSetup: () => void;
  forceEnemyAlertBoundarySetup: () => void;
  forceRestSetup: () => void;
  forceClassActionSetup: (
    classId: "archer" | "cavalry" | "magician" | "sister" | "warrior",
    ordinaryCombat?: boolean,
  ) => void;
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
    forceEnemySisterSetup: () => controller.forceEnemySisterSetupForTest(),
    forceEnemyAlertBoundarySetup: () => controller.forceEnemyAlertBoundarySetupForTest(),
    forceRestSetup: () => controller.forceRestSetupForTest(),
    forceClassActionSetup: (classId, ordinaryCombat) =>
      controller.forceClassActionSetupForTest(classId, ordinaryCombat),
    clearSaves: () => {
      for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot += 1) {
        localStorage.removeItem(saveSlotKey(slot));
      }
    },
  };
}
