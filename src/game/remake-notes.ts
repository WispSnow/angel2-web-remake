import type { RemakeNotesTab } from "./remake-notes/panel";

/**
 * 「復刻說明」的入口按鈕。
 *
 * 這個模組刻意保持很小：面板本體、策展文字與職業圖鑑視圖都由第一次點擊時動態載入，
 * 因此普通遊玩不為一個說明視窗付出任何主包體積。
 */

const TRIGGERS: readonly { tab: RemakeNotesTab; label: string; hint: string }[] = [
  { tab: "fixes", label: "Bug 修復", hint: "已修復的原版缺陷逐條說明" },
  { tab: "balance", label: "平衡性調整", hint: "複刻版主動改動的平衡決定" },
  { tab: "classes", label: "職業圖鑑", hint: "全職業棋子、屬性、成長與特性" },
];

type PanelModule = typeof import("./remake-notes/panel");

let loading: Promise<PanelModule> | undefined;
let loaded: PanelModule | undefined;

async function panelModule(): Promise<PanelModule> {
  loading ??= import("./remake-notes/panel").then((module) => {
    loaded = module;
    return module;
  });
  return loading;
}

export function mountRemakeNotes(host: HTMLElement): () => void {
  const group = document.createElement("div");
  group.className = "remake-notes-triggers";
  group.dataset.testid = "remake-notes-triggers";
  group.setAttribute("aria-label", "復刻說明");
  group.innerHTML = TRIGGERS.map(({ tab, label, hint }) => `
    <button type="button" data-remake-notes="${tab}" data-testid="remake-notes-open-${tab}"
      title="${hint}">${label}</button>`).join("");
  host.appendChild(group);

  const events = new AbortController();
  group.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)
      ?.closest<HTMLButtonElement>("[data-remake-notes]");
    const tab = button?.dataset.remakeNotes;
    if (!button || (tab !== "fixes" && tab !== "balance" && tab !== "classes")) return;
    void panelModule().then((module) => module.openRemakeNotes(tab, button));
  }, { signal: events.signal });

  // 與「畫面縮放」同一條理由：宿主面板的按鍵不得洩漏到綁在 `window` 的戰場輸入。
  group.addEventListener("keydown", (event) => event.stopPropagation(), { signal: events.signal });

  return () => {
    events.abort();
    group.remove();
    loaded?.destroyRemakeNotes();
  };
}
