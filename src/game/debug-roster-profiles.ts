import {
  className,
  classStatsFor,
  promotionExperienceThresholdFor,
  promotionTargetsFor,
  type ClassId,
} from "./content/classes";
import { completeCampaignRoster } from "./content/stage0";
import { readSaveSlot, SAVE_SLOT_COUNT } from "./save";
import { DeterministicRng } from "./simulation/rng";
import { STAGE_RUNTIME_MANIFEST } from "./stage-runtime";
import type {
  CampaignState,
  Difficulty,
  SaveData,
  SaveRosterEntry,
  StageId,
} from "./types";

interface DebugRosterEntrySpec {
  slot: number;
  /** Starts at the character's real campaign-entry class and follows native promotion edges. */
  classPath: readonly ClassId[];
  experience: number;
}

interface DebugStageBaselineSpec {
  slot: number;
  classId: ClassId;
  experience: number;
}

/**
 * Direct debug entry skips earlier battles, so reproduce only campaign changes that every valid route
 * must already have committed: Sulanda's stage-8 cavalry, Dori's stage-9 curse-master, and the two
 * stage-13 water-warrior newcomers.
 */
const SULANDA_CAVALRY_BASELINE = { slot: 8, classId: "cavalry", experience: 299 } as const;
const DORI_CURSE_MASTER_BASELINE = { slot: 9, classId: "curse-master", experience: 299 } as const;
const MARLIN_WATER_WARRIOR_BASELINE = { slot: 10, classId: "water-warrior", experience: 299 } as const;
const MOLINA_WATER_WARRIOR_BASELINE = { slot: 11, classId: "water-warrior", experience: 299 } as const;

const DEBUG_STAGE_PROFILE_BASELINES: Readonly<
  Partial<Record<StageId, readonly DebugStageBaselineSpec[]>>
> = {
  "stage-11": [SULANDA_CAVALRY_BASELINE, DORI_CURSE_MASTER_BASELINE],
  "stage-10": [SULANDA_CAVALRY_BASELINE, DORI_CURSE_MASTER_BASELINE],
  "stage-12": [SULANDA_CAVALRY_BASELINE, DORI_CURSE_MASTER_BASELINE],
  "stage-13": [SULANDA_CAVALRY_BASELINE, DORI_CURSE_MASTER_BASELINE],
  "stage-14": [
    SULANDA_CAVALRY_BASELINE,
    DORI_CURSE_MASTER_BASELINE,
    MARLIN_WATER_WARRIOR_BASELINE,
    MOLINA_WATER_WARRIOR_BASELINE,
  ],
  "stage-15": [
    SULANDA_CAVALRY_BASELINE,
    DORI_CURSE_MASTER_BASELINE,
    MARLIN_WATER_WARRIOR_BASELINE,
    MOLINA_WATER_WARRIOR_BASELINE,
  ],
  "stage-16": [
    SULANDA_CAVALRY_BASELINE,
    DORI_CURSE_MASTER_BASELINE,
    MARLIN_WATER_WARRIOR_BASELINE,
    MOLINA_WATER_WARRIOR_BASELINE,
  ],
};

const REPRESENTATIVE_STAGE1 = [
  { slot: 0, classPath: ["soldier", "cavalry"], experience: 180 },
  { slot: 1, classPath: ["soldier", "sister"], experience: 160 },
  { slot: 2, classPath: ["soldier", "archer"], experience: 120 },
  { slot: 4, classPath: ["soldier", "warrior"], experience: 100 },
] as const satisfies readonly DebugRosterEntrySpec[];

const REPRESENTATIVE_STAGE2 = [
  { slot: 0, classPath: ["soldier", "cavalry"], experience: 460 },
  { slot: 1, classPath: ["soldier", "sister"], experience: 360 },
  { slot: 2, classPath: ["soldier", "archer"], experience: 450 },
  { slot: 4, classPath: ["soldier", "warrior"], experience: 390 },
  { slot: 24, classPath: ["magician"], experience: 700 },
] as const satisfies readonly DebugRosterEntrySpec[];

