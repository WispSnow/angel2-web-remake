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
  CLASS_SHOWDOWN_TELEPORT_ACTION_ID,
  STAGE0_REST_PRESENTATION,
  actionPresentationCatalog,
  techniqueActionIdsFor,
} from "./content/actions";
import { aiTechniqueDialogueFor } from "./content/ai-technique-dialogue";
import {
  classDefinition,
  className,
  promotionTargetsFor,
  unitDisplayName,
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
import {
  NIA_CHARACTER_RECORD,
  promotionDialogueFor,
} from "./content/promotion-dialogue";
import { buildFullCombatScript, type FullCombatPhaseName, type FullCombatSceneState } from "./full-combat";
import { inspectTerrain, type TerrainInspection } from "./terrain-inspection";
import {
  TURN_TRANSITION_HOLD_NATIVE_TICKS,
  turnTransitionFrames,
  type TurnTransitionPresentation,
  type TurnTransitionSide,
} from "./turn-transition-presentation";
import { Stage0Battle } from "./simulation/battle";
import type { AlliedAiAction } from "./simulation/ai-contracts";
import type { PreparedRoutePulse } from "./simulation/route-pulse";
import type {
  ConstructionActionId,
  ConstructionResult,
} from "./simulation/actions/construction";
import { routePulsePresentationTimeline } from "./route-pulse-presentation";
import { buildStompPresentationSteps } from "./stomp-presentation";
import { techniqueEffectRange } from "./simulation/actions/range-map";
import type { DeploymentResult } from "./simulation/deployment";
import { manhattan, positionKey } from "./simulation/grid";
import { prepareScriptedLightning4 } from "./simulation/scripted-actions";
import { emptyUnitStatuses } from "./simulation/status";
import {
  createStageEventState,
  dispatchStageEvents,
  type StageEventState,
} from "./simulation/stage-events";
import type {
  BattleActionId,
  PreparedBattleAction,
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
import {
  INITIAL_STAGE_RUNTIME,
  isPlayableStageId,
  loadStageRuntime,
  stageRuntimeSourceForDestination,
  type LoadedStageRuntime,
} from "./stage-runtime";
import type { ActionMode, AttackResult, BattleUnit, CampaignState, DialoguePage, Difficulty, GamePhase, Position, SaveData, StageId, UnitStats } from "./types";

type Listener = () => void;
type MovementKind = "scripted" | "player" | "allyAuto" | "enemy" | "rollback";

interface StageEntryOptions {
  preparation?: boolean;
  statusMessage?: string;
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
  attackerDeathUnits?: readonly BattleUnit[];
  defenderDeathUnits?: readonly BattleUnit[];
  result: AttackResult;
  phase: CombatPresentationPhase;
  frame: number;
  displayedAttackerLife: number;
  displayedDefenderLife: number;
  deathTargetIndex?: number;
  fullScene?: FullCombatSceneState;
}

export interface CombatPresentationTraceEntry {
  phase: CombatPresentationPhase;
  frame: number;
  displayedAttackerLife: number;
  displayedDefenderLife: number;
  deathTargetId?: string;
  fullScene?: FullCombatSceneState;
}

export type SpecialActionPresentationPhase =
  | "shootBlank"
  | "shootHit"
  | "shootLineGrow"
  | "shootLineFinish"
  | "fireEffect"
  | "healPrimary"
  | "healBlank"
  | "healTail"
  | "lightningMain"
  | "lightningHit"
  | "lightningCleanup"
  | "iceExpansion"
  | "recoveryEffect"
  | "statusEffect"
  | "poisonEffect"
  | "prayerEffect"
  | "dispelEffect"
  | "stompEffect"
  | "stompPageToggle"
  | "teleportEffect"
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

export interface RoutePulsePresentation {
  result: PreparedRoutePulse;
  frame: number;
  draw: number;
  nativeTicks: number;
  visible: boolean;
  displayedLifeByUnitId: Readonly<Record<string, number>>;
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
  crossbow: { id: "shoot", label: "射擊" },
  "magic-archer": { id: "shoot", label: "射擊" },
  sister: { id: "technique", label: "技術" },
  priest: { id: "technique", label: "技術" },
  magician: { id: "technique", label: "技術" },
  "evil-mage": { id: "technique", label: "技術" },
  monk: { id: "technique", label: "技術" },
  "magic-priest": { id: "technique", label: "技術" },
  "prayer-guide": { id: "technique", label: "技術" },
  "magic-guide": { id: "technique", label: "技術" },
  "curse-master": { id: "technique", label: "技術" },
  "great-dragon-knight": { id: "technique", label: "技術" },
  "magic-master": { id: "technique", label: "技術" },
  wizard: { id: "technique", label: "技術" },
  engineer: { id: "technique", label: "技術" },
};

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

const MEMORY_ONLY_SYSTEM_COMMANDS: ReadonlyArray<{ id: SystemCommandId; label: string }> = [
  { id: "settings", label: "遊戲功能" },
  { id: "objectives", label: "勝利條件" },
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
  "scriptedStory",
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
  dialogueSkipConfirmOpen = false;
  dialogueSkipConfirmIndex = 1;
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
  lastConstruction?: ConstructionResult;
  lastRoutePulse?: PreparedRoutePulse;
  combatPresentation?: CombatPresentation;
  combatPresentationTrace: CombatPresentationTraceEntry[] = [];
  specialActionPresentation?: SpecialActionPresentation;
  routePulsePresentation?: RoutePulsePresentation;
  routePulsePresentationTrace: Array<Pick<RoutePulsePresentation, "frame" | "draw" | "nativeTicks" | "visible">> = [];
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
  private skippingScriptedSequence = false;
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
  private pendingExtraMove = false;
  private busy = false;
  private promotionResume?: () => void;
  private prayerHoldSkip?: () => void;
  private groupCommandLeaderId?: string;
  private activeStoryId?: StageStoryId;
  private stageEventState: StageEventState;
  private stageEntrySnapshot: CampaignState;
  private preparationCampaign?: CampaignState;
  private stageRuntime: LoadedStageRuntime = INITIAL_STAGE_RUNTIME;
  private completedProgressMetadata?: {
    completedOrdinal: number;
    destinationId: CampaignRouteId;
    destinationLabel: string;
  };
  private listeners = new Set<Listener>();
  private campaignPersistenceEnabled = true;
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

  static forStandaloneBattle(
    battle: Stage0Battle,
    runtime: LoadedStageRuntime,
    statusMessage: string,
  ): GameController {
    const controller = new GameController(battle.difficulty);
    controller.campaignPersistenceEnabled = false;
    controller.stageRuntime = runtime;
    controller.battle = battle;
    controller.difficulty = battle.difficulty;
    controller.stageEntrySnapshot = cloneCampaignState(battle.campaignSnapshot());
    controller.preparationCampaign = undefined;
    controller.completedProgressMetadata = undefined;
    controller.stageEventState = createStageEventState(battle.stage);
    controller.activeStoryId = undefined;
    controller.campaignRoute = undefined;
    controller.phase = "player";
    controller.hintVisible = false;
    controller.resetAction();
    const focus = battle.focus ?? battle.units.find(({ side }) => side === 1);
    if (focus) {
      battle.focusId = focus.id;
      controller.cursor = { x: focus.x, y: focus.y };
      controller.centerCamera(focus);
    } else {
      controller.cameraOrigin = { ...battle.stage.viewport.initialOrigin };
      controller.cursor = { ...controller.cameraOrigin };
    }
    controller.statusMessage = statusMessage;
    return controller;
  }

  get deploymentRoster() {
    return this.preparationCampaign && this.stageRuntime.preparation
      ? this.stageRuntime.preparation.createRoster(this.preparationCampaign)
      : [];
  }

  get deploymentDefinition() {
    const preparation = this.stageRuntime.preparation;
    if (!preparation) throw new Error(`${this.stageRuntime.id} has no deployment preparation`);
    return preparation.definition;
  }

  get deploymentPresentation() {
    const preparation = this.stageRuntime.preparation;
    if (!preparation) throw new Error(`${this.stageRuntime.id} has no deployment presentation`);
    return preparation.presentation;
  }

  get currentStageAssets() {
    return this.stageRuntime.assets;
  }

  get currentMapPresentationActionIds() {
    return this.stageRuntime.mapPresentationActionIds;
  }

  get routePulseGuidance(): string | undefined {
    return this.stageRuntime.preparation?.presentation.guidanceText;
  }

  get currentRoutePulseSafeArea(): Position[] {
    if (this.routePulsePresentation) {
      return this.routePulsePresentation.result.safeCells.map((position) => ({ ...position }));
    }
    const unit = this.focusedUnit;
    return unit ? this.battle.routePulseSafeAreaForUnit(unit.id) : [];
  }

  /**
   * The modern remake shows the selected target's area footprint while the
   * player is still choosing a recovery or lightning target. This is derived
   * presentation state only; the prepared action remains the simulation truth.
   */
  get effectPreviewCells(): Position[] {
    if (this.actionMode !== "specialTarget" || !this.selectedActionId) return [];
    if (!this.targets.some((target) => positionKey(target) === positionKey(this.cursor))) return [];
    const definition = BATTLE_ACTION_DEFINITIONS[this.selectedActionId];
    if (
      this.selectedActionId !== "lightning-1"
      && this.selectedActionId !== "lightning-2"
      && this.selectedActionId !== "lightning-3"
      && this.selectedActionId !== "lightning-4"
      && this.selectedActionId !== "recovery-1"
      && this.selectedActionId !== "recovery-2"
      && this.selectedActionId !== "recovery-3"
    ) return [];
    if (!("effectRadius" in definition.range)) return [];
    return techniqueEffectRange(
      this.cursor,
      this.battle.stage.width,
      this.battle.stage.height,
      definition.range.effectRadius,
    ).cells();
  }

  get currentStageProgressMetadata() {
    return this.completedProgressMetadata ?? {
      completedOrdinal: this.stageRuntime.ordinal,
      destinationId: this.stageRuntime.nextStageId,
      destinationLabel: this.stageRuntime.completion.destinationLabel,
    };
  }

  async enterStage(
    stageId: StageId,
    campaign: CampaignState = { ...this.battle.campaignSnapshot(), stageId },
    options: StageEntryOptions = {},
  ): Promise<void> {
    const runtime = await loadStageRuntime(stageId);
    this.stageRuntime = runtime;
    this.completedProgressMetadata = undefined;
    this.stageEntrySnapshot = cloneCampaignState({ ...campaign, stageId });
    this.preparationCampaign = runtime.preparation
      ? cloneCampaignState(this.stageEntrySnapshot)
      : undefined;
    this.battle = runtime.createBattle(
      this.stageEntrySnapshot,
      runtime.preparation?.createInitialResult(),
    );
    this.difficulty = campaign.difficulty;
    this.campaignRoute = runtime.entry.campaignRoute;
    this.stageProgress = 0;
    this.activeStoryId = undefined;
    this.dialogueSkipConfirmOpen = false;
    this.dialogueSkipConfirmIndex = 1;
    this.stageEventState = createStageEventState(this.battle.stage);
    this.resetAction();
    this.cameraOrigin = clampCameraOrigin(this.battle.stage, this.battle.stage.viewport.initialOrigin);
    const focus = this.battle.unit(runtime.focusUnitId) ?? this.battle.focus;
    this.cursor = focus ? { x: focus.x, y: focus.y } : { ...this.cameraOrigin };
    this.statusMessage = options.statusMessage ?? runtime.entry.statusText;
    if (options.preparation) {
      if (!runtime.preparation) throw new Error(`${stageId} has no preparation entry`);
      this.stageEventState = createStageEventState(
        this.battle.stage,
        runtime.preparation.consumedEventIdsOnRetry as StageEventState["consumedEventIds"],
      );
      this.phase = "deployment";
      this.emit();
      return;
    }
    this.phase = runtime.entry.phase;
    if (runtime.entry.trigger === "campaign-entered") {
      this.initializeStageEventProgress();
      this.emit();
      return;
    }
    const events = this.consumeStageTrigger({ type: "battle-started" });
    await this.processStageEvents(events);
    this.emit();
  }

  async enterStage1(campaign: CampaignState = {
    ...this.battle.campaignSnapshot(),
    stageId: "stage-01",
  }, entry: "prebattle" | "deployment" = "prebattle", statusMessage?: string): Promise<void> {
    await this.enterStage("stage-01", campaign, {
      preparation: entry === "deployment",
      statusMessage,
    });
  }

  completeDeployment(deployment: DeploymentResult): void {
    if (this.phase !== "deployment" || !this.preparationCampaign || !this.stageRuntime.preparation) return;
    this.battle = this.stageRuntime.createBattle(this.preparationCampaign, deployment);
    this.cameraOrigin = clampCameraOrigin(this.battle.stage, this.battle.stage.viewport.initialOrigin);
    const focus = this.battle.unit(this.stageRuntime.focusUnitId) ?? this.battle.focus;
    this.cursor = focus ? { x: focus.x, y: focus.y } : { ...this.cameraOrigin };
    this.resetAction();
    this.statusMessage = `部署完成：${deployment.placements.length} 人編隊已建立。`;
    const events = this.consumeStageTrigger({ type: "battle-started" });
    if (events.length === 0) this.phase = "player";
    void this.processStageEvents(events).then(() => this.emit());
  }

  async enterStage2(campaign: CampaignState = {
    ...this.battle.campaignSnapshot(),
    stageId: "stage-02",
  }, statusMessage = "第一軍團繼續向騎士團堡推進。") : Promise<void> {
    await this.enterStage("stage-02", campaign, { statusMessage });
  }

  async enterStage3(campaign: CampaignState = {
    ...this.battle.campaignSnapshot(),
    stageId: "stage-03",
  }, statusMessage = "希蜜與第四軍團會合，開始救援友軍。") : Promise<void> {
    await this.enterStage("stage-03", campaign, { statusMessage });
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get currentDialogue(): DialoguePage | undefined {
    if (this.aiTechniqueDialogue) return this.aiTechniqueDialogue.page;
    if (this.groupCommandDialogueId) {
      return groupCommandDialogueFor(this.groupCommandDialogueId, this.groupCommandSpeaker);
    }
    const promotionUnit = this.promotionUnit;
    if (promotionUnit && this.promotionDialogueIndex !== undefined) {
      return promotionDialogueFor(
        promotionUnit,
        this.promotionGrantor,
      )[this.promotionDialogueIndex];
    }
    if (!this.activeStoryId || !isStoryPhase(this.phase)) return undefined;
    return storyPagesForId(this.activeStoryId)[this.dialogueIndex];
  }

  get canSkipScriptedSequence(): boolean {
    return this.phase === "scriptedStory"
      && this.activeStoryId !== undefined
      && (this.battle.stage.stories.scripted?.includes(this.activeStoryId) ?? false)
      && !this.skippingScriptedSequence;
  }

  get canRequestDialogueSkip(): boolean {
    return isStoryPhase(this.phase)
      && this.activeStoryId !== undefined
      && this.currentDialogue !== undefined;
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

  get promotionGrantor(): BattleUnit | undefined {
    const nia = this.battle.units.find(
      ({ side, portrait }) => side === 1 && portrait === NIA_CHARACTER_RECORD,
    );
    if (nia) return nia;
    const himi = this.battle.unit("1:1");
    return himi?.side === 1
      ? himi
      : this.battle.units.find(({ side }) => side === 1);
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

  get systemCommands(): ReadonlyArray<{ id: SystemCommandId; label: string }> {
    return this.campaignPersistenceEnabled ? SYSTEM_COMMANDS : MEMORY_ONLY_SYSTEM_COMMANDS;
  }

  get isCampaignPersistenceEnabled(): boolean {
    return this.campaignPersistenceEnabled;
  }

  get hasBlockingOverlay(): boolean {
    return this.systemMenuOpen
      || this.settingsOpen
      || this.soundSettingsOpen
      || this.musicSettingsOpen
      || this.recordMenuMode !== undefined
      || this.dialogueSkipConfirmOpen
      || this.quitConfirmOpen
      || this.objectiveOpen
      || this.groupCommandOpen
      || this.retreatConfirmOpen
      || this.aiTechniqueDialogueActive
      || this.groupCommandDialogueActive
      || this.promotionUnitIds.length > 0;
  }

  get groupLeader(): BattleUnit | undefined {
    const fixedCommander = this.battle.groupCommander;
    if (fixedCommander) {
      return !fixedCommander.acted && !fixedCommander.actionDisabled
        ? fixedCommander
        : undefined;
    }

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

  get groupCommandSpeaker(): BattleUnit | undefined {
    const leader = this.groupCommandLeaderId
      ? this.battle.unit(this.groupCommandLeaderId)
      : undefined;
    if (leader?.side === 1) return leader;
    const fixedCommander = this.battle.groupCommander;
    if (fixedCommander) return fixedCommander;
    const focus = this.battle.focus;
    return focus?.side === 1 ? focus : this.battle.units.find(({ side }) => side === 1);
  }

  get followLeaderAvailable(): boolean {
    return this.groupLeader !== undefined;
  }

  get commandMenuKind(): "initial" | "postMove" | "extraMove" {
    if (this.pendingExtraMove) return "extraMove";
    return this.pendingPath ? "postMove" : "initial";
  }

  get unitCommands(): readonly UnitCommand[] {
    if (this.commandMenuKind === "extraMove") {
      return [BASIC_COMMANDS[0], { id: "end", label: "放棄" }];
    }
    const selectedClassCommand = this.selectedUnit
      ? CLASS_COMMANDS[this.selectedUnit.classId]
        ?? (this.battle.additionalActionIdsFor(this.selectedUnit.id).length > 0
          ? { id: "technique", label: "技術" }
          : undefined)
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
    if (!this.selectedUnit) return [];
    return [...new Set([
      ...techniqueActionIdsFor(this.selectedUnit),
      ...this.battle.additionalActionIdsFor(this.selectedUnit.id),
    ])];
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
    if (this.dialogueSkipConfirmOpen) return;
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
      const pages = promotionDialogueFor(promotionUnit, this.promotionGrantor);
      if (this.promotionDialogueIndex < pages.length - 1) {
        this.promotionDialogueIndex += 1;
      } else {
        this.promotionDialogueIndex = undefined;
        this.statusMessage = `${unitDisplayName(promotionUnit)}達到轉職條件；必須選擇下一職業。`;
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
    this.dialogueSkipConfirmOpen = false;
    this.dialogueSkipConfirmIndex = 1;
    if (this.groupCommandDialogueActive) this.advanceDialogue();
    else if (isStoryPhase(this.phase)) this.completeDialogue();
  }

  requestDialogueSkip(): void {
    if (!this.canRequestDialogueSkip || this.dialogueSkipConfirmOpen) return;
    this.dialogueSkipConfirmOpen = true;
    this.dialogueSkipConfirmIndex = 1;
    this.emit();
  }

  moveDialogueSkipSelection(delta: number): void {
    if (!this.dialogueSkipConfirmOpen || delta === 0) return;
    this.dialogueSkipConfirmIndex = this.dialogueSkipConfirmIndex === 0 ? 1 : 0;
    this.emit();
  }

  selectDialogueSkipChoice(index: number): void {
    if (!this.dialogueSkipConfirmOpen
      || index < 0
      || index > 1
      || index === this.dialogueSkipConfirmIndex) return;
    this.dialogueSkipConfirmIndex = index;
    this.emit();
  }

  activateDialogueSkipSelection(): void {
    if (!this.dialogueSkipConfirmOpen) return;
    if (this.dialogueSkipConfirmIndex === 0) this.confirmDialogueSkip();
    else this.cancelDialogueSkip();
  }

  confirmDialogueSkip(): void {
    if (!this.dialogueSkipConfirmOpen) return;
    this.dialogueSkipConfirmOpen = false;
    this.dialogueSkipConfirmIndex = 1;
    this.skipDialogue();
  }

  cancelDialogueSkip(): void {
    if (!this.dialogueSkipConfirmOpen) return;
    this.dialogueSkipConfirmOpen = false;
    this.dialogueSkipConfirmIndex = 1;
    this.emit();
  }

  skipScriptedSequence(): void {
    if (!this.canSkipScriptedSequence || !this.activeStoryId) return;
    this.dialogueSkipConfirmOpen = false;
    this.dialogueSkipConfirmIndex = 1;
    const storyId = this.activeStoryId;
    this.activeStoryId = undefined;
    this.dialogueIndex = 0;
    this.skippingScriptedSequence = true;
    this.busy = true;
    const events = this.consumeStageTrigger({ type: "story-completed", storyId });
    void this.processStageEvents(events)
      .then(() => {
        this.busy = false;
        this.skippingScriptedSequence = false;
        this.emit();
      })
      .catch((error: unknown) => {
        this.busy = false;
        this.skippingScriptedSequence = false;
        this.statusMessage = error instanceof Error ? error.message : "無法跳過目前過場。";
        this.emit();
      });
  }

  private completeDialogue(): void {
    const completed = this.phase;
    const storyId = this.activeStoryId;
    if (!storyId || !isStoryPhase(completed)) return;
    this.dialogueSkipConfirmOpen = false;
    this.dialogueSkipConfirmIndex = 1;
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
    void this.processStageEvents(events).then(() => this.emit());
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
      if (
        this.skippingScriptedSequence
        && event.presentation !== "none"
        && event.presentation !== "stage-00-opening-move"
        && event.presentation !== "stage-01-messenger-arrival"
        && storyPhaseForStageStory(this.battle.stage, event.presentation) === "scriptedStory"
      ) {
        const storyId = event.presentation;
        this.activeStoryId = undefined;
        this.dialogueIndex = 0;
        const skippedStoryEvents = this.consumeStageTrigger({ type: "story-completed", storyId });
        await this.processStageEvents(skippedStoryEvents);
      }
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
      this.statusMessage = `${this.stageRuntime.label}：選擇出場編隊。`;
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
    if (definition.type === "scripted-special-action") {
      await this.runScriptedSpecialAction(definition);
      return;
    }
    if (definition.type === "story-departures") {
      const removed = this.battle.removeStoryUnits(definition.actors);
      this.statusMessage = `${definition.statusText}（${removed.length} 人）`;
      const focus = this.battle.focus;
      if (focus) {
        this.cursor = { x: focus.x, y: focus.y };
        this.centerCamera(focus);
      }
      return;
    }
    if (definition.type === "story-reinforcements") {
      await this.runStoryReinforcements(definition);
      return;
    }
    if (definition.type === "scripted-unit-arrival") {
      await this.runScriptedUnitArrival(definition);
      return;
    }
    this.campaignRoute = definition.destination;
    if (isPlayableStageId(definition.destination)) {
      await this.enterStage(definition.destination, {
        ...this.battle.campaignSnapshot(),
        stageId: definition.destination,
      });
      return;
    }
    this.stageProgress = 1000;
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
    if (this.busy && !this.skippingScriptedSequence) return;
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
    if (this.skippingScriptedSequence) {
      actor.x = definition.destination.x;
      actor.y = definition.destination.y;
      this.cameraOrigin = clampCameraOrigin(this.battle.stage, this.battle.stage.viewport.initialOrigin);
      this.cursor = { ...definition.destination };
      return;
    }
    this.busy = true;
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

  private async runStoryReinforcements(
    definition: Extract<
      NonNullable<ReturnType<typeof stageSimulationEffectFor>>,
      { type: "story-reinforcements" }
    >,
  ): Promise<void> {
    const campaignRoster = this.battle.campaignSnapshot().roster;
    const units = definition.actors.map((actor): BattleUnit => {
      const sourceUnit = this.battle.unit(`${actor.source.side}:${actor.source.slot}`);
      const rosterEntry = campaignRoster.find(({ slot }) => slot === actor.source.slot);
      const classId = actor.forcedClassId
        ?? sourceUnit?.classId
        ?? rosterEntry?.classId
        ?? "soldier";
      const experience = sourceUnit?.experience ?? rosterEntry?.experience ?? 0;
      const unit: BattleUnit = {
        id: actor.id,
        side: actor.source.side,
        slot: actor.source.slot,
        classId,
        className: className(classId),
        name: actor.name,
        portrait: actor.portrait,
        x: actor.position.x,
        y: actor.position.y,
        life: sourceUnit?.life ?? rosterEntry?.life ?? 1,
        experience,
        acted: true,
        actionDisabled: sourceUnit?.actionDisabled ?? false,
        statuses: sourceUnit ? { ...sourceUnit.statuses } : emptyUnitStatuses(),
      };
      const maximumLife = this.battle.statsFor(unit).maxLife;
      unit.life = Math.max(0, Math.min(unit.life, maximumLife));
      if (!sourceUnit && !rosterEntry) unit.life = maximumLife;
      return unit;
    });

    this.phase = "scriptedMove";
    this.statusMessage = definition.statusText;
    if (this.skippingScriptedSequence) {
      this.battle.appendStoryUnits(units);
      const finalUnit = units.at(-1);
      if (finalUnit) {
        this.battle.focusId = finalUnit.id;
        this.cursor = { x: finalUnit.x, y: finalUnit.y };
        this.centerCamera(finalUnit);
      }
      return;
    }

    this.busy = true;
    for (const unit of units) {
      // Native 1000:533E focuses/redraws before writing each cell. That means
      // the next focus reveals the previous reinforcement rather than the
      // current write appearing immediately.
      this.cursor = { x: unit.x, y: unit.y };
      this.centerCamera(unit);
      this.emit();
      await pause(this.mapCombatDelay(3));
      this.battle.appendStoryUnits([unit]);
    }
    const finalUnit = units.at(-1);
    if (finalUnit) {
      this.battle.focusId = finalUnit.id;
      this.cursor = { x: finalUnit.x, y: finalUnit.y };
      this.centerCamera(finalUnit);
    }
    this.emit();
    await pause(this.mapCombatDelay(3));
    this.busy = false;
  }

  private async runScriptedUnitArrival(
    definition: Extract<
      NonNullable<ReturnType<typeof stageSimulationEffectFor>>,
      { type: "scripted-unit-arrival" }
    >,
  ): Promise<void> {
    const actor = this.battle.unit(definition.actorId);
    const target = this.battle.units.find(
      (unit) => unit.side === definition.target.side
        && unit.portrait === definition.target.portrait
        && !unit.id.startsWith("story:"),
    );
    if (!actor || !target) throw new Error("scripted arrival actor or target is missing");
    this.phase = "scriptedMove";
    this.statusMessage = definition.statusText;
    this.battle.focusId = actor.id;
    this.cursor = { x: actor.x, y: actor.y };
    this.centerCamera(actor);
    const path = this.battle.scriptedPath(actor.id, target, definition.movementBudget);
    if (this.skippingScriptedSequence) {
      const destination = path.at(-1);
      if (destination) {
        actor.x = destination.x;
        actor.y = destination.y;
      }
      this.battle.focusId = target.id;
      this.cursor = { x: target.x, y: target.y };
      this.centerCamera(target);
      return;
    }
    this.busy = true;
    this.emit();
    await this.animateUnitPath(actor.id, path, "scripted");
    this.battle.focusId = target.id;
    this.cursor = { x: target.x, y: target.y };
    this.centerCamera(target);
    this.busy = false;
  }

  private async runScriptedSpecialAction(
    definition: Extract<
      NonNullable<ReturnType<typeof stageSimulationEffectFor>>,
      { type: "scripted-special-action" }
    >,
  ): Promise<void> {
    if (this.busy && !this.skippingScriptedSequence) return;
    const actor: BattleUnit = {
      id: definition.actor.id,
      side: definition.actor.side,
      slot: definition.actor.slot,
      classId: definition.actor.classId,
      className: className(definition.actor.classId),
      name: definition.actor.name,
      portrait: definition.actor.portrait,
      x: definition.target.x,
      y: definition.target.y,
      life: 1,
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
    const result = prepareScriptedLightning4(
      this.battle.units,
      this.battle.stage,
      definition.target,
      definition.targetSide,
      actor.id,
    );
    if (this.skippingScriptedSequence) {
      this.specialActionPresentation = undefined;
      this.specialActionPresentationTrace = [];
      this.lastSpecialAction = this.battle.commitScriptedSpecialAction(
        result,
        definition.preserveUnitIds,
      );
      this.statusMessage = `究級落雷造成 ${result.damage} 點傷害。`;
      return;
    }
    this.busy = true;
    this.phase = "scriptedMove";
    this.cursor = { ...definition.target };
    this.centerCamera(definition.target);
    this.statusMessage = definition.statusText;
    this.emit();
    await this.presentSpecialAction(actor, undefined, result);
    this.lastSpecialAction = this.battle.commitScriptedSpecialAction(
      result,
      definition.preserveUnitIds,
    );
    this.busy = false;
    this.statusMessage = `究級落雷造成 ${result.damage} 點傷害。`;
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
      || (this.commandMenuKind !== "initial" && this.commandMenuKind !== "extraMove")
      || !unit
    ) return;
    this.reachable = this.commandMenuKind === "extraMove"
      ? this.battle.extraMovementRange(unit.id)
      : this.battle.reachableCells(unit.id);
    this.actionMode = "move";
    this.statusMessage = this.pendingExtraMove
      ? "藍色格為攻擊後可再次移動的範圍；此次不能再攻擊。"
      : "藍色格為可移動範圍；可選原格保留位置。";
    this.emit();
  }

  chooseAttack(): void {
    const unit = this.selectedUnit;
    if (
      this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || this.commandMenuKind === "extraMove"
      || !unit
    ) return;
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
    if (this.commandMenuKind === "extraMove") return;
    const actionId = this.selectedUnit?.classId === "archer"
      ? "archer-shot"
      : this.selectedUnit?.classId === "crossbow"
        ? "crossbow-shot"
        : this.selectedUnit?.classId === "magic-archer"
          ? "magic-archer-shot"
          : undefined;
    if (actionId) this.chooseSpecialAction(actionId);
  }

  chooseTechnique(): void {
    const unit = this.selectedUnit;
    if (
      this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || this.commandMenuKind !== "initial"
      || !unit
      || this.techniqueActions.length === 0
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
    this.statusMessage = definition.target === "empty-cell"
      ? actionId === CLASS_SHOWDOWN_TELEPORT_ACTION_ID
        ? "選擇半龍戰士要瞬移到的空格。"
        : "選擇工兵移動並鋪設鐵板的空格。"
      : `選擇「${definition.label}」的${definition.target === "ally" ? "我方" : "敵方"}目標。`;
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
      || (this.commandMenuKind !== "postMove" && this.commandMenuKind !== "extraMove")
    ) return;
    if (this.commandMenuKind === "extraMove") {
      this.finishUnitAction("已放棄飛龍騎士的攻擊後移動；單位行動結束。", true);
      return;
    }
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
    this.statusMessage = `${unitDisplayName(unit)}已由${previousClassName}轉職為${unit.className}；經驗歸零，生命保持 ${result.life}。`;

    const next = this.promotionUnit;
    if (next) {
      this.promotionDialogueIndex = 0;
      this.battle.focusId = next.id;
      this.cursor = { x: next.x, y: next.y };
      this.centerCamera(next);
      this.statusMessage = `${unitDisplayName(next)}也達到轉職條件；必須選擇下一職業。`;
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
      const returnToTechnique = this.selectedActionId !== "archer-shot"
        && this.selectedActionId !== "crossbow-shot"
        && this.selectedActionId !== "magic-archer-shot";
      this.actionRange = [];
      this.targets = [];
      this.selectedActionId = undefined;
      this.actionMode = returnToTechnique ? "techniqueMenu" : "actionMenu";
    } else if (this.actionMode === "techniqueMenu") {
      this.techniqueIndex = 0;
      this.actionMode = "actionMenu";
    } else if (this.actionMode === "actionMenu") {
      if (this.commandMenuKind === "extraMove") {
        this.statusMessage = "攻擊已經提交；請選擇額外移動或放棄。";
        this.emit();
        return;
      }
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
    const requiresTargetUnit = definition?.target === "ally" || definition?.target === "enemy";
    const target = requiresTargetUnit ? this.battle.unitAt(position) : undefined;
    if (!actor || !actionId || !definition || this.busy) return;
    if (actionId === "iron-plate" || actionId === "obstacle") {
      await this.commitConstruction(actor, position, actionId);
      return;
    }
    if (requiresTargetUnit && !target) return;
    try {
      const prepared = this.battle.prepareSpecialAction({
        actionId,
        actorId: actor.id,
        targetId: target?.id,
        target: definition.target === "self-area" ? undefined : position,
        ...(actionId === "stomp-1" || actionId === "stomp-2" || actionId === "stomp-3"
          ? { viewportOrigin: { ...this.cameraOrigin } }
          : {}),
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

      if (actionId === "prayer") {
        await this.presentPrayerAction(actorPresentation, prepared);
        this.lastSpecialAction = this.battle.completePreparedPrayer(prepared);
        const counts = Object.fromEntries(
          (["healing", "experience", "attackUp", "defenseUp"] as const).map((outcome) => [
            outcome,
            prepared.affectedUnits.filter(({ prayerOutcome }) => prayerOutcome === outcome).length,
          ]),
        );
        this.statusMessage = prepared.affectedUnits.length === 0
          ? "祈禱沒有回應。"
          : `祈禱回應 ${prepared.affectedUnits.length} 名我方：生命 ${counts.healing}、經驗 ${counts.experience}、攻擊 ${counts.attackUp}、防禦 ${counts.defenseUp}。`;
        const promotionPause = this.pauseForPromotions();
        if (promotionPause) await promotionPause;
        this.busy = false;
        const ended = this.resolveOutcome();
        this.emit();
        if (!ended && this.battle.playerManualPhaseComplete()) {
          void this.runTurnPhases("autonomous");
        }
        return;
      }

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
        || actionId === "ice-2"
        || actionId === "ice-3"
        || actionId === "ice-4"
        ? `冰雪擊退 ${moved} 名敵人，冰封 ${frozen} 名；其下一次本陣營行動被跳過，期間不能成為攻擊或治療目標。`
        : actionId === "dispel" && targetPresentation
          ? `${targetPresentation.name}的${cleansedFrozen ? "冰封及異常狀態" : "異常狀態"}已由破邪解除。`
        : actionId === "attack-up" && targetPresentation
          ? `${targetPresentation.name}的攻擊提升 20，狀態重置為 3。`
        : actionId === "defense-up" && targetPresentation
          ? `${targetPresentation.name}的防禦提升 20，狀態重置為 3。`
        : actionId === "magic-guard" && targetPresentation
          ? `${targetPresentation.name}獲得防魔；可抵消下一次適用魔法，未使用則於完整回合邊界消失。`
        : actionId === "poison" && targetPresentation
          ? result.blockReason === "classImmune"
            ? `${targetPresentation.name}完整承受毒霧演出，但其職業免疫中毒。`
            : `${targetPresentation.name}中毒，狀態重置為 3。`
        : actionId === "confusion" && targetPresentation
          ? result.blockReason === "classImmune"
            ? `${targetPresentation.name}完整承受混亂演出，但其職業免疫狀態寫入。`
            : `${targetPresentation.name}陷入混亂，狀態重置為 3。`
        : actionId === "attack-down" && targetPresentation
          ? `${targetPresentation.name}的攻擊下降 20，狀態重置為 3。`
        : actionId === "defense-down" && targetPresentation
          ? `${targetPresentation.name}的防禦下降 20，狀態重置為 3。`
        : actionId === "spell-seal" && targetPresentation
          ? result.blockReason === "classImmune"
            ? `${targetPresentation.name}完整承受禁咒演出，但龍職業免疫狀態寫入。`
            : `${targetPresentation.name}遭到禁咒，狀態重置為 3。`
        : actionId === CLASS_SHOWDOWN_TELEPORT_ACTION_ID
          ? `${actorPresentation.name}已瞬移至（${result.target.x}, ${result.target.y}）。`
        : actionId === "lightning-1" || actionId === "lightning-2" || actionId === "lightning-3"
          || actionId === "lightning-4"
          ? `落雷對 ${result.affectedUnits.filter(({ blockReason }) => blockReason !== "frozen").length} 名敵人造成共 ${result.damage} 點傷害。`
          : actionId === "stomp-1" || actionId === "stomp-2" || actionId === "stomp-3"
            ? `${definition.label}對 ${result.affectedUnits.filter(({ blocked }) => !blocked).length} 名敵人造成共 ${result.damage} 點傷害。`
          : actionId === "recovery-1" || actionId === "recovery-2" || actionId === "recovery-3"
            ? `回復使 ${result.affectedUnits.filter(({ healing }) => healing > 0).length} 名友軍恢復共 ${result.healing} 點生命。`
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

  private async commitConstruction(
    actor: BattleUnit,
    position: Position,
    actionId: ConstructionActionId,
  ): Promise<void> {
    const label = BATTLE_ACTION_DEFINITIONS[actionId].label;
    try {
      const prepared = this.battle.prepareConstruction(actor.id, position, actionId);
      this.busy = true;
      this.statusMessage = `${actor.name}前往${actionId === "iron-plate" ? "鋪設" : "設置"}${label}……`;
      this.resetAction();
      this.markHintSeen();
      this.emit();
      const completed = await this.presentPreparedUnitPath(actor.id, prepared.path);
      if (!completed) throw new Error(`${label}移動路徑已失效`);
      this.lastConstruction = this.battle.commitConstruction(prepared);
      const changed = this.lastConstruction.terrainMutations.filter(({ changed }) => changed).length;
      this.statusMessage = `${label}${actionId === "iron-plate" ? "鋪設" : "設置"}完成：覆蓋 ${this.lastConstruction.terrainMutations.length} 格，其中 ${changed} 格為新地形。`;
      this.busy = false;
      this.finishUnitAction(this.statusMessage, true);
    } catch (error) {
      this.busy = false;
      this.movementPresentation = undefined;
      this.statusMessage = error instanceof Error ? error.message : `${label}構築無效。`;
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
      displayNativeTicks = nativeTicks,
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
          : this.mapCombatDelay(displayNativeTicks),
      );
    };

    if (result.actionId === "archer-shot" || result.actionId === "crossbow-shot") {
      await present("shootBlank", -1, 6);
      for (let frame = 0; frame < 8; frame += 1) {
        await present("shootHit", frame, 6);
      }
      await present("shootBlank", -1, 6);
    } else if (result.actionId === "magic-archer-shot") {
      this.queueAudioCue(83, "magic-archer-shot-start", "magic");
      for (let index = 0; index < result.effectCells.length; index += 1) {
        await present("shootLineGrow", index, 20);
      }
      for (let frame = 0; frame < 8; frame += 1) {
        await present("shootLineFinish", frame, 20);
      }
    } else if (result.actionId === "fire-1"
      || result.actionId === "fire-2"
      || result.actionId === "fire-3"
      || result.actionId === "fire-4") {
      if (result.actionId === "fire-1") {
        this.queueAudioCue(83, `${result.actionId}-start`, "magic");
        for (let frame = 0; frame < 7; frame += 1) {
          await present("fireEffect", frame, 10);
        }
      } else {
        let frame = 0;
        let elapsedNativeTicks = 0;
        let audioRequestIndex = 0;
        const fire = result.actionId === "fire-2"
          ? actionPresentationCatalog().fire2
          : result.actionId === "fire-3"
            ? actionPresentationCatalog().fire3
            : actionPresentationCatalog().fire4;
        const queueDueFireAudio = (): void => {
          while (audioRequestIndex < fire.audioRequests.length) {
            const request = fire.audioRequests[audioRequestIndex];
            if (!request || request.afterFixedWaitNativeTicks > elapsedNativeTicks) return;
            const [group, record] = request.resource.split("/");
            this.queueAudioCue(
              Number(record),
              request.afterFixedWaitNativeTicks === 0
                ? `${result.actionId}-start`
                : `${result.actionId}-${request.afterFixedWaitNativeTicks}`,
              group === "MAGIC" ? "magic" : "e",
            );
            audioRequestIndex += 1;
          }
        };
        for (const phase of fire.phases) {
          for (const _descriptor of phase.descriptorSequence) {
            queueDueFireAudio();
            await present("fireEffect", frame, phase.waitPerDrawNativeTicks);
            elapsedNativeTicks += phase.waitPerDrawNativeTicks;
            frame += 1;
          }
        }
      }
    } else if (result.actionId === "heal-1"
      || result.actionId === "heal-2"
      || result.actionId === "heal-3") {
      if (result.actionId === "heal-1") {
        this.queueAudioCue(36, "heal-1-start", "e");
        for (let frame = 0; frame < 39; frame += 1) {
          await present("healPrimary", frame, 5);
        }
        await present("healBlank", -1, 5);
        for (let frame = 0; frame < 5; frame += 1) {
          await present("healTail", frame, 15);
        }
      } else if (result.actionId === "heal-2") {
        this.queueAudioCue(36, "heal-2-start", "e");
        const [primary, tail] = actionPresentationCatalog().heal2.phases;
        for (let frame = 0; frame < primary.descriptorSequence.length; frame += 1) {
          await present("healPrimary", frame, primary.waitPerDrawNativeTicks);
        }
        for (let frame = 0; frame < tail.descriptorSequence.length; frame += 1) {
          await present("healTail", frame, tail.waitPerDrawNativeTicks);
        }
      } else {
        const heal = actionPresentationCatalog().heal3;
        let primaryFrame = 0;
        let elapsedNativeTicks = 0;
        let audioRequestIndex = 0;
        const queueDueHealAudio = (): void => {
          while (audioRequestIndex < heal.audioRequests.length) {
            const request = heal.audioRequests[audioRequestIndex];
            if (!request || request.afterFixedWaitNativeTicks > elapsedNativeTicks) return;
            if (request.resource !== "E/36") {
              throw new Error(`unsupported advanced-heal audio resource ${request.resource}`);
            }
            this.queueAudioCue(36, "heal-3-bloom", "e");
            audioRequestIndex += 1;
          }
        };
        queueDueHealAudio();
        for (const primary of heal.phases.slice(0, -1)) {
          for (const _descriptor of primary.descriptorSequence) {
            await present("healPrimary", primaryFrame, primary.waitPerDrawNativeTicks);
            primaryFrame += 1;
            elapsedNativeTicks += primary.waitPerDrawNativeTicks;
            queueDueHealAudio();
          }
        }
        const tail = heal.phases.at(-1);
        if (!tail) throw new Error("advanced-heal tail phase missing");
        for (let frame = 0; frame < tail.descriptorSequence.length; frame += 1) {
          await present("healTail", frame, tail.waitPerDrawNativeTicks);
          elapsedNativeTicks += tail.waitPerDrawNativeTicks;
          queueDueHealAudio();
        }
      }
    } else if (result.actionId === "lightning-1"
      || result.actionId === "lightning-2"
      || result.actionId === "lightning-3"
      || result.actionId === "lightning-4") {
      const presentation = actionPresentationCatalog();
      const lightning = result.actionId === "lightning-4"
        ? presentation.lightning4
        : result.actionId === "lightning-3"
          ? presentation.lightning3
        : result.actionId === "lightning-2"
          ? presentation.lightning2
          : presentation.lightning1;
      let elapsedNativeTicks = 0;
      let audioRequestIndex = 0;
      const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ?? false;
      const queueDueLightningAudio = (): void => {
        while (audioRequestIndex < lightning.audioRequests.length) {
          const request = lightning.audioRequests[audioRequestIndex];
          if (!request || request.afterFixedWaitNativeTicks > elapsedNativeTicks) return;
          const match = /^E\/(\d+)$/.exec(request.resource);
          if (!match) throw new Error(`unsupported lightning audio resource ${request.resource}`);
          const reason = result.actionId === "lightning-1"
            ? "lightning-1-impact"
            : `${result.actionId}-${audioRequestIndex === 0 ? "start" : "impact"}`;
          this.queueAudioCue(Number(match[1]), reason, "e");
          audioRequestIndex += 1;
        }
      };
      let draw = 0;
      queueDueLightningAudio();
      if (reducedMotion) {
        const mainDrawCount = lightning.phases.reduce(
          (total, phase) => total + phase.descriptorSequence.length,
          0,
        );
        const mainNativeTicks = lightning.phases.reduce(
          (total, phase) => total + phase.descriptorSequence.length * phase.waitPerDrawNativeTicks,
          0,
        );
        const representativeDraw = Math.max(0, Math.floor(mainDrawCount * 2 / 3));
        await present("lightningMain", representativeDraw, mainNativeTicks, undefined, 12);
        elapsedNativeTicks += mainNativeTicks;
        queueDueLightningAudio();
      } else {
        for (const phase of lightning.phases) {
          for (const _descriptor of phase.descriptorSequence) {
            await present("lightningMain", draw, phase.waitPerDrawNativeTicks);
            draw += 1;
            elapsedNativeTicks += phase.waitPerDrawNativeTicks;
            queueDueLightningAudio();
          }
        }
      }
      const hit = lightning.commonHit;
      if (reducedMotion) {
        await present(
          "lightningHit",
          0,
          hit.iterations * hit.waveDrawsPerIteration * hit.waitPerWaveDrawNativeTicks,
          undefined,
          12,
        );
        await present(
          "lightningCleanup",
          0,
          hit.cleanup.drawCount * hit.cleanup.waitPerDrawNativeTicks,
          undefined,
          12,
        );
      } else {
        for (let iteration = 0; iteration < hit.iterations; iteration += 1) {
          for (let wave = 0; wave < hit.waveDrawsPerIteration; wave += 1) {
            await present("lightningHit", iteration * hit.waveDrawsPerIteration + wave, hit.waitPerWaveDrawNativeTicks);
          }
        }
        for (let frame = 0; frame < hit.cleanup.drawCount; frame += 1) {
          await present("lightningCleanup", frame, hit.cleanup.waitPerDrawNativeTicks);
        }
      }
    } else if (result.actionId === "ice-1"
      || result.actionId === "ice-2"
      || result.actionId === "ice-3"
      || result.actionId === "ice-4") {
      const presentation = actionPresentationCatalog();
      const ice = result.actionId === "ice-4"
        ? presentation.ice4
        : result.actionId === "ice-3"
          ? presentation.ice3
          : result.actionId === "ice-2"
            ? presentation.ice2
            : presentation.ice1;
      for (let cycle = 0; cycle < ice.cycles; cycle += 1) {
        this.queueAudioCue(50, `${result.actionId}-cycle-${cycle + 1}`, "un");
        for (let frame = 0; frame < ice.cycle.drawCount; frame += 1) {
          await present("iceExpansion", cycle * ice.cycle.drawCount + frame, ice.cycle.waitPerDrawNativeTicks);
        }
      }
    } else if (result.actionId === "recovery-1"
      || result.actionId === "recovery-2"
      || result.actionId === "recovery-3") {
      const recovery = result.actionId === "recovery-3"
        ? actionPresentationCatalog().recovery3
        : result.actionId === "recovery-2"
          ? actionPresentationCatalog().recovery2
          : actionPresentationCatalog().recovery1;
      this.queueAudioCue(36, `${result.actionId}-start`, "e");
      for (let frame = 0; frame < recovery.presentation.drawCount; frame += 1) {
        await present("recoveryEffect", frame, recovery.presentation.waitPerDrawNativeTicks);
      }
    } else if (result.actionId === "attack-up") {
      const attackUp = actionPresentationCatalog().attackUp;
      const phase = attackUp.phases[0];
      this.queueAudioCue(51, "attack-up-start", "un");
      for (let frame = 0; frame < phase.runtimeTileCodePairs.length; frame += 1) {
        await present("statusEffect", frame, phase.waitPerDrawNativeTicks);
      }
    } else if (result.actionId === "defense-up") {
      const defenseUp = actionPresentationCatalog().defenseUp;
      const phase = defenseUp.phases[0];
      this.queueAudioCue(52, "defense-up-start", "un");
      for (let frame = 0; frame < phase.descriptorSequence.length; frame += 1) {
        await present("statusEffect", frame, phase.waitPerDrawNativeTicks);
      }
    } else if (result.actionId === "magic-guard") {
      const magicGuard = actionPresentationCatalog().magicGuard;
      const phase = magicGuard.phases[0];
      this.queueAudioCue(51, "magic-guard-start", "un");
      for (let frame = 0; frame < phase.runtimeTileCodePairs.length; frame += 1) {
        await present("statusEffect", frame, phase.waitPerDrawNativeTicks);
      }
    } else if (result.actionId === "poison") {
      const poison = actionPresentationCatalog().poison;
      let frame = 0;
      for (let draw = 0; draw < poison.phases[0].runtimeTileCodeStates.length; draw += 1) {
        await present("poisonEffect", frame, poison.phases[0].waitPerDrawNativeTicks);
        frame += 1;
      }
      this.queueAudioCue(58, "poison-cloud-start", "e");
      for (let draw = 0; draw < poison.phases[1].descriptorSequence.length; draw += 1) {
        await present("poisonEffect", frame, poison.phases[1].waitPerDrawNativeTicks);
        frame += 1;
      }
    } else if (result.actionId === "confusion") {
      const confusion = actionPresentationCatalog().confusion;
      const phase = confusion.phases[0];
      for (let frame = 0; frame < phase.descriptorSequence.length; frame += 1) {
        await present("statusEffect", frame, phase.waitPerDrawNativeTicks);
      }
    } else if (result.actionId === "attack-down") {
      const attackDown = actionPresentationCatalog().attackDown;
      const phase = attackDown.phases[0];
      this.queueAudioCue(8, "attack-down-start", "e");
      for (let frame = 0; frame < phase.descriptorSequence.length; frame += 1) {
        await present("statusEffect", frame, phase.waitPerDrawNativeTicks);
      }
    } else if (result.actionId === "defense-down") {
      const defenseDown = actionPresentationCatalog().defenseDown;
      const phase = defenseDown.phases[0];
      this.queueAudioCue(8, "defense-down-start", "e");
      for (let frame = 0; frame < phase.descriptorSequence.length; frame += 1) {
        await present("statusEffect", frame, phase.waitPerDrawNativeTicks);
      }
    } else if (result.actionId === "spell-seal") {
      const spellSeal = actionPresentationCatalog().spellSeal;
      const phase = spellSeal.phases[0];
      for (let frame = 0; frame < phase.descriptorSequence.length; frame += 1) {
        await present("statusEffect", frame, phase.waitPerDrawNativeTicks);
      }
    } else if (result.actionId === "stomp-1"
      || result.actionId === "stomp-2"
      || result.actionId === "stomp-3") {
      const stomp = result.actionId === "stomp-3"
        ? actionPresentationCatalog().stomp3
        : result.actionId === "stomp-2"
          ? actionPresentationCatalog().stomp2
          : actionPresentationCatalog().stomp1;
      for (const step of buildStompPresentationSteps(stomp.presentation)) {
        await present(
          step.graphicDrawIndex === undefined ? "stompPageToggle" : "stompEffect",
          step.index,
          step.explicitNativeTicks,
          undefined,
          step.displayNativeTicks,
        );
        if (step.audioAfter) {
          this.queueAudioCue(82, `${result.actionId}-impact-${step.index}`, "magic");
        }
      }
    } else if (result.actionId === CLASS_SHOWDOWN_TELEPORT_ACTION_ID) {
      for (let frame = 0; frame < 8; frame += 1) {
        await present("teleportEffect", frame, 3);
      }
    } else {
      const dispel = actionPresentationCatalog().dispel;
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

  private async presentPrayerAction(
    actor: BattleUnit,
    prepared: PreparedBattleAction,
  ): Promise<void> {
    this.specialActionPresentationTrace = [];
    const displayedLifeByUnitId: Record<string, number> = Object.fromEntries(
      prepared.affectedUnits.map((affected) => [affected.unitId, affected.lifeBefore]),
    );
    const maximumHoldNativeTicks = actionPresentationCatalog()
      .prayer.presentation.resultHold.maximumNativeTicksPerTriggeredUnit;

    for (const [index, affected] of prepared.affectedUnits.entries()) {
      const target = this.battle.unit(affected.unitId);
      if (!target) throw new Error("stale prepared prayer action");
      await this.focusCameraOnAction(affected.positionBefore);
      const targetPresentation = { ...target, statuses: { ...target.statuses } };
      this.specialActionPresentation = {
        actor,
        target: targetPresentation,
        center: { ...affected.positionBefore },
        result: prepared.result,
        phase: "prayerEffect",
        frame: index,
        nativeTicks: maximumHoldNativeTicks,
        displayedLifeByUnitId: { ...displayedLifeByUnitId },
        lifeChangeUnitId: affected.unitId,
      };
      this.specialActionPresentationTrace.push({
        phase: "prayerEffect",
        frame: index,
        nativeTicks: maximumHoldNativeTicks,
        displayedLifeByUnitId: { ...displayedLifeByUnitId },
        lifeChangeUnitId: affected.unitId,
      });
      this.emit();

      this.battle.commitPreparedPrayerOutcome(prepared, index);
      displayedLifeByUnitId[affected.unitId] = affected.lifeAfter;
      this.emit();

      await new Promise<void>((resolve) => {
        const timeout = globalThis.setTimeout(resolve, this.mapCombatDelay(maximumHoldNativeTicks));
        this.prayerHoldSkip = () => {
          globalThis.clearTimeout(timeout);
          resolve();
        };
      });
      this.prayerHoldSkip = undefined;
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
      this.statusMessage = `造成 ${result.damage} 點傷害${result.counterDamage ? `，受到 ${result.counterDamage} 點反擊` : ""}${result.splitCount ? `，水戰士分裂為 ${result.splitCount} 個並共享生命` : ""}。`;
      this.resetAction();
      this.markHintSeen();
      await this.presentOrdinaryCombat(attackerPresentation, defenderPresentation, result);
      const survivingAttacker = this.battle.unit(result.attackerId);
      const offersExtraMove = survivingAttacker
        && this.battle.isPlayerControllableAlly(survivingAttacker.id)
        && this.battle.canUseFlyingDragonExtraMove(result);
      if (offersExtraMove) {
        this.busy = false;
        this.selectedId = survivingAttacker.id;
        this.pendingOrigin = { x: survivingAttacker.x, y: survivingAttacker.y };
        this.pendingPath = undefined;
        this.pendingExtraMove = true;
        this.commandIndex = 0;
        this.cursor = { x: survivingAttacker.x, y: survivingAttacker.y };
        this.actionMode = "actionMenu";
        this.statusMessage = "飛龍騎士可用目前移動力的一半再次移動，或放棄並結束行動。";
        this.emit();
        return;
      }
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
    this.statusMessage = `${unitDisplayName(unit)}達到轉職條件；必須選擇下一職業。`;
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
    this.pendingExtraMove = false;
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
    this.statusMessage = `${this.groupCommandSpeaker?.name ?? "主將"}下令全軍休息。`;
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
    this.statusMessage = `${leader.name}下令其餘部隊跟隨主將。`;
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
    this.statusMessage = `${this.groupCommandSpeaker?.name ?? "主將"}下令其餘部隊自由行動。`;
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
    this.restartBattle(this.stageRuntime.retry.retreatStatusText);
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
      ? "友軍 NPC 軍團獨立行動。"
      : mode === "follow"
        ? "玩家軍團接管：其餘可操控角色跟隨主將。"
        : "玩家軍團接管：其餘可操控角色自由行動。";
    this.emit();

    const manualIds = mode === "autonomous"
      ? []
      : this.battle.alliedActionOrder(true)
        .filter((id) => this.battle.isPlayerControllableAlly(id));
    const automaticIds = this.battle.alliedActionOrder(false);
    const runQueue = async (ids: readonly string[], followId?: string): Promise<boolean> => {
      for (const id of ids) {
        const action = this.battle.planAlliedAiAction(id, followId);
        if (!action) continue;
        if (await this.runAlliedAiAction(action)) return true;
      }
      return false;
    };

    if (await runQueue(manualIds, mode === "follow" ? leaderId : undefined)) {
      this.busy = false;
      this.emit();
      return;
    }

    if (automaticIds.length > 0 && mode !== "autonomous") {
      this.statusMessage = "友軍 NPC 軍團獨立行動；不受玩家集團命令控制。";
      this.emit();
    }
    if (await runQueue(automaticIds)) {
      this.busy = false;
      this.emit();
      return;
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
      : this.stageRuntime.enemyPhaseStatusText;
    this.emit();
    if (enemyPhaseUpdate.activatedGroupIds.length > 0) {
      await pause(this.mapCombatDelay(40));
    }
    const pendingEnemyIds = new Set(this.battle.enemyActionOrder());
    while (pendingEnemyIds.size > 0) {
      const id = this.battle.nextEnemyActionId([...pendingEnemyIds]);
      if (!id) break;
      pendingEnemyIds.delete(id);
      if (!this.battle.unit(id)) continue;
      if (!this.battle.hasRouteEnemy() || this.battle.unit(id)?.statuses.confusion) {
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
    const commander = this.battle.groupCommander ?? this.battle.unit("1:0");
    if (commander) {
      this.battle.focusId = commander.id;
      this.cursor = { x: commander.x, y: commander.y };
      this.centerCamera(commander);
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
    this.scheduleFrozenPlayerPhaseSkip();
  }

  private scheduleFrozenPlayerPhaseSkip(): void {
    if (this.phase !== "player" || !this.battle.allPlayerControllableAlliesFrozen()) return;
    this.statusMessage = `第 ${this.battle.round} 回合：我方可控單位均被冰封，自動跳過玩家階段。`;
    this.emit();
    queueMicrotask(() => {
      if (this.phase === "player" && !this.busy
        && this.battle.allPlayerControllableAlliesFrozen()) {
        void this.runTurnPhases("autonomous");
      }
    });
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
    this.statusMessage = movementKind === "enemy"
      ? `${unit.name}正在自動行動。`
      : this.battle.isPlayerControllableAlly(unit.id)
        ? `玩家軍團：${unit.name}正在執行集團命令。`
        : `友軍 NPC 軍團：${unit.name}正在獨立行動。`;
    this.emit();

    if (
      (action.kind === "move" || action.kind === "attack" || action.kind === "special"
        || action.kind === "route-pulse")
      && action.path.length > 1
    ) {
      await this.animateUnitPath(unit.id, action.path, movementKind);
      unit = this.battle.unit(action.unitId);
      if (!unit) return this.resolveOutcome();
    }

    if (action.kind === "route-pulse") {
      const prepared = this.battle.prepareRoutePulse(unit.id, action.path);
      this.statusMessage = action.path.length > 1
        ? `${unit.name}向前引導結界；力場即將發動。`
        : `${unit.name}的結界未前進；力場仍然發動。`;
      await this.presentRoutePulse(prepared);
      this.lastRoutePulse = this.battle.commitRoutePulse(prepared);
      this.statusMessage = prepared.affectedUnits.length > 0
        ? `力場命中 ${prepared.affectedUnits.length} 名結界外我方；目前生命減半。`
        : "所有我方都在結界安全區內。";
    } else if (action.kind === "special" && action.targetId && action.actionId) {
      const target = this.battle.unit(action.targetId);
      if (target) {
        try {
          const definition = BATTLE_ACTION_DEFINITIONS[action.actionId];
          const prepared = this.battle.prepareSpecialAction({
            actionId: action.actionId,
            actorId: unit.id,
            ...(definition.target === "self-area" ? {} : { targetId: target.id }),
            ...(action.actionId === "stomp-1"
              || action.actionId === "stomp-2"
              || action.actionId === "stomp-3"
              ? { viewportOrigin: { ...this.cameraOrigin } }
              : {}),
          });
          const actorPresentation = { ...unit, statuses: { ...unit.statuses } };
          const targetPresentation = { ...target, statuses: { ...target.statuses } };
          const affectedPresentations = prepared.affectedUnits
            .map(({ unitId }) => this.battle.unit(unitId))
            .filter((candidate): candidate is BattleUnit => candidate !== undefined)
            .map((candidate) => ({ ...candidate, statuses: { ...candidate.statuses } }));
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
          for (const affected of result.affectedUnits.filter(({ died }) => died)) {
            const presentation = affectedPresentations.find(({ id }) => id === affected.unitId);
            if (presentation) await this.presentSpecialDeath(actorPresentation, presentation, result);
          }
          const moved = result.affectedUnits.filter(({ moved }) => moved).length;
          const frozen = result.affectedUnits.filter(({ actionDisabledBefore, actionDisabledAfter }) =>
            !actionDisabledBefore && actionDisabledAfter).length;
          this.statusMessage = action.actionId === "ice-1"
            || action.actionId === "ice-2"
            || action.actionId === "ice-3"
            || action.actionId === "ice-4"
            ? `${unit.name}以冰雪擊退 ${moved} 名敵人，冰封 ${frozen} 名。`
            : action.actionId === "attack-up"
              ? `${unit.name}使${target.name}的攻擊提升 20，狀態重置為 3。`
            : action.actionId === "defense-up"
              ? `${unit.name}使${target.name}的防禦提升 20，狀態重置為 3。`
            : action.actionId === "magic-guard"
              ? `${unit.name}使${target.name}獲得防魔。`
            : action.actionId === "poison"
              ? result.blockReason === "classImmune"
                ? `${target.name}免疫中毒。`
                : `${unit.name}使${target.name}中毒，狀態重置為 3。`
            : action.actionId === "confusion"
              ? result.blockReason === "classImmune"
                ? `${target.name}免疫混亂。`
                : `${unit.name}使${target.name}陷入混亂，狀態重置為 3。`
            : action.actionId === "attack-down"
              ? `${unit.name}使${target.name}的攻擊下降 20，狀態重置為 3。`
            : action.actionId === "defense-down"
              ? `${unit.name}使${target.name}的防禦下降 20，狀態重置為 3。`
            : action.actionId === "spell-seal"
              ? result.blockReason === "classImmune"
                ? `${target.name}免疫禁咒。`
                : `${unit.name}使${target.name}遭到禁咒，狀態重置為 3。`
            : result.blocked
            ? `${target.name}的魔法防禦抵消了攻擊。`
            : result.healing > 0
              ? `${unit.name}使${target.name}恢復 ${result.healing} 點生命。`
              : action.actionId === "stomp-1"
                || action.actionId === "stomp-2"
                || action.actionId === "stomp-3"
                ? `${unit.name}以${BATTLE_ACTION_DEFINITIONS[action.actionId].label}造成共 ${result.damage} 點傷害。`
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
        this.statusMessage = `${unit.name}造成 ${result.damage} 點傷害${result.counterDamage ? `，受到 ${result.counterDamage} 點反擊` : ""}${result.splitCount ? `，水戰士分裂為 ${result.splitCount} 個並共享生命` : ""}。`;
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

  private async presentRoutePulse(result: PreparedRoutePulse): Promise<void> {
    const definition = this.stageRuntime.assets?.routePulsePresentations
      ?.find(({ id }) => id === result.definition.presentationId);
    if (!definition) {
      throw new Error(`Missing route-pulse presentation ${result.definition.presentationId}`);
    }
    const displayedLifeByUnitId = Object.fromEntries(
      result.affectedUnits.map(({ unitId, lifeBefore }) => [unitId, lifeBefore]),
    );
    this.routePulsePresentationTrace = [];
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timeline = routePulsePresentationTimeline(definition, reducedMotion);
    for (const frame of timeline) {
      this.routePulsePresentation = {
        result,
        ...frame,
        displayedLifeByUnitId,
      };
      this.routePulsePresentationTrace.push({
        ...frame,
      });
      this.emit();
      await pause(
        reducedMotion
          ? this.testMode ? 240 : frame.nativeTicks * 10
          : this.mapCombatDelay(frame.nativeTicks),
      );
    }
    this.routePulsePresentation = undefined;
  }

  private async presentOrdinaryCombat(
    attacker: BattleUnit,
    defender: BattleUnit,
    result: AttackResult,
  ): Promise<void> {
    this.combatPresentationTrace = [];
    const finalDefenderLife = Math.max(0, defender.life - result.damage);
    const finalAttackerLife = Math.max(0, attacker.life - result.counterDamage);
    if (this.battlePresentation === "full") {
      await this.presentFullScreenCombat(attacker, defender, result);
      if (result.defenderDied && (result.defenderDeathTargets?.length ?? 1) > 1) {
        await this.presentMapCombatDeaths(
          attacker,
          defender,
          result,
          "defenderDeath",
          1,
          finalAttackerLife,
          finalDefenderLife,
        );
      } else if (result.attackerDied && (result.attackerDeathTargets?.length ?? 1) > 1) {
        await this.presentMapCombatDeaths(
          attacker,
          defender,
          result,
          "attackerDeath",
          1,
          finalAttackerLife,
          finalDefenderLife,
        );
      }
      this.combatPresentation = undefined;
      return;
    }

    let displayedAttackerLife = attacker.life;
    let displayedDefenderLife = defender.life;

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
      await this.presentMapCombatDeaths(
        attacker,
        defender,
        result,
        "defenderDeath",
        0,
        displayedAttackerLife,
        displayedDefenderLife,
      );
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
        await this.presentMapCombatDeaths(
          attacker,
          defender,
          result,
          "attackerDeath",
          0,
          displayedAttackerLife,
          displayedDefenderLife,
        );
      }
    }

    this.combatPresentation = undefined;
  }

  private async presentMapCombatDeaths(
    attacker: BattleUnit,
    defender: BattleUnit,
    result: AttackResult,
    phase: "defenderDeath" | "attackerDeath",
    startIndex: number,
    displayedAttackerLife: number,
    displayedDefenderLife: number,
  ): Promise<void> {
    const targets = phase === "defenderDeath"
      ? result.defenderDeathTargets
      : result.attackerDeathTargets;
    const targetCount = targets?.length ?? 1;
    for (let deathTargetIndex = startIndex; deathTargetIndex < targetCount; deathTargetIndex += 1) {
      for (let frame = 0; frame < 15; frame += 1) {
        this.setCombatPresentation(
          attacker,
          defender,
          result,
          phase,
          frame,
          displayedAttackerLife,
          displayedDefenderLife,
          deathTargetIndex,
        );
        await pause(this.mapCombatDelay(10));
      }
    }
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
    deathTargetIndex?: number,
  ): void {
    const deathUnits = (
      template: BattleUnit,
      targets: AttackResult["defenderDeathTargets"],
    ): BattleUnit[] | undefined => targets?.map((target) => ({
      ...template,
      ...target,
      statuses: { ...template.statuses },
    }));
    const attackerDeathUnits = deathUnits(attacker, result.attackerDeathTargets);
    const defenderDeathUnits = deathUnits(defender, result.defenderDeathTargets);
    const deathTargetId = phase === "defenderDeath"
      ? defenderDeathUnits?.[deathTargetIndex ?? 0]?.id
      : phase === "attackerDeath"
        ? attackerDeathUnits?.[deathTargetIndex ?? 0]?.id
        : undefined;
    this.combatPresentation = {
      attacker,
      defender,
      attackerDeathUnits,
      defenderDeathUnits,
      result,
      phase,
      frame,
      displayedAttackerLife,
      displayedDefenderLife,
      deathTargetIndex,
    };
    this.combatPresentationTrace.push({
      phase,
      frame,
      displayedAttackerLife,
      displayedDefenderLife,
      deathTargetId,
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
    const commands = this.systemCommands;
    this.systemMenuIndex = (this.systemMenuIndex + delta + commands.length) % commands.length;
    this.emit();
  }

  selectSystemMenuCommand(index: number): void {
    if (!this.systemMenuOpen || index < 0 || index >= this.systemCommands.length || index === this.systemMenuIndex) return;
    this.systemMenuIndex = index;
    this.emit();
  }

  activateSystemMenuSelection(): void {
    const command = this.systemMenuOpen ? this.systemCommands[this.systemMenuIndex] : undefined;
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
    if (this.dialogueSkipConfirmOpen) this.cancelDialogueSkip();
    else if (this.recordMenuMode) this.closeRecordMenu();
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
    if (this.prayerHoldSkip) {
      this.prayerHoldSkip();
      return true;
    }
    if (this.dialogueSkipConfirmOpen) {
      this.cancelDialogueSkip();
      return true;
    }
    if (this.canRequestDialogueSkip) {
      this.requestDialogueSkip();
      return true;
    }
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
    this.restartBattle(this.stageRuntime.retry.statusText);
  }

  private restartBattle(message: string): void {
    if (this.stageRuntime.retry.mode !== "skip-entry-story") {
      this.movementPresentation = undefined;
      this.systemMenuOpen = false;
      this.settingsOpen = false;
      this.soundSettingsOpen = false;
      this.musicSettingsOpen = false;
      this.recordMenuMode = undefined;
      this.dialogueSkipConfirmOpen = false;
      this.dialogueSkipConfirmIndex = 1;
      this.quitConfirmOpen = false;
      this.groupCommandOpen = false;
      this.retreatConfirmOpen = false;
      this.objectiveOpen = false;
      this.promotionUnitIds = [];
      this.promotionDialogueIndex = undefined;
      this.promotionResume = undefined;
      this.busy = false;
      void this.enterStage(
        this.stageRuntime.id,
        cloneCampaignState(this.stageEntrySnapshot),
        {
          preparation: this.stageRuntime.retry.mode === "preparation",
          statusMessage: message,
        },
      );
      return;
    }
    this.battle = this.stageRuntime.createBattle(this.stageEntrySnapshot);
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
    this.dialogueSkipConfirmOpen = false;
    this.dialogueSkipConfirmIndex = 1;
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
    this.cameraOrigin = { ...this.battle.stage.viewport.initialOrigin };
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
    if (!this.campaignPersistenceEnabled) {
      this.phase = "nextStage";
      this.statusMessage = "競技場測試完成；可返回編成或以相同陣容重開。";
      this.emit();
      return;
    }
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

  selectSavePromptChoice(index: number): void {
    if (
      this.phase !== "savePrompt"
      || index < 0
      || index > 1
      || index === this.savePromptIndex
    ) return;
    this.savePromptIndex = index;
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
    const runtime = this.stageRuntime;
    const save: SaveData = {
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      savedAt: new Date().toISOString(),
      saveCount: (prior?.saveCount ?? 0) + 1,
      stageId: runtime.nextStageId,
      stageLabel: runtime.completion.destinationLabel,
      ruleset: campaign.ruleset,
      difficulty: campaign.difficulty,
      rngState: campaign.rngState,
      rngCalls: campaign.rngCalls,
      roster: campaign.roster,
      stageProgress: runtime.completion.destinationProgress,
      consumedEventIds: runtime.completion.consumedEvents === "all"
        ? this.battle.stage.events.map(({ id }) => id)
        : [],
    };
    localStorage.setItem(saveSlotKey(slot), JSON.stringify(save));
    this.pendingSaveSlot = undefined;
    this.completeVictoryFlow();
  }

  openRecordMenu(mode: RecordMenuMode): void {
    if (!this.campaignPersistenceEnabled) {
      this.systemMenuOpen = false;
      this.settingsOpen = false;
      this.statusMessage = "競技場是純記憶體測試，不讀取或寫入戰役記錄。";
      this.emit();
      return;
    }
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
      stageLabel: this.stageRuntime.label,
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
      if (!isPlayableStageId(save.stageId)) {
        const source = stageRuntimeSourceForDestination(save.stageId);
        if (source) {
          const runtime = await loadStageRuntime(source.id);
          const campaign = {
            stageId: source.id,
            ruleset: save.ruleset,
            difficulty: save.difficulty,
            roster: save.roster,
            rngState: save.rngState,
            rngCalls: save.rngCalls,
          } as const;
          this.stageRuntime = runtime;
          this.battle = runtime.createBattle(
            campaign,
            runtime.preparation?.createInitialResult(),
          );
          this.stageEntrySnapshot = cloneCampaignState(campaign);
          this.stageEventState = createStageEventState(
            this.battle.stage,
            save.consumedEventIds as StageEventState["consumedEventIds"],
          );
          this.cameraOrigin = clampCameraOrigin(
            this.battle.stage,
            this.battle.stage.viewport.initialOrigin,
          );
          const focus = this.battle.unit(runtime.focusUnitId) ?? this.battle.focus;
          this.cursor = focus ? { x: focus.x, y: focus.y } : { ...this.cameraOrigin };
        }
        this.completedProgressMetadata = source ? {
          completedOrdinal: source.ordinal,
          destinationId: source.nextStageId,
          destinationLabel: source.completion.destinationLabel,
        } : undefined;
        this.activeStoryId = undefined;
        this.dialogueSkipConfirmOpen = false;
        this.dialogueSkipConfirmIndex = 1;
        this.campaignRoute = save.stageId;
        this.stageProgress = 1000;
        this.phase = "nextStage";
      } else {
        await this.enterStage(save.stageId, {
          stageId: save.stageId,
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
    const campaign: CampaignState = {
      stageId: save.stageId,
      ruleset: save.ruleset,
      difficulty: save.difficulty,
      roster: save.roster,
      rngState: save.rngState,
      rngCalls: save.rngCalls,
    };
    const runtime = await loadStageRuntime(save.stageId);
    const battle = runtime.restoreBattle(campaign, save.battle);
    this.stageRuntime = runtime;
    this.completedProgressMetadata = undefined;
    this.battle = battle;
    this.stageEventState = createStageEventState(
      battle.stage,
      save.consumedEventIds as StageEventState["consumedEventIds"],
    );
    this.stageEntrySnapshot = cloneCampaignState(save.stageEntrySnapshot);
    this.preparationCampaign = runtime.preparation
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
    this.dialogueSkipConfirmOpen = false;
    this.dialogueSkipConfirmIndex = 1;
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
    this.scheduleFrozenPlayerPhaseSkip();
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
    if (this.dialogueSkipConfirmOpen) {
      if (delta.x !== 0 || delta.y !== 0) {
        this.moveDialogueSkipSelection(delta.x || delta.y);
      }
      return;
    }
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
    if (this.prayerHoldSkip) this.prayerHoldSkip();
    else if (this.dialogueSkipConfirmOpen) this.activateDialogueSkipSelection();
    else if (this.groupCommandDialogueActive) this.advanceDialogue();
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
    this.dialogueSkipConfirmOpen = false;
    this.dialogueSkipConfirmIndex = 1;
    this.movementPresentation = undefined;
    this.combatPresentation = undefined;
    this.specialActionPresentation = undefined;
    this.restPresentation = undefined;
    this.aiTechniqueDialogue = undefined;
    const completedOrdinal = this.stageRuntime.ordinal;
    const destination = this.stageRuntime.nextStageId;
    if (isPlayableStageId(destination)) {
      await this.enterStage(destination, {
        ...this.battle.campaignSnapshot(),
        stageId: destination,
      });
      this.statusMessage = `調試：第 ${completedOrdinal} 關已直接完成，進入第 ${completedOrdinal + 1} 關。`;
      this.emit();
      return;
    }
    this.campaignRoute = destination;
    this.stageProgress = 1000;
    this.phase = "nextStage";
    this.statusMessage = `調試：第 ${completedOrdinal} 關已直接完成，進入 ${destination} 邊界。`;
    this.emit();
  }

  forceDefeatForTest(): void {
    if (!this.debugMode) return;
    const defeat = this.battle.stage.objective.defeat;
    const slot = defeat.type === "unit-removed"
      ? defeat.slot
      : defeat.type === "any-unit-removed" ? defeat.slots[0] : undefined;
    const target = this.battle.units.find(
      (unit) => unit.side === defeat.side && (slot === undefined || unit.slot === slot),
    );
    if (!target) return;
    this.battle.units = this.battle.units.filter((unit) => unit.id !== target.id);
    this.resolveOutcome();
    this.emit();
  }

  forceVictorySetupForTest(targetIndex = 0): void {
    if (!this.debugMode) return;
    const victory = this.battle.stage.objective.victory;
    if (victory.type === "unit-in-cell-range") {
      const protectedUnit = this.battle.units.find(
        ({ side, slot }) => side === victory.side && slot === victory.slot,
      );
      if (!protectedUnit) return;
      const destinationCell = victory.maximum + victory.width;
      protectedUnit.x = destinationCell % victory.width;
      protectedUnit.y = Math.floor(destinationCell / victory.width);
      protectedUnit.acted = false;
      for (const unit of this.battle.units.filter(
        ({ side, id }) => side === victory.side && id !== protectedUnit.id,
      )) unit.acted = true;
      this.battle.focusId = protectedUnit.id;
      this.phase = "player";
      this.centerCamera(protectedUnit);
      this.cursor = { x: protectedUnit.x, y: protectedUnit.y };
      this.resetAction();
      this.statusMessage = "自動驗收：護送目標將在下一次獨立行動進入出口。";
      this.busy = false;
      this.emit();
      return;
    }
    const focusedPlayer = this.battle.focus
      && this.battle.isPlayerControllableAlly(this.battle.focus.id)
      ? this.battle.focus
      : undefined;
    const commander = this.battle.unit("1:0")
      ?? focusedPlayer
      ?? this.battle.units.find((unit) => this.battle.isPlayerControllableAlly(unit.id));
    const finalEnemy = victory.type === "unit-removed"
      ? this.battle.units.find((unit) => unit.side === victory.side && unit.slot === victory.slot)
      : victory.type === "any-unit-removed"
        ? this.battle.units.find((unit) => unit.side === victory.side
          && unit.slot === victory.slots[targetIndex])
        : this.battle.units.find((unit) => unit.side === 2);
    if (!commander || !finalEnemy) return;
    const requiredVictoryTargets = victory.type === "any-unit-removed"
      ? this.battle.units.filter((unit) => unit.side === victory.side
        && victory.slots.some((slot) => slot === unit.slot))
      : [finalEnemy];
    const requiredVictoryTargetIds = new Set(requiredVictoryTargets.map(({ id }) => id));
    const occupiedPositions = new Set(
      this.battle.units
        .filter((unit) => unit.id !== commander.id
          && unit.id !== finalEnemy.id
          && (unit.side === 1 || requiredVictoryTargetIds.has(unit.id)))
        .map(({ x, y }) => `${x},${y}`),
    );
    const candidateCommanderPositions = [
      // Keep the debug fixture independent from whichever legal position the
      // preceding AI sequence left in a save. Browser contracts click the
      // canonical stage-1 center first, then fall back only when occupied.
      { x: 29, y: 26 },
      { x: commander.x, y: commander.y },
      ...Array.from({ length: this.battle.stage.width * this.battle.stage.height }, (_, index) => ({
        x: index % this.battle.stage.width,
        y: Math.floor(index / this.battle.stage.width),
      })),
    ];
    const adjacentOffsets = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ];
    const victoryPair = candidateCommanderPositions.flatMap((position) =>
      adjacentOffsets.map((offset) => ({
        commander: position,
        target: { x: position.x + offset.x, y: position.y + offset.y },
      })))
      .find(({ commander: actor, target }) =>
        actor.x >= 0
        && actor.y >= 0
        && actor.x < this.battle.stage.width
        && actor.y < this.battle.stage.height
        && target.x >= 0
        && target.y >= 0
        && target.x < this.battle.stage.width
        && target.y < this.battle.stage.height
        && !occupiedPositions.has(`${actor.x},${actor.y}`)
        && !occupiedPositions.has(`${target.x},${target.y}`));
    if (!victoryPair) return;
    commander.x = victoryPair.commander.x;
    commander.y = victoryPair.commander.y;
    commander.acted = false;
    finalEnemy.x = victoryPair.target.x;
    finalEnemy.y = victoryPair.target.y;
    finalEnemy.life = 1;
    for (const target of requiredVictoryTargets) {
      if (target.id === finalEnemy.id) continue;
      target.x = Math.max(0, this.battle.stage.width - 2);
      target.y = Math.max(0, this.battle.stage.height - 2);
      target.acted = true;
    }
    this.battle.units = this.battle.units.filter(
      (unit) => unit.side === 1 || requiredVictoryTargetIds.has(unit.id),
    );
    for (const unit of this.battle.units.filter((unit) => unit.side === 1 && unit.id !== commander.id)) unit.acted = true;
    this.battle.focusId = commander.id;
    this.phase = "player";
    this.centerCamera(commander);
    this.cursor = { x: commander.x, y: commander.y };
    this.resetAction();
    this.statusMessage = victory.type === "any-unit-removed"
      ? "自動驗收：指定勝利目標已置於合法攻擊位，其餘首領仍在場。"
      : "自動驗收：最後一名敵人已置於合法攻擊位。";
    this.emit();
  }

  forceVictoryForTest(targetIndex = 0): void {
    if (!this.debugMode) return;
    const victory = this.battle.stage.objective.victory;
    if (victory.type === "eliminate-side") {
      this.battle.units = this.battle.units.filter(({ side }) => side !== victory.side);
      this.resolveOutcome();
      this.emit();
      return;
    }
    const target = victory.type === "unit-removed"
      ? this.battle.units.find(({ side, slot }) => side === victory.side && slot === victory.slot)
      : victory.type === "any-unit-removed"
        ? this.battle.units.find(({ side, slot }) =>
          side === victory.side && slot === victory.slots[targetIndex])
        : undefined;
    if (!target) return;
    this.battle.units = this.battle.units.filter(({ id }) => id !== target.id);
    this.resolveOutcome();
    this.emit();
  }

  forcePromotionSetupForTest(): void {
    if (!this.debugMode || this.battle.stage.id !== "stage-03") return;
    const candidate = this.battle.unit("1:4");
    const target = this.battle.units.find(({ side, id }) => side === 2 && id !== "2:17");
    const boss = this.battle.unit("2:17");
    if (!candidate || !target || !boss) return;
    candidate.classId = "soldier";
    candidate.className = className(candidate.classId);
    candidate.experience = 299;
    candidate.x = 29;
    candidate.y = 26;
    candidate.life = this.battle.statsFor(candidate).maxLife;
    candidate.acted = false;
    target.x = 30;
    target.y = 26;
    target.life = 1;
    target.acted = false;
    boss.x = 1;
    boss.y = 1;
    boss.acted = true;
    this.battle.units = this.battle.units.filter(
      (unit) => unit.side === 1 || unit.id === target.id || unit.id === boss.id,
    );
    for (const unit of this.battle.units.filter(
      ({ side, id }) => side === 1 && id !== candidate.id,
    )) unit.acted = true;
    this.battle.focusId = candidate.id;
    this.phase = "player";
    this.centerCamera(candidate);
    this.cursor = { x: candidate.x, y: candidate.y };
    this.resetAction();
    this.statusMessage = "自動驗收：拉朵那將在妮雅缺席時請希蜜授職。";
    this.busy = false;
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

  forceWaterWarriorGroupDeathSetupForTest(): void {
    if (!this.debugMode) return;
    const attacker = this.battle.units.find(
      ({ side, classId }) => side === 1 && classId === "water-warrior",
    );
    const defender = this.battle.units.find(
      ({ side, classId }) => side === 2 && classId === "water-warrior",
    );
    if (!attacker || !defender) return;
    attacker.x = 24;
    attacker.y = 25;
    defender.x = 25;
    defender.y = 25;
    for (let splitCount = 2; splitCount <= 4; splitCount += 1) {
      attacker.acted = false;
      attacker.life = this.battle.statsFor(attacker).maxLife;
      for (const unit of this.battle.units.filter(
        ({ side, slot }) => side === defender.side && slot === defender.slot,
      )) unit.life = this.battle.statsFor(unit).maxLife;
      const result = this.battle.attack(attacker.id, defender.id);
      if (result.splitCount !== splitCount) {
        throw new Error(`water-warrior test setup stopped at ${result.splitCount ?? 1} bodies`);
      }
    }
    for (const unit of this.battle.units.filter(
      ({ side, slot }) => side === defender.side && slot === defender.slot,
    )) unit.life = 1;
    attacker.acted = false;
    attacker.life = this.battle.statsFor(attacker).maxLife;
    this.battle.focusId = attacker.id;
    this.phase = "player";
    this.battlePresentation = "map";
    this.centerCamera(attacker);
    this.cursor = { x: attacker.x, y: attacker.y };
    this.resetAction();
    this.statusMessage = "自動驗收：四個共享生命的水戰士已置於連續死亡測試位。";
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
    classId: "archer" | "cavalry" | "magician" | "monk" | "sister" | "warrior",
    ordinaryCombat = false,
    stage1Target: "boss" | "pursuing" = "boss",
  ): void {
    if (!this.debugMode) return;
    const actor = this.battle.unit("1:0")
      ?? this.battle.units.find((unit) => this.battle.isPlayerControllableAlly(unit.id));
    const preferredAlly = this.battle.unit("1:1");
    const ally = preferredAlly && preferredAlly.id !== actor?.id
      ? preferredAlly
      : this.battle.units.find((unit) => unit.side === 1 && unit.id !== actor?.id);
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

    if ((classId === "sister" || classId === "monk") && !ordinaryCombat) {
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
      statusMessage: this.statusMessage,
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
      systemCommands: this.systemCommands.map((command) => ({ ...command })),
      campaignPersistenceEnabled: this.campaignPersistenceEnabled,
      settingsOpen: this.settingsOpen,
      soundSettingsOpen: this.soundSettingsOpen,
      soundSettingsReturn: this.soundSettingsReturn,
      musicSettingsOpen: this.musicSettingsOpen,
      musicSettingsReturn: this.musicSettingsReturn,
      recordMenuMode: this.recordMenuMode,
      recordMenuReturn: this.recordMenuReturn,
      recordMenuIndex: this.recordMenuIndex,
      dialogueSkipConfirmOpen: this.dialogueSkipConfirmOpen,
      dialogueSkipConfirmIndex: this.dialogueSkipConfirmIndex,
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
      presentationFast: this.presentationFast,
      battlePresentation: this.battlePresentation,
      gridEnabled: this.gridEnabled,
      edgeScrollEnabled: this.edgeScrollEnabled,
      portraitsEnabled: this.portraitsEnabled,
      aiDialogueEnabled: this.aiDialogueEnabled,
      lastCombat: this.lastCombat ? {
        ...this.lastCombat,
        defenderDeathTargets: this.lastCombat.defenderDeathTargets
          ?.map((target) => ({ ...target })),
        attackerDeathTargets: this.lastCombat.attackerDeathTargets
          ?.map((target) => ({ ...target })),
      } : undefined,
      lastSpecialAction: this.lastSpecialAction ? { ...this.lastSpecialAction } : undefined,
      lastConstruction: this.lastConstruction ? {
        ...this.lastConstruction,
        actorPositionBefore: { ...this.lastConstruction.actorPositionBefore },
        actorPositionAfter: { ...this.lastConstruction.actorPositionAfter },
        path: this.lastConstruction.path.map((position) => ({ ...position })),
        terrainMutations: this.lastConstruction.terrainMutations.map((mutation) => ({ ...mutation })),
      } : undefined,
      lastRoutePulse: this.lastRoutePulse ? {
        ...this.lastRoutePulse,
        path: this.lastRoutePulse.path.map((position) => ({ ...position })),
        safeCells: this.lastRoutePulse.safeCells.map((position) => ({ ...position })),
        affectedUnits: this.lastRoutePulse.affectedUnits.map((affected) => ({
          ...affected,
          position: { ...affected.position },
        })),
      } : undefined,
      combatPresentation: this.combatPresentation ? {
        ...this.combatPresentation,
        attacker: { ...this.combatPresentation.attacker },
        defender: { ...this.combatPresentation.defender },
        attackerDeathUnits: this.combatPresentation.attackerDeathUnits
          ?.map((unit) => ({ ...unit, statuses: { ...unit.statuses } })),
        defenderDeathUnits: this.combatPresentation.defenderDeathUnits
          ?.map((unit) => ({ ...unit, statuses: { ...unit.statuses } })),
        result: {
          ...this.combatPresentation.result,
          defenderDeathTargets: this.combatPresentation.result.defenderDeathTargets
            ?.map((target) => ({ ...target })),
          attackerDeathTargets: this.combatPresentation.result.attackerDeathTargets
            ?.map((target) => ({ ...target })),
        },
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
      routePulsePresentation: this.routePulsePresentation ? {
        ...this.routePulsePresentation,
        displayedLifeByUnitId: { ...this.routePulsePresentation.displayedLifeByUnitId },
      } : undefined,
      routePulsePresentationTrace: this.routePulsePresentationTrace.map((entry) => ({ ...entry })),
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
      effectPreviewCells: this.effectPreviewCells.map((cell) => ({ ...cell })),
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
      this.dialogueSkipConfirmOpen = false;
      this.dialogueSkipConfirmIndex = 1;
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
      this.dialogueSkipConfirmOpen = false;
      this.dialogueSkipConfirmIndex = 1;
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
      } else if (defeatCondition.type === "any-unit-removed") {
        const protectedUnit = this.battle.units.find(
          (unit) => unit.side === defeatCondition.side
            && defeatCondition.slots.some((slot) => slot === unit.slot),
        );
        if (protectedUnit) {
          this.battle.focusId = protectedUnit.id;
          this.centerCamera(protectedUnit);
        }
      }
      const victoryEvents = this.consumeStageTrigger({ type: "objective-satisfied" });
      if (victoryEvents.length === 0) {
        this.phase = "victoryFeedback";
      } else {
        const phaseBeforeVictoryEvents = this.phase;
        void this.processStageEvents(victoryEvents).then(() => {
          if (this.phase === phaseBeforeVictoryEvents) this.phase = "victoryFeedback";
          this.emit();
        });
      }
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
    const extraMove = this.pendingExtraMove;
    const path = extraMove
      ? this.battle.extraMovementPath(unit.id, destination)
      : this.battle.movementPath(unit.id, destination);
    if (path.length === 0) return;
    this.busy = true;
    this.actionMode = "moving";
    this.pendingPath = path.map((step) => ({ ...step }));
    const completed = await this.animateUnitPath(unit.id, path, "player");
    this.busy = false;
    if (completed && extraMove) {
      this.finishUnitAction("飛龍騎士完成攻擊後移動；單位行動結束。", true);
      return;
    }
    this.actionMode = completed ? "actionMenu" : "move";
    this.commandIndex = 0;
    this.statusMessage = completed
      ? "選擇攻擊、結束或返悔。"
      : extraMove
        ? "攻擊後移動路徑已失效；請重新選擇。"
        : "移動路徑已失效。";
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

  private async presentPreparedUnitPath(unitId: string, path: readonly Position[]): Promise<boolean> {
    if (path.length === 0 || !this.battle.unit(unitId)) return false;
    this.movementPresentation = {
      unitId,
      kind: "player",
      path: path.map((step) => ({ ...step })),
      stepIndex: 0,
    };
    this.cursor = { ...path[path.length - 1] };
    this.emit();
    for (let index = 1; index < path.length; index += 1) {
      if (!this.battle.unit(unitId)) {
        this.movementPresentation = undefined;
        return false;
      }
      this.movementPresentation.stepIndex = index;
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

  unitStats(unit: BattleUnit): UnitStats {
    return this.battle.effectiveStatsFor(unit);
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
  advanceDialogue: () => void;
  skipDialogue: () => void;
  forceDefeat: () => void;
  forceVictorySetup: () => void;
  forcePromotionSetup: () => void;
  forceEvacuationSetup: () => void;
  forceMultipleTargets: () => void;
  forceCavalryCounterSetup: () => void;
  forceEnemySisterSetup: () => void;
  forceEnemyAlertBoundarySetup: () => void;
  forceRestSetup: () => void;
  forceClassActionSetup: (
    classId: "archer" | "cavalry" | "magician" | "monk" | "sister" | "warrior",
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
    advanceDialogue: () => controller.advanceDialogue(),
    skipDialogue: () => controller.skipDialogue(),
    forceDefeat: () => controller.forceDefeatForTest(),
    forceVictorySetup: () => controller.forceVictorySetupForTest(),
    forcePromotionSetup: () => controller.forcePromotionSetupForTest(),
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
