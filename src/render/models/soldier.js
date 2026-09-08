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
      parts.push(box(0.052, 0.085, 0.74, WOOD, { z: 0.02 }));
      parts.push(cyl(0.016, 0.016, 0.66, 8, GUNMETAL, { z: 0.44, rx: 90 * D }));
      parts.push(box(0.046, 0.058, 0.18, shade(WOOD, -0.15), { y: -0.05, z: -0.30, rx: 12 * D }));
      parts.push(box(0.03, 0.05, 0.10, shade(GUNMETAL, 0.05), { y: 0.055, z: -0.02 }));  // bolt
      parts.push(box(0.02, 0.035, 0.03, GUNMETAL, { y: 0.075, z: 0.70 }));               // foresight
      parts.push(box(0.012, 0.05, 0.24, shade(0x4a3a28, 0), { x: 0.04, y: -0.02, z: 0.1 })); // sling
      break;
    case 'smg':
      parts.push(box(0.058, 0.082, 0.38, GUNMETAL, { z: 0.04 }));
      parts.push(cyl(0.017, 0.017, 0.32, 8, GUNMETAL, { z: 0.32, rx: 90 * D }));
      parts.push(box(0.036, 0.22, 0.06, shade(GUNMETAL, 0.1), { y: -0.13, z: 0.02 }));  // magazine
      parts.push(box(0.034, 0.06, 0.24, shade(GUNMETAL, -0.1), { y: -0.02, z: -0.25 }));
      parts.push(box(0.045, 0.04, 0.09, shade(GUNMETAL, 0.14), { y: 0.05, z: -0.04 }));  // bolt housing
      break;
    case 'lmg':
      parts.push(box(0.062, 0.095, 0.64, GUNMETAL, { z: 0.02 }));
      parts.push(cyl(0.020, 0.020, 0.64, 8, shade(GUNMETAL, 0.06), { z: 0.46, rx: 90 * D }));
      parts.push(box(0.056, 0.068, 0.22, WOOD, { z: -0.35 }));
      // Cooling jacket, which is the silhouette that says machine gun.
      for (let i = 0; i < 5; i++) {
        parts.push(cyl(0.028, 0.028, 0.02, 8, shade(GUNMETAL, -0.15), { z: 0.28 + i * 0.08, rx: 90 * D }));
      }
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
  // Chest, tapered to the waist, with the shoulders sitting proud of it.
  parts.push(box(0.36, 0.30, 0.21, uniform, { y: 0.34 }));
  parts.push(box(0.32, 0.20, 0.19, shade(uniform, -0.03), { y: 0.14 }));
  parts.push(box(0.44, 0.11, 0.23, shade(uniform, -0.06), { y: 0.48 }));
  // Collar and the tunic's front seam.
  parts.push(box(0.20, 0.07, 0.20, shade(uniform, -0.14), { y: 0.53 }));
  parts.push(box(0.03, 0.34, 0.02, shade(uniform, -0.16), { y: 0.32, z: 0.108 }));
  // Shoulder boards, which is most of what tells a rank apart at a distance.
  for (const sd of [-1, 1]) {
    parts.push(box(0.10, 0.045, 0.16, shade(uniform, role === 'officer' ? 0.22 : -0.12),
      { x: sd * 0.17, y: 0.53 }));
  }
  // Belt, braces and pouches.
  parts.push(box(0.38, 0.055, 0.23, f.gear, { y: 0.10 }));
  parts.push(box(0.055, 0.34, 0.02, f.gear, { x: -0.09, y: 0.32, z: 0.112 }));
  parts.push(box(0.055, 0.34, 0.02, f.gear, { x: 0.09, y: 0.32, z: 0.112 }));
  for (const sd of [-1, 1]) {
    parts.push(box(0.115, 0.115, 0.075, shade(f.gear, 0.1), { x: sd * 0.115, y: 0.135, z: 0.132 }));
    parts.push(box(0.10, 0.09, 0.06, shade(f.gear, -0.05), { x: sd * 0.175, y: 0.115, z: 0.06 }));
  }
  // Pack, mess tin and entrenching tool on the back.
  parts.push(box(0.29, 0.27, 0.15, shade(f.gear, 0.12), { y: 0.33, z: -0.165 }));
  parts.push(box(0.17, 0.13, 0.06, shade(f.gear, -0.08), { y: 0.22, z: -0.245 }));
  parts.push(box(0.07, 0.19, 0.03, shade(0x3a3128, 0), { x: -0.15, y: 0.20, z: -0.20, rz: 8 * D }));
  parts.push(cyl(0.055, 0.055, 0.17, 8, shade(f.gear, -0.12), { x: 0.16, y: 0.17, z: -0.19 }));
  if (role === 'lmg' || role === 'at') {
    parts.push(cyl(0.05, 0.05, 0.32, 8, shade(f.gear, -0.1), { x: 0.17, y: 0.30, z: -0.22, rx: 12 * D }));
  }
  return merge(parts);
}

