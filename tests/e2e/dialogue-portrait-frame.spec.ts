import { expect, test, type Locator, type Page } from "@playwright/test";
import { decodeScreenshot, type ScreenshotPixels } from "./screenshot-pixels";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

/**
 * 原生肖像合成體（模組 25 `0000:0B98`、模組 29 `0000:BBEC`）在貼主圖之前先畫投影：
 * 以 DS:`02F9`／DS:`8384` 的 `{14 byte, 8 row}` 描述子帶著 112×8 的 `AA/55` 位遮罩，
 * 用色 0 連畫 18 次，也就是 `(x+8, y)` 起 112×144 的 50% 網點黑塊。主圖、頂飾與姓名牌
 * 隨後蓋掉大半，只在右側與下方露出，和文字窗那圈已烘進 `A/18` 圖形的網點投影同源。
 */
const SHADOW = { left: 8, top: 0, width: 112, height: 144 } as const;

/** `0000:0C2B`／`0000:BC85` 起的四次 1×147 色 0 填充，相對肖像原點的 X 與起始 Y。 */
const OUTLINE_COLUMNS = [-1, 5, 106, 112] as const;
const OUTLINE_TOP = -15;
const OUTLINE_HEIGHT = 147;

/**
 * 網點相位跟著螢幕座標走：`AA` 在偶數列塗偶數 X、`55` 在奇數列塗奇數 X，
 * 因此 `(X+Y)` 為偶數的像素才是黑點。
 */
const dithered = (x: number, y: number) => (x + y) % 2 === 0;

/** 投影被主圖、姓名牌與 x+106／x+112 兩道黑邊蓋住之後仍然可見的位置。 */
const stillVisible = (localX: number, localY: number) => {
  if (localX <= 111 && localY <= 111) return false;
  if (localX <= 111 && localY >= 108 && localY <= 130) return false;
  if ((localX === 106 || localX === 112) && localY <= 131) return false;
  return true;
};

const pixel = (shot: ScreenshotPixels, x: number, y: number) => {
  const index = (y * shot.width + x) * shot.channels;
  return [shot.pixels[index], shot.pixels[index + 1], shot.pixels[index + 2]].join(",");
};

const isBlack = (shot: ScreenshotPixels, x: number, y: number) => pixel(shot, x, y) === "0,0,0";

/** `A/18` 框飾的亮黃與側飾自己的深棕，兩者每個通道都差 90 以上，足以分辨誰疊在上面。 */
const FRAME_YELLOW = [255, 223, 16] as const;
const SIDE_MOTIF_BROWN = [93, 65, 49] as const;
/**
 * 調試會話的右側面板會在遊戲畫面右緣投下一層最深約 6% 的陰影（純色覆蓋層實測同樣
 * 被壓暗），所以顏色比對留 16 的餘裕；框飾黃與側飾棕的距離遠大於此。
 */
const CHANNEL_TOLERANCE = 16;
const matches = (shot: ScreenshotPixels, x: number, y: number, expected: readonly number[]) => {
  const index = (y * shot.width + x) * shot.channels;
  return expected.every((value, offset) => Math.abs(shot.pixels[index + offset] - value) <= CHANNEL_TOLERANCE);
};

const compositeGeometry = (portrait: Locator) => portrait.evaluate((element) => {
  const underlay = element.querySelector<HTMLElement>(".dialogue-portrait-underlay");
  const frame = getComputedStyle(element, "::before");
  const screen = element.closest("[data-testid=game-screen]");
  if (!underlay || !screen) throw new Error("portrait composite is not mounted");
  const screenBox = screen.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  return {
    anchor: { x: Math.round(box.x - screenBox.x), y: Math.round(box.y - screenBox.y) },
    shadow: {
      left: underlay.offsetLeft,
      top: underlay.offsetTop,
      width: underlay.offsetWidth,
      height: underlay.offsetHeight,
    },
    frame: {
      left: frame.left,
      top: frame.top,
      width: frame.width,
      height: frame.height,
      layers: frame.backgroundSize.split(",").length,
    },
  };
});

