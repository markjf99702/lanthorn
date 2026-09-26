// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// Math.random is seeded, and the page is opened straight at each screen with ?at=, so the pictures are repeatable.
// Needs Playwright, and upng-js from `npm install` to save them with a 256-colour palette.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js');
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

async function save(png, path) {
  const img = UPNG.decode(png);
  await writeFile(join(root, path), Buffer.from(UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256)));
}
await mkdir(join(root, 'docs'), { recursive: true });

async function open(query, viewport = { width: 390, height: 844 }, deviceScaleFactor = 2) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    let a = 4; // mulberry32
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  });
  await page.goto(base + '?fresh&' + query);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// The desk, with a hint of which thing is which.
{
  const page = await open('at=desk');
  await page.evaluate(() => document.getElementById('desk').classList.add('fresh'));
  await page.waitForTimeout(1200);
  await save(await page.screenshot(), 'docs/phone-desk.png');
  await page.context().close();
}

// The eyeglass at dusk, facing the far rock as its light comes on.
{
  const page = await open('at=glass&hours=18.75&heading=247&pitch=1');
  await page.evaluate(() => { document.getElementById('glassHint').style.opacity = 0; });
  await page.waitForFunction(() => window.__lanthorn.glass.env?.lightOn, null, { timeout: 15000 });
  await page.waitForTimeout(120);
  await save(await page.screenshot(), 'docs/phone-glass.png');
  await page.context().close();
}

// The book, open, with the picture awake.
{
  const page = await open('at=book&awake');
  await page.waitForTimeout(11300);
  await save(await page.screenshot(), 'docs/phone-book.png');
  await page.context().close();
}

// Link preview, 1200 x 630: a card with the name on the left and the eyeglass on the right.
{
  const page = await open('at=glass&hours=18.75&heading=247&pitch=1', { width: 900, height: 900 }, 1);
  await page.evaluate(() => {
    document.documentElement.style.background = document.body.style.background = document.getElementById('glass').style.background = 'transparent';
    for (const sel of ['.readout', '#back', '#soundBtn']) document.querySelector(sel).style.visibility = 'hidden';
  });
  await page.waitForFunction(() => window.__lanthorn.glass.env?.lightOn, null, { timeout: 15000 });
  await page.waitForTimeout(120);
  const lens = await page.locator('#lensWrap').boundingBox();
  const shot = await page.screenshot({ clip: { x: lens.x - 34, y: lens.y - 34, width: lens.width + 68, height: lens.height + 68 }, omitBackground: true });
  await page.context().close();

  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await (await browser.newContext({ viewport: { width: 1200, height: 630 } })).newPage();
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: Fell; src: url(data:font/woff2;base64,${await font('im-fell-english.woff2')}); }
    @font-face { font-family: FellSC; src: url(data:font/woff2;base64,${await font('im-fell-english-sc.woff2')}); }
    @font-face { font-family: Hand; src: url(data:font/woff2;base64,${await font('la-belle-aurore.woff2')}); }
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
    body { background: radial-gradient(ellipse at 72% 50%, #1a1511, #050404 70%); color: #efe2c6; font-family: Fell, serif; position: relative; }
    .text { position: absolute; left: 80px; top: 50%; transform: translateY(-52%); width: 520px; }
    h1 { font-family: FellSC; font-weight: 400; font-size: 104px; letter-spacing: .1em; margin: 0 0 22px; line-height: 1; text-shadow: 0 0 40px rgba(255, 210, 140, .18); }
    p { font-size: 32px; line-height: 1.32; margin: 0; color: #cbbd9f; }
    .hand { font-family: Hand; font-size: 29px; color: #a99a7c; margin-top: 26px; }
    img { position: absolute; right: 58px; top: 50%; width: 520px; transform: translateY(-50%); }
  </style>
  <div class="text"><h1>Lanthorn</h1><p>A locked case, a journal and a brass eyeglass. After dark, a light on a rock that shouldn’t be there.</p><p class="hand">Somebody is keeping it.</p></div>
  <img src="data:image/png;base64,${shot.toString('base64')}">`);
  await card.evaluate(() => document.fonts.ready);
  await card.waitForTimeout(200);
  await save(await card.screenshot(), 'og.png');
}

await browser.close();
server.close();
console.log('screenshots written');
