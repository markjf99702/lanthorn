// Nell's drawings in the journal, as SVG in pen and ink. Labels are in her hand.

const hand = (x, y, s, text, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${s}" class="hand" ${extra}>${text}</text>`;

// Her chart of Lanthorn. The bearing to the far rock is a smudge.
export function map() {
  const at = (b, r) => [150 + Math.sin(b * Math.PI / 180) * r, 108 - Math.cos(b * Math.PI / 180) * r];
  const [wx, wy] = at(128, 84), [bx, by] = at(198, 70), [cx, cy] = at(24, 88), [fx, fy] = at(245, 112);
  return `<svg viewBox="0 0 300 220" class="sketch" role="img" aria-label="Nell’s sketch map: her rock and lighthouse in the middle, a wreck to the south-east, a bell buoy to the south, a cairn to the north-east, and a dotted rock with a question mark to the south-west. A line runs to it with the number smudged out.">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M135 100c4-11 17-15 27-10 9 4 13 12 10 21-3 9-11 13-21 12-11-1-18-12-16-23z"/>
    <circle cx="151" cy="106" r="4.2"/>
    <path d="M151 94l1-8m-6 1h12" stroke-width="1.1"/>
    <path d="M${wx - 8} ${wy + 4}q8 3 17-1M${wx - 1} ${wy + 5}l6-15m-8 5l9 2"/>
    <path d="M${bx - 4} ${by + 4}l4-10 4 10zM${bx - 5} ${by + 4}h10"/>
    <path d="M${cx - 12} ${cy + 5}q12-7 24 0"/>
    <ellipse cx="${cx}" cy="${cy - 1}" rx="4" ry="2.4"/><ellipse cx="${cx}" cy="${cy - 5}" rx="3" ry="1.9"/><ellipse cx="${cx}" cy="${cy - 8.4}" rx="2" ry="1.4"/>
    <path d="M${fx - 16} ${fy + 3}c3-10 13-14 22-11 8 3 12 9 10 14" stroke-dasharray="3 3.5"/>
    <path d="M${fx + 1} ${fy - 2}v-9" stroke-dasharray="2 2.5"/>
    <path d="M142 112L${fx + 12} ${fy - 6}" stroke-width=".9" stroke-dasharray="1 4"/>
    <path d="M262 46v-26m-5 8l5-8 5 8" stroke-width="1.2"/>
  </g>
  <ellipse cx="${(142 + fx) / 2 + 4}" cy="${(112 + fy) / 2 - 3}" rx="19" ry="10" class="smudge"/>
  ${hand(256, 62, 18, 'N')}
  ${hand(wx - 6, wy + 22, 17, 'wreck')}
  ${hand(bx - 14, by + 24, 17, 'bell')}
  ${hand(cx + 14, cy + 2, 17, 'cairn?')}
  ${hand(Math.max(4, fx - 34), fy + 30, 17, 'only at dusk')}
  ${hand(fx - 4, fy - 16, 26, '?')}
  ${hand(172, 86, 15, 'my lamp')}
  ${hand(176, 134, 14, 'dock', 'transform="rotate(-8 176 134)"')}
</svg>`;
}

// Two goes at writing the light down, both crossed out.
export function marks() {
  const row = (y, seq, strike) => {
    let x = 44, out = '';
    for (const c of seq) {
      if (c === 'L') { out += `<path d="M${x} ${y}h30" />`; x += 48; } else { out += `<circle cx="${x + 5}" cy="${y}" r="4.2" fill="currentColor" stroke="none"/>`; x += 28; }
    }
    if (strike) out += `<path d="M30 ${y + 13}L${x + 2} ${y - 13}" stroke-width="1.5"/>`;
    return out;
  };
  return `<svg viewBox="0 0 300 118" class="sketch" role="img" aria-label="Two attempts at writing down the light, long and short marks, both crossed out, and a question mark.">
  <g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    ${row(26, 'LSSL', true)}
    ${row(68, 'LLSL', true)}
  </g>
  ${hand(40, 108, 26, '?')}
  ${hand(170, 106, 15, 'wrong again')}
</svg>`;
}

// The Lampbearer, with a water stain across its lower half.
export function stars() {
  const S = 34, X0 = 105, Y0 = 190;
  const p = ([gx, gy]) => [X0 + gx * S, Y0 - gy * S];
  const star = ([x, y], r) => `<path d="M${x - r} ${y}L${x + r} ${y}M${x} ${y - r}L${x} ${y + r}M${x - r * 0.6} ${y - r * 0.6}L${x + r * 0.6} ${y + r * 0.6}M${x - r * 0.6} ${y + r * 0.6}L${x + r * 0.6} ${y - r * 0.6}" stroke-width="1.3"/>`;
  const [foot, left, mid, right, lamp] = [[1, 0], [0, 1], [1, 2], [2, 2], [2, 4]].map(p);
  return `<svg viewBox="0 0 300 250" class="sketch" role="img" aria-label="A sketch of five stars joined into a figure holding up a lamp, over a tiny tower. A water stain has washed out the two lowest stars.">
  <g fill="none" stroke="currentColor" stroke-linecap="round">
    <path d="M${mid[0]} ${mid[1]}L${right[0]} ${right[1]}L${lamp[0]} ${lamp[1] + 6}" stroke-width="1" stroke-dasharray="3 4"/>
    <path d="M${mid[0]} ${mid[1]}l-9 7M${mid[0]} ${mid[1]}v11" stroke-width="1" stroke-dasharray="3 4"/>
    ${star(mid, 5)}${star(right, 5)}${star(lamp, 9)}
    <circle cx="${lamp[0]}" cy="${lamp[1]}" r="12" stroke-width=".8" stroke-dasharray="2 3"/>
    <path d="M226 236v-20h6v20m-8 0h10m-7-20l2-4 2 4" stroke-width="1.2"/>
  </g>
  <ellipse class="wash" cx="${left[0] + 2}" cy="${left[1] + 1}" rx="9" ry="6"/><ellipse class="wash" cx="${foot[0] - 1}" cy="${foot[1] + 2}" rx="10" ry="6"/>
  <path class="stain" d="M70 150c6-18 30-26 50-20 16 4 34 2 44 16 9 13 3 32-6 44-10 13-30 20-49 17-19-3-37-14-41-32-2-9-1-17 2-25z"/>
  ${hand(24, 40, 17, 'the Lampbearer')}
  ${hand(196, 212, 13, 'far light')}
</svg>`;
}

export const SKETCHES = { map, marks, stars };
