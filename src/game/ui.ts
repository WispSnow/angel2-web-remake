import { ASSETS, STAGE0, nextExperienceThresholdFor, statsFor } from "./content/stage0";
import type { GameController } from "./controller";
import { FULL_COMBAT_FRAME_META, type FullCombatSpriteState } from "./full-combat";
import type { GamePhase, Position, UnitStats } from "./types";
import type { AudioManager } from "./audio";
import {
  animatedPortraitMarkup,
  configureAnimatedPortrait,
  nativeMouthFrameAfterGlyph,
  nativeStoryGlyphMovesMouth,
  startPortraitAnimations,
} from "./portrait";
import { configureGameScaling } from "./scaling";
import { implementedSidePanelHotspots } from "./side-panel";

const storyPhases = new Set<GamePhase>(["prebattleStory", "openingStory", "round2Story", "victoryStory"]);

export function mountUi(root: HTMLElement, controller: GameController, audio: AudioManager): void {
  root.innerHTML = `
    <div class="page-shell">
      <header class="project-header">
        <div><span class="eyebrow">首個可玩垂直切片</span><h1>天使帝國 II · 瓦爾克麗宮</h1></div>
      </header>
      <div class="game-stage">
        <div class="game-viewport" id="game-viewport">
          <section class="logical-screen" id="logical-screen" data-testid="game-screen" aria-label="天使帝國 II 第 0 關遊戲畫面">
            <div class="battle-chrome" data-testid="battle-chrome" aria-hidden="true">
              <img class="chrome-top" src="${ASSETS.battleChrome.top}" alt="" />
              <img class="chrome-corner-left" src="${ASSETS.battleChrome.cornerLeft}" alt="" />
              <img class="chrome-corner-right" src="${ASSETS.battleChrome.cornerRight}" alt="" />
              <img class="chrome-glass-left" src="${ASSETS.battleChrome.glass}" alt="" />
              <img class="chrome-glass-right" src="${ASSETS.battleChrome.glass}" alt="" />
              <img class="chrome-side-left" src="${ASSETS.battleChrome.sideLeft}" alt="" />
              <img class="chrome-side-right" src="${ASSETS.battleChrome.sideRight}" alt="" />
              <img class="chrome-bottom-left" src="${ASSETS.battleChrome.bottomLeft}" alt="" />
              <img class="chrome-bottom-right" src="${ASSETS.battleChrome.bottomRight}" alt="" />
              <div class="right-panel-backdrop"></div>
            </div>
            <div id="phaser-root"></div>
            <div class="battle-foreground" data-testid="battle-foreground" aria-hidden="true">
              <img class="statue-foreground-left" src="${ASSETS.battleChrome.statueForegroundLeft}" alt="" />
              <img class="statue-foreground-right" src="${ASSETS.battleChrome.statueForegroundRight}" alt="" />
            </div>
            <div class="story-background" id="story-background"></div>
            <section class="unit-hud" id="unit-hud" data-testid="unit-hud" aria-live="polite"></section>
            <div class="bottom-location">瓦爾克麗宮</div>
            <div class="bottom-round" id="bottom-round"></div>
            ${renderSidePanelHotspots()}
            <section class="system-menu action-menu" id="system-menu" data-testid="system-menu" role="menu" aria-label="戰鬥系統選單" hidden></section>
            <section class="settings-menu modal-panel" id="settings-menu" data-testid="settings-menu" role="dialog" aria-label="遊戲功能" hidden>
              <span class="panel-kicker">SYSTEM</span><h2>遊戲功能</h2>
              <div class="system-menu-grid">
                <button data-action="open-group-commands" data-testid="group-commands-button">集體命令</button>
                <button data-action="speed" data-testid="speed-button">動畫 ×1</button>
                <button data-action="battle-presentation" data-testid="presentation-button">戰鬥 全景</button>
                <button data-action="toggle-grid" data-testid="grid-button">方格 關</button>
                <button data-action="toggle-edge-scroll" data-testid="edge-scroll-button">捲動 開</button>
                <button data-action="toggle-portraits" data-testid="portraits-button">圖像 開</button>
                <button data-action="open-music-settings" data-testid="music-button">音樂 最大</button>
                <button data-action="open-sound-settings" data-testid="sound-button">音效設定</button>
                <button data-action="close-settings">返回</button>
              </div>
            </section>
            <section class="sound-settings-menu modal-panel" id="sound-settings-menu"
              data-testid="sound-settings-menu" role="dialog" aria-label="音效開關" hidden>
              <span class="panel-kicker">SOUND</span><h2>音效開關</h2>
              <div class="sound-settings-grid" role="group" aria-label="音效分類">
                <button data-action="toggle-sound-speech" data-testid="sound-speech-button">說話 開</button>
                <button data-action="toggle-sound-movement" data-testid="sound-movement-button">移動 開</button>
                <button data-action="toggle-sound-combat" data-testid="sound-combat-button">戰鬥 開</button>
                <button data-action="toggle-sound-key" data-testid="sound-key-button">按鍵 開</button>
                <button data-action="close-sound-settings" data-testid="close-sound-settings">返回</button>
              </div>
            </section>
            <section class="music-settings-menu modal-panel" id="music-settings-menu"
              data-testid="music-settings-menu" role="dialog" aria-label="音樂開關" hidden>
              <span class="panel-kicker">MUSIC</span><h2>音樂開關</h2>
              <div class="music-settings-list" role="radiogroup" aria-label="音樂音量">
                ${["無聲", "1", "2", "3", "最大"].map((label, level) =>
                  `<button role="radio" data-action="music-volume" data-music-level="${level}"
                    data-testid="music-volume-${level}">${label}</button>`).join("")}
                <button data-action="close-music-settings" data-testid="close-music-settings">返回</button>
              </div>
            </section>
            <section class="record-menu action-menu" id="record-menu" data-testid="record-menu" role="menu" aria-label="戰役記錄" hidden></section>
            <section class="quit-confirm modal-panel native-feedback-confirm" id="quit-confirm" data-testid="quit-confirm" role="dialog" aria-label="離開遊戲確認" hidden>
              ${animatedPortraitMarkup(46, {
                alt: "妮雅肖像",
                channel: "quit-feedback",
                className: "feedback-portrait",
              })}
              <p data-testid="quit-feedback-text" data-full-text="唉啊！．．．要休息了嗎？&#10;請再考慮一下吧！">唉啊！．．．要休息了嗎？
請再考慮一下吧！</p>
              <div class="button-row">
                <button data-action="quit-confirm" data-quit-index="0">確 定</button>
                <button data-action="quit-cancel" data-quit-index="1">取 消</button>
              </div>
            </section>
            <section class="group-command-menu action-menu" id="group-command-menu" data-testid="group-command-menu" role="menu" aria-label="集體命令" hidden></section>
            <section class="retreat-confirm modal-panel native-feedback-confirm" id="retreat-confirm" data-testid="retreat-confirm" role="dialog" aria-label="全面撤退確認" hidden>
              ${animatedPortraitMarkup(46, {
                alt: "妮雅肖像",
                channel: "retreat-feedback",
                className: "feedback-portrait",
              })}
              <p data-testid="retreat-feedback-text" data-full-text="哦！．．．要撤退嗎？&#10;必竟是沒辦法的事，雙方的實力差太多了．">哦！．．．要撤退嗎？
必竟是沒辦法的事，雙方的實力差太多了．</p>
              <div class="button-row">
                <button data-action="retreat-confirm" data-retreat-index="0">確 定</button>
                <button data-action="retreat-cancel" data-retreat-index="1">取 消</button>
              </div>
            </section>
            <div class="action-menu" id="action-menu" data-testid="action-menu" role="menu" aria-label="單位行動" hidden></div>
            <div class="status-strip" id="status-strip" aria-live="polite"></div>
            <section class="combat-presentation" id="combat-presentation" data-testid="combat-presentation" hidden></section>
            <button class="hint-toast" id="hint-toast" data-action="objectives" hidden></button>
            <section class="dialogue-layer" id="dialogue-layer" data-testid="dialogue-layer" hidden>
              <div class="dialogue-box upper" id="dialogue-box-upper" data-testid="dialogue-window-upper" hidden>
                <span class="animated-portrait dialogue-portrait" id="dialogue-portrait-upper"
                  data-portrait-channel="dialogue-upper" data-blink-frame="1" data-blink-count="0" hidden></span>
                <div class="dialogue-copy" id="dialogue-copy-upper">
                  <b class="dialogue-speaker" id="dialogue-speaker-upper"></b>
                  <p id="dialogue-text-upper"></p><span class="continue-mark">▼</span>
                </div>
              </div>
              <div class="dialogue-box lower" id="dialogue-box-lower" data-testid="dialogue-window-lower" hidden>
                <span class="animated-portrait dialogue-portrait" id="dialogue-portrait-lower"
                  data-portrait-channel="dialogue-lower" data-blink-frame="1" data-blink-count="0" hidden></span>
                <div class="dialogue-copy" id="dialogue-copy-lower">
                  <b class="dialogue-speaker" id="dialogue-speaker-lower"></b>
                  <p id="dialogue-text-lower"></p><span class="continue-mark">▼</span>
                </div>
              </div>
              <div class="dialogue-controls" id="dialogue-controls" role="group" aria-label="劇情對話控制">
                <button type="button" data-action="advance-dialogue" data-testid="advance-dialogue">繼續</button>
                <button type="button" data-action="skip-dialogue" data-testid="skip-dialogue"
                  aria-label="跳過本輪劇情對話">跳過</button>
              </div>
            </section>
            <section class="objective-panel modal-panel" id="objective-panel" data-testid="objective-panel" hidden>
              <span class="panel-kicker">瓦爾克麗宮</span>
              <h2>勝利條件</h2><p>${STAGE0.objective}</p>
              <h2>失敗條件</h2><p>「妮雅」戰敗。</p>
              <button data-action="close-objectives">返回戰場</button>
            </section>
            <section class="result-layer" id="result-layer" data-testid="result-layer" hidden></section>
          </section>
        </div>
      </div>
    </div>`;

  const screen = required(root, "#logical-screen");
  const hud = required(root, "#unit-hud");
  const round = required(root, "#bottom-round");
  const actionMenu = required(root, "#action-menu");
  const status = required(root, "#status-strip");
  const combatPresentation = required(root, "#combat-presentation");
  const hint = required(root, "#hint-toast");
  const dialogueLayer = required(root, "#dialogue-layer");
  const dialogueWindows = {
    upper: {
      box: required(root, "#dialogue-box-upper"),
      copy: required(root, "#dialogue-copy-upper"),
      portrait: required(root, "#dialogue-portrait-upper"),
      speaker: required(root, "#dialogue-speaker-upper"),
      text: required(root, "#dialogue-text-upper"),
    },
    lower: {
      box: required(root, "#dialogue-box-lower"),
      copy: required(root, "#dialogue-copy-lower"),
      portrait: required(root, "#dialogue-portrait-lower"),
      speaker: required(root, "#dialogue-speaker-lower"),
      text: required(root, "#dialogue-text-lower"),
    },
  };
  const dialogueControls = required(root, "#dialogue-controls");
  const storyBackground = required(root, "#story-background");
  const objectivePanel = required(root, "#objective-panel");
  const systemMenu = required(root, "#system-menu");
  const settingsMenu = required(root, "#settings-menu");
  const soundSettingsMenu = required(root, "#sound-settings-menu");
  const musicSettingsMenu = required(root, "#music-settings-menu");
  const recordMenu = required(root, "#record-menu");
  const quitConfirm = required(root, "#quit-confirm");
  const groupCommandMenu = required(root, "#group-command-menu");
  const retreatConfirm = required(root, "#retreat-confirm");
  const resultLayer = required(root, "#result-layer");
  let dialogueTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let activeDialogueKey = "";
  let dialogueFullText = "";
  let revealedCharacters = 0;
  let activeDialogueText: HTMLElement | undefined;
  let activeDialoguePortrait: HTMLElement | undefined;
  let feedbackTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let activeFeedbackKey = "";
  let feedbackFullText = "";
  let feedbackRevealedCharacters = 0;
  let activeFeedbackText: HTMLElement | undefined;
  let activeFeedbackPortrait: HTMLElement | undefined;
  startPortraitAnimations(
    root,
    controller.isTestMode,
    () => controller.phase === "nextStage" || controller.phase === "quit",
  );

  const stopSpeaking = (portrait: HTMLElement | undefined) => {
    if (!portrait) return;
    portrait.dataset.speaking = "false";
    portrait.dataset.mouthFrame = "1";
  };
  const startSpeaking = (portrait: HTMLElement | undefined, speaking: boolean) => {
    if (!portrait) return;
    portrait.dataset.speaking = String(speaking);
    portrait.dataset.mouthFrame = "1";
  };
  const drawSpeechGlyph = (portrait: HTMLElement | undefined, character: string) => {
    if (!portrait || !nativeStoryGlyphMovesMouth(character)) return;
    portrait.dataset.mouthFrame = nativeMouthFrameAfterGlyph(portrait.dataset.mouthFrame, character);
    portrait.dataset.talkCount = String(Number(portrait.dataset.talkCount ?? "0") + 1);
  };
  const stopDialogueTimer = () => {
    if (dialogueTimer !== undefined) globalThis.clearTimeout(dialogueTimer);
    dialogueTimer = undefined;
  };
  const revealDialogue = (
    fullText: string,
    key: string,
    target: HTMLElement,
    revealStart = 0,
    portrait?: HTMLElement,
  ) => {
    stopDialogueTimer();
    stopSpeaking(activeDialoguePortrait);
    activeDialogueKey = key;
    dialogueFullText = fullText;
    activeDialogueText = target;
    activeDialoguePortrait = portrait;
    revealedCharacters = Math.max(0, Math.min(fullText.length, revealStart));
    target.textContent = fullText.slice(0, revealedCharacters);
    startSpeaking(activeDialoguePortrait, revealedCharacters < dialogueFullText.length);
    const tick = () => {
      if (activeDialogueKey !== key || activeDialogueText !== target || revealedCharacters >= dialogueFullText.length) {
        stopSpeaking(activeDialoguePortrait);
        dialogueTimer = undefined;
        return;
      }
      const character = dialogueFullText[revealedCharacters];
      revealedCharacters += 1;
      target.textContent = dialogueFullText.slice(0, revealedCharacters);
      if (/[^\x00-\x7f]/u.test(character)) audio.playSpeechCharacter(character);
      drawSpeechGlyph(activeDialoguePortrait, character);
      const delay = controller.isTestMode ? 12 : controller.presentationFast ? 20 : 80;
      dialogueTimer = globalThis.setTimeout(tick, delay);
    };
    tick();
  };
  const finishDialogueTyping = (): boolean => {
    if (!dialogueFullText || !activeDialogueText || revealedCharacters >= dialogueFullText.length) return false;
    stopDialogueTimer();
    revealedCharacters = dialogueFullText.length;
    activeDialogueText.textContent = dialogueFullText;
    stopSpeaking(activeDialoguePortrait);
    return true;
  };
  const stopFeedbackTimer = () => {
    if (feedbackTimer !== undefined) globalThis.clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
  };
  const revealFeedback = (fullText: string, key: string, target: HTMLElement, portrait?: HTMLElement) => {
    stopFeedbackTimer();
    stopSpeaking(activeFeedbackPortrait);
    activeFeedbackKey = key;
    feedbackFullText = fullText;
    feedbackRevealedCharacters = 0;
    activeFeedbackText = target;
    activeFeedbackPortrait = portrait;
    target.textContent = "";
    startSpeaking(activeFeedbackPortrait, fullText.length > 0);
    const tick = () => {
      if (activeFeedbackKey !== key || activeFeedbackText !== target || feedbackRevealedCharacters >= fullText.length) {
        stopSpeaking(activeFeedbackPortrait);
        feedbackTimer = undefined;
        return;
      }
      const character = fullText[feedbackRevealedCharacters];
      feedbackRevealedCharacters += 1;
      target.textContent = fullText.slice(0, feedbackRevealedCharacters);
      if (/[^\x00-\x7f]/u.test(character)) audio.playSpeechCharacter(character);
      drawSpeechGlyph(activeFeedbackPortrait, character);
      feedbackTimer = globalThis.setTimeout(tick, controller.isTestMode ? 12 : controller.presentationFast ? 20 : 80);
    };
    tick();
  };
  const finishFeedbackTyping = (): boolean => {
    if (!feedbackFullText || !activeFeedbackText || feedbackRevealedCharacters >= feedbackFullText.length) return false;
    stopFeedbackTimer();
    feedbackRevealedCharacters = feedbackFullText.length;
    activeFeedbackText.textContent = feedbackFullText;
    stopSpeaking(activeFeedbackPortrait);
    return true;
  };

  root.addEventListener("click", (event) => {
    const minimap = (event.target as Element).closest<HTMLElement>("[data-testid=tactical-minimap]");
    if (minimap) {
      controller.commitMinimapPreview();
      return;
    }
    const button = (event.target as Element).closest<HTMLElement>("[data-action]");
    if (!button) {
      if ((event.target as Element).closest("#dialogue-layer")) {
        if (!finishDialogueTyping()) controller.advanceDialogue();
      } else if ((event.target as Element).closest("#result-layer")) {
        if (!finishFeedbackTyping()) controller.primaryAtCursor();
      }
      return;
    }
    const action = button.dataset.action;
    if (action === "advance-dialogue") {
      if (!finishDialogueTyping()) controller.advanceDialogue();
    }
    else if (action === "skip-dialogue") controller.skipDialogue();
    else if (action === "open-system-menu") controller.openSystemMenu();
    else if (action === "close-system-menu") controller.closeSystemMenu();
    else if (action === "system-settings") controller.openSettings();
    else if (action === "system-load") controller.openRecordMenu("load");
    else if (action === "system-save") controller.openRecordMenu("save");
    else if (action === "system-quit") controller.requestQuit();
    else if (action === "close-settings") controller.closeSettings();
    else if (action === "open-sound-settings") controller.openSoundSettings();
    else if (action === "close-sound-settings") controller.closeSoundSettings();
    else if (action === "toggle-sound-speech") controller.toggleSpeechSound();
    else if (action === "toggle-sound-movement") controller.toggleMovementSound();
    else if (action === "toggle-sound-combat") controller.toggleCombatSound();
    else if (action === "toggle-sound-key") controller.toggleKeySound();
    else if (action === "open-music-settings") controller.openMusicSettings();
    else if (action === "close-music-settings") controller.closeMusicSettings();
    else if (action === "music-volume") controller.setMusicVolume(Number(button.dataset.musicLevel));
    else if (action === "record-slot") {
      controller.selectRecordMenuSlot(Number(button.dataset.recordIndex));
      controller.activateRecordMenuSelection();
    }
    else if (action === "close-record-menu") controller.closeRecordMenu();
    else if (action === "quit-confirm") {
      if (!finishFeedbackTyping()) controller.confirmQuit();
    }
    else if (action === "quit-cancel") controller.cancelQuit();
    else if (action === "open-group-commands") controller.openGroupCommands();
    else if (action === "close-group-commands") controller.closeGroupCommands();
    else if (action === "all-rest") void controller.allRest();
    else if (action === "follow-leader") void controller.followLeader();
    else if (action === "free-action") void controller.freeAction();
    else if (action === "request-retreat") controller.requestRetreat();
    else if (action === "retreat-confirm") {
      if (!finishFeedbackTyping()) controller.confirmRetreat();
    }
    else if (action === "retreat-cancel") controller.cancelRetreat();
    else if (action === "objectives") controller.openObjectives();
    else if (action === "close-objectives") controller.closeObjectives();
    else if (action === "speed") controller.toggleSpeed();
    else if (action === "battle-presentation") controller.toggleBattlePresentation();
    else if (action === "toggle-grid") controller.toggleGrid();
    else if (action === "toggle-edge-scroll") controller.toggleEdgeScroll();
    else if (action === "toggle-portraits") controller.togglePortraits();
    else if (action === "move") controller.chooseMove();
    else if (action === "attack") controller.chooseAttack();
    else if (action === "rest") controller.chooseRest();
    else if (action === "end-unit") controller.chooseEnd();
    else if (action === "undo-move") controller.chooseUndo();
    else if (action === "retry") {
      if (!finishFeedbackTyping()) controller.retry();
    }
    else if (action === "victory-continue") {
      if (!finishFeedbackTyping()) controller.continueAfterVictory();
    }
    else if (action === "save-yes") controller.showSaveSlots();
    else if (action === "save-no") controller.skipSave();
    else if (action === "save-slot") controller.selectSaveSlot(Number(button.dataset.slot));
    else if (action === "overwrite-confirm") controller.confirmOverwrite();
    else if (action === "overwrite-cancel") controller.cancelOverwrite();
  });

  root.addEventListener("pointermove", (event) => {
    const command = (event.target as Element).closest<HTMLElement>("[data-command-index]");
    if (command) controller.selectCommand(Number(command.dataset.commandIndex));
    const groupCommand = (event.target as Element).closest<HTMLElement>("[data-group-command-index]");
    if (groupCommand) controller.selectGroupCommand(Number(groupCommand.dataset.groupCommandIndex));
    const retreatChoice = (event.target as Element).closest<HTMLElement>("[data-retreat-index]");
    if (retreatChoice) controller.selectRetreatChoice(Number(retreatChoice.dataset.retreatIndex));
    const systemCommand = (event.target as Element).closest<HTMLElement>("[data-system-index]");
    if (systemCommand) controller.selectSystemMenuCommand(Number(systemCommand.dataset.systemIndex));
    const recordSlot = (event.target as Element).closest<HTMLElement>("[data-record-index]");
    if (recordSlot) controller.selectRecordMenuSlot(Number(recordSlot.dataset.recordIndex));
    const quitChoice = (event.target as Element).closest<HTMLElement>("[data-quit-index]");
    if (quitChoice) controller.selectQuitChoice(Number(quitChoice.dataset.quitIndex));
    const postSaveSlot = (event.target as Element).closest<HTMLElement>("[data-post-save-index]");
    if (postSaveSlot) controller.selectPostSaveSlot(Number(postSaveSlot.dataset.postSaveIndex));
    const minimap = (event.target as Element).closest<HTMLElement>("[data-testid=tactical-minimap]");
    if (!minimap) {
      if (controller.minimapPreviewOrigin) controller.clearMinimapPreview();
      return;
    }
    const bounds = minimap.getBoundingClientRect();
    const cell = {
      x: Math.max(0, Math.min(STAGE0.width - 1, Math.floor((event.clientX - bounds.left) * STAGE0.width / bounds.width))),
      y: Math.max(0, Math.min(STAGE0.height - 1, Math.floor((event.clientY - bounds.top) * STAGE0.height / bounds.height))),
    };
    const origin = controller.previewMinimapCell(cell);
    const preview = minimap.querySelector<HTMLElement>("[data-testid=minimap-preview]");
    if (!preview || !origin) return;
    preview.hidden = false;
    preview.style.left = `${origin.x * 3}px`;
    preview.style.top = `${origin.y * 3}px`;
  });

  root.addEventListener("pointerout", (event) => {
    const minimap = (event.target as Element).closest<HTMLElement>("[data-testid=tactical-minimap]");
    if (!minimap || (event.relatedTarget instanceof Node && minimap.contains(event.relatedTarget))) return;
    controller.clearMinimapPreview();
    const preview = minimap.querySelector<HTMLElement>("[data-testid=minimap-preview]");
    if (preview) preview.hidden = true;
  });

  root.addEventListener("contextmenu", (event) => {
    if (!(event.target as Element).closest("#logical-screen")) return;
    event.preventDefault();
    if (!(event.target instanceof HTMLCanvasElement)) void controller.rightClickAction();
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key;
    const lower = key.toLowerCase();
    const navigation: Record<string, Position> = {
      ArrowUp: { x: 0, y: -1 },
      w: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      z: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      a: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      s: { x: 1, y: 0 },
      Home: { x: -1, y: -1 },
      PageUp: { x: 1, y: -1 },
      End: { x: -1, y: 1 },
      PageDown: { x: 1, y: 1 },
    };
    const delta = navigation[key] ?? navigation[lower];
    const handled = Boolean(delta)
      || ["Control", "Insert", " ", "Alt", "Delete", "Enter", "Escape", "Tab", "F1", "F2", "F3", "F4"].includes(key)
      || lower === "e"
      || lower === "m"
      || lower === "o";
    if (handled) event.preventDefault();
    if (delta) controller.moveCursor(delta);
    else if (event.repeat) return;
    else if (key === "Control" || key === "Insert" || key === " ") {
      if (!finishDialogueTyping() && !finishFeedbackTyping()) controller.primaryAtCursor();
    }
    else if (key === "Alt" || key === "Delete" || key === "Enter") controller.secondaryAction();
    else if (key === "Escape") controller.systemAction();
    else if (key === "Tab") controller.groupCommandOpen ? controller.closeGroupCommands() : controller.openGroupCommands();
    else if (key === "F1") void controller.allRest();
    else if (key === "F2") void controller.followLeader();
    else if (key === "F3") void controller.freeAction();
    else if (key === "F4") controller.requestRetreat();
    else if (lower === "e") controller.openSoundSettings();
    else if (lower === "m") controller.openMusicSettings();
    else if (lower === "o") controller.objectiveOpen ? controller.closeObjectives() : controller.openObjectives();
  });

  const render = () => {
    screen.dataset.phase = controller.phase;
    screen.dataset.actionMode = controller.actionMode;
    round.textContent = `第 ${controller.battle.round} 回合`;
    status.textContent = controller.statusMessage;
    actionMenu.hidden = controller.phase !== "player" || controller.actionMode !== "actionMenu";
    if (!actionMenu.hidden) {
      const position = controller.commandMenuPosition;
      actionMenu.style.left = `${position.x}px`;
      actionMenu.style.top = `${position.y}px`;
      actionMenu.dataset.kind = controller.commandMenuKind;
      actionMenu.setAttribute("aria-label", controller.commandMenuKind === "initial" ? "選擇單位行動" : "選擇移動後行動");
      actionMenu.innerHTML = controller.unitCommands.map((command, index) => {
        const action = command.id === "end" ? "end-unit" : command.id === "undo" ? "undo-move" : command.id;
        const selected = index === controller.commandIndex;
        return `<button type="button" role="menuitem" data-action="${action}" data-command-index="${index}" data-testid="unit-command-${command.id}" class="${selected ? "is-selected" : ""}" aria-current="${selected ? "true" : "false"}">${command.label}</button>`;
      }).join("");
    }
    hint.hidden = !controller.hintVisible || controller.phase !== "player";
    hint.textContent = `查看勝利條件：保護妮雅；敵軍被擊倒或撤離均計入清除。`;
    objectivePanel.hidden = !controller.objectiveOpen;
    systemMenu.hidden = !controller.systemMenuOpen;
    if (!systemMenu.hidden) {
      systemMenu.innerHTML = controller.systemCommands.map((command, index) => {
        const action = command.id === "settings"
          ? "system-settings"
          : command.id === "objectives"
            ? "objectives"
            : `system-${command.id}`;
        const selected = index === controller.systemMenuIndex;
        return `<button type="button" role="menuitem" data-action="${action}" data-system-index="${index}" data-testid="system-command-${command.id}" class="${selected ? "is-selected" : ""}" aria-current="${selected ? "true" : "false"}">${command.label}</button>`;
      }).join("");
    }
    settingsMenu.hidden = !controller.settingsOpen;
    soundSettingsMenu.hidden = !controller.soundSettingsOpen;
    musicSettingsMenu.hidden = !controller.musicSettingsOpen;
    recordMenu.hidden = controller.recordMenuMode === undefined;
    if (!recordMenu.hidden) {
      const mode = controller.recordMenuMode;
      const slots = Array.from({ length: 5 }, (_, index) => {
        const slot = index + 1;
        const save = controller.readSave(slot);
        const selected = index === controller.recordMenuIndex;
        const label = save
          ? `${save.stageLabel}　第 ${save.kind === "battle" ? save.battle?.round ?? 1 : "完"} 回合`
          : "此處沒有記錄";
        return `<button type="button" role="menuitem" data-action="record-slot" data-record-index="${index}" data-testid="record-slot-${slot}" class="${selected ? "is-selected" : ""}" aria-current="${selected ? "true" : "false"}" ${mode === "load" && !save ? "disabled" : ""}><b>${slot}</b><span>${label}</span></button>`;
      }).join("");
      recordMenu.innerHTML = `<strong>${mode === "save" ? "儲存遊戲進度" : "讀取遊戲進度"}</strong>${slots}<button type="button" data-action="close-record-menu">取 消</button>`;
    }
    quitConfirm.hidden = !controller.quitConfirmOpen;
    if (!quitConfirm.hidden) {
      for (const button of quitConfirm.querySelectorAll<HTMLButtonElement>("[data-quit-index]")) {
        const selected = Number(button.dataset.quitIndex) === controller.quitConfirmIndex;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-current", String(selected));
      }
    }
    groupCommandMenu.hidden = !controller.groupCommandOpen;
    if (!groupCommandMenu.hidden) {
      groupCommandMenu.innerHTML = controller.groupCommands.map((command, index) => {
        const action = command.id === "allRest"
          ? "all-rest"
          : command.id === "followLeader"
            ? "follow-leader"
            : command.id === "freeAction"
              ? "free-action"
              : "request-retreat";
        const selected = index === controller.groupCommandIndex;
        const disabled = command.id === "followLeader" && !controller.followLeaderAvailable;
        return `<button type="button" role="menuitem" data-action="${action}" data-group-command-index="${index}" data-testid="group-command-${command.id}" class="${selected ? "is-selected" : ""}" aria-current="${selected ? "true" : "false"}" ${disabled ? "disabled" : ""}>${command.label}</button>`;
      }).join("");
    }
    retreatConfirm.hidden = !controller.retreatConfirmOpen;
    if (!retreatConfirm.hidden) {
      for (const button of retreatConfirm.querySelectorAll<HTMLButtonElement>("[data-retreat-index]")) {
        const selected = Number(button.dataset.retreatIndex) === controller.retreatConfirmIndex;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-current", String(selected));
      }
    }
    const speed = root.querySelector<HTMLElement>("[data-testid=speed-button]");
    if (speed) speed.textContent = controller.presentationFast ? "動畫 ×4" : "動畫 ×1";
    const presentation = root.querySelector<HTMLElement>("[data-testid=presentation-button]");
    if (presentation) presentation.textContent = controller.battlePresentation === "full" ? "戰鬥 全景" : "戰鬥 地圖";
    const grid = root.querySelector<HTMLElement>("[data-testid=grid-button]");
    if (grid) grid.textContent = controller.gridEnabled ? "方格 開" : "方格 關";
    const edgeScroll = root.querySelector<HTMLElement>("[data-testid=edge-scroll-button]");
    if (edgeScroll) edgeScroll.textContent = controller.edgeScrollEnabled ? "捲動 開" : "捲動 關";
    const portraits = root.querySelector<HTMLElement>("[data-testid=portraits-button]");
    if (portraits) portraits.textContent = controller.portraitsEnabled ? "圖像 開" : "圖像 關";
    const music = root.querySelector<HTMLElement>("[data-testid=music-button]");
    const musicVolumeLabels = ["無聲", "1", "2", "3", "最大"] as const;
    if (music) music.textContent = `音樂 ${musicVolumeLabels[controller.musicVolume]}`;
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-music-level]")) {
      const selected = Number(button.dataset.musicLevel) === controller.musicVolume;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    }
    const soundButtons = [
      ["sound-speech-button", "說話", controller.speechEnabled],
      ["sound-movement-button", "移動", controller.movementSoundEnabled],
      ["sound-combat-button", "戰鬥", controller.combatSoundEnabled],
      ["sound-key-button", "按鍵", controller.keySoundEnabled],
    ] as const;
    for (const [testId, label, enabled] of soundButtons) {
      const button = root.querySelector<HTMLButtonElement>(`[data-testid=${testId}]`);
      if (!button) continue;
      button.textContent = `${label} ${enabled ? "開" : "關"}`;
      button.setAttribute("aria-pressed", String(enabled));
    }
    for (const action of ["objectives", "open-group-commands", "battle-presentation", "all-rest"]) {
      const button = root.querySelector<HTMLButtonElement>(`[data-action=${action}]`);
      if (button) button.disabled = controller.inputLocked;
    }

    const focus = controller.portraitsEnabled ? controller.describeFocus() : undefined;
    screen.dataset.hudMode = focus ? "unit" : "tactical";
    screen.dataset.portraitsEnabled = String(controller.portraitsEnabled);
    screen.dataset.sidePanelHotspots = controller.phase === "player"
      && controller.actionMode === "idle"
      && !controller.hasBlockingOverlay
      && !controller.inputLocked
      && !focus
      ? "active"
      : "inactive";
    hud.innerHTML = `${renderTactical(controller, Boolean(focus))}${focus ? renderHud(focus.unit, focus.stats) : ""}`;

    const page = controller.currentDialogue;
    const dialogueVisible = storyPhases.has(controller.phase) && page !== undefined;
    dialogueLayer.hidden = !dialogueVisible;
    storyBackground.hidden = controller.phase !== "prebattleStory";
    if (page) {
      const pageKey = `${controller.phase}:${controller.dialogueIndex}`;
      const pageChanged = activeDialogueKey !== pageKey;
      dialogueLayer.dataset.sourceRecord = String(page.source.record);
      dialogueLayer.dataset.sourceWait = String(page.source.wait);
      dialogueLayer.dataset.activeSlot = page.activeSlot ?? "none";
      dialogueLayer.dataset.revealStart = String(page.revealStart ?? 0);
      dialogueLayer.classList.toggle("prebattle", controller.phase === "prebattleStory");
      for (const slot of ["upper", "lower"] as const) {
        const elements = dialogueWindows[slot];
        const state = page[slot];
        const active = page.activeSlot === slot;
        elements.box.hidden = state === undefined;
        elements.box.classList.toggle("is-active", active);
        elements.box.dataset.openSteps = "11";
        elements.text.removeAttribute("id");
        elements.portrait.removeAttribute("data-testid");
        if (!state) {
          stopSpeaking(elements.portrait);
          continue;
        }
        elements.speaker.textContent = state.speaker ?? "";
        elements.box.setAttribute("aria-label", state.speaker ? `${state.speaker}對話` : "旁白");
        if (!active || pageChanged) elements.text.textContent = state.text;
        if (state.portrait) {
          configureAnimatedPortrait(
            elements.portrait,
            state.portrait,
            `${state.speaker ?? "角色"}肖像`,
            `dialogue-${slot}`,
            `dialogue-portrait-${slot}`,
          );
          elements.portrait.hidden = false;
          elements.portrait.dataset.testid = active
            ? "dialogue-portrait-composite"
            : `dialogue-portrait-composite-${slot}`;
          if (!active) stopSpeaking(elements.portrait);
        } else {
          stopSpeaking(elements.portrait);
          elements.portrait.hidden = true;
        }
      }
      const controlsParent = page.activeSlot
        ? dialogueWindows[page.activeSlot].copy
        : dialogueLayer;
      if (dialogueControls.parentElement !== controlsParent) controlsParent.append(dialogueControls);
      if (page.activeSlot) {
        const activeState = page[page.activeSlot];
        const target = dialogueWindows[page.activeSlot].text;
        const portrait = activeState?.portrait ? dialogueWindows[page.activeSlot].portrait : undefined;
        target.id = "dialogue-text";
        if (pageChanged && activeState) revealDialogue(activeState.text, pageKey, target, page.revealStart, portrait);
      } else if (pageChanged) {
        stopDialogueTimer();
        stopSpeaking(activeDialoguePortrait);
        activeDialogueKey = pageKey;
        activeDialogueText = undefined;
        activeDialoguePortrait = undefined;
        dialogueFullText = "";
        revealedCharacters = 0;
      }
    } else {
      stopDialogueTimer();
      stopSpeaking(activeDialoguePortrait);
      activeDialogueKey = "";
      activeDialogueText = undefined;
      activeDialoguePortrait = undefined;
      dialogueFullText = "";
      revealedCharacters = 0;
    }

    renderResult(resultLayer, controller);
    const resultFeedbackText = resultLayer.querySelector<HTMLElement>("[data-testid=feedback-text]");
    const modalFeedbackText = !quitConfirm.hidden
      ? quitConfirm.querySelector<HTMLElement>("[data-testid=quit-feedback-text]")
      : !retreatConfirm.hidden
        ? retreatConfirm.querySelector<HTMLElement>("[data-testid=retreat-feedback-text]")
        : undefined;
    const feedbackText = resultFeedbackText ?? modalFeedbackText;
    const feedbackPortrait = feedbackText
      ?.closest<HTMLElement>(".native-feedback, .native-feedback-confirm")
      ?.querySelector<HTMLElement>(".animated-portrait") ?? undefined;
    const feedbackKey = controller.phase === "defeat"
      ? "defeat"
      : controller.phase === "victoryFeedback" || controller.phase === "savePrompt"
        ? "victory"
        : controller.quitConfirmOpen
          ? "quit-confirm"
          : controller.retreatConfirmOpen
            ? "retreat-confirm"
            : "";
    if (feedbackText && feedbackKey) {
      const fullText = feedbackText.dataset.fullText ?? "";
      if (controller.phase === "savePrompt") {
        stopFeedbackTimer();
        stopSpeaking(activeFeedbackPortrait);
        activeFeedbackKey = feedbackKey;
        feedbackFullText = fullText;
        feedbackRevealedCharacters = fullText.length;
        activeFeedbackText = feedbackText;
        activeFeedbackPortrait = feedbackPortrait;
        feedbackText.textContent = fullText;
      } else if (activeFeedbackKey !== feedbackKey || activeFeedbackText !== feedbackText) {
        revealFeedback(fullText, feedbackKey, feedbackText, feedbackPortrait);
      }
    } else {
      stopFeedbackTimer();
      stopSpeaking(activeFeedbackPortrait);
      activeFeedbackKey = "";
      feedbackFullText = "";
      feedbackRevealedCharacters = 0;
      activeFeedbackText = undefined;
      activeFeedbackPortrait = undefined;
    }
    renderCombat(combatPresentation, controller);
  };
  controller.onChange(render);
  render();
  configureGameScaling(required(root, "#game-viewport"), screen);
  bindGamepad(controller);
}

