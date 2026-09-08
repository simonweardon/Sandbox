// The ground mesh, coloured from the heightfield the simulation uses.

import * as THREE from '../../vendor/three.module.js';
import { CELL, GROUND } from '../sim/terrain.js';
import { hashNoise, merge, box, cyl, cone, shade } from './models/kit.js';
import { propDistance } from '../sim/shapes.js';

/**
 * A tiling grain for the ground, drawn into a canvas at load time like
 * everything else here. It is deliberately fine and low in contrast: it
 * multiplies over the vertex colours that carry the actual terrain type, so
 * its job is to break the flat washes up, not to colour anything.
 *
 * Built from wrapped value noise at three scales so it tiles seamlessly and
 * reads as grain rather than as a repeating pattern.
 */
function groundTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);

  // Periodic value noise: the lattice wraps, so the tile has no seam.
  const lattice = (period, seed) => {
    const g = new Float32Array(period * period);
    for (let i = 0; i < g.length; i++) g[i] = hashNoise(i * 1.37 + seed * 91.7);
    return (x, y) => {
      const fx = x * period, fy = y * period;
      const x0 = Math.floor(fx) % period, y0 = Math.floor(fy) % period;
      const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
      const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[y0 * period + x0], b = g[y0 * period + x1];
      const cc = g[y1 * period + x0], d = g[y1 * period + x1];
      return (a + (b - a) * sx) + ((cc + (d - cc) * sx) - (a + (b - a) * sx)) * sy;
    };
  };
  const n1 = lattice(32, 1), n2 = lattice(12, 2), n3 = lattice(4, 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let n = n1(u, v) * 0.46 + n2(u, v) * 0.33 + n3(u, v) * 0.21;
      // Push the mid-tones apart a little so the grain actually shows.
      n = n < 0.5 ? 0.5 * Math.pow(n * 2, 1.25) : 1 - 0.5 * Math.pow((1 - n) * 2, 1.25);
      const k = 0.62 + n * 0.74;
      const i = (y * size + x) * 4;
      const val = Math.max(0, Math.min(255, Math.round(k * 255)));
      img.data[i] = val;
      img.data[i + 1] = val;
      img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const GRASS = [0x53663a, 0x5c7040, 0x495c34, 0x627448];
const DIRT = 0x6d5f45;
const ROAD = 0x77705f;
const MUD = 0x4e4335;
const SAND = 0x9a8b66;
/** Brick dust and broken plaster trodden flat. */
const RUBBLE = [0x7a6a5c, 0x6e6157, 0x836f5e];
/** Asphalt, greyer and colder than a country road. */
const PAVING = 0x5e5e5c;

export function buildTerrainMesh(terrain) {
  const n = terrain.n;
  const geo = new THREE.PlaneGeometry(terrain.size, terrain.size, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const half = terrain.size / 2;

  for (let i = 0; i < pos.count; i++) {
    // PlaneGeometry is centred on the origin; the simulation's is not.
    const x = pos.getX(i) + half, z = pos.getZ(i) + half;
    pos.setX(i, x); pos.setZ(i, z);
    pos.setY(i, terrain.heightAt(x, z));

    const g = terrain.groundAt(x, z);
    let base;
    if (g === GROUND.ROAD) base = ROAD;
    else if (g === GROUND.PAVING) base = PAVING;
    else if (g === GROUND.DIRT) base = DIRT;
    else if (g === GROUND.MUD) base = MUD;
    else if (g === GROUND.SAND) base = SAND;
    else if (g === GROUND.RUBBLE) base = RUBBLE[Math.floor(hashNoise(x * 0.53 + z * 0.29) * RUBBLE.length) % RUBBLE.length];
    else base = GRASS[Math.floor(hashNoise(x * 0.37 + z * 0.71) * GRASS.length) % GRASS.length];

    c.setHex(base);
    // Break the flat colour up at three scales — a single one reads as a
    // regular pattern — and shift the hue as well as the brightness, because
    // ground varies in colour, not just in how much light it catches.
    const fine = hashNoise(x * 1.7 + z * 3.1);
    const mid = hashNoise(x * 0.31 + z * 0.47);
    const broad = hashNoise(x * 0.07 + z * 0.09);
    const noise = fine * 0.42 + mid * 0.33 + broad * 0.25;
    const slope = terrain.slopeAt(x, z);
    const k = 1 + (noise - 0.5) * 0.34 - Math.min(slope * 0.55, 0.34);
    // Patches drift towards bare earth or towards deeper growth.
    const tint = (broad - 0.5) * 0.22;
    const warm = new THREE.Color(0x6b5c40);
    colours[i * 3] = (c.r + warm.r * tint) * k;
    colours[i * 3 + 1] = (c.g + warm.g * tint * 0.7) * k;
    colours[i * 3 + 2] = (c.b + warm.b * tint * 0.5) * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  // The grain repeats about every six metres; the vertex colours underneath
  // carry the terrain type, and the texture multiplies over them.
  const tex = groundTexture();
  tex.repeat.set(terrain.size / 6, terrain.size / 6);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** A skirt around the map edge so it does not read as a floating slab. */
export function buildTerrainSkirt(terrain) {
  const n = terrain.n, S = terrain.size;
  const verts = [];
  const drop = -40;
  const edge = (x, z) => [x, terrain.heightAt(x, z), z];
  const runs = [
    Array.from({ length: n }, (_, i) => [i * CELL, 0]),
    Array.from({ length: n }, (_, i) => [S, i * CELL]),
    Array.from({ length: n }, (_, i) => [S - i * CELL, S]),
    Array.from({ length: n }, (_, i) => [0, S - i * CELL]),
  ];
  for (const run of runs) {
    for (let i = 0; i < run.length - 1; i++) {
      const [ax, az] = run[i], [bx, bz] = run[i + 1];
      const a = edge(ax, az), b = edge(bx, bz);
      verts.push(...a, ...b, bx, drop, bz);
      verts.push(...a, bx, drop, bz, ax, drop, az);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x3b3a32, side: THREE.DoubleSide }));
}


/**
 * Ground clutter: tufts, stones and brick debris scattered over the terrain.
 *
 * A texture makes the ground look less flat; things standing on it make it
 * look like ground. Each kind is one InstancedMesh, so the whole lot costs
 * three draw calls however many thousand there are, and the count drops on a
 * phone where the fill rate matters more.
 */
export function buildGroundClutter(terrain, world, opts = {}) {
  const count = opts.count ?? 6500;
  const group = new THREE.Group();
  group.name = 'clutter';

  // A tuft is three crossed blades; a stone is a squashed lump; debris is a
  // couple of broken bricks. All tiny, all cheap.
  const tuft = merge([
    box(0.09, 0.30, 0.03, 0x5f7040, { y: 0.15, rz: 0.14 }),
    box(0.08, 0.24, 0.03, 0x546334, { x: 0.09, y: 0.12, rz: -0.34 }),
    box(0.08, 0.22, 0.03, 0x6a7a48, { x: -0.08, y: 0.11, rz: 0.38, ry: 1.1 }),
    box(0.07, 0.18, 0.03, 0x4f6033, { z: 0.07, y: 0.09, rz: -0.2, ry: 0.7 }),
  ]);
  const stone = merge([
    box(0.3, 0.14, 0.24, 0x6f6a60, { y: 0.06 }),
    box(0.16, 0.1, 0.18, 0x7b7568, { x: 0.13, y: 0.05, ry: 0.6 }),
  ]);
  const debris = merge([
    box(0.28, 0.1, 0.14, 0x8a5f4a, { y: 0.05, ry: 0.2 }),
    box(0.2, 0.09, 0.12, 0x7d5744, { x: -0.16, y: 0.04, ry: -0.5 }),
    box(0.12, 0.07, 0.1, 0x9c9184, { x: 0.14, y: 0.035, ry: 0.9 }),
  ]);

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const kinds = [
    { geom: tuft, on: [GROUND.GRASS], list: [] },
    { geom: stone, on: [GROUND.DIRT, GROUND.SAND], list: [] },
    { geom: debris, on: [GROUND.RUBBLE], list: [] },
  ];

  // Ground cover grows in patches, not on a uniform scatter, so pick a set of
  // centres and cluster around them — it is the difference between a lawn and
  // a field somebody has been fighting over.
  const S = terrain.size;
  const scratch = [];
  const perClump = 9;
  for (let i = 0; i < count; i++) {
    const clump = Math.floor(i / perClump);
    const cx = hashNoise(clump * 3.71) * S;
    const cz = hashNoise(clump * 7.13 + 41.5) * S;
    const a = hashNoise(i * 2.17) * Math.PI * 2;
    const r = Math.sqrt(hashNoise(i * 5.53)) * (2.5 + hashNoise(clump * 1.31) * 6);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (x < 1 || z < 1 || x > S - 1 || z > S - 1) continue;
    const g = terrain.groundAt(x, z);
    const kind = kinds.find((k) => k.on.includes(g));
    if (!kind) continue;
    if (terrain.slopeAt(x, z) > 0.7) continue;
    // Nothing sprouting through a building.
    let blocked = false;
    if (world) {
      for (const p of world.propsNearPoint(x, z, 3, scratch)) {
        if (p.alive && p.blocksMove && propDistance(p, x, z) < 0.6) { blocked = true; break; }
      }
    }
    if (blocked) continue;
    kind.list.push({ x, y: terrain.heightAt(x, z), z, r: hashNoise(i * 1.9) });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const kind of kinds) {
    if (!kind.list.length) continue;
    const mesh = new THREE.InstancedMesh(kind.geom, mat, kind.list.length);
    kind.list.forEach((it, i) => {
      e.set(0, it.r * Math.PI * 2, 0);
      q.setFromEuler(e);
      pos.set(it.x, it.y, it.z);
      const sc = 0.75 + it.r * 1.05;
      scl.set(sc, 0.7 + it.r * 0.8, sc);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}
