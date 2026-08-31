import { expect, test, type Page } from "@playwright/test";
import {
  ARTIFACT_DIR,
  arenaBattleState,
  clickArenaWorldCell,
  type ArenaBattleDebugState,
} from "./arena-test-support";
import { nativeExperienceLineText } from "../../src/game/content/ai-technique-dialogue";
import { captureVisualAudit } from "./visual-audit";

/**
 * DS:84BB `18h` — `得經驗值00000 點`. Module 29 opens it from exactly three
 * sites, all of them after a kill: `0000:924F` (the opening blow killed),
 * `0000:91C1` (the counter killed) and `0000:7678` (the player's own 技術
 * commit, once the death scan removed at least one unit). `0000:C981` lets
 * selector `18h` past the PIT gate every other contextual line has to pass, so
 * it is never a coin flip, and none of the three sites sits behind the ＡＩ對話
 * switch.
 *
 * `REMAKE-133` keeps those original facts in the evidence layer but repairs
 * the remake feedback: any special-action kill that actually increases its
 * actor's experience reports the complete committed delta.
 */

interface CombatDebugState extends ArenaBattleDebugState {
  battlePresentation: "map" | "full";
  lastCombat?: ArenaBattleDebugState["lastCombat"] & {
    attackerDied: boolean;
    experienceGained: number;
    counterExperienceGained: number;
  };
}

const combatState = async (page: Page): Promise<CombatDebugState> =>
  (await arenaBattleState(page)) as unknown as CombatDebugState;

const TARGET = { x: 21, y: 30 } as const;
const ATTACKERS = [{ x: 20, y: 30 }, { x: 21, y: 29 }, { x: 21, y: 31 }] as const;

/**
 * Three level-3 great axe warriors around one level-1 soldier: the first blow
 * leaves it standing, so a single round produces both an ordinary hit and an
 * ordinary kill without waiting for an enemy phase. `0G` also suppresses the
 * counter, so the only award in play is the attacker's own.
 */
async function startMeleeKillArena(page: Page): Promise<void> {
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(({ attackers, target }) => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("great-axe-warrior");
    arena.setLevel(3);
    const allies = attackers.map(({ x, y }) => arena.interact(x, y));
    arena.setClass("soldier");
    arena.setLevel(1);
    arena.setSide(2);
    return [...allies, arena.interact(target.x, target.y)];
  }, { attackers: ATTACKERS, target: TARGET });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
}

async function setBattlePresentation(page: Page, desired: "map" | "full"): Promise<void> {
  if ((await combatState(page)).battlePresentation !== desired) {
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("system-menu")).toBeVisible();
    await page.getByTestId("system-command-settings").click();
    await expect(page.getByTestId("settings-menu")).toBeVisible();
    await page.getByTestId("presentation-button").click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("system-menu")).toBeHidden();
  }
  expect((await combatState(page)).battlePresentation).toBe(desired);
}

/** Every presentation has returned and the actor's action flag is spent. */
async function waitForActionSettled(page: Page, actorId: string): Promise<void> {
  await page.waitForFunction((id) => {
    const current = (window.__ANGEL2_ARENA__?.getState() as {
      battle?: ArenaBattleDebugState;
    }).battle;
    if (!current) return false;
    if (current.combatPresentation || current.specialActionPresentation) return false;
    const actor = current.units.find((unit) => unit.id === id);
    return actor === undefined || actor.acted;
  }, actorId, { timeout: 40_000 });
  await expect(page.getByTestId("dialogue-layer")).toBeHidden({ timeout: 20_000 });
}

async function attackFrom(page: Page, origin: { x: number; y: number }): Promise<void> {
  await clickArenaWorldCell(page, origin.x, origin.y);
  const attack = page.getByTestId("unit-command-attack");
  await expect(attack).toBeVisible();
  await attack.click();
  await clickArenaWorldCell(page, TARGET.x, TARGET.y);
}

