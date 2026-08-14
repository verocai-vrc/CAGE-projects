import { describe, expect, it } from 'vitest';
import { initialCareerState, useCageStore } from '../src/state/store';

describe('useCageStore', () => {
  it('starts with the initial career state', () => {
    expect(useCageStore.getState().career).toEqual(initialCareerState);
  });

  it('updateCareer patches only the given fields', () => {
    useCageStore.getState().resetCareer();
    useCageStore.getState().updateCareer({ week: 3, purse: 5000 });
    const { career } = useCageStore.getState();
    expect(career.week).toBe(3);
    expect(career.purse).toBe(5000);
    expect(career.energy).toBe(initialCareerState.energy);
  });

  it('resetCareer restores the initial state', () => {
    useCageStore.getState().updateCareer({ week: 9 });
    useCageStore.getState().resetCareer();
    expect(useCageStore.getState().career).toEqual(initialCareerState);
  });

  it('setCareer replaces the whole slice', () => {
    const replacement = { ...initialCareerState, week: 1, ranking: 7 };
    useCageStore.getState().setCareer(replacement);
    expect(useCageStore.getState().career).toEqual(replacement);
    useCageStore.getState().resetCareer();
  });
});
