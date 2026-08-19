// session.spec.ts — Loop 7.1: the wiring that was missing.
//
// persist.ts has been complete and tested since Loop 3.1 and called by no
// application code. Every test in persist.spec.ts passed while nothing was ever
// actually saved, because `loadCareer`/`saveCareer` appeared only in that file.
// These tests cover the seam persist.spec.ts could not: that the store is
// hydrated from storage at startup, and that changing it writes back.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSessionForTests, sessionLoadStatus, startSession } from '../src/state/session';
import { saveCareerImmediate } from '../src/state/persist';
import { initialCareerState, useCageStore, type CareerState } from '../src/state/store';
import { startCareer } from '../src/career/progression';
import { rollRandomOrigin } from '../src/career/origin';
import { originRng } from '../src/career/seed';
import { amateurMoments } from '../src/content';

const STORAGE_KEY = 'cage:save';

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

function careerFromSeed(seed: string): CareerState {
  const origin = rollRandomOrigin(amateurMoments, originRng(seed));
  return startCareer(origin, seed, 'player-1', 'Your Fighter');
}

beforeEach(() => {
  resetSessionForTests();
  useCageStore.setState({ career: initialCareerState });
});

describe('startSession hydrates the store from storage', () => {
  it('restores a saved career and reports "loaded"', () => {
    const storage = makeMemoryStorage();
    const saved = { ...careerFromSeed('HYDRATE01'), week: 7, purse: 4200 };
    saveCareerImmediate(saved, storage);

    expect(startSession(storage)).toBe('loaded');
    expect(useCageStore.getState().career).toEqual(saved);
    expect(useCageStore.getState().career.seed).toBe('HYDRATE01');
  });

  it('leaves the store empty and reports "empty" when there is no save', () => {
    expect(startSession(makeMemoryStorage())).toBe('empty');
    expect(useCageStore.getState().career).toEqual(initialCareerState);
  });

  it('reports "discarded" for an unusable save and does not throw', () => {
    const storage = makeMemoryStorage();
    storage.setItem(STORAGE_KEY, '{not valid json::');

    expect(() => startSession(storage)).not.toThrow();
    expect(sessionLoadStatus()).toBe('discarded');
    expect(useCageStore.getState().career).toEqual(initialCareerState);
  });

  it('is idempotent — a second call does not re-hydrate or double-subscribe', () => {
    const storage = makeMemoryStorage();
    saveCareerImmediate(careerFromSeed('ONCE0001'), storage);
    startSession(storage);

    // A hot reload in dev calls this again; if it re-ran, the in-progress store
    // would be clobbered back to the on-disk save.
    useCageStore.getState().updateCareer({ week: 99 });
    expect(startSession(storage)).toBe('loaded');
    expect(useCageStore.getState().career.week).toBe(99);
  });
});

describe('startSession writes store changes back', () => {
  it('persists a career change, debounced', () => {
    vi.useFakeTimers();
    try {
      const storage = makeMemoryStorage();
      startSession(storage);

      useCageStore.getState().setCareer(careerFromSeed('WRITEBK1'));
      // Debounced — nothing has hit storage yet.
      expect(storage.getItem(STORAGE_KEY)).toBeNull();

      vi.runAllTimers();
      const raw = storage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!).career.seed).toBe('WRITEBK1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives the round trip: change, reload, same career', () => {
    vi.useFakeTimers();
    try {
      const storage = makeMemoryStorage();
      startSession(storage);

      const played = { ...careerFromSeed('ROUNDTR1'), week: 12, purse: 9000, hype: 41 };
      useCageStore.getState().setCareer(played);
      vi.runAllTimers();

      // "Reload the page": a fresh session against the same storage.
      resetSessionForTests();
      useCageStore.setState({ career: initialCareerState });
      expect(startSession(storage)).toBe('loaded');

      const restored = useCageStore.getState().career;
      expect(restored.week).toBe(12);
      expect(restored.purse).toBe(9000);
      expect(restored.hype).toBe(41);
      expect(restored.seed).toBe('ROUNDTR1');
      expect(restored.player).toEqual(played.player);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not write when the career reference is unchanged', () => {
    vi.useFakeTimers();
    try {
      const storage = makeMemoryStorage();
      startSession(storage);

      // A store update that leaves `career` identical must not spend a write —
      // §2's memory rules, and the reason the subscription compares references.
      useCageStore.setState({});
      vi.runAllTimers();
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
