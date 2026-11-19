import { STARTUP_SCREEN } from "./content/startup.generated";
import { storyHdIntroWindow, type StoryHdIntro } from "./content/story-hd";
import { isProgramPaused } from "./program-clock";
import { stagedRenderAssetAvailable, stagedRenderAssetSource } from "./staged-render-asset-cache";

/** 畫布背板寬度上限：4K 螢幕全螢幕時剛好一對一（同高清標題）。 */
const MAX_BACKING_WIDTH = 3840;
/** 一段視訊在這段時間內沒有可畫的幀，這張畫面就照原版畫。 */
const VIDEO_READY_TIMEOUT_MS = 15_000;
/**
 * 視訊時間與捲動時間差超過這麼多秒就重新對齊。兩者平常同速，只有視訊剛開始、程式暫停之後與測試模式
 * （整段捲動壓縮成幾秒）會差開；門檻放寬，免得正常播放時一直跳。
 */
const MAX_DRIFT_SECONDS = 0.25;

/**
 * 高清開場（`REMAKE-198`，使用者 2026-11-18）。原版開場（模組 23）在捲動字幕上方輪流顯示七張 608×257 的
 * `BK/41`、`43..48`，以淡出、淡入換張。高清版每張是一段只播一次的視訊（開場自動播放，不需要循環），
 * 換張時間跟著旁白每句開口的時刻，相鄰兩張以切換點為中心交叉淡化。
 *
 * 畫布蓋在原版開場畫布上、背板跟螢幕像素一對一，每幀先畫原版畫布本身（最近鄰放大：黑底與捲動字幕照原版
 * 流程畫在那裡），再把目前的一或兩張畫面拉伸畫進原版畫面的矩形。某張視訊還沒備妥時，那張照原版像素畫
 * （最近鄰），時間仍照高清的切換點。
 *
 * 只換表現：捲動進度、字幕、音樂與旁白都照原版流程，由 `startup.ts` 每幀傳進捲動位置。
 */
