import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = "artifacts/playwright";

test.beforeAll(() => mkdirSync(ARTIFACT_DIR, { recursive: true }));

test("portrait lab loads every native character and previews reusable blink and speech layers", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/portrait-lab.html");
  const lab = page.getByTestId("portrait-lab");
  await expect(lab).toBeVisible();
  await expect(page.locator("[data-portrait-card]")).toHaveCount(68);
  await expect(page.locator("[data-animation-available=true]")).toHaveCount(67);
  await expect(page.getByTestId("portrait-record-63")).toHaveAttribute("data-animation-available", "false");

  await page.waitForFunction(() => Array.from(document.images).every(
    (image) => image.complete && image.naturalWidth > 0,
  ));
  expect(await page.locator("[data-portrait-card] img").count()).toBe(470);

  for (const record of [0, 15, 42, 43, 44, 45, 46, 47, 48]) {
    const card = page.getByTestId(`portrait-record-${record}`);
    const composite = card.locator(".animated-portrait");
    await expect(card).toBeVisible();
    await expect(composite.locator(".portrait-eye")).toHaveCount(3);
    await expect(composite.locator(".portrait-mouth")).toHaveCount(3);
    await expect.poll(async () => Number(await composite.getAttribute("data-talk-count"))).toBeGreaterThan(0);
    await expect.poll(async () => Number(await composite.getAttribute("data-blink-count"))).toBeGreaterThan(0);
  }

  await page.locator('[data-blink="3"]').click();
  await page.locator('[data-mouth="2"]').click();
  await expect(page.getByTestId("portrait-record-42").locator(".animated-portrait"))
    .toHaveAttribute("data-force-blink-frame", "3");
  await expect(page.getByTestId("portrait-record-43").locator(".animated-portrait"))
    .toHaveAttribute("data-force-mouth-frame", "2");
  await page.screenshot({ path: `${ARTIFACT_DIR}/portrait-lab-current-cast.png`, fullPage: true });

  await page.locator("[data-portrait-filter]").selectOption("all");
  const archer = page.getByTestId("portrait-record-59");
  const archerEye = archer.locator(".portrait-eye-1");
  await expect(archer).toBeVisible();
  await expect(archer).toContainText("REMAKE-010 修正原版眼位 40,24");
  await expect(archerEye).toHaveAttribute(
    "style",
    /left:50\.000000%;top:21\.428571%/,
  );
  const archerOpenEyeMismatch = await archer.evaluate(async (card) => {
    const base = card.querySelector<HTMLImageElement>(".portrait-base");
    const eye = card.querySelector<HTMLImageElement>(".portrait-eye-1");
    if (!base || !eye) return { applied: -1, native: -1 };
    await Promise.all([base.decode(), eye.decode()]);
    const canvas = document.createElement("canvas");
    canvas.width = base.naturalWidth;
    canvas.height = base.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { applied: -1, native: -1 };
    context.drawImage(base, 0, 0);
    const appliedPixels = context.getImageData(56, 24, eye.naturalWidth, eye.naturalHeight).data;
    const nativePixels = context.getImageData(40, 24, eye.naturalWidth, eye.naturalHeight).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(eye, 0, 0);
    const eyePixels = context.getImageData(0, 0, eye.naturalWidth, eye.naturalHeight).data;
    const mismatch = (basePixels: Uint8ClampedArray) => {
      let total = 0;
      for (let index = 0; index < basePixels.length; index += 1) {
        total += Math.abs(basePixels[index] - eyePixels[index]);
      }
      return total;
    };
    return { applied: mismatch(appliedPixels), native: mismatch(nativePixels) };
  });
  expect(archerOpenEyeMismatch.applied).toBe(0);
  expect(archerOpenEyeMismatch.native).toBeGreaterThan(0);
  await page.locator('[data-blink="3"]').click();
  await archer.screenshot({ path: `${ARTIFACT_DIR}/portrait-lab-archer-corrected.png` });
  await expect(page.getByTestId("portrait-record-67")).toBeVisible();
  await expect(page.getByTestId("portrait-record-67")).toContainText("布局沿用 D/56");
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
