// Entry point: builds the battle, the scene and the interface, then runs the
// loop. The simulation advances on its own fixed clock; rendering just draws
// whatever state it finds.

import * as THREE from '../vendor/three.module.js';
import { Battle } from './sim/battle.js';
import { KIND } from './sim/world.js';
import { STANCE } from './sim/units.js';
import { createRenderer, createScene, createCamera, focusShadow } from './render/scene.js';
import { View } from './render/view.js';
import { Effects } from './render/effects.js';
import { Hud } from './render/hud.js';
import { CameraRig } from './input/camera.js';
import { Selection } from './input/selection.js';
import { DirectControl } from './input/directcontrol.js';
import { DEG } from './core/util.js';

const canvas = document.getElementById('view');
const overlay = document.getElementById('hud');
const marquee = document.getElementById('marquee');

const seed = Number(new URLSearchParams(location.search).get('seed')) || (Date.now() % 100000);
const battle = new Battle({ seed, size: 512, player: 'sov', enemy: 'ger' });

const renderer = createRenderer(canvas);
const { scene, sun } = createScene(battle.size);
const camera = createCamera(innerWidth / innerHeight);
const view = new View(scene, battle);
const effects = new Effects(scene);
const rig = new CameraRig(camera, battle.world.terrain);
const selection = new Selection(battle, rig, canvas);
const direct = new DirectControl(battle, rig);
const hud = new Hud(overlay, battle, selection, direct);
hud.rig = rig;

rig.focus.set(battle.size * 0.5, 0, battle.size * 0.16);

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const keys = new Set();
const mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, button: 0, dragging: false, start: null };
let attackMoveArmed = false;

function ndc(e) {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.ndcX = (e.clientX / innerWidth) * 2 - 1;
  mouse.ndcY = -(e.clientY / innerHeight) * 2 + 1;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  ndc(e);
  canvas.setPointerCapture(e.pointerId);
  mouse.down = true;
  mouse.button = e.button;

  if (direct.active) {
    if (e.button === 0) direct.firing = true;
    if (e.button === 2) direct.secondary = true;
    return;
  }
  if (e.button === 0) {
    mouse.start = { x: e.clientX, y: e.clientY };
    mouse.dragging = false;
  } else if (e.button === 2) {
    issueOrderAt(e);
  }
});

addEventListener('pointermove', (e) => {
  const prevX = mouse.x, prevY = mouse.y;
  ndc(e);
  if (direct.active) { direct.setAimFromScreen(mouse.ndcX, mouse.ndcY); return; }
  if (mouse.down && mouse.button === 1) {
    rig.rotate(-(e.clientX - prevX) * 0.006, (e.clientY - prevY) * 0.004);
    return;
  }
  if (mouse.down && mouse.button === 0 && mouse.start) {
    const dx = e.clientX - mouse.start.x, dy = e.clientY - mouse.start.y;
    if (Math.hypot(dx, dy) > 5) {
      mouse.dragging = true;
      marquee.style.display = 'block';
      marquee.style.left = Math.min(mouse.start.x, e.clientX) + 'px';
      marquee.style.top = Math.min(mouse.start.y, e.clientY) + 'px';
      marquee.style.width = Math.abs(dx) + 'px';
      marquee.style.height = Math.abs(dy) + 'px';
    }
  }
});

addEventListener('pointerup', (e) => {
  if (direct.active) {
    if (e.button === 0) direct.firing = false;
    if (e.button === 2) direct.secondary = false;
    mouse.down = false;
    return;
  }
  if (e.button === 0 && mouse.down) {
    if (mouse.dragging) {
      selection.boxSelect(mouse.start, { x: e.clientX, y: e.clientY }, e.shiftKey);
    } else {
      const hit = selection.pick(mouse.ndcX, mouse.ndcY);
      if (hit && hit.faction === battle.playerSide) {
        if (e.detail >= 2) selection.selectSquad(hit);
        else if (e.shiftKey) selection.add([hit]);
        else selection.set([hit]);
      } else if (!e.shiftKey) {
        selection.clear();
      }
    }
  }
  marquee.style.display = 'none';
  mouse.dragging = false;
  mouse.down = false;
  mouse.start = null;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  rig.zoom(Math.sign(e.deltaY));
}, { passive: false });

