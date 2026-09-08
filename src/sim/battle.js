// The battle: everything above the individual systems.
//
// Runs on a fixed 30 Hz step so the simulation is deterministic for a given
// seed regardless of frame rate, with projectiles sub-stepped because an 800
// m/s shell would otherwise skip straight over a tank between ticks.

import { World, fortifyFlags, KIND } from './world.js';
import { MAPS, DEFAULT_MAP } from './maps.js';
import { NavGrid } from './pathfinding.js';
import { stepMovement, issueOrder, ORDER } from './orders.js';
import { stepCombat } from './combat.js';
import { stepProjectiles } from './ballistics.js';
import { stepVision } from './vision.js';
import { stepAttrition } from './damage.js';
import { stepCapture, scoreLine } from './capture.js';
import { stepSupply, makeCrate, CRATE } from './supply.js';
import { Commander } from './ai.js';
import { makeSquad, makeVehicle, makeGun, makeSoldier, boardVehicle } from './units.js';
import { SQUADS } from '../data/infantry.js';
import { VEHICLES, GUNS } from '../data/vehicles.js';
import { FACTIONS } from '../data/factions.js';
import { reseed, roll } from '../core/rng.js';
import { clamp, dist } from '../core/util.js';

export const TICK = 1 / 30;
const PROJECTILE_SUBSTEPS = 8;

export class Battle {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 20240607;
    this.size = opts.size ?? 512;
    this.playerSide = opts.player ?? 'sov';
    this.enemySide = opts.enemy ?? 'ger';
    this.mapKey = MAPS[opts.map] ? opts.map : DEFAULT_MAP;
    this.map = MAPS[this.mapKey];
    this.world = new World(this.size, this.seed, this.map.terrain);
    this.map.build(this.world);

    this.sides = {};
    for (const side of [this.playerSide, this.enemySide]) {
      this.sides[side] = { mp: opts.startMp ?? 380, mpCap: 2200, income: 0, losses: 0, kills: 0 };
    }

    this.layFlags();
    fortifyFlags(this.world);
    this.nav = new NavGrid(this.world);

    this.accumulator = 0;
    this.time = 0;
    // A battle has to be able to end. Sweeping every objective wins it
    // outright, but a city fight where both sides are dug into buildings can
    // grind for ever, so there is also a clock and a decision on points.
    this.timeLimit = opts.timeLimit ?? 30 * 60;
    this.paused = false;
    this.speed = 1;
    this.over = null;

