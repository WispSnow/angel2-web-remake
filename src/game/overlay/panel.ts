import "../../overlay-panels.css";
import {
  documentationLanguage,
  localizeDocumentationElement,
  setDocumentationLanguage,
  subscribeDocumentationLanguage,
  type DocumentationLanguage,
} from "./documentation-language";
import { escapeHtml } from "./markup";

/**
 * 宿主覆蓋層的共用骨架，目前由「復刻說明」、「圖鑑」與「RoadMap」三個面板使用。
 *
 * 它們和「畫面縮放」一樣刻意留在 640×350 邏輯螢幕之外：原版沒有這些畫面，把它們畫進
 * 邏輯螢幕會偽造構圖證據。覆蓋層不暫停、不查詢、也不修改任何模擬狀態——底下的戰鬥
 * 照常跑完敵方階段，關掉之後玩家回到原本的局面。
 *
 * 唯一需要隔離的是輸入：`ui.ts`、`startup.ts` 與結局畫面都把 `keydown` 綁在 `window`
 * 上，未攔截的按鍵會在玩家只是翻閱面板時移動戰場游標，所以覆蓋層內的按鍵一律停在這裡。
 */

export interface OverlayTab<Id extends string> {
  readonly id: Id;
  readonly label: string;
  /** 標題列下方的副標，說明這個分頁涵蓋什麼。 */
  readonly title: string;
}

export interface OverlayPanelConfig<Id extends string> {
  /** `data-testid` 前綴，同時決定分頁按鈕與內容區的測試識別碼。 */
  readonly testid: string;
  readonly eyebrow: string;
  readonly heading: string;
  readonly footer: string;
  readonly tabs: readonly OverlayTab<Id>[];
  readonly render: (tab: Id) => string;
  /** 分頁內容自己的點擊處理；分頁切換與關閉已由骨架處理。 */
  readonly onBodyClick?: (target: HTMLElement, body: HTMLElement) => void;
  /** 內容完成換頁或首次繪製後，用於掛載只存在於目前分頁的動態表現。 */
  readonly onBodyRendered?: (body: HTMLElement, tab: Id) => void;
  readonly onClose?: () => void;
  readonly onDestroy?: () => void;
}

