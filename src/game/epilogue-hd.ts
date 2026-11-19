import type { StoryHdEpilogueSpread } from "./content/story-hd";
import { isProgramPaused, programNow } from "./program-clock";
import { stagedRenderAssetSource } from "./staged-render-asset-cache";
import { markEpilogueHdFailed } from "./story-hd-style";

/** 這麼久還沒有第一幀，這段尾聲就照原版畫（不擋住尾聲本身的計時）。 */
const FIRST_FRAME_TIMEOUT_MS = 6_000;
/** 視訊時間與這段尾聲已過的時間差超過這麼多秒才重新對齊（同高清開場）。 */
const MAX_DRIFT_SECONDS = 0.25;

/**
 * `REMAKE-200` 結局尾聲的高清畫面：一段只播一次、長度涵蓋整段尾聲的視訊，蓋在原版兩張半圖上面、
 * 打字畫布下面。原版模組 35 本來就自動推進，一段尾聲停留的時間有上限（`max(等待, 打字)`，旁白還在
 * 說就再等它），所以不循環；視訊時間跟著這段尾聲開始後的程式時間走，程式暫停時一起停，播到最後一幀
 * 就停在那裡。
 *
 * 只換表現：文字、計時、旁白與推進都照原版流程。第一幀沒到或解碼失敗時移除視訊，兩張原版半圖本來就在下面。
 */
export class EpilogueHdPlayer {
  readonly video: HTMLVideoElement;
  private animationFrame?: number;
  private startedAt?: number;
  private disposed = false;

  constructor(host: HTMLElement, private readonly spread: StoryHdEpilogueSpread, before: Element | null) {
    const video = document.createElement("video");
    video.className = "stage49-epilogue-hd";
    video.dataset.testid = "stage49-epilogue-hd";
    // `src` 是資源門那份位元組的物件網址；原始 URL 留給驗收讀取。
    video.dataset.sourceUrl = spread.video.source;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("aria-hidden", "true");
    video.src = stagedRenderAssetSource(spread.video.source);
    host.insertBefore(video, before);
    this.video = video;
  }

  /** 第一幀可畫時兌現 `true`；逾時或失敗時移除視訊、記下失敗並兌現 `false`。不會拒絕。 */
  ready(): Promise<boolean> {
    const video = this.video;
    return new Promise<boolean>((resolve) => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve(true);
        return;
      }
      const settle = (ok: boolean, reason = "") => {
        window.clearTimeout(timer);
        video.removeEventListener("loadeddata", loaded);
        video.removeEventListener("error", failed);
        if (!ok && !this.disposed) {
          markEpilogueHdFailed(this.spread, reason);
          this.dispose();
        }
        resolve(ok && !this.disposed);
      };
      const loaded = () => settle(true);
      const failed = () => settle(false, "video failed to load");
      const timer = window.setTimeout(() => settle(false, "no first frame in time"), FIRST_FRAME_TIMEOUT_MS);
      video.addEventListener("loadeddata", loaded);
      video.addEventListener("error", failed);
    });
  }

  /** 這段尾聲從 `startedAt`（程式時間）開始：視訊從頭播，之後每幀對齊。 */
  start(startedAt: number): void {
    if (this.disposed) return;
    this.startedAt = startedAt;
    if (this.animationFrame === undefined) this.animationFrame = requestAnimationFrame(this.tick);
  }

  private readonly tick = () => {
    this.animationFrame = undefined;
    if (this.disposed || this.startedAt === undefined) return;
    const video = this.video;
    if (isProgramPaused()) {
      if (!video.paused) video.pause();
    } else {
      const target = (programNow() - this.startedAt) / 1000;
      const last = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
      const time = Math.min(target, last);
      if (Math.abs(video.currentTime - time) > MAX_DRIFT_SECONDS) video.currentTime = time;
      if (video.paused && target < last) void video.play().catch(() => undefined);
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    const video = this.video;
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
}
