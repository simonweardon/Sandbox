/*
 * game.js — the engine: input, movement, scenes, puzzles, the boss and the
 * renderer.
 *
 * Everything is drawn to a 240x160 canvas (the GBA resolution) and then scaled
 * up by a whole number, which is what keeps the pixels square and sharp.
 *
 * The game runs in one of three modes:
 *   play      — you have control
 *   cutscene  — a script has control (see CUTSCENES in scenes.js)
 *   boss      — Act 3's flashlight duel
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

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

/* Muttered at you when you push through the cobwebs. */
const SPOOKS = [
  ['Something skitters away', 'under the floorboards.'],
  ['The webs pull at your ears.', 'Nothing is holding them. Probably.'],
  ['A door closes somewhere', 'you have already been.'],
  ['For a moment there are', 'three sets of footsteps.'],
];

const screen = document.getElementById('screen');
const ctx = screen.getContext('2d');
ctx.imageSmoothingEnabled = false;

/* Second buffer for the darkness pass: filled with gloom, then holes are
   punched in it for each light before it's laid over the scene. */
const lightBuffer = makeCanvas(VIEW_W, VIEW_H);
const lightCtx = lightBuffer.getContext('2d');

const tiles = buildTiles();
const props = buildProps();
const pieceSprites = buildPieces();
const rabbitSheet = buildCharacter(RABBIT_PALETTE);
const sleeperSprite = buildSleeper();
const wolfSheet = buildWolf();
const ghostSheets = { A: buildGhost('A'), B: buildGhost('B') };

/* --- Actors ---------------------------------------------------------------
   The player and any scripted character share the same shape, so the same
   movement code drives both. */

function makeActor(x, y, facing) {
  return {
    x, y, fromX: x, fromY: y, facing,
    moving: false, progress: 0, stepTime: WALK_TIME,
    poseCycle: 0, turnTimer: 0, path: [], visible: true,
  };
}

const player = makeActor(3, 5, 'right');
const wolf = makeActor(17, 7, 'left');
wolf.visible = false;

/* --- Game state ----------------------------------------------------------- */

const G = {
  mode: 'cutscene',
  map: 'nursery',
  act: 1,
  sleeping: true,
  dollOnFloor: true,

  flags: {
    metMopsy: false, metDusty: false,
    cellarOpen: false, atticOpen: false, lairOpen: false,
    hasLamp: false, hasLens: false,
    cellarDone: false, atticDone: false,
  },

  lit: new Set(),        // candelabra relit for DUSTY, keyed "x,y"
  crates: [],            // cellar, rebuilt on entry
  chimeStep: 0,          // attic progress through the rhyme
  pieces: 0,

  dialogue: null,        // { pages, page }
  card: null,            // { lines, timer } act title card
  banner: 0,
  chill: 0,
  shake: 0,
  fade: 0,               // 1 = fully black
  fadeTarget: 0,
  clock: 0,
  blink: 0,
  portalGuard: false,    // stops the tile you arrive on firing again
  seenCellarHint: false,
  seenAtticHint: false,
};

