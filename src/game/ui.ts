import { ASSETS, STAGE0, nextExperienceThresholdFor } from "./content/stage0";
import type { GameController } from "./controller";
import type { GamePhase, Position, UnitStats } from "./types";
import type { AudioManager } from "./audio";
import { animatedPortraitMarkup, configureAnimatedPortrait, startPortraitBlinking } from "./portrait";

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
            <button class="system-menu-hotspot" data-action="open-system-menu" data-testid="system-menu-button" aria-label="開啟遊戲功能" title="遊戲功能"></button>
            <button class="group-command-hotspot" data-action="open-group-commands" data-testid="group-command-hotspot" aria-label="開啟集體命令" title="集體命令"></button>
            <button class="all-rest-hotspot" data-action="all-rest" data-testid="all-rest-hotspot" aria-label="全部休息" title="全部休息"></button>
            <section class="system-menu modal-panel" id="system-menu" data-testid="system-menu" role="dialog" aria-label="遊戲功能" hidden>
              <span class="panel-kicker">SYSTEM</span><h2>遊戲功能</h2>
              <div class="system-menu-grid">
                <button data-action="objectives" data-testid="objectives-button">勝利條件</button>
                <button data-action="open-group-commands" data-testid="group-commands-button">集體命令</button>
                <button data-action="speed" data-testid="speed-button">動畫 ×1</button>
                <button data-action="battle-presentation" data-testid="presentation-button">戰鬥 地圖</button>
                <button data-action="music" data-testid="music-button">音樂 開</button>
                <button data-action="sound" data-testid="sound-button">音效 開</button>
                <button data-action="speech" data-testid="speech-button">逐字音 開</button>
                <button data-action="close-system-menu">返回戰場</button>
              </div>
            </section>
            <section class="group-command-menu action-menu" id="group-command-menu" data-testid="group-command-menu" role="menu" aria-label="集體命令" hidden></section>
            <section class="retreat-confirm modal-panel" id="retreat-confirm" data-testid="retreat-confirm" role="dialog" aria-label="全面撤退確認" hidden>
              <span class="panel-kicker">全面徹退</span>
              <p>哦！．．．要撤退嗎？<br />必竟是沒辦法的事，雙方的實力差太多了．</p>
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
              <div class="dialogue-box" id="dialogue-box">
                <span class="animated-portrait dialogue-portrait" id="dialogue-portrait"
                  data-testid="dialogue-portrait-composite" data-blink-frame="1" data-blink-count="0" hidden></span>
                <div class="dialogue-copy"><b id="dialogue-speaker"></b><p id="dialogue-text"></p><span class="continue-mark">▼</span></div>
              </div>
              <div class="dialogue-controls">
                <button data-action="advance-dialogue" data-testid="advance-dialogue">繼續</button>
                <button data-action="skip-dialogue" data-testid="skip-dialogue">跳過本段</button>
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
  const dialogueBox = required(root, "#dialogue-box");
  const dialoguePortrait = required(root, "#dialogue-portrait");
  const dialogueSpeaker = required(root, "#dialogue-speaker");
  const dialogueText = required(root, "#dialogue-text");
  const storyBackground = required(root, "#story-background");
  const objectivePanel = required(root, "#objective-panel");
  const systemMenu = required(root, "#system-menu");
  const groupCommandMenu = required(root, "#group-command-menu");
  const retreatConfirm = required(root, "#retreat-confirm");
  const resultLayer = required(root, "#result-layer");
  let dialogueTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let activeDialogueKey = "";
  let dialogueFullText = "";
  let revealedCharacters = 0;
  startPortraitBlinking(root, controller.isTestMode);

  const stopDialogueTimer = () => {
    if (dialogueTimer !== undefined) globalThis.clearTimeout(dialogueTimer);
    dialogueTimer = undefined;
  };
  const revealDialogue = (fullText: string, key: string) => {
    stopDialogueTimer();
    activeDialogueKey = key;
    dialogueFullText = fullText;
    revealedCharacters = 0;
    dialogueText.textContent = "";
    const tick = () => {
      if (activeDialogueKey !== key || revealedCharacters >= dialogueFullText.length) {
        dialogueTimer = undefined;
        return;
      }
      const character = dialogueFullText[revealedCharacters];
      revealedCharacters += 1;
      dialogueText.textContent = dialogueFullText.slice(0, revealedCharacters);
      if (/[^\x00-\x7f]/u.test(character)) audio.playSpeechCharacter(character);
      const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      dialogueTimer = globalThis.setTimeout(tick, controller.presentationFast || reducedMotion ? 12 : 80);
    };
    tick();
  };
  const finishDialogueTyping = (): boolean => {
    if (!dialogueFullText || revealedCharacters >= dialogueFullText.length) return false;
    stopDialogueTimer();
    revealedCharacters = dialogueFullText.length;
    dialogueText.textContent = dialogueFullText;
    return true;
  };

  root.addEventListener("click", (event) => {
    const minimap = (event.target as Element).closest<HTMLElement>("[data-testid=tactical-minimap]");
    if (minimap) {
      controller.commitMinimapPreview();
      return;
    }
    const button = (event.target as Element).closest<HTMLElement>("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "advance-dialogue") {
      if (!finishDialogueTyping()) controller.advanceDialogue();
    }
    else if (action === "skip-dialogue") controller.skipDialogue();
    else if (action === "open-system-menu") controller.openSystemMenu();
    else if (action === "close-system-menu") controller.closeSystemMenu();
    else if (action === "open-group-commands") controller.openGroupCommands();
    else if (action === "close-group-commands") controller.closeGroupCommands();
    else if (action === "all-rest") void controller.allRest();
    else if (action === "follow-leader") void controller.followLeader();
    else if (action === "free-action") void controller.freeAction();
    else if (action === "request-retreat") controller.requestRetreat();
    else if (action === "retreat-confirm") controller.confirmRetreat();
    else if (action === "retreat-cancel") controller.cancelRetreat();
    else if (action === "objectives") controller.openObjectives();
    else if (action === "close-objectives") controller.closeObjectives();
    else if (action === "speed") controller.toggleSpeed();
    else if (action === "battle-presentation") controller.toggleBattlePresentation();
    else if (action === "music") controller.toggleMusic();
    else if (action === "sound") controller.toggleSound();
    else if (action === "speech") controller.toggleSpeech();
    else if (action === "move") controller.chooseMove();
    else if (action === "attack") controller.chooseAttack();
    else if (action === "rest") controller.chooseRest();
    else if (action === "end-unit") controller.chooseEnd();
    else if (action === "undo-move") controller.chooseUndo();
    else if (action === "retry") controller.retry();
    else if (action === "victory-continue") controller.continueAfterVictory();
    else if (action === "save-yes") controller.showSaveSlots();
    else if (action === "save-no") controller.skipSave();
    else if (action === "save-slot") controller.selectSaveSlot(Number(button.dataset.slot));
    else if (action === "overwrite-confirm") controller.confirmOverwrite();
    else if (action === "overwrite-cancel") controller.cancelOverwrite();
  });

  root.addEventListener("pointerover", (event) => {
    const command = (event.target as Element).closest<HTMLElement>("[data-command-index]");
    if (command) controller.selectCommand(Number(command.dataset.commandIndex));
    const groupCommand = (event.target as Element).closest<HTMLElement>("[data-group-command-index]");
    if (groupCommand) controller.selectGroupCommand(Number(groupCommand.dataset.groupCommandIndex));
    const retreatChoice = (event.target as Element).closest<HTMLElement>("[data-retreat-index]");
    if (retreatChoice) controller.selectRetreatChoice(Number(retreatChoice.dataset.retreatIndex));
  });

  root.addEventListener("pointermove", (event) => {
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
    if (!(event.target instanceof HTMLCanvasElement)) controller.secondaryAction();
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
      if (!finishDialogueTyping()) controller.primaryAtCursor();
    }
    else if (key === "Alt" || key === "Delete" || key === "Enter") controller.secondaryAction();
    else if (key === "Escape") controller.systemAction();
    else if (key === "Tab") controller.groupCommandOpen ? controller.closeGroupCommands() : controller.openGroupCommands();
    else if (key === "F1") void controller.allRest();
    else if (key === "F2") void controller.followLeader();
    else if (key === "F3") void controller.freeAction();
    else if (key === "F4") controller.requestRetreat();
    else if (lower === "e") controller.toggleSound();
    else if (lower === "m") controller.toggleMusic();
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
    const speed = root.querySelector<HTMLElement>("[data-action=speed]");
    if (speed) speed.textContent = controller.presentationFast ? "動畫 ×4" : "動畫 ×1";
    const presentation = root.querySelector<HTMLElement>("[data-action=battle-presentation]");
    if (presentation) presentation.textContent = controller.battlePresentation === "full" ? "戰鬥 全景" : "戰鬥 地圖";
    const music = root.querySelector<HTMLElement>("[data-action=music]");
    if (music) music.textContent = controller.musicEnabled ? "音樂 開" : "音樂 關";
    const sound = root.querySelector<HTMLElement>("[data-action=sound]");
    if (sound) sound.textContent = controller.soundEnabled ? "音效 開" : "音效 關";
    const speech = root.querySelector<HTMLElement>("[data-action=speech]");
    if (speech) speech.textContent = controller.speechEnabled ? "逐字音 開" : "逐字音 關";
    for (const action of ["objectives", "open-group-commands", "battle-presentation", "all-rest"]) {
      const button = root.querySelector<HTMLButtonElement>(`[data-action=${action}]`);
      if (button) button.disabled = controller.inputLocked;
    }

    const focus = controller.describeFocus();
    screen.dataset.hudMode = focus ? "unit" : "tactical";
    hud.innerHTML = `${renderTactical(controller, Boolean(focus))}${focus ? renderHud(focus.unit, focus.stats) : ""}`;

    const page = controller.currentDialogue;
    const dialogueVisible = storyPhases.has(controller.phase) && page !== undefined;
    dialogueLayer.hidden = !dialogueVisible;
    storyBackground.hidden = controller.phase !== "prebattleStory";
    if (page) {
      const pageKey = `${controller.phase}:${controller.dialogueIndex}`;
      dialogueBox.className = `dialogue-box ${page.slot}`;
      dialogueSpeaker.textContent = page.speaker ?? "";
      dialogueSpeaker.hidden = !page.speaker;
      if (page.portrait) {
        configureAnimatedPortrait(
          dialoguePortrait,
          page.portrait,
          `${page.speaker ?? "角色"}肖像`,
          "dialogue",
          "dialogue-portrait",
        );
        dialoguePortrait.hidden = false;
      } else {
        dialoguePortrait.hidden = true;
      }
      if (activeDialogueKey !== pageKey) revealDialogue(page.text, pageKey);
    } else {
      stopDialogueTimer();
      activeDialogueKey = "";
      dialogueFullText = "";
      revealedCharacters = 0;
    }

    renderResult(resultLayer, controller);
    renderCombat(combatPresentation, controller);
  };
  controller.onChange(render);
  render();
  configureScaling(required(root, "#game-viewport"), screen);
  bindGamepad(controller);
}

