// Lanthorn: the desk, and moving between the things on it.
import { state, save, reset, tidy } from './store.js';
import { FAR_BEARING, caseCatches } from './world.js';
import { INTRO, JOURNAL, LETTER, LAST_PAGE, BOOK_LINE, ENDING, HINTS } from './text.js';
import { SKETCHES } from './sketches.js';
import { applyTextures } from './textures.js';
import { createGlass } from './glass.js';
import { createBook } from './book.js';
import { createFar } from './far.js';
import * as audio from './audio.js';

const $ = id => document.getElementById(id);
const SCREENS = ['intro', 'desk', 'journal', 'glass', 'case', 'letter', 'book', 'far', 'end'];
const SOUND = { intro: 'none', desk: 'room', journal: 'room', case: 'room', letter: 'room', book: 'room', glass: 'lanthorn', far: 'far', end: 'none' };
let current = 'intro';
let backTo = null;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---------- moving about ----------

function show(id, { back = null } = {}) {
  if (current === 'glass') glass.stop();
  if (current === 'book') book.stop();
  if (current === 'far' && id !== 'letter') far.stop();
  for (const s of SCREENS) $(s).hidden = s !== id;
  current = id;
  backTo = back;
  $('back').hidden = !back;
  $('back').setAttribute('aria-label', back === 'desk' ? 'Back to the desk' : 'Back');
  if (id === 'desk') drawDesk();
  if (id === 'glass') glass.start();
  if (id === 'book') { drawBook(); book.start(); }
  if (id === 'far' && !farRunning) { far.start(); farRunning = true; }
  if (id !== 'far' && id !== 'letter') farRunning = false;
  audio.scene(SOUND[id]);
  const focus = { case: state.caseOpen ? 'toBook' : null }[id];
  if (focus) setTimeout(() => $(focus)?.focus({ preventScroll: true }), 50);
  keepHistory();
}
let farRunning = false;

// Put down what's picked up: the back arrow, Escape and the phone's own back button all come here.
function goBack() {
  if (!backTo) return;
  if (backTo === 'end') return showEnd(true);
  const from = current;
  show(backTo, { back: parentOf(backTo) });
  // Back from her last page, the lamp is yours.
  if (from === 'letter' && current === 'far') far.lamp();
}
$('back').addEventListener('click', goBack);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('hints').hidden) closeHints(); else if (e.key === 'Escape' && backTo) $('back').click(); });
const parentOf = id => ({ letter: 'desk', case: 'desk', book: 'desk', journal: 'desk', glass: 'desk' }[id] || null);

// While something is picked up the game keeps one history entry of its own on top of the page's, so the phone's back
// button or gesture puts it down, as the back arrow does, instead of leaving the game. The intro, the desk, the far
// rock and the end keep none, so back from there leaves as it always has. One left behind by a reload is taken off
// when the page opens again.
let stepping = false; // the game went back a step itself to take its entry off, so the popstate that brings isn't a press
function keepHistory() {
  if (stepping) return; // the popstate on its way squares things up
  const ours = history.state?.lanthorn === 1;
  try {
    if (backTo && !ours) history.pushState({ lanthorn: 1 }, '');
    else if (!backTo && ours) { stepping = true; history.back(); }
  } catch { stepping = false; /* a page whose history can't be changed */ }
}
addEventListener('popstate', () => {
  if (stepping) stepping = false;
  else goBack();
  keepHistory();
});

// ---------- the intro ----------

$('introText').innerHTML = INTRO.map(p => `<p>${esc(p)}</p>`).join('');
const started = state.caseOpen || state.page > 0 || state.letterRead;
if (started) $('begin').textContent = 'Back to the desk';
$('begin').addEventListener('click', () => {
  audio.wake();
  $('desk').classList.toggle('fresh', !started);
  show('desk');
});

// ---------- the desk ----------

