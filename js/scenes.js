/*
 * scenes.js — the scripted bits.
 *
 * Each entry is a function returning a list of steps, run by updateCutscene()
 * in game.js. A step is one of:
 *
 *   { say: [lines] }                    wait for the player to read it
 *   { walk: actor, path: [[x,y]...] }   walk there, then continue
 *   { face: actor, dir: 'left' }        turn on the spot
 *   { card: [lines], seconds: 3 }       full-screen act title
 *   { wait: 0.6 }                       pause
 *   { do: () => {} }                    change the world
 *   { shake: 0.5 } / { fade: 1 }        effects
 *
 * They're functions rather than plain arrays because the actors and flags they
 * refer to have to be read when the scene runs, not when the file loads.
 */

const CUTSCENES = {
  /* --- Act 1 ------------------------------------------------------------- */
  intro: () => [
    { do: () => {
      G.map = 'nursery';
      G.sleeping = true;
      G.dollOnFloor = true;
      G.fade = 1;
      player.x = player.fromX = 3;
      player.y = player.fromY = 5;
      wolf.visible = false;
    } },
    { fade: 0 },
    { card: ['ACT ONE', 'A SHADOW GETS IN'], seconds: 3 },
    { say: ['Late, and the house is quiet.',
      'BUTTON is on the floor by your bed,',
      'where she always is.'] },
    { do: () => {
      wolf.visible = true;
      wolf.x = wolf.fromX = 17;
      wolf.y = wolf.fromY = 7;
      wolf.facing = 'left';
    } },
    { say: ['Something comes in without', 'opening the door.'] },
    { walk: wolf, path: [[8, 7]], speed: 0.26 },
    { face: wolf, dir: 'up' },
    { wait: 0.5 },
    { walk: wolf, path: [[8, 6]], speed: 0.26 },
    { shake: 0.4 },
    { do: () => { G.dollOnFloor = false; } },
    { say: ['It takes BUTTON up in its teeth', 'without a sound.'] },
    { walk: wolf, path: [[8, 7], [17, 7]], speed: 0.13 },
    { do: () => { wolf.visible = false; } },
    { wait: 0.4 },
    { do: () => { G.sleeping = false; player.facing = 'right'; } },
    { say: ['You wake with your ears already up.', 'BUTTON is gone.'] },
    { fade: 1 },
    { do: () => {
      enterMap('chase', 3, 5, 'right');
      wolf.visible = true;
      wolf.x = wolf.fromX = 10;
      wolf.y = wolf.fromY = 5;
      wolf.facing = 'right';
      wolf.path = [];
    } },
    { fade: 0 },
    { say: ['There! At the end of the landing.', 'GO.'] },
  ],

  /* The chase ends the only way it can, the first time: in a fight you
     cannot win, whatever you pick from the menu. */
  scared: () => [
    { do: () => { wolf.path = []; wolf.facing = 'left'; } },
    { wait: 0.4 },
    { say: ['He stops. He turns around.'] },
    { do: () => startBattle('first', () => playCutscene(CUTSCENES.afterFirst)) },
  ],

  afterFirst: () => [
    { do: () => {
      wolf.visible = false;
      G.fade = 1;
      enterMap('manor', 19, 27, 'up');
      G.act = 2;
    } },
    { card: ['ACT TWO', 'ASHGROVE MANOR'], seconds: 3 },
    { fade: 0 },
    { say: ['You come to at the foot of the',
      'stairs, in a house that is not yours.',
      'Somewhere below, something is',
      'holding on to your doll.'] },
    { say: ['Find help. Find a way down.', 'Find a light.'] },
  ],

  lairEntry: () => [
    { say: ['The stair goes down a long way.',
      'At the bottom of it, something', 'is waiting for you.'] },
    { do: () => startFinalBattle() },
  ],

  /* --- Act 3 -------------------------------------------------------------- */
  victory: () => [
    { do: () => { G.shake = 0.5; } },
    { say: ['He puts BUTTON down in front of you',
      'very carefully, and will not look up.'] },
    { say: ['"She was warm," he says.',
      '"Nothing in this house has been', 'warm for a long time."'] },
    { say: ['You tell him he can visit.',
      'You are not certain you mean it yet.'] },
    { fade: 1 },
    { do: () => {
      enterMap('nursery', 6, 8, 'down');
      G.dollOnFloor = false;
      G.banner = 0;
    } },
    { fade: 0 },
    { say: ['You put her back in the toy chest,',
      'because that is where she lives.',
      'The house goes quiet — properly',
      'quiet, this time.'] },
    { card: ['THE END', 'thank you for playing'], seconds: 6 },
    { do: () => { G.mode = 'play'; } },
  ],
};
