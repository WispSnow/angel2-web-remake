import { stagedRenderAssetSource } from "./staged-render-asset-cache";

/**
 * CSS cannot call the staged render bridge on its own. Keep the semantic source
 * URLs here and replace only their current-surface values with object URLs when
 * a resource-pack lease is active; standalone labs naturally keep the sources.
 */
export const NATIVE_UI_CSS_ASSETS = {
  "--native-cursor-hand-image": "/assets/original/command-menu-pointer.png",
  "--native-cursor-up-image": "/assets/original/native-cursor-up.png",
  "--native-cursor-down-image": "/assets/original/native-cursor-down.png",
  "--native-cursor-left-image": "/assets/original/native-cursor-left.png",
  "--native-cursor-right-image": "/assets/original/native-cursor-right.png",
  "--native-command-menu-top-image": "/assets/original/command-menu-top.png",
  "--native-command-menu-bottom-image": "/assets/original/command-menu-bottom.png",
  "--native-command-menu-side-image": "/assets/original/command-menu-side.png",
  "--native-command-menu-selection-image": "/assets/original/command-menu-selection.png",
  "--native-command-menu-pointer-image": "/assets/original/command-menu-pointer.png",
} as const;

export const NATIVE_UI_CSS_ASSET_URLS = [...new Set(Object.values(NATIVE_UI_CSS_ASSETS))];

export function applyStagedNativeUiAssets(target: HTMLElement): void {
  for (const [property, url] of Object.entries(NATIVE_UI_CSS_ASSETS)) {
    target.style.setProperty(property, `url(${JSON.stringify(stagedRenderAssetSource(url))})`);
    target.style.setProperty(property.replace(/-image$/u, "-source"), JSON.stringify(url));
  }
}
