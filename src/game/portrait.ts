import {
  isPortraitRecord,
  MODULE29_RED_EYE_RULE,
  PORTRAIT_CATALOG,
  portraitSourceFor,
  type PortraitAnimationAssets,
} from "./content/portrait-catalog.generated";
import type { PortraitRecord } from "./types";
import type { PortraitHdEntry } from "./content/portrait-hd";
import { PORTRAIT_HD_SIZE } from "./content/portrait-hd.generated";
import { stagedRenderAssetAvailable, stagedRenderAssetSource } from "./staged-render-asset-cache";
import { isProgramPaused, programNow } from "./program-clock";
import { PortraitHdPlayer, releaseHdVideoDecoder } from "./portrait-hd-player";
import { SPEECH_PUNCTUATION_QUIET_MS, speechGlyphIsPunctuation, SyllableClock } from "./portrait-speech";
import { activePortraitHd, markPortraitHdFailed } from "./portrait-style";

type BlinkStage = "idle" | "closing" | "closed" | "opening";

interface BlinkState {
  portrait: PortraitRecord;
  stage: BlinkStage;
  transitionAt: number;
  idleDelayMs: number;
  count: number;
}

interface PortraitMarkupOptions {
  alt: string;
  channel: string;
  className: string;
  wrapperTestId?: string;
  baseTestId?: string;
  /** Draw the record's frame-7 red eyes in place of every blink frame. */
  redEyes?: boolean;
  /**
   * `REMAKE-194` 原版只畫一次肖像的表面（全景戰鬥狀態框）：原版風格只有主圖，不眨眼也不動嘴；
   * 高清風格照樣播待機循環。
   */
  originalStill?: boolean;
}

const HALF_FRAME_MS = 85;
const CLOSED_FRAME_MS = 135;
const BLINK_IDLE_MIN_MS = 600;
const BLINK_IDLE_MAX_MS = 2_400;
const TEST_BLINK_IDLE_MIN_MS = 220;
const TEST_BLINK_IDLE_MAX_MS = 520;
const PORTRAIT_SIZE = 112;
/** 原版肖像在有語音的頁面跟隨語音時的切換節拍：沿用原版逐字切換的 80 ms（8 native tick）。 */
const VOICE_MOUTH_TOGGLE_MS = 80;
/** 高清視訊最多等這麼久才開始逐字；逾時就先顯示封面，視訊就緒後自行接上。 */
const HD_VIDEO_READY_TIMEOUT_MS = 1_500;
const portraitPreparations = new WeakMap<HTMLElement, {
  readonly portrait: string;
  readonly promise: Promise<void>;
}>();

/**
 * `REMAKE-192` 每張肖像的說話狀態。原版肖像在無語音頁照原版逐字切換（由對白層呼叫
 * `portraitSpeechGlyph`）；有語音頁改由動畫迴圈按語音有聲時段切換。高清肖像一律由動畫
 * 迴圈按說話節奏算張口程度。
 */
interface PortraitSpeechState {
  readonly clock: SyllableClock;
  nextToggleAt: number;
}
const speechStates = new WeakMap<HTMLElement, PortraitSpeechState>();
const speechStateFor = (element: HTMLElement): PortraitSpeechState => {
  let state = speechStates.get(element);
  if (!state) {
    state = { clock: new SyllableClock(), nextToggleAt: 0 };
    speechStates.set(element, state);
  }
  return state;
};

const percentage = (value: number) => `${(value / PORTRAIT_SIZE * 100).toFixed(6)}%`;
const randomInteger = (minimum: number, maximum: number) =>
  minimum + Math.floor(Math.random() * (maximum - minimum + 1));

/**
 * Module 29 runs `0000:85EC/860E/862B` before both of its blink draws — the unit detail
 * at `0000:8578` and the battle-dialogue portraits at `1864:00B0` — and draws frame 7 in
 * place of the blink frame while a possessed character's stage is still undecided.
 * Module 25's prebattle story blink has no such check.
 */
export function module29ShowsRedEyes(
  portrait: PortraitRecord,
  nativeStage: number,
  stageProgress: number,
): boolean {
  return stageProgress !== MODULE29_RED_EYE_RULE.clearedProgress
    && MODULE29_RED_EYE_RULE.stages.some((rule) => rule.nativeStage === nativeStage
      && (rule.portraits as readonly number[]).includes(portrait));
}

