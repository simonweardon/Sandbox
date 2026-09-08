// The view: keeps a mesh in step with every entity the simulation owns.
//
// Nothing in here decides anything. It reads the world, creates or drops
// meshes to match, poses them, and hides whatever the player's side has not
// spotted. All the tactical state lives in sim/.

import * as THREE from '../../vendor/three.module.js';
import { KIND } from '../sim/world.js';
import { STANCE_HEIGHT } from '../sim/units.js';
import { visibleTo } from '../sim/vision.js';
import { FACTIONS } from '../data/factions.js';
import { buildVehicle } from './models/vehicle.js';
import { buildSoldier, poseSoldier, buildCorpse } from './models/soldier.js';
import { buildGunModel } from './models/gun.js';
import { buildProp, buildWreckedProp } from './models/scenery.js';
import { buildTerrainMesh, buildTerrainSkirt } from './terrain.js';
import { clamp, angleDelta, DEG } from '../core/util.js';

/** Burnt out: paint gone, everything one colour of scorched steel. */
const GUTTED = new THREE.MeshLambertMaterial({ color: 0x2f2b27 });
/** Knocked out but intact: the paint darkened, the markings still there. */
const ABANDONED = new THREE.MeshLambertMaterial({ color: 0x5a564c, vertexColors: true });

export class View {
  constructor(scene, battle) {
    this.scene = scene;
    this.battle = battle;
    this.world = battle.world;
    this.models = new Map();       // entity id -> model record
    this.propModels = new Map();
    this.corpseCount = 0;

    this.units = new THREE.Group();
    this.scenery = new THREE.Group();
    this.markers = new THREE.Group();
    scene.add(this.units, this.scenery, this.markers);

    scene.add(buildTerrainMesh(this.world.terrain));
    scene.add(buildTerrainSkirt(this.world.terrain));

    this.buildScenery();
    this.buildFlags();
    this.buildSelectionPool();
  }

  buildScenery() {
    for (const p of this.world.props) {
      const mesh = buildProp(p);
      mesh.position.set(p.x, p.y ?? this.world.terrain.heightAt(p.x, p.z), p.z);
      mesh.rotation.y = p.yaw || 0;
      if (p.scale) mesh.scale.setScalar(p.scale);
      this.scenery.add(mesh);
      this.propModels.set(p.id, { mesh, broken: false });
    }
  }

  // ---- capture points ---------------------------------------------------

  buildFlags() {
    this.flagModels = [];
    const T = this.world.terrain;
    const poleGeom = new THREE.CylinderGeometry(0.07, 0.09, 4.6, 6);
    const clothGeom = new THREE.PlaneGeometry(2.0, 1.25);
    for (const f of this.world.flags) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeom, new THREE.MeshLambertMaterial({ color: 0x8a8272 }));
      pole.position.y = 2.3;
      pole.castShadow = true;
      g.add(pole);
      const cloth = new THREE.Mesh(clothGeom, new THREE.MeshLambertMaterial({
        color: 0xcccccc, side: THREE.DoubleSide,
      }));
      cloth.position.set(1.05, 3.9, 0);
      g.add(cloth);
      g.position.set(f.x, T.heightAt(f.x, f.z), f.z);
      this.markers.add(g);

