# Vantage

A third-person desert survival demo for Unreal Engine 5, written entirely in
C++. A bearded gunslinger with a six shooter, the ruins of a dead city buried in
sand, and a vault to reach with the dead standing between you and it.

The unusual thing about it: **the project contains no content assets.** No
`.umap`, no Blueprints, no meshes, no materials, no UMG widgets, no Enhanced
Input assets, no animations. The desert, the towers, the revolver, the zombies
and the gunslinger himself — beard included — are all constructed in C++ at
runtime from the primitive shapes that ship with the engine. Clone, build, press
Play.

## Running it

```
./Tools/build.sh     # finds your engine, builds, reports the first errors
./Tools/run.sh       # launches the editor on this project
```

Both take no arguments. `build.sh` searches the usual install roots and falls
back to Spotlight; override with `UE_ROOT="/path/to/UE_5.7" ./Tools/build.sh`.
On Windows use `Tools\build.bat`.

Do not launch the `.uproject` with `open` on macOS — the file association fails
silently and the window vanishes with no error. `run.sh` invokes the editor
binary directly and keeps the log on your terminal.

Built and run against **UE 5.7**. Targets use `BuildSettingsVersion.V6` and
`EngineIncludeOrderVersion.Latest`; older engines will need those stepped back.

## Controls

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Move | WASD or arrows | Left stick |
| Look | Mouse | Right stick |
| Fire | Left mouse | Right trigger |
| Reload | R | X |
| Sprint | Hold Shift | Left stick click |
| Crouch | Ctrl or C | B |
| Jump | Space | A |
| Flashlight | F | Y |

Two body shots kill a shambler; one to the head does it outright. Six rounds,
then a two second reload — the crosshair opens up while you are empty, which is
the whole tension of the thing.

## The loop

**Fight north to the vault ruin, read the combination off the plaque inside,
climb the stairs, work the lock, take the cache, carry it back to the beacon.**
The vault is 46 metres out, past the ring the horde spawns on, and each wave puts
an extra group directly in front of its door — so the objective is always on the
far side of the dead.

The combination is four digits, rolled fresh every run and stencilled on a lit
plaque on the ground floor. At the lock, **A/D** picks a dial, **W/S** turns it,
**E** tries it and **R** steps back. Taking a hit while you are stood at it
throws you out of it.

A **robot dog** trots at your heel and runs down any shambler that gets within
22 metres of you, biting until it drops. Zombies swat back, and enough of that
puts the dog into a nine second reboot on its belly.

Waves arrive on a timer with a countdown. Wave *N* fields `4 + (N-1)*2` on the
ring plus `3 + N` around the vault. Clear a wave and you get six seconds before
the next. Health regenerates only after five seconds without being touched, so a
bad wave carries into the next one.

A HUD marker points at whatever you need next — a diamond when it is on screen,
an arrow pinned to the screen edge when it is not, with the distance under it.
Die and the run resets to wave one with the cache back in the vault.

## How it fits together

| File | Responsibility |
| --- | --- |
| `VantageGameMode` | Waves, kills, death and restart; builds the map at `InitGame` |
| `DesertBuilder` | Ground, ruined towers, the vault, cover, sky, sun and fog |
| `VantageCharacter` | The gunslinger: body, walk cycle, aim, health, and the shot |
| `ObjectiveCache` | The thing in the vault, and noticing when you reach it |
| `CodeLock` | The four dial combination, and the state the HUD draws |
| `RobotDog` | Heel, hunt and bite, plus the quadruped gait |
| `Revolver` | Ammo, reload, recoil kick, muzzle flash, cylinder spin |
| `ZombieCharacter` | Chase steering, shambling gait, damage and collapse |
| `VantageHUD` | Crosshair, hit markers, health, ammo, banners — all Canvas |

Six decisions carry most of the weight.

### Input assets are built in C++

`AVantageCharacter::BuildInputBindings()` creates the `UInputMappingContext` and
every `UInputAction` with `NewObject` at `PostInitializeComponents`. Normally
these are `.uasset` files authored in the editor.

The fiddly part: a key press arrives on the **X** axis, so anything that reads as
forward/back needs a `UInputModifierSwizzleAxis` (`YXZ`) to move it to Y, then a
`UInputModifierNegate` if it points the wrong way. That is what `MapAxis`
encodes. Mouse look and stick look are separate actions because mouse deltas are
already frame-independent and stick deflection is not.

`Config/DefaultInput.ini` must set `DefaultPlayerInputClass` and
`DefaultInputComponentClass` to the Enhanced Input versions. **Without those two
lines nothing responds to the keyboard.** Both failure points log a distinct
error naming the setting to fix, backed by a watchdog after eight silent seconds.

### The map is spawned, not placed

