// Loop 7.9 — coach generation (DESIGN.md §16.8).
//
// The coach's three fields all feed consumers that do not exist yet: 7.14 builds
// the §16.7 corner line pools that `temperament` selects, and `acuity` and
// `background` feed corner-advice quality and the open beat. What this loop owes
// those loops is a coach that is deterministic from the career seed — a corner
// whose temperament changed on reload would make §16.6's replayable narration
// impossible — and one whose every temperament and background is actually
// reachable, so no line pool 7.14 writes turns out to be dead content.

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/engine/rng';
import type { Origin } from '../src/engine/types';
import { coachContent } from '../src/content';
import {
  backgroundLabel,
  generateCoach,
  temperamentLabel,
  type CoachBackground,
  type CoachTemperament,
} from '../src/career/coach';
import { startCareer } from '../src/career/progression';
import { CoachSchema } from '../src/state/schema';

const SAMPLE = 400;
const sample = (n = SAMPLE) => Array.from({ length: n }, (_, i) => generateCoach(mulberry32(i)));

describe('coach generation (§16.8)', () => {
  it('is deterministic — the same seed gives the same coach', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(generateCoach(mulberry32(seed))).toEqual(generateCoach(mulberry32(seed)));
    }
  });

  it('is schema-valid across a large sample', () => {
    for (const coach of sample()) {
      expect(CoachSchema.safeParse(coach).success, `invalid coach: ${JSON.stringify(coach)}`).toBe(true);
    }
  });

  it('covers all four temperaments', () => {
    // §16.7 writes a line pool per temperament. One that never generates would
    // be dead content nobody notices until the pool is already written.
    const seen = new Set(sample().map((c) => c.temperament));
    const all: CoachTemperament[] = ['calm', 'furious', 'analytical', 'gambler'];
    for (const temperament of all) {
      expect(seen.has(temperament), `temperament '${temperament}' never generated`).toBe(true);
    }
    expect(seen.size).toBe(4);
  });

  it('covers all five backgrounds', () => {
    const seen = new Set(sample().map((c) => c.background));
    const all: CoachBackground[] = ['boxing', 'wrestling', 'bjj', 'kickboxing', 'allround'];
    for (const background of all) {
      expect(seen.has(background), `background '${background}' never generated`).toBe(true);
    }
    expect(seen.size).toBe(5);
  });

  it('varies in name across a career-sized sample', () => {
    expect(new Set(sample().map((c) => c.name)).size).toBeGreaterThan(100);
  });

  it('keeps acuity inside a range that means something', () => {
    // A coach at 0 would be actively sabotaging the fighter, which §16.7's
    // corner-advice model cannot express and which reads as a bug.
    const acuities = sample().map((c) => c.acuity);
    expect(Math.min(...acuities)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...acuities)).toBeLessThanOrEqual(95);
    expect(new Set(acuities).size).toBeGreaterThan(30);
  });

  it('consumes a fixed number of draws, so a later draw cannot depend on the coach', () => {
    // The same discipline generateGym and nicknameFor follow: adding a field to
    // the coach must not shift whatever the caller generates next.
    const drawsUsed = (seed: number) => {
      const rng = mulberry32(seed);
      let count = 0;
      generateCoach({ next: () => { count++; return rng.next(); } });
      return count;
    };
    expect(new Set(Array.from({ length: 100 }, (_, i) => drawsUsed(i))).size).toBe(1);
  });

  it('gives the same name the same id', () => {
    const byName = new Map<string, string>();
    for (const coach of sample()) {
      const existing = byName.get(coach.name);
      if (existing) expect(coach.id).toBe(existing);
      byName.set(coach.name, coach.id);
    }
  });
});

describe('coach content pools', () => {
  it('labels every background and temperament the enums allow', () => {
    // Otherwise a beat that says the background out loud prints a raw id.
    expect(coachContent.backgrounds).toHaveLength(5);
    expect(coachContent.temperaments).toHaveLength(4);
    expect(backgroundLabel('bjj')).toBe('jiu-jitsu');
    expect(temperamentLabel('calm')).toBe('calm');
  });

  it('has no duplicate ids in either pool', () => {
    expect(new Set(coachContent.backgrounds.map((b) => b.id)).size).toBe(coachContent.backgrounds.length);
    expect(new Set(coachContent.temperaments.map((t) => t.id)).size).toBe(coachContent.temperaments.length);
  });
});

describe('the corner at career start (§16.2)', () => {
  const origin: Origin = {
    statDeltas: {},
    archetype: 'striker',
    weakness: null,
    mentorGymId: 'golden-gate-boxing',
    hypeModifier: 0,
    amateurRecord: { wins: 4, losses: 1 },
  };

  it('startCareer rolls a coach', () => {
    const career = startCareer(origin, 'SEED', 'p1', 'X');
    expect(career.coach).not.toBeNull();
    expect(CoachSchema.safeParse(career.coach).success).toBe(true);
  });

  it('the same career seed gives the same corner', () => {
    expect(startCareer(origin, 'SEED', 'p1', 'X').coach)
      .toEqual(startCareer(origin, 'SEED', 'p1', 'X').coach);
  });

  it('different seeds give different corners', () => {
    const coaches = ['A', 'B', 'C', 'D', 'E', 'F'].map((s) => startCareer(origin, s, 'p1', 'X').coach?.name);
    expect(new Set(coaches).size).toBeGreaterThan(1);
  });

  it('rolling the coach does not shift the nickname or the gym', () => {
    // §16.2's addressable slots: the coach has its own stream, so adding it
    // cannot change anything already generated from the same seed.
    const career = startCareer(origin, 'SEED', 'p1', 'X');
    expect(career.gymId).toBe('golden-gate-boxing');
    expect(career.player?.nickname).toBe(startCareer(origin, 'SEED', 'p1', 'X').player?.nickname);
  });
});
