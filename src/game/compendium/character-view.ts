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
import { PORTRAIT_HD_AVAILABLE } from "../content/portrait-hd";
import { PORTRAIT_HD_SIZE } from "../content/portrait-hd.generated";
import type { PortraitStyle } from "../preferences";
import { stagedRenderAssetSource } from "../staged-render-asset-cache";

const NO_NOTE = "原版未為該角色設計專屬台詞或劇情橋段，圖鑑僅列出其身分歸屬與登場關卡。";

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

/**
 * 這個角色此刻要畫哪一套肖像：要了高清而這張臉有高清版才畫高清，否則照原版。玩家的選擇
 * 本身另外保留，換到下一個有高清版的角色時照樣是高清。
 */
export function characterPortraitStyle(entry: CharacterEntry, requested: PortraitStyle): PortraitStyle {
  return requested === "hd" && PORTRAIT_HD_AVAILABLE && entry.portraitHd ? "hd" : "original";
}

/**
 * `REMAKE-192` 的高清肖像：封面（循環第 0 幀）墊底，畫布疊在上面由播放器播待機循環、嘴保持
 * 閉合；視訊只當解碼來源，縮成 2 px 透明留在版面裡（`display:none` 的視訊不保證會播放）。
 * 靜止圖記錄只有封面。
 */
function hdFigure(entry: CharacterEntry, hd: NonNullable<CharacterEntry["portraitHd"]>): string {
  const video = hd.video
    ? `<canvas width="${PORTRAIT_HD_SIZE}" height="${PORTRAIT_HD_SIZE}" aria-hidden="true"></canvas>
      <video muted loop playsinline disablepictureinpicture disableremoteplayback preload="auto"
        src="${stagedRenderAssetSource(hd.video.source)}" aria-hidden="true"></video>`
    : "";
  return `
    <div class="rn-figure rn-figure-portrait rn-figure-hd" data-side="ally"
      data-testid="compendium-portrait" data-portrait-style="hd" data-portrait-hd-mode="${hd.mode}">
      <img src="${stagedRenderAssetSource(hd.poster)}" alt="${escapeHtml(entry.name)}的高清肖像" />
      ${video}
    </div>`;
}

function figure(entry: CharacterEntry, style: PortraitStyle): string {
  if (!entry.portrait) {
    // 沒有專屬肖像的具名角色在原版裡也是這樣：對話框改畫當前職業的通用肖像。
    return '<div class="rn-figure rn-figure-empty" data-side="ally"><span>無專屬肖像</span></div>';
  }
  if (style === "hd" && entry.portraitHd) return hdFigure(entry, entry.portraitHd);
  return `
    <div class="rn-figure rn-figure-portrait" data-side="ally"
      data-testid="compendium-portrait" data-portrait-style="original">
      <img src="${stagedRenderAssetSource(entry.portrait)}" alt="${escapeHtml(entry.name)}的肖像" />
    </div>`;
}

/**
 * 圖鑑自己的「原版／高清」對照切換：初值跟隨遊戲的「美術風格」，但只改圖鑑裡看到的那一張，
 * 不寫回偏好。沒有專屬肖像的角色不畫；原版沒有高清版的那一張只能看原版。
 */
function portraitStyleSwitch(entry: CharacterEntry, style: PortraitStyle): string {
  if (!PORTRAIT_HD_AVAILABLE || !entry.portrait) return "";
  return `
    <div class="rn-class-side-switch" role="group" aria-label="肖像美術風格">
      <span>美術風格</span>
      <div>
        <button type="button" data-character-portrait-style="original"
          data-testid="compendium-portrait-style-original" aria-pressed="${style === "original"}">原版</button>
        <button type="button" data-character-portrait-style="hd"
          data-testid="compendium-portrait-style-hd" aria-pressed="${style === "hd"}"
          ${entry.portraitHd ? "" : 'disabled title="這張肖像沒有高清版"'}>高清</button>
      </div>
    </div>`;
}

export function renderCharacterDetail(id: CharacterId, requestedStyle: PortraitStyle = "original"): string {
  const entry = characterEntry(id);
  const style = characterPortraitStyle(entry, requestedStyle);
  const stageCount = entry.stages.length;
  return `
    <header class="rn-class-head">
      ${figure(entry, style)}
      <div class="rn-class-title">
        <h3>${escapeHtml(entry.name)}</h3>
        ${identityRow(entry)}
      </div>
      ${portraitStyleSwitch(entry, style)}
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
      <p class="rn-hint">「名單候選」表示該關卡可將此角色編入出擊陣容，非必定登場；
        「對白登場」表示僅於該關卡劇情對話中出現。</p>
    </section>`;
}
