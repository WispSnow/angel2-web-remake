/**
 * `REMAKE-192` 高清肖像的說話節奏（計畫文件第 23.4 節，用戶選定的「中速」）：說話期間一個
 * 音節接一個音節——張嘴 70 ms（先快後慢）、停 50 ms、閉嘴 90 ms（兩頭慢）、間隔 50 ms，每段
 * 時長各自隨機 ±20%，張口大小隨機 0.55–1；遇到標點閉嘴 160 ms。不再說話時當前音節立刻轉入
 * 閉嘴段（從當下的開度閉上），不把張嘴與停頓段走完——否則語音裡 0.3 秒的停頓會整個被音節
 * 的餘下部分蓋掉，看不出嘴在停。
 *
 * 「說話」由呼叫端決定：有語音的頁面是語音此刻有聲（語音停頓時閉嘴、片段說完才停），
 * 無語音的頁面是逐字還在跑。這只是表現，隨機數用獨立的 `Math.random`，不碰模擬 PRNG。
 */

export const SPEECH_SYLLABLE_MS = { rise: 70, hold: 50, fall: 90, gap: 50 } as const;
export const SPEECH_JITTER = 0.2;
export const SPEECH_AMPLITUDE = { min: 0.55, max: 1 } as const;
export const SPEECH_PUNCTUATION_QUIET_MS = 160;
/** 無語音頁的標點停頓；與評審頁 `review_full.SPEECH_JS` 的 `PUNCT` 相同。 */
const PUNCTUATION = new Set("，。！？、…；：「」『』—．,.!?;:");

export const speechGlyphIsPunctuation = (character: string): boolean => PUNCTUATION.has(character);

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

interface Syllable {
  readonly start: number;
  readonly rise: number;
  readonly hold: number;
  readonly fall: number;
  readonly gap: number;
  readonly amplitude: number;
  /** 說話中途停下時，閉嘴段提早開始的時刻；之後從 `amplitude`（停下當時的開度）閉上。 */
  readonly fallAt?: number;
}

export class SyllableClock {
  talking = false;
  quietUntil = 0;
  /** 已開始的音節數；測試與調試用。 */
  count = 0;
  private syllable?: Syllable;

  constructor(private readonly random: () => number = Math.random) {}

  /** `clock` 毫秒時的張口程度 0–1。時鐘必須單調遞增（程式時鐘，暫停時凍結）。 */
  at(clock: number): number {
    for (;;) {
      if (!this.syllable) {
        if (!this.talking || clock < this.quietUntil) return 0;
        const jitter = () => 1 - SPEECH_JITTER + this.random() * 2 * SPEECH_JITTER;
        this.syllable = {
          start: clock,
          rise: SPEECH_SYLLABLE_MS.rise * jitter(),
          hold: SPEECH_SYLLABLE_MS.hold * jitter(),
          fall: SPEECH_SYLLABLE_MS.fall * jitter(),
          gap: SPEECH_SYLLABLE_MS.gap * jitter(),
          amplitude: SPEECH_AMPLITUDE.min + this.random() * (SPEECH_AMPLITUDE.max - SPEECH_AMPLITUDE.min),
        };
        this.count += 1;
      }
      const syllable = this.syllable;
      const { start, rise, hold, fall, gap, amplitude } = syllable;
      // 每一支都直接回傳或清掉音節，迴圈至多再開一個新音節（它的開度是 0）就結束；不能靠
      // 「把起點往回推、再比一次時間」轉入閉嘴段——浮點捨入會讓那次比較永遠不成立。
      if (syllable.fallAt === undefined) {
        const elapsed = clock - start;
        if (elapsed < rise + hold) {
          const current = elapsed < rise ? amplitude * easeOut(elapsed / rise) : amplitude;
          if (this.talking) return current;
          this.syllable = { ...syllable, amplitude: current, fallAt: clock };
          return current;
        }
      }
      const sinceFall = clock - (syllable.fallAt ?? start + rise + hold);
      if (sinceFall < fall) return amplitude * (1 - easeInOut(Math.max(0, sinceFall) / fall));
      if (sinceFall < fall + gap) return 0;
      this.syllable = undefined;
    }
  }

  /** 換臉或換頁：不再延續上一句的音節。 */
  reset(): void {
    this.talking = false;
    this.quietUntil = 0;
    this.syllable = undefined;
  }
}

/**
 * 開度 `openness` 落在哪兩格實測嘴形之間（`knots = [0, o(1/4), o(1/2), o(3/4), 1]`）。回傳要依序
 * 疊上的格（1 起算，對應 `levels[index - 1]`）與不透明度：下面那格整格蓋上，上面那格按比例混合。
 * 第 0 格就是底下的閉嘴畫面，不畫。
 */
export function mouthLevelLayers(openness: number, knots: readonly number[]): { level: number; alpha: number }[] {
  const last = knots.length - 1;
  let index = 0;
  while (index < last - 1 && openness > knots[index + 1]) index += 1;
  const fraction = Math.max(0, Math.min(1, (openness - knots[index]) / (knots[index + 1] - knots[index])));
  const layers: { level: number; alpha: number }[] = [];
  if (index > 0) layers.push({ level: index, alpha: 1 });
  if (fraction > 0) layers.push({ level: index + 1, alpha: fraction });
  return layers;
}
