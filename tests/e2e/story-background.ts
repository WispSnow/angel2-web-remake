import { expect, type Page } from "@playwright/test";

/**
 * 核對 `#story-background` 正在畫哪一張劇情底圖。
 *
 * 資源包上線後，`ui.ts` 一律把 `--story-illustration` 設成
 * `stagedRenderAssetSource()` 交回的物件網址，計算樣式裡的 `background-image`
 * 因此只剩 `blob:`，`/assets/original/*.png` 這個檔名再也不會出現——直接比對檔名的
 * 舊寫法在資源閘門生效後永遠不成立。檔案身分改由 `ui.ts` 就地寫下的
 * `--story-illustration-source` 核對，`blob:` 那一項則繼續證明圖真的是由資源包畫出來的，
 * 而不是退回未暫存的原始網址。
 */
export async function expectStoryBackground(page: Page, source: RegExp): Promise<void> {
  const background = page.locator("#story-background");
  await expect(background).toHaveCSS("background-image", /blob:/u);
  await expect(background).toHaveCSS("--story-illustration-source", source);
}
