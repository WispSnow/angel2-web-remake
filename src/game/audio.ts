import { ASSETS, SPEECH_RECORD_BY_CHARACTER } from "./content/stage0";
import { BATTLE_ACTION_AUDIO_ASSETS } from "./content/actions";
import { musicProgramFor } from "./content/music";
import type { GameController } from "./controller";
import {
  MusicTransport,
  type MusicProgram,
  type MusicTransportState,
} from "./music-transport";
import {
  isSoundEffectChannelEnabled,
  MUSIC_GAIN_BY_VOLUME,
  SOUND_EFFECT_GAIN_BY_VOLUME,
  soundEffectChannelForCue,
  type SoundEffectChannel,
} from "./audio-settings";
import {
  SoundEffectTransport,
  type SoundEffectPlayback,
  type SoundEffectTransportState,
} from "./sound-effect-transport";
import type { GamePhase } from "./types";
import {
  STAGE49_ENDING_MUSIC,
  STAGE49_EPILOGUE_MUSIC_BY_SELECTOR,
} from "./content/stage49-ending";
import { CREDITS_MUSIC_PROGRAM } from "./content/credits";
import { deploymentMusicProgramFor } from "./content/deployment-music";

type BattleMusicSide = "player" | "enemy";

const playerMusicPhases = new Set<GamePhase>([
  "scriptedMove",
  "scriptedStory",
  "openingStory",
  "player",
  "allyAuto",
  "round2Story",
]);

const battleMusicSide = (phase: GamePhase): BattleMusicSide | undefined => {
  if (playerMusicPhases.has(phase)) return "player";
  if (phase === "enemy") return "enemy";
  return undefined;
};

const WALK_FADE_MS = 60;

const isWalkCue = (cue: { group: string; record: number; reason: string }): boolean =>
  cue.group === "e" && cue.record === 14 && soundEffectChannelForCue(cue.reason) === "movement";

export class AudioManager {
  private readonly events = new AbortController();
  private readonly unsubscribe: () => void;
  private unlocked = false;
  private previousBattleMusicSide?: BattleMusicSide;
  private previousCueSequence = 0;
  private selectedMusic?: MusicProgram;
  private readonly music: MusicTransport;
  private readonly effects: SoundEffectTransport;
  private readonly effectRequestCounts: Record<SoundEffectChannel, number> = {
    speech: 0,
    movement: 0,
    combat: 0,
    key: 0,
  };
  private readonly effectPlaybackCounts: Record<SoundEffectChannel, number> = {
    speech: 0,
    movement: 0,
    combat: 0,
    key: 0,
  };
  private walkEffect?: SoundEffectPlayback;
  private readonly releasingWalkEffects = new Set<SoundEffectPlayback>();
  private readonly activeEffects = new Set<SoundEffectPlayback>();
  constructor(
    private readonly controller: GameController,
    private readonly root: HTMLElement,
    initiallyUnlocked = false,
  ) {
    this.unlocked = initiallyUnlocked;
    this.previousBattleMusicSide = battleMusicSide(controller.phase);
    this.music = new MusicTransport(
      MUSIC_GAIN_BY_VOLUME[controller.musicVolume],
      (state) => this.updateMusicDebugState(state),
    );
    this.effects = new SoundEffectTransport(
      SOUND_EFFECT_GAIN_BY_VOLUME[controller.soundEffectVolume],
      (state) => this.updateEffectTransportDebugState(state),
    );
    this.updateEffectDebugState();
    root.addEventListener("pointerdown", () => this.unlock(), {
      capture: true,
      signal: this.events.signal,
    });
    root.addEventListener("click", (event) => {
      if ((event.target as Element).closest("button,[data-testid=tactical-minimap]")) {
        this.playEffect(ASSETS.audio.confirm, 0.22, "key");
      }
    }, { capture: true, signal: this.events.signal });
    this.unsubscribe = controller.onChange(() => this.sync());
    this.syncMusic();
    if (this.unlocked) {
      this.music.unlock();
      this.effects.unlock();
    }
  }

  destroy(): void {
    this.events.abort();
    this.unsubscribe();
    this.effects.destroy();
    this.walkEffect = undefined;
    this.releasingWalkEffects.clear();
    this.activeEffects.clear();
    this.music.select(undefined);
  }

  playSpeechCharacter(character: string): void {
    if (/[，．？！「」\s]/u.test(character)) return;
    const record = SPEECH_RECORD_BY_CHARACTER[character];
    if (record === undefined) return;
    this.playEffect(ASSETS.audio.speech[record - 57], 0.24, "speech");
  }

