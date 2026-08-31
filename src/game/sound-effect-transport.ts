import { soundEffectBufferBank, type SoundEffectBufferBank } from "./sound-effect-cache";

export interface SoundEffectTransportState {
  readonly contextState: AudioContextState | "uninitialized";
  readonly scheduledCount: number;
  readonly activeCount: number;
  readonly bufferCount: number;
  readonly error?: string;
}

export interface SoundEffectPlayback {
  stop(): void;
  fadeOut(milliseconds: number): void;
}

interface ActiveSoundEffect {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  ended: boolean;
}

const VOLUME_RAMP_SECONDS = 0.015;

export class SoundEffectTransport {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private gain: number;
  private unlocked = false;
  private suspended = false;
  private scheduledCount = 0;
  private readonly active = new Set<ActiveSoundEffect>();
  private error?: string;

  constructor(
    initialGain: number,
    private readonly onStateChange: (state: SoundEffectTransportState) => void,
    private readonly buffers: SoundEffectBufferBank = soundEffectBufferBank,
  ) {
    this.gain = initialGain;
    this.emitState();
  }

  unlock(): void {
    this.unlocked = true;
    const context = this.ensureContext();
    void context.resume().then(() => {
      if (this.suspended) return context.suspend();
      this.error = undefined;
      this.emitState();
    }).catch((error: unknown) => {
      this.error = this.errorMessage(error);
      this.emitState();
    });
    this.emitState();
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    const context = this.context;
    if (!context || !this.unlocked) return;
    const change = suspended ? context.suspend() : context.resume();
    void change.then(() => {
      this.error = undefined;
      this.emitState();
    }).catch((error: unknown) => {
      this.error = this.errorMessage(error);
      this.emitState();
    });
  }

  setGain(gain: number): void {
    if (gain === this.gain) return;
    this.gain = gain;
    const context = this.context;
    const masterGain = this.masterGain;
    if (context && masterGain) {
      const now = context.currentTime;
      masterGain.gain.cancelAndHoldAtTime(now);
      masterGain.gain.linearRampToValueAtTime(gain, now + VOLUME_RAMP_SECONDS);
    }
    this.emitState();
  }

  play(
    url: string,
    cueGain: number,
    onEnded?: () => void,
  ): SoundEffectPlayback | undefined {
    if (!this.unlocked || this.suspended) return undefined;
    const buffer = this.buffers.get(url);
    if (!buffer) {
      this.error = `sound effect was not prepared before playback: ${url}`;
      this.emitState();
      return undefined;
    }
    const context = this.ensureContext();
    const masterGain = this.masterGain;
    if (!masterGain) throw new Error("sound-effect master gain was not initialized");
    const source = context.createBufferSource();
    const output = context.createGain();
    output.gain.setValueAtTime(Math.min(1, Math.max(0, cueGain)), context.currentTime);
    source.buffer = buffer;
    source.connect(output);
    output.connect(masterGain);
    const active: ActiveSoundEffect = { source, gain: output, ended: false };
    const finish = () => {
      if (active.ended) return;
      active.ended = true;
      this.active.delete(active);
      source.disconnect();
      output.disconnect();
      onEnded?.();
      this.emitState();
    };
    source.addEventListener("ended", finish, { once: true });
    this.active.add(active);
    this.scheduledCount += 1;
    this.error = undefined;
    source.start(context.currentTime);
    this.emitState();

    return {
      stop: () => {
        if (active.ended) return;
        try {
          source.stop();
        } catch {
          finish();
        }
      },
      fadeOut: (milliseconds) => {
        if (active.ended) return;
        const now = context.currentTime;
        const stopAt = now + Math.max(0, milliseconds) / 1000;
        output.gain.cancelAndHoldAtTime(now);
        output.gain.linearRampToValueAtTime(0, stopAt);
        try {
          source.stop(stopAt);
        } catch {
          finish();
        }
      },
    };
  }

  destroy(): void {
    for (const active of [...this.active]) {
      try {
        active.source.stop();
      } catch {
        // The ended callback owns cleanup for sources that already finished.
      }
    }
    this.active.clear();
    const context = this.context;
    this.context = undefined;
    this.masterGain = undefined;
    if (context) void context.close().catch(() => undefined);
    this.emitState();
  }

  private ensureContext(): AudioContext {
    if (this.context && this.masterGain) return this.context;
    const context = new AudioContext({ latencyHint: "interactive" });
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(this.gain, context.currentTime);
    masterGain.connect(context.destination);
    context.addEventListener("statechange", () => this.emitState());
    this.context = context;
    this.masterGain = masterGain;
    return context;
  }

  private emitState(): void {
    this.onStateChange({
      contextState: this.context?.state ?? "uninitialized",
      scheduledCount: this.scheduledCount,
      activeCount: this.active.size,
      bufferCount: this.buffers.size,
      error: this.error,
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
