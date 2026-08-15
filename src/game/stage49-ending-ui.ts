import {
  DIALOGUE_PORTRAIT_FRAME_ASSETS,
  DIALOGUE_TEXT_WINDOW_ASSET,
  PORTRAIT_CATALOG,
  portraitSourceFor,
} from "./content/portrait-catalog.generated";
import {
  STAGE49_ENDING_ASSETS,
  STAGE49_STORY_PAGES,
} from "./content/stage49-ending";
import type { GameController } from "./controller";
import { renderNativeDialogueText } from "./dialogue-text";
import {
  animatedPortraitMarkup,
  nativeMouthFrameAfterGlyph,
  nativeStoryGlyphMovesMouth,
  startPortraitAnimations,
} from "./portrait";
import { configureGameScaling } from "./scaling";
import type { DialoguePage } from "./types";

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const dialoguePortraitFrameStyle = [
  `--dialogue-portrait-frame-top:url('${DIALOGUE_PORTRAIT_FRAME_ASSETS.top}')`,
  `--dialogue-portrait-frame-nameplate:url('${DIALOGUE_PORTRAIT_FRAME_ASSETS.nameplate}')`,
  `--dialogue-portrait-frame-side:url('${DIALOGUE_PORTRAIT_FRAME_ASSETS.side}')`,
  `--dialogue-text-window:url('${DIALOGUE_TEXT_WINDOW_ASSET}')`,
].join(";");

function dialogueWindow(
  slot: "upper" | "lower",
  line: DialoguePage["upper"] | DialoguePage["lower"],
  active: boolean,
  opening: boolean,
): string {
  if (!line
    || line.portrait === undefined
    || line.speaker === undefined
    || line.text === undefined) return "";
  const displayName = (PORTRAIT_CATALOG[line.portrait].displayName ?? line.speaker).trim();
  return `<section class="stage49-dialogue-window dialogue-box ${slot} ${active ? "is-active" : ""} ${opening ? "is-opening" : ""}"
      data-stage49-dialogue-slot="${slot}">
    ${animatedPortraitMarkup(line.portrait, {
      alt: `${escapeHtml(line.speaker)}肖像`,
      channel: `stage49-story-${slot}`,
      className: "stage49-dialogue-portrait dialogue-portrait",
      wrapperTestId: `stage49-story-portrait-${slot}`,
    })}
    <b class="stage49-dialogue-portrait-name dialogue-portrait-name"
      aria-hidden="true">${escapeHtml(displayName)}</b>
    <div class="stage49-dialogue-copy dialogue-copy">
      <b class="dialogue-speaker">${escapeHtml(line.speaker)}</b>
      <p>${escapeHtml(line.text)}</p><span class="continue-mark">▼</span>
    </div>
  </section>`;
}

function storyMarkup(controller: GameController): string {
  const session = controller.stage49Ending;
  const page: DialoguePage | undefined = session?.storyPage;
  if (!page || !session) return "";
  const previousPage: DialoguePage | undefined = STAGE49_STORY_PAGES[session.index - 1];
  return `<div class="stage49-story dialogue-layer prebattle" data-testid="stage49-story"
      aria-label="戰後道別 ${session.index + 1}／17">
    <img class="stage49-story-background" src="${STAGE49_ENDING_ASSETS.storyBackground}" alt="">
    ${dialogueWindow("upper", page.upper, page.activeSlot === "upper", Boolean(page.upper && !previousPage?.upper))}
    ${dialogueWindow("lower", page.lower, page.activeSlot === "lower", Boolean(page.lower && !previousPage?.lower))}
  </div>`;
}

