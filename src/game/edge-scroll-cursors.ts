/**
 * 战场指针的图示：原版五态，加上复刻四角的斜向箭头。
 *
 * 原版 `A/0001` 只有五帧鼠标图：frame 0 手指，frame 1–4 上／下／左／右白箭头。模块 29
 * `1000:34B1` 每次先把方向槽 DS:`00AC` 清零，横向边缘写 3/4、纵向边缘随后覆写 1/2，
 * `1000:3559` 也只朝这一个槽滚动一格；四角因此只做纵向滚动，箭头也只有上／下。
 *
 * 复刻在四角两轴同时滚动（`[DD]`，见 `design/remake-gdd/07-ui-ux-and-presentation.md`
 * 的边缘滚屏段落）。为了让箭头与实际滚动方向一致，四角改用本文件的四枚复刻自绘斜向箭头；
 * 四边仍是原版帧，原版没有的图不冒充原版帧号。
 */

export type EdgeScrollCursor =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";

export type BattlePointerCursor = "hand" | EdgeScrollCursor;

export type DiagonalEdgeScrollCursor = "up-left" | "up-right" | "down-left" | "down-right";

export const DIAGONAL_EDGE_SCROLL_CURSORS: readonly DiagonalEdgeScrollCursor[] = [
  "up-left",
  "up-right",
  "down-left",
  "down-right",
];

/** 原版 `A/0001` 的帧号；斜向箭头没有原版帧，因此不在表内。 */
export const NATIVE_POINTER_FRAMES: Readonly<Partial<Record<BattlePointerCursor, number>>> = {
  hand: 0,
  up: 1,
  down: 2,
  left: 3,
  right: 4,
};

/** 边缘方向（各轴取 -1／0／1）对应的指针；不在边缘时是手指。 */
export function battlePointerCursorFor(
  edgeDirection: Readonly<{ x: number; y: number }> | undefined,
): BattlePointerCursor {
  const vertical = edgeDirection && edgeDirection.y !== 0 ? (edgeDirection.y < 0 ? "up" : "down") : undefined;
  const horizontal = edgeDirection && edgeDirection.x !== 0 ? (edgeDirection.x < 0 ? "left" : "right") : undefined;
  if (vertical && horizontal) return `${vertical}-${horizontal}`;
  return vertical ?? horizontal ?? "hand";
}

/**
 * ↖ 按原版上箭头的造型旋转 45° 重绘。原版箭头头部逐行左右各扩一像素（90° 顶角），
 * 箭杆宽 9、约为箭头底宽 17 的一半；斜放后箭头两腰正好落在水平与垂直方向。这里取腰长
 * 11、箭杆垂直宽 8，并把箭杆沿斜向拉长到 11（原版为 9），否则斜放后显得粗短。纯白剪影、
 * 透明底，与原版四帧同一套两色；四周留一像素透明边，镜像后箭尖都落在 `(1|16, 1|16)`。
 */
const UP_LEFT_ARROW = [
  "..................",
  ".###########......",
  ".##########.......",
  ".#########........",
  ".#########........",
  ".##########.......",
  ".###########......",
  ".############.....",
  ".#############....",
  ".##############...",
  ".##..###########..",
  ".#....###########.",
  ".......#########..",
  "........#######...",
  ".........#####....",
  "..........###.....",
  "...........#......",
  "..................",
] as const;

const mirrorColumns = (rows: readonly string[]): readonly string[] =>
  rows.map((row) => [...row].reverse().join(""));
const mirrorRows = (rows: readonly string[]): readonly string[] => [...rows].reverse();

export interface DiagonalEdgeScrollCursorArt {
  /** `#` 为白色像素，`.` 为透明。 */
  readonly rows: readonly string[];
  /** 指针热点落在箭尖像素。 */
  readonly hotspot: Readonly<{ x: number; y: number }>;
  /** 图片失效时 CSS 必须给的关键字。 */
  readonly fallback: "nw-resize" | "ne-resize" | "sw-resize" | "se-resize";
}

function diagonalArt(cursor: DiagonalEdgeScrollCursor): DiagonalEdgeScrollCursorArt {
  const right = cursor.endsWith("right");
  const down = cursor.startsWith("down");
  const horizontal = right ? mirrorColumns(UP_LEFT_ARROW) : UP_LEFT_ARROW;
  const rows = down ? mirrorRows(horizontal) : horizontal;
  return {
    rows,
    hotspot: { x: right ? rows[0].length - 2 : 1, y: down ? rows.length - 2 : 1 },
    fallback: `${down ? "s" : "n"}${right ? "e" : "w"}-resize`,
  };
}

export const DIAGONAL_EDGE_SCROLL_CURSOR_ART: Readonly<
  Record<DiagonalEdgeScrollCursor, DiagonalEdgeScrollCursorArt>
> = {
  "up-left": diagonalArt("up-left"),
  "up-right": diagonalArt("up-right"),
  "down-left": diagonalArt("down-left"),
  "down-right": diagonalArt("down-right"),
};

const renderedImages = new Map<DiagonalEdgeScrollCursor, string>();

function renderImage(cursor: DiagonalEdgeScrollCursor): string | undefined {
  const art = DIAGONAL_EDGE_SCROLL_CURSOR_ART[cursor];
  const canvas = document.createElement("canvas");
  canvas.width = art.rows[0].length;
  canvas.height = art.rows.length;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.fillStyle = "#fff";
  art.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === "#") context.fillRect(x, y, 1, 1);
    }
  });
  return canvas.toDataURL("image/png");
}

/**
 * 把像素表画成 PNG data URL 写进 `styles.css` 读取的变量：画面内指针用
 * `--edge-scroll-cursor-*-image`，宿主游标后备用含热点的完整值 `--edge-scroll-cursor-*`
 * （缺失时退回原版四角的纵向箭头）。每张只画一次，之后换关、换场景都重用同一字串。
 */
export function applyDiagonalEdgeScrollCursors(target: HTMLElement): void {
  for (const cursor of DIAGONAL_EDGE_SCROLL_CURSORS) {
    let image = renderedImages.get(cursor);
    if (image === undefined) {
      image = renderImage(cursor);
      if (image === undefined) continue;
      renderedImages.set(cursor, image);
    }
    const art = DIAGONAL_EDGE_SCROLL_CURSOR_ART[cursor];
    const url = `url("${image}")`;
    target.style.setProperty(`--edge-scroll-cursor-${cursor}-image`, url);
    target.style.setProperty(
      `--edge-scroll-cursor-${cursor}`,
      `${url} ${art.hotspot.x} ${art.hotspot.y}, ${art.fallback}`,
    );
  }
}
