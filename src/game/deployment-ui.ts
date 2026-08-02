import { STAGE1_ASSETS, STAGE1_DEPLOYMENT_UI } from "./content/stage1";
import { classStatsFor } from "./content/classes";
import type { DeploymentSession } from "./deployment-session";
import { DEPLOYMENT_FEEDBACK_TEXT } from "./simulation/deployment";

const PAGE_LABELS = ["Ⅰ", "Ⅱ", "Ⅲ"] as const;

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function portraitSource(portrait: keyof typeof STAGE1_ASSETS.portraits): string {
  return STAGE1_ASSETS.portraits[portrait];
}

function pressed(gamepad: Gamepad, button: number): boolean {
  return gamepad.buttons[button]?.pressed === true;
}

export function mountDeploymentUi(root: HTMLElement, session: DeploymentSession): () => void {
  root.tabIndex = 0;
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", "第 1 關部署名單；方向鍵移動，Control、Insert 或空白鍵主操作，Alt、Delete 或 Enter 次操作，Tab 切換地圖焦點");

  const render = () => {
    const { state } = session;
    const selectedSlots = new Set(state.placements.map(({ slot }) => slot));
    const fixedSlots = new Set(state.definition.fixedPlacements.map(({ slot }) => slot));
    const rosterButtons = STAGE1_DEPLOYMENT_UI.columns.slice(0, 3).flatMap((column) =>
      column.rows.map((top, row) => {
        const index = column.index * 5 + row;
        const slot = session.rosterSlotAt(index);
        const unit = session.rosterUnitFor(slot);
        const selected = slot !== undefined && selectedSlots.has(slot);
        const fixed = slot !== undefined && fixedSlots.has(slot);
        const focused = state.focus.kind === "roster" && state.focus.index === index;
        const width = column.index === 2 ? 84 : 112;
        const status = unit
          ? `${fixed ? "固定" : "可選"} · ${selected ? "已出場" : "未出場"}`
          : "空名單";
        const stats = unit ? classStatsFor(unit) : undefined;
        const label = unit
          ? `${unit.name}，${unit.className}，等級 ${stats?.level}，生命 ${unit.life}，${status}`
          : "空名單，此處沒有人";
        return `<button class="deployment-roster-entry${focused ? " is-focused" : ""}${selected ? " is-deployed" : ""}${fixed ? " is-fixed" : ""}"
          type="button" tabindex="-1" data-roster-index="${index}" data-testid="deployment-roster-${index}"
          aria-label="${escapeHtml(label)}" aria-pressed="${selected}"
          style="left:${column.pointerX}px;top:${top}px;width:${width}px">
          ${unit ? `<img src="${portraitSource(unit.portrait as keyof typeof STAGE1_ASSETS.portraits)}" alt="" aria-hidden="true" />
            <span class="deployment-entry-copy"><b>${escapeHtml(unit.name)}</b><small>${escapeHtml(unit.className)} · Lv ${stats?.level}</small></span>`
            : `<span class="deployment-entry-copy deployment-empty"><b>空名單</b><small>此處沒有人.</small></span>`}
          <span class="deployment-entry-state">${status}</span>
        </button>`;
      }),
    ).join("");

    const pageButtons = PAGE_LABELS.map((label, page) => {
      const typedPage = page as 0 | 1 | 2;
      const focused = state.focus.kind === "page" && state.focus.page === typedPage;
      return `<button type="button" tabindex="-1" class="deployment-page${focused ? " is-focused" : ""}${state.rosterPage === typedPage ? " is-active" : ""}"
        data-page="${page}" data-testid="deployment-page-${page}" aria-label="名單第 ${page + 1} 頁"
        aria-pressed="${state.rosterPage === typedPage}" style="top:${STAGE1_DEPLOYMENT_UI.columns[3].rows[page]}px">${label}</button>`;
    }).join("");

    const focusedSlot = state.focus.kind === "roster"
      ? session.rosterSlotAt(state.focus.index)
      : undefined;
    const focusedUnit = session.rosterUnitFor(focusedSlot);
    const focusedStats = focusedUnit ? classStatsFor(focusedUnit) : undefined;
    const current = state.currentOpenCell;
    const remaining = state.definition.openCells.length
      - state.placements.filter(({ fixed }) => !fixed).length;
    const feedback = state.feedback ? DEPLOYMENT_FEEDBACK_TEXT[state.feedback] : undefined;

    root.innerHTML = `
      <div class="deployment-roster" aria-label="出場名單">${rosterButtons}</div>
      <nav class="deployment-pages" aria-label="名單頁面">${pageButtons}</nav>
      <button type="button" tabindex="-1" class="deployment-finish${state.focus.kind === "finish" ? " is-focused" : ""}"
        data-finish data-testid="deployment-finish">結束</button>
      <aside class="deployment-summary" data-testid="deployment-summary">
        <p class="deployment-stage-name">騎士城堡前 · 部署</p>
        <p class="deployment-count">已出場 <b>${state.placements.length}／${state.definition.maximumUnits}</b></p>
        <p>剩餘空位 ${remaining}</p>
        <p class="deployment-next" aria-live="polite">${current ? `下一落點 ${current.x},${current.y}` : "部署格已用完"}</p>
        <div class="deployment-unit-detail">
          ${focusedUnit ? `<img src="${portraitSource(focusedUnit.portrait as keyof typeof STAGE1_ASSETS.portraits)}" alt="" aria-hidden="true" />
            <dl><div><dt>人物</dt><dd>${escapeHtml(focusedUnit.name)}</dd></div>
            <div><dt>職業</dt><dd>${escapeHtml(focusedUnit.className)}</dd></div>
            <div><dt>等級</dt><dd>${focusedStats?.level}</dd></div>
            <div><dt>生命</dt><dd>${focusedUnit.life}／${focusedStats?.maxLife}</dd></div></dl>`
            : `<p>${state.focus.kind === "map" ? "地圖焦點：主操作前一格，次操作後一格。" : "空名單位置"}</p>`}
        </div>
        <p class="deployment-input-hint">方向鍵／WZAS 移動<br>Ctrl/Ins/Space 主操作<br>Alt/Del/Enter 次操作 · Tab 地圖焦點</p>
      </aside>
      <div class="deployment-status${feedback ? " is-error" : ""}" data-testid="deployment-status"
        ${feedback ? 'role="alert"' : 'aria-live="polite"'}>
        ${feedback ?? (state.submitted ? `部署完成：${state.placements.length} 人編隊已建立。` : "選擇出場人物；五至八人均可完成。")}
      </div>
      ${state.submitted ? `<div class="deployment-submitted" data-testid="deployment-submitted">
        <strong>部署結果已建立</strong><span>P5 將由戰鬥工廠接續 SAY/0005</span>
      </div>` : ""}
    `;
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
    if (rosterIndex !== undefined) session.activateRoster(Number(rosterIndex));
    else if (page !== undefined) session.activatePage(Number(page) as 0 | 1 | 2);
    else if (target.hasAttribute("data-finish")) session.activateFinish();
    root.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const direction = ({
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      z: "down",
      a: "left",
      s: "right",
    } as Readonly<Record<string, "up" | "down" | "left" | "right">>)[
      event.key.length === 1 ? event.key.toLowerCase() : event.key
    ];
    if (direction) session.moveFocus(direction);
    else if (event.key === "Control" || event.key === "Insert" || event.key === " ") session.primary();
    else if (event.key === "Alt" || event.key === "Delete" || event.key === "Enter") session.secondary();
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