const REPRESENTATIVE_STAGE3 = [
  { slot: 0, classPath: ["soldier", "cavalry", "land-knight"], experience: 300 },
  { slot: 1, classPath: ["soldier", "sister", "priest"], experience: 520 },
  { slot: 2, classPath: ["soldier", "archer"], experience: 520 },
  { slot: 3, classPath: ["soldier", "warrior"], experience: 420 },
  { slot: 4, classPath: ["soldier", "archer"], experience: 440 },
  { slot: 20, classPath: ["soldier", "cavalry"], experience: 400 },
  { slot: 21, classPath: ["soldier", "sister"], experience: 480 },
  { slot: 24, classPath: ["magician"], experience: 920 },
] as const satisfies readonly DebugRosterEntrySpec[];

const REPRESENTATIVE_STAGE4 = [
  { slot: 0, classPath: ["soldier", "cavalry", "land-knight"], experience: 640 },
  { slot: 1, classPath: ["soldier", "sister", "priest"], experience: 780 },
  { slot: 2, classPath: ["soldier", "archer", "magic-archer"], experience: 560 },
  { slot: 3, classPath: ["soldier", "warrior", "steel-armor-warrior"], experience: 520 },
  { slot: 4, classPath: ["soldier", "sister", "magician"], experience: 760 },
  { slot: 20, classPath: ["soldier", "cavalry", "pegasus-warrior"], experience: 600 },
  { slot: 21, classPath: ["soldier", "sister", "monk"], experience: 700 },
  { slot: 24, classPath: ["magician", "evil-mage"], experience: 540 },
] as const satisfies readonly DebugRosterEntrySpec[];

const REPRESENTATIVE_STAGE6 = [
  ...REPRESENTATIVE_STAGE4,
  { slot: 5, classPath: ["soldier", "cavalry", "land-knight"], experience: 620 },
  { slot: 6, classPath: ["soldier", "warrior", "divine-sword-warrior"], experience: 560 },
  { slot: 12, classPath: ["soldier", "archer", "crossbow"], experience: 520 },
  { slot: 13, classPath: ["soldier", "sister", "priest"], experience: 590 },
  { slot: 14, classPath: ["soldier", "warrior", "steel-armor-warrior"], experience: 540 },
] as const satisfies readonly DebugRosterEntrySpec[];

const REPRESENTATIVE_STAGE8 = [
  ...REPRESENTATIVE_STAGE6,
  { slot: 17, classPath: ["soldier", "cavalry"], experience: 520 },
  { slot: 18, classPath: ["soldier", "warrior"], experience: 500 },
] as const satisfies readonly DebugRosterEntrySpec[];

const PROMOTION_COVERAGE_STAGE4 = [
  {
    slot: 0,
    classPath: ["soldier", "cavalry", "land-knight", "swift-dragon-knight"],
    experience: 360,
  },
  {
    slot: 1,
    classPath: ["soldier", "sister", "priest", "magic-priest"],
    experience: 330,
  },
  { slot: 2, classPath: ["soldier", "archer", "crossbow"], experience: 680 },
  {
    slot: 3,
    classPath: ["soldier", "warrior", "steel-armor-warrior", "magic-armor-warrior"],
    experience: 420,
  },
  {
    slot: 4,
    classPath: ["soldier", "sister", "monk", "prayer-guide"],
    experience: 390,
  },
  {
    slot: 20,
    classPath: ["soldier", "cavalry", "pegasus-warrior", "flying-dragon-knight"],
    experience: 450,
  },
  {
    slot: 21,
    classPath: ["soldier", "warrior", "divine-sword-warrior", "evil-sword-warrior"],
    experience: 510,
  },
  { slot: 24, classPath: ["magician", "wizard"], experience: 660 },
] as const satisfies readonly DebugRosterEntrySpec[];

const PROMOTION_COVERAGE_STAGE6 = [
  ...PROMOTION_COVERAGE_STAGE4,
  { slot: 5, classPath: ["soldier", "cavalry", "land-knight"], experience: 720 },
  { slot: 6, classPath: ["soldier", "warrior", "divine-sword-warrior"], experience: 680 },
  { slot: 12, classPath: ["soldier", "archer", "magic-archer"], experience: 650 },
  { slot: 13, classPath: ["soldier", "sister", "monk"], experience: 620 },
  { slot: 14, classPath: ["soldier", "warrior", "steel-armor-warrior"], experience: 640 },
] as const satisfies readonly DebugRosterEntrySpec[];

