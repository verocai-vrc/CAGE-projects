import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, Tactics } from '../src/engine/types';
import { applyAftermath } from '../src/career/progression';
import { initialCareerState } from '../src/state/store';
import { archetypes, balance } from '../src/content';

function fighterFromArchetype(id: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture: ${archetypeId}`);
  return {
    id,
    name: id,
    nationality: 'testland',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const player = fighterFromArchetype('player', 'striker');
const opponent = fighterFromArchetype('opponent', 'wrestler');
const emptyTactics: Tactics = {};
const offer = { purse: 5000, hypeReward: 5 };

// Find a seed each way so both branches (win/loss) of the outcome logic are
// exercised deterministically rather than relying on statistics.
function findResult(winnerWanted: 'player' | 'opponent') {
  for (let seed = 1; seed < 500; seed++) {
    const result = simulateFight(player, opponent, emptyTactics, mulberry32(seed));
    if (winnerWanted === 'player' && result.winnerId === player.id) return result;
    if (winnerWanted === 'opponent' && result.winnerId === opponent.id) return result;
  }
  throw new Error(`no seed produced a ${winnerWanted} win within range`);
}

describe('applyAftermath', () => {
  it('a win moves ranking toward the top (lower number)', () => {
    const result = findResult('player');
    const startCareer = { ...initialCareerState, player, ranking: 10 };
    const after = applyAftermath(startCareer, player, result, offer, balance, mulberry32(1));
    expect(after.ranking).not.toBeNull();
    expect(after.ranking as number).toBeLessThan(10);
    expect(after.record.wins).toBe(1);
    expect(after.record.losses).toBe(0);
  });

  it('a loss moves ranking away from the top (higher number)', () => {
    const result = findResult('opponent');
    const startCareer = { ...initialCareerState, player, ranking: 10 };
    const after = applyAftermath(startCareer, player, result, offer, balance, mulberry32(1));
    expect(after.ranking as number).toBeGreaterThan(10);
    expect(after.record.losses).toBe(1);
    expect(after.record.wins).toBe(0);
  });

  it('an unranked fighter earns a ranking on a win but stays unranked on a loss', () => {
    const win = findResult('player');
    const loss = findResult('opponent');
    const startCareer = { ...initialCareerState, player, ranking: null };

    const afterWin = applyAftermath(startCareer, player, win, offer, balance, mulberry32(1));
    expect(afterWin.ranking).not.toBeNull();

    const afterLoss = applyAftermath(startCareer, player, loss, offer, balance, mulberry32(1));
    expect(afterLoss.ranking).toBeNull();
  });

  it('purse is always nonzero — paid regardless of outcome', () => {
    const win = findResult('player');
    const loss = findResult('opponent');
    const startCareer = { ...initialCareerState, player, ranking: 10, purse: 0 };

    expect(applyAftermath(startCareer, player, win, offer, balance, mulberry32(1)).purse).toBeGreaterThan(0);
    expect(applyAftermath(startCareer, player, loss, offer, balance, mulberry32(1)).purse).toBeGreaterThan(0);
  });

  it('a win pays a larger purse than a loss, given the same offer', () => {
    const win = findResult('player');
    const loss = findResult('opponent');
    const startCareer = { ...initialCareerState, player, ranking: 10, purse: 0 };

    const winPurse = applyAftermath(startCareer, player, win, offer, balance, mulberry32(1)).purse;
    const lossPurse = applyAftermath(startCareer, player, loss, offer, balance, mulberry32(1)).purse;
    expect(winPurse).toBeGreaterThan(lossPurse);
  });

  it('injuries (when rolled) attach to condition.injuries', () => {
    const result = findResult('opponent');
    const startCareer = { ...initialCareerState, player, ranking: 10 };
    // Force the injury roll: rng.next() < injuryChanceOnLoss on the first call.
    const forcedInjuryRng = mulberry32(1);
    let after = applyAftermath(startCareer, player, result, offer, balance, forcedInjuryRng);

    // Not every seed rolls an injury — search until one does, then assert shape.
    let found = after.player!.condition.injuries.length > 0;
    for (let seed = 1; !found && seed < 2000; seed++) {
      after = applyAftermath(startCareer, player, result, offer, balance, mulberry32(seed));
      found = after.player!.condition.injuries.length > 0;
    }
    expect(found).toBe(true);
    const injury = after.player!.condition.injuries[0];
    expect(injury.severity).toBeGreaterThanOrEqual(0);
    expect(injury.weeksRemaining).toBeGreaterThanOrEqual(0);
  });

  it('records the fight summary in fightHistory', () => {
    const result = findResult('player');
    const startCareer = { ...initialCareerState, player, ranking: 10 };
    const after = applyAftermath(startCareer, player, result, offer, balance, mulberry32(1));
    expect(after.fightHistory).toHaveLength(1);
    expect(after.fightHistory[0]).toEqual(result.summary);
  });
});
