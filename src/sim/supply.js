// Ammunition, and getting more of it.
//
// Finite ammunition is one of the systems that makes this game what it is, but
// it is only interesting if running dry is a problem you can solve. A crate
// dropped behind the line, or a lorry driven up to it, lets men refill their
// pouches and a tank replenish its racks — slowly, and only while they stay
// beside it.

import { KIND } from './world.js';
import { WEAPONS } from '../data/weapons.js';
import { VEHICLES } from '../data/vehicles.js';
import { clamp } from '../core/util.js';

export const CRATE = {
  name: 'Ammunition crate', cost: 45, capacity: 1400, radius: 14,
};

export function makeCrate(world, faction, x, z) {
  const c = {
    kind: KIND.CRATE, type: 'crate', faction,
    x, z, y: world.terrain.heightAt(x, z), yaw: 0,
    stock: CRATE.capacity, radius: CRATE.radius,
    visible: true, seenBy: 0, state: 'idle', orders: [],
  };
  return world.add(c);
}

/** Everything that can hand ammunition out: crates, and lorries that carry it. */
function sources(world, faction) {
  const out = [];
  for (const e of world.entities) {
    if (e.faction !== faction) continue;
    if (e.kind === KIND.CRATE && e.stock > 0) out.push({ e, radius: e.radius, stock: 'stock' });
    else if (e.kind === KIND.VEHICLE && !e.destroyed && !e.abandoned && e.def.supply > 0) {
      if ((e.supplyLeft ?? e.def.supply) > 0) out.push({ e, radius: 16, stock: 'supplyLeft' });
    }
  }
  return out;
}

/**
 * Top units up from whatever they are standing next to. Deliberately slow: a
 * squad has to stop and stay stopped, which is a decision, not a formality.
 */
export function stepSupply(battle, dt) {
  const world = battle.world;
  battle._supplyTimer = (battle._supplyTimer || 0) - dt;
  if (battle._supplyTimer > 0) return;
  const step = 0.5;
  battle._supplyTimer = step;

  for (const side of Object.keys(battle.sides)) {
    const src = sources(world, side);
    if (!src.length) continue;

    for (const s of src) {
      if (s.e[s.stock] === undefined) s.e[s.stock] = s.e.def?.supply ?? CRATE.capacity;
      const near = world.near(s.e.x, s.e.z, s.radius, (u) =>
        u.faction === side
        && (u.kind === KIND.SOLDIER ? !u.inVehicle && u.alive
          : (u.kind === KIND.VEHICLE ? !u.destroyed && !u.abandoned : u.kind === KIND.GUN && !u.destroyed)));

      for (const u of near) {
        if (s.e[s.stock] <= 0) break;
        // A man who is moving is not restocking his pouches.
        if (u.kind === KIND.SOLDIER) {
          if (u.moving) continue;
          const w = WEAPONS[u.inv.primary];
          const wantMags = Math.max(0, 10 - u.inv.mags);
          if (wantMags > 0) {
            u.inv.mags++;
            s.e[s.stock] -= 20;
            u.resupplied = world.time;
            continue;
          }
          if (u.inv.grenades < 3) { u.inv.grenades++; s.e[s.stock] -= 15; u.resupplied = world.time; continue; }
          if (u.inv.launcher && u.inv.rockets < 3) { u.inv.rockets++; s.e[s.stock] -= 40; u.resupplied = world.time; }
        } else {
          if (Math.abs(u.speed || 0) > 0.4) continue;
          const def = u.def;
          const full = {};
          for (const g of def.guns || []) {
            for (const [k, n] of Object.entries(g.ammo || {})) full[k] = (full[k] || 0) + n;
          }
          for (const [k, max] of Object.entries(full)) {
            const have = u.ammo[k] || 0;
            if (have >= max) continue;
            const give = k === 'bullet' ? 60 : 1;
            u.ammo[k] = Math.min(max, have + give);
            s.e[s.stock] -= k === 'bullet' ? 4 : 25;
            u.resupplied = world.time;
            break;
          }
        }
      }
      if (s.e[s.stock] <= 0 && s.e.kind === KIND.CRATE) {
        world.logLine('An ammunition crate is empty', 'info');
        world.remove(s.e);
      }
    }
  }
}

/** How full a crate or lorry is, for the interface. */
export function supplyLevel(e) {
  if (e.kind === KIND.CRATE) return clamp(e.stock / CRATE.capacity, 0, 1);
  if (e.def?.supply) return clamp((e.supplyLeft ?? e.def.supply) / e.def.supply, 0, 1);
  return 0;
}
