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
    face: '000000000',
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
  seed: 'FIXTURESEED',
  player: fixtureFighter,
  origin: null,
  week: 4,
  energy: 8,
  purse: 15000,
  hype: 35,
  ranking: 12,
  record: { wins: 3, losses: 1, draws: 0, noContests: 0 },
  lifeBars: { trainingPartners: 80, partner: 60, sponsors: 90 },
  weightCutProgress: 45,
  fightHistory: [],
  retired: false,
};

describe('persist', () => {
  it('round-trips a real career state through save/load', () => {
    const storage = makeMemoryStorage();
    saveCareerImmediate(fixtureCareer, storage);
    expect(loadCareer(storage)).toEqual({ career: fixtureCareer, status: 'loaded' });
  });

  it('returns the initial state when nothing has been saved', () => {
    const storage = makeMemoryStorage();
    expect(loadCareer(storage)).toEqual({ career: initialCareerState, status: 'empty' });
  });

  it('clearCareer removes the save', () => {
    const storage = makeMemoryStorage();
    saveCareerImmediate(fixtureCareer, storage);
    clearCareer(storage);
    expect(loadCareer(storage)).toEqual({ career: initialCareerState, status: 'empty' });
  });

  it('debounces saveCareer so only the last write within the window lands', () => {
    vi.useFakeTimers();
    try {
      const storage = makeMemoryStorage();
      saveCareer({ ...fixtureCareer, week: 1 }, storage);
      saveCareer({ ...fixtureCareer, week: 2 }, storage);

      expect(storage.getItem(STORAGE_KEY)).toBeNull();
      vi.runAllTimers();

      expect(loadCareer(storage).career).toEqual({ ...fixtureCareer, week: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('round-trips the career seed — §16.2 is worthless if the seed is what gets lost', () => {
    const storage = makeMemoryStorage();
    saveCareerImmediate({ ...fixtureCareer, seed: '2026-08-18' }, storage);
    expect(loadCareer(storage).career.seed).toBe('2026-08-18');
  });
});

// Loop 7.1 (§16.2): 'discarded' is the status the old signature could not
// express — the caller could not tell "no save" from "a save existed and was
// dropped", so the title screen had no way to explain the loss. Every route to
// it is covered here, and each one must still return initialCareerState and
// still never throw.
describe('loadCareer reports why it returned nothing', () => {
  const discardCases: [string, string][] = [
    ['a version-2 envelope (the pre-seed save format)', JSON.stringify({ version: 2, career: fixtureCareer })],
    ['an unknown future version', JSON.stringify({ version: 999, career: fixtureCareer })],
    ['a malformed JSON blob', '{not valid json::'],
    [
      'a schema-invalid career',
      JSON.stringify({ version: 3, career: { ...fixtureCareer, week: -5 } }),
    ],
    ['an envelope with no career at all', JSON.stringify({ version: 3 })],
    ['a JSON primitive where an envelope should be', '42'],
  ];

  it.each(discardCases)('discards %s without throwing', (_label, raw) => {
    const storage = makeMemoryStorage();
    storage.setItem(STORAGE_KEY, raw);

    expect(() => loadCareer(storage)).not.toThrow();
    const result = loadCareer(storage);
    expect(result.status).toBe('discarded');
    expect(result.career).toEqual(initialCareerState);
  });

  it('distinguishes a discarded save from no save at all', () => {
    const empty = makeMemoryStorage();
    const corrupt = makeMemoryStorage();
    corrupt.setItem(STORAGE_KEY, '{not valid json::');

    // Both hand back the same clean state — the difference is only in `status`,
    // which is the entire point of the change.
    expect(loadCareer(empty).career).toEqual(loadCareer(corrupt).career);
    expect(loadCareer(empty).status).toBe('empty');
    expect(loadCareer(corrupt).status).toBe('discarded');
  });

  it('a v2 save specifically — the format shipped before the seed existed', () => {
    // The realistic case: a real player's v2 save has no `seed` field at all, so
    // it would fail schema validation even if the version check let it through.
    // SAVE_VERSION's bump makes the discard intentional rather than incidental.
    const storage = makeMemoryStorage();
    const v2Career: Record<string, unknown> = { ...fixtureCareer };
    delete v2Career.seed;
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, career: v2Career }));

    expect(loadCareer(storage)).toEqual({ career: initialCareerState, status: 'discarded' });
  });
});
