// Factions, their palettes, and what each can call in for manpower.

export const FACTIONS = {
  ger: {
    name: 'Wehrmacht', tag: 'GER',
    colour: 0x9fb0c4, marker: '#8fa8c8', accent: '#c9d6e6',
    uniform: 0x616d62, helmet: 0x424a42, skin: 0xd6a780, gear: 0x3a3a33,
    calls: {
      infantry: ['ger_grenadier', 'ger_assault', 'ger_at', 'ger_engineer', 'ger_sniper'],
      support: ['pak40', 'mortar_ger'],
      vehicles: ['sdkfz251', 'opelblitz', 'pz3j', 'pz4h', 'stug3g', 'panther_a', 'tiger1'],
    },
  },
  sov: {
    name: 'Red Army', tag: 'SOV',
    colour: 0xd06a5a, marker: '#d8624e', accent: '#f0a08c',
    uniform: 0x94845a, helmet: 0x6a6440, skin: 0xd6a780, gear: 0x54452e,
    calls: {
      infantry: ['sov_rifle', 'sov_smg', 'sov_at', 'sov_engineer', 'sov_sniper'],
      support: ['zis3', 'mortar_sov'],
      vehicles: ['zis5', 't34_76', 'su85', 't34_85', 'kv1', 'is2'],
    },
  },
  usa: {
    name: 'US Army', tag: 'USA',
    colour: 0x86c08a, marker: '#6fbf7a', accent: '#bfe3c2',
    uniform: 0x737a52, helmet: 0x4d553c, skin: 0xd6a780, gear: 0x453f2c,
    calls: {
      infantry: ['usa_rifle', 'usa_at', 'usa_engineer', 'usa_sniper'],
      support: ['pak40', 'mortar_ger'],
      vehicles: ['m3halftrack', 'm4a1', 'm10', 'm4a3e8'],
    },
  },
};

/** Paint schemes used by the procedural vehicle builder. */
export const PAINT = {
  panzergrey: { base: 0x4a4f52, dark: 0x3a3e41, detail: 0x2b2e30 },
  dunkelgelb: { base: 0x9a8757, dark: 0x7d6c44, detail: 0x4a4130 },
  ambush:     { base: 0x8e7d51, dark: 0x5d6b45, detail: 0x6b4a35 },
  sovgreen:   { base: 0x4c5a3c, dark: 0x3c4830, detail: 0x2b3323 },
  olivedrab:  { base: 0x5b5c3c, dark: 0x484930, detail: 0x333424 },
};