export type NativeMouthFrame = "1" | "2";

/**
 * Both native story renderers toggle the mouth only after drawing a Big5
 * double-byte glyph (AL > 7Fh). The decoded story corpus represents those
 * glyphs as non-ASCII Unicode code points.
 */
export function nativeStoryGlyphMovesMouth(character: string): boolean {
  return (character.codePointAt(0) ?? 0) > 0x7f;
}

export function nativeMouthFrameAfterGlyph(
  currentFrame: string | undefined,
  character: string,
): NativeMouthFrame {
  const normalizedFrame: NativeMouthFrame = currentFrame === "2" ? "2" : "1";
  if (!nativeStoryGlyphMovesMouth(character)) return normalizedFrame;
  return normalizedFrame === "1" ? "2" : "1";
}

/**
 * 原生肖像合成體（模組 25 `0000:0B98`、模組 29 `0000:BBEC`）在貼主圖之前先畫一塊
 * `(x+8, y)` 起 112×144 的 50% 網點黑影，主圖、頂飾與姓名牌隨後蓋住大半，只在右側
 * 與下方露出。該層必須壓在主圖之下，所以放進肖像元素的第一個子節點；只有掛上 A/18
 * 邊框的對話／反饋肖像會在樣式表裡把它顯示出來。
 */
const PORTRAIT_UNDERLAY = '<i class="dialogue-portrait-underlay" aria-hidden="true"></i>';

/**
 * `REMAKE-192` 高清肖像的圖層：封面（循環第 0 幀）墊底，畫布疊在上面由播放器逐幀繪製，
 * 視訊本身只當解碼來源，縮成 2 px 透明留在版面裡（`display:none` 的視訊不保證會播放）。
 * 封面沿用 `.portrait-base` 與原本的測試 id，靜止圖記錄（`D/67`）就只有封面。
 *
 * `REMAKE-217` 視訊標記裡沒有 `src`，網址只寫在 `data-source-url`，等這張臉真的上場（動畫迴圈第一次
 * 看到它，或對白層等它就緒）才由 `attachHdVideoSource` 接上。右欄這類表面每次通知都整段重寫
 * `innerHTML`，再由 `adoptAnimatedPortraits` 把舊節點搬回去；新解析出來的那份隨即丟掉，可是帶著
 * `src` 的 `<video>` 一解析就開始載入、建立解碼器並解出第一幀，丟掉了也照做。全景戰鬥時右欄每幀
 * 重建，一秒多出約五十個解碼器，Windows 的硬體解碼下就是地圖與戰鬥的明顯卡頓。
 */
function hdPortraitLayers(entry: PortraitHdEntry, alt: string, baseTestId?: string): string {
  const base = `${PORTRAIT_UNDERLAY}<img class="portrait-base portrait-hd-poster" ${baseTestId ? `data-testid="${baseTestId}"` : ""} src="${stagedRenderAssetSource(entry.poster)}" data-source-url="${entry.poster}" alt="${alt}" />`;
  if (!entry.video) return base;
  return `${base}
    <canvas class="portrait-hd-canvas" width="${PORTRAIT_HD_SIZE}" height="${PORTRAIT_HD_SIZE}" aria-hidden="true"></canvas>
    <video class="portrait-hd-video" muted loop playsinline disablepictureinpicture disableremoteplayback preload="auto"
      data-source-url="${entry.video.source}" aria-hidden="true"></video>`;
}

/** 已經接上來源、還沒放掉的高清肖像視訊；動畫迴圈每幀把離開文件的放掉。 */
const liveHdVideos = new Set<HTMLVideoElement>();
/** 這次執行解碼出過第一幀的高清肖像檔案（`data-source-url`）：檔案本身沒問題，之後的錯誤都是暫時的。 */
const decodedHdSources = new Set<string>();
/** 暫時錯誤之後的重試：第幾次，以及最早什麼時候（`performance.now()`）再接上來源。 */
const hdVideoRetries = new WeakMap<HTMLVideoElement, { readonly count: number; readonly notBefore: number }>();
const HD_VIDEO_RETRY_BASE_MS = 1_000;
const HD_VIDEO_RETRY_MAX_MS = 30_000;

