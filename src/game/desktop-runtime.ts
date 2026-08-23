import { LOGICAL_SCREEN_HEIGHT, LOGICAL_SCREEN_WIDTH } from "./scaling-constants";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export interface DesktopIntegerWindowMetrics {
  viewportWidth: number;
  availableGameHeight: number;
  chromeHeight: number;
  devicePixelRatio: number;
  screenAvailableWidth: number;
  screenAvailableHeight: number;
}

export interface DesktopWindowTarget {
  width: number;
  height: number;
  scale: number;
  deviceFactor: number;
}

const WINDOW_FRAME_HEIGHT_ALLOWANCE = 48;

export function isTauriDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Marks the document before its first game surface is mounted, avoiding a 1x flash. */
export function initializeDesktopRuntime(): boolean {
  const desktop = isTauriDesktopRuntime();
  if (desktop) document.documentElement.dataset.desktopRuntime = "true";
  return desktop;
}

/**
 * Chooses the physical-pixel integer factor nearest the current window, then
 * clamps it to the current monitor. The returned logical size is what Tauri's
 * `setSize(LogicalSize)` expects and includes the unscaled host toolbar.
 */
export function computeDesktopIntegerWindowTarget(
  metrics: DesktopIntegerWindowMetrics,
): DesktopWindowTarget {
  const ratio = metrics.devicePixelRatio > 0 ? metrics.devicePixelRatio : 1;
  const chromeHeight = Math.max(0, metrics.chromeHeight);
  const currentFit = Math.max(0, Math.min(
    metrics.viewportWidth / LOGICAL_SCREEN_WIDTH,
    metrics.availableGameHeight / LOGICAL_SCREEN_HEIGHT,
  ));
  const monitorGameHeight = Math.max(
    0,
    metrics.screenAvailableHeight - chromeHeight - WINDOW_FRAME_HEIGHT_ALLOWANCE,
  );
  const monitorFit = Math.max(0, Math.min(
    metrics.screenAvailableWidth / LOGICAL_SCREEN_WIDTH,
    monitorGameHeight / LOGICAL_SCREEN_HEIGHT,
  ));
  const maximumDeviceFactor = Math.max(1, Math.floor(monitorFit * ratio));
  const nearestDeviceFactor = Math.max(1, Math.round(currentFit * ratio));
  const deviceFactor = Math.min(nearestDeviceFactor, maximumDeviceFactor);
  const scale = deviceFactor / ratio;
  return {
    width: Math.round(LOGICAL_SCREEN_WIDTH * scale),
    height: Math.ceil(LOGICAL_SCREEN_HEIGHT * scale + chromeHeight),
    scale,
    deviceFactor,
  };
}

/**
 * 頁面縮放倍率。`devicePixelRatio` 同時含作業系統縮放與 WebView 頁面縮放，而視窗自己的
 * `scaleFactor()` 只有前者，兩者相除就得到後者——不論倍率是「介面縮放」設的還是玩家按
 * `Ctrl +/-` 按出來的都算得到。
 */
export function computeDesktopPageZoom(devicePixelRatio: number, scaleFactor: number): number {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return 1;
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const zoom = ratio / scaleFactor;
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

/**
 * Integer mode owns the normal desktop window size. Maximized/fullscreen state
 * is left first, because an exact client size and an OS-owned maximized size are
 * mutually exclusive.
 */
export async function applyDesktopWindowTarget(target: DesktopWindowTarget): Promise<void> {
  if (!isTauriDesktopRuntime()) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  if (await appWindow.isFullscreen()) await appWindow.setFullscreen(false);
  if (await appWindow.isMaximized()) await appWindow.unmaximize();
  if (
    Math.abs(window.innerWidth - target.width) <= 1
    && Math.abs(window.innerHeight - target.height) <= 1
  ) return;
  // `LogicalSize` 用的是作業系統的邏輯像素，不受頁面縮放影響，而 target 量自 CSS 像素。
  // 少了這一步，只要玩家縮放過頁面，整數倍模式每次重算都會再把視窗縮小 1/zoom 一次，
  // 一路縮到 `minWidth` 為止。
  const zoom = computeDesktopPageZoom(window.devicePixelRatio || 1, await appWindow.scaleFactor());
  await appWindow.setSize(new LogicalSize(
    Math.round(target.width * zoom),
    Math.round(target.height * zoom),
  ));
}

/**
 * 真頁面縮放，和 `Ctrl +/-` 同一條路徑：CSS 視窗等比縮小，遊戲畫面按新的 `clientWidth`
 * 重新填滿視窗，所以只有宿主 DOM 變大。需要 `core:webview:allow-set-webview-zoom`。
 */
export async function applyDesktopInterfaceZoom(percent: number): Promise<void> {
  if (!isTauriDesktopRuntime()) return;
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  await getCurrentWebview().setZoom(percent / 100);
}
