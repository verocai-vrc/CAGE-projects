// narration/select.ts — Loop 7.12: Stage 2, a beat becomes a line
// (DESIGN.md §16.6).
//
//   FightResult ──beats.ts──> Beat[] ──select.ts──> NarratedLine[]
//                 pure, no rng        pure, SEEDED
//
// ---------------------------------------------------------------------------
// The one rule everything else is built to protect
// ---------------------------------------------------------------------------
//
// `FightScreen` RE-SIMULATES THE WHOLE BOUT every time the player makes a corner
// call or plays a moment. If narration drew from the fight's RNG, every corner
// call would re-narrate the already-displayed prefix with different lines — the
// player would watch the commentary rewrite its own history mid-fight.
//
// §16.6's answer is an independent stream plus two disciplines:
//
//   narrationRng = mulberry32(seedFromString(`${boutSeed}:narration`))
//
//   1. EXACTLY ONE rng.next() PER BEAT, UNCONDITIONALLY — even when only one
//      candidate matches, even when the candidate set is empty and the selector
//      falls all the way back. Divergence at beat k can then never shift the
//      stream for beats before it.
//   2. Beats are walked in order, and selector state (cooldowns, the anti-repeat
//      window) is a pure function of the prefix.
//
// Rule 1 is why `roll` is drawn at the TOP of the per-beat loop, before any
// filtering, and why nothing below it may draw again. Every early return in
// this file happens after that draw. Getting this wrong produces a bug that is
// invisible in a single playthrough and obvious the moment a player makes a
// corner call — which is to say, in front of them.

import { mulberry32, seedFromString } from '../engine/rng';
import type { Beat, BeatFacts } from './beats';
import type { NarrationLine, Predicate, PredicateClause, Voice } from './types';
import { canFill, fillSlots, type SlotContext, type FighterView } from './slots';

export type { FighterView, SlotContext };

export interface NarratedLine {
  /** The beat this line narrates — index into the Beat[] handed in. */
  beatIndex: number;
  round: number;
  lineId: string;
  voice: Voice;
  /** Slots already resolved. Never contains a `{SLOT}`. */
  text: string;
}

/** §16.6's global anti-repeat window: the last 6 line ids, ineligible
 *  regardless of cooldown class. "The window is what actually kills the
 *  'same three lines alternating' failure." */
export const ANTI_REPEAT_WINDOW = 6;

// --- predicates -------------------------------------------------------------

/** Evaluate one structured clause against one fact. */
function clauseHolds(clause: PredicateClause, value: unknown): boolean {
  if ('eq' in clause) return value === clause.eq;
  if ('ne' in clause) return value !== clause.ne;
  if ('in' in clause) return clause.in.some((candidate) => candidate === value);
  // The ordered comparisons are numeric; a non-number fact simply does not match
  // rather than coercing, because '3' > 2 being true is how content bugs hide.
  if (typeof value !== 'number') return false;
  if ('gt' in clause) return value > clause.gt;
  if ('gte' in clause) return value >= clause.gte;
  if ('lt' in clause) return value < clause.lt;
  if ('lte' in clause) return value <= clause.lte;
  return false;
}

/** §16.6: clauses within a predicate are ANDed. A missing fact never matches. */
export function predicateHolds(predicate: Predicate | undefined, facts: BeatFacts): boolean {
  if (!predicate) return true;
  for (const [fact, clause] of Object.entries(predicate)) {
    if (!(fact in facts)) return false;
    if (!clauseHolds(clause, facts[fact])) return false;
  }
  return true;
}

// --- selection state --------------------------------------------------------

interface SelectorState {
  /** cooldown: 'fight' — fired already this bout. */
  usedThisFight: Set<string>;
  /** cooldown: 'round' — fired already this round. */
  usedThisRound: Set<string>;
  currentRound: number;
  /** The last ANTI_REPEAT_WINDOW ids, most recent last. */
  window: string[];
  /** §16.6's colour rule: "never twice consecutively". */
  lastVoice: Voice | null;
}

