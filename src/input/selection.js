// Selecting units and giving them orders.

import * as THREE from '../../vendor/three.module.js';
import { KIND } from '../sim/world.js';
import { ORDER, issueOrder } from '../sim/orders.js';
import { canRepair, canHeal, canMine, damageOn, needsHelp } from '../sim/fieldwork.js';
import { orderGroundFire } from '../sim/combat.js';
import { nearestLoot, itemsOf } from '../sim/inventory.js';
import { visibleTo } from '../sim/vision.js';
import { STANCE } from '../sim/units.js';
import { dist } from '../core/util.js';
import { buildingAt, isGarrisonable, leaveBuilding } from '../sim/garrison.js';

export class Selection {
  constructor(battle, rig, canvas) {
    this.battle = battle;
    this.rig = rig;
    this.canvas = canvas;
    this.units = [];
    this.groups = new Map();
    this.dragStart = null;
    this.dragNow = null;
    this.hover = null;
  }

  get side() { return this.battle.playerSide; }

  clear() {
    for (const u of this.units) u.selected = false;
    this.units.length = 0;
  }

  set(list) {
    this.clear();
    for (const u of list) { u.selected = true; this.units.push(u); }
  }

  add(list) {
    for (const u of list) {
      if (this.units.includes(u)) continue;
      u.selected = true;
      this.units.push(u);
    }
  }

  prune() {
    this.units = this.units.filter((u) =>
      u.alive && !(u.kind === KIND.VEHICLE && u.destroyed) && !(u.kind === KIND.GUN && u.destroyed));
  }

