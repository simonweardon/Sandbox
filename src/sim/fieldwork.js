// The work soldiers do that is not shooting: mending tracks, patching men up,
// and putting mines across a road.
//
// All three exist because the kit to do them is already in the game — every
// engineer spawns with a repair kit and two mines, every medic with bandages —
// and kit that cannot be used is just a number on a card. Each is deliberately
// slow and leaves the man doing it standing still in the open, which is the
// decision the player is actually making.

import { KIND } from './world.js';
import { STANCE } from './units.js';
import { ROLES } from '../data/infantry.js';
import { clamp } from '../core/util.js';

export const REPAIR_REACH = 4.5;      // metres, close enough to work on a hull
export const MINE_ARM_TIME = 3.0;     // seconds spent burying it
export const MINE_TRIGGER = 2.6;      // metres from the mine's centre

// A vehicle's size lives on its model, not on the definition itself. Reading
// `def.length` gave undefined, and every `distance > reach + undefined` came
// out false — so a repair worked from any distance at all and a mine never
// found anything. Both were silent: NaN comparisons do not throw.
const hullLen = (v) => v?.def?.model?.hull?.len ?? 5;
const hullWid = (v) => v?.def?.model?.hull?.wid ?? 2.8;
export { hullLen, hullWid };

/** Everything a repair kit can put right, worst first — tracks before optics. */
const REPAIRABLE = [
  { flag: 'immobile', label: 'tracks', seconds: 14, clears: (v) => { v.immobile = false; restore(v, 'trackL'); restore(v, 'trackR'); restore(v, 'transmission'); } },
  { flag: 'engineDead', label: 'engine', seconds: 18, clears: (v) => { v.engineDead = false; restore(v, 'engine'); } },
  { flag: 'gunBroken', label: 'gun', seconds: 16, clears: (v) => { v.gunBroken = false; restore(v, 'gun'); } },
  { flag: 'turretJammed', label: 'turret ring', seconds: 12, clears: (v) => { v.turretJammed = false; restore(v, 'turret'); } },
  { flag: 'opticsOut', label: 'optics', seconds: 8, clears: (v) => { v.opticsOut = false; restore(v, 'optics'); } },
];

function restore(v, id) {
  const c = v.components?.[id];
  if (c) { c.broken = false; c.hp = c.max; }
}

/** Can this soldier repair at all — and does he still have the kit for it? */
export function canRepair(s) {
  return s.kind === KIND.SOLDIER && s.alive !== false && !s.inVehicle
    && !!(ROLES[s.role]?.repairs) && !!s.inv.repairKit;
}

/** Is there anything on this vehicle worth a repair kit? */
export function damageOn(v) {
  if (!v || v.kind !== KIND.VEHICLE || v.destroyed) return null;
  return REPAIRABLE.find((r) => v[r.flag]) || null;
}

export function canHeal(s) {
  return s.kind === KIND.SOLDIER && !s.inVehicle && !!(ROLES[s.role]?.heals) && s.inv.bandages > 0;
}

/** A man worth a bandage: hurt, on our side, and not already being seen to. */
export function needsHelp(s) {
  return s && s.kind === KIND.SOLDIER && !s.inVehicle
    && (s.hp < s.maxHp * 0.85 || s.bleeding > 0);
}

export function canMine(s) {
  return s.kind === KIND.SOLDIER && !s.inVehicle && s.inv.mines > 0;
}

/**
 * Run one tick of whatever job the soldier is standing over. Returns true while
 * the job is still going, so the order system knows to hold him there.
 */
