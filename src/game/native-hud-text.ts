import {
  NATIVE_IDENTITY_SEPARATOR,
  NATIVE_ROUND_DIGIT_INDICES,
  NATIVE_ROUND_TEMPLATE,
  NATIVE_STAGE_LABEL_PADDING,
  NATIVE_STAT_ROWS,
  NATIVE_STATUS_COUNTERS,
  NATIVE_TEXT_ORIGINS,
} from "./content/native-font.generated";
import {
  drawNativeText,
  loadNativeFont,
  nativeIdentityField,
  nativeRoundLine,
  nativeStatRow,
} from "./native-text";
import { LOGICAL_SCREEN_HEIGHT, LOGICAL_SCREEN_WIDTH } from "./scaling";

/**
 * The battle text layer: everything module 29 draws with its own bitmap font
 * instead of with a panel graphic.
 *
 * The DOM still carries these readouts — they are the accessible names, the
 * live regions and what the acceptance tests read — but their glyphs are
 * transparent, because a host CJK face cannot reproduce the original's 16x15
 * cells, its fixed pixel advances or its dilated two-pass outline. This canvas
 * paints the pixels over them at native coordinates.
 */

export interface NativeUnitDetailText {
  readonly occupation: string;
  readonly name: string;
  /** Formatted five-character fields per `NATIVE_STAT_ROWS` id, in template order. */
  readonly statFields: Readonly<Record<string, readonly string[]>>;
  /** Remaining rounds for each active status, already packed in scan order. */
  readonly statusCounters: readonly number[];
}

export interface NativeTextLayerState {
  readonly unitDetail?: NativeUnitDetailText;
  readonly round?: number;
  /**
   * REMAKE-110: 原版回合框只有三个字符的位置，倒数放不进去，所以警告只改字色，
   * 剩余回合数由信息栏和胜负条件面板承担。不做闪烁——这里要的是持续可读。
   */
  readonly roundLimitWarning?: boolean;
  readonly stageLabel?: string;
}

const ROUND_LIMIT_WARNING_INK = "#ffb7a8";

export interface NativeTextLayer {
  readonly element: HTMLCanvasElement;
  render(state: NativeTextLayerState): void;
  dispose(): void;
}

/**
 * A label the original never shipped has no recorded padding, so it falls back
 * to the single leading tab 28 of the 34 label records use: cursor 120 + 72.
 */
export function nativeStageLabelText(label: string): string {
  return NATIVE_STAGE_LABEL_PADDING[label] ?? `\t${label}`;
}

export function createNativeTextLayer(): NativeTextLayer {
  const element = document.createElement("canvas");
  element.className = "native-text-layer";
  element.width = LOGICAL_SCREEN_WIDTH;
  element.height = LOGICAL_SCREEN_HEIGHT;
  element.setAttribute("aria-hidden", "true");
  const context = element.getContext("2d");
  if (!context) throw new Error("the native text layer needs a 2D context");
  context.imageSmoothingEnabled = false;

  let state: NativeTextLayerState = {};
  let disposed = false;

  const paint = () => {
    context.clearRect(0, 0, element.width, element.height);
    const { unitDetail, round, roundLimitWarning, stageLabel } = state;
    if (unitDetail) {
      drawNativeText(
        context,
        nativeIdentityField(unitDetail.occupation, "right"),
        NATIVE_TEXT_ORIGINS.occupation.x,
        NATIVE_TEXT_ORIGINS.occupation.y,
      );
      drawNativeText(
        context,
        NATIVE_IDENTITY_SEPARATOR,
        NATIVE_TEXT_ORIGINS.separator.x,
        NATIVE_TEXT_ORIGINS.separator.y,
      );
      drawNativeText(
        context,
        nativeIdentityField(unitDetail.name, "left"),
        NATIVE_TEXT_ORIGINS.unitName.x,
        NATIVE_TEXT_ORIGINS.unitName.y,
      );
      for (const row of NATIVE_STAT_ROWS) {
        const fields = unitDetail.statFields[row.id];
        if (!fields) continue;
        drawNativeText(context, nativeStatRow(row.template, fields), row.x, row.y);
      }
      for (const [index, remaining] of unitDetail.statusCounters.entries()) {
        const origin = NATIVE_STATUS_COUNTERS[index];
        if (!origin) break;
        drawNativeText(context, String(remaining), origin.x, origin.y, { mode: "compact" });
      }
    }
    if (round !== undefined) {
      drawNativeText(
        context,
        nativeRoundLine(NATIVE_ROUND_TEMPLATE, NATIVE_ROUND_DIGIT_INDICES, round),
        NATIVE_TEXT_ORIGINS.round.x,
        NATIVE_TEXT_ORIGINS.round.y,
        roundLimitWarning ? { ink: ROUND_LIMIT_WARNING_INK } : {},
      );
    }
    if (stageLabel !== undefined) {
      drawNativeText(
        context,
        nativeStageLabelText(stageLabel),
        NATIVE_TEXT_ORIGINS.stageLabel.x,
        NATIVE_TEXT_ORIGINS.stageLabel.y,
      );
    }
  };

  // The first paints run before the atlas decodes; `drawNativeText` lays the
  // text out and draws nothing, then this repaint fills it in. Nothing else in
  // the frame depends on the font, so no other work waits on it — and a failed
  // load leaves the layer blank rather than taking the rest of the HUD down,
  // the same way the startup screen treats its own font.
  void loadNativeFont().then(() => {
    if (!disposed) paint();
  }).catch(() => undefined);

  return {
    element,
    render(next) {
      state = next;
      paint();
    },
    dispose() {
      disposed = true;
      element.remove();
    },
  };
}
