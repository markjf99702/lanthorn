// Plays Lanthorn start to finish in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const problems = [];
function watch(p) {
  p.on('pageerror', e => problems.push(e.message));
  p.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  p.on('requestfailed', r => problems.push('failed: ' + r.url()));
  p.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) problems.push('left the site: ' + r.url()); });
}
const page = await ctx.newPage();
watch(page);

const state = (p = page) => p.evaluate(() => ({ ...window.__lanthorn.state }));
const screen = (p = page) => p.evaluate(() => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id);
const noSideways = async where => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${where} scrolls sideways on a phone`);
const back = () => page.click('#back');

// Hold something down for a while: a long or short flash.
async function hold(sel, ms) {
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(260);
}
async function signal(sel, pattern) {
  for (const c of pattern) await hold(sel, c === 'L' ? 1000 : 120);
}
// Swipe a finger sideways across something, with the touch events a phone sends.
const finger = await ctx.newCDPSession(page);
async function swipe(sel, dx) {
  const b = await page.locator(sel).boundingBox();
  const x = b.x + b.width / 2 - dx / 2, y = b.y + b.height / 2;
  await finger.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(20);
    await finger.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y }] });
  }
  await finger.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
}

await page.goto(base + '?fresh');
await page.evaluate(() => document.fonts.ready);

// The house clearance.
assert.equal(await screen(), 'intro');
assert.match(await page.locator('#introText').innerText(), /writing case, a journal and a brass eyeglass/);
await page.click('#begin');
assert.equal(await screen(), 'desk');
await noSideways('the desk');

// The journal: the cover warns you off, then entries one to a page.
await page.click('#toJournal');
assert.equal(await screen(), 'journal');
assert.match(await page.locator('#jPage').innerText(), /please don’t open the case/);
assert.equal(await page.locator('#jNum').innerText(), '1 / 11');
await page.click('#jNext');
assert.match(await page.locator('#jPage').innerText(), /The book is finished/);
for (let i = 0; i < 4; i++) await page.click('#jNext');
assert.equal(await page.locator('#jPage svg.sketch').count(), 1, 'the map is on the page about the second rock');
await page.keyboard.press('ArrowRight');
assert.match(await page.locator('#jPage').innerText(), /four flashes and a rest/);
await noSideways('the journal');
assert.equal((await state()).page, 6, 'the journal remembers its page');
// A finger turns the pages too: swipe to the left for the next, to the right for the one before.
await swipe('#jPage', -250);
assert.equal((await state()).page, 7, 'a swipe to the left turns the page on a phone');
await swipe('#jPage', 250);
assert.equal((await state()).page, 6, 'a swipe to the right turns it back');
await back();
assert.equal(await screen(), 'desk');

// The eyeglass: in the afternoon there's nothing to the south-west.
await page.click('#toGlass');
assert.equal(await screen(), 'glass');
assert.equal(await page.locator('.readout').innerText().then(t => t.replace(/\s/g, '')), '128°');
const lens = await page.locator('#lens').boundingBox();
await page.mouse.move(lens.x + lens.width / 2, lens.y + lens.height / 2);
await page.mouse.down();
await page.mouse.move(lens.x + lens.width / 2 - 120, lens.y + lens.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(1500); // let it coast to a stop
assert.ok((await state()).heading > 128, 'dragging left turns the glass right');
await page.focus('#lens');
const s1 = await state();
const turnBy = Math.round(245 - s1.heading);
for (let i = 0; i < Math.abs(turnBy); i++) await page.keyboard.press(turnBy > 0 ? 'ArrowRight' : 'ArrowLeft');
await page.waitForTimeout(100);
assert.equal(await page.locator('.readout').innerText().then(t => t.replace(/\s/g, '')), '245°');
assert.equal(await page.evaluate(() => window.__lanthorn.glass.env.farVis), 0, 'no far rock by day');
// Turn the wheel on to dusk: the far rock comes out of the haze.
const wheel = await page.locator('#hourWheel').boundingBox();
await page.mouse.move(wheel.x + 30, wheel.y + wheel.height / 2);
await page.mouse.down();
await page.mouse.move(wheel.x + 30 + 34 * 4.5, wheel.y + wheel.height / 2, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const dusk = await state();
assert.ok(dusk.hours > 19.5 && dusk.hours < 20.5, `the wheel turned to ${dusk.hours}`);
assert.equal(await page.evaluate(() => window.__lanthorn.glass.env.farVis), 1, 'the far rock at dusk');
// And its light is flashing.
let flashed = false;
for (let i = 0; i < 40 && !flashed; i++) { flashed = await page.evaluate(() => window.__lanthorn.glass.env.lightOn); await page.waitForTimeout(100); }
assert.ok(flashed, 'the far light flashes after dark');
await noSideways('the eyeglass');
await back();

// The case: set it to where the light stands.
await page.click('#toCase');
assert.equal(await screen(), 'case');
const ups = page.locator('.wheel button:first-child');
for (let i = 0; i < 2; i++) await ups.nth(0).click();
for (let i = 0; i < 4; i++) await ups.nth(1).click();
// Roll the last wheel until the lock catches, within two of the bearing, then leave it be: the lid takes a moment
// to swing open, and a click on it while it moves waits for a button that's about to go.
const caught = s => s.caseOpen || Math.abs(+s.digits.join('') - 245) <= 2;
for (let i = 0; i < 5 && !caught(await state()); i++) await ups.nth(2).click();
await page.waitForFunction(() => window.__lanthorn.state.caseOpen, null, { timeout: 4000 });
await page.waitForSelector('#toBook', { state: 'visible' });
await noSideways('the case');

// The letter inside.
await page.click('#toLetter');
assert.equal(await screen(), 'letter');
assert.match(await page.locator('#letterPage').innerText(), /It won’t bring you back/);
await back();
assert.equal(await screen(), 'case');

// The book: the wrong five studs pop back out.
await page.click('#toBook');
assert.equal(await screen(), 'book');
const stud = (x, y) => page.locator(`.stud[data-x="${x}"][data-y="${y}"]`);
for (const [x, y] of [[1, 1], [2, 1], [3, 1], [2, 2], [2, 3]]) await stud(x, y).click();
await page.waitForTimeout(1400);
assert.equal((await state()).claspOpen, false);
assert.equal(await page.locator('.stud[aria-pressed="true"]').count(), 0, 'wrong studs let go');
// The Lampbearer, shifted one to the right, opens it.
for (const [x, y] of [[1, 0], [0, 1], [1, 2], [2, 2], [2, 4]]) await stud(x + 1, y).click();
await page.waitForFunction(() => window.__lanthorn.state.claspOpen, null, { timeout: 3000 });
await page.waitForSelector('#opened', { state: 'visible', timeout: 3000 });
await noSideways('the book');

// The picture: a wrong answer does nothing, the light's own pattern wakes it.
await signal('#panel', 'LSSL');
await page.waitForTimeout(2000);
assert.equal((await state()).awake, false);
await signal('#panel', (await state()).keeper);
await page.waitForFunction(() => window.__lanthorn.state.awake, null, { timeout: 4000 });
assert.equal(await page.locator('#panelHint').innerText(), 'Touch the picture.');

// Touch it: linking, and the far rock.
await page.click('#panel');
await page.waitForFunction(() => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id === 'far', null, { timeout: 5000 });
await page.waitForSelector('#sillPage', { state: 'visible', timeout: 8000 });
assert.match(await page.locator('#farText').innerText(), /still warm/);
await page.click('#sillPage');
assert.equal(await screen(), 'letter');
assert.match(await page.locator('#letterPage').innerText(), /The lamp is yours now/);
await back();
assert.equal(await screen(), 'far');
await page.waitForSelector('#lever', { state: 'visible' });
await noSideways('the far rock');

// Keep the light: whatever you signal is what the next person sees.
await signal('#lever', 'SLS');
await page.waitForFunction(() => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id === 'end', null, { timeout: 12000 });
const done = await state();
assert.equal(done.keeper, 'SLS');
assert.equal(done.done, true);
await page.waitForSelector('#endLook', { state: 'visible', timeout: 12000 });
assert.match(await page.locator('#endText').innerText(), /Tonight they’ll see your light/);

// Look through the glass again: night, facing the far rock, and your pattern on it.
await page.waitForTimeout(9500);
await page.click('#endLook');
assert.equal(await screen(), 'glass');
assert.equal(await page.locator('.readout').innerText().then(t => t.replace(/\s/g, '')), '245°');
await back();
assert.equal(await screen(), 'end');

// Coming back after the end goes back to the end.
await page.goto(base);
assert.equal(await screen(), 'end');

// Start again: the locks are shut, but the light is still yours.
await page.click('#endAgain');
await page.waitForLoadState('load');
await page.waitForTimeout(300);
assert.equal(await screen(), 'intro');
const again = await state();
assert.equal(again.caseOpen, false);
assert.equal(again.keeper, 'SLS');

// Hints: the first lock's first nudge.
await page.click('#begin');
await page.click('#stuckBtn');
assert.match(await page.locator('#hintList').innerText(), /where the light stands/);
await page.click('#hintMore');
assert.equal(await page.locator('#hintList li').count(), 2);
await page.click('#hintClose');
assert.equal(await page.locator('#hints').isHidden(), true);

// Nell's page about the light counts your light's flashes now, and her two crossed-out tries aren't it.
await page.click('#toJournal');
for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
assert.match(await page.locator('#jPage').innerText(), /three flashes and a rest/);
const tries = await page.evaluate(() => [26, 68].map(y => [...document.querySelectorAll('#jPage svg.sketch g > *')]
  .map(el => (el.tagName === 'circle' ? [+el.getAttribute('cx'), +el.getAttribute('cy'), 'S'] : [...(/^M([\d.]+) ([\d.]+)h/.exec(el.getAttribute('d')) || []).slice(1).map(Number), 'L']))
  .filter(([, at]) => at === y).sort((a, b) => a[0] - b[0]).map(m => m[2]).join('')));
assert.deepEqual(tries, ['SLL', 'LLS'], 'her crossed-out tries for a light that says short, long, short');
await back();

// Works offline once it has been opened.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
await page.reload();
assert.equal(await page.title(), 'Lanthorn', 'the page did not load offline');
await page.evaluate(() => document.fonts.ready);
assert.equal(await screen(), 'intro');
await ctx.setOffline(false);

// ---------- smaller checks, each on a page of its own ----------

const more = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
async function open(query, before) {
  const p = await more.newPage();
  watch(p);
  if (before) await before(p);
  await p.goto(base + query);
  await p.evaluate(() => document.fonts.ready);
  return p;
}

// The eyeglass draws fewer pixels when a frame takes too long and more when there's time, and the far rock
// draws fewer on a slow phone. Resizing a canvas wipes it, so the new picture has to go up in the same
// frame, or the view flashes black.
const slowPhone = ms => pg => pg.addInitScript(ms => {
  window.__resized = {}; window.__wiped = {}; window.__slow = ms;
  // Only resizes made while drawing a frame count: opening a screen sizes its canvas before the first frame.
  let drawing = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(t => { drawing++; try { cb(t); } finally { drawing--; } });
  const wiped = new Set();
  const width = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    get() { return width.get.call(this); },
    set(v) {
      width.set.call(this, v);
      if (!drawing) return;
      const id = this.id;
      window.__resized[id] = (window.__resized[id] || 0) + 1;
      wiped.add(this);
      // Still wiped once the frame's code has run: the screen would show it empty.
      queueMicrotask(() => { if (wiped.has(this)) window.__wiped[id] = (window.__wiped[id] || 0) + 1; });
    },
  });
  // Play a slow phone by holding up the drawing, which both of them time.
  const put = CanvasRenderingContext2D.prototype.putImageData;
  CanvasRenderingContext2D.prototype.putImageData = function (...a) {
    wiped.delete(this.canvas);
    for (const end = performance.now() + window.__slow; performance.now() < end;);
    return put.apply(this, a);
  };
}, ms);
async function resizes(query, id, ms) {
  const p = await open(query, slowPhone(ms));
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__slow = 0; });
  await p.waitForTimeout(1000);
  const r = await p.evaluate(id => ({ resized: window.__resized[id] || 0, wiped: window.__wiped[id] || 0 }), id);
  await p.close();
  return r;
}
{
  const lens = await resizes('?fresh&at=glass&hours=23&heading=245&pitch=8', 'lens', 30);
  assert.ok(lens.resized >= 3, `the eyeglass only changed its resolution ${lens.resized} times`);
  assert.equal(lens.wiped, 0, 'the eyeglass went black when it changed its resolution');
  const far = await resizes('?fresh&at=far', 'farView', 50);
  assert.ok(far.resized >= 3, `the far rock only drew fewer pixels ${far.resized} times`);
  assert.equal(far.wiped, 0, 'the far rock went black when it drew fewer pixels');
}

// On a phone the pages you read start below the back and sound buttons, not under them, and still fit.
{
  const p = await open('?fresh&at=journal&page=5');
  async function clear(sel, where) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 360, height: 640 }]) {
      await p.setViewportSize(viewport);
      const [el, back, sound] = await Promise.all([sel, '#back', '#soundBtn'].map(s => p.locator(s).boundingBox()));
      const size = `${viewport.width}x${viewport.height}`;
      assert.ok(el.y >= Math.max(back.y + back.height, sound.y + sound.height), `${where} starts under the buttons at ${size}`);
      assert.ok(el.y + el.height <= viewport.height, `${where} runs off the bottom at ${size}`);
    }
    await p.setViewportSize({ width: 390, height: 844 });
  }
  await clear('#jPage', 'the journal');
  await clear('.pager', 'the page numbers');
  // The letter in the case.
  await p.goto(base + '?fresh&at=book');
  await p.evaluate(() => window.__lanthorn.show('desk'));
  await p.click('#toCase');
  await p.click('#toLetter');
  await clear('#letterPage', 'the letter');
  // Nell's last page, on the far rock.
  await p.goto(base + '?fresh&at=far');
  await p.evaluate(() => { document.getElementById('sillPage').hidden = false; });
  await p.click('#sillPage');
  await clear('#letterPage', 'her last page');
  await p.close();
}

// With the phone on its side nothing runs off the screen: the desk's three things, the eyeglass's counter, ring,
// wheel and hint, the case and its line, the book's plate and its line, and the picture in the open book.
{
  const W = 844, H = 390;
  const p = await open('?fresh&at=desk', pg => pg.setViewportSize({ width: W, height: H }));
  for (const [query, sels, where] of [
    ['?fresh&at=desk', ['#toCase', '#toJournal', '#toGlass', '#stuckBtn'], 'the desk'],
    ['?fresh&at=glass', ['.readout', '#ring', '#hourWheel', '#glassHint'], 'the eyeglass'],
    ['?fresh&at=case', ['.lid', '#caseShut .hint'], 'the case'],
    ['?fresh&at=book&shut', ['#cover', '#cover .hint'], 'the book'],
    ['?fresh&at=book', ['#bookLine', '#panel', '#panelHint'], 'the open book'],
  ]) {
    await p.goto(base + query);
    await p.waitForTimeout(300);
    for (const sel of sels) {
      const b = await p.locator(sel).boundingBox();
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= W && b.y + b.height <= H, `${sel} on ${where} runs off a ${W}x${H} screen, at ${[b.x, b.y, b.width, b.height].map(Math.round)}`);
    }
  }
  // On a first visit the desk names its three things, and the case's name stays clear of Stuck? under it.
  await p.goto(base + '?fresh');
  await p.click('#begin');
  for (const [width, height] of [[W, H], [740, 360]]) {
    await p.setViewportSize({ width, height });
    const [name, stuck] = await p.evaluate(() => ['.case-thing .thing-label', '#stuckBtn'].map(sel => {
      const words = document.createRange();
      words.selectNodeContents(document.querySelector(sel));
      const b = words.getBoundingClientRect();
      return [b.top, b.bottom];
    }));
    assert.ok(name[1] + 8 <= stuck[0], `the case's name runs into Stuck? on a ${width}x${height} screen, ${Math.round(stuck[0] - name[1])} px apart`);
  }
  await p.close();
}

