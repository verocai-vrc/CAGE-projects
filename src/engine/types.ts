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

// Per-round tactic choice for one fighter, keyed by round number (1-based).
export type FighterTactics = Record<number, TacticId>;

// Both fighters' tactics for a fight, keyed by fighter id.
export type Tactics = Record<string, FighterTactics>;

export type PositionState = 'standing' | 'clinch' | 'topControl' | 'bottomControl';

export type MomentKind = 'scramble' | 'submissionEscape' | 'finishingSequence';

export type FightEvent =
  | { t: 'strike'; by: string; kind: string; landed: boolean; damage: number; round: number }
  | { t: 'takedown'; by: string; success: boolean; round: number }
  | { t: 'position'; state: PositionState; round: number }
  | { t: 'knockdown'; who: string; round: number }
  | { t: 'submissionAttempt'; by: string; escaped: boolean; round: number }
  | { t: 'cornerCall'; round: number; tacticId: string }
  | { t: 'playerMoment'; round: number; kind: MomentKind; outcome: 'success' | 'fail' }
  | { t: 'roundEnd'; round: number; scoreA: number; scoreB: number }
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
