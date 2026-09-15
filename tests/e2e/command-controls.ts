import { expect, type Page } from "@playwright/test";
import { expectMenuOpen, settleMenuAnimation } from "./menu-controls";

/**
 * 用滑鼠按下職業選單上的一行命令。
 *
 * 指標一移進某行，`pointermove` 就先把高亮移過去（`controller.selectCommand`），控制器同步通知後
 * `ui.ts` 以 `innerHTML` 重建整份選單。直接 `click()` 時，Playwright 自己移動滑鼠就會觸發這次重建，
 * 接下來的按下對準的是已被換掉的舊按鈕：Playwright 攔下整組按下／放開／點擊，回報
 * `<html> intercepts pointer events`，再對新按鈕重試。遊戲只收到重試那一次，不會重複提交，但追蹤
 * 紀錄看起來像按了兩下，動作也多拖一輪重試。先 `hover()` 讓重建落地（hover 本身因此會重試一次，但
 * 只移動高亮），按下就一次到位。
 */
export async function chooseUnitCommand(page: Page, commandId: string): Promise<void> {
  const menu = page.getByTestId("action-menu");
  await expectMenuOpen(menu);
  await settleMenuAnimation(menu);
  const command = page.getByTestId(`unit-command-${commandId}`);
  await command.hover();
  await command.click();
}

/**
 * 按「攻擊」，而攻擊者只有一個相鄰合法目標。
 *
 * 普通攻擊恰有一個目標時會自動鎖定並立刻提交，不打開手動選格（`[OF]`，見
 * `design/remake-gdd/03-battle-rules.md` 的普通攻擊目標分支）。所以之後不能再點目標格：那一下只會和
 * 戰鬥演出賽跑，演出結束後的轉職對白、勝利劇情或經驗視窗一旦先蓋住畫布，Playwright 就一直等到用例
 * 逾時。這裡改為確認攻擊已經提交。
 */
export async function attackOnlyAdjacentEnemy(page: Page): Promise<void> {
  await chooseUnitCommand(page, "attack");
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-action-mode", "idle");
}

/** 按「攻擊」，而攻擊者有兩個以上相鄰合法目標：確認已進入手動選格，呼叫端才點目標格。 */
export async function enterAttackTargeting(page: Page): Promise<void> {
  await chooseUnitCommand(page, "attack");
  await expect(page.getByTestId("game-screen")).toHaveAttribute("data-action-mode", "target");
}