function issueOrderAt(e) {
  const point = rig.groundPoint(mouse.ndcX, mouse.ndcY);
  const target = selection.pick(mouse.ndcX, mouse.ndcY);
  const label = selection.order(point, target, {
    queue: e.shiftKey,
    attackMove: attackMoveArmed || keys.has('KeyA'),
    asCrew: e.ctrlKey,
  });
  attackMoveArmed = false;
  if (label) {
    hud.say(label === 'attack' ? 'Engaging' : label === 'board' ? 'Mounting up' : label === 'capture' ? 'Taking the objective' : 'Moving');
    effects.addDecal(point.x, point.z, 1.6, 0.35);
  }
}

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  direct.keys.add(e.code);

  // Direct control owns most keys while it is on.
  if (direct.active) {
    if (e.code === 'Enter' || e.code === 'Escape') { direct.release(); hud.say('Unit handed back'); }
    else if (e.code === 'KeyR') {
      if (direct.unit.kind === KIND.SOLDIER) direct.reload(); else direct.cycleShell();
    } else if (e.code === 'KeyG') direct.throwGrenade();
    else if (e.code === 'KeyF') direct.toggleLauncher();
    else if (e.code === 'Digit1') direct.unit.stance = STANCE.STAND;
    else if (e.code === 'Digit2') direct.unit.stance = STANCE.CROUCH;
    else if (e.code === 'Digit3') direct.unit.stance = STANCE.PRONE;
    else if (e.code === 'KeyU' && direct.unit.kind === KIND.SOLDIER && direct.unit.inVehicle) {
      direct.release();
    }
    if (['Space', 'Enter'].includes(e.code)) e.preventDefault();
    return;
  }

  switch (e.code) {
    case 'Enter': {
      const u = selection.units[0];
      if (u && direct.take(u)) hud.say(direct.message);
      else hud.say('Select a unit first');
      e.preventDefault();
      break;
    }
    case 'Space':
      battle.paused = !battle.paused;
      hud.refreshSpeed();
      hud.say(battle.paused ? 'Paused' : 'Running');
      e.preventDefault();
      break;
    case 'Digit1': case 'Digit2': case 'Digit3': {
      const n = Number(e.code.slice(5));
      if (e.ctrlKey) { selection.saveGroup(n); hud.say(`Group ${n} set`); }
      else if (selection.units.length && !e.altKey) selection.setStance(n - 1);
      break;
    }
    case 'Digit4': case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9': {
      const n = Number(e.code.slice(5));
      if (e.ctrlKey) { selection.saveGroup(n); hud.say(`Group ${n} set`); }
      else if (selection.recallGroup(n)) hud.say(`Group ${n}`);
      break;
    }
    case 'KeyH': hud.say(selection.toggleHoldFire() ? 'Holding fire' : 'Free to engage'); break;
    case 'KeyX': selection.stop(); hud.say('Stop'); break;
    case 'KeyU':
      for (const u of selection.units) {
        if (u.kind === KIND.VEHICLE) {
          for (const c of [...u.crew, ...u.passengers.map((id) => ({ occupant: id }))]) {
            const s = c.occupant && battle.world.byId.get(c.occupant);
            if (s) battle.world.byId.get(s.id) && import('./sim/units.js').then((M) => M.disembark(battle.world, s));
          }
        }
      }
      hud.say('Dismounting');
      break;
    case 'F1': hud.toggleHelp(); e.preventDefault(); break;
    case 'Escape': hud.help.style.display = 'none'; selection.clear(); break;
    default: break;
  }
});

addEventListener('keyup', (e) => { keys.delete(e.code); direct.keys.delete(e.code); });
addEventListener('blur', () => { keys.clear(); direct.keys.clear(); direct.firing = false; });
hud.help.addEventListener('click', () => hud.toggleHelp());

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

let last = performance.now();
let fpsAcc = 0, fpsN = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);

  // Camera: WASD pans unless a unit is being driven.
  if (!direct.active) {
    let f = 0, r = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
    if (keys.has('KeyA') && !attackMoveArmed) r -= 1;
    if (keys.has('ArrowLeft')) r -= 1;
    if (f || r) rig.pan(f, r, dt);
    if (keys.has('KeyQ')) rig.rotate(1.3 * dt, 0);
    if (keys.has('KeyE')) rig.rotate(-1.3 * dt, 0);
  }

  const steps = battle.advance(dt);
  if (direct.active) direct.update(dt);
  selection.prune();

  rig.update(dt, direct.active ? direct.unit : null);
  focusShadow(sun, rig.focus.x, rig.focus.z, battle.size);

  effects.consume(battle.world);
  effects.update(dt, battle.world.terrain, battle.world.projectiles);
  view.update(dt, effects, selection.units, battle.playerSide);
  hud.update(dt);

  renderer.render(scene, camera);

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) {
    window.__fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0; fpsN = 0;
  }
}

// A moment of orientation before the shooting starts.
battle.paused = true;
hud.refreshSpeed();
hud.toggleHelp();
setTimeout(() => { battle.paused = false; hud.refreshSpeed(); }, 50);

requestAnimationFrame(frame);

// Exposed for the smoke test and for poking at from the console.
window.game = { battle, view, effects, rig, selection, direct, hud, scene, renderer, camera, THREE };

// A little scaffolding for the visual smoke test in test/: it lets a headless
// browser lay out one of every vehicle and photograph them.
import { VEHICLES, GUNS } from './data/vehicles.js';
import { makeVehicle, makeGun, makeSquad } from './sim/units.js';
window.__data = { VEHICLES, GUNS };
window.__mk = (world, faction, key, x, z, yaw) => makeVehicle(world, faction, key, x, z, yaw);
window.__mkGun = (world, faction, key, x, z, yaw) => makeGun(world, faction, key, x, z, yaw);
window.__mkSquad = (world, faction, key, x, z) => makeSquad(world, faction, key, x, z);