function drawDesk() {
  const d = state.caseOpen ? String(FAR_BEARING).split('') : state.digits.map(String);
  d.forEach((v, i) => { $('caseD' + i).textContent = v; });
  $('desk').classList.toggle('opened', state.caseOpen);
}
$('toJournal').addEventListener('click', () => { audio.paper(); $('desk').classList.remove('fresh'); show('journal', { back: 'desk' }); drawJournal(); });
$('toGlass').addEventListener('click', () => { $('desk').classList.remove('fresh'); show('glass', { back: 'desk' }); });
$('toCase').addEventListener('click', () => { $('desk').classList.remove('fresh'); drawCase(); show('case', { back: 'desk' }); });

// ---------- the journal ----------

function drawJournal(turned = false) {
  const p = JOURNAL[state.page];
  const el = $('jPage');
  el.classList.toggle('first', !!p.cover);
  if (p.cover) {
    el.innerHTML = `<p class="name">${esc(p.lines[0])}</p><p class="note">${esc(p.note)}</p>`;
  } else {
    const line = l => (typeof l === 'function' ? l(state.keeper) : l);
    el.innerHTML = `<p class="date">${esc(p.date)}</p><div class="entry">${p.lines.map(l => `<p>${esc(line(l))}</p>`).join('')}</div>${p.sketch ? SKETCHES[p.sketch](state.keeper) : ''}`;
  }
  el.scrollTop = 0;
  if (turned) { el.classList.remove('page-turn'); void el.offsetWidth; el.classList.add('page-turn'); }
  $('jNum').textContent = `${state.page + 1} / ${JOURNAL.length}`;
  $('jPrev').disabled = state.page === 0;
  $('jNext').disabled = state.page === JOURNAL.length - 1;
}
function turnPage(dir) {
  const n = Math.max(0, Math.min(JOURNAL.length - 1, state.page + dir));
  if (n === state.page) return;
  state.page = n; save();
  audio.paper();
  drawJournal(true);
}
$('jPrev').addEventListener('click', () => turnPage(-1));
$('jNext').addEventListener('click', () => turnPage(1));
document.addEventListener('keydown', e => {
  if (current !== 'journal') return;
  if (e.key === 'ArrowRight') turnPage(1);
  if (e.key === 'ArrowLeft') turnPage(-1);
});
{
  let sx = 0, sy = 0;
  const page = $('jPage');
  page.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  page.addEventListener('pointerup', e => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turnPage(dx < 0 ? 1 : -1);
  });
  // Pinched in to read her hand, a sideways drag should follow the line, not turn the page, so the browser gets
  // sideways drags back until you pinch out again.
  const vv = window.visualViewport;
  const zoomed = () => document.documentElement.classList.toggle('zoomed', !!vv && vv.scale > 1.01);
  vv?.addEventListener('resize', zoomed);
  zoomed();
}

// ---------- the case ----------

const wheelEls = [];
function buildWheels() {
  const box = $('wheels');
  for (let i = 0; i < 3; i++) {
    const w = document.createElement('div');
    w.className = 'wheel';
    w.innerHTML = `<button type="button" aria-label="Turn wheel ${i + 1} up">▲</button><div class="win" role="spinbutton" tabindex="0" aria-label="Wheel ${i + 1}" aria-valuemin="0" aria-valuemax="9"><div class="strip"></div></div><button type="button" aria-label="Turn wheel ${i + 1} down">▼</button>`;
    const [upBtn, downBtn] = w.querySelectorAll('button');
    const win = w.querySelector('.win');
    upBtn.addEventListener('click', () => spin(i, 1));
    downBtn.addEventListener('click', () => spin(i, -1));
    win.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp') { e.preventDefault(); spin(i, 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); spin(i, -1); }
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); spin(i, (+e.key - state.digits[i] + 10) % 10 || 0, true); }
    });
    // Drag a wheel up or down to roll it.
    let y0 = null, acc = 0;
    win.addEventListener('pointerdown', e => { y0 = e.clientY; acc = 0; win.setPointerCapture(e.pointerId); });
    win.addEventListener('pointermove', e => {
      if (y0 === null) return;
      acc += y0 - e.clientY; y0 = e.clientY;
      while (Math.abs(acc) > 22) { spin(i, acc > 0 ? 1 : -1); acc -= Math.sign(acc) * 22; }
    });
    win.addEventListener('pointerup', () => { y0 = null; });
    win.addEventListener('pointercancel', () => { y0 = null; });
    box.append(w);
    wheelEls.push(w);
  }
}
buildWheels();