export interface OverlayPanel<Id extends string> {
  open(tab: Id, returnFocusTo?: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

interface PanelHandles {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  readonly subtitle: HTMLElement;
  readonly events: AbortController;
  readonly unsubscribeLanguage: () => void;
}

export function createOverlayPanel<Id extends string>(
  config: OverlayPanelConfig<Id>,
): OverlayPanel<Id> {
  const { testid, tabs } = config;
  let panel: PanelHandles | undefined;
  let activeTab: Id = tabs[0].id;
  let previouslyFocused: HTMLElement | undefined;

  const isTab = (value: string | undefined): value is Id =>
    tabs.some((tab) => tab.id === value);

  function renderBody(): void {
    if (!panel) return;
    const tab = tabs.find((definition) => definition.id === activeTab);
    panel.subtitle.textContent = tab?.title ?? "";
    panel.body.dataset.tab = activeTab;
    panel.body.innerHTML = config.render(activeTab);
    panel.body.scrollTop = 0;
    for (const button of panel.root.querySelectorAll<HTMLButtonElement>("[data-overlay-tab]")) {
      const selected = button.dataset.overlayTab === activeTab;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    config.onBodyRendered?.(panel.body, activeTab);
    localizeDocumentationElement(panel.root, documentationLanguage());
  }

  function renderChrome(language: DocumentationLanguage): void {
    if (!panel) return;
    const eyebrow = panel.root.querySelector<HTMLElement>(".rn-eyebrow");
    const heading = panel.root.querySelector<HTMLElement>(".rn-head h2");
    const close = panel.root.querySelector<HTMLButtonElement>(".rn-close");
    const tablist = panel.root.querySelector<HTMLElement>(".rn-tabs");
    const footer = panel.root.querySelector<HTMLElement>(".rn-foot");
    if (!eyebrow || !heading || !close || !tablist || !footer) {
      throw new Error(`${testid} panel chrome failed to render`);
    }
    eyebrow.textContent = config.eyebrow;
    heading.textContent = config.heading;
    close.setAttribute("aria-label", `關閉${config.eyebrow}`);
    tablist.setAttribute("aria-label", `${config.eyebrow}分頁`);
    footer.textContent = config.footer;
    for (const button of panel.root.querySelectorAll<HTMLButtonElement>("[data-overlay-tab]")) {
      const tab = tabs.find((definition) => definition.id === button.dataset.overlayTab);
      button.textContent = tab?.label ?? "";
    }
    for (const button of panel.root.querySelectorAll<HTMLButtonElement>("[data-documentation-language]")) {
      button.setAttribute("aria-pressed", String(button.dataset.documentationLanguage === language));
    }
    if (panel.root.classList.contains("is-open")) renderBody();
    else localizeDocumentationElement(panel.root, language);
  }

  function build(): PanelHandles {
    const root = document.createElement("div");
    root.className = "rn-overlay";
    root.dataset.testid = testid;
    root.innerHTML = `
      <div class="rn-scrim" data-overlay-dismiss></div>
      <section class="rn-dialog" role="dialog" aria-modal="true"
        aria-labelledby="${testid}-title" tabindex="-1">
        <header class="rn-head">
          <div>
            <p class="rn-eyebrow">${escapeHtml(config.eyebrow)}</p>
            <h2 id="${testid}-title">${escapeHtml(config.heading)}</h2>
            <p class="rn-subtitle" data-testid="${testid}-subtitle"></p>
          </div>
          <div class="rn-head-actions">
            <div class="rn-language-switch" role="group" aria-label="文件語言"
              data-documentation-language-switch data-testid="${testid}-language-switch">
              <button type="button" data-documentation-language="zh-Hant"
                data-testid="${testid}-language-traditional">繁體</button>
              <button type="button" data-documentation-language="zh-Hans"
                data-testid="${testid}-language-simplified">简体</button>
            </div>
            <button type="button" class="rn-close" data-overlay-dismiss
              data-testid="${testid}-close"
              aria-label="關閉${escapeHtml(config.eyebrow)}">✕</button>
          </div>
        </header>
        <div class="rn-tabs" role="tablist" aria-label="${escapeHtml(config.eyebrow)}分頁"
          data-testid="${testid}-tabs">
          ${tabs.map((tab) => `
            <button type="button" role="tab" data-overlay-tab="${tab.id}"
              data-testid="${testid}-tab-${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}
        </div>
        <div class="rn-body" data-testid="${testid}-body"></div>
        <footer class="rn-foot">${escapeHtml(config.footer)}</footer>
      </section>`;
    document.body.appendChild(root);

    const dialog = root.querySelector<HTMLElement>(".rn-dialog");
    const body = root.querySelector<HTMLElement>(".rn-body");
    const subtitle = root.querySelector<HTMLElement>(".rn-subtitle");
    if (!dialog || !body || !subtitle) throw new Error(`${testid} panel failed to build`);

    const events = new AbortController();
    const { signal } = events;

    const handles: PanelHandles = {
      root,
      body,
      subtitle,
      events,
      unsubscribeLanguage: subscribeDocumentationLanguage(renderChrome),
    };
    panel = handles;
    renderChrome(documentationLanguage());

    root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const language = target.closest<HTMLElement>("[data-documentation-language]")
        ?.dataset.documentationLanguage;
      if (language === "zh-Hant" || language === "zh-Hans") {
        setDocumentationLanguage(language);
        return;
      }
      if (target.closest("[data-overlay-dismiss]")) {
        close();
        return;
      }
      const tab = target.closest<HTMLElement>("[data-overlay-tab]")?.dataset.overlayTab;
      if (isTab(tab)) {
        activeTab = tab;
        renderBody();
        return;
      }
      config.onBodyClick?.(target, body);
      localizeDocumentationElement(root, documentationLanguage());
    }, { signal });

    // 覆蓋層在 `document.body` 上，按鍵會一路冒泡到綁在 `window` 的戰場、開場與結局
    // 處理器。只停已處理的鍵不夠：任何一個未處理鍵都會在玩家閱讀時操作戰局，所以
    // 全部停在這裡。
    dialog.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }, { signal });

    return handles;
  }

  /**
   * `returnFocusTo` 由呼叫端明確指定，不從 `document.activeElement` 推斷：指標點擊
   * 是否讓按鈕取得焦點逐平台不同，而關閉後焦點必須確定地回到那個入口按鈕。
   */
  function open(tab: Id, returnFocusTo?: HTMLElement): void {
    activeTab = tab;
    panel ??= build();
    panel.root.classList.add("is-open");
    renderChrome(documentationLanguage());
    const active = document.activeElement;
    previouslyFocused = returnFocusTo
      ?? (active instanceof HTMLElement ? active : undefined);
    panel.root.querySelector<HTMLElement>(".rn-dialog")?.focus();
  }

  function close(): void {
    if (!panel) return;
    config.onClose?.();
    panel.root.classList.remove("is-open");
    previouslyFocused?.focus();
    previouslyFocused = undefined;
  }

  return {
    open,
    close,
    isOpen: () => panel?.root.classList.contains("is-open") ?? false,
    /** 表面切換時整個拆掉：面板不應該跨越關卡或畫面存活。 */
    destroy: () => {
      if (!panel) return;
      config.onDestroy?.();
      panel.events.abort();
      panel.unsubscribeLanguage();
      panel.root.remove();
      panel = undefined;
      previouslyFocused = undefined;
    },
  };
}
