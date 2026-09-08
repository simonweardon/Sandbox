// Vehicles, built from their own data.
//
// Nothing here is hand-modelled per tank. The builder reads the dimensions and
// the armour table in data/vehicles.js and lofts a hull through the profile
// those numbers describe, which is why a T-34 comes out with steeply sloped
// sides and a Tiger comes out slab-sided: that is what their armour arrays say.
// Running gear, turret shape, mantlet, skirts and stowage are all driven by the
// same record.

import * as THREE from '../../../vendor/three.module.js';
import { PAINT } from '../../data/factions.js';
import { box, cyl, sphere, cone, loft, merge, place, paint, shade, PAINTED, hashNoise } from './kit.js';

const D = Math.PI / 180;
const TRACK = 0x22242a;
const RUBBER = 0x1c1e22;
const STEEL = 0x53575c;

/**
 * A ring of points from y0 to y1, leaning in by `slope` degrees.
 *
 * Always six points, even when the chamfer collapses to nothing, because every
 * ring lofted into the same solid has to have the same number of points.
 */
function section(w, y0, y1, slope = 0, chamfer = 0) {
  const h = Math.max(0.02, y1 - y0);
  const top = y0 + h;
  const inset = Math.tan(slope * D) * h;
  const bw = w / 2, tw = Math.max(0.06, w / 2 - inset);
  const c = Math.max(0, Math.min(chamfer, tw * 0.7, h * 0.7));
  return [[-bw, y0], [bw, y0], [tw, top - c], [tw - c, top], [-tw + c, top], [-tw, top - c]];
}

// ---------------------------------------------------------------------------
// Hull
// ---------------------------------------------------------------------------

function buildHull(def, pal) {
  const m = def.model, h = m.hull;
  const L = h.len, W = h.wid, H = h.hgt, floor = h.clear;
  // The armour table decides the shape: a plate listed at 40 degrees is drawn
  // leaning at 40 degrees.
  const sideSlope = Math.min(38, def.armour.hullSide?.slope ?? 0);
  // The front plate runs from the hull roof down to the nose. How far forward
  // that is depends on how far the plate is laid back, which is exactly what
  // the armour table's slope figure says.
  const g = m.glacis || { len: H * 0.8, slope: 20 };
  const run = Math.min(L * 0.42, H * Math.tan(g.slope * D));
  const noseTop = H * (g.slope > 45 ? 0.16 : 0.34);
  const rearSlope = def.armour.hullRear?.slope ?? 10;
  const rearRun = Math.min(L * 0.2, H * Math.tan(rearSlope * D));

  const chamfer = m.castHull ? H * 0.3 : H * 0.12;
  const sections = [
    { z: -L / 2, pts: section(W * 0.94, H * 0.2, H * 0.86, sideSlope, chamfer) },
    { z: -L / 2 + rearRun, pts: section(W, 0, H, sideSlope, chamfer) },
    { z: -L * 0.15, pts: section(W, 0, H, sideSlope, chamfer) },
    { z: L / 2 - run, pts: section(W, 0, H, sideSlope, chamfer) },
    { z: L / 2, pts: section(W * 0.97, H * 0.2, noseTop, sideSlope * 0.6, chamfer * 0.6) },
  ];
  const parts = [place(loft(sections, pal.base), null, { y: floor })];

  // Engine deck: a raised plate at the back with grilles.
  const deckZ = -L * 0.3;
  parts.push(box(W * 0.72, 0.07, L * 0.3, shade(pal.base, -0.08), { y: floor + H + 0.03, z: deckZ }));
  for (let i = -1; i <= 1; i++) {
    parts.push(box(W * 0.2, 0.05, L * 0.1, pal.detail, { x: i * W * 0.24, y: floor + H + 0.08, z: deckZ }));
  }
  // Driver's plate, hatch and vision block.
  const dz = L / 2 - run * 0.45;
  parts.push(box(W * 0.26, 0.1, 0.5, shade(pal.base, -0.1), {
    x: -W * 0.22, y: floor + H * 0.72, z: dz, rx: -(90 - g.slope) * D,
  }));
  if (def.crew.includes('hullgunner')) {
    parts.push(cyl(0.09, 0.09, 0.3, 8, pal.detail, { x: W * 0.24, y: floor + H * 0.62, z: L / 2 - run * 0.3, rx: 90 * D }));
    parts.push(sphere(0.16, 8, shade(pal.base, -0.12), { x: W * 0.24, y: floor + H * 0.62, z: L / 2 - run * 0.36 }));
  }
  // Exhausts at the back.
  for (const s of [-1, 1]) {
    parts.push(cyl(0.09, 0.09, 0.5, 7, 0x2e2a26, {
      x: s * W * 0.42, y: floor + H * 0.55, z: -L / 2 + 0.1, rz: 90 * D, ry: 90 * D,
    }));
  }
  return parts;
}

