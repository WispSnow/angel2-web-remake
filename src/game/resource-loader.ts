import {
  RESOURCE_MANIFEST_IDENTITY,
  RESOURCE_MANIFEST_URL,
  RESOURCE_MANIFEST_VERSION,
} from "./content/resource-manifest.generated";
import type { StageId } from "./types";
import { isMusicResourceUrl, primeEncodedMusic } from "./music-resource-cache";
import {
  isSoundEffectResourceUrl,
  prepareSoundEffectBuffers,
  primeEncodedSoundEffect,
} from "./sound-effect-cache";
import {
  acquireFullCombatImages,
  isFullCombatImageUrl,
  type FullCombatImageLease,
} from "./full-combat-image-cache";
import {
  activateStagedRenderAssets,
  decodeStagedRenderImages,
  isStagedRenderAssetUrl,
  type StagedRenderAssetLease,
} from "./staged-render-asset-cache";
import {
  openPersistentResourceCache,
  type PersistentResourceCache,
} from "./persistent-resource-cache";
import { stageSurfaceImageUrls } from "./stage-surface-image-assets";

export interface ResourceManifestAsset {
  url: string;
  bytes: number;
  sha256: string;
  packages: readonly string[];
}

export interface ResourceManifestPack {
  id: string;
  label: string;
  dependsOn: readonly string[];
  assets: readonly string[];
  next?: readonly string[];
}

export interface ResourceManifest {
  format: string;
  version: number;
  identity: string;
  assets: readonly ResourceManifestAsset[];
  packs: readonly ResourceManifestPack[];
}

interface AssetLoadState {
  loadedBytes: number;
  complete: boolean;
  promise?: Promise<void>;
  encodedRenderAsset?: Uint8Array;
}

type FetchAsset = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface AssetResponse {
  readonly response: Response;
  readonly cacheWrite: Promise<void>;
}

type RenderImagePredecodeSelection = "all"
  | readonly string[]
  | ((urls: readonly string[]) => readonly string[]);

const MAX_PARALLEL_REQUESTS = 6;
const PORTRAIT_ASSET_PREFIX = "/assets/original/portraits/";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

export function parseResourceManifest(value: unknown): ResourceManifest {
  if (!value || typeof value !== "object") throw new Error("資源清單格式無效。");
  const candidate = value as Partial<ResourceManifest>;
  if (candidate.version !== RESOURCE_MANIFEST_VERSION
    || candidate.identity !== RESOURCE_MANIFEST_IDENTITY
    || !Array.isArray(candidate.assets)
    || !Array.isArray(candidate.packs)) {
    throw new Error("資源清單版本與遊戲程式不相符。");
  }
  for (const asset of candidate.assets) {
    if (!asset || typeof asset !== "object") throw new Error("資源清單包含無效檔案。");
    const entry = asset as Partial<ResourceManifestAsset>;
    if (typeof entry.url !== "string" || !entry.url.startsWith("/assets/original/")
      || !Number.isInteger(entry.bytes) || (entry.bytes ?? 0) < 0
      || typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(entry.sha256)
      || !isStringArray(entry.packages)) {
      throw new Error("資源清單包含無效檔案資料。");
    }
  }
  for (const pack of candidate.packs) {
    if (!pack || typeof pack !== "object") throw new Error("資源清單包含無效資源包。");
    const entry = pack as Partial<ResourceManifestPack>;
    if (typeof entry.id !== "string" || typeof entry.label !== "string"
      || !isStringArray(entry.dependsOn) || !isStringArray(entry.assets)
      || (entry.next !== undefined && !isStringArray(entry.next))) {
      throw new Error("資源清單包含無效資源包資料。");
    }
  }
  return candidate as ResourceManifest;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
};

export class ResourcePackLoader {
  private manifestPromise?: Promise<ResourceManifest>;
  private readonly states = new Map<string, AssetLoadState>();
  private activeUrls: readonly string[] = [];
  private overlay?: HTMLElement;
  private progress?: HTMLProgressElement;
  private status?: HTMLElement;
  private detail?: HTMLElement;
  private retry?: HTMLButtonElement;
  private overlayFailed = false;
  private fullCombatImageLease?: FullCombatImageLease;
  private fullCombatImageUrls = new Set<string>();
  private stagedRenderAssetLease?: StagedRenderAssetLease;
  private stagedRenderAssetUrls = new Set<string>();
  private readonly prefetchedRenderUrls = new Map<string, ReadonlySet<string>>();
  private readonly persistentCachePromise: Promise<PersistentResourceCache | undefined>;

