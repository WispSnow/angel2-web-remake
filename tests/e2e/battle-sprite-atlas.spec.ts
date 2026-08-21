import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

const trackedBattleSpriteRequests = (page: Page) => {
  const paths = new Map<string, number>();
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith("/assets/original/battle-sprite-atlases/")
      || path.startsWith("/assets/original/map-combat/")
      || path.startsWith("/assets/original/stage4-force-field-pulse/")
      || path.startsWith("/assets/original/stage26-column-push/")
      || path.startsWith("/assets/original/turn-transition-")
    ) {
      paths.set(path, (paths.get(path) ?? 0) + 1);
    }
  });
  return paths;
};

const atlasPair = (id: string) => [
  `/assets/original/battle-sprite-atlases/${id}.json`,
  `/assets/original/battle-sprite-atlases/${id}.png`,
];

const expectedAtlasRequests = (...ids: readonly string[]) => Object.fromEntries(
  ids.flatMap(atlasPair).sort().map((path) => [path, 1]),
);

const requestCounts = (requests: ReadonlyMap<string, number>) => Object.fromEntries(
  [...requests.entries()].sort(([left], [right]) => left.localeCompare(right)),
);

const rejectDuplicateAtlasRequests = async (page: Page, ...ids: readonly string[]) => {
  const routeCounts = new Map<string, number>();
  for (const path of ids.flatMap(atlasPair)) {
    await page.route(`**${path}`, async (route) => {
      const count = (routeCounts.get(path) ?? 0) + 1;
      routeCounts.set(path, count);
      if (count > 1) await route.abort("failed");
      else await route.continue();
    });
  }
};

test("stage 0 preloads two atlas pairs instead of 55 individual combat and turn PNGs", async ({ page }) => {
  const requests = trackedBattleSpriteRequests(page);
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await expect.poll(() => requestCounts(requests))
    .toEqual(expectedAtlasRequests("map-combat", "turn-transition"));
});

test("stage 4 adds only its force-field atlas pair", async ({ page }) => {
  const requests = trackedBattleSpriteRequests(page);
  await page.goto("/?debugScenario=stage-04-prebattle&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await expect.poll(() => requestCounts(requests)).toEqual(expectedAtlasRequests(
    "map-combat",
    "stage4-force-field-pulse",
    "turn-transition",
  ));
});

test("stage 26 adds only its column-push atlas pair", async ({ page }) => {
  const requests = trackedBattleSpriteRequests(page);
  await page.goto("/?debugScenario=stage-26-opening&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await expect.poll(() => requestCounts(requests)).toEqual(expectedAtlasRequests(
    "map-combat",
    "stage26-column-push",
    "turn-transition",
  ));
});

test("map hit and death render after every duplicate atlas request is rejected", async ({ page }) => {
  const requests = trackedBattleSpriteRequests(page);
  await rejectDuplicateAtlasRequests(page, "map-combat", "turn-transition");
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  await page.evaluate(() => window.__ANGEL2__?.forceVictorySetup());
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await page.getByTestId("system-command-settings").click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();
  await page.getByTestId("presentation-button").click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeHidden();
  await canvas.click({ position: { x: 220, y: 177 } });
  await page.getByTestId("unit-command-attack").click();

  await expect(canvas).toHaveAttribute("data-map-combat-phase", "primaryHit");
  await expect(canvas).toHaveAttribute("data-map-combat-effect-tile-count", "1");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/resource-loading-map-hit.png",
  });
  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid=battle-canvas]");
    return element?.dataset.mapCombatPhase === "defenderDeath"
      && Number(element.dataset.mapCombatFrame) >= 6
      && Number(element.dataset.mapCombatEffectTileCount) > 0;
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/resource-loading-map-death.png",
  });
  expect(requestCounts(requests)).toEqual(expectedAtlasRequests(
    "map-combat",
    "turn-transition",
  ));
});

test("turn handoff renders after every duplicate atlas request is rejected", async ({ page }) => {
  const requests = trackedBattleSpriteRequests(page);
  await rejectDuplicateAtlasRequests(page, "map-combat", "turn-transition");
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  await page.keyboard.press("g");
  await page.getByTestId("group-command-allRest").click();
  const dialogue = page.getByTestId("dialogue-layer");
  await expect(dialogue).toBeVisible();
  const dialogueId = await page.evaluate(() => {
    const state = window.__ANGEL2__?.getState() as { groupCommandDialogueId?: string };
    return state.groupCommandDialogueId;
  });
  await dialogue.click();
  if (await page.evaluate((expected) => {
    const state = window.__ANGEL2__?.getState() as { groupCommandDialogueId?: string };
    return state.groupCommandDialogueId === expected;
  }, dialogueId)) await dialogue.click();

  await page.waitForFunction(() => {
    const state = window.__ANGEL2__?.getState() as {
      turnTransitionPresentation?: { side: string; phase: string };
    };
    return state.turnTransitionPresentation?.side === "enemy"
      && state.turnTransitionPresentation.phase === "motion";
  });
  await expect(canvas).toHaveAttribute("data-turn-transition-sprite-count", "2");
  await expect(canvas).toHaveAttribute("data-turn-transition-dust-count", "6");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/resource-loading-turn-transition.png",
  });
  expect(requestCounts(requests)).toEqual(expectedAtlasRequests(
    "map-combat",
    "turn-transition",
  ));
});
