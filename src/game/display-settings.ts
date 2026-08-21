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
  if (store) saveDisplayPreferences(store, { imageScaling: mode });
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
    <span class="display-settings-label" id="display-settings-label">畫面縮放</span>
    <div class="display-settings-options" role="radiogroup" aria-labelledby="display-settings-label">
      ${IMAGE_SCALING_OPTIONS.map(({ mode, label, hint }) => `
        <button type="button" role="radio" data-image-scaling="${mode}"
          data-testid="image-scaling-${mode}" title="${hint}">${label}</button>
      `).join("")}
    </div>
    <div class="display-settings-extras"></div>
    <p class="display-settings-hint" data-testid="image-scaling-hint"></p>`;
  host.insertBefore(panel, viewport.nextSibling);

  const hint = panel.querySelector<HTMLParagraphElement>(".display-settings-hint");
  const buttons = [...panel.querySelectorAll<HTMLButtonElement>("[data-image-scaling]")];
  const render = (mode: ImageScalingMode) => {
    for (const button of buttons) {
      const selected = button.dataset.imageScaling === mode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    if (hint) {
      hint.textContent = IMAGE_SCALING_OPTIONS.find((option) => option.mode === mode)?.hint ?? "";
    }
  };

  const events = new AbortController();
  panel.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "[data-image-scaling]",
    );
    const mode = button?.dataset.imageScaling;
    if (mode === "sharp" || mode === "smooth" || mode === "integer") setImageScalingMode(mode);
  }, { signal: events.signal });
  panel.addEventListener("keydown", (event) => {
    // The battle, startup and ending surfaces all bind `keydown` on `window`, so
    // an unstopped press here would move the battle cursor or advance the ending
    // while the player is only picking a filter. Focus inside host chrome must
    // never reach the battlefield, so every key is stopped, not just the handled
    // ones. `stopPropagation` alone still lets Tab move focus and Space/Enter
    // activate the focused button.
    event.stopPropagation();
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight"
      && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    // Arrow keys are the expected radiogroup interaction and the only way to reach
    // the unselected options once roving tabindex has parked focus on the current one.
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = buttons[(index + delta + buttons.length) % buttons.length];
    const mode = next.dataset.imageScaling;
    if (mode === "sharp" || mode === "smooth" || mode === "integer") setImageScalingMode(mode);
    next.focus();
  }, { signal: events.signal });

  const unsubscribe = onImageScalingChange(render);
  render(imageScalingMode());
  return () => {
    events.abort();
    unsubscribe();
    panel.remove();
  };
}
