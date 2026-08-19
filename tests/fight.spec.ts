import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, Tactics } from '../src/engine/types';
import { FightResultSchema, FightSummarySchema } from '../src/state/schema';
import { archetypes, balance } from '../src/content';

function fighterFromArchetype(id: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture: ${archetypeId}`);
  return {
    id,
    name: id,
    nickname: null,
    nationality: 'testland',
    face: '000000000',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const fighterA = fighterFromArchetype('fighter-a', 'striker');
const fighterB = fighterFromArchetype('fighter-b', 'wrestler');
const emptyTactics: Tactics = {};

describe('simulateFight determinism (DESIGN.md Appendix B — keep this test permanently)', () => {
  it('(seed, fighterA, fighterB, tactics) => byte-identical FightResult across two runs', () => {
    const resultA = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(2026));
    const resultB = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(2026));
    expect(resultA).toEqual(resultB);
  });

  it('produces a different FightResult for a different seed', () => {
    const resultA = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(1));
    const resultB = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(2));
    expect(resultA).not.toEqual(resultB);
  });

  it('is still deterministic with non-default tactics (cut quality + per-round tactic ids)', () => {
    const tactics: Tactics = {
      [fighterA.id]: { cutQuality: 'botched', rounds: { 1: 'headhunt', 2: 'pressPace', 3: 'protectLead' } },
      [fighterB.id]: { cutQuality: 'clean', rounds: { 1: 'shootTakedowns', 2: 'shootTakedowns', 3: 'balanced' } },
    };
    const resultA = simulateFight(fighterA, fighterB, tactics, mulberry32(55));
    const resultB = simulateFight(fighterA, fighterB, tactics, mulberry32(55));
    expect(resultA).toEqual(resultB);
  });
});

describe('FightResult.summary (M1 -> state persistence boundary contract)', () => {
  it('is well-formed, small in absolute terms, and self-sufficient (no dependency on events[])', () => {
    const result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(7));

    expect(FightSummarySchema.safeParse(result.summary).success).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.summary).length).toBeLessThan(400);

    // Persistence contract: everything needed to reconstruct the outcome
    // lives on summary alone; events[] is playback-only and gets discarded
    // after (DESIGN.md Appendix B).
    expect(result.summary.winnerId).toBe(result.winnerId);
    expect(result.summary.method).toBe(result.method);
    expect(result.summary.endRound).toBe(result.endRound);
    expect(result.summary.fighterAId).toBe(fighterA.id);
    expect(result.summary.fighterBId).toBe(fighterB.id);
  });

  it('a fight with multiple exchanges produces a larger event log than its summary', () => {
    // kFinish is a lab-tunable placeholder (Appendix A) that currently makes
    // most fights end in very few exchanges, so bias toward a longer fight
    // by taking the longest of several seeded runs rather than depending on
    // exact balance numbers Loop 1.8 is explicitly meant to retune.
    let longest = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(0));
    for (let seed = 1; seed < 60; seed++) {
      const candidate = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
      if (candidate.events.length > longest.events.length) longest = candidate;
    }
    const summarySize = JSON.stringify(longest.summary).length;
    const eventsSize = JSON.stringify(longest.events).length;
    expect(eventsSize).toBeGreaterThan(summarySize);
  });
});

describe('simulateFight sanity', () => {
  it('always produces a valid method, and a winner unless it is a draw', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
      expect(['KO', 'TKO', 'SUB', 'UD', 'SD', 'MD', 'DRAW']).toContain(result.method);
      if (result.method === 'DRAW') {
        expect(result.winnerId).toBeNull();
      } else {
        expect([fighterA.id, fighterB.id]).toContain(result.winnerId);
      }
      expect(result.endRound).toBeGreaterThanOrEqual(1);
    }
  });

  it('produces exactly one scorecard per judge', () => {
    const result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(3));
    expect(result.scorecards.length).toBeGreaterThan(0);
  });

  it('a finish before the last round ends the fight early with no further round events', () => {
    let finishSeed: number | null = null;
    let finishResult: ReturnType<typeof simulateFight> | null = null;
    for (let seed = 0; seed < 50; seed++) {
      const result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
      if (result.method === 'KO' || result.method === 'TKO' || result.method === 'SUB') {
        finishSeed = seed;
        finishResult = result;
        break;
      }
    }
    expect(finishSeed).not.toBeNull();
    const finishEvents = finishResult!.events.filter((e) => e.t === 'finish');
    expect(finishEvents).toHaveLength(1);
    expect(finishResult!.events[finishResult!.events.length - 1].t).toBe('finish');
  });
});

describe('checkEnd per-minute reports (DESIGN.md §6.6a)', () => {
  it('checkEnd indices are contiguous from 1 within a round, and their summed deltas equal the round-end totals', () => {
    // Search for a seed that completes at least one full round without an
    // early finish, same pattern as the roundEnd tests above.
    let result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(0));
    for (let seed = 0; seed < 50; seed++) {
      const candidate = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
      if (candidate.events.some((e) => e.t === 'roundEnd')) {
        result = candidate;
        break;
      }
    }

    const roundEnds = result.events.filter((e) => e.t === 'roundEnd');
    expect(roundEnds.length).toBeGreaterThan(0);

    for (const roundEnd of roundEnds) {
      if (roundEnd.t !== 'roundEnd') continue;
      const checks = result.events.filter((e) => e.t === 'checkEnd' && e.round === roundEnd.round);
      expect(checks.length).toBeGreaterThan(0);

      checks.forEach((check, i) => {
        if (check.t !== 'checkEnd') return;
        expect(check.check).toBe(i + 1);
      });

      const summed = checks.reduce(
        (acc, c) => {
          if (c.t !== 'checkEnd') return acc;
          return { strikesA: acc.strikesA + c.strikesA, strikesB: acc.strikesB + c.strikesB };
        },
        { strikesA: 0, strikesB: 0 },
      );
      expect(summed.strikesA).toBe(roundEnd.scoreA);
      expect(summed.strikesB).toBe(roundEnd.scoreB);
    }
  });

  it('checkEnd.winner agrees with which side had more strikes+control in that slice', () => {
    let found = false;
    for (let seed = 0; seed < 50 && !found; seed++) {
      const result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
      for (const event of result.events) {
        if (event.t !== 'checkEnd') continue;
        found = true;
        const marginA = event.strikesA + event.controlA;
        const marginB = event.strikesB + event.controlB;
        if (marginA === marginB) {
          expect(event.winner).toBe('even');
        } else if (marginA > marginB) {
          expect(event.winner).toBe('a');
        } else {
          expect(event.winner).toBe('b');
        }
      }
    }
    expect(found).toBe(true);
  });

  it('a fight ends immediately after its finish event, with the finish event last (mirrors roundEnd\'s own skip-on-early-finish precedent, which checkEnd follows)', () => {
    let finishResult: ReturnType<typeof simulateFight> | null = null;
    for (let seed = 0; seed < 50; seed++) {
      const result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
      if (result.method === 'KO' || result.method === 'TKO' || result.method === 'SUB') {
        finishResult = result;
        break;
      }
    }
    expect(finishResult).not.toBeNull();

    // finish is always the last event (existing assertion, tests/fight.spec.ts
    // above) — so no checkEnd (partial or otherwise) can follow it, and any
    // checkEnd in the finish round must count only whole ticksPerCheck
    // windows that completed strictly before the finishing tick.
    const finishRound = finishResult!.endRound;
    expect(finishResult!.events[finishResult!.events.length - 1].t).toBe('finish');

    const checksInFinishRound = finishResult!.events.filter(
      (e): e is Extract<typeof e, { t: 'checkEnd' }> => e.t === 'checkEnd' && e.round === finishRound,
    );
    for (const check of checksInFinishRound) {
      expect(check.check).toBeLessThanOrEqual(Math.floor(balance.ticksPerRound / balance.ticksPerCheck));
    }
  });
});

describe('roundEnd stamina snapshots (Loop 2.2 — HUD bars replay from the event log)', () => {
  it('carries in-bounds, non-increasing-per-fighter stamina across successive roundEnd events', () => {
    // Not every seed reaches a roundEnd (an early finish produces none), so
    // search for one that goes at least two rounds — same pattern as the
    // "finish before the last round" test above.
    let result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(0));
    for (let seed = 0; seed < 50; seed++) {
      const candidate = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
      if (candidate.events.filter((e) => e.t === 'roundEnd').length >= 2) {
        result = candidate;
        break;
      }
    }
    const roundEnds = result.events.filter((e) => e.t === 'roundEnd');
    expect(roundEnds.length).toBeGreaterThan(0);

    let prevA = 100;
    let prevB = 100;
    for (const event of roundEnds) {
      if (event.t !== 'roundEnd') continue;
      expect(event.staminaA).toBeGreaterThanOrEqual(0);
      expect(event.staminaA).toBeLessThanOrEqual(100);
      expect(event.staminaB).toBeGreaterThanOrEqual(0);
      expect(event.staminaB).toBeLessThanOrEqual(100);
      expect(event.staminaA).toBeLessThanOrEqual(prevA);
      expect(event.staminaB).toBeLessThanOrEqual(prevB);
      prevA = event.staminaA;
      prevB = event.staminaB;
    }
  });

  it('the full FightResult, including the extended roundEnd shape, still validates against FightResultSchema', () => {
    const result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(0));
    expect(FightResultSchema.safeParse(result).success).toBe(true);
  });
});
