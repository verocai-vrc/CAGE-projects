// narration/beats.ts — Loop 7.11: Stage 1, a fight compressed to its story
// (DESIGN.md §16.6, §16.6a).
//
//   FightResult ──beats.ts──> Beat[] (~19) ──select.ts──> NarrationLine[]
//                 pure, NO RNG            Loop 7.12
//
// §16.6: "85 events is not 85 lines." The measured figure is now 117.6 events
// per bout (see the re-measurement note below), and a line per event is both
// unreadable and unaffordable — it would set line demand at ~118 per bout, which
// no pool covers without repeating inside a single round.
//
// THERE IS NO RNG IN THIS FILE, and there is no `rng` parameter anywhere in its
// signatures. That is a hard contract, not an implementation detail: §16.6 puts
// all narration randomness in Stage 2 on its own seeded stream, because
// FightScreen re-simulates the entire bout on every corner call. If extraction
// drew from a stream, every corner call would re-narrate the already-displayed
// prefix differently.
//
// ---------------------------------------------------------------------------
// §16.6a's required re-measurement, run before this file was written
// ---------------------------------------------------------------------------
//
// The amendment flagged that "the 7-per-round budget and ~21-beat/bout target
// predate this amendment and may need retuning so check-beats don't crowd out
// mandatory beats." Measured over 400 seeded bouts (2,000 for the mandatory
// distribution), with corner tactics and moment overrides supplied:
//
//   events per bout          117.6   (§16.1 measured 84.9, before the 7.2
//                                     damage re-tune and before §6.6a checks)
//   rounds per bout           2.52
//   decisions                43.5%   (§16.1 measured 32%)
//   checkEnd per round        4.36
//   mandatory beats/round     3.60 average
//
//   beats per bout at budget 7 -> 18.8      <- kept
//   beats per bout at budget 8 -> 21.1
//
// TWO CONCLUSIONS, both load-bearing:
//
// 1. The budget of 7 SURVIVES the amendment. It yields 18.8 beats per bout,
//    inside the 18–24 band, and mandatory beats average 3.60 per round — they
//    are nowhere near crowded out, which was the amendment's actual worry. A
//    budget of 8 would hit §16.6's "~21" more exactly, but §16.6 states 7 as the
//    constant and 18.8 is comfortably in band; changing a stated design number
//    to gain 2.3 beats is not worth the divergence.
//
// 2. The round's TWO cornerCall events must collapse into ONE corner beat, and
//    this is not cosmetic. `cornerCall` fires once per fighter, so it is always
//    0 or 2 per round. Counting each as a beat puts mandatory beats at 8 in
//    0.67% of rounds — which would force a choice between §16.6's "mandatory
//    beats always narrate" and its 7-per-round cap. Collapsed, the mandatory
//    maximum across 5,064 rounds is exactly 7 and the two rules hold together.
//    It is also the right narration: §16.7's corner is the player's corner
//    speaking, not both teams talking over each other.
//
// ---------------------------------------------------------------------------
// RESOLVED in Loop 7.13 — the low end of the salience table starved
// ---------------------------------------------------------------------------
//
// The finding this file carried forward: the budget is saturated (92.6% of
// rounds hit the cap), every optional beat is in a real contest, and the bottom
// of §16.6's base table lost it almost always. Candidates vs kept, 400 bouts:
//
//   kind        base   candidates   kept   survives
//   exchange    calc         7,698  2,586       34%
//   takedown      45         1,817  1,014       56%
//   stuffed       35         1,847    201       11%
//   standup       30         1,711     27      1.6%
//   ground        25             ~0      0        0%
//
// §16.6's coverage matrix asks for 10 lines each for `standup` and `ground`, so
// 7.13 would have been writing ~20 lines the player never hears. Three things
// were wrong, and each has its own fix below, in the code:
//
// 1. `ground` HAD NO SOURCE. Its only trigger was a quiet check BOUNDARY inside
//    a ground period, and ground periods almost never span one — measured, the
//    kind fired once in 400 bouts. It now also fires when a ground period ENDS
//    with nothing having landed, which is the same grind seen from the other
//    side. Candidates: 0.0025 -> 2.80 per bout.
//
// 2. NOTHING EXPRESSED DIMINISHING RETURNS. See REPEAT_DECAY below. Exchange
//    out-generates every other optional kind 4:1 and scores highest, so top-N
//    handed it ~75% of the slots by weight of numbers.
//
// 3. `heavy` WAS CALIBRATED ON THE WRONG POPULATION. See the threshold at the
//    flush site.
//
// One base salience moved: `ground` 25 -> 32. §16.6 ranked it last on the
// assumption it is the quietest thing that can happen; measured, this engine's
// ground periods are short and frequent rather than long and rare, and ten
// seconds of top control with nothing landing is the grappler's round being
// won, which is information. 32 sits above `standup` (30 — the beat that ends
// the same stretch, and its direct competitor for that slot) and below
// `stuffed` (35). Nothing else in §16.6's table moved.
//
// Beats per bout after all four changes: 18.61, unchanged to two decimals — the
// budget still fills every slot, it just fills them with a spread. Per bout:
//
//   exchange 4.84 · takedown 2.35 · moment 2.29 · roundEnd 1.95 · stuffed 1.65
//   corner 1.51 · rocked 1.24 · open 1.00 · finish 0.56 · ground 0.45
//   decision 0.43 · standup 0.30 · submission 0.05
//
// Every kind except `submission` now fires at least 0.3 times a bout — six or
// more airings of each pool over a 20-bout career. `submission` is rare because
// submission ATTEMPTS are rare (0.05 per bout in the engine); that is not a
// narration problem, and §16.6 requires its 10 lines regardless.

