// store.ts — the single Zustand store (DESIGN.md §2: "One store, sliced. Do
// not spin up per-screen stores"). M3 (Loop 3.1) introduces the career slice;
// later loops (camp, matchmaking, progression, life) extend this slice rather
// than adding new stores.

import { create } from 'zustand';
import type { Fighter, FightSummary, Origin } from '../engine/types';
import { initialLifeBars, type LifeBars } from '../career/life';

export interface CareerRecord {
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
}

export interface CareerState {
  player: Fighter | null;
  origin: Origin | null;
  week: number;
  energy: number;
  purse: number;
  hype: number; // 0..100, feeds matchmaking offer quality (DESIGN.md §8.4)
  ranking: number | null; // null = unranked; 1 = champion
  record: CareerRecord;
  lifeBars: LifeBars; // DESIGN.md §8.3 — decays weekly (career/life.ts)
  fightHistory: FightSummary[]; // summaries only — full event logs are never persisted (DESIGN.md §2)
  retired: boolean;
}

export const initialCareerState: CareerState = {
  player: null,
  origin: null,
  week: 0,
  energy: 0,
  purse: 0,
  hype: 0,
  ranking: null,
  record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
  lifeBars: initialLifeBars,
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