`ADesertBuilder` scales `/Engine/BasicShapes` primitives into every tower, wall,
wreck and dune, colouring each with a dynamic material instance. A ruined tower
is a shaft, one dark inset panel per face standing in for a window grid, floor
bands, a broken crown of shrinking offset blocks, and a rubble skirt — about
twenty components, seeded from an `FRandomStream` so it varies but stays stable.

Sun, `SkyAtmosphere`, a real-time-capture `SkyLight` and height fog are all
**components on the builder actor** rather than placed actors, because light and
sky actors default to Stationary mobility and cannot be positioned at runtime
without complaint. Components let mobility be set before registration.

The build runs from `InitGame`, with `EnsureLevelBuilt()` idempotent and also
called from `ChoosePlayerStart` and `StartPlay`. `ChoosePlayerStart` is the one
that matters — the engine guarantees it runs before the pawn is spawned, so the
ground is down regardless of how the other hooks order themselves.

### Zombies steer directly, with no navmesh

Runtime navigation needs a bounds volume placed in a map, and there is no map to
place one in. So `AZombieCharacter::ChasePlayer` flattens the vector to the
player, normalises it and feeds `AddMovementInput`; the capsule slides along
whatever it walks into. On open sand this is both simpler and good enough.

The gait is one sine wave driving everything — body roll, bob, and legs and arms
swinging in opposition off the same phase. Death topples `BodyRoot` forward over
half a second and sinks the body into the sand. A real ragdoll would need a
physics asset, which needs a skeletal mesh, which is exactly the dependency this
project does without.

### Headshots need the capsule to get out of the way

The gun traces on `ECC_Visibility`. The zombie's capsule would swallow that
trace before it reached anything, so the capsule is set to **ignore** that
channel, and the body meshes are query-only blockers on it instead. The head
carries a component tag; `ResolveShot` checks
`Hit.Component->ComponentHasTag(AZombieCharacter::HeadTag)` to tell a head hit
from a body hit.

The shot traces from the **view point**, not the muzzle, because the round has to
go exactly where the crosshair is and the gun is held off to one side.

### He is geometry, animated from code

There is no skeletal mesh in this project, so the gunslinger is boxes: legs,
torso, coat, head, hair, and a beard in three pieces — jaw, tapering point and
moustache. The walk cycle is one sine wave with the legs opposed, the free arm
counter-swinging and a bob at twice the rate so both footfalls read; it blends in
and out with actual ground speed rather than with input.

His gun arm hangs off an `AimPivot` that takes the camera's pitch, so the arm,
the revolver and the flashlight all track where you are looking together. The
body faces the camera yaw (`bUseControllerRotationYaw`), which is the only way to
keep the gun pointing at the crosshair without an aim-offset animation blend.

### The HUD is Canvas, not UMG

`AVantageHUD::DrawHUD` draws everything with `DrawRect`/`DrawText`. The damage
vignette is five nested translucent borders, which at those alphas reads as a
gradient rather than the bands it actually is.

## Tuning

Most likely to want adjusting, in order:

- **Light and fog.** Sun intensity, fog density and inscattering colour are all
  in `DesertBuilder::BuildSky`. This is the hardest thing to get right without
  looking at it.
- **Camera framing.** `SpringArm` length and `SocketOffset` in the character
  constructor, currently 285 back and 68 to the right.
- **His proportions and beard.** The `AddBodyPart` calls in the character
  constructor — half extents in centimetres around a capsule centre.
- **Wave pressure.** `BaseWaveSize` and `IntermissionSeconds` on the game mode.
- **Zombie speed.** The `MaxWalkSpeed` range in `AZombieCharacter::Randomise`.
- **Lethality.** `BodyDamage` on the character, `TouchDamage` on the zombie.

## Troubleshooting

Everything logs with a `Vantage:` prefix. Filter the Output Log on that first.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Empty void | Map never built, or the level overrode the GameMode | Look for `Vantage: Level built` |
| Falling repeatedly | Ground failed to spawn | Logged every half second; check the `Cube.Cube` load |
| Nothing responds | Enhanced Input not wired | Log names the exact `DefaultInput.ini` setting |
| Everything grey | `"Color"` isn't the material's parameter name | Open `BasicShapeMaterial` and check |
| No towers, no gun | `/Engine/BasicShapes` meshes missing | Logged as a warning at startup |
| Zombies stand still | They only chase a live player | Check the player isn't already down |
| Cannot find the vault | It is due north at (0, 4600) | Follow the HUD arrow; the beacon marks the way back |
| Cache not picked up | Proximity is 170cm to the plinth | Walk into the glow rather than shooting it |

The gun sits centimetres from the near plane and will clip through geometry if
you press into a wall. Fixing that properly means a separate first-person render
pass, which is more machinery than a demo warrants.
