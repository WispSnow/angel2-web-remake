import "../../remake-notes.css";
import {
  BALANCE_SECTION,
  BUG_FIX_SECTION,
  FEATURE_SECTION,
  type RemakeNote,
  type RemakeNoteSection,
} from "./notes-content";
import { COMPENDIUM_DEFAULT_CLASS_ID } from "./class-compendium";
import { renderClassDetail, renderClassIndex } from "./compendium-view";
import { escapeHtml, inlineMarkup } from "./markup";
import { isClassId, type ClassId } from "../content/classes";

/**
 * 「複刻說明」覆蓋層。
 *
 * 它是宿主頁面的附屬介面，和「畫面縮放」一樣刻意留在 640×350 邏輯螢幕之外：原版沒有
 * 這個畫面，把它畫進邏輯螢幕會偽造構圖證據。覆蓋層不暫停、不查詢、也不修改任何模擬
 * 狀態——底下的戰鬥照常跑完敵方階段，關掉之後玩家回到原本的局面。
 *
 * 唯一需要隔離的是輸入：`ui.ts`、`startup.ts` 與結局畫面都把 `keydown` 綁在 `window`
 * 上，未攔截的按鍵會在玩家只是翻閱說明時移動戰場游標，所以覆蓋層內的按鍵一律停在這裡。
 */

export type RemakeNotesTab = "fixes" | "features" | "balance" | "classes";

interface TabDefinition {
  readonly id: RemakeNotesTab;
  readonly label: string;
  readonly title: string;
}

export const REMAKE_NOTES_TABS: readonly TabDefinition[] = [
  { id: "fixes", label: "Bug 修復", title: "原版缺陷與複刻修復" },
  { id: "features", label: "功能增強", title: "不改變戰果的資訊、表現與操作增強" },
  { id: "balance", label: "平衡性調整", title: "複刻版的平衡決定" },
  { id: "classes", label: "職業圖鑑", title: "全 39 個職業的屬性、成長與特性" },
];

/** 只有敘述型分頁有 `RemakeNoteSection`；「職業圖鑑」由生成目錄自己派生。 */
const NOTE_SECTIONS: Partial<Record<RemakeNotesTab, RemakeNoteSection>> = {
  fixes: BUG_FIX_SECTION,
  features: FEATURE_SECTION,
  balance: BALANCE_SECTION,
};

function isRemakeNotesTab(value: string | undefined): value is RemakeNotesTab {
  return REMAKE_NOTES_TABS.some((tab) => tab.id === value);
}

interface PanelHandles {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  readonly subtitle: HTMLElement;
  readonly events: AbortController;
}

let panel: PanelHandles | undefined;
let activeTab: RemakeNotesTab = "fixes";
let selectedClassId: ClassId = COMPENDIUM_DEFAULT_CLASS_ID;
let previouslyFocused: HTMLElement | undefined;

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

function renderCompendium(): string {
  return `
    <div class="rn-compendium">
      <nav class="rn-class-index" aria-label="職業轉職樹" data-testid="compendium-index">
        ${renderClassIndex(selectedClassId)}
      </nav>
      <div class="rn-class-detail" data-testid="compendium-detail" tabindex="-1">
        ${renderClassDetail(selectedClassId)}
      </div>
    </div>`;
}

