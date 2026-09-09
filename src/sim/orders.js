// Orders and movement.
//
// An order is a small object on a unit's queue. Shift-clicking adds to the
// queue rather than replacing it, which is how you set a tank going down a
// hedgerow and then round a corner without babysitting it.

import { KIND } from './world.js';
import { STANCE, STANCE_SPEED, boardVehicle, disembark, canDrive, vehicleManned } from './units.js';
import { findPath } from './pathfinding.js';
import { breakProp } from './damage.js';
import { enterBuilding, leaveBuilding, isGarrisonable } from './garrison.js';
import {
  stepFieldwork, beginRepair, beginHeal, beginMine, canRepair, canHeal, canMine, damageOn,
  REPAIR_REACH, hullLen,
} from './fieldwork.js';
import { takeAll, itemsOf } from './inventory.js';
import { clamp, angleDelta, turnTowards, dist, TAU, DEG } from '../core/util.js';
import { propDistance, nearestOnProp } from './shapes.js';

export const ORDER = {
  MOVE: 'move', ATTACK_MOVE: 'attackMove', ATTACK: 'attack', HOLD: 'hold',
  BOARD: 'board', DISEMBARK: 'disembark', CAPTURE: 'capture', LOOK: 'look', REPAIR: 'repair',
  GARRISON: 'garrison', HEAL: 'heal', MINE: 'mine', LOOT: 'loot',
};

/** Orders that send a man to a spot and then have him do something there. */
const ERRANDS = [ORDER.REPAIR, ORDER.HEAL, ORDER.MINE, ORDER.LOOT];

export function issueOrder(battle, unit, order, queue = false) {
  if (!queue) { unit.orders.length = 0; unit.path = []; unit.pathIndex = 0; }
  unit.orders.push(order);
  if (unit.orders.length === 1) beginOrder(battle, unit);
}

export function beginOrder(battle, unit) {
  const o = unit.orders[0];
  if (!o) { unit.state = 'idle'; return; }
  const world = battle.world;
  if (o.type === ORDER.MOVE || o.type === ORDER.ATTACK_MOVE || o.type === ORDER.CAPTURE) {
    const tank = unit.kind === KIND.VEHICLE;
    const p = findPath(battle.nav, unit.x, unit.z, o.x, o.z, tank);
    unit.path = p || [{ x: o.x, z: o.z }];
    unit.pathIndex = 0;
    unit.state = 'moving';
    unit.blockedFor = 0;
  } else if (o.type === ORDER.GARRISON) {
    const p = world.propsById.get(o.propId);
    if (!isGarrisonable(p)) { finishOrder(battle, unit); return; }
    // Walk to the doorstep, not to the middle of the building: the nav grid
    // blocks the footprint, so a path aimed at the centre stops short of it.
    const edge = nearestOnProp(p, unit.x, unit.z);
    const dx = edge.x - p.x, dz = edge.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const doorX = edge.x + (dx / len) * 2.2, doorZ = edge.z + (dz / len) * 2.2;
    const path = findPath(battle.nav, unit.x, unit.z, doorX, doorZ, false);
    unit.path = path || [{ x: doorX, z: doorZ }];
    unit.pathIndex = 0;
    unit.state = 'entering';
  } else if (o.type === ORDER.BOARD) {
    const v = world.byId.get(o.vehicleId);
    if (!v) { finishOrder(battle, unit); return; }
    const p = findPath(battle.nav, unit.x, unit.z, v.x, v.z, false);
    unit.path = p || [{ x: v.x, z: v.z }];
    unit.pathIndex = 0;
    unit.state = 'boarding';
  } else if (ERRANDS.includes(o.type)) {
    // Walk to the job, then do it. The target may be moving (a wounded man
    // crawling away, a tank still reversing), so the path is refreshed below.
    const t = o.targetId != null ? world.byId.get(o.targetId) : null;
    const tx = t ? t.x : o.x, tz = t ? t.z : o.z;
    if (tx === undefined) { finishOrder(battle, unit); return; }
    unit.path = findPath(battle.nav, unit.x, unit.z, tx, tz, false) || [{ x: tx, z: tz }];
    unit.pathIndex = 0;
    unit.state = 'moving';
    unit.job = null;
  } else if (o.type === ORDER.DISEMBARK) {
    if (unit.inVehicle) disembark(world, unit);
    finishOrder(battle, unit);
  } else {
    unit.state = o.type;
  }
}