  constructor(
    private readonly fetchAsset: FetchAsset = globalThis.fetch.bind(globalThis),
    private readonly ownerDocument: Document = document,
  ) {
    this.persistentCachePromise = openPersistentResourceCache({
      version: RESOURCE_MANIFEST_VERSION,
      identity: RESOURCE_MANIFEST_IDENTITY,
      baseUrl: ownerDocument.baseURI,
    });
  }

  async ensureBoot(afterLoad?: () => Promise<void>): Promise<void> {
    await this.ensurePackVisible("boot", "讀取開場資料", [], "all", afterLoad);
  }

  /**
   * `afterLoad` 讓呼叫端把「不在資源清單裡、但這一關的表面需要」的準備工作留在載入頁
   * 收起之前完成——目前是部署介面那幾個延後載入的模組。慢速連線的等待因此仍然發生在
   * 有進度條的畫面上，而不是在已經切過去、卻還沒有東西可畫的表面上。
   */
  async ensureStage(
    stageId: StageId,
    label = "準備關卡資料",
    supplementalUrls: readonly string[] = [],
    afterLoad?: () => Promise<void>,
  ): Promise<void> {
    const portraitUrls = supplementalUrls.filter((url) =>
      url.startsWith("/assets/original/portraits/") && url.endsWith(".png"));
    await this.ensurePackVisible(
      `stage:${stageId}`,
      label,
      supplementalUrls,
      (urls) => [...new Set([...portraitUrls, ...stageSurfaceImageUrls(urls)])],
      afterLoad,
    );
  }

  async ensureRoute(
    route: "ending" | "credits",
    label: string,
    supplementalUrls: readonly string[] = [],
  ): Promise<void> {
    await this.ensurePackVisible(route, label, supplementalUrls);
  }

  prefetchStage(stageId: StageId, supplementalUrls: readonly string[] = []): void {
    void this.prefetchPack(`stage:${stageId}`, supplementalUrls);
  }

  async prefetchFollowing(stageId: StageId): Promise<void> {
    const manifest = await this.loadManifest();
    const pack = manifest.packs.find(({ id }) => id === `stage:${stageId}`);
    if (!pack) throw new Error(`找不到關卡資源包：${stageId}`);
    await Promise.all((pack.next ?? []).slice(0, 2).map((packId) => this.prefetchPack(packId)));
  }

  private async loadManifest(): Promise<ResourceManifest> {
    if (this.manifestPromise) return this.manifestPromise;
    const pending = this.fetchAsset(RESOURCE_MANIFEST_URL).then(async (response) => {
      if (!response.ok) throw new Error(`資源清單讀取失敗（${response.status}）。`);
      return parseResourceManifest(await response.json());
    });
    this.manifestPromise = pending;
    try {
      return await pending;
    } catch (error) {
      if (this.manifestPromise === pending) this.manifestPromise = undefined;
      throw error;
    }
  }

  private async prefetchPack(
    packId: string,
    supplementalUrls: readonly string[] = [],
  ): Promise<void> {
    try {
      const manifest = await this.loadManifest();
      const urls = [...new Set([...this.resolvePackUrls(manifest, packId), ...supplementalUrls])];
      await this.loadUrls(manifest, urls);
      await prepareSoundEffectBuffers(urls);
      this.rememberPrefetchedRenderUrls(packId, urls);
      await this.replaceFullCombatImageLease(supplementalUrls);
    } catch (error) {
      console.warn(`background resource prefetch failed for ${packId}`, error);
    }
  }

