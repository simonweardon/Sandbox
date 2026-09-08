// Infantry.
//
// A soldier is five meshes: torso, head, two legs and an arm-and-weapon group.
// That is enough to read a walk cycle, a crouch and a prone position at the
// distance an RTS camera sits at, and cheap enough to put a hundred and fifty
// of them on screen.

import * as THREE from '../../../vendor/three.module.js';
import { FACTIONS } from '../../data/factions.js';
import { WEAPONS } from '../../data/weapons.js';
import { box, cyl, sphere, merge, place, shade, PAINTED, hashNoise } from './kit.js';

const D = Math.PI / 180;
const WOOD = 0x4a3524;
const GUNMETAL = 0x24262a;

// ---------------------------------------------------------------------------
// Weapons in hand
// ---------------------------------------------------------------------------

function weaponGeometry(key) {
  const w = WEAPONS[key];
  if (!w) return merge([box(0.05, 0.05, 0.9, WOOD)]);
  const parts = [];
  switch (w.cls) {
    case 'rifle':
      parts.push(box(0.045, 0.075, 0.72, WOOD, { z: 0.02 }));
      parts.push(cyl(0.011, 0.011, 0.62, 6, GUNMETAL, { z: 0.42, rx: 90 * D }));
      parts.push(box(0.04, 0.05, 0.16, shade(WOOD, -0.15), { y: -0.045, z: -0.28, rx: 12 * D }));
      break;
    case 'smg':
      parts.push(box(0.05, 0.07, 0.36, GUNMETAL, { z: 0.04 }));
      parts.push(cyl(0.012, 0.012, 0.3, 6, GUNMETAL, { z: 0.3, rx: 90 * D }));
      parts.push(box(0.03, 0.2, 0.05, shade(GUNMETAL, 0.1), { y: -0.12, z: 0.02 }));   // magazine
      parts.push(box(0.03, 0.05, 0.22, shade(GUNMETAL, -0.1), { y: -0.02, z: -0.24 }));
      break;
    case 'lmg':
      parts.push(box(0.055, 0.085, 0.62, GUNMETAL, { z: 0.02 }));
      parts.push(cyl(0.015, 0.015, 0.62, 6, shade(GUNMETAL, 0.06), { z: 0.44, rx: 90 * D }));
      parts.push(box(0.05, 0.06, 0.2, WOOD, { z: -0.34 }));
      // Bipod.
      for (const s of [-1, 1]) {
        parts.push(cyl(0.008, 0.008, 0.3, 5, GUNMETAL, { x: s * 0.07, y: -0.16, z: 0.5, rz: s * 14 * D }));
      }
      if (key === 'dp28') parts.push(cyl(0.11, 0.11, 0.03, 10, shade(GUNMETAL, 0.05), { y: 0.09, z: 0.16 }));
      break;
    case 'at':
      if (w.shell === 'heat' && w.caliber > 100) {
        // Panzerfaust: a warhead on a stick.
        parts.push(cyl(0.02, 0.02, 0.8, 6, GUNMETAL, { z: 0.1, rx: 90 * D }));
        parts.push(cyl(0.075, 0.055, 0.24, 8, shade(GUNMETAL, -0.1), { z: 0.56, rx: 90 * D }));
      } else {
        parts.push(cyl(0.035, 0.035, 1.35, 8, shade(GUNMETAL, 0.05), { z: 0.2, rx: 90 * D }));
        parts.push(box(0.05, 0.09, 0.12, shade(GUNMETAL, -0.1), { y: -0.07, z: -0.05 }));
      }
      break;
    default:
      parts.push(box(0.045, 0.07, 0.7, WOOD));
  }
  return merge(parts);
}

const WEAPON_CACHE = new Map();
function weaponFor(key) {
  if (!WEAPON_CACHE.has(key)) WEAPON_CACHE.set(key, weaponGeometry(key));
  return WEAPON_CACHE.get(key);
}

