// Maps.
//
// A map is a terrain configuration, a way of filling it with scenery, and a
// line of objectives across it. Two exist: the open farmland the game started
// with, and a city — which is a completely different kind of battle. In the
// country a tank commands the ground it can see, which is most of it. In a city
// it can see fifty metres, cannot leave the street, and every window it drives
// past might hold somebody with a Panzerfaust.

import { GROUND } from './terrain.js';
import { makeRng } from '../core/rng.js';
import { clamp } from '../core/util.js';

// ---------------------------------------------------------------------------
// Open country
// ---------------------------------------------------------------------------

function buildCountryside(world) {
  const rng = makeRng(world.seed ^ 0x5eed);
  const T = world.terrain, S = world.size;

  const placeTree = (x, z, big) => world.addProp({
    type: big ? 'tree_big' : 'tree', x, z, y: T.heightAt(x, z),
    yaw: rng() * Math.PI * 2, radius: big ? 1.5 : 1.0, height: big ? 13 : 8.5,
    blocksLos: true, blocksMove: true, cover: 0.35, hp: 260, destructible: true,
    scale: 0.8 + rng() * 0.5,
  });

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
        floors: rng() < 0.35 ? 2 : 1, capacity: 4,
      });
    }
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2, r = 18 + rng() * 26;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      world.addProp({
        type: 'wall', x, z, y: T.heightAt(x, z),
        yaw: rng() * Math.PI, len: 6 + rng() * 7, height: 1.25, radius: 4.5,
        blocksLos: true, blocksMove: true, cover: 0.7, hp: 500, destructible: true,
      });
    }
  }

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
}

// ---------------------------------------------------------------------------
// The city
// ---------------------------------------------------------------------------

/** Dimensions are quantised so a few hundred buildings share a few geometries. */
const step = (v, s) => Math.round(v / s) * s;

function addBuilding(world, rng, o) {
  const T = world.terrain;
  const ruined = o.ruined ?? false;
  const w = step(o.w, 4), d = step(o.d, 2);
  const floors = o.floors;
  const height = ruined ? floors * 3.4 * (0.4 + rng() * 0.3) : floors * 3.4 + 0.8;
  return world.addProp({
    type: ruined ? 'ruin' : (o.type || 'apartment'),
    x: o.x, z: o.z, y: T.heightAt(o.x, o.z), yaw: o.yaw || 0,
    w, d, height: step(height, 1.7), floors,
    radius: Math.hypot(w, d) / 2,
    blocksLos: true, blocksMove: true,
    cover: ruined ? 0.72 : 0.85,
    // A masonry block soaked up an extraordinary amount of shelling before
    // it came down. Making them cheap to level empties the city of cover.
    hp: ruined ? 2600 : 4000 + floors * 2400,
    destructible: true,
    // A building you can put men in. Ruins hold fewer, and hide them less well.
    capacity: ruined ? 3 : Math.min(8, 2 + floors),
    garrisonCover: ruined ? 0.55 : 0.8,
    palette: o.palette ?? (rng() * 4 | 0),
  });
}

