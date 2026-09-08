// Projectiles.
//
// Nothing in this game is hitscan. Every round is a body with a position and a
// velocity that is integrated forward under gravity and drag, so leading a
// moving target is real, shells drop at range, and you can watch a tracer sail
// past a tank you have just missed.

import { KIND } from './world.js';
import { WEAPONS, SHELL, penetrationAt } from '../data/weapons.js';
import { hitProxy, pickFacet, impactAngle, resolveArmour, RESULT, describeImpact } from './penetration.js';
import { damageSoldier, applySpall, evaluateVehicle, explode, suppressNear, breakProp, hurtComponent } from './damage.js';
import { STANCE_EXPOSURE, STANCE_HEIGHT } from './units.js';
import { roll } from '../core/rng.js';
import { clamp, DEG, pointSegDist2 } from '../core/util.js';

const GRAVITY = 9.81;
/** Very rough drag: shells hold velocity far better than pistol rounds. */
const DRAG = { bullet: 0.00042, ap: 0.00007, heat: 0.0009, he: 0.00012 };

export function spawnProjectile(world, opts) {
  const w = WEAPONS[opts.weapon];
  const p = {
    id: world.nextId++,
    weapon: opts.weapon, w,
    shell: opts.shell || (w.shell === SHELL.BULLET ? 'bullet' : w.shell),
    x: opts.x, y: opts.y, z: opts.z,
    px: opts.x, py: opts.y, pz: opts.z,
    vx: opts.vx, vy: opts.vy, vz: opts.vz,
    faction: opts.faction, owner: opts.owner || null,
    life: opts.life ?? 12,
    tracer: !!opts.tracer,
    fuse: opts.fuse || 0,
    indirect: !!opts.indirect,
    travelled: 0,
  };
  world.projectiles.push(p);
  return p;
}

/**
 * Fire a weapon from `from` at `to`, applying the weapon's dispersion and the
 * shooter's own state. Returns the projectile, or null if it could not fire.
 */
export function fireWeapon(world, shooter, weaponKey, from, to, opts = {}) {
  const w = WEAPONS[weaponKey];
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const range = Math.hypot(dx, dz);
  const speed = w.velocity;

  // Lay the gun: the angle that actually puts the shell there, drag included.
  const shellKind = opts.shell || (w.shell === SHELL.BULLET ? 'bullet' : w.shell);
  let elev = Math.atan2(dy, Math.max(range, 0.01));
  const laid = solveElevationDrag(range, dy, speed, shellKind, opts.high || w.indirect);
  if (laid !== null) elev = laid;

  const bearing = Math.atan2(dx, dz);

  // Dispersion. A settled gunner shoots tighter than one who has just swung on
  // to the target or is being shot at himself.
  let spreadMrad = w.disp;
  spreadMrad *= 1 + (1 - clamp(opts.aim ?? 1, 0, 1)) * 2.2;
  spreadMrad *= 1 + (opts.suppression || 0) * 1.6;
  spreadMrad *= opts.moving ? 2.4 : 1;
  spreadMrad *= opts.scoped ? 0.45 : 1;
  const spread = (spreadMrad / 1000) * (opts.spreadScale ?? 1);

  const b = bearing + roll.gauss() * spread;
  const e = elev + roll.gauss() * spread;

  const ch = Math.cos(e);
  return spawnProjectile(world, {
    weapon: weaponKey,
    shell: opts.shell,
    x: from.x, y: from.y, z: from.z,
    vx: Math.sin(b) * ch * speed,
    vy: Math.sin(e) * speed,
    vz: Math.cos(b) * ch * speed,
    faction: shooter?.faction, owner: shooter,
    tracer: opts.tracer ?? (w.tracerEvery ? true : false),
    life: w.indirect ? 60 : clamp(w.range / speed * 2.2, 1.5, 20),
    fuse: w.fuse || 0,
    indirect: !!w.indirect || !!opts.high,
  });
}