/** 眨眼與口型由 rAF 驅動，投影不受影響，但逐像素比對要一個穩定的表現時點。 */
const freezePresentation = (page: Page) => page.addStyleTag({
  content: ".portrait-eye, .portrait-mouth { visibility: hidden !important; }",
});

const expectNativePortraitComposite = async (
  page: Page,
  portrait: Locator,
  expectedAnchor: { x: number; y: number },
) => {
  const geometry = await compositeGeometry(portrait);
  expect(geometry.anchor).toEqual(expectedAnchor);
  expect(geometry.shadow).toEqual(SHADOW);
  // 四道黑邊和頂飾／姓名牌併在同一個偽元素裡，靠圖層順序保持原生先後關係，所以
  // 邊框元素必須外擴到 x-1，並比姓名牌多出一列到 y+131。
  expect(geometry.frame).toEqual({
    left: "-1px",
    top: `${OUTLINE_TOP}px`,
    width: "114px",
    height: `${OUTLINE_HEIGHT}px`,
    layers: 2 + OUTLINE_COLUMNS.length,
  });

  const shot = decodeScreenshot(await page.getByTestId("game-screen").screenshot());
  // 夾具校驗：本用例只在 1:1 的邏輯螢幕上比對裝置像素。
  expect({ width: shot.width, height: shot.height }).toEqual({ width: 640, height: 350 });

  const { x: anchorX, y: anchorY } = geometry.anchor;
  let checked = 0;
  for (let localY = SHADOW.top; localY < SHADOW.top + SHADOW.height; localY += 1) {
    for (let localX = SHADOW.left; localX < SHADOW.left + SHADOW.width; localX += 1) {
      if (!stillVisible(localX, localY)) continue;
      const x = anchorX + localX;
      const y = anchorY + localY;
      if (x < 0 || y < 0 || x >= shot.width || y >= shot.height) continue;
      if (!dithered(x, y)) continue;
      checked += 1;
      expect(isBlack(shot, x, y), `shadow pixel ${x},${y} (portrait ${localX},${localY})`).toBe(true);
    }
  }
  expect(checked).toBeGreaterThan(1_000);

  // 四道黑邊：x-1 與 x+112 整條可見，x+5 與 x+106 只在姓名牌下緣那一列露出。
  for (const localX of OUTLINE_COLUMNS) {
    const rows = localX === -1 || localX === 112 ? [OUTLINE_TOP, 0, 60, 131] : [131];
    for (const localY of rows) {
      expect(
        isBlack(shot, anchorX + localX, anchorY + localY),
        `outline column ${localX} at row ${localY}`,
      ).toBe(true);
    }
  }
  // 黑邊在 y+131 收尾；再往下那一列只剩投影本身，其相位是奇數所以不塗黑。
  const belowOutline = { x: anchorX - 1, y: anchorY + OUTLINE_TOP + OUTLINE_HEIGHT };
  expect(dithered(belowOutline.x, belowOutline.y)).toBe(false);
  expect(isBlack(shot, belowOutline.x, belowOutline.y)).toBe(false);

  // 貼圖順序是側飾 → 頂飾 → 姓名牌：頂飾第 15／16 列與姓名牌第 0 列在兩端都是亮黃，
  // 反過來疊會在框角露出側飾的棕色缺口。
  for (const localX of [0, 1, 2, 3, 4, 107, 108, 109, 110, 111]) {
    for (const localY of [0, 1]) {
      expect(
        matches(shot, anchorX + localX, anchorY + localY, FRAME_YELLOW),
        `top ornament must cover the side motif at ${localX},${localY}`
          + ` (got ${pixel(shot, anchorX + localX, anchorY + localY)})`,
      ).toBe(true);
    }
  }
  for (const localX of [0, 1, 2, 3, 4]) {
    expect(
      matches(shot, anchorX + localX, anchorY + 108, FRAME_YELLOW),
      `nameplate must cover the side motif at ${localX},108`
        + ` (got ${pixel(shot, anchorX + localX, anchorY + 108)})`,
    ).toBe(true);
  }
  // 夾具校驗：側飾本身仍在沒被框飾蓋住的列上照 `A/18` frame 2 第 2 列呈現，
  // 否則上面那組斷言只要側飾整個消失也會通過。
  for (const localX of [1, 3]) {
    expect(
      matches(shot, anchorX + localX, anchorY + 2, SIDE_MOTIF_BROWN),
      `side motif pixel ${localX},2 (got ${pixel(shot, anchorX + localX, anchorY + 2)})`,
    ).toBe(true);
  }
};

