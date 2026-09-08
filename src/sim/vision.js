// Spotting and fog of war.
//
// Units are not simply visible because they exist. Somebody on the other side
// has to be able to see them: within range, with a clear line, and with the
// target doing something detectable. Lying still in a hedge is very different
// from driving across an open field with the engine roaring.

import { KIND } from './world.js';
import { STANCE, STANCE_HEIGHT } from './units.js';
import { clamp, dist2 } from '../core/util.js';

export const SIDES = ['ger', 'sov', 'usa'];

/** How easy a unit is to see, before range and cover are considered. */
export function signature(world, u) {
  if (u.kind === KIND.VEHICLE) {
    let s = 2.4;
    if (Math.abs(u.speed) > 1) s += 1.0;         // moving armour is obvious
    if (u.onFire > 0 || u.smoking > 0) s += 2.0;
    if (world.time - (u.lastFired ?? -99) < 3) s += 1.2;
    if (u.destroyed) s = 3.0;
    return s;
  }
  if (u.kind === KIND.GUN) return world.time - (u.lastFired ?? -99) < 4 ? 2.0 : 0.8;
  let s = [1.0, 0.62, 0.34][u.stance] ?? 1;
  if (u.moving) s *= 1.7;
  if (world.time - (u.lastFired ?? -99) < 2.5) s += 0.9;   // muzzle flash
  s *= 1 - (u.stealth || 0) * 0.5;
  return s;
}

export function eyeHeight(world, u) {
  const g = world.terrain.heightAt(u.x, u.z);
  if (u.kind === KIND.VEHICLE) return g + u.proxy.height * 0.85;
  if (u.kind === KIND.GUN) return g + 1.1;
  return g + STANCE_HEIGHT[u.stance] * 0.88;
}

export function targetHeight(world, u) {
  const g = world.terrain.heightAt(u.x, u.z);
  if (u.kind === KIND.VEHICLE) return g + u.proxy.height * 0.55;
  if (u.kind === KIND.GUN) return g + 0.8;
  return g + STANCE_HEIGHT[u.stance] * 0.55;
}

/**
 * Can `watcher` see `quarry` right now? Cheap checks first, the line-of-sight
 * walk last, because that is by far the most expensive part.
 */
export function canSee(world, watcher, quarry) {
  const range = spotRange(world, watcher);
  const d2 = dist2(watcher.x, watcher.z, quarry.x, quarry.z);
  if (d2 > range * range) return false;
  const d = Math.sqrt(d2);
  const sig = signature(world, quarry);
  // Beyond the point where the signature is lost in the background, no.
  const detect = range * clamp(sig / 2.2, 0.18, 1.6);
  if (d > detect) return false;
  const ey = eyeHeight(world, watcher), ty = targetHeight(world, quarry);
  return !world.losBlocker(watcher.x, ey, watcher.z, quarry.x, ty, quarry.z);
}

export function spotRange(world, u) {
  if (u.kind === KIND.VEHICLE) {
    let r = u.def.vision;
    if (u.opticsOut) r *= 0.45;
    if (u.buttonedUp) r *= 0.7;
    return r;
  }
  if (u.kind === KIND.GUN) return u.def.vision;
  let r = u.spot;
  if (u.inv?.binoculars) r *= 1.35;
  if (u.stance === STANCE.PRONE) r *= 0.8;
  if (u.suppression > 0.7) r *= 0.6;
  return r;
}

/**
 * Refresh who can see whom.
 *
 * Spotting is spread over several ticks — each call examines one slice of the
 * unit list — and each unit only tests the nearest handful of enemies, because
 * the twelfth pair of eyes on a target adds nothing that the first three have
 * not already established.
 */
export function stepVision(world, dt, slices = 6) {
  world.visionSlice = ((world.visionSlice || 0) + 1) % slices;
  const slice = world.visionSlice;
  const scratch = world._visionScratch || (world._visionScratch = []);

  const units = world.entities;
  for (let i = slice; i < units.length; i += slices) {
    const u = units[i];
    if (u.kind === KIND.PROP) continue;
    if (u.kind === KIND.SOLDIER && u.inVehicle) continue;

    const spotted = u.spottedBy || (u.spottedBy = {});
    for (const side of SIDES) if (side !== u.faction) spotted[side] = 0;

    const sig = signature(world, u);
    const ty = targetHeight(world, u);
    // Nearest first: whoever is closest is likeliest to have the line, and one
    // pair of eyes per side is all it takes.
    const watchers = world.enemiesWithin(u.x, u.z, 460, u.faction, 14, scratch);
    for (const watcher of watchers) {
      if (spotted[watcher.faction]) continue;
      if (watcher.kind === KIND.SOLDIER && watcher.inVehicle) continue;
      const range = spotRange(world, watcher);
      const d2 = watcher._d2;
      if (d2 > range * range) continue;
      const detect = range * clamp(sig / 2.2, 0.18, 1.6);
      if (d2 > detect * detect) continue;
      if (world.losBlocker(watcher.x, eyeHeight(world, watcher), watcher.z, u.x, ty, u.z)) continue;
      spotted[watcher.faction] = 1;
      u.lastSeen = u.lastSeen || {};
      u.lastSeen[watcher.faction] = { x: u.x, z: u.z, t: world.time };
    }
  }
}

/** Is `u` visible to `side` — allowing a short memory of where it just was? */
export function visibleTo(world, u, side) {
  if (u.faction === side) return true;
  return !!(u.spottedBy && u.spottedBy[side]);
}

export function lastKnown(u, side) {
  return u.lastSeen?.[side] || null;
}
