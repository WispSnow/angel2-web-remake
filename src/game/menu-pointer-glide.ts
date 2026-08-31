/**
 * 原版開選單前的指標滑行。
 *
 * 模組 29 的通用選單生命週期 `0000:5651` 先呼叫 `0000:566A`，而 `0000:566A` 的第一件
 * 事就是 `0000:57C5`——把滑鼠指標滑到選單第一行，滑完才開始貼 `A/0001` 外框。關閉時
 * `0000:5779` 再呼叫同一個 `0000:57C5`，把指標滑回開選單前存下的位置。
 *
 * `0000:57C5` 的迴圈每圈做三件事：把指標畫在 `DS:FB21/FB23`、等一次垂直回描並翻頁
 * （`0000:48B8` 在 `[cs:48FB]` 為 `Y` 時才等 `3DAh` bit 3），然後各呼叫一次
 * `0000:580F`（X 軸）與 `0000:5851`（Y 軸）。兩個軸函式完全同構：
 *
 * ```text
 * d = |current - target|
 * if (d >> 1) == 0: 不動（距離 0 或 1 就停）
 * step = max(1, d >> 2)
 * current += sign(target - current) * step
 * ```
 *
 * 迴圈在兩軸都不再移動時結束，最後再把指標直接寫成精確目標值（`0000:57F9`），所以停
 * 在差 1 px 的那一格會被補上。目標值由 `0000:56C8` 算出：`X = 選單左緣 + 0x78`、
 * `Y = 選單上緣 + 0x1C`，也就是第一行熱區的指標落點。鍵盤上下換行不滑行，`0000:6098`
 * 直接把指標寫成該行的 `熱區 x + 0x68`／`熱區 y + 0x10`。
 *
 * Web 這邊只能重現手勢：瀏覽器不能移動宿主指標，所以滑行由畫面內的手形精靈演出。
 * 為避免暗示真實鼠標也被移動，這段演出只由鍵盤／手把開選單時使用；指標開選單直接顯示，
 * 詳見 `ui.ts` 的接線與 `design/remake-gdd/07-ui-ux-and-presentation.md`。
 */
import { programNow } from "./program-clock";

export interface PointerPosition {
  x: number;
  y: number;
}

/**
 * 原生指標熱區相對選單左上角的偏移（`0000:56ED`／`0000:56F6` 的 `0x78`／`0x1C`）。
 */
export const NATIVE_MENU_POINTER_OFFSET: PointerPosition = { x: 0x78, y: 0x1c };

/**
 * 一步等於一次垂直回描。發布版跑 VGA 640×350（`reverse/notes/startup-trace.md` 的
 * S3 VGA 與 640×350 顯示面），該模式的垂直更新率是 70.086 Hz；`0000:48B8` 等的是
 * `3DAh` bit 3 而不是 100 Hz 的 PIT tick，所以這裡不套用 10 ms 邏輯量子。
 */
export const NATIVE_GLIDE_FRAME_MS = 1000 / 70.086;

/** 單軸一步：剩餘距離的四分之一，至少 1 px；距離不到 2 px 就停住不動。 */
export function nativeGlideAxisStep(current: number, target: number): number {
  const distance = Math.abs(current - target);
  if (distance >> 1 === 0) return current;
  const step = Math.max(1, distance >> 2);
  return current + (target > current ? step : -step);
}

/**
 * 完整滑行路徑，不含起點，最後一格永遠是精確目標（對應 `0000:57F9` 的收尾寫入）。
 * 起點與終點相同時回傳空陣列，呼叫端可據此直接跳過演出。
 */
export function nativePointerGlidePath(
  from: PointerPosition,
  to: PointerPosition,
): PointerPosition[] {
  const path: PointerPosition[] = [];
  let { x, y } = { x: Math.round(from.x), y: Math.round(from.y) };
  const target = { x: Math.round(to.x), y: Math.round(to.y) };
  if (x === target.x && y === target.y) return path;
  // 迴圈上限只是防呆：每步至少走 1 px，距離再遠也遠遠走不到這個數。
  for (let frame = 0; frame < 1024; frame += 1) {
    const nextX = nativeGlideAxisStep(x, target.x);
    const nextY = nativeGlideAxisStep(y, target.y);
    if (nextX === x && nextY === y) break;
    x = nextX;
    y = nextY;
    path.push({ x, y });
  }
  const last = path.at(-1);
  if (!last || last.x !== target.x || last.y !== target.y) path.push(target);
  return path;
}

export interface MenuPointerGlide {
  /**
   * 開始滑行。回傳 `false` 表示這次不演出（起訖同格、或呼叫端給了不需要動畫的節奏），
   * 呼叫端應該直接顯示選單。
   */
  start(from: PointerPosition, to: PointerPosition): boolean;
  /** 中止滑行並收起手形精靈，不觸發 `onSettled`。 */
  cancel(): void;
  /** 立刻跳到終點：玩家在滑行途中操作時不能被演出擋住。 */
  settle(): void;
  isRunning(): boolean;
  dispose(): void;
}

/**
 * 手形精靈的熱區。CSS 用同一張 `command-menu-pointer.png` 當游標並宣告 `3 2`，
 * 精靈要落在同一個相對位置，滑行起點才會和玩家原本的游標嚴絲合縫地接上。
 */
const SPRITE_HOTSPOT: PointerPosition = { x: 3, y: 2 };

export function createMenuPointerGlide(options: {
  screen: HTMLElement;
  sprite: HTMLElement;
  /** 一步的毫秒數；回傳 0 或更小表示直接跳到終點。 */
  frameMs: () => number;
  onSettled: () => void;
}): MenuPointerGlide {
  const { screen, sprite, frameMs, onSettled } = options;
  let path: PointerPosition[] = [];
  let index = 0;
  let elapsed = 0;
  let previousTime = 0;
  let frame = 0;

  const place = (position: PointerPosition) => {
    sprite.style.left = `${position.x - SPRITE_HOTSPOT.x}px`;
    sprite.style.top = `${position.y - SPRITE_HOTSPOT.y}px`;
  };

  const stop = () => {
    if (frame !== 0) globalThis.cancelAnimationFrame(frame);
    frame = 0;
    path = [];
    sprite.hidden = true;
    // 滑行期間宿主游標藏起來，畫面上才只有一隻手；接手的時機交還給瀏覽器。
    delete screen.dataset.pointerGlide;
  };

  const finish = () => {
    stop();
    onSettled();
  };

  const tick = () => {
    const time = programNow();
    frame = 0;
    const step = frameMs();
    elapsed += Math.max(0, time - previousTime);
    previousTime = time;
    if (step <= 0) {
      index = path.length;
    } else {
      while (index < path.length && elapsed >= step) {
        elapsed -= step;
        index += 1;
      }
    }
    const position = path[Math.min(index, path.length - 1)];
    if (position) place(position);
    if (index >= path.length) {
      finish();
      return;
    }
    frame = globalThis.requestAnimationFrame(tick);
  };

  return {
    start(from, to) {
      stop();
      const next = nativePointerGlidePath(from, to);
      if (next.length === 0) return false;
      path = next;
      index = 0;
      elapsed = 0;
      previousTime = programNow();
      place(from);
      sprite.hidden = false;
      screen.dataset.pointerGlide = "true";
      frame = globalThis.requestAnimationFrame(tick);
      return true;
    },
    cancel: stop,
    settle() {
      if (frame === 0 && path.length === 0) return;
      const target = path.at(-1);
      if (target) place(target);
      finish();
    },
    isRunning: () => path.length > 0,
    dispose: stop,
  };
}