function fullSpriteAsset(sprite: FullCombatSpriteState): { src: string; meta: { w: number; anchor: number } } {
  const sideAssets = ASSETS.fullBattle[sprite.side];
  const frames = sprite.classId === 22
    ? sprite.set === "plus50" ? sideAssets.cavalryPlus50 : sideAssets.cavalryDirect
    : sprite.set === "plus50" ? sideAssets.soldierPlus50 : sideAssets.soldierDirect;
  const frame = Math.max(0, Math.min(frames.length - 1, sprite.frame));
  const meta = FULL_COMBAT_FRAME_META[sprite.side][sprite.classId === 22 ? 22 : 0][sprite.set][frame]
    ?? { w: 64, anchor: 32 };
  return { src: frames[frame], meta };
}

function buildFullCombatSkeleton(
  layer: HTMLElement,
  presentation: NonNullable<GameController["combatPresentation"]>,
): void {
  const { attacker, defender } = presentation;
  const leftUnit = attacker.side === 1 ? attacker : defender;
  const rightUnit = attacker.side === 2 ? attacker : defender;
  const statusPanel = (side: "left" | "right", unit: typeof attacker) => {
    const stats = statsFor(unit);
    const life = unit.id === attacker.id ? presentation.displayedAttackerLife : presentation.displayedDefenderLife;
    return `
      <div class="full-status ${side}" data-testid="full-${side}-status" hidden>
        <img src="${ASSETS.portraits[unit.portrait as keyof typeof ASSETS.portraits]}" alt="${unit.name}肖像" />
        <dl>
          <div><dt>經驗</dt><dd>${unit.experience}</dd></div>
          <div><dt>生命</dt><dd>${life}</dd></div>
          <div><dt>攻擊</dt><dd>${stats.attack}</dd></div>
          <div><dt>防禦</dt><dd>${stats.defense}</dd></div>
        </dl>
        <strong>${unit.className}／${unit.name}</strong>
      </div>`;
  };
  layer.innerHTML = `
    ${statusPanel("left", leftUnit)}
    ${statusPanel("right", rightUnit)}
    <div class="full-combat-window" data-testid="full-combat-window" hidden>
      <div class="full-combat-scene" data-testid="full-combat-scene" hidden>
        <div class="full-combat-backdrop">
          <img class="far" src="${ASSETS.fullBattle.stageBackground}" alt="" data-testid="full-combat-background" />
          <img class="far copy" src="${ASSETS.fullBattle.stageBackground}" alt="" />
          <img class="near" src="${ASSETS.fullBattle.stageBackground}" alt="" />
          <img class="near copy" src="${ASSETS.fullBattle.stageBackground}" alt="" />
        </div>
        <div class="full-combat-dust" aria-hidden="true"></div>
        <img class="full-combat-lance" alt="" hidden />
        <div class="full-combat-sprite slot-victim" hidden><img alt="" data-testid="full-victim-sprite" /></div>
        <div class="full-combat-sprite slot-actor" hidden><img alt="" data-testid="full-actor-sprite" /></div>
      </div>
      <div class="full-combat-strip" aria-hidden="true"><i></i></div>
      <b class="full-damage-number" data-testid="full-damage-number" hidden></b>
    </div>`;
}