test("an ordinary kill opens the native experience window on the map route", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startMeleeKillArena(page);
  await setBattlePresentation(page, "map");

  const dialogue = page.getByTestId("dialogue-layer");

  // A hit that leaves the defender standing pays experience silently:
  // `0000:91F1` only reaches `0000:924F` down the kill branch at `0000:921C`.
  await attackFrom(page, ATTACKERS[0]);
  await waitForActionSettled(page, "arena-1-0");
  const survived = await combatState(page);
  expect(survived.lastCombat?.defenderDied).toBe(false);
  expect(survived.lastCombat?.experienceGained).toBeGreaterThan(0);

  await attackFrom(page, ATTACKERS[1]);
  await expect(dialogue).toHaveAttribute("data-source-record", "experience-gain", {
    timeout: 40_000,
  });
  await expect(dialogue).toHaveAttribute("data-source-address", "DS:8654");
  await expect(dialogue).toHaveAttribute("data-source-wait", "24");
  // side 1 speaks from the upper window, exactly like every other DS:84BB line.
  await expect(dialogue).toHaveAttribute("data-active-slot", "upper");

  const killed = await combatState(page);
  expect(killed.lastCombat).toMatchObject({ defenderId: "arena-2-0", defenderDied: true });
  const awarded = killed.lastCombat?.experienceGained ?? 0;
  expect(awarded).toBeGreaterThan(0);
  await expect(dialogue).toContainText(nativeExperienceLineText(awarded));
  // `0000:91C5` pays the kill before `0000:96C2` removes the body, so the window
  // is up on the primary-damage frame rather than after MAGIC/12.
  expect(killed.combatPresentation?.phase).toBe("primaryDamage");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-experience-gain-map-route.png`,
  });

  await waitForActionSettled(page, "arena-1-1");
  expect(pageErrors).toEqual([]);
});

test("the full-screen route reports the same kill after MAGIC/12", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startMeleeKillArena(page);
  await setBattlePresentation(page, "full");

  const dialogue = page.getByTestId("dialogue-layer");
  await attackFrom(page, ATTACKERS[0]);
  await waitForActionSettled(page, "arena-1-0");
  expect((await combatState(page)).lastCombat?.defenderDied).toBe(false);

  await attackFrom(page, ATTACKERS[1]);
  await expect(dialogue).toHaveAttribute("data-source-record", "experience-gain", {
    timeout: 60_000,
  });
  const killed = await combatState(page);
  expect(killed.lastCombat).toMatchObject({ defenderDied: true });
  await expect(dialogue)
    .toContainText(nativeExperienceLineText(killed.lastCombat?.experienceGained ?? 0));
  // `0000:9296` runs the death scan first and pays afterwards, so on this route
  // the board has already played the removal when the window opens.
  expect(killed.combatPresentation?.phase).toBe("defenderDeath");

  await waitForActionSettled(page, "arena-1-1");
  expect(pageErrors).toEqual([]);
});

test("a shot kill reports the shooter's complete awarded experience", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("crossbow");
    arena.setLevel(3);
    const shooters = [
      arena.interact(20, 29),
      arena.interact(20, 30),
      arena.interact(20, 31),
    ];
    arena.setClass("soldier");
    arena.setLevel(1);
    arena.setSide(2);
    const target = arena.interact(23, 30);
    // Keep one distant enemy alive so the experience page is not immediately
    // followed by the arena-complete feedback during visual capture.
    const survivor = arena.interact(27, 30);
    return [...shooters, target, survivor];
  });
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const dialogue = page.getByTestId("dialogue-layer");
  const shooters = [
    { id: "arena-1-0", x: 20, y: 29 },
    { id: "arena-1-1", x: 20, y: 30 },
    { id: "arena-1-2", x: 20, y: 31 },
  ];
  let killed = false;
  for (const shooter of shooters) {
    await clickArenaWorldCell(page, shooter.x, shooter.y);
    const shoot = page.getByTestId("unit-command-shoot");
    await expect(shoot).toBeVisible();
    await shoot.click();
    await clickArenaWorldCell(page, 23, 30);
    await page.waitForFunction((actorId) => {
      const current = (window.__ANGEL2_ARENA__?.getState() as {
        battle?: ArenaBattleDebugState;
      }).battle;
      return current?.lastSpecialAction?.actorId === actorId
        && current.specialActionPresentation === undefined;
    }, shooter.id);
    const state = await combatState(page);
    if (!state.units.some(({ id }) => id === "arena-2-0")) {
      killed = true;
      await expect(dialogue).toHaveAttribute("data-source-record", "experience-gain");
      await expect(dialogue).toHaveAttribute("data-active-slot", "upper");
      const awarded = state.lastSpecialAction?.experienceGained ?? 0;
      expect(awarded).toBeGreaterThan(0);
      await expect(dialogue).toContainText(nativeExperienceLineText(awarded));
      await waitForActionSettled(page, shooter.id);
      break;
    }
    await expect(dialogue).toBeHidden();
    await waitForActionSettled(page, shooter.id);
  }
  // 70..89 a volley against a 160-life soldier: two or three shots finish it.
  expect(killed).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("an automatic shot kill reports the acting side's actual experience", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("soldier");
    arena.setLevel(1);
    const target = arena.interact(23, 30);
    arena.setSide(2);
    arena.setClass("crossbow");
    arena.setLevel(3);
    return [
      target,
      arena.interact(20, 29),
      arena.interact(20, 30),
      arena.interact(20, 31),
    ];
  });
  expect(placed).toEqual([true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickArenaWorldCell(page, 23, 30);
  await page.getByTestId("unit-command-rest").click();

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "experience-gain", {
    timeout: 60_000,
  });
  await expect(dialogue).toHaveAttribute("data-active-slot", "lower");
  const killed = await combatState(page);
  expect(killed.lastSpecialAction?.actionId).toBe("crossbow-shot");
  expect(killed.lastSpecialAction?.actorId).toMatch(/^arena-2-/);
  expect(killed.units.some(({ id }) => id === "arena-1-0")).toBe(false);
  const awarded = killed.lastSpecialAction?.experienceGained ?? 0;
  expect(awarded).toBeGreaterThan(0);
  await expect(dialogue).toContainText(nativeExperienceLineText(awarded));
  expect(pageErrors).toEqual([]);
});

test("a 技術 kill reports the complete awarded experience", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("great-axe-warrior");
    arena.setLevel(3);
    const axe = arena.interact(20, 30);
    arena.setClass("evil-mage");
    arena.setLevel(3);
    const mage = arena.interact(20, 29);
    arena.setClass("soldier");
    arena.setLevel(1);
    arena.setSide(2);
    return [axe, mage, arena.interact(21, 30)];
  });
  expect(placed).toEqual([true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  // Soften the soldier so 究級炎暴's 44%-of-max-life finishes it.
  await attackFrom(page, { x: 20, y: 30 });
  await waitForActionSettled(page, "arena-1-0");
  expect((await combatState(page)).lastCombat?.defenderDied).toBe(false);

  await clickArenaWorldCell(page, 20, 29);
  await page.getByTestId("unit-command-technique").click();
  const fire = page.getByTestId("technique-fire-4");
  await expect(fire).toContainText("究級炎暴");
  await fire.click();
  await clickArenaWorldCell(page, 21, 30);

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "experience-gain", {
    timeout: 40_000,
  });
  await expect(dialogue).toHaveAttribute("data-active-slot", "upper");
  const killed = await combatState(page);
  expect(killed.lastSpecialAction?.actionId).toBe("fire-4");
  const awarded = killed.lastSpecialAction?.experienceGained ?? 0;
  expect(awarded).toBeGreaterThan(10);
  await expect(dialogue).toContainText(nativeExperienceLineText(awarded));
  // The window opens after the removals, not before them.
  expect(killed.units.some(({ id }) => id === "arena-2-0")).toBe(false);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-experience-gain-technique.png`,
  });

  await waitForActionSettled(page, "arena-1-1");
  expect(pageErrors).toEqual([]);
});

