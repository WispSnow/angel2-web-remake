export interface StompPresentationContract {
  readonly rising: {
    readonly positions: readonly number[];
    readonly timedSteps: number;
    readonly waitPerTimedStepNativeTicks: number;
  };
  readonly preQuakePageToggles: number;
  readonly quake: {
    readonly cyclePositions: readonly number[];
    readonly cycles: number;
    readonly explicitWaitNativeTicks: number;
  };
  readonly postQuakePageToggles: number;
  readonly falling: {
    readonly positions: readonly number[];
    readonly timedSteps: number;
    readonly waitPerTimedStepNativeTicks: number;
  };
  readonly graphicDrawCount: number;
  readonly fixedGraphicWaitNativeTicks: number;
}

export type StompPresentationStepPhase =
  | "rising"
  | "pre-quake-page-toggle"
  | "quake"
  | "post-quake-page-toggle"
  | "falling";

export interface StompPresentationStep {
  readonly index: number;
  readonly phase: StompPresentationStepPhase;
  readonly y: number;
  readonly graphicDrawIndex?: number;
  readonly explicitNativeTicks: number;
  readonly displayNativeTicks: number;
  readonly startDisplayNativeTicks: number;
  readonly endDisplayNativeTicks: number;
  readonly audioAfter: boolean;
}

/**
 * VGA page flips have no native timer wait, but each flip exposes a distinct
 * display state. One Web display quantum keeps those states observable while
 * preserving the separately audited explicit native-tick total.
 */
export function buildStompPresentationSteps(
  presentation: StompPresentationContract,
): readonly StompPresentationStep[] {
  const steps: StompPresentationStep[] = [];
  let displayCursor = 0;
  let graphicDrawIndex = 0;
  const push = (
    phase: StompPresentationStepPhase,
    y: number,
    explicitNativeTicks: number,
    audioAfter = false,
    isGraphicDraw = true,
  ): void => {
    const displayNativeTicks = Math.max(1, explicitNativeTicks);
    const startDisplayNativeTicks = displayCursor;
    displayCursor += displayNativeTicks;
    steps.push({
      index: steps.length,
      phase,
      y,
      graphicDrawIndex: isGraphicDraw ? graphicDrawIndex++ : undefined,
      explicitNativeTicks,
      displayNativeTicks,
      startDisplayNativeTicks,
      endDisplayNativeTicks: displayCursor,
      audioAfter,
    });
  };

  presentation.rising.positions.forEach((y, index) => push(
    "rising",
    y,
    index < presentation.rising.timedSteps
      ? presentation.rising.waitPerTimedStepNativeTicks
      : 0,
    index === presentation.rising.positions.length - 1,
  ));
  const groundY = presentation.rising.positions.at(-1);
  if (groundY === undefined) throw new Error("stomp rising positions are empty");
  for (let toggle = 0; toggle < presentation.preQuakePageToggles; toggle += 1) {
    push("pre-quake-page-toggle", groundY, 0, false, false);
  }
  for (let cycle = 0; cycle < presentation.quake.cycles; cycle += 1) {
    presentation.quake.cyclePositions.forEach((y, index) => push(
      "quake",
      y,
      presentation.quake.explicitWaitNativeTicks,
      index === presentation.quake.cyclePositions.length - 1,
    ));
  }
  for (let toggle = 0; toggle < presentation.postQuakePageToggles; toggle += 1) {
    push("post-quake-page-toggle", groundY, 0, false, false);
  }
  presentation.falling.positions.forEach((y, index) => push(
    "falling",
    y,
    index < presentation.falling.timedSteps
      ? presentation.falling.waitPerTimedStepNativeTicks
      : 0,
  ));

  const graphicDrawCount = steps.filter(({ graphicDrawIndex: draw }) => draw !== undefined).length;
  const explicitNativeTicks = steps.reduce((total, step) => total + step.explicitNativeTicks, 0);
  const audioRequests = steps.filter(({ audioAfter }) => audioAfter).length;
  if (graphicDrawCount !== presentation.graphicDrawCount
    || explicitNativeTicks !== presentation.fixedGraphicWaitNativeTicks
    || audioRequests !== 4) {
    throw new Error(
      `invalid stomp timeline: ${graphicDrawCount} draws, ${explicitNativeTicks} ticks, ${audioRequests} audio requests`,
    );
  }
  return steps;
}

export function stompPresentationStepAtTime(
  steps: readonly StompPresentationStep[],
  displayNativeTicks: number,
): StompPresentationStep {
  const last = steps.at(-1);
  if (!last) throw new Error("stomp timeline is empty");
  return steps.find(({ endDisplayNativeTicks }) => displayNativeTicks < endDisplayNativeTicks)
    ?? last;
}
