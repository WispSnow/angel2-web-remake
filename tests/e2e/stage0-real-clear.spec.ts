import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

async function waitForPlayerOrStory(page: Page): Promise<"player" | "story"> {
  return page.waitForFunction(() => {
    const dialogue = document.querySelector<HTMLElement>("[data-testid=dialogue-layer]");
    if (dialogue && !dialogue.hidden) return "story";
    const system = document.querySelector<HTMLElement>("[data-testid=system-menu-button]");
    if (system && getComputedStyle(system).display !== "none") return "player";
    return false;
  }, undefined, { timeout: 90_000 }).then((handle) => handle.jsonValue() as Promise<"player" | "story">);
}

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("S00-O: a normal build clears stage zero through player-visible controls only", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  expect(new URL(page.url()).search).toBe("");
  expect(await page.evaluate(() => "__ANGEL2__" in window)).toBe(false);

  await expect(page.getByTestId("opening-intro")).toBeVisible();
  await page.keyboard.press("x");
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("difficulty-menu")).toBeVisible();
  await page.keyboard.press("Enter");

  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toHaveAttribute("data-source-record", "0");
  await page.getByTestId("skip-dialogue").click();
  await expect(dialogue).toBeHidden();
  await expect(dialogue).toBeVisible({ timeout: 10_000 });
  await expect(dialogue).toHaveAttribute("data-source-record", "1");
  await page.getByTestId("skip-dialogue").click();
  await expect(page.getByTestId("system-menu-button")).toBeVisible();

  // Use the shipping settings surface to speed up presentation. This changes
  // only timing; the simulation and enemy route are the normal production path.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await page.getByTestId("system-command-settings").click();
  await page.getByTestId("speed-button").click();
  await expect(page.getByTestId("speed-button")).toHaveText("動畫 ×4");
  await page.locator("[data-action=close-settings]").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeHidden();

  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage0-real-player-start.png`,
  });

  let reachedVictoryStory = false;
  let capturedRoundTwo = false;
  for (let round = 1; round <= 18; round += 1) {
    await expect(page.getByTestId("all-rest-hotspot")).toBeVisible();
    await page.getByTestId("all-rest-hotspot").click();
    await expect(page.getByTestId("system-menu-button")).toBeHidden();

    const state = await waitForPlayerOrStory(page);
    if (state === "player") continue;

    const record = await dialogue.getAttribute("data-source-record");
    if (record === "3") {
      reachedVictoryStory = true;
      break;
    }
    expect(record).toBe("2");
    if (!capturedRoundTwo) {
      await page.getByTestId("advance-dialogue").click();
      await page.getByTestId("game-screen").screenshot({
        path: `${ARTIFACT_DIR}/stage0-real-round2-story.png`,
      });
      capturedRoundTwo = true;
    }
    await page.getByTestId("skip-dialogue").click();
    await expect(page.getByTestId("system-menu-button")).toBeVisible();
  }

  expect(reachedVictoryStory).toBe(true);
  await expect(dialogue).toHaveAttribute("data-source-record", "3");
  await page.getByTestId("advance-dialogue").click();
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage0-real-victory-story.png`,
  });

  await page.getByTestId("skip-dialogue").click();
  await expect(page.getByTestId("victory-continue")).toBeVisible();
  await page.getByTestId("victory-continue").click();
  await expect(page.getByTestId("feedback-text")).toHaveText(
    "哦！．．\n這次的戰役結束了，是否要記錄下來．",
  );
  await page.getByTestId("game-screen").screenshot({
    path: `${ARTIFACT_DIR}/stage0-real-victory-feedback.png`,
  });
  await page.getByTestId("victory-continue").click();
  await expect(page.getByRole("menu", { name: "是否儲存" })).toBeVisible();
  await page.locator("[data-action=save-no]").click();

  await expect(page.getByTestId("quit-screen")).toHaveCount(0);
  await expect(page.getByText("下一關路由已建立", { exact: true })).toBeVisible();
  await expect(page.getByTestId("game-screen")).toHaveScreenshot("stage0-real-clear-next-stage.png", {
    animations: "disabled",
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
