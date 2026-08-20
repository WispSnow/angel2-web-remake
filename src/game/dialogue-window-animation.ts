/**
 * `A/18` 對話窗開闔動畫的表現層生命週期。
 *
 * 原版 `WU`／`WD`（模組 25 `0000:0CD1`／`0000:0DAA`、模組 29 `C3BF`／`C48C`）在窗口
 * 尚未開啟時呼叫 `0000:0F41`：四列貼圖的 X 游標從 `[313,337,345,361]` 起算，每步
 * `[-16,-16,+16,+16]`，共 11 次，窗體以中心為軸橫向從 80 px 展開到 400 px。三段列高
 * 從第一步就是完整的 86 px，所以原版沒有縱向展開。`CU`／`CD`（`0000:0EE2`／
 * `0000:0E83`）把展開後留下的游標交給 `0000:0FDF`，跑同一個繪製體 `0000:1032` 但
 * 游標反向、共 12 次，窗體收回 80 px 後由整條背景帶一次擦掉。步數與幾何是原版事實
 * （`[OF]`）；兩個迴圈都沒有 native tick 等待，逐步時長只受 VGA 區塊搬移速度限制，
 * 因此 `styles.css` 選的 110／120 ms 是複刻版的表現決定（`[DD]`）。
 *
 * 展開留給 CSS：面板以 `hidden` 收起時是 `display: none`，重新顯示會自動重播
 * `@keyframes dialogue-window-open`，不需要任何 JS 狀態。收回才需要 JS，因為必須等
 * 收合播完才能真的 `hidden`；而且原版是 `CU` 收完窗體之後才輪到 `PU` 擦肖像、`ED`
 * 還原畫面，所以肖像、姓名牌與劇情背景都得陪窗體活到最後一格。
 *
 * 機制與 `menu-animation.ts` 平行，但兩者收合的是不同的原版例程，也各自需要不同的
 * 收尾：選單要 `inert` 收回焦點，對話窗只是 `pointer-events: none` 的表現層，反而要
 * 回呼呼叫端重跑描繪，才能把祖先節點一起收起。
 */

/** 收合中的面板類名；同時掛上收合動畫。 */
const CLOSING_CLASS = "is-dialogue-window-closing";

/** CSS 收合動畫名。逐一比對可避免誤等到別的動畫，例如尚未播完的展開動畫。 */
const CLOSE_ANIMATION_NAME = "dialogue-window-close";

/**
 * 收尾保險絲，須明顯長於 CSS 收合時長。頁面不可見時瀏覽器不推進文檔時間軸，
 * `animation.finished` 可以永遠不落地；沒有這道保險絲，對話窗就會卡在收合態不消失。
 */
const CLOSE_FALLBACK_MS = 400;

interface ClosingWindow {
  /** 世代序號：重複開闔時，只有最後一次的收尾算數，中途作廢的舊回呼要自行退出。 */
  generation: number;
  fallback: ReturnType<typeof globalThis.setTimeout>;
  onClosed: () => void;
}

const closingWindows = new WeakMap<HTMLElement, ClosingWindow>();

let closeGeneration = 0;

function closeAnimations(panel: HTMLElement): Animation[] {
  return panel.getAnimations().filter((animation) =>
    animation instanceof CSSAnimation && animation.animationName === CLOSE_ANIMATION_NAME
  );
}

function finishClose(panel: HTMLElement): ClosingWindow | undefined {
  const closing = closingWindows.get(panel);
  if (closing) {
    globalThis.clearTimeout(closing.fallback);
    closingWindows.delete(panel);
  }
  panel.classList.remove(CLOSING_CLASS);
  panel.hidden = true;
  return closing;
}

/** 收合是否仍在播放。播放中的面板不能被重建，其祖先也不能提前隱藏。 */
export function isDialogueWindowClosing(panel: HTMLElement): boolean {
  return closingWindows.has(panel);
}

/**
 * 設定單一 `A/18` 面板的開闔。
 *
 * `onClosed` 只在收合自然播完時呼叫，讓呼叫端重跑一次描繪，把撐在畫面上的肖像、
 * 對話層與劇情背景一起收掉；`finishDialogueWindowClose` 的強制結清不會觸發它。
 */
export function setDialogueWindowOpen(
  panel: HTMLElement,
  open: boolean,
  onClosed: () => void,
): void {
  if (open) {
    if (closingWindows.has(panel)) {
      // 收合到一半又被打開：先真的收起再顯示，讓瀏覽器重新起算展開動畫，否則單純
      // 移除收合類名只會讓窗體從 80 px 瞬間彈回 400 px。中間要強制結算一次樣式與
      // 版面，瀏覽器才會看見 `display: none` 這一拍。
      finishClose(panel);
      panel.getBoundingClientRect();
    }
    if (panel.hidden) panel.hidden = false;
    return;
  }
  if (panel.hidden || closingWindows.has(panel)) return;

  panel.classList.add(CLOSING_CLASS);
  const animations = closeAnimations(panel);
  if (animations.length === 0) {
    // 沒有可等待的動畫（樣式未載入、或玩家要求減少動態）時維持原本的瞬間隱藏。
    finishClose(panel);
    return;
  }
  const generation = ++closeGeneration;
  const settle = () => {
    if (closingWindows.get(panel)?.generation !== generation) return;
    finishClose(panel)?.onClosed();
  };
  closingWindows.set(panel, {
    generation,
    fallback: globalThis.setTimeout(settle, CLOSE_FALLBACK_MS),
    onClosed,
  });
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(settle);
}

/** 立即結清進行中的收合。卸載時用，避免收尾回呼落在已被換掉的畫面上。 */
export function finishDialogueWindowClose(panel: HTMLElement): void {
  if (closingWindows.has(panel)) finishClose(panel);
}
