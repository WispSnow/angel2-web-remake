export interface MapEffectDescriptor {
  readonly xOffset: number;
  readonly yOffset: number;
  readonly width: number;
  readonly low7BitFrameIndices: readonly (number | null)[];
}

export interface IcePresentationDefinition {
  readonly effectRadius: number;
  readonly cycles: number;
  readonly rangeValueSequence: readonly number[];
  readonly distanceFromCenterSequence: readonly number[];
  readonly cycle: {
    readonly drawCount: number;
    readonly waitPerDrawNativeTicks: number;
  };
  readonly fixedGraphicWaitNativeTicks: number;
}

export interface IcePresentationFrame {
  readonly globalFrame: number;
  readonly cycleIndex: number;
  readonly sourceFrame: number;
  readonly rangeValue: number;
  readonly distanceFromCenter: number;
  readonly durationNativeTicks: number;
}

export function iceFrameAtGlobalIndex(
  definition: IcePresentationDefinition,
  globalFrame: number,
): IcePresentationFrame | undefined {
  if (!Number.isInteger(globalFrame) || globalFrame < 0) return undefined;
  const cycleIndex = Math.floor(globalFrame / definition.cycle.drawCount);
  const sourceFrame = globalFrame % definition.cycle.drawCount;
  const rangeValue = definition.rangeValueSequence[cycleIndex];
  const distanceFromCenter = definition.distanceFromCenterSequence[cycleIndex];
  if (cycleIndex >= definition.cycles
    || rangeValue === undefined
    || distanceFromCenter === undefined) return undefined;
  return {
    globalFrame,
    cycleIndex,
    sourceFrame,
    rangeValue,
    distanceFromCenter,
    durationNativeTicks: definition.cycle.waitPerDrawNativeTicks,
  };
}

export interface LightningPresentationDefinition {
  readonly code: string;
  readonly effectRadius: number;
  readonly phases: readonly {
    readonly resource: string;
    readonly descriptorSequence: readonly MapEffectDescriptor[];
    readonly drawCount: number;
    readonly waitPerDrawNativeTicks: number;
    readonly anchorOffsetSequence?: readonly { readonly x: number; readonly y: number }[];
  }[];
  readonly commonHit: {
    readonly resource: string;
    readonly rangeMapMaximumMinusOne: number;
    readonly rangeThresholdStart: number;
    readonly rangeThresholdDecrementPerWaveDraw: number;
    readonly sweepWidth: number;
    readonly iterations: number;
    readonly runtimeTileCodes: readonly number[];
    readonly waitPerWaveDrawNativeTicks: number;
    readonly waveDrawsPerIteration: number;
    readonly cleanup: {
      readonly resource: string;
      readonly descriptorSequence: readonly MapEffectDescriptor[];
      readonly drawCount: number;
      readonly waitPerDrawNativeTicks: number;
    };
  };
  readonly fixedGraphicWaitNativeTicks: number;
}

export type LightningPresentationFrame =
  | {
    readonly kind: "main";
    readonly phaseIndex: number;
    readonly drawIndex: number;
    readonly globalDrawIndex: number;
    readonly durationNativeTicks: number;
  }
  | {
    readonly kind: "wave";
    readonly frame: number;
    readonly durationNativeTicks: number;
  }
  | {
    readonly kind: "cleanup";
    readonly frame: number;
    readonly durationNativeTicks: number;
  };

export interface TimedLightningFrame {
  readonly startNativeTicks: number;
  readonly endNativeTicks: number;
  readonly frame: LightningPresentationFrame;
}