  private unlock(): void {
    this.unlocked = true;
    this.music.unlock();
    this.effects.unlock();
  }

  private sync(): void {
    this.syncMusic();
    this.applySoundEffectVolume();
    const cue = this.controller.audioCue;
    if (cue && cue.sequence !== this.previousCueSequence) {
      this.previousCueSequence = cue.sequence;
      const actionKey = `${cue.group}-${cue.record}` as keyof typeof BATTLE_ACTION_AUDIO_ASSETS;
      const source = BATTLE_ACTION_AUDIO_ASSETS[actionKey]
        ?? (cue.group === "e"
          ? ASSETS.audio.effects[cue.record as keyof typeof ASSETS.audio.effects]
          : undefined);
      if (source) {
        const walk = isWalkCue(cue);
        // A second walk must never stack on the first: cut the previous clip
        // before the new one starts.
        if (walk) this.stopWalkEffect();
        const effect = this.playEffect(
          source,
          cue.record === 11 ? 0.5 : 0.55,
          soundEffectChannelForCue(cue.reason),
        );
        if (walk) {
          this.walkEffect = effect;
          this.updateWalkDebugState();
        }
      }
    }
    // The native request is fire-and-forget, but E/14 runs 1.261 s while an
    // ordinary remake step takes 80 ms, so a short walk would keep sounding
    // well after the unit has arrived. Bound the clip by the walk presentation
    // instead. This only shortens playback — it never delays or advances the
    // simulation, which has already committed every step by this point.
    if (!this.controller.movementPresentation) this.stopWalkEffect();
  }

  private stopWalkEffect(): void {
    const effect = this.walkEffect;
    this.walkEffect = undefined;
    if (effect) this.releaseWalkEffect(effect);
    this.updateWalkDebugState();
  }

  // Cutting a footstep clip mid-waveform clicks, so give each source its own
  // short gain release. A new walk cannot cancel an older source's ramp.
  private releaseWalkEffect(effect: SoundEffectPlayback): void {
    this.releasingWalkEffects.add(effect);
    effect.fadeOut(WALK_FADE_MS);
  }

  // Derived rather than pushed, so a late release callback cannot report on a
  // walk that has already been replaced.
  private updateWalkDebugState(): void {
    if (!this.controller.isTestMode) return;
    this.root.dataset.walkEffectActive = String(
      this.walkEffect !== undefined || this.releasingWalkEffects.size > 0,
    );
  }

  private syncMusic(): void {
    this.applyMusicVolume();
    // Module 29 starts the incoming side's program immediately before the
    // first A/19 motion frame, while the simulation phase still belongs to
    // the outgoing side. Keep that presentation-only music boundary separate
    // from the deterministic turn lifecycle.
    const side = this.controller.turnTransitionPresentation?.phase === "motion"
      ? this.controller.turnTransitionPresentation.side
      : battleMusicSide(this.controller.phase);
    const previousSide = this.previousBattleMusicSide;
    let desired = this.selectedMusic;
    let restart = false;
    if (this.controller.phase === "ending") {
      const ending = this.controller.stage49Ending;
      if (ending?.section === "story") desired = STAGE49_ENDING_MUSIC.story;
      else if (ending?.section === "roster") desired = STAGE49_ENDING_MUSIC.roster;
      // Native module 35 selects and starts the record-total branch track at
      // entry (0000:0457/045A) before running the four segments, so it plays
      // over the whole epilogue instead of arriving with segment 4.
      else if (ending?.section === "epilogue") {
        desired = STAGE49_EPILOGUE_MUSIC_BY_SELECTOR[ending.epilogueMusicSelector];
      }
      else if (ending?.section === "stage38-boundary") desired = undefined;
    }
    else if (this.controller.phase === "deployment") {
      // The roster screen is its own native module. Module 25 shuts the RIX
      // driver down when the pre-battle story ends, and module 27 starts a
      // scene-selected looping track of its own before drawing the roster,
      // so deployment never inherits the story or battle track.
      desired = deploymentMusicProgramFor(this.controller.battle.stage.nativeStage);
    }
    else if (this.controller.phase === "prebattleStory") {
      // Some stages route straight into the story with no track of their own
      // (the connecting narrative already played at the end of the previous
      // stage). Without this branch the story would just keep whichever
      // battle-phase track happened to be playing when the previous stage was
      // won, instead of this stage's own pre-battle music — or the silence
      // that stages without a story record are supposed to have.
      desired = musicProgramFor(this.controller.battle.stage.music.story);
    }
    else if (side && (side !== previousSide || !desired)) {
      desired = musicProgramFor(
        side === "player"
          ? this.controller.battle.stage.music.playerPhase
          : this.controller.battle.stage.music.enemyPhase,
      );
      restart = desired?.id === this.selectedMusic?.id;
    }
    else if (this.controller.phase === "credits") {
      desired = CREDITS_MUSIC_PROGRAM;
    }
    else if (this.controller.phase === "quit"
      || this.controller.phase === "nextStage"
    ) {
      desired = undefined;
    }

    if (desired?.id !== this.selectedMusic?.id || restart) {
      this.selectedMusic = desired;
      this.music.select(desired, restart);
    }
    this.previousBattleMusicSide = side;
  }