const boss = {
  active: false, hits: 0, nerve: 3,
  phase: 'lurk', timer: 1.2,
  wx: 0, wy: 0, facing: 'down', pose: 0,
  flash: 0, cooldown: 0, roar: 0,
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

/* --- The map --------------------------------------------------------------- */

function currentMap() {
  return MAPS[G.map];
}

function tileAt(x, y) {
  const map = currentMap();
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return '#';
  return map.rows[y][x];
}

function isWalkable(x, y) {
  return !SOLID.has(tileAt(x, y));
}

/* Ghosts standing in this room. */
function ghostsHere() {
  return Object.values(GHOSTS).filter((g) => g.map === G.map);
}

function crateAt(x, y) {
  return G.crates.find((c) => c.x === x && c.y === y) || null;
}

function chimeAt(x, y) {
  if (G.map !== 'attic') return null;
  return CHIMES.find((c) => c.x === x && c.y === y) || null;
}

function pieceAt(x, y) {
  if (G.map !== 'manor') return null;
  return PIECES.find((p) => !p.taken && p.x === x && p.y === y) || null;
}

/* Everything that blocks a square besides the tile itself. */
function occupied(x, y) {
  if (ghostsHere().some((g) => g.x === x && g.y === y)) return true;
  if (chimeAt(x, y)) return true;
  if (wolf.visible && G.map !== 'lair' && wolf.x === x && wolf.y === y) return true;
  return false;
}

/* --- Dialogue -------------------------------------------------------------- */

function openDialogue(lines) {
  const pages = [];
  for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
  G.dialogue = { pages, page: 0 };
}

function advanceDialogue() {
  G.dialogue.page++;
  if (G.dialogue.page >= G.dialogue.pages.length) G.dialogue = null;
}

function showCard(lines, seconds = 2.8) {
  G.card = { lines, timer: seconds };
}

/* --- Moving actors --------------------------------------------------------- */

function advanceActor(actor, dt) {
  if (!actor.moving) return false;
  actor.progress += dt / actor.stepTime;
  if (actor.progress < 1) return false;
  actor.progress = 0;
  actor.moving = false;
  actor.fromX = actor.x;
  actor.fromY = actor.y;
  actor.poseCycle = (actor.poseCycle + 1) % 2;
  return true;   // a step landed
}

function beginStep(actor, dir, time = WALK_TIME) {
  const { dx, dy } = DIRS[dir];
  actor.facing = dir;
  actor.fromX = actor.x;
  actor.fromY = actor.y;
  actor.x += dx;
  actor.y += dy;
  actor.moving = true;
  actor.progress = 0;
  actor.stepTime = time;
}

/* Expands waypoints into single-tile steps for scripted walking. */
function walkPath(actor, waypoints) {
  const path = [];
  let [cx, cy] = [actor.x, actor.y];
  for (const [tx, ty] of waypoints) {
    while (cx !== tx) { cx += Math.sign(tx - cx); path.push([cx, cy]); }
    while (cy !== ty) { cy += Math.sign(ty - cy); path.push([cx, cy]); }
  }
  actor.path = path;
}

function followPath(actor, dt, time = WALK_TIME) {
  advanceActor(actor, dt);
  if (actor.moving || !actor.path.length) return;
  const [nx, ny] = actor.path.shift();
  const dir = nx > actor.x ? 'right' : nx < actor.x ? 'left' : ny > actor.y ? 'down' : 'up';
  beginStep(actor, dir, time);
}

/* --- Scene changes ---------------------------------------------------------- */

function enterMap(name, x, y, facing) {
  G.map = name;
  player.x = player.fromX = x;
  player.y = player.fromY = y;
  player.facing = facing;
  player.moving = false;
  player.progress = 0;
  player.path = [];
  G.banner = 2.6;
  G.portalGuard = true;

  if (name === 'cellar') {
    // Rebuild the crates, so a wedged puzzle is fixed by walking out and back.
    G.crates = CRATE_STARTS.map((c) => ({ x: c.x, y: c.y }));
    if (!G.flags.cellarDone && !G.seenCellarHint) {
      G.seenCellarHint = true;
      openDialogue([
        'Three crates. Three sigils in the floor.',
        'Walk into a crate to shove it along.',
        'Wedge one in a corner and just step',
        'outside — MOPSY will tut and reset it.',
      ]);
    }
  }
  if (name === 'attic' && !G.flags.atticDone && !G.seenAtticHint) {
    G.seenAtticHint = true;
    openDialogue(RHYME);
  }
  if (name === 'attic') G.chimeStep = 0;
  if (name === 'lair') startBoss();
}

function usePortal(char) {
  const portal = (PORTALS[G.map] || {})[char];
  if (!portal) return false;
  if (portal.needs && !G.flags[portal.needs]) {
    openDialogue(portal.shut);
    return true;
  }
  enterMap(portal.to, portal.x, portal.y, portal.facing);
  return true;
}

/* --- Puzzles and tasks ------------------------------------------------------ */

function crateGoalsMet() {
  return SIGILS.every((s) => G.crates.some((c) => c.x === s.x && c.y === s.y));
}

function checkCellar() {
  if (G.flags.cellarDone || !crateGoalsMet()) return;
  G.flags.cellarDone = true;
  G.flags.hasLamp = true;
  openDialogue([
    'The three sigils flare and settle.',
    'Something clicks open in the wall:',
    'a brass lantern, dusty but whole.',
    'GOT THE LANTERN. It needs a lens.',
  ]);
  maybeOpenLair();
}

function ringChime(chime) {
  if (G.flags.atticDone) {
    openDialogue(['It chimes, pleased with itself.']);
    return;
  }
  if (chime.colour === CHIME_ORDER[G.chimeStep]) {
    G.chimeStep++;
    if (G.chimeStep >= CHIME_ORDER.length) {
      G.flags.atticDone = true;
      G.flags.hasLens = true;
      openDialogue([
        'Four notes, and they hang together',
        'in the air like a held breath.',
        'A pane of moon-glass swings loose',
        'from the skylight. GOT THE LENS.',
      ]);
      maybeOpenLair();
      return;
    }
    openDialogue([`${chime.colour.toUpperCase()} rings true.`,
      `${CHIME_ORDER.length - G.chimeStep} to go.`]);
    return;
  }
  G.chimeStep = 0;
  openDialogue(['CLANG. Wrong note.', 'The rhyme starts again from the top.']);
}

function maybeOpenLair() {
  if (!G.flags.hasLamp || !G.flags.hasLens || G.flags.lairOpen) return;
  G.flags.lairOpen = true;
  G.act = 3;
}

function lightCandle(x, y) {
  if (G.lit.has(`${x},${y}`)) {
    openDialogue(['Lit. Burning nicely.']);
    return;
  }
  G.lit.add(`${x},${y}`);
  const total = SNUFFED.length;
  const done = G.lit.size;
  openDialogue(done >= total
    ? ['The last wick catches.', 'DUSTY will want to hear about this.']
    : [`The wick catches. ${done} of ${total}.`]);
}

function talkToGhost(ghost) {
  if (ghost.name === 'MOPSY') {
    if (!G.flags.metMopsy) { G.flags.metMopsy = true; openDialogue(ghost.greet); return; }
    if (G.pieces >= PIECE_TOTAL && !G.flags.cellarOpen) {
      G.flags.cellarOpen = true;
      openDialogue(ghost.done);
      return;
    }
    openDialogue(G.flags.cellarOpen
      ? ['Down the hatch with you.', 'And do not touch my coal.']
      : ghost.nag);
    return;
  }

  if (!G.flags.metDusty) { G.flags.metDusty = true; openDialogue(ghost.greet); return; }
  if (G.lit.size >= SNUFFED.length && !G.flags.atticOpen) {
    G.flags.atticOpen = true;
    openDialogue(ghost.done);
    return;
  }
  openDialogue(G.flags.atticOpen
    ? ['Up you go. Mind the third step,', 'it is not there.']
    : ghost.nag);
}

/* Pieces are picked up by walking onto them — no button required. */
function collectAt(x, y) {
  const piece = pieceAt(x, y);
  if (!piece) return;
  piece.taken = true;
  G.pieces++;
  const lines = [`You found ${piece.label}!`, piece.line];
  if (piece.extra) lines.push(piece.extra);
  if (G.pieces === PIECE_TOTAL) lines.push('That is all five.', 'MOPSY will want to see.');
  openDialogue(lines);
}

/* --- Interaction ------------------------------------------------------------ */

function facedTile() {
  const dir = DIRS[player.facing];
  return { x: player.x + dir.dx, y: player.y + dir.dy };
}

function tryInteract() {
  const front = facedTile();

  const ghost = ghostsHere().find((g) => g.x === front.x && g.y === front.y);
  if (ghost) {
    ghost.facing = OPPOSITE[player.facing];
    talkToGhost(ghost);
    return;
  }

  const chime = chimeAt(front.x, front.y);
  if (chime) { ringChime(chime); return; }

  const char = tileAt(front.x, front.y);
  if (char === 'u') { lightCandle(front.x, front.y); return; }
  if (usePortal(char)) return;

  const talk = TILE_TALK[char];
  if (talk) openDialogue(talk);
}

/* --- Player movement --------------------------------------------------------- */

function heldDirection() {
  // Fixed priority, so holding two directions at once picks one and sticks
  // with it rather than juddering between them.
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (keys[dir]) return dir;
  }
  return null;
}