// Once you've finished, every visit opens on the end, so the line back to junkdrawer.works and the privacy page is
// there too, under the buttons and fading in with them. On a phone on its side the end scrolls to reach it.
{
  const p = await open('?fresh&at=end');
  const foot = p.locator('#end .jd-foot');
  assert.deepEqual(await foot.locator('a').evaluateAll(as => as.map(a => [a.textContent, a.href])), [['Part of junkdrawer.works', 'https://junkdrawer.works/'], ['Privacy', 'https://junkdrawer.works/privacy.html']], 'the end has no line back to junkdrawer.works');
  await p.waitForFunction(() => getComputedStyle(document.querySelector('#end .jd-foot')).opacity === '1', null, { timeout: 5000 });
  const fades = await p.evaluate(() => {
    document.getElementById('end').classList.remove('quick');
    return ['#endBtns', '#end .jd-foot'].map(s => { const cs = getComputedStyle(document.querySelector(s)); return `${cs.animationDelay} ${cs.animationDuration}`; });
  });
  assert.equal(fades[1], fades[0], 'the line under the end\'s buttons doesn\'t fade in with them');
  for (const [width, height] of [[844, 390], [568, 320]]) {
    await p.setViewportSize({ width, height });
    await foot.scrollIntoViewIfNeeded();
    const b = await foot.boundingBox();
    assert.ok(b.y >= 0 && b.y + b.height <= height, `the line under the end's buttons can't be reached on a ${width}x${height} screen`);
  }
  await p.close();
}

