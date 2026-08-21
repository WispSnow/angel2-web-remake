import {
  DIALOGUE_PORTRAIT_FRAME_ASSETS,
  DIALOGUE_TEXT_WINDOW_ASSET,
  PORTRAIT_CATALOG,
  portraitSourceFor,
} from "./content/portrait-catalog.generated";
import {
  STAGE49_ENDING_ASSETS,
  STAGE49_EPILOGUE_LAYOUT,
  STAGE49_STORY_PAGES,
} from "./content/stage49-ending";
import type { GameController } from "./controller";
import { drawEpilogueGlyphs, loadEpilogueFont } from "./epilogue-text";
import { prepareDomImageElements } from "./dom-image-readiness";
import { renderNativeDialogueText } from "./dialogue-text";
import {
  animatedPortraitMarkup,
  nativeMouthFrameAfterGlyph,
  nativeStoryGlyphMovesMouth,
  prepareAnimatedPortrait,
  startPortraitAnimations,
} from "./portrait";
import { configureGameScaling } from "./scaling";
import { decodeStagedRenderImages, stagedRenderAssetSource } from "./staged-render-asset-cache";
import type { DialoguePage } from "./types";

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const dialoguePortraitFrameStyle = () => [
  `--dialogue-portrait-frame-top:url('${stagedRenderAssetSource(DIALOGUE_PORTRAIT_FRAME_ASSETS.top)}')`,
  `--dialogue-portrait-frame-nameplate:url('${stagedRenderAssetSource(DIALOGUE_PORTRAIT_FRAME_ASSETS.nameplate)}')`,
  `--dialogue-portrait-frame-side:url('${stagedRenderAssetSource(DIALOGUE_PORTRAIT_FRAME_ASSETS.side)}')`,
  `--dialogue-text-window:url('${stagedRenderAssetSource(DIALOGUE_TEXT_WINDOW_ASSET)}')`,
  `--stage49-roster-background:url('${stagedRenderAssetSource(STAGE49_ENDING_ASSETS.rosterBackground)}')`,
].join(";");

const dialogueFrameAssetUrls = [
  ...Object.values(DIALOGUE_PORTRAIT_FRAME_ASSETS),
  DIALOGUE_TEXT_WINDOW_ASSET,
] as const;

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
    <img class="stage49-story-background" src="${stagedRenderAssetSource(STAGE49_ENDING_ASSETS.storyBackground)}" alt="">
    ${dialogueWindow("upper", page.upper, page.activeSlot === "upper", Boolean(page.upper && !previousPage?.upper))}
    ${dialogueWindow("lower", page.lower, page.activeSlot === "lower", Boolean(page.lower && !previousPage?.lower))}
  </div>`;
}

function rosterMarkup(controller: GameController): string {
  const session = controller.stage49Ending;
  const card = session?.rosterCard;
  if (!card || !session) return "";
  const decorationSource = STAGE49_ENDING_ASSETS.decoration(card.actor.decorationRecord);
  const portraitSource = portraitSourceFor(card.actor.portraitRecord);
  const classIllustrationSource = STAGE49_ENDING_ASSETS.classIllustration(card.nativeClassRecord);
  return `<div class="stage49-roster" data-testid="stage49-roster"
      aria-label="戰後記錄 ${session.index + 1}／22">
    <div class="stage49-roster-stripe" aria-hidden="true"></div>
    <img class="stage49-decoration" data-testid="stage49-roster-decoration"
      src="${stagedRenderAssetSource(decorationSource)}" data-source-url="${decorationSource}" alt="">
    <img class="stage49-roster-portrait" data-testid="stage49-roster-portrait"
      src="${stagedRenderAssetSource(portraitSource)}" data-source-url="${portraitSource}" alt="${escapeHtml(card.actor.name)}肖像">
    <img class="stage49-roster-class-illustration" data-testid="stage49-roster-class-illustration"
      src="${stagedRenderAssetSource(classIllustrationSource)}" data-source-url="${classIllustrationSource}"
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

