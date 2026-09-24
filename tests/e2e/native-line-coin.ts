import type { Page } from "@playwright/test";

export type NativeLineCoin = "open" | "closed";

type CoinHost = typeof window & { __angel2NativeLineCoin?: NativeLineCoin };

/**
 * Module 29 opens a DS:84BB contextual line or AI technique notice only on six
 * PIT draws in ten (`0000:C981` → `0000:CAC3`) unless it is `18h` or
 * `1Fh..22h`, and the remake rolls that coin from `Math.random` (REMAKE-161).
 * Specs that assert those windows pin the draw before the page loads: `open`
 * keeps every draw in `[0, 0.6)`, `closed` in `[0.6, 1)`. A small LCG keeps the
 * values distinct, so the page's other cosmetic randomness (portrait blinks)
 * still sees varied numbers. Each new document starts from `mode` again.
 */
export async function pinNativeLineCoin(page: Page, mode: NativeLineCoin = "open"): Promise<void> {
  await page.addInitScript((initial: NativeLineCoin) => {
    const host = window as CoinHost;
    host.__angel2NativeLineCoin = initial;
    let seed = 0x2f6b1a3d;
    Math.random = () => {
      seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
      const unit = seed / 0x1_0000_0000;
      return host.__angel2NativeLineCoin === "closed" ? 0.6 + unit * 0.4 : unit * 0.6;
    };
  }, mode);
}

/** Flips a pinned coin for the rest of the current document. */
export async function setNativeLineCoin(page: Page, mode: NativeLineCoin): Promise<void> {
  await page.evaluate((next: NativeLineCoin) => {
    (window as CoinHost).__angel2NativeLineCoin = next;
  }, mode);
}
