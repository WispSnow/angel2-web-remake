import type { StoryHdEntry, StoryHdVideo } from "./content/story-hd";
import { isProgramPaused } from "./program-clock";
import { stagedRenderAssetSource } from "./staged-render-asset-cache";
import { markStoryHdFailed } from "./story-hd-style";

/** 視訊卡住（時間不前進）這麼久就從頭重播；第二次起連同重新載入（同高清肖像）。 */
const STALL_MS = 900;
/** 分頁回到前景等長時間停頓之後，雲層一幀最多前進這麼多時間，不會一下子跳一大段。 */
const MAX_SKY_STEP_MS = 100;

/**
 * `REMAKE-196` 劇情插圖的全畫面高清循環，掛在 `#story-background` 裡，對白窗、肖像與逐字節奏照舊疊在上面。
 *
 * 三種插圖：
 * - 一般循環：靜音、內聯、循環的 `<video>`，`object-fit: cover` 鋪滿 640×350 的邏輯畫面。縮放比在 2:1 以內，
 *   瀏覽器的雙線性縮放不會斷線。
 * - 有雲層：使用者要雲用獨立圖層當背景捲軸（2026-11-18），不能隨循環先飄再退回。`<canvas>` 每幀先畫
 *   等速捲動的平鋪雲層，再乘上 `stacked` 視訊下半的 `1 − alpha`、加上上半已乘過 alpha 的前景：
 *   `sky × (1 − a) + 前景 × a`，只用 2D 畫布的 `multiply` 與 `lighter`。視訊本身透明地留在畫布下面解碼。
 *   雲層位移以雲層檔為單位保留：同一段劇情換到共用雲層的插圖（`BK/5`→`BK/31`、`BK/10`→`BK/12`）雲不會跳回原位。
 *   換到另一張有雲層的插圖時沿用同一塊畫布，新視訊就緒前畫布停在上一張的最後一幀；只有全新的畫布才先畫封面
 *   （位移 0 的合成），否則封面的雲會閃一下再跳到保留的位置。
 *   雲層先在離屏畫布上按整數位置平鋪成一條長帶，每幀只從中取一段（小數起點）畫一次：把平鋪塊各畫在小數位置，
 *   相鄰兩塊的邊緣像素都只蓋一部分，底下的黑色會透出成一條細黑縫（使用者 2026-11-18 第四輪評審）。
 * - 靜止畫：只有封面（`BK/13`）。
 *
 * 播放與捲動都跟著程式暫停凍結；換頁時同一張插圖沿用同一組元素，不會從頭播。
 */
export class StoryHdLayer {
  private video?: HTMLVideoElement;
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private sky?: HTMLImageElement;
  /** 雲層按整數位置平鋪成的長帶（至少寬一個畫面加一個週期），以雲層檔為鍵沿用。 */
  private skyBand?: { source: string; canvas: HTMLCanvasElement };
  private poster?: HTMLImageElement;
  private still?: HTMLImageElement;
  private entry?: StoryHdEntry;
  private animationFrame?: number;
  private lastFrameAt?: number;
  private stall?: { time: number; since: number; tries: number };
  private playRequested = false;
  /** 畫布上已有完整合成（之後換插圖時保留到新視訊就緒，不再畫封面）。 */
  private canvasHasFrame = false;
  private readonly skyOffsets = new Map<string, number>();

  constructor(private readonly host: HTMLElement) {}

