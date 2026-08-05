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
