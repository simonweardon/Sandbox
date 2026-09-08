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
  // A shallow bowl with a lip of thrown earth around it, sunk into the ground.
  const r = p.radius ?? 2.5;
  const parts = [
    cyl(r * 0.5, r * 0.86, 0.45, 12, 0x413a30, { y: -0.26 }),
    cyl(r * 0.92, r * 0.8, 0.16, 12, 0x554c3e, { y: -0.03 }),
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, j = hashNoise(i * 3.7 + (p.id || 0));
    parts.push(sphere(r * (0.16 + j * 0.14), 5, shade(0x4b4336, (j - 0.5) * 0.3), {
      x: Math.cos(a) * r * 0.92, y: 0.02, z: Math.sin(a) * r * 0.92, sy: 0.45,
    }));
  }
  return merge(parts);
}


// ---------------------------------------------------------------------------
// The city
// ---------------------------------------------------------------------------

const RENDER = [0xa8a08c, 0x9c8f7a, 0x8a6350, 0x7e6a58, 0xb0a892, 0x6f5a4c];  // stucco, brick, soot
const BRICK = [0x8a5f4a, 0x7d5744, 0x93684f];
const CONCRETE = 0x8c8880;
const WINDOW = 0x24282c;
const BROKEN = 0x15181a;

/**
 * An apartment block: the thing a city is actually made of. Rows of windows on
 * every face are what make it read as a building rather than a crate, so they
 * are worth the triangles — the geometry is shared between every block of the
 * same size, so there are only ever a handful of them.
 */
function apartment(p) {
  const w = p.w ?? 20, d = p.d ?? 13, h = p.height ?? 14;
  const floors = p.floors ?? Math.max(1, Math.round(h / 3.4));
  const pal = p.palette ?? 0;
  const wall = RENDER[pal % RENDER.length];
  const parts = [];

  parts.push(box(w, h, d, wall, { y: h / 2 }));
  // A plinth course, and a cornice under the roofline.
  parts.push(box(w + 0.3, 0.9, d + 0.3, shade(wall, -0.18), { y: 0.45 }));
  parts.push(box(w + 0.4, 0.5, d + 0.4, shade(wall, -0.1), { y: h - 0.3 }));
  const roof = [0x4f4c46, 0x5b514440 & 0xffffff, 0x585048, 0x6a5f52][(p.id || 0) % 4];
  parts.push(box(w + 0.6, 0.4, d + 0.6, roof, { y: h + 0.2 }));
  // Chimney stacks and a roof hatch break the flat top up.
  for (let i = 0; i < 2; i++) {
    const j = hashNoise((p.id || 0) * 2.3 + i * 5.7);
    if (j < 0.35) continue;
    parts.push(box(0.8, 1.3, 0.8, shade(BRICK[i % BRICK.length], -0.1), {
      x: (j - 0.5) * w * 0.7, y: h + 1.0, z: (hashNoise(i * 3.3) - 0.5) * d * 0.6,
    }));
  }

  // Windows, floor by floor, on all four faces.
  const floorH = (h - 1.4) / floors;
  for (let f = 0; f < floors; f++) {
    const y = 1.2 + f * floorH + floorH * 0.52;
    const wh = Math.min(1.5, floorH * 0.5);
    for (const [len, along] of [[w, 'x'], [d, 'z']]) {
      const n = Math.max(1, Math.floor(len / 3.4));
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n - 0.5) * (len - 1.6);
        // A scatter of them are blown out and dark.
        const blown = hashNoise(i * 7.7 + f * 3.3 + (p.id || 0) * 1.7) < 0.3;
        const col = blown ? BROKEN : WINDOW;
        for (const side of [-1, 1]) {
          parts.push(along === 'x'
            ? box(1.15, wh, 0.12, col, { x: u, y, z: side * (d / 2 + 0.02) })
            : box(0.12, wh, 1.15, col, { x: side * (w / 2 + 0.02), y, z: u }));
        }
      }
    }
  }

  // A door on the long face, and a stripe of soot above it.
  parts.push(box(1.4, 2.3, 0.14, shade(0x4a3a2c, -0.1), { y: 1.15, z: d / 2 + 0.03 }));
  if (hashNoise((p.id || 0) * 5.1) < 0.45) {
    parts.push(box(2.2, h * 0.45, 0.06, 0x3a3632, { x: w * 0.25, y: h * 0.7, z: d / 2 + 0.05 }));
  }
  return merge(parts);
}

/**
 * A gutted shell. Nothing is subtracted from anything — a ruin is drawn as the
 * fragments that are still standing: broken wall stubs of uneven height, the
 * floor slabs they used to carry, and the rubble that came off them.
 */
