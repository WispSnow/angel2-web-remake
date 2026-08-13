import { expect, test } from "@playwright/test";
import { className, classStatsFor } from "../../src/game/content/classes";
import { debugRosterForProfile } from "../../src/game/debug-roster-profiles";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import type { CompletedSaveData } from "../../src/game/types";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

test("animation and deployment labs link back to the debug hub", async ({ page }) => {
  for (const lab of ["combat", "technique", "deployment"] as const) {
    await page.goto(`/${lab}-lab.html`);
    const debugLink = page.getByTestId(`${lab}-lab-debug-link`);
    await expect(debugLink).toBeVisible();
    await expect(debugLink).toHaveText("戰役調試中心");
    await expect(debugLink).toHaveAttribute("href", "/debug.html");
    await captureVisualAudit(page.locator(`.${lab}-lab-header`), {
      path: `${ARTIFACT_DIR}/${lab}-lab-debug-navigation.png`,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureVisualAudit(page.locator(`.${lab}-lab-header`), {
      path: `${ARTIFACT_DIR}/${lab}-lab-debug-navigation-narrow.png`,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});

test("debug hub selects a difficulty and opens the formal stage-one deployment", async ({ page }) => {
  await page.goto("/debug.html");
  await expect(page.getByTestId("debug-hub")).toBeVisible();
  const scenarioIds = await page.locator("[data-debug-scenario-id]").evaluateAll((links) =>
    links.map((link) => link.getAttribute("data-debug-scenario-id")));
  expect(scenarioIds.length).toBeGreaterThan(0);
  expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
  await expect(page.locator(".debug-stage-heading h2")).toHaveText([
    "第 0 關 · 瓦爾克麗宮",
    "第 1 關 · 騎士城堡前",
    "第 2 關 · 攻打騎士堡",
    "第 3 關 · 救援友軍",
    "第 4 關 · 通過力場",
    "第 5 關 · 遭遇丁塔琪",
    "第 5 關 · 異世界之門",
    "第 6 關 · 過異世界之門",
    "第 7 關 · 來到異世界",
    "第 8 關 · 營地遭到偷襲",
    "第 9 關 · 找尋傳說中的飛船",
    "第 10 關 · 拯救蘇蘭達",
    "第 11 關 · 飛船上遭遇敵人",
    "第 12 關 · 落入沼澤",
    "第 13 關 · 龍塔外",
    "第 14 關 · 龍塔第一層",
    "第 15 關 · 龍塔第二層",
    "第 16 關 · 龍塔第三層",
    "第 17 關 · 龍塔第四層",
    "第 18 關 · 龍塔第五層",
    "第 19 關 · 龍塔第六層",
    "第 20 關 · 龍塔頂部",
    "第 21 關 · 焦土森林村莊外",
    "第 22 關 · 焦土森林村莊中",
    "第 23 關 · 死亡之谷中",
    "第 24 關 · 死亡之谷城堡前",
    "第 25 關 · 遭遇碧娜維姬",
    "第 26 關 · 趕回瓦爾克麗城",
    "第 27 關 · 保衛瓦爾克麗城",
    "第 28 關 · 騎士城堡前",
    "第 29 關 · 治癒維斯塔女帝",
  ]);
  const titleOffsets = await page.locator(".debug-stage-heading h2").evaluateAll((headings) =>
    headings.map((heading) => Math.round(heading.getBoundingClientRect().left)));
  expect(new Set(titleOffsets).size).toBe(1);
  const scenarioRows = await page.locator(".debug-scenario-grid").evaluateAll((grids) =>
    grids.map((grid) => new Set(Array.from(grid.children, (card) =>
      Math.round(card.getBoundingClientRect().top))).size));
  expect(Math.max(...scenarioRows)).toBeLessThanOrEqual(2);
  for (const scenarioId of [
    "stage-03-himi-defeat",
    "stage-03-daisy-defeat",
    "stage-07-prebattle",
    "stage-07-deployment",
    "stage-07-player",
    "stage-07-near-laili",
    "stage-07-near-defeat",
    "stage-07-victory-ready",
    "stage-07-cleared",
    "stage-08-prebattle",
    "stage-08-opening",
    "stage-08-player",
    "stage-08-free-action",
    "stage-08-near-victory",
    "stage-08-near-defeat",
    "stage-08-victory-ready",
    "stage-08-cleared",
    "stage-09-deployment",
    "stage-09-opening",
    "stage-09-player",
    "stage-09-near-route",
    "stage-09-near-elimination",
    "stage-09-near-defeat",
    "stage-09-victory-ready",
    "stage-09-cleared",
    "stage-11-opening",
    "stage-11-player",
    "stage-11-near-route",
    "stage-11-near-defeat",
    "stage-11-victory-ready",
    "stage-11-cleared",
    "stage-10-prebattle",
    "stage-10-deployment",
    "stage-10-player",
    "stage-10-near-victory",
    "stage-10-near-defeat",
    "stage-10-victory-ready",
    "stage-10-cleared",
    "stage-12-prebattle",
    "stage-12-deployment",
    "stage-12-opening",
    "stage-12-player",
    "stage-12-split",
    "stage-12-near-victory",
    "stage-12-near-defeat",
    "stage-12-victory-ready",
    "stage-12-cleared",
    "stage-13-prebattle",
    "stage-13-deployment",
    "stage-13-player",
    "stage-13-near-victory",
    "stage-13-near-defeat",
    "stage-13-victory-ready",
    "stage-13-cleared",
    "stage-14-deployment",
    "stage-14-opening",
    "stage-14-player",
    "stage-14-near-victory",
    "stage-14-near-defeat",
    "stage-14-victory-ready",
    "stage-14-cleared",
    "stage-15-deployment",
    "stage-15-opening",
    "stage-15-player",
    "stage-15-near-victory",
    "stage-15-near-defeat",
    "stage-15-victory-ready",
    "stage-15-cleared",
    "stage-16-deployment",
    "stage-16-opening",
    "stage-16-player",
    "stage-16-near-victory",
    "stage-16-near-defeat",
    "stage-16-victory-ready",
    "stage-16-cleared",
    "stage-17-deployment",
    "stage-17-opening",
    "stage-17-player",
    "stage-17-near-victory",
    "stage-17-near-defeat",
    "stage-17-victory-ready",
    "stage-17-cleared",
    "stage-18-deployment",
    "stage-18-opening",
    "stage-18-player",
    "stage-18-near-victory",
    "stage-18-near-defeat",
    "stage-18-victory-ready",
    "stage-18-cleared",
    "stage-19-deployment",
    "stage-19-opening",
    "stage-19-player",
    "stage-19-near-victory",
    "stage-19-near-defeat",
    "stage-19-victory-ready",
    "stage-19-cleared",
    "stage-21-prebattle",
    "stage-21-cleared",
    "stage-22-deployment",
    "stage-22-opening",
    "stage-22-player",
    "stage-22-near-victory",
    "stage-22-near-defeat",
    "stage-22-victory-ready",
    "stage-22-cleared",
    "stage-23-deployment",
    "stage-23-opening",
    "stage-23-player",
    "stage-23-near-victory",
    "stage-23-near-defeat",
    "stage-23-victory-ready",
    "stage-23-cleared",
    "stage-24-deployment",
    "stage-24-opening",
    "stage-24-player",
    "stage-24-near-victory",
    "stage-24-near-defeat",
    "stage-24-victory-ready",
    "stage-24-cleared",
    "stage-26-deployment",
    "stage-26-opening",
    "stage-26-player",
    "stage-26-enemy-tail",
    "stage-26-near-victory",
    "stage-26-near-defeat",
    "stage-26-victory-ready",
    "stage-26-cleared",
    "stage-28-prebattle",
    "stage-28-deployment",
    "stage-28-opening",
    "stage-28-player",
    "stage-28-near-victory",
    "stage-28-near-defeat",
    "stage-28-victory-ready",
    "stage-28-cleared",
    "stage-29-prebattle",
    "stage-29-deployment",
    "stage-29-player",
    "stage-29-near-victory",
    "stage-29-near-defeat",
    "stage-29-victory-ready",
    "stage-29-cleared",
    "stage-30-prebattle",
    "stage-30-player",
    "stage-30-near-victory",
    "stage-30-near-defeat",
    "stage-30-victory-ready",
    "stage-30-cleared",
  ]) {
    await expect(page.getByTestId(`debug-scenario-${scenarioId}`)).toBeVisible();
  }
  await expect(page.locator('[data-debug-stage-id="stage-28"] [data-debug-scenario-id]'))
    .toHaveCount(8);
  await expect(page.locator('[data-debug-stage-id="stage-29"] [data-debug-scenario-id]'))
    .toHaveCount(7);
  await expect(page.locator('[data-debug-stage-id="stage-30"] [data-debug-scenario-id]'))
    .toHaveCount(6);
  await expect(page.getByTestId("debug-scenario-stage-03-himi-defeat")).toContainText("希蜜戰敗");
  await expect(page.getByTestId("debug-scenario-stage-03-daisy-defeat")).toContainText("黛西戰敗");
  await captureVisualAudit(page.locator('[data-debug-stage-id="stage-03"]'), {
    path: `${ARTIFACT_DIR}/debug-stage3-dual-defeat-fixtures.png`,
  });
  const prebattleCard = page.getByTestId("debug-scenario-stage-00-prebattle");
  await expect(prebattleCard.locator(".debug-scenario-title")).toHaveText("關前劇情");
  await expect(prebattleCard.getByText("進入場景", { exact: true })).toHaveCount(0);
  const prebattleTooltip = prebattleCard.getByRole("tooltip");
  await expect(prebattleTooltip).toBeHidden();
  await prebattleCard.hover();
  await expect(prebattleTooltip).toBeVisible();
  await expect(prebattleTooltip).toContainText("SAY/0000 · 場景初態");
  await expect(prebattleTooltip).toContainText("保留劇情、腳本移動和開戰對白");
  await captureVisualAudit(page, {
    path: `${ARTIFACT_DIR}/debug-hub-compact-hover.png`,
  });
  expect(await page.evaluate(() => window.__ANGEL2_DEBUG__)).toBeUndefined();
  await expect(page.getByTestId("debug-technique-lab-link")).toHaveAttribute(
    "href",
    "/technique-lab.html",
  );
  const arenaLink = page.getByTestId("debug-arena-link");
  await expect(arenaLink).toHaveAttribute("href", "/arena.html");
  await expect(arenaLink).toContainText("正式規則與 AI");
  const classShowdownLink = page.getByTestId("debug-class-showdown-link");
  await expect(classShowdownLink).toHaveAttribute("href", "/class-showdown.html");
  await expect(classShowdownLink).toContainText("35 組同職業敵我相鄰");
  const promotionLabLink = page.getByTestId("debug-promotion-lab-link");
  await expect(promotionLabLink).toHaveAttribute("href", "/promotion-lab.html");
  await expect(promotionLabLink).toContainText("12 組可轉職來源職業只差 1 經驗");
  await expect(page.getByTestId("debug-roster-source")).toHaveValue("representative-growth");
  await expect(page.locator("[data-debug-roster-description]")).toContainText("合法轉職混編");
  await expect(page.getByTestId("debug-per-stage-growth")).toHaveValue("100");
  await expect(page.getByTestId("debug-growth-reset")).toHaveText("恢復預設（每關 100）");
  await expect(page.locator("[data-debug-growth-status]")).toHaveText(
    "目前使用預設：每關 +100（第 1 關預算 100／下一場「龍塔外」預算 1300）",
  );

  await page.getByTestId("debug-difficulty").selectOption("3");
  const deployment = page.getByTestId("debug-scenario-stage-01-deployment");
  await expect(deployment).toHaveAttribute(
    "href",
    "/?debugScenario=stage-01-deployment&difficulty=3&roster=representative-growth&growth=100",
  );
  await page.getByTestId("debug-per-stage-growth").fill("120");
  await page.getByTestId("debug-growth-apply").click();
  await expect(page.locator("[data-debug-growth-status]")).toHaveText(
    "已套用：每關 +120（第 1 關預算 120／下一場「龍塔外」預算 1560）",
  );
  await expect(deployment).toHaveAttribute(
    "href",
    "/?debugScenario=stage-01-deployment&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-05-player")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-05-player&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-06-player")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-06-player&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-07-player")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-07-player&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-08-player")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-08-player&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-09-player")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-09-player&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-11-player")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-11-player&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-10-player")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-10-player&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-21-prebattle")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-21-prebattle&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-22-player")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-22-player&difficulty=3&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("debug-scenario-stage-00-player")).toHaveAttribute(
    "href",
    "/?debugScenario=stage-00-player&difficulty=3&roster=representative-growth",
  );
  await page.getByTestId("debug-growth-reset").click();
  await expect(page.getByTestId("debug-per-stage-growth")).toHaveValue("100");
  await expect(page.locator("[data-debug-growth-status]")).toHaveText(
    "目前使用預設：每關 +100（第 1 關預算 100／下一場「龍塔外」預算 1300）",
  );
  await expect(deployment).toHaveAttribute(
    "href",
    "/?debugScenario=stage-01-deployment&difficulty=3&roster=representative-growth&growth=100",
  );
  await captureVisualAudit(page, { path: `${ARTIFACT_DIR}/debug-hub.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureVisualAudit(page.locator(".debug-options"), {
    path: `${ARTIFACT_DIR}/debug-growth-controls-narrow.png`,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await deployment.click();

  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 5／8");
  await expect(page.getByTestId("debug-toolbar")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText("成長：逐關代表性成長");
  await expect(page.getByTestId("debug-toolbar")).toContainText(
    "每關成長：100 · 本關成長預算：100",
  );
  const state = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    stageId: string;
    phase: string;
    difficulty: number;
    units: Array<{ id: string; classId: string; experience: number }>;
  });
  expect(state).toMatchObject({
    stageId: "stage-01",
    phase: "deployment",
    difficulty: 3,
  });
  expect(state.units).toContainEqual(expect.objectContaining({
    id: "1:0",
    classId: "cavalry",
    experience: 100,
  }));
  await captureVisualAudit(page, { path: `${ARTIFACT_DIR}/debug-stage1-deployment.png` });
});

test("one per-stage growth budget advances the stage-five profession", async ({ page }) => {
  await page.goto(
    "/?debugScenario=stage-05-player&difficulty=2&roster=representative-growth&growth=120",
  );
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText(
    "每關成長：120 · 本關成長預算：600",
  );
  const state = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    units: Array<{ id: string; classId: string; experience: number }>;
  });
  expect(state.units).toContainEqual(expect.objectContaining({
    id: "1:0",
    classId: "land-knight",
    experience: 140,
  }));
});

test("stage-eleven debug profiles preserve Sulanda's stage-eight cavalry baseline", async ({ page }) => {
  for (const query of [
    "roster=template-baseline",
    "roster=representative-growth",
    "roster=representative-growth&growth=120",
    "roster=promotion-coverage&growth=120",
  ]) {
    await page.goto(`/?debugScenario=stage-11-player&difficulty=2&${query}`);
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    const state = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
      units: Array<{ id: string; classId: string; experience: number; life: number }>;
    });
    expect(state.units, query).toContainEqual(expect.objectContaining({
      id: "1:8",
      classId: "cavalry",
      experience: 299,
      life: classStatsFor({ classId: "cavalry", experience: 299 }).maxLife,
    }));
  }
});

test("stage-twenty-seven debug entry uses the configured campaign professions", async ({ page }) => {
  await page.goto("/debug.html");
  await page.getByTestId("debug-difficulty").selectOption("2");
  const playerScenario = page.getByTestId("debug-scenario-stage-27-player");
  await expect(playerScenario).toHaveAttribute(
    "href",
    "/?debugScenario=stage-27-player&difficulty=2&roster=representative-growth&growth=100",
  );
  await playerScenario.click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText("成長：逐關代表性成長");
  await expect(page.getByTestId("debug-toolbar")).toContainText(
    "每關成長：100 · 本關成長預算：2600",
  );
  await expect(page.getByTestId("unit-detail")).toHaveAttribute("aria-label", /巨龍騎士妮雅/u);
  const state = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    units: Array<{ id: string; classId: string }>;
  });
  const classes = new Map(state.units.map(({ id, classId }) => [id, classId]));
  for (const id of ["1:0", "1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:12", "1:13", "1:14", "1:17", "1:18"]) {
    expect(classes.get(id), id).not.toBe("soldier");
  }
  expect(classes.get("1:7")).toBe("magic-priest");
  expect(classes.get("1:8")).toBe("cavalry");
  expect(classes.get("1:10")).toBe("water-warrior");
  expect(classes.get("1:11")).toBe("water-warrior");
  expect(classes.get("1:57")).toBe("engineer");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/debug-stage27-representative-growth.png`,
  });
});

