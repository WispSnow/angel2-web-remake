import {
  DIFFICULTY_OPTIONS,
  difficultyHintFor,
  STARTUP_ASSETS,
} from "./content/startup";
import {
  STARTUP_INTRO,
  STARTUP_MENU_LABELS,
  STARTUP_PRETITLE,
  STARTUP_SCREEN,
  STARTUP_TEXT,
  STARTUP_TITLE,
} from "./content/startup.generated";
import {
  clipStartupGlyphRow,
  drawDissolvedImage,
  drawFadedImage,
  drawStartupGlyphs,
  loadStartupFont,
  loadStartupImage,
} from "./startup-screen";
import { classStatsFor } from "./content/stage0";
import { className } from "./content/classes";
import { configureGameScaling } from "./scaling";
import {
  mountSaveBackupUi,
  SAVE_BACKUP_CONFIRM_MARKUP,
  SAVE_BACKUP_TOOLS_MARKUP,
  type SaveBackupUi,
} from "./save-backup-ui";
import {
  moveSaveSlotIndex,
  moveSaveSlotPage,
  readSaveSlot,
  SAVE_SLOT_COUNT,
  SAVE_SLOT_PAGE_COUNT,
  SAVE_SLOTS_PER_PAGE,
  saveSlotPageIndex,
  saveSlotPageStart,
  type SaveSlotReadResult,
} from "./save";
import type { Difficulty, SaveData } from "./types";

/**
 * 規則集在存檔裡是代號（`stableRemake`），而發行版只有遊戲本體、不附任何決定記錄或設計
 * 文件，所以記錄面板顯示玩家看得懂的名稱而不是代號本身。標籤讀存檔自己的欄位，未來真的
 * 出現第二套規則集時只要在這裡補一行。
 */
const RULESET_LABELS: Record<SaveData["ruleset"], string> = {
  stableRemake: "標準規則",
};

type StartupPhase = "pretitle" | "intro" | "title" | "difficulty" | "records";

export interface NewGameSelection {
  kind: "new";
  difficulty: Difficulty;
  userActivated: boolean;
}

export interface ContinueGameSelection {
  kind: "continue";
  save: SaveData;
  slot: number;
  userActivated: boolean;
}

export type StartupSelection = NewGameSelection | ContinueGameSelection;

const TITLE_OPTIONS = ["遊戲開始", "繼續遊戲"] as const;
const NATIVE_TICK_MS = 10;
/** The DAC writes at 0000:31E0 are paced by vertical retrace, not the timer. */
const DAC_STEP_MS = 1000 / 70;
/**
 * A background swap spends 128 main loops fading the old plate down, loading the
 * next one and fading it back up, and the rows keep scrolling throughout. Three
 * loops make one scroll update, so the swap straddles the update that read the
 * control entry by half of 128/3 updates on each side.
 */
const INTRO_TRANSITION_HALF_UPDATES = Math.round(STARTUP_INTRO.transitionLoops / 3 / 2);
const INTRO_UPDATE_MS = STARTUP_INTRO.ticksPerScrollUpdate * NATIVE_TICK_MS;
/**
 * 0000:11DA clears the 400x70 text band, draws the three rows and then fills
 * DS:07C0 and DS:07CA — two colour-0 bars — over everything above 273 and below
 * 316. The bars are what reveals and hides a line one scanline per scroll
 * update, so the rows are drawn clipped to what they leave open. Only the Y
 * bounds are enforced here: every native row starts at x=160 and is at most 400
 * pixels wide, so the bars never trim a row horizontally.
 *
 * [DD REMAKE-113] That native band is not centred in the black below the plate:
 * BK/41..48 end at row 256, leaving a 16-pixel gutter above the window and 33
 * rows below it. The whole band — rows and masks together — is pushed down by
 * `INTRO_BAND_OFFSET` so the two gutters read as 24 and 25 instead. Nothing else
 * changes: the rows still enter and leave one scanline per scroll update.
 */
export const INTRO_BAND_OFFSET = 8;
export const INTRO_BAND = {
  top: STARTUP_INTRO.visibleWindow.y + INTRO_BAND_OFFSET,
  bottom: STARTUP_INTRO.visibleWindow.y + STARTUP_INTRO.visibleWindow.height + INTRO_BAND_OFFSET,
} as const;

const required = <T extends HTMLElement>(root: ParentNode, selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`missing startup element ${selector}`);
  return element;
};

