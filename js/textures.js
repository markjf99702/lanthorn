// Wood, paper and leather, made once on a canvas when the page opens, so there are no image files to fetch.
import { fbm, noise2, rng } from './world.js';

const cache = new Map();

function make(key, w, h, paint) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  paint(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL('image/jpeg', 0.86);
  cache.set(key, url);
  return url;
}

// Plank wood, grain running across. `tone` is the base colour, 0..255.
function wood(d, w, h, tone, seed, stretch = 1) {
  const r = rng(seed)();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Tile horizontally by sampling on a loop.
    const a = (x / w) * Math.PI * 2;
    const ux = Math.cos(a) * 3.2 * stretch, uz = Math.sin(a) * 3.2 * stretch;
    const warp = fbm(ux * 0.5 + r * 50, y * 0.01 + uz * 0.5, 3);
    const rings = Math.sin(y * 0.07 + warp * 9 + fbm(ux + 7, uz + y * 0.004, 2) * 3);
    const fine = noise2(ux * 1.5 + 11, y * 0.7 + uz) * 0.6 + noise2(ux * 4 + 30, y * 2.1 + uz * 3) * 0.4;
    let v = 0.66 + rings * 0.07 + (fine - 0.5) * 0.3 + (warp - 0.5) * 0.3;
    // Plank seams.
    const seam = y % 256;
    if (seam < 2) v *= 0.45;
    v = Math.max(0.2, Math.min(1.3, v));
    const i = (y * w + x) * 4;
    d[i] = tone[0] * v; d[i + 1] = tone[1] * v; d[i + 2] = tone[2] * v; d[i + 3] = 255;
  }
}

export const deskWood = () => make('desk', 640, 512, (d, w, h) => wood(d, w, h, [92, 60, 38], 3, 1));
export const walnut = () => make('walnut', 512, 384, (d, w, h) => {
  wood(d, w, h, [118, 74, 44], 11, 1.6);
});

export const paper = () => make('paper', 512, 512, (d, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = (x / w) * Math.PI * 2, b = (y / h) * Math.PI * 2;
    const blot = fbm(Math.cos(a) * 2 + Math.sin(b) * 0.3, Math.sin(a) * 2 + Math.cos(b) * 2.2, 4);
    const fib = noise2(x * 0.7, y * 0.7) * 0.6 + noise2(x * 2.1, y * 2.3) * 0.4;
    const fox = Math.max(0, fbm(x * 0.03 + 40, y * 0.03, 3) - 0.66) * 3;
    const v = 1 - (blot - 0.5) * 0.12 - (fib - 0.5) * 0.06;
    const i = (y * w + x) * 4;
    d[i] = (233 - fox * 30) * v; d[i + 1] = (222 - fox * 44) * v; d[i + 2] = (196 - fox * 60) * v; d[i + 3] = 255;
  }
});

export const leather = (key, tone) => make('leather-' + key, 384, 384, (d, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = (x / w) * Math.PI * 2, b = (y / h) * Math.PI * 2;
    const X = Math.cos(a) * 6, Y = Math.sin(a) * 6, Z = Math.cos(b) * 6, Q = Math.sin(b) * 6;
    const pebble = noise2(X * 3 + Z * 3, Y * 3 + Q * 3);
    const wear = fbm(X * 0.4 + Z * 0.3, Y * 0.4 + Q * 0.3, 3);
    const crease = Math.abs(noise2(X * 0.9 + Q, Y * 0.9 + Z) - 0.5) < 0.012 ? 0.8 : 1;
    const v = (0.82 + pebble * 0.22 + (wear - 0.5) * 0.5) * crease;
    const i = (y * w + x) * 4;
    d[i] = tone[0] * v; d[i + 1] = tone[1] * v; d[i + 2] = tone[2] * v; d[i + 3] = 255;
  }
});

// Hand the textures to CSS and to the SVG pictures on the page.
export function applyTextures(root = document) {
  const s = document.documentElement.style;
  s.setProperty('--desk-img', `url(${deskWood()})`);
  s.setProperty('--paper-img', `url(${paper()})`);
  s.setProperty('--walnut-img', `url(${walnut()})`);
  s.setProperty('--book-img', `url(${leather('book', [96, 30, 26])})`);
  for (const el of root.querySelectorAll('image[data-tex]')) {
    const t = el.dataset.tex;
    const url = t === 'walnut' ? walnut() : t === 'journal' ? leather('journal', [70, 52, 34]) : t === 'book' ? leather('book', [96, 30, 26]) : paper();
    el.setAttribute('href', url);
  }
}
