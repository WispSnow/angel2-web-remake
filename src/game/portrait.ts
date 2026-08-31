import {
  isPortraitRecord,
  PORTRAIT_CATALOG,
  portraitSourceFor,
} from "./content/portrait-catalog.generated";
import type { PortraitRecord } from "./types";
import { stagedRenderAssetSource } from "./staged-render-asset-cache";
import { isProgramPaused } from "./program-clock";

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
}

const HALF_FRAME_MS = 85;
const CLOSED_FRAME_MS = 135;
const BLINK_IDLE_MIN_MS = 600;
const BLINK_IDLE_MAX_MS = 2_400;
const TEST_BLINK_IDLE_MIN_MS = 220;
const TEST_BLINK_IDLE_MAX_MS = 520;
const PORTRAIT_SIZE = 112;
const portraitPreparations = new WeakMap<HTMLElement, {
  readonly portrait: string;
  readonly promise: Promise<void>;
}>();

const percentage = (value: number) => `${(value / PORTRAIT_SIZE * 100).toFixed(6)}%`;
const randomInteger = (minimum: number, maximum: number) =>
  minimum + Math.floor(Math.random() * (maximum - minimum + 1));

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

function portraitLayers(portrait: PortraitRecord, alt: string, baseTestId?: string): string {
  const portraitSource = portraitSourceFor(portrait);
  const animation = PORTRAIT_CATALOG[portrait].animation;
  const base = `${PORTRAIT_UNDERLAY}<img class="portrait-base" ${baseTestId ? `data-testid="${baseTestId}"` : ""} src="${stagedRenderAssetSource(portraitSource)}" data-source-url="${portraitSource}" alt="${alt}" />`;
  if (!animation) return base;
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
    ${animation.mouths.map((source, index) =>
      `<img class="portrait-mouth portrait-mouth-${index + 1}" style="${mouthStyle}" src="${stagedRenderAssetSource(source)}" data-source-url="${source}" alt="" aria-hidden="true" />`,
    ).join("")}`;
}

export function animatedPortraitMarkup(portrait: PortraitRecord, options: PortraitMarkupOptions): string {
  return `
    <span class="animated-portrait ${options.className}"
      ${options.wrapperTestId ? `data-testid="${options.wrapperTestId}"` : ""}
      data-portrait-channel="${options.channel}"
      data-portrait-record="${portrait}"
      data-blink-frame="1"
      data-blink-count="0"
      data-mouth-frame="1"
      data-talk-count="0"
      data-speaking="false"
      data-portrait-ready="false">
      ${portraitLayers(portrait, options.alt, options.baseTestId)}
    </span>`;
}

export function configureAnimatedPortrait(
  element: HTMLElement,
  portrait: PortraitRecord,
  alt: string,
  channel: string,
  baseTestId?: string,
): void {
  if (element.dataset.portraitRecord !== String(portrait)) {
    element.dataset.portraitRecord = String(portrait);
    element.dataset.portraitChannel = channel;
    element.dataset.blinkFrame = "1";
    element.dataset.blinkCount = "0";
    element.dataset.mouthFrame = "1";
    element.dataset.talkCount = "0";
    element.dataset.speaking = "false";
    element.dataset.portraitReady = "false";
    delete element.dataset.portraitError;
    portraitPreparations.delete(element);
    element.innerHTML = portraitLayers(portrait, alt, baseTestId);
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
  const pending = Promise.all(images.map(async (image) => {
    await image.decode();
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error(`portrait layer decoded empty: ${image.src}`);
    }
  })).then(() => {
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
    // 對同一個現象是重試一次），丟掉這筆紀錄才能讓下一幀真的重試。
    if (portraitPreparations.get(element)?.promise === pending) portraitPreparations.delete(element);
    throw error;
  });
  portraitPreparations.set(element, { portrait, promise: pending });
  return pending;
}

export function startPortraitAnimations(
  root: HTMLElement,
  testMode: boolean,
  shouldPause: () => boolean = isProgramPaused,
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

  const tick = (now: number) => {
    const paused = shouldPause();
    for (const element of root.querySelectorAll<HTMLElement>("[data-portrait-channel]")) {
      const channel = element.dataset.portraitChannel;
      const portrait = Number(element.dataset.portraitRecord);
      if (!channel || !isPortraitRecord(portrait) || !PORTRAIT_CATALOG[portrait].animation) continue;
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
