// CornerChoice.tsx — Loop 2.3: the between-round player prompt (DESIGN.md
// §6.7). Presents the fixed TacticId set; the pick is precomputed into the
// next round's FighterPlan entry rather than pausing the engine mid-sim
// (see DESIGN.md front matter — engine call-signature stays pure).

import type { TacticId } from '../../engine/types';

const TACTIC_LABELS: Record<TacticId, string> = {
  pressPace: 'Press the pace',
  shootTakedowns: 'Shoot for takedowns',
  protectLead: 'Protect the lead',
  headhunt: 'Headhunt',
  balanced: 'Stay balanced',
};

const TACTIC_IDS = Object.keys(TACTIC_LABELS) as TacticId[];

interface CornerChoiceProps {
  fighterName: string;
  nextRound: number;
  onChoose: (tactic: TacticId) => void;
}

export function CornerChoice({ fighterName, nextRound, onChoose }: CornerChoiceProps) {
  return (
    <div style={{ border: '1px solid #3a3a3a', borderRadius: '0.4rem', padding: '0.75rem', margin: '0.75rem 0' }}>
      <p>
        Corner call for {fighterName} — round {nextRound}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {TACTIC_IDS.map((id) => (
          <button key={id} type="button" onClick={() => onChoose(id)}>
            {TACTIC_LABELS[id]}
          </button>
        ))}
      </div>
    </div>
  );
}
