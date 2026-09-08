// Touch.
//
// The game was built for a mouse with two buttons and a keyboard with WASD,
// none of which a phone has. Rather than bolting a cursor onto a touchscreen,
// this maps the same intentions onto gestures that suit one:
//
//   tap your own unit      select it
//   tap anywhere else      order the selection there — move, attack, get in,
//                          occupy, depending on what is under the finger
//   long press a unit      select its whole squad
//   drag                   pan the camera
//   two fingers            pinch to zoom, twist to rotate
//
// Under direct control it becomes a twin-stick pad: a thumb stick to drive, a
// drag on the right to lay the gun, and a trigger.

import { clamp, DEG } from '../core/util.js';

const TAP_MS = 260;
const TAP_SLOP = 14;          // pixels of travel still counted as a tap
const LONG_MS = 480;

export class TouchInput {
  constructor(battle, rig, selection, direct, hud, canvas) {
    this.battle = battle;
    this.rig = rig;
    this.selection = selection;
    this.direct = direct;
    this.hud = hud;
    this.canvas = canvas;
    this.pointers = new Map();
    this.enabled = false;
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.aimPad = { active: false, id: null };
    this.firing = false;
    this.pinch = null;
    this.longTimer = null;
    // A tap on the trigger is over in less than a frame, so hold it down for
    // a few of them or the shot never happens.
    this.fireLatch = 0;
    this.mgLatch = 0;
  }

  /** Touch is offered when the device actually has it. */
  static available() {
    return typeof window !== 'undefined'
      && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
  }

  enable() { this.enabled = true; document.body.classList.add('touch'); }

  // ---- plumbing ---------------------------------------------------------

  down(e) {
    if (!this.enabled || e.pointerType !== 'touch') return false;
    const p = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      t: performance.now(), moved: false, vx: 0, vy: 0, lastT: performance.now(),
    };
    this.pointers.set(e.pointerId, p);
    this.rig.glide = null;

    if (this.direct.active) return this.directDown(e, p);

