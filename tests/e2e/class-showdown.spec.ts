import { expect, test } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface ClassShowdownBattleState {
  cameraOrigin: { x: number; y: number };
  cursor: { x: number; y: number };
  actionMode: string;
  commandMenuKind: string;
  commands: Array<{ id: string; label: string }>;
  reachable: Array<{ x: number; y: number }>;
  actionRange: Array<{ x: number; y: number }>;
  targets: Array<{ x: number; y: number }>;
  effectPreviewCells: Array<{ x: number; y: number }>;
  lastCombat?: {
    attackerId: string;
    defenderId: string;
    defenderDied: boolean;
    experienceGained: number;
    counterExperienceGained: number;
    defenderDeathTargets?: Array<{ id: string; x: number; y: number }>;
    splitUnitId?: string;
    splitCount?: number;
  };
  combatPresentation?: { phase: string };
  combatPresentationTrace: Array<{
    phase: string;
    frame: number;
    deathTargetId?: string;
  }>;
  specialActionPresentation?: { phase: string };
  specialActionPresentationTrace: Array<{ phase: string }>;
  movementPresentation?: {
    unitId: string;
    kind: string;
    path: Array<{ x: number; y: number }>;
    stepIndex: number;
  };
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    x: number;
    y: number;
    acted: boolean;
    life: number;
    experience: number;
    statuses: Record<string, number>;
  }>;
}

const classShowdownBattleState = (page: import("@playwright/test").Page) => page.evaluate(() =>
  (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
    battle?: ClassShowdownBattleState;
  }).battle);

async function clickClassShowdownWorldCell(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
): Promise<void> {
  const canvas = page.getByTestId("battle-canvas");
  const [battle, box, dimensions] = await Promise.all([
    classShowdownBattleState(page),
    canvas.boundingBox(),
    canvas.evaluate((element) => ({ width: element.width, height: element.height })),
  ]);
  if (!battle || !box) throw new Error("class showdown battle canvas is not ready");
  const logicalX = 40 + (x - battle.cameraOrigin.x + .5) * 40;
  const logicalY = 23 + (y - battle.cameraOrigin.y + .5) * 44;
  await canvas.click({
    position: {
      x: logicalX * box.width / dimensions.width,
      y: logicalY * box.height / dimensions.height,
    },
  });
}

async function hoverClassShowdownWorldCell(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
): Promise<void> {
  const canvas = page.getByTestId("battle-canvas");
  const [battle, box, dimensions] = await Promise.all([
    classShowdownBattleState(page),
    canvas.boundingBox(),
    canvas.evaluate((element) => ({ width: element.width, height: element.height })),
  ]);
  if (!battle || !box) throw new Error("class showdown battle canvas is not ready");
  const logicalX = 40 + (x - battle.cameraOrigin.x + .5) * 40;
  const logicalY = 23 + (y - battle.cameraOrigin.y + .5) * 44;
  await canvas.hover({
    position: {
      x: logicalX * box.width / dimensions.width,
      y: logicalY * box.height / dimensions.height,
    },
  });
}

