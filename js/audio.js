// All the sound, made on the spot with Web Audio: the room, the wind and sea of Lanthorn, the bell buoy,
// and the small noises of brass and paper. Nothing is recorded.

let ctx = null;
let master = null;
let on = true;
let noiseBuf = null;
const beds = {};
let current = 'none';
let bellTimer = 0;
let tickTimer = 0;
let night = 0;

export function soundOn() { return on; }

export function setSound(value) {
  on = value;
  if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.08);
}

// Browsers only allow sound after a tap, so call this from one.
export function wake() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = makeNoise(4);
    build();
    scene(current, true);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const ready = () => ctx && ctx.state === 'running';

function makeNoise(seconds, brown = false) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  // Make the two ends meet, so the loop doesn't thump each time round.
  if (brown) { const n = d.length - 1, step = d[n] - d[0]; for (let i = 0; i <= n; i++) d[i] -= step * i / n; }
  return buf;
}

function loop(buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.loopStart = 0; s.loopEnd = buf.duration;
  s.start(0, Math.random() * buf.duration);
  return s;
}

function lfo(freq, depth, target, offset = 0) {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start(ctx.currentTime + offset);
  return o;
}

// The long-running sounds, each behind its own fader.
function build() {
  const brown = makeNoise(6, true);

  // The room: a low hush.
  {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.12;
    loop(brown).connect(f).connect(g).connect(out);
    beds.room = { out, level: 1 };
  }

  // Lanthorn: wind over the gallery and the sea below.
  const lanthorn = (windLevel, seaLevel) => {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    // Wind: noise through a band that wanders.
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 520; wf.Q.value = 0.9;
    lfo(0.05, 220, wf.frequency); lfo(0.13, 90, wf.frequency, 1.3);
    const wg = ctx.createGain(); wg.gain.value = windLevel;
    lfo(0.07, windLevel * 0.55, wg.gain, 0.6);
    loop(noiseBuf).connect(wf).connect(wg).connect(out);
    // Sea: deep noise that swells and falls back.
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 380;
    lfo(0.09, 160, sf.frequency);
    const sg = ctx.createGain(); sg.gain.value = seaLevel;
    lfo(0.11, seaLevel * 0.8, sg.gain);
    loop(brown).connect(sf).connect(sg).connect(out);
    // After dark: two low notes, not quite in tune with each other.
    const dg = ctx.createGain(); dg.gain.value = 0;
    for (const [f, a] of [[55, 0.5], [55.35, 0.5], [82.7, 0.28], [110.4, 0.12]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = a; o.connect(og).connect(dg); o.start();
    }
    dg.connect(out);
    return { out, level: 1, drone: dg };
  };
  beds.lanthorn = lanthorn(0.085, 0.26);
  beds.far = lanthorn(0.12, 0.28);

  // The lamp, burning: a soft roar.
  {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 180; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.45;
    loop(brown).connect(f).connect(g).connect(out);
    beds.lamp = { out, level: 0 };
  }
}

// Switch which place you can hear. 'room', 'lanthorn', 'far' or 'none'.
export function scene(name, immediate = false) {
  current = name;
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const key of ['room', 'lanthorn', 'far']) {
    const b = beds[key];
    b.out.gain.cancelScheduledValues(t);
    b.out.gain.setTargetAtTime(key === name ? b.level : 0, t, immediate ? 0.05 : 0.9);
  }
  clearTimeout(bellTimer); clearInterval(tickTimer);
  if (name === 'lanthorn' || name === 'far') scheduleBell();
  if (name === 'room') tickTimer = setInterval(tick, 1000);
  setNight(night);
}

// 0 by day, 1 at night: the drone comes in after dark.
export function setNight(k) {
  night = k;
  if (!ctx) return;
  for (const key of ['lanthorn', 'far']) beds[key].drone.gain.setTargetAtTime(k * (key === 'far' ? 0.03 : 0.022), ctx.currentTime, 1.5);
}

// The clock on the landing.
let tock = false;
function tick() {
  if (!ready()) return;
  tock = !tock;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = tock ? 1500 : 1900; f.Q.value = 8;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(f).connect(g).connect(beds.room.out);
  src.start(t, Math.random() * 3, 0.08);
}

function scheduleBell() {
  bellTimer = setTimeout(() => { bell(current === 'far' ? 0.03 : 0.05); scheduleBell(); }, 9000 + Math.random() * 16000);
}

