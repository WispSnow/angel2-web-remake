import {
  buildIntroLoopMusicSchedule,
  buildLoopMusicSchedule,
} from "./music-schedule";
import { loadEncodedMusic, releaseEncodedMusic } from "./music-resource-cache";

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

/**
 * `REMAKE-181` 交響改編：單一檔案，從 0 播起，到 `loopEnd` 跳回 `loopStart`。接縫已在檔案裡
 * 做好（尾端交叉淡化到循環起點的同一處音樂），所以這裡只用 Web Audio 原生循環點，不再做
 * 解碼後的週期化。`entryTrack` 存在時，`loopStart` 之前的部分對應原曲的入場段。
 */
export interface RemixLoopMusicProgram {
  id: string;
  kind: "remix-loop";
  entryTrack?: string;
  loopTrack: string;
  source: string;
  loopStartSeconds: number;
  loopEndSeconds: number;
}

export type MusicProgram = LoopMusicProgram | IntroLoopMusicProgram | RemixLoopMusicProgram;

export interface MusicTransportState {
  track?: string;
  /** `remix` 表示正在播 `REMAKE-181` 的交響改編檔。 */
  source: "original" | "remix";
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
  /** 只更新可觀測狀態的計時器；節目退場時一併清掉。 */
  dispose?: () => void;
}

const SCHEDULE_LEAD_SECONDS = 0.01;
const PROGRAM_CROSSFADE_SECONDS = 0.005;
const VOLUME_RAMP_SECONDS = 0.015;
const DECODER_SEAM_CROSSFADE_SECONDS = 256 / 44_100;

