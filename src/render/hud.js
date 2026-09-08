// The interface: unit panels, the reinforcement list, the combat log, the
// minimap, and the direct-control readout.

import { KIND } from '../sim/world.js';
import { WEAPONS } from '../data/weapons.js';
import { FACTIONS } from '../data/factions.js';
import { visibleTo } from '../sim/vision.js';
import { MAPS } from '../sim/maps.js';
import { fmtRange, clamp } from '../core/util.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export class Hud {
  constructor(root, battle, selection, direct) {
    this.root = root;
    this.battle = battle;
    this.sel = selection;
    this.direct = direct;
    this.logSeen = 0;
    this.build();
  }

  build() {
    const r = this.root;
    // A phone shows less of everything: fewer log lines, shorter labels.
    // Decided before anything is built, because the panels read it.
    this.compact = matchMedia('(max-width: 820px), (pointer: coarse)').matches;

    // ---- top bar -------------------------------------------------------
    this.top = el('div', 'hud-top');
    this.mpBox = el('div', 'hud-mp');
    this.mpBox.innerHTML = '<span class="lbl">MANPOWER</span><span class="val" id="mp">0</span><span class="rate" id="mprate"></span>';
    this.flagBox = el('div', 'hud-flags');
    this.clock = el('div', 'hud-clock', '0:00');
    this.speedBox = el('div', 'hud-speed');
    for (const [label, mult] of [['II', 0], ['1x', 1], ['2x', 2], ['4x', 4]]) {
      const b = el('button', 'spd', label);
      b.onclick = () => {
        if (mult === 0) this.battle.paused = !this.battle.paused;
        else { this.battle.paused = false; this.battle.speed = mult; }
        this.refreshSpeed();
      };
      b.dataset.mult = mult;
      this.speedBox.appendChild(b);
    }
    this.top.append(this.mpBox, this.flagBox, this.clock, this.speedBox);
    r.appendChild(this.top);

    // ---- combat log ----------------------------------------------------
    this.logBox = el('div', 'hud-log');
    r.appendChild(this.logBox);

    // ---- selection panel -----------------------------------------------
    this.panel = el('div', 'hud-panel');
    r.appendChild(this.panel);

    // ---- reinforcements ------------------------------------------------
    this.callBox = el('div', 'hud-calls');
    this.buildCallList();
    r.appendChild(this.callBox);

    // ---- minimap -------------------------------------------------------
    this.mapWrap = el('div', 'hud-map');
    this.mapCanvas = el('canvas');
    this.mapCanvas.width = this.mapCanvas.height = 220;
    this.mapWrap.appendChild(this.mapCanvas);
    this.mapCtx = this.mapCanvas.getContext('2d');
    r.appendChild(this.mapWrap);
    this.bindMap();

    // ---- crosshair and direct-control readout --------------------------
    this.cross = el('div', 'hud-cross');
    this.cross.innerHTML = '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="15" /><line x1="30" y1="4" x2="30" y2="18"/><line x1="30" y1="42" x2="30" y2="56"/><line x1="4" y1="30" x2="18" y2="30"/><line x1="42" y1="30" x2="56" y2="30"/><circle cx="30" cy="30" r="1.6" class="dot"/></svg>';
    r.appendChild(this.cross);
    this.dc = el('div', 'hud-dc');
    r.appendChild(this.dc);

    // ---- banners -------------------------------------------------------
    this.toast = el('div', 'hud-toast');
    r.appendChild(this.toast);
    this.help = el('div', 'hud-help');
    this.help.innerHTML = HELP_HTML;
    this.help.style.display = 'none';
    r.appendChild(this.help);
    this.buildMapPicker();
    // A phone has no F1 key, and "tap anywhere to close" collides with the map
    // buttons inside the panel, so give it something explicit to press.
    const start = this.help.querySelector('.help-start');
    if (start) start.addEventListener('click', (e) => { e.stopPropagation(); this.toggleHelp(); });

    // Touch controls: the buttons a phone has no keyboard for.
    this.touchBar = el('div', 'hud-touch');
    this.touchBar.innerHTML = `
      <button data-act="all" title="Select everything">All</button>
      <button data-act="box" title="Drag a box to select">Box</button>
      <button data-act="stance" title="Stand or lie down">Down</button>
      <button data-act="hold" title="Hold fire">Hold</button>
      <button data-act="stop" title="Cancel orders">Stop</button>
      <button data-act="out" title="Leave the vehicle or building">Out</button>
      <button data-act="direct" class="primary" title="Take direct control">Drive</button>`;
    r.appendChild(this.touchBar);

    this.pad = el('div', 'hud-pad');
    this.pad.innerHTML = `
      <div class="stick"><i></i></div>
      <button class="fire">FIRE</button>
      <button class="mg">MG</button>
      <button class="shell">AP/HE</button>
      <button class="leave">Hand back</button>`;
    r.appendChild(this.pad);

    // Shown once, when the battle is decided.
    this.end = el('div', 'hud-end');
    this.end.style.display = 'none';
    r.appendChild(this.end);

    this.refreshSpeed();
  }

  /** The battle is over: say who won, how, and offer another. */
  showEnd(over) {
    if (this.endShown) return;
    this.endShown = true;
    const b = this.battle;
    const won = over.winner === b.playerSide;
    const t = Math.floor(b.time);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const wrecks = b.world.entities.filter((e) => e.kind === KIND.VEHICLE && (e.destroyed || e.abandoned));
    const mine = wrecks.filter((v) => v.faction === b.playerSide).length;
    const theirs = wrecks.length - mine;
    const dead = b.world.corpses;
    const myDead = dead.filter((c) => c.faction === b.playerSide).length;
    this.end.innerHTML = `
      <div class="end-card ${won ? 'won' : 'lost'}">
        <div class="end-title">${won ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="end-sub">${b.sideName(over.winner)} ${over.reason}, after ${clock}</div>
        <div class="end-stats">
          <div><b>${dead.length - myDead}</b> enemy killed</div>
          <div><b>${myDead}</b> of yours lost</div>
          <div><b>${theirs}</b> enemy vehicles knocked out</div>
          <div><b>${mine}</b> of yours</div>
        </div>
        <button class="end-again">Fight another</button>
        <div class="end-hint">Esc to look over the field</div>
      </div>`;
    this.end.style.display = '';
    this.end.querySelector('.end-again').onclick = () => {
      const seed = Math.floor(Math.random() * 100000);
      location.search = `?seed=${seed}&map=${this.battle.mapKey}`;
    };
  }

  hideEnd() { this.end.style.display = 'none'; }

  /** Choose the battlefield without having to edit the address bar. */
  buildMapPicker() {
    const holder = this.help.querySelector('.map-pick');
    if (!holder) return;
    for (const [key, m] of Object.entries(MAPS)) {
      const b = el('button', 'map-opt' + (key === this.battle.mapKey ? ' on' : ''));
      b.innerHTML = `<b>${m.name}</b><span>${m.blurb}</span>`;
      b.onclick = (e) => {
        e.stopPropagation();
        if (key === this.battle.mapKey) { this.toggleHelp(); return; }
        location.search = `?seed=${Math.floor(Math.random() * 100000)}&map=${key}`;
      };
      holder.appendChild(b);
    }
  }

  /** Wire the touch controls to the same actions the keys use. */
  bindTouch(handlers) {
    this.touchHandlers = handlers;
    this.touchBar.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act && handlers[act]) handlers[act]();
    });
    const press = (sel, on, off) => {
      const b = this.pad.querySelector(sel);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); on(); });
      if (off) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
        b.addEventListener(ev, (e) => { e.stopPropagation(); off(); });
      }
    };
    press('.fire', handlers.fireOn, handlers.fireOff);
    press('.mg', handlers.mgOn, handlers.mgOff);
    press('.shell', handlers.shell);
    press('.leave', handlers.leave);
  }

  /** Draw the thumb stick where the thumb actually is. */
  updatePad(stick) {
    const on = this.direct.active;
    this.pad.classList.toggle('on', on);
    this.touchBar.classList.toggle('hidden', on);
    const knob = this.pad.querySelector('.stick');
    if (!on) return;
    if (stick) {
      knob.style.left = `${stick.ox}px`;
      knob.style.top = `${stick.oy}px`;
      knob.style.opacity = '1';
      knob.firstElementChild.style.transform = `translate(${stick.dx}px, ${stick.dy}px)`;
    } else {
      knob.style.opacity = '0.35';
      knob.style.left = '';
      knob.style.top = '';
      knob.firstElementChild.style.transform = '';
    }
  }

  refreshSpeed() {
    for (const b of this.speedBox.children) {
      const m = Number(b.dataset.mult);
      const on = m === 0 ? this.battle.paused : (!this.battle.paused && this.battle.speed === m);
      b.classList.toggle('on', on);
    }
  }

  toggleHelp() {
    this.help.style.display = this.help.style.display === 'none' ? '' : 'none';
  }

  /** A capture bonus is the moment the economy rewards you; make it land. */
  bonus(amount, flag) {
    const n = el('div', 'hud-bonus', `+${amount} MANPOWER`);
    const sub = el('div', 'bonus-sub', flag ? `${flag.name} taken` : '');
    n.appendChild(sub);
    this.root.appendChild(n);
    requestAnimationFrame(() => n.classList.add('show'));
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 700); }, 2400);
  }

  say(text) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toast.classList.remove('show'), 2200);
  }

  buildCallList() {
    const b = this.battle;
    const list = b.callList(b.playerSide);
    this.callBox.innerHTML = '';
    const head = el('div', 'calls-head', this.compact ? 'REINFORCEMENTS' : 'CALL IN REINFORCEMENTS');
    // On a phone this panel would cover half the battlefield, so it folds away
    // behind its own heading and the map underneath stays tappable.
    head.addEventListener('click', () => this.callBox.classList.toggle('open'));
    this.callBox.appendChild(head);
    this.callButtons = [];
    for (const [group, items] of Object.entries(list)) {
      const row = el('div', 'calls-row');
      row.appendChild(el('span', 'calls-label', group.toUpperCase()));
      for (const item of items) {
        const btn = el('button', 'call');
        btn.innerHTML = `<span class="n">${item.name}</span><span class="c">${item.cost}</span>`;
        btn.title = `${item.name} — ${item.cost} manpower`;
        btn.onclick = () => this.callIn(item);
        row.appendChild(btn);
        this.callButtons.push({ btn, item });
      }
      this.callBox.appendChild(row);
    }
  }

  callIn(item) {
    const b = this.battle;
    const spawn = b.spawnPointFor(b.playerSide);
    const got = b.purchase(b.playerSide, item.key, spawn.x, spawn.z);
    this.say(got ? `${item.name} called in` : 'Not enough manpower');
  }

  // ---- per-frame --------------------------------------------------------

  update(dt) {
    const b = this.battle, w = b.world;
    const purse = b.sides[b.playerSide];

    this.mpBox.querySelector('#mp').textContent = Math.floor(purse.mp);
    this.mpBox.querySelector('#mprate').textContent = `+${purse.income.toFixed(1)}/s`;

    // Flag strip.
    if (this.flagBox.children.length !== w.flags.length) {
      this.flagBox.innerHTML = '';
      for (const f of w.flags) {
        const pip = el('div', 'pip');
        pip.title = f.name;
        this.flagBox.appendChild(pip);
      }
    }
    w.flags.forEach((f, i) => {
      const pip = this.flagBox.children[i];
      const owner = FACTIONS[f.owner];
      pip.style.background = owner ? owner.marker : '#8a8a84';
      pip.style.opacity = 0.35 + f.progress * 0.65;
      pip.classList.toggle('contested', !!f.contestedBy);
    });

    const left = Math.max(0, Math.floor(b.timeLeft));
    this.clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    this.clock.classList.toggle('urgent', left < 120);
    this.clock.title = 'Time remaining before the battle is decided on ground held';

    for (const { btn, item } of this.callButtons) {
      btn.classList.toggle('poor', purse.mp < item.cost);
    }

    this.updateLog();
    this.updatePanel();
    this.updateDirect();
    this.updateMap();
    if (this.touchOn) this.updatePad(this.touchStick);
    if (b.over) this.showEnd(b.over);
  }

  updateLog() {
    const log = this.battle.world.log;
    while (this.logSeen < log.length) {
      const line = log[this.logSeen++];
      const n = el('div', `line ${line.tone}`, line.text);
      this.logBox.appendChild(n);
      const keep = this.compact ? 3 : 9;
      while (this.logBox.children.length > keep) this.logBox.removeChild(this.logBox.firstChild);
      setTimeout(() => n.classList.add('fade'), 7000);
    }
  }

  updatePanel() {
    const sel = this.sel.units;
    if (!sel.length) { this.panel.innerHTML = ''; this.panel.classList.remove('on'); return; }
    this.panel.classList.add('on');

    if (sel.length === 1) {
      this.panel.innerHTML = this.unitCard(sel[0]);
      return;
    }
    // A group: one tile per unit, with a health pip.
    const counts = new Map();
    for (const u of sel) {
      const key = u.kind === KIND.SOLDIER ? u.role : u.def.short;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const rows = [...counts.entries()].map(([k, n]) => `<div class="grp"><span>${n}x</span> ${k}</div>`).join('');
    const avgHp = Math.round(sel.reduce((a, u) => a + (u.kind === KIND.SOLDIER ? u.hp : 100), 0) / sel.length);
    this.panel.innerHTML = `<div class="card"><div class="title">${sel.length} units selected</div>
      <div class="groups">${rows}</div>
      <div class="bar"><i style="width:${avgHp}%"></i></div></div>`;
  }

  unitCard(u) {
    if (u.kind === KIND.VEHICLE) return this.vehicleCard(u);
    if (u.kind === KIND.GUN) return this.gunCard(u);
    return this.soldierCard(u);
  }

  vehicleCard(v) {
    const comps = [
      ['engine', !v.engineDead && !v.components.engine?.broken],
      ['tracks', !v.immobile],
      ['gun', !v.gunBroken],
      ['turret', !v.turretJammed],
      ['optics', !v.opticsOut],
    ];
    const crew = v.crew.map((c) => {
      const alive = !v.components[c.role]?.dead;
      return `<span class="crew ${alive ? 'ok' : 'ko'}" title="${c.role}">${c.role[0].toUpperCase()}</span>`;
    }).join('');
    const main = v.guns.find((g) => WEAPONS[g.w].cls === 'cannon');
    const armour = v.def.armour;
    return `<div class="card">
      <div class="title">${v.def.name}${v.onFire > 0 ? ' <b class="fire">BURNING</b>' : ''}</div>
      <div class="sub">${main ? WEAPONS[main.w].name : 'machine gun'} &middot; armour ${armour.hullFront.t}/${armour.hullSide.t}/${armour.hullRear.t} mm</div>
      <div class="crewrow">${crew}</div>
      <div class="comps">${comps.map(([n, ok]) => `<span class="${ok ? 'ok' : 'ko'}">${n}</span>`).join('')}</div>
      <div class="ammo">${['ap', 'he', 'bullet'].filter((k) => v.ammo[k] !== undefined)
        .map((k) => `<span>${k === 'bullet' ? 'MG' : k.toUpperCase()} <b>${v.ammo[k]}</b></span>`).join('')}</div>
      ${v.abandoned ? '<div class="warn">Abandoned — send a crew to take it</div>' : ''}
    </div>`;
  }

  gunCard(g) {
    const gun = g.guns[0];
    return `<div class="card">
      <div class="title">${g.def.name}</div>
      <div class="sub">${WEAPONS[gun.w].name} &middot; crew ${g.crewOn?.length ?? 0}/${g.crewNeeded}</div>
      <div class="comps"><span class="${g.manned ? 'ok' : 'ko'}">${g.manned ? 'manned' : 'unmanned'}</span></div>
      <div class="ammo">${Object.entries(g.ammo).map(([k, n]) => `<span>${k.toUpperCase()} <b>${n}</b></span>`).join('')}</div>
      ${g.destroyed ? '<div class="warn">Knocked out</div>' : ''}
    </div>`;
  }

  soldierCard(s) {
    const w = WEAPONS[s.inv.primary];
    const stance = s.garrison != null
      ? `at a window, floor ${(s.garrisonFloor ?? 0) + 1}`
      : ['standing', 'crouched', 'prone'][s.stance];
    return `<div class="card">
      <div class="title">${s.role}${s.leader ? ' (leader)' : ''}</div>
      <div class="sub">${w.name} &middot; ${stance}</div>
      <div class="bar"><i style="width:${clamp(s.hp, 0, 100)}%"></i></div>
      <div class="bar sup"><i style="width:${clamp(s.suppression * 62, 0, 100)}%"></i></div>
      <div class="ammo">
        <span>ROUNDS <b>${s.inv.rounds}</b></span>
        <span>MAGS <b>${s.inv.mags}</b></span>
        <span>NADES <b>${s.inv.grenades}</b></span>
        ${s.inv.launcher ? `<span>${WEAPONS[s.inv.launcher].name.split(' ')[0].toUpperCase()} <b>${s.inv.rockets}</b></span>` : ''}
      </div>
      ${s.morale < 0.3 ? '<div class="warn">Shaken</div>' : ''}
    </div>`;
  }

  updateDirect() {
    const r = this.direct.readout();
    if (!r) { this.dc.classList.remove('on'); this.cross.classList.remove('on'); return; }
    this.dc.classList.add('on');
    this.cross.classList.add('on');
    this.cross.classList.toggle('ready', r.reload <= 0 && (r.settle ?? 1) > 0.7);
    this.cross.classList.toggle('laid', r.onTarget !== false);

    const reloadPct = r.reloadMax ? clamp(1 - r.reload / r.reloadMax, 0, 1) : 1;
    const crew = r.crew ? `<div class="crewrow">${r.crew.map((c) =>
      `<span class="crew ${c.alive ? 'ok' : 'ko'}" title="${c.role}">${c.role[0].toUpperCase()}</span>`).join('')}</div>` : '';
    const alt = r.alt ? Object.entries(r.alt).map(([k, n]) => `<span>${k.toUpperCase()} <b>${n}</b></span>`).join('') : '';
    this.dc.innerHTML = `
      <div class="dc-name">${r.name}</div>
      <div class="dc-weapon">${r.weapon} &middot; <b>${r.shell}</b></div>
      ${crew}
      <div class="dc-reload"><i style="width:${reloadPct * 100}%"></i></div>
      <div class="dc-ammo">${alt}</div>
      ${r.state?.length ? `<div class="warn">${r.state.join(' &middot; ')}</div>` : ''}
      <div class="dc-hint">${this.direct.message || 'Enter to hand back'}</div>`;
  }

  updateMap() {
    const ctx = this.mapCtx, b = this.battle, w = b.world;
    const S = 220, k = S / w.size;
    // Your own end of the map is drawn at the bottom, so the minimap agrees
    // with what you are looking at rather than being upside down relative to it.
    const my = (z) => (this.mapFlipped ? S - z * k : z * k);
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#20261d';
    ctx.fillRect(0, 0, S, S);

    // Roads and streets.
    ctx.strokeStyle = 'rgba(150,143,120,0.45)';
    ctx.lineWidth = 2;
    for (const road of w.terrain.roads || []) {
      ctx.beginPath();
      road.forEach((p, i) => (i ? ctx.lineTo(p.x * k, my(p.z)) : ctx.moveTo(p.x * k, my(p.z))));
      ctx.stroke();
    }
    // Buildings, so a city reads as a city at a glance.
    const houses = w.props.filter((p) => p.capacity > 0 && p.alive);
    if (houses.length) {
      ctx.fillStyle = 'rgba(150,150,140,0.28)';
      for (const p of houses) {
        const hw = (p.w || p.radius * 2) * k, hd = (p.d || p.radius * 2) * k;
        ctx.fillRect(p.x * k - hw / 2, my(p.z) - hd / 2, Math.max(1, hw), Math.max(1, hd));
      }
    }
    // Objectives.
    for (const f of w.flags) {
      const owner = FACTIONS[f.owner];
      ctx.fillStyle = owner ? owner.marker : '#9a9a92';
      ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.arc(f.x * k, my(f.z), f.radius * k, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(f.x * k, my(f.z), 3.4, 0, 7); ctx.fill();
      if (f.contestedBy) {
        ctx.strokeStyle = '#f0e6a0'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(f.x * k, my(f.z), 6, 0, 7); ctx.stroke();
      }
    }
    // Units.
    for (const e of w.entities) {
      if (e.kind === KIND.SOLDIER && e.inVehicle) continue;
      if (!visibleTo(w, e, b.playerSide)) continue;
      const f = FACTIONS[e.faction];
      const own = e.faction === b.playerSide;
      ctx.fillStyle = e.destroyed || e.abandoned ? '#4a4a46' : (f ? f.marker : '#fff');
      const size = e.kind === KIND.VEHICLE ? 4 : (e.kind === KIND.GUN ? 3.4 : 2.4);
      ctx.fillRect(e.x * k - size / 2, my(e.z) - size / 2, size, size);
      if (own && e.selected) {
        ctx.strokeStyle = '#bdf5bd';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(e.x * k - size, my(e.z) - size, size * 2, size * 2);
      }
    }
    // Camera footprint.
    const rig = this.rig;
    if (rig) {
      ctx.strokeStyle = 'rgba(230,235,220,0.7)';
      ctx.lineWidth = 1.2;
      const d = rig.distance * k * 0.62;
      ctx.strokeRect(rig.focus.x * k - d, my(rig.focus.z) - d * 0.7, d * 2, d * 1.4);
    }
  }

  /** Tapping or clicking the minimap sends the camera there. */
  bindMap() {
    // Which way round to draw it: put the player's own start line at the
    // bottom, wherever that happens to be.
    const home = this.battle.world.flags.find((f) => f.owner === this.battle.playerSide);
    this.mapFlipped = !home || home.z < this.battle.world.size / 2;

    const jump = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const r = this.mapCanvas.getBoundingClientRect();
      const pt = ev.touches?.[0] ?? ev;
      const u = (pt.clientX - r.left) / r.width;
      const v = (pt.clientY - r.top) / r.height;
      const size = this.battle.world.size;
      const x = u * size;
      const z = this.mapFlipped ? (1 - v) * size : v * size;
      this.rig.jumpTo(x, z);
    };
    this.mapCanvas.addEventListener('pointerdown', jump);
    // Dragging across the minimap scrubs the camera with it.
    this.mapCanvas.addEventListener('pointermove', (ev) => {
      if (ev.buttons || ev.pointerType === 'touch') jump(ev);
    });
  }
}

