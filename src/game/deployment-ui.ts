import {
  classDefinition,
  classStatsFor,
  classTierFor,
  nextExperienceThresholdFor,
  type ClassId,
} from "./content/classes";
import { portraitSourceFor } from "./content/portrait-catalog.generated";
import { allyMapUnitAsset } from "./content/map-unit-assets";
import { mapUnitVisualOffset } from "./content/map-unit-presentation";
import { stagedRenderAssetSource } from "./staged-render-asset-cache";
import { applyStagedNativeUiAssets } from "./native-ui-assets";
import { drawNativeText, layoutNativeText, loadNativeFont } from "./native-text";
import type { DeploymentRosterUnit, DeploymentSession } from "./deployment-session";
import {
  DeploymentMinimap,
  NATIVE_DEPLOYMENT_MINIMAP_CELL_SIZE,
  type DeploymentMinimapMarker,
} from "./deployment-minimap";
import {
  DEPLOYMENT_FEEDBACK_TEXT,
  type DeploymentFocus,
} from "./simulation/deployment";
import {
  isKeyboardCancel,
  isKeyboardConfirm,
  keyboardDirection,
  MODERN_KEYBOARD_HELP,
} from "./input-bindings";
import type { Position } from "./types";
import type { StageDeploymentPresentation } from "./stage-runtime";

const ROSTER_COLUMN_X = [8, 152, 296] as const;
const ROSTER_ROW_Y = [35, 95, 155, 215, 275] as const;
const PAGE_X = 440;
const PAGE_Y = [35, 65, 95] as const;
const FINISH_X = 540;
const FINISH_Y = 35;
const ROSTER_COPY_LEFT = 56;
const ROSTER_COPY_WIDTH = 74;
const ROSTER_COPY_HEIGHT = 24;
const NATIVE_DETAIL_WIDTH = 284;
const NATIVE_DETAIL_HEIGHT = 116;

const ACTION_CATEGORY_LABEL = {
  ordinary: "普通",
  shooting: "射擊",
  technique: "技術",
  special_runtime: "特殊",
} as const;

const figureAssetFor = (classId: ClassId): string =>
  allyMapUnitAsset(classId) ?? "/assets/original/unit-ally-soldier.png";

const figureSourceFor = (classId: ClassId): string =>
  stagedRenderAssetSource(figureAssetFor(classId));

const positionKey = ({ x, y }: Position): string => `${x},${y}`;

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const percent = (value: number, total: number): number =>
  total <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / total) * 100)));

function drawCenteredRosterText(
  context: CanvasRenderingContext2D,
  text: string,
  left: number,
  top: number,
): void {
  const textWidth = layoutNativeText(text, 0, 0).right;
  const x = left + Math.floor((ROSTER_COPY_WIDTH - textWidth) / 2);
  context.save();
  context.beginPath();
  context.rect(left, top, ROSTER_COPY_WIDTH, ROSTER_COPY_HEIGHT);
  context.clip();
  drawNativeText(context, text, x, top + 3);
  context.restore();
}

function pressed(gamepad: Gamepad, button: number): boolean {
  return gamepad.buttons[button]?.pressed === true;
}

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
  if (fixed) return "固定出場";
  return deployed ? "已出場" : "待命中";
};

