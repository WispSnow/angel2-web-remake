import { expect, test, type Locator, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

const labState = (page: Page) => page.evaluate(() =>
  window.__ANGEL2_TECHNIQUE_LAB__?.getState());

const seek = async (page: Page, timeMs: number) => {
  await page.evaluate((time) => window.__ANGEL2_TECHNIQUE_LAB__?.seek(time), timeMs);
};

test("all four native lightning scripts expose their main, wave and cleanup phases", async ({ page }) => {
  const pageErrors: string[] = [];
  const resourceRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => resourceRequests.push(new URL(request.url()).pathname));
  await page.goto("/technique-lab.html");
  await expect(page.getByRole("heading", { name: "地圖技能動畫實驗室" })).toBeVisible();
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-target", "23,18");
  for (const id of ["lightning-1", "lightning-2", "lightning-3", "lightning-4"]) {
    expect(resourceRequests).toContain(`/assets/original/map-action-atlases/${id}.json`);
    expect(resourceRequests).toContain(`/assets/original/map-action-atlases/${id}.png`);
  }
  expect(resourceRequests.filter((pathname) =>
    pathname.startsWith("/assets/original/map-actions/")
      && !pathname.includes("/iron-plate/")
      && !pathname.includes("/obstacle/"))).toEqual([]);
  expect(resourceRequests.some((pathname) =>
    pathname.includes("/assets/original/technique-lab/lightning/"))).toBe(false);

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
      // Mid-sweep, where every ring of the radius-5 diamond is showing its own
      // frame — the first wave draw only lights the centre cell.
      await seek(page, contract.waveAt + 200);
      await captureVisualAudit(page, {
        path: "artifacts/playwright/technique-lab-lightning-4-wave.png",
        fullPage: true,
      });
      await seek(page, contract.waveAt);
    }
    await seek(page, contract.cleanupAt);
    await expect(canvas).toHaveAttribute("data-technique-phase", "cleanup");
    await expect(page.locator('[data-readout="phase"]')).toContainText("共同收尾");
    await expect(canvas).toHaveAttribute("data-effect-tile-count", String(contract.affected));
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

  // `1000:6DE8` gates MAGIC/6 on a non-zero effect-range value, so an enemy
  // outside the diamond never receives the cleanup sprite.
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1L"));
  await seek(page, 3640);
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "2");
  await expect(page.locator('[data-readout="phase"]')).toContainText("效果範圍內敵軍");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-lightning-range-only-cleanup.png",
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

test("the laboratory plays lightning sounds from the formal campaign audio mapping", async ({ page }) => {
  const audioRequests: Array<{ path: string; type: string }> = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(".wav")) {
      audioRequests.push({ path: pathname, type: request.resourceType() });
    }
  });
  await page.goto("/technique-lab.html");
  await expect(page.locator("#app")).toHaveAttribute("data-sound-effect-ready", "true");
  const preparedRequestCount = audioRequests.length;
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("3L"));
  await page.locator("#technique-lab-sound").check();
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.play());

  await expect.poll(async () => Number(
    await page.locator("#app").getAttribute("data-sound-effect-schedule-count"),
  )).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#app")).toHaveAttribute("data-sound-effect-context", "running");
  expect(audioRequests).toHaveLength(preparedRequestCount);
  expect(audioRequests).toContainEqual({ path: "/assets/original/audio/e/9.wav", type: "fetch" });
  expect(audioRequests).toContainEqual({ path: "/assets/original/audio/e/41.wav", type: "fetch" });
  expect(audioRequests.some(({ path }) => path.includes("/technique-lab/audio/"))).toBe(false);
  expect(audioRequests.some(({ type }) => type === "media")).toBe(false);
});

