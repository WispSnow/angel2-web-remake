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
      description: "以原版角色辨識度、服裝與色彩為基準製作可選高清立繪包，並保留原版像素肖像作為預設與隨時可切換的選項。",
    },
    {
      id: "ai-voices",
      label: "語音",
      title: "AI 角色配音",
      description: "探索可選的全劇情語音包；逐角色維持聲線一致，公開聲音來源與授權，文字仍是劇情真值，關閉語音不影響流程。",
    },
    {
      id: "arranged-audio",
      label: "音樂",
      title: "重編音樂與音效包",
      description: "在完整保留原版音軌的前提下，嘗試重編戰場音樂、環境聲與招式音效，讓玩家可在原聲與重編版本之間獨立選擇。",
    },
    {
      id: "enhanced-effects",
      label: "演出",
      title: "高解析戰鬥演出",
      description: "為全景戰鬥、魔法與狀態效果製作更細緻的可選演出層；等待節點與結算順序維持一致，不讓畫質選項改變戰果。",
    },
  ],
  story: [
    {
      id: "richer-dialogue",
      label: "人物",
      title: "豐富人物對話",
      description: "增加關前整備、同伴互動與條件式短對話，補足角色關係與戰役旅程；新增台詞會清楚標示為復刻擴寫，不冒充原版文本。",
    },
    {
      id: "side-stories",
      label: "劇情",
      title: "角色支線與挑戰關",
      description: "圍繞重要同伴、敵將與轉職分支設計短篇支線，與原版主戰役分開記錄，避免新內容改寫主線節奏或既有存檔。",
    },
    {
      id: "event-archive",
      label: "收藏",
      title: "劇情與結局回顧",
      description: "在圖鑑之外加入已解鎖事件、插畫、音樂與結局回顧，讓收藏進度來自真實遊玩記錄，也允許玩家再次欣賞完整演出。",
    },
    {
      id: "challenge-rules",
      label: "挑戰",
      title: "周目與自訂挑戰",
      description: "探索新周目、限定職業、固定種子與鐵人等獨立規則組合；每套規則都帶明確身份，不與原版復刻存檔混用。",
    },
  ],
  community: [
    {
      id: "campaign-balance-mods",
      label: "Mod",
      title: "戰役關卡平衡 Mod",
      description: "提供不同敵軍配置、成長曲線與資源壓力的可選方案；原版復刻基線保持不變，Mod 身份與存檔相容性會在開始前明確顯示。",
    },
    {
      id: "stage-editor",
      label: "工具",
      title: "關卡編輯器",
      description: "把地圖、部署、勝負條件、事件與對話整理成可驗證的創作工具，協助社群製作獨立關卡並在匯入前檢查必要資料。",
    },
    {
      id: "mod-platform",
      label: "生態",
      title: "Mod 管理與分享",
      description: "建立版本、依賴、載入順序與內容來源的統一管理介面，讓模組能安全啟用、停用和分享，缺少依賴時也能清楚拒絕載入。",
    },
    {
      id: "localization-accessibility",
      label: "共創",
      title: "翻譯與無障礙擴展",
      description: "逐步開放文本校對、社群翻譯、可重映射輸入與高對比資訊層，擴大可玩人群，同時不改變模擬結果與原版素材預設。",
    },
  ],
};