/* True if the player can move into this square, pushing a crate if one is
   there and there's room behind it. */
function tryEnter(nx, ny, dir) {
  if (!isWalkable(nx, ny) || occupied(nx, ny)) return false;

  const crate = crateAt(nx, ny);
  if (crate) {
    const { dx, dy } = DIRS[dir];
    const bx = nx + dx;
    const by = ny + dy;
    if (!isWalkable(bx, by) || crateAt(bx, by) || occupied(bx, by)) return false;
    crate.x = bx;
    crate.y = by;
  }
  return true;
}

function updatePlayer(dt) {
  if (player.moving) {
    if (!advanceActor(player, dt)) return;
    onPlayerArrived();
    return;
  }

  const dir = heldDirection();
  if (!dir) { player.turnTimer = 0; return; }

  if (player.facing !== dir) {
    // Change of heart: pivot first, and only step once the pivot has landed.
    player.facing = dir;
    player.turnTimer = TURN_TIME;
    return;
  }
  if (player.turnTimer > 0) { player.turnTimer -= dt; return; }

  const { dx, dy } = DIRS[dir];
  if (!tryEnter(player.x + dx, player.y + dy, dir)) return;
  beginStep(player, dir, keys.run ? RUN_TIME : WALK_TIME);
}

function onPlayerArrived() {
  const char = tileAt(player.x, player.y);

  if (char !== '0') G.portalGuard = false;
  if (char === '0' && !G.portalGuard) { usePortal('0'); return; }

  collectAt(player.x, player.y);
  if (G.map === 'cellar') checkCellar();

  if (!G.dialogue && char === 'w' && Math.random() < SPOOK_CHANCE) {
    G.chill = 0.6;
    openDialogue(SPOOKS[Math.floor(Math.random() * SPOOKS.length)]);
  }
}

