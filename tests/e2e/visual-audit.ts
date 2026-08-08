import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Locator, Page } from "@playwright/test";

interface VisualAuditScreenshotOptions {
  path: string;
  animations?: "allow" | "disabled";
  fullPage?: boolean;
}

export async function captureVisualAudit(
  target: Page | Locator,
  options: VisualAuditScreenshotOptions,
): Promise<void> {
  if (process.env.VISUAL_AUDIT !== "1") return;
  mkdirSync(dirname(options.path), { recursive: true });
  if ("page" in target) {
    await target.screenshot(options as Parameters<Locator["screenshot"]>[0]);
    return;
  }
  await target.screenshot(options as Parameters<Page["screenshot"]>[0]);
}
