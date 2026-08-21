import { describe, expect, it, vi } from "vitest";
import { openPersistentResourceCache } from "../../src/game/persistent-resource-cache";

class MemoryCache {
  readonly responses = new Map<string, Response>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.responses.get(String(request))?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.responses.set(String(request), response.clone());
  }
}

class MemoryCacheStorage {
  readonly stores = new Map<string, MemoryCache>();

  async open(name: string): Promise<MemoryCache> {
    const existing = this.stores.get(name);
    if (existing) return existing;
    const created = new MemoryCache();
    this.stores.set(name, created);
    return created;
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
}

describe("persistent resource cache", () => {
  it("isolates bytes by manifest identity and removes older release namespaces", async () => {
    const storage = new MemoryCacheStorage();
    storage.stores.set("angel2-resources-v1-old", new MemoryCache());
    storage.stores.set("another-application", new MemoryCache());
    const cache = await openPersistentResourceCache({
      version: 1,
      identity: "new",
      baseUrl: "https://example.test/game/",
      cacheStorage: storage as unknown as CacheStorage,
    });
    expect(cache?.name).toBe("angel2-resources-v1-new");
    await cache?.put("/assets/original/test.bin", new Response("native bytes"));
    expect(await (await cache?.match("/assets/original/test.bin"))?.text()).toBe("native bytes");
    expect(await cache?.match("/assets/original/missing.bin")).toBeUndefined();

    await vi.waitFor(() => {
      expect(storage.stores.has("angel2-resources-v1-old")).toBe(false);
    });
    expect(storage.stores.has("another-application")).toBe(true);
    expect(storage.stores.has("angel2-resources-v1-new")).toBe(true);
  });
});
