import { ASSETS } from "./content/stage0";
import type { PortraitRecord } from "./types";

type BlinkStage = "idle" | "closing" | "closed" | "opening";

interface BlinkState {
  portrait: PortraitRecord;
  stage: BlinkStage;
  transitionAt: number;
  idleDelayMs: number;
  count: number;
}

interface TalkState {
  portrait: PortraitRecord;
  active: boolean;
  sequenceIndex: number;
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
const BLINK_IDLE_MIN_MS = 1_800;
const BLINK_IDLE_MAX_MS = 5_400;
const TEST_BLINK_IDLE_MIN_MS = 220;
const TEST_BLINK_IDLE_MAX_MS = 520;
const TALK_FRAME_MIN_MS = 75;
const TALK_FRAME_MAX_MS = 140;
const TALK_SEQUENCE = ["1", "2", "3", "2"] as const;
const PORTRAIT_SIZE = 112;

const percentage = (value: number) => `${(value / PORTRAIT_SIZE * 100).toFixed(6)}%`;
const randomInteger = (minimum: number, maximum: number) =>
  minimum + Math.floor(Math.random() * (maximum - minimum + 1));

function portraitLayers(portrait: PortraitRecord, alt: string, baseTestId?: string): string {
  const animation = ASSETS.portraitAnimations[portrait];
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
    <img class="portrait-base" ${baseTestId ? `data-testid="${baseTestId}"` : ""} src="${ASSETS.portraits[portrait]}" alt="${alt}" />
    ${animation.eyes.map((source, index) =>
      `<img class="portrait-eye portrait-eye-${index + 1}" style="${eyeStyle}" src="${source}" alt="" aria-hidden="true" />`,
    ).join("")}
    ${animation.mouths.map((source, index) =>
      `<img class="portrait-mouth portrait-mouth-${index + 1}" style="${mouthStyle}" src="${source}" alt="" aria-hidden="true" />`,
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
      data-speaking="false">
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
    element.innerHTML = portraitLayers(portrait, alt, baseTestId);
    return;
  }
  const base = element.querySelector<HTMLImageElement>(".portrait-base");
  if (base) base.alt = alt;
}

export function startPortraitAnimations(root: HTMLElement, testMode: boolean): () => void {
  const blinkStates = new Map<string, BlinkState>();
  const talkStates = new Map<string, TalkState>();
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

  const resetTalkState = (portrait: PortraitRecord, now: number): TalkState => ({
    portrait,
    active: false,
    sequenceIndex: 0,
    transitionAt: now,
    count: 0,
  });

  const advanceTalk = (state: TalkState, speaking: boolean, now: number): "1" | "2" | "3" => {
    if (!speaking) {
      state.active = false;
      state.sequenceIndex = 0;
      state.transitionAt = now;
      return "1";
    }
    if (!state.active) {
      state.active = true;
      state.sequenceIndex = 1;
      state.transitionAt = now + randomInteger(TALK_FRAME_MIN_MS, TALK_FRAME_MAX_MS);
      state.count += 1;
    } else if (now >= state.transitionAt) {
      state.sequenceIndex = (state.sequenceIndex + 1) % TALK_SEQUENCE.length;
      state.transitionAt = now + randomInteger(TALK_FRAME_MIN_MS, TALK_FRAME_MAX_MS);
      state.count += 1;
    }
    return TALK_SEQUENCE[state.sequenceIndex];
  };

  const tick = (now: number) => {
    for (const element of root.querySelectorAll<HTMLElement>("[data-portrait-channel]")) {
      const channel = element.dataset.portraitChannel;
      const portrait = Number(element.dataset.portraitRecord) as PortraitRecord;
      if (!channel || !ASSETS.portraitAnimations[portrait]) continue;
      let blinkState = blinkStates.get(channel);
      if (!blinkState || blinkState.portrait !== portrait) {
        blinkState = resetBlinkState(portrait, now);
        blinkStates.set(channel, blinkState);
      }
      let talkState = talkStates.get(channel);
      if (!talkState || talkState.portrait !== portrait) {
        talkState = resetTalkState(portrait, now);
        talkStates.set(channel, talkState);
      }
      advanceBlink(blinkState, now);
      element.dataset.blinkFrame = blinkFrameFor(blinkState.stage);
      element.dataset.blinkCount = String(blinkState.count);
      element.dataset.blinkDelayMs = String(blinkState.idleDelayMs);
      element.dataset.mouthFrame = advanceTalk(talkState, element.dataset.speaking === "true", now);
      element.dataset.talkCount = String(talkState.count);
    }
    animationFrame = requestAnimationFrame(tick);
  };

  animationFrame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(animationFrame);
}
