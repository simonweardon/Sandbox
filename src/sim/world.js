// The world: everything the simulation owns.
//
// Entities live in flat arrays with a spatial hash over them, because almost
// every question the game asks is "what is near this point" — who can see whom,
// what did that shell land on, which squad is standing on the flag.

import { Terrain, GROUND } from './terrain.js';
import { makeRng, reseed, roll } from '../core/rng.js';
import { clamp, dist2, pointSegDist2, DEG } from '../core/util.js';

export const KIND = { SOLDIER: 'soldier', VEHICLE: 'vehicle', GUN: 'gun', PROP: 'prop', CRATE: 'crate' };

const HASH_CELL = 16;

export class World {
  constructor(sizeM = 512, seed = 20240607) {
    reseed(seed);
    this.seed = seed;
    this.size = sizeM;
    this.terrain = new Terrain(sizeM, seed);
    this.entities = [];
    this.byId = new Map();
    this.props = [];
    this.flags = [];
    this.projectiles = [];
    this.effects = [];       // drained by the renderer each frame
    this.log = [];
    this.nextId = 1;
    this.time = 0;
    this.tick = 0;
    this.hash = new Map();
    this.factions = {};
    this.corpses = [];
    this.decals = [];
  }

  // ---- entity plumbing --------------------------------------------------
  add(e) {
    e.id = this.nextId++;
    e.alive = true;
    this.entities.push(e);
    this.byId.set(e.id, e);
    return e;
  }

  remove(e) {
    e.alive = false;
    this.byId.delete(e.id);
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
  }

  // ---- spatial hash -----------------------------------------------------
  key(x, z) { return ((x / HASH_CELL) | 0) * 8192 + ((z / HASH_CELL) | 0); }

  rebuildHash() {
    this.hash.clear();
    for (const e of this.entities) {
      if (!e.alive) continue;
      const k = this.key(e.x, e.z);
      let b = this.hash.get(k);
      if (!b) this.hash.set(k, (b = []));
      b.push(e);
    }
  }

  /** Everything within `r` metres of (x,z), optionally filtered. */
  near(x, z, r, filter) {
    const out = [];
    const c = Math.ceil(r / HASH_CELL);
    const ci = (x / HASH_CELL) | 0, cj = (z / HASH_CELL) | 0;
    const r2 = r * r;
    for (let j = cj - c; j <= cj + c; j++) {
      for (let i = ci - c; i <= ci + c; i++) {
        const b = this.hash.get(i * 8192 + j);
        if (!b) continue;
        for (const e of b) {
          if (!e.alive) continue;
          if (dist2(x, z, e.x, e.z) > r2) continue;
          if (filter && !filter(e)) continue;
          out.push(e);
        }
      }
    }
    return out;
  }

  // ---- props ------------------------------------------------------------
  addProp(p) {
    p.id = this.nextId++;
    p.alive = true;
    p.hp = p.hp ?? 100;
    this.props.push(p);
    return p;
  }

  /** Props whose footprint the segment a->b passes through. */
  propsAlong(ax, az, bx, bz, pad = 0) {
    const hits = [];
    for (const p of this.props) {
      if (!p.alive || !p.blocksLos) continue;
      const r = p.radius + pad;
      if (pointSegDist2(p.x, p.z, ax, az, bx, bz) <= r * r) hits.push(p);
    }
    return hits;
  }