function detailHtml(view: RosterEntryView): string {
  const { unit } = view;
  if (!unit) return "";
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

  return `<div class="deployment-detail-head">
      <span class="deployment-detail-portrait-frame">
        <img class="deployment-detail-portrait" src="${stagedRenderAssetSource(portraitSourceFor(unit.portrait))}" alt="" aria-hidden="true" />
        <em class="deployment-detail-state">${statusLabelFor(view)}</em>
      </span>
      <div class="deployment-detail-copy">
        <strong>${escapeHtml(unit.name)}</strong>
        <span>${escapeHtml(unit.className)} · Lv ${stats.level} · ${ACTION_CATEGORY_LABEL[definition.actionCategory]}</span>
        <span>生命 <b>${unit.life}／${stats.maxLife}</b></span>
        <i class="deployment-detail-meter is-life"><i style="width:${percent(unit.life, stats.maxLife)}%"></i></i>
      </div>
    </div>
    <dl class="deployment-detail-stats">
      <div><dt>攻擊</dt><dd>${stats.attack}</dd></div>
      <div><dt>防禦</dt><dd>${stats.defense}</dd></div>
      <div><dt>移動</dt><dd>${stats.movement}</dd></div>
    </dl>
    <p class="deployment-detail-exp"><span>經驗</span>
      <i class="deployment-detail-meter is-exp"><i style="width:${percent(experienceGained, experienceSpan)}%"></i></i>
      <b>${unit.experience}／${nextExperience}</b></p>
    ${actions.length ? `<p class="deployment-detail-actions"><span>行動</span><b>${actions.map(escapeHtml).join("・")}</b></p>` : ""}`;
}

function tooltipOffset(index: number): { left: number; top: number } {
  const column = Math.floor(index / 5);
  const row = index % 5;
  const x = ROSTER_COLUMN_X[column] ?? ROSTER_COLUMN_X[0];
  const y = ROSTER_ROW_Y[row] ?? ROSTER_ROW_Y[0];
  const screenLeft = Math.max(4, Math.min(640 - NATIVE_DETAIL_WIDTH - 4, x + 65 - NATIVE_DETAIL_WIDTH / 2));
  const screenTop = y <= ROSTER_ROW_Y[2]
    ? y + 54
    : y - NATIVE_DETAIL_HEIGHT - 4;
  return { left: screenLeft - x, top: screenTop - y };
}

function rosterEntryHtml(view: RosterEntryView): string {
  const { index, unit, fixed, deployed, focused } = view;
  const column = Math.floor(index / 5);
  const row = index % 5;
  const x = ROSTER_COLUMN_X[column] ?? ROSTER_COLUMN_X[0];
  const y = ROSTER_ROW_Y[row] ?? ROSTER_ROW_Y[0];
  const tooltip = tooltipOffset(index);
  const classes = ["deployment-entry"];
  if (focused) classes.push("is-focused");
  if (deployed) classes.push("is-deployed");
  if (fixed) classes.push("is-fixed");
  if (!unit) classes.push("is-empty");

  if (!unit) {
    return `<div class="${classes.join(" ")}" style="left:${x}px;top:${y}px"
      data-roster-index="${index}">
      <span class="deployment-entry-base" aria-hidden="true"></span>
      <span class="deployment-entry-figure-frame" aria-hidden="true"></span>
      <button class="deployment-entry-hitbox" type="button" tabindex="-1"
        data-roster-index="${index}" data-testid="deployment-roster-${index}"
        aria-label="空名單，此處沒有人" aria-pressed="false">
        <span class="visually-hidden">空名單</span>
      </button>
    </div>`;
  }

  const stats = classStatsFor(unit);
  const figureOffsetX = mapUnitVisualOffset(unit.classId, 1);
  const status = statusLabelFor(view);
  const label = `${unit.name}，${unit.className}，等級 ${stats.level}，生命 ${unit.life}／${stats.maxLife}，${status}`;
  return `<div class="${classes.join(" ")}" data-unit-slot="${unit.slot}"
      style="left:${x}px;top:${y}px;--detail-left:${tooltip.left}px;--detail-top:${tooltip.top}px">
    <span class="deployment-entry-base" aria-hidden="true"></span>
    <span class="deployment-entry-figure-frame" aria-hidden="true"></span>
    <span class="deployment-entry-figure-slot" aria-hidden="true"
      style="--map-unit-offset-x:${figureOffsetX}px">
      <img class="deployment-entry-figure" data-testid="deployment-roster-figure-${index}"
        src="${figureSourceFor(unit.classId)}" data-source-url="${figureAssetFor(unit.classId)}"
        alt="" />
    </span>
    <button class="deployment-entry-hitbox" type="button" tabindex="-1"
      data-roster-index="${index}" data-unit-slot="${unit.slot}" data-testid="deployment-roster-${index}"
      aria-label="${escapeHtml(label)}" aria-pressed="${deployed}">
      <span class="visually-hidden">${escapeHtml(unit.name)}　${escapeHtml(unit.className)}　${status}</span>
    </button>
    <aside class="deployment-detail" data-testid="deployment-detail-${index}" aria-label="${escapeHtml(unit.name)}人物詳情">
      ${detailHtml(view)}
    </aside>
  </div>`;
}

