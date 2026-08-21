import {
  CHARACTER_GROUPS,
  CHARACTER_GROUP_LABELS,
  CHARACTER_ROLE_LABELS,
  characterEntry,
  type CharacterEntry,
  type CharacterStageEntry,
} from "./character-compendium";
import { escapeHtml } from "../overlay/markup";
import type { CharacterId } from "../content/character-catalog.generated";
import { stagedRenderAssetSource } from "../staged-render-asset-cache";

const NO_NOTE = "原版沒有給這名角色台詞或專屬橋段，所以圖鑑只列出身分與出場關卡。";

function characterButton(entry: CharacterEntry, selected: CharacterId): string {
  const isSelected = entry.id === selected;
  const stage = entry.firstStage.ordinal === null
    ? entry.firstStage.label
    : `第 ${entry.firstStage.ordinal} 關`;
  return `<button type="button" class="rn-class-row rn-character-row" data-character="${entry.id}"
    data-testid="compendium-character-${entry.id}"
    aria-current="${isSelected}"${isSelected ? ' aria-selected="true"' : ""}
    ><span>${escapeHtml(entry.name)}</span><em>${escapeHtml(stage)}</em></button>`;
}

export function renderCharacterIndex(selected: CharacterId): string {
  return CHARACTER_GROUPS.map((group) => `
    <p class="rn-class-group">${escapeHtml(CHARACTER_GROUP_LABELS[group.id])}</p>
    ${group.entries.map((entry) => characterButton(entry, selected)).join("")}`).join("");
}

/** 一格出場關卡：關卡序數與名稱在上，這一關的身分排成標籤在下。 */
function stageCell(stage: CharacterStageEntry): string {
  const roles = stage.roles.map((role) => ({ label: CHARACTER_ROLE_LABELS[role], key: false }));
  if (stage.mustSurvive) roles.push({ label: "戰敗條件", key: true });
  if (stage.objective) roles.push({ label: "勝利目標", key: true });
  if (stage.escort) roles.push({ label: "護送目標", key: true });
  const isKeyStage = roles.some((role) => role.key);
  const heading = stage.ordinal === null
    ? escapeHtml(stage.label)
    : `第 ${stage.ordinal} 關 ${escapeHtml(stage.label)}`;
  const classes = stage.classNames.length > 0
    ? `<span class="rn-character-class">${escapeHtml(stage.classNames.join("、"))}</span>`
    : "";
  return `
    <li class="rn-character-stage"${isKeyStage ? ' data-objective="true"' : ""}>
      <strong>${heading}</strong>
      <span>${roles.map(({ label, key }) =>
    `<em${key ? ' data-objective="true"' : ""}>${escapeHtml(label)}</em>`).join("")}</span>
      ${classes}
    </li>`;
}

function identityRow(entry: CharacterEntry): string {
  const sides: string[] = [];
  if (entry.allySlot !== null) sides.push(`我方名冊槽 ${entry.allySlot}`);
  if (entry.enemySlot !== null) sides.push(`敵方名冊槽 ${entry.enemySlot}`);
  const portrait = entry.portraitRecord === null
    ? "肖像 職業回退"
    : `肖像記錄 ${entry.portraitRecord}`;
  return `
    <p class="rn-class-meta">
      <span>${escapeHtml(CHARACTER_GROUP_LABELS[entry.group])}</span>
      ${sides.map((side) => `<span>${escapeHtml(side)}</span>`).join("")}
      <span>${escapeHtml(portrait)}</span>
    </p>`;
}

function figure(entry: CharacterEntry): string {
  if (!entry.portrait) {
    // 沒有專屬肖像的具名角色在原版裡也是這樣：對話框改畫當前職業的通用肖像。
    return '<div class="rn-figure rn-figure-empty" data-side="ally"><span>無專屬肖像</span></div>';
  }
  return `
    <div class="rn-figure rn-figure-portrait" data-side="ally">
      <img src="${stagedRenderAssetSource(entry.portrait)}" alt="${escapeHtml(entry.name)}的肖像" />
    </div>`;
}

export function renderCharacterDetail(id: CharacterId): string {
  const entry = characterEntry(id);
  const stageCount = entry.stages.length;
  return `
    <header class="rn-class-head">
      ${figure(entry)}
      <div class="rn-class-title">
        <h3>${escapeHtml(entry.name)}</h3>
        ${identityRow(entry)}
      </div>
    </header>
    <section class="rn-block">
      <h4>簡介</h4>
      <p${entry.note ? "" : ' class="rn-hint"'}>${escapeHtml(entry.note ?? NO_NOTE)}</p>
    </section>
    <section class="rn-block">
      <h4>出場關卡<span class="rn-character-count">共 ${stageCount} 處</span></h4>
      <ul class="rn-character-stages" data-testid="compendium-character-stages">
        ${entry.stages.map(stageCell).join("")}
      </ul>
      <p class="rn-hint">「名單候選」表示這一關可以把這名角色編進出擊名單，不代表一定上場；
        「對白登場」表示只出現在該關的劇情畫面裡。</p>
    </section>`;
}
