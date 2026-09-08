// Direct Control.
//
// Take one unit and drive it yourself: WASD on the throttle and the tracks,
// the mouse on the gun, and the trigger under your finger. The important thing
// is that nothing is relaxed for you. The turret still traverses at six degrees
// a second in a Tiger, the loader still takes six seconds, the shell still
// drops over eight hundred metres, and the armour still decides what happens
// when it arrives. You are the crew, not an exception to the rules.

import * as THREE from '../../vendor/three.module.js';
import { KIND } from '../sim/world.js';
import { WEAPONS, SHELL } from '../data/weapons.js';
import { fireWeapon, leadTarget } from '../sim/ballistics.js';
import { fireVehicleGun, muzzlePoint } from '../sim/combat.js';
import { STANCE, STANCE_HEIGHT, STANCE_SPEED, crewAlive, gunReady, canDrive, disembark } from '../sim/units.js';
import { settleOnGround } from '../sim/orders.js';
import { clamp, angleDelta, turnTowards, DEG, dist } from '../core/util.js';

export class DirectControl {
  constructor(battle, rig) {
    this.battle = battle;
    this.rig = rig;
    this.unit = null;
    this.aim = new THREE.Vector3();
    this.aimRange = 300;
    this.keys = new Set();
    this.firing = false;
    this.secondary = false;
    this.message = '';
  }

  get active() { return !!this.unit; }

  take(unit) {
    if (!unit || !unit.alive) return false;
    if (unit.kind === KIND.SOLDIER && unit.inVehicle) return false;
    // An empty tank is a tank, not a crew. Somebody has to get in first.
    if (unit.kind === KIND.VEHICLE && (unit.destroyed || unit.abandoned || !unit.crew.some((c) => c.occupant))) {
      this.message = 'That vehicle has no crew aboard';
      return false;
    }
    if (unit.kind === KIND.GUN && (unit.destroyed || !unit.manned)) {
      this.message = 'That gun is unmanned';
      return false;
    }
    this.release();
    this.unit = unit;
    unit.controlled = true;
    unit.orders.length = 0;
    unit.path = [];
    this.rig.mode = 'direct';
    this.rig.followYaw = unit.yaw + (unit.turretYaw || 0);
    this.message = this.describe(unit);
    return true;
  }

  release() {
    if (!this.unit) return;
    this.unit.controlled = false;
    if (this.unit.kind === KIND.VEHICLE) { this.unit.throttle = 0; }
    this.unit = null;
    this.rig.mode = 'rts';
  }

  describe(u) {
    if (u.kind === KIND.VEHICLE) return `${u.def.name} — you are the crew`;
    if (u.kind === KIND.GUN) return `${u.def.name} — you are laying the gun`;
    return `${u.role} — direct control`;
  }