function renderBody(): void {
  if (!panel) return;
  const tab = REMAKE_NOTES_TABS.find((definition) => definition.id === activeTab);
  panel.subtitle.textContent = tab?.title ?? "";
  panel.body.dataset.tab = activeTab;
  const section = NOTE_SECTIONS[activeTab];
  panel.body.innerHTML = section ? renderSection(section) : renderCompendium();
  panel.body.scrollTop = 0;
  for (const button of panel.root.querySelectorAll<HTMLButtonElement>("[data-notes-tab]")) {
    const selected = button.dataset.notesTab === activeTab;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
}

function selectClass(id: ClassId): void {
  if (!panel || selectedClassId === id) return;
  selectedClassId = id;
  const index = panel.body.querySelector<HTMLElement>(".rn-class-index");
  const detail = panel.body.querySelector<HTMLElement>(".rn-class-detail");
  if (!index || !detail) return;
  index.innerHTML = renderClassIndex(selectedClassId);
  detail.innerHTML = renderClassDetail(selectedClassId);
  detail.scrollTop = 0;
  index.querySelector<HTMLElement>('[aria-current="true"]')
    ?.scrollIntoView({ block: "nearest" });
}

function buildPanel(): PanelHandles {
  const root = document.createElement("div");
  root.className = "rn-overlay";
  root.dataset.testid = "remake-notes";
  root.innerHTML = `
    <div class="rn-scrim" data-notes-dismiss></div>
    <section class="rn-dialog" role="dialog" aria-modal="true" aria-labelledby="rn-title" tabindex="-1">
      <header class="rn-head">
        <div>
          <p class="rn-eyebrow">復刻說明</p>
          <h2 id="rn-title">《天使帝國 II》Web 復刻版</h2>
          <p class="rn-subtitle" data-testid="remake-notes-subtitle"></p>
        </div>
        <button type="button" class="rn-close" data-notes-dismiss data-testid="remake-notes-close"
          aria-label="關閉復刻說明">✕</button>
      </header>
      <div class="rn-tabs" role="tablist" aria-label="復刻說明分頁" data-testid="remake-notes-tabs">
        ${REMAKE_NOTES_TABS.map((tab) => `
          <button type="button" role="tab" data-notes-tab="${tab.id}"
            data-testid="remake-notes-tab-${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}
      </div>
      <div class="rn-body" data-testid="remake-notes-body"></div>
      <footer class="rn-foot">
        遊戲仍在背後正常進行；本視窗只讀取內容資料，不會改變戰局、存檔或隨機序列。
      </footer>
    </section>`;
  document.body.appendChild(root);

  const dialog = root.querySelector<HTMLElement>(".rn-dialog");
  const body = root.querySelector<HTMLElement>(".rn-body");
  const subtitle = root.querySelector<HTMLElement>(".rn-subtitle");
  if (!dialog || !body || !subtitle) throw new Error("remake notes panel failed to build");

  const events = new AbortController();
  const { signal } = events;

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-notes-dismiss]")) {
      closeRemakeNotes();
      return;
    }
    const tab = target?.closest<HTMLElement>("[data-notes-tab]")?.dataset.notesTab;
    if (isRemakeNotesTab(tab)) {
      activeTab = tab;
      renderBody();
      return;
    }
    const classId = target?.closest<HTMLElement>("[data-class]")?.dataset.class;
    if (isClassId(classId)) selectClass(classId);
  }, { signal });

  // 覆蓋層在 `document.body` 上，按鍵會一路冒泡到綁在 `window` 的戰場、開場與結局處理器。
  // 只停已處理的鍵不夠：任何一個未處理鍵都會在玩家閱讀說明時操作戰局，所以全部停在這裡。
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      closeRemakeNotes();
    }
  }, { signal });

  return { root, body, subtitle, events };
}

/**
 * `returnFocusTo` 由呼叫端明確指定，不從 `document.activeElement` 推斷：指標點擊是否
 * 讓按鈕取得焦點逐平台不同，而關閉後焦點必須確定地回到那個入口按鈕。
 */
export function openRemakeNotes(tab: RemakeNotesTab, returnFocusTo?: HTMLElement): void {
  activeTab = tab;
  if (!panel) panel = buildPanel();
  panel.root.classList.add("is-open");
  renderBody();
  const active = document.activeElement;
  previouslyFocused = returnFocusTo
    ?? (active instanceof HTMLElement ? active : undefined);
  panel.root.querySelector<HTMLElement>(".rn-dialog")?.focus();
}

export function closeRemakeNotes(): void {
  if (!panel) return;
  panel.root.classList.remove("is-open");
  previouslyFocused?.focus();
  previouslyFocused = undefined;
}

export function isRemakeNotesOpen(): boolean {
  return panel?.root.classList.contains("is-open") ?? false;
}

/** 表面切換時整個拆掉：說明視窗不應該跨越關卡或畫面存活。 */
export function destroyRemakeNotes(): void {
  if (!panel) return;
  panel.events.abort();
  panel.root.remove();
  panel = undefined;
  previouslyFocused = undefined;
}
