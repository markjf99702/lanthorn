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
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) problems.push('left the site: ' + r.url()); });

const state = () => page.evaluate(() => ({ ...window.__lanthorn.state }));
const screen = () => page.evaluate(() => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id);
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
  for (const c of pattern) await hold(sel, c === 'L' ? 650 : 120);
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
for (let i = 0; i < 5 && !(await state()).caseOpen; i++) { await ups.nth(2).click(); await page.waitForTimeout(80); }
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

// Works offline once it has been opened.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
await page.reload();
assert.equal(await page.title(), 'Lanthorn', 'the page did not load offline');
await page.evaluate(() => document.fonts.ready);
assert.equal(await screen(), 'intro');
await ctx.setOffline(false);

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while playing');
await browser.close();
server.close();
console.log('all good');
