import { expect, test, type Locator, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface PromotionLabBattleState {
  cameraOrigin: { x: number; y: number };
  phase: string;
  promotionUnitIds: string[];
  promotionTargets: Array<{ id: string; optionIndex: number }>;
  lastCombat?: { counterExperienceGained: number };
  units: Array<{
    id: string;
    side: number;
    classId: string;
    className: string;
    name: string;
    portrait: number;
    experience: number;
    x: number;
    y: number;
  }>;
}

const promotionLabState = (page: Page) => page.evaluate(() =>
  window.__ANGEL2_PROMOTION_LAB__?.getState() as {
    mode: string;
    placements?: Array<{ classId: string; side: number; experience: number }>;
    battle?: PromotionLabBattleState;
  });

async function clickWorldCell(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.getByTestId("battle-canvas");
  const [state, box, dimensions] = await Promise.all([
    promotionLabState(page),
    canvas.boundingBox(),
    canvas.evaluate((element) => ({ width: element.width, height: element.height })),
  ]);
  if (!state.battle || !box) throw new Error("promotion lab battle canvas is not ready");
  const logicalX = 40 + (x - state.battle.cameraOrigin.x + .5) * 40;
  const logicalY = 23 + (y - state.battle.cameraOrigin.y + .5) * 44;
  await canvas.click({
    position: {
      x: logicalX * box.width / dimensions.width,
      y: logicalY * box.height / dimensions.height,
    },
  });
}

async function finishPromotionDialogue(page: Page): Promise<void> {
  const layer = page.getByTestId("dialogue-layer");
  while (await layer.isVisible() && await layer.getAttribute("data-source-record") === "promotion") {
    const before = await layer.getAttribute("data-source-wait");
    await page.getByTestId("dialogue-layer").click();
    if (
      await layer.isVisible()
      && await layer.getAttribute("data-source-record") === "promotion"
      && await layer.getAttribute("data-source-wait") === before
    ) {
      await page.getByTestId("dialogue-layer").click();
    }
    await expect.poll(async () =>
      !await layer.isVisible() || await layer.getAttribute("data-source-wait") !== before,
    ).toBe(true);
  }
  await expect(layer).toBeHidden();
  await expect(page.getByTestId("promotion-layer")).toBeVisible();
}

async function dialogueTextInset(text: Locator) {
  return text.evaluate((node) => {
    const copy = node.parentElement;
    if (!copy) throw new Error("missing dialogue-copy parent");
    const bounds = node.getBoundingClientRect();
    const copyBounds = copy.getBoundingClientRect();
    return { x: bounds.left - copyBounds.left, y: bounds.top - copyBounds.top };
  });
}

test("promotion lab exposes all twelve threshold pairs and the formal choice UI", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/promotion-lab.html?test=1");

  await expect(page.getByRole("heading", { name: "轉職觸發實驗室" })).toBeVisible();
  await expect(page.getByTestId("promotion-lab-pair")).toHaveCount(12);
  await expect(page.getByText("12 SOURCES · 24 UNITS")).toBeVisible();
  await expect(page.getByText(/敵我均為 \+100 經驗進入第 4 成長行/u)).toBeVisible();
  await expect(page.getByText(/鋼甲戰士雖然雙方短碼分別為 1C／0C/u)).toBeVisible();
  const setup = await promotionLabState(page);
  expect(setup.mode).toBe("setup");
  expect(setup.placements).toHaveLength(24);
  expect(setup.placements?.find(({ classId, side }) => classId === "magician" && side === 1))
    .toMatchObject({ experience: 799 });
  await captureVisualAudit(page, {
    path: `${ARTIFACT_DIR}/promotion-lab-setup.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureVisualAudit(page, {
    path: `${ARTIFACT_DIR}/promotion-lab-setup-narrow.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByTestId("promotion-lab-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("promotion-lab-progress"))
    .toHaveText("我方已轉職 0/12 · 敵方等級 4+ 0/12");
  const before = await promotionLabState(page);
  expect(before.battle?.units).toHaveLength(24);
  expect(before.battle?.units.find(({ id }) => id === "promotion-1-0"))
    .toMatchObject({ classId: "soldier", experience: 299, x: 17, y: 14 });

  await clickWorldCell(page, 17, 14);
  await page.getByTestId("unit-command-attack").click();
  await clickWorldCell(page, 18, 14);
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute(
    "data-source-record",
    "promotion",
  );
  await expect(page.getByTestId("dialogue-layer")).toContainText("我的經驗值已達到轉職的目標");
  await expect(page.getByTestId("dialogue-portrait-name")).toHaveText("妮雅");
  await expect(page.locator("#dialogue-speaker-upper")).toHaveText("妮雅");
  expect(await dialogueTextInset(page.locator("#dialogue-text"))).toEqual({ x: 27, y: 20 });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/promotion-lab-nia-dialogue.png`,
  });
  await finishPromotionDialogue(page);

  const promotionLayer = page.getByTestId("promotion-layer");
  await expect(promotionLayer.locator("h2")).toHaveText("妮雅・士兵轉職");
  await expect(promotionLayer.locator(".promotion-current")).toContainText("目前：等級 4");
  await expect(promotionLayer.locator(".promotion-option")).toHaveCount(4);
  await expect(page.getByTestId("promotion-target-cavalry")).toHaveAccessibleName(
    /騎兵.*等級 1.*攻擊 55/u,
  );
  for (const classId of ["cavalry", "warrior", "archer", "sister"]) {
    await expect(page.getByTestId(`promotion-image-${classId}`)).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(promotionLayer).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/promotion-lab-choice.png`,
  });

  await page.getByTestId("promotion-target-cavalry").click();
  await expect(promotionLayer).toBeHidden();
  const after = await promotionLabState(page);
  expect(after.battle?.units.find(({ id }) => id === "promotion-1-0"))
    .toMatchObject({ classId: "cavalry", experience: 0 });
  const counteringEnemy = after.battle?.units.find(({ id }) => id === "promotion-2-0");
  expect(after.battle?.lastCombat?.counterExperienceGained).toBeGreaterThan(0);
  expect(counteringEnemy).toMatchObject({ classId: "soldier" });
  expect(counteringEnemy?.experience).toBe(
    299 + after.battle!.lastCombat!.counterExperienceGained,
  );
  await expect(page.getByTestId("promotion-lab-progress"))
    .toHaveText("我方已轉職 1/12 · 敵方等級 4+ 1/12");
  expect(pageErrors).toEqual([]);
});

test("generic land knight promotes with its beast figure and canonical profession identity", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/promotion-lab.html?test=1");
  await page.getByTestId("promotion-lab-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickWorldCell(page, 17, 16);
  await page.getByTestId("unit-command-attack").click();
  await clickWorldCell(page, 18, 16);

  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute(
    "data-source-record",
    "promotion",
  );
  await expect(page.getByTestId("dialogue-portrait-name")).toHaveText("陸戰騎士");
  await expect(page.locator("#dialogue-speaker-lower")).toHaveText("陸戰騎士");
  expect(await dialogueTextInset(page.locator("#dialogue-text"))).toEqual({ x: 43, y: 20 });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/promotion-lab-land-knight-dialogue.png`,
  });
  await finishPromotionDialogue(page);

  const promotionLayer = page.getByTestId("promotion-layer");
  await expect(promotionLayer.locator("h2")).toHaveText("陸戰騎士轉職");
  await page.getByTestId("promotion-target-beast-knight").click();
  await expect(promotionLayer).toBeHidden();

  const state = await promotionLabState(page);
  expect(state.battle?.units.find(({ id }) => id === "promotion-1-2")).toMatchObject({
    classId: "beast-knight",
    className: "獸騎士",
    name: "獸騎士",
  });
  await expect(page.getByTestId("hud-identity")).toHaveText("獸騎士／獸騎士");
  await expect(page.getByTestId("unit-portrait-composite")).toHaveAttribute(
    "data-portrait-record",
    String(state.battle?.units.find(({ id }) => id === "promotion-1-2")?.portrait),
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/promotion-lab-beast-knight.png`,
  });
  expect(pageErrors).toEqual([]);
});

test("advanced source options use published class figures", async ({ page }) => {
  await page.goto("/promotion-lab.html?test=1");
  await page.getByTestId("promotion-lab-start").click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await clickWorldCell(page, 17, 15);
  await page.getByTestId("unit-command-attack").click();
  await clickWorldCell(page, 18, 15);
  await finishPromotionDialogue(page);

  const state = await promotionLabState(page);
  expect(state.battle?.promotionUnitIds).toEqual(["promotion-1-1"]);
  expect(state.battle?.promotionTargets.map(({ id }) => id)).toEqual([
    "evil-mage",
    "magic-master",
    "wizard",
  ]);
  for (const classId of ["evil-mage", "magic-master", "wizard"]) {
    const image = page.getByTestId(`promotion-image-${classId}`);
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", new RegExp(`ally-${classId}\\.png$`));
  }
});
