import { test, type Locator, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

/**
 * Transient battle-canvas frames, recorded instead of polled.
 *
 * Under `?test=1` one map-combat or special-action frame holds the canvas for
 * `mapCombatDelay(ticks)` = ticks × 4 ms: usually 40 ms, a stomp quake step only 4 ms.
 * `page.waitForFunction` polls on rAF, which Chromium throttles far below that once several
 * workers compete (see `playwright.config.ts`). So a poll can step over the frame and time out
 * at 60 s, and even when it catches the frame, a follow-up `toHaveAttribute` or state read sees
 * whatever is on screen by then.
 *
 * `BattleScene.sync()` rewrites the canvas `data-*` attributes synchronously on every
 * controller emit, and each presentation frame awaits its own program timer, a separate task.
 * A MutationObserver installed before the action therefore runs its microtask between any two
 * frames and records every one of them, in order, however loaded the machine is. Install the
 * recorder, trigger the action, wait for a persistent end state (for example
 * `specialActionPresentation === undefined` in `getState()`), then assert on `stop()`.
 */

/** One distinct published state: the recorded `dataset` keys, plus the probe result if any. */
export type CanvasFrame<Key extends string, State = never> =
  { readonly [K in Key]?: string } & { readonly state?: State };

export type CanvasFrameMatch<Key extends string> = { readonly [K in Key]?: string };

export interface CanvasFrameRecording<Key extends string, State = never> {
  /**
   * `VISUAL_AUDIT=1` only: screenshots `target` while the canvas still shows `frame`. This is
   * best effort and never an assertion. A frame the screenshot can no longer reach is noted in
   * the test annotations and skipped. The global program pause cannot hold a frame for the
   * screenshot either, because it also pauses Phaser before the frame is drawn.
   */
  captureVisualAudit(
    target: Locator,
    frame: CanvasFrameMatch<Key>,
    options: { path: string },
  ): Promise<void>;
  /** Stops observing and returns every distinct sample, oldest first. */
  stop(): Promise<Array<CanvasFrame<Key, State>>>;
}

/** The canvas `dataset` entries of the ordinary map-combat and special-action frames. */
export const MAP_COMBAT_FRAME_KEYS = [
  "mapCombatPhase",
  "mapCombatFrame",
  "mapCombatEffectTileCount",
] as const;

/** The canvas `dataset` entries of one 巨龍騎士 stomp step. */
export const STOMP_FRAME_KEYS = [
  "mapCombatFrame",
  "mapCombatEffectTileCount",
  "mapCombatStompPhase",
  "mapCombatStompExplicitTicks",
  "mapCombatStompAction",
  "mapCombatStompX",
  "mapCombatStompShadowY",
  "mapCombatStompResource",
  "mapCombatStompTargetScreenX",
  "mapCombatStompTargetScreenY",
  "mapCombatStompImpactScreenX",
  "mapCombatStompImpactScreenY",
] as const;

/**
 * Starts recording the battle canvas `dataset` entries named by `keys`, in their camelCase
 * `dataset` form. `probe`, when given, runs in the page at every sample and its JSON result is
 * stored as `state`. Like any `page.evaluate` function, it must be self-contained.
 */
export async function recordCanvasFrames<Key extends string, State = never>(
  page: Page,
  keys: readonly Key[],
  probe?: () => State,
): Promise<CanvasFrameRecording<Key, State>> {
  // A battle that was just started mounts its canvas asynchronously.
  await page.getByTestId("battle-canvas").waitFor({ state: "attached" });
  const recorder = await page.evaluateHandle(({ datasetKeys, probeSource }) => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    if (!canvas) throw new Error("the battle canvas is not mounted");
    // A function cannot cross into the page as an argument, so the probe travels as source
    // text, just as Playwright ships every page function.
    const probe = probeSource === undefined
      ? undefined
      : (0, eval)(`(${probeSource})`) as () => unknown;
    const samples: Array<Record<string, unknown>> = [];
    let previous = "";
    const record = (): void => {
      const sample: Record<string, unknown> = {};
      for (const key of datasetKeys) {
        const value = canvas.dataset[key];
        if (value !== undefined) sample[key] = value;
      }
      if (probe) sample.state = probe();
      // Every sync rewrites the attributes, changed or not: keep one sample per change.
      const serialized = JSON.stringify(sample);
      if (serialized === previous) return;
      previous = serialized;
      samples.push(JSON.parse(serialized) as Record<string, unknown>);
    };
    const observer = new MutationObserver(record);
    observer.observe(canvas, {
      attributes: true,
      // Every sync also rewrites the effect tile count, between presentations too, so a probe
      // sees state that changes while the recorded keys stay put.
      attributeFilter: [...new Set([...datasetKeys, "mapCombatEffectTileCount"])].map((key) =>
        `data-${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`),
    });
    record();
    const matches = (
      sample: Readonly<Record<string, unknown>>,
      frame: Readonly<Record<string, string | undefined>>,
    ): boolean => Object.entries(frame).every(([key, value]) => sample[key] === value);
    return {
      locate: (frame: Readonly<Record<string, string | undefined>>) => {
        if (matches({ ...canvas.dataset }, frame)) return "on-screen";
        return samples.some((sample) => matches(sample, frame)) ? "passed" : undefined;
      },
      stop: () => {
        if (observer.takeRecords().length > 0) record();
        observer.disconnect();
        if (!canvas.isConnected) throw new Error("the battle canvas was replaced while recording");
        return samples;
      },
    };
  }, { datasetKeys: [...keys], probeSource: probe?.toString() });

  return {
    async captureVisualAudit(target, frame, options) {
      if (process.env.VISUAL_AUDIT !== "1") return;
      const expected: Readonly<Record<string, string | undefined>> = frame;
      const located = await page.waitForFunction(
        ({ handle, match }) => handle.locate(match),
        { handle: recorder, match: expected },
        { polling: "raf", timeout: 15_000 },
      ).then((result) => result.jsonValue(), () => undefined);
      if (located === "on-screen") {
        await captureVisualAudit(target, options);
        return;
      }
      test.info().annotations.push({
        type: "visual-audit",
        description: `skipped ${options.path}: ${located === "passed"
          ? "the frame had already passed"
          : "the frame never appeared"} (${JSON.stringify(frame)})`,
      });
    },
    async stop() {
      const samples = await recorder.evaluate((handle) => handle.stop());
      await recorder.dispose();
      return samples as Array<CanvasFrame<Key, State>>;
    },
  };
}

