// engine/fight.ts — simulateFight(a, b, tactics, rng): FightResult (§6).
// The engine's public entry point: composes the round-tick loop (striking,
// position, damage/finish, weight-cut modifiers — Loops 1.3-1.6) with
// judging (Loop 1.5) into the full event log + a compact, persistable
// summary. Pure: no Math.random, Date, window, or document; every roll goes
// through the rng instance the caller supplies.
//
// FightResult.seed: the engine only ever receives an already-constructed
// RNG instance (§5 — "it never creates its own"), so it has no way to
// recover the human-readable seed string that produced it. simulateFight
// leaves it as ''; the composition layer that built the RNG (lab, daily
// challenge, career code) is expected to set result.seed afterward if it
// needs to be displayed or shared.

import type { RNG } from './rng';
import { rollLogistic } from './rng';
import type {
  Fighter,
  FightEvent,
  FightMethod,
  FightResult,
  MomentKind,
  MomentOutcome,
  MomentOverrides,
  Scorecard,
  Tactics,
  TacticId,
} from './types';
import {
  computePillars,
  effectiveChin,
  resolvePositionChange,
  resolveStrike,
  rollFinish,
  strikeDamage,
  tickStamina,
  type Pillars,
} from './round';
import { resolveCutPenalty } from './weightcut';
import { decideFight, scoreFight, scorecardTotal, type RoundTape } from './judging';
import { balance, judges } from '../content';

const MAX_HEALTH = 100;

type Side = 'a' | 'b';

function otherSide(side: Side): Side {
  return side === 'a' ? 'b' : 'a';
}

interface FighterRuntime {
  fighter: Fighter;
  pillars: Pillars;
  cutPenalty: number;
  stamina: number;
  health: number;
  rocked: boolean;
}

function emptyTape(round: number): RoundTape {
  return {
    round,
    strikesLandedA: 0,
    strikesLandedB: 0,
    controlTimeA: 0,
    controlTimeB: 0,
    knockdownsA: 0,
    knockdownsB: 0,
    submissionThreatsA: 0,
    submissionThreatsB: 0,
  };
}

function tacticFor(tactics: Tactics, fighterId: string, round: number): TacticId {
  return tactics[fighterId]?.rounds[round] ?? 'balanced';
}

// Real trade-offs per §6.7, applied at the call site so round.ts's roll
// functions stay tactic-agnostic (same pattern as cutPenalty). All deltas
// are additive/multiplicative on existing pillar values — no new roll paths.
//
// Tuning note (all values live in balance.json, never here): stamina
// COMPOUNDS — it multiplies accuracy on every later roll — while a striking
// delta is a one-off edge on a single roll. So a stamina cost that looks
// small per tick outweighs a large pillar bonus across a fight. pressPace is
// deliberately tuned to a round-1 surge that reverses into a round-3 fade
// (§6.3's "fast starter who fades"), NOT a whole-fight volume gain: at
// bonus=20/drain=0.15 the striker fixture lands ~+5% in round 1 and ~-22% in
// round 3 vs balanced. Re-check tests/corner.spec.ts if these are retuned.
//
// 'balanced' and 'shootTakedowns' return all-neutral modifiers, so a fight
// with no tactics map is bit-identical to the pre-tactics engine (verified
// across every archetype pairing) — the M1 lab gates are unaffected.
interface TacticModifiers {
  ownStrikingDelta: number; // added to own striking pillar when attacking
  opponentStrikingDelta: number; // added to own striking pillar when it's used as the opponent's defense
  powerMultiplier: number; // multiplies power for damage + finish rolls
  staminaDrainBonus: number; // extra per-tick stamina drain
}

