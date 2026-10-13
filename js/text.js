// Everything Nell Harrow left behind, in her own words.

export const INTRO = [
  'The house on Wick Lane was being cleared. In the cupboard under the stairs, behind the paint tins, there was a writing case, a journal and a brass eyeglass.',
  'Nobody came back for them.',
];

// How many flashes the far light makes before it rests. It says whatever its last keeper left it saying, so after
// someone has finished and started again, Nell's count follows their light.
const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const flashes = keeper => (keeper.length === 1 ? 'one flash' : `${NUMBERS[keeper.length]} flashes`);

// The journal: one entry to a page. `sketch` names a drawing from sketches.js. A line can be a function of the
// light the far rock is keeping.
export const JOURNAL = [
  { cover: true, lines: ['N. Harrow'], note: 'If found, please don’t open the case.' },
  {
    date: '2 October',
    lines: [
      'The book is finished. One rock, one lighthouse, a stair up to the lamp and a little dock. The sea all the way round.',
      'I kept it small on purpose. Small things are easier to get right.',
    ],
  },
  {
    date: '4 October',
    lines: [
      'Linked for the first time. Everything as I wrote it. The lamp room smells of oil and salt, which I didn’t write.',
      'No boat at the dock, because I never wrote a boat. I’m calling it Lanthorn, after the lamp.',
    ],
  },
  {
    date: '9 October',
    lines: [
      'Wrote in a wreck to the south-east, because every sea should have one, and a bell buoy to the south so there’d be something to listen to.',
      'There’s a cairn on the skerry to the north-east. I didn’t write that. Five stones, biggest at the bottom. Somebody stacked them.',
    ],
  },
  {
    date: '15 October',
    lines: [
      'Ground a glass from the spare paper, the way Father showed me. Through it I can sit at my own desk and see Lanthorn from the gallery.',
      'I’ve fitted a wheel to it, so I can look at any hour of the day there. It only looks. It doesn’t change anything. I think.',
    ],
  },
  {
    date: '22 October',
    lines: [
      'A second rock, out to the south-west, with a tower on it. It’s only there at dusk. In daylight there is nothing that way but sea.',
      'I didn’t write it. I’ve read the book through twice to be sure.',
    ],
    sketch: 'map',
  },
  {
    date: '23 October',
    lines: [
      keeper => `There’s a light in the tower. It comes on after dark: ${flashes(keeper)} and a rest, over and over, all night.`,
      'I keep trying to write it down and getting it wrong. Somebody is keeping it.',
    ],
    sketch: 'marks',
  },
  {
    date: '30 October',
    lines: [
      'The stars here don’t move. I sat up all night on the gallery and not one of them turned.',
      'Five of them stand right over the far light, like somebody holding up a lamp. I call them the Lampbearer.',
    ],
    sketch: 'stars',
  },
  {
    date: '6 November',
    lines: [
      'I’ve written the far rock. Twice: one book to use and one to leave behind.',
      'It was the hardest thing I’ve ever written. The words came out as if they’d been waiting.',
    ],
  },
  {
    date: '9 November',
    lines: [
      'I’ve locked the second book in the case three ways, with things only someone who has watched Lanthorn would know: where the light stands, what stands over it, and what it says.',
      'If you can open it, you’ve been watching too.',
    ],
  },
  {
    date: '11 November',
    lines: [
      'Whoever keeps that lamp has been at it a long time. Perhaps they’d like a rest.',
      'I’m going across tonight.',
    ],
  },
];

export const LETTER = {
  to: 'To whoever opens this,',
  lines: [
    'If you’ve got this far, you know where the far rock is. That’s more than I knew when I started.',
    'The book will take you there. It won’t bring you back. I tried to write a way home, and the words wouldn’t come.',
    'Don’t go because you’re curious. Go if you’ve been watching the light and it’s started to feel as if it’s meant for you.',
  ],
  sign: 'N.',
};

// Written in the book, over the linking picture.
export const BOOK_LINE = 'The picture only wakes for someone who can answer the light.';

// On the ledge in the far lamp room.
export const LAST_PAGE = {
  lines: [
    'You came. I felt the book open, the way you feel a door open somewhere downstairs.',
    'There was nobody here when I arrived. The lamp was lit and still warm, and there was a page like this one on the ledge, in a hand I didn’t know. It said the lamp must be kept every night, for whoever is watching.',
    'So I kept it. I don’t know for how long. The stars don’t move, so it’s hard to tell.',
    'The stair on the west side goes down into the sea, and it’s dry all the way down. I’m going to see where it goes.',
    'The lamp is yours now. Keep it for whoever is watching. They’ll need something to answer.',
  ],
  sign: 'Nell',
};

export const ENDING = [
  'Somewhere a house is being cleared.',
  'In the cupboard under the stairs, someone has found a writing case, a journal and a brass eyeglass.',
  'Tonight they’ll see your light.',
];

// For anyone stuck, one lock at a time, gentlest first.
export const HINTS = {
  case: [
    'Nell says she locked the case with “where the light stands”. The dial on the case is a compass.',
    'Look through the eyeglass. The number above it is the compass bearing of whatever is in the middle.',
    'The far rock only shows at dusk and after. Turn the wheel under the eyeglass towards evening, then look south-west.',
    'Put the far tower in the middle of the eyeglass and set the case to the three numbers above it.',
  ],
  clasp: [
    'The studs on the book are a patch of sky. Nell’s journal says what stands over the far light.',
    'Turn the eyeglass to night, find the far tower, then look up. Five bright stars stand over it.',
    'Press the studs in the same shape as the five stars. It doesn’t matter where on the plate, only the shape.',
  ],
  panel: [
    'The dark picture wakes for someone who can answer the far light. Watch it through the eyeglass after dark.',
    'The light flashes, long or short, then rests. Tap the picture for a short flash and hold it for a long one.',
    'Answer it in the same order, all in one go, then wait a moment.',
  ],
};
