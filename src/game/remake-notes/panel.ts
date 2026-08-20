import {
  BALANCE_SECTION,
  BUG_FIX_SECTION,
  DISCLAIMER_SECTION,
  FEATURE_SECTION,
  type DisclaimerSection,
  type RemakeNote,
  type RemakeNoteSection,
} from "./notes-content";
import { createOverlayPanel, type OverlayTab } from "../overlay/panel";
import { escapeHtml, inlineMarkup } from "../overlay/markup";

/**
 * 「複刻說明」覆蓋層：三個規則／表現比較分頁、操作說明，加上一個非官方同人免責聲明分頁。
 *
 * 資料表型的內容（職業、角色）不在這裡，它們有自己的「圖鑑」入口。覆蓋層本身的行為
 * 與輸入隔離見 `../overlay/panel.ts`。
 */

export type RemakeNotesTab = "fixes" | "features" | "balance" | "controls" | "disclaimer";
type ComparisonTab = Exclude<RemakeNotesTab, "controls" | "disclaimer">;

export const REMAKE_NOTES_TABS: readonly OverlayTab<RemakeNotesTab>[] = [
  { id: "fixes", label: "Bug 修復", title: "原版缺陷與複刻修復" },
  { id: "features", label: "功能增強", title: "不改變戰果的資訊、表現與操作增強" },
  { id: "balance", label: "平衡性調整", title: "複刻版的平衡決定" },
  { id: "controls", label: "操作說明", title: "鍵盤、滑鼠與標準手把操作" },
  { id: "disclaimer", label: "免責聲明", title: "非官方同人復刻的權利、用途與聯絡說明" },
];

const NOTE_SECTIONS: Readonly<Record<ComparisonTab, RemakeNoteSection>> = {
  fixes: BUG_FIX_SECTION,
  features: FEATURE_SECTION,
  balance: BALANCE_SECTION,
};

function renderNote(note: RemakeNote): string {
  const row = (term: string, value: string | undefined): string => value
    ? `<div><dt>${escapeHtml(term)}</dt><dd>${inlineMarkup(value)}</dd></div>`
    : "";
  // 標題只做 HTML 轉義，不走行內標記：標題不接受反引號或 `**`，寫了只會原樣印在畫面上。
  // 沒有決定編號的顯示增強不畫徽章：發行版不附決定記錄，玩家查不到那個編號。
  const badge = note.badge === false
    ? ""
    : `<span class="rn-note-id">${escapeHtml(note.id)}</span>`;
  return `
    <article class="rn-note" data-testid="remake-note-${note.slug ?? note.id}">
      <header>
        ${badge}
        <h4>${escapeHtml(note.title)}</h4>
        <span class="rn-note-tags">${note.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</span>
      </header>
      <dl>
        ${row("原版", note.original)}
        ${row("複刻", note.remake)}
        ${row("影響", note.impact)}
      </dl>
    </article>`;
}

function renderSection({ intro, groups }: RemakeNoteSection): string {
  const total = groups.reduce((count, group) => count + group.notes.length, 0);
  const sections = groups.map((group) => `
    <section class="rn-group" data-testid="remake-group-${group.id}">
      <h3>${escapeHtml(group.title)}<span>${escapeHtml(group.summary)}</span></h3>
      ${group.notes.map(renderNote).join("")}
    </section>`).join("");
  return `
    <p class="rn-intro">${inlineMarkup(intro)}</p>
    <p class="rn-count">共 ${total} 條。</p>
    ${sections}`;
}

function renderDisclaimer({ intro, labels, items, closing }: DisclaimerSection): string {
  return `
    <section class="rn-disclaimer" data-testid="remake-disclaimer">
      <header class="rn-disclaimer-lead">
        <p>${inlineMarkup(intro)}</p>
        <div class="rn-disclaimer-labels" aria-label="作品性質">
          ${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
        </div>
      </header>
      <div class="rn-disclaimer-grid">
        ${items.map((item) => `
          <article class="rn-disclaimer-item"
            data-testid="remake-disclaimer-${escapeHtml(item.id)}">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${inlineMarkup(item.body)}</p>
          </article>`).join("")}
      </div>
      <p class="rn-disclaimer-closing">${inlineMarkup(closing)}</p>
    </section>`;
}

function renderKeys(keys: readonly string[]): string {
  return `<span class="rn-control-keys">${keys.map((key) =>
    `<kbd>${escapeHtml(key)}</kbd>`).join("")}</span>`;
}

