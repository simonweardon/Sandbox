# Ashgrove Manor

A small top-down pixel game in the style of the Game Boy Pokémon titles. You
are a little white rabbit in a red pinafore, alone in a dark house that has
taken your doll apart and hidden the pieces in its rooms. Find all five, then
put BUTTON back together in the nursery chest.

No build step, no dependencies — open `index.html` in a browser.

## Controls

| Action | Keys |
| --- | --- |
| Walk | Arrow keys or WASD |
| Run | Hold Shift |
| Look / talk / confirm | Z, Space or Enter |

On a touch device an on-screen D-pad and A/B buttons appear instead.

## What's in it

- **Grid movement.** You step tile to tile rather than sliding freely. Tapping a
  new direction pivots you on the spot first, exactly like the originals.
- **Sprite animation.** Four facings with a two-frame walk cycle, alternating
  each step.
- **Candlelight.** The manor is dark. A pool of light travels with you, candles
  gutter where they stand, and the moon comes through the windows. Finish the
  doll and the house eases up.
- **Five doll pieces**, one to a room — head, arm, leg, body and ribbon. Walk
  over one to pick it up; the counter is always on screen.
- **Ghosts** who turn to look at you and tell you roughly where to search, plus
  furniture worth pressing Z at.
- **Cobwebs** you wade through, with the occasional cold shiver.

## How it's put together

Everything renders to a 240x160 canvas — the GBA resolution — which is then
scaled up by a whole number. That is what keeps the pixels square and crisp
instead of blurry.

| File | Contents |
| --- | --- |
| `js/pixel.js` | The rabbit and the ghosts, and the code that bakes them into sprites |
| `js/tiles.js` | The 16x16 mansion tiles and doll pieces, drawn procedurally |
| `js/world.js` | The floor plan, collision rules, ghosts and where the pieces lie |
| `js/game.js` | Input, movement, camera, the darkness pass and the game loop |
| `server.js` | A dependency-free static server, for deploying it |

### The darkness

The lighting is one extra canvas. Each frame it's filled with near-black, then
soft radial holes are punched out of it with `destination-out` — one that
follows the rabbit, one for every candle and window on screen — and the result
is laid over the finished scene. Candles get a small sine wobble on their
radius so they flicker; moonlight doesn't.

### Editing the art

Characters are written as rows of palette keys, so you can redraw them in place:

```js
'..KWKDDDDDKWK...'   // '.' is transparent; every other letter is a palette entry
```

A body is 13 rows, and the bottom three rows come from a leg set — one body
serves the whole walk cycle. `buildCharacter()` bakes a full sheet (four
facings x three poses) from a palette. Row lengths are validated at load, so a
mistyped row throws an error instead of quietly drawing a corrupted sprite.

### Editing the mansion

`MAP` in `js/world.js` is an array of strings, one character per tile:

```
.  floorboards   r  carpet      d  doorway    w  cobwebs
#  wall          B  bookshelf   P  portrait   T  table
c  candelabra    W  window      s  staircase  C  toy chest
D  front door
```

Add a character to `SOLID` to make it block movement, to `LIGHTS` to make it
glow, and to `tileImage()` in `js/game.js` to give it a look. Ghosts and the
chest live in `ENTITIES`; the doll pieces and their pickup lines live in
`PIECES`; the one-liners for furniture live in `TILE_TALK`.

Two tiles are drawn edge-aware rather than as self-contained squares: carpet
gets its gold border only where it meets bare floor, and cobwebs are anchored
in one corner so neighbouring tiles knit together. Both are handled at render
time in `js/game.js`.
