import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lease = vi.hoisted(() => ({ missing: new Set<string>() }));
vi.mock("../../src/game/staged-render-asset-cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/game/staged-render-asset-cache")>(),
  stagedRenderAssetAvailable: (url: string) => !lease.missing.has(url),
  stagedRenderAssetSource: (url: string) => `blob:${url}`,
}));
const clock = vi.hoisted(() => ({ paused: false }));
vi.mock("../../src/game/program-clock", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/game/program-clock")>(),
  isProgramPaused: () => clock.paused,
}));

import { STORY_HD_INTRO, type StoryHdIntro } from "../../src/game/content/story-hd";
import { IntroHdLayer } from "../../src/game/intro-hd";
import { FakeHost, installFakeMediaDom, type FakeCanvas, type FakeVideo } from "./fake-media-dom";

const UPDATE_MS = 120;
if (!STORY_HD_INTRO) throw new Error("the HD intro is not generated");
const intro: StoryHdIntro = STORY_HD_INTRO;
const base = { kind: "native intro canvas" } as unknown as HTMLCanvasElement;
const plates = new Map(intro.scenes.map((scene) => [scene.original, { plate: scene.original }]));
/** Crawl position (in scroll updates) at a time in milliseconds. */
const at = (ms: number) => ms / UPDATE_MS;
/** Native time at which scene `index` (≥ 1) is fully faded in. */
const switched = (index: number) => intro.scenes[index].cue * UPDATE_MS + intro.crossfadeMs / 2;
/** Seek targets rounded to the millisecond (crawl positions are fractional update counts). */
const seeks = (video: FakeVideo) => video.seeks.map((time) => Math.round(time * 1000) / 1000);

let dom: ReturnType<typeof installFakeMediaDom>;
let host: FakeHost;

const build = (original: (source: string) => unknown = (source) => plates.get(source)) => {
  const layer = new IntroHdLayer(
    host as unknown as HTMLElement,
    intro,
    original as (source: string) => HTMLImageElement | undefined,
    UPDATE_MS,
  );
  return { layer, canvas: dom.canvases[0] as FakeCanvas, videos: dom.videos as FakeVideo[] };
};

/** Marks a clip decodable and prepares it, the way `StartupHd` does after its download. */
const prepare = async (layer: IntroHdLayer, video: FakeVideo, index: number) => {
  video.readyState = 2;
  return layer.prepareScene(index);
};