function renderCombat(layer: HTMLElement, controller: GameController): void {
  const presentation = controller.combatPresentation;
  layer.hidden = !presentation;
  if (!presentation) {
    if (layer.dataset.fullBattleKey) {
      delete layer.dataset.fullBattleKey;
      layer.innerHTML = "";
      layer.className = "combat-presentation";
    }
    return;
  }
  const { attacker, defender } = presentation;
  if (controller.battlePresentation === "map" || !presentation.fullScene) {
    // Native map hit/death frames are rendered inside the Phaser world so
    // they obey the battle camera, clipping and board-erase boundary.
    layer.hidden = true;
    layer.innerHTML = "";
    delete layer.dataset.fullBattleKey;
    return;
  }
  const scene = presentation.fullScene;
  const battleKey = String(scene.battleKey);
  if (layer.dataset.fullBattleKey !== battleKey) {
    layer.className = "combat-presentation full-combat";
    layer.removeAttribute("style");
    buildFullCombatSkeleton(layer, presentation);
    layer.dataset.fullBattleKey = battleKey;
  }
  layer.dataset.fullCombatPhase = presentation.phase;
  const actorUnit = ["fullCounterWindup", "fullCounterCharge", "fullCounterImpact", "fullCounterHold", "fullAttackerDeath"]
    .includes(presentation.phase) ? defender : attacker;
  const leftUnit = attacker.side === 1 ? attacker : defender;
  const rightUnit = attacker.side === 2 ? attacker : defender;
  layer.dataset.fullLeftRecord = `M_00/${leftUnit.classId + (leftUnit.id === actorUnit.id ? 50 : 0)}`;
  layer.dataset.fullRightRecord = `Y_00/${rightUnit.classId + (rightUnit.id === actorUnit.id ? 50 : 0)}`;

  const query = <T extends HTMLElement>(selector: string): T => layer.querySelector(selector) as T;
  query<HTMLElement>(".full-status.left").hidden = !scene.showLeftPanel;
  query<HTMLElement>(".full-status.right").hidden = !scene.showRightPanel;
  const windowElement = query<HTMLElement>(".full-combat-window");
  windowElement.hidden = !scene.showWindow;
  const sceneElement = query<HTMLElement>(".full-combat-scene");
  sceneElement.hidden = !scene.showScene;
  if (!scene.showScene) return;

  const farOffset = ((scene.camera % 448) + 448) % 448;
  const nearOffset = ((scene.camera * 2 % 448) + 448) % 448;
  const backdrop = query<HTMLElement>(".full-combat-backdrop");
  backdrop.style.setProperty("--far-scroll", `${-farOffset}px`);
  backdrop.style.setProperty("--near-scroll", `${-nearOffset}px`);

  const slots: Array<{ selector: string; sprite?: FullCombatSpriteState }> = [
    { selector: ".full-combat-sprite.slot-victim", sprite: scene.sprites.find((entry) => entry.set === "direct") },
    { selector: ".full-combat-sprite.slot-actor", sprite: scene.sprites.find((entry) => entry.set === "plus50") },
  ];
  for (const { selector, sprite } of slots) {
    const holder = query<HTMLElement>(selector);
    const image = holder.querySelector("img") as HTMLImageElement;
    if (!sprite) {
      holder.hidden = true;
      continue;
    }
    const { src, meta } = fullSpriteAsset(sprite);
    holder.hidden = false;
    image.dataset.side = sprite.side;
    image.dataset.set = sprite.set;
    image.dataset.frame = String(sprite.frame);
    image.dataset.lift = String(sprite.lift);
    if (sprite.reaction) image.dataset.reaction = sprite.reaction;
    else delete image.dataset.reaction;
    if (image.getAttribute("src") !== src) image.setAttribute("src", src);
    const anchor = sprite.mirror ? meta.w - meta.anchor : meta.anchor;
    holder.style.transform = `translate(${Math.round(sprite.x - anchor)}px, ${-Math.round(sprite.lift)}px)`;
    holder.style.opacity = String(sprite.opacity);
    image.style.transform = sprite.mirror ? "scaleX(-1)" : "";
  }

  const lance = query<HTMLImageElement>(".full-combat-lance");
  if (scene.lance) {
    const frames = ASSETS.fullBattle[scene.lance.side].cavalryPlus50;
    const frame = Math.max(6, Math.min(8, scene.lance.frame));
    const meta = FULL_COMBAT_FRAME_META[scene.lance.side][22].plus50[frame];
    const src = frames[frame];
    lance.hidden = false;
    if (lance.getAttribute("src") !== src) lance.setAttribute("src", src);
    lance.style.transform = `translate(${Math.round(scene.lance.x - meta.anchor)}px, ${Math.round(scene.lance.y - 8)}px)`;
    lance.dataset.frame = String(frame);
  } else {
    lance.hidden = true;
    lance.removeAttribute("data-frame");
  }

  const dustLayer = query<HTMLElement>(".full-combat-dust");
  const needed = scene.dust.length;
  while (dustLayer.children.length < needed) {
    const puff = document.createElement("i");
    dustLayer.appendChild(puff);
  }
  for (let index = 0; index < dustLayer.children.length; index += 1) {
    const puff = dustLayer.children[index] as HTMLElement;
    const data = scene.dust[index];
    if (!data) {
      puff.hidden = true;
      continue;
    }
    puff.hidden = false;
    const scale = 0.5 + data.phase * 0.9;
    puff.style.transform = `translate(${Math.round(data.x)}px, ${Math.round(data.y - 8)}px) scale(${scale.toFixed(2)})`;
    puff.style.opacity = (0.85 * (1 - data.phase)).toFixed(2);
  }

  const damage = query<HTMLElement>(".full-damage-number");
  if (scene.damage) {
    damage.hidden = false;
    damage.textContent = `-${scene.damage.amount}`;
    damage.style.transform = `translateX(${Math.round(scene.damage.x - 48)}px)`;
  } else {
    damage.hidden = true;
  }
}