function ruin(p) {
  const w = p.w ?? 20, d = p.d ?? 13, h = p.height ?? 7;
  const pal = p.palette ?? 0;
  const wall = shade(RENDER[pal % RENDER.length], -0.14);
  const parts = [];
  const seed = (p.id || 1) * 3.7;

  // Four walls, each broken down to a different height, some missing.
  const faces = [
    { x: 0, z: -d / 2, len: w, along: 'x' },
    { x: 0, z: d / 2, len: w, along: 'x' },
    { x: -w / 2, z: 0, len: d, along: 'z' },
    { x: w / 2, z: 0, len: d, along: 'z' },
  ];
  faces.forEach((f, fi) => {
    const n = Math.max(2, Math.round(f.len / 4));
    for (let i = 0; i < n; i++) {
      const j = hashNoise(seed + fi * 11 + i * 2.9);
      if (j < 0.22) continue;                        // this stretch has gone
      const seg = f.len / n;
      const u = ((i + 0.5) / n - 0.5) * f.len;
      const hh = h * (0.35 + j * 0.85);
      parts.push(f.along === 'x'
        ? box(seg * 0.98, hh, 0.5, wall, { x: u, y: hh / 2, z: f.z })
        : box(0.5, hh, seg * 0.98, wall, { x: f.x, y: hh / 2, z: u }));
      // A window hole left in the standing part.
      if (hh > 2.4 && j > 0.5) {
        parts.push(f.along === 'x'
          ? box(1.1, 1.3, 0.6, BROKEN, { x: u, y: hh * 0.55, z: f.z })
          : box(0.6, 1.3, 1.1, BROKEN, { x: f.x, y: hh * 0.55, z: u }));
      }
    }
  });

  // Collapsed floor slabs, tipped where they fell.
  const slabs = 1 + (hashNoise(seed * 1.3) * 3 | 0);
  for (let i = 0; i < slabs; i++) {
    const j = hashNoise(seed + i * 4.4);
    parts.push(box(w * (0.3 + j * 0.4), 0.35, d * (0.4 + j * 0.4), shade(CONCRETE, -0.08), {
      x: (j - 0.5) * w * 0.4, y: 0.4 + j * h * 0.35, z: (hashNoise(i * 9.1) - 0.5) * d * 0.4,
      rz: (j - 0.5) * 0.5, rx: (hashNoise(i * 6.6) - 0.5) * 0.35,
    }));
  }
  // Spill of brick and plaster at the foot of it.
  for (let i = 0; i < 7; i++) {
    const j = hashNoise(seed + 40 + i * 3.1);
    parts.push(box(1.6 + j * 2, 0.5 + j * 0.6, 1.4 + j * 1.6,
      shade(BRICK[i % BRICK.length], (j - 0.5) * 0.3), {
      x: (hashNoise(i * 2.2) - 0.5) * w * 0.9, y: 0.3, z: (j - 0.5) * d * 0.9, ry: j * 3,
    }));
  }
  return merge(parts);
}

/** A factory hall: long, tall, with a sawtooth roof and industrial glazing. */
function factory(p) {
  const w = p.w ?? 50, d = p.d ?? 30, h = p.height ?? 13;
  const parts = [];
  const wall = shade(BRICK[0], 0.05);
  parts.push(box(w, h, d, wall, { y: h / 2 }));
  parts.push(box(w + 0.4, 1.0, d + 0.4, shade(wall, -0.2), { y: 0.5 }));

  // Tall steel-framed windows the whole length of both flanks.
  const bays = Math.max(3, Math.floor(w / 5));
  for (let i = 0; i < bays; i++) {
    const u = ((i + 0.5) / bays - 0.5) * (w - 2);
    const blown = hashNoise(i * 5.3 + (p.id || 0)) < 0.4;
    for (const side of [-1, 1]) {
      parts.push(box(3.0, h * 0.5, 0.14, blown ? BROKEN : WINDOW, { x: u, y: h * 0.55, z: side * (d / 2 + 0.02) }));
      parts.push(box(0.14, h * 0.5, 0.3, shade(wall, -0.25), { x: u - 1.5, y: h * 0.55, z: side * (d / 2 + 0.04) }));
    }
  }
  // Sawtooth roof: the north-light glazing every factory hall had.
  const teeth = Math.max(3, Math.round(d / 8));
  for (let i = 0; i < teeth; i++) {
    const z = ((i + 0.5) / teeth - 0.5) * d;
    parts.push(box(w * 0.98, 0.3, d / teeth * 0.75, shade(CONCRETE, -0.1), {
      y: h + 1.0, z, rx: -0.5,
    }));
    parts.push(box(w * 0.98, 1.7, 0.16, hashNoise(i * 3.7) < 0.5 ? BROKEN : WINDOW, {
      y: h + 1.5, z: z + d / teeth * 0.3,
    }));
  }
  // A big rolling door at one end.
  parts.push(box(5.5, 5.0, 0.2, shade(0x4a4640, -0.05), { y: 2.5, z: d / 2 + 0.05 }));
  return merge(parts);
}

