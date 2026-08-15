// ChargenWrapper.tsx — Loop 4.3: the amateur wrapper (DESIGN.md §9.1). Six
// formative moments, fiction-only choices — this screen never renders a
// statDelta, a point total, or a running attribute number. The payoff
// (radar chart, rating, archetype, weakness reveal) is Loop 4.4's reveal
// screen; this one just walks the montage and, at the end, has a complete
// Origin ready to hand off.

import { useState } from 'preact/hooks';
import type { MomentOption } from '../../state/schema';
import { amateurMoments } from '../../content';
import { buildOriginFromChoices } from '../../career/origin';
import { startCareer } from '../../career/progression';
import { useCageStore } from '../../state/store';

export function ChargenWrapper() {
  const setCareer = useCageStore((s) => s.setCareer);
  const [chosen, setChosen] = useState<MomentOption[]>([]);

  const momentIndex = chosen.length;
  const done = momentIndex >= amateurMoments.length;
  const moment = done ? null : amateurMoments[momentIndex];

  function choose(option: MomentOption) {
    setChosen((prev) => [...prev, option]);
  }

  function beginProCareer() {
    const origin = buildOriginFromChoices(chosen);
    setCareer(startCareer(origin, 'player-1', 'Your Fighter'));
    window.location.hash = '#/';
  }

  return (
    <div id="chargen-wrapper" style={{ maxWidth: '32rem', padding: '1rem' }}>
      <h2>Where it all started</h2>

      {!done && moment && (
        <div>
          <p style={{ marginBottom: '0.75rem', color: '#888' }}>
            Moment {momentIndex + 1} of {amateurMoments.length}
          </p>
          <p style={{ marginBottom: '1rem' }}>{moment.prompt}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {moment.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option)}
                style={{ textAlign: 'left', padding: '0.6rem' }}
              >
                <strong>{option.label}</strong>
                <br />
                <span style={{ fontSize: '0.85rem', color: '#aaa' }}>{option.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {done && (
        <div>
          <p>Your amateur run is over. It's time to go pro.</p>
          <button type="button" onClick={beginProCareer}>
            Begin pro career
          </button>
        </div>
      )}
    </div>
  );
}