test("all-class showdown applies one level to every mirror and enters formal battle", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");

  await expect(page.getByRole("heading", { name: "全職業對陣場" })).toBeVisible();
  await expect(page.getByTestId("class-showdown-pair")).toHaveCount(35);
  await expect(page.getByText("35 MATCHUPS · 70 UNITS")).toBeVisible();
  await expect(page.getByText(/女帝、龍、頭、手屬於特殊運行記錄/)).toBeVisible();
  await expect(page.getByTestId("class-showdown-status")).toContainText("35 組、70 名單位");
  const storageBefore = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));

  await page.getByTestId("class-showdown-level").selectOption("2");
  await page.getByTestId("class-showdown-apply-level").click();
  await expect(page.getByTestId("class-showdown-status")).toContainText("全部 35 組職業");
  const setupState = await page.evaluate(() => window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
    mode: string;
    level: number;
    placements: Array<{ side: number; classId: string; level: number; x: number; y: number }>;
  });
  expect(setupState.mode).toBe("setup");
  expect(setupState.level).toBe(2);
  expect(setupState.placements).toHaveLength(70);
  expect(setupState.placements.every(({ level }) => level === 2)).toBe(true);
  await expect(page.locator("[data-pair-level]").first()).toHaveText("職業等級 2 · 經驗 100");
  await captureVisualAudit(page, {
    path: `${ARTIFACT_DIR}/class-showdown-setup.png`,
    fullPage: true,
  });

  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("class-showdown-toolbar")).toContainText("35 組 · 第 2 級資料");
  const battleState = await page.evaluate(() => window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
    mode: string;
    battle: {
      phase: string;
      campaignPersistenceEnabled: boolean;
      units: Array<{ side: number; classId: string; experience: number; x: number; y: number }>;
    };
  });
  expect(battleState).toMatchObject({
    mode: "battle",
    battle: {
      phase: "player",
      campaignPersistenceEnabled: false,
    },
  });
  expect(battleState.battle.units).toHaveLength(70);
  expect(battleState.battle.units.filter(({ side }) => side === 1)).toHaveLength(35);
  expect(battleState.battle.units.filter(({ side }) => side === 2)).toHaveLength(35);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-battle.png`,
  });

  await page.getByTestId("class-showdown-return").click();
  await expect(page.getByTestId("class-showdown-pair")).toHaveCount(35);
  const storageAfter = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  expect(storageAfter).toBe(storageBefore);
  expect(pageErrors).toEqual([]);
});

test("advanced fire uses the formal campaign atlas mapping in the all-class showdown", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-level").selectOption("2");
  await page.getByTestId("class-showdown-apply-level").click();
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  for (let step = 0; step < 11; step += 1) await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
    .toEqual({ x: 17, y: 26 });
  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-fire-3")).toContainText("高級炎暴");
  await page.getByTestId("technique-fire-3").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");

  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatPhase === "fireEffect"
      && dataset.mapCombatFrame === "10"
      && dataset.mapCombatEffectTileCount === "6";
  }, undefined, { polling: "raf" });
  await expect(canvas).toHaveAttribute(
    "data-map-combat-effect-atlas-frames",
    [39, 40, 41, 42, 43, 44].map((frame) => `fire-3__effect__${frame}`).join(","),
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-fire-3-formal-atlas.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("jungle warrior melee poison is direct and leaves the persistent native status icon", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickClassShowdownWorldCell(page, 17, 17);
  await expect(page.locator(".hud-identity-name")).toHaveText("叢林戰士／叢林戰士");
  await page.getByTestId("unit-command-attack").click();
  await clickClassShowdownWorldCell(page, 18, 17);

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
      battle?: ClassShowdownBattleState;
    }).battle;
    return current?.lastCombat?.attackerId === "arena-1-2"
      && current.combatPresentation === undefined
      && current.specialActionPresentation === undefined;
  });
  const battle = await classShowdownBattleState(page);
  expect(battle?.lastCombat).toMatchObject({
    attackerId: "arena-1-2",
    defenderId: "arena-2-2",
    defenderDied: false,
  });
  expect(battle?.units.find(({ id }) => id === "arena-2-2")?.statuses.poison).toBe(3);
  expect(battle?.specialActionPresentationTrace).toEqual([]);

  await clickClassShowdownWorldCell(page, 18, 17);
  await expect(page.getByTestId("unit-control-summary")).toHaveCount(0);
  await expect(page.getByTestId("unit-tactic")).toHaveText("戰術主動進攻");
  await expect(page.getByTestId("status-strip")).toHaveText("戰術主動進攻・特性命中施毒");
  await expect(page.getByTestId("status-strip")).not.toContainText("紅色格");
  await expect(page.getByTestId("hud-identity").locator("span")).toHaveCount(0);
  const poisonIcon = page.getByTestId("status-icon-poison");
  await expect(poisonIcon).toHaveAttribute("data-remaining-rounds", "3");
  await expect(poisonIcon).toHaveAttribute("aria-label", "施毒，剩餘 3 回合");
  await expect(poisonIcon.locator("img")).toHaveAttribute(
    "src",
    "/assets/original/status-icons/06.png",
  );
  // 剩餘回合是原版點陣字畫在 (圖示X-6, 圖示Y+20)＝(478,279) 的緊湊模式數字，
  // DOM 的那一份只留給無障礙名稱。
  await expect.poll(() => page.locator(".native-text-layer").evaluate((canvas) => {
    const { data } = (canvas as HTMLCanvasElement).getContext("2d")!.getImageData(477, 279, 12, 16);
    return data.reduce((total, value, index) => index % 4 === 3 && value !== 0 ? total + 1 : total, 0);
  })).toBeGreaterThan(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-jungle-poison-status-icon.png`,
  });

  const tooltip = page.getByTestId("status-tooltip-poison");
  await expect(tooltip).toBeHidden();
  await poisonIcon.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("施毒剩餘 3 回合回合開始時生命減半，最低保留 1。");
  // The panel is flush against the right edge, so the plate has to open inside
  // the logical screen instead of spilling off it.
  const [screenBox, tooltipBox] = await Promise.all([
    page.getByTestId("game-screen").boundingBox(),
    tooltip.boundingBox(),
  ]);
  if (!screenBox || !tooltipBox) throw new Error("status tooltip geometry is not measurable");
  expect(tooltipBox.x).toBeGreaterThanOrEqual(screenBox.x);
  expect(tooltipBox.y).toBeGreaterThanOrEqual(screenBox.y);
  expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(screenBox.x + screenBox.width);
  expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(screenBox.y + screenBox.height);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-status-icon-tooltip.png`,
  });

  // Only the icon row opts back into hit testing, so leaving it is enough to
  // close the plate again.
  await page.mouse.move(screenBox.x + 8, screenBox.y + 8);
  await expect(tooltip).toBeHidden();
  expect(pageErrors).toEqual([]);
});

// REMAKE-098/099 removed the last two probabilistic class traits, so this strip
// must no longer advertise a rate for either one.
test("determinized traits show exact wording in the selected-unit strip", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  for (let step = 0; step < 17; step += 1) await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
    .toEqual({ x: 17, y: 32 });
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-identity-name")).toHaveText("獸骨騎士／獸骨騎士");
  await expect(page.getByTestId("unit-traits")).toHaveText("特性以牙還牙");
  await expect(page.getByTestId("unit-traits")).toHaveAttribute(
    "aria-label",
    /必定.*完整傷害.*較高者/u,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-determinized-traits.png`,
  });

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("action-menu")).toBeHidden();
  for (let step = 0; step < 12; step += 1) await page.keyboard.press("ArrowRight");
  for (let step = 0; step < 17; step += 1) await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
    .toEqual({ x: 29, y: 15 });
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-identity-name")).toHaveText("迅龍騎士／迅龍騎士");
  await expect(page.getByTestId("unit-traits")).toHaveText("特性免疫物理射擊");
  await expect(page.getByTestId("unit-traits")).toHaveAttribute(
    "aria-label",
    /完全免疫.*魔弓兵/u,
  );
  expect(pageErrors).toEqual([]);
});

