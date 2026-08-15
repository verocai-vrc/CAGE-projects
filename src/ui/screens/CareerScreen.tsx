// CareerScreen.tsx — Loop 3.5: the career hub that closes the M3 loop
// (camp -> fight -> aftermath -> retire). Fight resolution here is
// simulate-and-report, not the interactive round-by-round playback
// (FightScreen, M2) — wiring the two together is a later concern; this
// screen only has to prove the shell (numbers, not presentation) plays
// start to finish with a stub Origin.

import { useState } from 'preact/hooks';
import { mulberry32, seedFromString, simulateFight } from '../../engine';
import type { Fighter } from '../../engine/types';
import { archetypes, balance, namePools } from '../../content';
import { generateOpponent, offerQuality } from '../../career/matchmaking';
import { applyAftermath, checkRetirement, startCareer } from '../../career/progression';
import { stubOrigin } from '../../career/origin';
import { useCageStore } from '../../state/store';

export function CareerScreen() {
  const career = useCageStore((s) => s.career);
  const setCareer = useCageStore((s) => s.setCareer);
  const [lastFight, setLastFight] = useState<string | null>(null);

  function begin() {
    setCareer(startCareer(stubOrigin, 'player-1', 'Your Fighter'));
    setLastFight(null);
  }

  function findFightAndResolve() {
    if (!career.player) return;
    const rng = mulberry32(seedFromString(`${career.player.id}-${career.fightHistory.length}-${Date.now()}`));
    const opponent: Fighter = generateOpponent(archetypes, namePools, rng, {
      weightClass: career.player.weightClass,
      idPrefix: 'opp',
    });
    const offer = offerQuality(career.ranking, career.hype, balance);
    const result = simulateFight(career.player, opponent, {}, rng);
    const after = applyAftermath(career, career.player, result, offer, balance, rng);
    const retired = checkRetirement(after, balance);

    setCareer({ ...after, retired });
    const outcome =
      result.winnerId === career.player.id ? 'won' : result.winnerId === opponent.id ? 'lost' : 'drew';
    setLastFight(`You ${outcome} vs ${opponent.name} by ${result.method}.`);
  }

  if (!career.player) {
    return (
      <div id="career-screen" style={{ padding: '1rem' }}>
        <h2>CAGE</h2>
        <p>No active career.</p>
        <button type="button" onClick={begin}>
          Start career
        </button>
      </div>
    );
  }

  const totalFights = career.record.wins + career.record.losses + career.record.draws;

  return (
    <div id="career-screen" style={{ maxWidth: '28rem', padding: '1rem' }}>
      <h2>{career.player.name}</h2>
      <p>
        Week {career.week} · Record {career.record.wins}-{career.record.losses}-{career.record.draws} · Ranking{' '}
        {career.ranking === null ? 'Unranked' : `#${career.ranking}`}
      </p>
      <p>
        Purse ${career.purse.toLocaleString('en-US')} · Hype {Math.round(career.hype)}
      </p>

      {career.retired ? (
        <p>
          <strong>Career over.</strong> <a href="#/card">View career card</a>
        </p>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a href="#/camp">
            <button type="button">Camp</button>
          </a>
          <button type="button" onClick={findFightAndResolve} disabled={totalFights >= balance.maxCareerFights}>
            Find opponent &amp; fight
          </button>
        </div>
      )}

      {lastFight && <p>{lastFight}</p>}
    </div>
  );
}