const PROMOTION_COVERAGE_STAGE8 = [
  ...PROMOTION_COVERAGE_STAGE6,
  { slot: 17, classPath: ["soldier", "cavalry", "land-knight"], experience: 620 },
  { slot: 18, classPath: ["soldier", "warrior", "steel-armor-warrior"], experience: 590 },
] as const satisfies readonly DebugRosterEntrySpec[];

const DEBUG_ROSTER_PROFILE_SPECS = [
  {
    id: "template-baseline",
    label: "模板／零成長基線",
    description: "保留原版關卡模板和未成長兵種，用於基線回歸。",
    stages: {},
  },
  {
    id: "representative-growth",
    label: "逐關代表性成長",
    description: "按關卡入口提供確定性的合法轉職混編；這是調試夾具，不是唯一標準答案。",
    stages: {
      "stage-01": REPRESENTATIVE_STAGE1,
      "stage-02": REPRESENTATIVE_STAGE2,
      "stage-03": REPRESENTATIVE_STAGE3,
      "stage-04": REPRESENTATIVE_STAGE4,
      "stage-05": REPRESENTATIVE_STAGE4,
      "stage-42-portal": REPRESENTATIVE_STAGE4,
      "stage-06": REPRESENTATIVE_STAGE6,
      "stage-07": REPRESENTATIVE_STAGE6,
      "stage-08": REPRESENTATIVE_STAGE8,
      "stage-09": REPRESENTATIVE_STAGE8,
      "stage-11": REPRESENTATIVE_STAGE8,
      "stage-10": REPRESENTATIVE_STAGE8,
      "stage-12": REPRESENTATIVE_STAGE8,
      "stage-13": REPRESENTATIVE_STAGE8,
      "stage-14": REPRESENTATIVE_STAGE8,
      "stage-15": REPRESENTATIVE_STAGE8,
      "stage-16": REPRESENTATIVE_STAGE8,
    },
  },
  {
    id: "promotion-coverage",
    label: "深層轉職分支覆蓋",
    description: "前幾關沿用代表成長，第 4 關覆蓋多次轉職後的不同職業分支。",
    stages: {
      "stage-01": REPRESENTATIVE_STAGE1,
      "stage-02": REPRESENTATIVE_STAGE2,
      "stage-03": REPRESENTATIVE_STAGE3,
      "stage-04": PROMOTION_COVERAGE_STAGE4,
      "stage-05": PROMOTION_COVERAGE_STAGE4,
      "stage-42-portal": PROMOTION_COVERAGE_STAGE4,
      "stage-06": PROMOTION_COVERAGE_STAGE6,
      "stage-07": PROMOTION_COVERAGE_STAGE6,
      "stage-08": PROMOTION_COVERAGE_STAGE8,
      "stage-09": PROMOTION_COVERAGE_STAGE8,
      "stage-11": PROMOTION_COVERAGE_STAGE8,
      "stage-10": PROMOTION_COVERAGE_STAGE8,
      "stage-12": PROMOTION_COVERAGE_STAGE8,
      "stage-13": PROMOTION_COVERAGE_STAGE8,
      "stage-14": PROMOTION_COVERAGE_STAGE8,
      "stage-15": PROMOTION_COVERAGE_STAGE8,
      "stage-16": PROMOTION_COVERAGE_STAGE8,
    },
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  stages: Partial<Record<StageId, readonly DebugRosterEntrySpec[]>>;
}[];

export const DEBUG_ROSTER_PROFILES = DEBUG_ROSTER_PROFILE_SPECS.map(
  ({ id, label, description }) => ({ id, label, description }),
);

export type DebugRosterProfileId = typeof DEBUG_ROSTER_PROFILE_SPECS[number]["id"];
export type DebugRosterSaveMode = "entry" | "current";
export type DebugRosterSourceId =
  | DebugRosterProfileId
  | `save-${number}-${DebugRosterSaveMode}`;

export type DebugRosterSource =
  | { kind: "profile"; id: DebugRosterProfileId }
  | { kind: "save-slot"; id: DebugRosterSourceId; slot: number; mode: DebugRosterSaveMode };

export interface DebugRosterSourceOption {
  id: DebugRosterSourceId;
  label: string;
  description: string;
}

export const DEFAULT_DEBUG_ROSTER_SOURCE_ID: DebugRosterProfileId = "template-baseline";
export const DEFAULT_DEBUG_HUB_ROSTER_SOURCE_ID: DebugRosterProfileId = "representative-growth";
export const DEFAULT_DEBUG_PER_STAGE_GROWTH = 100;
export const DEBUG_PER_STAGE_GROWTH_MAX = 9999;
const DEFAULT_DEBUG_RNG_STATE = 0x0a11ce02;
const DEBUG_GROWTH_PROFILE_SALTS: Record<DebugRosterProfileId, number> = {
  "template-baseline": 0x7465_6d70,
  "representative-growth": 0x7265_7072,
  "promotion-coverage": 0x636f_7665,
};
const SAVE_SOURCE_PATTERN = /^save-(\d+)-(entry|current)$/u;
const PER_STAGE_GROWTH_PATTERN = /^(?:0|[1-9]\d{0,3})$/u;

function isDebugRosterProfileId(value: string): value is DebugRosterProfileId {
  return DEBUG_ROSTER_PROFILE_SPECS.some(({ id }) => id === value);
}

export function parseDebugRosterSourceId(
  value: string | null | undefined,
): DebugRosterSource | undefined {
  if (value === null || value === undefined || value === "") {
    return { kind: "profile", id: DEFAULT_DEBUG_ROSTER_SOURCE_ID };
  }
  if (isDebugRosterProfileId(value)) return { kind: "profile", id: value };
  const match = SAVE_SOURCE_PATTERN.exec(value);
  if (!match) return undefined;
  const slot = Number(match[1]);
  if (!Number.isInteger(slot) || slot < 1 || slot > SAVE_SLOT_COUNT) return undefined;
  const mode = match[2] as DebugRosterSaveMode;
  return { kind: "save-slot", id: value as DebugRosterSourceId, slot, mode };
}

export function parseDebugPerStageGrowth(
  value: string | null | undefined,
): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (!PER_STAGE_GROWTH_PATTERN.test(value)) return undefined;
  const growth = Number(value);
  return growth <= DEBUG_PER_STAGE_GROWTH_MAX ? growth : undefined;
}

