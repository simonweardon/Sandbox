// Armour penetration.
//
// A shell arriving at a tank is resolved in three steps, the same three the
// real thing goes through:
//
//   1. Which plate did it strike? The hull and turret are separate boxes, and
//      the turret turns, so a tank that has swung its turret to face you can
//      still be showing you the thin side of its hull.
//   2. How thick is that plate along the shell's path? A plate sloped at 55
//      degrees and struck from the side is far thicker than its nominal figure,
//      and that is before the shell's own angle of arrival is added in.
//   3. Does the shell get through, bounce, or shatter on the face? Big shells
//      striking thin plate "overmatch" it and ignore much of the slope; small
//      shells striking thick plate at an angle skate off it.

import { DEG, clamp } from '../core/util.js';
import { SHELL, penetrationAt } from '../data/weapons.js';
import { roll } from '../core/rng.js';

export const RESULT = {
  MISS: 'miss',
  RICOCHET: 'ricochet',
  BOUNCE: 'bounce',          // struck the plate and failed to get through
  PARTIAL: 'partial',        // stopped in the plate; crew shaken, no breach
  PENETRATION: 'penetration',
  OVERPENETRATION: 'overpen', // through and out, doing little on the way
};

/**
 * Collision proxy: the hull box, and the turret box that turns on top of it.
 * Dimensions in metres, hull-local, with +z forward and +y up.
 */
export function hitProxy(def) {
  const m = def.model, h = m.hull;
  const floor = h.clear;
  const hull = {
    min: { x: -h.wid / 2, y: floor, z: -h.len / 2 },
    max: { x: h.wid / 2, y: floor + h.hgt, z: h.len / 2 },
  };
  // Tracks widen the silhouette but are not part of the armoured box.
  if (m.tracks) {
    hull.trackHalfWidth = h.wid / 2 + m.tracks.wid * 0.5;
    hull.trackTop = m.tracks.hgt;
  }
  let turret = null;
  const t = m.turret || m.casemate;
  if (t) {
    const ty = floor + h.hgt;
    turret = {
      fixed: !m.turret,                    // a casemate cannot traverse
      pivot: { x: 0, y: ty, z: t.z || 0 },
      min: { x: -t.wid / 2, y: ty, z: -t.len / 2 + (t.z || 0) },
      max: { x: t.wid / 2, y: ty + t.hgt, z: t.len / 2 + (t.z || 0) },
      openTop: !!t.openTop,
    };
  }
  return { hull, turret, height: floor + h.hgt + (t ? t.hgt : 0) };
}

/** Slab test. Returns {t, face} for the entry point, or null. */
function rayBox(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = -Infinity, tmax = Infinity, face = null;
  const axes = [
    [ox, dx, min.x, max.x, 'x'],
    [oy, dy, min.y, max.y, 'y'],
    [oz, dz, min.z, max.z, 'z'],
  ];
  for (const [o, d, lo, hi, ax] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, sign = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
    if (t1 > tmin) { tmin = t1; face = { axis: ax, sign }; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(tmin, 0), tExit: tmax, face };
}

/**
 * Work out which armour facet a shot strikes.
 * `origin` and `dir` are in hull-local space (dir normalised); `turretYaw` is
 * the turret's rotation relative to the hull.
 */
export function pickFacet(def, proxy, origin, dir, turretYaw) {
  const A = def.armour;
  let best = null;

  const hullHit = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, proxy.hull.min, proxy.hull.max);
  if (hullHit) {
    const f = hullHit.face;
    let key = 'hullSide';
    if (f.axis === 'z') key = f.sign > 0 ? 'hullFront' : 'hullRear';
    else if (f.axis === 'y') key = f.sign > 0 ? 'hullTop' : 'hullTop';
    // The lower front plate is a separate, usually less well sloped, casting.
    if (key === 'hullFront') {
      const yHit = origin.y + dir.y * hullHit.t;
      const mid = (proxy.hull.min.y + proxy.hull.max.y) / 2;
      if (yHit < mid) key = 'hullLower';
    }
    best = { key, plate: A[key] || A.hullSide, t: hullHit.t, part: 'hull', face: f };
  }

  if (proxy.turret) {
    // Rotate the ray into turret space rather than rotating the box.
    const c = Math.cos(-turretYaw), s = Math.sin(-turretYaw);
    const px = origin.x - proxy.turret.pivot.x, pz = origin.z - proxy.turret.pivot.z;
    const ox = px * c - pz * s + proxy.turret.pivot.x;
    const oz = px * s + pz * c + proxy.turret.pivot.z;
    const ddx = dir.x * c - dir.z * s, ddz = dir.x * s + dir.z * c;
    const th = rayBox(ox, origin.y, oz, ddx, dir.y, ddz, proxy.turret.min, proxy.turret.max);
    if (th && (!best || th.t < best.t)) {
      const f = th.face;
      let key = 'turretSide';
      if (f.axis === 'z') key = f.sign > 0 ? 'turretFront' : 'turretRear';
      else if (f.axis === 'y') key = 'turretTop';
      // The gun mantlet covers the middle of the front plate and is thicker.
      let plate = A[key] || A.turretSide;
      if (key === 'turretFront') {
        const hx = ox + ddx * th.t, hy = origin.y + dir.y * th.t;
        const midY = (proxy.turret.min.y + proxy.turret.max.y) / 2;
        if (Math.abs(hx) < proxy.turret.max.x * 0.4 && Math.abs(hy - midY) < 0.35) {
          key = 'mantlet'; plate = A.mantlet || plate;
        }
      }
      if (key === 'turretTop' && proxy.turret.openTop) { key = 'openTop'; plate = { t: 0, slope: 0 }; }
      best = { key, plate, t: th.t, part: 'turret', face: f, turretLocal: true };
    }
  }
  return best;
}

