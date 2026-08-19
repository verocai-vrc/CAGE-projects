import { describe, expect, it } from 'vitest';
import { computeCareerCardData, formatShareText } from '../src/career/shareCard';
import type { Fighter } from '../src/engine/types';
import type { FightSummary } from '../src/engine/types';
import { initialCareerState, type CareerState } from '../src/state/store';

const player: Fighter = {
  id: 'player-1',
  name: 'Your Fighter',
  nickname: null,
  nationality: 'USA',
  face: '000000000',
  weightClass: 'lightweight',
  stance: 'orthodox',
  attributes: {
    power: 50,
    technique: 50,
    speed: 50,
    wrestling: 50,
    groundControl: 50,
    chin: 50,
    cardio: 50,
    fightIQ: 50,
  },
  archetype: 'striker',
  weakness: null,
  record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
  traits: [],
  condition: { health: 100, injuries: [] },
};

function fightSummary(overrides: Partial<FightSummary>): FightSummary {
  return {
    seed: 'internal-seed-should-not-leak',
    fighterAId: 'player-1',
    fighterBId: 'opp-internal-id-should-not-leak',
    winnerId: 'player-1',
    method: 'UD',
    endRound: 3,
    scorecardTotals: [],
    knockdownsA: 0,
    knockdownsB: 0,
    ...overrides,
  };
}

describe('computeCareerCardData', () => {
  it('returns null when there is no active player', () => {
    expect(computeCareerCardData(initialCareerState)).toBeNull();
  });

  it('computes record, finishes, and grade from fight history for a dominant run', () => {
    const career: CareerState = {
      ...initialCareerState,
      player: { ...player, record: { wins: 5, losses: 0, draws: 0, noContests: 0 } },
      ranking: 1,
      purse: 250000,
      retired: true,
      fightHistory: [
        fightSummary({ winnerId: 'player-1', method: 'KO' }),
        fightSummary({ winnerId: 'player-1', method: 'TKO' }),
        fightSummary({ winnerId: 'player-1', method: 'SUB' }),
        fightSummary({ winnerId: 'player-1', method: 'UD' }),
        fightSummary({ winnerId: 'player-1', method: 'SD' }),
      ],
    };
    const card = computeCareerCardData(career);
    expect(card).not.toBeNull();
    expect(card!.finishes).toBe(3);
    expect(card!.wins).toBe(5);
    expect(card!.grade).toBe('S');
    expect(card!.fightGlyphs).toEqual([
      'win-finish',
      'win-finish',
      'win-finish',
      'win-decision',
      'win-decision',
    ]);
  });

  it('computes a low grade for an early, loss-heavy run', () => {
    const career: CareerState = {
      ...initialCareerState,
      player: { ...player, record: { wins: 1, losses: 3, draws: 0, noContests: 0 } },
      ranking: null,
      purse: 5000,
      retired: true,
      fightHistory: [
        fightSummary({ winnerId: 'player-1', method: 'UD' }),
        fightSummary({ winnerId: 'opp-internal-id-should-not-leak', method: 'KO' }),
        fightSummary({ winnerId: 'opp-internal-id-should-not-leak', method: 'SUB' }),
        fightSummary({ winnerId: 'opp-internal-id-should-not-leak', method: 'UD' }),
      ],
    };
    const card = computeCareerCardData(career);
    expect(card!.grade).toBe('F');
    expect(card!.fightGlyphs).toEqual(['win-decision', 'loss', 'loss', 'loss']);
  });

  it('classifies a draw distinctly from a win or a loss', () => {
    const career: CareerState = {
      ...initialCareerState,
      player: { ...player, record: { wins: 0, losses: 0, draws: 1, noContests: 0 } },
      fightHistory: [fightSummary({ winnerId: null, method: 'DRAW' })],
    };
    expect(computeCareerCardData(career)!.fightGlyphs).toEqual(['draw']);
  });
});

describe('formatShareText', () => {
  it('produces visibly distinct text for a title win vs an early loss', () => {
    const titleRun = computeCareerCardData({
      ...initialCareerState,
      player: { ...player, record: { wins: 8, losses: 0, draws: 0, noContests: 0 } },
      ranking: 1,
      purse: 250000,
      retired: true,
      fightHistory: Array.from({ length: 8 }, () => fightSummary({ winnerId: 'player-1', method: 'KO' })),
    })!;
    const earlyLoss = computeCareerCardData({
      ...initialCareerState,
      player: { ...player, record: { wins: 0, losses: 1, draws: 0, noContests: 0 } },
      ranking: null,
      purse: 3000,
      retired: true,
      fightHistory: [fightSummary({ winnerId: 'opp-internal-id-should-not-leak', method: 'KO' })],
    })!;

    const titleText = formatShareText(titleRun, 'Your Fighter');
    const lossText = formatShareText(earlyLoss, 'Your Fighter');
    expect(titleText).not.toBe(lossText);
    expect(titleText).toContain('Grade S');
    expect(lossText).toContain('Grade F');
  });

  it('never leaks fighter ids, opponent ids, or seeds into the text', () => {
    const card = computeCareerCardData({
      ...initialCareerState,
      player: { ...player, record: { wins: 2, losses: 1, draws: 0, noContests: 0 } },
      ranking: 4,
      purse: 40000,
      fightHistory: [
        fightSummary({ winnerId: 'player-1', method: 'SUB' }),
        fightSummary({ winnerId: 'player-1', method: 'UD' }),
        fightSummary({ winnerId: 'opp-internal-id-should-not-leak', method: 'TKO' }),
      ],
    })!;
    const text = formatShareText(card, 'Your Fighter');
    expect(text).not.toContain('internal-seed-should-not-leak');
    expect(text).not.toContain('opp-internal-id-should-not-leak');
    expect(text).not.toContain('player-1');
    expect(text).not.toContain('{');
  });

  it('renders a placeholder row rather than an empty line when no fights have happened yet', () => {
    const card = computeCareerCardData({ ...initialCareerState, player })!;
    const text = formatShareText(card, 'Your Fighter');
    expect(text.split('\n').at(-1)).toBe('—');
  });
});
