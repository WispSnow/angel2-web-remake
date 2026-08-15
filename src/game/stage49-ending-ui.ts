import { portraitSourceFor } from "./content/portrait-catalog.generated";
import { STAGE49_ENDING_ASSETS } from "./content/stage49-ending";
import type { GameController } from "./controller";
import { configureGameScaling } from "./scaling";
import type { DialoguePage } from "./types";

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function dialogueWindow(
  slot: "upper" | "lower",
  line: DialoguePage["upper"] | DialoguePage["lower"],
  active: boolean,
): string {
  if (!line
    || line.portrait === undefined
    || line.speaker === undefined
    || line.text === undefined) return "";
  return `<section class="stage49-dialogue-window is-${slot} ${active ? "is-active" : ""}">
    <img src="${portraitSourceFor(line.portrait)}" alt="${escapeHtml(line.speaker)}肖像">
    <strong>${escapeHtml(line.speaker)}</strong>
    <p>${escapeHtml(line.text)}</p>
  </section>`;
}

function storyMarkup(controller: GameController): string {
  const session = controller.stage49Ending;
  const page: DialoguePage | undefined = session?.storyPage;
  if (!page || !session) return "";
  return `<div class="stage49-story" data-testid="stage49-story">
    <img class="stage49-story-background" src="${STAGE49_ENDING_ASSETS.storyBackground}" alt="">
    ${dialogueWindow("upper", page.upper, page.activeSlot === "upper")}
    ${dialogueWindow("lower", page.lower, page.activeSlot === "lower")}
    <span class="stage49-progress">戰後道別 ${session.index + 1}／17</span>
  </div>`;
}

function rosterMarkup(controller: GameController): string {
  const session = controller.stage49Ending;
  const card = session?.rosterCard;
  if (!card || !session) return "";
  return `<div class="stage49-roster" data-testid="stage49-roster">
    <div class="stage49-roster-stripe" aria-hidden="true"></div>
    <img class="stage49-decoration" src="${STAGE49_ENDING_ASSETS.decoration(card.actor.decorationRecord)}" alt="">
    <img class="stage49-roster-portrait" src="${portraitSourceFor(card.actor.portraitRecord)}" alt="${escapeHtml(card.actor.name)}肖像">
    <section class="stage49-roster-copy">
      <span>戰後記錄 ${session.index + 1}／22</span>
      <h2>${escapeHtml(card.actor.name)}</h2>
      <dl>
        <div><dt>兵種</dt><dd>${escapeHtml(card.className)}</dd></div>
        <div><dt>等級</dt><dd>${card.level}</dd></div>
        <div><dt>生命</dt><dd>${card.maxLife}</dd></div>
        <div><dt>攻擊</dt><dd>${card.attack}</dd></div>
        <div><dt>防禦</dt><dd>${card.defense}</dd></div>
        <!-- Native label is 戰績：00000 人; keep the five-digit pad and unit. -->
        <div class="is-record"><dt>戰績</dt><dd data-testid="stage49-record">${
          String(Math.min(card.record, 99_999)).padStart(5, "0")
        } 人</dd></div>
      </dl>
    </section>
  </div>`;
}

function epilogueMarkup(controller: GameController): string {
  const session = controller.stage49Ending;
  const presentation = session?.epiloguePresentation;
  if (!presentation || !session) return "";
  const [left, right] = presentation.variant.illustrationRecords;
  return `<div class="stage49-epilogue" data-testid="stage49-epilogue"
      data-segment="${presentation.segment.id}" data-selector="${presentation.variant.selector}">
    <img class="stage49-epilogue-left" src="${STAGE49_ENDING_ASSETS.epilogue(left)}" alt="">
    <img class="stage49-epilogue-right" src="${STAGE49_ENDING_ASSETS.epilogue(right)}" alt="">
    <p>${escapeHtml(presentation.variant.text)}</p>
    <span class="stage49-progress">尾聲 ${session.index + 1}／4</span>
  </div>`;
}

function boundaryMarkup(): string {
  return `<div class="stage49-boundary" data-testid="stage38-boundary">
    <span>MAIN ENDING COMPLETE</span>
    <h2>主線結局完成</h2>
    <p>原版接下來進入隱藏第 38 關；該關與其後製作人員表仍在設計凍結範圍內。</p>
    <strong>隱藏關邊界 · STAGE 38</strong>
  </div>`;
}

export function mountStage49EndingUi(
  root: HTMLElement,
  controller: GameController,
): () => void {
  root.innerHTML = `<main class="stage49-page">
    <div class="game-stage">
      <div class="game-viewport stage49-viewport" id="stage49-viewport">
        <button type="button" class="logical-screen stage49-screen" id="stage49-screen"
          data-testid="ending-advance" aria-label="推進主線結局"></button>
      </div>
    </div>
    <p class="stage49-help">點擊畫面或按 Enter／Space 推進；戰績卡與尾聲亦會依原版上限自動推進。</p>
  </main>`;
  const viewport = root.querySelector<HTMLElement>("#stage49-viewport");
  const screen = root.querySelector<HTMLButtonElement>("#stage49-screen");
  if (!viewport || !screen) throw new Error("stage 49 ending surface not found");
  const destroyScaling = configureGameScaling(viewport, screen);
  let timer: number | undefined;
  const render = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    const session = controller.stage49Ending;
    if (!session) return;
    screen.disabled = session.section === "stage38-boundary";
    screen.innerHTML = session.section === "story"
      ? storyMarkup(controller)
      : session.section === "roster"
        ? rosterMarkup(controller)
        : session.section === "epilogue"
          ? epilogueMarkup(controller)
          : boundaryMarkup();
    const delay = session.autoAdvanceMilliseconds;
    if (delay !== undefined && session.section !== "stage38-boundary") {
      timer = window.setTimeout(
        () => controller.advanceStage49Ending(),
        controller.presentationFast ? Math.min(30, delay) : delay,
      );
    }
  };
  const advance = () => controller.advanceStage49Ending();
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!event.repeat) advance();
  };
  screen.addEventListener("click", advance);
  window.addEventListener("keydown", keydown);
  const unsubscribe = controller.onChange(render);
  render();
  screen.focus({ preventScroll: true });
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
    unsubscribe();
    destroyScaling();
    window.removeEventListener("keydown", keydown);
  };
}