function chimney(p) {
  const h = p.height ?? 26, r = p.radius ?? 1.9;
  const parts = [
    cyl(r * 0.55, r, h, 10, shade(BRICK[1], -0.05), { y: h / 2 }),
    cyl(r * 0.66, r * 0.62, 1.0, 10, shade(BRICK[1], -0.25), { y: h - 0.4 }),
    box(r * 2.6, 1.4, r * 2.6, shade(BRICK[1], -0.15), { y: 0.7 }),
  ];
  // Iron bands up the stack.
  for (let i = 1; i < 5; i++) {
    const y = (i / 5) * h;
    const rr = r * (1 - (y / h) * 0.45) + 0.05;
    parts.push(cyl(rr, rr, 0.22, 10, 0x3c352e, { y }));
  }
  return merge(parts);
}

function monument(p) {
  const h = p.height ?? 9;
  const parts = [
    box(5.2, 0.5, 5.2, shade(STONE, 0.05), { y: 0.25 }),
    box(4.0, 0.5, 4.0, shade(STONE, 0.02), { y: 0.7 }),
    box(2.4, h * 0.55, 2.4, shade(STONE, -0.05), { y: 0.95 + h * 0.275 }),
    // A figure on top, reduced to the silhouette it reads as at this distance.
    cyl(0.55, 0.7, h * 0.28, 8, shade(0x6a6455, -0.05), { y: h * 0.72 }),
    sphere(0.42, 8, shade(0x6a6455, 0.02), { y: h * 0.88 }),
  ];
  return merge(parts);
}

function rubble(p) {
  const r = p.radius ?? 3, h = p.height ?? 1.6;
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const j = hashNoise(i * 3.9 + (p.id || 0));
    const a = (i / 9) * Math.PI * 2;
    parts.push(box(1.2 + j * 1.8, 0.5 + j * h, 1.0 + j * 1.5,
      shade(BRICK[i % BRICK.length], (j - 0.5) * 0.35), {
      x: Math.cos(a) * r * j * 0.8, y: (0.5 + j * h) / 2, z: Math.sin(a) * r * j * 0.8,
      ry: j * 3.1, rz: (j - 0.5) * 0.3,
    }));
  }
  // Bent reinforcing bar sticking out of it.
  for (let i = 0; i < 3; i++) {
    const j = hashNoise(i * 8.3 + (p.id || 0) * 2);
    parts.push(cyl(0.05, 0.05, 1.4 + j, 4, 0x4a4038, {
      x: (j - 0.5) * r, y: h * 0.7, z: (hashNoise(i * 4.1) - 0.5) * r, rz: (j - 0.5) * 1.4,
    }));
  }
  return merge(parts);
}

function lamppost(p) {
  const h = p.height ?? 6;
  return merge([
    cyl(0.09, 0.13, h, 6, 0x3f4448, { y: h / 2 }),
    cyl(0.3, 0.34, 0.4, 6, 0x353a3e, { y: 0.2 }),
    box(0.9, 0.1, 0.1, 0x3f4448, { x: 0.4, y: h - 0.1 }),
    box(0.34, 0.3, 0.34, 0x2a2e30, { x: 0.8, y: h - 0.3 }),
  ]);
}

const BUILDERS = {
  tree: (p) => tree(false, p.id || 1),
  tree_big: (p) => tree(true, p.id || 2),
  house, wall, fence, hedge, sandbags, rock, crater,
  apartment, ruin, factory, chimney, monument, rubble, lamppost,
};

const CACHE = new Map();

/** Scenery of the same type and size shares geometry. */
export function buildProp(p) {
  // Buildings share geometry by their quantised size, so a city of three
  // hundred blocks costs a couple of dozen of them.
  const bucket = p.w
    ? `${p.type}:${Math.round(p.w)}:${Math.round(p.d)}:${Math.round(p.height)}:${p.palette ?? 0}:${(p.id || 0) % 3}`
    : `${p.type}:${Math.round((p.len ?? p.radius ?? 1) * 2)}:${Math.round(p.height ?? 1)}:${(p.id || 0) % 6}`;
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
  const key = p.w
    ? `wreck:${p.type}:${Math.round(p.w)}:${Math.round(p.d)}:${(p.id || 0) % 3}`
    : `wreck:${p.type}:${Math.round((p.len ?? p.radius ?? 1) * 2)}:${(p.id || 0) % 4}`;
  if (!CACHE.has(key)) {
    let g;
    // Anything with walls comes down as a ruin of its own footprint — a
    // flattened apartment block is not the same shape as a flattened fence.
    if (p.type === 'house' || p.type === 'apartment' || p.type === 'factory' || p.type === 'ruin') {
      g = ruin({ ...p, height: Math.max(2.5, (p.height ?? 6) * 0.42) });
    } else if (p.type === 'monument' || p.type === 'chimney') {
      // Toppled: a heap where it stood, and the shaft lying beside it.
      const r = p.radius ?? 2;
      const bits = [cyl(r, r * 1.3, 1.0, 8, shade(STONE, -0.12), { y: 0.5 })];
      bits.push(box(r * 1.4, r * 1.4, (p.height ?? 9) * 0.6, shade(STONE, -0.05), {
        x: r * 2.4, y: r * 0.7, z: 0, rz: 0.1, rx: Math.PI / 2,
      }));
      g = merge(bits);
    } else if (p.type === 'tree' || p.type === 'tree_big') g = stump(p.type === 'tree_big');
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
