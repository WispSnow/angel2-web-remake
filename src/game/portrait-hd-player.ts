import type { PortraitRecord } from "./content/portrait-catalog.generated";
import type { PortraitHdEntry } from "./content/portrait-hd";
import { PORTRAIT_HD_SIZE } from "./content/portrait-hd.generated";
import { mouthLevelLayers } from "./portrait-speech";
import { markPortraitHdFailed } from "./portrait-style";

/**
 * 嘴形格四邊各內縮 3 px 再畫：瀏覽器對視訊做色度上採樣時，格子最外一圈會混入條帶裡相鄰的
 * 內容（畫面右緣、下一格），整格貼回會出現一圈淡框（計畫文件第 23.9 節）。嘴形離格邊都在
 * 8 px 以上，內縮不會切到嘴。
 */
const TILE_INSET = 3;
/** 龍王、妖龍的整幅說話畫面淡入淡出長度（計畫文件第 17.6 節）。 */
const CONTINUOUS_FADE_MS = 120;
/** 視訊卡住（時間不前進）這麼久就從頭重播；第二次起連同重新載入。 */
const STALL_MS = 900;

export interface PortraitHdFrame {
  readonly paused: boolean;
  readonly visible: boolean;
  /** `tween` 的張口程度 0–1。 */
  readonly openness: number;
  /** `continuous` 是否正在說話。 */
  readonly talking: boolean;
  /** 程式時鐘（暫停時凍結）。 */
  readonly now: number;
}

/**
 * 一張高清肖像的播放器：靜音、內聯、循環的 `<video>` 只當作解碼來源，每次有新的一幀或口型
 * 改變時，把左邊 448² 的待機畫面與條帶裡的嘴形一起畫進同一塊畫布——兩者因此永遠取自同一幀，
 * 嘴部小塊不會落後或超前底下的臉。以 `requestAnimationFrame` 驅動而不是
 * `requestVideoFrameCallback`：卡住的視訊不再回呼，看門狗必須照樣在跑。
 */
export class PortraitHdPlayer {
  private readonly context: CanvasRenderingContext2D | null;
  private lastVideoTime = -1;
  private lastOpenness = -1;
  private lastContinuousAlpha = -1;
  private continuousAlpha = 0;
  private lastNow?: number;
  private stall?: { time: number; since: number; tries: number };
  private playRequested = false;

  constructor(
    readonly element: HTMLElement,
    readonly record: PortraitRecord,
    readonly entry: PortraitHdEntry,
    readonly video: HTMLVideoElement,
    readonly canvas: HTMLCanvasElement,
    private readonly testMode: boolean,
  ) {
    this.context = canvas.getContext("2d");
    // 理論上 `loop` 就夠了；個別瀏覽器循環沒接上時 `ended` 會觸發，從頭再播一次。
    video.addEventListener("ended", () => {
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    });
    video.addEventListener("error", () => {
      markPortraitHdFailed(record, video.error?.message || `media error ${video.error?.code ?? "unknown"}`);
    });
  }

  sync(frame: PortraitHdFrame): void {
    const { video } = this;
    if (!frame.visible || frame.paused) {
      if (!video.paused) video.pause();
      this.playRequested = false;
      this.stall = undefined;
      this.lastNow = frame.now;
      if (frame.visible) this.draw(frame);
      return;
    }
    if (video.paused && !this.playRequested) {
      this.playRequested = true;
      void video.play().then(() => {
        this.element.dataset.portraitHdVideo = "playing";
      }).catch((error: unknown) => {
        // 不允許自動播放（例如省電模式）時停在封面：仍是同一套高清肖像，只是不動。
        this.element.dataset.portraitHdVideo = "blocked";
        if (error instanceof Error && error.name !== "NotAllowedError" && error.name !== "AbortError") {
          console.warn(`HD portrait D/${this.record} could not play`, error);
        }
      }).finally(() => {
        this.playRequested = false;
      });
    }
    this.watchdog(frame.now);
    this.draw(frame);
  }

  private watchdog(now: number): void {
    const { video } = this;
    if (video.paused || video.readyState < 2) {
      this.stall = undefined;
      return;
    }
    const stall = this.stall;
    if (!stall || stall.time !== video.currentTime) {
      this.stall = { time: video.currentTime, since: now, tries: stall?.tries ?? 0 };
      return;
    }
    if (now - stall.since < STALL_MS) return;
    stall.since = now;
    stall.tries += 1;
    if (stall.tries > 1) video.load();
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }

  private draw(frame: PortraitHdFrame): void {
    const { video, context, entry } = this;
    const elapsed = this.lastNow === undefined ? 0 : Math.max(0, frame.now - this.lastNow);
    this.lastNow = frame.now;
    if (entry.mode === "continuous") {
      const target = frame.talking ? 1 : 0;
      const step = elapsed / CONTINUOUS_FADE_MS;
      this.continuousAlpha = target > this.continuousAlpha
        ? Math.min(target, this.continuousAlpha + step)
        : Math.max(target, this.continuousAlpha - step);
    }
    if (!context || video.readyState < 2) return;
    const openness = entry.mode === "tween" ? Math.round(frame.openness * 1000) / 1000 : 0;
    if (video.currentTime === this.lastVideoTime
      && openness === this.lastOpenness
      && this.continuousAlpha === this.lastContinuousAlpha) {
      return;
    }
    this.lastVideoTime = video.currentTime;
    this.lastOpenness = openness;
    this.lastContinuousAlpha = this.continuousAlpha;
    const size = PORTRAIT_HD_SIZE;
    context.globalAlpha = 1;
    context.drawImage(video, 0, 0, size, size, 0, 0, size, size);
    if (entry.mode === "tween" && entry.mouth) {
      const { patch, levels, knots } = entry.mouth;
      const w = patch.w - 2 * TILE_INSET;
      const h = patch.h - 2 * TILE_INSET;
      for (const { level, alpha } of mouthLevelLayers(openness, knots)) {
        const tile = levels[level - 1];
        context.globalAlpha = alpha;
        context.drawImage(video, tile.sx + TILE_INSET, tile.sy + TILE_INSET, w, h, patch.x + TILE_INSET, patch.y + TILE_INSET, w, h);
      }
    } else if (entry.mode === "continuous" && entry.speakingFrame && this.continuousAlpha > 0) {
      context.globalAlpha = this.continuousAlpha;
      context.drawImage(video, entry.speakingFrame.sx, entry.speakingFrame.sy, size, size, 0, 0, size, size);
    }
    context.globalAlpha = 1;
    if (this.canvas.dataset.drawn !== "true") this.canvas.dataset.drawn = "true";
    if (this.testMode) {
      this.element.dataset.mouthOpenness = entry.mode === "continuous" ? this.continuousAlpha.toFixed(3) : openness.toFixed(3);
      this.element.dataset.portraitHdVideoTime = video.currentTime.toFixed(3);
    }
  }
}
