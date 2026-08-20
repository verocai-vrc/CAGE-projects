// store.ts — the single Zustand store (DESIGN.md §2: "One store, sliced. Do
// not spin up per-screen stores"). M3 (Loop 3.1) introduces the career slice;
// later loops (camp, matchmaking, progression, life) extend this slice rather
// than adding new stores.

import { create } from 'zustand';
import type { Fighter, FightRecord, FightSummary, Origin } from '../engine/types';
import { initialLifeBars, type LifeBars } from '../career/life';
import { initialCutProgress } from '../career/weightcut';
// Type-only: career/gym.ts imports CareerState back from here, and `import
// type` erases at compile time, so the cycle never exists at runtime.
import type { Gym } from '../career/gym';
import type { Coach } from '../career/coach';

/**
 * Loop 7.4 (§16.5): kept as an alias so the UI's existing imports do not churn,
 * but there is now exactly one definition of the shape, on `Fighter`
 * (engine/types.ts). `CareerState.record` is gone — `career.player.record` is
 * the single source. Two copies of a fighter's record is a drift bug waiting
 * for a long career, and §16.5 explicitly discards "keep both and test that
 * they agree" as a description of the bug rather than a fix.
 */
export type CareerRecord = FightRecord;

/** The record of a career that has not started. Also what a debuting player
 *  carries into their first bout. */
export const emptyRecord: FightRecord = { wins: 0, losses: 0, draws: 0, noContests: 0 };

export interface CareerState {
  /** DESIGN.md §16.2 — the one string every career-layer draw derives from.
   *  A daily run's is the date; a normal run's is rolled once at career start
   *  (career/seed.ts). Empty only on `initialCareerState`, which has no career
   *  to be reproducible. */
  seed: string;
  player: Fighter | null;
  origin: Origin | null;
  week: number;
  energy: number;
  purse: number;
  hype: number; // 0..100, feeds matchmaking offer quality (DESIGN.md §8.4)
  ranking: number | null; // null = unranked; 1 = champion
  /** Loop 7.8 (§16.8): where the player trains. Set from `origin.mentorGymId`
   *  at career start — the mentor gym is where the player starts — and changed
   *  by a gym move (Loop 7.9). Empty only on `initialCareerState`. */
  gymId: string;
  /** Loop 7.9 (§16.8): the gym itself, once the player has moved to one that
   *  exists in no content file. Anchor gyms resolve from `gymId` alone, so this
   *  stays null for a career that never moves; `career/gym.ts`'s `resolveGym`
   *  is what reads both and is what camp calls. */
  currentGym: Gym | null;
  /** Loop 7.9 (§16.8): the corner. Rolled at career start from the `coach`
   *  stream, replaced by a gym move — the coach belongs to the room. Null only
   *  on `initialCareerState`. */
  coach: Coach | null;
  lifeBars: LifeBars; // DESIGN.md §8.3 — decays weekly (career/life.ts)
  weightCutProgress: number; // 0..100, DESIGN.md §8.2 — camp-long diet/hydration discipline (career/weightcut.ts)
  fightHistory: FightSummary[]; // summaries only — full event logs are never persisted (DESIGN.md §2)
  retired: boolean;
}

export const initialCareerState: CareerState = {
  seed: '',
  player: null,
  origin: null,
  week: 0,
  energy: 0,
  purse: 0,
  hype: 0,
  ranking: null,
  gymId: '',
  currentGym: null,
  coach: null,
  lifeBars: initialLifeBars,
  weightCutProgress: initialCutProgress,
  fightHistory: [],
  retired: false,
};

export interface CageStore {
  career: CareerState;
  setCareer: (career: CareerState) => void;
  updateCareer: (patch: Partial<CareerState>) => void;
  resetCareer: () => void;
}

export const useCageStore = create<CageStore>((set) => ({
  career: initialCareerState,
  setCareer: (career) => set({ career }),
  updateCareer: (patch) => set((s) => ({ career: { ...s.career, ...patch } })),
  resetCareer: () => set({ career: initialCareerState }),
}));
