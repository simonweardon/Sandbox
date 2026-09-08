// What happens after something is hit.
//
// For infantry that is straightforward. For a vehicle it is not: a shell that
// gets through the armour carries on into the fighting compartment and wrecks
// whatever happens to be in its path. Losing the gunner is not the same as
// losing the engine, and neither is the same as a hit on the ammunition, which
// ends the tank and its crew in one go.

import { KIND } from './world.js';
import { STANCE, STANCE_EXPOSURE, disembark, vehicleManned } from './units.js';
import { WEAPONS, blastRadius, blastDamage, SHELL } from '../data/weapons.js';
import { RESULT } from './penetration.js';
import { roll } from '../core/rng.js';
import { clamp, DEG } from '../core/util.js';

// ---------------------------------------------------------------------------
// Infantry
// ---------------------------------------------------------------------------

export function damageSoldier(world, s, amount, cause = 'gunfire', attacker = null) {
  if (!s.alive || s.hp <= 0) return false;
  s.hp -= amount;
  s.suppression = clamp(s.suppression + amount / 90, 0, 1.6);
  if (s.hp <= 0) {
    killSoldier(world, s, cause, attacker);
    return true;
  }
  // A wounded man goes down and bleeds until a medic reaches him.
  if (s.hp < 42) {
    s.stance = STANCE.PRONE;
    s.bleeding = Math.max(s.bleeding, 0.7);
  }
  return false;
}

export function killSoldier(world, s, cause = 'gunfire', attacker = null) {
  if (!s.alive) return;
  s.hp = 0;
  s.state = 'dead';
  if (attacker) attacker.kills = (attacker.kills || 0) + 1;

  if (s.inVehicle) {
    const v = world.byId.get(s.inVehicle);
    if (v) {
      const seat = v.crew.find((c) => c.occupant === s.id);
      if (seat) { seat.occupant = null; seat.alive = false; }
      const comp = v.components[s.seat];
      if (comp) comp.dead = true;
      const pi = v.passengers.indexOf(s.id);
      if (pi >= 0) v.passengers.splice(pi, 1);
    }
  } else {
    // Leave a body where he fell. The kit on it can still be picked up.
    world.corpses.push({
      x: s.x, y: world.terrain.heightAt(s.x, s.z), z: s.z, yaw: s.yaw,
      faction: s.faction, role: s.role, t: world.time,
      inv: { ...s.inv }, looted: false,
    });
  }
  world.fx('blood', { x: s.x, y: s.y + 0.9, z: s.z });
  world.remove(s);

  // Squadmates who watch a man die think about running away.
  for (const m of world.near(s.x, s.z, 22, (e) => e.kind === KIND.SOLDIER && e.faction === s.faction)) {
    m.morale = clamp(m.morale - (m.squad === s.squad ? 0.1 : 0.04), 0, 1);
  }
}

