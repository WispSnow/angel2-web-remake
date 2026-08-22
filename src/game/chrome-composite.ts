import { ASSETS } from "./content/stage0";
import { LOGICAL_SCREEN_HEIGHT } from "./scaling-constants";
import { loadStagedRenderImage, stagedRenderAssetSource } from "./staged-render-asset-cache";

/**
 * 把一組原版邊框圖磚合成為單一繪製矩形。
 *
 * 原版的每一塊邊框都是獨立圖磚，之前它們各自是一個絕對定位的 `<img>`。整個
 * 640x350 邏輯畫面靠 `scaling.ts` 的一次 `transform: scale()` 放大——縮放倍率
 * 不是整數倍時（桌面版視窗幾乎總是如此），每塊圖磚的目標矩形邊界就落在半個
 * 裝置像素上，瀏覽器對每塊單獨做邊緣抗鋸齒：相鄰兩塊各覆蓋約一半，疊起來仍
 * 漏出下層顏色，接縫因此變成一條裝置像素寬的裂紋。
 *
 * 把同一組圖磚按原版落點畫進同一張畫布後，整層只剩一個繪製矩形，內部再沒有
 * 邊界可以抗鋸齒。每個 PNG 的原始尺寸與它的落點框完全一致，所以合成是 1:1
 * 無損搬運，不引入任何重採樣；整數倍縮放下的像素與拆成多塊時逐位元組相同。
 * 圖磚之間刻意留白的縫（右欄 y=149 那一列）也照樣留白，只是從「兩邊各抗鋸齒
 * 一半」變回一條乾淨的最近鄰硬邊。
 */

interface ChromeTile {
  readonly source: string;
  readonly x: number;
  readonly y: number;
}

export interface ChromeCompositeSpec {
  readonly className: string;
  readonly testId: string;
  readonly width: number;
  readonly height: number;
  /** 只有承載了原版描述的邊框需要；其餘純裝飾，掛 `aria-hidden`。 */
  readonly label?: string;
  readonly tiles: readonly ChromeTile[];
}

/**
 * 戰場視窗畫框。左側 480 px；右欄底板另外由 `.right-panel-backdrop` 鋪——它的
 * 左緣、畫框的右緣與右欄各面板的左緣本來就都落在 x=480，三條邊對齊，把底板併
 * 進畫布反而會讓黑底改由最近鄰取樣定位、與另外兩條抗鋸齒的邊錯開半格。
 *
 * 雕像前景必須併進同一層。它畫的是被戰場切開的雕像另外半邊，原本單獨掛在
 * 畫布之上（z-index 5）而畫框在其下（z-index 4）；只合成畫框、把雕像留在
 * 外面的話，x=40 與 x=440 這條玩家最容易看到的裂紋不但還在，還會因為畫框
 * 內緣從「半透明混合」變成「硬切」而更明顯。兩層之間沒有任何其他元素，所以
 * 併層不改變任何遮擋關係。
 *
 * 這一層仍必須畫在戰場畫布之上，理由見 `styles.css` 的 `.battle-backdrop` 註解。
 */
export const BATTLE_CHROME_COMPOSITE: ChromeCompositeSpec = {
  className: "battle-chrome-frame",
  testId: "battle-chrome-frame",
  width: 480,
  height: LOGICAL_SCREEN_HEIGHT,
  // 原版落點，順序沿用併層前的繪製順序。實際上 11 塊互不重疊，所以順序不影響
  // 結果——保留原順序只是為了對照舊的 DOM 疊放。
  tiles: [
    { source: ASSETS.battleChrome.top, x: 0, y: 0 },
    { source: ASSETS.battleChrome.cornerLeft, x: 0, y: 23 },
    { source: ASSETS.battleChrome.cornerRight, x: 440, y: 23 },
    { source: ASSETS.battleChrome.glass, x: 0, y: 57 },
    { source: ASSETS.battleChrome.glass, x: 440, y: 57 },
    { source: ASSETS.battleChrome.sideLeft, x: 0, y: 137 },
    { source: ASSETS.battleChrome.sideRight, x: 440, y: 137 },
    { source: ASSETS.battleChrome.bottomLeft, x: 0, y: 331 },
    { source: ASSETS.battleChrome.bottomRight, x: 400, y: 331 },
    { source: ASSETS.battleChrome.statueForegroundLeft, x: 40, y: 140 },
    { source: ASSETS.battleChrome.statueForegroundRight, x: 408, y: 140 },
  ],
};

