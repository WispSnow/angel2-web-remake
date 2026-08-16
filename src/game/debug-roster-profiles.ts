import {
  className,
  classStatsFor,
  promotionExperienceThresholdFor,
  promotionTargetsFor,
  type ClassId,
} from "./content/classes";
import {
  HALF_DRAGON_SISTER_CLASS_ID,
  HALF_DRAGON_SISTER_ENTRY_EXPERIENCE,
  HALF_DRAGON_SISTER_SLOTS,
} from "./content/campaign-entry-experience";
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
 * must already have committed: Sulanda's stage-8 cavalry, Dori's stage-9 curse-master, the two
 * stage-13 water-warrior newcomers, and later fixed story recruits/profession changes.
 */
const SULANDA_CAVALRY_BASELINE = { slot: 8, classId: "cavalry", experience: 299 } as const;
const DORI_CURSE_MASTER_BASELINE = { slot: 9, classId: "curse-master", experience: 299 } as const;
const MARLIN_WATER_WARRIOR_BASELINE = { slot: 10, classId: "water-warrior", experience: 299 } as const;
const MOLINA_WATER_WARRIOR_BASELINE = { slot: 11, classId: "water-warrior", experience: 299 } as const;
const KINS_MAGIC_PRIEST_BASELINE = { slot: 7, classId: "magic-priest", experience: 0 } as const;
const STAGE27_GREAT_AXE_DEFENDER_BASELINE = {
  slot: 22,
  classId: "great-axe-warrior",
  experience: 0,
} as const;
const STAGE27_MAGIC_SWORD_DEFENDER_BASELINE = {
  slot: 40,
  classId: "magic-sword-warrior",
  experience: 0,
} as const;
const STAGE30_VESTA_EMPRESS_BASELINE = {
  slot: 23,
  classId: "empress",
  experience: 0,
} as const;
// REMAKE-092 gives the sisters a just-reached-level-3 entry baseline instead of
// the class-0 soldier number, so the fixture reads the same constant the stages do.
const HALF_DRAGON_SISTER_BASELINES = HALF_DRAGON_SISTER_SLOTS.map((slot) => ({
  slot,
  classId: HALF_DRAGON_SISTER_CLASS_ID,
  experience: HALF_DRAGON_SISTER_ENTRY_EXPERIENCE,
}));

/**
 * Mandatory campaign changes are cumulative route milestones, not per-stage fixtures. Keeping them
 * ordinal-based prevents a newly implemented late stage from silently dropping earlier professions.
 */
const DEBUG_STAGE_PROFILE_BASELINE_TRANSITIONS = [
  {
    firstStageId: "stage-11",
    entries: [SULANDA_CAVALRY_BASELINE, DORI_CURSE_MASTER_BASELINE],
  },
  {
    firstStageId: "stage-14",
    entries: [MARLIN_WATER_WARRIOR_BASELINE, MOLINA_WATER_WARRIOR_BASELINE],
  },
  {
    firstStageId: "stage-22",
    entries: HALF_DRAGON_SISTER_BASELINES,
  },
  {
    firstStageId: "stage-23",
    entries: [KINS_MAGIC_PRIEST_BASELINE],
  },
  {
    firstStageId: "stage-28",
    entries: [STAGE27_GREAT_AXE_DEFENDER_BASELINE],
  },
  {
    firstStageId: "stage-30",
    entries: [STAGE27_MAGIC_SWORD_DEFENDER_BASELINE],
  },
  {
    firstStageId: "stage-31",
    entries: [STAGE30_VESTA_EMPRESS_BASELINE],
  },
] as const satisfies readonly {
  firstStageId: StageId;
  entries: readonly DebugStageBaselineSpec[];
}[];

function debugStageProfileBaselines(stageId: StageId): readonly DebugStageBaselineSpec[] {
  const ordinal = STAGE_RUNTIME_MANIFEST[stageId].ordinal;
  const baselines: DebugStageBaselineSpec[] = [];
  for (const { firstStageId, entries } of DEBUG_STAGE_PROFILE_BASELINE_TRANSITIONS) {
    if (ordinal >= STAGE_RUNTIME_MANIFEST[firstStageId].ordinal) baselines.push(...entries);
  }
  return baselines;
}

