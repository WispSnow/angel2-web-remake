import { mountHostChromeRadioGroup } from "./host-chrome-radio";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  loadDisplayPreferences,
  saveDisplayPreferences,
  type ImageScalingMode,
} from "./preferences";

/**
 * Host-display settings live outside the 640x350 logical screen on purpose. The
 * in-battle sub-menu reproduces the original's fixed five-row box, so a sixth
 * row would falsify that layout evidence; picking how the browser resamples the
 * finished frame is the same class of choice as browser zoom and belongs to the
 * page chrome instead.
 */
export const IMAGE_SCALING_OPTIONS: readonly {
  mode: ImageScalingMode;
  label: string;
  hint: string;
}[] = [
  { mode: "sharp", label: "銳利", hint: "最近鄰取樣，忠於原版；非整數倍時像素大小不均。" },
  { mode: "smooth", label: "平滑", hint: "雙線性取樣，非整數倍時邊緣均勻，但畫面偏柔。" },
  { mode: "integer", label: "整數倍", hint: "鎖定整數倍裝置像素；桌面版會同步調整外部視窗，Web 版保留留邊。" },
];

const listeners = new Set<(mode: ImageScalingMode) => void>();
let current: ImageScalingMode | undefined;

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    // Private-mode and sandboxed embeds can throw on property access alone.
    return undefined;
  }
};

export function imageScalingMode(): ImageScalingMode {
  if (current) return current;
  const store = storage();
  current = store
    ? loadDisplayPreferences(store).imageScaling
    : DEFAULT_DISPLAY_PREFERENCES.imageScaling;
  return current;
}

export function setImageScalingMode(mode: ImageScalingMode): void {
  if (imageScalingMode() === mode) return;
  current = mode;
  const store = storage();
  // 兩個宿主顯示偏好共用同一筆記錄，整筆覆寫會把另一個選擇洗掉。
  if (store) saveDisplayPreferences(store, { ...loadDisplayPreferences(store), imageScaling: mode });
  for (const listener of listeners) listener(mode);
}

export function onImageScalingChange(listener: (mode: ImageScalingMode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Right-aligned slot on the same host-chrome row as the scaling picker. Anything
 * that belongs to the page rather than the 640x350 logical screen lands here, so
 * the row is built once and its owners stay independent of each other.
 */
export function hostChromeExtrasSlot(viewport: HTMLElement): HTMLElement | undefined {
  return viewport.parentElement
    ?.querySelector<HTMLElement>(":scope > .display-settings .display-settings-extras")
    ?? undefined;
}

/**
 * 同一行上「畫面縮放」右邊的槽，給桌面版的「介面縮放」用。網頁版不掛任何東西：
 * 瀏覽器自己的縮放已經做同一件事，多一組按鈕只會多一份要維護的說明。
 */
export function hostChromeInterfaceSlot(viewport: HTMLElement): HTMLElement | undefined {
  return viewport.parentElement
    ?.querySelector<HTMLElement>(":scope > .display-settings .display-settings-interface")
    ?? undefined;
}

/**
 * Mounts the scaling picker as a sibling of the viewport. Every surface rebuilds
 * `#app` on mount, so the controls are rebuilt with it rather than persisted.
 */
export function mountImageScalingControls(viewport: HTMLElement): () => void {
  const host = viewport.parentElement;
  if (!host) return () => undefined;
  const existing = host.querySelector<HTMLElement>(":scope > .display-settings");
  if (existing) return () => undefined;

  const panel = document.createElement("div");
  panel.className = "display-settings";
  panel.dataset.testid = "display-settings";
  panel.innerHTML = `
    <div class="display-settings-group" data-image-scaling-slot></div>
    <div class="display-settings-interface"></div>
    <div class="display-settings-extras"></div>
    <p class="display-settings-hint" data-testid="image-scaling-hint"></p>`;
  host.insertBefore(panel, viewport.nextSibling);

  const hint = panel.querySelector<HTMLParagraphElement>(".display-settings-hint");
  const slot = panel.querySelector<HTMLElement>("[data-image-scaling-slot]");
  if (!slot) return () => panel.remove();

  const unmountGroup = mountHostChromeRadioGroup<ImageScalingMode>({
    container: slot,
    labelId: "display-settings-label",
    labelText: "畫面縮放",
    datasetKey: "imageScaling",
    options: IMAGE_SCALING_OPTIONS.map(({ mode, label, hint: title }) => ({
      value: mode,
      label,
      testid: `image-scaling-${mode}`,
      title,
    })),
    read: imageScalingMode,
    write: setImageScalingMode,
    subscribe: onImageScalingChange,
    onRender: (mode) => {
      if (!hint) return;
      hint.textContent = IMAGE_SCALING_OPTIONS.find((option) => option.mode === mode)?.hint ?? "";
    },
  });

  return () => {
    unmountGroup();
    panel.remove();
  };
}