const hdVideoDecoded = (event: Event): void => {
  const video = event.currentTarget;
  if (!(video instanceof HTMLVideoElement)) return;
  if (video.dataset.sourceUrl) decodedHdSources.add(video.dataset.sourceUrl);
  hdVideoRetries.delete(video);
};

/**
 * 這張臉上場了：接上視訊來源（已接上就不動）。檔案不在目前的資源租約裡（租約剛換手）時不接，免得繞過資源門去要
 * 原始網址；暫時錯誤後的退避期間也不接。
 */
function attachHdVideoSource(video: HTMLVideoElement): void {
  if (video.hasAttribute("src")) return;
  const url = video.dataset.sourceUrl;
  if (!url || !stagedRenderAssetAvailable(url)) return;
  const retry = hdVideoRetries.get(video);
  if (retry && performance.now() < retry.notBefore) return;
  // 同一個函式重複加入不會重複觸發。
  video.addEventListener("loadeddata", hdVideoDecoded);
  video.src = stagedRenderAssetSource(url);
  liveHdVideos.add(video);
}

/**
 * `REMAKE-219` 一支高清肖像視訊出錯時怎麼辦。以前任何一次錯誤都把整條記錄在本次執行退回原版，切換美術風格也救不回來，
 * 玩家於是看到同一個畫面裡新舊肖像混在一起。可是錯誤多半與檔案無關：表面已經拆掉、租約換手後舊的物件網址被撤銷、或解碼器
 * 一時不夠（Windows 版的硬體解碼）。只有這次執行從沒解碼成功過、而且來源仍是目前租約那份的檔案才退回原版；其餘放掉這支
 * 視訊，由動畫迴圈稍後重新接上（退避 1、2、4… 秒，最多 30 秒），期間畫面停在這張臉的高清畫面上。
 */
function handleHdVideoError(element: HTMLElement, video: HTMLVideoElement): void {
  // 播放器與就緒等待都聽 `error`，同一次錯誤只處理一次：放掉之後就沒有來源了。
  if (!video.hasAttribute("src")) return;
  const url = video.dataset.sourceUrl;
  const current = url !== undefined && stagedRenderAssetAvailable(url)
    && video.getAttribute("src") === stagedRenderAssetSource(url);
  if (video.isConnected && current && !decodedHdSources.has(url)) {
    const record = Number(element.dataset.portraitRecord);
    if (isPortraitRecord(record)) {
      markPortraitHdFailed(record, video.error?.message || `media error ${video.error?.code ?? "unknown"}`);
    }
    return;
  }
  const count = (hdVideoRetries.get(video)?.count ?? 0) + 1;
  const delay = current ? Math.min(HD_VIDEO_RETRY_MAX_MS, HD_VIDEO_RETRY_BASE_MS * 2 ** (count - 1)) : 0;
  hdVideoRetries.set(video, { count, notBefore: performance.now() + delay });
  releaseHdVideo(video);
}

/** 放掉一支高清肖像視訊的解碼器與播放器；之後若又上場，`attachHdVideoSource` 會重新接上。 */
function releaseHdVideo(video: HTMLVideoElement): void {
  liveHdVideos.delete(video);
  const player = hdPlayers.get(video);
  hdPlayers.delete(video);
  if (player) player.dispose();
  else releaseHdVideoDecoder(video);
}

/**
 * 整段重寫 `innerHTML` 的表面丟掉舊肖像時不會通知這裡（換了單位的右欄、收起的全景戰鬥、重建的
 * 對白窗）。搬回去的節點在同一個 task 內就回到文件裡，到下一幀還不在文件裡的才是真的丟掉了。
 */
function releaseDetachedHdVideos(): void {
  for (const video of liveHdVideos) {
    if (!video.isConnected) releaseHdVideo(video);
  }
}

