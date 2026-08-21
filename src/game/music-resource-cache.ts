type FetchMusic = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const MUSIC_ASSET_PREFIX = "/assets/original/music/";
const encodedMusic = new Map<string, Promise<ArrayBuffer>>();

export function isMusicResourceUrl(url: string): boolean {
  return url.startsWith(MUSIC_ASSET_PREFIX) && url.endsWith(".ogg");
}

/**
 * The staged resource gate has already paid the network cost before a scene
 * becomes visible. Keep that exact encoded response available to Web Audio so
 * selecting the scene's first track cannot trigger a second network request.
 * Decoding remains demand-driven; this cache never creates an AudioContext or
 * retains decoded PCM for future stages.
 */
export function primeEncodedMusic(url: string, encoded: ArrayBuffer): void {
  if (!isMusicResourceUrl(url)) return;
  encodedMusic.set(url, Promise.resolve(encoded));
}

export function loadEncodedMusic(
  url: string,
  fetchMusic: FetchMusic = globalThis.fetch.bind(globalThis),
): Promise<ArrayBuffer> {
  const existing = encodedMusic.get(url);
  if (existing) return existing;
  const request = fetchMusic(url).then(async (response) => {
    if (!response.ok) throw new Error(`music request failed (${response.status}): ${url}`);
    return response.arrayBuffer();
  });
  void request.catch(() => undefined);
  encodedMusic.set(url, request);
  return request;
}

export function releaseEncodedMusic(url: string, request: Promise<ArrayBuffer>): void {
  if (encodedMusic.get(url) === request) encodedMusic.delete(url);
}
