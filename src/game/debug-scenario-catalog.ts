import type { Difficulty } from "./types";

export interface DebugScenarioDefinition {
  id: string;
  stageId: "stage-00" | "stage-01" | "stage-02";
  stageLabel: string;
  title: string;
  phase: string;
  description: string;
  fixture?: boolean;
}

export const DEBUG_SCENARIOS = [
  {
    id: "stage-00-prebattle",
    stageId: "stage-00",
    stageLabel: "第 0 關 · 瓦爾克麗宮",
    title: "關前劇情",
    phase: "SAY/0000",
    description: "從本關最初狀態開始，保留劇情、腳本移動和開戰對白。",
  },
  {
    id: "stage-00-player",
    stageId: "stage-00",
    stageLabel: "第 0 關 · 瓦爾克麗宮",
    title: "玩家回合",
    phase: "Round 1",
    description: "跳過關前演出，直接進入完整初始戰場的玩家階段。",
  },
  {
    id: "stage-00-near-victory",
    stageId: "stage-00",
    stageLabel: "第 0 關 · 瓦爾克麗宮",
    title: "一擊勝利",
    phase: "Victory setup",
    description: "只保留 1 點生命的最後敵人，攻擊一次即可驗證勝利流程。",
    fixture: true,
  },
  {
    id: "stage-00-cleared",
    stageId: "stage-00",
    stageLabel: "第 0 關 · 瓦爾克麗宮",
    title: "直接通關",
    phase: "Route to stage 1",
    description: "視為第 0 關已經完成，直接進入第 1 關關前劇情。",
    fixture: true,
  },
  {
    id: "stage-01-prebattle",
    stageId: "stage-01",
    stageLabel: "第 1 關 · 騎士城堡前",
    title: "關前劇情",
    phase: "SAY/0004",
    description: "以完整戰役 roster 進入第 1 關關前劇情。",
  },
  {
    id: "stage-01-deployment",
    stageId: "stage-01",
    stageLabel: "第 1 關 · 騎士城堡前",
    title: "部署",
    phase: "5/8 initial",
    description: "直接開啟正式部署介面，保留固定、可選、空位和錯誤規則。",
  },
  {
    id: "stage-01-player",
    stageId: "stage-01",
    stageLabel: "第 1 關 · 騎士城堡前",
    title: "玩家回合",
    phase: "Round 1",
    description: "用六人編隊直接開戰，葛蒂拉斯已經部署。",
  },
  {
    id: "stage-01-magician",
    stageId: "stage-01",
    stageLabel: "第 1 關 · 騎士城堡前",
    title: "魔術士技能靶場",
    phase: "1F / 1L / 1C",
    description: "把施法者和追擊型敵兵放到合法位置，可驗證冰封只跳過一次敵方行動。",
    fixture: true,
  },
  {
    id: "stage-01-enemy-sister",
    stageId: "stage-01",
    stageLabel: "第 1 關 · 騎士城堡前",
    title: "敵方修女範圍",
    phase: "Unified range 5",
    description: "敵方修女位於統一炎暴範圍 5 的邊界，結束回合即可觀察施法。",
    fixture: true,
  },
  {
    id: "stage-01-near-victory",
    stageId: "stage-01",
    stageLabel: "第 1 關 · 騎士城堡前",
    title: "一擊擊敗芳",
    phase: "Victory 999",
    description: "芳只剩 1 點生命且位於妮雅身邊，攻擊一次進入傳令兵流程。",
    fixture: true,
  },
  {
    id: "stage-01-cleared",
    stageId: "stage-02",
    stageLabel: "第 1 關完成",
    title: "直接通關",
    phase: "Route to stage 2",
    description: "視為第 1 關已經完成，直接查看 stage-02 凍結邊界。",
    fixture: true,
  },
] as const satisfies readonly DebugScenarioDefinition[];

export type DebugScenarioId = typeof DEBUG_SCENARIOS[number]["id"];

export function isDebugScenarioId(value: unknown): value is DebugScenarioId {
  return typeof value === "string"
    && DEBUG_SCENARIOS.some(({ id }) => id === value);
}

export function debugScenarioUrl(id: DebugScenarioId, difficulty: Difficulty): string {
  const parameters = new URLSearchParams({ debugScenario: id, difficulty: String(difficulty) });
  return `/?${parameters.toString()}`;
}