function portraitLayers(
  portrait: PortraitRecord,
  alt: string,
  baseTestId?: string,
  redEyes = false,
  originalStill = false,
): string {
  const hd = activePortraitHd(portrait, { redEyes });
  if (hd) return hdPortraitLayers(hd, alt, baseTestId);
  const portraitSource = portraitSourceFor(portrait);
  const animation: PortraitAnimationAssets | null = PORTRAIT_CATALOG[portrait].animation;
  const base = `${PORTRAIT_UNDERLAY}<img class="portrait-base" ${baseTestId ? `data-testid="${baseTestId}"` : ""} src="${stagedRenderAssetSource(portraitSource)}" data-source-url="${portraitSource}" alt="${alt}" />`;
  if (!animation || originalStill) return base;
  const eyeStyle = [
    `left:${percentage(animation.eyeOrigin.x)}`,
    `top:${percentage(animation.eyeOrigin.y)}`,
    `width:${percentage(animation.eyeSize.width)}`,
    `height:${percentage(animation.eyeSize.height)}`,
  ].join(";");
  const mouthStyle = [
    `left:${percentage(animation.mouthOrigin.x)}`,
    `top:${percentage(animation.mouthOrigin.y)}`,
    `width:${percentage(animation.mouthSize.width)}`,
    `height:${percentage(animation.mouthSize.height)}`,
  ].join(";");
  return `
    ${base}
    ${animation.eyes.map((source, index) =>
      `<img class="portrait-eye portrait-eye-${index + 1}" style="${eyeStyle}" src="${stagedRenderAssetSource(source)}" data-source-url="${source}" alt="" aria-hidden="true" />`,
    ).join("")}
    ${animation.redEyes
      ? `<img class="portrait-red-eyes" style="${eyeStyle}" src="${stagedRenderAssetSource(animation.redEyes)}" data-source-url="${animation.redEyes}" alt="" aria-hidden="true" />`
      : ""}
    ${animation.mouths.map((source, index) =>
      `<img class="portrait-mouth portrait-mouth-${index + 1}" style="${mouthStyle}" src="${stagedRenderAssetSource(source)}" data-source-url="${source}" alt="" aria-hidden="true" />`,
    ).join("")}`;
}

/**
 * 這張臉此刻畫哪一套；`configureAnimatedPortrait` 據此判斷要不要重建圖層。高清而要紅眼時畫的是
 * `REMAKE-195` 的紅眼版（`variant`）。
 */
const portraitStyleFor = (
  portrait: PortraitRecord,
  redEyes: boolean,
): { style: "hd" | "original"; mode?: string; variant?: "red-eyes" } => {
  const hd = activePortraitHd(portrait, { redEyes });
  if (!hd) return { style: "original" };
  return redEyes ? { style: "hd", mode: hd.mode, variant: "red-eyes" } : { style: "hd", mode: hd.mode };
};

export function animatedPortraitMarkup(portrait: PortraitRecord, options: PortraitMarkupOptions): string {
  const { style, mode, variant } = portraitStyleFor(portrait, options.redEyes ?? false);
  return `
    <span class="animated-portrait ${options.className}"
      data-portrait-style="${style}"${mode ? ` data-portrait-hd-mode="${mode}"` : ""}${variant ? ` data-portrait-hd-variant="${variant}"` : ""}
      ${options.wrapperTestId ? `data-testid="${options.wrapperTestId}"` : ""}
      data-portrait-channel="${options.channel}"
      data-portrait-record="${portrait}"
      data-blink-frame="1"
      data-blink-count="0"
      data-mouth-frame="1"
      data-talk-count="0"
      data-speaking="false"
      data-speech-driver="glyph"
      data-red-eyes="${options.redEyes ? "true" : "false"}"${options.originalStill ? `
      data-original-still="true"` : ""}
      data-portrait-ready="false">
      ${portraitLayers(portrait, options.alt, options.baseTestId, options.redEyes ?? false, options.originalStill ?? false)}
    </span>`;
}

