class FlugtagSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private splashNoiseBuffer: AudioBuffer | null = null;
  private _muted: boolean = false;
  private lastAirhornTime: number = 0;
  private lastPushTime: number = 0;
  private lastSnapTime: number = 0;

  public get muted(): boolean {
    return this._muted;
  }

  public set muted(val: boolean) {
    this._muted = val;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(val ? 0 : 1, this.ctx.currentTime, 0.015);
    }
  }

  private ensureContext(): { ctx: AudioContext; out: AudioNode } | null {
    if (this._muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-14, ctx.currentTime);
        compressor.knee.setValueAtTime(18, ctx.currentTime);
        compressor.ratio.setValueAtTime(6, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.15, ctx.currentTime);

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(this._muted ? 0 : 1, ctx.currentTime);
        masterGain.connect(compressor);
        compressor.connect(ctx.destination);

        this.ctx = ctx;
        this.compressor = compressor;
        this.masterGain = masterGain;

        // Pre-generate 0.25s looped white noise buffer once so splashdown never stalls the main thread
        const bufferSize = Math.floor(ctx.sampleRate * 0.25);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        this.splashNoiseBuffer = buffer;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.ctx || !this.masterGain) return null;
    return { ctx: this.ctx, out: this.masterGain };
  }

  private scheduleTone(
    ctx: AudioContext,
    out: AudioNode,
    type: OscillatorType,
    startFreq: number,
    endFreq: number | null,
    startTime: number,
    duration: number,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration * 0.85);
    }

    const attackEnd = startTime + Math.min(0.008, duration * 0.2);
    gain.gain.setValueAtTime(0.0001, Math.max(ctx.currentTime, startTime - 0.001));
    gain.gain.linearRampToValueAtTime(peakGain, attackEnd);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    osc.connect(gain);
    gain.connect(out);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  public playSnapPop(): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;
    if (now - this.lastSnapTime < 0.03) return;
    this.lastSnapTime = now;
    this.scheduleTone(ctx, out, 'sine', 320, 760, now, 0.11, 0.22);
  }

  public playAirhorn(): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;
    if (now - this.lastAirhornTime < 0.085) return;
    this.lastAirhornTime = now;

    const sharedGain = ctx.createGain();
    sharedGain.gain.setValueAtTime(0.0001, now);
    sharedGain.gain.linearRampToValueAtTime(0.065, now + 0.01);
    sharedGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.38);
    sharedGain.connect(out);

    const freqs = [392, 493.88, 587.33]; // G major stadium horn chord
    let endedCount = 0;
    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.96, now);
      osc.frequency.linearRampToValueAtTime(f, now + 0.05);

      osc.connect(sharedGain);
      osc.onended = () => {
        osc.disconnect();
        endedCount += 1;
        if (endedCount === freqs.length) {
          sharedGain.disconnect();
        }
      };
      osc.start(now);
      osc.stop(now + 0.39);
    });
  }

  public playPushBoost(): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;
    if (now - this.lastPushTime < 0.045) return;
    this.lastPushTime = now;

    this.scheduleTone(ctx, out, 'triangle', 150, 290, now, 0.09, 0.18);
  }

  /** Crisp bicycle chain & sprocket crank click for Tandem Coaster pedaling */
  public playPedalCrank(): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;
    if (now - this.lastPushTime < 0.045) return;
    this.lastPushTime = now;

    this.scheduleTone(ctx, out, 'triangle', 240, 460, now, 0.055, 0.15);
    this.scheduleTone(ctx, out, 'sine', 680, 980, now + 0.032, 0.045, 0.11);
  }

  /** Metallic brass canal bell chime (double Ding-Ding for mid-course bells, resonant Grand Bell chord at 320 ft) */
  public playCanalBell(isGrand: boolean = false): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;

    if (isGrand) {
      const grandChord = [523.25, 783.99, 1046.5, 1567.98];
      grandChord.forEach((freq, i) => {
        this.scheduleTone(ctx, out, 'sine', freq, null, now, 0.65, 0.15 - i * 0.02);
        this.scheduleTone(ctx, out, 'triangle', freq * 2, null, now, 0.35, 0.06);
        this.scheduleTone(ctx, out, 'sine', freq, null, now + 0.18, 0.75, 0.16 - i * 0.02);
      });
    } else {
      // Classic Dutch bicycle / canal brass double-ring ("Tring-Tring!")
      [0, 0.085].forEach((offset) => {
        this.scheduleTone(ctx, out, 'sine', 1174.66, null, now + offset, 0.28, 0.16);
        this.scheduleTone(ctx, out, 'triangle', 2349.32, null, now + offset, 0.18, 0.09);
        this.scheduleTone(ctx, out, 'sine', 3135.96, null, now + offset, 0.11, 0.05);
      });
    }
  }

  /** Rhythmic freewheel ratchet + roller spin when testing a Tandem Coaster on Hangar Rollers */
  public playRollersWhir(): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;

    for (let i = 0; i < 5; i++) {
      this.scheduleTone(ctx, out, 'triangle', 520 + i * 70, 820 + i * 80, now + i * 0.05, 0.04, 0.1);
    }
    this.scheduleTone(ctx, out, 'sine', 987.77, null, now + 0.24, 0.22, 0.12);
  }

  public playTrolleyDetach(perfect: boolean): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;

    const notes = perfect ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25];
    notes.forEach((freq, i) => {
      this.scheduleTone(ctx, out, 'triangle', freq, null, now + i * 0.045, 0.22, 0.16);
    });
  }

  public playThermalChime(): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;

    const notes = [587.33, 783.99, 987.77, 1174.66];
    notes.forEach((freq, idx) => {
      this.scheduleTone(ctx, out, 'sine', freq, null, now + idx * 0.04, 0.25, 0.14);
    });
  }

  public playSplash(intensity: number = 60): void {
    const bus = this.ensureContext();
    if (!bus || !this.splashNoiseBuffer) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;
    const duration = 0.55 + (intensity / 100) * 0.45;

    const noise = ctx.createBufferSource();
    noise.buffer = this.splashNoiseBuffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(720, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + duration);
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.002, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    noise.start(now);
    noise.stop(now + duration + 0.01);
  }

  public playFanWhoosh(): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    this.scheduleTone(ctx, out, 'sine', 110, 240, ctx.currentTime, 0.38, 0.14);
  }

  public playUnlockFanfare(): void {
    const bus = this.ensureContext();
    if (!bus) return;
    const { ctx, out } = bus;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.scheduleTone(ctx, out, 'triangle', f, null, now + i * 0.07, 0.32, 0.18);
    });
  }
}

export const soundEngine = new FlugtagSoundEngine();