/** Vacuum launch angle that lands a shell at (range, dy). Null if out of reach. */
export function solveElevation(range, dy, speed, high = false) {
  const g = GRAVITY, v2 = speed * speed;
  const disc = v2 * v2 - g * (g * range * range + 2 * dy * v2);
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const lo = Math.atan((v2 - root) / (g * range));
  const hi = Math.atan((v2 + root) / (g * range));
  return high ? hi : lo;
}

/**
 * Flight time and drop for a given launch angle, integrated with the same drag
 * the projectile will actually experience. Returns the height at `range`, or
 * null if the shell never gets that far.
 */
function flyTo(range, speed, elev, dragK) {
  const dt = 0.02;
  let x = 0, y = 0;
  let vx = Math.cos(elev) * speed, vy = Math.sin(elev) * speed;
  for (let i = 0; i < 3000; i++) {
    const v = Math.hypot(vx, vy);
    const decel = dragK * v * v;
    vx -= (vx / v) * decel * dt;
    vy -= (vy / v) * decel * dt;
    vy -= GRAVITY * dt;
    const px = x, py = y;
    x += vx * dt; y += vy * dt;
    if (x >= range) {
      const t = (range - px) / Math.max(1e-6, x - px);
      return { y: py + (y - py) * t, time: i * dt + t * dt };
    }
    if (y < -600) break;
  }
  return null;
}

/**
 * The elevation a gunner actually lays on: the one that puts the shell on the
 * target once drag has been accounted for. Solved by secant iteration against
 * the real trajectory, which is what a range table does for a real crew.
 */
export function solveElevationDrag(range, dy, speed, shell, high = false) {
  const dragK = DRAG[shell] ?? DRAG.ap;
  let e = solveElevation(range, dy, speed, high);
  if (e === null) return null;
  let prevE = e, prevErr = null;
  for (let i = 0; i < 8; i++) {
    const r = flyTo(range, speed, e, dragK);
    if (!r) { e += 0.02; continue; }
    const err = r.y - dy;
    if (Math.abs(err) < 0.06) return e;
    if (prevErr !== null && Math.abs(err - prevErr) > 1e-9) {
      const next = e - err * (e - prevE) / (err - prevErr);
      prevE = e; prevErr = err;
      e = clamp(next, -0.6, high ? 1.5 : 0.6);
    } else {
      prevE = e; prevErr = err;
      // First step: nudge by the angle that would close the gap in a vacuum.
      e += clamp(-err / Math.max(range, 1), -0.05, 0.05);
    }
  }
  return e;
}

/** Time of flight to `range`, used for leading a moving target. */
export function timeOfFlight(range, speed, elev, shell) {
  const r = flyTo(range, speed, elev, DRAG[shell] ?? DRAG.ap);
  return r ? r.time : range / speed;
}

/** Where a target will be by the time a shell gets there. */
export function leadTarget(from, target, speed) {
  const tx = target.x, tz = target.z;
  const vx = target.velX || 0, vz = target.velZ || 0;
  let t = Math.hypot(tx - from.x, tz - from.z) / speed;
  for (let i = 0; i < 3; i++) {
    const px = tx + vx * t, pz = tz + vz * t;
    t = Math.hypot(px - from.x, pz - from.z) / speed;
  }
  return { x: tx + vx * t, y: target.y, z: tz + vz * t, t };
}

// ---------------------------------------------------------------------------