export function configureAnimatedPortrait(
  element: HTMLElement,
  portrait: PortraitRecord,
  alt: string,
  channel: string,
  baseTestId?: string,
  redEyes = false,
): void {
  // 原版的紅眼只是覆蓋片的開關（樣式表看 `data-red-eyes`）；高清紅眼是另一支視訊，要重建圖層。
  const redEyesChanged = element.dataset.redEyes !== String(redEyes);
  element.dataset.redEyes = String(redEyes);
  const { style, mode, variant } = portraitStyleFor(portrait, redEyes);
  const recordChanged = element.dataset.portraitRecord !== String(portrait);
  if (recordChanged || element.dataset.portraitStyle !== style || (style === "hd" && redEyesChanged)) {
    element.dataset.portraitRecord = String(portrait);
    element.dataset.portraitChannel = channel;
    element.dataset.portraitStyle = style;
    if (mode) element.dataset.portraitHdMode = mode;
    else delete element.dataset.portraitHdMode;
    if (variant) element.dataset.portraitHdVariant = variant;
    else delete element.dataset.portraitHdVariant;
    delete element.dataset.portraitHdVideo;
    delete element.dataset.mouthOpenness;
    element.dataset.blinkFrame = "1";
    element.dataset.portraitReady = "false";
    delete element.dataset.portraitError;
    portraitPreparations.delete(element);
    // 只換風格（同一張臉）時不打斷正在說的話：發言、驅動與口型狀態都留著。
    if (recordChanged) {
      element.dataset.blinkCount = "0";
      element.dataset.mouthFrame = "1";
      element.dataset.talkCount = "0";
      element.dataset.speaking = "false";
      element.dataset.speechDriver = "glyph";
      speechStates.delete(element);
    }
    for (const video of element.querySelectorAll<HTMLVideoElement>("video.portrait-hd-video")) releaseHdVideo(video);
    element.innerHTML = portraitLayers(portrait, alt, baseTestId, redEyes, element.dataset.originalStill === "true");
    return;
  }
  const base = element.querySelector<HTMLImageElement>(".portrait-base");
  if (base) base.alt = alt;
}

/** Waits for the actual DOM layers so blink, mouth and typing clocks share one barrier. */
export function prepareAnimatedPortrait(element: HTMLElement): Promise<void> {
  const portrait = element.dataset.portraitRecord ?? "";
  const existing = portraitPreparations.get(element);
  if (existing?.portrait === portrait) return existing.promise;
  element.dataset.portraitReady = "false";
  delete element.dataset.portraitError;
  const images = [...element.querySelectorAll<HTMLImageElement>("img")];
  const video = element.querySelector<HTMLVideoElement>("video.portrait-hd-video");
  if (video) attachHdVideoSource(video);
  const pending = Promise.all([
    ...images.map(async (image) => {
      await image.decode();
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        throw new Error(`portrait layer decoded empty: ${image.src}`);
      }
    }),
    ...(video ? [hdVideoReady(element, video)] : []),
  ]).then(() => {
    if (element.dataset.portraitRecord === portrait) element.dataset.portraitReady = "true";
  }).catch((error: unknown) => {
    if (element.dataset.portraitRecord === portrait) {
      element.dataset.portraitReady = "false";
      element.dataset.portraitError = error instanceof Error ? error.message : String(error);
    }
    // 失敗的準備不能留在快取裡。`startPortraitAnimations` 每幀都會再叫一次，可是拿回
    // 的若還是同一個已拒絕的 Promise，這張肖像就永遠卡在 `portraitReady="false"`，
    // tick 於是每幀把它的眨眼狀態壓回 idle，`blinkCount` 再也不會前進。Chromium 在
    // 版面還在鋪好幾百張圖時會偶發地拒絕第一次 `decode()`（`staged-render-asset-cache`
    // 對同一個現象是有界退避重試），丟掉這筆紀錄才能讓下一幀真的重試。
    if (portraitPreparations.get(element)?.promise === pending) portraitPreparations.delete(element);
    throw error;
  });
  portraitPreparations.set(element, { portrait, promise: pending });
  return pending;
}

/**
 * 高清視訊的就緒條件：有第一幀可畫（`loadeddata`）。逾時不算失敗——封面就是第 0 幀，先照常
 * 開始逐字，播放器在視訊就緒後自行接上；載入錯誤交給 `handleHdVideoError`，只有檔案本身壞了才退回原版。
 */