export class MusicTransport {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private gain: number;
  private unlocked = false;
  private suspended = false;
  private desired?: MusicProgram;
  private active?: ScheduledProgram;
  private requestSequence = 0;
  private schedulingRequest?: number;
  private readonly encoded = new Map<string, Promise<ArrayBuffer>>();
  private readonly decoded = new Map<string, Promise<AudioBuffer>>();
  private fadeOutSeconds = PROGRAM_CROSSFADE_SECONDS;
  private state: MusicTransportState = {
    source: "original",
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

  /**
   * `fadeOutSeconds` is how long the outgoing program takes to fade once the
   * incoming one starts (or once silence is selected). The default is the
   * native-faithful 5 ms cut; `REMAKE-181` passes 0.6 s in orchestral mode.
   */
  select(
    program: MusicProgram | undefined,
    restart = false,
    fadeOutSeconds = PROGRAM_CROSSFADE_SECONDS,
  ): void {
    if (!restart && program?.id === this.desired?.id) return;
    this.desired = program;
    this.fadeOutSeconds = Math.max(PROGRAM_CROSSFADE_SECONDS, fadeOutSeconds);
    const request = ++this.requestSequence;
    this.schedulingRequest = undefined;
    if (!program) {
      this.fadeOutActive();
      this.updateState({
        track: undefined,
        source: "original",
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
      track: program.kind === "loop"
        ? program.track
        : program.kind === "intro-loop"
          ? program.entryTrack
          : program.entryTrack ?? program.loopTrack,
      source: program.kind === "remix-loop" ? "remix" : "original",
      part: "entry",
      loop: program.kind === "loop" || (program.kind === "remix-loop" && !program.entryTrack),
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
      if (this.suspended) return context.suspend();
      const desired = this.desired;
      if (desired) void this.schedule(desired, this.requestSequence);
    }).catch((error: unknown) => {
      this.updateState({ playing: false, error: this.errorMessage(error) });
    });
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    const context = this.context;
    if (!context || !this.unlocked) return;
    if (suspended) {
      void context.suspend().then(() => this.updateState({ playing: this.active !== undefined }))
        .catch((error: unknown) => this.updateState({ error: this.errorMessage(error) }));
    } else {
      void context.resume().then(() => {
        const desired = this.desired;
        if (desired && !this.active) void this.schedule(desired, this.requestSequence);
        this.updateState({ playing: this.active !== undefined });
      }).catch((error: unknown) => this.updateState({ error: this.errorMessage(error) }));
    }
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
    const request = loadEncodedMusic(url);
    this.encoded.set(url, request);
    return request;
  }

  private loadBuffer(url: string, periodic = false): Promise<AudioBuffer> {
    const cacheKey = `${periodic ? "periodic" : "raw"}:${url}`;
    const existing = this.decoded.get(cacheKey);
    if (existing) return existing;
    const context = this.ensureContext();
    const encodedRequest = this.preloadUrl(url);
    const decoded = encodedRequest.then(async (encoded) => {
      const source = await context.decodeAudioData(encoded.slice(0));
      // The decoded AudioBuffer is the long-lived runtime copy. Releasing the
      // fetched PCM bytes avoids retaining both 16-bit and float representations.
      this.encoded.delete(url);
      releaseEncodedMusic(url, encodedRequest);
      return periodic ? this.createPeriodicBuffer(source) : source;
    });
    void decoded.catch(() => undefined);
    this.decoded.set(cacheKey, decoded);
    return decoded;
  }

  private async schedule(program: MusicProgram, request: number): Promise<void> {
    if (!this.unlocked || this.suspended || this.context?.state !== "running") return;
    if (this.active?.id === program.id && this.active.request === request) return;
    if (this.schedulingRequest === request) return;
    this.schedulingRequest = request;
    try {
      const buffers = program.kind === "loop"
        ? await Promise.all([
            this.loadBuffer(program.source),
            this.loadBuffer(program.seamlessLoop, true),
          ])
        : program.kind === "intro-loop"
          ? await Promise.all([
              this.loadBuffer(program.entry),
              this.loadBuffer(program.seamlessLoop, true),
            ])
          : [await this.loadBuffer(program.source)];
      if (request !== this.requestSequence || this.desired?.id !== program.id) return;
      const context = this.ensureContext();
      if (context.state !== "running") return;
      const startAt = context.currentTime + SCHEDULE_LEAD_SECONDS;
      const scheduled = program.kind === "loop"
        ? this.scheduleLoopProgram(program, buffers[0], buffers[1], startAt, request)
        : program.kind === "intro-loop"
          ? this.scheduleIntroLoopProgram(program, buffers[0], buffers[1], startAt, request)
          : this.scheduleRemixLoopProgram(program, buffers[0], startAt, request);
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

  private scheduleRemixLoopProgram(
    program: RemixLoopMusicProgram,
    buffer: AudioBuffer,
    startAt: number,
    request: number,
  ): ScheduledProgram {
    const { loopStartSeconds, loopEndSeconds } = program;
    // One decoded sample of slack: a resampling decoder may round the length.
    if (!(loopStartSeconds > 0 && loopStartSeconds < loopEndSeconds)
      || loopEndSeconds > buffer.duration + 1 / buffer.sampleRate) {
      throw new Error(`remix loop points fall outside the decoded buffer: ${program.source}`);
    }
    const context = this.ensureContext();
    const output = this.createProgramOutput(startAt);
    const source = this.createSource(buffer, output);
    source.loop = true;
    source.loopStart = loopStartSeconds;
    source.loopEnd = Math.min(loopEndSeconds, buffer.duration);
    source.start(startAt);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // There is no event at the loop point, so the debug state polls the
    // context clock. A suspended context simply re-arms the timer; nothing
    // here touches playback.
    const announceLoop = () => {
      timer = undefined;
      if (request !== this.requestSequence || this.desired?.id !== program.id) return;
      const remaining = startAt + loopStartSeconds - context.currentTime;
      if (remaining > 0.01) {
        timer = setTimeout(announceLoop, remaining * 1000 + 20);
        return;
      }
      this.updateState({ track: program.loopTrack, part: "loop", loop: true, playing: true });
    };
    if (program.entryTrack) timer = setTimeout(announceLoop, loopStartSeconds * 1000);
    this.updateState({
      track: program.entryTrack ?? program.loopTrack,
      source: "remix",
      part: program.entryTrack ? "entry" : "loop",
      loop: !program.entryTrack,
      seamlessLoop: true,
      crossfadeMilliseconds: 0,
      boundaryDbfs: undefined,
    });
    return {
      id: program.id,
      request,
      output,
      sources: [source],
      dispose: () => {
        if (timer !== undefined) clearTimeout(timer);
      },
    };
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
    active.dispose?.();
    const stopAt = startAt + this.fadeOutSeconds;
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