function renderControlRows(rows: ReadonlyArray<{
  keys: readonly string[];
  action: string;
  detail?: string;
}>): string {
  return rows.map(({ keys, action, detail }) => `
    <div class="rn-control-row">
      ${renderKeys(keys)}
      <p><strong>${escapeHtml(action)}</strong>${detail
        ? `<span>${escapeHtml(detail)}</span>`
        : ""}</p>
    </div>`).join("");
}

function renderControls(): string {
  return `
    <section class="rn-controls" data-testid="remake-controls">
      <p class="rn-controls-lead">核心鍵位採用現代電腦遊戲的常見配置；相同按鍵在戰場、選單與對話中都保持同一語意。</p>
      <div class="rn-controls-grid">
        <article class="rn-control-card is-keyboard">
          <header><span>KEYBOARD</span><h3>鍵盤</h3></header>
          <div class="rn-control-list">
            ${renderControlRows([
              { keys: ["方向鍵", "WASD"], action: "移動焦點／選單選擇", detail: "戰場游標、選單與目標共用" },
              { keys: ["Enter", "Space"], action: "確認／主操作", detail: "選擇單位、動作、目標，或推進對話" },
              { keys: ["Esc", "Backspace"], action: "取消／返回", detail: "中性戰場按 Esc 開啟系統選單" },
              { keys: ["Tab"], action: "下一名待行動角色", detail: "部署畫面改為切換名單與地圖落點" },
              { keys: ["G"], action: "集體命令", detail: "再按一次關閉" },
              { keys: ["O"], action: "勝利／失敗條件", detail: "再按一次關閉" },
            ])}
          </div>
        </article>
        <article class="rn-control-card">
          <header><span>MOUSE</span><h3>滑鼠</h3></header>
          <div class="rn-control-list">
            ${renderControlRows([
              { keys: ["左鍵"], action: "選擇／確認" },
              { keys: ["右鍵"], action: "取消／返回", detail: "中性戰場改為對焦下一名待行動角色" },
              { keys: ["滾輪"], action: "切換魔弓完整箭道", detail: "只在箭道預覽時生效" },
              { keys: ["畫面邊緣"], action: "捲動地圖", detail: "停留可連續捲動" },
            ])}
          </div>
        </article>
        <article class="rn-control-card">
          <header><span>GAMEPAD</span><h3>標準手把</h3></header>
          <p class="rn-control-note">部署與戰場支援瀏覽器辨識為 Standard Gamepad 的手把；按鍵名稱以 Xbox 佈局為例。</p>
          <div class="rn-control-list">
            ${renderControlRows([
              { keys: ["左搖桿", "方向鍵"], action: "移動焦點／選單選擇" },
              { keys: ["A"], action: "確認／主操作" },
              { keys: ["B"], action: "取消／返回" },
              { keys: ["Menu", "Start"], action: "系統選單" },
              { keys: ["Y"], action: "集體命令" },
              { keys: ["View", "LB"], action: "勝利／失敗條件" },
              { keys: ["RB"], action: "下一名待行動角色", detail: "部署畫面的 LB／RB 切換地圖與名單" },
            ])}
          </div>
        </article>
        <article class="rn-control-card is-legacy">
          <header><span>SHORTCUTS</span><h3>快捷與相容鍵</h3></header>
          <div class="rn-control-list">
            ${renderControlRows([
              { keys: ["Q", "E"], action: "切換魔弓箭道", detail: "箭道預覽時" },
              { keys: ["E", "M"], action: "音效／音樂面板", detail: "中性戰場時" },
              { keys: ["F1–F4"], action: "直接執行四項集體命令" },
              { keys: ["Ctrl", "Insert"], action: "原版相容確認" },
              { keys: ["Alt", "Delete"], action: "原版相容取消" },
            ])}
          </div>
        </article>
      </div>
    </section>`;
}

const panel = createOverlayPanel<RemakeNotesTab>({
  testid: "remake-notes",
  eyebrow: "復刻說明",
  heading: "《天使帝國 II》Web 復刻版",
  footer: "遊戲仍在背後正常進行；本視窗只讀取內容資料，不會改變戰局、存檔或隨機序列。",
  tabs: REMAKE_NOTES_TABS,
  render: (tab) => tab === "disclaimer"
    ? renderDisclaimer(DISCLAIMER_SECTION)
    : tab === "controls"
      ? renderControls()
      : renderSection(NOTE_SECTIONS[tab]),
});

export const openRemakeNotes = panel.open;
export const closeRemakeNotes = panel.close;
export const isRemakeNotesOpen = panel.isOpen;
export const destroyRemakeNotes = panel.destroy;
