// Lanthorn itself: one rock with a lighthouse, the sea all the way round, and what else turned up.
// Everything is drawn a pixel at a time into an RGBA buffer, from any point, facing any way, at any hour.
// Positions are in metres, x east and y north, with Nell's lighthouse at the origin.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const FAR_BEARING = 245;
const FAR_DIST = 300;

const polar = (bearing, dist) => ({ x: Math.sin(bearing * D2R) * dist, y: Math.cos(bearing * D2R) * dist });

// Where you can stand. `eye` is height above the sea.
export const HOME = { x: 0, y: 0, eye: 28 };
export const FAR = { ...polar(FAR_BEARING, FAR_DIST), eye: 33 };

// ---------- small maths ----------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap180 = a => { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; };

export function rng(seed) {
  let a = seed | 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Value noise on a 256 lattice, smooth and repeatable.
const PERM = new Uint8Array(512);
const GRAD = new Float32Array(256);
{
  const r = rng(7);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) GRAD[i] = r();
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const X = xi & 255, Y = yi & 255;
  const a = GRAD[PERM[PERM[X] + Y]], b = GRAD[PERM[PERM[X + 1] + Y]];
  const c = GRAD[PERM[PERM[X] + Y + 1]], d = GRAD[PERM[PERM[X + 1] + Y + 1]];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}
const n1 = x => noise2(x, 17.3);

// ---------- the sun and the sky ----------

// The sun rises due east at six and sets due west at six, every day, all year.
export function sunAt(hours) {
  return {
    az: (((90 + (hours - 6) * 15) % 360) + 360) % 360,
    alt: 34 * Math.sin((hours - 6) / 12 * Math.PI),
  };
}

// Sky colours by the sun's height: zenith, horizon, horizon under the sun, sunlight, ambient light.
const KEYS = [
  { alt: 34, zen: [92, 128, 166], hor: [190, 201, 205], sh: [226, 226, 214], light: [255, 246, 228], li: 1.0, amb: [0.34, 0.37, 0.42], glow: 0.35 },
  { alt: 14, zen: [84, 116, 156], hor: [196, 196, 186], sh: [236, 212, 166], light: [255, 232, 196], li: 0.95, amb: [0.30, 0.32, 0.38], glow: 0.55 },
  { alt: 5, zen: [70, 92, 134], hor: [196, 172, 148], sh: [242, 186, 120], light: [255, 196, 140], li: 0.85, amb: [0.24, 0.24, 0.32], glow: 0.9 },
  { alt: 0, zen: [50, 64, 106], hor: [160, 122, 118], sh: [236, 150, 88], light: [255, 150, 90], li: 0.6, amb: [0.17, 0.16, 0.24], glow: 1.0 },
  { alt: -3, zen: [32, 42, 80], hor: [104, 82, 102], sh: [196, 108, 80], light: [200, 110, 90], li: 0.15, amb: [0.11, 0.11, 0.18], glow: 0.8 },
  { alt: -7, zen: [16, 22, 48], hor: [56, 52, 80], sh: [104, 64, 70], light: [0, 0, 0], li: 0, amb: [0.06, 0.065, 0.11], glow: 0.45 },
  { alt: -12, zen: [7, 10, 24], hor: [22, 28, 48], sh: [34, 32, 48], light: [0, 0, 0], li: 0, amb: [0.03, 0.035, 0.06], glow: 0.15 },
  { alt: -20, zen: [3, 5, 12], hor: [12, 16, 28], sh: [12, 16, 28], light: [0, 0, 0], li: 0, amb: [0.02, 0.024, 0.04], glow: 0 },
];

function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function skyKey(alt) {
  if (alt >= KEYS[0].alt) return KEYS[0];
  for (let i = 1; i < KEYS.length; i++) {
    if (alt >= KEYS[i].alt) {
      const a = KEYS[i - 1], b = KEYS[i], t = (a.alt - alt) / (a.alt - b.alt);
      return {
        zen: lerp3(a.zen, b.zen, t), hor: lerp3(a.hor, b.hor, t), sh: lerp3(a.sh, b.sh, t),
        light: lerp3(a.light, b.light, t), li: a.li + (b.li - a.li) * t, amb: lerp3(a.amb, b.amb, t), glow: a.glow + (b.glow - a.glow) * t,
      };
    }
  }
  return KEYS[KEYS.length - 1];
}

// ---------- clouds: a strip of sky from the horizon up to 34 degrees, all the way round ----------

