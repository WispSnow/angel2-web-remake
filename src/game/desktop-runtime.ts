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
  await appWindow.setSize(new LogicalSize(target.width, target.height));
}
