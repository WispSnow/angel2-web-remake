import { STARTUP_ASSETS } from "./content/startup";
import {
  ORCHESTRAL_TRANSITION_FADE_SECONDS,
  startupRemixUrls,
} from "./content/music-remix";
import { loadEncodedMusic, releaseEncodedMusic } from "./music-resource-cache";
import type { MusicStyle } from "./preferences";

export interface PreparedStartupMusic {
  readonly contextState: AudioContextState;
  readonly introPlaying: boolean;
  readonly titlePlaying: boolean;
  readonly source: "original" | "remix";
  unlock(): Promise<void>;
  /** Starts fetching and decoding the two remixes without waiting for them. */
  prepareRemix(): void;
  /** Never rejects: a remix that cannot be readied leaves the originals in place. */
  selectStyle(style: MusicStyle): Promise<void>;
  playIntro(): void;
  stopIntro(): void;
  playTitle(onEnded: () => void): void;
  stopTitle(): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

/** Delivers the listed files through the resource gate so `loadEncodedMusic` can reuse them. */
export type FetchStartupRemixes = (urls: readonly string[]) => Promise<void>;

interface StartupTracks {
  readonly source: PreparedStartupMusic["source"];
  readonly intro: AudioBuffer;
  readonly title: AudioBuffer;
  readonly fadeSeconds: number;
}

interface PlayingTrack {
  readonly source: AudioBufferSourceNode;
  readonly level: GainNode;
}

const STARTUP_GAIN = 0.32;
/**
 * `REMAKE-186`: the remixes are an option and the originals are already decoded,
 * so a stalled download gives way instead of holding the first screen. The fetch
 * keeps running and the stage gates still honour the chosen style.
 */
export const STARTUP_REMIX_WAIT_MS = 20_000;

const decodeCachedMusic = async (
  context: AudioContext,
  url: string,
): Promise<AudioBuffer> => {
  const encodedRequest = loadEncodedMusic(url);
  try {
    const encoded = await encodedRequest;
    return await context.decodeAudioData(encoded.slice(0));
  } finally {
    // The decoded buffers below own startup playback. Do not retain a second
    // encoded in-memory copy after the boot gate has completed.
    releaseEncodedMusic(url, encodedRequest);
  }
};

/**
 * Decodes both native startup tracks while the boot loading surface is still
 * visible. The AudioContext stays suspended until the player's explicit entry
 * gesture; once resumed, later native-timeline starts are not subject to the
 * browser's autoplay rejection.
 */
export async function prepareStartupMusic(
  fetchRemixes: FetchStartupRemixes,
): Promise<PreparedStartupMusic> {
  const context = new AudioContext({ latencyHint: "playback" });
  try {
    const [intro, title] = await Promise.all([
      decodeCachedMusic(context, STARTUP_ASSETS.audio.intro),
      decodeCachedMusic(context, STARTUP_ASSETS.audio.title),
    ]);
    const originals: StartupTracks = { source: "original", intro, title, fadeSeconds: 0 };
    const output = context.createGain();
    output.gain.setValueAtTime(STARTUP_GAIN, context.currentTime);
    output.connect(context.destination);
    let tracks = originals;
    let remixRequest: Promise<StartupTracks | undefined> | undefined;
    let introTrack: PlayingTrack | undefined;
    let titleTrack: PlayingTrack | undefined;
    let fadesEndAt = 0;
    let disposed = false;
    let paused = false;
    let unlocked = false;

    const release = ({ source, level }: PlayingTrack) => {
      source.disconnect();
      level.disconnect();
    };
    const stop = (track: PlayingTrack | undefined, fadeSeconds: number) => {
      if (!track) return;
      const { source, level } = track;
      source.onended = null;
      const stopAt = fadeSeconds > 0 ? context.currentTime + fadeSeconds : 0;
      if (stopAt > 0) {
        level.gain.setValueAtTime(1, context.currentTime);
        level.gain.linearRampToValueAtTime(0, stopAt);
        source.onended = () => release(track);
        fadesEndAt = Math.max(fadesEndAt, stopAt);
      }
      try {
        source.stop(stopAt);
      } catch {
        // A naturally ended one-shot has already stopped itself.
      }
      if (stopAt === 0) release(track);
    };
    const start = (buffer: AudioBuffer): PlayingTrack => {
      const source = context.createBufferSource();
      const level = context.createGain();
      source.buffer = buffer;
      source.connect(level);
      level.connect(output);
      source.start();
      return { source, level };
    };
    const loadRemix = (): Promise<StartupTracks | undefined> => {
      remixRequest ??= (async () => {
        const urls = startupRemixUrls();
        try {
          await fetchRemixes([urls.intro, urls.title]);
          const [remixIntro, remixTitle] = await Promise.all([
            decodeCachedMusic(context, urls.intro),
            decodeCachedMusic(context, urls.title),
          ]);
          return {
            source: "remix",
            intro: remixIntro,
            title: remixTitle,
            fadeSeconds: ORCHESTRAL_TRANSITION_FADE_SECONDS,
          } satisfies StartupTracks;
        } catch (error) {
          // Forget the failure so choosing 交響 again can retry.
          remixRequest = undefined;
          console.warn("orchestral startup music is unavailable", error);
          return undefined;
        }
      })();
      return remixRequest;
    };

    return {
      get contextState() { return context.state; },
      get introPlaying() { return introTrack !== undefined; },
      get titlePlaying() { return titleTrack !== undefined; },
      get source() { return tracks.source; },
      unlock: async () => {
        if (disposed) throw new Error("開場音樂已經關閉。");
        unlocked = true;
        await context.resume();
        if (paused) await context.suspend();
        if (paused) return;
        if (context.state !== "running") throw new Error("瀏覽器未允許播放開場音樂。");
      },
      prepareRemix: () => {
        void loadRemix();
      },
      selectStyle: async (style) => {
        tracks = originals;
        if (style !== "orchestral") return;
        const remix = await new Promise<StartupTracks | undefined>((resolve) => {
          const giveUp = setTimeout(() => resolve(undefined), STARTUP_REMIX_WAIT_MS);
          void loadRemix().then((loaded) => {
            clearTimeout(giveUp);
            resolve(loaded);
          });
        });
        if (remix) tracks = remix;
      },
      playIntro: () => {
        if (disposed) return;
        stop(introTrack, 0);
        const track = start(tracks.intro);
        introTrack = track;
        track.source.onended = () => {
          if (introTrack === track) introTrack = undefined;
          release(track);
        };
      },
      stopIntro: () => {
        stop(introTrack, tracks.fadeSeconds);
        introTrack = undefined;
      },
      playTitle: (onEnded) => {
        if (disposed) return;
        stop(titleTrack, 0);
        const track = start(tracks.title);
        titleTrack = track;
        track.source.onended = () => {
          if (titleTrack !== track) return;
          titleTrack = undefined;
          release(track);
          onEnded();
        };
      },
      stopTitle: () => {
        stop(titleTrack, tracks.fadeSeconds);
        titleTrack = undefined;
      },
      setPaused: (nextPaused) => {
        paused = nextPaused;
        if (disposed) return;
        if (paused) void context.suspend();
        else if (unlocked) void context.resume();
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        stop(introTrack, tracks.fadeSeconds);
        stop(titleTrack, tracks.fadeSeconds);
        introTrack = undefined;
        titleTrack = undefined;
        // Closing the context would cut a fade that is still running.
        const close = () => {
          output.disconnect();
          void context.close();
        };
        const remainingSeconds = fadesEndAt - context.currentTime;
        if (remainingSeconds > 0) setTimeout(close, remainingSeconds * 1000);
        else close();
      },
    };
  } catch (error) {
    void context.close();
    throw error;
  }
}
