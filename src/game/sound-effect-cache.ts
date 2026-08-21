type FetchSoundEffect = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type DecodeSoundEffect = (encoded: ArrayBuffer) => Promise<AudioBuffer>;

const SOUND_EFFECT_ASSET = /^\/assets\/original\/(?:audio\/.+|speech-\d+|ui-confirm|combat-(?:death|hit|soldier))\.wav$/u;
const MAX_PARALLEL_DECODES = 6;
const encodedSoundEffects = new Map<string, Promise<ArrayBuffer>>();
let decoderContext: OfflineAudioContext | undefined;

export function isSoundEffectResourceUrl(url: string): boolean {
  return SOUND_EFFECT_ASSET.test(url);
}

/**
 * The resource gate owns the network request. Preserve its exact response until
 * the shared buffer bank has decoded it, so playback never falls back to a
 * second media request at the cue boundary.
 */
export function primeEncodedSoundEffect(url: string, encoded: ArrayBuffer): void {
  if (!isSoundEffectResourceUrl(url)) return;
  encodedSoundEffects.set(url, Promise.resolve(encoded));
}

export function loadEncodedSoundEffect(
  url: string,
  fetchSoundEffect: FetchSoundEffect = globalThis.fetch.bind(globalThis),
): Promise<ArrayBuffer> {
  const existing = encodedSoundEffects.get(url);
  if (existing) return existing;
  const request = fetchSoundEffect(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`sound-effect request failed (${response.status}): ${url}`);
    }
    return response.arrayBuffer();
  });
  void request.catch(() => undefined);
  encodedSoundEffects.set(url, request);
  return request;
}

export function releaseEncodedSoundEffect(
  url: string,
  request: Promise<ArrayBuffer>,
): void {
  if (encodedSoundEffects.get(url) === request) encodedSoundEffects.delete(url);
}

const decodeWithOfflineContext: DecodeSoundEffect = (encoded) => {
  decoderContext ??= new OfflineAudioContext(1, 1, 48_000);
  return decoderContext.decodeAudioData(encoded.slice(0));
};

export class SoundEffectBufferBank {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer>>();

  constructor(
    private readonly decodeSoundEffect: DecodeSoundEffect = decodeWithOfflineContext,
    private readonly fetchSoundEffect: FetchSoundEffect = globalThis.fetch.bind(globalThis),
  ) {}

  get size(): number {
    return this.buffers.size;
  }

  get(url: string): AudioBuffer | undefined {
    return this.buffers.get(url);
  }

  async prepare(urls: readonly string[]): Promise<void> {
    const queue = [...new Set(urls.filter(isSoundEffectResourceUrl))]
      .filter((url) => !this.buffers.has(url));
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const url = queue[cursor];
        cursor += 1;
        await this.prepareOne(url);
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(MAX_PARALLEL_DECODES, queue.length) },
      () => worker(),
    ));
  }

  private prepareOne(url: string): Promise<AudioBuffer> {
    const ready = this.buffers.get(url);
    if (ready) return Promise.resolve(ready);
    const existing = this.pending.get(url);
    if (existing) return existing;
    const encodedRequest = loadEncodedSoundEffect(url, this.fetchSoundEffect);
    const request = encodedRequest.then(async (encoded) => {
      const buffer = await this.decodeSoundEffect(encoded);
      this.buffers.set(url, buffer);
      releaseEncodedSoundEffect(url, encodedRequest);
      return buffer;
    }).finally(() => {
      if (this.pending.get(url) === request) this.pending.delete(url);
    });
    void request.catch(() => undefined);
    this.pending.set(url, request);
    return request;
  }
}

export const soundEffectBufferBank = new SoundEffectBufferBank();

export const prepareSoundEffectBuffers = (urls: readonly string[]): Promise<void> =>
  soundEffectBufferBank.prepare(urls);
