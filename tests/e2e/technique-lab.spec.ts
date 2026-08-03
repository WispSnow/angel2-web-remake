import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const labState = (page: Page) => page.evaluate(() =>
  window.__ANGEL2_TECHNIQUE_LAB__?.getState());

const seek = async (page: Page, timeMs: number) => {
  await page.evaluate((time) => window.__ANGEL2_TECHNIQUE_LAB__?.seek(time), timeMs);
};

test.beforeAll(() => mkdirSync("artifacts/playwright", { recursive: true }));

test("all four native lightning scripts expose their main, wave and cleanup phases", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await expect(page.getByRole("heading", { name: "地圖技能動畫實驗室" })).toBeVisible();
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();

  const contracts = [
    { code: "1L", duration: 4140, waveAt: 3200, cleanupAt: 3640, affected: 2 },
    { code: "2L", duration: 2570, waveAt: 1750, cleanupAt: 2070, affected: 3 },
    { code: "3L", duration: 3480, waveAt: 2700, cleanupAt: 2980, affected: 3 },
    { code: "4L", duration: 3040, waveAt: 1940, cleanupAt: 2540, affected: 3 },
  ] as const;
  for (const contract of contracts) {
    expect(await page.evaluate((code) =>
      window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode(code), contract.code)).toBe(true);
    expect((await labState(page))?.playback.durationMs).toBe(contract.duration);
    await seek(page, 0);
    await expect(canvas).toHaveAttribute("data-technique-phase", "main");
    await seek(page, contract.waveAt);
    await expect(canvas).toHaveAttribute("data-technique-phase", "wave");
    expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
    if (contract.code === "4L") {
      await page.screenshot({
        path: "artifacts/playwright/technique-lab-lightning-4-wave.png",
        fullPage: true,
      });
    }
    await seek(page, contract.cleanupAt);
    await expect(canvas).toHaveAttribute("data-technique-phase", "cleanup");
    await expect(canvas).toHaveAttribute("data-effect-tile-count", String(contract.affected));
    await expect(canvas).toHaveAttribute("data-lightning-cleanup-scope", "affected");
    if (contract.code === "1L") {
      await page.screenshot({
        path: "artifacts/playwright/technique-lab-lightning-range-cleanup.png",
        fullPage: true,
      });
    }
    if (contract.code === "4L") {
      await page.screenshot({
        path: "artifacts/playwright/technique-lab-lightning-4-cleanup.png",
        fullPage: true,
      });
    }
    await seek(page, contract.duration - 1);
    expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
    await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 100 ms");
    expect((await labState(page))?.playback.terminalHoldMs).toBe(100);
    if (contract.code === "4L") {
      await page.screenshot({
        path: "artifacts/playwright/technique-lab-lightning-final-hold.png",
        fullPage: true,
      });
    }
    await seek(page, contract.duration);
    await expect(canvas).toHaveAttribute("data-technique-phase", "none");
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
    await expect(page.locator('[data-readout="phase"]')).toContainText("無殘留");
    if (contract.code === "4L") {
      await page.screenshot({
        path: "artifacts/playwright/technique-lab-lightning-complete.png",
        fullPage: true,
      });
    }
  }

  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1L"));
  await page.getByTestId("technique-lab-original-cleanup").check();
  await seek(page, 3640);
  await expect(canvas).toHaveAttribute("data-lightning-cleanup-scope", "original-all-enemies");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "3");
  await expect(page.locator('[data-readout="phase"]')).toContainText("非命中");
  await page.screenshot({
    path: "artifacts/playwright/technique-lab-lightning-original-cleanup.png",
    fullPage: true,
  });

  expect(pageErrors).toEqual([]);
});

test("intermediate, advanced and ultimate lightning preserve distinct native visuals", async ({ page }) => {
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();

  const captures = [
    { code: "2L", time: 700, name: "technique-lab-lightning-2-main.png" },
    { code: "3L", time: 1700, name: "technique-lab-lightning-3-main.png" },
    { code: "4L", time: 1200, name: "technique-lab-lightning-4-main.png" },
  ] as const;
  for (const capture of captures) {
    await page.evaluate((code) => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode(code), capture.code);
    await seek(page, capture.time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "main");
    expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
    await page.screenshot({
      path: `artifacts/playwright/${capture.name}`,
      fullPage: true,
    });
  }
});

test("already implemented fire, healing and ice remain available in the same map surface", async ({ page }) => {
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const contracts = [
    { code: "1F", duration: 700, time: 200, phase: "fire", terminalHold: 100 },
    { code: "1H", duration: 2750, time: 200, phase: "heal-primary", terminalHold: 150 },
    { code: "1C", duration: 1200, time: 100, phase: "ice", terminalHold: 100 },
  ] as const;
  for (const contract of contracts) {
    expect(await page.evaluate((code) =>
      window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode(code), contract.code)).toBe(true);
    await seek(page, contract.time);
    expect((await labState(page))?.playback.durationMs).toBe(contract.duration);
    await expect(canvas).toHaveAttribute("data-technique-phase", contract.phase);
    expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
    await seek(page, contract.duration - 1);
    expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
    await expect(page.locator('[data-readout="phase"]'))
      .toContainText(`末幀保持 ${contract.terminalHold} ms`);
    expect((await labState(page))?.playback.terminalHoldMs).toBe(contract.terminalHold);
    await seek(page, contract.duration);
    await expect(canvas).toHaveAttribute("data-technique-phase", "none");
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  }
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("2L"))).toBe(true);
  await seek(page, 700);
  await expect(canvas).toHaveAttribute("data-technique-phase", "main");
  expect((await labState(page))?.playback.durationMs).toBe(2570);
});

test("map tools place either side and unavailable techniques stay disabled", async ({ page }) => {
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="4F"]')).toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="2L"]')).not.toHaveAttribute("disabled", "");

  const side = page.getByTestId("technique-lab-side");
  const unitClass = page.getByTestId("technique-lab-class");
  await side.selectOption("1");
  await expect(unitClass.locator('option[value="dragon"]')).toHaveAttribute("disabled", "");
  await unitClass.selectOption("wizard");
  await page.getByRole("button", { name: "放置／替換" }).click();

  const surface = page.locator("#technique-lab-canvas canvas");
  const box = await surface.boundingBox();
  if (!box) throw new Error("technique laboratory canvas has no bounds");
  const clickCell = async (worldX: number, worldY: number) => {
    const localX = (worldX - 15 + .5) * box.width / 16;
    const localY = (worldY - 13 + .5) * box.height / 11;
    await surface.click({ position: { x: localX, y: localY } });
  };
  await clickCell(27, 21);
  expect((await labState(page))?.session.units).toContainEqual(
    expect.objectContaining({ side: 1, classId: "wizard", x: 27, y: 21 }),
  );
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(27, 21);
  expect((await labState(page))?.session.actorId).toMatch(/^lab-/u);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(26, 20);
  expect((await labState(page))?.session.target).toEqual({ x: 26, y: 20 });

  await side.selectOption("2");
  await unitClass.selectOption("dragon");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(28, 21);
  expect((await labState(page))?.session.units).toContainEqual(
    expect.objectContaining({ side: 2, classId: "dragon", x: 28, y: 21 }),
  );
  await page.screenshot({
    path: "artifacts/playwright/technique-lab-placement-tools.png",
    fullPage: true,
  });
});