/** A shot that goes close by but misses still makes people keep their heads down. */
export function suppressNear(world, x, z, radius, power, faction) {
  for (const e of world.near(x, z, radius, (u) => u.kind === KIND.SOLDIER && u.faction !== faction && !u.inVehicle)) {
    const d = Math.hypot(e.x - x, e.z - z);
    const f = 1 - d / radius;
    e.suppression = clamp(e.suppression + power * f * f, 0, 1.6);
    if (e.suppression > 0.55 && e.stance === STANCE.STAND) e.stance = STANCE.CROUCH;
    if (e.suppression > 0.95) e.stance = STANCE.PRONE;
  }
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

/** Wheeled vehicles lose wheels, not tracks — and a truck has no gun to lose. */
function partName(v, id) {
  const wheeled = !!v.def.model.wheeled;
  if (id === 'trackL') return wheeled ? 'front axle' : 'left track';
  if (id === 'trackR') return wheeled ? 'rear axle' : 'right track';
  return id;
}

const COMPONENT_EFFECT = {
  engine: (v, w) => { v.engineDead = true; v.smoking = Math.max(v.smoking, 8); w.logLine(`${v.def.short} — engine wrecked`, 'hit'); },
  transmission: (v, w) => { v.immobile = true; w.logLine(`${v.def.short} — transmission destroyed`, 'hit'); },
  gunBreech: (v, w) => {
    v.gunBroken = true;
    if (v.guns.length) w.logLine(`${v.def.short} — main gun disabled`, 'hit');
  },
  turretRing: (v, w) => {
    v.turretJammed = true;
    if (v.def.model.turret) w.logLine(`${v.def.short} — turret ring jammed`, 'hit');
  },
  optics: (v, w) => { v.opticsOut = true; },
  radio: () => {},
  fuel: (v, w) => { v.onFire = Math.max(v.onFire, 26); w.logLine(`${v.def.short} — fuel tank ruptured, burning`, 'kill'); },
  ammoRack: (v, w) => { detonate(w, v); },
  trackL: (v, w) => { v.immobile = true; w.logLine(`${v.def.short} — ${partName(v, 'trackL')} blown off`, 'hit'); },
  trackR: (v, w) => { v.immobile = true; w.logLine(`${v.def.short} — ${partName(v, 'trackR')} blown off`, 'hit'); },
};

export function hurtComponent(world, v, comp, dmg) {
  if (!comp || comp.broken) return;
  comp.hp -= dmg;
  if (comp.crew) {
    const seat = v.crew.find((c) => c.role === comp.id);
    const occupant = seat?.occupant ? world.byId.get(seat.occupant) : null;
    if (comp.hp <= 0 && !comp.dead) {
      comp.dead = true;
      if (occupant) killSoldier(world, occupant, 'penetration');
      else if (seat) seat.alive = false;
      world.logLine(`${v.def.short} — ${comp.id} killed`, 'hit');
    }
    return;
  }
  if (comp.hp <= 0) {
    comp.broken = true;
    // Ammunition and fuel do not always go up when they are hit. Most of the
    // time the rack is wrecked and the rounds are scattered; sometimes the
    // tank simply ceases to exist. How hard it was struck decides which.
    if (comp.volatile) {
      const energy = clamp(dmg / (comp.max * 1.5), 0.2, 2.0);
      if (roll() < comp.volatile * energy) {
        (COMPONENT_EFFECT[comp.id] || (() => {}))(v, world);
      } else if (comp.id === 'ammoRack') {
        // Stowed rounds are lost, and the loader has nothing to hand up.
        v.ammo.ap = Math.floor((v.ammo.ap || 0) * 0.25);
        v.ammo.he = Math.floor((v.ammo.he || 0) * 0.25);
        world.logLine(`${v.def.short} — ammunition stowage wrecked`, 'hit');
      } else if (comp.id === 'fuel') {
        v.smoking = Math.max(v.smoking, 14);
        v.engineDead = roll() < 0.5;
        world.logLine(`${v.def.short} — fuel tank holed`, 'hit');
      }
    } else {
      (COMPONENT_EFFECT[comp.id] || (() => {}))(v, world);
    }
  }
}

/** The ammunition goes up: nothing inside survives that. */
export function detonate(world, v) {
  if (v.destroyed) return;
  v.destroyed = true;
  v.onFire = 40;
  v.turretBlownOff = true;
  world.logLine(`${v.def.short} destroyed — ammunition detonation`, 'kill');
  world.fx('ammoBlast', { x: v.x, y: v.y + 1.6, z: v.z });
  for (const c of v.crew) {
    if (c.occupant) { const s = world.byId.get(c.occupant); if (s) killSoldier(world, s, 'detonation'); }
    c.alive = false;
  }
  for (const pid of [...v.passengers]) {
    const s = world.byId.get(pid); if (s) killSoldier(world, s, 'detonation');
  }
  // The blast is dangerous to anyone standing near it.
  explode(world, v.x, v.y + 1.2, v.z, 6.0, null, v.faction, v);
}

/**
 * Walk a penetrating shot through the inside of the hull and let it hit
 * whatever is in the way. `entry` and `dir` are in hull-local metres.
 */
export function applySpall(world, v, entry, dir, energy, weapon, attacker) {
  const comps = Object.values(v.components);
  const hits = [];
  for (const c of comps) {
    if (c.dead || c.broken) continue;
    if (c.id === 'trackL' || c.id === 'trackR') continue;
    // Distance from the component's centre to the shot's path.
    const vx = c.x - entry.x, vy = c.y - entry.y, vz = c.z - entry.z;
    const t = vx * dir.x + vy * dir.y + vz * dir.z;
    if (t < 0) continue;                              // behind the entry point
    const px = entry.x + dir.x * t, py = entry.y + dir.y * t, pz = entry.z + dir.z * t;
    const d = Math.hypot(c.x - px, c.y - py, c.z - pz);
    if (d > c.r + 0.15) continue;
    hits.push({ c, t, closeness: 1 - d / (c.r + 0.15) });
  }
  hits.sort((a, b) => a.t - b.t);

  // Spalling spreads out, so nearby things get caught even off the exact line.
  const spallRadius = 0.9 + energy * 0.7;
  for (const c of comps) {
    if (c.dead || c.broken || hits.some((h) => h.c === c)) continue;
    if (c.id === 'trackL' || c.id === 'trackR') continue;
    const d = Math.hypot(c.x - entry.x, c.y - entry.y, c.z - entry.z);
    // Crew are soft targets: fragments find them more readily than machinery.
    if (d < spallRadius && roll() < (c.crew ? 0.72 : 0.45) * energy) {
      hits.push({ c, t: d, closeness: 0.35, spall: true });
    }
  }

  let left = energy;
  let anything = false;
  for (const h of hits) {
    if (left <= 0.05) break;
    const dmg = (h.spall ? (h.c.crew ? 75 : 45) : 170) * left * h.closeness * (0.7 + roll() * 0.6)
      * (weapon ? clamp(weapon.caliber / 75, 0.4, 2.2) : 1);
    hurtComponent(world, v, h.c, dmg);
    anything = true;
    left *= h.spall ? 0.92 : 0.55;          // the shot is spent as it goes through
    if (v.destroyed) return true;
  }
  if (attacker && anything) attacker.kills = attacker.kills;
  return anything;
}

/**
 * Decide whether a knocked-about vehicle is finished, abandoned, or fighting on.
 *
 * Crews did not fight to the last man. A tank that has been penetrated once or
 * twice, is on fire, or has lost its gun is one its crew get out of, which is
 * why so many knocked-out tanks were recovered and repaired rather than
 * destroyed. `shock` is the running total of how bad it has got in there.
 */
export function evaluateVehicle(world, v) {
  if (v.destroyed) return;
  const liveCrew = v.crew.filter((c) => !v.components[c.role]?.dead);
  if (liveCrew.length === 0) {
    v.abandoned = true;
    v.state = 'wreck';
    if (!v.announcedKO) {
      v.announcedKO = true;
      world.logLine(`${v.def.short} knocked out — crew dead`, 'kill');
    }
    return;
  }
  // Crews bail out of a burning tank, and out of one that has lost too much.
  const dead = v.crew.length - liveCrew.length;
  const shock = (v.shock || 0) + dead * 1.3;
  const toothless = v.gunBroken || !v.ammo.ap && !v.ammo.he;
  const shouldBail = v.onFire > 0
    || dead >= Math.ceil(v.crew.length / 2)
    || (toothless && v.immobile)
    || shock >= (toothless || v.immobile ? 2.2 : 3.4);
  if (shouldBail && !v.bailing) {
    v.bailing = true;
    world.logLine(`${v.def.short} — crew bailing out`, 'warn');
    for (const c of v.crew) {
      if (!c.occupant) continue;
      const s = world.byId.get(c.occupant);
      if (!s) continue;
      disembark(world, s);
      s.suppression = 1.2;
      s.morale = 0.3;
    }
    for (const pid of [...v.passengers]) {
      const s = world.byId.get(pid);
      if (s) { disembark(world, s); s.suppression = 1.0; }
    }
    v.abandoned = true;
  }
}

// ---------------------------------------------------------------------------
// High explosive
// ---------------------------------------------------------------------------

export function explode(world, x, y, z, kgTnt, weapon, faction, source = null) {
  const r = blastRadius(kgTnt);
  world.fx('explosion', { x, y, z, size: r, kg: kgTnt });
  world.decals.push({ x, z, r: Math.min(r * 0.8, 5), t: world.time, kind: 'crater' });

  // Infantry: blast falls off fast, and lying down helps a great deal.
  for (const e of world.near(x, z, r * 1.4, (u) => u.kind === KIND.SOLDIER && !u.inVehicle)) {
    const d = Math.hypot(e.x - x, e.z - z, (e.y + 0.8) - y);
    let dmg = blastDamage(kgTnt, d);
    if (dmg <= 0) { e.suppression = clamp(e.suppression + 0.3, 0, 1.6); continue; }
    dmg *= STANCE_EXPOSURE[e.stance];
    const cover = world.coverAt(e.x, e.z, x, z);
    dmg *= 1 - cover * 0.55;
    e.suppression = clamp(e.suppression + 0.9, 0, 1.6);
    e.morale = clamp(e.morale - 0.12, 0, 1);
    damageSoldier(world, e, dmg, 'explosion', source);
  }

  // Vehicles: blast is mostly a nuisance, but it strips tracks and optics, and
  // a big enough shell can go through a thin roof.
  for (const v of world.near(x, z, r * 1.3, (u) => u.kind === KIND.VEHICLE && !u.destroyed)) {
    const d = Math.hypot(v.x - x, v.z - z);
    const f = clamp(1 - d / (r * 1.3), 0, 1);
    if (f <= 0) continue;
    const power = kgTnt * f * f;
    if (power > 0.25 && roll() < f * 0.7) {
      hurtComponent(world, v, v.components[roll() < 0.5 ? 'trackL' : 'trackR'], 60 * power);
    }
    if (power > 0.4 && roll() < f * 0.4) hurtComponent(world, v, v.components.optics, 40 * power);
    // Roof armour versus overhead blast.
    const roof = v.def.armour.hullTop?.t ?? 15;
    const hePen = weapon ? weapon.caliber * 0.13 + kgTnt * 4 : kgTnt * 5;
    if (d < r * 0.55 && hePen > roof) {
      applySpall(world, v, { x: 0, y: 0.4, z: 0 }, { x: 0, y: -1, z: 0 },
        clamp((hePen / roof - 1) * 0.6, 0.15, 1.2), weapon, source);
    }
    evaluateVehicle(world, v);
  }

  // Towed guns and their crews are very exposed to shellfire.
  for (const g of world.near(x, z, r * 1.2, (u) => u.kind === KIND.GUN && !u.destroyed)) {
    const d = Math.hypot(g.x - x, g.z - z);
    if (blastDamage(kgTnt, d) > 55 && roll() < 0.6) {
      g.destroyed = true;
      world.logLine(`${g.def.short} destroyed`, 'kill');
      world.fx('explosion', { x: g.x, y: g.y + 0.6, z: g.z, size: 3, kg: 0.3 });
    }
  }

  // Scenery: HE knocks down walls, fences and trees.
  for (const p of world.propsNearPoint(x, z, r * 1.1 + 8)) {
    if (!p.alive || !p.destructible) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > r * 1.1) continue;
    p.hp -= blastDamage(kgTnt, d) * 3.2;
    if (p.hp <= 0) breakProp(world, p);
  }
}