export function mountStartup(
  root: HTMLElement,
  startGame: (selection: StartupSelection) => void,
): () => void {
  const testMode = new URLSearchParams(location.search).has("test");
  const introDuration = testMode
    ? 8_000
    : STARTUP_INTRO.scrollUpdates * INTRO_UPDATE_MS;
  const dacStepMs = testMode ? 1 : DAC_STEP_MS;
  const pretitleHoldMs = testMode ? 120 : STARTUP_PRETITLE.holdNativeTicks * NATIVE_TICK_MS;
  const dissolveStepMs = testMode ? 4 : STARTUP_TITLE.upperReveal.ticksPerStep * NATIVE_TICK_MS;
  const backgroundFadeMs = STARTUP_TITLE.backgroundFadeSteps * dacStepMs;
  const preMusicHoldMs = testMode
    ? 20
    : STARTUP_TITLE.preMusicHoldNativeTicks * NATIVE_TICK_MS;
  let phase: StartupPhase = "pretitle";
  let titleIndex = 0;
  let difficultyIndex = 0;
  /** Set while the difficulty highlight is being moved by the keyboard. */
  let difficultyHintByKeyboard = false;
  let recordIndex = 0;
  let recordSlots: SaveSlotReadResult[] = [];
  let saveBackupUi: SaveBackupUi;
  let animationFrame = 0;
  let phaseStartedAt = performance.now();
  let titleAssembled = false;
  /** 0000:0480 flips this on every idle replay, alternating BK/52+53 and 54+55. */
  let titleVariant = 0;
  let idleSince = 0;
  let font: HTMLImageElement | undefined;
  let musicStarted = false;
  /**
   * MUSIC/1 starts inside the title assembly, which can finish before the page
   * has ever seen a gesture, so a blocked autoplay has to be retried on the next
   * input. This flag keeps that retry from resurrecting a track the native flow
   * deliberately stopped.
   */
  let titleMusicStopped = false;
  let disposed = false;
  const loadedImages = new Map<string, HTMLImageElement>();

  root.innerHTML = `
    <div class="page-shell startup-shell">
      <div class="game-stage">
        <div class="game-viewport" id="startup-viewport">
          <section class="logical-screen startup-screen" id="startup-screen" data-testid="startup-screen"
            data-startup-phase="pretitle" aria-label="天使帝國 II 啟動畫面">
            <canvas class="startup-canvas" id="startup-canvas" data-testid="startup-canvas"
              width="${STARTUP_SCREEN.width}" height="${STARTUP_SCREEN.height}" aria-hidden="true"></canvas>
            <section class="startup-intro" data-testid="opening-intro" aria-label="開場劇情動畫">
              <div class="startup-intro-lines visually-hidden" aria-live="off">
                <p data-intro-slot="0"></p>
                <p data-intro-slot="1"></p>
                <p data-intro-slot="2"></p>
              </div>
              <span class="visually-hidden">按任意鍵跳過開場動畫</span>
            </section>
            <section class="startup-title" data-testid="title-screen" aria-label="標題畫面" hidden>
              <img class="startup-menu-frame startup-title-menu-frame" data-testid="startup-title-menu-frame"
                style="left:${STARTUP_MENU_LABELS.title.frame.x}px;top:${STARTUP_MENU_LABELS.title.frame.y}px"
                src="${STARTUP_MENU_LABELS.title.frame.src}" alt="" hidden />
              <img class="startup-menu-frame startup-difficulty-menu-frame"
                data-testid="startup-difficulty-menu-frame"
                style="left:${STARTUP_MENU_LABELS.difficulty.frame.x}px;top:${STARTUP_MENU_LABELS.difficulty.frame.y}px"
                src="${STARTUP_MENU_LABELS.difficulty.frame.src}" alt="" hidden />
              <div class="startup-menu title-menu" data-testid="title-menu" role="menu" aria-label="標題選單" hidden>
                ${TITLE_OPTIONS.map((label, index) => `
                  <button type="button" role="menuitem" data-startup-action="title" data-menu-index="${index}"
                    data-testid="${index === 0 ? "new-game" : "continue-game"}">${label}</button>
                `).join("")}
              </div>
              <div class="startup-menu difficulty-menu" data-testid="difficulty-menu" role="menu"
                aria-label="難度選擇" hidden>
                ${DIFFICULTY_OPTIONS.map((option, index) => {
                  const hint = difficultyHintFor(option.value);
                  // `aria-label` keeps the option's name to the native label so
                  // the hint below reads only as its description.
                  return `
                  <button type="button" role="menuitem" data-startup-action="difficulty" data-menu-index="${index}"
                    data-difficulty="${option.value}" data-testid="difficulty-${option.value}"
                    aria-label="${option.label}" aria-describedby="difficulty-hint-${option.value}"
                    >${option.label}<span class="difficulty-hint" role="tooltip"
                      id="difficulty-hint-${option.value}" data-testid="difficulty-hint-${option.value}"
                      data-difficulty-source="${hint.growth === "legacy" ? "native" : "remake"}"
                      ><b>${hint.label}</b><i>${hint.sourceLabel}</i><em>${hint.detail}</em></span></button>
                `;
                }).join("")}
              </div>
              <section class="startup-record-selector" data-testid="title-record-menu"
                aria-label="讀取遊戲進度" hidden>
                <div class="startup-record-content">
                  <h2>讀取遊戲進度</h2>
                  <div class="startup-record-header" aria-hidden="true">
                    <span>槽</span><span>職業</span><span>等級</span><span>經驗值</span><span>儲存次數</span><span>難度</span>
                  </div>
                  <div class="startup-record-slots" role="menu"
                    aria-label="二十個手動遊戲進度槽，每頁五個"></div>
                  <div class="startup-record-pagination" aria-label="記錄槽分頁">
                    <button type="button" data-startup-action="record-page" data-page-delta="-1"
                      data-testid="title-record-previous-page" aria-label="上一頁">◀</button>
                    <span data-testid="title-record-page"></span>
                    <button type="button" data-startup-action="record-page" data-page-delta="1"
                      data-testid="title-record-next-page" aria-label="下一頁">▶</button>
                  </div>
                  <p class="startup-record-detail" data-testid="title-record-detail" aria-live="polite"></p>
                  ${SAVE_BACKUP_TOOLS_MARKUP}
                  <p class="startup-record-help">↑↓ 選擇　←→ 翻頁　確認讀取　Esc 返回</p>
                </div>
                ${SAVE_BACKUP_CONFIRM_MARKUP}
              </section>
              <p class="startup-menu-status" data-testid="title-status" aria-live="polite"></p>
            </section>
          </section>
        </div>
      </div>
    </div>`;

  const screen = required(root, "#startup-screen");
  const viewport = required(root, "#startup-viewport");
  const canvas = required<HTMLCanvasElement>(root, "#startup-canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("startup screen needs a 2D context");
  context.imageSmoothingEnabled = false;
  const intro = required(root, ".startup-intro");
  const introLines = [0, 1, 2].map((slot) =>
    required<HTMLParagraphElement>(root, `[data-intro-slot="${slot}"]`));
  const title = required(root, ".startup-title");
  const titleMenuFrame = required<HTMLImageElement>(root, ".startup-title-menu-frame");
  const difficultyMenuFrame = required<HTMLImageElement>(root, ".startup-difficulty-menu-frame");
  const titleMenu = required(root, ".title-menu");
  const difficultyMenu = required(root, ".difficulty-menu");
  const recordSelector = required(root, ".startup-record-selector");
  const recordSlotList = required(root, ".startup-record-slots");
  const recordPage = required(root, "[data-testid=title-record-page]");
  const recordDetail = required<HTMLParagraphElement>(root, ".startup-record-detail");
  const titleStatus = required<HTMLParagraphElement>(root, ".startup-menu-status");
  const stopScaling = configureGameScaling(viewport, screen);
  const introAudio = new Audio(STARTUP_ASSETS.audio.intro);
  const titleAudio = new Audio(STARTUP_ASSETS.audio.title);
  introAudio.volume = 0.32;
  introAudio.preload = "auto";
  titleAudio.volume = 0.32;
  titleAudio.preload = "auto";
  /**
   * [OF] `REMAKE-114` withdrew the loop `REMAKE-112` had inferred: MUSIC/1 plays
   * once through its 13.37 s decode and the title screen then stays silent until
   * the idle replay swaps in MUSIC/14. The three explicit stops the evidence
   * records — idle replay, difficulty confirm, difficulty cancel — only ever cut
   * that single play short.
   */
  titleAudio.loop = false;

  const play = (audio: HTMLAudioElement) => {
    void audio.play().catch(() => undefined);
  };
  const stopAudio = (audio: HTMLAudioElement) => {
    audio.pause();
    audio.currentTime = 0;
  };
  /**
   * Mirrors `audio.ts#updateMusicDebugState`: MUSIC/1 lives in a detached `Audio`
   * element, so its transport is otherwise unobservable from a test. The count
   * separates "still the same playback" from "restarted from the top".
   */
  let titleMusicPlays = 0;
  const updateTitleMusicDebugState = () => {
    if (!testMode) return;
    screen.dataset.titleMusicPlaying = String(!titleAudio.paused);
    screen.dataset.titleMusicPlayCount = String(titleMusicPlays);
    screen.dataset.titleMusicLoop = String(titleAudio.loop);
  };
  const startTitleMusic = () => {
    titleMusicStopped = false;
    titleMusicPlays += 1;
    play(titleAudio);
    updateTitleMusicDebugState();
  };
  const stopTitleMusic = () => {
    titleMusicStopped = true;
    stopAudio(titleAudio);
    updateTitleMusicDebugState();
  };
  /** Only retries a MUSIC/1 start the browser refused, never a native stop. */
  const resumeBlockedTitleMusic = () => {
    if (!musicStarted || titleMusicStopped || !titleAudio.paused) return;
    play(titleAudio);
    updateTitleMusicDebugState();
  };
  /**
   * A blocked autoplay is the only thing worth retrying. Once the single native
   * play has run out there is nothing to resume, so the natural end has to close
   * the retry window as firmly as an explicit stop — otherwise the next click
   * would start MUSIC/1 over and rebuild the loop `REMAKE-114` removed.
   */
  titleAudio.addEventListener("ended", () => {
    titleMusicStopped = true;
    updateTitleMusicDebugState();
  });

  const recordDescription = (result: SaveSlotReadResult, slot: number): string => {
    if (result.kind === "empty") return `記錄 ${slot}：此處沒有記錄。`;
    if (result.kind === "invalid") return `記錄 ${slot}：資料損壞或版本不相容，無法讀取。`;
    const { save } = result;
    const progress = save.kind === "battle" ? `第 ${save.battle.round} 回合` : "戰役完成";
    const savedAt = `${save.savedAt.slice(0, 16).replace("T", " ")} UTC`;
    return `記錄 ${slot}：${save.stageLabel}・${progress}・${RULESET_LABELS[save.ruleset]}・${savedAt}`;
  };

  const recordCells = (result: SaveSlotReadResult): readonly string[] => {
    if (result.kind === "empty") return ["XX", "XX", "XX", "XX", "XX"];
    if (result.kind === "invalid") return ["損壞", "—", "—", "—", "—"];
    const representative = result.save.roster[0];
    return [
      representative ? className(representative.classId) : "—",
      representative ? String(classStatsFor(representative).level) : "—",
      representative ? String(representative.experience) : "—",
      String(result.save.saveCount),
      DIFFICULTY_OPTIONS[result.save.difficulty].label,
    ];
  };

  const escapeAttribute = (value: string): string => value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const renderRecordSlots = () => {
    const start = saveSlotPageStart(recordIndex);
    const visibleSlots = recordSlots.slice(start, start + SAVE_SLOTS_PER_PAGE);
    recordSlotList.innerHTML = visibleSlots.map((result, localIndex) => {
      const index = start + localIndex;
      const slot = index + 1;
      const cells = recordCells(result);
      return `
        <button type="button" role="menuitem" class="startup-record-slot"
          data-startup-action="record" data-menu-index="${index}" data-slot-state="${result.kind}"
          data-testid="title-record-slot-${slot}" aria-label="${escapeAttribute(recordDescription(result, slot))}">
          <span>${slot}</span>${cells.map((cell) => `<span>${cell}</span>`).join("")}
        </button>`;
    }).join("");
    const page = saveSlotPageIndex(recordIndex);
    recordPage.textContent = `第 ${page + 1}／${SAVE_SLOT_PAGE_COUNT} 頁`;
    recordSlotList.setAttribute("aria-label", `手動遊戲進度槽，第 ${page + 1} 頁，共 ${SAVE_SLOT_PAGE_COUNT} 頁`);
  };

  const setRecordIndex = (nextIndex: number) => {
    const pageChanged = saveSlotPageIndex(nextIndex) !== saveSlotPageIndex(recordIndex);
    recordIndex = nextIndex;
    if (pageChanged) renderRecordSlots();
    updateMenuSelection();
  };

  const refreshRecordSlots = () => {
    recordSlots = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) =>
      readSaveSlot(localStorage, index + 1));
  };

  const updateMenuSelection = () => {
    for (const button of titleMenu.querySelectorAll<HTMLButtonElement>("button")) {
      const selected = Number(button.dataset.menuIndex) === titleIndex;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-current", String(selected));
    }
    for (const button of difficultyMenu.querySelectorAll<HTMLButtonElement>("button")) {
      const selected = Number(button.dataset.menuIndex) === difficultyIndex;
      button.classList.toggle("is-selected", selected);
      // Hovering already moves the highlight, so the pointer gets its hint from
      // `:hover`; arrow keys never move DOM focus and need this class instead.
      button.classList.toggle("is-hinted", selected && difficultyHintByKeyboard);
      button.setAttribute("aria-current", String(selected));
    }
    for (const button of recordSlotList.querySelectorAll<HTMLButtonElement>("button")) {
      const selected = Number(button.dataset.menuIndex) === recordIndex;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-current", String(selected));
    }
    screen.dataset.titleIndex = String(titleIndex);
    screen.dataset.difficultyIndex = String(difficultyIndex);
    screen.dataset.recordIndex = String(recordIndex);
    if (phase === "records" && recordSlots[recordIndex]) {
      recordDetail.textContent = recordDescription(recordSlots[recordIndex], recordIndex + 1);
    }
    if (titleAssembled) paintTitleStatic();
  };

  saveBackupUi = mountSaveBackupUi(recordSelector, {
    storage: localStorage,
    onRecordsRestored: () => {
      refreshRecordSlots();
      renderRecordSlots();
      updateMenuSelection();
    },
    onStatus: (message) => { recordDetail.textContent = message; },
  });

  const showTitleMenu = () => {
    phase = "title";
    titleAssembled = true;
    idleSince = performance.now();
    screen.dataset.startupPhase = phase;
    titleMenuFrame.hidden = false;
    difficultyMenuFrame.hidden = true;
    titleMenu.hidden = false;
    difficultyMenu.hidden = true;
    recordSelector.hidden = true;
    titleStatus.textContent = "";
    updateMenuSelection();
  };

  const enterIntro = () => {
    if (phase !== "pretitle") return;
    phase = "intro";
    phaseStartedAt = performance.now();
    screen.dataset.startupPhase = "intro";
    play(introAudio);
  };

  const enterTitle = () => {
    if (phase !== "intro" && phase !== "pretitle") return;
    stopAudio(introAudio);
    phase = "title";
    titleAssembled = false;
    musicStarted = false;
    phaseStartedAt = performance.now();
    screen.dataset.startupPhase = "title-assemble";
    intro.hidden = true;
    title.hidden = false;
    // 0000:19F2 draws the BK/40 surround together with the labels, so nothing of
    // the menu may show while the art is still dissolving in.
    titleMenuFrame.hidden = true;
    difficultyMenuFrame.hidden = true;
    titleMenu.hidden = true;
  };

  /**
   * 0000:0480 replays the whole scrolling intro after 201 unchanged menu cycles:
   * the art variant flips, MUSIC/1 stops, the palette fades out and the pretitle
   * logo is skipped. Pointer movement resets the counter.
   */
  const replayIntro = () => {
    if (phase !== "title" || !titleAssembled) return;
    stopTitleMusic();
    titleVariant = titleVariant === 0 ? 1 : 0;
    phase = "intro";
    titleAssembled = false;
    phaseStartedAt = performance.now();
    screen.dataset.startupPhase = "intro";
    screen.dataset.titleVariant = String(titleVariant);
    title.hidden = true;
    titleMenuFrame.hidden = true;
    titleMenu.hidden = true;
    intro.hidden = false;
    play(introAudio);
  };

  /**
   * 0000:0611: fade BK/51 up, dissolve the upper art in over eight nested
   * patterns, hold, start MUSIC/1, then dissolve the lower logo in over sixteen.
   * The dissolve accumulates, so each step is drawn once and left in place.
   */
  const paintTitleAssembly = (elapsed: number) => {
    const variant = STARTUP_TITLE.variants[titleVariant];
    const background = loadedImages.get(STARTUP_TITLE.background);
    const upper = loadedImages.get(variant.upper);
    const lower = loadedImages.get(variant.lower);
    if (!background || !upper || !lower) return;
    const upperMs = STARTUP_TITLE.upperReveal.dissolveSteps.length * dissolveStepMs;
    const lowerStart = backgroundFadeMs + upperMs + preMusicHoldMs;
    clearScreen();
    drawFadedImage(
      context,
      background,
      0,
      0,
      Math.min(
        STARTUP_TITLE.backgroundFadeSteps - 1,
        Math.floor(elapsed / backgroundFadeMs * STARTUP_TITLE.backgroundFadeSteps),
      ),
      STARTUP_TITLE.backgroundFadeSteps,
    );
    const upperSteps = Math.floor((elapsed - backgroundFadeMs) / dissolveStepMs);
    for (const [index, step] of STARTUP_TITLE.upperReveal.dissolveSteps.entries()) {
      if (index > upperSteps) break;
      drawDissolvedImage(context, upper, STARTUP_TITLE.upperReveal.x, STARTUP_TITLE.upperReveal.y, step);
    }
    if (elapsed >= lowerStart && !musicStarted) {
      musicStarted = true;
      startTitleMusic();
    }
    const lowerSteps = Math.floor((elapsed - lowerStart) / dissolveStepMs);
    for (const [index, step] of STARTUP_TITLE.lowerReveal.dissolveSteps.entries()) {
      if (index > lowerSteps) break;
      drawDissolvedImage(context, lower, STARTUP_TITLE.lowerReveal.x, STARTUP_TITLE.lowerReveal.y, step);
    }
    if (lowerSteps >= STARTUP_TITLE.lowerReveal.dissolveSteps.length && !titleAssembled) {
      showTitleMenu();
    }
  };

  /**
   * DS:0BDE is a 96x20 bitmap whose rows alternate AAh and 55h drawn in colour
   * 7, so the selected row is a 50% stipple rather than a solid bar.
   */
  const drawMenuHighlight = (labelY: number) => {
    const { x, yOffset, width, height, color } = STARTUP_MENU_LABELS.highlight;
    context.fillStyle = color;
    const top = labelY + yOffset;
    for (let row = 0; row < height; row += 1) {
      for (let column = (row & 1); column < width; column += 2) {
        context.fillRect(x + column, top + row, 1, 1);
      }
    }
  };

  /** The menu labels are glyph strings too, so they live on the canvas. */
  const paintMenuLabels = () => {
    if (!font) return;
    if (phase !== "title" && phase !== "difficulty") return;
    const group = phase === "difficulty" ? STARTUP_MENU_LABELS.difficulty : STARTUP_MENU_LABELS.title;
    const selected = phase === "difficulty" ? difficultyIndex : titleIndex;
    for (const [index, label] of group.labels.entries()) {
      const y = group.firstTextY + index * STARTUP_MENU_LABELS.rowPitch;
      if (index === selected) drawMenuHighlight(y);
      drawStartupGlyphs(context, font, label.glyphs, y);
    }
  };

  /**
   * Repaints the finished title plus its menu labels. The labels are glyph
   * strings drawn from the same A/23+A/24 font, so they belong on the canvas
   * next to the art rather than in a host font over it.
   */
  const paintTitleStatic = () => {
    const variant = STARTUP_TITLE.variants[titleVariant];
    const background = loadedImages.get(STARTUP_TITLE.background);
    const upper = loadedImages.get(variant.upper);
    const lower = loadedImages.get(variant.lower);
    if (!background || !upper || !lower) return;
    clearScreen();
    context.drawImage(background, 0, 0);
    context.drawImage(upper, STARTUP_TITLE.upperReveal.x, STARTUP_TITLE.upperReveal.y);
    context.drawImage(lower, STARTUP_TITLE.lowerReveal.x, STARTUP_TITLE.lowerReveal.y);
    paintMenuLabels();
  };

  const showDifficultyMenu = () => {
    phase = "difficulty";
    idleSince = performance.now();
    difficultyIndex = 0;
    difficultyHintByKeyboard = false;
    screen.dataset.startupPhase = phase;
    titleMenuFrame.hidden = true;
    difficultyMenuFrame.hidden = false;
    titleMenu.hidden = true;
    difficultyMenu.hidden = false;
    recordSelector.hidden = true;
    titleStatus.textContent = "";
    updateMenuSelection();
  };

  const showRecordMenu = () => {
    phase = "records";
    recordIndex = 0;
    refreshRecordSlots();
    screen.dataset.startupPhase = phase;
    titleMenuFrame.hidden = true;
    difficultyMenuFrame.hidden = true;
    titleMenu.hidden = true;
    difficultyMenu.hidden = true;
    recordSelector.hidden = false;
    titleStatus.textContent = "";
    renderRecordSlots();
    updateMenuSelection();
  };

  const finishStartup = () => {
    const difficulty = DIFFICULTY_OPTIONS[difficultyIndex].value;
    cleanup();
    startGame({ kind: "new", difficulty, userActivated: true });
  };

  const activateTitleOption = () => {
    if (titleIndex === 0) {
      showDifficultyMenu();
      return;
    }
    showRecordMenu();
  };

  const activateRecordOption = () => {
    const result = recordSlots[recordIndex];
    if (!result || result.kind !== "valid") {
      recordDetail.textContent = recordDescription(result ?? { kind: "empty" }, recordIndex + 1);
      return;
    }
    const slot = recordIndex + 1;
    cleanup();
    startGame({ kind: "continue", save: result.save, slot, userActivated: true });
  };

  /**
   * The native flow has one cancel flag, not one per surface: `0000:0D2F` and the
   * scrolling intro both end on either the confirm or the cancel flag, `0000:059F`
   * returns from the difficulty menu, and `0000:1455` returns ASCII `X` from the
   * slot list. `Escape` and the host right button are two mappings of that flag,
   * so both run this and nothing else.
   */
  const cancelInput = () => {
    if (saveBackupUi.cancel()) return;
    if (phase === "pretitle") {
      skipPretitleHold();
      return;
    }
    if (phase === "intro") {
      enterTitle();
      return;
    }
    if (screen.dataset.startupPhase === "title-assemble") return;
    if (phase === "difficulty") {
      // [DD REMAKE-115] The native `menus/difficulty/audioRule` issues the RIX
      // stop on cancel as well as on confirm, which cuts MUSIC/1 off mid-bar for
      // a move that never leaves the title. `REMAKE-114` dropped the loop but
      // kept that stop; this one keeps the single play running through a cancel,
      // so only leaving the startup flow — or the idle replay — ends it.
      showTitleMenu();
      return;
    }
    if (phase === "records") showTitleMenu();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (disposed || event.repeat) return;
    idleSince = performance.now();
    if (phase === "pretitle") {
      // 0000:0D2F ends the hold early, but 0000:0D1C still runs the fade-out.
      event.preventDefault();
      skipPretitleHold();
      return;
    }
    if (phase === "intro") {
      event.preventDefault();
      enterTitle();
      return;
    }
    resumeBlockedTitleMusic();
    if (screen.dataset.startupPhase === "title-assemble") return;
    if (saveBackupUi.handleKeyDown(event)) return;
    if (phase === "title") {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        titleIndex = titleIndex === 0 ? 1 : 0;
        titleStatus.textContent = "";
        updateMenuSelection();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateTitleOption();
      }
      return;
    }
    if (phase === "records") {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelInput();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const delta = event.key === "ArrowUp" ? -1 : 1;
        setRecordIndex(moveSaveSlotIndex(recordIndex, delta));
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? -1 : 1;
        setRecordIndex(moveSaveSlotPage(recordIndex, delta));
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateRecordOption();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInput();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? -1 : 1;
      difficultyIndex = (difficultyIndex + delta + DIFFICULTY_OPTIONS.length) % DIFFICULTY_OPTIONS.length;
      difficultyHintByKeyboard = true;
      updateMenuSelection();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      finishStartup();
    }
  };

  const onPointerOver = (event: PointerEvent) => {
    // 0000:0480 resets the 201-cycle idle counter whenever the pointer moves.
    idleSince = performance.now();
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-startup-action]");
    if (!button) return;
    if (saveBackupUi.handlePointerOver(button)) return;
    const action = button.dataset.startupAction;
    if (action === "record-page") return;
    const index = Number(button.dataset.menuIndex);
    if (action === "title") titleIndex = index;
    else if (action === "difficulty") {
      difficultyIndex = index;
      difficultyHintByKeyboard = false;
    }
    else {
      setRecordIndex(index);
      return;
    }
    titleStatus.textContent = "";
    updateMenuSelection();
  };

  const onClick = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-startup-action]");
    if (!button) return;
    resumeBlockedTitleMusic();
    if (saveBackupUi.handleClick(button)) return;
    const action = button.dataset.startupAction;
    if (action === "record-page") {
      setRecordIndex(moveSaveSlotPage(recordIndex, Number(button.dataset.pageDelta)));
      return;
    }
    const index = Number(button.dataset.menuIndex);
    if (action === "title") {
      titleIndex = index;
      updateMenuSelection();
      activateTitleOption();
    } else if (action === "difficulty") {
      difficultyIndex = index;
      updateMenuSelection();
      finishStartup();
    } else {
      setRecordIndex(index);
      activateRecordOption();
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    idleSince = performance.now();
    // `contextmenu` is the single home for the right button, so the skip below
    // stays a left/primary-press path and one physical right press keeps meaning
    // exactly one cancel wherever the phase lands by the time it fires.
    if (event.button === 2) return;
    if (phase === "pretitle") {
      event.preventDefault();
      skipPretitleHold();
      return;
    }
    if (phase !== "intro") return;
    event.preventDefault();
    enterTitle();
  };

  const onContextMenu = (event: MouseEvent) => {
    if (disposed || !(event.target as Element).closest("#startup-screen")) return;
    event.preventDefault();
    idleSince = performance.now();
    resumeBlockedTitleMusic();
    cancelInput();
  };

  /**
   * Native intro backgrounds never overlap: 0000:1382 fades the live plate down
   * to black, loads the next record, then fades it back up, all inside one
   * 128-loop window. Returns the plate to paint and how far its own fade has
   * progressed, so the screen is black at the midpoint instead of showing two
   * pictures at once.
   */
  const introBackgroundAt = (scrollUpdate: number) => {
    let index = 0;
    for (const change of STARTUP_INTRO.backgroundChanges) {
      if (scrollUpdate >= change.update) index = change.index;
    }
    const change = STARTUP_INTRO.backgroundChanges.find((entry) => entry.index === index);
    const next = STARTUP_INTRO.backgroundChanges.find((entry) => entry.index === index + 1);
    let level = 1;
    if (next && scrollUpdate >= next.update - INTRO_TRANSITION_HALF_UPDATES) {
      level = Math.max(0, (next.update - scrollUpdate) / INTRO_TRANSITION_HALF_UPDATES);
    } else if (change && scrollUpdate < change.update + INTRO_TRANSITION_HALF_UPDATES) {
      level = Math.max(0, (scrollUpdate - change.update) / INTRO_TRANSITION_HALF_UPDATES);
    }
    return { plate: STARTUP_INTRO.backgrounds[index], level };
  };

  const introRowAt = (slot: number, scrollUpdate: number) => {
    let assignment: (typeof STARTUP_INTRO.lines)[number] | undefined;
    for (const candidate of STARTUP_INTRO.lines) {
      if (candidate.slot === slot && candidate.update <= scrollUpdate) assignment = candidate;
    }
    if (!assignment) return undefined;
    const nativeY = STARTUP_INTRO.resetY - (scrollUpdate - assignment.update);
    if (nativeY < STARTUP_INTRO.visibleTopY || nativeY > STARTUP_INTRO.visibleBottomY) return undefined;
    // A row exists for its whole 316..258 run, but the masks decide how much of
    // it is on screen, so the paragraph mirror follows the visible slice.
    const y = nativeY + INTRO_BAND_OFFSET;
    // 0000:2CCE puts the white cell one row below the cursor, so the paragraph
    // mirror follows that pass rather than the black outline around it.
    const slice = clipStartupGlyphRow(y + STARTUP_TEXT.glyphOffset.dy, INTRO_BAND);
    return { assignment, y, slice };
  };

  const clearScreen = () => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  /** The native hold may end early; the fade-out that follows never does. */
  const skipPretitleHold = () => {
    const fadeIn = STARTUP_PRETITLE.fadeInSteps * dacStepMs;
    const elapsed = performance.now() - phaseStartedAt;
    if (elapsed >= fadeIn + pretitleHoldMs) return;
    phaseStartedAt = performance.now() - Math.max(fadeIn, elapsed) - pretitleHoldMs;
  };

  const paintIntro = (scrollUpdate: number) => {
    clearScreen();
    const { plate, level } = introBackgroundAt(scrollUpdate);
    const background = loadedImages.get(plate.src);
    if (background) {
      drawFadedImage(
        context,
        background,
        plate.x,
        plate.y,
        Math.round(level * (STARTUP_TITLE.backgroundFadeSteps - 1)),
        STARTUP_TITLE.backgroundFadeSteps,
      );
    }
    for (let slot = 0; slot < introLines.length; slot += 1) {
      const row = introRowAt(slot, scrollUpdate);
      const line = introLines[slot];
      line.hidden = !row?.slice || row.assignment.text.length === 0;
      line.textContent = row?.slice ? row.assignment.text : "";
      if (row && font) drawStartupGlyphs(context, font, row.assignment.glyphs, row.y, INTRO_BAND);
    }
  };

  /** 0000:0CE2: draw the logo, fade it up, hold, then always fade it out. */
  const paintPretitle = (elapsed: number) => {
    clearScreen();
    const logo = loadedImages.get(STARTUP_PRETITLE.src);
    if (!logo) return;
    const fadeIn = STARTUP_PRETITLE.fadeInSteps * dacStepMs;
    const hold = pretitleHoldMs;
    const fadeOut = STARTUP_PRETITLE.fadeOutSteps * dacStepMs;
    let step = STARTUP_PRETITLE.fadeInSteps - 1;
    if (elapsed < fadeIn) step = Math.floor(elapsed / dacStepMs);
    else if (elapsed >= fadeIn + hold) {
      const out = Math.floor((elapsed - fadeIn - hold) / dacStepMs);
      step = STARTUP_PRETITLE.fadeOutSteps - 1 - out;
    }
    drawFadedImage(
      context,
      logo,
      STARTUP_PRETITLE.x,
      STARTUP_PRETITLE.y,
      step,
      STARTUP_PRETITLE.fadeInSteps,
    );
    // A durable marker: the logo is far too brief to observe by phase alone.
    screen.dataset.pretitleShown = "true";
    if (elapsed >= fadeIn + hold + fadeOut) enterIntro();
  };

  const animate = (now: number) => {
    if (disposed) return;
    const elapsed = now - phaseStartedAt;
    if (phase === "pretitle") paintPretitle(elapsed);
    else if (phase === "intro") {
      const progress = Math.min(1, Math.max(0, elapsed / introDuration));
      const scrollUpdate = Math.min(
        STARTUP_INTRO.scrollUpdates,
        Math.floor(progress * STARTUP_INTRO.scrollUpdates),
      );
      screen.dataset.introUpdate = String(scrollUpdate);
      paintIntro(scrollUpdate);
      if (progress >= 1) enterTitle();
    } else if (!titleAssembled) paintTitleAssembly(elapsed);
    else if (phase === "title" && now - idleSince >= STARTUP_TITLE.idleReplayNativeTicks * NATIVE_TICK_MS) {
      replayIntro();
    }
    animationFrame = requestAnimationFrame(animate);
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    stopAudio(introAudio);
    stopAudio(titleAudio);
    stopScaling();
    window.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("click", onClick);
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("contextmenu", onContextMenu);
    saveBackupUi.dispose();
  };

  window.addEventListener("keydown", onKeyDown);
  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("click", onClick);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("contextmenu", onContextMenu);
  updateMenuSelection();
  void Promise.all([
    loadStartupFont().then((image) => { font = image; }),
    ...[
      STARTUP_PRETITLE.src,
      STARTUP_TITLE.background,
      ...STARTUP_TITLE.variants.flatMap(({ upper, lower }) => [upper, lower]),
      ...STARTUP_INTRO.backgrounds.map(({ src }) => src),
    ].map(async (src) => {
      loadedImages.set(src, await loadStartupImage(src));
    }),
  ]).catch(() => undefined);
  animationFrame = requestAnimationFrame(animate);

  return cleanup;
}
