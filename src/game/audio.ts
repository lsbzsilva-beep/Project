import { SurfaceType } from './types';

interface ActiveDoorVoice {
  stop: (fadeTime: number) => void;
}

export class BlackwoodAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private roomDraftGain: GainNode | null = null;
  private roomDraftFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private doorCreakBuffer: AudioBuffer | null = null;
  private doorLoadStarted = false;
  private activeDoorVoices = new Map<string, ActiveDoorVoice>();

  private doorSampleBuffer: AudioBuffer | null = null;
  private stingerBuffer: AudioBuffer | null = null;
  private heartbeatBuffer: AudioBuffer | null = null;

  private unlocked = false;
  private muted = false;
  private indoorBlend = 0;
  private stepIndex = 0;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.85, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.85;
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.setupRoomDraft();
      this.preloadAudioBuffers();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (!this.unlocked) {
      this.unlocked = true;
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = last * 2.2;
    }
    return buffer;
  }

  private setupRoomDraft(): void {
    if (!this.ctx || !this.noiseBuffer || !this.masterGain) return;

    // Purely environmental architectural air/pipe draft inside corridors (no rain, no music)
    const draftSrc = this.ctx.createBufferSource();
    draftSrc.buffer = this.noiseBuffer;
    draftSrc.loop = true;

    this.roomDraftFilter = this.ctx.createBiquadFilter();
    this.roomDraftFilter.type = 'lowpass';
    this.roomDraftFilter.frequency.value = 140;

    this.roomDraftGain = this.ctx.createGain();
    this.roomDraftGain.gain.value = 0.004;

    draftSrc.connect(this.roomDraftFilter);
    this.roomDraftFilter.connect(this.roomDraftGain);
    this.roomDraftGain.connect(this.masterGain);
    draftSrc.start();
  }

  private preloadAudioBuffers(): void {
    if (!this.ctx) return;
    const loadBuf = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        return await this.ctx!.decodeAudioData(arr);
      } catch {
        return null;
      }
    };

    if (!this.doorLoadStarted) {
      this.doorLoadStarted = true;
      void loadBuf('/assets/blackwood/creaky_door_hinge.wav').then((b) => {
        if (b) this.doorCreakBuffer = b;
      });
      void loadBuf('/assets/blackwood/door.mp3').then((b) => {
        if (b) this.doorSampleBuffer = b;
      });
      void loadBuf('/assets/blackwood/stinger.mp3').then((b) => {
        if (b) this.stingerBuffer = b;
      });
      void loadBuf('/assets/blackwood/heartbeat.mp3').then((b) => {
        if (b) this.heartbeatBuffer = b;
      });
    }
  }

  setEnvironmentBlend(indoorBlend: number, tension = 0): void {
    this.indoorBlend = indoorBlend;
    if (this.ctx && this.roomDraftGain && this.roomDraftFilter) {
      const draftAmp = indoorBlend * (0.018 + tension * 0.045);
      const draftFreq = 120 + tension * 165;
      this.roomDraftGain.gain.setTargetAtTime(draftAmp, this.ctx.currentTime, 0.2);
      this.roomDraftFilter.frequency.setTargetAtTime(draftFreq, this.ctx.currentTime, 0.2);
    }
  }

  private createSpatialBus(pan: number, dist: number): GainNode {
    if (!this.ctx || !this.masterGain) {
      throw new Error('AudioContext not ready');
    }
    const g = this.ctx.createGain();
    const atten = 1 / (1 + Math.max(0, dist) * 0.24);
    g.gain.value = Math.max(0.05, Math.min(1, atten));

    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.9, Math.min(0.9, pan));
      g.connect(panner);
      panner.connect(this.masterGain);
    } else {
      g.connect(this.masterGain);
    }
    return g;
  }

  playFootstep(volume = 0.45, surface: SurfaceType = 'wood', sprinting = false): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const isLeft = this.stepIndex++ % 2 === 0;
    const pitchJitter = (isLeft ? 0.96 : 1.04) * (0.94 + Math.random() * 0.12);
    const v = volume * (sprinting ? 1.18 : 1.0);
    const exterior = surface === 'exterior';

    let dest: AudioNode = this.masterGain;
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = isLeft ? -0.14 : 0.14;
      panner.connect(this.masterGain);
      dest = panner;
    }

    // 1. Low heel-strike thud
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    const startHz =
      (surface === 'exterior'
        ? 94
        : surface === 'tile'
          ? 145
          : surface === 'stone'
            ? 135
            : surface === 'concrete'
              ? 128
              : 118) * pitchJitter;
    const endHz = exterior ? 38 : surface === 'tile' ? 62 : 46;
    thud.frequency.setValueAtTime(startHz, now);
    thud.frequency.exponentialRampToValueAtTime(endHz, now + 0.075);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.linearRampToValueAtTime(v * (exterior ? 0.25 : surface === 'tile' ? 0.26 : 0.34), now + 0.006);
    thudGain.gain.exponentialRampToValueAtTime(0.0004, now + 0.09);
    thud.connect(thudGain);
    thudGain.connect(dest);
    thud.start(now);
    thud.stop(now + 0.1);

    // 2. Surface resonance (wood knock/creak or tile/stone heel click)
    if (!exterior) {
      const resOsc = ctx.createOscillator();
      resOsc.type = surface === 'tile' || surface === 'stone' ? 'sine' : 'triangle';
      const baseResHz =
        surface === 'tile' ? 620 : surface === 'stone' ? 420 : surface === 'concrete' ? 350 : 275;
      const resHz = baseResHz * pitchJitter;
      resOsc.frequency.setValueAtTime(resHz, now);
      resOsc.frequency.exponentialRampToValueAtTime(resHz * 0.45, now + 0.048);

      const resGain = ctx.createGain();
      resGain.gain.setValueAtTime(0.0001, now);
      resGain.gain.linearRampToValueAtTime(v * (surface === 'tile' ? 0.16 : 0.19), now + 0.004);
      resGain.gain.exponentialRampToValueAtTime(0.0004, now + 0.06);
      resOsc.connect(resGain);
      resGain.connect(dest);
      resOsc.start(now);
      resOsc.stop(now + 0.07);

      // Subtle random old wood floorboard creak
      if (surface === 'wood' && Math.random() < 0.22) {
        const creak = ctx.createOscillator();
        creak.type = 'sawtooth';
        const cStart = 185 + Math.random() * 65;
        creak.frequency.setValueAtTime(cStart, now + 0.015);
        creak.frequency.linearRampToValueAtTime(cStart * 0.72, now + 0.11);
        const cf = ctx.createBiquadFilter();
        cf.type = 'bandpass';
        cf.frequency.value = 480;
        cf.Q.value = 3.5;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.0001, now + 0.015);
        cg.gain.linearRampToValueAtTime(v * 0.065, now + 0.04);
        cg.gain.exponentialRampToValueAtTime(0.0004, now + 0.13);
        creak.connect(cf);
        cf.connect(cg);
        cg.connect(dest);
        creak.start(now + 0.015);
        creak.stop(now + 0.14);
      }
    }

    // 3. Textured sole / gravel / wet tile transient
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value =
        (surface === 'exterior'
          ? 1450
          : surface === 'tile'
            ? 1520
            : surface === 'stone'
              ? 1120
              : 860) * pitchJitter;
      filter.Q.value = exterior ? 1.35 : surface === 'tile' ? 2.6 : 2.1;

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.linearRampToValueAtTime(v * (exterior ? 0.36 : 0.31), now + 0.007);
      ng.gain.exponentialRampToValueAtTime(0.0004, now + (exterior ? 0.11 : 0.075));

      noise.connect(filter);
      filter.connect(ng);
      ng.connect(dest);
      noise.start(now, Math.random() * 1.1, exterior ? 0.13 : 0.09);

      if (exterior || surface === 'tile') {
        const splash = ctx.createBufferSource();
        splash.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = surface === 'tile' ? 3000 : 2600;
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.0001, now + 0.008);
        sg.gain.linearRampToValueAtTime(v * (surface === 'tile' ? 0.08 : 0.12), now + 0.018);
        sg.gain.exponentialRampToValueAtTime(0.0004, now + 0.085);
        splash.connect(hp);
        hp.connect(sg);
        sg.connect(dest);
        splash.start(now + 0.008, Math.random() * 1.1, 0.1);
      }
    }
  }

  playDoorAction(id: string, isOpen: boolean, frac: number, duration: number, pan = 0, dist = 0): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.stopDoorSound(id, 0.04);
    const now = this.ctx.currentTime;
    const bus = this.createSpatialBus(pan, dist);

    const buf = this.doorCreakBuffer || this.doorSampleBuffer;
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = isOpen ? 0.88 + Math.random() * 0.1 : 1.04 + Math.random() * 0.12;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.28 * Math.max(0.35, frac), now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.35, duration));
      src.connect(g);
      g.connect(bus);
      src.start(now);
      src.stop(now + Math.max(0.4, duration + 0.05));
      this.activeDoorVoices.set(id, {
        stop: (fadeTime: number) => {
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(Math.max(0.001, g.gain.value), t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.01, fadeTime));
          try {
            src.stop(t + fadeTime + 0.02);
          } catch {
            // ignore already stopped
          }
        },
      });
    }
  }

  stopDoorSound(id: string, fadeTime = 0.08): void {
    const v = this.activeDoorVoices.get(id);
    if (v) {
      v.stop(fadeTime);
      this.activeDoorVoices.delete(id);
    }
  }

  playDoorCloseImpact(id: string, frac: number, pan = 0, dist = 0): void {
    this.stopDoorSound(id, 0.02);
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const bus = this.createSpatialBus(pan, dist);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(105, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.001, now);
    og.gain.linearRampToValueAtTime(0.28 * Math.max(0.4, frac), now + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0005, now + 0.16);
    osc.connect(og);
    og.connect(bus);
    osc.start(now);
    osc.stop(now + 0.18);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 480;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.001, now);
    ng.gain.linearRampToValueAtTime(0.24 * Math.max(0.4, frac), now + 0.008);
    ng.gain.exponentialRampToValueAtTime(0.0005, now + 0.14);
    noise.connect(f);
    f.connect(ng);
    ng.connect(bus);
    noise.start(now);
    noise.stop(now + 0.16);
  }

  playParanormalDoorKnock(pan: number, dist: number, count: number, locked: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bus = this.createSpatialBus(pan, dist);
    const offsets = count >= 3 ? [0, 0.27, 0.61] : [0, 0.31];

    offsets.forEach((off, idx) => {
      const t = now + off;
      const amp = (locked ? 1.15 : 0.9) * (1 - idx * 0.08);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const baseFreq = locked ? 115 + Math.random() * 14 : 152 + Math.random() * 18;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.44, t + 0.09);
      const ug = ctx.createGain();
      ug.gain.setValueAtTime(0.0001, t);
      ug.gain.linearRampToValueAtTime(0.32 * amp, t + 0.005);
      ug.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(ug);
      ug.connect(bus);
      osc.start(t);
      osc.stop(t + 0.125);

      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(locked ? 76 : 96, t);
      sub.frequency.exponentialRampToValueAtTime(42, t + 0.085);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.linearRampToValueAtTime(0.24 * amp, t + 0.004);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      sub.connect(sg);
      sg.connect(bus);
      sub.start(t);
      sub.stop(t + 0.115);

      if (this.noiseBuffer) {
        const ns = ctx.createBufferSource();
        ns.buffer = this.noiseBuffer;
        const nf = ctx.createBiquadFilter();
        nf.type = 'lowpass';
        nf.frequency.value = locked ? 340 : 450;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.linearRampToValueAtTime(0.24 * amp, t + 0.004);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);
        ns.connect(nf);
        nf.connect(ng);
        ng.connect(bus);
        ns.start(t);
        ns.stop(t + 0.11);
      }
    });

    if (this.stingerBuffer && Math.random() < 0.35) {
      const st = ctx.createBufferSource();
      st.buffer = this.stingerBuffer;
      const sg = ctx.createGain();
      sg.gain.value = 0.16;
      st.connect(sg);
      sg.connect(this.masterGain);
      st.start(now + 0.08);
    }
  }

  playHeartbeatPulse(intensity = 0.6): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const amp = Math.max(0.08, Math.min(0.45, intensity * 0.36));

    // Dual lub-dub pulse
    for (const [offset, startHz, endHz, gainMul] of [
      [0, 62, 34, 1.0],
      [0.2, 54, 30, 0.72],
    ] as const) {
      const t = now + offset;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startHz, t);
      osc.frequency.exponentialRampToValueAtTime(endHz, t + 0.13);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp * gainMul, t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 0.18);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  playWaterDrip(pan = 0, intensity = 0.6): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bus = this.createSpatialBus(pan, 2.2);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const base = 760 + Math.random() * 240;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.75, now + 0.045);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.14 * intensity, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.12);

    osc.connect(g);
    g.connect(bus);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playLampBuzz(pan = 0): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bus = this.createSpatialBus(pan, 3.0);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 120;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 640;
    filter.Q.value = 3.2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.05, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.24);

    osc.connect(filter);
    filter.connect(g);
    g.connect(bus);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playPaperRustle(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2100, now);
    filter.frequency.linearRampToValueAtTime(3100, now + 0.14);
    filter.Q.value = 1.4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.022);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.19);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now, Math.random() * 0.9, 0.22);
  }

  playHeartbeat(): void {
    if (!this.ctx || !this.masterGain || !this.heartbeatBuffer || this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.heartbeatBuffer;
    const g = this.ctx.createGain();
    g.gain.value = 0.28;
    src.connect(g);
    g.connect(this.masterGain);
    src.start(this.ctx.currentTime);
  }

  playHeavyDoorRattle(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.09;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 280 - i * 40;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.22 - i * 0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      src.start(t);
      src.stop(t + 0.18);
    }
  }

  playMetalClink(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [590, 880, 1290].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq + Math.random() * 25;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now + idx * 0.03);
      g.gain.linearRampToValueAtTime(0.055 / (idx + 1), now + idx * 0.03 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0005, now + idx * 0.03 + 0.24);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + idx * 0.03);
      osc.stop(now + idx * 0.03 + 0.26);
    });
  }

  playWoodNudge(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 240;
    f.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.15, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    src.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.2);
  }

  playFlashlightClick(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1850;
    f.Q.value = 2.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    src.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.036);
  }

  playServiceBell(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3200;
      f.Q.value = 2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.16, now + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      src.connect(f);
      f.connect(g);
      g.connect(this.masterGain);
      src.start(now);
      src.stop(now + 0.03);
    }
    for (const [freq, amp, dur] of [
      [1560, 0.22, 1.85],
      [2940, 0.11, 1.35],
      [4380, 0.055, 0.85],
    ]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + dur + 0.04);
    }
  }

  playKeyPickup(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [2480, 3360, 4180].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq + Math.random() * 140, now + idx * 0.036);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0005, now + idx * 0.036);
      g.gain.linearRampToValueAtTime(0.095 / (idx + 1), now + idx * 0.036 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0003, now + idx * 0.036 + 0.24);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + idx * 0.036);
      osc.stop(now + idx * 0.036 + 0.26);
    });
  }

  playDoorUnlock(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    // Tumbler click followed by heavy deadbolt slide
    [0, 0.095].forEach((off, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + off;
      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = idx === 0 ? 1950 : 720;
        f.Q.value = 3.2;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(idx === 0 ? 0.22 : 0.28, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
        src.connect(f);
        f.connect(g);
        g.connect(this.masterGain);
        src.start(t);
        src.stop(t + 0.11);
      }
      const clink = this.ctx.createOscillator();
      clink.type = 'sine';
      clink.frequency.setValueAtTime(idx === 0 ? 940 : 410, t);
      clink.frequency.exponentialRampToValueAtTime(idx === 0 ? 520 : 180, t + 0.07);
      const cg = this.ctx.createGain();
      cg.gain.setValueAtTime(0.001, t);
      cg.gain.linearRampToValueAtTime(0.14, t + 0.003);
      cg.gain.exponentialRampToValueAtTime(0.0004, t + 0.08);
      clink.connect(cg);
      cg.connect(this.masterGain);
      clink.start(t);
      clink.stop(t + 0.09);
    });
  }

  playPistolShot(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Punchy chamber thump
    const thump = ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(195 + Math.random() * 20, now);
    thump.frequency.exponentialRampToValueAtTime(38, now + 0.11);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.001, now);
    tg.gain.linearRampToValueAtTime(0.55, now + 0.004);
    tg.gain.exponentialRampToValueAtTime(0.0005, now + 0.14);
    thump.connect(tg);
    tg.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.16);

    // 2. High-energy propellant crack + indoor hallway echo tail
    if (this.noiseBuffer) {
      const crack = ctx.createBufferSource();
      crack.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, now);
      bp.frequency.exponentialRampToValueAtTime(540, now + 0.18);
      bp.Q.value = 0.85;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.001, now);
      cg.gain.linearRampToValueAtTime(0.68, now + 0.003);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      crack.connect(bp);
      bp.connect(cg);
      cg.connect(this.masterGain);
      crack.start(now, Math.random() * 0.5, 0.28);

      // Corridor reverberant tail (stronger indoors)
      const tailDur = 0.35 + this.indoorBlend * 0.55;
      const tail = ctx.createBufferSource();
      tail.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1400, now + 0.02);
      lp.frequency.exponentialRampToValueAtTime(260, now + tailDur);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.001, now + 0.02);
      rg.gain.linearRampToValueAtTime(0.14 + this.indoorBlend * 0.14, now + 0.05);
      rg.gain.exponentialRampToValueAtTime(0.0005, now + tailDur);
      tail.connect(lp);
      lp.connect(rg);
      rg.connect(this.masterGain);
      tail.start(now + 0.02, Math.random() * 0.6, tailDur + 0.05);
    }

    // 3. Crisp metallic slide clack
    const clack = ctx.createOscillator();
    clack.type = 'sine';
    clack.frequency.setValueAtTime(3100, now + 0.02);
    clack.frequency.exponentialRampToValueAtTime(1400, now + 0.06);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.0005, now + 0.02);
    kg.gain.linearRampToValueAtTime(0.09, now + 0.024);
    kg.gain.exponentialRampToValueAtTime(0.0004, now + 0.075);
    clack.connect(kg);
    kg.connect(this.masterGain);
    clack.start(now + 0.02);
    clack.stop(now + 0.085);
  }

  playPistolEmpty(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1420, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.025);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.032);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playPistolReload(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const steps: [number, number, number][] = [
      [0.08, 1250, 0.1], // Mag release
      [0.44, 780, 0.14], // Mag seated
      [0.78, 1680, 0.13], // Slide pull
      [0.92, 2240, 0.15], // Slide snap forward
    ];
    for (const [offset, freq, amp] of steps) {
      const t = now + offset;
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = freq;
        f.Q.value = 3.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
        src.connect(f);
        f.connect(g);
        g.connect(this.masterGain);
        src.start(t, Math.random() * 0.7, 0.09);
      }
    }
  }

  playPistolEquip(equipped: boolean): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = equipped ? 1480 : 960;
    f.Q.value = 2.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.09);
    src.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    src.start(now, Math.random() * 0.5, 0.11);
  }

  playBulletImpact(pan = 0, dist = 2, metallic = false): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bus = this.createSpatialBus(pan, dist);

    if (metallic) {
      const ricochet = ctx.createOscillator();
      ricochet.type = 'sine';
      const f0 = 2400 + Math.random() * 700;
      ricochet.frequency.setValueAtTime(f0, now);
      ricochet.frequency.exponentialRampToValueAtTime(f0 * 0.42, now + 0.18);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.001, now);
      rg.gain.linearRampToValueAtTime(0.18, now + 0.004);
      rg.gain.exponentialRampToValueAtTime(0.0004, now + 0.2);
      ricochet.connect(rg);
      rg.connect(bus);
      ricochet.start(now);
      ricochet.stop(now + 0.22);
    } else if (this.noiseBuffer) {
      const thud = ctx.createBufferSource();
      thud.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 920 + Math.random() * 320;
      f.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0004, now + 0.09);
      thud.connect(f);
      f.connect(g);
      g.connect(bus);
      thud.start(now, Math.random() * 0.7, 0.1);
    }
  }

  getIndoorBlend(): number {
    return this.indoorBlend;
  }

  playDrawerSlide(open: boolean, metallic = false): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      const startFreq = metallic ? (open ? 920 : 1250) : open ? 380 : 480;
      const endFreq = metallic ? (open ? 1480 : 760) : open ? 560 : 300;
      bp.frequency.setValueAtTime(startFreq, now);
      bp.frequency.linearRampToValueAtTime(endFreq, now + 0.24);
      bp.Q.value = metallic ? 2.8 : 1.7;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(metallic ? 0.16 : 0.2, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0005, now + 0.27);

      src.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      src.start(now, Math.random() * 0.6, 0.3);
    }

    // Stop-block clack at end of travel
    const clack = ctx.createOscillator();
    clack.type = metallic ? 'triangle' : 'sine';
    const clackT = now + (open ? 0.21 : 0.19);
    clack.frequency.setValueAtTime(metallic ? 540 : 165, clackT);
    clack.frequency.exponentialRampToValueAtTime(metallic ? 210 : 68, clackT + 0.06);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.001, clackT);
    cg.gain.linearRampToValueAtTime(metallic ? 0.1 : 0.14, clackT + 0.005);
    cg.gain.exponentialRampToValueAtTime(0.0004, clackT + 0.075);
    clack.connect(cg);
    cg.connect(this.masterGain);
    clack.start(clackT);
    clack.stop(clackT + 0.085);
  }

  playCabinetDoor(enter: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.doorCreakBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.doorCreakBuffer;
      src.playbackRate.value = enter ? 1.18 : 1.02;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.38);
      src.connect(g);
      g.connect(this.masterGain);
      src.start(now, 0.05, 0.4);
    }

    // Soft wooden latch click when shutting from inside or opening
    const latchT = now + (enter ? 0.28 : 0.02);
    if (this.noiseBuffer) {
      const ns = ctx.createBufferSource();
      ns.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 640;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, latchT);
      ng.gain.linearRampToValueAtTime(0.16, latchT + 0.006);
      ng.gain.exponentialRampToValueAtTime(0.0005, latchT + 0.08);
      ns.connect(lp);
      lp.connect(ng);
      ng.connect(this.masterGain);
      ns.start(latchT, Math.random() * 0.5, 0.1);
    }
  }

  playItemPickup(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.noiseBuffer) {
      const ns = ctx.createBufferSource();
      ns.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1750;
      bp.Q.value = 1.6;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, now);
      ng.gain.linearRampToValueAtTime(0.14, now + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.0005, now + 0.09);
      ns.connect(bp);
      bp.connect(ng);
      ng.connect(this.masterGain);
      ns.start(now, Math.random() * 0.7, 0.11);
    }

    [660, 990].forEach((freq, idx) => {
      const t = now + idx * 0.045;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.065, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 0.14);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  playUseMedical(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.noiseBuffer) {
      const ns = ctx.createBufferSource();
      ns.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'bandpass';
      lp.frequency.setValueAtTime(980, now);
      lp.frequency.linearRampToValueAtTime(520, now + 0.25);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, now);
      ng.gain.linearRampToValueAtTime(0.14, now + 0.03);
      ng.gain.exponentialRampToValueAtTime(0.0005, now + 0.28);
      ns.connect(lp);
      lp.connect(ng);
      ng.connect(this.masterGain);
      ns.start(now, Math.random() * 0.5, 0.3);
    }

    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(340, now + 0.06);
    tone.frequency.exponentialRampToValueAtTime(460, now + 0.28);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.001, now + 0.06);
    tg.gain.linearRampToValueAtTime(0.055, now + 0.12);
    tg.gain.exponentialRampToValueAtTime(0.0004, now + 0.36);
    tone.connect(tg);
    tg.connect(this.masterGain);
    tone.start(now + 0.06);
    tone.stop(now + 0.38);
  }

  playCrouchToggle(crouched: boolean): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const ns = ctx.createBufferSource();
    ns.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(crouched ? 720 : 520, now);
    f.frequency.linearRampToValueAtTime(crouched ? 420 : 840, now + 0.12);
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.14);
    ns.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    ns.start(now, Math.random() * 0.6, 0.16);
  }

  dispose(): void {
    for (const v of this.activeDoorVoices.values()) {
      v.stop(0.01);
    }
    this.activeDoorVoices.clear();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.doorCreakBuffer = null;
    this.doorLoadStarted = false;
    this.unlocked = false;
  }
}
