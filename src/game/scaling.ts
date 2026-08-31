import {
  hostChromeExtrasSlot,
  hostChromeInterfaceSlot,
  imageScalingMode,
  mountImageScalingControls,
  onImageScalingChange,
} from "./display-settings";
import { mountHostOverlays } from "./host-overlays";
import { mountInterfaceZoomControls, restoreInterfaceZoomOnce } from "./interface-zoom";
import type { ImageScalingMode } from "./preferences";
import {
  applyDesktopWindowTarget,
  computeDesktopIntegerWindowTarget,
  initializeDesktopRuntime,
} from "./desktop-runtime";
import { LOGICAL_SCREEN_HEIGHT, LOGICAL_SCREEN_WIDTH } from "./scaling-constants";
import { mountProgramPauseButton } from "./program-pause";

export { LOGICAL_SCREEN_HEIGHT, LOGICAL_SCREEN_WIDTH } from "./scaling-constants";

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
  options: {
    availableHeight?: number;
    allowUpscale?: boolean;
  } = {},
): number {
  const maximumScale = options.allowUpscale ? Number.POSITIVE_INFINITY : 1;
  const fitted = Math.max(0, Math.min(
    maximumScale,
    availableWidth / LOGICAL_SCREEN_WIDTH,
    (options.availableHeight ?? Number.POSITIVE_INFINITY) / LOGICAL_SCREEN_HEIGHT,
  ));
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
  const desktop = initializeDesktopRuntime();
  const unmountControls = mountImageScalingControls(viewport);
  const panel = viewport.parentElement
    ?.querySelector<HTMLElement>(":scope > .display-settings");
  const extras = hostChromeExtrasSlot(viewport);
  const unmountProgramPause = extras ? mountProgramPauseButton(extras) : () => undefined;
  const unmountOverlays = extras ? mountHostOverlays(extras) : () => undefined;
  const interfaceSlot = hostChromeInterfaceSlot(viewport);
  const unmountInterfaceZoom = interfaceSlot
    ? mountInterfaceZoomControls(interfaceSlot)
    : () => undefined;
  restoreInterfaceZoomOnce();
  let integerResizeTimer: number | undefined;

  const availableDesktopHeight = (): number => Math.max(
    1,
    document.documentElement.clientHeight
      - viewport.getBoundingClientRect().top
      - (panel?.getBoundingClientRect().height ?? 0),
  );

  const scheduleIntegerWindowResize = () => {
    if (!desktop) return;
    if (integerResizeTimer !== undefined) window.clearTimeout(integerResizeTimer);
    integerResizeTimer = window.setTimeout(() => {
      integerResizeTimer = undefined;
      const chromeHeight = panel?.getBoundingClientRect().height ?? 0;
      const target = computeDesktopIntegerWindowTarget({
        viewportWidth: viewport.clientWidth,
        availableGameHeight: availableDesktopHeight(),
        chromeHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        screenAvailableWidth: window.screen.availWidth,
        screenAvailableHeight: window.screen.availHeight,
      });
      void applyDesktopWindowTarget(target).catch((error: unknown) => {
        console.warn("Unable to synchronize the integer-scale desktop window", error);
      });
    }, 180);
  };

  const resize = () => {
    const mode = imageScalingMode();
    const ratio = window.devicePixelRatio || 1;
    const scale = computeGameScale(viewport.clientWidth, ratio, mode, {
      availableHeight: desktop ? availableDesktopHeight() : undefined,
      allowUpscale: desktop,
    });
    const offset = computeGameOffset(viewport.clientWidth, ratio, scale);
    viewport.style.height = `${LOGICAL_SCREEN_HEIGHT * scale}px`;
    screen.style.setProperty("--game-scale", String(scale));
    screen.style.setProperty("--game-offset-x", `${offset}px`);
    document.documentElement.style.setProperty("--image-rendering", CSS_IMAGE_RENDERING[mode]);
    document.documentElement.dataset.imageScaling = mode;
    if (mode === "integer") scheduleIntegerWindowResize();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  const unsubscribe = onImageScalingChange(resize);
  window.addEventListener("resize", resize);

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

  resize();
  return () => {
    disposed = true;
    if (integerResizeTimer !== undefined) window.clearTimeout(integerResizeTimer);
    ratioQuery?.removeEventListener("change", onRatioChange);
    window.removeEventListener("resize", resize);
    observer.disconnect();
    unsubscribe();
    unmountInterfaceZoom();
    unmountOverlays();
    unmountProgramPause();
    unmountControls();
  };
}
