import { describe, expect, test } from "vitest";
import { STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS } from "../../src/game/content/stage0-music.generated";
import {
  buildIntroLoopMusicSchedule,
  buildLoopMusicSchedule,
} from "../../src/game/music-schedule";

const SAMPLE_RATE = 44_100;

describe("sample-accurate music schedules", () => {
  test("pre-schedules the battle loop under the entry tail without an ended-event gap", () => {
    const startAt = 10;
    const entry = { duration: 346_112 / SAMPLE_RATE };
    const seamlessLoop = { duration: 2_764_288 / SAMPLE_RATE };
    const schedule = buildIntroLoopMusicSchedule(
      entry,
      seamlessLoop,
      STAGE0_MUSIC_SEAM_CROSSFADE_SECONDS,
      startAt,
    );

    expect(schedule.entryEndAt).toBe(startAt + entry.duration);
    expect(schedule.entryEndAt - schedule.firstLoopStartAt)
      .toBeCloseTo(1_024 / SAMPLE_RATE, 12);
    expect(schedule.seamlessStartAt).toBe(schedule.firstLoopStartAt);
    expect(schedule.periodSeconds).toBe(seamlessLoop.duration);
  });

  test("hands a one-time loop source to its periodic derivative at the exact shortened frame", () => {
    const schedule = buildLoopMusicSchedule(
      { duration: 692_224 / SAMPLE_RATE },
      { duration: 691_200 / SAMPLE_RATE },
      4,
    );
    expect(schedule.crossfadeSeconds).toBeCloseTo(1_024 / SAMPLE_RATE, 12);
    expect(schedule.seamlessStartAt).toBe(4 + 691_200 / SAMPLE_RATE);
    expect(schedule.periodSeconds).toBe(691_200 / SAMPLE_RATE);
  });

  test("rejects invalid derived buffers instead of silently scheduling a discontinuity", () => {
    expect(() => buildLoopMusicSchedule({ duration: 1 }, { duration: 1 }, 0))
      .toThrow("seamless loop must be shorter");
    expect(() => buildIntroLoopMusicSchedule(
      { duration: 0.01 },
      { duration: 1 },
      0.02,
      0,
    )).toThrow("entry must be longer");
  });
});
