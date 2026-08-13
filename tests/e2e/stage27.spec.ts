import { expect, test, type Page } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage27State {
  stageId: string;
  stageProgress: number;
  phase: string;
  round: number;
  activeStoryId?: string;
  focusId: string;
  statusMessage: string;
  campaignRoute?: string;
  cameraOrigin: { x: number; y: number };
  consumedEventIds: string[];
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    name: string;
    portrait: number;
    x: number;
    y: number;
    life: number;
    acted: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage27State,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage27State | undefined)?.phase === expected,
  phase,
);

const settleBattleCanvas = async (page: Page) => {
  await expect(page.getByTestId("battle-canvas")).toHaveAttribute(
    "data-unit-life-label-count",
    /^\d+$/u,
  );
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
};

async function clickCell(page: Page, x: number, y: number): Promise<void> {
  const current = await state(page);
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

test("S27-A/B: stage 26 completion opens the 11–31 Valkyrie return deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-26-cleared&difficulty=0&test=1");
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "趕回瓦爾克麗城 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 11／31");
  await expect(page.locator(".deployment-open-cell")).toHaveCount(20);
  await expect(page.getByTestId("deployment-minimap")).toBeVisible();
  await expect(page.getByTestId("deployment-guidance")).toContainText("不列入名單");
  await expect(page.getByTestId("deployment-guidance")).toContainText("不必全滅叛軍");
  const visibleRosterSlots = async () => page.locator(
    ".deployment-entry:not(.is-empty)",
  ).evaluateAll((entries) => entries.map((entry) => Number((entry as HTMLElement).dataset.unitSlot)));
  expect(await visibleRosterSlots()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  await expect(page.getByTestId("deployment-roster-0")).toContainText("妮雅");
  await expect(page.getByTestId("deployment-roster-0")).toContainText("固定");
  await page.getByTestId("deployment-page-1").click();
  expect(await visibleRosterSlots()).toEqual([15, 16, 17, 18, 19, 20, 21, 25, 26, 27, 28, 29, 30, 31]);
  await page.getByTestId("deployment-page-2").click();
  expect(await visibleRosterSlots()).toEqual([]);
  await page.getByTestId("deployment-page-0").click();
  expect(await state(page)).toMatchObject({
    stageId: "stage-27",
    phase: "deployment",
    campaignRoute: "stage-27",
    consumedEventIds: ["stage-27-enter-deployment"],
  });
  await captureVisualAudit(page.getByTestId("deployment-screen"), {
    path: `${ARTIFACT_DIR}/stage27-deployment.png`,
  });
});

test("S27-C–E: opening story preserves the mixed 31-allied-unit force and five rebels", async ({ page }) => {
  await page.goto("/?debugScenario=stage-27-opening&difficulty=0&test=1");
  await waitForPhase(page, "openingStory");
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toHaveAttribute("data-source-record", "51");
  await expect(dialogue).toContainText("女帝");
  const opening = await state(page);
  expect(opening.units.filter(({ side }) => side === 1)).toHaveLength(31);
  expect(opening.units.filter(({ side }) => side === 2)).toHaveLength(5);
  expect(opening.units).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "1:22", name: "愛莉歐拉", classId: "great-axe-warrior", x: 20, y: 11 }),
    expect.objectContaining({ id: "1:57", classId: "engineer", x: 35, y: 35 }),
    expect.objectContaining({ id: "1:0", name: "妮雅", x: 39, y: 37 }),
    expect.objectContaining({ id: "2:40", classId: "magic-sword-warrior", x: 33, y: 11 }),
    expect.objectContaining({ id: "2:42", classId: "curse-master", x: 16, y: 22 }),
  ]));
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage27-opening-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "player");
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」回到瓦爾克麗城");
  await expect(page.getByTestId("objective-panel")).toContainText("「妮雅」戰敗");
  await expect(page.getByTestId("objective-panel")).not.toContainText("打敗所有");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage27-objective-and-map.png`,
  });
});

test("S27-F/REMAKE-064: seven city defenders act as independent allied AI", async ({ page }) => {
  await page.goto("/?debugScenario=stage-27-ally-auto&difficulty=0&test=1&slowMap=1");
  await waitForPhase(page, "player");
  const before = await state(page);
  const defenderIds = ["1:22", "1:41", "1:44", "1:43", "1:45", "1:42", "1:40"];
  expect(before.units.filter(({ id }) => defenderIds.includes(id))).toHaveLength(7);
  expect(before.units.filter(({ side, id, acted }) => side === 1 && !defenderIds.includes(id) && acted))
    .toHaveLength(24);

  await page.keyboard.press("Tab");
  await page.getByTestId("group-command-allRest").click();
  await page.getByTestId("dialogue-layer").click();
  await waitForPhase(page, "allyAuto");
  await expect.poll(async () => {
    const current = await state(page);
    return current.units.filter(({ id, acted }) => defenderIds.includes(id) && acted).length;
  }).toBeGreaterThan(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage27-independent-allies.png`,
  });
});

