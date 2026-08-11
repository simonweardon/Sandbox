/*
 * pixel.js — pixel-art plumbing.
 *
 * Sprites are written as rows of single-character palette keys, so the art
 * stays readable and editable right here in the source:
 *
 *   '..KWWWWK..'   '.' is transparent, every other letter is a palette entry
 *
 * Each drawing is baked once into an offscreen 16x16 canvas at load time; the
 * game then blits those canvases, never the character data.
 */

const TILE = 16;

/* Our heroine: a small white rabbit in a red pinafore. */
const RABBIT_PALETTE = {
  K: '#2a2033', // outline
  W: '#f6f2f7', // fur
  P: '#e8a0b8', // inner ear and nose
  D: '#b8465e', // pinafore
  S: '#403354', // shoes
};

/* Two ghosts, same art, different tempers. */
const GHOST_PALETTES = {
  A: { K: '#5f6f8a', G: '#cfe0ef', P: '#9fb4cc' },   // MOPSY, cold blue
  B: { K: '#6c8a70', G: '#d2ecd4', P: '#9cc0a2' },   // DUSTY, mildewed green
};

/* The thing that took her doll: mostly outline, with two lamps for eyes. */
const WOLF_PALETTE = {
  K: '#0b0812', // outline, darker than the dark
  S: '#1d1630', // body
  s: '#2e2447', // highlight
  E: '#ffcf5a', // eyes
};

/* --- The rabbit -----------------------------------------------------------
   Bodies are 13 rows (ears, head, pinafore); the bottom 3 rows come from a leg
   set, so one body serves the whole walk cycle. */

const BODY_DOWN = [
  '....KK...KK.....',
  '...KWWK.KWWK....',
  '...KWPK.KWPK....',
  '...KWWK.KWWK....',
  '..KKWWKKKWWKK...',
  '..KWWWWWWWWWK...',
  '..KWWWWWWWWWK...',
  '..KWKKWWWKKWK...',
  '..KWWWPPPWWWK...',
  '...KWWWWWWWK....',
  '...KKDDDDDKK....',
  '..KWKDDDDDKWK...',
  '..KWKDDDDDKWK...',
];

/* Seen from behind: the ears show their backs, and there's no face. */
const BODY_UP = [
  '....KK...KK.....',
  '...KWWK.KWWK....',
  '...KWWK.KWWK....',
  '...KWWK.KWWK....',
  '..KKWWKKKWWKK...',
  '..KWWWWWWWWWK...',
  '..KWWWWWWWWWK...',
  '..KWWWWWWWWWK...',
  '..KWWWWWWWWWK...',
  '...KWWWWWWWK....',
  '...KKDDDDDKK....',
  '..KWKDDDDDKWK...',
  '..KWKDDDDDKWK...',
];

/* Drawn facing left; the right-facing sheet is this one mirrored. */
const BODY_SIDE = [
  '.....KK.KK......',
  '....KWWKWWK.....',
  '....KWWKWWK.....',
  '....KWWKWWK.....',
  '...KKWWWWWKK....',
  '..KWWWWWWWK.....',
  '..KWKWWWWWK.....',
  '..KPWWWWWWK.....',
  '...KWWWWWWK.....',
  '....KWWWWWK.....',
  '....KDDDDK......',
  '...KDDDDDK......',
  '...KWDDDDK......',
];

/* Leg sets: [standing, legs together, legs apart]. Alternating the last two
   is the walk cycle. */
const LEGS_FRONT = [
  ['...KKDDDDDKK....', '....KDDKDDK.....', '....KSSKSSK.....'],
  ['...KKDDDDDKK....', '....KDDDDDK.....', '.....KSSSK......'],
  ['...KKDDDDDKK....', '...KDDK.KDDK....', '...KSSK.KSSK....'],
];

const LEGS_SIDE = [
  ['...KDDDDK.......', '....KDDKDK......', '....KSSKSK......'],
  ['...KDDDDK.......', '...KDDKDK.......', '...KSSKSK.......'],
  ['...KDDDDK.......', '.....KDDKDK.....', '.....KSSKSK.....'],
];

/* Asleep, before any of this started. */
const RABBIT_ASLEEP = [
  '................',
  '................',
  '................',
  '..KK............',
  '..KWK.KKKK......',
  '..KWKKWWWWKK....',
  '..KWWWWWWWWWK...',
  '..KWWKKWWKKWWK..',
  '..KWWWWWWWWWWK..',
  '..KWWWWWWWWWWK..',
  '...KDDDDDDDDK...',
  '....KDDDDDDK....',
  '.....KKKKKK.....',
  '................',
  '................',
  '................',
];

/* --- The wolf -------------------------------------------------------------
   Same body-plus-legs trick as the rabbit: 13 rows of body, 3 of legs. */

