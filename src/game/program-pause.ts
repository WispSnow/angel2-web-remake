import {
  isProgramPaused,
  onProgramPauseChange,
  setProgramPaused,
  toggleProgramPaused,
} from "./program-clock";

const OVERLAY_TEST_ID = "program-pause-overlay";

let installed = false;
let overlay: HTMLElement | undefined;
let returnFocusTo: HTMLElement | undefined;
let priorInert = new Map<HTMLElement, boolean>();
let bodyObserver: MutationObserver | undefined;

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement
  || target instanceof HTMLTextAreaElement
  || (target instanceof HTMLElement && target.isContentEditable);

const isToggleKey = (event: KeyboardEvent): boolean =>
  event.key === "Pause"
  || (!event.altKey && !event.ctrlKey && !event.metaKey
    && event.key.toLowerCase() === "p" && !isEditable(event.target));

const freezeBodyChildren = () => {
  if (!overlay) return;
  priorInert = new Map();
  const freeze = (element: HTMLElement) => {
    if (element === overlay || priorInert.has(element)) return;
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

const applyPausedUi = (paused: boolean) => {
  if (!overlay) return;
  document.documentElement.dataset.programPaused = String(paused);
  overlay.hidden = !paused;
  overlay.setAttribute("aria-hidden", String(!paused));
  if (paused) {
    const active = document.activeElement;
    returnFocusTo = active instanceof HTMLElement ? active : undefined;
    freezeBodyChildren();
    overlay.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  } else {
    restoreBodyChildren();
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

  overlay.addEventListener("click", (event) => {
    if ((event.target as Element).closest("button")) setProgramPaused(false);
  });
  overlay.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (isToggleKey(event) || event.key === "Escape") {
      event.preventDefault();
      if (!event.repeat) setProgramPaused(false);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (isProgramPaused() && overlay?.contains(event.target as Node)) return;
    if (isToggleKey(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) toggleProgramPaused();
      return;
    }
    if (!isProgramPaused()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
  onProgramPauseChange(applyPausedUi);
  applyPausedUi(isProgramPaused());
}

/** Adds the discoverable host-chrome control for the global keyboard action. */
export function mountProgramPauseButton(host: HTMLElement): () => void {
  installProgramPause();
  const group = document.createElement("div");
  group.className = "program-pause-trigger";
  group.innerHTML = `<button type="button" data-testid="program-pause-toggle"
    title="凍結遊戲時間、畫面與聲音（P／Pause）">暫停</button>`;
  const button = group.querySelector<HTMLButtonElement>("button");
  if (!button) return () => undefined;
  const render = (paused: boolean) => {
    button.textContent = paused ? "繼續" : "暫停";
    button.setAttribute("aria-pressed", String(paused));
  };
  const click = () => toggleProgramPaused();
  button.addEventListener("click", click);
  // Host chrome keys must never reach the surface-specific window handlers.
  group.addEventListener("keydown", (event) => event.stopPropagation());
  host.prepend(group);
  const unsubscribe = onProgramPauseChange(render);
  render(isProgramPaused());
  return () => {
    unsubscribe();
    button.removeEventListener("click", click);
    group.remove();
  };
}
