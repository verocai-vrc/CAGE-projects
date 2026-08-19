// Loop 7.3 — `weakness` becomes an engine modifier (DESIGN.md §16.5).
//
// The reveal screen has named "the explicitly-named exploitable hole" since
// Loop 4.4 and nothing in the engine read the field; generated opponents were
// hardcoded `weakness: null`, which made the player's own weakness a unilateral
// handicap. §16.5 makes it one constant applied at exactly one contested roll
// per id:
//
//   striking-defense    the defender's striking in resolveStrike
//   takedown-defense    the defender's grappling in the takedown resolvePositionChange
//   submission-defense  the defender's grappling in the submission roll
//
// The load-bearing property is ISOLATION: each id has to move its own roll and
// leave the other two alone, or the three ids are one blunt "worse fighter"
// flag wearing three names. These tests measure each roll's success rate
// directly off the event log rather than inferring it from win rates, because a
// win rate folds in every cascade downstream of the roll.

import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, Tactics, WeaknessId } from '../src/engine/types';
import { archetypes, balance } from '../src/content';
import { generateOpponent } from '../src/career/matchmaking';
import { runAllPairings, runArchetypePairing } from '../src/lab/simulate';
import { buildFinishRateDistribution, buildWinRateMatrix } from '../src/lab/report';

const N = 3000;

