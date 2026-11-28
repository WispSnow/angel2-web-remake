import {
  isProgramHeldSilently,
  isProgramPaused,
  onProgramPauseChange,
  setProgramPaused,
  toggleProgramPaused,
} from "./program-clock";

const OVERLAY_TEST_ID = "program-pause-overlay";

/**
 * Body-level roots marked with this attribute stay interactive while the program
 * is paused: the reference panels the host menu opens (復刻說明／圖鑑／RoadMap)
 * live beside the pause overlay rather than inside it, and still have to take
 * input, focus and scrolling while everything else is `inert`.
 */
export const PROGRAM_PAUSE_EXEMPT_ATTRIBUTE = "data-program-pause-exempt";

/**
 * What the pause overlay shows. The host menu registers itself while a game
 * surface is mounted; without one (loading pages, a failed debug load) the
 * overlay falls back to its own minimal 「遊戲已暫停」 dialog.
 */
export interface ProgramPausePresenter {
  /** Mounted inside the overlay for as long as the presenter is registered. */
  readonly element: HTMLElement;
  /** Runs after the freeze boundary is in place; must move focus inside `element`. */
  show(): void;
  /** Runs on resume, before focus goes back to where it was. */
  hide(): void;
  /** `Esc` while focus sits outside every interactive pause surface. */
  back(): void;
}

let installed = false;
let overlay: HTMLElement | undefined;
let dialog: HTMLElement | undefined;
let returnFocusTo: HTMLElement | undefined;
let priorInert = new Map<HTMLElement, boolean>();
let bodyObserver: MutationObserver | undefined;
/** Last registered wins; surfaces hand over by unregistering on teardown. */
const presenters: ProgramPausePresenter[] = [];

const activePresenter = (): ProgramPausePresenter | undefined => presenters.at(-1);

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement
  || target instanceof HTMLTextAreaElement
  || (target instanceof HTMLElement && target.isContentEditable);

const isToggleKey = (event: KeyboardEvent): boolean =>
  event.key === "Pause"
  || (!event.altKey && !event.ctrlKey && !event.metaKey
    && event.key.toLowerCase() === "p" && !isEditable(event.target));

const isExempt = (element: HTMLElement): boolean =>
  element === overlay || element.hasAttribute(PROGRAM_PAUSE_EXEMPT_ATTRIBUTE);

/** Targets that handle (and stop) their own keys while the program is paused. */
const isPauseInteractive = (target: EventTarget | null): boolean =>
  target instanceof Node
  && (Boolean(overlay?.contains(target))
    || (target instanceof Element
      ? target.closest(`[${PROGRAM_PAUSE_EXEMPT_ATTRIBUTE}]`) !== null
      : target.parentElement?.closest(`[${PROGRAM_PAUSE_EXEMPT_ATTRIBUTE}]`) !== null));

const freezeBodyChildren = () => {
  if (!overlay) return;
  priorInert = new Map();
  const freeze = (element: HTMLElement) => {
    if (isExempt(element) || priorInert.has(element)) return;
    priorInert.set(element, element.inert);
    element.inert = true;
  };
  for (const child of document.body.children) {
    if (child instanceof HTMLElement) freeze(child);
  }
  bodyObserver?.disconnect();
  bodyObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement) freeze(node);
      }
    }
  });
  bodyObserver.observe(document.body, { childList: true });
};

const restoreBodyChildren = () => {
  bodyObserver?.disconnect();
  bodyObserver = undefined;
  for (const [element, inert] of priorInert) {
    if (element.isConnected) element.inert = inert;
  }
  priorInert.clear();
};

const syncMode = () => {
  if (!overlay || !dialog) return;
  const presenter = activePresenter();
  overlay.dataset.mode = presenter ? "host-menu" : "dialog";
  dialog.hidden = presenter !== undefined;
};