export function breakProp(world, p) {
  if (!p.alive) return;
  p.alive = false;
  p.blocksLos = false;
  p.blocksMove = p.type === 'house';       // rubble still gets in the way
  p.cover = p.type === 'house' ? 0.5 : 0.15;
  p.rubble = true;
  world.fx('propBreak', { x: p.x, y: p.y, z: p.z, type: p.type, radius: p.radius });
  if (p.type === 'house') {
    world.logLine('A building collapses', 'info');
    // Anyone inside goes with it.
    for (const e of world.near(p.x, p.z, p.radius, (u) => u.kind === KIND.SOLDIER)) {
      if (e.garrison === p.id) damageSoldier(world, e, 140, 'collapse');
    }
  }
}

/** Fire, bleeding and morale recovery — the slow things. */
export function stepAttrition(world, dt) {
  for (const e of world.entities) {
    if (e.kind === KIND.SOLDIER) {
      if (e.bleeding > 0) {
        e.hp -= e.bleeding * 3.0 * dt;
        if (e.hp <= 0) killSoldier(world, e, 'wounds');
      }
      e.suppression = Math.max(0, e.suppression - 0.22 * dt);
      if (e.suppression < 0.2) e.morale = Math.min(1, e.morale + 0.05 * dt);
    } else if (e.kind === KIND.VEHICLE) {
      if (e.onFire > 0) {
        e.onFire -= dt;
        // A burning tank cooks off sooner or later.
        if (roll() < 0.05 * dt * 4) { detonate(world, e); continue; }
        for (const c of e.crew) {
          if (!c.occupant) continue;
          const s = world.byId.get(c.occupant);
          if (s) damageSoldier(world, s, 26 * dt, 'fire');
        }
        if (e.onFire <= 0) { e.destroyed = true; e.smoking = 20; }
        evaluateVehicle(world, e);
      }
      if (e.smoking > 0) e.smoking -= dt;
    }
  }
}
