// Getting from here to there.
//
// A* over a coarse grid, with separate costs for men and for vehicles: a tank
// cannot squeeze between two houses but will happily flatten a fence, while
// infantry go through gaps armour has to drive around. Paths are then pulled
// straight, because raw grid paths look like they were laid out by a drunk.

import { CELL, GROUND_SPEED } from './terrain.js';
import { clamp } from '../core/util.js';
import { propDistance, propReach, isBoxed } from './shapes.js';

export const NAV_CELL = 4;
const BLOCKED = 255;

export class NavGrid {
  constructor(world) {
    this.world = world;
    this.n = Math.floor(world.size / NAV_CELL) + 1;
    this.footCost = new Uint8Array(this.n * this.n);
    this.tankCost = new Uint8Array(this.n * this.n);
    this.rebuild();
  }

  idx(i, j) { return j * this.n + i; }
  toCell(v) { return clamp(Math.round(v / NAV_CELL), 0, this.n - 1); }

  rebuild() {
    const T = this.world.terrain, n = this.n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = i * NAV_CELL, z = j * NAV_CELL;
        const slope = T.slopeAt(x, z);
        const ground = GROUND_SPEED[T.groundAt(x, z)] ?? 1;
        const base = clamp(Math.round(10 / ground), 8, 30);
        // Men can scramble up slopes that stop a tank dead.
        this.footCost[this.idx(i, j)] = slope > 0.95 ? BLOCKED : base + Math.round(slope * 24);
        this.tankCost[this.idx(i, j)] = slope > 0.62 ? BLOCKED : base + Math.round(slope * 60);
      }
    }
    for (const p of this.world.props) this.stamp(p);
  }

  /** Write one prop's footprint into the cost grids. */
  stamp(p) {
    if (!p.alive || !p.blocksMove) return;
    const reach = propReach(p);
    const r = Math.ceil((reach + 1) / NAV_CELL);
    const ci = this.toCell(p.x), cj = this.toCell(p.z);
    // A tank drives through hedges, fences and saplings; it does not drive
    // through a house, a wall or a boulder.
    const crushable = p.type === 'fence' || p.type === 'hedge' || p.type === 'tree';
    const solid = p.type === 'house' || p.type === 'apartment' || p.type === 'factory'
      || p.type === 'ruin' || p.type === 'wall' || p.type === 'monument';
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
        // Distance to the footprint itself, so a long building blocks its own
        // ground and leaves the street beside it open.
        const d = propDistance(p, i * NAV_CELL, j * NAV_CELL);
        if (d > 1.2) continue;
        const k = this.idx(i, j);
        const inner = d <= 0.001;
        if (inner) this.footCost[k] = solid ? BLOCKED : Math.min(BLOCKED, this.footCost[k] + 40);
        else this.footCost[k] = Math.min(BLOCKED - 1, this.footCost[k] + 18);
        if (crushable) this.tankCost[k] = Math.min(BLOCKED - 1, this.tankCost[k] + (inner ? 26 : 10));
        else this.tankCost[k] = BLOCKED;
      }
    }
  }

  /** Called when scenery is knocked down, so paths open up mid-battle. */
  clearProp(p) {
    const r = Math.ceil((propReach(p) + 1) / NAV_CELL);
    const ci = this.toCell(p.x), cj = this.toCell(p.z);
    const T = this.world.terrain;
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
        const x = i * NAV_CELL, z = j * NAV_CELL;
        const slope = T.slopeAt(x, z);
        const ground = GROUND_SPEED[T.groundAt(x, z)] ?? 1;
        const base = clamp(Math.round(10 / ground), 8, 30);
        this.footCost[this.idx(i, j)] = slope > 0.95 ? BLOCKED : base + Math.round(slope * 24);
        this.tankCost[this.idx(i, j)] = slope > 0.62 ? BLOCKED : base + Math.round(slope * 60);
      }
    }
    // Anything still standing nearby has to be written back in.
    for (const q of this.world.props) {
      if (!q.alive || q === p) continue;
      if (Math.hypot(q.x - p.x, q.z - p.z) < propReach(q) + propReach(p) + NAV_CELL * 2) this.stamp(q);
    }
  }

  costAt(i, j, tank) {
    return (tank ? this.tankCost : this.footCost)[this.idx(i, j)];
  }

  passable(x, z, tank) {
    return this.costAt(this.toCell(x), this.toCell(z), tank) < BLOCKED;
  }
}

const NEIGHBOURS = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];

/**
 * A* from world point a to world point b. Returns an array of world points,
 * or null if there is no way through. `maxNodes` keeps a hopeless search from
 * stalling the frame.
 */
