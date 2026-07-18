import { ASSETS } from "./content/stage0";
import type { PortraitRecord } from "./types";

type BlinkStage = "idle" | "closing" | "closed" | "opening";

interface BlinkState {
  portrait: PortraitRecord;
  stage: BlinkStage;
  transitionAt: number;
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
const PORTRAIT_SIZE = 112;

const percentage = (value: number) => `${(value / PORTRAIT_SIZE * 100).toFixed(6)}%`;

function portraitLayers(portrait: PortraitRecord, alt: string, baseTestId?: string): string {
  const animation = ASSETS.portraitAnimations[portrait];
  const eyeStyle = [
    `left:${percentage(animation.eyeOrigin.x)}`,
    `top:${percentage(animation.eyeOrigin.y)}`,
    `width:${percentage(animation.eyeSize.width)}`,
    `height:${percentage(animation.eyeSize.height)}`,
  ].join(";");
  return `
    <img class="portrait-base" ${baseTestId ? `data-testid="${baseTestId}"` : ""} src="${ASSETS.portraits[portrait]}" alt="${alt}" />
    ${animation.eyes.map((source, index) =>
      `<img class="portrait-eye portrait-eye-${index + 1}" style="${eyeStyle}" src="${source}" alt="" aria-hidden="true" />`,
    ).join("")}`;
}

export function animatedPortraitMarkup(portrait: PortraitRecord, options: PortraitMarkupOptions): string {
  return `
    <span class="animated-portrait ${options.className}"
      ${options.wrapperTestId ? `data-testid="${options.wrapperTestId}"` : ""}
      data-portrait-channel="${options.channel}"
      data-portrait-record="${portrait}"
      data-blink-frame="1"
      data-blink-count="0">
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
    element.innerHTML = portraitLayers(portrait, alt, baseTestId);
    return;
  }
  const base = element.querySelector<HTMLImageElement>(".portrait-base");
  if (base) base.alt = alt;
}

export function startPortraitBlinking(root: HTMLElement, testMode: boolean): () => void {
  const states = new Map<string, BlinkState>();
  let animationFrame = 0;

  const idleDelay = () => testMode ? 320 : 900 + Math.floor(Math.random() * 1_700);
  const resetState = (portrait: PortraitRecord, now: number): BlinkState => ({
    portrait,
    stage: "idle",
    transitionAt: now + idleDelay(),
    count: 0,
  });

  const advance = (state: BlinkState, now: number): void => {
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
      state.transitionAt = now + idleDelay();
      state.count += 1;
    }
  };

  const frameFor = (stage: BlinkStage): "1" | "2" | "3" => {
    if (stage === "closed") return "3";
    if (stage === "closing" || stage === "opening") return "2";
    return "1";
  };

  const tick = (now: number) => {
    for (const element of root.querySelectorAll<HTMLElement>("[data-portrait-channel]")) {
      const channel = element.dataset.portraitChannel;
      const portrait = Number(element.dataset.portraitRecord) as PortraitRecord;
      if (!channel || !ASSETS.portraitAnimations[portrait]) continue;
      let state = states.get(channel);
      if (!state || state.portrait !== portrait) {
        state = resetState(portrait, now);
        states.set(channel, state);
      }
      advance(state, now);
      element.dataset.blinkFrame = frameFor(state.stage);
      element.dataset.blinkCount = String(state.count);
    }
    animationFrame = requestAnimationFrame(tick);
  };

  animationFrame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(animationFrame);
}