  private ensurePackVisible(
    packId: string,
    label: string,
    supplementalUrls: readonly string[] = [],
    predecodeRenderImages: RenderImagePredecodeSelection = [],
    afterLoad?: () => Promise<void>,
  ): Promise<void> {
    return new Promise((resolve) => {
      const attempt = async () => {
        this.showOverlay(packId, label);
        try {
          const manifest = await this.loadManifest();
          const urls = [...new Set([
            ...this.resolvePackUrls(manifest, packId),
            ...supplementalUrls,
          ])];
          this.activeUrls = urls;
          this.renderProgress(manifest);
          await this.loadUrls(manifest, urls);
          await prepareSoundEffectBuffers(urls);
          this.replaceStagedRenderAssetLease(packId, urls);
          if (predecodeRenderImages === "all") await decodeStagedRenderImages(urls);
          else {
            const selected = typeof predecodeRenderImages === "function"
              ? predecodeRenderImages(urls)
              : predecodeRenderImages;
            if (selected.length > 0) await decodeStagedRenderImages(selected);
          }
          await this.replaceFullCombatImageLease(supplementalUrls);
          await afterLoad?.();
          this.hideOverlay();
          resolve();
        } catch (error) {
          this.renderError(error, attempt);
        }
      };
      void attempt();
    });
  }

  private resolvePackUrls(manifest: ResourceManifest, packId: string): readonly string[] {
    const packs = new Map(manifest.packs.map((pack) => [pack.id, pack]));
    const urls = new Set<string>();
    const resolved = new Set<string>();
    const resolving = new Set<string>();
    const visit = (id: string) => {
      if (resolved.has(id)) return;
      if (resolving.has(id)) throw new Error(`資源包相依循環：${id}`);
      const pack = packs.get(id);
      if (!pack) throw new Error(`找不到資源包：${id}`);
      resolving.add(id);
      for (const dependency of pack.dependsOn) visit(dependency);
      for (const url of pack.assets) urls.add(url);
      resolving.delete(id);
      resolved.add(id);
    };
    visit(packId);
    return [...urls];
  }

