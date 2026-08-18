// wear.ts — Loop 6.6: DESIGN.md §15.4's signature mechanic — "a fighter's face
// is their record." faceWear is a pure function over state that is already
// tracked: condition.injuries, the win/loss record, and fight summaries.
// Nothing here is stored (§2, §15.4, §16.5's wear/marks split at §7.7-time) —
// a career's WearLayers are recomputed from scratch on every render, so they
// can never drift out of sync with the fights that produced them, and the
// assertion "no wear fields in a serialized save" (this loop's verify) holds
// by construction rather than by discipline.
//
// FightSummary carried no per-fighter knockdown signal before this loop —
// DESIGN.md §15.4 is explicit that a missing signal belongs on the summary,
// never smuggled in as a persisted wear object, so knockdownsA/knockdownsB
// were added there (engine/fight.ts) alongside this file.

import type { CareerRecord } from '../../state/store';
import type { Fighter, FightSummary } from '../../engine/types';

export interface WearLayers {
  cauliflowerEar: 0 | 1 | 2;
  browScarring: 0 | 1 | 2 | 3;
  noseBreak: boolean;
  swelling: 0 | 1 | 2; // transient — reflects only the most recent fight
  weathering: 0 | 1 | 2 | 3; // career-length texture, independent of any single result
}

export const NO_WEAR: WearLayers = {
  cauliflowerEar: 0,
  browScarring: 0,
  noseBreak: false,
  swelling: 0,
  weathering: 0,
};

function totalFights(record: CareerRecord): number {
  return record.wins + record.losses + record.draws;
}

function isBroughtOn(summary: FightSummary, fighterId: string): 'a' | 'b' | null {
  if (summary.fighterAId === fighterId) return 'a';
  if (summary.fighterBId === fighterId) return 'b';
  return null;
}

/** Knockdowns THIS fighter absorbed in one fight — the opposite side's tally. */
function knockdownsTaken(summary: FightSummary, side: 'a' | 'b'): number {
  return side === 'a' ? summary.knockdownsB : summary.knockdownsA;
}

function tookBrutalFinish(summary: FightSummary, fighterId: string): boolean {
  return summary.winnerId !== null && summary.winnerId !== fighterId && (summary.method === 'KO' || summary.method === 'TKO');
}

// Cauliflower ear tracks accumulated grappling exposure: rounds spent being
// controlled and submission threats absorbed aren't in FightSummary (they're
// tape-level detail, discarded with the rest of the event log per §2) — the
// fight count itself, gated by archetype, is the honest proxy available here.
// A wrestler or allrounder who has fought a real career picks it up; a pure
// striker with the same record does not, matching what the sport actually
// produces the condition from.
const GRAPPLING_ARCHETYPES = new Set(['wrestler', 'allrounder']);

function computeCauliflowerEar(fighter: Fighter, record: CareerRecord): 0 | 1 | 2 {
  if (!GRAPPLING_ARCHETYPES.has(fighter.archetype)) return 0;
  const fights = totalFights(record);
  if (fights >= 12) return 2;
  if (fights >= 5) return 1;
  return 0;
}

// Brow scarring accumulates with knockdowns absorbed across the whole career
// — every fight in fightHistory contributes, not just the most recent, so
// unlike swelling this never clears.
function computeBrowScarring(fighter: Fighter, fightHistory: readonly FightSummary[]): 0 | 1 | 2 | 3 {
  const totalKnockdownsTaken = fightHistory.reduce((sum, summary) => {
    const side = isBroughtOn(summary, fighter.id);
    return side ? sum + knockdownsTaken(summary, side) : sum;
  }, 0);
  if (totalKnockdownsTaken >= 5) return 3;
  if (totalKnockdownsTaken >= 3) return 2;
  if (totalKnockdownsTaken >= 1) return 1;
  return 0;
}

function computeNoseBreak(fighter: Fighter): boolean {
  return fighter.condition.injuries.some((injury) => injury.bodyPart === 'nose');
}

// Transient: derived only from the single most recent fight, so it reads as
// "how you look right after a hard fight," and clears the moment a new
// (clean) result is recorded — which is what "fades between camps" means in
// a function with no direct access to the calendar (DESIGN.md §15.4 fixes
// faceWear's signature to fighter/record/fightHistory, not career.week).
function computeSwelling(fighter: Fighter, fightHistory: readonly FightSummary[]): 0 | 1 | 2 {
  const last = fightHistory.at(-1);
  if (!last) return 0;
  const side = isBroughtOn(last, fighter.id);
  if (!side) return 0;

  if (tookBrutalFinish(last, fighter.id)) return 2;
  if (knockdownsTaken(last, side) > 0) return 1;
  return 0;
}

// Weathering is the only layer with no gate at all — a flat function of
// career length, same as a real fighter's face changes just from time spent
// training and taking camp-standard wear, win or lose.
function computeWeathering(record: CareerRecord): 0 | 1 | 2 | 3 {
  const fights = totalFights(record);
  if (fights >= 15) return 3;
  if (fights >= 8) return 2;
  if (fights >= 3) return 1;
  return 0;
}

/**
 * Pure: never mutates `fighter`, never reads anything beyond what's already
 * tracked on it (condition.injuries), the career record, and the fight
 * history. Called fresh on every render — see the module header.
 */
export function faceWear(
  fighter: Fighter,
  record: CareerRecord,
  fightHistory: readonly FightSummary[],
): WearLayers {
  return {
    cauliflowerEar: computeCauliflowerEar(fighter, record),
    browScarring: computeBrowScarring(fighter, fightHistory),
    noseBreak: computeNoseBreak(fighter),
    swelling: computeSwelling(fighter, fightHistory),
    weathering: computeWeathering(record),
  };
}
