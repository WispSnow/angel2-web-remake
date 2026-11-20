import { vi } from "vitest";

/**
 * Just enough DOM for the HD video layers (`intro-hd.ts`, `the-end-hd.ts`) to run under the
 * node test environment: canvases record their draws, videos expose the media state the layers
 * read and write, and animation frames run only when a test asks for one. Pixels and real
 * decoding stay with the Playwright specs; these fakes pin the decisions in between.
 */

export interface FakeDraw {
  readonly source: unknown;
  readonly alpha: number;
  readonly smooth: boolean;
  readonly rect: readonly number[];
}

export class FakeContext2D {
  readonly draws: FakeDraw[] = [];
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "low";
  setTransform(): void {}
  drawImage(source: unknown, ...rect: number[]): void {
    this.draws.push({ source, alpha: this.globalAlpha, smooth: this.imageSmoothingEnabled, rect });
  }
}

type Listener = () => void;

export class FakeElement {
  readonly dataset: Record<string, string | undefined> = {};
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<Listener>>();
  className = "";
  hidden = false;
  removed = false;
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "src" && this instanceof FakeVideo) this.src = "";
  }
  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
  remove(): void {
    this.removed = true;
  }
}

export class FakeCanvas extends FakeElement {
  width = 300;
  height = 150;
  /** CSS pixels the canvas occupies on screen. */
  displayWidth = 640;
  readonly context = new FakeContext2D();
  getContext(kind: string): FakeContext2D | null {
    return kind === "2d" ? this.context : null;
  }
  getBoundingClientRect(): { width: number; height: number } {
    return { width: this.displayWidth, height: this.displayWidth * 350 / 640 };
  }
}

export class FakeVideo extends FakeElement {
  muted = false;
  loop = false;
  playsInline = false;
  preload = "";
  readyState = 0;
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  src = "";
  plays = 0;
  loads = 0;
  seeks: number[] = [];
  play(): Promise<void> {
    this.paused = false;
    this.plays += 1;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {
    this.loads += 1;
  }
  /** Writes through `currentTime` that a test wants to tell apart from playback. */
  seekTo(time: number): void {
    this.currentTime = time;
  }
}

export class FakeHost {
  readonly children: FakeElement[] = [];
  prepend(...elements: FakeElement[]): void {
    this.children.unshift(...elements);
  }
  append(...elements: FakeElement[]): void {
    this.children.push(...elements);
  }
}

export function installFakeMediaDom(options: { devicePixelRatio?: number } = {}) {
  const canvases: FakeCanvas[] = [];
  const videos: FakeVideo[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  vi.stubGlobal("document", {
    createElement(tag: string) {
      if (tag === "canvas") {
        const canvas = new FakeCanvas();
        canvases.push(canvas);
        return canvas;
      }
      if (tag === "video") {
        const video = new FakeVideo();
        // Record seeks the layer makes, while playback-driven time changes go through `seekTo`.
        let time = 0;
        Object.defineProperty(video, "currentTime", {
          get: () => time,
          set: (value: number) => {
            time = value;
            video.seeks.push(value);
          },
        });
        video.seekTo = (value: number) => {
          time = value;
        };
        videos.push(video);
        return video;
      }
      throw new Error(`fake DOM cannot create <${tag}>`);
    },
  });
  vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
  vi.stubGlobal("window", {
    devicePixelRatio: options.devicePixelRatio ?? 1,
    // Delegate at call time so `vi.useFakeTimers()` applies to the layers' timeouts.
    setTimeout: (handler: () => void, ms?: number) => globalThis.setTimeout(handler, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  return {
    canvases,
    videos,
    pendingFrames: () => frames.size,
    /** Runs the callbacks requested so far (a callback may request the next frame). */
    runFrame(): void {
      const due = [...frames.entries()];
      frames.clear();
      for (const [, callback] of due) callback(0);
    },
  };
}
