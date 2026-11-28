import type { GameController } from "../controller";
import { onProgramPauseChange, isProgramHeldSilently } from "../program-clock";
import { PROGRAM_PAUSE_EXEMPT_ATTRIBUTE } from "../program-pause";
import { portraitStyle } from "../portrait-style";
import type { DialoguePage, GamePhase } from "../types";

type Record = (type: string, detail?: Readonly<{ [key: string]: unknown }>) => void;

/**
 * 從控制器狀態推導錄製事件：每次 `emit()` 比對上一個快照，只讀不寫。對白翻頁、階段、劇情
 * 結束、戰鬥與技能演出、選單開闔都已經是控制器狀態，不必在遊戲各處另插觀察點。
 */

/** 劇情段落內的階段；離開它們進入其餘階段就是「劇情放完，交回玩家」。 */
const STORY_SEGMENT_PHASES = new Set<GamePhase>([
  "prebattleStory",
  "openingStory",
  "round2Story",
  "victoryStory",
  "scriptedStory",
  "scriptedMove",
]);

interface DialogueSnapshot {
  readonly key: string;
  readonly detail: Readonly<{ [key: string]: unknown }>;
  readonly backgroundId?: number;
}

const activeWindow = (page: DialoguePage) =>
  (page.activeSlot === "upper" ? page.upper : page.activeSlot === "lower" ? page.lower : undefined)
  ?? page.lower
  ?? page.upper;

function dialogueSnapshot(controller: GameController): DialogueSnapshot | undefined {
  const page = controller.currentDialogue;
  if (!page) return undefined;
  const window = activeWindow(page);
  const detail = {
    record: page.source.record,
    page: controller.dialogueIndex,
    speaker: window?.speaker ?? null,
    portrait: window?.portrait ?? null,
  };
  return {
    key: JSON.stringify([detail, page.upper?.text, page.lower?.text, page.source.address]),
    detail,
    backgroundId: page.source.backgroundId,
  };
}

/** 控制器自己的選單；宿主選單與參考面板另外觀察。 */
function openControllerMenus(controller: GameController): Set<string> {
  const open = new Set<string>();
  if (controller.systemMenuOpen) open.add("system");
  if (controller.settingsOpen) open.add("settings");
  if (controller.soundSettingsOpen) open.add("sound-settings");
  if (controller.musicSettingsOpen) open.add("music-settings");
  if (controller.objectiveOpen) open.add("objective");
  if (controller.groupCommandOpen) open.add("group-command");
  if (controller.recordMenuMode !== undefined) open.add("records");
  if (controller.quitConfirmOpen) open.add("quit-confirm");
  if (controller.retreatConfirmOpen) open.add("retreat-confirm");
  if (controller.dialogueSkipConfirmOpen) open.add("dialogue-skip-confirm");
  if (controller.actionMode === "actionMenu") open.add("command");
  if (controller.actionMode === "techniqueMenu") open.add("technique");
  return open;
}

function openReferencePanels(): Set<string> {
  const open = new Set<string>();
  for (const element of document.querySelectorAll<HTMLElement>(`[${PROGRAM_PAUSE_EXEMPT_ATTRIBUTE}]`)) {
    if (element.hidden || !element.isConnected) continue;
    open.add(element.dataset.testid ?? element.className);
  }
  return open;
}

const diffMenus = (record: Record, previous: Set<string>, next: Set<string>) => {
  for (const menu of previous) if (!next.has(menu)) record("menu-close", { menu });
  for (const menu of next) if (!previous.has(menu)) record("menu-open", { menu });
};

export function observeControllerEvents(controller: GameController, record: Record): () => void {
  let phase = controller.phase;
  let dialogue = dialogueSnapshot(controller);
  let lastStoryRecord: unknown = dialogue?.detail.record;
  let backgroundId = dialogue?.backgroundId;
  let combat = controller.combatPresentation;
  let technique = controller.specialActionPresentation;
  let menus = openControllerMenus(controller);
  let creditsEnded = controller.credits?.section === "the-end";

  // 掛載前就已經在畫面上的狀態：起跑時記成 `preStart`。
  record("phase", { phase });
  if (dialogue) record("dialogue-page", dialogue.detail);
  if (backgroundId !== undefined) record("story-art", { background: backgroundId, style: portraitStyle() });

  const sync = () => {
    if (controller.phase !== phase) {
      const previous = phase;
      phase = controller.phase;
      record("phase", { phase, previous });
      if (STORY_SEGMENT_PHASES.has(previous) && !STORY_SEGMENT_PHASES.has(phase)) {
        record("story-end", { record: lastStoryRecord ?? null, phase });
      }
    }
    const nextDialogue = dialogueSnapshot(controller);
    if (nextDialogue && nextDialogue.key !== dialogue?.key) {
      record("dialogue-page", nextDialogue.detail);
      if (typeof nextDialogue.detail.record === "number") lastStoryRecord = nextDialogue.detail.record;
    }
    dialogue = nextDialogue;
    if (nextDialogue?.backgroundId !== undefined && nextDialogue.backgroundId !== backgroundId) {
      backgroundId = nextDialogue.backgroundId;
      record("story-art", { background: backgroundId, style: portraitStyle() });
    }
    const nextCombat = controller.combatPresentation;
    if (nextCombat?.result !== combat?.result) {
      if (combat) record("combat-end", { attacker: combat.attacker.classId, defender: combat.defender.classId });
      if (nextCombat) {
        record("combat-start", {
          attacker: nextCombat.attacker.classId,
          defender: nextCombat.defender.classId,
          attackerId: nextCombat.attacker.id,
          defenderId: nextCombat.defender.id,
          full: nextCombat.fullScene !== undefined,
        });
      }
    }
    combat = nextCombat;
    const nextTechnique = controller.specialActionPresentation;
    if (nextTechnique?.result !== technique?.result) {
      if (technique) record("technique-end", { action: technique.result.actionId, caster: technique.actor.id });
      if (nextTechnique) {
        record("technique-start", {
          action: nextTechnique.result.actionId,
          caster: nextTechnique.actor.id,
          casterClass: nextTechnique.actor.classId,
        });
      }
    }
    technique = nextTechnique;
    const nextMenus = openControllerMenus(controller);
    diffMenus(record, menus, nextMenus);
    menus = nextMenus;
    const ended = controller.credits?.section === "the-end";
    if (ended && !creditsEnded) record("credits-end");
    creditsEnded = ended;
  };

  // 宿主選單即程式暫停（準備門的無遮罩凍結除外）；參考面板是 body 下的豁免根節點。
  let hostMenuOpen = false;
  const unsubscribePause = onProgramPauseChange((paused) => {
    if (isProgramHeldSilently() || paused === hostMenuOpen) return;
    hostMenuOpen = paused;
    record(paused ? "menu-open" : "menu-close", { menu: "host-menu" });
  });
  let panels = openReferencePanels();
  const panelObserver = new MutationObserver(() => {
    const next = openReferencePanels();
    diffMenus(record, panels, next);
    panels = next;
  });
  panelObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

  const unsubscribe = controller.onChange(sync);
  return () => {
    unsubscribe();
    unsubscribePause();
    panelObserver.disconnect();
  };
}
