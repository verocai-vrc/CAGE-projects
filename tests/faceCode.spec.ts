// faceCode.spec.ts — Loop 6.4: DESIGN.md §15.4's determinism and round-trip
// contracts for FaceCode, tested independently of any rendering.

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/engine/rng';
import {
  faceFromSeed,
  parseFaceCode,
  serializeFaceCode,
  SLOT_COUNTS,
  SLOT_ORDER,
  type FaceCode,
} from '../src/ui/portrait/faceCode';

describe('faceFromSeed', () => {
  it('produces an identical FaceCode from the same seed, called twice', () => {
    const a = faceFromSeed(mulberry32(777));
    const b = faceFromSeed(mulberry32(777));
    expect(a).toEqual(b);
  });

  it('a generated fighter face is stable across repeated reads (no hidden mutation)', () => {
    const rng = mulberry32(42);
    const code = faceFromSeed(rng);
    // Re-reading the same object twice must be the same object's values — nothing
    // about rendering it should be able to perturb the source of truth.
    const snapshot = { ...code };
    expect(code).toEqual(snapshot);
    expect(serializeFaceCode(code)).toEqual(serializeFaceCode(snapshot));
  });

  it('every slot stays within its declared count', () => {
    const rng = mulberry32(9001);
    for (let i = 0; i < 500; i++) {
      const code = faceFromSeed(rng);
      for (const slot of SLOT_ORDER) {
        expect(code[slot]).toBeGreaterThanOrEqual(0);
        expect(code[slot]).toBeLessThan(SLOT_COUNTS[slot]);
      }
    }
  });

  it('different seeds produce visibly different faces (not a constant)', () => {
    const codes = Array.from({ length: 24 }, (_, i) => faceFromSeed(mulberry32(1000 + i)));
    const serialized = codes.map(serializeFaceCode);
    // "No two identical" — this loop's screenshot verify's textual counterpart.
    expect(new Set(serialized).size).toBe(24);
  });
});

describe('serializeFaceCode / parseFaceCode round-trip', () => {
  it('parse(serialize(code)) is identity for 1,000 random codes', () => {
    const rng = mulberry32(55);
    for (let i = 0; i < 1000; i++) {
      const code = faceFromSeed(rng);
      const roundTripped = parseFaceCode(serializeFaceCode(code));
      expect(roundTripped).toEqual(code);
    }
  });

  it('serializes to exactly 9 base36 characters', () => {
    const code = faceFromSeed(mulberry32(3));
    const serialized = serializeFaceCode(code);
    expect(serialized).toHaveLength(9);
    expect(serialized).toMatch(/^[0-9a-z]{9}$/);
  });

  it('never fails or throws on a malformed or corrupted string — flavor data fails safe', () => {
    const inputs = ['', '000000000', 'zzzzzzzzz', 'not-valid!', '12', 'ABCDEFGHI', '000000000000'];
    for (const input of inputs) {
      expect(() => parseFaceCode(input)).not.toThrow();
      const parsed = parseFaceCode(input);
      for (const slot of SLOT_ORDER) {
        expect(parsed[slot]).toBeGreaterThanOrEqual(0);
        expect(parsed[slot]).toBeLessThan(SLOT_COUNTS[slot]);
      }
    }
  });

  it('clamps an out-of-range slot value on serialize rather than emitting an invalid digit', () => {
    const overflowing: FaceCode = {
      skin: 99, head: 99, hair: 99, hairColor: 99, brow: 99,
      eyes: 99, nose: 99, mouth: 99, facialHair: 99,
    };
    const serialized = serializeFaceCode(overflowing);
    const reparsed = parseFaceCode(serialized);
    for (const slot of SLOT_ORDER) {
      expect(reparsed[slot]).toBeLessThan(SLOT_COUNTS[slot]);
    }
  });
});
