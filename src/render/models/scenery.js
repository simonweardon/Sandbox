// Trees, buildings, walls and everything else that gets shot at or hidden behind.

import * as THREE from '../../../vendor/three.module.js';
import { box, cyl, sphere, cone, merge, place, shade, PAINTED, hashNoise } from './kit.js';

const D = Math.PI / 180;

const BARK = 0x4a3c2c;
const LEAF = [0x3d5a2e, 0x466a33, 0x36502a, 0x4f6b34];
const STONE = 0x6b6a63;
const PLASTER = 0xb9ac93;
const ROOF = 0x7a4436;
const TIMBER = 0x5c4530;

function tree(big, seed) {
  const r = hashNoise(seed);
  const h = (big ? 11 : 7) * (0.85 + r * 0.35);
  const parts = [];
  const trunkR = big ? 0.3 : 0.17;
  parts.push(cyl(trunkR * 0.7, trunkR, h * 0.55, 6, BARK, { y: h * 0.27 }));
  const leaf = LEAF[(seed * 7 | 0) % LEAF.length];
  // Layered canopy: three or four cones of falling radius.
  const layers = big ? 4 : 3;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const cr = (big ? 2.9 : 1.9) * (1 - t * 0.55) * (0.85 + r * 0.3);
    parts.push(cone(cr, h * 0.34, 7, shade(leaf, (i % 2 ? 0.06 : -0.05)), {
      y: h * (0.42 + t * 0.2) + h * 0.17,
      ry: r * 3 + i,
    }));
  }
  return merge(parts);
}

function stump(big) {
  const parts = [];
  const r = big ? 0.3 : 0.17;
  parts.push(cyl(r, r * 1.2, 1.1, 6, BARK, { y: 0.55 }));
  parts.push(cyl(r * 0.9, r * 0.9, 0.06, 6, shade(BARK, 0.2), { y: 1.1 }));
  return merge(parts);
}

function house(p) {
  const w = p.w ?? 8, d = p.d ?? 7, h = p.height ?? 5.2;
  const wallH = h * 0.62;
  const parts = [];
  const wallColour = shade(PLASTER, (hashNoise(p.id || 1) - 0.5) * 0.2);
  // Four walls with window and door openings picked out in dark panels.
  parts.push(box(w, wallH, d, wallColour, { y: wallH / 2 }));
  parts.push(box(w * 0.99, wallH * 0.14, d * 0.99, shade(wallColour, -0.18), { y: wallH * 0.07 }));
  const win = 0x2a2b2c;
  for (const [ax, az, len] of [[1, 0, w], [0, 1, d]]) {
    for (const s of [-1, 1]) {
      const n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n - 0.5;
        parts.push(box(ax ? 0.9 : 0.06, 1.0, ax ? 0.06 : 0.9, win, {
          x: ax ? u * len * 0.8 : s * (w / 2 + 0.01),
          y: wallH * 0.55,
          z: az ? u * len * 0.8 : s * (d / 2 + 0.01),
        }));
      }
    }
  }
  parts.push(box(1.0, 2.0, 0.08, shade(TIMBER, -0.1), { y: 1.0, z: d / 2 + 0.02 }));
  // Pitched roof, as two slabs with a ridge.
  const roofH = h - wallH;
  const pitch = Math.atan2(roofH, d / 2);
  const slope = Math.hypot(roofH, d / 2);
  for (const s of [-1, 1]) {
    parts.push(box(w * 1.08, 0.14, slope * 1.02, shade(ROOF, s > 0 ? 0.05 : -0.05), {
      y: wallH + roofH / 2, z: s * d / 4, rx: s * pitch,
    }));
  }
  parts.push(box(w * 1.09, 0.16, 0.16, shade(ROOF, -0.15), { y: wallH + roofH }));
  // Gable ends and a chimney.
  for (const s of [-1, 1]) {
    parts.push(box(0.1, roofH, d, wallColour, { x: s * w / 2, y: wallH + roofH / 2, sz: 0.5 }));
  }
  parts.push(box(0.7, roofH + 0.9, 0.7, shade(STONE, -0.05), { x: w * 0.28, y: wallH + roofH * 0.6, z: -d * 0.2 }));
  return merge(parts);
}

function ruin(p) {
  const w = p.w ?? 8, d = p.d ?? 7;
  const parts = [];
  const r = hashNoise(p.id || 3);
  for (let i = 0; i < 5; i++) {
    const n = hashNoise((p.id || 3) * 5 + i);
    parts.push(box(w * (0.2 + n * 0.4), 0.6 + n * 1.8, 0.4, shade(PLASTER, -0.12), {
      x: (n - 0.5) * w * 0.7, y: (0.6 + n * 1.8) / 2, z: (hashNoise(i * 3.3) - 0.5) * d * 0.7,
      ry: n * 3,
    }));
  }
  parts.push(cyl(Math.max(w, d) * 0.45, Math.max(w, d) * 0.5, 0.5, 8, shade(STONE, -0.1), { y: 0.2 }));
  return merge(parts);
}

function wall(p) {
  const len = p.len ?? 7, h = p.height ?? 1.25;
  const parts = [];
  const courses = Math.max(2, Math.round(h / 0.3));
  for (let c = 0; c < courses; c++) {
    const y = (c + 0.5) * (h / courses);
    const n = Math.max(2, Math.round(len / 0.9));
    for (let i = 0; i < n; i++) {
      const j = hashNoise(i * 3.1 + c * 7.7 + (p.id || 0));
      parts.push(box((len / n) * 0.95, (h / courses) * 0.9, 0.4 + j * 0.08,
        shade(STONE, (j - 0.5) * 0.28), {
        x: (i + 0.5) * (len / n) - len / 2 + (c % 2 ? len / n / 2 : 0) * 0.3,
        y, z: (j - 0.5) * 0.06,
      }));
    }
  }
  return merge(parts);
}