export function stepProjectiles(world, dt) {
  const keep = [];
  for (const p of world.projectiles) {
    p.px = p.x; p.py = p.y; p.pz = p.z;
    const v = Math.hypot(p.vx, p.vy, p.vz);
    const k = DRAG[p.shell] ?? DRAG.ap;
    const decel = k * v * v;
    if (v > 1e-3) {
      p.vx -= (p.vx / v) * decel * dt;
      p.vy -= (p.vy / v) * decel * dt;
      p.vz -= (p.vz / v) * decel * dt;
    }
    p.vy -= GRAVITY * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.travelled += v * dt;
    p.life -= dt;

    if (p.fuse > 0) {
      p.fuse -= dt;
      if (p.fuse <= 0) { burst(world, p, p.x, p.y, p.z, null); continue; }
    }

    const hit = traceSegment(world, p);
    if (hit) { resolveHit(world, p, hit); continue; }

    // Ground.
    const gh = world.terrain.heightAt(p.x, p.z);
    if (p.y <= gh) {
      const t = clamp((p.py - world.terrain.heightAt(p.px, p.pz)) / Math.max(1e-6, (p.py - p.y) - (gh - world.terrain.heightAt(p.px, p.pz))), 0, 1);
      const hx = p.px + (p.x - p.px) * t, hz = p.pz + (p.z - p.pz) * t;
      burst(world, p, hx, world.terrain.heightAt(hx, hz), hz, null);
      continue;
    }
    if (p.life <= 0 || !world.terrain.inBounds(p.x, p.z) || p.y > 400) continue;
    keep.push(p);
  }
  world.projectiles = keep;
}

/** Find the first thing the round's path crosses this step. */
function traceSegment(world, p) {
  const ax = p.px, az = p.pz, bx = p.x, bz = p.z;
  const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
  const reach = Math.hypot(bx - ax, bz - az) / 2 + 4;
  let best = null, bestT = Infinity;

  const consider = (e, radius, yLow, yHigh) => {
    const d2 = pointSegDist2(e.x, e.z, ax, az, bx, bz);
    if (d2 > radius * radius) return;
    const segLen2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = clamp(((e.x - ax) * (bx - ax) + (e.z - az) * (bz - az)) / segLen2, 0, 1);
    const y = p.py + (p.y - p.py) * t;
    if (y < yLow || y > yHigh) return;
    if (t < bestT) { bestT = t; best = { e, t, x: ax + (bx - ax) * t, y, z: az + (bz - az) * t }; }
  };

  for (const e of world.near(midX, midZ, reach, null)) {
    if (e === p.owner) continue;
    if (e.kind === KIND.SOLDIER) {
      if (e.inVehicle || !e.alive) continue;
      if (e.faction === p.faction && roll() > 0.06) continue;   // rare friendly fire
      const gy = world.terrain.heightAt(e.x, e.z);
      consider(e, 0.42, gy, gy + STANCE_HEIGHT[e.stance]);
    } else if (e.kind === KIND.VEHICLE) {
      const m = e.def.model.hull;
      const r = Math.max(m.len, m.wid) * 0.52;
      const gy = world.terrain.heightAt(e.x, e.z);
      consider(e, r, gy, gy + e.proxy.height + 0.3);
    } else if (e.kind === KIND.GUN) {
      if (e.destroyed) continue;
      const gy = world.terrain.heightAt(e.x, e.z);
      consider(e, 1.5, gy, gy + 1.6);
    }
  }

  // Scenery: trees stop bullets, walls stop most things.
  for (const prop of world.props) {
    if (!prop.alive || !prop.blocksMove) continue;
    const d2 = pointSegDist2(prop.x, prop.z, ax, az, bx, bz);
    const r = prop.type === 'house' ? prop.radius : prop.radius * 0.6;
    if (d2 > r * r) continue;
    const segLen2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = clamp(((prop.x - ax) * (bx - ax) + (prop.z - az) * (bz - az)) / segLen2, 0, 1);
    const y = p.py + (p.y - p.py) * t;
    const base = world.terrain.heightAt(prop.x, prop.z);
    if (y < base || y > base + prop.height) continue;
    if (t < bestT) { bestT = t; best = { prop, t, x: ax + (bx - ax) * t, y, z: az + (bz - az) * t }; }
  }
  return best;
}

