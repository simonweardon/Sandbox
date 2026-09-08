// The camera: an RTS rig that can also drop behind a unit under direct control.

import * as THREE from '../../vendor/three.module.js';
import { clamp, lerp, DEG, turnTowards } from '../core/util.js';

export class CameraRig {
  constructor(camera, terrain) {
    this.cam = camera;
    this.terrain = terrain;
    this.focus = new THREE.Vector3(terrain.size * 0.5, 0, terrain.size * 0.12);
    this.yaw = 0;
    this.pitch = 52 * DEG;
    this.distance = 70;
    this.targetDistance = 70;
    this.mode = 'rts';
    this.shake = 0;
    this.followYaw = 0;
  }

  /** Pan in the direction the camera is facing, not along the world axes. */
  pan(forward, right, dt) {
    const speed = clamp(this.distance * 0.9, 24, 220) * dt;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.focus.x += (s * forward + c * right) * speed;
    this.focus.z += (c * forward - s * right) * speed;
    this.clampFocus();
  }

  panScreen(dxPx, dyPx, viewportH) {
    const scale = (this.distance / viewportH) * 2.2;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.focus.x -= (c * dxPx - s * dyPx) * scale;
    this.focus.z -= (-s * dxPx - c * dyPx) * scale;
    this.clampFocus();
  }

  clampFocus() {
    const m = 20;
    this.focus.x = clamp(this.focus.x, -m, this.terrain.size + m);
    this.focus.z = clamp(this.focus.z, -m, this.terrain.size + m);
  }

  zoom(delta) {
    this.targetDistance = clamp(this.targetDistance * Math.pow(1.16, delta), 14, 340);
  }

  rotate(dYaw, dPitch) {
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, 16 * DEG, 86 * DEG);
  }

  kick(power) { this.shake = Math.min(1.4, this.shake + power); }

  update(dt, followUnit) {
    this.distance = lerp(this.distance, this.targetDistance, 1 - Math.pow(0.001, dt));
    this.shake = Math.max(0, this.shake - dt * 2.2);

    if (followUnit) {
      // Over the shoulder of whatever is being driven.
      const yaw = followUnit.yaw + (followUnit.turretYaw || 0);
      this.followYaw = turnTowards(this.followYaw, yaw, 6 * dt);
      const back = followUnit.kind === 'vehicle' ? 15 : 7.5;
      const up = followUnit.kind === 'vehicle' ? 7.0 : 3.6;
      const fx = followUnit.x - Math.sin(this.followYaw) * back;
      const fz = followUnit.z - Math.cos(this.followYaw) * back;
      const gy = this.terrain.heightAt(fx, fz);
      this.cam.position.set(fx, Math.max(gy + 1.6, (followUnit.y ?? 0) + up), fz);
      const ly = (followUnit.y ?? 0) + (followUnit.kind === 'vehicle' ? 2.2 : 1.5);
      this.cam.lookAt(followUnit.x + Math.sin(yaw) * 12, ly, followUnit.z + Math.cos(yaw) * 12);
      this.focus.set(followUnit.x, followUnit.y ?? 0, followUnit.z);
    } else {
      this.focus.y = this.terrain.heightAt(this.focus.x, this.focus.z);
      const h = Math.sin(this.pitch) * this.distance;
      const r = Math.cos(this.pitch) * this.distance;
      this.cam.position.set(
        this.focus.x - Math.sin(this.yaw) * r,
        this.focus.y + h,
        this.focus.z - Math.cos(this.yaw) * r,
      );
      this.cam.lookAt(this.focus);
    }

    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.5;
      this.cam.position.x += (Math.random() - 0.5) * s;
      this.cam.position.y += (Math.random() - 0.5) * s;
      this.cam.position.z += (Math.random() - 0.5) * s;
    }
  }

  /** Where a screen ray meets the ground. */
  groundPoint(ndcX, ndcY, out = new THREE.Vector3()) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: ndcX, y: ndcY }, this.cam);
    const o = ray.ray.origin, d = ray.ray.direction;
    // March until the ray drops below the heightfield, then bisect.
    let t = 0, step = 2, prev = o.y - this.terrain.heightAt(o.x, o.z);
    for (let i = 0; i < 600; i++) {
      t += step;
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const h = y - this.terrain.heightAt(x, z);
      if (h <= 0 && prev > 0) {
        let lo = t - step, hi = t;
        for (let k = 0; k < 24; k++) {
          const mid = (lo + hi) / 2;
          const mx = o.x + d.x * mid, my = o.y + d.y * mid, mz = o.z + d.z * mid;
          if (my - this.terrain.heightAt(mx, mz) > 0) lo = mid; else hi = mid;
        }
        out.set(o.x + d.x * hi, o.y + d.y * hi, o.z + d.z * hi);
        return out;
      }
      prev = h;
      step = Math.min(14, step * 1.04);
      if (t > 4000) break;
    }
    // Fall back to the plane at y = 0.
    if (Math.abs(d.y) > 1e-5) {
      const tt = -o.y / d.y;
      if (tt > 0) { out.set(o.x + d.x * tt, 0, o.z + d.z * tt); return out; }
    }
    out.copy(this.focus);
    return out;
  }
}
