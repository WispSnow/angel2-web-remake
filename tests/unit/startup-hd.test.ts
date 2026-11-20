import { beforeEach, describe, expect, it, vi } from "vitest";

// The canvas/video layers are drawn and checked by `story-hd.spec.ts`; here they are stand-ins
// so the tests can pin what `StartupHd` decides: download order, readiness flags and when a
// run is drawn in HD.
const fakes = vi.hoisted(() => {
  class FakeIntroLayer {
    static instances: FakeIntroLayer[] = [];
    static sceneReady: (index: number) => boolean = () => true;
    readonly prepared: number[] = [];
    readonly shown: boolean[] = [];
    readonly paints: number[] = [];
    readonly ready: boolean[] = [];
    disposed = false;
    constructor(
      readonly host: unknown,
      readonly spec: unknown,
      readonly image: unknown,
      readonly updateMs: number,
    ) {
      FakeIntroLayer.instances.push(this);
    }
    get isReady(): boolean {
      return this.ready[0] === true && !this.disposed;
    }
    get preparedScenes(): number {
      return this.ready.filter(Boolean).length;
    }
    async prepareScene(index: number): Promise<boolean> {
      this.prepared.push(index);
      this.ready[index] = FakeIntroLayer.sceneReady(index);
      return this.ready[index];
    }
    show(visible: boolean): void {
      this.shown.push(visible);
    }
    paint(_base: unknown, position: number): void {
      this.paints.push(position);
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  class FakeTitleLayer {
    static instances: FakeTitleLayer[] = [];
    static prepares = true;
    readonly shown: boolean[] = [];
    readonly paints: number[][] = [];
    ready = false;
    disposed = false;
    constructor(readonly host: unknown, readonly spec: unknown, readonly background: () => unknown) {
      FakeTitleLayer.instances.push(this);
    }
    get isReady(): boolean {
      return this.ready && !this.disposed;
    }
    async prepare(): Promise<boolean> {
      this.ready = FakeTitleLayer.prepares;
      return this.ready;
    }
    show(visible: boolean): void {
      this.shown.push(visible);
    }
    paint(_base: unknown, variant: number, upper: number, lower: number, now: number): void {
      this.paints.push([variant, upper, lower, now]);
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { FakeIntroLayer, FakeTitleLayer };
});
vi.mock("../../src/game/intro-hd", () => ({ IntroHdLayer: fakes.FakeIntroLayer }));
vi.mock("../../src/game/title-hd", () => ({ TitleHdLayer: fakes.FakeTitleLayer }));

import {
  STORY_HD_INTRO,
  STORY_HD_TITLE,
  storyHdIntroAssetUrls,
  storyHdTitleAssetUrls,
} from "../../src/game/content/story-hd";
import { StartupHd, type StartupHdOptions } from "../../src/game/startup-hd";

const { FakeIntroLayer, FakeTitleLayer } = fakes;
const introUrls = STORY_HD_INTRO ? storyHdIntroAssetUrls(STORY_HD_INTRO) : [];
const titleUrls = STORY_HD_TITLE ? storyHdTitleAssetUrls(STORY_HD_TITLE) : [];
const base = {} as HTMLCanvasElement;

const setup = (loader?: StartupHdOptions["loader"]) => {
  const screen = { dataset: {} as DOMStringMap } as HTMLElement;
  const hd = new StartupHd({
    screen,
    introHost: {} as HTMLElement,
    titleHost: {} as HTMLElement,
    loader,
    image: () => undefined,
    introUpdateMs: 120,
  });
  return { hd, data: screen.dataset };
};

beforeEach(() => {
  FakeIntroLayer.instances = [];
  FakeIntroLayer.sceneReady = () => true;
  FakeTitleLayer.instances = [];
  FakeTitleLayer.prepares = true;
});

describe("REMAKE-197/198 startup HD orchestration", () => {
  it("ships the seven intro clips and the title files it schedules", () => {
    expect(introUrls).toHaveLength(7);
    expect(titleUrls.length).toBeGreaterThan(0);
  });

  it("draws everything original when there is no resource loader", () => {
    const { hd, data } = setup();
    hd.request();
    hd.startIntro(true);
    hd.startTitle(true);
    expect(data.introStyle).toBe("original");
    expect(data.titleStyle).toBe("original");
    expect(FakeIntroLayer.instances).toHaveLength(0);
    expect(FakeTitleLayer.instances).toHaveLength(0);
  });

  it("downloads the intro clip by clip in playing order and the title in one batch", async () => {
    const loader = vi.fn(async (_urls: readonly string[]) => undefined);
    const { hd, data } = setup(loader);
    hd.request();
    hd.request();
    await vi.waitFor(() => expect(data.introHdScenes).toBe("7"));
    await vi.waitFor(() => expect(data.titleHdReady).toBe("true"));
    const batches = loader.mock.calls.map(([urls]) => urls);
    expect(batches.filter((urls) => urls.length === 1 && introUrls.includes(urls[0])).map(([url]) => url)).toEqual(introUrls);
    expect(batches.filter((urls) => urls.length > 1)).toEqual([titleUrls]);
    expect(batches).toHaveLength(introUrls.length + 1);
    // one layer for all seven clips, each decoded after its own download
    expect(FakeIntroLayer.instances).toHaveLength(1);
    expect(FakeIntroLayer.instances[0].prepared).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(FakeIntroLayer.instances[0].updateMs).toBe(120);
    expect(data.introHdReady).toBe("true");
  });

  it("decides each run afresh: HD only when chosen and ready, painting only while active", async () => {
    const { hd, data } = setup(async () => undefined);
    hd.request();
    await vi.waitFor(() => expect(data.titleHdReady).toBe("true"));
    await vi.waitFor(() => expect(data.introHdScenes).toBe("7"));
    const [intro] = FakeIntroLayer.instances;
    const [title] = FakeTitleLayer.instances;

    hd.startIntro(true);
    expect(data.introStyle).toBe("hd");
    hd.paintIntro(base, 12.5);
    hd.stopIntro();
    hd.paintIntro(base, 13);
    hd.startIntro(false);
    expect(data.introStyle).toBe("original");
    hd.paintIntro(base, 14);
    expect(intro.paints).toEqual([12.5]);
    expect(intro.shown).toEqual([true, false, false]);

    hd.startTitle(true);
    expect(data.titleStyle).toBe("hd");
    hd.paintTitle(base, 1, 2, 3, 400);
    hd.hideTitle();
    hd.paintTitle(base, 0, 0, 0, 500);
    expect(title.paints).toEqual([[1, 2, 3, 400]]);
    expect(title.shown).toEqual([true, false]);

    hd.dispose();
    hd.dispose();
    expect(intro.disposed).toBe(true);
    expect(title.disposed).toBe(true);
    hd.startIntro(true);
    expect(data.introStyle).toBe("original");
  });

  it("keeps the whole intro original and stops downloading when the first clip fails", async () => {
    FakeIntroLayer.sceneReady = (index) => index !== 0;
    const loader = vi.fn(async (_urls: readonly string[]) => undefined);
    const { hd, data } = setup(loader);
    hd.request();
    await vi.waitFor(() => expect(data.introHdReady).toBe("false"));
    await vi.waitFor(() => expect(data.titleHdReady).toBe("true"));
    expect(FakeIntroLayer.instances[0].prepared).toEqual([0]);
    expect(loader.mock.calls.filter(([urls]) => urls.length === 1)).toHaveLength(1);
    hd.startIntro(true);
    expect(data.introStyle).toBe("original");
  });

  it("lets a later clip that fails fall back on its own", async () => {
    FakeIntroLayer.sceneReady = (index) => index !== 3;
    const { hd, data } = setup(async () => undefined);
    hd.request();
    await vi.waitFor(() => expect(FakeIntroLayer.instances[0]?.prepared).toHaveLength(7));
    expect(data.introHdReady).toBe("true");
    expect(data.introHdScenes).toBe("6");
    hd.startIntro(true);
    expect(data.introStyle).toBe("hd");
  });

  it("reports a failed download as not ready and draws the original", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    FakeTitleLayer.prepares = false;
    const { hd, data } = setup(async () => {
      throw new Error("offline");
    });
    hd.request();
    await vi.waitFor(() => expect(data.introHdReady).toBe("false"));
    await vi.waitFor(() => expect(data.titleHdReady).toBe("false"));
    expect(warn).toHaveBeenCalledWith("HD intro download failed", expect.any(Error));
    expect(warn).toHaveBeenCalledWith("HD title download failed", expect.any(Error));
    hd.startTitle(true);
    expect(data.titleStyle).toBe("original");
    warn.mockRestore();
  });

  it("builds no layer when it is disposed while the first files download", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { hd } = setup(() => gate);
    hd.request();
    hd.dispose();
    release();
    await gate;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(FakeIntroLayer.instances).toHaveLength(0);
    expect(FakeTitleLayer.instances).toHaveLength(0);
  });
});