function profileSpec(profileId: DebugRosterProfileId) {
  const profile = DEBUG_ROSTER_PROFILE_SPECS.find(({ id }) => id === profileId);
  if (!profile) throw new Error(`未知成長檔案：${profileId}`);
  return profile;
}

export function debugRosterProfileSupportsGrowthOverride(
  profileId: DebugRosterProfileId,
  stageId: StageId,
): boolean {
  const stages: Partial<Record<StageId, readonly DebugRosterEntrySpec[]>> =
    profileSpec(profileId).stages;
  return (stages[stageId]?.length ?? 0) > 0;
}

function assertDebugPerStageGrowth(perStageGrowth: number): void {
  if (
    !Number.isInteger(perStageGrowth)
    || perStageGrowth < 0
    || perStageGrowth > DEBUG_PER_STAGE_GROWTH_MAX
  ) {
    throw new Error(`每關成長值必須是 0–${DEBUG_PER_STAGE_GROWTH_MAX} 的整數`);
  }
}

export function debugGrowthBudgetForStage(stageId: StageId, perStageGrowth: number): number {
  assertDebugPerStageGrowth(perStageGrowth);
  return STAGE_RUNTIME_MANIFEST[stageId].ordinal * perStageGrowth;
}

function debugGrowthRng(
  profileId: DebugRosterProfileId,
  slot: number,
): DeterministicRng {
  const seed = (
    DEFAULT_DEBUG_RNG_STATE
    ^ DEBUG_GROWTH_PROFILE_SALTS[profileId]
    ^ Math.imul(slot + 1, 0x9e37_79b1)
  ) >>> 0;
  return new DeterministicRng(seed || DEFAULT_DEBUG_RNG_STATE);
}

