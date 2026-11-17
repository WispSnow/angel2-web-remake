import type { GameController } from "./controller";
import {
  VOICE_CLIPS,
  VOICE_FADE_OUT_SECONDS,
  VOICE_GAIN_BY_VOLUME,
  gateVoiceUrls,
  voiceClipForPage,
  type VoiceClip,
} from "./content/voice-catalog";
import type { DialoguePage } from "./types";
import { retainEncodedVoice, VoiceTransport, type VoiceTransportState } from "./voice-transport";

/** 背景下載一組片段（資源門的同一條快取路徑）；沒有時由播放層按需直接請求。 */
export type VoiceUrlLoader = (urls: readonly string[]) => Promise<void>;

/** 前瞻解碼的頁數（含當前頁）。片段在開頁時必須已經解碼，否則這一頁是無語音頁。 */
const LOOKAHEAD_PAGES = 4;

interface VoicedPage {
  readonly clip: VoiceClip;
  /** 已打出的發音字形數（非 ASCII 字元）。 */
  glyphs: number;
  started: boolean;
  ended: boolean;
  readonly onEnded?: () => void;
}

/**
 * `REMAKE-188` 劇情語音的調度：開頁時決定這一頁有沒有語音、推進時切斷舊片段、在背景
 * 下載本關片段並預先解碼接下來幾頁。它只讀控制器的偏好與對白狀態，不提交任何東西；
 * 自動翻頁由對白層呼叫與玩家主操作相同的推進。
 */
export class VoiceDirector {
  private readonly transport: VoiceTransport;
  private requestedGate?: string;
  private gateDownload?: Promise<void>;
  private readonly failedUrls = new Set<string>();
  private page?: VoicedPage;
  private destroyed = false;

  constructor(
    private readonly controller: GameController,
    private readonly root: HTMLElement,
    private readonly loadUrls?: VoiceUrlLoader,
    transport?: VoiceTransport,
  ) {
    this.transport = transport ?? new VoiceTransport(
      VOICE_GAIN_BY_VOLUME[controller.voiceVolume],
      (state) => this.updateDebugState(state),
    );
    this.updateDebugState();
  }

  unlock(): void {
    this.transport.unlock();
  }

  setSuspended(suspended: boolean): void {
    this.transport.setSuspended(suspended);
  }

  /** 控制器每次變化時呼叫：套用音量、換關下載、前瞻解碼。 */
  sync(): void {
    if (this.destroyed) return;
    const volume = this.controller.voiceVolume;
    this.transport.setGain(VOICE_GAIN_BY_VOLUME[volume]);
    if (volume === 0) {
      // 「關」即完全關閉：正在播的片段淡出，之後不再請求任何語音檔。
      this.endPage();
      this.requestedGate = undefined;
      this.gateDownload = undefined;
      this.updateDebugState();
      return;
    }
    const gate = this.controller.voiceGate;
    if (gate !== this.requestedGate) {
      this.requestedGate = gate;
      const urls = gateVoiceUrls(gate, volume);
      retainEncodedVoice(new Set(urls));
      this.transport.retain(new Set());
      this.gateDownload = this.loadUrls && urls.length > 0
        ? this.loadUrls(urls).catch((error: unknown) => {
          console.warn("voice download failed", error);
        })
        : undefined;
    }
    this.prepareUpcoming();
    this.updateDebugState();
  }

  /**
   * 對白層在一頁開始逐字時呼叫（窗體展開與肖像就緒之後，與口型同一時點）。回傳這一頁
   * 是否有語音；有語音的頁面整頁不提交「說話」逐字聲。
   */
  beginPage(page: DialoguePage, onEnded?: () => void): boolean {
    this.endPage();
    if (this.destroyed || this.controller.voiceVolume === 0) return false;
    const clip = voiceClipForPage(page);
    if (!clip) return false;
    if (!this.transport.isReady(clip.source)) {
      if (this.failedUrls.has(clip.source)) this.controller.reportVoiceUnavailable();
      else void (this.gateDownload ?? Promise.resolve()).then(() => this.prepare(clip.source));
      this.updateDebugState();
      return false;
    }
    this.page = { clip, glyphs: 0, started: false, ended: false, onEnded };
    if (clip.startGlyph === 0) this.start();
    this.updateDebugState();
    return this.page !== undefined;
  }