// ---------------------------------------------------------------------------
// The man
// ---------------------------------------------------------------------------

/** Helmets are the quickest way to tell one army from another at a distance. */
function helmet(faction, colour) {
  const parts = [];
  if (faction === 'ger') {
    // Deep shell with a flared rim.
    parts.push(sphere(0.135, 8, colour, { sy: 0.82 }));
    parts.push(cyl(0.155, 0.145, 0.04, 10, colour, { y: -0.055 }));
  } else if (faction === 'usa') {
    parts.push(sphere(0.13, 8, colour, { sy: 0.8 }));
    parts.push(cyl(0.16, 0.15, 0.03, 10, colour, { y: -0.05 }));
    parts.push(box(0.16, 0.02, 0.09, colour, { y: -0.05, z: 0.1 }));      // front brim
  } else {
    parts.push(sphere(0.132, 8, colour, { sy: 0.9 }));
    parts.push(cyl(0.075, 0.14, 0.05, 10, colour, { y: -0.05 }));
  }
  return parts;
}

function buildTorso(faction, role) {
  const f = FACTIONS[faction] || FACTIONS.ger;
  const parts = [];
  const uniform = f.uniform;
  // Chest and shoulders.
  parts.push(box(0.38, 0.46, 0.22, uniform, { y: 0.28 }));
  parts.push(box(0.42, 0.1, 0.24, shade(uniform, -0.05), { y: 0.46 }));
  // Webbing and belt.
  parts.push(box(0.4, 0.05, 0.24, f.gear, { y: 0.1 }));
  parts.push(box(0.07, 0.34, 0.02, f.gear, { x: -0.08, y: 0.3, z: 0.115 }));
  parts.push(box(0.07, 0.34, 0.02, f.gear, { x: 0.08, y: 0.3, z: 0.115 }));
  // Ammunition pouches.
  for (const s of [-1, 1]) parts.push(box(0.11, 0.11, 0.07, shade(f.gear, 0.08), { x: s * 0.11, y: 0.12, z: 0.13 }));
  // Pack and entrenching tool on the back.
  parts.push(box(0.28, 0.26, 0.14, shade(f.gear, 0.1), { y: 0.3, z: -0.16 }));
  if (role === 'lmg' || role === 'at') {
    parts.push(cyl(0.05, 0.05, 0.3, 6, shade(f.gear, -0.1), { x: 0.16, y: 0.28, z: -0.2, rx: 12 * D }));
  }
  return merge(parts);
}

function buildHead(faction, role) {
  const f = FACTIONS[faction] || FACTIONS.ger;
  const parts = [];
  parts.push(cyl(0.06, 0.07, 0.1, 8, f.skin, { y: -0.09 }));            // neck
  parts.push(box(0.15, 0.19, 0.16, f.skin, { y: 0.03 }));               // head
  const hc = role === 'officer' ? shade(f.helmet, -0.12) : f.helmet;
  for (const g of helmet(faction, hc)) parts.push(place(g, null, { y: 0.11 }));
  return merge(parts);
}

function buildLeg(faction, side) {
  const f = FACTIONS[faction] || FACTIONS.ger;
  const parts = [];
  parts.push(box(0.15, 0.44, 0.16, f.uniform, { y: -0.22 }));
  parts.push(box(0.15, 0.24, 0.17, shade(f.gear, -0.05), { y: -0.54 }));   // boot and gaiter
  parts.push(box(0.16, 0.07, 0.24, 0x241f1a, { y: -0.63, z: 0.04 }));
  return merge(parts);
}

