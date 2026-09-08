// Occupying buildings.
//
// In open country a building is an obstacle. In a city it is the ground you are
// fighting over, and a squad at the windows of a four-storey block covers the
// street below in a way nothing standing on that street can answer. This is
// what turns the city map from a maze of boxes into a street battle: rooms have
// to be taken, not just driven past.

import { KIND } from './world.js';
import { STANCE } from './units.js';
import { nearestOnProp, isBoxed, propDistance } from './shapes.js';
import { roll } from '../core/rng.js';
import { clamp } from '../core/util.js';

/** Buildings you can put men inside. */
export function isGarrisonable(p) {
  return !!p && p.alive && p.capacity > 0;
}

/**
 * Firing positions around a building: one per window, spread over the
 * perimeter and up the floors. A man is placed just proud of the wall so his
 * shots leave the building rather than striking it from the inside.
 */
export function windowSlots(p) {
  if (p._slots) return p._slots;
  const slots = [];
  const floors = Math.max(1, p.floors ?? Math.max(1, Math.round(p.height / 3.4)));
  const usable = Math.min(floors, 4);

  if (isBoxed(p)) {
    const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
    const ex = p.w / 2, ez = p.d / 2;
    const perSide = (len) => Math.max(1, Math.round(len / 5));
    const faces = [
      { nx: 0, nz: -1, len: p.w, along: 'x' },
      { nx: 0, nz: 1, len: p.w, along: 'x' },
      { nx: -1, nz: 0, len: p.d, along: 'z' },
      { nx: 1, nz: 0, len: p.d, along: 'z' },
    ];
    for (const f of faces) {
      const n = perSide(f.len);
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n - 0.5) * (f.len - 1.6);
        for (let fl = 0; fl < usable; fl++) {
          // Local position, half a metre outside the wall face.
          const lx = f.along === 'x' ? u : f.nx * (ex + 0.5);
          const lz = f.along === 'x' ? f.nz * (ez + 0.5) : u;
          slots.push({
            x: p.x + lx * c - lz * s,
            z: p.z + lx * s + lz * c,
            floor: fl,
            // Which way he is facing: out through his own wall.
            yaw: Math.atan2(f.nx * c - f.nz * s, f.nx * s + f.nz * c),
          });
        }
      }
    }
  } else {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (let fl = 0; fl < usable; fl++) {
        slots.push({
          x: p.x + Math.cos(a) * (p.radius + 0.4),
          z: p.z + Math.sin(a) * (p.radius + 0.4),
          floor: fl, yaw: Math.atan2(Math.cos(a), Math.sin(a)),
        });
      }
    }
  }
  p._slots = slots;
  return slots;
}

/** How high off the ground a given floor's windows are. */
export function floorHeight(p, floor) {
  const floors = Math.max(1, p.floors ?? Math.max(1, Math.round(p.height / 3.4)));
  const each = (p.height - 1.2) / floors;
  return 1.0 + floor * each + each * 0.35;
}

export function occupants(world, p) {
  return world.entities.filter((e) => e.kind === KIND.SOLDIER && e.alive && e.garrison === p.id);
}

export function garrisonCount(world, p) {
  let n = 0;
  for (const e of world.entities) if (e.kind === KIND.SOLDIER && e.alive && e.garrison === p.id) n++;
  return n;
}

/** Put a soldier into a building, at a window nobody else is using. */
export function enterBuilding(world, s, p) {
  if (!isGarrisonable(p) || s.inVehicle) return false;
  if (garrisonCount(world, p) >= p.capacity) return false;

  const slots = windowSlots(p);
  const taken = new Set();
  const perFloor = [];
  for (const e of world.entities) {
    if (e.kind !== KIND.SOLDIER || e.garrison !== p.id) continue;
    if (e.slotIndex !== undefined) taken.add(e.slotIndex);
    const f = e.garrisonFloor ?? 0;
    perFloor[f] = (perFloor[f] || 0) + 1;
  }

  // Prefer a window on the side he came from — a squad should not teleport
  // round to the far face — but spread the section up the building rather than
  // packing the ground floor, because the upper floors are the position.
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < slots.length; i++) {
    if (taken.has(i)) continue;
    const slot = slots[i];
    const score = Math.hypot(slot.x - s.x, slot.z - s.z) * 0.35
      + (perFloor[slot.floor] || 0) * 6;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  if (best < 0) return false;

  const slot = slots[best];
  s.garrison = p.id;
  s.slotIndex = best;
  s.x = slot.x;
  s.z = slot.z;
  s.y = world.terrain.heightAt(slot.x, slot.z) + floorHeight(p, slot.floor);
  s.yaw = slot.yaw;
  s.windowYaw = slot.yaw;
  s.garrisonFloor = slot.floor;
  s.stance = STANCE.CROUCH;
  s.orders.length = 0;
  s.path = [];
  s.moving = false;
  s.velX = s.velZ = 0;
  return true;
}

/** Turn a man out of a building, onto the ground beside it. */
export function leaveBuilding(world, s) {
  const p = s.garrison != null ? world.props.find((q) => q.id === s.garrison) : null;
  s.garrison = null;
  s.slotIndex = undefined;
  s.windowYaw = undefined;
  s.garrisonFloor = 0;
  if (p) {
    const out = nearestOnProp(p, s.x, s.z);
    const dx = out.x - p.x, dz = out.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    s.x = out.x + (dx / len) * 1.6;
    s.z = out.z + (dz / len) * 1.6;
  }
  s.y = world.terrain.heightAt(s.x, s.z);
  s.stance = STANCE.STAND;
}

/**
 * How much the building is protecting him. A man at a window is behind a wall
 * with a hole in it, which is a great deal better than lying in the street.
 */
export function garrisonProtection(world, s) {
  if (s.garrison == null) return 0;
  const p = world.props.find((q) => q.id === s.garrison);
  return p ? (p.garrisonCover ?? 0.75) : 0;
}

/** The building a point is inside, if any. */
export function buildingAt(world, x, z, pad = 0) {
  for (const p of world.propsNearPoint(x, z, 6 + pad)) {
    if (!isGarrisonable(p)) continue;
    if (propDistance(p, x, z) <= pad) return p;
  }
  return null;
}

/**
 * Everyone inside loses the building when it comes down, and anyone still in
 * it when the enemy walks in has to be dealt with at very short range.
 */
export function evictAll(world, p, kill) {
  for (const s of occupants(world, p)) {
    if (kill) kill(s);
    else leaveBuilding(world, s);
  }
}
