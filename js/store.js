// What you've done so far, kept in this browser. `keeper` is whatever the far light is signalling:
// Nell's pattern to begin with, then the last player's, and it survives starting again.
import { NELL_PATTERN } from './world.js';

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

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && typeof saved === 'object') Object.assign(state, saved);
} catch { /* storage blocked or garbled: start fresh */ }
if (!/^[SL]{1,8}$/.test(state.keeper)) state.keeper = NELL_PATTERN;

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

// Start again: forget the locks, keep the light and the sound setting.
export function reset() {
  Object.assign(state, FRESH());
  save();
}