  /** 每打出一個字呼叫；`startGlyph` 大於 0 的片段等打到那個發音字形才開始。 */
  glyphTyped(character: string): void {
    const page = this.page;
    if (!page || page.started || !/[^\x00-\x7f]/u.test(character)) return;
    if (page.glyphs === page.clip.startGlyph) this.start();
    page.glyphs += 1;
  }

  /** 逐字補完或自然打完。還沒輪到開始的片段此時開始，補完本頁本身不切斷語音。 */
  typingFinished(): void {
    if (this.page && !this.page.started) this.start();
  }

  /** 本頁是有語音頁且片段已經播完。 */
  get pageClipEnded(): boolean {
    return this.page?.ended ?? false;
  }

  get pageVoiced(): boolean {
    return this.page !== undefined;
  }

  /** 推進、跳過、對白結束或離開劇情表面：當前片段約 0.1 秒淡出。 */
  endPage(): void {
    if (!this.page) return;
    this.page = undefined;
    this.transport.stop(VOICE_FADE_OUT_SECONDS);
    this.updateDebugState();
  }

  destroy(): void {
    this.destroyed = true;
    this.page = undefined;
    this.transport.destroy();
  }

  private start(): void {
    const page = this.page;
    if (!page) return;
    page.started = true;
    const played = this.transport.play(page.clip.source, () => {
      if (this.page !== page) return;
      page.ended = true;
      this.updateDebugState();
      page.onEnded?.();
    });
    if (!played) {
      // 尚未解鎖音訊（沒有使用者手勢）時不會有任何聲音；這一頁照無語音頁處理。
      this.page = undefined;
    }
    this.updateDebugState();
  }

  private prepareUpcoming(): void {
    const gate = this.controller.voiceGate;
    const upcoming = this.controller.upcomingStoryPages(LOOKAHEAD_PAGES)
      .map((page) => voiceClipForPage(page))
      .filter((clip): clip is VoiceClip => clip !== undefined && clip.gate === gate);
    // 每段劇情的第一個有語音頁也先解碼：劇情一開始就要開頁，等不及前瞻。
    const leads = VOICE_CLIPS.filter((clip) => clip.gate === gate && clip.lead === true);
    const keep = new Set([...upcoming, ...leads].map((clip) => clip.source));
    const playing = this.transport.playingUrl;
    if (playing) keep.add(playing);
    this.transport.retain(keep);
    const download = this.gateDownload ?? Promise.resolve();
    void download.then(() => {
      if (this.destroyed || this.controller.voiceVolume === 0) return;
      for (const url of keep) void this.prepare(url);
    });
  }

  private async prepare(url: string): Promise<void> {
    const ready = await this.transport.prepare(url);
    if (ready) this.failedUrls.delete(url);
    else this.failedUrls.add(url);
    this.updateDebugState();
  }

  private updateDebugState(state?: VoiceTransportState): void {
    if (!this.controller.isTestMode) return;
    const data = this.root.dataset;
    data.voiceVolumeLevel = String(this.controller.voiceVolume);
    data.voiceAutoAdvance = String(this.controller.voiceAutoAdvance);
    data.voiceGate = this.requestedGate ?? "none";
    data.voicePage = this.page?.clip.key ?? "none";
    data.voicePageStarted = String(this.page?.started ?? false);
    data.voicePageEnded = String(this.page?.ended ?? false);
    data.voiceFailedCount = String(this.failedUrls.size);
    if (state) {
      data.voicePlaying = state.playing ?? "none";
      data.voicePlayCount = String(state.playCount);
      data.voiceDecodedCount = String(state.decodedCount);
      data.voiceContext = state.contextState;
      if (state.error) data.voiceError = state.error;
      else delete data.voiceError;
    }
  }
}
