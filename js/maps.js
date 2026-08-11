/*
 * maps.js — every room in the game.
 *
 * One character per tile:
 *   .  floorboards   r  carpet      d  doorway    w  cobwebs
 *   #  wall          B  bookshelf   P  portrait   T  table
 *   c  candelabra    u  snuffed candelabra        W  window
 *   s  staircase     C  toy chest   D  front door b  bed
 *   O  floor sigil   1  cellar hatch  2  attic stair  3  the dark stair
 *   0  way back
 */

/* Anything not listed here is walkable. */
const SOLID = new Set([
  '#', 'B', 'P', 'T', 'c', 'u', 'W', 's', 'C', 'D', 'b', '1', '2', '3',
]);

/* Tiles that push back the dark, and how far. */
const LIGHTS = { c: 46, W: 34, 2: 30 };

const MAPS = {
  /* --- Act 1: her bedroom ------------------------------------------------ */
  nursery: {
    title: 'HER ROOM',
    gloom: 0.45,
    rows: [
      '####################',
      '####################',
      '##W##############W##',
      '##................##',
      '##bb..............##',
      '##bb..............##',
      '##................##',
      '##...............d##',
      '##................##',
      '##....C...........##',
      '##................##',
      '##................##',
      '####################',
      '####################',
    ],
  },

  /* --- Act 1: the corridor she chases him down --------------------------- */
  chase: {
    title: 'THE LONG LANDING',
    gloom: 0.82,
    rows: [
      '##############################',
      '##############################',
      '##..........................##',
      '##..........................##',
      '##..........................##',
      '##..........................##',
      '##..........................##',
      '##..........................##',
      '##############################',
      '##############################',
    ],
  },

  /* --- Act 2: the manor, the hub of the whole game ----------------------- */
  manor: {
    title: 'ASHGROVE MANOR',
    gloom: 0.88,
    rows: [
      '########################################',
      '########################################',
      '############################W##W##W#####',
      '##.BBBBBBBBBBB.#..s33s..#......2......##',
      '##.............#...rr...#.u.........u.##',
      '##B............P...rr...P.............##',
      '##B............#.c.rr.c.#...TTTTTTT...##',
      '##B...TTTT.....d...rr...d...TTTTTTT...##',
      '##B...TTTT.....#...rr...#.............##',
      '##B............#...rr...#.............##',
      '##..u.......u..#...rr...#.c.........c.##',
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
      '##...TT.1......#...rr...#.c.........c.##',
      '##.............#...rr...#.............##',
      '###################DD###################',
      '########################################',
    ],
  },

  /* --- Act 2, level one: crates and sigils -------------------------------- */
  cellar: {
    title: 'THE COAL CELLAR',
    gloom: 0.8,
    rows: [
      '######################',
      '######################',
      '##..................##',
      '##..O...........O...##',
      '##..................##',
      '##.c.....####.....c.##',
      '##.......#..#.......##',
      '##.......#..#.......##',
      '##.......####.......##',
      '##..................##',
      '##........O.........##',
      '##..................##',
      '##..................##',
      '##........0.........##',
      '######################',
      '######################',
    ],
  },

  /* --- Act 2, level two: the chimes --------------------------------------- */
  attic: {
    title: 'THE ATTIC',
    gloom: 0.84,
    rows: [
      '######################',
      '######################',
      '##..................##',
      '##.ww..........ww...##',
      '##..................##',
      '##....##......##....##',
      '##....##......##....##',
      '##..................##',
      '#W..................W#',
      '##..................##',
      '##....##......##....##',
      '##....##......##....##',
      '##.ww..........ww...##',
      '##........0.........##',
      '######################',
      '######################',
    ],
  },

  /* --- Act 3: the wolf ---------------------------------------------------- */
  lair: {
    title: 'THE DARK BELOW',
    gloom: 0.94,
    rows: [
      '####################',
      '####################',
      '##................##',
      '##................##',
      '##................##',
      '##................##',
      '##................##',
      '##................##',
      '##................##',
      '##................##',
      '##................##',
      '##................##',
      '####################',
      '####################',
    ],
  },
};

/* Validate every map up front — a ragged row is a bug worth failing loudly. */
for (const [key, map] of Object.entries(MAPS)) {
  map.w = map.rows[0].length;
  map.h = map.rows.length;
  map.rows.forEach((row, y) => {
    if (row.length !== map.w) {
      throw new Error(`map '${key}' row ${y} is ${row.length} wide, expected ${map.w}`);
    }
  });
}

/* Where each portal tile leads. Solid portals ('1','2','3') are entered by
   facing them and pressing A; the walkable '0' triggers when stepped on. */