/** Fenders, skirts, stowage, tools and drums: what makes a silhouette read. */
function buildFurniture(def, pal, seed) {
  const m = def.model, h = m.hull;
  const L = h.len, W = h.wid, H = h.hgt, floor = h.clear;
  const parts = [];
  const tw = m.tracks?.wid ?? 0.4;
  const th = m.tracks?.hgt ?? 0.8;

  if (m.fenders) {
    for (const s of [-1, 1]) {
      // The guard sits on top of the track run and turns down at its edge.
      parts.push(box(tw + 0.08, 0.05, L * 0.96, shade(pal.base, -0.05), {
        x: s * (W / 2 + tw / 2), y: floor + th * 0.06 + th, z: 0,
      }));
      parts.push(box(0.05, 0.16, L * 0.96, shade(pal.base, -0.12), {
        x: s * (W / 2 + tw + 0.04), y: floor + th * 0.06 + th - 0.09, z: 0,
      }));
    }
  }
  if (m.schurzen) {
    // Skirt plates, hung with a gap: they set a shaped charge off early.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        parts.push(box(0.04, H * 0.55, L * 0.2, shade(pal.base, -0.14), {
          x: s * (W / 2 + tw + 0.06), y: floor + th + H * 0.2, z: (i - 1.5) * L * 0.21,
        }));
      }
    }
  }
  if (m.fuelDrums) {
    for (let i = 0; i < 2; i++) {
      // Lying fore and aft along the track guard, the way they were strapped on.
      parts.push(cyl(0.23, 0.23, 0.8, 10, shade(pal.base, 0.05), {
        x: (i ? 1 : -1) * (W / 2 + tw * 0.5), y: floor + th + 0.26, z: -L / 2 + 0.85, rx: 90 * D,
      }));
    }
  }
  const n = m.stowage || 0;
  for (let i = 0; i < n; i++) {
    const r = hashNoise(seed * 7 + i * 3.1);
    const s = i % 2 ? 1 : -1;
    parts.push(box(0.34 + r * 0.2, 0.2, 0.5 + r * 0.3, shade(pal.detail, 0.08), {
      x: s * (W / 2 - 0.2 - r * 0.15), y: floor + H + 0.12, z: -L * 0.1 - i * 0.4,
    }));
  }
  // Tow cable coiled on the deck.
  parts.push(cyl(0.03, 0.03, W * 0.7, 5, 0x2a2622, { y: floor + H + 0.08, z: -L * 0.42, rz: 90 * D }));
  return parts;
}

// ---------------------------------------------------------------------------
// Running gear
// ---------------------------------------------------------------------------

/** Where each road wheel sits along the hull, by suspension type. */
function wheelLayout(m) {
  const t = m.tracks;
  const L = m.hull.len;
  const span = L * 0.82;
  const out = [];
  const n = t.wheels;
  if (t.style === 'interleaved') {
    // Overlapping large wheels in two ranks — the Panther and Tiger look.
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      out.push({ z: (u - 0.5) * span, r: t.wheelR, rank: i % 2, big: true });
    }
  } else if (t.style === 'christie') {
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      out.push({ z: (u - 0.5) * span, r: t.wheelR, big: true, dished: true });
    }
  } else if (t.style === 'vvss' || t.style === 'hvss' || t.style === 'bogie') {
    // Paired wheels on bogies.
    const bogies = Math.max(2, Math.round(n / 2));
    for (let b = 0; b < bogies; b++) {
      const u = bogies === 1 ? 0.5 : b / (bogies - 1);
      const z = (u - 0.5) * span;
      out.push({ z: z - t.wheelR * 1.05, r: t.wheelR, bogie: b });
      out.push({ z: z + t.wheelR * 1.05, r: t.wheelR, bogie: b });
    }
  } else if (t.style === 'halftrack') {
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      out.push({ z: -L * 0.12 + (u - 0.5) * L * 0.42, r: t.wheelR });
    }
  } else {
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      out.push({ z: (u - 0.5) * span, r: t.wheelR });
    }
  }
  return out;
}

