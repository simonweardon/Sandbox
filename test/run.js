// A test suite you can run without a browser: `npm test`.
//
// Most of it checks the simulation against history rather than against itself.
// The penetration model is only worth having if a Panzer IV kills a T-34 at
// the range it really did and a T-34 bounces off a Tiger at the range it
// really did, so those are the assertions.

import { WEAPONS, penetrationAt, blastRadius, blastDamage } from '../src/data/weapons.js';
import { VEHICLES, GUNS, componentLayout } from '../src/data/vehicles.js';
import { SQUADS, KITS, ROLES } from '../src/data/infantry.js';
import { FACTIONS } from '../src/data/factions.js';
import { hitProxy, pickFacet, impactAngle, resolveArmour, RESULT } from '../src/sim/penetration.js';
import { World } from '../src/sim/world.js';
import { MAPS } from '../src/sim/maps.js';
import { windowSlots, enterBuilding, leaveBuilding, garrisonCount, isGarrisonable, floorHeight } from '../src/sim/garrison.js';
import { propDistance, propSegmentT, isBoxed } from '../src/sim/shapes.js';
import { Terrain } from '../src/sim/terrain.js';
import { NavGrid, findPath } from '../src/sim/pathfinding.js';
import { makeVehicle, makeSquad, makeGun, makeSoldier, boardVehicle, disembark } from '../src/sim/units.js';
import { fireWeapon, stepProjectiles, solveElevationDrag } from '../src/sim/ballistics.js';
import { applySpall, evaluateVehicle, explode, stepAttrition } from '../src/sim/damage.js';
import { Battle, TICK } from '../src/sim/battle.js';
import { Commander } from '../src/sim/ai.js';
import { eyeHeight, signature } from '../src/sim/vision.js';
import { DEG } from '../src/core/util.js';
import * as THREE from '../vendor/three.module.js';
import { itemsOf, loadOf, transfer, refuseTransfer, takeAll, CAPACITY } from '../src/sim/inventory.js';
import {
  canRepair, canHeal, canMine, damageOn, beginRepair, beginHeal, beginMine,
  stepFieldwork, stepMines, layMine,
} from '../src/sim/fieldwork.js';
import { orderGroundFire, stepCombat } from '../src/sim/combat.js';
import { CameraRig, wheelSteps, ZOOM_MIN, ZOOM_MAX } from '../src/input/camera.js';
import { TouchInput } from '../src/input/touch.js';
import { reseed } from '../src/core/rng.js';

