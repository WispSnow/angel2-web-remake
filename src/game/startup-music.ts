import { STARTUP_ASSETS } from "./content/startup";
import { loadEncodedMusic, releaseEncodedMusic } from "./music-resource-cache";

export interface PreparedStartupMusic {
  readonly contextState: AudioContextState;
  readonly introPlaying: boolean;
  readonly titlePlaying: boolean;
  unlock(): Promise<void>;
  playIntro(): void;
  stopIntro(): void;
  playTitle(onEnded: () => void): void;
  stopTitle(): void;
  dispose(): void;
}

const STARTUP_GAIN = 0.32;

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
export async function prepareStartupMusic(): Promise<PreparedStartupMusic> {
  const context = new AudioContext({ latencyHint: "playback" });
  try {
    const [intro, title] = await Promise.all([
      decodeCachedMusic(context, STARTUP_ASSETS.audio.intro),
      decodeCachedMusic(context, STARTUP_ASSETS.audio.title),
    ]);
    const output = context.createGain();
    output.gain.setValueAtTime(STARTUP_GAIN, context.currentTime);
    output.connect(context.destination);
    let introSource: AudioBufferSourceNode | undefined;
    let titleSource: AudioBufferSourceNode | undefined;
    let disposed = false;

    const stop = (source: AudioBufferSourceNode | undefined) => {
      if (!source) return;
      source.onended = null;
      try {
        source.stop();
      } catch {
        // A naturally ended one-shot has already stopped itself.
      }
      source.disconnect();
    };
    const start = (buffer: AudioBuffer): AudioBufferSourceNode => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      source.start();
      return source;
    };

    return {
      get contextState() { return context.state; },
      get introPlaying() { return introSource !== undefined; },
      get titlePlaying() { return titleSource !== undefined; },
      unlock: async () => {
        if (disposed) throw new Error("開場音樂已經關閉。");
        await context.resume();
        if (context.state !== "running") throw new Error("瀏覽器未允許播放開場音樂。");
      },
      playIntro: () => {
        if (disposed) return;
        stop(introSource);
        const source = start(intro);
        introSource = source;
        source.onended = () => {
          if (introSource === source) introSource = undefined;
          source.disconnect();
        };
      },
      stopIntro: () => {
        stop(introSource);
        introSource = undefined;
      },
      playTitle: (onEnded) => {
        if (disposed) return;
        stop(titleSource);
        const source = start(title);
        titleSource = source;
        source.onended = () => {
          if (titleSource !== source) return;
          titleSource = undefined;
          source.disconnect();
          onEnded();
        };
      },
      stopTitle: () => {
        stop(titleSource);
        titleSource = undefined;
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        stop(introSource);
        stop(titleSource);
        introSource = undefined;
        titleSource = undefined;
        output.disconnect();
        void context.close();
      },
    };
  } catch (error) {
    void context.close();
    throw error;
  }
}
