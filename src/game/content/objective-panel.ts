import { NATIVE_TEXT } from "./native-font.generated";
import {
  NATIVE_OBJECTIVE_PANEL,
  NATIVE_OBJECTIVE_PANEL_TEXT,
} from "./objective-panel.generated";
import type { StageId } from "../types";

export { NATIVE_OBJECTIVE_PANEL } from "./objective-panel.generated";

/**
 * `DS:1273` keys the 勝利條件 panel by native stage number, and the remake's own
 * stage ids carry that number: `stage-11` is native stage 11 even though it is
 * the campaign's tenth, and `stage-42-portal` is native stage 42. Every stage
 * generator already asserts its own key against the same table, so parsing the
 * id here cannot drift away from them without breaking those builds too.
 */
export function nativeStageNumber(stageId: StageId): number | undefined {
  const digits = /^stage-(\d+)/u.exec(stageId)?.[1];
  if (digits === undefined) return undefined;
  return Number(digits);
}

/**
 * The panel's drawable string for a stage: the original record's lines joined by
 * the cursor's own line feed, which `12E7:0240` reaches by resetting X and
 * adding 20 to Y — exactly what `0000:EA04` does for `7Ch`.
 *
 * Surfaces with no native stage (the arena, the class showdown and the labs)
 * have no recorded panel, so they get nothing rather than remake prose dressed
 * up as an original readout.
 */
export function nativeObjectivePanelText(stageId: StageId): string | undefined {
  const stage = nativeStageNumber(stageId);
  if (stage === undefined) return undefined;
  const lines = NATIVE_OBJECTIVE_PANEL_TEXT[stage];
  return lines?.join(NATIVE_TEXT.lineFeed.character);
}

/**
 * `REMAKE-123`：四角裝飾一律貼齊外框角落。
 *
 * 原版 `12E7:01CF..023F` 把同一枚 8×7 裝飾畫在 `x ∈ {80, 397}`、`y ∈ {40, 213}`。
 * 外框的實際外緣是左 `80`、右 `404`（右邊柱最後一列）、上 `40`、下 `220`（下緣帶
 * 最後一列），而裝飾的不透明部分只有 7 欄 7 列，因此只有左上角真的落在角上：右側兩枚
 * 停在 `403`、下方兩枚停在 `219`，各差 1 px。這是原版自己的不對稱，`NATIVE_OBJECTIVE_PANEL`
 * 仍逐字保留它，`pnpm content:objective-panel` 也繼續斷言那四個原始落點。
 *
 * 複刻只把右側與下方各外移 1 px，讓四枚裝飾的外角都與外框外角重合；尺寸、圖檔、
 * 疊放順序、邊帶與邊柱都不變，也不影響任何模擬結果。
 */
export function objectivePanelCornerPlacements(): readonly { x: number; y: number }[] {
  const { body, leftBevel, rightBevel, topEdge, bottomEdge, corner } = NATIVE_OBJECTIVE_PANEL;
  const frame = {
    left: leftBevel.startX,
    right: rightBevel.startX + rightBevel.colors.length - 1,
    top: topEdge.y,
    bottom: bottomEdge.y + bottomEdge.height - 1,
  };
  const alignedX = frame.right - (corner.opaqueWidth - 1);
  const alignedY = frame.bottom - (corner.height - 1);
  // Keep the native order so `data-corner` indices stay stable.
  return corner.placements.map(({ x, y }) => ({
    x: x < body.x + body.width / 2 ? frame.left : alignedX,
    y: y < body.y + body.height / 2 ? frame.top : alignedY,
  }));
}
