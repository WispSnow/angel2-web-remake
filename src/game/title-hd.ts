import { STARTUP_DISSOLVE_PATTERNS, STARTUP_SCREEN, STARTUP_TITLE } from "./content/startup.generated";
import { storyHdTitleAssetUrls, type StoryHdTitle } from "./content/story-hd";
import { isProgramPaused } from "./program-clock";
import { stagedRenderAssetAvailable, stagedRenderAssetSource } from "./staged-render-asset-cache";
import { VideoFrameCopy } from "./video-frame-copy";

/** 分頁回到前景等長時間停頓之後，雲層一幀最多前進這麼多時間（同劇情插圖）。 */
const MAX_SKY_STEP_MS = 100;
/** 畫布背板寬度上限：4K 螢幕全螢幕時剛好一對一。 */
const MAX_BACKING_WIDTH = 3840;
/** 視訊在這段時間內沒有可畫的幀就放棄高清，標題照原版畫。 */
const VIDEO_READY_TIMEOUT_MS = 15_000;

const ART_X = STARTUP_TITLE.upperReveal.x;
const ART_Y = STARTUP_TITLE.upperReveal.y;
const LOWER_Y = STARTUP_TITLE.lowerReveal.y;
const UPPER_STEPS = STARTUP_TITLE.upperReveal.dissolveSteps;
const LOWER_STEPS = STARTUP_TITLE.lowerReveal.dissolveSteps;

/** 原版溶入到第 `index` 步為止已經露出的像素（`0000:0F0A` 的 8×8 圖樣層層相加；`index < 0` 時什麼都沒露出）。 */
function revealed(steps: readonly number[], index: number, x: number, y: number): boolean {
  for (let i = 0; i <= index && i < steps.length; i += 1) {
    const pattern = STARTUP_DISSOLVE_PATTERNS[steps[i]];
    if ((pattern[y & 7] & (0x80 >>> (x & 7))) !== 0) return true;
  }
  return false;
}

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("title HD layer needs a 2D context");
  return [canvas, context];
}

/**
 * 高清標題畫面（使用者 2026-11-18）。原版標題（模組 23，`0000:0611`）是 `BK/51` 藍底、472×349 的上半圖（畫框、
 * 天空、地景與兩名女子）溶入，再溶入 640×123 的標誌帶。高清版保留藍底、畫框與標誌的原版像素，框內換成高清
 * 地景與等速捲動的雲層，兩名女子是各自生成、各自待機的循環疊成的一段 `stacked` 視訊（上半乘過 alpha 的顏色、
 * 下半 `1 − alpha`）。
 *
 * 畫布蓋在原版標題畫布上、背板跟螢幕像素一對一，每幀依序畫：
 * 1. 原版畫布本身（最近鄰放大）：藍底的淡入、選單文字與反白、框外的標誌帶都照原版流程畫在那裡；
 * 2. 框內矩形裡的雲層（整數位置平鋪成長帶，每幀取一段，見 `StoryHdLayer`）與地景；
 * 3. 重建的畫框與框外藍底（最近鄰），蓋住矩形超出畫框內緣的部分與原版上半圖；
 * 4. 兩名女子：畫布 `multiply` 下半、`lighter` 上半，都從視訊當前幀的複本合成（Safari 直接畫視訊時不理合成模式，見 `VideoFrameCopy`）；
 * 5. 還沒溶入的部分用藍底蓋回（原版 8×8 圖樣按溶入步數累加），然後是溶入中的標誌文字。
 *
 * 只換表現：標題的計時、溶入步數、選單與閒置重播都照原版流程，由 `startup.ts` 傳進目前的步數。
 */