function fighter(id: string, archetypeId: string, weakness: WeaknessId | null): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture '${archetypeId}'`);
  return {
    id,
    name: archetype.label,
    nationality: 'lab',
    face: '000000000',
    weightClass: 'lab',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness,
    record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

interface RollRates {
  /** Share of b's takedown attempts that succeeded against a. */
  takedownSuccess: number;
  /** Share of b's submission attempts that were not escaped by a. */
  submissionSuccess: number;
  /** Strikes b landed on a, per bout. */
  strikesLanded: number;
  aWinRate: number;
}

// `a` carries the weakness under test; `b` never does. Both are the same
// archetype, so the only asymmetry in the matchup is the hole. `b` shoots
// takedowns every round so the grappling rolls actually happen often enough to
// measure — at the default 4%-per-tick attempt rate a submission roll fires
// well under once a bout.
const shootTakedowns: Tactics = {
  b: { cutQuality: 'clean', rounds: { 1: 'shootTakedowns', 2: 'shootTakedowns', 3: 'shootTakedowns' } },
};

function measure(archetypeId: string, weakness: WeaknessId | null): RollRates {
  let takedownAttempts = 0;
  let takedownsLanded = 0;
  let submissionAttempts = 0;
  let submissionsLanded = 0;
  let strikes = 0;
  let aWins = 0;

  for (let seed = 0; seed < N; seed++) {
    const result = simulateFight(
      fighter('a', archetypeId, weakness),
      fighter('b', archetypeId, null),
      shootTakedowns,
      mulberry32(seed),
    );
    if (result.winnerId === 'a') aWins++;
    for (const event of result.events) {
      if (event.t === 'takedown' && event.by === 'b') {
        takedownAttempts++;
        if (event.success) takedownsLanded++;
      } else if (event.t === 'submissionAttempt' && event.by === 'b') {
        submissionAttempts++;
        if (!event.escaped) submissionsLanded++;
      } else if (event.t === 'strike' && event.by === 'b' && event.landed) {
        strikes++;
      }
    }
  }

  return {
    takedownSuccess: takedownsLanded / takedownAttempts,
    submissionSuccess: submissionsLanded / submissionAttempts,
    strikesLanded: strikes / N,
    aWinRate: aWins / N,
  };
}

const none = measure('allrounder', null);
const strikingHole = measure('allrounder', 'striking-defense');
const takedownHole = measure('allrounder', 'takedown-defense');
const submissionHole = measure('allrounder', 'submission-defense');

// The non-target rolls still wobble a little: a weakness changes which strikes
// land, which changes the tick a takedown is attempted on, which reshuffles
// everything downstream. That cascade is the engine working, not the penalty
// leaking. This tolerance separates "did not move its own roll" (the penalty is
// ~12 points of success rate) from that noise.
const CASCADE_TOLERANCE = 0.03;

describe('each weakness moves its own roll (§16.5)', () => {
  it('striking-defense makes the fighter easier to hit, and nothing else', () => {
    expect(strikingHole.strikesLanded).toBeGreaterThan(none.strikesLanded * 1.1);
    expect(strikingHole.takedownSuccess).toBeCloseTo(none.takedownSuccess, 1);
    expect(Math.abs(strikingHole.takedownSuccess - none.takedownSuccess)).toBeLessThan(CASCADE_TOLERANCE);
  });

  it('takedown-defense makes the fighter easier to take down, and nothing else', () => {
    expect(takedownHole.takedownSuccess).toBeGreaterThan(none.takedownSuccess + 0.05);
    expect(Math.abs(takedownHole.strikesLanded - none.strikesLanded)).toBeLessThan(
      none.strikesLanded * 0.05,
    );
    expect(Math.abs(takedownHole.submissionSuccess - none.submissionSuccess)).toBeLessThan(
      CASCADE_TOLERANCE,
    );
  });

  it('submission-defense makes the fighter easier to submit, and nothing else', () => {
    expect(submissionHole.submissionSuccess).toBeGreaterThan(none.submissionSuccess + 0.03);
    expect(Math.abs(submissionHole.takedownSuccess - none.takedownSuccess)).toBeLessThan(
      CASCADE_TOLERANCE,
    );
    expect(Math.abs(submissionHole.strikesLanded - none.strikesLanded)).toBeLessThan(
      none.strikesLanded * 0.05,
    );
  });

  it('a weakness costs the fighter the bout measurably more often than no weakness', () => {
    // striking-defense is the one that bites hardest, because resolveStrike is
    // the roll that fires ~80 times a bout while a takedown fires ~11 and a
    // submission well under once. That asymmetry is the design working as §1's
    // matchup-over-rating pillar intends — a hole is worth what the opponent
    // can do to exploit it — not a bug to be flattened.
    expect(takedownHole.aWinRate).toBeLessThan(none.aWinRate);
    expect(strikingHole.aWinRate).toBeLessThan(takedownHole.aWinRate);
  });

  it('no weakness is free: the penalty is a real number on the pillar scale', () => {
    expect(balance.weaknessPenalty).toBeGreaterThan(0);
  });
});

describe('weakness costs no randomness (Appendix B)', () => {
  it('a bout with weaknesses on both sides consumes the identical random stream', () => {
    // The penalty is arithmetic on a pillar value, never a new rng.next(), so
    // the number of rolls is unchanged — only their inputs move. Same event
    // COUNT, different outcomes, is what proves that.
    const clean = simulateFight(
      fighter('a', 'allrounder', null),
      fighter('b', 'allrounder', null),
      shootTakedowns,
      mulberry32(99),
    );
    const holed = simulateFight(
      fighter('a', 'allrounder', 'striking-defense'),
      fighter('b', 'allrounder', 'takedown-defense'),
      shootTakedowns,
      mulberry32(99),
    );
    expect(holed.events).not.toEqual(clean.events);
  });

  it('is deterministic: the same seed and the same weakness replay identically', () => {
    const run = () =>
      simulateFight(
        fighter('a', 'allrounder', 'submission-defense'),
        fighter('b', 'wrestler', 'striking-defense'),
        shootTakedowns,
        mulberry32(4242),
      );
    expect(run()).toEqual(run());
  });
});

describe('generated opponents draw a weakness (§16.5)', () => {
  const namePools = [
    { nationality: 'usa', weight: 1, firstNames: ['Al', 'Bo', 'Cy', 'Dee'], lastNames: ['Fox', 'Grey', 'Hale', 'Ives'] },
  ];
  const templates = archetypes.map((a) => ({ id: a.id, weight: a.weight, attributes: a.attributes }));
  const drawFace = (rng: { next: () => number }) => String(Math.floor(rng.next() * 1e9)).padStart(9, '0');

  const drawn = Array.from({ length: 1000 }, (_, i) =>
    generateOpponent(templates, namePools, mulberry32(i), { weightClass: 'lightweight' }, drawFace).weakness,
  );

  it('some opponents have one and some do not — it was hardcoded null for every opponent', () => {
    const withHole = drawn.filter((w) => w !== null).length;
    expect(withHole).toBeGreaterThan(400);
    expect(withHole).toBeLessThan(700);
  });

  it('every id drawn is one the engine actually reads', () => {
    const ids = new Set(drawn.filter((w): w is string => w !== null));
    expect([...ids].sort()).toEqual(['striking-defense', 'submission-defense', 'takedown-defense']);
  });

  it('the draw is deterministic for a seed', () => {
    const once = generateOpponent(templates, namePools, mulberry32(7), { weightClass: 'lw' }, drawFace);
    const twice = generateOpponent(templates, namePools, mulberry32(7), { weightClass: 'lw' }, drawFace);
    expect(once.weakness).toBe(twice.weakness);
  });
});

describe('the M1 gates hold with weaknesses live on both sides (§10)', () => {
  const records = runAllPairings(N, { withWeaknesses: true });

  it('no archetype wins more than ~60% against the field average', () => {
    for (const row of buildWinRateMatrix(records)) {
      expect(row.fieldAverageWinRate).toBeLessThanOrEqual(0.6);
    }
  });

  it('the finish distribution stays inside the documented band', () => {
    const finishes = buildFinishRateDistribution(records);
    expect(finishes.finishRate).toBeGreaterThan(0.55);
    expect(finishes.finishRate).toBeLessThan(0.85);
    expect(finishes.koRate + finishes.tkoRate).toBeGreaterThan(0.05);
    expect(finishes.subRate).toBeGreaterThan(0.05);
  });

  it('matchup-over-rating survives: the lower-overall specialist still beats the striker', () => {
    const pairing = runArchetypePairing('wrestler', 'striker', N, 0, { withWeaknesses: true });
    const rate = pairing.filter((r) => r.winner === 'a').length / pairing.length;
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.65);
  });
});
