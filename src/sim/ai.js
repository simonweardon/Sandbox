// The opposing commander.
//
// It is not clever, but it does the things that make a battle feel like one:
// it spends manpower on what it is short of, sends infantry to take flags and
// armour to where the enemy armour is, keeps anti-tank guns pointing at the
// approaches, and pulls broken squads back rather than feeding them in.

import { KIND } from './world.js';
import { ORDER, issueOrder } from './orders.js';
import { makeSquad, makeVehicle, makeGun, makeSoldier, boardVehicle, STANCE } from './units.js';
import { SQUADS } from '../data/infantry.js';
import { VEHICLES, GUNS } from '../data/vehicles.js';
import { FACTIONS } from '../data/factions.js';
import { visibleTo } from './vision.js';
import { isGarrisonable, garrisonCount, buildingAt } from './garrison.js';
import { ORDER as O } from './orders.js';
import { roll } from '../core/rng.js';
import { clamp, dist } from '../core/util.js';

export class Commander {
  constructor(battle, side) {
    this.battle = battle;
    this.side = side;
    this.thinkTimer = 2 + roll() * 2;
    this.spendTimer = 6;
    this.groups = [];
  }

  step(dt) {
    this.thinkTimer -= dt;
    this.spendTimer -= dt;
    if (this.spendTimer <= 0) { this.spendTimer = 9 + roll() * 6; this.spend(); }
    if (this.thinkTimer <= 0) { this.thinkTimer = 3 + roll() * 2; this.think(); }
  }

  get purse() { return this.battle.sides[this.side]; }

  own(kind) {
    return this.battle.world.entities.filter((e) => e.faction === this.side && e.kind === kind);
  }

  /** Buy what the situation is short of. */
  spend() {
    const b = this.battle, purse = this.purse;
    const calls = FACTIONS[this.side].calls;
    const infantry = this.own(KIND.SOLDIER).filter((s) => !s.inVehicle).length;
    const armour = this.own(KIND.VEHICLE).filter((v) => !v.destroyed && !v.abandoned && v.def.cls !== 'truck').length;
    const enemyArmour = b.world.entities.filter((e) =>
      e.kind === KIND.VEHICLE && e.faction !== this.side && !e.destroyed && e.def.cls !== 'truck'
      && visibleTo(b.world, e, this.side)).length;

    const support = this.own(KIND.GUN).filter((g) => !g.destroyed).length;

    // Buy against a target order of battle rather than whatever is affordable:
    // roughly a company of infantry, a troop of armour, and a couple of guns.
    // Whichever is furthest below strength gets the money.
    const wants = [
      { pool: 'infantry', list: calls.infantry, need: (28 - infantry) / 28 },
      { pool: 'vehicles', list: calls.vehicles, need: (5 - armour) / 5 + (enemyArmour - armour) * 0.3 },
      { pool: 'support', list: calls.support, need: (3 - support) / 3 },
    ];
    for (const w of wants) w.need += roll() * 0.25;
    wants.sort((a, b2) => b2.need - a.need);
    const want = wants[0];
    if (want.need <= 0) return;                 // up to strength; hold the money

    // Take the best thing in that category that is affordable.
    const owned = {};
    for (const v of this.own(KIND.VEHICLE)) {
      if (!v.destroyed && !v.abandoned) owned[v.def.cls] = (owned[v.def.cls] || 0) + 1;
    }
    const all = want.list.map((key) => {
      const def = SQUADS[key] || VEHICLES[key] || GUNS[key];
      return { key, cost: def?.cost ?? 9999, cls: VEHICLES[key]?.cls };
    });
    // Two lorries is plenty; a third is not what the front line needs.
    const eligible = all.filter((c) => !(c.cls === 'truck' && (owned.truck || 0) >= 2));
    const priced = eligible.filter((c) => c.cost <= purse.mp).sort((a, b2) => b2.cost - a.cost);
    if (!priced.length) return;

    // Saving up for something that matters beats spending on whatever happens
    // to be affordable right now.
    const dearest = Math.max(...eligible.map((c) => c.cost));
    if (priced[0].cost < dearest * 0.45 && purse.mp < dearest && roll() < 0.7) return;

    // Not always the most expensive thing — some variety keeps it interesting.
    const pick = priced[roll() < 0.6 ? 0 : Math.min(priced.length - 1, 1 + (roll() * 2 | 0))];
    const spawn = this.battle.spawnPointFor(this.side);
    const bought = this.battle.purchase(this.side, pick.key, spawn.x, spawn.z);
    if (bought) this.assign(bought);
  }