/** Buildings around the edge of a block, leaving a courtyard in the middle. */
function fillBlock(world, rng, b, opts = {}) {
  const ruined = opts.ruined ?? false;
  const depth = 13;
  const inset = depth / 2 + 0.5;
  const edges = [
    { x: b.cx, z: b.z0 + inset, w: b.w - 2, d: depth, yaw: 0 },
    { x: b.cx, z: b.z1 - inset, w: b.w - 2, d: depth, yaw: 0 },
    { x: b.x0 + inset, z: b.cz, w: depth, d: b.d - depth * 2 - 2, yaw: 0 },
    { x: b.x1 - inset, z: b.cz, w: depth, d: b.d - depth * 2 - 2, yaw: 0 },
  ].filter((e) => e.w > 8 && e.d > 8);

  for (const e of edges) {
    // Most edges are built on; a gap is an alley into the courtyard.
    if (rng() < (ruined ? 0.3 : 0.18)) continue;
    // A long edge is two or three separate buildings, not one slab.
    const along = e.w > e.d ? 'w' : 'd';
    const span = e[along];
    const pieces = span > 40 ? 2 + (rng() < 0.4 ? 1 : 0) : 1;
    let cursor = -span / 2;
    for (let i = 0; i < pieces; i++) {
      const share = span / pieces;
      const len = share - (pieces > 1 ? 1.5 : 0);
      const mid = cursor + share / 2;
      cursor += share;
      const isRuin = ruined || rng() < 0.14;
      addBuilding(world, rng, {
        x: e.x + (along === 'w' ? mid : 0),
        z: e.z + (along === 'd' ? mid : 0),
        w: along === 'w' ? len : e.w,
        d: along === 'd' ? len : e.d,
        floors: 3 + (rng() * 3 | 0),
        ruined: isRuin,
        palette: rng() * 4 | 0,
      });
    }
  }
}

function buildCity(world) {
  const rng = makeRng(world.seed ^ 0xc17e5);
  const T = world.terrain, S = world.size;
  const blocks = T.blocks || [];

  // Pick out the landmark blocks first: the factory, the square, the yards.
  const central = blocks.reduce((best, b) =>
    Math.hypot(b.cx - S / 2, b.cz - S / 2) < Math.hypot(best.cx - S / 2, best.cz - S / 2) ? b : best, blocks[0]);
  const big = blocks.filter((b) => b.w > 40 && b.d > 40 && b !== central);
  const factory = big[Math.floor(rng() * big.length)];
  const yard = big[Math.floor(rng() * big.length)];

  for (const b of blocks) {
    if (b === central) { buildSquare(world, rng, b); continue; }
    if (b === factory) { buildFactory(world, rng, b); continue; }
    if (b === yard && b !== factory) { buildYard(world, rng, b); continue; }
    if (b.w < 20 || b.d < 20) { buildYard(world, rng, b); continue; }
    // A fifth of the city has already been fought over once.
    fillBlock(world, rng, b, { ruined: rng() < 0.22 });
  }

  // Rubble spilled into the streets, which is what channels the armour.
  const heaps = 26;
  for (let i = 0; i < heaps; i++) {
    const x = rng() * S, z = rng() * S;
    if (T.groundAt(x, z) !== GROUND.ROAD) continue;
    world.addProp({
      type: 'rubble', x, z, y: T.heightAt(x, z), yaw: rng() * Math.PI,
      radius: 2.6 + rng() * 2.4, height: 1.2 + rng() * 0.9,
      blocksLos: false, blocksMove: true, cover: 0.6, hp: 9999, destructible: false,
      scale: 0.85 + rng() * 0.5,
    });
  }
  // A few burnt-out trams and lamp posts along the avenue.
  for (let i = 0; i < 16; i++) {
    const x = rng() * S, z = rng() * S;
    if (T.groundAt(x, z) !== GROUND.ROAD) continue;
    world.addProp({
      type: 'lamppost', x, z, y: T.heightAt(x, z), yaw: rng() * Math.PI * 2,
      radius: 0.3, height: 6, blocksLos: false, blocksMove: false,
      cover: 0, hp: 40, destructible: true,
    });
  }
}

