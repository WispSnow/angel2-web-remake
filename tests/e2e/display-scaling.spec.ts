import { expect, test, type Page } from "@playwright/test";
import {
  columnGreenExcess,
  columnMeanLuminance,
  decodeScreenshot,
  rowMeanLuminance,
} from "./screenshot-pixels";
import { hostMenu, openHostMenu, resumeFromHostMenu, setImageScaling } from "./host-menu-helpers";
import { captureVisualAudit } from "./visual-audit";

const screenMetrics = (page: Page) => page.locator(".logical-screen").evaluate((element) => {
  const style = getComputedStyle(element);
  const viewport = element.parentElement as HTMLElement;
  return {
    imageRendering: style.imageRendering,
    scale: Number(style.getPropertyValue("--game-scale")),
    offset: style.getPropertyValue("--game-offset-x").trim(),
    screenWidth: element.getBoundingClientRect().width,
    viewportWidth: viewport.clientWidth,
    documentMode: document.documentElement.dataset.imageScaling,
  };
});

test("the page shows only the game and the scaling choice lives in the corner menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("startup-screen")).toBeVisible();
  // 頁面上沒有畫面外的宿主列：畫面縮放、暫停與參考面板都收進右下角的入口。
  await expect(page.getByTestId("display-settings")).toHaveCount(0);
  const trigger = page.getByTestId("host-menu-trigger");
  await expect(trigger.locator("xpath=ancestor::*[contains(@class,'logical-screen')]")).toHaveCount(1);
  await expect.poll(() => trigger.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.3");
  await trigger.hover();
  await expect.poll(() => trigger.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await expect(page.getByTestId("host-menu-trigger-tip")).toBeVisible();

  await openHostMenu(page);
  await expect(hostMenu(page).locator("[data-host-menu-row]")).toHaveText([
    "繼續遊戲", "畫面縮放", "復刻說明", "圖鑑", "RoadMap", "原版Debug",
  ].map((label) => new RegExp(`^\\s*${label}`)));
  await page.getByTestId("host-menu-row-image-scaling").click();
  await expect(page.getByTestId("host-menu-submenu").getByRole("menuitemradio")).toHaveText(
    ["銳利", "平滑", "整數倍"].map((label) => new RegExp(`^\\s*${label}`)),
  );
  await expect(page.getByTestId("host-menu-option-sharp")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("host-menu-description")).toContainText("最近鄰取樣");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("host-menu-submenu")).toBeHidden();
  await resumeFromHostMenu(page);
  await expect(await screenMetrics(page)).toMatchObject({
    imageRendering: "pixelated",
    scale: 1,
    documentMode: "sharp",
  });
});

test("smooth swaps the filter without moving the screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("startup-screen")).toBeVisible();
  const before = await screenMetrics(page);
  await setImageScaling(page, "smooth");

  const after = await screenMetrics(page);
  expect(after.imageRendering).toBe("auto");
  expect(after.documentMode).toBe("smooth");
  expect(after.scale).toBe(before.scale);
  expect(after.screenWidth).toBe(before.screenWidth);

  // The choice is a device preference, so it has to survive a reload without a save.
  await page.reload();
  await expect(page.getByTestId("startup-screen")).toBeVisible();
  expect((await screenMetrics(page)).imageRendering).toBe("auto");
  await openHostMenu(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("host-menu-description")).toContainText("平滑");
  await page.getByTestId("host-menu-row-image-scaling").click();
  await expect(page.getByTestId("host-menu-option-smooth")).toHaveAttribute("aria-checked", "true");
});

