// faceCode.ts — Loop 6.4: DESIGN.md §15.4's FaceCode — twelve feature slots (nine at Loop 6.4,
// three more at Loop 7.7 / §16.4), each an index below 36, serialized to a
// twelve-character base36 string.
//
// This file is deliberately independent of the feature dictionary (features.ts):
// serialize/parse only need SLOT_ORDER and a per-slot count to stay in range, not
// the artwork itself. That keeps a round-trip test honest — it is testing the
// codec, not the drawing.
//
// `face` lives on `Fighter` as flavor only, exactly like `nationality` and
// `stance` (§4.2, §15.4). Nothing in this file touches the engine, and nothing
// here is random on its own — `faceFromSeed` takes an RNG the caller already owns,
// so the same seeded stream that draws a generated opponent's name and attributes
// also draws their face, and a given seed always produces the same fighter with
// the same face (§15.4's determinism promise).

import type { RNG } from '../../engine';

export interface FaceCode {
  skin: number;
  /** Loop 7.7 (§16.4): the shoulder line. Read at 24px, where a nose is not. */
  build: number;
  head: number;
  hair: number;
  hairColor: number;
  brow: number;
  eyes: number;
  nose: number;
  mouth: number;
  facialHair: number;
  /** Loop 7.7 (§16.4): tattoos and birth-scars, in the `mk-*` namespace.
   *  Authored and permanent — NOT wear, which is derived by faceWear into the
   *  separate `wr-*` namespace and must never share a layer with this. */
  marks: number;
  /** Loop 7.7 (§16.4): corner gear. Kept after measuring that the SVG
   *  sub-budget does not bind — see features.ts's GEAR. */
  gear: number;
}

/** Fixed order — this is also the order the twelve base36 characters serialize in. */
export const SLOT_ORDER = [
  'skin',
  'build',
  'head',
  'hair',
  'hairColor',
  'brow',
  'eyes',
  'nose',
  'mouth',
  'facialHair',
  'marks',
  'gear',
] as const satisfies readonly (keyof FaceCode)[];

/**
 * How many variants each slot has. Kept here rather than derived from
 * features.ts so faceCode.ts has no dependency on the artwork module — the codec
 * is defined by the slot contract, and features.ts is required to honor it, not
 * the other way around. features.ts asserts its own arrays match these counts.
 */
export const SLOT_COUNTS: Record<keyof FaceCode, number> = {
  skin: 6,
  build: 5,
  head: 5,
  hair: 10,
  hairColor: 6,
  brow: 5,
  eyes: 6,
  nose: 5,
  mouth: 5,
  facialHair: 8,
  marks: 12,
  gear: 8,
};

const BASE = 36;

function clampToSlot(slot: keyof FaceCode, value: number): number {
  const count = SLOT_COUNTS[slot];
  return ((value % count) + count) % count;
}

/** One base36 digit per slot, in SLOT_ORDER — always exactly 12 characters. */
export function serializeFaceCode(code: FaceCode): string {
  return SLOT_ORDER.map((slot) => clampToSlot(slot, code[slot]).toString(BASE)).join('');
}

/**
 * Inverse of serializeFaceCode. Out-of-range or malformed characters clamp into
 * range rather than throwing — a face is flavor, and a corrupted save should never
 * be the reason a career fails to load (§11's fail-safe persistence rule extends to
 * every field, not just the ones with a dedicated schema check).
 */
export function parseFaceCode(serialized: string): FaceCode {
  const chars = serialized.padEnd(SLOT_ORDER.length, '0').slice(0, SLOT_ORDER.length);
  const result = {} as FaceCode;
  SLOT_ORDER.forEach((slot, i) => {
    const digit = parseInt(chars[i], BASE);
    result[slot] = clampToSlot(slot, Number.isNaN(digit) ? 0 : digit);
  });
  return result;
}

/**
 * Draws a face from an RNG the caller already owns. Called from the same seeded
 * stream that draws a generated opponent's name and attributes (matchmaking.ts) —
 * never seeded independently, so a given career seed reproduces the same face
 * alongside everything else about that opponent.
 */
export function faceFromSeed(rng: RNG): FaceCode {
  const result = {} as FaceCode;
  for (const slot of SLOT_ORDER) {
    result[slot] = Math.floor(rng.next() * SLOT_COUNTS[slot]);
  }
  return result;
}
