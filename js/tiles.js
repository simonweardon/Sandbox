/*
 * tiles.js — the 16x16 mansion tiles and the doll pieces.
 *
 * Unlike the characters these are drawn procedurally: a base fill plus detail
 * pixels, some of them scattered by a seeded RNG. Everything is baked once at
 * load. Colours run warm-but-dim, because the renderer lays a darkness pass
 * over the whole scene and only candles and windows push it back.
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
  plank: '#6b4f3a',
  plankDark: '#553d2c',
  plankLight: '#7c5c43',
  wall: '#3f3350',
  wallStripe: '#4a3d5e',
  wallDark: '#2a2033',
  rug: '#8c2f3f',
  rugDark: '#6f2532',
  rugTrim: '#c9a44a',
  wood: '#5a3f2c',
  woodDark: '#422e20',
  woodLight: '#75523a',
  gold: '#c9a44a',
  canvasDark: '#241b2f',
  pale: '#d8cbb8',
  web: 'rgba(226,226,244,0.42)',
  moon: '#9fc6e8',
  moonDim: '#6d90b4',
  flame: '#ffc357',
  flameHot: '#fff0c0',
  wax: '#efe3c8',
  outline: '#1c1526',
};

/* Floorboards. The seams run the full height at fixed columns, so boards join
   up across tiles into long runs — stagger them and the floor reads as
   brickwork instead. Three variants vary only the grain. */
function floorTile(seed) {
  return drawTile((ctx, px) => {
    fill(ctx, C.plank);
    const rand = rng(seed);
    for (const x of [0, 5, 11]) {
      px(x, 0, C.plankDark, 1, TILE);
      px(x + 1, 0, C.plankLight, 1, TILE);
    }
    // Grain running along the boards.
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(rand() * 13);
      const y = Math.floor(rand() * 12);
      px(x, y, C.plankDark, 1, 3 + Math.floor(rand() * 3));
    }
    // A butt joint on one board, often enough to break the run but rarely
    // enough that it never looks like a grid.
    if (rand() > 0.45) {
      const boardStart = [1, 6, 12][Math.floor(rand() * 3)];
      px(boardStart, Math.floor(rand() * TILE), C.plankDark, 4, 1);
    }
  });
}

/* The rug's centre only — its gold border is painted at render time on the
   edges that actually face the floor, so a run of tiles reads as one rug. */
function rugTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.rug);
    const diamond = [[7, 4, 2], [6, 5, 4], [5, 6, 6], [6, 7, 4], [7, 8, 2]];
    for (const [x, y, w] of diamond) px(x, y, C.rugTrim, w, 1);
    px(7, 6, C.rugDark, 2, 1);
    // Weave, so the pile isn't a flat colour.
    px(2, 11, C.rugDark, 3, 1);
    px(11, 11, C.rugDark, 3, 1);
    px(1, 2, C.rugDark, 2, 1);
    px(13, 13, C.rugDark, 2, 1);
  });
}

function wallTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.wall);
    // Striped wallpaper with a dark rail along the bottom.
    for (let x = 1; x < TILE; x += 4) px(x, 0, C.wallStripe, 2, 12);
    px(0, 12, C.wallDark, TILE, 4);
    px(0, 12, C.woodDark, TILE, 1);
  });
}

/* An open doorway: floor underneath, jambs either side. */
function doorwayTile(seed) {
  const base = floorTile(seed);
  return drawTile((ctx, px) => {
    ctx.drawImage(base, 0, 0);
    px(0, 0, C.woodDark, 2, TILE);
    px(TILE - 2, 0, C.woodDark, 2, TILE);
    px(0, 0, C.wood, 1, TILE);
    px(TILE - 2, 0, C.wood, 1, TILE);
  });
}

function bookshelfTile(seed) {
  return drawTile((ctx, px) => {
    fill(ctx, C.woodDark);
    const spines = ['#7a3a4a', '#3a5a7a', '#6a5a30', '#4a3a6a', '#3a6a4a'];
    const rand = rng(seed);
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 1 + shelf * 5;
      let x = 1;
      while (x < TILE - 1) {
        const w = 1 + Math.floor(rand() * 2);
        const h = 3 + Math.floor(rand() * 2);
        px(x, y + (4 - h), spines[Math.floor(rand() * spines.length)], w, h);
        x += w + 1;
      }
      px(0, y + 4, C.wood, TILE, 1);   // shelf board
    }
  });
}