/**
 * One side's running gear. The track belt is a static shell; the road wheels
 * are separate meshes so they turn as the vehicle drives.
 */
function buildTrack(def, pal, side) {
  const m = def.model, h = m.hull, t = m.tracks;
  const L = h.len, W = h.wid;
  const x = side * (W / 2 + t.wid / 2);
  const halfL = L * 0.5;
  const top = t.hgt, bottom = 0.06;
  const belt = [];
  const shell = shade(TRACK, 0.04);

  // Bottom run, top run, and the sprocket and idler at each end.
  belt.push(box(t.wid, 0.12, L * 0.94, shell, { y: bottom, z: 0 }));
  belt.push(box(t.wid, 0.12, L * 0.9, shell, { y: top, z: -L * 0.02 }));
  const endR = t.hgt * 0.42;
  belt.push(cyl(endR, endR, t.wid, 12, shell, { x: 0, y: top - endR + 0.06, z: halfL - endR * 0.7, rz: 90 * D }));
  belt.push(cyl(endR, endR, t.wid, 12, shell, { x: 0, y: top - endR + 0.06, z: -halfL + endR * 0.7, rz: 90 * D }));
  // Track links, as a row of shallow ribs.
  const links = Math.round(L * 3.2);
  for (let i = 0; i < links; i++) {
    const z = -L * 0.47 + (i / (links - 1)) * L * 0.94;
    belt.push(box(t.wid * 1.02, 0.05, 0.1, shade(TRACK, -0.25), { y: bottom - 0.04, z }));
  }
  if (t.rollers) {
    for (let i = 0; i < t.rollers; i++) {
      const z = (i / Math.max(1, t.rollers - 1) - 0.5) * L * 0.6;
      belt.push(cyl(0.1, 0.1, t.wid * 0.6, 8, STEEL, { y: top - 0.02, z, rz: 90 * D }));
    }
  }
  const beltGeom = merge(belt);
  beltGeom.translate(x, 0, 0);

  // Drive sprocket and idler get teeth so the ends do not read as plain discs.
  const hubs = [];
  for (const z of [halfL - endR * 0.7, -halfL + endR * 0.7]) {
    hubs.push(cyl(endR * 0.8, endR * 0.8, t.wid * 0.85, 10, STEEL, { x, y: top - endR + 0.06, z, rz: 90 * D }));
  }
  return { belt: beltGeom, hubs: merge(hubs), x, top, endR };
}

function wheelGeometry(t, entry, side, wid) {
  const r = entry.r;
  const parts = [cyl(r, r, wid * 0.78, 12, RUBBER, { rz: 90 * D })];
  parts.push(cyl(r * 0.55, r * 0.55, wid * 0.86, 10, STEEL, { rz: 90 * D }));
  if (entry.dished) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(cyl(r * 0.16, r * 0.16, wid * 0.9, 6, shade(STEEL, -0.15), {
        x: 0, y: Math.sin(a) * r * 0.62, z: Math.cos(a) * r * 0.62, rz: 90 * D,
      }));
    }
  } else {
    parts.push(box(r * 0.24, r * 1.5, wid * 0.88, shade(STEEL, -0.1), { rz: 45 * D }));
    parts.push(box(r * 0.24, r * 1.5, wid * 0.88, shade(STEEL, -0.1), { rz: -45 * D }));
  }
  return merge(parts);
}

// ---------------------------------------------------------------------------
// Turret, casemate and gun
// ---------------------------------------------------------------------------

