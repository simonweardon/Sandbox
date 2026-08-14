# Vantage

A first-person desert survival demo for Unreal Engine 5, written entirely in
C++. You stand in the sand among the ruins of a dead city with a six shooter,
and the dead walk in out of the haze in waves.

The unusual thing about it: **the project contains no content assets.** No
`.umap`, no Blueprints, no meshes, no materials, no UMG widgets, no Enhanced
Input assets, no animations. The desert, the towers, the revolver, the zombies
and the HUD are all constructed in C++ at runtime from the primitive shapes that
ship with the engine. Clone, build, press Play.

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

Waves arrive on a timer with a countdown. Wave *N* fields `4 + (N-1)*2` zombies
that spawn on a ring out in the haze and walk straight at you. Clear a wave and
you get six seconds before the next. Health regenerates only after five seconds
without being touched, so a bad wave carries into the next one. Death rolls the
run back to wave one after a four second pause.

## How it fits together

| File | Responsibility |
| --- | --- |
| `VantageGameMode` | Waves, kills, death and restart; builds the map at `InitGame` |
| `DesertBuilder` | Ground, ruined towers, cover, sky, sun and fog |
| `VantageCharacter` | First-person pawn, health, and resolving the shot |
| `Revolver` | Ammo, reload, recoil kick, muzzle flash, cylinder spin |
| `ZombieCharacter` | Chase steering, shambling gait, damage and collapse |
| `VantageHUD` | Crosshair, hit markers, health, ammo, banners — all Canvas |

Five decisions carry most of the weight.

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

### The HUD is Canvas, not UMG

`AVantageHUD::DrawHUD` draws everything with `DrawRect`/`DrawText`. The damage
vignette is five nested translucent borders, which at those alphas reads as a
gradient rather than the bands it actually is.

## Tuning

Most likely to want adjusting, in order:

- **Light and fog.** Sun intensity, fog density and inscattering colour are all
  in `DesertBuilder::BuildSky`. This is the hardest thing to get right without
  looking at it.
- **Gun placement in view.** `SetActorRelativeLocation` in
  `AVantageCharacter::BeginPlay`, currently `(27, 11, -11.5)`.
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

The gun sits centimetres from the near plane and will clip through geometry if
you press into a wall. Fixing that properly means a separate first-person render
pass, which is more machinery than a demo warrants.