function buildHead(faction, role) {
  const f = FACTIONS[faction] || FACTIONS.ger;
  const parts = [];
  parts.push(cyl(0.062, 0.072, 0.10, 8, f.skin, { y: -0.09 }));          // neck
  parts.push(box(0.145, 0.17, 0.155, f.skin, { y: 0.035 }));             // head
  parts.push(box(0.10, 0.05, 0.02, shade(f.skin, -0.28), { y: 0.045, z: 0.085 }));   // brow
  parts.push(box(0.13, 0.035, 0.02, shade(f.skin, -0.16), { y: -0.03, z: 0.08 }));   // jaw
  const hc = role === 'officer' ? shade(f.helmet, -0.12) : f.helmet;
  for (const g of helmet(faction, hc)) parts.push(place(g, null, { y: 0.11 }));
  // Chin strap.
  parts.push(box(0.155, 0.02, 0.02, shade(f.gear, -0.1), { y: -0.025, z: 0.02 }));
  if (role === 'sniper') {
    // Scrim on the helmet, which is what a sniper reads as from above.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(box(0.07, 0.03, 0.05, shade(f.helmet, 0.16),
        { x: Math.cos(a) * 0.1, y: 0.17, z: Math.sin(a) * 0.1, ry: a }));
    }
  }
  return merge(parts);
}

function buildLeg(faction, side) {
  const f = FACTIONS[faction] || FACTIONS.ger;
  const parts = [];
  parts.push(box(0.155, 0.26, 0.165, f.uniform, { y: -0.13 }));           // thigh
  parts.push(box(0.135, 0.05, 0.155, shade(f.uniform, -0.12), { y: -0.27 })); // knee
  parts.push(box(0.13, 0.22, 0.145, shade(f.uniform, -0.04), { y: -0.41 }));  // calf
  parts.push(box(0.145, 0.20, 0.16, shade(f.gear, -0.05), { y: -0.57 }));     // gaiter
  parts.push(box(0.15, 0.075, 0.15, 0x241f1a, { y: -0.66 }));                 // boot
  parts.push(box(0.155, 0.06, 0.11, 0x1d1916, { y: -0.68, z: 0.09 }));        // toe
  return merge(parts);
}

function buildArms(faction, weaponKey) {
  const f = FACTIONS[faction] || FACTIONS.ger;
  const parts = [];
  // Both arms brought forward on to the weapon, with a break at the elbow so
  // the pose reads as holding something rather than as two planks.
  for (const sd of [-1, 1]) {
    parts.push(box(0.115, 0.20, 0.125, f.uniform, { x: sd * 0.225, y: -0.07, z: 0.01, rx: -16 * D }));
    parts.push(box(0.10, 0.055, 0.115, shade(f.uniform, -0.12), { x: sd * 0.22, y: -0.18, z: 0.05 }));
    parts.push(box(0.098, 0.19, 0.11, shade(f.uniform, -0.04), { x: sd * 0.215, y: -0.27, z: 0.14, rx: -42 * D }));
    parts.push(box(0.09, 0.085, 0.095, f.skin, { x: sd * 0.21, y: -0.35, z: 0.24 }));   // hand
    parts.push(box(0.115, 0.05, 0.12, shade(f.uniform, -0.16), { x: sd * 0.225, y: 0.02, z: 0.0 })); // cuff
  }
  const w = weaponFor(weaponKey);
  parts.push(place(w.clone(), null, { y: -0.30, z: 0.36 }));
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
 * Infantry are drawn a third over life size. At the distance an RTS camera
 * sits at, a man at true scale beside a six-metre tank is a speck you cannot
 * pick out, let alone command; almost every game in the genre does this. Only
 * the model is scaled — the simulation's hit boxes, stances and cover are all
 * still 1.72 m of soldier.
 */
export const SOLDIER_SCALE = 1.34;

/**
 * One soldier. `root` sits on the ground; `body` is everything above the hips
 * so a single rotation puts the whole man prone.
 */
export function buildSoldier(faction, role, weaponKey) {
  const g = bodyParts(faction, role, weaponKey);
  const root = new THREE.Group();
  root.scale.setScalar(SOLDIER_SCALE);
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

const CORPSE_CACHE = new Map();

/**
 * A body on the ground, for the aftermath. A corpse never moves again, so the
 * five posed parts are baked into one mesh, and one geometry serves every
 * fallen man of the same kind — a battlefield can hold hundreds of them.
 */
export function buildCorpse(faction, role, weaponKey) {
  const key = `${faction}|${role}|${weaponKey}`;
  let geom = CORPSE_CACHE.get(key);
  if (!geom) {
    const m = buildSoldier(faction, role, weaponKey);
    poseSoldier(m, { phase: 0, moving: false, stance: 2, aim: 0 });
    m.body.rotation.z = 0.4;
    m.root.updateMatrixWorld(true);
    const parts = [];
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      parts.push(g);
    });
    geom = merge(parts);
    CORPSE_CACHE.set(key, geom);
  }
  const mesh = new THREE.Mesh(geom, PAINTED);
  mesh.rotation.y = hashNoise(role.length * 3.3) * Math.PI * 2;
  mesh.castShadow = true;
  return mesh;
}