function drawWheel(i, dir = 0) {
  const v = state.digits[i];
  const strip = wheelEls[i].querySelector('.strip');
  const row = strip.firstElementChild ? strip.firstElementChild.offsetHeight : 32;
  strip.innerHTML = [-1, 0, 1].map(k => `<span style="transform:translateY(${k * 100}%)">${(v + k + 10) % 10}</span>`).join('');
  const win = wheelEls[i].querySelector('.win');
  win.setAttribute('aria-valuenow', v);
  if (dir) {
    strip.style.transition = 'none';
    strip.style.transform = `translateY(${dir * row}px)`;
    void strip.offsetHeight;
    strip.style.transition = '';
    strip.style.transform = 'translateY(0)';
  }
}

let unlocking = false;
function spin(i, by, silentDir = false) {
  if (state.caseOpen || unlocking || !by) return;
  state.digits[i] = (state.digits[i] + by + 10) % 10;
  save();
  audio.click();
  drawWheel(i, silentDir ? 0 : by > 0 ? 1 : -1);
  if (caseCatches(state.digits)) {
    unlocking = true;
    setTimeout(() => {
      audio.unlock();
      document.querySelector('.lid').classList.add('opening');
      setTimeout(() => {
        state.caseOpen = true; save();
        unlocking = false;
        drawCase();
        $('toBook').focus({ preventScroll: true });
      }, 950);
    }, 350);
  }
}

function drawCase() {
  $('caseShut').hidden = state.caseOpen;
  $('caseOpen').hidden = !state.caseOpen;
  document.querySelector('.lid').classList.remove('opening');
  for (let i = 0; i < 3; i++) drawWheel(i);
  $('toLetter').classList.toggle('read', state.letterRead);
}
$('toLetter').addEventListener('click', () => {
  audio.paper();
  state.letterRead = true; save();
  $('letterPage').innerHTML = `<p>${esc(LETTER.to)}</p>${LETTER.lines.map(l => `<p>${esc(l)}</p>`).join('')}<p class="sign">${esc(LETTER.sign)}</p>`;
  show('letter', { back: 'case' });
});
$('toBook').addEventListener('click', () => { audio.paper(); show('book', { back: 'case' }); });

// ---------- the book ----------

$('bookLine').textContent = BOOK_LINE;
const book = createBook(
  { clasp: $('clasp'), panel: $('panel'), marks: $('marks'), hint: $('panelHint') },
  {
    onOpen: () => { audio.paper(); drawBook(); },
    onWake: () => book.sync(),
    onLink: link,
  },
);
function drawBook() {
  $('cover').hidden = state.claspOpen;
  $('opened').hidden = !state.claspOpen;
  book.sync();
  if (state.claspOpen) setTimeout(() => $('panel').focus({ preventScroll: true }), 60);
}

// ---------- linking ----------

let linking = false;
function link() {
  if (linking) return;
  linking = true;
  audio.link();
  const flash = $('flash');
  flash.hidden = false;
  setTimeout(() => {
    show('far');
    far.arrive();
  }, 2600);
  setTimeout(() => { flash.hidden = true; linking = false; }, 3500);
}

// ---------- the far rock ----------

const far = createFar(
  { canvas: $('farView'), warm: $('warm'), lever: $('lever'), page: $('sillPage'), text: $('farText') },
  {
    onPage: () => {
      audio.paper();
      $('letterPage').innerHTML = `${LAST_PAGE.lines.map(l => `<p>${esc(l)}</p>`).join('')}<p class="sign">${esc(LAST_PAGE.sign)}</p>`;
      show('letter', { back: 'far' });
    },
    onDone: pattern => {
      state.keeper = pattern;
      state.done = true;
      save();
      showEnd(false);
    },
  },
);
// ---------- the end ----------

function showEnd(quick) {
  $('endText').innerHTML = ENDING.map(p => `<p>${esc(p)}</p>`).join('');
  $('end').classList.toggle('quick', quick);
  show('end');
}
$('endLook').addEventListener('click', () => {
  audio.wake();
  Object.assign(state, { hours: 21.2, heading: FAR_BEARING, pitch: 3 });
  show('glass', { back: 'end' });
});
$('endAgain').addEventListener('click', () => {
  reset();
  location.reload();
});