function tacticModifiersFor(tactic: TacticId): TacticModifiers {
  switch (tactic) {
    case 'pressPace':
      return {
        ownStrikingDelta: balance.pressPaceStrikingBonus,
        opponentStrikingDelta: 0,
        powerMultiplier: 1,
        staminaDrainBonus: balance.pressPaceStaminaDrainBonus,
      };
    case 'protectLead':
      return {
        ownStrikingDelta: -balance.protectLeadStrikingPenalty,
        opponentStrikingDelta: balance.protectLeadDefenseBonus,
        powerMultiplier: 1,
        staminaDrainBonus: 0,
      };
    case 'headhunt':
      return {
        ownStrikingDelta: -balance.headhuntStrikingPenalty,
        opponentStrikingDelta: 0,
        powerMultiplier: balance.headhuntPowerMultiplier,
        staminaDrainBonus: 0,
      };
    case 'shootTakedowns':
    case 'balanced':
    default:
      return { ownStrikingDelta: 0, opponentStrikingDelta: 0, powerMultiplier: 1, staminaDrainBonus: 0 };
  }
}

// --- Player moments (§7) ---
//
// The sim is always authoritative: every moment is resolved here by an
// engine roll (player pillar vs opponent pillar through the shared logistic
// form), which IS the auto-resolve path — skipping a moment and never
// opening the UI give the identical probability model, as Loop 2.4 requires.
// A player who plays the moment by hand supplies an override, and the fight
// is re-simulated.
//
// The engine roll happens even when an override is present, so RNG
// consumption per moment is constant and an override shifts the outcome
// without shifting the stream (mirrors the corner-call replay property).
interface MomentState {
  count: number; // moments triggered so far this fight
}

// Fighter A is the player — moments are offered on their exchanges only.
const PLAYER_SIDE: Side = 'a';

function momentPillar(runtime: FighterRuntime, kind: MomentKind): number {
  switch (kind) {
    case 'scramble':
    case 'submissionEscape':
      return runtime.pillars.grappling;
    case 'finishingSequence':
      return runtime.pillars.striking;
  }
}

// Resolves one moment for `player` against `opponent`. Always consumes
// exactly one rng.next() — the roll happens whether or not the player played
// it, so the sim owns the probability and the random stream stays aligned.
//
// A supplied performance (-1..+1) tilts the contested delta by at most
// balance.momentSkillSwing. It cannot manufacture a win from a hopeless
// exchange, nor throw away a comfortable one: skill moves the odds, the
// engine still decides (§7).
function resolveMoment(
  runtime: Record<Side, FighterRuntime>,
  player: Side,
  kind: MomentKind,
  index: number,
  overrides: MomentOverrides,
  rng: RNG,
): { outcome: MomentOutcome; played: boolean } {
  const opponent = otherSide(player);
  const performance = overrides[index];
  const played = performance !== undefined;

  // Clamped so a caller can't smuggle in an unbounded swing.
  const tilt = played ? Math.max(-1, Math.min(1, performance)) * balance.momentSkillSwing : 0;

  // Stamina-scaled, exactly like every other contested action (§6.3).
  const attack = momentPillar(runtime[player], kind) * (runtime[player].stamina / MAX_HEALTH) + tilt;
  const defense = momentPillar(runtime[opponent], kind) * (runtime[opponent].stamina / MAX_HEALTH);
  const outcome: MomentOutcome = rollLogistic(attack, defense, balance.kMoment, rng) ? 'success' : 'fail';

  return { outcome, played };
}

// Offers a moment at an eligible exchange, capped at maxMomentsPerFight
// ("1-3 times per fight", §6.7). Returns the pillar delta to apply to the
// player's side of this exchange: +bonus on success, -penalty on fail, 0 if
// no moment triggered.
//
// The trigger roll is unconditional once the cap check passes, and
// resolveMoment always rolls too, so for a given (seed, tactics) the set of
// ticks that produce moments is fixed — overriding an outcome never moves a
// later moment to a different tick.
function maybeMoment(
  kind: MomentKind,
  round: number,
  events: FightEvent[],
  runtime: Record<Side, FighterRuntime>,
  rng: RNG,
  moments: MomentState,
  overrides: MomentOverrides,
): number {
  if (moments.count >= balance.maxMomentsPerFight) return 0;
  if (rng.next() >= balance.momentTriggerChance) return 0;

  const index = moments.count;
  moments.count++;

  const { outcome, played } = resolveMoment(runtime, PLAYER_SIDE, kind, index, overrides, rng);
  events.push({ t: 'playerMoment', round, index, kind, outcome, played });

  return outcome === 'success' ? balance.momentSuccessStrikingBonus : -balance.momentFailStrikingPenalty;
}

