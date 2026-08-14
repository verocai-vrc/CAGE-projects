// CampScreen.tsx — Loop 3.2: the camp-week energy allocation screen (DESIGN.md
// §8.1). Player splits the week's energy budget across training / weight
// management / rest via sliders, then resolves the week — updating the
// career store's player fighter, week, and energy fields. Life-bar decay
// (§8.3, training-partner quality beyond the flat stub) is M4.

import { useState } from 'preact/hooks';
import { resolveCampWeek, type CampAllocation } from '../../career/camp';
import { balance } from '../../content';
import { useCageStore } from '../../state/store';
import { HudBar } from '../components/HudBar';

const PILLAR_LABELS: Record<keyof CampAllocation, string> = {
  training: 'Training',
  weightManagement: 'Weight management',
  rest: 'Rest',
};

const PILLAR_IDS = Object.keys(PILLAR_LABELS) as (keyof CampAllocation)[];

export function CampScreen() {
  const career = useCageStore((s) => s.career);
  const updateCareer = useCageStore((s) => s.updateCareer);

  const [allocation, setAllocation] = useState<CampAllocation>({
    training: 0,
    weightManagement: 0,
    rest: 0,
  });

  const budget = balance.weeklyEnergyBudget;
  const spent = allocation.training + allocation.weightManagement + allocation.rest;
  const remaining = Math.max(0, budget - spent);
  const overBudget = spent > budget;

  function maxForPillar(pillar: keyof CampAllocation): number {
    return budget - (spent - allocation[pillar]);
  }

  function setPillar(pillar: keyof CampAllocation, value: number) {
    setAllocation((prev) => ({ ...prev, [pillar]: Math.max(0, value) }));
  }

  function resolveWeek() {
    if (!career.player) return;
    const result = resolveCampWeek(career.player, allocation, balance);
    updateCareer({
      player: result.fighter,
      week: career.week + 1,
      energy: result.energyRemaining,
    });
    setAllocation({ training: 0, weightManagement: 0, rest: 0 });
  }

  if (!career.player) {
    return <div id="camp-screen">No active fighter — start a career first.</div>;
  }

  return (
    <div id="camp-screen" style={{ maxWidth: '32rem', padding: '1rem' }}>
      <h2>
        Camp — Week {career.week + 1}, {career.player.name}
      </h2>

      <HudBar label="Energy remaining" value={remaining} max={budget} tone="stamina" />
      {overBudget && (
        <p style={{ color: '#d64545', fontSize: '0.8rem' }}>
          Over budget — allocations will be scaled down when the week resolves.
        </p>
      )}

      {PILLAR_IDS.map((pillar) => (
        <div key={pillar} style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span>{PILLAR_LABELS[pillar]}</span>
            <span>{allocation[pillar]}</span>
          </label>
          <input
            type="range"
            min={0}
            max={budget}
            step={1}
            value={allocation[pillar]}
            onInput={(e) => setPillar(pillar, Number((e.target as HTMLInputElement).value))}
            style={{ width: '100%' }}
          />
          <span style={{ fontSize: '0.7rem', color: '#888' }}>
            up to {Math.max(0, maxForPillar(pillar))} more before over budget
          </span>
        </div>
      ))}

      <button type="button" onClick={resolveWeek} disabled={spent === 0}>
        Resolve week
      </button>
    </div>
  );
}
