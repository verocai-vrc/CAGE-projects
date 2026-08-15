// RevealScreen.tsx — Loop 4.4: the payoff DESIGN.md §9.2 calls for. Six
// fiction-only choices finally show numbers: a radar chart, an overall
// rating, the archetype name, and the exploitable weakness called out
// explicitly. Reuses StatRadar unchanged (built generic in Loop 2.2 for
// exactly this). Only the full wrapper path (ChargenWrapper) renders this —
// the §9.3 skip path jumps straight to the pro debut without it.

import { computePillars } from '../../engine';
import type { Origin } from '../../engine/types';
import { archetypes } from '../../content';
import { attributesFromOrigin } from '../../career/origin';
import { StatRadar } from '../components/StatRadar';

const PILLAR_AXES = ['Striking', 'Grappling', 'Durability', 'Mind'] as const;

function humanize(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface RevealScreenProps {
  origin: Origin;
  onBeginCareer: () => void;
}

export function RevealScreen({ origin, onBeginCareer }: RevealScreenProps) {
  const attributes = attributesFromOrigin(origin);
  const pillars = computePillars(attributes);
  const values = [pillars.striking, pillars.grappling, pillars.durability, pillars.mind];
  const overall = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  const archetypeLabel = archetypes.find((a) => a.id === origin.archetype)?.label ?? origin.archetype;

  return (
    <div id="reveal-screen" style={{ maxWidth: '28rem', padding: '1rem' }}>
      <h2>Here&rsquo;s who you are</h2>
      <p style={{ color: '#888' }}>
        Amateur record {origin.amateurRecord.wins}-{origin.amateurRecord.losses}
      </p>

      <div style={{ padding: '0 2rem 1rem' }}>
        <StatRadar axes={[...PILLAR_AXES]} series={[{ name: 'You', color: '#4a9d5f', values }]} />
      </div>

      <p>
        <strong>{archetypeLabel}</strong> &middot; Overall rating {overall}
      </p>
      <p>
        Exploitable weakness: <strong>{origin.weakness ? humanize(origin.weakness) : 'None obvious yet'}</strong>
      </p>

      <button type="button" onClick={onBeginCareer}>
        Begin pro career
      </button>
    </div>
  );
}
