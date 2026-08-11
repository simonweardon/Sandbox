/*
 * battle.js — the turn-based encounters.
 *
 * Structured after Undertale: you pick an action from a menu, it resolves,
 * and then the enemy takes its turn — which you survive by steering a small
 * soul around a box, dodging what he throws at it.
 *
 * Two encounters use this. 'first' is the one at the end of the chase, which
 * cannot be won: nothing you pick works, and the way out is to run. 'final'
 * is the duel in the cellar dark, where three good flashes leave him too small
 * to be frightened of.
 */

const BOX = { x: 8, y: 92, w: 224, h: 46 };
const MENU_Y = 144;
const ENEMY_CX = 120;
const ENEMY_CY = 44;

const SOUL_SPEED = 62;
const ENEMY_TURN_TIME = 5;
const INVULN_TIME = 0.9;

/* The band in the middle of the sweep that counts as a hit. Generous on
   purpose — this is a game about a small rabbit, not a rhythm test. */
const AIM_BAND = 0.17;

const HEART = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...',
];

const ACT_OPTIONS = [
  { name: 'SQUEAK', first: ['You squeak as loudly as you can.', 'The shadow tilts its head. It is not', 'impressed.'],
    final: ['You squeak. He flinches!', 'His next lunge comes in slower.'], effect: 'slow' },
  { name: 'STARE', first: ['You stare him down.', 'You lose. You were always going', 'to lose that one.'],
    final: ['You stare him down.', 'For a second he looks away —', 'and the lantern feels steadier.'], effect: 'steady' },
  { name: 'ASK', first: ['"Give her back," you say.', 'The shadow keeps chewing.'],
    final: ['"Give her back."', 'He mumbles something. It might', 'have been "no". It might not.'] },
  { name: 'HIDE', first: ['You hide behind your own ears.', 'It does not help, but it is warm.'],
    final: ['You hide behind your ears.', 'Nerve steadies a little.'], effect: 'nerve' },
];

const ITEM_OPTIONS = [
  { name: 'RIBBON', lines: ['You tie BUTTON\'s ribbon round', 'your ear. Nerve restored!'], effect: 'nerve' },
  { name: 'CANDLE', lines: ['You light the candle stub.', 'The room steadies, and so do you.'], effect: 'steady' },
];

const battle = {
  active: false,
  kind: 'final',
  phase: 'text',
  menu: 0,
  sub: 0,
  lines: [],
  after: null,
  hits: 0,
  nerve: 3,
  maxNerve: 3,
  turn: 0,
  cower: false,
  fled: false,
  onEnd: null,
  aim: { pos: 0, dir: 1, speed: 1.05 },
  aimSteady: 0,      // turns of a slower, easier sweep
  slowWolf: 0,       // turns of a gentler enemy pattern
  soul: { x: 0, y: 0 },
  bullets: [],
  timer: 0,
  invuln: 0,
  flash: 0,
  wolfShake: 0,
};

function menuLabels() {
  return battle.kind === 'first'
    ? ['SHINE', 'ACT', 'ITEM', 'RUN']
    : ['SHINE', 'ACT', 'ITEM', 'PLEAD'];
}

function startBattle(kind, onEnd) {
  battle.active = true;
  battle.kind = kind;
  battle.menu = 0;
  battle.sub = 0;
  battle.hits = 0;
  battle.nerve = 3;
  battle.maxNerve = 3;
  battle.turn = 0;
  battle.cower = false;
  battle.fled = false;
  battle.onEnd = onEnd;
  battle.aimSteady = 0;
  battle.slowWolf = 0;
  battle.invuln = 0;
  battle.flash = 0;
  battle.bullets = [];
  G.mode = 'battle';

  say(kind === 'first'
    ? ['The shadow turns around.', 'It is very, very tall.']
    : ['He is waiting at the bottom', 'of the stair. BUTTON is behind him.'],
  () => { battle.phase = 'menu'; });
}

