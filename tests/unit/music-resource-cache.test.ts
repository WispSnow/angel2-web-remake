import { describe, expect, test } from "vitest";
import {
  isMusicResourceUrl,
  loadEncodedMusic,
  primeEncodedMusic,
  releaseEncodedMusic,
} from "../../src/game/music-resource-cache";

describe("staged encoded music cache", () => {
  test("recognizes only packaged OGG music", () => {
    expect(isMusicResourceUrl("/assets/original/music/MUSIC/0016.ogg")).toBe(true);
    expect(isMusicResourceUrl("/assets/original/audio/e-11.wav")).toBe(false);
    expect(isMusicResourceUrl("/assets/original/music/MUSIC/0016.wav")).toBe(false);
  });

  test("hands staged bytes to the music transport without another request", async () => {
    const url = "/assets/original/music/MUSIC/0099.ogg";
    const encoded = Uint8Array.from([1, 3, 5, 7]).buffer;
    primeEncodedMusic(url, encoded);
    let requests = 0;
    const loaded = loadEncodedMusic(url, async () => {
      requests += 1;
      throw new Error("staged music must not fetch again");
    });
    expect([...new Uint8Array(await loaded)]).toEqual([1, 3, 5, 7]);
    expect(requests).toBe(0);
    releaseEncodedMusic(url, loaded);
  });
});