const PORTALS = {
  manor: {
    1: { to: 'cellar', x: 10, y: 13, facing: 'up', needs: 'cellarOpen',
      shut: ['The hatch is nailed shut.', 'MOPSY would know how to open it.'] },
    2: { to: 'attic', x: 10, y: 13, facing: 'up', needs: 'atticOpen',
      shut: ['The attic stair is roped off.', 'DUSTY has the knot.'] },
    3: { to: 'lair', x: 9, y: 10, facing: 'up', needs: 'lairOpen',
      shut: ['Cold pours down these steps.', 'You need a light before you go down.'] },
  },
  cellar: { 0: { to: 'manor', x: 8, y: 25, facing: 'down' } },
  attic: { 0: { to: 'manor', x: 31, y: 4, facing: 'down' } },
};

/* Flavour for the furniture — press A facing any of these. */
const TILE_TALK = {
  B: ['Damp books, none of them titled.', 'The spines are warm to the touch.'],
  P: ['A painted lady in a grey dress.', 'Her eyes are following your ears.'],
  T: ['Laid for a dinner nobody came to.', 'The plates are full of dust.'],
  c: ['The candle burns but never', 'gets any shorter.'],
  W: ['Moonlight, and your own reflection', 'waving back a moment too late.'],
  s: ['The staircase goes up four steps', 'and then simply stops.'],
  D: ['The front door will not open.', 'Not until you have her back.'],
  C: ['Your toy chest, lid thrown open.', 'BUTTON should be in here.'],
  b: ['Your bed. The blankets are still warm.'],
};

/* --- Things that live in rooms ------------------------------------------- */

/* The five pieces the wolf shook loose while he ran. MOPSY's task. */
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
    line: 'Caught on the bannister, in a bow', extra: 'that you did not tie.' },
];

const PIECE_TOTAL = PIECES.length;

/* The candles the wolf snuffed on his way through. DUSTY's task. */
const SNUFFED = [
  { x: 26, y: 4 }, { x: 36, y: 4 }, { x: 4, y: 10 }, { x: 12, y: 10 },
];

/* Crates for the cellar, and the sigils they belong on. */
const CRATE_STARTS = [{ x: 6, y: 6 }, { x: 14, y: 6 }, { x: 10, y: 12 }];
const SIGILS = [{ x: 4, y: 3 }, { x: 16, y: 3 }, { x: 10, y: 10 }];

/* Attic chimes. Ring them in the order of DUSTY's rhyme. */
const CHIMES = [
  { x: 5, y: 5, colour: 'blue' },
  { x: 16, y: 5, colour: 'red' },
  { x: 5, y: 10, colour: 'green' },
  { x: 16, y: 10, colour: 'gold' },
];

const CHIME_ORDER = ['blue', 'red', 'green', 'gold'];

const RHYME = [
  'Blue for the sky I cannot see,',
  'red for the coat he wore,',
  'green for the glass, and gold at last,',
  'and the attic gives up its door.',
];

/* The two ghosts. Their lines change with the state of their task, so all of
   it is kept together here rather than scattered through the code. */
const GHOSTS = {
  mopsy: {
    name: 'MOPSY', x: 20, y: 24, facing: 'down', map: 'manor', palette: 'A',
    greet: [
      'A rabbit! Oh, thank goodness, a rabbit.',
      'I am MOPSY. I have been dead for',
      'two hundred years and I am still',
      'not finished tidying.',
      'That shadow-thing tore your doll',
      'as he ran. Five pieces, all over',
      'my nice clean house. NOT tidy.',
      'Bring them to me and I will get you',
      'into the cellar. He went that way.',
    ],
    nag: ['Five pieces, dear. Still missing some.', 'I do not make the rules. I made these rules.'],
    done: [
      'All five! Look at that. Spotless.',
      'The cellar hatch is yours. Mind the',
      'crates — I never could shift them.',
    ],
  },
  dusty: {
    name: 'DUSTY', x: 12, y: 13, facing: 'down', map: 'manor', palette: 'B',
    greet: [
      'DUSTY, at your service. Ex-footman.',
      'Mostly ex.',
      'That wolf blew out four of my candles',
      'on his way past. Rude. Unspeakably',
      'rude. I lit those.',
      'Light them again — just walk up and',
      'press A — and I will untie the attic',
      'stair for you. There is a lens up',
      'there that catches moonlight.',
    ],
    nag: ['Four candles. Count them.', 'I would do it myself but I have no thumbs.'],
    done: [
      'All four, burning away. Beautiful.',
      'The attic is open. Ring the chimes',
      'in the order of the rhyme up there —',
      'and do not ask me to sing it again.',
    ],
  },
};
