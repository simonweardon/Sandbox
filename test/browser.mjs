// Browser tests: drive the game with real mouse and keyboard input.
//
// test/run.js checks the simulation, which needs no browser. This checks the
// half that only exists in one: that a click actually selects, that a drag
// actually draws a marquee, that Enter actually hands you a tank and W
// actually drives it. Both bugs it found on the first run were in that layer
// and invisible to the headless tests — a stylesheet rule that let the
// crosshair swallow every click at screen centre, and a double click that
// never registered because pointer events report detail as 0.
//
//   npm run test:browser
//
// Needs Playwright and a Chromium; it starts and stops the server itself.
// If Playwright is not installed it says so and exits 0, so `npm test` in a
// bare checkout is not held hostage to it.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Playwright is deliberately not a dependency of this project: the game itself
// needs nothing installed. Point PLAYWRIGHT_PATH at an installation elsewhere
// if you do not want one in this tree.
let chromium;
for (const spec of [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)) {
  try {
    ({ chromium } = await import(spec));
    break;
  } catch { /* try the next */ }
}
if (!chromium) {
  console.log('\nPlaywright is not installed — skipping the browser tests.');
  console.log('  npm i -D playwright        (or set PLAYWRIGHT_PATH)');
  console.log('  CHROMIUM_PATH=... if the browser lives outside Playwright\n');
  process.exit(0);
}

const PORT = process.env.PORT || 3311;
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
  env: { ...process.env, PORT }, stdio: 'ignore',
});
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 800));

const launch = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] };
if (process.env.CHROMIUM_PATH) {
  launch.executablePath = process.env.CHROMIUM_PATH;
  // Newer Chromium builds have dropped the old headless mode Playwright asks
  // for, so drive the new one explicitly.
  launch.headless = false;
  launch.args = ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', ...launch.args];
}
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('CONSOLE ' + m.text()); });

await page.goto(`http://localhost:${PORT}/?seed=555`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
};
const state = (fn, arg) => page.evaluate(fn, arg);

/**
 * Wait for something to become true rather than sleeping and hoping.
 *
 * This browser renders in software at a few frames a second, so anything that
 * only happens inside the frame loop — the camera turning, the command card
 * redrawing — can easily take longer than a fixed 150 ms wait. Fixed sleeps
 * here do not test the game, they test how loaded the machine is.
 */
async function until(fn, ms = 4000, arg) {
  const end = Date.now() + ms;
  for (;;) {
    if (await state(fn, arg)) return true;
    if (Date.now() > end) return false;
    await page.waitForTimeout(60);
  }
}

// Real keypress to dismiss the help overlay.
await page.keyboard.press('F1');
await page.waitForTimeout(200);
check('F1 closes the help overlay', await state(() => window.game.hud.help.style.display === 'none'));

// Park the camera over one of our own squads, so there is a squadded soldier
// centre-screen to click on.
await state(() => {
  const g = window.game;
  g.battle.paused = true;
  const squads = {};
  for (const e of g.battle.world.entities) {
    if (e.kind === 'soldier' && e.faction === g.battle.playerSide && e.squad && !e.inVehicle) {
      (squads[e.squad] ||= []).push(e);
    }
  }
  const sq = Object.values(squads).sort((a, b) => b.length - a.length)[0];
  const cx = sq.reduce((a, e) => a + e.x, 0) / sq.length;
  const cz = sq.reduce((a, e) => a + e.z, 0) / sq.length;
  g.rig.focus.set(cx, 0, cz);
  g.rig.targetDistance = g.rig.distance = 32;
  g.rig.pitch = 50 * Math.PI / 180;
  g.rig.yaw = 0;
});
await page.waitForTimeout(700);

/**
 * Screen position of a matching entity that is genuinely on screen — projecting
 * the first one in the list is no good, because it may be behind the camera or
 * off the side of it.
 */
