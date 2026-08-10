import type { RoutePulsePresentationDefinition } from "./stage-runtime";

export interface RoutePulsePresentationFrame {
  /** `1000:6E46` marker tile code minus one: the electrocuted-character art. */
  frame: number;
  /** `0000:65A5` sweep sprite code minus one, or `undefined` outside the band. */
  sweepFrame: number | undefined;
  draw: number;
  nativeTicks: number;
  /** The marker layer falls inside the sweep band on this draw. */
  visible: boolean;
}

function frameForDraw(
  definition: RoutePulsePresentationDefinition,
  draw: number,
): RoutePulsePresentationFrame {
  const runtimeTileCode = definition.runtimeTileCodes[draw % definition.runtimeTileCodes.length];
  if (runtimeTileCode === undefined || runtimeTileCode < 1 || runtimeTileCode > definition.frames.length) {
    throw new Error(`${definition.id} has an invalid route-pulse tile code`);
  }
  const rangeThreshold = definition.rangeThresholdStart
    - draw * definition.rangeThresholdDecrementPerDraw;
  // `1000:6E88` inverts the barrier map, so every cell outside the safe area carries the
  // same value: one shared sweep code advances the whole effect area in lockstep.
  const waveDistance = definition.effectRangeValue - rangeThreshold;
  const inSweepBand = waveDistance >= 1 && waveDistance <= definition.sweepWidth;
  return {
    frame: runtimeTileCode - 1,
    // `0000:65A5` skips code 0; `1000:6E46` admits it, so the two bands differ by one.
    sweepFrame: inSweepBand ? waveDistance - 1 : undefined,
    draw,
    nativeTicks: definition.waitPerDrawNativeTicks,
    visible: waveDistance >= 0 && waveDistance <= definition.sweepWidth,
  };
}

export function routePulsePresentationTimeline(
  definition: RoutePulsePresentationDefinition,
): readonly RoutePulsePresentationFrame[] {
  if (definition.runtimeTileCodes.length === 0
    || definition.iterations < 1
    || definition.drawsPerIteration < 1
    || definition.waitPerDrawNativeTicks < 1) {
    throw new Error(`${definition.id} has an invalid route-pulse presentation timeline`);
  }
  const drawCount = definition.iterations * definition.drawsPerIteration;
  const timeline = Array.from({ length: drawCount }, (_, draw) => frameForDraw(definition, draw));
  const duration = timeline.reduce((total, frame) => total + frame.nativeTicks, 0);
  if (duration !== definition.fixedGraphicWaitNativeTicks) {
    throw new Error(
      `${definition.id} route-pulse timeline is ${duration} native ticks; expected ${definition.fixedGraphicWaitNativeTicks}`,
    );
  }
  if (!timeline.some(({ visible }) => visible)) {
    throw new Error(`${definition.id} route-pulse timeline contains no visible impact frame`);
  }
  return timeline;
}