export function finishOrder(battle, unit) {
  unit.orders.shift();
  unit.path = [];
  unit.pathIndex = 0;
  if (unit.orders.length) beginOrder(battle, unit);
  else unit.state = 'idle';
}

// ---------------------------------------------------------------------------

export function stepMovement(battle, dt) {
  const world = battle.world;
  for (const u of world.entities) {
    if (u.kind === KIND.SOLDIER) stepSoldier(battle, u, dt);
    else if (u.kind === KIND.VEHICLE) stepVehicle(battle, u, dt);
  }
}

function currentWaypoint(u) {
  return u.path && u.pathIndex < u.path.length ? u.path[u.pathIndex] : null;
}

function stepSoldier(battle, s, dt) {
  const world = battle.world;
  s.moving = false;
  s.velX = s.velZ = 0;
  if (s.inVehicle) {
    const v = world.byId.get(s.inVehicle);
    if (v) { s.x = v.x; s.z = v.z; s.y = v.y; }
    return;
  }
  if (s.controlled) return;      // the player is driving this one

  const o = s.orders[0];

  // In a building: he holds his window until told to do something that needs
  // his feet, in which case he comes down first.
  if (s.garrison != null) {
    if (o && o.type !== ORDER.GARRISON) leaveBuilding(world, s);
    else return;
  }

  // Men who have had enough run for the nearest cover, orders or no orders.
  if (s.morale <= 0.16 && s.suppression > 0.8) {
    s.state = 'routing';
    if (!s.routeTarget || dist(s.x, s.z, s.routeTarget.x, s.routeTarget.z) < 6) {
      const away = Math.atan2(s.x - (s.threatX ?? s.x), s.z - (s.threatZ ?? s.z + 1));
      s.routeTarget = { x: s.x + Math.sin(away) * 40, z: s.z + Math.cos(away) * 40 };
    }
    moveToward(battle, s, s.routeTarget.x, s.routeTarget.z, dt, 1.25);
    return;
  }
  if (s.state === 'routing') { s.state = 'idle'; s.routeTarget = null; }

  if (!o) return;

  if (o.type === ORDER.BOARD) {
    const v = world.byId.get(o.vehicleId);
    if (!v || v.destroyed) { finishOrder(battle, s); return; }
    if (dist(s.x, s.z, v.x, v.z) < Math.max(v.def.model.hull.len, 4) * 0.6 + 1.5) {
      boardVehicle(world, s, v, o.asCrew !== false);
      finishOrder(battle, s);
      return;
    }
    // Chase a vehicle that is still moving.
    if (!currentWaypoint(s) || dist(v.x, v.z, s.path[s.path.length - 1].x, s.path[s.path.length - 1].z) > 8) {
      s.path = findPath(battle.nav, s.x, s.z, v.x, v.z, false) || [{ x: v.x, z: v.z }];
      s.pathIndex = 0;
    }
  }

  if (o.type === ORDER.GARRISON) {
    const p = world.propsById.get(o.propId);
    if (!isGarrisonable(p)) { finishOrder(battle, s); return; }
    // A nav cell is four metres, so a man can only get so close to a wall.
    if (propDistance(p, s.x, s.z) < 5.5) {
      // If it is full he simply stays outside; his commander will find him
      // something else to do rather than filling the log with complaints.
      enterBuilding(world, s, p);
      finishOrder(battle, s);
      return;
    }
  }

  if (ERRANDS.includes(o.type)) {
    const t = o.targetId != null ? world.byId.get(o.targetId) : null;
    if (o.targetId != null && !t) { finishOrder(battle, s); return; }
    const tx = t ? t.x : o.x, tz = t ? t.z : o.z;
    const reach = o.type === ORDER.REPAIR
      ? REPAIR_REACH + hullLen(t) * 0.5
      : o.type === ORDER.MINE ? 2.2 : 2.8;
    if (dist(s.x, s.z, tx, tz) <= reach) {
      s.path = [];
      if (!s.job && !startErrand(battle, s, o, t)) { finishOrder(battle, s); return; }
      if (!stepFieldwork(battle, s, dt) && !s.job) finishOrder(battle, s);
      return;
    }
    // Keep the path pointed at a target that has moved since we set off.
    const end = s.path[s.path.length - 1];
    if (!end || dist(end.x, end.z, tx, tz) > 5) {
      s.path = findPath(battle.nav, s.x, s.z, tx, tz, false) || [{ x: tx, z: tz }];
      s.pathIndex = 0;
    }
  }

  const wp = currentWaypoint(s);
  if (!wp) {
    if (o.type === ORDER.MOVE || o.type === ORDER.ATTACK_MOVE) finishOrder(battle, s);
    else if (o.type === ORDER.CAPTURE) s.state = 'capturing';
    else if (o.type === ORDER.GARRISON) finishOrder(battle, s);
    return;
  }
  const arrived = moveToward(battle, s, wp.x, wp.z, dt, 1);
  if (arrived) {
    s.pathIndex++;
    if (s.pathIndex >= s.path.length) {
      if (o.type === ORDER.CAPTURE) { s.state = 'capturing'; s.path = []; }
      else if (o.type !== ORDER.BOARD && !ERRANDS.includes(o.type)) finishOrder(battle, s);
    }
  }
}