export function buildLightningTimeline(
  definition: LightningPresentationDefinition,
): readonly TimedLightningFrame[] {
  const frames: TimedLightningFrame[] = [];
  let cursor = 0;
  let globalDrawIndex = 0;
  definition.phases.forEach((phase, phaseIndex) => {
    phase.descriptorSequence.forEach((_, drawIndex) => {
      const startNativeTicks = cursor;
      cursor += phase.waitPerDrawNativeTicks;
      frames.push({
        startNativeTicks,
        endNativeTicks: cursor,
        frame: {
          kind: "main",
          phaseIndex,
          drawIndex,
          globalDrawIndex,
          durationNativeTicks: phase.waitPerDrawNativeTicks,
        },
      });
      globalDrawIndex += 1;
    });
  });
  const waveDrawCount = definition.commonHit.iterations
    * definition.commonHit.waveDrawsPerIteration;
  for (let frame = 0; frame < waveDrawCount; frame += 1) {
    const startNativeTicks = cursor;
    cursor += definition.commonHit.waitPerWaveDrawNativeTicks;
    frames.push({
      startNativeTicks,
      endNativeTicks: cursor,
      frame: {
        kind: "wave",
        frame,
        durationNativeTicks: definition.commonHit.waitPerWaveDrawNativeTicks,
      },
    });
  }
  definition.commonHit.cleanup.descriptorSequence.forEach((_, frame) => {
    const startNativeTicks = cursor;
    cursor += definition.commonHit.cleanup.waitPerDrawNativeTicks;
    frames.push({
      startNativeTicks,
      endNativeTicks: cursor,
      frame: {
        kind: "cleanup",
        frame,
        durationNativeTicks: definition.commonHit.cleanup.waitPerDrawNativeTicks,
      },
    });
  });
  if (cursor !== definition.fixedGraphicWaitNativeTicks) {
    throw new Error(
      `${definition.code} timeline is ${cursor} native ticks; expected ${definition.fixedGraphicWaitNativeTicks}`,
    );
  }
  return frames;
}

export function lightningFrameAtMainIndex(
  definition: LightningPresentationDefinition,
  globalDrawIndex: number,
): Extract<LightningPresentationFrame, { kind: "main" }> | undefined {
  let remaining = globalDrawIndex;
  for (const [phaseIndex, phase] of definition.phases.entries()) {
    if (remaining < phase.descriptorSequence.length) {
      return {
        kind: "main",
        phaseIndex,
        drawIndex: remaining,
        globalDrawIndex,
        durationNativeTicks: phase.waitPerDrawNativeTicks,
      };
    }
    remaining -= phase.descriptorSequence.length;
  }
  return undefined;
}

export function lightningFrameAtTime(
  timeline: readonly TimedLightningFrame[],
  nativeTicks: number,
): LightningPresentationFrame {
  const last = timeline[timeline.length - 1];
  if (!last) throw new Error("lightning timeline is empty");
  return timeline.find(({ endNativeTicks }) => nativeTicks < endNativeTicks)?.frame ?? last.frame;
}

export function lightningWaveDistance(
  hit: LightningPresentationDefinition["commonHit"],
  waveFrame: number,
  rangeValue: number,
): number {
  const rangeThreshold = hit.rangeThresholdStart
    - waveFrame * hit.rangeThresholdDecrementPerWaveDraw;
  return rangeValue - rangeThreshold;
}

/**
 * 魔弓 `3V` 的直線與 `WD` 的路徑這一步畫在哪些格、各寫描述符表的第幾項（`1000:6532/659B`、`1000:666D/66C9`）。
 * 原版只有一條逐步前進的尾跡：長出時每到一格，那一格寫表的第 0 項、往施法者那頭的第 n 格寫第 n 項；收尾從第 1 項
 * 起照同一規則把尾跡推過目標（收尾第 k 步，目標寫第 k 項），直到表的終止符。表的最後一項是高位碼 `82h`，`7EDD` 不把
 * 高位碼當圖塊畫，那一格只重畫地形；再往後的格子不再寫。所以每一格只從第 0 幀播到最後一幀一次，下一步就被清掉。
 * 收尾不是整條線一起重播，而是讓靠近目標、還沒播完的格子把剩下的幀播完。
 *
 * `growthOrder` 是先長出的格子在前（魔弓的路徑從射手排到目標；`WD` 的路徑表從目標排起，要傳反過來的順序）。`step`
 * 是長出的第幾步，收尾接在後面（收尾第 f 幀 = 路徑格數 + f）。`age` 小於 `frames` 時是那一格畫的幀，等於 `frames`
 * 是寫 `82h` 的那一步（原版清掉那一格，高清在這一步播餘韻）。
 */
export function lineTrailCells<T>(
  growthOrder: readonly T[],
  step: number,
  frames: number,
): readonly { readonly cell: T; readonly age: number }[] {
  return growthOrder.flatMap((cell, index) => {
    const age = step - index;
    return age >= 0 && age <= frames ? [{ cell, age }] : [];
  });
}