test("stage-twenty-eight debug entry uses the configured campaign professions", async ({ page }) => {
  await page.goto("/debug.html");
  await page.getByTestId("debug-difficulty").selectOption("2");
  const playerScenario = page.getByTestId("debug-scenario-stage-28-player");
  await expect(playerScenario).toHaveAttribute(
    "href",
    "/?debugScenario=stage-28-player&difficulty=2&roster=representative-growth&growth=100",
  );
  await playerScenario.click();
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText("成長：逐關代表性成長");
  await expect(page.getByTestId("debug-toolbar")).toContainText(
    "每關成長：100 · 本關成長預算：2700",
  );
  await expect(page.getByTestId("unit-detail")).toHaveAttribute("aria-label", /巨龍騎士妮雅/u);
  const state = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    units: Array<{ id: string; side: number; classId: string }>;
  });
  expect(state.units.filter(({ side }) => side === 1)).toHaveLength(29);
  const classes = new Map(state.units.map(({ id, classId }) => [id, classId]));
  for (const id of ["1:0", "1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:12", "1:13", "1:14", "1:17", "1:18"]) {
    expect(classes.get(id), id).not.toBe("soldier");
  }
  expect(classes.get("1:7")).toBe("magic-priest");
  expect(classes.get("1:8")).toBe("cavalry");
  expect(classes.get("1:10")).toBe("water-warrior");
  expect(classes.get("1:11")).toBe("water-warrior");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/debug-stage28-representative-growth.png`,
  });
});

test("stage-twenty-nine debug deployment preserves the inherited great-axe defender", async ({ page }) => {
  await page.goto("/debug.html");
  await page.getByTestId("debug-difficulty").selectOption("2");
  const deploymentScenario = page.getByTestId("debug-scenario-stage-29-deployment");
  await expect(deploymentScenario).toHaveAttribute(
    "href",
    "/?debugScenario=stage-29-deployment&difficulty=2&roster=representative-growth&growth=100",
  );
  await deploymentScenario.click();
  await expect(page.getByTestId("deployment-screen")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText("成長：逐關代表性成長");
  await expect(page.getByTestId("debug-toolbar")).toContainText(
    "每關成長：100 · 本關成長預算：2800",
  );
  await page.getByTestId("deployment-page-1").click();
  await expect(page.getByTestId("deployment-roster-7")).toContainText("愛莉歐拉");
  await expect(page.getByTestId("deployment-roster-7")).toContainText("巨斧戰士");
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/debug-stage29-great-axe-roster.png`,
  });

  await page.goto(
    "/?debugScenario=stage-29-player&difficulty=2&roster=representative-growth&growth=100",
  );
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText("成長：逐關代表性成長");
  const battle = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    phase: string;
    units: Array<{ id: string; side: number; classId: string; name: string }>;
  });
  expect(battle.phase).toBe("player");
  expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(15);
  expect(battle.units).toContainEqual(expect.objectContaining({
    id: "1:22",
    classId: "great-axe-warrior",
    name: "愛莉歐拉",
  }));
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  // Slot 22 occupies the final configured deployment cell at (43,27). Focusing
  // its rendered piece proves the canvas projection keeps the named actor while
  // the profession and generic portrait continue to follow the current class.
  await page.getByTestId("battle-canvas").click({ position: { x: 340, y: 221 } });
  await expect(page.locator(".hud-identity-name")).toHaveText("巨斧戰士／愛莉歐拉");
  await page.getByTestId("battle-canvas").click({
    button: "right",
    position: { x: 340, y: 221 },
  });
  await expect(page.getByTestId("action-menu")).toBeHidden();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/debug-stage29-great-axe-battle.png`,
  });
});

test("stage-thirty debug entry preserves both growth profiles and the magic-sword defender", async ({ page }) => {
  for (const profile of ["representative-growth", "promotion-coverage"] as const) {
    const nia = debugRosterForProfile(profile, "stage-30", 100)[0]!;
    await page.goto(
      `/?debugScenario=stage-30-player&difficulty=2&roster=${profile}&growth=100`,
    );
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await expect(page.getByTestId("debug-toolbar")).toContainText(
      profile === "representative-growth" ? "成長：逐關代表性成長" : "成長：深層轉職分支覆蓋",
    );
    await expect(page.getByTestId("debug-toolbar")).toContainText(
      "每關成長：100 · 本關成長預算：2900",
    );
    await expect(page.locator(".hud-identity-name")).toHaveText(`${className(nia.classId)}／妮雅`);
    const battle = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
      phase: string;
      units: Array<{ id: string; side: number; classId: string; name: string }>;
    });
    expect(battle.phase).toBe("player");
    expect(battle.units.filter(({ side }) => side === 1)).toHaveLength(3);
    expect(battle.units).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "1:0", classId: nia.classId, name: "妮雅" }),
      expect.objectContaining({ id: "1:7", classId: "magic-priest", name: "琴斯" }),
      expect.objectContaining({ id: "1:40", classId: "magic-sword-warrior" }),
      expect.objectContaining({ id: "2:27", classId: "soldier", name: "維絲塔" }),
    ]));
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await captureVisualAudit(page.getByTestId("game-screen"), {
      path: `${ARTIFACT_DIR}/debug-stage30-${profile}.png`,
    });
  }
});

test("stage-four debug profiles cover inherited multi-promotion rosters", async ({ page }) => {
  await page.goto(
    "/?debugScenario=stage-04-player&difficulty=2&roster=promotion-coverage&test=1",
  );
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText("成長：深層轉職分支覆蓋");
  const state = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    units: Array<{ id: string; classId: string }>;
  });
  expect(state.units.filter(({ id }) => id.startsWith("1:"))).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:0", classId: "swift-dragon-knight" }),
    expect.objectContaining({ id: "1:1", classId: "magic-priest" }),
    expect.objectContaining({ id: "1:2", classId: "crossbow" }),
    expect.objectContaining({ id: "1:3", classId: "magic-armor-warrior" }),
    expect.objectContaining({ id: "1:4", classId: "prayer-guide" }),
    expect.objectContaining({ id: "1:20", classId: "flying-dragon-knight" }),
    expect.objectContaining({ id: "1:21", classId: "evil-sword-warrior" }),
    expect.objectContaining({ id: "1:24", classId: "wizard" }),
  ]));
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/debug-stage4-promotion-coverage.png`,
  });
});

