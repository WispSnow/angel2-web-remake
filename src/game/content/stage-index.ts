import type { StageId } from "../types";

/**
 * 关卡的玩家可见身份：出场序数与标题。
 *
 * 单独成一个模块，是为了让只需要「第几关、叫什么」的表面（例如角色图鉴）不必把
 * `stage-runtime.ts` 连同整条模拟链一起拉进包里。运行时清单直接展开本表，两边不会
 * 各存一份关卡名；`character-compendium.test.ts` 另外断言两者逐关一致。
 *
 * 序数不等于原版关卡编号：原版第 10、11 关在战役路线上互换，第 25 关被跳过，
 * 异世界之门插曲与第 5 关共用序数 5。
 */
export interface StageIndexEntry {
  id: StageId;
  ordinal: number;
  label: string;
}

export const STAGE_INDEX = {
  "stage-00": { id: "stage-00", ordinal: 0, label: "瓦爾克麗宮" },
  "stage-01": { id: "stage-01", ordinal: 1, label: "騎士城堡前" },
  "stage-02": { id: "stage-02", ordinal: 2, label: "攻打騎士堡" },
  "stage-03": { id: "stage-03", ordinal: 3, label: "救援友軍" },
  "stage-04": { id: "stage-04", ordinal: 4, label: "通過力場" },
  "stage-05": { id: "stage-05", ordinal: 5, label: "遭遇丁塔琪" },
  "stage-42-portal": { id: "stage-42-portal", ordinal: 5, label: "異世界之門" },
  "stage-06": { id: "stage-06", ordinal: 6, label: "過異世界之門" },
  "stage-07": { id: "stage-07", ordinal: 7, label: "來到異世界" },
  "stage-08": { id: "stage-08", ordinal: 8, label: "營地遭到偷襲" },
  "stage-09": { id: "stage-09", ordinal: 9, label: "找尋傳說中的飛船" },
  "stage-11": { id: "stage-11", ordinal: 10, label: "拯救蘇蘭達" },
  "stage-10": { id: "stage-10", ordinal: 11, label: "飛船上遭遇敵人" },
  "stage-12": { id: "stage-12", ordinal: 12, label: "落入沼澤" },
  "stage-13": { id: "stage-13", ordinal: 13, label: "龍塔外" },
  "stage-14": { id: "stage-14", ordinal: 14, label: "龍塔第一層" },
  "stage-15": { id: "stage-15", ordinal: 15, label: "龍塔第二層" },
  "stage-16": { id: "stage-16", ordinal: 16, label: "龍塔第三層" },
  "stage-17": { id: "stage-17", ordinal: 17, label: "龍塔第四層" },
  "stage-18": { id: "stage-18", ordinal: 18, label: "龍塔第五層" },
  "stage-19": { id: "stage-19", ordinal: 19, label: "龍塔第六層" },
  "stage-20": { id: "stage-20", ordinal: 20, label: "龍塔頂部" },
  "stage-21": { id: "stage-21", ordinal: 21, label: "焦土森林村莊外" },
  "stage-22": { id: "stage-22", ordinal: 22, label: "焦土森林村莊中" },
  "stage-23": { id: "stage-23", ordinal: 23, label: "死亡之谷中" },
  "stage-24": { id: "stage-24", ordinal: 24, label: "死亡之谷城堡前" },
  "stage-26": { id: "stage-26", ordinal: 25, label: "遭遇碧娜維姬" },
  "stage-27": { id: "stage-27", ordinal: 26, label: "趕回瓦爾克麗城" },
  "stage-28": { id: "stage-28", ordinal: 27, label: "保衛瓦爾克麗城" },
  "stage-29": { id: "stage-29", ordinal: 28, label: "騎士城堡前" },
  "stage-30": { id: "stage-30", ordinal: 29, label: "治癒維斯塔女帝" },
  "stage-31": { id: "stage-31", ordinal: 30, label: "前往斯德林海峽" },
  "stage-32": { id: "stage-32", ordinal: 31, label: "斯德林海峽" },
  "stage-33": { id: "stage-33", ordinal: 32, label: "拉那洛城外" },
  "stage-34": { id: "stage-34", ordinal: 33, label: "拉那洛城內" },
  "stage-35": { id: "stage-35", ordinal: 34, label: "時空異變" },
  "stage-36": { id: "stage-36", ordinal: 35, label: "異世界的碧娜維姬" },
  "stage-37": { id: "stage-37", ordinal: 36, label: "究極女神" },
  "stage-38": { id: "stage-38", ordinal: 37, label: "異世界" },
} as const satisfies Readonly<Record<StageId, StageIndexEntry>>;
