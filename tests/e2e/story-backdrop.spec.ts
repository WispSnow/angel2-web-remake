import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { decodeScreenshot, type ScreenshotPixels } from "./screenshot-pixels";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

/**
 * 模組 25 在解釋任何 SAY 記錄之前就載入 `A/20`：`0000:05F2` 載入後由 `0000:0B5B` 在 y=0
 * 貼一列 16 塊 40 px 寬的圖磚，再把 `(0,0)` 起的 `640×40` 條帶依 DS:`02DF` 描述子複製到
 * y=40..360。整段序列在模組進入點只跑一次、與關卡和 SAY 記錄無關，所以每一段關卡間過場
 * 劇情都是同一張底紋；第一次條帶複製蓋掉原圖第 41 列，重複單元因此是 40×40。
 */
const BACKDROP_TILE = 40;
/** `BK/<id>` 由 `0000:098C` 寫死畫在 `(160,80)`，不是 `320×200` 在 `640×350` 裡置中。 */
const ILLUSTRATION_ORIGIN = { x: 160, y: 80 };
const ILLUSTRATION_SIZE = { width: 320, height: 200 };

const tile = decodeScreenshot(readFileSync("public/assets/original/story/backdrop.png"));

const rgb = (shot: ScreenshotPixels, x: number, y: number) => {
  const index = (y * shot.width + x) * shot.channels;
  return `${shot.pixels[index]},${shot.pixels[index + 1]},${shot.pixels[index + 2]}`;
};

/** 除錯工具列在遊戲畫面右緣投下的陰影是宿主外觀，不屬於邏輯螢幕，逐像素比對前先關掉。 */
const hideDebugChrome = (page: Page) =>
  page.addStyleTag({ content: ".debug-toolbar { display: none !important; }" });

const advanceToPortraitPage = async (page: Page) => {
  const portrait = page.locator("#dialogue-portrait-upper");
  await expect.poll(async () => {
    if (await portrait.isVisible()) return true;
    await page.locator("#logical-screen").click({ noWaitAfter: true }).catch(() => {});
    return false;
  }, { timeout: 30_000 }).toBe(true);
};

test("every interstitial story page tiles the native A/20 backdrop behind the illustration", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-prebattle&difficulty=0&test=1");
  await advanceToPortraitPage(page);
  await hideDebugChrome(page);
  await page.addStyleTag({
    content: ".portrait-eye, .portrait-mouth { visibility: hidden !important; }",
  });

  expect({ width: tile.width, height: tile.height }).toEqual({ width: BACKDROP_TILE, height: BACKDROP_TILE });
  const shot = decodeScreenshot(await page.getByTestId("game-screen").screenshot());
  expect({ width: shot.width, height: shot.height }).toEqual({ width: 640, height: 350 });

  // 肖像合成體、`A/18` 上窗與插畫之外的每一個像素都必須等於原生圖磚的對應位置，
  // 相位由 `(x mod 40, y mod 40)` 決定——原生從 `(0,0)` 起貼，沒有額外位移。
  const inPortrait = (x: number, y: number) => x >= 6 && x <= 128 && y >= 2 && y <= 162;
  const inWindow = (x: number, y: number) => x >= 152 && x < 554 && y >= 1 && y < 89;
  const inIllustration = (x: number, y: number) =>
    x >= ILLUSTRATION_ORIGIN.x && x < ILLUSTRATION_ORIGIN.x + ILLUSTRATION_SIZE.width
    && y >= ILLUSTRATION_ORIGIN.y && y < ILLUSTRATION_ORIGIN.y + ILLUSTRATION_SIZE.height;
  let checked = 0;
  const mismatches: string[] = [];
  for (let y = 0; y < shot.height; y += 1) {
    for (let x = 0; x < shot.width; x += 1) {
      if (inPortrait(x, y) || inWindow(x, y) || inIllustration(x, y)) continue;
      checked += 1;
      const expected = rgb(tile, x % BACKDROP_TILE, y % BACKDROP_TILE);
      if (rgb(shot, x, y) !== expected && mismatches.length < 8) {
        mismatches.push(`${x},${y} expected ${expected} got ${rgb(shot, x, y)}`);
      }
    }
  }
  expect(checked).toBeGreaterThan(100_000);
  expect(mismatches).toEqual([]);

  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/story-backdrop-prebattle.png`,
  });
});

test("the story illustration lands on the native (160,80) origin, not the centred one", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-prebattle&difficulty=0&test=1");
  await advanceToPortraitPage(page);
  await hideDebugChrome(page);

  const illustration = decodeScreenshot(readFileSync("public/assets/original/story-palace.png"));
  expect({ width: illustration.width, height: illustration.height }).toEqual(ILLUSTRATION_SIZE);
  const shot = decodeScreenshot(await page.getByTestId("game-screen").screenshot());

  // 置中會落在 (160,75)：跟原生差 5 px，插畫的每一列都會錯位。
  const mismatchesAt = (originY: number) => {
    let mismatches = 0;
    for (let y = 0; y < illustration.height; y += 1) {
      for (let x = 0; x < illustration.width; x += 1) {
        const screenY = originY + y;
        // 上窗蓋住插畫頂端幾列，那裡看到的不是插畫本身。
        if (screenY < 89) continue;
        if (rgb(shot, ILLUSTRATION_ORIGIN.x + x, screenY) !== rgb(illustration, x, y)) mismatches += 1;
      }
    }
    return mismatches;
  };
  expect(mismatchesAt(ILLUSTRATION_ORIGIN.y)).toBe(0);
  expect(mismatchesAt(75)).toBeGreaterThan(1_000);
});

test("the in-battle PP background keeps the live battlefield, without the module-25 backdrop", async ({ page }) => {
  // 模組 29 從來沒有載入過 `A/20`：戰場內的 `PP`（第 12 關 SAY/30 用 BK/14）只把插畫
  // 畫在活的戰場上，所以那條路徑不能長出底紋圖層。
  await page.goto("/?debugScenario=stage-12-opening&difficulty=0&test=1");
  const background = page.locator("#story-background");
  await expect(background).toBeVisible();
  await expect(background).toHaveAttribute("data-background-id", "14");

  const layers = await background.evaluate((element) =>
    getComputedStyle(element).backgroundImage.split(/,(?![^(]*\))/).length);
  expect(layers).toBe(1);
  expect(await page.getByTestId("game-screen").getAttribute("data-phase")).not.toBe("prebattleStory");
});