const HELP_HTML = `
<h2>Direct Control</h2>
<p>A real-time tactics game in the Men of War mould. Every round fired is a
simulated projectile; armour is resolved plate by plate; ammunition runs out.</p>
<div class="map-pick"></div>
<table>
<tr><th colspan="2">Command</th></tr>
<tr><td>Left click / drag</td><td>Select unit or box-select</td></tr>
<tr><td>Double click</td><td>Select the whole squad</td></tr>
<tr><td>Right click</td><td>Move, or attack what is under the cursor</td></tr>
<tr><td>Shift + right click</td><td>Queue the order</td></tr>
<tr><td>Ctrl + right click</td><td>Attack-move: advance, engaging on the way</td></tr>
<tr><td>Right click a vehicle</td><td>Get in (Ctrl to crew it)</td></tr>
<tr><td>Right click a building</td><td>Occupy it and fire from the windows</td></tr>
<tr><td>1 / 2 / 3</td><td>Stand / crouch / prone</td></tr>
<tr><td>H</td><td>Hold fire</td></tr>
<tr><td>X</td><td>Stop</td></tr>
<tr><td>U</td><td>Get out of a vehicle or a building</td></tr>
<tr><td>Ctrl + 1..9 / 1..9</td><td>Set and recall control groups</td></tr>
<tr><th colspan="2">Camera</th></tr>
<tr><td>W A S D / edge</td><td>Pan</td></tr>
<tr><td>Q E or middle drag</td><td>Rotate</td></tr>
<tr><td>Wheel</td><td>Zoom</td></tr>
<tr><td>Space</td><td>Pause</td></tr>
<tr><th colspan="2">Direct control &mdash; press Enter with a unit selected</th></tr>
<tr><td>W A S D</td><td>Drive, or move on foot</td></tr>
<tr><td>Mouse</td><td>Lay the gun. The turret traverses at its own rate</td></tr>
<tr><td>Left click</td><td>Fire the main armament</td></tr>
<tr><td>Right click</td><td>Fire the machine gun</td></tr>
<tr><td>R</td><td>Change shell (AP / HE), or reload</td></tr>
<tr><td>G / F</td><td>Grenade / anti-tank launcher</td></tr>
<tr><td>Space</td><td>Brake</td></tr>
<tr><td>Enter or Esc</td><td>Hand the unit back</td></tr>
</table>
<button class="help-start">Begin the battle</button>
<p class="dismiss">F1 to bring this back</p>`;