test("a 龍踏 area kill reports its fixed experience plus the kill reward", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/arena.html?test=1");
  await page.getByTestId("arena-clear").click();
  const placed = await page.evaluate(() => {
    const arena = window.__ANGEL2_ARENA__;
    if (!arena) return [];
    arena.setSide(1);
    arena.setClass("evil-mage");
    arena.setLevel(3);
    const ultimate = arena.interact(20, 29);
    arena.setLevel(2);
    const advanced = arena.interact(20, 31);
    arena.setClass("magician");
    arena.setLevel(1);
    const initial = arena.interact(21, 28);
    arena.setClass("great-dragon-knight");
    const dragon = arena.interact(20, 30);
    arena.setSide(2);
    arena.setClass("soldier");
    const target = arena.interact(23, 30);
    return [ultimate, advanced, initial, dragon, target];
  });
  expect(placed).toEqual([true, true, true, true, true]);
  await page.getByTestId("arena-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const cast = async (
    actorId: string,
    origin: { x: number; y: number },
    actionId: "fire-4" | "fire-3" | "fire-1",
  ): Promise<void> => {
    await clickArenaWorldCell(page, origin.x, origin.y);
    await page.getByTestId("unit-command-technique").click();
    await page.getByTestId(`technique-${actionId}`).click();
    await clickArenaWorldCell(page, 23, 30);
    await waitForActionSettled(page, actorId);
  };

  // 160 - floor(44%) - floor(32%) - floor(18%) = 11. The arena's fixed
  // fourth PRNG draw makes 龍踏 deal 17, so the final area action is lethal.
  await cast("arena-1-0", { x: 20, y: 29 }, "fire-4");
  await cast("arena-1-1", { x: 20, y: 31 }, "fire-3");
  await cast("arena-1-2", { x: 21, y: 28 }, "fire-1");
  expect((await combatState(page)).units.find(({ id }) => id === "arena-2-0")?.life).toBe(11);

  await clickArenaWorldCell(page, 20, 30);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-stomp-1").click();
  await clickArenaWorldCell(page, 23, 30);

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "experience-gain", {
    timeout: 40_000,
  });
  const killed = await combatState(page);
  expect(killed.lastSpecialAction).toMatchObject({
    actionId: "stomp-1",
    actorId: "arena-1-3",
    experienceGained: 15,
  });
  expect(killed.units.some(({ id }) => id === "arena-2-0")).toBe(false);
  await expect(dialogue).toContainText(nativeExperienceLineText(15));
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/arena-experience-gain-stomp.png`,
  });

  await waitForActionSettled(page, "arena-1-3");
  expect(pageErrors).toEqual([]);
});