/* Show some text, then run `then` when the player presses A. */
function say(lines, then) {
  battle.lines = lines;
  battle.after = then || (() => { battle.phase = 'menu'; });
  battle.phase = 'text';
}

function endBattle(fled) {
  battle.active = false;
  battle.fled = fled;
  const done = battle.onEnd;
  battle.onEnd = null;
  if (done) done(fled);
}

/* --- Player actions -------------------------------------------------------- */

function chooseMenu() {
  const label = menuLabels()[battle.menu];

  if (label === 'SHINE') {
    if (battle.kind === 'first') {
      say(['You reach for a light you do not', 'have yet. You wave your paws.',
        'It is not a plan.'], enemyTurn);
      return;
    }
    battle.aim.pos = 0;
    battle.aim.dir = 1;
    battle.aim.speed = battle.aimSteady > 0 ? 0.62 : 1.05 + battle.hits * 0.22;
    battle.phase = 'aim';
    return;
  }

  if (label === 'ACT') { battle.sub = 0; battle.phase = 'act'; return; }
  if (label === 'ITEM') { battle.sub = 0; battle.phase = 'item'; return; }

  if (label === 'RUN') {
    say(['You run.', 'You are very good at running.'], () => endBattle(true));
    return;
  }

  // PLEAD — only means anything once he is small enough to hear it.
  if (battle.cower) {
    say(['"Please," you say. "She is mine."',
      'The shadow lets go of her.',
      'What is left is a very old dog',
      'who is tired of being frightening.'], () => endBattle(false));
    return;
  }
  say(['"Please give her back."', 'He is far too big to hear you yet.'], enemyTurn);
}

function chooseAct() {
  const option = ACT_OPTIONS[battle.sub];
  if (option.effect === 'slow') battle.slowWolf = 1;
  if (option.effect === 'steady') battle.aimSteady = 1;
  if (option.effect === 'nerve' && battle.kind !== 'first') {
    battle.nerve = Math.min(battle.maxNerve, battle.nerve + 1);
  }
  say(battle.kind === 'first' ? option.first : option.final, enemyTurn);
}

function chooseItem() {
  const option = ITEM_OPTIONS[battle.sub];
  if (battle.kind === 'first') {
    say(['Your pockets are empty.', 'You were asleep ten minutes ago.'], enemyTurn);
    return;
  }
  if (option.effect === 'nerve') battle.nerve = battle.maxNerve;
  if (option.effect === 'steady') battle.aimSteady = 2;
  say(option.lines, enemyTurn);
}

/* The aim sweep: stop the marker in the middle band to catch him in the beam. */
function resolveAim() {
  const offset = Math.abs(battle.aim.pos);
  if (battle.aimSteady > 0) battle.aimSteady--;

  if (offset <= AIM_BAND) {
    battle.hits++;
    battle.flash = 0.5;
    battle.wolfShake = 0.6;
    if (battle.hits >= 3) {
      battle.cower = true;
      say(['The beam catches him full on.',
        'He shrinks back down to the size',
        'of an ordinary dog, and sits.',
        'PLEAD is glowing.'], () => { battle.phase = 'menu'; battle.menu = 3; });
      return;
    }
    say(battle.hits === 1
      ? ['The light lands on him and he', 'SHRIEKS — a sound like a door.']
      : ['Twice now. He is thinner than', 'he was. Once more.'], enemyTurn);
    return;
  }
  if (offset <= AIM_BAND * 2.2) {
    say(['The beam clips his shoulder.', 'He shakes it off.'], enemyTurn);
    return;
  }
  say(['The beam goes wide and lights up', 'a great deal of empty cellar.'], enemyTurn);
}

/* --- The enemy's turn ------------------------------------------------------- */

function enemyTurn() {
  battle.phase = 'enemy';
  battle.timer = ENEMY_TURN_TIME;
  battle.soul.x = BOX.x + BOX.w / 2;
  battle.soul.y = BOX.y + BOX.h / 2;
  battle.bullets = [];
  battle.invuln = 0;
  spawnPattern();
}

