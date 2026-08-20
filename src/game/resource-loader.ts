import {
  RESOURCE_MANIFEST_IDENTITY,
  RESOURCE_MANIFEST_URL,
  RESOURCE_MANIFEST_VERSION,
} from "./content/resource-manifest.generated";
import type { StageId } from "./types";

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
}

type FetchAsset = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const MAX_PARALLEL_REQUESTS = 6;

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

  constructor(
    private readonly fetchAsset: FetchAsset = globalThis.fetch.bind(globalThis),
    private readonly ownerDocument: Document = document,
  ) {}

  async ensureBoot(): Promise<void> {
    await this.ensurePackVisible("boot", "讀取開場資料");
  }

  async ensureStage(
    stageId: StageId,
    label = "準備關卡資料",
    supplementalUrls: readonly string[] = [],
  ): Promise<void> {
    await this.ensurePackVisible(`stage:${stageId}`, label, supplementalUrls);
  }

  async ensureRoute(route: "ending" | "credits", label: string): Promise<void> {
    await this.ensurePackVisible(route, label);
  }

  prefetchStage(stageId: StageId): void {
    void this.prefetchPack(`stage:${stageId}`);
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

  private async prefetchPack(packId: string): Promise<void> {
    try {
      const manifest = await this.loadManifest();
      const urls = this.resolvePackUrls(manifest, packId);
      await this.loadUrls(manifest, urls);
    } catch (error) {
      console.warn(`background resource prefetch failed for ${packId}`, error);
    }
  }

  private ensurePackVisible(
    packId: string,
    label: string,
    supplementalUrls: readonly string[] = [],
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
    if (current?.complete) return Promise.resolve();
    if (current?.promise) return current.promise;
    const state: AssetLoadState = current ?? { loadedBytes: 0, complete: false };
    const pending = this.fetchAsset(asset.url).then(async (response) => {
      if (!response.ok) throw new Error(`讀取失敗（${response.status}）：${asset.url}`);
      const reader = response.body?.getReader();
      if (!reader) {
        await response.arrayBuffer();
      } else {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          state.loadedBytes = Math.min(asset.bytes, state.loadedBytes + result.value.byteLength);
          this.renderProgress(manifest);
        }
      }
      state.loadedBytes = asset.bytes;
      state.complete = true;
      state.promise = undefined;
      this.renderProgress(manifest);
    }).catch((error: unknown) => {
      state.loadedBytes = 0;
      state.complete = false;
      state.promise = undefined;
      throw error;
    });
    state.promise = pending;
    this.states.set(asset.url, state);
    return pending;
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
