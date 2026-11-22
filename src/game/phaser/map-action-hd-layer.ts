import { mapActionHdInstanceCount, type MapActionHdClip } from "../content/map-action-hd";
import { mapActionHdClipEnd } from "../map-action-hd";
import { isProgramPaused } from "../program-clock";
import { stagedRenderAssetSource } from "../staged-render-asset-cache";

/**
 * 高清地圖技術特效（`REMAKE-203`、`REMAKE-204`）的畫布層。Phaser 畫布固定 640×350（實驗室 640×484）、再整塊被 CSS 放大，
 * 高清幀若畫進去會被縮回原版像素；所以另放一塊 DOM 畫布蓋在戰場視口上，底層解析度跟著畫面實際大小
 * （最多是高清素材的 4 倍），隨邏輯畫面一起縮放。
 *
 * 視訊是堆疊格式：顏色×透明度在 (0,0)，`1 − alpha` 在 (alphaX, alphaY)。這塊畫布是透明的疊層、底下沒有
 * 地圖像素，所以不能像高清劇情插圖那樣用 `multiply`／`lighter` 在同一塊畫布上合成（透明處會乘成白色）。
 * 改用一個 WebGL 片段著色器把兩半拆回真正的透明度：顏色取前半、alpha = 1 − 後半，輸出預乘 alpha，
 * 再由瀏覽器照一般透明圖片疊到 Phaser 畫布上。沒有 WebGL 時整個動作回退原版。
 *
 * 層次：原版特效在 Phaser 深度 8，這塊畫布蓋在整塊 Phaser 畫布上。施法時游標本來就隱藏，唯一被蓋住的是
 * 凍結標記（深度 9）與特效重疊的部分。
 *
 * 同時可以有幾個正在跟隨控制器的片段，加上幾段還在播餘韻的片段（例如 `2H` 的光環還在散、收尾星芒已經
 * 開始）：每段各用自己的視訊，依序畫在同一塊畫布上。同一段片段要在不同格上同時停在不同幀時（魔弓的直線
 * 逐格長出、每格從自己的起點播，`REMAKE-208`），每個播放位置用一支自己的視訊（`instance`）。
 */

