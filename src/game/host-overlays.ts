/**
 * 宿主工具列上的覆蓋層入口：「復刻說明」、「圖鑑」與「RoadMap」。
 *
 * 三顆按鈕都固定開在自己面板的第一個分頁，不記住上次停在哪一頁。這個模組刻意保持很小：
 * 面板本體、策展文字、職業與角色資料都動態載入，因此普通遊玩不為三個參考視窗付出任何
 * 主包體積。
 *
 * 但「只在點下去的那一刻才載入」在慢速連線上等於按了沒反應：圖鑑那一包就有七十幾 KB
 * 程式加十幾 KB 樣式。所以指標移上去或按鈕取得焦點時就先暖好模組（真的想開的人才付
 * 這個流量，不想開的人仍然一個位元組都不下載），點擊時若還沒到齊就把按鈕標成忙碌，
 * 讓玩家看得出來是在讀取而不是壞掉。
 */

interface OverlayPanel {
  /** 開在第一個分頁。 */
  readonly open: (button: HTMLElement) => void;
  /** 表面切換時要呼叫的拆除函式。 */
  readonly destroy: () => void;
}

interface OverlayTrigger {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  /** 只做動態載入，不開視窗；指標移上去或聚焦時就先跑這一步。 */
  readonly load: () => Promise<OverlayPanel>;
}

const TRIGGERS: readonly OverlayTrigger[] = [
  {
    id: "remake-notes",
    label: "復刻說明",
    hint: "Bug 修復、功能增強、平衡性調整、操作說明與免責聲明",
    load: async () => {
      const panel = await import("./remake-notes/panel");
      return {
        open: (button) => panel.openRemakeNotes(panel.REMAKE_NOTES_TABS[0].id, button),
        destroy: panel.destroyRemakeNotes,
      };
    },
  },
  {
    id: "compendium",
    label: "圖鑑",
    hint: "職業圖鑑與角色圖鑑",
    load: async () => {
      const panel = await import("./compendium/panel");
      return {
        open: (button) => panel.openCompendium(panel.COMPENDIUM_TABS[0].id, button),
        destroy: panel.destroyCompendium,
      };
    },
  },
  {
    id: "roadmap",
    label: "RoadMap",
    hint: "復刻版候選願景與 QQ 交流群",
    load: async () => {
      const panel = await import("./roadmap/panel");
      return {
        open: (button) => panel.openRoadmap(panel.ROADMAP_TABS[0].id, button),
        destroy: panel.destroyRoadmap,
      };
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
  const panels = new Map<string, Promise<OverlayPanel>>();
  const events = new AbortController();

  const triggerFor = (event: Event): { button: HTMLButtonElement; trigger: OverlayTrigger } | undefined => {
    const button = (event.target as HTMLElement | null)
      ?.closest<HTMLButtonElement>("[data-overlay-trigger]");
    const trigger = TRIGGERS.find(({ id }) => id === button?.dataset.overlayTrigger);
    return button && trigger ? { button, trigger } : undefined;
  };

  const warm = (trigger: OverlayTrigger): Promise<OverlayPanel> => {
    const pending = panels.get(trigger.id) ?? trigger.load().catch((error: unknown) => {
      // 失敗的 promise 不能留在快取裡，否則連線恢復之後再點也只會重播同一個錯誤。
      panels.delete(trigger.id);
      throw error;
    });
    panels.set(trigger.id, pending);
    return pending;
  };

  const prewarm = (event: Event) => {
    const found = triggerFor(event);
    if (found) void warm(found.trigger).catch(() => undefined);
  };
  group.addEventListener("pointerover", prewarm, { signal: events.signal });
  group.addEventListener("focusin", prewarm, { signal: events.signal });

  group.addEventListener("click", (event) => {
    const found = triggerFor(event);
    if (!found) return;
    const { button, trigger } = found;
    button.setAttribute("aria-busy", "true");
    void warm(trigger).then((panel) => {
      panel.open(button);
      destroyers.set(trigger.id, panel.destroy);
    }).catch((error: unknown) => {
      console.warn(`${trigger.id} 面板載入失敗`, error);
    }).finally(() => button.removeAttribute("aria-busy"));
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