function randomPromotionTarget(classId: ClassId, rng: DeterministicRng): ClassId {
  const targets = promotionTargetsFor(classId);
  if (targets.length === 0) throw new Error(`${className(classId)}沒有合法轉職候選`);
  const target = targets[rng.between(0, targets.length - 1)];
  if (!target) throw new Error(`${className(classId)}的隨機轉職候選不存在`);
  return target.id;
}

export interface DebugGrowthProgression {
  classId: ClassId;
  experience: number;
  promotions: readonly ClassId[];
}

function debugGrowthProgression(
  profileId: DebugRosterProfileId,
  entry: DebugRosterEntrySpec,
  growthBudget: number,
): DebugGrowthProgression {
  const campaignEntryClass = entry.classPath[0];
  if (!campaignEntryClass) throw new Error(`成長檔案槽 ${entry.slot} 缺少入隊職業`);
  const rng = debugGrowthRng(profileId, entry.slot);
  let classId = campaignEntryClass === "soldier"
    ? randomPromotionTarget(campaignEntryClass, rng)
    : campaignEntryClass;
  let experience = growthBudget;
  const promotions: ClassId[] = [classId];

  while (promotionTargetsFor(classId).length > 0) {
    const threshold = promotionExperienceThresholdFor(classId);
    if (experience < threshold) break;
    experience -= threshold;
    classId = randomPromotionTarget(classId, rng);
    promotions.push(classId);
  }
  return { classId, experience, promotions };
}

export function debugGrowthProgressionForSlot(
  profileId: DebugRosterProfileId,
  stageId: StageId,
  slot: number,
  perStageGrowth: number,
): DebugGrowthProgression {
  const stages: Partial<Record<StageId, readonly DebugRosterEntrySpec[]>> =
    profileSpec(profileId).stages;
  const entry = stages[stageId]?.find((candidate) => candidate.slot === slot);
  if (!entry) throw new Error(`成長檔案 ${profileId} 在 ${stageId} 沒有角色槽 ${slot}`);
  assertPromotionPath(entry);
  return debugGrowthProgression(
    profileId,
    entry,
    debugGrowthBudgetForStage(stageId, perStageGrowth),
  );
}

function assertPromotionPath(entry: DebugRosterEntrySpec): ClassId {
  if (entry.classPath.length === 0) {
    throw new Error(`成長檔案槽 ${entry.slot} 缺少職業路徑`);
  }
  const seen = new Set<ClassId>();
  for (const [index, classId] of entry.classPath.entries()) {
    if (seen.has(classId)) throw new Error(`成長檔案槽 ${entry.slot} 的職業路徑形成循環`);
    seen.add(classId);
    const next = entry.classPath[index + 1];
    if (next && !promotionTargetsFor(classId).some(({ id }) => id === next)) {
      throw new Error(
        `成長檔案槽 ${entry.slot} 含非法轉職：${className(classId)} → ${className(next)}`,
      );
    }
  }
  const classId = entry.classPath.at(-1);
  if (!classId) throw new Error(`成長檔案槽 ${entry.slot} 缺少最終職業`);
  return classId;
}

export function debugRosterForProfile(
  profileId: DebugRosterProfileId,
  stageId: StageId,
  perStageGrowth?: number,
): SaveRosterEntry[] {
  const roster = completeCampaignRoster(
    (DEBUG_STAGE_PROFILE_BASELINES[stageId] ?? []).map((entry) => ({
      ...entry,
      life: classStatsFor(entry).maxLife,
    })),
  );
  const stages: Partial<Record<StageId, readonly DebugRosterEntrySpec[]>> =
    profileSpec(profileId).stages;
  const entries = stages[stageId] ?? [];
  if (perStageGrowth !== undefined) assertDebugPerStageGrowth(perStageGrowth);
  if (perStageGrowth !== undefined && entries.length === 0) {
    throw new Error(`成長檔案 ${profileId} 在 ${stageId} 沒有可覆蓋的友軍`);
  }
  const growthBudget = perStageGrowth === undefined
    ? undefined
    : debugGrowthBudgetForStage(stageId, perStageGrowth);
  const slots = new Set<number>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= roster.length) {
      throw new Error(`成長檔案含非法角色槽：${entry.slot}`);
    }
    if (slots.has(entry.slot)) throw new Error(`成長檔案重複角色槽：${entry.slot}`);
    if (!Number.isInteger(entry.experience) || entry.experience < 0) {
      throw new Error(`成長檔案槽 ${entry.slot} 含非法經驗值`);
    }
    slots.add(entry.slot);
    const configuredClassId = assertPromotionPath(entry);
    const progression = growthBudget === undefined
      ? { classId: configuredClassId, experience: entry.experience }
      : debugGrowthProgression(profileId, entry, growthBudget);
    const { classId, experience } = progression;
    roster[entry.slot] = {
      slot: entry.slot,
      classId,
      experience,
      life: classStatsFor({ classId, experience }).maxLife,
    };
  }
  return roster;
}

