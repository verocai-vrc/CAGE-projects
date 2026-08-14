// store.ts — the single Zustand store (DESIGN.md §2: "One Zustand store. Do
// not spin up per-screen stores."). Sliced by domain — currently just the
// career slice; further slices (e.g. daily-mode) add keys here, not new
// stores.

import { create } from 'zustand';
import type { CareerState } from '../career/types';
import { clearSave, createDebouncedSaver, loadCareer } from './persist';

interface AppState {
  career: CareerState | null;
  setCareer: (career: CareerState) => void;
  updateCareer: (patch: Partial<CareerState>) => void;
  clearCareer: () => void;
}

const scheduleSave = createDebouncedSaver();

export const useCareerStore = create<AppState>((set, get) => ({
  career: loadCareer(),

  setCareer(career) {
    set({ career });
    scheduleSave(career);
  },

  updateCareer(patch) {
    const current = get().career;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ career: next });
    scheduleSave(next);
  },

  clearCareer() {
    set({ career: null });
    clearSave();
  },
}));