/* --- Act 1: the chase --------------------------------------------------------- */

function updateChase(dt) {
  // He keeps his distance down the landing, and is cornered at the far end.
  const ahead = Math.min(26, player.x + 6);
  if (!wolf.moving && wolf.x < ahead) beginStep(wolf, 'right', 0.16);
  advanceActor(wolf, dt);
  if (!wolf.moving) wolf.facing = wolf.x >= 26 ? 'left' : 'right';

  if (player.x >= 20 && !cutscene.active) playCutscene(CUTSCENES.scared);
}

/* --- Act 3: the flashlight duel ------------------------------------------------ */

const BEAM_LENGTH = 86;
const BEAM_HALF_ANGLE = Math.PI / 5;
const FLASH_TIME = 0.34;
const FLASH_COOLDOWN = 0.75;

function startBoss() {
  G.mode = 'boss';
  boss.active = true;
  boss.hits = 0;
  boss.nerve = 3;
  boss.flash = 0;
  boss.cooldown = 0;
  boss.roar = 0;
  placeWolf(1.4);
  showCard(['ACT THREE', 'POINT THE LIGHT AT HIM'], 3);
}

/* Drops the wolf somewhere along the edge of the room, away from her. */
function placeWolf(lurkTime) {
  const map = currentMap();
  const spots = [];
  for (let y = 2; y < map.h - 2; y++) {
    for (let x = 2; x < map.w - 2; x++) {
      const onEdge = x === 2 || y === 2 || x === map.w - 3 || y === map.h - 3;
      if (!onEdge) continue;
      if (Math.abs(x - player.x) + Math.abs(y - player.y) < 5) continue;
      spots.push([x, y]);
    }
  }
  const [x, y] = spots[Math.floor(Math.random() * spots.length)];
  boss.wx = x * TILE + TILE / 2;
  boss.wy = y * TILE + TILE / 2;
  boss.phase = 'lurk';
  boss.timer = lurkTime;
}

function playerCentre() {
  const p = actorPixel(player);
  return { x: p.x + TILE / 2, y: p.y + TILE / 2 };
}

/* Is the wolf inside the beam right now? */
function wolfInBeam() {
  const me = playerCentre();
  const dx = boss.wx - me.x;
  const dy = boss.wy - me.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  if (dist > BEAM_LENGTH) return false;
  const dir = DIRS[player.facing];
  const dot = (dx * dir.dx + dy * dir.dy) / dist;
  return dot > Math.cos(BEAM_HALF_ANGLE);
}

function updateBoss(dt) {
  boss.cooldown = Math.max(0, boss.cooldown - dt);
  boss.flash = Math.max(0, boss.flash - dt);
  boss.roar = Math.max(0, boss.roar - dt);

  // She can still walk about while the duel is on.
  updatePlayer(dt);

  if (actionPressed) {
    actionPressed = false;
    if (boss.cooldown <= 0) {
      boss.flash = FLASH_TIME;
      boss.cooldown = FLASH_COOLDOWN;
      if (boss.phase !== 'hurt' && wolfInBeam()) hitWolf();
    }
  }

  boss.timer -= dt;

  if (boss.phase === 'lurk') {
    boss.facing = boss.wx > playerCentre().x ? 'left' : 'right';
    if (boss.timer <= 0) { boss.phase = 'charge'; boss.timer = 4; }
    return;
  }

  if (boss.phase === 'charge') {
    const me = playerCentre();
    const dx = me.x - boss.wx;
    const dy = me.y - boss.wy;
    const dist = Math.hypot(dx, dy) || 0.001;
    const speed = 34 + boss.hits * 12;
    boss.wx += (dx / dist) * speed * dt;
    boss.wy += (dy / dist) * speed * dt;
    boss.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : 'down';
    boss.pose = Math.floor(G.clock * 8) % 2;
    if (dist < 11) scare();
    return;
  }

  if (boss.phase === 'hurt' && boss.timer <= 0) {
    placeWolf(Math.max(0.6, 1.4 - boss.hits * 0.3));
  }
}

