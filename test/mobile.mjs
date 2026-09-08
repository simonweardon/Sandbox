// Mobile tests: the game driven by a thumb on a phone-sized touchscreen.
//
// A touchscreen has no right button, no keyboard and no hover, so the input
// scheme is a different one and needs testing as such. Both bugs this found on
// its first run were invisible to the desktop suite: the stylesheet had no
// `touch-action`, so the browser held every touch back to see whether it was a
// scroll and the canvas never received a pointerdown at all; and the
// reinforcement panel covered the middle third of a portrait screen, so taps
// meant for the battlefield landed on it.
//
//   npm run test:mobile
//
// Same requirements as test/browser.mjs — Playwright and a Chromium.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let chromium, devices;
for (const spec of [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)) {
  try { ({ chromium, devices } = await import(spec)); break; } catch { /* next */ }
}
if (!chromium) {
  console.log('\nPlaywright is not installed — skipping the mobile tests.');
  console.log('  npm i -D playwright        (or set PLAYWRIGHT_PATH)\n');
  process.exit(0);
}

const PORT = process.env.PORT || 3312;
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
  env: { ...process.env, PORT }, stdio: 'ignore',
});
const stop = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 800));

const launch = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] };
if (process.env.CHROMIUM_PATH) {
  launch.executablePath = process.env.CHROMIUM_PATH;
  launch.headless = false;
  launch.args = ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', ...launch.args];
}
const browser = await chromium.launch(launch);
const phone = devices['Pixel 5'];
const ctx = await browser.newContext({ ...phone, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type()==='error' && !m.text().includes('404')) errs.push('CONSOLE ' + m.text()); });

let pass = 0, fail = 0;
const check = (n, ok, d='') => { if (ok) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + '  ' + d); } };
const state = (fn, a) => page.evaluate(fn, a);

await page.goto(`http://localhost:${PORT}/?seed=1942`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);
console.log('viewport:', JSON.stringify(page.viewportSize()));

check('touch mode is detected', await state(() => document.body.classList.contains('touch')));
check('the touch button bar is showing',
  await state(() => getComputedStyle(document.querySelector('.hud-touch')).display !== 'none'));
