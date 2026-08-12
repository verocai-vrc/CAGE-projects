import { describe, expect, it } from 'vitest';
import { mulberry32, rollLogistic, seedFromString } from '../src/engine/rng';

describe('mulberry32', () => {
  it('produces an identical sequence for two instances given the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('seedFromString', () => {
  it('is stable for a given string across runs', () => {
    expect(seedFromString('2026-08-12')).toBe(seedFromString('2026-08-12'));
  });

  it('differs for different strings', () => {
    expect(seedFromString('2026-08-12')).not.toBe(seedFromString('2026-08-13'));
  });

  it('returns a 32-bit non-negative integer', () => {
    const h = seedFromString('some share code');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(4294967296);
  });
});

describe('rollLogistic', () => {
  it('respects monotonicity: a bigger A-B edge wins more often at fixed k', () => {
    const N = 10_000;
    const k = 12;

    const winRate = (A: number, B: number, seed: number) => {
      const rng = mulberry32(seed);
      let wins = 0;
      for (let i = 0; i < N; i++) {
        if (rollLogistic(A, B, k, rng)) wins++;
      }
      return wins / N;
    };

    const small = winRate(55, 50, 1); // +5 edge
    const large = winRate(80, 50, 2); // +30 edge

    expect(large).toBeGreaterThan(small);
  });

  it('is ~50% when A equals B', () => {
    const rng = mulberry32(7);
    const N = 10_000;
    let wins = 0;
    for (let i = 0; i < N; i++) {
      if (rollLogistic(50, 50, 12, rng)) wins++;
    }
    expect(wins / N).toBeGreaterThan(0.47);
    expect(wins / N).toBeLessThan(0.53);
  });
});