const CW = 720, CH = 68, C_DEG = 0.5;
const CLOUD = new Float32Array(CW * CH);
{
  for (let y = 0; y < CH; y++) {
    const alt = y * C_DEG;
    for (let x = 0; x < CW; x++) {
      const a = x / CW; // wraps: sample on a circle so 0 and 360 meet
      const cx = Math.cos(a * Math.PI * 2) * 5.5, cy = Math.sin(a * Math.PI * 2) * 5.5;
      let d = fbm(cx, cy + alt * 0.34, 5);
      d += 0.22 * fbm(cx * 3.1 + 40, cy * 3.1 + alt * 1.3, 3) - 0.1;
      // Long bands low down, broken wisps higher up.
      const band = smooth(0.5, 3, alt) * (1 - smooth(10, 30, alt)) * 0.85 + 0.15;
      CLOUD[y * CW + x] = smooth(0.52, 0.78, d * band + 0.18);
    }
  }
}
function cloudAt(az, alt) {
  if (alt < 0 || alt >= (CH - 1) * C_DEG) return 0;
  let fx = (az / 360) * CW; fx = ((fx % CW) + CW) % CW;
  const fy = alt / C_DEG;
  const x0 = fx | 0, y0 = fy | 0, x1 = (x0 + 1) % CW;
  const tx = fx - x0, ty = fy - y0;
  const a = CLOUD[y0 * CW + x0], b = CLOUD[y0 * CW + x1], c = CLOUD[(y0 + 1) * CW + x0], d = CLOUD[(y0 + 1) * CW + x1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

// ---------- stars: they never move here ----------

// The Lampbearer, on a grid 2.1 degrees square, x to the right, y up. The lamp is the bright one at the top.
export const LAMPBEARER = [[1, 0], [0, 1], [1, 2], [2, 2], [2, 4]];
const GRID = 2.1;
const LB_ORIGIN = { az: FAR_BEARING - GRID, alt: 5.4 };

const STARS = [];
{
  const r = rng(1234);
  for (let i = 0; i < 520; i++) {
    const az = r() * 360;
    const alt = Math.asin(r()) * R2D * 0.95 + 0.6;
    // Keep the patch round the Lampbearer quiet, so the five stand out.
    if (Math.abs(wrap180(az - (FAR_BEARING))) < 7 && alt > 3 && alt < 17) continue;
    const m = Math.pow(r(), 3.2);
    STARS.push({ az, alt, b: 0.16 + m * 0.84, tw: r() * 100, warm: r() });
  }
  // A few faint ones near the figure, off its grid.
  const near = [[-5.6, 4.1], [4.8, 7.7], [-3.9, 11.9], [5.9, 14.6], [0.9, 15.8], [-6.4, 16.2], [3.3, 3.6]];
  for (const [dx, a] of near) STARS.push({ az: FAR_BEARING + dx, alt: a, b: 0.24 + r() * 0.12, tw: r() * 100, warm: r() });
  LAMPBEARER.forEach(([gx, gy], i) => STARS.push({
    az: LB_ORIGIN.az + gx * GRID, alt: LB_ORIGIN.alt + gy * GRID, b: i === 4 ? 1.35 : 0.95, tw: i * 13.1, warm: 0.2, lb: true,
  }));
}

// ---------- things in the water ----------

// Materials: base colour 0..1.
const MAT = [
  null,
  [0.29, 0.28, 0.27], // 1 rock
  [0.12, 0.12, 0.13], // 2 wet rock
  [0.21, 0.20, 0.20], // 3 dark stone (the far tower)
  [0.84, 0.82, 0.77], // 4 whitewash (Nell's tower)
  [0.07, 0.07, 0.08], // 5 iron
  [0.05, 0.065, 0.075], // 6 glass, unlit
  [1, 0.83, 0.52], // 7 glass, lit (glows)
  [0.19, 0.14, 0.10], // 8 old wood
  [0.46, 0.15, 0.10], // 9 buoy paint
  [0.36, 0.34, 0.31], // 10 cairn stones
  [0.02, 0.02, 0.025], // 11 dark window
  [0.40, 0.38, 0.35], // 12 stair stone
];

// What `sample` fills in: material, how far the surface turns right (degrees), how much it faces up, occlusion.
const S = { m: 0, turn: 0, up: 0, ao: 1 };

function rockProfile(u, halfW, height, seed, lean) {
  const t = u / halfW; // -1..1
  if (t <= -1 || t >= 1) return -1;
  const base = Math.pow(1 - t * t, 0.55) * height;
  const rough = (n1(u * 0.35 + seed) - 0.5) * height * 0.22 + (n1(u * 1.7 + seed * 3) - 0.5) * height * 0.06;
  return base * (1 + lean * t) + rough;
}

function sampleRock(u, h, halfW, height, seed, lean) {
  const top = rockProfile(u, halfW, height, seed, lean);
  if (h > top) return false;
  const top2 = rockProfile(u + 0.6, halfW, height, seed, lean);
  const slope = (top2 - top) / 0.6;
  const strata = n1(h * 1.3 + seed + u * 0.05);
  S.m = h < 1.1 + n1(u * 0.8 + seed) * 0.5 ? 2 : 1;
  S.turn = clamp(-slope * 35, -70, 70) + (strata - 0.5) * 50;
  S.up = clamp(1 - (top - h) / 1.6, 0, 1) * 0.7;
  S.ao = 0.75 + 0.25 * strata;
  return true;
}

// A round tower: base radius r0, top radius r1, height ht, standing at `base` metres.
function sampleTower(u, h, base, r0, r1, ht, wall, lit, glassMat) {
  const y = h - base;
  if (y < 0) return false;
  let r;
  if (y <= ht) r = r0 + (r1 - r0) * (y / ht);
  else if (y <= ht + 0.9) r = r1 + 0.9; // gallery floor
  else if (y <= ht + 1.9) { // gallery rail: thin bars and a top rail
    const top = y > ht + 1.75;
    const bar = Math.abs(((u / 0.9) % 1 + 1) % 1 - 0.5) < 0.12;
    if (Math.abs(u) < r1 + 0.9 && (top || bar)) { S.m = 5; S.turn = 0; S.up = 0; S.ao = 1; return true; }
    r = r1 * 0.72;
  } else if (y <= ht + 5.2) r = r1 * 0.72; // lantern room
  else if (y <= ht + 7.2) { const k = (y - ht - 5.2) / 2; r = r1 * 0.8 * Math.sqrt(Math.max(0, 1 - k * k)); } // dome
  else if (y <= ht + 8.4) r = 0.18; // finial
  else return false;
  if (Math.abs(u) >= r) return false;
  const th = Math.asin(u / r) * R2D;
  S.turn = th; S.up = 0; S.ao = 1;
  if (y <= ht) {
    S.m = wall;
    // Two slit windows up the tower, and a door.
    if ((Math.abs(y - ht * 0.42) < 0.9 || Math.abs(y - ht * 0.72) < 0.9) && Math.abs(u - r * 0.15) < 0.35) S.m = 11;
    if (y < 2.4 && Math.abs(u + r * 0.25) < 0.6) S.m = 11;
    S.ao = 0.8 + 0.2 * smooth(0, 3, y);
  } else if (y <= ht + 0.9) { S.m = 5; S.up = 0.4; }
  else if (y <= ht + 5.2) {
    // Lantern panes with iron glazing bars.
    const bars = Math.abs(((th / 30) % 1 + 1) % 1 - 0.5) > 0.44 || y < ht + 2.4 || y > ht + 5.0;
    S.m = bars ? 5 : (lit ? 7 : glassMat);
  } else { S.m = 5; S.up = 0.6; }
  return true;
}

// The far rock, with the stair cut down its western side into the sea.
function sampleFarRock(u, h, view) {
  if (sampleTower(u, h, 11.2, 3.8, 3.0, 17, 3, view.lit, 6)) return true;
  // The stair: steps cut into the rock face, going down into the water on the left.
  if (u > -19 && u < -9.5) {
    const stepTop = (u + 19) * 0.95 - 0.6; // rises to the right
    const q = Math.floor(stepTop / 0.75) * 0.75;
    if (h < q && h > -1 && h > stepTop - 3.2) {
      S.m = 12; S.turn = -20; S.up = (h > q - 0.2) ? 0.8 : 0.1; S.ao = h > q - 0.2 ? 1 : 0.7; return true;
    }
  }
  return sampleRock(u, h, 24, 13, 4.1, 0.1);
}

function sampleHomeRock(u, h, view) {
  if (sampleTower(u, h, 8, 4.3, 3.3, 18, 4, false, 6)) return true;
  // The little dock on the north side, no boat.
  if (u > 6 && u < 19 && h > 0.9 && h < 1.6) { S.m = 8; S.turn = 0; S.up = 0.5; S.ao = 0.9; return true; }
  if (u > 7 && u < 19 && h > -1 && h < 1.6 && Math.abs(((u - 7) / 2.8 % 1) - 0.5) > 0.4) { S.m = 8; S.turn = 0; S.up = 0; S.ao = 0.6; return true; }
  return sampleRock(u, h, 22, 10, 9.7, -0.15);
}

function sampleWreck(u, h, view) {
  // The bow of a ship, tipped up out of the water, a mast leaning off it, and ribs where the stern went down.
  const lean = 0.36;
  const mx = u + 1 - h * lean;
  if (h > 2 && h < 16 && Math.abs(mx) < 0.3 + (16 - h) * 0.012) { S.m = 8; S.turn = mx * 150; S.up = 0; S.ao = 0.9; return true; }
  const yard = 11.2, yu = u + 1 - yard * lean;
  if (Math.abs(h - yard - yu * 0.2) < 0.24 && yu > -6 && yu < 3.5) { S.m = 8; S.turn = 0; S.up = 0.2; S.ao = 0.9; return true; }
  // The hull: rises from the water on the left to the stem on the right.
  if (u > -9 && u < 9.5) {
    const t = (u + 9) / 18.5;
    const top = -0.4 + t * t * 7.5;           // the gunwale, climbing to the bow
    const stem = 9.5 - Math.pow(Math.max(0, h - 1), 1.25) * 0.28; // the stem curves back as it rises
    if (h < top && u < stem && h > -1) {
      const plank = Math.abs(((h / 0.7) % 1 + 1) % 1 - 0.5) < 0.08;
      S.m = 8; S.turn = -25 + t * 20; S.up = h > top - 0.35 ? 0.7 : 0; S.ao = plank ? 0.6 : 0.85 - (top - h) * 0.03; return true;
    }
  }
  // Ribs of the stern, just breaking the water.
  if (u > -17 && u < -9) {
    const rib = Math.abs(((u / 1.5) % 1 + 1) % 1 - 0.5) < 0.18;
    const top = 1.6 + Math.sin((u + 17) / 8 * Math.PI) * 0.9;
    if (rib && h > -1 && h < top) { S.m = 8; S.turn = 0; S.up = 0; S.ao = 0.6; return true; }
  }
  return false;
}

function sampleBuoy(u, h, view) {
  const bob = Math.sin(view.clock * 1.3) * 0.25;
  const y = h - bob;
  if (y < -0.2 || y > 4.2) return false;
  if (y < 0.9) { if (Math.abs(u) < 1.2 - y * 0.2) { S.m = 9; S.turn = Math.asin(clamp(u / 1.2, -1, 1)) * R2D; S.up = 0; S.ao = 1; return true; } return false; }
  // Cage: three legs converging to the bell.
  const w = 1.0 * (1 - (y - 0.9) / 3.3);
  if (Math.abs(Math.abs(u) - w) < 0.1 || Math.abs(u) < 0.07) { S.m = 9; S.turn = 0; S.up = 0; S.ao = 0.9; return true; }
  if (y > 2.5 && y < 3.2 && Math.abs(u) < 0.35 + (3.2 - y) * 0.2) { S.m = 5; S.turn = u * 120; S.up = 0; S.ao = 1; return true; }
  if (y > 3.9 && Math.abs(u) < 0.4) { S.m = 9; S.turn = 0; S.up = 0.3; S.ao = 1; return true; }
  return false;
}

function sampleSkerry(u, h, view) {
  // The cairn: five stones, biggest at the bottom.
  const stones = [[0, 4.6, 1.9, 0.8], [0.25, 5.9, 1.5, 0.66], [-0.15, 7.0, 1.15, 0.54], [0.15, 7.9, 0.85, 0.44], [0, 8.65, 0.6, 0.34]];
  for (const [cx, cy, rx, ry] of stones) {
    const dx = (u - cx) / rx, dy = (h - cy) / ry;
    if (dx * dx + dy * dy < 1) { S.m = 10; S.turn = dx * 60; S.up = clamp(dy, 0, 1) * 0.7; S.ao = 0.6 + 0.4 * clamp(dy + 0.5, 0, 1); return true; }
  }
  return sampleRock(u, h, 19, 4.4, 22.2, 0.2);
}

export const PLACES = [
  { id: 'home', ...HOME, halfW: 24, height: 36, sample: sampleHomeRock, show: () => 1 },
  { id: 'far', ...polar(FAR_BEARING, FAR_DIST), halfW: 26, height: 37, sample: sampleFarRock, show: env => env.farVis, lantern: 11.2 + 17 + 3.5 },
  { id: 'wreck', ...polar(128, 150), halfW: 18, height: 17, sample: sampleWreck, show: () => 1 },
  { id: 'buoy', ...polar(198, 115), halfW: 1.6, height: 4.4, sample: sampleBuoy, show: () => 1 },
  { id: 'skerry', ...polar(24, 175), halfW: 19, height: 9.5, sample: sampleSkerry, show: () => 1 },
];

// ---------- the light on the far rock ----------

export const NELL_PATTERN = 'LSLL';
// Seconds. The short flash is well under the picture's short press (SHORT_MAX in book.js), so a press held as long
// as the flash looked still counts as short.
export const BEAT = { S: 0.24, L: 1.15, gap: 0.55, rest: 2.8 };

// Is the far light showing at `sec` seconds, for a pattern like "LSLL"?
export function lightOn(pattern, sec) {
  let total = 0;
  for (const c of pattern) total += BEAT[c] + BEAT.gap;
  total += BEAT.rest;
  let t = ((sec % total) + total) % total;
  for (const c of pattern) {
    if (t < BEAT[c]) return true;
    t -= BEAT[c];
    if (t < BEAT.gap) return false;
    t -= BEAT.gap;
  }
  return false;
}

// ---------- the scene for one moment ----------

// hours: time of day in Lanthorn; clock: seconds, for the sea and the light.
export function environment(hours, clock, pattern = NELL_PATTERN) {
  const sun = sunAt(hours);
  const k = skyKey(sun.alt);
  const dark = smooth(-2, -5, sun.alt);
  return {
    hours, clock, sun, ...k,
    starVis: smooth(-3.5, -11, sun.alt),
    farVis: smooth(0.5, -5.5, sun.alt),
    lightOn: dark > 0.5 && lightOn(pattern, clock),
    lightFade: dark,
    haze: 700 + 600 * smooth(10, -8, sun.alt),
  };
}

function skyInto(out, az, alt, env) {
  const dAz = wrap180(az - env.sun.az);
  const t = Math.pow(clamp(alt / 42, 0, 1), 0.55);
  let r = env.hor[0] + (env.zen[0] - env.hor[0]) * t;
  let g = env.hor[1] + (env.zen[1] - env.hor[1]) * t;
  let b = env.hor[2] + (env.zen[2] - env.hor[2]) * t;
  // The sky is brighter and warmer on the sun's side, low down.
  const f = env.glow * Math.exp(-(dAz * dAz) / 1100) * Math.exp(-Math.max(alt, 0) / 9);
  r += (env.sh[0] - r) * f; g += (env.sh[1] - g) * f; b += (env.sh[2] - b) * f;
  // Clouds.
  const c = cloudAt(az + env.clock * 0.012, alt);
  if (c > 0) {
    const lit = env.glow * Math.exp(-(dAz * dAz) / 3800);
    const under = smooth(3, -4, env.sun.alt); // after sunset the undersides glow and then go dark
    let cr = env.hor[0] * 0.92 + 18, cg = env.hor[1] * 0.92 + 16, cb = env.hor[2] * 0.92 + 14;
    cr += (env.sh[0] * 1.08 - cr) * lit * (0.6 + 0.4 * under); cg += (env.sh[1] * 0.98 - cg) * lit * (0.6 + 0.4 * under); cb += (env.sh[2] * 0.9 - cb) * lit * (0.6 + 0.4 * under);
    const night = smooth(-6, -14, env.sun.alt);
    cr = cr * (1 - night) + env.zen[0] * 0.8 * night; cg = cg * (1 - night) + env.zen[1] * 0.8 * night; cb = cb * (1 - night) + env.zen[2] * 0.85 * night;
    const k = c * 0.92;
    r += (cr - r) * k; g += (cg - g) * k; b += (cb - b) * k;
  }
  // The sun itself.
  if (env.sun.alt > -1.5) {
    const d = Math.hypot(dAz, alt - env.sun.alt);
    const disc = smooth(1.05, 0.8, d) * (1 - c * 0.7);
    const halo = Math.exp(-d / 2.2) * 0.55 * (1 - c * 0.5);
    r += (255 - r) * disc + env.sh[0] * halo; g += (246 - g) * disc + env.sh[1] * halo * 0.9; b += (225 - b) * disc + env.sh[2] * halo * 0.7;
  }
  out[0] = r; out[1] = g; out[2] = b; out[3] = c;
}

const tmp = new Float32Array(4);

// Wave slope at a point on the sea.
function waves(x, y, t) {
  return 0.42 * Math.cos(x * 0.21 + y * 0.05 - t * 1.1)
    + 0.30 * Math.cos(x * -0.13 + y * 0.31 - t * 1.4)
    + 0.18 * Math.cos(x * 0.47 + y * 0.29 - t * 2.1)
    + 0.10 * Math.cos(x * -0.61 + y * 0.83 - t * 2.9);
}

// view: { x, y, eye, heading, pitch, fov (degrees across the width), W, H }
// opts: { pattern, circle, railing, frame }
export function render(data, view, env, opts = {}) {
  const { W, H } = view;
  const ppd = W / view.fov;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2;
  const lit = env.lightOn;
  const far = PLACES[1];
  const lightBearing = Math.atan2(far.x - view.x, far.y - view.y) * R2D;
  const lightDist = Math.hypot(far.x - view.x, far.y - view.y);
  const lightAlt = Math.atan2(far.lantern - view.eye, lightDist) * R2D;
  const showLight = lit && env.farVis > 0.6 && lightDist > 5;
  const glintW = 0.6 + 900 / lightDist * 0.02;

  // Sky and sea.
  for (let py = 0; py < H; py++) {
    const alt = view.pitch + (cy - py - 0.5) / ppd;
    const tanDown = Math.tan(-alt * D2R);
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      if (opts.circle) {
        const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
        if (dx * dx + dy * dy > R * R) { data[i + 3] = 0; continue; }
      }
      const az = view.heading + (px + 0.5 - cx) / ppd;
      data[i + 3] = 255;
      if (alt >= 0) {
        skyInto(tmp, az, alt, env);
        data[i] = tmp[0]; data[i + 1] = tmp[1]; data[i + 2] = tmp[2];
        continue;
      }
      // The sea: mostly a mirror near the horizon, darker looking down. Waves tip the mirror about.
      const d = view.eye / tanDown;
      const wx = view.x + Math.sin(az * D2R) * d, wy = view.y + Math.cos(az * D2R) * d;
      const fade = Math.exp(-d / 260);
      const s = waves(wx, wy, env.clock) * fade;
      const reflAlt = clamp(-alt * 1.6 + s * (2.5 + 12 * fade), 0.05, 60);
      skyInto(tmp, az + s * 3 * fade, reflAlt, env);
      const fres = 1 - Math.exp(alt / 5.5);
      const deepR = env.zen[0] * 0.28 + 6, deepG = env.zen[1] * 0.36 + 8, deepB = env.zen[2] * 0.4 + 10;
      let r = tmp[0] * 0.8 + (deepR - tmp[0] * 0.8) * fres;
      let g = tmp[1] * 0.82 + (deepG - tmp[1] * 0.82) * fres;
      let b = tmp[2] * 0.85 + (deepB - tmp[2] * 0.85) * fres;
      // Crests catch the light; troughs go dark.
      const crest = clamp(s * 1.4, -0.6, 1);
      r *= 1 + crest * 0.16; g *= 1 + crest * 0.16; b *= 1 + crest * 0.14;
      // Glitter under the sun.
      if (env.sun.alt > -1) {
        const dAz = wrap180(az - env.sun.az);
        const spread = 1.6 + env.sun.alt * 0.18 + (-alt) * 0.5;
        const g0 = Math.exp(-(dAz * dAz) / (spread * spread)) * smooth(-1, 2, env.sun.alt);
        if (g0 > 0.01) {
          const sp = Math.pow(clamp(s * 1.6 + (noise2(wx * 0.9, wy * 0.9 + env.clock * 0.7) - 0.5) * 1.4, 0, 1), 3) * g0 * 1.4;
          r += env.sh[0] * sp * 1.3; g += env.sh[1] * sp * 1.15; b += env.sh[2] * sp * 0.9;
        }
      }
      // Your own lamp, from the far rock, laid out across the water ahead.
      if (opts.beam) {
        const dAz = wrap180(az - view.heading);
        const k = opts.beam * Math.exp(-(dAz * dAz) / 30) * Math.pow(clamp(s * 2 + (noise2(wx * 1.1, wy * 1.1 + env.clock * 0.8) - 0.5) * 1.6, 0, 1), 2) * (0.35 + 0.65 * Math.exp(-d / 220));
        const wash = opts.beam * 0.35 * Math.exp(-d / 70) * Math.exp(-(dAz * dAz) / 900);
        r += 255 * (k + wash); g += 196 * (k + wash); b += 120 * (k + wash);
      }
      // The far light, laid across the water towards you.
      if (showLight && alt < lightAlt) {
        const dAz = wrap180(az - lightBearing);
        if (Math.abs(dAz) < glintW * 3 && d < lightDist) {
          const k = Math.exp(-(dAz * dAz) / (glintW * glintW)) * Math.pow(clamp(s * 2 + (noise2(wx * 1.3, wy * 1.3 + env.clock) - 0.5) * 1.8, 0, 1), 2);
          r += 255 * k; g += 200 * k; b += 120 * k;
        }
      }
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }

  // Stars.
  if (env.starVis > 0) {
    for (const st of STARS) {
      const dAz = wrap180(st.az - view.heading);
      const px = cx + dAz * ppd, py = cy - (st.alt - view.pitch) * ppd;
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      const tw = 0.82 + 0.18 * Math.sin(env.clock * 2.3 + st.tw) * Math.sin(env.clock * 1.7 + st.tw * 2);
      const ext = smooth(0.5, 5, st.alt);
      let k = st.b * env.starVis * tw * ext;
      const c = cloudAt(st.az + env.clock * 0.012, st.alt);
      k *= 1 - c * 0.6;
      if (k <= 0.02) continue;
      const wr = st.warm > 0.75 ? 1 : 0.86, wb = st.warm < 0.25 ? 1 : 0.88;
      const R0 = opts.circle ? R : 0;
      // A soft splat, bigger for brighter stars, so they survive being scaled up.
      const size = st.lb ? (st.b > 1.2 ? 2.8 : 2.1) : st.b > 0.75 ? 0.95 : 0.6;
      const reach = Math.ceil(size * 1.6);
      for (let oy = -reach; oy <= reach; oy++) for (let ox = -reach; ox <= reach; ox++) {
        const qx = (px | 0) + ox, qy = (py | 0) + oy;
        const dd = ((qx + 0.5 - px) ** 2 + (qy + 0.5 - py) ** 2) / (size * size);
        const a = k * (st.lb ? 1.25 : 1) * Math.exp(-dd * 1.6);
        if (a > 0.015) plot(data, W, H, qx, qy, 255 * wr, 244, 255 * wb, a, R0, cx, cy);
      }
    }
  }

  // Things in the water, furthest first.
  const seen = [];
  for (const p of PLACES) {
    const vis = p.show(env);
    if (vis <= 0.01) continue;
    const dist = Math.hypot(p.x - view.x, p.y - view.y);
    if (dist < 1) continue; // you're standing on it
    seen.push({ p, dist, vis, bearing: Math.atan2(p.x - view.x, p.y - view.y) * R2D });
  }
  seen.sort((a, b) => b.dist - a.dist);
  const vctx = { clock: env.clock, lit: false };
  for (const { p, dist, vis, bearing } of seen) {
    vctx.lit = p.id === 'far' && showLight;
    const half = Math.atan2(p.halfW, dist) * R2D;
    const dAz = wrap180(bearing - view.heading);
    const x0 = Math.max(0, Math.floor(cx + (dAz - half) * ppd)), x1 = Math.min(W - 1, Math.ceil(cx + (dAz + half) * ppd));
    if (x1 < 0 || x0 > W - 1 || x0 > x1) continue;
    const topAlt = Math.atan2(p.height - view.eye, dist) * R2D;
    const botAlt = Math.atan2(-1.2 - view.eye, dist) * R2D;
    const y0 = Math.max(0, Math.floor(cy - (topAlt - view.pitch) * ppd)), y1 = Math.min(H - 1, Math.ceil(cy - (botAlt - view.pitch) * ppd));
    const hz = 1 - Math.exp(-dist / env.haze);
    for (let py = y0; py <= y1; py++) {
      const alt = view.pitch + (cy - py - 0.5) / ppd;
      const h = view.eye + dist * Math.tan(alt * D2R);
      for (let px = x0; px <= x1; px++) {
        const i = (py * W + px) * 4;
        if (opts.circle && data[i + 3] === 0) continue;
        const az = view.heading + (px + 0.5 - cx) / ppd;
        const u = dist * Math.tan(wrap180(az - bearing) * D2R);
        if (h < -1.2) continue;
        if (!p.sample(u, h, vctx)) continue;
        if (h < 0 && S.m !== 2 && S.m !== 12) continue;
        shade(tmp, S, bearing, env, u, h);
        if (opts.beam) {
          const k = opts.beam * 0.55 * Math.exp(-dist / 420) * Math.max(0.15, Math.cos(S.turn * D2R));
          tmp[0] += 255 * k * MAT[S.m][0]; tmp[1] += 196 * k * MAT[S.m][1]; tmp[2] += 120 * k * MAT[S.m][2];
        }
        if (vctx.lit && p.lantern) {
          // The lamp lights the top of its own tower.
          const k = Math.exp(-Math.abs(h - p.lantern) / 3.2) * Math.exp(-Math.abs(u) / 5) * 0.9 * (S.m === 7 ? 0 : 1);
          tmp[0] += 255 * k * MAT[S.m][0] * 2; tmp[1] += 190 * k * MAT[S.m][1] * 2; tmp[2] += 110 * k * MAT[S.m][2] * 2;
        }
        // Haze, towards the colour of the sky behind.
        skyInto(tmpSky, az, 0.4, env);
        let a = hz, r = tmp[0], g = tmp[1], b = tmp[2];
        if (h < 0) { r *= 0.55; g *= 0.6; b *= 0.7; } // just under the surface
        r += (tmpSky[0] - r) * a; g += (tmpSky[1] - g) * a; b += (tmpSky[2] - b) * a;
        const v = vis;
        data[i] = data[i] + (r - data[i]) * v; data[i + 1] = data[i + 1] + (g - data[i + 1]) * v; data[i + 2] = data[i + 2] + (b - data[i + 2]) * v;
      }
    }
  }

  // The far lamp's glow.
  if (showLight) {
    const dAz = wrap180(lightBearing - view.heading);
    const gx = cx + dAz * ppd, gy = cy - (lightAlt - view.pitch) * ppd;
    const rad = Math.max(1.6, ppd * 0.55);
    glow(data, W, H, gx, gy, rad, [255, 214, 150], 0.95 * env.lightFade, opts.circle ? R : 0, cx, cy);
  }

  if (opts.homeGlint) {
    const home = PLACES[0];
    const b = Math.atan2(home.x - view.x, home.y - view.y) * R2D, dist = Math.hypot(home.x - view.x, home.y - view.y);
    const a = Math.atan2(8 + 18 + 3.4 - view.eye, dist) * R2D;
    glow(data, W, H, cx + wrap180(b - view.heading) * ppd, cy - (a - view.pitch) * ppd, Math.max(1.2, ppd * 0.35), [220, 235, 255], opts.homeGlint, opts.circle ? R : 0, cx, cy);
  }

  if (opts.railing) railing(data, view, env, ppd, cx, cy, opts.circle ? R : 0);
}

const tmpSky = new Float32Array(4);

function shade(out, s, bearing, env, u, h) {
  const m = MAT[s.m];
  if (s.m === 7) { out[0] = 255; out[1] = 222; out[2] = 160; return; }
  // Which way the surface faces, as a compass bearing, and how much sunlight lands on it.
  const nAz = bearing + 180 - s.turn;
  const sa = env.sun.alt * D2R;
  const side = Math.cos(sa) * Math.cos((nAz - env.sun.az) * D2R);
  const lam = clamp(side * (1 - s.up) + Math.sin(sa) * s.up + 0.08, 0, 1);
  const li = env.li * lam;
  const skyL = 0.55 + 0.45 * s.up;
  const ao = s.ao;
  const glassy = s.m === 6 ? 0.25 : 0;
  out[0] = 255 * m[0] * ao * (env.amb[0] * skyL + env.light[0] / 255 * li) + env.hor[0] * glassy;
  out[1] = 255 * m[1] * ao * (env.amb[1] * skyL + env.light[1] / 255 * li) + env.hor[1] * glassy;
  out[2] = 255 * m[2] * ao * (env.amb[2] * skyL + env.light[2] / 255 * li) + env.hor[2] * glassy;
}

function plot(data, W, H, x, y, r, g, b, k, R, cx, cy) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  if (R && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > R * R) return;
  const i = (y * W + x) * 4;
  data[i] += (r - data[i]) * Math.min(1, k); data[i + 1] += (g - data[i + 1]) * Math.min(1, k); data[i + 2] += (b - data[i + 2]) * Math.min(1, k);
}

function glow(data, W, H, gx, gy, rad, col, k, R, cx, cy) {
  const x0 = Math.max(0, Math.floor(gx - rad * 6)), x1 = Math.min(W - 1, Math.ceil(gx + rad * 6));
  const y0 = Math.max(0, Math.floor(gy - rad * 6)), y1 = Math.min(H - 1, Math.ceil(gy + rad * 6));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (R && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > R * R) continue;
    const d = Math.hypot(x + 0.5 - gx, y + 0.5 - gy) / rad;
    const a = (Math.exp(-d * d * 2) * 1.1 + Math.exp(-d * 0.9) * 0.12) * k;
    if (a < 0.004) continue;
    const i = (y * W + x) * 4;
    data[i] += col[0] * a; data[i + 1] += col[1] * a; data[i + 2] += col[2] * a;
  }
}

