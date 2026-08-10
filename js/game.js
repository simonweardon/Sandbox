/*
 * game.js — input, movement, camera, lighting and rendering.
 *
 * Everything is drawn to a 240x160 canvas (the GBA resolution) and then scaled
 * up by a whole number, which is what keeps the pixels square and sharp.
 */

const VIEW_W = 240;
const VIEW_H = 160;

const WALK_TIME = 0.22;  // seconds to cross one tile
const RUN_TIME = 0.12;
const TURN_TIME = 0.09;  // tap a direction to turn without stepping
const SPOOK_CHANCE = 0.12;

const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/* Muttered at you when you push through the cobwebs. */
const SPOOKS = [
  ['Something skitters away', 'under the floorboards.'],
  ['The webs pull at your ears.', 'Nothing is holding them. Probably.'],
  ['A door closes somewhere', 'you have already been.'],
  ['For a moment there are', 'three sets of footsteps.'],
  ['The cold goes straight', 'through your pinafore.'],
];

const screen = document.getElementById('screen');
const ctx = screen.getContext('2d');
ctx.imageSmoothingEnabled = false;

/* Second buffer for the darkness pass: filled with gloom, then holes are
   punched in it for each light before it's laid over the scene. */
const lightBuffer = makeCanvas(VIEW_W, VIEW_H);
const lightCtx = lightBuffer.getContext('2d');

const tiles = buildTiles();
const pieceSprites = buildPieces();
const rabbitSheet = buildCharacter(RABBIT_PALETTE);
const ghostFrames = buildGhost();

const player = {
  x: PLAYER_START.x,
  y: PLAYER_START.y,
  fromX: PLAYER_START.x,
  fromY: PLAYER_START.y,
  facing: PLAYER_START.facing,
  moving: false,
  progress: 0,
  stepTime: WALK_TIME,
  poseCycle: 0,
  turnTimer: 0,
};

const state = {
  dialogue: null,   // { pages: [[line, line]], page: 0 }
  found: 0,
  finished: false,
  chill: 0,         // seconds left on the cold-flash effect
  banner: 3.2,      // seconds left on the title card
  clock: 0,
  blink: 0,
};

/* --- Input ---------------------------------------------------------------- */

const keys = { up: false, down: false, left: false, right: false, run: false };
let actionPressed = false;   // consumed once, so holding A doesn't spam

const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};

const ACTION_KEYS = new Set(['KeyZ', 'Space', 'Enter']);

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (ACTION_KEYS.has(e.code)) {
    actionPressed = true;
    e.preventDefault();
    return;
  }
  const key = KEY_MAP[e.code];
  if (key) {
    keys[key] = true;
    e.preventDefault();
  }
});

addEventListener('keyup', (e) => {
  const key = KEY_MAP[e.code];
  if (key) keys[key] = false;
});

// Lose every held key when the tab goes away, or she keeps walking.
addEventListener('blur', () => {
  for (const key of Object.keys(keys)) keys[key] = false;
});

for (const button of document.querySelectorAll('#pad .key')) {
  const name = button.dataset.key;
  const press = (e) => {
    e.preventDefault();
    button.classList.add('held');
    if (name === 'action') actionPressed = true;
    else keys[name] = true;
  };
  const release = (e) => {
    e.preventDefault();
    button.classList.remove('held');
    if (name !== 'action') keys[name] = false;
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
}

/* --- Dialogue ------------------------------------------------------------- */

/* Two lines fit in the box at a time, so longer speeches get paged. */
function openDialogue(lines) {
  const pages = [];
  for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
  state.dialogue = { pages, page: 0 };
}

function advanceDialogue() {
  state.dialogue.page++;
  if (state.dialogue.page >= state.dialogue.pages.length) state.dialogue = null;
}

function facedTile() {
  const dir = DIRS[player.facing];
  return { x: player.x + dir.dx, y: player.y + dir.dy };
}

function openChest() {
  if (state.found < PIECE_TOTAL) {
    const left = PIECE_TOTAL - state.found;
    openDialogue([
      'The toy chest is empty.',
      `${left} piece${left === 1 ? '' : 's'} of BUTTON still missing.`,
    ]);
    return;
  }
  state.finished = true;
  openDialogue([
    'You lay the pieces in the chest and',
    'fit them together, one to the next.',
    'Head, body, arm, leg, ribbon —',
    'BUTTON is whole again.',
    'She looks up at you, and the manor',
    'lets out a long, tired breath.',
    'Somewhere below, the front door',
    'swings open onto the morning.',
  ]);
}

function tryInteract() {
  const front = facedTile();
  const entity = entityAt(front.x, front.y);

  if (entity) {
    if (entity.kind === 'ghost') {
      // Turn to look at whoever is talking to them.
      entity.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[player.facing];
      openDialogue(entity.lines);
      return;
    }
    if (entity.kind === 'chest') {
      openChest();
      return;
    }
  }

  const talk = TILE_TALK[tileAt(front.x, front.y)];
  if (talk) openDialogue(talk);
}

/* --- Movement ------------------------------------------------------------- */

function heldDirection() {
  // Fixed priority, so holding two directions at once picks one and sticks
  // with it rather than juddering between them.
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (keys[dir]) return dir;
  }
  return null;
}

