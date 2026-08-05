import type { RoutePulsePresentationDefinition } from "./stage-runtime";

export interface RoutePulsePresentationFrame {
  frame: number;
  draw: number;
  nativeTicks: number;
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
  const waveDistance = definition.effectRangeValue - rangeThreshold;
  return {
    frame: runtimeTileCode - 1,
    draw,
    nativeTicks: definition.waitPerDrawNativeTicks,
    visible: waveDistance >= 0 && waveDistance <= definition.sweepWidth,
  };
}

export function routePulsePresentationTimeline(
  definition: RoutePulsePresentationDefinition,
  reducedMotion = false,
): readonly RoutePulsePresentationFrame[] {
  if (definition.runtimeTileCodes.length === 0
    || definition.iterations < 1
    || definition.drawsPerIteration < 1
    || definition.waitPerDrawNativeTicks < 1
    || definition.minimumStaticFeedbackNativeTicks < 1) {
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
  if (!reducedMotion) return timeline;

  // Reduced motion replaces the alternating wave with one stable, visible
  // impact. Prefer the final native tile-code phase without shortening it
  // below a browser-visible feedback interval.
  const preferredFrame = definition.runtimeTileCodes.at(-1);
  const representative = timeline.find((frame) =>
    frame.visible && frame.frame === (preferredFrame ?? 1) - 1)
    ?? timeline.find((frame) => frame.visible);
  if (!representative) {
    throw new Error(`${definition.id} route-pulse timeline contains no visible impact frame`);
  }
  return [{
    ...representative,
    draw: 0,
    nativeTicks: definition.minimumStaticFeedbackNativeTicks,
  }];
}