test("water warrior splits after defensive melee and all copies show shared life", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  for (let step = 0; step < 12; step += 1) await page.keyboard.press("ArrowRight");
  for (let step = 0; step < 8; step += 1) await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
    .toEqual({ x: 29, y: 23 });
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-identity-name")).toHaveText("水戰士／水戰士");
  await expect(page.getByTestId("unit-traits")).toHaveText("特性近戰受擊分裂");
  await expect(page.getByTestId("unit-traits")).toHaveAttribute(
    "aria-label",
    /相鄰合法空格新增一個分裂體.*共享生命.*最多 4 個/u,
  );
  await page.getByTestId("unit-command-attack").click();

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
      battle?: ClassShowdownBattleState;
    }).battle;
    return current?.lastCombat?.splitUnitId === "arena-2-26:split-1"
      && current.combatPresentation === undefined;
  });
  const battle = await classShowdownBattleState(page);
  expect(battle?.lastCombat).toMatchObject({
    attackerId: "arena-1-26",
    defenderId: "arena-2-26",
    defenderDied: false,
    splitUnitId: "arena-2-26:split-1",
    splitCount: 2,
  });
  const root = battle?.units.find(({ id }) => id === "arena-2-26");
  const split = battle?.units.find(({ id }) => id === "arena-2-26:split-1");
  expect(split).toMatchObject({ classId: "water-warrior", x: 31, y: 23, life: root?.life });
  await expect(page.getByTestId("status-strip")).toContainText("水戰士分裂為 2 個並共享生命");

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
    .toEqual({ x: 31, y: 23 });
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-identity-name")).toHaveText("水戰士／水戰士");
  await expect(page.getByTestId("unit-traits")).toHaveText("特性近戰受擊分裂");
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute("data-unit-life-label-count", "71");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-water-warrior-split.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("REMAKE-093 adds 射擊 to the water warrior's own command menu", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  // Only the side-1 half is observable here: an enemy never opens a player
  // command menu, so the side-2 withholding is pinned in
  // `class-balance-overrides.test.ts` against the simulation instead.
  const selectWaterWarrior = async (unitId: string): Promise<void> => {
    const placed = await classShowdownBattleState(page);
    const unit = placed?.units.find(({ id }) => id === unitId);
    expect(unit?.classId, unitId).toBe("water-warrior");
    const from = placed!.cursor;
    for (let step = 0; step < Math.abs(unit!.y - from.y); step += 1) {
      await page.keyboard.press(unit!.y > from.y ? "ArrowDown" : "ArrowUp");
    }
    for (let step = 0; step < Math.abs(unit!.x - from.x); step += 1) {
      await page.keyboard.press(unit!.x > from.x ? "ArrowRight" : "ArrowLeft");
    }
    await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
      .toEqual({ x: unit!.x, y: unit!.y });
    await page.keyboard.press("Space");
    await expect(page.locator(".hud-identity-name")).toHaveText("水戰士／水戰士");
  };

  // The side-1 water warrior keeps its melee command and gains 射擊 beside it.
  await selectWaterWarrior("arena-1-26");
  await expect(page.getByTestId("unit-command-attack")).toBeVisible();
  await expect(page.getByTestId("unit-command-shoot")).toBeVisible();
  // The melee identity is untouched: the split trait and 攻擊 both survive.
  await expect(page.getByTestId("unit-traits")).toHaveText("特性近戰受擊分裂");
  await expect(page.getByTestId("unit-command-move")).toBeVisible();
  await expect(page.getByTestId("unit-command-rest")).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-water-warrior-shoot-command.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("water warrior copies die in sequence and multiply the killer's experience", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.evaluate(() =>
    window.__ANGEL2_CLASS_SHOWDOWN__?.forceWaterWarriorGroupDeathSetup());

  const setup = await classShowdownBattleState(page);
  const attacker = setup?.units.find(({ id }) => id === "arena-1-26");
  const waterGroup = setup?.units.filter(({ side, slot }) => side === 2 && slot === 26) ?? [];
  expect(waterGroup).toHaveLength(4);
  expect(new Set(waterGroup.map(({ life }) => life))).toEqual(new Set([1]));
  expect(attacker).toBeDefined();

  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-attack").click();
  const canvas = page.getByTestId("battle-canvas");
  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid=battle-canvas]");
    return element?.dataset.mapCombatPhase === "defenderDeath"
      && element.dataset.mapCombatTarget === "arena-2-26:split-1"
      && element.dataset.mapCombatFrame === "3";
  });
  await expect(canvas).toHaveAttribute("data-map-combat-death-target-index", "1");
  await expect(canvas).toHaveAttribute("data-map-combat-death-target-count", "4");
  await expect(canvas).toHaveAttribute("data-unit-life-label-count", "72");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-water-warrior-sequential-death.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
      battle?: ClassShowdownBattleState;
    }).battle;
    return current?.lastCombat?.defenderDied === true
      && current.combatPresentation === undefined;
  });
  const resolved = await classShowdownBattleState(page);
  const deathTargets = resolved?.lastCombat?.defenderDeathTargets ?? [];
  const deathTrace = resolved?.combatPresentationTrace.filter(
    ({ phase }) => phase === "defenderDeath",
  ) ?? [];
  expect(deathTargets.map(({ id }) => id)).toEqual([
    "arena-2-26",
    "arena-2-26:split-1",
    "arena-2-26:split-2",
    "arena-2-26:split-3",
  ]);
  expect(deathTrace).toHaveLength(60);
  expect(deathTrace.map(({ deathTargetId }) => deathTargetId)).toEqual(
    deathTargets.flatMap(({ id }) => Array.from({ length: 15 }, () => id)),
  );
  expect((resolved!.lastCombat!.experienceGained) / deathTargets.length)
    .toBeGreaterThanOrEqual(44);
  expect((resolved!.lastCombat!.experienceGained) / deathTargets.length)
    .toBeLessThanOrEqual(47);
  expect(resolved?.units.some(({ side, slot }) => side === 2 && slot === 26)).toBe(false);
  expect(resolved?.units.find(({ id }) => id === attacker!.id)?.experience)
    .toBe(attacker!.experience + resolved!.lastCombat!.experienceGained);
  expect(pageErrors).toEqual([]);
});

