import { probePresentation, trackPresentationWork } from "./presentation-probe";
import {
  VOICE_FADE_OUT_SECONDS,
  VOICE_GAIN_BY_VOLUME,
  VOICE_STARTUP_NARRATION,
} from "./content/voice-catalog";
import type { VoiceVolume } from "./preferences";
import type { VoiceUrlLoader } from "./voice";
import { VoiceTransport, type VoiceTransportState } from "./voice-transport";

/** 一句說完到下一句開口之間至少留這麼久。 */
const SENTENCE_GAP_MS = 250;
/**
 * 捲動字幕一行從出現到捲出畫面約 7 秒。旁白比字幕慢時一句接一句排隊，落後超過這麼久
 * 的句子跳過，免得畫面上早已沒有那幾行字。
 */
const LATE_SENTENCE_LIMIT_MS = 6_000;

export interface StartupNarrationState {
  /** 下一句的序號（0 起）。 */
  readonly next: number;
  readonly started: number;
  readonly skipped: number;
  readonly playing: boolean;
  readonly transport?: VoiceTransportState;
}

/**
 * `REMAKE-189` 開場捲動字幕的旁白。原版字幕不打字，一行一行捲入；旁白每句一段，
 * 在該句第一行捲入的那一刻（按捲動進度換算）開始，前一句沒說完就排在其後。只是表現：
 * 不改變捲動速度、背景切換或音樂。語音為「關」時不請求任何檔案。
 */
export class StartupNarration {
  private readonly transport: VoiceTransport;
  private enabled = false;
  private running = false;
  private next = 0;
  private busyUntil = 0;
  private playing = false;
  private justEnded = false;
  private started = 0;
  private skipped = 0;
  private downloads?: Promise<void>;

  constructor(
    private readonly loadUrls: VoiceUrlLoader | undefined,
    private readonly onState: (state: StartupNarrationState) => void = () => undefined,
  ) {
    this.transport = new VoiceTransport(0, (transport) => this.emit(transport));
  }

  /** 方框裡的「劇情語音」選擇：開啟時在背景下載並解碼全部開場旁白。 */
  setVolume(volume: VoiceVolume): void {
    this.enabled = volume > 0;
    this.transport.setGain(VOICE_GAIN_BY_VOLUME[volume]);
    if (!this.enabled) {
      this.stop();
      return;
    }
    if (this.downloads) return;
    const urls = VOICE_STARTUP_NARRATION.map(({ source }) => source);
    const loaded = this.loadUrls ? this.loadUrls(urls) : Promise.resolve();
    this.downloads = loaded
      .catch((error: unknown) => {
        console.warn("startup narration download failed", error);
      })
      .then(async () => {
        await Promise.all(urls.map((url) => this.transport.prepare(url)));
      })
      .catch(() => undefined);
    trackPresentationWork(this.downloads);
  }

  /** 進入遊戲的手勢裡呼叫：解鎖 Web Audio。 */
  unlock(): void {
    this.transport.unlock();
  }

  setPaused(paused: boolean): void {
    this.transport.setSuspended(paused);
  }

  /** 捲動字幕開始（含閒置重播）。 */
  start(): void {
    this.transport.stop();
    this.running = this.enabled;
    this.next = 0;
    this.busyUntil = 0;
    this.playing = false;
    this.justEnded = false;
    this.emit();
  }

  /**
   * 動畫每一幀呼叫。`elapsedMs` 是捲動開始後的程式時間（暫停時凍結），`updateMs` 是一次
   * 捲動更新換算成的毫秒數（測試模式整段壓縮時同比例縮短）。
   */
  tick(elapsedMs: number, updateMs: number): void {
    if (!this.running || this.playing) return;
    if (this.justEnded) {
      // `ended` 回呼不知道捲動時間，間隔從結束後的第一幀算起。
      this.justEnded = false;
      this.busyUntil = elapsedMs + SENTENCE_GAP_MS;
    }
    if (elapsedMs < this.busyUntil) return;
    while (this.next < VOICE_STARTUP_NARRATION.length) {
      const sentence = VOICE_STARTUP_NARRATION[this.next];
      const cueMs = sentence.startUpdate * updateMs;
      if (elapsedMs < cueMs) return;
      if (elapsedMs - cueMs > LATE_SENTENCE_LIMIT_MS) {
        this.next += 1;
        this.skipped += 1;
        continue;
      }
      // 還沒解碼好就等下一幀；拖太久的句子由上面的落後上限跳過。
      if (!this.transport.isReady(sentence.source)) return;
      this.next += 1;
      const played = this.transport.play(sentence.source, () => {
        probePresentation("voice-end", { voice: sentence.source.split("/").at(-1) ?? sentence.source });
        this.playing = false;
        this.justEnded = true;
        this.emit();
      });
      if (played) {
        this.playing = true;
        this.started += 1;
        probePresentation("voice-start", { voice: sentence.source.split("/").at(-1) ?? sentence.source, kind: "narration" });
      }
      this.emit();
      return;
    }
    this.running = false;
  }

  /** 捲動結束：說到一半的那句說完，不再開新句。 */
  finish(): void {
    this.running = false;
  }

  /** 玩家跳過、離開開場或關閉語音：淡出。 */
  stop(): void {
    this.running = false;
    this.playing = false;
    this.transport.stop(VOICE_FADE_OUT_SECONDS);
    this.emit();
  }

  dispose(): void {
    this.running = false;
    this.transport.destroy();
  }

  private emit(transport?: VoiceTransportState): void {
    this.onState({
      next: this.next,
      started: this.started,
      skipped: this.skipped,
      playing: this.playing,
      transport,
    });
  }
}
