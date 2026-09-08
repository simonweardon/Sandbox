// Spawning units, and the state each one carries.
//
// Vehicles deliberately have no hit-point bar. A tank is destroyed when its
// crew are dead or have bailed out, when its ammunition goes up, or when it
// burns — which is what makes a knocked-out but intact hull something you can
// walk a crew over to and drive away.

import { KIND } from './world.js';
import { VEHICLES, GUNS, componentLayout } from '../data/vehicles.js';
import { WEAPONS } from '../data/weapons.js';
import { ROLES, KITS, SQUADS } from '../data/infantry.js';
import { hitProxy } from './penetration.js';
import { roll } from '../core/rng.js';
import { DEG } from '../core/util.js';

export const STANCE = { STAND: 0, CROUCH: 1, PRONE: 2 };
export const STANCE_HEIGHT = [1.72, 1.15, 0.5];
export const STANCE_SPEED = [1.0, 0.55, 0.22];
export const STANCE_EXPOSURE = [1.0, 0.62, 0.34];

let squadCounter = 0;

export function makeSoldier(world, faction, role, x, z, squadId = null) {
  const spec = ROLES[role] || ROLES.rifleman;
  const kit = (KITS[faction] || KITS.ger)[role] || KITS[faction].rifleman;
  const primary = WEAPONS[kit.primary];
  const s = {
    kind: KIND.SOLDIER, role, faction, squad: squadId,
    x, z, y: world.terrain.heightAt(x, z), yaw: 0,
    hp: spec.hp, maxHp: spec.hp, bleeding: 0,
    suppression: 0, morale: 1, stance: STANCE.STAND,
    spot: spec.spot, scope: spec.scope || 1, stealth: spec.stealth || 0,
    inv: {
      primary: kit.primary,
      mags: kit.mags, rounds: primary.mag,
      grenades: kit.grenades,
      launcher: kit.launcher || null, rockets: kit.rockets || 0,
      bandages: kit.bandages || 0, mines: kit.mines || 0,
      repairKit: !!kit.repairKit, binoculars: !!kit.binoculars,
    },
    cooldown: 0, burstLeft: 0, aimProgress: 0, reloading: 0,
    target: null, targetLast: 0, holdFire: false,
    orders: [], path: [], pathIndex: 0, moveSpeed: 3.4,
    inVehicle: null, seat: null, garrison: null,
    state: 'idle', animPhase: roll() * 6.28, lastFired: -99,
    controlled: false, visible: true, seenBy: 0,
    kills: 0,
  };
  return world.add(s);
}

export function makeSquad(world, faction, templateKey, x, z, spacing = 3.2) {
  const tpl = SQUADS[templateKey];
  if (!tpl) throw new Error('no squad template ' + templateKey);
  const id = ++squadCounter;
  const men = [];
  tpl.members.forEach((role, i) => {
    const col = i % 3, row = (i / 3) | 0;
    const s = makeSoldier(world, faction, role,
      x + (col - 1) * spacing + (roll() - 0.5),
      z + row * spacing + (roll() - 0.5), id);
    if (i === 0) s.leader = true;
    men.push(s);
  });
  return { id, faction, template: templateKey, name: tpl.name, members: men };
}

export function makeVehicle(world, faction, typeKey, x, z, yaw = 0) {
  const def = VEHICLES[typeKey];
  if (!def) throw new Error('no vehicle ' + typeKey);
  const proxy = hitProxy(def);

  const components = {};
  for (const c of componentLayout(def)) {
    // Only model crew positions the vehicle actually has.
    if (c.crew && !def.crew.includes(c.id)) continue;
    components[c.id] = { ...c, hp: c.hp, max: c.hp, broken: false, dead: false };
  }
  components.trackL = { id: 'trackL', hp: 90, max: 90, broken: false };
  components.trackR = { id: 'trackR', hp: 90, max: 90, broken: false };

  const ammo = {};
  const guns = def.guns.map((g, i) => {
    for (const [k, n] of Object.entries(g.ammo || {})) ammo[k] = (ammo[k] || 0) + n;
    return {
      slot: i, w: g.w, mount: g.mount, cooldown: 0, aimProgress: 0,
      shellType: WEAPONS[g.w].shell === 'heat' ? 'heat' : (WEAPONS[g.w].shell === 'bullet' ? 'bullet' : 'ap'),
      burstLeft: 0,
    };
  });

  const v = {
    kind: KIND.VEHICLE, type: typeKey, def, faction, proxy,
    x, z, y: world.terrain.heightAt(x, z), yaw, pitch: 0, roll: 0,
    turretYaw: 0, turretTarget: 0, gunPitch: 0,
    speed: 0, throttle: 0, steer: 0, reverse: false,
    components, ammo, guns, selectedShell: 'ap',
    crew: def.crew.map((r) => ({ role: r, alive: true })),
    passengers: [],
    onFire: 0, smoking: 0, destroyed: false, abandoned: false,
    immobile: false, engineDead: false,
    orders: [], path: [], pathIndex: 0,
    target: null, holdFire: false, state: 'idle',
    visible: true, seenBy: 0, controlled: false, kills: 0,
    trackPhase: 0, wheelSpin: 0,
    seats: def.seats || 0,
  };
  return world.add(v);
}

