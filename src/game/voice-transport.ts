/**
 * `REMAKE-188` 劇情語音的播放層：自己的 AudioContext、主增益、至多一個正在播放的片段，
 * 以及有上限的解碼快取。它只管聲音，不知道對白頁或偏好；`VoiceDirector` 決定播什麼。
 *
 * 全局暫停時整個 context 掛起，片段停在原採樣位置，`ended` 也不會在暫停中觸發，所以
 * 依賴它的自動翻頁計時一併凍結。
 */

type FetchVoice = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type DecodeVoice = (encoded: ArrayBuffer) => Promise<AudioBuffer>;

const VOICE_ASSET_PREFIX = "/assets/original/voice/";
const VOLUME_RAMP_SECONDS = 0.015;
/** 解碼後的 PCM 很大（48 kHz 單聲道每秒約 190 KB），只留當前頁與前瞻的幾頁。 */
const MAX_DECODED_CLIPS = 16;

const encodedVoice = new Map<string, Promise<ArrayBuffer>>();
let decoderContext: OfflineAudioContext | undefined;

export function isVoiceResourceUrl(url: string): boolean {
  return url.startsWith(VOICE_ASSET_PREFIX) && url.endsWith(".ogg");
}

/** 資源門已經付過網路成本；留下同一份編碼資料，播放前不必再請求一次。 */
export function primeEncodedVoice(url: string, encoded: ArrayBuffer): void {
  if (!isVoiceResourceUrl(url)) return;
  encodedVoice.set(url, Promise.resolve(encoded));
}

export function hasEncodedVoice(url: string): boolean {
  return encodedVoice.has(url);
}

export function loadEncodedVoice(
  url: string,
  fetchVoice: FetchVoice = globalThis.fetch.bind(globalThis),
): Promise<ArrayBuffer> {
  const existing = encodedVoice.get(url);
  if (existing) return existing;
  const request = fetchVoice(url).then(async (response) => {
    if (!response.ok) throw new Error(`voice request failed (${response.status}): ${url}`);
    return response.arrayBuffer();
  });
  void request.catch(() => undefined);
  encodedVoice.set(url, request);
  // 失敗的請求不能留著，否則之後的重試只會重播同一個錯誤。
  void request.catch(() => {
    if (encodedVoice.get(url) === request) encodedVoice.delete(url);
  });
  return request;
}

/** 換關時丟掉其他關的編碼資料，整個戰役的語音不會一路累積在記憶體裡。 */
export function retainEncodedVoice(urls: ReadonlySet<string>): void {
  for (const url of [...encodedVoice.keys()]) if (!urls.has(url)) encodedVoice.delete(url);
}

const decodeWithOfflineContext: DecodeVoice = (encoded) => {
  decoderContext ??= new OfflineAudioContext(1, 1, 48_000);
  return decoderContext.decodeAudioData(encoded.slice(0));
};

export interface VoiceTransportState {
  readonly contextState: AudioContextState | "uninitialized";
  readonly playing?: string;
  readonly decodedCount: number;
  readonly playCount: number;
  readonly error?: string;
}

interface ActiveVoice {
  readonly url: string;
  readonly source: AudioBufferSourceNode;
  readonly output: GainNode;
  ended: boolean;
}

export class VoiceTransport {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private unlocked = false;
  private suspended = false;
  private current?: ActiveVoice;
  private playCount = 0;
  private error?: string;
  private readonly decoded = new Map<string, AudioBuffer>();
  private readonly decoding = new Map<string, Promise<boolean>>();

  constructor(
    private gain: number,
    private readonly onStateChange: (state: VoiceTransportState) => void = () => undefined,
    private readonly decodeVoice: DecodeVoice = decodeWithOfflineContext,
    private readonly fetchVoice?: FetchVoice,
  ) {
    this.emitState();
  }

  unlock(): void {
    this.unlocked = true;
    const context = this.ensureContext();
    void context.resume().then(() => {
      if (this.suspended) return context.suspend();
      return undefined;
    }).catch((error: unknown) => this.fail(error));
    this.emitState();
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    const context = this.context;
    if (!context || !this.unlocked) return;
    void (suspended ? context.suspend() : context.resume())
      .then(() => this.emitState())
      .catch((error: unknown) => this.fail(error));
  }