// Stuck? and the case's wheel buttons are at least 44 px tall, enough for a thumb.
{
  const p = await open('?fresh&at=desk');
  const tall = async (sel, what) => {
    for (const el of await p.locator(sel).all()) {
      const { height } = await el.boundingBox();
      assert.ok(height >= 44, `${what} is only ${Math.round(height)} px tall`);
    }
  };
  await tall('#stuckBtn', 'Stuck?');
  await p.click('#toCase');
  await tall('.wheel button', 'a wheel button on the case');
  await p.close();
}

// Pinched in to read her hand, a sideways drag moves the view along the line and leaves the page where it is.
// Pinched out again, a swipe turns the page as before.
{
  const p = await open('?fresh&at=journal&page=5');
  const touch = await more.newCDPSession(p);
  const b = await p.locator('#jPage').boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  // One point per finger, from where it lands to where it lifts.
  async function fingers(from, to) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: from.map(([x, y], id) => ({ x, y, id })) });
    for (let i = 1; i <= 12; i++) {
      await p.waitForTimeout(20);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: from.map(([x0, y0], id) => ({ x: x0 + (to[id][0] - x0) * i / 12, y: y0 + (to[id][1] - y0) * i / 12, id })) });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(500);
  }
  const view = () => p.evaluate(() => ({ scale: visualViewport.scale, left: visualViewport.offsetLeft, page: window.__lanthorn.state.page }));
  await fingers([[x - 20, y], [x + 20, y]], [[x - 90, y], [x + 90, y]]);
  const zoomed = await view();
  assert.ok(zoomed.scale > 1.5, `pinching didn't zoom in (${zoomed.scale})`);
  await fingers([[x - 80, y]], [[x + 80, y]]);
  const along = await view();
  assert.equal(along.page, 5, 'a sideways drag turned the page while pinched in');
  assert.ok(Math.abs(along.left - zoomed.left) > 20, 'a sideways drag didn\'t move the pinched-in view');
  await fingers([[x - 90, y], [x + 90, y]], [[x - 10, y], [x + 10, y]]);
  assert.equal((await view()).scale, 1, 'pinching out didn\'t zoom back out');
  await fingers([[x + 120, y]], [[x - 120, y]]);
  assert.equal((await view()).page, 6, 'pinched out again, a swipe doesn\'t turn the page');
  await p.close();
}

