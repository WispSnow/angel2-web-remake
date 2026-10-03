import { ASSETS, STAGE0, completeCampaignRoster, initialEnemyExperience } from "./content/stage0";
import {
  NATIVE_DEBUG_BEHAVIOUR_EDITOR,
  NATIVE_DEBUG_SIDE_LIFE_MENUS,
  NATIVE_DEBUG_UNIT_EDITOR,
} from "./content/debug-mode.generated";
import { DEBUG_AI_BEHAVIOUR_VALUES } from "./content/debug-mode-rules";
import { FULL_COMBAT_ATLASES } from "./content/full-combat-atlases.generated";
import { allyMapUnitAsset, enemyMapUnitAsset } from "./content/map-unit-assets";
import {
  debugMenuItems,
  debugTechniqueActionId,
  steppedDebugMenuIndex,
  withDebugMenuIndex,
  type DebugMenuContext,
  type DebugMenuItem,
  type DebugMenuState,
  type DebugTechniqueGroup,
} from "./original-debug-menus";
import {
  DEBUG_EDITOR_PAGES,
  DEBUG_EDITOR_SLOT_COUNT,
  DEBUG_EDITOR_SLOTS_PER_PAGE,
  debugEditorSlots,
  debugTemplateEnemyDefinition,
  steppedDebugBehaviour,
  steppedDebugClass,
  type DebugEditorSlot,
} from "./original-debug-editor";
import {
  activatedDebugClassEditor,
  activatedDebugTerrainEditor,
  debugClassEditorHitAt,
  debugTerrainEditorHitAt,
  hoveredDebugClassEditor,
  hoveredDebugTerrainEditor,
  initialDebugClassEditor,
  initialDebugTerrainEditor,
  movedDebugClassEditor,
  movedDebugTerrainEditor,
  pressedDebugClassEditor,
  pressedDebugTerrainEditor,
  steppedDebugClassEditor,
  steppedDebugTerrainEditor,
  toggledDebugClassEditorFocus,
  toggledDebugTerrainEditorFocus,
  type DebugClassEditorState,
  type DebugDataEditorResult,
  type DebugTerrainEditorState,
} from "./original-debug-data-editors";
import { setBattleDataEditsSource, withNativeBattleData } from "./content/battle-data-edits";
import { stagedRenderAssetAvailable } from "./staged-render-asset-cache";
import { fullCombatImageAvailable } from "./full-combat-image-cache";
import { MUSIC_BOX_TRACKS, musicBoxProgram } from "./content/music-box";
import type { MusicProgram } from "./music-transport";
import {
  originalDebugHotkeyRefusal,
  refreshedPromotionQueue,
  type OriginalDebugHost,
} from "./original-debug-hosts";
import {
  ORIGINAL_DEBUG_PRESENTATION_ACTION_IDS,
  originalDebugModeEnabled,
  type OriginalDebugHotkey,
} from "./original-debug-mode";
import {
  cameraContains,
  cameraFocusForOrigin,
  cameraOriginForFocus,
  clampCameraFocus,
  clampCameraOrigin,
} from "./camera";
import { portraitSourceFor } from "./content/portrait-catalog.generated";
import { nativeObjectivePanelText } from "./content/objective-panel";
import {
  BATTLE_ACTION_DEFINITIONS,
  HALF_DRAGON_TELEPORT_ACTION_ID,
  STAGE0_REST_PRESENTATION,
  WATER_WARRIOR_SHOT_ACTION_ID,
  actionPresentationCatalog,
  isIceActionId,
  isShootingActionId,
  isVirtActionId,
  presentationActionIdsForClass,
  shootingActionIdFor,
  techniqueActionIdsFor,
  type IceActionId,
} from "./content/actions";
import {
  aiTechniqueDialogueFor,
  contextualBattleDialogueFor,
  experienceGainDialogueFor,
  nativeContextualLineCoinPasses,
  nativeContextualSelectorRollsCoin,
  NATIVE_CONTEXTUAL_BATTLE_LINES,
  type ContextualBattleLineKey,
} from "./content/ai-technique-dialogue";
import { fullCombatBackgroundRecord } from "./content/full-combat-backgrounds";
import {
  classFallbackPortraitFor,
  classDefinition,
  immuneToPhysicalShootingFor,
  isClassId,
  className,
  promotionExperienceThresholdFor,
  promotionTargetsFor,
  unitDisplayName,
  type PromotionTarget,
} from "./content/classes";
import {
  storyPagesForId,
  isStageBattleDialogueId,
  stageBattleDialogueFor,
  storyPhaseForStageStory,
  type StageStoryPhase,
} from "./content/dialogue";
import { portraitAssetUrlsForRecords, stageDialoguePortraitRecords } from "./content/portrait-assets";
import {
  deferredAllyClassIds,
  stageSimulationEffectFor,
  type CampaignRouteId,
} from "./content/stage-effects";
import type {
  StageBattleDialogueId,
  StageEventDefinition,
  StageEventTrigger,
  StageObjectiveCondition,
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
import {
  FULL_COMBAT_BACKDROP_INITIAL_PHASES,
  type FullCombatBackdropPhases,
} from "./full-combat-backdrop";
import { inspectTerrain, type TerrainInspection } from "./terrain-inspection";
import {
  TURN_TRANSITION_HOLD_NATIVE_TICKS,
  turnTransitionFrames,
  type TurnTransitionPresentation,
  type TurnTransitionSide,
} from "./turn-transition-presentation";
import {
  Stage0Battle,
  type MagicArcherLineOption,
} from "./simulation/battle";
import type { AlliedAiAction } from "./simulation/ai-contracts";
import { Stage49EndingSession } from "./simulation/stage49-ending";
import { CreditsSession } from "./content/credits";
import type { PreparedRoutePulse } from "./simulation/route-pulse";
import type { PreparedEnemyPhaseTail } from "./simulation/enemy-phase-tail";
import type {
  ConstructionActionId,
  ConstructionResult,
} from "./simulation/actions/construction";
import { routePulsePresentationTimeline } from "./route-pulse-presentation";
import {
  enemyPhaseTailPresentationTimeline,
  type EnemyPhaseTailPresentation,
  type EnemyPhaseTailPresentationStep,
} from "./enemy-phase-tail-presentation";
import { buildStompPresentationSteps } from "./stomp-presentation";
import { NumericRangeMap, techniqueEffectRange } from "./simulation/actions/range-map";
import type { DeploymentResult } from "./simulation/deployment";
import { manhattan, positionKey } from "./simulation/grid";
import { prepareScriptedLightning4 } from "./simulation/scripted-actions";
import { objectiveDestinationCells } from "./simulation/objectives";
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
  isSoundEffectVolume,
  loadMusicPreferences,
  loadPresentationPreferences,
  loadSoundPreferences,
  saveMusicPreferences,
  savePresentationPreferences,
  saveSoundPreferences,
  type MusicVolume,
  type SoundEffectVolume,
} from "./preferences";
import {
  moveSaveSlotIndex,
  moveSaveSlotPage,
  readSaveSlot,
  SAVE_CONTENT_VERSION,
  SAVE_SLOT_COUNT,
  SAVE_VERSION,
  saveSlotKey,
  savedBattleUnitMaximumLife,
  writeSaveSlot,
} from "./save";
import {
  INITIAL_STAGE_RUNTIME,
  isPlayableStageId,
  loadStageRuntime,
  STAGE_RUNTIME_MANIFEST,
  stageRuntimeSourceForDestination,
  type LoadedStageRuntime,
} from "./stage-runtime";
import type { ActionMode, AttackResult, BattleSaveData, BattleUnit, CampaignState, DialoguePage, Difficulty, GamePhase, PortraitRecord, Position, SaveData, StageId, UnitClassId, UnitStats } from "./types";
import {
  clearProgramTimeout,
  programDelay,
  programNow,
  setProgramTimeout,
} from "./program-clock";

type Listener = () => void;
type MovementKind = "scripted" | "player" | "allyAuto" | "enemy" | "rollback";
export interface StageAssetRequirements {
  allyClassIds: readonly UnitClassId[];
  encounterClassIds: readonly UnitClassId[];
  nativeStage: number;
  portraitRecords: readonly PortraitRecord[];
  /** 這一關 `unitSprites` 的原始 URL，見 `StageClassPresentationRequirements`。 */
  unitSpriteUrls: readonly string[];
  /**
   * 這一關會不會走到部署介面。部署表面是延後載入的，模組本身不在資源清單裡，因此得由
   * 資源門一併備妥；否則慢速連線會在階段切過去之後才開始抓，而那時已經沒有載入頁了。
   */
  usesDeploymentSurface: boolean;
}

/**
 * `resolveRequirements` 由資源門在載入頁已經出現之後才呼叫。關卡運行模組本身就是這一步
 * 裡匯入的：那是一筆延後載入的相依，先開載入頁再匯入，慢速連線才不會停在上一個畫面上
 * 乾等，而且匯入失敗也能落到資源門的重試面。
 */
export type StageAssetGate = (
  stageId: StageId,
  resolveRequirements: () => Promise<StageAssetRequirements>,
) => Promise<void>;

// The native walk sound is per movement, not per step, and every reason has to
// keep the "movement" substring so it routes to the 移動 category switch.
// Two kinds stay silent by decision, not by omission:
//   rollback — the native cancel paths restore the previous cell directly, so
//              there is no original walk to reproduce for the replay [DD];
//   enemy    — the original does play E/14 for side 2, but a full enemy phase
//              chains many walks back to back; see REMAKE-106 [DD].
const MOVEMENT_AUDIO_REASON: Readonly<Record<MovementKind, string | undefined>> = {
  scripted: "stage-event-scripted-movement",
  player: "player-movement",
  allyAuto: "ally-auto-movement",
  enemy: undefined,
  rollback: undefined,
};

interface StageEntryOptions {
  preparation?: boolean;
  statusMessage?: string;
}