import type { FightResult } from '../engine/types';
import type { BeatKind } from './types';

/** Which corner an event belongs to, as the slot names see it. */
export type Side = 'a' | 'b';

/**
 * The facts a beat exposes to a line's `when` predicate (§16.6).
 *
 * Deliberately a flat record of primitives: predicates are structured data over
 * named facts (narration/types.ts), and a nested shape would need a path
 * language in the predicate to reach into it.
 */
export type BeatFacts = Record<string, string | number | boolean>;

export interface Beat {
  kind: BeatKind;
  /** 1-based. The synthetic `open` sits in round 1, `decision` in the last. */
  round: number;
  /** 0-based position in the returned array — the selector walks these in
   *  order and consumes exactly one rng.next() per beat. */
  index: number;
  /** §16.6's salience score. Mandatory beats carry one too, for ordering. */
  salience: number;
  facts: BeatFacts;
}

/**
 * §16.6: "Mandatory beats always narrate. Optional beats compete for the
 * remaining slots on a salience score."
 */
export const MANDATORY_KINDS: readonly BeatKind[] = Object.freeze([
  'open', 'corner', 'moment', 'rocked', 'roundEnd', 'finish', 'decision',
]);

/** §16.6's base salience table. `exchange` is scored by formula instead. */
const BASE_SALIENCE: Readonly<Record<BeatKind, number>> = Object.freeze({
  rocked: 90,
  submission: 70,
  moment: 60,
  corner: 50,
  takedown: 45,
  stuffed: 35,
  standup: 30,
  ground: 32,
  // Mandatory kinds that §16.6's table does not score. They never compete for a
  // slot, so these values only order them against each other within a round.
  finish: 100,
  decision: 100,
  open: 100,
  roundEnd: 40,
  exchange: 0, // computed — see exchangeSalience
});

/** §16.6: `exchange: 10 + 4 × totalDamage + 3 × unansweredStreak`. */
function exchangeSalience(totalDamage: number, unansweredStreak: number): number {
  return 10 + 4 * totalDamage + 3 * unansweredStreak;
}

/** §16.6's per-round beat budget, re-measured against check-beats above. */
export const BEAT_BUDGET_PER_ROUND = 7;

/**
 * Diminishing returns on repeating a kind inside one round (§16.6a's authorised
 * re-tune). The k-th optional beat of a kind competes at
 * `salience x REPEAT_DECAY^(k-1)`, ranked within the kind by salience, so the
 * biggest exchange of a round keeps its full score and the fifth one does not.
 *
 * This is the fix for the open finding recorded above. The diagnosis, measured
 * over 400 bouts, is a volume problem rather than a scoring one: exchange
 * generates 19.25 candidates a bout against 4.5 takedowns, 4.6 stuffed shots
 * and 4.3 stand-ups, and 92.6% of rounds sit at the cap. Top-N by salience then
 * hands exchange ~75% of every round's optional slots by weight of numbers, and
 * the bottom of §16.6's base table never gets in — stand-up survived 1.6% of
 * the time and `ground` 0%.
 *
 * The decay is deliberately NOT a change to §16.6's base table or to its
 * exchange formula. Both are well calibrated on their own terms: unbudgeted,
 * the median exchange scores 32 against stand-up's 30, exactly the parity the
 * table implies. What neither expresses is that the fifth exchange of a round
 * is less interesting than the first stand-up — which is the thing a broadcast
 * actually selects on, and the only thing added here.
 *
 * Measured at 0.72 (see the table in the commit for 0.6/0.72/0.85): total beats
 * per bout is unchanged at 18.6 — the budget still fills every slot, it just
 * fills them with a spread rather than a monotone.
 */