    if (this.pointers.size === 2) {
      // Second finger down: this is a pinch, so cancel any pending tap.
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        d0: this.rig.targetDistance,
        yaw0: this.rig.yaw,
      };
      for (const q of this.pointers.values()) q.moved = true;
      this.clearLong();
      return true;
    }

    // One finger: might be a tap, a long press, or the start of a pan.
    this.clearLong();
    this.longTimer = setTimeout(() => {
      const q = this.pointers.get(e.pointerId);
      if (!q || q.moved) return;
      q.handled = true;
      this.longPress(q);
    }, LONG_MS);
    return true;
  }

  move(e) {
    if (!this.enabled || e.pointerType !== 'touch') return false;
    const p = this.pointers.get(e.pointerId);
    if (!p) return false;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > TAP_SLOP) p.moved = true;

    if (this.direct.active) return this.directMove(e, p);

    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.pinch.dist > 1) {
        this.rig.targetDistance = clamp(this.pinch.d0 * (this.pinch.dist / dist), 14, 340);
      }
      // Twisting the fingers orbits the camera.
      let da = angle - this.pinch.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.rig.yaw = this.pinch.yaw0 - da;
      return true;
    }

    if (p.moved && this.pointers.size === 1) {
      this.clearLong();
      if (this.boxing) { this.boxTo = { x: e.clientX, y: e.clientY }; return true; }
      this.rig.panScreen(dx, dy, innerHeight);
      // Remember how fast the finger was going, for the flick.
      const now = performance.now();
      const gap = Math.max(1, now - p.lastT);
      p.vx = dx / gap * 1000;
      p.vy = dy / gap * 1000;
      p.lastT = now;
    }
    return true;
  }

  up(e) {
    if (!this.enabled || e.pointerType !== 'touch') return false;
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.clearLong();
    if (this.pointers.size < 2) this.pinch = null;
    if (!p) return false;

    if (this.direct.active) return this.directUp(e, p);

    if (this.boxing) {
      this.finishBox(p);
      return true;
    }
    const quick = performance.now() - p.t < TAP_MS * 2.4;
    if (!p.moved && !p.handled && quick) { this.tap(p); return true; }
    // A flick keeps the map moving, so you are not swiping twenty times to
    // cross it.
    if (p.moved && Math.hypot(p.vx, p.vy) > 240 && performance.now() - p.lastT < 90) {
      this.rig.fling(p.vx, p.vy, innerHeight);
    }
    return true;
  }

  clearLong() {
    if (this.longTimer) { clearTimeout(this.longTimer); this.longTimer = null; }
  }

  /** Arm a one-shot box select: the next drag draws a marquee. */
  armBox() {
    this.boxing = true;
    this.boxFrom = null;
    this.boxTo = null;
  }

  finishBox(p) {
    const from = { x: p.x0, y: p.y0 }, to = { x: p.x, y: p.y };
    this.boxing = false;
    this.boxTo = null;
    if (Math.hypot(to.x - from.x, to.y - from.y) < 18) {
      this.tap(p);
      return;
    }
    this.selection.boxSelect(from, to, false);
    this.hud.say(`${this.selection.units.length} selected`);
  }

  /** The marquee rectangle to draw, while one is being dragged. */
  boxRect() {
    if (!this.boxing || !this.boxTo) return null;
    const p = [...this.pointers.values()][0];
    if (!p) return null;
    return {
      left: Math.min(p.x0, this.boxTo.x), top: Math.min(p.y0, this.boxTo.y),
      width: Math.abs(this.boxTo.x - p.x0), height: Math.abs(this.boxTo.y - p.y0),
    };
  }

  ndc(p) {
    return { x: (p.x / innerWidth) * 2 - 1, y: -(p.y / innerHeight) * 2 + 1 };
  }

  // ---- commanding -------------------------------------------------------

  /**
   * One tap does the work of both mouse buttons: on your own unit it selects,
   * anywhere else it orders whatever is selected — and `Selection.order`
   * already works out whether that means move, attack, mount or occupy.
   */
  tap(p) {
    const n = this.ndc(p);
    const hit = this.selection.pick(n.x, n.y);
    const mine = hit && hit.faction === this.battle.playerSide;

    if (mine) {
      this.selection.set([hit]);
      this.hud.say(hit.kind === 'vehicle' ? hit.def.short : hit.role);
      return;
    }
    if (!this.selection.units.length) {
      this.selection.clear();
      return;
    }
    const point = this.rig.groundPoint(n.x, n.y);
    const label = this.selection.order(point, hit, {});
    if (label) {
      this.hud.say({
        attack: 'Engaging', board: 'Mounting up', capture: 'Taking the objective',
        garrison: 'Occupying the building',
      }[label] || 'Moving');
    }
  }

  /** A long press takes the whole squad, which is what you usually want. */
  longPress(p) {
    const n = this.ndc(p);
    const hit = this.selection.pick(n.x, n.y);
    if (hit && hit.faction === this.battle.playerSide) {
      this.selection.selectSquad(hit);
      this.hud.say(`${this.selection.units.length} selected`);
    }
  }

  // ---- direct control: a thumb stick and a trigger -----------------------

  directDown(e, p) {
    const leftHalf = p.x < innerWidth * 0.42;
    const lowerLeft = leftHalf && p.y > innerHeight * 0.45;
    if (lowerLeft && !this.stick.active) {
      this.stick = { active: true, id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      return true;
    }
    if (!this.aimPad.active) {
      this.aimPad = { active: true, id: e.pointerId };
      this.direct.setAimFromScreen(...Object.values(this.ndc(p)));
      return true;
    }
    return true;
  }

  directMove(e, p) {
    if (this.stick.active && this.stick.id === e.pointerId) {
      this.stick.x = p.x; this.stick.y = p.y;
      return true;
    }
    if (this.aimPad.active && this.aimPad.id === e.pointerId) {
      const n = this.ndc(p);
      this.direct.setAimFromScreen(n.x, n.y);
      return true;
    }
    return true;
  }

  directUp(e, p) {
    if (this.stick.id === e.pointerId) this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    if (this.aimPad.id === e.pointerId) this.aimPad = { active: false, id: null };
    return true;
  }

  /**
   * Feed the thumb stick into the same keys the keyboard would press, so the
   * driving code has only one path through it.
   */
  applyStick() {
    const k = this.direct.keys;
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) k.delete(code);
    if (!this.stick.active) return;
    const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
    const dead = 12;
    if (dy < -dead) k.add('KeyW');
    if (dy > dead) k.add('KeyS');
    if (dx < -dead) k.add('KeyA');
    if (dx > dead) k.add('KeyD');
  }

  /** Trigger held: either the finger is still down, or the latch has not run out. */
  stepTriggers() {
    if (this.fireLatch > 0) { this.fireLatch--; this.direct.firing = true; }
    else if (this.fireHeld) this.direct.firing = true;
    else this.direct.firing = false;

    if (this.mgLatch > 0) { this.mgLatch--; this.direct.secondary = true; }
    else if (this.mgHeld) this.direct.secondary = true;
    else this.direct.secondary = false;
  }

  pullTrigger(on, secondary = false) {
    if (secondary) {
      this.mgHeld = on;
      if (on) this.mgLatch = 4;
    } else {
      this.fireHeld = on;
      if (on) this.fireLatch = 4;
    }
  }

  /** Where to draw the stick, for the on-screen pad. */
  stickState() {
    if (!this.stick.active) return null;
    const dx = clamp(this.stick.x - this.stick.ox, -52, 52);
    const dy = clamp(this.stick.y - this.stick.oy, -52, 52);
    return { ox: this.stick.ox, oy: this.stick.oy, dx, dy };
  }
}