test("debug hub imports a formal save roster read-only", async ({ page }) => {
  const experience = 321;
  const classId = "swift-dragon-knight" as const;
  const save: CompletedSaveData = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2026-08-04T12:00:00.000Z",
    saveCount: 2,
    stageId: "stage-04",
    stageLabel: "通過力場",
    ruleset: "stableRemake",
    difficulty: 1,
    rngState: 0x1234_5678,
    rngCalls: 42,
    roster: completeCampaignRoster([{
      slot: 0,
      classId,
      experience,
      life: classStatsFor({ classId, experience }).maxLife,
    }]),
    stageProgress: 1000,
    consumedEventIds: [
      "stage-03-opening-story",
      "stage-03-boss-defeated",
      "stage-03-victory-story",
      "stage-03-completed-route",
    ],
  };
  const serialized = JSON.stringify(save);

  await page.goto("/debug.html");
  await page.evaluate((value) => localStorage.setItem("angel2.save.1", value), serialized);
  await page.reload();
  await expect(page.getByTestId("debug-roster-source").locator("option[value='save-1-current']"))
    .toHaveText("記錄 1 · 通過力場 · 完成名單");
  await page.getByTestId("debug-roster-source").selectOption("save-1-current");
  await page.getByTestId("debug-difficulty").selectOption("3");
  const player = page.getByTestId("debug-scenario-stage-04-player");
  await expect(player).toHaveAttribute(
    "href",
    "/?debugScenario=stage-04-player&difficulty=3&roster=save-1-current",
  );
  await player.click();

  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText(
    "成長：記錄 1 · 通過力場 · 完成名單",
  );
  const state = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    difficulty: number;
    units: Array<{ id: string; classId: string; experience: number }>;
  });
  expect(state.difficulty).toBe(3);
  expect(state.units).toContainEqual(expect.objectContaining({
    id: "1:0",
    classId,
    experience,
  }));
  expect(await page.evaluate(() => localStorage.getItem("angel2.save.1"))).toBe(serialized);
});

