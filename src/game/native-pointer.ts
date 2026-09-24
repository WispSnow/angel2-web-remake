/**
 * 画面内指针：把原版 `A/0001` 鼠标图画进 640×350 逻辑画面，随游戏画面一起缩放。
 *
 * 原版的鼠标本来就是软件光标：模块 29 每次更新都经 `0000:F859` 把 `A/0001` 的一帧画进
 * 画面（`reverse/notes/input-and-battle-ui.md`），所以它永远和游戏像素同一个倍率。宿主
 * CSS 游标只按图片固有尺寸显示，逻辑画面的 `transform` 放大不会带上它；浏览器还把自定义
 * 游标限制在 128 px 以内，超过 32 px 的游标碰到视口边缘就会被换成后备游标。这里改在画面内画
 * 一个精灵并藏起宿主游标：精灵跟着逻辑画面一起变换，任何缩放来源下都与游戏像素同倍率，
 * 也跟随「畫面縮放」的锐利／平滑设置。
 *
 * 精灵只负责表现，命中判定仍由真实指针事件决定。触控不显示精灵；指针离开画面、或在新
 * 画面里还没有已知位置时，交回 `styles.css` 里原有的宿主游标规则。
 */
import {
  DIAGONAL_EDGE_SCROLL_CURSOR_ART,
  applyDiagonalEdgeScrollCursors,
  type BattlePointerCursor,
} from "./edge-scroll-cursors";
import { LOGICAL_SCREEN_HEIGHT, LOGICAL_SCREEN_WIDTH } from "./scaling-constants";

export interface NativePointerSprite {
  readonly width: number;
  readonly height: number;
  /** 与 `styles.css` 宿主游标声明的热点相同。 */
  readonly hotspot: Readonly<{ x: number; y: number }>;
}

const diagonal = (cursor: keyof typeof DIAGONAL_EDGE_SCROLL_CURSOR_ART): NativePointerSprite => {
  const art = DIAGONAL_EDGE_SCROLL_CURSOR_ART[cursor];
  return { width: art.rows[0].length, height: art.rows.length, hotspot: art.hotspot };
};

/** 尺寸取自 `A/0001` frame 0–4（`input-ui.json#battleCursor.mouse.pointerArt`）。 */
export const NATIVE_POINTER_SPRITES: Readonly<Record<BattlePointerCursor, NativePointerSprite>> = {
  hand: { width: 24, height: 24, hotspot: { x: 3, y: 2 } },
  up: { width: 24, height: 20, hotspot: { x: 12, y: 0 } },
  down: { width: 24, height: 19, hotspot: { x: 12, y: 18 } },
  left: { width: 24, height: 19, hotspot: { x: 0, y: 9 } },
  right: { width: 24, height: 18, hotspot: { x: 23, y: 9 } },
  "up-left": diagonal("up-left"),
  "up-right": diagonal("up-right"),
  "down-left": diagonal("down-left"),
  "down-right": diagonal("down-right"),
};

const isBattlePointerCursor = (value: string | undefined): value is BattlePointerCursor =>
  value !== undefined && Object.hasOwn(NATIVE_POINTER_SPRITES, value);

export interface ClientRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 精灵左上角的逻辑座标；指针不在画面内时为 `undefined`。指针先落到整数逻辑像素，与
 * 原版整数鼠标座标一致，精灵的像素格也因此和游戏像素格对齐，非整数倍缩放时不会半格错开。
 */
export function nativePointerPlacement(
  client: Readonly<{ x: number; y: number }>,
  screen: ClientRectLike,
  cursor: BattlePointerCursor,
): { x: number; y: number } | undefined {
  if (screen.width <= 0 || screen.height <= 0) return undefined;
  const x = Math.floor((client.x - screen.left) * LOGICAL_SCREEN_WIDTH / screen.width);
  const y = Math.floor((client.y - screen.top) * LOGICAL_SCREEN_HEIGHT / screen.height);
  // 拖曳小地图时指针被画面捕获，拖出画面外仍会收到事件；外面交给宿主游标。
  if (x < 0 || y < 0 || x >= LOGICAL_SCREEN_WIDTH || y >= LOGICAL_SCREEN_HEIGHT) return undefined;
  const { hotspot } = NATIVE_POINTER_SPRITES[cursor];
  return { x: x - hotspot.x, y: y - hotspot.y };
}

interface LastPointer {
  clientX: number;
  clientY: number;
  pointerType: string;
  /** 最后一次指针事件是否落在某个逻辑画面内。 */
  inside: boolean;
}

