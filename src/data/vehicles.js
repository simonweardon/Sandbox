// Vehicle table.
//
// `armour` gives each facet a plate thickness in mm and a slope in degrees from
// the vertical, which is what actually decides whether a shell gets through:
// the line-of-sight thickness is t / cos(slope + impact angle).
//
// `model` is read by the procedural model builder in render/models/vehicle.js —
// every vehicle here is drawn from boxes and cylinders at run time, so the game
// ships no art files at all.
//
// Speeds are m/s on a road; `offroad` scales that on soft ground.
// `traverse` is turret rotation in degrees per second, which is a real and
// keenly felt difference between, say, a Sherman and a Tiger.

const P = (t, slope = 0) => ({ t, slope });

export const VEHICLES = {
  // ======================= GERMANY ======================================
  pz3j: {
    name: 'Panzer III Ausf. J', short: 'Pz.III J', faction: 'ger', cls: 'tank',
    crew: ['commander', 'gunner', 'loader', 'driver', 'hullgunner'],
    mass: 21.5, maxSpeed: 11.1, offroad: 0.5, accel: 2.0, turnRate: 0.9, traverse: 12,
    gunElev: [-10, 20], vision: 320, cost: 180,
    armour: {
      hullFront: P(50, 21), hullLower: P(50, 15), hullSide: P(30), hullRear: P(50, 10), hullTop: P(16),
      turretFront: P(57, 15), mantlet: P(50), turretSide: P(30, 25), turretRear: P(30, 12), turretTop: P(12),
    },
    guns: [
      { w: 'kwk39_50', mount: 'turret', ammo: { ap: 45, he: 39 } },
      { w: 'mg34', mount: 'coax', ammo: { bullet: 2000 } },
      { w: 'mg34', mount: 'hull', ammo: { bullet: 1750 } },
    ],
    model: {
      hull: { len: 5.5, wid: 2.4, hgt: 0.95, clear: 0.42 }, glacis: { len: 1.1, slope: 21 },
      tracks: { wid: 0.4, hgt: 0.78, wheels: 6, wheelR: 0.33, rollers: 3, style: 'torsion' },
      turret: { len: 2.3, wid: 1.9, hgt: 0.82, z: 0.15, shape: 'box', slope: 15, cupola: true },
      gun: { len: 3.0, r: 0.055, brake: false, mantlet: 'box' },
      paint: 'panzergrey', fenders: true, stowage: 2,
    },
  },
  pz4h: {
    name: 'Panzer IV Ausf. H', short: 'Pz.IV H', faction: 'ger', cls: 'tank',
    crew: ['commander', 'gunner', 'loader', 'driver', 'hullgunner'],
    mass: 25.0, maxSpeed: 11.7, offroad: 0.5, accel: 1.9, turnRate: 0.85, traverse: 14,
    gunElev: [-8, 20], vision: 340, cost: 240,
    armour: {
      hullFront: P(80, 8), hullLower: P(50, 14), hullSide: P(30), hullRear: P(20, 10), hullTop: P(12),
      turretFront: P(50, 10), mantlet: P(50), turretSide: P(30, 25), turretRear: P(30, 15), turretTop: P(16),
    },
    guns: [
      { w: 'kwk40_75', mount: 'turret', ammo: { ap: 38, he: 49 } },
      { w: 'mg34', mount: 'coax', ammo: { bullet: 2000 } },
      { w: 'mg34', mount: 'hull', ammo: { bullet: 1350 } },
    ],
    model: {
      hull: { len: 5.9, wid: 2.9, hgt: 1.0, clear: 0.4 }, glacis: { len: 0.9, slope: 12 },
      tracks: { wid: 0.4, hgt: 0.8, wheels: 8, wheelR: 0.235, rollers: 4, style: 'bogie' },
      turret: { len: 2.6, wid: 2.1, hgt: 0.9, z: 0.1, shape: 'box', slope: 10, cupola: true },
      gun: { len: 3.6, r: 0.06, brake: true, mantlet: 'box' },
      paint: 'dunkelgelb', fenders: true, stowage: 3, schurzen: true,
    },
  },
  stug3g: {
    name: 'Sturmgeschütz III Ausf. G', short: 'StuG III G', faction: 'ger', cls: 'spg',
    crew: ['commander', 'gunner', 'loader', 'driver'],
    mass: 23.9, maxSpeed: 11.1, offroad: 0.5, accel: 2.0, turnRate: 0.9, traverse: 0,
    gunElev: [-6, 17], gunArc: 12, vision: 330, cost: 220,
    armour: {
      hullFront: P(80, 21), hullLower: P(50, 20), hullSide: P(30), hullRear: P(30, 10), hullTop: P(16),
      turretFront: P(80, 9), mantlet: P(80), turretSide: P(30, 12), turretRear: P(30, 12), turretTop: P(16),
    },
    guns: [
      { w: 'kwk40_75', mount: 'casemate', ammo: { ap: 24, he: 30 } },
      { w: 'mg34', mount: 'coax', ammo: { bullet: 600 } },
    ],
    model: {
      hull: { len: 5.6, wid: 2.95, hgt: 0.7, clear: 0.4 }, glacis: { len: 1.2, slope: 21 },
      tracks: { wid: 0.4, hgt: 0.78, wheels: 6, wheelR: 0.33, rollers: 3, style: 'torsion' },
      casemate: { len: 3.4, wid: 2.7, hgt: 0.72, slope: 9 },
      gun: { len: 3.6, r: 0.06, brake: true, mantlet: 'saukopf' },
      paint: 'dunkelgelb', fenders: true, stowage: 3, schurzen: true,
    },
  },
  panther_a: {
    name: 'Panther Ausf. A', short: 'Panther A', faction: 'ger', cls: 'tank',
    crew: ['commander', 'gunner', 'loader', 'driver', 'hullgunner'],
    mass: 44.8, maxSpeed: 12.8, offroad: 0.55, accel: 1.6, turnRate: 0.75, traverse: 6,
    gunElev: [-8, 18], vision: 380, cost: 480,
    armour: {
      hullFront: P(80, 55), hullLower: P(60, 55), hullSide: P(40, 30), hullRear: P(40, 30), hullTop: P(16),
      turretFront: P(100, 12), mantlet: P(110), turretSide: P(45, 25), turretRear: P(45, 25), turretTop: P(16),
    },
    guns: [
      { w: 'kwk42_75', mount: 'turret', ammo: { ap: 40, he: 39 } },
      { w: 'mg34', mount: 'coax', ammo: { bullet: 2400 } },
      { w: 'mg34', mount: 'hull', ammo: { bullet: 2000 } },
    ],
    model: {
      hull: { len: 6.9, wid: 3.3, hgt: 0.9, clear: 0.55 }, glacis: { len: 1.9, slope: 55 },
      tracks: { wid: 0.66, hgt: 0.95, wheels: 8, wheelR: 0.43, rollers: 0, style: 'interleaved' },
      turret: { len: 3.0, wid: 2.3, hgt: 0.85, z: 0.35, shape: 'hex', slope: 12, cupola: true },
      gun: { len: 5.25, r: 0.062, brake: true, mantlet: 'round' },
      paint: 'ambush', fenders: true, stowage: 3,
    },
  },
  tiger1: {
    name: 'Tiger I Ausf. E', short: 'Tiger I', faction: 'ger', cls: 'tank',
    crew: ['commander', 'gunner', 'loader', 'driver', 'hullgunner'],
    mass: 57.0, maxSpeed: 10.5, offroad: 0.5, accel: 1.3, turnRate: 0.6, traverse: 6,
    gunElev: [-8, 17], vision: 400, cost: 620,
    armour: {
      hullFront: P(100, 10), hullLower: P(100, 25), hullSide: P(80), hullRear: P(80, 8), hullTop: P(25),
      turretFront: P(100), mantlet: P(150), turretSide: P(80), turretRear: P(80), turretTop: P(25),
    },
    guns: [
      { w: 'kwk36_88', mount: 'turret', ammo: { ap: 46, he: 46 } },
      { w: 'mg34', mount: 'coax', ammo: { bullet: 2800 } },
      { w: 'mg34', mount: 'hull', ammo: { bullet: 2000 } },
    ],
    model: {
      hull: { len: 6.3, wid: 3.55, hgt: 1.0, clear: 0.47 }, glacis: { len: 1.0, slope: 10 },
      tracks: { wid: 0.72, hgt: 0.98, wheels: 8, wheelR: 0.4, rollers: 0, style: 'interleaved' },
      turret: { len: 3.4, wid: 2.5, hgt: 0.95, z: 0.15, shape: 'round', slope: 4, cupola: true },
      gun: { len: 4.93, r: 0.07, brake: true, mantlet: 'round' },
      paint: 'dunkelgelb', fenders: true, stowage: 4,
    },
  },
  sdkfz251: {
    name: 'Sd.Kfz. 251/1', short: 'Sd.Kfz 251', faction: 'ger', cls: 'halftrack',
    crew: ['driver', 'gunner'], seats: 10,
    mass: 8.5, maxSpeed: 14.7, offroad: 0.65, accel: 2.6, turnRate: 1.2, traverse: 60,
    gunElev: [-10, 40], vision: 330, cost: 120,
    armour: {
      hullFront: P(15, 25), hullLower: P(15, 20), hullSide: P(8, 30), hullRear: P(8, 20), hullTop: P(0),
      turretFront: P(8), mantlet: P(8), turretSide: P(8), turretRear: P(8), turretTop: P(0),
    },
    guns: [{ w: 'mg34', mount: 'pintle', ammo: { bullet: 2010 } }],
    model: {
      hull: { len: 5.8, wid: 2.1, hgt: 0.85, clear: 0.35 }, glacis: { len: 0.6, slope: 25 },
      tracks: { wid: 0.28, hgt: 0.55, wheels: 6, wheelR: 0.25, rollers: 0, style: 'halftrack' },
      openTop: true, gun: { len: 0.9, r: 0.025, brake: false, mantlet: 'shield' },
      paint: 'dunkelgelb', fenders: true, stowage: 2,
    },
  },
  opelblitz: {
    name: 'Opel Blitz 3t', short: 'Opel Blitz', faction: 'ger', cls: 'truck',
    crew: ['driver'], seats: 12,
    mass: 3.3, maxSpeed: 23.6, offroad: 0.35, accel: 2.4, turnRate: 1.1, traverse: 0,
    vision: 280, cost: 60, supply: 900,
    armour: {
      hullFront: P(0), hullLower: P(0), hullSide: P(0), hullRear: P(0), hullTop: P(0),
      turretFront: P(0), mantlet: P(0), turretSide: P(0), turretRear: P(0), turretTop: P(0),
    },
    guns: [],
    model: {
      hull: { len: 6.0, wid: 2.2, hgt: 0.6, clear: 0.45 }, wheeled: true,
      wheels: { count: 4, r: 0.48, wid: 0.22 }, cab: { len: 1.7, hgt: 1.15 }, cargo: { len: 3.4, hgt: 1.3, tilt: true },
      paint: 'dunkelgelb',
    },
  },

  // ======================= SOVIET UNION =================================
  t34_76: {
    name: 'T-34 mod. 1943', short: 'T-34/76', faction: 'sov', cls: 'tank',
    crew: ['commander', 'loader', 'driver', 'hullgunner'],
    mass: 30.9, maxSpeed: 14.7, offroad: 0.7, accel: 2.2, turnRate: 1.0, traverse: 14,
    gunElev: [-5, 25], vision: 280, cost: 250,
    armour: {
      hullFront: P(45, 60), hullLower: P(45, 53), hullSide: P(45, 40), hullRear: P(40, 47), hullTop: P(20),
      turretFront: P(52, 30), mantlet: P(40), turretSide: P(52, 30), turretRear: P(52, 30), turretTop: P(16),
    },
    guns: [
      { w: 'f34_76', mount: 'turret', ammo: { ap: 30, he: 47 } },
      { w: 'dp28', mount: 'coax', ammo: { bullet: 1890 } },
      { w: 'dp28', mount: 'hull', ammo: { bullet: 1000 } },
    ],
    model: {
      hull: { len: 6.1, wid: 3.0, hgt: 0.72, clear: 0.4 }, glacis: { len: 1.8, slope: 60 },
      tracks: { wid: 0.55, hgt: 0.85, wheels: 5, wheelR: 0.42, rollers: 0, style: 'christie' },
      turret: { len: 2.2, wid: 2.0, hgt: 0.62, z: 0.0, shape: 'hex', slope: 30, cupola: false },
      gun: { len: 3.16, r: 0.058, brake: false, mantlet: 'round' },
      paint: 'sovgreen', fenders: true, stowage: 4, fuelDrums: true,
    },
  },
  t34_85: {
    name: 'T-34-85', short: 'T-34-85', faction: 'sov', cls: 'tank',
    crew: ['commander', 'gunner', 'loader', 'driver', 'hullgunner'],
    mass: 32.2, maxSpeed: 14.4, offroad: 0.7, accel: 2.1, turnRate: 0.95, traverse: 14,
    gunElev: [-5, 22], vision: 340, cost: 380,
    armour: {
      hullFront: P(45, 60), hullLower: P(45, 53), hullSide: P(45, 40), hullRear: P(40, 47), hullTop: P(20),
      turretFront: P(90, 15), mantlet: P(90), turretSide: P(75, 20), turretRear: P(52, 10), turretTop: P(20),
    },
    guns: [
      { w: 'zis_s53_85', mount: 'turret', ammo: { ap: 24, he: 31 } },
      { w: 'dp28', mount: 'coax', ammo: { bullet: 1890 } },
      { w: 'dp28', mount: 'hull', ammo: { bullet: 1000 } },
    ],
    model: {
      hull: { len: 6.1, wid: 3.0, hgt: 0.72, clear: 0.4 }, glacis: { len: 1.8, slope: 60 },
      tracks: { wid: 0.55, hgt: 0.85, wheels: 5, wheelR: 0.42, rollers: 0, style: 'christie' },
      turret: { len: 2.7, wid: 2.35, hgt: 0.85, z: 0.05, shape: 'round', slope: 18, cupola: true },
      gun: { len: 4.15, r: 0.062, brake: false, mantlet: 'round' },
      paint: 'sovgreen', fenders: true, stowage: 4, fuelDrums: true,
    },
  },
  su85: {
    name: 'SU-85', short: 'SU-85', faction: 'sov', cls: 'spg',
    crew: ['commander', 'gunner', 'loader', 'driver'],
    mass: 29.6, maxSpeed: 15.0, offroad: 0.7, accel: 2.2, turnRate: 1.0, traverse: 0,
    gunElev: [-5, 25], gunArc: 10, vision: 320, cost: 340,
    armour: {
      hullFront: P(45, 50), hullLower: P(45, 50), hullSide: P(45, 20), hullRear: P(45, 42), hullTop: P(20),
      turretFront: P(45, 50), mantlet: P(60), turretSide: P(45, 20), turretRear: P(45, 42), turretTop: P(20),
    },
    guns: [{ w: 'zis_s53_85', mount: 'casemate', ammo: { ap: 30, he: 18 } }],
    model: {
      hull: { len: 6.1, wid: 3.0, hgt: 0.72, clear: 0.4 }, glacis: { len: 1.6, slope: 50 },
      tracks: { wid: 0.55, hgt: 0.85, wheels: 5, wheelR: 0.42, rollers: 0, style: 'christie' },
      casemate: { len: 3.6, wid: 2.8, hgt: 0.8, slope: 50 },
      gun: { len: 4.15, r: 0.062, brake: false, mantlet: 'round' },
      paint: 'sovgreen', fenders: true, stowage: 3,
    },
  },
  kv1: {
    name: 'KV-1 mod. 1942', short: 'KV-1', faction: 'sov', cls: 'tank',
    crew: ['commander', 'gunner', 'loader', 'driver', 'hullgunner'],
    mass: 47.0, maxSpeed: 9.2, offroad: 0.6, accel: 1.2, turnRate: 0.65, traverse: 10,
    gunElev: [-5, 25], vision: 280, cost: 340,
    armour: {
      hullFront: P(75, 30), hullLower: P(75, 25), hullSide: P(75), hullRear: P(70, 20), hullTop: P(30),
      turretFront: P(90, 10), mantlet: P(90), turretSide: P(90, 15), turretRear: P(90, 15), turretTop: P(30),
    },
    guns: [
      { w: 'f34_76', mount: 'turret', ammo: { ap: 40, he: 74 } },
      { w: 'dp28', mount: 'coax', ammo: { bullet: 2000 } },
      { w: 'dp28', mount: 'hull', ammo: { bullet: 1200 } },
    ],
    model: {
      hull: { len: 6.75, wid: 3.3, hgt: 0.85, clear: 0.43 }, glacis: { len: 1.2, slope: 30 },
      tracks: { wid: 0.7, hgt: 0.9, wheels: 6, wheelR: 0.32, rollers: 3, style: 'torsion' },
      turret: { len: 3.0, wid: 2.4, hgt: 0.8, z: 0.0, shape: 'round', slope: 10, cupola: true },
      gun: { len: 3.16, r: 0.058, brake: false, mantlet: 'round' },
      paint: 'sovgreen', fenders: true, stowage: 3, fuelDrums: true,
    },
  },
  is2: {
    name: 'IS-2 mod. 1944', short: 'IS-2', faction: 'sov', cls: 'tank',
    crew: ['commander', 'gunner', 'loader', 'driver'],
    mass: 46.0, maxSpeed: 10.3, offroad: 0.6, accel: 1.4, turnRate: 0.7, traverse: 12,
    gunElev: [-3, 20], vision: 340, cost: 560,
    armour: {
      hullFront: P(120, 60), hullLower: P(100, 30), hullSide: P(90, 15), hullRear: P(60, 30), hullTop: P(30),
      turretFront: P(100, 20), mantlet: P(110), turretSide: P(90, 25), turretRear: P(90, 25), turretTop: P(30),
    },
    guns: [
      { w: 'd25t_122', mount: 'turret', ammo: { ap: 12, he: 16 } },
      { w: 'dshk', mount: 'pintle', ammo: { bullet: 250 } },
      { w: 'dp28', mount: 'coax', ammo: { bullet: 2000 } },
    ],
    model: {
      hull: { len: 6.77, wid: 3.07, hgt: 0.8, clear: 0.47 }, glacis: { len: 1.7, slope: 60 },
      tracks: { wid: 0.65, hgt: 0.92, wheels: 6, wheelR: 0.36, rollers: 3, style: 'torsion' },
      turret: { len: 3.2, wid: 2.5, hgt: 0.95, z: 0.1, shape: 'round', slope: 20, cupola: true },
      gun: { len: 5.6, r: 0.075, brake: true, mantlet: 'round' },
      paint: 'sovgreen', fenders: true, stowage: 3, fuelDrums: true,
    },
  },
  zis5: {
    name: 'ZiS-5 3t', short: 'ZiS-5', faction: 'sov', cls: 'truck',
    crew: ['driver'], seats: 12,
    mass: 3.1, maxSpeed: 16.7, offroad: 0.35, accel: 2.2, turnRate: 1.05, traverse: 0,
    vision: 280, cost: 60, supply: 900,
    armour: {
      hullFront: P(0), hullLower: P(0), hullSide: P(0), hullRear: P(0), hullTop: P(0),
      turretFront: P(0), mantlet: P(0), turretSide: P(0), turretRear: P(0), turretTop: P(0),
    },
    guns: [],
    model: {
      hull: { len: 6.06, wid: 2.24, hgt: 0.6, clear: 0.45 }, wheeled: true,
      wheels: { count: 4, r: 0.5, wid: 0.24 }, cab: { len: 1.6, hgt: 1.1 }, cargo: { len: 3.5, hgt: 1.25, tilt: true },
      paint: 'sovgreen',
    },
  },

  // ======================= UNITED STATES ================================
  m4a1: {
    name: 'M4A1 Sherman', short: 'M4A1', faction: 'usa', cls: 'tank',
    crew: ['commander', 'gunner', 'loader', 'driver', 'hullgunner'],
    mass: 30.3, maxSpeed: 10.8, offroad: 0.55, accel: 1.9, turnRate: 0.9, traverse: 24,
    gunElev: [-10, 25], vision: 380, cost: 260,
    armour: {
      hullFront: P(51, 56), hullLower: P(51, 30), hullSide: P(38), hullRear: P(38, 10), hullTop: P(19),
      turretFront: P(76, 10), mantlet: P(89), turretSide: P(51, 15), turretRear: P(51, 15), turretTop: P(25),
    },
    guns: [
      { w: 'm3_75', mount: 'turret', ammo: { ap: 30, he: 60 } },
      { w: 'm2hb', mount: 'pintle', ammo: { bullet: 300 } },
      { w: 'bar', mount: 'coax', ammo: { bullet: 4750 } },
    ],
    model: {
      hull: { len: 5.84, wid: 2.62, hgt: 1.15, clear: 0.43 }, glacis: { len: 1.4, slope: 56 },
      tracks: { wid: 0.42, hgt: 0.75, wheels: 6, wheelR: 0.25, rollers: 3, style: 'vvss' },
      turret: { len: 2.4, wid: 2.1, hgt: 0.78, z: 0.15, shape: 'cast', slope: 12, cupola: true },
      gun: { len: 2.85, r: 0.058, brake: false, mantlet: 'round' },
      paint: 'olivedrab', fenders: false, stowage: 4, castHull: true,
    },
  },
  m4a3e8: {
    name: 'M4A3E8 Sherman "Easy Eight"', short: 'M4A3E8', faction: 'usa', cls: 'tank',
    crew: ['commander', 'gunner', 'loader', 'driver', 'hullgunner'],
    mass: 33.6, maxSpeed: 11.8, offroad: 0.62, accel: 2.0, turnRate: 0.95, traverse: 24,
    gunElev: [-10, 25], vision: 400, cost: 420,
    armour: {
      hullFront: P(64, 47), hullLower: P(51, 30), hullSide: P(38), hullRear: P(38, 10), hullTop: P(19),
      turretFront: P(76, 10), mantlet: P(89), turretSide: P(51, 15), turretRear: P(51, 15), turretTop: P(25),
    },
    guns: [
      { w: 'm1_76', mount: 'turret', ammo: { ap: 40, he: 31 } },
      { w: 'm2hb', mount: 'pintle', ammo: { bullet: 600 } },
      { w: 'bar', mount: 'coax', ammo: { bullet: 6250 } },
    ],
    model: {
      hull: { len: 6.27, wid: 3.0, hgt: 1.1, clear: 0.43 }, glacis: { len: 1.5, slope: 47 },
      tracks: { wid: 0.58, hgt: 0.78, wheels: 6, wheelR: 0.28, rollers: 3, style: 'hvss' },
      turret: { len: 2.9, wid: 2.2, hgt: 0.82, z: 0.15, shape: 'cast', slope: 12, cupola: true },
      gun: { len: 4.0, r: 0.06, brake: true, mantlet: 'round' },
      paint: 'olivedrab', fenders: false, stowage: 4,
    },
  },
  m10: {
    name: 'M10 Wolverine', short: 'M10', faction: 'usa', cls: 'td',
    crew: ['commander', 'gunner', 'loader', 'driver'],
    mass: 29.6, maxSpeed: 13.4, offroad: 0.55, accel: 2.1, turnRate: 0.95, traverse: 4,
    gunElev: [-10, 30], vision: 400, cost: 300,
    armour: {
      hullFront: P(38, 55), hullLower: P(38, 55), hullSide: P(25, 38), hullRear: P(25, 38), hullTop: P(19),
      turretFront: P(57, 45), mantlet: P(57), turretSide: P(25, 15), turretRear: P(25, 15), turretTop: P(0),
    },
    guns: [
      { w: 'm1_76', mount: 'turret', ammo: { ap: 34, he: 20 } },
      { w: 'm2hb', mount: 'pintle', ammo: { bullet: 300 } },
    ],
    model: {
      hull: { len: 5.97, wid: 3.05, hgt: 0.85, clear: 0.43 }, glacis: { len: 1.5, slope: 55 },
      tracks: { wid: 0.42, hgt: 0.75, wheels: 6, wheelR: 0.25, rollers: 3, style: 'vvss' },
      turret: { len: 2.6, wid: 2.1, hgt: 0.75, z: 0.3, shape: 'wedge', slope: 45, openTop: true },
      gun: { len: 4.0, r: 0.06, brake: false, mantlet: 'round' },
      paint: 'olivedrab', fenders: false, stowage: 2,
    },
  },
  m3halftrack: {
    name: 'M3 Half-track', short: 'M3 HT', faction: 'usa', cls: 'halftrack',
    crew: ['driver', 'gunner'], seats: 10,
    mass: 9.3, maxSpeed: 19.4, offroad: 0.6, accel: 2.7, turnRate: 1.2, traverse: 60,
    gunElev: [-10, 45], vision: 350, cost: 130,
    armour: {
      hullFront: P(12, 25), hullLower: P(12, 20), hullSide: P(6, 15), hullRear: P(6, 10), hullTop: P(0),
      turretFront: P(6), mantlet: P(6), turretSide: P(6), turretRear: P(6), turretTop: P(0),
    },
    guns: [{ w: 'm2hb', mount: 'pintle', ammo: { bullet: 700 } }],
    model: {
      hull: { len: 6.14, wid: 2.2, hgt: 0.9, clear: 0.35 }, glacis: { len: 0.5, slope: 25 },
      tracks: { wid: 0.3, hgt: 0.55, wheels: 4, wheelR: 0.26, rollers: 0, style: 'halftrack' },
      openTop: true, gun: { len: 1.1, r: 0.03, brake: false, mantlet: 'ring' },
      paint: 'olivedrab', fenders: true, stowage: 2,
    },
  },
};

