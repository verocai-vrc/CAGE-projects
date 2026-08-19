// seed.ts — Loop 7.1: the career seed (DESIGN.md §16.2).
//
// Before this, three call sites in CareerScreen reached for `Date.now()` to
// seed a stream. That made every career-layer draw a function of the clock:
// the same career, replayed, produced different opponents and different fights,
// and the M5 daily run collapsed to a shared *origin* with private bouts. A
// daily result you cannot compare is not a daily.
//
// Every career-layer draw now derives its stream from one string stored on
// CareerState. Daily runs set that string to the date; normal runs roll one at
// career start. Determinism covers a whole run rather than one bout — which is
// what makes a shared daily comparable, and what §16.6's replayable narration
// is built on top of.

import { mulberry32, seedFromString, type RNG } from '../engine';

/** The draw a stream belongs to. Each purpose is an independent sequence, so
 *  adding a draw to one (a second injury roll, say) cannot shift the opponent
 *  another purpose would have generated. §16.2 fixes this list; `origin` is the
 *  career-start stream that predates it (daily.ts has always derived the day's
 *  prospect straight from the date string, and the skip path now matches). */
export type SeedPurpose =
  | 'origin'
  | 'gym'
  | 'coach'
  | 'opponent'
  | 'bout'
  | 'narration'
  | 'event'
  | 'injury';

/**
 * Derive a stream from `(seed, purpose, index)` exactly as §16.2 specifies.
 *
 * `index` is the position within a purpose — the nth opponent, the nth bout —
 * so a career's draws are addressable rather than sequential. Re-deriving the
 * third opponent does not require having drawn the first two, which is what
 * lets a reload re-simulate one bout without replaying the career.
 */
export function careerRng(seed: string, purpose: SeedPurpose, index: number): RNG {
  return mulberry32(seedFromString(`${seed}:${purpose}:${index}`));
}

/** The career-start stream: origin, face, and anything else rolled once before
 *  the career exists. Daily runs pass the date string here, which is what makes
 *  today's prospect identical for everyone (Loop 5.1's contract, unchanged). */
export function originRng(seed: string): RNG {
  return mulberry32(seedFromString(seed));
}

// Base32 without the characters that misread aloud or in a screenshot — no
// 0/O, no 1/I/L. A career seed is meant to be shown on the career card and
// typed back in, so legibility is a functional requirement, not polish.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const SEED_LENGTH = 10;

/**
 * Roll a fresh career seed. Called exactly once per career, at the moment it
 * starts, and never again — everything downstream derives from the result.
 *
 * `crypto.getRandomValues` rather than `Date.now()` or `Math.random()`: two
 * careers started in the same millisecond must not share a seed, and the
 * clock is what this loop exists to remove. This is the career layer, not
 * `/engine` — the purity checklist (Appendix B) forbids nondeterminism inside
 * the engine, and the engine still only ever receives an `RNG` it is handed.
 */
export function rollCareerSeed(): string {
  const bytes = new Uint8Array(SEED_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}
