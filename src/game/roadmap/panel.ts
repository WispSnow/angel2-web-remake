import { createOverlayPanel, type OverlayTab } from "../overlay/panel";
import { escapeHtml } from "../overlay/markup";
import { ROADMAP_CONTENT, type RoadmapItem, type RoadmapTab } from "./content";

/**
 * 「RoadMap」覆蓋層：展示候選願景與社群入口，不把願景條目誤作已承諾排程。
 *
 * 所有內容都在宿主頁面層，並沿用共用覆蓋層的輸入隔離；它不讀取或修改戰局、存檔與
 * PRNG。QQ 圖片逐字節複製使用者提供的檔案，避免重繪二維碼造成辨識問題。
 */

export const ROADMAP_TABS: readonly OverlayTab<RoadmapTab>[] = [
  { id: "presentation", label: "畫面與聲音", title: "讓經典素材擁有更多可選的現代表現" },
  { id: "story", label: "劇情與玩法", title: "在不改寫原版主線的前提下拓展旅程" },
  { id: "community", label: "Mod 與共創", title: "把規則變體與社群創作放進可追溯的邊界" },
];

function renderItem(item: RoadmapItem): string {
  return `
    <article class="rn-roadmap-item" data-testid="roadmap-item-${escapeHtml(item.id)}">
      <p class="rn-roadmap-label">${escapeHtml(item.label)}</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
    </article>`;
}

function renderTab(tab: RoadmapTab): string {
  return `
    <div class="rn-roadmap">
      <main class="rn-roadmap-main">
        <div class="rn-roadmap-notice" data-testid="roadmap-notice">
          <strong>這是一份開放願景，不是承諾時程。</strong>
          <span>條目會隨證據、可行性與社群意見調整；任何玩法變更都要先有獨立規則與存檔邊界。</span>
        </div>
        <div class="rn-roadmap-grid">
          ${ROADMAP_CONTENT[tab].map(renderItem).join("")}
        </div>
      </main>
      <aside class="rn-roadmap-community" aria-labelledby="roadmap-community-title">
        <p class="rn-roadmap-community-kicker">COMMUNITY</p>
        <h3 id="roadmap-community-title">一起參與復刻版的下一步</h3>
        <p>歡迎分享你最期待的改進、玩法構想、考據線索與測試回饋。</p>
        <div class="rn-roadmap-group-number" data-testid="roadmap-qq-group">
          <span>QQ 交流群</span>
          <strong>1107513111</strong>
        </div>
        <figure class="rn-roadmap-qr">
          <img src="/assets/community/qq-group-1107513111.jpg"
            alt="QQ 交流群 1107513111 二維碼" decoding="async" />
          <figcaption>掃描二維碼加入群聊</figcaption>
        </figure>
      </aside>
    </div>`;
}

const panel = createOverlayPanel<RoadmapTab>({
  testid: "roadmap",
  eyebrow: "RoadMap",
  heading: "《天使帝國 II》Web 復刻版",
  footer: "RoadMap 只描述可討論的候選方向，不代表完成承諾或發布日期。",
  tabs: ROADMAP_TABS,
  render: renderTab,
});

export const openRoadmap = panel.open;
export const closeRoadmap = panel.close;
export const isRoadmapOpen = panel.isOpen;
export const destroyRoadmap = panel.destroy;
