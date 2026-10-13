// The far rock: the lamp room, Nell's lighthouse dark across the water, and the shutter.
import { render, environment, dither, FAR, HOME } from './world.js';
import * as audio from './audio.js';
import { SHORT_MAX, pressTime } from './book.js';

const HOURS = 20.1;
const TOWARDS_HOME = (Math.atan2(HOME.x - FAR.x, HOME.y - FAR.y) * 180 / Math.PI + 360) % 360;

export function createFar(els, { onPage, onDone }) {
  const { canvas, warm, lever, page, text } = els;
  const ctx = canvas.getContext('2d');
  const room = canvas.closest('.screen');
  let W = 200, H = 400, img = null;
  let running = false, raf = 0, lastDraw = 0;
  let beam = 0, open = false, openAt = 0;
  let seq = [], idle = 0, finished = false, glint = 0;
  let stage = 'arrive';
  const t0 = performance.now();

  let scale = 1, resize = false;
  function size() {
    const w = window.innerWidth, h = window.innerHeight;
    W = Math.round(Math.min(340, Math.max(150, w / 1.45)) * scale);
    H = Math.round(W * h / w);
    canvas.width = W; canvas.height = H;
    img = ctx.createImageData(W, H);
  }

  function say(msg) {
    text.classList.add('gone');
    setTimeout(() => { text.textContent = msg; text.classList.remove('gone'); }, msg ? 600 : 0);
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Keep going while her page is open, ready for when it's put down, but there's nothing to draw behind it.
    if (room.hidden) return;
    const target = open ? 1 : 0;
    beam += (target - beam) * (open ? 0.5 : 0.35);
    if (now - lastDraw < 45) return;
    lastDraw = now;
    // Resizing the canvas wipes it, so it only happens straight before the next picture goes in.
    if (resize) { resize = false; size(); }
    const t = (now - t0) / 1000;
    const env = environment(HOURS, t, 'S');
    env.lightOn = false;
    const landscape = W > H;
    const s0 = performance.now();
    render(img.data, { x: FAR.x, y: FAR.y, eye: FAR.eye, heading: TOWARDS_HOME, pitch: landscape ? -2 : -5, fov: landscape ? 56 : 34, W, H }, env, { beam, homeGlint: glint });
    dither(img.data, W, H, 22);
    ctx.putImageData(img, 0, 0);
    // Fewer pixels on a slow phone.
    const took = performance.now() - s0;
    if (took > 40 && scale > 0.55) { scale *= 0.85; resize = true; }
  }

  // ---------- the shutter ----------
  function press(e) {
    if (stage !== 'lamp' || finished) return;
    if (e && e.pointerId !== undefined) lever.setPointerCapture(e.pointerId);
    if (open) return;
    open = true; openAt = pressTime(e);
    clearTimeout(idle);
    lever.classList.add('down');
    warm.classList.add('on');
    audio.shutter(true);
    if (text.textContent) say('');
  }

  function release(e) {
    if (!open) return;
    open = false;
    lever.classList.remove('down');
    warm.classList.remove('on');
    audio.shutter(false);
    const dur = (pressTime(e) - openAt) / 1000;
    seq.push(dur < SHORT_MAX ? 'S' : 'L');
    if (seq.length >= 8) return finish();
    idle = setTimeout(finish, 2600);
  }

  // Whatever you signalled is what the next person will see.
  function finish() {
    if (finished || !seq.length) return;
    finished = true;
    clearTimeout(idle);
    lever.hidden = true;
    const pattern = seq.join('');
    // Across the water, for a moment, something in Nell's gallery catches the light.
    setTimeout(() => {
      let k = 0;
      const id = setInterval(() => { k++; glint = k < 8 ? k / 8 : Math.max(0, 1 - (k - 8) / 14); if (k > 24) { clearInterval(id); glint = 0; } }, 60);
    }, 1400);
    setTimeout(() => onDone(pattern), 5200);
  }

  lever.addEventListener('pointerdown', e => { e.preventDefault(); press(e); });
  lever.addEventListener('pointerup', release);
  lever.addEventListener('pointercancel', release);
  lever.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(e); } });
  lever.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') release(e); });
  lever.addEventListener('contextmenu', e => e.preventDefault());

  page.addEventListener('click', () => onPage());

  window.addEventListener('resize', () => { if (running) { resize = true; lastDraw = 0; } });

  return {
    // Arriving: dark, the lamp out, a page on the ledge.
    arrive() {
      stage = 'arrive'; seq = []; finished = false; glint = 0; open = false; beam = 0;
      page.hidden = true; lever.hidden = true; lever.classList.remove('down'); warm.classList.remove('on');
      text.textContent = '';
      setTimeout(() => { if (stage === 'arrive') say('The lamp is out. Its glass is still warm.'); }, 1800);
      setTimeout(() => { if (stage === 'arrive') { page.hidden = false; page.classList.add('lit'); } }, 5200);
    },
    // Back from reading her page: the shutter.
    lamp() {
      if (stage === 'lamp') return;
      stage = 'lamp';
      page.hidden = false;
      page.classList.remove('lit');
      lever.hidden = false;
      say('Hold the shutter open to show the light. Let it go to close it.');
    },
    start() { running = true; size(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); release(); },
    get stage() { return stage; },
  };
}
