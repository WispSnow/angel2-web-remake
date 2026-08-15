import { expect, test, type Page } from "@playwright/test";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../src/game/save";
import type { CompletedSaveData } from "../../src/game/types";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface EndingState {
  phase: string;
  campaignRoute?: string;
  stage49Ending?: {
    section: string;
    index: number;
    saveCount: number;
    recordTotal: number;
    dominantClassFamily: string;
  };
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as EndingState,
);

const waitForEnding = (page: Page, section: string, index?: number) => page.waitForFunction(
  ({ expectedSection, expectedIndex }) => {
    const ending = (window.__ANGEL2__?.getState() as EndingState | undefined)?.stage49Ending;
    return ending?.section === expectedSection
      && (expectedIndex === undefined || ending.index === expectedIndex);
  },
  { expectedSection: section, expectedIndex: index },
);

async function advance(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page.getByTestId("ending-advance").click();
  }
}

test("S49-A–D: main ending plays story, roster, conditional epilogue, then stops before hidden stage 38", async ({ page }) => {
  await page.goto("/?debugScenario=stage-37-cleared&difficulty=0&test=1");
  await expect(page.getByTestId("start-stage49-ending")).toBeVisible();
  await page.getByTestId("start-stage49-ending").click();
  await waitForEnding(page, "story", 0);

  expect(await state(page)).toMatchObject({
    phase: "ending",
    campaignRoute: "stage-49",
    stage49Ending: { section: "story", index: 0, saveCount: 1, recordTotal: 0 },
  });
  await expect(page.getByTestId("stage49-story")).toContainText("恭禧妳！妮雅");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MAGIC/77");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-story.png`,
  });

  await advance(page, 17);
  await waitForEnding(page, "roster", 0);
  await expect(page.getByTestId("stage49-roster")).toContainText("妮雅");
  // Native card field is 兵種 with 戰績：00000 人.
  await expect(page.getByTestId("stage49-roster")).toContainText("兵種");
  await expect(page.getByTestId("stage49-record")).toHaveText("00000 人");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "UN/6");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-roster.png`,
  });

  await advance(page, 22);
  await waitForEnding(page, "epilogue", 0);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute(
    "data-segment",
    "dominantClassFamily",
  );
  // Native module 35 starts the record-total branch track before segment 1, so
  // the whole epilogue plays over it rather than switching at segment 4.
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MUSIC/40");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-epilogue-class-family.png`,
  });

  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "epilogue", 1);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute(
    "data-segment",
    "warriorStatue",
  );
  await expect(page.getByTestId("stage49-epilogue")).toContainText("興建了一座戰士雕像");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MUSIC/40");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-epilogue-warrior-statue.png`,
  });

  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "epilogue", 2);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute("data-selector", "1");
  await expect(page.getByTestId("stage49-epilogue")).toContainText("神將官");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MUSIC/40");
  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "epilogue", 3);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute("data-selector", "0");
  await expect(page.getByTestId("stage49-epilogue")).toContainText("歷久不衰");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MUSIC/40");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-epilogue-prosperous.png`,
  });

  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "stage38-boundary", 0);
  expect(await state(page)).toMatchObject({
    phase: "ending",
    campaignRoute: "stage-38",
    stage49Ending: { section: "stage38-boundary" },
  });
  await expect(page.getByTestId("stage38-boundary")).toContainText("製作人員表仍在設計凍結範圍內");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "none");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-stage38-boundary.png`,
  });

  // The boundary is terminal while stage 38 stays frozen: further input must
  // not advance past it or re-emit the same state.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  expect(await state(page)).toMatchObject({
    campaignRoute: "stage-38",
    stage49Ending: { section: "stage38-boundary", index: 0 },
  });
});

test("S49-E: a loaded stage-49 completed save reaches the same main-ending entry with its own records", async ({ page }) => {
  const recordCounters = Array<number>(75).fill(0);
  recordCounters[0] = 60;
  recordCounters[1] = 41;
  const save = {
    format: "ANGEL2-web-save",
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    kind: "completed",
    savedAt: "2026-08-14T12:00:00.000Z",
    saveCount: 101,
    stageId: "stage-49",
    stageLabel: "主線結局",
    ruleset: "stableRemake",
    difficulty: 0,
    rngState: 0x1234_5678,
    rngCalls: 49,
    roster: completeCampaignRoster([]),
    recordCounters,
    stageProgress: 1000,
    consumedEventIds: [
      "stage-37-enter-deployment",
      "stage-37-opening-story",
      "stage-37-objective-reached",
      "stage-37-completed-route",
    ],
  } satisfies CompletedSaveData;

  await page.goto("/?test=1");
  await page.evaluate((value) => localStorage.setItem("angel2.save.1", value), JSON.stringify(save));
  await page.reload();
  // Load it the way a player does: skip the opening, 繼續遊戲, pick record 1.
  await page.keyboard.press("x");
  await page.getByTestId("continue-game").click();
  await page.getByTestId("title-record-slot-1").click();
  await expect(page.getByTestId("start-stage49-ending")).toBeVisible();
  await page.getByTestId("start-stage49-ending").click();
  await waitForEnding(page, "story", 0);

  // saveCount 101 (> 100) and record total 101 (> 100) pick the opposite
  // branch from the fresh-clear run above.
  expect(await state(page)).toMatchObject({
    phase: "ending",
    stage49Ending: { saveCount: 101, recordTotal: 101 },
  });
  await advance(page, 17);
  await waitForEnding(page, "roster", 0);
  await expect(page.getByTestId("stage49-record")).toHaveText("00060 人");

  await advance(page, 22);
  await waitForEnding(page, "epilogue", 0);
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "UN/49");
  await advance(page, 2);
  await waitForEnding(page, "epilogue", 2);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute("data-selector", "0");
  await expect(page.getByTestId("stage49-epilogue")).toContainText("重新舉行登基大典");
  await page.getByTestId("ending-advance").click();
  await waitForEnding(page, "epilogue", 3);
  await expect(page.getByTestId("stage49-epilogue")).toHaveAttribute("data-selector", "1");
  await expect(page.getByTestId("stage49-epilogue")).toContainText("結束了輝煌的傳奇霸業");
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "UN/49");
  await captureVisualAudit(page.getByTestId("ending-advance"), {
    path: `${ARTIFACT_DIR}/stage49-epilogue-decline.png`,
  });
});
