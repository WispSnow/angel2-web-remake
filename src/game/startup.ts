import {
  DIFFICULTY_OPTIONS,
  INTRO_BACKGROUND_CHANGES,
  INTRO_LINE_ASSIGNMENTS,
  NATIVE_INTRO_DURATION_MS,
  NATIVE_INTRO_SCROLL_UPDATES,
  STARTUP_ASSETS,
} from "./content/startup";
import { statsFor } from "./content/stage0";
import { configureGameScaling } from "./scaling";
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

type StartupPhase = "intro" | "title" | "difficulty" | "records";

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
const INTRO_TRANSITION_HALF_UPDATES = 21;
const TITLE_ASSEMBLY_DURATION_MS = {
  native: {
    background: 640,
    upper: 400,
    hold: 400,
    lower: 800,
  },
  test: {
    background: 8,
    upper: 8,
    hold: 8,
    lower: 16,
  },
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
  const introDuration = testMode ? 8_000 : NATIVE_INTRO_DURATION_MS;
  let phase: StartupPhase = "intro";
  let titleIndex = 0;
  let difficultyIndex = 0;
  let recordIndex = 0;
  let recordSlots: SaveSlotReadResult[] = [];
  let introFrame = 0;
  let titleReadyTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let disposed = false;
  const titleTiming = testMode
    ? TITLE_ASSEMBLY_DURATION_MS.test
    : TITLE_ASSEMBLY_DURATION_MS.native;
  const titleAssemblyDuration = Object.values(titleTiming)
    .reduce((total, duration) => total + duration, 0);

  root.innerHTML = `
    <div class="page-shell startup-shell">
      <header class="project-header">
        <div><span class="eyebrow">原版啟動流程</span><h1>天使帝國 II</h1></div>
      </header>
      <div class="game-stage">
        <div class="game-viewport" id="startup-viewport">
          <section class="logical-screen startup-screen" id="startup-screen" data-testid="startup-screen"
            style="--title-background-duration:${titleTiming.background}ms;--title-upper-duration:${titleTiming.upper}ms;--title-hold-duration:${titleTiming.hold}ms;--title-lower-duration:${titleTiming.lower}ms"
            data-startup-phase="intro" aria-label="天使帝國 II 啟動畫面">
            <section class="startup-intro" data-testid="opening-intro" aria-label="開場劇情動畫">
              <img class="startup-intro-background" alt="" />
              <div class="startup-intro-lines" aria-live="off">
                <p data-intro-slot="0"></p>
                <p data-intro-slot="1"></p>
                <p data-intro-slot="2"></p>
              </div>
              <span class="visually-hidden">按任意鍵跳過開場動畫</span>
            </section>
            <section class="startup-title" data-testid="title-screen" aria-label="標題畫面" hidden>
              <img class="startup-title-background" src="${STARTUP_ASSETS.title.background}" alt="" />
              <img class="startup-title-upper" src="${STARTUP_ASSETS.title.upper}" alt="" />
              <img class="startup-title-lower" src="${STARTUP_ASSETS.title.lower}" alt="天使帝國 II" />
              <img class="startup-menu-frame startup-title-menu-frame" data-testid="startup-title-menu-frame"
                src="${STARTUP_ASSETS.title.titleMenuFrame}" alt="" />
              <img class="startup-menu-frame startup-difficulty-menu-frame"
                data-testid="startup-difficulty-menu-frame"
                src="${STARTUP_ASSETS.title.difficultyMenuFrame}" alt="" hidden />
              <div class="startup-menu title-menu" data-testid="title-menu" role="menu" aria-label="標題選單" hidden>
                ${TITLE_OPTIONS.map((label, index) => `
                  <button type="button" role="menuitem" data-startup-action="title" data-menu-index="${index}"
                    data-testid="${index === 0 ? "new-game" : "continue-game"}">${label}</button>
                `).join("")}
              </div>
              <div class="startup-menu difficulty-menu" data-testid="difficulty-menu" role="menu"
                aria-label="難度選擇" hidden>
                ${DIFFICULTY_OPTIONS.map((option, index) => `
                  <button type="button" role="menuitem" data-startup-action="difficulty" data-menu-index="${index}"
                    data-difficulty="${option.value}" data-testid="difficulty-${option.value}">${option.label}</button>
                `).join("")}
              </div>
              <section class="startup-record-selector" data-testid="title-record-menu"
                aria-label="讀取遊戲進度" hidden>
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
                <p class="startup-record-help">↑↓ 選擇　←→ 翻頁　確認讀取　Esc 返回</p>
              </section>
              <p class="startup-menu-status" data-testid="title-status" aria-live="polite"></p>
            </section>
          </section>
        </div>
      </div>
    </div>`;

  const screen = required(root, "#startup-screen");
  const viewport = required(root, "#startup-viewport");
  const intro = required(root, ".startup-intro");
  const introBackground = required<HTMLImageElement>(root, ".startup-intro-background");
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

  const play = (audio: HTMLAudioElement) => {
    void audio.play().catch(() => undefined);
  };
  const stopAudio = (audio: HTMLAudioElement) => {
    audio.pause();
    audio.currentTime = 0;
  };

  const recordDescription = (result: SaveSlotReadResult, slot: number): string => {
    if (result.kind === "empty") return `記錄 ${slot}：此處沒有記錄。`;
    if (result.kind === "invalid") return `記錄 ${slot}：資料損壞或版本不相容，無法讀取。`;
    const { save } = result;
    const progress = save.kind === "battle" ? `第 ${save.battle.round} 回合` : "戰役完成";
    const savedAt = `${save.savedAt.slice(0, 16).replace("T", " ")} UTC`;
    return `記錄 ${slot}：${save.stageLabel}・${progress}・stableRemake・${savedAt}`;
  };

  const recordCells = (result: SaveSlotReadResult): readonly string[] => {
    if (result.kind === "empty") return ["XX", "XX", "XX", "XX", "XX"];
    if (result.kind === "invalid") return ["損壞", "—", "—", "—", "—"];
    const representative = result.save.roster[0];
    return [
      representative ? (representative.classId === 22 ? "騎兵" : "士兵") : "—",
      representative ? String(statsFor(representative).level) : "—",
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

  const updateMenuSelection = () => {
    for (const button of titleMenu.querySelectorAll<HTMLButtonElement>("button")) {
      const selected = Number(button.dataset.menuIndex) === titleIndex;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-current", String(selected));
    }
    for (const button of difficultyMenu.querySelectorAll<HTMLButtonElement>("button")) {
      const selected = Number(button.dataset.menuIndex) === difficultyIndex;
      button.classList.toggle("is-selected", selected);
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
  };

  const showTitleMenu = () => {
    phase = "title";
    screen.dataset.startupPhase = phase;
    titleMenuFrame.hidden = false;
    difficultyMenuFrame.hidden = true;
    titleMenu.hidden = false;
    difficultyMenu.hidden = true;
    recordSelector.hidden = true;
    titleStatus.textContent = "";
    updateMenuSelection();
  };

  const enterTitle = () => {
    if (phase !== "intro") return;
    stopAudio(introAudio);
    phase = "title";
    screen.dataset.startupPhase = "title-assemble";
    intro.hidden = true;
    title.hidden = false;
    title.classList.add("is-assembling");
    play(titleAudio);
    titleReadyTimer = globalThis.setTimeout(
      showTitleMenu,
      titleAssemblyDuration,
    );
  };

  const showDifficultyMenu = () => {
    phase = "difficulty";
    difficultyIndex = 0;
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
    recordSlots = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) =>
      readSaveSlot(localStorage, index + 1));
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

  const onKeyDown = (event: KeyboardEvent) => {
    if (disposed || event.repeat) return;
    if (phase === "intro") {
      event.preventDefault();
      enterTitle();
      return;
    }
    if (titleAudio.paused) play(titleAudio);
    if (screen.dataset.startupPhase === "title-assemble") return;
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
        showTitleMenu();
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
      stopAudio(titleAudio);
      showTitleMenu();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? -1 : 1;
      difficultyIndex = (difficultyIndex + delta + DIFFICULTY_OPTIONS.length) % DIFFICULTY_OPTIONS.length;
      updateMenuSelection();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      finishStartup();
    }
  };

  const onPointerOver = (event: PointerEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-startup-action]");
    if (!button) return;
    if (button.dataset.startupAction === "record-page") return;
    const index = Number(button.dataset.menuIndex);
    if (button.dataset.startupAction === "title") titleIndex = index;
    else if (button.dataset.startupAction === "difficulty") difficultyIndex = index;
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
    if (titleAudio.paused) play(titleAudio);
    if (button.dataset.startupAction === "record-page") {
      setRecordIndex(moveSaveSlotPage(recordIndex, Number(button.dataset.pageDelta)));
      return;
    }
    const index = Number(button.dataset.menuIndex);
    if (button.dataset.startupAction === "title") {
      titleIndex = index;
      updateMenuSelection();
      activateTitleOption();
    } else if (button.dataset.startupAction === "difficulty") {
      difficultyIndex = index;
      updateMenuSelection();
      finishStartup();
    } else {
      setRecordIndex(index);
      activateRecordOption();
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (phase !== "intro") return;
    event.preventDefault();
    enterTitle();
  };

  const updateIntroBackground = (scrollUpdate: number) => {
    let backgroundIndex = 0;
    for (let index = 1; index < INTRO_BACKGROUND_CHANGES.length; index += 1) {
      if (scrollUpdate >= INTRO_BACKGROUND_CHANGES[index].update) backgroundIndex = index;
    }
    const background = INTRO_BACKGROUND_CHANGES[backgroundIndex];
    if (introBackground.dataset.source !== background.source) {
      introBackground.src = background.source;
      introBackground.dataset.source = background.source;
    }

    let opacity = 1;
    const next = INTRO_BACKGROUND_CHANGES[backgroundIndex + 1];
    if (next && scrollUpdate >= next.update - INTRO_TRANSITION_HALF_UPDATES) {
      opacity = Math.max(0, (next.update - scrollUpdate) / INTRO_TRANSITION_HALF_UPDATES);
    } else if (
      backgroundIndex > 0
      && scrollUpdate < background.update + INTRO_TRANSITION_HALF_UPDATES
    ) {
      opacity = Math.max(0, (scrollUpdate - background.update) / INTRO_TRANSITION_HALF_UPDATES);
    }
    introBackground.style.opacity = String(opacity);
  };

  const updateIntroLines = (scrollUpdate: number) => {
    for (let slot = 0; slot < introLines.length; slot += 1) {
      let assignment: (typeof INTRO_LINE_ASSIGNMENTS)[number] | undefined;
      for (const candidate of INTRO_LINE_ASSIGNMENTS) {
        if (candidate.slot === slot && candidate.update <= scrollUpdate) assignment = candidate;
      }
      const line = introLines[slot];
      if (!assignment) {
        line.hidden = true;
        continue;
      }
      const y = 317 - (scrollUpdate - assignment.update);
      line.hidden = assignment.text.length === 0 || y < 258 || y > 316;
      line.textContent = assignment.text;
      line.style.top = `${y}px`;
    }
  };

  const introStartedAt = performance.now();
  const animateIntro = (now: number) => {
    if (disposed || phase !== "intro") return;
    const progress = Math.min(1, Math.max(0, (now - introStartedAt) / introDuration));
    const scrollUpdate = Math.min(
      NATIVE_INTRO_SCROLL_UPDATES,
      Math.floor(progress * NATIVE_INTRO_SCROLL_UPDATES),
    );
    screen.dataset.introUpdate = String(scrollUpdate);
    updateIntroBackground(scrollUpdate);
    updateIntroLines(scrollUpdate);
    if (progress >= 1) {
      enterTitle();
      return;
    }
    introFrame = requestAnimationFrame(animateIntro);
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(introFrame);
    if (titleReadyTimer !== undefined) globalThis.clearTimeout(titleReadyTimer);
    stopAudio(introAudio);
    stopAudio(titleAudio);
    stopScaling();
    window.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("click", onClick);
    root.removeEventListener("pointerdown", onPointerDown);
  };

  window.addEventListener("keydown", onKeyDown);
  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("click", onClick);
  root.addEventListener("pointerdown", onPointerDown);
  updateMenuSelection();
  play(introAudio);
  introFrame = requestAnimationFrame(animateIntro);

  return cleanup;
}
