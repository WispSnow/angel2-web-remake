import { pendingPresentationWork } from "../presentation-probe";

/**
 * 準備門的「畫面備妥」判定。程式時鐘已經凍結，背景裡還在跑的只剩下載與解碼：表現層登記的
 * 工作（音樂解碼、Phaser 第一幀）、頁面上的 `<video>` 第一個可播放幀、`<img>` 與字型。
 * 連續數幀都沒有未完成項目才放行，避免剛完成一項、下一項才被掛上的空檔被當成備妥。
 */

const STABLE_FRAMES = 3;
const POLL_MS = 100;

const nextFrame = (): Promise<void> => new Promise((resolve) => {
  requestAnimationFrame(() => resolve());
});

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const describeMedia = (element: HTMLMediaElement | HTMLImageElement): string => {
  const source = element instanceof HTMLImageElement ? element.currentSrc || element.src : element.currentSrc || element.src;
  const name = source.startsWith("blob:") ? "blob" : source.split("/").slice(-2).join("/");
  return `${element.tagName.toLowerCase()} ${name}`;
};

/** 已指定來源卻還沒有可畫內容的 `<video>`／`<img>`；出錯的算完成（播放器自己會退回原版）。 */
function pendingMedia(root: ParentNode): (HTMLVideoElement | HTMLImageElement)[] {
  const pending: (HTMLVideoElement | HTMLImageElement)[] = [];
  for (const video of root.querySelectorAll("video")) {
    if (!video.currentSrc && !video.getAttribute("src")) continue;
    if (video.error || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) continue;
    pending.push(video);
  }
  for (const image of root.querySelectorAll("img")) {
    if (!image.getAttribute("src") || image.complete) continue;
    pending.push(image);
  }
  return pending;
}

export interface PresentationReadiness {
  /** 逾時仍未完成的項目；空陣列表示全部備妥。 */
  readonly warnings: readonly string[];
}

export async function waitForPresentationReadiness(
  options: { readonly timeoutMs?: number; readonly root?: ParentNode } = {},
): Promise<PresentationReadiness> {
  const deadline = performance.now() + (options.timeoutMs ?? 20_000);
  const root = options.root ?? document;
  let stable = 0;
  for (;;) {
    await nextFrame();
    const work = pendingPresentationWork();
    const media = pendingMedia(root);
    const fontsLoading = document.fonts.status === "loading";
    if (work.length === 0 && media.length === 0 && !fontsLoading) {
      stable += 1;
      if (stable >= STABLE_FRAMES) return { warnings: [] };
      continue;
    }
    stable = 0;
    if (performance.now() >= deadline) {
      return {
        warnings: [
          ...(work.length > 0 ? [`${work.length} 項表現工作未完成`] : []),
          ...media.map((element) => `${describeMedia(element)} 未備妥`),
          ...(fontsLoading ? ["字型仍在載入"] : []),
        ],
      };
    }
    await Promise.race([
      Promise.allSettled([...work, document.fonts.ready]),
      wait(POLL_MS),
    ]);
  }
}
