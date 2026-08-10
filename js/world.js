/*
 * world.js — the map itself.
 *
 * One character per tile:
 *   .  grass          ,  tall grass     -  path        *  flowers
 *   #  tree           ~  water          o  rock        f  fence
 *   =  signpost       R  roof           w  wall        W  window
 *   D  door
 */

const MAP = [
  '########################################',
  '#......................................#',
  '#..,,,,,,,,,..............**...........#',
  '#..,,,,,,,,,.............RRRRRR........#',
  '#..,,,,,,,,,.............RRRRRR........#',
  '#..,,,,,,,,,.............WwwDwW........#',
  '#...........................-..........#',
  '#.....=.....................-..........#',
  '#...........................-..........#',
  '#....------------------------..........#',
  '#....-.................................#',
  '#....-............~~~~~~~~~~~~.........#',
  '#....-...........~~~~~~~~~~~~~~........#',
  '#....-...........~~~~~~~~~~~~~~........#',
  '#....-............~~~~~~~~~~~~.........#',
  '#....-.............~~~~~~~~~...........#',
  '#....-.................................#',
  '#....--------------------..............#',
  '#.......................-..............#',
  '#oo.....................-..............#',
  '#.......................-..............#',
  '#...ffffffffff..........-..............#',
  '#...f,,,,,,,,f..........-..............#',
  '#...f,,,,,,,,f..........-..............#',
  '#...f,,,,,,,,f..........-..............#',
  '#...ffff..ffff..........-..............#',
  '#..............***......-..............#',
  '#.......................-..............#',
  '#......................................#',
  '########################################',
];

const MAP_W = MAP[0].length;
const MAP_H = MAP.length;

MAP.forEach((row, y) => {
  if (row.length !== MAP_W) {
    throw new Error(`map row ${y} is ${row.length} tiles wide, expected ${MAP_W}`);
  }
});

/* Anything not listed here is walkable open ground. */
const SOLID = new Set(['#', '~', 'o', 'f', '=', 'R', 'w', 'W', 'D']);

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#';
  return MAP[y][x];
}

function isWalkable(x, y) {
  return !SOLID.has(tileAt(x, y));
}

/* Things you can face and press A at. Signs and the door are solid tiles;
   the NPC is a walking body that also blocks its own square. */
const ENTITIES = [
  {
    x: 6, y: 7, kind: 'sign',
    lines: ['ROUTE 1 — the tall grass is', 'crawling with wild PIXELMON.'],
  },
  {
    x: 28, y: 5, kind: 'door',
    lines: ["It's locked. Whoever lives here", 'is out catching PIXELMON.'],
  },
  {
    x: 12, y: 10, kind: 'npc', facing: 'down',
    lines: [
      'Hey! Hold SHIFT and you can run.',
      'Beats walking every step of',
      'this route, believe me.',
    ],
  },
  {
    x: 8, y: 23, kind: 'npc', facing: 'left',
    lines: ['This patch is fenced off so the', 'wild ones stay put. Mostly.'],
  },
];

function entityAt(x, y) {
  return ENTITIES.find((e) => e.x === x && e.y === y) || null;
}

const PLAYER_START = { x: 5, y: 10, facing: 'down' };