test("debug scenarios can enter player phases and directly complete either implemented stage", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=2");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("debug-toolbar")).toContainText("第 0 關");
  await page.getByRole("button", { name: "直接通關" }).click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "4");
  await expect(page.getByTestId("debug-toolbar")).toContainText("第 1 關 · 騎士城堡前");
  await expect(page.getByTestId("debug-toolbar")).toContainText("stage-01 · prebattleStory");

  await page.goto("/?debugScenario=stage-01-player&difficulty=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  const player = await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    stageId: string;
    phase: string;
    units: Array<{ id: string; classId: string }>;
  });
  expect(player).toMatchObject({ stageId: "stage-01", phase: "player" });
  expect(player.units).toContainEqual(expect.objectContaining({ id: "1:24", classId: "magician" }));

  await page.getByRole("button", { name: "直接通關" }).click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "155");
  await expect(page.getByTestId("debug-toolbar")).toContainText("第 2 關 · 攻打騎士堡");
  await expect(page.getByTestId("debug-toolbar")).toContainText("stage-02 · openingStory");
  expect((await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    stageProgress: number;
    campaignRoute?: string;
    stageId: string;
  }))).toMatchObject({ stageId: "stage-02", campaignRoute: "stage-02" });

  await page.goto("/?debugScenario=stage-02-player&difficulty=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.getByRole("button", { name: "直接通關" }).click();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "12");
  await expect(page.getByTestId("debug-toolbar")).toContainText("第 3 關 · 救援友軍");
  await expect(page.getByTestId("debug-toolbar")).toContainText("stage-03 · openingStory");
  expect((await page.evaluate(() => window.__ANGEL2_DEBUG__?.getState() as {
    stageProgress: number;
    campaignRoute?: string;
    stageId: string;
  }))).toMatchObject({ stageId: "stage-03", campaignRoute: "stage-03" });
});

