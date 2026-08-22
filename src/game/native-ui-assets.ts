import { onStagedRenderAssetsChanged, stagedRenderAssetSource } from "./staged-render-asset-cache";

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
  "--native-objective-edge-top-image": "/assets/original/objective-panel-edge-top.png",
  "--native-objective-edge-bottom-image": "/assets/original/objective-panel-edge-bottom.png",
  "--native-objective-corner-image": "/assets/original/objective-panel-corner.png",
} as const;

export const NATIVE_UI_CSS_ASSET_URLS = [...new Set(Object.values(NATIVE_UI_CSS_ASSETS))];

// 這些變數寫在長命的宿主元素上（`#app`、邏輯螢幕），不會隨每次 render 重寫，因此
// 換包時得自己回來重解一次；否則舊租約的物件網址會留在樣式裡，等到選單或游標
// 下次要用才抓到已被回收的 `blob:`。
const stagedNativeUiTargets = new Set<HTMLElement>();

function writeStagedNativeUiAssets(target: HTMLElement): void {
  for (const [property, url] of Object.entries(NATIVE_UI_CSS_ASSETS)) {
    target.style.setProperty(property, `url(${JSON.stringify(stagedRenderAssetSource(url))})`);
    target.style.setProperty(property.replace(/-image$/u, "-source"), JSON.stringify(url));
  }
}

onStagedRenderAssetsChanged(() => {
  for (const target of stagedNativeUiTargets) {
    // 已離開文件的宿主不會再繪製，留著只會讓集合無限長大。
    if (!target.isConnected) stagedNativeUiTargets.delete(target);
    else writeStagedNativeUiAssets(target);
  }
});

export function applyStagedNativeUiAssets(target: HTMLElement): void {
  stagedNativeUiTargets.add(target);
  writeStagedNativeUiAssets(target);
}
