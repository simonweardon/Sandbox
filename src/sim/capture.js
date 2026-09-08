// Capture points and the manpower economy.
//
// Assault Squad's shape: the map is a line of flags, holding them pays for
// reinforcements, and reinforcements arrive at your own edge and have to walk
// or drive up. Losing a flag hurts twice — you stop earning from it, and the
// enemy starts.

import { KIND } from './world.js';
import { clamp } from '../core/util.js';

export const CAPTURE_RATE = 0.11;       // fraction per second per man
export const BASE_INCOME = 3.0;         // manpower per second with no flags
export const FLAG_INCOME = 2.6;

export function stepCapture(battle, dt) {
  const world = battle.world;

  for (const f of world.flags) {
    const inside = world.near(f.x, f.z, f.radius, (e) =>
      (e.kind === KIND.SOLDIER && !e.inVehicle && e.alive) ||
      (e.kind === KIND.VEHICLE && !e.destroyed && !e.abandoned));

    const strength = {};
    for (const e of inside) {
      // A tank sitting on a flag holds it but cannot take it from infantry.
      const weight = e.kind === KIND.VEHICLE ? 0.5 : (1 - clamp(e.suppression, 0, 1) * 0.7);
      strength[e.faction] = (strength[e.faction] || 0) + weight;
    }
    const sides = Object.entries(strength).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]);

    if (sides.length === 0) { f.contestedBy = null; continue; }
    if (sides.length > 1 && sides[1][1] > sides[0][1] * 0.4) {
      f.contestedBy = 'both';                    // nobody makes progress
      continue;
    }
    const [side, power] = sides[0];
    f.contestedBy = side === f.owner ? null : side;

    if (side === f.owner) {
      f.progress = Math.min(1, f.progress + CAPTURE_RATE * power * dt);
    } else {
      f.progress -= CAPTURE_RATE * power * dt;
      if (f.progress <= 0) {
        const previous = f.owner;
        f.owner = side;
        f.progress = 0.02;
        world.logLine(`${f.name} captured by ${battle.sideName(side)}`, 'flag');
        battle.onFlagCaptured?.(f, previous, side);
      }
    }
  }

  // Income.
  for (const side of Object.keys(battle.sides)) {
    const s = battle.sides[side];
    const held = world.flags.filter((f) => f.owner === side).length;
    s.income = BASE_INCOME + held * FLAG_INCOME;
    s.mp = Math.min(s.mpCap, s.mp + s.income * dt);
  }
}

/** Which side is winning, by flags held and losses inflicted. */
export function scoreLine(battle) {
  const counts = {};
  for (const f of battle.world.flags) counts[f.owner] = (counts[f.owner] || 0) + 1;
  return counts;
}