function hitWolf() {
  boss.hits++;
  boss.phase = 'hurt';
  boss.timer = 0.9;
  G.chill = 0.5;

  if (boss.hits >= 3) {
    boss.active = false;
    playCutscene(CUTSCENES.victory);
    return;
  }
  openDialogue(boss.hits === 1
    ? ['The light lands on him and he', 'SHRIEKS — a sound like a door.']
    : ['Twice now. He is thinner than he', 'was. One more.']);
}

function scare() {
  boss.nerve--;
  boss.roar = 0.7;
  G.shake = 0.6;
  if (boss.nerve <= 0) {
    boss.nerve = 3;
    boss.hits = 0;
    openDialogue([
      'He rushes you and your nerve goes.',
      'You back into the stairwell, shaking.',
      'But BUTTON is still down there.',
      'Ears up. Again.',
    ]);
  } else {
    openDialogue(['He knocks you sprawling!', `Nerve left: ${boss.nerve}.`]);
  }
  placeWolf(1.2);
}

/* --- Cutscene runner --------------------------------------------------------- */

const cutscene = { steps: [], index: 0, active: false, timer: 0, started: false };

function playCutscene(steps) {
  cutscene.steps = steps();
  cutscene.index = 0;
  cutscene.active = true;
  cutscene.started = false;
  G.mode = 'cutscene';
  G.dialogue = null;
}

function updateCutscene(dt) {
  if (cutscene.index >= cutscene.steps.length) {
    cutscene.active = false;
    if (G.mode === 'cutscene') G.mode = 'play';
    return;
  }

  const step = cutscene.steps[cutscene.index];
  const next = () => { cutscene.index++; cutscene.started = false; };

  if (!cutscene.started) {
    cutscene.started = true;
    cutscene.timer = step.wait || 0;
    if (step.say) openDialogue(step.say);
    if (step.card) showCard(step.card, step.seconds || 2.8);
    if (step.walk) walkPath(step.walk, step.path);
    if (step.face) step.face.facing = step.dir;
    if (step.do) step.do();
    if (step.shake) G.shake = step.shake;
    if (step.fade !== undefined) G.fadeTarget = step.fade;
  }

  if (step.say) {
    if (actionPressed) { actionPressed = false; advanceDialogue(); }
    if (!G.dialogue) next();
    return;
  }
  if (step.walk) {
    followPath(step.walk, dt, step.speed || WALK_TIME);
    if (!step.walk.moving && !step.walk.path.length) next();
    return;
  }
  if (step.card) {
    if (!G.card) next();
    return;
  }
  if (step.fade !== undefined) {
    if (Math.abs(G.fade - G.fadeTarget) < 0.02) next();
    return;
  }
  cutscene.timer -= dt;
  if (cutscene.timer <= 0) next();
}

/* --- Update ------------------------------------------------------------------- */

function update(dt) {
  G.clock += dt;
  G.blink += dt;
  G.banner = Math.max(0, G.banner - dt);
  G.chill = Math.max(0, G.chill - dt);
  G.shake = Math.max(0, G.shake - dt);
  G.fade += Math.sign(G.fadeTarget - G.fade) * Math.min(dt * 2.2, Math.abs(G.fadeTarget - G.fade));

  if (G.card) {
    G.card.timer -= dt;
    if (G.card.timer <= 0) G.card = null;
  }

  if (G.dialogue && G.mode !== 'cutscene') {
    if (actionPressed) advanceDialogue();
    actionPressed = false;
    return;   // the house holds still while someone is talking
  }

  if (G.mode === 'cutscene') { updateCutscene(dt); actionPressed = false; return; }
  if (G.mode === 'boss') { updateBoss(dt); actionPressed = false; return; }

  if (actionPressed) {
    if (!player.moving) tryInteract();
    actionPressed = false;
  }

  updatePlayer(dt);
  if (G.map === 'chase') updateChase(dt);
}

/* --- Rendering ----------------------------------------------------------------- */