/* Three patterns, cycled. Each is a list of little shadow shapes with a
   velocity; they're culled when they leave the box. */
function spawnPattern() {
  const pattern = battle.turn % 3;
  const gentle = battle.slowWolf > 0;
  if (gentle) battle.slowWolf--;
  const speed = (gentle ? 26 : 40) + battle.hits * 5;

  if (pattern === 0) {
    // Teeth sweeping in from the right, with a gap to slip through.
    for (let wave = 0; wave < 5; wave++) {
      const gap = 1 + Math.floor(Math.random() * 3);
      for (let lane = 0; lane < 4; lane++) {
        if (lane === gap) continue;
        battle.bullets.push({
          x: BOX.x + BOX.w + 12 + wave * 58,
          y: BOX.y + 8 + lane * 10,
          w: 6, h: 6, vx: -speed, vy: 0,
        });
      }
    }
    return;
  }

  if (pattern === 1) {
    // Motes drifting down at an angle.
    for (let i = 0; i < 22; i++) {
      battle.bullets.push({
        x: BOX.x + Math.random() * BOX.w,
        y: BOX.y - 10 - Math.random() * 130,
        w: 5, h: 5, vx: 12 - Math.random() * 24, vy: speed * 0.85,
      });
    }
    return;
  }

  // Pincers from both sides, alternating rows.
  for (let wave = 0; wave < 6; wave++) {
    const row = wave % 3;
    battle.bullets.push({
      x: BOX.x - 10 - wave * 46, y: BOX.y + 9 + row * 12,
      w: 7, h: 6, vx: speed, vy: 0,
    });
    battle.bullets.push({
      x: BOX.x + BOX.w + 10 + wave * 46, y: BOX.y + 15 + ((row + 1) % 3) * 12,
      w: 7, h: 6, vx: -speed, vy: 0,
    });
  }
}

function updateEnemyTurn(dt) {
  battle.timer -= dt;
  battle.invuln = Math.max(0, battle.invuln - dt);

  // Steer the soul.
  const soul = battle.soul;
  if (keys.left) soul.x -= SOUL_SPEED * dt;
  if (keys.right) soul.x += SOUL_SPEED * dt;
  if (keys.up) soul.y -= SOUL_SPEED * dt;
  if (keys.down) soul.y += SOUL_SPEED * dt;
  soul.x = Math.max(BOX.x + 5, Math.min(BOX.x + BOX.w - 5, soul.x));
  soul.y = Math.max(BOX.y + 5, Math.min(BOX.y + BOX.h - 5, soul.y));

  for (const bullet of battle.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
  }
  battle.bullets = battle.bullets.filter((b) =>
    b.x > BOX.x - 80 && b.x < BOX.x + BOX.w + 200 && b.y < BOX.y + BOX.h + 60);

  if (battle.invuln <= 0) {
    for (const bullet of battle.bullets) {
      const hit = Math.abs(bullet.x + bullet.w / 2 - soul.x) < bullet.w / 2 + 2
        && Math.abs(bullet.y + bullet.h / 2 - soul.y) < bullet.h / 2 + 2;
      if (!hit) continue;
      battle.nerve--;
      battle.invuln = INVULN_TIME;
      G.shake = 0.35;
      break;
    }
  }

  if (battle.nerve <= 0) {
    if (battle.kind === 'first') {
      say(['Your nerve goes all at once.'], () => endBattle(true));
      return;
    }
    battle.nerve = battle.maxNerve;
    battle.hits = Math.max(0, battle.hits - 1);
    say(['He knocks you sprawling and your',
      'nerve goes with it.',
      'But BUTTON is right there.',
      'Ears up. Again.'], () => { battle.phase = 'menu'; });
    return;
  }

  if (battle.timer <= 0) {
    battle.turn++;
    // The first fight is over quickly however well you dodge.
    if (battle.kind === 'first' && battle.turn >= 2) {
      say(['He steps over you, and past you,', 'and down the stairs with her.',
        'Your nerve goes all at once.'], () => endBattle(true));
      return;
    }
    battle.phase = 'menu';
  }
}

