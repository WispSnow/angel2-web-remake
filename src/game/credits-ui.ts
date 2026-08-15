import {
  CREDITS_FINAL_SCREEN,
  CREDITS_FINAL_TIMELINE,
  CREDITS_PAGES,
  CREDITS_ROLE_FRAMES,
  CREDITS_NAME_FRAMES,
  CREDITS_TRANSITION,
} from "./content/credits";
import type { GameController } from "./controller";
import { configureGameScaling } from "./scaling";

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function pageMarkup(pageIndex: number, offset: number, testId = false): string {
  const page = CREDITS_PAGES[pageIndex];
  if (!page) return "";
  const roles: ReadonlyMap<number, (typeof CREDITS_ROLE_FRAMES)[number]> = new Map(
    CREDITS_ROLE_FRAMES.map((frame) => [frame.frame, frame]),
  );
  const names: ReadonlyMap<number, (typeof CREDITS_NAME_FRAMES)[number]> = new Map(
    CREDITS_NAME_FRAMES.map((frame) => [frame.frame, frame]),
  );
  const frames = page.frames.map((frame) => {
    const image = frame.resource.startsWith("B.") ? roles.get(frame.frame) : names.get(frame.frame);
    if (!image) return "";
    return `<img class="credits-frame" src="${image.src}" alt="${escapeHtml(image.text)}"
      style="left:${frame.x}px;top:${frame.y - 400 + offset}px">`;
  }).join("");
  return `<div class="credits-page"${testId ? ' data-testid="credits-page"' : ""}
    aria-label="製作人員表 ${pageIndex + 1}／${CREDITS_PAGES.length}">${frames}</div>`;
}

function scrollMarkup(transitionIndex: number): string {
  const pageIndex = Math.min(transitionIndex, CREDITS_PAGES.length - 1);
  const previous = transitionIndex > 0 ? pageMarkup(pageIndex - 1, 0) : "";
  const incoming = transitionIndex < CREDITS_PAGES.length
    ? pageMarkup(pageIndex, 400, true)
    : "";
  const label = incoming
    ? `製作人員表 ${pageIndex + 1}／${CREDITS_PAGES.length}`
    : "製作人員表結束轉場";
  return `<div class="credits-roll" data-transition-index="${transitionIndex}"
    aria-label="${label}">${previous}${incoming}</div>`;
}

function finalMarkup(): string {
  return `<div class="credits-final" data-testid="credits-final" aria-label="The End">
    <img class="credits-final-base" src="${CREDITS_FINAL_SCREEN.base}" alt="The End">
    <div class="credits-final-overlay" aria-hidden="true">
      ${CREDITS_FINAL_SCREEN.overlays.map((src, index) => `<img data-credit-frame="${index + 1}" src="${src}" alt="">`).join("")}
    </div>
  </div>`;
}

export function mountCreditsUi(root: HTMLElement, controller: GameController): () => void {
  root.innerHTML = `<main class="credits-page-shell">
    <div class="game-stage"><div class="game-viewport credits-viewport" id="credits-viewport">
      <div class="logical-screen credits-screen" id="credits-screen" data-testid="credits-screen"
        aria-live="polite" aria-label="製作人員表"></div>
    </div></div>
  </main>`;
  const viewport = root.querySelector<HTMLElement>("#credits-viewport");
  const screen = root.querySelector<HTMLElement>("#credits-screen");
  if (!viewport || !screen) throw new Error("credits surface not found");
  const destroyScaling = configureGameScaling(viewport, screen);
  let scrollAnimation: Animation | undefined;
  let finalTimer: number | undefined;
  let finalStepIndex = 0;

  const stopFinalAnimation = () => {
    if (finalTimer !== undefined) window.clearTimeout(finalTimer);
    finalTimer = undefined;
  };

  const setFinalFrame = (frame: number | null) => {
    for (const image of screen.querySelectorAll<HTMLElement>("[data-credit-frame]")) {
      image.hidden = Number(image.dataset.creditFrame) !== frame;
    }
  };

  const startFinalAnimation = () => {
    stopFinalAnimation();
    finalStepIndex = 0;
    const runStep = () => {
      const step = CREDITS_FINAL_TIMELINE[finalStepIndex];
      if (!step) return;
      setFinalFrame(step.frame);
      const delay = controller.isTestMode
        ? 20
        : controller.presentationFast
          ? Math.max(20, step.waitNativeTicks * 3)
          : step.waitNativeTicks * 10;
      finalTimer = window.setTimeout(() => {
        finalStepIndex = (finalStepIndex + 1) % CREDITS_FINAL_TIMELINE.length;
        runStep();
      }, delay);
    };
    runStep();
  };

  const stopScrollAnimation = () => {
    if (!scrollAnimation) return;
    scrollAnimation.cancel();
    scrollAnimation = undefined;
  };

  const startScrollAnimation = () => {
    stopScrollAnimation();
    const roll = screen.querySelector<HTMLElement>(".credits-roll");
    if (!roll) return;
    const duration = controller.isTestMode
      ? 160
      : controller.presentationFast
        ? 2_500
        : CREDITS_TRANSITION.nativeSteps * CREDITS_TRANSITION.waitNativeTicksPerStep * 10;
    scrollAnimation = roll.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(-400px)" }],
      { duration, easing: "linear", fill: "forwards" },
    );
    void scrollAnimation.finished.then(() => {
      scrollAnimation = undefined;
      controller.advanceCredits();
    }).catch(() => undefined);
  };

  const render = () => {
    stopFinalAnimation();
    stopScrollAnimation();
    const credits = controller.credits;
    if (!credits) return;
    if (credits.section === "the-end") {
      screen.innerHTML = finalMarkup();
      screen.setAttribute("aria-label", "The End");
      startFinalAnimation();
      return;
    }
    screen.innerHTML = scrollMarkup(credits.transitionIndex);
    screen.setAttribute("aria-label", `製作人員表轉場 ${credits.transitionIndex + 1}／${CREDITS_TRANSITION.count}`);
    startScrollAnimation();
  };

  const unsubscribe = controller.onChange(render);
  render();
  return () => {
    stopFinalAnimation();
    stopScrollAnimation();
    unsubscribe();
    destroyScaling();
  };
}
