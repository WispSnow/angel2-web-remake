import { STARTUP_TITLE } from "./content/startup.generated";
import {
  STORY_HD_INTRO,
  STORY_HD_TITLE,
  storyHdIntroAssetUrls,
  storyHdTitleAssetUrls,
  type StoryHdIntro,
  type StoryHdTitle,
} from "./content/story-hd";
import { IntroHdLayer } from "./intro-hd";
import { TitleHdLayer } from "./title-hd";

export interface StartupHdOptions {
  readonly screen: HTMLElement;
  readonly introHost: HTMLElement;
  readonly titleHost: HTMLElement;
  /** 把檔案下載進開場的資源租約；沒有時開場與標題一律照原版畫。 */
  readonly loader?: (urls: readonly string[]) => Promise<void>;
  /** 開場已解碼的原版圖（`BK/51` 與開場畫面）。 */
  readonly image: (source: string) => HTMLImageElement | undefined;
  /** 原版一次捲動更新的毫秒數。 */
  readonly introUpdateMs: number;
}

/**
 * 開場的高清表現：`REMAKE-198` 開場畫面與 `REMAKE-197` 標題畫面。選了高清才下載（方框裡選擇或已存的偏好），
 * 全在背景進行、什麼都不等；每輪開場（含閒置重播）與每次組成標題時才決定這一輪畫不畫高清——還沒備妥就照
 * 原版畫。開場的七段視訊依播放順序一段一段下載，第一段到了就能開始高清開場，後面各段播到時還沒到，那張
 * 照原版像素畫。
 *
 * 狀態寫在啟動畫面的 dataset 上：`introHdReady`／`titleHdReady`（備妥與否）、`introStyle`／`titleStyle`
 * （這一輪畫的是 `hd` 還是 `original`）、`introHdScenes`（已備妥的開場畫面數）。
 */
export class StartupHd {
  private intro?: IntroHdLayer;
  private title?: TitleHdLayer;
  private requested = false;
  private introActive = false;
  private titleActive = false;
  private disposed = false;

  constructor(private readonly options: StartupHdOptions) {}

  request(): void {
    if (this.requested || this.disposed || !this.options.loader) return;
    this.requested = true;
    if (STORY_HD_INTRO) void this.loadIntro(STORY_HD_INTRO, this.options.loader);
    if (STORY_HD_TITLE) void this.loadTitle(STORY_HD_TITLE, this.options.loader);
  }

  private async loadIntro(spec: StoryHdIntro, loader: (urls: readonly string[]) => Promise<void>): Promise<void> {
    const { screen } = this.options;
    try {
      const urls = storyHdIntroAssetUrls(spec);
      for (const [index, url] of urls.entries()) {
        await loader([url]);
        if (this.disposed) return;
        this.intro ??= new IntroHdLayer(this.options.introHost, spec, this.options.image, this.options.introUpdateMs);
        const ready = await this.intro.prepareScene(index);
        if (index === 0) screen.dataset.introHdReady = String(ready);
        screen.dataset.introHdScenes = String(this.intro.preparedScenes);
        if (index === 0 && !ready) return;
      }
    } catch (error: unknown) {
      console.warn("HD intro download failed", error);
      screen.dataset.introHdReady ??= "false";
    }
  }

  private async loadTitle(spec: StoryHdTitle, loader: (urls: readonly string[]) => Promise<void>): Promise<void> {
    const { screen } = this.options;
    try {
      await loader(storyHdTitleAssetUrls(spec));
      if (this.disposed) return;
      const layer = new TitleHdLayer(this.options.titleHost, spec, () => this.options.image(STARTUP_TITLE.background));
      this.title = layer;
      screen.dataset.titleHdReady = String(await layer.prepare());
    } catch (error: unknown) {
      console.warn("HD title download failed", error);
      screen.dataset.titleHdReady = "false";
    }
  }

  /** 一輪捲動開場開始（含閒置重播）：`hd` 是目前的美術風格選擇。 */
  startIntro(hd: boolean): void {
    this.introActive = hd && Boolean(this.intro?.isReady);
    this.intro?.show(this.introActive);
    this.options.screen.dataset.introStyle = this.introActive ? "hd" : "original";
  }

  paintIntro(base: HTMLCanvasElement, position: number): void {
    if (this.introActive) this.intro?.paint(base, position);
  }

  stopIntro(): void {
    this.introActive = false;
    this.intro?.show(false);
  }

  /** 標題開始組成（含閒置重播之後）。 */
  startTitle(hd: boolean): void {
    this.titleActive = hd && Boolean(this.title?.isReady);
    this.title?.show(this.titleActive);
    this.options.screen.dataset.titleStyle = this.titleActive ? "hd" : "original";
  }

  paintTitle(base: HTMLCanvasElement, variant: number, upper: number, lower: number, now: number): void {
    if (this.titleActive) this.title?.paint(base, variant, upper, lower, now);
  }

  hideTitle(): void {
    this.titleActive = false;
    this.title?.show(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.intro?.dispose();
    this.title?.dispose();
  }
}
