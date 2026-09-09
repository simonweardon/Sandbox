// What a man is carrying, and taking it off somebody who no longer needs it.
//
// Men of War's inventory is not decoration: it is where a lot of the game is
// played. A rifle squad that has shot itself dry is a liability until somebody
// walks it over to the dead and comes back with full pouches, and the MG42 on
// a German body is a better weapon than the rifle the man picking it up came
// with. So the kit each soldier spawns with is a real, finite, movable thing.
//
// The store itself is the flat `inv` object every soldier already carries —
// combat, supply and the HUD all read it directly — and this module is the
// view of it as a list of items, plus the rules for moving them about.

import { WEAPONS } from '../data/weapons.js';
import { KIND } from './world.js';

/**
 * How much a man can carry, in slots.
 *
 * Set so that every kit in the game fits with room to loot — a bazooka team
 * spawns at about ninety per cent of it. A capacity that a spawn kit already
 * breaks is not a capacity, it is a bug that refuses every transfer.
 */
export const CAPACITY = 24;

/**
 * Every item a carrier can hold, keyed by the field in `inv` that stores it.
 *
 * `slots` is per unit held. `stack` marks the countable ones — a man has six
 * bandages, but one rifle.
 */
export const ITEMS = {
  weapon:     { slots: 3, stack: false, group: 'arms' },
  mags:       { slots: 1, stack: true,  group: 'ammo' },   // see slotsFor

  grenades:   { slots: 1, stack: true,  group: 'ammo' },
  launcher:   { slots: 4, stack: false, group: 'arms' },
  rockets:    { slots: 2, stack: true,  group: 'ammo' },
  bandages:   { slots: 1, stack: true,  group: 'kit' },
  mines:      { slots: 2, stack: true,  group: 'kit' },
  repairKit:  { slots: 2, stack: false, group: 'kit' },
  binoculars: { slots: 1, stack: false, group: 'kit' },
};

const nameOf = (key) => WEAPONS[key]?.name || key;

/**
 * What one of a thing costs to carry.
 *
 * Flat costs were wrong in both directions: a five-round Mosin clip and a
 * fifty-round belt box are not the same burden, and neither is a Panzerfaust
 * warhead and a 14.5 mm anti-tank rifle cartridge. Both are ammunition; one
 * of them you carry twenty of.
 */
export function slotsFor(key, inv) {
  if (key === 'weapon') return WEAPONS[inv.primary]?.cls === 'lmg' ? 5 : 3;
  if (key === 'mags') {
    const mag = WEAPONS[inv.primary]?.mag ?? 8;
    return mag <= 10 ? 0.5 : mag <= 40 ? 1 : 2;      // clip, magazine, belt
  }
  if (key === 'rockets') {
    // A rocket is bulky; an anti-tank rifle round is a big cartridge.
    return (WEAPONS[inv.launcher]?.caliber ?? 60) >= 50 ? 2 : 0.5;
  }
  return ITEMS[key].slots;
}

/** The inventory of anything that has one: a soldier, or a body on the ground. */
export function invOf(carrier) {
  return carrier && carrier.inv ? carrier.inv : null;
}

/** A carrier's kit as a list, in the order it should be shown. */
export function itemsOf(carrier) {
  const inv = invOf(carrier);
  if (!inv) return [];
  const out = [];
  const push = (key, count, name, detail) => {
    if (!count) return;
    out.push({ key, count, name, detail, slots: slotsFor(key, inv) * (ITEMS[key].stack ? count : 1) });
  };
  if (inv.primary) push('weapon', 1, nameOf(inv.primary), `${WEAPONS[inv.primary]?.mag ?? 0} rounds a magazine`);
  push('mags', inv.mags, `${nameOf(inv.primary)} magazines`, 'only fits that weapon');
  push('grenades', inv.grenades, 'Hand grenades');
  if (inv.launcher) push('launcher', 1, nameOf(inv.launcher));
  push('rockets', inv.rockets, `${nameOf(inv.launcher) || 'Launcher'} rounds`, 'only fits that launcher');
  push('bandages', inv.bandages, 'Bandages', 'patches up a wounded man');
  push('mines', inv.mines, 'Anti-tank mines', 'lay one across a road');
  if (inv.repairKit) push('repairKit', 1, 'Repair kit', 'mends a track or an engine');
  if (inv.binoculars) push('binoculars', 1, 'Binoculars');
  return out;
}

/** Slots in use. */
export function loadOf(carrier) {
  return itemsOf(carrier).reduce((a, i) => a + i.slots, 0);
}

/**
 * Why a transfer is not allowed, or null if it is.
 *
 * The interesting rule is ammunition: magazines fit one weapon and rockets fit
 * one launcher, so a man who wants a dead machine gunner's ammunition has to
 * take the machine gun as well. That single rule is most of what makes looting
 * a decision rather than a formality.
 */
