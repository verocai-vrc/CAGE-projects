// store.ts — the single Zustand store (DESIGN.md §2: "One store, sliced. Do
// not spin up per-screen stores"). M3 (Loop 3.1) introduces the career slice;
// later loops (camp, matchmaking, progression, life) extend this slice rather
// than adding new stores.

import { create } from 'zustand';
import type { Fighter, FightSummary, Origin } from '../engine/types';

export interface CareerState {
  player: Fighter | null;
  origin: Origin | null;
  week: number;
  energy: number;
  purse: number;
  ranking: number | null; // null = unranked; 1 = champion
  fightHistory: FightSummary[]; // summaries only — full event logs are never persisted (DESIGN.md §2)
}

export const initialCareerState: CareerState = {
  player: null,
  origin: null,
  week: 0,
  energy: 0,
  purse: 0,
  ranking: null,
  fightHistory: [],
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
