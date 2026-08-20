import {
  COMPENDIUM_GROUP_LABELS,
  OFF_TREE_CLASS_IDS,
  RUNTIME_CLASS_IDS,
  compendiumEntry,
  flattenPromotionTree,
  type CompendiumEntry,
  type CompendiumGrowthSegment,
} from "./class-compendium";
import { escapeHtml, inlineMarkup } from "../overlay/markup";
import type { ClassId } from "../content/classes";

const DIFFICULTY_LABELS = ["簡單", "普通", "困難", "無法無天"] as const;

function classButton(id: ClassId, name: string, depth: number, selected: ClassId): string {
  const isSelected = id === selected;
  return `<button type="button" class="rn-class-row" data-class="${id}" data-depth="${depth}"
    data-testid="compendium-class-${id}"
    aria-current="${isSelected}"${isSelected ? ' aria-selected="true"' : ""}>${escapeHtml(name)}</button>`;
}

export function renderClassIndex(selected: ClassId): string {
  const tree = flattenPromotionTree()
    .map((node) => classButton(node.id, compendiumEntry(node.id).name, node.depth, selected))
    .join("");
  const extraGroup = (title: string, ids: readonly ClassId[]): string => `
    <p class="rn-class-group">${escapeHtml(title)}</p>
    ${ids.map((id) => classButton(id, compendiumEntry(id).name, 1, selected)).join("")}`;

  return `
    <p class="rn-class-group">轉職樹 · 由士兵推出的 31 條轉職邊</p>
    ${tree}
    ${extraGroup(COMPENDIUM_GROUP_LABELS["off-tree"], OFF_TREE_CLASS_IDS)}
    ${extraGroup(COMPENDIUM_GROUP_LABELS.runtime, RUNTIME_CLASS_IDS)}`;
}

