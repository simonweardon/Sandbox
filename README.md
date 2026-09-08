# Direct Control

A real-time tactics game in the mould of *Men of War: Assault Squad 2* — built
from scratch, running in a browser, with no art files and no dependencies
beyond three.js.

Open `index.html`, or `npm start` and visit <http://localhost:3000>.

## What this is, and what it isn't

*Men of War: Assault Squad 2* is a commercial game. Its models, textures,
sounds and maps are its developers' property, and this project contains none of
them — I have no access to them and could not ship them if I did. What it
contains instead is an original implementation of the systems that make that
game what it is, with every model generated procedurally from primitives at
load time, so the whole thing is free to use and modify.

So this is not a copy of the game. It is a working recreation of how the game
*behaves*: the parts a player actually feels.

| The thing it does | Where it lives |
| --- | --- |
| Direct control of any unit, with the crew's own limits | `src/input/directcontrol.js` |
| Every round a simulated projectile, with drop and travel time | `src/sim/ballistics.js` |
| Armour resolved plate by plate, with slope and ricochet | `src/sim/penetration.js` |
| Vehicles wrecked component by component, not by a health bar | `src/sim/damage.js` |
| Finite ammunition, magazines, and crews that bail out | `src/sim/units.js` |
| Suppression, morale, stance and cover | `src/sim/damage.js`, `src/sim/orders.js` |
| Fog of war driven by what a unit is doing, not a flat radius | `src/sim/vision.js` |
| Objectives, manpower and reinforcement call-ins | `src/sim/capture.js` |
| Destructible scenery that tanks flatten and shells knock down | `src/sim/world.js` |

## The bit that matters: armour

A shell arriving at a tank is resolved the way a real one is.

1. **Which plate did it hit?** The hull and the turret are separate boxes and
   the turret turns, so a tank that has swung its turret towards you can still
   be showing you the thin side of its hull. The mantlet is picked out
   separately from the turret face around it.
2. **How thick is that plate along the shell's path?** The armour table gives
   each facet a thickness and a slope, and the geometry gives the angle of
   arrival. A T-34's 45 mm glacis at 60 degrees is worth about 90 mm to a shell
   arriving flat — until a big enough shell overmatches it and ignores much of
   that.
3. **Does it get through?** Solid shot skates off above about 70 degrees unless
   it overmatches the plate. Shaped charges hold on much longer but are set off
   early by skirt plates. A shot that falls just short still rattles the crew.
4. **What does it wreck on the way in?** The shell carries on through the
   fighting compartment and hits whatever is in its path: the driver, the
   engine, the gun breech, the fuel in the rear sponson, the ready rounds in the
   hull side. Losing the gunner is not the same as losing the engine, and
   neither is the same as a hit on the ammunition, which ends the tank.

There is no hit-point bar anywhere in the game. A vehicle is finished when its
crew are dead, when they have had enough and got out, or when the ammunition
goes up — which is why a knocked-out tank often sits there intact, and you can
walk a spare crew over and drive it away.

### Does it agree with history?

That is the only test worth applying to a model like this, so `npm test`
applies it:

```
a Panzer IV kills a T-34/76 frontally, well beyond a kilometre          ok
a T-34/76 cannot touch a Tiger frontally at any range                   ok
but it can hurt a Tiger from the flank, at point-blank range only       ok
a 75 mm Sherman bounces off a Panther's glacis and kills it in the flank ok
the 88 cannot crack an IS-2 glacis but goes through a Sherman at 2 km   ok
turning the turret changes which plate is struck                        ok
slope is worth more than its nominal thickness                          ok
a big shell overmatches thin sloped plate rather than skidding off it   ok
```

Measured hit rates come out at about 87% at 300 m, 55% at 800 m and 20% at
1500 m for a 7.5 cm KwK 40 against a T-34 — which is roughly what the wartime
range tables promised.

## Playing it

Press **F1** for the controls at any time.

**Commanding.** Left click or drag to select, double click for the whole squad,
right click to move — or to attack whatever is under the cursor. Shift queues
orders, Ctrl plus right click is an attack-move, and right-clicking one of your
own vehicles puts the selected infantry aboard (hold Ctrl to crew it rather
than ride in it). `1`/`2`/`3` set stance, `H` holds fire, `X` stops, `U`
dismounts.

**Direct control.** Select a unit and press **Enter**. You are now the crew.
`W`/`A`/`S`/`D` drive, the mouse lays the gun, left click fires the main
armament and right click the machine gun. `R` swaps between AP and HE.

Nothing is relaxed while you are driving. The Tiger's turret still takes
fifteen seconds to come round, the loader still needs six seconds, the shell
still drops, and the armour still decides what happens when it arrives. The
crosshair goes amber while the turret is still traversing and green when the
gun is laid and loaded. That gap is the whole game.

