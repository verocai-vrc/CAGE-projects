// Loop 7.4 — records on `Fighter`, single-sourced (DESIGN.md §16.5).
//
// Two defects, one change. Generated opponents had no record at all, which left
// the §15.8 FighterIdentity component's record slot unfillable and made an
// opponent unreadable as a person — a name and a face with no history behind
// them. And the player's record lived on `CareerState`, a second copy of a fact
// that also belongs on the fighter: "two copies of a fighter's record is a drift
// bug waiting for a long career."
//
// §16.5 explicitly discards the alternative — "keeping both and testing that
// they agree" — as a description of the bug rather than a fix. So there is no
// agreement test here. `CareerState.record` is gone, and the test that guards
// that is a grep, in the last describe block.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, FightResult, Tactics } from '../src/engine/types';
import { archetypes, balance } from '../src/content';
import { generateOpponent, type NamePool } from '../src/career/matchmaking';
import { applyAftermath, startCareer } from '../src/career/progression';
import { initialCareerState } from '../src/state/store';
import { FighterSchema, CareerStateSchema } from '../src/state/schema';

const namePools: NamePool[] = [
  {
    nationality: 'usa',
    weight: 1,
    firstNames: ['Al', 'Bo', 'Cy', 'Dee', 'Eli', 'Flo'],
    lastNames: ['Fox', 'Grey', 'Hale', 'Ives', 'Jones', 'Kerr'],
  },
];
const templates = archetypes.map((a) => ({ id: a.id, weight: a.weight, attributes: a.attributes }));
const drawFace = (rng: { next: () => number }) => String(Math.floor(rng.next() * 1e9)).padStart(9, '0');

function opponentsAt(ranking: number | null, count: number): Fighter[] {
  return Array.from({ length: count }, (_, i) =>
    generateOpponent(templates, namePools, mulberry32(i), { weightClass: 'lightweight', ranking }, drawFace),
  );
}

const totalFights = (f: Fighter) => f.record.wins + f.record.losses + f.record.draws + f.record.noContests;
const winRate = (f: Fighter) => f.record.wins / totalFights(f);
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

describe('generated opponents carry a record (§16.5)', () => {
  const champions = opponentsAt(1, 300);
  const bottom = opponentsAt(15, 300);
  const unranked = opponentsAt(null, 300);

  it('no opponent is 0-0 — every one of them has been in a fight', () => {
    for (const fighter of [...champions, ...bottom, ...unranked]) {
      expect(totalFights(fighter)).toBeGreaterThan(0);
      // And nobody is undefeated or winless: both read as a different fighter
      // than the one matchmaking is offering.
      expect(fighter.record.wins).toBeGreaterThan(0);
      expect(fighter.record.losses).toBeGreaterThan(0);
    }
  });

  it('opponents at ladder position 1 carry better records than those at 15', () => {
    // Better in both senses a record carries: longer, and won more often.
    expect(mean(champions.map(totalFights))).toBeGreaterThan(mean(bottom.map(totalFights)));
    expect(mean(champions.map(winRate))).toBeGreaterThan(mean(bottom.map(winRate)));
  });

  it('an unranked opponent is no better than the bottom of the ladder', () => {
    // `null` sits just below #15 rather than off the scale: ladderStrength is
    // 0 for unranked and 1/15 at the bottom rung, so the shapes are adjacent.
    // That is the point — stepping off the ladder should not be a cliff.
    expect(mean(unranked.map(totalFights))).toBeLessThanOrEqual(mean(bottom.map(totalFights)));
    expect(mean(unranked.map(winRate))).toBeLessThanOrEqual(mean(bottom.map(winRate)) + 0.02);
    expect(mean(bottom.map(totalFights)) - mean(unranked.map(totalFights))).toBeLessThan(3);
  });

  it('records vary within a rank — two fighters at #1 are not the same fighter', () => {
    const distinct = new Set(champions.map((f) => `${f.record.wins}-${f.record.losses}-${f.record.draws}`));
    expect(distinct.size).toBeGreaterThan(10);
  });

  it('the draw is deterministic for a seed', () => {
    const [once] = opponentsAt(5, 1);
    const [twice] = opponentsAt(5, 1);
    expect(once.record).toEqual(twice.record);
  });

  it('every generated opponent is still schema-valid', () => {
    for (const fighter of champions.slice(0, 50)) {
      expect(FighterSchema.safeParse(fighter).success).toBe(true);
    }
  });
});

