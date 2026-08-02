import {
  buildIntroLoopMusicSchedule,
  buildLoopMusicSchedule,
} from "./music-schedule";

export type MusicPart = "entry" | "loop";

export interface LoopMusicProgram {
  id: string;
  kind: "loop";
  track: string;
  source: string;
  seamlessLoop: string;
}

export interface IntroLoopMusicProgram {
  id: string;
  kind: "intro-loop";
  entryTrack: string;
  loopTrack: string;
  entry: string;
  seamlessLoop: string;
  crossfadeSeconds: number;
}

export type MusicProgram = LoopMusicProgram | IntroLoopMusicProgram;

export interface MusicTransportState {
  track?: string;
  part: MusicPart;
  loop: boolean;
  playing: boolean;
  playRequestCount: number;
  seamlessLoop: boolean;
  crossfadeMilliseconds: number;
  boundaryDbfs?: number;
  error?: string;
}

interface ScheduledProgram {
  id: string;
  request: number;
  output: GainNode;
  sources: AudioBufferSourceNode[];
}

const SCHEDULE_LEAD_SECONDS = 0.01;
const PROGRAM_CROSSFADE_SECONDS = 0.005;
const VOLUME_RAMP_SECONDS = 0.015;
const DECODER_SEAM_CROSSFADE_SECONDS = 256 / 44_100;

const programUrls = (program: MusicProgram): string[] => program.kind === "loop"
  ? [program.source, program.seamlessLoop]
  : [program.entry, program.seamlessLoop];

export class MusicTransport {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private gain: number;
  private unlocked = false;
  private desired?: MusicProgram;
  private active?: ScheduledProgram;
  private requestSequence = 0;
  private schedulingRequest?: number;
  private readonly encoded = new Map<string, Promise<ArrayBuffer>>();
  private readonly decoded = new Map<string, Promise<AudioBuffer>>();
  private state: MusicTransportState = {
    part: "entry",
    loop: false,
    playing: false,
    playRequestCount: 0,
    seamlessLoop: false,
    crossfadeMilliseconds: 0,
  };

  constructor(
    initialGain: number,
    private readonly onStateChange: (state: MusicTransportState) => void,
  ) {
    this.gain = initialGain;
  }

  preload(programs: readonly MusicProgram[]): void {
    for (const program of programs) {
      for (const url of programUrls(program)) this.preloadUrl(url);
    }
  }

  select(program: MusicProgram | undefined, restart = false): void {
    if (!restart && program?.id === this.desired?.id) return;
    this.desired = program;
    const request = ++this.requestSequence;
    this.schedulingRequest = undefined;
    if (!program) {
      this.fadeOutActive();
      this.updateState({
        track: undefined,
        part: "entry",
        loop: false,
        playing: false,
        seamlessLoop: false,
        crossfadeMilliseconds: 0,
        boundaryDbfs: undefined,
        error: undefined,
      });
      return;
    }

    this.updateState({
      track: program.kind === "loop" ? program.track : program.entryTrack,
      part: "entry",
      loop: program.kind === "loop",
      playing: this.active !== undefined,
      seamlessLoop: false,
      crossfadeMilliseconds: 0,
      boundaryDbfs: undefined,
      error: undefined,
    });
    if (this.unlocked) void this.schedule(program, request);
  }

  unlock(): void {
    this.unlocked = true;
    const context = this.ensureContext();
    // resume() is invoked synchronously from the user gesture. Loading and
    // decoding may finish later without losing the browser activation grant.
    void context.resume().then(() => {
      const desired = this.desired;
      if (desired) void this.schedule(desired, this.requestSequence);
    }).catch((error: unknown) => {
      this.updateState({ playing: false, error: this.errorMessage(error) });
    });
  }

