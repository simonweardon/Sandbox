// Infantry roles and the squads they come in.
//
// Every soldier carries an inventory the way they do in Men of War: a primary
// weapon with a finite number of magazines, grenades, and sometimes a single
// anti-tank launcher. When the magazines run out the rifle is a club, and the
// soldier has to be resupplied from a crate, a truck, or a corpse.

export const ROLES = {
  rifleman: { name: 'Rifleman', hp: 100, spot: 260, cost: 12 },
  smg:      { name: 'Submachine gunner', hp: 100, spot: 220, cost: 15 },
  lmg:      { name: 'Machine gunner', hp: 100, spot: 240, cost: 22, deploys: true, heavy: true },
  at:       { name: 'Anti-tank rifleman', hp: 100, spot: 240, cost: 25 },
  sniper:   { name: 'Sniper', hp: 100, spot: 420, cost: 40, scope: 4, stealth: 0.5 },
  engineer: { name: 'Engineer', hp: 100, spot: 240, cost: 20, builds: true, repairs: true },
  officer:  { name: 'Officer', hp: 100, spot: 300, cost: 30, moraleAura: 22 },
  medic:    { name: 'Medic', hp: 100, spot: 240, cost: 20, heals: true },
  crew:     { name: 'Vehicle crew', hp: 100, spot: 220, cost: 10, repairs: true },
};

/** A kit is what a soldier is actually carrying when they spawn. */
const kit = (primary, mags, grenades = 2, extra = {}) => ({ primary, mags, grenades, ...extra });

export const KITS = {
  ger: {
    rifleman: kit('kar98k', 12, 2),
    smg:      kit('mp40', 6, 3),
    lmg:      kit('mg42', 5, 1),
    at:       kit('kar98k', 8, 1, { launcher: 'panzerfaust60', rockets: 2 }),
    sniper:   kit('kar98k', 10, 1, { scoped: true }),
    engineer: kit('mp40', 5, 2, { mines: 2, repairKit: true }),
    officer:  kit('mp40', 6, 2, { binoculars: true }),
    medic:    kit('kar98k', 5, 0, { bandages: 6 }),
    crew:     kit('mp40', 3, 1, { repairKit: true }),
    assault:  kit('stg44', 7, 3),
  },
  sov: {
    rifleman: kit('mosin', 12, 2),
    smg:      kit('ppsh41', 5, 3),
    lmg:      kit('dp28', 5, 1),
    at:       kit('mosin', 8, 1, { launcher: 'ptrs41', rockets: 20 }),
    sniper:   kit('mosin', 10, 1, { scoped: true }),
    engineer: kit('ppsh41', 4, 2, { mines: 2, repairKit: true }),
    officer:  kit('ppsh41', 5, 2, { binoculars: true }),
    medic:    kit('mosin', 5, 0, { bandages: 6 }),
    crew:     kit('ppsh41', 3, 1, { repairKit: true }),
    assault:  kit('svt40', 8, 3),
  },
  usa: {
    rifleman: kit('garand', 12, 2),
    smg:      kit('thompson', 6, 3),
    lmg:      kit('bar', 8, 1),
    at:       kit('garand', 8, 1, { launcher: 'bazooka', rockets: 5 }),
    sniper:   kit('garand', 10, 1, { scoped: true }),
    engineer: kit('thompson', 5, 2, { mines: 2, repairKit: true }),
    officer:  kit('thompson', 6, 2, { binoculars: true }),
    medic:    kit('garand', 4, 0, { bandages: 8 }),
    crew:     kit('thompson', 3, 1, { repairKit: true }),
    assault:  kit('garand', 10, 3),
  },
};

/** Squad templates: the mix of roles that gets called in as one unit. */
export const SQUADS = {
  ger_grenadier: {
    name: 'Grenadier Squad', faction: 'ger', cost: 110,
    members: ['officer', 'lmg', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'smg'],
  },
  ger_assault: {
    name: 'Sturm Squad', faction: 'ger', cost: 150,
    members: ['officer', 'assault', 'assault', 'assault', 'smg', 'lmg'],
  },
  ger_at: {
    name: 'Panzerjäger Team', faction: 'ger', cost: 90,
    members: ['at', 'at', 'rifleman'],
  },
  ger_engineer: {
    name: 'Pionier Squad', faction: 'ger', cost: 100,
    members: ['engineer', 'engineer', 'engineer', 'smg'],
  },
  ger_sniper: { name: 'Sniper Team', faction: 'ger', cost: 70, members: ['sniper', 'rifleman'] },

  sov_rifle: {
    name: 'Rifle Squad', faction: 'sov', cost: 100,
    members: ['officer', 'lmg', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'smg'],
  },
  sov_smg: {
    name: 'SMG Squad', faction: 'sov', cost: 140,
    members: ['officer', 'smg', 'smg', 'smg', 'smg', 'smg', 'lmg'],
  },
  sov_at: { name: 'PTR Team', faction: 'sov', cost: 80, members: ['at', 'at', 'rifleman'] },
  sov_engineer: { name: 'Sapper Squad', faction: 'sov', cost: 95, members: ['engineer', 'engineer', 'engineer', 'smg'] },
  sov_sniper: { name: 'Sniper Team', faction: 'sov', cost: 70, members: ['sniper', 'rifleman'] },

  usa_rifle: {
    name: 'Rifle Squad', faction: 'usa', cost: 115,
    members: ['officer', 'lmg', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'smg'],
  },
  usa_at: { name: 'Bazooka Team', faction: 'usa', cost: 95, members: ['at', 'at', 'rifleman'] },
  usa_engineer: { name: 'Combat Engineers', faction: 'usa', cost: 105, members: ['engineer', 'engineer', 'engineer', 'smg'] },
  usa_sniper: { name: 'Sniper Team', faction: 'usa', cost: 70, members: ['sniper', 'rifleman'] },
};