test("flying dragon knight can move once at half range after attacking", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  for (let step = 0; step < 15; step += 1) await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
    .toEqual({ x: 17, y: 30 });
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-identity-name")).toHaveText("飛龍騎士／飛龍騎士");
  await expect(page.getByTestId("unit-traits")).toHaveText("特性攻後再移動");
  await expect(page.getByTestId("unit-traits")).toHaveAttribute(
    "aria-label",
    /目前移動力一半（向下取整）.*不能再攻擊/u,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-flying-dragon-trait.png`,
  });

  await page.getByTestId("unit-command-attack").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
      battle?: ClassShowdownBattleState;
    }).battle;
    return current?.lastCombat?.attackerId === "arena-1-15"
      && current.combatPresentation === undefined
      && current.actionMode === "actionMenu"
      && current.commandMenuKind === "extraMove";
  });

  const postAttack = await classShowdownBattleState(page);
  expect(postAttack?.commands).toEqual([
    { id: "move", label: "移動" },
    { id: "end", label: "放棄" },
  ]);
  expect(postAttack?.units.find(({ id }) => id === "arena-1-15")?.acted).toBe(true);
  await expect(page.getByTestId("unit-command-attack")).toHaveCount(0);
  await expect(page.getByTestId("unit-command-move")).toBeVisible();
  await expect(page.getByTestId("unit-command-end")).toHaveText("放棄");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-flying-dragon-extra-move-menu.png`,
  });

  await page.getByTestId("unit-command-move").click();
  const targeting = await classShowdownBattleState(page);
  expect(targeting?.actionMode).toBe("move");
  expect(targeting?.reachable.some(({ x, y }) => Math.abs(x - 17) + Math.abs(y - 30) === 4))
    .toBe(true);
  expect(targeting?.reachable.every(({ x, y }) => Math.abs(x - 17) + Math.abs(y - 30) <= 4))
    .toBe(true);
  const destination = { x: 14, y: 29 };
  expect(targeting?.reachable).toContainEqual(destination);
  for (let x = 16; x >= destination.x; x -= 1) {
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await classShowdownBattleState(page))?.cursor.x).toBe(x);
  }
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor.y)
    .toBe(destination.y);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await classShowdownBattleState(page))?.actionMode).toBe("idle");

  const moved = await classShowdownBattleState(page);
  expect(moved?.units.find(({ id }) => id === "arena-1-15")).toMatchObject({
    x: destination.x,
    y: destination.y,
    acted: true,
  });
  await page.keyboard.press("Space");
  await expect(page.getByTestId("unit-command-attack")).toHaveCount(0);
  expect((await classShowdownBattleState(page))?.actionMode).toBe("idle");
  expect(pageErrors).toEqual([]);
});

