import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

const labState = (page: Page) => page.evaluate(() =>
  window.__ANGEL2_TECHNIQUE_LAB__?.getState());

const seek = async (page: Page, timeMs: number) => {
  await page.evaluate((time) => window.__ANGEL2_TECHNIQUE_LAB__?.seek(time), timeMs);
};

test("all four native lightning scripts expose their main, wave and cleanup phases", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await expect(page.getByRole("heading", { name: "地圖技能動畫實驗室" })).toBeVisible();
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-target", "23,18");

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
      await captureVisualAudit(page, {
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
      await captureVisualAudit(page, {
        path: "artifacts/playwright/technique-lab-lightning-range-cleanup.png",
        fullPage: true,
      });
    }
    if (contract.code === "4L") {
      await captureVisualAudit(page, {
        path: "artifacts/playwright/technique-lab-lightning-4-cleanup.png",
        fullPage: true,
      });
    }
    await seek(page, contract.duration - 1);
    expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
    await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 100 ms");
    expect((await labState(page))?.playback.terminalHoldMs).toBe(100);
    if (contract.code === "4L") {
      await captureVisualAudit(page, {
        path: "artifacts/playwright/technique-lab-lightning-final-hold.png",
        fullPage: true,
      });
    }
    await seek(page, contract.duration);
    await expect(canvas).toHaveAttribute("data-technique-phase", "none");
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
    await expect(page.locator('[data-readout="phase"]')).toContainText("無殘留");
    if (contract.code === "4L") {
      await captureVisualAudit(page, {
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
  await captureVisualAudit(page, {
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
    await captureVisualAudit(page, {
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
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-lightning-2-staggered-hit.png",
    fullPage: true,
  });
});

test("initial fire and healing remain available on the shared map surface", async ({ page }) => {
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const contracts = [
    { code: "1F", duration: 700, time: 200, phase: "fire", terminalHold: 100 },
    { code: "1H", duration: 2750, time: 200, phase: "heal-primary", terminalHold: 150 },
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
    await expect(canvas).toHaveAttribute("data-frozen-unit-count", "0");
  }
});

test("intermediate fire composes 21 source tiles into twelve native draws", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="2F"]')).not.toHaveAttribute("disabled", "");
  await action.selectOption("2F");
  await expect(action).toHaveValue("2F");
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "2F",
    durationMs: 1200,
    terminalHoldMs: 100,
  });
  await expect(page.locator('[data-readout="affected"]')).toContainText("26% · 上限 156");
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("26% 最大生命／上限 156");

  await seek(page, 200);
  await expect(canvas).toHaveAttribute("data-technique-phase", "fire");
  await expect(canvas).toHaveAttribute("data-technique-frame", "2");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "1");
  await seek(page, 300);
  await expect(canvas).toHaveAttribute("data-technique-frame", "3");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  await seek(page, 800);
  await expect(canvas).toHaveAttribute("data-technique-frame", "8");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-fire-2-column.png",
    fullPage: true,
  });

  await seek(page, 1199);
  await expect(canvas).toHaveAttribute("data-technique-frame", "11");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 100 ms");
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  expect(pageErrors).toEqual([]);
});

test("advanced fire composes 51 tiles into thirteen draws with a blank 15-tick tail", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="3F"]')).not.toHaveAttribute("disabled", "");
  await action.selectOption("3F");
  await expect(action).toHaveValue("3F");
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "3F",
    durationMs: 1950,
    terminalHoldMs: 150,
  });
  await expect(page.locator('[data-readout="affected"]')).toContainText("32% · 上限 192");
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("32% 最大生命／上限 192");

  await seek(page, 0);
  await expect(canvas).toHaveAttribute("data-technique-phase", "fire");
  await expect(canvas).toHaveAttribute("data-technique-frame", "0");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "1");
  await seek(page, 150);
  await expect(canvas).toHaveAttribute("data-technique-frame", "1");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  await seek(page, 900);
  await expect(canvas).toHaveAttribute("data-technique-frame", "6");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await seek(page, 1500);
  await expect(canvas).toHaveAttribute("data-technique-frame", "10");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-fire-3-wave.png",
    fullPage: true,
  });

  await seek(page, 1800);
  await expect(canvas).toHaveAttribute("data-technique-phase", "fire");
  await expect(canvas).toHaveAttribute("data-technique-frame", "12");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await seek(page, 1950);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  expect(pageErrors).toEqual([]);
});

