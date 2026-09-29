import { expect, test, type Page } from "@playwright/test";
import { PREBATTLE_STORY } from "../../src/game/content/dialogue";

interface KeyboardControlState {
  cursor: { x: number; y: number };
  focusId: string;
  actionMode: string;
  groupCommandOpen: boolean;
  objectiveOpen: boolean;
  systemMenuOpen: boolean;
  units: Array<{
    id: string;
    side: number;
    x: number;
    y: number;
    acted: boolean;
    actionDisabled: boolean;
  }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as KeyboardControlState,
);

test("modern keyboard defaults keep navigation, confirm, cancel and battle shortcuts distinct", async ({ page }) => {
  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const baseline = await state(page);
  await page.keyboard.press("d");
  await expect.poll(async () => (await state(page)).cursor)
    .toEqual({ x: baseline.cursor.x + 1, y: baseline.cursor.y });
  await page.keyboard.press("a");
  await page.keyboard.press("s");
  await expect.poll(async () => (await state(page)).cursor)
    .toEqual({ x: baseline.cursor.x, y: baseline.cursor.y + 1 });
  await page.keyboard.press("w");
  await expect.poll(async () => (await state(page)).cursor).toEqual(baseline.cursor);

  await page.keyboard.press("Tab");
  const afterTab = await state(page);
  expect(afterTab.cursor).not.toEqual(baseline.cursor);
  expect(afterTab.groupCommandOpen).toBe(false);
  expect(afterTab.units.some((unit) => unit.side === 1
    && !unit.acted
    && !unit.actionDisabled
    && unit.x === afterTab.cursor.x
    && unit.y === afterTab.cursor.y)).toBe(true);

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("action-menu")).toBeVisible();
  expect((await state(page)).actionMode).toBe("actionMenu");
  await page.keyboard.press("Backspace");
  await expect(page.getByTestId("action-menu")).toBeHidden();
  expect((await state(page))).toMatchObject({ actionMode: "idle", systemMenuOpen: false });

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("system-menu")).toBeHidden();

  await page.keyboard.press("g");
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await page.keyboard.press("g");
  await expect(page.getByTestId("group-command-menu")).toBeHidden();

  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toBeVisible();
  await page.keyboard.press("o");
  await expect(page.getByTestId("objective-panel")).toBeHidden();
});

type PadWindow = typeof window & { __setBattlePadButton?: (index: number, down: boolean) => void };

/** Replaces `navigator.getGamepads` with one standard pad whose buttons the test sets. */
const installFakeGamepad = (page: Page) => page.addInitScript(() => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
  const gamepad = {
    axes: [0, 0, 0, 0],
    buttons,
    connected: true,
    hapticActuators: [],
    id: "battle-controls-test-pad",
    index: 0,
    mapping: "standard",
    timestamp: 0,
    vibrationActuator: null,
  } as unknown as Gamepad;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [gamepad],
  });
  (window as PadWindow).__setBattlePadButton = (index, down) => {
    buttons[index] = { pressed: down, touched: down, value: down ? 1 : 0 };
  };
});

const setPadButton = (page: Page, button: number, down: boolean) => page.evaluate(
  ([index, pressed]) => (window as PadWindow).__setBattlePadButton?.(index, pressed),
  [button, down] as const,
);

test("standard gamepad exposes the documented battle actions", async ({ page }) => {
  await installFakeGamepad(page);
  const pulse = async (button: number) => {
    await setPadButton(page, button, true);
    await page.waitForTimeout(70);
    await setPadButton(page, button, false);
    await page.waitForTimeout(40);
  };

  await page.goto("/?debugScenario=stage-00-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();

  const baseline = await state(page);
  await pulse(15); // D-pad right
  await expect.poll(async () => (await state(page)).cursor)
    .toEqual({ x: baseline.cursor.x + 1, y: baseline.cursor.y });
  await pulse(5); // RB
  const afterRb = await state(page);
  expect(afterRb.cursor).not.toEqual({ x: baseline.cursor.x + 1, y: baseline.cursor.y });

  await pulse(0); // A
  await expect(page.getByTestId("action-menu")).toBeVisible();
  await pulse(1); // B
  await expect(page.getByTestId("action-menu")).toBeHidden();

  await pulse(3); // Y
  await expect(page.getByTestId("group-command-menu")).toBeVisible();
  await pulse(3);
  await expect(page.getByTestId("group-command-menu")).toBeHidden();

  await pulse(4); // LB
  await expect(page.getByTestId("objective-panel")).toBeVisible();
  await pulse(4);
  await expect(page.getByTestId("objective-panel")).toBeHidden();

  await pulse(9); // Menu / Start
  await expect(page.getByTestId("system-menu")).toBeVisible();
  await pulse(9);
  await expect(page.getByTestId("system-menu")).toBeHidden();
});

test("gamepad A shares the keyboard confirm: it completes a typing story page before turning it", async ({ page }) => {
  // One glyph is 12 ms of program time under `?test=1`, and the pad is polled on
  // animation frames. A paused clock holds page 2 mid-typing while A is pressed.
  await installFakeGamepad(page);
  await page.clock.install();
  await page.goto("/?debugScenario=stage-00-prebattle&difficulty=0&test=1");
  const layer = page.getByTestId("dialogue-layer");
  const typedText = () => page.locator("#dialogue-text").evaluate((element) => element.textContent ?? "");
  const pageText = (wait: number) => PREBATTLE_STORY[wait - 1].lower?.text ?? "";
  await expect(layer).toHaveAttribute("data-source-wait", "1");
  await expect.poll(typedText).toBe(pageText(1));
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 500);
  const pulseA = async () => {
    await setPadButton(page, 0, true);
    await page.clock.runFor(16);
    await setPadButton(page, 0, false);
    await page.clock.runFor(16);
  };

  // A on a finished page turns it; page 2 reuses the lower window and starts typing at once.
  await pulseA();
  await expect(layer).toHaveAttribute("data-source-wait", "2");
  const partial = (await typedText()).length;
  expect(partial).toBeGreaterThan(0);
  expect(partial).toBeLessThan(pageText(2).length);

  // The first A on the typing page only completes it, exactly like Enter or a click.
  await pulseA();
  expect(await layer.getAttribute("data-source-wait")).toBe("2");
  expect(await typedText()).toBe(pageText(2));

  await pulseA();
  await expect(layer).toHaveAttribute("data-source-wait", "3");
  await page.clock.resume();
});