function buildArms(faction, weaponKey) {
  const f = FACTIONS[faction] || FACTIONS.ger;
  const parts = [];
  // Both arms brought forward on to the weapon.
  for (const s of [-1, 1]) {
    parts.push(box(0.12, 0.34, 0.13, f.uniform, { x: s * 0.22, y: -0.13, z: 0.07, rx: -28 * D }));
    parts.push(box(0.1, 0.1, 0.1, f.skin, { x: s * 0.2, y: -0.29, z: 0.2 }));
  }
  const w = weaponFor(weaponKey);
  parts.push(place(w.clone(), null, { y: -0.24, z: 0.34 }));
  return merge(parts);
}

const BODY_CACHE = new Map();

function bodyParts(faction, role, weaponKey) {
  const key = `${faction}|${role}|${weaponKey}`;
  if (!BODY_CACHE.has(key)) {
    BODY_CACHE.set(key, {
      torso: buildTorso(faction, role),
      head: buildHead(faction, role),
      leg: buildLeg(faction, 1),
      arms: buildArms(faction, weaponKey),
    });
  }
  return BODY_CACHE.get(key);
}

/**
 * One soldier. `root` sits on the ground; `body` is everything above the hips
 * so a single rotation puts the whole man prone.
 */
export function buildSoldier(faction, role, weaponKey) {
  const g = bodyParts(faction, role, weaponKey);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.86;
  root.add(body);

  const torso = new THREE.Mesh(g.torso, PAINTED);
  torso.castShadow = true;
  body.add(torso);

  const head = new THREE.Mesh(g.head, PAINTED);
  head.position.y = 0.56;
  head.castShadow = true;
  body.add(head);

  const arms = new THREE.Mesh(g.arms, PAINTED);
  arms.position.y = 0.42;
  arms.castShadow = true;
  body.add(arms);

  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(g.leg, PAINTED);
    leg.position.set(s * 0.1, 0.86, 0);
    leg.castShadow = true;
    root.add(leg);
    legs.push(leg);
  }
  return { root, body, torso, head, arms, legs };
}

/**
 * Pose a soldier. `phase` drives the walk cycle, `stance` is stand/crouch/prone,
 * `aim` tips the weapon up or down towards what he is shooting at.
 */
export function poseSoldier(model, { phase, moving, stance, aim = 0, firing = 0 }) {
  const { body, legs, arms, head } = model;
  const swing = moving ? Math.sin(phase) * 0.62 : 0;

  if (stance === 2) {
    // Prone: the whole man goes flat, legs trailing behind.
    body.rotation.x = -78 * D;
    body.position.y = 0.3;
    legs[0].rotation.x = 78 * D; legs[1].rotation.x = 78 * D;
    legs[0].position.y = 0.28; legs[1].position.y = 0.28;
    legs[0].position.z = -0.1; legs[1].position.z = -0.1;
    arms.rotation.x = 40 * D + aim;
  } else if (stance === 1) {
    body.rotation.x = 14 * D;
    body.position.y = 0.6;
    legs[0].rotation.x = swing * 0.4 - 0.5;
    legs[1].rotation.x = -swing * 0.4 - 0.5;
    legs[0].position.y = 0.6; legs[1].position.y = 0.6;
    legs[0].position.z = 0; legs[1].position.z = 0;
    arms.rotation.x = -aim;
  } else {
    body.rotation.x = moving ? 8 * D : 0;
    body.position.y = 0.86;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    legs[0].position.y = 0.86; legs[1].position.y = 0.86;
    legs[0].position.z = 0; legs[1].position.z = 0;
    arms.rotation.x = -aim;
  }
  // Recoil kick, and a slight lean into the shot.
  if (firing > 0) arms.rotation.x -= firing * 0.22;
  head.rotation.x = -arms.rotation.x * 0.3;
}

/** A body on the ground, for the aftermath. */
export function buildCorpse(faction, role, weaponKey) {
  const m = buildSoldier(faction, role, weaponKey);
  poseSoldier(m, { phase: 0, moving: false, stance: 2, aim: 0 });
  m.body.rotation.z = 0.4;
  m.root.rotation.y = hashNoise(role.length * 3.3) * Math.PI * 2;
  return m.root;
}