function cloneCampaignState(campaign: CampaignState): CampaignState {
  return {
    ...campaign,
    roster: campaign.roster.map((entry) => ({ ...entry })),
    ...(campaign.recordCounters ? { recordCounters: [...campaign.recordCounters] } : {}),
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
  /**
   * Map-unit life frozen at combat entry. The directly participating body
   * still uses the two scalar fields above for its native point drain; shared
   * water-warrior copies keep these values until the whole presentation ends.
   */
  displayedLifeByUnitId: Readonly<Record<string, number>>;
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
  | "wdGrowth"
  | "wdFinish"
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
  sweepFrame: number | undefined;
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

/**
 * A DS:84BB contextual line spoken by one unit — the confused actor, the sealed
 * caster, the unit with nothing in reach, the target that shrugged off a shot,
 * the defender that counters. None of these is gated by the ＡＩ對話 switch.
 */
export interface ContextualLineDialoguePresentation {
  actor: BattleUnit;
  line: ContextualBattleLineKey;
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

export type UnitCommandId =
  | "move"
  | "attack"
  | "shoot"
  | "technique"
  | "rest"
  | "end"
  | "undo"
  | "confirm"
  | "cancel";
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

/**
 * Derived presentation state for the ice cast the player is about to confirm.
 * The two bands are read straight off the effect range map, so they cost the
 * simulation nothing and can never disagree with the resolver's own footprint.
 *
 * The split is geometric, not a per-unit forecast: every target is shoved one
 * orthogonal step outward, so a value-1 target lands on value 0 and leaves the
 * effect unfrozen (`REMAKE-094`), while a value>=2 target lands on value>=1 and
 * still freezes. The one case the colour cannot express is a value-1 target with
 * no legal push cell — it stays put and freezes after all. Naming the bands for
 * geometry rather than for a guaranteed outcome keeps that honest.
 */
export interface IceCastPreview {
  readonly actionId: IceActionId;
  readonly center: Position;
  /** Effect value >= 2: a target here still ends inside the effect and freezes. */
  readonly freezeCells: readonly Position[];
  /** Effect value 1: the shove normally carries a target clear of the effect. */
  readonly displacementRingCells: readonly Position[];
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

/**
 * `DS:3F2C`, which the destination loop `0000:734C` opens once a unit lands with
 * nothing to attack or shoot, and always after the class-0F extra move: `SY`
 * ends the action, `X` walks the unit back to where this move began.
 */
const MOVE_CONFIRM_COMMANDS: readonly UnitCommand[] = [
  { id: "confirm", label: "確定" },
  { id: "cancel", label: "取消" },
];

/**
 * The native action-menu chains at `0000:6770/67D2/67EF` decide which extra
 * command a class gets; the generated catalog already carries that split as
 * `actionCategory`, so this reads it instead of restating the 21 classes.
 *
 * A granted shot is checked first and by side, because REMAKE-093 adds one to a
 * class whose native `actionCategory` stays `ordinary` — the catalog keeps the
 * native value so the AI dispatch and formation rules that also read it are
 * untouched.
 */
function classCommandFor(
  classId: BattleUnit["classId"],
  side: BattleUnit["side"],
): UnitCommand | undefined {
  if (shootingActionIdFor(classId, side)) return { id: "shoot", label: "射擊" };
  const category = classDefinition(classId).actionCategory;
  if (category === "technique") return { id: "technique", label: "技術" };
  return undefined;
}

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

const GAME_FUNCTION_COUNT = 5;

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
/**
 * Modes in which the battlefield cursor roams freely: the pointer drags it across
 * the board (`focusCell`) and the minimap may relocate it. Menus, the shot-route
 * picker and self-centred casts pin the cursor to the actor instead, and the
 * minimap stays inert there so a stray press cannot move the actor's frame.
 */
const ROAMING_CURSOR_MODES: ReadonlySet<ActionMode> = new Set<ActionMode>([
  "idle",
  "move",
  "target",
  "specialTarget",
]);
/** The roaming modes that still hold a selected unit: a range is being picked. */
const RANGE_SELECTION_MODES: ReadonlySet<ActionMode> = new Set<ActionMode>([
  "move",
  "target",
  "specialTarget",
]);

/** 被技術測試打斷的選格；範圍與目標在還原時按當時的狀態重算，所以不必保存。 */
interface SuspendedSelection {
  readonly actionMode: ActionMode;
  readonly selectedId: string;
  readonly selectedActionId: BattleActionId | undefined;
  readonly commandIndex: number;
  readonly techniqueIndex: number;
  readonly pendingOrigin: Position | undefined;
  readonly pendingPath: readonly Position[] | undefined;
  readonly pendingExtraMove: boolean;
  readonly awaitingMoveConfirmation: boolean;
  readonly cursor: Position;
  /** 打斷時行動者的位置；技術測試把它推走就不能接著選。 */
  readonly anchor: Position;
}
const pause = programDelay;
const atomicObjectiveConditions = (
  condition: StageObjectiveCondition,
): readonly Exclude<StageObjectiveCondition, { type: "any-of" }>[] => condition.type === "any-of"
  ? condition.conditions.flatMap(atomicObjectiveConditions)
  : [condition];

/**
 * `REMAKE-099`'s deterministic replacement for the native swift-dragon PIT coin
 * flip covers exactly the three single-target physical shots; the magic archer
 * is magic damage and is answered by `magicGuard` instead.
 */
function isPhysicalShotDodgedBy(actionId: BattleActionId, target: BattleUnit): boolean {
  const physical = actionId === "archer-shot"
    || actionId === "crossbow-shot"
    || actionId === WATER_WARRIOR_SHOT_ACTION_ID;
  return physical && immuneToPhysicalShootingFor(target.classId);
}

export class GameController {
  battle: Stage0Battle;
  difficulty: Difficulty;
  phase: GamePhase = "prebattleStory";
  campaignRoute?: CampaignRouteId;
  stage49Ending?: Stage49EndingSession;
  credits?: CreditsSession;
  actionMode: ActionMode = "idle";
  dialogueIndex = 0;
  selectedId?: string;
  commandIndex = 0;
  cursor: Position = { x: 29, y: 26 };
  terrainInspectionPosition?: Position;
  cameraOrigin: Position = { x: 25, y: 23 };
  minimapPreviewOrigin?: Position;
  reachable: Position[] = [];
  /** `REMAKE-180`: cells drawn at full brightness while choosing a move destination. */
  moveRangeDisplay: Position[] = [];
  targets: Position[] = [];
  actionRange: Position[] = [];
  selectedActionId?: BattleActionId;
  techniqueIndex = 0;
  objectiveOpen = false;
  systemMenuOpen = false;
  systemMenuIndex = 0;
  settingsOpen = false;
  settingsMenuIndex = 0;
  soundSettingsOpen = false;
  soundSettingsReturn?: "battle" | "settings";
  musicSettingsOpen = false;
  musicSettingsReturn?: "battle" | "settings";
  recordMenuMode?: RecordMenuMode;
  recordMenuReturn?: "battle" | "system";
  recordMenuIndex = 0;
  /**
   * 记录面板标题列的写入失败提示。只在战中记录与战后存档面板开着时显示，两个面板
   * 打开时清空；备份工具回报新状态时由 UI 调 `dismissRecordSaveNotice` 让位。
   */
  recordSaveNotice = "";
  dialogueSkipConfirmOpen = false;
  dialogueSkipConfirmIndex = 1;
  quitConfirmOpen = false;
  quitConfirmIndex = 1;
  groupCommandOpen = false;
  groupCommandIndex = 0;
  groupCommandDialogueId?: SpokenGroupCommandId;
  /** `REMAKE-174` 原版Debug的原版選單：F2 EDIT、F3／F4 全體生命、F5／F6 技術測試與其二級選單。 */
  debugMenu?: DebugMenuState;
  /** `REMAKE-174` 原版Debug F1 行為面板；`index` 是指標或鍵盤停留的列。 */
  debugBehaviourEditor?: { unitId: string; index: number };
  /** `REMAKE-174` 原版Debug我／敵 EDIT；`slotIndex` 是本頁 0..14 的焦點。 */
  debugUnitEditor?: { side: 1 | 2; page: number; slotIndex: number };
  /** `REMAKE-174` 原版Debug兵種（`0000:1294`）；改動直接寫進本場覆寫。 */
  debugClassEditor?: DebugClassEditorState;
  /** `REMAKE-174` 原版Debug地型（`0000:1B3A`）。 */
  debugTerrainEditor?: DebugTerrainEditorState;
  /** 原版 DS:`165A`：同一場戰鬥內下次打開地型時沿用上次選定的地形。 */
  private debugTerrainSlotMemory?: { readonly battle: Stage0Battle; readonly slot: number };
  /** EDIT 點了不在場的單位：下一次點格把它放回（原版 `0000:0C8C`）。 */
  debugPlacement?: { unitId: string };
  /** 技術測試的施法者；選格與提交走除錯入口，取消時直接回到戰場。 */
  debugTechniqueCasterId?: string;
  /** `noteOriginalDebugHotkeyUnavailable` 最近一次的提示。 */
  private originalDebugNotice?: string;
  /** F1／EDIT 改動之後，關閉時要做一次轉職掃描、勝負判定與階段完成檢查。 */
  private debugEditsPending = false;
  /**
   * 選格中按 F5／F6 時被打斷的選格。技術測試結束（施放完畢或取消）就還原它，與原版 `75E4`
   * 返回外層選格循環一致。
   */
  private debugSuspendedSelection?: SuspendedSelection;
  /**
   * 選格中的除錯操作可能讓單位達到轉職條件；原版只在待機循環掃描，所以留到這次行動結束或退回
   * 待機時再掃描。
   */
  private debugPromotionScanDeferred = false;
  /** 原版Debug EDIT 當場補下載職業圖像的宿主入口（資源門的 `extendActiveStage`）。 */
  private originalDebugAssetLoader?: (urls: readonly string[]) => Promise<void>;
  /** EDIT 正在等圖像下載的改職業。 */
  debugClassLoading?: { readonly unitId: string; readonly classId: UnitClassId };
  /** 每一關進場時決定的地圖演出清單；見 `currentMapPresentationActionIds`。 */
  private readonly presentationIdsByRuntime = new WeakMap<object, readonly BattleActionId[]>();
  /** `REMAKE-174` 原版Debug鍵 2 的格號讀數；游標或鏡頭一動就失效，與原版被下一次視口重畫蓋掉一致。 */
  debugCellReadout?: { cell: number; difficulty: number; cursor: Position; cameraOrigin: Position };
  /** `REMAKE-174` 原版Debug Caps Lock+1 是否按住；宿主鍵盤層寫入。 */
  debugRangeReadoutHeld = false;
  /** `REMAKE-174` 音樂盒。 */
  musicBoxOpen = false;
  musicBoxIndex = 0;
  musicBoxReturn?: "battle" | "musicSettings";
  /**
   * 音樂盒正在試聽的曲子。原版關掉小框後所選曲照常播放，直到遊戲自己下一次選曲；
   * `AudioManager` 依 `sequence` 認出新的試聽，並在遊戲改選別的曲子時讓它退場。
   */
  musicBoxPlayback?: { trackId: string; program: MusicProgram; sequence: number };
  private musicBoxSequence = 0;
  retreatConfirmOpen = false;
  retreatConfirmIndex = 1;
  presentationFast = false;
  battlePresentation: "map" | "full";
  gridEnabled: boolean;
  edgeScrollEnabled: boolean;
  portraitsEnabled: boolean;
  aiDialogueEnabled: boolean;
  musicVolume: MusicVolume;
  soundEffectVolume: SoundEffectVolume;
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
  /**
   * Presentation-only: module 29 keeps its backdrop phase words across
   * full-screen battles until it is decompressed again on the next stage
   * entry, so the next full-screen battle starts from here (REMAKE-169).
   */
  private fullCombatBackdropPhases: FullCombatBackdropPhases = FULL_COMBAT_BACKDROP_INITIAL_PHASES;
  specialActionPresentation?: SpecialActionPresentation;
  routePulsePresentation?: RoutePulsePresentation;
  routePulsePresentationTrace: Array<
    Pick<RoutePulsePresentation, "frame" | "sweepFrame" | "draw" | "nativeTicks" | "visible">
  > = [];
  enemyPhaseTailPresentation?: EnemyPhaseTailPresentation;
  enemyPhaseTailPresentationTrace: Array<EnemyPhaseTailPresentationStep & { execution: number }> = [];
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
  contextualLineDialogue?: ContextualLineDialoguePresentation;
  /**
   * A modal battle-map dialogue. Pages turn in place, like a story's KY waits,
   * so a window open on both pages never collapses between them; `resume` runs
   * once the last page closes.
   */
  private battleContextDialogue?: {
    pages: readonly DialoguePage[];
    index: number;
    resume: () => void;
  };
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
  /** The unit has landed and waits on the `DS:3F2C` 確定／取消 menu. */
  private awaitingMoveConfirmation = false;
  private magicArcherRoutes: MagicArcherLineOption[] = [];
  private magicArcherRouteTargetId?: string;
  private selectedMagicArcherRouteIndex = 0;
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
  private campaignSaveCount = 0;
  private readonly testMode = import.meta.env.MODE !== "release"
    && new URLSearchParams(location.search).has("test");
  private readonly debugMode = import.meta.env.MODE !== "release"
    && (this.testMode || new URLSearchParams(location.search).has("debugScenario"));
  // Keeps the measured full-screen timing under ?test=1 for visual review.
  private readonly fullCombatRealTime = import.meta.env.MODE !== "release"
    && new URLSearchParams(location.search).has("slowFull");
  private readonly mapCombatRealTime = import.meta.env.MODE !== "release"
    && new URLSearchParams(location.search).has("slowMap");

  constructor(
    difficulty: Difficulty = 0,
    private stageAssetGate?: StageAssetGate,
  ) {
    this.difficulty = difficulty;
    this.battle = new Stage0Battle(difficulty);
    // 原版Debug的兵種／地型覆寫屬於「目前這場戰鬥」：查表時才讀，換掉戰鬥物件就自然還原。
    setBattleDataEditsSource(() => this.battle.debugDataEdits);
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
    this.soundEffectVolume = soundPreferences.soundEffectVolume;
    this.speechEnabled = soundPreferences.speechEnabled;
    this.movementSoundEnabled = soundPreferences.movementSoundEnabled;
    this.combatSoundEnabled = soundPreferences.combatSoundEnabled;
    this.keySoundEnabled = soundPreferences.keySoundEnabled;
    this.initializeStageEventProgress();
  }

  setStageAssetGate(stageAssetGate: StageAssetGate): void {
    this.stageAssetGate = stageAssetGate;
  }

  static async fromSave(
    save: SaveData,
    slot: number,
    stageAssetGate?: StageAssetGate,
  ): Promise<GameController> {
    const controller = new GameController(save.difficulty, stageAssetGate);
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

  /** 目前這一關 `unitSprites` 的原始 URL；資源門要把它們一起備妥。 */
  get stageUnitSpriteUrls(): readonly string[] {
    return Object.values(this.stageRuntime.assets?.unitSprites ?? {});
  }

  /** 目前這一關是否有部署階段；資源門用它決定要不要一併備妥部署介面模組。 */
  get usesDeploymentSurface(): boolean {
    return this.stageRuntime.preparation !== undefined;
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

  /**
   * 這一關的地圖演出。戰場場景在進場時按它建好全部演出，之後不能再補，所以每一關第一次讀到時
   * 就定下來：原版Debug開關開著時加上 `ORIGINAL_DEBUG_PRESENTATION_ACTION_IDS`（資源門也一併
   * 備妥了它們），技術測試與 EDIT 改職業因此不受本關原有技術的限制。
   */
  get currentMapPresentationActionIds(): readonly BattleActionId[] {
    const runtime = this.stageRuntime;
    const cached = this.presentationIdsByRuntime.get(runtime);
    if (cached) return cached;
    const ids: readonly BattleActionId[] = this.originalDebugActive
      ? [...new Set<BattleActionId>([...runtime.mapPresentationActionIds, ...ORIGINAL_DEBUG_PRESENTATION_ACTION_IDS])]
      : runtime.mapPresentationActionIds;
    this.presentationIdsByRuntime.set(runtime, ids);
    return ids;
  }

  /** 宿主把資源門的補下載入口交給控制器；沒有時（單元測試）EDIT 視圖像為已備妥。 */
  setOriginalDebugAssetLoader(loader: (urls: readonly string[]) => Promise<void>): void {
    this.originalDebugAssetLoader = loader;
  }

  /**
   * 場景預載我方地圖圖形時必須涵蓋的職業：目前在場的，加上劇情增援與形態轉換
   * 還會帶進來的（見 `deferredAllyClassIds`）。
   */
  get currentAllyMapClassIds(): readonly UnitClassId[] {
    const roster = this.battle.campaignSnapshot().roster;
    return [...new Set<UnitClassId>([
      ...this.battle.units.filter(({ side }) => side === 1).map(({ classId }) => classId),
      ...deferredAllyClassIds(this.stageRuntime.definition.events, {
        unit: (id) => this.battle.unit(id),
        rosterClassId: (slot) => roster.find((entry) => entry.slot === slot)?.classId,
      }),
    ])];
  }

  get currentRoutePulseSafeArea(): Position[] {
    if (this.routePulsePresentation) {
      return this.routePulsePresentation.result.safeCells.map((position) => ({ ...position }));
    }
    const unit = this.focusedUnit;
    return unit ? this.battle.routePulseSafeAreaForUnit(unit.id) : [];
  }

  get currentObjectiveDestinationCells(): Position[] {
    return objectiveDestinationCells(
      this.battle.stage.objective.victory,
      this.battle.stage,
    );
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

  /**
   * Ice is self-centred, so the native flow fires it the moment the technique
   * menu is confirmed and the player never sees what it is about to cover. The
   * remake inserts a confirmation step that draws the footprint first; this
   * getter is the only source the renderer and the HUD read, so both always
   * describe the same two bands.
   */
  get iceCastPreview(): IceCastPreview | undefined {
    if (this.actionMode !== "selfAreaConfirm") return undefined;
    const actionId = this.selectedActionId;
    const unit = this.selectedUnit;
    if (!unit || !isIceActionId(actionId)) return undefined;
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    if (!("effectRadius" in definition.range)) return undefined;
    const center = { x: unit.x, y: unit.y };
    const effect = techniqueEffectRange(
      center,
      this.battle.stage.width,
      this.battle.stage.height,
      definition.range.effectRadius,
    );
    const freezeCells: Position[] = [];
    const displacementRingCells: Position[] = [];
    for (const cell of effect.cells()) {
      if (effect.valueAt(cell) > 1) freezeCells.push(cell);
      else displacementRingCells.push(cell);
    }
    return { actionId, center, freezeCells, displacementRingCells };
  }

  get magicArcherRouteOptions(): readonly MagicArcherLineOption[] {
    return this.magicArcherRoutes;
  }

  get magicArcherRouteIndex(): number {
    return this.selectedMagicArcherRouteIndex;
  }

  get selectedMagicArcherRoute(): MagicArcherLineOption | undefined {
    return this.magicArcherRoutes[this.selectedMagicArcherRouteIndex];
  }

  get magicArcherRouteTarget(): BattleUnit | undefined {
    return this.magicArcherRouteTargetId
      ? this.battle.unit(this.magicArcherRouteTargetId)
      : undefined;
  }

  get currentStageProgressMetadata() {
    return this.completedProgressMetadata ?? {
      completedOrdinal: this.stageRuntime.ordinal,
      destinationId: this.stageRuntime.nextStageId,
      destinationLabel: this.stageRuntime.completion.destinationLabel,
    };
  }

  private async loadRuntime(
    stageId: StageId,
    campaign: CampaignState,
    restoredUnits: readonly Pick<BattleUnit, "classId" | "portrait">[] = [],
  ): Promise<LoadedStageRuntime> {
    let loaded: LoadedStageRuntime | undefined;
    const resolveRequirements = async (): Promise<StageAssetRequirements> => {
      const runtime = await loadStageRuntime(stageId);
      loaded = runtime;
      // A stage module can assign semantic portraits while constructing its
      // fixed board (for example stage 1's Nami) without duplicating them in the
      // generic save metadata. Build the same deterministic initial snapshot
      // here so those current-stage identities cross the asset gate before the
      // surface mounts. Restored battles already provide their exact unit set.
      const presentationUnits = restoredUnits.length > 0
        ? restoredUnits
        : runtime.createBattle(
          campaign,
          runtime.preparation?.createInitialResult(),
        ).units;
      const allyClassIds = campaign.roster.map(({ classId }) => classId);
      const encounterClassIds = new Set<UnitClassId>([
        ...allyClassIds,
        ...presentationUnits.map(({ classId }) => classId),
      ]);
      for (const spriteKey of Object.keys(runtime.assets?.unitSprites ?? {})) {
        const separator = spriteKey.indexOf("-");
        const classId = separator >= 0 ? spriteKey.slice(separator + 1) : spriteKey;
        if (isClassId(classId)) encounterClassIds.add(classId);
      }
      const portraitRecords = new Set<PortraitRecord>([
        46,
        ...stageDialoguePortraitRecords(runtime.definition),
        ...presentationUnits.map(({ portrait }) => portrait),
        ...(runtime.preparation?.createRoster(campaign).map(({ portrait }) => portrait) ?? []),
      ]);
      for (const rule of runtime.save.namedUnits ?? []) {
        if (typeof rule.portrait === "number") portraitRecords.add(rule.portrait);
      }
      for (const classId of encounterClassIds) {
        for (const side of [1, 2] as const) {
          const portrait = classFallbackPortraitFor(classId, side);
          if (portrait !== undefined) portraitRecords.add(portrait);
        }
      }
      return {
        allyClassIds,
        encounterClassIds: [...encounterClassIds],
        unitSpriteUrls: Object.values(runtime.assets?.unitSprites ?? {}),
        nativeStage: runtime.definition.nativeStage,
        portraitRecords: [...portraitRecords].sort((left, right) => left - right),
        usesDeploymentSurface: runtime.preparation !== undefined,
      };
    };
    if (this.stageAssetGate) await this.stageAssetGate(stageId, resolveRequirements);
    else await resolveRequirements();
    if (!loaded) throw new Error(`${stageId} runtime did not cross the asset gate`);
    return loaded;
  }

  async enterStage(
    stageId: StageId,
    campaign: CampaignState = { ...this.battle.campaignSnapshot(), stageId },
    options: StageEntryOptions = {},
  ): Promise<void> {
    const runtime = await this.loadRuntime(stageId, campaign);
    this.stageRuntime = runtime;
    this.completedProgressMetadata = undefined;
    this.stage49Ending = undefined;
    this.credits = undefined;
    // Entering a stage battle is where GO.EXE decompresses module 29 afresh.
    this.fullCombatBackdropPhases = FULL_COMBAT_BACKDROP_INITIAL_PHASES;
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
    this.battleContextDialogue = undefined;
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
    if (this.battleContextDialogue) {
      return this.battleContextDialogue.pages[this.battleContextDialogue.index];
    }
    if (this.aiTechniqueDialogue) return this.aiTechniqueDialogue.page;
    if (this.contextualLineDialogue) return this.contextualLineDialogue.page;
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
    if (this.phase !== "player") return this.battle.focus;
    // `0000:8492` opens the unit detail only for the unit under the focus cell and
    // closes it as soon as the focus leaves that unit, whatever the player is in
    // the middle of. While a range is being picked the cursor roams, so the panel
    // follows it: an empty cell brings the live minimap back (which is how the
    // original lets the player relocate the viewport mid-移動), a unit cell shows
    // that unit. Menus, route picking and self-centred casts keep the cursor on
    // the actor, so the selected unit stays up there.
    if (RANGE_SELECTION_MODES.has(this.actionMode)) return this.battle.unitAt(this.cursor);
    return this.selectedUnit ?? this.battle.unitAt(this.cursor);
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

  /**
   * `REMAKE-018`: the on-field commander grants the class while Nia is absent —
   * 希蜜 in stage 3, 蘇蘭達 in stages 8 and 11, the same commander that issues
   * the group commands. `0000:04AD` hard-codes Nia's portrait `2Eh` instead, and
   * `undefined` falls back to exactly that fixed grantor when a board has neither.
   */
  get promotionGrantor(): BattleUnit | undefined {
    const nia = this.battle.units.find(
      ({ side, portrait }) => side === 1 && portrait === NIA_CHARACTER_RECORD,
    );
    if (nia) return nia;
    const commander = this.battle.groupCommander;
    return commander?.side === 1 ? commander : undefined;
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

  get contextualLineDialogueActive(): boolean {
    return this.contextualLineDialogue !== undefined;
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

  /**
   * `REMAKE-110` 的倒数提示，接在回合开始信息之后。不在警告区间时是空串，因此普通
   * 回合的信息栏与原来逐字一致。
   */
  get roundLimitNotice(): string {
    return this.battle.roundLimitWarningActive
      ? `剩餘 ${this.battle.roundsRemaining} 回合，逾時判負。`
      : "";
  }

  get hasBlockingOverlay(): boolean {
    return this.hasOverlayOtherThanPromotion || this.promotionUnitIds.length > 0;
  }

  /** 轉職等待之外的覆蓋層；原版Debug在轉職選擇上疊開的畫面也算在內。 */
  private get hasOverlayOtherThanPromotion(): boolean {
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
      || this.battleContextDialogue !== undefined
      || this.aiTechniqueDialogueActive
      || this.contextualLineDialogueActive
      || this.groupCommandDialogueActive
      || this.debugMenu !== undefined
      || this.debugBehaviourEditor !== undefined
      || this.debugUnitEditor !== undefined
      || this.debugClassEditor !== undefined
      || this.debugTerrainEditor !== undefined
      || this.musicBoxOpen;
  }

  get groupLeader(): BattleUnit | undefined {
    const fixedCommander = this.battle.groupCommander;
    // 原版Debug把本關主將改成自動行動之後，集體命令改由游標或焦點上仍歸玩家的單位發出。
    if (fixedCommander && (fixedCommander.debugAiBehavior === undefined
      || this.battle.isPlayerControllableAlly(fixedCommander.id))) return fixedCommander;

    const cursorUnit = this.battle.unitAt(this.cursor);
    if (cursorUnit && this.battle.isPlayerControllableAlly(cursorUnit.id)) return cursorUnit;

    // The tactical desk is only visible while the pointer cursor is over an
    // empty cell. Keep that presentation hover separate from the battle's
    // retained unit focus, as the native side-panel path does.
    const retainedUnit = this.battle.focus;
    return retainedUnit && this.battle.isPlayerControllableAlly(retainedUnit.id)
      ? retainedUnit
      : undefined;
  }

  /**
   * `REMAKE-122`：集體命令的說話者。
   *
   * `跟隨主將` 講的是「跟著我來」，說話者必須是玩家剛指定的臨時主將本人。其餘兩項是
   * 全軍號令，複刻決定（`[DD]`）由本關主將發出——即模組 29 `6D0C/6D4B/6DA1` 讀
   * `DS:5788`（游標格）、由格上單位的描述子供肖像的那個原生取法，在複刻裡會退化成
   * 「上一個行動過的單位」：`battle.focusId` 每次攻擊、施法、被打都會改寫，於是士兵
   * 會替妮雅下令全軍休息。沒有明確 `commanderId` 的關卡（0／1／2／21／22）回退到槽
   * `1:0`，那是全戰役的妮雅槽；主將不在場時才落回焦點。
   */
  get groupCommandSpeaker(): BattleUnit | undefined {
    const leader = this.groupCommandLeaderId
      ? this.battle.unit(this.groupCommandLeaderId)
      : undefined;
    if (leader?.side === 1) return leader;
    const commander = this.battle.groupCommander ?? this.battle.unit("1:0");
    if (commander?.side === 1) return commander;
    const focus = this.battle.focus;
    return focus?.side === 1 ? focus : this.battle.units.find(({ side }) => side === 1);
  }

  get followLeaderAvailable(): boolean {
    return this.groupLeader !== undefined;
  }

  get commandMenuKind():
    | "initial"
    | "postMove"
    | "moveConfirm"
    | "extraMove"
    | "extraMoveConfirm" {
    if (this.pendingExtraMove) {
      return this.awaitingMoveConfirmation ? "extraMoveConfirm" : "extraMove";
    }
    if (!this.pendingPath) return "initial";
    return this.awaitingMoveConfirmation ? "moveConfirm" : "postMove";
  }

  get unitCommands(): readonly UnitCommand[] {
    if (this.commandMenuKind === "extraMove") {
      return [BASIC_COMMANDS[0], { id: "end", label: "放棄" }];
    }
    if (this.awaitingMoveConfirmation) return MOVE_CONFIRM_COMMANDS;
    const selectedClassCommand = this.selectedUnit
      ? classCommandFor(this.selectedUnit.classId, this.selectedUnit.side)
      : undefined;
    // `0000:6FFD` still lists and accepts 技術 while the caster is sealed; the
    // refusal happens on selection, as contextual line 1Ah. Removing the entry
    // here would hide a player-visible native response.
    const classCommand = selectedClassCommand;
    if (this.commandMenuKind === "postMove") {
      if (classCommand?.id !== "shoot") return POST_MOVE_COMMANDS;
      const [attack, ...rest] = POST_MOVE_COMMANDS;
      // A landing with shot targets but nobody adjacent opens `DS:3E1E`
      // 射擊／結束／返悔 (`0000:6AF9`). With an adjacent enemy the four-item menu
      // stays, rather than `6A55` jumping into its attack sub-flow (REMAKE-163).
      const unit = this.selectedUnit;
      return unit && this.attackTargetCells(unit).length === 0
        ? [classCommand, ...rest]
        : [attack, classCommand, ...rest];
    }
    return classCommand
      ? [BASIC_COMMANDS[0], BASIC_COMMANDS[1], classCommand, BASIC_COMMANDS[2]]
      : BASIC_COMMANDS;
  }

  get techniqueActions(): readonly BattleActionId[] {
    if (!this.selectedUnit) return [];
    return techniqueActionIdsFor(this.selectedUnit);
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
    if (this.battleContextDialogue) {
      const { pages, index, resume } = this.battleContextDialogue;
      if (index < pages.length - 1) {
        this.battleContextDialogue.index = index + 1;
        this.emit();
        return;
      }
      this.battleContextDialogue = undefined;
      this.emit();
      resume();
      return;
    }
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
    if (this.battleContextDialogue) {
      // 跳過 drops the remaining pages along with the current one.
      this.battleContextDialogue.index = this.battleContextDialogue.pages.length - 1;
      this.advanceDialogue();
    } else if (this.groupCommandDialogueActive) this.advanceDialogue();
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
      void this.processStageEvents(events).then(() => {
        if (
          (completed === "openingStory" || completed === "round2Story")
          && this.phase === completed
          && this.activeStoryId === undefined
        ) {
          this.phase = "player";
          this.statusMessage = completed === "openingStory"
            ? "我方回合：選擇一名尚未行動的單位。"
            : "第 2 回合開始。";
        } else if (completed === "victoryStory" && this.phase === completed) {
          this.phase = "victoryFeedback";
        }
        this.emit();
      });
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
      if (isStageBattleDialogueId(event.presentation)) {
        await this.presentStageBattleDialogue(event.presentation);
      } else {
        this.applyStagePresentation(event.presentation);
      }
      if (
        this.skippingScriptedSequence
        && event.presentation !== "none"
        && !isStageBattleDialogueId(event.presentation)
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
    if (definition.type === "enter-player-phase") {
      this.phase = "player";
      this.statusMessage = definition.statusText;
      return;
    }
    if (definition.type === "focus-actor") {
      const actor = this.battle.units.find(
        (unit) => unit.side === definition.actor.side && unit.slot === definition.actor.slot,
      );
      if (!actor) throw new Error(`Missing focus actor ${definition.actor.side}:${definition.actor.slot}`);
      this.battle.focusId = actor.id;
      this.cursor = { x: actor.x, y: actor.y };
      this.centerCamera(actor);
      return;
    }
    if (definition.type === "victory-state") {
      this.stageProgress = definition.value;
      return;
    }
    if (definition.type === "grant-experience") {
      const granted = this.battle.grantScriptedExperience(definition.actors, definition.amount);
      if (granted.length === 0) return;
      this.statusMessage = definition.statusText;
      this.emit();
      // 已经分出胜负的棋盘由胜负流程接管，剧情发放不再抢一个授职窗口出来。
      if (this.battle.outcome() !== "ongoing") return;
      // 发放本身不是转职：由与动作后扫描同一条队列决定谁必须选择新职业。
      const promotionPause = this.pauseForPromotions();
      if (promotionPause) await promotionPause;
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
    if (definition.type === "unit-form-transition") {
      this.battle.queueUnitFormTransition(definition.actorId, {
        classId: definition.targetClassId,
        name: definition.targetName,
        ...(definition.targetDisplayIdentity
          ? { displayIdentity: definition.targetDisplayIdentity }
          : {}),
        ...(definition.targetPortrait !== undefined
          ? { portrait: definition.targetPortrait }
          : {}),
        experience: definition.targetExperience,
      }, definition.context);
      await this.presentPendingUnitTransformations();
      this.statusMessage = definition.statusText;
      return;
    }
    this.campaignRoute = definition.destination;
    if (definition.destination === "stage-39") {
      this.stageProgress = 1000;
      this.phase = "credits";
      this.credits = new CreditsSession();
      this.statusMessage = "製作人員表：模組 46。";
      return;
    }
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

  /**
   * Plays a stage's in-battle dialogue on the battle map and resolves once the
   * player closes the last page; the phase that dispatched it then continues.
   */
  private async presentStageBattleDialogue(dialogueId: StageBattleDialogueId): Promise<void> {
    const dialogue = stageBattleDialogueFor(dialogueId);
    if (!dialogue) throw new Error(`Missing battle dialogue: ${dialogueId}`);
    const focus = this.battle.unit(dialogue.focusUnitId);
    if (focus) {
      this.battle.focusId = focus.id;
      this.cursor = { x: focus.x, y: focus.y };
      this.centerCamera(focus);
    }
    this.statusMessage = dialogue.statusText;
    this.emit();
    if (this.skippingScriptedSequence) return;
    await this.awaitBattleContextPages(dialogue.pages);
  }

  private async awaitBattleContextPages(pages: readonly DialoguePage[]): Promise<void> {
    await new Promise<void>((resolve) => {
      this.battleContextDialogue = { pages, index: 0, resume: resolve };
      this.emit();
    });
  }

  private applyStagePresentation(
    presentation: Exclude<StagePresentationId, StageBattleDialogueId>,
  ): void {
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
      // Campaign roster slots describe side 1 only. Looking them up for a side-2
      // reinforcement can collide with an unrelated ally that shares the same
      // numeric slot (Stage 20's dragon slot 28 otherwise inherited 160 life).
      const rosterEntry = actor.source.side === 1
        ? campaignRoster.find(({ slot }) => slot === actor.source.slot)
        : undefined;
      const classId = actor.forcedClassId
        ?? sourceUnit?.classId
        ?? rosterEntry?.classId
        ?? "soldier";
      const experience = actor.forcedExperience
        ?? (actor.forcedClassId && actor.source.side === 2
          ? initialEnemyExperience(actor.forcedClassId, this.battle.difficulty)
          : undefined)
        ?? sourceUnit?.experience
        ?? rosterEntry?.experience
        ?? 0;
      const inheritedLife = actor.forcedClassId === undefined
        ? sourceUnit?.life ?? rosterEntry?.life
        : undefined;
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
        // A forced profession rebuilds native derived attributes. Do not carry
        // a current-life value from a different class that happened to occupy
        // the same campaign slot (for example Kins's stale soldier fallback).
        life: inheritedLife ?? 1,
        experience,
        acted: definition.actionSpent ?? true,
        actionDisabled: sourceUnit?.actionDisabled ?? false,
        statuses: sourceUnit ? { ...sourceUnit.statuses } : emptyUnitStatuses(),
      };
      const maximumLife = this.battle.statsFor(unit).maxLife;
      unit.life = Math.max(0, Math.min(unit.life, maximumLife));
      if (inheritedLife === undefined) unit.life = maximumLife;
      return unit;
    });

    this.phase = "scriptedMove";
    this.statusMessage = definition.statusText;
    const forceInheritance = definition.actors.flatMap((actor) => actor.forceSourceId
      ? [{ sourceUnitId: actor.forceSourceId, derivedUnitId: actor.id }]
      : []);
    // Native `focusPortraitResource` selects the side panel for the whole write
    // sequence; without it the panel simply follows the last cell written.
    const applyPortraitFocus = (): void => {
      const target = (definition.focusPortrait === undefined
        ? undefined
        : [...units, ...this.battle.units].find(({ portrait }) => portrait === definition.focusPortrait))
        ?? units.at(-1);
      if (!target) return;
      this.battle.focusId = target.id;
      this.cursor = { x: target.x, y: target.y };
      this.centerCamera(target);
    };
    const focusBeforeWrite = definition.focusPortraitTiming === "before-write";
    if (focusBeforeWrite) applyPortraitFocus();
    if (this.skippingScriptedSequence) {
      this.battle.appendStoryUnits(units, forceInheritance);
      if (!focusBeforeWrite) applyPortraitFocus();
      return;
    }

    this.busy = true;
    if (definition.revealTiming === "after-write") {
      this.battle.appendStoryUnits(units, forceInheritance);
      applyPortraitFocus();
      this.emit();
      await pause(this.mapCombatDelay(3));
      this.busy = false;
      return;
    }
    if (definition.revealTiming === "deferred-refresh") {
      this.battle.appendStoryUnits(units, forceInheritance);
      this.busy = false;
      return;
    }
    for (const unit of units) {
      // Native 1000:533E focuses/redraws before writing each cell. That means
      // the next focus reveals the previous reinforcement rather than the
      // current write appearing immediately.
      const actor = definition.actors.find(({ id }) => id === unit.id);
      const focusPosition = actor?.focusPosition ?? unit;
      this.cursor = { x: focusPosition.x, y: focusPosition.y };
      this.centerCamera(focusPosition);
      this.emit();
      await pause(this.mapCombatDelay(3));
      this.battle.appendStoryUnits(
        [unit],
        forceInheritance.filter(({ derivedUnitId }) => derivedUnitId === unit.id),
      );
    }
    if (definition.revealTiming === "native-before-write-deferred-refresh") {
      this.busy = false;
      return;
    }
    if (!focusBeforeWrite) applyPortraitFocus();
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
    if (this.debugPlacement) {
      this.cursor = { ...position };
      this.placeDebugUnit(position);
      return;
    }
    if (this.actionMode === "shotRoute") {
      const target = this.magicArcherRouteTarget;
      if (target && positionKey(position) === positionKey(target)) {
        this.confirmMagicArcherRoute();
      }
      return;
    }
    if (this.actionMode === "selfAreaConfirm") {
      // Clicking the drawn footprint casts; anything outside it is treated as a
      // miss rather than a cast, so an off-target click cannot fire the spell.
      const preview = this.iceCastPreview;
      const inside = preview !== undefined
        && [...preview.freezeCells, ...preview.displacementRingCells]
          .some((cell) => positionKey(cell) === positionKey(position));
      if (inside) this.confirmSelfAreaAction();
      return;
    }
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
        if ((this.selectedActionId === "magic-archer-shot" || isVirtActionId(this.selectedActionId)) && unit) {
          this.beginMagicArcherRouteSelection(unit.id);
        } else {
          void this.commitSpecialAction(position);
        }
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
    } else if (!unit.acted && !unit.actionDisabled && unit.statuses.confusion > 0) {
      // `0000:55D3` accepts the click on side, action bit, disable value and
      // per-slot behavior alone, so a confused unit still passes the gate. The
      // accepted cell then reaches `0000:66F4`, which re-reads the confusion
      // word and diverts it to the contextual line plus the single-unit AI
      // entry `1000:1506` instead of opening the command menu.
      void this.runConfusedSelection(unit.id);
      return;
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
      || !ROAMING_CURSOR_MODES.has(this.actionMode)
      || this.hasBlockingOverlay
      || this.busy
    ) return;
    if (positionKey(position) === positionKey(this.cursor)) return;
    this.cursor = { ...position };
    this.emit();
  }

  /**
   * Landings stay `reachable`; `REMAKE-180` adds the display set, which also
   * holds the same-side cells the walk may cross, as the native range map
   * leaves them nonzero.
   */
  private loadMoveRange(unitId: string, extraMove: boolean): void {
    this.reachable = extraMove
      ? this.battle.extraMovementRange(unitId)
      : this.battle.reachableCells(unitId);
    this.moveRangeDisplay = this.reachable.length > 0
      ? this.battle.movementDisplayCells(unitId, extraMove)
      : [];
  }

  chooseMove(): void {
    const unit = this.selectedUnit;
    if (
      this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || (this.commandMenuKind !== "initial" && this.commandMenuKind !== "extraMove")
      || !unit
    ) return;
    this.loadMoveRange(unit.id, this.commandMenuKind === "extraMove");
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
      || this.pendingExtraMove
      || this.awaitingMoveConfirmation
      || !unit
    ) return;
    this.targets = this.attackTargetCells(unit);
    if (this.targets.length === 0) {
      // `0000:70B6` answers an empty target list with contextual line 1Bh and
      // returns to the command menu, so the unit says it rather than the strip.
      void this.reportNoAttackTarget(unit);
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
    if (this.pendingExtraMove || this.awaitingMoveConfirmation) return;
    const unit = this.selectedUnit;
    const actionId = unit && shootingActionIdFor(unit.classId, unit.side);
    if (actionId) this.chooseSpecialAction(actionId);
  }

  private attackTargetCells(unit: BattleUnit): Position[] {
    return this.battle.units
      .filter((candidate) => candidate.side !== unit.side
        && !candidate.actionDisabled
        && manhattan(unit, candidate) === 1)
      .map(({ x, y }) => ({ x, y }));
  }

  /**
   * `0000:7428` counts what a unit can do where it landed: ordinary attack
   * targets, and for a shooter with none of those, its shot targets. Zero sends
   * `734C` to the 確定／取消 menu instead of the post-move command menu.
   */
  private hasPostMoveTarget(unit: BattleUnit): boolean {
    if (this.attackTargetCells(unit).length > 0) return true;
    const shot = shootingActionIdFor(unit.classId, unit.side);
    return shot !== undefined && this.battle.actionTargetCells(unit.id, shot).length > 0;
  }

  chooseTechnique(): void {
    const unit = this.selectedUnit;
    if (
      this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || this.commandMenuKind !== "initial"
      || !unit
      || this.techniqueActions.length === 0
      || this.busy
    ) return;
    if (unit.statuses.techniqueSeal > 0) {
      // `0000:7005` reads DS:31B5h before the menu opens: a sealed caster says
      // so and stays on the command menu without spending anything.
      void this.refuseSealedTechnique(unit);
      return;
    }
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
      // Ice is the only self-centred technique with a footprint worth showing —
      // prayer scans allies without an effect radius — so only ice pauses for a
      // look. Everything else keeps the native "confirm the menu, it fires" flow.
      if (!isIceActionId(actionId)) {
        void this.commitSpecialAction(this.cursor);
        return;
      }
      this.actionMode = "selfAreaConfirm";
      this.statusMessage
        = `「${definition.label}」以${unit.className}為中心：藍格內的敵軍會被冰封，`
        + "黃色外圈只會被推出範圍。確定施展或按右鍵取消。";
      this.emit();
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
      ? actionId === HALF_DRAGON_TELEPORT_ACTION_ID
        ? "選擇半龍戰士要傳送到的空格。"
        : `選擇工兵移動並${actionId === "obstacle" ? "設置障礙" : "鋪設鐵板"}的空格。`
      : `選擇「${definition.label}」的${definition.target === "ally" ? "我方" : "敵方"}目標。`;
    this.emit();
  }

  /**
   * Commits the previewed ice cast. The centre is re-read from the actor rather
   * than from the cursor so a stray cursor can never relocate a self-centred
   * technique, whichever control the player used to confirm.
   */
  confirmSelfAreaAction(): void {
    if (
      this.phase !== "player"
      || this.actionMode !== "selfAreaConfirm"
      || this.busy
      || this.hasBlockingOverlay
    ) return;
    const unit = this.selectedUnit;
    if (!unit) return;
    void this.commitSpecialAction({ x: unit.x, y: unit.y });
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

  /** 確定 on the landing menu: `734C` marks the action spent through `7BE5`. */
  confirmMove(): void {
    const unit = this.selectedUnit;
    if (
      !unit
      || this.phase !== "player"
      || this.actionMode !== "actionMenu"
      || !this.awaitingMoveConfirmation
      || this.busy
    ) return;
    if (this.pendingExtraMove) {
      this.finishUnitAction("飛龍騎士完成攻擊後移動；單位行動結束。", true);
      return;
    }
    this.battle.wait(unit.id);
    this.finishUnitAction("單位行動結束。", true);
  }

  /** 取消 on the landing menu, also its `X` cancel code. */
  cancelMove(): void {
    if (this.actionMode === "actionMenu" && this.awaitingMoveConfirmation) {
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
    else if (command.id === "confirm") this.confirmMove();
    else if (command.id === "cancel") this.cancelMove();
  }

  // 轉職選擇中按原版Debug S 說台詞時 `busy`：台詞窗開著不收選擇。
  movePromotionSelection(delta: number): void {
    if (this.promotionDialogueActive || this.busy) return;
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
      || this.busy
      || index < 0
      || index >= this.promotionTargets.length
      || index === this.promotionSelectionIndex
    ) return;
    this.promotionSelectionIndex = index;
    this.emit();
  }

  confirmPromotion(): void {
    if (this.promotionDialogueActive || this.busy) return;
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

  private beginMagicArcherRouteSelection(targetId: string): void {
    const actor = this.selectedUnit;
    const target = this.battle.unit(targetId);
    const actionId = this.selectedActionId;
    if (!actor || !target || (actionId !== "magic-archer-shot" && !isVirtActionId(actionId))) return;
    // VIRT 與魔弓共用直線效果，路線同樣由玩家指定（`REMAKE-035`）。
    const routes = isVirtActionId(actionId)
      ? this.battle.debugVirtLineOptions(actor.id, target.id, actionId)
      : this.battle.magicArcherLineOptions(actor.id, target.id);
    if (routes.length === 0) {
      this.statusMessage = "目前沒有可連接主目標的合法箭道。";
      this.emit();
      return;
    }
    if (routes.length === 1) {
      void this.commitSpecialAction(target, routes[0]?.path);
      return;
    }
    this.magicArcherRoutes = routes.map((route) => ({
      ...route,
      path: route.path.map((position) => ({ ...position })),
      affectedUnitIds: [...route.affectedUnitIds],
    }));
    this.magicArcherRouteTargetId = target.id;
    this.selectedMagicArcherRouteIndex = 0;
    this.cursor = { x: target.x, y: target.y };
    this.actionMode = "shotRoute";
    this.updateMagicArcherRouteStatus();
    this.emit();
  }

  cycleMagicArcherRoute(delta: number): void {
    if (this.actionMode !== "shotRoute" || this.magicArcherRoutes.length < 2 || delta === 0) return;
    this.selectedMagicArcherRouteIndex = (
      this.selectedMagicArcherRouteIndex + delta + this.magicArcherRoutes.length
    ) % this.magicArcherRoutes.length;
    this.updateMagicArcherRouteStatus();
    this.emit();
  }

  confirmMagicArcherRoute(): void {
    const target = this.magicArcherRouteTarget;
    const route = this.selectedMagicArcherRoute;
    if (this.actionMode !== "shotRoute" || !target || !route) return;
    void this.commitSpecialAction(target, route.path);
  }

  private updateMagicArcherRouteStatus(): void {
    const route = this.selectedMagicArcherRoute;
    const target = this.magicArcherRouteTarget;
    if (!route || !target) return;
    const collateralCount = route.affectedUnitIds.filter((id) => id !== target.id).length;
    this.statusMessage = isVirtActionId(this.selectedActionId)
      ? `原版Debug：路線 ${this.selectedMagicArcherRouteIndex + 1}/${this.magicArcherRoutes.length}：主目標 1，沿線同一方 ${collateralCount}；切換後確認施放。`
      : `箭道 ${this.selectedMagicArcherRouteIndex + 1}/${this.magicArcherRoutes.length}：主目標 1，沿線敵軍 ${collateralCount}；切換後確認發射。`;
  }

  private clearMagicArcherRoutes(): void {
    this.magicArcherRoutes = [];
    this.magicArcherRouteTargetId = undefined;
    this.selectedMagicArcherRouteIndex = 0;
  }

  cancelAction(): void {
    // 原版技術測試在選格中取消（`CT`）就回到戰場，不回到技術選單（`0000:6C57`）。
    if (this.debugTechniqueCasterId
      && (this.actionMode === "specialTarget" || this.actionMode === "selfAreaConfirm")) {
      this.resetAction();
      if (this.resumeSuspendedSelection("原版Debug：已取消技術測試。")) return;
      this.statusMessage = "原版Debug：已取消技術測試。";
      this.emit();
      return;
    }
    if (this.actionMode === "target") {
      this.actionMode = "actionMenu";
      this.targets = [];
    } else if (this.actionMode === "shotRoute") {
      this.clearMagicArcherRoutes();
      this.actionMode = "specialTarget";
      this.statusMessage = "已返回魔弓主目標選擇。";
      this.emit();
      return;
    } else if (this.actionMode === "specialTarget") {
      const returnToTechnique = !isShootingActionId(this.selectedActionId);
      this.actionRange = [];
      this.targets = [];
      this.selectedActionId = undefined;
      this.actionMode = returnToTechnique ? "techniqueMenu" : "actionMenu";
    } else if (this.actionMode === "selfAreaConfirm") {
      this.selectedActionId = undefined;
      this.actionMode = "techniqueMenu";
    } else if (this.actionMode === "techniqueMenu") {
      this.techniqueIndex = 0;
      this.actionMode = "actionMenu";
    } else if (this.actionMode === "actionMenu") {
      if (this.commandMenuKind === "extraMove") {
        this.statusMessage = "攻擊已經提交；請選擇額外移動或放棄。";
        this.emit();
        return;
      }
      if (this.awaitingMoveConfirmation) {
        this.cancelMove();
        return;
      }
      if (this.commandMenuKind === "postMove") {
        void this.rollbackSelectedMovement();
        return;
      }
      this.resetAction();
      // 選格中的除錯操作讓轉職掃描延到這裡（原版退回待機循環就會掃描）。
      if (this.debugPromotionScanDeferred) {
        this.finishOriginalDebugMutation("已返回上一層。");
        return;
      }
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

  private async commitSpecialAction(
    position: Position,
    linePath?: readonly Position[],
  ): Promise<void> {
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
    // 技術測試（`REMAKE-174`）走模擬層的除錯入口：不看職業、禁咒、已行動與冰封，目標按絕對陣營。
    const debugCast = this.debugTechniqueCasterId === actor.id;
    // 選格中打開的技術測試：結束後回到原來的選格，轉職掃描與自動階段都留給那個選格收尾。
    const resumesSelection = debugCast && this.debugSuspendedSelection !== undefined;
    try {
      const prepared = debugCast ? this.battle.prepareDebugTechnique({
        actionId,
        actorId: actor.id,
        targetId: target?.id,
        target: definition.target === "self-area" ? undefined : position,
        ...(linePath ? { linePath: linePath.map((cell) => ({ ...cell })) } : {}),
      }) : this.battle.prepareSpecialAction({
        actionId,
        actorId: actor.id,
        targetId: target?.id,
        target: definition.target === "self-area" ? undefined : position,
        ...(linePath ? { linePath: linePath.map((cell) => ({ ...cell })) } : {}),
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
        if (resumesSelection) {
          this.busy = false;
          this.resumeSuspendedSelection(this.statusMessage);
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
        return;
      }

      await this.presentSpecialAction(actorPresentation, targetPresentation, prepared.result);
      await this.presentShotDodgeLine(actionId, targetPresentation);
      this.lastSpecialAction = debugCast
        ? this.battle.commitPreparedDebugTechnique(prepared)
        : this.battle.commitPreparedAction(prepared);
      const result = this.lastSpecialAction;
      for (const affected of result.affectedUnits.filter(({ died }) => died)) {
        const presentation = affectedPresentations.find(({ id }) => id === affected.unitId);
        if (presentation) await this.presentSpecialDeath(actorPresentation, presentation, result);
      }
      await this.presentSpecialActionExperienceLine(actorPresentation, result);
      await this.presentPendingUnitTransformations();
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
          ? `${targetPresentation.name}中毒，狀態重置為 3。`
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
            : targetPresentation.classId === "head" || targetPresentation.classId === "hand"
              ? `${targetPresentation.name}遭到禁咒，狀態重置為 3；專屬行動不受影響。`
              : `${targetPresentation.name}遭到禁咒，狀態重置為 3。`
        : actionId === HALF_DRAGON_TELEPORT_ACTION_ID
          ? `${actorPresentation.name}已傳送至（${result.target.x}, ${result.target.y}）。`
        : actionId === "lightning-1" || actionId === "lightning-2" || actionId === "lightning-3"
          || actionId === "lightning-4"
          ? `落雷對 ${result.affectedUnits.filter(({ blockReason }) => blockReason !== "frozen").length} 名敵人造成共 ${result.damage} 點傷害。`
          : isVirtActionId(actionId)
            ? `${definition.label}對 ${result.affectedUnits.filter(({ damage }) => damage > 0).length} 名單位造成共 ${result.damage} 點傷害。`
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

      if (resumesSelection) {
        this.busy = false;
        this.resumeSuspendedSelection(this.statusMessage);
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
      this.specialActionPresentation = undefined;
      this.statusMessage = error instanceof Error ? error.message : "特殊行動無效。";
      if (resumesSelection && this.resumeSuspendedSelection(this.statusMessage)) return;
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
      this.emit();
      const completed = await this.presentPreparedUnitPath(
        actor.id,
        prepared.path,
        "construction-movement",
      );
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

    if (result.actionId === "archer-shot" || result.actionId === "crossbow-shot"
      || result.actionId === WATER_WARRIOR_SHOT_ACTION_ID) {
      await present("shootBlank", -1, 6);
      for (let frame = 0; frame < 8; frame += 1) {
        await present("shootHit", frame, 6);
      }
      await present("shootBlank", -1, 6);
    } else if (result.actionId === "magic-archer-shot" || isVirtActionId(result.actionId)) {
      // VIRT 與魔弓共用 `3V` 的直線表現：`UN/60` + `MAGIC/83`，每段 20 tick。
      this.queueAudioCue(83, "magic-archer-shot-start", "magic");
      for (let index = 0; index < result.effectCells.length; index += 1) {
        await present("shootLineGrow", index, 20);
      }
      for (let frame = 0; frame < 8; frame += 1) {
        await present("shootLineFinish", frame, 20);
      }
    } else if (result.actionId === "wd") {
      const wd = actionPresentationCatalog().wd;
      for (let step = 0; step < result.effectCells.length; step += 1) {
        const cell = result.effectCells[result.effectCells.length - step - 1];
        if (cell) {
          const affected = result.affectedUnits.find(({ positionBefore }) =>
            positionBefore.x === cell.position.x && positionBefore.y === cell.position.y);
          if (affected) displayedLifeByUnitId[affected.unitId] = affected.lifeAfter;
        }
        await present(
          "wdGrowth",
          step,
          wd.waitPerGrowthOrFinishStepNativeTicks,
          result.affectedUnits.find(({ positionBefore }) =>
            positionBefore.x === cell?.position.x && positionBefore.y === cell?.position.y)?.unitId,
        );
      }
      for (let frame = 0; frame < wd.finishSteps; frame += 1) {
        await present("wdFinish", frame, wd.waitPerGrowthOrFinishStepNativeTicks);
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
      // Every lightning tier's system contract keeps its native draw counts and
      // tick total under speed, sound and reduced-motion options; only the wall
      // clock may change, through the player-visible presentation speed toggle.
      for (const phase of lightning.phases) {
        for (const _descriptor of phase.descriptorSequence) {
          await present("lightningMain", draw, phase.waitPerDrawNativeTicks);
          draw += 1;
          elapsedNativeTicks += phase.waitPerDrawNativeTicks;
          queueDueLightningAudio();
        }
      }
      const hit = lightning.commonHit;
      for (let iteration = 0; iteration < hit.iterations; iteration += 1) {
        for (let wave = 0; wave < hit.waveDrawsPerIteration; wave += 1) {
          await present("lightningHit", iteration * hit.waveDrawsPerIteration + wave, hit.waitPerWaveDrawNativeTicks);
        }
      }
      for (let frame = 0; frame < hit.cleanup.drawCount; frame += 1) {
        await present("lightningCleanup", frame, hit.cleanup.waitPerDrawNativeTicks);
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
    } else if (result.actionId === HALF_DRAGON_TELEPORT_ACTION_ID) {
      // The native handler hands the chosen cell to the ordinary movement
      // presentation, so this flies the predecessor walk instead of playing a
      // dedicated effect. The actor only moves when the prepared result commits.
      await this.presentPreparedUnitPath(
        result.actorId,
        this.battle.directTechniquePath(result.actorId, result.target),
        "half-dragon-technique-movement",
      );
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
    const maximumHoldNativeTicks = actionPresentationCatalog()
      .prayer.presentation.resultHold.maximumNativeTicksPerTriggeredUnit;

    for (const [index, affected] of prepared.affectedUnits.entries()) {
      const target = this.battle.unit(affected.unitId);
      if (!target) throw new Error("stale prepared prayer action");
      await this.focusCameraOnAction(affected.positionBefore);
      const targetPresentation = { ...target, statuses: { ...target.statuses } };
      // Every earlier recipient is already committed, so the board holds the life to
      // show. A later body of a split water warrior starts its prepared entry where the
      // earlier body leaves the shared life, so its own `lifeBefore` would show that
      // heal before it lands.
      const displayedLifeByUnitId: Record<string, number> = {};
      for (const { unitId } of prepared.affectedUnits) {
        const unit = this.battle.unit(unitId);
        if (unit) displayedLifeByUnitId[unitId] = unit.life;
      }
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
      this.emit();

      await new Promise<void>((resolve) => {
        const timeout = setProgramTimeout(resolve, this.mapCombatDelay(maximumHoldNativeTicks));
        this.prayerHoldSkip = () => {
          clearProgramTimeout(timeout);
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

  private async presentPendingUnitTransformations(): Promise<number> {
    let committed = 0;
    while (this.battle.pendingUnitTransformations.length > 0) {
      const pending = this.battle.pendingUnitTransformations[0];
      if (!pending) break;
      this.battle.focusId = pending.before.id;
      this.cursor = { x: pending.before.x, y: pending.before.y };
      this.centerCamera(pending.before);
      if (!this.skippingScriptedSequence) {
        this.battleContextDialogue = {
          index: 0,
          pages: [{
            activeSlot: "lower",
            lower: {
              text: pending.context.text,
              portrait: pending.before.portrait,
              speaker: unitDisplayName(pending.before),
            },
            source: {
              record: "battle-context",
              wait: pending.context.selector,
              address: pending.context.address,
            },
          }],
          resume: () => undefined,
        };
        this.statusMessage = `${unitDisplayName(pending.before)}的形態正在變化……`;
        this.emit();
        await new Promise<void>((resolve) => {
          if (!this.battleContextDialogue) {
            resolve();
            return;
          }
          this.battleContextDialogue.resume = resolve;
        });
      }
      const result = this.battle.commitNextUnitTransformation();
      this.cursor = { x: result.after.x, y: result.after.y };
      this.centerCamera(result.after);
      this.statusMessage = result.after.side === 1
        ? "維絲塔恢復女帝身分並加入我方。"
        : `維絲塔轉為${result.after.className}形態。`;
      committed += 1;
      this.emit();
    }
    return committed;
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
      const attackerPresentation = { ...attacker, statuses: { ...attacker.statuses } };
      const defenderPresentation = { ...defender, statuses: { ...defender.statuses } };
      const displayedLifeByUnitId = this.combatEntryLifeByUnitId();
      this.lastCombat = this.battle.attack(attacker.id, defenderId);
      const result = this.lastCombat;
      // The strip narrates first and reports the exchange only after the
      // presentation returns, like every other presented action. Both the map
      // and full-screen timelines count the life bars down themselves, so
      // writing the damage line before the await spoiled the swing under either
      // battle-animation setting.
      this.statusMessage = `${unitDisplayName(attackerPresentation)}攻擊${unitDisplayName(defenderPresentation)}……`;
      this.resetAction();
      await this.presentOrdinaryCombat(
        attackerPresentation,
        defenderPresentation,
        result,
        displayedLifeByUnitId,
      );
      this.statusMessage = `造成 ${result.damage} 點傷害${result.counterDamage ? `，受到 ${result.counterDamage} 點反擊` : ""}${result.splitCount ? `，水戰士分裂為 ${result.splitCount} 個並共享生命` : ""}。`;
      const transformations = await this.presentPendingUnitTransformations();
      if (transformations > 0 && this.resolveOutcome()) {
        this.busy = false;
        this.emit();
        return;
      }
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
    this.debugPromotionScanDeferred = false;
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
    this.debugTechniqueCasterId = undefined;
    this.commandIndex = 0;
    this.pendingOrigin = undefined;
    this.pendingPath = undefined;
    this.pendingExtraMove = false;
    this.awaitingMoveConfirmation = false;
    this.reachable = [];
    this.targets = [];
    this.actionRange = [];
    this.selectedActionId = undefined;
    this.techniqueIndex = 0;
    this.clearMagicArcherRoutes();
    this.minimapPreviewOrigin = undefined;
    this.terrainInspectionPosition = undefined;
  }

  openGroupCommands(): void {
    const fromBattle = this.phase === "player"
      && !this.busy
      && !this.hasBlockingOverlay
      && this.actionMode === "idle";
    if (!fromBattle) return;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.soundSettingsOpen = false;
    this.soundSettingsReturn = undefined;
    this.musicSettingsOpen = false;
    this.musicSettingsReturn = undefined;
    this.musicBoxOpen = false;
    this.clearOriginalDebugSurfaces();
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
      this.statusMessage = "請先把焦點移到一名在場的我方單位，再選擇跟隨主將。";
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
    if (!leader || !this.battle.commitFollowLeader(leader.id)) return;
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
    const automaticIds = this.battle.alliedActionOrder(false);
    this.statusMessage = mode === "autonomous"
      ? automaticIds.length > 0
        ? "友軍 NPC 軍團獨立行動。"
        : "玩家軍團已完成本回合行動。"
      : mode === "follow"
        ? "玩家軍團接管：其餘可操控角色跟隨主將。"
        : "玩家軍團接管：其餘可操控角色自由行動。";
    this.emit();

    const manualIds = mode === "autonomous"
      ? []
      : this.battle.alliedActionOrder(true)
        .filter((id) => this.battle.isPlayerControllableAlly(id));
    const runQueue = async (ids: readonly string[], followId?: string): Promise<boolean> => {
      const pendingIds = new Set(ids);
      while (pendingIds.size > 0) {
        const selection = this.battle.selectNextAlliedAiAction([...pendingIds], followId);
        if (!selection) break;
        const { unitId: id } = selection;
        pendingIds.delete(id);
        const action = selection.action
          ?? (this.battle.unit(id)?.statuses.confusion
            ? this.battle.planAlliedAiAction(id, followId)
            : undefined);
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
    // REMAKE-172: a force whose hold was lifted announces it before its first
    // released phase. The event is consumed once, so it survives save and load.
    for (const forceId of this.battle.releasedForceIds(automaticIds)) {
      await this.processStageEvents(this.consumeStageTrigger({ type: "force-released", forceId }));
    }
    if (await runQueue(automaticIds)) {
      this.busy = false;
      this.emit();
      return;
    }

    await this.presentTurnTransition("enemy");
    // `1000:147E` clears the side-1 action bits here, for the next player
    // phase. The side-1 disable array (ice) shares that boundary; side 2's
    // disable array waits for the next-round entry instead. Side 2's own
    // action bits are cleared inside `beginEnemyPhase` (`1000:14A6`).
    this.battle.clearActionState(1);
    this.battle.clearActionDisableState(1);
    this.phase = "enemy";
    const enemyPhaseUpdate = this.battle.beginEnemyPhase();
    // The trailing commander is named from the live unit: a hand-written name
    // here outlived REMAKE-051's rename of the stage 1 boss.
    const trailingNames = (enemyPhaseUpdate.delayedPursuitUnitIds ?? [])
      .flatMap((id) => this.battle.unit(id)?.name ?? []);
    const trailingNotice = trailingNames.length > 0
      ? `；${trailingNames.join("、")}將於下一回合出擊`
      : "";
    this.statusMessage = enemyPhaseUpdate.activatedGroupIds.includes("castle-guard")
      ? `城堡守軍解除警戒，全軍進入追擊${trailingNotice}。`
      : this.stageRuntime.enemyPhaseStatusText;
    this.emit();
    if (enemyPhaseUpdate.activatedGroupIds.length > 0) {
      await pause(this.mapCombatDelay(40));
    }
    const pendingEnemyIds = new Set(this.battle.enemyActionOrder());
    const deferEnemyOutcome = this.battle.enemyPhaseTailExecutionCount() > 0;
    while (pendingEnemyIds.size > 0) {
      const selection = this.battle.selectNextEnemyAiAction([...pendingEnemyIds]);
      if (!selection) break;
      const { unitId: id } = selection;
      pendingEnemyIds.delete(id);
      if (!this.battle.unit(id)) continue;
      if (!this.battle.hasRouteEnemy() || this.battle.unit(id)?.statuses.confusion) {
        const action = selection.action ?? this.battle.planEnemyAiAction(id);
        if (action && await this.runAlliedAiAction(action, "enemy", undefined, deferEnemyOutcome)) {
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
      if (!deferEnemyOutcome && this.resolveOutcome()) {
        this.busy = false;
        this.emit();
        return;
      }
    }
    this.enemyPhaseTailPresentationTrace = [];
    for (let execution = 1; execution <= this.battle.enemyPhaseTailExecutionCount(); execution += 1) {
      const prepared = this.battle.prepareEnemyPhaseTail();
      if (!prepared) continue;
      this.statusMessage = `敵方階段尾魔法第 ${execution} 次發動；棋盤位移將在演出後結算。`;
      await this.presentEnemyPhaseTail(prepared, execution);
      this.battle.commitEnemyPhaseTail(prepared);
      this.statusMessage = prepared.moves.length > 0
        ? `第 ${execution} 次魔法向下推動 ${prepared.moves.length} 名我方。`
        : `第 ${execution} 次魔法完成；此縱列沒有可下推的我方。`;
      this.emit();
    }
    if (this.resolveOutcome()) {
      this.busy = false;
      this.emit();
      return;
    }
    await this.presentTurnTransition("player");
    this.battle.startNextRound();
    // REMAKE-110: 越过回合上限就没有下一个玩家阶段。判负必须发生在逐关回合事件和
    // 焦点重置之前，否则会先跑一遍第 100 回合的事件、并让 HUD 画出一个不存在的回合。
    if (this.resolveOutcome()) {
      this.busy = false;
      this.emit();
      return;
    }
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
      this.statusMessage = `第 ${this.battle.round} 回合開始。${this.roundLimitNotice}`;
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

  /**
   * Native `0000:66F4`: a clicked player unit whose confusion bit is set never
   * reaches the command menu. It speaks contextual line `1Ch` with its own
   * portrait — through `0000:C97E` directly, so the ＡＩ對話 switch does not
   * gate it — and is then dispatched to the same single-unit AI entry the
   * automatic phase uses, which spends its action.
   */
  private async runConfusedSelection(unitId: string): Promise<void> {
    if (this.phase !== "player" || this.busy) return;
    const unit = this.battle.unit(unitId);
    if (!unit || unit.statuses.confusion <= 0) return;
    this.busy = true;
    this.resetAction();
    this.terrainInspectionPosition = undefined;
    this.battle.focusId = unit.id;
    this.cursor = { x: unit.x, y: unit.y };
    this.centerCamera(unit);
    await this.presentContextualLine(
      unit,
      "confusedActor",
      `${unit.name}混亂中，無法聽從指揮。`,
    );
    const action = this.battle.planAlliedAiAction(unit.id);
    if (action) {
      await this.runAlliedAiAction(action, "allyAuto", `${unit.name}混亂中，無法聽從指揮。`);
    } else {
      this.battle.spendAction(unit.id);
      this.statusMessage = `${unit.name}混亂中，原地耗盡本回合行動。`;
    }
    this.busy = false;
    this.emit();
  }

  /**
   * Native `0000:7005`: the sealed caster answers the 技術 command with line
   * `1Ah` and the command menu stays open. Nothing is spent, so the player can
   * still move, attack or rest with the same unit.
   */
  private async refuseSealedTechnique(unit: BattleUnit): Promise<void> {
    this.busy = true;
    this.emit();
    await this.presentContextualLine(unit, "spellSealed");
    this.busy = false;
    this.statusMessage = `${unit.name}被禁咒封住法術，本回合不能施展技術。`;
    this.emit();
  }

  /**
   * Native `0000:70B6`: an empty adjacent-target list is answered by line `1Bh`
   * from the acting unit, then the command menu comes back.
   */
  private async reportNoAttackTarget(unit: BattleUnit): Promise<void> {
    this.busy = true;
    this.emit();
    await this.presentContextualLine(unit, "noTargetInRange");
    this.busy = false;
    this.statusMessage = this.commandMenuKind === "postMove"
      ? `${unit.name}的攻擊範圍內沒有敵人。請結束行動或返悔。`
      : `${unit.name}的攻擊範圍內沒有敵人。請選擇移動或休息。`;
    this.emit();
  }

  /**
   * Native `0000:722B`: the *player's* physical shot on a class that shrugs it
   * off makes the target speak line `1Dh` after the shot presentation. This half
   * reaches `0000:C97E` directly, so the ＡＩ對話 switch does not silence it; the
   * AI half at `1000:1FB2` does and is played separately. `REMAKE-099` replaced
   * the native PIT dodge roll with a deterministic immunity, so every such shot
   * is blocked; the window itself still rolls the REMAKE-161 opening coin.
   */
  private async presentShotDodgeLine(
    actionId: BattleActionId,
    target: BattleUnit | undefined,
  ): Promise<void> {
    if (!target || !isPhysicalShotDodgedBy(actionId, target)) return;
    await this.presentContextualLine(target, "dodgedShot");
  }

  /**
   * The planner-emitted lines reach `0000:C97E` through `1000:254F`, so unlike
   * the player responses they obey the ＡＩ對話 switch DS:111C exactly like the
   * AI technique notices do.
   */
  private async presentAiContextualLine(
    actor: BattleUnit,
    line: ContextualBattleLineKey,
    statusText?: string,
  ): Promise<void> {
    if (!this.aiDialogueEnabled) return;
    await this.presentContextualLine(actor, line, statusText);
  }

  /**
   * Native `0000:C981`: every DS:84BB window except `18h`/`1Fh..22h` first
   * passes the `0000:CAC3` coin, whichever route reached `0000:C97E`.
   * REMAKE-161 rolls it from a presentation-only source, so a closed coin skips
   * the window and nothing else — no simulation state, no battle PRNG draw.
   */
  private nativeLineWindowOpens(selector: number): boolean {
    return !nativeContextualSelectorRollsCoin(selector)
      || nativeContextualLineCoinPasses(Math.random());
  }

  /**
   * Native `0000:91F1`/`0000:9161`/`0000:7678` all load the award into the
   * record with `0000:EF56` and then hand the earner's own cell to
   * `0000:C97E`, which plays selector `18h` unconditionally — it is one of the
   * five selectors `0000:C981` lets through without the PIT gate every other
   * contextual line has to pass.
   */
  private async presentExperienceGainLine(actor: BattleUnit, amount: number): Promise<void> {
    await this.presentContextualLine(
      actor,
      "experienceGain",
      undefined,
      experienceGainDialogueFor(actor, amount),
    );
  }

  /**
   * `REMAKE-133` repairs the native presentation gap at `0000:719B` and the AI
   * special-action entry: every committed special action that actually removes
   * at least one unit now reports the earner's real experience delta. Reading
   * the post-commit unit is intentional — stage 37 boss parts discard the
   * resolver's experience return, so displaying `result.experienceGained`
   * directly would claim an award that never entered simulation state.
   *
   * Nonlethal action experience remains silent, matching the ordinary-combat
   * feedback rule and avoiding a window for every heal, buff or cast.
   */
  private async presentSpecialActionExperienceLine(
    actorBefore: BattleUnit,
    result: SpecialActionResult,
  ): Promise<void> {
    if (!result.affectedUnits.some(({ died }) => died)) return;
    const actorAfter = this.battle.unit(actorBefore.id);
    const amount = actorAfter ? actorAfter.experience - actorBefore.experience : 0;
    if (amount <= 0) return;
    await this.presentExperienceGainLine(actorBefore, amount);
  }

  private async presentContextualLine(
    actor: BattleUnit,
    line: ContextualBattleLineKey,
    statusText?: string,
    /** Only `18h` needs one: the record with its numeric field already written. */
    prepared?: DialoguePage,
  ): Promise<void> {
    // The status line is the remake's own feedback, so it stays even when the
    // native coin keeps the window shut.
    if (statusText !== undefined) this.statusMessage = statusText;
    if (!this.nativeLineWindowOpens(NATIVE_CONTEXTUAL_BATTLE_LINES[line].selector)) {
      this.emit();
      return;
    }
    const page = prepared ?? contextualBattleDialogueFor(actor, line);
    this.contextualLineDialogue = { actor, line, page };
    this.emit();
    const text = page.activeSlot ? page[page.activeSlot]?.text ?? "" : "";
    // The native window closes on its own after the per-character wait; there is
    // no confirmation menu, so the remake only scales the wall clock.
    await pause(this.testMode
      ? 800
      : this.presentationFast
        ? Math.max(360, text.length * 20 + 120)
        : Math.max(1_200, text.length * 80 + 220));
    this.contextualLineDialogue = undefined;
    this.emit();
  }

  private async runAlliedAiAction(
    action: AlliedAiAction,
    movementKind: Extract<MovementKind, "allyAuto" | "enemy"> = "allyAuto",
    /** Set when the actor was not scheduled by a phase queue, e.g. a confused click. */
    actingStatusText?: string,
    deferOutcome = false,
  ): Promise<boolean> {
    let unit = this.battle.unit(action.unitId);
    if (!unit) return deferOutcome ? false : this.resolveOutcome();
    this.battle.focusId = unit.id;
    this.cursor = { x: unit.x, y: unit.y };
    // REMAKE-143: an idle rest — a unit that found nothing to do and recovers
    // where it stands — changes nothing on the board, so it neither drags the
    // camera to itself nor plays the map effect off screen. Low-life rests and
    // every other action keep the existing focus; the line still follows the
    // ＡＩ對話 switch like the native one does.
    const idleRest = action.kind === "rest" && action.nativeLine === "restingToRecover";
    const restVisible = !idleRest || cameraContains(this.battle.stage, this.cameraOrigin, unit);
    if (!idleRest) this.centerCamera(unit);
    this.statusMessage = actingStatusText
      ?? (movementKind === "enemy"
        ? `${unit.name}正在自動行動。`
        : this.battle.isPlayerControllableAlly(unit.id)
          ? `玩家軍團：${unit.name}正在執行集團命令。`
          : `友軍 NPC 軍團：${unit.name}正在獨立行動。`);
    this.emit();

    // Native `1000:2233`/`2265`/`227B` speak from inside the planner, before the
    // retreat or rest they chose actually runs; `1000:1CFB` likewise speaks 03h
    // before the follower walks its route.
    if (action.nativeLine) await this.presentAiContextualLine(unit, action.nativeLine);

    if (
      (action.kind === "move" || action.kind === "attack" || action.kind === "special"
        || action.kind === "route-pulse")
      && action.path.length > 1
    ) {
      await this.animateUnitPath(unit.id, action.path, movementKind);
      unit = this.battle.unit(action.unitId);
      if (!unit) return deferOutcome ? false : this.resolveOutcome();
    }

    if (action.kind === "route-pulse") {
      const prepared = this.battle.prepareRoutePulse(unit.id, action.path);
      this.statusMessage = action.path.length > 1
        ? `${unit.name}向前引導結界；力場即將發動。`
        : `${unit.name}的結界未前進；力場仍然發動。`;
      await this.presentRoutePulse(prepared);
      this.lastRoutePulse = this.battle.commitRoutePulse(prepared);
      await this.presentPendingUnitTransformations();
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
            ...(action.linePath ? {
              linePath: action.linePath.map((position) => ({ ...position })),
            } : {}),
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
          // `1000:1F6D`: the shot has its own contextual line rather than an
          // action-table notice, because the native shooting codes collide with
          // the technique codes in that table. Only the three native shooting
          // careers `3A/0I/1I` reach that flow; the water warrior's shot is
          // `REMAKE-093`'s side-1 grant and has no native line to borrow.
          if (isShootingActionId(action.actionId)
            && action.actionId !== WATER_WARRIOR_SHOT_ACTION_ID) {
            await this.presentAiContextualLine(actorPresentation, "shootingAnnounce");
          }
          await this.presentSpecialAction(actorPresentation, targetPresentation, prepared.result);
          // `1000:1FB2` is the AI half of the dodge line, so this one follows the
          // switch; the player's own shot answers through `0000:7260` and does not.
          if (isPhysicalShotDodgedBy(action.actionId, targetPresentation)) {
            await this.presentAiContextualLine(targetPresentation, "dodgedShot");
          }
          const result = this.battle.commitPreparedAction(prepared);
          this.lastSpecialAction = result;
          for (const affected of result.affectedUnits.filter(({ died }) => died)) {
            const presentation = affectedPresentations.find(({ id }) => id === affected.unitId);
            if (presentation) await this.presentSpecialDeath(actorPresentation, presentation, result);
          }
          await this.presentSpecialActionExperienceLine(actorPresentation, result);
          await this.presentPendingUnitTransformations();
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
              ? `${unit.name}使${target.name}中毒，狀態重置為 3。`
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
                : target.classId === "head" || target.classId === "hand"
                  ? `${unit.name}使${target.name}遭到禁咒，狀態重置為 3；專屬行動不受影響。`
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
        } catch (error) {
          // A planned action can legitimately turn illegal before it commits,
          // and spending the turn is the right answer for that. What must not
          // happen is the presentation surviving the throw: every later
          // `emit` would replay the same broken frame and take the enemy
          // phase down with it — stage 22's missing WD atlas froze the board
          // exactly that way. Report the cause too; this branch is a
          // fallback, not a place to lose an asset or rule defect.
          console.error(`${unit.name}的${action.actionId}無法完成`, error);
          this.aiTechniqueDialogue = undefined;
          this.specialActionPresentation = undefined;
          this.battle.spendAction(unit.id);
          this.statusMessage = `${unit.name}的特殊行動已失效，改為待命。`;
        }
      } else {
        this.battle.spendAction(unit.id);
      }
    } else if (action.kind === "attack" && action.targetId) {
      const defender = this.battle.unit(action.targetId);
      if (defender && manhattan(unit, defender) === 1) {
        const attackerPresentation = { ...unit, statuses: { ...unit.statuses } };
        const defenderPresentation = { ...defender, statuses: { ...defender.statuses } };
        const displayedLifeByUnitId = this.combatEntryLifeByUnitId();
        this.lastCombat = this.battle.attack(unit.id, defender.id);
        const result = this.lastCombat;
        // The acting line set above stays up for the whole presentation; the
        // damage readout lands only once the exchange has played out.
        await this.presentOrdinaryCombat(
          attackerPresentation,
          defenderPresentation,
          result,
          displayedLifeByUnitId,
        );
        this.statusMessage = `${unit.name}造成 ${result.damage} 點傷害${result.counterDamage ? `，受到 ${result.counterDamage} 點反擊` : ""}${result.splitCount ? `，水戰士分裂為 ${result.splitCount} 個並共享生命` : ""}。`;
        await this.presentPendingUnitTransformations();
      } else {
        this.battle.spendAction(unit.id);
      }
    } else if (action.kind === "rest") {
      if (restVisible) {
        const presentationUnit = { ...unit, statuses: { ...unit.statuses } };
        await this.presentRest(presentationUnit);
      }
      const recovered = this.battle.rest(unit.id);
      this.statusMessage = `${unit.name}休息，恢復 ${recovered} 點生命。`;
    } else {
      this.battle.spendAction(unit.id);
      this.statusMessage = action.kind === "move" ? `${unit.name}移動完畢。` : `${unit.name}原地待命。`;
    }

    const promotionPause = this.pauseForPromotions();
    if (promotionPause) await promotionPause;
    const ended = deferOutcome ? false : this.resolveOutcome();
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
    // The force-field pulse runs the shared lightning wave (`1000:6D4C`), so it keeps its
    // native draw count and 44-tick total under every presentation option, exactly like the
    // map techniques; only the player-visible speed toggle may change the wall clock.
    const timeline = routePulsePresentationTimeline(definition);
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
      await pause(this.mapCombatDelay(frame.nativeTicks));
    }
    this.routePulsePresentation = undefined;
  }

  private async presentEnemyPhaseTail(
    prepared: PreparedEnemyPhaseTail,
    execution: number,
  ): Promise<void> {
    const definition = this.stageRuntime.assets?.enemyPhaseTailPresentations
      ?.find(({ id }) => id === prepared.presentationId);
    if (!definition) {
      throw new Error(`Missing enemy-phase-tail presentation ${prepared.presentationId}`);
    }
    for (const step of enemyPhaseTailPresentationTimeline(definition, prepared.origin)) {
      this.centerCamera(step.origin);
      this.enemyPhaseTailPresentation = { prepared, execution, ...step };
      this.enemyPhaseTailPresentationTrace.push({ execution, ...step });
      this.emit();
      await pause(this.mapCombatDelay(step.nativeTicks));
    }
    this.enemyPhaseTailPresentation = undefined;
  }

  private async presentOrdinaryCombat(
    attacker: BattleUnit,
    defender: BattleUnit,
    result: AttackResult,
    displayedLifeByUnitId: Readonly<Record<string, number>>,
  ): Promise<void> {
    this.combatPresentationTrace = [];
    const finalDefenderLife = Math.max(0, defender.life - result.damage);
    const finalAttackerLife = Math.max(0, attacker.life - result.counterDamage);
    if (this.battlePresentation === "full") {
      await this.presentFullScreenCombat(attacker, defender, result, displayedLifeByUnitId);
      // REMAKE-057 keeps the native full-screen death, then returns to the
      // board for the complete MAGIC/12 clear instead of silently skipping
      // the directly struck body.
      if (result.defenderDied) {
        await this.presentMapCombatDeaths(
          attacker,
          defender,
          result,
          "defenderDeath",
          0,
          finalAttackerLife,
          finalDefenderLife,
          displayedLifeByUnitId,
        );
      } else if (result.attackerDied) {
        await this.presentMapCombatDeaths(
          attacker,
          defender,
          result,
          "attackerDeath",
          0,
          finalAttackerLife,
          finalDefenderLife,
          displayedLifeByUnitId,
        );
      }
      // `0000:9296` runs the death scan first and only then pays experience:
      // `0000:9161` (the counter) before `0000:91F1` (the opening blow), so on
      // this branch both `18h` windows come after MAGIC/12 rather than before
      // it. Only one of the two can fire — a defender that dies never counters.
      await this.presentOrdinaryCombatExperienceLines(attacker, defender, result);
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
        displayedLifeByUnitId,
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
        displayedLifeByUnitId,
      );
      await pause(this.mapCombatDelay(1));
    }

    if (result.defenderDied) {
      // `0000:91C5` pays the kill at `0000:91F1` — window `18h` included —
      // before `0000:96C2` removes the body, so on the map route the earner
      // speaks while the corpse is still standing and MAGIC/12 follows.
      await this.presentExperienceGainLine(attacker, result.experienceGained);
      await this.presentMapCombatDeaths(
        attacker,
        defender,
        result,
        "defenderDeath",
        0,
        displayedAttackerLife,
        displayedDefenderLife,
        displayedLifeByUnitId,
      );
    } else if (result.counterOccurred) {
      // `0000:9289` plays contextual line 1Eh from the defender between the
      // attack damage and the counter, and only on the map route: the
      // full-screen branch at `0000:9296` never calls it. Its gate DS:77B4 is
      // written 'Y' only at `0000:9557`, which needs both the PIT coin flip and
      // class `2E`; that is the bone knight's full-damage reflect, not an
      // ordinary counter. `REMAKE-098` made the same reflect deterministic, so
      // the line now follows every bone-knight counter and no other.
      if (defender.classId === "bone-knight") {
        await this.presentContextualLine(defender, "counterattack");
      }
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
          displayedLifeByUnitId,
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
          displayedLifeByUnitId,
        );
        await pause(this.mapCombatDelay(1));
      }
      if (result.attackerDied) {
        // `0000:9135` mirrors the opening blow: `0000:9161` pays the counter
        // kill and speaks `18h` before its own `0000:96C2` clears the body.
        await this.presentExperienceGainLine(defender, result.counterExperienceGained);
        await this.presentMapCombatDeaths(
          attacker,
          defender,
          result,
          "attackerDeath",
          0,
          displayedAttackerLife,
          displayedDefenderLife,
          displayedLifeByUnitId,
        );
      }
    }

    this.combatPresentation = undefined;
  }

  /**
   * The full-screen route's own `18h` order. `0000:9296` calls `0000:9161`
   * before `0000:91F1`, so the counter's window would precede the opening
   * blow's; only one of them can ever have a kill to report.
   */
  private async presentOrdinaryCombatExperienceLines(
    attacker: BattleUnit,
    defender: BattleUnit,
    result: AttackResult,
  ): Promise<void> {
    if (result.attackerDied) {
      await this.presentExperienceGainLine(defender, result.counterExperienceGained);
    }
    if (result.defenderDied) {
      await this.presentExperienceGainLine(attacker, result.experienceGained);
    }
  }

  private async presentMapCombatDeaths(
    attacker: BattleUnit,
    defender: BattleUnit,
    result: AttackResult,
    phase: "defenderDeath" | "attackerDeath",
    startIndex: number,
    displayedAttackerLife: number,
    displayedDefenderLife: number,
    displayedLifeByUnitId: Readonly<Record<string, number>>,
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
          displayedLifeByUnitId,
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
    displayedLifeByUnitId: Readonly<Record<string, number>>,
  ): Promise<void> {
    // The native full-screen battle freezes the status-panel values at their
    // pre-strike numbers while its bottom gauges update at impact. The Web
    // side HUD mirrors the frozen entry snapshot through describeFocus(). The
    // whole presentation is a single measured timeline sampled against a clock.
    // Camera and panel timing remain wall-clock driven, while profession poses
    // and projectile positions preserve the original discrete renderer steps.
    // 0000:90D8 resolves the backdrop from the defender's cell before the
    // presentation is dispatched, so the counter-attack keeps the same one.
    const script = buildFullCombatScript(attacker, defender, result, fullCombatBackgroundRecord(
      this.battle.stage.nativeStage,
      this.battle.terrainSlotAt(defender),
    ), this.fullCombatBackdropPhases);
    // The phases are fixed by the script, so a presentation that is cut short
    // still hands the next battle the phases the whole one would have left.
    this.fullCombatBackdropPhases = script.finalBackdropPhases;
    const fastTest = this.testMode && !this.fullCombatRealTime;
    const timeScale = fastTest ? 24 : this.presentationFast ? 3.2 : 1;
    const frameInterval = fastTest ? 2 : 15;
    const start = programNow();
    let cueIndex = 0;
    let markIndex = 0;
    let phase: CombatPresentationPhase = "fullOpen";
    let elapsed = 0;
    while (elapsed <= script.duration) {
      elapsed = (programNow() - start) * timeScale;
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
        displayedLifeByUnitId,
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
    displayedLifeByUnitId: Readonly<Record<string, number>>,
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
      displayedLifeByUnitId,
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

  private combatEntryLifeByUnitId(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.battle.units.map(({ id, life }) => [id, life]));
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

  // Every native board walk — player 移動, the 半龍戰士 direct technique, 工兵
  // construction, both AI sides and scripted stage events — reaches the shared
  // playback function 1000:7F72, which loads E/14 and submits it once through
  // the 移動 gate 0000:0249 before the first step. Path building at 1000:7E09
  // marks start==destination with DS:77AF='N', and 7F72 then skips to 805B
  // without requesting audio, so a path with no step stays silent.
  private queueWalkAudioCue(reason: string | undefined, path: readonly Position[]): void {
    if (reason === undefined || path.length < 2) return;
    this.queueAudioCue(14, reason);
  }

  // Publish the end of a walk so the audio layer can bound E/14 by the actual
  // presentation instead of letting the 1.261 s clip run past the arrival.
  // Every step is already committed here, so this only notifies observers.
  private endMovementPresentation(): void {
    this.movementPresentation = undefined;
    this.emit();
  }

  private mapCombatDelay(nativeTicks: number): number {
    if (this.testMode && !this.mapCombatRealTime) return Math.max(4, nativeTicks * 4);
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

  /**
   * `12E7:0008` draws the SAY record `DS:1273` names for this stage, so a surface
   * with no native stage — the arena, the class showdown, the labs — has no panel
   * to show. Refusing to open here rather than opening an empty frame also keeps
   * `hasBlockingOverlay` false, so those surfaces never swallow their own input.
   */
  get hasObjectivePanel(): boolean {
    return nativeObjectivePanelText(this.battle.stage.id) !== undefined;
  }

  openObjectives(): void {
    if (
      this.busy
      || !this.hasObjectivePanel
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
    this.musicBoxOpen = false;
    this.clearOriginalDebugSurfaces();
    this.groupCommandOpen = false;
    this.minimapPreviewOrigin = undefined;
    this.terrainInspectionPosition = undefined;
    this.objectiveOpen = true;
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
    this.musicBoxOpen = false;
    this.clearOriginalDebugSurfaces();
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
    this.settingsMenuIndex = 0;
    this.emit();
  }

  closeSettings(): void {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.systemMenuOpen = true;
    this.emit();
  }

  moveSettingsMenuSelection(delta: number): void {
    if (!this.settingsOpen || delta === 0) return;
    this.settingsMenuIndex = (
      this.settingsMenuIndex + delta + GAME_FUNCTION_COUNT
    ) % GAME_FUNCTION_COUNT;
    this.emit();
  }

  selectSettingsMenuItem(index: number): void {
    if (
      !this.settingsOpen
      || index < 0
      || index >= GAME_FUNCTION_COUNT
      || index === this.settingsMenuIndex
    ) return;
    this.settingsMenuIndex = index;
    this.emit();
  }

  activateSettingsMenuSelection(): void {
    if (!this.settingsOpen) return;
    if (this.settingsMenuIndex === 0) this.togglePortraits();
    else if (this.settingsMenuIndex === 1) this.toggleBattlePresentation();
    else if (this.settingsMenuIndex === 2) this.toggleGrid();
    else if (this.settingsMenuIndex === 3) this.toggleEdgeScroll();
    else this.toggleAiDialogue();
  }

  openSoundSettings(): void {
    const fromBattle = this.phase === "player"
      && !this.busy
      && !this.hasBlockingOverlay
      && this.actionMode === "idle";
    if (!fromBattle) return;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.soundSettingsOpen = true;
    this.soundSettingsReturn = "battle";
    this.minimapPreviewOrigin = undefined;
    this.terrainInspectionPosition = undefined;
    this.emit();
  }

  closeSoundSettings(): void {
    if (!this.soundSettingsOpen) return;
    this.soundSettingsOpen = false;
    this.soundSettingsReturn = undefined;
    this.emit();
  }

  openMusicSettings(): void {
    const fromBattle = this.phase === "player"
      && !this.busy
      && !this.hasBlockingOverlay
      && this.actionMode === "idle";
    if (!fromBattle) return;
    this.systemMenuOpen = false;
    this.settingsOpen = false;
    this.musicSettingsOpen = true;
    this.musicSettingsReturn = "battle";
    this.minimapPreviewOrigin = undefined;
    this.terrainInspectionPosition = undefined;
    this.emit();
  }

  closeMusicSettings(): void {
    if (!this.musicSettingsOpen) return;
    this.musicSettingsOpen = false;
    this.musicSettingsReturn = undefined;
    this.emit();
  }

  // ── REMAKE-174 原版Debug模式與音樂盒 ─────────────────────────────────────────
  // 原版（模組 29）的除錯分發器 `0000:30CE` 在待機戰場（按住 Caps Lock）、選格與轉職選擇中
  // 運行（`original-debug-hosts.ts`）；這裡的每個入口都對應 `reverse/notes/developer-debug-mode.md`
  // 的一個處理器。除錯操作不消耗戰鬥 PRNG，改動的單位狀態與一般狀態一樣保存。

  /** 開關只在正式戰役生效；實驗室的記憶體戰鬥不接受除錯。 */
  get originalDebugActive(): boolean {
    return this.campaignPersistenceEnabled && originalDebugModeEnabled();
  }

  /**
   * 熱鍵在哪個戰場狀態生效：我方待機（查看敵方或友軍自動單位範圍的預覽也算）、移動／攻擊／射擊／
   * 傳送／技術／建造的選格，或轉職的職業選擇。選單、對白、演出、除錯畫面、放回單位等待、授職對白
   * 與敵方階段一律不收；原版通用選單只在拖曳把手上接收，複刻不做。
   */
  get originalDebugHost(): OriginalDebugHost | undefined {
    if (!this.originalDebugActive || this.phase !== "player" || this.busy || this.debugPlacement) return undefined;
    if (this.promotionUnitIds.length > 0) {
      return this.promotionChoiceVisible && !this.hasOverlayOtherThanPromotion ? "promotion" : undefined;
    }
    if (this.hasBlockingOverlay) return undefined;
    if (this.actionMode === "idle" || this.actionMode === "enemyPreview" || this.actionMode === "allyPreview") {
      return "idle";
    }
    return this.debugSelectionActive ? "selection" : undefined;
  }

  /** 我方正在某個選格裡（原版 `54BC` 的七個調用循環之一）。 */
  private get debugSelectionActive(): boolean {
    return RANGE_SELECTION_MODES.has(this.actionMode) && this.selectedId !== undefined;
  }

  /** 除錯畫面底下是哪個狀態：畫面關閉時按它收尾。 */
  private get originalDebugHostBeneath(): OriginalDebugHost {
    if (this.promotionUnitIds.length > 0) return "promotion";
    return this.debugSelectionActive ? "selection" : "idle";
  }

  /** 回傳除錯是否消費了這個按鍵；沒有消費時按鍵照常走一般語義。 */
  runOriginalDebugHotkey(hotkey: OriginalDebugHotkey): boolean {
    const host = this.originalDebugHost;
    // 範圍讀數由宿主鍵盤層追蹤按住與放開（`setDebugRangeReadoutHeld`），選格中同樣有效。
    if (!host || hotkey === "rangeReadout") return false;
    const refusal = originalDebugHotkeyRefusal(hotkey, {
      host,
      inTechniqueTest: this.debugTechniqueCasterId !== undefined,
    });
    if (refusal) {
      this.showOriginalDebugNotice(refusal);
      return true;
    }
    // 預覽只是顯示範圍：先收起，再照待機執行。
    if (this.actionMode === "enemyPreview" || this.actionMode === "allyPreview") this.resetAction();
    switch (hotkey) {
      case "behaviourEditor": this.openDebugBehaviourEditor(); break;
      case "editMenu": this.openDebugMenu({ kind: "edit", index: 0 }, "原版Debug：編輯。"); break;
      case "enemyLifeMenu": this.openDebugMenu({ kind: "life", side: 2, index: 0 }, "原版Debug：設定敵方全體生命。"); break;
      case "allyLifeMenu": this.openDebugMenu({ kind: "life", side: 1, index: 0 }, "原版Debug：設定我方全體生命。"); break;
      case "techniqueAttack": this.openDebugTechniqueMenu("attack"); break;
      case "techniqueSupport": this.openDebugTechniqueMenu("support"); break;
      case "refreshAllies": this.debugRefreshAllies(); break;
      case "experienceUp": this.debugAdjustExperience(50); break;
      case "experienceDown": this.debugAdjustExperience(-50); break;
      case "lifeDown": this.debugReduceLife(); break;
      case "headacheLine": void this.debugHeadacheLine(); break;
      case "cellReadout": this.debugShowCellReadout(); break;
      case "instantVictory": this.debugInstantVictory(); break;
      case "skipToEnding": this.debugSkipToEnding(); break;
      case "musicBox": this.openMusicBox("battle"); break;
    }
    return true;
  }

  /**
   * Caps Lock 開著、按了 F1–F6／F10，但不在熱鍵生效的狀態（開著選單、除錯畫面或授職對白）：
   * 只提示，不落回集體命令。演出與敵方階段不改信息欄。
   */
  noteOriginalDebugHotkeyUnavailable(): void {
    if (this.phase !== "player" || this.busy) return;
    this.showOriginalDebugNotice(
      this.debugDataEditorOpen || this.debugUnitEditor || this.debugBehaviourEditor || this.debugMenu
        ? "原版Debug：先關閉目前的除錯畫面，再按其他除錯熱鍵。"
        : "原版Debug：熱鍵在我方待機、選格與轉職選擇時有效；請先關閉選單。",
    );
  }

  private showOriginalDebugNotice(message: string): void {
    this.statusMessage = message;
    this.originalDebugNotice = message;
    this.emit();
  }

  /**
   * 選了單位時信息欄平常顯示該單位的摘要；上面這則提示要蓋過它，直到信息欄換成別的訊息。
   */
  get originalDebugNoticeShown(): boolean {
    return this.originalDebugNotice !== undefined && this.originalDebugNotice === this.statusMessage;
  }

  /** 關掉所有原版Debug的選單、面板與待放置狀態（系統選單、勝負與重開時一併收起）。 */
  private clearOriginalDebugSurfaces(): void {
    this.debugSuspendedSelection = undefined;
    this.debugClassLoading = undefined;
    this.debugMenu = undefined;
    this.debugBehaviourEditor = undefined;
    this.debugUnitEditor = undefined;
    this.debugPlacement = undefined;
    // 兵種的改動是即時的；被迫收起（勝負、重開、系統選單）時照樣做退出時的生命壓低。
    if (this.debugClassEditor) this.battle.debugClampLifeToMaximum();
    this.debugClassEditor = undefined;
    this.rememberDebugTerrainSlot();
    this.debugTerrainEditor = undefined;
  }

  // ── 原版選單（F2–F6 與技術二級選單共用 `0000:5651`） ──

  get debugMenuItems(): readonly DebugMenuItem[] {
    return this.debugMenu ? debugMenuItems(this.debugMenu, this.debugMenuContext) : [];
  }

  private get debugMenuContext(): DebugMenuContext {
    const preloaded = new Set<BattleActionId>(this.currentMapPresentationActionIds);
    // VIRT 的直線表現在每一關都隨射擊表現備妥，不看本關的技術清單。
    return { techniqueAvailable: (actionId) => isVirtActionId(actionId) || preloaded.has(actionId) };
  }

  private openDebugMenu(menu: DebugMenuState, status: string): void {
    this.minimapPreviewOrigin = undefined;
    this.terrainInspectionPosition = undefined;
    const items = debugMenuItems(menu, this.debugMenuContext);
    const firstEnabled = items.findIndex(({ enabled }) => enabled);
    this.debugMenu = withDebugMenuIndex(menu, Math.max(0, firstEnabled));
    this.statusMessage = status;
    this.emit();
  }

  closeDebugMenu(): void {
    if (!this.debugMenu) return;
    this.debugMenu = undefined;
    this.statusMessage = this.originalDebugReturnMessage;
    this.emit();
  }

  /** 關掉沒有改動任何東西的除錯畫面時的提示：回到底下的狀態。 */
  private get originalDebugReturnMessage(): string {
    const host = this.originalDebugHostBeneath;
    return host === "promotion" ? "已返回轉職選擇。" : host === "selection" ? "已返回選格。" : "已返回戰場。";
  }

  moveDebugMenuSelection(delta: number): void {
    const menu = this.debugMenu;
    if (!menu || delta === 0) return;
    const index = steppedDebugMenuIndex(menu, delta, this.debugMenuContext);
    if (index === menu.index) return;
    this.debugMenu = withDebugMenuIndex(menu, index);
    this.emit();
  }

  selectDebugMenuItem(index: number): void {
    const menu = this.debugMenu;
    const item = this.debugMenuItems[index];
    if (!menu || !item?.enabled || index === menu.index) return;
    this.debugMenu = withDebugMenuIndex(menu, index);
    this.emit();
  }

  activateDebugMenuSelection(): void {
    const menu = this.debugMenu;
    const item = this.debugMenuItems[menu?.index ?? -1];
    if (!menu || !item) return;
    if (!item.enabled) {
      this.statusMessage = "原版Debug：這場戰鬥沒有備妥這項技術的演出。";
      this.emit();
      return;
    }
    switch (menu.kind) {
      case "life": {
        this.debugMenu = undefined;
        const effect = menu.side === 2
          ? NATIVE_DEBUG_SIDE_LIFE_MENUS.enemy.items[menu.index]?.effect
          : NATIVE_DEBUG_SIDE_LIFE_MENUS.ally.items[menu.index]?.effect;
        if (!effect) return;
        const count = this.battle.debugSetSideLife(menu.side, effect);
        const sideName = menu.side === 2 ? "敵方" : "我方";
        const effectText = effect === "full"
          ? "生命全滿"
          : effect === "remove" ? "全部移出戰場" : "生命設為 1";
        this.finishOriginalDebugMutation(`原版Debug：${sideName} ${count} 人${effectText}。`);
        return;
      }
      case "edit":
        if (item.code === "3D") this.openDebugClassEditor();
        else if (item.code === "4D") this.openDebugTerrainEditor();
        else this.openDebugUnitEditor(item.code === "1D" ? 1 : 2);
        return;
      case "technique":
        this.openDebugMenu(
          { kind: "techniqueRank", group: menu.group, category: item.code, casterId: menu.casterId, index: 0 },
          "原版Debug：選擇技術。",
        );
        return;
      case "techniqueRank": {
        const actionId = debugTechniqueActionId(item.code);
        if (actionId) this.beginDebugTechnique(menu.casterId, actionId);
        return;
      }
    }
  }

  // ── F1 行為編輯（`0000:2302`） ──

  get debugBehaviourEditorUnit(): BattleUnit | undefined {
    const editor = this.debugBehaviourEditor;
    return editor ? this.battle.unit(editor.unitId) : undefined;
  }

  /** 游標下單位目前的有效行為值；F1 面板以紅字標出。 */
  get debugBehaviourEditorValue(): number | undefined {
    const unit = this.debugBehaviourEditorUnit;
    if (!unit) return undefined;
    return unit.side === 1 ? this.battle.alliedBehaviorFor(unit.id) : this.battle.enemyBehaviorFor(unit.id);
  }

  private debugLockMessage(unit: BattleUnit, lock: string): string {
    return lock === "special-class"
      ? `原版Debug：${unitDisplayName(unit)}依專屬腳本行動，不能修改。`
      : lock === "split"
        ? `原版Debug：${unitDisplayName(unit)}分身中，合體後才能改職業。`
        : `原版Debug：${unitDisplayName(unit)}依劇情行動，不能修改。`;
  }

  openDebugBehaviourEditor(): void {
    const unit = this.debugCursorUnit();
    if (!unit) return;
    const lock = this.battle.debugAiBehaviorLock(unit.id);
    if (lock) {
      this.statusMessage = this.debugLockMessage(unit, lock);
      this.emit();
      return;
    }
    this.minimapPreviewOrigin = undefined;
    this.terrainInspectionPosition = undefined;
    const current = unit.side === 1 ? this.battle.alliedBehaviorFor(unit.id) : this.battle.enemyBehaviorFor(unit.id);
    const values = DEBUG_AI_BEHAVIOUR_VALUES;
    this.debugBehaviourEditor = {
      unitId: unit.id,
      index: values.includes(current) ? current : values[values.length - 1] ?? 0,
    };
    this.statusMessage = `原版Debug：${unitDisplayName(unit)}的 AI 行為。`;
    this.emit();
  }

  moveDebugBehaviourSelection(delta: number): void {
    const editor = this.debugBehaviourEditor;
    const count = DEBUG_AI_BEHAVIOUR_VALUES.length;
    if (!editor || delta === 0 || count === 0) return;
    this.debugBehaviourEditor = { ...editor, index: (editor.index + Math.sign(delta) + count) % count };
    this.emit();
  }

  selectDebugBehaviourRow(index: number): void {
    const editor = this.debugBehaviourEditor;
    if (!editor || !DEBUG_AI_BEHAVIOUR_VALUES.includes(index) || index === editor.index) return;
    this.debugBehaviourEditor = { ...editor, index };
    this.emit();
  }

  /** 主鍵寫入停留的列（`0000:24AA`）；面板保持開著，次鍵才關閉。 */
  applyDebugBehaviourSelection(): void {
    const editor = this.debugBehaviourEditor;
    const unit = this.debugBehaviourEditorUnit;
    if (!editor || !unit) return;
    if (!this.battle.debugSetAiBehavior(unit.id, editor.index)) return;
    this.debugEditsPending = true;
    const label = NATIVE_DEBUG_BEHAVIOUR_EDITOR.labels[editor.index]?.label ?? String(editor.index);
    this.statusMessage = unit.side === 1
      ? `原版Debug：${unitDisplayName(unit)}的行為改為「${label}」，${editor.index === 0 ? "由玩家指揮" : "交給我方自動行動"}。`
      : `原版Debug：${unitDisplayName(unit)}的行為改為「${label}」。`;
    this.emit();
  }

  closeDebugBehaviourEditor(): void {
    if (!this.debugBehaviourEditor) return;
    this.debugBehaviourEditor = undefined;
    this.finishOriginalDebugControlChange(this.originalDebugReturnMessage);
  }

  // ── F5／F6 技術測試（`0000:6C16 → 75E4`） ──

  private openDebugTechniqueMenu(group: DebugTechniqueGroup): void {
    const unit = this.debugCursorUnit();
    if (!unit) return;
    this.openDebugMenu(
      { kind: "technique", group, casterId: unit.id, index: 0 },
      `原版Debug：${unitDisplayName(unit)}的技術測試。`,
    );
  }

  get debugTechniqueCaster(): BattleUnit | undefined {
    return this.debugTechniqueCasterId ? this.battle.unit(this.debugTechniqueCasterId) : undefined;
  }

  /**
   * 原版選定技術後直接進入一般的玩家技術提交（`0000:75E4`）：原版選格種子、按絕對陣營篩目標、
   * 完整表現與真實結算，施法者得經驗並寫已行動。冰雪與祈禱以施法者為中心，不選格。
   */
  private beginDebugTechnique(casterId: string, actionId: BattleActionId): void {
    const caster = this.battle.unit(casterId);
    this.debugMenu = undefined;
    if (!caster) {
      this.emit();
      return;
    }
    // 選格中按 F5／F6：記住原來的選格，技術測試結束後回到它（原版 `75E4` 返回外層選格循環）。
    if (this.debugSelectionActive && !this.debugTechniqueCasterId) {
      this.debugSuspendedSelection = this.suspendedSelection();
    }
    const definition = BATTLE_ACTION_DEFINITIONS[actionId];
    this.selectedId = caster.id;
    this.selectedActionId = actionId;
    this.debugTechniqueCasterId = caster.id;
    this.cursor = { x: caster.x, y: caster.y };
    if (definition.target === "self-area") {
      this.actionRange = [];
      this.targets = [];
      if (!isIceActionId(actionId)) {
        void this.commitSpecialAction(this.cursor);
        return;
      }
      this.actionMode = "selfAreaConfirm";
      this.statusMessage = `原版Debug：「${definition.label}」以${unitDisplayName(caster)}為中心；確定施展或按右鍵取消。`;
      this.emit();
      return;
    }
    this.actionRange = this.battle.debugTechniqueRange(caster.id, actionId).cells();
    this.targets = this.battle.debugTechniqueTargetCells(caster.id, actionId);
    if (this.targets.length === 0) {
      this.resetAction();
      const message = `原版Debug：「${definition.label}」範圍內沒有合法目標。`;
      if (this.resumeSuspendedSelection(message)) return;
      this.statusMessage = message;
      this.emit();
      return;
    }
    this.actionMode = "specialTarget";
    this.statusMessage = isVirtActionId(actionId)
      ? `原版Debug：選擇「${definition.label}」的目標（任一方，施法者除外）。`
      : `原版Debug：選擇「${definition.label}」的${definition.target === "ally" ? "我方" : "敵方"}目標。`;
    this.emit();
  }

  private suspendedSelection(): SuspendedSelection | undefined {
    const actor = this.selectedUnit;
    if (!actor) return undefined;
    return {
      actionMode: this.actionMode,
      selectedId: actor.id,
      selectedActionId: this.selectedActionId,
      commandIndex: this.commandIndex,
      techniqueIndex: this.techniqueIndex,
      pendingOrigin: this.pendingOrigin && { ...this.pendingOrigin },
      pendingPath: this.pendingPath?.map((step) => ({ ...step })),
      pendingExtraMove: this.pendingExtraMove,
      awaitingMoveConfirmation: this.awaitingMoveConfirmation,
      cursor: { ...this.cursor },
      anchor: { x: actor.x, y: actor.y },
    };
  }

  /**
   * 技術測試結束（施放完畢、取消或沒有目標）：回到被它打斷的選格，再照選格中除錯操作的規則
   * 檢查。沒有被打斷的選格時回傳 `false`。
   */
  private resumeSuspendedSelection(message: string): boolean {
    const suspended = this.debugSuspendedSelection;
    if (!suspended) return false;
    this.debugSuspendedSelection = undefined;
    this.statusMessage = message;
    if (this.resolveOutcome()) {
      this.emit();
      return true;
    }
    this.resetAction();
    this.actionMode = suspended.actionMode;
    this.selectedId = suspended.selectedId;
    this.selectedActionId = suspended.selectedActionId;
    this.commandIndex = suspended.commandIndex;
    this.techniqueIndex = suspended.techniqueIndex;
    this.pendingOrigin = suspended.pendingOrigin && { ...suspended.pendingOrigin };
    this.pendingPath = suspended.pendingPath?.map((step) => ({ ...step }));
    this.pendingExtraMove = suspended.pendingExtraMove;
    this.awaitingMoveConfirmation = suspended.awaitingMoveConfirmation;
    this.cursor = { ...suspended.cursor };
    this.finishOriginalDebugMutation(message, undefined, suspended.anchor);
    return true;
  }

  // ── 我／敵 EDIT（`0000:0ABE`） ──

  private openDebugUnitEditor(side: 1 | 2): void {
    this.debugMenu = undefined;
    this.debugUnitEditor = { side, page: 0, slotIndex: 0 };
    this.statusMessage = side === 1 ? "原版Debug：我方單位編輯。" : "原版Debug：敵方單位編輯。";
    this.emit();
  }

  get debugUnitEditorSlots(): readonly DebugEditorSlot[] {
    const editor = this.debugUnitEditor;
    if (!editor) return [];
    return debugEditorSlots({
      battle: this.battle,
      side: editor.side,
      roster: this.battle.campaignSnapshot().roster,
      save: this.stageRuntime.save,
      nativeStage: this.battle.stage.nativeStage,
      benchSlots: new Set(this.battle.debugBenchSlots),
    });
  }

  get debugUnitEditorFocusSlot(): number | undefined {
    const editor = this.debugUnitEditor;
    return editor ? editor.page * DEBUG_EDITOR_SLOTS_PER_PAGE + editor.slotIndex : undefined;
  }

  /** 方向鍵：上下在同一欄內走、跨欄時接到相鄰欄；左右換欄，越過邊緣就翻頁。 */
  moveDebugUnitEditorFocus(delta: Position): void {
    const editor = this.debugUnitEditor;
    if (!editor) return;
    const { rows, columns } = NATIVE_DEBUG_UNIT_EDITOR.layout.grid;
    let page = editor.page;
    let index = editor.slotIndex;
    if (delta.y !== 0) {
      index = (index + Math.sign(delta.y) + DEBUG_EDITOR_SLOTS_PER_PAGE) % DEBUG_EDITOR_SLOTS_PER_PAGE;
    } else if (delta.x !== 0) {
      const column = Math.floor(index / rows) + Math.sign(delta.x);
      const row = index % rows;
      if (column < 0 || column >= columns) {
        page = (page + Math.sign(delta.x) + DEBUG_EDITOR_PAGES) % DEBUG_EDITOR_PAGES;
        index = (column < 0 ? columns - 1 : 0) * rows + row;
      } else {
        index = column * rows + row;
      }
    } else return;
    this.debugUnitEditor = { ...editor, page, slotIndex: index };
    this.emit();
  }

  focusDebugUnitEditorSlot(slot: number): void {
    const editor = this.debugUnitEditor;
    if (!editor || slot < 0 || slot >= DEBUG_EDITOR_SLOT_COUNT) return;
    const page = Math.floor(slot / DEBUG_EDITOR_SLOTS_PER_PAGE);
    const slotIndex = slot % DEBUG_EDITOR_SLOTS_PER_PAGE;
    if (page === editor.page && slotIndex === editor.slotIndex) return;
    this.debugUnitEditor = { ...editor, page, slotIndex };
    this.emit();
  }

  showDebugUnitEditorPage(page: number): void {
    const editor = this.debugUnitEditor;
    if (!editor || page < 0 || page >= DEBUG_EDITOR_PAGES || page === editor.page) return;
    this.debugUnitEditor = { ...editor, page };
    this.emit();
  }

  /**
   * 名字框（`0000:0C10`）：在場的單位立即移出棋盤、畫面保持；可以放置的不在場單位（本場離場、
   * 部署候選、敵方模板）關閉編輯畫面，下一次點格放上場，圖像在背景先備妥。其餘槽不能放置。
   */
  toggleDebugUnitPresence(slot = this.debugUnitEditorFocusSlot): void {
    const editor = this.debugUnitEditor;
    const entry = slot === undefined ? undefined : this.debugUnitEditorSlots[slot];
    if (!editor || !entry) return;
    if (entry.state === "present") {
      const unit = this.battle.unit(entry.unitId);
      if (unit && this.battle.debugRemoveUnit(entry.unitId)) {
        this.debugEditsPending = true;
        this.statusMessage = `原版Debug：${unitDisplayName(unit)}已移出戰場。`;
      }
    } else if (entry.placeable && this.originalDebugHostBeneath !== "idle") {
      // `[DD]` 原版要到下一次待機點格才放上場；複刻只從待機開始放置，不讓它插進選格或轉職選擇。
      this.statusMessage = "原版Debug：放置單位要在我方待機時進行。";
    } else if (entry.placeable) {
      this.debugUnitEditor = undefined;
      this.debugPlacement = { unitId: entry.unitId };
      this.statusMessage = `原版Debug：點選空格${entry.state === "departed" ? "放回" : "放上"}${entry.name ?? ""}；右鍵取消。`;
      if (entry.classId) void this.ensureDebugClassAssets(editor.side, entry.classId).catch(() => undefined);
    } else if (entry.state === "absent") {
      this.statusMessage = editor.side === 1
        ? `原版Debug：${entry.name ?? ""}不是這一關的出戰候選，不能放置。`
        : `原版Debug：${entry.name ?? ""}依專屬腳本行動，不能從這裡放置。`;
    } else {
      this.statusMessage = "原版Debug：這一槽沒有單位。";
    }
    this.emit();
  }

  /** 這個職業的技術演出這一關有沒有備妥；戰場場景只在進場時建演出，缺的話不能改成它。 */
  private debugClassPresentationsReady(side: 1 | 2, classId: UnitClassId): boolean {
    const preloaded = new Set<BattleActionId>(this.currentMapPresentationActionIds);
    return presentationActionIdsForClass(classId, side).every((actionId) => preloaded.has(actionId));
  }

  /**
   * 這個職業在這一邊還沒備妥、可以當場下載的圖像：棋子、全景戰鬥圖，以及我方通用身分會換上的
   * 肖像。這一邊根本沒有棋子或全景圖時回傳 `undefined`。
   */
  private debugClassMissingAssetUrls(side: 1 | 2, classId: UnitClassId): string[] | undefined {
    const figure = side === 1 ? allyMapUnitAsset(classId) : this.enemyFigureUrl(classId);
    const atlas = FULL_COMBAT_ATLASES.find(({ id }) => id === `${side === 1 ? "left" : "right"}-${classId}`);
    if (!figure || !atlas) return undefined;
    const portrait = side === 1 ? classFallbackPortraitFor(classId, 1) : undefined;
    return [
      ...(stagedRenderAssetAvailable(figure) ? [] : [figure]),
      ...(fullCombatImageAvailable(atlas.image) ? [] : [atlas.image]),
      ...(portrait === undefined
        ? []
        : portraitAssetUrlsForRecords([portrait]).filter((url) => !stagedRenderAssetAvailable(url))),
    ];
  }

  /** 圖像與演出都已備妥，現在就能改成（或放上）這個職業。 */
  debugClassAvailable(side: 1 | 2, classId: UnitClassId): boolean {
    return this.debugClassPresentationsReady(side, classId)
      && this.debugClassMissingAssetUrls(side, classId)?.length === 0;
  }

  /** EDIT 可以改成的職業：演出已備妥，圖像已備妥或能當場下載。 */
  debugClassSelectable(side: 1 | 2, classId: UnitClassId): boolean {
    return this.debugClassPresentationsReady(side, classId)
      && this.debugClassMissingAssetUrls(side, classId) !== undefined;
  }

  /** 補下載職業圖像並補進這一關的租約；已備妥或沒有宿主入口時直接完成。 */
  private async ensureDebugClassAssets(side: 1 | 2, classId: UnitClassId): Promise<void> {
    const missing = this.debugClassMissingAssetUrls(side, classId) ?? [];
    if (missing.length === 0 || !this.originalDebugAssetLoader) return;
    await this.originalDebugAssetLoader(missing);
  }

  enemyFigureUrl(classId: UnitClassId): string {
    if (classId === "soldier") return ASSETS.enemySoldier;
    if (classId === "cavalry") return ASSETS.enemyCavalry;
    return this.stageRuntime.assets?.unitSprites?.[`enemy-${classId}`] ?? enemyMapUnitAsset(classId);
  }

  /** 棋子框：主鍵（−1）／次鍵（+1）。 */
  stepDebugUnitClass(delta: -1 | 1, slot = this.debugUnitEditorFocusSlot): void {
    const editor = this.debugUnitEditor;
    const entry = slot === undefined ? undefined : this.debugUnitEditorSlots[slot];
    if (!editor || !entry || !entry.classId) return;
    const unit = entry.state === "present" ? this.battle.unit(entry.unitId) : undefined;
    if (!unit) {
      this.statusMessage = "原版Debug：只能修改在場單位的職業。";
      this.emit();
      return;
    }
    const lock = this.battle.debugClassEditLock(unit.id);
    if (lock) {
      this.statusMessage = this.debugLockMessage(unit, lock);
      this.emit();
      return;
    }
    const loading = this.debugClassLoading;
    if (loading) {
      this.statusMessage = `原版Debug：正在讀取${className(loading.classId)}的圖像，請稍候。`;
      this.emit();
      return;
    }
    const next = steppedDebugClass(unit.classId, delta, (classId) => this.debugClassSelectable(editor.side, classId));
    if (next === unit.classId) {
      this.statusMessage = "原版Debug：沒有更多可改的職業。";
      this.emit();
      return;
    }
    const missing = this.debugClassMissingAssetUrls(editor.side, next) ?? [];
    const loader = this.originalDebugAssetLoader;
    if (missing.length === 0 || !loader) {
      this.applyDebugUnitClass(unit.id, next);
      return;
    }
    // 這一關沒備妥的職業：當場下載棋子與全景戰鬥圖，載好才改（原版直接改職業陣列）。
    const battle = this.battle;
    this.debugClassLoading = { unitId: unit.id, classId: next };
    this.statusMessage = `原版Debug：正在讀取${className(next)}的圖像……`;
    this.emit();
    void loader(missing).then(() => {
      if (this.debugClassLoading?.unitId !== unit.id || this.battle !== battle) return;
      this.debugClassLoading = undefined;
      if (this.debugUnitEditor) this.applyDebugUnitClass(unit.id, next);
      else this.emit();
    }, () => {
      if (this.debugClassLoading?.unitId !== unit.id) return;
      this.debugClassLoading = undefined;
      this.statusMessage = `原版Debug：${className(next)}的圖像讀取失敗，請檢查網路後再試。`;
      this.emit();
    });
  }

  private applyDebugUnitClass(unitId: string, classId: UnitClassId): void {
    const unit = this.battle.unit(unitId);
    if (unit && this.battle.debugSetUnitClass(unitId, classId)) {
      this.debugEditsPending = true;
      this.statusMessage = `原版Debug：${unitDisplayName(unit)}改為${className(classId)}。`;
    }
    this.emit();
  }

  /** 行為框：主鍵（−1）／次鍵（+1），寫本方自己的行為（`[SR]` 原版兩邊都寫敵方表）。 */
  stepDebugUnitBehaviour(delta: -1 | 1, slot = this.debugUnitEditorFocusSlot): void {
    const editor = this.debugUnitEditor;
    const entry = slot === undefined ? undefined : this.debugUnitEditorSlots[slot];
    if (!editor || !entry) return;
    const unit = entry.state === "present" ? this.battle.unit(entry.unitId) : undefined;
    if (!unit || entry.behaviour === undefined) {
      this.statusMessage = "原版Debug：只能修改在場單位的行為。";
      this.emit();
      return;
    }
    const lock = this.battle.debugAiBehaviorLock(unit.id);
    if (lock) {
      this.statusMessage = this.debugLockMessage(unit, lock);
      this.emit();
      return;
    }
    const next = steppedDebugBehaviour(entry.behaviour, delta);
    if (next !== entry.behaviour && this.battle.debugSetAiBehavior(unit.id, next)) {
      this.debugEditsPending = true;
      const label = NATIVE_DEBUG_BEHAVIOUR_EDITOR.labels[next]?.label ?? String(next);
      this.statusMessage = `原版Debug：${unitDisplayName(unit)}的行為改為「${label}」。`;
    }
    this.emit();
  }

  /** EXIT（`0000:0BE8`）。轉職掃描與勝負判定在關閉時做一次，不在每次點擊之後。 */
  closeDebugUnitEditor(): void {
    if (!this.debugUnitEditor) return;
    this.debugUnitEditor = undefined;
    this.finishOriginalDebugControlChange(this.originalDebugReturnMessage);
  }

  // ── 兵種（`0000:1294`）與地型（`0000:1B3A`）：只在本場戰鬥生效 ──

  private openDebugClassEditor(): void {
    this.debugMenu = undefined;
    this.debugClassEditor = initialDebugClassEditor();
    this.statusMessage = "原版Debug：兵種數值編輯；改動只在本場戰鬥生效。";
    this.emit();
  }

  private openDebugTerrainEditor(): void {
    this.debugMenu = undefined;
    const memory = this.debugTerrainSlotMemory;
    this.debugTerrainEditor = initialDebugTerrainEditor(memory?.battle === this.battle ? memory.slot : undefined);
    this.statusMessage = "原版Debug：地型數值編輯；改動只在本場戰鬥生效。";
    this.emit();
  }

  private rememberDebugTerrainSlot(): void {
    if (this.debugTerrainEditor) {
      this.debugTerrainSlotMemory = { battle: this.battle, slot: this.debugTerrainEditor.terrainSlot };
    }
  }

  get debugDataEditorOpen(): boolean {
    return this.debugClassEditor !== undefined || this.debugTerrainEditor !== undefined;
  }

  private applyDebugClassEditor(result: DebugDataEditorResult<DebugClassEditorState>): void {
    const changed = result.message !== undefined || result.state !== this.debugClassEditor;
    this.debugClassEditor = result.state;
    if (result.message) this.statusMessage = result.message;
    if (changed) this.emit();
  }

  private applyDebugTerrainEditor(result: DebugDataEditorResult<DebugTerrainEditorState>): void {
    const changed = result.message !== undefined || result.state !== this.debugTerrainEditor;
    this.debugTerrainEditor = result.state;
    if (result.message) this.statusMessage = result.message;
    if (changed) this.emit();
  }

  /** 指標移動（原生 640×350 座標）：紅框、藍底行與標記跟著指標。 */
  hoverDebugDataEditor(position: Position): void {
    const classEditor = this.debugClassEditor;
    const terrainEditor = this.debugTerrainEditor;
    if (classEditor) {
      const state = hoveredDebugClassEditor(classEditor, debugClassEditorHitAt(position));
      if (state !== classEditor) this.applyDebugClassEditor({ state });
    } else if (terrainEditor) {
      const state = hoveredDebugTerrainEditor(terrainEditor, debugTerrainEditorHitAt(position));
      if (state !== terrainEditor) this.applyDebugTerrainEditor({ state });
    }
  }

  /** 指標按鍵：主鍵 +1、次鍵 −1（原版 `1A6F/1A92`、`21EE/2211`）。 */
  pressDebugDataEditor(position: Position, delta: 1 | -1): void {
    if (this.debugClassEditor) {
      this.applyDebugClassEditor(pressedDebugClassEditor(this.battle, this.debugClassEditor, position, delta));
    } else if (this.debugTerrainEditor) {
      this.applyDebugTerrainEditor(pressedDebugTerrainEditor(this.battle, this.debugTerrainEditor, position, delta));
    }
  }

  /** 鍵盤補充（原版只能用指標）：＋／－ 改游標那一位。 */
  stepDebugDataEditor(delta: 1 | -1): void {
    if (this.debugClassEditor) {
      this.applyDebugClassEditor(steppedDebugClassEditor(this.battle, this.debugClassEditor, delta));
    } else if (this.debugTerrainEditor) {
      this.applyDebugTerrainEditor(steppedDebugTerrainEditor(this.battle, this.debugTerrainEditor, delta));
    }
  }

  moveDebugDataEditor(delta: Position): void {
    if (this.debugClassEditor) {
      this.applyDebugClassEditor({ state: movedDebugClassEditor(this.debugClassEditor, delta) });
    } else if (this.debugTerrainEditor) {
      this.applyDebugTerrainEditor({ state: movedDebugTerrainEditor(this.debugTerrainEditor, delta) });
    }
  }

  toggleDebugDataEditorFocus(): void {
    if (this.debugClassEditor) {
      this.applyDebugClassEditor({ state: toggledDebugClassEditorFocus(this.debugClassEditor) });
    } else if (this.debugTerrainEditor) {
      this.applyDebugTerrainEditor({ state: toggledDebugTerrainEditorFocus(this.debugTerrainEditor) });
    }
  }

  activateDebugDataEditor(): void {
    if (this.debugClassEditor) this.applyDebugClassEditor(activatedDebugClassEditor(this.debugClassEditor));
    else if (this.debugTerrainEditor) this.applyDebugTerrainEditor(activatedDebugTerrainEditor(this.debugTerrainEditor));
  }

  /**
   * 原版只能按 Esc 退出。兵種退出時雙方生命高於新上限的壓到上限（`53ED/53FD`），之後照原版
   * 待機迴圈做一次轉職掃描與勝負判定（門檻或屬性改了，轉職資格可能跟著變）。
   */
  closeDebugDataEditor(): void {
    if (this.debugClassEditor) {
      this.debugClassEditor = undefined;
      const clamped = this.battle.debugClampLifeToMaximum();
      this.finishOriginalDebugMutation(clamped > 0
        ? `原版Debug：兵種編輯結束，${clamped} 人生命壓到新上限。`
        : "原版Debug：兵種編輯結束。");
    } else if (this.debugTerrainEditor) {
      this.rememberDebugTerrainSlot();
      this.debugTerrainEditor = undefined;
      this.finishOriginalDebugMutation("原版Debug：地型編輯結束。");
    }
  }

  /** EDIT 要放上場的敵方模板（沒有本場離場記錄時）。 */
  private debugPlacementTemplate(unitId: string): BattleUnit | undefined {
    if (!unitId.startsWith("2:") || this.battle.debugDepartedUnit(unitId)) return undefined;
    const definition = debugTemplateEnemyDefinition(
      this.stageRuntime.save,
      this.battle.stage.nativeStage,
      Number(unitId.slice(2)),
    );
    return definition ? this.battle.debugTemplateEnemy(definition) : undefined;
  }

  /** 放上一個不在場的單位：只放在空著、這個職業能站的格上；圖像沒備妥時先下載。 */
  placeDebugUnit(position: Position): void {
    const placement = this.debugPlacement;
    if (!placement) return;
    const template = this.debugPlacementTemplate(placement.unitId);
    const departed = this.battle.debugDepartedUnit(placement.unitId);
    const record = this.battle.debugPlacementRecord(placement.unitId) ?? template;
    if (!record) {
      this.debugPlacement = undefined;
      this.statusMessage = "原版Debug：這個單位已經不能放上場。";
      this.emit();
      return;
    }
    if (!this.debugClassAvailable(record.side, record.classId)) {
      if (!this.debugClassSelectable(record.side, record.classId)) {
        this.debugPlacement = undefined;
        this.statusMessage = `原版Debug：這場戰鬥缺少${record.className}的技術演出，不能放上場。`;
        this.emit();
        return;
      }
      this.statusMessage = `原版Debug：正在讀取${record.className}的圖像，請稍候再點。`;
      this.emit();
      void this.ensureDebugClassAssets(record.side, record.classId).then(() => {
        if (this.debugPlacement?.unitId !== placement.unitId) return;
        this.statusMessage = `原版Debug：圖像已備妥，點選空格放上${unitDisplayName(record)}；右鍵取消。`;
        this.emit();
      }, () => {
        this.statusMessage = `原版Debug：${record.className}的圖像讀取失敗，請檢查網路後再試。`;
        this.emit();
      });
      return;
    }
    if (!this.battle.debugPlaceUnit(placement.unitId, position, template)) {
      this.statusMessage = "原版Debug：這一格不能放置；請選空著、可以站立的格，或按右鍵取消。";
      this.emit();
      return;
    }
    this.debugPlacement = undefined;
    this.debugEditsPending = true;
    this.finishOriginalDebugControlChange(
      `原版Debug：${unitDisplayName(record)}${departed ? "已放回戰場" : "已放上戰場"}。`,
    );
  }

  cancelDebugPlacement(): void {
    if (!this.debugPlacement) return;
    this.debugPlacement = undefined;
    this.finishOriginalDebugControlChange("原版Debug：已取消放置。");
  }

  /**
   * 指揮權或棋盤改變之後：跑一次轉職掃描與勝負判定；若我方已沒有能指揮的未行動單位，照常
   * 交給自動階段。
   */
  private finishOriginalDebugControlChange(message: string): void {
    const changed = this.debugEditsPending;
    this.debugEditsPending = false;
    this.finishOriginalDebugMutation(message, () => {
      if (changed && this.phase === "player" && !this.busy && this.battle.playerManualPhaseComplete()) {
        void this.runTurnPhases("autonomous");
      }
    });
  }

  private debugCursorUnit(): BattleUnit | undefined {
    const unit = this.battle.unitAt(this.cursor);
    if (!unit) {
      this.statusMessage = "原版Debug：游標下沒有單位。";
      this.emit();
    }
    return unit;
  }

  /** U／D（`0000:32DA/32FD`）。原版待機循環每輪都做轉職掃描，所以經驗跨過門檻就會轉職。 */
  debugAdjustExperience(delta: 50 | -50): void {
    const unit = this.debugCursorUnit();
    if (!unit) return;
    if (!this.battle.debugAdjustExperience(unit.id, delta)) {
      this.statusMessage = `原版Debug：${unitDisplayName(unit)}的經驗不能再減少。`;
      this.emit();
      return;
    }
    this.battle.focusId = unit.id;
    this.finishOriginalDebugMutation(
      `原版Debug：${unitDisplayName(unit)}經驗 ${delta > 0 ? "＋50" : "−50"}，現為 ${unit.experience}。`,
    );
  }

  /** 數字鍵盤 `-`（`0000:551A`）；`[SR]` 生命不超過 10 時不扣，不留下 0 生命的在場單位。 */
  debugReduceLife(): void {
    const unit = this.debugCursorUnit();
    if (!unit) return;
    if (!this.battle.debugReduceLife(unit.id)) {
      this.statusMessage = `原版Debug：${unitDisplayName(unit)}的生命不超過 10，不再減少。`;
      this.emit();
      return;
    }
    this.battle.focusId = unit.id;
    this.finishOriginalDebugMutation(`原版Debug：${unitDisplayName(unit)}生命 −10，現為 ${unit.life}。`);
  }

  /** F10（`1000:147E`）：只清我方已行動狀態，不解除冰封。 */
  debugRefreshAllies(): void {
    this.battle.clearActionState(1);
    this.statusMessage = "原版Debug：我方全員可再次行動。";
    this.emit();
  }

  /** S（`0000:3232`）：以游標下單位的肖像強制說台詞 `22h`；這一句不擲 `0000:CAC3` 的硬幣。 */
  private async debugHeadacheLine(): Promise<void> {
    const unit = this.debugCursorUnit();
    if (!unit) return;
    this.busy = true;
    try {
      await this.presentContextualLine(unit, "headache", "原版Debug：台詞預覽。");
    }
    finally {
      this.busy = false;
      this.emit();
    }
  }

  /** 2（`0000:324A`）：原版格號是 `y × 50 + x`，與各關地圖實際寬度無關；第二欄是難度值。 */
  debugShowCellReadout(): void {
    this.debugCellReadout = {
      cell: this.cursor.y * 50 + this.cursor.x,
      difficulty: this.difficulty,
      cursor: { ...this.cursor },
      cameraOrigin: { ...this.cameraOrigin },
    };
    this.statusMessage = "原版Debug：左上為游標格號與難度值。";
    this.emit();
  }

  /** 讀數只活到游標或鏡頭下一次移動，與原版被下一次視口重畫蓋掉一致。 */
  get visibleDebugCellReadout(): { cell: number; difficulty: number } | undefined {
    const readout = this.debugCellReadout;
    if (!readout || !this.originalDebugActive) return undefined;
    if (readout.cursor.x !== this.cursor.x || readout.cursor.y !== this.cursor.y
      || readout.cameraOrigin.x !== this.cameraOrigin.x || readout.cameraOrigin.y !== this.cameraOrigin.y) {
      return undefined;
    }
    return { cell: readout.cell, difficulty: readout.difficulty };
  }

  /**
   * Caps Lock+1（`0000:8448`）：按住期間，視口每格疊上原版範圍圖 DS:`01A9` 的值。原版在每次
   * 視口重畫時檢查兩鍵都按住，所以選格當中也有效；複刻同樣不限待機，但只在我方階段顯示——
   * 敵方階段與演出時的範圍圖複刻沒有對應物。
   */
  setDebugRangeReadoutHeld(held: boolean): void {
    if (this.debugRangeReadoutHeld === held) return;
    this.debugRangeReadoutHeld = held;
    this.emit();
  }

  get visibleDebugRangeReadout(): {
    origin: Position;
    columns: number;
    rows: number;
    values: readonly number[];
  } | undefined {
    if (!this.debugRangeReadoutHeld || !this.originalDebugActive || this.phase !== "player") return undefined;
    const { width: columns, height: rows } = this.battle.stage.viewport;
    const origin = { ...this.cameraOrigin };
    const map = this.debugRangeMap();
    const values: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        // 待機與選單時原版範圍圖整張是 1（`1000:3A7C`），沒有選格就照這個中性狀態顯示。
        values.push(map ? map.valueAt({ x: origin.x + column, y: origin.y + row }) : 1);
      }
    }
    return { origin, columns, rows, values };
  }

  /** 當前選格步驟的範圍圖；沒有選格時回傳 `undefined`，即原版的全 1 中性狀態。 */
  private debugRangeMap(): NumericRangeMap | undefined {
    const unit = this.debugTechniqueCaster ?? this.selectedUnit;
    if (!unit) return undefined;
    switch (this.actionMode) {
      case "move":
        return this.battle.movementRangeValues(
          unit.id,
          this.pendingExtraMove || this.commandMenuKind === "extraMove",
        );
      case "target": {
        // `3EF7/3F04`：先清成 0，再在每個可攻擊的鄰格寫 1。
        const map = new NumericRangeMap(this.battle.stage.width, this.battle.stage.height);
        for (const target of this.targets) map.set(target, 1);
        return map;
      }
      case "specialTarget":
      case "shotRoute":
        return this.selectedActionId ? this.battle.actionRange(unit.id, this.selectedActionId) : undefined;
      default:
        return undefined;
    }
  }

  /** Caps Lock+J（`0000:4A6E`）：不看任何目標條件，直接走本關正常勝利流程。 */
  debugInstantVictory(): void {
    this.battle.debugForceVictory();
    this.statusMessage = "原版Debug：即時勝利。";
    this.resolveOutcome();
    this.emit();
  }

  /**
   * Caps Lock+數字鍵盤 `*`（`0000:4AA6`）：原版以下一模組 33 直接離開戰鬥，不經
   * `1000:05E5` 把本場結果寫回戰役，所以戰績卡讀的是本關進場時的名冊與戰績；模組 25 的
   * 劇情 70 也一併跳過，直接從戰績卡開始。
   */
  debugSkipToEnding(): void {
    const campaign = cloneCampaignState(this.stageEntrySnapshot);
    const ending = new Stage49EndingSession(
      { ...campaign, roster: completeCampaignRoster(campaign.roster) },
      this.campaignSaveCount,
    );
    ending.startAtRoster();
    this.stage49Ending = ending;
    this.resetAction();
    this.campaignRoute = "stage-49";
    this.phase = "ending";
    this.statusMessage = "原版Debug：直達主線結局。";
    this.emit();
  }

  /**
   * 一次除錯操作之後的收尾，依操作底下的狀態而定：
   * - 待機：照原版待機循環做一次轉職掃描與勝負判定；
   * - 選格：勝負照常立即判定，轉職掃描留到行動結束或退回待機，選格按目前狀態繼續；
   * - 轉職選擇：重整轉職佇列，勝負留給暫停中的流程在轉職全部結束後判定。
   *
   * `anchor` 是技術測試打斷選格時行動者的位置。
   */
  private finishOriginalDebugMutation(message: string, afterOngoing?: () => void, anchor?: Position): void {
    this.statusMessage = message;
    if (this.promotionUnitIds.length > 0) {
      this.refreshPromotionsAfterDebug();
      return;
    }
    if (this.debugSelectionActive) {
      if (this.resolveOutcome()) {
        this.emit();
        return;
      }
      this.debugPromotionScanDeferred = true;
      const resumed = this.resumeSelectionAfterDebug(anchor);
      if (resumed === "finished") return;
      if (resumed === "continue") {
        this.emit();
        return;
      }
    }
    const settle = (): void => {
      const ended = this.resolveOutcome();
      this.emit();
      if (!ended) afterOngoing?.();
    };
    const promotionPause = this.pauseForPromotions();
    if (promotionPause) {
      void promotionPause.then(settle);
      return;
    }
    settle();
  }

  /**
   * `[SR]` 選格中做了除錯操作之後。原版回到同一個選格循環、沿用進入時的範圍圖與行動者格
   * （`54BC` 的七個調用點）；複刻按目前的狀態重算範圍與目標，行動做不成了才退出：
   * - 行動者離場：取消，回到待機；
   * - 不能再由玩家指揮（改成自動行為、被冰封、已行動）或被推離原格：取消；已經移動的話保留
   *   落點、照「結束」收尾；
   * - 職業不再有這項行動，或範圍內沒有合法目標：回到行動選單。
   * 技術測試自己的選格不看指揮權，施法者離場或沒有目標就結束技術測試。
   */
  private resumeSelectionAfterDebug(anchor?: Position): "continue" | "idle" | "finished" {
    const actor = this.selectedUnit;
    const debugCast = this.debugTechniqueCasterId !== undefined;
    if (!actor) {
      this.resetAction();
      this.statusMessage += debugCast ? "施法者已不在戰場，技術測試結束。" : "行動的單位已不在戰場，這次行動取消。";
      return "idle";
    }
    if (debugCast) {
      if (this.reloadSelectionRange(actor)) return "continue";
      this.resetAction();
      this.statusMessage += "範圍內已沒有合法目標，技術測試結束。";
      return "idle";
    }
    const commandable = this.battle.isPlayerControllableAlly(actor.id) && !actor.acted && !actor.actionDisabled;
    const displaced = anchor !== undefined && (anchor.x !== actor.x || anchor.y !== actor.y);
    if (!commandable || displaced) {
      const reason = displaced ? "被推離原位" : "不能再由玩家指揮";
      if (this.pendingPath || this.pendingExtraMove) {
        if (!this.pendingExtraMove) this.battle.wait(actor.id);
        this.finishUnitAction(
          `${this.statusMessage}${unitDisplayName(actor)}${reason}，停在目前位置結束行動。`,
          true,
        );
        return "finished";
      }
      this.resetAction();
      this.statusMessage += `${unitDisplayName(actor)}${reason}，這次行動取消。`;
      return "idle";
    }
    if (this.reloadSelectionRange(actor)) return "continue";
    this.actionMode = "actionMenu";
    this.commandIndex = 0;
    this.reachable = [];
    this.moveRangeDisplay = [];
    this.targets = [];
    this.actionRange = [];
    this.selectedActionId = undefined;
    this.statusMessage += "這項行動已沒有合法目標，回到行動選單。";
    return "continue";
  }

  /** 按目前狀態重算選格的範圍與目標；行動已不可用或沒有合法目標時回傳 `false`。 */
  private reloadSelectionRange(actor: BattleUnit): boolean {
    switch (this.actionMode) {
      case "move":
        this.loadMoveRange(actor.id, this.pendingExtraMove);
        return this.reachable.length > 0;
      case "target":
        this.targets = this.attackTargetCells(actor);
        return this.targets.length > 0;
      case "specialTarget": {
        const actionId = this.selectedActionId;
        if (!actionId) return false;
        const debugCast = this.debugTechniqueCasterId === actor.id;
        if (!debugCast) {
          const available = isShootingActionId(actionId)
            ? shootingActionIdFor(actor.classId, actor.side) === actionId
            : actor.statuses.techniqueSeal === 0 && techniqueActionIdsFor(actor).includes(actionId);
          if (!available) return false;
        }
        this.actionRange = debugCast
          ? this.battle.debugTechniqueRange(actor.id, actionId).cells()
          : this.battle.actionRange(actor.id, actionId).cells();
        this.targets = debugCast
          ? this.battle.debugTechniqueTargetCells(actor.id, actionId)
          : this.battle.actionTargetCells(actor.id, actionId);
        return this.targets.length > 0;
      }
      default:
        return true;
    }
  }

  /**
   * 轉職選擇中做了除錯操作（原版 `0744` 循環照樣等選擇）：重整佇列。正在選的單位被移出時換下一位、
   * 重新開始授職對白；佇列空了就讓暫停中的流程繼續，勝負由那個流程判定，與一般行動結束的順序相同。
   */
  private refreshPromotionsAfterDebug(): void {
    const head = this.promotionUnitIds[0];
    this.promotionUnitIds = refreshedPromotionQueue(this.promotionUnitIds, this.battle.promotionQueue());
    const next = this.promotionUnit;
    if (!next) {
      this.promotionUnitIds = [];
      this.promotionDialogueIndex = undefined;
      this.promotionSelectionIndex = 0;
      const resume = this.promotionResume;
      this.promotionResume = undefined;
      this.emit();
      resume?.();
      return;
    }
    if (next.id !== head) {
      this.promotionDialogueIndex = 0;
      this.promotionSelectionIndex = 0;
      this.battle.focusId = next.id;
      this.cursor = { x: next.x, y: next.y };
      this.centerCamera(next);
      this.statusMessage += `${unitDisplayName(next)}達到轉職條件；必須選擇下一職業。`;
    } else {
      this.promotionSelectionIndex = Math.min(this.promotionSelectionIndex, Math.max(0, this.promotionTargets.length - 1));
    }
    this.emit();
  }

  get musicBoxTracks(): typeof MUSIC_BOX_TRACKS {
    return MUSIC_BOX_TRACKS;
  }

  /** 「音樂開關」面板常駐的入口，或除錯模式下的 Caps Lock+M。 */
  openMusicBox(from: "battle" | "musicSettings"): void {
    if (from === "musicSettings" ? !this.musicSettingsOpen : this.originalDebugHost === undefined) return;
    this.musicSettingsOpen = false;
    this.musicSettingsReturn = undefined;
    this.minimapPreviewOrigin = undefined;
    this.terrainInspectionPosition = undefined;
    this.musicBoxOpen = true;
    this.musicBoxReturn = from;
    this.emit();
  }

  closeMusicBox(): void {
    if (!this.musicBoxOpen) return;
    this.musicBoxOpen = false;
    if (this.musicBoxReturn === "musicSettings") {
      this.musicSettingsOpen = true;
      this.musicSettingsReturn = "battle";
    }
    this.musicBoxReturn = undefined;
    this.emit();
  }

  moveMusicBoxSelection(delta: number): void {
    const count = MUSIC_BOX_TRACKS.length;
    if (!this.musicBoxOpen || delta === 0 || count === 0) return;
    this.musicBoxIndex = (this.musicBoxIndex + Math.sign(delta) + count) % count;
    this.emit();
  }

  selectMusicBoxTrack(index: number): void {
    if (!this.musicBoxOpen || index < 0 || index >= MUSIC_BOX_TRACKS.length || index === this.musicBoxIndex) return;
    this.musicBoxIndex = index;
    this.emit();
  }

  playMusicBoxSelection(): void {
    const track = MUSIC_BOX_TRACKS[this.musicBoxIndex];
    if (!this.musicBoxOpen || !track) return;
    this.musicBoxSequence += 1;
    this.musicBoxPlayback = {
      trackId: track.id,
      program: musicBoxProgram(track),
      sequence: this.musicBoxSequence,
    };
    this.emit();
  }

  /** 交回遊戲自己的選曲。 */
  restoreGameMusic(): void {
    if (!this.musicBoxPlayback) return;
    this.musicBoxPlayback = undefined;
    this.emit();
  }

  /**
   * 原版Debug的畫面或台詞疊在轉職選擇上：轉職選單要退到它們下面（原版先畫除錯畫面，返回
   * `0744` 循環才重畫轉職選擇）。
   */
  get originalDebugAbovePromotion(): boolean {
    return this.promotionChoiceVisible && (this.originalDebugSurfaceOpen || this.contextualLineDialogueActive);
  }

  /** 轉職選擇上可以疊開原版Debug畫面；按鍵先給它們（見 `originalDebugHost`）。 */
  private get originalDebugSurfaceOpen(): boolean {
    return this.musicBoxOpen
      || this.debugMenu !== undefined
      || this.debugBehaviourEditor !== undefined
      || this.debugUnitEditor !== undefined
      || this.debugDataEditorOpen;
  }

  private closeOriginalDebugSurface(): boolean {
    if (this.musicBoxOpen) this.closeMusicBox();
    else if (this.debugMenu) this.closeDebugMenu();
    else if (this.debugBehaviourEditor) this.closeDebugBehaviourEditor();
    else if (this.debugUnitEditor) this.closeDebugUnitEditor();
    else if (this.debugDataEditorOpen) this.closeDebugDataEditor();
    else return false;
    return true;
  }

  private moveOriginalDebugSurface(delta: Position): boolean {
    if (this.musicBoxOpen) {
      if (delta.y !== 0) this.moveMusicBoxSelection(delta.y);
    } else if (this.debugMenu) {
      if (delta.y !== 0) this.moveDebugMenuSelection(delta.y);
    } else if (this.debugBehaviourEditor) {
      if (delta.y !== 0) this.moveDebugBehaviourSelection(delta.y);
    } else if (this.debugUnitEditor) {
      this.moveDebugUnitEditorFocus(delta);
    } else if (this.debugDataEditorOpen) {
      this.moveDebugDataEditor(delta);
    } else return false;
    return true;
  }

  private activateOriginalDebugSurface(): void {
    if (this.musicBoxOpen) this.playMusicBoxSelection();
    else if (this.debugMenu) this.activateDebugMenuSelection();
    else if (this.debugBehaviourEditor) this.applyDebugBehaviourSelection();
    else if (this.debugUnitEditor) this.toggleDebugUnitPresence();
    else if (this.debugDataEditorOpen) this.activateDebugDataEditor();
  }

  systemAction(): void {
    if (this.promotionUnitIds.length > 0) {
      this.closeOriginalDebugSurface();
      return;
    }
    if (this.groupCommandDialogueActive) return;
    if (this.dialogueSkipConfirmOpen) this.cancelDialogueSkip();
    else if (this.closeOriginalDebugSurface()) return;
    else if (this.debugPlacement) this.cancelDebugPlacement();
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
    if (this.promotionUnitIds.length > 0) {
      this.closeOriginalDebugSurface();
      return true;
    }
    if (this.groupCommandDialogueActive) return true;
    if (this.phase === "saveSlots") this.cancelPostSaveSlots();
    else if (this.closeOriginalDebugSurface()) return true;
    else if (this.debugPlacement) this.cancelDebugPlacement();
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

  setSoundEffectVolume(volume: number): void {
    if (!isSoundEffectVolume(volume) || volume === this.soundEffectVolume) return;
    this.soundEffectVolume = volume;
    this.persistSoundPreferences();
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
      this.musicBoxOpen = false;
      this.clearOriginalDebugSurfaces();
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
    // A native retry leaves module 29 for module 27 and comes back fresh.
    this.fullCombatBackdropPhases = FULL_COMBAT_BACKDROP_INITIAL_PHASES;
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
    this.musicBoxOpen = false;
    this.clearOriginalDebugSurfaces();
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
    this.recordSaveNotice = "";
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

  /**
   * 两条存档路径共用的写入口。记录先经 `writeSaveSlot` 按读取路径校验：存档 schema
   * 拒绝的记录不写入——槽位保留原有记录、儲存次數不累计，记录面板由调用方保持开启并
   * 显示提示，控制台留下关卡、回合与被拒的整份记录供回报。否则玩家会看到「已儲存」，
   * 读取时却只剩「此處沒有記錄」，原本那份记录也已被覆盖。
   */
  private commitSaveRecord(slot: number, save: SaveData): boolean {
    if (writeSaveSlot(localStorage, slot, save).kind === "written") {
      this.campaignSaveCount = save.saveCount;
      this.recordSaveNotice = "";
      return true;
    }
    console.error(
      `記錄 ${slot} 未儲存：${this.battle.stage.id} 第 ${this.battle.round} 回合的${
        save.kind === "battle" ? "戰中" : "戰後"}記錄未通過讀取校驗。`,
      save,
    );
    this.recordSaveNotice = `記錄 ${slot} 未儲存：資料校驗失敗，原有記錄保持不變。`;
    this.statusMessage = this.recordSaveNotice;
    return false;
  }

  private writeCompletedSave(slot: number): void {
    const campaign = this.battle.campaignSnapshot();
    const runtime = this.stageRuntime;
    const save: SaveData = {
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "completed",
      savedAt: new Date().toISOString(),
      saveCount: this.campaignSaveCount + 1,
      stageId: runtime.nextStageId,
      stageLabel: runtime.completion.destinationLabel,
      ruleset: campaign.ruleset,
      difficulty: campaign.difficulty,
      rngState: campaign.rngState,
      rngCalls: campaign.rngCalls,
      roster: campaign.roster,
      recordCounters: [...(campaign.recordCounters ?? Array<number>(75).fill(0))],
      stageProgress: runtime.completion.destinationProgress,
      consumedEventIds: runtime.completion.consumedEvents === "all"
        ? this.battle.stage.events.map(({ id }) => id)
        : [],
    };
    this.pendingSaveSlot = undefined;
    // 写不进去就留在存档面板上：离开面板会直接进入下一关的关前剧情，提示也就没人看见。
    // 玩家照常以取消键离开，等同在「是否要記錄下來」选了取消。
    if (this.commitSaveRecord(slot, save)) this.completeVictoryFlow();
    else this.emit();
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
    this.recordSaveNotice = "";
    this.statusMessage = mode === "save" ? "選擇儲存記錄位置。" : "選擇要讀取的戰役記錄。";
    this.emit();
  }

  closeRecordMenu(): void {
    if (!this.recordMenuMode) return;
    const returnToSystem = this.recordMenuReturn === "system";
    this.recordMenuMode = undefined;
    this.recordMenuReturn = undefined;
    this.recordMenuIndex = 0;
    this.recordSaveNotice = "";
    this.systemMenuOpen = returnToSystem;
    this.emit();
  }

  /**
   * 备份工具的回报与写入失败提示共用面板标题列，谁后到显示谁。UI 已经直接改写了
   * 那一栏，这里只撤下旧提示，免得下一次重绘又把它盖回去，所以不发出变更。
   */
  dismissRecordSaveNotice(): void {
    this.recordSaveNotice = "";
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
    const save = this.createBattleSaveData();
    // 成功时面板收起；失败时面板不收，操作结果本身就和成功不同，玩家也能当场看到
    // 该槽仍是原有记录。
    if (this.commitSaveRecord(slot, save)) {
      this.recordMenuMode = undefined;
      this.recordMenuReturn = undefined;
      this.recordMenuIndex = 0;
      this.statusMessage = `已儲存至記錄 ${slot}。`;
    }
    this.emit();
  }

  /**
   * 兵種／地型覆寫不進存檔（`REMAKE-174`）。記錄按原版數值成立：覆寫抬高生命上限後補過血
   * 的單位，寫出時壓回原版上限，讀回就是還原數值之後的同一個戰局。沒有覆寫時原樣寫出。
   */
  private savedBattleState(): {
    readonly campaign: CampaignState;
    readonly snapshot: ReturnType<Stage0Battle["serializableSnapshot"]>;
  } {
    const campaign = this.battle.campaignSnapshot();
    const snapshot = this.battle.serializableSnapshot();
    if (!this.battle.debugDataEdits) return { campaign, snapshot };
    const stageId = this.battle.stage.id;
    const units = withNativeBattleData(() => snapshot.units.map((unit) => ({
      ...unit,
      life: Math.min(unit.life, savedBattleUnitMaximumLife(unit, stageId, campaign.difficulty)),
    })));
    // 在場我方的名冊條目由棋盤現值推出，存檔校驗逐一比對生命，所以跟著一起壓回。
    const lowered = new Map(snapshot.units.flatMap((unit, index) => {
      const life = units[index]?.life ?? unit.life;
      return unit.side === 1 && life < unit.life ? [[unit.slot, { from: unit.life, to: life }] as const] : [];
    }));
    const roster = campaign.roster.map((entry) => {
      const change = lowered.get(entry.slot);
      return change && entry.life === change.from ? { ...entry, life: change.to } : entry;
    });
    return { campaign: { ...campaign, roster }, snapshot: { ...snapshot, units } };
  }

  /** 我方階段的戰中記錄內容；寫入槽位與存檔校驗測試共用。 */
  createBattleSaveData(): BattleSaveData {
    const { campaign, snapshot } = this.savedBattleState();
    return {
      format: "ANGEL2-web-save",
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      kind: "battle",
      savedAt: new Date().toISOString(),
      saveCount: this.campaignSaveCount + 1,
      stageId: this.battle.stage.id,
      stageLabel: this.stageRuntime.label,
      ruleset: campaign.ruleset,
      difficulty: campaign.difficulty,
      rngState: campaign.rngState,
      rngCalls: campaign.rngCalls,
      roster: campaign.roster,
      recordCounters: [...(campaign.recordCounters ?? Array<number>(75).fill(0))],
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
    this.campaignSaveCount = save.saveCount;
    this.stage49Ending = undefined;
    this.credits = undefined;
    if (save.kind === "completed") {
      this.recordMenuMode = undefined;
      this.recordMenuReturn = undefined;
      if (!isPlayableStageId(save.stageId)) {
        const source = stageRuntimeSourceForDestination(save.stageId);
        if (source) {
          const campaign = {
            stageId: source.id,
            ruleset: save.ruleset,
            difficulty: save.difficulty,
            roster: save.roster,
            recordCounters: save.recordCounters,
            rngState: save.rngState,
            rngCalls: save.rngCalls,
          } as const;
          const runtime = await this.loadRuntime(source.id, campaign);
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
        if (save.stageId === "stage-39") {
          this.phase = "credits";
          this.credits = new CreditsSession();
        } else {
          this.phase = "nextStage";
        }
      } else {
        await this.enterStage(save.stageId, {
          stageId: save.stageId,
          ruleset: save.ruleset,
          difficulty: save.difficulty,
          roster: save.roster,
          recordCounters: save.recordCounters,
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
      recordCounters: save.recordCounters,
      rngState: save.rngState,
      rngCalls: save.rngCalls,
    };
    const runtime = await this.loadRuntime(save.stageId, campaign, save.battle.units);
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
    this.musicBoxOpen = false;
    this.clearOriginalDebugSurfaces();
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
    this.enemyPhaseTailPresentation = undefined;
    this.enemyPhaseTailPresentationTrace = [];
    this.restPresentation = undefined;
    this.restPresentationTrace = [];
    this.aiTechniqueDialogue = undefined;
    this.contextualLineDialogue = undefined;
    this.busy = false;
    this.resetAction();
    this.statusMessage = message;
    this.scheduleFrozenPlayerPhaseSkip();
  }

  beginStage49Ending(): void {
    if (this.phase !== "nextStage" || this.campaignRoute !== "stage-49") return;
    this.stage49Ending = new Stage49EndingSession(
      this.battle.campaignSnapshot(),
      this.campaignSaveCount,
    );
    this.phase = "ending";
    this.statusMessage = "主線結局：戰後道別。";
    this.emit();
  }

  advanceCredits(): void {
    if (this.phase !== "credits" || !this.credits) return;
    this.credits.advance();
    this.statusMessage = this.credits.section === "the-end"
      ? "The End"
      : `製作人員表：第 ${this.credits.pageIndex + 1}／7 頁。`;
    this.emit();
  }

  advanceStage49Ending(): void {
    const ending = this.stage49Ending;
    if (this.phase !== "ending" || !ending) return;
    if (ending.section === "stage38-boundary") {
      void this.enterHiddenStage38();
      return;
    }
    if (ending.advance() === "stage38-boundary") {
      this.campaignRoute = "stage-38";
      this.statusMessage = `主線結局完成；可進入隱藏關「${STAGE_RUNTIME_MANIFEST["stage-38"].label}」。`;
    }
    this.emit();
  }

  async enterHiddenStage38(): Promise<void> {
    if (this.phase !== "ending"
      || this.campaignRoute !== "stage-38"
      || this.stage49Ending?.section !== "stage38-boundary") return;
    await this.enterStage("stage-38", {
      ...this.battle.campaignSnapshot(),
      stageId: "stage-38",
    });
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
      if (this.moveOriginalDebugSurface(delta) || this.promotionDialogueActive) return;
      if (delta.x !== 0 || delta.y !== 0) {
        this.movePromotionSelection(delta.x !== 0 ? delta.x : delta.y);
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
    if (this.moveOriginalDebugSurface(delta)) return;
    if (this.recordMenuMode) {
      if (delta.y !== 0) this.moveRecordMenuSelection(delta.y);
      else if (delta.x !== 0) this.moveRecordMenuPage(delta.x);
      return;
    }
    if (this.quitConfirmOpen) {
      if (delta.x !== 0 || delta.y !== 0) this.moveQuitSelection(delta.x || delta.y);
      return;
    }
    if (this.settingsOpen) {
      if (delta.y !== 0) this.moveSettingsMenuSelection(delta.y);
      return;
    }
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
    if (this.actionMode === "shotRoute") {
      const direction = delta.x !== 0 ? delta.x : delta.y;
      if (direction !== 0) this.cycleMagicArcherRoute(direction);
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

  /**
   * Whether the tactical minimap answers the pointer right now: the cursor must be
   * free to roam and nothing may be blocking or animating. The hover preview, the
   * press-and-drag pan and the release commit all share this gate so the three
   * cannot disagree halfway through a gesture.
   */
  get minimapAvailable(): boolean {
    return this.phase === "player"
      && ROAMING_CURSOR_MODES.has(this.actionMode)
      && !this.busy
      && !this.hasBlockingOverlay;
  }

  previewMinimapCell(position: Position): Position | undefined {
    if (!this.minimapAvailable) return undefined;
    this.minimapPreviewOrigin = cameraOriginForFocus(this.battle.stage, position);
    return { ...this.minimapPreviewOrigin };
  }

  /**
   * Press-and-drag on the minimap [DD]: the viewport follows the pointer cell for
   * as long as the primary button is held. Only the camera moves — the cursor, the
   * selection, the candidate cells and the story focus stay put — so the HUD cannot
   * flip to a unit detail (which would hide the minimap) halfway through the
   * gesture. The release goes through `commitMinimapPreview`, i.e. the native
   * click semantics.
   */
  dragMinimapViewport(position: Position): Position | undefined {
    if (!this.minimapAvailable) return undefined;
    const origin = cameraOriginForFocus(this.battle.stage, position);
    this.minimapPreviewOrigin = origin;
    if (positionKey(origin) !== positionKey(this.cameraOrigin)) {
      this.cameraOrigin = origin;
      this.emit();
    }
    return { ...origin };
  }

  clearMinimapPreview(): void {
    this.minimapPreviewOrigin = undefined;
  }

  commitMinimapPreview(): void {
    if (!this.minimapPreviewOrigin) return;
    if (!this.minimapAvailable) {
      this.minimapPreviewOrigin = undefined;
      return;
    }
    const origin = clampCameraOrigin(this.battle.stage, this.minimapPreviewOrigin);
    this.cameraOrigin = origin;
    this.cursor = cameraFocusForOrigin(this.battle.stage, origin);
    // The native click parks the focus cell at the viewport centre. The remake's
    // story/HUD focus follows it only on the neutral battlefield: during a range
    // selection the actor keeps that focus and the roaming cursor alone relocates.
    if (this.actionMode === "idle") {
      this.battle.focusId = this.battle.unitAt(this.cursor)?.id ?? this.battle.focusId;
    }
    this.minimapPreviewOrigin = undefined;
    this.emit();
  }

  primaryAtCursor(): void {
    if (this.promotionUnitIds.length > 0 && this.originalDebugSurfaceOpen) this.activateOriginalDebugSurface();
    else if (this.prayerHoldSkip) this.prayerHoldSkip();
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
    else if (this.originalDebugSurfaceOpen) this.activateOriginalDebugSurface();
    else if (this.recordMenuMode) this.activateRecordMenuSelection();
    else if (this.quitConfirmOpen) this.activateQuitSelection();
    else if (this.settingsOpen) this.activateSettingsMenuSelection();
    else if (this.retreatConfirmOpen) this.activateRetreatSelection();
    else if (this.groupCommandOpen) this.activateGroupCommandSelection();
    else if (this.systemMenuOpen) this.activateSystemMenuSelection();
    else if (this.objectiveOpen) return;
    else if (this.actionMode === "actionMenu") this.activateCommandSelection();
    else if (this.actionMode === "techniqueMenu") this.activateTechniqueSelection();
    else if (this.actionMode === "shotRoute") this.confirmMagicArcherRoute();
    else if (this.actionMode === "selfAreaConfirm") this.confirmSelfAreaAction();
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
    this.contextualLineDialogue = undefined;
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
    if (destination === "stage-39") {
      this.phase = "credits";
      this.credits = new CreditsSession();
      this.statusMessage = "調試：異世界已完成，進入模組 46 製作人員表。";
    } else {
      this.phase = "nextStage";
      this.statusMessage = `調試：第 ${completedOrdinal} 關已直接完成，進入 ${destination} 邊界。`;
    }
    this.emit();
  }

  forceDefeatForTest(targetIndex = 0): void {
    if (!this.debugMode) return;
    const defeat = atomicObjectiveConditions(this.battle.stage.objective.defeat)
      .find(({ type }) => type === "unit-removed" || type === "any-unit-removed");
    if (!defeat || (defeat.type !== "unit-removed" && defeat.type !== "any-unit-removed")) return;
    const slot = defeat.type === "unit-removed"
      ? defeat.slot
      : defeat.slots[targetIndex];
    if (slot === undefined) return;
    const target = this.battle.units.find(
      (unit) => unit.side === defeat.side && unit.slot === slot,
    );
    if (!target) return;
    this.battle.units = this.battle.units.filter((unit) => unit.id !== target.id);
    this.resolveOutcome();
    this.emit();
  }

  forceVictorySetupForTest(targetIndex = 0): void {
    if (!this.debugMode) return;
    const victory = atomicObjectiveConditions(this.battle.stage.objective.victory)
      .find(({ type }) => type === "unit-in-cell-range")
      ?? atomicObjectiveConditions(this.battle.stage.objective.victory)[0];
    if (!victory) return;
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
    const victory = atomicObjectiveConditions(this.battle.stage.objective.victory)
      .find(({ type }) => type === "eliminate-side")
      ?? atomicObjectiveConditions(this.battle.stage.objective.victory)[0];
    if (!victory) return;
    if (victory.type === "eliminate-side") {
      this.battle.units = this.battle.units.filter(({ side }) => side !== victory.side);
      this.resolveOutcome();
      this.emit();
      return;
    }
    if (victory.type === "unit-in-cell-range") {
      const target = this.battle.units.find(
        ({ side, slot }) => side === victory.side && slot === victory.slot,
      );
      if (!target) return;
      target.x = victory.maximum % victory.width;
      target.y = Math.floor(victory.maximum / victory.width);
      this.battle.focusId = target.id;
      this.cursor = { x: target.x, y: target.y };
      this.centerCamera(target);
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

  /**
   * Puts one player unit exactly on its promotion threshold, so the board scan
   * after its next committed action queues it. Specs rest it and read which
   * commander answers the request on boards Nia is absent from.
   */
  forcePromotionThresholdForTest(unitId: string): void {
    if (!this.debugMode) return;
    const unit = this.battle.unit(unitId);
    if (!unit || !this.battle.isPlayerControllableAlly(unit.id)) return;
    unit.experience = promotionExperienceThresholdFor(unit.classId);
    unit.acted = false;
    unit.actionDisabled = false;
    this.battle.focusId = unit.id;
    this.phase = "player";
    this.centerCamera(unit);
    this.cursor = { x: unit.x, y: unit.y };
    this.resetAction();
    this.statusMessage = `自動驗收：${unitDisplayName(unit)}已達轉職門檻。`;
    this.busy = false;
    this.emit();
  }

  forceEvacuationSetupForTest(): void {
    if (!this.debugMode) return;
    const finalEnemy = this.battle.unit("2:15");
    if (!finalEnemy) return;
    const leftStaircase = STAGE0.enemyStaircaseCells[0];
    finalEnemy.x = leftStaircase.x;
    finalEnemy.y = leftStaircase.y - 3;
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
    // Native 1F seeds its range map with 5 and reaches four cells, so this is
    // the boundary the shared player/AI definition actually allows.
    sister.x = 30;
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
    classId: "soldier" | "archer" | "cavalry" | "magician" | "monk" | "sister" | "warrior",
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

    // REMAKE-094 freezes only targets that land back inside the effect, and 1C's
    // radius leaves just the four orthogonal neighbours. The pursuing ice fixture
    // therefore starts adjacent: it is pushed to the value-1 ring, freezes there,
    // and is two cells out once it thaws, so it resumes by moving rather than
    // attacking from where it stood.
    enemy.x = ordinaryCombat
      ? 30
      : classId === "archer"
        ? 33
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

  /**
   * `REMAKE-110` 的回合上限夹具。把战斗放到最后一个合法回合，棋盘上只留一名够不到
   * 主将的敌人：结束本回合必定走到回合边界的逾时判负，而不会被目标胜负抢先。
   * 落点沿用 `forceRestSetupForTest` 已验证的第 0 关可通行格。
   */
  forceRoundLimitSetupForTest(): void {
    if (!this.debugMode || this.battle.stage.id !== "stage-00") return;
    const ally = this.battle.unit("1:0");
    const enemy = this.battle.units.find((unit) => unit.side === 2);
    if (!ally || !enemy) return;
    ally.x = 29;
    ally.y = 26;
    ally.life = this.battle.statsFor(ally).maxLife;
    ally.acted = false;
    ally.actionDisabled = false;
    enemy.x = 34;
    enemy.y = 26;
    enemy.acted = false;
    enemy.actionDisabled = false;
    this.battle.units = [ally, enemy];
    this.battle.round = this.battle.roundLimit;
    this.battle.focusId = ally.id;
    this.phase = "player";
    this.centerCamera(ally);
    this.cursor = { x: ally.x, y: ally.y };
    this.resetAction();
    this.statusMessage = `自動驗收：第 ${this.battle.round} 回合，結束本回合即逾時判負。`;
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
      stage49Ending: this.stage49Ending ? {
        section: this.stage49Ending.section,
        index: this.stage49Ending.index,
        saveCount: this.stage49Ending.saveCount,
        recordTotal: this.stage49Ending.recordTotal,
        dominantClassFamily: this.stage49Ending.dominantClassFamily,
      } : undefined,
      credits: this.credits ? {
        section: this.credits.section,
        pageIndex: this.credits.pageIndex,
        transitionIndex: this.credits.transitionIndex,
      } : undefined,
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
      magicArcherRouteIndex: this.selectedMagicArcherRouteIndex,
      magicArcherRoutes: this.magicArcherRoutes.map((route) => ({
        ...route,
        path: route.path.map((position) => ({ ...position })),
        affectedUnitIds: [...route.affectedUnitIds],
      })),
      magicArcherRouteTargetId: this.magicArcherRouteTargetId,
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
      settingsMenuIndex: this.settingsMenuIndex,
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
      soundEffectVolume: this.soundEffectVolume,
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
        displayedLifeByUnitId: { ...this.combatPresentation.displayedLifeByUnitId },
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
      fullCombatBackdropPhases: [...this.fullCombatBackdropPhases],
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
      enemyPhaseTailPresentation: this.enemyPhaseTailPresentation ? {
        ...this.enemyPhaseTailPresentation,
        origin: { ...this.enemyPhaseTailPresentation.origin },
        descriptor: {
          ...this.enemyPhaseTailPresentation.descriptor,
          low7BitFrameIndices: [...this.enemyPhaseTailPresentation.descriptor.low7BitFrameIndices],
        },
        prepared: {
          ...this.enemyPhaseTailPresentation.prepared,
          origin: { ...this.enemyPhaseTailPresentation.prepared.origin },
          moves: this.enemyPhaseTailPresentation.prepared.moves.map((move) => ({
            ...move,
            from: { ...move.from },
            to: { ...move.to },
          })),
        },
      } : undefined,
      enemyPhaseTailPresentationTrace: this.enemyPhaseTailPresentationTrace.map((entry) => ({
        ...entry,
        origin: { ...entry.origin },
        descriptor: {
          ...entry.descriptor,
          low7BitFrameIndices: [...entry.descriptor.low7BitFrameIndices],
        },
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
      contextualLineDialogue: this.contextualLineDialogue ? {
        line: this.contextualLineDialogue.line,
        actor: {
          ...this.contextualLineDialogue.actor,
          statuses: { ...this.contextualLineDialogue.actor.statuses },
        },
        page: { ...this.contextualLineDialogue.page },
      } : undefined,
      movementPresentation: this.movementPresentation ? {
        ...this.movementPresentation,
        path: this.movementPresentation.path.map((step) => ({ ...step })),
      } : undefined,
      reachable: this.reachable.map((cell) => ({ ...cell })),
      moveRangeDisplay: this.moveRangeDisplay.map((cell) => ({ ...cell })),
      targets: this.targets.map((cell) => ({ ...cell })),
      actionRange: this.actionRange.map((cell) => ({ ...cell })),
      effectPreviewCells: this.effectPreviewCells.map((cell) => ({ ...cell })),
      ...this.battle.snapshot(),
    };
  }

  /**
   * A decided battle hands the screen to the victory/defeat flow, so a promotion
   * queue that is still open has nothing left to decide. Every ordinary action
   * path drains the queue before it resolves an outcome, so this only releases a
   * queue a scripted effect opened on a board that was decided out from under it.
   */
  private cancelPendingPromotions(): void {
    if (this.promotionUnitIds.length === 0 && this.promotionResume === undefined) return;
    this.promotionUnitIds = [];
    this.promotionDialogueIndex = undefined;
    this.promotionSelectionIndex = 0;
    const resume = this.promotionResume;
    this.promotionResume = undefined;
    resume?.();
  }

  private resolveOutcome(): boolean {
    const outcome = this.battle.outcome();
    if (outcome !== "ongoing") this.cancelPendingPromotions();
    if (outcome === "defeat") {
      this.systemMenuOpen = false;
      this.settingsOpen = false;
      this.soundSettingsOpen = false;
      this.soundSettingsReturn = undefined;
      this.musicSettingsOpen = false;
      this.musicSettingsReturn = undefined;
      this.musicBoxOpen = false;
      this.clearOriginalDebugSurfaces();
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
      // REMAKE-110: 逾时是一条与关卡目标无关的失败原因，信息栏必须说清楚，
      // 否则玩家只会看到一条与棋盘对不上的关卡失败条件。
      this.statusMessage = this.battle.roundLimitExceeded
        ? `未能在 ${this.battle.roundLimit} 回合內達成目標`
        : this.battle.stage.objective.defeatText;
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
      this.musicBoxOpen = false;
      this.clearOriginalDebugSurfaces();
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
      soundEffectVolume: this.soundEffectVolume,
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
    // `0000:6A2C` raises CS:`6A54`='Y' before calling `734C`, which then skips
    // the target count and always asks 確定／取消 after the class-0F move.
    if (completed && (extraMove || !this.hasPostMoveTarget(unit))) {
      this.awaitingMoveConfirmation = true;
      this.actionMode = "actionMenu";
      this.commandIndex = 0;
      this.reachable = [];
      this.statusMessage = extraMove
        ? "確定後飛龍騎士結束行動；取消則返回攻擊後的位置重選。"
        : `此處沒有可${shootingActionIdFor(unit.classId, unit.side) ? "攻擊或射擊" : "攻擊"}的目標；`
          + "確定後結束行動，取消則返回原位置重選。";
      this.emit();
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
    if (this.awaitingMoveConfirmation) {
      // 取消 rather than 返悔: `0000:73ED` rebuilds the range at the restored cell
      // with the budget this move had (halved for class 0F) and jumps straight
      // back into the destination loop at `734C`. Only a cancel from that loop
      // reaches the command menu again, or 移動／放棄 after an attack.
      this.awaitingMoveConfirmation = false;
      this.loadMoveRange(unit.id, Boolean(this.pendingExtraMove));
      this.actionMode = "move";
      this.statusMessage = !completed
        ? "無法返回原位置。"
        : this.pendingExtraMove
          ? "已返回攻擊後的位置；請重新選擇落點，或取消回到移動／放棄。"
          : "已返回原位置；請重新選擇落點，或取消回到行動選單。";
      this.emit();
      return;
    }
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
    this.queueWalkAudioCue(MOVEMENT_AUDIO_REASON[kind], path);
    this.cursor = { ...path[path.length - 1] };
    this.emit();
    for (let index = 1; index < path.length; index += 1) {
      const step = path[index];
      if (!this.battle.moveUnitStep(unitId, step, index < path.length - 1)) {
        const unit = this.battle.unit(unitId);
        if (unit) this.cursor = { x: unit.x, y: unit.y };
        this.endMovementPresentation();
        return false;
      }
      this.movementPresentation.stepIndex = index;
      if (kind === "scripted" || kind === "allyAuto" || kind === "enemy") this.centerCamera(step);
      this.emit();
      await pause(this.movementStepDuration);
    }
    this.endMovementPresentation();
    return true;
  }

  private async presentPreparedUnitPath(
    unitId: string,
    path: readonly Position[],
    walkReason: string,
  ): Promise<boolean> {
    if (path.length === 0 || !this.battle.unit(unitId)) return false;
    this.movementPresentation = {
      unitId,
      kind: "player",
      path: path.map((step) => ({ ...step })),
      stepIndex: 0,
    };
    this.queueWalkAudioCue(walkReason, path);
    this.cursor = { ...path[path.length - 1] };
    this.emit();
    for (let index = 1; index < path.length; index += 1) {
      if (!this.battle.unit(unitId)) {
        this.endMovementPresentation();
        return false;
      }
      this.movementPresentation.stepIndex = index;
      this.emit();
      await pause(this.movementStepDuration);
    }
    this.endMovementPresentation();
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
    // `aiTechniqueDialogueFor` carries the notice's DS:84BB selector as `wait`.
    if (!page || !this.nativeLineWindowOpens(page.source.wait)) return;
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
    const focusedUnit = this.focusedUnit;
    if (!focusedUnit) return undefined;

    const presentation = this.combatPresentation;
    if (this.battlePresentation === "full" && presentation?.phase.startsWith("full")) {
      const entrySnapshot = presentation.attacker.id === focusedUnit.id
        ? presentation.attacker
        : presentation.defender.id === focusedUnit.id
          ? presentation.defender
          : undefined;
      if (entrySnapshot) {
        const unit = { ...entrySnapshot, statuses: { ...entrySnapshot.statuses } };
        return { unit, stats: this.unitStats(unit) };
      }

      const displayedLife = presentation.displayedLifeByUnitId[focusedUnit.id];
      if (displayedLife !== undefined) {
        const unit = {
          ...focusedUnit,
          life: displayedLife,
          statuses: { ...focusedUnit.statuses },
        };
        return { unit, stats: this.unitStats(unit) };
      }
    }

    return { unit: focusedUnit, stats: this.unitStats(focusedUnit) };
  }

  portraitUrl(portrait: BattleUnit["portrait"]): string {
    return portraitSourceFor(portrait);
  }
}

export interface Angel2DebugApi {
  getState: () => object;
  setPresentationFast: (enabled: boolean) => void;
  advanceDialogue: () => void;
  skipDialogue: () => void;
  forceDefeat: () => void;
  forceVictorySetup: () => void;
  forcePromotionSetup: () => void;
  forcePromotionThreshold: (unitId: string) => void;
  forceEvacuationSetup: () => void;
  forceMultipleTargets: () => void;
  forceCavalryCounterSetup: () => void;
  forceEnemySisterSetup: () => void;
  forceEnemyAlertBoundarySetup: () => void;
  forceRestSetup: () => void;
  forceRoundLimitSetup: () => void;
  forceClassActionSetup: (
    classId: "soldier" | "archer" | "cavalry" | "magician" | "monk" | "sister" | "warrior",
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
    setPresentationFast: (enabled) => {
      controller.presentationFast = enabled;
      controller.emit();
    },
    advanceDialogue: () => controller.advanceDialogue(),
    skipDialogue: () => controller.skipDialogue(),
    forceDefeat: () => controller.forceDefeatForTest(),
    forceVictorySetup: () => controller.forceVictorySetupForTest(),
    forcePromotionSetup: () => controller.forcePromotionSetupForTest(),
    forcePromotionThreshold: (unitId) => controller.forcePromotionThresholdForTest(unitId),
    forceEvacuationSetup: () => controller.forceEvacuationSetupForTest(),
    forceMultipleTargets: () => controller.forceMultipleTargetsForTest(),
    forceCavalryCounterSetup: () => controller.forceCavalryCounterSetupForTest(),
    forceEnemySisterSetup: () => controller.forceEnemySisterSetupForTest(),
    forceEnemyAlertBoundarySetup: () => controller.forceEnemyAlertBoundarySetupForTest(),
    forceRestSetup: () => controller.forceRestSetupForTest(),
    forceRoundLimitSetup: () => controller.forceRoundLimitSetupForTest(),
    forceClassActionSetup: (classId, ordinaryCombat) =>
      controller.forceClassActionSetupForTest(classId, ordinaryCombat),
    clearSaves: () => {
      for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot += 1) {
        localStorage.removeItem(saveSlotKey(slot));
      }
    },
  };
}