  setGain(gain: number): void {
    if (gain === this.gain) return;
    this.gain = gain;
    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain) {
      this.updateState({});
      return;
    }
    const now = context.currentTime;
    masterGain.gain.cancelAndHoldAtTime(now);
    masterGain.gain.linearRampToValueAtTime(gain, now + VOLUME_RAMP_SECONDS);
    this.updateState({});
  }

  private ensureContext(): AudioContext {
    if (this.context && this.masterGain) return this.context;
    const context = new AudioContext({ latencyHint: "playback" });
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(this.gain, context.currentTime);
    masterGain.connect(context.destination);
    this.context = context;
    this.masterGain = masterGain;
    return context;
  }

  private preloadUrl(url: string): Promise<ArrayBuffer> {
    const existing = this.encoded.get(url);
    if (existing) return existing;
    const request = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`music request failed (${response.status}): ${url}`);
      return response.arrayBuffer();
    });
    // Preloading is intentionally speculative. Keep its rejection observed;
    // schedule() will surface the same cached failure when the track is needed.
    void request.catch(() => undefined);
    this.encoded.set(url, request);
    return request;
  }

  private loadBuffer(url: string, periodic = false): Promise<AudioBuffer> {
    const cacheKey = `${periodic ? "periodic" : "raw"}:${url}`;
    const existing = this.decoded.get(cacheKey);
    if (existing) return existing;
    const context = this.ensureContext();
    const decoded = this.preloadUrl(url).then(async (encoded) => {
      const source = await context.decodeAudioData(encoded.slice(0));
      // The decoded AudioBuffer is the long-lived runtime copy. Releasing the
      // fetched PCM bytes avoids retaining both 16-bit and float representations.
      this.encoded.delete(url);
      return periodic ? this.createPeriodicBuffer(source) : source;
    });
    void decoded.catch(() => undefined);
    this.decoded.set(cacheKey, decoded);
    return decoded;
  }

  private async schedule(program: MusicProgram, request: number): Promise<void> {
    if (!this.unlocked || this.context?.state !== "running") return;
    if (this.active?.id === program.id && this.active.request === request) return;
    if (this.schedulingRequest === request) return;
    this.schedulingRequest = request;
    try {
      const buffers = program.kind === "loop"
        ? await Promise.all([
            this.loadBuffer(program.source),
            this.loadBuffer(program.seamlessLoop, true),
          ])
        : await Promise.all([
            this.loadBuffer(program.entry),
            this.loadBuffer(program.seamlessLoop, true),
          ]);
      if (request !== this.requestSequence || this.desired?.id !== program.id) return;
      const context = this.ensureContext();
      if (context.state !== "running") return;
      const startAt = context.currentTime + SCHEDULE_LEAD_SECONDS;
      const scheduled = program.kind === "loop"
        ? this.scheduleLoopProgram(program, buffers[0], buffers[1], startAt, request)
        : this.scheduleIntroLoopProgram(program, buffers[0], buffers[1], startAt, request);
      const previous = this.active;
      this.active = scheduled;
      if (previous) this.fadeOut(previous, startAt);
      this.state.playRequestCount += 1;
      this.updateState({
        playing: true,
        seamlessLoop: true,
        error: undefined,
      });
    }
    catch (error: unknown) {
      if (request !== this.requestSequence) return;
      this.fadeOutActive();
      this.updateState({ playing: false, error: this.errorMessage(error) });
    }
    finally {
      if (this.schedulingRequest === request) this.schedulingRequest = undefined;
    }
  }

  private scheduleLoopProgram(
    program: LoopMusicProgram,
    original: AudioBuffer,
    seamless: AudioBuffer,
    startAt: number,
    request: number,
  ): ScheduledProgram {
    const context = this.ensureContext();
    const schedule = buildLoopMusicSchedule(original, seamless, startAt);
    const output = this.createProgramOutput(startAt);
    const firstPassGain = context.createGain();
    const loopGain = context.createGain();
    firstPassGain.connect(output);
    loopGain.connect(output);
    firstPassGain.gain.setValueAtTime(1, startAt);
    firstPassGain.gain.setValueAtTime(1, schedule.seamlessStartAt);
    firstPassGain.gain.linearRampToValueAtTime(
      0,
      schedule.seamlessStartAt + schedule.crossfadeSeconds,
    );
    loopGain.gain.setValueAtTime(0, schedule.seamlessStartAt);
    loopGain.gain.linearRampToValueAtTime(
      1,
      schedule.seamlessStartAt + schedule.crossfadeSeconds,
    );
    const firstPass = this.createSource(original, firstPassGain);
    const loop = this.createSource(seamless, loopGain);
    loop.loop = true;
    firstPass.start(startAt);
    loop.start(schedule.seamlessStartAt);
    this.updateState({
      track: program.track,
      part: "loop",
      loop: true,
      seamlessLoop: true,
      crossfadeMilliseconds: schedule.crossfadeSeconds * 1000,
      boundaryDbfs: this.boundaryDbfs(seamless),
    });
    // Keep the request in the closure so a stopped, obsolete source cannot
    // mutate state if the browser dispatches its ended event asynchronously.
    firstPass.addEventListener("ended", () => {
      if (request !== this.requestSequence || this.desired?.id !== program.id) return;
      this.updateState({ playing: context.state === "running" });
    }, { once: true });
    return { id: program.id, request, output, sources: [firstPass, loop] };
  }

  private scheduleIntroLoopProgram(
    program: IntroLoopMusicProgram,
    entry: AudioBuffer,
    seamlessLoop: AudioBuffer,
    startAt: number,
    request: number,
  ): ScheduledProgram {
    const schedule = buildIntroLoopMusicSchedule(
      entry,
      seamlessLoop,
      program.crossfadeSeconds,
      startAt,
    );
    const output = this.createProgramOutput(startAt);
    const entryGain = this.ensureContext().createGain();
    const firstLoopGain = this.ensureContext().createGain();
    entryGain.connect(output);
    firstLoopGain.connect(output);
    entryGain.gain.setValueAtTime(1, startAt);
    entryGain.gain.setValueAtTime(1, schedule.firstLoopStartAt);
    entryGain.gain.linearRampToValueAtTime(0, schedule.entryEndAt);
    firstLoopGain.gain.setValueAtTime(0, schedule.firstLoopStartAt);
    firstLoopGain.gain.linearRampToValueAtTime(1, schedule.entryEndAt);

    const entrySource = this.createSource(entry, entryGain);
    const loop = this.createSource(seamlessLoop, firstLoopGain);
    loop.loop = true;
    entrySource.start(startAt);
    loop.start(schedule.seamlessStartAt);
    entrySource.addEventListener("ended", () => {
      if (request !== this.requestSequence || this.desired?.id !== program.id) return;
      this.updateState({
        track: program.loopTrack,
        part: "loop",
        loop: true,
        playing: true,
      });
    }, { once: true });
    this.updateState({
      track: program.entryTrack,
      part: "entry",
      loop: false,
      seamlessLoop: true,
      crossfadeMilliseconds: schedule.crossfadeSeconds * 1000,
      boundaryDbfs: this.boundaryDbfs(seamlessLoop),
    });
    return { id: program.id, request, output, sources: [entrySource, loop] };
  }

  private createSource(buffer: AudioBuffer, destination: AudioNode): AudioBufferSourceNode {
    const source = this.ensureContext().createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    return source;
  }

  private createPeriodicBuffer(source: AudioBuffer): AudioBuffer {
    const targetCrossfadeFrames = Math.max(2, Math.round(
      source.sampleRate * DECODER_SEAM_CROSSFADE_SECONDS,
    ));
    const minimumCrossfadeFrames = Math.max(2, Math.floor(targetCrossfadeFrames / 2));
    const maximumCrossfadeFrames = Math.min(
      source.length - 2,
      targetCrossfadeFrames * 2,
    );
    let crossfadeFrames = targetCrossfadeFrames;
    let bestBoundaryDelta = Number.POSITIVE_INFINITY;
    for (let candidate = minimumCrossfadeFrames; candidate <= maximumCrossfadeFrames; candidate += 1) {
      const boundary = source.length - candidate;
      let squaredDelta = 0;
      for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
        const input = source.getChannelData(channel);
        const delta = input[boundary] - input[boundary - 1];
        squaredDelta += delta * delta;
      }
      if (squaredDelta < bestBoundaryDelta) {
        bestBoundaryDelta = squaredDelta;
        crossfadeFrames = candidate;
      }
    }
    if (crossfadeFrames * 2 >= source.length) {
      throw new Error("decoded music loop is too short for periodic normalization");
    }
    const outputFrames = source.length - crossfadeFrames;
    const output = this.ensureContext().createBuffer(
      source.numberOfChannels,
      outputFrames,
      source.sampleRate,
    );
    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const input = source.getChannelData(channel);
      const result = output.getChannelData(channel);
      for (let frame = 0; frame < crossfadeFrames; frame += 1) {
        const mix = frame / (crossfadeFrames - 1);
        result[frame] = input[outputFrames + frame] * (1 - mix) + input[frame] * mix;
      }
      result.set(input.subarray(crossfadeFrames, outputFrames), crossfadeFrames);
    }
    return output;
  }

  private boundaryDbfs(buffer: AudioBuffer): number {
    let squaredDelta = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      const delta = samples[0] - samples[samples.length - 1];
      squaredDelta += delta * delta;
    }
    const rms = Math.sqrt(squaredDelta / buffer.numberOfChannels);
    return rms === 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(rms);
  }

  private createProgramOutput(startAt: number): GainNode {
    const context = this.ensureContext();
    const masterGain = this.masterGain;
    if (!masterGain) throw new Error("music master gain was not initialized");
    const output = context.createGain();
    output.gain.setValueAtTime(0, startAt);
    output.gain.linearRampToValueAtTime(1, startAt + PROGRAM_CROSSFADE_SECONDS);
    output.connect(masterGain);
    return output;
  }

  private fadeOutActive(): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    this.fadeOut(active, this.ensureContext().currentTime);
  }

  private fadeOut(active: ScheduledProgram, startAt: number): void {
    const stopAt = startAt + PROGRAM_CROSSFADE_SECONDS;
    active.output.gain.cancelAndHoldAtTime(startAt);
    active.output.gain.linearRampToValueAtTime(0, stopAt);
    for (const source of active.sources) {
      try {
        source.stop(stopAt);
      }
      catch {
        // A one-shot source may already have ended; the shared output ramp still
        // handles every source that remains scheduled or audible.
      }
    }
  }

  private updateState(patch: Partial<MusicTransportState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChange({ ...this.state });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
