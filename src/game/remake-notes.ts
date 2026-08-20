/**
 * 「復刻說明」的入口按鈕。
 *
 * 宿主工具列上只有這一個按鈕：四個分頁都在覆蓋層自己的頁籤列裡，入口再拆成四顆會把
 * 同一件事說兩遍，也讓「畫面縮放」那一行越長越像遊戲的一部分。點擊一律開在第一個分頁。
 *
 * 這個模組刻意保持很小：面板本體、策展文字與職業圖鑑視圖都由第一次點擊時動態載入，
 * 因此普通遊玩不為一個說明視窗付出任何主包體積。
 */

const TRIGGER_LABEL = "復刻說明";
const TRIGGER_HINT = "Bug 修復、功能增強、平衡性調整與職業圖鑑";

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
  group.innerHTML = `
    <button type="button" data-remake-notes data-testid="remake-notes-open"
      title="${TRIGGER_HINT}">${TRIGGER_LABEL}</button>`;
  host.appendChild(group);

  const events = new AbortController();
  group.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)
      ?.closest<HTMLButtonElement>("[data-remake-notes]");
    if (!button) return;
    void panelModule().then((module) =>
      module.openRemakeNotes(module.REMAKE_NOTES_TABS[0]?.id ?? "fixes", button));
  }, { signal: events.signal });

  // 與「畫面縮放」同一條理由：宿主面板的按鍵不得洩漏到綁在 `window` 的戰場輸入。
  group.addEventListener("keydown", (event) => event.stopPropagation(), { signal: events.signal });

  return () => {
    events.abort();
    group.remove();
    loaded?.destroyRemakeNotes();
  };
}
