import {
  DEFAULT_DISPLAY_PREFERENCES,
  loadDisplayPreferences,
  saveDisplayPreferences,
  type ImageScalingMode,
} from "./preferences";

/**
 * Host-display settings stay out of the original sub-menu on purpose. The
 * in-battle sub-menu reproduces the original's fixed five-row box, so a sixth
 * row would falsify that layout evidence; picking how the browser resamples the
 * finished frame is the same class of choice as browser zoom and lives in the
 * host menu (`host-menu.ts`) instead.
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