// ---------- hints ----------

function lockNow() {
  if (!state.caseOpen) return 'case';
  if (!state.claspOpen) return 'clasp';
  if (!state.awake) return 'panel';
  return null;
}
let hintShown = 1;
// While the sheet is up, everything behind it is out of reach, so the keyboard can't wander off and open a screen under it.
const behindHints = () => [...document.querySelectorAll('.screen'), $('back'), $('soundBtn')];
function openHints() {
  const lock = lockNow();
  hintShown = 1;
  drawHints(lock);
  $('hints').hidden = false;
  for (const el of behindHints()) el.inert = true;
  $('hintClose').focus();
}
function drawHints(lock) {
  const list = lock ? HINTS[lock] : ['Everything’s open. Take the book out of the case and touch the picture.'];
  $('hintList').innerHTML = list.slice(0, hintShown).map(h => `<li>${esc(h)}</li>`).join('');
  $('hintMore').disabled = hintShown >= list.length;
}
function closeHints() {
  for (const el of behindHints()) el.inert = false;
  $('hints').hidden = true;
  $('stuckBtn').focus();
}
$('stuckBtn').addEventListener('click', openHints);
$('hintMore').addEventListener('click', () => { hintShown++; drawHints(lockNow()); });
$('hintClose').addEventListener('click', closeHints);
$('hints').addEventListener('click', e => { if (e.target === $('hints')) closeHints(); });

// ---------- sound ----------

function drawSound() { $('soundBtn').setAttribute('aria-pressed', state.sound ? 'true' : 'false'); }
audio.setSound(state.sound);
drawSound();
$('soundBtn').addEventListener('click', () => {
  state.sound = !state.sound; save();
  audio.wake();
  audio.setSound(state.sound);
  drawSound();
});

// ---------- the eyeglass ----------

const glass = createGlass({
  lens: $('lens'), ring: $('ring'), dial: $('hourDial'), wheel: $('hourWheel'), wrap: $('lensWrap'),
  drums: [$('dr0'), $('dr1'), $('dr2')], hint: $('glassHint'),
});

// ---------- start ----------

// Make the textures just after the first paint, while the intro is fading in.
requestAnimationFrame(() => setTimeout(applyTextures, 30));

if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});

// For tests and screenshots: ?at=desk|glass|case|book|far|end jumps straight there.
const q = new URLSearchParams(location.search);
if (q.has('fresh')) reset();
for (const k of ['hours', 'heading', 'pitch', 'page']) if (q.has(k) && Number.isFinite(+q.get(k))) state[k] = +q.get(k);
tidy(state);
if (q.has('keeper') && /^[SL]{1,8}$/.test(q.get('keeper'))) state.keeper = q.get('keeper');
const at = q.get('at');
// They're for one visit, so they come off the address: otherwise every reload (and Start again) did them over,
// and ?fresh wiped everything each time. That happens before a screen is shown, so it's the page's own history entry
// that's tidied, not one the game puts on top of it.
const ONCE = ['fresh', 'at', 'hours', 'heading', 'pitch', 'page', 'keeper', 'shut', 'awake', 'lamp'];
if (ONCE.some(k => q.has(k))) {
  const rest = new URLSearchParams(q);
  for (const k of ONCE) rest.delete(k);
  try { history.replaceState(history.state, '', location.pathname + (String(rest) ? '?' + rest : '') + location.hash); } catch { /* an address that can't be changed */ }
}
if (at === 'book' || at === 'far') Object.assign(state, { caseOpen: true, claspOpen: q.has('shut') ? false : true, awake: q.has('awake') });
if (at === 'far') { show('far'); far.arrive(); if (q.has('lamp')) far.lamp(); }
else if (at === 'end') showEnd(true);
else if (at && SCREENS.includes(at)) { if (at === 'case') drawCase(); show(at, { back: at === 'desk' || at === 'intro' ? null : 'desk' }); if (at === 'journal') drawJournal(); }
else if (state.done) showEnd(true);
else show('intro');

window.__lanthorn = { state, show, glass, book, far, link, audio };
