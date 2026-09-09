// Engagement: choosing a target, laying the gun on it, and pulling the trigger.
//
// The delays here are the point. A Tiger's turret takes fifteen seconds to come
// round; a Sherman's takes four. A gunner who has just traversed on to a target
// has not settled yet and will miss. A loader takes six seconds to get the next
// round in. Most of what happens in a tank fight is decided before anybody
// fires, and this is where that is modelled.

import { KIND } from './world.js';
import { WEAPONS, SHELL, penetrationAt } from '../data/weapons.js';
import { fireWeapon, leadTarget } from './ballistics.js';
import { canSee, visibleTo, targetHeight, eyeHeight, spotRange } from './vision.js';
import { STANCE, STANCE_HEIGHT, crewAlive, gunReady } from './units.js';
import { roll } from '../core/rng.js';
import { clamp, angleDelta, turnTowards, dist, DEG } from '../core/util.js';

// ---------------------------------------------------------------------------
// Target selection
// ---------------------------------------------------------------------------

/** How badly this unit wants to shoot at that one. Higher is more urgent. */
function threatScore(world, shooter, t, range) {
  let score = 100 / (40 + range);
  if (t.kind === KIND.VEHICLE) {
    if (t.destroyed) return -1;
    score *= t.abandoned ? 0.15 : 3.2;
    // Something that can kill you outranks something that cannot.
    const theirGun = t.guns?.[0] ? WEAPONS[t.guns[0].w] : null;
    if (theirGun && theirGun.cls === 'cannon') score *= 1.5;
  } else if (t.kind === KIND.GUN) {
    score *= t.destroyed ? 0 : 2.4;
  } else {
    if (t.role === 'at') score *= 2.6;            // the man with the Panzerfaust
    else if (t.role === 'officer' || t.role === 'lmg') score *= 1.5;
    if (t.stance === STANCE.PRONE) score *= 0.6;
    if (t.suppression > 0.9) score *= 0.5;        // he is already pinned
  }
  if (shooter.target === t) score *= 1.6;         // stay on the target you have
  return score;
}

/** Can this shooter actually do anything to that target? */
function canHarm(shooter, t, range) {
  if (t.kind !== KIND.VEHICLE) return true;
  if (t.destroyed || t.abandoned) return false;
  const weapons = shooterWeapons(shooter);
  for (const key of weapons) {
    const w = WEAPONS[key];
    if (!w) continue;
    if (w.shell === SHELL.HEAT) return true;
    const thinnest = Math.min(
      t.def.armour.hullSide?.t ?? 99, t.def.armour.hullRear?.t ?? 99,
      t.def.armour.turretSide?.t ?? 99, t.def.armour.hullTop?.t ?? 99);
    if (penetrationAt(w, range) > thinnest * 0.85) return true;
    if (w.he > 0.5) return true;                  // big HE still hurts a tank
  }
  return false;
}

function shooterWeapons(u) {
  if (u.kind === KIND.SOLDIER) {
    const out = [u.inv.primary];
    if (u.inv.launcher && u.inv.rockets > 0) out.push(u.inv.launcher);
    return out;
  }
  return (u.guns || []).map((g) => g.w);
}