  private async loadUrls(manifest: ResourceManifest, urls: readonly string[]): Promise<void> {
    const assets = new Map(manifest.assets.map((asset) => [asset.url, asset]));
    const queue = urls.map((url) => {
      const asset = assets.get(url);
      if (!asset) throw new Error(`資源包引用了未登記檔案：${url}`);
      return asset;
    });
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const asset = queue[cursor];
        cursor += 1;
        await this.loadAsset(asset, manifest);
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(MAX_PARALLEL_REQUESTS, queue.length) },
      () => worker(),
    ));
  }

  private loadAsset(asset: ResourceManifestAsset, manifest: ResourceManifest): Promise<void> {
    const current = this.states.get(asset.url);
    if (current?.complete
      && (!isStagedRenderAssetUrl(asset.url) || current.encodedRenderAsset)) {
      return Promise.resolve();
    }
    if (current?.promise) return current.promise;
    const state: AssetLoadState = current ?? { loadedBytes: 0, complete: false };
    const pending = this.responseForAsset(asset.url).then(async ({ response, cacheWrite }) => {
      if (!response.ok) throw new Error(`讀取失敗（${response.status}）：${asset.url}`);
      const reader = response.body?.getReader();
      const collectEncoded = isMusicResourceUrl(asset.url)
        || isSoundEffectResourceUrl(asset.url)
        || isStagedRenderAssetUrl(asset.url);
      const encodedChunks: Uint8Array[] | undefined = collectEncoded ? [] : undefined;
      let encodedByteLength = 0;
      if (!reader) {
        const encoded = await response.arrayBuffer();
        if (encodedChunks) {
          encodedChunks.push(new Uint8Array(encoded));
          encodedByteLength = encoded.byteLength;
        }
      } else {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          if (encodedChunks) {
            encodedChunks.push(result.value);
            encodedByteLength += result.value.byteLength;
          }
          state.loadedBytes = Math.min(asset.bytes, state.loadedBytes + result.value.byteLength);
          this.renderProgress(manifest);
        }
      }
      if (encodedChunks) {
        const encoded = new ArrayBuffer(encodedByteLength);
        const encodedView = new Uint8Array(encoded);
        let offset = 0;
        for (const chunk of encodedChunks) {
          encodedView.set(chunk, offset);
          offset += chunk.byteLength;
        }
        if (isMusicResourceUrl(asset.url)) primeEncodedMusic(asset.url, encoded);
        if (isSoundEffectResourceUrl(asset.url)) primeEncodedSoundEffect(asset.url, encoded);
        if (isStagedRenderAssetUrl(asset.url)) state.encodedRenderAsset = encodedView;
      }
      await cacheWrite;
      state.loadedBytes = asset.bytes;
      state.complete = true;
      state.promise = undefined;
      this.renderProgress(manifest);
    }).catch((error: unknown) => {
      state.loadedBytes = 0;
      state.complete = false;
      state.promise = undefined;
      state.encodedRenderAsset = undefined;
      throw error;
    });
    state.promise = pending;
    this.states.set(asset.url, state);
    return pending;
  }

  private async responseForAsset(url: string): Promise<AssetResponse> {
    const persistent = await this.persistentCachePromise;
    if (persistent) {
      try {
        const cached = await persistent.match(url);
        if (cached) return { response: cached, cacheWrite: Promise.resolve() };
      } catch (error) {
        console.warn(`persistent resource cache read failed for ${url}`, error);
      }
    }
    const response = await this.fetchAsset(url);
    let cacheWrite = Promise.resolve();
    if (response.ok && persistent) {
      // Cache.put consumes its own cloned branch of the response stream. The
      // visible load keeps reading the original branch. Awaiting the caught
      // write before completing the pack makes an immediate reload deterministic.
      cacheWrite = persistent.put(url, response.clone()).catch((error) => {
        console.warn(`persistent resource cache write failed for ${url}`, error);
      });
    }
    return { response, cacheWrite };
  }

  private replaceStagedRenderAssetLease(packId: string, urls: readonly string[]): void {
    const encodedBytes = new Map<string, Uint8Array>();
    for (const url of urls) {
      if (!isStagedRenderAssetUrl(url)) continue;
      const encoded = this.states.get(url)?.encodedRenderAsset;
      if (!encoded) throw new Error(`已下載的繪圖資源缺少可重用內容：${url}`);
      encodedBytes.set(url, encoded);
    }
    const previousLease = this.stagedRenderAssetLease;
    const previousUrls = this.stagedRenderAssetUrls;
    this.stagedRenderAssetLease = activateStagedRenderAssets(encodedBytes, {
      ownerDocument: this.ownerDocument,
    });
    this.stagedRenderAssetUrls = new Set(encodedBytes.keys());
    this.prefetchedRenderUrls.delete(packId);
    previousLease?.release();
    for (const url of previousUrls) this.releaseUnreferencedEncodedRenderAsset(url);
  }

  private rememberPrefetchedRenderUrls(packId: string, urls: readonly string[]): void {
    const renderUrls = new Set(urls.filter(isStagedRenderAssetUrl));
    this.prefetchedRenderUrls.delete(packId);
    this.prefetchedRenderUrls.set(packId, renderUrls);
    while (this.prefetchedRenderUrls.size > 2) {
      const oldestPackId = this.prefetchedRenderUrls.keys().next().value as string | undefined;
      if (!oldestPackId) break;
      const evicted = this.prefetchedRenderUrls.get(oldestPackId);
      this.prefetchedRenderUrls.delete(oldestPackId);
      for (const url of evicted ?? []) this.releaseUnreferencedEncodedRenderAsset(url);
    }
  }

  private releaseUnreferencedEncodedRenderAsset(url: string): void {
    if (this.stagedRenderAssetUrls.has(url)) return;
    for (const urls of this.prefetchedRenderUrls.values()) {
      if (urls.has(url)) return;
    }
    // Portrait textures are decoded only for the current surface, but their
    // entire campaign stream is just ~400 KiB. Retaining already-read encoded
    // layers avoids a second fetch when the ending hands directly to stage 38,
    // while object URLs and decoded images still leave with the route lease.
    if (url.startsWith(PORTRAIT_ASSET_PREFIX)) return;
    const state = this.states.get(url);
    if (state) state.encodedRenderAsset = undefined;
  }

  private async replaceFullCombatImageLease(urls: readonly string[]): Promise<void> {
    const imageUrls = [...new Set(urls.filter(isFullCombatImageUrl))].sort();
    if (imageUrls.length === 0) return;
    const encodedBytes = new Map<string, Uint8Array>();
    for (const url of imageUrls) {
      const encoded = this.states.get(url)?.encodedRenderAsset;
      if (encoded) encodedBytes.set(url, encoded);
    }
    let nextLease: FullCombatImageLease;
    try {
      nextLease = await acquireFullCombatImages(imageUrls, {
        encodedBytes,
        fetchImage: this.fetchAsset,
        ownerDocument: this.ownerDocument,
      });
    } catch (error) {
      for (const url of imageUrls) {
        const state = this.states.get(url);
        if (!state) continue;
        state.loadedBytes = 0;
        state.complete = false;
        state.encodedRenderAsset = undefined;
      }
      throw error;
    }
    const previousLease = this.fullCombatImageLease;
    const previousUrls = this.fullCombatImageUrls;
    this.fullCombatImageLease = nextLease;
    this.fullCombatImageUrls = new Set(imageUrls);
    for (const url of imageUrls) this.releaseUnreferencedEncodedRenderAsset(url);
    previousLease?.release();
    for (const url of previousUrls) {
      if (this.fullCombatImageUrls.has(url)) continue;
      const state = this.states.get(url);
      if (!state) continue;
      state.loadedBytes = 0;
      state.complete = false;
      state.encodedRenderAsset = undefined;
    }
  }

  private showOverlay(packId: string, label: string): void {
    if (!this.overlay) {
      const overlay = this.ownerDocument.createElement("section");
      overlay.className = "resource-loading-overlay";
      overlay.dataset.testid = "resource-loading-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "resource-loading-title");
      overlay.innerHTML = `
        <div class="resource-loading-panel">
          <p class="resource-loading-kicker">ANGEL2 · WEB REMAKE</p>
          <h1 id="resource-loading-title">整備戰場</h1>
          <div class="resource-loading-rune" aria-hidden="true"><span></span></div>
          <p class="resource-loading-status" data-testid="resource-loading-status" aria-live="polite"></p>
          <progress class="resource-loading-progress" data-testid="resource-loading-progress" aria-label="資源讀取進度" max="100" value="0">0%</progress>
          <p class="resource-loading-detail" data-testid="resource-loading-detail" aria-live="polite">正在讀取資源清單……</p>
          <button class="resource-loading-retry" data-testid="resource-loading-retry" type="button" hidden>重試</button>
        </div>`;
      this.ownerDocument.body.append(overlay);
      this.overlay = overlay;
      this.progress = overlay.querySelector<HTMLProgressElement>("progress") ?? undefined;
      this.status = overlay.querySelector<HTMLElement>("[data-testid=resource-loading-status]") ?? undefined;
      this.detail = overlay.querySelector<HTMLElement>("[data-testid=resource-loading-detail]") ?? undefined;
      this.retry = overlay.querySelector<HTMLButtonElement>("[data-testid=resource-loading-retry]") ?? undefined;
    }
    this.overlay.dataset.resourcePack = packId;
    this.overlay.hidden = false;
    this.overlayFailed = false;
    if (this.status) this.status.textContent = label;
    if (this.detail) this.detail.textContent = "正在讀取資源清單……";
    if (this.progress) this.progress.value = 0;
    if (this.retry) this.retry.hidden = true;
  }

  private renderProgress(manifest: ResourceManifest): void {
    if (!this.overlay || this.overlay.hidden || this.overlayFailed || this.activeUrls.length === 0) return;
    const assets = new Map(manifest.assets.map((asset) => [asset.url, asset]));
    let totalBytes = 0;
    let loadedBytes = 0;
    for (const url of this.activeUrls) {
      const asset = assets.get(url);
      if (!asset) continue;
      totalBytes += asset.bytes;
      const state = this.states.get(url);
      loadedBytes += state?.complete ? asset.bytes : Math.min(asset.bytes, state?.loadedBytes ?? 0);
    }
    const percentage = totalBytes === 0 ? 100 : Math.floor(loadedBytes * 100 / totalBytes);
    if (this.progress) this.progress.value = percentage;
    if (this.detail) {
      this.detail.textContent = `${percentage}%　${formatBytes(loadedBytes)}／${formatBytes(totalBytes)}`;
    }
  }

  private renderError(error: unknown, retry: () => Promise<void>): void {
    this.overlayFailed = true;
    const message = error instanceof Error ? error.message : String(error);
    if (this.status) this.status.textContent = "資源讀取失敗";
    if (this.detail) this.detail.textContent = `${message} 請檢查網路後重試。`;
    if (this.retry) {
      this.retry.hidden = false;
      this.retry.onclick = () => {
        this.retry?.setAttribute("disabled", "");
        void retry().finally(() => this.retry?.removeAttribute("disabled"));
      };
      this.retry.focus({ preventScroll: true });
    }
  }

  private hideOverlay(): void {
    this.activeUrls = [];
    if (this.overlay) this.overlay.hidden = true;
  }
}
