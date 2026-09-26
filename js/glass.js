// The eyeglass: Lanthorn seen from the gallery of Nell's lighthouse, at whatever hour the wheel is set to.
import { render, environment, dither, HOME } from './world.js';
import { state, save } from './store.js';
import * as audio from './audio.js';

const FOV = 24;           // degrees across the lens
const PITCH = [-9, 14];   // how far you can tilt it down and up
const DIGITS = 20;        // levels a colour channel, for the old-photograph grain

export function createGlass({ lens, ring, dial, wheel, wrap, drums, hint }) {
  const ctx = lens.getContext('2d');
  const rctx = ring.getContext('2d');
  const dctx = dial.getContext('2d');
  let res = 232;
  let img = null;
  let running = false, raf = 0;
  let lensPx = 320;
  let last = 0, lastRender = 0, dirty = true;
  let vel = 0, velP = 0, dragging = false;
  let env = null;
  let shownHeading = -1, shownHours = -1;
  let moved = false, turned = false;
  const t0 = performance.now();

  function size() {
    const w = window.innerWidth, h = window.innerHeight;
    lensPx = Math.max(200, Math.min(w - 84, h - 310, 500));
    wrap.style.setProperty('--lens', lensPx + 'px');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rs = lensPx + 64;
    ring.width = ring.height = Math.round(rs * dpr);
    const dw = wheel.clientWidth || 260, dh = wheel.clientHeight || 72;
    dial.width = Math.round(dw * dpr); dial.height = Math.round(dh * dpr);
    setRes(res);
    shownHeading = -1; shownHours = -1; dirty = true;
  }

  function setRes(r) {
    res = Math.round(r / 2) * 2;
    lens.width = lens.height = res;
    img = ctx.createImageData(res, res);
  }

  const view = () => ({ x: HOME.x, y: HOME.y, eye: HOME.eye, heading: state.heading, pitch: state.pitch, fov: FOV, W: res, H: res });

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (!dragging && (Math.abs(vel) > 0.02 || Math.abs(velP) > 0.02)) {
      turn(vel * dt, velP * dt);
      const k = Math.pow(0.02, dt);
      vel *= k; velP *= k;
    }
    // The sea moves on its own, so draw at a steady 30 frames a second, sooner after a drag.
    if (!dirty && now - lastRender < 33) return;
    dirty = false;
    lastRender = now;
    const clock = (now - t0) / 1000;
    env = environment(state.hours, clock, state.keeper);
    const s = performance.now();
    render(img.data, view(), env, { circle: true, railing: true });
    dither(img.data, res, res, DIGITS);
    ctx.putImageData(img, 0, 0);
    const took = performance.now() - s;
    // Keep it smooth on slow phones: fewer pixels if a frame takes too long, more if there's time to spare.
    if (took > 26 && res > 150) setRes(res * 0.88);
    else if (took < 9 && res < 300) setRes(res * 1.06);
    if (Math.round(state.heading) !== shownHeading) drawReadout();
    if (Math.abs(state.hours - shownHours) > 0.001) drawDial();
    audio.setNight(env.starVis);
  }

  function turn(dh, dp) {
    state.heading = ((state.heading + dh) % 360 + 360) % 360;
    state.pitch = Math.max(PITCH[0], Math.min(PITCH[1], state.pitch + dp));
    dirty = true;
  }

  function drawReadout() {
    const h = Math.round(state.heading) % 360;
    shownHeading = Math.round(state.heading);
    const s = String(h).padStart(3, '0');
    drums.forEach((d, i) => { d.textContent = s[i]; });
    wrap.dataset.heading = h;
    drawRing();
  }

  // The compass ring round the lens turns as you do. The mark at the top is where you're facing.
  function drawRing() {
    const W = ring.width, dpr = W / (lensPx + 64);
    const c = W / 2;
    const R = c - 2 * dpr, r0 = (lensPx / 2 + 10) * dpr;
    rctx.clearRect(0, 0, W, W);
    const g = rctx.createConicGradient ? rctx.createConicGradient(-Math.PI / 2, c, c) : null;
    if (g) {
      ['#6b4e1f', '#e8c77a', '#8a6427', '#f5dc95', '#5f451a', '#d9b263', '#7d5a22', '#f0d38c', '#6b4e1f'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
    }
    rctx.beginPath(); rctx.arc(c, c, R, 0, Math.PI * 2); rctx.arc(c, c, r0 - 2 * dpr, 0, Math.PI * 2, true);
    rctx.fillStyle = g || '#b08a44'; rctx.fill();
    rctx.lineWidth = 1.5 * dpr; rctx.strokeStyle = 'rgba(50,32,8,.7)';
    rctx.beginPath(); rctx.arc(c, c, R - 0.5 * dpr, 0, Math.PI * 2); rctx.stroke();
    rctx.strokeStyle = 'rgba(40,26,8,.85)';
    rctx.fillStyle = 'rgba(40,26,8,.92)';
    rctx.font = `600 ${Math.round(12 * dpr)}px "Cormorant Garamond", serif`;
    rctx.textAlign = 'center'; rctx.textBaseline = 'middle';
    const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let b = 0; b < 360; b += 5) {
      const a = (b - state.heading) * Math.PI / 180;
      const sin = Math.sin(a), cos = Math.cos(a);
      const len = b % 30 === 0 ? 7 : b % 10 === 0 ? 5 : 3;
      rctx.lineWidth = (b % 10 === 0 ? 1.1 : 0.7) * dpr;
      rctx.beginPath();
      rctx.moveTo(c + sin * r0, c - cos * r0);
      rctx.lineTo(c + sin * (r0 + len * dpr), c - cos * (r0 + len * dpr));
      rctx.stroke();
      if (b % 30 === 0) {
        const tr = r0 + 15 * dpr;
        rctx.save();
        rctx.translate(c + sin * tr, c - cos * tr);
        rctx.rotate(a);
        rctx.fillText(labels[b] || String(b), 0, 0);
        rctx.restore();
      }
    }
    // The fixed mark at the top.
    rctx.fillStyle = '#f4e3b5';
    rctx.beginPath();
    rctx.moveTo(c - 5 * dpr, c - R + 1 * dpr); rctx.lineTo(c + 5 * dpr, c - R + 1 * dpr); rctx.lineTo(c, c - r0 + 4 * dpr); rctx.closePath();
    rctx.fill();
  }

  // The hour wheel: the sun (or the lamp star, opposite it) crossing an arch of Lanthorn's sky.
  function drawDial() {
    shownHours = state.hours;
    const W = dial.width, H = dial.height, dpr = W / (wheel.clientWidth || 260);
    const e = env || environment(state.hours, 0, state.keeper);
    dctx.clearRect(0, 0, W, H);
    const cx = W / 2, base = H - 16 * dpr;
    const rx = W / 2 - 10 * dpr, ry = base - 6 * dpr;
    // The window.
    dctx.save();
    dctx.beginPath();
    dctx.ellipse(cx, base, rx, ry, 0, Math.PI, 0);
    dctx.closePath();
    const sky = dctx.createLinearGradient(0, base - ry, 0, base);
    sky.addColorStop(0, `rgb(${e.zen.map(Math.round)})`);
    sky.addColorStop(1, `rgb(${e.hor.map(Math.round)})`);
    dctx.fillStyle = sky; dctx.fill();
    dctx.clip();
    if (e.starVis > 0.05) {
      dctx.fillStyle = `rgba(255,248,230,${e.starVis * 0.8})`;
      for (let i = 0; i < 26; i++) {
        const x = cx + Math.sin(i * 12.9898) * rx * 0.95, y = base - Math.abs(Math.cos(i * 78.233)) * ry * 0.95;
        dctx.fillRect(x, y, dpr, dpr);
      }
    }
    const phi = (state.hours - 12) * 15 * Math.PI / 180;
    const sx = cx + Math.sin(phi) * rx * 0.8, sy = base - Math.cos(phi) * ry * 0.82;
    const glow = dctx.createRadialGradient(sx, sy, 0, sx, sy, 16 * dpr);
    glow.addColorStop(0, 'rgba(255,236,190,.95)'); glow.addColorStop(0.35, 'rgba(255,214,140,.5)'); glow.addColorStop(1, 'rgba(255,200,120,0)');
    dctx.fillStyle = glow; dctx.beginPath(); dctx.arc(sx, sy, 16 * dpr, 0, Math.PI * 2); dctx.fill();
    dctx.fillStyle = '#fff4d8'; dctx.beginPath(); dctx.arc(sx, sy, 5.5 * dpr, 0, Math.PI * 2); dctx.fill();
    const mx = cx - Math.sin(phi) * rx * 0.8, my = base + Math.cos(phi) * ry * 0.82;
    dctx.strokeStyle = '#fff7e6'; dctx.lineWidth = 1.4 * dpr;
    dctx.beginPath();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; const l = (k % 2 ? 4 : 7) * dpr; dctx.moveTo(mx - Math.cos(a) * l, my - Math.sin(a) * l); dctx.lineTo(mx + Math.cos(a) * l, my + Math.sin(a) * l); }
    dctx.stroke();
    dctx.restore();
    // Brass frame, and the horizon bar with its knurled edge that rolls as you turn the wheel.
    const brass = dctx.createLinearGradient(0, 0, 0, H);
    brass.addColorStop(0, '#f0d596'); brass.addColorStop(0.5, '#b88a3e'); brass.addColorStop(1, '#6e4d1c');
    dctx.lineWidth = 4 * dpr; dctx.strokeStyle = brass;
    dctx.beginPath(); dctx.ellipse(cx, base, rx, ry, 0, Math.PI, 0); dctx.stroke();
    dctx.fillStyle = brass;
    dctx.fillRect(4 * dpr, base - 1 * dpr, W - 8 * dpr, 14 * dpr);
    dctx.strokeStyle = 'rgba(50,32,8,.55)'; dctx.lineWidth = 1 * dpr;
    const step = 6 * dpr, off = ((state.hours * 18 * dpr) % step + step) % step;
    dctx.beginPath();
    for (let x = 6 * dpr + off; x < W - 6 * dpr; x += step) { dctx.moveTo(x, base + 2 * dpr); dctx.lineTo(x, base + 11 * dpr); }
    dctx.stroke();
    wheel.setAttribute('aria-valuenow', state.hours.toFixed(1));
    wheel.setAttribute('aria-valuetext', hourWords(state.hours));
  }

  // ---------- input ----------

  let px = 0, py = 0, lastMove = 0;
  lens.addEventListener('pointerdown', e => {
    dragging = true; vel = velP = 0;
    px = e.clientX; py = e.clientY; lastMove = performance.now();
    lens.setPointerCapture(e.pointerId);
  });
  lens.addEventListener('pointermove', e => {
    if (!dragging) return;
    const ppd = lensPx / FOV;
    const dx = e.clientX - px, dy = e.clientY - py;
    px = e.clientX; py = e.clientY;
    const now = performance.now(), dt = Math.max(0.008, (now - lastMove) / 1000);
    lastMove = now;
    turn(-dx / ppd, dy / ppd);
    vel = vel * 0.6 + (-dx / ppd / dt) * 0.4;
    velP = velP * 0.6 + (dy / ppd / dt) * 0.4;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 2) { moved = true; hideHint(); }
  });
  const up = () => {
    if (!dragging) return;
    dragging = false;
    if (performance.now() - lastMove > 90) vel = velP = 0;
    save();
  };
  lens.addEventListener('pointerup', up);
  lens.addEventListener('pointercancel', up);
  lens.addEventListener('keydown', e => {
    const big = e.shiftKey ? 5 : 1;
    const k = { ArrowLeft: [-big, 0], ArrowRight: [big, 0], ArrowUp: [0, big], ArrowDown: [0, -big] }[e.key];
    if (!k) return;
    e.preventDefault(); turn(k[0], k[1]); save();
  });

  let wx = 0, wheelDrag = false;
  wheel.addEventListener('pointerdown', e => { wheelDrag = true; wx = e.clientX; wheel.setPointerCapture(e.pointerId); });
  wheel.addEventListener('pointermove', e => {
    if (!wheelDrag) return;
    const dx = e.clientX - wx; wx = e.clientX;
    setHours(state.hours + dx / 34);
  });
  const wheelUp = () => { if (wheelDrag) { wheelDrag = false; save(); } };
  wheel.addEventListener('pointerup', wheelUp);
  wheel.addEventListener('pointercancel', wheelUp);
  wheel.addEventListener('keydown', e => {
    const k = { ArrowLeft: -0.25, ArrowDown: -0.25, ArrowRight: 0.25, ArrowUp: 0.25, PageUp: 2, PageDown: -2 }[e.key];
    if (k === undefined) return;
    e.preventDefault(); setHours(state.hours + k); save();
  });

  function setHours(h) {
    const before = Math.floor(state.hours * 2);
    state.hours = ((h % 24) + 24) % 24;
    if (Math.floor(state.hours * 2) !== before) audio.click();
    dirty = true;
    if (!turned) { turned = true; hideHint(); }
  }

  function hideHint() { if (moved && turned) hint.style.opacity = '0'; }

  window.addEventListener('resize', () => { if (running) size(); });

  return {
    start(at) {
      if (at) Object.assign(state, at);
      running = true;
      hint.style.opacity = moved && turned ? '0' : '1';
      size();
      drawReadout();
      document.fonts?.ready.then(() => { shownHeading = -1; dirty = true; });
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); save(); },
    get env() { return env; },
    get res() { return res; },
  };
}

export function hourWords(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 15) * 15;
  const part = h < 5 || h >= 21 ? 'night' : h < 7 ? 'dawn' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 19.2 ? 'evening' : 'dusk';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}, ${part}`;
}