/* A portrait whose sitter has seen better centuries. */
function portraitTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.wall);
    px(2, 1, C.gold, 12, 14);
    px(3, 2, C.canvasDark, 10, 12);
    // A pale face: two dark eyes and not much else.
    px(5, 4, C.pale, 6, 7);
    px(6, 6, C.canvasDark, 1, 2);
    px(9, 6, C.canvasDark, 1, 2);
    px(6, 9, C.canvasDark, 4, 1);
    px(4, 11, '#2f2438', 8, 3);   // shoulders in shadow
  });
}

/* A polished tabletop seen from above: flat, with a lit front edge and a
   shadow under the far one. Kept plain so a run of them reads as one table. */
function tableTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.wood);
    px(0, 0, C.woodDark, TILE, 2);
    px(0, 2, C.woodLight, TILE, 1);
    px(0, TILE - 2, C.woodDark, TILE, 2);
    px(0, TILE - 3, C.woodLight, TILE, 1);
    // A little grain along the length, nothing that reads as a slat.
    px(3, 6, C.woodLight, 6, 1);
    px(9, 10, C.woodLight, 5, 1);
    px(2, 12, C.woodDark, 4, 1);
  });
}

/* Candelabra — also a light source, so the flame is drawn bright. */
function candleTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.plank);
    px(0, 5, C.plankDark, TILE, 1);
    px(6, 9, C.woodDark, 4, 6);     // stand
    px(5, 14, C.woodDark, 6, 2);
    px(7, 5, C.wax, 2, 5);          // candle
    px(4, 7, C.wax, 2, 3);
    px(10, 7, C.wax, 2, 3);
    px(7, 3, C.flame, 2, 2);        // flames
    px(7, 2, C.flameHot, 2, 1);
    px(4, 5, C.flame, 2, 2);
    px(10, 5, C.flame, 2, 2);
  });
}

/* The same candelabra, snuffed out. Lighting it swaps in the lit tile. */
function unlitCandleTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.plank);
    px(0, 5, C.plankDark, TILE, 1);
    px(6, 9, C.woodDark, 4, 6);
    px(5, 14, C.woodDark, 6, 2);
    px(7, 5, '#b9ae95', 2, 5);      // wax, gone grey
    px(4, 7, '#b9ae95', 2, 3);
    px(10, 7, '#b9ae95', 2, 3);
    px(7, 4, '#6a5f4d', 2, 1);      // cold wicks
    px(4, 6, '#6a5f4d', 2, 1);
    px(10, 6, '#6a5f4d', 2, 1);
  });
}

/* A sigil cut into the cellar floor: push a crate onto it. */
function sigilTile(seed) {
  const base = floorTile(seed);
  return drawTile((ctx, px) => {
    ctx.drawImage(base, 0, 0);
    const ring = [[5, 2, 6], [3, 3, 2], [11, 3, 2], [2, 5, 2], [12, 5, 2],
      [2, 9, 2], [12, 9, 2], [3, 11, 2], [11, 11, 2], [5, 12, 6]];
    for (const [x, y, w] of ring) px(x, y, '#8fa7d8', w, 1);
    px(7, 6, '#8fa7d8', 2, 1);
    px(6, 7, '#8fa7d8', 4, 2);
    px(7, 9, '#8fa7d8', 2, 1);
  });
}

function bedTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.plank);
    px(1, 0, C.woodDark, 14, TILE);
    px(2, 1, '#e8e2ee', 12, 5);     // pillow end
    px(2, 6, '#6f7fb8', 12, 9);     // blanket
    px(2, 9, '#8494cc', 12, 1);
    px(2, 12, '#8494cc', 12, 1);
  });
}

/* The three ways down, up, and further down. */
function hatchTile(open) {
  return drawTile((ctx, px) => {
    fill(ctx, C.plank);
    px(1, 2, C.woodDark, 14, 12);
    px(2, 3, open ? '#0d0a16' : C.wood, 12, 10);
    if (!open) {
      px(2, 7, C.woodDark, 12, 1);
      px(11, 5, C.gold, 2, 3);      // the ring you'd pull
    }
    px(1, 2, C.gold, 14, 1);
    px(1, 13, C.gold, 14, 1);
  });
}