// The gallery rail of Nell's lighthouse, close in front of you when you look down.
function railing(data, view, env, ppd, cx, cy, R) {
  const { W, H } = view;
  const railAlt = -17.5, rail2 = -24;
  const col = [env.amb[0] * 40 + 6, env.amb[1] * 40 + 6, env.amb[2] * 40 + 8];
  const litc = env.li * 0.5;
  for (let py = 0; py < H; py++) {
    const alt = view.pitch + (cy - py - 0.5) / ppd;
    if (alt > railAlt + 1.4) continue;
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      if (R && data[i + 3] === 0) continue;
      const az = view.heading + (px + 0.5 - cx) / ppd;
      const post = Math.abs((((az + 3) / 11) % 1 + 1) % 1 - 0.5) < 0.07;
      const onRail = Math.abs(alt - railAlt) < 1.1 || Math.abs(alt - rail2) < 0.8;
      if (!onRail && !post) continue;
      let k = 1;
      if (onRail) { const e = Math.abs(alt - railAlt) / 1.1; if (e < 1) k = 1 - e * 0.2; }
      const hi = onRail && alt > railAlt + 0.5 ? 1 : 0;
      data[i] = col[0] * k + (env.light[0] * litc * 0.3) * hi;
      data[i + 1] = col[1] * k + (env.light[1] * litc * 0.3) * hi;
      data[i + 2] = col[2] * k + (env.light[2] * litc * 0.3) * hi;
    }
  }
}

// ---------- the look of an old photograph ----------

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
const LUTS = new Map();

// Steps are spaced on a curve, closer together in the dark, so night skies don't turn into a checkerboard.
function lut(levels) {
  if (LUTS.has(levels)) return LUTS.get(levels);
  const t = new Uint8Array(16 * 256);
  for (let b = 0; b < 16; b++) for (let v = 0; v < 256; v++) {
    const q = Math.max(0, Math.min(levels - 1, Math.round(Math.pow(v / 255, 1 / 1.8) * (levels - 1) + BAYER[b])));
    t[b * 256 + v] = Math.round(Math.pow(q / (levels - 1), 1.8) * 255);
  }
  LUTS.set(levels, t);
  return t;
}

// Quantise to a few levels a channel, with an ordered dither, like the pictures on old CD-ROMs.
export function dither(data, W, H, levels = 6) {
  const L = lut(levels);
  for (let y = 0; y < H; y++) {
    const row = (y & 3) * 4;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] === 0) continue;
      const o = (row + (x & 3)) * 256;
      data[i] = L[o + data[i]]; data[i + 1] = L[o + data[i + 1]]; data[i + 2] = L[o + data[i + 2]];
    }
  }
}
