import type { Page } from "@playwright/test";

export interface NativeTextBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly height: number;
}

/** `0000:4F41` draws the stage label from (120,333) inside the 480-pixel battle column. */
export const STAGE_LABEL_BOX: NativeTextBox = { left: 0, right: 470, top: 333, height: 18 };
/** The `DS:600B` round line starts at (516,327) in the right panel. */
export const ROUND_LINE_BOX: NativeTextBox = { left: 470, right: 640, top: 327, height: 18 };

/**
 * First and last column inside the box where the native text canvas carries any
 * ink or outline; both are undefined when it carries none. That canvas is the
 * only place the original bitmap font lands, the DOM copies stay transparent.
 */
export function nativeTextInkColumns(
  page: Page,
  box: NativeTextBox,
): Promise<{ first?: number; last?: number }> {
  return page.locator(".native-text-layer").evaluate((canvas, area) => {
    const width = area.right - area.left;
    const context = (canvas as HTMLCanvasElement).getContext("2d");
    if (!context) throw new Error("the native text layer lost its 2D context");
    const { data } = context.getImageData(area.left, area.top, width, area.height);
    const columns: number[] = [];
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < area.height; y += 1) {
        if (data[(y * width + x) * 4 + 3] !== 0) {
          columns.push(area.left + x);
          break;
        }
      }
    }
    return { first: columns[0], last: columns.at(-1) };
  }, box);
}