test("a completed stage-three save enters the playable stage-four prebattle", async ({ page }) => {
  await page.goto("/?debugScenario=stage-03-cleared&difficulty=0");
  await expect(page.getByRole("heading", { name: /通過力場/u })).toBeVisible();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "7");
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map(({ name }) => name));
  expect(resources.some((url) => url.includes("stage4-map.png"))).toBe(true);
});

test("the magician outer-ring fixture pushes once and releases after one enemy phase", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-magician&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const debugState = () => page.evaluate(() => window.__ANGEL2__?.getState() as {
    phase: string;
    round: number;
    units: Array<{
      id: string;
      x: number;
      y: number;
      actionDisabled: boolean;
    }>;
    enemyIntents: Record<string, string>;
    rngCalls: number;
    lastSpecialAction?: {
      actionId: string;
      experienceGained: number;
      affectedUnits: Array<{ unitId: string; moved: boolean }>;
    };
    specialActionPresentation?: object;
  });
  const finishPlayerPhase = async (round: number) => {
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("group-command-menu")).toBeVisible();
    await page.getByTestId("group-command-allRest").click();
    await expect(page.getByTestId("dialogue-layer")).toBeVisible();
    for (let input = 0; input < 6; input += 1) {
      const dialogue = page.getByTestId("dialogue-layer");
      if (!await dialogue.isVisible()
        || await dialogue.getAttribute("data-source-record") !== "battle-command") break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(20);
    }
    await page.waitForFunction((expectedRound) => {
      const current = window.__ANGEL2__?.getState() as {
        phase?: string;
        round?: number;
      } | undefined;
      return current?.phase === "player" && current.round === expectedRound;
    }, round);
  };

  const initial = await debugState();
  const initialTarget = initial.units.find(({ id }) => id === "2:45");
  expect(initial.enemyIntents).toMatchObject({ "2:45": "pursuit", "2:16": "sentry" });
  expect(initial.units.filter(({ id }) => id.startsWith("2:")).map(({ id }) => id).sort())
    .toEqual(["2:16", "2:45"]);

  await page.keyboard.press("Space");
  await expect(page.getByTestId("unit-command-technique")).toBeVisible();
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-1").click();
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as {
      lastSpecialAction?: { actionId?: string };
      specialActionPresentation?: object;
    } | undefined;
    return current?.lastSpecialAction?.actionId === "ice-1"
      && current.specialActionPresentation === undefined;
  });

  const frozen = await debugState();
  const frozenTarget = frozen.units.find(({ id }) => id === "2:45");
  expect(frozenTarget).toMatchObject({
    x: initialTarget?.x,
    y: (initialTarget?.y ?? 0) + 1,
    actionDisabled: true,
  });
  expect(frozen.lastSpecialAction).toMatchObject({
    actionId: "ice-1",
    experienceGained: 8,
    affectedUnits: [expect.objectContaining({ unitId: "2:45", moved: true })],
  });
  expect(frozen.rngCalls).toBe(initial.rngCalls + 1);
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-ice-disabled-unit-ids",
    /2:45/u,
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/debug-stage1-magician-frozen.png`,
  });

  await finishPlayerPhase(2);
  const thawed = await debugState();
  const thawedTarget = thawed.units.find(({ id }) => id === "2:45");
  expect(thawedTarget).toMatchObject({
    x: frozenTarget?.x,
    y: frozenTarget?.y,
    actionDisabled: false,
  });

  await finishPlayerPhase(3);
  const movedTarget = (await debugState()).units.find(({ id }) => id === "2:45");
  expect(movedTarget).toBeDefined();
  expect({ x: movedTarget?.x, y: movedTarget?.y })
    .not.toEqual({ x: thawedTarget?.x, y: thawedTarget?.y });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/debug-stage1-magician-thawed.png`,
  });
});

