import { expect, test, type Page } from "@playwright/test";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

async function waitForPlayerOrStory(page: Page): Promise<"player" | "story"> {
  return page.waitForFunction(() => {
    const dialogue = document.querySelector<HTMLElement>("[data-testid=dialogue-layer]");
    if (dialogue && !dialogue.hidden) return "story";
    const screen = document.querySelector<HTMLElement>("[data-testid=game-screen]");
    if (screen?.dataset.phase === "player") return "player";
    return false;
  }, undefined, { timeout: 90_000 }).then((handle) => handle.jsonValue() as Promise<"player" | "story">);
}

test("S00-O: a normal build clears stage zero and reaches stage one through player-visible controls only", async ({ page }) => {
  test.setTimeout(180_000);
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
  await skipStoryDialogue(page);
  await expect(dialogue).toBeHidden();
  await expect(dialogue).toBeVisible({ timeout: 10_000 });
  await expect(dialogue).toHaveAttribute("data-source-record", "1");
  await skipStoryDialogue(page);

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

  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage0-real-player-start.png`,
  });

  let reachedVictoryStory = false;
  let capturedRoundTwo = false;
  for (let round = 1; round <= 18; round += 1) {
    if (round === 1) {
      // Move the visible focus to empty ground, close the remake terrain card,
      // verify the shipping map menu retains Nia as the command leader, then
      // use the shipping shoe hotspot instead of a debug action.
      await page.getByTestId("battle-canvas").click({ position: { x: 420, y: 45 } });
      await expect(page.getByTestId("terrain-detail")).toBeVisible();
      await page.getByTestId("close-terrain-detail").click();
      await expect(page.getByTestId("game-screen")).toHaveAttribute("data-side-panel-hotspots", "active");
      await page.getByTestId("group-command-hotspot").click();
      await expect(page.getByTestId("group-command-followLeader")).toBeEnabled();
      await captureVisualAudit(page.getByTestId("game-screen"), {
        path: `${ARTIFACT_DIR}/stage0-real-follow-leader-hotspot-menu.png`,
      });
      await page.keyboard.press("Tab");
      await expect(page.getByTestId("group-command-menu")).toBeHidden();
      await page.getByTestId("all-rest-hotspot").click();
    } else {
      await page.keyboard.press("F1");
    }

    await expect(dialogue).toBeVisible();
    await expect(dialogue).toHaveAttribute("data-source-record", "battle-command");
    await expect(dialogue).toHaveAttribute("data-source-address", "DS:86E4");
    await page.getByTestId("dialogue-layer").click();
    if (round === 1) {
      await expect(page.getByTestId("dialogue-window-upper")).toContainText(
        "大家聽著！\n所有還未行動的人在原地休息，補充體力．",
      );
      await captureVisualAudit(page.getByTestId("game-screen"), {
        path: `${ARTIFACT_DIR}/stage0-real-all-rest-command-dialogue.png`,
      });
    }
    if (await dialogue.isVisible() && await dialogue.getAttribute("data-source-record") === "battle-command") {
      try {
        await page.getByTestId("dialogue-layer").click({ timeout: 1_000 });
      } catch (error) {
        const commandStillVisible = await dialogue.isVisible()
          && await dialogue.getAttribute("data-source-record") === "battle-command";
        if (commandStillVisible) throw error;
      }
    }

    const state = await waitForPlayerOrStory(page);
    if (state === "player") continue;

    const record = await dialogue.getAttribute("data-source-record");
    if (record === "3") {
      reachedVictoryStory = true;
      break;
    }
    expect(record).toBe("2");
    if (!capturedRoundTwo) {
      await page.getByTestId("dialogue-layer").click();
      await captureVisualAudit(page.getByTestId("game-screen"), {
        path: `${ARTIFACT_DIR}/stage0-real-round2-story.png`,
      });
      capturedRoundTwo = true;
    }
    await skipStoryDialogue(page);
  }

  expect(reachedVictoryStory).toBe(true);
  await expect(dialogue).toHaveAttribute("data-source-record", "3");
  await page.getByTestId("dialogue-layer").click();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage0-real-victory-story.png`,
  });

  await skipStoryDialogue(page);
  await expect(page.getByTestId("victory-continue")).toBeVisible();
  await page.getByTestId("victory-continue").click();
  await expect(page.getByTestId("feedback-text")).toHaveText(
    "哦！．．\n這次的戰役結束了，是否要記錄下來．",
  );
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage0-real-victory-feedback.png`,
  });
  await page.getByTestId("victory-continue").click();
  await expect(page.getByRole("menu", { name: "是否儲存" })).toBeVisible();
  await page.locator("[data-action=save-no]").click();

  await expect(page.getByTestId("quit-screen")).toHaveCount(0);
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toHaveAttribute("data-source-record", "4");
  await expect(page.getByRole("heading", { name: "天使帝國 II · 騎士城堡前" })).toBeVisible();
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage1-real-prebattle-entry.png`,
    animations: "disabled",
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