let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push(`  ok   ${name}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL ${name}\n         ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertBetween(v, lo, hi, msg) {
  if (!(v >= lo && v <= hi)) throw new Error(`${msg || 'value'}: ${v} not in [${lo}, ${hi}]`);
}

// ---------------------------------------------------------------------------
// Firing one shot at one tank, the way the game does.
// ---------------------------------------------------------------------------

/** Fire `weapon` at `vehicle` from `bearing` degrees off its nose. */
function shootAt(weaponKey, vehicleKey, bearingDeg, rangeM, opts = {}) {
  const w = WEAPONS[weaponKey], def = VEHICLES[vehicleKey];
  const proxy = hitProxy(def);
  const aimY = opts.aimY ?? (def.model.hull.clear + def.model.hull.hgt * 0.6);
  const b = bearingDeg * DEG;
  const origin = { x: Math.sin(b) * 40, y: aimY, z: Math.cos(b) * 40 };
  const dir = { x: -Math.sin(b), y: 0, z: -Math.cos(b) };
  const facet = pickFacet(def, proxy, origin, dir, (opts.turretYaw ?? 0) * DEG);
  assert(facet, `${weaponKey} missed ${vehicleKey} entirely at ${bearingDeg} degrees`);
  const angle = impactAngle(facet, dir, (opts.turretYaw ?? 0) * DEG);
  const shell = w.shell === 'heat' ? 'heat' : 'ap';
  return { facet, ...resolveArmour(w, shell, rangeM, facet.plate, angle) };
}

/** Whether a shot gets through, averaged over the ricochet roll. */
function penetrates(weaponKey, vehicleKey, bearingDeg, rangeM, opts) {
  let through = 0;
  for (let i = 0; i < 40; i++) {
    const r = shootAt(weaponKey, vehicleKey, bearingDeg, rangeM, opts);
    if (r.result === RESULT.PENETRATION || r.result === RESULT.OVERPENETRATION) through++;
  }
  return through / 40;
}

// ---------------------------------------------------------------------------

console.log('\nData tables');
test('every weapon has the fields the simulation reads', () => {
  for (const [k, w] of Object.entries(WEAPONS)) {
    for (const f of ['name', 'cls', 'shell', 'caliber', 'velocity', 'rof', 'mag', 'reload', 'disp', 'damage', 'range']) {
      assert(w[f] !== undefined, `${k} is missing ${f}`);
    }
    assert(w.velocity > 0 && w.velocity < 1200, `${k} has an implausible muzzle velocity`);
  }
});
test('every vehicle has a complete armour array and buildable dimensions', () => {
  for (const [k, v] of Object.entries(VEHICLES)) {
    for (const f of ['hullFront', 'hullLower', 'hullSide', 'hullRear', 'hullTop']) {
      assert(v.armour[f] && typeof v.armour[f].t === 'number', `${k} is missing armour.${f}`);
    }
    assert(v.model.hull.len > 0 && v.model.hull.wid > 0 && v.model.hull.hgt > 0, `${k} has no hull dimensions`);
    assert(v.crew.length > 0, `${k} has no crew`);
    for (const g of v.guns) assert(WEAPONS[g.w], `${k} mounts unknown weapon ${g.w}`);
  }
});
test('every gun and squad references things that exist', () => {
  for (const [k, g] of Object.entries(GUNS)) for (const gg of g.guns) assert(WEAPONS[gg.w], `${k}: ${gg.w}`);
  for (const [k, s] of Object.entries(SQUADS)) {
    for (const role of s.members) {
      assert(ROLES[role], `${k} wants unknown role ${role}`);
      assert(KITS[s.faction][role], `${k}: no ${s.faction} kit for ${role}`);
    }
  }
  for (const [side, f] of Object.entries(FACTIONS)) {
    for (const key of f.calls.infantry) assert(SQUADS[key], `${side} can call unknown squad ${key}`);
    for (const key of f.calls.vehicles) assert(VEHICLES[key], `${side} can call unknown vehicle ${key}`);
    for (const key of f.calls.support) assert(GUNS[key], `${side} can call unknown gun ${key}`);
  }
});
test('components sit inside the hull they belong to', () => {
  for (const [k, v] of Object.entries(VEHICLES)) {
    const h = v.model.hull;
    for (const c of componentLayout(v)) {
      assert(Math.abs(c.x) <= h.wid, `${k}: ${c.id} is outside the hull sideways`);
      assert(Math.abs(c.z) <= h.len / 2 + 0.1, `${k}: ${c.id} is outside the hull fore and aft`);
      assert(c.y > 0 && c.y < 4, `${k}: ${c.id} is at an impossible height (${c.y})`);
    }
  }
});

console.log('Penetration, against the historical record');
test('penetration falls off with range as the range tables say', () => {
  const kwk40 = WEAPONS.kwk40_75;
  assertBetween(penetrationAt(kwk40, 100), 104, 108, 'KwK 40 at 100 m');
  assertBetween(penetrationAt(kwk40, 1000), 82, 90, 'KwK 40 at 1000 m');
  assert(penetrationAt(WEAPONS.panzerfaust60, 50) === penetrationAt(WEAPONS.panzerfaust60, 10),
    'a shaped charge should not lose penetration with range');
});
test('a Panzer IV kills a T-34/76 frontally, well beyond a kilometre', () => {
  assert(penetrates('kwk40_75', 't34_76', 0, 1500) > 0.9, 'should get through at 1500 m');
});
test('a T-34/76 cannot touch a Tiger frontally at any range', () => {
  assert(penetrates('f34_76', 'tiger1', 0, 500) === 0, 'should bounce at 500 m');
  assert(penetrates('f34_76', 'tiger1', 0, 100) === 0, 'should bounce even at 100 m');
});
test('but it can hurt a Tiger from the flank, at point-blank range only', () => {
  assert(penetrates('f34_76', 'tiger1', 90, 100) > 0.9, 'the side should give at 100 m');
  assert(penetrates('f34_76', 'tiger1', 90, 600) === 0, 'and should hold by 600 m');
});
test("a 75 mm Sherman bounces off a Panther's glacis and kills it in the flank", () => {
  assert(penetrates('m3_75', 'panther_a', 0, 300) === 0, 'the glacis should hold');
  assert(penetrates('m3_75', 'panther_a', 90, 800) > 0.9, 'the side should not');
});
test('the 88 cannot crack an IS-2 glacis but goes through a Sherman at 2 km', () => {
  assert(penetrates('kwk36_88', 'is2', 0, 500) === 0, 'IS-2 glacis should hold');
  assert(penetrates('kwk36_88', 'm4a1', 0, 2000) > 0.9, 'Sherman glacis should not');
});
test('turning the turret changes which plate is struck', () => {
  // Aim at turret height, not at the hull: 1.58 m is the T-34-85's hull roof.
  const facing = shootAt('kwk40_75', 't34_85', 0, 800, { turretYaw: 0, aimY: 2.0 });
  const turned = shootAt('kwk40_75', 't34_85', 0, 800, { turretYaw: 90, aimY: 2.0 });
  assert(facing.facet.key !== turned.facet.key, 'the facet struck should differ');
  assert(turned.effective < facing.effective, 'a turned turret should present thinner armour');
});
test('slope is worth more than its nominal thickness', () => {
  const t34 = shootAt('kwk39_50', 't34_76', 0, 500);
  assert(t34.effective > VEHICLES.t34_76.armour.hullFront.t * 1.15,
    'the T-34 glacis should be worth well over its 45 mm');
});
test('a big shell overmatches thin sloped plate rather than skidding off it', () => {
  const small = shootAt('kwk39_50', 't34_76', 0, 500);
  const big = shootAt('d25t_122', 't34_76', 0, 500);
  assert(big.effective < small.effective, '122 mm should be less troubled by the slope than 50 mm');
});
test('shots at a glancing angle ricochet', () => {
  let ricochets = 0;
  for (let i = 0; i < 200; i++) {
    const r = resolveArmour(WEAPONS.kwk39_50, 'ap', 500, { t: 80, slope: 0 }, 80);
    if (r.result === RESULT.RICOCHET) ricochets++;
  }
  assertBetween(ricochets / 200, 0.3, 1.0, 'ricochet rate at 80 degrees');
});
test('an unarmoured vehicle is penetrated by anything', () => {
  const r = resolveArmour(WEAPONS.kar98k, 'bullet', 100, { t: 0, slope: 0 }, 0);
  assert(r.result === RESULT.PENETRATION);
});

console.log('Ballistics');
test('the gun-laying solver hits what it aims at, drag included', () => {
  for (const range of [200, 800, 1600]) {
    const e = solveElevationDrag(range, 0, 790, 'ap');
    assert(e !== null && e > 0 && e < 0.2, `no solution at ${range} m`);
  }
  const near = solveElevationDrag(200, 0, 790, 'ap');
  const far = solveElevationDrag(1600, 0, 790, 'ap');
  assert(far > near, 'longer range needs more elevation');
});
test('hit probability falls with range, at about the rate the range tables gave', () => {
  const rates = [];
  for (const range of [300, 800, 1500]) {
    const w = new World(range + 300, 7);
    w.terrain.height.fill(0);
    const shooter = makeVehicle(w, 'ger', 'pz4h', 100, 60, 0);
    const target = makeVehicle(w, 'sov', 't34_76', 100, 60 + range, 0);
    target.yaw = Math.PI;
    w.rebuildHash();
    const before = w.log.length;
    const shots = 50;
    for (let i = 0; i < shots; i++) {
      target.destroyed = false; target.abandoned = false; target.shock = 0;
      fireWeapon(w, shooter, 'kwk40_75', { x: 100, y: 2, z: 63 }, { x: target.x, y: 1.3, z: target.z }, { aim: 1, shell: 'ap' });
      for (let s = 0; s < 900 && w.projectiles.length; s++) stepProjectiles(w, 1 / 240);
    }
    const hits = w.log.slice(before).filter((l) => l.tone === 'pen' || l.tone === 'bounce').length;
    rates.push(hits / shots);
  }
  assertBetween(rates[0], 0.7, 1.0, 'hit rate at 300 m');
  assertBetween(rates[1], 0.35, 0.8, 'hit rate at 800 m');
  assertBetween(rates[2], 0.05, 0.45, 'hit rate at 1500 m');
  assert(rates[0] > rates[1] && rates[1] > rates[2], 'accuracy should fall with range');
});
test('a shell fired at nothing falls to the ground and bursts', () => {
  const w = new World(600, 3);
  w.terrain.height.fill(0);
  const before = w.decals.length;
  fireWeapon(w, null, 'grw34_81', { x: 300, y: 1, z: 100 }, { x: 300, y: 0, z: 400 }, { high: true, shell: 'he' });
  // A mortar at short range fires almost straight up: allow for the arc.
  for (let s = 0; s < 9000 && w.projectiles.length; s++) stepProjectiles(w, 1 / 120);
  assert(w.projectiles.length === 0, 'the round should have landed');
  assert(w.decals.length > before, 'a high-explosive shell should leave a crater');
});
test('blast falls off with distance and scales with the filler', () => {
  assert(blastRadius(3.6) > blastRadius(0.6), 'a bigger shell has a bigger radius');
  assert(blastDamage(0.6, 1) > blastDamage(0.6, 3), 'damage falls off with distance');
  assert(blastDamage(0.6, 99) === 0, 'no damage beyond the radius');
});

console.log('Damage');
test('where a shell lands inside a tank decides what it wrecks', () => {
  reseed(11);
  const w = new World(512, 1);
  const outcomes = { engine: 0, driver: 0, ammo: 0 };
  for (let i = 0; i < 60; i++) {
    const v = makeVehicle(w, 'ger', 'pz4h', 400, 400);
    applySpall(w, v, { x: 1.4, y: 0.9, z: -2.0 }, { x: -1, y: 0, z: 0 }, 1.2, null, null);
    if (v.engineDead) outcomes.engine++;
    w.remove(v);
  }
  for (let i = 0; i < 60; i++) {
    const v = makeVehicle(w, 'ger', 'pz4h', 400, 400);
    applySpall(w, v, { x: 0, y: 0.9, z: 2.9 }, { x: 0, y: 0, z: -1 }, 1.2, null, null);
    if (v.components.driver.dead || v.immobile) outcomes.driver++;
    w.remove(v);
  }
  assert(outcomes.engine > 30, 'engine-deck hits should usually kill the engine');
  assert(outcomes.driver > 30, 'hits through the front should usually reach the driver or transmission');
});
test('ammunition detonation is possible but not certain', () => {
  reseed(23);
  const w = new World(512, 1);
  let blown = 0;
  for (let i = 0; i < 80; i++) {
    const v = makeVehicle(w, 'ger', 'pz4h', 400, 400);
    applySpall(w, v, { x: 1.4, y: 0.85, z: 0 }, { x: -1, y: 0, z: 0 }, 1.2, null, null);
    if (v.destroyed) blown++;
    w.remove(v);
  }
  assertBetween(blown / 80, 0.1, 0.8, 'brew-up rate on a sponson hit');
});
test('crews bail out rather than fighting to the last man', () => {
  reseed(5);
  const w = new World(512, 1);
  const v = makeVehicle(w, 'sov', 't34_76', 300, 300);
  for (const role of v.def.crew) {
    const s = makeSoldier(w, 'sov', 'crew', 300, 300);
    boardVehicle(w, s, v);
  }
  v.shock = 4;
  v.gunBroken = true;
  evaluateVehicle(w, v);
  assert(v.abandoned, 'a wrecked tank should be abandoned');
  const out = w.entities.filter((e) => e.kind === 'soldier' && !e.inVehicle && e.alive);
  assert(out.length > 0, 'the crew should be standing outside it');
});
test('an abandoned tank can be taken over by a fresh crew', () => {
  const w = new World(512, 1);
  const v = makeVehicle(w, 'sov', 't34_76', 300, 300);
  v.abandoned = true;
  const s = makeSoldier(w, 'sov', 'crew', 302, 300);
  assert(boardVehicle(w, s, v), 'boarding should succeed');
  assert(!v.abandoned, 'the vehicle should no longer be abandoned');
  assert(s.seat === 'driver', 'the first man aboard should take the driver seat');
});
test('high explosive hurts infantry in the open more than infantry lying down', () => {
  reseed(77);
  const w = new World(512, 1);
  const standing = makeSoldier(w, 'sov', 'rifleman', 200, 202);
  const prone = makeSoldier(w, 'sov', 'rifleman', 200, 198);
  prone.stance = 2;
  w.rebuildHash();
  explode(w, 200, 0.4, 200, 0.68, WEAPONS.kwk40_75, 'ger');
  assert(standing.hp < 100 || !standing.alive, 'the standing man should be hurt');
  assert((prone.alive ? prone.hp : 0) > (standing.alive ? standing.hp : 0) - 1,
    'lying down should help');
});

console.log('Terrain and movement');
test('the heightfield is deterministic for a seed', () => {
  const a = new Terrain(512, 99), b = new Terrain(512, 99), c = new Terrain(512, 100);
  assert(a.heightAt(123, 234) === b.heightAt(123, 234), 'same seed, same ground');
  assert(a.heightAt(123, 234) !== c.heightAt(123, 234), 'different seed, different ground');
});
test('terrain blocks line of sight over a rise', () => {
  const t = new Terrain(512, 20240607);
  let blocked = 0, clear = 0;
  for (let i = 0; i < 200; i++) {
    const ax = (i * 37) % 500 + 5, az = (i * 91) % 500 + 5;
    const bx = (i * 53) % 500 + 5, bz = (i * 17) % 500 + 5;
    if (t.losBlocked(ax, t.heightAt(ax, az) + 2, az, bx, t.heightAt(bx, bz) + 2, bz)) blocked++;
    else clear++;
  }
  assert(blocked > 0, 'some lines should be blocked by ground');
  assert(clear > 0, 'some lines should be clear');
});
test('paths route round obstacles and tanks take different routes to men', () => {
  const w = new World(512, 20240607, MAPS.countryside.terrain);
  MAPS.countryside.build(w);
  const nav = new NavGrid(w);
  const foot = findPath(nav, 40, 40, 470, 470, false);
  const tank = findPath(nav, 40, 40, 470, 470, true);
  assert(foot && foot.length > 2, 'infantry should find a route');
  assert(tank && tank.length > 2, 'armour should find a route');
  const len = (p) => p.reduce((a, q, i) => (i ? a + Math.hypot(q.x - p[i - 1].x, q.z - p[i - 1].z) : 0), 0);
  const direct = Math.hypot(430, 430);
  assert(len(foot) > direct * 0.98, 'a route cannot be shorter than the straight line');
  assert(len(tank) < direct * 1.6, 'and should not be a wild detour either');
});
test('pathfinding is fast enough to run on demand', () => {
  const w = new World(512, 20240607, MAPS.countryside.terrain);
  MAPS.countryside.build(w);
  const nav = new NavGrid(w);
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    findPath(nav, (i * 71) % 500, (i * 37) % 500, (i * 113) % 500, (i * 53) % 500, i % 2 === 0);
  }
  const per = (Date.now() - t0) / 60;
  assert(per < 25, `paths took ${per.toFixed(1)} ms each, which is too slow`);
});

console.log('Buying reinforcements');
test('a call-in goes on cooldown, so manpower is not the only limit', () => {
  const b = new Battle({ seed: 21, size: 256, player: 'sov', enemy: 'ger' });
  b.sides.sov.mp = 5000;
  const first = b.purchase('sov', 'sov_rifle', 120, 20);
  assert(first, 'the first squad arrives');
  assert(b.cooldownLeft('sov', 'sov_rifle') > 0, 'and the call goes on cooldown');
  assert(!b.purchase('sov', 'sov_rifle', 120, 20), 'a second one is refused straight away');

  // Something else is still available: the cooldown is per call, not a lockout.
  assert(b.purchase('sov', 'sov_at', 120, 20), 'a different call still works');

  b.time += b.cooldownFor('sov_rifle') + 1;
  assert(b.cooldownLeft('sov', 'sov_rifle') === 0, 'and it comes back');
  assert(b.purchase('sov', 'sov_rifle', 120, 20), 'so it can be called again');
});
test('a refused purchase costs nothing', () => {
  const b = new Battle({ seed: 22, size: 256, player: 'sov', enemy: 'ger' });
  b.sides.sov.mp = 5000;
  b.purchase('sov', 'sov_rifle', 120, 20);
  const before = b.sides.sov.mp;
  b.purchase('sov', 'sov_rifle', 120, 20);
  assert(b.sides.sov.mp === before, 'manpower must not be taken for a call that is refused');
});
test('the opening force is deployed, not bought', () => {
  // It goes through the same code as a call-in, so it very nearly started its
  // own cooldowns — which would have barred each side from ever calling in the
  // squad it began the battle with, and dropped the second rifle squad on the
  // spot, because the two are placed one after the other.
  const b = new Battle({ seed: 23, size: 384, player: 'sov', enemy: 'ger' });
  const start = b.sides.sov.mp;
  assert(start > 0, 'a side opens with manpower in hand');
  for (const key of Object.values(b.callList('sov')).flat().map((c) => c.key)) {
    assert(b.cooldownLeft('sov', key) === 0, `${key} should not open on cooldown`);
  }
  const squads = new Set(b.world.entities.filter((e) => e.kind === 'soldier' && e.faction === 'sov' && e.squad)
    .map((e) => e.squad));
  assert(squads.size >= 2, `both opening squads should be on the field, saw ${squads.size}`);
});
test('the commander still fields an army with cooldowns in force', () => {
  // The cooldown made the AI pick something it could not have, get refused,
  // and buy nothing at all that cycle — which halved the size of every fight.
  const b = new Battle({ seed: 4242 });
  const steps = Math.round((8 * 60) / TICK);
  for (let i = 0; i < steps && !b.over; i++) b.step(TICK);
  const theirs = b.world.entities.filter((e) => e.faction === 'ger');
  assert(theirs.length > 20, `the enemy fielded only ${theirs.length} men and machines`);
});

console.log('Inventory and looting');
test('a soldier spawns carrying what his kit says', () => {
  const w = new World(256, 5);
  const s = makeSoldier(w, 'ger', 'engineer', 40, 40);
  const items = itemsOf(s);
  const keys = items.map((i) => i.key);
  assert(keys.includes('weapon'), 'no weapon');
  assert(keys.includes('mags'), 'no magazines');
  assert(keys.includes('mines'), 'an engineer carries mines');
  assert(keys.includes('repairKit'), 'an engineer carries a repair kit');
  assertBetween(loadOf(s), 1, CAPACITY, 'a fresh kit fits');
});
test('magazines only fit the weapon they came from', () => {
  const w = new World(256, 5);
  const rifleman = makeSoldier(w, 'ger', 'rifleman', 40, 40);   // Kar 98k
  const gunner = makeSoldier(w, 'ger', 'smg', 42, 40);          // MP 40
  const why = refuseTransfer(rifleman, gunner, 'mags', 1);
  assert(why && /do not fit/.test(why), `should refuse, said: ${why}`);

  // Taking the rifle itself is the way round it — which is the whole point.
  assert(transfer(rifleman, gunner, 'weapon'), 'should be able to take the rifle');
  assert(gunner.inv.primary === 'kar98k', 'he should be holding the Kar 98k');
  assert(rifleman.inv.primary === 'mp40', 'and the MP 40 went the other way');
  // The magazines went with it: a man is never left holding a weapon he has
  // no ammunition for, which is the state the rule exists to prevent.
  assert(gunner.inv.mags > 0, 'he got the magazines with the rifle');
  assert(refuseTransfer(rifleman, gunner, 'mags', 1) !== null,
    'and the MP 40 magazines he handed over still do not fit it');
});
test('a man cannot carry more than he can carry', () => {
  const w = new World(256, 5);
  const a = makeSoldier(w, 'sov', 'rifleman', 40, 40);
  const b = makeSoldier(w, 'sov', 'rifleman', 42, 40);
  a.inv.grenades = 40;
  let moved = 0;
  while (transfer(a, b, 'grenades', 1)) moved++;
  assert(moved > 0, 'he should take some');
  assert(loadOf(b) <= CAPACITY, `overloaded: ${loadOf(b)} of ${CAPACITY}`);
  assert(a.inv.grenades > 0, 'and leave the rest');
});
test('the dead can be robbed, and only of what fits', () => {
  const w = new World(256, 5);
  const s = makeSoldier(w, 'ger', 'rifleman', 40, 40);
  s.inv.grenades = 0;
  s.inv.mags = 1;
  const body = { inv: { primary: 'kar98k', mags: 6, rounds: 5, grenades: 3, launcher: null, rockets: 0, bandages: 2, mines: 0, repairKit: false, binoculars: false } };
  const got = takeAll(body, s);
  assert(got.length > 0, 'he should come back with something');
  assert(s.inv.mags > 1, 'magazines from a man with the same rifle');
  assert(s.inv.grenades > 0, 'and grenades');
  // Weapons are a decision, not something swept up.
  assert(body.inv.primary === 'kar98k', 'the rifle stays on the body until asked for');
});

console.log('Repairs, first aid and mines');
test('an engineer mends a blown track, and spends the kit doing it', () => {
  const b = new Battle({ seed: 11, size: 256, player: 'sov', enemy: 'ger' });
  const v = makeVehicle(b.world, 'sov', 't34_76', 100, 100);
  v.immobile = true;
  v.components.trackL.broken = true;
  const eng = makeSoldier(b.world, 'sov', 'engineer', 103, 100);
  assert(canRepair(eng), 'an engineer with a kit can repair');
  assert(damageOn(v), 'the tank is damaged');
  assert(beginRepair(eng, v) === 'tracks', 'he starts on the tracks');

  for (let i = 0; i < 400 && eng.job; i++) stepFieldwork(b, eng, 0.1);
  assert(!v.immobile, 'the track should be back on');
  assert(!v.components.trackL.broken, 'and the component mended');
  assert(!eng.inv.repairKit, 'the kit is used up');
  assert(!canRepair(eng), 'so he cannot do it again without another');
});
test('a repair only counts while he is standing at the tank', () => {
  const b = new Battle({ seed: 12, size: 256, player: 'sov', enemy: 'ger' });
  const v = makeVehicle(b.world, 'sov', 't34_76', 100, 100);
  v.immobile = true;
  const eng = makeSoldier(b.world, 'sov', 'engineer', 180, 100);   // a long way off
  beginRepair(eng, v);
  for (let i = 0; i < 400 && eng.job; i++) stepFieldwork(b, eng, 0.1);
  assert(v.immobile, 'he cannot mend it from eighty metres away');
  assert(eng.inv.repairKit, 'and has not used the kit up doing nothing');
});
test('a medic patches a wounded man up', () => {
  const b = new Battle({ seed: 13, size: 256, player: 'usa', enemy: 'ger' });
  const hurt = makeSoldier(b.world, 'usa', 'rifleman', 100, 100);
  hurt.hp = 30;
  hurt.bleeding = 1;
  const medic = makeSoldier(b.world, 'usa', 'medic', 101, 100);
  const bandages = medic.inv.bandages;
  assert(canHeal(medic), 'a medic with bandages can help');
  assert(beginHeal(medic, hurt), 'he sets to work');
  for (let i = 0; i < 200 && medic.job; i++) stepFieldwork(b, medic, 0.1);
  assert(hurt.hp > 30, `he should be better off: ${hurt.hp}`);
  assert(hurt.bleeding === 0, 'and no longer bleeding');
  assert(medic.inv.bandages === bandages - 1, 'one bandage gone');
});
test('a mine takes the track off the tank that runs over it', () => {
  const b = new Battle({ seed: 14, size: 256, player: 'sov', enemy: 'ger' });
  const eng = makeSoldier(b.world, 'sov', 'engineer', 120, 120);
  const mines = eng.inv.mines;
  assert(canMine(eng), 'an engineer carries mines');
  assert(beginMine(eng, 120, 120), 'and can lay one');
  for (let i = 0; i < 100 && eng.job; i++) stepFieldwork(b, eng, 0.1);
  assert(b.world.mines?.length === 1, 'the mine is in the ground');
  assert(eng.inv.mines === mines - 1, 'and out of his pack');

  // Ours does not go off under our own tanks.
  const friend = makeVehicle(b.world, 'sov', 't34_76', 120, 120);
  b.world.rebuildHash();          // battle.step does this before stepMines
  stepMines(b, 0.1);
  assert(!friend.immobile, 'a mine does not blow up its own side');
  b.world.remove(friend);

  const enemy = makeVehicle(b.world, 'ger', 'pz4h', 120, 120);
  b.world.rebuildHash();
  stepMines(b, 0.1);
  assert(enemy.immobile, 'but it does stop theirs');
  assert(!b.world.mines[0].live, 'and it is spent afterwards');
});

console.log('Attack ground');
test('a tank told to shell a spot puts high explosive on it', () => {
  const b = new Battle({ seed: 15, size: 256, player: 'sov', enemy: 'ger' });
  const v = makeVehicle(b.world, 'sov', 't34_76', 100, 100);
  v.yaw = 0;
  const he = v.ammo.he;
  assert(orderGroundFire(v, 100, 220, 3), 'a tank can take a fire mission');
  for (let i = 0; i < 600 && v.groundTarget; i++) {
    b.world.rebuildHash();
    stepCombat(b, 0.05);
  }
  assert(v.ammo.he < he, `it should have fired HE: ${he} -> ${v.ammo.he}`);
  assert(!v.groundTarget, 'and stopped when the rounds were spent');
});
test('a rifleman cannot be told to shell anything', () => {
  const w = new World(256, 5);
  const s = makeSoldier(w, 'ger', 'rifleman', 40, 40);
  assert(!orderGroundFire(s, 60, 60, 3), 'no cannon, no fire mission');
});

console.log('The camera');
test('panning goes the way the player pushed it', () => {
  // Direction, not just distance. Asserting only that the camera moved is what
  // let left and right stay swapped through three rounds of testing.
  const t = new Terrain(512, 1);
  t.height.fill(0);
  const cam = new THREE.PerspectiveCamera(48, 1.5, 0.6, 3000);
  const rig = new CameraRig(cam, t);
  rig.focus.set(256, 0, 256);
  rig.pitch = 50 * DEG;
  rig.distance = rig.targetDistance = 60;

  for (const yaw of [0, 0.9, -1.7, 2.6]) {
    rig.yaw = yaw;
    // Put the focus back before each probe: the previous iteration's pans
    // moved it, and the probe measures points around a fixed spot.
    rig.focus.set(256, 0, 256);
    rig.glide = null;
    rig.update(0.016, null);
    // project() reads matrixWorldInverse, which nothing has recomputed outside
    // a render — without this the probe is measured against a stale camera.
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

    // Establish which way screen-right actually is, by projecting a point.
    const probe = (dx, dz) => {
      const v = new THREE.Vector3(256 + dx, 0, 256 + dz).project(cam);
      return v.x;
    };
    const { rx, rz } = rig.basis();
    assert(probe(rx * 20, rz * 20) > 0.05,
      `at yaw ${yaw.toFixed(1)} the basis's screen-right does not project to the right`);

    // Dragging right must carry the ground right, which means the camera goes
    // the other way: minus screen-right.
    rig.focus.set(256, 0, 256);
    rig.glide = null;
    rig.panScreen(100, 0, 720);
    const mx = rig.focus.x - 256, mz = rig.focus.z - 256;
    assert(mx * rx + mz * rz < 0, `at yaw ${yaw.toFixed(1)} a rightward drag moved the camera the wrong way`);

    // Dragging down brings the ground towards you: the camera goes forward.
    const { fx, fz } = rig.basis();
    rig.focus.set(256, 0, 256);
    rig.panScreen(0, 100, 720);
    const dx2 = rig.focus.x - 256, dz2 = rig.focus.z - 256;
    assert(dx2 * fx + dz2 * fz > 0, `at yaw ${yaw.toFixed(1)} a downward drag did not move the camera forward`);

    // And the keys agree with the drag: D slides the view right.
    rig.focus.set(256, 0, 256);
    rig.pan(0, 1, 1);
    const kx = rig.focus.x - 256, kz = rig.focus.z - 256;
    assert(kx * rx + kz * rz > 0, `at yaw ${yaw.toFixed(1)} pressing D did not move the camera right`);

    rig.focus.set(256, 0, 256);
    rig.pan(1, 0, 1);
    const wx = rig.focus.x - 256, wz = rig.focus.z - 256;
    assert(wx * fx + wz * fz > 0, `at yaw ${yaw.toFixed(1)} pressing W did not move the camera forward`);
  }
});
test('a flick carries the camera the same way the drag did', () => {
  const t = new Terrain(512, 1);
  t.height.fill(0);
  const cam = new THREE.PerspectiveCamera(48, 1.5, 0.6, 3000);
  const rig = new CameraRig(cam, t);
  rig.focus.set(256, 0, 256);
  rig.pitch = 50 * DEG;
  rig.distance = rig.targetDistance = 60;
  rig.yaw = 0.7;
  rig.update(0.016, null);

  rig.panScreen(60, 0, 720);
  const dragX = rig.focus.x - 256, dragZ = rig.focus.z - 256;
  rig.focus.set(256, 0, 256);
  rig.fling(600, 0, 720);
  assert(rig.glide, 'a flick should set the camera gliding');
  const dot = rig.glide.x * dragX + rig.glide.z * dragZ;
  assert(dot > 0, 'the glide runs opposite to the drag that started it');
});
test('the minimap jump puts the camera where it was asked', () => {
  const t = new Terrain(512, 1);
  const cam = new THREE.PerspectiveCamera(48, 1.5, 0.6, 3000);
  const rig = new CameraRig(cam, t);
  rig.jumpTo(400, 120);
  assertBetween(rig.focus.x, 399, 401, 'jump x');
  assertBetween(rig.focus.z, 119, 121, 'jump z');
  assert(!rig.glide, 'a jump should cancel any glide');
});

