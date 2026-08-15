// CareerScreen.tsx — Loop 3.5: the career hub that closes the M3 loop
// (camp -> fight -> aftermath -> retire). Fight resolution here is
// simulate-and-report, not the interactive round-by-round playback
// (FightScreen, M2) — wiring the two together is a later concern. Loop 4.4
// replaced the Loop 3.5 stub Origin with the real §9.3 skip path: an
// RNG-rolled Origin through the same buildOriginFromChoices fold the
// amateur wrapper uses, so this entry point and #/chargen's are identical
// from startCareer's point of view.

import { useState } from 'preact/hooks';
import { mulberry32, seedFromString, simulateFight } from '../../engine';
import type { Fighter, Tactics } from '../../engine/types';
import { amateurMoments, archetypes, balance, lifeEvents, namePools } from '../../content';
import { generateOpponent, offerQuality } from '../../career/matchmaking';
import { applyAftermath, checkRetirement, startCareer } from '../../career/progression';
import { rollRandomOrigin } from '../../career/origin';
import { buildDailySetup } from '../../career/daily';
import { sponsorPurseMultiplier } from '../../career/life';
import { classifyCut, initialCutProgress } from '../../career/weightcut';
import { useCageStore } from '../../state/store';
import { Screen } from '../components/Screen';

// Local calendar date (not UTC) so "today" matches the player's own clock —
// DESIGN.md §11's daily challenge is meant to change at midnight for them,
// not at UTC midnight.
function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function CareerScreen() {
  const career = useCageStore((s) => s.career);
  const setCareer = useCageStore((s) => s.setCareer);
  const [lastFight, setLastFight] = useState<string | null>(null);

  function skipToRandomProspect() {
    const rng = mulberry32(seedFromString(`skip-${Date.now()}`));
    const origin = rollRandomOrigin(amateurMoments, rng);
    setCareer(startCareer(origin, 'player-1', 'Your Fighter'));
    setLastFight(null);
  }

  // DESIGN.md §8.5/§11: everyone who plays today's prospect gets the same
  // origin (and, once camp draws from the deck, the same event order) —
  // buildDailySetup derives both from today's date string alone.
  function startTodaysProspect() {
    const { origin } = buildDailySetup(todayDateString(), amateurMoments, lifeEvents);
    setCareer(startCareer(origin, 'player-1', 'Your Fighter'));
    setLastFight(null);
  }

  function findFightAndResolve() {
    if (!career.player) return;
    const rng = mulberry32(seedFromString(`${career.player.id}-${career.fightHistory.length}-${Date.now()}`));
    const opponent: Fighter = generateOpponent(archetypes, namePools, rng, {
      weightClass: career.player.weightClass,
      idPrefix: 'opp',
    });
    const offer = offerQuality(career.ranking, career.hype, balance, sponsorPurseMultiplier(career.lifeBars));
    const cutQuality = classifyCut(career.weightCutProgress, balance);
    const tactics: Tactics = { [career.player.id]: { cutQuality, rounds: {} } };
    const result = simulateFight(career.player, opponent, tactics, rng);
    const after = applyAftermath(career, career.player, result, offer, balance, rng);
    const retired = checkRetirement(after, balance);

    // The cut is a single-use camp-long resource — consumed on fight night,
    // discipline has to be rebuilt from scratch for the next one.
    setCareer({ ...after, retired, weightCutProgress: initialCutProgress });
    const outcome =
      result.winnerId === career.player.id ? 'won' : result.winnerId === opponent.id ? 'lost' : 'drew';
    setLastFight(`You ${outcome} vs ${opponent.name} by ${result.method} (${cutQuality} cut).`);
  }

  if (!career.player) {
    return (
      <Screen register="file" id="career-screen" title="CAGE">
        <p>No active career.</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a href="#/chargen">
            <button type="button">Create your fighter</button>
          </a>
          <button type="button" onClick={skipToRandomProspect}>
            Skip: random prospect
          </button>
          <button type="button" onClick={startTodaysProspect}>
            Today's prospect
          </button>
        </div>
      </Screen>
    );
  }

  const totalFights = career.record.wins + career.record.losses + career.record.draws;

  return (
    <Screen register="file" id="career-screen" eyebrow="Career file" title={career.player.name}>
      <p>
        Week {career.week} · Record {career.record.wins}-{career.record.losses}-{career.record.draws} · Ranking{' '}
        {career.ranking === null ? 'Unranked' : `#${career.ranking}`}
      </p>
      <p>
        Purse ${career.purse.toLocaleString('en-US')} · Hype {Math.round(career.hype)}
      </p>
      <p>
        Cut discipline {Math.round(career.weightCutProgress)}/100 — would go in{' '}
        <strong>{classifyCut(career.weightCutProgress, balance)}</strong>
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
    </Screen>
  );
}