export function findPath(nav, ax, az, bx, bz, tank = false, maxNodes = 24000) {
  const n = nav.n;
  let si = nav.toCell(ax), sj = nav.toCell(az);
  let gi = nav.toCell(bx), gj = nav.toCell(bz);

  /** The nearest cell that is not inside something solid. */
  const escape = (ci, cj) => {
    for (let r = 1; r <= 8; r++) {
      for (let j = cj - r; j <= cj + r; j++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          if (nav.costAt(i, j, tank) < BLOCKED) return [i, j];
        }
      }
    }
    return null;
  };

  // If the goal is inside something solid, aim for the nearest cell that is not.
  if (nav.costAt(gi, gj, tank) >= BLOCKED) {
    const found = escape(gi, gj);
    if (!found) return null;
    [gi, gj] = found;
  }
  // Same for the start: a man who has just stepped out of a building, or a
  // tank whose cell was blocked by rubble dropped on it, still has to be able
  // to work out where to go.
  if (nav.costAt(si, sj, tank) >= BLOCKED) {
    const found = escape(si, sj);
    if (!found) return null;
    [si, sj] = found;
  }
  if (si === gi && sj === gj) return [{ x: bx, z: bz }];

  const size = n * n;
  const gScore = new Float32Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const start = sj * n + si, goal = gj * n + gi;
  gScore[start] = 0;

  const h = (i, j) => {
    const dx = Math.abs(i - gi), dy = Math.abs(j - gj);
    return 10 * (dx + dy) + (14 - 20) * Math.min(dx, dy);
  };

  // Binary heap keyed on f.
  const heap = [{ k: start, f: h(si, sj) }];
  const push = (node) => {
    heap.push(node);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p].f <= heap[c].f) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let m = p;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === p) break;
        [heap[p], heap[m]] = [heap[m], heap[p]];
        p = m;
      }
    }
    return top;
  };

  let examined = 0;
  while (heap.length) {
    const cur = pop();
    if (closed[cur.k]) continue;
    closed[cur.k] = 1;
    if (cur.k === goal) break;
    if (++examined > maxNodes) break;

    const ci = cur.k % n, cj = (cur.k / n) | 0;
    for (const [di, dj, step] of NEIGHBOURS) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const k = nj * n + ni;
      if (closed[k]) continue;
      const c = nav.costAt(ni, nj, tank);
      if (c >= BLOCKED) continue;
      // Do not cut a diagonal corner past something solid.
      if (di && dj && (nav.costAt(ci + di, cj, tank) >= BLOCKED || nav.costAt(ci, cj + dj, tank) >= BLOCKED)) continue;
      const g = gScore[cur.k] + (step * c) / 10;
      if (g >= gScore[k]) continue;
      gScore[k] = g;
      cameFrom[k] = cur.k;
      push({ k, f: g + h(ni, nj) });
    }
  }

  if (cameFrom[goal] < 0 && goal !== start) return null;
  const cells = [];
  for (let k = goal; k >= 0; k = cameFrom[k]) {
    cells.push({ x: (k % n) * NAV_CELL, z: (((k / n) | 0)) * NAV_CELL });
    if (k === start) break;
  }
  cells.reverse();
  cells[cells.length - 1] = { x: bx, z: bz };
  return smoothPath(nav, cells, tank);
}

/**
 * Pull the grid path straight, but only where the shortcut is genuinely no
 * worse. A raw A* path zig-zags along cell boundaries; smoothing it flat out
 * would send a column straight through the mud it had carefully routed around,
 * so a shortcut has to beat the path it replaces on cost, not just on length.
 */
function smoothPath(nav, cells, tank) {
  if (cells.length <= 2) return cells;
  const out = [cells[0]];
  let i = 0;
  while (i < cells.length - 1) {
    const limit = Math.min(cells.length - 1, i + 8);
    let j = limit;
    for (; j > i + 1; j--) {
      if (clearLine(nav, cells[i], cells[j], tank) && lineCost(nav, cells[i], cells[j], tank) <= segmentCost(nav, cells, i, j, tank) * 1.15) break;
    }
    out.push(cells[j]);
    i = j;
  }
  return out;
}

/** Cost of walking the straight line between two points. */
function lineCost(nav, a, b, tank) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(d / NAV_CELL));
  let sum = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    sum += nav.costAt(nav.toCell(a.x + (b.x - a.x) * t), nav.toCell(a.z + (b.z - a.z) * t), tank);
  }
  return (sum / (steps + 1)) * d;
}

/** Cost of the grid path the shortcut would replace. */
function segmentCost(nav, cells, i, j, tank) {
  let sum = 0;
  for (let k = i; k < j; k++) {
    const d = Math.hypot(cells[k + 1].x - cells[k].x, cells[k + 1].z - cells[k].z);
    sum += nav.costAt(nav.toCell(cells[k + 1].x), nav.toCell(cells[k + 1].z), tank) * d;
  }
  return sum;
}

function clearLine(nav, a, b, tank) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(d / (NAV_CELL * 0.5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (nav.costAt(nav.toCell(x), nav.toCell(z), tank) >= BLOCKED) return false;
  }
  return true;
}
