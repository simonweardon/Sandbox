// Towed guns and mortars.

import * as THREE from '../../../vendor/three.module.js';
import { PAINT } from '../../data/factions.js';
import { box, cyl, sphere, merge, place, shade, PAINTED } from './kit.js';

const D = Math.PI / 180;
const STEEL = 0x4a4e52;
const RUBBER = 0x1c1e22;

const CACHE = new Map();

function buildAtGun(def, pal) {
  const m = def.model;
  const carriage = [];
  const barrelParts = [];

  // Trails, spread out behind, with spades at the ends.
  for (const s of [-1, 1]) {
    carriage.push(box(0.12, 0.12, m.trailLen, shade(pal.base, -0.06), {
      x: s * 0.42, y: 0.26, z: -m.trailLen / 2 - 0.2, ry: s * 9 * D,
    }));
    carriage.push(box(0.2, 0.26, 0.14, shade(pal.detail, 0), {
      x: s * 0.7, y: 0.16, z: -m.trailLen - 0.1,
    }));
  }
  // Axle and wheels.
  carriage.push(cyl(0.06, 0.06, 1.5, 8, STEEL, { y: m.wheelR, rz: 90 * D }));
  for (const s of [-1, 1]) {
    carriage.push(cyl(m.wheelR, m.wheelR, 0.14, 12, RUBBER, { x: s * 0.78, y: m.wheelR, rz: 90 * D }));
    carriage.push(cyl(m.wheelR * 0.45, m.wheelR * 0.45, 0.16, 8, shade(pal.base, -0.1), { x: s * 0.78, y: m.wheelR, rz: 90 * D }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI;
      carriage.push(box(0.04, m.wheelR * 1.7, 0.1, shade(STEEL, -0.1), { x: s * 0.78, y: m.wheelR, rz: a }));
    }
  }
  // Shield, sloped back, with a sight aperture cut by a darker panel.
  const sw = m.shieldW, sh = m.shieldH;
  carriage.push(box(sw, sh, 0.03, shade(pal.base, 0.03), { y: m.wheelR + sh * 0.42, z: 0.3, rx: -14 * D }));
  carriage.push(box(sw * 0.96, sh * 0.3, 0.03, shade(pal.base, -0.06), {
    y: m.wheelR + sh * 0.42 - sh * 0.5, z: 0.36, rx: -26 * D,
  }));
  carriage.push(box(0.26, 0.16, 0.04, 0x14181c, { x: -sw * 0.22, y: m.wheelR + sh * 0.78, z: 0.31 }));

  // Cradle, recoil cylinders and barrel.
  const by = m.wheelR + sh * 0.5;
  barrelParts.push(box(0.28, 0.24, 0.7, shade(pal.base, -0.08), { z: 0.1 }));
  barrelParts.push(cyl(m.barrelR * 1.6, m.barrelR * 1.6, 0.8, 8, shade(pal.base, -0.12), { y: 0.1, z: 0.5, rx: 90 * D }));
  barrelParts.push(cyl(m.barrelR, m.barrelR * 1.4, m.barrelLen, 10, shade(pal.base, -0.05), { z: m.barrelLen / 2 + 0.3, rx: 90 * D }));
  barrelParts.push(cyl(m.barrelR * 1.8, m.barrelR * 1.8, 0.26, 10, shade(pal.base, -0.18), { z: m.barrelLen + 0.2, rx: 90 * D }));

  return { carriage: merge(carriage), barrel: merge(barrelParts), pivotY: by, muzzleZ: m.barrelLen + 0.3 };
}

function buildMortar(def, pal) {
  const m = def.model;
  const carriage = [];
  const barrelParts = [];
  // Baseplate and bipod.
  carriage.push(cyl(0.34, 0.36, 0.06, 8, shade(pal.base, -0.1), { y: 0.03 }));
  for (const s of [-1, 1]) {
    carriage.push(cyl(0.025, 0.025, 0.9, 6, shade(pal.base, -0.05), {
      x: s * 0.26, y: 0.45, z: 0.3, rz: s * -16 * D, rx: 22 * D,
    }));
  }
  carriage.push(cyl(0.02, 0.02, 0.5, 6, shade(pal.base, -0.12), { x: 0, y: 0.55, z: 0.24, rz: 90 * D }));
  barrelParts.push(cyl(m.barrelR, m.barrelR * 1.15, m.barrelLen, 10, shade(pal.base, -0.08), { z: m.barrelLen / 2 }));
  barrelParts.push(sphere(m.barrelR * 1.4, 8, shade(pal.base, -0.15), { z: -0.02 }));
  return { carriage: merge(carriage), barrel: merge(barrelParts), pivotY: 0.08, muzzleZ: m.barrelLen, mortar: true };
}

export function gunTemplate(def) {
  if (CACHE.has(def.name)) return CACHE.get(def.name);
  const pal = PAINT[def.model.paint] || PAINT.dunkelgelb;
  const tpl = def.cls === 'mortar' ? buildMortar(def, pal) : buildAtGun(def, pal);
  CACHE.set(def.name, tpl);
  return tpl;
}

/** A gun instance: the carriage turns with the trail, the barrel elevates. */
export function buildGunModel(def) {
  const tpl = gunTemplate(def);
  const root = new THREE.Group();
  const carriage = new THREE.Mesh(tpl.carriage, PAINTED);
  carriage.castShadow = true;
  root.add(carriage);

  const traverse = new THREE.Group();
  traverse.position.y = tpl.pivotY;
  root.add(traverse);

  const barrel = new THREE.Group();
  const bm = new THREE.Mesh(tpl.barrel, PAINTED);
  bm.castShadow = true;
  barrel.add(bm);
  traverse.add(barrel);
  if (tpl.mortar) barrel.rotation.x = -70 * D;

  return { root, carriage, turret: traverse, gun: barrel, muzzleZ: tpl.muzzleZ, mortar: !!tpl.mortar };
}
