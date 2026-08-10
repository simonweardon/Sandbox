/*
 * world.js — Ashgrove Manor.
 *
 * One character per tile:
 *   .  floorboards   r  carpet      d  doorway    w  cobwebs
 *   #  wall          B  bookshelf   P  portrait   T  table
 *   c  candelabra    W  window      s  staircase  C  toy chest
 *   D  front door
 */

const MAP = [
  '########################################',
  '########################################',
  '############################W##W##W#####',
  '##.BBBBBBBBBBB.#..ssss..#.............##',
  '##.............#...rr...#.c.........c.##',
  '##B............P...rr...P.............##',
  '##B............#.c.rr.c.#...TTTTTTT...##',
  '##B...TTTT.....d...rr...d...TTTTTTT...##',
  '##B...TTTT.....#...rr...#.............##',
  '##B............#...rr...#.............##',
  '##..c.......c..#...rr...#.c.........c.##',
  '##.............P...rr...P.............##',
  '########d#######...rr...#######d########',
  '##.................rr.................##',
  '##.................rr.................##',
  '########d#######...rr...#######d########',
  '##.............#...rr...#.............##',
  '##.c.........c.#.c.rr.c.#..........BB.##',
  '##.............#...rr...#......C......##',
  '##..wwwwwwwww..#...rr...#.............##',
  '##..wwwwwwwww..d...rr...d....rrrrr....##',
  '##W.wwwwwwwww..#...rr...#....rrrrr....W#',
  '##W.wwwwwwwww..#...rr...#....rrrrr....W#',
  '##..wwwwwwwww..P...rr...P....rrrrr....##',
  '##..wwwwwwwww..#...rr...#.............##',
  '##.............#.c.rr.c.#.............##',
  '##...TT........#...rr...#.c.........c.##',
  '##.............#...rr...#.............##',
  '###################DD###################',
  '########################################',
];

const MAP_W = MAP[0].length;
const MAP_H = MAP.length;

MAP.forEach((row, y) => {
  if (row.length !== MAP_W) {
    throw new Error(`map row ${y} is ${row.length} tiles wide, expected ${MAP_W}`);
  }
});

/* Anything not listed here is walkable floor. */
const SOLID = new Set(['#', 'B', 'P', 'T', 'c', 'W', 's', 'C', 'D']);

/* Tiles that cast light into the darkness pass, and how far. */
const LIGHTS = { c: 46, W: 34 };

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#';
  return MAP[y][x];
}

function isWalkable(x, y) {
  return !SOLID.has(tileAt(x, y));
}

/* Flavour for the furniture — press A facing any of these. */
const TILE_TALK = {
  B: ['Damp books, none of them titled.', 'The spines are warm to the touch.'],
  P: ['A painted lady in a grey dress.', 'Her eyes are following your ears.'],
  T: ['Laid for a dinner nobody came to.', 'The plates are full of dust.'],
  c: ['The candles burn but never', 'get any shorter.'],
  W: ['Moonlight, and your own reflection', 'waving back a moment too late.'],
  s: ['The staircase goes up four steps', 'and then simply stops.'],
  D: ['The front door will not open.', 'It never does, until it wants to.'],
};

/* The five pieces of BUTTON, scattered one to a room. Walk over one to take
   it — no need to press anything. */
const PIECES = [
  { x: 12, y: 9, kind: 'head', label: "BUTTON's head",
    line: 'Her painted eyes are still cheerful.' },
  { x: 30, y: 9, kind: 'arm', label: "BUTTON's arm",
    line: 'It was under the dinner table.' },
  { x: 7, y: 22, kind: 'leg', label: "BUTTON's leg",
    line: 'Wound about with old cobweb.' },
  { x: 35, y: 25, kind: 'body', label: "BUTTON's body",
    line: 'Her blue dress, hardly torn at all.' },
  { x: 17, y: 4, kind: 'ribbon', label: "BUTTON's ribbon",
    line: 'It was tied to the bannister,', extra: 'in a bow you did not tie.' },
];

const PIECE_TOTAL = PIECES.length;

/* Ghosts and the toy chest. Ghosts block their square, so you talk to them
   rather than walk through them. */
const ENTITIES = [
  {
    x: 20, y: 24, kind: 'ghost', facing: 'down',
    lines: [
      'Oh — a little rabbit, all alone.',
      'The house took your doll apart and',
      'hid the pieces in its rooms.',
      'Find all five and put her together.',
    ],
  },
  {
    x: 5, y: 6, kind: 'ghost', facing: 'down',
    lines: [
      'I have read every book here twice.',
      'Something small and pale is shelved',
      'in the west wall, between the poetry.',
    ],
  },
  {
    x: 29, y: 10, kind: 'ghost', facing: 'left',
    lines: [
      'We dine at eight. We have dined at',
      'eight for ninety years.',
      'Look beneath the table, child.',
    ],
  },
  {
    x: 3, y: 18, kind: 'ghost', facing: 'right',
    lines: [
      'Mind the webs in the old glasshouse.',
      'The spiders here collect what they',
      'like, and they liked her shoe.',
    ],
  },
  {
    x: 31, y: 18, kind: 'chest',
    lines: ['A toy chest, lid thrown open.'],
  },
];

function entityAt(x, y) {
  return ENTITIES.find((e) => e.x === x && e.y === y) || null;
}

function pieceAt(x, y) {
  return PIECES.find((p) => !p.taken && p.x === x && p.y === y) || null;
}

const PLAYER_START = { x: 19, y: 27, facing: 'up' };