/** The angle in degrees between the shot and the plate's own normal. */
export function impactAngle(facet, dir, turretYaw) {
  const f = facet.face;
  // The plate's outward normal, before slope.
  let n = { x: 0, y: 0, z: 0 };
  n[f.axis] = f.sign;
  // Slope tips a front or rear plate back about the X axis, a side plate about Z.
  const slope = (facet.plate?.slope || 0) * DEG;
  if (f.axis === 'z') { n.y = Math.sin(slope) * 1; n.z = f.sign * Math.cos(slope); }
  else if (f.axis === 'x') { n.y = Math.sin(slope); n.x = f.sign * Math.cos(slope); }
  if (facet.turretLocal) {
    const c = Math.cos(turretYaw), s = Math.sin(turretYaw);
    const nx = n.x * c - n.z * s, nz = n.x * s + n.z * c;
    n.x = nx; n.z = nz;
  }
  const len = Math.hypot(n.x, n.y, n.z) || 1;
  const dot = -(dir.x * n.x + dir.y * n.y + dir.z * n.z) / len;
  return Math.acos(clamp(dot, -1, 1)) / DEG;
}

/**
 * Resolve one shell against one plate.
 * Returns { result, pen, effective, angle, spallEnergy }.
 */
export function resolveArmour(weapon, shellType, rangeM, plate, angleFromNormalDeg, opts = {}) {
  const nominal = plate?.t ?? 0;
  // `angleFromNormalDeg` already folds the plate slope in — see impactAngle().
  const angle = clamp(angleFromNormalDeg, 0, 89.5);

  if (nominal <= 0) {
    return { result: RESULT.PENETRATION, pen: 999, effective: 0, angle, spallEnergy: 1 };
  }

  let pen;
  if (shellType === SHELL.HEAT) {
    pen = weapon.pen100;
    // Skirt plates set a shaped charge off early and cost it most of its jet.
    if (opts.spaced) pen *= 0.55;
  } else if (shellType === SHELL.HE) {
    pen = weapon.caliber * 0.13 + weapon.he * 4;   // blast, not a penetrator
  } else {
    pen = penetrationAt(weapon, rangeM);
  }

  // Overmatch: a shell much wider than the plate punches through the slope
  // rather than skidding along it. Expressed as a reduction of the effective
  // striking angle, which is how normalisation is usually modelled.
  const ratio = weapon.caliber / nominal;
  const normalisation = shellType === SHELL.AP || shellType === SHELL.BULLET
    ? clamp(0.34 * (ratio - 0.6), 0, 0.55)
    : 0;
  const effAngle = angle * (1 - normalisation);
  const effective = nominal / Math.max(0.08, Math.cos(effAngle * DEG));

  // Ricochet. Solid shot skates off above roughly 70 degrees, less readily
  // when it overmatches the plate; shaped charges hold on much longer.
  let ricochetAngle = shellType === SHELL.HEAT ? 82 : 70 + clamp((ratio - 1) * 8, -8, 12);
  if (shellType === SHELL.BULLET) ricochetAngle = 62;
  if (angle > ricochetAngle) {
    const over = (angle - ricochetAngle) / (90 - ricochetAngle);
    // A shell with penetration well in excess of the plate can still bite.
    const bite = clamp(pen / (effective * 1.6), 0, 1);
    if (roll() < over * (1 - bite * 0.8)) {
      return { result: RESULT.RICOCHET, pen, effective, angle, spallEnergy: 0 };
    }
  }

  const margin = pen / effective;
  if (margin >= 1.0) {
    // Energy left over after the plate is what wrecks the inside.
    const spallEnergy = clamp((margin - 1) * 1.3 + 0.25, 0.15, 2.2);
    const overpen = margin > 3.5 && shellType === SHELL.AP && weapon.he < 0.05;
    return {
      result: overpen ? RESULT.OVERPENETRATION : RESULT.PENETRATION,
      pen, effective, angle, spallEnergy: overpen ? spallEnergy * 0.4 : spallEnergy,
    };
  }
  if (margin >= 0.9) {
    // Just short: the plate holds but the crew inside feel every bit of it.
    return { result: RESULT.PARTIAL, pen, effective, angle, spallEnergy: 0 };
  }
  return { result: RESULT.BOUNCE, pen, effective, angle, spallEnergy: 0 };
}

/** Human-readable line for the combat log. */
export function describeImpact(res, facetKey) {
  const where = {
    hullFront: 'upper front plate', hullLower: 'lower front plate', hullSide: 'hull side',
    hullRear: 'hull rear', hullTop: 'hull roof', turretFront: 'turret front',
    mantlet: 'mantlet', turretSide: 'turret side', turretRear: 'turret rear',
    turretTop: 'turret roof', openTop: 'open fighting compartment',
  }[facetKey] || facetKey;
  const verb = {
    [RESULT.RICOCHET]: 'ricochets off the',
    [RESULT.BOUNCE]: 'fails to penetrate the',
    [RESULT.PARTIAL]: 'partially penetrates the',
    [RESULT.PENETRATION]: 'penetrates the',
    [RESULT.OVERPENETRATION]: 'passes clean through the',
  }[res.result] || 'strikes the';
  return `${verb} ${where} (${Math.round(res.pen)}mm vs ${Math.round(res.effective)}mm at ${Math.round(res.angle)}°)`;
}