export function makeGun(world, faction, typeKey, x, z, yaw = 0) {
  const def = GUNS[typeKey];
  if (!def) throw new Error('no gun ' + typeKey);
  const ammo = {};
  for (const g of def.guns) for (const [k, n] of Object.entries(g.ammo || {})) ammo[k] = (ammo[k] || 0) + n;
  const g = {
    kind: KIND.GUN, type: typeKey, def, faction,
    x, z, y: world.terrain.heightAt(x, z), yaw,
    turretYaw: 0, gunPitch: 0, ammo, selectedShell: 'ap',
    guns: def.guns.map((gg, i) => ({
      slot: i, w: gg.w, mount: gg.mount, cooldown: 0, aimProgress: 0,
      shellType: WEAPONS[gg.w].shell === 'he' ? 'he' : 'ap', burstLeft: 0,
    })),
    crewNeeded: def.crew, crewOn: [], destroyed: false,
    orders: [], target: null, holdFire: false, state: 'idle',
    visible: true, seenBy: 0, controlled: false, kills: 0,
    isMortar: def.cls === 'mortar',
  };
  if (g.isMortar) g.selectedShell = 'he';
  return world.add(g);
}

/** Crew a vehicle from a pool of soldiers standing near it. */
export function boardVehicle(world, soldier, vehicle, asCrew = true) {
  if (soldier.inVehicle) return false;
  if (asCrew) {
    // Fill the seats that make a tank work first: no driver, no tank.
    const priority = ['driver', 'gunner', 'commander', 'loader', 'hullgunner'];
    let empty = null;
    for (const role of priority) {
      empty = vehicle.crew.find((c) => c.role === role && !c.occupant);
      if (empty) break;
    }
    if (!empty) return boardVehicle(world, soldier, vehicle, false);
    empty.occupant = soldier.id;
    empty.alive = true;
    soldier.seat = empty.role;
    // A crewed component is manned again, so clear its "dead" flag.
    const comp = vehicle.components[empty.role];
    if (comp) { comp.dead = false; comp.hp = comp.max; }
  } else {
    if (vehicle.passengers.length >= vehicle.seats) return false;
    vehicle.passengers.push(soldier.id);
    soldier.seat = 'passenger';
  }
  soldier.inVehicle = vehicle.id;
  soldier.visible = false;
  vehicle.abandoned = false;
  return true;
}

export function disembark(world, soldier) {
  const v = world.byId.get(soldier.inVehicle);
  soldier.inVehicle = null;
  soldier.visible = true;
  if (!v) return;
  const seat = v.crew.find((c) => c.occupant === soldier.id);
  if (seat) { seat.occupant = null; }
  const pi = v.passengers.indexOf(soldier.id);
  if (pi >= 0) v.passengers.splice(pi, 1);
  // Step out to the side, away from the tracks.
  const side = roll() < 0.5 ? 1 : -1;
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  const off = (v.def.model.hull.wid / 2 + 1.6) * side;
  soldier.x = v.x + c * off;
  soldier.z = v.z - s * off;
  soldier.y = world.terrain.heightAt(soldier.x, soldier.z);
  soldier.seat = null;
  if (!v.crew.some((cc) => cc.occupant)) v.abandoned = true;
}

/** Is there anybody left driving or shooting? */
export function vehicleManned(v) {
  return v.crew.some((c) => c.occupant || (c.alive && !v.components[c.role]?.dead));
}

export function crewAlive(v, role) {
  const c = v.components[role];
  if (!c) return false;
  return !c.dead;
}

export function gunReady(v) { return crewAlive(v, 'gunner') || crewAlive(v, 'commander'); }
export function canDrive(v) {
  return !v.engineDead && !v.immobile && (crewAlive(v, 'driver') || crewAlive(v, 'commander'));
}

/** Total ammunition of a type left aboard. */
export function ammoOf(u, type) { return u.ammo?.[type] ?? 0; }