const WOLF_SIDE = [
  '................',
  '..KK............',
  '.KSSK..KK.......',
  '.KSSSKKSSK......',
  'KSEESSSSSSK.....',
  'KSSSSSSSSSSK....',
  'KKSSSSSSSSSSK...',
  '.KSSSSSSSSSSSK..',
  '.KSSSSSSSSSSSSK.',
  '..KSSSSSSSSSSSK.',
  '..KSSSSSSSSSSSKK',
  '..KSSSSSSSSSSSK.',
  '..KSSKSSSKSSSSK.',
];

const WOLF_FRONT = [
  '................',
  '..KK......KK....',
  '.KSSK....KSSK...',
  '.KSSSK..KSSSK...',
  '.KSSSSKKSSSSK...',
  '.KSSSSSSSSSSK...',
  '.KSEESSSSEESK...',
  '.KSSSSSSSSSSK...',
  '.KSSSKKKKSSSK...',
  '.KSSSSSSSSSSK...',
  '..KSSSSSSSSK....',
  '..KSSSSSSSSK....',
  '..KSSSSSSSSK....',
];

const WOLF_LEGS_SIDE = [
  ['..KSK.KSK.KSK...', '..KSK.KSK.KSK...', '..KKK.KKK.KKK...'],
  ['.KSK..KSK..KSK..', '.KSK..KSK..KSK..', '.KKK..KKK..KKK..'],
];

const WOLF_LEGS_FRONT = [
  ['..KSSSSSSSSK....', '..KSK.KK.KSK....', '..KKK.KK.KKK....'],
  ['..KSSSSSSSSK....', '.KSK..KK..KSK...', '.KKK..KK..KKK...'],
];

/* --- Ghosts ---------------------------------------------------------------
   No walk cycle — they drift. Two frames differing only in the wisps at the
   hem, which the renderer alternates while bobbing them up and down. */

const GHOST_BODY = [
  '................',
  '.....KKKKK......',
  '...KKGGGGGKK....',
  '..KGGGGGGGGGK...',
  '..KGGGGGGGGGK...',
  '..KGKKGGGKKGK...',
  '..KGKKGGGKKGK...',
  '..KGGGGGGGGGK...',
  '..KGGGGPPGGGK...',
  '..KGGGGGGGGGK...',
  '..KGGGGGGGGGK...',
  '..KGGGGGGGGGK...',
  '..KGGGGGGGGGK...',
];

const GHOST_HEMS = [
  ['..KGGKGGGKGGK...', '..KGK.KGK.KGK...', '..KKK...KKK.....'],
  ['..KGGGKGKGGGK...', '..KGK.KGK.KGK...', '.....KKK...KKK..'],
];

/* --- Baking --------------------------------------------------------------- */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}

/* Turns rows of palette keys into a canvas, shouting if the art is misaligned
   rather than silently drawing a corrupted sprite. */
function bake(rows, palette) {
  if (rows.length !== TILE) {
    throw new Error(`sprite needs ${TILE} rows, got ${rows.length}`);
  }
  const canvas = makeCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');

  rows.forEach((row, y) => {
    if (row.length !== TILE) {
      throw new Error(`sprite row ${y} needs ${TILE} chars, got ${row.length}`);
    }
    for (let x = 0; x < TILE; x++) {
      const key = row[x];
      if (key === '.') continue;
      const colour = palette[key];
      if (!colour) throw new Error(`no palette entry for '${key}' at row ${y}`);
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

function flipped(canvas) {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/*
 * Builds the full sheet for one character: four facings x three poses.
 * Returns { down: [stand, stepA, stepB], up: [...], left: [...], right: [...] }
 */
function buildCharacter(palette) {
  const sheet = {};
  const sets = [
    ['down', BODY_DOWN, LEGS_FRONT],
    ['up', BODY_UP, LEGS_FRONT],
    ['left', BODY_SIDE, LEGS_SIDE],
  ];

  for (const [facing, body, legSets] of sets) {
    sheet[facing] = legSets.map((legs) => bake(body.concat(legs), palette));
  }
  sheet.right = sheet.left.map(flipped);
  return sheet;
}

function buildGhost(which) {
  return GHOST_HEMS.map((hem) => bake(GHOST_BODY.concat(hem), GHOST_PALETTES[which]));
}

/* The wolf gets two poses per facing — enough for a prowl. */
function buildWolf() {
  const sheet = {
    left: WOLF_LEGS_SIDE.map((legs) => bake(WOLF_SIDE.concat(legs), WOLF_PALETTE)),
    down: WOLF_LEGS_FRONT.map((legs) => bake(WOLF_FRONT.concat(legs), WOLF_PALETTE)),
  };
  sheet.right = sheet.left.map(flipped);
  sheet.up = sheet.down;
  return sheet;
}

function buildSleeper() {
  return bake(RABBIT_ASLEEP, RABBIT_PALETTE);
}