beforeEach(() => {
  dom = installFakeMediaDom();
  host = new FakeHost();
  lease.missing.clear();
  clock.paused = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("REMAKE-198 HD intro layer", () => {
  it("stacks a hidden canvas over one muted, inline video per scene", () => {
    const { layer, canvas, videos } = build();
    expect(videos).toHaveLength(intro.scenes.length);
    expect(host.children[0]).toBe(canvas);
    expect(host.children.slice(1)).toEqual(videos);
    expect(canvas.hidden).toBe(true);
    expect(canvas.dataset.testid).toBe("intro-hd-canvas");
    expect(videos.every((video) => video.muted && video.playsInline && video.preload === "auto")).toBe(true);
    expect(layer.isReady).toBe(false);
    expect(layer.preparedScenes).toBe(0);
  });

  it("is ready once the first clip has a frame, and counts each prepared clip", async () => {
    const { layer, videos } = build();
    await expect(prepare(layer, videos[1], 1)).resolves.toBe(true);
    expect(layer.isReady).toBe(false);
    await expect(prepare(layer, videos[0], 0)).resolves.toBe(true);
    expect(videos[0].src).toBe(`blob:${intro.scenes[0].video.source}`);
    expect(layer.isReady).toBe(true);
    expect(layer.preparedScenes).toBe(2);
    await expect(layer.prepareScene(intro.scenes.length)).resolves.toBe(false);
  });

  it("waits for loadeddata, and falls a clip back on an error, a timeout or a missing lease", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { layer, videos } = build();
    const loading = layer.prepareScene(0);
    videos[0].dispatch("loadeddata");
    await expect(loading).resolves.toBe(true);

    const failing = layer.prepareScene(1);
    videos[1].dispatch("error");
    await expect(failing).resolves.toBe(false);

    vi.useFakeTimers();
    const stalled = layer.prepareScene(2);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(stalled).resolves.toBe(false);

    lease.missing.add(intro.scenes[3].video.source);
    await expect(layer.prepareScene(3)).resolves.toBe(false);
    expect(videos[3].src).toBe("");
    expect(layer.preparedScenes).toBe(1);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("draws the native canvas, then the first clip over the plate rectangle", async () => {
    const { layer, canvas, videos } = build();
    await prepare(layer, videos[0], 0);
    layer.paint(base, at(1_200));
    expect(canvas.context.draws).toHaveLength(0);
    layer.show(true);
    layer.paint(base, at(1_200));
    const [native, clip] = canvas.context.draws;
    expect(native).toMatchObject({ source: base, smooth: false, rect: [0, 0, 640, 350] });
    const { plate } = intro;
    expect(clip).toMatchObject({ source: videos[0], alpha: 1, smooth: true, rect: [plate.x, plate.y, plate.width, plate.height] });
    expect(canvas.dataset.scene).toBe("0");
    expect(canvas.dataset.sceneSource).toBe("video");
    // the clip runs at the native crawl speed: 1.2 s into the crawl is 1.2 s into the clip
    expect(videos[0].currentTime).toBeCloseTo(1.2);
    expect(videos[0].paused).toBe(false);
  });

  it("crossfades into the next scene around its cue and parks the clip that left", async () => {
    const { layer, canvas, videos } = build();
    await prepare(layer, videos[0], 0);
    await prepare(layer, videos[1], 1);
    layer.show(true);
    layer.paint(base, at(1_000));
    const midpoint = intro.scenes[1].cue * UPDATE_MS;
    canvas.context.draws.length = 0;
    layer.paint(base, at(midpoint));
    expect(canvas.context.draws.map(({ source, alpha }) => [source, alpha])).toEqual([
      [base, 1],
      [videos[0], 1],
      [videos[1], 0.5],
    ]);
    expect(canvas.dataset.scene).toBe("1");
    // clip 1 starts half a crossfade before the cue
    expect(videos[1].currentTime).toBeCloseTo(intro.crossfadeMs / 2 / 1000);

    layer.paint(base, at(switched(1) + 1));
    expect(videos[0].paused).toBe(true);
    expect(videos[0].currentTime).toBe(0);
    expect(canvas.dataset.scene).toBe("1");
  });

  it("draws the original plate, pixel-sharp, for a scene whose clip is not ready", async () => {
    const { layer, canvas, videos } = build();
    await prepare(layer, videos[0], 0);
    layer.show(true);
    layer.paint(base, at(switched(1) + 100));
    const last = canvas.context.draws.at(-1);
    expect(last).toMatchObject({ source: plates.get(intro.scenes[1].original), smooth: false });
    expect(canvas.dataset.sceneSource).toBe("original");
  });

  it("skips a scene with neither a clip nor a decoded original", async () => {
    const { layer, canvas, videos } = build(() => undefined);
    await prepare(layer, videos[0], 0);
    layer.show(true);
    layer.paint(base, at(switched(1) + 100));
    expect(canvas.context.draws).toHaveLength(1);
    expect(canvas.dataset.scene).toBe("-1");
    expect(canvas.dataset.sceneSource).toBe("");
  });

  it("pauses with the program and only seeks when the clip drifts", async () => {
    const { layer, videos } = build();
    await prepare(layer, videos[0], 0);
    layer.show(true);
    layer.paint(base, at(2_000));
    expect(seeks(videos[0])).toEqual([2]);
    // playback moved the clip along: close enough, no seek
    videos[0].seekTo(2.1);
    layer.paint(base, at(2_200));
    expect(seeks(videos[0])).toEqual([2]);
    clock.paused = true;
    layer.paint(base, at(2_200));
    expect(videos[0].paused).toBe(true);
    clock.paused = false;
    layer.paint(base, at(5_000));
    expect(seeks(videos[0])).toEqual([2, 5]);
    expect(videos[0].paused).toBe(false);
  });

  it("holds the last frame once the crawl outruns a finished clip", async () => {
    const { layer, videos } = build();
    await prepare(layer, videos[0], 0);
    videos[0].duration = 4;
    layer.show(true);
    layer.paint(base, at(6_000));
    expect(seeks(videos[0])).toEqual([4]);
    expect(videos[0].plays).toBe(0);
  });

  it("sizes its backing store to the screen pixels it covers, up to 4K", async () => {
    dom = installFakeMediaDom({ devicePixelRatio: 2 });
    const { layer, canvas, videos } = build();
    await prepare(layer, videos[0], 0);
    canvas.displayWidth = 960;
    layer.show(true);
    layer.paint(base, at(1_000));
    expect([canvas.width, canvas.height]).toEqual([1920, 1050]);
    expect(canvas.context.draws.at(-1)?.rect).toEqual([24 * 3, 0, 608 * 3, 257 * 3]);
    canvas.displayWidth = 4000;
    layer.paint(base, at(1_100));
    expect(canvas.width).toBe(3840);
  });

  it("parks every clip when hidden and releases them on dispose", async () => {
    const { layer, canvas, videos } = build();
    await prepare(layer, videos[0], 0);
    layer.show(true);
    layer.paint(base, at(1_000));
    layer.show(false);
    expect(canvas.hidden).toBe(true);
    expect(videos[0].paused).toBe(true);
    expect(videos[0].currentTime).toBe(0);

    layer.dispose();
    layer.dispose();
    expect(canvas.removed).toBe(true);
    expect(videos.every((video) => video.removed && video.src === "" && video.loads === 1)).toBe(true);
    expect(layer.isReady).toBe(false);
    await expect(layer.prepareScene(1)).resolves.toBe(false);
    canvas.context.draws.length = 0;
    layer.paint(base, at(1_000));
    expect(canvas.context.draws).toHaveLength(0);
  });
});