function statTable(entry: CompendiumEntry): string {
  const rows = entry.rows.map((row) => `
    <tr>
      <th scope="row">${row.level} 級</th>
      <td>${row.experience}</td>
      <td>${row.attack}</td>
      <td>${row.defense}</td>
      <td>${row.maxLife}</td>
    </tr>`).join("");
  const caption = entry.scriptedStats.length > 0
    ? "原版資料表（劇情首領不套用這三行，僅供對照）"
    : `固定三行（原版資料，移動在職業內恆為 ${entry.movement}）`;
  return `
    <table class="rn-stats">
      <caption>${escapeHtml(caption)}</caption>
      <thead>
        <tr><th scope="col">職業內等級</th><th scope="col">累計經驗</th>
          <th scope="col">攻擊</th><th scope="col">防禦</th><th scope="col">最大生命</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function growthLabel(segment: CompendiumGrowthSegment): string {
  return segment.rows === null
    ? `${segment.fromLevel} 級之後每檔`
    : `${segment.fromLevel} → ${segment.fromLevel + segment.rows} 級每檔`;
}

function growthTable(entry: CompendiumEntry): string {
  // 劇情首領逐難度直接給值，成長曲線對它們沒有意義，列出來只會誤導。
  if (entry.growth.length === 0 || entry.scriptedStats.length > 0) return "";
  const rows = entry.growth.map((segment) => `
    <tr>
      <th scope="row">${escapeHtml(growthLabel(segment))}</th>
      <td>+${segment.experience}</td>
      <td>+${segment.attack}</td>
      <td>+${segment.defense}</td>
      <td>+${segment.maxLife}</td>
    </tr>`).join("");
  const overridden = entry.growth.length > 1 || entry.growth.some((segment) => segment.defense > 0);
  return `
    <table class="rn-stats">
      <caption>3 級後成長${overridden ? "（含複刻平衡覆寫）" : "（原版：防禦與移動在 3 級後永久固定）"}</caption>
      <thead>
        <tr><th scope="col">區間</th><th scope="col">經驗</th>
          <th scope="col">攻擊</th><th scope="col">防禦</th><th scope="col">最大生命</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function scriptedTable(entry: CompendiumEntry): string {
  if (entry.scriptedStats.length === 0) return "";
  const rows = entry.scriptedStats.map((stats) => `
    <tr>
      <th scope="row">${escapeHtml(DIFFICULTY_LABELS[stats.difficulty] ?? String(stats.difficulty))}</th>
      <td>${stats.attack}</td>
      <td>${stats.defense}</td>
      <td>${stats.maxLife}</td>
    </tr>`).join("");
  return `
    <table class="rn-stats">
      <caption>劇情首領逐難度屬性（不套用成長曲線，見「復刻說明 › 平衡性調整」<code>REMAKE-103</code>）</caption>
      <thead>
        <tr><th scope="col">難度</th><th scope="col">攻擊</th>
          <th scope="col">防禦</th><th scope="col">最大生命</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function linkList(targets: readonly { id: ClassId; name: string }[]): string {
  return targets.map((target) =>
    `<button type="button" class="rn-class-link" data-class="${target.id}">${escapeHtml(target.name)}</button>`,
  ).join("");
}

function promotionSection(entry: CompendiumEntry): string {
  const parts: string[] = [];
  if (entry.promotedFrom.length > 0) {
    parts.push(`<p><span class="rn-field">轉職來源</span>${linkList(entry.promotedFrom)}</p>`);
  }
  if (entry.promotionTargets.length > 0) {
    parts.push(`<p><span class="rn-field">轉職去向</span>${linkList(entry.promotionTargets)}</p>`);
    if (entry.promotionExperience !== null) {
      parts.push(`<p class="rn-hint">累計經驗達 ${entry.promotionExperience} 時觸發授職，`
        + "提交後經驗歸零、當前生命不變，其餘屬性立即按新職業重算。</p>");
    }
  } else if (entry.promotedFrom.length > 0) {
    parts.push('<p class="rn-hint">終端職業，沒有轉職去向。</p>');
  }
  if (parts.length === 0) return "";
  return `<section class="rn-block"><h4>轉職</h4>${parts.join("")}</section>`;
}

function actionSection(entry: CompendiumEntry): string {
  const parts: string[] = [];
  if (entry.shooting) {
    const { minimumDistance, maximumDistance, damage, experience, note } = entry.shooting;
    parts.push(`<p><span class="rn-field">射擊</span>射程 ${minimumDistance}–${maximumDistance}`
      + `　傷害 ${escapeHtml(damage)}　經驗 ${escapeHtml(experience)}</p>`);
    parts.push('<p class="rn-hint">射擊走固定動作表，與面板攻擊、目標防禦、地形防禦都無關，也不觸發反擊。</p>');
    if (note) parts.push(`<p class="rn-hint">${inlineMarkup(note)}</p>`);
  }
  for (const tier of entry.techniqueTiers) {
    parts.push(`<p><span class="rn-field">技術 · 職業 ${tier.level} 級</span>`
      + `${tier.labels.map((label) => escapeHtml(label)).join("、")}</p>`);
  }
  if (entry.directTechnique) {
    parts.push(`<p><span class="rn-field">技術</span>${escapeHtml(entry.directTechnique)}`
      + "（直連技術，不經階級選單）</p>");
  }
  if (entry.runtimeAction) {
    parts.push(`<p><span class="rn-field">運行時動作</span>${inlineMarkup(entry.runtimeAction)}</p>`);
  }
  if (parts.length === 0) {
    parts.push('<p class="rn-hint">只有普通攻擊，沒有射擊或技術。</p>');
  }
  return `<section class="rn-block"><h4>行動</h4>${parts.join("")}</section>`;
}

function traitSection(entry: CompendiumEntry): string {
  if (entry.traits.length === 0) return "";
  const items = entry.traits.map((trait) => `
    <li><strong>${escapeHtml(trait.shortDescription)}</strong>
      <span>${escapeHtml(trait.description)}</span></li>`).join("");
  return `<section class="rn-block rn-block-trait"><h4>職業特性</h4><ul class="rn-traits">${items}</ul></section>`;
}

function noteSection(entry: CompendiumEntry): string {
  if (entry.notes.length === 0) return "";
  const items = entry.notes.map((note) => `<li>${inlineMarkup(note)}</li>`).join("");
  return `<section class="rn-block"><h4>備註</h4><ul class="rn-notes">${items}</ul></section>`;
}

export function renderClassDetail(id: ClassId): string {
  const entry = compendiumEntry(id);
  const codes = entry.codeSide1 === entry.codeSide2
    ? entry.codeSide1
    : `${entry.codeSide1}／${entry.codeSide2}`;
  const sideLabel = entry.spriteSide === "ally" ? "我方棋子" : "敵方棋子";
  return `
    <header class="rn-class-head">
      <div class="rn-figure" data-side="${entry.spriteSide}">
        <img src="${entry.sprite}" alt="${escapeHtml(entry.name)}的${sideLabel}" />
      </div>
      <div class="rn-class-title">
        <h3>${escapeHtml(entry.name)}</h3>
        <p class="rn-class-meta">
          <span>${escapeHtml(COMPENDIUM_GROUP_LABELS[entry.group])}</span>
          <span>記錄 ${entry.nativeRecord}</span>
          <span>短碼 <code>${escapeHtml(codes)}</code></span>
        </p>
        <p class="rn-class-meta">
          <span>行動 ${escapeHtml(entry.actionLabel)}</span>
          <span>戰術職責 ${entry.role === "melee" ? "近戰" : "遠程"}</span>
          <span>移動 ${entry.movement}</span>
          <span>擊殺經驗 ${entry.killReward}</span>
        </p>
      </div>
    </header>
    ${traitSection(entry)}
    <section class="rn-block">
      <h4>屬性與成長</h4>
      ${scriptedTable(entry)}
      ${statTable(entry)}
      ${growthTable(entry)}
      ${entry.scriptedStats.length > 0 ? "" : '<p class="rn-hint">本表是我方口徑。敵方單位另有難度縮放：'
        + "難度 0／3 逐字保持原版，難度 1／2 改用線性成長曲線並提高出場等級"
        + "（見「復刻說明 › 平衡性調整」<code>REMAKE-103</code>）。</p>"}
    </section>
    ${actionSection(entry)}
    ${promotionSection(entry)}
    ${noteSection(entry)}`;
}