  /**
   * Can `ay`-high point A see `by`-high point B? Checks the ground first,
   * then anything solid standing on it. Returns null when the view is clear.
   */
  losBlocker(ax, ay, az, bx, by, bz, ignore) {
    const g = this.terrain.losBlocked(ax, ay, az, bx, by, bz);
    if (g) return { kind: 'terrain', ...g };
    const len = Math.hypot(bx - ax, bz - az) || 1;
    for (const p of this.props) {
      if (!p.alive || !p.blocksLos || p === ignore) continue;
      const d2 = pointSegDist2(p.x, p.z, ax, az, bx, bz);
      if (d2 > p.radius * p.radius) continue;
      // How high is the sight line where it crosses this prop?
      const t = clamp(((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / (len * len), 0, 1);
      const lineY = ay + (by - ay) * t;
      const top = this.terrain.heightAt(p.x, p.z) + p.height;
      if (lineY < top) return { kind: 'prop', prop: p, x: p.x, y: lineY, z: p.z };
    }
    return null;
  }

  /**
   * Cover value at a point against fire coming from a direction: 0 in the open,
   * up to ~0.8 pressed against a wall. Cover both reduces the chance of being
   * hit and soaks some of the round.
   */
  coverAt(x, z, fromX, fromZ) {
    let best = 0;
    const dx = fromX - x, dz = fromZ - z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    for (const p of this.props) {
      if (!p.alive || !p.cover) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > p.radius + 2.2) continue;
      // Only counts if the prop is between the target and the shooter.
      const px = (p.x - x) / (d || 1), pz = (p.z - z) / (d || 1);
      const facing = px * nx + pz * nz;
      if (facing < 0.15) continue;
      best = Math.max(best, p.cover * clamp(facing, 0, 1) * clamp(1 - (d - p.radius) / 2.6, 0, 1));
    }
    return best;
  }

  // ---- flags ------------------------------------------------------------
  addFlag(x, z, owner, name, radius = 22) {
    const f = {
      id: this.nextId++, x, z, radius, name,
      owner, progress: owner === 'neu' ? 0 : 1, contestedBy: null,
      y: this.terrain.heightAt(x, z),
    };
    this.flags.push(f);
    return f;
  }

  logLine(text, tone = 'info') {
    this.log.push({ t: this.time, text, tone });
    if (this.log.length > 160) this.log.shift();
  }

  fx(type, data) { this.effects.push({ type, ...data }); }
}

/** Scatter woods, hedges, walls and villages over a generated map. */
export function populateScenery(world) {
  const rng = makeRng(world.seed ^ 0x5eed);
  const T = world.terrain, S = world.size;

  const placeTree = (x, z, big) => world.addProp({
    type: big ? 'tree_big' : 'tree', x, z, y: T.heightAt(x, z),
    yaw: rng() * Math.PI * 2, radius: big ? 1.5 : 1.0, height: big ? 13 : 8.5,
    blocksLos: true, blocksMove: true, cover: 0.35, hp: 260, destructible: true,
    scale: 0.8 + rng() * 0.5,
  });

  // Woodland: a dozen clumps, denser at the middle.
  for (let c = 0; c < 16; c++) {
    const cx = rng() * S, cz = rng() * S;
    if (T.groundAt(cx, cz) === GROUND.ROAD) continue;
    const n = 8 + (rng() * 26 | 0), spread = 12 + rng() * 26;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * spread;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!T.inBounds(x, z) || T.groundAt(x, z) === GROUND.ROAD) continue;
      placeTree(x, z, rng() < 0.25);
    }
  }

  // Two villages, roughly on the road, one for each half of the map.
  for (const [vx, vz] of [[0.34, 0.3], [0.62, 0.72]]) {
    const cx = vx * S, cz = vz * S;
    const count = 4 + (rng() * 4 | 0);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, r = 10 + rng() * 34;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!T.inBounds(x, z)) continue;
      const w = 7 + rng() * 5, d = 6 + rng() * 5;
      world.addProp({
        type: 'house', x, z, y: T.heightAt(x, z), yaw: Math.round(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3,
        w, d, height: rng() < 0.35 ? 7.5 : 5.2, radius: Math.max(w, d) * 0.55,
        blocksLos: true, blocksMove: true, cover: 0.8, hp: 2200, destructible: true,
        garrison: [], capacity: 6,
      });
    }
    // A low wall and a few haystacks to fight around.
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2, r = 18 + rng() * 26;
      world.addProp({
        type: 'wall', x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r,
        y: T.heightAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r),
        yaw: rng() * Math.PI, len: 6 + rng() * 7, height: 1.25, radius: 4.5,
        blocksLos: true, blocksMove: true, cover: 0.7, hp: 500, destructible: true,
      });
    }
  }

  // Field hedges and fences along the open ground.
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, z = rng() * S;
    if (!T.inBounds(x, z) || T.groundAt(x, z) === GROUND.ROAD) continue;
    const isHedge = rng() < 0.55;
    world.addProp({
      type: isHedge ? 'hedge' : 'fence', x, z, y: T.heightAt(x, z), yaw: rng() * Math.PI,
      len: 8 + rng() * 14, height: isHedge ? 1.7 : 1.1, radius: 6,
      blocksLos: isHedge, blocksMove: true, cover: isHedge ? 0.55 : 0.25,
      hp: isHedge ? 300 : 80, destructible: true,
    });
  }

  // Sandbag nests near the flags get added later, once flags exist.
  for (let i = 0; i < 20; i++) {
    const x = rng() * S, z = rng() * S;
    if (!T.inBounds(x, z)) continue;
    world.addProp({
      type: 'rock', x, z, y: T.heightAt(x, z), yaw: rng() * Math.PI * 2,
      radius: 0.8 + rng() * 1.2, height: 1.0 + rng() * 0.8,
      blocksLos: true, blocksMove: true, cover: 0.5, hp: 9999, destructible: false,
      scale: 0.8 + rng() * 0.6,
    });
  }
  return world;
}

/** Sandbag emplacements around each capture point. */
export function fortifyFlags(world) {
  const rng = makeRng(world.seed ^ 0xf1a6);
  for (const f of world.flags) {
    const n = 3 + (rng() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = f.radius * (0.45 + rng() * 0.5);
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      world.addProp({
        type: 'sandbags', x, z, y: world.terrain.heightAt(x, z), yaw: a + Math.PI / 2 + (rng() - 0.5) * 0.6,
        len: 3.6 + rng() * 2, height: 0.95, radius: 2.6,
        blocksLos: false, blocksMove: true, cover: 0.72, hp: 420, destructible: true,
      });
    }
    world.addProp({
      type: 'crater', x: f.x + (rng() - 0.5) * f.radius, z: f.z + (rng() - 0.5) * f.radius,
      y: 0, yaw: rng() * Math.PI, radius: 2.4 + rng() * 1.6, height: 0,
      blocksLos: false, blocksMove: false, cover: 0.4, hp: 9999, destructible: false,
    });
  }
}
