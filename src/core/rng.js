// A seeded PRNG, so a given map seed always produces the same battlefield.
// mulberry32 — small, fast, and good enough for terrain and dispersion rolls.

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  /** Box-Muller, for ballistic dispersion. */
  next.gauss = () => {
    const u = Math.max(next(), 1e-9), v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU_ * v);
  };
  return next;
}

const TAU_ = Math.PI * 2;

/** The simulation's shared roll source. Reseeded when a battle starts. */
export let roll = makeRng(1337);
export function reseed(seed) { roll = makeRng(seed); }