test("ultimate fire switches to MAGIC/29 before its five rising-column draws", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="4F"]')).not.toHaveAttribute("disabled", "");
  await action.selectOption("4F");
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "4F",
    durationMs: 2900,
    terminalHoldMs: 100,
  });
  await expect(page.locator('[data-readout="affected"]')).toContainText("44% · 上限 270");
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("44% 最大生命／上限 270");

  await seek(page, 0);
  await expect(canvas).toHaveAttribute("data-technique-frame", "0");
  await expect(canvas).toHaveAttribute("data-map-combat-anchor-offset", "0,0");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "1");
  await seek(page, 1900);
  await expect(canvas).toHaveAttribute("data-technique-frame", "19");
  await expect(canvas).toHaveAttribute("data-map-combat-anchor-offset", "0,0");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "9");
  await expect(canvas).toHaveAttribute(
    "data-effect-texture-keys",
    Array.from({ length: 9 }, (_, index) => `map-technique-magic-28-${index + 39}`).join(","),
  );
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-fire-4-dragon-up.png",
    fullPage: true,
  });

  await seek(page, 2000);
  await expect(canvas).toHaveAttribute("data-technique-frame", "20");
  await expect(canvas).toHaveAttribute("data-map-combat-anchor-offset", "0,0");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "9");
  await expect(canvas).toHaveAttribute(
    "data-effect-texture-keys",
    Array.from({ length: 9 }, (_, index) => `map-technique-magic-29-${index}`).join(","),
  );

  await seek(page, 2400);
  await expect(canvas).toHaveAttribute("data-technique-frame", "24");
  await expect(canvas).toHaveAttribute("data-map-combat-anchor-offset", "0,0");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "4");
  await expect(canvas).toHaveAttribute(
    "data-effect-texture-keys",
    "map-technique-magic-29-18,map-technique-magic-29-19,map-technique-magic-29-19,map-technique-magic-29-20",
  );
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-fire-4-rising-column.png",
    fullPage: true,
  });

  await seek(page, 2800);
  await expect(canvas).toHaveAttribute("data-technique-frame", "28");
  await expect(canvas).toHaveAttribute("data-map-combat-anchor-offset", "0,-4");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "4");
  await expect(canvas).toHaveAttribute(
    "data-effect-texture-keys",
    "map-technique-magic-29-18,map-technique-magic-29-19,map-technique-magic-29-19,map-technique-magic-29-20",
  );
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-fire-4-finish.png",
    fullPage: true,
  });

  await seek(page, 2899);
  await expect(canvas).toHaveAttribute("data-technique-frame", "28");
  await expect(canvas).toHaveAttribute("data-map-combat-anchor-offset", "0,-4");
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 100 ms");
  await seek(page, 2900);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  expect(pageErrors).toEqual([]);
});

test("intermediate heal composes the repeated 3x2 heart before its shared five-frame tail", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="2H"]')).not.toHaveAttribute("disabled", "");
  await action.selectOption("2H");
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "2H",
    durationMs: 2150,
    terminalHoldMs: 150,
  });
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("14 個六圖塊心盾後接 5 幀共同尾效");

  await seek(page, 300);
  await expect(canvas).toHaveAttribute("data-technique-phase", "heal-primary");
  await expect(canvas).toHaveAttribute("data-technique-frame", "3");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-heal-2-heart.png",
    fullPage: true,
  });
  await seek(page, 700);
  await expect(canvas).toHaveAttribute("data-technique-frame", "7");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await seek(page, 1400);
  await expect(canvas).toHaveAttribute("data-technique-phase", "heal-tail");
  await expect(canvas).toHaveAttribute("data-technique-frame", "0");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "1");
  await seek(page, 2149);
  await expect(canvas).toHaveAttribute("data-technique-frame", "4");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "1");
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await seek(page, 2150);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  expect(pageErrors).toEqual([]);
});