// Towed guns are crewed emplacements rather than vehicles, but they share the
// armour and gun plumbing, so they live in the same table shape.
export const GUNS = {
  pak40: {
    name: '7.5 cm Pak 40', short: 'Pak 40', faction: 'ger', cls: 'at_gun',
    crew: 5, vision: 420, cost: 130, traverse: 22, gunElev: [-5, 22], gunArc: 32,
    armour: { shield: P(6, 25) },
    guns: [{ w: 'pak40_75', mount: 'trail', ammo: { ap: 40, he: 30 } }],
    model: { shieldW: 2.0, shieldH: 1.0, barrelLen: 3.7, barrelR: 0.055, wheelR: 0.5, trailLen: 3.0, paint: 'dunkelgelb' },
  },
  zis3: {
    name: '76 mm ZiS-3', short: 'ZiS-3', faction: 'sov', cls: 'at_gun',
    crew: 5, vision: 420, cost: 110, traverse: 22, gunElev: [-5, 37], gunArc: 27,
    armour: { shield: P(5, 20) },
    guns: [{ w: 'zis3_76', mount: 'trail', ammo: { ap: 30, he: 40 } }],
    model: { shieldW: 1.6, shieldH: 0.95, barrelLen: 3.2, barrelR: 0.05, wheelR: 0.48, trailLen: 2.8, paint: 'sovgreen' },
  },
  mortar_ger: {
    name: '8 cm GrW 34', short: 'GrW 34', faction: 'ger', cls: 'mortar',
    crew: 3, vision: 200, cost: 70, traverse: 30, gunElev: [45, 85], gunArc: 20,
    armour: {},
    guns: [{ w: 'grw34_81', mount: 'baseplate', ammo: { he: 40 } }],
    model: { barrelLen: 1.14, barrelR: 0.045, bipod: true, paint: 'dunkelgelb' },
  },
  mortar_sov: {
    name: '82-BM-37', short: 'BM-37', faction: 'sov', cls: 'mortar',
    crew: 3, vision: 200, cost: 70, traverse: 30, gunElev: [45, 85], gunArc: 20,
    armour: {},
    guns: [{ w: 'bm37_82', mount: 'baseplate', ammo: { he: 40 } }],
    model: { barrelLen: 1.22, barrelR: 0.046, bipod: true, paint: 'sovgreen' },
  },
};

