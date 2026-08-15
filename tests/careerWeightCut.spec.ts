import { describe, expect, it } from 'vitest';
import {
  classifyCut,
  initialCutProgress,
  resolveWeightCutWeek,
  type WeightCutBalance,
} from '../src/career/weightcut';
import { resolveCutPenalty } from '../src/engine/weightcut';
import { balance } from '../src/content';

const testBalance: WeightCutBalance = { weightCutGainPerEnergy: 10, cutQualityThreshold: 60 };

describe('resolveWeightCutWeek', () => {
  it('accumulates progress from weightManagement energy spent', () => {
    const afterOneWeek = resolveWeightCutWeek(initialCutProgress, 2, testBalance);
    expect(afterOneWeek).toBe(20);
    const afterTwoWeeks = resolveWeightCutWeek(afterOneWeek, 2, testBalance);
    expect(afterTwoWeeks).toBe(40);
  });

  it('zero energy this week leaves prior progress untouched (no decay)', () => {
    expect(resolveWeightCutWeek(50, 0, testBalance)).toBe(50);
  });

  it('clamps at 100, never over', () => {
    expect(resolveWeightCutWeek(95, 10, testBalance)).toBe(100);
  });

  it('negative energy is treated as zero, never reduces progress', () => {
    expect(resolveWeightCutWeek(50, -5, testBalance)).toBe(50);
  });
});

describe('classifyCut', () => {
  it('classifies as clean once progress reaches the threshold', () => {
    expect(classifyCut(testBalance.cutQualityThreshold, testBalance)).toBe('clean');
    expect(classifyCut(100, testBalance)).toBe('clean');
  });

  it('classifies as botched below the threshold, including a fresh, untouched camp', () => {
    expect(classifyCut(initialCutProgress, testBalance)).toBe('botched');
    expect(classifyCut(testBalance.cutQualityThreshold - 1, testBalance)).toBe('botched');
  });
});

describe('camp-long cut management resolves into the fight-week cutPenalty (Loop 1.6 base case)', () => {
  it('a camp with no weight-management investment produces a botched classification and a measurably worse penalty', () => {
    const neglectedProgress = [0, 0, 0, 0].reduce(
      (progress) => resolveWeightCutWeek(progress, 0, balance),
      initialCutProgress,
    );
    const neglectedCut = classifyCut(neglectedProgress, balance);
    expect(neglectedCut).toBe('botched');
    expect(resolveCutPenalty(neglectedCut, balance)).toBeLessThan(1);
  });

  it('a well-managed camp produces a clean classification and no penalty, given identical starting progress', () => {
    const managedProgress = [2, 2, 2, 2].reduce(
      (progress) => resolveWeightCutWeek(progress, 2, balance),
      initialCutProgress,
    );
    const managedCut = classifyCut(managedProgress, balance);
    expect(managedCut).toBe('clean');
    expect(resolveCutPenalty(managedCut, balance)).toBe(1);
  });

  it('the managed camp resolves into a measurably better penalty than the neglected one', () => {
    const neglectedProgress = [0, 0, 0, 0].reduce(
      (progress) => resolveWeightCutWeek(progress, 0, balance),
      initialCutProgress,
    );
    const managedProgress = [2, 2, 2, 2].reduce(
      (progress) => resolveWeightCutWeek(progress, 2, balance),
      initialCutProgress,
    );

    const neglectedPenalty = resolveCutPenalty(classifyCut(neglectedProgress, balance), balance);
    const managedPenalty = resolveCutPenalty(classifyCut(managedProgress, balance), balance);

    expect(managedPenalty).toBeGreaterThan(neglectedPenalty);
  });
});