  /** 顯示這張插圖的高清版；`undefined` 時拆掉，宿主照原版畫插圖。 */
  show(entry: StoryHdEntry | undefined): void {
    if (entry === this.entry) return;
    const keepCanvas = Boolean(entry?.video && entry.sky && this.canvas);
    this.clear(keepCanvas);
    if (!entry) {
      // 插圖收起或改回原版：下一次出現的雲層從封面的位置重新開始
      this.skyOffsets.clear();
      return;
    }
    this.entry = entry;
    this.host.dataset.storyStyle = "hd";
    this.host.dataset.storyHdBackground = String(entry.background);
    if (!entry.video) {
      this.still = this.image(entry, entry.poster, "story-hd-still");
      this.host.dataset.storyHdKind = "still";
      this.host.append(this.still);
      return;
    }
    const video = this.createVideo(entry, entry.video);
    this.video = video;
    if (entry.sky) {
      if (!this.canvas) {
        const canvas = document.createElement("canvas");
        canvas.className = "story-hd-canvas";
        canvas.dataset.testid = "story-hd-canvas";
        canvas.width = entry.video.width;
        canvas.height = entry.video.height / 2;
        canvas.setAttribute("aria-hidden", "true");
        this.canvas = canvas;
        this.context = canvas.getContext("2d", { alpha: false }) ?? undefined;
        this.canvasHasFrame = false;
        this.host.append(canvas);
      }
      this.sky = this.image(entry, entry.sky.source);
      this.poster = this.image(entry, entry.poster);
      this.host.dataset.storyHdKind = "sky";
      this.host.dataset.storyHdSkySource = entry.sky.source;
      this.host.insertBefore(video, this.canvas);
    } else {
      this.host.dataset.storyHdKind = "video";
      this.host.append(video);
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    this.clear();
    this.skyOffsets.clear();
    this.skyBand = undefined;
  }

  private image(entry: StoryHdEntry, url: string, className?: string): HTMLImageElement {
    const image = new Image();
    if (className) {
      image.className = className;
      image.dataset.testid = className;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
    }
    image.decoding = "async";
    image.addEventListener("error", () => markStoryHdFailed(entry, `image failed: ${url}`));
    image.dataset.sourceUrl = url;
    image.src = stagedRenderAssetSource(url);
    return image;
  }

  private createVideo(entry: StoryHdEntry, source: StoryHdVideo): HTMLVideoElement {
    const video = document.createElement("video");
    video.className = "story-hd-video";
    video.dataset.testid = "story-hd-video";
    // `src` 是資源門那份位元組的物件網址；原始 URL 留給驗收讀取。
    video.dataset.sourceUrl = source.source;
    if (source.alpha) video.dataset.alpha = source.alpha;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.setAttribute("aria-hidden", "true");
    // 疊加式視訊的上下兩半不能直接顯示，封面交給畫布畫。
    if (!source.alpha) video.poster = stagedRenderAssetSource(entry.poster);
    // 理論上 `loop` 就夠了；個別瀏覽器循環沒接上時 `ended` 會觸發，從頭再播一次。
    video.addEventListener("ended", () => {
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    });
    video.addEventListener("error", () => {
      markStoryHdFailed(entry, video.error?.message || `media error ${video.error?.code ?? "unknown"}`);
    });
    video.src = stagedRenderAssetSource(source.source);
    return video;
  }

  private readonly tick = (now: number): void => {
    const step = this.lastFrameAt === undefined ? 0 : Math.min(MAX_SKY_STEP_MS, Math.max(0, now - this.lastFrameAt));
    this.lastFrameAt = now;
    const running = !this.host.hidden && !isProgramPaused();
    this.sync(now, running);
    if (this.canvas) {
      if (running) this.advanceSky(step);
      if (!this.host.hidden) this.draw();
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private advanceSky(ms: number): void {
    const sky = this.entry?.sky;
    if (!sky) return;
    const offset = ((this.skyOffsets.get(sky.source) ?? 0) + (sky.speed * ms) / 1000) % sky.width;
    const wrapped = offset < 0 ? offset + sky.width : offset;
    this.skyOffsets.set(sky.source, wrapped);
    this.host.dataset.storyHdSkyOffset = wrapped.toFixed(1);
  }

  private draw(): void {
    const { context, canvas, entry, video, sky, poster } = this;
    if (!context || !canvas || !entry?.sky || !video) return;
    const width = canvas.width;
    const height = canvas.height;
    context.globalCompositeOperation = "source-over";
    const frameReady = video.readyState >= 2 && video.videoWidth > 0;
    const skyReady = sky?.complete === true && sky.naturalWidth > 0;
    if (!frameReady || !skyReady) {
      if (!this.canvasHasFrame && poster?.complete && poster.naturalWidth > 0) context.drawImage(poster, 0, 0, width, height);
      return;
    }
    const band = this.band(entry.sky, sky, width);
    if (!band) return;
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const tile = entry.sky.width;
    const offset = this.skyOffsets.get(entry.sky.source) ?? 0;
    // 雲層內容向右移 offset：畫面 x 取長帶的 x + (tile − offset)，一次畫完，沒有平鋪縫
    context.drawImage(band, tile - offset, 0, width, entry.sky.height, 0, 0, width, entry.sky.height);
    context.globalCompositeOperation = "multiply";
    context.drawImage(video, 0, height, width, height, 0, 0, width, height);
    context.globalCompositeOperation = "lighter";
    context.drawImage(video, 0, 0, width, height, 0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    this.canvasHasFrame = true;
  }

  private band(spec: NonNullable<StoryHdEntry["sky"]>, sky: HTMLImageElement, width: number): HTMLCanvasElement | undefined {
    if (this.skyBand?.source === spec.source) return this.skyBand.canvas;
    const canvas = document.createElement("canvas");
    const copies = Math.ceil(width / spec.width) + 2;
    canvas.width = spec.width * copies;
    canvas.height = spec.height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    for (let k = 0; k < copies; k += 1) context.drawImage(sky, k * spec.width, 0, spec.width, spec.height);
    this.skyBand = { source: spec.source, canvas };
    return canvas;
  }

  private sync(now: number, running: boolean): void {
    const { video } = this;
    if (!video) return;
    if (!running) {
      if (!video.paused) video.pause();
      this.playRequested = false;
      this.stall = undefined;
      return;
    }
    if (video.paused && !this.playRequested) {
      this.playRequested = true;
      void video.play().then(() => {
        this.host.dataset.storyHdVideo = "playing";
      }).catch((error: unknown) => {
        // 不允許自動播放（例如省電模式）時停在封面：仍是同一張高清插圖，只是不動（雲層照樣捲動）。
        this.host.dataset.storyHdVideo = "blocked";
        if (error instanceof Error && error.name !== "NotAllowedError" && error.name !== "AbortError") {
          console.warn("HD story illustration could not play", error);
        }
      }).finally(() => {
        this.playRequested = false;
      });
    }
    this.watchdog(now);
    this.host.dataset.storyHdVideoTime = video.currentTime.toFixed(3);
  }

  private watchdog(now: number): void {
    const { video } = this;
    if (!video || video.paused || video.readyState < 2) {
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

  private clear(keepCanvas = false): void {
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.lastFrameAt = undefined;
    const { video } = this;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    if (!keepCanvas) {
      this.canvas?.remove();
      this.canvas = undefined;
      this.context = undefined;
      this.canvasHasFrame = false;
    }
    this.still?.remove();
    this.video = undefined;
    this.sky = undefined;
    this.poster = undefined;
    this.still = undefined;
    this.entry = undefined;
    this.stall = undefined;
    this.playRequested = false;
    for (const key of ["storyStyle", "storyHdBackground", "storyHdVideo", "storyHdVideoTime", "storyHdKind", "storyHdSkySource",
      "storyHdSkyOffset"] as const) delete this.host.dataset[key];
  }
}
