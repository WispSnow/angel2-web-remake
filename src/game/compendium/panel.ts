import { COMPENDIUM_DEFAULT_CLASS_ID } from "./class-compendium";
import {
  DEFAULT_CLASS_PREVIEW_SELECTION,
  normalizeClassPreviewSelection,
  renderClassDetail,
  renderClassIndex,
  type ClassPreviewAnimation,
  type ClassPreviewSelection,
  type ClassPreviewSide,
} from "./class-view";
import { mountClassPreview, type ClassPreviewController } from "./class-preview";
import {
  COMPENDIUM_DEFAULT_CHARACTER_ID,
  isCharacterId,
} from "./character-compendium";
import { renderCharacterDetail, renderCharacterIndex } from "./character-view";
import { createOverlayPanel, type OverlayTab } from "../overlay/panel";
import { isClassId, type ClassId } from "../content/classes";
import type { CharacterId } from "../content/character-catalog.generated";

/**
 * 「圖鑑」覆蓋層：兩個資料表分頁，職業一個、角色一個。
 *
 * 兩個分頁共用同一個「左欄索引 ＋ 右欄詳情」版面，選取狀態各自保留，所以在分頁之間
 * 來回不會把玩家看到一半的條目重設掉。內容全部來自生成目錄與正式規則表，不自帶數字。
 */

export type CompendiumTab = "classes" | "characters";

export const COMPENDIUM_TABS: readonly OverlayTab<CompendiumTab>[] = [
  { id: "classes", label: "職業圖鑑", title: "全 39 個職業的棋子、全景動畫、屬性、成長與特性" },
  { id: "characters", label: "角色圖鑑", title: "全 51 名具名角色的簡介與出場關卡" },
];

let selectedClassId: ClassId = COMPENDIUM_DEFAULT_CLASS_ID;
let selectedCharacterId: CharacterId = COMPENDIUM_DEFAULT_CHARACTER_ID;
let classPreviewSelection: ClassPreviewSelection = DEFAULT_CLASS_PREVIEW_SELECTION;
let classPreviewController: ClassPreviewController | undefined;

const isPreviewSide = (value: string | undefined): value is ClassPreviewSide =>
  value === "ally" || value === "enemy";

const isPreviewAnimation = (value: string | undefined): value is ClassPreviewAnimation =>
  value === "stand" || value === "attack" || value === "guard" || value === "hurt" || value === "death";

function stopClassPreview(): void {
  classPreviewController?.destroy();
  classPreviewController = undefined;
}

function normalizedClassPreview(): ClassPreviewSelection {
  classPreviewSelection = normalizeClassPreviewSelection(selectedClassId, classPreviewSelection);
  return classPreviewSelection;
}

function mountSelectedClassPreview(body: HTMLElement): void {
  stopClassPreview();
  const detail = body.querySelector<HTMLElement>(".rn-class-detail");
  if (!detail) return;
  classPreviewController = mountClassPreview(
    detail,
    selectedClassId,
    normalizedClassPreview(),
  );
}

function renderTab(tab: CompendiumTab): string {
  const [index, detail, label] = tab === "classes"
    ? [
      renderClassIndex(selectedClassId),
      renderClassDetail(selectedClassId, normalizedClassPreview()),
      "職業轉職樹",
    ]
    : [
      renderCharacterIndex(selectedCharacterId),
      renderCharacterDetail(selectedCharacterId),
      "角色索引",
    ];
  return `
    <div class="rn-compendium">
      <nav class="rn-class-index" aria-label="${label}" data-testid="compendium-index">
        ${index}
      </nav>
      <div class="rn-class-detail" data-testid="compendium-detail" tabindex="-1">
        ${detail}
      </div>
    </div>`;
}

/** 只換左右兩欄的內容，不重繪整個分頁：重繪會把捲軸拉回頂端。 */
function select(body: HTMLElement, index: string, detail: string): void {
  stopClassPreview();
  const indexElement = body.querySelector<HTMLElement>(".rn-class-index");
  const detailElement = body.querySelector<HTMLElement>(".rn-class-detail");
  if (!indexElement || !detailElement) return;
  indexElement.innerHTML = index;
  detailElement.innerHTML = detail;
  detailElement.scrollTop = 0;
  indexElement.querySelector<HTMLElement>('[aria-current="true"]')
    ?.scrollIntoView({ block: "nearest" });
}

function rerenderSelectedClass(body: HTMLElement, resetScroll: boolean): void {
  stopClassPreview();
  const detail = body.querySelector<HTMLElement>(".rn-class-detail");
  if (!detail) return;
  detail.innerHTML = renderClassDetail(selectedClassId, normalizedClassPreview());
  if (resetScroll) detail.scrollTop = 0;
  mountSelectedClassPreview(body);
}

const panel = createOverlayPanel<CompendiumTab>({
  testid: "compendium",
  eyebrow: "圖鑑",
  heading: "《天使帝國 II》Web 復刻版",
  footer: "遊戲仍在背後正常進行；本視窗只讀取內容資料，不會改變戰局、存檔或隨機序列。",
  tabs: COMPENDIUM_TABS,
  render: renderTab,
  onBodyRendered: (body, tab) => {
    stopClassPreview();
    if (tab === "classes") mountSelectedClassPreview(body);
  },
  onClose: stopClassPreview,
  onDestroy: stopClassPreview,
  onBodyClick: (target, body) => {
    const classId = target.closest<HTMLElement>("[data-class]")?.dataset.class;
    if (isClassId(classId) && classId !== selectedClassId) {
      selectedClassId = classId;
      classPreviewSelection = normalizeClassPreviewSelection(classId, classPreviewSelection);
      select(
        body,
        renderClassIndex(classId),
        renderClassDetail(classId, classPreviewSelection),
      );
      mountSelectedClassPreview(body);
      return;
    }
    const previewSide = target.closest<HTMLElement>("[data-class-preview-side]")
      ?.dataset.classPreviewSide;
    if (isPreviewSide(previewSide)) {
      classPreviewSelection = normalizeClassPreviewSelection(selectedClassId, {
        ...classPreviewSelection,
        side: previewSide,
      });
      rerenderSelectedClass(body, false);
      return;
    }
    const previewAnimation = target.closest<HTMLElement>("[data-class-preview-animation]")
      ?.dataset.classPreviewAnimation;
    if (isPreviewAnimation(previewAnimation)) {
      classPreviewSelection = { ...classPreviewSelection, animation: previewAnimation };
      rerenderSelectedClass(body, false);
      return;
    }
    const characterId = target.closest<HTMLElement>("[data-character]")?.dataset.character;
    if (isCharacterId(characterId) && characterId !== selectedCharacterId) {
      selectedCharacterId = characterId;
      select(body, renderCharacterIndex(characterId), renderCharacterDetail(characterId));
    }
  },
});

export function openCompendium(tab: CompendiumTab, returnFocusTo?: HTMLElement): void {
  // 「站立」是入口默认页；同一轮浏览中切职业仍保留玩家选的动作，方便横向比较。
  classPreviewSelection = { ...classPreviewSelection, animation: "stand" };
  panel.open(tab, returnFocusTo);
}
export const closeCompendium = panel.close;
export const isCompendiumOpen = panel.isOpen;
export const destroyCompendium = panel.destroy;