test.describe("fractional device pixel ratio", () => {
  test.use({ viewport: { width: 500, height: 800 }, deviceScaleFactor: 2 });

  test("integer snaps the scale to whole device pixels and letterboxes the slack", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("startup-screen")).toBeVisible();
    const fitted = await screenMetrics(page);
    // 500px viewport, 640px logical screen: the default fit is fractional.
    expect(fitted.scale).toBeGreaterThan(.5);
    expect(fitted.scale).toBeLessThan(1);
    expect(fitted.scale * 640 * 2 % 1).toBeCloseTo(0, 6);

    await setImageScaling(page, "integer");
    const snapped = await screenMetrics(page);
    expect(snapped.documentMode).toBe("integer");
    expect(snapped.imageRendering).toBe("pixelated");
    expect(snapped.scale).toBe(.5);
    expect(snapped.scale * 2).toBe(1);
    // The screen no longer fills the viewport, so it is centred on the grid.
    expect(snapped.screenWidth).toBeLessThan(snapped.viewportWidth);
    expect(Number.parseFloat(snapped.offset) * 2 % 1).toBeCloseTo(0, 6);
    expect(Number.parseFloat(snapped.offset)).toBeCloseTo(
      (snapped.viewportWidth - snapped.screenWidth) / 2,
      1,
    );

    // 0.5 倍的畫面上選單仍放大到 1 倍，必須讓開入口位置上的紅寶石，玩家才點得到它回到遊戲。
    await openHostMenu(page);
    await expect(hostMenu(page)).toHaveAttribute("data-scale", "1");
    const [gem, group] = await Promise.all([
      page.getByTestId("host-menu-close").boundingBox(),
      page.locator(".host-menu-group").boundingBox(),
    ]);
    expect(gem).not.toBeNull();
    expect(group).not.toBeNull();
    if (gem && group) {
      const clear = gem.y >= group.y + group.height || gem.x >= group.x + group.width
        || gem.y + gem.height <= group.y || gem.x + gem.width <= group.x;
      expect(clear).toBe(true);
    }
    await resumeFromHostMenu(page);
  });
});

test.describe("smooth scaling on a HiDPI panel", () => {
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

  test("the battlefield never bleeds through the window frame", async ({ page }) => {
    // 画布只在相机视口 (40,23,400,308) 内绘制，外面完全透明。「平滑」会对整张
    // 画布做双线性重采样，把这条硬透明边缘向外晕开约一个装置像素；边框图必须画
    // 在画布之上才挡得住，否则左右雕像中间会出现一条战场颜色的细纹。
    await page.goto("/?debugScenario=stage-02-player&difficulty=0&test=1");
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await setImageScaling(page, "smooth");
    await expect.poll(() => page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--image-rendering").trim(),
    )).toBe("auto");

    // 雕像前景已經和畫框合成在同一層（`chrome-composite.ts`），所以這裡只剩
    // 底板／畫布／畫框三層要排序。
    const paintOrder = await page.evaluate(() => {
      const layer = (selector: string) => Number(
        getComputedStyle(document.querySelector(selector) as HTMLElement).zIndex,
      );
      return {
        backdrop: layer(".battle-backdrop"),
        canvas: layer("#phaser-root"),
        chrome: layer(".battle-chrome"),
      };
    });
    expect(paintOrder.backdrop).toBeLessThan(paintOrder.canvas);
    expect(paintOrder.chrome).toBeGreaterThan(paintOrder.canvas);

    const shot = decodeScreenshot(await page.getByTestId("game-screen").screenshot());
    expect(shot.width).toBe(1280);
    // 雕像所在的装置像素行；两侧视口边界落在装置列 80 与 880。
    const firstRow = 300;
    const lastRow = 640;
    const greenExcess = (x: number) => columnGreenExcess(shot, x, firstRow, lastRow);

    // 夹具校验：这些行的战场确实是绿色地形，否则下面的断言会空跑。
    expect(greenExcess(200)).toBeGreaterThan(8);

    // 视口边界两侧的边框列必须和它们的邻列一样中性。修复前左侧为 10.9、右侧为 4.5。
    for (const x of [79, 80, 880, 881]) {
      expect(greenExcess(x), `device column ${x} carries battlefield colour`).toBeLessThan(3);
    }
  });
});