test("counterattacks grant experience without applying ordinary-hit class status", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  const before = await classShowdownBattleState(page);
  const counteringDefenderBefore = before?.units.find(({ id }) => id === "arena-2-1");
  expect(counteringDefenderBefore).toBeDefined();

  await clickClassShowdownWorldCell(page, 17, 16);
  await expect(page.locator(".hud-identity-name")).toHaveText("魔劍戰士／魔劍戰士");
  await page.getByTestId("unit-command-attack").click();
  await clickClassShowdownWorldCell(page, 18, 16);

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
      battle?: ClassShowdownBattleState;
    }).battle;
    return current?.lastCombat?.attackerId === "arena-1-1"
      && current.combatPresentation === undefined
      && current.specialActionPresentation === undefined;
  });
  const battle = await classShowdownBattleState(page);
  expect(battle?.lastCombat).toMatchObject({
    attackerId: "arena-1-1",
    defenderId: "arena-2-1",
    defenderDied: false,
  });
  expect(battle?.units.find(({ id }) => id === "arena-2-1")?.statuses.defenseDown).toBe(3);
  expect(battle?.units.find(({ id }) => id === "arena-1-1")?.statuses.defenseDown).toBe(0);
  expect(battle?.lastCombat?.counterExperienceGained).toBeGreaterThan(0);
  expect(battle?.units.find(({ id }) => id === "arena-2-1")?.experience).toBe(
    counteringDefenderBefore!.experience + battle!.lastCombat!.counterExperienceGained,
  );

  await clickClassShowdownWorldCell(page, 18, 16);
  await expect(page.locator(".hud-identity-name")).toHaveText("魔劍戰士／魔劍戰士");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-counter-experience.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("unnamed class units use their native branch portrait in the battle HUD", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickClassShowdownWorldCell(page, 17, 15);
  await expect(page.locator(".hud-identity-name")).toHaveText("士兵／士兵");
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "47");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-unnamed-soldier-identity.png`,
  });

  await page.keyboard.press("Delete");
  await clickClassShowdownWorldCell(page, 17, 17);
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "57");

  await page.keyboard.press("Delete");
  await clickClassShowdownWorldCell(page, 18, 17);
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "58");
  expect(pageErrors).toEqual([]);
});

test("area techniques add a read-only effect-radius overlay to native selection dither", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  // The magic priest is the first visible class with both lightning and area
  // recovery in the showdown roster.
  await clickClassShowdownWorldCell(page, 17, 18);
  await page.getByTestId("unit-command-technique").click();

  await page.getByTestId("technique-lightning-1").click();
  const lightning = await classShowdownBattleState(page);
  expect(lightning).toMatchObject({ actionMode: "specialTarget" });
  expect(lightning?.actionRange.length).toBeGreaterThan(0);
  expect(lightning?.targets.length).toBeGreaterThan(0);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-native-dither-retained-fraction",
    "0.25",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-native-dither-cell-count",
    /[1-9]/,
  );
  expect(lightning?.effectPreviewCells).toHaveLength(0);

  await hoverClassShowdownWorldCell(page, 18, 18);
  const lightningPreview = await classShowdownBattleState(page);
  expect(lightningPreview?.effectPreviewCells).toHaveLength(13);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-action-id",
    "lightning-1",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-center",
    "18,18",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-cell-count",
    "13",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-visible-cell-count",
    /[1-9]/,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-lightning-effect-range.png`,
  });

  // Cancel returns to the technique menu; recovery uses the same target-range
  // projection and must not replace it with its effect radius.
  await page.keyboard.press("Alt");
  await expect.poll(async () => (await classShowdownBattleState(page))?.actionMode)
    .toBe("techniqueMenu");
  await page.getByTestId("technique-recovery-1").click();
  const recovery = await classShowdownBattleState(page);
  expect(recovery).toMatchObject({ actionMode: "specialTarget" });
  expect(recovery?.actionRange.length).toBe(lightning?.actionRange.length);
  expect(recovery?.targets.length).toBeGreaterThan(0);
  expect(recovery?.effectPreviewCells).toHaveLength(0);
  await hoverClassShowdownWorldCell(page, 17, 18);
  const recoveryPreview = await classShowdownBattleState(page);
  expect(recoveryPreview?.effectPreviewCells).toHaveLength(13);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-action-id",
    "recovery-1",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-center",
    "17,18",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-effect-preview-cell-count",
    "13",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-native-dither-retained-fraction",
    "0.25",
  );
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-native-dither-cell-count",
    /[1-9]/,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-recovery-effect-range.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("great dragon knight stomp lands on its selected target in the all-class showdown", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  // Index 19 is the second matchup in the second column: move from the initial
  // (17,15) focus to the allied great dragon knight at (29,16).
  for (let step = 0; step < 12; step += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
    .toEqual({ x: 29, y: 16 });
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-identity-name")).toHaveText("巨龍騎士／巨龍騎士");
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-stomp-3")).toContainText("女踏");
  await page.getByTestId("technique-stomp-3").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");

  await page.waitForFunction(() => {
    const dataset = document.querySelector<HTMLCanvasElement>(
      "[data-testid='battle-canvas']",
    )?.dataset;
    return dataset?.mapCombatStompPhase === "quake"
      && dataset.mapCombatStompAction === "stomp-3"
      && dataset.mapCombatStompX === "160"
      && dataset.mapCombatStompShadowY === "368"
      && dataset.mapCombatStompResource === "MAGIC/53"
      && dataset.mapCombatStompTargetScreenX !== undefined
      && dataset.mapCombatStompTargetScreenX === dataset.mapCombatStompImpactScreenX
      && dataset.mapCombatStompTargetScreenY !== undefined
      && dataset.mapCombatStompTargetScreenY === dataset.mapCombatStompImpactScreenY;
  }, undefined, { polling: "raf" });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-stomp-3-target-impact.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("half-dragon warrior can teleport to any empty map cell in the showdown", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/class-showdown.html?test=1");
  await page.getByTestId("class-showdown-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  // The half-dragon warrior is the ninth record, eight rows below the initial focus.
  for (let step = 0; step < 8; step += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(page.locator(".hud-identity-name")).toHaveText("半龍戰士／半龍戰士");
  await expect(page.getByTestId("unit-command-technique")).toBeVisible();
  await page.getByTestId("unit-command-technique").click();
  // REMAKE-062 keeps the named one-item submenu the native handler skips.
  await expect(page.getByTestId("technique-half-dragon-teleport")).toHaveText("傳送");
  await page.getByTestId("technique-half-dragon-teleport").click();

  const selection = await classShowdownBattleState(page);
  expect(selection?.actionMode).toBe("specialTarget");
  expect(selection?.actionRange).toHaveLength(50 * 50);
  expect(selection?.targets).toHaveLength(50 * 50 - 70);
  expect(selection?.targets).not.toContainEqual({ x: 18, y: 23 });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-half-dragon-teleport-targeting.png`,
  });

  // Move the cursor to a distant empty cell and submit the semantic target.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await classShowdownBattleState(page))?.cursor)
    .toEqual({ x: 20, y: 24 });
  const before = await classShowdownBattleState(page);
  const actorBefore = before?.units.find(({ id }) => id === "arena-1-8");
  expect(actorBefore).toMatchObject({ x: 17, y: 23, acted: false });

  await page.keyboard.press("Space");
  // The native handler replays the ordinary movement walk instead of a
  // dedicated effect, so the actor flies a real path to the chosen cell.
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
      battle?: ClassShowdownBattleState;
    }).battle;
    return current?.movementPresentation?.unitId === "arena-1-8";
  }, undefined, { polling: "raf" });
  const flight = await classShowdownBattleState(page);
  expect(flight?.movementPresentation?.path[0]).toEqual({ x: 17, y: 23 });
  expect(flight?.movementPresentation?.path.at(-1)).toEqual({ x: 20, y: 24 });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/class-showdown-half-dragon-teleport-effect.png`,
  });
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_CLASS_SHOWDOWN__?.getState() as {
      battle?: ClassShowdownBattleState;
    }).battle;
    const actor = current?.units.find(({ id }) => id === "arena-1-8");
    return current?.movementPresentation === undefined && actor?.x === 20 && actor?.y === 24;
  });
  const after = await classShowdownBattleState(page);
  expect(after?.units.find(({ id }) => id === "arena-1-8")).toMatchObject({
    x: 20,
    y: 24,
    acted: true,
    experience: actorBefore?.experience,
  });
  // No dedicated technique presentation runs; the movement walk is the effect.
  expect(after?.specialActionPresentationTrace).toEqual([]);
  expect(pageErrors).toEqual([]);
});