function canEnter(x, y) {
  return isWalkable(x, y) && !entityAt(x, y);
}

/* Pieces are picked up by walking onto them — no button required. */
function collectAt(x, y) {
  const piece = pieceAt(x, y);
  if (!piece) return;
  piece.taken = true;
  state.found++;
  const lines = [`You found ${piece.label}!`, piece.line];
  if (piece.extra) lines.push(piece.extra);
  if (state.found === PIECE_TOTAL) {
    lines.push('That is all five.', 'Take her to the nursery chest.');
  }
  openDialogue(lines);
}

function updatePlayer(dt) {
  if (player.moving) {
    player.progress += dt / player.stepTime;
    if (player.progress >= 1) {
      player.progress = 0;
      player.moving = false;
      player.fromX = player.x;
      player.fromY = player.y;
      player.poseCycle = (player.poseCycle + 1) % 2;
      collectAt(player.x, player.y);
      if (!state.dialogue && tileAt(player.x, player.y) === 'w' && Math.random() < SPOOK_CHANCE) {
        spook();
      }
    }
    return;
  }

  const dir = heldDirection();
  if (!dir) {
    player.turnTimer = 0;
    return;
  }

  if (player.facing !== dir) {
    // Change of heart: pivot first, and only step once the pivot has landed.
    player.facing = dir;
    player.turnTimer = TURN_TIME;
    return;
  }

  if (player.turnTimer > 0) {
    player.turnTimer -= dt;
    return;
  }

  const { dx, dy } = DIRS[dir];
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (!canEnter(nx, ny)) return;

  player.fromX = player.x;
  player.fromY = player.y;
  player.x = nx;
  player.y = ny;
  player.moving = true;
  player.progress = 0;
  player.stepTime = keys.run ? RUN_TIME : WALK_TIME;
}

function spook() {
  state.chill = 0.6;
  openDialogue(SPOOKS[Math.floor(Math.random() * SPOOKS.length)]);
}

function update(dt) {
  state.clock += dt;
  state.blink += dt;
  state.banner = Math.max(0, state.banner - dt);
  state.chill = Math.max(0, state.chill - dt);

  if (state.dialogue) {
    if (actionPressed) advanceDialogue();
    actionPressed = false;
    return;   // the manor holds still while someone is talking
  }

  if (actionPressed) {
    if (!player.moving) tryInteract();
    actionPressed = false;
  }

  updatePlayer(dt);
}

/* --- Rendering ------------------------------------------------------------ */

