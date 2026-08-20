import { expect, test, type Locator, type Page } from "@playwright/test";
import { skipStoryDialogue } from "./dialogue-controls";

/**
 * `A/18` 對話窗的開闔動畫。
 *
 * 原版 `WU`／`WD` 走 `0000:0F41` 的 11 步展開，四列貼圖從 `[313,337,345,361]` 每步
 * 外移 16 px，窗體以中心為軸從 80 px 長到 400 px；`CU`／`CD` 走 `0000:0FDF`，同一個
 * 繪製體反向跑 12 次收回。步數與那串寬度是原版事實，逐步時長是複刻決定。
 *
 * 這裡守住三件會真的被玩家看到的事：展開的每一格寬度就是原版那一串、收合期間對話層
 * 與肖像不能提前消失（原版是 `CU` 收完才輪到 `PU`／`ED`），以及收合一定會結束——包含
 * 系統要求減少動態時，本作刻意不跟隨、動畫照常播完的那條路徑。
 *
 * 用第 0 關關前劇情觸發收合：它跳過後直接回到同一張戰鬥表面，`main.ts` 不會換掉整個
 * DOM，收合才有機會播完。有部署階段的關卡會整層重建，那條路徑由 `finishMenuClose`
 * 同級的卸載結清負責，不在本檔斷言。
 */

interface WindowMutation {
  className: string;
  hidden: boolean;
  layerHidden: boolean;
  boxHidden: boolean;
}

declare global {
  interface Window {
    __dialogueWindowMutations?: WindowMutation[];
  }
}

/** 原版展開的 11 格：`(400 - 寬)/2`，對應窗體 80、112、…、400 px。 */
const NATIVE_OPEN_INSETS = [
  "160px", "144px", "128px", "112px", "96px", "80px", "64px", "48px", "32px", "16px", "0px",
];

const STORY_SCENARIO = "/?debugScenario=stage-00-prebattle&difficulty=0&test=1";

const storyPanel = (page: Page): Locator => page.getByTestId("dialogue-layer")
  .locator(".dialogue-copy:not([hidden])")
  .first();

/**
 * 收合只有一百多毫秒，靠「關閉後立刻斷言」會變成計時競賽。改成先掛 MutationObserver
 * 記錄整段過程，關完再回頭檢查中間態，斷言就與機器快慢無關。
 */
async function recordWindowMutations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>("#dialogue-layer")!;
    const log: WindowMutation[] = [];
    window.__dialogueWindowMutations = log;
    for (const id of ["dialogue-copy-upper", "dialogue-copy-lower"]) {
      const panel = document.getElementById(id)!;
      new MutationObserver(() => log.push({
        className: panel.className,
        hidden: (panel as HTMLElement).hidden,
        layerHidden: layer.hidden,
        boxHidden: panel.closest<HTMLElement>(".dialogue-box")!.hidden,
      })).observe(panel, { attributes: true, attributeFilter: ["class", "hidden"] });
    }
  });
}

const windowMutations = (page: Page) => page.evaluate(
  () => window.__dialogueWindowMutations ?? [],
);

