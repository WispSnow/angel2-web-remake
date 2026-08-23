import { applyDesktopInterfaceZoom, isTauriDesktopRuntime } from "./desktop-runtime";
import { mountHostChromeRadioGroup } from "./host-chrome-radio";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  isInterfaceZoom,
  loadDisplayPreferences,
  saveDisplayPreferences,
  type InterfaceZoom,
} from "./preferences";

/**
 * 桌面版的「介面縮放」。遊戲畫面在桌面版會等比放大填滿視窗（`scaling.ts` 只有在 Tauri
 * 執行階段才解除 1 倍上限），宿主工具列與三個參考面板卻是固定 px 的 DOM，因此螢幕越大
 * 兩者差距越大：1280×800 的預設視窗遊戲已經是 2 倍，原版 16×15 點陣字畫成 32 px，而
 * 面板正文仍是 14 px。
 *
 * 這裡走的是 WebView 的真頁面縮放（和瀏覽器 `Ctrl +/-` 同一件事），不是 CSS `zoom`：
 * 對話框寬高寫成 `min(1120px, 100vw - 32px)`，而 `vw` 與媒體查詢都不跟著元素的 CSS
 * `zoom` 走，用 CSS 縮放會把覆蓋層的響應式再打破一次。真頁面縮放則等比縮小 CSS 視窗，
 * 遊戲按新的 `clientWidth` 重新填滿，視覺大小不變，只有宿主介面變大。
 */
export const INTERFACE_ZOOM_OPTIONS: readonly {
  zoom: InterfaceZoom;
  label: string;
}[] = [
  { zoom: 100, label: "100%" },
  { zoom: 125, label: "125%" },
  { zoom: 150, label: "150%" },
  { zoom: 200, label: "200%" },
];

export const INTERFACE_ZOOM_HINT =
  "放大宿主介面：這一行與「復刻說明」、「圖鑑」、「RoadMap」。遊戲畫面仍會填滿視窗，不受影響。";

const INTERFACE_ZOOM_TITLE =
  "高解析度螢幕若沒有調整系統縮放，宿主文字會比遊戲畫面小上數倍；也可以直接用 Ctrl +/- 縮放。";

const listeners = new Set<(zoom: InterfaceZoom) => void>();
let current: InterfaceZoom | undefined;

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    // 無痕模式與沙箱嵌入光是讀取屬性就可能丟例外。
    return undefined;
  }
};

export function interfaceZoom(): InterfaceZoom {
  if (current) return current;
  const store = storage();
  current = store
    ? loadDisplayPreferences(store).interfaceZoom
    : DEFAULT_DISPLAY_PREFERENCES.interfaceZoom;
  return current;
}

export function setInterfaceZoom(zoom: InterfaceZoom): void {
  if (interfaceZoom() === zoom) return;
  current = zoom;
  const store = storage();
  // 兩個宿主顯示偏好共用同一筆記錄，整筆覆寫會把另一個選擇洗掉。
  if (store) saveDisplayPreferences(store, { ...loadDisplayPreferences(store), interfaceZoom: zoom });
  void applyDesktopInterfaceZoom(zoom);
  for (const listener of listeners) listener(zoom);
}

export function onInterfaceZoomChange(listener: (zoom: InterfaceZoom) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let restored = false;

/**
 * 每個表面掛載時都會重新建立宿主工具列，但頁面縮放屬於整個 WebView，不屬於某個表面。
 * 只在本次執行的第一次掛載時還原一次，之後就交給玩家：否則玩家用 `Ctrl +/-` 調過的
 * 倍率會在下一次切換表面時被偏好值蓋回去。
 */
export function restoreInterfaceZoomOnce(): void {
  if (restored) return;
  restored = true;
  const zoom = interfaceZoom();
  // 新開的 WebView 本來就是 100%，不必為預設值多發一次呼叫。
  if (zoom === 100) return;
  void applyDesktopInterfaceZoom(zoom);
}

export function mountInterfaceZoomControls(container: HTMLElement): () => void {
  // 網頁版沒有對應的 API，也不需要：瀏覽器自己的縮放就是同一件事。
  if (!isTauriDesktopRuntime()) return () => undefined;
  const hint = container.closest(".display-settings")
    ?.querySelector<HTMLParagraphElement>(".display-settings-hint");
  return mountHostChromeRadioGroup<`${InterfaceZoom}`>({
    container,
    labelId: "interface-zoom-label",
    labelText: "介面縮放",
    datasetKey: "interfaceZoom",
    options: INTERFACE_ZOOM_OPTIONS.map(({ zoom, label }) => ({
      value: `${zoom}` as `${InterfaceZoom}`,
      label,
      testid: `interface-zoom-${zoom}`,
      title: INTERFACE_ZOOM_TITLE,
    })),
    read: () => `${interfaceZoom()}` as `${InterfaceZoom}`,
    write: (value) => {
      const zoom = Number(value);
      if (isInterfaceZoom(zoom)) setInterfaceZoom(zoom);
    },
    subscribe: (listener) => onInterfaceZoomChange(
      (zoom) => listener(`${zoom}` as `${InterfaceZoom}`),
    ),
    // 說明行是兩個控制項共用的，初次繪製留給「畫面縮放」，玩家真的動了才換成這一條。
    onRender: (_value, initial) => {
      if (initial || !hint) return;
      hint.textContent = INTERFACE_ZOOM_HINT;
    },
  });
}
