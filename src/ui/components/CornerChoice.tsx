// CornerChoice.tsx — Loop 2.3: the between-round player prompt (DESIGN.md
// §6.7). Presents the fixed TacticId set; the pick is precomputed into the
// next round's FighterPlan entry rather than pausing the engine mid-sim
// (see DESIGN.md front matter — engine call-signature stays pure).
//
// Loop 6.8: rebuilt on Plate/Button. This prompt is always the player's
// corner — fight.ts's PLAYER_SIDE is fixed to 'a', and FightScreen never
// offers a corner call for the opponent — so it renders inside a
// .corner-red wrapper the same way the fighter panels above it do.

import { Plate } from './Plate';
import { Button } from './Button';
import type { TacticId } from '../../engine/types';
import styles from './CornerChoice.module.css';

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
    <div class="corner-red">
      <Plate eyebrow={`Round ${nextRound}`} title={`Corner call — ${fighterName}`} corner>
        <div class={styles.choices}>
          {TACTIC_IDS.map((id) => (
            <Button key={id} variant="ghost" onClick={() => onChoose(id)}>
              {TACTIC_LABELS[id]}
            </Button>
          ))}
        </div>
      </Plate>
    </div>
  );
}
