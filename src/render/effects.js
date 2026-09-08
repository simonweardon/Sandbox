// Muzzle flashes, tracers, explosions, smoke and the marks they leave.
//
// Everything is pooled and batched: one Points draw call carries every particle
// on the field, one LineSegments carries every tracer, and decals are dropped
// into a single growing geometry. Nothing here allocates during a battle.

import * as THREE from '../../vendor/three.module.js';
import { blastRadius } from '../data/weapons.js';

const MAX_PARTICLES = 4000;
const MAX_TRACERS = 400;

/** A soft round dot, drawn once into a canvas — no image files needed. */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    // ---- particles -----------------------------------------------------
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    pg.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    pg.setDrawRange(0, 0);

    const tex = dotTexture();
    const pmat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: `
        attribute float size;
        varying vec3 vColour;
        void main() {
          vColour = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (320.0 / max(-mv.z, 1.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vColour;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          if (t.a < 0.02) discard;
          gl_FragColor = vec4(vColour, t.a);
        }`,
      transparent: true, depthWrite: false, vertexColors: true,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(pg, pmat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = { alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grow: 0, r: 1, g: 1, b: 1, fade: 1, drag: 0.9, additive: false };
    }
    this.pCount = 0;

    // Additive pass for fire and flashes, so they glow rather than fog.
    const gmat = pmat.clone();
    gmat.uniforms = { map: { value: tex } };
    gmat.blending = THREE.AdditiveBlending;
    const gg = new THREE.BufferGeometry();
    this.gPos = new Float32Array(1200 * 3);
    this.gCol = new Float32Array(1200 * 3);
    this.gSize = new Float32Array(1200);
    gg.setAttribute('position', new THREE.BufferAttribute(this.gPos, 3));
    gg.setAttribute('color', new THREE.BufferAttribute(this.gCol, 3));
    gg.setAttribute('size', new THREE.BufferAttribute(this.gSize, 1));
    gg.setDrawRange(0, 0);
    this.glow = new THREE.Points(gg, gmat);
    this.glow.frustumCulled = false;
    scene.add(this.glow);

    // ---- tracers -------------------------------------------------------
    const tg = new THREE.BufferGeometry();
    this.tPos = new Float32Array(MAX_TRACERS * 6);
    this.tCol = new Float32Array(MAX_TRACERS * 6);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3));
    tg.setDrawRange(0, 0);
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);

    // ---- decals --------------------------------------------------------
    this.decalGroup = new THREE.Group();
    scene.add(this.decalGroup);
    this.decalMat = new THREE.MeshBasicMaterial({
      color: 0x2a241c, transparent: true, opacity: 0.55, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3,
    });
    this.decalGeom = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
    this.decals = [];

    // A single light for the biggest flash on screen — cheaper than one each.
    this.flash = new THREE.PointLight(0xffcc77, 0, 90, 2);
    scene.add(this.flash);
    this.flashLife = 0;
  }

  // ---- spawning ---------------------------------------------------------

  spawn(o) {
    // Reuse the oldest slot when the pool is full: new events matter more.
    let p = null;
    for (let i = 0; i < 40; i++) {
      const c = this.particles[(this.cursor = (this.cursor + 1 | 0) % MAX_PARTICLES)];
      if (!c.alive) { p = c; break; }
    }
    if (!p) p = this.particles[this.cursor];
    Object.assign(p, o);
    p.alive = true;
    p.max = o.life;
    return p;
  }

  puff(x, y, z, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random();
      this.spawn({
        x: x + (Math.random() - 0.5) * (opts.spread ?? 1),
        y: y + Math.random() * (opts.spread ?? 1) * 0.5,
        z: z + (Math.random() - 0.5) * (opts.spread ?? 1),
        vx: Math.cos(a) * r * (opts.speed ?? 2),
        vy: (opts.rise ?? 1.4) * (0.5 + Math.random()),
        vz: Math.sin(a) * r * (opts.speed ?? 2),
        life: (opts.life ?? 1.6) * (0.7 + Math.random() * 0.6),
        size: (opts.size ?? 1.6) * (0.7 + Math.random() * 0.7),
        grow: opts.grow ?? 2.2,
        r: opts.r ?? 0.4, g: opts.g ?? 0.38, b: opts.b ?? 0.35,
        drag: opts.drag ?? 0.86, gravity: opts.gravity ?? 0,
        additive: !!opts.additive, fade: opts.fadeIn ?? 1,
      });
    }
  }

  muzzleFlash(x, y, z, yaw, calibre = 8, small = false) {
    const scale = small ? 0.4 : Math.max(0.6, calibre / 60);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (let i = 0; i < (small ? 2 : 7); i++) {
      const t = i / 7;
      this.spawn({
        x: x + fx * t * scale * 1.6, y: y + (Math.random() - 0.5) * 0.1, z: z + fz * t * scale * 1.6,
        vx: fx * 9 * scale, vy: 1.2, vz: fz * 9 * scale,
        life: 0.1 + Math.random() * 0.08, size: (1.4 - t * 0.6) * scale * 2.4, grow: -1.4,
        r: 1.0, g: 0.82, b: 0.42, drag: 0.5, additive: true,
      });
    }
    if (!small) {
      // Blast dust kicked off the ground by the muzzle.
      this.puff(x + fx * scale, y, z + fz * scale, 5, {
        spread: scale * 2, speed: 5 * scale, rise: 0.6, life: 1.3, size: 2.2 * scale,
        r: 0.52, g: 0.48, b: 0.4, grow: 3.4,
      });
      this.lightFlash(x, y, z, 0.9 * scale, 0xffcc77);
    }
  }

  lightFlash(x, y, z, power, colour) {
    if (power < this.flashLife) return;
    this.flash.position.set(x, y + 1, z);
    this.flash.color.setHex(colour);
    this.flash.intensity = power * 260;
    this.flashLife = power;
  }

  explosion(x, y, z, kg) {
    const r = Math.max(1.2, blastRadius(kg));
    const n = Math.min(60, 10 + kg * 16);
    // Fireball.
    for (let i = 0; i < n * 0.4; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      this.spawn({
        x, y: y + 0.2, z,
        vx: Math.cos(a) * Math.cos(e) * r * 3, vy: Math.sin(e) * r * 3.4, vz: Math.sin(a) * Math.cos(e) * r * 3,
        life: 0.22 + Math.random() * 0.2, size: r * 1.2, grow: 3.0,
        r: 1.0, g: 0.62 + Math.random() * 0.3, b: 0.2, drag: 0.72, additive: true,
      });
    }
    // Smoke and thrown earth.
    this.puff(x, y + 0.4, z, Math.round(n * 0.6), {
      spread: r * 0.8, speed: r * 2.4, rise: r * 1.4, life: 2.4 + kg * 0.4,
      size: r * 1.1, grow: 3.6, r: 0.3, g: 0.28, b: 0.26, drag: 0.9,
    });
    for (let i = 0; i < n * 0.5; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.4 + Math.random();
      this.spawn({
        x, y: y + 0.2, z,
        vx: Math.cos(a) * Math.cos(e) * r * 5, vy: Math.sin(e) * r * 6, vz: Math.sin(a) * Math.cos(e) * r * 5,
        life: 0.8 + Math.random() * 0.8, size: 0.5 + Math.random() * 0.5, grow: 0,
        r: 0.34, g: 0.28, b: 0.2, drag: 0.99, gravity: -16,
      });
    }
    this.lightFlash(x, y, z, Math.min(3, r * 0.5), 0xffb055);
    this.addDecal(x, z, Math.min(r * 0.8, 6), 0.55);
  }

  impact(x, y, z, kind) {
    if (kind === 'blood') {
      this.puff(x, y, z, 4, { spread: 0.3, speed: 2.4, rise: 1, life: 0.5, size: 0.32, grow: 0.4, r: 0.42, g: 0.08, b: 0.07, gravity: -9 });
      return;
    }
    if (kind === 'spark') {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2, e = Math.random() * 1.4;
        this.spawn({
          x, y, z,
          vx: Math.cos(a) * Math.cos(e) * 16, vy: Math.sin(e) * 14, vz: Math.sin(a) * Math.cos(e) * 16,
          life: 0.3 + Math.random() * 0.3, size: 0.3, grow: -0.3,
          r: 1, g: 0.85, b: 0.5, drag: 0.97, gravity: -18, additive: true,
        });
      }
      return;
    }
    const dusty = kind === 'dust';
    this.puff(x, y, z, dusty ? 6 : 4, {
      spread: 0.4, speed: 2.2, rise: 1.6, life: 0.8, size: dusty ? 0.9 : 0.55, grow: 2.0,
      r: dusty ? 0.66 : 0.42, g: dusty ? 0.62 : 0.37, b: dusty ? 0.55 : 0.3,
    });
  }

  ricochet(x, y, z, nx, nz) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      this.spawn({
        x, y, z,
        vx: -nx * 20 + Math.cos(a) * 12, vy: Math.sin(e) * 16, vz: -nz * 20 + Math.sin(a) * 12,
        life: 0.45 + Math.random() * 0.4, size: 0.34, grow: -0.2,
        r: 1, g: 0.8, b: 0.42, drag: 0.985, gravity: -14, additive: true,
      });
    }
    this.lightFlash(x, y, z, 0.5, 0xffcc88);
  }

  penetration(x, y, z) {
    this.impact(x, y, z, 'spark');
    this.puff(x, y, z, 5, { spread: 0.5, speed: 4, rise: 2.4, life: 1.0, size: 0.8, grow: 2.2, r: 0.22, g: 0.2, b: 0.2 });
    this.lightFlash(x, y, z, 0.7, 0xffaa55);
  }

  ammoBlast(x, y, z) {
    this.explosion(x, y, z, 9);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.7 + Math.random() * 0.8;
      this.spawn({
        x, y: y + 1, z,
        vx: Math.cos(a) * Math.cos(e) * 26, vy: Math.sin(e) * 34, vz: Math.sin(a) * Math.cos(e) * 26,
        life: 1.6 + Math.random(), size: 0.7, grow: 0,
        r: 1, g: 0.55, b: 0.2, drag: 0.995, gravity: -18, additive: true,
      });
    }
  }

  /** Continuous sources: burning wrecks, smoking engines, track dust. */
  fire(x, y, z, dt, intensity = 1) {
    if (Math.random() > dt * 26 * intensity) return;
    this.spawn({
      x: x + (Math.random() - 0.5) * 1.4, y: y + 0.4, z: z + (Math.random() - 0.5) * 1.4,
      vx: (Math.random() - 0.5) * 1.2, vy: 4 + Math.random() * 3, vz: (Math.random() - 0.5) * 1.2,
      life: 0.5 + Math.random() * 0.3, size: 1.6, grow: 1.4,
      r: 1, g: 0.5 + Math.random() * 0.3, b: 0.14, drag: 0.92, additive: true,
    });
    this.puff(x, y + 1.4, z, 1, {
      spread: 1.2, speed: 0.7, rise: 5.5, life: 4.5, size: 2.4, grow: 4.5,
      r: 0.13, g: 0.12, b: 0.12, drag: 0.97,
    });
  }

  smoke(x, y, z, dt, intensity = 1) {
    if (Math.random() > dt * 8 * intensity) return;
    this.puff(x, y + 1, z, 1, {
      spread: 1, speed: 0.5, rise: 3.4, life: 3.4, size: 1.8, grow: 3.6,
      r: 0.32, g: 0.31, b: 0.3, drag: 0.97,
    });
  }

  dust(x, y, z, dt, speed) {
    if (Math.random() > dt * Math.min(30, speed * 3)) return;
    this.puff(x, y + 0.15, z, 1, {
      spread: 1.6, speed: 1.2, rise: 0.8, life: 1.6, size: 1.5, grow: 3.0,
      r: 0.58, g: 0.54, b: 0.46, drag: 0.9,
    });
  }

  addDecal(x, z, radius, opacity) {
    const mat = this.decalMat.clone();
    mat.opacity = opacity;
    const m = new THREE.Mesh(this.decalGeom, mat);
    m.scale.setScalar(radius);
    m.position.set(x, 0, z);
    m.renderOrder = 1;
    this.decalGroup.add(m);
    this.decals.push({ mesh: m, born: this.time });
    // Keep the count bounded; the oldest marks fade out first.
    while (this.decals.length > 240) {
      const old = this.decals.shift();
      this.decalGroup.remove(old.mesh);
      old.mesh.material.dispose();
    }
    return m;
  }

  // ---- per-frame --------------------------------------------------------

  update(dt, terrain, projectiles) {
    this.time += dt;
    this.cursor = this.cursor || 0;

    let n = 0, gn = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vz *= d;
      p.vy = p.vy * d + (p.gravity || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (terrain && p.y < terrain.heightAt(p.x, p.z)) {
        p.y = terrain.heightAt(p.x, p.z);
        p.vy = 0; p.vx *= 0.5; p.vz *= 0.5;
      }
      const t = p.life / p.max;
      const size = Math.max(0.02, p.size + (1 - t) * p.grow);
      const alpha = p.additive ? t * t : Math.min(1, t * 2.4);

      if (p.additive) {
        if (gn >= 1200) continue;
        this.gPos[gn * 3] = p.x; this.gPos[gn * 3 + 1] = p.y; this.gPos[gn * 3 + 2] = p.z;
        this.gCol[gn * 3] = p.r * alpha; this.gCol[gn * 3 + 1] = p.g * alpha; this.gCol[gn * 3 + 2] = p.b * alpha;
        this.gSize[gn] = size;
        gn++;
      } else {
        this.pPos[n * 3] = p.x; this.pPos[n * 3 + 1] = p.y; this.pPos[n * 3 + 2] = p.z;
        // Fade non-additive particles by pulling them towards the fog colour.
        const f = 1 - alpha;
        this.pCol[n * 3] = p.r * alpha + 0.60 * f;
        this.pCol[n * 3 + 1] = p.g * alpha + 0.65 * f;
        this.pCol[n * 3 + 2] = p.b * alpha + 0.69 * f;
        this.pSize[n] = size;
        n++;
      }
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.size.needsUpdate = true;
    this.glow.geometry.setDrawRange(0, gn);
    this.glow.geometry.attributes.position.needsUpdate = true;
    this.glow.geometry.attributes.color.needsUpdate = true;
    this.glow.geometry.attributes.size.needsUpdate = true;

    // Tracers: a short bright streak behind each round in flight.
    let t = 0;
    for (const p of projectiles) {
      if (!p.tracer || t >= MAX_TRACERS) continue;
      const v = Math.hypot(p.vx, p.vy, p.vz) || 1;
      const len = Math.min(14, v * 0.022);
      const i6 = t * 6;
      this.tPos[i6] = p.x; this.tPos[i6 + 1] = p.y; this.tPos[i6 + 2] = p.z;
      this.tPos[i6 + 3] = p.x - (p.vx / v) * len;
      this.tPos[i6 + 4] = p.y - (p.vy / v) * len;
      this.tPos[i6 + 5] = p.z - (p.vz / v) * len;
      const warm = p.shell === 'bullet';
      const r = warm ? 1.0 : 1.0, g = warm ? 0.72 : 0.5, b = warm ? 0.3 : 0.16;
      this.tCol[i6] = r; this.tCol[i6 + 1] = g; this.tCol[i6 + 2] = b;
      this.tCol[i6 + 3] = r * 0.15; this.tCol[i6 + 4] = g * 0.15; this.tCol[i6 + 5] = b * 0.15;
      t++;
    }
    this.tracers.geometry.setDrawRange(0, t * 2);
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;

    // Flash light decays fast.
    this.flashLife = Math.max(0, this.flashLife - dt * 9);
    this.flash.intensity = this.flashLife * 260;
  }

  /** Drain the simulation's effect queue into actual visuals. */
  consume(world) {
    for (const e of world.effects) {
      switch (e.type) {
        case 'muzzle': this.muzzleFlash(e.x, e.y, e.z, e.yaw, e.calibre ?? 8, e.small); break;
        case 'explosion': this.explosion(e.x, e.y, e.z, e.kg ?? 0.5); break;
        case 'ammoBlast': this.ammoBlast(e.x, e.y, e.z); break;
        case 'impact': this.impact(e.x, e.y, e.z, e.kind); break;
        case 'ricochet': this.ricochet(e.x, e.y, e.z, e.nx ?? 0, e.nz ?? 1); break;
        case 'penetration': this.penetration(e.x, e.y, e.z); break;
        case 'blood': this.impact(e.x, e.y, e.z, 'blood'); break;
        case 'propBreak':
          this.puff(e.x, e.y + 1, e.z, 10, { spread: e.radius, speed: 3, rise: 2, life: 1.8, size: 1.4, grow: 3, r: 0.55, g: 0.5, b: 0.42 });
          break;
        case 'dustRing':
          this.puff(e.x, e.y, e.z, 6, { spread: 3, speed: 6, rise: 0.4, life: 1.4, size: 2, grow: 3.4, r: 0.55, g: 0.51, b: 0.43 });
          break;
        default: break;
      }
    }
    world.effects.length = 0;
  }
}