export class TitleHdLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly video: HTMLVideoElement;
  private readonly videoFrame = new VideoFrameCopy();
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly bands = new Map<string, HTMLCanvasElement>();
  private readonly covers = new Map<number, HTMLCanvasElement>();
  private readonly logos = new Map<string, HTMLCanvasElement>();
  private skyOffset = 0;
  private lastPaintAt?: number;
  private preparing?: Promise<boolean>;
  private ready = false;
  private disposed = false;

  constructor(
    host: HTMLElement,
    private readonly title: StoryHdTitle,
    /** `BK/51`：還沒溶入的地方用它蓋回。 */
    private readonly background: () => HTMLImageElement | undefined,
  ) {
    const [canvas, context] = canvas2d(STARTUP_SCREEN.width, STARTUP_SCREEN.height);
    canvas.className = "startup-hd-canvas";
    canvas.dataset.testid = "title-hd-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.hidden = true;
    this.canvas = canvas;
    this.context = context;
    const video = document.createElement("video");
    video.className = "startup-hd-video";
    video.dataset.testid = "title-hd-video";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("aria-hidden", "true");
    this.video = video;
    // 視訊放在畫布下面解碼（Safari 不替不在文件裡的視訊解碼），自己完全透明
    host.prepend(video);
    host.prepend(canvas);
  }

  get isReady(): boolean {
    return this.ready && !this.disposed;
  }

  /** 全部檔案都在資源租約裡之後解碼；回傳能不能畫。失敗時標題照原版畫。 */
  prepare(): Promise<boolean> {
    this.preparing ??= this.load().then(() => {
      this.ready = !this.disposed;
      // the dissolve masks take a few milliseconds each; built now, the 0.4 s dissolve does not stutter on them
      for (let index = 0; index < UPPER_STEPS.length; index += 1) this.cover(index);
      for (const variant of this.title.variants) {
        for (let index = 0; index < LOWER_STEPS.length; index += 1) this.logo(variant.logo, index);
      }
      return this.ready;
    }, (error: unknown) => {
      console.warn("HD title falls back to the original", error);
      return false;
    });
    return this.preparing;
  }

  private async load(): Promise<void> {
    const urls = storyHdTitleAssetUrls(this.title);
    const missing = urls.filter((url) => !stagedRenderAssetAvailable(url));
    if (missing.length > 0) throw new Error(`HD title files are not staged: ${missing.join(", ")}`);
    await Promise.all(urls.filter((url) => url !== this.title.women.source).map(async (url) => {
      const image = new Image();
      image.src = stagedRenderAssetSource(url);
      await image.decode();
      this.images.set(url, image);
    }));
    const video = this.video;
    video.src = stagedRenderAssetSource(this.title.women.source);
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("HD title video did not become ready")), VIDEO_READY_TIMEOUT_MS);
      const done = () => {
        window.clearTimeout(timer);
        resolve();
      };
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) done();
      else {
        video.addEventListener("loadeddata", done, { once: true });
        video.addEventListener("error", () => {
          window.clearTimeout(timer);
          reject(new Error("HD title video failed to load"));
        }, { once: true });
      }
    });
  }

  show(visible: boolean): void {
    this.canvas.hidden = !visible;
    if (visible) {
      this.lastPaintAt = undefined;
      void this.video.play().catch(() => undefined);
    } else this.video.pause();
  }

  /**
   * 畫一幀。`base` 是原版標題畫布（640×350）；`upperIndex`、`lowerIndex` 是上半圖與標誌帶已經溶入到的步數
   * （`-1` 為尚未開始，溶入完成後為最後一步）。
   */
  paint(base: HTMLCanvasElement, variantIndex: number, upperIndex: number, lowerIndex: number, now: number): void {
    if (!this.isReady || this.canvas.hidden) return;
    const variant = this.title.variants[variantIndex];
    if (!variant) return;
    this.fitBacking();
    const paused = isProgramPaused();
    if (paused) this.video.pause();
    else if (this.video.paused) void this.video.play().catch(() => undefined);
    const step = this.lastPaintAt === undefined || paused ? 0 : Math.min(MAX_SKY_STEP_MS, Math.max(0, now - this.lastPaintAt));
    this.lastPaintAt = now;
    const tile = variant.sky.width;
    this.skyOffset = ((this.skyOffset + variant.sky.speed * step / 1000) % tile + tile) % tile;

    const ctx = this.context;
    const k = this.canvas.width / STARTUP_SCREEN.width;
    const art = k / this.title.scale;
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, this.canvas.width, this.canvas.height);
    if (upperIndex < 0) return;

    const { interior } = this.title;
    const land = this.images.get(variant.land.source);
    const frame = this.images.get(this.title.frame);
    const band = this.band(variant.sky.source, interior.width);
    ctx.save();
    ctx.setTransform(art, 0, 0, art, ART_X * k, ART_Y * k);
    ctx.beginPath();
    ctx.rect(interior.x, interior.y, interior.width, interior.height);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (band) {
      ctx.drawImage(band, tile - this.skyOffset, 0, interior.width, variant.sky.height,
        interior.x, variant.sky.y, interior.width, variant.sky.height);
    }
    if (land) ctx.drawImage(land, variant.land.x, variant.land.y, variant.land.width, variant.land.height);
    ctx.restore();

    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (frame) ctx.drawImage(frame, ART_X, ART_Y);

    const { women } = this.title;
    const womenFrame = this.videoFrame.frame(this.video);
    if (womenFrame) {
      const half = women.height / 2;
      ctx.setTransform(art, 0, 0, art, ART_X * k, ART_Y * k);
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(womenFrame, 0, half, women.width, half, women.x, women.y, women.width, half);
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(womenFrame, 0, 0, women.width, half, women.x, women.y, women.width, half);
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const cover = this.cover(upperIndex);
    if (cover) ctx.drawImage(cover, 0, 0);
    if (lowerIndex >= 0) {
      const logo = this.logo(variant.logo, lowerIndex);
      if (logo) ctx.drawImage(logo, 0, LOWER_Y);
    }
  }

  /** 背板跟著畫布實際顯示的螢幕像素（縮放比與 `devicePixelRatio`），最近鄰的原版像素才和原版畫布一樣銳利。 */
  private fitBacking(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const width = Math.max(STARTUP_SCREEN.width, Math.min(MAX_BACKING_WIDTH, Math.round(rect.width * (window.devicePixelRatio || 1))));
    if (width === this.canvas.width) return;
    this.canvas.width = width;
    this.canvas.height = Math.round(width * STARTUP_SCREEN.height / STARTUP_SCREEN.width);
  }

  /** 雲層按整數位置平鋪成的長帶（同 `StoryHdLayer`：小數位置的平鋪塊之間會透出細黑縫）。 */
  private band(source: string, width: number): HTMLCanvasElement | undefined {
    const cached = this.bands.get(source);
    if (cached) return cached;
    const sky = this.images.get(source);
    if (!sky) return undefined;
    const tile = sky.naturalWidth;
    const copies = Math.ceil(width / tile) + 2;
    const [band, context] = canvas2d(tile * copies, sky.naturalHeight);
    band.dataset.source = source;
    for (let i = 0; i < copies; i += 1) context.drawImage(sky, i * tile, 0);
    this.bands.set(source, band);
    return band;
  }

  /** 上半圖溶入到第 `index` 步時還沒露出的地方：藍底（640×350，其餘透明）。全部露出時沒有。 */
  private cover(index: number): HTMLCanvasElement | undefined {
    if (index >= UPPER_STEPS.length - 1) return undefined;
    const cached = this.covers.get(index);
    if (cached) return cached;
    const background = this.background();
    // the frame image has the upper art's own size (472x349)
    const frame = this.images.get(this.title.frame);
    if (!background || !frame) return undefined;
    const { width, height } = STARTUP_SCREEN;
    const [cover, context] = canvas2d(width, height);
    context.drawImage(background, 0, 0);
    const pixels = context.getImageData(0, 0, width, height);
    const right = ART_X + frame.naturalWidth;
    const bottom = ART_Y + frame.naturalHeight;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inUpper = x >= ART_X && x < right && y >= ART_Y && y < bottom;
        if (!inUpper || revealed(UPPER_STEPS, index, x, y)) pixels.data[(y * width + x) * 4 + 3] = 0;
      }
    }
    context.putImageData(pixels, 0, 0);
    this.covers.set(index, cover);
    return cover;
  }

  /** 標誌文字溶入到第 `index` 步時已經露出的部分。 */
  private logo(source: string, index: number): HTMLCanvasElement | undefined {
    const key = `${source}:${Math.min(index, LOWER_STEPS.length - 1)}`;
    const cached = this.logos.get(key);
    if (cached) return cached;
    const image = this.images.get(source);
    if (!image) return undefined;
    const [logo, context] = canvas2d(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, 0, 0);
    if (index < LOWER_STEPS.length - 1) {
      const pixels = context.getImageData(0, 0, logo.width, logo.height);
      for (let y = 0; y < logo.height; y += 1) {
        for (let x = 0; x < logo.width; x += 1) {
          if (!revealed(LOWER_STEPS, index, x, LOWER_Y + y)) pixels.data[(y * logo.width + x) * 4 + 3] = 0;
        }
      }
      context.putImageData(pixels, 0, 0);
    }
    this.logos.set(key, logo);
    return logo;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
    this.videoFrame.release();
    this.canvas.remove();
  }
}