function rosterMarkup(controller: GameController): string {
  const session = controller.stage49Ending;
  const card = session?.rosterCard;
  if (!card || !session) return "";
  return `<div class="stage49-roster" data-testid="stage49-roster"
      aria-label="戰後記錄 ${session.index + 1}／22">
    <div class="stage49-roster-stripe" aria-hidden="true"></div>
    <img class="stage49-decoration" data-testid="stage49-roster-decoration"
      src="${STAGE49_ENDING_ASSETS.decoration(card.actor.decorationRecord)}" alt="">
    <img class="stage49-roster-portrait" data-testid="stage49-roster-portrait"
      src="${portraitSourceFor(card.actor.portraitRecord)}" alt="${escapeHtml(card.actor.name)}肖像">
    <img class="stage49-roster-class-illustration" data-testid="stage49-roster-class-illustration"
      src="${STAGE49_ENDING_ASSETS.classIllustration(card.nativeClassRecord)}"
      alt="${escapeHtml(card.className)}全景戰鬥圖形">
    <dl class="stage49-roster-fields">
      <div class="is-name"><dt>姓名：</dt><dd>${escapeHtml(card.actor.name)}</dd></div>
      <div class="is-class"><dt>兵種：</dt><dd>${escapeHtml(card.className)}</dd></div>
      <div class="is-level"><dt>等級：</dt><dd>${card.level}</dd></div>
      <div class="is-life"><dt>生命：</dt><dd>${card.maxLife}</dd></div>
      <div class="is-attack"><dt>攻擊：</dt><dd>${card.attack}</dd></div>
      <div class="is-defense"><dt>防禦：</dt><dd>${card.defense}</dd></div>
        <!-- Native label is 戰績：00000 人; keep the five-digit pad and unit. -->
      <div class="is-record"><dt>戰績：</dt><dd data-testid="stage49-record">${
          String(Math.min(card.record, 99_999)).padStart(5, "0")
        } 人</dd></div>
    </dl>
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
          data-testid="ending-advance" style="${dialoguePortraitFrameStyle}"
          aria-label="推進主線結局"></button>
      </div>
    </div>
    <p class="stage49-help">點擊畫面或按 Enter／Space 推進；戰績卡與尾聲亦會依原版上限自動推進。</p>
  </main>`;
  const viewport = root.querySelector<HTMLElement>("#stage49-viewport");
  const screen = root.querySelector<HTMLButtonElement>("#stage49-screen");
  if (!viewport || !screen) throw new Error("stage 49 ending surface not found");
  const destroyScaling = configureGameScaling(viewport, screen);
  const destroyPortraitAnimations = startPortraitAnimations(root, controller.isTestMode);
  let timer: number | undefined;
  let storyTimer: number | undefined;
  let storyText: HTMLElement | undefined;
  let storyPortrait: HTMLElement | undefined;
  let storyFullText = "";
  let storyRevealedCharacters = 0;

  const stopSpeaking = (portrait: HTMLElement | undefined) => {
    if (!portrait) return;
    portrait.dataset.speaking = "false";
    portrait.dataset.mouthFrame = "1";
  };
  const stopStoryTimer = () => {
    if (storyTimer !== undefined) window.clearTimeout(storyTimer);
    storyTimer = undefined;
  };
  const finishStoryTyping = (): boolean => {
    if (!storyText || storyRevealedCharacters >= storyFullText.length) return false;
    stopStoryTimer();
    storyRevealedCharacters = storyFullText.length;
    renderNativeDialogueText(storyText, storyFullText);
    stopSpeaking(storyPortrait);
    screen.dataset.storyTyping = "false";
    return true;
  };
  const startStoryTyping = () => {
    const session = controller.stage49Ending;
    const page: DialoguePage | undefined = session?.storyPage;
    if (!session || session.section !== "story" || !page) return;
    const slot = page.activeSlot;
    if (!slot) {
      screen.dataset.storyTyping = "false";
      return;
    }
    const line = page[slot];
    if (!line?.text) {
      screen.dataset.storyTyping = "false";
      return;
    }
    storyText = screen.querySelector<HTMLElement>(`[data-stage49-dialogue-slot="${slot}"] p`) ?? undefined;
    storyPortrait = screen.querySelector<HTMLElement>(`[data-testid="stage49-story-portrait-${slot}"]`) ?? undefined;
    if (!storyText) return;
    storyFullText = line.text;
    storyRevealedCharacters = Math.max(0, Math.min(storyFullText.length, page.revealStart ?? 0));
    renderNativeDialogueText(storyText, storyFullText.slice(0, storyRevealedCharacters));
    const speaking = storyRevealedCharacters < storyFullText.length;
    if (storyPortrait) storyPortrait.dataset.speaking = String(speaking);
    screen.dataset.storyTyping = String(speaking);
    const tick = () => {
      if (!storyText || storyRevealedCharacters >= storyFullText.length) {
        stopSpeaking(storyPortrait);
        screen.dataset.storyTyping = "false";
        storyTimer = undefined;
        return;
      }
      const character = storyFullText[storyRevealedCharacters];
      storyRevealedCharacters += 1;
      renderNativeDialogueText(storyText, storyFullText.slice(0, storyRevealedCharacters));
      if (storyPortrait && nativeStoryGlyphMovesMouth(character)) {
        storyPortrait.dataset.mouthFrame = nativeMouthFrameAfterGlyph(
          storyPortrait.dataset.mouthFrame,
          character,
        );
        storyPortrait.dataset.talkCount = String(Number(storyPortrait.dataset.talkCount ?? "0") + 1);
      }
      storyTimer = window.setTimeout(
        tick,
        controller.isTestMode ? 12 : controller.presentationFast ? 20 : 80,
      );
    };
    tick();
  };
  const render = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    stopStoryTimer();
    stopSpeaking(storyPortrait);
    storyText = undefined;
    storyPortrait = undefined;
    storyFullText = "";
    storyRevealedCharacters = 0;
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
    screen.dataset.storyTyping = "false";
    if (session.section === "story") {
      for (const text of screen.querySelectorAll<HTMLElement>(".stage49-dialogue-copy p")) {
        renderNativeDialogueText(text, text.textContent ?? "");
      }
      startStoryTyping();
    }
    const delay = session.autoAdvanceMilliseconds;
    if (delay !== undefined && session.section !== "stage38-boundary") {
      timer = window.setTimeout(
        () => controller.advanceStage49Ending(),
        controller.presentationFast ? Math.min(30, delay) : delay,
      );
    }
  };
  const advance = () => {
    if (finishStoryTyping()) return;
    controller.advanceStage49Ending();
  };
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
    stopStoryTimer();
    stopSpeaking(storyPortrait);
    unsubscribe();
    destroyPortraitAnimations();
    destroyScaling();
    window.removeEventListener("keydown", keydown);
  };
}