test("advanced heal expands, loops three times, reverses, then runs the shared tail", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="3H"]')).not.toHaveAttribute("disabled", "");
  await action.selectOption("3H");
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "3H",
    durationMs: 2350,
    terminalHoldMs: 150,
  });
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("33 次繪製／235 tick 後才結算");

  await seek(page, 240);
  await expect(canvas).toHaveAttribute("data-technique-phase", "heal-primary");
  await expect(canvas).toHaveAttribute("data-technique-frame", "4");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await seek(page, 300);
  await expect(canvas).toHaveAttribute("data-technique-frame", "5");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await seek(page, 700);
  await expect(canvas).toHaveAttribute("data-technique-frame", "13");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-heal-3-heart.png",
    fullPage: true,
  });
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-technique-frame", "23");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await seek(page, 1600);
  await expect(canvas).toHaveAttribute("data-technique-phase", "heal-tail");
  await expect(canvas).toHaveAttribute("data-technique-frame", "0");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "1");
  await seek(page, 2349);
  await expect(canvas).toHaveAttribute("data-technique-frame", "4");
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await seek(page, 2350);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  expect(pageErrors).toEqual([]);
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
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-recovery-1.png",
    fullPage: true,
  });
  await seek(page, 2549);
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await seek(page, 2550);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
});

test("intermediate recovery reuses all native stages with its radius-three rule preview", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("2I"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "2I",
    durationMs: 2550,
    terminalHoldMs: 150,
  });
  await expect(page.locator('[data-readout="result"]')).toContainText("50／70／90");
  await expect(page.getByTestId("technique-lab-hint")).toContainText("stableRemake");
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-technique-phase", "recovery");
  await expect(canvas).toHaveAttribute("data-technique-frame", "8");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "1");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-recovery-2.png",
    fullPage: true,
  });
  await seek(page, 2250);
  await expect(canvas).toHaveAttribute("data-technique-frame", "15");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await seek(page, 2549);
  await expect(canvas).toHaveAttribute("data-technique-frame", "16");
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await seek(page, 2550);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  expect(pageErrors).toEqual([]);
});

test("advanced recovery keeps all shared stages while excluding frozen allies from its radius-four projection", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("3I"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "3I",
    durationMs: 2550,
    terminalHoldMs: 150,
  });
  await expect(page.locator('[data-readout="result"]')).toContainText("35／60／85／110");
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-technique-phase", "recovery");
  await expect(canvas).toHaveAttribute("data-technique-frame", "8");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "1");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-recovery-3.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"));
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", /lab-2/u);
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(25, 18);
  await page.getByTestId("technique-lab-action").selectOption("3I");
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 1200);

  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", /lab-2/u);
  await expect(canvas).toHaveAttribute("data-frozen-unit-count", "1");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  await expect(page.getByTestId("technique-lab-hint")).toContainText("冰殼持續可見");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-recovery-3-frozen-exception.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
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
        await captureVisualAudit(page, {
          path: `artifacts/playwright/technique-lab-ice-1-ring-${distance}.png`,
          fullPage: true,
        });
      } else if (contract.code === "2C" && distance === contract.distances) {
        await captureVisualAudit(page, {
          path: "artifacts/playwright/technique-lab-ice-2-outer-ring.png",
          fullPage: true,
        });
      } else if (contract.code === "3C" && distance === contract.distances) {
        await captureVisualAudit(page, {
          path: "artifacts/playwright/technique-lab-ice-3-outer-ring.png",
          fullPage: true,
        });
      } else if (contract.code === "4C" && distance === contract.distances) {
        await captureVisualAudit(page, {
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
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-dispel-animation.png",
    fullPage: true,
  });

  await seek(page, 2499);
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 50 ms");
  await seek(page, 2500);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-frozen-unit-count", "0");
  await expect(page.locator('[data-readout="result"]')).toContainText("冰封與異常狀態");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-dispel-result.png",
    fullPage: true,
  });
});

