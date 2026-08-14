/*
 * pixel.js — pixel-art plumbing.
 *
 * Sprites are written as rows of single-character palette keys, so the art
 * stays readable and editable right here in the source:
 *
 *   '..KKKK..'     '.' is transparent, every other letter is a palette entry
 *
 * Each drawing is baked once into an offscreen 16x16 canvas at load time; the
 * game then blits those canvases, never the character data.
 */

const TILE = 16;

/* Palette for the player. Swap the values to re-skin a character. */
const HERO_PALETTE = {
  K: '#241b2f', // outline
  C: '#e0403c', // cap
  H: '#3a2a1e', // hair
  S: '#f2c79b', // skin
  B: '#f4f4f2', // shirt
  b: '#d3d5de', // shirt shadow
  P: '#3b6fd8', // trousers
  O: '#2f3446', // shoes
};

/* The rival/NPC is the same art with different colours — exactly how the
   Game Boy games got a second trainer out of one sprite sheet. */
const NPC_PALETTE = {
  K: '#241b2f',
  C: '#7d55c7',
  H: '#20304a',
  S: '#d8a173',
  B: '#f4f4f2',
  b: '#d3d5de',
  P: '#2f57b0',
  O: '#43331f',
};

/* --- Character art -------------------------------------------------------
   Bodies are 13 rows (head + torso); the bottom 3 rows come from a leg set,
   so one body serves the whole walk cycle. */

const BODY_DOWN = [
  '................',
  '....KKKKKKK.....',
  '...KCCCCCCCK....',
  '..KCCCCCCCCCK...',
  '..KKKKKKKKKKK...',
  '..KHHSSSSSHHK...',
  '..KSSSSSSSSSK...',
  '..KSKKSSSKKSK...',
  '..KSSSSSSSSSK...',
  '...KSSSSSSSK....',
  '...KKBBBBBKK....',
  '..KSKBBBBBKSK...',
  '..KSKbbbbbKSK...',
];

const BODY_UP = [
  '................',
  '....KKKKKKK.....',
  '...KCCCCCCCK....',
  '..KCCCCCCCCCK...',
  '..KKKKKKKKKKK...',
  '..KHHHHHHHHHK...',
  '..KHHHHHHHHHK...',
  '..KHHHHHHHHHK...',
  '..KHHHHHHHHHK...',
  '...KHHHHHHHK....',
  '...KKBBBBBKK....',
  '..KSKBBBBBKSK...',
  '..KSKbbbbbKSK...',
];

/* Drawn facing left; the right-facing sheet is this one mirrored. */
const BODY_SIDE = [
  '................',
  '...KKKKKK.......',
  '..KCCCCCCK......',
  '.KCCCCCCCCK.....',
  '.KKKKKKKKKK.....',
  '.KSSSSSSSHK.....',
  '.KSKSSSSSHK.....',
  '.KSSSSSSSHK.....',
  '..KSSSSSSHK.....',
  '...KSSSSSK......',
  '...KBBBBK.......',
  '..KBBBBBK.......',
  '..KSbbbbK.......',
];

/* Leg sets: [standing, legs together, legs apart]. Alternating the last two
   with a stand in between is the classic four-beat overworld walk. */
const LEGS_FRONT = [
  ['...KKPPPPPKK....', '....KPPKPPK.....', '....KOOKOOK.....'],
  ['...KKPPPPPKK....', '....KPPPPPK.....', '.....KOOOK......'],
  ['...KKPPPPPKK....', '...KPPK.KPPK....', '...KOOK.KOOK....'],
];

const LEGS_SIDE = [
  ['....KPPPPK......', '....KPPKPK......', '....KOOKOK......'],
  ['....KPPPPK......', '...KPPPPK.......', '...KOOOK........'],
  ['....KPPPPK......', '.....KPPPPK.....', '.....KOOOK......'],
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