function upStairTile(roped) {
  return drawTile((ctx, px) => {
    fill(ctx, C.woodDark);
    for (let i = 0; i < 4; i++) {
      px(0, i * 4, C.wood, TILE, 3);
      px(0, i * 4 + 3, C.outline, TILE, 1);
    }
    px(0, 0, 'rgba(190,200,230,0.28)', TILE, 6);   // light from above
    if (roped) {
      px(0, 8, '#a5713f', TILE, 2);
      px(3, 7, '#c98f52', 2, 4);
      px(11, 7, '#c98f52', 2, 4);
    }
  });
}

function downStairTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.outline);
    for (let i = 0; i < 3; i++) {
      px(i + 1, 12 - i * 4, C.wood, TILE - (i + 1) * 2, 3);
      px(i + 1, 15 - i * 4, '#120d1c', TILE - (i + 1) * 2, 1);
    }
    px(0, 0, '#0a0710', TILE, 5);   // it does not get lighter down there
  });
}

function windowTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.wall);
    px(2, 1, C.woodDark, 12, 13);
    px(3, 2, C.moonDim, 10, 11);
    px(3, 2, C.moon, 10, 5);        // moonlight catching the upper panes
    px(8, 2, C.woodDark, 1, 11);    // mullions
    px(3, 7, C.woodDark, 10, 1);
  });
}

function stairsTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.woodDark);
    for (let i = 0; i < 4; i++) {
      const y = i * 4;
      px(0, y, C.wood, TILE, 3);
      px(0, y + 3, C.outline, TILE, 1);
    }
    // The dark at the top of the flight, where the light gives up.
    px(0, 0, 'rgba(20,15,28,0.55)', TILE, 5);
  });
}

/* The nursery toy chest — where the doll is meant to live. */
function chestTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.plank);
    px(0, 2, C.outline, TILE, 13);
    px(1, 3, C.woodLight, 14, 5);   // open lid, catching what light there is
    px(1, 8, C.wood, 14, 6);
    px(0, 8, C.outline, TILE, 1);
    px(2, 9, '#2b2036', 12, 4);     // the dark inside
    px(7, 7, C.gold, 2, 3);         // latch
    px(2, 3, C.gold, 1, 11);        // corner bands
    px(13, 3, C.gold, 1, 11);
  });
}

/* The front door: locked, of course. */
function frontDoorTile() {
  return drawTile((ctx, px) => {
    fill(ctx, C.wallDark);
    px(1, 0, C.woodDark, 14, TILE);
    px(2, 1, C.wood, 12, 14);
    px(2, 1, C.woodDark, 12, 1);
    px(4, 3, C.woodDark, 8, 5);
    px(4, 9, C.woodDark, 8, 5);
    px(12, 8, C.gold, 2, 2);        // handle
  });
}

/*
 * Cobwebs, drawn as a transparent overlay so they can also be laid over the
 * player's legs — she wades through them the way you'd wade through long
 * grass. Three densities, scattered by tile position: a full corner web, a few
 * strands, and the odd wisp. All faint, or a webbed room turns into a wall of
 * white lattice.
 */
function cobwebTile(density) {
  const canvas = makeCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');
  const px = (x, y) => {
    ctx.fillStyle = C.web;
    ctx.fillRect(x, y, 1, 1);
  };
  // Anchored in the top-left corner, so neighbouring webs knit together.
  const spokes = [[0, Math.PI / 4, Math.PI / 2], [Math.PI / 8, (3 * Math.PI) / 8], [Math.PI / 4]][density];
  const arcs = [[5, 10], [8], [11]][density];
  const reach = [16, 13, 8][density];

  for (const angle of spokes) {
    for (let r = 1; r < reach; r++) {
      px(Math.round(Math.cos(angle) * r), Math.round(Math.sin(angle) * r));
    }
  }
  for (const r of arcs) {
    for (let t = 0; t <= Math.PI / 2; t += 0.06) {
      px(Math.round(Math.cos(t) * r), Math.round(Math.sin(t) * r));
    }
  }
  return canvas;
}

/* --- The doll, in pieces --------------------------------------------------
   Small sprites that sit on the floor. Each is drawn with a bright pixel or
   two so it still catches the eye through the dark. */

function pieceSprite(paint) {
  return drawTile((ctx, px) => paint(px));
}