function renderSidePanelHotspots(): string {
  return implementedSidePanelHotspots().map((hotspot) => {
    const { minX, maxX, minY, maxY } = hotspot.bounds;
    return `<button
      class="side-panel-hotspot"
      style="--hotspot-left:${minX}px;--hotspot-top:${minY}px;--hotspot-width:${maxX - minX + 1}px;--hotspot-height:${maxY - minY + 1}px"
      data-side-panel-hotspot="${hotspot.id}"
      data-action="${hotspot.action}"
      data-testid="${hotspot.testId}"
      aria-label="${hotspot.label}"
      title="${hotspot.label}"
    ></button>`;
  }).join("");
}

function renderHud(unit: NonNullable<GameController["focusedUnit"]>, stats: UnitStats): string {
  const hpPercent = Math.max(0, Math.min(100, Math.floor(unit.life / stats.maxLife * 100)));
  const nextExperience = nextExperienceThresholdFor(unit);
  const expPercent = Math.max(0, Math.min(100, Math.floor(unit.experience * 100 / Math.max(1, nextExperience))));
  const side = unit.side === 1 ? "我方" : "敵方";
  const acted = unit.acted ? "已行動" : "可行動";
  return `
    <div class="unit-detail" data-testid="unit-detail" aria-label="${side}${acted}，${unit.className}${unit.name}">
      <div class="unit-detail-shade" aria-hidden="true"></div>
      ${animatedPortraitMarkup(unit.portrait, {
        alt: `${unit.name}肖像`,
        channel: "hud",
        className: "hud-portrait",
        wrapperTestId: "unit-portrait-composite",
        baseTestId: "unit-portrait",
      })}
      <div class="hud-identity"><b>${unit.className}／${unit.name}</b></div>
      <div class="meter-bar hp-bar" data-testid="hp-bar" aria-label="生命 ${unit.life}／${stats.maxLife}"><i style="height:${hpPercent}%"></i></div>
      <div class="meter-bar exp-bar" data-testid="exp-bar" aria-label="經驗 ${unit.experience}／${nextExperience}"><i style="height:${expPercent}%"></i></div>
      <div class="meter-labels" aria-hidden="true"><span>HP</span><span>EXP</span></div>
      <dl class="stat-list">
        <div><dt>生命</dt><dd>${unit.life}／${stats.maxLife}</dd></div>
        <div><dt>攻擊</dt><dd>${stats.attack}／${stats.attack}</dd></div>
        <div><dt>防禦</dt><dd>${stats.defense}／${stats.defense}</dd></div>
        <div><dt>等級</dt><dd>${stats.level}</dd></div>
        <div><dt>經驗</dt><dd>${unit.experience}／${nextExperience}</dd></div>
      </dl>
    </div>`;
}