const applyPausedUi = (paused: boolean) => {
  if (!overlay) return;
  // A capture readiness hold freezes the clock with nothing on screen.
  if (isProgramHeldSilently()) return;
  document.documentElement.dataset.programPaused = String(paused);
  overlay.hidden = !paused;
  overlay.setAttribute("aria-hidden", String(!paused));
  syncMode();
  const presenter = activePresenter();
  if (paused) {
    const active = document.activeElement;
    returnFocusTo = active instanceof HTMLElement ? active : undefined;
    freezeBodyChildren();
    if (presenter) presenter.show();
    else dialog?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  } else {
    presenter?.hide();
    restoreBodyChildren();
    // Chrome only drops focus from a `display:none` element at its next rendering
    // update. Until then the hidden menu row, close gem or panel control keeps
    // focus, and a key pressed right after resuming lands in the overlay's own
    // handlers instead of the game — under load that window spans whole frames.
    const active = document.activeElement;
    if (active instanceof HTMLElement && isPauseInteractive(active)) active.blur();
    if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    returnFocusTo = undefined;
  }
};

/**
 * Installs the one modal that is deliberately allowed to keep receiving input
 * while the rest of the game is frozen.  Call once near application startup so
 * its capture listener precedes the surface-specific window handlers.
 */
export function installProgramPause(): void {
  if (installed) return;
  installed = true;
  overlay = document.createElement("div");
  overlay.className = "program-pause-overlay";
  overlay.dataset.testid = OVERLAY_TEST_ID;
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="program-pause-scrim"></div>
    <section class="program-pause-dialog" role="dialog" aria-modal="true"
      aria-labelledby="program-pause-title" aria-describedby="program-pause-detail">
      <p class="program-pause-kicker">PROGRAM PAUSED</p>
      <h1 id="program-pause-title">遊戲已暫停</h1>
      <p id="program-pause-detail">遊戲時間、畫面與聲音均已凍結。</p>
      <button type="button" data-testid="program-pause-resume">繼續遊戲</button>
      <small>按 P、Pause 或 Esc 繼續</small>
    </section>`;
  document.body.appendChild(overlay);
  dialog = overlay.querySelector<HTMLElement>(".program-pause-dialog") ?? undefined;

  dialog?.addEventListener("click", (event) => {
    if ((event.target as Element).closest("button")) setProgramPaused(false);
  });
  dialog?.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (!event.repeat) setProgramPaused(false);
    }
  });
  window.addEventListener("keydown", (event) => {
    // Nothing may move the scene off its first frame before the recorder starts it.
    if (isProgramHeldSilently()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // P／Pause toggle from anywhere, including inside the menu or an open panel,
    // so one key always means "back to the game".
    if (isToggleKey(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) toggleProgramPaused();
      return;
    }
    if (!isProgramPaused()) return;
    // The overlay and the panels it opened consume their own keys.
    if (isPauseInteractive(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Focus can fall to `body` (a click on a non-focusable spot); `Esc` must still work.
    if (event.key !== "Escape" || event.repeat) return;
    const presenter = activePresenter();
    if (presenter) presenter.back();
    else setProgramPaused(false);
  }, { capture: true });
  onProgramPauseChange(applyPausedUi);
  applyPausedUi(isProgramPaused());
}

/**
 * Puts `presenter` in charge of the pause overlay until the returned function
 * runs. Every game surface rebuilds its host menu on mount, so registration
 * follows the surface lifetime rather than the page's.
 */
export function registerProgramPausePresenter(presenter: ProgramPausePresenter): () => void {
  installProgramPause();
  const previous = activePresenter();
  if (isProgramPaused()) previous?.hide();
  presenters.push(presenter);
  overlay?.append(presenter.element);
  syncMode();
  if (isProgramPaused()) presenter.show();
  return () => {
    const index = presenters.indexOf(presenter);
    if (index < 0) return;
    const wasActive = index === presenters.length - 1;
    if (wasActive && isProgramPaused()) presenter.hide();
    presenters.splice(index, 1);
    presenter.element.remove();
    syncMode();
    if (!wasActive || !isProgramPaused()) return;
    const next = activePresenter();
    if (next) next.show();
    else dialog?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  };
}