export interface DebugCampaignMemberSpec {
  slot: number;
  /** 原版 module 29 DS:362C 角色描述子名稱，只用於夾具可讀性與錯誤訊息。 */
  name: string;
  /**
   * 該角色帶著下面的戰役入隊職業首次能以我方單位參戰的關卡；每關成長預算由此關起算，
   * 所以入隊當關預算為 0，之後每過一關累加一份。
   */
  joinStageId: StageId;
  /** 戰役入隊職業：有強制劇情職業的用該職業，其餘沿用原版士兵起點。 */
  campaignEntryClassId: ClassId;
  /**
   * 角色早於 `joinStageId` 就能上場的關卡。此時她還沒拿到強制劇情職業，名冊保持未轉職
   * 士兵，由關卡自己的命名士兵經驗下限接手，所以夾具不在那些關寫入成長。
   */
  firstBoardStageId?: StageId;
  /** 角色離隊的最後一關；之後停止累加預算，避免離隊角色繼續成長。 */
  lastStageId?: StageId;
}

/**
 * 每關成長按「（當前關卡序數 − 入隊關卡序數）× 每關成長值」推算，所以夾具需要一份完整的
 * 我方名冊，而不是只覆蓋前期角色。入隊關卡取自各關實際的我方出場證據：互動部署關取
 * `eligibleSlots` 首次出現的關卡，固定編隊關取該關的固定我方單位表；強制劇情職業取該關
 * 的 `initialClassId`／`forcedClassId`／`campaignEntryNativeClassRecord` 覆寫。
 *
 * 不登記 40..58 這類 `xxxxNN` 通用槽與第 20 關守護者（槽 32）：它們是關卡自帶的一次性
 * NPC，職業與經驗由關卡模板直接給定，戰役名冊不保存它們的成長。
 */
