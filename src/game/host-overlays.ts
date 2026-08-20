/**
 * 宿主工具列上的覆蓋層入口：「復刻說明」與「圖鑑」。
 *
 * 兩顆按鈕都固定開在自己面板的第一個分頁，不記住上次停在哪一頁。這個模組刻意保持很小：
 * 面板本體、策展文字、職業與角色資料都由第一次點擊時動態載入，因此普通遊玩不為兩個
 * 參考視窗付出任何主包體積。
 */

interface OverlayTrigger {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  /** 動態載入面板、開在第一個分頁，並回傳表面切換時要呼叫的拆除函式。 */
  readonly open: (button: HTMLElement) => Promise<() => void>;
}

const TRIGGERS: readonly OverlayTrigger[] = [
  {
    id: "remake-notes",
    label: "復刻說明",
    hint: "Bug 修復、功能增強與平衡性調整",
    open: async (button) => {
      const panel = await import("./remake-notes/panel");
      panel.openRemakeNotes(panel.REMAKE_NOTES_TABS[0].id, button);
      return panel.destroyRemakeNotes;
    },
  },
  {
    id: "compendium",
    label: "圖鑑",
    hint: "職業圖鑑與角色圖鑑",
    open: async (button) => {
      const panel = await import("./compendium/panel");
      panel.openCompendium(panel.COMPENDIUM_TABS[0].id, button);
      return panel.destroyCompendium;
    },
  },
];

export function mountHostOverlays(host: HTMLElement): () => void {
  const group = document.createElement("div");
  group.className = "host-overlay-triggers";
  group.dataset.testid = "host-overlay-triggers";
  group.innerHTML = TRIGGERS.map((trigger) => `
    <button type="button" data-overlay-trigger="${trigger.id}"
      data-testid="${trigger.id}-open"
      title="${trigger.hint}">${trigger.label}</button>`).join("");
  host.appendChild(group);

  const destroyers = new Map<string, () => void>();
  const events = new AbortController();
  group.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)
      ?.closest<HTMLButtonElement>("[data-overlay-trigger]");
    const trigger = TRIGGERS.find(({ id }) => id === button?.dataset.overlayTrigger);
    if (!button || !trigger) return;
    void trigger.open(button).then((destroy) => destroyers.set(trigger.id, destroy));
  }, { signal: events.signal });

  // 與「畫面縮放」同一條理由：宿主面板的按鍵不得洩漏到綁在 `window` 的戰場輸入。
  group.addEventListener("keydown", (event) => event.stopPropagation(), { signal: events.signal });

  return () => {
    events.abort();
    group.remove();
    for (const destroy of destroyers.values()) destroy();
    destroyers.clear();
  };
}
