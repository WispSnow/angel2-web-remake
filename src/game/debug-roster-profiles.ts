import {
  className,
  classStatsFor,
  promotionTargetsFor,
  type ClassId,
} from "./content/classes";
import { completeCampaignRoster } from "./content/stage0";
import { readSaveSlot, SAVE_SLOT_COUNT } from "./save";
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
const DEFAULT_DEBUG_RNG_STATE = 0x0a11ce02;
const SAVE_SOURCE_PATTERN = /^save-(\d+)-(entry|current)$/u;

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

function profileSpec(profileId: DebugRosterProfileId) {
  const profile = DEBUG_ROSTER_PROFILE_SPECS.find(({ id }) => id === profileId);
  if (!profile) throw new Error(`未知成長檔案：${profileId}`);
  return profile;
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
): SaveRosterEntry[] {
  const roster = completeCampaignRoster();
  const stages: Partial<Record<StageId, readonly DebugRosterEntrySpec[]>> =
    profileSpec(profileId).stages;
  const entries = stages[stageId] ?? [];
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
    const classId = assertPromotionPath(entry);
    roster[entry.slot] = {
      slot: entry.slot,
      classId,
      experience: entry.experience,
      life: classStatsFor({ classId, experience: entry.experience }).maxLife,
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
): CampaignState {
  if (source.kind === "profile") {
    return {
      stageId,
      ruleset: "stableRemake",
      difficulty,
      roster: debugRosterForProfile(source.id, stageId),
      rngState: DEFAULT_DEBUG_RNG_STATE,
      rngCalls: 0,
    };
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
