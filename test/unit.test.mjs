// The rules, checked in Node:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightOn, sunAt, environment, dither, LAMPBEARER, NELL_PATTERN, BEAT, FAR_BEARING, isLampbearer } from '../js/world.js';
import { SHORT_MAX } from '../js/book.js';
import { paperPixels } from '../js/textures.js';
import { tidy, settle } from '../js/store.js';
import { JOURNAL } from '../js/text.js';
import { nearMisses, marks } from '../js/sketches.js';

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

test('answering the light by copying it works: a press as long as a flash reads as that flash', () => {
  // Measure every flash in a few repeats (a repeat starts with a flash at 0), then press for as long as each one
  // lasted, a quarter shorter and a quarter longer, the way someone copying what they saw would.
  for (const pattern of ['LSLL', 'SSSS', 'LLLL', 'SLS']) {
    const seen = [];
    let on = false, start = 0;
    for (let t = 0; t < 30; t += 0.001) {
      const now = lightOn(pattern, t);
      if (now && !on) start = t;
      if (!now && on) seen.push(t - start);
      on = now;
    }
    assert.ok(seen.length >= pattern.length * 2, `only ${seen.length} flashes of ${pattern}`);
    seen.forEach((d, i) => {
      const flash = pattern[i % pattern.length];
      for (const k of [0.75, 1, 1.25]) {
        assert.equal(d * k < SHORT_MAX ? 'S' : 'L', flash, `a ${(d * k).toFixed(2)} s press copying ${pattern}'s ${d.toFixed(2)} s flash reads wrong`);
      }
    });
  }
});

test('Nell’s page about the light agrees with whatever light is being kept', () => {
  const page = JOURNAL.find(p => p.sketch === 'marks');
  const says = keeper => page.lines.map(l => (typeof l === 'function' ? l(keeper) : l)).join(' ');
  // Her own light, as she wrote it.
  assert.match(says('LSLL'), /four flashes and a rest/);
  assert.deepEqual(nearMisses('LSLL'), ['LSSL', 'LLSL']);
  // Any light someone could leave after finishing, one to eight flashes: she counts it right, and her two
  // crossed-out tries are never the light itself, never the same as each other, and fit across the page.
  const COUNTS = ['one flash', 'two flashes', 'three flashes', 'four flashes', 'five flashes', 'six flashes', 'seven flashes', 'eight flashes'];
  for (let n = 1; n <= 8; n++) for (let m = 0; m < 1 << n; m++) {
    const light = [...Array(n)].map((_, i) => (m >> i & 1 ? 'L' : 'S')).join('');
    assert.ok(says(light).includes(`: ${COUNTS[n - 1]} and a rest`), `for ${light} she wrote: ${says(light)}`);
    const [a, b] = nearMisses(light);
    assert.ok(/^[SL]+$/.test(a + b) && a !== light && b !== light && a !== b, `for ${light} she crossed out ${a} and ${b}`);
    const svg = marks(light);
    const ends = [
      ...[...svg.matchAll(/d="M([\d.]+) [\d.]+h([\d.]+)"/g)].map(([, x, w]) => +x + +w),
      ...[...svg.matchAll(/cx="([\d.]+)" cy="[\d.]+" r="([\d.]+)"/g)].map(([, x, r]) => +x + +r),
      ...[...svg.matchAll(/L([\d.]+) /g)].map(([, x]) => +x),
    ];
    assert.ok(Math.max(...ends) <= 300, `the crossed-out tries for ${light} run off the page, to ${Math.max(...ends)}`);
  }
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

test('a garbled save keeps what still makes sense, and the rest starts afresh', () => {
  const s = tidy({ caseOpen: 'yes', claspOpen: true, letterRead: 1, digits: null, page: 99, studs: 'none', hours: 'abc', heading: 359.6, pitch: null, keeper: 'SLS' });
  assert.equal(s.caseOpen, false);
  assert.equal(s.claspOpen, true);
  assert.equal(s.letterRead, false);
  assert.deepEqual(s.digits, [0, 0, 0]);
  assert.equal(s.page, JOURNAL.length - 1, 'a page past the end is the last page');
  assert.deepEqual(s.studs, []);
  assert.equal(s.hours, 15.5);
  assert.equal(s.heading, 359.6);
  assert.equal(s.pitch, -1);
  assert.equal(s.keeper, 'SLS');
  assert.equal(tidy({ page: -1 }).page, 0);
  assert.equal(tidy({ page: '3' }).page, 0);
  assert.deepEqual(tidy({ digits: '245' }).digits, [0, 0, 0]);
  assert.deepEqual(tidy({ digits: [2, 4, 12] }).digits, [0, 0, 0]);
  assert.deepEqual(tidy({ studs: [[1, 0], 'x', [2, 2.5], [0, 1]] }).studs, [[1, 0], [0, 1]]);
  assert.equal(tidy({ hours: 25 }).hours, 1, 'an hour past midnight goes round the clock');
  assert.equal(tidy({ hours: -0.5 }).hours, 23.5);
  assert.equal(tidy({ hours: 24 }).hours, 0);
});

test('a real save comes through tidying unchanged', () => {
  // Someone who has finished, left the light saying short, long, short, and turned the sound off.
  const finished = { caseOpen: true, claspOpen: true, awake: true, done: true, letterRead: true, page: 10, digits: [2, 4, 4], studs: [[2, 0], [1, 1], [2, 2], [3, 2], [3, 4]], hours: 23.99, heading: 359.6, pitch: 14, hintsSeen: 0, keeper: 'SLS', sound: false };
  assert.deepEqual(tidy(structuredClone(finished)), finished);
  assert.deepEqual(settle(tidy(structuredClone(finished))), finished);
  // And someone who has only just started.
  const begun = { caseOpen: false, claspOpen: false, awake: false, done: false, letterRead: false, page: 0, digits: [0, 0, 0], studs: [], hours: 15.5, heading: 128, pitch: -1, hintsSeen: 0, keeper: 'LSLL', sound: true };
  assert.deepEqual(tidy(structuredClone(begun)), begun);
  assert.deepEqual(settle(tidy(structuredClone(begun))), begun);
});

test('a lock caught opening when the page closed is open when it comes back', () => {
  // The case: the wheels within two of the bearing, saved before the lid had swung.
  assert.equal(settle(tidy({ digits: [2, 4, 3] })).caseOpen, true);
  assert.equal(settle(tidy({ digits: [2, 4, 7] })).caseOpen, true);
  assert.equal(settle(tidy({ digits: [2, 4, 8] })).caseOpen, false, 'three away from the bearing is still shut');
  assert.equal(settle(tidy({ digits: [2, 4, 0] })).caseOpen, false);
  // The clasp: the Lampbearer's five studs down, saved before the plate had looked at them.
  const lamp = LAMPBEARER.map(([x, y]) => [x + 1, y]);
  const opened = settle(tidy({ caseOpen: true, studs: structuredClone(lamp) }));
  assert.equal(opened.claspOpen, true);
  assert.deepEqual(opened.studs, lamp);
  // Five wrong studs, saved before they popped out: out they come.
  const wrong = settle(tidy({ caseOpen: true, studs: [[1, 1], [2, 1], [3, 1], [2, 2], [2, 3]] }));
  assert.equal(wrong.claspOpen, false);
  assert.deepEqual(wrong.studs, []);
  // Four studs down is someone partway through: they stay down.
  assert.deepEqual(settle(tidy({ caseOpen: true, studs: lamp.slice(0, 4) })).studs, lamp.slice(0, 4));
});
