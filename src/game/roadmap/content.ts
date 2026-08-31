export type RoadmapTab = "presentation" | "story" | "community";

export interface RoadmapItem {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly description: string;
}

/**
 * RoadMap 只記錄可討論的擴展方向，不是實作排程或規則真值。
 *
 * 其中會改變玩法的項目仍須先建立設計合同、規則身份與存檔邊界；把它們列在玩家可見的
 * 願景頁不會繞過 `design/remake-gdd/09-design-acceptance.md` 的凍結門檻。
 */
export const ROADMAP_CONTENT: Readonly<Record<RoadmapTab, readonly RoadmapItem[]>> = {
  presentation: [
    {
      id: "hd-portraits",
      label: "視覺",
      title: "立繪高清化重製",
      description: "以原版角色的辨識特徵、服飾細節與經典色彩為基準，繪製可選的高清角色立繪包；同時完整保留經典點陣像素肖像，支援玩家隨時自由切換。",
    },
    {
      id: "ai-voices",
      label: "語音",
      title: "AI 角色配音",
      description: "探索為全劇情實裝角色專屬配音的可行性；保持每位角色聲線風格的統一與貼合，劇情依然以文本為準，語音支援獨立開關且不影響遊戲節奏。",
    },
    {
      id: "arranged-audio",
      label: "音樂",
      title: "重編音樂與音效包",
      description: "在原汁原味保留原版經典音軌的基礎上，嘗試重編戰場配樂、環境氛圍音與招式打擊音效，方便玩家在原版經典音軌與現代重編音效間自由選擇。",
    },
    {
      id: "enhanced-effects",
      label: "演出",
      title: "高解析戰鬥演出",
      description: "為全屏對決、法術技能與狀態效果製作更加細膩流暢的可選特效圖層；嚴格保持傷害結算時機與隨機序列一致，視覺提升絕不影響戰鬥數值。",
    },
  ],
  story: [
    {
      id: "richer-dialogue",
      label: "人物",
      title: "豐富人物對話",
      description: "在戰前整備、陣營休整與特定戰鬥情境中追加同伴間的趣味互動與細節對話，深化角色性格與彼此羈絆；新增內容均有清晰標註，尊重原作精神。",
    },
    {
      id: "side-stories",
      label: "劇情",
      title: "角色支線與挑戰關",
      description: "圍繞主要同伴、特色敵將與轉職分支設計獨立的精簡短篇支線，與主線戰役存檔分開記錄，在豐富世界觀的同時不打亂原作主線節奏。",
    },
    {
      id: "event-archive",
      label: "收藏",
      title: "劇情與結局回顧",
      description: "在圖鑑之外增設已解鎖劇情事件、插畫、音樂與多結局回顧鑒賞室，記錄玩家在戰役中的每一次突破與經典回憶，隨時重溫精彩演出。",
    },
    {
      id: "challenge-rules",
      label: "挑戰",
      title: "周目與自訂挑戰",
      description: "探索多周目繼承、限定職業通關、固定隨機數種子以及鐵人模式等自訂規則玩法；各挑戰模式配有獨立存檔標識，不干擾常規通關記錄。",
    },
  ],
  community: [
    {
      id: "campaign-balance-mods",
      label: "Mod",
      title: "戰役關卡平衡 Mod",
      description: "支援社群創作的多樣化敵軍配置、全新成長曲線與難度挑戰模組；官方復刻基線始終保持純粹，模組載入前會進行清晰相容性提示與備份。",
    },
    {
      id: "stage-editor",
      label: "工具",
      title: "關卡編輯器",
      description: "將地圖繪製、單位部署、勝負條件判定、回合事件與對話腳本整理為可視化創作工具，協助同好社群輕鬆打造專屬自製關卡與劇本。",
    },
    {
      id: "mod-platform",
      label: "生態",
      title: "Mod 管理與分享",
      description: "建立版本校驗、依賴管理、載入排序與安全沙箱等一體化管理介面，讓模組能夠一鍵安全啟用、停用與社群分享，保障存檔安全。",
    },
    {
      id: "localization-accessibility",
      label: "共創",
      title: "翻譯與無障礙擴展",
      description: "開放多語言文本校對、自訂鍵位映射、高對比度介面與無障礙讀屏支援，讓更多玩家無障礙體驗經典之作，底層機制始終保持一致。",
    },
  ],
};
