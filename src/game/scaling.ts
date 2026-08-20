import {
  hostChromeExtrasSlot,
  imageScalingMode,
  mountImageScalingControls,
  onImageScalingChange,
} from "./display-settings";
import { mountHostOverlays } from "./host-overlays";
import type { ImageScalingMode } from "./preferences";

export const LOGICAL_SCREEN_WIDTH = 640;
export const LOGICAL_SCREEN_HEIGHT = 350;

const CSS_IMAGE_RENDERING: Readonly<Record<ImageScalingMode, string>> = {
  sharp: "pixelated",
  smooth: "auto",
  // The scale is already a whole number of device pixels, so nearest neighbour
  // reproduces every source pixel exactly and needs no blending.
  integer: "pixelated",
};

/**
 * Largest scale that still fits `availableWidth`.
 *
 * `integer` snaps in device space rather than CSS space because both HiDPI panels
 * and browser zoom land in `devicePixelRatio`: a CSS scale of 1 at ratio 1.5 is
 * what makes some source pixels one device pixel wide and others two. When the
 * viewport cannot fit even one device pixel per source pixel there is no integer
 * factor to snap to, so the fitted scale is kept instead of overflowing the box.
 */
export function computeGameScale(
  availableWidth: number,
  devicePixelRatio: number,
  mode: ImageScalingMode,
): number {
  const fitted = Math.min(1, availableWidth / LOGICAL_SCREEN_WIDTH);
  if (mode !== "integer") return fitted;
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const deviceFactor = Math.floor(fitted * ratio);
  return deviceFactor >= 1 ? deviceFactor / ratio : fitted;
}

/**
 * Horizontal letterbox offset, floored to whole device pixels. A fractional
 * offset would resample the entire screen off-grid and undo the point of the
 * integer mode.
 */
export function computeGameOffset(
  availableWidth: number,
  devicePixelRatio: number,
  scale: number,
): number {
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const slack = Math.max(0, availableWidth - LOGICAL_SCREEN_WIDTH * scale);
  return Math.floor((slack / 2) * ratio) / ratio;
}

export function configureGameScaling(viewport: HTMLElement, screen: HTMLElement): () => void {
  const resize = () => {
    const mode = imageScalingMode();
    const ratio = window.devicePixelRatio || 1;
    const scale = computeGameScale(viewport.clientWidth, ratio, mode);
    const offset = computeGameOffset(viewport.clientWidth, ratio, scale);
    viewport.style.height = `${LOGICAL_SCREEN_HEIGHT * scale}px`;
    screen.style.setProperty("--game-scale", String(scale));
    screen.style.setProperty("--game-offset-x", `${offset}px`);
    document.documentElement.style.setProperty("--image-rendering", CSS_IMAGE_RENDERING[mode]);
    document.documentElement.dataset.imageScaling = mode;
  };

  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  const unsubscribe = onImageScalingChange(resize);

  // `devicePixelRatio` changes when the window moves between displays or the user
  // zooms the browser, and neither fires a resize on the viewport. A resolution
  // query only matches the ratio it was created with, so it is re-armed each time.
  let ratioQuery: MediaQueryList | undefined;
  let disposed = false;
  const watchRatio = () => {
    if (disposed) return;
    ratioQuery?.removeEventListener("change", onRatioChange);
    ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    ratioQuery.addEventListener("change", onRatioChange);
  };
  function onRatioChange(): void {
    watchRatio();
    resize();
  }
  watchRatio();

  const unmountControls = mountImageScalingControls(viewport);
  const extras = hostChromeExtrasSlot(viewport);
  const unmountOverlays = extras ? mountHostOverlays(extras) : () => undefined;
  resize();
  return () => {
    disposed = true;
    ratioQuery?.removeEventListener("change", onRatioChange);
    observer.disconnect();
    unsubscribe();
    unmountOverlays();
    unmountControls();
  };
}
