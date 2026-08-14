/*
 * tiles.js — the 16x16 terrain tiles.
 *
 * Unlike the characters these are drawn procedurally: a base fill plus
 * scattered detail pixels from a seeded RNG, so each tile still lands on exact
 * pixel boundaries but the code stays short. Everything is baked once at load.
 */

/* Tiny deterministic RNG (mulberry32) — same seed, same speckles, every run. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawTile(paint) {
  const canvas = makeCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');
  const px = (x, y, colour, w = 1, h = 1) => {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, w, h);
  };
  paint(ctx, px);
  return canvas;
}

function fill(ctx, colour) {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, TILE, TILE);
}

const C = {
  grass: '#5fae4e',
  grassDark: '#4a9440',
  grassLight: '#7cc45e',
  tallGrass: '#3f8c3a',
  tallGrassDark: '#2f6d2d',
  dirt: '#d8bd8a',
  dirtDark: '#c2a473',
  water: '#4a8fd4',
  waterDark: '#3a72b4',
  waterLight: '#7fb8ea',
  bark: '#7a5230',
  barkDark: '#5c3d23',
  leaf: '#2f7a3b',
  leafDark: '#24602f',
  leafLight: '#41a04c',
  rock: '#9a9aa8',
  rockDark: '#70707e',
  wood: '#a5713f',
  woodDark: '#7a5230',
  board: '#e8d5a8',
  roof: '#8f8f9c',
  roofDark: '#6a6a78',
  wall: '#cfcfd8',
  wallDark: '#a5a5b2',
  door: '#5c5c68',
  doorDark: '#43434e',
  outline: '#241b2f',
};

/* Grass with a few tufts. Three variants get sprinkled across the map so large
   fields don't look like graph paper. */
function grassTile(seed) {
  return drawTile((ctx, px) => {
    fill(ctx, C.grass);
    const rand = rng(seed);
    // A few small blades rather than heavy speckle — at 16px, less is calmer.
    for (let i = 0; i < 3; i++) {
      const x = 1 + Math.floor(rand() * (TILE - 3));
      const y = 1 + Math.floor(rand() * (TILE - 3));
      px(x, y, C.grassDark, 2, 1);
      px(x + 1, y + 1, C.grassDark);
    }
    px(2 + Math.floor(rand() * 10), 2 + Math.floor(rand() * 10), C.grassLight, 2, 1);
  });
}

function tallGrassTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.grass);
    // Rows of chevron blades, offset every other row.
    for (let row = 0; row < 3; row++) {
      const y = 3 + row * 5;
      const offset = row % 2 ? 2 : 0;
      for (let x = offset; x < TILE; x += 4) {
        px(x, y, C.tallGrass, 1, 3);
        px(x + 1, y + 1, C.tallGrassDark, 1, 2);
        px(x - 1, y + 1, C.tallGrass, 1, 2);
      }
    }
  });
}

function pathTile(seed) {
  return drawTile((ctx, px) => {
    fill(ctx, C.dirt);
    const rand = rng(seed);
    for (let i = 0; i < 10; i++) {
      px(Math.floor(rand() * TILE), Math.floor(rand() * TILE), C.dirtDark);
    }
  });
}

function flowerTile(seed) {
  const base = grassTile(seed);
  return drawTile((ctx, px) => {
    ctx.drawImage(base, 0, 0);
    const petals = ['#f2f2f2', '#f5c542', '#e8697d'];
    const rand = rng(seed + 99);
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(rand() * (TILE - 5));
      const y = 2 + Math.floor(rand() * (TILE - 5));
      const colour = petals[Math.floor(rand() * petals.length)];
      px(x + 1, y, colour);
      px(x, y + 1, colour);
      px(x + 2, y + 1, colour);
      px(x + 1, y + 2, colour);
      px(x + 1, y + 1, '#f5c542');
    }
  });
}

/* The canopy runs edge to edge so a row of trees reads as one dense treeline
   instead of a line of lollipops; only the very bottom shows trunk and grass. */
function treeTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.leaf);
    // Clumps of foliage: lit on the top-left, shaded on the bottom-right.
    const clumps = [
      [1, 1, C.leafLight], [6, 0, C.leafLight], [11, 2, C.leafLight],
      [3, 5, C.leafLight], [9, 6, C.leafLight], [13, 8, C.leafLight],
      [0, 8, C.leafDark], [5, 9, C.leafDark], [10, 12, C.leafDark],
      [2, 12, C.leafDark], [12, 4, C.leafDark],
    ];
    for (const [x, y, colour] of clumps) {
      px(x + 1, y, colour, 2, 1);
      px(x, y + 1, colour, 4, 1);
      px(x + 1, y + 2, colour, 2, 1);
    }
    px(0, 15, C.leafDark, TILE, 1);   // shadow line along the bottom edge
  });
}

/* Water gets three frames; the sparkles march sideways to suggest a current. */
function waterTile(frame) {
  return drawTile((ctx, px) => {
    fill(ctx, C.water);
    for (let y = 2; y < TILE; y += 5) {
      const shift = ((frame * 3) + y * 2) % TILE;
      for (let i = 0; i < 2; i++) {
        const x = (shift + i * 8) % TILE;
        px(x, y, C.waterLight, 3, 1);
        px((x + 4) % TILE, y + 2, C.waterDark, 2, 1);
      }
    }
  });
}

function rockTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.grass);
    const body = [
      [5, 3, 6], [3, 4, 10], [2, 5, 12], [2, 6, 12],
      [1, 7, 14], [1, 8, 14], [2, 9, 12], [2, 10, 12], [3, 11, 10],
    ];
    for (const [x, y, w] of body) px(x, y, C.rock, w, 1);
    px(4, 4, '#c0c0cc', 4, 1);
    px(3, 5, '#c0c0cc', 3, 1);
    px(3, 10, C.rockDark, 9, 1);
    px(4, 11, C.rockDark, 8, 1);
  });
}

function fenceTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.grass);
    px(0, 6, C.woodDark, TILE, 2);   // rail
    px(0, 6, C.wood, TILE, 1);
    px(3, 3, C.woodDark, 3, 11);     // post
    px(3, 3, C.wood, 1, 11);
    px(11, 3, C.woodDark, 3, 11);
    px(11, 3, C.wood, 1, 11);
  });
}

function signTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.grass);
    px(7, 9, C.woodDark, 2, 6);          // post
    px(2, 2, C.outline, 12, 9);          // board border
    px(3, 3, C.board, 10, 7);
    for (let i = 0; i < 3; i++) px(4, 5 + i * 2, C.woodDark, 8 - i * 2, 1);
  });
}

function roofTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.roof);
    for (let y = 0; y < TILE; y += 4) {
      px(0, y, C.roofDark, TILE, 1);
      for (let x = (y % 8 ? 2 : 0); x < TILE; x += 4) px(x, y + 1, C.roofDark, 1, 3);
    }
  });
}

function wallTile(withWindow) {
  return drawTile((ctx, px) => {
    fill(ctx, C.wall);
    // Stone courses with staggered vertical joints, so a run of walls reads as
    // blockwork rather than a flat grey slab.
    for (let y = 0; y < TILE; y += 5) {
      px(0, y, C.wallDark, TILE, 1);
      px(y % 10 ? 4 : 10, y + 1, C.wallDark, 1, 4);
    }
    px(0, TILE - 1, C.wallDark, TILE, 1);
    if (!withWindow) return;
    px(4, 4, C.outline, 8, 7);
    px(5, 5, '#8fd0ef', 6, 5);
    px(8, 5, C.wallDark, 1, 5);   // window frame cross-pieces
    px(5, 7, C.wallDark, 6, 1);
  });
}

function doorTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.wall);
    px(3, 1, C.outline, 10, 15);
    px(4, 2, C.door, 8, 14);
    px(5, 3, C.doorDark, 6, 1);
    px(5, 8, C.doorDark, 6, 1);
    px(10, 9, '#f5c542', 1, 2);  // handle
  });
}

/* Everything the renderer needs, baked and ready to blit. */
function buildTiles() {
  return {
    grass: [grassTile(1), grassTile(2), grassTile(3)],
    tallGrass: tallGrassTile(),
    path: [pathTile(11), pathTile(12), pathTile(13)],
    flower: flowerTile(7),
    tree: treeTile(),
    water: [waterTile(0), waterTile(1), waterTile(2)],
    rock: rockTile(),
    fence: fenceTile(),
    sign: signTile(),
    roof: roofTile(),
    wall: wallTile(false),
    window: wallTile(true),
    door: doorTile(),
  };
}