function buildPieces() {
  return {
    head: pieceSprite((px) => {
      px(5, 5, C.outline, 6, 7);
      px(6, 6, '#f0dcc6', 4, 5);
      px(6, 5, '#c96f4a', 4, 1);   // painted hair
      px(6, 8, C.outline, 1, 1);   // eyes
      px(9, 8, C.outline, 1, 1);
      px(7, 10, '#c4566a', 2, 1);  // mouth
    }),
    arm: pieceSprite((px) => {
      px(4, 7, C.outline, 9, 4);
      px(5, 8, '#f0dcc6', 7, 2);
      px(11, 7, C.outline, 3, 4);
      px(11, 8, '#e8cdb2', 2, 2);  // little hand
    }),
    leg: pieceSprite((px) => {
      px(6, 4, C.outline, 4, 9);
      px(7, 5, '#f0dcc6', 2, 6);
      px(5, 11, C.outline, 6, 3);
      px(6, 12, '#5a4a7a', 4, 1);  // shoe
    }),
    body: pieceSprite((px) => {
      px(5, 4, C.outline, 6, 3);
      px(4, 6, C.outline, 8, 8);
      px(6, 5, '#f0dcc6', 4, 2);
      px(5, 7, '#7aa0c4', 6, 6);   // blue dress
      px(5, 9, '#a8c8e4', 6, 1);
    }),
    ribbon: pieceSprite((px) => {
      px(3, 6, C.outline, 10, 5);
      px(4, 7, '#c4566a', 3, 3);
      px(9, 7, '#c4566a', 3, 3);
      px(7, 7, '#8f3348', 2, 3);   // knot
      px(4, 8, '#e07a8e', 3, 1);
    }),
  };
}

/* --- Props: things that sit on tiles rather than being one ---------------- */

const CHIME_COLOURS = {
  blue: ['#4a7fd8', '#8fb4f0'],
  red: ['#c0455f', '#e88b9b'],
  green: ['#4a9c62', '#8fd8a2'],
  gold: ['#c9a44a', '#f0d68f'],
};

function buildProps() {
  const props = {
    crate: drawTile((ctx, px) => {
      px(1, 2, C.outline, 14, 13);
      px(2, 3, C.wood, 12, 11);
      px(2, 3, C.woodLight, 12, 1);
      px(2, 13, C.woodDark, 12, 1);
      // Cross-braces
      for (let i = 0; i < 10; i++) {
        px(3 + i, 4 + i, C.woodDark);
        px(12 - i, 4 + i, C.woodDark);
      }
      px(2, 8, C.woodDark, 12, 1);
    }),
    /* BUTTON, whole — how she looks before the wolf gets to her. */
    doll: drawTile((ctx, px) => {
      px(5, 1, C.outline, 6, 6);
      px(6, 2, '#f0dcc6', 4, 4);
      px(6, 1, '#c96f4a', 4, 1);
      px(6, 4, C.outline, 1, 1);
      px(9, 4, C.outline, 1, 1);
      px(4, 6, C.outline, 8, 8);
      px(5, 7, '#7aa0c4', 6, 6);
      px(5, 9, '#a8c8e4', 6, 1);
      px(3, 7, C.outline, 2, 5);   // arms
      px(11, 7, C.outline, 2, 5);
      px(6, 6, '#c4566a', 4, 1);   // ribbon
    }),
    chime: {},
  };

  for (const [name, [body, shine]] of Object.entries(CHIME_COLOURS)) {
    props.chime[name] = drawTile((ctx, px) => {
      px(7, 0, C.woodDark, 2, 4);   // cord
      px(4, 4, C.outline, 8, 9);
      px(5, 5, body, 6, 7);
      px(6, 6, shine, 2, 4);        // highlight down one side
      px(5, 12, C.outline, 6, 1);
      px(7, 13, body, 2, 2);        // clapper
    });
  }
  return props;
}

/* Everything the renderer needs, baked and ready to blit. */
function buildTiles() {
  return {
    floor: [floorTile(1), floorTile(2), floorTile(3)],
    rug: rugTile(),
    wall: wallTile(),
    doorway: [doorwayTile(4), doorwayTile(5)],
    bookshelf: [bookshelfTile(21), bookshelfTile(22)],
    portrait: portraitTile(),
    table: tableTile(),
    candle: candleTile(),
    unlitCandle: unlitCandleTile(),
    window: windowTile(),
    stairs: stairsTile(),
    chest: chestTile(),
    frontDoor: frontDoorTile(),
    cobweb: [cobwebTile(0), cobwebTile(1), cobwebTile(2)],
    sigil: sigilTile(31),
    bed: bedTile(),
    hatchShut: hatchTile(false),
    hatchOpen: hatchTile(true),
    upStairRoped: upStairTile(true),
    upStair: upStairTile(false),
    downStair: downStairTile(),
  };
}
