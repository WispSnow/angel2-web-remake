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
 * 「複刻說明」覆蓋層：三個規則／表現比較分頁，加上一個非官方同人免責聲明分頁。
 *
 * 資料表型的內容（職業、角色）不在這裡，它們有自己的「圖鑑」入口。覆蓋層本身的行為
 * 與輸入隔離見 `../overlay/panel.ts`。
 */

export type RemakeNotesTab = "fixes" | "features" | "balance" | "disclaimer";
type ComparisonTab = Exclude<RemakeNotesTab, "disclaimer">;

export const REMAKE_NOTES_TABS: readonly OverlayTab<RemakeNotesTab>[] = [
  { id: "fixes", label: "Bug 修復", title: "原版缺陷與複刻修復" },
  { id: "features", label: "功能增強", title: "不改變戰果的資訊、表現與操作增強" },
  { id: "balance", label: "平衡性調整", title: "複刻版的平衡決定" },
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

const panel = createOverlayPanel<RemakeNotesTab>({
  testid: "remake-notes",
  eyebrow: "復刻說明",
  heading: "《天使帝國 II》Web 復刻版",
  footer: "遊戲仍在背後正常進行；本視窗只讀取內容資料，不會改變戰局、存檔或隨機序列。",
  tabs: REMAKE_NOTES_TABS,
  render: (tab) => tab === "disclaimer"
    ? renderDisclaimer(DISCLAIMER_SECTION)
    : renderSection(NOTE_SECTIONS[tab]),
});

export const openRemakeNotes = panel.open;
export const closeRemakeNotes = panel.close;
export const isRemakeNotesOpen = panel.isOpen;
export const destroyRemakeNotes = panel.destroy;