// The bell buoy, heard from a way off.
export function bell(level = 0.05) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1700;
  const out = ctx.createGain(); out.gain.value = level;
  f.connect(out).connect(master);
  const f0 = 311;
  const hits = 1 + (Math.random() < 0.5 ? 1 : 0);
  for (let h = 0; h < hits; h++) {
    const at = t + h * (0.9 + Math.random() * 0.5);
    for (const [ratio, amp, decay] of [[1, 1, 3.4], [2.0, 0.55, 2.2], [2.42, 0.4, 1.8], [3.01, 0.25, 1.3], [4.18, 0.15, 0.9]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(amp, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      o.connect(g).connect(f); o.start(at); o.stop(at + decay + 0.1);
    }
  }
}

function burst(at, dur, freq, q, peak, type = 'bandpass', dest = master) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(at, Math.random() * 3, dur + 0.05);
}

function ping(at, freq, dur, peak, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master); o.start(at); o.stop(at + dur + 0.05);
}

// A brass number wheel clicking round.
export function click() {
  if (!ready()) return;
  const t = ctx.currentTime;
  burst(t, 0.03, 3400, 3, 0.16);
  ping(t, 2900, 0.05, 0.02);
}

// A stud pressed in, or let out.
export function stud(down = true) {
  if (!ready()) return;
  const t = ctx.currentTime;
  burst(t, 0.05, down ? 1800 : 2600, 4, 0.2);
  ping(t, down ? 1320 : 1760, 0.12, 0.025, 'triangle');
}

// Something heavy giving way: a lock or a clasp.
export function unlock() {
  if (!ready()) return;
  const t = ctx.currentTime;
  burst(t, 0.06, 2600, 3, 0.25);
  burst(t + 0.09, 0.25, 180, 1, 0.5, 'lowpass');
  ping(t + 0.09, 92, 0.4, 0.25);
  ping(t + 0.1, 1480, 0.9, 0.035, 'triangle');
  ping(t + 0.11, 2210, 0.7, 0.02, 'triangle');
}

// Nothing happens: the wrong answer.
export function thunk() {
  if (!ready()) return;
  const t = ctx.currentTime;
  burst(t, 0.12, 300, 1.5, 0.3, 'lowpass');
  ping(t, 70, 0.25, 0.2);
}

// A page turning, or a letter unfolding.
export function paper() {
  if (!ready()) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 5; i++) burst(t + i * 0.035 + Math.random() * 0.02, 0.07 + Math.random() * 0.05, 2500 + Math.random() * 3000, 0.8, 0.05 + Math.random() * 0.04, 'highpass');
}

// The linking picture: a held note while you shine into it.
let press = null;
export function pressStart() {
  if (!ready() || press) return;
  const t = ctx.currentTime;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
  const oscs = [440, 660.5, 880.8].map(fr => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
  f.connect(g).connect(master);
  press = { g, oscs };
}
export function pressEnd() {
  if (!press) return;
  const t = ctx.currentTime;
  press.g.gain.cancelScheduledValues(t);
  press.g.gain.setTargetAtTime(0.0001, t, 0.03);
  for (const o of press.oscs) o.stop(t + 0.3);
  press = null;
}

// The picture wakes.
export function wakeChord() {
  if (!ready()) return;
  const t = ctx.currentTime;
  [220, 330.4, 440, 554.9, 660.8].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.04, t + i * 0.12 + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    o.connect(g).connect(master); o.start(t + i * 0.12); o.stop(t + 4.6);
  });
}

// Linking: a rush of air rising, then nothing at all.
export function link() {
  if (!ready()) return;
  const t = ctx.currentTime;
  for (const key of ['room', 'lanthorn', 'far']) beds[key].out.gain.setTargetAtTime(0, t, 0.2);
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
  f.frequency.setValueAtTime(160, t); f.frequency.exponentialRampToValueAtTime(3200, t + 2.2);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 1.6); g.gain.setValueAtTime(0.5, t + 2.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + 2.5);
  [110, 164.8, 220].forEach(fr => {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(fr, t); o.frequency.exponentialRampToValueAtTime(fr * 2, t + 2.2);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.05, t + 1.8); og.gain.exponentialRampToValueAtTime(0.0001, t + 2.35);
    o.connect(og).connect(master); o.start(t); o.stop(t + 2.4);
  });
}

// The lamp's shutter.
export function shutter(open) {
  if (!ready()) return;
  const t = ctx.currentTime;
  burst(t, 0.05, open ? 1200 : 900, 2, 0.3);
  ping(t, open ? 180 : 140, 0.12, 0.12);
  beds.lamp.out.gain.setTargetAtTime(open ? 0.12 : 0, t, open ? 0.02 : 0.06);
}

// For the tests: how loud it is right now, as peak and RMS of the last few milliseconds.
let analyser = null;
export function level() {
  if (!ctx) return null;
  if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 2048; master.connect(analyser); }
  const d = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(d);
  let peak = 0, sum = 0;
  for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  return { peak, rms: Math.sqrt(sum / d.length), state: ctx.state };
}