type TapeCounter = 'strikesLanded' | 'controlTime' | 'knockdowns' | 'submissionThreats';

function bumpTape(tape: RoundTape, side: Side, counter: TapeCounter): void {
  const suffix = side === 'a' ? 'A' : 'B';
  const field = `${counter}${suffix}` as keyof RoundTape;
  (tape[field] as number)++;
}

interface FinishOutcome {
  winner: Side;
  method: FightMethod;
}

// Resolves a landed strike's damage, knockdown, and finish roll against the
// defender (§6.4). Returns a FinishOutcome if the fight ends here.
// powerMultiplier folds in the attacker's active tactic (headhunt raises it —
// §6.7); it's resolved by the caller, keeping this function tactic-agnostic.
function applyStrike(
  runtime: Record<Side, FighterRuntime>,
  attacker: Side,
  defender: Side,
  round: number,
  events: FightEvent[],
  tape: RoundTape,
  rng: RNG,
  kind: 'strike' | 'groundStrike',
  powerMultiplier: number,
  moments: MomentState,
  overrides: MomentOverrides,
): FinishOutcome | null {
  const atk = runtime[attacker];
  const def = runtime[defender];

  bumpTape(tape, attacker, 'strikesLanded');
  const power = atk.fighter.attributes.power * atk.cutPenalty * powerMultiplier;
  const damage = strikeDamage(power, balance.baseStrikeDamage);
  def.health = Math.max(0, def.health - damage);
  events.push({ t: 'strike', by: atk.fighter.id, kind, landed: true, damage, round });

  if (!def.rocked && def.health <= balance.knockdownHealthThreshold) {
    def.rocked = true;
    bumpTape(tape, attacker, 'knockdowns');
    events.push({ t: 'knockdown', who: def.fighter.id, round });
  }

  if (def.health <= 0) {
    events.push({ t: 'finish', who: atk.fighter.id, method: 'TKO', round });
    return { winner: attacker, method: 'TKO' };
  }

  // "Per landed significant strike" (§6.4) — not every landed strike is a
  // fight-threatening power shot; most just add to the tally judges see.
  // Only significant strikes roll for the finish.
  const isSignificant = rng.next() < balance.significantStrikeChance;
  if (isSignificant) {
    // A fight-threatening exchange is the player's finishing-sequence
    // moment (§7) — the one kind allowed to end the fight, and it does so
    // only by swinging this finish roll, never by fiat.
    const finishDelta = maybeMoment(
      'finishingSequence',
      round,
      events,
      runtime,
      rng,
      moments,
      overrides,
    );
    const powerDelta = attacker === PLAYER_SIDE ? finishDelta : -finishDelta;

    const defChin = effectiveChin(def.fighter.attributes.chin, def.health, MAX_HEALTH, def.stamina, def.cutPenalty);
    if (rollFinish(power + powerDelta, defChin, balance.kFinish, rng)) {
      const method: FightMethod = def.health <= balance.tkoHealthThreshold ? 'TKO' : 'KO';
      events.push({ t: 'finish', who: atk.fighter.id, method, round });
      return { winner: attacker, method };
    }
  }
  return null;
}

