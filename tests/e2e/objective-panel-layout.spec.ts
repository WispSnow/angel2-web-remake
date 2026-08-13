import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface ObjectivePanelLayout {
  panel: { top: number; right: number; bottom: number; left: number };
  screen: { top: number; right: number; bottom: number; left: number };
  button: { top: number; right: number; bottom: number; left: number };
  clientHeight: number;
  scrollHeight: number;
  overflowY: string;
}

async function objectivePanelLayout(page: Page): Promise<ObjectivePanelLayout> {
  return page.getByTestId("objective-panel").evaluate((panel) => {
    const screen = panel.closest<HTMLElement>("#logical-screen");
    const button = panel.querySelector<HTMLElement>('[data-action="close-objectives"]');
    if (!screen || !button) throw new Error("objective panel layout is incomplete");
    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
      };
    };
    return {
      panel: rect(panel),
      screen: rect(screen),
      button: rect(button),
      clientHeight: panel.clientHeight,
      scrollHeight: panel.scrollHeight,
      overflowY: getComputedStyle(panel).overflowY,
    };
  });
}

function expectInsideScreen(
  child: ObjectivePanelLayout["panel"],
  screen: ObjectivePanelLayout["screen"],
): void {
  expect(child.top).toBeGreaterThanOrEqual(screen.top);
  expect(child.left).toBeGreaterThanOrEqual(screen.left);
  expect(child.right).toBeLessThanOrEqual(screen.right);
  expect(child.bottom).toBeLessThanOrEqual(screen.bottom);
}

const representativePanels = [
  { scenario: "stage-09-player", artifact: "stage9-objective-layout.png" },
  { scenario: "stage-27-player", artifact: "stage27-objective-layout.png" },
  { scenario: "stage-31-player", artifact: "stage31-objective-layout.png" },
] as const;

for (const { scenario, artifact } of representativePanels) {
  test(`${scenario}: current objective and deployment guidance fit inside the game screen`, async ({ page }) => {
    await page.goto(`/?debugScenario=${scenario}&difficulty=0&test=1`);
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await page.keyboard.press("o");
    await expect(page.getByTestId("objective-panel")).toBeVisible();

    const layout = await objectivePanelLayout(page);
    expectInsideScreen(layout.panel, layout.screen);
    expectInsideScreen(layout.button, layout.screen);
    expect(layout.overflowY).toBe("auto");
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);

    await captureVisualAudit(page.getByTestId("game-screen"), {
      path: `${ARTIFACT_DIR}/${artifact}`,
    });
  });
}

test("extra-long future objective guidance stays contained and keeps its close button reachable", async ({ page }) => {
  await page.goto("/?debugScenario=stage-31-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  const panel = page.getByTestId("objective-panel");
  await expect(panel).toBeVisible();

  await page.getByTestId("objective-guidance").evaluate((guidance) => {
    guidance.textContent = Array.from(
      { length: 12 },
      () => "這是一段用來驗證未來長篇出擊提示仍受畫面安全區約束的文字。",
    ).join("");
  });
  const overflowed = await objectivePanelLayout(page);
  expectInsideScreen(overflowed.panel, overflowed.screen);
  expect(overflowed.scrollHeight).toBeGreaterThan(overflowed.clientHeight);

  await panel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator('[data-action="close-objectives"]')).toBeInViewport();
  const scrolled = await objectivePanelLayout(page);
  expectInsideScreen(scrolled.button, scrolled.screen);
});
