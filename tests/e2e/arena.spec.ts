import { expect, test } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { captureVisualAudit } from "./visual-audit";

test("arena edits both rosters and starts a formal-rule battle without touching saves", async ({ page }) => {
  await page.goto("/arena.html?test=1");
  await expect(page.getByRole("heading", { name: "全地形競技場" })).toBeVisible();
  await expect(page.getByTestId("arena-setup-canvas-root").locator("canvas")).toBeVisible();
  await expect(page.locator("[data-arena-ally-count]")).toHaveText("4 人");
  await expect(page.locator("[data-arena-enemy-count]")).toHaveText("4 人");
  await expect(page.getByTestId("arena-class").locator("option")).toHaveCount(35);
  await page.getByTestId("arena-class").selectOption("water-warrior");
  await expect(page.getByTestId("arena-class-readout")).toContainText("水戰士");
  await expect(page.locator("[data-terrain-slot]")).toHaveCount(8);
  const storageBefore = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));

  await page.getByTestId("arena-side").selectOption("2");
  await page.getByTestId("arena-class").selectOption("magician");
  await page.getByTestId("arena-level").selectOption("3");
  expect(await page.evaluate(() => window.__ANGEL2_ARENA__?.interact(21, 30))).toBe(true);
  await expect(page.locator("[data-arena-enemy-count]")).toHaveText("5 人");
  await captureVisualAudit(page, { path: `${ARTIFACT_DIR}/arena-setup.png`, fullPage: true });

  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("arena-battle-toolbar")).toContainText("4 vs 5");
  const state = await page.evaluate(() => window.__ANGEL2_ARENA__?.getState() as {
    mode: string;
    battle: {
      stageId: string;
      phase: string;
      campaignPersistenceEnabled: boolean;
      systemCommands: Array<{ id: string }>;
      units: Array<{ side: number; classId: string; x: number; y: number }>;
    };
  });
  expect(state).toMatchObject({
    mode: "battle",
    battle: {
      stageId: "stage-01",
      phase: "player",
      campaignPersistenceEnabled: false,
      systemCommands: [{ id: "settings" }, { id: "objectives" }],
    },
  });
  expect(state.battle.units).toContainEqual(expect.objectContaining({
    side: 2,
    classId: "magician",
    x: 21,
    y: 30,
  }));
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-battle.png`,
  });

  await page.getByTestId("arena-return-setup").click();
  await expect(page.getByTestId("arena-setup-canvas-root").locator("canvas")).toBeVisible();
  await expect(page.locator("[data-arena-enemy-count]")).toHaveText("5 人");
  const storageAfter = await page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  expect(storageAfter).toBe(storageBefore);
});

test("arena HUD uses each unnamed class's native side portrait", async ({ page }) => {
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("archer");
    const ally = arena.interact(20, 30);
    arena.setSide(2);
    const enemy = arena.interact(21, 30);
    return [ally, enemy];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickArenaWorldCell(page, 20, 30);
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "59");
  await expect(page.getByTestId("unit-portrait"))
    .toHaveAttribute("src", /portraits\/0059\/base\.png$/u);

  await page.keyboard.press("Delete");
  await clickArenaWorldCell(page, 21, 30);
  await expect(page.getByTestId("unit-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "60");
  await expect(page.getByTestId("unit-portrait"))
    .toHaveAttribute("src", /portraits\/0060\/base\.png$/u);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-enemy-archer-portrait.png`,
  });
});

test("automatic magic-archer shooting never borrows a same-code technique declaration", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    const target = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("magic-archer");
    const shooter = arena.interact(23, 30);
    return [target, shooter];
  });
  expect(placed).toEqual([true, true]);
  await page.getByTestId("arena-start").click();

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-rest").click();
  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.specialActionPresentation?.phase === "shootLineGrow";
  });

  await expect(page.getByTestId("dialogue-layer")).toBeHidden();
  await expect(page.getByText(/生命[全單]\./u)).toHaveCount(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-magic-archer-ai-without-technique-dialogue.png`,
  });

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastSpecialAction?.actionId === "magic-archer-shot"
      && current.lastSpecialAction.actorId === "arena-2-0"
      && current.specialActionPresentation === undefined;
  });
  expect(pageErrors).toEqual([]);
});

test("free action gives an allied magician the shared expert technique planner", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("magician");
    const magician = arena.interact(24, 30);
    arena.setClass("warrior");
    const reserve = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    const firstTarget = arena.interact(26, 30);
    const secondTarget = arena.interact(26, 31);
    return [magician, reserve, firstTarget, secondTarget];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.getByTestId("group-command-freeAction").click();
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "battle-command");
  await dialogue.click();
  if (await dialogue.getAttribute("data-source-record") === "battle-command") {
    await dialogue.click();
  }

  await page.waitForFunction(() => {
    const current = window.__ANGEL2_ARENA__?.getState().battle as
      | ArenaBattleDebugState
      | undefined;
    return current?.specialActionPresentation !== undefined
      || current?.lastSpecialAction?.actorId === "arena-1-0";
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-allied-magician-free-action-technique.png`,
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2_ARENA__?.getState().battle as
      | ArenaBattleDebugState
      | undefined;
    return current?.lastSpecialAction?.actorId === "arena-1-0";
  });
  const state = await arenaBattleState(page);
  expect(["fire-1", "lightning-1", "ice-1"]).toContain(state?.lastSpecialAction?.actionId);
  expect(pageErrors).toEqual([]);
});

