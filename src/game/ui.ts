import { ASSETS, nextExperienceThresholdFor } from "./content/stage0";
import {
  DIALOGUE_PORTRAIT_FRAME_ASSETS,
  DIALOGUE_TEXT_WINDOW_ASSET,
  STORY_BACKDROP_ASSET,
  PORTRAIT_CATALOG,
  portraitSourceFor,
} from "./content/portrait-catalog.generated";
import { BATTLE_ACTION_DEFINITIONS } from "./content/actions";
import {
  STAGE0_FULL_COMBAT_ASSETS,
  STAGE0_FULL_COMBAT_COMMON_EFFECTS,
} from "./content/stage0-actions.generated";
import {
  classDefinition,
  classIdFromNativeRecord,
  classStatsFor,
  unitDisplayName,
  usesClassIdentity,
} from "./content/classes";
import { allyMapUnitAsset } from "./content/map-unit-assets";
import { TECHNIQUE_LAB_UNIT_ASSETS } from "./content/technique-lab.generated";
import { classTraitsFor } from "./content/class-traits";
import { fullCombatBackgroundAsset } from "./content/full-combat-backgrounds";
import { activeUnitStatusPresentations } from "./content/status-presentations";
import type { CombatPresentation, GameController } from "./controller";
import {
  FULL_COMBAT_FRAME_META,
  type FullCombatSpriteState,
} from "./full-combat";
import { applyFullCombatAtlasFrame } from "./full-combat-atlas";
import { fullCombatImageSource } from "./full-combat-image-cache";
import type { BattleUnit, DialoguePage, UnitClassId, UnitStats } from "./types";
import type { TerrainInspection } from "./terrain-inspection";
import type { AudioManager } from "./audio";
import { renderNativeDialogueText } from "./dialogue-text";
import {
  finishDialogueWindowClose,
  isDialogueWindowClosing,
  setDialogueWindowOpen,
} from "./dialogue-window-animation";
import { finishMenuClose, setMenuOpen } from "./menu-animation";
import {
  isKeyboardCancel,
  isKeyboardConfirm,
  keyboardDirection,
} from "./input-bindings";
import {
  createNativeTextLayer,
  type NativeUnitDetailText,
} from "./native-hud-text";
import { NATIVE_CONCEALED_FIELD, nativeNumericField } from "./native-text";
import {
  createMenuPointerGlide,
  NATIVE_GLIDE_FRAME_MS,
  NATIVE_MENU_POINTER_OFFSET,
  type PointerPosition,
} from "./menu-pointer-glide";
import {
  animatedPortraitMarkup,
  configureAnimatedPortrait,
  nativeMouthFrameAfterGlyph,
  nativeStoryGlyphMovesMouth,
  startPortraitAnimations,
} from "./portrait";
import {
  configureGameScaling,
  LOGICAL_SCREEN_HEIGHT,
  LOGICAL_SCREEN_WIDTH,
} from "./scaling";
import {
  implementedSidePanelHotspots,
  SIDE_PANEL_TOGGLE_VISUALS,
  type SidePanelToggleVisualId,
} from "./side-panel";
import {
  SAVE_SLOT_PAGE_COUNT,
  SAVE_SLOTS_PER_PAGE,
  saveSlotPageIndex,
  saveSlotPageStart,
} from "./save";
import {
  mountRecordSaveBackupUi,
  RECORD_SAVE_BACKUP_CONFIRM_MARKUP,
  type SaveBackupUi,
} from "./save-backup-ui";
import { DIFFICULTY_OPTIONS } from "./content/startup";

const promotionImageByClass: Readonly<Partial<Record<UnitClassId, string>>> =
  ASSETS.allyPromotionTargets;
// 原生表現資源以 CSS 變數掛在邏輯螢幕上，樣式表只引用變數、不硬寫資產路徑。
const nativePresentationAssetStyle = [
  `--dialogue-portrait-frame-top:url('${DIALOGUE_PORTRAIT_FRAME_ASSETS.top}')`,
  `--dialogue-portrait-frame-nameplate:url('${DIALOGUE_PORTRAIT_FRAME_ASSETS.nameplate}')`,
  `--dialogue-portrait-frame-side:url('${DIALOGUE_PORTRAIT_FRAME_ASSETS.side}')`,
  `--dialogue-text-window:url('${DIALOGUE_TEXT_WINDOW_ASSET}')`,
  `--story-backdrop:url('${STORY_BACKDROP_ASSET}')`,
].join(";");
const niaPortraitDisplayName = (PORTRAIT_CATALOG[46].displayName ?? "妮雅").trim();

export interface CombatPresentationRenderSource {
  battlePresentation: "map" | "full";
  combatPresentation?: CombatPresentation;
  unitStats: (unit: BattleUnit) => UnitStats;
}