/** Every recorded sample whose `dataset` entries equal `frame`'s, oldest first. */
export function drawnFrames<Key extends string, State>(
  samples: ReadonlyArray<CanvasFrame<Key, State>>,
  frame: CanvasFrameMatch<Key>,
): Array<CanvasFrame<Key, State>> {
  const expected: ReadonlyArray<[string, string | undefined]> = Object.entries(frame);
  return samples.filter((sample) => {
    const drawn: Readonly<Record<string, unknown>> = sample;
    return expected.every(([key, value]) => drawn[key] === value);
  });
}

/**
 * The recorded quake steps of a stomp. `impactOnTarget` says whether the drawn impact point
 * is the selected target's screen point.
 */
export function quakeSteps<State>(
  samples: ReadonlyArray<CanvasFrame<(typeof STOMP_FRAME_KEYS)[number], State>>,
) {
  return drawnFrames(samples, { mapCombatStompPhase: "quake" }).map((step) => ({
    ...step,
    impactOnTarget: step.mapCombatStompTargetScreenX !== undefined
      && step.mapCombatStompTargetScreenX === step.mapCombatStompImpactScreenX
      && step.mapCombatStompTargetScreenY !== undefined
      && step.mapCombatStompTargetScreenY === step.mapCombatStompImpactScreenY,
  }));
}

/**
 * The single recorded sample matching `frame`. A frame is one presentation step, so it is
 * drawn once. Zero or several matches fail with the whole recording in the message.
 */
export function drawnFrame<Key extends string, State>(
  samples: ReadonlyArray<CanvasFrame<Key, State>>,
  frame: CanvasFrameMatch<Key>,
): CanvasFrame<Key, State> {
  const [only, ...rest] = drawnFrames(samples, frame);
  if (only && rest.length === 0) return only;
  const recording = samples.map(({ state: _state, ...drawn }) => JSON.stringify(drawn)).join("\n");
  throw new Error(`expected exactly one drawn frame matching ${JSON.stringify(frame)}, `
    + `found ${rest.length + (only ? 1 : 0)} in ${samples.length} samples:\n${recording}`);
}