test.describe("a non-integer desktop scale", () => {
  // 1020 / 640 = 1.59375：四条水平接缝（y=23/57/137/331）、两条垂直接缝
  // （x=40/440）和右栏 y=149 的分隔缝，装置像素座标全部落在半个像素上，正是
  // 桌面版出现裂纹的条件。高度留足余量，缩放才确定由宽度决定。
  test.use({ viewport: { width: 1020, height: 900 }, deviceScaleFactor: 1 });

  test("the window frame shows no seam where its tiles meet", async ({ page }) => {
    // `scaling.ts` 只在桌面执行阶段解除 1 倍上限，浏览器版永远停在整数装置倍率，
    // 所以复现这个缺陷必须先让执行阶段侦测认为自己在 Tauri 里。
    await page.addInitScript(() => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    });
    await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    // 调试工具条盖在右栏上；不藏起来，下面量到的全是工具条而不是右栏面板。
    await page.addStyleTag({ content: ".debug-toolbar { display: none !important; }" });

    const scale = await page.locator(".logical-screen").evaluate((element) =>
      Number(getComputedStyle(element).getPropertyValue("--game-scale")));
    expect(scale).toBeCloseTo(1.59375, 6);
    // 夹具校验：每条接缝都必须落在半个装置像素上。整数倍时接缝恰好压在装置像素
    // 边界，浏览器不会为它抗锯齿，下面的断言就成了空跑。
    for (const edge of [23, 57, 137, 149, 331, 40, 440]) {
      const subpixel = edge * scale % 1;
      expect(subpixel, `logical edge ${edge} lands on a whole device pixel`).toBeGreaterThan(.05);
      expect(subpixel, `logical edge ${edge} lands on a whole device pixel`).toBeLessThan(.95);
    }

    // 垂直接缝：雕像被战场切成两半，接缝纵贯像身，是玩家最先看到的一条。修复前
    // 边框栏与雕像前景分属两层，接缝那一列各覆盖半格，战场就从中间漏出来。
    // 这里可以直接看亮度：接缝两侧本来就是同一尊雕像的左右半边，图本身连续，
    // 所以任何比左右邻列都暗的单列都只能是漏光。y=144..330 之间两侧都不透明，
    // 扫描带里不会混进会动的战场像素。
    const shot = decodeScreenshot(await page.getByTestId("game-screen").screenshot());
    const firstRow = Math.round(150 * scale);
    const lastRow = Math.round(320 * scale);
    const statueColumn = (x: number) => columnMeanLuminance(shot, x, firstRow, lastRow);
    // 夹具校验：扫描带确实落在雕像上，而不是黑边。
    expect(statueColumn(Math.round(50 * scale))).toBeGreaterThan(40);

    for (const join of [40, 440]) {
      let worst = 0;
      for (let offset = -1; offset <= 1; offset += 1) {
        const x = Math.round(join * scale) + offset;
        worst = Math.max(worst, Math.min(statueColumn(x - 1), statueColumn(x + 1)) - statueColumn(x));
      }
      // 修复前在 1.234～3.17 倍之间实测为 13.6～29.8，本倍率下为 29.5。
      expect(worst, `vertical tile join at logical x=${join}`).toBeLessThan(8);
    }

    // 水平接缝夹在两张不同的边框图之间，光看亮度分不出「接缝漏光」和图本身的
    // 暗线（y=331 底座顶端就有一条）。改成差分量测：接缝漏出来的是画布下方的
    // 底板，把底板换两种颜色各拍一张，不透光的边框栏就该逐位元组相同。
    const frameColumnPixels = async (backdrop: string, frameVisible: boolean) => {
      await page.addStyleTag({ content: `
        .battle-backdrop { background: ${backdrop} !important; }
        .battle-chrome-frame { visibility: ${frameVisible ? "visible" : "hidden"} !important; }` });
      const frame = decodeScreenshot(await page.getByTestId("game-screen").screenshot());
      // 只取逻辑 x<39 的边框栏：再往右会碰到会动的战场像素。
      const lastColumn = Math.floor(39 * scale);
      const band: number[] = [];
      for (let y = 0; y < frame.height; y += 1) {
        for (let x = 3; x < lastColumn; x += 1) {
          const offset = (y * frame.width + x) * frame.channels;
          band.push(frame.pixels[offset], frame.pixels[offset + 1], frame.pixels[offset + 2]);
        }
      }
      return band;
    };
    const differingBytes = (left: readonly number[], right: readonly number[]) =>
      left.reduce((count, value, index) => value === right[index] ? count : count + 1, 0);

    // 正对照：藏起边框，同一条扫描带就完全由底板决定，两种底板必须拍出不同像素。
    // 没有这一步，下面的「相同」可能只是量到了两张一样空的图。
    expect(differingBytes(
      await frameColumnPixels("#000000", false),
      await frameColumnPixels("#ffffff", false),
    )).toBeGreaterThan(0);

    expect(differingBytes(
      await frameColumnPixels("#000000", true),
      await frameColumnPixels("#ffffff", true),
    ), "the backdrop leaks through the frame column").toBe(0);

    // 右栏 y=149 是原版刻意留的分隔缝：上下两张框图都不画那一列，让 `.unit-detail-shade`
    // 的底色透出来。併层前两张框各自抗锯齿，把这条缝糊成一条又暗又不匀的线。
    // 判据不看亮度而看「纯不纯」：把底色换成两种纯色各拍一张，缝里的每个像素要么
    // 两张一样（框图挡着），要么两张分别是两种纯色（底色透出来），不该出现两者的混合。
    const dividerPixels = async (shade: string) => {
      await page.addStyleTag({ content: `.unit-detail-shade { background: ${shade} !important; }` });
      const frame = decodeScreenshot(await page.getByTestId("game-screen").screenshot());
      const band: number[] = [];
      for (let y = Math.floor(147 * scale); y < Math.ceil(152 * scale); y += 1) {
        for (let x = Math.round(483 * scale); x < Math.round(637 * scale); x += 1) {
          const offset = (y * frame.width + x) * frame.channels;
          band.push(frame.pixels[offset], frame.pixels[offset + 1], frame.pixels[offset + 2]);
        }
      }
      return band;
    };
    const overMagenta = await dividerPixels("#ff00ff");
    const overGreen = await dividerPixels("#00ff00");
    let pureShade = 0;
    let blended = 0;
    for (let index = 0; index < overMagenta.length; index += 3) {
      const [r, g, b] = overMagenta.slice(index, index + 3);
      const [r2, g2, b2] = overGreen.slice(index, index + 3);
      if (r === r2 && g === g2 && b === b2) continue;
      if (r === 255 && g === 0 && b === 255 && r2 === 0 && g2 === 255 && b2 === 0) pureShade += 1;
      else blended += 1;
    }
    // 夹具校验：分隔缝确实透出了底色，否则下面的断言会空跑。
    expect(pureShade).toBeGreaterThan(0);
    // 修复前实测为 380～734 个混合像素（1.234～2.38 倍）。
    expect(blended, "the right panel divider is blended instead of a clean line").toBe(0);
  });
});

