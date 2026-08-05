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
    await expect(page.locator('[data-readout="phase"]')).toContainText("逐格錯相命中");
    expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
    if (contract.code === "4L") {
      await page.screenshot({
        path: "artifacts/playwright/technique-lab-lightning-4-wave.png",
        fullPage: true,
      });
    }
    await seek(page, contract.cleanupAt);
    await expect(canvas).toHaveAttribute("data-technique-phase", "cleanup");
    await expect(page.locator('[data-readout="phase"]')).toContainText("共同收尾");
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

  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("3L"));
  for (const [time, anchor] of [[0, "0,0"], [300, "0,-1"], [600, "0,-2"], [900, "0,-3"], [1200, "0,-4"]] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-map-combat-anchor-offset", anchor);
  }
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("4L"));
  for (const [time, anchor] of [[0, "0,-8"], [60, "0,-7"], [120, "0,-6"], [480, "0,0"], [540, "0,1"]] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-map-combat-anchor-offset", anchor);
  }

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

test("lightning hit waves advance one range threshold after every native draw", async ({ page }) => {
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("2L"));

  for (const [time, visibleCells] of [[1750, 1], [1770, 2], [1790, 3]] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "wave");
    await expect(canvas).toHaveAttribute("data-effect-tile-count", String(visibleCells));
  }

  await seek(page, 1770);
  await page.screenshot({
    path: "artifacts/playwright/technique-lab-lightning-2-staggered-hit.png",
    fullPage: true,
  });
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
    if (contract.code === "1C") {
      await expect(canvas).toHaveAttribute("data-frozen-unit-count", "1");
      await expect(page.locator('[data-readout="result"]')).toContainText("跳過下一次本陣營行動");
      await page.screenshot({
        path: "artifacts/playwright/technique-lab-ice-frozen-result.png",
        fullPage: true,
      });
      await page.getByTestId("technique-lab-next-side-phase").click();
      await expect(canvas).toHaveAttribute("data-frozen-unit-count", "0");
      await expect(page.locator('[data-readout="result"]')).toContainText("冰封解除");
    } else {
      await expect(canvas).toHaveAttribute("data-frozen-unit-count", "0");
    }
  }
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("2L"))).toBe(true);
  await seek(page, 700);
  await expect(canvas).toHaveAttribute("data-technique-phase", "main");
  expect((await labState(page))?.playback.durationMs).toBe(2570);
});

test("initial recovery keeps all 17 native stages while marking only affected same-side cells", async ({ page }) => {
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1I"))).toBe(true);
  await page.getByTestId("technique-lab-target-tool").click();
  await canvas.click({ position: { x: 260, y: 242 } });
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "1I",
    durationMs: 2550,
    terminalHoldMs: 150,
  });
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-technique-phase", "recovery");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "1");
  await page.screenshot({
    path: "artifacts/playwright/technique-lab-recovery-1.png",
    fullPage: true,
  });
  await seek(page, 2549);
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await seek(page, 2550);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
});

test("all four ice tiers expand one complete six-frame ring at a time", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const action = page.getByTestId("technique-lab-action");
  await expect(canvas).toBeVisible();
  const contracts = [
    { code: "1C", duration: 1200, distances: 2 },
    { code: "2C", duration: 1800, distances: 3 },
    { code: "3C", duration: 2400, distances: 4 },
    { code: "4C", duration: 3000, distances: 5 },
  ] as const;
  for (const contract of contracts) {
    await expect(action.locator(`option[value="${contract.code}"]`)).not.toHaveAttribute("disabled", "");
    await action.selectOption(contract.code);
    await expect(action).toHaveValue(contract.code);
    expect((await labState(page))?.session.actionCode).toBe(contract.code);
    expect((await labState(page))?.playback.durationMs).toBe(contract.duration);
    await page.getByTestId("technique-lab-restart").click();
    await expect.poll(async () => (await labState(page))?.playback.timeMs ?? 0).toBeGreaterThan(0);
    await page.getByTestId("technique-lab-pause").click();
    for (let distance = 1; distance <= contract.distances; distance += 1) {
      await seek(page, (distance - 1) * 600);
      await expect(canvas).toHaveAttribute("data-technique-phase", "ice");
      await expect(canvas).toHaveAttribute("data-ice-distance-from-center", String(distance));
      await expect(canvas).toHaveAttribute(
        "data-effect-tile-count",
        String(distance * 4),
      );
      if (contract.code === "1C") {
        await page.screenshot({
          path: `artifacts/playwright/technique-lab-ice-1-ring-${distance}.png`,
          fullPage: true,
        });
      } else if (contract.code === "4C" && distance === contract.distances) {
        await page.screenshot({
          path: "artifacts/playwright/technique-lab-ice-4-outer-ring.png",
          fullPage: true,
        });
      }
    }
    await seek(page, contract.duration);
    await expect(canvas).toHaveAttribute("data-technique-phase", "none");
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
    expect(Number(await canvas.getAttribute("data-frozen-unit-count"))).toBeGreaterThan(0);
  }
  expect(pageErrors).toEqual([]);
});

test("dispel preserves its original timeline and removes a frozen ally", async ({ page }) => {
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("technique laboratory canvas has no bounds");
  const clickCell = async (worldX: number, worldY: number) => {
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };

  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"));
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", /lab-2/u);

  await page.getByTestId("technique-lab-side").selectOption("2");
  await page.getByTestId("technique-lab-class").selectOption("magic-priest");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(22, 19);
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(22, 19);
  await page.getByTestId("technique-lab-action").selectOption("TR");
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 1000);

  expect((await labState(page))?.playback.durationMs).toBe(2500);
  expect((await labState(page))?.playback.terminalHoldMs).toBe(50);
  await expect(canvas).toHaveAttribute("data-technique-phase", "dispel");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", /lab-2/u);
  expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
  await page.screenshot({
    path: "artifacts/playwright/technique-lab-dispel-animation.png",
    fullPage: true,
  });

  await seek(page, 2499);
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 50 ms");
  await seek(page, 2500);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-frozen-unit-count", "0");
  await expect(page.locator('[data-readout="result"]')).toContainText("冰封與異常狀態");
  await page.screenshot({
    path: "artifacts/playwright/technique-lab-dispel-result.png",
    fullPage: true,
  });
});

test("map tools place either side and unavailable techniques stay disabled", async ({ page }) => {
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="4F"]')).toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="2L"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="4C"]')).not.toHaveAttribute("disabled", "");

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

  await action.selectOption("4C");
  await expect(page.getByTestId("technique-lab-target-tool")).toBeDisabled();
  await expect(page.getByTestId("technique-lab-hint")).toContainText("鎖定施法者格為中心");
  expect((await labState(page))?.session.target).toEqual({ x: 27, y: 21 });

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