    this.ai = new Commander(this, this.enemySide);
    this.deployStarting(opts);
  }

  sideName(side) { return FACTIONS[side]?.name ?? side; }

  /** Five objectives down the middle of the map, one line of contest. */
  layFlags() {
    const S = this.size, w = this.world;
    const lay = this.map.flags;
    lay.forEach((f, i) => {
      const owner = i === 0 ? this.playerSide : (i === lay.length - 1 ? this.enemySide : 'neu');
      w.addFlag(f.u * S, f.v * S, owner, f.name, f.r ?? 22);
    });
  }

  spawnPointFor(side) {
    const S = this.size;
    const z = side === this.playerSide ? S * 0.06 : S * 0.94;
    return { x: S * 0.5 + (roll() - 0.5) * S * 0.3, z };
  }

  /** What a side can call in, with prices, for the reinforcement panel. */
  callList(side) {
    const calls = FACTIONS[side].calls;
    const entry = (key) => {
      const d = SQUADS[key] || VEHICLES[key] || GUNS[key];
      return d && { key, name: d.name, cost: d.cost, cls: SQUADS[key] ? 'squad' : (VEHICLES[key] ? VEHICLES[key].cls : d.cls) };
    };
    return {
      infantry: calls.infantry.map(entry).filter(Boolean),
      support: calls.support.map(entry).filter(Boolean),
      supply: [{ key: 'crate', name: CRATE.name, cost: CRATE.cost, cls: 'crate' }],
      vehicles: calls.vehicles.map(entry).filter(Boolean),
    };
  }

  /** Spend manpower on a squad, gun or vehicle. Returns what arrived. */
  purchase(side, key, x, z) {
    const purse = this.sides[side];
    if (key === 'crate') {
      if (purse.mp < CRATE.cost) return null;
      purse.mp -= CRATE.cost;
      this.world.logLine(`${this.sideName(side)}: ammunition dropped`, 'reinforce');
      return makeCrate(this.world, side, x, z);
    }
    const def = SQUADS[key] || VEHICLES[key] || GUNS[key];
    if (!def || purse.mp < def.cost) return null;
    purse.mp -= def.cost;

    if (SQUADS[key]) {
      const sq = makeSquad(this.world, side, key, x, z);
      this.world.logLine(`${this.sideName(side)}: ${def.name} arrives`, 'reinforce');
      return sq;
    }
    if (VEHICLES[key]) {
      const yaw = side === this.playerSide ? 0 : Math.PI;
      const v = makeVehicle(this.world, side, key, x, z, yaw);
      // Vehicles arrive crewed.
      for (const role of v.def.crew) {
        const s = makeSoldier(this.world, side, 'crew', x, z);
        boardVehicle(this.world, s, v);
      }
      this.world.logLine(`${this.sideName(side)}: ${def.name} arrives`, 'reinforce');
      return v;
    }
    const g = makeGun(this.world, side, key, x, z, side === this.playerSide ? 0 : Math.PI);
    for (let i = 0; i < Math.min(3, def.crew); i++) {
      makeSoldier(this.world, side, 'crew', x + (roll() - 0.5) * 3, z + (roll() - 0.5) * 3);
    }
    this.world.logLine(`${this.sideName(side)}: ${def.name} arrives`, 'reinforce');
    return g;
  }

  /**
   * Open ground near a point: a starting force that spawns inside an apartment
   * block on the city map is no use to anybody.
   */
  openGroundNear(x, z, tank = false) {
    const T = this.world.terrain;
    if (T.inBounds(x, z) && this.nav.passable(x, z, tank)) return { x, z };
    for (let r = 6; r <= 90; r += 6) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + r;
        const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
        if (T.inBounds(nx, nz) && this.nav.passable(nx, nz, tank)) return { x: nx, z: nz };
      }
    }
    return { x, z };
  }

  deployStarting(opts) {
    const S = this.size, w = this.world;
    const p = this.playerSide, e = this.enemySide;
    const pCalls = FACTIONS[p].calls, eCalls = FACTIONS[e].calls;

    const place = (side, key, x, z) => {
      const tank = !!VEHICLES[key];
      const at = this.openGroundNear(x, z, tank);
      const saved = this.sides[side].mp;
      this.sides[side].mp = 1e9;
      const r = this.purchase(side, key, at.x, at.z);
      this.sides[side].mp = saved;
      return r;
    };

    // Both sides open with the same weight: a rifle squad, a section of
    // riflemen beside it, a gun and a tank. Enough to be doing something with
    // from the first second rather than waiting on the first purchase.
    const deploy = (side, calls, z, front) => {
      place(side, calls.infantry[0], S * 0.42, z);
      // A second squad, so there are always well over five rifles on the field.
      place(side, calls.infantry[0], S * 0.58, z);
      place(side, calls.support[0], S * 0.5, front);
      place(side, calls.vehicles[1] ?? calls.vehicles[0], S * 0.46, front);
    };
    deploy(p, pCalls, S * 0.12, S * 0.08);
    deploy(e, eCalls, S * 0.88, S * 0.92);

    w.log.length = 0;
    w.logLine('Battle begins. Take and hold the objectives.', 'flag');
    w.logLine('Taking an objective for the first time pays a bonus.', 'info');
  }

  // ---- the loop ---------------------------------------------------------

  /** Advance by real elapsed time, running as many fixed steps as needed. */
  advance(realDt) {
    if (this.paused || this.over) return 0;
    this.accumulator += Math.min(realDt, 0.25) * this.speed;
    let steps = 0;
    while (this.accumulator >= TICK && steps < 8) {
      this.step(TICK);
      this.accumulator -= TICK;
      steps++;
    }
    return steps;
  }

  step(dt) {
    const w = this.world;
    w.time += dt;
    w.tick++;
    this.time += dt;

    w.rebuildHash();
    stepVision(w, dt);
    stepMovement(this, dt);
    stepCombat(this, dt);
    const sub = dt / PROJECTILE_SUBSTEPS;
    for (let i = 0; i < PROJECTILE_SUBSTEPS && w.projectiles.length; i++) stepProjectiles(w, sub);
    stepAttrition(w, dt);
    stepSupply(this, dt);
    stepCapture(this, dt);
    this.ai.step(dt);
    this.checkVictory();
  }

  checkVictory() {
    if (this.over) return;
    const counts = scoreLine(this);
    const sides = Object.keys(this.sides);

    // Outright: every objective in one side's hands.
    for (const side of sides) {
      if ((counts[side] || 0) === this.world.flags.length) {
        this.finish(side, 'holds every objective');
        return;
      }
    }

    // Spent: nothing left on the field and no manpower to bring anything back.
    const cheapest = Math.min(...Object.values(this.callList(sides[0]))
      .flat().map((c) => c.cost));
    for (const side of sides) {
      const left = this.world.entities.some((e) => e.faction === side
        && !(e.kind === KIND.VEHICLE && (e.destroyed || e.abandoned))
        && !(e.kind === KIND.GUN && e.destroyed));
      if (!left && this.sides[side].mp < cheapest) {
        this.finish(sides.find((o) => o !== side), 'has broken the opposition');
        return;
      }
    }

    // On points, when the clock runs out.
    if (this.time >= this.timeLimit) {
      const ranked = sides.slice().sort((a, b) => {
        const d = (counts[b] || 0) - (counts[a] || 0);
        if (d) return d;
        // Level on ground: the side that cost the other more wins.
        return this.world.corpses.filter((c) => c.faction === a).length
          - this.world.corpses.filter((c) => c.faction === b).length;
      });
      const [win, lose] = ranked;
      const drawn = (counts[win] || 0) === (counts[lose] || 0);
      this.finish(win, drawn ? 'holds the field on casualties' : 'holds more ground when time is called');
    }
  }

  finish(winner, reason) {
    this.over = { winner, reason };
    this.world.logLine(`${this.sideName(winner)} ${reason} — battle over`, 'flag');
  }

  /** Seconds left before the battle is decided on points. */
  get timeLeft() { return Math.max(0, this.timeLimit - this.time); }

  // ---- queries the interface needs --------------------------------------

  selectableAt(x, z, side, radius = 3) {
    return this.world.near(x, z, radius, (e) =>
      e.faction === side && e.kind !== KIND.PROP && !(e.kind === KIND.SOLDIER && e.inVehicle));
  }

  stats() {
    return {
      time: this.time,
      flags: scoreLine(this),
      sides: this.sides,
      units: this.world.entities.length,
      projectiles: this.world.projectiles.length,
    };
  }
}