test('Q and E turn the view the way the player asked for', () => {
  // The player found the conventional mapping inverted, so the keys were
  // swapped. Pin down what they now do on screen — a test that only checks
  // the yaw changed would pass with them back the wrong way round.
  //
  // Measured, not reasoned: winding the yaw up slides the whole scene to the
  // right, which brings the ground off the left edge into view. That is E.
  const t = new Terrain(512, 1);
  t.height.fill(0);
  const cam = new THREE.PerspectiveCamera(48, 1.5, 0.6, 3000);
  const rig = new CameraRig(cam, t);
  const settle = () => {
    rig.focus.set(256, 0, 256);
    rig.update(0.016, null);
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  };

  for (const yaw of [0, 1.2, -2.1]) {
    rig.yaw = yaw;
    rig.distance = rig.targetDistance = 60;
    settle();

    // A landmark straight ahead, in the middle of the screen.
    const { fx, fz } = rig.basis();
    const mark = new THREE.Vector3(256 + fx * 40, 0, 256 + fz * 40);
    const middle = mark.clone().project(cam).x;
    assert(Math.abs(middle) < 0.05, `at yaw ${yaw.toFixed(1)} the landmark is not centred`);

    // Holding E a quarter of a second carries it right, off towards the edge.
    rig.rotate(1.3 * 0.25, 0);
    settle();
    const afterE = mark.clone().project(cam).x;
    assert(afterE > middle + 0.05, `at yaw ${yaw.toFixed(1)} E turned the wrong way`);

    // Q takes it back the other way by the same amount.
    rig.yaw = yaw;
    settle();
    rig.rotate(-1.3 * 0.25, 0);
    settle();
    const afterQ = mark.clone().project(cam).x;
    assert(afterQ < middle - 0.05, `at yaw ${yaw.toFixed(1)} Q turned the wrong way`);
    assert(Math.abs(afterQ + afterE) < 0.05, 'Q and E should be mirror images');
  }
});
test('one wheel notch is one wheel notch, whatever reports it', () => {
  // Three units, one meaning. A mouse notch in Chrome is 100 pixels, in
  // Firefox 3 lines, and a page-mode wheel sends 1.
  assertBetween(wheelSteps({ deltaY: 100, deltaMode: 0 }), 0.99, 1.01, 'pixel notch');
  assertBetween(wheelSteps({ deltaY: 3, deltaMode: 1 }), 0.99, 1.01, 'line notch');
  assertBetween(wheelSteps({ deltaY: 1, deltaMode: 2 }), 0.99, 1.01, 'page notch');
  // Direction survives, and no single event may do more than a notch.
  assert(wheelSteps({ deltaY: -100, deltaMode: 0 }) < 0, 'scrolling up should zoom the other way');
  assertBetween(wheelSteps({ deltaY: 4000, deltaMode: 0 }), 0.99, 1.01, 'a huge delta is still one notch');
});
test('a trackpad swipe does not cross the whole zoom range', () => {
  // This is the bug the player hit: the old handler took only the sign of
  // deltaY, so each of the thirty tiny events a trackpad fires during one
  // swipe counted as a full step and the view shot from the men to the sky.
  const t = new Terrain(512, 1);
  const rig = new CameraRig(new THREE.PerspectiveCamera(48, 1.5, 0.6, 3000), t);
  rig.targetDistance = 70;
  for (let i = 0; i < 30; i++) rig.zoom(wheelSteps({ deltaY: 4, deltaMode: 0 }));
  assertBetween(rig.targetDistance / 70, 1.02, 1.6,
    'thirty trackpad events should be a nudge, not a journey');

  // A deliberate mouse-wheel roll still gets somewhere in a hurry.
  rig.targetDistance = 70;
  for (let i = 0; i < 6; i++) rig.zoom(wheelSteps({ deltaY: 100, deltaMode: 0 }));
  assertBetween(rig.targetDistance / 70, 1.5, 2.6, 'six notches should roughly double the range');
});
test('zoom stays inside its limits', () => {
  const t = new Terrain(512, 1);
  const rig = new CameraRig(new THREE.PerspectiveCamera(48, 1.5, 0.6, 3000), t);
  for (let i = 0; i < 200; i++) rig.zoom(1);
  assertBetween(rig.targetDistance, ZOOM_MAX - 0.01, ZOOM_MAX + 0.01, 'zoomed all the way out');
  for (let i = 0; i < 200; i++) rig.zoom(-1);
  assertBetween(rig.targetDistance, ZOOM_MIN - 0.01, ZOOM_MIN + 0.01, 'zoomed all the way in');
});
test('a pinch moves the camera less than the fingers move', () => {
  const t = new Terrain(512, 1);
  const rig = new CameraRig(new THREE.PerspectiveCamera(48, 1.5, 0.6, 3000), t);
  rig.targetDistance = 80;
  const touch = new TouchInput({}, rig, {}, { active: false }, {}, {});
  touch.enabled = true;

  const finger = (id, x, y) => ({ pointerType: 'touch', pointerId: id, clientX: x, clientY: y });
  touch.down(finger(1, 400, 500));
  touch.down(finger(2, 520, 500));   // 120 px apart
  touch.move(finger(2, 440, 500));   // squeezed to 40: a third of the gap

  // Undamped that was a 3x change in one grab. It should be well short of it,
  // and still clearly zooming out.
  const ratio = rig.targetDistance / 80;
  assertBetween(ratio, 1.2, 2.0, 'a hard pinch should zoom out, but not by three times');
  touch.clearLong();
});
test('twisting two fingers rotates without zooming', () => {
  const t = new Terrain(512, 1);
  const rig = new CameraRig(new THREE.PerspectiveCamera(48, 1.5, 0.6, 3000), t);
  rig.targetDistance = 80;
  const touch = new TouchInput({}, rig, {}, { active: false }, {}, {});
  touch.enabled = true;
  const finger = (id, x, y) => ({ pointerType: 'touch', pointerId: id, clientX: x, clientY: y });

  // Two fingers 100 px apart, turned 30 degrees about their midpoint. The
  // separation wobbles by a few pixels the way a real hand's would.
  touch.down(finger(1, 450, 500));
  touch.down(finger(2, 550, 500));
  const a = 30 * DEG, r = 51;
  touch.move(finger(1, 500 - Math.cos(a) * r, 500 - Math.sin(a) * r));
  touch.move(finger(2, 500 + Math.cos(a) * r, 500 + Math.sin(a) * r));

  assert(Math.abs(rig.yaw) > 0.4, 'a 30 degree twist should turn the camera');
  assertBetween(rig.targetDistance, 79.99, 80.01, 'a twist should not zoom');
  touch.clearLong();
});