function renderCombat(layer: HTMLElement, controller: GameController): void {
  const presentation = controller.combatPresentation;
  layer.hidden = !presentation;
  if (!presentation) return;
  const { attacker, defender, result, frame } = presentation;
  if (controller.battlePresentation === "map") {
    // Native map hit/death frames are rendered inside the Phaser world so
    // they obey the battle camera, clipping and board-erase boundary.
    layer.hidden = true;
    layer.innerHTML = "";
    return;
  }
  const allyFrames = ASSETS.fullBattle.allySoldier;
  const enemyFrames = defender.classId === 22 ? ASSETS.fullBattle.enemyCavalry : ASSETS.fullBattle.enemySoldier;
  layer.className = `combat-presentation full-combat frame-${frame}`;
  layer.removeAttribute("style");
  layer.innerHTML = `
    <div class="combat-title">${attacker.name}　對　${defender.name}</div>
    <div class="combatant attacker"><img src="${allyFrames[frame]}" alt="${attacker.name}攻擊動作" /><span>HP ${attacker.life}</span></div>
    <div class="impact-flash"><i>−${result.damage}</i>${result.counterDamage ? `<small>反擊 −${result.counterDamage}</small>` : ""}</div>
    <div class="combatant defender"><img src="${enemyFrames[frame]}" alt="${defender.name}受擊動作" /><span>HP ${Math.max(0, defender.life - result.damage)}</span></div>`;
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
  layer.hidden = !["defeat", "victoryFeedback", "savePrompt", "saveSlots", "nextStage"].includes(phase);
  if (layer.hidden) return;
  if (phase === "defeat") {
    layer.innerHTML = `<div class="modal-panel result-card defeat-card"><span class="panel-kicker">戰鬥失敗</span><h2>妮雅戰敗</h2><p>妮雅已從棋盤移除。本關將重新建立固定六人編隊。</p><button data-action="retry" data-testid="retry-button">重新挑戰</button></div>`;
  } else if (phase === "victoryFeedback") {
    layer.innerHTML = `<div class="modal-panel result-card victory-card"><span class="panel-kicker">VICTORY</span><h2>瓦爾克麗宮解放</h2><p>宮內敵人均已被擊倒或撤離。</p><button data-action="victory-continue" data-testid="victory-continue">繼續</button></div>`;
  } else if (phase === "savePrompt") {
    layer.innerHTML = `<div class="modal-panel result-card"><span class="panel-kicker">戰役記錄</span><h2>是否記錄本次戰役？</h2><div class="button-row"><button data-action="save-yes" data-testid="save-yes">記錄</button><button data-action="save-no">不記錄</button></div></div>`;
  } else if (phase === "saveSlots") {
    const slots = Array.from({ length: 5 }, (_, index) => {
      const slot = index + 1;
      const save = controller.readSave(slot);
      return `<button class="save-slot" data-action="save-slot" data-slot="${slot}" data-testid="save-slot-${slot}"><b>記錄 ${slot}</b><span>${save ? `第 ${save.stage} 關 · ${new Date(save.savedAt).toLocaleString("zh-Hant")}` : "空白"}</span></button>`;
    }).join("");
    const overwrite = controller.pendingSaveSlot ? `<div class="overwrite"><p>記錄 ${controller.pendingSaveSlot} 已存在。確定覆蓋？</p><div class="button-row"><button data-action="overwrite-confirm">覆蓋</button><button data-action="overwrite-cancel">取消</button></div></div>` : "";
    layer.innerHTML = `<div class="modal-panel save-card"><span class="panel-kicker">選擇記錄位置</span><h2>五個戰役記錄</h2><div class="save-grid">${slots}</div>${overwrite}</div>`;
  } else if (phase === "nextStage") {
    layer.innerHTML = `<div class="modal-panel result-card next-card"><span class="panel-kicker">STAGE 01</span><h2>下一關路由已建立</h2><p>第 0 關垂直切片到此完成；存檔已指向第 1 關關前流程。後續關卡不屬於本切片的實作範圍。</p><div class="completion-seal">垂直切片完成</div></div>`;
  }
}

function required<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`missing UI element ${selector}`);
  return element;
}

function configureScaling(viewport: HTMLElement, screen: HTMLElement): void {
  const resize = () => {
    const scale = Math.min(1, viewport.clientWidth / 640);
    viewport.style.height = `${350 * scale}px`;
    screen.style.setProperty("--game-scale", String(scale));
  };
  new ResizeObserver(resize).observe(viewport);
  resize();
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
