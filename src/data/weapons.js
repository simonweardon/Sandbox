// Weapon table. Figures are the historical ones rounded to something usable:
// muzzle velocity in m/s, penetration in mm of rolled homogeneous armour struck
// at 0 degrees, measured at 100 m, decaying with range.
//
//   pen100 / penDecay  — mm at 100 m, and mm lost per additional 100 m
//   disp               — 1-sigma dispersion in milliradians (spread at range)
//   he                 — kg of TNT-equivalent filler; 0 means a solid shot
//   damage             — damage to a 100 hp soldier from a direct hit
//
// Shell types: 'ap' solid/capped shot, 'heat' shaped charge (no range decay),
// 'he' high explosive, 'bullet' small arms.

export const SHELL = { AP: 'ap', HEAT: 'heat', HE: 'he', BULLET: 'bullet' };

export const WEAPONS = {
  // ---- Small arms -------------------------------------------------------
  kar98k: {
    name: 'Kar 98k', cls: 'rifle', shell: SHELL.BULLET, caliber: 7.92,
    velocity: 760, rof: 25, mag: 5, reload: 4.2, disp: 3.2, aimTime: 0.9,
    damage: 62, pen100: 12, penDecay: 1.4, he: 0, range: 500, tracerEvery: 0,
  },
  mosin: {
    name: 'Mosin M91/30', cls: 'rifle', shell: SHELL.BULLET, caliber: 7.62,
    velocity: 800, rof: 22, mag: 5, reload: 4.6, disp: 3.4, aimTime: 0.9,
    damage: 63, pen100: 12, penDecay: 1.4, he: 0, range: 500, tracerEvery: 0,
  },
  garand: {
    name: 'M1 Garand', cls: 'rifle', shell: SHELL.BULLET, caliber: 7.62,
    velocity: 853, rof: 45, mag: 8, reload: 3.0, disp: 3.6, aimTime: 0.7,
    damage: 60, pen100: 13, penDecay: 1.4, he: 0, range: 480, tracerEvery: 0,
  },
  svt40: {
    name: 'SVT-40', cls: 'rifle', shell: SHELL.BULLET, caliber: 7.62,
    velocity: 830, rof: 45, mag: 10, reload: 3.2, disp: 4.0, aimTime: 0.7,
    damage: 58, pen100: 12, penDecay: 1.4, he: 0, range: 460, tracerEvery: 0,
  },
  stg44: {
    name: 'StG 44', cls: 'rifle', shell: SHELL.BULLET, caliber: 7.92,
    velocity: 685, rof: 550, mag: 30, reload: 3.4, disp: 6.5, aimTime: 0.5,
    damage: 48, pen100: 8, penDecay: 1.2, he: 0, range: 340, burst: 4,
  },
  mp40: {
    name: 'MP 40', cls: 'smg', shell: SHELL.BULLET, caliber: 9,
    velocity: 380, rof: 500, mag: 32, reload: 3.2, disp: 9.0, aimTime: 0.35,
    damage: 38, pen100: 3, penDecay: 0.8, he: 0, range: 180, burst: 5,
  },
  ppsh41: {
    name: 'PPSh-41', cls: 'smg', shell: SHELL.BULLET, caliber: 7.62,
    velocity: 490, rof: 900, mag: 71, reload: 4.4, disp: 10.5, aimTime: 0.3,
    damage: 34, pen100: 4, penDecay: 0.8, he: 0, range: 190, burst: 7,
  },
  thompson: {
    name: 'M1A1 Thompson', cls: 'smg', shell: SHELL.BULLET, caliber: 11.4,
    velocity: 285, rof: 700, mag: 30, reload: 3.0, disp: 9.5, aimTime: 0.3,
    damage: 44, pen100: 2, penDecay: 0.6, he: 0, range: 160, burst: 5,
  },
  bar: {
    name: 'M1918 BAR', cls: 'lmg', shell: SHELL.BULLET, caliber: 7.62,
    velocity: 860, rof: 500, mag: 20, reload: 3.4, disp: 5.5, aimTime: 0.8,
    damage: 58, pen100: 13, penDecay: 1.4, he: 0, range: 500, burst: 5, tracerEvery: 5,
  },
  dp28: {
    name: 'DP-28', cls: 'lmg', shell: SHELL.BULLET, caliber: 7.62,
    velocity: 840, rof: 550, mag: 47, reload: 5.0, disp: 5.8, aimTime: 1.1,
    damage: 57, pen100: 13, penDecay: 1.4, he: 0, range: 550, burst: 6, tracerEvery: 5,
  },
  mg34: {
    name: 'MG 34', cls: 'lmg', shell: SHELL.BULLET, caliber: 7.92,
    velocity: 765, rof: 850, mag: 50, reload: 5.5, disp: 5.2, aimTime: 1.0,
    damage: 56, pen100: 13, penDecay: 1.4, he: 0, range: 600, burst: 8, tracerEvery: 4,
  },
  mg42: {
    name: 'MG 42', cls: 'lmg', shell: SHELL.BULLET, caliber: 7.92,
    velocity: 755, rof: 1200, mag: 50, reload: 5.0, disp: 6.0, aimTime: 1.0,
    damage: 56, pen100: 13, penDecay: 1.4, he: 0, range: 600, burst: 10, tracerEvery: 4,
  },
  m2hb: {
    name: 'M2HB .50 cal', cls: 'hmg', shell: SHELL.BULLET, caliber: 12.7,
    velocity: 890, rof: 550, mag: 100, reload: 6.0, disp: 4.5, aimTime: 1.2,
    damage: 95, pen100: 22, penDecay: 2.0, he: 0, range: 900, burst: 6, tracerEvery: 3,
  },
  dshk: {
    name: 'DShK 12.7mm', cls: 'hmg', shell: SHELL.BULLET, caliber: 12.7,
    velocity: 850, rof: 600, mag: 50, reload: 6.5, disp: 4.8, aimTime: 1.2,
    damage: 92, pen100: 20, penDecay: 2.0, he: 0, range: 900, burst: 6, tracerEvery: 3,
  },

  // ---- Man-portable anti-tank ------------------------------------------
  panzerfaust60: {
    name: 'Panzerfaust 60', cls: 'at', shell: SHELL.HEAT, caliber: 149,
    velocity: 45, rof: 12, mag: 1, reload: 6.0, disp: 16, aimTime: 1.6,
    damage: 70, pen100: 200, penDecay: 0, he: 1.6, range: 70, singleUse: true,
  },
  bazooka: {
    name: 'M1A1 Bazooka', cls: 'at', shell: SHELL.HEAT, caliber: 60,
    velocity: 82, rof: 10, mag: 1, reload: 5.5, disp: 12, aimTime: 1.6,
    damage: 55, pen100: 100, penDecay: 0, he: 0.9, range: 150,
  },
  piat: {
    name: 'PIAT', cls: 'at', shell: SHELL.HEAT, caliber: 89,
    velocity: 76, rof: 8, mag: 1, reload: 6.5, disp: 15, aimTime: 1.8,
    damage: 55, pen100: 100, penDecay: 0, he: 1.0, range: 110,
  },
  ptrs41: {
    name: 'PTRS-41', cls: 'at', shell: SHELL.AP, caliber: 14.5,
    velocity: 1010, rof: 15, mag: 5, reload: 6.0, disp: 3.0, aimTime: 2.0,
    damage: 110, pen100: 35, penDecay: 3.5, he: 0, range: 700, tracerEvery: 1,
  },

  // ---- Tank and anti-tank guns -----------------------------------------
  kwk39_50: {
    name: '5 cm KwK 39 L/60', cls: 'cannon', shell: SHELL.AP, caliber: 50,
    velocity: 835, rof: 15, mag: 1, reload: 4.0, disp: 1.1, aimTime: 1.8,
    damage: 130, pen100: 67, penDecay: 2.6, he: 0.17, range: 2000, tracerEvery: 1,
  },
  kwk40_75: {
    name: '7.5 cm KwK 40 L/48', cls: 'cannon', shell: SHELL.AP, caliber: 75,
    velocity: 790, rof: 14, mag: 1, reload: 4.3, disp: 1.0, aimTime: 2.0,
    damage: 180, pen100: 106, penDecay: 2.2, he: 0.68, range: 2500, tracerEvery: 1,
  },
  kwk42_75: {
    name: '7.5 cm KwK 42 L/70', cls: 'cannon', shell: SHELL.AP, caliber: 75,
    velocity: 935, rof: 12, mag: 1, reload: 5.0, disp: 0.8, aimTime: 2.2,
    damage: 190, pen100: 174, penDecay: 2.6, he: 0.65, range: 3000, tracerEvery: 1,
  },
  kwk36_88: {
    name: '8.8 cm KwK 36 L/56', cls: 'cannon', shell: SHELL.AP, caliber: 88,
    velocity: 800, rof: 10, mag: 1, reload: 6.0, disp: 0.8, aimTime: 2.4,
    damage: 240, pen100: 138, penDecay: 2.4, he: 0.87, range: 3000, tracerEvery: 1,
  },
  f34_76: {
    name: '76 mm F-34', cls: 'cannon', shell: SHELL.AP, caliber: 76,
    velocity: 662, rof: 12, mag: 1, reload: 5.0, disp: 1.4, aimTime: 2.2,
    damage: 175, pen100: 84, penDecay: 2.2, he: 0.62, range: 2200, tracerEvery: 1,
  },
  zis_s53_85: {
    name: '85 mm ZiS-S-53', cls: 'cannon', shell: SHELL.AP, caliber: 85,
    velocity: 792, rof: 9, mag: 1, reload: 6.5, disp: 1.0, aimTime: 2.4,
    damage: 220, pen100: 120, penDecay: 2.5, he: 0.74, range: 2600, tracerEvery: 1,
  },
  d25t_122: {
    name: '122 mm D-25T', cls: 'cannon', shell: SHELL.AP, caliber: 122,
    velocity: 781, rof: 3, mag: 1, reload: 19.0, disp: 1.3, aimTime: 3.0,
    damage: 340, pen100: 160, penDecay: 2.8, he: 3.6, range: 3000, tracerEvery: 1,
  },
  zis3_76: {
    name: '76 mm ZiS-3', cls: 'cannon', shell: SHELL.AP, caliber: 76,
    velocity: 680, rof: 15, mag: 1, reload: 4.2, disp: 1.2, aimTime: 2.0,
    damage: 175, pen100: 86, penDecay: 2.2, he: 0.71, range: 2400, tracerEvery: 1,
  },
  pak40_75: {
    name: '7.5 cm Pak 40', cls: 'cannon', shell: SHELL.AP, caliber: 75,
    velocity: 792, rof: 14, mag: 1, reload: 4.4, disp: 0.9, aimTime: 2.0,
    damage: 180, pen100: 108, penDecay: 2.2, he: 0.68, range: 2700, tracerEvery: 1,
  },
  m3_75: {
    name: '75 mm M3', cls: 'cannon', shell: SHELL.AP, caliber: 75,
    velocity: 619, rof: 14, mag: 1, reload: 4.4, disp: 1.2, aimTime: 2.0,
    damage: 175, pen100: 88, penDecay: 2.2, he: 0.67, range: 2300, tracerEvery: 1,
  },
  m1_76: {
    name: '76 mm M1A2', cls: 'cannon', shell: SHELL.AP, caliber: 76,
    velocity: 792, rof: 12, mag: 1, reload: 5.0, disp: 1.0, aimTime: 2.2,
    damage: 180, pen100: 109, penDecay: 2.2, he: 0.39, range: 2600, tracerEvery: 1,
  },
  kwk30_20: {
    name: '2 cm KwK 30', cls: 'cannon', shell: SHELL.AP, caliber: 20,
    velocity: 780, rof: 240, mag: 10, reload: 3.5, disp: 2.6, aimTime: 0.9,
    damage: 70, pen100: 23, penDecay: 1.8, he: 0.005, range: 1200, burst: 5, tracerEvery: 2,
  },

  // ---- Indirect fire ----------------------------------------------------
  grw34_81: {
    name: '8 cm GrW 34', cls: 'mortar', shell: SHELL.HE, caliber: 81,
    velocity: 174, rof: 15, mag: 1, reload: 4.0, disp: 6.0, aimTime: 3.5,
    damage: 100, pen100: 0, penDecay: 0, he: 0.6, range: 2400, indirect: true,
  },
  bm37_82: {
    name: '82-BM-37', cls: 'mortar', shell: SHELL.HE, caliber: 82,
    velocity: 211, rof: 20, mag: 1, reload: 3.5, disp: 6.2, aimTime: 3.5,
    damage: 100, pen100: 0, penDecay: 0, he: 0.4, range: 3000, indirect: true,
  },
  grenade: {
    name: 'Grenade', cls: 'thrown', shell: SHELL.HE, caliber: 60,
    velocity: 16, rof: 20, mag: 1, reload: 2.5, disp: 20, aimTime: 0.8,
    damage: 90, pen100: 0, penDecay: 0, he: 0.18, range: 32, fuse: 3.6,
  },
};

/** Penetration in mm at a given range, before any angle is applied. */
export function penetrationAt(weapon, metres) {
  if (weapon.shell === SHELL.HEAT) return weapon.pen100;   // shaped charges do not care
  const pen = weapon.pen100 - weapon.penDecay * (metres - 100) / 100;
  return Math.max(0, pen);
}

/** Blast radius in metres for a shell's filler, and damage at a distance. */
export function blastRadius(kgTnt) {
  return kgTnt <= 0 ? 0 : 2.6 * Math.cbrt(kgTnt) + 1.5;
}
export function blastDamage(kgTnt, metres) {
  const r = blastRadius(kgTnt);
  if (metres >= r) return 0;
  const f = 1 - metres / r;
  return 240 * kgTnt ** 0.45 * f * f;
}