test("stomp preserves the native timeline while landing on the selected target", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1D"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "1D",
    durationMs: 450,
    terminalHoldMs: 0,
  });

  await seek(page, 0);
  await expect(canvas).toHaveAttribute("data-technique-phase", "rising");
  await expect(canvas).toHaveAttribute("data-stomp-x", "160");
  await expect(canvas).toHaveAttribute("data-stomp-shadow-y", "338");
  await expect(canvas).toHaveAttribute("data-stomp-target-screen-x", "340");
  await expect(canvas).toHaveAttribute("data-stomp-target-screen-y", "264");
  await expect(canvas).toHaveAttribute("data-stomp-impact-screen-x", "340");
  await expect(canvas).toHaveAttribute("data-stomp-impact-screen-y", "264");
  await expect(canvas).toHaveAttribute("data-stomp-y", "25");
  await expect(canvas).toHaveAttribute("data-stomp-graphic-draw", "0");
  await expect(canvas).toHaveAttribute("data-stomp-explicit-ticks", "1");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");

  await seek(page, 160);
  await expect(canvas).toHaveAttribute("data-technique-phase", "quake");
  await expect(canvas).toHaveAttribute("data-stomp-y", "145");
  await expect(canvas).toHaveAttribute("data-stomp-graphic-draw", "6");
  await expect(canvas).toHaveAttribute("data-stomp-explicit-ticks", "0");
  await expect(page.locator('[data-readout="affected"]')).toContainText("10..19");
  await expect(page.locator('[data-readout="result"]')).toContainText("龍踏並集命中 3 名");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-stomp-1-quake.png",
    fullPage: true,
  });

  await seek(page, 360);
  await expect(canvas).toHaveAttribute("data-technique-phase", "falling");
  await expect(canvas).toHaveAttribute("data-stomp-y", "175");
  await expect(canvas).toHaveAttribute("data-stomp-graphic-draw", "24");
  await seek(page, 440);
  await expect(canvas).toHaveAttribute("data-stomp-y", "15");
  await expect(canvas).toHaveAttribute("data-stomp-graphic-draw", "32");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-stomp-1-falling.png",
    fullPage: true,
  });

  await seek(page, 450);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await expect(page.locator('[data-readout="phase"]')).toContainText("完成 · 無殘留");
  expect(pageErrors).toEqual([]);
});

test("male stomp keeps its native geometry while landing on the selected target", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="2D"]')).not.toHaveAttribute("disabled", "");
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("2D"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "2D",
    durationMs: 450,
    terminalHoldMs: 0,
  });

  await seek(page, 160);
  await expect(canvas).toHaveAttribute("data-technique-phase", "quake");
  await expect(canvas).toHaveAttribute("data-stomp-x", "160");
  await expect(canvas).toHaveAttribute("data-stomp-shadow-y", "368");
  await expect(canvas).toHaveAttribute("data-stomp-target-screen-x", "340");
  await expect(canvas).toHaveAttribute("data-stomp-target-screen-y", "264");
  await expect(canvas).toHaveAttribute("data-stomp-impact-screen-x", "340");
  await expect(canvas).toHaveAttribute("data-stomp-impact-screen-y", "264");
  await expect(canvas).toHaveAttribute("data-stomp-y", "145");
  await expect(canvas).toHaveAttribute("data-stomp-graphic-draw", "6");
  await expect(page.locator('[data-readout="affected"]')).toContainText("15..29");
  await expect(page.locator('[data-readout="result"]')).toContainText("男踏並集命中 3 名");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-stomp-2-quake.png",
    fullPage: true,
  });

  await seek(page, 450);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  expect(pageErrors).toEqual([]);
});

test("female stomp keeps its native geometry while landing on the selected target", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="3D"]')).not.toHaveAttribute("disabled", "");
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("3D"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "3D",
    durationMs: 450,
    terminalHoldMs: 0,
  });

  await seek(page, 160);
  await expect(canvas).toHaveAttribute("data-technique-phase", "quake");
  await expect(canvas).toHaveAttribute("data-stomp-x", "160");
  await expect(canvas).toHaveAttribute("data-stomp-shadow-y", "368");
  await expect(canvas).toHaveAttribute("data-stomp-target-screen-x", "340");
  await expect(canvas).toHaveAttribute("data-stomp-target-screen-y", "264");
  await expect(canvas).toHaveAttribute("data-stomp-impact-screen-x", "340");
  await expect(canvas).toHaveAttribute("data-stomp-impact-screen-y", "264");
  await expect(canvas).toHaveAttribute("data-stomp-y", "145");
  await expect(canvas).toHaveAttribute("data-stomp-graphic-draw", "6");
  await expect(page.locator('[data-readout="affected"]')).toContainText("20..39");
  await expect(page.locator('[data-readout="result"]')).toContainText("女踏並集命中 3 名");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-stomp-3-quake.png",
    fullPage: true,
  });

  await seek(page, 450);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  expect(pageErrors).toEqual([]);
});