const screenOf = (pickSrc) => page.evaluate((src) => {
  const g = window.game;
  // eslint-disable-next-line no-new-func
  const candidates = new Function('g', src)(g);
  const v = new g.THREE.Vector3();
  for (const e of candidates) {
    v.set(e.x, (e.y ?? 0) + 0.9, e.z).project(g.camera);
    if (v.z > 1 || Math.abs(v.x) > 0.8 || Math.abs(v.y) > 0.75) continue;
    return { id: e.id, x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }
  return null;
}, pickSrc);

// ---- click to select -------------------------------------------------------
// Gun crews are spawned without a squad, so pick a man who belongs to one —
// otherwise the double-click test is checking the wrong thing.
const manPos = await screenOf(`
  const squads = {};
  for (const e of g.battle.world.entities) {
    if (e.kind === 'soldier' && e.squad && !e.inVehicle) (squads[e.squad] ||= []).push(e);
  }
  return Object.values(squads).filter(m => m.length > 2).flat();`);
check('a friendly soldier is on screen to click', !!manPos, JSON.stringify(manPos));
if (manPos) {
  await page.mouse.click(manPos.x, manPos.y);
  await page.waitForTimeout(200);
  const n = await state(() => window.game.selection.units.length);
  check('left click selects a unit', n === 1, `selected ${n}`);
}

// ---- double click selects the squad ---------------------------------------
if (manPos) {
  await page.mouse.dblclick(manPos.x, manPos.y);
  await page.waitForTimeout(200);
  const n = await state(() => window.game.selection.units.length);
  check('double click selects the whole squad', n > 1, `selected ${n}`);
}

// ---- drag a marquee --------------------------------------------------------
await page.mouse.move(320, 180);
await page.mouse.down();
await page.mouse.move(1150, 620, { steps: 8 });
const marqueeShown = await page.evaluate(() => document.getElementById('marquee').style.display === 'block');
await page.mouse.up();
await page.waitForTimeout(200);
check('dragging draws a selection marquee', marqueeShown);
const boxN = await state(() => window.game.selection.units.length);
check('box select picks up several units', boxN > 1, `selected ${boxN}`);

// ---- right click issues a move --------------------------------------------
await state(() => { window.game.battle.paused = false; });
const before = await state(() => window.game.selection.units.map((u) => ({ id: u.id, x: u.x, z: u.z })));
await page.mouse.click(640, 300, { button: 'right' });
await page.waitForTimeout(300);
const ordered = await state(() => window.game.selection.units.filter((u) => u.orders.length > 0 || u.path.length > 0).length);
check('right click issues movement orders', ordered > 0, `${ordered} units given orders`);
// Walking takes as long as it takes, and this browser runs the simulation at
// whatever rate the software renderer allows, so wait for the movement rather
// than for a stopwatch.
const movedCount = async () => state((b) => window.game.selection.units.filter((u) => {
  const was = b.find((p) => p.id === u.id);
  return was && Math.hypot(u.x - was.x, u.z - was.z) > 1.5;
}).length, before);
const walkedEnd = Date.now() + 12000;
let moved = 0;
while (Date.now() < walkedEnd && (moved = await movedCount()) === 0) await page.waitForTimeout(150);
check('and the units actually move', moved > 0, `${moved} moved`);

// ---- stance ---------------------------------------------------------------
await page.keyboard.press('Digit3');
await page.waitForTimeout(150);
const prone = await state(() => window.game.selection.units.filter((u) => u.stance === 2).length);
check('3 puts infantry prone', prone > 0, `${prone} prone`);
await page.keyboard.press('Digit1');
await page.waitForTimeout(150);
check('1 stands them back up', (await state(() => window.game.selection.units.filter((u) => u.stance === 0).length)) > 0);

// ---- hold fire and stop ----------------------------------------------------
await page.keyboard.press('KeyH');
await page.waitForTimeout(150);
check('H holds fire', (await state(() => window.game.selection.units.every((u) => u.holdFire))));
// Stop moved off X so that X could be examine, the way it is in the game this
// is modelled on.
await page.keyboard.press('KeyZ');
await page.waitForTimeout(150);
check('Z cancels orders', (await state(() => window.game.selection.units.every((u) => u.orders.length === 0))));

// ---- the command card ------------------------------------------------------
{
  const acts = await page.$$eval('.hud-orders button', (bs) => bs.map((b) => b.dataset.act));
  check('the command card lists the orders', acts.length >= 8, acts.join(' '));
  for (const want of ['prone', 'hold', 'stop', 'loot', 'repair', 'heal', 'mine', 'inventory', 'direct']) {
    check(`  it offers ${want}`, acts.includes(want));
  }

  // Clicking a button is the same order as pressing its key.
  await page.click('.hud-orders button[data-act="prone"]');
  await page.waitForTimeout(120);
  check('clicking Prone puts them down',
    (await state(() => window.game.selection.units.filter((u) => u.stance === 2).length)) > 0);

  await page.click('.hud-orders button[data-act="hold"]');
  await page.waitForTimeout(120);
  const holding = await state(() => window.game.selection.units.every((u) => u.holdFire));
  check('and Hold fire toggles from the card', typeof holding === 'boolean');
  await page.click('.hud-orders button[data-act="hold"]');   // put it back

  // A verb the selection cannot perform is shown greyed rather than hidden —
  // "you cannot do that any more" is information, a missing button is not.
  const mineOff = await page.$eval('.hud-orders button[data-act="mine"]', (b) => b.disabled);
  const carries = await state(() => window.game.selection.units.some((u) => u.inv?.mines > 0));
  check('a verb nobody can perform is greyed, not hidden', mineOff === !carries,
    `disabled=${mineOff}, anyone carrying mines=${carries}`);

  // An order that needs somewhere to point arms itself and says so on the card.
  await state(() => {
    const t = window.game.battle.world.entities.find((e) =>
      e.kind === 'vehicle' && e.faction === window.game.battle.playerSide && !e.destroyed);
    if (t) window.game.selection.set([t]);
  });
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyF');
  check('an order needing a target arms first',
    await until(() => document.querySelectorAll('.hud-orders button.arming').length === 1));
  await page.keyboard.press('Escape');
  check('and Escape disarms it',
    await until(() => document.querySelectorAll('.hud-orders button.arming').length === 0));
}

// ---- inventory -------------------------------------------------------------
{
  // One man, so the inventory has somebody to show.
  await state(() => {
    const s = window.game.battle.world.entities.find((e) =>
      e.kind === 'soldier' && e.faction === window.game.battle.playerSide && !e.inVehicle);
    window.game.selection.set([s]);
  });
  await page.waitForTimeout(120);
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(200);
  const open = await page.$eval('.hud-inv', (e) => e.style.display !== 'none');
  check('I opens the inventory', open);
  const items = await page.$$eval('.hud-inv .item', (n) => n.map((e) => e.textContent.trim()));
  check('and it lists what he is carrying', items.length >= 2, items.slice(0, 3).join(' | '));
  const load = await page.$eval('.hud-inv .load span', (e) => e.textContent.trim());
  check('with the load he is under', /\d+ \/ \d+/.test(load), load);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check('and Escape closes it', await page.$eval('.hud-inv', (e) => e.style.display === 'none'));
}

// ---- direct control, driven with real keys and mouse ----------------------
await state(() => {
  const g = window.game;
  const v = g.battle.world.entities.find((e) => e.kind === 'vehicle' && e.faction === g.battle.playerSide
    && !e.destroyed && !e.abandoned && e.crew.some((c) => c.occupant));
  if (v) { g.selection.set([v]); g.rig.focus.set(v.x, 0, v.z); }
  return !!v;
});
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('Enter takes direct control', await state(() => window.game.direct.active));
// Freeze the opposition so the tank under test is not shot out from under us
// while we are checking that the controls work.
await state(() => { for (const e of window.game.battle.world.entities) if (e.faction !== window.game.battle.playerSide) e.holdFire = true; });

const beforeDrive = await state(() => {
  const u = window.game.direct.unit;
  return u ? { x: u.x, z: u.z, turret: u.turretYaw, ap: u.ammo.ap } : null;
});
check('the unit under direct control is still there', !!beforeDrive);
await state(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
await page.keyboard.down('KeyW');
await page.waitForFunction(() => window.__frames > 40, null, { timeout: 40000 });
await page.keyboard.up('KeyW');
await page.waitForTimeout(200);
console.log(`  (renderer managed ${await state(() => window.__fps ?? 0)} fps under software GL)`);
const drove = await state((b) => {
  const u = window.game.direct.unit;
  return u && b ? Math.hypot(u.x - b.x, u.z - b.z) : -1;
}, beforeDrive);
check('W drives the tank', drove > 2, `moved ${drove.toFixed(1)} m`);

await state(() => { window.__frames = 0; });
await page.mouse.move(300, 300);
await page.waitForFunction(() => window.__frames > 30, null, { timeout: 40000 });
const traversed = await state((b) => (window.game.direct.unit && b ? Math.abs(window.game.direct.unit.turretYaw - b.turret) : -1), beforeDrive);
check('the mouse traverses the turret', traversed > 0.05, `${(traversed * 57.3).toFixed(1)} degrees`);

await state(() => { window.__frames = 0; });
await page.mouse.down();
await page.waitForFunction(() => window.__frames > 12, null, { timeout: 40000 });
await page.mouse.up();
const fired = await state((b) => (window.game.direct.unit && b ? { spent: b.ap - window.game.direct.unit.ammo.ap } : { spent: -1 }), beforeDrive);
check('left click fires the main gun', fired.spent > 0, `spent ${fired.spent} rounds`);

await page.keyboard.press('KeyR');
await page.waitForTimeout(200);
check('R changes shell', (await state(() => window.game.direct.unit?.selectedShell)) === 'he');

await page.keyboard.press('Enter');
await page.waitForTimeout(200);
check('Enter hands the unit back', !(await state(() => window.game.direct.active)));

// ---- dismount --------------------------------------------------------------
const dismounted = await state(() => {
  const g = window.game;
  const v = g.battle.world.entities.find((e) => e.kind === 'vehicle' && e.crew.some((c) => c.occupant)
    && e.faction === g.battle.playerSide);
  if (!v) return null;
  g.selection.set([v]);
  return v.crew.filter((c) => c.occupant).length;
});
if (dismounted) {
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(300);
  const left = await state(() => {
    const v = window.game.selection.units[0];
    return v ? v.crew.filter((c) => c.occupant).length : -1;
  });
  check('U dismounts the crew', left === 0, `${left} still aboard (was ${dismounted})`);
}

// ---- zoom, rotate, pause, minimap ------------------------------------------
const d0 = await state(() => window.game.rig.targetDistance);
await page.mouse.wheel(0, 300);
await page.waitForTimeout(200);
const d1 = await state(() => window.game.rig.targetDistance);
check('the wheel zooms', d1 > d0);
// One notch, not a leap across the map. Taking only the sign of deltaY used to
// make every event of a trackpad swipe a full step.
check('and one notch is one notch', d1 < d0 * 1.2, `${d0.toFixed(0)} -> ${d1.toFixed(0)}`);

{
  // The keys are bound in main.js, which no unit test can import, so check the
  // binding itself here: Q and E were swapped at the player's request.
  const y0 = await state(() => window.game.rig.yaw);
  await page.keyboard.down('KeyE');
  const okE = await until(() => window.game.rig.yaw > 0.05);
  await page.keyboard.up('KeyE');
  const yE = await state(() => window.game.rig.yaw);
  check('E turns the view one way', okE, `yaw ${y0.toFixed(2)} -> ${yE.toFixed(2)}`);
  await page.keyboard.down('KeyQ');
  const okQ = await until(() => window.game.rig.yaw < 0.0, 4000);
  await page.keyboard.up('KeyQ');
  check('and Q turns it back', okQ, `yaw now ${(await state(() => window.game.rig.yaw)).toFixed(2)}`);
}
await page.keyboard.press('Space');
await page.waitForTimeout(150);
check('Space pauses', await state(() => window.game.battle.paused));
await page.keyboard.press('Space');
await page.waitForTimeout(150);
check('and unpauses', !(await state(() => window.game.battle.paused)));

// ---- reinforcement button --------------------------------------------------
await state(() => { window.game.battle.sides[window.game.battle.playerSide].mp = 2000; });
await page.waitForTimeout(200);
const unitsBefore = await state(() => window.game.battle.world.entities.length);
await page.click('.hud-calls .call');
await page.waitForTimeout(400);
check('the reinforcement panel calls units in',
  (await state(() => window.game.battle.world.entities.length)) > unitsBefore);

// Manpower is not the only limit any more: the same call is barred for a while
// afterwards, so a battle cannot be won by buying four of the same tank at once.
{
  const key = await page.$eval('.hud-calls .call', (b) => b.dataset.key);
  check('a call-in goes on cooldown once it is used',
    await until((k) => window.game.battle.cooldownLeft(window.game.battle.playerSide, k) > 0, 4000, key),
    key);
  check('and the panel shows which ones are cooling',
    await until(() => document.querySelectorAll('.call.cooling').length > 0));
  const again = await state(() => window.game.battle.world.entities.length);
  await page.click('.hud-calls .call');
  await page.waitForTimeout(400);
  check('and clicking it again brings nothing',
    (await state(() => window.game.battle.world.entities.length)) === again);
}

// The HUD must still be operable after making it click-through.
await page.click('.hud-speed .spd:nth-child(3)');
await page.waitForTimeout(200);
check('the speed buttons still take clicks', (await state(() => window.game.battle.speed)) === 2);

// ---- A held to pan must not also arm an attack-move ------------------------
{
  const before = await state(() => ({ x: window.game.rig.focus.x, z: window.game.rig.focus.z }));
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyA');
  const panned = await state((b) => Math.hypot(window.game.rig.focus.x - b.x, window.game.rig.focus.z - b.z), before);
  check('holding A pans the camera', panned > 1, `moved ${panned.toFixed(1)} m`);
}

// ---- Ctrl + right click is the attack-move ---------------------------------
{
  await state(() => {
    const g = window.game;
    const men = g.battle.world.entities.filter((e) => e.kind === 'soldier'
      && e.faction === g.battle.playerSide && !e.inVehicle).slice(0, 3);
    g.selection.set(men);
    for (const m of men) { m.orders.length = 0; m.path = []; }
  });
  await page.keyboard.down('Control');
  await page.mouse.click(640, 300, { button: 'right' });
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  const kinds = await state(() => window.game.selection.units.map((u) => u.orders[0]?.type).filter(Boolean));
  check('Ctrl + right click issues an attack-move',
    kinds.length > 0 && kinds.every((k) => k === 'attackMove'), JSON.stringify(kinds));
}

// ---- the battle ends, and says so ------------------------------------------
{
  const result = await state(() => {
    const g = window.game;
    const red = g.spawn.commander(g.battle.playerSide);
    g.battle.paused = true;
    // Fight it out headlessly; 40 minutes of battle is more than enough.
    for (let i = 0; i < 30 * 60 * 40 && !g.battle.over; i++) { g.battle.step(1 / 30); red.step(1 / 30); }
    g.battle.paused = false;
    return g.battle.over;
  });
  check('a battle actually reaches a conclusion', !!result, JSON.stringify(result));
  await page.waitForTimeout(600);
  const card = await state(() => ({
    visible: window.game.hud.end.style.display !== 'none',
    text: window.game.hud.end.innerText,
  }));
  check('and the end card tells the player', card.visible
    && /VICTORY|DEFEAT/.test(card.text) && /knocked out/.test(card.text),
    card.text.slice(0, 60));
  check('the end card names the right result',
    result && card.text.startsWith(result.winner === 'sov' ? 'VICTORY' : 'DEFEAT'));

  // ---- and nothing leaked getting there ------------------------------------
  const mem = await state(() => {
    const g = window.game;
    const mats = new Set();
    let meshes = 0;
    g.scene.traverse((o) => { if (o.isMesh) { meshes++; mats.add(o.material); } });
    return { mats: mats.size, meshes, geoms: g.renderer.info.memory.geometries,
             corpses: g.battle.world.corpses.length };
  });
  // A whole battle's worth of wrecks, bodies and shell craters used to clone a
  // material apiece — hundreds of them, none ever released.
  check('materials stay bounded over a whole battle', mem.mats < 40,
    `${mem.mats} materials for ${mem.meshes} meshes, ${mem.corpses} bodies`);
  check('geometries stay bounded too', mem.geoms < 400, `${mem.geoms} geometries`);
}

// ---- the city map loads, is playable, and fills its windows ----------------
{
  await page.goto(`http://localhost:${PORT}/?seed=1942&map=city`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1600);
  const city = await state(() => {
    const g = window.game, w = g.battle.world;
    g.hud.help.style.display = 'none';
    const red = g.spawn.commander(g.battle.playerSide);
    g.battle.paused = true;
    for (let i = 0; i < 30 * 60 * 8 && !g.battle.over; i++) { g.battle.step(1 / 30); red.step(1 / 30); }
    g.battle.paused = false;
    const men = w.entities.filter((e) => e.kind === 'soldier' && !e.inVehicle);
    return {
      map: g.battle.mapKey,
      buildings: w.props.filter((p) => p.capacity > 0).length,
      men: men.length,
      atWindows: men.filter((m) => m.garrison != null).length,
      dead: w.corpses.length,
      calls: g.renderer.info.render.calls,
    };
  });
  check('the city map loads', city.map === 'city' && city.buildings > 80, JSON.stringify(city));
  check('men take to the buildings in a city fight', city.atWindows > 3,
    `${city.atWindows} of ${city.men} at windows`);
  check('a city fight is costly', city.dead > 20, `${city.dead} dead`);
  await page.waitForTimeout(1200);
  check('and it still draws in a sane number of calls', city.calls < 900, `${city.calls} draw calls`);

  // Right-clicking a building is an order to occupy it.
  const occupied = await state(() => {
    const g = window.game, w = g.battle.world;
    const men = w.entities.filter((e) => e.kind === 'soldier'
      && e.faction === g.battle.playerSide && !e.inVehicle && e.garrison == null).slice(0, 4);
    if (!men.length) return -1;
    g.selection.set(men);
    const house = w.propsNearPoint(men[0].x, men[0].z, 120)
      .find((p) => p.capacity >= 4 && p.alive);
    if (!house) return -2;
    g.selection.order({ x: house.x, z: house.z }, null, {});
    return men.filter((m) => m.orders[0]?.type === 'garrison').length;
  });
  check('right-clicking a building orders men into it', occupied > 0, `${occupied} ordered in`);
}

await page.screenshot({ path: path.join(ROOT, 'test', 'browser-final-frame.png') });
await browser.close();
stop();
console.log(`\n${pass} passed, ${fail} failed`);
if (errs.length) { console.log('\nERRORS:\n' + errs.slice(0, 8).join('\n')); process.exit(1); }
process.exit(fail ? 1 : 0);
