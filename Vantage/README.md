# Vantage

A first-person exploration demo for Unreal Engine 5.4/5.5, written entirely in
C++. Find three resonance shards, unseal a blast door, take the vault core.

The unusual thing about it: **the project contains no content assets.** No
`.umap`, no Blueprints, no meshes, no materials, no UMG widgets, no Enhanced
Input assets. Every wall, light, input binding and HUD element is constructed in
C++ at runtime. Clone, generate project files, build, press Play.

> **Untested build.** This was written without an engine to compile against, so
> treat the first build as a shakedown rather than a guarantee. See
> [If it doesn't compile](#if-it-doesnt-compile) — the likely failures are
> narrow and listed there.

## Running it

1. Install UE 5.4 or 5.5 and a C++ toolchain (Visual Studio 2022 with the
   "Game development with C++" workload on Windows; Xcode on macOS).
2. Right-click `Vantage.uproject` → **Generate Visual Studio project files**.
   On macOS/Linux, run `<EngineDir>/Build/BatchFiles/Mac/GenerateProjectFiles.sh`
   (or the `Linux/` equivalent) against the `.uproject`.
3. Open the generated solution, build the **Development Editor** configuration
   for the `Vantage` target.
4. Launch the editor and press Play. The startup map is `/Engine/Maps/Entry`,
   which is empty on purpose.

You can also double-click `Vantage.uproject` — the editor offers to rebuild the
module for you — but the first build is quicker and easier to read from the IDE.

## Controls

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Move | WASD or arrows | Left stick |
| Look | Mouse | Right stick |
| Sprint | Hold Shift | Left stick click |
| Crouch | Ctrl or C | B |
| Jump | Space | A |
| Flashlight | F | Y |
| Interact | E | X |

## The demo loop

You start at the west end of a dark atrium. Two shards sit on plinths in the
open; the third is tucked against the wall partway down the corridor east. With
all three, the blast door at the end of the corridor can be unsealed, which
opens onto the vault. The terminal on the dais at the far end ends the demo.

The lit trim running along the base of every wall is deliberate level design,
not decoration — with the flashlight off it is the only thing that reads, and it
always points toward the next space.

## How it fits together

| File | Responsibility |
| --- | --- |
| `VantageGameMode` | Objective state, and building the level at `InitGame` |
| `FacilityBuilder` | Assembles all geometry and lighting from primitive cubes |
| `VantageCharacter` | First-person pawn; builds its own Enhanced Input assets |
| `InteractionProbe` | Per-frame view trace that decides what is under the crosshair |
| `Interactable` | The interface everything interactive implements |
| `ShardPickup` / `SlidingDoor` / `VaultTerminal` | The three interactive things |
| `VantageHUD` | Crosshair, prompt, objective, banner — all Canvas draws |

Three decisions carry most of the weight, and each one is a tradeoff worth
knowing about before you extend this.

### Input assets are built in C++

`AVantageCharacter::BuildInputBindings()` creates the `UInputMappingContext` and
every `UInputAction` with `NewObject` at `PostInitializeComponents`, then binds
them in `SetupPlayerInputComponent`. Normally these are `.uasset` files you
author in the editor.

The fiddly part is that a key press arrives on the **X** axis, so anything that
should read as forward/back needs a `UInputModifierSwizzleAxis` (`YXZ`) to move
it to Y, then a `UInputModifierNegate` if it points the wrong way. That is what
the `MapAxis` lambda encodes.

Mouse look and stick look are separate actions on purpose: mouse deltas are
already frame-independent, stick deflection is not, so `LookRate` scales by
delta time and `Look` does not. Merging them makes gamepad look framerate-
dependent.

`Config/DefaultInput.ini` sets `DefaultPlayerInputClass` and
`DefaultInputComponentClass` to the Enhanced Input versions. **Without those two
lines nothing responds to the keyboard** — the pawn gets a plain
`UInputComponent` and the cast fails. The character logs an error if that
happens.

### The level is spawned, not placed

`AFacilityBuilder` scales `/Engine/BasicShapes/Cube` into every wall, floor,
crate and plinth, colouring each with a dynamic material instance. Coordinates
are in centimetres, floor surface at `Z = 0`, player entering from the west.

It runs from `AVantageGameMode::InitGame` rather than `BeginPlay` because the
engine spawns the player pawn *between* `InitGame` and the world's `BeginPlay`.
Build any later and the player is dropped into a world with no floor.

Every spawned component sets `Movable` mobility **before** `RegisterComponent()`.
Setting it after registration trips the "static component moved" warning, and
nothing here can be baked anyway.

### The HUD is Canvas, not UMG

`AVantageHUD::DrawHUD` draws the crosshair, interaction prompt, objective line
and shard pips with `DrawRect`/`DrawText`. Fonts come from `GEngine`. It costs
some polish versus UMG and buys zero asset dependencies.

## If it doesn't compile

The code is written against the 5.4 API, but it has never been through a
compiler. If something fails, these are the places to look first:

- **`SetCrouchedHalfHeight`** — a setter only since 5.1. On older 5.x, assign
  `CrouchedHalfHeight` directly.
- **`ELightUnits` / `IntensityUnits`** — lives on `ULocalLightComponent`. If it
  won't resolve, add `#include "Components/LocalLightComponent.h"`.
- **`EKeys::Gamepad_LeftX`** and friends — stable for many versions, but if a
  key constant is missing, delete that one `MapAxis` line; nothing else depends
  on it.
- **`"Color"` material parameter** — the vector parameter on
  `/Engine/BasicShapes/BasicShapeMaterial`. If everything renders grey, that
  parameter name is wrong for your engine version; open the material and check.
  Setting a parameter that doesn't exist fails silently, which is exactly what
  grey geometry looks like.

## Tuning

Light intensity is the thing most likely to want adjusting, and the hardest to
get right without looking at it. All the point lights use
`ELightUnits::Unitless` with values in the 2,000–14,000 range, set in the
`AddLight` calls in `FacilityBuilder.cpp`; the flashlight is 60,000 in
`VantageCharacter`'s constructor. If the facility reads too dark or too flat,
start there.

Other quick knobs:

- Shard count: `ShardsRequired` on `AVantageGameMode`.
- Move speed, sprint, sensitivity: `EditDefaultsOnly` properties on
  `AVantageCharacter`.
- Interaction range: `Reach` on `UInteractionProbe`, default 340cm.
- Door timing: `OpenSeconds` and `OpenDistance` on `ASlidingDoor`.

## Extending it

Adding an interactive object means subclassing `AActor`, inheriting
`IInteractable`, and overriding `GetInteractionPrompt` / `CanInteract` /
`Interact`. `UInteractionProbe` picks it up with no registration step — it
casts whatever the view trace hits. Note that the object needs collision that
blocks the `Visibility` channel to be focusable at all; `AShardPickup` shows the
query-only setup for something you want to look at but not bump into.

The obvious next steps, roughly in order of payoff: a footstep and ambience pass
(the space is silent, which is what most undersells it), a first-person arm mesh
once you have a rig, and moving the layout in `FacilityBuilder` out to a data
table so it can be edited without a rebuild.