test("the A/18 window expands from the centre through the native step widths", async ({ page }) => {
  await page.goto(STORY_SCENARIO);
  const panel = storyPanel(page);
  await expect(panel).toBeVisible();

  const declared = await panel.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      name: style.animationName,
      duration: style.animationDuration,
      timing: style.animationTimingFunction,
    };
  });
  expect(declared.name).toBe("dialogue-window-open");
  expect(declared.timing).toBe("steps(11, jump-none)");
  expect(Number.parseFloat(declared.duration)).toBeGreaterThan(0.05);
  // 原版 `0000:0F41` 跑 11 次、`0000:0FDF` 跑 12 次；方框上的標記要跟著實作走。
  const box = page.getByTestId("dialogue-window-lower");
  await expect(box).toHaveAttribute("data-open-steps", "11");
  await expect(box).toHaveAttribute("data-close-steps", "12");

  // 重播一次並逐格取樣：這 11 個值就是原版四列貼圖每步外移 16 px 的結果。
  const samples = await panel.evaluate((element) => {
    const panelElement = element as HTMLElement;
    panelElement.hidden = true;
    panelElement.getBoundingClientRect();
    panelElement.hidden = false;
    const animation = panelElement.getAnimations().find((candidate) =>
      candidate instanceof CSSAnimation && candidate.animationName === "dialogue-window-open"
    );
    if (!animation) return [];
    animation.pause();
    const stepMs = Number.parseFloat(getComputedStyle(panelElement).animationDuration) * 1000 / 11;
    const insets: string[] = [];
    for (let step = 0; step < 11; step += 1) {
      animation.currentTime = step * stepMs + stepMs / 2;
      insets.push(getComputedStyle(panelElement).getPropertyValue("--dialogue-window-inset").trim());
    }
    animation.cancel();
    return insets;
  });
  expect(samples).toEqual(NATIVE_OPEN_INSETS);

  // 兩端框邊要跟著收攏，否則玩家看到的是被裁掉的大窗而不是原版的小窗。三段列高從第
  // 一步就是完整的 86 px，所以縱向永遠不裁。
  const frame = await panel.evaluate((element) => {
    const panelElement = element as HTMLElement;
    panelElement.style.setProperty("--dialogue-window-inset", "160px");
    const before = getComputedStyle(panelElement, "::before");
    const after = getComputedStyle(panelElement, "::after");
    const measured = {
      clip: getComputedStyle(panelElement).clipPath,
      left: before.left,
      leftWidth: before.width,
      leftHeight: before.height,
      right: after.right,
      rightWidth: after.width,
    };
    panelElement.style.removeProperty("--dialogue-window-inset");
    return measured;
  });
  expect(frame).toEqual({
    clip: "inset(0px 160px)",
    left: "160px",
    leftWidth: "40px",
    leftHeight: "86px",
    right: "160px",
    rightWidth: "40px",
  });
});

test("the layer and its portrait outlive the closing window", async ({ page }) => {
  await page.goto(STORY_SCENARIO);
  await expect(storyPanel(page)).toBeVisible();

  await recordWindowMutations(page);
  await skipStoryDialogue(page);
  // 第 0 關跳過關前劇情後會立刻接上戰場內的開場劇情，對話層不會停在隱藏態，所以等
  // 的是「收合已經走完」而不是圖層消失。
  await page.waitForFunction(() => (window.__dialogueWindowMutations ?? []).some((entry) =>
    !entry.className.includes("is-dialogue-window-closing") && entry.hidden));

  const log = await windowMutations(page);
  const closing = log.filter((entry) => entry.className.includes("is-dialogue-window-closing"));
  expect(closing.length).toBeGreaterThan(0);
  // 收合中的那一格：窗體仍在畫面上，而且對話層與肖像方框都還沒被收掉——原版是 `CU`
  // 收完窗體才輪到 `PU` 擦肖像、`ED` 還原畫面。
  expect(closing.some((entry) => !entry.hidden)).toBe(true);
  for (const entry of closing) {
    if (entry.hidden) continue;
    expect(entry.layerHidden).toBe(false);
    expect(entry.boxHidden).toBe(false);
  }
  // 收尾必須把收合類名與圖層一起收乾淨，否則下次開啟會停在 80 px。
  const settled = log.find((entry) =>
    !entry.className.includes("is-dialogue-window-closing") && entry.hidden);
  expect(settled?.layerHidden).toBe(true);
});

// `test.use({ reducedMotion })` 在本套件不會落到頁面上（見 `menu-animation.spec.ts`），
// 所以顯式 `emulateMedia`，斷言才真的跑在系統要求減少動態的路徑上。
/**
 * 本作刻意不跟隨系統「減少動態效果」：原版的演出是玩法節奏的一部分，壓成瞬時等於換掉
 * 遊戲，而不是保留同一個遊戲的無障礙版本。開闔因此照常播完整長度，收尾也照常收乾淨。
 */
test("the system motion preference does not switch off the window animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(STORY_SCENARIO);
  const panel = storyPanel(page);
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const declared = await panel.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: Number.parseFloat(style.animationDuration) };
  });
  expect(declared.name).toBe("dialogue-window-open");
  expect(declared.duration).toBeGreaterThan(0.05);

  await recordWindowMutations(page);
  await skipStoryDialogue(page);
  await page.waitForFunction(() => (window.__dialogueWindowMutations ?? []).some((entry) =>
    !entry.className.includes("is-dialogue-window-closing") && entry.hidden));
  expect((await windowMutations(page)).some((entry) =>
    entry.className.includes("is-dialogue-window-closing") && !entry.hidden)).toBe(true);
  await expect(page.locator(".dialogue-copy.is-dialogue-window-closing")).toHaveCount(0);
});