/**
 * He has arrived; set him to work. Returns false if the job has evaporated on
 * the way over — the tank was repaired by somebody else, the wounded man died,
 * the body has already been picked clean.
 */
function startErrand(battle, s, o, target) {
  if (o.type === ORDER.REPAIR) {
    if (!canRepair(s) || !damageOn(target)) return false;
    return !!beginRepair(s, target);
  }
  if (o.type === ORDER.HEAL) {
    if (!canHeal(s)) return false;
    return beginHeal(s, target);
  }
  if (o.type === ORDER.MINE) {
    if (!canMine(s)) return false;
    return beginMine(s, o.x, o.z);
  }
  if (o.type === ORDER.LOOT) {
    // Looting is instant once he is standing over the body: the time was the
    // walk. What he can carry is decided by the inventory rules.
    const body = o.body;
    if (!body || !itemsOf(body).length) return false;
    const got = takeAll(body, s);
    battle.world.logLine(got.length
      ? `${s.role} took ${got.length} item${got.length > 1 ? 's' : ''} from the dead`
      : `${s.role} found nothing he could use`, 'flag');
    return false;
  }
  return false;
}

/** Walk a soldier one step towards a point. Returns true on arrival. */
function moveToward(battle, s, tx, tz, dt, urgency = 1) {
  const world = battle.world;
  const dx = tx - s.x, dz = tz - s.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.1) return true;

  let speed = s.moveSpeed * STANCE_SPEED[s.stance] * urgency;
  speed *= 1 - clamp(s.suppression, 0, 1) * 0.35;
  speed *= world.terrain.speedFactor(s.x, s.z);
  if (s.hp < 45) speed *= 0.6;

  // Nudge apart from the man next to you so squads do not stack up.
  let sx = dx / d, sz = dz / d;
  for (const other of world.near(s.x, s.z, 1.6, (e) => e.kind === KIND.SOLDIER && e !== s && !e.inVehicle)) {
    const od = Math.hypot(other.x - s.x, other.z - s.z) || 0.01;
    if (od < 1.4) { sx -= ((other.x - s.x) / od) * 0.55; sz -= ((other.z - s.z) / od) * 0.55; }
  }
  const sl = Math.hypot(sx, sz) || 1;
  const nx = s.x + (sx / sl) * speed * dt, nz = s.z + (sz / sl) * speed * dt;

  if (battle.nav.passable(nx, nz, false) && world.terrain.inBounds(nx, nz)) {
    s.velX = (nx - s.x) / dt; s.velZ = (nz - s.z) / dt;
    s.x = nx; s.z = nz;
  }
  s.y = world.terrain.heightAt(s.x, s.z);
  s.yaw = Math.atan2(dx, dz);
  s.moving = true;
  s.animPhase += speed * dt * 2.4;
  return false;
}

// ---------------------------------------------------------------------------