export function acquireTarget(world, u, maxRange) {
  const range = maxRange ?? spotRange(world, u);
  let best = null, bestScore = -1;
  // Only consider what the side has already spotted, nearest first, and stop
  // once enough candidates have been weighed — a rifleman does not survey the
  // whole battlefield before deciding who to shoot at.
  const candidates = world.enemiesWithin(u.x, u.z, range, u.faction, 24);
  let checked = 0;
  for (const t of candidates) {
    if (t.kind === KIND.SOLDIER && (!t.alive || t.inVehicle)) continue;
    if (!visibleTo(world, t, u.faction)) continue;
    const d = Math.sqrt(t._d2);
    if (!canHarm(u, t, d)) continue;
    const s = threatScore(world, u, t, d);
    if (s <= bestScore) continue;
    if (!canSee(world, u, t)) continue;
    bestScore = s; best = t;
    if (++checked >= 6) break;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** World-space muzzle of a vehicle or towed gun's weapon. */
export function muzzlePoint(world, u, gun) {
  const gy = world.terrain.heightAt(u.x, u.z);
  if (u.kind === KIND.GUN) {
    const a = u.yaw + u.turretYaw;
    const len = u.def.model.barrelLen ?? 3;
    return { x: u.x + Math.sin(a) * len * 0.8, y: gy + 1.0, z: u.z + Math.cos(a) * len * 0.8 };
  }
  const m = u.def.model;
  const fight = m.turret || m.casemate;
  const barrel = m.gun?.len ?? 3;
  if (gun.mount === 'coax' || gun.mount === 'turret' || gun.mount === 'casemate' || gun.mount === 'pintle') {
    const a = u.yaw + (m.turret ? u.turretYaw : 0);
    const y = gy + m.hull.clear + m.hull.hgt + (fight ? fight.hgt * 0.5 : 0.5);
    const reach = gun.mount === 'coax' ? barrel * 0.35 : (gun.mount === 'pintle' ? 0.6 : barrel * 0.9);
    return { x: u.x + Math.sin(a) * reach, y: y + (gun.mount === 'pintle' ? 0.5 : 0), z: u.z + Math.cos(a) * reach };
  }
  // Hull machine gun, beside the driver.
  const c = Math.cos(u.yaw), s = Math.sin(u.yaw);
  const off = m.hull.wid * 0.3;
  return {
    x: u.x + s * m.hull.len * 0.45 + c * off,
    y: gy + m.hull.clear + m.hull.hgt * 0.55,
    z: u.z + c * m.hull.len * 0.45 - s * off,
  };
}

/** Which way the gun would have to point to hit that. Hull-relative. */
function bearingTo(u, t) { return Math.atan2(t.x - u.x, t.z - u.z); }

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

export function stepCombat(battle, dt) {
  const world = battle.world;
  for (const u of world.entities) {
    if (u.kind === KIND.SOLDIER) stepSoldierCombat(battle, u, dt);
    else if (u.kind === KIND.VEHICLE) stepVehicleCombat(battle, u, dt);
    else if (u.kind === KIND.GUN) stepGunCombat(battle, u, dt);
  }
}

// ---- infantry --------------------------------------------------------------

function stepSoldierCombat(battle, s, dt) {
  const world = battle.world;
  if (s.inVehicle || s.controlled || s.state === 'routing') return;
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.reloading = Math.max(0, s.reloading - dt);

  if (s.holdFire) { s.target = null; return; }

  // Re-check the target every so often rather than every tick.
  s.acquireTimer = (s.acquireTimer || 0) - dt;
  if (s.acquireTimer <= 0) {
    s.acquireTimer = 0.4 + roll() * 0.4;
    const t = acquireTarget(world, s, weaponReach(s));
    if (t !== s.target) { s.target = t; s.aimProgress = 0; }
  }
  const t = s.target;
  if (!t || !t.alive || (t.kind === KIND.VEHICLE && t.destroyed)) { s.target = null; return; }

  const range = dist(s.x, s.z, t.x, t.z);
  if (range > weaponReach(s) * 1.1 || !canSee(world, s, t)) { s.target = null; return; }

  // Face the target and settle the aim. A window only covers the arc it faces.
  if (s.garrison != null) {
    const off = angleDelta(s.windowYaw ?? s.yaw, bearingTo(s, t));
    if (Math.abs(off) > 75 * DEG) { s.target = null; return; }
    s.yaw = turnTowards(s.yaw, bearingTo(s, t), 2.2 * dt);
  } else {
    s.yaw = turnTowards(s.yaw, bearingTo(s, t), 3.2 * dt);
  }
  const primary = WEAPONS[s.inv.primary];
  const useLauncher = s.inv.launcher && s.inv.rockets > 0 && t.kind === KIND.VEHICLE
    && !t.abandoned && range < WEAPONS[s.inv.launcher].range;
  const w = useLauncher ? WEAPONS[s.inv.launcher] : primary;

  s.aimProgress = clamp(s.aimProgress + dt / (w.aimTime * (1 + s.suppression)), 0, 1);
  if (s.reloading > 0 || s.cooldown > 0) return;
  if (s.aimProgress < 0.65) return;

  // A grenade is the answer to a target in cover, close in.
  if (!useLauncher && s.inv.grenades > 0 && range < 28 && range > 6
      && world.coverAt(t.x, t.z, s.x, s.z) > 0.4 && roll() < 0.35 * dt * 4) {
    throwGrenade(battle, s, t);
    return;
  }

  if (useLauncher) {
    if (!fireOne(battle, s, s.inv.launcher, t, range)) return;
    s.inv.rockets--;
    s.cooldown = w.reload;
    s.aimProgress = 0.3;
    if (WEAPONS[s.inv.launcher].singleUse && s.inv.rockets <= 0) s.inv.launcher = null;
    return;
  }

  // Out of ammunition in the magazine: change it, if there is another.
  if (s.inv.rounds <= 0) {
    if (s.inv.mags <= 0) { s.outOfAmmo = true; s.target = null; return; }
    s.inv.mags--;
    s.inv.rounds = primary.mag;
    s.reloading = primary.reload;
    return;
  }

  if (!fireOne(battle, s, s.inv.primary, t, range)) return;
  s.inv.rounds--;
  s.cooldown = 60 / primary.rof;
  if (primary.burst) {
    s.burstLeft = (s.burstLeft || 0) - 1;
    if (s.burstLeft <= 0) { s.burstLeft = primary.burst; s.cooldown += 0.5 + roll() * 0.6; }
  }
}

function weaponReach(s) {
  const primary = WEAPONS[s.inv.primary];
  const launcher = s.inv.launcher ? WEAPONS[s.inv.launcher] : null;
  return Math.max(primary.range, launcher && s.inv.rockets > 0 ? launcher.range : 0) * (s.inv.binoculars ? 1.1 : 1);
}

function fireOne(battle, s, weaponKey, target, range) {
  const world = battle.world;
  const w = WEAPONS[weaponKey];
  // From the window if he is in one; the slot already sits proud of the wall,
  // so the round leaves the building instead of striking it from inside.
  const base = s.garrison != null ? s.y : world.terrain.heightAt(s.x, s.z);
  const from = {
    x: s.x + Math.sin(s.yaw) * 0.4,
    y: base + STANCE_HEIGHT[s.stance] * 0.82,
    z: s.z + Math.cos(s.yaw) * 0.4,
  };
  const aimAt = leadTarget(from, { x: target.x, z: target.z, y: targetHeight(world, target), velX: target.velX, velZ: target.velZ }, w.velocity);
  fireWeapon(world, s, weaponKey, from, aimAt, {
    aim: s.aimProgress,
    suppression: s.suppression,
    moving: s.moving,
    scoped: !!s.inv.scoped || s.role === 'sniper',
    shell: w.shell === SHELL.BULLET ? 'bullet' : w.shell,
    tracer: w.tracerEvery ? (s.shotCount = (s.shotCount || 0) + 1) % w.tracerEvery === 0 : false,
  });
  s.lastFired = world.time;
  world.fx('muzzle', { x: from.x, y: from.y, z: from.z, yaw: s.yaw, small: true });
  return true;
}

function throwGrenade(battle, s, target) {
  const world = battle.world;
  s.inv.grenades--;
  const gy = world.terrain.heightAt(s.x, s.z);
  const from = { x: s.x, y: gy + 1.3, z: s.z };
  fireWeapon(world, s, 'grenade', from, { x: target.x, y: world.terrain.heightAt(target.x, target.z), z: target.z },
    { aim: s.aimProgress, high: true, shell: 'he' });
  s.cooldown = 2.2;
  s.lastFired = world.time;
}

// ---- vehicles --------------------------------------------------------------

/**
 * Shelling a patch of ground.
 *
 * Not a target so much as a map reference: the gun lays on it, fires high
 * explosive, and keeps at it for a set number of rounds. It is how you flush
 * men out of a house you cannot see into, which without it is a wall you can
 * do nothing about.
 */
export function orderGroundFire(unit, x, z, rounds = 4) {
  const guns = unit.guns || [];
  const cannon = guns.some((g) => WEAPONS[g.w].cls === 'cannon');
  if (!cannon) return false;
  unit.groundTarget = { x, z, rounds };
  unit.target = null;
  unit.holdFire = false;
  return true;
}

/** One tick of that. Returns true while the unit is busy with it. */
function stepGroundFire(battle, u, dt) {
  const world = battle.world;
  const gt = u.groundTarget;
  if (!gt) return false;
  const y = world.terrain.heightAt(gt.x, gt.z);
  const aim = { kind: 'ground', x: gt.x, z: gt.z, y, alive: true,
    aimPoint: { x: gt.x, y: y + 0.4, z: gt.z } };

  const isVehicle = u.kind === KIND.VEHICLE;
  if (isVehicle && (u.destroyed || u.abandoned || u.gunBroken)) { u.groundTarget = null; return false; }
  if (!isVehicle && (u.destroyed || !u.manned)) { u.groundTarget = null; return false; }

  const desired = angleDelta(u.yaw, bearingTo(u, aim));
  if (isVehicle && !u.turretJammed && u.def.model.turret) {
    const rate = (u.def.traverse || 10) * DEG;
    u.turretYaw = turnTowards(u.turretYaw, desired, rate * dt);
  } else if (!isVehicle) {
    const arc = (u.def.arc ?? 30) * DEG;
    u.turretYaw = clamp(desired, -arc, arc);
  }

  const range = dist(u.x, u.z, gt.x, gt.z);
  for (const g of u.guns) {
    const w = WEAPONS[g.w];
    if (w.cls !== 'cannon' || range > w.range) continue;
    if (Math.abs(angleDelta(u.yaw + u.turretYaw, bearingTo(u, aim))) > 6 * DEG) { g.aimProgress *= 0.9; continue; }
    g.aimProgress = clamp(g.aimProgress + dt / w.aimTime, 0, 1);
    if (g.cooldown > 0 || g.aimProgress < 0.7) continue;
    const shell = (u.ammo.he || 0) > 0 ? 'he' : 'ap';
    if ((u.ammo[shell] || 0) <= 0) { u.groundTarget = null; return false; }
    if (isVehicle) fireVehicleGun(battle, u, g, aim, shell, range);
    else fireTowedGun(battle, u, g, aim, shell, range);
    if (--gt.rounds <= 0) {
      u.groundTarget = null;
      world.logLine('Fire mission complete', 'flag');
    }
    return true;
  }
  return true;
}

function stepVehicleCombat(battle, v, dt) {
  const world = battle.world;
  if (v.destroyed || v.abandoned) return;
  for (const g of v.guns) g.cooldown = Math.max(0, g.cooldown - dt);
  if (v.controlled) return;

  if (v.groundTarget && stepGroundFire(battle, v, dt)) return;

  const canShoot = gunReady(v) && !v.gunBroken;
  if (v.holdFire) { v.target = null; }
  else {
    v.acquireTimer = (v.acquireTimer || 0) - dt;
    if (v.acquireTimer <= 0) {
      v.acquireTimer = 0.5 + roll() * 0.5;
      const t = acquireTarget(world, v);
      if (t !== v.target) { v.target = t; for (const g of v.guns) g.aimProgress = 0; }
    }
  }

  const t = v.target;
  if (t && (!t.alive || (t.kind === KIND.VEHICLE && t.destroyed))) { v.target = null; }

  // Traverse. The turret keeps looking where it was told even with no target.
  const desired = t ? angleDelta(v.yaw, bearingTo(v, t)) : v.turretTarget;
  if (!v.turretJammed && v.def.model.turret) {
    const rate = (v.def.traverse || 10) * DEG * (crewAlive(v, 'gunner') ? 1 : 0.4);
    const before = v.turretYaw;
    v.turretYaw = turnTowards(v.turretYaw, desired, rate * dt);
    if (Math.abs(v.turretYaw - before) > 1e-4) for (const g of v.guns) g.aimProgress *= 0.55;
  } else if (v.def.model.casemate) {
    // A casemate gun traverses a few degrees; past that the hull must turn.
    const arc = (v.def.gunArc ?? 10) * DEG;
    v.turretYaw = clamp(desired, -arc, arc);
  }

  if (!t || !canShoot) return;
  const range = dist(v.x, v.z, t.x, t.z);
  if (!canSee(world, v, t)) return;

  for (const g of v.guns) {
    const w = WEAPONS[g.w];
    if (range > w.range) continue;
    // The main gun deals with armour; the machine guns deal with people.
    const isCannon = w.cls === 'cannon';
    if (isCannon && t.kind === KIND.SOLDIER && range > 900) continue;
    if (!isCannon && t.kind === KIND.VEHICLE && !t.abandoned) {
      const thinnest = Math.min(t.def.armour.hullSide?.t ?? 99, t.def.armour.hullTop?.t ?? 99);
      if (penetrationAt(w, range) < thinnest) continue;   // no point
    }
    // A casemate or hull gun can only fire within its arc.
    const off = Math.abs(angleDelta(v.yaw + (v.def.model.turret ? v.turretYaw : v.turretYaw), bearingTo(v, t)));
    if (g.mount === 'hull' && off > 15 * DEG) continue;
    if ((g.mount === 'casemate') && off > (v.def.gunArc ?? 10) * DEG + 0.05) continue;
    if (g.mount === 'turret' && off > 6 * DEG) { g.aimProgress *= 0.9; continue; }

    g.aimProgress = clamp(g.aimProgress + dt / w.aimTime, 0, 1);
    if (g.cooldown > 0 || g.aimProgress < 0.7) continue;

    // Pick the shell for the job, and check there is one left.
    let shell = 'bullet';
    if (isCannon) {
      const wantAp = t.kind === KIND.VEHICLE && !t.abandoned;
      shell = wantAp ? 'ap' : 'he';
      if ((v.ammo[shell] || 0) <= 0) shell = shell === 'ap' ? 'he' : 'ap';
      if ((v.ammo[shell] || 0) <= 0) continue;
    } else if ((v.ammo.bullet || 0) <= 0) continue;

    fireVehicleGun(battle, v, g, t, shell, range);
    break;                                   // one gun per tick is plenty
  }
}

export function fireVehicleGun(battle, v, g, target, shell, range) {
  const world = battle.world;
  const w = WEAPONS[g.w];
  const from = muzzlePoint(world, v, g);
  const aimAt = target.aimPoint || leadTarget(from, {
    x: target.x, z: target.z, y: targetHeight(world, target),
    velX: target.velX, velZ: target.velZ,
  }, w.velocity);

  fireWeapon(world, v, g.w, from, aimAt, {
    aim: g.aimProgress,
    moving: Math.abs(v.speed) > 1.2,
    suppression: 0,
    shell: shell === 'bullet' ? 'bullet' : (w.shell === SHELL.HEAT ? 'heat' : shell),
    tracer: w.tracerEvery ? (v.shotCount = (v.shotCount || 0) + 1) % w.tracerEvery === 0 : false,
  });

  v.ammo[shell] = Math.max(0, (v.ammo[shell] || 0) - 1);
  g.cooldown = w.cls === 'cannon'
    ? w.reload * (crewAlive(v, 'loader') ? 1 : 1.7)     // no loader, slower gun
    : 60 / w.rof;
  if (w.burst && w.cls !== 'cannon') {
    g.burstLeft = (g.burstLeft || w.burst) - 1;
    if (g.burstLeft <= 0) { g.burstLeft = w.burst; g.cooldown += 0.6; }
  }
  g.aimProgress = w.cls === 'cannon' ? 0.35 : g.aimProgress;
  v.lastFired = world.time;
  world.fx('muzzle', {
    x: from.x, y: from.y, z: from.z,
    yaw: v.yaw + (v.def.model.turret ? v.turretYaw : v.turretYaw),
    small: w.cls !== 'cannon', calibre: w.caliber,
  });
  if (w.cls === 'cannon' && w.caliber >= 57) {
    v.recoil = 1;
    world.fx('dustRing', { x: v.x, y: v.y, z: v.z, yaw: v.yaw + v.turretYaw });
  }
}

// ---- towed guns ------------------------------------------------------------

function stepGunCombat(battle, g, dt) {
  const world = battle.world;
  if (g.destroyed || g.controlled) return;
  for (const gun of g.guns) gun.cooldown = Math.max(0, gun.cooldown - dt);

  // A gun is not owned, it is manned. Walk a section up to an abandoned Pak
  // and it is your Pak — one of the moments this kind of game is remembered
  // for, and it was impossible before: the crew check demanded the gun's own
  // faction, so an enemy gun could only ever be scenery you shot at.
  const atGun = world.near(g.x, g.z, 4, (e) => e.kind === KIND.SOLDIER && !e.inVehicle);
  const mine = atGun.filter((e) => e.faction === g.faction);
  if (!mine.length) {
    const takers = {};
    for (const e of atGun) takers[e.faction] = (takers[e.faction] || 0) + 1;
    const [side, n] = Object.entries(takers).sort((a, b) => b[1] - a[1])[0] || [];
    if (side && n >= 2) {
      g.takeover = (g.takeover || 0) + dt;
      if (g.takeover > 4) {
        world.logLine(`${g.def.name} taken over`, 'flag');
        g.faction = side;
        g.takeover = 0;
        g.target = null;
      }
    } else { g.takeover = 0; }
  } else { g.takeover = 0; }

  const crew = world.near(g.x, g.z, 4, (e) => e.kind === KIND.SOLDIER && e.faction === g.faction && !e.inVehicle);
  g.crewOn = crew;
  g.manned = crew.length >= Math.max(2, Math.ceil(g.crewNeeded / 2));
  if (g.groundTarget && stepGroundFire(battle, g, dt)) return;
  if (!g.manned || g.holdFire) { g.target = null; return; }

  g.acquireTimer = (g.acquireTimer || 0) - dt;
  if (g.acquireTimer <= 0) {
    g.acquireTimer = 0.6;
    const t = acquireTarget(world, g);
    if (t !== g.target) { g.target = t; for (const gun of g.guns) gun.aimProgress = 0; }
  }
  const t = g.target;
  if (!t || !t.alive || (t.kind === KIND.VEHICLE && t.destroyed)) { g.target = null; return; }

  const bearing = bearingTo(g, t);
  const arc = (g.def.gunArc ?? 30) * DEG;
  const off = angleDelta(g.yaw, bearing);
  if (Math.abs(off) > arc) {
    // Manhandle the trail round: slow, and it takes the crew off the gun.
    g.yaw = turnTowards(g.yaw, bearing, 0.35 * dt);
    g.turretYaw = 0;
    for (const gun of g.guns) gun.aimProgress = 0;
    return;
  }
  g.turretYaw = turnTowards(g.turretYaw, off, (g.def.traverse || 20) * DEG * dt);

  const range = dist(g.x, g.z, t.x, t.z);
  const gun = g.guns[0];
  const w = WEAPONS[gun.w];
  if (range > w.range) return;
  const indirect = !!w.indirect;
  if (!indirect && !canSee(world, g, t)) return;
  if (indirect && !visibleTo(world, t, g.faction)) return;   // somebody must be spotting

  gun.aimProgress = clamp(gun.aimProgress + dt / w.aimTime, 0, 1);
  if (gun.cooldown > 0 || gun.aimProgress < 0.8) return;
  if (Math.abs(angleDelta(g.yaw + g.turretYaw, bearing)) > 2 * DEG) return;

  let shell = indirect ? 'he' : (t.kind === KIND.VEHICLE && !t.abandoned ? 'ap' : 'he');
  if ((g.ammo[shell] || 0) <= 0) shell = shell === 'ap' ? 'he' : 'ap';
  if ((g.ammo[shell] || 0) <= 0) { g.outOfAmmo = true; return; }

  fireTowedGun(battle, g, gun, t, shell, range);
}

/**
 * One round out of a towed gun. Shared with the fire-mission path, which
 * hands it a patch of ground dressed up as a target.
 */
export function fireTowedGun(battle, g, gun, target, shell, range) {
  const world = battle.world;
  const w = WEAPONS[gun.w];
  const indirect = !!w.indirect;
  const from = muzzlePoint(world, g, gun);
  const aimAt = target.aimPoint
    || (indirect
      ? { x: target.x, y: world.terrain.heightAt(target.x, target.z), z: target.z }
      : leadTarget(from, {
        x: target.x, z: target.z, y: targetHeight(world, target),
        velX: target.velX, velZ: target.velZ,
      }, w.velocity));

  fireWeapon(world, g, gun.w, from, aimAt, {
    aim: gun.aimProgress, high: indirect,
    shell: w.shell === SHELL.HE ? 'he' : shell,
  });
  g.ammo[shell] = Math.max(0, (g.ammo[shell] || 0) - 1);
  gun.cooldown = w.reload;
  gun.aimProgress = 0.4;
  g.lastFired = world.time;
  world.fx('muzzle', { x: from.x, y: from.y, z: from.z, yaw: g.yaw + g.turretYaw, calibre: w.caliber });
}