function renderTactical(controller: GameController, underUnit = false): string {
  const markers = underUnit ? "" : controller.battle.units.map((unit) =>
    `<i class="minimap-unit side-${unit.side}" style="left:${unit.x * 3}px;top:${unit.y * 3}px" aria-hidden="true"></i>`,
  ).join("");
  const viewport = controller.cameraOrigin;
  return `
    <div class="hud-tactical${underUnit ? " under-unit" : ""}" data-testid="tactical-hud" aria-label="戰術輔助與即時小地圖">
      <img class="tactical-panel-art" src="${ASSETS.tacticalPanel}" alt="戰術桌、卷軸與照明器具" />
      <div class="tactical-minimap" data-testid="tactical-minimap" aria-label="第 0 關即時小地圖">
        <img src="${ASSETS.minimap}" alt="" />
        ${underUnit ? "" : `<span class="minimap-viewport" style="left:${viewport.x * 3}px;top:${viewport.y * 3}px" aria-hidden="true"></span>`}
        ${underUnit ? "" : `<span class="minimap-preview" data-testid="minimap-preview" aria-hidden="true" hidden></span>`}
        ${markers}
      </div>
    </div>`;
}

function renderResult(layer: HTMLElement, controller: GameController): void {
  const phase = controller.phase;
  layer.hidden = !["defeat", "victoryFeedback", "savePrompt", "saveSlots", "quit", "nextStage"].includes(phase);
  if (layer.hidden) return;
  if (phase === "defeat") {
    const text = "啊！．．．竟然失敗了？\n我太低辜敵人的實力，再給我一次機會吧！";
    layer.innerHTML = nativeFeedbackMarkup(text, "retry", "retry-button");
  } else if (phase === "victoryFeedback") {
    const text = "哦！．．\n這次的戰役結束了，是否要記錄下來．";
    layer.innerHTML = nativeFeedbackMarkup(text, "victory-continue", "victory-continue");
  } else if (phase === "savePrompt") {
    const text = "哦！．．\n這次的戰役結束了，是否要記錄下來．";
    layer.innerHTML = `${nativeFeedbackMarkup(text)}
      <div class="native-confirm-menu" role="menu" aria-label="是否儲存">
        <button data-action="save-yes" data-testid="save-yes" class="${controller.savePromptIndex === 0 ? "is-selected" : ""}">確 定</button>
        <button data-action="save-no" class="${controller.savePromptIndex === 1 ? "is-selected" : ""}">取 消</button>
      </div>`;
  } else if (phase === "saveSlots") {
    const slots = Array.from({ length: 5 }, (_, index) => {
      const slot = index + 1;
      const save = controller.readSave(slot);
      const selected = index === controller.postSaveSlotIndex;
      return `<button class="save-slot ${selected ? "is-selected" : ""}" data-action="save-slot" data-slot="${slot}" data-post-save-index="${index}" data-testid="save-slot-${slot}" aria-current="${selected ? "true" : "false"}"><b>${slot}</b><span>${save ? save.stageLabel : "此處沒有記錄"}</span></button>`;
    }).join("");
    layer.innerHTML = `<div class="native-save-selector"><strong>儲存遊戲進度</strong>${slots}</div>`;
  } else if (phase === "quit") {
    layer.innerHTML = `<div class="quit-screen" data-testid="quit-screen"><h2>天使帝國 II</h2><p>已離開遊戲</p></div>`;
  } else if (phase === "nextStage") {
    layer.innerHTML = `<div class="modal-panel result-card next-card"><span class="panel-kicker">STAGE 01</span><h2>下一關路由已建立</h2><p>第 0 關垂直切片到此完成；存檔已指向第 1 關關前流程。後續關卡不屬於本切片的實作範圍。</p><div class="completion-seal">垂直切片完成</div></div>`;
  }
}