// While the hint sheet is up the keyboard stays on it, so nothing behind it can be opened, and closing it
// gives focus back to Stuck?. On paper the focus ring is ink, because brass hardly shows there.
const INK = 'rgb(51, 38, 26)';
const focused = p => p.evaluate(() => {
  const a = document.activeElement;
  return { id: a.id || a.tagName, inSheet: !!a.closest('#hints'), ring: a.matches(':focus-visible') ? getComputedStyle(a).outlineColor : null };
});
{
  const p = await open('?fresh&at=desk');
  await p.click('#stuckBtn');
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press('Tab');
    const at = await focused(p);
    assert.ok(at.inSheet || at.id === 'BODY', `Tab reached ${at.id} behind the hint sheet`);
    if (at.inSheet) assert.equal(at.ring, INK, `the focus ring on ${at.id} hardly shows on the paper`);
  }
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#hints').isHidden(), true);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'stuckBtn', 'closing the sheet gives focus back to Stuck?');
  await p.close();
}
// The picture in the open book sits on the page too.
{
  const p = await open('?fresh&at=book');
  let at = await focused(p);
  for (let i = 0; i < 6 && !(at.id === 'panel' && at.ring); i++) { await p.keyboard.press('Tab'); at = await focused(p); }
  assert.equal(at.ring, INK, 'the focus ring round the picture hardly shows on the page');
  await p.close();
}