/* --- Update ------------------------------------------------------------------ */

function updateBattle(dt) {
  battle.flash = Math.max(0, battle.flash - dt);
  battle.wolfShake = Math.max(0, battle.wolfShake - dt);

  if (battle.phase === 'text') {
    if (justPressed.action) { const then = battle.after; battle.after = null; then(); }
    return;
  }

  if (battle.phase === 'menu') {
    const labels = menuLabels();
    if (justPressed.left) battle.menu = (battle.menu + labels.length - 1) % labels.length;
    if (justPressed.right) battle.menu = (battle.menu + 1) % labels.length;
    if (justPressed.action) chooseMenu();
    return;
  }

  if (battle.phase === 'act' || battle.phase === 'item') {
    const list = battle.phase === 'act' ? ACT_OPTIONS : ITEM_OPTIONS;
    if (justPressed.up) battle.sub = (battle.sub + list.length - 1) % list.length;
    if (justPressed.down) battle.sub = (battle.sub + 1) % list.length;
    if (justPressed.left || justPressed.right) { battle.phase = 'menu'; return; }
    if (justPressed.action) (battle.phase === 'act' ? chooseAct : chooseItem)();
    return;
  }

  if (battle.phase === 'aim') {
    const aim = battle.aim;
    aim.pos += aim.dir * aim.speed * dt * 2;
    if (aim.pos > 1) { aim.pos = 1; aim.dir = -1; }
    if (aim.pos < -1) { aim.pos = -1; aim.dir = 1; }
    if (justPressed.action) resolveAim();
    return;
  }

  if (battle.phase === 'enemy') updateEnemyTurn(dt);
}

/* --- Rendering ---------------------------------------------------------------- */

function battlePanel(x, y, w, h) {
  ctx.fillStyle = '#e8e2ee';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#0d0a16';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
}

function renderBattle() {
  ctx.fillStyle = '#0d0a16';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // The wolf, drawn large. He shrinks once he has been talked down.
  const scale = battle.cower ? 2 : 3;
  const size = TILE * scale;
  const jitter = battle.wolfShake > 0 ? Math.round(Math.sin(G.clock * 50) * 2) : 0;
  const sprite = wolfSheet.down[battle.phase === 'enemy' ? Math.floor(G.clock * 6) % 2 : 0];
  ctx.drawImage(sprite,
    Math.round(ENEMY_CX - size / 2 + jitter),
    Math.round(ENEMY_CY - size / 2 + (battle.cower ? 10 : 0)),
    size, size);

  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cfc7da';
  ctx.fillText(battle.cower ? 'a tired old dog' : 'THE SHADOW', ENEMY_CX, 72);
  ctx.textAlign = 'left';

  // Nerve, as hearts.
  ctx.fillStyle = '#cfc7da';
  ctx.fillText('NERVE', 10, 80);
  for (let i = 0; i < battle.maxNerve; i++) {
    drawHeart(46 + i * 10, 80, i < battle.nerve ? '#e0566e' : '#3a3348');
  }
  if (battle.kind !== 'first') {
    ctx.fillStyle = '#cfc7da';
    ctx.textAlign = 'right';
    ctx.fillText(`LIGHT ${battle.hits}/3`, VIEW_W - 10, 80);
    ctx.textAlign = 'left';
  }

  battlePanel(BOX.x, BOX.y, BOX.w, BOX.h);

  if (battle.phase === 'enemy') { renderDodgeBox(); return; }

  ctx.fillStyle = '#e8e2ee';
  ctx.font = '8px ui-monospace, monospace';

  if (battle.phase === 'text') {
    battle.lines.slice(0, 4).forEach((line, i) => ctx.fillText(line, BOX.x + 9, BOX.y + 8 + i * 10));
    if (Math.floor(G.blink * 3) % 2 === 0) {
      for (let i = 0; i < 4; i++) ctx.fillRect(BOX.x + BOX.w - 14 + i, BOX.y + BOX.h - 12 + i, 7 - i * 2, 1);
    }
  } else if (battle.phase === 'aim') {
    renderAimBar();
  } else if (battle.phase === 'act' || battle.phase === 'item') {
    const list = battle.phase === 'act' ? ACT_OPTIONS : ITEM_OPTIONS;
    list.forEach((option, i) => {
      ctx.fillStyle = '#e8e2ee';
      ctx.fillText(option.name, BOX.x + 20, BOX.y + 8 + i * 10);
      if (i === battle.sub) drawHeart(BOX.x + 10, BOX.y + 8 + i * 10, '#e0566e');
    });
  } else {
    const prompt = battle.cower
      ? 'He is sitting down. Say something.'
      : 'What do you do?';
    ctx.fillText(prompt, BOX.x + 9, BOX.y + 8);
  }

  renderMenuButtons();
}

