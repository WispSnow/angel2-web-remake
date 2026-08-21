import {
  classDefinition,
  classStatsFor,
  classTierFor,
  nextExperienceThresholdFor,
  type ClassId,
} from "./content/classes";
import { portraitSourceFor } from "./content/portrait-catalog.generated";
import { allyMapUnitAsset } from "./content/map-unit-assets";
import { stagedRenderAssetSource } from "./staged-render-asset-cache";
import { applyStagedNativeUiAssets } from "./native-ui-assets";
import type { DeploymentRosterUnit, DeploymentSession } from "./deployment-session";
import {
  DeploymentMinimap,
  terrainContentBounds,
  type DeploymentMinimapMarker,
} from "./deployment-minimap";
import { DEPLOYMENT_FEEDBACK_TEXT } from "./simulation/deployment";
import {
  isKeyboardCancel,
  isKeyboardConfirm,
  keyboardDirection,
  MODERN_KEYBOARD_HELP,
} from "./input-bindings";
import type { Position } from "./types";
import type { StageDeploymentPresentation } from "./stage-runtime";

/** Longest preview side that still leaves the rail room for the read-out. */
const MINIMAP_MAX_PIXELS = 128;
/** Keeps a wrapped 9+ cell picker and the character read-out inside 350 px. */
const DENSE_MINIMAP_MAX_PIXELS = 96;

const ACTION_CATEGORY_LABEL = {
  ordinary: "普通",
  shooting: "射擊",
  technique: "技術",
  special_runtime: "特殊",
} as const;

const figureSourceFor = (classId: ClassId): string => stagedRenderAssetSource(
  allyMapUnitAsset(classId) ?? "/assets/original/unit-ally-soldier.png",
);

const positionKey = ({ x, y }: Position): string => `${x},${y}`;

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const percent = (value: number, total: number): number =>
  total <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / total) * 100)));

function pressed(gamepad: Gamepad, button: number): boolean {
  return gamepad.buttons[button]?.pressed === true;
}

/**
 * Technique tiers follow the three directly selected DATA rows. Native DATA
 * field6 markers may start at 4, 7, 10, or later and must not be used as tier
 * indices or as the current-profession level shown to players.
 */
function actionLabelsFor(
  definition: ReturnType<typeof classDefinition>,
  tier: 1 | 2 | 3,
): readonly string[] {
  if (definition.shooting) {
    const { minimumRange, maximumRange } = definition.shooting;
    return [`射程 ${minimumRange}－${maximumRange}`];
  }
  const tiers = definition.technique?.tiers;
  if (!tiers?.length) return [];
  const selected = tiers[Math.min(tier, tiers.length) - 1];
  return selected?.actions.map(({ label }) => label) ?? [];
}

interface RosterEntryView {
  index: number;
  unit?: DeploymentRosterUnit;
  fixed: boolean;
  deployed: boolean;
  focused: boolean;
}

const statusLabelFor = ({ unit, fixed, deployed }: RosterEntryView): string => {
  if (!unit) return "空名單";
  if (fixed) return "固定";
  return deployed ? "出場" : "待命";
};

function rosterEntryHtml(view: RosterEntryView): string {
  const { index, unit, fixed, deployed, focused } = view;
  const classes = ["deployment-entry"];
  if (focused) classes.push("is-focused");
  if (deployed) classes.push("is-deployed");
  if (fixed) classes.push("is-fixed");
  if (!unit) classes.push("is-empty");

  if (!unit) {
    return `<button class="${classes.join(" ")}" type="button" tabindex="-1"
      data-roster-index="${index}" data-testid="deployment-roster-${index}"
      aria-label="空名單，此處沒有人" aria-pressed="false">
      <span class="deployment-entry-empty">空名單</span>
    </button>`;
  }

  const stats = classStatsFor(unit);
  const label = `${unit.name}，${unit.className}，等級 ${stats.level}，生命 ${unit.life}／${stats.maxLife}，`
    + `${fixed ? "固定出場" : "可選"}，${deployed ? "已出場" : "未出場"}`;
  return `<button class="${classes.join(" ")}" type="button" tabindex="-1"
    data-roster-index="${index}" data-unit-slot="${unit.slot}" data-testid="deployment-roster-${index}"
    aria-label="${escapeHtml(label)}" aria-pressed="${deployed}">
    <span class="deployment-entry-figure">
      <img src="${figureSourceFor(unit.classId)}" alt="" aria-hidden="true" />
    </span>
    <span class="deployment-entry-body">
      <span class="deployment-entry-head">
        <b class="deployment-entry-name">${escapeHtml(unit.name)}</b>
        <em class="deployment-entry-badge">${statusLabelFor(view)}</em>
      </span>
      <span class="deployment-entry-class">${escapeHtml(unit.className)} · Lv ${stats.level}</span>
      <span class="deployment-entry-life">
        <span class="deployment-meter"><i style="width:${percent(unit.life, stats.maxLife)}%"></i></span>
        <span class="deployment-entry-life-value">${unit.life}/${stats.maxLife}</span>
      </span>
    </span>
  </button>`;
}

