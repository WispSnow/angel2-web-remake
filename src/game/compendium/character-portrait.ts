import type { CharacterEntry } from "./character-compendium";
import { isPortraitRecord } from "../content/portrait-catalog.generated";
import { PortraitHdPlayer } from "../portrait-hd-player";

export interface CharacterPortraitController {
  destroy(): void;
}

/**
 * 角色圖鑑的高清肖像播放：沿用遊戲內的 `PortraitHdPlayer`（同一套 448² 合成與逐次減半），只播
 * 待機循環、嘴保持閉合，和全景戰鬥狀態框（`REMAKE-194`）一樣。
 *
 * 圖鑑在資源門之外，檔案不在租約裡時直接向原始網址請求；視訊失敗就停在封面，不回報給
 * `portrait-style`——那份回退狀態屬於遊戲裡正在用的肖像，查圖鑑不應讓戰場上的臉換回原版。
 * 圖鑑開著時遊戲照常運行，所以不跟程式暫停走。
 */
export function mountCharacterPortrait(
  detail: HTMLElement,
  entry: CharacterEntry,
): CharacterPortraitController | undefined {
  const figure = detail.querySelector<HTMLElement>(".rn-figure-hd");
  const video = figure?.querySelector<HTMLVideoElement>("video");
  const canvas = figure?.querySelector<HTMLCanvasElement>("canvas");
  const record = entry.portraitRecord;
  if (!figure || !video || !canvas || !entry.portraitHd || !isPortraitRecord(record)) return undefined;

  let animationFrame = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(animationFrame);
  };
  const player = new PortraitHdPlayer(figure, record, entry.portraitHd, video, canvas, false, (reason) => {
    // 失敗的視訊每幀都會再被叫去播放；先停下迴圈，畫面留在封面。
    stop();
    figure.dataset.portraitHdVideo = "failed";
    console.warn(`compendium HD portrait D/${record} stays on its poster: ${reason}`);
  });
  const tick = (now: number) => {
    if (stopped) return;
    player.sync({
      paused: false,
      visible: figure.isConnected && figure.getClientRects().length > 0,
      openness: 0,
      talking: false,
      now,
    });
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);

  return {
    destroy() {
      stop();
      // 換角色或關閉圖鑑後放掉解碼器，不讓離開文件的視訊繼續佔著它。
      player.dispose();
    },
  };
}
