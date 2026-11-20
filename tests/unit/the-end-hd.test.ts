import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/game/staged-render-asset-cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/game/staged-render-asset-cache")>(),
  stagedRenderAssetSource: (url: string) => `blob:${url}`,
}));
const clock = vi.hoisted(() => ({ now: 0, paused: false }));
vi.mock("../../src/game/program-clock", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/game/program-clock")>(),
  isProgramPaused: () => clock.paused,
  programNow: () => clock.now,
}));
const failures = vi.hoisted(() => ({ reasons: [] as string[] }));
vi.mock("../../src/game/story-hd-style", () => ({
  markTheEndHdFailed: (reason: string) => failures.reasons.push(reason),
}));

import { STORY_HD_THE_END, type StoryHdTheEnd } from "../../src/game/content/story-hd";
import { TheEndHdPlayer, loopPhaseDistance } from "../../src/game/the-end-hd";
import { FakeHost, installFakeMediaDom, type FakeVideo } from "./fake-media-dom";

if (!STORY_HD_THE_END) throw new Error("the HD The end is not generated");
const theEnd: StoryHdTheEnd = STORY_HD_THE_END;
const period = theEnd.video.frames / theEnd.video.fps;

let dom: ReturnType<typeof installFakeMediaDom>;
let host: FakeHost;

const build = () => {
  const player = new TheEndHdPlayer(host as unknown as HTMLElement, theEnd, { x: 160, y: 27 });
  const video = dom.videos.at(-1);
  if (!video) throw new Error("the player created no video");
  return { player, video: video as FakeVideo };
};

beforeEach(() => {
  dom = installFakeMediaDom();
  host = new FakeHost();
  clock.now = 0;
  clock.paused = false;
  failures.reasons = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("REMAKE-201 HD The end player", () => {
  it("measures loop phase the short way round the seam", () => {
    expect(loopPhaseDistance(0.1, 7.6, 7.75)).toBeCloseTo(0.25);
    expect(loopPhaseDistance(3, 4, 7.75)).toBeCloseTo(1);
  });

  it("lays a muted looping video over the picture in frame 0, from the gate's bytes", () => {
    const { player, video } = build();
    expect(host.children).toEqual([video]);
    expect(player.video).toBe(video);
    expect(video.src).toBe(`blob:${theEnd.video.source}`);
    expect(video.dataset.sourceUrl).toBe(theEnd.video.source);
    expect(video.muted && video.loop && video.playsInline).toBe(true);
    expect(video.style).toMatchObject({
      left: `${160 + theEnd.picture.x}px`,
      top: `${27 + theEnd.picture.y}px`,
      width: `${theEnd.picture.width}px`,
      height: `${theEnd.picture.height}px`,
    });
  });

  it("is ready at once when a frame is decoded, or when loadeddata arrives", async () => {
    const first = build();
    first.video.readyState = 2;
    await expect(first.player.ready()).resolves.toBe(true);

    const second = build();
    const waiting = second.player.ready();
    second.video.dispatch("loadeddata");
    await expect(waiting).resolves.toBe(true);
    expect(second.video.listenerCount("loadeddata")).toBe(0);
    expect(second.video.listenerCount("error")).toBe(0);
    expect(failures.reasons).toEqual([]);
  });

  it("removes itself and records the failure on an error or a missing first frame", async () => {
    const broken = build();
    const failing = broken.player.ready();
    broken.video.dispatch("error");
    await expect(failing).resolves.toBe(false);
    expect(broken.video.removed).toBe(true);

    vi.useFakeTimers();
    const stalled = build();
    const waiting = stalled.player.ready();
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(waiting).resolves.toBe(false);
    expect(stalled.video.removed).toBe(true);
    expect(failures.reasons).toEqual(["video failed to load", "no first frame in time"]);
  });

  it("follows program time round the loop and seeks only when it drifts", () => {
    const { player, video } = build();
    player.start(1_000);
    player.start(1_000);
    expect(dom.pendingFrames()).toBe(1);
    clock.now = 3_000;
    dom.runFrame();
    expect(video.seeks).toEqual([2]);
    expect(video.paused).toBe(false);
    // playback kept up: no seek
    video.seekTo(2.9);
    clock.now = 4_000;
    dom.runFrame();
    expect(video.seeks).toEqual([2]);
    // one and a half loops later the phase wraps
    clock.now = 1_000 + (period * 1.5) * 1_000;
    dom.runFrame();
    expect(video.seeks.at(-1)).toBeCloseTo(period / 2);
    // the decoded duration wins over the frame count once known
    video.duration = 5;
    clock.now = 1_000 + 6_000;
    dom.runFrame();
    expect(video.seeks.at(-1)).toBeCloseTo(1);
    expect(dom.pendingFrames()).toBe(1);
  });

  it("pauses with the program", () => {
    const { player, video } = build();
    player.start(0);
    clock.now = 1_000;
    dom.runFrame();
    expect(video.paused).toBe(false);
    clock.paused = true;
    dom.runFrame();
    expect(video.paused).toBe(true);
  });

  it("stops its frame loop and releases the video on dispose", () => {
    const { player, video } = build();
    player.start(0);
    player.dispose();
    player.dispose();
    expect(dom.pendingFrames()).toBe(0);
    expect(video.removed).toBe(true);
    expect(video.src).toBe("");
    expect(video.loads).toBe(1);
    player.start(0);
    expect(dom.pendingFrames()).toBe(0);
  });
});