/* Position in pixels, interpolated mid-step. */
function playerPixel() {
  const t = player.moving ? player.progress : 1;
  const x = (player.fromX + (player.x - player.fromX) * t) * TILE;
  const y = (player.fromY + (player.y - player.fromY) * t) * TILE;
  return { x, y };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* Cheap spatial hash, so the same tile always picks the same variant. */
function variantFor(x, y, count) {
  const h = Math.abs(Math.imul(x, 73856093) ^ Math.imul(y, 19349663));
  return h % count;
}

/* Gold border along whichever edges of a carpet meet bare floor, so a block of
   rug tiles reads as one rug rather than a stack of separate mats. */
function drawRugTrim(x, y, sx, sy) {
  const edge = (nx, ny) => tileAt(nx, ny) !== 'r';
  ctx.fillStyle = '#c9a44a';
  if (edge(x, y - 1)) ctx.fillRect(sx, sy, TILE, 1);
  if (edge(x, y + 1)) ctx.fillRect(sx, sy + TILE - 1, TILE, 1);
  if (edge(x - 1, y)) ctx.fillRect(sx, sy, 1, TILE);
  if (edge(x + 1, y)) ctx.fillRect(sx + TILE - 1, sy, 1, TILE);
}

/* Same web on the same square in both the floor pass and the overlay pass. */
function webFor(x, y) {
  return tiles.cobweb[variantFor(x + 7, y, tiles.cobweb.length)];
}

function tileImage(char, x, y) {
  switch (char) {
    case 'r': return tiles.rug;
    case '#': return tiles.wall;
    case 'd': return tiles.doorway[variantFor(x, y, tiles.doorway.length)];
    case 'B': return tiles.bookshelf[variantFor(x, y, tiles.bookshelf.length)];
    case 'P': return tiles.portrait;
    case 'T': return tiles.table;
    case 'c': return tiles.candle;
    case 'W': return tiles.window;
    case 's': return tiles.stairs;
    case 'C': return tiles.chest;
    case 'D': return tiles.frontDoor;
    default: return tiles.floor[variantFor(x, y, tiles.floor.length)];
  }
}

function drawCharacter(sheet, facing, pose, screenX, screenY) {
  // The 16px sprite stands a few pixels proud of its tile, so it reads as
  // being *in* the room rather than pasted flat onto it.
  ctx.drawImage(sheet[facing][pose], Math.round(screenX), Math.round(screenY) - 5);
}

/* Standing still shows the neutral pose; walking alternates the two step
   poses, one per tile, which is how the Game Boy games did it. */
function playerPose() {
  if (!player.moving) return 0;
  return player.poseCycle === 0 ? 1 : 2;
}

/*
 * The darkness pass. The manor is lit only by candles, windows, and whatever
 * the rabbit can see around herself — so we fill a buffer with gloom, cut a
 * soft hole for each light, and lay the result over the finished scene.
 */
function drawDarkness(camX, camY, pos, startX, startY, endX, endY) {
  // Once BUTTON is whole the house eases up and the gloom thins out.
  const gloom = state.finished ? 0.34 : 0.88;
  lightCtx.globalCompositeOperation = 'source-over';
  lightCtx.fillStyle = `rgba(10,8,20,${gloom})`;
  lightCtx.fillRect(0, 0, VIEW_W, VIEW_H);

  lightCtx.globalCompositeOperation = 'destination-out';
  const hole = (cx, cy, radius) => {
    const gradient = lightCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.75)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = gradient;
    lightCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  };

  hole(pos.x - camX + TILE / 2, pos.y - camY + TILE / 2, state.finished ? 80 : 54);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const radius = LIGHTS[tileAt(x, y)];
      if (!radius) continue;
      // Candles gutter; moonlight through a window does not.
      const flicker = tileAt(x, y) === 'c'
        ? 1 + Math.sin(state.clock * 7 + x * 2.3 + y) * 0.06
        : 1;
      hole(x * TILE - camX + TILE / 2, y * TILE - camY + TILE / 2, radius * flicker);
    }
  }

  lightCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightBuffer, 0, 0);
}

