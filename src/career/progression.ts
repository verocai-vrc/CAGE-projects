// progression.ts — Loop 3.4: aftermath (DESIGN.md §8.1, §8.4). Turns a
// completed simulateFight call into career consequences: purse paid, hype
// adjusted, ranking updated, a basic injury roll applied, and the fight
// recorded to history. Full injury/life decay across camp weeks is M4
// (Loop 4.1) — this loop only applies a one-shot post-fight injury check.

import type { RNG } from '../engine';
import type { Fighter, FightRecord, FightResult, Injury, Origin } from '../engine/types';
import { fighterFromOrigin } from './origin';
import { nicknameFor } from './identity';
import { careerRng } from './seed';
import { generateCoach } from './coach';
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

// 'nose' is a real, reachable body part specifically so ui/portrait/wear.ts
// has an injury signal to gate the nose-break layer on (Loop 6.6/DESIGN.md
// §15.4) — every other value here is flavor text, this one is load-bearing.
const INJURY_BODY_PARTS = ['hand', 'foot', 'knee', 'shoulder', 'ribs', 'eye', 'nose'];

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

  // Loop 7.4 (§16.5): the record lives on the fighter now, not on CareerState,
  // so it is written in the same object as the injury rather than alongside it.
  const record: FightRecord = {
    ...player.record,
    wins: player.record.wins + (outcome === 'win' ? 1 : 0),
    losses: player.record.losses + (outcome === 'loss' ? 1 : 0),
    draws: player.record.draws + (outcome === 'draw' ? 1 : 0),
  };

  const injury = rollInjury(outcome, balance, rng);
  const updatedPlayer: Fighter = {
    ...player,
    record,
    condition: injury
      ? { ...player.condition, injuries: [...player.condition.injuries, injury] }
      : player.condition,
  };

  return {
    ...career,
    player: updatedPlayer,
    purse,
    hype,
    ranking,
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
  if (career.player === null) return false;
  const { wins, losses, draws } = career.player.record;
  if (wins + losses + draws >= balance.maxCareerFights) return true;
  if (career.player.condition.health <= balance.retirementHealthFloor) return true;
  return false;
}

// Fresh CareerState from an Origin (Loop 3.5: stub Origin only, real
// wrapper is M4). Pure aside from the id it's handed.
//
// `face` defaults to an empty FaceCode (all-zero, base36 "000000000") rather than
// requiring every existing call site to pick one — parseFaceCode already treats a
// malformed/short string as clamp-to-zero, so this is a real, renderable face
// (bald, clean-shaven, the first skin/head/feature variant), just not a rolled
// one. Loop 6.5's portrait editor and the skip path's own seed are the callers
// that pass a real one.
//
// Loop 7.1 adds `seed` (DESIGN.md §16.2) and collapses the three trailing
// optionals into an options object — three of the eight call sites were already
// passing `undefined, undefined, face` to reach past them, and `seed` is far too
// load-bearing to sit at the end of that queue.
export interface StartCareerOptions {
  nationality?: string;
  weightClass?: string;
  face?: string;
  /**
   * Loop 7.6: omitted means "roll one from the career seed", which is what
   * every caller does today — the ~65% assignment rate applies to the player
   * exactly as it does to an opponent (§16.5), so a daily run gives everyone
   * the same fighter with the same handle. Pass `null` for no nickname, or a
   * string once there is a surface for the player to author one (the chargen
   * names neither the fighter nor the nickname yet; see the note in
   * career/identity.ts).
   */
  nickname?: string | null;
}

export function startCareer(
  origin: Origin,
  seed: string,
  playerId: string,
  playerName: string,
  {
    nationality = 'USA',
    weightClass = 'lightweight',
    face = '000000000',
    nickname,
  }: StartCareerOptions = {},
): CareerState {
  // Its own addressable slot in the career stream (§16.2), so rolling it cannot
  // shift the origin, the gym, or the first opponent.
  const resolvedNickname =
    nickname === undefined ? nicknameFor(careerRng(seed, 'origin', 1), origin.archetype, nationality) : nickname;

  return {
    ...initialCareerState,
    seed,
    player: fighterFromOrigin(origin, playerId, playerName, nationality, weightClass, face, resolvedNickname),
    origin,
    // Loop 7.8 (§16.8): "the mentor gym is where the player starts." This is the
    // first thing that has ever read `origin.mentorGymId`, which the amateur
    // wrapper has been authoring since M4.
    gymId: origin.mentorGymId,
    // An anchor gym, so it re-resolves from the id alone and does not need to be
    // carried on the career (see gym.ts's resolveGym).
    currentGym: null,
    // Loop 7.9 (§16.8): the corner, on its own addressable slot in the career
    // stream (§16.2) so rolling it cannot shift the gym or the first opponent.
    coach: generateCoach(careerRng(seed, 'coach', 0)),
    hype: Math.max(0, Math.min(100, origin.hypeModifier)),
  };
}