  /** Project every friendly unit and pick the ones inside the drag rectangle. */
  boxSelect(a, b, additive) {
    const cam = this.rig.cam;
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    const v = new THREE.Vector3();
    const found = [];
    for (const e of this.battle.world.entities) {
      if (e.faction !== this.side) continue;
      if (e.kind === KIND.SOLDIER && e.inVehicle) continue;
      if (e.kind === KIND.VEHICLE && e.destroyed) continue;
      v.set(e.x, (e.y ?? 0) + 0.9, e.z).project(cam);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * this.canvas.clientWidth;
      const sy = (-v.y * 0.5 + 0.5) * this.canvas.clientHeight;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) found.push(e);
    }
    // A box that catches infantry should not also drag in every tank behind it.
    const infantry = found.filter((e) => e.kind === KIND.SOLDIER);
    const picked = infantry.length && found.length > infantry.length ? found : found;
    if (additive) this.add(picked); else this.set(picked);
  }

  /** The single unit under the cursor, if any. */
  pick(ndcX, ndcY) {
    const cam = this.rig.cam;
    const v = new THREE.Vector3();
    let best = null, bestD = 0.045;
    for (const e of this.battle.world.entities) {
      if (e.kind === KIND.SOLDIER && e.inVehicle) continue;
      if (!visibleTo(this.battle.world, e, this.side)) continue;
      v.set(e.x, (e.y ?? 0) + 0.9, e.z).project(cam);
      if (v.z > 1) continue;
      const d = Math.hypot(v.x - ndcX, v.y - ndcY);
      const reach = e.kind === KIND.VEHICLE ? 0.075 : 0.04;
      if (d < reach && (best === null || d < bestD)) { best = e; bestD = d; }
    }
    return best;
  }

  /** Everything of yours that is on its feet — the "select my army" button. */
  selectAll(kinds = null) {
    const list = this.battle.world.entities.filter((e) => e.faction === this.side
      && !(e.kind === KIND.SOLDIER && e.inVehicle)
      && !(e.kind === KIND.VEHICLE && (e.destroyed || e.abandoned))
      && !(e.kind === KIND.GUN && e.destroyed)
      && (!kinds || kinds.includes(e.kind)));
    this.set(list);
    return list.length;
  }

  selectSameType(unit) {
    const list = this.battle.world.entities.filter((e) =>
      e.faction === this.side && e.kind === unit.kind &&
      (e.type ?? e.role) === (unit.type ?? unit.role) &&
      !(e.kind === KIND.SOLDIER && e.inVehicle));
    this.set(list);
  }

  selectSquad(unit) {
    if (unit.kind !== KIND.SOLDIER || !unit.squad) return this.set([unit]);
    this.set(this.battle.world.entities.filter((e) =>
      e.kind === KIND.SOLDIER && e.squad === unit.squad && !e.inVehicle));
  }

  // ---- orders -----------------------------------------------------------

  /**
   * A right-click means different things depending on what is under it:
   * ground is a move, an enemy is an attack, a friendly vehicle is "get in".
   */
  order(point, target, opts = {}) {
    if (!this.units.length) return null;
    const b = this.battle;
    const queue = !!opts.queue;
    let label = null;

    if (target && target.faction !== this.side) {
      for (const u of this.units) {
        issueOrder(b, u, { type: ORDER.ATTACK, targetId: target.id, x: target.x, z: target.z }, queue);
        u.target = target;
        u.holdFire = false;
      }
      label = 'attack';
    } else if (target && target.kind === KIND.VEHICLE && target.faction === this.side) {
      // A friendly tank with a track off, and somebody who can mend it: that
      // is a repair job, not an order to climb aboard. Holding Ctrl still
      // crews it, so the old behaviour is one modifier away.
      const menders = opts.asCrew ? [] : this.units.filter((u) => canRepair(u));
      if (menders.length && damageOn(target)) {
        for (const u of menders) issueOrder(b, u, { type: ORDER.REPAIR, targetId: target.id }, queue);
        for (const u of this.units) {
          if (menders.includes(u) || u.kind !== KIND.SOLDIER) continue;
          issueOrder(b, u, { type: ORDER.BOARD, vehicleId: target.id, asCrew: !!opts.asCrew }, queue);
        }
        label = 'repair';
      } else {
        for (const u of this.units) {
          if (u.kind !== KIND.SOLDIER) continue;
          issueOrder(b, u, { type: ORDER.BOARD, vehicleId: target.id, asCrew: !!opts.asCrew }, queue);
        }
        label = 'board';
      }
    } else if (target && target.kind === KIND.SOLDIER && target.faction === this.side
               && needsHelp(target) && this.units.some((u) => canHeal(u))) {
      for (const u of this.units) {
        if (!canHeal(u) || u === target) continue;
        issueOrder(b, u, { type: ORDER.HEAL, targetId: target.id }, queue);
      }
      label = 'first aid';
    } else {
      // A building under the cursor is an order to occupy it, not to walk into
      // the wall — which is the whole of city fighting.
      const building = opts.attackMove ? null : buildingAt(b.world, point.x, point.z, 1.5);
      const infantry = this.units.filter((u) => u.kind === KIND.SOLDIER);
      if (building && infantry.length) {
        for (const u of infantry) {
          issueOrder(b, u, { type: ORDER.GARRISON, propId: building.id, x: point.x, z: point.z }, queue);
        }
        // Anything that cannot go indoors still moves up to it.
        for (const u of this.units) {
          if (u.kind === KIND.SOLDIER) continue;
          issueOrder(b, u, { type: ORDER.MOVE, x: point.x, z: point.z }, queue);
        }
        return 'garrison';
      }

      const flag = b.world.flags.find((f) => dist(f.x, f.z, point.x, point.z) < f.radius);
      const formation = this.formationOffsets(this.units.length);
      this.units.forEach((u, i) => {
        const o = formation[i];
        const type = opts.attackMove ? ORDER.ATTACK_MOVE : (flag ? ORDER.CAPTURE : ORDER.MOVE);
        issueOrder(b, u, { type, x: point.x + o.x, z: point.z + o.z }, queue);
      });
      label = opts.attackMove ? 'attack-move' : (flag ? 'capture' : 'move');
    }
    return label;
  }

  /** Spread a group out rather than sending everyone to the same square metre. */
  formationOffsets(n) {
    const out = [];
    const cols = Math.ceil(Math.sqrt(n));
    const gap = 3.4;
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = (i / cols) | 0;
      out.push({ x: (c - (cols - 1) / 2) * gap, z: (r - (Math.ceil(n / cols) - 1) / 2) * gap });
    }
    return out;
  }

  /** Send whoever can dig one in to lay a mine on that spot. */
  layMine(point, queue = false) {
    const layers = this.units.filter((u) => canMine(u));
    if (!layers.length) return null;
    issueOrder(this.battle, layers[0], { type: ORDER.MINE, x: point.x, z: point.z }, queue);
    return 'mine';
  }

  /** Search the nearest body. Somebody has to walk over to it. */
  loot(queue = false) {
    const world = this.battle.world;
    let sent = 0;
    for (const u of this.units) {
      if (u.kind !== KIND.SOLDIER || u.inVehicle) continue;
      const body = nearestLoot(world, u.x, u.z, 40);
      if (!body) continue;
      issueOrder(this.battle, u, { type: ORDER.LOOT, x: body.x, z: body.z, body }, queue);
      sent++;
    }
    return sent;
  }

  /** Repair the nearest damaged friendly vehicle, without having to click it. */
  repairNearest(queue = false) {
    const world = this.battle.world;
    let sent = 0;
    for (const u of this.units) {
      if (!canRepair(u)) continue;
      let best = null, bestD = 60;
      for (const v of world.entities) {
        if (v.kind !== KIND.VEHICLE || v.faction !== this.side || !damageOn(v)) continue;
        const d = dist(u.x, u.z, v.x, v.z);
        if (d < bestD) { best = v; bestD = d; }
      }
      if (!best) continue;
      issueOrder(this.battle, u, { type: ORDER.REPAIR, targetId: best.id }, queue);
      sent++;
    }
    return sent;
  }

  /**
   * Shell a patch of ground. Only things with a cannon can: a rifleman firing
   * at bare earth is not a tactic, and a button that pretends otherwise is
   * worse than no button.
   */
  attackGround(point) {
    let n = 0;
    for (const u of this.units) {
      if (orderGroundFire(u, point.x, point.z, 4)) n++;
    }
    return n;
  }

