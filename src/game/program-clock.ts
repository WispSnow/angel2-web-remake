/**
 * The game-wide presentation clock.
 *
 * Browser timers keep advancing when a modal merely covers the page.  A DOSBox-
 * style pause needs the opposite contract: every gameplay/presentation delay
 * retains its remaining duration and the shared timestamp stands still until
 * the player resumes.  Network and image decoding are intentionally outside
 * this clock; they may finish in the background, but their result cannot advance
 * a clock-owned sequence while the program is paused.
 */

export type ProgramTimeout = number;

export interface ProgramClockEnvironment {
  now(): number;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
}

interface PendingTimer {
  readonly id: ProgramTimeout;
  readonly target: number;
  readonly callback: () => void;
  nativeHandle?: number;
}

const browserEnvironment: ProgramClockEnvironment = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

export class ProgramClock {
  private paused = false;
  private pausedAt = 0;
  private accumulatedPause = 0;
  private nextTimerId = 1;
  private readonly timers = new Map<ProgramTimeout, PendingTimer>();
  private readonly listeners = new Set<(paused: boolean) => void>();

  constructor(private readonly environment: ProgramClockEnvironment = browserEnvironment) {}

  get isPaused(): boolean {
    return this.paused;
  }

  now(): number {
    const physical = this.paused ? this.pausedAt : this.environment.now();
    return physical - this.accumulatedPause;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    if (paused) {
      this.pausedAt = this.environment.now();
      this.paused = true;
      for (const timer of this.timers.values()) this.disarm(timer);
    } else {
      this.accumulatedPause += Math.max(0, this.environment.now() - this.pausedAt);
      this.paused = false;
      for (const timer of this.timers.values()) this.arm(timer);
    }
    for (const listener of this.listeners) listener(paused);
  }

  toggle(): void {
    this.setPaused(!this.paused);
  }

  subscribe(listener: (paused: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setTimeout(callback: () => void, delay: number): ProgramTimeout {
    const timer: PendingTimer = {
      id: this.nextTimerId++,
      target: this.now() + Math.max(0, delay),
      callback,
    };
    this.timers.set(timer.id, timer);
    if (!this.paused) this.arm(timer);
    return timer.id;
  }

  clearTimeout(id: ProgramTimeout): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    this.disarm(timer);
    this.timers.delete(id);
  }

  delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => this.setTimeout(resolve, milliseconds));
  }

  private arm(timer: PendingTimer): void {
    this.disarm(timer);
    const remaining = Math.max(0, timer.target - this.now());
    timer.nativeHandle = this.environment.setTimeout(() => {
      timer.nativeHandle = undefined;
      if (this.paused || !this.timers.has(timer.id)) return;
      const rest = timer.target - this.now();
      if (rest > 0.5) {
        this.arm(timer);
        return;
      }
      this.timers.delete(timer.id);
      timer.callback();
    }, remaining);
  }

  private disarm(timer: PendingTimer): void {
    if (timer.nativeHandle === undefined) return;
    this.environment.clearTimeout(timer.nativeHandle);
    timer.nativeHandle = undefined;
  }
}

export const programClock = new ProgramClock();

export const programNow = (): number => programClock.now();
export const isProgramPaused = (): boolean => programClock.isPaused;
export const setProgramPaused = (paused: boolean): void => programClock.setPaused(paused);
export const toggleProgramPaused = (): void => programClock.toggle();
export const onProgramPauseChange = (
  listener: (paused: boolean) => void,
): (() => void) => programClock.subscribe(listener);
export const setProgramTimeout = (
  callback: () => void,
  delay: number,
): ProgramTimeout => programClock.setTimeout(callback, delay);
export const clearProgramTimeout = (id: ProgramTimeout): void => programClock.clearTimeout(id);
export const programDelay = (milliseconds: number): Promise<void> => programClock.delay(milliseconds);

/** Keeps an explicitly-created Web Animation on the same pause boundary. */
export function bindProgramAnimation(animation: Animation): () => void {
  let pausedByProgram = false;
  const apply = (paused: boolean) => {
    if (paused) {
      if (animation.playState === "running") {
        animation.pause();
        pausedByProgram = true;
      }
    } else if (pausedByProgram) {
      pausedByProgram = false;
      if (animation.playState === "paused") animation.play();
    }
  };
  apply(programClock.isPaused);
  return programClock.subscribe(apply);
}
