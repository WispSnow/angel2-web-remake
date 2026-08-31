import { describe, expect, it } from "vitest";
import { ProgramClock, type ProgramClockEnvironment } from "../../src/game/program-clock";

interface ScheduledCallback {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
}

const fakeEnvironment = () => {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, ScheduledCallback>();
  const environment: ProgramClockEnvironment = {
    now: () => now,
    setTimeout: (callback, delay) => {
      const id = nextId++;
      scheduled.set(id, { id, at: now + delay, callback });
      return id;
    },
    clearTimeout: (id) => { scheduled.delete(id); },
  };
  const advance = (milliseconds: number) => {
    const target = now + milliseconds;
    while (true) {
      const next = [...scheduled.values()]
        .filter(({ at }) => at <= target)
        .sort((left, right) => left.at - right.at || left.id - right.id)[0];
      if (!next) break;
      now = next.at;
      scheduled.delete(next.id);
      next.callback();
    }
    now = target;
  };
  return { environment, advance, scheduled };
};

describe("ProgramClock", () => {
  it("holds both its timestamp and timeout remainder while paused", () => {
    const fake = fakeEnvironment();
    const clock = new ProgramClock(fake.environment);
    let fired = 0;
    clock.setTimeout(() => { fired += 1; }, 100);

    fake.advance(35);
    clock.setPaused(true);
    const frozenAt = clock.now();
    fake.advance(500);

    expect(clock.now()).toBe(frozenAt);
    expect(fired).toBe(0);
    expect(fake.scheduled.size).toBe(0);

    clock.setPaused(false);
    fake.advance(64);
    expect(fired).toBe(0);
    fake.advance(1);
    expect(fired).toBe(1);
    expect(clock.now()).toBe(100);
  });

  it("does not arm timers created during a pause until resume", () => {
    const fake = fakeEnvironment();
    const clock = new ProgramClock(fake.environment);
    let fired = false;
    clock.setPaused(true);
    clock.setTimeout(() => { fired = true; }, 20);
    fake.advance(1_000);
    expect(fake.scheduled.size).toBe(0);

    clock.setPaused(false);
    fake.advance(19);
    expect(fired).toBe(false);
    fake.advance(1);
    expect(fired).toBe(true);
  });

  it("clears a paused timer without resurrecting it on resume", () => {
    const fake = fakeEnvironment();
    const clock = new ProgramClock(fake.environment);
    let fired = false;
    const timer = clock.setTimeout(() => { fired = true; }, 20);
    clock.setPaused(true);
    clock.clearTimeout(timer);
    clock.setPaused(false);
    fake.advance(100);
    expect(fired).toBe(false);
  });
});
