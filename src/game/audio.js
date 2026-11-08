/** Lightweight Web Audio synth — initialized only after a user gesture. */
export default class NeonAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    // Engine oscilloscope for engine sound generation
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.rpm = 0;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.master) {
      this.master.gain.value = this.enabled ? 0.55 : 0;
    }
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  tone({ freq = 440, dur = 0.12, type = 'square', gain = 0.12, slide = 0, delay = 0 }) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.18, gain = 0.08, delay = 0 } = {}) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    src.buffer = buf;
    g.gain.setValueAtTime(gain, ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(ctx.currentTime + delay);
  }

  /** Generate continuous engine sound with PWM/sawtooth wave mixing */
  generateEngineSound(speed = 0) {
    if (!this.enabled || !this.ctx) return;
    
    // Initialize engine oscillator chain if not exists
    if (!this.engineOsc || !this.engineGain) {
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
      
      const envGain = this.ctx.createGain();
      envGain.gain.value = 0;
      
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
      
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(60, this.ctx.currentTime);
      
      // Sawtooth -> Lowpass Filter -> Gain -> Destination
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(envGain);
      envGain.connect(this.ctx.destination);
    }
    
    const t = this.ctx.currentTime;
    
    // Base RPM frequency ~60Hz at speed 0, scales to ~200Hz at max speed
    const baseFreq = 50 + (speed / 100) * 80;
    
    // Add harmonics for more complex engine sound
    this.engineOsc.frequency.setValueAtTime(baseFreq, t);
    this.engineOsc.frequency.linearRampToValueAtTime(baseFreq * 2.2, t + 0.5);
    
    // Filter cutoff follows RPM - higher pitch = brighter sound
    const targetFreq = 800 + (speed / 100) * 800;
    this.engineFilter.frequency.linearRampToValueAtTime(targetFreq, t + 0.5);
    
    // Volume scales with speed and adds boost factor
    const volumeBase = 0.035 + (speed / 200) * 0.15;
    const boostFactor = this.boosting ? 2 : 1;
    this.engineGain.gain.setTargetAtTime(volumeBase, t, 0.04);
    
    // Add subtle frequency modulation for realistic engine rumble
    if (speed > 30) {
      const modOsc = this.ctx.createOscillator();
      modOsc.frequency.value = 25 + (speed / 100) * 30;
      modOsc.connect(this.engineGain);
      modOsc.start(t);
    }
    
    // Turbo whine when boost active at high speeds
    if (this.boosting && speed > 60) {
      const turboFreq = 80 + (speed / 50) * 40;
      const turboOsc = this.ctx.createOscillator();
      turboOsc.type = 'square';
      turboOsc.frequency.setValueAtTime(turboFreq, t);
      const turboGain = this.ctx.createGain();
      turboGain.gain.value = 0.015;
      turboGain.gain.setTargetAtTime(0.03, t, 0.1);
      
      // Create a delay effect for layered turbo sound
      const delayNode = this.ctx.createDelay();
      delayNode.delayTime.value = 0.3;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.4;
      
      turboOsc.connect(turboGain);
      turboGain.connect(this.ctx.destination);
      turboGain.connect(delayNode);
      delayNode.connect(feedback);
      feedback.connect(delayNode);
      feedback.connect(this.ctx.destination);
      
      const timeMod = Math.sin((t - this.elapsed) * 40 + speed * 0.5);
      turboOsc.frequency.setValueAtTime(turboFreq, t);
      turboOsc.frequency.linearRampToValueAtTime(turboFreq * 1.2, t + 0.1);
      
      // Turbo sound rises and falls with boost activation/deactivation
      const turboGrowth = this.boosting ? 0.5 : 0;
      turboGain.gain.setTargetAtTime(0.03 + turboGrowth * 0.08, t, Math.max(0.04, 0.1 - speed * 0.001));
    }
  }

  play(name) {
    switch (name) {
      case 'start':
        this.tone({ freq: 220, dur: 0.1, type: 'sawtooth', gain: 0.08, slide: 180 });
        this.tone({ freq: 440, dur: 0.14, type: 'square', gain: 0.07, slide: 220, delay: 0.08 });
        this.tone({ freq: 880, dur: 0.18, type: 'triangle', gain: 0.05, delay: 0.16 });
        break;
      case 'pickup':
        this.tone({ freq: 660, dur: 0.08, type: 'triangle', gain: 0.09, slide: 200 });
        this.tone({ freq: 990, dur: 0.12, type: 'square', gain: 0.06, delay: 0.05 });
        break;
      case 'boost':
        this.tone({ freq: 140, dur: 0.22, type: 'sawtooth', gain: 0.07, slide: 260 });
        this.noise({ dur: 0.12, gain: 0.035 });
        break;
      case 'crash':
        this.noise({ dur: 0.22, gain: 0.12 });
        this.tone({ freq: 180, dur: 0.2, type: 'sawtooth', gain: 0.1, slide: -120 });
        break;
      case 'over':
        this.tone({ freq: 320, dur: 0.18, type: 'triangle', gain: 0.07, slide: -80 });
        this.tone({ freq: 220, dur: 0.28, type: 'sawtooth', gain: 0.06, slide: -100, delay: 0.12 });
        break;
      case 'pass':
        this.noise({ dur: 0.14, gain: 0.04 });
        this.tone({ freq: 380, dur: 0.14, type: 'triangle', gain: 0.03, slide: -160 });
        break;
      default:
        break;
    }
  }

  dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.master = null;
    }
  }
}