export const REPEAT_DECAY = 0.72;

function isMandatory(kind: BeatKind): boolean {
  return MANDATORY_KINDS.includes(kind);
}

/** A run of landed strikes, accumulated until something interrupts it. */
interface StrikeRun {
  ground: boolean;
  round: number;
  damage: number;
  bySide: Record<Side, number>;
  /** Longest consecutive same-side sub-streak — §16.6's "unanswered" signal. */
  bestStreak: number;
  currentSide: Side | null;
  currentStreak: number;
}

function emptyRun(ground: boolean, round: number): StrikeRun {
  return {
    ground, round, damage: 0,
    bySide: { a: 0, b: 0 },
    bestStreak: 0, currentSide: null, currentStreak: 0,
  };
}

/**
 * Extract the beats of a bout.
 *
 * Pure, total, and RNG-free. Two fights with identical `FightResult`s produce
 * identical `Beat[]`s, and — the property corner-call re-simulation depends on —
 * two fights whose logs share a prefix produce beats that agree over that
 * prefix, because nothing here reads ahead.
 */
export function extractBeats(result: FightResult): Beat[] {
  const sideOf = (fighterId: string): Side =>
    fighterId === result.summary.fighterAId ? 'a' : 'b';

  const collected: Omit<Beat, 'index'>[] = [];
  const push = (kind: BeatKind, round: number, facts: BeatFacts, salience?: number) => {
    collected.push({ kind, round, facts, salience: salience ?? BASE_SALIENCE[kind] });
  };

  // §16.6: `open` is synthetic — the log contains no walkout.
  //
  // It carries NO facts, and that is deliberate on two counts. An earlier draft
  // passed `result.method`, which leaked the ending into the first line of the
  // broadcast AND broke the prefix property — two bouts sharing an event prefix
  // would open differently because they ended differently. `endRound` fails the
  // same way. Nothing knowable only at the end may reach this beat, and the
  // slots an open line actually uses ({A}, {B}, {GYM_A}, {N}) resolve from the
  // fighters in Stage 2, never from beat facts.
  push('open', 1, {});

  let run: StrikeRun | null = null;
  // One corner beat per round — see the measurement note at the top of the file.
  let cornerNarratedInRound = -1;
  let onTheGround = false;
  // Is the current stretch of top control still quiet — has nothing landed since
  // it began? The test the `ground` beat depends on. Cleared both by a strike
  // and by emitting, so a ground period yields at most one `ground` beat.
  let groundQuiet = false;
  // Who is on top. The `position` event carries no side, but topControl always
  // follows a successful takedown (measured: 13,354 of each across 3,000
  // bouts), so the last completed takedown names him. `ground` and `standup`
  // both report it as their `side`, which is what lets a line say who is
  // holding whom down instead of "someone is on top of someone".
  let groundSide: Side = 'a';

  /** Close the open strike run, if any, into an `exchange` or `ground` beat. */
  const flushRun = () => {
    if (!run || run.damage === 0 && run.bySide.a + run.bySide.b === 0) {
      run = null;
      return;
    }
    const owner: Side = run.bySide.a >= run.bySide.b ? 'a' : 'b';
    const landed = run.bySide.a + run.bySide.b;
    const facts: BeatFacts = {
      side: owner,
      totalDamage: Number(run.damage.toFixed(3)),
      unansweredStreak: run.bestStreak,
      landed,
      // The sub-conditions §16.6's coverage matrix names for `exchange`:
      // heavy / light / one-sided / answered / ground.
      //
      // The heavy threshold is calibrated against the KEPT population, not the
      // candidate one, and that is the whole subtlety. Salience is damage, so
      // the budget selects hard for damage: at the old threshold of 4, 52% of
      // candidate exchanges were heavy but 96% of the ones that reached the
      // feed were, and §16.6's six required `light` lines fired 0.2 times a
      // bout against heavy's 4.6. At 10 the surviving split is 45/55 and both
      // halves of the pool are live. (Measured, 400 bouts: kept damage p25 7.4,
      // p50 9.6, p75 12.3.)
      heavy: run.damage >= 10,
      oneSided: run.bestStreak >= 4,
      answered: run.bySide.a > 0 && run.bySide.b > 0,
      ground: run.ground,
    };
    // A run of ground strikes is an `exchange` with `ground: true`, NOT a
    // `ground` beat. §16.6's coverage matrix settles this: exchange's
    // sub-floors are "heavy / light / one-sided / answered / GROUND", so ground
    // striking is a flavour of exchange, and the `ground` kind is for control
    // without strikes — someone working from the top, nothing landing.
    //
    // Routing ground strikes to `ground` (base salience 25, the lowest in the
    // table) made them all but unnarratable: measured at 0.01 beats per bout,
    // because 93.8% of rounds sit at the budget cap and a flat 25 loses every
    // contest. §16.1 measures 9.5 ground strikes per bout — that is not a beat
    // the broadcast should be silent about.
    push('exchange', run.round, facts, exchangeSalience(run.damage, run.bestStreak));
    run = null;
  };

  for (const event of result.events) {
    const round = (event as { round: number }).round;

    // Landed strikes accumulate; anything else terminates the run. checkEnd is
    // "anything else", which is exactly §16.6a's one-minute chunking: a run
    // never spans a check boundary.
    if (event.t === 'strike') {
      if (!event.landed) continue; // unreachable today (§16.1), harmless if not
      const ground = event.kind === 'groundStrike';
      if (!run || run.ground !== ground || run.round !== round) {
        flushRun();
        run = emptyRun(ground, round);
      }
      const side = sideOf(event.by);
      run.damage += event.damage;
      run.bySide[side]++;
      if (run.currentSide === side) run.currentStreak++;
      else { run.currentSide = side; run.currentStreak = 1; }
      if (run.currentStreak > run.bestStreak) run.bestStreak = run.currentStreak;
      groundQuiet = false;
      continue;
    }

    flushRun();

    switch (event.t) {
      case 'checkEnd':
        // Not a beat of its own (§16.6a: no new BeatKind). Its role is the run
        // boundary above — the minute-slice that shapes what an exchange is.
        //
        // It is also the first of the two triggers that give `ground` a source:
        // a minute spent on the mat with nothing landing is the grind §16.6's
        // ground lines describe ("works from the top, looking to posture up").
        if (onTheGround && groundQuiet) {
          push('ground', round, { side: groundSide, control: true, quiet: true });
          groundQuiet = false; // consumed — one ground beat per ground period
        }
        break;

      case 'takedown':
        if (event.success) {
          push('takedown', round, { side: sideOf(event.by), completed: true });
          if (!onTheGround) groundQuiet = true;
          onTheGround = true;
          groundSide = sideOf(event.by);
        } else {
          push('stuffed', round, { side: sideOf(event.by), completed: false });
        }
        break;

      case 'position':
        if (event.state === 'topControl') {
          // §16.6: "a position: topControl immediately following a successful
          // takedown is absorbed into the takedown beat rather than narrated
          // twice." Measured, topControl ALWAYS follows a takedown in this
          // engine (13,354 of each across 3,000 bouts), so absorption is
          // unconditional and needs no flag — it is simply never its own beat.
          // What it does do is put us on the mat, which is what the `ground`
          // beat reads.
          if (!onTheGround) groundQuiet = true;
          onTheGround = true;
        } else if (event.state === 'standing') {
          // The second `ground` trigger, and the one that carries it: a ground
          // period that ENDS without a strike landing was a grind, not a
          // scramble. It comes before the stand-up because that is the order it
          // happened in — he held him down, then the other man got up.
          if (onTheGround && groundQuiet) {
            push('ground', round, { side: groundSide, control: true, quiet: true });
          }
          // Only a beat when it means someone got back up. `side` is the man who
          // HAD top control, so `{Y}` is the one climbing back to his feet.
          if (onTheGround) push('standup', round, { side: groundSide, fromGround: true });
          onTheGround = false;
          groundQuiet = false;
        }
        break;

      case 'knockdown':
        push('rocked', round, { side: sideOf(event.who) });
        break;

      case 'submissionAttempt':
        push('submission', round, {
          side: sideOf(event.by),
          outcome: event.escaped ? 'escaped' : 'locked',
        });
        break;

      case 'playerMoment':
        push('moment', round, {
          momentKind: event.kind,
          outcome: event.outcome,
          played: event.played,
        });
        break;

      case 'cornerCall':
        if (cornerNarratedInRound !== round) {
          cornerNarratedInRound = round;
          push('corner', round, { tacticId: event.tacticId });
        }
        break;

      case 'roundEnd': {
        // A round that ends with him still held down and nothing landing is the
        // same grind; the horn closes the period instead of a stand-up.
        if (onTheGround && groundQuiet) {
          push('ground', round, { side: groundSide, control: true, quiet: true });
        }
        const leader: Side | 'even' =
          event.scoreA > event.scoreB ? 'a' : event.scoreB > event.scoreA ? 'b' : 'even';
        const lowestStamina = Math.min(event.staminaA, event.staminaB);
        push('roundEnd', round, {
          round,
          leader,
          scoreA: event.scoreA,
          scoreB: event.scoreB,
          // The sub-conditions §16.6's matrix names: plain / fatigue /
          // lead-or-comeback / scorecard.
          fatigue: lowestStamina <= 40,
          decisive: Math.abs(event.scoreA - event.scoreB) >= 2,
        });
        onTheGround = false;
        groundQuiet = false;
        break;
      }

      case 'finish':
        push('finish', round, {
          side: sideOf(event.who),
          method: event.method,
        });
        break;
    }
  }
  flushRun();

  // §16.6/§16.1: 43.5% of bouts go the distance and emit no terminal event —
  // the verdict lives only on FightResult.method, so `decision` is synthesised.
  const wentToDecision = !result.events.some((event) => event.t === 'finish');
  if (wentToDecision) {
    push('decision', result.endRound, {
      verdict: result.method,
      draw: result.winnerId === null,
    });
  }

  return applyBudget(collected);
}