/**
 * Native module 35 draws no text window at all: 0000:0529-05FC only blits the
 * two illustration halves, and 0000:069E then types the Big5 text straight onto
 * them with the UN/9+UN/10 bitmap font. The canvas reproduces that; the
 * paragraph stays for assistive technology and carries no visible style.
 */
function epilogueMarkup(controller: GameController): string {
  const session = controller.stage49Ending;
  const presentation = session?.epiloguePresentation;
  if (!presentation || !session) return "";
  const [left, right] = presentation.variant.illustrationRecords;
  const { screenWidth, screenHeight } = STAGE49_EPILOGUE_LAYOUT;
  return `<div class="stage49-epilogue" data-testid="stage49-epilogue"
      data-segment="${presentation.segment.id}" data-selector="${presentation.variant.selector}">
    <img class="stage49-epilogue-left" src="${stagedRenderAssetSource(STAGE49_ENDING_ASSETS.epilogue(left))}" alt="">
    <img class="stage49-epilogue-right" src="${stagedRenderAssetSource(STAGE49_ENDING_ASSETS.epilogue(right))}" alt="">
    <canvas class="stage49-epilogue-text" data-testid="stage49-epilogue-text"
      width="${screenWidth}" height="${screenHeight}" aria-hidden="true"></canvas>
    <p class="visually-hidden">${escapeHtml(presentation.variant.text)}</p>
    <span class="stage49-progress">尾聲 ${session.index + 1}／4</span>
  </div>`;
}