export interface MapActionHdViewport {
  /** 宿主的邏輯尺寸（戰場 640×350、實驗室 640×484）。 */
  readonly hostWidth: number;
  readonly hostHeight: number;
  /** 畫布在宿主邏輯座標裡的位置與大小。 */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface MapActionHdPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapActionHdShow {
  readonly clip: MapActionHdClip;
  /** 此刻對應的片段 tick（連續；餘韻期間超過原版時間線）。 */
  readonly tick: () => number;
  /**
   * 目標格底邊中點在畫布邏輯座標裡的位置（戰場要扣掉鏡頭捲動）。回傳多個點時同一幀畫在每個點上
   * （回復同時畫在每個受治療的單位上）。
   */
  readonly target: () => MapActionHdPoint | readonly MapActionHdPoint[];
  /** 相對原速的播放倍率：每 tick 10 ms 為 1（加速 4、測試 2.5）。 */
  readonly rate: number;
  /** 時間軸停住時為 `false`（實驗室暫停或拖動）：視訊暫停、只對準當前幀。程式暫停一律視為停住。 */
  readonly playing?: boolean;
  /** 被換下時繼續把餘韻播完（片段最後一幀、且片段有餘韻）。 */
  readonly linger?: boolean;
  /**
   * 這段片段的第幾支視訊（預設 0）：同一段片段同時在不同幀上播時，每個播放位置一支（數量見
   * `mapActionHdInstanceCount`）。
   */
  readonly instance?: number;
}

/** 一個播放位置的視訊鍵：片段加第幾支。 */
function videoKey(clipId: string, instance = 0): string {
  return instance ? `${clipId}#${instance}` : clipId;
}

const showKey = (show: MapActionHdShow): string => videoKey(show.clip.clipId, show.instance);

/** 片段畫面終點前 6 tick 淡出，避免最後一幀突然消失（有餘韻的片段，淡出已經做在視訊裡，這裡只是保險）。 */
const END_FADE_TICKS = 6;
/** 時鐘停在終點前一點點（`mapActionHdTick` 夾在終點前 0.001），離終點這麼近就算播完。 */
const DONE_EPSILON_TICKS = 0.01;
/** 視訊與時鐘相差超過這麼多 tick 才校正，免得每幀都 seek。 */
const RESYNC_TICKS = 1.5;
/**
 * 播放中的視訊另以播放倍率放寬校正門檻、並往前多跳一點：一次 seek 本身要幾十毫秒，期間時鐘照走，門檻若比 seek 的耗時還小，
 * 每次 seek 完都已落後到要再 seek，視訊就一直停在 seek 裡（技術實驗室從頭播放時正是如此）。
 */
const RESYNC_PLAYING_TICKS_PER_RATE = 5;
const SEEK_LEAD_TICKS_PER_RATE = 3;
/** seek 期間沿用這支視訊上一幀的畫面，只要它離要畫的那一幀不超過這麼多 tick；更遠（換了位置重播）就寧可空一兩幀。 */
const HOLD_TICKS = 8;

const VERTEX_SHADER = `
attribute vec2 corner;
uniform vec4 destination;   // x, y, width, height in clip space
varying vec2 uv;
void main() {
  uv = corner;
  gl_Position = vec4(destination.xy + corner * destination.zw, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D video;
uniform vec4 colourRect;    // u, v, width, height of the colour half in texture space
uniform vec4 alphaRect;     // u, v, width, height of the 1 - alpha half
uniform float visible;
varying vec2 uv;
void main() {
  vec3 colour = texture2D(video, colourRect.xy + uv * colourRect.zw).rgb;
  float alpha = 1.0 - texture2D(video, alphaRect.xy + uv * alphaRect.zw).r;
  // the colour half is already colour x alpha: premultiplied output
  gl_FragColor = vec4(colour, alpha) * visible;
}`;

interface GlState {
  readonly gl: WebGLRenderingContext;
  readonly destination: WebGLUniformLocation | null;
  readonly colourRect: WebGLUniformLocation | null;
  readonly alphaRect: WebGLUniformLocation | null;
  readonly visible: WebGLUniformLocation | null;
}

/** One texture per playing position: it keeps that video's last decoded frame while the video seeks. */
function createTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // video frames are not powers of two: no mipmaps, clamped edges
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createGl(canvas: HTMLCanvasElement): GlState | undefined {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
  if (!gl) return undefined;
  const compile = (type: number, source: string): WebGLShader | undefined => {
    const shader = gl.createShader(type);
    if (!shader) return undefined;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : undefined;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  if (!vertex || !fragment || !program || !buffer) return undefined;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, "corner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // several clips can overlap (an afterglow under the next clip): premultiplied "over"
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return {
    gl,
    destination: gl.getUniformLocation(program, "destination"),
    colourRect: gl.getUniformLocation(program, "colourRect"),
    alphaRect: gl.getUniformLocation(program, "alphaRect"),
    visible: gl.getUniformLocation(program, "visible"),
  };
}

export class MapActionHdLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly glState: GlState | undefined;
  private readonly videos = new Map<string, HTMLVideoElement>();
  /** 靜態片段（`REMAKE-209`）的圖。 */
  private readonly images = new Map<string, HTMLImageElement>();
  /** 每個播放位置的紋理與它上傳時的視訊時間（秒）：視訊 seek 時沿用。 */
  private readonly textures = new Map<string, { readonly texture: WebGLTexture; mediaTime: number }>();
  /** 解碼出過一幀的視訊：之後 seek 時 `readyState` 會暫時掉到 1，仍算可畫（見 `ready`）。 */
  private readonly decoded = new WeakSet<HTMLVideoElement>();
  /** 正在跟隨控制器的片段（通常一段；逐格錯開的片段每個播放位置一段）。 */
  private active: MapActionHdShow[] = [];
  /** 已被換下、還在播餘韻的片段，依開始順序。 */
  private lingering: MapActionHdShow[] = [];
  private animationFrame: number | undefined;
  private drawn = false;

  constructor(
    host: HTMLElement,
    private readonly viewport: MapActionHdViewport,
    private readonly onFailure: (clipId: string, reason: string) => void,
    before: Node | null = null,
  ) {
    const canvas = document.createElement("canvas");
    canvas.className = "map-action-hd-canvas";
    canvas.dataset.testid = "map-action-hd-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const percent = (value: number, total: number): string => `${(value / total) * 100}%`;
    Object.assign(canvas.style, {
      position: "absolute",
      left: percent(viewport.left, viewport.hostWidth),
      top: percent(viewport.top, viewport.hostHeight),
      width: percent(viewport.width, viewport.hostWidth),
      height: percent(viewport.height, viewport.hostHeight),
      zIndex: "3",
      pointerEvents: "none",
    });
    // 全域 `canvas { image-rendering … !important }` 會讓瀏覽器以最近鄰縮放這塊畫布；行內 !important 優先於它。
    canvas.style.setProperty("image-rendering", "auto", "important");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    host.insertBefore(canvas, before);
    this.canvas = canvas;
    this.glState = createGl(canvas);
  }

  /** 預先建立並載入這些片段的視訊（靜音、暫停），施法時才能從第一幀就畫高清。 */
  prepare(clips: Iterable<MapActionHdClip>): void {
    for (const clip of clips) {
      for (let instance = 0; instance < mapActionHdInstanceCount(clip.clipId); instance += 1) {
        this.prepareVideo(clip, instance);
      }
    }
  }

  private prepareVideo(clip: MapActionHdClip, instance: number): void {
    const key = videoKey(clip.clipId, instance);
    if (this.videos.has(key) || this.images.has(key)) return;
    if (!this.glState) {
      this.onFailure(clip.clipId, "WebGL is not available for the HD effect layer");
      return;
    }
    if (clip.still) {
      // a still has no timeline: one decoded picture, uploaded whenever it is drawn
      const image = new Image();
      image.decoding = "async";
      image.addEventListener("error", () => {
        this.onFailure(clip.clipId, "the still picture could not be decoded");
        if (this.active.some((show) => show.clip.clipId === clip.clipId)) this.setShow(undefined);
      });
      image.src = stagedRenderAssetSource(clip.video.source);
      this.images.set(key, image);
      return;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.dataset.sourceUrl = clip.video.source;
    video.addEventListener("loadeddata", () => this.decoded.add(video));
    video.addEventListener("error", () => {
      this.onFailure(clip.clipId, video.error?.message || `media error ${video.error?.code ?? "unknown"}`);
      if (this.active.some((show) => show.clip.clipId === clip.clipId)) this.setShow(undefined);
      this.lingering = this.lingering.filter((show) => show.clip.clipId !== clip.clipId);
    });
    video.src = stagedRenderAssetSource(clip.video.source);
    video.setAttribute("aria-hidden", "true");
    video.className = "map-action-hd-video";
    // 與高清劇情插圖一樣把視訊留在文件裡（看不見）解碼：脫離文件的視訊在部分瀏覽器會被節流。
    Object.assign(video.style, {
      position: "absolute", left: "0", top: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none",
    });
    this.canvas.after(video);
    video.load();
    this.videos.set(key, video);
  }

  /**
   * 這段片段的每支視訊都已解碼出可畫的一幀（靜態片段：圖已解碼）。解碼過就一直算數：播放中校正位置的 seek 會讓
   * `readyState` 暫時掉到 1，若因此判成「沒準備好」，技術實驗室會每隔一幀改畫原版並暫停視訊，視訊再也播不起來。
   */
  ready(clipId: string): boolean {
    const image = this.images.get(clipId);
    if (image) return Boolean(this.glState) && image.complete && image.naturalWidth > 0;
    return Boolean(this.glState) && Array.from({ length: mapActionHdInstanceCount(clipId) }, (_, instance) =>
      this.videos.get(videoKey(clipId, instance))).every((video) => video && !video.error
        && (video.readyState >= 2 || this.decoded.has(video)));
  }

  /**
   * 換上正在跟隨控制器的片段（`undefined` 表示沒有）。被換下的片段若帶 `linger` 且餘韻還沒播完，就留下
   * 來自己播完；一個播放位置只有一支視訊，所以新片段若與某段餘韻用同一支，那段餘韻立刻讓位。
   */
  setShow(show: MapActionHdShow | undefined): void {
    this.setActive(show ? [show] : []);
  }

  /**
   * 換上此刻跟隨控制器的全部片段（逐格錯開的片段每個播放位置一段，各用自己的 `instance`）。被換下的
   * 播放位置照 `setShow` 的規則留下來播餘韻或暫停。
   */
  setActive(shows: readonly MapActionHdShow[]): void {
    const keep = new Set(shows.map(showKey));
    for (const previous of this.active) {
      if (keep.has(showKey(previous))) continue;
      if (previous.linger && !this.finished(previous)) this.lingering.push(previous);
      else this.videos.get(showKey(previous))?.pause();
    }
    this.lingering = this.lingering.filter((other) => !keep.has(showKey(other)));
    this.active = [...shows];
    if (this.shows().length > 0) {
      if (this.animationFrame === undefined) this.animationFrame = requestAnimationFrame(this.frame);
    } else {
      this.clear();
    }
  }

  /**
   * 直接指定此刻要畫的全部片段（後面的蓋在前面上）：技術實驗室按時間軸位置算出畫面，可以來回拖動，
   * 不走「換下後自己播完餘韻」的流程。
   */
  setShows(shows: readonly MapActionHdShow[]): void {
    const keep = new Set(shows.map(showKey));
    for (const show of this.shows()) {
      if (!keep.has(showKey(show))) this.videos.get(showKey(show))?.pause();
    }
    this.lingering = [];
    this.active = [...shows];
    if (this.shows().length > 0) {
      if (this.animationFrame === undefined) this.animationFrame = requestAnimationFrame(this.frame);
    } else {
      this.clear();
    }
  }

  /** 連餘韻一起立刻清掉（離開戰場、讀檔、實驗室換動作）。 */
  clearAll(): void {
    this.lingering = [];
    this.setShow(undefined);
    for (const video of this.videos.values()) video.pause();
  }

  destroy(): void {
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.active = [];
    this.lingering = [];
    for (const video of this.videos.values()) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    this.videos.clear();
    this.images.clear();
    for (const { texture } of this.textures.values()) this.glState?.gl.deleteTexture(texture);
    this.textures.clear();
    this.glState?.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.remove();
  }

  private finished(show: MapActionHdShow): boolean {
    return !show.clip.still && show.tick() >= mapActionHdClipEnd(show.clip) - DONE_EPSILON_TICKS;
  }

  private shows(): MapActionHdShow[] {
    return [...this.lingering, ...this.active];
  }

  private clear(): void {
    if (this.drawn && this.glState) {
      const { gl } = this.glState;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.drawn = false;
    delete this.canvas.dataset.mapActionHdAction;
    delete this.canvas.dataset.mapActionHdTick;
    delete this.canvas.dataset.mapActionHdShows;
    delete this.canvas.dataset.mapActionHdRects;
  }

  private readonly frame = (): void => {
    this.animationFrame = undefined;
    // 播完的餘韻退場
    this.lingering = this.lingering.filter((show) => {
      const done = this.finished(show);
      if (done) this.videos.get(showKey(show))?.pause();
      return !done;
    });
    const shows = this.shows();
    if (shows.length === 0) {
      this.clear();
      return;
    }
    const state = this.glState;
    if (state) {
      const { gl } = state;
      this.resize();
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawn = true;
    }
    const labels: string[] = [];
    const rects: string[] = [];
    for (const show of shows) {
      const image = show.clip.still ? this.images.get(showKey(show)) : undefined;
      const video = image ? undefined : this.videos.get(showKey(show));
      const source = image ?? video;
      if (!source) continue;
      const tick = show.tick();
      if (video) this.sync(video, show, tick);
      this.draw(source, show, tick);
      // where the clip's frame lands, in viewport logical px (tests check it sits on the target)
      for (const rect of this.destinations(show)) {
        rects.push([rect.x, rect.y, rect.w, rect.h].map((value) => Math.round(value)).join(","));
      }
      // rounded down: the clock stops just before a frame's end (69.999), which must not read as the next tick
      labels.push(`${show.clip.clipId}:${(Math.floor(tick * 10) / 10).toFixed(1)}`);
    }
    // the newest show (the one following the controller, else the latest afterglow) names the action and tick
    const newest = labels.at(-1)?.split(":");
    if (newest) {
      this.canvas.dataset.mapActionHdAction = newest[0];
      this.canvas.dataset.mapActionHdTick = newest[1];
    }
    this.canvas.dataset.mapActionHdShows = labels.join(";");
    this.canvas.dataset.mapActionHdRects = rects.join(";");
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private sync(video: HTMLVideoElement, show: MapActionHdShow, tick: number): void {
    const { fps, frames } = show.clip.video;
    const frameTime = (Math.min(Math.floor(tick), frames - 1) + 0.5) / fps;
    if (isProgramPaused() || show.playing === false || show.rate <= 0) {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - frameTime) > 0.5 / fps && !video.seeking) video.currentTime = frameTime;
      return;
    }
    const rate = Math.min(16, Math.max(0.25, show.rate));
    video.playbackRate = rate;
    const tolerance = Math.max(RESYNC_TICKS, RESYNC_PLAYING_TICKS_PER_RATE * rate);
    if (Math.abs(video.currentTime - tick / fps) > tolerance / fps && !video.seeking) {
      // aim a little ahead: the clock keeps running while the seek completes
      video.currentTime = (Math.min(Math.floor(tick + SEEK_LEAD_TICKS_PER_RATE * rate), frames - 1) + 0.5) / fps;
    }
    if (video.paused && tick < frames) void video.play().catch(() => undefined);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(4, Math.max(1, (rect.width * dpr) / this.viewport.width));
    const width = Math.round(this.viewport.width * scale);
    const height = Math.round(this.viewport.height * scale);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /** The clip frame's rectangles in viewport logical px: its target point sits on each of the show's targets. */
  private destinations(show: MapActionHdShow): { x: number; y: number; w: number; h: number }[] {
    const { clip } = show;
    const target = show.target();
    return ("x" in target ? [target] : target).map((point) => ({
      x: point.x - clip.originX / clip.scale,
      y: point.y - clip.originY / clip.scale,
      w: clip.frameWidth / clip.scale,
      h: clip.frameHeight / clip.scale,
    }));
  }

  private draw(source: HTMLVideoElement | HTMLImageElement, show: MapActionHdShow, tick: number): void {
    const state = this.glState;
    if (!state) return;
    const { gl } = state;
    const clip = show.clip;
    const end = mapActionHdClipEnd(clip);
    if (!clip.still && tick >= end) return;
    // a frame is uploaded only when the source has it; while a video seeks, its own last frame is drawn again if it is
    // close to the wanted one (a resync during playback), otherwise nothing (the video was parked elsewhere)
    const key = showKey(show);
    const fresh = source instanceof HTMLImageElement
      ? source.complete && source.naturalWidth > 0
      : source.readyState >= 2 && !source.seeking;
    let entry = this.textures.get(key);
    if (fresh) {
      if (!entry) {
        const texture = createTexture(gl);
        if (!texture) return;
        entry = { texture, mediaTime: 0 };
        this.textures.set(key, entry);
      }
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      entry.mediaTime = source instanceof HTMLVideoElement ? source.currentTime : 0;
    } else if (!entry || (source instanceof HTMLVideoElement
      && Math.abs(entry.mediaTime - tick / clip.video.fps) > HOLD_TICKS / clip.video.fps)) {
      return;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    }
    const vw = clip.video.width;
    const vh = clip.video.height;
    gl.uniform4f(state.colourRect, 0, 0, clip.frameWidth / vw, clip.frameHeight / vh);
    gl.uniform4f(state.alphaRect, clip.alphaX / vw, clip.alphaY / vh, clip.frameWidth / vw, clip.frameHeight / vh);
    gl.uniform1f(state.visible, clip.still ? 1 : Math.max(0, Math.min(1, (end - tick) / END_FADE_TICKS)));
    // destination rectangles in viewport logical px, then clip space (y up); one upload, one quad per target
    const toClipX = (value: number): number => (value / this.viewport.width) * 2 - 1;
    const toClipY = (value: number): number => 1 - (value / this.viewport.height) * 2;
    for (const { x, y, w, h } of this.destinations(show)) {
      gl.uniform4f(state.destination, toClipX(x), toClipY(y), (w / this.viewport.width) * 2, -(h / this.viewport.height) * 2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
}
