// The rules, checked in Node:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightOn, sunAt, environment, dither, LAMPBEARER, NELL_PATTERN, BEAT, FAR_BEARING } from '../js/world.js';
import { isLampbearer } from '../js/book.js';

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