function freshState(): SelectorState {
  return {
    usedThisFight: new Set(),
    usedThisRound: new Set(),
    currentRound: -1,
    window: [],
    lastVoice: null,
  };
}

function cooldownOf(line: NarrationLine): 'fight' | 'round' | 'none' {
  return line.cooldown ?? 'round'; // §16.6's default
}

function onCooldown(line: NarrationLine, state: SelectorState): boolean {
  const cooldown = cooldownOf(line);
  if (cooldown === 'none') return false;
  if (cooldown === 'fight') return state.usedThisFight.has(line.id);
  return state.usedThisRound.has(line.id);
}

/**
 * §16.6's voice rules for colour, which are hard constraints rather than
 * weights: "never twice consecutively, and never as the first line on a
 * `finish`."
 *
 * The third clause — "fires on roughly one beat in three" — is deliberately NOT
 * enforced here. It is a property of pool composition (§16.6 authors ~60 colour
 * lines against ~260 total) and enforcing it as a rule would need a second
 * rng.next() per beat, breaking the one-draw discipline this file exists to
 * protect. Frequency emerges; the two hard rules are checked.
 */
function voiceAllowed(line: NarrationLine, beat: Beat, state: SelectorState): boolean {
  if (line.voice !== 'colour') return true;
  if (state.lastVoice === 'colour') return false;
  if (beat.kind === 'finish') return false;
  return true;
}

/**
 * §16.6: "Priority EXCLUDES rather than outweighs. If any candidate at priority
 * 2 matches, only priority-2 candidates are eligible. That is how 'he is out
 * cold' beats 'that landed clean' without weight-fiddling."
 */
function topPriorityOnly(lines: NarrationLine[]): NarrationLine[] {
  if (lines.length === 0) return lines;
  const top = Math.max(...lines.map((line) => line.priority ?? 0));
  return lines.filter((line) => (line.priority ?? 0) === top);
}

/**
 * Weighted pick from an already-drawn roll in [0, 1).
 *
 * Takes the roll rather than the RNG, so it is structurally impossible for
 * selection to consume a second draw.
 */
function pickWeighted(lines: NarrationLine[], roll: number): NarrationLine {
  const total = lines.reduce((sum, line) => sum + (line.weight ?? 1), 0);
  let remaining = roll * total;
  for (const line of lines) {
    remaining -= line.weight ?? 1;
    if (remaining < 0) return line;
  }
  return lines[lines.length - 1];
}

// --- the selector -----------------------------------------------------------

export interface NarrateOptions {
  /** The bout's seed. The narration stream is derived from it, never shared. */
  boutSeed: string;
  a: FighterView;
  b: FighterView;
  /**
   * Override the derived stream.
   *
   * Production callers MUST omit this — §16.6 fixes the derivation as
   * `mulberry32(seedFromString(boutSeed + ':narration'))`, and supplying a
   * stream from elsewhere is precisely the bug this module is built to prevent.
   * It exists so tests can instrument the stream and count draws, which is the
   * only way to prove the one-draw-per-beat discipline holds on every path.
   */
  rng?: { next: () => number };
}

/**
 * Narrate a bout's beats.
 *
 * Pure and total: every beat yields exactly one line, no beat throws, and no
 * returned text is empty or contains an unresolved slot. Replaying the same
 * seed with the same beats produces byte-identical output.
 */