function hdVideoReady(element: HTMLElement, video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", done);
      video.removeEventListener("error", failed);
      resolve();
    };
    const failed = () => {
      handleHdVideoError(element, video);
      done();
    };
    const timer = setTimeout(done, HD_VIDEO_READY_TIMEOUT_MS);
    video.addEventListener("loadeddata", done);
    video.addEventListener("error", failed);
  });
}

/**
 * `REMAKE-192` 說話的開始、逐字、打完與結束。對白層、結果回饋窗與結局劇情共用這四個入口，
 * 原版與高清兩套肖像的口型規則都只寫在這裡：
 *
 * - 無語音頁：逐字期間說話。原版每畫一個全形字切換一次（`nativeMouthFrameAfterGlyph`）；高清
 *   按說話節奏開合，標點閉嘴 160 ms。
 * - 有語音頁：語音有聲時說話，語音裡的停頓閉嘴，片段說完才停，與逐字是否打完無關（逐字通常
 *   比語音快一倍半）。原版每 80 ms 切換一次，高清按說話節奏開合。片段中途放棄時退回逐字。
 */
export function beginPortraitSpeech(
  portrait: HTMLElement | undefined,
  options: { readonly typing: boolean; readonly voiced: boolean },
): void {
  if (!portrait) return;
  portrait.dataset.speaking = String(options.typing);
  portrait.dataset.speechDriver = options.voiced ? "voice" : "glyph";
  portrait.dataset.mouthFrame = "1";
  const state = speechStateFor(portrait);
  state.clock.reset();
  state.nextToggleAt = 0;
}

/**
 * 每畫一個字呼叫。`voiceDriving` 為真（本頁的語音片段還在）時口型交給語音，逐字不切換；
 * 否則照原版逐字切換。高清肖像只在這裡記下標點停頓。
 */
export function portraitSpeechGlyph(portrait: HTMLElement | undefined, character: string, voiceDriving: boolean): void {
  if (!portrait) return;
  if (voiceDriving && portrait.dataset.speechDriver === "voice") return;
  if (portrait.dataset.portraitStyle === "hd") {
    if (speechGlyphIsPunctuation(character)) {
      speechStateFor(portrait).clock.quietUntil = programNow() + SPEECH_PUNCTUATION_QUIET_MS;
    }
    return;
  }
  if (!nativeStoryGlyphMovesMouth(character)) return;
  portrait.dataset.mouthFrame = nativeMouthFrameAfterGlyph(portrait.dataset.mouthFrame, character);
  portrait.dataset.talkCount = String(Number(portrait.dataset.talkCount ?? "0") + 1);
}

/** 逐字打完或被補完。有語音的頁面嘴巴繼續跟著語音，直到換頁或片段說完。 */
export function endPortraitTyping(portrait: HTMLElement | undefined): void {
  if (!portrait) return;
  portrait.dataset.speaking = "false";
  if (portrait.dataset.speechDriver !== "voice") portrait.dataset.mouthFrame = "1";
}

/** 換頁、換窗、收起或隱藏：這張臉不再說話。 */
export function stopPortraitSpeech(portrait: HTMLElement | undefined): void {
  if (!portrait) return;
  portrait.dataset.speaking = "false";
  portrait.dataset.speechDriver = "glyph";
  portrait.dataset.mouthFrame = "1";
  const state = speechStates.get(portrait);
  if (state) {
    state.clock.reset();
    state.nextToggleAt = 0;
  }
}

const hdPlayers = new WeakMap<HTMLVideoElement, PortraitHdPlayer>();

/**
 * `REMAKE-192` 肖像風格改變、高清檔案補進租約或某條記錄退回原版之後，把畫面上每一張動態
 * 肖像重新對一次該畫的那一套；臉沒換、風格沒變的不動。
 */
export function refreshAnimatedPortraits(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-portrait-channel]")) {
    const record = Number(element.dataset.portraitRecord);
    const channel = element.dataset.portraitChannel;
    if (!isPortraitRecord(record) || !channel) continue;
    const base = element.querySelector<HTMLImageElement>(".portrait-base");
    configureAnimatedPortrait(element, record, base?.alt ?? "", channel, base?.dataset.testid, element.dataset.redEyes === "true");
  }
}

