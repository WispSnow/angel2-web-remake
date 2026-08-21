const RESOURCE_CACHE_PREFIX = "angel2-resources-";

export interface PersistentResourceCache {
  readonly name: string;
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
}

export interface PersistentResourceCacheOptions {
  readonly version: number;
  readonly identity: string;
  readonly baseUrl: string;
  readonly cacheStorage?: CacheStorage;
}

const cacheNameFor = (version: number, identity: string): string =>
  `${RESOURCE_CACHE_PREFIX}v${version}-${identity}`;

/**
 * Cache Storage is used directly by the page; no Service Worker is registered.
 * The manifest identity is part of the namespace, so a changed generated asset
 * can never be confused with bytes from an older release even though the
 * semantic runtime URL remains stable.
 */
export async function openPersistentResourceCache(
  options: PersistentResourceCacheOptions,
): Promise<PersistentResourceCache | undefined> {
  const cacheStorage = options.cacheStorage
    ?? (typeof caches === "undefined" ? undefined : caches);
  if (!cacheStorage) return undefined;
  const name = cacheNameFor(options.version, options.identity);
  try {
    const cache = await cacheStorage.open(name);
    // Old manifests can otherwise accumulate a full campaign per release.
    // Cleanup is deliberately non-blocking: the current cache is usable even
    // when private browsing or a storage quota refuses deletion.
    void cacheStorage.keys().then((names) => Promise.all(names
      .filter((candidate) => candidate.startsWith(RESOURCE_CACHE_PREFIX) && candidate !== name)
      .map((candidate) => cacheStorage.delete(candidate)))).catch(() => undefined);
    const absolute = (url: string) => new URL(url, options.baseUrl).href;
    return {
      name,
      match: (url) => cache.match(absolute(url)),
      put: async (url, response) => {
        await cache.put(absolute(url), response);
      },
    };
  } catch (error) {
    console.warn("persistent resource cache unavailable", error);
    return undefined;
  }
}