test("iron plate previews native movement followed by immediate four-neighbor redraw", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
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

  await page.getByTestId("technique-lab-side").selectOption("1");
  await page.getByTestId("technique-lab-class").selectOption("engineer");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(21, 18);
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(21, 18);
  await page.getByTestId("technique-lab-action").selectOption("1K");

  expect((await labState(page))?.session).toMatchObject({
    actionCode: "1K",
    actorId: "lab-1",
    target: { x: 22, y: 18 },
  });
  expect((await labState(page))?.playback).toMatchObject({
    durationMs: 1,
    terminalHoldMs: 0,
  });
  await seek(page, 0);
  await expect(canvas).toHaveAttribute("data-technique-phase", "construction");
  await expect(canvas).toHaveAttribute("data-construction-completed", "false");
  await expect(canvas).toHaveAttribute("data-construction-terrain-count", "0");
  await expect(page.locator('[data-readout="phase"]')).toContainText("普通移動前");

  await seek(page, 1);
  await expect(canvas).toHaveAttribute("data-construction-completed", "true");
  await expect(canvas).toHaveAttribute("data-construction-terrain-count", "4");
  await expect(canvas).toHaveAttribute("data-target", "22,18");
  await expect(page.locator('[data-readout="affected"]')).toContainText("4 格鐵板地形");
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("零技術動畫／音效／經驗");
  await expect(page.getByTestId("technique-lab-hint"))
    .toContainText("第 1 關 token 64 原圖");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-iron-plate.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("obstacle previews native movement followed by the stage-1 four-neighbor redraw", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
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

  await page.getByTestId("technique-lab-side").selectOption("1");
  await page.getByTestId("technique-lab-class").selectOption("engineer");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(21, 18);
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(21, 18);
  await page.getByTestId("technique-lab-action").selectOption("2K");

  expect((await labState(page))?.session).toMatchObject({
    actionCode: "2K",
    actorId: "lab-1",
    target: { x: 22, y: 18 },
  });
  expect((await labState(page))?.playback).toMatchObject({ durationMs: 1, terminalHoldMs: 0 });
  await seek(page, 0);
  await expect(canvas).toHaveAttribute("data-construction-completed", "false");
  await expect(page.locator('[data-readout="phase"]')).toContainText("普通移動前");

  await seek(page, 1);
  await expect(canvas).toHaveAttribute("data-construction-completed", "true");
  await expect(canvas).toHaveAttribute("data-construction-terrain-count", "4");
  await expect(page.locator('[data-readout="affected"]')).toContainText("4 格障礙地形");
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("零技術動畫／音效／經驗");
  await expect(page.getByTestId("technique-lab-hint"))
    .toContainText("第 1 關 token 18 原圖");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-obstacle.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("AA keeps all twenty two-tile frames and stays below a persistent ice shell", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-target", "23,18");
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("AA"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(19, 20);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "AA",
    durationMs: 3000,
    terminalHoldMs: 150,
  });
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("攻擊 +20 · 狀態 3");
  for (const [time, frame] of [[0, "0"], [1500, "10"], [2999, "19"]] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "status");
    await expect(canvas).toHaveAttribute("data-technique-frame", frame);
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  }
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-attack-up.png",
    fullPage: true,
  });
  await seek(page, 3000);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(page.locator('[data-readout="result"]')).toContainText("狀態重置為 3");

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"))).toBe(true);
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(25, 18);
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("AA"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 1500);
  await expect(canvas).toHaveAttribute("data-technique-phase", "status");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("攻擊 +20 · 狀態 3");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-attack-up-frozen.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("FM reuses all twenty AA pairs and stays below a persistent ice shell", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-target", "23,18");
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("FM"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(19, 20);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "FM",
    durationMs: 3000,
    terminalHoldMs: 150,
  });
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("防魔 · 狀態 1 · 一次性保護");
  for (const [time, frame] of [[0, "0"], [1500, "10"], [2999, "19"]] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "status");
    await expect(canvas).toHaveAttribute("data-technique-frame", frame);
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  }
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await expect(page.getByTestId("technique-lab-hint")).toContainText("與 AA 完全共用");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-magic-guard.png",
    fullPage: true,
  });
  await seek(page, 3000);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(page.locator('[data-readout="result"]')).toContainText("狀態重置為 1");

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"))).toBe(true);
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(25, 18);
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("FM"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 1500);
  await expect(canvas).toHaveAttribute("data-technique-phase", "status");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("防魔 · 狀態 1 · 一次性保護");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-magic-guard-frozen.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("IP plays both poison phases, preserves boss immunity, and stays below a persistent ice shell", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("IP"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "IP",
    durationMs: 2900,
    terminalHoldMs: 100,
  });
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("中毒狀態 3 · 每輪折半但不致死");

  for (const [time, expectedPhase, frame] of [
    [0, "poison", "0"],
    [1200, "poison", "12"],
    [1300, "poison", "0"],
    [2000, "poison", "7"],
    [2899, "poison", "15"],
  ] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-technique-phase", expectedPhase);
    await expect(canvas).toHaveAttribute("data-technique-frame", frame);
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "4");
  }
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 100 ms");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-poison.png",
    fullPage: true,
  });
  await seek(page, 2900);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(page.locator('[data-readout="result"]')).toContainText("中毒狀態重置為 3");

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"))).toBe(true);
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("IP"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 2000);
  await expect(canvas).toHaveAttribute("data-technique-phase", "poison");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "4");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await expect(page.getByTestId("technique-lab-hint")).toContainText("冰封只跳過後續輪末毒傷");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-poison-frozen.png",
    fullPage: true,
  });

  await page.getByTestId("technique-lab-side").selectOption("2");
  await page.getByTestId("technique-lab-class").selectOption("dragon");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(23, 18);
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("龍／頭／手免疫寫入");
  await seek(page, 2900);
  await expect(page.locator('[data-readout="result"]')).toContainText("免疫中毒寫入");
  expect(pageErrors).toEqual([]);
});

