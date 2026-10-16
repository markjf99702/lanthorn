// The second book: a clasp of brass studs on the cover, then a dark picture that wakes for anyone who can answer the light.
import { render, environment, dither, FAR, LAMPBEARER, isLampbearer } from './world.js';
import { state, save } from './store.js';
import * as audio from './audio.js';

// The clasp is a 5 x 5 patch of sky with the corners left off. Rows count up from the bottom.
const SIZE = 5;
const CELLS = [];
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const corner = (x === 0 || x === SIZE - 1) && (y === 0 || y === SIZE - 1);
  if (!corner) CELLS.push([x, y]);
}

// Seconds: a press shorter than this is a short flash. It sits where two kinds of player do about as well as each
// other: someone copying the light (BEAT in world.js), who holds a short flash a quarter too long or more, and someone
// who taps for a short flash and gives a long one a quick hold of about three-quarters of a second. In the game lab's
// player models each answers the light's hardest pattern first time about 80% of the time here; at 0.36 s the copier
// got 34%, and at 0.525 s the quick holder got 61%.
export const SHORT_MAX = 0.45;

// When a press began or ended: the input event's own time, not when the page got round to it, so a slow frame
// can't make a press look shorter or longer than it was. Without an event, or if the browser's event times
// aren't on the page's clock, it's now.
export function pressTime(e) {
  const now = performance.now();
  return e && e.timeStamp > 0 && Math.abs(now - e.timeStamp) < 10000 ? e.timeStamp : now;
}

