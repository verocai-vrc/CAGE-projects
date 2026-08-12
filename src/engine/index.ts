// Public engine API surface (DESIGN.md §3). Code outside /engine should
// import only from here, not reach into individual engine files.

export { simulateFight } from './fight';
export { mulberry32, seedFromString, rollLogistic } from './rng';
export type { RNG } from './rng';

export type {
  Attributes,
  Fighter,
  Injury,
  Origin,
  Pillar,
  Tactics,
  FighterPlan,
  TacticId,
  CutQuality,
  PositionState,
  MomentKind,
  FightEvent,
  FightMethod,
  FightResult,
  FightSummary,
  Scorecard,
  ArchetypeId,
  WeaknessId,
  TraitId,
  WeightClass,
} from './types';