export function narrateBeats(
  beats: readonly Beat[],
  lines: readonly NarrationLine[],
  options: NarrateOptions,
): NarratedLine[] {
  const rng = options.rng ?? mulberry32(seedFromString(`${options.boutSeed}:narration`));
  const state = freshState();
  const out: NarratedLine[] = [];

  // Indexed once rather than filtered per beat: 13 kinds against a ~260-line
  // pool, walked ~19 times a bout, is not where the time should go.
  const byKind = new Map<string, NarrationLine[]>();
  for (const line of lines) {
    const bucket = byKind.get(line.on);
    if (bucket) bucket.push(line);
    else byKind.set(line.on, [line]);
  }

  for (const beat of beats) {
    // RULE 1. Drawn here, before any filtering, and never again in this
    // iteration. Every path below — including the total-failure fallback —
    // consumes exactly this one draw.
    const roll = rng.next();

    if (beat.round !== state.currentRound) {
      state.currentRound = beat.round;
      state.usedThisRound.clear();
    }

    const context: SlotContext = {
      a: options.a,
      b: options.b,
      round: beat.round,
      technique: typeof beat.facts.technique === 'string' ? beat.facts.technique : undefined,
    };

    const chosen = selectLine(beat, byKind.get(beat.kind) ?? [], state, context, roll);

    // Record state AFTER the choice, so the window and cooldowns are a pure
    // function of the prefix (rule 2).
    state.usedThisFight.add(chosen.id);
    state.usedThisRound.add(chosen.id);
    state.window.push(chosen.id);
    if (state.window.length > ANTI_REPEAT_WINDOW) state.window.shift();
    state.lastVoice = chosen.voice;

    out.push({
      beatIndex: beat.index,
      round: beat.round,
      lineId: chosen.id,
      voice: chosen.voice,
      text: fillSlots(chosen.text, context),
    });
  }

  return out;
}

/**
 * §16.6's relaxation chain, in the fixed order the spec names.
 *
 * "If filtering empties the candidate set, it relaxes in a fixed order: drop the
 * anti-repeat window, then the cooldown, then fall back to the beat kind's
 * unconditional line."
 *
 * Fixed order matters for replay: a selector that relaxed opportunistically
 * would make the choice depend on which constraint happened to bind, and two
 * runs could differ. Every stage consumes no randomness — the single roll drawn
 * by the caller is passed through to whichever stage succeeds.
 */
function selectLine(
  beat: Beat,
  pool: NarrationLine[],
  state: SelectorState,
  context: SlotContext,
  roll: number,
): NarrationLine {
  // Base eligibility, applied at every stage: the line must be about this beat,
  // its predicate must hold, its slots must all resolve, and the voice rules
  // must permit it.
  const eligible = pool.filter(
    (line) =>
      predicateHolds(line.when, beat.facts) &&
      canFill(line, context) &&
      voiceAllowed(line, beat, state),
  );

  // Stage 0 — everything on.
  const strict = topPriorityOnly(
    eligible.filter((line) => !state.window.includes(line.id) && !onCooldown(line, state)),
  );
  if (strict.length > 0) return pickWeighted(strict, roll);

  // Stage 1 — drop the anti-repeat window.
  const noWindow = topPriorityOnly(eligible.filter((line) => !onCooldown(line, state)));
  if (noWindow.length > 0) return pickWeighted(noWindow, roll);

  // Stage 2 — drop the cooldown too.
  const noCooldown = topPriorityOnly(eligible);
  if (noCooldown.length > 0) return pickWeighted(noCooldown, roll);

  // Stage 3 — the beat kind's unconditional line. §16.6 requires every kind to
  // carry at least one line with `cooldown: 'none'` and no `when`; that floor is
  // what makes this chain terminate, and tests/narration.spec.ts asserts it
  // against the shipped pools.
  //
  // The voice rules are dropped here as well: a `finish` beat whose only
  // remaining line is colour must still narrate, because a silent beat is worse
  // than one in the wrong voice. Slots are NOT dropped — an unfillable line
  // would put "{NICK_A}" on screen, which §16.6 forbids outright.
  const floor = pool.filter(
    (line) => line.cooldown === 'none' && line.when === undefined && canFill(line, context),
  );
  if (floor.length > 0) return pickWeighted(floor, roll);

  // Unreachable against valid content, and deliberately loud rather than a
  // silent empty string: reaching here means a beat kind has no unconditional
  // line, which is a content defect CI is supposed to have caught.
  throw new Error(
    `no narration line for beat kind '${beat.kind}' — every kind needs one line with cooldown 'none' and no 'when' (§16.6)`,
  );
}