test("keys inside the corner menu never reach the battlefield", async ({ page }) => {
  await page.goto("/?debugScenario=stage-31-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const cursor = () => page.evaluate(() =>
    (window.__ANGEL2__?.getState() as { cursor: { x: number; y: number } } | undefined)?.cursor);
  const before = await cursor();
  expect(before).toBeDefined();

  // `ui.ts` binds keydown on `window`, so an unstopped press in the host menu
  // would drive the battle cursor while the player is only picking a filter.
  await openHostMenu(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("host-menu-row-image-scaling")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("html")).toHaveAttribute("data-image-scaling", "smooth");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("html")).toHaveAttribute("data-image-scaling", "integer");
  for (const key of ["ArrowUp", "ArrowDown", "w", "s", "z", "g"]) {
    await page.keyboard.press(key);
  }
  await resumeFromHostMenu(page);
  expect(await cursor()).toEqual(before);

  // 鍵盤停在入口按鈕上時，方向鍵同樣停在按鈕這裡。
  await page.getByTestId("host-menu-trigger").focus();
  for (const key of ["ArrowUp", "ArrowRight", "w", "d"]) {
    await page.keyboard.press(key);
  }
  expect(await cursor()).toEqual(before);
});

test("the logical screen clips its overflow without becoming scrollable", async ({ page }) => {
  await page.goto("/?debugScenario=stage-04-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  // 邏輯畫面是純裁切，不是可捲區。用 `overflow: hidden` 時它其實有捲動餘量：位置牌
  // 的 17px 文字撐在 16px 行高裡，行內盒比 640x350 的下緣多出 2px。Chrome 只要想露出
  // 畫面裡剛被指向或取得焦點的控件（Playwright 點擊前的捲動、或選單開闔動畫還在跑時
  // 就被點到的按鈕都會觸發），就會把那 2px 捲掉，整個畫面連同肖像、對話窗與棋盤一起
  // 上移 2px 並停在那裡。`overflow: clip` 讓它根本不能捲。
  expect(await page.getByTestId("game-screen").evaluate((screen) => {
    const plate = document.querySelector(".bottom-location") as HTMLElement;
    const plateTop = () => plate.getBoundingClientRect().top - screen.getBoundingClientRect().top;
    const settled = plateTop();
    screen.scrollTop = 999;
    screen.scrollLeft = 999;
    return {
      settled,
      afterScrollAttempt: plateTop(),
      scrollTop: screen.scrollTop,
      scrollLeft: screen.scrollLeft,
    };
  })).toEqual({ settled: 332, afterScrollAttempt: 332, scrollTop: 0, scrollLeft: 0 });
});

test.describe("Tauri desktop window scaling", () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const calls: unknown[] = [];
      Object.defineProperty(window, "__TAURI_TEST_RESIZE_CALLS__", { value: calls });
      Object.defineProperties(window.screen, {
        availWidth: { value: 1920 },
        availHeight: { value: 1080 },
      });
      Object.defineProperty(window, "__TAURI_INTERNALS__", {
        value: {
          metadata: { currentWindow: { label: "main" } },
          invoke: async (command: string, args: Record<string, unknown>) => {
            if (command === "plugin:window|is_fullscreen" || command === "plugin:window|is_maximized") {
              return false;
            }
            if (command === "plugin:window|set_size") {
              const value = args.value as { toJSON?: () => unknown } | undefined;
              calls.push(value?.toJSON?.() ?? value);
            }
            return null;
          },
        },
      });
    });
  });

  test("fills a freely resized desktop client and integer mode sizes the native window", async ({ page }) => {
    await page.goto("/?debugScenario=stage-02-player&difficulty=0&test=1");
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-desktop-runtime", "true");
    await expect.poll(() => screenMetrics(page)).toMatchObject({
      scale: 2,
      screenWidth: 1280,
      viewportWidth: 1280,
    });
    // 沒有預留的宿主列：入口就在畫面右下角，跟著遊戲放大。
    await expect(page.getByTestId("display-settings")).toHaveCount(0);
    expect(await page.getByTestId("host-menu-trigger").boundingBox())
      .toEqual({ x: 618 * 2, y: 327 * 2, width: 40, height: 40 });
    await captureVisualAudit(page, {
      path: "artifacts/playwright/tauri-desktop-1280x800.png",
    });

    await page.setViewportSize({ width: 960, height: 600 });
    await expect.poll(async () => (await screenMetrics(page)).scale).toBeCloseTo(1.5, 6);
    expect((await screenMetrics(page)).screenWidth).toBe(960);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      const calls = (window as Window & { __TAURI_TEST_RESIZE_CALLS__?: unknown[] })
        .__TAURI_TEST_RESIZE_CALLS__;
      calls?.splice(0);
    });
    await setImageScaling(page, "integer");
    await expect.poll(() => page.evaluate(() => {
      const calls = (window as Window & { __TAURI_TEST_RESIZE_CALLS__?: unknown[] })
        .__TAURI_TEST_RESIZE_CALLS__ ?? [];
      return calls.length;
    })).toBe(1);
    const logical = await page.evaluate(() => {
      const calls = (window as Window & { __TAURI_TEST_RESIZE_CALLS__: Array<{
        Logical: { width: number; height: number };
      }> }).__TAURI_TEST_RESIZE_CALLS__;
      return calls.at(-1)?.Logical;
    });
    expect(logical?.width).toBe(1280);
    // 畫面下方不再預留宿主列，視窗剛好包住 2 倍畫面。
    expect(logical?.height).toBe(700);
  });

  // 原版鼠标是画进画面的软件光标，和游戏像素同倍率；宿主游标不随逻辑画面的 transform
  // 放大，2 倍画面里只剩一半大。指针一进画面就由画面内精灵接手，离开再交还宿主游标。
  test("the in-screen pointer is drawn at the game scale instead of the host cursor size", async ({ page }) => {
    await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
    const canvas = page.getByTestId("battle-canvas");
    await expect(canvas).toBeVisible();
    await expect.poll(async () => (await screenMetrics(page)).scale).toBe(2);
    await page.addStyleTag({ content: ".debug-toolbar { display: none !important; }" });

    const screen = page.getByTestId("game-screen");
    const sprite = page.getByTestId("native-pointer");
    const pointAt = async (logical: { x: number; y: number }) => {
      const box = await screen.boundingBox();
      if (!box) throw new Error("the logical screen has no layout box");
      // 落在逻辑像素正中，免得取整时掉到相邻像素。
      await page.mouse.move(box.x + logical.x * 2 + 1, box.y + logical.y * 2 + 1);
      await expect(sprite).toBeVisible();
      return sprite.evaluate((element) => {
        const screenBox = (element.parentElement as HTMLElement).getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return {
          frame: (element as HTMLElement).dataset.frame,
          box: { x: box.left - screenBox.left, y: box.top - screenBox.top, width: box.width, height: box.height },
          rendering: getComputedStyle(element).imageRendering,
          host: getComputedStyle(document.querySelector("#phaser-root canvas") as HTMLElement).cursor,
        };
      });
    };

    // 手指 24×24、热点 (3,2)：两倍画面里是 48×48，左上角落在 (x-3, y-2) 的两倍处。
    expect(await pointAt({ x: 200, y: 150 })).toEqual({
      frame: "hand",
      box: { x: 394, y: 296, width: 48, height: 48 },
      rendering: "pixelated",
      host: "none",
    });
    await expect(canvas).toHaveAttribute("data-native-pointer-cursor", "hand");
    // 原版上箭头 24×20、热点 (12,0)；复刻斜向箭头 18×18、热点在箭尖。
    expect((await pointAt({ x: 220, y: 5 })).box).toEqual({ x: 416, y: 10, width: 48, height: 40 });
    expect(await pointAt({ x: 5, y: 340 })).toMatchObject({
      frame: "down-left",
      box: { x: 8, y: 648, width: 36, height: 36 },
    });

    // 精灵跟随「畫面縮放」：平滑模式下和游戏画面一样双线性插值。
    await setImageScaling(page, "smooth");
    // 指针离开画面（移到画面下方的空白）就交还宿主游标。
    await page.mouse.move(640, 760);
    await expect(sprite).toBeHidden();
    await expect(screen).not.toHaveAttribute("data-native-pointer", "sprite");
    expect((await pointAt({ x: 200, y: 150 })).rendering).toBe("auto");
  });
});