test("lightning hit waves advance one range threshold after every native draw", async ({ page }) => {
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  await expect(canvas).toBeVisible();
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("2L"));

  // REMAKE-049: the wave is two layers over the same band. The sweep layer
  // (`MAGIC/24` frames 0..4) draws one frame per cell keyed to that cell's own
  // `rangeValue - threshold`, so the radius-4 diamond's 1/4/8/12 rings enter one
  // draw apart and each keeps advancing. The marker layer alternates frames 5/6
  // — the resource's two "unit electrocuted" frames — on enemy cells only.
  const waveLayers = async () => {
    const keys = (await canvas.getAttribute("data-effect-texture-keys")) ?? "";
    const frames = keys.split(",").filter(Boolean)
      .map((key) => Number(key.split("-").at(-1)));
    const sweep: Record<number, number> = {};
    for (const frame of frames.filter((frame) => frame <= 4)) {
      sweep[frame] = (sweep[frame] ?? 0) + 1;
    }
    return { sweep, markers: frames.filter((frame) => frame >= 5).length };
  };

  const expected = [
    { time: 1750, sweep: { 0: 1 }, markers: 1 },
    { time: 1770, sweep: { 0: 4, 1: 1 }, markers: 2 },
    { time: 1790, sweep: { 0: 8, 1: 4, 2: 1 }, markers: 3 },
    { time: 1810, sweep: { 0: 12, 1: 8, 2: 4, 3: 1 }, markers: 3 },
    { time: 1830, sweep: { 1: 12, 2: 8, 3: 4, 4: 1 }, markers: 3 },
    // Every range value has passed beyond the sweep width; the band leaves the
    // diamond well before the 16 native draws are spent.
    { time: 1930, sweep: {}, markers: 0 },
  ] as const;
  for (const step of expected) {
    await seek(page, step.time);
    await expect(canvas).toHaveAttribute("data-technique-phase", "wave");
    await expect.poll(waveLayers).toEqual({ sweep: step.sweep, markers: step.markers });
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

/**
 * Every HD clip the layer draws lands inside the lab viewport (640×484): its target point is the effect cell seen
 * through the scrolled lab camera, not the cell's world position (which put clips off-canvas).
 */
async function expectHdClipsOnScreen(hd: Locator): Promise<void> {
  const rects = (await hd.getAttribute("data-map-action-hd-rects") ?? "").split(";").filter(Boolean)
    .map((rect) => rect.split(",").map(Number));
  expect(rects.length).toBeGreaterThan(0);
  for (const [x = 0, y = 0, w = 0, h = 0] of rects) {
    expect(x + w / 2, `clip centre x of ${rects.join(" ")}`).toBeGreaterThan(0);
    expect(x + w / 2, `clip centre x of ${rects.join(" ")}`).toBeLessThan(640);
    expect(y + h / 2, `clip centre y of ${rects.join(" ")}`).toBeGreaterThan(0);
    expect(y + h / 2, `clip centre y of ${rects.join(" ")}`).toBeLessThan(484);
  }
}

test("HD art style plays 1F–4F as HD clips on the original timeline and leaves other techniques original", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const hd = page.getByTestId("map-action-hd-canvas");
  const style = page.getByTestId("technique-lab-art-style");
  await expect(style).toHaveValue("original");
  await expect(canvas).toHaveAttribute("data-art-style", "original");
  const contracts = [
    { code: "1F", action: "fire-1", duration: 700, time: 300 },
    { code: "2F", action: "fire-2", duration: 1200, time: 850 },
    { code: "3F", action: "fire-3", duration: 1950, time: 1050 },
    { code: "4F", action: "fire-4", duration: 2900, time: 1700 },
  ] as const;
  for (const contract of contracts) {
    expect(await page.evaluate((code) =>
      window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode(code), contract.code)).toBe(true);
    await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
    await style.selectOption("original");
    await seek(page, contract.time);
    expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
    await expect(hd).not.toHaveAttribute("data-map-action-hd-action", /./u);
    const frame = page.locator(".technique-lab-canvas-frame");
    const original = await frame.screenshot();
    await style.selectOption("hd");
    // 第一次選高清時視訊可能還在載入：載好前照畫原版，載好後同一時點改畫高清。
    await expect.poll(async () => {
      await seek(page, contract.time);
      return hd.getAttribute("data-map-action-hd-action");
    }, { timeout: 15_000 }).toBe(contract.action);
    // 時間軸與原版完全相同：同一份總長度，高清版不畫任何原版圖塊，停在拖動到的 tick。
    expect((await labState(page))?.playback.durationMs).toBe(contract.duration);
    await expect(canvas).toHaveAttribute("data-art-style", "hd");
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
    await expect(hd).toHaveAttribute("data-map-action-hd-tick", (contract.time / 10).toFixed(1));
    await expectHdClipsOnScreen(hd);
    await expect.poll(async () => (await frame.screenshot()).equals(original)).toBe(false);
    if (contract.code === "4F") {
      await captureVisualAudit(page, { path: "artifacts/playwright/technique-lab-hd-fire-4-dragon.png", fullPage: true });
    }
    await seek(page, contract.duration);
    await expect(canvas).toHaveAttribute("data-technique-phase", "none");
    await expect(hd).not.toHaveAttribute("data-map-action-hd-action", /./u);
  }
  // 沒有高清版的技能照畫原版。
  expect(await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1L"))).toBe(true);
  await seek(page, 3200);
  await expect(canvas).toHaveAttribute("data-art-style", "hd");
  await expect(hd).not.toHaveAttribute("data-map-action-hd-action", /./u);
  expect(Number(await canvas.getAttribute("data-effect-tile-count"))).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test("REMAKE-204: HD art style plays 1H–3H as HD clips and runs the shared finish's afterglow past the original end", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html?art=hd");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const hd = page.getByTestId("map-action-hd-canvas");
  // original timeline lengths (ms) and where each heal's own clip hands over to the shared finish
  const contracts = [
    { code: "1H", clip: "heal-1", duration: 2750, finishAt: 2000 },
    { code: "2H", clip: "heal-2", duration: 2150, finishAt: 1400 },
    { code: "3H", clip: "heal-3", duration: 2350, finishAt: 1600 },
  ] as const;
  for (const contract of contracts) {
    expect(await page.evaluate((code) => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode(code), contract.code)).toBe(true);
    await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
    await expect.poll(async () => {
      await seek(page, 600);
      return hd.getAttribute("data-map-action-hd-action");
    }, { timeout: 15_000 }).toBe(contract.clip);
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
    await expect(hd).toHaveAttribute("data-map-action-hd-tick", "60.0");
    await expectHdClipsOnScreen(hd);
    // the original's end and its readouts stay where they were; the timeline only runs on for the afterglow
    const playback = (await labState(page))?.playback;
    expect(playback?.durationMs).toBe(contract.duration);
    await expect(page.locator('[data-readout="time"]')).toContainText(`/ ${contract.duration} ms · 餘韻到`);
    // the finish starts on the original beat
    await seek(page, contract.finishAt + 50);
    await expect(hd).toHaveAttribute("data-map-action-hd-action", "heal-tail");
    await expect(hd).toHaveAttribute("data-map-action-hd-shows", contract.code === "1H"
      ? "heal-tail:5.0"
      // 2H/3H: their own clip's afterglow still overlaps the finish's first frames
      : `${contract.clip}:${((contract.finishAt + 50) / 10).toFixed(1)};heal-tail:5.0`);
    // past the original end: the finish keeps fading out, no original tile, and the readout says so
    await seek(page, contract.duration + 200);
    await expect(canvas).toHaveAttribute("data-technique-phase", "hd-afterglow");
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
    await expect(hd).toHaveAttribute("data-map-action-hd-shows", "heal-tail:95.0");
    await expect(page.locator('[data-readout="phase"]')).toContainText("完成 · 高清餘韻");
    if (contract.code === "2H") {
      // the heart frame glows as it fades while the finish's first sparkle appears
      await seek(page, contract.finishAt + 20);
      // the HD layer draws a clip once its video has finished seeking to the frame
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLVideoElement>("video.map-action-hd-video")]
        .filter((video) => /heal-(2|tail)/u.test(video.dataset.sourceUrl ?? ""))
        .every((video) => !video.seeking && video.readyState >= 2));
      await page.waitForTimeout(150);
      await captureVisualAudit(page, { path: "artifacts/playwright/technique-lab-hd-heal-2-handover.png", fullPage: true });
    }
    await seek(page, Number(await page.getByTestId("technique-lab-timeline").getAttribute("max")));
    await expect(canvas).toHaveAttribute("data-technique-phase", "none");
    await expect(hd).not.toHaveAttribute("data-map-action-hd-action", /./u);
  }
  // 原版風格沒有餘韻：時間軸回到原版長度。
  await page.getByTestId("technique-lab-art-style").selectOption("original");
  await expect(page.locator('[data-readout="time"]')).not.toContainText("餘韻");
  expect(Number(await page.getByTestId("technique-lab-timeline").getAttribute("max"))).toBe(2350);
  expect(pageErrors).toEqual([]);
});

test("REMAKE-205: HD art style plays the single-target status techniques as HD clips; FM replays AA's clip", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html?art=hd");
  const canvas = page.locator("#technique-lab-canvas canvas");
  const hd = page.getByTestId("map-action-hd-canvas");
  const timeline = page.getByTestId("technique-lab-timeline");
  // original timeline lengths (ms): draws x wait, as the battle controller plays them
  const contracts = [
    { code: "AA", clip: "attack-up", duration: 3000 },
    { code: "FM", clip: "attack-up", duration: 3000 },
    { code: "AD", clip: "defense-up", duration: 1650 },
    { code: "SA", clip: "attack-down", duration: 1650 },
    { code: "SD", clip: "defense-down", duration: 1500 },
    { code: "LA", clip: "confusion", duration: 1650 },
    { code: "SN", clip: "spell-seal", duration: 2250 },
    { code: "IP", clip: "poison", duration: 2900 },
    { code: "TR", clip: "dispel", duration: 2500 },
  ] as const;
  for (const contract of contracts) {
    expect(await page.evaluate((code) => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode(code), contract.code)).toBe(true);
    await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
    await expect.poll(async () => {
      await seek(page, 600);
      return hd.getAttribute("data-map-action-hd-action");
    }, { timeout: 15_000 }).toBe(contract.clip);
    // no original tile under the HD clip, which stands on the target cell at the dragged tick
    await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
    await expect(hd).toHaveAttribute("data-map-action-hd-tick", "60.0");
    await expectHdClipsOnScreen(hd);
    expect((await labState(page))?.playback.durationMs).toBe(contract.duration);
    // an afterglow runs the timeline on past the original end, drawing no original tile
    const end = Number(await timeline.getAttribute("max"));
    expect(end).toBeGreaterThanOrEqual(contract.duration);
    if (end > contract.duration) {
      await seek(page, (contract.duration + end) / 2);
      await expect(canvas).toHaveAttribute("data-technique-phase", "hd-afterglow");
      await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
      await expect(hd).toHaveAttribute("data-map-action-hd-action", contract.clip);
    }
    if (contract.code === "SN") {
      // the sealing strips carry the original's 閉嘴 lettering
      await seek(page, 1150);
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLVideoElement>("video.map-action-hd-video")]
        .filter((video) => (video.dataset.sourceUrl ?? "").includes("/spell-seal/"))
        .every((video) => !video.seeking && video.readyState >= 2));
      await page.waitForTimeout(150);
      await captureVisualAudit(page, { path: "artifacts/playwright/technique-lab-hd-spell-seal.png", fullPage: true });
    }
    await seek(page, end);
    await expect(canvas).toHaveAttribute("data-technique-phase", "none");
    await expect(hd).not.toHaveAttribute("data-map-action-hd-action", /./u);
  }
  expect(pageErrors).toEqual([]);
});

