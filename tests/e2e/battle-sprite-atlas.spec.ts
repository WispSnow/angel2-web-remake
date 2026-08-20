import { expect, test, type Page } from "@playwright/test";

const trackedBattleSpriteRequests = (page: Page) => {
  const paths = new Set<string>();
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith("/assets/original/battle-sprite-atlases/")
      || path.startsWith("/assets/original/map-combat/")
      || path.startsWith("/assets/original/stage4-force-field-pulse/")
      || path.startsWith("/assets/original/stage26-column-push/")
      || path.startsWith("/assets/original/turn-transition-")
    ) {
      paths.add(path);
    }
  });
  return paths;
};

const atlasPair = (id: string) => [
  `/assets/original/battle-sprite-atlases/${id}.json`,
  `/assets/original/battle-sprite-atlases/${id}.png`,
];

test("stage 0 preloads two atlas pairs instead of 55 individual combat and turn PNGs", async ({ page }) => {
  const requests = trackedBattleSpriteRequests(page);
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await expect.poll(() => [...requests].sort()).toEqual([
    ...atlasPair("map-combat"),
    ...atlasPair("turn-transition"),
  ].sort());
});

test("stage 4 adds only its force-field atlas pair", async ({ page }) => {
  const requests = trackedBattleSpriteRequests(page);
  await page.goto("/?debugScenario=stage-04-prebattle&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await expect.poll(() => [...requests].sort()).toEqual([
    ...atlasPair("map-combat"),
    ...atlasPair("stage4-force-field-pulse"),
    ...atlasPair("turn-transition"),
  ].sort());
});

test("stage 26 adds only its column-push atlas pair", async ({ page }) => {
  const requests = trackedBattleSpriteRequests(page);
  await page.goto("/?debugScenario=stage-26-opening&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await expect.poll(() => [...requests].sort()).toEqual([
    ...atlasPair("map-combat"),
    ...atlasPair("stage26-column-push"),
    ...atlasPair("turn-transition"),
  ].sort());
});