function turretProfile(shape, w, hgt, slope) {
  switch (shape) {
    case 'round':
    case 'cast': {
      // A rounded casting: an octagonal ring pinched in at the top.
      const pts = [];
      const nSeg = 6;
      for (let i = 0; i < nSeg; i++) {
        const a = (i / nSeg) * Math.PI * 2 - Math.PI / 2;
        const t = (Math.sin(a) + 1) / 2;                 // 0 at bottom, 1 at top
        const rr = (w / 2) * (0.62 + 0.38 * Math.cos((t - 0.35) * 1.6));
        pts.push([Math.cos(a) * rr, hgt * t]);
      }
      return pts;
    }
    case 'hex':
      return [
        [-w / 2, 0], [w / 2, 0],
        [w / 2 - hgt * Math.tan(slope * D), hgt * 0.72], [w * 0.28, hgt],
        [-w * 0.28, hgt], [-w / 2 + hgt * Math.tan(slope * D), hgt * 0.72],
      ];
    case 'wedge':
      return [
        [-w / 2, 0], [w / 2, 0], [w * 0.42, hgt * 0.7],
        [w * 0.34, hgt], [-w * 0.34, hgt], [-w * 0.42, hgt * 0.7],
      ];
    default:
      return section(w, 0, hgt, slope, hgt * 0.16);
  }
}

function buildTurret(def, pal) {
  const m = def.model;
  const t = m.turret;
  const parts = [];
  const len = t.len, w = t.wid, hgt = t.hgt;
  const front = len / 2, rear = -len / 2;

  // Front narrower than the back for cast turrets; a bustle at the rear.
  const frontScale = t.shape === 'cast' || t.shape === 'round' ? 0.78 : 0.9;
  const scaleRing = (pts, s, dy = 0) => pts.map(([px, py]) => [px * s, py * (1 - dy)]);
  const base = turretProfile(t.shape, w, hgt, t.slope);
  const sections = [
    { z: rear, pts: scaleRing(base, 0.86, 0.06) },
    { z: rear + len * 0.22, pts: base },
    { z: front - len * 0.3, pts: base },
    { z: front, pts: scaleRing(base, frontScale, 0.1) },
  ];
  parts.push(loft(sections, pal.base));

  if (t.openTop) {
    // An open-topped turret: a low box with no roof, the M10's weakness.
    parts.length = 0;
    for (let i = 0; i < 4; i++) {
      const a = i * 90 * D;
      const wide = i % 2 === 0;
      parts.push(box(wide ? w : 0.06, hgt, wide ? 0.06 : len, pal.base, {
        y: hgt / 2, z: wide ? (i === 0 ? front : rear) : 0,
        x: wide ? 0 : (i === 1 ? w / 2 : -w / 2), rx: wide ? (i === 0 ? -12 * D : 12 * D) : 0,
      }));
    }
  } else {
    // Roof, hatches and a commander's cupola.
    parts.push(box(w * 0.78, 0.05, len * 0.72, shade(pal.base, -0.06), { y: hgt + 0.01 }));
    if (t.cupola) {
      parts.push(cyl(0.26, 0.28, 0.22, 10, shade(pal.base, -0.04), { x: -w * 0.16, y: hgt + 0.12, z: -len * 0.2 }));
      parts.push(cyl(0.27, 0.27, 0.04, 10, pal.detail, { x: -w * 0.16, y: hgt + 0.25, z: -len * 0.2 }));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push(box(0.07, 0.09, 0.03, 0x14181c, {
          x: -w * 0.16 + Math.sin(a) * 0.26, y: hgt + 0.14, z: -len * 0.2 + Math.cos(a) * 0.26, ry: a,
        }));
      }
    }
    parts.push(cyl(0.22, 0.22, 0.05, 10, shade(pal.base, -0.1), { x: w * 0.2, y: hgt + 0.04, z: -len * 0.16 }));
    // Stowage bin on the bustle.
    parts.push(box(w * 0.62, 0.26, 0.3, shade(pal.detail, 0.06), { y: hgt * 0.6, z: rear - 0.14 }));
  }
  return parts;
}