  /** Where the mouse is pointing, in the world. */
  setAimFromScreen(ndcX, ndcY) {
    const cam = this.rig.cam;
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: ndcX, y: ndcY }, cam);
    const terrain = this.battle.world.terrain;
    const o = ray.ray.origin, d = ray.ray.direction;
    let t = 1, step = 2.5, prev = o.y - terrain.heightAt(o.x, o.z);
    for (let i = 0; i < 500; i++) {
      t += step;
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (!terrain.inBounds(x, z)) break;
      const h = y - terrain.heightAt(x, z);
      if (h <= 0 && prev > 0) {
        this.aim.set(x, terrain.heightAt(x, z) + 0.6, z);
        this.aimRange = t;
        return;
      }
      prev = h;
      step = Math.min(12, step * 1.05);
      if (t > 2600) break;
    }
    // Nothing under the cursor: aim at a fixed distance along the ray.
    this.aim.copy(o).addScaledVector(d, 900);
    this.aimRange = 900;
  }

  update(dt) {
    const u = this.unit;
    if (!u) return;
    if (!u.alive || (u.kind === KIND.VEHICLE && u.destroyed) || (u.kind === KIND.GUN && u.destroyed)) {
      this.release();
      return;
    }
    // If the crew bail out from under you, control goes with them.
    if (u.kind === KIND.VEHICLE && u.abandoned) {
      this.message = 'The crew have bailed out';
      this.release();
      return;
    }
    if (u.kind === KIND.VEHICLE) this.driveVehicle(u, dt);
    else if (u.kind === KIND.GUN) this.layGun(u, dt);
    else this.moveSoldier(u, dt);
  }

  // ---- vehicles ---------------------------------------------------------

  driveVehicle(v, dt) {
    const k = this.keys;
    const world = this.battle.world;

    // Driver's controls.
    const drivable = canDrive(v);
    let want = 0;
    if (drivable) {
      if (k.has('KeyW')) want += 1;
      if (k.has('KeyS')) want -= 1;
    }
    const maxSpeed = v.def.maxSpeed * (world.terrain.groundAt(v.x, v.z) === 2 ? 1 : v.def.offroad);
    const target = want * maxSpeed * (want < 0 ? 0.45 : 1);
    const accel = v.def.accel * (Math.abs(target) > Math.abs(v.speed) ? 1 : 2.6);
    if (k.has('Space')) v.speed += clamp(-v.speed, -accel * 2 * dt, accel * 2 * dt);
    else v.speed += clamp(target - v.speed, -accel * dt, accel * dt);
    if (Math.abs(v.speed) < 0.03) v.speed = 0;

    let steer = 0;
    if (drivable) {
      if (k.has('KeyA')) steer -= 1;
      if (k.has('KeyD')) steer += 1;
    }
    // Tracked vehicles can turn on the spot; wheeled ones need to be moving.
    const pivot = !v.def.model.wheeled;
    const rate = v.def.turnRate * (Math.abs(v.speed) > 0.4 ? 1 : (pivot ? 0.55 : 0));
    v.yaw -= steer * rate * dt * Math.sign(v.speed >= 0 ? 1 : -1);

    if (v.speed !== 0) {
      const nx = v.x + Math.sin(v.yaw) * v.speed * dt;
      const nz = v.z + Math.cos(v.yaw) * v.speed * dt;
      if (world.terrain.inBounds(nx, nz) && this.battle.nav.passable(nx, nz, true)) {
        v.velX = (nx - v.x) / dt; v.velZ = (nz - v.z) / dt;
        v.x = nx; v.z = nz;
      } else v.speed = 0;
    } else { v.velX = v.velZ = 0; }
    settleOnGround(world, v);

    // Gunner's controls: traverse towards the aim, at the vehicle's own rate.
    const bearing = Math.atan2(this.aim.x - v.x, this.aim.z - v.z);
    const wanted = angleDelta(v.yaw, bearing);
    if (v.def.model.turret && !v.turretJammed) {
      const traverse = (v.def.traverse || 10) * DEG * (crewAlive(v, 'gunner') ? 1 : 0.4);
      const before = v.turretYaw;
      v.turretYaw = turnTowards(v.turretYaw, wanted, traverse * dt);
      this.onTarget = Math.abs(angleDelta(v.turretYaw, wanted)) < 0.6 * DEG;
      if (Math.abs(v.turretYaw - before) > 1e-4) for (const g of v.guns) g.aimProgress *= 0.6;
    } else {
      const arc = (v.def.gunArc ?? 10) * DEG;
      v.turretYaw = clamp(wanted, -arc, arc);
      this.onTarget = Math.abs(wanted) <= arc + 1e-3;
    }

    const dy = this.aim.y - (v.y + v.proxy.height * 0.7);
    v.gunPitch = clamp(Math.atan2(dy, Math.max(4, this.aimRange)),
      (v.def.gunElev?.[0] ?? -8) * DEG, (v.def.gunElev?.[1] ?? 20) * DEG);

    // Settle: a gunner who has just traversed needs a moment.
    for (const g of v.guns) {
      g.cooldown = Math.max(0, g.cooldown - dt);
      const w = WEAPONS[g.w];
      g.aimProgress = clamp(g.aimProgress + dt / w.aimTime, 0, 1);
    }

    if (this.firing) this.pullTrigger(v, false);
    if (this.secondary) this.pullTrigger(v, true);
  }

  pullTrigger(v, secondary) {
    if (v.destroyed || !gunReady(v) || v.gunBroken) return;
    const world = this.battle.world;
    const main = v.guns.find((g) => WEAPONS[g.w].cls === 'cannon');
    const mg = v.guns.find((g) => WEAPONS[g.w].cls !== 'cannon');
    const g = secondary ? (mg || main) : (main || mg);
    if (!g || g.cooldown > 0) return;

    const w = WEAPONS[g.w];
    const isCannon = w.cls === 'cannon';
    let shell = 'bullet';
    if (isCannon) {
      shell = v.selectedShell || 'ap';
      if ((v.ammo[shell] || 0) <= 0) {
        this.message = `Out of ${shell.toUpperCase()}`;
        return;
      }
    } else if ((v.ammo.bullet || 0) <= 0) return;

    // Fire exactly where the gun is pointing, not where the mouse is: if the
    // turret has not come round yet, the shell goes where the barrel is.
    const from = muzzlePoint(world, v, g);
    const barrel = v.yaw + (v.def.model.turret ? v.turretYaw : v.turretYaw);
    const reach = Math.max(30, this.aimRange);
    const aimAt = {
      x: from.x + Math.sin(barrel) * reach,
      y: from.y + Math.tan(v.gunPitch) * reach,
      z: from.z + Math.cos(barrel) * reach,
    };
    fireVehicleGun(this.battle, v, g, { ...aimAt, aimPoint: aimAt, kind: 'point' }, shell, reach);
    if (isCannon && w.caliber >= 57) this.rig.kick(0.55);
  }

  cycleShell() {
    const v = this.unit;
    if (!v || v.kind !== KIND.VEHICLE) return;
    const order = ['ap', 'he'];
    const i = order.indexOf(v.selectedShell || 'ap');
    for (let k = 1; k <= order.length; k++) {
      const next = order[(i + k) % order.length];
      if ((v.ammo[next] || 0) > 0) { v.selectedShell = next; this.message = `${next.toUpperCase()} loaded`; return; }
    }
  }

  // ---- towed guns -------------------------------------------------------

  layGun(g, dt) {
    const bearing = Math.atan2(this.aim.x - g.x, this.aim.z - g.z);
    const off = angleDelta(g.yaw, bearing);
    const arc = (g.def.gunArc ?? 30) * DEG;
    if (Math.abs(off) > arc) g.yaw = turnTowards(g.yaw, bearing, 0.5 * dt);
    g.turretYaw = turnTowards(g.turretYaw, clamp(off, -arc, arc), (g.def.traverse || 20) * DEG * dt);

    const dy = this.aim.y - (g.y + 1.0);
    g.gunPitch = clamp(Math.atan2(dy, Math.max(4, this.aimRange)),
      (g.def.gunElev?.[0] ?? -5) * DEG, (g.def.gunElev?.[1] ?? 25) * DEG);

    const gun = g.guns[0];
    gun.cooldown = Math.max(0, gun.cooldown - dt);
    gun.aimProgress = clamp(gun.aimProgress + dt / WEAPONS[gun.w].aimTime, 0, 1);

    if (this.firing && gun.cooldown <= 0) {
      const w = WEAPONS[gun.w];
      let shell = g.selectedShell || (w.shell === SHELL.HE ? 'he' : 'ap');
      if ((g.ammo[shell] || 0) <= 0) shell = shell === 'ap' ? 'he' : 'ap';
      if ((g.ammo[shell] || 0) <= 0) { this.message = 'Out of ammunition'; return; }
      const from = muzzlePoint(this.battle.world, g, gun);
      const aimAt = w.indirect
        ? { x: this.aim.x, y: this.aim.y, z: this.aim.z }
        : {
          x: from.x + Math.sin(g.yaw + g.turretYaw) * this.aimRange,
          y: from.y + Math.tan(g.gunPitch) * this.aimRange,
          z: from.z + Math.cos(g.yaw + g.turretYaw) * this.aimRange,
        };
      fireWeapon(this.battle.world, g, gun.w, from, aimAt, {
        aim: gun.aimProgress, high: !!w.indirect, shell: w.shell === SHELL.HE ? 'he' : shell,
      });
      g.ammo[shell]--;
      gun.cooldown = w.reload;
      gun.aimProgress = 0.4;
      g.lastFired = this.battle.world.time;
      this.battle.world.fx('muzzle', { x: from.x, y: from.y, z: from.z, yaw: g.yaw + g.turretYaw, calibre: w.caliber });
      this.rig.kick(0.35);
    }
  }

  // ---- infantry ---------------------------------------------------------

  moveSoldier(s, dt) {
    const k = this.keys;
    const world = this.battle.world;
    let fwd = 0, strafe = 0;
    if (k.has('KeyW')) fwd += 1;
    if (k.has('KeyS')) fwd -= 1;
    if (k.has('KeyA')) strafe -= 1;
    if (k.has('KeyD')) strafe += 1;

    // Move relative to where the camera is looking.
    const camYaw = this.rig.followYaw;
    let speed = s.moveSpeed * STANCE_SPEED[s.stance] * (k.has('ShiftLeft') ? 1.35 : 1);
    speed *= 1 - clamp(s.suppression, 0, 1) * 0.35;
    speed *= world.terrain.speedFactor(s.x, s.z);
    if (fwd || strafe) {
      const len = Math.hypot(fwd, strafe);
      const dx = (Math.sin(camYaw) * fwd + Math.cos(camYaw) * strafe) / len;
      const dz = (Math.cos(camYaw) * fwd - Math.sin(camYaw) * strafe) / len;
      const nx = s.x + dx * speed * dt, nz = s.z + dz * speed * dt;
      if (world.terrain.inBounds(nx, nz) && this.battle.nav.passable(nx, nz, false)) {
        s.velX = (nx - s.x) / dt; s.velZ = (nz - s.z) / dt;
        s.x = nx; s.z = nz;
      }
      s.moving = true;
      s.animPhase += speed * dt * 2.4;
    } else {
      s.moving = false;
      s.velX = s.velZ = 0;
    }
    s.y = world.terrain.heightAt(s.x, s.z);
    s.yaw = Math.atan2(this.aim.x - s.x, this.aim.z - s.z);

    s.cooldown = Math.max(0, s.cooldown - dt);
    s.reloading = Math.max(0, s.reloading - dt);
    const w = WEAPONS[s.usingLauncher && s.inv.launcher ? s.inv.launcher : s.inv.primary];
    s.aimProgress = clamp(s.aimProgress + dt / (w.aimTime * (1 + s.suppression * 0.8)), 0, 1);

    if (this.firing) this.soldierShoot(s, dt);
  }

  soldierShoot(s, dt) {
    const world = this.battle.world;
    const usingLauncher = s.usingLauncher && s.inv.launcher && s.inv.rockets > 0;
    const key = usingLauncher ? s.inv.launcher : s.inv.primary;
    const w = WEAPONS[key];
    if (s.cooldown > 0 || s.reloading > 0) return;
    if (!usingLauncher && s.inv.rounds <= 0) { this.reload(); return; }

    const from = {
      x: s.x + Math.sin(s.yaw) * 0.4,
      y: world.terrain.heightAt(s.x, s.z) + STANCE_HEIGHT[s.stance] * 0.82,
      z: s.z + Math.cos(s.yaw) * 0.4,
    };
    fireWeapon(world, s, key, from, this.aim, {
      aim: s.aimProgress, suppression: s.suppression, moving: s.moving,
      scoped: !!s.inv.scoped, shell: w.shell === SHELL.BULLET ? 'bullet' : w.shell,
      tracer: w.tracerEvery ? (s.shotCount = (s.shotCount || 0) + 1) % w.tracerEvery === 0 : false,
    });
    s.lastFired = world.time;
    world.fx('muzzle', { x: from.x, y: from.y, z: from.z, yaw: s.yaw, small: !usingLauncher });
    if (usingLauncher) {
      s.inv.rockets--;
      s.cooldown = w.reload;
      if (w.singleUse && s.inv.rockets <= 0) s.inv.launcher = null;
      s.usingLauncher = false;
      this.rig.kick(0.3);
    } else {
      s.inv.rounds--;
      s.cooldown = 60 / w.rof;
      if (!w.burst) this.firing = false;        // bolt actions fire once per click
    }
  }

  reload() {
    const s = this.unit;
    if (!s || s.kind !== KIND.SOLDIER) return;
    const w = WEAPONS[s.inv.primary];
    if (s.inv.rounds >= w.mag || s.inv.mags <= 0) {
      if (s.inv.mags <= 0) this.message = 'No magazines left';
      return;
    }
    s.inv.mags--;
    s.inv.rounds = w.mag;
    s.reloading = w.reload;
    this.message = 'Reloading';
  }

  throwGrenade() {
    const s = this.unit;
    if (!s || s.kind !== KIND.SOLDIER || s.inv.grenades <= 0 || s.cooldown > 0) return;
    s.inv.grenades--;
    const world = this.battle.world;
    const from = { x: s.x, y: world.terrain.heightAt(s.x, s.z) + 1.3, z: s.z };
    fireWeapon(world, s, 'grenade', from, this.aim, { aim: 1, high: true, shell: 'he' });
    s.cooldown = 1.6;
    this.message = `Grenade (${s.inv.grenades} left)`;
  }

  toggleLauncher() {
    const s = this.unit;
    if (!s || s.kind !== KIND.SOLDIER) return;
    if (!s.inv.launcher || s.inv.rockets <= 0) { this.message = 'No launcher'; return; }
    s.usingLauncher = !s.usingLauncher;
    s.aimProgress = 0;
    this.message = s.usingLauncher ? WEAPONS[s.inv.launcher].name : WEAPONS[s.inv.primary].name;
  }

  /** What the HUD needs to draw the crosshair and the ammunition counter. */
  readout() {
    const u = this.unit;
    if (!u) return null;
    if (u.kind === KIND.VEHICLE) {
      const main = u.guns.find((g) => WEAPONS[g.w].cls === 'cannon');
      return {
        name: u.def.name,
        weapon: main ? WEAPONS[main.w].name : 'machine gun',
        shell: (u.selectedShell || 'ap').toUpperCase(),
        ammo: main ? (u.ammo[u.selectedShell || 'ap'] || 0) : (u.ammo.bullet || 0),
        alt: { ap: u.ammo.ap || 0, he: u.ammo.he || 0, mg: u.ammo.bullet || 0 },
        reload: main ? main.cooldown : 0,
        reloadMax: main ? WEAPONS[main.w].reload : 1,
        settle: main ? main.aimProgress : 1,
        onTarget: this.onTarget,
        crew: u.crew.map((c) => ({ role: c.role, alive: !u.components[c.role]?.dead })),
        state: [u.engineDead && 'engine out', u.immobile && 'immobilised', u.gunBroken && 'gun out',
          u.turretJammed && 'turret jammed', u.onFire > 0 && 'ON FIRE'].filter(Boolean),
      };
    }
    if (u.kind === KIND.GUN) {
      const g = u.guns[0];
      return {
        name: u.def.name, weapon: WEAPONS[g.w].name,
        shell: (u.selectedShell || 'ap').toUpperCase(),
        ammo: u.ammo[u.selectedShell || 'ap'] || 0,
        alt: { ap: u.ammo.ap || 0, he: u.ammo.he || 0 },
        reload: g.cooldown, reloadMax: WEAPONS[g.w].reload, settle: g.aimProgress,
      };
    }
    const w = WEAPONS[u.usingLauncher && u.inv.launcher ? u.inv.launcher : u.inv.primary];
    return {
      name: `${u.role}`, weapon: w.name,
      shell: u.usingLauncher ? 'ROCKET' : 'BALL',
      ammo: u.usingLauncher ? u.inv.rockets : u.inv.rounds,
      alt: { mags: u.inv.mags, grenades: u.inv.grenades, rockets: u.inv.rockets },
      reload: u.reloading, reloadMax: w.reload, settle: u.aimProgress,
      hp: u.hp, suppression: u.suppression,
    };
  }
}