check('the page does not scroll sideways',
  await state(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  await state(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`));

// Dismiss the opening screen by tapping it.
await page.tap('.hud-help');
await page.waitForTimeout(400);
check('tapping the opening screen dismisses it',
  await state(() => window.game.hud.help.style.display === 'none'));
check('the middle of the screen is the battlefield, not a panel',
  await state(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return el && el.id === 'view';
  }),
  await state(() => { const e = document.elementFromPoint(innerWidth/2, innerHeight/2); return e ? e.tagName + '#' + e.id + '.' + e.className : 'none'; }));
check('the reinforcement panel starts folded away',
  await state(() => document.querySelector('.hud-calls').getBoundingClientRect().height < 40));


// Put one particular man dead centre, so a narrow portrait screen still has
// something to tap.
await state(() => {
  const g = window.game;
  g.battle.paused = true;
  const man = g.battle.world.entities.find((e) => e.kind === 'soldier'
    && e.faction === g.battle.playerSide && !e.inVehicle);
  window.__man = man.id;
  g.rig.focus.set(man.x, 0, man.z);
  g.rig.targetDistance = g.rig.distance = 26;
  g.rig.pitch = 50 * Math.PI/180; g.rig.yaw = 0;
});
await page.waitForTimeout(1200);

const manAt = await state(() => {
  const g = window.game;
  const e = g.battle.world.byId.get(window.__man);
  if (!e) return null;
  const v = new g.THREE.Vector3(e.x, (e.y ?? 0) + 0.9, e.z).project(g.camera);
  return { x: (v.x*0.5+0.5)*innerWidth, y: (-v.y*0.5+0.5)*innerHeight,
           ndc: [+v.x.toFixed(2), +v.y.toFixed(2)] };
});
check('a soldier is on screen to tap', !!manAt && Math.abs(manAt.ndc[0]) < 0.9 && Math.abs(manAt.ndc[1]) < 0.9, JSON.stringify(manAt));

// ---- tap to select ---------------------------------------------------------
await page.touchscreen.tap(manAt.x, manAt.y);
await page.waitForTimeout(400);
check('tapping a soldier selects him',
  (await state(() => window.game.selection.units.length)) === 1,
  `${await state(() => window.game.selection.units.length)} selected`);

// ---- tap elsewhere to order ------------------------------------------------
await state(() => { window.game.battle.paused = false; });
const before = await state(() => window.game.selection.units.map((u) => ({ id: u.id, x: u.x, z: u.z })));
await page.touchscreen.tap(manAt.x + 60, manAt.y - 70);
await page.waitForTimeout(500);
check('tapping the ground orders them there',
  (await state(() => window.game.selection.units.filter((u) => u.orders.length || u.path.length).length)) > 0);

// ---- drag to pan -----------------------------------------------------------
const focus0 = await state(() => ({ x: window.game.rig.focus.x, z: window.game.rig.focus.z }));
await page.touchscreen.tap(1, 1);   // ensure a clean pointer state
await state(() => { window.game.battle.paused = true; });
await page.mouse.move(200, 400);
await page.touchscreen.tap(200, 400);
// Playwright has no multi-touch drag helper; drive raw touch events.
await page.evaluate(() => {
  const c = document.getElementById('view');
  const mk = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }));
  mk('pointerdown', 21, 200, 400);
  for (let i = 1; i <= 8; i++) mk('pointermove', 21, 200 - i * 14, 400 - i * 8);
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 21, pointerType: 'touch', clientX: 88, clientY: 336 }));
});
await page.waitForTimeout(300);
const panned = await state((f) => Math.hypot(window.game.rig.focus.x - f.x, window.game.rig.focus.z - f.z), focus0);
check('dragging pans the camera', panned > 2, `moved ${panned.toFixed(1)} m`);

// ---- pinch to zoom ---------------------------------------------------------
const d0 = await state(() => window.game.rig.targetDistance);
await page.evaluate(() => {
  const c = document.getElementById('view');
  const mk = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y }));
  mk('pointerdown', 31, 150, 400);
  mk('pointerdown', 32, 250, 400);
  for (let i = 1; i <= 6; i++) { mk('pointermove', 31, 150 + i * 6, 400); mk('pointermove', 32, 250 - i * 6, 400); }
  for (const id of [31, 32]) window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id, pointerType: 'touch' }));
});
await page.waitForTimeout(300);
const d1 = await state(() => window.game.rig.targetDistance);
check('pinching zooms', Math.abs(d1 - d0) > 2, `${d0.toFixed(0)} -> ${d1.toFixed(0)}`);

// ---- direct control on a touchscreen --------------------------------------
await state(() => {
  const g = window.game;
  g.battle.sides[g.battle.playerSide].mp = 2000;
  const v = g.battle.purchase(g.battle.playerSide, 't34_85', 256, 70);
  g.selection.set([v]);
  g.battle.paused = false;
});
await page.tap('.hud-touch button[data-act="direct"]');
await page.waitForTimeout(600);
check('the Take over button hands you the tank', await state(() => window.game.direct.active));
check('the thumb pad appears',
  await state(() => document.querySelector('.hud-pad').classList.contains('on')));
check('and the command bar gets out of the way',
  await state(() => document.querySelector('.hud-touch').classList.contains('hidden')));

const b2 = await state(() => { const u = window.game.direct.unit; return u ? { x: u.x, z: u.z, ap: u.ammo.ap } : null; });
await state(() => { window.__f = 0; const f = () => { window.__f++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
// Hold the thumb stick forward.
await page.evaluate(() => {
  const c = document.getElementById('view');
  const mk = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 41, pointerType: 'touch', clientX: x, clientY: y }));
  mk('pointerdown', 90, 600);
  mk('pointermove', 90, 520);
});
await page.waitForFunction(() => window.__f > 45, null, { timeout: 40000 });
const drove = await state((b) => { const u = window.game.direct.unit; return u && b ? +Math.hypot(u.x-b.x, u.z-b.z).toFixed(1) : -1; }, b2);
check('the thumb stick drives the tank', drove > 2, `moved ${drove} m`);
await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41, pointerType: 'touch' })));

await state(() => { window.__f = 0; });
await page.tap('.hud-pad .fire');
await page.waitForFunction(() => window.__f > 10, null, { timeout: 40000 });
await page.waitForTimeout(400);
const fired = await state((b) => { const u = window.game.direct.unit; return u && b ? b.ap - u.ammo.ap : -1; }, b2);
check('the FIRE button fires the gun', fired > 0, `${fired} rounds`);

await page.tap('.hud-pad .leave');
await page.waitForTimeout(400);
check('Hand back returns control', !(await state(() => window.game.direct.active)));

await page.screenshot({ path: path.join(ROOT, 'test', 'mobile-final-frame.png') });
await browser.close();
stop();
console.log(`\n${pass} passed, ${fail} failed`);
if (errs.length) { console.log('\nERRORS:\n' + [...new Set(errs)].slice(0,5).join('\n')); process.exit(1); }
process.exit(fail ? 1 : 0);