// A garbled save still opens: whatever is the wrong kind of thing starts afresh, and the rest is kept.
// The same goes for a test address with nonsense in it.
{
  const p = await open('?fresh');
  await p.evaluate(() => localStorage.setItem('lanthorn:v1', JSON.stringify({ letterRead: true, digits: null, page: 99, studs: 7, hours: 'abc' })));
  await p.goto(base);
  await p.click('#begin');
  for (const [thing, where] of [['#toCase', 'case'], ['#toJournal', 'journal'], ['#toGlass', 'glass']]) {
    await p.click(thing);
    assert.equal(await screen(p), where, `${thing} doesn't open with a garbled save`);
    if (where === 'journal') assert.equal(await p.locator('#jNum').innerText(), '11 / 11', 'a page past the end opens the last one');
    await p.click('#back');
  }
  assert.equal((await state(p)).letterRead, true, 'the rest of the save is kept');
  await p.goto(base + '?fresh&at=journal&page=11');
  assert.equal(await p.locator('#jNum').innerText(), '11 / 11');
  await p.goto(base + '?at=glass&hours=x');
  await p.waitForTimeout(300);
  assert.ok(Number.isFinite((await state(p)).hours), 'a nonsense hour went into the save');
  await p.close();
}

// A test address is for one visit: it comes off the address bar, so a reload carries on instead of starting over.
{
  const p = await open('?fresh&at=journal&page=3&utm=x');
  assert.equal(new URL(p.url()).search, '?utm=x', 'the test address stayed in the address bar');
  await p.click('#jNext');
  await p.reload();
  assert.equal((await state(p)).page, 4, 'a reload went back to the test address and started over');
  await p.close();
}