function focusPointerStyle(focus: DeploymentFocus): string | undefined {
  if (focus.kind === "roster") {
    const column = Math.floor(focus.index / 5);
    const row = focus.index % 5;
    return `left:${57 + column * 144 + 60 - 3}px;top:${59 + row * 60 + 20 - 2}px`;
  }
  if (focus.kind === "page") {
    return `left:${PAGE_X + 60 - 3}px;top:${PAGE_Y[focus.page] + 20 - 2}px`;
  }
  if (focus.kind === "finish") {
    return `left:${FINISH_X + 60 - 3}px;top:${FINISH_Y + 20 - 2}px`;
  }
  return undefined;
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
  root.dataset.inputMode = "pointer";
  root.dataset.pointerDetails = "false";

  const minimap = new DeploymentMinimap({
    source: stagedRenderAssetSource(presentation.minimap),
    gridWidth: presentation.gridWidth,
    gridHeight: presentation.gridHeight,
  });
  let destroyed = false;

  const paintNativeText = () => {
    const canvas = root.querySelector<HTMLCanvasElement>(".deployment-native-text");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < 15; index += 1) {
      const unit = session.rosterUnitFor(session.rosterSlotAt(index));
      if (!unit) continue;
      const column = Math.floor(index / 5);
      const row = index % 5;
      const x = ROSTER_COLUMN_X[column] ?? ROSTER_COLUMN_X[0];
      const y = ROSTER_ROW_Y[row] ?? ROSTER_ROW_Y[0];
      drawCenteredRosterText(context, unit.name, x + ROSTER_COPY_LEFT, y);
      drawCenteredRosterText(context, unit.className, x + ROSTER_COPY_LEFT, y + ROSTER_COPY_HEIGHT);
    }
    presentation.pageLabels.forEach((label, page) => {
      drawNativeText(context, label, PAGE_X + 16, (PAGE_Y[page] ?? PAGE_Y[0]) + 3);
    });
    drawNativeText(context, presentation.finishLabel, FINISH_X + 16, FINISH_Y + 3);
    const feedback = session.state.feedback
      ? DEPLOYMENT_FEEDBACK_TEXT[session.state.feedback]
      : undefined;
    if (feedback) drawNativeText(context, feedback, 160, 330);
  };

  const render = () => {
    const { state } = session;
    const fixedSlots = new Set(state.definition.fixedPlacements.map(({ slot }) => slot));
    const deployedSlots = new Set(state.placements.map(({ slot }) => slot));
    const occupiedCells = new Set(state.placements.map(({ position }) => positionKey(position)));
    const current = state.currentOpenCell;
    const feedback = state.feedback ? DEPLOYMENT_FEEDBACK_TEXT[state.feedback] : undefined;
    const dangerKeys = new Set((presentation.dangerCells ?? []).map(positionKey));

    const entries = Array.from({ length: 15 }, (_, index): RosterEntryView => {
      const slot = session.rosterSlotAt(index);
      return {
        index,
        unit: session.rosterUnitFor(slot),
        fixed: slot !== undefined && fixedSlots.has(slot),
        deployed: slot !== undefined && deployedSlots.has(slot),
        focused: state.focus.kind === "roster" && state.focus.index === index,
      };
    });

    const pageTabs = presentation.pageLabels.map((_label, page) => {
      const typedPage = page as 0 | 1 | 2;
      const active = state.rosterPage === typedPage;
      return `<button type="button" tabindex="-1" data-page="${page}" data-testid="deployment-page-${page}"
        class="deployment-page${active ? " is-active" : ""}"
        style="left:${PAGE_X}px;top:${PAGE_Y[page] ?? PAGE_Y[0]}px"
        aria-label="名單第 ${page + 1} 頁" aria-pressed="${active}">
        <span class="visually-hidden">名單第 ${page + 1} 頁</span>
      </button>`;
    }).join("");

    const blinkRect = current && !state.submitted ? minimap.cellRect(current) : undefined;
    const landingCells = state.definition.openCells.map((position) => {
      const key = positionKey(position);
      const occupied = occupiedCells.has(key);
      const selected = current?.x === position.x && current.y === position.y;
      const dangerous = dangerKeys.has(key);
      return `<button type="button" tabindex="-1" data-open-cell="${key}"
        class="deployment-open-cell${selected ? " is-current" : ""}${occupied ? " is-occupied" : ""}${dangerous ? " is-danger" : ""}"
        style="left:${position.x * NATIVE_DEPLOYMENT_MINIMAP_CELL_SIZE}px;top:${position.y * NATIVE_DEPLOYMENT_MINIMAP_CELL_SIZE}px"
        aria-label="部署落點 ${key}${occupied ? "，已使用" : selected ? "，目前選擇" : ""}${dangerous ? `，${presentation.dangerText ?? "危險區"}` : "，首輪安全"}"
        ${occupied || state.submitted ? "disabled" : ""}><span class="visually-hidden">${key}${dangerous ? " 危險" : ""}</span></button>`;
    }).join("");
    const pointerStyle = focusPointerStyle(state.focus);
    const summary = `已出場 ${state.placements.length}／${state.definition.maximumUnits}`;
    const normalStatus = state.submitted
      ? `部署完成：${state.placements.length} 人編隊已建立。`
      : `選擇出場人物；${presentation.minimumUnits}至${state.definition.maximumUnits}人均可完成。`;

    root.innerHTML = `
      <h2 class="visually-hidden">${escapeHtml(presentation.title)} · 出擊準備</h2>
      <p class="visually-hidden" data-testid="deployment-summary" aria-live="polite">${summary}</p>
      ${presentation.guidanceText ? `<p class="visually-hidden" data-testid="deployment-guidance">${escapeHtml(presentation.guidanceText)}</p>` : ""}

      <section class="deployment-roster" aria-label="出場名單">
        ${entries.map(rosterEntryHtml).join("")}
      </section>
      <nav class="deployment-pages" aria-label="名單頁面">${pageTabs}</nav>
      <button type="button" tabindex="-1" data-finish data-testid="deployment-finish"
        class="deployment-finish" style="left:${FINISH_X}px;top:${FINISH_Y}px"
        aria-label="${escapeHtml(presentation.finishLabel)}"><span class="visually-hidden">${escapeHtml(presentation.finishLabel)}</span></button>

      <aside class="deployment-rail" aria-label="戰場預覽">
        <section class="deployment-map-panel">
          <div class="deployment-map-frame${state.focus.kind === "map" ? " is-focused" : ""}">
            <canvas class="deployment-map" data-testid="deployment-minimap"
              width="${minimap.width}" height="${minimap.height}"
              role="img" aria-label="${escapeHtml(presentation.title)}完整戰場預覽；藍色是我方、紅色是敵方、白色是可用部署格"></canvas>
            ${blinkRect ? `<span class="deployment-map-blink" data-testid="deployment-minimap-blink"
              data-current-cell="${current?.x},${current?.y}" aria-hidden="true"
              style="left:${blinkRect.left}px;top:${blinkRect.top}px;width:${blinkRect.size}px;height:${blinkRect.size}px"></span>` : ""}
            <div class="deployment-open-cells" aria-label="可選部署落點">${landingCells}</div>
          </div>
        </section>
      </aside>

      ${feedback ? '<span class="deployment-error-frame" aria-hidden="true"></span>' : ""}
      <p class="visually-hidden deployment-status${feedback ? " is-error" : ""}" data-testid="deployment-status"
        ${feedback ? 'role="alert"' : 'aria-live="polite"'}>${feedback ?? normalStatus}</p>
      <p class="visually-hidden" aria-live="polite">${current ? `下一落點 ${current.x},${current.y}` : "部署格已用完"}</p>
      ${state.submitted ? `<p class="visually-hidden" data-testid="deployment-submitted">部署結果已建立，正在進入${escapeHtml(presentation.title)}開場劇情</p>` : ""}

      <canvas class="deployment-native-text" width="640" height="350" aria-hidden="true"></canvas>
      ${pointerStyle ? `<span class="deployment-native-focus-pointer" style="${pointerStyle}" aria-hidden="true"></span>` : ""}
    `;

    const canvas = root.querySelector<HTMLCanvasElement>(".deployment-map");
    if (canvas) {
      const markers: DeploymentMinimapMarker[] = [
        ...presentation.enemies.map((position): DeploymentMinimapMarker => ({ position, kind: "enemy" })),
        ...state.placements.map(({ position }): DeploymentMinimapMarker => ({ position, kind: "ally" })),
        ...state.definition.openCells
          .filter((position) => !occupiedCells.has(positionKey(position)))
          .map((position): DeploymentMinimapMarker => ({
            position,
            kind: current && current.x === position.x && current.y === position.y ? "current" : "open",
          })),
      ];
      minimap.render(canvas, { markers });
    }

    root.dataset.focusKind = state.focus.kind;
    root.dataset.rosterPage = String(state.rosterPage);
    root.dataset.feedback = state.feedback ?? "";
    root.dataset.submitted = String(state.submitted);
    root.dataset.pointerDetails = "false";
    paintNativeText();
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
    if (!direction && !isKeyboardConfirm(event.key) && !isKeyboardCancel(event.key) && event.key !== "Tab") return;
    root.dataset.inputMode = "keyboard";
    if (direction) session.moveFocus(direction);
    else if (isKeyboardConfirm(event.key)) session.primary();
    else if (isKeyboardCancel(event.key)) session.secondary();
    else if (session.state.focus.kind === "map") session.leaveMap();
    else session.focusMap();
    event.preventDefault();
  };

  const handlePointerDown = () => {
    root.dataset.inputMode = "pointer";
    root.dataset.pointerDetails = "false";
    root.focus({ preventScroll: true });
  };
  const handlePointerMove = (event: PointerEvent) => {
    if ((event.target as Element | null)?.closest(".deployment-entry-hitbox")) {
      root.dataset.pointerDetails = "true";
    }
  };

  let previousGamepad = new Set<string>();
  let animationFrame = 0;
  const pollGamepad = () => {
    const gamepad = Array.from(navigator.getGamepads?.() ?? []).find((candidate) => candidate?.connected);
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
        root.dataset.inputMode = "keyboard";
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
  root.addEventListener("pointermove", handlePointerMove);
  const unsubscribe = session.onChange(render);
  render();
  void loadNativeFont().then(() => {
    if (!destroyed) paintNativeText();
  });
  animationFrame = requestAnimationFrame(pollGamepad);

  return () => {
    destroyed = true;
    unsubscribe();
    cancelAnimationFrame(animationFrame);
    root.removeEventListener("click", handleClick);
    root.removeEventListener("keydown", handleKeyDown);
    root.removeEventListener("pointerdown", handlePointerDown);
    root.removeEventListener("pointermove", handlePointerMove);
  };
}