describe('applyAftermath writes the record on the fighter', () => {
  const player = startCareer(
    {
      statDeltas: {},
      archetype: 'allrounder',
      weakness: null,
      mentorGymId: 'neighborhood-gym',
      hypeModifier: 0,
      amateurRecord: { wins: 4, losses: 1 },
    },
    'RECORDSEED',
    'player-1',
    'Test Fighter',
  ).player!;

  const opponent: Fighter = { ...opponentsAt(10, 1)[0], id: 'opp-1' };
  const noTactics: Tactics = {};
  const offer = { purse: 5000, hypeReward: 5 };

  /** The first seed whose bout ends the way we need to test. */
  function resultWhere(predicate: (r: FightResult) => boolean): FightResult {
    for (let seed = 1; seed < 4000; seed++) {
      const result = simulateFight(player, opponent, noTactics, mulberry32(seed));
      if (predicate(result)) return result;
    }
    throw new Error('no seed produced the required outcome');
  }

  const base = { ...initialCareerState, player, ranking: 10 };
  const after = (result: FightResult) =>
    applyAftermath(base, player, result, offer, balance, mulberry32(1)).player!.record;

  it('a debuting player starts 0-0 — the amateur record is narration, not a pro record', () => {
    expect(player.record).toEqual({ wins: 0, losses: 0, draws: 0, noContests: 0 });
  });

  it('a win increments wins and nothing else', () => {
    expect(after(resultWhere((r) => r.winnerId === player.id))).toEqual({
      wins: 1, losses: 0, draws: 0, noContests: 0,
    });
  });

  it('a loss increments losses and nothing else', () => {
    expect(after(resultWhere((r) => r.winnerId === opponent.id))).toEqual({
      wins: 0, losses: 1, draws: 0, noContests: 0,
    });
  });

  it('a draw increments draws and nothing else', () => {
    expect(after(resultWhere((r) => r.winnerId === null))).toEqual({
      wins: 0, losses: 0, draws: 1, noContests: 0,
    });
  });

  it('accumulates across bouts rather than overwriting', () => {
    const win = resultWhere((r) => r.winnerId === player.id);
    const first = applyAftermath(base, player, win, offer, balance, mulberry32(1));
    const second = applyAftermath(first, first.player!, win, offer, balance, mulberry32(2));
    expect(second.player!.record.wins).toBe(2);
  });

  it('an aftermath that also rolls an injury still carries the record forward', () => {
    // The record and the injury are written into the same updated Fighter; an
    // earlier shape wrote them in two places and one could shadow the other.
    const loss = resultWhere((r) => r.winnerId === opponent.id);
    for (let seed = 1; seed < 2000; seed++) {
      const next = applyAftermath(base, player, loss, offer, balance, mulberry32(seed));
      if (next.player!.condition.injuries.length > 0) {
        expect(next.player!.record.losses).toBe(1);
        return;
      }
    }
    throw new Error('no seed rolled an injury');
  });
});

describe('there is exactly one record (§16.5)', () => {
  it('CareerState has no record field', () => {
    expect('record' in initialCareerState).toBe(false);
  });

  it('CareerStateSchema rejects nothing but also stores nothing under `record`', () => {
    const parsed = CareerStateSchema.parse({ ...initialCareerState, record: { wins: 9 } });
    expect('record' in parsed).toBe(false);
  });

  it('no source file reads `career.record` any more', () => {
    // The grep §16.5's verify calls for, as a test rather than a habit. Comments
    // are allowed to mention the old shape — that is how the move stays
    // explicable — so only real code is searched.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) {
          readFileSync(path, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
              if (/\bcareer\.record\b/.test(code)) offenders.push(`${path}:${i + 1}`);
            });
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});

describe('the engine never reads a record (Appendix B)', () => {
  it('rewriting both fighters\' records does not change a single bout', () => {
    // `record` is flavour, exactly like nationality, stance, and face. The
    // guarantee is stronger than "the engine has no reason to read it": the
    // event log has to be byte-identical.
    const base = (record: Fighter['record']): Fighter => ({
      ...opponentsAt(3, 1)[0],
      id: 'a',
      record,
    });
    const other = (record: Fighter['record']): Fighter => ({
      ...opponentsAt(12, 1)[0],
      id: 'b',
      record,
    });

    const debutants = simulateFight(
      base({ wins: 1, losses: 1, draws: 0, noContests: 0 }),
      other({ wins: 1, losses: 1, draws: 0, noContests: 0 }),
      {},
      mulberry32(31337),
    );
    const veterans = simulateFight(
      base({ wins: 30, losses: 2, draws: 1, noContests: 1 }),
      other({ wins: 4, losses: 19, draws: 0, noContests: 0 }),
      {},
      mulberry32(31337),
    );

    expect(veterans.events).toEqual(debutants.events);
    expect(veterans.method).toBe(debutants.method);
    expect(veterans.winnerId).toBe(debutants.winnerId);
  });
});