function resolveHit(world, p, hit) {
  if (hit.prop) return hitProp(world, p, hit);
  const e = hit.e;
  if (e.kind === KIND.SOLDIER) return hitSoldier(world, p, hit, e);
  if (e.kind === KIND.VEHICLE) return hitVehicle(world, p, hit, e);
  if (e.kind === KIND.GUN) return hitGun(world, p, hit, e);
}

function hitSoldier(world, p, hit, s) {
  const w = p.w;
  if (p.shell === 'he' || p.shell === 'heat' || w.he > 0.05) {
    burst(world, p, hit.x, hit.y, hit.z, s);
    return;
  }
  // Cover can stop a round short of the man behind it.
  const cover = world.coverAt(s.x, s.z, p.px, p.pz);
  if (cover > 0 && roll() < cover * 0.75) {
    world.fx('impact', { x: hit.x, y: hit.y, z: hit.z, kind: 'dirt' });
    return;
  }
  let dmg = w.damage * (0.8 + roll() * 0.5);
  if (roll() < 0.12) dmg *= 2.2;                 // a hit somewhere that matters
  damageSoldier(world, s, dmg, 'gunfire', p.owner);
  world.fx('impact', { x: hit.x, y: hit.y, z: hit.z, kind: 'blood' });
  suppressNear(world, hit.x, hit.z, 7, 0.22, p.faction);
}

function hitGun(world, p, hit, g) {
  if (p.w.he > 0.05 || p.shell === 'he') { burst(world, p, hit.x, hit.y, hit.z, g); return; }
  // The gun shield stops rifle fire but not much else.
  const shield = g.def.armour?.shield;
  if (shield && p.shell === 'bullet' && penetrationAt(p.w, p.travelled) < shield.t * 1.4) {
    world.fx('impact', { x: hit.x, y: hit.y, z: hit.z, kind: 'spark' });
    return;
  }
  g.crewHits = (g.crewHits || 0) + 1;
  world.fx('impact', { x: hit.x, y: hit.y, z: hit.z, kind: 'spark' });
  if (g.crewHits > 4 || p.shell !== 'bullet') {
    g.destroyed = true;
    world.logLine(`${g.def.short} knocked out`, 'kill');
    if (p.owner) p.owner.kills = (p.owner.kills || 0) + 1;
  }
}