  private applyMusicVolume(): void {
    this.music.setGain(MUSIC_GAIN_BY_VOLUME[this.controller.musicVolume]);
  }

  private applySoundEffectVolume(): void {
    this.effects.setGain(SOUND_EFFECT_GAIN_BY_VOLUME[this.controller.soundEffectVolume]);
    this.updateEffectDebugState();
  }

  private updateMusicDebugState(state: MusicTransportState): void {
    if (!this.controller.isTestMode) return;
    this.root.dataset.musicTrack = state.track ?? "none";
    this.root.dataset.musicPlaying = String(state.playing);
    this.root.dataset.musicLoop = String(state.loop);
    this.root.dataset.musicPart = state.part;
    this.root.dataset.musicVolumeLevel = String(this.controller.musicVolume);
    this.root.dataset.musicVolume = String(MUSIC_GAIN_BY_VOLUME[this.controller.musicVolume]);
    this.root.dataset.musicPlayRequestCount = String(state.playRequestCount);
    this.root.dataset.musicEngine = "web-audio";
    this.root.dataset.musicSeamlessLoop = String(state.seamlessLoop);
    this.root.dataset.musicCrossfadeMs = state.crossfadeMilliseconds.toFixed(3);
    if (state.boundaryDbfs === undefined) delete this.root.dataset.musicBoundaryDbfs;
    else this.root.dataset.musicBoundaryDbfs = state.boundaryDbfs.toFixed(3);
    if (state.error) this.root.dataset.musicError = state.error;
    else delete this.root.dataset.musicError;
  }

  private updateEffectDebugState(channel?: SoundEffectChannel): void {
    if (!this.controller.isTestMode) return;
    for (const name of Object.keys(this.effectPlaybackCounts) as SoundEffectChannel[]) {
      this.root.dataset[`${name}EffectRequestCount`] = String(this.effectRequestCounts[name]);
      this.root.dataset[`${name}EffectCount`] = String(this.effectPlaybackCounts[name]);
    }
    this.root.dataset.soundEffectVolumeLevel = String(this.controller.soundEffectVolume);
    this.root.dataset.soundEffectGain = String(
      SOUND_EFFECT_GAIN_BY_VOLUME[this.controller.soundEffectVolume],
    );
    if (channel) this.root.dataset.lastEffectChannel = channel;
  }

  private updateEffectTransportDebugState(state: SoundEffectTransportState): void {
    if (!this.controller.isTestMode) return;
    this.root.dataset.soundEffectEngine = "web-audio";
    this.root.dataset.soundEffectContext = state.contextState;
    this.root.dataset.soundEffectBufferCount = String(state.bufferCount);
    this.root.dataset.soundEffectScheduleCount = String(state.scheduledCount);
    this.root.dataset.soundEffectActiveCount = String(state.activeCount);
    this.root.dataset.soundEffectReady = String(state.bufferCount > 0);
    if (state.error) this.root.dataset.soundEffectError = state.error;
    else delete this.root.dataset.soundEffectError;
  }

  private finishEffect(effect: SoundEffectPlayback): void {
    this.activeEffects.delete(effect);
    this.releasingWalkEffects.delete(effect);
    if (this.walkEffect === effect) this.walkEffect = undefined;
    this.updateWalkDebugState();
  }

  private playEffect(
    source: string,
    volume: number,
    channel: SoundEffectChannel,
  ): SoundEffectPlayback | undefined {
    this.effectRequestCounts[channel] += 1;
    if (this.controller.isTestMode) this.root.dataset.lastEffectRequestChannel = channel;
    this.updateEffectDebugState();
    if (!this.unlocked || !isSoundEffectChannelEnabled(this.controller, channel)) return undefined;
    let effect: SoundEffectPlayback | undefined;
    effect = this.effects.play(source, volume, () => {
      if (effect) this.finishEffect(effect);
    });
    if (!effect) return undefined;
    this.activeEffects.add(effect);
    this.effectPlaybackCounts[channel] += 1;
    this.updateEffectDebugState(channel);
    return effect;
  }
}
