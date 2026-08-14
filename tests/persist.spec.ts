import { describe, expect, it, vi } from 'vitest';
import type { Fighter, Origin } from '../src/engine/types';
import type { CareerState } from '../src/career/types';
import { clearSave, createDebouncedSaver, loadCareer, saveCareerNow, type StorageLike } from '../src/state/persist';
import { archetypes } from '../src/content';

// In-memory fake — persist.ts only needs getItem/setItem/removeItem, so
// tests never require a DOM/localStorage environment.
function fakeStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function fighterFromArchetype(id: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture: ${archetypeId}`);
  return {
    id,
    name: 'Test Fighter',
    nationality: 'testland',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const origin: Origin = {
  statDeltas: { power: 4, cardio: 6 },
  archetype: 'striker',
  weakness: 'chin',
  mentorGymId: 'gym-1',
  hypeModifier: 1.1,
  amateurRecord: { wins: 3, losses: 1 },
};

function careerFixture(): CareerState {
  return {
    fighter: fighterFromArchetype('player', 'striker'),
    origin,
    week: 4,
    purse: 12500,
    hype: 42,
    ranking: 9,
    record: { wins: 3, losses: 1, draws: 0, noContests: 0 },
    fightHistory: [
      {
        seed: 'seed-1',
        fighterAId: 'player',
        fighterBId: 'opp-1',
        winnerId: 'player',
        method: 'UD',
        endRound: 3,
        scorecardTotals: [{ judgeId: 'judge-1', a: 29, b: 28 }],
      },
    ],
    retired: false,
  };
}

describe('persist: save/load round-trip', () => {
  it('loads back exactly what was saved, with a real career-shaped fixture', () => {
    const storage = fakeStorage();
    const career = careerFixture();

    saveCareerNow(career, storage);
    const loaded = loadCareer(storage);

    expect(loaded).toEqual(career);
  });

  it('returns null when nothing has been saved yet', () => {
    expect(loadCareer(fakeStorage())).toBeNull();
  });
});

describe('persist: fails safe on bad data', () => {
  it('falls back to clean restart on corrupt JSON, without throwing', () => {
    const storage = fakeStorage();
    storage.setItem('cage:save', '{not valid json');

    expect(() => loadCareer(storage)).not.toThrow();
    expect(loadCareer(storage)).toBeNull();
    // Clean restart also clears the bad entry so it doesn't keep tripping.
    expect(storage.getItem('cage:save')).toBeNull();
  });

  it('falls back to clean restart when the payload fails schema validation', () => {
    const storage = fakeStorage();
    storage.setItem('cage:save', JSON.stringify({ version: 1, career: { nonsense: true } }));

    expect(() => loadCareer(storage)).not.toThrow();
    expect(loadCareer(storage)).toBeNull();
  });

  it('falls back to clean restart on a save-version mismatch', () => {
    const storage = fakeStorage();
    storage.setItem('cage:save', JSON.stringify({ version: 999, career: careerFixture() }));

    expect(loadCareer(storage)).toBeNull();
  });

  it('clearSave removes a save outright', () => {
    const storage = fakeStorage();
    saveCareerNow(careerFixture(), storage);

    clearSave(storage);

    expect(loadCareer(storage)).toBeNull();
  });
});

describe('persist: debounced writes', () => {
  it('coalesces rapid updates into a single write after the delay', () => {
    vi.useFakeTimers();
    try {
      const storage = fakeStorage();
      const setItemSpy = vi.spyOn(storage, 'setItem');
      const scheduleSave = createDebouncedSaver(storage, 500);

      scheduleSave({ ...careerFixture(), week: 1 });
      scheduleSave({ ...careerFixture(), week: 2 });
      scheduleSave({ ...careerFixture(), week: 3 });

      expect(setItemSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);

      expect(setItemSpy).toHaveBeenCalledTimes(1);
      expect(loadCareer(storage)?.week).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