// The phone's back button puts down what's picked up, as the back arrow does, and from the desk it leaves the game.
// The game keeps one history entry of its own while something is picked up, and leaves none behind to catch a press:
// not when the back arrow puts something down, not two deep (the case, then the letter in it), not after a reload
// with something picked up, and not after Start again.
{
  const elsewhere = base + 'icon.svg';
  const start = query => open(query, pg => pg.goto(elsewhere));
  const settled = p => p.waitForFunction(() => history.state === null, null, { timeout: 3000 });
  async function pressBack(p, to, what) {
    await p.goBack();
    if (to === 'elsewhere') return assert.equal(p.url(), elsewhere, `back from ${what} didn't leave the game`);
    await p.waitForFunction(to => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id === to, to, { timeout: 3000 }).catch(() => {});
    assert.equal(await screen(p), to, `back from ${what} didn't go back to the ${to}`);
  }
  let p = await start('?fresh');
  await p.click('#begin');
  await p.click('#toJournal');
  await pressBack(p, 'desk', 'the journal');
  await p.evaluate(() => { window.__lanthorn.state.caseOpen = true; });
  await p.click('#toCase');
  await p.click('#toLetter');
  await pressBack(p, 'case', 'the letter');
  await pressBack(p, 'desk', 'the case');
  await p.click('#toGlass');
  await p.click('#back');
  await settled(p);
  await pressBack(p, 'elsewhere', 'the desk');
  await p.close();
  // A reload with the journal open.
  p = await start('?fresh');
  await p.click('#begin');
  await p.click('#toJournal');
  await p.reload();
  await settled(p);
  await p.click('#begin');
  await pressBack(p, 'elsewhere', 'the desk after a reload');
  await p.close();
  // Back from her last page on the far rock gives you the lamp.
  p = await start('?fresh&at=far');
  await p.evaluate(() => { document.getElementById('sillPage').hidden = false; });
  await p.click('#sillPage');
  await pressBack(p, 'far', 'her last page');
  await p.waitForSelector('#lever', { state: 'visible' });
  await p.close();
  // After the end, back from the eyeglass goes back to the end, and Start again leaves nothing behind.
  p = await start('?fresh&at=end');
  await p.click('#endLook');
  await pressBack(p, 'end', 'the eyeglass');
  await Promise.all([p.waitForEvent('load'), p.click('#endAgain')]);
  await settled(p);
  await pressBack(p, 'elsewhere', 'the title card after Start again');
  await p.close();
}