function buildCasemate(def, pal) {
  const m = def.model, c = m.casemate, h = m.hull;
  const parts = [];
  const slope = c.slope ?? 12;
  const sections = [
    { z: -c.len / 2, pts: section(c.wid, 0, c.hgt, 6, c.hgt * 0.14) },
    { z: c.len * 0.1, pts: section(c.wid, 0, c.hgt, 10, c.hgt * 0.14) },
    { z: c.len / 2, pts: section(c.wid * 0.92, 0, Math.max(c.hgt * 0.35, c.hgt - c.len * 0.5 * Math.tan(slope * D) * 0.6), 10, c.hgt * 0.1) },
  ];
  parts.push(loft(sections, pal.base));
  parts.push(box(c.wid * 0.78, 0.05, c.len * 0.7, shade(pal.base, -0.06), { y: c.hgt + 0.01, z: -c.len * 0.06 }));
  parts.push(cyl(0.24, 0.26, 0.2, 10, shade(pal.base, -0.04), { x: -c.wid * 0.22, y: c.hgt + 0.11, z: -c.len * 0.22 }));
  return parts;
}

function buildGun(def, pal) {
  const m = def.model, g = m.gun;
  if (!g) return { parts: [], pivotZ: 0 };
  const parts = [];
  const len = g.len, r = g.r;

  // Mantlet, in the style the vehicle actually used.
  if (g.mantlet === 'round') {
    parts.push(sphere(r * 6.4, 10, shade(pal.base, -0.03), { z: 0.06, sz: 0.68 }));
  } else if (g.mantlet === 'saukopf') {
    parts.push(sphere(r * 6.6, 10, shade(pal.base, -0.03), { z: 0.1, sz: 0.95, sy: 0.85 }));
    parts.push(cone(r * 4.6, 0.55, 10, shade(pal.base, -0.05), { z: 0.55, rx: 90 * D }));
  } else if (g.mantlet === 'shield') {
    parts.push(box(r * 15, r * 13, 0.05, shade(pal.base, -0.05), { z: 0.05 }));
  } else if (g.mantlet === 'ring') {
    parts.push(cyl(r * 8, r * 8, 0.1, 12, shade(pal.base, -0.05), { y: -r * 3 }));
  } else {
    parts.push(box(r * 11, r * 9.5, 0.32, shade(pal.base, -0.05), { z: 0.12 }));
  }

  // Barrel: a stepped tube, thicker at the breech end. Drawn a shade heavier
  // than life, because at true scale a tank gun reads as a wire from the air.
  const br = r * 1.75;
  parts.push(cyl(br * 1.3, br * 1.5, len * 0.3, 12, shade(pal.base, -0.12), { z: len * 0.15, rx: 90 * D }));
  parts.push(cyl(br, br * 1.25, len * 0.72, 12, shade(pal.base, -0.06), { z: len * 0.3 + len * 0.36, rx: 90 * D }));
  if (g.brake) {
    parts.push(cyl(br * 1.5, br * 1.5, 0.34, 12, shade(pal.base, -0.2), { z: len - 0.12, rx: 90 * D }));
    parts.push(box(br * 3.4, br * 1.3, 0.2, shade(pal.base, -0.24), { z: len - 0.18 }));
  } else {
    parts.push(cyl(br * 1.12, br * 1.12, 0.22, 12, shade(pal.base, -0.14), { z: len - 0.1, rx: 90 * D }));
  }
  return { parts, muzzleZ: len };
}

// ---------------------------------------------------------------------------
// Wheeled vehicles
// ---------------------------------------------------------------------------

