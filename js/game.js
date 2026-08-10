/*
 * game.js — input, movement, camera and rendering.
 *
 * Everything is drawn to a 240x160 canvas (the GBA resolution) and then scaled
 * up by a whole number, which is what keeps the pixels square and sharp.
 */

const VIEW_W = 240;
const VIEW_H = 160;

const WALK_TIME = 0.22;  // seconds to cross one tile
const RUN_TIME = 0.12;
const TURN_TIME = 0.09;  // tap a direction to turn without stepping
const ENCOUNTER_CHANCE = 0.09;

const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const SPECIES = ['BULBASPRITE', 'CHARBYTE', 'SQUIRTPIXEL', 'PIKABIT', 'RATTATILE', 'ZUBYTE'];

const screen = document.getElementById('screen');
const ctx = screen.getContext('2d');
ctx.imageSmoothingEnabled = false;

const tiles = buildTiles();
const heroSheet = buildCharacter(HERO_PALETTE);
const npcSheet = buildCharacter(NPC_PALETTE);

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
  flash: 0,         // seconds left on the encounter flash
  banner: 2.6,      // seconds left on the "ROUTE 1" title card
  waterFrame: 0,
  waterTimer: 0,
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

// Lose every held key when the tab goes away, or the player keeps walking.
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

function tryInteract() {
  const front = facedTile();
  const entity = entityAt(front.x, front.y);
  if (!entity) return;
  if (entity.kind === 'npc') {
    // Turn to look at whoever is talking to them.
    entity.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[player.facing];
  }
  openDialogue(entity.lines);
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

function updatePlayer(dt) {
  if (player.moving) {
    player.progress += dt / player.stepTime;
    if (player.progress >= 1) {
      player.progress = 0;
      player.moving = false;
      player.fromX = player.x;
      player.fromY = player.y;
      player.poseCycle = (player.poseCycle + 1) % 2;
      if (tileAt(player.x, player.y) === ',' && Math.random() < ENCOUNTER_CHANCE) {
        triggerEncounter();
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

function triggerEncounter() {
  const species = SPECIES[Math.floor(Math.random() * SPECIES.length)];
  state.flash = 0.55;
  openDialogue([`A wild ${species} leapt out of`, 'the tall grass!']);
}

function update(dt) {
  state.blink += dt;
  state.banner = Math.max(0, state.banner - dt);
  state.flash = Math.max(0, state.flash - dt);

  state.waterTimer += dt;
  if (state.waterTimer > 0.4) {
    state.waterTimer = 0;
    state.waterFrame = (state.waterFrame + 1) % tiles.water.length;
  }

  if (state.dialogue) {
    if (actionPressed) advanceDialogue();
    actionPressed = false;
    return;   // the world holds still while someone is talking
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

function tileImage(char, x, y) {
  switch (char) {
    case '.': return tiles.grass[variantFor(x, y, tiles.grass.length)];
    case ',': return tiles.grass[variantFor(x, y, tiles.grass.length)];
    case '-': return tiles.path[variantFor(x, y, tiles.path.length)];
    case '*': return tiles.flower;
    case '#': return tiles.tree;
    case '~': return tiles.water[state.waterFrame];
    case 'o': return tiles.rock;
    case 'f': return tiles.fence;
    case '=': return tiles.sign;
    case 'R': return tiles.roof;
    case 'w': return tiles.wall;
    case 'W': return tiles.window;
    case 'D': return tiles.door;
    default: return tiles.grass[0];
  }
}

/* Foam where the water meets land, so the lake has a shoreline rather than a
   hard rectangular edge. */
function drawShore(x, y, sx, sy) {
  ctx.fillStyle = '#a9dcf4';
  if (tileAt(x, y - 1) !== '~') ctx.fillRect(sx, sy, TILE, 2);
  if (tileAt(x, y + 1) !== '~') ctx.fillRect(sx, sy + TILE - 2, TILE, 2);
  if (tileAt(x - 1, y) !== '~') ctx.fillRect(sx, sy, 2, TILE);
  if (tileAt(x + 1, y) !== '~') ctx.fillRect(sx + TILE - 2, sy, 2, TILE);
}

function drawCharacter(sheet, facing, pose, screenX, screenY) {
  // The 16px sprite stands a few pixels proud of its tile, so it reads as
  // being *in* the scene rather than pasted flat onto it.
  ctx.drawImage(sheet[facing][pose], Math.round(screenX), Math.round(screenY) - 5);
}

/* Standing still shows the neutral pose; walking alternates the two step poses,
   one per tile, which is how the Game Boy games did it. */
function playerPose() {
  if (!player.moving) return 0;
  return player.poseCycle === 0 ? 1 : 2;
}

function render() {
  const pos = playerPixel();
  const camX = clamp(Math.round(pos.x + TILE / 2 - VIEW_W / 2), 0, MAP_W * TILE - VIEW_W);
  const camY = clamp(Math.round(pos.y + TILE / 2 - VIEW_H / 2), 0, MAP_H * TILE - VIEW_H);

  const startX = Math.floor(camX / TILE);
  const startY = Math.floor(camY / TILE);
  const endX = Math.ceil((camX + VIEW_W) / TILE);
  const endY = Math.ceil((camY + VIEW_H) / TILE);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Ground pass. Tall grass gets a plain grass base here; its blades are drawn
  // again after the characters so you stand waist-deep in it.
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const char = tileAt(x, y);
      ctx.drawImage(tileImage(char, x, y), x * TILE - camX, y * TILE - camY);
      if (char === ',') ctx.drawImage(tiles.tallGrass, x * TILE - camX, y * TILE - camY);
      if (char === '~') drawShore(x, y, x * TILE - camX, y * TILE - camY);
    }
  }

  // Character pass, sorted by depth so lower sprites overlap higher ones.
  const actors = ENTITIES
    .filter((e) => e.kind === 'npc')
    .map((e) => ({ y: e.y, draw: () => drawCharacter(npcSheet, e.facing, 0, e.x * TILE - camX, e.y * TILE - camY) }));
  actors.push({
    y: player.y,
    draw: () => drawCharacter(heroSheet, player.facing, playerPose(), pos.x - camX, pos.y - camY),
  });
  actors.sort((a, b) => a.y - b.y);
  for (const actor of actors) actor.draw();

  // Tall grass foreground: redraw the bottom half over anyone standing there.
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (tileAt(x, y) !== ',') continue;
      const sx = x * TILE - camX;
      const sy = y * TILE - camY;
      ctx.drawImage(tiles.tallGrass, 0, 8, TILE, 8, sx, sy + 8, TILE, 8);
    }
  }

  if (state.flash > 0) {
    // Two quick strobes, fading out.
    const pulse = Math.abs(Math.sin(state.flash * 18)) * (state.flash / 0.55);
    ctx.fillStyle = `rgba(255,255,255,${pulse * 0.85})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (state.banner > 0) drawBanner();
  if (state.dialogue) drawDialogue();
}

function panel(x, y, w, h) {
  ctx.fillStyle = '#241b2f';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#f8f4ec';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = '#241b2f';
  ctx.fillRect(x + 4, y + 4, w - 8, 1);
  ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
}

function drawDialogue() {
  const box = { x: 6, y: 108, w: VIEW_W - 12, h: 46 };
  panel(box.x, box.y, box.w, box.h);

  ctx.fillStyle = '#241b2f';
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

function drawBanner() {
  const alpha = Math.min(1, state.banner / 0.6);
  ctx.globalAlpha = alpha;
  panel(6, 6, 78, 22);
  ctx.fillStyle = '#241b2f';
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('ROUTE 1', 16, 13);
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
  // Cap dt so a backgrounded tab doesn't teleport the player on return.
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