/**
 * 右欄單位資料框：上半的肖像框與下半的數值框。兩塊原本同為 z-index 2 且相鄰，
 * 中間沒有其他元素，所以直接併層；肖像與底色留在下面，數值文字留在上面。
 * 本地 y=149 那一列兩塊都不畫，讓 `.unit-detail-shade` 透出來——原版就是這樣
 * 分隔上下兩半的。
 */
export const UNIT_DETAIL_CHROME_COMPOSITE: ChromeCompositeSpec = {
  className: "hud-unit-frame",
  testId: "hud-unit-frame",
  width: 160,
  height: 321,
  tiles: [
    { source: ASSETS.sidePanelChrome.unitTop, x: 0, y: 0 },
    { source: ASSETS.sidePanelChrome.unitBody, x: 0, y: 150 },
  ],
};

/**
 * 右欄戰術面板：上半的戰術桌底圖與下半的小地圖框。這兩塊原本隔著開關狀態圖
 * （z-index 1）與小地圖（z-index 1），不能就地併層；但開關只落在上半、小地圖
 * 只落在下半的框內，所以把小地圖降到 z-index 0、合成層放 z-index 1、開關升到
 * z-index 2，疊放次序（小地圖 → 邊框 → 開關）與併層前完全相同。
 */
export const TACTICAL_PANEL_CHROME_COMPOSITE: ChromeCompositeSpec = {
  className: "tactical-panel-frame",
  testId: "tactical-panel-frame",
  width: 160,
  height: 321,
  label: "戰術桌、卷軸與照明器具",
  tiles: [
    { source: ASSETS.tacticalPanel.foundation, x: 0, y: 0 },
    { source: ASSETS.sidePanelChrome.minimap, x: 0, y: 150 },
  ],
};

export interface ChromeComposite {
  readonly element: HTMLCanvasElement;
  dispose(): void;
}

/**
 * 優先取資源包已經解碼好的影像：關卡表面掛載前 `decodeStagedRenderImages` 已經
 * 對這幾張建立過解碼屏障，所以正常路徑上這裡只是拿現成的 `HTMLImageElement`，
 * 合成落在同一個微任務裡完成，不會有一幀空邊框。沒有啟用資源包的路徑（實驗室、
 * 部分測試入口）退回普通 `<img>` 解碼，與併層前的載入方式相同。
 */
async function decodeChromeTile(source: string): Promise<HTMLImageElement> {
  const staged = loadStagedRenderImage(source);
  if (staged) return staged;
  const image = document.createElement("img");
  image.decoding = "sync";
  image.src = stagedRenderAssetSource(source);
  await image.decode();
  return image;
}

/**
 * 合成層在掛載時建立一次就長期持有。右欄每次 `render` 都會重建 HTML，所以呼叫
 * 端是把同一個畫布重新 `append` 回新的容器，而不是重新合成——畫布內容在脫離
 * 文件期間不會丟失。
 */
export function createChromeComposite(spec: ChromeCompositeSpec): ChromeComposite {
  const element = document.createElement("canvas");
  element.className = spec.className;
  element.dataset.testid = spec.testId;
  element.width = spec.width;
  element.height = spec.height;
  if (spec.label === undefined) element.setAttribute("aria-hidden", "true");
  else {
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", spec.label);
  }
  const context = element.getContext("2d");
  if (!context) throw new Error(`the ${spec.className} composite needs a 2D context`);
  context.imageSmoothingEnabled = false;

  let disposed = false;
  // 併層前每塊 `<img>` 各自解碼；這裡一次等齊，再一次畫完。
  const painted = (async () => {
    const images = await Promise.all(spec.tiles.map((tile) => decodeChromeTile(tile.source)));
    if (disposed) return;
    for (const [index, tile] of spec.tiles.entries()) {
      context.drawImage(images[index], tile.x, tile.y);
    }
  })();
  // 解碼失敗時留一張空邊框，而不是把整個 HUD 帶下去——與原生字型層同樣的取捨。
  // 真正的資源缺失由資源包的重試介面處理，不在這裡重複報錯。
  void painted.catch(() => undefined);

  return {
    element,
    dispose() {
      disposed = true;
      element.remove();
    },
  };
}