/**
 * The two synthetic beats that bracket the bout rather than belonging to a round.
 *
 * `open` is the walkout and `decision` is the announcement: neither is part of
 * any round's minute-by-minute action, so neither competes for a round's slots.
 * This is not budget-dodging — it is what makes §16.6's two stated numbers
 * consistent with each other. Measured: 93.8% of rounds sit AT the cap of 7, so
 * with 2.52 rounds per bout the arithmetic ceiling on beats per bout is
 * 7 x 2.52 ~= 17.6 if the walkout eats a slot in round 1. That undershoots
 * §16.6's own 18-24 target no matter how extraction is written. Scoped out, the
 * mean lands at ~19 and both numbers hold.
 */
const BOUT_LEVEL_KINDS: readonly BeatKind[] = Object.freeze(['open', 'decision']);

/**
 * §16.6's per-round budget.
 *
 * Mandatory beats always survive. Optional beats compete for whatever is left
 * on salience, and the survivors are returned to chronological order — a feed
 * that played the biggest exchange first and the walkout third would not be a
 * broadcast.
 *
 * The measurement at the top of this file is what makes the two rules
 * compatible: with the corner collapse, mandatory beats never exceed 7 in a
 * round, so "mandatory always narrates" never has to breach the cap.
 */
function applyBudget(beats: Omit<Beat, 'index'>[]): Beat[] {
  const byRound = new Map<number, Omit<Beat, 'index'>[]>();
  for (const beat of beats) {
    // The walkout and the announcement bracket the bout; they are kept
    // unconditionally and never counted against a round.
    if (BOUT_LEVEL_KINDS.includes(beat.kind)) continue;
    const bucket = byRound.get(beat.round);
    if (bucket) bucket.push(beat);
    else byRound.set(beat.round, [beat]);
  }

  const kept = new Set<Omit<Beat, 'index'>>();
  for (const bucket of byRound.values()) {
    const mandatory = bucket.filter((beat) => isMandatory(beat.kind));
    for (const beat of mandatory) kept.add(beat);

    const slots = BEAT_BUDGET_PER_ROUND - mandatory.length;
    if (slots <= 0) continue;

    // Rank within each kind first, so the decay can be applied by position.
    // `salience` itself is never touched: it is §16.6's stated score and the
    // prefix-property test compares it, so the decay lives here as a ranking
    // adjustment and nowhere else.
    const seenOfKind = new Map<BeatKind, number>();
    const optional = bucket
      .filter((beat) => !isMandatory(beat.kind))
      // Sort by salience, then by original order — a stable tie-break, so the
      // result cannot depend on the sort implementation.
      .map((beat, order) => ({ beat, order }))
      .sort((x, y) => y.beat.salience - x.beat.salience || x.order - y.order)
      .map(({ beat, order }) => {
        const repeat = seenOfKind.get(beat.kind) ?? 0;
        seenOfKind.set(beat.kind, repeat + 1);
        return { beat, order, score: beat.salience * REPEAT_DECAY ** repeat };
      })
      .sort((x, y) => y.score - x.score || x.order - y.order)
      .slice(0, slots);
    for (const { beat } of optional) kept.add(beat);
  }

  return beats
    .filter((beat) => BOUT_LEVEL_KINDS.includes(beat.kind) || kept.has(beat))
    .map((beat, index) => ({ ...beat, index }));
}