test("LA plays eleven silent 3x2 descriptors, preserves boss immunity, and stays below ice", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("LA"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "LA",
    durationMs: 1650,
    terminalHoldMs: 150,
  });
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("混亂狀態 3 · 自動行動只移動／撤退");
  for (const [time, frame] of [[0, "0"], [750, "5"], [1500, "10"], [1649, "10"]] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "status");
    await expect(canvas).toHaveAttribute("data-technique-frame", frame);
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  }
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-confusion.png",
    fullPage: true,
  });
  await seek(page, 1650);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(page.locator('[data-readout="result"]')).toContainText("混亂狀態重置為 3");

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"))).toBe(true);
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("LA"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 750);
  await expect(canvas).toHaveAttribute("data-technique-phase", "status");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await expect(page.getByTestId("technique-lab-hint"))
    .toContainText("混亂可指定冰封敵軍");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-confusion-frozen.png",
    fullPage: true,
  });

  await page.getByTestId("technique-lab-side").selectOption("2");
  await page.getByTestId("technique-lab-class").selectOption("dragon");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(23, 18);
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("龍／頭／手免疫寫入");
  await seek(page, 1650);
  await expect(page.locator('[data-readout="result"]')).toContainText("免疫混亂寫入");
  expect(pageErrors).toEqual([]);
});