  setGain(gain: number): void {
    if (gain === this.gain) return;
    this.gain = gain;
    const context = this.context;
    const masterGain = this.masterGain;
    if (context && masterGain) {
      const now = context.currentTime;
      masterGain.gain.cancelAndHoldAtTime(now);
      masterGain.gain.linearRampToValueAtTime(gain, now + VOLUME_RAMP_SECONDS);
    }
  }

  isReady(url: string): boolean {
    return this.decoded.has(url);
  }

  /** 下載（或取用資源門留下的編碼資料）並解碼；回傳是否就緒。失敗不拋出。 */
  prepare(url: string): Promise<boolean> {
    if (this.decoded.has(url)) {
      this.touch(url);
      return Promise.resolve(true);
    }
    const pending = this.decoding.get(url);
    if (pending) return pending;
    const request = loadEncodedVoice(url, this.fetchVoice)
      .then((encoded) => this.decodeVoice(encoded))
      .then((buffer) => {
        this.decoded.set(url, buffer);
        this.trim();
        this.emitState();
        return true;
      })
      .catch((error: unknown) => {
        this.fail(error);
        return false;
      })
      .finally(() => {
        this.decoding.delete(url);
      });
    this.decoding.set(url, request);
    return request;
  }

  /** 只保留這些片段的 PCM（加上正在播放的那段）。 */
  retain(urls: ReadonlySet<string>): void {
    for (const url of [...this.decoded.keys()]) {
      if (!urls.has(url) && url !== this.current?.url) this.decoded.delete(url);
    }
    this.emitState();
  }

  /**
   * 從頭播放一個已解碼的片段；之前的片段先淡出。未解鎖、暫停中或未解碼時回傳 `false`，
   * 這一頁就是無語音頁。
   */
  play(url: string, onEnded?: () => void): boolean {
    const buffer = this.decoded.get(url);
    if (!buffer || !this.unlocked) return false;
    this.stop();
    const context = this.ensureContext();
    const masterGain = this.masterGain;
    if (!masterGain) return false;
    const source = context.createBufferSource();
    const output = context.createGain();
    output.gain.setValueAtTime(1, context.currentTime);
    source.buffer = buffer;
    source.connect(output);
    output.connect(masterGain);
    const active: ActiveVoice = { url, source, output, ended: false };
    source.addEventListener("ended", () => {
      if (active.ended) return;
      active.ended = true;
      source.disconnect();
      output.disconnect();
      const natural = this.current === active;
      if (natural) this.current = undefined;
      this.emitState();
      if (natural) onEnded?.();
    }, { once: true });
    this.current = active;
    this.touch(url);
    this.playCount += 1;
    source.start(context.currentTime);
    this.emitState();
    return true;
  }

  /** 淡出並停止正在播放的片段；它的 `onEnded` 不會再被呼叫。 */
  stop(fadeSeconds = 0): void {
    const active = this.current;
    this.current = undefined;
    if (!active || active.ended) return;
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    const stopAt = now + Math.max(0, fadeSeconds);
    active.output.gain.cancelAndHoldAtTime(now);
    active.output.gain.linearRampToValueAtTime(0, stopAt);
    try {
      active.source.stop(stopAt);
    } catch {
      active.ended = true;
    }
    this.emitState();
  }

  get playingUrl(): string | undefined {
    return this.current?.url;
  }

  destroy(): void {
    this.stop();
    this.decoded.clear();
    const context = this.context;
    this.context = undefined;
    this.masterGain = undefined;
    if (context) void context.close().catch(() => undefined);
    this.emitState();
  }

  private touch(url: string): void {
    const buffer = this.decoded.get(url);
    if (!buffer) return;
    this.decoded.delete(url);
    this.decoded.set(url, buffer);
  }

  private trim(): void {
    while (this.decoded.size > MAX_DECODED_CLIPS) {
      const oldest = [...this.decoded.keys()].find((url) => url !== this.current?.url);
      if (!oldest) return;
      this.decoded.delete(oldest);
    }
  }

  private ensureContext(): AudioContext {
    if (this.context && this.masterGain) return this.context;
    const context = new AudioContext({ latencyHint: "interactive" });
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(this.gain, context.currentTime);
    masterGain.connect(context.destination);
    context.addEventListener("statechange", () => this.emitState());
    this.context = context;
    this.masterGain = masterGain;
    return context;
  }

  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.emitState();
  }

  private emitState(): void {
    this.onStateChange({
      contextState: this.context?.state ?? "uninitialized",
      playing: this.current?.url,
      decodedCount: this.decoded.size,
      playCount: this.playCount,
      error: this.error,
    });
  }
}
