// CampScreen.tsx — Loop 3.2: spend the week's scarce energy budget across
// training, weight management, and rest (DESIGN.md §8.1). Resolution goes
// through career/camp.ts's pure resolveCampWeek — this screen only collects
// the allocation and commits the result to the store.

import { useMemo, useState } from 'preact/hooks';
import { useCareerStore } from '../../state/store';
import { resolveCampWeek } from '../../career/camp';
import type { CampAllocation, TrainingAllocation } from '../../career/camp';
import type { Attributes } from '../../engine/types';
import { attributeMeta, balance } from '../../content';
import { HudBar } from '../components/HudBar';

function readNumber(e: Event): number {
  const value = Number((e.target as HTMLInputElement).value);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function CampScreen() {
  const career = useCareerStore((s) => s.career);
  const updateCareer = useCareerStore((s) => s.updateCareer);

  const [training, setTraining] = useState<TrainingAllocation>({});
  const [weightManagement, setWeightManagement] = useState(0);
  const [rest, setRest] = useState(0);

  const trainingTotal = useMemo(
    () => Object.values(training).reduce((sum: number, value) => sum + (value ?? 0), 0),
    [training],
  );
  const spent = trainingTotal + weightManagement + rest;
  const remaining = balance.energyPerWeek - spent;

  if (!career) {
    return (
      <div>
        <h1>Camp</h1>
        <p>No active career yet.</p>
      </div>
    );
  }

  const currentFighter = career.fighter;
  const currentWeek = career.week;

  function resolveWeek() {
    const allocation: CampAllocation = { training, weightManagement, rest };
    const { fighter } = resolveCampWeek(currentFighter, allocation, balance.energyPerWeek, 1);
    updateCareer({ fighter, week: currentWeek + 1 });
    setTraining({});
    setWeightManagement(0);
    setRest(0);
  }

  return (
    <div>
      <h1>Camp — week {career.week + 1}</h1>
      <p>{career.fighter.name}</p>

      <HudBar
        label="Energy remaining"
        value={Math.max(0, remaining)}
        max={balance.energyPerWeek}
        tone="stamina"
      />

      <h2>Training</h2>
      {attributeMeta.map((attr) => {
        const key = attr.id as keyof Attributes;
        return (
          <div key={attr.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <label style={{ width: '8rem' }}>{attr.label}</label>
            <input
              type="number"
              min={0}
              value={training[key] ?? 0}
              onInput={(e) => setTraining((prev) => ({ ...prev, [key]: readNumber(e) }))}
            />
            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>current {career.fighter.attributes[key]}</span>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: '1.5rem', margin: '0.75rem 0' }}>
        <label>
          Weight management{' '}
          <input type="number" min={0} value={weightManagement} onInput={(e) => setWeightManagement(readNumber(e))} />
        </label>
        <label>
          Rest <input type="number" min={0} value={rest} onInput={(e) => setRest(readNumber(e))} />
        </label>
      </div>

      <p>
        {remaining < 0
          ? `Over budget by ${-remaining} — allocation will be scaled down when the week resolves.`
          : `${remaining} energy unspent.`}
      </p>

      <button type="button" onClick={resolveWeek}>
        Resolve week
      </button>
    </div>
  );
}
