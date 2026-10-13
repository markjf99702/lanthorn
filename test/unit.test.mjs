// The rules, checked in Node:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightOn, sunAt, environment, dither, LAMPBEARER, NELL_PATTERN, BEAT, FAR_BEARING } from '../js/world.js';
import { isLampbearer } from '../js/book.js';
import { paperPixels } from '../js/textures.js';

test('the sun rises in the east at six and sets in the west at six', () => {
  assert.equal(sunAt(6).az, 90);
  assert.ok(Math.abs(sunAt(6).alt) < 1e-9);
  assert.equal(sunAt(12).az, 180);
  assert.ok(sunAt(12).alt > 30);
  assert.equal(sunAt(18).az, 270);
  assert.ok(sunAt(0).alt < -30);
});

test('the far rock is only there at dusk and after', () => {
  assert.equal(environment(12, 0).farVis, 0);
  assert.equal(environment(16.5, 0).farVis, 0);
  assert.ok(environment(18.6, 0).farVis > 0.95);
  assert.equal(environment(22, 0).farVis, 1);
  assert.equal(environment(3, 0).farVis, 1);
});

test('the far light only shows after dark', () => {
  let seen = false;
  for (let t = 0; t < 20; t += 0.05) if (environment(14, t).lightOn) seen = true;
  assert.equal(seen, false);
  for (let t = 0; t < 20; t += 0.05) if (environment(21, t).lightOn) seen = true;
  assert.equal(seen, true);
});

test('the light flashes the pattern, long and short, then rests', () => {
  // Measure how long each flash lasts over one repeat.
  const flashes = [];
  let on = false, start = 0;
  for (let t = 0; t < 20; t += 0.01) {
    const now = lightOn(NELL_PATTERN, t);
    if (now && !on) start = t;
    if (!now && on) flashes.push(t - start);
    on = now;
    if (flashes.length === NELL_PATTERN.length) break;
  }
  assert.deepEqual(flashes.map(d => (d > (BEAT.S + BEAT.L) / 2 ? 'L' : 'S')).join(''), NELL_PATTERN);
});

test('the clasp opens for the Lampbearer anywhere on the plate, and nothing else', () => {
  assert.ok(isLampbearer(LAMPBEARER));
  assert.ok(isLampbearer(LAMPBEARER.map(([x, y]) => [x + 1, y])));
  assert.ok(isLampbearer([...LAMPBEARER].reverse()));
  assert.equal(isLampbearer(LAMPBEARER.slice(0, 4)), false);
  assert.equal(isLampbearer(LAMPBEARER.map(([x, y]) => [y, x])), false, 'turned on its side');
  assert.equal(isLampbearer(LAMPBEARER.map(([x, y]) => [-x + 2, y])), false, 'mirrored');
});

test('the far rock stands where the case says', () => {
  assert.equal(FAR_BEARING, 245);
});

test('dithering keeps black black and white white, and stays close', () => {
  const d = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 100, 150, 30, 255, 12, 14, 30, 255]);
  dither(d, 4, 1, 20);
  assert.deepEqual([...d.slice(0, 8)], [0, 0, 0, 255, 255, 255, 255, 255]);
  for (const [a, b] of [[d[8], 100], [d[9], 150], [d[10], 30], [d[12], 12], [d[13], 14]]) assert.ok(Math.abs(a - b) < 16, `${a} vs ${b}`);
});

test('the paper carries on across the join where its tiles meet', () => {
  const w = 512, h = 512, d = new Uint8ClampedArray(w * h * 4);
  paperPixels(d, w, h);
  const lum = (x, y) => { const i = (((y + h) % h) * w + (x + w) % w) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; };
  // How much the paper changes across the line after row (or column) k, averaged over four pixels either side
  // so the fine fibres don't count. The line after the last one is the join with the next tile.
  const across = (k, at) => {
    let sum = 0;
    for (let j = 0; j < w; j++) {
      let a = 0, b = 0;
      for (let s = 0; s < 4; s++) { a += at(j, k - s); b += at(j, k + 1 + s); }
      sum += Math.abs(a - b) / 4;
    }
    return sum / w;
  };
  for (const [name, at] of [['rows', (j, k) => lum(j, k)], ['columns', (j, k) => lum(k, j)]]) {
    const inside = Math.max(...Array.from({ length: w - 10 }, (_, k) => across(k + 4, at)));
    const join = across(w - 1, at);
    assert.ok(join <= inside, `between ${name} the paper jumps ${join.toFixed(2)} at the join, and at most ${inside.toFixed(2)} anywhere else`);
  }
});