test("dispel uses its original map animation and releases a frozen ally", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-dispel&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  const frozenTargetId = await page.evaluate(() => {
    const state = window.__ANGEL2__?.getState() as {
      units: Array<{ id: string; actionDisabled: boolean }>;
    };
    return state.units.find(({ actionDisabled }) => actionDisabled)?.id;
  });
  if (!frozenTargetId) throw new Error("dispel fixture is missing its frozen ally");
  await expect(canvas).toHaveAttribute("data-ice-disabled-unit-ids", frozenTargetId);

  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-dispel")).toHaveText("破邪");
  await page.getByTestId("technique-dispel").click();
  await canvas.click({ position: { x: 260, y: 177 } });

  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return element?.dataset.mapCombatPhase === "dispelEffect"
      && Number(element.dataset.mapCombatFrame) >= 20;
  });
  await expect(canvas).toHaveAttribute("data-ice-disabled-unit-ids", frozenTargetId);
  await expect(canvas).not.toHaveAttribute("data-map-combat-effect-tile-count", "0");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/debug-stage1-dispel-animation.png`,
  });

  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as {
      lastSpecialAction?: { actionId?: string };
      specialActionPresentation?: object;
    } | undefined;
    return current?.lastSpecialAction?.actionId === "dispel"
      && current.specialActionPresentation === undefined;
  });
  const state = await page.evaluate(() => window.__ANGEL2__?.getState() as {
    units: Array<{
      id: string;
      acted: boolean;
      actionDisabled: boolean;
      statuses: Record<string, number>;
    }>;
  });
  expect(state.units.find(({ id }) => id === frozenTargetId)).toMatchObject({
    acted: false,
    actionDisabled: false,
    statuses: {
      attackDown: 0,
      defenseDown: 0,
      confusion: 0,
      poison: 0,
      techniqueSeal: 0,
    },
  });
  await expect(canvas).not.toHaveAttribute("data-ice-disabled-unit-ids", frozenTargetId);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/debug-stage1-dispel-result.png`,
  });
});

