# Ashgrove Manor

A small top-down pixel game in the style of the Game Boy Pokémon titles, in
three acts. You are a little white rabbit in a red pinafore. Something came
into your room while you were asleep and took your doll.

No build step, no dependencies — open `index.html` in a browser.

## Controls

| Action | Keys |
| --- | --- |
| Walk | Arrow keys or WASD |
| Run | Hold Shift |
| Look, talk, confirm, and flash the lantern | Z, Space or Enter |

On a touch device an on-screen D-pad and A/B buttons appear instead.

## The three acts

**Act One — a shadow gets in.** You are asleep. The wolf takes BUTTON out of
your room without opening the door. You chase him down the long landing, and
he turns around, and that is as far as your nerve goes.

**Act Two — Ashgrove Manor.** You wake in a house that is not yours, with two
dead servants who are pleased to see anybody at all. Each has a job for you,
and each job opens a room:

- **MOPSY** wants the five pieces of BUTTON the wolf shook loose as he ran.
  Bring them and she opens the **coal cellar** — a crate-pushing puzzle. Shove
  all three crates onto the floor sigils and you get the lantern. (Wedge one
  in a corner and simply step outside; the room resets.)
- **DUSTY** wants the four candles the wolf snuffed relit. Do it and he unties
  the **attic** stair, where four chimes must be rung in the order of the
  rhyme. Wrong note and it starts again. Get it right for the moon-glass lens.

Lantern plus lens makes a working flashlight, and the dark stair at the head
of the hall stops being a dead end.

**Act Three — the dark below.** He circles you in the black, and all you can
see are his eyes. Face him and press Z to flash the lantern down the cone of
its beam. Catch him in it three times. He gets faster each time you do, and if
he reaches you first you lose your nerve — three of those and you start the
fight over.

## How it's put together

Everything renders to a 240x160 canvas — the GBA resolution — which is then
scaled up by a whole number. That is what keeps the pixels square and crisp
instead of blurry.

| File | Contents |
| --- | --- |
| `js/pixel.js` | The rabbit, the ghosts and the wolf, baked into sprite sheets |
| `js/tiles.js` | The 16x16 tiles and props, drawn procedurally |
| `js/maps.js` | All six rooms, plus the ghosts, tasks, puzzles and portals |
| `js/scenes.js` | The scripted cutscenes for Acts 1 and 3 |
| `js/game.js` | Input, movement, lighting, the puzzles, the boss and the loop |
| `server.js` | A dependency-free static server, for deploying it |

### Modes

The loop runs in one of three modes. **play** gives you control; **cutscene**
hands it to a script; **boss** is Act 3, which is `play` plus the duel. Only
one of them reads the keyboard at a time, which is what stops you wandering off
mid-conversation.

### Cutscenes

A cutscene is a list of steps, each of which knows when it is finished:

```js
{ say: [...] }                    // waits for the player to read it
{ walk: wolf, path: [[8, 7]] }    // waits until he gets there
{ card: ['ACT ONE'], seconds: 3 } // waits out the title card
{ do: () => { ... } }             // changes the world, then continues
```

`updateCutscene()` advances the index when the current step reports done, so
scripts read top to bottom with no timers to keep in sync by hand.

### The darkness

The lighting is one extra canvas. Each frame it's filled with near-black, then
soft radial holes are punched out of it with `destination-out` — one for the
rabbit, one for every candle and window on screen — and the result is laid over
the finished scene. Candles get a sine wobble so they gutter; moonlight
doesn't. The flashlight is the same trick with a cone instead of a circle, and
the hit test is a dot product against the same cone, so what you see is exactly
what you hit.

### Editing the art

Characters are written as rows of palette keys, so you can redraw them in place:

```js
'..KWKDDDDDKWK...'   // '.' is transparent; every other letter is a palette entry
```

A body is 13 rows, and the bottom three come from a leg set — one body serves
the whole walk cycle. Row lengths are validated at load, so a mistyped row
throws instead of quietly drawing a corrupted sprite. The two ghosts and the
wolf are the same machinery with different palettes.

### Editing the rooms

Every map in `js/maps.js` is an array of strings, one character per tile:

```
.  floorboards   r  carpet      d  doorway    w  cobwebs
#  wall          B  bookshelf   P  portrait   T  table
c  candelabra    u  snuffed candelabra        W  window
s  staircase     C  toy chest   D  front door b  bed
O  floor sigil   1  cellar hatch  2  attic stair  3  the dark stair
0  way back
```

Add a character to `SOLID` to make it block movement, to `LIGHTS` to make it
glow, and to `tileImage()` in `js/game.js` to give it a look. `PORTALS` says
where the numbered tiles lead and which flag unlocks them; `GHOSTS` holds each
ghost's lines for every state of their task.

Two tiles are drawn edge-aware rather than as self-contained squares: carpet
gets its gold border only where it meets bare floor, and cobwebs are anchored
in one corner so neighbouring tiles knit together.
