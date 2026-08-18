// RevealScreen.tsx — Loop 4.4: the payoff DESIGN.md §9.2 calls for. Six
// fiction-only choices finally show numbers: a radar chart, an overall
// rating, the archetype name, and the exploitable weakness called out
// explicitly. Reuses StatRadar unchanged (built generic in Loop 2.2 for
// exactly this). Only the full wrapper path (ChargenWrapper) renders this —
// the §9.3 skip path jumps straight to the pro debut without it.
//
// Loop 6.11 rebuilds it on the component kit: the authored portrait (Loop
// 6.5's face, debut/no-wear — this is the character's first ever look) sits
// beside the radar, and archetype/weakness read as a stamped commission
// license rather than plain paragraphs, matching the paperwork register
// (§15.1) the rest of The File is built on.

import { computePillars } from '../../engine';
import type { Origin } from '../../engine/types';
import { archetypes } from '../../content';
import { attributesFromOrigin } from '../../career/origin';
import { Portrait } from '../portrait/Portrait';
import { StatRadar } from '../components/StatRadar';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Stamp } from '../components/Stamp';
import { Button } from '../components/Button';
import styles from './RevealScreen.module.css';

const PILLAR_AXES = ['Striking', 'Grappling', 'Durability', 'Mind'] as const;

function humanize(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface RevealScreenProps {
  origin: Origin;
  face: string;
  onBeginCareer: () => void;
}

export function RevealScreen({ origin, face, onBeginCareer }: RevealScreenProps) {
  const attributes = attributesFromOrigin(origin);
  const pillars = computePillars(attributes);
  const values = [pillars.striking, pillars.grappling, pillars.durability, pillars.mind];
  const overall = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  const archetypeLabel = archetypes.find((a) => a.id === origin.archetype)?.label ?? origin.archetype;

  return (
    <Screen register="file" id="reveal-screen" eyebrow="Licence issued" title={'Here’s who you are'}>
      <Sheet title="Amateur record" caption={`${origin.amateurRecord.wins}-${origin.amateurRecord.losses}`}>
        <div class={styles.body}>
          <div class={styles.portraitCol}>
            <Portrait face={face} size="8rem" />
          </div>
          <div class={styles.radarCol}>
            <StatRadar axes={[...PILLAR_AXES]} series={[{ name: 'You', corner: 'red', values }]} />
          </div>
        </div>

        <div class={styles.license}>
          <Stamp>{archetypeLabel}</Stamp>
          <span class={styles.overall}>Overall rating {overall}</span>
        </div>

        <p class={styles.weakness}>
          Exploitable weakness:{' '}
          <strong>{origin.weakness ? humanize(origin.weakness) : 'None obvious yet'}</strong>
        </p>
      </Sheet>

      <Button variant="primary" block onClick={onBeginCareer}>
        Begin pro career
      </Button>
    </Screen>
  );
}