const DEBUG_CAMPAIGN_MEMBER_SPECS = [
  // 第 0 關瓦爾克麗宮的兩名可操作角色。
  { slot: 0, name: "妮雅", joinStageId: "stage-00", campaignEntryClassId: "soldier" },
  { slot: 1, name: "希蜜", joinStageId: "stage-00", campaignEntryClassId: "soldier" },
  // 第 1 關騎士城堡前的名單候選。
  { slot: 2, name: "蒙欣曼", joinStageId: "stage-01", campaignEntryClassId: "soldier" },
  { slot: 4, name: "拉朵那", joinStageId: "stage-01", campaignEntryClassId: "soldier" },
  // 葛蒂拉斯第 1 關以未轉職士兵進名單，第 2 關固定編隊才把她寫成魔術士；第 22 關叛變離隊。
  {
    slot: 24,
    name: "葛蒂拉斯",
    joinStageId: "stage-02",
    campaignEntryClassId: "magician",
    firstBoardStageId: "stage-01",
    lastStageId: "stage-20",
  },
  // 第 3 關救援友軍的固定我方編隊。
  { slot: 3, name: "黛西", joinStageId: "stage-03", campaignEntryClassId: "soldier" },
  { slot: 20, name: "蕾奇蒂特", joinStageId: "stage-03", campaignEntryClassId: "soldier" },
  { slot: 21, name: "愛歐里雅", joinStageId: "stage-03", campaignEntryClassId: "soldier" },
  // 第 6 關過異世界之門後新增的名單候選。
  { slot: 5, name: "汀塔琪", joinStageId: "stage-06", campaignEntryClassId: "soldier" },
  { slot: 6, name: "萊茵", joinStageId: "stage-06", campaignEntryClassId: "soldier" },
  { slot: 12, name: "亞莉沙", joinStageId: "stage-06", campaignEntryClassId: "soldier" },
  { slot: 13, name: "克莉絲", joinStageId: "stage-06", campaignEntryClassId: "soldier" },
  { slot: 14, name: "舒菲亞", joinStageId: "stage-06", campaignEntryClassId: "soldier" },
  // 第 8 關營地遭到偷襲的固定編隊：蘇蘭達被強制為騎兵，兩名游騎兵沿用士兵。
  { slot: 8, name: "蘇蘭達", joinStageId: "stage-08", campaignEntryClassId: "cavalry" },
  { slot: 17, name: "阿曼妮", joinStageId: "stage-08", campaignEntryClassId: "soldier" },
  { slot: 18, name: "雷伊拉", joinStageId: "stage-08", campaignEntryClassId: "soldier" },
  // 第 9 關找尋傳說中的飛船把多莉固定為咒術師。
  { slot: 9, name: "多莉", joinStageId: "stage-09", campaignEntryClassId: "curse-master" },
  // 第 11 關拯救蘇蘭達（序數 10）的固定游騎兵編隊。
  { slot: 16, name: "茱莉亞", joinStageId: "stage-11", campaignEntryClassId: "soldier" },
  { slot: 19, name: "塔絲加", joinStageId: "stage-11", campaignEntryClassId: "soldier" },
  // 第 10 關飛船上遭遇敵人（序數 11）才出現在名單候選中。
  { slot: 15, name: "潔西卡", joinStageId: "stage-10", campaignEntryClassId: "soldier" },
  // 第 13 關龍塔外的兩名水戰士新人。
  { slot: 10, name: "瑪琳", joinStageId: "stage-13", campaignEntryClassId: "water-warrior" },
  { slot: 11, name: "摩莉娜", joinStageId: "stage-13", campaignEntryClassId: "water-warrior" },
  // 第 22 關焦土森林村莊中加入的七姊妹，名單覆寫為半龍戰士。
  { slot: 25, name: "芳", joinStageId: "stage-22", campaignEntryClassId: "half-dragon-warrior" },
  { slot: 26, name: "蘭", joinStageId: "stage-22", campaignEntryClassId: "half-dragon-warrior" },
  { slot: 27, name: "莎", joinStageId: "stage-22", campaignEntryClassId: "half-dragon-warrior" },
  { slot: 28, name: "倩", joinStageId: "stage-22", campaignEntryClassId: "half-dragon-warrior" },
  { slot: 29, name: "麗", joinStageId: "stage-22", campaignEntryClassId: "half-dragon-warrior" },
  { slot: 30, name: "愛", joinStageId: "stage-22", campaignEntryClassId: "half-dragon-warrior" },
  { slot: 31, name: "嵐", joinStageId: "stage-22", campaignEntryClassId: "half-dragon-warrior" },
  // 第 23 關死亡之谷中的琴斯，戰役入隊職業記錄為魔祭師。
  { slot: 7, name: "琴斯", joinStageId: "stage-23", campaignEntryClassId: "magic-priest" },
  // 第 27 關趕回瓦爾克麗城的固定守軍愛莉歐拉，之後靠名冊職業顯示。
  {
    slot: 22,
    name: "愛莉歐拉",
    joinStageId: "stage-27",
    campaignEntryClassId: "great-axe-warrior",
  },
  // 第 30 關治癒維斯塔女帝後歸隊的女帝本人。
  { slot: 23, name: "維絲塔", joinStageId: "stage-30", campaignEntryClassId: "empress" },
] as const satisfies readonly DebugCampaignMemberSpec[];

export const DEBUG_CAMPAIGN_MEMBERS: readonly DebugCampaignMemberSpec[] =
  DEBUG_CAMPAIGN_MEMBER_SPECS;

/**
 * 第 20 關守護者（槽 32）以及其後的 `xxxxNN` 槽都是關卡自帶的一次性我方單位，職業與經驗
 * 由關卡模板給定，不進入戰役名冊成長。新關卡若把更小的槽放進部署候選，就必須先登記成員。
 */
export const FIRST_STAGE_SCOPED_ALLY_SLOT = 32;

function stageOrdinal(stageId: StageId): number {
  return STAGE_RUNTIME_MANIFEST[stageId].ordinal;
}

function debugCampaignMember(slot: number): DebugCampaignMemberSpec {
  const member = DEBUG_CAMPAIGN_MEMBERS.find((candidate) => candidate.slot === slot);
  if (!member) throw new Error(`戰役名冊沒有登記角色槽 ${slot}`);
  return member;
}