test("SA plays eleven E/8-backed 1x2 descriptors and remains visible below a persistent ice shell", async ({ page }) => {
  const pageErrors: string[] = [];
  const audioRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  page.on("request", (request) => {
    if (/\/8\.wav(?:\?|$)/u.test(request.url())) audioRequests.push(request.url());
  });
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("SA"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "SA",
    durationMs: 1650,
    terminalHoldMs: 150,
  });
  await page.locator("#technique-lab-sound").check();
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("攻擊 -20 · 狀態 3");
  await expect.poll(() => audioRequests.length).toBe(1);
  expect(audioRequests[0]).toMatch(/\/assets\/original\/technique-lab\/audio\/8\.wav$/u);
  for (const [time, frame] of [[0, "0"], [750, "5"], [1500, "10"], [1649, "10"]] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "status");
    await expect(canvas).toHaveAttribute("data-technique-frame", frame);
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  }
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-attack-down.png",
    fullPage: true,
  });
  await seek(page, 1650);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("攻擊 -20 · 狀態重置為 3");

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"))).toBe(true);
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("SA"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 750);
  await expect(canvas).toHaveAttribute("data-technique-phase", "status");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("攻擊 -20 · 狀態 3");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-attack-down-frozen.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("SD plays ten E/8-backed 2x2 descriptors and remains visible below a persistent ice shell", async ({ page }) => {
  const pageErrors: string[] = [];
  const audioRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  page.on("request", (request) => {
    if (/\/8\.wav(?:\?|$)/u.test(request.url())) audioRequests.push(request.url());
  });
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("SD"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "SD",
    durationMs: 1500,
    terminalHoldMs: 150,
  });
  await page.locator("#technique-lab-sound").check();
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("防禦 -20 · 狀態 3");
  await expect.poll(() => audioRequests.length).toBe(1);
  expect(audioRequests[0]).toMatch(/\/assets\/original\/technique-lab\/audio\/8\.wav$/u);
  for (const [time, frame] of [[0, "0"], [750, "5"], [1350, "9"], [1499, "9"]] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "status");
    await expect(canvas).toHaveAttribute("data-technique-frame", frame);
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "4");
  }
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-defense-down.png",
    fullPage: true,
  });
  await seek(page, 1500);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("防禦 -20 · 狀態重置為 3");

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"))).toBe(true);
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("SD"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 750);
  await expect(canvas).toHaveAttribute("data-technique-phase", "status");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "4");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("防禦 -20 · 狀態 3");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-defense-down-frozen.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("SN plays nine silent 3x2 descriptors, preserves dragon immunity, and stays below ice", async ({ page }) => {
  const pageErrors: string[] = [];
  const audioRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("SN"))).toBe(true);
  page.on("request", (request) => {
    if (/\.wav(?:\?|$)/u.test(request.url())) audioRequests.push(request.url());
  });
  await page.locator("#technique-lab-sound").check();
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "SN",
    durationMs: 2250,
    terminalHoldMs: 250,
  });
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("禁咒狀態 3 · 技術不可用");
  for (const [time, frame, count] of [
    [0, "0", "6"],
    [1000, "4", "6"],
    [2000, "8", "3"],
    [2249, "8", "3"],
  ] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "status");
    await expect(canvas).toHaveAttribute("data-technique-frame", frame);
    await expect(canvas).toHaveAttribute("data-effect-tile-count", count);
  }
  expect(audioRequests).toEqual([]);
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 250 ms");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-spell-seal.png",
    fullPage: true,
  });
  await seek(page, 2250);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("禁咒狀態重置為 3");

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"))).toBe(true);
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("SN"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 1000);
  await expect(canvas).toHaveAttribute("data-technique-phase", "status");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "6");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-spell-seal-frozen.png",
    fullPage: true,
  });

  await page.getByTestId("technique-lab-side").selectOption("2");
  await page.getByTestId("technique-lab-class").selectOption("dragon");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(23, 18);
  await expect(page.locator('[data-readout="affected"]')).toContainText("龍免疫寫入");
  await seek(page, 2250);
  await expect(page.locator('[data-readout="result"]')).toContainText("龍免疫禁咒寫入");
  expect(pageErrors).toEqual([]);
});

