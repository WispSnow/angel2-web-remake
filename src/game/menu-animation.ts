/**
 * 選單開闔動畫的表現層生命週期。
 *
 * 原版模組 29 的通用命令選單（`0000:5651` 生命週期、`0000:566A` 開、`0000:5779`
 * 關）是「存背景 → 一次貼上 `A/0001` 外框 → 關閉時還原背景」，沒有逐步縮放；本檔
 * 實作的開闔動畫因此是複刻版的表現決定（`[DD]`），不是原版事實。它只改變方框自己的
 * 顯示時機，不接觸模擬狀態、PRNG、輸入語義或存檔。
 *
 * 開啟動畫留給 CSS：選單以 `hidden` 收起時是 `display: none`，重新顯示會自動重播
 * 基礎樣式上的 `@keyframes native-menu-zoom-in`，不需要任何 JS 狀態。關閉才需要
 * JS，因為必須等收合動畫播完才能真正 `hidden`，同時凍結內容避免用新狀態覆寫正在
 * 淡出的舊畫面。
 */

/** 收合中的方框類名；同時掛上收合動畫與 `pointer-events: none`。 */
const CLOSING_CLASS = "is-menu-closing";

/** CSS 收合動畫名。逐一比對可避免誤等到別的動畫，例如尚未播完的開啟動畫。 */
const CLOSE_ANIMATION_NAME = "native-menu-zoom-out";

/**
 * 收尾保險絲，須明顯長於 CSS 收合時長。頁面不可見時瀏覽器不推進文檔時間軸，
 * `animation.finished` 可以永遠不落地；沒有這道保險絲，選單就會卡在收合態不消失。
 */
const CLOSE_FALLBACK_MS = 400;

interface ClosingMenu {
  /** 世代序號：重複開闔時，只有最後一次的收尾算數，中途作廢的舊回呼要自行退出。 */
  generation: number;
  fallback: ReturnType<typeof globalThis.setTimeout>;
}

const closingMenus = new WeakMap<HTMLElement, ClosingMenu>();

let closeGeneration = 0;

function closeAnimations(element: HTMLElement): Animation[] {
  return element.getAnimations().filter((animation) =>
    animation instanceof CSSAnimation && animation.animationName === CLOSE_ANIMATION_NAME
  );
}

function finishClose(element: HTMLElement): void {
  const closing = closingMenus.get(element);
  if (closing) {
    globalThis.clearTimeout(closing.fallback);
    closingMenus.delete(element);
  }
  element.classList.remove(CLOSING_CLASS);
  element.inert = false;
  element.hidden = true;
}

/**
 * 設定選單開闔並回報「現在是否應該重建內容」。
 *
 * 回傳 `false` 的兩種情況都不能重建：已經隱藏，或正在播收合動畫——後者的控制器狀態
 * 早已前進，重建會讓玩家看到下一個狀態的內容在淡出。
 */
export function setMenuOpen(element: HTMLElement, open: boolean): boolean {
  if (open) {
    if (closingMenus.has(element)) {
      // 收合到一半又被打開：先真的收起再顯示，讓瀏覽器重新起算開啟動畫，否則單純
      // 移除收合類名只會讓方框從縮小狀態瞬間彈回原寸。中間要強制結算一次樣式與
      // 版面，瀏覽器才會看見 `display: none` 這一拍。
      finishClose(element);
      element.getBoundingClientRect();
    }
    if (element.hidden) element.hidden = false;
    return true;
  }
  if (element.hidden || closingMenus.has(element)) return false;

  element.classList.add(CLOSING_CLASS);
  // `inert` 一次做完三件事：移出無障礙樹、放掉停在選項上的焦點、拒收命中測試。
  // 只加 `aria-hidden` 會把仍有焦點的元素藏進無障礙樹外，那是已知的無障礙錯誤。
  element.inert = true;

  const animations = closeAnimations(element);
  if (animations.length === 0) {
    // 沒有可等待的動畫（樣式未載入、該選單不參與收合動畫）時維持原本的瞬間隱藏。
    finishClose(element);
    return false;
  }
  const generation = ++closeGeneration;
  const settle = () => {
    if (closingMenus.get(element)?.generation === generation) finishClose(element);
  };
  closingMenus.set(element, {
    generation,
    fallback: globalThis.setTimeout(settle, CLOSE_FALLBACK_MS),
  });
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(settle);
  return false;
}

/** 立即結清進行中的收合。卸載時用，避免收尾回呼落在已被換掉的畫面上。 */
export function finishMenuClose(element: HTMLElement): void {
  if (closingMenus.has(element)) finishClose(element);
}
