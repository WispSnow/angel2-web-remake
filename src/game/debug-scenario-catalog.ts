import type { Difficulty } from "./types";

export interface DebugScenarioDefinition {
  id: string;
  stageId: "stage-00" | "stage-01" | "stage-02" | "stage-03";
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
    description: "追擊型敵兵位於冰雪最外圈，可驗證只冰封不外推，並只跳過一次敵方行動。",
    fixture: true,
  },
  {
    id: "stage-01-dispel",
    stageId: "stage-01",
    stageLabel: "第 1 關 · 騎士城堡前",
    title: "冰封／破邪靶場",
    phase: "TR / REMAKE-013",
    description: "魔祭師可對相鄰冰封友軍施展破邪，驗證攻擊／治療不可選與演出後解封。",
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
    description: "視為第 1 關已經完成，直接進入第 2 關開場事件。",
    fixture: true,
  },
  {
    id: "stage-02-prebattle",
    stageId: "stage-02",
    stageLabel: "第 2 關 · 救援友軍",
    title: "關前／開場敘事",
    phase: "SAY/0155",
    description: "由第 1 關完成 roster 建立固定戰場，保留第 1 回合開場敘事。",
  },
  {
    id: "stage-02-preparation",
    stageId: "stage-02",
    stageLabel: "第 2 關 · 救援友軍",
    title: "固定編隊準備",
    phase: "Fixed 9 vs 5",
    description: "顯示完整固定陣容與自動友軍標記；本關沒有交互部署。",
  },
  {
    id: "stage-02-player",
    stageId: "stage-02",
    stageLabel: "第 2 關 · 救援友軍",
    title: "玩家回合",
    phase: "Round 1",
    description: "跳過開場敘事，直接驗證三名手動角色與六名自動友軍。",
  },
  {
    id: "stage-02-near-victory",
    stageId: "stage-02",
    stageLabel: "第 2 關 · 救援友軍",
    title: "一擊擊敗蘭",
    phase: "Victory 999",
    description: "蘭只剩 1 點生命且位於妮雅身邊，攻擊一次進入 SAY/0175。",
    fixture: true,
  },
  {
    id: "stage-02-cleared",
    stageId: "stage-03",
    stageLabel: "第 2 關完成",
    title: "完成路由",
    phase: "Route to stage 3",
    description: "視為第 2 關已完成，直接進入第 3 關開場事件。",
    fixture: true,
  },
  {
    id: "stage-03-prebattle",
    stageId: "stage-03",
    stageLabel: "第 3 關 · 通過力場",
    title: "關前／開場敘事",
    phase: "SAY/0012",
    description: "由第 2 關完成 roster 建立固定戰場，保留希蜜與第四軍團會合敘事。",
  },
  {
    id: "stage-03-preparation",
    stageId: "stage-03",
    stageLabel: "第 3 關 · 通過力場",
    title: "固定編隊準備",
    phase: "Fixed 13 vs 12",
    description: "顯示完整固定陣容、黛西領隊與跟隨者；本關沒有交互部署。",
  },
  {
    id: "stage-03-player",
    stageId: "stage-03",
    stageLabel: "第 3 關 · 通過力場",
    title: "玩家回合",
    phase: "Round 1",
    description: "跳過開場敘事，直接驗證希蜜軍團與第四軍團的手動／自動分工。",
  },
  {
    id: "stage-03-near-victory",
    stageId: "stage-03",
    stageLabel: "第 3 關 · 通過力場",
    title: "一擊擊敗莎",
    phase: "Victory 999",
    description: "莎只剩 1 點生命且位於可控主將身邊，攻擊一次進入 SAY/0013。",
    fixture: true,
  },
  {
    id: "stage-03-cleared",
    stageId: "stage-03",
    stageLabel: "第 3 關完成",
    title: "完成路由",
    phase: "Route to stage 4",
    description: "視為第 3 關已完成，直接查看 stage-04 凍結邊界。",
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
