export interface MusicBufferTiming {
  duration: number;
}

export interface LoopMusicSchedule {
  startAt: number;
  seamlessStartAt: number;
  crossfadeSeconds: number;
  periodSeconds: number;
}

export interface IntroLoopMusicSchedule extends LoopMusicSchedule {
  entryEndAt: number;
  firstLoopStartAt: number;
}

const positiveDuration = (name: string, value: number): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive duration`);
  return value;
};

export const buildLoopMusicSchedule = (
  originalLoop: MusicBufferTiming,
  seamlessLoop: MusicBufferTiming,
  startAt: number,
): LoopMusicSchedule => {
  const originalDuration = positiveDuration("original loop", originalLoop.duration);
  const seamlessDuration = positiveDuration("seamless loop", seamlessLoop.duration);
  const crossfadeSeconds = originalDuration - seamlessDuration;
  if (crossfadeSeconds <= 0 || crossfadeSeconds >= seamlessDuration) {
    throw new Error("seamless loop must be shorter than its original by one valid crossfade");
  }
  return {
    startAt,
    seamlessStartAt: startAt + seamlessDuration,
    crossfadeSeconds,
    periodSeconds: seamlessDuration,
  };
};

export const buildIntroLoopMusicSchedule = (
  entry: MusicBufferTiming,
  seamlessLoop: MusicBufferTiming,
  crossfadeSeconds: number,
  startAt: number,
): IntroLoopMusicSchedule => {
  const entryDuration = positiveDuration("entry", entry.duration);
  const seamlessDuration = positiveDuration("seamless loop", seamlessLoop.duration);
  const crossfade = positiveDuration("crossfade", crossfadeSeconds);
  if (crossfade >= entryDuration || crossfade >= seamlessDuration) {
    throw new Error("entry must be longer than the loop crossfade");
  }
  const entryEndAt = startAt + entryDuration;
  const firstLoopStartAt = entryEndAt - crossfade;
  return {
    startAt,
    entryEndAt,
    firstLoopStartAt,
    seamlessStartAt: firstLoopStartAt,
    crossfadeSeconds: crossfade,
    periodSeconds: seamlessDuration,
  };
};
