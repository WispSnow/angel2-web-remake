import { imageScalingMode, onImageScalingChange } from "./display-settings";
import { mountHostMenu } from "./host-menu";
import { restoreInterfaceZoomOnce } from "./interface-zoom";
import type { ImageScalingMode } from "./preferences";
import {
  applyDesktopWindowTarget,
  computeDesktopIntegerWindowTarget,
  initializeDesktopRuntime,
} from "./desktop-runtime";
import { LOGICAL_SCREEN_HEIGHT, LOGICAL_SCREEN_WIDTH } from "./scaling-constants";
import { mountNativePointer } from "./native-pointer";

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

/**
 * 開發構建的錄製模式（`capture=1`）和桌面版一樣讓畫面鋪滿視窗：錄製工具以 1920×1080 CSS 像素
 * 的視窗錄，網頁版平常的 1 倍上限會讓畫面只佔一角。發布構建折疊成 `false`。
 */
const captureFillsViewport = (): boolean =>
  import.meta.env.MODE !== "release" && document.documentElement.dataset.capture === "true";

export interface GameScalingOptions {
  /**
   * `REMAKE-174` 的「原版Debug」開關屬於正式遊戲表面；實驗室各有自己的內存場景，
   * 掛上去只會讓人以為那裡也吃這個開關。
   */
  readonly originalDebugToggle?: boolean;
  /**
   * `REMAKE-215`／`REMAKE-216` 的懷舊規則開關（敗退保留經驗、原版冰雪）。和「原版Debug」
   * 一樣只屬於正式戰役表面：競技場與實驗室一律用複刻規則。
   */
  readonly ruleOptionToggles?: boolean;
}

export function configureGameScaling(
  viewport: HTMLElement,
  screen: HTMLElement,
  options: GameScalingOptions = {},
): () => void {
  const desktop = initializeDesktopRuntime();
  // 頁面上沒有畫面外的宿主列：設定、暫停與參考面板都收在畫面右下角的選單入口裡。
  const unmountHostMenu = mountHostMenu(screen, {
    originalDebugToggle: options.originalDebugToggle !== false,
    ruleOptionToggles: options.ruleOptionToggles !== false,
    interfaceZoom: desktop,
  });
  restoreInterfaceZoomOnce();
  const pointer = mountNativePointer(screen);
  let integerResizeTimer: number | undefined;

  const availableDesktopHeight = (): number => Math.max(
    1,
    document.documentElement.clientHeight - viewport.getBoundingClientRect().top,
  );

  const scheduleIntegerWindowResize = () => {
    if (!desktop) return;
    if (integerResizeTimer !== undefined) window.clearTimeout(integerResizeTimer);
    integerResizeTimer = window.setTimeout(() => {
      integerResizeTimer = undefined;
      const target = computeDesktopIntegerWindowTarget({
        viewportWidth: viewport.clientWidth,
        availableGameHeight: availableDesktopHeight(),
        chromeHeight: 0,
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
    const fill = !desktop && captureFillsViewport();
    const scale = computeGameScale(viewport.clientWidth, ratio, mode, {
      // 錄製時畫面在視窗裡上下置中，可用高度是整個視窗，不扣畫面上緣。
      availableHeight: desktop ? availableDesktopHeight() : fill ? document.documentElement.clientHeight : undefined,
      allowUpscale: desktop || fill,
    });
    const offset = computeGameOffset(viewport.clientWidth, ratio, scale);
    viewport.style.height = `${LOGICAL_SCREEN_HEIGHT * scale}px`;
    screen.style.setProperty("--game-scale", String(scale));
    screen.style.setProperty("--game-offset-x", `${offset}px`);
    document.documentElement.style.setProperty("--image-rendering", CSS_IMAGE_RENDERING[mode]);
    document.documentElement.dataset.imageScaling = mode;
    // 指针不动时画面照样可能缩放或位移，画面内指针要按新的逻辑座标重摆。
    pointer.refresh();
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
    pointer.dispose();
    unmountHostMenu();
  };
}
