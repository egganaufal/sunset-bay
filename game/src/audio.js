// Sound, all synthesized with WebAudio: no audio files, no network. Engine hum, sirens,
// gunshots, crashes, pickups and a small procedural music loop. Everything starts on the
// first user gesture (browsers block audio before one) and M mutes it.
export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineFilter = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: a sawtooth through a lowpass, pitch follows speed.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle wave whose pitch swings 750-950 Hz on an LFO, like a two-tone siren.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 850;
      const sirenLfo = context.createOscillator();
      sirenLfo.type = 'sine';
      sirenLfo.frequency.value = 1.25;
      const sirenLfoGain = context.createGain();
      sirenLfoGain.gain.value = 100;
      sirenLfo.connect(sirenLfoGain);
      sirenLfoGain.connect(sirenOsc.frequency);
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(frequency, seconds, type, volume, when = 0) {
    if (!context) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  function noiseBurst(seconds, filterFrequency, volume, when = 0) {
    if (!context) return;
    const t = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  }

  // A laid-back 16-step loop: bass notes under a kick and hats, Am – F – C – G.
  const BASS = [110, 0, 110, 0, 87.31, 0, 87.31, 0, 130.81, 0, 130.81, 0, 98, 0, 98, 0];
  function startMusic() {
    if (musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (!context || muted) return;
      const step = musicStep % 16;
      musicStep += 1;
      const t = context.currentTime;
      if (step % 4 === 0) {
        const kick = context.createOscillator();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(120, t);
        kick.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        kick.connect(gain);
        gain.connect(musicGain);
        kick.start(t);
        kick.stop(t + 0.16);
      }
      if (step % 2 === 1) noiseBurst(0.03, 8000, 0.05);
      const note = BASS[step];
      if (note > 0) {
        const osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = note;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(t);
        osc.stop(t + 0.24);
      }
    }, 150);
  }

  return {
    unlock() { ensure(); if (context && context.state === 'suspended') context.resume(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    get muted() { return muted; },
    setEngine(speedRatio, on) {
      if (!context) return;
      const target = on ? 0.05 + speedRatio * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, context.currentTime, 0.05);
    },
    setSiren(on) {
      if (!context) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, context.currentTime, 0.1);
    },
    gunshot() { noiseBurst(0.14, 1800, 0.5); blip(180, 0.08, 'square', 0.25); },
    enemyShot() { noiseBurst(0.1, 1200, 0.18); },
    crash() { noiseBurst(0.25, 500, 0.5); },
    pickup() { blip(880, 0.09, 'sine', 0.3); blip(1320, 0.12, 'sine', 0.3, 0.08); },
    cash() { blip(1046, 0.08, 'sine', 0.3); blip(1318, 0.08, 'sine', 0.3, 0.07); blip(1568, 0.14, 'sine', 0.3, 0.14); },
    horn() { blip(370, 0.25, 'square', 0.2); blip(466, 0.25, 'square', 0.2); },
    click() { blip(660, 0.05, 'sine', 0.2); },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.16, 'triangle', 0.3, i * 0.09));
    },
    hurt() { blip(140, 0.2, 'sawtooth', 0.3); },
  };
}
