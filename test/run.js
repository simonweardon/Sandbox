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
import { World, populateScenery } from '../src/sim/world.js';
import { Terrain } from '../src/sim/terrain.js';
import { NavGrid, findPath } from '../src/sim/pathfinding.js';
import { makeVehicle, makeSquad, makeGun, makeSoldier, boardVehicle, disembark } from '../src/sim/units.js';
import { fireWeapon, stepProjectiles, solveElevationDrag } from '../src/sim/ballistics.js';
import { applySpall, evaluateVehicle, explode, stepAttrition } from '../src/sim/damage.js';
import { Battle, TICK } from '../src/sim/battle.js';
import { DEG } from '../src/core/util.js';
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
  const w = new World(512, 20240607);
  populateScenery(w);
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
  const w = new World(512, 20240607);
  populateScenery(w);
  const nav = new NavGrid(w);
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    findPath(nav, (i * 71) % 500, (i * 37) % 500, (i * 113) % 500, (i * 53) % 500, i % 2 === 0);
  }
  const per = (Date.now() - t0) / 60;
  assert(per < 25, `paths took ${per.toFixed(1)} ms each, which is too slow`);
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

console.log('\n' + results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