function fence(p) {
  const len = p.len ?? 10, h = p.height ?? 1.1;
  const parts = [];
  const posts = Math.max(2, Math.round(len / 2));
  for (let i = 0; i <= posts; i++) {
    parts.push(box(0.09, h, 0.09, TIMBER, { x: (i / posts - 0.5) * len, y: h / 2 }));
  }
  for (const y of [h * 0.35, h * 0.78]) {
    parts.push(box(len, 0.06, 0.05, shade(TIMBER, 0.08), { y }));
  }
  return merge(parts);
}

function hedge(p) {
  const len = p.len ?? 10, h = p.height ?? 1.7;
  const parts = [];
  const n = Math.max(3, Math.round(len / 1.4));
  for (let i = 0; i < n; i++) {
    const j = hashNoise(i * 5.5 + (p.id || 0));
    parts.push(box((len / n) * 1.1, h * (0.82 + j * 0.3), 1.1 + j * 0.4,
      shade(LEAF[(i + (p.id || 0)) % LEAF.length], (j - 0.5) * 0.2), {
      x: (i + 0.5) * (len / n) - len / 2, y: h * (0.82 + j * 0.3) / 2, ry: j,
    }));
  }
  return merge(parts);
}

function sandbags(p) {
  const len = p.len ?? 4, h = p.height ?? 0.95;
  const parts = [];
  const rows = Math.max(2, Math.round(h / 0.24));
  for (let r = 0; r < rows; r++) {
    const inset = r * 0.06;
    const n = Math.max(2, Math.round((len - inset * 2) / 0.46));
    for (let i = 0; i < n; i++) {
      const j = hashNoise(i * 2.7 + r * 9.1 + (p.id || 0));
      parts.push(box(0.44, 0.22, 0.3, shade(0x9a8f6d, (j - 0.5) * 0.22), {
        x: (i + 0.5) * ((len - inset * 2) / n) - (len - inset * 2) / 2 + (r % 2 ? 0.12 : 0),
        y: (r + 0.5) * (h / rows), z: (j - 0.5) * 0.05, ry: (j - 0.5) * 0.2,
      }));
    }
  }
  return merge(parts);
}

function rock(p) {
  const r = p.radius ?? 1;
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const j = hashNoise(i * 4.4 + (p.id || 0));
    parts.push(sphere(r * (0.6 + j * 0.5), 6, shade(STONE, (j - 0.5) * 0.3), {
      x: (j - 0.5) * r * 0.7, y: r * (0.3 + j * 0.3), z: (hashNoise(i * 8.1) - 0.5) * r * 0.7,
      sy: 0.7,
    }));
  }
  return merge(parts);
}

function crater(p) {
  const r = p.radius ?? 2.5;
  return merge([
    cyl(r * 0.55, r, 0.4, 12, 0x4a4136, { y: -0.18 }),
    cyl(r, r * 1.05, 0.14, 12, 0x5a5044, { y: -0.02 }),
  ]);
}

const BUILDERS = {
  tree: (p) => tree(false, p.id || 1),
  tree_big: (p) => tree(true, p.id || 2),
  house, wall, fence, hedge, sandbags, rock, crater,
};

const CACHE = new Map();

/** Scenery of the same type and size shares geometry. */
export function buildProp(p) {
  const bucket = p.type === 'house'
    ? `house:${Math.round(p.w)}:${Math.round(p.d)}:${Math.round(p.height)}`
    : `${p.type}:${Math.round((p.len ?? p.radius ?? 1) * 2)}:${(p.id || 0) % 6}`;
  if (!CACHE.has(bucket)) {
    const build = BUILDERS[p.type];
    CACHE.set(bucket, build ? build(p) : box(1, 1, 1, 0x888888, { y: 0.5 }));
  }
  const mesh = new THREE.Mesh(CACHE.get(bucket), PAINTED);
  mesh.castShadow = p.type !== 'crater';
  mesh.receiveShadow = true;
  return mesh;
}

/** What a prop turns into once it has been knocked down. */
export function buildWreckedProp(p) {
  const key = `wreck:${p.type}:${Math.round((p.len ?? p.radius ?? 1) * 2)}:${(p.id || 0) % 4}`;
  if (!CACHE.has(key)) {
    let g;
    if (p.type === 'house') g = ruin(p);
    else if (p.type === 'tree' || p.type === 'tree_big') g = stump(p.type === 'tree_big');
    else if (p.type === 'wall' || p.type === 'sandbags') {
      const len = p.len ?? 4;
      const bits = [];
      for (let i = 0; i < 8; i++) {
        const j = hashNoise(i * 6.2 + (p.id || 0));
        bits.push(box(0.5, 0.24, 0.4, shade(STONE, (j - 0.5) * 0.3), {
          x: (j - 0.5) * len, y: 0.12, z: (hashNoise(i * 2.2) - 0.5) * 1.4, ry: j * 3,
        }));
      }
      g = merge(bits);
    } else {
      g = box((p.len ?? 2) * 0.8, 0.16, 0.6, shade(TIMBER, -0.2), { y: 0.08, rz: 0.1 });
    }
    CACHE.set(key, g);
  }
  const mesh = new THREE.Mesh(CACHE.get(key), PAINTED);
  mesh.receiveShadow = true;
  return mesh;
}
