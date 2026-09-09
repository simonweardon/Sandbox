# Direct Control

A real-time tactics game in the mould of *Men of War: Assault Squad 2* — built
from scratch, running in a browser, with no art files and no dependencies
beyond three.js.

**Play it: <https://game-production-9b29.up.railway.app>** — on a computer or a
phone, nothing to install.

To run it yourself: open `index.html`, or `npm start` and visit
<http://localhost:3000>.

Deployed from this branch on Railway; every push redeploys it.

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
| Destructible scenery that tanks flatten and shells knock down | `src/sim/maps.js` |
| Occupying buildings and fighting from the windows | `src/sim/garrison.js` |
| Ammunition that runs out, and crates and lorries that replace it | `src/sim/supply.js` |
| Playable with a thumb as well as a mouse | `src/input/touch.js` |

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

## Two battlefields

Pick one on the opening screen, or with `?map=city` in the address.

**Rolling farmland.** Open ground, long sightlines, hedges and copses. Armour
in its element: a Tiger sitting in a treeline commands everything it can see,
which is most of the map, and infantry cross the open at their peril.

**The city.** A street grid of apartment blocks, ruins, a factory hall and a
square, laid over ground somebody once levelled. It is a completely different
battle. Nothing sees past about fifty metres. Armour cannot leave the street,
and every window it drives past might hold somebody with a Panzerfaust. The
objectives are landmarks — the grain elevator, the tractor works, the rail
yard — and they change hands room by room.

### Buildings are the ground you fight over

Right-click a building with infantry selected and they go inside, spreading up
the floors and taking a window each. From there they:

- **see further**, because they are looking out of a fourth-floor window rather
  than standing in the street
- **are much harder to see**, and much harder to hit — a window frame is the
  best cover on the map short of armour
- **only cover the arc their window faces**, so a building has blind sides
- **cannot be shifted by rifle fire.** Two hundred rounds will not take a tenth
  off a block of flats. It takes high explosive, and a lot of it: about sixty
  122 mm shells to bring one down, at which point everyone inside goes with it
  bar the few who get clear

Press `U` to turn them out again. The enemy commander does the same thing —
about two fifths of every formation it takes ground with stays behind to hold
the buildings overlooking it, which is why taking a block off it is slow work.

## Playing it

It runs on a phone as well as a computer. Press **F1** for the controls.

### On a touchscreen

There is no right button and no keyboard, so the scheme is a different one:

| Gesture | What it does |
| --- | --- |
| Tap your own unit | Select it |
| Long press it | Select the whole squad |
| Tap anywhere else | Order the selection there — move, attack, get in, occupy, depending on what is under your finger |
| Drag | Pan. The ground moves with your finger, and a flick keeps it going |
| Tap or drag the minimap | Jump the camera straight there |
| Pinch, twist | Zoom, rotate. The zoom is damped — mapping finger separation straight onto camera distance made a normal pinch a leap |
| **All** | Select your whole force at once |
| **Box** | Then drag a box round the units you want |
| Rest of the bar | Stance, hold fire, stop, get out, take over |

Taking a unit over swaps that bar for a thumb stick on the left, a drag-to-aim
area, and a trigger — the same direct control, driven with two thumbs. The
panels stand down while you are driving, so nothing sits under your hands.

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

**Money.** Manpower accrues every second, faster for each objective you hold,
and taking an objective **for the first time** pays a bonus of 180 on top —
which is most of a rifle squad. That first push into new ground is the one
worth making. Spend it on infantry, towed guns, ammunition crates and armour
from the panel in the corner.

**Ammunition runs out**, so supply is something you buy. A crate dropped
behind the line, or a lorry parked near it, refills pouches, grenades, rockets
and shell racks — slowly, and only for men who have stopped moving.

**You start with a real force**, on both maps: two rifle squads, a towed gun
and a tank, deployed on open ground rather than inside a building.

**Winning.** Five objectives run down the middle of the map. Take all five to
win outright, break the enemy entirely, or hold more ground than them when the
thirty-minute clock runs out. A typical battle runs ten to twenty minutes and
ends with a card telling you what it cost both sides.

## How it is put together

```
src/
  core/          seeded RNG and maths
  data/          33 weapons, 17 vehicles, 4 towed guns, squads, factions
  sim/           the game, headless — runs with no renderer at all
    terrain.js       heightfield, country lanes or a city street grid
    maps.js          the two battlefields and what fills them
    shapes.js        prop footprints — a building is a box, not a circle
    world.js         entities, destructible scenery, cover, objectives
    garrison.js      occupying buildings and firing from the windows
    penetration.js   facet selection, slope, overmatch, ricochet
    ballistics.js    drag-aware trajectories and the gun-laying solver
    damage.js        spalling, components, crew, fire, blast
    vision.js        spotting by signature rather than by radius
    pathfinding.js   A* with separate costs for men and for armour
    combat.js        acquisition, traverse, shell selection, ammunition
    orders.js        order queues, hull steering, terrain following
    capture.js       objectives, the manpower economy and capture bonuses
    supply.js        ammunition crates, lorries and resupply
    ai.js            a commander that buys against an order of battle
    battle.js        the fixed 30 Hz step that drives all of it
  render/        everything visual, and nothing tactical
    models/          the procedural model builders
  input/         camera, selection, direct control, touch
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

The ground is the same idea. Its grain is a tiling texture drawn into a canvas
at load time from wrapped value noise at three scales, multiplied over vertex
colours that carry the terrain type and vary at three more. On top of that go
several thousand tufts, stones and pieces of brick, clustered into patches
rather than scattered evenly, because ground cover grows in patches — all of
it in three InstancedMesh draw calls, and thinned out on a phone where fill
rate costs more than triangles.

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

**A map.** Add an entry to `MAPS` in `src/sim/maps.js`: how the terrain should
be generated, a function that fills it with scenery, and where the five
objectives go. Everything else — pathfinding, line of sight, the AI's sense of
where to go — reads the world that function builds.

## Running it

```
npm start            # serve on :3000
npm test             # 47 tests of the simulation, no browser needed
npm run test:browser # 37 more, driving the real interface with mouse and keys
npm run test:mobile  # 23 more, driving it with a thumb on a phone screen
```

No build step and no install: the only dependency is three.js, vendored under
`vendor/` (MIT, licence included). The browser tests want Playwright, which is
deliberately *not* a dependency — install it yourself, or point
`PLAYWRIGHT_PATH` and `CHROMIUM_PATH` at an existing one. Without it they say
so and skip.

### Three kinds of test, because there are three kinds of bug

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
- a wheel handler that read only the *sign* of `deltaY`, so each of the thirty
  tiny events a trackpad fires during one swipe counted as a full zoom step and
  the view shot from the men to the sky

The last two only show up if you sit and watch a whole battle, which is why
the suite now plays one to the end and then counts what is still on the GPU.

`test/mobile.mjs` drives it with a thumb on a phone-sized touchscreen, and
found two of these that neither of the others could see: the stylesheet had no
`touch-action`, so the browser held every touch back to see whether it was a
scroll and the canvas never received a `pointerdown` at all; and the
reinforcement panel covered the middle third of a portrait screen, so taps
meant for the battlefield landed on it instead. Both made the game unplayable
on a phone while every desktop test stayed green.