  /** Give a newly bought formation something to do. */
  assign(bought) {
    const b = this.battle;
    const target = this.chooseObjective(bought);
    if (!target) return;
    if (bought.members) {
      for (const m of bought.members) {
        issueOrder(b, m, { type: ORDER.ATTACK_MOVE, x: target.x + (roll() - 0.5) * 14, z: target.z + (roll() - 0.5) * 14 });
      }
      this.groups.push({ units: bought.members, objective: target, kind: 'infantry' });
    } else if (bought.kind === KIND.VEHICLE) {
      issueOrder(b, bought, { type: ORDER.ATTACK_MOVE, x: target.x + (roll() - 0.5) * 20, z: target.z + (roll() - 0.5) * 20 });
      this.groups.push({ units: [bought], objective: target, kind: 'armour' });
    } else if (bought.kind === KIND.GUN) {
      // Guns stay near home, covering the approach to the nearest held flag.
      this.groups.push({ units: [bought], objective: target, kind: 'gun' });
    }
  }

  chooseObjective(bought) {
    const b = this.battle, world = b.world;
    const home = b.spawnPointFor(this.side);
    const wanted = world.flags.filter((f) => f.owner !== this.side);
    const list = wanted.length ? wanted : world.flags;
    if (!list.length) return null;
    // Prefer contested or neutral flags, and ones that are close to home.
    let best = null, bestScore = -Infinity;
    for (const f of list) {
      let s = -dist(home.x, home.z, f.x, f.z) / 100;
      if (f.owner === 'neu') s += 1.2;
      if (f.contestedBy === this.side) s += 0.8;
      if (f.owner !== this.side && f.owner !== 'neu') s += 0.4;
      s += roll() * 0.5;
      if (s > bestScore) { bestScore = s; best = f; }
    }
    return best;
  }

  /** A building overlooking the objective that still has room in it. */
  buildingNear(flag, u) {
    const world = this.battle.world;
    let best = null, bestScore = Infinity;
    for (const p of world.propsNearPoint(flag.x, flag.z, flag.radius + 34)) {
      if (!isGarrisonable(p)) continue;
      if (garrisonCount(world, p) >= p.capacity) continue;
      const d = dist(p.x, p.z, flag.x, flag.z) + dist(p.x, p.z, u.x, u.z) * 0.4;
      if (d < bestScore) { bestScore = d; best = p; }
    }
    return best;
  }

  /**
   * Take charge of anything of ours that nobody is commanding — in particular
   * the force we started the battle with, which is created before the first
   * purchase and would otherwise stand at the start line for the whole game.
   */
  adopt() {
    const b = this.battle;
    const held = new Set();
    for (const g of this.groups) for (const u of g.units) held.add(u.id);
    const loose = b.world.entities.filter((e) => e.faction === this.side
      && e.id !== undefined && !held.has(e.id)
      && (e.kind === KIND.SOLDIER ? !e.inVehicle : true)
      && e.kind !== KIND.PROP
      && !(e.kind === KIND.VEHICLE && (e.destroyed || e.abandoned))
      && !(e.kind === KIND.GUN && e.destroyed));
    if (!loose.length) return;

    // Group them by what they are, so infantry and armour get their own tasks.
    const foot = loose.filter((e) => e.kind === KIND.SOLDIER);
    const armour = loose.filter((e) => e.kind === KIND.VEHICLE);
    const guns = loose.filter((e) => e.kind === KIND.GUN);
    for (const [units, kind] of [[foot, 'infantry'], [armour, 'armour'], [guns, 'gun']]) {
      if (!units.length) continue;
      const objective = this.chooseObjective({ units });
      this.groups.push({ units, objective, kind });
      if (kind === 'gun' || !objective) continue;
      for (const u of units) {
        issueOrder(b, u, {
          type: ORDER.ATTACK_MOVE,
          x: objective.x + (roll() - 0.5) * 20, z: objective.z + (roll() - 0.5) * 20,
        });
      }
    }
  }