/**
   * What a right-click here would do, as a single word.
   *
   * The cursor is the game's only chance to say "this click will put your men
   * in that building" before you make it. Without it every click is a guess,
   * and a right-click that does something you did not expect costs a squad.
   */
  intentAt(point, target) {
    if (!this.units.length) return 'none';
    if (target && target.faction !== this.side) return 'attack';
    if (target && target.kind === KIND.VEHICLE && target.faction === this.side) {
      return this.units.some((u) => canRepair(u)) && damageOn(target) ? 'repair' : 'board';
    }
    if (target && target.kind === KIND.SOLDIER && target.faction === this.side
        && needsHelp(target) && this.units.some((u) => canHeal(u))) return 'heal';
    if (!point) return 'move';
    if (this.units.some((u) => u.kind === KIND.SOLDIER)
        && isGarrisonable(buildingAt(this.battle.world, point.x, point.z, 1.5))) return 'garrison';
    if (this.battle.world.flags.some((f) => dist(f.x, f.z, point.x, point.z) < f.radius)) return 'capture';
    return 'move';
  }

  setStance(stance) {
    for (const u of this.units) if (u.kind === KIND.SOLDIER) u.stance = stance;
  }

  toggleHoldFire() {
    const any = this.units.some((u) => !u.holdFire);
    for (const u of this.units) { u.holdFire = any; if (any) u.target = null; }
    return any;
  }

  /** Turn everybody selected out of whatever they are inside. */
  dismount() {
    let n = 0;
    for (const u of this.units) {
      if (u.kind === KIND.SOLDIER && u.garrison != null) { leaveBuilding(this.battle.world, u); n++; }
    }
    return n;
  }

  stop() {
    for (const u of this.units) {
      u.orders.length = 0;
      u.path = [];
      u.pathIndex = 0;
      u.state = 'idle';
    }
  }

  saveGroup(n) { this.groups.set(n, [...this.units]); }

  recallGroup(n) {
    const g = this.groups.get(n);
    if (!g) return false;
    this.set(g.filter((u) => u.alive));
    return this.units.length > 0;
  }
}