      // The capture radius is drawn as a loop that follows the ground, so it
      // does not slice through every rise it crosses.
      const segs = 72;
      const pts = new Float32Array((segs + 1) * 3);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const x = f.x + Math.cos(a) * f.radius, z = f.z + Math.sin(a) * f.radius;
        pts[i * 3] = x; pts[i * 3 + 1] = T.heightAt(x, z) + 0.25; pts[i * 3 + 2] = z;
      }
      const ringGeom = new THREE.BufferGeometry();
      ringGeom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const ring = new THREE.Line(ringGeom, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.5,
      }));
      this.markers.add(ring);
      this.flagModels.push({ f, group: g, cloth, ring });
    }
  }

  buildSelectionPool() {
    this.selGeom = new THREE.RingGeometry(0.93, 1, 32).rotateX(-Math.PI / 2);
    this.selMat = new THREE.MeshBasicMaterial({ color: 0x8fe08f, transparent: true, opacity: 0.75, depthWrite: false, depthTest: false });
    this.selPool = [];
    this.selGroup = new THREE.Group();
    this.selGroup.renderOrder = 5;
    this.scene.add(this.selGroup);

    // Order markers: where a selected unit has been told to go.
    this.pathMat = new THREE.LineBasicMaterial({ color: 0x8fe08f, transparent: true, opacity: 0.5, depthTest: false });
    this.pathGeom = new THREE.BufferGeometry();
    this.pathBuf = new Float32Array(4096 * 3);
    this.pathGeom.setAttribute('position', new THREE.BufferAttribute(this.pathBuf, 3));
    this.pathGeom.setDrawRange(0, 0);
    this.pathLines = new THREE.LineSegments(this.pathGeom, this.pathMat);
    this.pathLines.frustumCulled = false;
    this.pathLines.renderOrder = 5;
    this.scene.add(this.pathLines);
  }

  // ---- model lifecycle ---------------------------------------------------

  modelFor(e) {
    let rec = this.models.get(e.id);
    if (rec) return rec;
    if (e.kind === KIND.VEHICLE) {
      const m = buildVehicle(e.def);
      this.units.add(m.root);
      rec = { kind: 'vehicle', ...m };
    } else if (e.kind === KIND.SOLDIER) {
      const m = buildSoldier(e.faction, e.role, e.inv.primary);
      this.units.add(m.root);
      rec = { kind: 'soldier', ...m };
    } else if (e.kind === KIND.GUN) {
      const m = buildGunModel(e.def);
      this.units.add(m.root);
      rec = { kind: 'gun', ...m };
    } else {
      return null;
    }
    this.models.set(e.id, rec);
    return rec;
  }

  drop(id) {
    const rec = this.models.get(id);
    if (!rec) return;
    this.units.remove(rec.root);
    this.models.delete(id);
  }

  // ---- per-frame ---------------------------------------------------------

  update(dt, effects, selection, playerSide) {
    const world = this.world, T = world.terrain;
    const seen = new Set();

    for (const e of world.entities) {
      if (e.kind === KIND.SOLDIER && e.inVehicle) { this.drop(e.id); continue; }
      const rec = this.modelFor(e);
      if (!rec) continue;
      seen.add(e.id);

      const visible = visibleTo(world, e, playerSide);
      rec.root.visible = visible;
      if (!visible) continue;

      if (rec.kind === 'vehicle') this.updateVehicle(e, rec, dt, effects);
      else if (rec.kind === 'soldier') this.updateSoldier(e, rec, dt);
      else this.updateGun(e, rec, dt);
    }

    for (const id of [...this.models.keys()]) if (!seen.has(id)) this.drop(id);

    this.updateCorpses();
    this.updateProps();
    this.updateFlags(dt);
    this.updateSelection(selection);
  }

  updateVehicle(v, rec, dt, effects) {
    const T = this.world.terrain;
    rec.root.position.set(v.x, v.y, v.z);
    rec.root.rotation.set(v.pitch || 0, v.yaw, v.roll || 0, 'YXZ');

    if (rec.turret) {
      rec.turret.rotation.y = v.turretYaw;
      // Recoil: the gun runs back and returns.
      if (rec.gun) {
        v.recoil = Math.max(0, (v.recoil || 0) - dt * 4.5);
        rec.gun.position.z = rec.tpl.gunPivotZ - v.recoil * 0.55;
        rec.gun.rotation.x = -(v.gunPitch || 0);
      }
    }
    // Road wheels turn with the ground the vehicle covers.
    if (rec.wheels.length && Math.abs(v.speed) > 0.01) {
      const spin = (v.speed * dt) / Math.max(0.2, rec.tpl.wheelBaseR ?? 0.4);
      for (const w of rec.wheels) w.rotation.x += spin;
    }

    if (v.destroyed || v.abandoned) {
      // Wrecks sit dark and still.
      if (!rec.burnt || (v.destroyed && !rec.gutted)) {
        rec.burnt = true;
        rec.gutted = v.destroyed;
        // Scorched, not painted out: the shape has to stay readable so a wreck
        // can still be recognised as cover, or as something worth recrewing.
        // Two shared materials do it — cloning one per mesh leaked hundreds
        // of them over a long battle.
        const mat = v.destroyed ? GUTTED : ABANDONED;
        rec.root.traverse((o) => { if (o.isMesh) o.material = mat; });
      }
      if (v.turretBlownOff && rec.turret && !rec.turretThrown) {
        rec.turretThrown = true;
        rec.turret.rotation.z = 1.1;
        rec.turret.position.y -= 0.35;
        rec.turret.position.x += 1.2;
      }
    }
    if (v.onFire > 0) effects.fire(v.x, v.y + 1.2, v.z, dt, 1);
    else if (v.smoking > 0) effects.smoke(v.x, v.y + 1.2, v.z, dt, 1);
    if (Math.abs(v.speed) > 1.5 && !v.def.model.wheeled) {
      effects.dust(v.x - Math.sin(v.yaw) * v.def.model.hull.len * 0.4, v.y,
        v.z - Math.cos(v.yaw) * v.def.model.hull.len * 0.4, dt, Math.abs(v.speed));
    }
  }

  updateSoldier(s, rec, dt) {
    rec.root.position.set(s.x, s.y, s.z);
    rec.root.rotation.y = s.yaw;
    const firing = Math.max(0, 1 - (this.world.time - (s.lastFired ?? -9)) * 7);
    poseSoldier(rec, {
      phase: s.animPhase, moving: s.moving, stance: s.stance,
      aim: s.target ? clamp((this.aimPitch(s) || 0), -0.5, 0.5) : 0,
      firing,
    });
  }

  aimPitch(s) {
    if (!s.target) return 0;
    const dy = (s.target.y ?? 0) - s.y;
    const d = Math.hypot(s.target.x - s.x, s.target.z - s.z) || 1;
    return -Math.atan2(dy, d);
  }

  updateGun(g, rec, dt) {
    rec.root.position.set(g.x, g.y, g.z);
    rec.root.rotation.y = g.yaw;
    rec.turret.rotation.y = g.turretYaw;
    if (!rec.mortar) rec.gun.rotation.x = -(g.gunPitch || 0);
    if (g.destroyed && !rec.burnt) {
      rec.burnt = true;
      rec.root.rotation.z = 0.35;
      rec.root.traverse((o) => { if (o.isMesh) o.material = GUTTED; });
    }
  }

  updateCorpses() {
    // Bodies are added once and never move again.
    while (this.corpseCount < this.world.corpses.length) {
      const c = this.world.corpses[this.corpseCount++];
      const m = buildCorpse(c.faction, c.role, c.inv?.primary || 'kar98k');
      m.position.set(c.x, c.y, c.z);
      m.rotation.y = c.yaw + Math.PI * 0.5;
      this.scenery.add(m);
      c.mesh = m;
      // Keep the field from filling up with bodies for ever.
      if (this.corpseCount > 260) {
        const old = this.world.corpses[this.corpseCount - 261];
        if (old?.mesh) this.scenery.remove(old.mesh);
      }
    }
  }

  updateProps() {
    for (const p of this.world.props) {
      const rec = this.propModels.get(p.id);
      if (!rec || rec.broken || p.alive) continue;
      rec.broken = true;
      this.scenery.remove(rec.mesh);
      const wreck = buildWreckedProp(p);
      wreck.position.set(p.x, p.y ?? this.world.terrain.heightAt(p.x, p.z), p.z);
      wreck.rotation.y = p.yaw || 0;
      this.scenery.add(wreck);
      rec.mesh = wreck;
    }
  }

  updateFlags(dt) {
    for (const fm of this.flagModels) {
      const f = fm.f;
      const owner = FACTIONS[f.owner];
      const col = owner ? owner.colour : 0xd8d8d0;
      fm.cloth.material.color.setHex(col);
      fm.ring.material.color.setHex(col);
      fm.ring.material.opacity = f.contestedBy ? 0.45 + Math.sin(this.world.time * 6) * 0.3 : 0.34;
      // The flag rises as it is taken and sinks as it is lost.
      fm.cloth.position.y = 1.5 + f.progress * 2.5;
      fm.cloth.rotation.y = Math.sin(this.world.time * 1.6 + f.x) * 0.25;
    }
  }

  updateSelection(selection) {
    let i = 0;
    for (const u of selection) {
      if (!u.alive) continue;
      let ring = this.selPool[i];
      if (!ring) {
        ring = new THREE.Mesh(this.selGeom, this.selMat);
        this.selPool.push(ring);
        this.selGroup.add(ring);
      }
      const r = u.kind === KIND.VEHICLE ? Math.max(u.def.model.hull.len, u.def.model.hull.wid) * 0.5
        : u.kind === KIND.GUN ? 2.0 : 0.75;
      ring.scale.setScalar(r);
      ring.position.set(u.x, (u.y ?? 0) + 0.12, u.z);
      ring.visible = true;
      i++;
    }
    for (; i < this.selPool.length; i++) this.selPool[i].visible = false;

    // Draw the queued path of everything selected.
    let n = 0;
    const push = (ax, ay, az, bx, by, bz) => {
      if (n + 2 > 4096) return;
      this.pathBuf[n * 3] = ax; this.pathBuf[n * 3 + 1] = ay; this.pathBuf[n * 3 + 2] = az; n++;
      this.pathBuf[n * 3] = bx; this.pathBuf[n * 3 + 1] = by; this.pathBuf[n * 3 + 2] = bz; n++;
    };
    const T = this.world.terrain;
    for (const u of selection) {
      if (!u.path || u.pathIndex >= u.path.length) continue;
      let px = u.x, pz = u.z;
      for (let k = u.pathIndex; k < u.path.length; k++) {
        const w = u.path[k];
        push(px, T.heightAt(px, pz) + 0.3, pz, w.x, T.heightAt(w.x, w.z) + 0.3, w.z);
        px = w.x; pz = w.z;
      }
    }
    this.pathGeom.setDrawRange(0, n);
    this.pathGeom.attributes.position.needsUpdate = true;
  }
}