function hitVehicle(world, p, hit, v) {
  const w = p.w;
  if (v.destroyed) { world.fx('impact', { x: hit.x, y: hit.y, z: hit.z, kind: 'spark' }); return; }

  // Into hull-local space: undo the vehicle's position and heading.
  const gy = world.terrain.heightAt(v.x, v.z);
  const c = Math.cos(-v.yaw), s = Math.sin(-v.yaw);
  const rx = hit.x - v.x, rz = hit.z - v.z;
  const lx = rx * c - rz * s, lz = rx * s + rz * c;
  const ly = hit.y - gy;

  const dx = p.x - p.px, dy = p.y - p.py, dz = p.z - p.pz;
  const dl = Math.hypot(dx, dy, dz) || 1;
  const ddx = (dx / dl) * c - (dz / dl) * s, ddz = (dx / dl) * s + (dz / dl) * c;
  const dir = { x: ddx, y: dy / dl, z: ddz };

  // Step back outside the hull so the ray starts on the armour, not in it.
  const origin = { x: lx - dir.x * 6, y: ly - dir.y * 6, z: lz - dir.z * 6 };
  const facet = pickFacet(v.def, v.proxy, origin, dir, v.turretYaw);

  if (!facet) {
    // Between the hull and the track guards — treat it as a running-gear hit.
    hurtComponent(world, v, v.components[lx > 0 ? 'trackR' : 'trackL'], 45);
    world.fx('impact', { x: hit.x, y: hit.y, z: hit.z, kind: 'spark' });
    return;
  }

  const angle = impactAngle(facet, dir, v.turretYaw);
  const spaced = !!v.def.model.schurzen && facet.key.startsWith('hullSide');
  const res = resolveArmour(w, p.shell === 'bullet' ? SHELL.BULLET : p.shell, p.travelled, facet.plate, angle, { spaced });

  const label = `${v.def.short}: ${describeImpact(res, facet.key)}`;

  if (res.result === RESULT.RICOCHET) {
    v.shock = (v.shock || 0) + 0.15;
    world.fx('ricochet', { x: hit.x, y: hit.y, z: hit.z, nx: dir.x, nz: dir.z });
    if (p.shell !== 'bullet') world.logLine(label, 'bounce');
    // The shell carries on somewhere else entirely.
    if (w.he > 0.05 && roll() < 0.4) burst(world, p, hit.x, hit.y + 0.5, hit.z, null);
    return;
  }
  if (res.result === RESULT.BOUNCE || res.result === RESULT.PARTIAL) {
    world.fx('ricochet', { x: hit.x, y: hit.y, z: hit.z, nx: dir.x, nz: dir.z });
    if (p.shell !== 'bullet') world.logLine(label, 'bounce');
    if (res.result === RESULT.PARTIAL) {
      v.shock = (v.shock || 0) + 0.4;
      // The crew are rattled even though the plate held.
      for (const cc of v.crew) {
        if (!cc.occupant) continue;
        const sold = world.byId.get(cc.occupant);
        if (sold) sold.suppression = clamp(sold.suppression + 0.5, 0, 1.6);
      }
    }
    if (w.he > 0.05) burst(world, p, hit.x, hit.y, hit.z, null);
    return;
  }

  // Through the armour.
  v.shock = (v.shock || 0) + (res.result === RESULT.OVERPENETRATION ? 0.6 : 1.0);
  world.fx('penetration', { x: hit.x, y: hit.y, z: hit.z });
  if (p.shell !== 'bullet') world.logLine(label, 'pen');
  const entry = { x: lx, y: ly, z: lz };
  applySpall(world, v, entry, dir, res.spallEnergy, w, p.owner);
  // HE and HEAT add their filler to whatever the penetrator did.
  if (w.he > 0.05) {
    applySpall(world, v, entry, dir, clamp(w.he * 0.9, 0.2, 1.6), w, p.owner);
  }
  evaluateVehicle(world, v);
  if (v.destroyed && p.owner) p.owner.kills = (p.owner.kills || 0) + 1;
}

function hitProp(world, p, hit) {
  const prop = hit.prop;
  const w = p.w;
  if (w.he > 0.05 || p.shell === 'he' || p.shell === 'heat') {
    burst(world, p, hit.x, hit.y, hit.z, null);
    return;
  }
  prop.hp -= w.damage * 0.5 + w.caliber * 0.8;
  world.fx('impact', { x: hit.x, y: hit.y, z: hit.z, kind: prop.type === 'house' ? 'dust' : 'splinter' });
  if (prop.hp <= 0) breakProp(world, prop);
  // A big shell keeps going through a fence or a hedge.
  if (w.caliber >= 37 && prop.type !== 'house' && prop.type !== 'wall') {
    p.px = hit.x; p.pz = hit.z;
    world.projectiles.push(p);
  }
}

/** Detonate a shell. Solid shot just throws up dirt. */
function burst(world, p, x, y, z, directTarget) {
  const w = p.w;
  if (w.he > 0.005) {
    explode(world, x, y + 0.2, z, w.he, w, p.faction, p.owner);
  } else {
    world.fx('impact', { x, y, z, kind: 'dirt' });
    suppressNear(world, x, z, 5, 0.12, p.faction);
  }
  if (directTarget && directTarget.kind === KIND.SOLDIER && directTarget.alive) {
    damageSoldier(world, directTarget, w.damage, 'direct', p.owner);
  }
}