test("REMAKE-206: HD art style draws the recovery heart on every healed ally and replays the ice cycle ring by ring", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html?art=hd");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  const hd = page.getByTestId("map-action-hd-canvas");
  const rectCount = async () => (await hd.getAttribute("data-map-action-hd-rects") ?? "").split(";").filter(Boolean).length;
  const clickCell = async (worldX: number, worldY: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("technique laboratory canvas has no bounds");
    await canvas.click({ position: { x: (worldX - 15 + .5) * box.width / 16, y: (worldY - 13 + .5) * box.height / 11 } });
  };

  // 1C-4C: one 60-tick cycle per ring, drawn on every cell of that ring (4 x distance), the afterglow after the last
  for (const contract of [{ code: "1C", duration: 1200, rings: 2 }, { code: "4C", duration: 3000, rings: 5 }] as const) {
    expect(await page.evaluate((code) => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode(code), contract.code)).toBe(true);
    for (let ring = 1; ring <= contract.rings; ring += 1) {
      await expect.poll(async () => {
        await seek(page, (ring - 1) * 600 + 300);
        return hd.getAttribute("data-map-action-hd-action");
      }, { timeout: 15_000 }).toBe("ice");
      await expect(canvas).toHaveAttribute("data-ice-distance-from-center", String(ring));
      await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
      await expect.poll(rectCount).toBe(ring * 4);
      await expectHdClipsOnScreen(hd);
      if (contract.code === "1C" && ring === 2) {
        await captureVisualAudit(page, { path: "artifacts/playwright/technique-lab-hd-ice-1-ring-2.png", fullPage: true });
      }
    }
    expect((await labState(page))?.playback.durationMs).toBe(contract.duration);
    const end = Number(await page.getByTestId("technique-lab-timeline").getAttribute("max"));
    expect(end).toBe(contract.duration + 200);
    await seek(page, contract.duration + 100);
    await expect(canvas).toHaveAttribute("data-technique-phase", "hd-afterglow");
    await expect.poll(rectCount).toBe(contract.rings * 4);
  }

  // 1I-3I: the heart on each affected ally the ice shell does not block, as the original draws its tiles
  expect(await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1I"))).toBe(true);
  await expect.poll(async () => {
    await seek(page, 1200);
    return hd.getAttribute("data-map-action-hd-action");
  }, { timeout: 15_000 }).toBe("recovery");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await expect.poll(rectCount).toBe(1);
  expect((await labState(page))?.playback.durationMs).toBe(2550);

  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1C"));
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-ids", /lab-2/u);
  await page.getByRole("button", { name: "指定施法者" }).click();
  await clickCell(25, 18);
  await page.getByTestId("technique-lab-action").selectOption("3I");
  await page.getByRole("button", { name: "指定目標格" }).click();
  await clickCell(23, 18);
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  await expect.poll(async () => {
    await seek(page, 1200);
    return hd.getAttribute("data-map-action-hd-action");
  }, { timeout: 15_000 }).toBe("recovery");
  await expect(canvas).toHaveAttribute("data-frozen-unit-count", "1");
  // the original draws two tiles here (the frozen ally gets none); HD draws two hearts
  await expect.poll(rectCount).toBe(2);
  await expectHdClipsOnScreen(hd);
  await page.waitForTimeout(150);
  await captureVisualAudit(page, { path: "artifacts/playwright/technique-lab-hd-recovery-3.png", fullPage: true });
  expect(pageErrors).toEqual([]);
});

