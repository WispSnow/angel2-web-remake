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
/** 畫布底圖的最小邊長；隱藏或量不到尺寸時用它，不讓畫布變成 0×0。 */
const MIN_BACKING_SIZE = 16;

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
 * 改變時，把左邊 448² 的待機畫面與條帶裡的嘴形一起畫進同一塊 448² 合成畫布——兩者因此永遠取自
 * 同一幀，嘴部小塊不會落後或超前底下的臉。以 `requestAnimationFrame` 驅動而不是
 * `requestVideoFrameCallback`：卡住的視訊不再回呼，看門狗必須照樣在跑。
 *
 * `REMAKE-194` 合成結果逐次減半縮到畫布實際顯示的裝置像素再交給頁面。448 縮到 112 是 4:1，
 * 瀏覽器的雙線性縮小每 4×4 只取 2×2，線稿會斷成點線；Chrome 的畫布 `drawImage` 也不理會
 * `imageSmoothingQuality`（實測 low／medium／high 結果相同）。每次 2:1 的雙線性正好是 2×2 平均，
 * 連續減半就等於面積平均，與封面 `<img>` 的縮小一樣乾淨。
 */
export class PortraitHdPlayer {
  private readonly context: CanvasRenderingContext2D | null;
  private readonly compose: HTMLCanvasElement;
  private readonly composeContext: CanvasRenderingContext2D | null;
  /** 減半鏈的中間畫布，依邊長快取（224、112、56……）。 */
  private readonly halves = new Map<number, HTMLCanvasElement>();
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
    /**
     * 視訊載入或解碼失敗時呼叫。遊戲內的肖像把這條記錄本次執行退回原版；圖鑑在資源門之外，
     * 自己的對照切換只停在封面，不去動遊戲的回退狀態。
     */
    private readonly onFailure: (reason: string) => void = (reason) => markPortraitHdFailed(record, reason),
  ) {
    this.context = canvas.getContext("2d");
    this.compose = document.createElement("canvas");
    this.compose.width = PORTRAIT_HD_SIZE;
    this.compose.height = PORTRAIT_HD_SIZE;
    this.composeContext = this.compose.getContext("2d");
    // 理論上 `loop` 就夠了；個別瀏覽器循環沒接上時 `ended` 會觸發，從頭再播一次。
    video.addEventListener("ended", () => {
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    });
    video.addEventListener("error", () => {
      this.onFailure(video.error?.message || `media error ${video.error?.code ?? "unknown"}`);
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
    const compose = this.composeContext;
    if (!context || !compose || video.readyState < 2) return;
    const backing = this.backingSize();
    if (this.canvas.width !== backing) {
      // 改尺寸會清空畫布，下面必須重畫。
      this.canvas.width = backing;
      this.canvas.height = backing;
      this.lastVideoTime = -1;
    }
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
    compose.globalAlpha = 1;
    compose.drawImage(video, 0, 0, size, size, 0, 0, size, size);
    if (entry.mode === "tween" && entry.mouth) {
      const { patch, levels, knots } = entry.mouth;
      const w = patch.w - 2 * TILE_INSET;
      const h = patch.h - 2 * TILE_INSET;
      for (const { level, alpha } of mouthLevelLayers(openness, knots)) {
        const tile = levels[level - 1];
        compose.globalAlpha = alpha;
        compose.drawImage(video, tile.sx + TILE_INSET, tile.sy + TILE_INSET, w, h, patch.x + TILE_INSET, patch.y + TILE_INSET, w, h);
      }
    } else if (entry.mode === "continuous" && entry.speakingFrame && this.continuousAlpha > 0) {
      compose.globalAlpha = this.continuousAlpha;
      compose.drawImage(video, entry.speakingFrame.sx, entry.speakingFrame.sy, size, size, 0, 0, size, size);
    }
    compose.globalAlpha = 1;
    this.present(context, backing);
    if (this.canvas.dataset.drawn !== "true") this.canvas.dataset.drawn = "true";
    if (this.testMode) {
      this.element.dataset.mouthOpenness = entry.mode === "continuous" ? this.continuousAlpha.toFixed(3) : openness.toFixed(3);
      this.element.dataset.portraitHdVideoTime = video.currentTime.toFixed(3);
    }
  }

  /**
   * 方形畫面此刻在螢幕上佔多少裝置像素（含遊戲畫面的縮放與 `devicePixelRatio`）。全景狀態框的畫布以
   * `object-fit: cover` 填進 88×100，方形內容的邊長是兩邊較長者。比 448 大時不放大底圖，交給 CSS。
   */
  private backingSize(): number {
    const rect = this.canvas.getBoundingClientRect();
    const displayed = Math.round(Math.max(rect.width, rect.height) * (window.devicePixelRatio || 1));
    return Math.min(PORTRAIT_HD_SIZE, Math.max(MIN_BACKING_SIZE, displayed));
  }

  /** 448² 合成結果連續 2:1 減半，最後一步（不到 2:1）縮到 `target`。 */
  private present(output: CanvasRenderingContext2D, target: number): void {
    let source = this.compose;
    let size = PORTRAIT_HD_SIZE;
    while (size / 2 >= target) {
      const half = size / 2;
      let step = this.halves.get(half);
      if (!step) {
        step = document.createElement("canvas");
        step.width = half;
        step.height = half;
        this.halves.set(half, step);
      }
      const context = step.getContext("2d");
      if (!context) return;
      context.globalCompositeOperation = "copy";
      context.imageSmoothingEnabled = true;
      context.drawImage(source, 0, 0, size, size, 0, 0, half, half);
      source = step;
      size = half;
    }
    output.globalCompositeOperation = "copy";
    output.imageSmoothingEnabled = true;
    output.drawImage(source, 0, 0, size, size, 0, 0, target, target);
  }
}