function boundaryMarkup(): string {
  return `<div class="stage49-boundary" data-testid="stage38-boundary">
    <span>MAIN ENDING COMPLETE</span>
    <h2>主線結局完成</h2>
    <p>墓碑上的異世界之門再次開啟。妮雅與夥伴即將迎戰最後的敵人。</p>
    <strong>隱藏關 · STAGE 38</strong>
    <span class="stage49-boundary-action" data-testid="start-stage38">進入異世界</span>
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
          data-testid="ending-advance" style="${dialoguePortraitFrameStyle()}"
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
  let epilogueTimer: number | undefined;
  let epilogueGeneration = 0;
  let finishEpilogueTyping: (() => boolean) | undefined;
  let renderGeneration = 0;
  let segmentReady = false;
  let segmentFailed = false;

  const stopEpilogueTyping = () => {
    if (epilogueTimer !== undefined) window.clearTimeout(epilogueTimer);
    epilogueTimer = undefined;
    finishEpilogueTyping = undefined;
    epilogueGeneration += 1;
  };

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
  const primeStoryTyping = (): (() => void) | undefined => {
    const session = controller.stage49Ending;
    const page: DialoguePage | undefined = session?.storyPage;
    if (!session || session.section !== "story" || !page) return undefined;
    const slot = page.activeSlot;
    if (!slot) {
      screen.dataset.storyTyping = "false";
      return undefined;
    }
    const line = page[slot];
    if (!line?.text) {
      screen.dataset.storyTyping = "false";
      return undefined;
    }
    storyText = screen.querySelector<HTMLElement>(`[data-stage49-dialogue-slot="${slot}"] p`) ?? undefined;
    storyPortrait = screen.querySelector<HTMLElement>(`[data-testid="stage49-story-portrait-${slot}"]`) ?? undefined;
    if (!storyText) return undefined;
    storyFullText = line.text;
    storyRevealedCharacters = Math.max(0, Math.min(storyFullText.length, page.revealStart ?? 0));
    renderNativeDialogueText(storyText, storyFullText.slice(0, storyRevealedCharacters));
    screen.dataset.storyTyping = "false";
    return () => {
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
  };
  /**
   * Reproduces module 35 0000:069E: the plates are already on screen and the
   * text types itself on, one full-width glyph every 24 native ticks, before the
   * segment's own hold begins. The hold counter at DS:0310 is zeroed back at
   * 0000:0529, so the typing time is spent inside the limit — the segment ends
   * at whichever of the two is longer, which the session already reports.
   *
   * [SR] 0000:0717/071E test the two action flags to decide whether to skip a
   * glyph's wait, but both `je` targets are the wait itself, so the shipped
   * build never skips. Nothing else clears the flags until typing returns, so
   * the author's intent is unambiguous: the first press finishes the remaining
   * text at once, and only a second press advances the segment.
   */
  const startEpilogueTyping = (startedAt: number) => {
    const session = controller.stage49Ending;
    const presentation = session?.epiloguePresentation;
    const canvas = screen.querySelector<HTMLCanvasElement>(".stage49-epilogue-text");
    if (!presentation || !canvas) return;
    const { variant, segment } = presentation;
    const glyphs = variant.glyphs;
    const total = glyphs.length / 3;
    const colors = { ink: variant.inkColor, shadow: variant.shadowColor };
    const generation = epilogueGeneration;
    const glyphDelay = controller.presentationFast
      ? 20
      : STAGE49_EPILOGUE_LAYOUT.glyphNativeTicks * 10;
    const scheduleHold = () => {
      screen.dataset.epilogueTyping = "false";
      const limit = Math.max(segment.waitNativeTicks, variant.typingNativeTicks) * 10;
      const remaining = Math.max(0, limit - (performance.now() - startedAt));
      timer = window.setTimeout(
        () => controller.advanceStage49Ending(),
        controller.presentationFast ? Math.min(30, remaining) : remaining,
      );
    };
    void loadEpilogueFont().then((font) => {
      if (generation !== epilogueGeneration) return;
      // 0000:0725 waits 24 native ticks *after* each full-width glyph, so the
      // first glyph is already on screen when the segment's counter starts.
      // Waiting one interval first would blank the opening 240 ms and push the
      // last glyph onto the hold limit itself, which costs `warriorStatue` -
      // the one typing-bound segment, wait 0 against 46 glyphs - its whole
      // trailing pause before the segment advances.
      let revealed = controller.isTestMode ? total : Math.min(1, total);
      drawEpilogueGlyphs(canvas, font, glyphs, revealed, colors);
      if (revealed >= total) {
        scheduleHold();
        return;
      }
      screen.dataset.epilogueTyping = "true";
      finishEpilogueTyping = () => {
        if (revealed >= total) return false;
        if (epilogueTimer !== undefined) window.clearTimeout(epilogueTimer);
        epilogueTimer = undefined;
        revealed = total;
        drawEpilogueGlyphs(canvas, font, glyphs, revealed, colors);
        finishEpilogueTyping = undefined;
        scheduleHold();
        return true;
      };
      // 0000:0725 waits on the module's own native tick counter, so a segment
      // costs exactly `glyphs x 24` ticks however long any single redraw takes.
      // Chaining fixed `setTimeout` delays drifted ~250 ms over `warriorStatue`
      // - each redraw repaints every revealed glyph seven times - which is more
      // than its whole 240 ms trailing pause, so glyphs are scheduled against
      // the segment's own start instead of against the previous glyph.
      const scheduleGlyph = () => {
        epilogueTimer = window.setTimeout(
          tick,
          Math.max(0, startedAt + revealed * glyphDelay - performance.now()),
        );
      };
      const tick = () => {
        if (generation !== epilogueGeneration) return;
        revealed += 1;
        drawEpilogueGlyphs(canvas, font, glyphs, revealed, colors);
        if (revealed >= total) {
          epilogueTimer = undefined;
          finishEpilogueTyping = undefined;
          scheduleHold();
          return;
        }
        scheduleGlyph();
      };
      scheduleGlyph();
    });
  };
  const render = () => {
    const generation = ++renderGeneration;
    if (timer !== undefined) window.clearTimeout(timer);
    stopStoryTimer();
    stopEpilogueTyping();
    stopSpeaking(storyPortrait);
    storyText = undefined;
    storyPortrait = undefined;
    storyFullText = "";
    storyRevealedCharacters = 0;
    const session = controller.stage49Ending;
    if (!session) return;
    screen.disabled = false;
    segmentReady = false;
    segmentFailed = false;
    screen.dataset.segmentReady = "false";
    delete screen.dataset.segmentError;
    screen.innerHTML = session.section === "story"
      ? storyMarkup(controller)
      : session.section === "roster"
        ? rosterMarkup(controller)
        : session.section === "epilogue"
          ? epilogueMarkup(controller)
          : boundaryMarkup();
    screen.dataset.storyTyping = "false";
    screen.dataset.epilogueTyping = "false";
    let beginStoryTyping: (() => void) | undefined;
    if (session.section === "story") {
      for (const text of screen.querySelectorAll<HTMLElement>(".stage49-dialogue-copy p")) {
        renderNativeDialogueText(text, text.textContent ?? "");
      }
      beginStoryTyping = primeStoryTyping();
    }
    const portraits = [...screen.querySelectorAll<HTMLElement>(".animated-portrait")];
    const ordinaryImages = [...screen.querySelectorAll<HTMLImageElement>("img")]
      .filter((image) => !image.closest(".animated-portrait"));
    const readiness = [
      prepareDomImageElements(ordinaryImages),
      ...portraits.map((portrait) => prepareAnimatedPortrait(portrait)),
    ];
    if (session.section === "story") readiness.push(decodeStagedRenderImages(dialogueFrameAssetUrls));
    if (session.section === "roster") {
      readiness.push(decodeStagedRenderImages([STAGE49_ENDING_ASSETS.rosterBackground]));
    }
    if (session.section === "epilogue") readiness.push(loadEpilogueFont().then(() => undefined));
    void Promise.all(readiness).then(() => {
      if (generation !== renderGeneration) return;
      segmentReady = true;
      screen.dataset.segmentReady = "true";
      beginStoryTyping?.();
      // The epilogue owns its own advance timer: the hold only starts once the
      // images and font are ready, and typing may be cut short by a key press.
      if (session.section === "epilogue") {
        startEpilogueTyping(performance.now());
        return;
      }
      const delay = session.autoAdvanceMilliseconds;
      if (delay !== undefined && session.section !== "stage38-boundary") {
        timer = window.setTimeout(
          () => controller.advanceStage49Ending(),
          controller.presentationFast ? Math.min(30, delay) : delay,
        );
      }
    }).catch((error: unknown) => {
      if (generation !== renderGeneration) return;
      segmentFailed = true;
      screen.dataset.segmentReady = "error";
      screen.dataset.segmentError = error instanceof Error ? error.message : String(error);
      screen.insertAdjacentHTML(
        "beforeend",
        '<span class="stage49-asset-error" role="alert">圖像載入失敗，點擊畫面重試。</span>',
      );
    });
  };
  const advance = () => {
    if (segmentFailed) {
      render();
      return;
    }
    if (!segmentReady) return;
    if (finishStoryTyping()) return;
    if (finishEpilogueTyping?.()) return;
    if (controller.stage49Ending?.section === "stage38-boundary") {
      // Drop the ending route's many decoded blob references before the next
      // stage swaps the active lease and starts its own portrait decode gate.
      // The resource retry overlay remains authoritative if that gate fails.
      renderGeneration += 1;
      screen.replaceChildren();
      for (const property of [
        "--dialogue-portrait-frame-top",
        "--dialogue-portrait-frame-nameplate",
        "--dialogue-portrait-frame-side",
        "--dialogue-text-window",
        "--stage49-roster-background",
      ]) screen.style.removeProperty(property);
    }
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
    stopEpilogueTyping();
    stopSpeaking(storyPortrait);
    unsubscribe();
    destroyPortraitAnimations();
    destroyScaling();
    window.removeEventListener("keydown", keydown);
  };
}