// momentOverrides is optional: omitted (the lab, the career layer, any
// headless sim) means every moment auto-resolves via the engine's own roll,
// so the fight is fully playable and identical with zero player input (§7).
export function simulateFight(
  a: Fighter,
  b: Fighter,
  tactics: Tactics,
  rng: RNG,
  momentOverrides: MomentOverrides = {},
): FightResult {
  const moments: MomentState = { count: 0 };

  const runtime: Record<Side, FighterRuntime> = {
    a: {
      fighter: a,
      pillars: computePillars(a.attributes),
      cutPenalty: resolveCutPenalty(tactics[a.id]?.cutQuality ?? 'clean', balance),
      stamina: MAX_HEALTH,
      health: MAX_HEALTH,
      rocked: false,
    },
    b: {
      fighter: b,
      pillars: computePillars(b.attributes),
      cutPenalty: resolveCutPenalty(tactics[b.id]?.cutQuality ?? 'clean', balance),
      stamina: MAX_HEALTH,
      health: MAX_HEALTH,
      rocked: false,
    },
  };

  // 'standing', or the Side currently holding top control.
  let position: 'standing' | Side = 'standing';

  const events: FightEvent[] = [];
  const tapes: RoundTape[] = [];

  let outcome: FinishOutcome | null = null;
  let endRound = balance.roundsPerFight;

  roundLoop: for (let round = 1; round <= balance.roundsPerFight; round++) {
    const tape = emptyTape(round);
    endRound = round;

    if (round > 1) {
      for (const side of ['a', 'b'] as Side[]) {
        const plan = tactics[runtime[side].fighter.id];
        if (plan?.rounds[round] !== undefined) {
          events.push({ t: 'cornerCall', round, tacticId: plan.rounds[round] });
        }
      }
    }

    // Tactics are fixed for the whole round, so resolve them once here rather
    // than per tick.
    const tacticA = tacticFor(tactics, a.id, round);
    const tacticB = tacticFor(tactics, b.id, round);
    const modsA = tacticModifiersFor(tacticA);
    const modsB = tacticModifiersFor(tacticB);
    const mods: Record<Side, TacticModifiers> = { a: modsA, b: modsB };
    const tactic: Record<Side, TacticId> = { a: tacticA, b: tacticB };

    for (let tick = 0; tick < balance.ticksPerRound; tick++) {
      runtime.a.stamina = tickStamina(
        runtime.a.stamina,
        a.attributes.cardio * runtime.a.cutPenalty,
        balance,
        modsA.staminaDrainBonus,
      );
      runtime.b.stamina = tickStamina(
        runtime.b.stamina,
        b.attributes.cardio * runtime.b.cutPenalty,
        balance,
        modsB.staminaDrainBonus,
      );

      if (position === 'standing') {
        let attemptedTakedown = false;
        for (const side of ['a', 'b'] as Side[]) {
          if (attemptedTakedown) break;
          const chance =
            tactic[side] === 'shootTakedowns'
              ? balance.takedownAttemptChanceAggressive
              : balance.takedownAttemptChance;
          if (rng.next() < chance) {
            attemptedTakedown = true;
            const opp = otherSide(side);

            // A takedown exchange the player is part of can become a
            // scramble moment (§7). Its outcome modifies this exchange —
            // never an instant win/loss.
            const scrambleDelta = maybeMoment(
              'scramble',
              round,
              events,
              runtime,
              rng,
              moments,
              momentOverrides,
            );

            const success = resolvePositionChange(
              runtime[side].pillars.grappling + (side === PLAYER_SIDE ? scrambleDelta : -scrambleDelta),
              runtime[side].stamina,
              runtime[opp].pillars.grappling,
              runtime[opp].stamina,
              balance.k,
              rng,
            );
            events.push({ t: 'takedown', by: runtime[side].fighter.id, success, round });
            if (success) {
              position = side;
              events.push({ t: 'position', state: 'topControl', round });
            }
          }
        }

        if (position === 'standing') {
          for (const side of ['a', 'b'] as Side[]) {
            const opp = otherSide(side);
            const landed = resolveStrike(
              runtime[side].pillars.striking + mods[side].ownStrikingDelta,
              runtime[side].stamina,
              runtime[opp].pillars.striking + mods[opp].opponentStrikingDelta,
              runtime[opp].stamina,
              balance.k,
              rng,
            );
            if (landed) {
              const result = applyStrike(
                runtime,
                side,
                opp,
                round,
                events,
                tape,
                rng,
                'strike',
                mods[side].powerMultiplier,
                moments,
                momentOverrides,
              );
              if (result) {
                outcome = result;
                tapes.push(tape);
                break roundLoop;
              }
            }
          }
        }
      } else {
        const dominant = position;
        const defender = otherSide(dominant);
        bumpTape(tape, dominant, 'controlTime');

        const escaped = resolvePositionChange(
          runtime[defender].pillars.grappling,
          runtime[defender].stamina,
          runtime[dominant].pillars.grappling,
          runtime[dominant].stamina,
          balance.k,
          rng,
        );

        if (escaped) {
          position = 'standing';
          events.push({ t: 'position', state: 'standing', round });
        } else if (rng.next() < balance.submissionAttemptChance) {
          // Caught in a submission is the player's escape moment (§7). The
          // outcome modifies their defense in this exchange — a failed
          // escape makes the tap likelier, it does not cause it outright.
          const escapeDelta = maybeMoment(
            'submissionEscape',
            round,
            events,
            runtime,
            rng,
            moments,
            momentOverrides,
          );
          const defenderDelta = defender === PLAYER_SIDE ? escapeDelta : -escapeDelta;

          const subAttack = runtime[dominant].pillars.grappling * runtime[dominant].cutPenalty;
          const subDefense =
            (runtime[defender].pillars.grappling + defenderDelta) *
            (runtime[defender].stamina / MAX_HEALTH);
          const success = rollFinish(subAttack, subDefense, balance.kFinish, rng);
          events.push({ t: 'submissionAttempt', by: runtime[dominant].fighter.id, escaped: !success, round });
          bumpTape(tape, dominant, 'submissionThreats');
          if (success) {
            outcome = { winner: dominant, method: 'SUB' };
            events.push({ t: 'finish', who: runtime[dominant].fighter.id, method: 'SUB', round });
            tapes.push(tape);
            break roundLoop;
          }
        } else {
          const landed = resolveStrike(
            runtime[dominant].pillars.striking + mods[dominant].ownStrikingDelta,
            runtime[dominant].stamina,
            (runtime[defender].pillars.striking + mods[defender].opponentStrikingDelta) *
              balance.groundDefenseMultiplier,
            runtime[defender].stamina,
            balance.k,
            rng,
          );
          if (landed) {
            const result = applyStrike(
              runtime,
              dominant,
              defender,
              round,
              events,
              tape,
              rng,
              'groundStrike',
              mods[dominant].powerMultiplier,
              moments,
              momentOverrides,
            );
            if (result) {
              outcome = result;
              tapes.push(tape);
              break roundLoop;
            }
          }
        }
      }
    }

    events.push({
      t: 'roundEnd',
      round,
      scoreA: tape.strikesLandedA,
      scoreB: tape.strikesLandedB,
      staminaA: runtime.a.stamina,
      staminaB: runtime.b.stamina,
    });
    tapes.push(tape);
  }

  const scorecards: Scorecard[] = judges.map((judge) => scoreFight(tapes, judge, balance, rng));

  let winnerId: string | null;
  let method: FightMethod;

  if (outcome) {
    winnerId = runtime[outcome.winner].fighter.id;
    method = outcome.method;
  } else {
    const decision = decideFight(scorecards);
    winnerId = decision.winner ? runtime[decision.winner].fighter.id : null;
    method = decision.method;
  }

  const scorecardTotals = scorecards.map((sc) => {
    const total = scorecardTotal(sc);
    return { judgeId: sc.judgeId, a: total.a, b: total.b };
  });

  return {
    seed: '',
    winnerId,
    method,
    endRound,
    scorecards,
    events,
    summary: {
      seed: '',
      fighterAId: a.id,
      fighterBId: b.id,
      winnerId,
      method,
      endRound,
      scorecardTotals,
    },
  };
}
