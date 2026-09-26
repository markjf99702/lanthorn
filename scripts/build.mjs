// Bundles the whole thing into one self-contained HTML file, dist/lanthorn.html, for sharing as a single page.
// Also writes dist/artifact.html, the same page without the document wrapper.
// The site itself doesn't need this: it runs straight from the repo.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

const result = await build({
  entryPoints: [new URL('js/app.js', root).pathname],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
});
// A single page has no sw.js next to it, so it doesn't try to register one.
const js = result.outputFiles[0].text
  .replace(/"serviceWorker"in navigator&&isSecureContext&&navigator\.serviceWorker\.register\("sw\.js"\)\.catch\(\(\)=>\{\}\)[,;]?/, '')
  .replace(/<\/script/gi, '<\\/script');
if (js.includes('sw.js')) throw new Error('the service worker registration is still in the bundle');

// Fonts and the icon go in as data: URIs, and the links that only make sense for the hosted site come out.
const dataUri = async (path, type) => `data:${type};base64,${(await readFile(new URL(path, root))).toString('base64')}`;
let css = await read('css/lanthorn.css');
for (const [whole, file] of css.matchAll(/url\(\.\.\/(fonts\/[^)]+\.woff2)\)/g)) css = css.replace(whole, `url(${await dataUri(file, 'font/woff2')})`);
const icon = await dataUri('icon.svg', 'image/svg+xml');
const html = (await read('index.html'))
  .replace(/ *<link rel="(manifest|apple-touch-icon|preload)"[^>]*>\n/g, '')
  .replace('href="icon.svg"', () => `href="${icon}"`)
  .replace('<link rel="stylesheet" href="css/lanthorn.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script>\n${js}</script>`);

const fragment = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body[^>]*>\s*/gi, '')
  .replace(/ *<meta charset[^>]*>\s*/i, '')
  .replace(/ *<meta name="viewport"[^>]*>\s*/i, '');

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/lanthorn.html', root), html);
await writeFile(new URL('dist/artifact.html', root), fragment);
console.log(`dist/lanthorn.html  ${(html.length / 1024).toFixed(1)} KB`);