test("REMAKE-209/210: HD art style moves the stomp's leg and shadow stills on the original path and plays lightning's parts as HD clips", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/technique-lab.html?art=hd");
  await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.pause());
  const canvas = page.locator("#technique-lab-canvas canvas");
  const hd = page.getByTestId("map-action-hd-canvas");
  const shows = async () => (await hd.getAttribute("data-map-action-hd-shows") ?? "").split(";").filter(Boolean)
    .map((show) => show.split(":")[0] ?? "");
  const rects = async () => (await hd.getAttribute("data-map-action-hd-rects") ?? "").split(";").filter(Boolean)
    .map((rect) => rect.split(",").map(Number));

  // 1D-3D: the leg and its shadow are stills; the leg rises and falls with the original step, the shadow stays put
  expect(await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1D"))).toBe(true);
  await expect.poll(async () => {
    await seek(page, 0);
    return (await shows()).join(",");
  }, { timeout: 15_000 }).toMatch(/^stomp-1-side[12]-leg,stomp-1-side[12]-shadow$/u);
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await expect(canvas).toHaveAttribute("data-stomp-y", "25");
  const rising = await rects();
  await seek(page, 160);
  await expect(canvas).toHaveAttribute("data-stomp-y", "145");
  await expect.poll(async () => (await rects())[0]?.[1]).toBe((rising[0]?.[1] ?? 0) + 120);
  expect((await rects())[1]).toEqual(rising[1]);
  await page.waitForTimeout(150);
  await captureVisualAudit(page, { path: "artifacts/playwright/technique-lab-hd-stomp-1-quake.png", fullPage: true });
  await seek(page, 450);
  await expect(canvas).toHaveAttribute("data-technique-phase", "none");
  await expect(hd).not.toHaveAttribute("data-map-action-hd-action", /./u);

  // 1L: the storm cloud on its anchor, then the wave's sweep and markers, then the shared cleanup on each struck unit
  expect(await page.evaluate(() => window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("1L"))).toBe(true);
  await expect.poll(async () => {
    await seek(page, 1000);
    return (await shows()).join(",");
  }, { timeout: 15_000 }).toBe("lightning-1-main");
  await expect(canvas).toHaveAttribute("data-technique-phase", "main");
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await expectHdClipsOnScreen(hd);
  await seek(page, 3200);
  await expect(canvas).toHaveAttribute("data-technique-phase", "wave");
  await expect.poll(async () => (await shows()).some((clip) => clip === "lightning-1-hit")).toBe(true);
  await expect(canvas).toHaveAttribute("data-effect-tile-count", "0");
  await page.waitForTimeout(150);
  await captureVisualAudit(page, { path: "artifacts/playwright/technique-lab-hd-lightning-1-wave.png", fullPage: true });
  // the struck units keep their marker to the end of the wave; it fades under the cleanup (REMAKE-211), then the
  // cleanup is alone on both units
  await seek(page, 3620);
  await expect(canvas).toHaveAttribute("data-technique-phase", "wave");
  await expect.poll(async () => (await shows()).filter((clip) => clip === "lightning-1-marker").length).toBe(1);
  await seek(page, 3640);
  await expect(canvas).toHaveAttribute("data-technique-phase", "cleanup");
  await expect.poll(shows).toEqual(["lightning-1-marker", "lightning-cleanup"]);
  await expect.poll(async () => (await rects()).length).toBe(4);
  await seek(page, 4100);
  await expect.poll(shows).toEqual(["lightning-cleanup"]);
  await expect.poll(async () => (await rects()).length).toBe(2);
  expect((await labState(page))?.playback.durationMs).toBe(4140);
  expect(pageErrors).toEqual([]);
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
  await expect(canvas).toHaveAttribute(
    "data-effect-atlas-frames",
    [39, 40, 41, 42, 43, 44].map((frame) => `fire-3__effect__${frame}`).join(","),
  );
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

  await page.getByTestId("technique-lab-side").selectOption("2");
  await page.getByTestId("technique-lab-class").selectOption("head");
  await page.getByRole("button", { name: "放置／替換" }).click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("technique laboratory canvas has no bounds");
  await canvas.click({
    position: {
      x: (23 - 15 + .5) * box.width / 16,
      y: (18 - 13 + .5) * box.height / 11,
    },
  });
  await action.selectOption("1C");
  await seek(page, 1200);
  await expect(canvas).toHaveAttribute("data-frozen-unit-count", "0");
  await expect(page.locator('[data-readout="result"]')).toContainText("冰封 0 名");
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

test("IP plays both poison phases, applies the boss divisor, and stays below a persistent ice shell", async ({ page }) => {
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
    .toContainText("中毒狀態 3 · 每輪生命減半且不致死");

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
    .toContainText("中毒狀態 3 · 每輪生命減少三分之一且不致死");
  await seek(page, 2900);
  await expect(page.locator('[data-readout="result"]')).toContainText("每完整輪生命減少三分之一");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-poison-boss.png",
    fullPage: true,
  });
  await page.getByTestId("technique-lab-class").selectOption("head");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(23, 18);
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("中毒狀態 3 · 每輪生命減少三分之一且不致死");
  await seek(page, 2900);
  await expect(page.locator('[data-readout="result"]')).toContainText("每完整輪生命減少三分之一");
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
  await page.getByTestId("technique-lab-class").selectOption("hand");
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
  // `E/8` 是開機就備妥的緩衝之一，不是按下發聲時才抓的檔案，所以唯一那次
  // `8.wav` 請求發生在模組求值期間。監聽器掛在 `goto` 之後就只是在賭預抓
  // 落在註冊之後，於是這條斷言隨機讀到 0 或 1；改成先掛監聽器、再等
  // `data-sound-effect-ready`，量到的仍是同一次預抓，但不再看時序臉色。
  page.on("request", (request) => {
    if (/\/8\.wav(?:\?|$)/u.test(request.url())) audioRequests.push(request.url());
  });
  await page.goto("/technique-lab.html");
  await expect(page.locator("#app")).toHaveAttribute("data-sound-effect-ready", "true");
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
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("SA"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "SA",
    durationMs: 1650,
    terminalHoldMs: 150,
  });
  await page.locator("#technique-lab-sound").check();
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("攻擊 -20 · 狀態 3");
  expect(audioRequests).toHaveLength(1);
  expect(audioRequests[0]).toMatch(/\/assets\/original\/audio\/e\/8\.wav$/u);
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
  // `E/8` 是開機就備妥的緩衝之一，不是按下發聲時才抓的檔案，所以唯一那次
  // `8.wav` 請求發生在模組求值期間。監聽器掛在 `goto` 之後就只是在賭預抓
  // 落在註冊之後，於是這條斷言隨機讀到 0 或 1；改成先掛監聽器、再等
  // `data-sound-effect-ready`，量到的仍是同一次預抓，但不再看時序臉色。
  page.on("request", (request) => {
    if (/\/8\.wav(?:\?|$)/u.test(request.url())) audioRequests.push(request.url());
  });
  await page.goto("/technique-lab.html");
  await expect(page.locator("#app")).toHaveAttribute("data-sound-effect-ready", "true");
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
    window.__ANGEL2_TECHNIQUE_LAB__?.setActionCode("SD"))).toBe(true);
  expect((await labState(page))?.playback).toMatchObject({
    actionCode: "SD",
    durationMs: 1500,
    terminalHoldMs: 150,
  });
  await page.locator("#technique-lab-sound").check();
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("防禦 -20 · 狀態 3");
  expect(audioRequests).toHaveLength(1);
  expect(audioRequests[0]).toMatch(/\/assets\/original\/audio\/e\/8\.wav$/u);
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

  await page.getByTestId("technique-lab-class").selectOption("head");
  await page.getByRole("button", { name: "放置／替換" }).click();
  await clickCell(23, 18);
  await expect(page.locator('[data-readout="affected"]'))
    .toContainText("禁咒狀態 3 · 頭／手專屬行動不受影響");
  await seek(page, 2250);
  await expect(page.locator('[data-readout="result"]'))
    .toContainText("頭／手專屬行動不讀取此狀態");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/technique-lab-spell-seal-head.png",
    fullPage: true,
  });
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