/* Position in pixels, interpolated mid-step. */
function actorPixel(actor) {
  const t = actor.moving ? actor.progress : 1;
  return {
    x: (actor.fromX + (actor.x - actor.fromX) * t) * TILE,
    y: (actor.fromY + (actor.y - actor.fromY) * t) * TILE,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* Cheap spatial hash, so the same tile always picks the same variant. */
function variantFor(x, y, count) {
  const h = Math.abs(Math.imul(x, 73856093) ^ Math.imul(y, 19349663));
  return h % count;
}

function webFor(x, y) {
  return tiles.cobweb[variantFor(x + 7, y, tiles.cobweb.length)];
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

function tileImage(char, x, y) {
  switch (char) {
    case 'r': return tiles.rug;
    case '#': return tiles.wall;
    case 'd': return tiles.doorway[variantFor(x, y, tiles.doorway.length)];
    case 'B': return tiles.bookshelf[variantFor(x, y, tiles.bookshelf.length)];
    case 'P': return tiles.portrait;
    case 'T': return tiles.table;
    case 'c': return tiles.candle;
    case 'u': return G.lit.has(`${x},${y}`) ? tiles.candle : tiles.unlitCandle;
    case 'W': return tiles.window;
    case 's': return tiles.stairs;
    case 'C': return tiles.chest;
    case 'D': return tiles.frontDoor;
    case 'b': return tiles.bed;
    case 'O': return tiles.sigil;
    case '1': return G.flags.cellarOpen ? tiles.hatchOpen : tiles.hatchShut;
    case '2': return G.flags.atticOpen ? tiles.upStair : tiles.upStairRoped;
    case '3': return tiles.downStair;
    case '0': return tiles.upStair;
    default: return tiles.floor[variantFor(x, y, tiles.floor.length)];
  }
}

/* A relit candelabra lights the room, so lights are looked up live. */
function lightRadius(char, x, y) {
  if (char === 'u') return G.lit.has(`${x},${y}`) ? LIGHTS.c : 0;
  return LIGHTS[char] || 0;
}

function drawSprite(image, sx, sy, lift = 5) {
  ctx.drawImage(image, Math.round(sx), Math.round(sy) - lift);
}

function walkPose(actor) {
  if (!actor.moving) return 0;
  return actor.poseCycle === 0 ? 1 : 2;
}

function drawDarkness(camX, camY, startX, startY, endX, endY) {
  lightCtx.globalCompositeOperation = 'source-over';
  lightCtx.fillStyle = `rgba(10,8,20,${currentMap().gloom})`;
  lightCtx.fillRect(0, 0, VIEW_W, VIEW_H);
  lightCtx.globalCompositeOperation = 'destination-out';

  const hole = (cx, cy, radius, strength = 1) => {
    if (radius <= 0) return;
    const gradient = lightCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(0,0,0,${strength})`);
    gradient.addColorStop(0.55, `rgba(0,0,0,${strength * 0.75})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = gradient;
    lightCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  };

  const me = playerCentre();
  // In the lair she only has what the lantern gives her.
  hole(me.x - camX, me.y - camY, G.mode === 'boss' ? 26 : 54);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const char = tileAt(x, y);
      const radius = lightRadius(char, x, y);
      if (!radius) continue;
      const flicker = (char === 'c' || char === 'u')
        ? 1 + Math.sin(G.clock * 7 + x * 2.3 + y) * 0.06
        : 1;
      hole(x * TILE - camX + TILE / 2, y * TILE - camY + TILE / 2, radius * flicker);
    }
  }

  // The flashlight beam: a cone cut straight out of the dark.
  if (boss.flash > 0) {
    const dir = DIRS[player.facing];
    const angle = Math.atan2(dir.dy, dir.dx);
    const cx = me.x - camX;
    const cy = me.y - camY;
    const fade = Math.min(1, boss.flash / (FLASH_TIME * 0.6));
    const gradient = lightCtx.createRadialGradient(cx, cy, 0, cx, cy, BEAM_LENGTH);
    gradient.addColorStop(0, `rgba(0,0,0,${fade})`);
    gradient.addColorStop(0.7, `rgba(0,0,0,${fade * 0.85})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = gradient;
    lightCtx.beginPath();
    lightCtx.moveTo(cx, cy);
    lightCtx.arc(cx, cy, BEAM_LENGTH, angle - BEAM_HALF_ANGLE, angle + BEAM_HALF_ANGLE);
    lightCtx.closePath();
    lightCtx.fill();
  }

  lightCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightBuffer, 0, 0);
}

function render() {
  const map = currentMap();
  const focus = actorPixel(player);
  let camX = clamp(Math.round(focus.x + TILE / 2 - VIEW_W / 2), 0, Math.max(0, map.w * TILE - VIEW_W));
  let camY = clamp(Math.round(focus.y + TILE / 2 - VIEW_H / 2), 0, Math.max(0, map.h * TILE - VIEW_H));

  if (G.shake > 0) {
    camX += Math.round(Math.sin(G.clock * 60) * 3 * G.shake);
    camY += Math.round(Math.cos(G.clock * 47) * 3 * G.shake);
  }

  const startX = Math.floor(camX / TILE);
  const startY = Math.floor(camY / TILE);
  const endX = Math.ceil((camX + VIEW_W) / TILE);
  const endY = Math.ceil((camY + VIEW_H) / TILE);

  ctx.fillStyle = '#0a0814';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const char = tileAt(x, y);
      const sx = x * TILE - camX;
      const sy = y * TILE - camY;
      ctx.drawImage(tileImage(char, x, y), sx, sy);
      if (char === 'w') ctx.drawImage(webFor(x, y), sx, sy);
      if (char === 'r') drawRugTrim(x, y, sx, sy);
    }
  }

  // Loose objects on the floor.
  if (G.map === 'manor') {
    for (const piece of PIECES) {
      if (piece.taken) continue;
      drawGlinting(pieceSprites[piece.kind], piece.x, piece.y, camX, camY);
    }
  }
  if (G.map === 'nursery' && G.dollOnFloor) {
    drawGlinting(props.doll, 8, 5, camX, camY);
  }
  if (G.map === 'cellar') {
    for (const crate of G.crates) {
      ctx.drawImage(props.crate, crate.x * TILE - camX, crate.y * TILE - camY);
    }
  }
  if (G.map === 'attic') {
    for (const chime of CHIMES) {
      ctx.drawImage(props.chime[chime.colour], chime.x * TILE - camX, chime.y * TILE - camY);
    }
  }

  // Characters, sorted by depth so lower sprites overlap higher ones.
  const actors = [];
  for (const ghost of ghostsHere()) {
    actors.push({ y: ghost.y, draw: () => {
      const bob = Math.sin(G.clock * 2 + ghost.x) * 2;
      const frame = Math.floor(G.clock * 3 + ghost.y) % 2;
      ctx.globalAlpha = 0.78;
      ctx.drawImage(ghostSheets[ghost.palette][frame],
        ghost.x * TILE - camX, Math.round(ghost.y * TILE - camY - 5 + bob));
      ctx.globalAlpha = 1;
    } });
  }

  // She is only ever asleep in her own room, in Act 1.
  if (G.sleeping && G.map === 'nursery') {
    actors.push({ y: 4, draw: () => {
      drawSprite(sleeperSprite, 3 * TILE - camX, 4 * TILE - camY, 2);
      // Zs, rising and fading.
      ctx.fillStyle = '#e8e2ee';
      ctx.font = '8px ui-monospace, monospace';
      for (let i = 0; i < 3; i++) {
        const t = (G.clock * 0.5 + i * 0.33) % 1;
        ctx.globalAlpha = 1 - t;
        ctx.fillText('z', 4 * TILE - camX + i * 3, 4 * TILE - camY - 4 - t * 12);
      }
      ctx.globalAlpha = 1;
    } });
  } else {
    actors.push({ y: player.y, draw: () => {
      const p = actorPixel(player);
      drawSprite(rabbitSheet[player.facing][walkPose(player)], p.x - camX, p.y - camY);
    } });
  }

  if (wolf.visible && G.map !== 'lair') {
    actors.push({ y: wolf.y, draw: () => {
      const p = actorPixel(wolf);
      const sheet = wolfSheet[wolf.facing] || wolfSheet.left;
      ctx.drawImage(sheet[wolf.moving ? wolf.poseCycle : 0],
        Math.round(p.x - camX), Math.round(p.y - camY) - 5);
    } });
  }

  actors.sort((a, b) => a.y - b.y);
  for (const actor of actors) actor.draw();

  if (G.mode === 'boss' && boss.active) drawBossWolf(camX, camY);

  // Cobweb foreground: redraw the lower threads over anyone standing in them.
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (tileAt(x, y) !== 'w') continue;
      ctx.drawImage(webFor(x, y), 0, 8, TILE, 8, x * TILE - camX, y * TILE - camY + 8, TILE, 8);
    }
  }

  drawDarkness(camX, camY, startX, startY, endX, endY);

  if (G.chill > 0) {
    const pulse = Math.abs(Math.sin(G.chill * 16)) * (G.chill / 0.6);
    ctx.fillStyle = `rgba(150,190,230,${pulse * 0.5})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (boss.roar > 0) {
    ctx.fillStyle = `rgba(140,20,40,${boss.roar * 0.5})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  drawHud();
  if (G.banner > 0) drawBanner();
  if (G.dialogue) drawDialogue();

  // The fade sits under the act cards, so a card can be read over black.
  if (G.fade > 0.01) {
    ctx.fillStyle = `rgba(6,4,12,${G.fade})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (G.card) drawCard();
}

function drawGlinting(sprite, tx, ty, camX, camY) {
  const sx = tx * TILE - camX;
  const sy = ty * TILE - camY;
  ctx.drawImage(sprite, sx, sy);
  const twinkle = (Math.sin(G.clock * 2.5 + tx) + 1) / 2;
  ctx.fillStyle = `rgba(255,246,214,${0.25 + twinkle * 0.6})`;
  ctx.fillRect(sx + 12, sy + 3, 1, 1);
  ctx.fillRect(sx + 11, sy + 4, 3, 1);
  ctx.fillRect(sx + 12, sy + 5, 1, 1);
}

/* In the lair the wolf is drawn from his own pixel position, and while he
   lurks only his eyes show. */
function drawBossWolf(camX, camY) {
  const sx = Math.round(boss.wx - TILE / 2 - camX);
  const sy = Math.round(boss.wy - TILE / 2 - camY);
  if (boss.phase === 'lurk') {
    const glow = 0.55 + Math.sin(G.clock * 4) * 0.25;
    ctx.fillStyle = `rgba(255,207,90,${glow})`;
    ctx.fillRect(sx + 4, sy + 7, 2, 2);
    ctx.fillRect(sx + 10, sy + 7, 2, 2);
    return;
  }
  const sheet = wolfSheet[boss.facing] || wolfSheet.down;
  ctx.globalAlpha = boss.phase === 'hurt' ? 0.45 + Math.sin(G.clock * 30) * 0.2 : 1;
  ctx.drawImage(sheet[boss.pose], sx, sy - 4);
  ctx.globalAlpha = 1;
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
  const page = G.dialogue.pages[G.dialogue.page];
  page.forEach((line, i) => ctx.fillText(line, box.x + 9, box.y + 12 + i * 12));

  if (Math.floor(G.blink * 3) % 2 === 0) {
    const ax = box.x + box.w - 14;
    const ay = box.y + box.h - 13;
    for (let i = 0; i < 4; i++) ctx.fillRect(ax + i, ay + i, 7 - i * 2, 1);
  }
}

/* Top-right status: what she's carrying, or how the duel is going. */
function drawHud() {
  if (G.mode === 'boss') {
    panel(VIEW_W - 74, 6, 68, 32);
    ctx.fillStyle = '#e8e2ee';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`LIGHT ${boss.hits}/3`, VIEW_W - 68, 12);
    ctx.fillText(`NERVE ${'*'.repeat(boss.nerve)}`, VIEW_W - 68, 24);
    return;
  }
  if (G.map === 'manor' && !G.flags.cellarOpen && G.flags.metMopsy) {
    panel(VIEW_W - 68, 6, 62, 20);
    ctx.fillStyle = '#e8e2ee';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`PIECES ${G.pieces}/${PIECE_TOTAL}`, VIEW_W - 65, 12);
    return;
  }
  if (G.map === 'manor' && G.flags.metDusty && !G.flags.atticOpen) {
    panel(VIEW_W - 74, 6, 68, 20);
    ctx.fillStyle = '#e8e2ee';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`CANDLES ${G.lit.size}/${SNUFFED.length}`, VIEW_W - 71, 12);
  }
}

function drawBanner() {
  const title = currentMap().title;
  const w = title.length * 5 + 20;
  ctx.globalAlpha = Math.min(1, G.banner / 0.8);
  panel(6, 6, w, 22);
  ctx.fillStyle = '#e8e2ee';
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(title, 16, 13);
  ctx.globalAlpha = 1;
}

/* Full-screen act title. */
function drawCard() {
  const alpha = Math.min(1, G.card.timer / 0.5);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(6,4,12,0.86)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#e8e2ee';
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  G.card.lines.forEach((line, i) => {
    ctx.fillText(line, VIEW_W / 2, VIEW_H / 2 - 12 + i * 14);
  });
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

/* --- Presentation ------------------------------------------------------------- */

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

/* --- Loop --------------------------------------------------------------------- */

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

playCutscene(CUTSCENES.intro);
requestAnimationFrame(frame);
