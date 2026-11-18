import type { GameController } from "./controller";
import {
  VOICE_CLIPS,
  VOICE_FADE_OUT_SECONDS,
  VOICE_GAIN_BY_VOLUME,
  battleLineVoiceUrls,
  gateVoiceUrls,
  voiceClipForPage,
  voiceCueForPage,
  voiceLineFor,
  type VoiceClip,
  type VoiceCue,
  type VoiceNarrationClip,
} from "./content/voice-catalog";
import type { DialoguePage } from "./types";
import { hasEncodedVoice, retainEncodedVoice, VoiceTransport, type VoiceTransportState } from "./voice-transport";

/** 背景下載一組片段（資源門的同一條快取路徑）；沒有時由播放層按需直接請求。 */
export type VoiceUrlLoader = (urls: readonly string[]) => Promise<void>;

/** 前瞻解碼的頁數（含當前頁）。片段在開頁時必須已經解碼，否則這一頁是無語音頁。 */
const LOOKAHEAD_PAGES = 4;

/**
 * `REMAKE-189` 戰鬥台詞不可預知，PCM 不預先解碼；編碼資料已在記憶體時開頁才解碼，
 * 解碼超過這個時間就放棄這一句（窗口照原版時序收起）。
 */
const LINE_LATE_START_LIMIT_MS = 500;

interface VoicedPage {
  readonly cue: VoiceCue;
  /** 已打出的發音字形數（非 ASCII 字元）。 */
  glyphs: number;
  started: boolean;
  ended: boolean;
  readonly onEnded?: () => void;
  /** 片段播完、被切斷或放棄時兌現；`lineHold()` 等的就是它。 */
  readonly settled: Promise<void>;
  readonly settle: () => void;
}

/**
 * `REMAKE-188` 劇情語音與 `REMAKE-189` 戰鬥台詞的調度：開頁時決定這一頁有沒有語音、
 * 推進時切斷舊片段、在背景下載本關劇情片段與棋盤上各聲線的台詞片段，並預先解碼接下來
 * 幾頁劇情。它只讀控制器的偏好與對白狀態，不提交任何東西；自動翻頁由對白層呼叫與玩家
 * 主操作相同的推進，戰鬥台詞的「等語音說完」只延後表現。
 */
export class VoiceDirector {
  private readonly transport: VoiceTransport;
  private requestedGate?: string;
  private gateDownload?: Promise<void>;
  private readonly retainedUrls = new Set<string>();
  private readonly lineVoiceUrls = new Set<string>();
  private lineSignature = "";
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

  /** 控制器每次變化時呼叫：套用音量、換關下載、棋盤聲線下載、前瞻解碼。 */
  sync(): void {
    if (this.destroyed) return;
    const volume = this.controller.voiceVolume;
    this.transport.setGain(VOICE_GAIN_BY_VOLUME[volume]);
    if (volume === 0) {
      // 「關」即完全關閉：正在播的片段淡出，之後不再請求任何語音檔。
      this.endPage();
      this.requestedGate = undefined;
      this.gateDownload = undefined;
      this.lineVoiceUrls.clear();
      this.lineSignature = "";
      this.updateDebugState();
      return;
    }
    const gate = this.controller.voiceGate;
    if (gate !== this.requestedGate) {
      this.requestedGate = gate;
      const urls = gateVoiceUrls(gate, volume);
      this.retainedUrls.clear();
      this.lineVoiceUrls.clear();
      this.lineSignature = "";
      for (const url of urls) this.retainedUrls.add(url);
      retainEncodedVoice(this.retainedUrls);
      this.transport.retain(new Set());
      this.gateDownload = this.loadUrls && urls.length > 0
        ? this.loadUrls(urls).catch((error: unknown) => {
          console.warn("voice download failed", error);
        })
        : undefined;
    }
    this.requestBattleLines();
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
    const cue = voiceCueForPage(page);
    return cue ? this.beginCue(cue, onEnded) : false;
  }

  /** `REMAKE-189` 結果回饋窗：妮雅的失敗、勝利與兩個系統確認。 */
  beginLine(portrait: number | undefined, text: string, onEnded?: () => void): boolean {
    this.endPage();
    if (this.destroyed || this.controller.voiceVolume === 0) return false;
    const cue = voiceLineFor(portrait, text);
    return cue ? this.beginCue(cue, onEnded) : false;
  }

  /** `REMAKE-189` 結局尾聲旁白：一段一個片段，與逐字同時開始。 */
  beginNarration(clip: VoiceNarrationClip | undefined, onEnded?: () => void): boolean {
    this.endPage();
    if (!clip || this.destroyed || this.controller.voiceVolume === 0) return false;
    return this.beginCue({ key: clip.key, source: clip.source, durationMs: clip.durationMs, startGlyph: 0, kind: "narration" }, onEnded);
  }

  /** 每打出一個字呼叫；`startGlyph` 大於 0 的片段等打到那個發音字形才開始。 */
  glyphTyped(character: string): void {
    const page = this.page;
    if (!page || page.started || page.cue.kind !== "story" || !/[^\x00-\x7f]/u.test(character)) return;
    if (page.glyphs === page.cue.startGlyph) this.start();
    page.glyphs += 1;
  }

