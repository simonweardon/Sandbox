// The ground mesh, coloured from the heightfield the simulation uses.

import * as THREE from '../../vendor/three.module.js';
import { CELL, GROUND } from '../sim/terrain.js';
import { hashNoise } from './models/kit.js';

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
    // Break the flat colour up, and darken steep faces so relief reads. Two
    // scales of noise, because one alone reads as a regular pattern.
    const noise = hashNoise(x * 1.7 + z * 3.1) * 0.6 + hashNoise(x * 0.11 + z * 0.13) * 0.4;
    const slope = terrain.slopeAt(x, z);
    const k = 1 + (noise - 0.5) * 0.2 - Math.min(slope * 0.55, 0.34);
    colours[i * 3] = c.r * k;
    colours[i * 3 + 1] = c.g * k;
    colours[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
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
