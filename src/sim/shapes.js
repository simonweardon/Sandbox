// Prop footprints.
//
// Scenery used to be circles: fine for a tree or a boulder, hopeless for a
// forty-metre apartment block, whose bounding circle bulges out into the street
// on either side of it. Anything with `w` and `d` is treated as a rotated box
// instead, so buildings block exactly the ground they stand on and the street
// outside stays open.

import { clamp } from '../core/util.js';

/** Is this prop a box rather than a circle? */
export const isBoxed = (p) => p.w > 0 && p.d > 0;

/** World point into the prop's own frame, where the box is axis-aligned. */
function toLocal(p, x, z, out) {
  const dx = x - p.x, dz = z - p.z;
  const c = Math.cos(-(p.yaw || 0)), s = Math.sin(-(p.yaw || 0));
  out.x = dx * c - dz * s;
  out.z = dx * s + dz * c;
  return out;
}

const _l = { x: 0, z: 0 }, _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 };

/** Shortest distance from a point to the prop's footprint. 0 means inside. */
export function propDistance(p, x, z) {
  if (!isBoxed(p)) {
    return Math.max(0, Math.hypot(x - p.x, z - p.z) - p.radius);
  }
  toLocal(p, x, z, _l);
  const ex = p.w / 2, ez = p.d / 2;
  const ox = Math.max(Math.abs(_l.x) - ex, 0);
  const oz = Math.max(Math.abs(_l.z) - ez, 0);
  return Math.hypot(ox, oz);
}

export function pointInProp(p, x, z, pad = 0) {
  return propDistance(p, x, z) <= pad;
}

/** The broad radius used to bucket a prop into the spatial grid. */
export function propReach(p) {
  return isBoxed(p) ? Math.hypot(p.w, p.d) / 2 : p.radius;
}

/**
 * Where the segment a->b first meets the prop, as a fraction along it, or null.
 * `pad` widens the footprint, for tests that want a near miss to count.
 */
export function propSegmentT(p, ax, az, bx, bz, pad = 0) {
  if (!isBoxed(p)) {
    // Circle: solve |a + t(b-a) - c| = r.
    const dx = bx - ax, dz = bz - az;
    const fx = ax - p.x, fz = az - p.z;
    const r = p.radius + pad;
    const A = dx * dx + dz * dz;
    if (A < 1e-9) return Math.hypot(fx, fz) <= r ? 0 : null;
    const B = 2 * (fx * dx + fz * dz);
    const C = fx * fx + fz * fz - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A);
    if (t1 >= 0 && t1 <= 1) return t1;
    if (t2 >= 0 && t2 <= 1) return t2;
    return (t1 < 0 && t2 > 1) ? 0 : null;      // segment starts inside
  }

  // Box: slab test in the prop's own frame.
  toLocal(p, ax, az, _a);
  toLocal(p, bx, bz, _b);
  const ex = p.w / 2 + pad, ez = p.d / 2 + pad;
  const dx = _b.x - _a.x, dz = _b.z - _a.z;
  let tmin = 0, tmax = 1;
  for (const [o, dd, e] of [[_a.x, dx, ex], [_a.z, dz, ez]]) {
    if (Math.abs(dd) < 1e-9) {
      if (o < -e || o > e) return null;
      continue;
    }
    let t1 = (-e - o) / dd, t2 = (e - o) / dd;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/**
 * A point on the prop's edge nearest to (x,z), which is where a soldier stands
 * when he presses himself against a wall.
 */
export function nearestOnProp(p, x, z, out = { x: 0, z: 0 }) {
  if (!isBoxed(p)) {
    const d = Math.hypot(x - p.x, z - p.z) || 1;
    out.x = p.x + ((x - p.x) / d) * p.radius;
    out.z = p.z + ((z - p.z) / d) * p.radius;
    return out;
  }
  toLocal(p, x, z, _l);
  const ex = p.w / 2, ez = p.d / 2;
  const lx = clamp(_l.x, -ex, ex), lz = clamp(_l.z, -ez, ez);
  const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
  out.x = p.x + lx * c - lz * s;
  out.z = p.z + lx * s + lz * c;
  return out;
}