test("S27-K: engineers pave and barricade with the original stage 27 tiles", async ({ page }) => {
  const failedAssets: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Failed to process file")) {
      failedAssets.push(message.text());
    }
  });
  await page.goto("/?debugScenario=stage-27-player&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-terrain-override-count", "0");

  await clickCell(page, 35, 35);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-iron-plate")).toContainText("鐵板");
  await expect(page.getByTestId("technique-obstacle")).toContainText("障礙");
  await page.getByTestId("technique-obstacle").click();
  await expect(page.getByTestId("status-strip")).toContainText("設置障礙");
  await page.keyboard.press("Delete");
  await page.getByTestId("technique-iron-plate").click();
  await expect(page.getByTestId("status-strip")).toContainText("鋪設鐵板");

  // (35,33) sits on logical slot 7, which only the engineer can enter, so its
  // four neighbours become iron plate the rest of the army can cross.
  await clickCell(page, 35, 33);
  await expect(canvas).toHaveAttribute(
    "data-terrain-overrides",
    "35,32:iron-plate|34,33:iron-plate|36,33:iron-plate|35,34:iron-plate",
  );
  expect((await state(page)).units.find(({ id }) => id === "1:57"))
    .toMatchObject({ x: 35, y: 33, acted: true });
  await clickCell(page, 35, 32);
  await expect(page.getByTestId("terrain-name")).toHaveText("鐵板");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage27-iron-plate-terrain.png`,
  });
  await page.getByTestId("close-terrain-detail").click();
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage27-iron-plate.png`,
  });

  await clickCell(page, 38, 35);
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-obstacle").click();
  await clickCell(page, 38, 34);
  await expect(canvas).toHaveAttribute(
    "data-terrain-overrides",
    "35,32:iron-plate|34,33:iron-plate|36,33:iron-plate|38,33:obstacle"
    + "|35,34:iron-plate|37,34:obstacle|39,34:obstacle|38,35:obstacle",
  );
  await clickCell(page, 38, 33);
  await expect(page.getByTestId("terrain-name")).toHaveText("障礙");
  await page.getByTestId("close-terrain-detail").click();
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage27-obstacle.png`,
  });
  // A missing tile resolves to the SPA HTML fallback instead of a 404, so the
  // only signal is Phaser refusing to decode it.
  expect(failedAssets).toEqual([]);
});

test("S27-G: one move into the exact city range starts SAY/0052 with all rebels alive", async ({ page }) => {
  await page.goto("/?debugScenario=stage-27-near-victory&difficulty=0&test=1");
  await waitForPhase(page, "player");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toHaveAttribute("data-objective-destination-cell-count", "606");
  await expect(canvas).toHaveAttribute(
    "data-objective-destination-style",
    "soft-magenta-fill-inset-outline",
  );
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(5);

  await clickCell(page, 20, 15);
  await page.getByTestId("unit-command-move").click();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage27-destination-highlight.png`,
  });
  await clickCell(page, 20, 14);
  await expect(page.getByTestId("unit-command-end")).toBeVisible();
  await page.getByTestId("unit-command-end").click();
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "52");
  const victory = await state(page);
  expect(victory.units.find(({ id }) => id === "1:0")).toMatchObject({ x: 20, y: 14 });
  expect(victory.units.filter(({ side }) => side === 2)).toHaveLength(5);
});

test("S27-H: Nia defeat returns directly to the same deployment", async ({ page }) => {
  await page.goto("/?debugScenario=stage-27-near-defeat&difficulty=0&test=1");
  await waitForPhase(page, "player");
  await page.getByRole("button", { name: "戰敗測試" }).click();
  await waitForPhase(page, "defeat");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage27-defeat.png`,
  });

  await page.getByTestId("retry-button").click();
  if ((await state(page)).phase === "defeat") await page.getByTestId("retry-button").click();
  await waitForPhase(page, "deployment");
  await expect(page.getByRole("heading", { name: "趕回瓦爾克麗城 · 出擊準備" })).toBeVisible();
  await expect(page.getByTestId("deployment-summary")).toContainText("已出場 11／31");
  expect(await state(page)).toMatchObject({
    stageId: "stage-27",
    phase: "deployment",
    campaignRoute: "stage-27",
    consumedEventIds: ["stage-27-enter-deployment"],
  });
});

test("S27-I/J: victory story saves the frozen stage-28 boundary", async ({ page }) => {
  await page.goto("/?debugScenario=stage-27-victory-ready&difficulty=0&test=1");
  await waitForPhase(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "52");
  expect((await state(page)).units.filter(({ side }) => side === 2)).toHaveLength(5);
  await settleBattleCanvas(page);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage27-victory-story.png`,
  });

  await skipStoryDialogue(page);
  await waitForPhase(page, "victoryFeedback");
  await expect(page.getByTestId("status-strip")).toContainText("妮雅已回到瓦爾克麗城");
  await page.getByTestId("victory-continue").click();
  if ((await state(page)).phase === "victoryFeedback") await page.getByTestId("victory-continue").click();
  await waitForPhase(page, "savePrompt");
  await page.getByTestId("save-yes").click();
  await page.getByTestId("save-slot-1").click();
  await waitForPhase(page, "nextStage");

  const completedSave = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("angel2.save.1") ?? "null") as {
      version: number;
      contentVersion: string;
      kind: string;
      stageId: string;
      stageLabel: string;
      stageProgress: number;
      consumedEventIds: string[];
    });
  expect(completedSave).toMatchObject({
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    stageId: "stage-28",
    stageLabel: "保衛瓦爾克麗城",
    stageProgress: 1000,
    consumedEventIds: [
      "stage-27-enter-deployment",
      "stage-27-opening-story",
      "stage-27-objective-reached",
      "stage-27-victory-story",
      "stage-27-completed-route",
    ],
  });
  expect(await state(page)).toMatchObject({
    stageId: "stage-27",
    stageProgress: 1000,
    phase: "nextStage",
    campaignRoute: "stage-28",
  });
});