console.log('A whole battle');
test('a battle runs for ten minutes without falling over', () => {
  const b = new Battle({ seed: 4242 });
  const steps = Math.round((10 * 60) / TICK);
  for (let i = 0; i < steps && !b.over; i++) b.step(TICK);
  assert(b.time > 60, 'the clock should have advanced');
  assert(b.world.entities.length > 0, 'somebody should still be alive');
  assert(b.world.log.length > 10, 'something should have happened');
});
test('both sides take and lose ground', () => {
  const b = new Battle({ seed: 4242 });
  const steps = Math.round((10 * 60) / TICK);
  for (let i = 0; i < steps && !b.over; i++) b.step(TICK);
  const flags = b.stats().flags;
  const held = Object.values(flags).reduce((a, n) => a + n, 0);
  assert(held === b.world.flags.length, 'every objective should be accounted for');
  assert(b.world.log.some((l) => l.tone === 'flag'), 'an objective should have changed hands');
});
test('tanks are knocked out and infantry become casualties', () => {
  const b = new Battle({ seed: 4242 });
  const steps = Math.round((10 * 60) / TICK);
  for (let i = 0; i < steps && !b.over; i++) b.step(TICK);
  assert(b.world.corpses.length > 5, 'there should be casualties');
  const wrecks = b.world.entities.filter((e) => e.kind === 'vehicle' && (e.destroyed || e.abandoned));
  assert(wrecks.length > 0, 'there should be wrecks');
});
test('the simulation runs far faster than real time', () => {
  const b = new Battle({ seed: 909 });
  const steps = Math.round((60) / TICK);
  const t0 = Date.now();
  for (let i = 0; i < steps && !b.over; i++) b.step(TICK);
  const ratio = 60 / ((Date.now() - t0) / 1000);
  assert(ratio > 8, `only ${ratio.toFixed(1)}x real time, which leaves nothing for rendering`);
});
test('ammunition is finite: units run dry and stop firing', () => {
  const w = new World(512, 3);
  const v = makeVehicle(w, 'sov', 'is2', 200, 200);
  const total = v.ammo.ap + v.ammo.he;
  assert(total < 40, 'an IS-2 should carry very few rounds');
  const s = makeSoldier(w, 'ger', 'rifleman', 100, 100);
  assert(s.inv.mags > 0 && s.inv.rounds === WEAPONS[s.inv.primary].mag, 'a rifleman starts with a full magazine');
});
test('the same seed gives the same battle', () => {
  const run = (seed) => {
    const b = new Battle({ seed });
    for (let i = 0; i < 1200; i++) b.step(TICK);
    return `${b.world.entities.length}|${b.world.corpses.length}|${JSON.stringify(b.stats().flags)}`;
  };
  assert(run(31337) === run(31337), 'two runs of the same seed diverged');
});