function renderAimBar() {
  const bar = { x: BOX.x + 16, y: BOX.y + 20, w: BOX.w - 32, h: 10 };
  ctx.fillStyle = '#e8e2ee';
  ctx.fillText('Press A in the light.', BOX.x + 9, BOX.y + 6);
  ctx.fillStyle = '#2a2438';
  ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  // The band that counts.
  ctx.fillStyle = '#6a5a30';
  ctx.fillRect(bar.x + bar.w * (0.5 - AIM_BAND * 2.2 / 2), bar.y, bar.w * AIM_BAND * 2.2, bar.h);
  ctx.fillStyle = '#ffcf5a';
  ctx.fillRect(bar.x + bar.w * (0.5 - AIM_BAND / 2), bar.y, bar.w * AIM_BAND, bar.h);
  // The marker.
  const mx = bar.x + bar.w * (0.5 + battle.aim.pos / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(mx) - 1, bar.y - 3, 2, bar.h + 6);
}

function renderDodgeBox() {
  // Everything in here is clipped to the box, so shots waiting to come in
  // aren't visible sitting outside it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(BOX.x + 2, BOX.y + 2, BOX.w - 4, BOX.h - 4);
  ctx.clip();

  ctx.fillStyle = '#1d1630';
  for (const bullet of battle.bullets) {
    ctx.fillRect(Math.round(bullet.x), Math.round(bullet.y), bullet.w, bullet.h);
    ctx.fillStyle = '#ffcf5a';
    ctx.fillRect(Math.round(bullet.x) + 1, Math.round(bullet.y) + 1, 1, 1);
    ctx.fillStyle = '#1d1630';
  }
  const blink = battle.invuln > 0 && Math.floor(G.clock * 20) % 2 === 0;
  if (!blink) drawHeart(Math.round(battle.soul.x) - 3, Math.round(battle.soul.y) - 3, '#e0566e');
  ctx.restore();

  renderMenuButtons();
}

function renderMenuButtons() {
  const labels = menuLabels();
  const width = 50;
  const gap = (VIEW_W - width * labels.length) / (labels.length + 1);
  labels.forEach((label, i) => {
    const x = gap + i * (width + gap);
    const chosen = battle.phase === 'menu' && i === battle.menu;
    const live = label === 'PLEAD' && battle.cower;
    ctx.fillStyle = chosen || live ? '#ffcf5a' : '#8a819c';
    ctx.fillRect(x, MENU_Y, width, 12);
    ctx.fillStyle = '#0d0a16';
    ctx.fillRect(x + 1, MENU_Y + 1, width - 2, 10);
    ctx.fillStyle = chosen || live ? '#ffcf5a' : '#cfc7da';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + width / 2, MENU_Y + 2);
    ctx.textAlign = 'left';
  });
}

function drawHeart(x, y, colour) {
  ctx.fillStyle = colour;
  HEART.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      if (row[rx] === 'X') ctx.fillRect(x + rx, y + ry, 1, 1);
    }
  });
}
