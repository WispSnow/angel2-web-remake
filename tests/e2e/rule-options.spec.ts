import { expect, type Page, test } from "@playwright/test";
import { hostMenu, openHostMenu, resumeFromHostMenu } from "./host-menu-helpers";
import { captureVisualAudit } from "./visual-audit";

/**
 * `REMAKE-215`／`REMAKE-216` 懷舊規則選項：右下角宿主選單裡的「敗退保留經驗」與「原版冰雪」。
 * 兩者預設關閉、按瀏覽器保存；只在正式戰役表面出現。
 */

const RULE_PREFERENCES_KEY = "angel2.preferences.rules.v1";

const keepRow = (page: Page) => page.getByTestId("host-menu-row-keep-growth");
const iceRow = (page: Page) => page.getByTestId("host-menu-row-original-ice");

async function storedRules(page: Page): Promise<unknown> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), RULE_PREFERENCES_KEY);
}

async function setOriginalIceFromMenu(page: Page, enabled: boolean): Promise<void> {
  await openHostMenu(page);
  if (await iceRow(page).getAttribute("aria-checked") !== String(enabled)) await iceRow(page).click();
  await expect(iceRow(page)).toHaveAttribute("aria-checked", String(enabled));
  await resumeFromHostMenu(page);
}

test("the corner menu offers both nostalgia switches, off by default and remembered", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("startup-screen")).toBeVisible();
  await openHostMenu(page);
  const description = page.getByTestId("host-menu-description");

  for (const [row, lamp] of [
    [keepRow(page), page.getByTestId("host-menu-keep-growth-lamp")],
    [iceRow(page), page.getByTestId("host-menu-original-ice-lamp")],
  ] as const) {
    await expect(row).toHaveAttribute("role", "menuitemcheckbox");
    await expect(row).toHaveAttribute("aria-checked", "false");
    await expect(lamp).toHaveAttribute("data-state", "off");
  }
  expect(await storedRules(page)).toBeNull();

  // Keyboard: ↓ from 繼續遊戲 → 畫面縮放 → 敗退保留經驗, Enter toggles it.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(keepRow(page)).toBeFocused();
  await expect(description).toContainText("敗退保留經驗");
  await expect(description).toContainText("關");
  await expect(description).toContainText("回到進入本關時");
  await page.keyboard.press("Enter");
  await expect(keepRow(page)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("host-menu-keep-growth-lamp")).toHaveAttribute("data-state", "on");
  await expect(description).toContainText("保留這次嘗試得到的經驗值");

  // Pointer: one click on 原版冰雪.
  await iceRow(page).click();
  await expect(iceRow(page)).toHaveAttribute("aria-checked", "true");
  await expect(description).toContainText("原版機制明顯過強、不平衡");
  expect(await storedRules(page)).toEqual({ keepFailedAttemptGrowth: true, originalIce: true });
  await captureVisualAudit(page.getByTestId("host-menu"), { path: "artifacts/rule-options/host-menu.png" });

  await page.reload();
  await expect(page.getByTestId("startup-screen")).toBeVisible();
  await openHostMenu(page);
  await expect(keepRow(page)).toHaveAttribute("aria-checked", "true");
  await expect(iceRow(page)).toHaveAttribute("aria-checked", "true");
  await keepRow(page).click();
  await expect(keepRow(page)).toHaveAttribute("aria-checked", "false");
  expect(await storedRules(page)).toEqual({ keepFailedAttemptGrowth: false, originalIce: true });
});

test("labs keep the remake rules and do not show the switches", async ({ page }) => {
  await page.goto("/combat-lab.html");
  await openHostMenu(page);
  await expect(hostMenu(page).locator("[data-host-menu-row]").first()).toBeVisible();
  await expect(keepRow(page)).toHaveCount(0);
  await expect(iceRow(page)).toHaveCount(0);
});

interface IceDebugState {
  units: Array<{ id: string; x: number; y: number; actionDisabled: boolean }>;
  lastSpecialAction?: { actionId?: string; affectedUnits: Array<{ unitId: string; moved: boolean }> };
  specialActionPresentation?: object;
}

const iceState = (page: Page) => page.evaluate(() => window.__ANGEL2__?.getState() as IceDebugState);

test("原版冰雪 previews one band and pushes in the fixed native order", async ({ page }) => {
  await page.goto("/?debugScenario=stage-01-magician&difficulty=0&test=1");
  const canvas = page.getByTestId("battle-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-phase", "player");

  // Remake rules first: the preview has the amber shove-only ring.
  await page.keyboard.press("Space");
  await page.getByTestId("unit-command-technique").click();
  await page.getByTestId("technique-ice-1").click();
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-action-mode", "selfAreaConfirm");
  await expect(canvas).not.toHaveAttribute("data-ice-cast-preview-displacement-cell-count", "0");
  await expect(page.getByTestId("ice-cast-summary")).toContainText("黃圈只推開");
  const footprint = Number(await canvas.getAttribute("data-ice-cast-preview-freeze-cell-count"))
    + Number(await canvas.getAttribute("data-ice-cast-preview-displacement-cell-count"));

  // Switching mid-preview takes effect at once: the whole footprint freezes.
  await setOriginalIceFromMenu(page, true);
  await expect(canvas).toHaveAttribute("data-ice-cast-preview-displacement-cell-count", "0");
  await expect(canvas).toHaveAttribute("data-ice-cast-preview-freeze-cell-count", String(footprint));
  await expect(page.getByTestId("ice-cast-summary")).not.toContainText("黃圈只推開");
  // The full sentence (title / accessible name) follows the switch too.
  await expect(page.getByTestId("ice-cast-summary")).toHaveAttribute("aria-label", /範圍內的敵軍都會被冰封/u);
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/rule-options/original-ice-preview.png" });

  const before = await iceState(page);
  const target = before.units.find(({ id }) => id === "2:45");
  if (!target) throw new Error("stage-01-magician fields 2:45 beside the magician");
  await page.keyboard.press(" ");
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as IceDebugState | undefined;
    return current?.lastSpecialAction?.actionId === "ice-1" && current.specialActionPresentation === undefined;
  });
  const after = await iceState(page);
  const pushed = after.units.find(({ id }) => id === "2:45");
  // The fixture stands it due east of the caster. The remake pushes it further east
  // (REMAKE-096); the native down/up/left/right scan takes a vertical step instead.
  expect(pushed).toMatchObject({ x: target.x, actionDisabled: true });
  expect(Math.abs((pushed?.y ?? target.y) - target.y)).toBe(1);
  await expect(canvas).toHaveAttribute("data-ice-disabled-unit-ids", /2:45/u);
});