/** 入隊當關預算為 0；離隊後凍結在最後一關的預算，之後不再累加。 */
function debugMemberGrowthBudget(
  member: DebugCampaignMemberSpec,
  stageId: StageId,
  perStageGrowth: number,
): number {
  const ordinal = member.lastStageId === undefined
    ? stageOrdinal(stageId)
    : Math.min(stageOrdinal(stageId), stageOrdinal(member.lastStageId));
  return Math.max(0, ordinal - stageOrdinal(member.joinStageId)) * perStageGrowth;
}

function debugCampaignMemberJoined(
  member: DebugCampaignMemberSpec,
  stageId: StageId,
): boolean {
  return stageOrdinal(stageId) >= stageOrdinal(member.joinStageId);
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

type DebugGrowthStageId = Exclude<StageId, "stage-00">;

// This is intentionally total rather than Partial: extending StageId for a playable stage must fail
// type-checking until both direct-entry growth profiles receive an explicit profession fixture.
const REPRESENTATIVE_PROFILE_STAGES = {
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
  "stage-17": REPRESENTATIVE_STAGE8,
  "stage-18": REPRESENTATIVE_STAGE8,
  "stage-19": REPRESENTATIVE_STAGE8,
  "stage-20": REPRESENTATIVE_STAGE8,
  "stage-21": REPRESENTATIVE_STAGE8,
  "stage-22": REPRESENTATIVE_STAGE8,
  "stage-23": REPRESENTATIVE_STAGE8,
  "stage-24": REPRESENTATIVE_STAGE8,
  "stage-26": REPRESENTATIVE_STAGE8,
  "stage-27": REPRESENTATIVE_STAGE8,
  "stage-28": REPRESENTATIVE_STAGE8,
  "stage-29": REPRESENTATIVE_STAGE8,
  "stage-30": REPRESENTATIVE_STAGE8,
  "stage-31": REPRESENTATIVE_STAGE8,
  "stage-32": REPRESENTATIVE_STAGE8,
  "stage-33": REPRESENTATIVE_STAGE8,
  "stage-34": REPRESENTATIVE_STAGE8,
  "stage-35": REPRESENTATIVE_STAGE8,
  "stage-36": REPRESENTATIVE_STAGE8,
  "stage-37": REPRESENTATIVE_STAGE8,
  "stage-38": REPRESENTATIVE_STAGE8,
} as const satisfies Record<DebugGrowthStageId, readonly DebugRosterEntrySpec[]>;

const PROMOTION_COVERAGE_PROFILE_STAGES = {
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
  "stage-17": PROMOTION_COVERAGE_STAGE8,
  "stage-18": PROMOTION_COVERAGE_STAGE8,
  "stage-19": PROMOTION_COVERAGE_STAGE8,
  "stage-20": PROMOTION_COVERAGE_STAGE8,
  "stage-21": PROMOTION_COVERAGE_STAGE8,
  "stage-22": PROMOTION_COVERAGE_STAGE8,
  "stage-23": PROMOTION_COVERAGE_STAGE8,
  "stage-24": PROMOTION_COVERAGE_STAGE8,
  "stage-26": PROMOTION_COVERAGE_STAGE8,
  "stage-27": PROMOTION_COVERAGE_STAGE8,
  "stage-28": PROMOTION_COVERAGE_STAGE8,
  "stage-29": PROMOTION_COVERAGE_STAGE8,
  "stage-30": PROMOTION_COVERAGE_STAGE8,
  "stage-31": PROMOTION_COVERAGE_STAGE8,
  "stage-32": PROMOTION_COVERAGE_STAGE8,
  "stage-33": PROMOTION_COVERAGE_STAGE8,
  "stage-34": PROMOTION_COVERAGE_STAGE8,
  "stage-35": PROMOTION_COVERAGE_STAGE8,
  "stage-36": PROMOTION_COVERAGE_STAGE8,
  "stage-37": PROMOTION_COVERAGE_STAGE8,
  "stage-38": PROMOTION_COVERAGE_STAGE8,
} as const satisfies Record<DebugGrowthStageId, readonly DebugRosterEntrySpec[]>;

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
    stages: REPRESENTATIVE_PROFILE_STAGES,
  },
  {
    id: "promotion-coverage",
    label: "深層轉職分支覆蓋",
    description: "前幾關沿用代表成長，第 4 關覆蓋多次轉職後的不同職業分支。",
    stages: PROMOTION_COVERAGE_PROFILE_STAGES,
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

/**
 * 單一角色的成長預算。`joinStageId` 預設為第 0 關，也就是開國成員能拿到的最高預算；
 * 調試中心與工具列用它顯示上限，個別角色的實際預算由入隊關卡決定。
 */
export function debugGrowthBudgetForStage(
  stageId: StageId,
  perStageGrowth: number,
  joinStageId: StageId = "stage-00",
): number {
  assertDebugPerStageGrowth(perStageGrowth);
  return Math.max(0, stageOrdinal(stageId) - stageOrdinal(joinStageId)) * perStageGrowth;
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
  slot: number,
  campaignEntryClassId: ClassId,
  growthBudget: number,
): DebugGrowthProgression {
  const rng = debugGrowthRng(profileId, slot);
  let classId = campaignEntryClassId === "soldier"
    ? randomPromotionTarget(campaignEntryClassId, rng)
    : campaignEntryClassId;
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
  assertDebugPerStageGrowth(perStageGrowth);
  const member = debugCampaignMember(slot);
  if (!debugCampaignMemberJoined(member, stageId)) {
    throw new Error(`${member.name}在 ${stageId} 還沒有入隊`);
  }
  return debugGrowthProgression(
    profileId,
    slot,
    member.campaignEntryClassId,
    debugMemberGrowthBudget(member, stageId, perStageGrowth),
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

function assertProfileStageEntries(
  entries: readonly DebugRosterEntrySpec[],
  rosterLength: number,
): void {
  const slots = new Set<number>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= rosterLength) {
      throw new Error(`成長檔案含非法角色槽：${entry.slot}`);
    }
    if (slots.has(entry.slot)) throw new Error(`成長檔案重複角色槽：${entry.slot}`);
    if (!Number.isInteger(entry.experience) || entry.experience < 0) {
      throw new Error(`成長檔案槽 ${entry.slot} 含非法經驗值`);
    }
    slots.add(entry.slot);
    assertPromotionPath(entry);
  }
}

export function debugRosterForProfile(
  profileId: DebugRosterProfileId,
  stageId: StageId,
  perStageGrowth?: number,
): SaveRosterEntry[] {
  const roster = completeCampaignRoster(
    debugStageProfileBaselines(stageId).map((entry) => ({
      ...entry,
      life: classStatsFor(entry).maxLife,
    })),
  );
  const stages: Partial<Record<StageId, readonly DebugRosterEntrySpec[]>> =
    profileSpec(profileId).stages;
  const entries = stages[stageId] ?? [];
  assertProfileStageEntries(entries, roster.length);
  if (perStageGrowth === undefined) {
    for (const entry of entries) {
      const classId = assertPromotionPath(entry);
      const { experience } = entry;
      roster[entry.slot] = {
        slot: entry.slot,
        classId,
        experience,
        life: classStatsFor({ classId, experience }).maxLife,
      };
    }
    return roster;
  }
  assertDebugPerStageGrowth(perStageGrowth);
  if (entries.length === 0) {
    throw new Error(`成長檔案 ${profileId} 在 ${stageId} 沒有可覆蓋的友軍`);
  }
  // 每關成長覆蓋整份戰役名冊，不只覆蓋本檔案手寫登記的槽：後期加入的角色同樣要按
  // 「（當前關卡 − 入隊關卡）× 每關成長值」推算，尚未入隊的槽保持關卡模板基線。
  for (const member of DEBUG_CAMPAIGN_MEMBERS) {
    if (!debugCampaignMemberJoined(member, stageId)) continue;
    const { classId, experience } = debugGrowthProgression(
      profileId,
      member.slot,
      member.campaignEntryClassId,
      debugMemberGrowthBudget(member, stageId, perStageGrowth),
    );
    roster[member.slot] = {
      slot: member.slot,
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
    recordCounters: [...(source.recordCounters ?? Array<number>(75).fill(0))],
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
      recordCounters: Array<number>(75).fill(0),
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