function detailHtml(
  unit: DeploymentRosterUnit | undefined,
  context: { fixed: boolean; deployed: boolean; mapFocused: boolean },
): string {
  if (!unit) {
    return `<p class="deployment-detail-hint">${context.mapFocused
      ? "落點焦點：主操作選前一格，次操作選後一格。"
      : "移動焦點到名單上，即可檢視人物詳情。"}</p>`;
  }

  const stats = classStatsFor(unit);
  const tier = classTierFor(unit);
  const definition = classDefinition(unit.classId);
  const actions = actionLabelsFor(definition, tier);
  const nextExperience = nextExperienceThresholdFor(unit);
  const previousExperience = tier <= 1
    ? 0
    : definition.dataRows[tier - 1]?.experienceThreshold ?? 0;
  const experienceSpan = Math.max(1, nextExperience - previousExperience);
  const experienceGained = Math.max(0, unit.experience - previousExperience);
  const status = context.fixed ? "固定出場" : context.deployed ? "已出場" : "待命中";

  return `<div class="deployment-detail-head">
      <span class="deployment-detail-figure">
        <img class="deployment-detail-portrait" src="${stagedRenderAssetSource(portraitSourceFor(unit.portrait))}" alt="" aria-hidden="true" />
        <em class="deployment-detail-state">${status}</em>
      </span>
      <div class="deployment-detail-copy">
        <p class="deployment-detail-name">${escapeHtml(unit.name)}</p>
        <p class="deployment-detail-class">${escapeHtml(unit.className)} · Lv ${stats.level}
          · ${ACTION_CATEGORY_LABEL[definition.actionCategory]}</p>
        <p class="deployment-detail-life"><span>生命</span><b>${unit.life}／${stats.maxLife}</b></p>
        <span class="deployment-meter is-life"><i style="width:${percent(unit.life, stats.maxLife)}%"></i></span>
      </div>
    </div>
    <dl class="deployment-detail-stats">
      <div><dt>攻擊</dt><dd>${stats.attack}</dd></div>
      <div><dt>防禦</dt><dd>${stats.defense}</dd></div>
      <div><dt>移動</dt><dd>${stats.movement}</dd></div>
    </dl>
    <p class="deployment-detail-exp"><span>經驗</span>
      <span class="deployment-meter is-exp"><i style="width:${percent(experienceGained, experienceSpan)}%"></i></span>
      <b>${unit.experience}／${nextExperience}</b></p>
    ${actions.length ? `<p class="deployment-detail-actions"><span>行動</span>
      <b>${actions.map(escapeHtml).join("・")}</b></p>` : ""}`;
}