export function stepFieldwork(battle, s, dt) {
  const job = s.job;
  if (!job) return false;
  const world = battle.world;

  if (job.type === 'repair') {
    const v = world.byId.get(job.targetId);
    const fault = damageOn(v);
    if (!v || !fault || !s.inv.repairKit) { s.job = null; return false; }
    if (Math.hypot(v.x - s.x, v.z - s.z) > REPAIR_REACH + hullLen(v) * 0.5) return false;
    s.stance = STANCE.CROUCH;
    s.state = 'repairing';
    // Starting a different fault from the one we began on resets the clock.
    if (job.flag !== fault.flag) { job.flag = fault.flag; job.left = fault.seconds; }
    job.left -= dt * (1 + (s.repairSkill || 0));
    if (job.left <= 0) {
      fault.clears(v);
      world.logLine(`${v.def.short} — ${fault.label} repaired`, 'flag');
      // A kit is good for one job. That is what makes lorries worth driving up.
      s.inv.repairKit = false;
      s.job = null;
      s.state = 'idle';
      return false;
    }
    return true;
  }

  if (job.type === 'heal') {
    const t = world.byId.get(job.targetId);
    if (!t || t.state === 'dead' || !s.inv.bandages || !needsHelp(t)) { s.job = null; s.state = 'idle'; return false; }
    if (Math.hypot(t.x - s.x, t.z - s.z) > 3.2) return false;
    s.stance = STANCE.CROUCH;
    s.state = 'healing';
    job.left -= dt;
    if (job.left <= 0) {
      t.hp = clamp(t.hp + 55, 0, t.maxHp);
      t.bleeding = 0;
      t.suppression = Math.min(t.suppression, 0.4);
      s.inv.bandages--;
      world.logLine(`${t.role} patched up`, 'flag');
      s.job = null;
      s.state = 'idle';
      return false;
    }
    return true;
  }

  if (job.type === 'mine') {
    if (!s.inv.mines) { s.job = null; return false; }
    if (Math.hypot(job.x - s.x, job.z - s.z) > 2.5) return false;
    s.stance = STANCE.PRONE;
    s.state = 'mining';
    job.left -= dt;
    if (job.left <= 0) {
      layMine(world, s.faction, job.x, job.z);
      s.inv.mines--;
      world.logLine('Mine laid', 'flag');
      s.job = null;
      s.state = 'idle';
      return false;
    }
    return true;
  }

  s.job = null;
  return false;
}

export function beginRepair(s, v) {
  const fault = damageOn(v);
  if (!canRepair(s) || !fault) return null;
  s.job = { type: 'repair', targetId: v.id, flag: fault.flag, left: fault.seconds };
  return fault.label;
}

export function beginHeal(s, t) {
  if (!canHeal(s) || !needsHelp(t)) return false;
  s.job = { type: 'heal', targetId: t.id, left: 4.5 };
  return true;
}

export function beginMine(s, x, z) {
  if (!canMine(s)) return false;
  s.job = { type: 'mine', x, z, left: MINE_ARM_TIME };
  return true;
}

export function layMine(world, faction, x, z) {
  const m = { faction, x, z, y: world.terrain.heightAt(x, z), live: true };
  (world.mines = world.mines || []).push(m);
  return m;
}

/**
 * Mines go off under tracks, not under boots — an anti-tank mine needs the
 * weight of a vehicle. They are invisible to the side that did not lay them
 * until they go off, which is the whole point of them.
 */
export function stepMines(battle, dt) {
  const world = battle.world;
  if (!world.mines || !world.mines.length) return;
  for (const m of world.mines) {
    if (!m.live) continue;
    for (const v of world.near(m.x, m.z, MINE_TRIGGER + 3, (e) =>
      e.kind === KIND.VEHICLE && !e.destroyed && e.faction !== m.faction)) {
      const half = Math.max(2.2, hullWid(v) * 0.5);
      if (Math.hypot(v.x - m.x, v.z - m.z) > MINE_TRIGGER + half) continue;
      m.live = false;
      v.immobile = true;
      const side = (v.x - m.x) * Math.cos(v.yaw) - (v.z - m.z) * Math.sin(v.yaw);
      const track = side < 0 ? 'trackL' : 'trackR';
      if (v.components[track]) { v.components[track].broken = true; v.components[track].hp = 0; }
      v.shock = (v.shock || 0) + 1.1;
      world.fx('explosion', { x: m.x, y: m.y + 0.2, z: m.z, power: 0.8 });
      world.logLine(`${v.def.short} — mined, ${track === 'trackL' ? 'left' : 'right'} track gone`, 'kill');
      break;
    }
  }
  // Spent mines are cheap to keep around, but not for ever.
  if (world.mines.length > 80) world.mines = world.mines.filter((m) => m.live);
}