test("OJ scans side 1 with fixed per-recipient results and keeps its healing text below ice", async ({ page }) => {
  const pageErrors: string[] = [];
  const audioRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  page.on("request", (request) => {
    if (/\.wav(?:\?|$)/u.test(request.url())) audioRequests.push(request.url());
  });
  const canvas = page.locator("#technique-lab-canvas canvas");
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="OJ"]')).not.toHaveAttribute("disabled", "");
  await action.selectOption("OJ");
  await expect(page.getByTestId("technique-lab-target-tool")).toBeDisabled();
  await expect(page.getByTestId("technique-lab-hint")).toContainText("按格號掃描全部 side 1");
  await expect(page.getByTestId("technique-lab-hint"))
    .toContainText("冰封單位抽中生命時實際恢復為 0");
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "OJ",
    durationMs: 600,
    terminalHoldMs: 600,
  });
  await seek(page, 0);
  await expect(canvas).toHaveAttribute("data-technique-phase", "prayer");
  await expect(canvas).toHaveAttribute("data-prayer-unit-id", "lab-5");
  await expect(canvas).toHaveAttribute("data-prayer-outcome", "healing");
  await expect(canvas).toHaveAttribute("data-prayer-rolled-amount", "8");
  await expect(page.locator('[data-readout="affected"]')).toContainText("士兵 · 生命 +8");
  await expect(page.locator('[data-readout="phase"]')).toContainText("prayer-1/1");
  expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-prayer.png",
    fullPage: true,
  });
  await seek(page, 600);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("1 名通過，逐人結算完成");

  // Freeze the same fixed-seed recipient with 4C, then replay OJ. The result
  // text still shows the native roll while the stable-remake healing is zero.
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(23, 21);
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("4C"))).toBe(true);
  await seek(page, 3000);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", /lab-5/u);
  audioRequests.length = 0;
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("OJ"))).toBe(true);
  await seek(page, 0);
  await expect(canvas).toHaveAttribute("data-prayer-unit-id", "lab-5");
  await expect(canvas).toHaveAttribute("data-prayer-outcome", "healing");
  await expect(canvas).toHaveAttribute("data-prayer-rolled-amount", "8");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", /lab-5/u);
  await expect(page.getByTestId("technique-lab-hint"))
    .toContainText("冰殼保持在圖元和文字上方");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-prayer-frozen.png",
    fullPage: true,
  });
  await seek(page, 600);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", /lab-5/u);
  expect(audioRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("AD assembles and reverses all eleven four-tile shields below a persistent ice shell", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-target", "23,18");
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({
      position: {
        x: (worldX - 15 + .5) * box.width / 16,
        y: (worldY - 13 + .5) * box.height / 11,
      },
    });
  };

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("AD"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(19, 20);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "AD",
    durationMs: 1650,
    terminalHoldMs: 150,
  });
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("防禦 +20 · 狀態 3");
  for (const [time, frame] of [[0, "0"], [750, "5"], [900, "6"], [1649, "10"]] as const) {
    await seek(page, time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "status");
    await expect(canvas).toHaveAttribute("data-technique-frame", frame);
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "4");
  }
  await expect(page.locator('[data-readout="phase"]')).toContainText("末幀保持 150 ms");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-defense-up.png",
    fullPage: true,
  });
  await seek(page, 1650);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(page.locator('[data-readout="result"]')).toContainText("狀態重置為 3");

  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"))).toBe(true);
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(25, 18);
  expect(await page.evaluate(() =>
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("AD"))).toBe(true);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await seek(page, 750);
  await expect(canvas).toHaveAttribute("data-technique-phase", "status");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "4");
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", "lab-2");
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("防禦 +20 · 狀態 3");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-defense-up-frozen.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("map tools place either side while all 33 original techniques stay available", async ({ page }) => {
  await page.goto("/technique-lab.html");
  const surface = page.locator("#technique-lab-canvas canvas");
  await expect(surface).toBeVisible();
  await expect(surface).toHaveAttribute("data-target", "23,18");
  await expect.poll(async () => (await labState(page))?.playback.playing).toBe(true);
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  await expect.poll(async () => (await labState(page))?.playback.playing).toBe(false);
  const action = page.getByTestId("technique-lab-action");
  await expect(action.locator('option[value="4F"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="AA"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="AD"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="FM"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="IP"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="LA"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="OJ"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="SA"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="1D"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="2L"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator('option[value="4C"]')).not.toHaveAttribute("disabled", "");
  await expect(action.locator("option")).toHaveCount(33);
  await expect(action.locator("option:disabled")).toHaveCount(0);

  const side = page.getByTestId("technique-lab-side");
  const unitClass = page.getByTestId("technique-lab-class");
  await side.selectOption("1");
  await expect(unitClass.locator('option[value="dragon"]')).toHaveAttribute("disabled", "");
  await unitClass.selectOption("wizard");
  await page.getByRole("button", { name: "放置／替換" }).click();

  const box = await surface.boundingBox();
  if (!box) throw new Error("technique laboratory canvas has no bounds");
  const clickCell = async (worldX: number, worldY: number) => {
    const localX = (worldX - 15 + .5) * box.width / 16;
    const localY = (worldY - 13 + .5) * box.height / 11;
    await surface.click({ position: { x: localX, y: localY } });
  };
  await clickCell(21, 21);
  await expect.poll(async () => (await labState(page))?.session.units).toContainEqual(
    expect.objectContaining({ side: 1, classId: "wizard", x: 21, y: 21 }),
  );
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(21, 21);
  await expect.poll(async () => (await labState(page))?.session.actorId).toMatch(/^lab-/u);
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(22, 20);
  await expect.poll(async () => (await labState(page))?.session.target)
    .toEqual({ x: 22, y: 20 });

  await action.selectOption("4C");
  await expect(page.getByTestId("technique-lab-target-tool")).toBeDisabled();
  await expect(page.getByTestId("technique-lab-hint")).toContainText("鎖定施法者格為中心");
  expect((await labState(page))?.session.target).toEqual({ x: 21, y: 21 });

  await side.selectOption("2");
  await unitClass.selectOption("dragon");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(25, 21);
  await expect.poll(async () => (await labState(page))?.session.units).toContainEqual(
    expect.objectContaining({ side: 2, classId: "dragon", x: 25, y: 21 }),
  );
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-placement-tools.png",
    fullPage: true,
  });
});
