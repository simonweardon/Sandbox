# Pixel Route 1

A small top-down pixel game in the style of the Game Boy Pokémon titles: you
walk a sprite around a tile map, tramp through tall grass, and talk to people.
No build step, no dependencies — open `index.html` in a browser.

## Controls

| Action | Keys |
| --- | --- |
| Walk | Arrow keys or WASD |
| Run | Hold Shift |
| Talk / confirm | Z, Space or Enter |

On a touch device an on-screen D-pad and A/B buttons appear instead.

## What's in it

- **Grid movement.** You step tile to tile rather than sliding freely. Tapping a
  new direction pivots you on the spot first, exactly like the originals.
- **Sprite animation.** Four facings with a two-frame walk cycle, alternating
  each step.
- **Tall grass.** Its blades are drawn over your legs so you wade through it,
  and there's a chance of a wild encounter on every step.
- **Signs, doors and NPCs.** Face one and press Z. NPCs turn to look at you.
- **A scrolling camera** that follows you and stops at the edges of the map.

## How it's put together

Everything renders to a 240x160 canvas — the GBA resolution — which is then
scaled up by a whole number. That is what keeps the pixels square and crisp
instead of blurry.

| File | Contents |
| --- | --- |
| `js/pixel.js` | Character art and the code that bakes it into sprites |
| `js/tiles.js` | The 16x16 terrain tiles, drawn procedurally |
| `js/world.js` | The map, its collision rules, and the interactive entities |
| `js/game.js` | Input, movement, camera, rendering and the game loop |

### Editing the art

Characters are written as rows of palette keys, so you can redraw them in place:

```js
'..KSKBBBBBKSK...'   // '.' is transparent; every other letter is a palette entry
```

A body is 13 rows, and the bottom three rows come from a leg set — one body
serves the whole walk cycle. `buildCharacter()` bakes a full sheet (four
facings x three poses) from a palette, which is how the NPC is the same art in
different colours. Row lengths are validated at load, so a mistyped row throws
an error instead of quietly drawing a corrupted sprite.

### Editing the map

`MAP` in `js/world.js` is just an array of strings, one character per tile:

```
.  grass      ,  tall grass   -  path     *  flowers
#  tree       ~  water        o  rock     f  fence
=  signpost   R  roof         w  wall     W  window    D  door
```

Add a tile character to `SOLID` to make it block movement, and to `tileImage()`
in `js/game.js` to give it a look. Signs, doors and NPCs live in `ENTITIES`
alongside the lines they say.
