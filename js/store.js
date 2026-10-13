// What you've done so far, kept in this browser. `keeper` is whatever the far light is signalling:
// Nell's pattern to begin with, then the last player's, and it survives starting again.
import { NELL_PATTERN, LAMPBEARER, caseCatches, isLampbearer } from './world.js';
import { JOURNAL } from './text.js';

const KEY = 'lanthorn:v1';

const FRESH = () => ({
  caseOpen: false,
  claspOpen: false,
  awake: false,
  done: false,
  letterRead: false,
  page: 0,
  digits: [0, 0, 0],
  studs: [],
  hours: 15.5,
  heading: 128,
  pitch: -1,
  hintsSeen: 0,
});

export const state = { ...FRESH(), keeper: NELL_PATTERN, sound: true };

// A save that has been garbled, or filled in by hand: anything that's the wrong kind of thing goes back to how
// it starts, and everything else is kept. A page past either end of the journal is the nearest end.
export function tidy(s) {
  const f = FRESH();
  for (const k of ['caseOpen', 'claspOpen', 'awake', 'done', 'letterRead']) if (typeof s[k] !== 'boolean') s[k] = f[k];
  s.page = Number.isFinite(s.page) ? Math.max(0, Math.min(JOURNAL.length - 1, Math.round(s.page))) : f.page;
  const digit = n => Number.isInteger(n) && n >= 0 && n <= 9;
  if (!(Array.isArray(s.digits) && s.digits.length === 3 && s.digits.every(digit))) s.digits = f.digits;
  s.studs = Array.isArray(s.studs) ? s.studs.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger)) : f.studs;
  for (const k of ['hours', 'heading', 'pitch']) if (!Number.isFinite(s[k])) s[k] = f[k];
  // An hour off the clock goes round it, as the wheel does. One already on it is left exactly as it was.
  if (s.hours < 0 || s.hours >= 24) s.hours = ((s.hours % 24) + 24) % 24;
  return s;
}

// A lock makes up its mind a moment before it has finished moving, and only says so in the save at the end, so a
// page closed in between came back with the right answer on a shut lock, or five wrong studs that never popped
// out. This finishes what each lock had decided. It needs a tidy save.
export function settle(s) {
  if (!s.caseOpen && caseCatches(s.digits)) s.caseOpen = true;
  if (s.caseOpen && !s.claspOpen && isLampbearer(s.studs)) s.claspOpen = true;
  if (!s.claspOpen && s.studs.length >= LAMPBEARER.length) s.studs = [];
  return s;
}

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && typeof saved === 'object') Object.assign(state, saved);
} catch { /* storage blocked or garbled: start fresh */ }
tidy(state);
settle(state);
if (!/^[SL]{1,8}$/.test(state.keeper)) state.keeper = NELL_PATTERN;

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

// Start again: forget the locks, keep the light and the sound setting.
export function reset() {
  Object.assign(state, FRESH());
  save();
}