test("ordinary melee status applies directly and appears in the unit HUD without a technique effect", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("evil-sword-warrior");
    arena.setLevel(1);
    const attacker = arena.interact(20, 30);
    arena.setClass("soldier");
    const reserve = arena.interact(20, 32);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const defender = arena.interact(21, 30);
    return [attacker, reserve, defender];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const identity = page.locator(".hud-identity-name");
  await expect(identity).toHaveText("邪劍戰士／邪劍戰士");
  await expect(page.getByTestId("unit-control-summary")).toHaveCount(0);
  const identityMetrics = await identity.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(identityMetrics.scrollWidth).toBeLessThanOrEqual(identityMetrics.clientWidth);

  await clickArenaWorldCell(page, 20, 30);
  await expect(page.getByTestId("unit-control-summary")).toHaveText("玩家・可行動");
  await expect(page.getByTestId("status-strip")).toContainText("玩家・可行動");
  await page.getByTestId("unit-command-attack").click();
  await clickArenaWorldCell(page, 21, 30);

  await page.waitForFunction(() => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    return current?.lastCombat?.attackerId === "arena-1-0"
      && current.combatPresentation === undefined
      && current.specialActionPresentation === undefined;
  });
  const after = await arenaBattleState(page);
  expect(after?.lastCombat).toMatchObject({
    attackerId: "arena-1-0",
    defenderId: "arena-2-0",
    defenderDied: false,
  });
  expect(after?.units.find(({ id }) => id === "arena-2-0")?.statuses.confusion).toBe(3);
  expect(after?.specialActionPresentationTrace).toEqual([]);
  await expect(page.getByTestId("battle-canvas")).not.toHaveAttribute("data-map-combat-phase", "statusEffect");

  await clickArenaWorldCell(page, 21, 30);
  const confusionIcon = page.getByTestId("status-icon-confusion");
  await expect(confusionIcon).toHaveAttribute("data-remaining-rounds", "3");
  await expect(confusionIcon).toHaveAttribute("aria-label", "混亂，剩餘 3 回合");
  await expect(confusionIcon.locator("img")).toHaveAttribute(
    "src",
    "/assets/original/status-icons/03.png",
  );
  await expect(page.getByTestId("unit-status-list")).toHaveAttribute("aria-label", "目前狀態");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-ordinary-confusion-status-icon.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("great dragon knight counter guard keeps its wide shield centered", async ({ page }) => {
  await page.goto("/arena.html?test=1&slowFull");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("great-dragon-knight");
    arena.setLevel(1);
    const attacker = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    arena.setLevel(1);
    const defender = arena.interact(21, 30);
    return [attacker, defender];
  });
  expect(placed).toEqual([true, true]);

  await page.getByTestId("arena-start").click();
  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-attack").click();
  await clickArenaWorldCell(page, 21, 30);
  await page.waitForFunction(() =>
    window.__ANGEL2_ARENA__?.getState().battle?.combatPresentation?.phase === "fullCounterImpact");

  const victim = page.getByTestId("full-victim-sprite");
  await expect(victim).toBeVisible();
  await expect(victim).toHaveAttribute("data-side", "left");
  await expect(victim).toHaveAttribute("data-frame", "3");
  await expect(victim).toHaveAttribute("data-reaction", "guard");
  await expect(victim).toHaveAttribute("data-x", "146");
  const particles = page.locator(".full-combat-particles img:not([hidden])");
  await expect(particles).toHaveCount(3);
  const particleXs = await particles.evaluateAll((elements) => elements.map((element) => {
    const match = element.getAttribute("style")?.match(/translate\((-?\d+)px/u);
    return Number(match?.[1]);
  }));
  expect(particleXs[0]).toBeGreaterThanOrEqual(245);
  expect(particleXs[0]).toBeLessThanOrEqual(269);
  expect(particleXs[1] - particleXs[0]).toBe(24);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-great-dragon-counter-guard.png`,
  });
});

test("arena setup remains usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/arena.html?test=1");
  await expect(page.getByTestId("arena-start")).toBeVisible();
  await expect(page.getByTestId("arena-setup-canvas-root")).toBeVisible();
  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await captureVisualAudit(page, { path: `${ARTIFACT_DIR}/arena-setup-narrow.png`, fullPage: true });
});
