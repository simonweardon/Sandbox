// The battlefield surface.
//
// A heightfield sampled every `CELL` metres. It does three jobs: it decides
// where things sit, it slows vehicles down off the road, and — the one that
// matters most tactically — it blocks line of sight, so a tank sitting behind
// a rise is hull-down and can only be hit on the turret.

import { makeRng } from '../core/rng.js';
import { clamp, lerp, smoothstep } from '../core/util.js';

export const CELL = 4;            // metres per heightfield cell

export const GROUND = {
  GRASS: 0, DIRT: 1, ROAD: 2, MUD: 3, SAND: 4, RUBBLE: 5,
};

/** Movement cost multipliers by ground type — road is fast, mud is not. */
export const GROUND_SPEED = [0.82, 0.9, 1.0, 0.5, 0.75, 0.6];

export class Terrain {
  constructor(sizeM, seed) {
    this.size = sizeM;
    this.n = Math.floor(sizeM / CELL) + 1;
    this.height = new Float32Array(this.n * this.n);
    this.ground = new Uint8Array(this.n * this.n);
    this.seed = seed;
    this.generate(seed);
  }

  idx(i, j) { return j * this.n + i; }

  generate(seed) {
    const rng = makeRng(seed);
    const n = this.n;

    // Value noise: a few octaves of a random lattice, smoothly interpolated.
    const octave = (freq, amp, off) => {
      const gs = Math.max(2, Math.ceil(n / freq) + 2);
      const g = new Float32Array(gs * gs);
      for (let k = 0; k < g.length; k++) g[k] = rng() * 2 - 1;
      return (i, j) => {
        const x = i / freq + off, y = j / freq + off;
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const tx = smoothstep(x - x0), ty = smoothstep(y - y0);
        const at = (a, b) => g[(clamp(b, 0, gs - 1) * gs) + clamp(a, 0, gs - 1)];
        return amp * lerp(
          lerp(at(x0, y0), at(x0 + 1, y0), tx),
          lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
      };
    };

    const o1 = octave(26, 9.0, 0.3), o2 = octave(11, 3.2, 5.1);
    const o3 = octave(5, 1.1, 11.7), o4 = octave(2.5, 0.35, 23.3);

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let h = o1(i, j) + o2(i, j) + o3(i, j) + o4(i, j);
        // Flatten the two deployment ends so neither side spawns on a cliff.
        const t = j / (n - 1);
        const edgeFlat = Math.min(smoothstep(clamp(t / 0.18, 0, 1)), smoothstep(clamp((1 - t) / 0.18, 0, 1)));
        h *= 0.35 + 0.65 * edgeFlat;
        this.height[this.idx(i, j)] = h;
        this.ground[this.idx(i, j)] = rng() < 0.08 ? GROUND.DIRT : GROUND.GRASS;
      }
    }

    this.roads = [];
    this.carveRoad([[0.5, 0.0], [0.46, 0.3], [0.55, 0.55], [0.5, 1.0]], 7);
    this.carveRoad([[0.0, 0.62], [0.35, 0.58], [0.7, 0.66], [1.0, 0.6]], 6);
    this.smooth(1);
  }

  /** Lay a road along a spline of normalised waypoints, levelling as it goes. */
  carveRoad(points, widthM) {
    const pts = points.map(([u, v]) => ({ x: u * this.size, z: v * this.size }));
    const samples = [];
    for (let s = 0; s <= 1.0001; s += 0.004) {
      samples.push(catmull(pts, s));
    }
    this.roads.push(samples);
    const halfCells = Math.ceil(widthM / CELL) + 1;
    for (const p of samples) {
      const ci = Math.round(p.x / CELL), cj = Math.round(p.z / CELL);
      const target = this.heightAtCellSafe(ci, cj);
      for (let j = cj - halfCells; j <= cj + halfCells; j++) {
        for (let i = ci - halfCells; i <= ci + halfCells; i++) {
          if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
          const d = Math.hypot(i * CELL - p.x, j * CELL - p.z);
          if (d > widthM) continue;
          const k = this.idx(i, j);
          const w = 1 - d / widthM;
          this.height[k] = lerp(this.height[k], target, w * 0.75);
          if (d < widthM * 0.6) this.ground[k] = GROUND.ROAD;
          else if (this.ground[k] === GROUND.GRASS) this.ground[k] = GROUND.DIRT;
        }
      }
    }
  }

  smooth(passes) {
    for (let p = 0; p < passes; p++) {
      const src = this.height.slice();
      for (let j = 1; j < this.n - 1; j++) {
        for (let i = 1; i < this.n - 1; i++) {
          const k = this.idx(i, j);
          this.height[k] = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - this.n] + src[k + this.n]) / 8;
        }
      }
    }
  }

  heightAtCellSafe(i, j) {
    return this.height[this.idx(clamp(i, 0, this.n - 1), clamp(j, 0, this.n - 1))];
  }

  /** Bilinear height sample at world metres. */
  heightAt(x, z) {
    const fx = clamp(x / CELL, 0, this.n - 1.001);
    const fz = clamp(z / CELL, 0, this.n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = this.height[this.idx(i, j)], h10 = this.height[this.idx(i + 1, j)];
    const h01 = this.height[this.idx(i, j + 1)], h11 = this.height[this.idx(i + 1, j + 1)];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  /** Surface normal, used to sit vehicles on slopes and to shade the ground. */
  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const d = CELL;
    const hL = this.heightAt(x - d, z), hR = this.heightAt(x + d, z);
    const hD = this.heightAt(x, z - d), hU = this.heightAt(x, z + d);
    const nx = hL - hR, nz = hD - hU, ny = 2 * d;
    const len = Math.hypot(nx, ny, nz) || 1;
    out.x = nx / len; out.y = ny / len; out.z = nz / len;
    return out;
  }

  /** Steepness in radians — vehicles refuse gradients they cannot climb. */
  slopeAt(x, z) {
    const n = this.normalAt(x, z);
    return Math.acos(clamp(n.y, -1, 1));
  }

  groundAt(x, z) {
    const i = clamp(Math.round(x / CELL), 0, this.n - 1);
    const j = clamp(Math.round(z / CELL), 0, this.n - 1);
    return this.ground[this.idx(i, j)];
  }

  speedFactor(x, z) { return GROUND_SPEED[this.groundAt(x, z)] ?? 1; }

  inBounds(x, z) { return x >= 2 && z >= 2 && x <= this.size - 2 && z <= this.size - 2; }

  /**
   * Does the ground itself block the line from a to b? Walks the segment and
   * checks whether the terrain rises above the straight line between the two
   * points. This is what makes reverse slopes and hull-down positions work.
   * Returns null if clear, or the world point where it is first blocked.
   */
  losBlocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) return null;
    const steps = Math.min(220, Math.max(4, Math.ceil(len / (CELL * 0.7))));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = ax + dx * t, z = az + dz * t;
      const lineY = ay + (by - ay) * t;
      if (this.heightAt(x, z) > lineY + 0.15) return { x, y: lineY, z };
    }
    return null;
  }
}

/** Centripetal-ish Catmull-Rom through the control points. */
function catmull(pts, s) {
  const n = pts.length - 1;
  const f = clamp(s, 0, 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const t = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const h = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: h(p0.x, p1.x, p2.x, p3.x), z: h(p0.z, p1.z, p2.z, p3.z) };
}