/**
 * Internal components, positioned in hull-local metres (x right, y up, z fore).
 * A shell that gets through the armour rolls against whatever lies along its
 * path, which is why a hit on the lower front plate tends to take the driver
 * and a hit low on the side tends to find the ammunition.
 */
export function componentLayout(v) {
  const m = v.model, h = m.hull;
  const half = h.len / 2, w = h.wid / 2;
  const floor = h.clear;                 // hull belly above the ground
  const top = floor + h.hgt;             // hull roof
  const fight = m.turret || m.casemate;
  // Where the gunner's head is: inside the turret, or up in the open on a
  // truck or half-track that has no fighting compartment at all.
  const turretMid = top + (fight ? fight.hgt * 0.45 : 0.35);
  const turretZ = fight?.z || 0;

  const parts = [
    { id: 'driver',       crew: true, x: -w * 0.45, y: floor + h.hgt * 0.45, z: half * 0.55, r: 0.45, hp: 100 },
    { id: 'hullgunner',   crew: true, x: w * 0.45,  y: floor + h.hgt * 0.45, z: half * 0.5,  r: 0.40, hp: 100 },
    { id: 'gunner',       crew: true, x: -w * 0.32, y: turretMid,            z: turretZ + 0.15, r: 0.40, hp: 100 },
    { id: 'commander',    crew: true, x: -w * 0.28, y: turretMid + 0.12,     z: turretZ - 0.45, r: 0.40, hp: 100 },
    { id: 'loader',       crew: true, x: w * 0.36,  y: turretMid,            z: turretZ - 0.15, r: 0.40, hp: 100 },
    // Ready rounds live in the hull sponsons, which is why a side hit low on
    // the hull is so often the one that sets a tank off.
    { id: 'ammoRack',     x: w * 0.55, y: floor + h.hgt * 0.3,  z: -half * 0.1,  r: 0.55, hp: 60,  volatile: 0.35 },
    { id: 'fuel',         x: 0,        y: floor + h.hgt * 0.35, z: -half * 0.72, r: 0.60, hp: 70,  volatile: 0.18 },
    { id: 'engine',       x: 0,        y: floor + h.hgt * 0.5,  z: -half * 0.72, r: 0.85, hp: 140 },
    { id: 'transmission', x: 0,        y: floor + h.hgt * 0.3,  z: half * 0.72,  r: 0.55, hp: 110 },
    { id: 'gunBreech',    x: 0,        y: turretMid,            z: turretZ + 0.4, r: 0.35, hp: 90 },
    { id: 'turretRing',   x: 0,        y: top,                  z: turretZ,      r: 0.50, hp: 100 },
    { id: 'optics',       x: -w * 0.4, y: turretMid + 0.25,     z: turretZ + 0.5, r: 0.20, hp: 40 },
    { id: 'radio',        x: w * 0.5,  y: floor + h.hgt * 0.55, z: half * 0.35,  r: 0.30, hp: 50 },
  ];
  return parts;
}

export const ALL_VEHICLES = VEHICLES;
