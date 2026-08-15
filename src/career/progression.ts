// progression.ts — Loop 3.4: aftermath (DESIGN.md §8.1, §8.4). Turns a
// completed simulateFight call into career consequences: purse paid, hype
// adjusted, ranking updated, a basic injury roll applied, and the fight
// recorded to history. Full injury/life decay across camp weeks is M4
// (Loop 4.1) — this loop only applies a one-shot post-fight injury check.

import type { RNG } from '../engine';
import type { Fighter, FightResult, Injury, Origin } from '../engine/types';
import { fighterFromOrigin } from './origin';
import { initialCareerState, type CareerState } from '../state/store';

export interface ProgressionBalance {
  purseWinBonus: number;
  hypeGainWin: number;
  hypeLossLoss: number;
  rankingMoveOnWin: number;
  rankingMoveOnLoss: number;
  unrankedEntryRanking: number;
  injuryChanceOnWin: number;
  injuryChanceOnLoss: number;
  injurySeverityMin: number;
  injurySeverityMax: number;
  injuryWeeksMin: number;
  injuryWeeksMax: number;
  maxCareerFights: number;
  retirementHealthFloor: number;
}

export type FightOutcome = 'win' | 'loss' | 'draw';

const INJURY_BODY_PARTS = ['hand', 'foot', 'knee', 'shoulder', 'ribs', 'eye'];

function resolveOutcome(playerId: string, result: FightResult): FightOutcome {
  if (result.winnerId === null) return 'draw';
  return result.winnerId === playerId ? 'win' : 'loss';
}

function nextRanking(
  currentRanking: number | null,
  outcome: FightOutcome,
  balance: ProgressionBalance,
): number | null {
  if (outcome === 'draw') return currentRanking;
  if (currentRanking === null) {
    return outcome === 'win' ? balance.unrankedEntryRanking : null;
  }
  if (outcome === 'win') return Math.max(1, currentRanking - balance.rankingMoveOnWin);
  return currentRanking + balance.rankingMoveOnLoss;
}

function nextHype(currentHype: number, outcome: FightOutcome, balance: ProgressionBalance): number {
  const delta = outcome === 'win' ? balance.hypeGainWin : outcome === 'loss' ? -balance.hypeLossLoss : 0;
  return Math.max(0, Math.min(100, currentHype + delta));
}

function rollInjury(outcome: FightOutcome, balance: ProgressionBalance, rng: RNG): Injury | null {
  const chance = outcome === 'loss' ? balance.injuryChanceOnLoss : balance.injuryChanceOnWin;
  if (rng.next() >= chance) return null;

  const bodyPart = INJURY_BODY_PARTS[Math.floor(rng.next() * INJURY_BODY_PARTS.length)];
  const severity = Math.round(
    balance.injurySeverityMin + rng.next() * (balance.injurySeverityMax - balance.injurySeverityMin),
  );
  const weeksRemaining = Math.round(
    balance.injuryWeeksMin + rng.next() * (balance.injuryWeeksMax - balance.injuryWeeksMin),
  );
  const id = `injury-${Math.floor(rng.next() * 1e9).toString(36)}`;

  return { id, bodyPart, severity, weeksRemaining };
}

// Pure: applies one fight's aftermath to career state. `offer` is the
// matchmaking offer (Loop 3.3's offerQuality) that was accepted for this
// bout — purse is always paid; a win pays a bonus on top.
export function applyAftermath(
  career: CareerState,
  player: Fighter,
  result: FightResult,
  offer: { purse: number; hypeReward: number },
  balance: ProgressionBalance,
  rng: RNG,
): CareerState {
  const outcome = resolveOutcome(player.id, result);

  const purse = career.purse + Math.round(offer.purse * (outcome === 'win' ? balance.purseWinBonus : 1));
  const hype = nextHype(career.hype + (outcome === 'win' ? offer.hypeReward : 0), outcome, balance);
  const ranking = nextRanking(career.ranking, outcome, balance);

  const record = {
    ...career.record,
    wins: career.record.wins + (outcome === 'win' ? 1 : 0),
    losses: career.record.losses + (outcome === 'loss' ? 1 : 0),
    draws: career.record.draws + (outcome === 'draw' ? 1 : 0),
  };

  const injury = rollInjury(outcome, balance, rng);
  const updatedPlayer: Fighter = injury
    ? { ...player, condition: { ...player.condition, injuries: [...player.condition.injuries, injury] } }
    : player;

  return {
    ...career,
    player: updatedPlayer,
    purse,
    hype,
    ranking,
    record,
    fightHistory: [...career.fightHistory, result.summary],
  };
}

// A career ends (DESIGN.md §8.5) when either the fighter has racked up
// enough fights to have had a full run, or accumulated wear has broken them
// down past the point the fiction can plausibly continue. Age isn't part of
// the v1 data model (DESIGN.md §4), so fight count stands in for it — a
// bounded 20-40 minute run naturally caps out well under maxCareerFights.
export function checkRetirement(career: CareerState, balance: ProgressionBalance): boolean {
  if (career.retired) return true;
  const totalFights = career.record.wins + career.record.losses + career.record.draws;
  if (totalFights >= balance.maxCareerFights) return true;
  if (career.player !== null && career.player.condition.health <= balance.retirementHealthFloor) return true;
  return false;
}

// Fresh CareerState from an Origin (Loop 3.5: stub Origin only, real
// wrapper is M4). Pure aside from the id it's handed.
export function startCareer(
  origin: Origin,
  playerId: string,
  playerName: string,
  nationality = 'USA',
  weightClass = 'lightweight',
): CareerState {
  return {
    ...initialCareerState,
    player: fighterFromOrigin(origin, playerId, playerName, nationality, weightClass),
    origin,
    hype: Math.max(0, Math.min(100, origin.hypeModifier)),
  };
}