/**
 * 換關重建 HUD 之類整段 `innerHTML` 重寫的表面，若同一個通道仍是同一張臉、同一套風格，
 * 就把舊的肖像節點搬回去：高清視訊不必從頭解碼重播，眨眼與口型狀態也接得上。舊節點在
 * 同一個 task 內重新插入，媒體元素不會因為短暫離開文件而被暫停。
 */
export function adoptAnimatedPortraits(container: ParentNode, previous: readonly HTMLElement[]): void {
  for (const old of previous) {
    const channel = old.dataset.portraitChannel;
    if (!channel) continue;
    const fresh = container.querySelector<HTMLElement>(`[data-portrait-channel="${CSS.escape(channel)}"]`);
    if (!fresh || fresh === old
      || fresh.dataset.portraitRecord !== old.dataset.portraitRecord
      || fresh.dataset.portraitStyle !== old.dataset.portraitStyle
      || fresh.dataset.redEyes !== old.dataset.redEyes
      || fresh.className !== old.className) {
      continue;
    }
    const freshBase = fresh.querySelector<HTMLImageElement>(".portrait-base");
    const oldBase = old.querySelector<HTMLImageElement>(".portrait-base");
    if (freshBase && oldBase) oldBase.alt = freshBase.alt;
    if (fresh.dataset.testid) old.dataset.testid = fresh.dataset.testid;
    fresh.replaceWith(old);
  }
}