function buildTruck(def, pal) {
  const m = def.model, h = m.hull;
  const L = h.len, W = h.wid, floor = h.clear;
  const parts = [];
  // Chassis rails and bonnet.
  parts.push(box(W * 0.8, 0.16, L * 0.9, shade(pal.detail, -0.1), { y: floor }));
  const cab = m.cab || { len: 1.6, hgt: 1.1 };
  const bonnetZ = L / 2 - cab.len * 0.5 - 0.5;
  parts.push(box(W * 0.72, 0.55, 1.5, pal.base, { y: floor + 0.42, z: L / 2 - 0.85 }));
  parts.push(box(W * 0.62, 0.14, 0.2, shade(pal.detail, -0.2), { y: floor + 0.42, z: L / 2 - 0.1 }));
  // Cab with a windscreen.
  parts.push(box(W * 0.82, cab.hgt, cab.len, pal.base, { y: floor + 0.28 + cab.hgt / 2, z: bonnetZ - 0.35 }));
  parts.push(box(W * 0.66, cab.hgt * 0.5, 0.05, 0x2a3238, { y: floor + 0.42 + cab.hgt * 0.7, z: bonnetZ + cab.len * 0.5 - 0.32 }));
  // Cargo bed, with a tilt over hoops if it has one.
  const cargo = m.cargo || { len: L * 0.5, hgt: 1.1 };
  const cz = -L / 2 + cargo.len / 2 + 0.2;
  parts.push(box(W * 0.9, 0.1, cargo.len, shade(pal.base, -0.08), { y: floor + 0.36, z: cz }));
  for (const s of [-1, 1]) {
    parts.push(box(0.06, 0.5, cargo.len, shade(pal.base, -0.04), { x: s * W * 0.44, y: floor + 0.6, z: cz }));
  }
  parts.push(box(W * 0.9, 0.5, 0.06, shade(pal.base, -0.04), { y: floor + 0.6, z: cz - cargo.len / 2 }));
  if (cargo.tilt) {
    for (let i = 0; i < 4; i++) {
      const z = cz - cargo.len / 2 + (i / 3) * cargo.len;
      parts.push(cyl(0.03, 0.03, W * 0.86, 6, 0x3a3630, { y: floor + 0.36 + cargo.hgt * 0.62, z, rz: 90 * D }));
    }
    parts.push(box(W * 0.92, cargo.hgt * 0.62, cargo.len, shade(0x7a7259, -0.05), {
      y: floor + 0.36 + cargo.hgt * 0.34, z: cz,
    }));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const CACHE = new Map();

/** Build (and cache) the meshes for one vehicle type. */
export function vehicleTemplate(def) {
  if (CACHE.has(def.name)) return CACHE.get(def.name);
  const m = def.model;
  const pal = PAINT[m.paint] || PAINT.dunkelgelb;
  const seed = def.name.length * 13.7;

  const hullParts = m.wheeled ? buildTruck(def, pal) : buildHull(def, pal);
  hullParts.push(...buildFurniture(def, pal, seed));

  const tpl = {
    hullGeom: null, turretGeom: null, gunGeom: null,
    wheels: [], wheelGeom: null, trackGeom: null,
    turretY: 0, turretZ: 0, gunPivotY: 0, gunPivotZ: 0, muzzleZ: 0,
    def,
  };

  if (m.wheeled) {
    const wr = m.wheels?.r ?? 0.5, ww = m.wheels?.wid ?? 0.22;
    tpl.wheelGeom = merge([
      cyl(wr, wr, ww, 12, RUBBER, { rz: 90 * D }),
      cyl(wr * 0.5, wr * 0.5, ww * 1.05, 8, STEEL, { rz: 90 * D }),
    ]);
    const L = m.hull.len, W = m.hull.wid;
    for (const s of [-1, 1]) {
      tpl.wheels.push({ x: s * (W * 0.46), y: wr, z: L * 0.32, steer: true });
      tpl.wheels.push({ x: s * (W * 0.46), y: wr, z: -L * 0.26 });
      tpl.wheels.push({ x: s * (W * 0.46), y: wr, z: -L * 0.26 - wr * 2.1 });
    }
  } else {
    const layout = wheelLayout(m);
    const t = m.tracks;
    tpl.wheelGeom = wheelGeometry(t, layout[0], 1, t.wid);
    const trackParts = [];
    for (const side of [-1, 1]) {
      const tr = buildTrack(def, pal, side);
      trackParts.push(tr.belt, tr.hubs);
      for (const e of layout) {
        const rank = e.rank ? 0.06 : 0;
        tpl.wheels.push({
          x: side * (m.hull.wid / 2 + t.wid / 2) + side * rank,
          y: e.r + 0.04, z: e.z, r: e.r, side,
        });
      }
    }
    tpl.trackGeom = merge(trackParts);
    // Per-wheel radius varies with the layout, so scale a single geometry.
    tpl.wheelBaseR = layout[0].r;
  }

  tpl.hullGeom = merge(hullParts);

  const floor = m.hull.clear, H = m.hull.hgt;
  if (m.turret) {
    tpl.turretGeom = merge(buildTurret(def, pal));
    tpl.turretY = floor + H;
    tpl.turretZ = m.turret.z || 0;
    tpl.gunPivotY = m.turret.hgt * 0.45;
    tpl.gunPivotZ = m.turret.len * 0.42;
  } else if (m.casemate) {
    tpl.casemateGeom = merge(buildCasemate(def, pal));
    tpl.turretY = floor + H;
    tpl.turretZ = m.casemate.z || 0;
    tpl.gunPivotY = m.casemate.hgt * 0.45;
    tpl.gunPivotZ = m.casemate.len * 0.4;
  } else if (m.openTop) {
    // Half-track fighting compartment: an open box with a gun shield.
    const parts = [];
    const L = m.hull.len, W = m.hull.wid;
    for (const s of [-1, 1]) {
      parts.push(box(0.06, 0.55, L * 0.5, pal.base, { x: s * W * 0.48, y: floor + H + 0.28, z: -L * 0.16 }));
    }
    parts.push(box(W * 0.96, 0.55, 0.06, pal.base, { y: floor + H + 0.28, z: -L * 0.41 }));
    parts.push(box(W * 0.9, 0.06, L * 0.5, shade(pal.base, -0.1), { y: floor + H, z: -L * 0.16 }));
    for (let i = 0; i < 4; i++) {
      parts.push(box(W * 0.86, 0.08, 0.3, shade(pal.detail, 0.05), { y: floor + H + 0.06, z: -L * 0.36 + i * 0.42 }));
    }
    tpl.superGeom = merge(parts);
    tpl.turretY = floor + H + 0.4;
    tpl.turretZ = L * 0.18;
    tpl.gunPivotY = 0.25;
    tpl.gunPivotZ = 0;
  }

  const gun = buildGun(def, pal);
  if (gun.parts.length) {
    tpl.gunGeom = merge(gun.parts);
    tpl.muzzleZ = gun.muzzleZ;
  }
  CACHE.set(def.name, tpl);
  return tpl;
}

/** An instance of a vehicle: a group with a traversing turret and a gun. */
export function buildVehicle(def) {
  const tpl = vehicleTemplate(def);
  const root = new THREE.Group();
  const m = def.model;

  const hull = new THREE.Mesh(tpl.hullGeom, PAINTED);
  hull.castShadow = true;
  root.add(hull);

  if (tpl.trackGeom) {
    const tracks = new THREE.Mesh(tpl.trackGeom, PAINTED);
    tracks.castShadow = true;
    root.add(tracks);
  }
  if (tpl.superGeom) root.add(new THREE.Mesh(tpl.superGeom, PAINTED));

  const wheels = [];
  for (const w of tpl.wheels) {
    const mesh = new THREE.Mesh(tpl.wheelGeom, PAINTED);
    mesh.position.set(w.x, w.y, w.z);
    if (w.r && tpl.wheelBaseR) {
      const k = w.r / tpl.wheelBaseR;
      mesh.scale.set(1, k, k);
    }
    mesh.castShadow = true;
    root.add(mesh);
    wheels.push(mesh);
  }

  let turret = null, gun = null;
  if (tpl.turretGeom || tpl.casemateGeom || tpl.superGeom) {
    turret = new THREE.Group();
    turret.position.set(0, tpl.turretY, tpl.turretZ);
    if (tpl.turretGeom) {
      const tm = new THREE.Mesh(tpl.turretGeom, PAINTED);
      tm.position.z = -tpl.turretZ;
      tm.castShadow = true;
      turret.add(tm);
      // The turret loft is built about its own centre; shift it back on.
      tm.position.z = 0;
    } else if (tpl.casemateGeom) {
      const cm = new THREE.Mesh(tpl.casemateGeom, PAINTED);
      cm.castShadow = true;
      root.add(cm);
      cm.position.set(0, tpl.turretY, tpl.turretZ);
    }
    root.add(turret);
  }
  if (tpl.gunGeom) {
    gun = new THREE.Group();
    gun.position.set(0, tpl.gunPivotY, tpl.gunPivotZ);
    const gm = new THREE.Mesh(tpl.gunGeom, PAINTED);
    gm.castShadow = true;
    gun.add(gm);
    (turret || root).add(gun);
    if (!turret) gun.position.set(0, tpl.turretY + tpl.gunPivotY, tpl.turretZ + tpl.gunPivotZ);
  }

  return { root, hull, turret, gun, wheels, tpl, muzzleZ: tpl.muzzleZ };
}
