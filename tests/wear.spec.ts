// wear.spec.ts — Loop 6.6: DESIGN.md §15.4's "a fighter's face is their
// record." faceWear is pure over (fighter, record, fightHistory) — these
// tests exercise that contract directly, plus the two properties the loop's
// verify calls out explicitly: monotonicity (wear never decreases except
// swelling) and that a nose injury in condition.injuries produces the
// nose-break layer.

import { describe, expect, it } from 'vitest';
import { faceWear, NO_WEAR } from '../src/ui/portrait/wear';
import type { Fighter, FightSummary, Injury } from '../src/engine/types';
import type { CareerRecord } from '../src/state/store';
import { applyAftermath } from '../src/career/progression';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import { balance } from '../src/content';
import { CareerStateSchema } from '../src/state/schema';
import { initialCareerState } from '../src/state/store';

function fighter(overrides: Partial<Fighter> = {}): Fighter {
  return {
    id: 'f1',
    name: 'Test Fighter',
    nationality: 'USA',
    face: '000000000',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: {
      power: 50, technique: 50, speed: 50, wrestling: 50,
      groundControl: 50, chin: 50, cardio: 50, fightIQ: 50,
    },
    archetype: 'wrestler',
    weakness: null,
    traits: [],
    condition: { health: 100, injuries: [] },
    ...overrides,
  };
}

const zeroRecord: CareerRecord = { wins: 0, losses: 0, draws: 0, noContests: 0 };

function record(wins: number, losses: number): CareerRecord {
  return { wins, losses, draws: 0, noContests: 0 };
}

function summary(overrides: Partial<FightSummary>): FightSummary {
  return {
    seed: '',
    fighterAId: 'f1',
    fighterBId: 'opp',
    winnerId: 'f1',
    method: 'UD',
    endRound: 3,
    scorecardTotals: [],
    knockdownsA: 0,
    knockdownsB: 0,
    ...overrides,
  };
}

describe('faceWear: debut', () => {
  it('a fighter with no fights and no injuries has zero wear', () => {
    expect(faceWear(fighter(), zeroRecord, [])).toEqual(NO_WEAR);
  });
});

describe('faceWear: noseBreak', () => {
  it('renders the nose-break layer when condition.injuries has a nose injury', () => {
    const nose: Injury = { id: 'i1', bodyPart: 'nose', severity: 30, weeksRemaining: 2 };
    const wear = faceWear(fighter({ condition: { health: 90, injuries: [nose] } }), record(3, 1), []);
    expect(wear.noseBreak).toBe(true);
  });

  it('does not render the nose-break layer for a fighter with no nose injury', () => {
    const hand: Injury = { id: 'i1', bodyPart: 'hand', severity: 30, weeksRemaining: 2 };
    const wear = faceWear(fighter({ condition: { health: 90, injuries: [hand] } }), record(3, 1), []);
    expect(wear.noseBreak).toBe(false);
  });

  it('the real injury pool (career/progression.ts) can produce a nose injury', () => {
    // Guards against the two files drifting apart silently: if 'nose' were
    // ever removed from INJURY_BODY_PARTS, noseBreak would become dead code
    // with no test failure elsewhere to catch it.
    const player = fighter({ id: 'player', condition: { health: 100, injuries: [] } });
    const opponent = fighter({ id: 'opp' });
    let sawNose = false;
    for (let seed = 1; seed <= 2000 && !sawNose; seed++) {
      const result = simulateFight(player, opponent, {}, mulberry32(seed));
      const after = applyAftermath(
        { ...initialCareerState, player },
        player,
        result,
        { purse: 5000, hypeReward: 5 },
        { ...balance, injuryChanceOnWin: 1, injuryChanceOnLoss: 1 },
        mulberry32(seed),
      );
      if (after.player?.condition.injuries.some((i) => i.bodyPart === 'nose')) sawNose = true;
    }
    expect(sawNose).toBe(true);
  });
});

describe('faceWear: monotonicity', () => {
  // Every layer except swelling must never decrease as a career's fight
  // history only grows — this is the loop's explicit verify.
  it('cauliflowerEar, browScarring, noseBreak, and weathering never decrease across a growing career', () => {
    const f = fighter();
    let history: FightSummary[] = [];
    let rec = zeroRecord;
    let prev = faceWear(f, rec, history);

    for (let i = 0; i < 20; i++) {
      const tookKnockdown = i % 3 === 0;
      history = [...history, summary({ knockdownsB: tookKnockdown ? 1 : 0 })];
      rec = record(rec.wins + 1, rec.losses);
      const next = faceWear(f, rec, history);

      expect(next.cauliflowerEar).toBeGreaterThanOrEqual(prev.cauliflowerEar);
      expect(next.browScarring).toBeGreaterThanOrEqual(prev.browScarring);
      expect(next.noseBreak || !prev.noseBreak).toBe(true); // false -> true allowed, never true -> false
      expect(next.weathering).toBeGreaterThanOrEqual(prev.weathering);
      prev = next;
    }

    // Sanity: the run above actually moved at least one permanent layer,
    // otherwise the >= assertions above would be vacuously true throughout.
    expect(prev.weathering).toBeGreaterThan(NO_WEAR.weathering);
  });

  it('swelling is the documented exception — it can go up, then back down to zero', () => {
    const f = fighter();
    const rec = record(2, 0);

    const afterBrutalLoss = faceWear(f, rec, [summary({ winnerId: 'opp', method: 'TKO' })]);
    expect(afterBrutalLoss.swelling).toBeGreaterThan(0);

    const afterCleanWinFollows = faceWear(
      f,
      record(3, 0),
      [summary({ winnerId: 'opp', method: 'TKO' }), summary({ winnerId: 'f1', method: 'UD' })],
    );
    expect(afterCleanWinFollows.swelling).toBe(0);
  });
});

describe('faceWear: distinguishable at debut / mid-career / after a brutal run', () => {
  it('the same fighter reads differently at three points in a career', () => {
    const f = fighter();
    const debut = faceWear(f, zeroRecord, []);

    const midHistory = Array.from({ length: 6 }, (_, i) => summary({ knockdownsB: i % 2 === 0 ? 1 : 0 }));
    const mid = faceWear(f, record(4, 2), midHistory);

    const brutalHistory = [
      ...midHistory,
      ...Array.from({ length: 8 }, () => summary({ knockdownsB: 1 })),
      summary({ winnerId: 'opp', method: 'TKO' }),
    ];
    const brutal = faceWear(f, record(9, 6), brutalHistory);

    expect(mid).not.toEqual(debut);
    expect(brutal).not.toEqual(mid);
    expect(brutal).not.toEqual(debut);
  });
});

describe('faceWear: never persisted', () => {
  it('no wear field appears anywhere in a schema-valid serialized CareerState', () => {
    const player = fighter({ id: 'player', condition: { health: 80, injuries: [] } });
    const career = {
      ...initialCareerState,
      player,
      record: record(4, 2),
      fightHistory: [summary({ knockdownsB: 1 }), summary({ winnerId: 'opp', method: 'TKO' })],
    };
    expect(CareerStateSchema.safeParse(career).success).toBe(true);

    const serialized = JSON.stringify(career);
    for (const key of Object.keys(NO_WEAR)) {
      expect(serialized).not.toContain(key);
    }
  });
});