  /** 逐字補完或自然打完。還沒輪到開始的片段此時開始，補完本頁本身不切斷語音。 */
  typingFinished(): void {
    if (this.page && !this.page.started && this.page.cue.kind === "story") this.start();
  }

  /** 本頁是有語音頁且片段已經播完。 */
  get pageClipEnded(): boolean {
    return this.page?.ended ?? false;
  }

  get pageVoiced(): boolean {
    return this.page !== undefined;
  }

  /**
   * `REMAKE-189`：戰鬥台詞窗照原版時序到點後，再等本頁片段說完才收起。沒有語音、
   * 片段被切斷或放棄時立刻兌現。只延後表現，不影響結算。
   */
  lineHold(): Promise<void> {
    return this.page?.settled ?? Promise.resolve();
  }

  /** 推進、跳過、對白結束或離開劇情表面：當前片段約 0.1 秒淡出。 */
  endPage(): void {
    const page = this.page;
    if (!page) return;
    this.page = undefined;
    this.transport.stop(VOICE_FADE_OUT_SECONDS);
    page.settle();
    this.updateDebugState();
  }

  destroy(): void {
    this.destroyed = true;
    const page = this.page;
    this.page = undefined;
    page?.settle();
    this.transport.destroy();
  }

  private beginCue(cue: VoiceCue, onEnded?: () => void): boolean {
    if (this.failedUrls.has(cue.source)) {
      this.controller.reportVoiceUnavailable();
      return false;
    }
    if (!this.transport.isReady(cue.source)) {
      if (cue.kind === "story") {
        void (this.gateDownload ?? Promise.resolve()).then(() => this.prepare(cue.source));
        this.updateDebugState();
        return false;
      }
      // 台詞與旁白只有編碼資料已在記憶體時才算有語音：開頁再解碼，稍晚幾十毫秒開始。
      if (!hasEncodedVoice(cue.source)) {
        void this.prepare(cue.source);
        this.updateDebugState();
        return false;
      }
    }
    let settle = () => undefined as void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const page: VoicedPage = { cue, glyphs: 0, started: false, ended: false, onEnded, settled, settle };
    this.page = page;
    if (this.transport.isReady(cue.source)) {
      if (cue.kind !== "story" || cue.startGlyph === 0) this.start();
    } else {
      const begun = performance.now();
      void this.prepare(cue.source).then(() => {
        if (this.page !== page) return;
        if (!this.transport.isReady(cue.source) || performance.now() - begun > LINE_LATE_START_LIMIT_MS) {
          this.abandon(page);
          return;
        }
        this.start();
      });
    }
    this.updateDebugState();
    return this.page !== undefined;
  }

  private start(): void {
    const page = this.page;
    if (!page) return;
    page.started = true;
    const played = this.transport.play(page.cue.source, () => {
      if (this.page !== page) return;
      page.ended = true;
      page.settle();
      this.updateDebugState();
      page.onEnded?.();
    });
    if (!played) {
      // 尚未解鎖音訊（沒有使用者手勢）時不會有任何聲音；這一頁照無語音頁處理。
      this.abandon(page);
      return;
    }
    this.updateDebugState();
  }

  /**
   * 片段放棄播放（解碼太慢、尚未解鎖）。等片段說完才推進的頁面（授職、集體命令）也要
   * 收到通知，否則會一直等下去；頁面照無語音頁收尾。
   */
  private abandon(page: VoicedPage): void {
    if (this.page === page) this.page = undefined;
    page.settle();
    this.updateDebugState();
    page.onEnded?.();
  }

  /** `REMAKE-189`：棋盤上出現新的聲線就在背景下載它說得出的全部台詞。 */
  private requestBattleLines(): void {
    const portraits = new Set<number>();
    for (const unit of this.controller.battle?.units ?? []) portraits.add(unit.portrait);
    const signature = [...portraits].sort((a, b) => a - b).join(",");
    if (signature === this.lineSignature && this.lineVoiceUrls.size > 0) return;
    this.lineSignature = signature;
    const fresh = battleLineVoiceUrls(portraits, this.controller.voiceVolume)
      .filter((url) => !this.lineVoiceUrls.has(url));
    if (fresh.length === 0) return;
    for (const url of fresh) {
      this.lineVoiceUrls.add(url);
      this.retainedUrls.add(url);
    }
    retainEncodedVoice(this.retainedUrls);
    if (!this.loadUrls) return;
    // 劇情片段先下載：進關劇情馬上要用，台詞要等戰鬥開始。
    const after = this.gateDownload ?? Promise.resolve();
    void after.then(() => this.loadUrls?.(fresh)).catch((error: unknown) => {
      console.warn("voice line download failed", error);
    });
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
    if (this.page) keep.add(this.page.cue.source);
    this.transport.retain(keep);
    const download = this.gateDownload ?? Promise.resolve();
    void download.then(() => {
      if (this.destroyed || this.controller.voiceVolume === 0) return;
      for (const clip of [...upcoming, ...leads]) void this.prepare(clip.source);
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
    data.voicePage = this.page?.cue.key ?? "none";
    data.voicePageStarted = String(this.page?.started ?? false);
    data.voicePageEnded = String(this.page?.ended ?? false);
    data.voiceFailedCount = String(this.failedUrls.size);
    data.voiceLineUrlCount = String(this.lineVoiceUrls.size);
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