  /** Keep the groups moving, and pull back the ones that are spent. */
  think() {
    const b = this.battle, world = b.world;
    this.adopt();
    this.groups = this.groups.filter((g) => {
      g.units = g.units.filter((u) => u.alive && !(u.kind === KIND.VEHICLE && (u.destroyed || u.abandoned)) && !u.destroyed);
      return g.units.length > 0;
    });

    for (const g of this.groups) {
      // Objective taken, or lost — find another. Part of the group stays to
      // hold what was just won, because ground nobody is standing on is ground
      // you have not taken.
      if (!g.objective || g.objective.owner === this.side) {
        if (!g.holdAssigned) {
          g.holdAssigned = true;
          const keep = Math.max(1, Math.round(g.units.length * 0.4));
          g.units.slice(0, keep).forEach((u) => { u.holdHere = g.objective; });
        }
        const next = this.chooseObjective(g);
        if (!next || next === g.objective) continue;
        g.objective = next;
        g.holdAssigned = false;
        for (const u of g.units) {
          if (u.kind === KIND.GUN || u.holdHere) continue;
          issueOrder(b, u, { type: ORDER.ATTACK_MOVE, x: next.x + (roll() - 0.5) * 16, z: next.z + (roll() - 0.5) * 16 });
        }
        continue;
      }

      for (const u of g.units) {
        if (u.kind === KIND.GUN) continue;
        const near = dist(u.x, u.z, g.objective.x, g.objective.z) < g.objective.radius * 1.2;
        // On a map with buildings, holding ground means holding the buildings
        // overlooking it, not standing in the open beside the flag.
        const holding = u.holdHere || near;
        if (holding && u.kind === KIND.SOLDIER && u.garrison == null
            && u.state !== 'entering' && roll() < (u.holdHere ? 0.9 : 0.5)) {
          const house = this.buildingNear(u.holdHere || g.objective, u);
          if (house) {
            issueOrder(b, u, { type: O.GARRISON, propId: house.id, x: house.x, z: house.z });
            continue;
          }
        }
        if (u.holdHere && u.garrison != null) continue;   // he is in position
        if (near && u.orders.length === 0 && u.garrison == null) {
          issueOrder(b, u, { type: ORDER.CAPTURE, x: g.objective.x + (roll() - 0.5) * 10, z: g.objective.z + (roll() - 0.5) * 10 });
        } else if (!near && u.orders.length === 0 && u.garrison == null) {
          issueOrder(b, u, { type: ORDER.ATTACK_MOVE, x: g.objective.x + (roll() - 0.5) * 16, z: g.objective.z + (roll() - 0.5) * 16 });
        }
        // Men under fire get down; men who are safe get up and move.
        if (u.kind === KIND.SOLDIER && u.garrison == null) {
          if (u.suppression > 0.5) u.stance = u.suppression > 0.9 ? 2 : 1;
          else if (u.stance !== 0 && u.orders.length && roll() < 0.6) u.stance = 0;
        }
      }
    }

    // Crew any gun that has lost its crew, from the nearest spare infantry.
    for (const gun of this.own(KIND.GUN)) {
      if (gun.destroyed || gun.manned) continue;
      const spare = world.near(gun.x, gun.z, 70, (e) =>
        e.kind === KIND.SOLDIER && e.faction === this.side && !e.inVehicle && e.orders.length === 0);
      for (const s of spare.slice(0, 3)) {
        issueOrder(b, s, { type: ORDER.MOVE, x: gun.x + (roll() - 0.5) * 3, z: gun.z + (roll() - 0.5) * 3 });
      }
    }
  }
}
