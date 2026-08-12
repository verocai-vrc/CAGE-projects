export interface RNG {
  next(): number; // returns [0,1)
}

export function mulberry32(seedInt: number): RNG {
  let a = seedInt >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

// Hash a string seed (e.g. "2026-08-12" or a share code) to a 32-bit int.
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Probability that A wins a contested action against B, given attribute values.
export function rollLogistic(A: number, B: number, k: number, rng: RNG): boolean {
  const p = 1 / (1 + Math.exp(-(A - B) / k));
  return rng.next() < p;
}
