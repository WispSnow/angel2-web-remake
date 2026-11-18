/**
 * `REMAKE-192` 說話動畫跟隨語音：從已解碼的片段算出「哪些時段有聲」。口型只在有聲時開合，
 * 語音裡的停頓閉嘴，片段說完才停。
 *
 * 做法：每 10 ms 取 20 ms 窗的 RMS；以片段第 95 百分位的 RMS 為參考，低於它 24 dB 算無聲
 * （片段都已歸一到 −19 LUFS，句間停頓遠低於這條線，清擦音仍在線上）。短於 100 ms 的無聲是
 * 字與字之間的閉塞，視為仍在說話；短於 40 ms 的有聲是雜點，去掉。
 */

export const VOICE_ACTIVITY_HOP_SECONDS = 0.01;
const WINDOW_SECONDS = 0.02;
const REFERENCE_PERCENTILE = 0.95;
const THRESHOLD_DB = -24;
const MIN_GAP_SECONDS = 0.1;
const MIN_RUN_SECONDS = 0.04;
/** 全無聲（或極短）片段的絕對下限，避免把底噪當成說話。 */
const ABSOLUTE_FLOOR = 1e-3;

export interface VoiceActivityTrack {
  readonly hopSeconds: number;
  /** 每一跳一格，1 為有聲。 */
  readonly active: Uint8Array;
}

function runs(active: Uint8Array, value: 0 | 1): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  let start = -1;
  for (let index = 0; index <= active.length; index += 1) {
    const matches = index < active.length && active[index] === value;
    if (matches && start < 0) start = index;
    if (!matches && start >= 0) {
      found.push({ start, end: index });
      start = -1;
    }
  }
  return found;
}

export function voiceActivityTrack(samples: Float32Array, sampleRate: number): VoiceActivityTrack {
  const hop = Math.max(1, Math.round(sampleRate * VOICE_ACTIVITY_HOP_SECONDS));
  const window = Math.max(hop, Math.round(sampleRate * WINDOW_SECONDS));
  const count = Math.max(0, Math.ceil(samples.length / hop));
  const rms = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const from = Math.max(0, index * hop + Math.floor(hop / 2) - Math.floor(window / 2));
    const to = Math.min(samples.length, from + window);
    let sum = 0;
    for (let sample = from; sample < to; sample += 1) sum += samples[sample] * samples[sample];
    rms[index] = to > from ? Math.sqrt(sum / (to - from)) : 0;
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const reference = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * REFERENCE_PERCENTILE))] : 0;
  const threshold = Math.max(ABSOLUTE_FLOOR, reference * 10 ** (THRESHOLD_DB / 20));
  const active = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) active[index] = rms[index] >= threshold ? 1 : 0;
  // 先補短停頓，再去短雜點：字間的閉塞不能讓嘴提早閉上。
  const minGap = Math.round(MIN_GAP_SECONDS / VOICE_ACTIVITY_HOP_SECONDS);
  for (const gap of runs(active, 0)) {
    if (gap.start > 0 && gap.end < count && gap.end - gap.start < minGap) active.fill(1, gap.start, gap.end);
  }
  const minRun = Math.round(MIN_RUN_SECONDS / VOICE_ACTIVITY_HOP_SECONDS);
  for (const run of runs(active, 1)) {
    if (run.end - run.start < minRun) active.fill(0, run.start, run.end);
  }
  return { hopSeconds: VOICE_ACTIVITY_HOP_SECONDS, active };
}

export function voiceActiveAt(track: VoiceActivityTrack, seconds: number): boolean {
  if (!(seconds >= 0)) return false;
  const index = Math.floor(seconds / track.hopSeconds);
  return index < track.active.length && track.active[index] === 1;
}