export function mountUi(root: HTMLElement, controller: GameController, audio: AudioManager): () => void {
  const stage = controller.battle.stage;
  const stageAssets = controller.currentStageAssets;
  const eventController = new AbortController();
  root.innerHTML = `
    <div class="page-shell">
      <div class="game-stage">
        <div class="game-viewport" id="game-viewport">
          <section class="logical-screen" id="logical-screen" data-testid="game-screen"
            style="${nativePresentationAssetStyle}" aria-label="天使帝國 II ${stage.name}遊戲畫面">
            <div class="battle-backdrop" aria-hidden="true"></div>
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
            <div class="bottom-location">${stage.name}</div>
            <div class="bottom-round" id="bottom-round">
              <img src="${ASSETS.sidePanelChrome.round}" alt="" aria-hidden="true" />
              <span id="bottom-round-text"></span>
            </div>
            ${renderSidePanelHotspots()}
            <div class="side-panel-tooltip" id="side-panel-tooltip" data-testid="side-panel-tooltip"
              role="tooltip" aria-live="polite" hidden></div>
            <section class="system-menu action-menu native-command-menu" id="system-menu" data-testid="system-menu"
              data-kind="system" role="menu" aria-label="戰鬥系統選單" hidden></section>
            <section class="settings-menu native-settings-menu" id="settings-menu" data-testid="settings-menu"
              role="menu" aria-label="子 選 單" hidden></section>
            <section class="sound-settings-menu modal-panel" id="sound-settings-menu"
              data-testid="sound-settings-menu" role="dialog" aria-label="音效開關" hidden>
              <span class="panel-kicker">SOUND</span><h2>音效開關</h2>
              <div class="sound-volume-control">
                <span class="sound-volume-label" id="sound-volume-label">音效音量</span>
                <div class="sound-volume-list" role="radiogroup" aria-labelledby="sound-volume-label">
                  ${["無聲", "1", "2", "3", "最大"].map((label, level) =>
                    `<button role="radio" data-action="sound-effect-volume" data-sound-effect-level="${level}"
                      data-testid="sound-effect-volume-${level}" aria-label="音效音量 ${label}">${label}</button>`).join("")}
                </div>
              </div>
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
            <section class="record-menu record-panel" id="record-menu" data-testid="record-menu" role="menu" aria-label="戰役記錄" hidden></section>
            ${RECORD_SAVE_BACKUP_CONFIRM_MARKUP}
            <section class="quit-confirm native-feedback-confirm" id="quit-confirm" data-testid="quit-confirm" role="dialog" aria-label="離開遊戲確認" hidden>
              ${animatedPortraitMarkup(46, {
                alt: "妮雅肖像",
                channel: "quit-feedback",
                className: "feedback-portrait",
              })}
              <b class="feedback-portrait-name" data-testid="feedback-portrait-name"
                aria-hidden="true">${niaPortraitDisplayName}</b>
              <div class="dialogue-copy native-feedback-copy"><p data-testid="quit-feedback-text" data-full-text="唉啊！．．．要休息了嗎？&#10;請再考慮一下吧！">唉啊！．．．要休息了嗎？
請再考慮一下吧！</p></div>
              <div class="button-row action-menu native-command-menu native-confirm-menu"
                data-testid="quit-confirm-menu" data-kind="confirmation" role="menu" aria-label="離開遊戲選擇">
                <button type="button" role="menuitem" data-action="quit-confirm" data-quit-index="0"><span class="native-command-label">確 定</span></button>
                <button type="button" role="menuitem" data-action="quit-cancel" data-quit-index="1"><span class="native-command-label">取 消</span></button>
              </div>
            </section>
            <section class="group-command-menu action-menu native-command-menu" id="group-command-menu" data-testid="group-command-menu" role="menu" aria-label="集體命令" hidden></section>
            <section class="retreat-confirm native-feedback-confirm" id="retreat-confirm" data-testid="retreat-confirm" role="dialog" aria-label="全面撤退確認" hidden>
              ${animatedPortraitMarkup(46, {
                alt: "妮雅肖像",
                channel: "retreat-feedback",
                className: "feedback-portrait",
              })}
              <b class="feedback-portrait-name" data-testid="feedback-portrait-name"
                aria-hidden="true">${niaPortraitDisplayName}</b>
              <div class="dialogue-copy native-feedback-copy"><p data-testid="retreat-feedback-text" data-full-text="哦！．．．要撤退嗎？&#10;必竟是沒辦法的事，雙方的實力差太多了．">哦！．．．要撤退嗎？
必竟是沒辦法的事，雙方的實力差太多了．</p></div>
              <div class="button-row action-menu native-command-menu native-confirm-menu"
                data-testid="retreat-confirm-menu" data-kind="confirmation" role="menu" aria-label="全面撤退選擇">
                <button type="button" role="menuitem" data-action="retreat-confirm" data-retreat-index="0"><span class="native-command-label">確 定</span></button>
                <button type="button" role="menuitem" data-action="retreat-cancel" data-retreat-index="1"><span class="native-command-label">取 消</span></button>
              </div>
            </section>
            <div class="action-menu native-command-menu" id="action-menu" data-testid="action-menu" role="menu" aria-label="單位行動" hidden></div>
            <span class="command-menu-pointer" id="command-menu-pointer"
              data-testid="command-menu-pointer" aria-hidden="true" hidden></span>
            <div class="status-strip" id="status-strip" data-testid="status-strip" aria-live="polite"></div>
            <section class="combat-presentation" id="combat-presentation" data-testid="combat-presentation" hidden></section>
            <section class="promotion-layer" id="promotion-layer" data-testid="promotion-layer"
              role="dialog" aria-modal="true" aria-label="選擇轉職" hidden></section>
            <section class="dialogue-layer" id="dialogue-layer" data-testid="dialogue-layer" hidden>
              <div class="dialogue-box upper" id="dialogue-box-upper" data-testid="dialogue-window-upper" hidden>
                <span class="animated-portrait dialogue-portrait" id="dialogue-portrait-upper"
                  data-portrait-channel="dialogue-upper" data-blink-frame="1" data-blink-count="0" hidden></span>
                <b class="dialogue-portrait-name" id="dialogue-portrait-name-upper"
                  aria-hidden="true" hidden></b>
                <div class="dialogue-copy" id="dialogue-copy-upper">
                  <b class="dialogue-speaker" id="dialogue-speaker-upper"></b>
                  <p id="dialogue-text-upper"></p><span class="continue-mark">▼</span>
                </div>
              </div>
              <div class="dialogue-box lower" id="dialogue-box-lower" data-testid="dialogue-window-lower" hidden>
                <span class="animated-portrait dialogue-portrait" id="dialogue-portrait-lower"
                  data-portrait-channel="dialogue-lower" data-blink-frame="1" data-blink-count="0" hidden></span>
                <b class="dialogue-portrait-name" id="dialogue-portrait-name-lower"
                  aria-hidden="true" hidden></b>
                <div class="dialogue-copy" id="dialogue-copy-lower">
                  <b class="dialogue-speaker" id="dialogue-speaker-lower"></b>
                  <p id="dialogue-text-lower"></p><span class="continue-mark">▼</span>
                </div>
              </div>
              <section class="dialogue-skip-confirm" id="dialogue-skip-confirm"
                data-testid="dialogue-skip-confirm" role="dialog" aria-modal="true"
                aria-labelledby="dialogue-skip-question" hidden>
                <p class="dialogue-skip-question" id="dialogue-skip-question">是否跳過劇情對話？</p>
                <div class="action-menu native-command-menu dialogue-skip-menu"
                  role="menu" aria-label="跳過劇情對話選擇">
                  <button type="button" role="menuitem" data-action="dialogue-skip-confirm"
                    data-dialogue-skip-index="0" data-testid="dialogue-skip-yes"><span class="native-command-label">是</span></button>
                  <button type="button" role="menuitem" data-action="dialogue-skip-cancel"
                    data-dialogue-skip-index="1" data-testid="dialogue-skip-no"><span class="native-command-label">否</span></button>
                </div>
              </section>
            </section>
            <section class="objective-panel modal-panel" id="objective-panel" data-testid="objective-panel" hidden>
              <span class="panel-kicker">${stage.name}</span>
              <h2>勝利條件</h2><p>${stage.objective.victoryText}</p>
              <h2>失敗條件</h2><p>${stage.objective.defeatText}</p>
              <p data-testid="objective-round-limit"></p>
              ${controller.deploymentGuidance
                ? `<h2>出擊提示</h2><p data-testid="objective-guidance">${controller.deploymentGuidance}</p>`
                : ""}
              <button data-action="close-objectives">返回戰場</button>
            </section>
            <section class="result-layer" id="result-layer" data-testid="result-layer" hidden></section>
          </section>
        </div>
      </div>
    </div>`;

  const screen = required(root, "#logical-screen");
  // Appended last so it stacks over the panel chrome at the same z-index while
  // every overlay above z-index 7 still covers it.
  const nativeText = createNativeTextLayer();
  screen.append(nativeText.element);
  const hud = required(root, "#unit-hud");
  const round = required(root, "#bottom-round-text");
  const actionMenu = required(root, "#action-menu");
  const status = required(root, "#status-strip");
  const combatPresentation = required(root, "#combat-presentation");
  const promotionLayer = required(root, "#promotion-layer");
  const dialogueLayer = required(root, "#dialogue-layer");
  const dialogueWindows = {
    upper: {
      box: required(root, "#dialogue-box-upper"),
      copy: required(root, "#dialogue-copy-upper"),
      portrait: required(root, "#dialogue-portrait-upper"),
      portraitName: required(root, "#dialogue-portrait-name-upper"),
      speaker: required(root, "#dialogue-speaker-upper"),
      text: required(root, "#dialogue-text-upper"),
    },
    lower: {
      box: required(root, "#dialogue-box-lower"),
      copy: required(root, "#dialogue-copy-lower"),
      portrait: required(root, "#dialogue-portrait-lower"),
      portraitName: required(root, "#dialogue-portrait-name-lower"),
      speaker: required(root, "#dialogue-speaker-lower"),
      text: required(root, "#dialogue-text-lower"),
    },
  };
  const dialogueSkipConfirm = required(root, "#dialogue-skip-confirm");
  const storyBackground = required(root, "#story-background");
  const defaultStoryBackgroundSource = stageAssets?.storyBackground ?? ASSETS.storyBackground;
  storyBackground.style.setProperty("--story-illustration", `url("${defaultStoryBackgroundSource}")`);
  const objectivePanel = required(root, "#objective-panel");
  const objectiveRoundLimit = required(root, "[data-testid=objective-round-limit]");
  const roundBox = required(root, "#bottom-round");
  const systemMenu = required(root, "#system-menu");
  const settingsMenu = required(root, "#settings-menu");
  const soundSettingsMenu = required(root, "#sound-settings-menu");
  const musicSettingsMenu = required(root, "#music-settings-menu");
  const sidePanelTooltip = required(root, "#side-panel-tooltip");
  const recordMenu = required(root, "#record-menu");
  let recordBackupStatus = "";
  let recordBackupUi: SaveBackupUi;
  const quitConfirm = required(root, "#quit-confirm");
  const groupCommandMenu = required(root, "#group-command-menu");
  const retreatConfirm = required(root, "#retreat-confirm");
  const resultLayer = required(root, "#result-layer");
  const commandMenuPointer = required(root, "#command-menu-pointer");
  /**
   * 原生開選單前先把指標滑到第一行（`0000:566A` → `0000:57C5`），滑完才畫外框。
   * 瀏覽器不能移動宿主指標；若這次是鼠標／觸控開選單，虛擬手形滑走只會錯誤暗示真實
   * 指標也被移動，因此直接顯示選單。鍵盤／手把開啟且畫面內已有可用指標位置時，才由手形
   * 精靈保留這段原版節奏。
   */
  let commandMenuGliding = false;
  let commandMenuWasOpen = false;
  let lastScreenPointer: PointerPosition | undefined;
  let lastInputSource: "pointer" | "keyboard-or-gamepad" = "keyboard-or-gamepad";
  const menuPointerGlide = createMenuPointerGlide({
    screen,
    sprite: commandMenuPointer,
    frameMs: () => controller.isTestMode
      ? 1
      : controller.presentationFast
        ? NATIVE_GLIDE_FRAME_MS / 3.2
        : NATIVE_GLIDE_FRAME_MS,
    onSettled: () => {
      commandMenuGliding = false;
      render();
    },
  });
  const trackScreenPointer = (event: PointerEvent) => {
    if (!(event.target as Element | null)?.closest("#logical-screen")) return;
    const bounds = screen.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    lastScreenPointer = {
      x: (event.clientX - bounds.left) * LOGICAL_SCREEN_WIDTH / bounds.width,
      y: (event.clientY - bounds.top) * LOGICAL_SCREEN_HEIGHT / bounds.height,
    };
  };
  /** 玩家在滑行途中操作時直接跳到終點：演出不能擋住輸入。 */
  const settleMenuPointerGlide = () => {
    if (commandMenuGliding) menuPointerGlide.settle();
  };
  const startCommandMenuGlide = (position: PointerPosition): boolean => {
    // 指標啟動時必須保留真實位置；鍵盤或手把啟動若沒有已知起點也直接開選單。
    if (lastInputSource === "pointer" || !lastScreenPointer) return false;
    return menuPointerGlide.start(lastScreenPointer, {
      x: position.x + NATIVE_MENU_POINTER_OFFSET.x,
      y: position.y + NATIVE_MENU_POINTER_OFFSET.y,
    });
  };
  // 收合動畫會讓選單比控制器狀態多留在 DOM 一小段時間；卸載時必須立刻結清，
  // 否則等待中的收尾回呼會作用在已被替換的畫面上。
  const animatedMenus = [
    actionMenu,
    objectivePanel,
    systemMenu,
    settingsMenu,
    soundSettingsMenu,
    musicSettingsMenu,
    recordMenu,
    quitConfirm,
    groupCommandMenu,
    retreatConfirm,
    dialogueSkipConfirm,
  ];
  let dialogueTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let dialogueAdvanceTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
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
  let sidePanelHintTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let sidePanelHintTarget: HTMLElement | undefined;
  const stopPortraitAnimations = startPortraitAnimations(
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
    if (dialogueAdvanceTimer !== undefined) globalThis.clearTimeout(dialogueAdvanceTimer);
    dialogueTimer = undefined;
    dialogueAdvanceTimer = undefined;
  };
  const scheduleAutomaticDialogueAdvance = (key: string) => {
    if (!controller.promotionDialogueActive && !controller.groupCommandDialogueActive) return;
    const delay = controller.groupCommandDialogueActive && controller.isTestMode
      ? 1_200
      : controller.isTestMode
        ? 100
        : controller.presentationFast
          ? 80
          : 160;
    dialogueAdvanceTimer = globalThis.setTimeout(() => {
      dialogueAdvanceTimer = undefined;
      if (
        activeDialogueKey === key
        && (controller.promotionDialogueActive || controller.groupCommandDialogueActive)
      ) {
        controller.advanceDialogue();
      }
    }, delay);
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
    renderNativeDialogueText(target, fullText.slice(0, revealedCharacters));
    startSpeaking(activeDialoguePortrait, revealedCharacters < dialogueFullText.length);
    const tick = () => {
      if (activeDialogueKey !== key || activeDialogueText !== target || revealedCharacters >= dialogueFullText.length) {
        stopSpeaking(activeDialoguePortrait);
        dialogueTimer = undefined;
        if (activeDialogueKey === key) scheduleAutomaticDialogueAdvance(key);
        return;
      }
      const character = dialogueFullText[revealedCharacters];
      revealedCharacters += 1;
      renderNativeDialogueText(target, dialogueFullText.slice(0, revealedCharacters));
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
    renderNativeDialogueText(activeDialogueText, dialogueFullText);
    stopSpeaking(activeDialoguePortrait);
    if (controller.groupCommandDialogueActive) scheduleAutomaticDialogueAdvance(activeDialogueKey);
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
    renderNativeDialogueText(target, "");
    startSpeaking(activeFeedbackPortrait, fullText.length > 0);
    const tick = () => {
      if (activeFeedbackKey !== key || activeFeedbackText !== target || feedbackRevealedCharacters >= fullText.length) {
        stopSpeaking(activeFeedbackPortrait);
        feedbackTimer = undefined;
        return;
      }
      const character = fullText[feedbackRevealedCharacters];
      feedbackRevealedCharacters += 1;
      renderNativeDialogueText(target, fullText.slice(0, feedbackRevealedCharacters));
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
    renderNativeDialogueText(activeFeedbackText, feedbackFullText);
    stopSpeaking(activeFeedbackPortrait);
    return true;
  };

  const hideSidePanelHint = () => {
    if (sidePanelHintTimer !== undefined) globalThis.clearTimeout(sidePanelHintTimer);
    sidePanelHintTimer = undefined;
    sidePanelHintTarget = undefined;
    sidePanelTooltip.hidden = true;
    sidePanelTooltip.textContent = "";
    screen.dataset.sidePanelHint = "hidden";
  };
  const showSidePanelHint = (button: HTMLElement) => {
    if (screen.dataset.sidePanelHotspots !== "active" || button.offsetParent === null) return;
    sidePanelHintTarget = button;
    sidePanelTooltip.textContent = button.getAttribute("aria-label") ?? "";
    sidePanelTooltip.hidden = false;
    screen.dataset.sidePanelHint = "visible";
  };
  const scheduleSidePanelHint = (button: HTMLElement) => {
    hideSidePanelHint();
    sidePanelHintTarget = button;
    sidePanelHintTimer = globalThis.setTimeout(() => {
      sidePanelHintTimer = undefined;
      if (sidePanelHintTarget === button) showSidePanelHint(button);
    }, 450);
  };

  root.addEventListener("pointerover", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-side-panel-hotspot]");
    if (!button || (event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) return;
    scheduleSidePanelHint(button);
  }, { signal: eventController.signal });
  root.addEventListener("pointerout", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-side-panel-hotspot]");
    if (!button || (event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) return;
    if (sidePanelHintTarget === button) hideSidePanelHint();
  }, { signal: eventController.signal });
  root.addEventListener("focusin", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-side-panel-hotspot]");
    if (button) showSidePanelHint(button);
  }, { signal: eventController.signal });
  root.addEventListener("focusout", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-side-panel-hotspot]");
    if (button && sidePanelHintTarget === button) hideSidePanelHint();
  }, { signal: eventController.signal });

  root.addEventListener("click", (event) => {
    const minimap = (event.target as Element).closest<HTMLElement>("[data-testid=tactical-minimap]");
    if (minimap) {
      controller.commitMinimapPreview();
      return;
    }
    const button = (event.target as Element).closest<HTMLElement>("[data-action]");
    if (!button) {
      if ((event.target as Element).closest("#dialogue-layer")) {
        if (!controller.dialogueSkipConfirmOpen && !finishDialogueTyping()) {
          controller.advanceDialogue();
        }
      } else if ((event.target as Element).closest("#result-layer")) {
        if (!finishFeedbackTyping()) controller.primaryAtCursor();
      }
      return;
    }
    if (recordBackupUi.handleClick(button)) return;
    if (button.matches("[data-side-panel-hotspot]")) hideSidePanelHint();
    if (button.dataset.settingsIndex !== undefined) {
      controller.selectSettingsMenuItem(Number(button.dataset.settingsIndex));
    }
    const action = button.dataset.action;
    if (action === "dialogue-skip-confirm") controller.confirmDialogueSkip();
    else if (action === "dialogue-skip-cancel") controller.cancelDialogueSkip();
    else if (action === "open-system-menu") controller.openSystemMenu();
    else if (action === "close-system-menu") controller.closeSystemMenu();
    else if (action === "system-settings") controller.openSettings();
    else if (action === "system-load") controller.openRecordMenu("load");
    else if (action === "system-save") controller.openRecordMenu("save");
    else if (action === "system-quit") controller.requestQuit();
    else if (action === "open-sound-settings") controller.openSoundSettings();
    else if (action === "close-sound-settings") controller.closeSoundSettings();
    else if (action === "toggle-sound-speech") controller.toggleSpeechSound();
    else if (action === "toggle-sound-movement") controller.toggleMovementSound();
    else if (action === "toggle-sound-combat") controller.toggleCombatSound();
    else if (action === "toggle-sound-key") controller.toggleKeySound();
    else if (action === "sound-effect-volume") {
      controller.setSoundEffectVolume(Number(button.dataset.soundEffectLevel));
    }
    else if (action === "open-music-settings") controller.openMusicSettings();
    else if (action === "close-music-settings") controller.closeMusicSettings();
    else if (action === "close-terrain-inspection") controller.closeTerrainInspection();
    else if (action === "music-volume") controller.setMusicVolume(Number(button.dataset.musicLevel));
    else if (action === "record-slot") {
      controller.selectRecordMenuSlot(Number(button.dataset.recordIndex));
      controller.activateRecordMenuSelection();
    }
    else if (action === "record-page") {
      controller.moveRecordMenuPage(Number(button.dataset.recordPageDelta));
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
    else if (action === "battle-presentation") controller.toggleBattlePresentation();
    else if (action === "toggle-grid") controller.toggleGrid();
    else if (action === "toggle-edge-scroll") controller.toggleEdgeScroll();
    else if (action === "toggle-portraits") controller.togglePortraits();
    else if (action === "toggle-ai-dialogue") controller.toggleAiDialogue();
    else if (action === "move") controller.chooseMove();
    else if (action === "attack") controller.chooseAttack();
    else if (action === "shoot") controller.chooseShoot();
    else if (action === "technique") controller.chooseTechnique();
    else if (action === "technique-action") {
      controller.selectTechnique(Number(button.dataset.techniqueIndex));
      controller.activateTechniqueSelection();
    }
    else if (action === "rest") controller.chooseRest();
    else if (action === "end-unit") controller.chooseEnd();
    else if (action === "undo-move") controller.chooseUndo();
    else if (action === "promotion-target") {
      controller.selectPromotionTarget(Number(button.dataset.promotionIndex));
      controller.confirmPromotion();
    }
    else if (action === "retry") {
      if (!finishFeedbackTyping()) controller.retry();
    }
    else if (action === "victory-continue") {
      if (!finishFeedbackTyping()) controller.continueAfterVictory();
    }
    else if (action === "save-yes") controller.showSaveSlots();
    else if (action === "save-no") controller.skipSave();
    else if (action === "save-slot") controller.selectSaveSlot(Number(button.dataset.slot));
    else if (action === "post-save-page") {
      controller.movePostSaveSlotPage(Number(button.dataset.postSavePageDelta));
    }
    else if (action === "overwrite-confirm") controller.confirmOverwrite();
    else if (action === "overwrite-cancel") controller.cancelOverwrite();
    else if (action === "start-stage49-ending") controller.beginStage49Ending();
  }, { signal: eventController.signal });

  root.addEventListener("wheel", (event) => {
    if (controller.actionMode !== "shotRoute" || event.deltaY === 0) return;
    event.preventDefault();
    controller.cycleMagicArcherRoute(event.deltaY > 0 ? 1 : -1);
  }, { signal: eventController.signal, passive: false });

  root.addEventListener("pointermove", (event) => {
    trackScreenPointer(event);
    const recordBackupButton = (event.target as Element).closest<HTMLElement>(
      "[data-action^=record-backup]",
    );
    if (recordBackupButton && recordBackupUi.handlePointerOver(recordBackupButton)) return;
    const command = (event.target as Element).closest<HTMLElement>("[data-command-index]");
    if (command) controller.selectCommand(Number(command.dataset.commandIndex));
    const technique = (event.target as Element).closest<HTMLElement>("[data-technique-index]");
    if (technique) controller.selectTechnique(Number(technique.dataset.techniqueIndex));
    const groupCommand = (event.target as Element).closest<HTMLElement>("[data-group-command-index]");
    if (groupCommand) controller.selectGroupCommand(Number(groupCommand.dataset.groupCommandIndex));
    const retreatChoice = (event.target as Element).closest<HTMLElement>("[data-retreat-index]");
    if (retreatChoice) controller.selectRetreatChoice(Number(retreatChoice.dataset.retreatIndex));
    const systemCommand = (event.target as Element).closest<HTMLElement>("[data-system-index]");
    if (systemCommand) controller.selectSystemMenuCommand(Number(systemCommand.dataset.systemIndex));
    const settingsCommand = (event.target as Element).closest<HTMLElement>("[data-settings-index]");
    if (settingsCommand) controller.selectSettingsMenuItem(Number(settingsCommand.dataset.settingsIndex));
    const recordSlot = (event.target as Element).closest<HTMLElement>("[data-record-index]");
    if (recordSlot) controller.selectRecordMenuSlot(Number(recordSlot.dataset.recordIndex));
    const quitChoice = (event.target as Element).closest<HTMLElement>("[data-quit-index]");
    if (quitChoice) controller.selectQuitChoice(Number(quitChoice.dataset.quitIndex));
    const dialogueSkipChoice = (event.target as Element).closest<HTMLElement>("[data-dialogue-skip-index]");
    if (dialogueSkipChoice) {
      controller.selectDialogueSkipChoice(Number(dialogueSkipChoice.dataset.dialogueSkipIndex));
    }
    const savePromptChoice = (event.target as Element).closest<HTMLElement>("[data-save-prompt-index]");
    if (savePromptChoice) {
      controller.selectSavePromptChoice(Number(savePromptChoice.dataset.savePromptIndex));
    }
    const postSaveSlot = (event.target as Element).closest<HTMLElement>("[data-post-save-index]");
    if (postSaveSlot) controller.selectPostSaveSlot(Number(postSaveSlot.dataset.postSaveIndex));
    const promotionTarget = (event.target as Element).closest<HTMLElement>("[data-promotion-index]");
    if (promotionTarget) controller.selectPromotionTarget(Number(promotionTarget.dataset.promotionIndex));
    const minimap = (event.target as Element).closest<HTMLElement>("[data-testid=tactical-minimap]");
    if (!minimap) {
      if (controller.minimapPreviewOrigin) controller.clearMinimapPreview();
      return;
    }
    const bounds = minimap.getBoundingClientRect();
    const cell = {
      x: Math.max(0, Math.min(stage.width - 1, Math.floor((event.clientX - bounds.left) * stage.width / bounds.width))),
      y: Math.max(0, Math.min(stage.height - 1, Math.floor((event.clientY - bounds.top) * stage.height / bounds.height))),
    };
    const origin = controller.previewMinimapCell(cell);
    const preview = minimap.querySelector<HTMLElement>("[data-testid=minimap-preview]");
    if (!preview || !origin) return;
    preview.hidden = false;
    preview.style.left = `${origin.x * 3}px`;
    preview.style.top = `${origin.y * 3}px`;
  }, { signal: eventController.signal });

  root.addEventListener("pointerout", (event) => {
    const minimap = (event.target as Element).closest<HTMLElement>("[data-testid=tactical-minimap]");
    if (!minimap || (event.relatedTarget instanceof Node && minimap.contains(event.relatedTarget))) return;
    controller.clearMinimapPreview();
    const preview = minimap.querySelector<HTMLElement>("[data-testid=minimap-preview]");
    if (preview) preview.hidden = true;
  }, { signal: eventController.signal });

  /**
   * The battlefield canvas answers its own right press through Phaser's
   * `pointerdown`, so the document-level fallback below must skip it. Testing the
   * canvas against `contextmenu`'s own target is not enough: the press has
   * already run one cancel by then, and if that cancel rendered a menu under the
   * cursor, `contextmenu` reports the fresh button instead of the canvas and the
   * fallback cancels a second level. Latching the target at press time keeps one
   * physical right-click worth exactly one cancel wherever the menu lands.
  */
  let rightPressStartedOnCanvas = false;
  let rightPressHandledByRecordBackup = false;
  root.addEventListener("pointerdown", (event) => {
    trackScreenPointer(event);
    lastInputSource = "pointer";
    settleMenuPointerGlide();
    rightPressHandledByRecordBackup = false;
    if (event.button !== 2) return;
    if (recordBackupUi.cancel()) {
      rightPressHandledByRecordBackup = true;
      rightPressStartedOnCanvas = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    rightPressStartedOnCanvas = event.target instanceof HTMLCanvasElement;
  }, { capture: true, signal: eventController.signal });

  root.addEventListener("contextmenu", (event) => {
    if (!(event.target as Element).closest("#logical-screen")) return;
    event.preventDefault();
    const handledByRecordBackup = rightPressHandledByRecordBackup;
    rightPressHandledByRecordBackup = false;
    if (handledByRecordBackup) return;
    const handledByCanvas = rightPressStartedOnCanvas;
    rightPressStartedOnCanvas = false;
    if (recordBackupUi.cancel()) return;
    if (!handledByCanvas) void controller.rightClickAction();
  }, { signal: eventController.signal });

  window.addEventListener("keydown", (event) => {
    lastInputSource = "keyboard-or-gamepad";
    settleMenuPointerGlide();
    if (recordBackupUi.handleKeyDown(event)) return;
    const key = event.key;
    const lower = key.toLowerCase();
    const focusedHotspot = document.activeElement instanceof HTMLButtonElement
      && document.activeElement.matches("[data-side-panel-hotspot]")
      ? document.activeElement
      : undefined;
    if (focusedHotspot && focusedHotspot.offsetParent !== null && (key === "Enter" || key === " ")) {
      event.preventDefault();
      if (!event.repeat) focusedHotspot.click();
      return;
    }
    if (focusedHotspot && key === "Tab") return;
    const delta = keyboardDirection(key);
    const routeCycle = controller.actionMode === "shotRoute"
      && (lower === "q" || lower === "e");
    const handled = Boolean(delta)
      || isKeyboardConfirm(key)
      || isKeyboardCancel(key)
      || ["Tab", "F1", "F2", "F3", "F4"].includes(key)
      || lower === "e"
      || lower === "g"
      || routeCycle
      || lower === "m"
      || lower === "o";
    if (handled) event.preventDefault();
    if (delta) controller.moveCursor(delta);
    else if (event.repeat) return;
    else if (routeCycle) controller.cycleMagicArcherRoute(lower === "q" ? -1 : 1);
    else if (isKeyboardConfirm(key)) {
      if (controller.dialogueSkipConfirmOpen
        || (!finishDialogueTyping() && !finishFeedbackTyping())) controller.primaryAtCursor();
    }
    else if (isKeyboardCancel(key)) {
      const cancelled = controller.secondaryAction();
      if (!cancelled && key === "Escape") controller.systemAction();
    }
    else if (key === "Tab") void controller.focusNextUnactedAlly();
    else if (lower === "g") {
      if (controller.groupCommandOpen) controller.closeGroupCommands();
      else controller.openGroupCommands();
    }
    else if (key === "F1") void controller.allRest();
    else if (key === "F2") void controller.followLeader();
    else if (key === "F3") void controller.freeAction();
    else if (key === "F4") controller.requestRetreat();
    else if (lower === "e") controller.openSoundSettings();
    else if (lower === "m") controller.openMusicSettings();
    else if (lower === "o") controller.objectiveOpen ? controller.closeObjectives() : controller.openObjectives();
  }, { signal: eventController.signal });

  const renderStoryBackground = (page: DialoguePage | undefined) => {
    // Module 29 can invoke the same PP background renderer from an in-battle
    // opening story (stage 12 / SAY 30 uses BK/14). An explicit page background
    // therefore takes precedence over the phase label.
    storyBackground.hidden = controller.phase !== "prebattleStory"
      && page?.source.backgroundId === undefined;
    const source = page?.source.backgroundId === undefined
      ? defaultStoryBackgroundSource
      : stageAssets?.storyBackgrounds?.[page.source.backgroundId] ?? defaultStoryBackgroundSource;
    storyBackground.style.setProperty("--story-illustration", `url("${source}")`);
    if (page?.source.backgroundId === undefined) delete storyBackground.dataset.backgroundId;
    else storyBackground.dataset.backgroundId = String(page.source.backgroundId);
  };

  /**
   * 一扇 `A/18` 窗體收完後的收尾。
   *
   * 刻意不重跑整個 `render()`：那會連側欄一起重建，把小地圖預覽這類由指標事件直接
   * 寫進 DOM 的狀態一起洗掉，而收合結束的時點與玩家的指標動作無關。
   */
  const settleDialogueSlot = (slot: "upper" | "lower") => {
    const page = controller.currentDialogue;
    // 腳本沒再給這個槽內容就連肖像方框一起收起——原版是 `CU` 收完窗體才輪到 `PU`。
    if (page?.[slot] === undefined) dialogueWindows[slot].box.hidden = true;
    if (page !== undefined) return;
    if (isDialogueWindowClosing(dialogueWindows.upper.copy)
      || isDialogueWindowClosing(dialogueWindows.lower.copy)) return;
    // 整段對話結束、最後一扇窗也收完了：原版要到這時才由 `ED` 還原畫面。
    delete dialogueLayer.dataset.dialogueClosing;
    dialogueLayer.classList.remove("promotion-dialogue");
    dialogueLayer.classList.remove("group-command-dialogue");
    dialogueLayer.classList.remove("ai-technique-dialogue");
    delete dialogueLayer.dataset.actionId;
    delete dialogueLayer.dataset.effectCenter;
    dialogueLayer.hidden = true;
    renderStoryBackground(undefined);
  };
  const settleDialogueWindow = {
    upper: () => settleDialogueSlot("upper"),
    lower: () => settleDialogueSlot("lower"),
  } as const;

  const render = () => {
    screen.dataset.phase = controller.phase;
    screen.dataset.actionMode = controller.actionMode;
    round.textContent = `第 ${controller.battle.displayRound} 回合`;
    // REMAKE-110: 原版回合框只有三个字符的位置，所以倒数不写进框里，改为整框进入
    // 警告态；具体剩余回合数由信息栏和胜负条件面板承担。
    roundBox.dataset.roundLimitWarning = String(controller.battle.roundLimitWarningActive);
    objectiveRoundLimit.textContent =
      `或 ${controller.battle.roundLimit} 回合內未達成勝利條件（剩餘 ${controller.battle.roundsRemaining} 回合）`;
    const selectedUnitContext = renderSelectedUnitContext(controller);
    const selectedRoute = controller.selectedMagicArcherRoute;
    const routeTarget = controller.magicArcherRouteTarget;
    const routePickerVisible = controller.actionMode === "shotRoute"
      && selectedRoute !== undefined
      && routeTarget !== undefined;
    const iceCastPreview = controller.iceCastPreview;
    if (routePickerVisible) {
      const collateralCount = selectedRoute.affectedUnitIds
        .filter((id) => id !== routeTarget.id).length;
      status.dataset.routeIndex = String(controller.magicArcherRouteIndex);
      status.dataset.routeCount = String(controller.magicArcherRouteOptions.length);
      status.innerHTML = skillCastHint("shot-route-summary", [
        `箭道 ${controller.magicArcherRouteIndex + 1}/${controller.magicArcherRouteOptions.length}`,
        `副目標 ${collateralCount}`,
        "滾輪切換",
        "點目標發射",
      ]);
    } else if (iceCastPreview) {
      delete status.dataset.routeIndex;
      delete status.dataset.routeCount;
      status.innerHTML = skillCastHint("ice-cast-summary", [
        BATTLE_ACTION_DEFINITIONS[iceCastPreview.actionId].label,
        `<b class="ice-cast-freeze">藍格冰封</b>`,
        `<b class="ice-cast-displace">黃圈只推開</b>`,
        "點範圍內施展",
        "右鍵取消",
      ], controller.statusMessage);
    } else {
      delete status.dataset.routeIndex;
      delete status.dataset.routeCount;
      if (selectedUnitContext) status.innerHTML = selectedUnitContext;
      else status.textContent = controller.statusMessage;
    }
    const actionMenuVisible = controller.phase === "player"
      && (controller.actionMode === "actionMenu" || controller.actionMode === "techniqueMenu");
    if (actionMenuVisible && !commandMenuWasOpen) {
      commandMenuGliding = startCommandMenuGlide(controller.commandMenuPosition);
    } else if (!actionMenuVisible && commandMenuGliding) {
      menuPointerGlide.cancel();
      commandMenuGliding = false;
    }
    commandMenuWasOpen = actionMenuVisible;
    if (setMenuOpen(actionMenu, actionMenuVisible && !commandMenuGliding)) {
      const position = controller.commandMenuPosition;
      actionMenu.style.left = `${position.x}px`;
      actionMenu.style.top = `${position.y}px`;
      if (controller.actionMode === "techniqueMenu") {
        actionMenu.dataset.kind = "technique";
        actionMenu.style.height = `${controller.techniqueActions.length * 24 + 28}px`;
        actionMenu.setAttribute(
          "aria-label",
          `選擇${controller.selectedUnit?.className ?? "單位"}技術`,
        );
        actionMenu.innerHTML = controller.techniqueActions.map((actionId, index) => {
          const selected = index === controller.techniqueIndex;
          return `<button type="button" role="menuitem" data-action="technique-action"
            data-technique-index="${index}" data-testid="technique-${actionId}"
            class="${selected ? "is-selected" : ""}" aria-current="${selected ? "true" : "false"}"><span class="native-command-label">${BATTLE_ACTION_DEFINITIONS[actionId].label}</span></button>`;
        }).join("");
      } else {
        actionMenu.dataset.kind = controller.commandMenuKind;
        actionMenu.style.height = `${controller.unitCommands.length * 24 + 28}px`;
        actionMenu.setAttribute(
          "aria-label",
          controller.commandMenuKind === "initial"
            ? "選擇單位行動"
            : controller.commandMenuKind === "extraMove"
              ? "選擇飛龍騎士攻擊後移動或放棄"
              : "選擇移動後行動",
        );
        actionMenu.innerHTML = controller.unitCommands.map((command, index) => {
          const action = command.id === "end" ? "end-unit" : command.id === "undo" ? "undo-move" : command.id;
          const selected = index === controller.commandIndex;
          return `<button type="button" role="menuitem" data-action="${action}" data-command-index="${index}" data-testid="unit-command-${command.id}" class="${selected ? "is-selected" : ""}" aria-current="${selected ? "true" : "false"}"><span class="native-command-label">${command.label}</span></button>`;
        }).join("");
      }
    }
    const promotionUnit = controller.promotionChoiceVisible ? controller.promotionUnit : undefined;
    promotionLayer.hidden = !promotionUnit;
    if (promotionUnit) {
      const currentStats = controller.battle.statsFor(promotionUnit);
      const promotionDisplayName = unitDisplayName(promotionUnit);
      const promotionTitle = usesClassIdentity(promotionUnit)
        ? `${promotionUnit.className}轉職`
        : `${promotionDisplayName}・${promotionUnit.className}轉職`;
      const actionLabels = {
        ordinary: "普通攻擊",
        shooting: "普通攻擊／射擊方向",
        technique: "普通攻擊／技術方向",
        special_runtime: "特殊行動",
      } as const;
      const delta = (next: number, current: number) => {
        const change = next - current;
        return change === 0 ? "±0" : change > 0 ? `+${change}` : String(change);
      };
      const options = controller.promotionTargets.map((target, index) => {
        const definition = classDefinition(target.id);
        const stats = classStatsFor({ classId: target.id, experience: 0 });
        const selected = index === controller.promotionSelectionIndex;
        const imageUrl = promotionImageByClass[target.id]
          ?? allyMapUnitAsset(target.id)
          ?? TECHNIQUE_LAB_UNIT_ASSETS[target.id].ally;
        const optionLabel = [
          `${index + 1}．${definition.nativeName}`,
          actionLabels[definition.actionCategory],
          `等級 ${stats.level}`,
          `攻擊 ${stats.attack}（${delta(stats.attack, currentStats.attack)}）`,
          `防禦 ${stats.defense}（${delta(stats.defense, currentStats.defense)}）`,
          `生命上限 ${stats.maxLife}（${delta(stats.maxLife, currentStats.maxLife)}）`,
          `移動 ${stats.movement}（${delta(stats.movement, currentStats.movement)}）`,
        ].join("，");
        return `<button type="button" class="promotion-option ${selected ? "is-selected" : ""}"
          data-action="promotion-target" data-promotion-index="${index}"
          data-testid="promotion-target-${target.id}" role="menuitem"
          aria-label="${optionLabel}" aria-current="${selected}">
          <span class="promotion-art" aria-hidden="true">
            ${imageUrl
              ? `<img src="${imageUrl}" alt="" data-testid="promotion-image-${target.id}" />`
              : `<span class="promotion-art-missing">${definition.nativeName}</span>`}
          </span>
          <span class="promotion-option-copy">
            <strong>${index + 1}．${definition.nativeName}</strong>
            <span class="promotion-action">${actionLabels[definition.actionCategory]}</span>
            <span>等級 ${stats.level}　攻 ${stats.attack}（${delta(stats.attack, currentStats.attack)}）</span>
            <span>防 ${stats.defense}（${delta(stats.defense, currentStats.defense)}）　生命上限 ${stats.maxLife}（${delta(stats.maxLife, currentStats.maxLife)}）</span>
            <span>移動 ${stats.movement}（${delta(stats.movement, currentStats.movement)}）</span>
          </span>
        </button>`;
      }).join("");
      promotionLayer.innerHTML = `<div class="promotion-panel">
        <span class="panel-kicker">CLASS CHANGE</span>
        <h2>${promotionTitle}</h2>
        <p class="promotion-current">目前：等級 ${currentStats.level}　攻 ${currentStats.attack}　防 ${currentStats.defense}　生命 ${promotionUnit.life}/${currentStats.maxLife}　移動 ${currentStats.movement}</p>
        <div class="promotion-options" role="menu" aria-label="${promotionDisplayName}的轉職候選">${options}</div>
        <p class="promotion-warning">選擇後經驗歸零；目前生命不恢復。此選擇不能取消。</p>
      </div>`;
    } else {
      promotionLayer.replaceChildren();
    }
    setMenuOpen(objectivePanel, controller.objectiveOpen);
    if (setMenuOpen(systemMenu, controller.systemMenuOpen)) {
      systemMenu.innerHTML = controller.systemCommands.map((command, index) => {
        const action = command.id === "settings"
          ? "system-settings"
          : command.id === "objectives"
            ? "objectives"
            : `system-${command.id}`;
        const selected = index === controller.systemMenuIndex;
        return `<button type="button" role="menuitem" data-action="${action}" data-system-index="${index}" data-testid="system-command-${command.id}" class="${selected ? "is-selected" : ""}" aria-current="${selected ? "true" : "false"}"><span class="native-command-label">${command.label}</span></button>`;
      }).join("");
    }
    if (setMenuOpen(settingsMenu, controller.settingsOpen)) {
      const settings = [
        {
          label: "人物圖像",
          enabled: controller.portraitsEnabled,
          action: "toggle-portraits",
          testId: "portraits-button",
        },
        {
          label: "戰鬥動畫",
          enabled: controller.battlePresentation === "full",
          action: "battle-presentation",
          testId: "presentation-button",
        },
        {
          label: "地圖方格",
          enabled: controller.gridEnabled,
          action: "toggle-grid",
          testId: "grid-button",
        },
        {
          label: "地圖捲動",
          enabled: controller.edgeScrollEnabled,
          action: "toggle-edge-scroll",
          testId: "edge-scroll-button",
        },
        {
          label: "ＡＩ對話",
          enabled: controller.aiDialogueEnabled,
          action: "toggle-ai-dialogue",
          testId: "ai-dialogue-button",
        },
      ] as const;
      settingsMenu.innerHTML = `
        <h2>子 選 單</h2>
        <div class="native-settings-list">
          ${settings.map((setting, index) => {
            const selected = index === controller.settingsMenuIndex;
            return `<button type="button" role="menuitemcheckbox" data-action="${setting.action}"
              data-settings-index="${index}" data-testid="${setting.testId}"
              class="${selected ? "is-selected" : ""}" aria-current="${selected ? "true" : "false"}"
              aria-checked="${setting.enabled}"><span class="native-settings-label">${setting.label}</span><span
                class="native-settings-state">${setting.enabled ? "ON" : "OFF"}</span></button>`;
          }).join("")}
        </div>`;
    }
    setMenuOpen(soundSettingsMenu, controller.soundSettingsOpen);
    setMenuOpen(musicSettingsMenu, controller.musicSettingsOpen);
    if (setMenuOpen(recordMenu, controller.recordMenuMode !== undefined)) {
      const mode = controller.recordMenuMode;
      recordMenu.innerHTML = renderRecordPanel(controller, {
        title: mode === "save" ? "儲存遊戲進度" : "讀取遊戲進度",
        selectedIndex: controller.recordMenuIndex,
        slotAction: "record-slot",
        pageAction: "record-page",
        pageDeltaAttribute: "data-record-page-delta",
        slotTestIdPrefix: "record-slot",
        pageTestIdPrefix: "record",
        slotAttributes: (index) => `data-record-index="${index}"`,
        disableEmptySlots: mode === "load",
        cancelAction: "close-record-menu",
        showBackupTools: true,
        backupStatus: recordBackupStatus,
      });
    }
    if (setMenuOpen(quitConfirm, controller.quitConfirmOpen)) {
      for (const button of quitConfirm.querySelectorAll<HTMLButtonElement>("[data-quit-index]")) {
        const selected = Number(button.dataset.quitIndex) === controller.quitConfirmIndex;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-current", String(selected));
      }
    }
    if (setMenuOpen(groupCommandMenu, controller.groupCommandOpen)) {
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
        return `<button type="button" role="menuitem" data-action="${action}" data-group-command-index="${index}" data-testid="group-command-${command.id}" class="${selected ? "is-selected" : ""}" aria-current="${selected ? "true" : "false"}" ${disabled ? "disabled" : ""}><span class="native-command-label">${command.label}</span></button>`;
      }).join("");
    }
    if (setMenuOpen(retreatConfirm, controller.retreatConfirmOpen)) {
      for (const button of retreatConfirm.querySelectorAll<HTMLButtonElement>("[data-retreat-index]")) {
        const selected = Number(button.dataset.retreatIndex) === controller.retreatConfirmIndex;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-current", String(selected));
      }
    }
    if (setMenuOpen(dialogueSkipConfirm, controller.dialogueSkipConfirmOpen)) {
      for (const button of dialogueSkipConfirm.querySelectorAll<HTMLButtonElement>(
        "[data-dialogue-skip-index]",
      )) {
        const selected = Number(button.dataset.dialogueSkipIndex)
          === controller.dialogueSkipConfirmIndex;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-current", String(selected));
      }
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-music-level]")) {
      const selected = Number(button.dataset.musicLevel) === controller.musicVolume;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-sound-effect-level]")) {
      const selected = Number(button.dataset.soundEffectLevel) === controller.soundEffectVolume;
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
    const terrain = focus ? undefined : controller.terrainInspection;
    screen.dataset.hudMode = focus ? "unit" : terrain ? "terrain" : "tactical";
    screen.dataset.portraitsEnabled = String(controller.portraitsEnabled);
    const sidePanelHotspotsActive = controller.phase === "player"
      && controller.actionMode === "idle"
      && !controller.hasBlockingOverlay
      && !controller.inputLocked
      && !focus
      && !terrain;
    screen.dataset.sidePanelHotspots = sidePanelHotspotsActive ? "active" : "inactive";
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-side-panel-hotspot]")) {
      button.tabIndex = sidePanelHotspotsActive ? 0 : -1;
      const id = button.dataset.sidePanelHotspot;
      const pressed = id === "grid"
        ? controller.gridEnabled
        : id === "edgeScroll"
          ? controller.edgeScrollEnabled
          : id === "portraits"
            ? controller.portraitsEnabled
            : id === "battleAnimation"
              ? controller.battlePresentation === "full"
              : undefined;
      if (pressed === undefined) button.removeAttribute("aria-pressed");
      else button.setAttribute("aria-pressed", String(pressed));
    }
    if (!sidePanelHotspotsActive) hideSidePanelHint();
    hud.innerHTML = `${renderTactical(controller, Boolean(focus))}${
      focus
        ? renderHud(controller, focus.unit, focus.stats)
        : terrain
          ? renderTerrainInspection(terrain)
          : ""
    }`;
    // 開場劇情把整條右欄和底部收起來，所以文字層跟著同一個條件清空。
    const battleChromeVisible = controller.phase !== "prebattleStory";
    nativeText.render({
      unitDetail: focus && battleChromeVisible
        ? nativeUnitDetailText(controller, focus.unit, focus.stats)
        : undefined,
      round: battleChromeVisible ? controller.battle.displayRound : undefined,
      roundLimitWarning: controller.battle.roundLimitWarningActive,
      stageLabel: battleChromeVisible ? stage.name : undefined,
    });

    const page = controller.currentDialogue;
    // Native CU/CD collapse the A/18 panel over 12 steps before the script ends,
    // and 92 of the 93 command scripts close every window they opened before ED.
    // The layer therefore has to outlive `currentDialogue` by that collapse.
    for (const slot of ["upper", "lower"] as const) {
      setDialogueWindowOpen(
        dialogueWindows[slot].copy,
        page?.[slot]?.text !== undefined,
        settleDialogueWindow[slot],
      );
    }
    const dialogueClosing = isDialogueWindowClosing(dialogueWindows.upper.copy)
      || isDialogueWindowClosing(dialogueWindows.lower.copy);
    const dialogueVisible = page !== undefined || dialogueClosing;
    dialogueLayer.hidden = !dialogueVisible;
    // 收合中的殘影不再是有效的對話：既不該吃掉點擊，其他消費者也要能分辨「還在對話」
    // 與「窗體正在收回」。窗口在腳本中途關閉時對話仍在進行，所以只看整段結束。
    if (page === undefined && dialogueClosing) dialogueLayer.dataset.dialogueClosing = "true";
    else delete dialogueLayer.dataset.dialogueClosing;
    // While the last panel is still collapsing the native script has only run
    // CU: ED has not restored the map yet, so the story background stays too.
    if (page !== undefined || !dialogueClosing) renderStoryBackground(page);
    if (page) {
      const pageKey = controller.aiTechniqueDialogue
        ? `ai-technique:${controller.aiTechniqueDialogue.actor.id}:${controller.aiTechniqueDialogue.actionId}`
        : controller.contextualLineDialogue
        ? `contextual-line:${controller.contextualLineDialogue.line}:${controller.contextualLineDialogue.actor.id}`
        : controller.groupCommandDialogueId
        ? `group-command:${controller.groupCommandDialogueId}`
          : controller.promotionDialogueActive
          ? `promotion:${controller.promotionUnit?.id}:${controller.promotionDialogueIndex}`
          : `${controller.phase}:${controller.dialogueIndex}:${page.source.record}:${page.source.wait}:${page.source.address ?? ""}`;
      const pageChanged = activeDialogueKey !== pageKey;
      dialogueLayer.dataset.sourceRecord = String(page.source.record);
      dialogueLayer.dataset.sourceWait = String(page.source.wait);
      if (page.source.address) dialogueLayer.dataset.sourceAddress = page.source.address;
      else delete dialogueLayer.dataset.sourceAddress;
      dialogueLayer.dataset.activeSlot = page.activeSlot ?? "none";
      dialogueLayer.dataset.revealStart = String(page.revealStart ?? 0);
      if (controller.aiTechniqueDialogue) {
        dialogueLayer.dataset.actionId = controller.aiTechniqueDialogue.actionId;
        dialogueLayer.dataset.effectCenter =
          `${controller.aiTechniqueDialogue.center.x},${controller.aiTechniqueDialogue.center.y}`;
      } else {
        delete dialogueLayer.dataset.actionId;
        delete dialogueLayer.dataset.effectCenter;
      }
      dialogueLayer.classList.toggle("prebattle", controller.phase === "prebattleStory");
      dialogueLayer.classList.toggle("promotion-dialogue", controller.promotionDialogueActive);
      dialogueLayer.classList.toggle("group-command-dialogue", controller.groupCommandDialogueActive);
      // The DS:84BB contextual lines reuse the same battle window as the AI
      // technique notices, so they share that layout, not the story layout.
      dialogueLayer.classList.toggle(
        "ai-technique-dialogue",
        controller.aiTechniqueDialogueActive || controller.contextualLineDialogueActive,
      );
      for (const slot of ["upper", "lower"] as const) {
        const elements = dialogueWindows[slot];
        const state = page[slot];
        const active = page.activeSlot === slot;
        const closing = isDialogueWindowClosing(elements.copy);
        // A slot whose panel is still collapsing keeps its portrait and
        // nameplate: native PU only erases the face once CU has finished.
        elements.box.hidden = state === undefined && !closing;
        elements.box.classList.toggle("is-active", active);
        elements.box.dataset.openSteps = "11";
        elements.box.dataset.closeSteps = "12";
        elements.text.removeAttribute("id");
        elements.portrait.removeAttribute("data-testid");
        elements.portraitName.removeAttribute("data-testid");
        if (!state) {
          stopSpeaking(elements.portrait);
          if (!closing) {
            elements.portraitName.hidden = true;
            elements.portraitName.textContent = "";
          }
          continue;
        }
        elements.speaker.textContent = state.speaker ?? "";
        // A slot with no text is a portrait the script left on screen after
        // closing its window; only .dialogue-copy carries the A/18 text panel,
        // so collapsing it leaves the framed portrait and nameplate alone.
        // `setDialogueWindowOpen` above owns that panel's `hidden`.
        elements.box.setAttribute(
          "aria-label",
          state.text === undefined
            ? `${state.speaker ?? "角色"}在場`
            : state.speaker ? `${state.speaker}對話` : "旁白",
        );
        if (state.text !== undefined && (!active || pageChanged)) {
          renderNativeDialogueText(elements.text, state.text);
        }
        if (state.textInset) {
          elements.copy.style.setProperty("--dialogue-text-inset-x", `${state.textInset.x}px`);
          elements.copy.style.setProperty("--dialogue-text-inset-y", `${state.textInset.y}px`);
        } else {
          elements.copy.style.removeProperty("--dialogue-text-inset-x");
          elements.copy.style.removeProperty("--dialogue-text-inset-y");
        }
        if (state.portrait !== undefined) {
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
          elements.portraitName.textContent = (
            controller.promotionDialogueActive
              ? state.speaker
              : PORTRAIT_CATALOG[state.portrait].displayName ?? state.speaker
          )?.trim() ?? "";
          elements.portraitName.hidden = false;
          elements.portraitName.dataset.testid = active
            ? "dialogue-portrait-name"
            : `dialogue-portrait-name-${slot}`;
          if (!active) stopSpeaking(elements.portrait);
        } else {
          stopSpeaking(elements.portrait);
          elements.portrait.hidden = true;
          elements.portraitName.hidden = true;
          elements.portraitName.textContent = "";
        }
      }
      const activeState = page.activeSlot ? page[page.activeSlot] : undefined;
      if (page.activeSlot && activeState?.text !== undefined) {
        const target = dialogueWindows[page.activeSlot].text;
        const portrait = activeState.portrait !== undefined
          ? dialogueWindows[page.activeSlot].portrait
          : undefined;
        target.id = "dialogue-text";
        if (pageChanged) revealDialogue(activeState.text, pageKey, target, page.revealStart, portrait);
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
      // These variants change the panel's layout and colours, so they can only
      // be dropped once the collapse they are still styling has finished.
      if (!dialogueClosing) {
        dialogueLayer.classList.remove("promotion-dialogue");
        dialogueLayer.classList.remove("group-command-dialogue");
        dialogueLayer.classList.remove("ai-technique-dialogue");
        delete dialogueLayer.dataset.actionId;
        delete dialogueLayer.dataset.effectCenter;
      }
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
        renderNativeDialogueText(feedbackText, fullText);
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
  recordBackupUi = mountRecordSaveBackupUi(root, {
    storage: localStorage,
    onRecordsRestored: () => render(),
    onStatus: (message) => {
      recordBackupStatus = message;
      const status = recordMenu.querySelector<HTMLElement>("[data-testid=record-backup-status]");
      if (status) status.textContent = message;
    },
  });
  const unsubscribe = controller.onChange(render);
  render();
  const stopScaling = configureGameScaling(required(root, "#game-viewport"), screen);
  const stopGamepad = bindGamepad(controller, () => {
    lastInputSource = "keyboard-or-gamepad";
    settleMenuPointerGlide();
  });
  return () => {
    eventController.abort();
    unsubscribe();
    stopScaling();
    stopGamepad();
    recordBackupUi.dispose();
    nativeText.dispose();
    stopPortraitAnimations();
    stopDialogueTimer();
    stopFeedbackTimer();
    hideSidePanelHint();
    for (const menu of animatedMenus) finishMenuClose(menu);
    for (const slot of ["upper", "lower"] as const) {
      finishDialogueWindowClose(dialogueWindows[slot].copy);
    }
    menuPointerGlide.dispose();
  };
}

function fullSpriteAsset(sprite: FullCombatSpriteState): {
  frameName: string;
  meta: { w: number; anchor: number; h?: number; yOffset?: number };
} {
  const classId = classIdFromNativeRecord(sprite.classId);
  if (!classId) {
    throw new Error(`No ordinary full-combat assets for native class ${sprite.classId}`);
  }
  const sideAssets = STAGE0_FULL_COMBAT_ASSETS[sprite.side];
  if (!(classId in sideAssets)) {
    // 记录 36–38 只在 side 2 编队出现，原版没有 `M_00/86..88`；出现在这里说明
    // 调用方把它们摆到了左侧，属于不可达构图，不能用占位图凑合。
    throw new Error(
      `Native class ${sprite.classId} has no ${sprite.side}-side full-combat assets`,
    );
  }
  const assetClassId = classId as keyof typeof sideAssets;
  const frames = sideAssets[assetClassId][sprite.set];
  if (frames.length === 0) {
    throw new Error(`Native class ${sprite.classId} has no ${sprite.side} ${sprite.set} frames`);
  }
  if (!Number.isInteger(sprite.frame) || sprite.frame < 0 || sprite.frame >= frames.length) {
    throw new Error(
      `Native class ${sprite.classId} ${sprite.side} ${sprite.set} frame ${sprite.frame} is outside 0..${frames.length - 1}`,
    );
  }
  const meta = FULL_COMBAT_FRAME_META[sprite.side][sprite.classId][sprite.set][sprite.frame];
  if (!meta) {
    throw new Error(
      `Missing frame metadata for native class ${sprite.classId} ${sprite.side} ${sprite.set} frame ${sprite.frame}`,
    );
  }
  return { frameName: frames[sprite.frame], meta };
}

function buildFullCombatSkeleton(
  layer: HTMLElement,
  presentation: CombatPresentation,
  source: CombatPresentationRenderSource,
  backgroundRecord: number,
): void {
  const { attacker, defender } = presentation;
  const backgroundAsset = fullCombatBackgroundAsset(backgroundRecord);
  const background = fullCombatImageSource(backgroundAsset);
  const leftUnit = attacker.side === 1 ? attacker : defender;
  const rightUnit = attacker.side === 2 ? attacker : defender;
  const statusPanel = (side: "left" | "right", unit: typeof attacker) => {
    const stats = source.unitStats(unit);
    const life = unit.id === attacker.id ? presentation.displayedAttackerLife : presentation.displayedDefenderLife;
    return `
      <div class="full-status ${side}" data-testid="full-${side}-status" hidden>
        <img src="${portraitSourceFor(unit.portrait)}" alt="${unit.name}肖像" />
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
      <div class="full-combat-viewport-content" data-testid="full-combat-viewport-content">
        <div class="full-combat-scene" data-testid="full-combat-scene" hidden>
          <div class="full-combat-backdrop">
            <img class="far" src="${background}" alt="" data-testid="full-combat-background" data-record="${backgroundRecord}" data-image-ready="${background !== backgroundAsset}" />
            <img class="far copy" src="${background}" alt="" />
            <img class="near" src="${background}" alt="" />
            <img class="near copy" src="${background}" alt="" />
          </div>
          <div class="full-combat-particles" aria-hidden="true"></div>
          <i class="full-combat-frame full-combat-lance" aria-hidden="true" hidden></i>
          <i class="full-combat-frame full-combat-projectile" data-testid="full-combat-projectile" aria-hidden="true" hidden></i>
          <div class="full-combat-sprite slot-victim" hidden><i class="full-combat-frame" aria-hidden="true" data-testid="full-victim-sprite"></i></div>
          <div class="full-combat-sprite slot-actor" hidden><i class="full-combat-frame" aria-hidden="true" data-testid="full-actor-sprite"></i></div>
          <div class="full-combat-sprite slot-effect-G1" hidden><i class="full-combat-frame" aria-hidden="true" data-testid="full-effect-G1-sprite"></i></div>
          <div class="full-combat-sprite slot-effect-G2" hidden><i class="full-combat-frame" aria-hidden="true" data-testid="full-effect-G2-sprite"></i></div>
          <div class="full-combat-sprite slot-effect-G3" hidden><i class="full-combat-frame" aria-hidden="true" data-testid="full-effect-G3-sprite"></i></div>
          <div class="full-combat-sprite slot-effect-G4" hidden><i class="full-combat-frame" aria-hidden="true" data-testid="full-effect-G4-sprite"></i></div>
          <div class="full-combat-sprite slot-effect-G5" hidden><i class="full-combat-frame" aria-hidden="true" data-testid="full-effect-G5-sprite"></i></div>
        </div>
        <div class="full-combat-strip" aria-hidden="true">
          <div class="full-life-gauge left" data-testid="full-left-life-gauge">
            <i class="base"></i><i class="fill"></i><i class="shine"></i>
          </div>
          <div class="full-life-gauge right" data-testid="full-right-life-gauge">
            <i class="base"></i><i class="fill"></i><i class="shine"></i>
          </div>
        </div>
        <b class="full-damage-number" data-testid="full-damage-number" hidden></b>
      </div>
    </div>`;
}

const FULL_COMBAT_PALETTE: Readonly<Record<number, string>> = {
  0: "#000000",
  6: "#f79e9e",
  7: "#baaa9a",
  9: "#4d8aff",
  11: "#ef2024",
  13: "#aee728",
};

export function renderCombat(
  layer: HTMLElement,
  source: CombatPresentationRenderSource,
): void {
  const presentation = source.combatPresentation;
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
  if (source.battlePresentation === "map" || !presentation.fullScene) {
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
    buildFullCombatSkeleton(layer, presentation, source, scene.backgroundRecord);
    layer.dataset.fullBattleKey = battleKey;
  }
  layer.dataset.fullCombatPhase = presentation.phase;
  const actorUnit = ["fullCounterWindup", "fullCounterCharge", "fullCounterImpact", "fullCounterHold", "fullAttackerDeath"]
    .includes(presentation.phase) ? defender : attacker;
  const leftUnit = attacker.side === 1 ? attacker : defender;
  const rightUnit = attacker.side === 2 ? attacker : defender;
  layer.dataset.fullLeftRecord = `M_00/${classDefinition(leftUnit.classId).nativeRecord + (leftUnit.id === actorUnit.id ? 50 : 0)}`;
  layer.dataset.fullRightRecord = `Y_00/${classDefinition(rightUnit.classId).nativeRecord + (rightUnit.id === actorUnit.id ? 50 : 0)}`;

  const query = <T extends HTMLElement>(selector: string): T => layer.querySelector(selector) as T;
  query<HTMLElement>(".full-status.left").hidden = !scene.showLeftPanel;
  query<HTMLElement>(".full-status.right").hidden = !scene.showRightPanel;
  const windowElement = query<HTMLElement>(".full-combat-window");
  windowElement.hidden = !scene.showWindow;
  const sceneElement = query<HTMLElement>(".full-combat-scene");
  sceneElement.hidden = !scene.showScene;
  for (const side of ["left", "right"] as const) {
    const gauge = scene.lifeGauges[side];
    const element = query<HTMLElement>(`.full-life-gauge.${side}`);
    const base = element.querySelector<HTMLElement>(".base");
    const fill = element.querySelector<HTMLElement>(".fill");
    if (!base || !fill) throw new Error(`Missing native ${side} life-gauge layers`);
    element.dataset.life = String(gauge.life);
    element.dataset.baseColor = String(gauge.baseColorIndex);
    element.dataset.fillColor = String(gauge.fillColorIndex);
    element.dataset.fillWidth = String(gauge.fillWidth);
    base.style.backgroundColor = FULL_COMBAT_PALETTE[gauge.baseColorIndex];
    fill.style.backgroundColor = FULL_COMBAT_PALETTE[gauge.fillColorIndex];
    fill.style.width = `${gauge.fillWidth}px`;
  }
  if (!scene.showScene) return;
  const viewportContent = query<HTMLElement>(".full-combat-viewport-content");
  viewportContent.style.transform = `translateY(${scene.viewportYOffset}px)`;
  viewportContent.dataset.yOffset = String(scene.viewportYOffset);

  const farOffset = ((scene.camera % 448) + 448) % 448;
  const nearOffset = ((scene.camera * 2 % 448) + 448) % 448;
  const backdrop = query<HTMLElement>(".full-combat-backdrop");
  backdrop.style.setProperty("--far-scroll", `${-farOffset}px`);
  backdrop.style.setProperty("--near-scroll", `${-nearOffset}px`);

  const slots: Array<{ selector: string; sprite?: FullCombatSpriteState }> = [
    {
      selector: ".full-combat-sprite.slot-victim",
      sprite: scene.sprites.find((entry) => entry.channel === "victim")
        ?? scene.sprites.find((entry) => entry.set === "direct"),
    },
    {
      selector: ".full-combat-sprite.slot-actor",
      sprite: scene.sprites.find((entry) => entry.channel === "actor")
        ?? scene.sprites.find((entry) => entry.set === "plus50" && !entry.channel),
    },
    ...(["G1", "G2", "G3", "G4", "G5"] as const).map((channel) => ({
      selector: `.full-combat-sprite.slot-effect-${channel}`,
      sprite: scene.sprites.find((entry) => entry.channel === channel),
    })),
  ];
  for (const { selector, sprite } of slots) {
    const holder = query<HTMLElement>(selector);
    const image = holder.querySelector<HTMLElement>(".full-combat-frame");
    if (!image) throw new Error(`Missing atlas frame element for ${selector}`);
    if (!sprite) {
      holder.hidden = true;
      continue;
    }
    const { frameName, meta } = fullSpriteAsset(sprite);
    holder.hidden = false;
    image.dataset.side = sprite.side;
    image.dataset.set = sprite.set;
    image.dataset.frame = String(sprite.frame);
    image.dataset.lift = String(sprite.lift);
    image.dataset.x = String(Math.round(sprite.x));
    image.dataset.yOffset = String(meta.yOffset ?? 0);
    const yOffsetCorrection = sprite.yOffsetCorrection ?? 0;
    image.dataset.yOffsetCorrection = String(yOffsetCorrection);
    const xOffsetCorrection = sprite.xOffsetCorrection ?? 0;
    image.dataset.xOffsetCorrection = String(xOffsetCorrection);
    if (sprite.channel) image.dataset.channel = sprite.channel;
    else delete image.dataset.channel;
    if (sprite.reaction) image.dataset.reaction = sprite.reaction;
    else delete image.dataset.reaction;
    applyFullCombatAtlasFrame(image, frameName);
    const anchor = sprite.mirror ? meta.w - meta.anchor : meta.anchor;
    const topOffset = -sprite.lift + (meta.yOffset ?? 0) + yOffsetCorrection;
    image.dataset.projectedYOffset = String(Math.round(topOffset));
    holder.style.transform = `translate(${Math.round(sprite.x - anchor + xOffsetCorrection)}px, ${Math.round(topOffset)}px)`;
    holder.style.opacity = String(sprite.opacity);
    image.style.transform = sprite.mirror ? "scaleX(-1)" : "";
  }

  const lance = query<HTMLElement>(".full-combat-lance");
  if (scene.lance) {
    const frames = STAGE0_FULL_COMBAT_ASSETS[scene.lance.side].cavalry.plus50;
    const frame = scene.lance.frame;
    if (!Number.isInteger(frame) || frame < 6 || frame > 8 || frame >= frames.length) {
      throw new Error(`Cavalry lance frame ${frame} is outside the native 6..8 range`);
    }
    const meta = FULL_COMBAT_FRAME_META[scene.lance.side][22].plus50[frame];
    const frameName = frames[frame];
    lance.hidden = false;
    applyFullCombatAtlasFrame(lance, frameName);
    // G1 uses the same native bottom-anchor projection as the archer arrow:
    // subtract the current bitmap height, then apply its y-offset. A fixed
    // eight-pixel adjustment puts the 42/43 px diagonal lance frames far
    // below the cavalry rider's hand.
    const top = scene.lance.y - (meta.h ?? 0) + (meta.yOffset ?? 0);
    lance.style.transform = `translate(${Math.round(scene.lance.x - meta.anchor)}px, ${Math.round(top)}px)`;
    lance.dataset.frame = String(frame);
    lance.dataset.top = String(Math.round(top));
    lance.dataset.x = String(Math.round(scene.lance.x));
    lance.dataset.y = String(Math.round(scene.lance.y));
  } else {
    lance.hidden = true;
    lance.removeAttribute("data-frame");
    lance.removeAttribute("data-top");
    lance.removeAttribute("data-x");
    lance.removeAttribute("data-y");
  }

  const projectile = query<HTMLElement>(".full-combat-projectile");
  if (scene.projectile) {
    const frames = STAGE0_FULL_COMBAT_ASSETS[scene.projectile.side].archer.plus50;
    const frame = scene.projectile.frame;
    if (!Number.isInteger(frame) || frame < 5 || frame > 8 || frame >= frames.length) {
      throw new Error(`Archer projectile frame ${frame} is outside the native 5..8 range`);
    }
    const meta = FULL_COMBAT_FRAME_META[scene.projectile.side][20].plus50[frame];
    const frameName = frames[frame];
    projectile.hidden = false;
    applyFullCombatAtlasFrame(projectile, frameName);
    // Module 29's full-screen renderer treats y as the bitmap's bottom
    // anchor (B0FF/B29B): subtract height, then add the per-frame y offset.
    const top = scene.projectile.y - (meta.h ?? 0) + (meta.yOffset ?? 0);
    projectile.style.transform = `translate(${Math.round(scene.projectile.x - meta.anchor)}px, ${Math.round(top)}px)`;
    projectile.dataset.frame = String(frame);
    projectile.dataset.top = String(Math.round(top));
  } else {
    projectile.hidden = true;
    projectile.removeAttribute("data-frame");
    projectile.removeAttribute("data-top");
  }

  const particleLayer = query<HTMLElement>(".full-combat-particles");
  const needed = scene.particles.length;
  while (particleLayer.children.length < needed) {
    const particle = document.createElement("i");
    particle.className = "full-combat-frame";
    particle.setAttribute("aria-hidden", "true");
    particleLayer.appendChild(particle);
  }
  for (let index = 0; index < particleLayer.children.length; index += 1) {
    const particle = particleLayer.children[index] as HTMLElement;
    const data = scene.particles[index];
    if (!data) {
      particle.hidden = true;
      continue;
    }
    const frameName = STAGE0_FULL_COMBAT_COMMON_EFFECTS.trail[data.frame];
    if (!frameName) throw new Error(`Native common trail frame ${data.frame} is outside 0..5`);
    particle.hidden = false;
    applyFullCombatAtlasFrame(particle, frameName);
    particle.dataset.frame = String(data.frame);
    const x = Math.round(data.x);
    const y = Math.round(data.y);
    particle.dataset.x = String(x);
    particle.dataset.y = String(y);
    particle.style.transform = `translate(${x}px, ${y}px)`;
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
    const popup = ["save", "load", "groupCommands", "systemMenu"].includes(hotspot.id)
      ? "menu"
      : ["sound", "music", "objectives"].includes(hotspot.id)
        ? "dialog"
        : undefined;
    return `<button
      class="side-panel-hotspot"
      style="--hotspot-left:${minX}px;--hotspot-top:${minY}px;--hotspot-width:${maxX - minX + 1}px;--hotspot-height:${maxY - minY + 1}px"
      data-side-panel-hotspot="${hotspot.id}"
      data-action="${hotspot.action}"
      data-testid="${hotspot.testId}"
      aria-label="${hotspot.label}"
      aria-describedby="side-panel-tooltip"
      ${popup ? `aria-haspopup="${popup}"` : ""}
    ></button>`;
  }).join("");
}

interface UnitContextPresentation {
  controlSummary: string;
  visibleControlSummary?: string;
  tacticLabel?: string;
  tacticPrefix: string;
  traitSummary?: string;
  traitDescription?: string;
  routePulseSafety?: "safe" | "danger";
  routePulseSafetyLabel?: string;
}

function unitContextPresentation(
  controller: GameController,
  unit: BattleUnit,
): UnitContextPresentation {
  const playerControlled = unit.side === 1 && controller.battle.isPlayerControllableAlly(unit.id);
  const affiliationLabel = unit.side === 2 ? "敵軍" : playerControlled ? "我方" : "友軍";
  const controlLabel = unit.side === 2 ? "AI" : playerControlled ? "玩家" : "自動";
  const actionLabel = unit.actionDisabled ? "冰封中" : unit.acted ? "已行動" : "可行動";
  const intent = unit.side === 2 ? controller.battle.enemyAiIntentFor(unit.id) : undefined;
  const intentLabel = intent ? {
    route: "撤離",
    sentry: "守衛",
    alert: "警戒",
    pursuit: "追擊",
  }[intent] : undefined;
  const force = controller.battle.forceForUnit(unit.id);
  const tacticLabel = intentLabel
    ?? force?.tacticLabel
    ?? (unit.side === 2 ? "主動進攻" : !playerControlled ? "自主作戰" : undefined);
  const routePulseSafety = controller.battle.routePulseSafetyForUnit(unit.id);
  const classTraits = classTraitsFor(unit.classId);
  return {
    controlSummary: playerControlled
      ? `${affiliationLabel}・${controlLabel}・${actionLabel}`
      : affiliationLabel,
    visibleControlSummary: playerControlled ? `${controlLabel}・${actionLabel}` : undefined,
    tacticLabel,
    tacticPrefix: unit.side === 1 && !playerControlled ? `${affiliationLabel}・` : "",
    traitSummary: classTraits.length > 0
      ? classTraits.map(({ shortDescription }) => shortDescription).join("／")
      : undefined,
    traitDescription: classTraits.length > 0
      ? classTraits.map(({ description }) => description).join("；")
      : undefined,
    routePulseSafety,
    routePulseSafetyLabel: routePulseSafety === "safe"
      ? "安全"
      : routePulseSafety === "danger"
        ? "危險"
        : undefined,
  };
}

function renderSelectedUnitContext(controller: GameController): string | undefined {
  if (!["actionMenu", "enemyPreview", "allyPreview"].includes(controller.actionMode)) return undefined;
  const unit = controller.selectedUnit;
  if (!unit) return undefined;
  const context = unitContextPresentation(controller, unit);
  const items = [
    context.visibleControlSummary
      ? `<span class="selected-unit-control" data-testid="unit-control-summary">${context.visibleControlSummary}</span>`
      : undefined,
    context.tacticLabel
      ? `<span class="selected-unit-tactic" data-testid="unit-tactic">${context.tacticPrefix
        ? `<span class="selected-unit-affiliation">${context.tacticPrefix}</span>`
        : ""}<span class="selected-unit-tactic-pair"><b data-testid="unit-tactic-label">戰術</b><span
          data-testid="unit-tactic-value">${context.tacticLabel}</span></span></span>`
      : undefined,
    context.traitSummary && context.traitDescription
      ? `<span class="selected-unit-traits" data-testid="unit-traits"
          title="${context.traitDescription}" aria-label="職業特性：${context.traitDescription}"><b>特性</b><span>${context.traitSummary}</span></span>`
      : undefined,
    context.routePulseSafetyLabel
      ? `<span class="selected-unit-safety" data-testid="route-pulse-safety"
          data-safety="${context.routePulseSafety}">力場${context.routePulseSafetyLabel}</span>`
      : undefined,
  ].filter((item): item is string => item !== undefined);
  return `<span class="selected-unit-context" data-testid="selected-unit-context">${items.join(
    '<i class="selected-unit-separator" aria-hidden="true">・</i>',
  )}</span>`;
}

/**
 * Skill overlays that need the player to read something before they commit —
 * the ice footprint, the magic-arrow line — write into the same status strip as
 * every other readout, so they render as plain outlined text rather than a
 * plated widget with its own buttons. Each input they mention is reachable from
 * the map or the keyboard, so naming them here costs no on-screen control.
 */
function skillCastHint(
  testId: string,
  items: readonly string[],
  fullText?: string,
): string {
  const describedBy = fullText
    ? ` title="${fullText}" aria-label="${fullText}"`
    : "";
  return `<span class="skill-cast-hint" data-testid="${testId}"${describedBy}>${items
    .map((item) => `<span>${item}</span>`)
    .join('<i class="selected-unit-separator" aria-hidden="true">・</i>')}</span>`;
}

/**
 * The same snapshot `renderHud` puts in the DOM, formatted the way module 29
 * formats it before drawing: every number is a five-character field whose
 * leading zeroes became spaces, and the identity halves are padded into the two
 * eight-byte buffers rather than centred.
 */
function nativeUnitDetailText(
  controller: GameController,
  unit: BattleUnit,
  stats: UnitStats,
): NativeUnitDetailText {
  const baseStats = controller.battle.statsFor(unit);
  const concealed = controller.battle.stage.id === "stage-37" && unit.side === 2;
  const field = (value: number) => concealed ? NATIVE_CONCEALED_FIELD : nativeNumericField(value);
  return {
    occupation: unit.className,
    name: unitDisplayName(unit),
    statFields: {
      life: [field(unit.life), field(stats.maxLife)],
      attack: [field(stats.attack), field(baseStats.attack)],
      defense: [field(stats.defense), field(baseStats.defense)],
      levelGrowthRow: [field(stats.level)],
      experience: [field(unit.experience), field(nextExperienceThresholdFor(unit))],
    },
    statusCounters: activeUnitStatusPresentations(unit.statuses)
      .map(({ remainingRounds }) => remainingRounds),
  };
}

function renderHud(
  controller: GameController,
  unit: NonNullable<GameController["focusedUnit"]>,
  stats: UnitStats,
): string {
  const baseStats = controller.battle.statsFor(unit);
  const concealedBossStats = controller.battle.stage.id === "stage-37" && unit.side === 2;
  const hpPercent = Math.max(0, Math.min(100, Math.floor(unit.life / stats.maxLife * 100)));
  const nextExperience = nextExperienceThresholdFor(unit);
  const expPercent = Math.max(0, Math.min(100, Math.floor(unit.experience * 100 / Math.max(1, nextExperience))));
  const context = unitContextPresentation(controller, unit);
  const displayName = unitDisplayName(unit);
  // Native HUD always draws both fields at fixed positions, including the
  // generic-identity case where profession and unit name are identical.
  const identity = `${unit.className}／${displayName}`;
  const identityLength = [...identity].length;
  const identityClass = identityLength >= 11
    ? "hud-identity-name is-tight"
    : identityLength >= 9
      ? "hud-identity-name is-compact"
      : "hud-identity-name";
  const statusIcons = activeUnitStatusPresentations(unit.statuses);
  // The native HUD only drew the icon and its low-order counter, so the hover
  // plate is a browser reading aid. It lives inside its own `<li>` and opens on
  // `:hover`, which keeps it correct across HUD re-renders without a second
  // source of hint state; `--status-column` lets every column anchor its right
  // edge to the panel's left edge instead of to its own icon.
  const statusMarkup = statusIcons.length === 0 ? "" : `
    <ul class="hud-status-list" data-testid="unit-status-list" aria-label="目前狀態">
      ${statusIcons.map(({ key, label, description, source, remainingRounds }, index) => `
        <li class="hud-status-item" data-testid="status-icon-${key}"
          style="--status-column:${index % 4}"
          data-status-key="${key}" data-remaining-rounds="${remainingRounds}"
          aria-label="${label}，剩餘 ${remainingRounds} 回合"
          aria-describedby="status-tooltip-${key}">
          <img src="${source}" alt="" aria-hidden="true" />
          <span aria-hidden="true">${remainingRounds}</span>
          <div class="hud-status-tooltip" id="status-tooltip-${key}" role="tooltip"
            data-testid="status-tooltip-${key}">
            <b>${label}</b><i>剩餘 ${remainingRounds} 回合</i><em>${description}</em>
          </div>
        </li>`).join("")}
    </ul>`;
  return `
    <div class="unit-detail" data-testid="unit-detail" data-concealed-stats="${concealedBossStats}" aria-label="${context.controlSummary}，${unit.className}${displayName}${context.tacticLabel ? `，戰術${context.tacticLabel}` : ""}${context.traitDescription ? `，職業特性${context.traitDescription}` : ""}${context.routePulseSafetyLabel ? `，力場${context.routePulseSafetyLabel}` : ""}${concealedBossStats ? "，數值隱藏" : ""}">
      <div class="unit-detail-shade" aria-hidden="true"></div>
      ${animatedPortraitMarkup(unit.portrait, {
        alt: `${displayName}肖像`,
        channel: "hud",
        className: "hud-portrait",
        wrapperTestId: "unit-portrait-composite",
        baseTestId: "unit-portrait",
      })}
      <img class="hud-unit-top-chrome" data-testid="hud-unit-top-chrome"
        src="${ASSETS.sidePanelChrome.unitTop}" alt="" aria-hidden="true" />
      <img class="hud-unit-body-frame" data-testid="hud-unit-body-frame"
        src="${ASSETS.sidePanelChrome.unitBody}" alt="" aria-hidden="true" />
      <div class="hud-identity" data-testid="hud-identity">
        <b class="${identityClass}" title="${identity}">${identity}</b>
      </div>
      <div class="meter-bar hp-bar" data-testid="hp-bar" aria-label="${concealedBossStats ? "生命數值隱藏" : `生命 ${unit.life}／${stats.maxLife}`}"><i style="height:${hpPercent}%"></i></div>
      <div class="meter-bar exp-bar" data-testid="exp-bar" aria-label="${concealedBossStats ? "經驗數值隱藏" : `經驗 ${unit.experience}／${nextExperience}`}"><i style="height:${expPercent}%"></i></div>
      <dl class="stat-list">
        <div class="unit-core-stat"><dt>生命</dt><dd>${concealedBossStats ? "?????／?????" : `${unit.life}／${stats.maxLife}`}</dd></div>
        <div class="unit-core-stat" data-testid="unit-attack-stat"><dt>攻擊</dt><dd>${concealedBossStats ? "?????／?????" : `${stats.attack}／${baseStats.attack}`}</dd></div>
        <div class="unit-core-stat" data-testid="unit-defense-stat"><dt>防禦</dt><dd>${concealedBossStats ? "?????／?????" : `${stats.defense}／${baseStats.defense}`}</dd></div>
        <div class="unit-core-stat" data-testid="unit-level-stat"><dt>等級</dt><dd>${concealedBossStats ? "?????" : stats.level}</dd></div>
        <div class="unit-core-stat"><dt>經驗</dt><dd>${concealedBossStats ? "?????／?????" : `${unit.experience}／${nextExperience}`}</dd></div>
      </dl>
      ${statusMarkup}
    </div>`;
}

function renderTerrainInspection(inspection: TerrainInspection): string {
  const reference = inspection.referenceUnit;
  const movement = reference
    ? inspection.traversable
      ? String(inspection.movementCost)
      : "不可進入"
    : "依職業";
  const defense = reference
    ? inspection.traversable
      ? `+${inspection.defenseBonusPercent}%（+${inspection.defenseBonusPoints}）`
      : "—"
    : "依職業";
  const aria = [
    `地形 ${inspection.terrainName}`,
    `座標 ${inspection.position.x},${inspection.position.y}`,
    reference ? `參照 ${reference.name} ${reference.className}` : "尚無參照單位",
    `移動損耗 ${movement}`,
    "攻擊加成 無",
    `防禦加成 ${defense}`,
  ].join("，");
  return `
    <section class="terrain-detail" data-testid="terrain-detail" data-terrain-slot="${inspection.terrainSlot}"
      role="status" aria-label="${aria}">
      <header><span>地形特性</span></header>
      <p class="terrain-headline">
        <b data-testid="terrain-name">${inspection.terrainName}</b><span
          class="terrain-position" data-testid="terrain-position">格 ${inspection.position.x}，${inspection.position.y}</span>
      </p>
      <dl>
        <div class="terrain-reference-row"><dt>參照</dt><dd data-testid="terrain-reference">${reference ? `${reference.name}・${reference.className}` : "未選擇單位"}</dd></div>
        <div><dt>移動損耗</dt><dd data-testid="terrain-movement-cost">${movement}</dd></div>
        <div><dt>攻擊加成</dt><dd data-testid="terrain-attack-bonus">無</dd></div>
        <div><dt>防禦加成</dt><dd data-testid="terrain-defense-bonus">${defense}</dd></div>
      </dl>
      <p class="terrain-note">移動與防禦依參照職業計算</p>
      <button type="button" class="terrain-detail-close" data-action="close-terrain-inspection"
        data-testid="close-terrain-detail" aria-label="關閉地形特性">×</button>
    </section>`;
}

interface RecordPanelConfig {
  /** 面板标题原文，例如「讀取遊戲進度」。 */
  readonly title: string;
  readonly selectedIndex: number;
  /** 槽位与翻页按钮的 `data-action`；两个表面各自路由到不同的控制器方法。 */
  readonly slotAction: string;
  readonly pageAction: string;
  readonly pageDeltaAttribute: string;
  readonly slotTestIdPrefix: string;
  readonly pageTestIdPrefix: string;
  /** 每个槽位按钮的附加属性，承载各自的索引契约。 */
  readonly slotAttributes: (index: number, slot: number) => string;
  /** 读取模式下空槽不可确认；储存模式允许覆盖。 */
  readonly disableEmptySlots: boolean;
  readonly cancelAction?: string;
  /** 戰中記錄面板可直接備份全部二十槽；戰後單次存檔面板不顯示這組宿主工具。 */
  readonly showBackupTools?: boolean;
  readonly backupStatus?: string;
}

// 战中「儲存記錄／讀取記錄」与战后「儲存遊戲進度」共用同一张面板：原版这两处是
// 弹出式资料面板而不是通用选单外框，列出逐槽元数据而不是单行摘要。原版五列
// 「職業/等級/經驗值/儲存次數/難度」的前三列取自保存器的工作单位快照，对复刻版
// 玩家没有辨识价值，因此按产品决定换成「關卡名／回合數」，保留后两列。
function renderRecordPanel(controller: GameController, config: RecordPanelConfig): string {
  const page = saveSlotPageIndex(config.selectedIndex);
  const start = saveSlotPageStart(config.selectedIndex);
  const rows = Array.from({ length: SAVE_SLOTS_PER_PAGE }, (_, localIndex) => {
    const index = start + localIndex;
    const slot = index + 1;
    const save = controller.readSave(slot);
    const selected = index === config.selectedIndex;
    const disabled = config.disableEmptySlots && !save;
    const cells = save
      ? `<span class="record-cell-name">${save.stageLabel}</span><span
          class="record-cell-round">${save.kind === "battle" ? save.battle?.round ?? 1 : "完"}</span><span
          class="record-cell-count">${save.saveCount}</span><span
          class="record-cell-difficulty">${DIFFICULTY_OPTIONS[save.difficulty].label}</span>`
      : `<span class="record-cell-empty">此處沒有記錄</span>`;
    return `<button type="button" role="menuitem" class="record-slot ${selected ? "is-selected" : ""}"
      data-action="${config.slotAction}" ${config.slotAttributes(index, slot)}
      data-testid="${config.slotTestIdPrefix}-${slot}" aria-current="${selected ? "true" : "false"}"
      ${disabled ? "disabled" : ""}><span class="record-cell-index">${slot}</span><span
        class="record-slot-bar">${cells}</span></button>`;
  }).join("");
  const cancel = config.cancelAction
    ? `<button type="button" class="record-panel-cancel" data-action="${config.cancelAction}">取 消</button>`
    : "";
  const backupStatus = config.showBackupTools
    ? `<span class="record-panel-backup-status" data-testid="record-backup-status"
        aria-live="polite">${config.backupStatus ?? ""}</span>`
    : "";
  const backupTools = config.showBackupTools
    ? `<div class="record-panel-backup-tools" role="group" aria-label="記錄備份">
        <button type="button" data-action="record-backup-export"
          data-testid="record-backup-export">匯 出</button>
        <button type="button" data-action="record-backup-import"
          data-testid="record-backup-import">匯 入</button>
      </div>`
    : "";
  return `<div class="record-panel-title"><strong>${config.title}</strong>${backupStatus}</div>
    <div class="record-panel-header" aria-hidden="true"><span class="record-cell-index">槽</span><span
      class="record-slot-bar"><span class="record-cell-name">關卡名</span><span
        class="record-cell-round">回合數</span><span class="record-cell-count">儲存次數</span><span
        class="record-cell-difficulty">難度</span></span></div>
    <div class="record-panel-slots">${rows}</div>
    <div class="record-panel-foot">
      ${backupTools}
      <div class="record-panel-pagination">
        <button type="button" data-action="${config.pageAction}" ${config.pageDeltaAttribute}="-1"
          data-testid="${config.pageTestIdPrefix}-previous-page" aria-label="上一頁">◀</button>
        <span data-testid="${config.pageTestIdPrefix}-page">第 ${page + 1}／${SAVE_SLOT_PAGE_COUNT} 頁</span>
        <button type="button" data-action="${config.pageAction}" ${config.pageDeltaAttribute}="1"
          data-testid="${config.pageTestIdPrefix}-next-page" aria-label="下一頁">▶</button>
      </div>
      ${cancel}
    </div>`;
}

function renderTactical(controller: GameController, underUnit = false): string {
  const markers = underUnit ? "" : controller.battle.units.map((unit) =>
    `<i class="minimap-unit side-${unit.side}" style="left:${unit.x * 3}px;top:${unit.y * 3}px" aria-hidden="true"></i>`,
  ).join("");
  const viewport = controller.cameraOrigin;
  const minimap = controller.currentStageAssets?.minimap ?? ASSETS.minimap;
  const toggleState: Record<SidePanelToggleVisualId, boolean> = {
    battleAnimation: controller.battlePresentation === "full",
    grid: controller.gridEnabled,
    edgeScroll: controller.edgeScrollEnabled,
    portraits: controller.portraitsEnabled,
  };
  const statePatches = SIDE_PANEL_TOGGLE_VISUALS.map((visual) => {
    const state = toggleState[visual.id] ? "on" : "off";
    const frame = visual.nativeFrames[state];
    return `<img
      class="tactical-panel-state"
      src="${ASSETS.tacticalPanel.states[visual.id][state]}"
      style="left:${visual.origin.x}px;top:${visual.origin.y}px;width:${visual.size.width}px;height:${visual.size.height}px"
      data-testid="tactical-panel-${visual.id}-state"
      data-state="${state}"
      data-native-frame="${frame}"
      alt=""
      aria-hidden="true"
    />`;
  }).join("");
  return `
    <div class="hud-tactical${underUnit ? " under-unit" : ""}" data-testid="tactical-hud" aria-label="戰術輔助與即時小地圖">
      <img class="tactical-panel-art" src="${ASSETS.tacticalPanel.foundation}" alt="戰術桌、卷軸與照明器具" />
      ${statePatches}
      <div class="tactical-minimap" data-testid="tactical-minimap" aria-label="${controller.battle.stage.name}即時小地圖">
        <img src="${minimap}" alt="" />
        ${underUnit ? "" : `<span class="minimap-viewport" style="left:${viewport.x * 3}px;top:${viewport.y * 3}px" aria-hidden="true"></span>`}
        ${underUnit ? "" : `<span class="minimap-preview" data-testid="minimap-preview" aria-hidden="true" hidden></span>`}
        ${markers}
      </div>
      <img class="tactical-minimap-frame" data-testid="tactical-minimap-frame"
        src="${ASSETS.sidePanelChrome.minimap}" alt="" aria-hidden="true" />
    </div>`;
}

function renderResult(layer: HTMLElement, controller: GameController): void {
  const phase = controller.phase;
  layer.hidden = !["defeat", "victoryFeedback", "savePrompt", "saveSlots", "quit", "nextStage"].includes(phase);
  if (layer.hidden) {
    delete layer.dataset.resultPhase;
    return;
  }
  if (phase === "savePrompt" && layer.dataset.resultPhase === "savePrompt") {
    // 選單本體已經在畫面上，這次重繪只是確定／取消的選取索引變了：原地切換
    // `is-selected`，不要整段換新節點，否則方框會被當成剛掛上的元素，
    // 讓 `native-menu-zoom-in` 的彈出動畫每次切換都重播一次。
    for (const button of layer.querySelectorAll<HTMLButtonElement>("[data-save-prompt-index]")) {
      const selected = Number(button.dataset.savePromptIndex) === controller.savePromptIndex;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-current", String(selected));
    }
    return;
  }
  layer.dataset.resultPhase = phase;
  if (phase === "defeat") {
    const text = "啊！．．．竟然失敗了？\n我太低辜敵人的實力，再給我一次機會吧！";
    layer.innerHTML = nativeFeedbackMarkup(text, "retry", "retry-button");
  } else if (phase === "victoryFeedback") {
    const text = controller.isCampaignPersistenceEnabled
      ? "哦！．．\n這次的戰役結束了，是否要記錄下來．"
      : "競技場測試已結束。\n可使用上方工具列返回編成，或以相同陣容重開。";
    layer.innerHTML = nativeFeedbackMarkup(text, "victory-continue", "victory-continue");
  } else if (phase === "savePrompt") {
    const text = "哦！．．\n這次的戰役結束了，是否要記錄下來．";
    layer.innerHTML = `${nativeFeedbackMarkup(text)}
      <div class="native-confirm-menu action-menu native-command-menu" data-testid="save-confirm-menu"
        data-kind="confirmation" role="menu" aria-label="是否儲存">
        <button type="button" role="menuitem" data-action="save-yes" data-save-prompt-index="0" data-testid="save-yes"
          class="${controller.savePromptIndex === 0 ? "is-selected" : ""}" aria-current="${controller.savePromptIndex === 0}"><span class="native-command-label">確 定</span></button>
        <button type="button" role="menuitem" data-action="save-no" data-save-prompt-index="1" data-testid="save-no"
          class="${controller.savePromptIndex === 1 ? "is-selected" : ""}" aria-current="${controller.savePromptIndex === 1}"><span class="native-command-label">取 消</span></button>
      </div>`;
  } else if (phase === "saveSlots") {
    layer.innerHTML = `<div class="record-panel post-save-panel" role="menu" aria-label="儲存遊戲進度">${
      renderRecordPanel(controller, {
        title: "儲存遊戲進度",
        selectedIndex: controller.postSaveSlotIndex,
        slotAction: "save-slot",
        pageAction: "post-save-page",
        pageDeltaAttribute: "data-post-save-page-delta",
        slotTestIdPrefix: "save-slot",
        pageTestIdPrefix: "post-save",
        slotAttributes: (index, slot) => `data-slot="${slot}" data-post-save-index="${index}"`,
        disableEmptySlots: false,
      })
    }</div>`;
  } else if (phase === "quit") {
    layer.innerHTML = `<div class="quit-screen" data-testid="quit-screen"><h2>天使帝國 II</h2><p>已離開遊戲</p></div>`;
  } else if (phase === "nextStage") {
    if (!controller.isCampaignPersistenceEnabled) {
      layer.innerHTML = `<div class="modal-panel result-card next-card" data-testid="arena-complete-card"><span class="panel-kicker">ARENA COMPLETE</span><h2>競技場測試完成</h2><p>本次結果只存在記憶體中；請使用上方工具列返回編成或重開相同陣容。</p><div class="completion-seal">測試完成</div></div>`;
      return;
    }
    const progress = controller.currentStageProgressMetadata;
    const destinationOrdinal = progress.completedOrdinal + 1;
    const stageCode = String(destinationOrdinal).padStart(2, "0");
    if (progress.destinationId === "stage-49") {
      layer.innerHTML = `<div class="modal-panel result-card next-card" data-testid="stage49-ending-ready"><span class="panel-kicker">MAIN ENDING</span><h2>第 ${progress.completedOrdinal} 關已完成</h2><p>主線結局已接入：戰後道別、戰績回顧與條件尾聲將依序播放。</p><button type="button" class="primary-cta" data-action="start-stage49-ending" data-testid="start-stage49-ending">觀看主線結局</button><div class="completion-seal">究極女神 完成</div></div>`;
      return;
    }
    layer.innerHTML = `<div class="modal-panel result-card next-card"><span class="panel-kicker">STAGE ${stageCode}</span><h2>第 ${progress.completedOrdinal} 關已完成</h2><p>戰役進度已寫入「${progress.destinationLabel}」（${progress.destinationId}）入口；該關仍在設計凍結範圍內，尚未接入可玩流程。</p><div class="completion-seal">第 ${progress.completedOrdinal} 關完成</div></div>`;
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
    <b class="feedback-portrait-name" data-testid="feedback-portrait-name"
      aria-hidden="true">${niaPortraitDisplayName}</b>
    <div class="dialogue-copy native-feedback-copy"><p data-testid="feedback-text" data-full-text="${escapedText}"></p><span class="continue-mark">▼</span></div>
    ${action ? `<button class="feedback-primary" data-action="${action}" ${testId ? `data-testid="${testId}"` : ""} aria-label="繼續"></button>` : ""}
  </div>`;
}

function required<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`missing UI element ${selector}`);
  return element;
}

function bindGamepad(controller: GameController, onInput: () => void): () => void {
  let priorButtons: boolean[] = [];
  let lastNavigation = 0;
  let animationFrame = 0;
  const poll = (time: number) => {
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const pressed = pad.buttons.map((button) => button.pressed);
      const newlyPressed = (button: number) => pressed[button] && !priorButtons[button];
      if (newlyPressed(0)) { onInput(); controller.primaryAtCursor(); }
      if (newlyPressed(1)) { onInput(); controller.secondaryAction(); }
      if (controller.actionMode === "shotRoute") {
        if (newlyPressed(4)) { onInput(); controller.cycleMagicArcherRoute(-1); }
        if (newlyPressed(5)) { onInput(); controller.cycleMagicArcherRoute(1); }
      } else if (newlyPressed(5)) {
        onInput();
        void controller.focusNextUnactedAlly();
      }
      if (newlyPressed(3)) {
        onInput();
        if (controller.groupCommandOpen) controller.closeGroupCommands();
        else controller.openGroupCommands();
      }
      if (controller.actionMode !== "shotRoute" && (newlyPressed(4) || newlyPressed(8))) {
        onInput();
        if (controller.objectiveOpen) controller.closeObjectives();
        else controller.openObjectives();
      }
      if (newlyPressed(9)) {
        onInput();
        if (!controller.secondaryAction()) controller.systemAction();
      }
      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;
      const x = pressed[14] ? -1 : pressed[15] ? 1 : axisX;
      const y = pressed[12] ? -1 : pressed[13] ? 1 : axisY;
      if (time - lastNavigation > 150) {
        if (x < -0.6) { onInput(); controller.moveCursor({ x: -1, y: 0 }); lastNavigation = time; }
        else if (x > 0.6) { onInput(); controller.moveCursor({ x: 1, y: 0 }); lastNavigation = time; }
        else if (y < -0.6) { onInput(); controller.moveCursor({ x: 0, y: -1 }); lastNavigation = time; }
        else if (y > 0.6) { onInput(); controller.moveCursor({ x: 0, y: 1 }); lastNavigation = time; }
      }
      priorButtons = pressed;
    }
    animationFrame = requestAnimationFrame(poll);
  };
  animationFrame = requestAnimationFrame(poll);
  return () => cancelAnimationFrame(animationFrame);
}
