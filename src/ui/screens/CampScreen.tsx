// CampScreen.tsx — Loop 3.2: the camp-week energy allocation screen (DESIGN.md
// §8.1). Player splits the week's energy budget across training / weight
// management / rest / life via sliders, then resolves the week — updating
// the career store's player fighter, week, energy, life bars, hype, and cut
// discipline (Loop 4.1 added the life pillar; Loop 4.2 gives weight
// management a real effect — it accumulates into weightCutProgress, which
// CareerScreen classifies into a CutQuality on fight week).

import { useState } from 'preact/hooks';
import { resolveCampWeek, type CampAllocation } from '../../career/camp';
import { campFocusMultiplier, resolveLifeWeek, trainingPartnerQuality } from '../../career/life';
import { resolveWeightCutWeek } from '../../career/weightcut';
import { balance } from '../../content';
import { useCageStore } from '../../state/store';
import { HudBar } from '../components/HudBar';
import { Screen } from '../components/Screen';

const PILLAR_LABELS: Record<keyof Required<CampAllocation>, string> = {
  training: 'Training',
  weightManagement: 'Weight management',
  rest: 'Rest',
  life: 'Life',
};

const PILLAR_IDS = Object.keys(PILLAR_LABELS) as (keyof Required<CampAllocation>)[];

export function CampScreen() {
  const career = useCageStore((s) => s.career);
  const updateCareer = useCageStore((s) => s.updateCareer);

  const [allocation, setAllocation] = useState<Required<CampAllocation>>({
    training: 0,
    weightManagement: 0,
    rest: 0,
    life: 0,
  });

  const budget = balance.weeklyEnergyBudget;
  const spent = allocation.training + allocation.weightManagement + allocation.rest + allocation.life;
  const remaining = Math.max(0, budget - spent);
  const overBudget = spent > budget;

  function maxForPillar(pillar: keyof Required<CampAllocation>): number {
    return budget - (spent - allocation[pillar]);
  }

  function setPillar(pillar: keyof Required<CampAllocation>, value: number) {
    setAllocation((prev) => ({ ...prev, [pillar]: Math.max(0, value) }));
  }

  function resolveWeek() {
    if (!career.player) return;
    const result = resolveCampWeek(
      career.player,
      allocation,
      balance,
      trainingPartnerQuality(career.lifeBars),
      campFocusMultiplier(career.lifeBars),
    );
    const { bars, hype } = resolveLifeWeek(career.lifeBars, career.hype, result.energySpent.life, balance);
    const weightCutProgress = resolveWeightCutWeek(
      career.weightCutProgress,
      result.energySpent.weightManagement,
      balance,
    );
    updateCareer({
      player: result.fighter,
      week: career.week + 1,
      energy: result.energyRemaining,
      lifeBars: bars,
      hype,
      weightCutProgress,
    });
    setAllocation({ training: 0, weightManagement: 0, rest: 0, life: 0 });
  }

  if (!career.player) {
    return (
      <Screen register="file" id="camp-screen" title="Camp">
        <p>No active fighter — start a career first.</p>
      </Screen>
    );
  }

  return (
    <Screen
      register="file"
      id="camp-screen"
      eyebrow={`Week ${career.week + 1} · ${career.player.name}`}
      title="Camp"
    >
      <HudBar label="Training partners" value={career.lifeBars.trainingPartners} tone="stamina" />
      <HudBar label="Personal life" value={career.lifeBars.partner} tone="stamina" />
      <HudBar label="Sponsors" value={career.lifeBars.sponsors} tone="stamina" />
      <HudBar label="Hype" value={career.hype} tone="stamina" />
      <HudBar label="Cut discipline" value={career.weightCutProgress} tone="stamina" />

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
    </Screen>
  );
}