/**
 * 桌面版的「介面縮放」。遊戲畫面在桌面版會放大填滿視窗，三個參考面板卻是
 * 固定 px 的 DOM，大螢幕上因此比原版自己的點陣字小上數倍。控制項走的是 WebView 真頁面
 * 縮放（和 `Ctrl +/-` 同一條路徑），所以這裡驗的是「有沒有把倍率交給 WebView」與
 * 「選擇有沒有留下來」，不是 CSS 有沒有變——真縮放不改任何一條 CSS。
 */
test.describe("Tauri host interface zoom", () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  const installTauri = async (page: Page): Promise<void> => {
    await page.addInitScript(() => {
      const zoomCalls: number[] = [];
      Object.defineProperty(window, "__TAURI_TEST_ZOOM_CALLS__", { value: zoomCalls });
      Object.defineProperty(window, "__TAURI_INTERNALS__", {
        value: {
          metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
          invoke: async (command: string, args: Record<string, unknown>) => {
            if (command === "plugin:webview|set_webview_zoom") zoomCalls.push(args.value as number);
            if (command === "plugin:window|scale_factor") return 1;
            if (command === "plugin:window|is_fullscreen" || command === "plugin:window|is_maximized") {
              return false;
            }
            return null;
          },
        },
      });
    });
  };

  const zoomCalls = (page: Page): Promise<number[]> => page.evaluate(() =>
    [...((window as Window & { __TAURI_TEST_ZOOM_CALLS__?: number[] }).__TAURI_TEST_ZOOM_CALLS__ ?? [])]);

  test("the menu row is desktop-only, hands the factor to the WebView and is remembered", async ({ page }) => {
    await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    // 網頁版沒有這一列：瀏覽器自己的縮放已經做同一件事。
    await openHostMenu(page);
    await expect(page.getByTestId("host-menu-row-interface-zoom")).toHaveCount(0);
    await expect(page.getByTestId("host-menu-row-image-scaling")).toBeVisible();

    await installTauri(page);
    await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
    await expect(page.locator("html")).toHaveAttribute("data-desktop-runtime", "true");
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await openHostMenu(page);
    const row = page.getByTestId("host-menu-row-interface-zoom");
    await row.click();
    await expect(page.getByTestId("host-menu-option-100")).toHaveAttribute("aria-checked", "true");
    // 預設 100% 不必為了「還原」多發一次呼叫：新開的 WebView 本來就是 100%。
    expect(await zoomCalls(page)).toEqual([]);

    await page.getByTestId("host-menu-option-150").click();
    // 交給 WebView 是非同步的（動態載入 Tauri 介面），等它真的發出去。
    await expect.poll(() => zoomCalls(page)).toEqual([1.5]);
    await expect(row).toBeFocused();
    await expect(page.getByTestId("host-menu-description")).toContainText("150%");
    await expect(page.getByTestId("host-menu-description")).toContainText("說明視窗");

    // 兩個宿主顯示偏好共用同一筆記錄，互相不得覆寫。
    await page.getByTestId("host-menu-row-image-scaling").click();
    await page.getByTestId("host-menu-option-smooth").click();
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem("angel2.preferences.display.v1") ?? "null")))
      .toEqual({ imageScaling: "smooth", interfaceZoom: 150, portraitStyle: "original" });

    await page.reload();
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await openHostMenu(page);
    await page.getByTestId("host-menu-row-interface-zoom").click();
    await expect(page.getByTestId("host-menu-option-150")).toHaveAttribute("aria-checked", "true");
    // 還原只發一次：表面切換會重建宿主選單，但頁面縮放屬於整個 WebView，
    // 重複套用會把玩家用 `Ctrl +/-` 調過的倍率蓋回去。
    expect(await zoomCalls(page)).toEqual([1.5]);
  });

  test("integer mode converts its CSS-pixel target into OS logical pixels", async ({ page }) => {
    await installTauri(page);
    await page.addInitScript(() => {
      const calls: unknown[] = [];
      Object.defineProperty(window, "__TAURI_TEST_RESIZE_CALLS__", { value: calls });
      Object.defineProperties(window.screen, {
        availWidth: { value: 1920 },
        availHeight: { value: 1080 },
      });
      const internals = (window as unknown as {
        __TAURI_INTERNALS__: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
      }).__TAURI_INTERNALS__;
      const inner = internals.invoke;
      internals.invoke = async (command, args) => {
        if (command === "plugin:window|set_size") {
          const value = args.value as { toJSON?: () => unknown } | undefined;
          calls.push(value?.toJSON?.() ?? value);
        }
        // 頁面縮放 150%：`devicePixelRatio` 含縮放，視窗的 scaleFactor 不含。
        if (command === "plugin:window|scale_factor") return 1;
        return inner(command, args);
      };
      Object.defineProperty(window, "devicePixelRatio", { value: 1.5 });
    });
    await page.goto("/?debugScenario=stage-02-player&difficulty=0&test=1");
    await expect(page.getByTestId("battle-canvas")).toBeVisible();

    await setImageScaling(page, "integer");
    await expect.poll(() => page.evaluate(() => {
      const calls = (window as Window & { __TAURI_TEST_RESIZE_CALLS__?: unknown[] })
        .__TAURI_TEST_RESIZE_CALLS__ ?? [];
      return calls.length;
    })).toBeGreaterThan(0);
    const logical = await page.evaluate(() => {
      const calls = (window as Window & { __TAURI_TEST_RESIZE_CALLS__: Array<{
        Logical: { width: number; height: number };
      }> }).__TAURI_TEST_RESIZE_CALLS__;
      return calls.at(-1)?.Logical;
    });
    const cssWidth = await page.evaluate(() => Number(
      getComputedStyle(document.querySelector(".logical-screen") as Element)
        .getPropertyValue("--game-scale")) * 640);
    // 少了換算，這裡會等於 CSS 寬度，視窗每次重算就再縮小 1/1.5。
    expect(logical?.width).toBe(Math.round(cssWidth * 1.5));
  });
});
