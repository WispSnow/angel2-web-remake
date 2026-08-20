import {
  CHARACTER_CATALOG,
  type CharacterCatalogEntry,
  type CharacterId,
  type CharacterStageRole,
} from "../content/character-catalog.generated";
import { CHARACTER_NOTES } from "./character-notes";
import { PORTRAIT_CATALOG } from "../content/portrait-catalog.generated";
import { STAGE_INDEX } from "../content/stage-index";
import type { StageId } from "../types";

/**
 * 角色圖鑑的視圖模型。
 *
 * 身分、名冊槽與出場關卡全部來自 `character-catalog.generated.ts`，它由原版角色描述子
 * 表、關卡模板、逐關事件處理器與對白語料生成，所以圖鑑不會和實際關卡編成分家。這裡
 * 只做三件生成器做不了的事：把原版關卡編號翻成玩家看得到的關卡序數與名稱、決定分組
 * 與排序、把策展的簡介接上去。
 */

export type CharacterGroupId = "player" | "defector" | "enemy" | "story";

export interface CharacterStageEntry {
  readonly stage: number;
  /** 玩家看得到的關卡序數；結局沒有序數。 */
  readonly ordinal: number | null;
  readonly label: string;
  readonly roles: readonly CharacterStageRole[];
  readonly classNames: readonly string[];
  readonly mustSurvive: boolean;
  readonly objective: boolean;
  readonly escort: boolean;
}

export interface CharacterEntry {
  readonly id: CharacterId;
  readonly name: string;
  readonly group: CharacterGroupId;
  readonly portraitRecord: number | null;
  readonly portrait: string | null;
  readonly allySlot: number | null;
  readonly enemySlot: number | null;
  readonly note: string | null;
  readonly stages: readonly CharacterStageEntry[];
  /** 首次登場的關卡，供索引排序與摘要使用。 */
  readonly firstStage: CharacterStageEntry;
}

export const CHARACTER_GROUP_LABELS: Readonly<Record<CharacterGroupId, string>> = {
  player: "我方",
  defector: "曾經敵對",
  enemy: "敵方",
  story: "只在劇情中",
};

export const CHARACTER_ROLE_LABELS: Readonly<Record<CharacterStageRole, string>> = {
  board: "開場在場",
  scripted: "戰鬥中登場",
  roster: "名單候選",
  story: "對白登場",
};

/** 原版結局沒有關卡序數，但它是玩家真的會看到的一段演出，所以照樣列進出場表。 */
const ENDING_STAGE = 49;
const ENDING_LABEL = "結局";

const stageIdFor = (stage: number): StageId | null => {
  const id = `stage-${String(stage).padStart(2, "0")}`;
  if (id === "stage-42") return "stage-42-portal";
  return id in STAGE_INDEX ? id as StageId : null;
};

function stageEntry(
  appearance: CharacterCatalogEntry["appearances"][number],
): CharacterStageEntry {
  const { stage, roles } = appearance;
  const shared = {
    stage,
    roles,
    classNames: appearance.classNames ?? [],
    mustSurvive: appearance.mustSurvive ?? false,
    objective: appearance.objective ?? false,
    escort: appearance.escort ?? false,
  };
  if (stage === ENDING_STAGE) return { ...shared, ordinal: null, label: ENDING_LABEL };
  const stageId = stageIdFor(stage);
  if (!stageId) throw new Error(`character catalog references unimplemented stage ${stage}`);
  const { ordinal, label } = STAGE_INDEX[stageId];
  return { ...shared, ordinal, label };
}

/**
 * 分組看的是「玩家會在哪一側見到這個角色」，不是勝負條件：兩側都有描述子的角色（葛蒂
 * 拉斯、維絲塔、汀塔琪、萊茵與七姊妹）在劇情中換過陣營，單獨成組比塞進任何一側誠實。
 */
function groupOf(entry: CharacterCatalogEntry): CharacterGroupId {
  const onBoard = entry.appearances.some(({ roles }) =>
    roles.some((role) => role !== "story"));
  if (!onBoard) return "story";
  if (entry.allySlot !== null && entry.enemySlot !== null) return "defector";
  return entry.allySlot !== null ? "player" : "enemy";
}

const GROUP_ORDER: readonly CharacterGroupId[] = ["player", "defector", "enemy", "story"];

function buildEntry(entry: CharacterCatalogEntry): CharacterEntry {
  const stages = entry.appearances.map(stageEntry);
  const first = stages[0];
  if (!first) throw new Error(`${entry.id} has no stage appearance`);
  const portrait = entry.portraitRecord === null
    ? null
    : PORTRAIT_CATALOG[String(entry.portraitRecord) as keyof typeof PORTRAIT_CATALOG]
      ?.source ?? null;
  return {
    id: entry.id,
    name: entry.name,
    group: groupOf(entry),
    portraitRecord: entry.portraitRecord,
    portrait,
    allySlot: entry.allySlot,
    enemySlot: entry.enemySlot,
    note: CHARACTER_NOTES[entry.id] ?? null,
    stages,
    firstStage: first,
  };
}

const ENTRIES: readonly CharacterEntry[] = CHARACTER_CATALOG.map(buildEntry);

const stageOrder = (entry: CharacterEntry): number =>
  entry.firstStage.ordinal ?? Number.MAX_SAFE_INTEGER;

/** 索引先按陣營分組，組內按首次登場的關卡排序，同關再按原版名冊槽順序。 */
export const CHARACTER_GROUPS: readonly {
  readonly id: CharacterGroupId;
  readonly entries: readonly CharacterEntry[];
}[] = GROUP_ORDER.map((id) => ({
  id,
  entries: ENTRIES
    .filter((entry) => entry.group === id)
    .sort((left, right) => stageOrder(left) - stageOrder(right)
      || (left.allySlot ?? left.enemySlot ?? 0) - (right.allySlot ?? right.enemySlot ?? 0)),
})).filter((group) => group.entries.length > 0);

const BY_ID = new Map(ENTRIES.map((entry) => [entry.id, entry] as const));

export function characterEntry(id: CharacterId): CharacterEntry {
  const entry = BY_ID.get(id);
  if (!entry) throw new Error(`unknown compendium character ${id}`);
  return entry;
}

export function isCharacterId(value: string | undefined): value is CharacterId {
  return value !== undefined && BY_ID.has(value as CharacterId);
}

export const COMPENDIUM_DEFAULT_CHARACTER_ID: CharacterId = ENTRIES[0].id;
