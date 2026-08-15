// flags.ts — Loop 6.3: the nationality → flag symbol lookup (DESIGN.md §15.5).
//
// `Fighter.nationality` is a free string (§4.2) with five real values plus two
// sentinels: `lab` (batch simulation fixtures) and `fixture` (the hardcoded fight
// screen matchup). §15.5 requires an explicit neutral fallback for those rather
// than a broken or missing glyph, which is what makes this a lookup with a default
// instead of a template interpolation.

/** Symbol ids present in the sprite defs block. */
export const FLAG_SYMBOLS = [
  'flag-brazil',
  'flag-ireland',
  'flag-japan',
  'flag-poland',
  'flag-usa',
  'flag-neutral',
] as const;

export type FlagSymbolId = (typeof FLAG_SYMBOLS)[number];

const BY_NATIONALITY: Record<string, FlagSymbolId> = {
  Brazil: 'flag-brazil',
  Ireland: 'flag-ireland',
  Japan: 'flag-japan',
  Poland: 'flag-poland',
  USA: 'flag-usa',
};

/**
 * Total by construction: anything not in the table — the `lab` and `fixture`
 * sentinels, an empty string, a nationality added to the name pools before its flag
 * is drawn — resolves to the neutral field.
 */
export function flagSymbolId(nationality: string): FlagSymbolId {
  return BY_NATIONALITY[nationality] ?? 'flag-neutral';
}

/** True when a real flag exists, for callers that want to omit the chip entirely. */
export function hasFlag(nationality: string): boolean {
  return nationality in BY_NATIONALITY;
}
