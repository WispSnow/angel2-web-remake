export type RoadmapTab = "presentation" | "story" | "community";

/**
 * 方向已經可以在遊戲裡開啟時才標：`shipped` 整條做到，`partial` 只做到一部分（說明裡要講清楚
 * 哪一部分還沒有）。沒有標的就是仍在討論的願景。
 */
export type RoadmapStatus = "shipped" | "partial";

export const ROADMAP_STATUS_LABELS: Readonly<Record<RoadmapStatus, string>> = {
  shipped: "已實裝",
  partial: "部分實裝",
};

export interface RoadmapItem {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly status?: RoadmapStatus;
}

/**
 * RoadMap 只記錄可討論的擴展方向，不是實作排程或規則真值。
 *
 * 其中會改變玩法的項目仍須先建立設計合同、規則身份與存檔邊界；把它們列在玩家可見的
 * 願景頁不會繞過 `design/remake-gdd/09-design-acceptance.md` 的凍結門檻。已實裝的條目
 * 改寫成「現在在哪裡開啟、做到了什麼」，不寫版本號或開發經過（07 文檔的面板措辭規則）。
 */
export const ROADMAP_CONTENT: Readonly<Record<RoadmapTab, readonly RoadmapItem[]>> = {
  presentation: [
    {
      // REMAKE-192～198、200、201。
      id: "hd-portraits",
      label: "視覺",
      title: "立繪高清化重製",
      status: "shipped",
      description: "在「開場準備完成」方框或「遊戲功能」選單切換「美術風格　原版／高清」。高清模式下，角色肖像換成重新繪製、"
        + "會呼吸眨眼、說話時自然開合嘴形的動態版；有高清版的劇情插圖換成鋪滿畫面的動態場景，標題畫面、捲動開場、"
        + "結局尾聲與「The end」也有高清動態版。經典點陣肖像完整保留，預設仍為原版；「圖鑑」的角色頁可直接對照兩種肖像。",
    },
    {
      // REMAKE-188～191、199、202。
      id: "ai-voices",
      label: "語音",
      title: "AI 角色配音",
      status: "shipped",
      description: "開啟「劇情語音」後，關前劇情與戰場對白由角色語音讀出，每位角色聲線固定，旁白另有專屬聲音；"
        + "技術喊話、情境台詞、捲動開場與結局尾聲也有語音。劇情仍以文本為準，語音與自動翻頁可在開場方框或"
        + "「音效開關」面板隨時切換，預設關閉。",
    },
    {
      // REMAKE-181、185～187。音效與環境音仍是原版。
      id: "arranged-audio",
      label: "音樂",
      title: "重編音樂與音效包",
      status: "partial",
      description: "「交響」音樂風格已可使用：全部 36 首原曲各有一首交響改編，在開場方框或「音樂開關」面板與原版音軌"
        + "自由切換。環境氛圍音與招式打擊音效的重編仍在規劃中，目前一律使用原版音效。",
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
