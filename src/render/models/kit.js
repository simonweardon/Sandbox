// The geometry toolkit every model in the game is built from.
//
// There are no art files here. Each vehicle, soldier, gun and building is
// assembled at load time out of boxes, cylinders and lofted hulls, painted
// into vertex colours, and merged down to a couple of meshes so that a hundred
// and fifty units on screen do not become a hundred and fifty thousand draw
// calls.

import * as THREE from '../../../vendor/three.module.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Bake a position/rotation/scale onto a geometry and give it a flat colour. */
export function place(geom, colour, t = {}) {
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
  _q.setFromEuler(_e);
  _v.set(t.x || 0, t.y || 0, t.z || 0);
  _s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
  _m.compose(_v, _q, _s);
  geom.applyMatrix4(_m);
  if (colour !== undefined && colour !== null) paint(geom, colour);
  return geom;
}

/** Write one colour into every vertex, so merged meshes can share a material. */
export function paint(geom, colour) {
  const c = new THREE.Color(colour);
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}

export function box(w, h, d, colour, t) {
  return place(new THREE.BoxGeometry(w, h, d), colour, t);
}

export function cyl(rTop, rBot, h, seg, colour, t) {
  return place(new THREE.CylinderGeometry(rTop, rBot, h, seg), colour, t);
}

export function sphere(r, seg, colour, t) {
  return place(new THREE.SphereGeometry(r, seg, Math.max(3, seg >> 1)), colour, t);
}

export function cone(r, h, seg, colour, t) {
  return place(new THREE.ConeGeometry(r, h, seg), colour, t);
}

/**
 * Loft a solid through a series of cross-sections.
 *
 * Each section is a ring of 2D points in the XY plane at some Z. All sections
 * must have the same number of points, listed the same way round. This is what
 * gives a T-34 its sloped sides and a Panther its glacis: the shape is defined
 * by the profile it actually has, not by a stack of boxes.
 */
export function loft(sections, colour) {
  const ringLen = sections[0].pts.length;
  const pos = [];
  const push = (a, b, c) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
  const at = (s, i) => [sections[s].pts[i][0], sections[s].pts[i][1], sections[s].z];

  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < ringLen; i++) {
      const j = (i + 1) % ringLen;
      const a = at(s, i), b = at(s, j), c = at(s + 1, j), d = at(s + 1, i);
      push(a, b, c); push(a, c, d);
    }
  }
  // Caps, as a fan from the first point of each end ring.
  for (let i = 1; i < ringLen - 1; i++) {
    const a = at(0, 0), b = at(0, i + 1), c = at(0, i);
    push(a, b, c);
  }
  const last = sections.length - 1;
  for (let i = 1; i < ringLen - 1; i++) {
    const a = at(last, 0), b = at(last, i), c = at(last, i + 1);
    push(a, b, c);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  if (colour !== undefined) paint(g, colour);
  return g;
}

/**
 * A boxy cross-section with optional side slope and chamfered top corners:
 * the shape almost every armoured hull and turret actually has.
 *   w      full width at the bottom
 *   h      height
 *   slope  degrees the sides lean in towards the top
 */
export function armouredSection(w, h, slope = 0, chamfer = 0) {
  const inset = Math.tan(slope * Math.PI / 180) * h;
  const bw = w / 2, tw = Math.max(0.05, w / 2 - inset);
  if (chamfer <= 0) {
    return [[-bw, 0], [bw, 0], [tw, h], [-tw, h]];
  }
  const c = Math.min(chamfer, tw * 0.8);
  return [[-bw, 0], [bw, 0], [tw, h - c], [tw - c, h], [-tw + c, h], [-tw, h - c]];
}

/** Merge geometries that all carry position, normal and color into one. */
export function merge(geoms) {
  const list = geoms.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color) paint(g, 0xffffff);
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
    nor.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
    col.set(g.attributes.color.array.subarray(0, n * 3), o * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** One material serves everything, because colour lives in the vertices. */
export const PAINTED = new THREE.MeshLambertMaterial({ vertexColors: true });
export const PAINTED_DOUBLE = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

/** Shade a colour up or down, for panel lines and worn edges. */
export function shade(colour, amount) {
  const c = new THREE.Color(colour);
  if (amount >= 0) c.lerp(new THREE.Color(0xffffff), amount);
  else c.lerp(new THREE.Color(0x000000), -amount);
  return c.getHex();
}

/** Deterministic jitter, so a given unit always looks the same. */
export function hashNoise(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