function buildSquare(world, rng, b) {
  const T = world.terrain;
  world.addProp({
    type: 'monument', x: b.cx, z: b.cz, y: T.heightAt(b.cx, b.cz), yaw: rng() * Math.PI,
    w: 5, d: 5, height: 9, radius: 3.6,
    blocksLos: true, blocksMove: true, cover: 0.8, hp: 14000, destructible: true,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng() * 0.3;
    const r = Math.min(b.w, b.d) * 0.36;
    const x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r;
    world.addProp({
      type: 'tree', x, z, y: T.heightAt(x, z), yaw: rng() * 6.28,
      radius: 1.0, height: 8.5, blocksLos: true, blocksMove: true,
      cover: 0.35, hp: 260, destructible: true, scale: 0.8 + rng() * 0.3,
    });
  }
}

function buildFactory(world, rng, b) {
  const T = world.terrain;
  const w = b.w - 6, d = b.d - 14;
  world.addProp({
    type: 'factory', x: b.cx, z: b.cz, y: T.heightAt(b.cx, b.cz), yaw: 0,
    w: step(w, 4), d: step(d, 2), height: 13.6, floors: 2,
    radius: Math.hypot(w, d) / 2,
    blocksLos: true, blocksMove: true, cover: 0.85, hp: 42000, destructible: true,
    capacity: 12, garrisonCover: 0.82,
  });
  const cx = b.x1 - 5, cz = b.z0 + 5;
  world.addProp({
    type: 'chimney', x: cx, z: cz, y: T.heightAt(cx, cz), yaw: 0,
    radius: 1.9, height: 26,
    blocksLos: true, blocksMove: true, cover: 0.7, hp: 9000, destructible: true,
  });
}

function buildYard(world, rng, b) {
  const T = world.terrain;
  const n = 3 + (rng() * 4 | 0);
  for (let i = 0; i < n; i++) {
    const x = b.x0 + rng() * b.w, z = b.z0 + rng() * b.d;
    world.addProp({
      type: 'rubble', x, z, y: T.heightAt(x, z), yaw: rng() * Math.PI,
      radius: 2.4 + rng() * 3, height: 1.3 + rng() * 1.4,
      blocksLos: rng() < 0.4, blocksMove: true, cover: 0.62,
      hp: 9999, destructible: false, scale: 0.9 + rng() * 0.6,
    });
  }
  // A stub of wall left standing at the edge.
  for (let i = 0; i < 2; i++) {
    const along = rng() < 0.5;
    const x = along ? b.cx : (rng() < 0.5 ? b.x0 + 2 : b.x1 - 2);
    const z = along ? (rng() < 0.5 ? b.z0 + 2 : b.z1 - 2) : b.cz;
    world.addProp({
      type: 'wall', x, z, y: T.heightAt(x, z), yaw: along ? 0 : Math.PI / 2,
      len: 8 + rng() * 10, height: 2.2, radius: 6,
      blocksLos: true, blocksMove: true, cover: 0.75, hp: 700, destructible: true,
    });
  }
}

// ---------------------------------------------------------------------------

export const MAPS = {
  countryside: {
    name: 'Rolling farmland',
    blurb: 'Open ground, long sightlines, armour in its element.',
    terrain: { relief: 1, roads: 'lanes' },
    build: buildCountryside,
    flags: [
      { u: 0.5, v: 0.14, name: 'Bridgehead', r: 22 },
      { u: 0.26, v: 0.36, name: 'The Farm', r: 22 },
      { u: 0.52, v: 0.5, name: 'Crossroads', r: 26 },
      { u: 0.74, v: 0.64, name: 'The Mill', r: 22 },
      { u: 0.5, v: 0.86, name: 'Rail Halt', r: 22 },
    ],
  },
  city: {
    name: 'The city',
    blurb: 'Street fighting. Nothing sees past fifty metres and armour cannot leave the road.',
    terrain: { relief: 0.2, roads: 'grid', ground: 'urban', pitch: 74, street: 16 },
    build: buildCity,
    // Landmarks, not open fields: a street battle is fought over buildings.
    flags: [
      { u: 0.5, v: 0.12, name: 'The Landing', r: 20 },
      { u: 0.22, v: 0.38, name: 'Grain Elevator', r: 20 },
      { u: 0.5, v: 0.5, name: 'Central Square', r: 24 },
      { u: 0.78, v: 0.62, name: 'Tractor Works', r: 20 },
      { u: 0.5, v: 0.88, name: 'Rail Yard', r: 20 },
    ],
  },
};

export const DEFAULT_MAP = 'countryside';