function render() {
  const pos = playerPixel();
  const camX = clamp(Math.round(pos.x + TILE / 2 - VIEW_W / 2), 0, MAP_W * TILE - VIEW_W);
  const camY = clamp(Math.round(pos.y + TILE / 2 - VIEW_H / 2), 0, MAP_H * TILE - VIEW_H);

  const startX = Math.floor(camX / TILE);
  const startY = Math.floor(camY / TILE);
  const endX = Math.ceil((camX + VIEW_W) / TILE);
  const endY = Math.ceil((camY + VIEW_H) / TILE);

  ctx.fillStyle = '#0a0814';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Floor pass. Cobwebs get plain boards here; their threads are drawn again
  // after the characters so she wades through them.
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const char = tileAt(x, y);
      ctx.drawImage(tileImage(char, x, y), x * TILE - camX, y * TILE - camY);
      if (char === 'w') ctx.drawImage(webFor(x, y), x * TILE - camX, y * TILE - camY);
      if (char === 'r') drawRugTrim(x, y, x * TILE - camX, y * TILE - camY);
    }
  }

  // Pieces lying on the floor, with a slow glint so they can be spotted.
  for (const piece of PIECES) {
    if (piece.taken) continue;
    if (piece.x < startX || piece.x > endX || piece.y < startY || piece.y > endY) continue;
    const sx = piece.x * TILE - camX;
    const sy = piece.y * TILE - camY;
    ctx.drawImage(pieceSprites[piece.kind], sx, sy);
    const twinkle = (Math.sin(state.clock * 2.5 + piece.x) + 1) / 2;
    ctx.fillStyle = `rgba(255,246,214,${0.25 + twinkle * 0.6})`;
    ctx.fillRect(sx + 12, sy + 3, 1, 1);
    ctx.fillRect(sx + 11, sy + 4, 3, 1);
    ctx.fillRect(sx + 12, sy + 5, 1, 1);
  }

  // Character pass, sorted by depth so lower sprites overlap higher ones.
  const actors = ENTITIES
    .filter((e) => e.kind === 'ghost')
    .map((e) => ({
      y: e.y,
      draw: () => {
        // Ghosts drift up and down instead of walking.
        const bob = Math.sin(state.clock * 2 + e.x) * 2;
        const frame = Math.floor(state.clock * 3 + e.y) % ghostFrames.length;
        ctx.globalAlpha = 0.78;
        ctx.drawImage(ghostFrames[frame], e.x * TILE - camX, Math.round(e.y * TILE - camY - 5 + bob));
        ctx.globalAlpha = 1;
      },
    }));
  actors.push({
    y: player.y,
    draw: () => drawCharacter(rabbitSheet, player.facing, playerPose(), pos.x - camX, pos.y - camY),
  });
  actors.sort((a, b) => a.y - b.y);
  for (const actor of actors) actor.draw();

  // Cobweb foreground: redraw the lower threads over anyone standing in them.
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (tileAt(x, y) !== 'w') continue;
      const sx = x * TILE - camX;
      const sy = y * TILE - camY;
      ctx.drawImage(webFor(x, y), 0, 8, TILE, 8, sx, sy + 8, TILE, 8);
    }
  }

  drawDarkness(camX, camY, pos, startX, startY, endX, endY);

  if (state.chill > 0) {
    // A cold blue pulse rather than a bright flash.
    const pulse = Math.abs(Math.sin(state.chill * 16)) * (state.chill / 0.6);
    ctx.fillStyle = `rgba(150,190,230,${pulse * 0.5})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  drawCounter();
  if (state.banner > 0) drawBanner();
  if (state.dialogue) drawDialogue();
}

function panel(x, y, w, h) {
  ctx.fillStyle = '#e8e2ee';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1c1526';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = '#e8e2ee';
  ctx.fillRect(x + 4, y + 4, w - 8, 1);
  ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
}

function drawDialogue() {
  const box = { x: 6, y: 108, w: VIEW_W - 12, h: 46 };
  panel(box.x, box.y, box.w, box.h);

  ctx.fillStyle = '#e8e2ee';
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  const page = state.dialogue.pages[state.dialogue.page];
  page.forEach((line, i) => ctx.fillText(line, box.x + 9, box.y + 12 + i * 12));

  // Blinking "more" arrow in the corner.
  if (Math.floor(state.blink * 3) % 2 === 0) {
    const ax = box.x + box.w - 14;
    const ay = box.y + box.h - 13;
    for (let i = 0; i < 4; i++) ctx.fillRect(ax + i, ay + i, 7 - i * 2, 1);
  }
}

/* How much of BUTTON you're carrying, always on screen. */
function drawCounter() {
  const w = 62;
  panel(VIEW_W - w - 6, 6, w, 20);
  ctx.fillStyle = '#e8e2ee';
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`PIECES ${state.found}/${PIECE_TOTAL}`, VIEW_W - w + 3, 12);
}

function drawBanner() {
  const alpha = Math.min(1, state.banner / 0.8);
  ctx.globalAlpha = alpha;
  panel(6, 6, 108, 22);
  ctx.fillStyle = '#e8e2ee';
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('ASHGROVE MANOR', 16, 13);
  ctx.globalAlpha = 1;
}

/* --- Presentation --------------------------------------------------------- */

/* Only ever scale by a whole number — a fractional scale would smear the
   pixel grid across half-pixels. */
function resize() {
  const scale = Math.max(1, Math.floor(Math.min(
    (innerWidth - 32) / VIEW_W,
    (innerHeight - 120) / VIEW_H,
  )));
  screen.style.width = `${VIEW_W * scale}px`;
  screen.style.height = `${VIEW_H * scale}px`;
}

addEventListener('resize', resize);
resize();

/* --- Loop ----------------------------------------------------------------- */

let last = performance.now();

function frame(now) {
  // Cap dt so a backgrounded tab doesn't teleport her on return.
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