export function mountDeploymentUi(
  root: HTMLElement,
  session: DeploymentSession,
  presentation: StageDeploymentPresentation,
): () => void {
  applyStagedNativeUiAssets(root.closest<HTMLElement>(".logical-screen") ?? root);
  root.tabIndex = 0;
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", `${presentation.title}出擊準備；${MODERN_KEYBOARD_HELP.move}移動，${MODERN_KEYBOARD_HELP.confirm}確認，${MODERN_KEYBOARD_HELP.cancel}返回，Tab 切換名單與落點`);

  const denseOpenCells = session.state.definition.openCells.length > 8;
  const minimap = new DeploymentMinimap({
    source: stagedRenderAssetSource(presentation.minimap),
    viewBox: terrainContentBounds(
      presentation.terrain,
      presentation.gridWidth,
      presentation.gridHeight,
    ),
    maxPixels: denseOpenCells ? DENSE_MINIMAP_MAX_PIXELS : MINIMAP_MAX_PIXELS,
  });
  const deploymentZone = (() => {
    const cells = [
      ...session.state.definition.fixedPlacements.map(({ position }) => position),
      ...session.state.definition.openCells,
    ];
    const xs = cells.map(({ x }) => x);
    const ys = cells.map(({ y }) => y);
    return {
      min: { x: Math.max(0, Math.min(...xs) - 1), y: Math.max(0, Math.min(...ys) - 1) },
      max: { x: Math.max(...xs) + 1, y: Math.max(...ys) + 1 },
    };
  })();

  const render = () => {
    const { state } = session;
    const fixedSlots = new Set(state.definition.fixedPlacements.map(({ slot }) => slot));
    const deployedSlots = new Set(state.placements.map(({ slot }) => slot));
    const occupiedCells = new Set(state.placements.map(({ position }) => positionKey(position)));
    const current = state.currentOpenCell;
    const remaining = state.definition.openCells.length
      - state.placements.filter(({ fixed }) => !fixed).length;
    const feedback = state.feedback ? DEPLOYMENT_FEEDBACK_TEXT[state.feedback] : undefined;
    const dangerKeys = new Set((presentation.dangerCells ?? []).map(positionKey));

    const entries = Array.from({ length: 15 }, (_, index): RosterEntryView => {
      const slot = session.rosterSlotAt(index);
      const unit = session.rosterUnitFor(slot);
      return {
        index,
        unit,
        fixed: slot !== undefined && fixedSlots.has(slot),
        deployed: slot !== undefined && deployedSlots.has(slot),
        focused: state.focus.kind === "roster" && state.focus.index === index,
      };
    });

    const focusedEntry = entries.find((entry) => entry.focused);
    const capacityPips = Array.from({ length: state.definition.maximumUnits }, (_, index) =>
      `<i class="${index < state.placements.length ? "is-on" : ""}"></i>`).join("");

    const pageTabs = presentation.pageLabels.map((label, page) => {
      const typedPage = page as 0 | 1 | 2;
      const focused = state.focus.kind === "page" && state.focus.page === typedPage;
      const active = state.rosterPage === typedPage;
      return `<button type="button" tabindex="-1" data-page="${page}" data-testid="deployment-page-${page}"
        class="deployment-page${focused ? " is-focused" : ""}${active ? " is-active" : ""}"
        aria-label="名單第 ${page + 1} 頁" aria-pressed="${active}">${label}</button>`;
    }).join("");

    // The canvas keeps the steady `FFh` white core; this DOM cell performs the
    // explicit blue/white toggle. Its white base colour matches the canvas
    // underneath if CSS animation is unavailable.
    const blinkRect = current && !state.submitted ? minimap.coreRect(current) : undefined;

    const landingChips = state.definition.openCells.map((position) => {
      const key = positionKey(position);
      const occupied = occupiedCells.has(key);
      const selected = current?.x === position.x && current.y === position.y;
      const dangerous = dangerKeys.has(key);
      return `<button type="button" tabindex="-1" data-open-cell="${key}"
        class="deployment-open-cell${selected ? " is-current" : ""}${occupied ? " is-occupied" : ""}${dangerous ? " is-danger" : ""}"
        aria-label="部署落點 ${key}${occupied ? "，已使用" : selected ? "，目前選擇" : ""}${dangerous ? `，${presentation.dangerText ?? "危險區"}` : "，首輪安全"}"
        ${occupied || state.submitted ? "disabled" : ""}>${key}${dangerous ? "<em>危險</em>" : ""}</button>`;
    }).join("");

    root.innerHTML = `
      <header class="deployment-header">
        <span class="deployment-kicker">${presentation.kicker}</span>
        <h2 class="deployment-title">${escapeHtml(presentation.title)} · 出擊準備</h2>
        <p class="deployment-objective">勝利條件：${escapeHtml(presentation.objective)}</p>
        ${presentation.guidanceText ? `<p class="deployment-guidance" data-testid="deployment-guidance">${escapeHtml(presentation.guidanceText)}</p>` : ""}
        <p class="deployment-capacity" data-testid="deployment-summary">
          已出場 <b>${state.placements.length}／${state.definition.maximumUnits}</b>
          <span class="deployment-pips" aria-hidden="true">${capacityPips}</span>
        </p>
      </header>

      <section class="deployment-roster-panel" aria-label="出場名單">
        <div class="deployment-panel-bar">
          <h3>出場名單</h3>
          <p class="deployment-panel-note">剩餘空位 ${remaining}　·　${presentation.minimumUnits}至${state.definition.maximumUnits}人均可出擊</p>
          <nav class="deployment-pages" aria-label="名單頁面">${pageTabs}</nav>
        </div>
        <div class="deployment-roster">${entries.map(rosterEntryHtml).join("")}</div>
      </section>

      <aside class="deployment-rail">
        <section class="deployment-map-panel" aria-label="戰場預覽">
          <div class="deployment-panel-bar">
            <h3>戰場預覽</h3>
            <p class="deployment-legend" aria-hidden="true">
              <em class="is-ally"></em>我方<em class="is-enemy"></em>敵方<em class="is-open"></em>空位
            </p>
          </div>
          <div class="deployment-map-frame${state.focus.kind === "map" ? " is-focused" : ""}">
            <canvas class="deployment-map" data-testid="deployment-minimap"
              width="${minimap.width}" height="${minimap.height}"
              role="img" aria-label="${escapeHtml(presentation.title)}戰場預覽，顯示我方單位、敵方單位、可用落點與首輪結界"></canvas>
            ${blinkRect ? `<span class="deployment-map-blink" data-testid="deployment-minimap-blink"
              data-current-cell="${current?.x},${current?.y}"
              aria-hidden="true" style="left:${blinkRect.left}px;top:${blinkRect.top}px;
              width:${blinkRect.size}px;height:${blinkRect.size}px"></span>` : ""}
          </div>
          <div class="deployment-open-cells${denseOpenCells ? " is-dense" : ""}" aria-label="可選部署落點">${landingChips}</div>
          <p class="visually-hidden" aria-live="polite">
            ${current ? `下一落點 ${current.x},${current.y}` : "部署格已用完"}
          </p>
        </section>
        <section class="deployment-detail" data-testid="deployment-detail" aria-label="人物詳情">
          ${detailHtml(focusedEntry?.unit, {
            fixed: focusedEntry?.fixed ?? false,
            deployed: focusedEntry?.deployed ?? false,
            mapFocused: state.focus.kind === "map",
          })}
        </section>
      </aside>

      <footer class="deployment-footer">
        <p class="deployment-status${feedback ? " is-error" : ""}" data-testid="deployment-status"
          ${feedback ? 'role="alert"' : 'aria-live="polite"'}>
          ${feedback ?? (state.submitted
            ? `部署完成：${state.placements.length} 人編隊已建立。`
            : `選擇出場人物；${presentation.minimumUnits}至${state.definition.maximumUnits}人均可完成。`)}
        </p>
        <p class="deployment-hint">${MODERN_KEYBOARD_HELP.move} 移動 · ${MODERN_KEYBOARD_HELP.confirm} 確認 · ${MODERN_KEYBOARD_HELP.cancel} 返回 · Tab 切換落點</p>
        <button type="button" tabindex="-1" data-finish data-testid="deployment-finish"
          class="deployment-finish${state.focus.kind === "finish" ? " is-focused" : ""}">${presentation.finishLabel}</button>
      </footer>

      ${state.submitted ? `<div class="deployment-submitted" data-testid="deployment-submitted">
        <strong>部署結果已建立</strong><span>正在進入${escapeHtml(presentation.title)}開場劇情</span>
      </div>` : ""}
    `;

    const canvas = root.querySelector<HTMLCanvasElement>(".deployment-map");
    if (canvas) {
      const markers: DeploymentMinimapMarker[] = [
        ...presentation.enemies.map((position): DeploymentMinimapMarker =>
          ({ position, kind: "enemy" })),
        ...state.placements.map(({ position }): DeploymentMinimapMarker =>
          ({ position, kind: "ally" })),
        ...state.definition.openCells
          .filter((position) => !occupiedCells.has(positionKey(position)))
          .map((position): DeploymentMinimapMarker => ({
            position,
            kind: current && current.x === position.x && current.y === position.y
              ? "current"
              : "open",
          })),
      ];
      minimap.render(canvas, {
        markers,
        zone: deploymentZone,
        safeCells: presentation.safeCells,
        dangerCells: presentation.dangerCells,
      });
    }

    root.dataset.focusKind = state.focus.kind;
    root.dataset.rosterPage = String(state.rosterPage);
    root.dataset.feedback = state.feedback ?? "";
    root.dataset.submitted = String(state.submitted);
  };

  const handleClick = (event: MouseEvent) => {
    const target = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
    if (!target || !root.contains(target)) return;
    const rosterIndex = target.dataset.rosterIndex;
    const page = target.dataset.page;
    const openCell = target.dataset.openCell;
    if (openCell !== undefined) {
      const [x, y] = openCell.split(",").map(Number);
      session.activateOpenCell({ x, y });
    }
    else if (rosterIndex !== undefined) session.activateRoster(Number(rosterIndex));
    else if (page !== undefined) session.activatePage(Number(page) as 0 | 1 | 2);
    else if (target.hasAttribute("data-finish")) session.activateFinish();
    root.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const delta = keyboardDirection(event.key);
    const direction = delta?.y === -1
      ? "up"
      : delta?.y === 1
        ? "down"
        : delta?.x === -1
          ? "left"
          : delta?.x === 1
            ? "right"
            : undefined;
    if (direction) session.moveFocus(direction);
    else if (isKeyboardConfirm(event.key)) session.primary();
    else if (isKeyboardCancel(event.key)) session.secondary();
    else if (event.key === "Tab") {
      if (session.state.focus.kind === "map") session.leaveMap();
      else session.focusMap();
    }
    else return;
    event.preventDefault();
  };

  const handlePointerDown = () => root.focus({ preventScroll: true });
  let previousGamepad = new Set<string>();
  let animationFrame = 0;
  const pollGamepad = () => {
    const gamepad = Array.from(navigator.getGamepads?.() ?? [])
      .find((candidate) => candidate?.connected);
    const current = new Set<string>();
    if (gamepad) {
      const horizontal = Math.abs(gamepad.axes[0] ?? 0) > 0.6 ? Math.sign(gamepad.axes[0]) : 0;
      const vertical = Math.abs(gamepad.axes[1] ?? 0) > 0.6 ? Math.sign(gamepad.axes[1]) : 0;
      if (pressed(gamepad, 14) || horizontal < 0) current.add("left");
      if (pressed(gamepad, 15) || horizontal > 0) current.add("right");
      if (pressed(gamepad, 12) || vertical < 0) current.add("up");
      if (pressed(gamepad, 13) || vertical > 0) current.add("down");
      if (pressed(gamepad, 0)) current.add("primary");
      if (pressed(gamepad, 1)) current.add("secondary");
      if (pressed(gamepad, 4)) current.add("map");
      if (pressed(gamepad, 5)) current.add("roster");
      for (const action of current) {
        if (previousGamepad.has(action)) continue;
        if (action === "primary") session.primary();
        else if (action === "secondary") session.secondary();
        else if (action === "map") session.focusMap();
        else if (action === "roster") session.leaveMap();
        else session.moveFocus(action as "up" | "down" | "left" | "right");
      }
    }
    previousGamepad = current;
    animationFrame = requestAnimationFrame(pollGamepad);
  };

  root.addEventListener("click", handleClick);
  root.addEventListener("keydown", handleKeyDown);
  root.addEventListener("pointerdown", handlePointerDown);
  const unsubscribe = session.onChange(render);
  render();
  animationFrame = requestAnimationFrame(pollGamepad);

  return () => {
    unsubscribe();
    cancelAnimationFrame(animationFrame);
    root.removeEventListener("click", handleClick);
    root.removeEventListener("keydown", handleKeyDown);
    root.removeEventListener("pointerdown", handlePointerDown);
  };
}