/**
 * 换画面时（战斗 → 部署、剧情 → 战场……）指针多半没动，新画面收不到任何指针事件；
 * 记住最后一次位置，新画面一挂上就能在原处接着画，不会先闪回宿主小游标。
 */
let lastPointer: LastPointer | undefined;

export interface NativePointer {
  /** 画面缩放或位移后按最后已知位置重新摆放。 */
  refresh(): void;
  dispose(): void;
}

export function mountNativePointer(screen: HTMLElement): NativePointer {
  const sprite = screen.ownerDocument.createElement("span");
  sprite.className = "native-pointer";
  sprite.dataset.testid = "native-pointer";
  sprite.setAttribute("aria-hidden", "true");
  sprite.hidden = true;
  screen.append(sprite);
  applyDiagonalEdgeScrollCursors(screen);

  let cursor: BattlePointerCursor = "hand";
  let target: Element | null = null;

  const hide = () => {
    sprite.hidden = true;
    delete screen.dataset.nativePointer;
  };

  const render = () => {
    // 触控没有悬停位置，也就没有游标可画。
    const placement = lastPointer?.inside && lastPointer.pointerType !== "touch"
      ? nativePointerPlacement(
        { x: lastPointer.clientX, y: lastPointer.clientY },
        screen.getBoundingClientRect(),
        cursor,
      )
      : undefined;
    if (!placement) {
      hide();
      return;
    }
    // 结尾统计、剧情等画面会整片重写逻辑画面的子节点，精灵要跟着回到画面里。
    if (sprite.parentElement !== screen) screen.append(sprite);
    const { width, height } = NATIVE_POINTER_SPRITES[cursor];
    sprite.dataset.frame = cursor;
    sprite.style.width = `${width}px`;
    sprite.style.height = `${height}px`;
    sprite.style.transform = `translate(${placement.x}px, ${placement.y}px)`;
    sprite.hidden = false;
    screen.dataset.nativePointer = "sprite";
  };

  /** 只有战场画布会报告边缘箭头，其他元素一律是手指。 */
  const cursorForTarget = (): BattlePointerCursor => {
    const reported = target instanceof HTMLElement ? target.dataset.nativePointerCursor : undefined;
    return isBattlePointerCursor(reported) ? reported : "hand";
  };

  const track = (event: PointerEvent) => {
    lastPointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
      inside: true,
    };
    target = event.target instanceof Element ? event.target : null;
    cursor = cursorForTarget();
    render();
  };

  const leave = (event: PointerEvent) => {
    // `pointerleave` 不冒泡，但子元素的离开事件仍会经过画面的捕获阶段。
    if (event.target !== screen) return;
    lastPointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
      inside: false,
    };
    target = null;
    hide();
  };

  // 捕获阶段监听：子元素停止冒泡（选单、小地图拖曳）也挡不住指针位置的更新。
  const listenerOptions = { capture: true, passive: true } as const;
  screen.addEventListener("pointermove", track, listenerOptions);
  screen.addEventListener("pointerdown", track, listenerOptions);
  screen.addEventListener("pointerup", track, listenerOptions);
  screen.addEventListener("pointerleave", leave, { passive: true });

  // Phaser 用画布的 `mousemove`／`mousedown` 更新边缘方向，它们比 `pointermove` 晚派发；
  // 画布改写 `data-native-pointer-cursor` 之后才换帧，同一帧内就能画上正确的箭头。
  const cursorObserver = new MutationObserver(() => {
    const next = cursorForTarget();
    if (next === cursor) return;
    cursor = next;
    render();
  });
  cursorObserver.observe(screen, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-native-pointer-cursor"],
  });
  // 整片重写子节点时精灵会被带走，只看直接子节点，不必跟着每次选单重建。
  const childObserver = new MutationObserver(() => {
    if (!sprite.hidden && sprite.parentElement !== screen) screen.append(sprite);
  });
  childObserver.observe(screen, { childList: true });

  render();

  return {
    refresh: render,
    dispose() {
      screen.removeEventListener("pointermove", track, listenerOptions);
      screen.removeEventListener("pointerdown", track, listenerOptions);
      screen.removeEventListener("pointerup", track, listenerOptions);
      screen.removeEventListener("pointerleave", leave);
      cursorObserver.disconnect();
      childObserver.disconnect();
      sprite.remove();
      delete screen.dataset.nativePointer;
    },
  };
}