export function refuseTransfer(from, to, key, count = 1) {
  const a = invOf(from), b = invOf(to);
  if (!a || !b) return 'nothing to take from';
  if (from === to) return 'already carrying it';
  const held = key === 'weapon' ? (a.primary ? 1 : 0)
    : key === 'launcher' ? (a.launcher ? 1 : 0)
      : key === 'repairKit' || key === 'binoculars' ? (a[key] ? 1 : 0)
        : a[key] || 0;
  if (held < count) return 'not there any more';

  if (key === 'mags' && a.primary !== b.primary) return `those magazines do not fit a ${nameOf(b.primary)}`;
  if (key === 'rockets' && a.launcher !== b.launcher) {
    return b.launcher ? `those rounds do not fit a ${nameOf(b.launcher)}` : 'nothing to fire them from';
  }
  if (key === 'repairKit' && b.repairKit) return 'already carrying one';
  if (key === 'binoculars' && b.binoculars) return 'already carrying a pair';

  // Weapons swap rather than stack, and take their ammunition with them, so
  // what they cost is the difference between the two kits, not the whole load.
  if (key === 'weapon' || key === 'launcher') {
    const after = { ...b };
    if (key === 'weapon') { after.primary = a.primary; after.mags = a.mags; }
    else { after.launcher = a.launcher; after.rockets = a.rockets; }
    if (loadOf({ inv: after }) > CAPACITY) return 'no room for it';
    return null;
  }
  if (loadOf(to) + slotsFor(key, b) * count > CAPACITY) return 'no room for it';
  return null;
}

/**
 * Move kit from one carrier to another. Weapons swap: the one being replaced
 * goes back the other way with its ammunition, so nothing is destroyed and a
 * man never ends up empty-handed.
 *
 * Returns what happened, or null if the transfer was refused.
 */
export function transfer(from, to, key, count = 1) {
  if (refuseTransfer(from, to, key, count)) return null;
  const a = invOf(from), b = invOf(to);

  if (key === 'weapon') {
    const taken = a.primary, given = b.primary, givenMags = b.mags;
    b.primary = taken;
    b.mags = a.mags;
    b.rounds = WEAPONS[taken]?.mag ?? 0;
    a.primary = given;
    a.mags = givenMags;
    a.rounds = given ? (WEAPONS[given]?.mag ?? 0) : 0;
    return { key, name: nameOf(taken), swappedFor: given ? nameOf(given) : null };
  }
  if (key === 'launcher') {
    const taken = a.launcher, given = b.launcher, givenRockets = b.rockets;
    b.launcher = taken;
    b.rockets = a.rockets;
    a.launcher = given;
    a.rockets = given ? givenRockets : 0;
    return { key, name: nameOf(taken), swappedFor: given ? nameOf(given) : null };
  }
  if (key === 'repairKit' || key === 'binoculars') {
    a[key] = false;
    b[key] = true;
    return { key, name: key === 'repairKit' ? 'Repair kit' : 'Binoculars' };
  }
  a[key] -= count;
  b[key] = (b[key] || 0) + count;
  return { key, name: itemNameFor(key, b), count };
}

function itemNameFor(key, inv) {
  if (key === 'mags') return `${nameOf(inv.primary)} magazines`;
  if (key === 'rockets') return `${nameOf(inv.launcher)} rounds`;
  if (key === 'grenades') return 'grenades';
  return key;
}

/** Take everything that is legal to take, in the order a soldier would want it. */
export function takeAll(from, to) {
  const got = [];
  for (const item of itemsOf(from)) {
    // Weapons are a decision, not something to sweep up automatically.
    if (item.key === 'weapon' || item.key === 'launcher') continue;
    let n = item.count;
    while (n > 0 && refuseTransfer(from, to, item.key, 1) === null) {
      const r = transfer(from, to, item.key, 1);
      if (!r) break;
      n--;
      got.push(item.key);
    }
  }
  return got;
}

/** Bodies and crates a soldier could reach without moving far. */
export function lootablesNear(world, x, z, radius = 4) {
  const out = [];
  for (const c of world.corpses) {
    if (Math.hypot(c.x - x, c.z - z) > radius) continue;
    if (!itemsOf(c).length) continue;
    out.push(c);
  }
  return out;
}

/** The nearest body worth searching, for the pick-up order. */
export function nearestLoot(world, x, z, radius = 30) {
  let best = null, bestD = radius;
  for (const c of world.corpses) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD && itemsOf(c).length) { best = c; bestD = d; }
  }
  return best;
}

/** Is this thing something the inventory screen can show on its right-hand side? */
export function isContainer(e) {
  if (!e) return false;
  if (e.inv) return true;
  return e.kind === KIND.CRATE || e.kind === KIND.VEHICLE || e.kind === KIND.GUN;
}