function nativeFeedbackMarkup(text: string, action?: string, testId?: string): string {
  const escapedText = text.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<div class="native-feedback" data-testid="native-feedback">
    ${animatedPortraitMarkup(46, {
      alt: "妮雅肖像",
      channel: "outcome-feedback",
      className: "feedback-portrait",
      wrapperTestId: "feedback-portrait",
    })}
    <div class="native-feedback-copy"><p data-testid="feedback-text" data-full-text="${escapedText}"></p><span>▼</span></div>
    ${action ? `<button class="feedback-primary" data-action="${action}" ${testId ? `data-testid="${testId}"` : ""} aria-label="繼續"></button>` : ""}
  </div>`;
}

function required<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`missing UI element ${selector}`);
  return element;
}

function bindGamepad(controller: GameController): void {
  let priorButtons: boolean[] = [];
  let lastNavigation = 0;
  const poll = (time: number) => {
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const pressed = pad.buttons.map((button) => button.pressed);
      if (pressed[0] && !priorButtons[0]) controller.primaryAtCursor();
      if (pressed[1] && !priorButtons[1]) controller.secondaryAction();
      if (pressed[4] && !priorButtons[4]) controller.openObjectives();
      if (pressed[9] && !priorButtons[9]) controller.openGroupCommands();
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      if (time - lastNavigation > 150) {
        if (x < -0.6) { controller.moveCursor({ x: -1, y: 0 }); lastNavigation = time; }
        else if (x > 0.6) { controller.moveCursor({ x: 1, y: 0 }); lastNavigation = time; }
        else if (y < -0.6) { controller.moveCursor({ x: 0, y: -1 }); lastNavigation = time; }
        else if (y > 0.6) { controller.moveCursor({ x: 0, y: 1 }); lastNavigation = time; }
      }
      priorButtons = pressed;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}