test("in-battle dialogue portraits carry the native A/18 drop shadow and outline columns", async ({ page }) => {
  await page.goto("/?debugScenario=stage-09-opening&difficulty=0&test=1");
  // 活動槽的 `data-testid` 會換成不帶槽名的 `dialogue-portrait-composite`，用固定 id 定位。
  const portrait = page.locator("#dialogue-portrait-lower");
  await expect(portrait).toBeVisible();
  await freezePresentation(page);

  await expectNativePortraitComposite(page, portrait, { x: 504, y: 200 });

  // 反向界線：關掉投影層之後，只有原生 112×144 矩形裡的偶數相位像素會改變。下方
  // 肖像的投影完全落在靜態的右側資訊欄與底部回合牌上，兩張截圖可以逐像素相減。
  const before = decodeScreenshot(await page.getByTestId("game-screen").screenshot());
  await page.addStyleTag({ content: ".dialogue-portrait-underlay { display: none !important; }" });
  const after = decodeScreenshot(await page.getByTestId("game-screen").screenshot());
  const strays: string[] = [];
  for (let y = 176; y < 350; y += 1) {
    for (let x = 496; x < 640; x += 1) {
      const index = (y * before.width + x) * before.channels;
      const changed = before.pixels[index] !== after.pixels[index]
        || before.pixels[index + 1] !== after.pixels[index + 1]
        || before.pixels[index + 2] !== after.pixels[index + 2];
      if (!changed) continue;
      const localX = x - 504;
      const localY = y - 200;
      const inside = localX >= SHADOW.left && localX < SHADOW.left + SHADOW.width
        && localY >= SHADOW.top && localY < SHADOW.top + SHADOW.height;
      if (!inside || !dithered(x, y) || !isBlack(before, x, y)) strays.push(`${x},${y}`);
    }
  }
  expect(strays, "the shadow layer paints outside the native rect or off-phase").toEqual([]);

  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/dialogue-portrait-shadow-lower.png`,
  });
});

test("the A/18 outcome feedback portrait casts the same shadow at the upper anchor", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  // 離開遊戲的確認一開就是妮雅反饋窗本身；這裡只看它的框，不按下「確 定」。
  await page.getByTestId("system-command-quit").click();
  await expect(page.getByTestId("quit-confirm")).toBeVisible();
  await expect(page.getByTestId("quit-confirm-menu")).toBeVisible();
  await freezePresentation(page);

  const portrait = page.getByTestId("quit-confirm").locator(".feedback-portrait");
  await expectNativePortraitComposite(page, portrait, { x: 32, y: 26 });

  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/dialogue-portrait-shadow-feedback.png`,
  });
});

test("the module-25 interstitial story portrait casts the shadow onto the A/20 backdrop", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-prebattle&difficulty=0&test=1");
  const portrait = page.locator("#dialogue-portrait-upper");
  // 關前劇情的第一頁沒有肖像；逐頁推進到第一個掛肖像的頁面。
  await expect.poll(async () => {
    if (await portrait.isVisible()) return true;
    await page.locator("#logical-screen").click({ noWaitAfter: true }).catch(() => {});
    return false;
  }, { timeout: 30_000 }).toBe(true);
  await freezePresentation(page);

  // 關前版面的投影與黑邊完全落在 A/20 底紋上，是唯一能同時看到兩層的原生畫面。
  await expectNativePortraitComposite(page, portrait, { x: 8, y: 18 });

  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/dialogue-portrait-shadow-prebattle.png`,
  });
});
