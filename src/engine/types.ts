// Core data model (DESIGN.md §4). All numeric attributes are integers on a 0-100 scale.

export interface Attributes {
  power: number; // striking
  technique: number; // striking
  speed: number; // striking
  wrestling: number; // grappling
  groundControl: number; // grappling
  chin: number; // durability
  cardio: number; // durability
  fightIQ: number; // mind
}

// Pillars are DERIVED, never stored:
// striking   = f(power, technique, speed)
// grappling  = f(wrestling, groundControl)
// durability = f(chin, cardio)
// mind       = fightIQ
export type Pillar = 'striking' | 'grappling' | 'durability' | 'mind';

// IDs are content-driven (see /content/*.json), not fixed enums.
export type ArchetypeId = string;
export type WeaknessId = string;
export type TraitId = string;
export type WeightClass = string;

export interface Injury {
  id: string;
  bodyPart: string;
  severity: number; // 0..100
  weeksRemaining: number;
}

export interface Fighter {
  id: string;
  name: string;
  nationality: string; // drives name pool + flavor only
  face: string; // serialized FaceCode (ui/portrait) — flavor only, engine never reads it
  weightClass: WeightClass; // single class in v1 (see §12)
  stance: 'orthodox' | 'southpaw';
  attributes: Attributes;
  archetype: ArchetypeId;
  weakness: WeaknessId | null; // the explicitly-named exploitable hole
  traits: TraitId[]; // unlocked by spiking a stat >= 85 (max 2 equipped)
  condition: {
    health: number; // 0..100 long-term wear, distinct from in-fight health
    injuries: Injury[];
  };
}

// Output of the amateur wrapper. Intentionally small — everything else in the
// amateur phase is disposable flavor text, not state.
export interface Origin {
  statDeltas: Partial<Attributes>; // points allocated per pillar via choices
  archetype: ArchetypeId;
  weakness: WeaknessId | null;
  mentorGymId: string; // becomes the first training-partner NPC in the life layer
  hypeModifier: number; // seeds first purse + main-card odds
  amateurRecord: { wins: number; losses: number }; // narrated, never simulated
}

export type TacticId = 'pressPace' | 'shootTakedowns' | 'protectLead' | 'headhunt' | 'balanced';

// Fight-week cut quality (weightcut.ts resolves this into a cutPenalty).
// Camp-long diet/hydration management that produces this classification is
// M4 (Loop 4.2); for M1-M3 it's supplied directly.
export type CutQuality = 'clean' | 'botched';

// One fighter's plan for a fight: cut quality plus a tactic choice per round
// (keyed by round number, 1-based). Corner decisions (M2, Loop 2.3) update
// the round tactic map mid-playback; simulateFight's signature stays pure by
// having the full plan precomputed before it runs.
export interface FighterPlan {
  cutQuality: CutQuality;
  rounds: Record<number, TacticId>;
}

// Both fighters' plans for a fight, keyed by fighter id.
export type Tactics = Record<string, FighterPlan>;

export type PositionState = 'standing' | 'clinch' | 'topControl' | 'bottomControl';

export type MomentKind = 'scramble' | 'submissionEscape' | 'finishingSequence';

export type MomentOutcome = 'success' | 'fail';

// How well the player executed a moment, -1 (worst) .. +1 (best). The engine
// converts this into a bounded tilt on the moment's roll — see
// balance.momentSkillSwing. 0 is neutral, i.e. exactly what the engine would
// have rolled unaided.
export type MomentPerformance = number;

// Player-moment inputs (M2, Loop 2.4), keyed by the moment's 0-based index
// within the fight.
//
// simulateFight ALWAYS rolls every moment itself, so the sim owns the
// probability (§7) and a fight with no input at all is fully playable — that
// unaided roll is the auto-resolve path. Playing a moment by hand supplies a
// performance here and the fight is re-simulated; the performance TILTS the
// roll by at most momentSkillSwing, it does not dictate the result. A player
// who executes perfectly on a badly-mismatched exchange can still lose.
//
// The engine consumes exactly one rng.next() per moment either way, so
// supplying a performance changes the outcome's odds without shifting the
// random stream — the same replay property corner calls rely on.
export type MomentOverrides = Record<number, MomentPerformance>;

export type FightEvent =
  | { t: 'strike'; by: string; kind: string; landed: boolean; damage: number; round: number }
  | { t: 'takedown'; by: string; success: boolean; round: number }
  | { t: 'position'; state: PositionState; round: number }
  | { t: 'knockdown'; who: string; round: number }
  | { t: 'submissionAttempt'; by: string; escaped: boolean; round: number }
  | { t: 'cornerCall'; round: number; tacticId: string }
  // index: 0-based position of this moment within the fight — the key a
  // MomentOverrides entry uses. played: true when the outcome came from the
  // player rather than the engine's own roll.
  | { t: 'playerMoment'; round: number; index: number; kind: MomentKind; outcome: MomentOutcome; played: boolean }
  | { t: 'roundEnd'; round: number; scoreA: number; scoreB: number; staminaA: number; staminaB: number }
  | { t: 'finish'; who: string; method: string; round: number };

export interface Scorecard {
  judgeId: string;
  roundScores: { a: number; b: number }[];
}

export type FightMethod = 'KO' | 'TKO' | 'SUB' | 'UD' | 'SD' | 'MD' | 'DRAW';

// Compact, persistable fight outcome. The full event log is discarded after
// playback (DESIGN.md Appendix B) — this is what actually gets saved.
export interface FightSummary {
  seed: string;
  fighterAId: string;
  fighterBId: string;
  winnerId: string | null;
  method: FightMethod;
  endRound: number;
  scorecardTotals: { judgeId: string; a: number; b: number }[];
  // Total knockdowns scored BY each side across the whole fight — the signal
  // ui/portrait/wear.ts needs to tell "took a beating but survived" apart
  // from "won clean," which the other summary fields can't distinguish for a
  // fight that goes to a decision (DESIGN.md §15.4/§16 wear is derived only
  // from FightSummary + condition.injuries, never a persisted wear object).
  knockdownsA: number;
  knockdownsB: number;
}

// simulateFight's return value — the engine's public output (DESIGN.md §4.4).
export interface FightResult {
  seed: string;
  winnerId: string | null; // null = draw
  method: FightMethod;
  endRound: number;
  scorecards: Scorecard[]; // one per judge
  events: FightEvent[]; // ordered tick-level log for playback
  summary: FightSummary; // compact, persistable; log is discarded after playback
}