export function startPortraitAnimations(
  root: HTMLElement,
  testMode: boolean,
  shouldPause: () => boolean = isProgramPaused,
  /** `REMAKE-192`：本頁語音此刻是否有聲；沒有語音頁時回傳 `undefined`。 */
  voiceActivity: () => boolean | undefined = () => undefined,
): () => void {
  const blinkStates = new Map<string, BlinkState>();
  let animationFrame = 0;

  const idleDelay = (previous?: number) => {
    const minimum = testMode ? TEST_BLINK_IDLE_MIN_MS : BLINK_IDLE_MIN_MS;
    const maximum = testMode ? TEST_BLINK_IDLE_MAX_MS : BLINK_IDLE_MAX_MS;
    const candidate = randomInteger(minimum, maximum);
    if (candidate !== previous) return candidate;
    return candidate === maximum ? candidate - 1 : candidate + 1;
  };
  const resetBlinkState = (portrait: PortraitRecord, now: number): BlinkState => {
    const idleDelayMs = idleDelay();
    return {
      portrait,
      stage: "idle",
      transitionAt: now + idleDelayMs,
      idleDelayMs,
      count: 0,
    };
  };

  const advanceBlink = (state: BlinkState, now: number): void => {
    if (now < state.transitionAt) return;
    if (state.stage === "idle") {
      state.stage = "closing";
      state.transitionAt = now + HALF_FRAME_MS;
    } else if (state.stage === "closing") {
      state.stage = "closed";
      state.transitionAt = now + CLOSED_FRAME_MS;
    } else if (state.stage === "closed") {
      state.stage = "opening";
      state.transitionAt = now + HALF_FRAME_MS;
    } else {
      state.stage = "idle";
      state.idleDelayMs = idleDelay(state.idleDelayMs);
      state.transitionAt = now + state.idleDelayMs;
      state.count += 1;
    }
  };

  const blinkFrameFor = (stage: BlinkStage): "1" | "2" | "3" => {
    if (stage === "closed") return "3";
    if (stage === "closing" || stage === "opening") return "2";
    return "1";
  };

  /** 這張臉此刻是否在說話：有語音就看語音，否則看逐字。 */
  const talkingNow = (element: HTMLElement): { talking: boolean; voiced: boolean } => {
    if (element.dataset.speechDriver === "voice") {
      const activity = voiceActivity();
      if (activity !== undefined) return { talking: activity, voiced: true };
    }
    return { talking: element.dataset.speaking === "true", voiced: false };
  };

  const forcedOpenness = (element: HTMLElement): number | undefined => {
    const forced = element.dataset.forceMouthFrame;
    return forced === undefined ? undefined : forced === "1" ? 0 : 1;
  };

  const tickHd = (element: HTMLElement, portrait: PortraitRecord, paused: boolean, clockNow: number) => {
    const video = element.querySelector<HTMLVideoElement>("video.portrait-hd-video");
    const canvas = element.querySelector<HTMLCanvasElement>("canvas.portrait-hd-canvas");
    if (element.dataset.portraitReady !== "true") {
      void prepareAnimatedPortrait(element).catch(() => undefined);
    }
    if (!video || !canvas) return;
    const entry = activePortraitHd(portrait, { redEyes: element.dataset.redEyes === "true" });
    if (!entry) return;
    attachHdVideoSource(video);
    // 退避中或檔案還不在租約裡：沒有來源可播，畫布留著上一幀、底下是封面。
    if (!video.hasAttribute("src")) return;
    let player = hdPlayers.get(video);
    if (!player || player.canvas !== canvas) {
      player = new PortraitHdPlayer(element, portrait, entry, video, canvas, testMode, () => handleHdVideoError(element, video));
      hdPlayers.set(video, player);
    }
    const state = speechStateFor(element);
    const { talking } = talkingNow(element);
    const forced = forcedOpenness(element);
    // 程式時鐘在全局暫停時凍結，音節也就停在當下的開度。
    state.clock.talking = talking;
    const before = state.clock.count;
    const openness = forced ?? state.clock.at(clockNow);
    if (state.clock.count !== before) {
      element.dataset.talkCount = String(Number(element.dataset.talkCount ?? "0") + (state.clock.count - before));
    }
    player.sync({
      paused,
      visible: element.isConnected && !element.hidden && element.getClientRects().length > 0,
      openness,
      talking: forced === undefined ? talking : forced > 0,
      now: clockNow,
    });
  };

  /** 原版肖像在有語音的頁面：語音有聲時每 80 ms 切換一次，停頓與說完閉嘴。 */
  const tickOriginalVoice = (element: HTMLElement, paused: boolean, clockNow: number) => {
    const { talking, voiced } = talkingNow(element);
    if (!voiced || paused) return;
    const state = speechStateFor(element);
    if (!talking) {
      if (element.dataset.mouthFrame !== "1") element.dataset.mouthFrame = "1";
      state.nextToggleAt = 0;
      return;
    }
    if (clockNow < state.nextToggleAt) return;
    element.dataset.mouthFrame = element.dataset.mouthFrame === "2" ? "1" : "2";
    element.dataset.talkCount = String(Number(element.dataset.talkCount ?? "0") + 1);
    state.nextToggleAt = clockNow + VOICE_MOUTH_TOGGLE_MS;
  };

  const tick = (now: number) => {
    const paused = shouldPause();
    const clockNow = programNow();
    releaseDetachedHdVideos();
    for (const element of root.querySelectorAll<HTMLElement>("[data-portrait-channel]")) {
      const channel = element.dataset.portraitChannel;
      const portrait = Number(element.dataset.portraitRecord);
      if (!channel || !isPortraitRecord(portrait)) continue;
      if (element.dataset.portraitStyle === "hd") {
        // 眨眼已經在視訊裡；原版的眨眼計時與口型覆蓋片在高清模式下停用。
        tickHd(element, portrait, paused, clockNow);
        continue;
      }
      if (!PORTRAIT_CATALOG[portrait].animation || element.dataset.originalStill === "true") continue;
      tickOriginalVoice(element, paused, clockNow);
      let blinkState = blinkStates.get(channel);
      if (!blinkState || blinkState.portrait !== portrait) {
        blinkState = resetBlinkState(portrait, now);
        blinkStates.set(channel, blinkState);
      }
      if (element.dataset.portraitReady !== "true") {
        void prepareAnimatedPortrait(element).catch(() => undefined);
      }
      if (paused || element.dataset.portraitReady !== "true") {
        blinkState.stage = "idle";
        blinkState.transitionAt = now + blinkState.idleDelayMs;
        element.dataset.blinkFrame = "1";
        continue;
      }
      advanceBlink(blinkState, now);
      element.dataset.blinkFrame = blinkFrameFor(blinkState.stage);
      element.dataset.blinkCount = String(blinkState.count);
      element.dataset.blinkDelayMs = String(blinkState.idleDelayMs);
    }
    animationFrame = requestAnimationFrame(tick);
  };

  animationFrame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(animationFrame);
}
