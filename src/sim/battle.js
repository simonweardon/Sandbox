// The battle: everything above the individual systems.
//
// Runs on a fixed 30 Hz step so the simulation is deterministic for a given
// seed regardless of frame rate, with projectiles sub-stepped because an 800
// m/s shell would otherwise skip straight over a tank between ticks.

import { World, populateScenery, fortifyFlags, KIND } from './world.js';
import { NavGrid } from './pathfinding.js';
import { stepMovement, issueOrder, ORDER } from './orders.js';
import { stepCombat } from './combat.js';
import { stepProjectiles } from './ballistics.js';
import { stepVision } from './vision.js';
import { stepAttrition } from './damage.js';
import { stepCapture, scoreLine } from './capture.js';
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
    this.world = new World(this.size, this.seed);
    populateScenery(this.world);

    this.sides = {};
    for (const side of [this.playerSide, this.enemySide]) {
      this.sides[side] = { mp: opts.startMp ?? 380, mpCap: 2200, income: 0, losses: 0, kills: 0 };
    }

    this.layFlags();
    fortifyFlags(this.world);
    this.nav = new NavGrid(this.world);

    this.accumulator = 0;
    this.time = 0;
    this.paused = false;
    this.speed = 1;
    this.over = null;

    this.ai = new Commander(this, this.enemySide);
    this.deployStarting(opts);
  }

  sideName(side) { return FACTIONS[side]?.name ?? side; }

  /** Five flags down the middle of the map, one line of contest. */
  layFlags() {
    const S = this.size, w = this.world;
    const names = ['Bridgehead', 'The Farm', 'Crossroads', 'The Mill', 'Rail Halt'];
    const lay = [
      { u: 0.5, v: 0.14, owner: this.playerSide },
      { u: 0.26, v: 0.36, owner: 'neu' },
      { u: 0.52, v: 0.5, owner: 'neu' },
      { u: 0.74, v: 0.64, owner: 'neu' },
      { u: 0.5, v: 0.86, owner: this.enemySide },
    ];
    lay.forEach((f, i) => w.addFlag(f.u * S, f.v * S, f.owner, names[i], i === 2 ? 26 : 22));
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
      vehicles: calls.vehicles.map(entry).filter(Boolean),
    };
  }

  /** Spend manpower on a squad, gun or vehicle. Returns what arrived. */
  purchase(side, key, x, z) {
    const purse = this.sides[side];
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

  deployStarting(opts) {
    const S = this.size, w = this.world;
    const p = this.playerSide, e = this.enemySide;
    const pCalls = FACTIONS[p].calls, eCalls = FACTIONS[e].calls;

    const place = (side, key, x, z) => {
      const saved = this.sides[side].mp;
      this.sides[side].mp = 1e9;
      const r = this.purchase(side, key, x, z);
      this.sides[side].mp = saved;
      return r;
    };

    // The player opens with two rifle squads, an AT gun and a medium tank.
    place(p, pCalls.infantry[0], S * 0.42, S * 0.12);
    place(p, pCalls.infantry[0], S * 0.58, S * 0.12);
    place(p, pCalls.support[0], S * 0.5, S * 0.09);
    place(p, pCalls.vehicles[1] ?? pCalls.vehicles[0], S * 0.46, S * 0.08);

    // The enemy opens with the same weight of force.
    place(e, eCalls.infantry[0], S * 0.42, S * 0.88);
    place(e, eCalls.infantry[0], S * 0.58, S * 0.88);
    place(e, eCalls.support[0], S * 0.5, S * 0.91);
    place(e, eCalls.vehicles[2] ?? eCalls.vehicles[0], S * 0.54, S * 0.92);

    w.log.length = 0;
    w.logLine('Battle begins. Take and hold the objectives.', 'flag');
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
    stepCapture(this, dt);
    this.ai.step(dt);
    this.checkVictory();
  }

  checkVictory() {
    if (this.over) return;
    const counts = scoreLine(this);
    for (const side of Object.keys(this.sides)) {
      if ((counts[side] || 0) === this.world.flags.length) {
        this.over = { winner: side, reason: 'all objectives held' };
        this.world.logLine(`${this.sideName(side)} holds every objective — battle won`, 'flag');
      }
    }
  }

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
