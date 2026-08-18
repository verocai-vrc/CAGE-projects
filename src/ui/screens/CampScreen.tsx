// CampScreen.tsx — Loop 3.2 built the camp-week energy allocation screen
// (DESIGN.md §8.1); Loop 6.7 rebuilds it on the component kit. Player splits
// the week's energy budget across training / weight management / rest / life
// via `BudgetSplit` — a single bar, not four independent sliders — then
// resolves the week, updating the career store's player fighter, week,
// energy, life bars, hype, and cut discipline.
//
// The over-budget warning and its state are gone: `BudgetSplit` cannot
// produce a total above the budget by construction (a divider can only move
// within the space its neighbours hold), so there is nothing to warn about.
// `clampAllocation` stays in career/camp.ts as an engine-side guard against
// any other caller, per DESIGN.md §15.8.

import { useState } from 'preact/hooks';
import { resolveCampWeek, type CampAllocation } from '../../career/camp';
import { campFocusMultiplier, resolveLifeWeek, trainingPartnerQuality } from '../../career/life';
import { resolveWeightCutWeek } from '../../career/weightcut';
import { balance } from '../../content';
import { useCageStore } from '../../state/store';
import { BudgetSplit, type BudgetPillar } from '../components/BudgetSplit';
import { Button } from '../components/Button';
import { Meter } from '../components/Meter';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';

const PILLARS: BudgetPillar[] = [
  { id: 'training', label: 'Training' },
  { id: 'weightManagement', label: 'Weight management' },
  { id: 'rest', label: 'Rest' },
  { id: 'life', label: 'Life' },
];

const EMPTY_ALLOCATION: Required<CampAllocation> = {
  training: 0,
  weightManagement: 0,
  rest: 0,
  life: 0,
};

export function CampScreen() {
  const career = useCageStore((s) => s.career);
  const updateCareer = useCageStore((s) => s.updateCareer);

  const [allocation, setAllocation] = useState<Required<CampAllocation>>(EMPTY_ALLOCATION);

  const budget = balance.weeklyEnergyBudget;
  const spent = allocation.training + allocation.weightManagement + allocation.rest + allocation.life;

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
    setAllocation(EMPTY_ALLOCATION);
  }

  if (!career.player) {
    return (
      <Screen register="file" id="camp-screen" title="Camp" plate="gym">
        <Sheet>
          <p>No active fighter — start a career first.</p>
        </Sheet>
      </Screen>
    );
  }

  return (
    <Screen
      register="file"
      id="camp-screen"
      eyebrow={`Week ${career.week + 1} · ${career.player.name}`}
      title="Camp"
      plate="gym"
    >
      <Sheet title="Standing" caption={`Week ${career.week + 1}`}>
        <Meter label="Training partners" value={career.lifeBars.trainingPartners} />
        <Meter label="Personal life" value={career.lifeBars.partner} />
        <Meter label="Sponsors" value={career.lifeBars.sponsors} />
        <Meter label="Hype" value={career.hype} />
        <Meter label="Cut discipline" value={career.weightCutProgress} />
      </Sheet>

      <Sheet title="This week's energy" caption={`${budget} to split`}>
        <BudgetSplit
          budget={budget}
          pillars={PILLARS}
          value={allocation}
          onChange={(next) =>
            setAllocation({
              training: next.training ?? 0,
              weightManagement: next.weightManagement ?? 0,
              rest: next.rest ?? 0,
              life: next.life ?? 0,
            })
          }
        />
        <Button variant="primary" block onClick={resolveWeek} disabled={spent === 0}>
          Resolve week
        </Button>
      </Sheet>
    </Screen>
  );
}
