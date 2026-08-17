import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Attributes, Fighter, Origin, Tactics } from '../src/engine/types';
import { applyAftermath, checkRetirement, startCareer } from '../src/career/progression';
import { initialCareerState } from '../src/state/store';
import { archetypes, balance } from '../src/content';

const testOrigin: Origin = {
  statDeltas: { power: 8, technique: 10, speed: 6, cardio: 6, chin: 4, fightIQ: 6 },
  archetype: 'allrounder',
  weakness: null,
  mentorGymId: 'iron-gate-gym',
  hypeModifier: 5,
  amateurRecord: { wins: 3, losses: 1 },
};

function fighterFromArchetype(id: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture: ${archetypeId}`);
  return {
    id,
    name: id,
    nationality: 'testland',
    face: '000000000',
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
    const baseCareer = { ...initialCareerState, player, ranking: 10 };
    const after = applyAftermath(baseCareer, player, result, offer, balance, mulberry32(1));
    expect(after.ranking).not.toBeNull();
    expect(after.ranking as number).toBeLessThan(10);
    expect(after.record.wins).toBe(1);
    expect(after.record.losses).toBe(0);
  });

  it('a loss moves ranking away from the top (higher number)', () => {
    const result = findResult('opponent');
    const baseCareer = { ...initialCareerState, player, ranking: 10 };
    const after = applyAftermath(baseCareer, player, result, offer, balance, mulberry32(1));
    expect(after.ranking as number).toBeGreaterThan(10);
    expect(after.record.losses).toBe(1);
    expect(after.record.wins).toBe(0);
  });

  it('an unranked fighter earns a ranking on a win but stays unranked on a loss', () => {
    const win = findResult('player');
    const loss = findResult('opponent');
    const baseCareer = { ...initialCareerState, player, ranking: null };

    const afterWin = applyAftermath(baseCareer, player, win, offer, balance, mulberry32(1));
    expect(afterWin.ranking).not.toBeNull();

    const afterLoss = applyAftermath(baseCareer, player, loss, offer, balance, mulberry32(1));
    expect(afterLoss.ranking).toBeNull();
  });

  it('purse is always nonzero — paid regardless of outcome', () => {
    const win = findResult('player');
    const loss = findResult('opponent');
    const baseCareer = { ...initialCareerState, player, ranking: 10, purse: 0 };

    expect(applyAftermath(baseCareer, player, win, offer, balance, mulberry32(1)).purse).toBeGreaterThan(0);
    expect(applyAftermath(baseCareer, player, loss, offer, balance, mulberry32(1)).purse).toBeGreaterThan(0);
  });

  it('a win pays a larger purse than a loss, given the same offer', () => {
    const win = findResult('player');
    const loss = findResult('opponent');
    const baseCareer = { ...initialCareerState, player, ranking: 10, purse: 0 };

    const winPurse = applyAftermath(baseCareer, player, win, offer, balance, mulberry32(1)).purse;
    const lossPurse = applyAftermath(baseCareer, player, loss, offer, balance, mulberry32(1)).purse;
    expect(winPurse).toBeGreaterThan(lossPurse);
  });

  it('injuries (when rolled) attach to condition.injuries', () => {
    const result = findResult('opponent');
    const baseCareer = { ...initialCareerState, player, ranking: 10 };
    // Force the injury roll: rng.next() < injuryChanceOnLoss on the first call.
    const forcedInjuryRng = mulberry32(1);
    let after = applyAftermath(baseCareer, player, result, offer, balance, forcedInjuryRng);

    // Not every seed rolls an injury — search until one does, then assert shape.
    let found = after.player!.condition.injuries.length > 0;
    for (let seed = 1; !found && seed < 2000; seed++) {
      after = applyAftermath(baseCareer, player, result, offer, balance, mulberry32(seed));
      found = after.player!.condition.injuries.length > 0;
    }
    expect(found).toBe(true);
    const injury = after.player!.condition.injuries[0];
    expect(injury.severity).toBeGreaterThanOrEqual(0);
    expect(injury.weeksRemaining).toBeGreaterThanOrEqual(0);
  });

  it('records the fight summary in fightHistory', () => {
    const result = findResult('player');
    const baseCareer = { ...initialCareerState, player, ranking: 10 };
    const after = applyAftermath(baseCareer, player, result, offer, balance, mulberry32(1));
    expect(after.fightHistory).toHaveLength(1);
    expect(after.fightHistory[0]).toEqual(result.summary);
  });
});

describe('checkRetirement', () => {
  it('is false for a fresh career', () => {
    const career = startCareer(testOrigin, 'p1', 'Fresh Fighter');
    expect(checkRetirement(career, balance)).toBe(false);
  });

  it('triggers once total fights reaches maxCareerFights', () => {
    const career = {
      ...initialCareerState,
      player,
      record: { wins: balance.maxCareerFights, losses: 0, draws: 0, noContests: 0 },
    };
    expect(checkRetirement(career, balance)).toBe(true);
  });

  it('triggers once the player is worn down to or past retirementHealthFloor, not before', () => {
    const healthy: Fighter = {
      ...player,
      condition: { ...player.condition, health: balance.retirementHealthFloor + 1 },
    };
    const wornDown: Fighter = { ...player, condition: { ...player.condition, health: balance.retirementHealthFloor } };
    expect(checkRetirement({ ...initialCareerState, player: healthy }, balance)).toBe(false);
    expect(checkRetirement({ ...initialCareerState, player: wornDown }, balance)).toBe(true);
  });

  it('stays true once already retired, regardless of subsequent state', () => {
    const career = { ...initialCareerState, player, retired: true, record: { wins: 0, losses: 0, draws: 0, noContests: 0 } };
    expect(checkRetirement(career, balance)).toBe(true);
  });
});

describe('startCareer', () => {
  it('builds a fresh, schema-valid career from an Origin', () => {
    const career = startCareer(testOrigin, 'p1', 'Fresh Fighter');
    expect(career.player).not.toBeNull();
    expect(career.player!.name).toBe('Fresh Fighter');
    expect(career.retired).toBe(false);
    expect(career.record).toEqual({ wins: 0, losses: 0, draws: 0, noContests: 0 });
    expect(career.ranking).toBeNull();
    expect(career.origin).toEqual(testOrigin);
  });

  it('applies origin statDeltas on top of the baseline, clamped to 0..100', () => {
    const career = startCareer(testOrigin, 'p1', 'Fresh Fighter');
    for (const [key, delta] of Object.entries(testOrigin.statDeltas)) {
      const attrKey = key as keyof Attributes;
      expect(career.player!.attributes[attrKey]).toBe(50 + (delta ?? 0));
    }
  });
});