**Winning.** Five objectives run down the middle of the map. Holding them pays
for reinforcements, which arrive at your own edge and have to make their way
up. Take all five to win — a typical battle runs ten to twenty minutes, and
ends with a card telling you what it cost both sides.

## How it is put together

```
src/
  core/          seeded RNG and maths
  data/          33 weapons, 17 vehicles, 4 towed guns, squads, factions
  sim/           the game, headless — runs with no renderer at all
    terrain.js       heightfield, roads, terrain-masking line of sight
    world.js         entities, destructible scenery, cover, objectives
    penetration.js   facet selection, slope, overmatch, ricochet
    ballistics.js    drag-aware trajectories and the gun-laying solver
    damage.js        spalling, components, crew, fire, blast
    vision.js        spotting by signature rather than by radius
    pathfinding.js   A* with separate costs for men and for armour
    combat.js        acquisition, traverse, shell selection, ammunition
    orders.js        order queues, hull steering, terrain following
    capture.js       objectives and the manpower economy
    ai.js            a commander that buys against an order of battle
    battle.js        the fixed 30 Hz step that drives all of it
  render/        everything visual, and nothing tactical
    models/          the procedural model builders
  input/         camera, selection, direct control
test/run.js      34 tests, most of them against the historical record
```

The simulation knows nothing about the renderer. `test/run.js` fights entire
ten-minute battles in Node with no browser involved, which is how the balance
above was measured.

### There are no art files

Every model in the game is assembled from boxes, cylinders and lofted hulls
when the page loads, painted into vertex colours and merged down so that a
hundred and fifty units cost a few hundred draw calls rather than a few
thousand.

The vehicle builder reads the same record the simulation does. A hull is lofted
through the profile its own armour table describes, so a T-34 comes out with
steeply sloped sides and a Tiger comes out slab-sided because that is what
their armour arrays say. Running gear, turret shape, mantlet, skirts and
stowage all come from the same place. Adding a new tank means adding a record
to `src/data/vehicles.js` — no modelling required.

Suspension is drawn to type: interleaved road wheels for the Panther and Tiger,
Christie for the T-34, VVSS and HVSS bogies for the two Shermans, torsion bars
for the Panzer III and KV-1.

## Adding things

**A vehicle.** Add a record to `VEHICLES` in `src/data/vehicles.js`: crew,
speeds, turret traverse, the armour array, its guns, and the `model` block of
dimensions. Then add its key to a faction's `calls.vehicles` in
`src/data/factions.js` so it can be called in.

**A weapon.** Add it to `WEAPONS` in `src/data/weapons.js` with its muzzle
velocity, penetration at 100 m and the rate that falls off, dispersion in
milliradians, and reload. Everything downstream — ballistics, penetration, the
AI's judgement about what it can hurt — reads those numbers.

**A squad.** Add a template to `SQUADS` in `src/data/infantry.js` listing the
roles in it, and a kit per role in `KITS`.

## Running it

```
npm start            # serve on :3000
npm test             # 34 tests of the simulation, no browser needed
npm run test:browser # 25 more, driving the real interface with mouse and keys
```

No build step and no install: the only dependency is three.js, vendored under
`vendor/` (MIT, licence included). The browser tests want Playwright, which is
deliberately *not* a dependency — install it yourself, or point
`PLAYWRIGHT_PATH` and `CHROMIUM_PATH` at an existing one. Without it they say
so and skip.

### Two kinds of test, because there are two kinds of bug

`test/run.js` fights whole battles in Node with no renderer at all, which is
how the balance figures above were measured. It caught five real bugs while it
was being written: an infantry role used but never defined, understated 76 mm
penetration figures, a projectile ceiling that culled mortar shells in
mid-flight, an elevation solver that could walk past vertical and fire
backwards over the firer, and fuel tanks modelled *inside* the engine so that
engine hits were absorbed by the fuel.

`test/browser.mjs` clicks and types at the real thing, and plays a battle
through to its end. It caught everything the headless tests could never have
seen, because none of it was in the simulation at all:

- a stylesheet rule whose ID specificity beat `pointer-events: none`, letting
  the crosshair swallow every click at the centre of the screen
- a double click that never registered, because pointer events report `detail`
  as `0`
- attack-move bound to `A`, which is also camera-left, so arming it slid the
  view off the target
- winning did nothing: the battle simply stopped and never said why
- a material cloned for every wreck, body and shell crater and never released —
  734 of them by the fourteenth minute, against 16 now

The last two only show up if you sit and watch a whole battle, which is why
the suite now plays one to the end and then counts what is still on the GPU.