// While the wrong studs shake loose the plate takes no more presses, so a press then isn't thrown away with
// them, and once they're out it takes presses again.
{
  const p = await open('?fresh&at=book&shut');
  // A screen reader hears how many studs there are: five by five, less the corners.
  assert.equal(await p.locator('.stud').count(), 21);
  assert.match(await p.locator('#clasp').getAttribute('aria-label'), /twenty-one studs/, 'the plate tells a screen reader the wrong number of studs');
  const during = await p.evaluate(() => new Promise(resolve => {
    const stud = (x, y) => document.querySelector(`.stud[data-x="${x}"][data-y="${y}"]`);
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [2, 2], [2, 3]]) stud(x, y).click();
    const clasp = document.getElementById('clasp');
    const t = setInterval(() => {
      if (!clasp.classList.contains('wrong')) return;
      clearInterval(t);
      stud(3, 3).click();
      resolve(stud(3, 3).getAttribute('aria-pressed'));
    }, 10);
  }));
  assert.equal(during, 'false', 'a stud pressed while the plate shakes went down, to be thrown out with the rest');
  await p.waitForFunction(() => !document.getElementById('clasp').classList.contains('wrong'));
  assert.equal(await p.locator('.stud[aria-pressed="true"]').count(), 0, 'wrong studs let go');
  await p.locator('.stud[data-x="3"][data-y="3"]').click();
  assert.equal(await p.locator('.stud[data-x="3"][data-y="3"]').getAttribute('aria-pressed'), 'true', 'the plate takes presses again');
  await p.close();
}

// A reload while a lock is opening: it's open when the page comes back, and five wrong studs have popped out.
// The page's timers are stopped just before the deciding press, so it can't finish opening before it goes.
{
  const p = await open('?fresh');
  await p.goto(base);
  const pressThenReload = sel => Promise.all([p.waitForEvent('load'), p.evaluate(sel => {
    const later = window.setTimeout;
    window.setTimeout = () => 0;
    document.querySelector(sel).click();
    later(() => location.reload(), 0);
  }, sel)]);
  const walk = async (...things) => { await p.click('#begin'); for (const t of things) await p.click(t); };
  // The case, as the last wheel comes round to 243.
  const up = i => `#wheels .wheel:nth-child(${i + 1}) button:first-child`;
  await walk('#toCase');
  for (const [i, n] of [[0, 2], [1, 4], [2, 2]]) for (let k = 0; k < n; k++) await p.click(up(i));
  await pressThenReload(up(2));
  assert.equal(await p.locator('#begin').innerText(), 'Back to the desk', 'the intro doesn\'t know the case is open');
  await walk('#toCase');
  await p.waitForSelector('#caseOpen', { state: 'visible' });
  // Five wrong studs.
  const stud = ([x, y]) => `.stud[data-x="${x}"][data-y="${y}"]`;
  const wrong = [[1, 1], [2, 1], [3, 1], [2, 2], [2, 3]];
  await p.click('#toBook');
  for (const s of wrong.slice(0, 4)) await p.click(stud(s));
  await pressThenReload(stud(wrong[4]));
  assert.deepEqual((await state(p)).studs, [], 'five wrong studs were still down after a reload');
  await walk('#toCase', '#toBook');
  assert.equal(await p.locator('.stud[aria-pressed="true"]').count(), 0);
  // The Lampbearer.
  const lamp = [[1, 0], [0, 1], [1, 2], [2, 2], [2, 4]];
  for (const s of lamp.slice(0, 4)) await p.click(stud(s));
  await pressThenReload(stud(lamp[4]));
  assert.equal((await state(p)).claspOpen, true, 'the Lampbearer was down, but the clasp was shut after a reload');
  await walk('#toCase', '#toBook');
  await p.waitForSelector('#opened', { state: 'visible' });
  await p.close();
}

