/**
 * 宿主選單裡的三個參考面板入口：「復刻說明」、「圖鑑」與「RoadMap」。
 *
 * 三個面板都固定開在自己的第一個分頁，不記住上次停在哪一頁。這個模組刻意保持很小：
 * 面板本體、策展文字、職業與角色資料都動態載入，因此普通遊玩不為三個參考視窗付出任何
 * 主包體積。
 *
 * 但「只在選下去的那一刻才載入」在慢速連線上等於按了沒反應：圖鑑那一包就有七十幾 KB
 * 程式加十幾 KB 樣式。所以選單列被指到或取得焦點時就先暖好模組（真的想開的人才付這個
 * 流量，不想開的人仍然一個位元組都不下載），選下去時若還沒到齊就把那一列標成忙碌，
 * 讓玩家看得出來是在讀取而不是壞掉。
 */

export type HostOverlayId = "remake-notes" | "compendium" | "roadmap";

interface OverlayPanel {
  /** 開在第一個分頁；關閉後焦點回到 `returnFocusTo`。 */
  readonly open: (returnFocusTo: HTMLElement) => void;
  readonly close: () => void;
  readonly isOpen: () => boolean;
  /** 表面切換時要呼叫的拆除函式。 */
  readonly destroy: () => void;
}

export interface HostOverlayEntry {
  readonly id: HostOverlayId;
  readonly label: string;
  readonly hint: string;
  /** 只做動態載入，不開視窗。 */
  readonly load: () => Promise<OverlayPanel>;
}

export const HOST_OVERLAYS: readonly HostOverlayEntry[] = [
  {
    id: "remake-notes",
    label: "復刻說明",
    hint: "Bug 修復、功能增強、平衡性調整、操作說明與免責聲明。",
    load: async () => {
      const panel = await import("./remake-notes/panel");
      return {
        open: (button) => panel.openRemakeNotes(panel.REMAKE_NOTES_TABS[0].id, button),
        close: panel.closeRemakeNotes,
        isOpen: panel.isRemakeNotesOpen,
        destroy: panel.destroyRemakeNotes,
      };
    },
  },
  {
    id: "compendium",
    label: "圖鑑",
    hint: "職業圖鑑與角色圖鑑。",
    load: async () => {
      const panel = await import("./compendium/panel");
      return {
        open: (button) => panel.openCompendium(panel.COMPENDIUM_TABS[0].id, button),
        close: panel.closeCompendium,
        isOpen: panel.isCompendiumOpen,
        destroy: panel.destroyCompendium,
      };
    },
  },
  {
    id: "roadmap",
    label: "RoadMap",
    hint: "復刻版候選願景與 QQ 交流群。",
    load: async () => {
      const panel = await import("./roadmap/panel");
      return {
        open: (button) => panel.openRoadmap(panel.ROADMAP_TABS[0].id, button),
        close: panel.closeRoadmap,
        isOpen: panel.isRoadmapOpen,
        destroy: panel.destroyRoadmap,
      };
    },
  },
];

export interface HostOverlayLauncher {
  /** 先載入模組但不開視窗；指到或聚焦選單列時呼叫。 */
  warm(id: HostOverlayId): void;
  /** 開啟面板；載入期間把 `button` 標成忙碌。 */
  open(id: HostOverlayId, button: HTMLElement): Promise<void>;
  /** 是否有任何面板開著。 */
  anyOpen(): boolean;
  /** 關閉所有開著的面板（恢復遊戲時）。 */
  closeAll(): void;
  /** 表面切換時整個拆掉：面板不應該跨越關卡或畫面存活。 */
  destroy(): void;
}

export function createHostOverlayLauncher(): HostOverlayLauncher {
  const panels = new Map<HostOverlayId, Promise<OverlayPanel>>();
  const loaded = new Map<HostOverlayId, OverlayPanel>();
  let destroyed = false;

  const warmPanel = (id: HostOverlayId): Promise<OverlayPanel> => {
    const entry = HOST_OVERLAYS.find((candidate) => candidate.id === id);
    if (!entry) return Promise.reject(new Error(`unknown host overlay ${id}`));
    const pending = panels.get(id) ?? entry.load().then((panel) => {
      loaded.set(id, panel);
      return panel;
    }).catch((error: unknown) => {
      // 失敗的 promise 不能留在快取裡，否則連線恢復之後再選也只會重播同一個錯誤。
      panels.delete(id);
      throw error;
    });
    panels.set(id, pending);
    return pending;
  };

  return {
    warm: (id) => {
      void warmPanel(id).catch(() => undefined);
    },
    open: async (id, button) => {
      button.setAttribute("aria-busy", "true");
      try {
        const panel = await warmPanel(id);
        // 載入期間玩家可能已經恢復遊戲或換了表面；這時不再開一個沒有選單承接的面板。
        if (destroyed || !button.isConnected || !button.closest("[data-host-menu-open='true']")) return;
        panel.open(button);
      } catch (error) {
        console.warn(`${id} 面板載入失敗`, error);
      } finally {
        button.removeAttribute("aria-busy");
      }
    },
    anyOpen: () => [...loaded.values()].some((panel) => panel.isOpen()),
    closeAll: () => {
      for (const panel of loaded.values()) {
        if (panel.isOpen()) panel.close();
      }
    },
    destroy: () => {
      destroyed = true;
      for (const panel of loaded.values()) panel.destroy();
      loaded.clear();
      panels.clear();
    },
  };
}
