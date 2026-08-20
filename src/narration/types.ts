// narration/types.ts — Loop 7.10: the shape of a line pool (DESIGN.md §16.6).
//
// This loop writes the contract, not the content. §16.6's sequencing is
// deliberate — "the shape of a line pool exists and is provably validated,
// before a single line is written" — because the coverage matrix (§16.6's floor
// table, 204 lines) is only enforceable against a schema that already exists,
// and a pool authored against a shape that then changes is a rewrite.
//
// The pipeline these types serve, for orientation:
//
//   FightResult ──beats.ts──> Beat[] (~21) ──select.ts──> NarrationLine[] ──slots.ts──> string[]
//                 pure, no rng            pure, seeded          pure, total
//                 Loop 7.11              Loop 7.12             Loop 7.12
//
// Nothing here imports from /engine, /ui, /state, or /career, and nothing here
// touches Math.random, Date, or the DOM — /narration is on the Appendix B purity
// list as of this loop (see eslint.config.js).

/**
 * The thirteen kinds a fight compresses to (§16.6).
 *
 * `open` and `decision` are synthetic: the event log contains neither. `open` is
 * the walkout, and 32% of bouts go the distance and end on a `roundEnd` with the
 * verdict living only on `FightResult.method` (§16.1) — so narration reads the
 * result, not just the events.
 *
 * §16.6a settles the per-minute-check question: a check is folded into the beat
 * kinds already here ("a striker's successful check is an `exchange`; a
 * grappler's stuffed check is a `stuffed`"), so there is deliberately no
 * `check` kind. Checks change the input cadence of Stage 1, not this union.
 */
export const BEAT_KINDS = [
  'open',
  'exchange',
  'takedown',
  'stuffed',
  'ground',
  'standup',
  'submission',
  'rocked',
  'moment',
  'corner',
  'roundEnd',
  'finish',
  'decision',
] as const;

export type BeatKind = (typeof BEAT_KINDS)[number];

/**
 * Who is talking (§16.6).
 *
 *   'pbp'    — Ray Mensah. Present tense, 6–14 words, names the action.
 *   'colour' — Kass Ferreira. 10–20 words, past-tense fragments, explains why.
 *
 * Both are fictional, as §13 requires of every name in every pool.
 */
export type Voice = 'pbp' | 'colour';

/**
 * How long a line sits out after firing (§16.6's three-layer repetition control).
 * The third layer — the global 6-id anti-repeat window — is selector state
 * rather than a property of a line, and lands in Loop 7.12.
 */
export type Cooldown = 'fight' | 'round' | 'none';

/**
 * A comparison against one fact the beat exposes.
 *
 * §16.6 is explicit that a predicate is "structured data, never code". That is a
 * determinism requirement as much as a safety one: content is Zod-validated and
 * frozen, and an `eval`-shaped predicate could not be validated at all, let
 * alone replayed identically.
 *
 * Clauses within a `Predicate` are ANDed. There is deliberately no `or` and no
 * nesting: every condition §16.6's sample lines express ("exchange/heavy",
 * "roundEnd/fatigue", "finish/KO", "decision/SD") is a conjunction of simple
 * comparisons, and a predicate language richer than its content needs is a
 * selector bug waiting to be written.
 */
export type PredicateClause =
  | { eq: string | number | boolean }
  | { ne: string | number | boolean }
  | { gt: number }
  | { gte: number }
  | { lt: number }
  | { lte: number }
  | { in: (string | number)[] };

/**
 * A `when` guard: fact name -> comparison.
 *
 * The fact vocabulary is deliberately open at this loop. `Beat` does not exist
 * until 7.11, so pinning field names here would be guessing at the extractor's
 * output; 7.11 defines the facts and 7.12's selector is where an unknown fact
 * name becomes an error. What this loop fixes is the *shape* — which is the part
 * the content pools are authored against.
 */
export type Predicate = Record<string, PredicateClause>;

/** §16.6's line schema, verbatim in shape. */
export interface NarrationLine {
  /** Unique across every pool; doubles as the cooldown and anti-repeat key. */
  id: string;
  on: BeatKind;
  when?: Predicate;
  /** 'ground' | 'fatigue' | 'loud' | 'needsNickname' | 'needsGym' | ... */
  tags?: string[];
  voice: Voice;
  /** Default 1. */
  weight?: number;
  /** Default 0. Higher tiers EXCLUDE lower ones rather than outweighing them —
   *  that is how "he is out cold" beats "that landed clean" without
   *  weight-fiddling (§16.6). */
  priority?: number;
  /** Default 'round'. */
  cooldown?: Cooldown;
  /** Slot template. See SLOT_NAMES. */
  text: string;
}

/** One content file: a flat pool of lines. */
export interface NarrationPool {
  lines: NarrationLine[];
}

/**
 * Every slot a line may reference (§16.6).
 *
 * `{NICK_*}` and `{GYM_*}` are optional slots: a fighter without a nickname must
 * never render `{NICK_A}`. Lines using one carry the matching tag and the
 * selector filters them out when the slot is unavailable — never a fallback
 * string, which is how "Riko 'undefined' Tanaka" reaches a screenshot.
 */
export const SLOT_NAMES = [
  'A', 'B', 'NICK_A', 'NICK_B', 'LAST_A', 'LAST_B', 'GYM_A', 'GYM_B', 'R', 'N', 'TECH',
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

/** The tag a line must carry to use each optional slot (§16.6's totality rule). */
export const OPTIONAL_SLOT_TAGS: Readonly<Record<string, string>> = Object.freeze({
  NICK_A: 'needsNickname',
  NICK_B: 'needsNickname',
  GYM_A: 'needsGym',
  GYM_B: 'needsGym',
});

/** Every `{SLOT}` referenced by a template, in order of appearance. */
export function slotsIn(text: string): string[] {
  return [...text.matchAll(/\{([A-Z_]+)\}/g)].map((match) => match[1]);
}