export function campaignFromDebugSave(
  save: SaveData,
  stageId: StageId,
  difficulty: Difficulty,
  mode: DebugRosterSaveMode,
): CampaignState {
  if (mode === "entry" && save.kind !== "battle") {
    throw new Error("完成記錄沒有戰中入關快照，請選擇完成名單");
  }
  const source = mode === "entry" && save.kind === "battle"
    ? save.stageEntrySnapshot
    : save;
  return {
    stageId,
    ruleset: source.ruleset,
    difficulty,
    roster: source.roster.map((entry) => ({ ...entry })),
    rngState: source.rngState,
    rngCalls: source.rngCalls,
  };
}

export function createDebugCampaignState(
  stageId: StageId,
  difficulty: Difficulty,
  source: DebugRosterSource,
  storage: Pick<Storage, "getItem">,
  perStageGrowth?: number,
): CampaignState {
  if (source.kind === "profile") {
    return {
      stageId,
      ruleset: "stableRemake",
      difficulty,
      roster: debugRosterForProfile(source.id, stageId, perStageGrowth),
      rngState: DEFAULT_DEBUG_RNG_STATE,
      rngCalls: 0,
    };
  }
  if (perStageGrowth !== undefined) {
    throw new Error("正式記錄來源不接受每關成長覆蓋");
  }
  const result = readSaveSlot(storage, source.slot);
  if (result.kind === "empty") throw new Error(`記錄 ${source.slot} 是空的`);
  if (result.kind === "invalid") throw new Error(`記錄 ${source.slot} 無法讀取或版本不相容`);
  return campaignFromDebugSave(result.save, stageId, difficulty, source.mode);
}

function saveSourceOptions(
  storage: Pick<Storage, "getItem">,
): DebugRosterSourceOption[] {
  const options: DebugRosterSourceOption[] = [];
  for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot += 1) {
    const result = readSaveSlot(storage, slot);
    if (result.kind !== "valid") continue;
    const base = `記錄 ${slot} · ${result.save.stageLabel}`;
    if (result.save.kind === "battle") {
      options.push({
        id: `save-${slot}-entry`,
        label: `${base} · 入關快照`,
        description: "只讀取本關不可變入關 roster 與 PRNG，不帶入戰中位置或事件。",
      });
      options.push({
        id: `save-${slot}-current`,
        label: `${base} · 當前成長`,
        description: "只讀取戰中保存時的 roster 與 PRNG，不帶入戰中位置或事件。",
      });
    } else {
      options.push({
        id: `save-${slot}-current`,
        label: `${base} · 完成名單`,
        description: "只讀取通關後 roster 與 PRNG，不修改正式記錄。",
      });
    }
  }
  return options;
}

export function debugRosterSourceOptions(
  storage: Pick<Storage, "getItem">,
): DebugRosterSourceOption[] {
  return [
    ...DEBUG_ROSTER_PROFILE_SPECS.map(({ id, label, description }) => ({
      id,
      label,
      description,
    })),
    ...saveSourceOptions(storage),
  ];
}

export function debugRosterSourceOption(
  source: DebugRosterSource,
  storage: Pick<Storage, "getItem">,
): DebugRosterSourceOption {
  const option = debugRosterSourceOptions(storage).find(({ id }) => id === source.id);
  if (!option) {
    if (source.kind === "save-slot") throw new Error(`記錄 ${source.slot} 已不存在或無法讀取`);
    throw new Error(`未知成長檔案：${source.id}`);
  }
  return option;
}
