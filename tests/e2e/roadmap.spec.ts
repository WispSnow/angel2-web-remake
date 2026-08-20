import { expect, test } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

test("RoadMap 展示候選方向、QQ 群與原始二維碼", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByTestId("roadmap-open");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveText("RoadMap");
  await captureVisualAudit(page.getByTestId("display-settings"), {
    path: "artifacts/playwright/roadmap-trigger.png",
  });

  await trigger.click();
  await expect(page.getByTestId("roadmap-body")).toBeVisible();
  await expect(page.getByTestId("roadmap-tabs").getByRole("tab"))
    .toHaveText(["畫面與聲音", "劇情與玩法", "Mod 與共創"]);
  await expect(page.getByTestId("roadmap-tab-presentation"))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("roadmap-notice")).toContainText("不是承諾時程");
  await expect(page.getByTestId("roadmap-item-hd-portraits")).toContainText("立繪高清化重製");
  await expect(page.getByTestId("roadmap-item-ai-voices")).toContainText("AI 角色配音");

  await expect(page.getByTestId("roadmap-qq-group")).toContainText("1107513111");
  const qr = page.getByRole("img", { name: "QQ 交流群 1107513111 二維碼" });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", "/assets/community/qq-group-1107513111.jpg");
  await expect.poll(() => qr.evaluate((image: HTMLImageElement) => ({
    complete: image.complete,
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))).toEqual({ complete: true, width: 1284, height: 2283 });

  await page.getByTestId("roadmap-tab-story").click();
  await expect(page.getByTestId("roadmap-item-richer-dialogue")).toContainText("豐富人物對話");
  await expect(page.getByTestId("roadmap-item-hd-portraits")).toHaveCount(0);

  await page.getByTestId("roadmap-tab-community").click();
  await expect(page.getByTestId("roadmap-item-campaign-balance-mods"))
    .toContainText("戰役關卡平衡 Mod");
  await expect(page.getByTestId("roadmap-item-stage-editor")).toContainText("關卡編輯器");

  await captureVisualAudit(page, { path: "artifacts/playwright/roadmap-desktop.png" });

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("roadmap-body")).toBeHidden();
  await expect(trigger).toBeFocused();

  // 每次都固定回到第一頁，RoadMap 不把上次瀏覽位置當成遊戲狀態。
  await trigger.click();
  await expect(page.getByTestId("roadmap-tab-presentation"))
    .toHaveAttribute("aria-selected", "true");
});

test("RoadMap 在窄螢幕改為單欄且仍可完整捲動", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("roadmap-open").click();

  const roadmap = page.locator(".rn-roadmap");
  const item = page.getByTestId("roadmap-item-hd-portraits");
  const community = page.locator(".rn-roadmap-community");
  const [roadmapBox, itemBox, communityBox] = await Promise.all([
    roadmap.boundingBox(),
    item.boundingBox(),
    community.boundingBox(),
  ]);
  expect(roadmapBox).not.toBeNull();
  expect(itemBox).not.toBeNull();
  expect(communityBox).not.toBeNull();
  if (roadmapBox && itemBox && communityBox) {
    expect(itemBox.width).toBeGreaterThan(roadmapBox.width - 2);
    expect(communityBox.y).toBeGreaterThan(itemBox.y + itemBox.height);
  }

  await page.getByTestId("roadmap-body").evaluate((body) => {
    body.scrollTop = body.scrollHeight;
  });
  const qr = page.getByRole("img", { name: "QQ 交流群 1107513111 二維碼" });
  await expect(qr).toBeVisible();
  await qr.evaluate((image: HTMLImageElement) => image.decode());
  await captureVisualAudit(page, { path: "artifacts/playwright/roadmap-mobile.png" });
});