export class IntroHdLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly videos: HTMLVideoElement[];
  private readonly ready: boolean[];
  /** 停在第 0 幀、等下一輪開場的視訊。 */
  private readonly parked: boolean[];
  private disposed = false;

  constructor(
    host: HTMLElement,
    private readonly intro: StoryHdIntro,
    /** 原版畫面（`STARTUP_INTRO.backgrounds` 的圖），視訊沒備妥時用。 */
    private readonly original: (source: string) => HTMLImageElement | undefined,
    /** 原版一次捲動更新的毫秒數：切換點以捲動更新計，視訊時間以原版速度換算。 */
    private readonly updateMs: number,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = STARTUP_SCREEN.width;
    canvas.height = STARTUP_SCREEN.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("intro HD layer needs a 2D context");
    canvas.className = "startup-hd-canvas";
    canvas.dataset.testid = "intro-hd-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.hidden = true;
    this.canvas = canvas;
    this.context = context;
    this.videos = intro.scenes.map((_, index) => {
      const video = document.createElement("video");
      video.className = "startup-hd-video";
      video.dataset.testid = `intro-hd-video-${index}`;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.setAttribute("aria-hidden", "true");
      return video;
    });
    this.ready = intro.scenes.map(() => false);
    this.parked = intro.scenes.map(() => true);
    // 視訊放在畫布下面解碼（Safari 不替不在文件裡的視訊解碼），自己完全透明
    host.prepend(...this.videos);
    host.prepend(canvas);
  }

  /** 第一張備妥才能開始高清開場；後面各張播到時還沒備妥就照原版畫。 */
  get isReady(): boolean {
    return this.ready[0] && !this.disposed;
  }

  get preparedScenes(): number {
    return this.ready.filter(Boolean).length;
  }

  /** 第 `index` 張的視訊已在資源租約裡之後呼叫：解碼到第 0 幀。失敗時這張照原版畫。 */
  async prepareScene(index: number): Promise<boolean> {
    const scene = this.intro.scenes[index];
    const video = this.videos[index];
    if (!scene || !video || this.disposed) return false;
    if (!stagedRenderAssetAvailable(scene.video.source)) {
      console.warn(`HD intro clip is not staged: ${scene.video.source}`);
      return false;
    }
    video.src = stagedRenderAssetSource(scene.video.source);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("HD intro clip did not become ready")), VIDEO_READY_TIMEOUT_MS);
        const done = () => {
          window.clearTimeout(timer);
          resolve();
        };
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) done();
        else {
          video.addEventListener("loadeddata", done, { once: true });
          video.addEventListener("error", () => {
            window.clearTimeout(timer);
            reject(new Error("HD intro clip failed to load"));
          }, { once: true });
        }
      });
    } catch (error: unknown) {
      console.warn(`HD intro scene ${index} falls back to the original`, error);
      return false;
    }
    this.ready[index] = !this.disposed;
    return this.ready[index];
  }

  show(visible: boolean): void {
    this.canvas.hidden = !visible;
    if (!visible) for (let index = 0; index < this.videos.length; index += 1) this.park(index);
  }

  /** 畫一幀。`base` 是原版開場畫布（640×350），`position` 是捲動進度（以捲動更新計，可有小數）。 */
  paint(base: HTMLCanvasElement, position: number): void {
    if (this.disposed || this.canvas.hidden) return;
    this.fitBacking();
    const ctx = this.context;
    const k = this.canvas.width / STARTUP_SCREEN.width;
    const time = position * this.updateMs;
    const paused = isProgramPaused();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, this.canvas.width, this.canvas.height);

    const { plate } = this.intro;
    let top = -1;
    let topSource = "";
    for (let index = 0; index < this.intro.scenes.length; index += 1) {
      const { start, end } = storyHdIntroWindow(this.intro, index, this.updateMs);
      if (time < start || time >= end) {
        this.park(index);
        continue;
      }
      const video = this.videos[index];
      const playable = this.ready[index] && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      if (playable) this.sync(index, (time - start) / 1000, paused);
      const source = playable ? video : this.original(this.intro.scenes[index].original);
      if (!source) continue;
      ctx.globalAlpha = index === 0 || this.intro.crossfadeMs <= 0 ? 1 : Math.min(1, Math.max(0, (time - start) / this.intro.crossfadeMs));
      ctx.imageSmoothingEnabled = playable;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, plate.x * k, plate.y * k, plate.width * k, plate.height * k);
      top = index;
      topSource = playable ? "video" : "original";
    }
    ctx.globalAlpha = 1;
    if (this.canvas.dataset.scene !== String(top)) this.canvas.dataset.scene = String(top);
    if (this.canvas.dataset.sceneSource !== topSource) this.canvas.dataset.sceneSource = topSource;
  }

  /** 讓第 `index` 張的視訊停在 `target` 秒附近播放；程式暫停時跟著停。 */
  private sync(index: number, target: number, paused: boolean): void {
    const video = this.videos[index];
    this.parked[index] = false;
    if (paused) {
      if (!video.paused) video.pause();
      return;
    }
    const last = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
    if (Math.abs(video.currentTime - Math.min(target, last)) > MAX_DRIFT_SECONDS) video.currentTime = Math.min(target, last);
    if (video.paused && target < last) void video.play().catch(() => undefined);
  }

  /** 不在畫面上的視訊停下來、退回第 0 幀，下一輪（閒置重播）淡入時第一幀已經解好。 */
  private park(index: number): void {
    if (this.parked[index]) return;
    this.parked[index] = true;
    const video = this.videos[index];
    video.pause();
    if (this.ready[index]) video.currentTime = 0;
  }

  /** 背板跟著畫布實際顯示的螢幕像素（同高清標題）。 */
  private fitBacking(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const width = Math.max(STARTUP_SCREEN.width, Math.min(MAX_BACKING_WIDTH, Math.round(rect.width * (window.devicePixelRatio || 1))));
    if (width === this.canvas.width) return;
    this.canvas.width = width;
    this.canvas.height = Math.round(width * STARTUP_SCREEN.height / STARTUP_SCREEN.width);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const video of this.videos) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    this.canvas.remove();
  }
}
