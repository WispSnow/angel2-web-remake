import type { StoryHdTheEnd } from "./content/story-hd";
import { isProgramPaused, programNow } from "./program-clock";
import { stagedRenderAssetSource } from "./staged-render-asset-cache";
import { markTheEndHdFailed } from "./story-hd-style";

/** 這麼久還沒有第一幀，就照原版畫（同結局尾聲）。 */
const FIRST_FRAME_TIMEOUT_MS = 6_000;
/** 視訊時間與循環相位差超過這麼多秒才重新對齊（同高清開場與尾聲）。 */
const MAX_DRIFT_SECONDS = 0.25;

/** 兩個循環相位在週期 `period` 上的距離（跨過接縫時取短的那一邊）。 */
export function loopPhaseDistance(a: number, b: number, period: number): number {
  const d = Math.abs(a - b) % period;
  return Math.min(d, period - d);
}

/**
 * `REMAKE-201` 製作人員表之後的「The end」高清畫面：一段無縫循環的視訊蓋在原版第 0 幀的插圖上，四幀小角色動畫的
 * 動作也在裡面；手寫字與愛心露在外面照原版。原版終幕永久循環、沒有輸入，所以視訊也一直循環，相位跟著畫面出現後的
 * 程式時間走，程式暫停時一起停。
 *
 * 只換表現：原版第 0 幀與小角色動畫照常在下面跑。第一幀沒到或解碼失敗時移除視訊，底下就是原版。
 */
export class TheEndHdPlayer {
  readonly video: HTMLVideoElement;
  private animationFrame?: number;
  private startedAt?: number;
  private disposed = false;

  constructor(host: HTMLElement, private readonly theEnd: StoryHdTheEnd, origin: { x: number; y: number }) {
    const video = document.createElement("video");
    const { picture } = theEnd;
    video.className = "credits-final-hd";
    video.dataset.testid = "credits-final-hd";
    // `src` 是資源門那份位元組的物件網址；原始 URL 留給驗收讀取。
    video.dataset.sourceUrl = theEnd.video.source;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("aria-hidden", "true");
    Object.assign(video.style, {
      left: `${origin.x + picture.x}px`,
      top: `${origin.y + picture.y}px`,
      width: `${picture.width}px`,
      height: `${picture.height}px`,
    });
    video.src = stagedRenderAssetSource(theEnd.video.source);
    host.append(video);
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
          markTheEndHdFailed(reason);
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

  /** 循環從 `startedAt`（程式時間）的第 0 幀開始。 */
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
      const period = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : this.theEnd.video.frames / this.theEnd.video.fps;
      const phase = ((programNow() - this.startedAt) / 1000) % period;
      if (loopPhaseDistance(video.currentTime, phase, period) > MAX_DRIFT_SECONDS) video.currentTime = phase;
      if (video.paused) void video.play().catch(() => undefined);
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
