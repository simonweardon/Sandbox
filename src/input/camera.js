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

  /**
   * The camera's own axes on the ground.
   *
   * `update` places the camera at focus - (sin yaw, ., cos yaw) * r looking at
   * the focus, so forward is (sin yaw, cos yaw) and screen-right, being
   * forward crossed with up, is (-cos yaw, sin yaw). Getting that cross
   * product backwards is what made left and right swap.
   */
  basis() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { fx: s, fz: c, rx: -c, rz: s };
  }

  /** Pan in the direction the camera is facing, not along the world axes. */
  pan(forward, right, dt) {
    this.glide = null;
    const speed = clamp(this.distance * 0.9, 24, 220) * dt;
    const { fx, fz, rx, rz } = this.basis();
    this.focus.x += (fx * forward + rx * right) * speed;
    this.focus.z += (fz * forward + rz * right) * speed;
    this.clampFocus();
  }

  /**
   * Drag the ground itself: the point under the finger stays under the finger.
   * The vertical component covers more ground than the horizontal because the
   * camera is looking down at an angle, which is why a single scale factor
   * always felt wrong — too slow one way, too fast the other.
   */
  panScreen(dxPx, dyPx, viewportH, fovDeg = 48) {
    const groundPerPx = (2 * this.distance * Math.tan((fovDeg / 2) * DEG)) / viewportH;
    const dx = dxPx * groundPerPx;
    const dy = dyPx * (groundPerPx / Math.max(0.35, Math.sin(this.pitch)));
    const { fx, fz, rx, rz } = this.basis();
    // Finger right: the ground should go right, so the camera goes left, which
    // is minus screen-right. Finger down: the ground comes towards you, so the
    // camera goes forward.
    this.focus.x += -rx * dx + fx * dy;
    this.focus.z += -rz * dx + fz * dy;
    this.clampFocus();
  }

  /** A flick keeps going, so crossing the map does not mean ten short drags. */
  fling(vxPx, vyPx, viewportH, fovDeg = 48) {
    const groundPerPx = (2 * this.distance * Math.tan((fovDeg / 2) * DEG)) / viewportH;
    const dx = vxPx * groundPerPx;
    const dy = vyPx * (groundPerPx / Math.max(0.35, Math.sin(this.pitch)));
    const { fx, fz, rx, rz } = this.basis();
    this.glide = {
      x: -rx * dx + fx * dy,
      z: -rz * dx + fz * dy,
    };
  }

  /** Send the camera somewhere directly — used by the minimap. */
  jumpTo(x, z) {
    this.focus.x = x;
    this.focus.z = z;
    this.glide = null;
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

    // Coast to a stop after a flick.
    if (this.glide) {
      this.focus.x += this.glide.x * dt;
      this.focus.z += this.glide.z * dt;
      const decay = Math.pow(0.02, dt);
      this.glide.x *= decay;
      this.glide.z *= decay;
      if (Math.hypot(this.glide.x, this.glide.z) < 1.5) this.glide = null;
      this.clampFocus();
    }

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
