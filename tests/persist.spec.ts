import { describe, expect, it, vi } from 'vitest';
import { clearCareer, loadCareer, saveCareer, saveCareerImmediate } from '../src/state/persist';
import { initialCareerState, type CareerState } from '../src/state/store';
import type { Fighter } from '../src/engine/types';

const STORAGE_KEY = 'cage:save';

// Minimal in-memory Storage — tests run under Vitest's default `node`
// environment, where `window`/`localStorage` don't exist.
function makeMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

const fixtureFighter: Fighter = {
  id: 'f1',
  name: 'Test Fighter',
  nationality: 'USA',
  weightClass: 'lightweight',
  stance: 'orthodox',
  attributes: {
    power: 60,
    technique: 55,
    speed: 50,
    wrestling: 45,
    groundControl: 40,
    chin: 65,
    cardio: 70,
    fightIQ: 50,
  },
  archetype: 'boxer',
  weakness: null,
  traits: [],
  condition: { health: 100, injuries: [] },
};

const fixtureCareer: CareerState = {
  player: fixtureFighter,
  origin: null,
  week: 4,
  energy: 8,
  purse: 15000,
  hype: 35,
  ranking: 12,
  record: { wins: 3, losses: 1, draws: 0, noContests: 0 },
  lifeBars: { trainingPartners: 80, partner: 60, sponsors: 90 },
  fightHistory: [],
  retired: false,
};

describe('persist', () => {
  it('round-trips a real career state through save/load', () => {
    const storage = makeMemoryStorage();
    saveCareerImmediate(fixtureCareer, storage);
    const loaded = loadCareer(storage);
    expect(loaded).toEqual(fixtureCareer);
  });

  it('returns the initial state when nothing has been saved', () => {
    const storage = makeMemoryStorage();
    expect(loadCareer(storage)).toEqual(initialCareerState);
  });

  it('falls back to a clean restart on corrupted JSON, does not throw', () => {
    const storage = makeMemoryStorage();
    storage.setItem(STORAGE_KEY, '{not valid json::');
    expect(() => loadCareer(storage)).not.toThrow();
    expect(loadCareer(storage)).toEqual(initialCareerState);
  });

  it('falls back to a clean restart when the saved shape fails schema validation', () => {
    const storage = makeMemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, career: { ...fixtureCareer, week: -5 } }),
    );
    expect(() => loadCareer(storage)).not.toThrow();
    expect(loadCareer(storage)).toEqual(initialCareerState);
  });

  it('falls back to a clean restart on an unknown save version', () => {
    const storage = makeMemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, career: fixtureCareer }));
    expect(loadCareer(storage)).toEqual(initialCareerState);
  });

  it('clearCareer removes the save', () => {
    const storage = makeMemoryStorage();
    saveCareerImmediate(fixtureCareer, storage);
    clearCareer(storage);
    expect(loadCareer(storage)).toEqual(initialCareerState);
  });

  it('debounces saveCareer so only the last write within the window lands', () => {
    vi.useFakeTimers();
    try {
      const storage = makeMemoryStorage();
      saveCareer({ ...fixtureCareer, week: 1 }, storage);
      saveCareer({ ...fixtureCareer, week: 2 }, storage);

      expect(storage.getItem(STORAGE_KEY)).toBeNull();
      vi.runAllTimers();

      expect(loadCareer(storage)).toEqual({ ...fixtureCareer, week: 2 });
    } finally {
      vi.useRealTimers();
    }
  });
});