export function createBook(els, { onOpen, onWake, onLink }) {
  const { clasp, panel, marks, hint } = els;
  const pctx = panel.getContext('2d');
  const PW = 240, PH = 180;
  panel.width = PW; panel.height = PH;
  const img = pctx.createImageData(PW, PH);
  let running = false, raf = 0, lastDraw = 0;
  const t0 = performance.now();

  // ---------- the clasp ----------
  const studs = CELLS.map(([x, y]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stud';
    b.dataset.x = x; b.dataset.y = y;
    // 48% of the plate, centred.
    b.style.left = (26 + x * 12) + '%';
    b.style.top = (74 - y * 12) + '%';
    b.setAttribute('aria-label', `Stud ${x + 1} across, ${y + 1} up`);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => toggle(b));
    clasp.append(b);
    return b;
  });
  let checking = 0;

  function pressedCells() {
    return studs.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => [+b.dataset.x, +b.dataset.y]);
  }

  function syncStuds() {
    const set = new Set(state.studs.map(([x, y]) => x + ',' + y));
    for (const b of studs) b.setAttribute('aria-pressed', set.has(b.dataset.x + ',' + b.dataset.y) ? 'true' : 'false');
  }

  function toggle(b) {
    if (state.claspOpen || checking) return;
    const down = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', down ? 'true' : 'false');
    audio.stud(down);
    state.studs = pressedCells();
    save();
    if (state.studs.length === LAMPBEARER.length) {
      checking = setTimeout(() => {
        checking = 0;
        if (isLampbearer(state.studs)) {
          state.claspOpen = true; save();
          audio.unlock();
          clasp.classList.add('open');
          setTimeout(onOpen, 1150);
        } else {
          audio.thunk();
          clasp.classList.add('wrong');
          // The plate stays locked until the studs have popped out, so a press now isn't thrown away with them.
          checking = setTimeout(() => {
            checking = 0;
            clasp.classList.remove('wrong');
            state.studs = []; save(); syncStuds();
            audio.stud(false);
          }, 650);
        }
      }, 450);
    }
  }

  // ---------- the picture ----------
  let seq = [];
  let pressAt = 0, pressing = false, evalTimer = 0;

  function showMarks() {
    marks.classList.remove('fade');
    marks.textContent = seq.map(c => (c === 'L' ? '—' : '·')).join(' ');
  }

  function down(e) {
    if (e && e.button > 0) return;
    if (state.awake) return;
    if (pressing) return;
    pressing = true; pressAt = pressTime(e);
    clearTimeout(evalTimer);
    audio.pressStart();
    if (e && e.pointerId !== undefined) panel.setPointerCapture(e.pointerId);
  }

  function up(e) {
    if (state.awake) return;
    if (!pressing) return;
    pressing = false;
    audio.pressEnd();
    const dur = (pressTime(e) - pressAt) / 1000;
    seq.push(dur < SHORT_MAX ? 'S' : 'L');
    if (seq.length > 12) seq.shift();
    showMarks();
    evalTimer = setTimeout(evaluate, 1600);
  }

  function evaluate() {
    if (seq.join('') === state.keeper) {
      state.awake = true; save();
      audio.wakeChord();
      hint.textContent = 'Touch the picture.';
      marks.classList.add('fade');
      onWake();
    } else {
      audio.thunk();
      seq = [];
      marks.classList.add('fade');
      setTimeout(() => { if (!seq.length) marks.textContent = ''; }, 800);
    }
  }

  panel.addEventListener('pointerdown', e => { if (state.awake) return; e.preventDefault(); down(e); });
  panel.addEventListener('pointerup', up);
  panel.addEventListener('pointercancel', up);
  panel.addEventListener('click', () => { if (state.awake) onLink(); });
  panel.addEventListener('contextmenu', e => e.preventDefault());
  panel.addEventListener('keydown', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (state.awake) { if (!e.repeat) onLink(); return; }
    if (!e.repeat) down(e);
  });
  panel.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') up(e); });

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now - lastDraw < 40) return;
    lastDraw = now;
    const t = (now - t0) / 1000;
    if (state.awake) flyby(t); else dark(t);
  }

  // Asleep: black, with a faint grain, lit from within while you press.
  function dark(t) {
    const d = img.data;
    const held = pressing ? Math.min(1, (performance.now() - pressAt) / 120) : 0;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const i = (y * PW + x) * 4;
      const n = Math.random() * 10;
      const dx = (x - PW / 2) / PW, dy = (y - PH / 2) / PH;
      const g = held * Math.exp(-(dx * dx + dy * dy) * 7) * 210;
      d[i] = n + g; d[i + 1] = n * 0.95 + g * 0.8; d[i + 2] = n * 0.9 + g * 0.5; d[i + 3] = 255;
    }
    pctx.putImageData(img, 0, 0);
  }

  // Awake: flying low over the water towards the far rock at dusk, its light going, over and over.
  function flyby(t) {
    const LOOP = 15;
    const s = (t % LOOP) / LOOP;
    const ease = s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
    const dist = 560 - 430 * ease;
    const from = 205 * Math.PI / 180;
    const x = FAR.x + Math.sin(from) * dist, y = FAR.y + Math.cos(from) * dist;
    const heading = Math.atan2(FAR.x - x, FAR.y - y) * 180 / Math.PI + Math.sin(t * 0.4) * 1.5;
    const env = environment(18.8, t, state.keeper);
    render(img.data, { x, y, eye: 13 + Math.sin(t * 0.7) * 0.6, heading, pitch: 1.5, fov: 44, W: PW, H: PH }, env, {});
    dither(img.data, PW, PH, 14);
    // Fade to black at the ends of the loop.
    const f = Math.min(1, s / 0.06, (1 - s) / 0.06);
    if (f < 1) { const d = img.data; for (let i = 0; i < d.length; i += 4) { d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; } }
    pctx.putImageData(img, 0, 0);
  }

  return {
    sync() {
      syncStuds();
      clasp.classList.remove('open', 'wrong');
      seq = []; marks.textContent = '';
      hint.textContent = state.awake ? 'Touch the picture.' : 'Tap for a short flash. Hold for a long one.';
      panel.setAttribute('aria-label', state.awake
        ? 'The linking picture, awake: flying low over the sea towards the far rock at dusk, its light flashing. Touch it to go.'
        : 'The linking picture. It’s dark. Tap for a short flash, hold for a long one.');
    },
    start() { running = true; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); if (pressing) { pressing = false; audio.pressEnd(); } },
  };
}