function stepVehicle(battle, v, dt) {
  const world = battle.world;
  v.velX = v.velZ = 0;
  if (v.destroyed) { v.speed = 0; return; }
  if (v.controlled) { settleOnGround(world, v); return; }

  const drivable = canDrive(v);
  const o = v.orders[0];
  let targetSpeed = 0, steerTo = v.yaw;

  if (o && drivable) {
    const wp = currentWaypoint(v);
    if (wp) {
      const dx = wp.x - v.x, dz = wp.z - v.z;
      const d = Math.hypot(dx, dz);
      const last = v.pathIndex >= v.path.length - 1;
      if (d < (last ? 3.5 : 6)) {
        v.pathIndex++;
        if (v.pathIndex >= v.path.length && o.type !== ORDER.CAPTURE) finishOrder(battle, v);
        else if (v.pathIndex >= v.path.length) { v.state = 'capturing'; v.path = []; }
      } else {
        steerTo = Math.atan2(dx, dz);
        const turnErr = Math.abs(angleDelta(v.yaw, steerTo));
        // Slow into a turn; crawl when almost round.
        const maxSpeed = v.def.maxSpeed * (world.terrain.groundAt(v.x, v.z) === 2 ? 1 : v.def.offroad);
        targetSpeed = maxSpeed * clamp(1 - turnErr / 1.4, 0.12, 1);
        if (last) targetSpeed *= clamp(d / 12, 0.25, 1);
      }
    } else if (o.type === ORDER.MOVE || o.type === ORDER.ATTACK_MOVE) {
      finishOrder(battle, v);
    }
  }

  // Engine, gearing and inertia.
  const accel = v.def.accel * (targetSpeed > v.speed ? 1 : 2.4);
  v.speed += clamp(targetSpeed - v.speed, -accel * dt, accel * dt);
  if (Math.abs(v.speed) < 0.02) v.speed = 0;

  const turnRate = v.def.turnRate * clamp(0.35 + Math.abs(v.speed) / Math.max(1, v.def.maxSpeed), 0.35, 1.2);
  v.yaw = turnTowards(v.yaw, steerTo, turnRate * dt);

  if (v.speed !== 0) {
    const nx = v.x + Math.sin(v.yaw) * v.speed * dt;
    const nz = v.z + Math.cos(v.yaw) * v.speed * dt;
    if (world.terrain.inBounds(nx, nz) && battle.nav.passable(nx, nz, true)) {
      v.velX = (nx - v.x) / dt; v.velZ = (nz - v.z) / dt;
      v.x = nx; v.z = nz;
      crushScenery(battle, v);
    } else {
      v.speed = 0;
    }
    v.trackPhase += v.speed * dt;
  }
  settleOnGround(world, v);
}

/** Sit a vehicle on the ground, tilted to follow the slope under it. */
export function settleOnGround(world, v) {
  const T = world.terrain;
  const h = v.def.model.hull;
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  const halfL = h.len * 0.42, halfW = h.wid * 0.42;
  const fx = v.x + s * halfL, fz = v.z + c * halfL;
  const bx = v.x - s * halfL, bz = v.z - c * halfL;
  const lx = v.x + c * halfW, lz = v.z - s * halfW;
  const rx = v.x - c * halfW, rz = v.z + s * halfW;
  const hf = T.heightAt(fx, fz), hb = T.heightAt(bx, bz);
  const hl = T.heightAt(lx, lz), hr = T.heightAt(rx, rz);
  v.y = (hf + hb + hl + hr) / 4;
  v.pitch = Math.atan2(hb - hf, halfL * 2);
  v.roll = Math.atan2(hr - hl, halfW * 2);
}

/** Tanks flatten fences, hedges and saplings they drive into. */
function crushScenery(battle, v) {
  const world = battle.world;
  const reach = v.def.model.hull.wid * 0.6 + 1;
  for (const p of world.propsNearPoint(v.x, v.z, reach + 6)) {
    if (!p.alive || !p.destructible) continue;
    if (p.type === 'house' || p.type === 'wall' || p.type === 'rock') continue;
    if (Math.hypot(p.x - v.x, p.z - v.z) > reach + p.radius * 0.5) continue;
    if (v.def.mass < 8 && p.type !== 'fence') continue;   // a truck is not a tank
    breakProp(world, p);
    battle.nav.clearProp(p);
    world.logLine(`${v.def.short} crushes ${p.type === 'tree' ? 'a tree' : 'an obstacle'}`, 'info');
  }
}