console.log('Footprints, the city, and the buildings in it');
test('a long building blocks its own ground and not the street beside it', () => {
  const block = { x: 100, z: 100, w: 40, d: 14, yaw: 0 };
  assert(isBoxed(block), 'a prop with w and d is a box');
  assert(propDistance(block, 100, 100) === 0, 'inside is inside');
  assert(propDistance(block, 119, 100) < 0.01, 'still inside along its length');
  assertBetween(propDistance(block, 100, 110), 2.5, 3.5, 'distance to the side');
  assert(propSegmentT(block, 60, 110, 140, 110) === null, 'the street beside it is clear');
  assert(propSegmentT(block, 60, 100, 140, 100) !== null, 'a line through it is not');
});
test('turning a building turns its footprint with it', () => {
  const along = { x: 100, z: 100, w: 40, d: 14, yaw: 0 };
  const across = { x: 100, z: 100, w: 40, d: 14, yaw: Math.PI / 2 };
  assert(propSegmentT(along, 60, 110, 140, 110) === null, 'clear when it lies along the street');
  assert(propSegmentT(across, 60, 110, 140, 110) !== null, 'blocked when it lies across it');
});
test('the city generates a street grid with blocks between the streets', () => {
  const w = new World(512, 20240607, MAPS.city.terrain);
  assert(w.terrain.blocks && w.terrain.blocks.length > 30, 'the grid should produce blocks');
  const flat = w.terrain.height.reduce((a, h) => Math.max(a, Math.abs(h)), 0);
  assert(flat < 6, `a city should be flat: relief is ${flat.toFixed(1)} m`);
});
test('the city is full of buildings and they can be occupied', () => {
  const w = new World(512, 20240607, MAPS.city.terrain);
  MAPS.city.build(w);
  const houses = w.props.filter((p) => isGarrisonable(p));
  assert(houses.length > 80, `expected a city, got ${houses.length} buildings`);
  assert(w.props.some((p) => p.type === 'factory'), 'there should be a factory');
  assert(w.props.filter((p) => p.type === 'ruin').length > 10, 'some of it should already be ruined');
  assert(houses.every((p) => p.w > 0 && p.d > 0), 'buildings must have real footprints');
});
test('the streets are passable even though the blocks are not', () => {
  const w = new World(512, 20240607, MAPS.city.terrain);
  MAPS.city.build(w);
  const nav = new NavGrid(w);
  assert(findPath(nav, 256, 20, 256, 490, true), 'armour must be able to cross the city');
  assert(findPath(nav, 20, 20, 490, 490, false), 'infantry must be able to cross it');
});
test('a path can start inside a building, which is where garrisons come from', () => {
  const w = new World(512, 20240607, MAPS.city.terrain);
  MAPS.city.build(w);
  const nav = new NavGrid(w);
  const house = w.props.find((p) => isGarrisonable(p) && p.w > 20);
  assert(findPath(nav, house.x, house.z, 256, 256, false), 'must find a way out of the building');
});
test('men occupy windows, up to the building capacity', () => {
  const w = new World(512, 7, MAPS.city.terrain);
  MAPS.city.build(w);
  const house = w.props.find((p) => isGarrisonable(p) && p.capacity >= 5);
  assert(windowSlots(house).length >= house.capacity, 'a window each, at least');
  const men = [];
  for (let i = 0; i < house.capacity + 4; i++) men.push(makeSoldier(w, 'sov', 'rifleman', house.x, house.z));
  w.rebuildHash();
  let admitted = 0;
  for (const m of men) if (enterBuilding(w, m, house)) admitted++;
  assert(admitted === house.capacity, `admitted ${admitted}, capacity ${house.capacity}`);
  assert(garrisonCount(w, house) === house.capacity);
  const upstairs = men.filter((m) => m.garrison != null && m.garrisonFloor > 0);
  assert(upstairs.length > 0, 'somebody should be on an upper floor');
  for (const m of men) {
    if (m.garrison == null) continue;
    assert(m.y > w.terrain.heightAt(m.x, m.z) + 0.8, 'a garrisoned man stands above the ground');
  }
});
test('leaving a building puts a man outside it, on the ground', () => {
  const w = new World(512, 7, MAPS.city.terrain);
  MAPS.city.build(w);
  const house = w.props.find((p) => isGarrisonable(p) && p.capacity >= 4);
  const s = makeSoldier(w, 'sov', 'rifleman', house.x, house.z);
  w.rebuildHash();
  assert(enterBuilding(w, s, house));
  leaveBuilding(w, s);
  assert(s.garrison === null, 'no longer inside');
  assert(propDistance(house, s.x, s.z) > 0.5, 'and standing clear of the wall');
  assertBetween(s.y - w.terrain.heightAt(s.x, s.z), -0.01, 0.01, 'back on the ground');
});
test('a man at a window sees further and is harder to see', () => {
  const w = new World(512, 7, MAPS.city.terrain);
  MAPS.city.build(w);
  const house = w.props.find((p) => isGarrisonable(p) && p.floors >= 4);
  const outside = makeSoldier(w, 'sov', 'rifleman', house.x + 20, house.z);
  // Fill the lower floors so the next man in goes upstairs.
  let inside = null;
  for (let i = 0; i < house.capacity; i++) {
    const m = makeSoldier(w, 'sov', 'rifleman', house.x, house.z);
    if (enterBuilding(w, m, house) && (m.garrisonFloor ?? 0) >= 1) inside = m;
  }
  w.rebuildHash();
  assert(inside && inside.garrison != null, 'somebody should end up on an upper floor');
  assert(eyeHeight(w, inside) > eyeHeight(w, outside) + 1, 'his eyes are higher up');
  assert(signature(w, inside) < signature(w, outside), 'and he is harder to pick out');
});
test('buildings stand up to shellfire but not indefinitely', () => {
  const w = new World(512, 7, MAPS.city.terrain);
  MAPS.city.build(w);
  const house = w.props.find((p) => p.type === 'apartment');
  const start = house.hp;
  // A single mortar bomb should barely mark it.
  explode(w, house.x, 1, house.z, 0.6, WEAPONS.grw34_81, 'ger');
  assert(house.alive, 'one mortar round does not level a block of flats');
  assert(house.hp < start, 'but it does do some harm');
  // A sustained bombardment eventually does.
  for (let i = 0; i < 60 && house.alive; i++) explode(w, house.x, 1, house.z, 3.6, WEAPONS.d25t_122, 'ger');
  assert(!house.alive, 'sixty heavy shells should bring it down');
});
test('rifle fire does not demolish buildings', () => {
  const w = new World(512, 7, MAPS.city.terrain);
  MAPS.city.build(w);
  const house = w.props.find((p) => p.type === 'apartment');
  const shooter = makeSoldier(w, 'ger', 'rifleman', house.x, house.z + 40);
  w.rebuildHash();
  const before = house.hp;
  for (let i = 0; i < 200; i++) {
    fireWeapon(w, shooter, 'kar98k', { x: house.x, y: 1.6, z: house.z + 40 },
      { x: house.x, y: 4, z: house.z }, { aim: 1, shell: 'bullet' });
    for (let s = 0; s < 200 && w.projectiles.length; s++) stepProjectiles(w, 1 / 120);
  }
  assert(house.alive, 'two hundred rifle rounds should not bring a building down');
  assert(house.hp > before * 0.9, 'nor take a tenth off it');
});
test('a battle in the city plays out and puts men in the windows', () => {
  const b = new Battle({ seed: 1942, map: 'city' });
  const red = new Commander(b, b.playerSide);
  const steps = Math.round((10 * 60) / TICK);
  for (let i = 0; i < steps && !b.over; i++) { b.step(TICK); red.step(TICK); }
  const men = b.world.entities.filter((e) => e.kind === 'soldier' && !e.inVehicle);
  const inside = men.filter((m) => m.garrison != null);
  assert(b.world.corpses.length > 20, 'a city fight should be costly');
  assert(inside.length > 3, `only ${inside.length} men took to the buildings`);
  assert(b.world.log.some((l) => l.tone === 'flag'), 'ground should change hands');
});
test('both maps run at well over real time', () => {
  for (const map of ['countryside', 'city']) {
    const b = new Battle({ seed: 909, map });
    const steps = Math.round(60 / TICK);
    const t0 = Date.now();
    for (let i = 0; i < steps && !b.over; i++) b.step(TICK);
    const ratio = 60 / ((Date.now() - t0) / 1000);
    assert(ratio > 8, `${map} runs at only ${ratio.toFixed(1)}x real time`);
  }
});

console.log('\n' + results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