// A press lasts as long as it was held, even when the page is too busy to notice at once. First a key goes down
// and the page is held up for a second before it hears, then the key comes up as soon as it does: a long press.
// Then a key comes up straight away, but the page hears a second late: a short one.
{
  const latePresses = (p, sel) => p.evaluate(sel => {
    const el = document.querySelector(sel);
    const key = type => new KeyboardEvent(type, { key: ' ', bubbles: true, cancelable: true });
    const busy = () => { for (const end = performance.now() + 1000; performance.now() < end;); };
    const longPress = key('keydown');
    busy();
    el.dispatchEvent(longPress);
    el.dispatchEvent(key('keyup'));
    el.dispatchEvent(key('keydown'));
    const shortRelease = key('keyup');
    busy();
    el.dispatchEvent(shortRelease);
  }, sel);
  const picture = await open('?fresh&at=book');
  await latePresses(picture, '#panel');
  assert.equal(await picture.locator('#marks').textContent(), '— ·', 'the picture counted the time the page was busy as part of the presses');
  await picture.close();
  const shutter = await open('?fresh&at=far&lamp');
  await latePresses(shutter, '#lever');
  await shutter.waitForFunction(() => window.__lanthorn.state.done, null, { timeout: 20000 });
  assert.equal((await state(shutter)).keeper, 'LS', 'the shutter counted the time the page was busy as part of the presses');
  await shutter.close();
}

// The N on the compass rose of the case's lock shows whole, above the ring.
{
  const p = await open('?fresh&at=case');
  const rose = await p.evaluate(() => {
    const svg = document.querySelector('.rose svg'), n = svg.querySelector('text').getBBox();
    return { overflow: getComputedStyle(svg).overflow, top: n.y, edge: svg.viewBox.baseVal.y };
  });
  assert.ok(rose.overflow === 'visible' || rose.top >= rose.edge, `the top of the N is cut off at ${rose.edge}; it reaches ${rose.top.toFixed(1)}`);
  await p.close();
}

// While you read her last page the far rock stops drawing behind it, and starts again when you put it down.
{
  const p = await open('?fresh&at=far', pg => pg.addInitScript(() => {
    window.__farDraws = 0;
    const put = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (...a) { if (this.canvas.id === 'farView') window.__farDraws++; return put.apply(this, a); };
  }));
  await p.evaluate(() => { document.getElementById('sillPage').hidden = false; });
  await p.click('#sillPage');
  assert.equal(await screen(p), 'letter');
  const draws = () => p.evaluate(() => window.__farDraws);
  const reading = await draws();
  await p.waitForTimeout(1000);
  assert.equal(await draws(), reading, 'the far rock kept drawing behind her page');
  await p.click('#back');
  assert.equal(await screen(p), 'far');
  await p.waitForTimeout(500);
  assert.ok(await draws() > reading, 'the far rock didn\'t start drawing again');
  await p.close();
}

// With reduced motion the case's lid and the book's clasp fade away instead of swinging open, in the same
// time; without it they still swing.
{
  // Each one is stopped 400 ms in and looked at there, so a busy machine can't look before it has started.
  async function midway(query, sel, cls, name, reducedMotion) {
    const p = await open(query, pg => pg.emulateMedia({ reducedMotion }));
    const r = await p.evaluate(([sel, cls, name]) => {
      const el = document.querySelector(sel);
      el.classList.add(cls);
      const a = el.getAnimations().find(a => a.animationName === name);
      if (!a) return { missing: true };
      a.pause();
      a.currentTime = 400;
      const cs = getComputedStyle(el);
      return { transform: cs.transform, opacity: +cs.opacity, ms: a.effect.getComputedTiming().duration };
    }, [sel, cls, name]);
    await p.close();
    assert.ok(!r.missing, `${sel} has no ${name} with ${reducedMotion}`);
    return r;
  }
  for (const [query, sel, cls, name, ms, what] of [['?fresh&at=case', '.lid', 'opening', 'lidopen', 900, 'lid'], ['?fresh&at=book&shut', '#clasp', 'open', 'claspopen', 1200, 'clasp']]) {
    const still = await midway(query, sel, cls, name, 'reduce');
    assert.equal(still.transform, 'none', `with reduced motion the ${what} still swings`);
    assert.ok(still.opacity < 1, `with reduced motion the ${what} doesn't fade`);
    assert.equal(still.ms, ms, `with reduced motion the ${what} takes a different time, and the screen changes before or after it`);
    assert.notEqual((await midway(query, sel, cls, name, 'no-preference')).transform, 'none', `the ${what} stopped swinging for everyone`);
  }
}

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while playing');
await browser.close();
server.close();
console.log('all good');