test("debug hub remains usable at a narrow reduced-motion viewport", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/debug.html");
  await expect(page.getByTestId("debug-hub")).toBeVisible();
  await expect(page.getByTestId("debug-scenario-stage-01-near-victory")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureVisualAudit(page, { path: `${ARTIFACT_DIR}/debug-hub-narrow.png`, fullPage: true });
});

test("stage-one dialogue uses generated animation layers for its portrait records", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-prebattle&difficulty=0&test=1");
  for (let input = 0; input < 8; input += 1) {
    if (await page.locator('[data-portrait-record="42"]:visible').count() > 0) break;
    await page.getByTestId("dialogue-layer").click();
    await page.waitForTimeout(30);
  }
  const portrait = page.locator('[data-portrait-record="42"]:visible');
  await expect(portrait).toHaveAttribute("data-portrait-record", "42");
  await expect(portrait.locator(".portrait-eye")).toHaveCount(3);
  await expect(portrait.locator(".portrait-mouth")).toHaveCount(3);
  await expect.poll(async () => Number(await portrait.getAttribute("data-talk-count"))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await portrait.getAttribute("data-blink-count"))).toBeGreaterThan(0);
  await portrait.evaluate((element) => {
    element.dataset.forceBlinkFrame = "3";
    element.dataset.forceMouthFrame = "2";
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage1-dialogue-mengxinman-animation.png`,
  });
});
