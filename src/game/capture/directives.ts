import { cameraOriginForFocus } from "../camera";
import type { GameController } from "../controller";
import { isProgramPaused, setProgramPaused } from "../program-clock";
import type { BattleUnit, Position } from "../types";
import type { CaptureMode } from "./capture-mode";
import type { CaptureFocus, CaptureOpenTarget, CaptureOptions } from "./options";

/**
 * 錄製模式的場景內直達（`focus`、`select`、`panel`、`open`）：在準備門之前把畫面擺到鏡頭要的
 * 狀態。全部走玩家同一條路——鏡頭與游標是表現狀態，`select` 等同點一下那格，`open` 等同按
 * 寶石再點選單列——不改模擬規則、PRNG 或存檔。
 */

export class CaptureDirectiveError extends Error {}

const unitFor = (controller: GameController, parameter: string, idOrName: string): BattleUnit => {
  const units = controller.battle.units;
  const unit = units.find(({ id }) => id === idOrName)
    ?? units.find(({ name }) => name === idOrName)
    ?? units.find(({ className }) => className === idOrName);
  if (!unit) {
    const names = [...new Set(units.flatMap(({ name, className }) => [name, className]))].join("、");
    throw new CaptureDirectiveError(`${parameter}=${idOrName}：這個場景沒有這個單位（可用單位 id、名字或職業名：${names}）。`);
  }
  return unit;
};

const focusPosition = (controller: GameController, focus: CaptureFocus): Position => {
  if (focus.kind === "unit") {
    const { x, y } = unitFor(controller, "focus", focus.unitId);
    return { x, y };
  }
  const { width, height } = controller.battle.stage;
  if (focus.x >= width || focus.y >= height) {
    throw new CaptureDirectiveError(`focus=${focus.x},${focus.y}：超出地圖範圍（${width}×${height}）。`);
  }
  return { x: focus.x, y: focus.y };
};

/** 鏡頭移到這格並把游標放上去（右欄因此顯示該格單位）。 */
const centerOn = (controller: GameController, position: Position) => {
  controller.cameraOrigin = cameraOriginForFocus(controller.battle.stage, position);
  controller.focusCell(position);
  controller.emit();
};

const nextFrame = (): Promise<void> => new Promise((resolve) => {
  requestAnimationFrame(() => resolve());
});

async function waitFor<T>(description: string, probe: () => T | undefined | null, timeoutMs = 10_000): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (performance.now() >= deadline) throw new CaptureDirectiveError(`open：等不到${description}。`);
    await nextFrame();
  }
}

const visibleElement = (selector: string): HTMLElement | undefined => {
  const element = document.querySelector<HTMLElement>(selector);
  return element && !element.hidden && element.getClientRects().length > 0 ? element : undefined;
};

const PANEL_ROWS = {
  roadmap: "roadmap",
  notes: "remake-notes",
  compendium: "compendium",
} as const;

const COMPENDIUM_SECTIONS: Readonly<Record<string, string>> = {
  classes: "classes",
  class: "classes",
  characters: "characters",
  character: "characters",
};

async function openHostSurface(target: CaptureOpenTarget): Promise<void> {
  // 寶石入口就是暫停：程式時鐘在選單底下照常凍結。
  if (!isProgramPaused()) setProgramPaused(true);
  await waitFor("宿主選單", () => visibleElement("[data-host-menu-open='true']"));
  if (target.kind === "settings") return;
  const panel = PANEL_ROWS[target.kind];
  const row = await waitFor("選單列", () => visibleElement(`[data-testid=host-menu-row-${panel}]`));
  row.click();
  await waitFor("參考面板", () => visibleElement(`[data-testid=${panel}]`));
  if (target.kind !== "compendium" || !target.section) return;
  const section = COMPENDIUM_SECTIONS[target.section];
  if (!section) throw new CaptureDirectiveError(`open=compendium/${target.section}：只有 classes（class）或 characters（character）。`);
  (await waitFor("圖鑑分頁", () => visibleElement(`[data-testid=compendium-tab-${section}]`))).click();
  const entry = target.entry;
  if (!entry) return;
  const kind = section === "classes" ? "class" : "character";
  const button = await waitFor(`圖鑑條目 ${entry}`, () =>
    visibleElement(`[data-testid="compendium-${kind}-${CSS.escape(entry)}"]`)
    ?? [...document.querySelectorAll<HTMLElement>(`[data-${kind}]`)]
      .find((candidate) => candidate.querySelector("span")?.textContent?.trim() === entry));
  button.click();
  button.scrollIntoView({ block: "nearest" });
}

/**
 * `focus` → `select`（`panel`）。掛載後立刻同步呼叫：Phaser 在準備門裡只畫第一幀就凍結，
 * 鏡頭與選取必須在那一幀之前就位。
 */
export function applyBoardDirectives(controller: GameController, options: CaptureOptions): void {
  if (options.focus) centerOn(controller, focusPosition(controller, options.focus));
  if (options.select) {
    const unit = unitFor(controller, "select", options.select);
    centerOn(controller, unit);
    // 右欄的單位詳情跟著肖像開關；`panel=detail` 保證這一頁打開它（只改記憶體，不寫偏好）。
    if (options.panel === "detail") controller.portraitsEnabled = true;
    controller.selectCell({ x: unit.x, y: unit.y });
  }
}

/**
 * `open`：交出準備門的無遮罩凍結，改由宿主選單的正常暫停停住畫面；起跑後畫面仍是打開的選單
 * 或面板，由錄製工具自己關掉。
 */
export async function applyOpenDirective(options: CaptureOptions, mode: CaptureMode): Promise<void> {
  if (!options.open) return;
  mode.handOffHold();
  await openHostSurface(options.open);
}
